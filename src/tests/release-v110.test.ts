import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * v1.1.0 = 総合診断 v1.0.18（A1〜A3・B1〜B7・C3）と v1.0.19 の任意提案（P1〜P4）への対応を固定する回帰テスト。
 * 実ブラウザでの数値（ツールバーの高さ・切替の折返し・ボタンの可視幅）は
 * headless Chromium で測り、CHANGELOG に実測値を書いている。
 */
const read = (p: string) => readFileSync(p, 'utf8');
const css = read('src/app/styles.css');
const editor = read('src/app/components/Editor.tsx');
const app = read('src/app/App.tsx');
const drafts = read('src/app/studioDraft.ts');
const contrastCheck = read('scripts/check-contrast.cjs');
const pkg = JSON.parse(read('package.json')) as { version: string };

describe('狭い画面のツールバーと切替（A1 / A2 / A3）', () => {
  it('hides the tool button labels under 640px but keeps accessible names', () => {
    expect(css).toMatch(/@media \(max-width: 640px\) \{[\s\S]{0,600}\.toolbar \.btn-label \{ display: none; \}/);
    // 文字を消すので、読み上げ名はボタン自身が持つ
    // 開くボタンの読み上げ名も aria-label（旧ラベルは recovery で切り替わるため式ごと確認）
    expect(app).toMatch(/aria-label=\{recovery \? t\('\.sb3 を開く/);
    expect(app).toMatch(/aria-label=\{t\('整形', 'Format'\)\}/);
    expect(app).toMatch(/aria-label=\{t\('新規', 'New'\)\}/);
    expect(app).toMatch(/className="btn-label"/);
  });

  it('never clips the draft-delete button (short label + wrapping header)', () => {
    expect(app).toContain('draft-clear-label label-full');
    expect(app).toContain('draft-clear-label label-short');
    expect(css).toMatch(/\.draft-clear \.label-short \{ display: none; \}/);
    expect(css).toMatch(/@media \(max-width: 520px\) \{[\s\S]{0,400}\.draft-clear \.label-full \{ display: none; \}/);
    expect(css).toMatch(/\.panel-title \{ flex-wrap: wrap; row-gap: 6px; \}/);
    expect(css).toMatch(/\.panel-title \.draft-clear \{[^}]*margin-left: auto/);
  });

  it('keeps the code / blocks switch on one line', () => {
    expect(css).toMatch(/\.seg \{ white-space: nowrap; \}/);
    expect(css).toMatch(/\.seg-label \{ white-space: nowrap; \}/);
  });
});

describe('キーボード設定（B1 / B2 / B5）', () => {
  it('makes Ctrl/⌘+M work anywhere, matching the hint', () => {
    expect(editor).toMatch(/window\.addEventListener\('keydown', onWindowKey\)/);
    expect(editor).toMatch(/e\.key\.toLowerCase\(\) !== 'm'/);
  });

  it('remembers the Tab mode across reloads', () => {
    expect(editor).toContain("const TAB_MODE_KEY = 'sp-tab-mode';");
    expect(editor).toMatch(/localStorage\.getItem\(TAB_MODE_KEY\) !== 'move'/);
    expect(editor).toMatch(/localStorage\.setItem\(TAB_MODE_KEY/);
  });

  it('keeps the screen-reader description short', () => {
    expect(editor).toContain("t('Tab はインデント。Esc で編集欄から出られます。'");
    expect(editor).not.toMatch(/Tab はインデントです。Esc を押すと次の Tab で編集欄から出られます/);
  });
});

describe('状態の変化が伝わる（B3 / B4）', () => {
  it('announces changes from one polite live region', () => {
    expect(app).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
    expect(app).toMatch(/const announce = useCallback/);
    expect(app).toMatch(/診断: エラー \$\{errors\.length\} 件、警告 \$\{warnings\.length\} 件/);
    expect(app).toMatch(/未反映のブロック変更があります/);
  });

  it('shows the undo banner as a toast that does not push the layout down', () => {
    expect(css).toMatch(/\.undo-banner \{[\s\S]{0,200}position: fixed/);
    expect(css).toMatch(/\.undo-banner \{[\s\S]{0,300}max-width: min\(560px, calc\(100vw - 24px\)\)/);
  });

  it('does not re-announce autosaves more than once every 30 seconds', () => {
    expect(app).toMatch(/now - lastSaveAnnounce\.current < 30_000/);
  });
});

describe('破壊的操作の手前で止まる（B6 / B7）', () => {
  it('skips the confirm when there is nothing to lose', () => {
    expect(app).toMatch(/const hasWork = text\.trim\(\) !== '' \|\| originalSb3 !== null;/);
    expect(app).toMatch(/if \(hasWork && !window\.confirm/);
  });

  it('tells how many drafts will be deleted before asking', () => {
    expect(drafts).toMatch(/export async function countDrafts\(\): Promise<number>/);
    expect(app).toMatch(/countDrafts\(\)/);
    expect(app).toMatch(/下書き \$\{count\} 件/);
    expect(app).toMatch(/削除する下書きはありません/);
  });
});

describe('仕上げの任意提案（P1〜P4）', () => {
  it('P1: shows a saved check icon even when the autosave label is hidden', () => {
    expect(app).toContain('draft-status-icon');
    expect(css).toMatch(/\.draft-status-icon \{ flex: none; color: var\(--ok\); \}/);
  });

  it('P2: every toolbar button explains itself on hover', () => {
    // アイコンだけになる幅でも、マウス利用者に title が出る
    for (const label of ["t('コードを整形', 'Format the code')", "t('新しい作品を作る', 'Start a new project')", "t('使い方・説明', 'Guide')"]) {
      expect(app).toContain(label);
    }
    expect(app).toMatch(/title=\{t\('\.sb3 をダウンロード（Ctrl\/⌘\+S）'/);
  });

  it('P3: Escape dismisses the undo toast', () => {
    expect(app).toMatch(/if \(event\.key !== 'Escape'\) return;[\s\S]{0,200}setUndo\(null\)/);
  });

  it('P4: keeps the page heading short for screen readers', () => {
    expect(app).toContain('<h1 className="sr-only">{t(\'ScratchPy Studio\', \'ScratchPy Studio\')}</h1>');
  });
});

describe('配色の検査網（C3）', () => {
  it('checks all six colour modes, not three', () => {
    const modes = /const COLOR_MODES = \[([^\]]+)\]/.exec(contrastCheck)?.[1] ?? '';
    for (const id of ['standard', 'scratch', 'pastel', 'contrast', 'night', 'night-contrast']) {
      expect(modes, id).toContain(`'${id}'`);
    }
    expect(modes.match(/'/g) ?? []).toHaveLength(12);
  });
});

describe('版と公開の準備', () => {
  it('uses a MINOR version for this feature release (1.1.0)', () => {
    // 1.0.18 / 1.0.19 は機能追加と UI 改善を含むため、パッチではなく MINOR にした。
    expect(pkg.version).toBe('1.1.0');
  });

  it('keeps the release ZIP name and tag in step with the version', () => {
    expect(read('docs/07-deploy-cloudflare.md')).toContain('ScratchPy Studio v1.1.0');
    expect(read('docs/CHANGELOG.md')).toMatch(/^## v1\.1\.0$/m);
  });

  it('ships deployment scripts and a deploy workflow', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts.deploy).toContain('wrangler');
    expect(scripts['deploy:preview']).toContain('--branch preview');
    expect(scripts['check:deploy']).toBe('node scripts/check-deploy.mjs');
    const workflow = read('.github/workflows/deploy-pages.yml');
    expect(workflow).toContain('cloudflare/wrangler-action');
    expect(workflow).toContain('pages deploy dist');
    expect(workflow).toContain('npm run check:deploy');
  });

  it('verifies the deployed headers, not just the build', () => {
    const check = read('scripts/check-deploy.mjs');
    expect(check).toContain('frame-ancestors');
    expect(check).toMatch(/documentUrls/);
    expect(check).toMatch(/404/);
  });
});
