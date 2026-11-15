import { diag, diagnosticFields, type DiagnosticMessage } from '../lang/diagnostics';
/**
 * project.json 構造バリデータ
 * -----------------------------
 * エクスポート結果(または読み込んだ .sb3)が Scratch の期待する
 * 不変条件を満たしているかを検証する。テストと UI の両方から使う。
 */

import { SB3Project, SB3Target, SB3Block, HAT_OPCODES, isReporterOpcode } from './model';
import { md5Bytes } from './md5';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
  code: string;
  params?: import('../lang/diagnostics').DiagnosticParams;
}

export function validateProject(project: SB3Project, assets?: Map<string, Uint8Array>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: DiagnosticMessage) => issues.push({ severity: 'error', path, ...diagnosticFields(message, 'validation') });
  const warn = (path: string, message: DiagnosticMessage) => issues.push({ severity: 'warning', path, ...diagnosticFields(message, 'validation') });

  if (!project || typeof project !== 'object') { err('$', diag('validation.object', {})); return issues; }
  if (!Array.isArray(project.targets) || project.targets.length === 0) {
    err('$.targets', diag('validation.targetsEmpty', {})); return issues;
  }
  const stages = project.targets.filter(t => t.isStage);
  if (stages.length !== 1) err('$.targets', diag('validation.stages', {p0: String(stages.length)}));
  if (project.targets[0]?.isStage !== true) warn('$.targets[0]', diag('validation.stageFirst', {}));

  const targetNames = new Set<string>();
  project.targets.forEach((t, ti) => {
    const tp = `$.targets[${ti}]`;
    if (targetNames.has(t.name)) err(`${tp}.name`, diag('validation.duplicateTarget', {p0: String(t.name)}));
    targetNames.add(t.name);
    if (!t.name) err(`${tp}.name`, diag('validation.emptyTarget', {}));
    validateTarget(t, tp, issues, project, assets);
  });

  // モニター
  for (const [mi, m] of (project.monitors ?? []).entries()) {
    if (!m.id) err(`$.monitors[${mi}]`, diag('validation.monitorId', {}));
    if (!['default', 'large', 'slider', 'list'].includes(m.mode)) {
      err(`$.monitors[${mi}].mode`, diag('validation.monitorMode', {p0: String(m.mode)}));
    }
  }
  return issues;
}

function validateTarget(
  t: SB3Target, tp: string, issues: ValidationIssue[],
  project: SB3Project, assets?: Map<string, Uint8Array>,
): void {
  const err = (path: string, message: DiagnosticMessage) => issues.push({ severity: 'error', path, ...diagnosticFields(message, 'validation') });
  const warn = (path: string, message: DiagnosticMessage) => issues.push({ severity: 'warning', path, ...diagnosticFields(message, 'validation') });

  // コスチューム/サウンド
  if (!Array.isArray(t.costumes) || t.costumes.length === 0) err(`${tp}.costumes`, diag('validation.costumes', {}));
  if (t.currentCostume < 0 || t.currentCostume >= (t.costumes?.length ?? 0)) {
    err(`${tp}.currentCostume`, diag('validation.costumeRange', {p0: String(t.currentCostume)}));
  }
  for (const [ci, c] of (t.costumes ?? []).entries()) {
    const cp = `${tp}.costumes[${ci}]`;
    if (!c.assetId || !c.md5ext) err(cp, diag('validation.assetFields', {}));
    if (c.assetId && c.md5ext && !c.md5ext.startsWith(c.assetId)) {
      err(`${cp}.md5ext`, diag('validation.assetName', {}));
    }
    if (assets && c.md5ext) {
      const bytes = assets.get(c.md5ext);
      if (!bytes) err(`${cp}.md5ext`, diag('validation.assetMissing', {p0: String(c.md5ext)}));
      else {
        const md5 = md5Bytes(bytes);
        if (md5 !== c.assetId) err(`${cp}.assetId`, diag('validation.assetMd5', {p0: String(c.assetId), p1: String(md5)}));
      }
    }
  }
  for (const [si, s] of (t.sounds ?? []).entries()) {
    const sp = `${tp}.sounds[${si}]`;
    if (assets && s.md5ext && !assets.has(s.md5ext)) err(sp, diag('validation.assetMissing', {p0: String(s.md5ext)}));
  }

  // ブロックグラフ
  const blocks = t.blocks ?? {};
  const ids = new Set(Object.keys(blocks));
  for (const [id, b] of Object.entries(blocks)) {
    const bp = `${tp}.blocks.${id}`;
    if (!b.opcode) { err(bp, diag('validation.opcode', {})); continue; }
    // next/parent の実在
    if (b.next !== null && b.next !== undefined && !ids.has(b.next)) {
      err(`${bp}.next`, diag('validation.next', {p0: String(b.next)}));
    }
    if (b.parent !== null && b.parent !== undefined && !ids.has(b.parent)) {
      err(`${bp}.parent`, diag('validation.parent', {p0: String(b.parent)}));
    }
    // next の親は自分
    if (b.next && blocks[b.next] && blocks[b.next].parent !== id) {
      err(`${bp}.next`, diag('validation.nextParent', {p0: String(id), p1: String(blocks[b.next].parent)}));
    }
    // topLevel 整合
    if (b.topLevel && b.parent) err(bp, diag('validation.topLevelParent', {}));
    if (!b.topLevel && !b.parent && !b.shadow) warn(bp, diag('validation.noParent', {}));
    if (b.topLevel && (b.x === undefined || b.y === undefined)) warn(bp, diag('validation.topLevelPosition', {}));
    // shadow ブロックは topLevel になれない
    if (b.shadow && b.topLevel) err(bp, diag('validation.shadowTopLevel', {}));

    // inputs の参照
    for (const [iname, input] of Object.entries(b.inputs ?? {})) {
      const ip = `${bp}.inputs.${iname}`;
      if (!Array.isArray(input)) { err(ip, diag('validation.inputArray', {})); continue; }
      const mode = input[0];
      if (![1, 2, 3].includes(mode)) { err(ip, diag('validation.inputMode', {p0: String(mode)})); continue; }
      checkInputValue(input[1], ip, ids, blocks, err);
      if (mode === 3) {
        checkInputValue((input as unknown[])[2], `${ip}(shadow)`, ids, blocks, err);
      }
      if (mode === 2 && input[1] && typeof input[1] === 'string' && blocks[input[1] as string]) {
        if (blocks[input[1] as string].parent !== id) {
          err(ip, diag('validation.substackParent', {p0: String(id)}));
        }
      }
      if (typeof input[1] === 'string' && blocks[input[1]] && mode !== 2) {
        // shadow/実ブロック参照 → parent はこのブロック
        if (!blocks[input[1]].parent) err(ip, diag('validation.inputParent', {p0: String(input[1])}));
      }
    }
    // 変数/リスト field の id 整合
    for (const [fname, f] of Object.entries(b.fields ?? {})) {
      if ((fname === 'VARIABLE') && f[1]) {
        if (!findVarInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, diag('validation.variableId', {p0: String(f[1]), p1: String(f[0])}));
        }
      }
      if ((fname === 'LIST') && f[1]) {
        if (!findListInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, diag('validation.listId', {p0: String(f[1])}));
        }
      }
      if (fname === 'BROADCAST_OPTION' && f[1]) {
        if (!findBroadcastInProject(project, String(f[1]))) {
          err(`${bp}.fields.${fname}`, diag('validation.broadcastId', {p0: String(f[1])}));
        }
      }
    }
    // mutation
    if (b.opcode === 'procedures_prototype' || b.opcode === 'procedures_call') {
      if (!b.mutation) err(bp, diag('validation.procedureMutation', {}));
      else {
        if (typeof b.mutation.proccode !== 'string') err(`${bp}.mutation`, diag('validation.procedureCode', {}));
        if (typeof b.mutation.argumentids !== 'string') err(`${bp}.mutation`, diag('validation.procedureArgs', {}));
      }
    }
    if (b.opcode === 'control_stop' && !b.mutation) warn(bp, diag('validation.stopMutation', {}));
  }

  // ハットから到達できない非 shadow ブロックの検出(警告)
  const reachable = new Set<string>();
  const walk = (id: string | null | undefined) => {
    if (!id || reachable.has(id) || !blocks[id]) return;
    reachable.add(id);
    const b = blocks[id];
    walk(b.next);
    for (const input of Object.values(b.inputs ?? {})) {
      const v = input?.[1];
      if (typeof v === 'string') walk(v);
    }
  };
  for (const [id, b] of Object.entries(blocks)) {
    if (b.topLevel) walk(id);
  }
  for (const [id, b] of Object.entries(blocks)) {
    if (!reachable.has(id) && !b.shadow) {
      // shadow メニューは input 参照から到達しているはず
      warn(`${tp}.blocks.${id}`, diag('validation.unreachableBlock', {p0: String(b.opcode)}));
    }
  }
}

function checkInputValue(
  v: unknown, path: string, ids: Set<string>, blocks: Record<string, SB3Block>,
  err: (p: string, m: DiagnosticMessage) => void,
): void {
  if (v === null || v === undefined) return; // obscured shadow なしは許容
  if (typeof v === 'string') {
    if (!ids.has(v)) err(path, diag('validation.missingBlock', {p0: String(v)}));
    return;
  }
  if (Array.isArray(v)) {
    const kind = v[0];
    if (![4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(kind)) {
      err(path, diag('validation.literalKind', {p0: String(kind)}));
      return;
    }
    if ([11, 12, 13].includes(kind) && v.length < 3) {
      err(path, diag('validation.literalFields', {p0: String(kind)}));
    }
    return;
  }
  err(path, diag('validation.inputType', {}));
}

function findVarInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.variables ?? {}));
}
function findListInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.lists ?? {}));
}
function findBroadcastInProject(project: SB3Project, id: string): boolean {
  return project.targets.some(t => id in (t.broadcasts ?? {}));
}
