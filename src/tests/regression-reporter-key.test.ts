import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as Blockly from 'blockly';
import {analyzeText,sb3ToText,textToSb3,ExportError} from '../core/api';
import {loadSb3,saveSb3} from '../core/sb3/zip';
import {registerScratchPyBlocks} from '../app/blockly/defs';
import {astToWorkspace,workspaceToAst} from '../app/blockly/bridge';
import {printProgram} from '../core/lang/printer';

const errorDiags=(code:string)=>analyzeText(code).diagnostics.filter(d=>d.severity==='error');
const blocks=(source:string)=>textToSb3(source).project.targets.flatMap(t=>Object.values(t.blocks));
const code=`stage:
    list items: list[str] = ["a", "b"]
    var hit: int = 0 @show
    var reading: float = 0
    var current_backdrop: str = ""
    var num: int = 0
    costume backdrop1

sprite Cat:
    on flag:
        items[1] = "x"
        reading = timer + loudness
        current_backdrop = backdrop_name
        num = backdrop_number
        reading = tempo
        set_drag_mode("draggable")
        set_drag_mode("not draggable")
        set_drag_mode("sync")
        num = item_number(items, "x")
    on key "space":
        hit += 1
    on key "up arrow":
        hit += 2
`;

describe('regressions: list replacement, sensor reporters and pressed-key hats',()=>{
 it('compiles the combined reported failures, real Scratch opcodes, and re-imports without errors',()=>{
  expect(errorDiags(code)).toEqual([]);
  const out=textToSb3(code);const all=out.project.targets.flatMap(t=>Object.values(t.blocks));
  for(const op of ['data_replaceitemoflist','sensing_timer','sensing_loudness','looks_backdropnumbername','music_getTempo','sensing_setdragmode','data_itemnumoflist','event_whenkeypressed'])expect(all.some(b=>b.opcode===op),op).toBe(true);
  expect(out.project.extensions).toContain('music');
  expect(all.filter(b=>b.opcode==='looks_backdropnumbername').map(b=>b.fields.NUMBER_NAME[0]).sort()).toEqual(['name','number']);
  expect(all.filter(b=>b.opcode==='sensing_setdragmode').map(b=>b.fields.DRAG_MODE[0])).toEqual(['draggable','not draggable','sync']);
  const hats=all.filter(b=>b.opcode==='event_whenkeypressed').map(b=>b.fields.KEY_OPTION[0]);expect(hats).toEqual(['space','up arrow']);
  const imp=sb3ToText(out.bytes);expect(errorDiags(imp.text),imp.text).toEqual([]);
  expect(imp.text).toContain('items[1] = "x"');expect(imp.text).toContain('timer + loudness');expect(imp.text).toContain('backdrop_number');expect(imp.text).toContain('backdrop_name');expect(imp.text).toContain('set_drag_mode("sync")');expect(imp.text).toContain('on key "space":');
  const again=textToSb3(imp.text,imp.assetStore);expect(again.validation.filter(v=>v.severity==='error')).toEqual([]);
 });
 it('list replacements respect element type, numeric index, local and quoted list references',()=>{
  expect(errorDiags('stage:\n    list a: list[str] = []\n    on flag:\n        a[1] = 42\n').map(d=>d.message).join(' ')).toMatch(/要素型/);
  expect(errorDiags('stage:\n    list a: list[str] = []\n    on flag:\n        a["all"] = "x"\n').map(d=>d.message).join(' ')).toMatch(/添字/);
  expect(errorDiags('stage:\n    on flag:\n        [1][1] = 2\n').map(d=>d.message).join(' ')).toMatch(/リスト名/);
  const source='stage:\n    list "my list": list[str] = []\n    on flag:\n        list("my list")["last"] = "x"\nsprite Cat:\n    list a: list[int] = []\n    on flag:\n        a[1] = 42\n';
  expect(errorDiags(source)).toEqual([]);const out=textToSb3(source);expect(out.project.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='data_replaceitemoflist')).toHaveLength(2);
  expect(errorDiags(sb3ToText(out.bytes).text)).toEqual([]);
 });
 it('timer and loudness work in expressions and old threshold event syntax still works',()=>{
  const source='stage:\n    var v: float = 0\n    on timer > 2:\n        v = timer\n    on loudness > 10:\n        v = loudness\n';
  expect(errorDiags(source)).toEqual([]);const ops=blocks(source).map(x=>x.opcode);expect(ops).toContain('sensing_timer');expect(ops).toContain('sensing_loudness');expect(ops.filter(x=>x==='event_whengreaterthan')).toHaveLength(2);
  expect(errorDiags(sb3ToText(textToSb3(source).bytes).text)).toEqual([]);
 });
 it('rejects dynamic variable initializers at type-check time and suggests the event body',()=>{
  const a=analyzeText('stage:\n    var n: float = timer\n');expect(a.checkResult?.ok).toBe(false);expect(a.exportDiagnostics).toEqual([]);expect(a.diagnostics.map(x=>x.message).join(' ')).toMatch(/初期値.*on flag/);
 });
 it('infers float variables through assignments and variable chains after an sb3 round trip',()=>{
  const source=`stage:\n    var a: float = 0\n    var b: float = 0\n    var c: float = 0\n    on flag:\n        c = timer + 1\n        b = c\n        a = b\n`;
  const imported=sb3ToText(textToSb3(source).bytes);expect(errorDiags(imported.text),imported.text).toEqual([]);expect(imported.text).toMatch(/var a: float/);expect(imported.text).toMatch(/var b: float/);expect(imported.text).toMatch(/var c: float/);
 });
 it('all four costume/backdrop variants use real Scratch dropdown opcodes for stage and sprite',()=>{
  const source=`stage:\n    var n: int = 0\n    var s: str = ""\n    on flag:\n        n = backdrop_number\n        s = backdrop_name\nsprite Cat:\n    on flag:\n        n = costume_number\n        s = costume_name\n        n = backdrop_number\n        s = backdrop_name\n`;
  expect(errorDiags(source)).toEqual([]);const result=textToSb3(source);const all=result.project.targets.flatMap(t=>Object.values(t.blocks));
  expect(all.filter(b=>b.opcode==='looks_costumenumbername')).toHaveLength(2);expect(all.filter(b=>b.opcode==='looks_backdropnumbername')).toHaveLength(4);
  expect(all.some(b=>['looks_costumenumber','looks_costumename','looks_backdropnumber','looks_backdropname'].includes(b.opcode))).toBe(false);
  const round=sb3ToText(result.bytes);expect(errorDiags(round.text),round.text).toEqual([]);expect(round.notes.join(' ')).not.toContain('レポータ');
 });
 it('rejects numeric or missing list first argument at type-check stage, not export',()=>{
  for(const expr of ['item_number(1, 1)','item_number("x", 1)','item_number(missing, 1)']){
   const source=`stage:\n    var n: int = 0\n    on flag:\n        n = ${expr}\n`;
   const a=analyzeText(source);expect(a.checkResult?.ok).toBe(false);expect(a.checkResult?.diagnostics.some(d=>d.code==='builtin.itemNumberList' && /第1引数/.test(d.message))).toBe(true);expect(a.exportDiagnostics).toEqual([]);expect(a.project).toBeNull();
   expect(()=>textToSb3(source)).toThrow(ExportError);
  }
  const standalone = analyzeText('stage:\n    on flag:\n        item_number(1, 1)\n');
  expect(standalone.checkResult?.ok).toBe(false);expect(standalone.checkResult?.diagnostics.some(d=>d.code==='builtin.itemNumberList' && /第1引数/.test(d.message))).toBe(true);expect(standalone.exportDiagnostics).toEqual([]);
  const valid='stage:\n    list nums: list[int] = [1, 2]\n    var n: int = 0\n    on flag:\n        n = item_number(nums, 1)\n';expect(errorDiags(valid)).toEqual([]);expect(blocks(valid).some(b=>b.opcode==='data_itemnumoflist')).toBe(true);
 });
 it('rejects unsupported standalone reporter statements before export',()=>{
  const a=analyzeText('stage:\n    list a: list[int] = [1]\n    on flag:\n        item_number(a, 1)\n');expect(a.checkResult?.ok).toBe(false);expect(a.exportDiagnostics).toEqual([]);
 });
 it('accepts all Scratch key menu values and checks dynamic or invalid keys before export',()=>{
  for(const key of ['space','up arrow','down arrow','left arrow','right arrow','a','z','0','9','any']){
   const source=`sprite Cat:\n    on key ${JSON.stringify(key)}:\n        move(10)\n`;const out=textToSb3(source);const hat=out.project.targets[1].blocks;expect(Object.values(hat).find(b=>b.opcode==='event_whenkeypressed')?.fields.KEY_OPTION[0]).toBe(key);expect(sb3ToText(out.bytes).text).toContain(`on key ${JSON.stringify(key)}:`);
  }
  const invalid='stage:\n    var k: str = "space"\n    on key k:\n        pass\n';const a=analyzeText(invalid);expect(a.checkResult?.ok).toBe(false);expect(a.exportDiagnostics).toEqual([]);
  expect(errorDiags('sprite Cat:\n    on key "nonsense":\n        pass\n').length).toBeGreaterThan(0);
 });
 it('imports nonstandard sync and both official drag mode values without changing fields',()=>{
  for(const mode of ['sync','draggable','not draggable']){
   const source=`sprite Cat:\n    on flag:\n        set_drag_mode(${JSON.stringify(mode)})\n`; const out=textToSb3(source);const imported=sb3ToText(out.bytes);expect(imported.text).toContain(`set_drag_mode(${JSON.stringify(mode)})`);expect(errorDiags(imported.text)).toEqual([]);
  }
  const z=loadSb3(new Uint8Array(readFileSync(new URL('./fixtures/default.sb3', import.meta.url))));const t=z.project.targets.find(x=>!x.isStage)!;
  const existing=Object.keys(t.blocks).length; t.blocks['test_drag']={opcode:'sensing_setdragmode',next:null,parent:null,inputs:{},fields:{DRAG_MODE:['sync',null]},shadow:false,topLevel:true,x:0,y:1000};
  // Attach a genuine flag hat to make the block executable.
  t.blocks['test_hat']={opcode:'event_whenflagclicked',next:'test_drag',parent:null,inputs:{},fields:{},shadow:false,topLevel:true,x:100,y:1000};t.blocks['test_drag'].parent='test_hat';t.blocks['test_drag'].topLevel=false;
  expect(Object.keys(t.blocks).length).toBe(existing+2);const imp=sb3ToText(saveSb3(z.project,z.files));expect(imp.text).toContain('set_drag_mode("sync")');expect(errorDiags(imp.text)).toEqual([]);expect(textToSb3(imp.text,imp.assetStore).project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='sensing_setdragmode')?.fields.DRAG_MODE[0]).toBe('sync');
  expect(errorDiags('sprite Cat:\n    on flag:\n        set_drag_mode("wrong")\n').length).toBeGreaterThan(0);
 });
 it('round-trips all changed features through Blockly without silently changing code',()=>{
  registerScratchPyBlocks();const a=analyzeText(code);expect(a.diagnostics.filter(d=>d.severity==='error')).toEqual([]);const ws=new Blockly.Workspace();
  try{astToWorkspace(ws,a.program!,a.checkResult!.resolutions);expect(printProgram(workspaceToAst(ws))).toBe(printProgram(a.program!));}finally{ws.dispose();}
 });
});
