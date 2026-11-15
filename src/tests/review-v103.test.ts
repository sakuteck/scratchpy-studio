import { describe, it, expect } from 'vitest';
import { analyzeText, textToSb3, sb3ToText } from '../core/api';
import { saveSb3 } from '../core/sb3/zip';
const errors = (s:string) => analyzeText(s).diagnostics.filter(d=>d.severity === 'error');

describe('v1.0.3 user report regressions',()=>{
 it('roundtrips _stage_ sensing_of for volume, backdrop and stage variable',()=>{
  const text=`stage:\n    var points: int = 9\nsprite Cat:\n    on flag:\n        say(Stage.volume)\n        say(Stage.backdrop_number)\n        say(Stage.points)\n`;
  const first=textToSb3(text);const imp=sb3ToText(first.bytes);
  expect(imp.text).toContain('stage.volume');expect(imp.text).toContain('stage.backdrop_number');expect(imp.text).toContain('stage.points');
  expect(errors(imp.text),imp.text).toEqual([]);const out=textToSb3(imp.text,imp.assetStore);
  const blocks=Object.values(out.project.targets[1].blocks);
  expect(blocks.filter(b=>b.opcode==='sensing_of')).toHaveLength(3);
  expect(blocks.filter(b=>b.opcode==='sensing_of_object_menu').map(b=>b.fields.OBJECT[0])).toEqual(['_stage_','_stage_','_stage_']);
 });
 it('handles stage aliases and does not confuse a sprite named stage',()=>{
  for (const alias of ['stage','Stage','"Stage"','"stage"']) {
   const source=`stage:\n    pass\nsprite Cat:\n    on flag:\n        say(${alias}.volume)\n`;
   expect(errors(source),alias).toEqual([]);
   const p=textToSb3(source).project;expect(Object.values(p.targets[1].blocks).find(b=>b.opcode==='sensing_of_object_menu')!.fields.OBJECT[0]).toBe('_stage_');
  }
  const source=`stage:\n    pass\nsprite "stage":\n    pass\nsprite Cat:\n    on flag:\n        say(stage.volume)\n        say("stage".x)\n`;
  expect(errors(source)).toEqual([]);const out=textToSb3(source);
  expect(Object.values(out.project.targets[2].blocks).filter(b=>b.opcode==='sensing_of_object_menu').map(b=>b.fields.OBJECT[0])).toEqual(['_stage_','stage']);
  const imp=sb3ToText(out.bytes);expect(errors(imp.text),imp.text).toEqual([]);
 });
 it('roundtrips large finite integer-valued exponential literals in variables and lists',()=>{
  for (const value of [1.5e21, -1.5e21, 1.7976931348623157e308, -1.7976931348623157e308, 1.5e-7]){
   const base=textToSb3('stage:\n    var score: int = 0\n    list values: list[int] = [0]\n');
   Object.values(base.project.targets[0].variables)[0][1]=value;Object.values(base.project.targets[0].lists)[0][1]=[value];
   const imp=sb3ToText(saveSb3(base.project,base.assets));expect(errors(imp.text),imp.text).toEqual([]);
   const out=textToSb3(imp.text,imp.assetStore).project;
   expect(Object.values(out.targets[0].variables)[0][1]).toBe(value);expect(Object.values(out.targets[0].lists)[0][1]).toEqual([value]);
  }
  expect(errors('stage:\n    var n: float = 1.0\n')).toEqual([]);
  expect(errors('stage:\n    var n: int = 1.0\n').length).toBeGreaterThan(0);
 });
 it('validates monitor arguments without silent loss and warns for reversed ranges',()=>{
  expect(errors('stage:\n    var a: int = 1 @hide(bogus)\n')[0].message).toContain('@hide');
  expect(errors('stage:\n    list a: list[int] = [1] @hide(slider, 0, 10)\n')[0].message).toMatch(/引数/);
  expect(errors('stage:\n    var a: int = 1 @show(large, 0)\n').length).toBeGreaterThan(0);
  expect(errors('stage:\n    var a: int = 1 @show(slider, nope, 10)\n').length).toBeGreaterThan(0);
  const result=analyzeText('stage:\n    var a: int = 1 @show(slider, 100, 0)\n');
  expect(result.diagnostics.some(d=>d.severity==='warning' && /最小値.*最大値/.test(d.message))).toBe(true);
 });
 it('explains keyword parameters, fixes doubled quotes and counts indentation levels',()=>{
  expect(errors('sprite Cat:\n    def f(flag: int):\n        pass\n')[0].message).toMatch(/予約語.*別の識別子/);
  expect(errors('sprite Cat:\n    def f(x: int):\n        pass\n')[0].message).not.toContain('「「');
  let prefix='stage:\n    on flag:\n';
  for(let i=0;i<98;i++) prefix+='    '.repeat(i+2)+'if true:\n';
  const within=prefix+'    '.repeat(100)+'pass\n';expect(errors(within)).toEqual([]);
  const outside=prefix+'    '.repeat(100)+'if true:\n'+'    '.repeat(101)+'pass\n';
  expect(errors(outside)[0].message).toMatch(/最大100段.*stage/);
 });
});
