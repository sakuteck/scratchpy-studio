import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { strToU8, zipSync } from 'fflate';
import { Sb3ParseError, MAX_SB3_BYTES, MAX_SB3_ENTRIES, MAX_SB3_UNZIPPED, MAX_PROJECT_JSON_BYTES, sb3ToText, textToSb3, analyzeText, saveSb3, saveSb3Report, assertSb3Size } from '../core/api';
import { loadSb3 } from '../core/sb3/zip';
import { MAX_TEXT_CHARS, MAX_TEXT_LINES, parseCollect } from '../core/lang/parser';
import { DIAGNOSTIC_MESSAGES } from '../core/lang/diagnostics';
import { collectHeaders, parseHeaders } from '../../scripts/lib/headers-rules.mjs';

const require = createRequire(import.meta.url);
const { collectUi } = require('../../scripts/diagnostic-coverage.cjs') as {
  collectUi: (overrides?: Record<string, string>, skipFiles?: string[]) => { frozen: string[]; skipped: string[]; skipFiles: string[] };
};
const read = (p: string) => readFileSync(p, 'utf8');

/** 最小の project.json（ステージのみ） */
const stageProject = (extra: Record<string, unknown> = {}) => ({
  targets: [{
    isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0, costumes: [{ name: 'backdrop1', dataFormat: 'svg', assetId: 'cd21514d0531fdffb22204e0ec5ed84a', md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180 }],
    sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
  }],
  monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '0.2.0', agent: 'test' }, ...extra,
});
const zipOf = (files: Record<string, Uint8Array>) => zipSync(files, { level: 1 });
const codeOf = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return (e as Sb3ParseError).code; }
  return 'no-error';
};

describe('取り込みの上限（無制限の解凍・入力を許さない）', () => {
  it('declares conservative, documented limits', () => {
    expect(MAX_SB3_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_SB3_ENTRIES).toBe(2000);
    // 300 MB → 128 MB → 64 MB（v1.0.15）。project.json 単体にも上限を置く。
    expect(MAX_SB3_UNZIPPED).toBe(64 * 1024 * 1024);
    expect(MAX_PROJECT_JSON_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_TEXT_LINES).toBe(50000);
    expect(MAX_TEXT_CHARS).toBe(2 * 1024 * 1024);
  });

  it('rejects an oversized archive before allocating memory for it', () => {
    const error = (() => { try { assertSb3Size(MAX_SB3_BYTES + 1); } catch (e) { return e as Sb3ParseError; } })();
    expect(error).toBeInstanceOf(Sb3ParseError);
    expect(error?.code).toBe('zip.tooLarge');
    expect(() => assertSb3Size(1024)).not.toThrow();
    // 上限内でも壊れた ZIP は zip.unzip として扱う。
    expect(codeOf(() => sb3ToText(new Uint8Array(1024)))).toBe('zip.unzip');
  });

  it('stops at the entry-count limit instead of unpacking thousands of files', () => {
    const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(stageProject())) };
    for (let i = 0; i < 8; i++) files[`a${i}.txt`] = strToU8('x');
    const zip = zipOf(files);
    expect(() => sb3ToText(zip)).not.toThrow();
    // 上限を小さくして、エントリ数で止まることを確認する。
    const err = (() => { try { loadSb3(zip, { maxEntries: 3 }); } catch (e) { return e as Sb3ParseError; } })();
    expect(err?.code).toBe('zip.tooManyEntries');
    expect(() => loadSb3(zip, { maxEntries: 100 })).not.toThrow();
  });

  it('stops when the expanded size exceeds the budget (zip bomb)', () => {
    const files: Record<string, Uint8Array> = {
      'project.json': strToU8(JSON.stringify(stageProject())),
      'bomb1.bin': new Uint8Array(200_000),
      'bomb2.bin': new Uint8Array(200_000),
    };
    const zip = zipOf(files);
    expect(zip.byteLength).toBeLessThan(20_000); // 圧縮後は小さい＝爆弾の典型
    const err = (() => { try { loadSb3(zip, { maxUnzipped: 250_000 }); } catch (e) { return e as Sb3ParseError; } })();
    expect(err?.code).toBe('zip.expandsTooMuch');
    expect(() => loadSb3(zip, { maxUnzipped: 10_000_000 })).not.toThrow();
  });

  it('reports a friendly, translated message for every limit', () => {
    for (const id of ['zip.tooLarge', 'zip.tooManyEntries', 'zip.expandsTooMuch', 'zip.projectJsonTooLarge', 'export.assetNameSkipped', 'text.tooLarge']) {
      expect(DIAGNOSTIC_MESSAGES[id]?.ja, id).toBeTruthy();
      expect(DIAGNOSTIC_MESSAGES[id]?.en, id).toBeTruthy();
    }
  });

  it('stops on an oversized project.json even when the archive itself is small', () => {
    const files: Record<string, Uint8Array> = {
      'project.json': strToU8(JSON.stringify(stageProject({ pad: 'x'.repeat(120_000) }))),
    };
    const zip = zipOf(files);
    const err = (() => { try { loadSb3(zip, { maxProjectJson: 100_000 }); } catch (e) { return e as Sb3ParseError; } })();
    expect(err?.code).toBe('zip.projectJsonTooLarge');
    expect(() => loadSb3(zip)).not.toThrow();
  });

  it('never drops an unsafe asset name without saying so', () => {
    const assets = new Map<string, Uint8Array>([
      ['good.svg', strToU8('<svg/>')],
      ['__proto__', strToU8('x')],
      ['../escape.png', strToU8('x')],
    ]);
    const report = saveSb3Report(stageProject() as never, assets);
    expect(report.skipped).toEqual(['__proto__', '../escape.png']);
    expect(report.bytes.byteLength).toBeGreaterThan(0);
    expect(saveSb3(stageProject() as never, assets)).toEqual(report.bytes);
    // 通常の書き出しは md5 由来の安全な名前だけなので、警告は出ない。
    expect(textToSb3('stage:\n    pass\n').diagnostics.some(d => d.code === 'export.assetNameSkipped')).toBe(false);
  });

  it('refuses huge or line-heavy source before lexing it', () => {
    const manyLines = 'pass\n'.repeat(MAX_TEXT_LINES + 1);
    const out = parseCollect(manyLines);
    expect(out.program).toBeNull();
    expect(out.diagnostics[0].code).toBe('text.tooLarge');
    expect(analyzeText(manyLines).program).toBeNull();
    expect(parseCollect('stage:\n    pass\n').program).not.toBeNull();
  });
});

describe('壊れた入力と上限の境界', () => {
  it('wraps unexpected importer failures in Sb3ParseError (never a raw TypeError)', () => {
    for (const payload of ['{"targets":"nope"}', '{"targets":[{"isStage":true}]}', '{}', '[]']) {
      const zip = zipOf({ 'project.json': strToU8(payload) });
      const error = (() => { try { sb3ToText(zip); } catch (e) { return e as Error; } })();
      expect(error, payload).toBeInstanceOf(Sb3ParseError);
      expect((error as Sb3ParseError).code, payload).toMatch(/^(sb3|zip|import|api)\./);
    }
  });

  it('treats a missing sprite x/y as 0 instead of undefined', () => {
    const project = stageProject();
    project.targets.push({
      isStage: false, name: 'Cat', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
      currentCostume: 0, costumes: [{ name: 'costume1', dataFormat: 'svg', assetId: 'x', md5ext: 'x.svg', rotationCenterX: 0, rotationCenterY: 0 }],
      sounds: [], volume: 100, layerOrder: 1,
    } as never);
    const imported = sb3ToText(zipOf({ 'project.json': strToU8(JSON.stringify(project)) }));
    expect(imported.text).toContain('sprite Cat');
    expect(imported.text).not.toMatch(/^\s*x: undefined/m);
    expect(imported.text).not.toMatch(/undefined/);
  });

  it('does not pollute Object.prototype through asset names', () => {
    const assets = new Map<string, Uint8Array>([['__proto__', new Uint8Array([1])], ['constructor', new Uint8Array([2])]]);
    const zip = saveSb3(stageProject() as never, assets);
    expect(zip.byteLength).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const loaded = loadSb3(zip);
    expect([...loaded.files.keys()]).toEqual([]); // 危険な名前は書き出さない
    expect(loaded.project.targets.length).toBe(1);
  });
});

describe('配信ヘッダと開発サーバーの設定', () => {
  const headers = read('public/_headers');

  it('sends a strict CSP and frame protections for the app', () => {
    // v1.0.16: CSP と X-Frame-Options は「アプリの HTML 文書」の規則にだけ書く
    // （/* と /scratch-runner/* の両方に書くと Cloudflare がカンマ連結して本番で壊れる）。
    const rules = parseHeaders(headers);
    const effective = collectHeaders(rules, '/');
    for (const directive of [
      "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", "script-src 'self'", "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com",
    ]) expect(effective['Content-Security-Policy'], directive).toContain(directive);
    expect(effective['X-Frame-Options']).toBe('DENY');
    expect(effective['X-Content-Type-Options']).toBe('nosniff');
    expect(effective['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('keeps the runner frameable only by this site and blocks ambient permissions', () => {
    expect(headers).toContain('/scratch-runner/*');
    // ヘッダは index.html の meta CSP と交差するため、script-src は meta と同じ 'self' 'unsafe-eval'。
    expect(headers).toMatch(/\/scratch-runner\/\*[\s\S]*frame-ancestors 'self'[\s\S]*script-src 'self' 'unsafe-eval'/);
    const meta = read('public/scratch-runner/index.html');
    for (const directive of ["default-src 'none'", "script-src 'self' 'unsafe-eval'", "worker-src blob:", "frame-src 'none'"]) expect(meta, directive).toContain(directive);
    const policy = headers.split('\n').find(l => l.trim().startsWith('Permissions-Policy:')) ?? '';
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'usb=()', 'serial=()']) expect(policy, feature).toContain(feature);
    expect(headers).not.toContain('frame-ancestors *');
  });

  it('does not accept arbitrary Host headers in dev or preview', () => {
    const vite = read('vite.config.ts');
    expect(vite).not.toMatch(/allowedHosts:\s*true/);
    expect(vite).toContain('PREVIEW_HOST');
    expect(vite).toContain('allowedHosts: allowedDevHosts()');
  });

  it('verifies the runner only obeys its own parent origin', () => {
    const runner = read('public/scratch-runner/runner.js');
    expect(runner).toContain('document.referrer');
    expect(runner).toContain('parentOrigin && event.origin !== parentOrigin');
    expect(runner).toContain("parentOrigin || '*'");
    expect(runner).toContain('event.source !== parent');
  });

  it('pins CI actions to commit SHAs and audits dependencies', () => {
    const ci = read('.github/workflows/ci.yml');
    const uses = [...ci.matchAll(/uses:\s*(\S+)/g)].map(m => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action, action).toMatch(/@[0-9a-f]{40}$/);
    expect(ci).toContain('npm audit --omit=dev');
    expect(ci).toContain('persist-credentials: false');
    expect(existsSync('.github/dependabot.yml')).toBe(true);
    const dependabot = read('.github/dependabot.yml');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });
});

describe('UI 監査の既定除外', () => {
  it('applies the allowlist even when called without arguments', () => {
    const scan = collectUi();
    expect(scan.skipFiles).toContain('src/app/components/GuidePage.tsx');
    expect(scan.skipped.length).toBeGreaterThan(0);
    expect(scan.frozen.filter(e => e.startsWith('src/app/components/GuidePage.tsx'))).toEqual([]);
  });
});
