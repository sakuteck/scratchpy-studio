#!/usr/bin/env node
/**
 * ビルド成果物が「scripts/lib/editions.mjs の全版」揃っているかを検査する（`npm run check:editions`）。
 *
 * 版の一覧を CI のシェルやテストへ書き写すと、版を増やしたときに書き足し忘れる。
 * この検査は唯一の定義から期待値を作り、dist の実ファイルと突き合わせる。
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { EDITIONS, documentUrls } from './lib/editions.mjs';

const DIST = path.resolve('dist');
const problems = [];

if (!existsSync(DIST)) {
  console.error('CHECK EDITIONS FAILED\n - dist がありません。先に npm run build を実行してください。');
  process.exit(1);
}

for (const edition of EDITIONS) {
  const file = path.join(edition.output, 'index.html');
  if (!existsSync(file)) problems.push(`${file} がありません（版「${edition.name}」が出力されていません）`);
}

// 期待する文書 URL のうち、末尾スラッシュ形は必ず実ファイル index.html に対応していること。
const built = new Set();
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) {
      const rel = '/' + path.relative(DIST, full).split(path.sep).join('/');
      built.add(rel);
    }
  }
};
walk(DIST);

for (const url of documentUrls()) {
  if (url.endsWith('/')) {
    const file = `${url}index.html`;
    if (!built.has(file)) problems.push(`${file} が dist にありません（${url} の実体が無い）`);
  } else if (!built.has(url)) {
    problems.push(`${url} が dist にありません`);
  }
}

if (problems.length) {
  console.error('CHECK EDITIONS FAILED');
  for (const problem of problems) console.error(' -', problem);
  process.exit(1);
}
console.log(`CHECK EDITIONS PASSED (${EDITIONS.length} editions, ${documentUrls().length} document URLs present in dist)`);
