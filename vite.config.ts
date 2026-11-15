import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let building = false;

/** ローカル開発と、明示的に許可したプレビューホストだけを許可する。 */
function allowedDevHosts(): string[] {
  const extra = (process.env.PREVIEW_HOST ?? '').split(',').map(h => h.trim()).filter(Boolean);
  return ['localhost', '127.0.0.1', '[::1]', ...extra];
}

export default defineConfig({
  base: process.env.VITE_APP_BASE || '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), {
    name: 'scratchpy-page-metadata',

    /**
     * 実行エンジン（TurboWarp Scaffolding）を outDir の engine/scaffolding.js に置く。
     *
     * 以前は scripts/build-pages.mjs だけがコピーしていたため、`npm run build:ja` などの
     * 単独ビルドにはエンジンが入らず「実行」だけが 404 になっていた。
     * 統合ビルド（4 版）では VITE_ENGINE_URL を固定し、ルートの 1 コピーを共有する
     * （VITE_ENGINE_EMIT=0 で版ごとの複製を止める）。
     */
    configResolved(config) {
      building = config.command === 'build';
    },
    buildStart() {
      // serve（dev / vitest）では emitFile できないため、ビルドのときだけ出力する。
      if (!building || process.env.VITE_ENGINE_EMIT === '0') return;
      this.emitFile({
        type: 'asset',
        fileName: 'engine/scaffolding.js',
        source: readFileSync(require.resolve('@turbowarp/scaffolding/with-music')),
      });
    },
    // Vite transforms .js URLs in dev mode; the sandbox needs the original
    // prebuilt UMD script, so serve those bytes as a plain classic script.
    configureServer(server) {
      const runtimePath = require.resolve('@turbowarp/scaffolding/with-music');
      server.middlewares.use('/__scratchpy_engine__.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = createReadStream(runtimePath);
        stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
        stream.pipe(res);
      });
    },
    // Match Pages' directory canonicalization: Vite otherwise serves the root
    // SPA for slashless edition paths such as /en and /education/en.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (['/en', '/education', '/education/en'].includes(url.pathname)) {
          res.statusCode = 308;
          res.setHeader('Location', `${url.pathname}/${url.search}`);
          res.end();
          return;
        }
        next();
      });
    },
    /**
     * Education のビルドでは、読み込まない theme-init.js を配布物に残さない
     * （public/ は全版にコピーされるため）。
     */
    closeBundle() {
      const outDir = process.env.VITE_APP_EDUCATION === 'true' ? process.env.VITE_OUT_DIR : '';
      if (!outDir) return;
      const file = path.join(process.cwd(), outDir, 'theme-init.js');
      if (existsSync(file)) rmSync(file);
    },
    transformIndexHtml(html) {
      const en = process.env.VITE_APP_LANGUAGE === 'en';
      const education = process.env.VITE_APP_EDUCATION === 'true';
      const title = education ? (en ? 'ScratchPy Education — From blocks to code' : 'ScratchPy Education — ブロックからコードへ') : (en ? 'ScratchPy Studio — Scratch and ScratchPy converter' : 'ScratchPy Studio — .sb3 ⇔ ScratchPy 相互変換');
      let out = html.replace('<html lang="ja">', `<html lang="${en ? 'en' : 'ja'}">`).replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      // Education は配色を自前で固定しているため、theme-init.js は読み込まない（無駄な取得と同期漏れの元）。
      // 読み込まない以上、その説明コメントも残さない（実装と食い違うコメントを出荷しない）。
      if (education) {
        out = out.replace(/\s*<script[^>]*src="[^"]*\/theme-init\.js"[^>]*><\/script>/, '');
        out = out.replace(/\s*<!--[^>]*theme-init[^>]*-->/, '').replace(/\s*<!--[^>]*配色[^>]*-->/, '');
      }
      // 英語版のソースに日本語のコメントを残さない（出荷物に混ざらないように）。
      if (en) out = out.replace(/\s*<!--[\s\S]*?-->/g, '');
      return out;
    },
  }],
  // Avoid dependency-cache races when both language servers start together.
  cacheDir: process.env.VITE_APP_EDUCATION === 'true' ? (process.env.VITE_APP_LANGUAGE === 'en' ? 'node_modules/.vite-education-en' : 'node_modules/.vite-education') : process.env.VITE_APP_LANGUAGE === 'en' ? 'node_modules/.vite-en' : 'node_modules/.vite-ja',
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 既定はローカル開発のホストのみ。プレビュー用ホストは環境変数 PREVIEW_HOST で明示的に許可する。
    // ワイルドカード許可（任意の Host ヘッダを受け入れる設定）は DNS リバインディングの入口になるため使わない。
    allowedHosts: allowedDevHosts(),
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: allowedDevHosts(),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
