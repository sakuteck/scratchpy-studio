#!/usr/bin/env node
/**
 * ビルド済み dist/ をヘッドレスブラウザで開くスモークテスト（CI 用）。
 *
 * 配信は `scripts/lib/pages-server.mjs` が行い、`public/_headers` を
 * **実際のレスポンスに適用する**。これが無いと「CSP でしか壊れない不具合」
 * （実行 iframe が frame-ancestors で拒否される等）をローカルで検出できない。
 *
 * 使い方: npm run build && npm run smoke
 *   SMOKE_REQUIRE_BROWSER=1 … Playwright が無いときスキップせず失敗させる（CI 用）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const DIST = path.resolve(__dirname, '..', 'dist');
const EDITIONS = ['/', '/en/', '/education/', '/education/en/'];

async function main() {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/ がありません。先に npm run build を実行してください。');
  assert.ok(fs.existsSync(path.join(DIST, '_headers')), 'dist/_headers がありません');

  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    if (process.env.SMOKE_REQUIRE_BROWSER === '1') {
      console.error('playwright が見つかりません（SMOKE_REQUIRE_BROWSER=1 なので失敗にします）。npx playwright install chromium を実行してください。');
      process.exit(1);
    }
    console.log('playwright が未インストールのためスモークテストをスキップします（npx playwright install chromium で導入できます）。');
    return;
  }

  const { createPagesServer } = await import('./lib/pages-server.mjs');
  const site = createPagesServer(DIST);
  const port = await site.listen();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  try {
    // 1) 配信ヘッダ: アプリ文書と実行サンドボックスで CSP が混ざっていないこと
    const appResponse = await fetch(`${base}/en/`);
    const appCsp = appResponse.headers.get('content-security-policy') || '';
    assert.ok(appCsp.includes("frame-ancestors 'none'"), `アプリ文書の CSP が不正: ${appCsp}`);
    assert.equal(appResponse.headers.get('x-frame-options'), 'DENY', 'アプリ文書の X-Frame-Options が DENY でない');
    const runnerResponse = await fetch(`${base}/scratch-runner/index.html`);
    const runnerCsp = runnerResponse.headers.get('content-security-policy') || '';
    assert.ok(runnerCsp.includes("frame-ancestors 'self'"), `実行サンドボックスの CSP が不正: ${runnerCsp}`);
    assert.ok(!runnerCsp.includes("frame-ancestors 'none'"), '実行サンドボックスに frame-ancestors none が混ざっています（ヘッダの二重定義）');
    assert.equal(runnerResponse.headers.get('x-frame-options'), 'SAMEORIGIN', '実行サンドボックスの X-Frame-Options が SAMEORIGIN でない');

    // 2) 4 版が白画面にならない・配色のブートストラップが先頭にある
    for (const edition of EDITIONS) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const response = await page.goto(base + edition, { waitUntil: 'networkidle' });
      assert.ok(response && response.ok(), `${edition} が読めません`);
      assert.ok((await page.title()).trim().length > 0, `${edition}: title が空`);
      const text = (await page.locator('body').innerText()).trim();
      assert.ok(text.length > 200, `${edition}: 本文がほぼ空（${text.length} 文字）`);
      const scripts = await page.locator('head script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
      if (edition.startsWith('/education')) {
        // Education は配色固定なので theme-init.js を読まない（読んでも何もしないため）。
        assert.ok(!scripts.some(src => src.endsWith('/theme-init.js')), `${edition}: theme-init.js を読み込んでいる`);
      } else {
        assert.ok(scripts[0]?.endsWith('/theme-init.js'), `${edition}: theme-init.js が最初のスクリプトでない (${scripts.join(', ')})`);
      }
      const fatal = errors.filter(message => !/favicon|Failed to load resource/i.test(message));
      assert.deepEqual(fatal, [], `${edition}: コンソールエラー ${fatal.join(' / ')}`);
      await page.close();
    }

    // 3) カラーモードは 6 択で、選ぶとその場で暗い配色になる
    for (const edition of ['/', '/en/']) {
      const page = await browser.newPage();
      await page.goto(base + edition, { waitUntil: 'networkidle' });
      const select = page.locator('.color-mode select');
      assert.equal(await select.count(), 1, `${edition}: カラーモードの選択欄が無い`);
      assert.equal(await select.locator('option').count(), 6, `${edition}: カラーモードが 6 択でない`);
      await select.selectOption('night');
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 5000 })
        .catch(() => { throw new Error(`${edition}: 夜モードが適用されない`); });
      await page.close();
    }

    // 4) 実行（CSP 適用下で iframe が拒否されないこと）
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const violations = [];
      page.on('console', message => { if (/Content Security Policy|Refused to frame/i.test(message.text())) violations.push(message.text()); });
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      const editor = page.locator('.editor-wrap textarea').first();
      await editor.fill('sprite Cat:\n    x_position_visible: true\n    on flag:\n        move(10)\n');
      await page.getByRole('button', { name: '実行', exact: true }).click();
      // iframe は不透明オリジンなので、親から contentDocument は読めない。
      // frameLocator 経由で本文が現れるまで待つ（固定待機は使わない）。
      const frame = page.frameLocator('iframe[title]');
      let body = '';
      for (let i = 0; i < 60; i++) {
        body = await frame.locator('body').innerText().catch(() => '');
        if (/x position|Cat/.test(body)) break;
        await page.waitForTimeout(500);
      }
      assert.ok(/x position|Cat/.test(body), `実行サンドボックスの本文が想定と違います: ${body.slice(0, 120)}`);
      assert.deepEqual(violations, [], `CSP 違反: ${violations.join(' / ')}`);
      await page.close();
    }

    // 5) 全 4 版で 1 コピーを共有する実行エンジンが配られている
    const engine = await fetch(`${base}/engine/scaffolding.js`);
    assert.ok(engine.ok, '共有エンジン /engine/scaffolding.js が配られていない');
    assert.equal(engine.headers.get('cross-origin-resource-policy'), 'cross-origin', 'エンジンの CORP が cross-origin でない');
    const bytes = (await engine.arrayBuffer()).byteLength;
    assert.ok(bytes > 1_000_000, `共有エンジンが小さすぎます (${bytes} bytes)`);
    console.log(`Smoke test passed (${EDITIONS.length} editions, headers applied, run OK, engine ${(bytes / 1024 / 1024).toFixed(1)} MB).`);
  } finally {
    await browser.close();
    await site.close();
  }
}

main().catch(error => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
