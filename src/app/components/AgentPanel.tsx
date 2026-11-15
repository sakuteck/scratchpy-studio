import { useEffect, useMemo, useRef, useState } from 'react';
import { EN, t } from '../i18n';
import type { AssetStore } from '../../core/api';
import { DEFAULT_MODELS, askTutor, describeProviderError, diagnosticLines, MAX_MESSAGE_CHARS, MAX_SOURCE_CHARS, type Provider, type Turn } from '../ai/agent';
import { IconWand, IconAlertTriangle, IconArrowRight, IconRefresh, IconLightbulb } from './Icons';
import { renderTutorMessage } from '../ai/tutorText';
import './agent.css';

/**
 * AI は「わからない部分を教える」専用。プロジェクトの生成・自動修正・適用は行わない。
 * 入力は API キー（BYOK）と質問だけで、現在のコードと診断は文脈として同梱される。
 */
type ChatMessage = {role:'user'|'assistant'|'error'; content:string; notice?:boolean};
interface Props { text:string; assets:AssetStore; blockDirty:boolean }

const CHIPS = [
  { ja:'診断メッセージの意味を教えて', en:'Explain what my diagnostics mean' },
  { ja:'このコードが何をしているか教えて', en:'Explain what my code is doing' },
  { ja:'型（int / str / bool）の考え方を教えて', en:'Teach me how the types work' },
];

export default function AgentPanel({text,assets,blockDirty}:Props) {
  const [provider,setProvider]=useState<Provider>('gemini');
  const secureContext=typeof window==='undefined' || window.isSecureContext;
  const [key,setKey]=useState('');
  const [model,setModel]=useState(DEFAULT_MODELS.gemini);
  const [settings,setSettings]=useState(true);
  const [consent,setConsent]=useState(false);
  const [deepReasoning,setDeepReasoning]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<Turn[]>([]);
  const [lastContextChars,setLastContextChars]=useState<number|null>(null);
  const [prompt,setPrompt]=useState('');
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState('');
  const controller=useRef<AbortController|null>(null);
  const logRef=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[messages,progress]);
  const changeProvider=(value:Provider)=>{setProvider(value);setModel(DEFAULT_MODELS[value]);setKey('');setConsent(false);setDeepReasoning(false);};
  // 大きなコードでも入力のたびに再解析しないよう、コードとアセットが変わったときだけ計算する。
  const diagnostics=useMemo(()=>diagnosticLines(text,assets,EN),[text,assets]);
  const diagnosticCount=diagnostics.errors.length+diagnostics.warnings.length;
  // 何を送るのかを、実際に送る内容から数えて示す（履歴・前回の送信量も含む）。
  const sentTurns=Math.min(history.length,8);
  const contextInfo=`${EN
    ? `Sent with your question: the first ${Math.min(text.length,MAX_SOURCE_CHARS).toLocaleString()} characters of the code, ${diagnosticCount} diagnostic(s) and ${sentTurns} earlier message(s) (up to 8).`
    : `質問と一緒に送るもの：コードの先頭 ${Math.min(text.length,MAX_SOURCE_CHARS).toLocaleString()} 文字・診断 ${diagnosticCount} 件・これまでのやりとり ${sentTurns} 件（最大8件）。`}${
    lastContextChars===null
      ? ''
      : (EN ? ` Last request: ${lastContextChars.toLocaleString()} characters in total.` : ` 前回の送信量：合計 ${lastContextChars.toLocaleString()} 文字。`)}`;
  const send=async()=>{
    const request=prompt.trim();
    if(!request || !key.trim() || !model.trim() || !consent || running || !secureContext)return;
    const savedKey=key.trim(); const base=text; const previous=history;
    // メッセージやコードに紛れたキーは送らない・表示しない。
    if(request.includes(savedKey)||base.includes(savedKey)){setMessages(m=>[...m,{role:'error',content:t('APIキーがメッセージまたはコードに含まれています。取り除いてから送信してください。','Remove the API key from the message or code before sending.')}]);return;}
    const abort=new AbortController();controller.current=abort;setRunning(true);setProgress(t('AIに問い合わせ中…','Contacting AI…'));setPrompt('');setSettings(false);
    setMessages(m=>[...m,{role:'user',content:request}]);
    try{
      const result=await askTutor({provider,key:savedKey,model,en:EN,prompt:request,source:base,assets,history:previous,signal:abort.signal,reasoningMode:deepReasoning?'gemini-25-flash-high':'standard'});
      setMessages(m=>[...m,{role:'assistant',content:result.reply,notice:result.blocked}]);
      setLastContextChars(result.contextChars);
      setHistory(h=>[...h,{role:'user' as const,content:request},{role:'assistant' as const,content:result.reply}].slice(-8));
    }catch(e){setPrompt(request);const canceled=(e as Error).name==='AbortError'; const detail=describeProviderError(e,EN?'en':'ja');const message=canceled?t('処理を中止しました。','Stopped.'):t(`接続に失敗しました：${detail}`,`Connection failed: ${detail}`);setMessages(m=>[...m,{role:'error',content:message.split(savedKey).join('[redacted]')}]);}
    finally{if(controller.current===abort)controller.current=null;setRunning(false);setProgress('');}
  };
  const clear=()=>{if(messages.length && !window.confirm(t('会話を消去しますか？エディターのコードは残ります。','Clear the chat? The editor code will stay.')))return;setMessages([]);setHistory([]);setLastContextChars(null);};
  return <div className="ai-panel">
    <div className="ai-titlebar"><div className="ai-title-icon"><IconWand size={18}/></div><div><strong>{t('AI チューター','AI Tutor')}</strong><span>{t('わからない部分を、少しずつ教えます','Explains the parts you are stuck on')}</span></div><button onClick={()=>setSettings(v=>!v)} disabled={running} aria-expanded={settings} className="ai-settings-toggle">{settings?t('設定を閉じる','Hide settings'):t('API設定','API settings')}</button></div>
    {settings ? <div className="ai-config" role="region" aria-label={t('API設定','API settings')} onKeyDown={e=>{if(e.key==='Escape')setSettings(false)}}>
      <div className="ai-config-heading"><span className="ai-config-badge">01</span><div><h3>{t('AIを使う準備','Set up your AI')}</h3><p>{t('サービスとモデルを選び、APIキーを入力します。','Choose a service and model, then enter your API key.')}</p></div></div>
      <div className="ai-fields"><label>{t('プロバイダー','Provider')}<select value={provider} disabled={running} onChange={e=>changeProvider(e.target.value as Provider)}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></label><label>{t('モデルID（変更可）','Model ID (editable)')}<input value={model} disabled={running} onChange={e=>{setModel(e.target.value);setDeepReasoning(false);}} spellCheck={false}/></label><label>API key<input value={key} type="password" autoComplete="off" disabled={running} onChange={e=>setKey(e.target.value)} placeholder={t('APIキーを入力','Enter your API key')} aria-label={t('APIキー','API key')}/></label></div>
      {provider==='gemini' && model.trim()==='gemini-2.5-flash' && <label className="ai-reasoning"><input type="checkbox" checked={deepReasoning} disabled={running} onChange={e=>setDeepReasoning(e.target.checked)}/><span><strong>{t('高推論モード（Gemini 2.5 Flash専用）','High reasoning mode (Gemini 2.5 Flash only)')}</strong><small>{t('思考予算を最大24,576、応答上限を32,768トークンに設定。通常より時間・料金が大きく増える場合があります。性能や成功を保証するものではありません。','Sets a thinking budget of up to 24,576 and a response limit of 32,768 tokens. It may take longer and cost substantially more; better results are not guaranteed.')}</small></span></label>}
      <div className="ai-privacy"><IconAlertTriangle size={16}/><p>{t('キーはこのページのメモリーだけに保持し、保存しません。ブラウザから各社に直接送信するため、端末・ブラウザ拡張機能などにキーが見える可能性があります。信頼できるサイトだけで使い、共有端末を避け、利用制限を設定してください。','The key stays in this page’s memory and is not saved. Requests go directly from your browser; your device and browser extensions may expose the key. Use only a trusted site, avoid shared devices, and restrict your key’s permissions and spending.')}</p></div>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={running} onChange={e=>setConsent(e.target.checked)}/><span>{t('コードの一部・会話・診断が選択した事業者に送信され、API利用料が発生し得ることを理解しました。','I understand that part of the code, the chat and diagnostics are sent to the selected provider and API usage may be billed.')}</span></label>
      <p className="ai-config-note">{t('AIは説明だけを行い、コードの生成・修正・適用はしません。画像・音声ファイル自体は送信しません。Geminiの503は自動再送します（最長3回の通信）。Anthropicの組織設定によっては直接接続が拒否されます。','The AI explains only; it never generates, edits or applies code. Image and audio files are not sent. Gemini 503 responses are retried automatically (up to three requests). Some Anthropic organizations block direct browser requests.')}</p>
      <button className="ai-config-done" onClick={()=>setSettings(false)}>{t('質問に戻る','Back to questions')} <IconArrowRight size={16}/></button>
    </div> : <>
    <div className="ai-log" ref={logRef} role="log" aria-label={t('AIとの会話','AI conversation')} aria-live="polite">
      {messages.length===0 && <div className="ai-welcome"><span><IconLightbulb size={22}/></span><h3>{t('どこで困っていますか？','Where are you stuck?')}</h3><p>{t('説明専用です。わからない部分をひとつずつ教えます。','Explains only, one part at a time.')}</p><div className="ai-chip-row">{CHIPS.map(c=><button key={c.en} onClick={()=>setPrompt(t(c.ja,c.en))}>{t(c.ja,c.en)}</button>)}</div></div>}
      {messages.map((m,i)=><div key={i} className={`ai-message ${m.role}`}><div className="ai-message-label">{m.role==='user'?t('あなた','You'):m.role==='error'?t('お知らせ','Notice'):t('AIチューター','AI tutor')}{m.notice && <span className="ai-message-note">{t('一部を伏せました','Part hidden')}</span>}</div><div className="ai-message-content">{renderTutorMessage(m.content)}</div></div>)}
      {running && <div className="ai-progress" role="status"><span className="ai-spinner"/>{progress} <button onClick={()=>controller.current?.abort()}>{t('中止','Stop')}</button></div>}
    </div>
    {!secureContext && <div className="ai-block-warning">{t('安全でない接続ではAPIキーを送信できません。HTTPS または localhost で開いてください。','API keys cannot be sent from an insecure connection. Use HTTPS or localhost.')}</div>}
    {blockDirty && <div className="ai-block-warning">{t('未反映のブロック変更はAIに送られません。ブロックの内容について聞くときは、先に「コードに反映」をしてください。','Unapplied block edits are not sent. Apply them to code first if you want to ask about them.')}</div>}
    <div className="ai-compose"><textarea value={prompt} maxLength={MAX_MESSAGE_CHARS} onChange={e=>setPrompt(e.target.value)} placeholder={t('わからないことを入力（例：このエラーの意味は？）','Ask about something you do not understand')} aria-label={t('AIへのメッセージ','Message to AI')} disabled={running} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();void send();}}}/><div><button className="ai-clear" disabled={running||!messages.length} onClick={clear}><IconRefresh size={14}/>{t('会話を消去','Clear chat')}</button><span>{t('Ctrl/⌘ + Enter で送信','Ctrl/⌘ + Enter to send')}</span><button className="ai-send" disabled={running||!secureContext||!prompt.trim()||!key.trim()||!model.trim()||!consent} onClick={()=>void send()}>{t('送信','Send')} <IconArrowRight size={16}/></button></div></div>
    <div className="ai-context-note">{contextInfo}</div>
    <div className="ai-footer">{t('AIは間違えることがあります。説明を鵜呑みにせず、エディターの診断とScratchでの動作を確認してください。','AI can be wrong. Check its explanation against the editor diagnostics and how it behaves in Scratch.')}</div>
    </>}
  </div>;
}
