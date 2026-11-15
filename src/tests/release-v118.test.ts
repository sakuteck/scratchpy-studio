import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DiagnosticsPanel from '../app/components/DiagnosticsPanel';

/**
 * v1.0.18 = 総合診断 v1.0.17（N1〜N22・S11）への対応を固定する回帰テスト。
 *
 * ここで確かめているのは「直したと書いた場所が、次に触ったときに元へ戻らないこと」。
 * 実ブラウザでの見た目（はみ出し・コントラスト・フォーカス輪）は
 * `scripts/check-contrast.cjs` と Playwright の実測で確認している。
 */
const read = (p: string) => readFileSync(p, 'utf8');

const css = read('src/app/styles.css');
const educationCss = read('src/education/education.css');
const playerCss = read('src/app/components/scratch-player.css');
const app = read('src/app/App.tsx');
const editor = read('src/app/components/Editor.tsx');
const diagnostics = read('src/app/components/DiagnosticsPanel.tsx');
const blockly = read('src/app/components/BlocklyPanel.tsx');
const drafts = read('src/app/studioDraft.ts');
const educationApp = read('src/education/EducationApp.tsx');
const contrastCheck = read('scripts/check-contrast.cjs');

/** 1 行 CSS の中から `セレクタ { 宣言 }` を雑に取り出す（整形に依存しないため）。 */
const blocks = (source: string, selector: RegExp) => {
  const found: string[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.test(m[1].trim())) found.push(m[2]);
  }
  return found;
};

describe('サンプル読み込みで作業が消えない（N1）', () => {
  it('asks before replacing edited code and remembers one step to undo', () => {
    expect(app).toContain('editedSinceLoad');
    // 置き換え前に確認する（下書き・編集済みのコードを黙って捨てない）
    expect(app).toMatch(/確認|confirm/);
    expect(app).toContain('rememberUndo');
    expect(app).toContain('restoreUndo');
    expect(app).toContain('undo-banner');
  });

  it('renders the undo banner with a labelled dismiss button', () => {
    expect(app).toMatch(/role="status"[\s\S]{0,400}元に戻す/);
    expect(app).toContain("aria-label={t('案内を閉じる'");
  });
});

describe('ブロックの未反映が分かる（N2）', () => {
  it('shows an unapplied badge and applies changes when switching to code', () => {
    expect(blockly).toContain('applyToCode');
    expect(blockly).toContain('reloadFromText');
    expect(app).toContain('未反映');
    expect(app).toContain('blocklyRef');
    // 切り替え時に自動反映 → できなければ確認して巻き戻す
    expect(app).toContain('changeMode');
    expect(app).toMatch(/applyToCode\(\)/);
  });
});

describe('失敗が黙って消えない（N3 / N16）', () => {
  it('logs a readable error when a dropped .sb3 cannot be loaded', () => {
    expect(app).toMatch(/assertSb3Size/);
    expect(app).toMatch(/try\s*\{[\s\S]{0,220}loadSb3Bytes[\s\S]{0,220}\}\s*catch/);
    expect(app).toMatch(/addLog\('error'/);
  });

  it('logs when formatting fails instead of doing nothing', () => {
    expect(app).toMatch(/整形できませんでした|Could not format/);
    expect(app).toMatch(/setTab\('diagnostics'\)/);
  });
});

describe('キーボードだけで使える（N4 / N5 / N6 / N14）', () => {
  it('lets Escape release the Tab key from the editor', () => {
    expect(editor).toContain('tabInserts');
    expect(editor).toMatch(/e\.key === 'Escape'/);
    expect(editor).toMatch(/e\.key !== 'Tab' \|\| !tabInserts/);
    expect(editor).toContain('aria-describedby="editor-keyboard-hint"');
    expect(editor).toContain('id="editor-keyboard-hint"');
  });

  it('exposes the inspector as a tablist with arrow-key navigation', () => {
    expect(app).toContain('role="tablist"');
    expect(app).toContain('role="tab"');
    expect(app).toContain('role="tabpanel"');
    expect(app).toContain('onTabKeyDown');
    expect(app).toMatch(/ArrowRight/);
    expect(app).toMatch(/Home/);
  });

  it('makes diagnostic rows real buttons and says when there is no code', () => {
    expect(diagnostics).toMatch(/d\.loc \? 'button' : 'div'/);
    expect(diagnostics).toMatch(/type=\{d\.loc \? 'button' : undefined\}/);
    expect(diagnostics).toContain('empty');
    expect(app).toMatch(/empty=\{text\.trim\(\) === ''\}/);
  });

  it('writes the .sb3 on Ctrl/⌘+S instead of opening the browser save dialog', () => {
    expect(app).toMatch(/event\.key\.toLowerCase\(\) !== 's'/);
    expect(app).toMatch(/event\.preventDefault\(\)/);
    expect(app).toContain('onDownload()');
  });
});

describe('夜モードの文字が読める（N7 / N20）', () => {
  it('measures the dark colour modes, not just the light one', () => {
    expect(contrastCheck).toContain("'night'");
    expect(contrastCheck).toContain("'night-contrast'");
  });

  it('gives non-selected tab and segment labels a dark-mode colour, without touching the active one', () => {
    expect(css).toMatch(/html\[data-theme="dark"\] \.editor-shell \.seg:not\(\.active\) \{ color: #d7e4f7; \}/);
    expect(css).toMatch(/html\[data-theme="dark"\] \.editor-shell \.tabs \.tab:not\(\.active\)\s*\{\s*color:/);
    // 選択中は青地なので、薄い色を当てると 3.9:1 まで落ちる（実測）。当てないこと。
    expect(css).not.toMatch(/html\[data-theme="dark"\] \.editor-shell \.seg\s*\{/);
  });

  it('keeps the focus ring visible on any background (offset + second ring)', () => {
    expect(css).toMatch(/--focus-inner:/);
    expect(css).toMatch(/--focus-outer:/);
    expect(css).toMatch(/\[tabindex\]:focus-visible \{[^}]*outline-offset: 2px/);
    expect(css).toMatch(/\[tabindex\]:focus-visible \{[^}]*box-shadow: 0 0 0 6px var\(--focus-outer\)/);
    // Studio 側のフォーカス規則にも外側リングを付ける（内側だけだと白背景で溶ける）
    expect(css).toMatch(/\.editor-shell \.btn:focus-visible \{[^}]*outline-offset: 2px/);
  });
});

describe('狭い画面ではみ出さない（N8 / N9 / N10）', () => {
  it('wraps the inspector tabs instead of pushing them outside the screen', () => {
    // `.tabs` の宣言が 1 行にまとまっているので、見出しと宣言を続けて照合する
    expect(css).toMatch(/\.tabs \{\s*display: flex; flex-wrap: wrap;/);
    expect(css).toMatch(/\.tab \{\s*flex: 1 1 auto;\s*min-width: 0;/);
  });

  it('stacks the education header before it runs out of width', () => {
    expect(educationCss).toMatch(/@media\(min-width:651px\) and \(max-width:900px\)[\s\S]{0,200}\.edu-header \{/);
    expect(educationCss).toMatch(/@media\(min-width:651px\) and \(max-width:900px\)[\s\S]{0,300}flex-wrap:wrap/);
  });

  it('tells people that the lesson list scrolls sideways', () => {
    expect(educationApp).toContain('edu-list-hint');
    expect(educationCss).toMatch(/\.edu-list-hint \{ display:none; \}/);
    expect(educationCss).toMatch(/\.edu-lesson-list \{[^}]*scroll-snap-type/);
  });

  it('keeps the stage at 4:3 instead of pinning it to a fixed height', () => {
    expect(css).toMatch(/\.scratch-player-stage \{[^}]*aspect-ratio: 4 \/ 3/);
    expect(css).toMatch(/\.scratch-player-stage \{[^}]*max-height: none/);
    expect(playerCss).not.toMatch(/\.scratch-player-stage \{[^}]*max-height:\s*\d+px/);
  });
});

describe('読みやすさと見出しの順序（N12 / N13）', () => {
  it('never renders text below 11px', () => {
    for (const [name, source] of [
      ['styles.css', css],
      ['education.css', educationCss],
      ['scratch-player.css', playerCss],
    ] as const) {
      expect(source, name).not.toMatch(/font-size:\s*(?:9|10|10\.5)px/);
    }
  });

  it('has exactly one h1 per education page, before the lesson headings', () => {
    expect(educationApp.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(educationApp).toContain('className="sr-only"');
    expect(educationApp).not.toMatch(/edu-page-eyebrow[\s\S]{0,80}<h1>/);
    expect(educationCss).toContain('.edu-page-top h2');
  });
});

describe('大量のコードでも固まらない（N18 / N19）', () => {
  it('caps how many diagnostics are rendered and says how many are hidden', () => {
    expect(diagnostics).toMatch(/const MAX_ROWS = 200;/);
    expect(diagnostics).toMatch(/diags\.slice\(0, MAX_ROWS\)/);
    expect(diagnostics).toContain('diag-more');
    expect(diagnostics).toMatch(/hidden > 0/);
    expect(css).toMatch(/\.diag-more \{/);
  });

  it('renders at most 200 rows and reports the rest (measured by rendering the panel)', () => {
    const diagnosticsList = Array.from({ length: 250 }, (_, i) => ({
      severity: 'error' as const,
      message: `問題 ${i + 1}`,
      loc: { line: i + 1, column: 1 },
    }));
    const html = renderToStaticMarkup(
      createElement(DiagnosticsPanel, {
        analysis: { diagnostics: diagnosticsList } as never,
        onJump: () => {},
      }),
    );
    expect((html.match(/class="diag /g) ?? []).length).toBe(200);
    expect(html).toContain('ほかに 50 件');
  });

  it('waits longer before analysing very large documents', () => {
    expect(app).toMatch(/const delay = text\.length > 120_000 \? 900 : 300;/);
    expect(app).toMatch(/\}, delay\);/);
  });
});

describe('端末に残る下書きを消せる（S11）', () => {
  it('deletes every stored draft and reports how many were removed', () => {
    expect(drafts).toMatch(/clearDrafts[\s\S]{0,200}getAllKeys/);
    expect(drafts).toMatch(/clearDrafts\(\): Promise<number>/);
    expect(app).toContain('clearDrafts');
    expect(app).toContain('draft-clear');
  });

  it('labels the sample picker for screen readers (N15)', () => {
    expect(app).toMatch(/className="sample-select"[\s\S]{0,200}aria-label/);
  });
});
