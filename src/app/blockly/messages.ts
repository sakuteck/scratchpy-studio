/**
 * Blockly ブリッジ（UI 層）の拒否メッセージ辞書。
 * 変換器の辞書 (core/lang/diagnostics.ts) とは用途が違うため分けている。
 * bridge.ts はコードとパラメータだけを投げ、表示側が言語を選ぶ。
 */
import type { DiagnosticParams } from '../../core/lang/diagnostics';

export const BRIDGE_MESSAGES: Record<string, { ja: string; en: string }> = {
  'blockly.oneStage': {
    ja: 'ステージは1つだけにしてください',
    en: 'Use exactly one stage.',
  },
  'blockly.commentLinked': {
    ja: 'トップレベルのコメントには他のブロックをつなげられません',
    en: 'A top-level comment cannot have blocks connected to it.',
  },
  'blockly.unconnected': {
    ja: '未接続のブロックをターゲット内につなぐか削除してください',
    en: 'Connect the unconnected block inside a target, or delete it.',
  },
  'blockly.unsupportedTopLevel': {
    ja: '未対応ブロックはターゲット直下に置けません',
    en: 'An unsupported block cannot be placed directly under a target.',
  },
  'blockly.topLevelBlock': {
    ja: '「{p0}」はステージやスプライトの直下には置けません。イベントの中につないでください。',
    en:'"{p0}" cannot be placed directly under the stage or a sprite. Connect it inside an event.',
  },
  'blockly.listInitial': {
    ja: 'リストの初期値にはリスト作成ブロックを使ってください',
    en: 'Use the list creation block as a list initial value.',
  },
  'blockly.customCallTooltip': {
    ja: 'カスタムブロック「{p0}」を呼び出します',
    en: 'Calls the custom block "{p0}".',
  },
  'blockly.expression': {
    ja: '式ブロック「{p0}」はコードに変換できません',
    en: 'The expression block "{p0}" cannot be converted to code.',
  },
};

export function formatBridgeMessage(code: string, params: DiagnosticParams = {}, lang: 'ja' | 'en' = 'ja'): string | undefined {
  const template = BRIDGE_MESSAGES[code]?.[lang];
  return template?.replace(/\{(p\d+)\}/g, (_, key: string) => String(params[key] ?? ''));
}

/** 表示言語に依存せず、コードとパラメータだけを持つ例外。 */
export class BlocklyReject extends Error {
  readonly code: string;
  readonly params: DiagnosticParams;
  constructor(code: string, params: DiagnosticParams = {}) {
    super(formatBridgeMessage(code, params, 'ja') ?? code);
    this.name = 'BlocklyReject';
    this.code = code;
    this.params = params;
  }
}

/** 英語 UI 用。未知の例外（Blockly 本体など）は原文のまま返す。 */
export function englishBridgeError(error: unknown): string {
  if (error instanceof BlocklyReject) return formatBridgeMessage(error.code, error.params, 'en') ?? error.message;
  return error instanceof Error ? error.message : String(error);
}
