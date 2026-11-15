import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectHeaders, duplicateHeaders, parseHeaders } from '../../scripts/lib/headers-rules.mjs';
import { EDITIONS, documentUrls } from '../../scripts/lib/editions.mjs';
import { sanitizeTutorReply } from '../app/ai/agent';
import { renderTutorMessage } from '../app/ai/tutorText';
import { RUNNER_SANDBOX, RUNNER_TARGET_ORIGIN, runnerMessage } from '../app/components/runnerBridge';
import { resolveFile } from '../../scripts/lib/pages-server.mjs';

const read = (p: string) => readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json')) as { version: string; scripts: Record<string, string> };
const rules = parseHeaders(read('public/_headers'));

/** 返答を文字列にする（React 要素として描画した結果で確認する）。 */
const render = (text: string) => renderToStaticMarkup(createElement(Fragment, null, ...renderTutorMessage(text)));

describe('配信ヘッダの網羅性（診断 v1.0.16 の V1 / V13）', () => {
  it('covers every edition document URL derived from the single edition list', () => {
    // 監査では `/education/index.html` だけ CSP が無かった（末尾スラッシュ形だけを列挙していた）。
    const urls = documentUrls();
    expect(urls).toContain('/education/index.html');
    expect(urls).toHaveLength(EDITIONS.length * 2);
    for (const pathname of urls) {
      const headers = collectHeaders(rules, pathname);
      expect(headers['Content-Security-Policy'], pathname).toContain("frame-ancestors 'none'");
      expect(headers['X-Frame-Options'], pathname).toBe('DENY');
      expect(duplicateHeaders(rules, pathname), pathname).toEqual([]);
    }
  });

  it('keeps the runner sandbox headers unchanged (self / SAMEORIGIN only)', () => {
    const headers = collectHeaders(rules, '/scratch-runner/index.html');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'self'");
    expect(headers['Content-Security-Policy']).not.toContain("frame-ancestors 'none'");
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('serves a relative document root (a silent 404 used to look like a pass)', () => {
    // v1.0.16 の pages-server は `path.join(root, clean)` を絶対パスと比べていたため、
    // **相対 root を渡すと全 URL が 404** になった。ヘッダはファイルの有無に関係なく付くので、
    // チェッカーは 404 のまま「合格」しうる。v1.0.17 で絶対化してから解決する。
    const dir = mkdtempSync(path.join(tmpdir(), 'pages-'));
    try {
      writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
      mkdirSync(path.join(dir, 'education'), { recursive: true });
      writeFileSync(path.join(dir, 'education', 'index.html'), '<!doctype html>');
      const relative = path.relative(process.cwd(), dir);
      expect(resolveFile(relative, '/index.html')).toBe(path.join(dir, 'index.html'));
      expect(resolveFile(relative, '/education/index.html')).toBe(path.join(dir, 'education', 'index.html'));
      expect(resolveFile(relative, '/')).toBe(path.join(dir, 'index.html'));
      expect(resolveFile(relative, '/missing.html')).toBeNull();
      expect(resolveFile(relative, '/../package.json')).toBeNull();
      expect(resolveFile(relative, '/%E0%A4%A')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('derives the checked paths from the build output instead of a hand-written list', () => {
    const checker = read('scripts/check-headers.mjs');
    expect(checker).toContain('documentPaths');
    expect(checker).toContain('readdirSync');
    // 規則の計算だけでなく、実際に配って 200 と CSP を確かめる（404 のまま合格しない）。
    expect(checker).toContain('createPagesServer');
    expect(checker).toContain('実際の配信で');
    for (const hardcoded of ["'/education/index.html'", "'/en/index.html'", "'/index.html'"]) {
      expect(checker).not.toContain(hardcoded);
    }
    // CI も版のパスを書き写さない（書き写すと版を足したときに黙って漏れる）。
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('check:editions');
    expect(workflow).not.toContain('dist/education/en/index.html');
  });

  it('has one definition of the editions, used by the build', () => {
    const build = read('scripts/build-pages.mjs');
    expect(build).toContain("from './lib/editions.mjs'");
    expect(build).not.toContain("output:'dist/education/en'");
    expect(EDITIONS.map((e: { output: string }) => e.output)).toEqual(['dist', 'dist/en', 'dist/education', 'dist/education/en']);
  });
});

describe('AI の地の文サニタイズの境界（V2 / V3）', () => {
  const lines = (count: number, build: (i: number) => string) => Array.from({ length: count }, (_, i) => build(i)).join('\n');

  it('keeps exactly 12 code lines and hides from the 13th', () => {
    // 実装のしきい値（MAX_SNIPPET_LINES = 12）を、実際に切れる入力で固定する。
    const twelve = sanitizeTutorReply(lines(12, i => `say("line ${i}")`));
    expect(twelve.blocked).toBe(false);
    expect(twelve.text.split('\n')).toHaveLength(12);

    const thirteen = sanitizeTutorReply(lines(13, i => `say("line ${i}")`));
    expect(thirteen.blocked).toBe(true);
    expect(thirteen.text).toContain('説明専用');
    expect(thirteen.text).not.toContain('line 12');
  });

  it('applies the same boundary to indented, quoted, numbered and bulleted code', () => {
    const variants: Array<[string, (i: number) => string]> = [
      ['indented', i => `    move(${i})`],
      ['quoted', i => `> say("l ${i}")`],
      ['numbered', i => `1. say("l ${i}")`],
      ['bulleted', i => `- say("l ${i}")`],
    ];
    for (const [label, build] of variants) {
      expect(sanitizeTutorReply(lines(12, build)).blocked, `${label} x12`).toBe(false);
      expect(sanitizeTutorReply(lines(13, build)).blocked, `${label} x13`).toBe(true);
    }
  });

  it('states the reason only once even when two limits trip together', () => {
    // 連続 12 行の上限と全体 24 行の予算が両方効くと、案内文が 2 回並んでいた（v1.0.17）。
    const result = sanitizeTutorReply(lines(60, i => `say("line ${i}")`));
    const notices = result.text.split('\n').filter(line => line.includes('説明専用'));
    expect(notices).toHaveLength(1);
  });

  it('does not let a Japanese string literal pass for prose', () => {
    // 「日本語を含む行は説明文」という判定が、文字列の中身でコードを免除しないこと。
    // 文字列リテラルを落としてから判定しているため、次の 3 つはすべて遮断される。
    const cases = [
      lines(20, () => '- say("こんにちは")'),
      lines(20, () => 'say("日本語テキスト")'),
      lines(20, i => `x = "日本語 ${i}"`),
    ];
    for (const reply of cases) {
      const result = sanitizeTutorReply(reply);
      expect(result.blocked, reply.slice(0, 12)).toBe(true);
      expect(result.text).toContain('説明専用');
    }
  });

  it('never cuts prose: lists, indented notes and command names in sentences', () => {
    const cases: Array<[string, string]> = [
      ['nested list (4 spaces)', lines(40, () => '    - 詳しい説明です')],
      ['nested list (2 spaces)', lines(40, () => '  - 説明です')],
      ['indented prose', lines(20, i => `    これは ${i} 番目の説明文です。`)],
      ['command word in a bullet', lines(15, i => `- say の使い方 ${i}`)],
      ['URL list', lines(30, i => `- https://example.com/page?n=${i}`)],
      ['English prose', lines(30, i => `This is explanation number ${i}.`)],
    ];
    for (const [label, reply] of cases) {
      const result = sanitizeTutorReply(reply);
      expect(result.blocked, label).toBe(false);
      expect(result.text.split('\n')).toHaveLength(reply.split('\n').length);
    }
  });
});

describe('AI 返答の描画（V7）', () => {
  it('renders numbered lists as <ol> and bullets as <ul>', () => {
    expect(render('1. まず動かす\n2. 次に直す')).toContain('<ol>');
    expect(render('- ひとつ\n- ふたつ')).toContain('<ul>');
  });

  it('drops the quote marker and keeps the text', () => {
    const html = render('> ここは引用です');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('ここは引用です');
    expect(html).not.toContain('&gt;');
  });

  it('renders fenced code as <pre><code> without showing the fence', () => {
    const html = render('使い方:\n```\nsay("hi")\n```');
    expect(html).toContain('<pre><code>say(&quot;hi&quot;)</code></pre>');
    expect(html).not.toContain('```');
  });

  it('honours backslash escapes instead of printing them', () => {
    expect(render('\\*\\*強調しない\\*\\*')).toBe('**強調しない**');
  });

  it('returns nothing for an empty reply (previously a lone <br/>)', () => {
    expect(render('')).toBe('');
    expect(render('   \n  ')).toBe('');
  });

  it('leaves table rows as readable text rather than eating the pipes', () => {
    const html = render('| ブロック | 意味 |\n| --- | --- |');
    expect(html).toContain('| ブロック | 意味 |');
  });

  it('still never builds HTML strings', () => {
    expect(read('src/app/ai/tutorText.tsx')).not.toContain('dangerouslySetInnerHTML');
    expect(render('<script>alert(1)</script>')).toContain('&lt;script&gt;');
  });
});

describe('CSS 変数（V8）', () => {
  const agent = read('src/app/components/agent.css');
  const styles = read('src/app/styles.css');

  it('no longer relies on variables that are defined nowhere', () => {
    for (const stale of ['var(--code-bg', 'var(--ink', 'var(--warn-soft']) {
      expect(agent).not.toContain(stale);
    }
    expect(agent).toContain('var(--code-inline-bg)');
    expect(agent).toContain('var(--note-bg)');
  });

  it('defines the chip colours for both themes', () => {
    const light = /:root \{([\s\S]*?)\n\}/.exec(styles)?.[1] ?? '';
    const dark = /html\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(styles)?.[1] ?? '';
    for (const name of ['--code-inline-bg', '--code-inline-ink', '--note-bg', '--note-ink']) {
      expect(light, name).toContain(name);
      expect(dark, name).toContain(name);
    }
  });

  it('never defines the same variable in two blocks of the same mode', () => {
    // v1.0.16 までは `:root` と `html[data-theme="dark"]` がそれぞれ 2 回現れ、
    // 後のブロックが前のブロックの 18 個を黙って上書きしていた（--editor-bg は同一ブロック内で 2 回）。
    const duplicateIn = (pattern: RegExp) => {
      const counts = new Map<string, number>();
      for (const block of styles.matchAll(pattern)) {
        for (const name of block[1].matchAll(/(--[\w-]+)\s*:/g)) counts.set(name[1], (counts.get(name[1]) ?? 0) + 1);
      }
      return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
    };
    expect(duplicateIn(/^:root \{([\s\S]*?)\n\}/gm)).toEqual([]);
    expect(duplicateIn(/^html\[data-theme="dark"\] \{([^}]*)\}/gm)).toEqual([]);
    expect(duplicateIn(/^\.guide-page \{([^}]*)\}/gm)).toEqual([]);
  });

  it('ships a checker so an undefined variable cannot come back unnoticed', () => {
    expect(existsSync('scripts/check-css-vars.mjs')).toBe(true);
    expect(pkg.scripts['check:cssvars']).toBe('node scripts/check-css-vars.mjs');
    expect(read('.github/workflows/ci.yml')).toContain('check:cssvars');
  });
});

describe('アクセシビリティ（V9）', () => {
  it('runs the modal effect once, not on every parent render', () => {
    const app = read('src/education/EducationApp.tsx');
    expect(app).toContain('const closeRef = useRef(onClose)');
    expect(app).toContain('closeRef.current()');
    expect(app).not.toContain('}, [onClose]);');
  });
});

describe('実行 iframe への postMessage（V11）', () => {
  it('sends through one helper that can only address our own iframe', () => {
    const player = read('src/app/components/ScratchPlayer.tsx');
    expect(player).toContain('postToRunner');
    expect(player).not.toMatch(/\.postMessage\(/);
    expect(player).toContain('sandbox={RUNNER_SANDBOX}');
  });

  it('explains why an opaque origin cannot use a concrete targetOrigin', () => {
    const bridge = read('src/app/components/runnerBridge.ts');
    expect(RUNNER_TARGET_ORIGIN).toBe('*');
    expect(RUNNER_SANDBOX).toBe('allow-scripts');
    expect(bridge).toContain('不透明オリジン');
    expect(bridge).toContain('allow-same-origin');
  });

  it('drops anything that is not part of the protocol (no spreading of payloads)', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const message = runnerMessage({ type: 'run', engineUrl: 'https://example.com/engine.js', bytes, apiKey: 'sk-secret' } as never);
    expect(Object.keys(message).sort()).toEqual(['bytes', 'engineUrl', 'source', 'type']);
    expect(JSON.stringify(message)).not.toContain('sk-secret');
    expect(runnerMessage({ type: 'stop' })).toEqual({ source: 'scratchpy-parent', type: 'stop' });
  });
});

describe('文書と実装の一致（V12 / V13）', () => {
  it('only cites npm scripts that really exist', () => {
    const files = ['README.md', ...readdirSync('docs').filter(f => f.endsWith('.md')).map(f => `docs/${f}`)];
    for (const file of files) {
      for (const match of read(file).matchAll(/npm run ([\w:-]+)/g)) {
        const name = match[1];
        // 「`npm run check:*`（4 本）」のような総称表記はスクリプト名ではない。
        if (name.endsWith(':') || name.includes('*')) continue;
        expect(pkg.scripts[name], `${file} の npm run ${name}`).toBeTruthy();
      }
    }
  });

  it('documents the checkers it ships', () => {
    expect(read('docs/05-usage-guide.md')).toContain('check:cssvars');
    expect(read('README.md')).toContain('check:editions');
  });

  it('stamps the release version in the changelog', () => {
    expect(read('docs/CHANGELOG.md')).toContain(`## v${pkg.version}`);
  });

  it('keeps package-lock.json in step with package.json', () => {
    // v1.0.16 の ZIP では lock が 1.0.15 のままだった（配布物の中で版が 2 つあった）。
    const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });
});
