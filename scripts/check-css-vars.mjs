#!/usr/bin/env node
/**
 * CSS のカスタムプロパティが「必ずどこかで定義されている」ことを検査する（`npm run check:cssvars`）。
 *
 * 診断 v1.0.16 の V8 は `var(--code-bg, #eef2f8)` のように
 * **存在しない変数＋フォールバック**が本番に残っていた例。
 * フォールバックがあると見た目は壊れないので、レビューでもテストでも見落とされる。
 * ここでは src 以下の CSS / TS / TSX を対象に、
 *   - `var(--x)` の `--x` に定義があること
 *   - 同じセレクタ（:root / html[data-theme="dark"] / html[data-palette=…]）で
 *     同じ変数を 2 回定義していないこと（後勝ちで片方が死ぬ）
 * を確認する。
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const files = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // テストは「未定義の変数を検出できること」を確かめるために文字列として
    // 存在しない var() を書くので、走査対象から外す（配信物に関係しない）。
    if (entry.isDirectory()) { if (entry.name !== 'tests') walk(full); }
    else if (/\.(css|ts|tsx)$/.test(entry.name)) files.push(full);
  }
};
walk(ROOT);

const defined = new Set();
const used = new Map();
const problems = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
  for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!used.has(match[1])) used.set(match[1], new Set());
    used.get(match[1]).add(file);
  }
}

for (const [name, where] of used) {
  if (!defined.has(name)) problems.push(`${name} は使われているが定義がありません（${[...where].join(', ')}）`);
}

// 同じテーマ用セレクタでの重複定義（:root や html[data-theme="dark"] が 2 回出てくる等）
for (const file of files.filter(f => f.endsWith('.css'))) {
  const source = readFileSync(file, 'utf8');
  const seen = new Map();
  // テーマ変数を定義するブロックだけを見る（`:root` / `html[data-theme=…]` とその子孫セレクタ）。
  for (const match of source.matchAll(/(?:^|\}|;)\s*((?:html\[[^\]]+\]|:root)[^{},]*)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\s+/g, ' ').trim();
    const body = match[2];
    const names = new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    if (!names.size) continue;
    if (seen.has(selector)) {
      const earlier = seen.get(selector);
      const shared = [...names].filter(name => earlier.has(name));
      if (shared.length) problems.push(`${file}: セレクタ ${selector} が複数回定義され、${shared.join(', ')} が後勝ちで上書きされています`);
    } else {
      seen.set(selector, names);
    }
  }
  // 同一ブロック内での重複（例: --editor-bg が 2 行）
  for (const match of source.matchAll(/\{([^{}]*)\}/g)) {
    const names = [...match[1].matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]);
    const dupes = names.filter((name, i) => names.indexOf(name) !== i);
    if (dupes.length) problems.push(`${file}: 同じブロック内で ${[...new Set(dupes)].join(', ')} を 2 回定義しています`);
  }
}

if (problems.length) {
  console.error('CSS VAR CHECKS FAILED');
  for (const problem of problems) console.error(' -', problem);
  process.exit(1);
}
console.log(`CSS VAR CHECKS PASSED (${defined.size} definitions, ${used.size} variables used, 重複 0)`);
