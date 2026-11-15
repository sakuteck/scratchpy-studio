/**
 * `dist/` を Cloudflare Pages に近い形で配る検証用サーバ。
 *
 * ポイントは `public/_headers` を**実際のレスポンスに適用する**こと。
 * `vite preview` はヘッダを解釈しないため、CSP でしか壊れない不具合
 * （実行 iframe が frame-ancestors で拒否される等）はローカルで再現しない。
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { collectHeaders, parseHeaders } from './headers-rules.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** URL パス → 実ファイル。ディレクトリは index.html、無ければそのまま 404。 */
export function resolveFile(root, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch {
    return null; // 不正な % エスケープは 404（例外で 500 にしない）
  }
  // `root` は相対でも絶対でもよい（v1.0.17）。以前は `path.join(root, clean)` の結果を
  // `path.resolve(root)` と比べていたため、**相対 root を渡すと全 URL が 404** になった。
  // ヘッダはファイルの有無に関係なく付くので、チェッカーは 404 のまま「合格」しうる。
  const base = path.resolve(root);
  const full = path.resolve(base, `.${clean.startsWith('/') ? '' : '/'}${clean}`);
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) return null;
  if (existsSync(full) && statSync(full).isDirectory()) {
    const index = path.join(full, 'index.html');
    return existsSync(index) ? index : null;
  }
  if (existsSync(full) && statSync(full).isFile()) return full;
  const index = path.join(full, 'index.html');
  return existsSync(index) ? index : null;
}

export function createPagesServer(root, { headersFile = path.join(root, '_headers') } = {}) {
  const rules = existsSync(headersFile) ? parseHeaders(readFileSync(headersFile, 'utf8')) : [];
  const server = createServer((req, res) => {
    const urlPath = req.url || '/';
    const file = resolveFile(root, urlPath);
    const headers = collectHeaders(rules, urlPath.split('?')[0]);
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (!file) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
  return {
    server,
    listen: (port = 0, host = '127.0.0.1') =>
      new Promise(resolve => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
