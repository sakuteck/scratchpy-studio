import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COLOR_MODES, DEFAULT_COLOR_MODE, applyColorMode, colorMode, isColorMode, loadColorMode, saveColorMode } from '../app/theme';

const css = readFileSync('src/app/styles.css', 'utf8');

/** #rrggbb → 相対輝度（WCAG 2.x） */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** `html[data-palette="x"] { … }` の宣言を読む */
function paletteBlock(palette: string, dark = false): Record<string, string> {
  const selector = dark ? `html[data-theme="dark"][data-palette="${palette}"]` : `html[data-palette="${palette}"]`;
  const start = css.indexOf(selector + ' {');
  expect(start, `${selector} が styles.css に無い`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const [, key, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const color = value.match(/#[0-9a-fA-F]{3,8}/);
    if (color) vars[key] = color[0];
  }
  return vars;
}

describe('カラーモードの定義（ドロップダウンの中身）', () => {
  it('offers six modes including a plain "standard" mode', () => {
    expect(COLOR_MODES).toHaveLength(6);
    expect(COLOR_MODES.map(m => m.id)).toContain('standard');
    expect(COLOR_MODES[0].id).toBe('standard');
    expect(DEFAULT_COLOR_MODE).toBe('scratch');
  });

  it('has unique ids, unique palettes per brightness, and both languages', () => {
    const ids = COLOR_MODES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const combos = COLOR_MODES.map(m => `${m.dark ? 'dark' : 'light'}:${m.palette}`);
    expect(new Set(combos).size).toBe(combos.length);
    for (const mode of COLOR_MODES) {
      expect(mode.ja.length, mode.id).toBeGreaterThan(0);
      expect(mode.en.length, mode.id).toBeGreaterThan(0);
      expect(mode.hintJa.length, mode.id).toBeGreaterThan(0);
      expect(mode.hintEn.length, mode.id).toBeGreaterThan(0);
      // メニューの文字が長すぎるとツールバーが折り返す
      expect(mode.ja.length, mode.id).toBeLessThanOrEqual(12);
    }
  });

  it('defines CSS tokens for every palette, in light and dark', () => {
    for (const palette of ['standard', 'scratch', 'pastel', 'contrast']) {
      const light = paletteBlock(palette);
      for (const key of ['--mode-primary', '--mode-primary-strong', '--mode-primary-edge', '--mode-toolbar-b', '--mode-surface', '--mode-ring'])
        expect(light[key], `${palette} ${key}`).toBeTruthy();
      const dark = paletteBlock(palette, true);
      expect(dark['--mode-toolbar-b'], `${palette} dark toolbar`).toBeTruthy();
    }
  });

  it('keeps white text on primary/toolbar colours at WCAG AA (4.5:1) or better', () => {
    for (const palette of ['standard', 'scratch', 'pastel', 'contrast']) {
      const light = paletteBlock(palette);
      for (const key of ['--mode-primary', '--mode-primary-strong', '--mode-toolbar-a', '--mode-toolbar-b']) {
        expect(contrast(light[key], '#ffffff'), `${palette} ${key}`).toBeGreaterThanOrEqual(4.5);
      }
      const dark = paletteBlock(palette, true);
      for (const key of ['--mode-toolbar-a', '--mode-toolbar-b']) {
        expect(contrast(dark[key], '#ffffff'), `${palette} dark ${key}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the tiny structure labels readable in every mode', () => {
    // .tree-kind は 10px。Scratch のカテゴリ色は背景に残し、文字は濃色（stage のみ白）。
    const rules = css.slice(css.indexOf('.tree-kind {'), css.indexOf('.kind-def'));
    expect(rules).toContain('color: #1b2438');
    const kinds: [string, string, string][] = [
      ['#6d47b8', '#ffffff', 'stage'],
      ['#4c97ff', '#1b2438', 'sprite'],
      ['#ff8c1a', '#1b2438', 'var'],
      ['#ff661a', '#1b2438', 'list'],
      ['#37b57f', '#1b2438', 'costume/sound'],
      ['#ff6680', '#1b2438', 'def'],
    ];
    for (const [bg, fg, name] of kinds) expect(contrast(bg, fg), name).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps editor text and line numbers readable', () => {
    for (const [bg, fg, ln] of [['#191c30', '#e8eaf6', '#8b94b8'], ['#121424', '#dfe3f5', '#93a0c4'], ['#ffffff', '#1b2438', '#556080']]) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ln, bg), `line numbers on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // 通常（標準）モードのエディタは白地。
    expect(css).toContain('html[data-palette="standard"]:not([data-theme="dark"]) .editor-shell');
    // 高コントラスト（昼）は白地・黒文字
    expect(css).toContain('html[data-palette="contrast"]:not([data-theme="dark"]) .editor-shell');
  });

  it('no longer ships the unused low-contrast .btn.blue class', () => {
    expect(css).not.toContain('.btn.blue');
  });
});

describe('カラーモードの適用と保存', () => {
  const root = () => ({ dataset: {} as { theme?: string; palette?: string }, style: {} as { colorScheme?: string } });

  it('maps each mode to data-theme + data-palette', () => {
    for (const mode of COLOR_MODES) {
      const el = root();
      applyColorMode(mode.id, el);
      expect(el.dataset.theme, mode.id).toBe(mode.dark ? 'dark' : 'light');
      expect(el.dataset.palette, mode.id).toBe(mode.palette);
      expect(el.style.colorScheme, mode.id).toBe(mode.dark ? 'dark' : 'light');
    }
  });

  it('reads the saved mode, migrates the old light/dark key, and ignores junk', () => {
    const store = (value: string | null) => ({ getItem: () => value });
    expect(loadColorMode(store('pastel'))).toBe('pastel');
    expect(loadColorMode(store('nope'))).toBe(DEFAULT_COLOR_MODE);
    expect(loadColorMode(store(null))).toBe(DEFAULT_COLOR_MODE);
    // 旧 'sp-theme' は新キーが無いときだけ読む
    const legacy = { getItem: (key: string) => (key === 'sp-theme' ? 'dark' : null) };
    expect(loadColorMode(legacy)).toBe('night');
    const both = { getItem: (key: string) => (key === 'sp-theme' ? 'dark' : key === 'sp-color-mode' ? 'pastel' : null) };
    expect(loadColorMode(both)).toBe('pastel');
    expect(isColorMode('night-contrast')).toBe(true);
    expect(isColorMode(42)).toBe(false);
  });

  it('saves the choice without throwing when storage is unavailable', () => {
    const written: [string, string][] = [];
    saveColorMode('pastel', { setItem: (k, v) => { written.push([k, v]); } });
    expect(written).toEqual([['sp-color-mode', 'pastel']]);
    const broken = { setItem: () => { throw new Error('quota'); } };
    expect(() => saveColorMode('night', broken)).not.toThrow();
    expect(colorMode('night').dark).toBe(true);
    expect(colorMode('unknown' as never).id).toBe(DEFAULT_COLOR_MODE);
  });

  it('keeps the UI copy consistent with the theme module', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toContain('COLOR_MODES.map');
    expect(app).toContain('applyColorMode(colorModeId)');
    expect(app).not.toContain("localStorage.setItem('sp-theme'");
  });
});
