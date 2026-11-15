import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { SYSTEM_PROMPT } from '../app/ai/agent';
import { collectHeaders, parseHeaders } from '../../scripts/lib/headers-rules.mjs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('AI の設計図が実ファイルと一致する（P3）', () => {
  const paths = [...SYSTEM_PROMPT.matchAll(/\b((?:src|docs|scripts)\/[\w./-]+\.(?:ts|tsx|cjs|md))/g)].map(m => m[1]);

  it('mentions at least the six pipeline stages', () => {
    expect(new Set(paths).size).toBeGreaterThanOrEqual(6);
  });

  it('points only at files that exist', () => {
    expect(paths.length).toBeGreaterThan(0);
    for (const file of paths) expect(existsSync(file), `${file} がありません`).toBe(true);
  });

  it('calls the type checker by its real name', () => {
    expect(SYSTEM_PROMPT).toContain('src/core/lang/typechecker.ts');
    expect(SYSTEM_PROMPT).not.toMatch(/lang\/checker\.ts/);
    expect(existsSync('src/core/lang/typechecker.ts')).toBe(true);
    expect(existsSync('src/core/lang/checker.ts')).toBe(false);
  });
});

describe('配信ヘッダ（COEP / CORP / キャッシュ）', () => {
  const headers = read('public/_headers');
  const block = (pattern: string) => {
    const marker = headers.startsWith(`${pattern}\n`) ? 0 : headers.indexOf(`\n${pattern}\n`) + 1;
    expect(marker, `${pattern} がありません`).toBeGreaterThan(-1);
    const end = headers.indexOf('\n\n', marker);
    return headers.slice(marker, end === -1 ? undefined : end);
  };

  it('keeps the app pages cross-origin isolated', () => {
    // v1.0.16: 共通ヘッダは /* に、パスごとに変わるヘッダ（CSP / X-Frame-Options / CORP）は
    // 重ならない規則に分けた。ここでは「どのパスでも 1 回だけ」配られることを見る。
    const rules = parseHeaders(headers);
    const app = collectHeaders(rules, '/en/');
    expect(app['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(app['Cross-Origin-Embedder-Policy']).toBe('credentialless');
  });

  it('lets the sandboxed runner (opaque origin) load its own files', () => {
    const rules = parseHeaders(headers);
    const runner = collectHeaders(rules, '/scratch-runner/index.html');
    expect(runner['Cross-Origin-Embedder-Policy']).toBe('credentialless');
    expect(runner['Cross-Origin-Resource-Policy']).toBe('cross-origin');
  });

  it('marks hashed assets as cross-origin readable and immutable', () => {
    const assets = block('/assets/*');
    expect(assets).toContain('Cache-Control: public, max-age=31536000, immutable');
    expect(assets).toContain('Cross-Origin-Resource-Policy: cross-origin');
  });

  it('has no duplicate header names inside a block', () => {
    for (const chunk of headers.split('\n\n')) {
      const names = chunk.split('\n').filter(l => /^ {2}[\w-]+:/.test(l)).map(l => l.trim().split(':')[0]);
      expect(new Set(names).size, names.join(',')).toBe(names.length);
    }
  });
});
