import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as Blockly from 'blockly';
import {analyzeText, sb3ToText, textToSb3} from '../core/api';
import {loadSb3,saveSb3} from '../core/sb3/zip';
import {REPORTER_MONITORS} from '../core/lang/monitors';
import {registerScratchPyBlocks} from '../app/blockly/defs';
import {astToWorkspace,workspaceToAst} from '../app/blockly/bridge';
import {printProgram} from '../core/lang/printer';

const errors = (code:string) => analyzeText(code).diagnostics.filter(d=>d.severity==='error').map(d=>d.message);
const example = `stage:
    timer_visible: true
    answer_visible: false
    current_year_visible: true
    backdrop_name_visible: true
    tempo_visible: true
    volume_visible: true
    var points: int = 0 @show
    on flag:
        hide(points)
        show(points)
sprite Cat:
    x_position_visible: true
    y_position_visible: false
    direction_visible: true
    size_visible: true
    costume_number_visible: true
    costume_name_visible: true
    volume_visible: true
    on flag:
        move(10)
`;

describe('built-in value monitors',()=>{
 it('each supported monitor can be written in the correct initialisation section and exported with true or false',()=>{
  for (const s of REPORTER_MONITORS) for(const visible of [true,false]) for(const stage of s.scope==='both'?[true,false]:[s.scope==='stage']) {
   const code=stage?`stage:\n    ${s.key}: ${visible}\n`:`stage:\n    pass\nsprite Cat:\n    ${s.key}: ${visible}\n`;
   expect(errors(code),s.key).toEqual([]); const {project}=textToSb3(code); const m=project.monitors.find(x=>x.opcode===s.opcode && JSON.stringify(x.params)===JSON.stringify(s.params));
   expect(m,s.key).toBeDefined(); expect(m!.visible).toBe(visible); expect(m!.spriteName).toBe(s.scope==='stage'?null:stage?'Stage':'Cat');
   if(s.extension) expect(project.extensions).toContain(s.extension);
   const round=sb3ToText(textToSb3(code).bytes);expect(round.text).toContain(`${s.key}: ${visible}`);
  }
 });
 it('omitting a setting leaves it hidden, and existing variable show/hide blocks remain unchanged',()=>{
  const out=textToSb3('stage:\n    var points: int = 0 @show\n    on flag:\n        hide(points)\n        show(points)\n');
  expect(out.project.monitors.some(x=>x.opcode==='sensing_timer')).toBe(false);
  expect(out.project.monitors.some(x=>x.opcode==='data_variable' && x.visible)).toBe(true);
  const blocks=Object.values(out.project.targets[0].blocks).map(b=>b.opcode);expect(blocks).toContain('data_showvariable');expect(blocks).toContain('data_hidevariable');
 });
 it('places several visible values within the Scratch stage, wrapping to a second column',()=>{
  const project=textToSb3(example).project;
  const visible=project.monitors.filter(m=>m.visible && m.opcode!=='data_variable');
  expect(visible.length).toBeGreaterThan(6);
  expect(visible.every(m=>(m.x ?? 999)<480 && (m.y ?? 999)<360)).toBe(true);
  expect(visible.some(m=>(m.x ?? 0)>5)).toBe(true);
  expect(new Set(visible.map(m=>`${m.x},${m.y}`)).size).toBe(visible.length);
 });
 it('requires literal boolean, correct target and no conflicting duplicates',()=>{
  expect(errors('stage:\n    timer_visible: 1\n')).toHaveLength(1);
  expect(errors('stage:\n    var b: bool = true\n    timer_visible: b\n')).toHaveLength(1);
  expect(errors('stage:\n    x_position_visible: true\n')).toHaveLength(1);
  expect(errors('sprite Cat:\n    timer_visible: true\n')).toHaveLength(1);
  expect(errors('stage:\n    timer_visible: true\n    timer_visible: false\n')).toHaveLength(1);
 });
 it('preserves real Scratch timer fixture and actual list of reporter variants from fixture',()=>{
  const timer=sb3ToText(new Uint8Array(readFileSync(new URL('./fixtures/timer-monitor.sb3', import.meta.url))));expect(timer.text).toContain('timer_visible: true');
  const tm=textToSb3(timer.text,timer.assetStore).project.monitors.find(m=>m.opcode==='sensing_timer');
  expect(tm).toMatchObject({id:'timer',spriteName:null,visible:true});
  const converted=sb3ToText(new Uint8Array(readFileSync(new URL('./fixtures/monitors.sb3', import.meta.url))));
  const out=textToSb3(converted.text,converted.assetStore).project;
  for(const m of converted.project.monitors){
   if(m.opcode==='data_variable'||m.opcode==='data_listcontents')continue;
   const after=out.monitors.find(n=>n.opcode===m.opcode && JSON.stringify(n.params)===JSON.stringify(m.params));
   expect(after,`${m.opcode} ${JSON.stringify(m.params)}`).toBeDefined();expect(after!.visible).toBe(m.visible);
   if(m.spriteName) expect(after!.spriteName).toBe('Shirt-T');
  }
  expect(out.monitors.find(m=>m.opcode==='ev3_getDistance')?.visible).toBe(true);
  expect(out.extensions).toContain('ev3');
 });
 it('reads a hidden timer',()=>{
  const z=loadSb3(new Uint8Array(readFileSync(new URL('./fixtures/timer-monitor.sb3', import.meta.url))));z.project.monitors[0].visible=false;
  const r=sb3ToText(saveSb3(z.project,z.files));expect(r.text).toContain('timer_visible: false');expect(textToSb3(r.text,r.assetStore).project.monitors.find(m=>m.opcode==='sensing_timer')!.visible).toBe(false);
 });
 it('reports other unsupported extension monitor variants rather than silently discarding them',()=>{
  const z=loadSb3(new Uint8Array(readFileSync(new URL('./fixtures/timer-monitor.sb3', import.meta.url))));
  z.project.monitors.push({id:'videoSensing_videoOn',opcode:'videoSensing_videoOn',mode:'default',params:{ATTRIBUTE:'motion',SUBJECT:'Stage'},spriteName:null,value:0,visible:true});
  const r=sb3ToText(saveSb3(z.project,z.files));expect(r.notes.join(' ')).toContain('videoSensing_videoOn');
 });
 it('notes normalized non-default reporter mode',()=>{
  const z=loadSb3(new Uint8Array(readFileSync(new URL('./fixtures/timer-monitor.sb3', import.meta.url))));z.project.monitors[0].mode='large';z.project.monitors[0].x=120;
  const r=sb3ToText(saveSb3(z.project,z.files));expect(r.notes.join(' ')).toMatch(/表示形式/);
 });
 it('keeps settings during Blockly conversion',()=>{
  registerScratchPyBlocks();const a=analyzeText(example);expect(errors(example)).toEqual([]);const ws=new Blockly.Workspace();
  try{astToWorkspace(ws,a.program!,a.checkResult!.resolutions);expect(printProgram(workspaceToAst(ws))).toBe(printProgram(a.program!));}finally{ws.dispose();}
 });
});
