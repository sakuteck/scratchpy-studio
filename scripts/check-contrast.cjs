// 使い方: npm run build && npm run check:contrast
// 実ブラウザで 4 版 × 主要画面を走査し、可視テキストのコントラスト（WCAG AA）を全要素について測る。
// 半透明・グラデーションは親要素まで合成して評価する（宣言値だけでなく実描画が基準）。
const { chromium } = require('playwright');
const path = require('node:path');

const DIST = path.resolve(__dirname, '..', 'dist');
const EDITIONS = [
  ['/', 'studio-ja'],
  ['/en/', 'studio-en'],
  ['/education/', 'edu-ja'],
  ['/education/en/', 'edu-en'],
];
// 配色（v1.0.18）。診断 v1.0.17 の N7 は「夜モードで検査タブ・切り替えのラベルが読めない」で、
// 明るい配色しか測っていなかったため見落としていた。夜モードも同じ基準で測る。
// 6 配色すべて（診断 v1.0.18 の C3）。以前は 3 配色だけで、scratch / pastel / contrast の
// 色を変えたときに検出できなかった。
const COLOR_MODES = ['standard', 'scratch', 'pastel', 'contrast', 'night', 'night-contrast'];

const audit = () => {
  const nums = s => (s.match(/-?\d*\.?\d+/g) || []).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const parse = s => { const v = nums(s); return { r: v[0] ?? 0, g: v[1] ?? 0, b: v[2] ?? 0, a: v.length > 3 ? v[3] : 1 }; };
  const over = (fg, bg) => [fg.r * fg.a + bg[0] * (1 - fg.a), fg.g * fg.a + bg[1] * (1 - fg.a), fg.b * fg.a + bg[2] * (1 - fg.a)];
  const backdrop = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        for (const m of cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)) layers.push(m[0]);
      }
      layers.push(cs.backgroundColor);
    }
    let out = [255, 255, 255];
    for (const c of layers.reverse()) {
      const v = parse(c);
      if (v.a > 0) out = [v.r * v.a + out[0] * (1 - v.a), v.g * v.a + out[1] * (1 - v.a), v.b * v.a + out[2] * (1 - v.a)];
    }
    return out;
  };
  const path = el => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.className && typeof n.className === 'string') s += '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // 自分自身のテキストノードだけを見る（子要素の文字は子で評価する）。
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const fg = parse(cs.color);
    const bg = backdrop(el);
    const got = ratio(over(fg, bg), bg);
    if (got < need) out.push({ sel: path(el), text: own.slice(0, 24), size: Math.round(size), need, ratio: Number(got.toFixed(2)), color: cs.color, bg: `rgb(${bg.map(Math.round).join(',')})` });
  }
  // 正解・不正解など、その状態にしないと出ない見た目は、**実在する要素を複製して
  // クラスだけ差し替え**、同じ親の中で測る（背景も本物の文脈になる）。
  const variants = [
    ['edu-feedback retry', 'edu-feedback success'],
    ['edu-quiz-feedback retry', 'edu-quiz-feedback correct'],
  ];
  for (const [from, to] of variants) {
    const source = document.querySelector('.' + from.split(' ').join('.'));
    if (!source) continue;
    const clone = source.cloneNode(true);
    clone.className = to;
    clone.textContent = (source.textContent || 'Aa').slice(0, 40);
    clone.setAttribute('aria-hidden', 'true');
    source.parentElement?.appendChild(clone);
    const cs = getComputedStyle(clone);
    const fg = parse(cs.color);
    const bg = backdrop(clone);
    const got = ratio(over(fg, bg), bg);
    if (got < 4.5) out.push({ sel: `state.${to.replace(/ /g, '.')}`, text: clone.textContent.slice(0, 24), size: Math.round(parseFloat(cs.fontSize)), need: 4.5, ratio: Number(got.toFixed(2)), color: cs.color, bg: `rgb(${bg.map(Math.round).join(',')})` });
    clone.remove();
  }
  return out;
};

(async () => {
  const { createPagesServer } = await import('./lib/pages-server.mjs');
  const site = createPagesServer(DIST);
  const BASE = `http://127.0.0.1:${await site.listen()}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const all = [];
  for (const [path, name] of EDITIONS) {
    // 教育版は「ヒントを開く」「クイズに答える」「答え合わせ」でしか出ない文字があるため、
    // それらの状態も走査する（2026-11: 3 件の未達はここでしか見つからなかった）。
    const views = ['main', 'guide', 'ai', 'blocks', ...(name.startsWith('edu') ? ['edu-quiz', 'edu-workspace'] : [])];
    // 教育版は配色固定なので、夜モードの走査は Studio の 2 版だけ。
    const modes = name.startsWith('edu') ? ['standard'] : COLOR_MODES;
    for (const mode of modes) for (const view of views) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      if (mode !== 'standard') await page.addInitScript(m => { try { localStorage.setItem('sp-color-mode', m); } catch {} }, mode);
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.body.innerText.trim().length > 200, null, { timeout: 15000 }).catch(() => {});
      try {
        if (view === 'guide') { await page.locator('.guide-entry, .edu-guide-link').first().click(); await page.waitForTimeout(600); }
        if (view === 'ai') {
          if (name.startsWith('edu')) await page.locator('.edu-ai-start, .edu-ai-setup input[type=password]').first().waitFor({ timeout: 3000 }).catch(() => {});
          else { await page.locator('.ai-tab').click(); await page.waitForTimeout(300); }
        }
        // 教育版はレッスン内の状態（クイズの選択肢、ヒント、答え合わせ）でしか出ない文字がある。
        // それぞれ別のページで開き、その状態のまま計測する（モードを移ると消えるため）。
        if (view === 'edu-quiz' && name.startsWith('edu')) {
          const lessons = await page.locator('.edu-lesson').count();
          for (let i = 0; i < lessons; i++) {
            await page.locator('.edu-lesson').nth(i).click();
            await page.waitForTimeout(350);
            if (await page.locator('.edu-quiz-choices button').count()) {
              await page.locator('.edu-quiz-choices button').first().click();
              await page.waitForTimeout(200);
              break;
            }
          }
        }
        if (view === 'edu-workspace' && name.startsWith('edu')) {
          const start = page.locator('.edu-primary').first();
          if (await start.count()) { await start.click(); await page.waitForTimeout(600); }
          const hint = page.locator('.edu-hint-card button').first();
          if (await hint.count()) { await hint.click(); await page.waitForTimeout(250); }
          const check = page.locator('.edu-check').first();
          if (await check.count()) { await check.click(); await page.waitForTimeout(600); }
        }
        if (view === 'blocks') {
          if (name.startsWith('edu')) { await page.locator('.edu-mode-tabs button').nth(1).click().catch(() => {}); await page.waitForTimeout(800); }
          else { await page.getByRole('button', { name: /ブロック|Blocks/ }).first().click(); await page.waitForTimeout(900); }
        }
      } catch { /* 画面が無い版はスキップ */ }
      const rows = await page.evaluate(audit);
      for (const r of rows) all.push({ edition: name, view: mode === 'standard' ? view : `${view}/${mode}`, ...r });
      await page.close();
    }
  }
  await browser.close();
  await site.close();
  const seen = new Map();
  for (const r of all) {
    const key = r.sel + '|' + r.color + '|' + r.bg;
    if (!seen.has(key) || seen.get(key).ratio > r.ratio) seen.set(key, r);
  }
  const worst = [...seen.values()].sort((a, b) => a.ratio - b.ratio);
  console.log(`failures: ${worst.length}`);
  for (const r of worst.slice(0, Number(process.env.LIMIT || 60)))
    console.log(`${String(r.ratio).padStart(5)} (need ${r.need}) ${r.size}px ${r.edition}/${r.view}  ${r.sel}  "${r.text}"  ${r.color} on ${r.bg}`);
  if (worst.length) process.exitCode = 1;
  else console.log('CONTRAST: EVERY VISIBLE TEXT PASSES AA');
})().catch(e => { console.error(e); process.exit(1); });
