#!/usr/bin/env node
/**
 * `public/_headers` の網羅性と重なりを検査する（`npm run check:headers`、CI でも実行）。
 *
 * Cloudflare Pages は一致する規則をすべて適用し、同名ヘッダをカンマ連結する。
 * そのため「広い規則」と「狭い規則」で同じヘッダを書くと
 * `frame-ancestors 'none', 'self'` のような不正な値になり、本番だけ壊れる。
 * 逆に、規則を列挙すると**書き忘れたパスだけが無防備**になる。
 *
 * ここでは dist の実ファイルから URL を導出し、
 *   - 配信される HTML のすべてに CSP と X-Frame-Options があること
 *   - 実行サンドボックスだけが `'self'` / SAMEORIGIN であること
 *   - 同じヘッダを 2 つの規則が設定していないこと
 *   - 適用順を変えても結果が変わらないこと
 * を確認する（列挙漏れを人が覚えていなくても検出できる）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { collectHeaders, duplicateHeaders, parseHeaders } from './lib/headers-rules.mjs';
import { createPagesServer } from './lib/pages-server.mjs';

const DIST = path.resolve('dist');
const rules = parseHeaders(readFileSync('public/_headers', 'utf8'));
const problems = [];
const normalise = headers => JSON.stringify(Object.entries(headers).sort());

/** dist 配下の HTML を URL パスへ（`dist/en/index.html` → `/en/` と `/en/index.html`）。 */
function documentPaths() {
  if (!existsSync(DIST)) return [];
  const found = new Set();
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        const rel = '/' + path.relative(DIST, full).split(path.sep).join('/');
        found.add(rel);
        if (path.basename(rel) === 'index.html') found.add(rel.replace(/index\.html$/, ''));
      }
    }
  };
  walk(DIST);
  return [...found].sort();
}

const documents = documentPaths();
if (!documents.length) {
  problems.push('dist がありません。先に npm run build を実行してください（網羅性の検査にはビルド成果物が必要です）。');
}

// 配下の _headers は Cloudflare が解釈しない（出力ルートだけ）。残っていれば指摘する。
if (existsSync(DIST)) {
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === '_headers' && full !== path.join(DIST, '_headers')) {
        problems.push(`${path.relative('.', full)} は解釈されない _headers のコピーです（配下の版には置かない）`);
      }
    }
  };
  walk(DIST);
}

const runner = p => p.startsWith('/scratch-runner/');
const all = [...documents, '/assets/index-abc123.js', '/engine/scaffolding.js', '/theme-init.js', '/en/assets/index-abc123.js'];

for (const pathname of all) {
  const duplicates = duplicateHeaders(rules, pathname);
  if (duplicates.length) problems.push(`${pathname}: 同じヘッダを複数の規則が設定しています → ${duplicates.join(', ')}`);
  if (normalise(collectHeaders(rules, pathname)) !== normalise(collectHeaders(rules, pathname, { reverse: true })))
    problems.push(`${pathname}: 適用順で結果が変わります（! による打ち消しに依存しています）`);

  const headers = collectHeaders(rules, pathname);
  const csp = headers['Content-Security-Policy'] || '';
  const isDocument = documents.includes(pathname) && !runner(pathname);
  if (runner(pathname)) {
    if (!csp.includes("frame-ancestors 'self'")) problems.push(`${pathname}: CSP に frame-ancestors 'self' がありません`);
    if (headers['X-Frame-Options'] !== 'SAMEORIGIN') problems.push(`${pathname}: X-Frame-Options が SAMEORIGIN ではありません`);
    if (headers['Cross-Origin-Resource-Policy'] !== 'cross-origin') problems.push(`${pathname}: CORP が cross-origin ではありません`);
  } else if (isDocument) {
    if (!csp.includes("frame-ancestors 'none'")) problems.push(`${pathname}: 配信される HTML に frame-ancestors 'none' がありません`);
    if (headers['X-Frame-Options'] !== 'DENY') problems.push(`${pathname}: 配信される HTML の X-Frame-Options が DENY ではありません`);
  }
}

/**
 * 最後に、`_headers` を実際に適用したサーバで配って確かめる。
 * 規則の計算だけを見ていると、**ファイルが無くて 404 でも合格**してしまう
 * （ヘッダはファイルの有無に関係なく付くため）。v1.0.17 で追加。
 */
if (existsSync(DIST)) {
  const pages = createPagesServer(DIST);
  const port = await pages.listen(0);
  const fetchPath = pathname =>
    new Promise((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 10000 }, response => {
        response.resume();
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
      });
      request.on('timeout', () => request.destroy(new Error(`${pathname}: 応答がありません`)));
      request.on('error', reject);
    });
  try {
    for (const pathname of [...documents, '/scratch-runner/index.html', '/scratch-runner/runner.js', '/engine/scaffolding.js']) {
      const response = await fetchPath(pathname);
      if (response.status !== 200) problems.push(`${pathname}: 実際の配信で ${response.status} が返ります（ファイルが無い可能性）`);
      if (pathname === '/engine/scaffolding.js') {
        if (response.headers['cross-origin-resource-policy'] !== 'cross-origin') problems.push(`${pathname}: 実配信の CORP が cross-origin ではありません`);
        continue;
      }
      const csp = response.headers['content-security-policy'] || '';
      const expected = pathname.startsWith('/scratch-runner/') ? "frame-ancestors 'self'" : "frame-ancestors 'none'";
      if (!csp.includes(expected)) problems.push(`${pathname}: 実配信の CSP に ${expected} がありません`);
    }
  } finally {
    await pages.close();
  }
}

if (problems.length) {
  console.error('HEADER CHECKS FAILED');
  for (const problem of problems) console.error(' -', problem);
  process.exit(1);
}
console.log(`HEADER CHECKS PASSED (${documents.length} document paths, 重複 0・順序に依存しない・文書と runner の向きが正しい)`);
