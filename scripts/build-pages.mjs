/** Build all four independent Vite editions into one Cloudflare Pages site. */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EDITIONS } from './lib/editions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
// 版の一覧は scripts/lib/editions.mjs が唯一の定義（CI やテストもそこから導出する）。
// 親ディレクトリを先にビルドする（Vite が出力先を消すため）。
for (const edition of EDITIONS) {
  console.log(`\n==> ${edition.name} → ${edition.output} (base ${edition.base})`);
  // 統合ビルドではエンジンをルートの 1 コピーだけにする（4 版に複製すると +11 MB）。
  // ルート版が dist/engine/scaffolding.js を出力し、他の版はその URL を参照する。
  const shared = edition.base !== '/';
  const env = {...process.env, VITE_APP_LANGUAGE:edition.language, VITE_APP_EDUCATION:edition.education, VITE_APP_BASE:edition.base, VITE_PAGES_MULTISITE:'true', VITE_OUT_DIR:edition.output,
    ...(shared ? {VITE_ENGINE_URL:'/engine/scaffolding.js', VITE_ENGINE_EMIT:'0'} : {})};
  execFileSync(process.execPath, [vite, 'build', '--outDir', edition.output], {cwd:root, env, stdio:'inherit'});
  // public/ は各版にコピーされるが、Cloudflare Pages が読むのは出力ルートの _headers だけ。
  // 配下のコピーは「編集したのに反映されない」混乱の元なので消す。
  if (shared) rmSync(path.join(root, edition.output, '_headers'), {force:true});
}
console.log('\nAll four editions are ready in dist/ (runtime engine shared from dist/engine/scaffolding.js).');
