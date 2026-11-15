import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EnglishGuide, { ENGLISH_GUIDE_DOCS } from '../app/components/EnglishGuide';
import type { GuideId } from '../app/components/GuidePage';
import { analyzeText, textToSb3 } from '../core/api';
const render=(page:GuideId)=>renderToStaticMarkup(createElement(EnglishGuide,{page,dark:false,onClose:()=>{},onNavigate:()=>{},onToggleTheme:()=>{}}));
const byFile:Record<string,GuideId>={'usage.md':'usage','language.md':'language','sb3.md':'format','mapping.md':'mapping','architecture.md':'architecture'};
describe('English guide integrity',()=>{
  it('renders all five English sections through their last paragraphs',()=>{
    for(const doc of ENGLISH_GUIDE_DOCS){const html=render(doc.id);expect(html).toContain('<article');const lines=doc.content.trim().split('\n').filter(Boolean);const last=lines[lines.length-1];const plain=last.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`]/g,'');const text = html.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');expect(text).toContain(plain.slice(0,25));}
  });
  it('has no broken internal English links or anchor targets',()=>{
    const pages=Object.fromEntries(ENGLISH_GUIDE_DOCS.map(d=>[d.id,render(d.id)]));
    for(const doc of ENGLISH_GUIDE_DOCS){
      const html=pages[doc.id];
      for(const [,raw] of html.matchAll(/href="([^"]+)"/g)){
        const href=raw.replace(/&amp;/g,'&');if(/^https?:/.test(href))continue;
        const [file,fragment]=href.split('#');const target=file?byFile[file.split('/').pop()!]:doc.id;
        expect(target,`${doc.id}: unknown guide link ${href}`).toBeTruthy();
        if(fragment)expect(pages[target],`${doc.id}: missing anchor ${href}`).toContain(`id="${decodeURIComponent(fragment)}"`);
      }
    }
  });
  it('validates and exports all complete ScratchPy examples in the English language guide',()=>{
    const doc=ENGLISH_GUIDE_DOCS.find(d=>d.id==='language')!;
    const examples=[...doc.content.matchAll(/```scratchpy\s*\n([\s\S]*?)```/g)];expect(examples.length).toBeGreaterThanOrEqual(3);
    for(const [,code] of examples){expect(analyzeText(code).diagnostics.filter(d=>d.severity==='error')).toEqual([]);expect(textToSb3(code).bytes.length).toBeGreaterThan(0);}
  });
});
