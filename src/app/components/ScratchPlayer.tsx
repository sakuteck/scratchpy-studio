import {useEffect,useRef,useState} from 'react';
/**
 * 実行エンジン（TurboWarp scaffolding, 3.8 MB）は全 4 版で 1 コピーを共有する。
 * Vite の `?url` 読み込みだと版ごとに複製されて dist が 4 倍になるため、
 * ルート直下 /engine/scaffolding.js を参照する（ビルド時に scripts/build-pages.mjs が配置）。
 */
const ENGINE_PATH = import.meta.env.VITE_ENGINE_URL
  || `${import.meta.env.BASE_URL}engine/scaffolding.js?v=${__APP_VERSION__}`;
import {textToSb3,type AssetStore} from '../../core/api';
import {t,EN} from '../i18n';
import {englishError} from '../diagnosticText';
import {RUNNER_SANDBOX,postToRunner} from './runnerBridge';
import './scratch-player.css';

/** 実行エンジンの絶対 URL（SCRATCHPY_PARENT の payload に載せる唯一の URL）。 */
const engineUrl=()=>new URL(import.meta.env.DEV?'/__scratchpy_engine__.js':ENGINE_PATH,window.location.href).href;

interface Props { text:string; assets:AssetStore; blockDirty:boolean; original?:Uint8Array|null; hasConversionWarnings?:boolean; assetsUnavailable?:boolean; }
export default function ScratchPlayer({text,assets,blockDirty,original,hasConversionWarnings=false,assetsUnavailable=false}:Props) {
  // 送信は runnerBridge に集約（sandbox iframe は不透明オリジンなので targetOrigin は '*' しか選べない。
  // 理由と「何を送らないか」は runnerBridge.ts を参照）。受信側は event.source と event.origin を検査する。
  const iframe=useRef<HTMLIFrameElement>(null);
  const pending=useRef<Uint8Array|null>(null);
  const ready=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const runningRef=useRef<{text:string;assets:AssetStore;original:boolean;bytes?:Uint8Array|null}|null>(null);
  const [opened,setOpened]=useState(false);
  const [status,setStatus]=useState<'idle'|'loading'|'running'|'stopped'|'error'>('idle');
  const [error,setError]=useState('');
  const [source,setSource]=useState<'code'|'original'>('code');
  const [snapshot,setSnapshot]=useState<{text:string;assets:AssetStore;original:boolean;bytes?:Uint8Array|null}|null>(null);
  const stale=!!snapshot&&(snapshot.original!==(source==='original')||(snapshot.original?snapshot.bytes!==original:(snapshot.text!==text||snapshot.assets!==assets||blockDirty)));
  useEffect(()=>{
    const handle=(event:MessageEvent)=>{
      if(event.source!==iframe.current?.contentWindow || event.origin!=='null' || event.data?.source!=='scratchpy-runner')return;
      if(event.data.type==='ready'){
        ready.current=true;
        if(pending.current){postToRunner(iframe.current?.contentWindow,{type:'run',engineUrl:engineUrl(),bytes:pending.current});pending.current=null;}
      }else if(event.data.type==='running'){if(timer.current)clearTimeout(timer.current);setStatus('running');setSnapshot(runningRef.current);}
      else if(event.data.type==='stopped') setStatus('stopped');
      else if(event.data.type==='error'){if(timer.current)clearTimeout(timer.current);setStatus('error');setError(String(event.data.detail||''));}
    };
    window.addEventListener('message',handle);return()=>{window.removeEventListener('message',handle);if(timer.current)clearTimeout(timer.current);};
  },[]);
  useEffect(()=>{if(!original&&source==='original')setSource('code');},[original,source]);
  const run=()=>{
    if(assetsUnavailable||status==='loading'||(source==='code'&&blockDirty))return;
    try{
      const bytes=source==='original'&&original ? original : textToSb3(text,assets).bytes;
      runningRef.current={text,assets,original:source==='original'&&!!original,bytes:original};setError('');setStatus('loading');
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>{pending.current=null;ready.current=false;setOpened(false);setStatus('error');setError(t('読み込みが時間内に終わりませんでした。もう一度実行してください。','Loading timed out. Please try again.'));},30000);
      if(ready.current && iframe.current?.contentWindow)postToRunner(iframe.current.contentWindow,{type:'run',engineUrl:engineUrl(),bytes});
      else {pending.current=bytes;setOpened(true);}
    }catch(e){setStatus('error');setError(EN ? englishError(e) : e instanceof Error ? e.message : String(e));}
  };
  const stop=()=>{postToRunner(iframe.current?.contentWindow,{type:'stop'});};
  return <section className="scratch-player" aria-label={t('Scratch実行プレビュー','Scratch run preview')}>
    <div className="scratch-player-head"><div><strong>{t('Scratch実行','Scratch preview')}</strong><small>{t('TurboWarp エンジン','TurboWarp engine')}</small></div><div className="scratch-player-controls"><button className="scratch-player-start" disabled={assetsUnavailable||status==='loading'||(source==='code'&&blockDirty)} onClick={run} title={t('現在の作品を読み込み、緑の旗で開始','Load the project and start with the green flag')}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 21V3m1 1c4-3 7 3 13 0v11c-6 3-9-3-13 0" fill="#27ae60" stroke="#168346" strokeWidth="2" strokeLinejoin="round"/></svg> {status==='loading'?t('準備中','Loading'):t('実行','Run')}</button><button className="scratch-player-stop" disabled={!opened||status==='loading'} onClick={stop} aria-label={t('停止','Stop')}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="#e15c58"/></svg></button></div></div>
    {original && <label className="scratch-player-select">{t('実行する作品','Project to run')} <select value={source} disabled={status==='loading'} onChange={e=>setSource(e.target.value as 'code'|'original')}><option value="code">{t('現在のコード','Current code')}</option><option value="original">{t('読み込んだ元の .sb3','Original imported .sb3')}</option></select></label>}
    <div className="scratch-player-stage">{opened?<iframe ref={iframe} title={t('Scratchステージ','Scratch stage')} sandbox={RUNNER_SANDBOX} src={`${import.meta.env.BASE_URL}scratch-runner/index.html`}/>:<div className="scratch-player-empty"><strong>{t('ここで作品を動かそう','Run your project here')}</strong><span>{t('「実行」を押すと、今のコードをScratch形式にして動かします。','Select Run to play the current code.')}</span></div>}</div>
    <p className="scratch-player-note" role="status">{status==='error'?`${t('実行できません：','Could not run: ')}${error}`:status==='loading'?t('Scratchを準備しています…','Preparing Scratch…'):assetsUnavailable?t('元の .sb3 からアセットを復元してください。','Restore assets from the original .sb3 first.'):blockDirty&&source==='code'?t('先にブロックの変更をコードに反映してください。','Apply block changes to the code first.'):stale?t('作品または実行元が変わりました。「実行」で更新できます。','The project or source changed. Select Run to update.'):source==='original'?t('元のファイルを実行します。コードの編集は反映されません。','Runs the original file, without your code edits.'):hasConversionWarnings?t('変換時に警告があり、元の作品と動きが異なる場合があります。','Conversion warnings mean this may behave differently from the original.'):t('実行は変換後の作品です。外部拡張・通信・カメラなどは無効です。','Runs the converted project. External extensions, network and camera are disabled.')}</p>
  </section>;
}
