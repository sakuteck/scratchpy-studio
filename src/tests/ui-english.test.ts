import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import * as Blockly from 'blockly';
import { BLOCK_TIPS, registerScratchPyBlocks } from '../app/blockly/defs';
import { workspaceToAst } from '../app/blockly/bridge';
import { BRIDGE_MESSAGES, BlocklyReject, englishBridgeError, formatBridgeMessage } from '../app/blockly/messages';
import { localizeSample, localizeSampleFor } from '../app/i18n';
import { SAMPLES } from '../core/samples';
import { Sb3ParseError, analyzeText, formatText } from '../core/api';
import { printStmts } from '../core/lang/printer';
import { englishError } from '../app/diagnosticText';
import { DIAGNOSTIC_MESSAGES } from '../core/lang/diagnostics';
import type { Stmt } from '../core/lang/ast';
import uiAllowlistJson from './ui-error-allowlist.json';
import uiTextAllowlistJson from './ui-text-allowlist.json';
const uiAllowlist: string[] = uiAllowlistJson as string[];
const uiTextAllowlist = uiTextAllowlistJson as { files: Record<string, string>; entries: string[] };
const require = createRequire(import.meta.url);
type UiScan = { files: string[]; frozen: string[]; skipped: string[]; ids: string[]; calls: { file: string; line: number; id: string; keys: string[] }[]; errors: string[] };
const { collectUi } = require('../../scripts/diagnostic-coverage.cjs') as { collectUi: (overrides?: Record<string, string>, skipFiles?: string[]) => UiScan };
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/u;
const BRIDGE = 'src/app/blockly/bridge.ts';
const BRIDGE_SRC = readFileSync(BRIDGE, 'utf8');
const PANEL = 'src/app/components/DiagnosticsPanel.tsx';
const PANEL_SRC = readFileSync(PANEL, 'utf8');
const skippedFiles = Object.keys(uiTextAllowlist.files);
/** 除外ファイルを渡して走査する。frozen は「除外後」、skipped は「除外分」。 */
const scan = (overrides: Record<string, string> = {}) => collectUi(overrides, skippedFiles);
registerScratchPyBlocks();

/**
 * UI 層のソース一覧を **テスト側でも実ディレクトリから数える**（v1.0.17）。
 * 以前は「30 ファイル」と書き写していたため、UI ファイルを 1 つ足すだけで
 * 走査対象の一覧が実装とずれた（診断 V13 と同じ「列挙に頼る」型）。
 */
const uiSourceFiles = (['src/app', 'src/education'] as const)
  .flatMap((dir): string[] => {
    const out: string[] = [];
    const walk = (current: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = `${current}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
      }
    };
    walk(dir);
    return out;
  })
  .sort();

describe('UI-layer English audit', () => {
  it('scans every UI source file, including .tsx components', () => {
    const found = scan();
    expect(found.errors).toEqual([]);
    expect(found.files).toEqual(uiSourceFiles);
    expect(found.files.filter(f => f.endsWith('.tsx')).length).toBe(uiSourceFiles.filter(f => f.endsWith('.tsx')).length);
    for (const file of [
      'src/app/App.tsx',
      'src/app/theme.ts',
      'src/app/components/BlocklyPanel.tsx',
      'src/app/components/DiagnosticsPanel.tsx',
      'src/app/components/AgentPanel.tsx',
      'src/app/components/LogPanel.tsx',
      'src/app/components/ScratchPlayer.tsx',
      'src/education/EducationApp.tsx',
    ]) expect(found.files, file).toContain(file);
    expect(found.files.filter(f => !f.endsWith('.ts') && !f.endsWith('.tsx'))).toEqual([]);
  });

  it('freezes Japanese exceptions in .ts and .tsx, including nested expressions', () => {
    expect(scan().frozen).toEqual([]);
    expect(uiAllowlist.filter(x => ![...scan().frozen].includes(x)), 'remove retired allowlist entries').toEqual([]);
    const injected = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ throw new Error('新しい拒否メッセージ'); }\n` });
    expect(injected.frozen).toHaveLength(1);
    const tsx = scan({ [PANEL]: PANEL_SRC + `\nexport function extra(): never { throw new Error('日本語の拒否'); }\n` });
    expect(tsx.frozen).toEqual([`${PANEL} | Error | '日本語の拒否'`]);
    // forEachChild が配列を返して走査が打ち切られないこと。
    for (const expr of [`EN ? 'English' : '日本語の拒否'`, `x ?? '日本語の拒否'`, `flag && '日本語の拒否'`]) {
      const out = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(flag:boolean, x?: string|null){ throw new Error(${expr}); }\n` });
      expect(out.frozen, expr).toHaveLength(1);
    }
  });

  it('freezes other user-visible Japanese text such as tooltips, labels and JSX text', () => {
    const tooltip = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }){ b.setTooltip('日本語のヒント'); }\n` });
    expect(tooltip.frozen).toEqual([`${BRIDGE} | setTooltip | '日本語のヒント'`]);
    // EN ? 'English' : '日本語' の対訳ペアは望ましい形なので検出しない。
    const bilingual = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }){ b.setTooltip(EN ? 'English hint' : '日本語のヒント'); }\n` });
    expect(bilingual.frozen).toEqual([]);
    const jsxText = scan({ [PANEL]: PANEL_SRC + `\nexport function Extra(){ return <h2>日本語の見出し</h2>; }\n` });
    expect(jsxText.frozen).toContain(`${PANEL} | jsx-text | "日本語の見出し"`);
    const jsxAttr = scan({ [PANEL]: PANEL_SRC + `\nexport function Extra(){ return <button aria-label="日本語のラベル" />; }\n` });
    expect(jsxAttr.frozen).toContain(`${PANEL} | jsx:aria-label | "日本語のラベル"`);
    // 現状の実コードはガイドページ（英語版が別ファイル）だけを明示的に除外して空。
    const found = scan();
    expect(found.frozen).toEqual([]);
    expect(found.skipped.length, 'skipped entries are reported separately').toBeGreaterThan(0);
    for (const entry of found.skipped) expect(skippedFiles, entry).toContain(entry.split(' | ')[0]);
    expect(uiTextAllowlist.entries).toEqual([]);
    for (const file of skippedFiles) {
      expect(found.files, file).toContain(file);
      expect(uiTextAllowlist.files[file].length, `${file} needs a reason`).toBeGreaterThan(20);
      expect(readFileSync(file, 'utf8'), file).toMatch(japanese);
    }
  });

  it('only skips language-switch ternaries and t() when scanning visible text', () => {
    // 言語フラグ以外の三項は通常どおり検出する。
    const both = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }, flag: boolean){ b.setTooltip(flag ? '日本語A' : '日本語B'); }\n` });
    expect(both.frozen).toHaveLength(2);
    const partial = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }, n: number){ b.setTooltip(n > 0 ? 'OK' : '日本語'); }\n` });
    expect(partial.frozen).toHaveLength(1);
    expect(partial.frozen[0]).toContain('日本語');
    const bilingual = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }, flag: boolean){ b.setTooltip(EN ? 'Hint' : '日本語'); }\n` });
    expect(bilingual.frozen).toEqual([]);
    // t('日本語','English') は対訳ヘルパー経由なので除外（テンプレート内も同様）。
    const helper = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }, e: string){ b.setTooltip(t('日本語','English')); }\n` });
    expect(helper.frozen).toEqual([]);
    const templated = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setTooltip(t: string): void }, e: string){ b.setTooltip(\`\${t('日本語','English')}: \${e}\`); }\n` });
    expect(templated.frozen).toEqual([]);
  });

  it('scans direct DOM text assignments (textContent, innerText, document.title)', () => {
    const text = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(e: HTMLElement){ e.textContent = '日本語テキスト'; }\n` });
    expect(text.frozen).toEqual([`${BRIDGE} | textContent | '日本語テキスト'`]);
    const title = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ document.title = '日本語のタイトル'; }\n` });
    expect(title.frozen).toEqual([`${BRIDGE} | title | '日本語のタイトル'`]);
    // 対訳式と変数は対象外。
    for (const code of [`e.textContent = EN ? 'English' : '日本語';`, `document.title = t('日本語','English');`, `e.textContent = value;`]) {
      const out = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(e: HTMLElement, value: string){ ${code} }\n` });
      expect(out.frozen, code).toEqual([]);
    }
  });

  it('scans JSX expression containers and dialog/alert text', () => {
    const expr = scan({ [PANEL]: PANEL_SRC + `\nexport function Extra(){ return <div>{'日本語テキスト'}</div>; }\n` });
    expect(expr.frozen).toContain(`${PANEL} | jsx-expr | '日本語テキスト'`);
    const translated = scan({ [PANEL]: PANEL_SRC + `\nexport function Extra(){ return <div>{t('日本語','English')}</div>; }\n` });
    expect(translated.frozen).toEqual([]);
    const switched = scan({ [PANEL]: PANEL_SRC + `\nexport function Extra(){ return <div>{EN ? 'English' : '日本語'}</div>; }\n` });
    expect(switched.frozen).toEqual([]);
    for (const [call, code] of [['setWarningText', `b.setWarningText('日本語の警告')`], ['alert', `window.alert('日本語の警告')`], ['confirm', `window.confirm('日本語の確認')`]] as const) {
      const out = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { setWarningText(t: string): void }){ ${code}; }\n` });
      expect(out.frozen.join(' | '), call).toContain(`${call} | '日本語の`);
    }
  });

  it('gives every block a tooltip, with English hints to arithmetic, list and event blocks', () => {
    const ws = new Blockly.Workspace();
    try {
      const types = Object.keys(Blockly.Blocks).filter(t => t.startsWith('sp_'));
      expect(types.length).toBeGreaterThanOrEqual(44);
      const missing = types.filter(t => {
        const block = ws.newBlock(t);
        const tip = (block as unknown as { tooltip?: string }).tooltip;
        block.dispose();
        return !tip;
      });
      expect(missing).toEqual([]);
    } finally { ws.dispose(); }
    for (const type of ['sp_add', 'sp_div', 'sp_list_add', 'sp_while', 'sp_on_flag', 'sp_index']) expect(BLOCK_TIPS[type], type).toBeDefined();
    for (const [type, [ja, en]] of Object.entries(BLOCK_TIPS)) {
      expect(ja, type).toBeTruthy();
      expect(en, type).not.toMatch(japanese);
    }
    // 動的カテゴリの登録は BlocklyPanel 側で行う（defs の重複実装は削除済み）。
    expect(readFileSync('src/app/components/BlocklyPanel.tsx', 'utf8')).toContain("registerToolboxCategoryCallback('SP_USER'");
    expect(readFileSync('src/app/blockly/defs.ts', 'utf8')).not.toContain('registerUserCategory');
  });

  it('keeps every bridge message bilingual and parameter-complete per call', () => {
    for (const [id, pair] of Object.entries(BRIDGE_MESSAGES)) {
      expect(pair.ja, id).toBeTruthy();
      expect(pair.en, id).not.toMatch(japanese);
      const holes = (text: string) => [...text.matchAll(/\{(p\d+)\}/g)].map(m => m[1]).sort();
      expect(holes(pair.en), id).toEqual(holes(pair.ja));
      for (const hole of holes(pair.ja)) expect(formatBridgeMessage(id, { [hole]: 'X' }, 'en'), id).toContain('X');
    }
    for (const call of scan().calls) {
      expect(BRIDGE_MESSAGES[call.id], `${call.file}:${call.line}`).toBeDefined();
      for (const hole of BRIDGE_MESSAGES[call.id].ja.matchAll(/\{(p\d+)\}/g)) expect(call.keys, `${call.file}:${call.line} ${call.id}`).toContain(hole[1]);
    }
    expect(formatBridgeMessage('blockly.unconnected', {}, 'en')).toBe('Connect the unconnected block inside a target, or delete it.');
    expect(formatBridgeMessage('blockly.customCallTooltip', { p0: 'jump' }, 'en')).toBe('Calls the custom block "jump".');
    expect(formatBridgeMessage('blockly.unknown', {}, 'en')).toBeUndefined();
  });

  it('rejects unknown ids, missing parameters and Japanese literal parameter values', () => {
    const missingParam = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ throw new BlocklyReject('blockly.expression'); }\n` });
    expect(missingParam.errors.join(' ')).toContain('blockly.expression is missing {p0}');
    const unknownId = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ throw new BlocklyReject('blockly.nope'); }\n` });
    expect(unknownId.errors.join(' ')).toContain('unknown bridge message id blockly.nope');
    const badCode = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ throw new BlocklyReject(code()); }\n` });
    expect(badCode.errors.join(' ')).toContain('bridge reject code must be a literal');
    const japaneseParam = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(){ throw new BlocklyReject('blockly.expression', { p0: '日本語ブロック' }); }\n` });
    expect(japaneseParam.errors.join(' ')).toContain('bridge reject parameter p0 must not be a Japanese literal');
    // 識別子や利用者入力は自由（現状の p0 はすべてこの形）。
    const identifierParam = scan({ [BRIDGE]: BRIDGE_SRC + `\nexport function extra(b: { type: string }){ throw new BlocklyReject('blockly.expression', { p0: b.type }); }\n` });
    expect(identifierParam.errors).toEqual([]);
  });

  it('reports an unconnected block in English through the Blockly panel path', () => {
    const ws = new Blockly.Workspace();
    try {
      ws.newBlock('sp_assign');
      let error: unknown;
      try { workspaceToAst(ws); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(BlocklyReject);
      expect((error as BlocklyReject).code).toBe('blockly.unconnected');
      expect((error as Error).message).toContain('未接続のブロック');
      expect(englishBridgeError(error)).toBe('Connect the unconnected block inside a target, or delete it.');
      expect(englishBridgeError(error)).not.toMatch(japanese);
      expect(englishError(error)).toBe('Connect the unconnected block inside a target, or delete it.');
      expect(englishBridgeError(new Error('Blockly internal failure'))).toBe('Blockly internal failure');
    } finally { ws.dispose(); }
  });
});

describe('English samples and shared formatters', () => {
  it('localizes every sample into Japanese-free English code, longest pattern first', () => {
    for (const sample of SAMPLES) {
      const en = localizeSampleFor(sample.code, true);
      expect(en, sample.title).not.toMatch(japanese);
      expect(analyzeText(en).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(localizeSampleFor(sample.code, false)).toBe(sample.code);
    }
    const submarine = SAMPLES.find(s => s.code.includes('全部見つけた'))!.code;
    const en = localizeSampleFor(submarine, true);
    expect(en).toContain('say("You found them all!", 2)');
    expect(en).not.toContain('Found: すごい!');
    expect(localizeSampleFor(submarine, false)).toContain('全部見つけた! すごい!');
    expect(typeof localizeSample(submarine)).toBe('string');
  });

  it('translates the fallback .sb3 failure code and honours the formatter language', () => {
    expect(DIAGNOSTIC_MESSAGES['sb3.unknown'].en).toBe('Could not load the .sb3 file.');
    expect(englishError(new Sb3ParseError('日本語のメッセージ'))).toBe('Could not load the .sb3 file.');
    expect(englishError(new Sb3ParseError('日本語のメッセージ'))).not.toMatch(japanese);
    const lost = { type: 'unsupported', opcode: 'looks_unknown', json: '{}' } as unknown as Stmt;
    expect(printStmts([lost], 0, 'en')[0]).toBe('# [Unsupported block] opcode=looks_unknown (this block will be lost when re-exported to .sb3)');
    expect(printStmts([lost], 0)[0]).toContain('変換不可ブロック');
    expect(formatText('stage:\n    pass\n', 'en').text).toBe('stage:\n    pass\n');
    expect(formatText('stage:\n    pass\n', 'en')).toEqual(formatText('stage:\n    pass\n'));
  });

  it('gives every custom block tooltip in defs.ts an English text', () => {
    const defs = readFileSync('src/app/blockly/defs.ts', 'utf8');
    expect(defs).not.toMatch(/setTooltip\(EN \? ''/);
    const tips = [...defs.matchAll(/setTooltip\(EN \? '([^']*)'/g)].map(m => m[1]);
    expect(tips.length).toBeGreaterThanOrEqual(12);
    for (const tip of tips) {
      expect(tip.trim().length, tip).toBeGreaterThan(0);
      expect(tip, tip).not.toMatch(japanese);
    }
    expect(readFileSync('src/app/blockly/bridge.ts', 'utf8')).toContain('blockly.customCallTooltip');
    expect(readFileSync('src/app/blockly/bridge.ts', 'utf8')).not.toContain('カスタムブロック「');
  });
});
