import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadSb3 } from '../core/sb3/zip';
import { importProject } from '../core/sb3/importer';
import { validateProject } from '../core/sb3/validate';
import { DIAGNOSTIC_MESSAGES, diag, formatDiagnostic } from '../core/lang/diagnostics';
import { analyzeText } from '../core/api';
import { englishDiagnostic } from '../app/diagnosticText';
import allowlist from './diagnostic-legacy-allowlist.json';
const require = createRequire(import.meta.url);
const {collect} = require('../../scripts/diagnostic-coverage.cjs') as {collect:(overrides?:Record<string,string>)=>{legacy:string[];ids:string[];calls:{file:string;ids:string[];keys:string[]}[];errors:string[]}};
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/u;

describe('diagnostic localization coverage',()=>{
 it('blocks new uncoded diagnostic producers and freezes the explicit legacy allowlist',()=>{
   const found=collect();expect(found.errors).toEqual([]);
   expect(found.legacy.filter(x=>!allowlist.includes(x)), 'new uncoded diagnostics').toEqual([]);
   expect(allowlist.filter(x=>!found.legacy.includes(x)), 'remove retired allowlist entries').toEqual([]);
 });
 it('detects a new unregistered message and an unknown dictionary id',()=>{
   const f='src/core/lang/typechecker.ts', src=readFileSync(f,'utf8');
   const raw=collect({[f]:src+`\nclass NewCheck { err(_: unknown) {} go(){ this.err('新しい診断'); } }`});
   expect(raw.legacy.filter(x=>!allowlist.includes(x))).toHaveLength(1);
   const added=collect({[f]:src+`\nclass NewCheck { err(_: unknown) {} go(){ this.err(diag('new.untranslated', {})); } }`});
   expect(added.ids.filter(id=>!DIAGNOSTIC_MESSAGES[id])).toContain('new.untranslated');
 });
 it('translates real conversion notes and structure validation issues',()=>{
   const archive=loadSb3(new Uint8Array(readFileSync('src/tests/fixtures/top-level-reporters.sb3')));
   const result=importProject(archive.project, new Map());
   expect(result.notes.length).toBeGreaterThan(0);expect(result.notesEn).toHaveLength(result.notes.length);
   for(const note of result.notesEn)expect(note).not.toMatch(japanese);
   const invalid={...archive.project,targets:[]} as typeof archive.project;
   const issue=validateProject(invalid)[0];expect(issue.code).toBe('validation.targetsEmpty');expect(englishDiagnostic(issue)).toBe('The targets list is empty.');
 });
 it('requires bilingual dictionary entries and all placeholders at every producer',()=>{
   const found=collect();for(const id of found.ids){expect(DIAGNOSTIC_MESSAGES[id],id).toBeDefined();expect(DIAGNOSTIC_MESSAGES[id].ja,id).toBeTruthy();expect(DIAGNOSTIC_MESSAGES[id].en,id).toBeTruthy();}
   for(const call of found.calls)for(const id of call.ids){const pair=DIAGNOSTIC_MESSAGES[id];if(!pair)continue;for(const template of [pair.ja,pair.en])for(const match of template.matchAll(/\{(p\d+)\}/g))expect(call.keys,`${call.file}: ${id} needs ${match[1]}`).toContain(match[1]);}
 });
 it('dictionary English contains no untranslated Japanese, but preserves user-supplied names',()=>{
   for(const [id,pair] of Object.entries(DIAGNOSTIC_MESSAGES)) expect(pair.en,id).not.toMatch(japanese);
   const d=diag('var.notFound',{p0:'ねこ'}); expect(englishDiagnostic({severity:'error',code:d.id,params:d.params,message:d.message})).toBe("Variable 'ねこ' was not found.");
 });
 it('formats from stable code, not from the Japanese message text',()=>{
   const d=diag('var.notFound',{p0:'score'}); expect(englishDiagnostic({severity:'error',code:d.id,params:d.params,message:'文言を変更'})).toBe("Variable 'score' was not found.");
   expect(formatDiagnostic('builtin.arity',{p0:'goto',p1:[1,2],p2:3},'en')).toBe("'goto' takes 1 or 2 arguments, but 3 were given.");
   expect(formatDiagnostic('builtin.arity',{p0:'goto',p1:[1,2],p2:3},'ja')).toContain('1 または 2');
 });
});
const cases: [string,string,string][] = [
 ['keyword variable','stage:\n    var flag: int = 0\n','parse.keywordVar'],
 ['keyword list','stage:\n    list flag: list[int] = []\n','parse.keywordList'],
 ['keyword sprite','sprite flag:\n    pass\n','parse.keywordSprite'],
 ['keyword costume','sprite Cat:\n    costume flag\n','parse.keywordCostume'],
 ['keyword parameter','sprite Cat:\n    def test(flag: int):\n        pass\n','parse.keywordParam'],
 ['stage value','sprite Cat:\n    on flag:\n        say(stage)\n','parse.stageValue'],
 ['unknown variable','stage:\n    on flag:\n        score = 1\n','var.notFoundAssignment'],
 ['unknown name','stage:\n    on flag:\n        say(missing)\n','name.notFound'],
 ['builtin on stage','stage:\n    on flag:\n        move(10)\n','builtin.spriteOnly'],
 ['arity','sprite Cat:\n    on flag:\n        move(1, 2)\n','builtin.arity'],
 ['overload type','sprite Cat:\n    on flag:\n        move("hi")\n','builtin.argumentTypes'],
 ['menu value','sprite Cat:\n    on flag:\n        change_effect("GHOST", 5)\n','menu.argValue'],
 ['condition if','sprite Cat:\n    on flag:\n        if 1:\n            pass\n','condition.if'],
 ['condition while','sprite Cat:\n    on flag:\n        while 1:\n            pass\n','condition.while'],
 ['variable type','sprite Cat:\n    var score: int = 1\n    on flag:\n        score = "hi"\n','var.assignType'],
 ['repeat type','sprite Cat:\n    on flag:\n        repeat "x":\n            pass\n','statement.repeat'],
 ['wait type','sprite Cat:\n    on flag:\n        wait("x")\n','statement.wait'],
 ['property not found','sprite Cat:\n    on flag:\n        say(stage.nope)\n','property.notFound'],
 ['list not found','stage:\n    on flag:\n        missing.add(1)\n','list.notFoundDeclaration'],
 ['unknown function','sprite Cat:\n    on flag:\n        missing()\n','builtin.notFound'],
 ['full width whitespace','stage:\n　pass\n','lex.fullWidthSpace'],
 ['top level','nonsense\n','parse.topLevel'],
 ['bad character','stage:\n    on flag:\n        say(!)\n','lex.unexpectedChar'],
 ['costume candidate','sprite Cat:\n    costume costume1\n    on flag:\n        switch_costume("nope")\n','asset.costumeNotFound'],
 ['sound candidate','sprite Cat:\n    sound meow\n    on flag:\n        play_sound("nope")\n','asset.soundNotFound'],
 ['reserved property','sprite Cat:\n    var x: int = 0\n','name.propertyReserved'],
];
describe('representative learner diagnostics',()=>{
 for(const [name,source,id] of cases)it(name,()=>{
  const diagnostics=analyzeText(source).diagnostics;const d=diagnostics.find(x=>x.code===id);
  expect(d,JSON.stringify(diagnostics)).toBeDefined();expect(englishDiagnostic(d!)).not.toMatch(japanese);
 });
});
