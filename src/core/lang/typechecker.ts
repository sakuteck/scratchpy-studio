import { diag, diagnosticFields, type DiagnosticMessage } from './diagnostics';
import { reporterMonitorForKey, REPORTER_MONITORS } from './monitors';
/**
 * ScratchPy 静的型チェッカ
 * -------------------------
 * - 変数・引数の型宣言と使用箇所の整合性チェック
 * - 組み込み関数の引数型・個数・メニュー値の検証
 * - 名前の解決(ローカル変数 / グローバル変数 / パラメータ / プロパティ / スプライト参照)
 * - 解決結果(Resolution)をエクスポート処理と共有
 *
 * エラーメッセージは全て日本語(学習者向け)。
 */

import {
  Program, SpriteDef, StageDef, VarDecl, ListDecl, EventDef, FuncDef, Stmt, Expr,
  SPType, PrimitiveTypeKind, Diagnostic, Loc, BodyItem, typeToString, T_INT, T_FLOAT, T_STR, T_BOOL, T_ANY, listOf,
  CommentStmt, PassStmt,
} from './ast';
import {
  BUILTINS, PROPERTIES, MENUS, SENSING_OF_PROPS, BuiltinDef, ParamSpec, TargetKind,
} from './builtins';

// ---------------------------------------------------------------------------
// 解決モデル
// ---------------------------------------------------------------------------
export type VarEntity = {
  entity: 'var';
  decl: VarDecl;
  owner: string;              // 宣言されているターゲット名
  scope: 'global' | 'local';  // stage 宣言 = global
};
export type ListEntity = {
  entity: 'list';
  decl: ListDecl;
  owner: string;
  scope: 'global' | 'local';
};
export type ParamEntity = { entity: 'param'; param: { name: string; paramType: SPType } };
export type PropertyEntity = { entity: 'property'; prop: string };

export type NameResolution = VarEntity | ListEntity | ParamEntity | PropertyEntity;

export interface ProjectContext {
  stageName: string;
  spriteNames: string[];
  stageVars: Map<string, VarEntity>;
  stageLists: Map<string, ListEntity>;
  spriteVars: Map<string, Map<string, VarEntity>>;
  spriteLists: Map<string, Map<string, ListEntity>>;
  spriteDefs: Map<string, Map<string, FuncDef>>;
  costumes: Map<string, string[]>;    // target名 → コスチューム名
  sounds: Map<string, string[]>;
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  ok: boolean;                       // エラーなし
  ctx: ProjectContext;
  resolutions: Map<Expr, NameResolution>;
  usesPen: boolean;
  broadcasts: Set<string>;           // 使用されたメッセージ名(リテラル)
}

// ---------------------------------------------------------------------------
// 型ユーティリティ
// ---------------------------------------------------------------------------
export function isNum(t: SPType): boolean { return t.kind === 'int' || t.kind === 'float' || t.kind === 'any'; }
export function isBoolish(t: SPType): boolean { return t.kind === 'bool' || t.kind === 'any'; }

/** 代入互換: value の型を target の型に代入できるか */
export function assignable(target: SPType, value: SPType): boolean {
  if (target.kind === 'any' || value.kind === 'any') return true;
  if (target.kind === 'float' && value.kind === 'int') return true;
  if (target.kind === 'list' && value.kind === 'list') return assignable(target.of, value.of);
  if (target.kind === 'list' || value.kind === 'list') return false;
  return target.kind === value.kind;
}

function joinTypes(types: SPType[]): SPType {
  // 数値系の共通型を求める
  let hasInt = false, hasFloat = false, hasStr = false, hasBool = false, hasAny = false, list: SPType | null = null;
  for (const t of types) {
    switch (t.kind) {
      case 'int': hasInt = true; break;
      case 'float': hasFloat = true; break;
      case 'str': hasStr = true; break;
      case 'bool': hasBool = true; break;
      case 'any': hasAny = true; break;
      case 'list': list = t; break;
    }
  }
  if (hasAny) return T_ANY;
  if (list) return list;
  const kinds = [hasInt && 'int', hasFloat && 'float', hasStr && 'str', hasBool && 'bool'].filter(Boolean) as string[];
  if (kinds.length === 1) return { kind: kinds[0] as PrimitiveTypeKind };
  if (hasInt && hasFloat) return T_FLOAT;
  return T_ANY; // 混在(エラーは呼び出し側で報告済み)
}

// ---------------------------------------------------------------------------
// チェッカ本体
// ---------------------------------------------------------------------------
interface TargetScope {
  targetName: string;
  isStage: boolean;
  localVars: Map<string, VarEntity>;
  localLists: Map<string, ListEntity>;
  defs: Map<string, FuncDef>;
  params: Map<string, SPType> | null;  // def 内でのみ非 null
}

class Checker {
  diags: Diagnostic[] = [];
  resolutions = new Map<Expr, NameResolution>();
  broadcasts = new Set<string>();
  usesPen = false;
  ctx: ProjectContext;
  scope!: TargetScope;

  constructor(private program: Program) {
    const stageName = program.stage?.name ?? 'Stage';
    this.ctx = {
      stageName,
      spriteNames: program.sprites.map(s => s.name),
      stageVars: new Map(), stageLists: new Map(),
      spriteVars: new Map(), spriteLists: new Map(),
      spriteDefs: new Map(),
      costumes: new Map(), sounds: new Map(),
    };
  }

  private err(message: string | DiagnosticMessage, loc?: Loc, code = 'type') {
    this.diags.push({ severity: 'error', loc, ...diagnosticFields(message, code) });
  }
  private warn(message: string | DiagnosticMessage, loc?: Loc) {
    this.diags.push({ severity: 'warning', loc, ...diagnosticFields(message, 'warn') });
  }

  run(): CheckResult {
    const names = new Set<string>([this.ctx.stageName]);
    for (const sp of this.program.sprites) {
      if (!sp.name.trim()) this.err(diag("name.emptySprite", {}), sp.loc);
      if (names.has(sp.name)) this.err(diag("name.duplicateTarget", {p0: String(sp.name)}), sp.loc);
      names.add(sp.name);
    }
    this.collectDeclarations();
    if (this.program.stage) this.checkTarget(this.program.stage);
    for (const sp of this.program.sprites) this.checkTarget(sp);
    this.diags.sort((a, b) => (a.loc?.line ?? 0) - (b.loc?.line ?? 0) || (a.loc?.col ?? 0) - (b.loc?.col ?? 0));
    return {
      diagnostics: this.diags,
      ok: !this.diags.some(d => d.severity === 'error'),
      ctx: this.ctx,
      resolutions: this.resolutions,
      usesPen: this.usesPen,
      broadcasts: this.broadcasts,
    };
  }

  // --- 宣言収集フェーズ ----------------------------------------------------
  private collectDeclarations(): void {
    const stage = this.program.stage;
    if (stage) {
      const { vars, lists, costumes, sounds } = this.collectTargetDecls(stage.body, this.ctx.stageName);
      this.ctx.stageVars = vars;
      this.ctx.stageLists = lists;
      this.ctx.costumes.set(this.ctx.stageName, costumes);
      this.ctx.sounds.set(this.ctx.stageName, sounds);
    } else {
      this.ctx.costumes.set(this.ctx.stageName, ['backdrop1']);
    }
    for (const sp of this.program.sprites) {
      const { vars, lists, defs, costumes, sounds } = this.collectTargetDecls(sp.body, sp.name);
      this.ctx.spriteVars.set(sp.name, vars);
      this.ctx.spriteLists.set(sp.name, lists);
      this.ctx.spriteDefs.set(sp.name, defs);
      this.ctx.costumes.set(sp.name, costumes);
      this.ctx.sounds.set(sp.name, sounds);
    }
  }

  private collectTargetDecls(body: BodyItem[], owner: string) {
    const vars = new Map<string, VarEntity>();
    const lists = new Map<string, ListEntity>();
    const defs = new Map<string, FuncDef>();
    const costumes: string[] = [];
    const sounds: string[] = [];
    const isStage = owner === this.ctx.stageName;
    for (const item of body) {
      if (!('decl' in item)) continue;
      if (item.decl === 'var') {
        if (vars.has(item.name)) this.err(diag("var.duplicate", {p0: String(item.name)}), item.loc);
        const ent: VarEntity = { entity: 'var', decl: item, owner, scope: isStage ? 'global' : 'local' };
        vars.set(item.name, ent);
        if (isStage) {
          if (this.ctx.spriteNames.some(n => false)) { /* noop */ }
        }
      } else if (item.decl === 'list') {
        if (lists.has(item.name)) this.err(diag("list.duplicate", {p0: String(item.name)}), item.loc);
        lists.set(item.name, { entity: 'list', decl: item, owner, scope: isStage ? 'global' : 'local' });
      } else if (item.decl === 'costume') {
        if (!item.name.trim()) this.err(diag("name.emptyCostume", {}), item.loc);
        if (costumes.includes(item.name)) this.warn(diag("name.duplicateCostume", {p0: String(item.name)}), item.loc);
        costumes.push(item.name);
      } else if (item.decl === 'sound') {
        sounds.push(item.name);
      } else if (item.decl === 'def') {
        if (defs.has(item.name)) this.err(diag("block.duplicate", {p0: String(item.name)}), item.loc);
        defs.set(item.name, item);
      }
    }
    return { vars, lists, defs, costumes, sounds };
  }

  // --- ターゲット単位のチェック -------------------------------------------
  private checkTarget(target: StageDef | SpriteDef): void {
    const isStage = target.decl === 'stage';
    const targetName = isStage ? this.ctx.stageName : (target as SpriteDef).name;
    this.scope = {
      targetName, isStage,
      localVars: isStage ? this.ctx.stageVars : this.ctx.spriteVars.get(targetName)!,
      localLists: isStage ? this.ctx.stageLists : this.ctx.spriteLists.get(targetName)!,
      defs: isStage ? new Map() : this.ctx.spriteDefs.get(targetName)!,
      params: null,
    };
    const seenMonitorKeys = new Set<string>();
    for (const item of target.body) {
      if (!('decl' in item)) continue;
      if (item.decl === 'config' && reporterMonitorForKey(item.key, isStage)) {
        if (seenMonitorKeys.has(item.key)) this.err(diag("config.duplicate", {p0: String(item.key)}), item.loc);
        seenMonitorKeys.add(item.key);
      }
      switch (item.decl) {
        case 'var': this.checkVarDecl(item, isStage); break;
        case 'list': this.checkListDecl(item, isStage); break;
        case 'config': this.checkConfig(item.key, item.value, isStage, item.loc); break;
        case 'event': this.checkEvent(item, isStage); break;
        case 'def': this.checkDef(item); break;
        default: break;
      }
    }
  }

  private checkVarDecl(v: VarDecl, isStage: boolean): void {
    if (!v.quoted) this.checkNameAllowed(v.name, v.loc);
    if (v.monitor?.mode === 'slider' && (v.monitor.min ?? 0) > (v.monitor.max ?? 100)) this.warn(diag("var.sliderRange", {}), v.loc);
    if (v.cloud && !isStage === false) { /* cloud can be anywhere; Scratch only allows global numeric */ }
    if (v.cloud) {
      if (v.varType.kind !== 'int' && v.varType.kind !== 'float') {
        this.err(diag("var.cloudType", {}), v.loc);
      }
      if (!isStage) this.warn(diag("var.cloudStage", {}), v.loc);
    }
    if (!this.isLiteralInit(v.init)) this.err(diag("var.literalInit", {}), v.init.loc ?? v.loc);
    const initType = this.checkExpr(v.init);
    if (!assignable(v.varType, initType)) {
      this.err(diag("var.initialType", {p0: String(v.name), p1: String(typeToString(v.varType)), p2: String(typeToString(initType))}), v.loc);
    }
    // グローバル変数とスプライト内同名変数のシャドーイング警告
    if (!isStage && this.ctx.stageVars.has(v.name)) {
      this.warn(diag("var.shadowsGlobal", {p0: String(v.name)}), v.loc);
    }
  }

  private checkListDecl(l: ListDecl, isStage: boolean): void {
    if (!l.quoted) this.checkNameAllowed(l.name, l.loc);
    const elemType = l.varType.kind === 'list' ? l.varType.of : T_ANY;
    for (const item of l.init) {
      if (!this.isLiteralInit(item)) this.err(diag("list.literalInit", {}), item.loc ?? l.loc);
      const t = this.checkExpr(item);
      if (!assignable(elemType, t)) {
        this.err(diag("list.initialType", {p0: String(l.name), p1: String(typeToString(elemType)), p2: String(typeToString(t))}), item.loc ?? l.loc);
      }
    }
    if (!isStage && this.ctx.stageLists.has(l.name)) {
      this.warn(diag("list.shadowsGlobal", {p0: String(l.name)}), l.loc);
    }
  }

  private isLiteralInit(e: Expr): boolean {
    return ['num', 'str', 'color', 'bool'].includes(e.type) || (e.type === 'unary' && e.op === '-' && e.operand.type === 'num');
  }

  private checkNameAllowed(name: string, loc?: Loc): void {
    if (BUILTINS[name]) this.err(diag("name.builtin", {p0: String(name)}), loc);
    if (PROPERTIES[name]) this.err(diag('name.propertyReserved', {p0:name, p1:PROPERTIES[name].doc, p2:PROPERTIES[name].docEn}), loc);
    if (this.ctx.spriteNames.includes(name) || name === this.ctx.stageName) {
      this.warn(diag("name.targetCollision", {p0: String(name)}), loc);
    }
  }

  private checkConfig(key: string, value: Expr, isStage: boolean, loc?: Loc): void {
    const numKeys = isStage ? ['tempo', 'video_transparency', 'volume', 'current_costume']
      : ['x', 'y', 'direction', 'size', 'volume', 'current_costume', 'layer_order'];
    const boolKeys = isStage ? [] : ['visible', 'draggable'];
    const strKeys: Record<string, string[]> = isStage
      ? { video_state: ['on', 'off', 'on-flipped'] }
      : { rotation_style: MENUS.rotation_style };
    const monitor = reporterMonitorForKey(key, isStage);
    if (monitor) {
      if (value.type !== 'bool') this.err(diag("config.booleanLiteral", {p0: String(key)}), loc);
    } else if (REPORTER_MONITORS.some(m => m.key === key)) {
      this.err(diag(isStage ? 'config.useSprite' : 'config.useStage', {p0:key}), loc);
    } else if (numKeys.includes(key)) {
      const t = this.checkExpr(value);
      if (!isNum(t)) this.err(diag("config.number", {p0: String(key)}), loc);
      if (key === 'current_costume' && t.kind === 'int') {
        const n = (value as { value?: number }).value;
        const costumes = this.ctx.costumes.get(this.scope.targetName) ?? [];
        if (typeof n === 'number' && costumes.length && (n < 0 || n >= costumes.length)) {
          this.warn(diag("config.costumeRange", {p0: String(n), p1: String(costumes.length - 1)}), loc);
        }
      }
    } else if (boolKeys.includes(key)) {
      const t = this.checkExpr(value);
      if (!isBoolish(t)) this.err(diag("config.boolean", {p0: String(key)}), loc);
    } else if (strKeys[key]) {
      const t = this.checkExpr(value);
      if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("config.string", {p0: String(key)}), loc);
      if (value.type === 'str' && !strKeys[key].includes(value.value)) {
        this.err(diag("config.choice", {p0: String(key), p1: String(strKeys[key].map(s => `"${s}"`).join(' / '))}), loc);
      }
    } else if (key === 'tts_language') {
      this.checkExpr(value);
    } else {
      this.err(diag(isStage ? 'config.unknownStage' : 'config.unknownSprite', {p0:key}), loc);
      this.checkExpr(value);
    }
  }

  private checkEvent(e: EventDef, isStage: boolean): void {
    const hat = e.hat;
    switch (hat.hat) {
      case 'clone':
        if (isStage) this.err(diag("event.cloneStage", {}), hat.loc ?? e.loc);
        break;
      case 'key': {
        const t = this.checkExpr(hat.key);
        if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("event.keyType", {}), hat.loc);
        else if (hat.key.type !== 'str') this.err(diag("event.keyLiteral", {}), hat.loc);
        this.checkMenuValue(hat.key, MENUS.key, null, hat.loc);
        break;
      }
      case 'receive': {
        const t = this.checkExpr(hat.msg);
        if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("event.receiveType", {}), hat.loc);
        if (hat.msg.type === 'str') this.broadcasts.add(hat.msg.value);
        else this.warn(diag("event.receiveLiteral", {}), hat.loc);
        break;
      }
      case 'backdrop': {
        this.checkExpr(hat.name);
        this.checkCostumeName(hat.name, this.ctx.stageName, '背景名', hat.loc);
        break;
      }
      case 'greaterthan': {
        const t = this.checkExpr(hat.value);
        if (!isNum(t)) this.err(diag("event.sensorNumber", {p0: String(hat.sensor)}), hat.loc);
        break;
      }
      default: break;
    }
    this.checkStmts(e.body);
  }

  private checkDef(d: FuncDef): void {
    if (BUILTINS[d.name]) this.err(diag("block.builtinConflict", {p0: String(d.name)}), d.loc);
    if (d.name.includes('%')) this.err(diag("block.percent", {}), d.loc);
    const names = new Set<string>();
    for (const p of d.params) {
      if (names.has(p.name)) this.err(diag("param.duplicate", {p0: String(p.name)}), p.loc);
      names.add(p.name);
      this.checkNameAllowed(p.name, p.loc);
    }
    const saved = this.scope.params;
    this.scope.params = new Map(d.params.map(p => [p.name, p.paramType]));
    this.checkStmts(d.body);
    this.scope.params = saved;
  }

  private checkStmts(stmts: Stmt[]): void {
    for (const s of stmts) this.checkStmt(s);
  }

  private checkStmt(s: Stmt): void {
    switch (s.type) {
      case 'assign': this.checkAssign(s.target, s.value, s.loc); break;
      case 'augassign': {
        const res = this.resolveAssignableName(s.target, s.loc);
        const vt = this.checkExpr(s.value);
        if (res) {
          if (res.entity === 'param') {
            this.err(diag("param.augAssign", {}), s.loc);
          } else if (res.entity === 'var') {
            const declType = res.decl.varType;
            if (declType.kind === 'str' || declType.kind === 'bool' || declType.kind === 'list') {
              this.err(diag("var.augAssignType", {p0: String(res.decl.name), p1: String(typeToString(declType))}), s.loc);
            }
            if (!isNum(vt)) this.err(diag("var.augAssignValue", {p0: String(typeToString(vt))}), s.loc);
          } else {
            this.err(diag("var.augAssignTarget", {}), s.loc);
          }
        }
        break;
      }
      case 'exprstmt': {
        const t = this.checkExpr(s.expr);
        if (s.expr.type === 'call') {
          const b = BUILTINS[s.expr.callee];
          if (b && b.callType === 'reporter') {
            this.err(diag("expression.reporterStatement", {p0: String(s.expr.callee)}), s.loc);
          }
          if (!b && !this.scope.defs.has(s.expr.callee) && !s.expr.method
            && !['var', 'list'].includes(s.expr.callee)) {
            // 未定義関数は checkExpr 側で報告済み
          }
        } else if (t.kind !== 'any') {
          this.warn(diag("expression.noEffect", {}), s.loc);
        }
        break;
      }
      case 'listmethod': this.checkListMethod(s.list, s.method, s.args, s.loc); break;
      case 'wait': {
        const t = this.checkExpr(s.secs);
        if (!isNum(t)) this.err(diag("statement.wait", {}), s.loc);
        break;
      }
      case 'repeat': {
        const t = this.checkExpr(s.count);
        if (!isNum(t)) this.err(diag("statement.repeat", {}), s.loc);
        if (t.kind === 'float') this.warn(diag("statement.fractionalRepeat", {}), s.loc);
        this.checkStmts(s.body);
        break;
      }
      case 'forever': this.checkStmts(s.body); break;
      case 'while': {
        const t = this.checkExpr(s.cond);
        if (!isBoolish(t)) this.err(diag("condition.while", {p0: String(typeToString(t))}), s.loc);
        this.checkStmts(s.body);
        break;
      }
      case 'if': {
        s.branches.forEach((b, i) => {
          if (b.cond) {
            const t = this.checkExpr(b.cond);
            if (!isBoolish(t)) this.err(diag("condition.if", {p0: String(i === 0 ? 'if' : 'elif'), p1: String(typeToString(t))}), b.loc ?? s.loc);
          }
          this.checkStmts(b.body);
        });
        break;
      }
      case 'stop': break; // パーサでリテラル固定
      case 'broadcast': {
        const t = this.checkExpr(s.msg);
        if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("statement.broadcast", {}), s.loc);
        if (s.msg.type === 'str') this.broadcasts.add(s.msg.value);
        break;
      }
      case 'clone': {
        if (this.scope.isStage) this.err(diag("statement.cloneStage", {}), s.loc);
        if (s.action === 'create' && s.target) {
          const t = this.checkExpr(s.target);
          if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("statement.cloneTarget", {}), s.loc);
          if (s.target.type === 'str') {
            const v = s.target.value;
            if (v !== 'myself' && !this.ctx.spriteNames.includes(v)) {
              this.err(diag("sprite.cloneNotFound", {p0: String(v)}), s.loc);
            }
          }
        }
        break;
      }
      case 'ask': {
        const t = this.checkExpr(s.question);
        if (t.kind !== 'str' && t.kind !== 'any') this.err(diag("statement.ask", {}), s.loc);
        break;
      }
      case 'resettimer': break;
      case 'showmonitor': {
        const name = s.name.type === 'name' ? s.name.name : s.name.name;
        const v = this.lookupVar(name);
        const l = this.lookupList(name);
        if (!v && !l) this.err(diag("monitor.notFound", {p0: String(name), p1: String(s.show ? 'show' : 'hide')}), s.loc);
        if (s.name.type === 'name') this.resolutions.set(s.name, (v ?? l)!);
        break;
      }
      case 'pass': case 'comment': case 'unsupported': break;
    }
  }

  private resolveAssignableName(target: Expr, loc?: Loc): NameResolution | null {
    if (target.type === 'name') {
      const r = this.lookupName(target.name);
      if (!r) { this.err(diag("var.notFoundAssignment", {p0: String(target.name)}), loc); return null; }
      this.resolutions.set(target, r);
      return r;
    }
    if (target.type === 'varref') {
      const v = this.lookupVar(target.name);
      if (!v) { this.err(diag("var.notFound", {p0: String(target.name)}), loc); return null; }
      this.resolutions.set(target, v);
      return v;
    }
    return null;
  }

  private checkAssign(target: Expr, value: Expr, loc?: Loc): void {
    if (target.type === 'index') {
      // A declared list name is legal specifically as the base of an index.
      // Do not run checkName() here: using the list *element* is not using
      // the entire list as a scalar value.
      const base = target.obj;
      const list = (base.type === 'name' || base.type === 'listref') ? this.lookupList(base.name) : null;
      if (list) { this.resolutions.set(base, list); (base as {spType?: SPType}).spType = list.decl.varType; }
      const objType = list ? list.decl.varType : this.checkExpr(base);
      const idxType = this.checkExpr(target.index);
      if (objType.kind === 'list') {
        if (!list) this.err(diag("list.assignDeclared", {}), base.loc ?? loc);
        const okIdx = idxType.kind === 'int' || idxType.kind === 'any' ||
          (target.index.type === 'str' && ['last', 'random'].includes(target.index.value));
        if (!okIdx) this.err(diag("list.index", {}), loc);
        const vt = this.checkExpr(value);
        if (!assignable(objType.of, vt)) {
          this.err(diag("list.assignType", {p0: String(typeToString(objType.of)), p1: String(typeToString(vt))}), loc);
        }
      } else if (objType.kind === 'str' || objType.kind === 'any') {
        this.err(diag("string.immutable", {}), loc);
        this.checkExpr(value);
      } else {
        this.err(diag("list.assignTarget", {}), loc);
        this.checkExpr(value);
      }
      return;
    }
    const res = this.resolveAssignableName(target, loc);
    const vt = this.checkExpr(value);
    if (res && res.entity === 'var') {
      if (!assignable(res.decl.varType, vt)) {
        this.err(diag("var.assignType", {p0: String(res.decl.name), p1: String(typeToString(res.decl.varType)), p2: String(typeToString(vt))}), loc);
      }
    } else if (res && res.entity === 'param') {
      this.err(diag("param.assign", {}), loc);
    } else if (res && res.entity === 'list') {
      this.err(diag("list.assignWhole", {p0: String(res.decl.name)}), loc);
    } else if (res && res.entity === 'property') {
      this.err(diag("property.readOnly", {}), loc);
    }
  }

  private checkListMethod(listExpr: Expr, method: string, args: Expr[], loc?: Loc): void {
    let listName: string;
    if (listExpr.type === 'name') listName = listExpr.name;
    else if (listExpr.type === 'listref') listName = listExpr.name;
    else { this.err(diag("list.methodTarget", {}), loc); return; }
    const l = this.lookupList(listName);
    if (!l) {
      // 変数に対してメソッド呼び出し → 明確なエラー
      const v = this.lookupVar(listName);
      if (v) this.err(diag("list.methodOnVariable", {p0: String(listName), p1: String(method)}), loc);
      else this.err(diag("list.notFoundDeclaration", {p0: String(listName)}), loc);
      return;
    }
    this.resolutions.set(listExpr, l);
    const elemType = l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
    switch (method) {
      case 'add': {
        if (args.length !== 1) { this.err(diag("list.addArity", {}), loc); break; }
        const t = this.checkExpr(args[0]);
        if (!assignable(elemType, t)) this.err(diag("list.addType", {p0: String(listName), p1: String(typeToString(elemType)), p2: String(typeToString(t))}), loc);
        break;
      }
      case 'insert': {
        if (args.length !== 2) { this.err(diag("list.insertArity", {}), loc); break; }
        const it = this.checkExpr(args[0]);
        if (!this.isIndexType(it, args[0])) this.err(diag("list.insertIndex", {}), loc);
        const t = this.checkExpr(args[1]);
        if (!assignable(elemType, t)) this.err(diag("list.insertType", {p0: String(listName), p1: String(typeToString(elemType)), p2: String(typeToString(t))}), loc);
        break;
      }
      case 'delete': {
        if (args.length !== 1) { this.err(diag("list.deleteArity", {}), loc); break; }
        const it = this.checkExpr(args[0]);
        if (!this.isIndexType(it, args[0])) this.err(diag("list.deleteIndex", {}), loc);
        if (args[0].type === 'str' && args[0].value === 'all') {
          this.warn(diag("list.deleteAll", {}), loc);
        }
        break;
      }
      case 'clear': {
        if (args.length !== 0) this.err(diag("list.clearArity", {}), loc);
        break;
      }
    }
  }

  private isIndexType(t: SPType, e: Expr): boolean {
    if (t.kind === 'int' || t.kind === 'any') return true;
    if (e.type === 'str' && ['last', 'random', 'all'].includes(e.value)) return true;
    return false;
  }

  // --- 式チェック(型を返し AST に注釈する) --------------------------------
  checkExpr(e: Expr): SPType {
    const t = this.computeType(e);
    (e as { spType?: SPType }).spType = t;
    return t;
  }

  private computeType(e: Expr): SPType {
    switch (e.type) {
      case 'num': case 'str': case 'bool': case 'color': return e.spType!;
      case 'listlit': {
        const ts = e.items.map(i => this.checkExpr(i));
        return listOf(ts.length ? joinTypes(ts) : T_ANY);
      }
      case 'name': return this.checkName(e);
      case 'varref': {
        const v = this.lookupVar(e.name);
        if (!v) this.err(diag("var.notFound", {p0: String(e.name)}), e.loc);
        else this.resolutions.set(e, v);
        return v ? v.decl.varType : T_ANY;
      }
      case 'listref': {
        const l = this.lookupList(e.name);
        if (!l) this.err(diag("list.notFound", {p0: String(e.name)}), e.loc);
        else this.resolutions.set(e, l);
        return l ? l.decl.varType : listOf(T_ANY);
      }
      case 'unary': {
        const t = this.checkExpr(e.operand);
        if (e.op === 'not') {
          if (!isBoolish(t)) this.err(diag("operator.not", {p0: String(typeToString(t))}), e.loc);
          return T_BOOL;
        }
        if (!isNum(t)) this.err(diag("operator.unaryMinus", {p0: String(typeToString(t))}), e.loc);
        return t;
      }
      case 'binary': return this.checkBinary(e);
      case 'index': {
        // リスト名に対する添字: リスト解決を直接行う(「リストは値に使えない」エラーを経由しない)
        if (e.obj.type === 'name' || e.obj.type === 'listref') {
          const l = this.lookupList(e.obj.name);
          if (l) {
            this.resolutions.set(e.obj, l);
            (e.obj as { spType?: SPType }).spType = l.decl.varType;
            const idxType = this.checkExpr(e.index);
            if (!this.isIndexType(idxType, e.index)) this.err(diag("list.index", {}), e.loc);
            return l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
          }
        }
        const objType = this.checkExpr(e.obj);
        const idxType = this.checkExpr(e.index);
        if (objType.kind === 'list') {
          if (!this.isIndexType(idxType, e.index)) this.err(diag("list.index", {}), e.loc);
          return objType.of;
        }
        if (objType.kind === 'str' || objType.kind === 'any') {
          if (!this.isIndexType(idxType, e.index)) this.err(diag("string.index", {}), e.loc);
          return T_STR; // letter of
        }
        this.err(diag("index.target", {}), e.loc);
        return T_ANY;
      }
      case 'prop': return this.checkProp(e);
      case 'call': return this.checkCall(e);
    }
  }

  private checkBinary(e: Extract<Expr, { type: 'binary' }>): SPType {
    const op = e.op;
    // in 演算子: 右辺はリスト名/文字列(リストは「値」として扱わない)
    if (op === 'in') {
      const lt = this.checkExpr(e.left);
      if (e.right.type === 'name' || e.right.type === 'listref') {
        const l = this.lookupList(e.right.name);
        if (l) {
          this.resolutions.set(e.right, l);
          (e.right as { spType?: SPType }).spType = l.decl.varType;
          const elem = l.decl.varType.kind === 'list' ? l.decl.varType.of : T_ANY;
          if (!assignable(elem, lt)) {
            this.err(diag("operator.inElement", {p0: String(typeToString(lt)), p1: String(typeToString(elem))}), e.loc);
          }
          return T_BOOL;
        }
      }
      const rt = this.checkExpr(e.right);
      if (rt.kind === 'str' || rt.kind === 'any') {
        if (lt.kind !== 'str' && lt.kind !== 'any') this.err(diag("operator.inString", {}), e.loc);
        return T_BOOL;
      }
      if (rt.kind === 'list') {
        if (!assignable(rt.of, lt)) this.err(diag("operator.inElement", {p0: String(typeToString(lt)), p1: String(typeToString(rt.of))}), e.loc);
        return T_BOOL;
      }
      this.err(diag("operator.in", {}), e.loc);
      return T_BOOL;
    }
    const lt = this.checkExpr(e.left);
    const rt = this.checkExpr(e.right);
    if (op === 'and' || op === 'or') {
      if (!isBoolish(lt)) this.err(diag("operator.boolLeft", {p0: String(op), p1: String(typeToString(lt))}), e.loc);
      if (!isBoolish(rt)) this.err(diag("operator.boolRight", {p0: String(op), p1: String(typeToString(rt))}), e.loc);
      return T_BOOL;
    }
    if (['==', '!='].includes(op)) {
      const bothList = lt.kind === 'list' || rt.kind === 'list';
      if (bothList) this.err(diag("list.compare", {}), e.loc);
      return T_BOOL;
    }
    if (['<', '<=', '>', '>='].includes(op)) {
      if (!isNum(lt) || !isNum(rt)) {
        // Scratch では文字列比較も可能だが、教育的に数値のみ許可し警告
        if ((lt.kind === 'str' || lt.kind === 'any') && (rt.kind === 'str' || rt.kind === 'any')) {
          this.warn(diag("string.compare", {}), e.loc);
          return T_BOOL;
        }
        this.err(diag("operator.compare", {p0: String(op), p1: String(typeToString(lt)), p2: String(op), p3: String(typeToString(rt))}), e.loc);
      }
      return T_BOOL;
    }
    // 算術
    if (op === '+') {
      if (lt.kind === 'str' || rt.kind === 'str') {
        if (lt.kind === 'str' && rt.kind === 'str') return T_STR;
        if (lt.kind === 'any' || rt.kind === 'any') return T_ANY;
        this.err(diag("operator.mixedPlus", {p0: String(typeToString(lt.kind === 'str' ? rt : lt))}), e.loc);
        return T_ANY;
      }
      if (!isNum(lt) || !isNum(rt)) { this.err(diag("operator.plus", {p0: String(typeToString(lt)), p1: String(typeToString(rt))}), e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    if (op === '-' || op === '*') {
      if (!isNum(lt) || !isNum(rt)) { this.err(diag("operator.number", {p0: String(op), p1: String(typeToString(lt)), p2: String(op), p3: String(typeToString(rt))}), e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    if (op === '/') {
      if (!isNum(lt) || !isNum(rt)) { this.err(diag("operator.divide", {}), e.loc); return T_ANY; }
      return T_FLOAT; // Python 風の真の除算
    }
    if (op === '%') {
      if (!isNum(lt) || !isNum(rt)) { this.err(diag("operator.modulo", {}), e.loc); return T_ANY; }
      return lt.kind === 'int' && rt.kind === 'int' ? T_INT : T_FLOAT;
    }
    return T_ANY;
  }

  private checkName(e: Extract<Expr, { type: 'name' }>): SPType {
    const r = this.lookupName(e.name);
    if (!r) {
      if (this.ctx.spriteNames.includes(e.name) || e.name === this.ctx.stageName) {
        this.err(diag("name.targetAsValue", {p0: String(e.name), p1: String(e.name)}), e.loc);
      } else {
        this.err(diag("name.notFound", {p0: String(e.name)}), e.loc);
      }
      return T_ANY;
    }
    this.resolutions.set(e, r);
    switch (r.entity) {
      case 'var': return r.decl.varType;
      case 'param': return r.param.paramType;
      case 'property': return PROPERTIES[r.prop].returns;
      case 'list':
        this.err(diag("list.asValue", {p0: String(e.name), p1: String(e.name), p2: String(e.name)}), e.loc);
        return r.decl.varType;
    }
  }

  lookupName(name: string): NameResolution | null {
    if (this.scope.params?.has(name)) {
      return { entity: 'param', param: { name, paramType: this.scope.params.get(name)! } };
    }
    const lv = this.scope.localVars.get(name);
    if (lv) return lv;
    const ll = this.scope.localLists.get(name);
    if (ll) return ll;
    if (!this.scope.isStage) {
      const gv = this.ctx.stageVars.get(name);
      if (gv) return gv;
      const gl = this.ctx.stageLists.get(name);
      if (gl) return gl;
    }
    const p = PROPERTIES[name];
    if (p) {
      const ok = p.target === 'both' || (this.scope.isStage ? p.target === 'stage' : p.target === 'sprite');
      if (ok) return { entity: 'property', prop: name };
      // ステージで x など → 未定義扱い
    }
    return null;
  }

  private lookupVar(name: string): VarEntity | null {
    return this.scope.localVars.get(name) ?? (!this.scope.isStage ? this.ctx.stageVars.get(name) : undefined) ?? null;
  }
  private lookupList(name: string): ListEntity | null {
    const local = this.scope.localLists.get(name);
    if (local) return local;
    if (!this.scope.isStage) {
      const g = this.ctx.stageLists.get(name);
      if (g) return g;
    }
    return null;
  }

  private checkProp(e: Extract<Expr, { type: 'prop' }>): SPType {
    if (e.obj.type !== 'name' && e.obj.type !== 'str' && e.obj.type !== 'color') {
      this.err(diag("property.access", {}), e.loc);
      this.checkExpr(e.obj);
      return T_ANY;
    }
    const objName = e.obj.type === 'name' ? e.obj.name : e.obj.value;
    // 参照先ターゲット: スプライト名 or ステージ名 / 'stage'
    const isStageRef = objName === this.ctx.stageName || (objName === 'stage' && (e.obj.type === 'name' || !this.ctx.spriteNames.includes('stage')));
    const isSpriteRef = this.ctx.spriteNames.includes(objName);
    if (!isStageRef && !isSpriteRef) {
      // 自分自身のプロパティ? (例: 式内で obj.prop かつ obj が変数) → エラー
      this.err(diag("property.targetNotFound", {p0: String(objName)}), e.loc);
      return T_ANY;
    }
    const refTarget = isStageRef ? this.ctx.stageName : objName;
    // プロパティ
    if (SENSING_OF_PROPS[e.prop]) {
      const pdef = PROPERTIES[e.prop];
      // Bare global reporters can be read by sprites, while sensing-of
      // backdrop/tempo is meaningful only for the stage.
      const stageOnly = ['backdrop_number', 'backdrop_name', 'tempo'].includes(e.prop) || pdef?.target === 'stage';
      if (stageOnly && !isStageRef) {
        this.err(diag("property.stageOnly", {p0: String(e.prop), p1: String(refTarget)}), e.loc);
      }
      if (!stageOnly && isStageRef && pdef?.target === 'sprite') {
        this.err(diag("property.spriteOnly", {p0: String(e.prop)}), e.loc);
      }
      return pdef?.returns ?? T_ANY;
    }
    // そのターゲットの変数/リスト
    const vars = isStageRef ? this.ctx.stageVars : this.ctx.spriteVars.get(refTarget);
    const v = vars?.get(e.prop);
    if (v) return v.decl.varType;
    const lists = isStageRef ? this.ctx.stageLists : this.ctx.spriteLists.get(refTarget);
    const l = lists?.get(e.prop);
    if (l) {
      this.err(diag("property.listReference", {p0: String(refTarget), p1: String(e.prop)}), e.loc);
      return l.decl.varType;
    }
    // ステージ参照でグローバル変数にない場合 & スプライト参照 → グローバル変数も探す
    if (!isStageRef) {
      const gv = this.ctx.stageVars.get(e.prop);
      if (gv) return gv.decl.varType;
    }
    this.err(diag("property.notFound", {p0: String(refTarget), p1: String(e.prop), p2: String(Object.keys(SENSING_OF_PROPS).join(', '))}), e.loc);
    return T_ANY;
  }

  private checkCall(e: Extract<Expr, { type: 'call' }>): SPType {
    // メソッド呼び出し形式 → リストメソッドは文専用
    if (e.method) {
      this.err(diag("builtin.methodNoValue", {p0: String(e.callee)}), e.loc);
      e.args.forEach(a => this.checkExpr(a));
      return T_ANY;
    }
    const name = e.callee;
    // ユーザー定義ブロック
    const userDef = this.scope.defs.get(name);
    if (userDef) {
      if (e.args.length !== userDef.params.length) {
        this.err(diag("block.arity", {p0: String(name), p1: String(userDef.params.length), p2: String(e.args.length)}), e.loc);
      }
      userDef.params.forEach((p, i) => {
        if (i < e.args.length) {
          const t = this.checkExpr(e.args[i]);
          // Scratch の %s 引数は数値・真偽も文字列として受け付ける(暗黙の文字列化)
          const strCoerce = p.paramType.kind === 'str' &&
            (t.kind === 'int' || t.kind === 'float' || t.kind === 'bool');
          if (!assignable(p.paramType, t) && !strCoerce) {
            this.err(diag("block.argumentType", {p0: String(name), p1: String(p.name), p2: String(typeToString(p.paramType)), p3: String(typeToString(t))}), e.args[i].loc ?? e.loc);
          }
        }
      });
      return T_ANY; // ScratchPy のカスタムブロックは値を返さない(コマンド)
    }
    // var() / list() 参照
    if (name === 'var') {
      if (e.args.length !== 1 || e.args[0].type !== 'str') {
        this.err(diag("var.referenceSyntax", {}), e.loc);
        e.args.forEach(a => this.checkExpr(a));
        return T_ANY;
      }
      const v = this.lookupVar(e.args[0].value);
      if (!v) this.err(diag("var.notFound", {p0: String(e.args[0].value)}), e.loc);
      return T_ANY;
    }
    if (name === 'list') {
      if (e.args.length !== 1 || e.args[0].type !== 'str') {
        this.err(diag("list.referenceSyntax", {}), e.loc);
        e.args.forEach(a => this.checkExpr(a));
        return listOf(T_ANY);
      }
      const l = this.lookupList(e.args[0].value);
      if (!l) this.err(diag("list.notFound", {p0: String(e.args[0].value)}), e.loc);
      return listOf(T_ANY);
    }
    // show(x)/hide(x): x は変数/リスト名でなければならない
    if ((name === 'show' || name === 'hide') && e.args.length === 1) {
      const a = e.args[0];
      const nm = a.type === 'name' ? a.name : a.type === 'varref' ? a.name : a.type === 'listref' ? a.name : null;
      if (!nm || (!this.lookupVar(nm) && !this.lookupList(nm))) {
        this.err(diag("monitor.argument", {p0: String(name), p1: String(name)}), e.loc);
      }
      return T_ANY;
    }
    // len() オーバーロード
    if (name === 'len') {
      if (e.args.length !== 1) { this.err(diag("builtin.lenArity", {}), e.loc); return T_INT; }
      const arg=e.args[0];
      const list=(arg.type==='name'||arg.type==='listref') ? this.lookupList(arg.name) : null;
      if (list) { this.resolutions.set(arg,list); (arg as {spType?:SPType}).spType=list.decl.varType; }
      const t = list ? list.decl.varType : this.checkExpr(arg);
      if (t.kind !== 'str' && t.kind !== 'list' && t.kind !== 'any') {
        this.err(diag("builtin.lenType", {p0: String(typeToString(t))}), e.loc);
      }
      return T_INT;
    }
    if (name === 'item_number') {
      if (e.args.length !== 2) { this.err(diag("builtin.itemNumberArity", {}), e.loc); return T_INT; }
      const arg=e.args[0];
      const list=(arg.type==='name'||arg.type==='listref') ? this.lookupList(arg.name) : null;
      if (!list) {
        const actual = this.checkExpr(arg);
        this.err(diag("builtin.itemNumberList", {p0: String(typeToString(actual))}),arg.loc ?? e.loc);
      }
      else { this.resolutions.set(arg,list); (arg as {spType?:SPType}).spType=list.decl.varType; }
      const itemType = this.checkExpr(e.args[1]);
      if (itemType.kind === 'list') this.err(diag("builtin.itemNumberItem", {}),e.args[1].loc ?? e.loc);
      return T_INT;
    }
    const b = BUILTINS[name];
    if (name === 'set_drag_mode' && e.args.length === 1 && e.args[0].type !== 'str') this.err(diag("builtin.dragModeLiteral", {}), e.args[0].loc ?? e.loc);
    if (!b) {
      this.err(diag("builtin.notFound", {p0: String(name)}), e.loc);
      e.args.forEach(a => this.checkExpr(a));
      return T_ANY;
    }
    // ターゲット制約
    const targetOk = b.target === 'both' || (this.scope.isStage ? b.target === 'stage' : b.target === 'sprite');
    if (!targetOk) {
      this.err(diag(b.target === 'sprite' ? 'builtin.spriteOnly' : 'builtin.stageOnly', {p0:name}), e.loc);
    }
    if (name.startsWith('pen_') || ['stamp', 'clear_pen', 'set_pen_color', 'change_pen_param', 'set_pen_param', 'change_pen_size', 'set_pen_size'].includes(name)) {
      this.usesPen = true;
    }
    // オーバーロード解決
    const argTypes = e.args.map(a => this.checkExpr(a));
    const matched = this.matchOverload(b, e, argTypes);
    if (matched === null) return b.callType === 'reporter' ? (b.returns ?? T_ANY) : T_ANY;
    const first = e.args[0];
    if (first?.type === 'str') {
      const costumeTargets = ['switch_costume', 'switch_backdrop', 'switch_backdrop_and_wait'];
      if (costumeTargets.includes(name)) {
        const target = name === 'switch_costume' ? this.scope.targetName : this.ctx.stageName;
        const specials = ['next costume', 'previous costume', 'random costume', 'next backdrop', 'previous backdrop', 'random backdrop'];
        if (!specials.includes(first.value)) this.checkCostumeName(first, target, name, first.loc ?? e.loc);
      }
      if (['play_sound', 'play_sound_until_done'].includes(name)) {
        const sounds = this.ctx.sounds.get(this.scope.targetName) ?? [];
        if (sounds.length && !sounds.includes(first.value)) this.warn(diag('asset.soundNotFound', {p0:name,p1:first.value,p2:sounds}), first.loc ?? e.loc);
      }
    }
    if (b.returnsFn) return b.returnsFn(argTypes);
    if (b.returns) {
      // abs は int → int
      if (name === 'abs') return argTypes[0]?.kind === 'int' ? T_INT : T_FLOAT;
      return b.returns;
    }
    return T_ANY; // command
  }

  /** オーバーロード照合 + 引数の型/メニューチェック。エラーを報告し、成功時は paramSpecs を返す */
  private matchOverload(b: BuiltinDef, e: Extract<Expr, { type: 'call' }>, argTypes: SPType[]): ParamSpec[] | null {
    const candidates = b.overloads.filter(o => {
      const min = o.filter(p => !p.optional).length;
      return e.args.length >= min && e.args.length <= o.length;
    });
    if (candidates.length === 0) {
      const arities = b.overloads.map(o => o.length);
      this.err(diag('builtin.arity', {p0:b.calleeName ?? b.name, p1:arities, p2:e.args.length}), e.loc);
      return null;
    }
    // 型が最も合う候補を選ぶ
    let best: { spec: ParamSpec[]; score: number } | null = null;
    for (const spec of candidates) {
      let score = 0; let ok = true;
      for (let i = 0; i < e.args.length; i++) {
        const p = spec[i];
        if (!p) { ok = false; break; }
        if (this.paramAccepts(p, argTypes[i], e.args[i])) score += 2;
        else if (argTypes[i].kind === 'any' || this.paramTypeOf(p).kind === 'any') score += 1;
        else { ok = false; break; }
      }
      if (ok && (!best || score > best.score)) best = { spec, score };
    }
    if (!best) {
      const desc = candidates.map(o => `(${o.map(p => `${p.name}: ${p.type}`).join(', ')})`).join(' / ');
      this.err(diag("builtin.argumentTypes", {p0: String(b.name), p1: String(desc), p2: String(argTypes.map(typeToString).join(', '))}), e.loc);
      return null;
    }
    // メニュー値・動的セットの検証
    best.spec.forEach((p, i) => {
      if (i >= e.args.length) return;
      if (p.type.startsWith('menu:')) {
        this.checkMenuParam(b, p, e.args[i], i, e.loc);
      }
    });
    return best.spec;
  }

  private paramTypeOf(p: ParamSpec): SPType {
    switch (p.type) {
      case 'int': return T_INT;
      case 'float': return T_FLOAT;
      case 'number': return T_FLOAT;
      case 'str': return T_STR;
      case 'bool': return T_BOOL;
      case 'color': return T_STR;
      case 'index': return T_INT;
      default: return T_ANY;
    }
  }

  private paramAccepts(p: ParamSpec, t: SPType, arg: Expr): boolean {
    switch (p.type) {
      case 'int': return t.kind === 'int' || t.kind === 'any';
      case 'float':
      case 'number': return isNum(t);
      case 'str': return t.kind === 'str' || t.kind === 'any' || t.kind === 'int' || t.kind === 'float' || t.kind === 'bool'; // Scratch は数値を文字列に自動変換する
      case 'bool': return isBoolish(t);
      case 'color': return t.kind === 'str' || t.kind === 'any';
      case 'index': return t.kind === 'int' || t.kind === 'any' || (arg.type === 'str' && ['last', 'random', 'all'].includes(arg.value));
      case 'varname': return true; // show/hide のオーバーロード解決用
      default:
        if (p.type.startsWith('menu:')) return t.kind === 'str' || t.kind === 'any';
        return true;
    }
  }

  private checkMenuParam(b: BuiltinDef, p: ParamSpec, arg: Expr, idx: number, loc?: Loc): void {
    const menuName = p.type.slice('menu:'.length);
    const base = MENUS[menuName] ?? [];
    // 動的要素を付加
    let allowed = [...base];
    if (menuName === 'touch_target' || menuName === 'goto_target' || menuName === 'clone_target') {
      allowed = allowed.concat(this.ctx.spriteNames);
      if (menuName === 'goto_target') allowed.push(this.ctx.stageName);
    }
    this.checkMenuValue(arg, allowed, {name:b.name, index:idx + 1, param:p.name}, arg.loc ?? loc);
  }

  private checkMenuValue(arg: Expr, allowed: string[], what: {name:string; index:number; param:string} | null, loc?: Loc): void {
    if (arg.type === 'str') {
      if (!allowed.includes(arg.value)) {
        this.err(what ? diag('menu.argValue', {p0:what.name,p1:what.index,p2:what.param,p3:arg.value,p4:allowed.slice(0,12),p5:allowed.length > 12 ? ', …' : ''}) : diag('menu.keyValue', {p0:arg.value,p1:allowed.slice(0,12),p2:allowed.length > 12 ? ', …' : ''}), loc);
      }
    } else if (arg.type !== 'name' && arg.type !== 'call' && arg.type !== 'varref' && arg.type !== 'prop' && arg.type !== 'index' && arg.type !== 'binary' && arg.type !== 'num') {
      // リテラルでない式(実行時に決まる値)は許容
    } else if (arg.type === 'num') {
      this.err(what ? diag('menu.argString', {p0:what.name,p1:what.index,p2:what.param}) : diag('menu.keyString'), loc);
    }
  }

  private checkCostumeName(arg: Expr, targetName: string, what: string, loc?: Loc): void {
    if (arg.type === 'str') {
      const names = this.ctx.costumes.get(targetName) ?? [];
      if (names.length && !names.includes(arg.value)) {
        this.warn(what === '背景名' ? diag('asset.backdropNotFound', {p0:arg.value,p1:names}) : diag('asset.costumeNotFound', {p0:what,p1:arg.value,p2:names}), loc);
      }
    }
  }
}

// BuiltinDef に表示用の calleeName を足す(型拡張せず string でアクセス)
declare module './builtins' {
  interface BuiltinDef { calleeName?: string }
}

/** プログラムを型チェックする */
export function check(program: Program): CheckResult {
  return new Checker(program).run();
}

/** 参照スプライトのコスチューム/サウンド名検証ヘルパ(エクスポータでも使用) */
export function checkSoundName(ctx: ProjectContext, target: string, name: string): boolean {
  const sounds = ctx.sounds.get(target) ?? [];
  return sounds.length === 0 || sounds.includes(name);
}
