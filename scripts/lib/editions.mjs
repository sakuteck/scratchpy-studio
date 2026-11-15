/**
 * 配信する版の一覧（唯一の定義）。
 *
 * v1.0.16 までは「版のパス」が build-pages / check-headers / テスト / CI の
 * 4 か所に別々に書かれていた。1 か所でも更新を忘れると、
 * 「CSP の付かない HTML が静かに配信される」という穴（診断 V1）が再び空く。
 * ここを唯一の定義にして、他のスクリプトは必ずここから導出する。
 */

/** @typedef {{name:string, output:string, base:string, language:'ja'|'en', education:'true'|'false'}} Edition */

/** @type {Edition[]} 親ディレクトリから順に並べる（Vite が出力先を消すため）。 */
export const EDITIONS = [
  { name: 'Studio 日本語', output: 'dist', base: '/', language: 'ja', education: 'false' },
  { name: 'Studio English', output: 'dist/en', base: '/en/', language: 'en', education: 'false' },
  { name: 'Education 日本語', output: 'dist/education', base: '/education/', language: 'ja', education: 'true' },
  { name: 'Education English', output: 'dist/education/en', base: '/education/en/', language: 'en', education: 'true' },
];

/**
 * 各版の HTML 文書の URL（末尾スラッシュ形と index.html 直指定形の両方）。
 * Cloudflare Pages は `/x/` と `/x/index.html` の両方を 200 で返すため、
 * 片方だけにヘッダを付けると、もう片方だけが無防備になる（診断 V1 の原因）。
 * @returns {string[]} 例: ['/', '/index.html', '/en/', '/en/index.html', …]
 */
export function documentUrls() {
  const urls = new Set();
  for (const edition of EDITIONS) {
    urls.add(edition.base);
    urls.add(`${edition.base}index.html`);
  }
  return [...urls].sort();
}
