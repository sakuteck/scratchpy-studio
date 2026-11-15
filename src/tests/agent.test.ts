import { describe,it,expect,vi } from 'vitest';
import {askTutor,buildTutorContext,diagnosticLines,sanitizeTutorReply,requestModel,SYSTEM_PROMPT,MAX_SOURCE_CHARS,MAX_SNIPPET_LINES,MAX_TOTAL_SNIPPET_LINES,type Provider} from '../app/ai/agent';
import {emptyAssetStore} from '../core/api';
const good='stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    on flag:\n        say("Hello!")\n';
const bad='stage:\n    var score: int = "wrong"\n';
const fenced=(code:string)=>`Here is the project.\n\`\`\`scratchpy\n${code}\`\`\``;
const response=(provider:Provider,text:string)=>provider==='openai'?{status:'completed',output:[{type:'reasoning',content:[]},{type:'message',content:[{type:'output_text',text}]}]}:provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}:{content:[{type:'text',text}],stop_reason:'end_turn'};
const makeFetch=(provider:Provider,replies:string[])=>vi.fn(async()=>new Response(JSON.stringify(response(provider,replies.shift()!)),{status:200,headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
const base={provider:'openai' as const,key:'secret-key-test',model:'gpt-4.1-mini',prompt:'Why is there an error?',source:bad,assets:emptyAssetStore(),history:[],signal:new AbortController().signal};

describe('AI provider adapters and the explain-only tutor',()=>{
  for(const provider of ['openai','gemini','anthropic'] as const){
    it(`${provider}: correct endpoint, credentials, context and system instruction`,async()=>{
      const f=makeFetch(provider,['Hello']);
      const out=await requestModel(provider,'secret-key-test','test-model',[{role:'user',content:'request'}],new AbortController().signal,f);
      expect(out).toBe('Hello');const [url,init]=(f as any).mock.calls[0];const data=JSON.parse(init.body);
      expect(url).toMatch(provider==='openai'?/api\.openai\.com\/v1\/responses/:provider==='gemini'?/generativelanguage\.googleapis\.com/:/api\.anthropic\.com\/v1\/messages/);
      expect(JSON.stringify(data)).toContain('ScratchPy');expect(JSON.stringify(data)).toContain('request');expect(JSON.stringify(data)).not.toContain('secret-key-test');
      if(provider==='openai'){expect(init.headers.Authorization).toBe('Bearer secret-key-test');expect(data.store).toBe(false);}
      if(provider==='gemini')expect(init.headers['x-goog-api-key']).toBe('secret-key-test');
      if(provider==='anthropic'){expect(init.headers['x-api-key']).toBe('secret-key-test');expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');}
    });
  }
  it('ships the real language specification and the processing blueprint',()=>{
    // 設計図（docs/01）= 仕様書そのもの。字句・構文・型・.sb3 変換の節がそのまま入っていること。
    expect(SYSTEM_PROMPT).toContain('ScratchPy 言語仕様書');
    for(const section of ['# 言語処理の設計図','lexer','parser','checker','exporter','importer','validate'])
      expect(SYSTEM_PROMPT).toContain(section);
    expect(SYSTEM_PROMPT).toContain('# 役割（Role）');
  });
  it('answers a question with the current code and diagnostics as context, without a repair loop',async()=>{
    const f=makeFetch('openai',['The variable score is declared int but holds a string.']);
    const result=await askTutor({...base,fetcher:f});
    expect(result.reply).toContain('declared int');expect(f).toHaveBeenCalledTimes(1);expect(result.blocked).toBe(false);
    const payload=JSON.parse((f as any).mock.calls[0][1].body);
    expect(JSON.stringify(payload.input)).toContain('score');expect(JSON.stringify(payload.input)).toContain('ローカル診断');
    expect(JSON.stringify(payload.input)).toContain('説明だけ');
  });
  it('keeps a short illustrative snippet but omits a whole generated project',()=>{
    const short=['```scratchpy','if score > 10:','    say("high")','```'].join('\n');
    expect(sanitizeTutorReply(short).blocked).toBe(false);expect(sanitizeTutorReply(short).text).toContain('say("high")');
    const full=sanitizeTutorReply(fenced(good));
    expect(full.blocked).toBe(true);expect(full.text).not.toContain('sprite Cat');expect(full.text).toContain('説明専用');
    const long=sanitizeTutorReply(['```scratchpy',...Array(MAX_SNIPPET_LINES+3).fill('    pass'),'```'].join('\n'));
    expect(long.blocked).toBe(true);
  });
  it('omits a tagged project fence even when the model is asked to build one',async()=>{
    const f=makeFetch('openai',[fenced(good)]);const r=await askTutor({...base,prompt:'Make me a whole game',fetcher:f});
    expect(r.blocked).toBe(true);expect(r.reply).not.toContain('sprite Cat');
  });
  it('closes the four raw-markdown bypasses found in the v1.0.13 review',()=>{
    const body=Array(40).fill('    say("hi")');
    // 1) ~~~ フェンス
    const tilde=['~~~scratchpy',...body,'~~~'].join('\n');
    expect(sanitizeTutorReply(tilde).blocked).toBe(true);
    expect(sanitizeTutorReply(tilde).text).not.toContain('say("hi")');
    // 2) 12 行ずつを複数の塊に分ける（合計 24 行超）
    const chunk=['```python',...Array(MAX_SNIPPET_LINES).fill('    say("a")'),'```'].join('\n');
    const many=Array(5).fill(chunk).join('\n\n');
    const manyResult=sanitizeTutorReply(many);
    expect(manyResult.blocked).toBe(true);
    expect(manyResult.text.match(/say\("a"\)/g)?.length ?? 0).toBeLessThanOrEqual(MAX_TOTAL_SNIPPET_LINES);
    // 3) 言語タグ無しフェンスで作品全体を書く
    const untagged=['```','stage:',
      '    var score: int = 0','sprite Cat:','    x: 0','    y: 0','```'].join('\n');
    expect(sanitizeTutorReply(untagged).blocked).toBe(true);
    expect(sanitizeTutorReply(untagged).text).not.toContain('sprite Cat');
    // 4) フェンス無しの 40 行インデント
    const indented=Array(40).fill('    move(10)').join('\n');
    const indentedResult=sanitizeTutorReply(indented);
    expect(indentedResult.blocked).toBe(true);
    expect(indentedResult.text.match(/move\(10\)/g)?.length ?? 0).toBe(MAX_SNIPPET_LINES);
  });
  it('leaves ordinary prose and one short snippet untouched',()=>{
    const reply=['`stage:` の行に注目してください。','','```scratchpy','if score > 10:','    say("high")','```'].join('\n');
    const result=sanitizeTutorReply(reply,true);
    expect(result.blocked).toBe(false);
    expect(result.text).toContain('say("high")');
    expect(result.text).toContain('`stage:`');
    expect(sanitizeTutorReply('短い説明だけです。').text).toBe('短い説明だけです。');
  });
  it('counts diagnostics locally, in the requested language',()=>{
    const ja=diagnosticLines(bad,emptyAssetStore(),false);const en=diagnosticLines(bad,emptyAssetStore(),true);
    expect(ja.errors.length).toBeGreaterThan(0);expect(ja.errors.join(' ')).toMatch(/型|str|int/);
    expect(en.errors.join(' ')).toContain("Variable 'score'");expect(en.errors.join(' ')).not.toMatch(/[ぁ-んァ-ヶ]/);
    expect(diagnosticLines(good,emptyAssetStore(),true).errors).toEqual([]);
  });
  it('truncates a long project instead of sending all of it',()=>{
    const longSource='# pad\n'.repeat(MAX_SOURCE_CHARS);
    const context=buildTutorContext({prompt:'q',source:longSource,assets:emptyAssetStore(),en:true});
    expect(context.length).toBeLessThan(MAX_SOURCE_CHARS+4000);expect(context).toContain('only the beginning is shown');
  });
  it('refuses to send a credential accidentally embedded in the project or prompt',async()=>{
    const f=makeFetch('openai',[]);await expect(askTutor({...base,prompt:'secret-key-test',fetcher:f})).rejects.toThrow('Remove the API key');expect(f).not.toHaveBeenCalled();
    await expect(askTutor({...base,source:bad+'# secret-key-test\n',fetcher:f})).rejects.toThrow('Remove the API key');expect(f).not.toHaveBeenCalled();
  });
  it('rejects an over-long question before contacting the provider',async()=>{
    const f=makeFetch('openai',[]);await expect(askTutor({...base,prompt:'x'.repeat(5000),fetcher:f})).rejects.toThrow('too long');expect(f).not.toHaveBeenCalled();
  });
  it('redacts credentials from provider errors and output',async()=>{
    const f=vi.fn(async()=>new Response(JSON.stringify({error:{message:'invalid secret-key-test'}}),{status:401})) as unknown as typeof fetch;
    await expect(requestModel('openai','secret-key-test','test-model',[],new AbortController().signal,f)).rejects.toThrow('invalid [redacted]');
    const output=await requestModel('openai','secret-key-test','test-model',[],new AbortController().signal,makeFetch('openai',['echo secret-key-test']));expect(output).toBe('echo [redacted]');
  });
  it('accepts long responses without accidental truncation',async()=>{
    const output='x'.repeat(1500);expect(await requestModel('openai','test-key','test-model',[],new AbortController().signal,makeFetch('openai',[output]))).toBe(output);
  });
  it('stops immediately when cancelled',async()=>{
    const abort=new AbortController();abort.abort();const f=makeFetch('openai',[]);
    await expect(askTutor({...base,signal:abort.signal,fetcher:f})).rejects.toMatchObject({name:'AbortError'});expect(f).not.toHaveBeenCalled();
  });
});
