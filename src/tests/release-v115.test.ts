import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { COLOR_MODES, DEFAULT_COLOR_MODE } from '../app/theme';
import { sanitizeTutorReply } from '../app/ai/agent';

const read = (p: string) => readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;

describe('配色の初期適用（B-2）', () => {
  // theme-init.js は本体 JS より前に動く必要があるため、TypeScript からは使えず
  // 対応表を二重に持っている。ここで両者がずれていないことを固定する。
  const script = read('public/theme-init.js');
  const pairs = [...script.matchAll(/(?:^|\s)('?[\w-]+'?): \['(light|dark)', '(\w+)'\]/g)]
    .map(m => ({ id: m[1].replace(/'/g, ''), dark: m[2] === 'dark', palette: m[3] }));

  it('covers every colour mode with the same theme/palette mapping', () => {
    expect(pairs.length).toBe(COLOR_MODES.length);
    for (const mode of COLOR_MODES) {
      const found = pairs.find(p => p.id === mode.id);
      expect(found, `${mode.id} が theme-init.js にありません`).toBeTruthy();
      expect(found!.dark).toBe(mode.dark);
      expect(found!.palette).toBe(mode.palette);
    }
  });

  it('falls back to the same default mode as the app', () => {
    expect(script).toContain(`modes.scratch`);
    expect(DEFAULT_COLOR_MODE).toBe('scratch');
    expect(script).toContain('sp-color-mode');
    expect(script).toContain('sp-theme');
  });

  it('keeps Education on its fixed palette', () => {
    expect(script).toContain("indexOf('/education')");
  });

  it('is loaded from <head> before the application bundle in every edition', () => {
    const files = ['index.html'];
    if (existsSync('dist')) {
      files.push('dist/index.html', 'dist/en/index.html', 'dist/education/index.html', 'dist/education/en/index.html');
    }
    for (const file of files) {
      const html = read(file);
      const themeIndex = html.indexOf('theme-init.js');
      const moduleIndex = html.indexOf('type="module"');
      if (file.includes('education')) {
        // Education は配色固定なので theme-init.js を読み込まない（読んでも 1 命令も仕事をしない）
        expect(themeIndex, `${file}: theme-init.js を読み込んでいます`).toBe(-1);
        continue;
      }
      expect(themeIndex, `${file}: theme-init.js がありません`).toBeGreaterThan(-1);
      expect(moduleIndex, `${file}: 本体のスクリプトがありません`).toBeGreaterThan(-1);
      expect(themeIndex, `${file}: 本体より後に読み込まれています`).toBeLessThan(moduleIndex);
      expect(html.slice(0, themeIndex)).toContain('<head');
    }
  });
});

describe('共有エンジン（P-1）', () => {
  it('no longer imports the engine as a per-edition asset URL', () => {
    const player = read('src/app/components/ScratchPlayer.tsx');
    expect(player).not.toContain('scaffolding/with-music?url');
    // 共有 URL（統合ビルド）か、BASE_URL 基準（単独ビルド）のどちらかで解決する
    expect(player).toContain('VITE_ENGINE_URL');
    expect(player).toContain('engine/scaffolding.js');
  });

  it('emits the engine from the Vite config so single builds are self-contained', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('@turbowarp/scaffolding/with-music');
    expect(config).toContain("fileName: 'engine/scaffolding.js'");
    // 統合ビルドでは版ごとの複製を止め、ルートの 1 コピーを共有する
    expect(config).toContain("VITE_ENGINE_EMIT === '0'");
    expect(read('scripts/build-pages.mjs')).toContain('VITE_ENGINE_URL');
  });

  it('lets the sandboxed runner load the shared engine', () => {
    // 不透明オリジンの iframe から読むため、/engine/* に CORP が必要
    // （これが無いと _headers 適用下で「実行できません」になる）。
    const headers = read('public/_headers');
    const block = headers.slice(headers.indexOf('/engine/*'));
    expect(block).toContain('Cross-Origin-Resource-Policy: cross-origin');
    expect(block).toContain('Cache-Control: public, max-age=');
  });

  it('ships exactly one copy in dist when a build exists', () => {
    if (!existsSync('dist')) return;
    expect(statSync('dist/engine/scaffolding.js').size).toBeGreaterThan(1_000_000);
    const duplicates: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/scaffolding-with-music/.test(entry.name)) duplicates.push(full);
      }
    };
    walk('dist');
    expect(duplicates).toEqual([]);
  });
});

describe('入力上限と文書の一致（S-2）', () => {
  it('uses 64 MB as the expanded limit', () => {
    expect(read('src/core/sb3/zip.ts')).toContain('MAX_SB3_UNZIPPED = 64 * 1024 * 1024');
  });

  it('does not advertise the old 128 MB limit anywhere', () => {
    // 変更履歴・比較表（「128 MB から引き下げ」）は歴史的記述なので除外する。
    for (const file of ['README.md', 'docs/04-architecture.md', 'docs/06-security-review.md', 'docs/en/architecture.md', 'docs/05-usage-guide.md', 'docs/CHANGELOG.md']) {
      const stale = read(file).split('\n')
        .filter(line => /128 MB/.test(line))
        .filter(line => !/引き下げ|v1\.0\.14|→|300 MB|64 MB/.test(line));
      expect(stale, `${file} に 128 MB の記述が残っています`).toEqual([]);
    }
  });

  it('reports skipped asset names one by one instead of joining them', () => {
    const api = read('src/core/api.ts');
    expect(api).not.toContain("join('、')");
    expect(api).toContain('assetNameSkippedMore');
  });
});

describe('AI 返答のサニタイズ（S-1）', () => {
  const long = Array.from({ length: 20 }, (_, i) => `x${i} = move(10)`).join('\n');

  it('blocks long code that is not in a fence', () => {
    const result = sanitizeTutorReply(`これは説明です。\n${long}\n以上です。`);
    // 12 行までは例として残し、それを超えた分は説明文に置き換える（フェンス内と同じ扱い）。
    expect(result.text).toContain('x11 = move(10)');
    expect(result.text).not.toContain('x12 = move(10)');
    expect(result.text).toContain('説明専用');
    expect(result.blocked).toBe(true);
  });

  it('blocks stage declarations in plain prose', () => {
    const result = sanitizeTutorReply('まずはこう書きます。\nstage:\n  show()');
    expect(result.text).not.toContain('stage:');
    expect(result.blocked).toBe(true);
  });

  it('keeps a short explanation with an inline example', () => {
    const result = sanitizeTutorReply('`x` は変数です。3 行くらいなら例を出せます。');
    expect(result.text).toContain('変数');
    expect(result.blocked).toBe(false);
  });
});

describe('文書とライセンス（H-2〜H-4）', () => {
  const docs = ['docs/04-architecture.md', 'docs/en/architecture.md'];

  it('lists only files that exist in the architecture guides', () => {
    const missing: string[] = [];
    for (const doc of docs) {
      const paths = [...read(doc).matchAll(/`((?:src|public|scripts|docs|node_modules)\/[\w./-]+)`/g)].map(m => m[1]);
      for (const file of paths) {
        // ディレクトリ指定は末尾スラッシュ付き。ファイル指定だけを検査する。
        const target = file.endsWith('/') ? file.slice(0, -1) : file;
        if (!existsSync(target)) missing.push(`${doc}: ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('documents the shared engine and the colour-mode bootstrap', () => {
    expect(read('docs/04-architecture.md')).toContain('theme-init.js');
    expect(read('docs/en/architecture.md')).toContain('engine/scaffolding.js');
  });

  it('ships an MIT licence with accurate third-party notices', () => {
    const licence = read('LICENSE').replace(/\s+/g, ' ');
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toContain('MPL-2.0');
    expect(licence).toContain('not a bundled');
    expect(licence).toContain('Scratch Foundation');
    expect(pkg.license).toBe('MIT');
    const repository = pkg.repository as { url?: string } | string;
    expect(typeof repository === 'string' ? repository : repository.url).toMatch(/github\.com/);
    expect(String(pkg.homepage)).toMatch(/^https:\/\//);
    expect(String(pkg.description).length).toBeGreaterThan(20);
  });

  it('keeps the version in sync', () => {
    // 版番号は package.json だけを正とする（テストにも書き写すと、版上げのたびに
    // 更新漏れが起きる。診断 V13 と同じ「列挙に頼らない」方針）。
    const version = pkg.version as string;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read('README.md')).toContain(`バージョン ${version}`);
    expect(read('docs/06-security-review.md')).toContain(`v${version}`);
  });
});

describe('CI のスモークテスト（H-6）', () => {
  it('ships a headless smoke script and runs it in CI', () => {
    expect(existsSync('scripts/smoke-browser.cjs')).toBe(true);
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('npm run build');
    expect(workflow).toMatch(/smoke-browser\.cjs|npm run smoke/);
    expect(workflow).toContain('playwright install');
  });

  it('checks the four editions and the shared engine', () => {
    const script = read('scripts/smoke-browser.cjs');
    for (const marker of ["'/en/'", "'/education/'", "'/education/en/'", 'engine/scaffolding.js', 'theme-init.js']) {
      expect(script, marker).toContain(marker);
    }
  });
});
