import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { collectHeaders, duplicateHeaders, matchesPath, parseHeaders } from '../../scripts/lib/headers-rules.mjs';
import { documentUrls } from '../../scripts/lib/editions.mjs';
import { sanitizeTutorReply } from '../app/ai/agent';

const read = (p: string) => readFileSync(p, 'utf8');
const rules = parseHeaders(read('public/_headers'));
const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;

describe('配信ヘッダの重なり（N-P1）', () => {
  // パスを書き写さない（v1.0.16 では 3 か所の列挙がずれて、教育版の index.html 直 URL だけ
  // CSP 無しで配信された）。版の定義から導出する。
  const documents = documentUrls();
  const runner = ['/scratch-runner/', '/scratch-runner/index.html', '/scratch-runner/runner.js'];

  it('never sets the same header from two rules (Cloudflare joins them with a comma)', () => {
    for (const pathname of [...documents, ...runner, '/assets/a.js', '/engine/scaffolding.js', '/theme-init.js']) {
      expect(duplicateHeaders(rules, pathname), pathname).toEqual([]);
    }
  });

  it('gives app documents frame-ancestors none and the runner frame-ancestors self', () => {
    for (const pathname of documents) {
      const headers = collectHeaders(rules, pathname);
      expect(headers['Content-Security-Policy'], pathname).toContain("frame-ancestors 'none'");
      expect(headers['X-Frame-Options'], pathname).toBe('DENY');
    }
    for (const pathname of runner) {
      const headers = collectHeaders(rules, pathname);
      expect(headers['Content-Security-Policy'], pathname).toContain("frame-ancestors 'self'");
      expect(headers['Content-Security-Policy'], pathname).not.toContain("frame-ancestors 'none'");
      expect(headers['X-Frame-Options'], pathname).toBe('SAMEORIGIN');
    }
  });

  it('does not depend on rule order (no detach trick)', () => {
    for (const pathname of [...documents, ...runner, '/assets/a.js']) {
      const forward = JSON.stringify(Object.entries(collectHeaders(rules, pathname)).sort());
      const reverse = JSON.stringify(Object.entries(collectHeaders(rules, pathname, { reverse: true })).sort());
      expect(forward, pathname).toBe(reverse);
    }
  });

  it('matches Cloudflare-style globs', () => {
    expect(matchesPath('/*', '/anything')).toBe(true);
    expect(matchesPath('/assets/*', '/assets/index.js')).toBe(true);
    expect(matchesPath('/assets/*', '/engine/scaffolding.js')).toBe(false);
    expect(matchesPath('/en/', '/en/index.html')).toBe(false);
  });

  it('ships the checkers the documentation refers to', () => {
    for (const file of ['scripts/check-headers.mjs', 'scripts/check-contrast.cjs', 'scripts/check-colour-modes.cjs', 'scripts/check-theme-init.cjs', 'scripts/smoke-browser.cjs']) {
      expect(existsSync(file), file).toBe(true);
    }
    const workflow = read('.github/workflows/ci.yml');
    for (const script of ['check:headers', 'smoke', 'check:contrast', 'check:colours', 'check:theme']) {
      expect(workflow, script).toContain(script);
    }
    expect(workflow).toContain('SMOKE_REQUIRE_BROWSER');
  });

  it('does not silently pass the smoke test when the browser is missing', () => {
    const smoke = read('scripts/smoke-browser.cjs');
    expect(smoke).toContain('SMOKE_REQUIRE_BROWSER');
    expect(smoke).toContain('process.exit(1)');
    expect(smoke).toContain("createPagesServer");
  });
});

describe('AI の地の文サニタイズ（N-B1 / N-B2）', () => {
  const code = Array.from({ length: 30 }, (_, i) => `say("line ${i}")`);

  it('blocks code dressed up as a block quote', () => {
    const reply = code.map(line => `> ${line}`).join('\n');
    const result = sanitizeTutorReply(reply);
    expect(result.blocked).toBe(true);
    expect(result.text.split('\n').length).toBeLessThan(20);
  });

  it('blocks code dressed up as a numbered or bulleted list', () => {
    for (const marker of ['- ', '* ', '1. ']) {
      const reply = code.map(line => `${marker}${line}`).join('\n');
      expect(sanitizeTutorReply(reply).blocked, marker).toBe(true);
    }
  });

  it('keeps a long list of links (URLs are not code)', () => {
    const reply = Array.from({ length: 30 }, (_, i) => `- https://example.com/page?n=${i}`).join('\n');
    const result = sanitizeTutorReply(reply);
    expect(result.blocked).toBe(false);
    expect(result.text.split('\n').length).toBe(30);
  });

  // v1.0.16 のこのテストは「1 行おきに字下げした 20 行」だけを見ており、
  // 実際に切られる入力（連続 13 行以上のインデント塊）を一度も試していなかった（診断 V3）。
  it('keeps continuous nested bullet lists longer than the code threshold', () => {
    for (const indent of ['  ', '    ']) {
      for (const count of [13, 20, 40]) {
        const reply = Array.from({ length: count }, () => `${indent}- 詳しい説明です`).join('\n');
        const result = sanitizeTutorReply(reply);
        expect(result.blocked, `${indent.length} spaces x${count}`).toBe(false);
        expect(result.text.split('\n').length, `${indent.length} spaces x${count}`).toBe(count);
      }
    }
  });

  it('keeps an indented prose block longer than the code threshold', () => {
    const reply = Array.from({ length: 20 }, (_, i) => `    これは ${i} 番目の説明文です。`).join('\n');
    const result = sanitizeTutorReply(reply);
    expect(result.blocked).toBe(false);
    expect(result.text.split('\n').length).toBe(20);
  });

  it('allows bullet lines that start with a command name but are prose', () => {
    const reply = Array.from({ length: 15 }, (_, i) => `- say の使い方 ${i}`).join('\n');
    const result = sanitizeTutorReply(reply);
    expect(result.blocked).toBe(false);
    expect(result.text.split('\n').length).toBe(15);
  });

  it('still blocks real code in prose', () => {
    expect(sanitizeTutorReply(code.join('\n')).blocked).toBe(true);
    expect(sanitizeTutorReply('こう書きます。\nstage:\n    show()').blocked).toBe(true);
  });

  it('writes the notice without markdown decoration', () => {
    const result = sanitizeTutorReply(code.join('\n'));
    expect(result.text).not.toContain('_(');
    expect(result.text).toContain('説明専用');
    const english = sanitizeTutorReply(code.join('\n'), true);
    expect(english.text).not.toContain('_(');
  });
});

describe('AI 返答の描画（N-B3 / N-B4）', () => {
  it('formats emphasis and inline code without injecting HTML', () => {
    const panel = read('src/app/components/AgentPanel.tsx');
    expect(panel).toContain('renderTutorMessage');
    expect(panel).not.toContain('dangerouslySetInnerHTML');
    const module = read('src/app/ai/tutorText.tsx');
    expect(module).toContain('**');
    expect(module).not.toContain('dangerouslySetInnerHTML');
  });

  it('tells the reader when part of a reply was hidden', () => {
    expect(read('src/app/components/AgentPanel.tsx')).toContain('notice:result.blocked');
    expect(read('src/app/components/agent.css')).toContain('.ai-message-note');
  });
});

describe('アクセシビリティの作法（N-B5 / N-B6）', () => {
  it('makes the Education guide a real modal', () => {
    const app = read('src/education/EducationApp.tsx');
    expect(app).toContain("event.key === 'Escape'");
    expect(app).toContain("event.key !== 'Tab'");
    expect(app).toContain("setAttribute('inert'");
    expect(app).toContain('previous?.focus?.()');
  });

  it('gives the studio a main landmark and a heading', () => {
    const app = read('src/app/App.tsx');
    expect(app).toMatch(/<header className="toolbar">/);
    expect(app).toMatch(/<main className="main">/);
    expect(app).toContain('className="sr-only"');
    expect(app).toContain('</main>');
    expect(app).toContain('</header>');
  });
});

describe('CSS の衛生（N-P6 / A-1 残）', () => {
  const styles = read('src/app/styles.css');
  const education = read('src/education/education.css');

  it('removes declarations that a later rule always overrides', () => {
    expect(styles).not.toContain('.editor-shell .toolbar { background:#397fda');
  });

  it('keeps the Education colours that failed AA above 4.5', () => {
    // 2026-11 の診断で見つかった 3 件（3.78 / 4.17 / 4.42）の再発防止
    expect(education).toContain('.edu-hint-card small { font-size:11px; color:#6b4f14; }');
    expect(education).toContain('color:#2a5488; font-size:11px;');
    expect(education).toContain('.edu-feedback.success { background:#def6e7; color:#12663a;');
    for (const stale of ['#9a7a44', '#4773b0', '#1a7f47']) expect(education).not.toContain(stale);
  });
});

describe('配布物の体裁（N-I1 / N-D5）', () => {
  it('declares the supported Node range', () => {
    // 既に engines があった（N-I1 の指摘は古い）。値は変えず、.node-version と整合していることだけ固定する。
    expect((pkg.engines as { node: string }).node).toContain('22.12');
    expect(read('.node-version').trim()).toMatch(/^22\./);
  });

  it('keeps the UI text allowlist empty so new hard-coded strings are noticed', () => {
    const allowlist = JSON.parse(read('src/tests/ui-text-allowlist.json')) as { entries?: unknown[] };
    expect(allowlist.entries ?? []).toEqual([]);
  });

  it('keeps the version in sync across package, README and docs', () => {
    const version = pkg.version as string;
    expect(read('README.md')).toContain(`バージョン ${version}`);
    expect(read('docs/CHANGELOG.md')).toContain(`## v${version}`);
    // 直前の版の節も残っていること（履歴を消していないことの確認）
    expect(read('docs/CHANGELOG.md')).toContain('## v1.0.16');
  });
});
