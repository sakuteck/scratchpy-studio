import { describe, expect, it, vi } from 'vitest';
import { askTutor, describeProviderError, OutputLimitError, requestModel, SYSTEM_PROMPT, TUTOR_ROLE } from '../app/ai/agent';
import { emptyAssetStore } from '../core/api';
const response=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Hello'}]}}]}),{status:200});
const signal=()=>new AbortController().signal;
describe('AI quality controls',()=>{
  it('keeps a standard request compatible by default',async()=>{
    const fetcher=vi.fn(async()=>response());await requestModel('gemini','secret','gemini-2.5-flash',[],signal(),fetcher);
    const config=JSON.parse((fetcher as any).mock.calls[0][1].body).generationConfig;expect(config).toEqual({maxOutputTokens:6000});
  });
  it('only enables high thinking for explicitly selected Gemini 2.5 Flash',async()=>{
    const fetcher=vi.fn(async()=>response());await requestModel('gemini','secret','gemini-2.5-flash',[],signal(),fetcher,undefined,undefined,{reasoningMode:'gemini-25-flash-high'});
    expect(JSON.parse((fetcher as any).mock.calls[0][1].body).generationConfig).toEqual({maxOutputTokens:32768,thinkingConfig:{thinkingBudget:24576}});
    for(const [provider,model] of [['gemini','gemini-2.5-pro'],['openai','gpt-4.1-mini'],['anthropic','claude-test']] as const){
      const f=vi.fn(async()=>response());await expect(requestModel(provider,'secret',model,[],signal(),f,undefined,undefined,{reasoningMode:'gemini-25-flash-high'})).rejects.toThrow('only supported');expect(f).not.toHaveBeenCalled();
    }
  });
  it('passes the opt-in mode to the Studio tutor request',async()=>{
    const fetcher=vi.fn(async()=>response());const result=await askTutor({provider:'gemini',key:'secret',model:'gemini-2.5-flash',prompt:'Say hello',source:'stage:\n    pass\n',assets:emptyAssetStore(),history:[],signal:signal(),fetcher,reasoningMode:'gemini-25-flash-high'});
    expect(result.reply).toBe('Hello');expect(JSON.parse((fetcher as any).mock.calls[0][1].body).generationConfig.thinkingConfig.thinkingBudget).toBe(24576);
  });
  it('reports truncated output accurately and never treats it as a complete response',async()=>{
    for(const [provider,data] of [['gemini',{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]}],['openai',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]}],['anthropic',{stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]}]] as const){
      const fetcher=vi.fn(async()=>new Response(JSON.stringify(data),{status:200}));const error=await requestModel(provider,'secret','model',[],signal(),fetcher).catch(e=>e);
      expect(error).toBeInstanceOf(OutputLimitError);expect(describeProviderError(error,'ja')).toContain('出力上限');
    }
  });
  it('defines the tutor role: explain only, never generate or apply a project',()=>{
    expect(SYSTEM_PROMPT.startsWith(TUTOR_ROLE)).toBe(true);
    for(const must of ['してよいこと','してはいけないこと','作品（プロジェクト）全体を書き下ろす','コードをエディターへ適用する','仕様書にない']) expect(TUTOR_ROLE).toContain(must);
    for(const banned of ['return one complete self-contained ScratchPy project','exactly one fenced block','automatically repair']) expect(SYSTEM_PROMPT).not.toContain(banned);
  });
});
