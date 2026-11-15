import { describe, it, expect } from 'vitest';
import { analyzeText, textToSb3, sb3ToText, formatText, Sb3ParseError } from '../core/api';
import { saveSb3 } from '../core/sb3/zip';

const errors = (s:string) => analyzeText(s).diagnostics.filter(d => d.severity === 'error');
const round = (s:string) => { const first = textToSb3(s); const imp = sb3ToText(first.bytes); expect(errors(imp.text), imp.text).toEqual([]); return { imp, first, out: textToSb3(imp.text, imp.assetStore) }; };

describe('user review: lossless names and robust diagnostics', () => {
 it('preserves keyword names and quoted identifier spelling through format and sb3', () => {
  for (const name of ['flag','on','if','timer','not','in','pass','stop','def','repeat','while','costume','sprite','stage','true','say','move','x','my var']) {
   const n=JSON.stringify(name);
   const src=`stage:\n    var ${n}: int = 1\n    list ${n}: list[int] = [1]\n    costume ${n}\n    sound ${n}\n    on flag:\n        var(${n}) = 2\n        list(${n}).add(3)\n`;
   const {imp,out}=round(src);expect(imp.text).toContain(`var ${n}:`);expect(imp.text).toContain(`list ${n}:`);expect(out.project.targets[0].costumes.some(c=>c.name===name)).toBe(true);expect(out.project.targets[0].sounds.some(c=>c.name===name)).toBe(true);
   expect(Object.values(out.project.targets[0].variables).some(v=>v[0]===name)).toBe(true);
   expect(Object.values(out.project.targets[0].lists).some(v=>v[0]===name)).toBe(true);
  }
  expect(formatText('sprite "Cat":\n    pass\n').text).toContain('sprite "Cat":');
 });
 it('keeps sprite names, menus and sensing-of references with spaces, symbols and keyword names', () => {
  for(const name of ['My Cat', 'Shirt-T', 'flag']) {
   const n=JSON.stringify(name);const src=`stage:\n    costume backdrop1\n    var n: float = 0\nsprite ${n}:\n    costume costume1\nsprite Dog:\n    costume costume1\n    on flag:\n        if touching(${n}):\n            n = ${n}.x\n`;
   const {imp,out}=round(src);expect(imp.text).toContain(`sprite ${n}:`);expect(imp.text).toContain(`touching(${n})`);
   expect(out.project.targets.map(t=>t.name)).toContain(name);
   expect(Object.values(out.project.targets[2].blocks).some(b=>b.opcode==='sensing_of_object_menu' && b.fields.OBJECT[0]===name)).toBe(true);
  }
 });
 it('accepts exponential numbers with signs and round trips extreme values',()=>{
  for(const value of [1e21,1e-7,-1e21,1e-320,-1e-7,123456789012345680000,0.30000000000000004]) {
    const ty=Number.isInteger(value)?'int':'float'; const {imp,out}=round(`stage:\n    var score: ${ty} = ${value}\n`);
    expect(Object.values(out.project.targets[0].variables)[0][1],imp.text).toBe(value);
  }
  expect(errors('stage:\n    var v: float = 1.5E-3\n')).toEqual([]);
  expect(errors('stage:\n    var v: float = 1e999\n')[0].message).toContain('大きすぎ');
 });
 it('rejects duplicate stage and sprite names before export, and ambiguous sb3 without renaming',()=>{
  expect(errors('stage:\n    pass\nstage:\n    pass\n')[0].message).toContain('1つ');
  expect(errors('sprite Cat:\n    pass\nsprite Cat:\n    pass\n')[0].message).toContain('重複');
  expect(errors('sprite Stage:\n    pass\n')[0].message).toContain('重複');
  const original=textToSb3('stage:\n    pass\nsprite Cat:\n    pass\n');
  original.project.targets.push(structuredClone(original.project.targets[1]));
  expect(()=>sb3ToText(saveSb3(original.project,original.assets))).toThrow(Sb3ParseError);
  expect(()=>sb3ToText(saveSb3({...original.project, targets:[]},original.assets))).toThrow(Sb3ParseError);
 });
 it('preserves hidden continuous slider, negative range, and large hidden mode',()=>{
  const first=textToSb3('stage:\n    var a: int = 1 @show(slider, -10, 50)\n    var b: int = 2 @show(large)\n');
  first.project.monitors[0].visible=false;first.project.monitors[0].isDiscrete=false;first.project.monitors[1].visible=false;
  const imp=sb3ToText(saveSb3(first.project,first.assets));expect(imp.text).toContain('@hide(slider, -10, 50, false)');expect(imp.text).toContain('@hide(large)');expect(errors(imp.text),imp.text).toEqual([]);
  const after=textToSb3(imp.text,imp.assetStore).project.monitors;expect(after[0]).toMatchObject({mode:'slider',visible:false,isDiscrete:false,sliderMin:-10,sliderMax:50});expect(after[1]).toMatchObject({mode:'large',visible:false});
 });
 it('retains variable, list and reporter monitor layouts with the imported metadata',()=>{
  const first=textToSb3('stage:\n    timer_visible: true\n    var a: int = 1 @show\n    list b: list[int] = [1] @show\n');
  for (let i=0;i<first.project.monitors.length;i++) Object.assign(first.project.monitors[i], {x:90+i,y:130+i,width:140+i,height:60+i});
  const imp=sb3ToText(saveSb3(first.project,first.assets));
  const out=textToSb3(imp.text,imp.assetStore).project;
  for (const m of first.project.monitors) {
    const after=out.monitors.find(n=>n.opcode===m.opcode && JSON.stringify(n.params)===JSON.stringify(m.params));
    expect(after).toMatchObject({x:m.x,y:m.y,width:m.width,height:m.height});
  }
 });
 it('retains even unused extension declarations with imported assets',()=>{
  const first=textToSb3('stage:\n    pass\n');first.project.extensions=['music','pen'];
  const imp=sb3ToText(saveSb3(first.project,first.assets));
  expect(textToSb3(imp.text,imp.assetStore).project.extensions).toEqual(expect.arrayContaining(['music','pen']));
 });
 it('stops on an excessively nested sb3 instead of truncating the scripts',()=>{
  let src='sprite Cat:\n    on flag:\n';
  for(let i=0;i<82;i++) src+='    '.repeat(i+2)+'if true:\n';
  src+='    '.repeat(84)+'move(1)\n';
  const file=textToSb3(src);
  expect(()=>sb3ToText(file.bytes)).toThrow(/入れ子が深すぎ/);
 });
 it('reports full-width spaces and deeply nested unary operators safely',()=>{
  expect(errors('stage:\n    var あ　い: int = 0\n')[0].message).toMatch(/全角スペース/);
  const deep='-'.repeat(20000)+'1';
  expect(errors(`stage:\n    var x: int = ${deep}\n`)[0].message).toMatch(/深すぎ/);
 });
 it('gives actionable keyword, asset, menu and deep-expression diagnostics',()=>{
  expect(errors('stage:\n    var flag: int = 0\n')[0].message).toMatch(/予約語.*引用/);
  expect(errors('stage:\n    costume ""\n')[0].message).toContain('空');
  const a=analyzeText('sprite Cat:\n    costume costume1\n    sound meow\n    on flag:\n        switch_costume("missing")\n        play_sound("missing")\n        change_effect("GHOST", 1)\n');
  expect(a.diagnostics.map(d=>d.message).join(' ')).toMatch(/costume1/);expect(a.diagnostics.map(d=>d.message).join(' ')).toMatch(/meow/);expect(a.diagnostics.map(d=>d.message).join(' ')).toMatch(/大文字/);
  const deep='join('.repeat(2000)+'"x"'+', "x")'.repeat(2000);
  expect(errors(`stage:\n    on flag:\n        say(${deep})\n`)[0].message).toContain('深すぎ');
 });
});
