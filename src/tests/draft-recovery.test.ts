import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readDraft, writeRecoveredText, cleanupOldDraftAssets, writeDraft } from '../app/studioDraft';
import { emptyAssetStore } from '../core/api';
import { analyzeText } from '../core/api';
import { englishDiagnostic } from '../app/diagnosticText';

const db = async () => new Promise<IDBDatabase>((resolve,reject)=>{
 const r=indexedDB.open('scratchpy-studio-drafts-v1',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
async function put(key:string,value:unknown) {const d=await db();await new Promise<void>((res,rej)=>{const t=d.transaction('drafts','readwrite');t.objectStore('drafts').put(value,key);t.oncomplete=()=>res();t.onabort=()=>rej(t.error)});d.close()}
async function get(key:string) {const d=await db();const result=await new Promise<any>((res,rej)=>{const r=d.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});d.close();return result}
const rec=(text:string,assetKey:string|null)=>({format:2,text,fileName:'original.sb3',importNotes:[],assetKey});

describe('draft recovery and asset cleanup',()=>{
 it('recovers and resaves text without replacing corrupted binary or its reference',async()=>{
  const key='ja:asset:111111-old';const broken=new Uint8Array([1,2,3]);await put(key,{originalSb3:broken});await put('ja',rec('precious',key));
  const result=await readDraft('ja');expect(result.assetIssue).toBe(true);expect(result.draft?.text).toBe('precious');
  await writeRecoveredText('ja','precious edited',result.marker!);
  expect(await get('ja')).toMatchObject({text:'precious edited',assetKey:key});expect((await get(key)).originalSb3).toEqual(broken);
  expect((await readDraft('ja')).draft?.text).toBe('precious edited');
 });
 it('recovers text from missing asset record and malformed asset reference without destroying metadata',async()=>{
  for(const assetKey of ['en:asset:777-missing',42]) {
   await put('en',{...rec('valuable',null),assetKey});const r=await readDraft('en');expect(r.draft?.text).toBe('valuable');expect(r.assetIssue).toBe(true);
   await writeRecoveredText('en','edited',r.marker!);expect(await get('en')).toMatchObject({text:'edited',assetKey});
  }
 });
 it('preserves legacy broken payload while editing text',async()=>{
  const old={text:'legacy',fileName:'old.sb3',assetStore:'broken',originalSb3:new Uint8Array([7])};await put('ja',old);
  const r=await readDraft('ja');expect(r.assetIssue).toBe(true);await writeRecoveredText('ja','legacy updated',r.marker!);
  expect(await get('ja')).toEqual({...old,text:'legacy updated'});
 });
 it('rejects recovery writes when another tab changes the asset reference',async()=>{
  await put('ja',rec('old','ja:asset:2-broken'));const r=await readDraft('ja');
  await put('ja',rec('other project','ja:asset:3-new'));
  await expect(writeRecoveredText('ja','wrong text',r.marker!)).rejects.toThrow();expect((await get('ja')).text).toBe('other project');
 });
 it('deletes only sufficiently old unreferenced assets, protecting both current language drafts',async()=>{
  const now=4_000_000_000_000, old=now-31*86400000, recent=now-86400000;
  const protectedJa=`ja:asset:${old}-ja`, protectedEn=`en:asset:${old}-en`, stale=`ja:asset:${old}-stale`, recentKey=`ja:asset:${recent}-new`;
  await put('ja',rec('ja',protectedJa));await put('en',rec('en',protectedEn));
  for(const key of [protectedJa,protectedEn,stale,recentKey])await put(key,{originalSb3:new Uint8Array([1])});
  await put('ja:asset:other-invalid',{keep:true});await cleanupOldDraftAssets(now);
  expect(await get(protectedJa)).toBeTruthy();expect(await get(protectedEn)).toBeTruthy();expect(await get(stale)).toBeUndefined();expect(await get(recentKey)).toBeTruthy();expect(await get('ja:asset:other-invalid')).toBeTruthy();
 });
 it('preserves a recovery reference supplied by a tab even if another tab replaced its persisted draft',async()=>{
  const now=4_000_000_000_000, old=now-31*86400000;
  const recoveryKey=`ja:asset:${old}-recovery`, stale=`ja:asset:${old}-stale`;
  await put('ja',rec('other project',null));await put('en',rec('en',null));
  await put(recoveryKey,{originalSb3:new Uint8Array([4,5,6])});await put(stale,{originalSb3:new Uint8Array([1])});
  await cleanupOldDraftAssets(now,[recoveryKey]);
  expect((await get(recoveryKey)).originalSb3).toEqual(new Uint8Array([4,5,6]));expect(await get(stale)).toBeUndefined();
 });
 it('a long-lived tab can recreate an asset removed by cleanup before updating the draft',async()=>{
  const key='en:asset:1111-inmemory';const orig=new Uint8Array([1,2,3]);
  await writeDraft('en',{text:'kept',fileName:'a.sb3',importNotes:[],originalSb3:orig,assetStore:emptyAssetStore()},key,false);
  expect((await get('en')).assetKey).toBe(key);expect((await get(key)).originalSb3).toEqual(orig);
 });
 it('explains bare stage in Japanese and English while keeping unknown diagnostics intact',()=>{
  const diag=analyzeText('sprite Cat:\n    on flag:\n        say(stage)\n').diagnostics[0];
  expect(diag.message).toMatch(/stage 自体は値ではありません/);expect(englishDiagnostic(diag)).toMatch(/stage itself is not a value/);
  expect(englishDiagnostic({severity:'error',code:'unknown',message:'未翻訳'})).toBe('未翻訳');
 });
});
