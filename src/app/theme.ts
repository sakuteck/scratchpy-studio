/**
 * カラーモード（配色）の定義と適用。
 *
 * 見た目は 2 つの軸で決まる:
 *   - data-theme   : light / dark（明るさ。既存の CSS 変数が切り替わる）
 *   - data-palette : standard / scratch / pastel / contrast（色味。--mode-* を差し替える）
 *
 * 「通常」は装飾を控えた標準配色。Scratch・パステル・高コントラストは好みに応じて選ぶ。
 * どのモードでも、本文・ボタン・バッジの文字コントラストは WCAG AA（4.5:1 以上）を満たす。
 */

export type ColorModeId = 'standard' | 'scratch' | 'pastel' | 'contrast' | 'night' | 'night-contrast';
export type PaletteId = 'standard' | 'scratch' | 'pastel' | 'contrast';

export interface ColorMode {
  id: ColorModeId;
  /** メニューに出す日本語名 */
  ja: string;
  /** メニューに出す英語名 */
  en: string;
  /** 補足説明（select の aria-describedby で読み上げる） */
  hintJa: string;
  hintEn: string;
  dark: boolean;
  palette: PaletteId;
}

export const COLOR_MODES: ColorMode[] = [
  { id: 'standard', ja: '通常', en: 'Standard', hintJa: '装飾を控えた標準の配色（通常モード）', hintEn: 'Calm, neutral colours', dark: false, palette: 'standard' },
  { id: 'scratch', ja: 'Scratch', en: 'Scratch', hintJa: 'Scratch のカテゴリ色を使ったカラフルな配色', hintEn: 'Uses the Scratch category colours', dark: false, palette: 'scratch' },
  { id: 'pastel', ja: 'パステル', en: 'Pastel', hintJa: 'やわらかい紫系の配色', hintEn: 'Soft violet palette', dark: false, palette: 'pastel' },
  { id: 'contrast', ja: '高コントラスト', en: 'High contrast', hintJa: '白黒に近い強いコントラスト（読みやすさ優先）', hintEn: 'Near-black on white for maximum legibility', dark: false, palette: 'contrast' },
  { id: 'night', ja: '夜', en: 'Night', hintJa: '暗い背景の配色（ダークモード）', hintEn: 'Dark background with Scratch accents', dark: true, palette: 'scratch' },
  { id: 'night-contrast', ja: '夜・高コントラスト', en: 'Night high contrast', hintJa: '黒背景・白文字の高コントラスト', hintEn: 'Black background, maximum contrast', dark: true, palette: 'contrast' },
];

export const DEFAULT_COLOR_MODE: ColorModeId = 'scratch';
/** 保存キー。v1.0.13 以前の 'sp-theme' も読み替える。 */
export const COLOR_MODE_STORAGE_KEY = 'sp-color-mode';
const LEGACY_STORAGE_KEY = 'sp-theme';

export function isColorMode(value: unknown): value is ColorModeId {
  return typeof value === 'string' && COLOR_MODES.some(m => m.id === value);
}

export function colorMode(id: ColorModeId): ColorMode {
  return COLOR_MODES.find(m => m.id === id) ?? COLOR_MODES.find(m => m.id === DEFAULT_COLOR_MODE)!;
}

/** 保存済みの設定を読む。壊れた値・旧形式・ストレージ不可でも既定値に落ちる。 */
export function loadColorMode(storage?: Pick<Storage, 'getItem'>): ColorModeId {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (!store) return DEFAULT_COLOR_MODE;
    const saved = store.getItem(COLOR_MODE_STORAGE_KEY);
    if (isColorMode(saved)) return saved;
    const legacy = store.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'dark') return 'night';
    if (legacy === 'light') return 'standard';
  } catch { /* プライベートブラウズ等 */ }
  return DEFAULT_COLOR_MODE;
}

export function saveColorMode(id: ColorModeId, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    store?.setItem(COLOR_MODE_STORAGE_KEY, id);
  } catch { /* 保存できなくても表示は変える */ }
}

export interface ThemeRoot {
  dataset: { theme?: string; palette?: string };
  style: { colorScheme?: string };
}

/** html 要素へ適用する。SSR やテストでは root を渡して検証できる。 */
export function applyColorMode(id: ColorModeId, root?: ThemeRoot): void {
  const mode = colorMode(id);
  const target = root ?? (typeof document === 'undefined' ? null : (document.documentElement as unknown as ThemeRoot));
  if (!target) return;
  target.dataset.theme = mode.dark ? 'dark' : 'light';
  target.dataset.palette = mode.palette;
  target.style.colorScheme = mode.dark ? 'dark' : 'light';
}
