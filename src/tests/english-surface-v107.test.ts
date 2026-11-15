import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { analyzeText, sb3ToText, textToSb3, emptyAssetStore, Sb3ParseError, type SB3Project } from '../core/api';
import { saveSb3 } from '../core/sb3/zip';
import { englishDiagnostic, englishError } from '../app/diagnosticText';
import { DIAGNOSTIC_MESSAGES, diag, formatDiagnostic } from '../core/lang/diagnostics';
import { askTutor, buildTutorContext, diagnosticLines } from '../app/ai/agent';

const japanese = /[\u3040-\u30ff\u3400-\u9fff]/u;
const caught = (fn: () => unknown): unknown => { try { fn(); } catch (e) { return e; } throw new Error('expected a failure'); };
const firstError = (src: string) => analyzeText(src).diagnostics.find(d => d.severity === 'error')!;

describe('English surface: .sb3 failures, AI diagnostics and wording details', () => {
  it('translates every .sb3 load failure while keeping the Japanese wording intact', () => {
    const base = textToSb3('stage:\n    pass\n\nsprite Cat:\n    costume costume1\n');
    const project = (): SB3Project => structuredClone(base.project);
    const twoStages = project(); twoStages.targets.push(structuredClone(twoStages.targets[0]));
    const duplicate = project(); duplicate.targets.push(structuredClone(duplicate.targets[1]));
    const noTargets = project(); noTargets.targets = [];
    let deep = 'sprite Cat:\n    on flag:\n';
    for (let i = 0; i < 82; i++) deep += '    '.repeat(i + 2) + 'if true:\n';
    deep += '    '.repeat(84) + 'move(1)\n';
    const cases: { name: string; code: string; bytes: Uint8Array; english: RegExp }[] = [
      { name: 'unzip', code: 'zip.unzip', bytes: new Uint8Array([0, 1, 2, 3]), english: /Could not unpack the \.sb3 file/ },
      { name: 'noProject', code: 'zip.noProject', bytes: zipSync({ 'readme.txt': strToU8('x') }), english: /project\.json was not found in the ZIP/ },
      { name: 'badJson', code: 'zip.badJson', bytes: zipSync({ 'project.json': strToU8('{not json') }), english: /Could not parse the JSON in project\.json/ },
      { name: 'needTargets', code: 'import.needTargets', bytes: saveSb3(noTargets, base.assets), english: /targets are missing or empty/ },
      { name: 'twoStages', code: 'import.oneStage', bytes: saveSb3(twoStages, base.assets), english: /exactly one stage/ },
      { name: 'duplicateNames', code: 'import.duplicateNames', bytes: saveSb3(duplicate, base.assets), english: /Target name "Cat" is empty or duplicated/ },
      { name: 'depth', code: 'import.depth', bytes: textToSb3(deep).bytes, english: /Block nesting is too deep \(maximum 80 levels\)/ },
    ];
    for (const c of cases) {
      const error = caught(() => sb3ToText(c.bytes));
      expect(error, c.name).toBeInstanceOf(Sb3ParseError);
      const parse = error as Sb3ParseError;
      expect(parse.code, c.name).toBe(c.code);
      expect(parse.message, c.name).toMatch(japanese);
      expect(englishError(error), c.name).toMatch(c.english);
      expect(englishError(error), c.name).not.toMatch(japanese);
    }
    // The duplicate name stays verbatim as user data, not translated.
    expect(englishError(caught(() => sb3ToText(saveSb3(duplicate, base.assets))))).toContain('"Cat"');
  });

  it('keeps a diagnostic code for structured failures so wording changes cannot drop the translation', () => {
    const fields = diag('import.duplicateNames', { p0: 'ねこ' });
    expect(englishDiagnostic({ severity: 'error', code: fields.id, params: fields.params, message: fields.message })).toBe(
      'Target name "ねこ" is empty or duplicated. Fix the names in Scratch to avoid ambiguous references.');
    for (const id of ['zip.unzip', 'zip.noProject', 'zip.badJson', 'import.needTargets', 'import.needStage', 'import.oneStage', 'import.duplicateNames', 'import.depth', 'api.depth'])
      expect(DIAGNOSTIC_MESSAGES[id]?.en, id).toBeTruthy();
  });

  it('feeds English diagnostics to the Studio tutor context and reply path', async () => {
    const bad = 'stage:\n    var score: int = "wrong"\n';
    expect(diagnosticLines(bad, emptyAssetStore(), true).errors.join(' ')).toContain("Variable 'score' has type int, but its initial value has type str.");
    expect(diagnosticLines(bad, emptyAssetStore(), true).errors.join(' ')).not.toMatch(japanese);
    expect(diagnosticLines(bad, emptyAssetStore(), false).errors.join(' ')).toMatch(japanese);
    const context = buildTutorContext({ prompt: 'Why is this wrong?', source: bad, assets: emptyAssetStore(), en: true });
    expect(context).toContain("Variable 'score'");expect(context).not.toMatch(japanese);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'The initial value must be an int.' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const result = await askTutor({ provider: 'openai', key: 'test-key', model: 'gpt-4.1-mini', prompt: 'Why is this wrong?', source: bad, assets: emptyAssetStore(), history: [], signal: new AbortController().signal, fetcher, en: true });
    expect(result.reply).toContain('must be an int');
    const payload = JSON.parse((fetcher as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body);
    expect(JSON.stringify(payload.input)).not.toMatch(japanese);
    expect(JSON.stringify(payload.input)).toContain("Variable 'score'");
  });

  it('uses precise English wording for list element types, arities and mixed addition', () => {
    const initial = diag('list.initialType', { p0: 'a', p1: 'int', p2: 'str' });
    expect(englishDiagnostic({ severity: 'error', code: initial.id, params: initial.params, message: initial.message })).toBe("The element type of list 'a' is int, but it contains a str value.");
    expect(englishDiagnostic(firstError('stage:\n    list a: list[int] = [1]\n\nsprite Cat:\n    costume costume1\n    on flag:\n        a.add("x")\n'))).toBe("The element type of list 'a' is int; cannot add a str value.");
    expect(englishDiagnostic(firstError('stage:\n    list a: list[int] = [1]\n\nsprite Cat:\n    costume costume1\n    on flag:\n        a.insert(1, "x")\n'))).toBe("The element type of list 'a' is int; cannot insert a str value.");
    expect(englishDiagnostic(firstError('stage:\n    list a: list[int] = [1]\n\nsprite Cat:\n    costume costume1\n    on flag:\n        a[1] = "x"\n'))).toBe('The element type of this list is int; cannot assign a str value.');
    expect(englishDiagnostic(firstError('stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    on flag:\n        move(1, 2, 3)\n'))).toBe("'move' takes 1 argument, but 3 were given.");
    expect(englishDiagnostic(firstError('stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    def f(p: int):\n        say(p)\n    on flag:\n        f(1, 2)\n'))).toBe("Block 'f' takes 1 argument, but 2 were given.");
    expect(formatDiagnostic('builtin.arity', { p0: 'goto', p1: [1, 2], p2: 3 }, 'en')).toBe("'goto' takes 1 or 2 arguments, but 3 were given.");
    expect(formatDiagnostic('builtin.arity', { p0: 'goto', p1: [1, 2], p2: 3 }, 'ja')).toContain('1 または 2');
    expect(englishDiagnostic(firstError('stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    on flag:\n        say(1 + "a")\n'))).toBe('Cannot mix a number (int) and a string with +. Use two strings to join them.');
  });

  it('writes English comments into imported code for lost or orphan blocks', () => {
    const fixture = new Uint8Array(readFileSync('src/tests/fixtures/broadcast_special_chars.sb3'));
    const en = sb3ToText(fixture, 'en');
    expect(en.text).not.toMatch(japanese);
    expect(en.text).toContain('[Orphan block; not executed]');
    expect(sb3ToText(fixture).text).toContain('孤立ブロック');
    const withDef = textToSb3('stage:\n    pass\n\nsprite Cat:\n    costume costume1\n    def f(p: int):\n        say(p)\n    on flag:\n        f(1)\n').project;
    const custom = structuredClone(withDef);
    const lostIds = Object.entries(custom.targets[1].blocks).filter(([, b]) => b.opcode === 'procedures_definition' || b.opcode === 'procedures_prototype').map(([id]) => id);
    expect(lostIds).toHaveLength(2);
    for (const id of lostIds) delete custom.targets[1].blocks[id];
    const english = sb3ToText(saveSb3(custom, new Map()), 'en');
    expect(english.text).toContain('[Undefined custom block]');
    expect(english.text).not.toMatch(japanese);
    expect(sb3ToText(saveSb3(custom, new Map())).text).toContain('定義なしカスタムブロック');
  });

  it('removes stale Japanese caveats and routes the Studio panel through the dictionary', () => {
    const read = (f: string) => readFileSync(f, 'utf8');
    const surfaces = ['src/app/components/DiagnosticsPanel.tsx', 'src/app/components/LogPanel.tsx', 'src/education/EducationApp.tsx'].map(read).join('\n');
    expect(surfaces).not.toContain('Some detailed diagnostics');
    expect(surfaces).not.toContain('Detailed conversion notes may appear in Japanese');
    expect(read('src/app/ai/agent.ts')).not.toContain('${d.message}');
    expect(read('src/app/ai/agent.ts')).toContain('englishDiagnostic(d)');
    expect(read('src/app/components/AgentPanel.tsx')).toContain('en:EN');
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.version).toMatch(/^1\.\d+\.\d+$/);
    expect(pkg.engines.node).toBe('^22.12.0 || ^24.0.0 || >=26.0.0');
  });
});
