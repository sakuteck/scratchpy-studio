import { englishDiagnostic, englishError } from './diagnosticText';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeText, sb3ToText, textToSb3, formatText,
  ExportError, emptyAssetStore, assertSb3Size,
  type TextAnalysis, type AssetStore, type Diagnostic,
} from '../core/api';
import { SAMPLES } from '../core/samples';
import Editor, { EditorHandle } from './components/Editor';
import { BlocklyPanel, type BlocklyPanelHandle } from './components/BlocklyPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import StructurePanel from './components/StructurePanel';
import JsonPanel from './components/JsonPanel';
import LogPanel, { LogEntry } from './components/LogPanel';
import StatusBar from './components/StatusBar';
import GuidePage, { parseGuideHash, type GuideId } from './components/GuidePage';
import EnglishGuide from './components/EnglishGuide';
import AgentPanel from './components/AgentPanel';
import { COLOR_MODES, applyColorMode, colorMode, loadColorMode, saveColorMode, type ColorModeId } from './theme';
import EditionMenu from './components/EditionMenu';
import ScratchPlayer from './components/ScratchPlayer';
import { EN, t, sampleTitle, sampleDescription, localizeSample } from './i18n';
import { readDraft, writeDraft, writeRecoveredText, cleanupOldDraftAssets, clearDrafts, countDrafts, type RestoredDraft, type RecoveryMarker } from './studioDraft';
import {
  IconLogo, IconFolderOpen, IconDownload, IconWand, IconFilePlus,
  IconMoon, IconSun, IconCode, IconPuzzle, IconActivity, IconBranch,
  IconBraces, IconList, IconBook, IconCheckCircle,
} from './components/Icons';

type TabId = 'diagnostics' | 'structure' | 'json' | 'log' | 'ai';
type EditorMode = 'code' | 'blocks';

let logSeq = 0;

export default function App() {
  const [draftReady, setDraftReady] = useState(false);
  const [draftCanSave, setDraftCanSave] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryMarker | null>(null);
  const [draftStatus, setDraftStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [text, setText] = useState<string>(localizeSample(SAMPLES[0].code));
  const [fileName, setFileName] = useState<string>('');
  const [originalSb3, setOriginalSb3] = useState<Uint8Array|null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [assetStore, setAssetStore] = useState<AssetStore>(emptyAssetStore);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<TabId>('diagnostics');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<GuideId | null>(() => parseGuideHash(window.location.hash));
  const [mode, setMode] = useState<EditorMode>('code');
  const [blocksOpened, setBlocksOpened] = useState(false);
  const [blockDirty, setBlockDirty] = useState(false);
  const [aiOpened, setAiOpened] = useState(false);
  const [colorModeId, setColorModeId] = useState<ColorModeId>(() => loadColorMode());
  const dark = colorMode(colorModeId).dark;
  const editorRef = useRef<EditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recoveryFileRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);
  const editorScroll = useRef(0);
  const hadGuide = useRef(false);
  const savedAssets = useRef<{key: string | null; original: Uint8Array | null; assets: AssetStore | null; initialized: boolean}>({key:null, original:null, assets:null, initialized:false});
  // 「利用者が編集したか」を覚えておく。サンプル・新規で下書きを置き換える前に確認するため（診断 N1）。
  const editedSinceLoad = useRef(false);
  const blocklyRef = useRef<BlocklyPanelHandle>(null);
  const [undo, setUndo] = useState<{ label: string; text: string; fileName: string; originalSb3: Uint8Array | null; importNotes: string[]; assetStore: AssetStore } | null>(null);
  const [savedAt, setSavedAt] = useState<string>('');
  const [clearingDraft, setClearingDraft] = useState(false);
  /**
   * 画面の変化を読み上げに伝える 1 か所（診断 v1.0.18 の B4）。
   * 診断件数・未反映のブロック・自動保存・下書き削除だけを、変化したときに流す。
   */
  const [live, setLive] = useState('');
  const announce = useCallback((message: string) => {
    // 同じ文言が続いても読み上げ直せるよう、末尾に空白を交互に足す（見た目には出ない）。
    setLive(prev => (prev.trim() === message ? `${message} ` : message));
  }, []);
  const lastSaveAnnounce = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const hasUnsavedDraft = useRef(false);

  useEffect(() => {
    const onHashChange = () => { const next=parseGuideHash(window.location.hash); if(next && !hadGuide.current) editorScroll.current=window.scrollY; setGuide(next); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  // Mobile editor scrolls with the page; the guide uses its own viewport.
  useEffect(() => {
    if (guide && !hadGuide.current) window.scrollTo(0, 0);
    if (!guide && hadGuide.current) requestAnimationFrame(() => window.scrollTo(0, editorScroll.current));
    hadGuide.current = !!guide;
  }, [guide]);
  const openGuide = (id: GuideId) => { if(!hadGuide.current) editorScroll.current=window.scrollY; window.location.hash = `guide/${id}`; setGuide(id); };
  const closeGuide = () => {
    history.pushState(null, '', window.location.pathname + window.location.search);
    setGuide(null);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  useEffect(() => { document.documentElement.lang = EN ? 'en' : 'ja'; document.title = EN ? 'ScratchPy Studio — Scratch and ScratchPy converter' : 'ScratchPy Studio — .sb3 ⇔ ScratchPy 相互変換'; }, []);

  // 配色の適用（data-theme + data-palette）と保存
  useEffect(() => {
    applyColorMode(colorModeId);
    saveColorMode(colorModeId);
  }, [colorModeId]);

  /** 編集経路（エディタ・ブロック反映）からの更新。下書き置換の確認に使う。 */
  const updateText = useCallback((next: string) => {
    editedSinceLoad.current = true;
    setText(next);
  }, []);

  const addLog = useCallback((kind: LogEntry['kind'], title: string, details?: string[]) => {
    setLog(prev => [{
      id: ++logSeq,
      time: new Date().toLocaleTimeString('ja-JP'),
      kind, title, details,
    }, ...prev].slice(0, 200));
  }, []);

  // A failed or timed-out metadata read must never enable writes to that draft.
  useEffect(() => {
    let active = true;
    let partial: RestoredDraft | undefined;
    const apply = (result: RestoredDraft) => {
      const draft = result.draft;
      if (draft) {
        setText(draft.text); setFileName(draft.fileName);
        setOriginalSb3(draft.originalSb3); setAssetStore(draft.assetStore); setImportNotes(draft.importNotes);
      }
      setRecovery(result.assetIssue ? result.marker ?? null : null);
      savedAssets.current = {key:result.assetKey, original:draft?.originalSb3 ?? null,
        assets:draft?.assetStore ?? assetStore, initialized:!result.legacy};
      setDraftCanSave(true);
      setDraftStatus('saved');
      // Protect the restored/partially restored asset even if another tab changes the current record.
      const protectedKey = result.assetKey;
      void cleanupOldDraftAssets(Date.now(), protectedKey ? [protectedKey] : []).catch(() => {});
    };
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      if (partial) apply(partial); // text is already known; preserve the unreadable payload
      else { setDraftCanSave(false); setDraftStatus('error'); }
      setDraftReady(true);
    }, 5000);
    readDraft(EN ? 'en' : 'ja', result => { if (active) partial = result; }).then(result => {
      if (active) apply(result);
    }).catch(() => {
      if (active) { setDraftCanSave(false); setDraftStatus('error'); }
    }).finally(() => {
      if (active) { clearTimeout(timeout); setDraftReady(true); }
    });
    return () => { active = false; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!draftReady || !draftCanSave) return;
    let active = true;
    let pending = true;
    setDraftStatus('saving');
    hasUnsavedDraft.current = true;
    const snapshot = { text, fileName, originalSb3, importNotes, assetStore };
    const save = () => {
      if (!pending) return;
      pending = false;
      // Transactions are serialized so an older snapshot can never finish last.
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        if (recovery) {
          await writeRecoveredText(EN ? 'en' : 'ja', snapshot.text, recovery);
          if (active) { hasUnsavedDraft.current = false; setDraftStatus('saved'); }
          return;
        }
        const prev = savedAssets.current;
        const changed = !prev.initialized || prev.original !== snapshot.originalSb3 || prev.assets !== snapshot.assetStore;
        const key = await writeDraft(EN ? 'en' : 'ja', snapshot, prev.key, changed);
        savedAssets.current = {key, original:snapshot.originalSb3, assets:snapshot.assetStore, initialized:true};
        if (active) { hasUnsavedDraft.current = false; setDraftStatus('saved'); setSavedAt(new Date().toLocaleTimeString(EN ? 'en-GB' : 'ja-JP')); }
      }).catch(() => { if (active) setDraftStatus('error'); });
    };
    const timer = setTimeout(save, 700);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const wasPending = pending;
      if (pending) { clearTimeout(timer); save(); }
      // A browser may terminate an asynchronous IndexedDB transaction on close.
      if (wasPending || hasUnsavedDraft.current || blockDirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('beforeunload', beforeUnload); };
  }, [draftReady, draftCanSave, text, fileName, originalSb3, importNotes, assetStore, blockDirty, recovery]);

  // ---- テキスト解析(デバウンス) ----
  // 大きなコード（診断 N18）では 300ms のたびに解析すると入力が引っかかるため、
  // 一定量を超えたら待ち時間を延ばす（結果は同じ、待つのは最後の 1 回だけ）。
  useEffect(() => {
    setAnalyzing(true);
    const delay = text.length > 120_000 ? 900 : 300;
    const t = setTimeout(() => {
      try {
        setAnalysis(analyzeText(text));
      } catch (e) {
        setAnalysis(null);
      } finally {
        setAnalyzing(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text]);

  // ---- .sb3 読み込み ----
  const loadSb3Bytes = useCallback(async (bytes: Uint8Array, name: string) => {
    setBusy(true);
    try {
      const imp = sb3ToText(bytes, EN ? 'en' : 'ja');
      setText(imp.text);
      setRecovery(null);
      setAssetStore(imp.assetStore);
      setFileName(name);
      setOriginalSb3(bytes.slice());
      setImportNotes(imp.notes);
      const details: string[] = [];
      details.push(`${t('スプライト数', 'Sprites')}: ${imp.project.targets.length - 1} / ${t('ブロック数', 'Blocks')}: ${imp.project.targets.reduce((n, t) => n + Object.keys(t.blocks ?? {}).length, 0)}`);
      for (const n of (EN ? imp.notesEn : imp.notes)) details.push(n);
      const unsup = Object.entries(imp.unsupportedOpcodes);
      if (unsup.length) details.push(`${t('未対応 opcode', 'Unsupported opcodes')}: ${unsup.map(([o, c]) => `${o}×${c}`).join(', ')}`);
      addLog(imp.notes.length ? 'warn' : 'ok', EN ? `Loaded ${name} (.sb3 → ScratchPy)` : `「${name}」を読み込みました (.sb3 → ScratchPy)`, details);
      setTab(imp.notes.length ? 'log' : 'diagnostics');
    } catch (e) {
      const msg = EN ? englishError(e) : e instanceof Error ? e.message : String(e);
      addLog('error', EN ? `Could not load ${name}` : `「${name}」の読み込みに失敗しました`, [msg]);
      setTab('log');
    } finally {
      setBusy(false);
    }
  }, [addLog]);

  const onOpenFile = useCallback(() => fileRef.current?.click(), []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (recovery && !window.confirm(t('この操作は復元したコードを置き換えます。コードを残してアセットだけ復元するには警告内のボタンを使用してください。続けますか？', 'This replaces your recovered code. To keep it, use Restore assets in the warning. Continue?'))) return;
    try { assertSb3Size(f.size); } catch (e) { addLog('error', t(`「${f.name}」を読み込めません`, `Could not load ${f.name}`), [EN ? englishError(e) : (e as Error).message]); setTab('log'); return; }
    await loadSb3Bytes(new Uint8Array(await f.arrayBuffer()), f.name);
  }, [addLog, loadSb3Bytes, recovery]);

  // ---- .sb3 書き出し ----
  const onDownload = useCallback(() => {
    if (recovery) return;
    if (blockDirty) { addLog('warn', t('未反映のブロック変更があります。先にコードに反映してください。','Apply your block changes before downloading.')); setTab('log'); return; }
    if (importNotes.length && !window.confirm(t('読み込んだ作品に変換時の警告があります。未対応ブロックや情報が書き出し時に失われる可能性があります。元の.sb3を残したうえで続けますか？','The imported project has conversion warnings. Unsupported blocks or data may be lost. Keep the original .sb3 and continue?'))) return;
    setBusy(true);
    try {
      const out = textToSb3(text, assetStore);
      const blob = new Blob([out.bytes as unknown as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base = fileName.replace(/\.sb3$/i, '') || 'project';
      a.href = url;
      a.download = `${base}.sb3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const blockCount = out.project.targets.reduce((n, t) => n + Object.keys(t.blocks ?? {}).length, 0);
      addLog('ok', EN ? `Downloaded ${base}.sb3 (ScratchPy → .sb3)` : `「${base}.sb3」をダウンロードしました (ScratchPy → .sb3)`, [
        `${t('サイズ', 'Size')}: ${(out.bytes.length / 1024).toFixed(1)} KB / ${t('ブロック数', 'Blocks')}: ${blockCount}`,
        ...out.diagnostics.map(d => EN ? englishDiagnostic(d) : d.message),
        ...out.validation.filter(v => v.severity === 'warning').map(v => `${t('[検証警告]', '[Validation warning]')} ${v.path}: ${EN ? englishDiagnostic(v) : v.message}`),
      ]);
      setTab('log');
    } catch (e) {
      if (e instanceof ExportError) {
        addLog('error', t('.sb3 の生成に失敗しました(エラーを修正してください)', 'Could not create .sb3; fix the errors first.'), e.diagnostics.map((d: Diagnostic) => `${d.loc ? (EN ? `Line ${d.loc.line}: ` : `${d.loc.line}行目: `) : ''}${EN && d.path ? `[Validation] ${d.path}: ` : ''}${EN ? englishDiagnostic(d) : d.message}`));
        setTab('log');
      } else {
        addLog('error', t('.sb3 の生成に失敗しました', 'Could not create .sb3'), [EN ? englishError(e) : (e as Error).message]);
        setTab('log');
      }
    } finally {
      setBusy(false);
    }
  }, [text, assetStore, fileName, addLog, importNotes, blockDirty, recovery]);

  // ---- 整形 ----
  const onFormat = useCallback(() => {
    const out = formatText(text, EN ? 'en' : 'ja');
    if (out.diagnostics.some(d => d.severity === 'error')) {
      addLog('warn', t('整形できませんでした(構文エラーを先に修正してください)', 'Could not format. Fix syntax errors first.'));
      setTab('diagnostics');
      return;
    }
    setText(out.text);
    addLog('info', t('コードを整形しました', 'Code formatted.'));
  }, [text, addLog]);

  // ---- 下書きの置き換え（サンプル・新規） ----
  /**
   * 置き換える前の状態を 1 段だけ覚えておく（診断 N1 の「元に戻す」）。
   * サンプル選択が無確認で下書きを消していたため、確認と取り消しの両方を用意する。
   */
  const rememberUndo = useCallback((label: string) => {
    setUndo({ label, text, fileName, originalSb3, importNotes, assetStore });
  }, [text, fileName, originalSb3, importNotes, assetStore]);

  const restoreUndo = useCallback(() => {
    if (!undo) return;
    setRecovery(null);
    setText(undo.text);
    setFileName(undo.fileName);
    setOriginalSb3(undo.originalSb3);
    setImportNotes(undo.importNotes);
    setAssetStore(undo.assetStore);
    editedSinceLoad.current = true;
    setUndo(null);
    addLog('ok', t('置き換える前のコードに戻しました', 'Restored the code from before the replacement'));
  }, [undo, addLog]);

  const onLoadSample = useCallback((id: string) => {
    const s = SAMPLES.find(x => x.id === id);
    if (!s) return;
    if (recovery && !window.confirm(t('復元したコードをサンプルで置き換えますか？', 'Replace your recovered code with a sample?'))) return;
    // 「新規」と同じ確認を通す（編集中のコードを黙って消さない）。
    if (editedSinceLoad.current && !window.confirm(t('編集中のコードをサンプルで置き換えますか？ 1 回だけ元に戻せます。必要なら先に .sb3 をダウンロードしてください。', 'Replace the code you are editing with this sample? You can undo once. Download your .sb3 first if needed.'))) return;
    rememberUndo(EN ? `Loaded sample: ${sampleTitle[s.id] ?? s.title}` : `サンプル「${s.title}」に置き換えました`);
    setRecovery(null);
    setText(localizeSample(s.code));
    setAssetStore(emptyAssetStore());
    setFileName('');
    setOriginalSb3(null);
    setImportNotes([]);
    editedSinceLoad.current = false;
    addLog('info', EN ? `Loaded sample: ${sampleTitle[s.id] ?? s.title}` : `サンプル「${s.title}」を読み込みました`, [EN ? sampleDescription[s.id] ?? s.description : s.description]);
  }, [addLog, recovery, rememberUndo]);

  const onNew = useCallback(() => {
    // 失うものが無いとき（空＋読み込み直後）は確認しない（診断 v1.0.18 の B6）。
    const hasWork = text.trim() !== '' || originalSb3 !== null;
    if (hasWork && !window.confirm(t('新しい作品を作成しますか？現在の下書きは上書きされます。必要なら先に .sb3 をダウンロードしてください。', 'Start a new project? This replaces the current draft. Download your .sb3 first if needed.'))) return;
    rememberUndo(t('新しい作品を作成しました', 'Started a new project'));
    setRecovery(null);
    setText(EN ? 'stage:\n    pass\n\nsprite Cat:\n    costume costume1\n\n    on flag:\n        say("Hello!")\n' : 'stage:\n    pass\n\nsprite Cat:\n    costume costume1\n\n    on flag:\n        say("こんにちは!")\n');
    setAssetStore(emptyAssetStore());
    setFileName('');
    setOriginalSb3(null);
    setImportNotes([]);
    editedSinceLoad.current = false;
  }, [rememberUndo, text, originalSb3]);

  const restoreAssets = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0]; event.target.value = '';
    if (!f) return;
    try {
      assertSb3Size(f.size);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const imp = sb3ToText(bytes, EN ? 'en' : 'ja');
      if (!window.confirm(t('選択した作品の画像・音を使用します。復元したコードは変更しません。スプライト・画像・音の名前が元の作品と一致することを確認してください。続けますか？', 'Use assets from this project without replacing the recovered code? Make sure sprite, costume, and sound names match the original.'))) return;
      setAssetStore(imp.assetStore); setOriginalSb3(bytes); setFileName(f.name); setImportNotes(imp.notes); setRecovery(null);
      addLog('ok', t('コードを残してアセットを復元しました', 'Assets restored; recovered code was kept'));
    } catch (e) {
      addLog('error', t('アセットを復元できませんでした', 'Could not restore assets'), [EN ? englishError(e) : e instanceof Error ? e.message : String(e)]);
      setTab('log');
    }
  }, [addLog]);
  const downloadCode = () => {
    const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'scratchpy-recovered.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ---- ドラッグ&ドロップ ----
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCount.current++;
      setDragging(true);
    };
    const onDragLeave = () => {
      dragCount.current = Math.max(0, dragCount.current - 1);
      if (dragCount.current === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCount.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (!/\.sb3$/i.test(f.name)) {
        addLog('error', t('ドロップされたファイルは .sb3 ではありません', 'The dropped file is not an .sb3 file.'), [f.name]);
        return;
      }
      if (recovery && !window.confirm(t('この操作は復元したコードを置き換えます。続けますか？', 'This replaces your recovered code. Continue?'))) return;
      // 上限超過などの例外をここで受け止める。以前は未処理の Promise 拒否になり、
      // 画面にもログにも何も出なかった（診断 N3）。.sb3 を開く経路と同じ形に揃える。
      try {
        assertSb3Size(f.size);
        await loadSb3Bytes(new Uint8Array(await f.arrayBuffer()), f.name);
      } catch (e) {
        addLog('error', t(`「${f.name}」を読み込めません`, `Could not load ${f.name}`), [EN ? englishError(e) : (e instanceof Error ? e.message : String(e))]);
        setTab('log');
      }
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadSb3Bytes, addLog, recovery]);

  /**
   * コード／ブロックの切り替え（診断 N2）。
   * ブロックの変更は「コードに反映」を押すまでコード・実行・保存に届かないため、
   * 切り替え時に自動で反映を試み、できないときだけ確認する（黙って食い違わせない）。
   */
  const changeMode = useCallback((next: EditorMode) => {
    if (next === mode) return;
    if (mode === 'blocks' && blockDirty && blocklyRef.current) {
      const applied = blocklyRef.current.applyToCode();
      if (applied) {
        addLog('ok', t('未反映だったブロックの変更をコードに反映しました', 'Applied your block changes to the code'));
      } else if (window.confirm(t('未反映のブロック変更をコードに反映できませんでした。変更を破棄してコード表示に戻りますか？', 'Your block changes could not be applied. Discard them and return to the code?'))) {
        blocklyRef.current.reloadFromText();
        addLog('warn', t('未反映のブロック変更を破棄しました', 'Discarded the unapplied block changes'));
      } else {
        return; // ブロック表示に留まる（キャンセル）
      }
    }
    setMode(next);
  }, [mode, blockDirty, addLog]);

  /** Esc で「元に戻す」トーストを閉じる（診断 v1.0.19 の P3）。 */
  useEffect(() => {
    if (!undo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // エディタの Tab 解除など、他の Esc の使い方と取り合いにならないよう、
      // トーストだけを閉じる（preventDefault はしない）。
      setUndo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  /** Ctrl/⌘+S で .sb3 を書き出す（診断 N14）。ブラウザ既定の「ページを保存」は抑止する。 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      onDownload();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDownload]);

  /** この端末に残っている下書きを消す（診断 S11・共有端末対策）。 */
  const onClearDrafts = useCallback(async () => {
    // 消す前に件数を出す（診断 v1.0.18 の B7）。0 件なら何もしない。
    let count = 0;
    try { count = await countDrafts(); } catch { count = 0; }
    if (count === 0) { addLog('info', t('この端末に削除する下書きはありません', 'There is no draft to delete on this device')); return; }
    if (!window.confirm(t(`このブラウザに保存した下書き ${count} 件（コード・読み込んだ画像と音）を削除します。画面のコードはそのまま残ります。よろしいですか？`, `Delete ${count} draft(s) saved in this browser (code, imported images and sounds)? The code on screen stays as it is.`))) return;
    setClearingDraft(true);
    try {
      hasUnsavedDraft.current = false; // 削除直後に自動保存で書き戻さない
      const removed = await clearDrafts();
      addLog('ok', t('この端末の下書きを削除しました', 'Deleted the draft saved on this device'), [`${t('削除した保存データ', 'Removed records')}: ${removed}`]);
      announce(t(`下書きを ${removed} 件削除しました`, `Deleted ${removed} saved draft(s)`));
      setDraftStatus('saved');
      setSavedAt('');
    } catch (e) {
      addLog('error', t('下書きを削除できませんでした', 'Could not delete the draft'), [EN ? englishError(e) : e instanceof Error ? e.message : String(e)]);
      setTab('log');
    } finally {
      setClearingDraft(false);
    }
  }, [addLog, announce]);

  const jumpToLine = useCallback((line: number) => {
    // ブロック表示中はクリックでコード表示に切り替えてからジャンプ
    setMode(m => {
      if (m === 'blocks') {
        requestAnimationFrame(() => requestAnimationFrame(() => editorRef.current?.jumpTo(line)));
        return 'code';
      }
      editorRef.current?.jumpTo(line);
      return m;
    });
  }, []);

  const TAB_ORDER = useMemo<TabId[]>(() => ['ai', 'diagnostics', 'structure', 'json', 'log'], []);
  const selectTab = useCallback((id: TabId) => { if (id === 'ai') setAiOpened(true); setTab(id); }, []);
  const onTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = TAB_ORDER.indexOf(tab);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? TAB_ORDER.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % TAB_ORDER.length
      : (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    selectTab(TAB_ORDER[next]);
    const button = document.getElementById(`tab-${TAB_ORDER[next]}`);
    button?.focus();
  }, [tab, TAB_ORDER, selectTab]);

  const errors = useMemo(() => analysis?.diagnostics.filter(d => d.severity === 'error') ?? [], [analysis]);
  const warnings = useMemo(() => analysis?.diagnostics.filter(d => d.severity === 'warning') ?? [], [analysis]);

  // 解析が落ち着いたら件数を読み上げる（入力のたびには流さない）。
  useEffect(() => {
    if (analyzing || !analysis) return;
    announce(errors.length || warnings.length
      ? t(`診断: エラー ${errors.length} 件、警告 ${warnings.length} 件`, `Diagnostics: ${errors.length} errors, ${warnings.length} warnings`)
      : t('診断: エラーや警告はありません', 'Diagnostics: no errors or warnings'));
  }, [analyzing, analysis, errors.length, warnings.length, announce]);
  useEffect(() => {
    if (blockDirty) announce(t('未反映のブロック変更があります', 'You have unapplied block changes'));
  }, [blockDirty, announce]);
  // 自動保存は 30 秒に 1 回だけ知らせる（毎秒読み上げない）。
  useEffect(() => {
    if (!savedAt) return;
    const now = Date.now();
    if (now - lastSaveAnnounce.current < 30_000) return;
    lastSaveAnnounce.current = now;
    announce(t(`ブラウザに自動保存しました ${savedAt}`, `Autosaved locally at ${savedAt}`));
  }, [savedAt, announce]);

  if (!draftReady) return <div className="app" role="status">{t('下書きを読み込み中…', 'Loading draft…')}</div>;

  return (
    <div className={`app ${guide ? 'is-guide' : ''}`}>
      <div className="editor-shell" hidden={guide !== null}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>
      {/* ツールバー */}
      <header className="toolbar">
        <h1 className="sr-only">{t('ScratchPy Studio', 'ScratchPy Studio')}</h1>
        <div className="brand">
          <div className="logo"><IconLogo size={22} /></div>
          <div>
            ScratchPy Studio
            <small>{t('.sb3 ⇔ ScratchPy 相互変換', '.sb3 ⇔ ScratchPy converter')}</small>
          </div>
        </div>
        {/* 狭い画面ではラベルを隠してアイコンだけにする（診断 v1.0.18 の A1）。読み上げ名は aria-label が持つ。 */}
        <button className="btn" onClick={onOpenFile} disabled={busy} aria-label={recovery ? t('.sb3 を開く（コードを置き換え）', 'Open .sb3 (replace code)') : t('.sb3 を開く', 'Open .sb3')} title={t('.sb3 を開く', 'Open .sb3')}><IconFolderOpen size={15} /> <span className="btn-label">{recovery ? t('.sb3 を開く（コードを置き換え）', 'Open .sb3 (replace code)') : t('.sb3 を開く', 'Open .sb3')}</span></button>
        <button className="btn primary" onClick={onDownload} disabled={busy || errors.length > 0 || !!recovery} aria-label={t('.sb3 をダウンロード', 'Download .sb3')} title={t('.sb3 をダウンロード（Ctrl/⌘+S）', 'Download .sb3 (Ctrl/⌘+S)')}>
          <IconDownload size={15} /> <span className="btn-label">{t('.sb3 をダウンロード', 'Download .sb3')}</span>
        </button>
        <button className="btn" onClick={onFormat} disabled={busy} aria-label={t('整形', 'Format')} title={t('コードを整形', 'Format the code')}><IconWand size={15} /> <span className="btn-label">{t('整形', 'Format')}</span></button>
        <button className="btn" onClick={onNew} disabled={busy} aria-label={t('新規', 'New')} title={t('新しい作品を作る', 'Start a new project')}><IconFilePlus size={15} /> <span className="btn-label">{t('新規', 'New')}</span></button>
        <div className="spacer" />
        <EditionMenu />
        <button className="btn guide-entry" onClick={() => openGuide('home')} aria-label={t('使い方・説明', 'Guide')} title={t('使い方・説明', 'Guide')}><IconBook size={15} /> <span className="btn-label">{t('使い方・説明', 'Guide')}</span></button>
        <select
          className="sample-select"
          value=""
          onChange={e => { if (e.target.value) onLoadSample(e.target.value); }}
          disabled={busy}
          aria-label={t('サンプルプログラムを読み込む', 'Load a sample program')}
          title={t('サンプルプログラムを読み込む', 'Load a sample program')}
        >
          <option value="" disabled>{t('サンプル…', 'Samples…')}</option>
          {SAMPLES.map(s => (
            <option key={s.id} value={s.id}>{EN ? sampleTitle[s.id] ?? s.title : s.title}</option>
          ))}
        </select>
        <label className="color-mode">
          {dark ? <IconMoon size={16} /> : <IconSun size={16} />}
          {/* 読み上げ名は select の aria-label に一本化する（sr-only と二重にしない）。
              モードの説明は <option title> が効かない環境があるため、説明文として関連付ける。 */}
          <select
            value={colorModeId}
            onChange={e => setColorModeId(e.target.value as ColorModeId)}
            title={t('カラーモードを選ぶ', 'Choose a colour mode')}
            aria-label={t('カラーモード', 'Colour mode')}
            aria-describedby="color-mode-hint"
          >
            {COLOR_MODES.map(m => (
              <option key={m.id} value={m.id}>{EN ? m.en : m.ja}</option>
            ))}
          </select>
          <span id="color-mode-hint" className="sr-only">{EN ? colorMode(colorModeId).hintEn : colorMode(colorModeId).hintJa}</span>
        </label>
        <input ref={fileRef} type="file" accept=".sb3,application/octet-stream" style={{ display: 'none' }} onChange={onFileChange} />
      </header>

      {recovery && <div role="alert" style={{padding:'12px 16px', background:'#fff3d1', color:'#4d3500'}}>
        <strong>{t('コードは復元しましたが、画像・音などのアセットを復元できませんでした。', 'Your code was restored, but images and sounds could not be restored.')}</strong>{' '}
        {t('コードのみ自動保存します。元の .sb3 を選ぶとコードを残してアセットを復元できます。復元まで .sb3 書き出しと実行は停止します。', 'Only code is autosaved. Select the original .sb3 to restore assets without replacing your code. Export and Run are disabled until then.')}{' '}
        <button className="btn" onClick={() => recoveryFileRef.current?.click()}>{t('元の .sb3 からアセットを復元', 'Restore assets from original .sb3')}</button>{' '}
        <button className="btn" onClick={downloadCode}>{t('コードを保存', 'Download code')}</button>
        <input ref={recoveryFileRef} type="file" accept=".sb3,application/octet-stream" style={{display:'none'}} onChange={restoreAssets} />
      </div>}
      {undo && (
        <div className="undo-banner" role="status">
          <span>{undo.label}</span>
          <button className="btn btn-sm" onClick={restoreUndo}>{t('元に戻す', 'Undo')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setUndo(null)} aria-label={t('案内を閉じる', 'Dismiss this message')}>{t('閉じる', 'Dismiss')}</button>
        </div>
      )}
      {/* メイン */}
      <main className="main">
        <div className="editor-pane">
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-title">
              <div className="segmented" role="group" aria-label={t('編集モード', 'Editing mode')}>
                <button className={`seg ${mode === 'code' ? 'active' : ''}`} aria-pressed={mode === 'code'} onClick={() => changeMode('code')} title={t('テキストで編集', 'Edit text')}>
                  <IconCode size={14} /> <span className="seg-label">{t('コード', 'Code')}</span>
                </button>
                <button className={`seg ${mode === 'blocks' ? 'active' : ''}`} aria-pressed={mode === 'blocks'} onClick={() => { setBlocksOpened(true); changeMode('blocks'); }} title={t('Blockly ブロックで編集', 'Edit Blockly blocks')}>
                  <IconPuzzle size={14} /> <span className="seg-label">{t('ブロック', 'Blocks')}</span>
                  {blockDirty && <span className="badge warn" title={t('未反映の変更があります', 'Unapplied changes')}>{t('未反映', 'Unapplied')}</span>}
                </button>
              </div>
              {fileName && <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>— {fileName}</span>}
              <div style={{ flex: 1 }} />
              <span className="draft-status" title={t('コードと読み込んだアセットをこのブラウザに保存。定期的に .sb3 も保存してください。未反映のブロック編集は保存されません。', 'Code and imported assets are saved in this browser. Also export .sb3 regularly. Unapplied block edits are not saved.')}>{(draftStatus !== 'error' && draftStatus !== 'saving') && <IconCheckCircle size={12} className="draft-status-icon" aria-hidden="true" />}
                {draftStatus === 'error' ? t('下書きの復元・保存に失敗しました。書き出して保存し、必要なら再読み込みしてください', 'Draft restore/save failed — export your work and reload if needed') : draftStatus === 'saving' ? t('保存中…', 'Saving…') : <><span className="draft-status-label">{t('ブラウザに自動保存', 'Autosaved locally')}</span>{savedAt ? ` ${savedAt}` : ''}</>}</span>
              <button className="btn btn-ghost btn-sm draft-clear" onClick={onClearDrafts} disabled={clearingDraft} aria-label={t('この端末に保存した下書きを削除します（共有端末向け）', 'Delete the draft saved on this device (for shared computers)')} title={t('この端末に保存した下書きを削除します（共有端末向け）', 'Delete the draft saved on this device (for shared computers)')}>
                <span className="draft-clear-label label-full">{t('端末の下書きを削除', 'Delete saved draft')}</span>
                <span className="draft-clear-label label-short">{t('下書きを削除', 'Delete draft')}</span>
              </button>
              {analyzing && <span className="pulse">{t('解析中…', 'Analyzing…')}</span>}
            </div>
            {mode === 'code' && (
              <Editor
                ref={editorRef}
                value={text}
                onChange={updateText}
                onCursor={setCursor}
                dragging={dragging}
              />
            )}
            {blocksOpened && <div className="blocks-container" style={{ display: mode === 'blocks' ? 'flex' : 'none' }}>
              <BlocklyPanel ref={blocklyRef} text={text} dark={dark} active={mode === 'blocks'} onTextChange={updateText} onDirtyChange={setBlockDirty} />
            </div>}
          </div>
        </div>

        <div className="side-pane">
          <ScratchPlayer text={text} assets={assetStore} blockDirty={blockDirty} original={originalSb3} hasConversionWarnings={importNotes.length>0} assetsUnavailable={!!recovery}/>
          {/* タブは ARIA のタブ構造にする（診断 N5）。左右キー・Home/End で移動できる。 */}
          <div className="tabs" role="tablist" aria-label={t('右パネル', 'Side panel')} onKeyDown={onTabKeyDown}>
            <button role="tab" id="tab-ai" aria-controls="side-tabpanel" aria-selected={tab === 'ai'} tabIndex={tab === 'ai' ? 0 : -1} className={`tab ai-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => { setAiOpened(true); setTab('ai'); }}><IconWand size={14} /> {t('AIチューター','AI Tutor')}</button>
            <button role="tab" id="tab-diagnostics" aria-controls="side-tabpanel" aria-selected={tab === 'diagnostics'} tabIndex={tab === 'diagnostics' ? 0 : -1} className={`tab ${tab === 'diagnostics' ? 'active' : ''}`} onClick={() => setTab('diagnostics')}>
              <IconActivity size={14} /> {t('診断', 'Diagnostics')}
              {errors.length > 0 && <span className="badge">{errors.length}</span>}
              {errors.length === 0 && warnings.length > 0 && <span className="badge warn">{warnings.length}</span>}
            </button>
            <button role="tab" id="tab-structure" aria-controls="side-tabpanel" aria-selected={tab === 'structure'} tabIndex={tab === 'structure' ? 0 : -1} className={`tab ${tab === 'structure' ? 'active' : ''}`} onClick={() => setTab('structure')}><IconBranch size={14} /> {t('構造', 'Structure')}</button>
            <button role="tab" id="tab-json" aria-controls="side-tabpanel" aria-selected={tab === 'json'} tabIndex={tab === 'json' ? 0 : -1} className={`tab ${tab === 'json' ? 'active' : ''}`} onClick={() => setTab('json')}><IconBraces size={14} /> JSON</button>
            <button role="tab" id="tab-log" aria-controls="side-tabpanel" aria-selected={tab === 'log'} tabIndex={tab === 'log' ? 0 : -1} className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
              <IconList size={14} /> {t('ログ', 'Log')}
              {log.length > 0 && <span className="badge" style={{ background: 'var(--muted)' }}>{log.length}</span>}
            </button>
          </div>
          <div className="panel tab-body" role="tabpanel" id="side-tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {aiOpened && <div className="ai-container" style={{display:tab==='ai'?'flex':'none'}}><AgentPanel text={text} assets={assetStore} blockDirty={blockDirty}/></div>}
            {tab === 'diagnostics' && (
              <DiagnosticsPanel analysis={analysis} onJump={jumpToLine} assetsUnavailable={!!recovery} empty={text.trim() === ''} />
            )}
            {tab === 'structure' && (
              <StructurePanel analysis={analysis} />
            )}
            {tab === 'json' && (
              <JsonPanel analysis={analysis} />
            )}
            {tab === 'log' && (
              <LogPanel entries={log} onClear={() => setLog([])} />
            )}
          </div>
        </div>
      </main>

      <StatusBar analysis={analysis} cursor={cursor} fileName={fileName} assetStore={assetStore} errors={errors.length} warnings={warnings.length} assetsUnavailable={!!recovery} />
      </div>
      {guide && (EN ? <EnglishGuide page={guide} dark={dark} onNavigate={openGuide} onClose={closeGuide} onToggleTheme={() => setColorModeId(dark ? 'standard' : 'night')} /> : <GuidePage page={guide} dark={dark} onNavigate={openGuide} onClose={closeGuide} onToggleTheme={() => setColorModeId(dark ? 'standard' : 'night')} />)}
    </div>
  );
}
