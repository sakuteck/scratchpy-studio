/**
 * 公開 URL を、Cloudflare Pages に上がった**本物の配信物**として検査する。
 *
 * 使い方:
 *   npm run check:deploy -- https://scratchpy-studio.pages.dev
 *   npm run check:deploy -- https://example.com --expect-custom-domain
 *
 * 見ていること:
 *  1. 4 版 × 2 形式（`/x/` と `/x/index.html`）が 200 で返る（診断 V1 の再発防止）
 *  2. `_headers` が**実際のレスポンスに付いている**（CSP と X-Frame-Options）
 *  3. CSP に `frame-ancestors 'none'` が入っている＝埋め込み拒否
 *  4. 共有エンジン（`/engine/scaffolding.js`）と runner が配られている
 *  5. 存在しないパスが 404（SPA フォールバックで 200 を返さない）
 *
 * `wrangler pages deploy` の直後や、独自ドメインを当てた直後に 1 回走らせる。
 * 版の一覧は `scripts/lib/editions.mjs` から導出する（ここに書き写さない）。
 */
import { EDITIONS, documentUrls } from './lib/editions.mjs';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/check-deploy.mjs https://<project>.pages.dev');
  process.exit(2);
}

const requireCsp = (headers) => {
  const csp = headers.get('content-security-policy') || '';
  return csp;
};

const results = [];
const record = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const get = async (path) => {
  try {
    return await fetch(base + path, { redirect: 'manual' });
  } catch (error) {
    // 通信できないときにスタックトレースで落ちない（配信前の確認でも読める形にする）。
    console.error(`FAIL  接続できません: ${base}${path} — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

for (const path of documentUrls()) {
  const res = await get(path);
  const csp = requireCsp(res.headers);
  const xfo = res.headers.get('x-frame-options') || '';
  record(res.status === 200, `200 ${path}`, `status=${res.status}`);
  record(csp.includes("frame-ancestors 'none'"), `CSP frame-ancestors 'none' ${path}`, csp ? '' : '(no CSP header)');
  record(/^DENY$/i.test(xfo), `X-Frame-Options DENY ${path}`, xfo || '(none)');
}

// 共有エンジンと runner（版ごとに複製せず 1 本を配っている）
for (const path of ['/engine/scaffolding.js', '/scratch-runner/index.html']) {
  const res = await get(path);
  record(res.status === 200, `200 ${path}`, `status=${res.status}`);
}
const runner = await get('/scratch-runner/index.html');
record(/SAMEORIGIN/i.test(runner.headers.get('x-frame-options') || '')
  && /frame-ancestors 'self'/.test(runner.headers.get('content-security-policy') || ''),
  'runner keeps its own (self) framing policy');

// SPA フォールバックで 404 が 200 になっていないこと
const missing = await get('/this-path-does-not-exist-scratchpy');
record(missing.status === 404, 'unknown path returns 404', `status=${missing.status}`);

// 4 版ぶんの HTML が中身を持っている（白画面の検出）
for (const edition of EDITIONS) {
  const res = await get(`${edition.base}index.html`);
  const html = await res.text();
  record(/<div id="root">/.test(html) && /assets\/.*\.js/.test(html), `${edition.name}: HTML references its bundle`, `${html.length} bytes`);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`DEPLOY CHECK FAILED (${failed.length})`);
  process.exitCode = 1;
} else {
  console.log('DEPLOY CHECK PASSED');
}
