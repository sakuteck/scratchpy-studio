#!/usr/bin/env node
/**
 * 6 種類のカラーモードを実際に切り替え、適用・保存・コントラスト（WCAG AA）を検証する。
 * 使い方: npm run build && npm run check:colours
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.resolve(__dirname, '..', 'dist');
const MODES = [
  { id: 'standard', theme: 'light', palette: 'standard' },
  { id: 'scratch', theme: 'light', palette: 'scratch' },
  { id: 'pastel', theme: 'light', palette: 'pastel' },
  { id: 'contrast', theme: 'light', palette: 'contrast' },
  { id: 'night', theme: 'dark', palette: 'scratch' },
  { id: 'night-contrast', theme: 'dark', palette: 'contrast' },
];

// 実際に描画された色から背景を合成し、コントラスト比を測る（固定待機ではなく状態を待つ）。
const measure = `(() => {
  const nums = s => (s.match(/-?\\d+(\\.\\d+)?/g) || []).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  const layer = (el) => {
    const cs = getComputedStyle(el);
    const out = [];
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') out.push(bg);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      const m = cs.backgroundImage.match(/rgba?\\([^)]+\\)/);
      if (m) out.push(m[0]);
    }
    return out;
  };
  const backdrop = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) for (const c of layer(n)) chain.push(c);
    let out = [255, 255, 255];
    for (const c of chain.reverse()) {
      const v = nums(c); const a = v.length > 3 ? v[3] : 1;
      if (a > 0) out = [0, 1, 2].map(i => out[i] * (1 - a) + v[i] * a);
    }
    return out;
  };
  const targets = [...document.querySelectorAll('.toolbar .brand, .toolbar .btn, .tab.active, .tree-kind, .statusbar b, .editor-shell .panel-title, textarea.code, .line-numbers div')];
  return targets.map(el => {
    const fg = nums(getComputedStyle(el).color).slice(0, 3);
    const bg = backdrop(el);
    return { cls: String(el.className || el.tagName).slice(0, 34), text: (el.textContent || '').trim().slice(0, 10), ratio: ratio(fg, bg) };
  });
})()`;

(async () => {
  const { chromium } = require('playwright');
  const { createPagesServer } = await import('./lib/pages-server.mjs');
  const site = createPagesServer(DIST);
  const base = `http://127.0.0.1:${await site.listen()}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.locator('textarea.code').waitFor();

  const labels = await page.locator('.color-mode select option').allTextContents();
  assert.equal(labels.length, 6, 'カラーモードが 6 択ではありません');
  for (const ja of ['通常', 'Scratch', 'パステル', '高コントラスト', '夜', '夜・高コントラスト']) assert.ok(labels.includes(ja), ja);

  const summary = {};
  const primaries = new Map();
  for (const mode of MODES) {
    await page.selectOption('.color-mode select', mode.id);
    // CSS トランジションが終わるのを待つ（時間ではなく色の一致で待つ）。
    await page.waitForFunction(
      id => {
        const root = document.documentElement;
        if (root.dataset.theme !== (id === 'night' || id === 'night-contrast' ? 'dark' : 'light')) return false;
        const primary = getComputedStyle(root).getPropertyValue('--mode-primary').trim();
        const hex = primary.replace('#', '');
        const n = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
        if (n.length !== 6) return false;
        const rgb = `rgb(${[0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)).join(', ')})`;
        const button = document.querySelector('.toolbar .btn:not(.primary)');
        return !!button && getComputedStyle(button).backgroundColor === rgb;
      },
      mode.id,
      { timeout: 8000 },
    );
    const state = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      palette: document.documentElement.dataset.palette,
      stored: (() => { try { return localStorage.getItem('sp-color-mode'); } catch { return null; } })(),
      scheme: document.documentElement.style.colorScheme,
      primary: getComputedStyle(document.documentElement).getPropertyValue('--mode-primary').trim(),
    }));
    assert.equal(state.theme, mode.theme, `${mode.id}: theme`);
    assert.equal(state.palette, mode.palette, `${mode.id}: palette`);
    assert.equal(state.stored, mode.id, `${mode.id}: 保存されていない`);
    assert.equal(state.scheme, mode.theme, `${mode.id}: color-scheme`);
    primaries.set(state.primary, mode.id);

    // v1.0.18 でタブは role="tab"（button ではなくなった）。旧 role でも動くようにしておく。
    await page.getByRole('tab', { name: /構造|Structure/ }).first().click();
    const samples = await page.evaluate(measure);
    const rows = samples.filter(s => s.text || s.cls === 'code');
    const worst = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    summary[mode.id] = Number(worst.ratio.toFixed(2));
    assert.ok(worst.ratio >= 4.5, `${mode.id}: コントラスト ${worst.ratio.toFixed(2)} < 4.5 (${worst.cls})`);
  }
  assert.ok(primaries.size >= 3, 'パレットごとに主色が変わっていません: ' + [...primaries.entries()].map(([v, k]) => `${k}=${v}`).join(' '));

  await page.selectOption('.color-mode select', 'pastel');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('textarea.code').waitFor();
  assert.equal(await page.locator('.color-mode select').inputValue(), 'pastel', '再読み込みで選択が保持されていない');

  await page.goto(`${base}/en/`, { waitUntil: 'networkidle' });
  await page.locator('textarea.code').waitFor();
  const enLabels = await page.locator('.color-mode select option').allTextContents();
  assert.ok(enLabels.includes('Standard') && enLabels.includes('Night high contrast'), 'EN の選択肢が違います');
  assert.deepEqual(errors, [], errors.join('\n'));

  console.log('distinct primary per palette:', [...primaries.entries()].map(([v, k]) => `${k}=${v}`).join(' '));
  console.log('min contrast:', JSON.stringify(summary));
  console.log('COLOUR MODE CHECKS PASSED');
  await browser.close();
  await site.close();
})().catch(error => { console.error(error); process.exit(1); });
