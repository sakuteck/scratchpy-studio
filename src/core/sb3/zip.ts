/**
 * .sb3 (ZIP) の読み書き — fflate 使用
 */

import { diag, diagnosticFields, type DiagnosticMessage, type DiagnosticParams } from '../lang/diagnostics';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

/** 取り込み上限。他人が作った .sb3 でタブを落とさないための最低限の防御。 */
export const MAX_SB3_BYTES = 50 * 1024 * 1024;      // 圧縮後 50 MB
export const MAX_SB3_ENTRIES = 2000;
/**
 * 展開後合計。Scratch の .sb3 は通常数 MB〜十数 MB なので、モバイルでも現実的な 64 MB で打ち切る
 * （v1.0.15: 128 MB でも上限内の 100 MB は通ってしまい重かった）。
 */
export const MAX_SB3_UNZIPPED = 64 * 1024 * 1024;
/** project.json 単体の上限。JSON はブロック定義の入れ子で肥大しやすいため個別に見る。 */
export const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024;
export function formatMb(bytes: number): string { return `${Math.round(bytes / (1024 * 1024))} MB`; }
/** 読み込み前のファイルサイズ検査（巨大ファイルをメモリに載せる前に止める）。 */
export function assertSb3Size(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MAX_SB3_BYTES) throw new Sb3ParseError(diag('zip.tooLarge', { p0: formatMb(MAX_SB3_BYTES) }));
}
import { SB3Project } from './model';

export interface Sb3Contents {
  project: SB3Project;
  /** ファイル名(md5ext) → バイナリ */
  files: Map<string, Uint8Array>;
  fileNames: string[];
}

export class Sb3ParseError extends Error {
  code: string;
  params?: DiagnosticParams;
  constructor(input: string | DiagnosticMessage) {
    const fields = diagnosticFields(input, 'sb3.unknown');
    super(fields.message);
    this.name = 'Sb3ParseError';
    this.code = fields.code;
    this.params = fields.params;
  }
}

export interface Sb3Limits { maxBytes?:number; maxEntries?:number; maxUnzipped?:number; maxProjectJson?:number }
/** .sb3 バイト列 → project.json + アセット（上限はテストから差し替え可能） */
export function loadSb3(bytes: Uint8Array, limits: Sb3Limits = {}): Sb3Contents {
  const maxBytes = limits.maxBytes ?? MAX_SB3_BYTES, maxEntries = limits.maxEntries ?? MAX_SB3_ENTRIES,
    maxUnzipped = limits.maxUnzipped ?? MAX_SB3_UNZIPPED, maxProjectJson = limits.maxProjectJson ?? MAX_PROJECT_JSON_BYTES;
  if (bytes.byteLength > maxBytes) throw new Sb3ParseError(diag('zip.tooLarge', { p0: formatMb(maxBytes) }));
  let unzipped: Record<string, Uint8Array>;
  let expanded = 0, entries = 0;
  try {
    // filter は展開しながら呼ばれるため、上限に達した時点で例外にして打ち切る。
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        expanded += file.originalSize;
        if (entries > maxEntries) throw new Sb3ParseError(diag('zip.tooManyEntries', { p0: String(maxEntries) }));
        if (expanded > maxUnzipped) throw new Sb3ParseError(diag('zip.expandsTooMuch', { p0: formatMb(maxUnzipped) }));
        // project.json 単体の上限（アセットは合計上限で見る）。
        if (/project\.json$/i.test(file.name) && file.originalSize > maxProjectJson)
          throw new Sb3ParseError(diag('zip.projectJsonTooLarge', { p0: formatMb(maxProjectJson) }));
        return true;
      },
    });
  } catch (e) {
    if (e instanceof Sb3ParseError) throw e;
    throw new Sb3ParseError(diag('zip.unzip'));
  }
  const names = Object.keys(unzipped);
  const projectJsonName = names.find(n => n === 'project.json')
    ?? names.find(n => n.endsWith('project.json'))
    ?? names.find(n => n.endsWith('.json'));
  if (!projectJsonName) {
    throw new Sb3ParseError(diag('zip.noProject'));
  }
  let project: SB3Project;
  try {
    project = JSON.parse(strFromU8(unzipped[projectJsonName]));
  } catch (e) {
    throw new Sb3ParseError(diag('zip.badJson'));
  }
  const files = new Map<string, Uint8Array>();
  for (const n of names) {
    if (n !== projectJsonName) files.set(n, unzipped[n]);
  }
  return { project, files, fileNames: names };
}

/** project.json + アセット → .sb3 バイト列 */
/** 安全なアセット名だけを ZIP に入れる（`__proto__` 等は fflate 側で壊れるため除外する）。 */
export const SAFE_ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNSAFE_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
export function isSafeAssetName(name: string): boolean {
  return SAFE_ASSET_NAME.test(name) && !UNSAFE_NAMES.has(name);
}
export interface Sb3SaveResult {
  bytes: Uint8Array;
  /** 安全でない名前のため書き出さなかったアセット名（無言で捨てない）。 */
  skipped: string[];
}
/**
 * .sb3 を組み立て、除外したアセット名も返す。
 * 外部由来の名前（__proto__ / パス区切り）は ZIP に入れないが、黙って落とさず呼び出し側へ伝える。
 */
export function saveSb3Report(project: SB3Project, assets: Map<string, Uint8Array>): Sb3SaveResult {
  // 外部由来の名前（__proto__ など）でプロトタイプを汚さない。
  const data = Object.create(null) as Record<string, Uint8Array>;
  data['project.json'] = strToU8(JSON.stringify(project));
  const skipped: string[] = [];
  for (const [name, bytes] of assets) {
    if (!isSafeAssetName(name)) { skipped.push(name); continue; }
    data[name] = bytes;
  }
  return { bytes: zipSync(data, { level: 6 }), skipped };
}
/** 後方互換の入口。除外名も知りたい場合は saveSb3Report を使う。 */
export function saveSb3(project: SB3Project, assets: Map<string, Uint8Array>): Uint8Array {
  return saveSb3Report(project, assets).bytes;
}
