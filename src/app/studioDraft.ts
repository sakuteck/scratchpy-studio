import { sb3ToText, emptyAssetStore, type AssetStore } from '../core/api';

export interface StudioDraft {
  text: string;
  fileName: string;
  originalSb3: Uint8Array | null;
  importNotes: string[];
  assetStore: AssetStore;
}
interface DraftRecord {
  format: 2;
  text: string;
  fileName: string;
  importNotes: string[];
  assetKey: string | null;
}
interface AssetRecord { originalSb3: Uint8Array | null; assetStore?: AssetStore }
export interface RecoveryMarker { format: unknown; assetKey: unknown; fileName: unknown }
export interface RestoredDraft { draft?: StudioDraft; assetKey: string | null; legacy: boolean; assetIssue?: boolean; marker?: RecoveryMarker }
const DB = 'scratchpy-studio-drafts-v1';
const STORE = 'drafts';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Draft storage is blocked'));
  });
  return database;
}
function get(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function validAssets(a: AssetStore | undefined): a is AssetStore {
  return !!a && a.costumes instanceof Map && a.sounds instanceof Map;
}
/** Legacy records remain untouched until a valid restoration and successful atomic save. */
export async function readDraft(key: string, onPartial?: (partial: RestoredDraft) => void): Promise<RestoredDraft> {
  const db = await open();
  const raw = await get(db, key);
  if (raw === undefined) return {assetKey: null, legacy: false};
  if (!raw || typeof raw !== 'object') throw new Error('Invalid draft record');
  const rec = raw as Partial<DraftRecord & StudioDraft>;
  if (typeof rec.text !== 'string') throw new Error('Invalid draft text');
  const fileName = typeof rec.fileName === 'string' ? rec.fileName : '';
  const importNotes = Array.isArray(rec.importNotes) && rec.importNotes.every(x => typeof x === 'string') ? rec.importNotes : [];
  const marker: RecoveryMarker = {format:rec.format, assetKey:rec.assetKey, fileName:rec.fileName};
  const partial: RestoredDraft = {draft:{text:rec.text, fileName, importNotes, originalSb3:null, assetStore:emptyAssetStore()},
    assetKey: typeof rec.assetKey === 'string' ? rec.assetKey : null, legacy:rec.format !== 2, assetIssue:true, marker};
  // A timeout during a large asset read still leaves the already-read text available.
  onPartial?.(partial);
  try {
    if (rec.format === 2) {
      if (rec.assetKey !== null && (typeof rec.assetKey !== 'string' || !rec.assetKey.startsWith(`${key}:asset:`))) throw new Error('Invalid draft asset reference');
      let originalSb3: Uint8Array | null = null;
      let assetStore = emptyAssetStore();
      if (rec.assetKey) {
        const payload = await get(db, rec.assetKey) as AssetRecord | undefined;
        if (!payload || typeof payload !== 'object') throw new Error('Draft assets are missing');
        if (payload.originalSb3 instanceof Uint8Array) {
          originalSb3 = payload.originalSb3;
          assetStore = sb3ToText(originalSb3).assetStore;
        } else if (payload.originalSb3 === null && validAssets(payload.assetStore)) assetStore = payload.assetStore;
        else throw new Error('Invalid draft assets');
      }
      return {draft:{text:rec.text, fileName, importNotes, originalSb3, assetStore}, assetKey:rec.assetKey ?? null, legacy:false};
    }
    if (!validAssets(rec.assetStore) || !(rec.originalSb3 === null || rec.originalSb3 instanceof Uint8Array)) throw new Error('Invalid legacy assets');
    return {draft:{text:rec.text, fileName, importNotes, originalSb3:rec.originalSb3, assetStore:rec.assetStore}, assetKey:null, legacy:true};
  } catch {
    // Do not discard or mutate the original record or the unreadable asset payload.
    return partial;
  }
}

/** Update only text in the existing record, preserving all unreadable metadata. */
export async function writeRecoveredText(key: string, text: string, marker: RecoveryMarker): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const current = req.result;
      if (!current || typeof current !== 'object' || current.format !== marker.format ||
          current.assetKey !== marker.assetKey || current.fileName !== marker.fileName || typeof current.text !== 'string') {
        tx.abort(); return; // Another tab replaced the project: don't combine unrelated data.
      }
      store.put({...current, text}, key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save recovered text'));
    tx.onabort = () => reject(tx.error ?? new Error('Draft changed in another tab'));
  });
}

/** Remove old unreferenced asset records after a grace period. Never touch current drafts. */
export async function cleanupOldDraftAssets(now = Date.now(), protectedKeys: readonly string[] = []): Promise<number> {
  const db = await open();
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    // Include the caller’s in-flight recovery reference as well as persisted drafts.
    const references = new Set<string>(protectedKeys);
    let removed = 0;
    for (const key of ['ja', 'en']) {
      const r = store.get(key);
      r.onsuccess = () => { if (typeof r.result?.assetKey === 'string') references.add(r.result.assetKey); };
    }
    // All requests on the transaction execute in order, so both references are known before cursor callbacks.
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (typeof item.key === 'string') {
        const match = /^(?:ja|en):asset:(\d+)-[a-z0-9]+$/.exec(item.key);
        if (match && Number(match[1]) < cutoff && !references.has(item.key)) { item.delete(); removed++; }
      }
      item.continue();
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error ?? new Error('Asset cleanup failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Asset cleanup aborted'));
  });
}
/** A text update writes only a small record. Changed assets and text commit atomically. */
export async function writeDraft(key: string, draft: StudioDraft, assetKey: string | null, assetsChanged: boolean): Promise<string | null> {
  const db = await open();
  let payload: AssetRecord | null = null;
  let nextKey = assetKey;
  if (assetsChanged) {
    const hasAssets = !!draft.originalSb3 || draft.assetStore.costumes.size > 0 || draft.assetStore.sounds.size > 0 || !!draft.assetStore.extensions?.length || !!draft.assetStore.monitorLayouts?.length;
    nextKey = hasAssets ? `${key}:asset:${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
    // When an original file is available it is sufficient: re-import restores
    // both the assets and metadata, avoiding a second copy of all binary data.
    if (nextKey) payload = draft.originalSb3 ? {originalSb3:draft.originalSb3} : {originalSb3:null, assetStore:draft.assetStore};
  }
  const record: DraftRecord = {format:2, text:draft.text, fileName:draft.fileName, importNotes:draft.importNotes, assetKey:nextKey};
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (payload && nextKey) store.put(payload, nextKey);
    if (!assetsChanged && nextKey) {
      // A stale tab must not replace a valid draft with a dangling asset reference.
      const existing = store.get(nextKey);
      existing.onsuccess = () => {
        if (existing.result === undefined) {
          // A long-lived tab may still hold an old payload that cleanup removed.
          // Atomically recreate it from memory rather than write a dangling pointer.
          store.put(draft.originalSb3 ? {originalSb3:draft.originalSb3} : {originalSb3:null, assetStore:draft.assetStore}, nextKey);
        }
        store.put(record, key);
      };
    } else store.put(record, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return nextKey;
}

/**
 * この端末（ブラウザ）に保存した下書きをすべて削除する（診断 S11）。
 *
 * 共有端末や学校の PC では、前の利用者のコードが復元されてしまう。
 * 「新規」で上書きする以外に消す手段が無かったため、明示的な削除を用意する。
 * 戻り値は削除したレコード数（下書き本体とアセット）。
 */
/** 削除する前に件数を出すための読み取り（診断 v1.0.18 の B7）。 */
export async function countDrafts(): Promise<number> {
  const db = await open();
  return new Promise<number>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result ?? []).length);
    req.onerror = () => reject(req.error);
  });
}

export async function clearDrafts(): Promise<number> {
  const db = await open();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  if (!keys.length) return 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return keys.length;
}
