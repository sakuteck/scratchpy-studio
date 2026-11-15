# ScratchPy Studio architecture

ScratchPy Studio is a React / TypeScript application. The conversion engine works in the browser; the optional AI features send selected context directly to a provider. The preview is a separate sandboxed TurboWarp-based runtime. See [Getting started](usage.md) for use, [the language reference](language.md) for syntax and [the format guide](sb3.md) for Scratch data.

## Components

| Area | Responsibility |
| --- | --- |
| `src/core/lang/` | Lexer, parser, AST, printer, builtin definitions and static type checker |
| `src/core/sb3/` | ZIP I/O, importer, exporter, assets and structure validation |
| `src/core/api.ts` | Public facade for analysis and conversion |
| `src/app/` | Studio editor, Blockly view, diagnostics, AI and guide UI |
| `src/education/` | Lessons, progress, free editor and learning support |
| `public/scratch-runner/` | Sandboxed preview host page (`index.html`, `runner.js`) that loads the shared engine |
| `public/theme-init.js` | Applies the stored colour mode before the first paint |
| `scripts/` | Multi-edition build, header/contrast/colour/theme checkers, headless smoke test |
| `src/tests/` | Language, conversion, UI and real-project fixtures |
| `docs/` | Specifications, structural analysis, architecture and guides |

## Data flow

Source text is parsed into an abstract syntax tree and type-checked before it is converted into a Scratch project and packaged with assets. Import performs the reverse where supported: unzip, read the project, translate blocks, infer types and print ScratchPy. Import notes report cases that may not survive export.

Blockly is another view over the same language. Block edits are applied explicitly; applying is disabled when the conversion cannot be represented safely or unconnected blocks remain. The editor protects against stale or uncommitted changes.

## Runtime and safety

The scratch preview uses TurboWarp Scaffolding in a sandboxed iframe, not the Scratch official editor. It can run the converted project or a loaded original `.sb3`. External networking, third-party extensions, cloud synchronization, camera, microphone and hardware are disabled in the preview. The preview is not a completeness test for conversion. The runtime bundle (about 3.8 MB) is emitted as `engine/scaffolding.js` by the Vite build and loaded relative to `BASE_URL` (with a `?v=<version>` cache key), so standalone builds and sub-directory deployments work. In the combined build the four editions share the single root copy, which keeps the deploy near 10 MB instead of 21 MB.

Studio's AI tutor is **explanation only**: it never generates a project, edits code or applies changes. After consent it sends the question, the first 12,000 characters of the code, local diagnostics, the last four exchanges and the language reference to the selected provider; each question is one request (Gemini 503 retries add at most two). Code is replaced with an explanatory notice before display when it is longer than 12 lines in one block (24 lines per reply), or when it contains `stage:` / `sprite` declarations — whether or not it is inside a fenced block, since plain prose is scanned line by line too. The Education assistant sends code only when the user opts in. API keys are held in page memory rather than saved by the app, but can still be exposed to the device or browser extensions. Consult [AI tutor](usage.md#ai-tutor-studio-editions) for costs and privacy.

## Input limits and headers

`.sb3` imports are capped at 50 MB compressed, 2,000 entries, 64 MB expanded and 8 MB for `project.json` alone; source text is capped at 50,000 lines / 2 MB. Unexpected importer exceptions are wrapped as `Sb3ParseError` so internal messages never reach the UI, and unsafe asset names are never written back into a ZIP (they are reported as `export.assetNameSkipped` rather than dropped silently). `public/_headers` never sets the same header from two rules, because Cloudflare Pages applies every matching rule and joins repeated header names with a comma (a second policy would turn `frame-ancestors` into `'none', 'self'` and break the sandboxed runner in production only). It sets a strict Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, API hosts only in `connect-src`), `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`; `/scratch-runner/*` is restricted to same-site framing. Dev and preview servers accept only localhost plus hosts listed in `PREVIEW_HOST`.

## Build and test

Use Node.js 22.20.0 (specified in `.node-version`). Run `npm ci`, then `npm run start:pages` for a combined local preview on port 4173. `npm test` runs the automated suite; `npm run build` builds all four versions into `dist`. The local preview is not a Cloudflare deployment.

| Edition | Combined build path |
| --- | --- |
| Studio Japanese | `/` |
| Studio English | `/en/` |
| Education Japanese | `/education/` |
| Education English | `/education/en/` |

The test suite exercises parsing, type checking, Blockly, conversion, selected `.sb3` fixtures and the AI adapters. Passing tests do not prove support for all Scratch projects, validate a live AI provider or guarantee runtime equivalence. The Japanese architecture specification in the repository contains further technical detail.
