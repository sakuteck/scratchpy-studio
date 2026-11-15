#!/usr/bin/env node
/**
 * 夜モードを選んだ再訪時に、最初の描画から暗い配色になっているか（FOUC の解消）を確認する。
 * アプリ本体の JS を意図的に遅らせ、theme-init.js だけで配色が決まることを見る。
 * 使い方: npm run build && npm run check:theme
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.resolve(__dirname, '..', 'dist');
const darker = rgb => { const m = (rgb.match(/\d+/g) || []).map(Number); return m[0] + m[1] + m[2] < 300; };

(async () => {
  const { chromium } = require('playwright');
  const { createPagesServer } = await import('./lib/pages-server.mjs');
  const site = createPagesServer(DIST);
  const base = `http://127.0.0.1:${await site.listen()}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  try {
    for (const [pathname, edition] of [['/', 'studio-ja'], ['/en/', 'studio-en']]) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      const page = await context.newPage();
      await page.goto(base + pathname, { waitUntil: 'networkidle' });
      await page.selectOption('.color-mode select', 'night');
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 5000 });
      // 本体 JS の読み込みを遅らせ、素の HTML + theme-init.js だけで描画させる
      await page.route('**/assets/index-*.js', async route => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return route.continue();
      });
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 100, null, { timeout: 15000 }).catch(() => {});
      const early = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        palette: document.documentElement.dataset.palette,
        scheme: document.documentElement.style.colorScheme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }));
      assert.equal(early.theme, 'dark', `${edition}: 最初の描画が夜になっていない`);
      assert.equal(early.palette, 'scratch', `${edition}: palette が scratch でない`);
      assert.equal(early.scheme, 'dark', `${edition}: color-scheme が dark でない`);
      assert.ok(darker(early.bodyBg), `${edition}: 背景が白いまま (${early.bodyBg})`);
      console.log(edition, 'early paint:', JSON.stringify(early));
      await context.close();
    }

    // Education は配色固定（夜を選んでいても明るいまま、theme-init.js も読み込まない）
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const education = await context.newPage();
    await education.goto(`${base}/`, { waitUntil: 'networkidle' });
    await education.selectOption('.color-mode select', 'night');
    await education.goto(`${base}/education/`, { waitUntil: 'networkidle' });
    await education.waitForFunction(() => document.body.innerText.trim().length > 200, null, { timeout: 15000 }).catch(() => {});
    const state = await education.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      palette: document.documentElement.dataset.palette,
      scripts: [...document.querySelectorAll('head script[src]')].map(node => node.getAttribute('src')).filter(Boolean),
    }));
    assert.equal(state.theme, 'light', 'Education が夜になっています（配色固定の仕様）');
    assert.equal(state.palette, 'standard', 'Education のパレットが standard でない');
    assert.ok(!state.scripts.some(src => src.endsWith('/theme-init.js')), 'Education が theme-init.js を読み込んでいます');
    console.log('education stays light/standard and skips theme-init.js');
    await browser.close();
  } finally {
    await site.close();
  }
  console.log('THEME-INIT CHECKS PASSED');
})().catch(error => { console.error(error); process.exit(1); });
