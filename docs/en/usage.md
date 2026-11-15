# Getting started with ScratchPy Studio

> **Before you start**
> - Loading a sample, or starting a new project, **replaces the code you are editing** (you are asked first, and one step can be undone right after).
> - **Block edits only reach the code when you press apply**; until then the mode switch says "unapplied".
> - Your code is auto-saved **on this device only** and never uploaded.
> - The Education editions keep a **fixed palette** on purpose, so they do not follow your OS dark mode.

ScratchPy Studio converts Scratch `.sb3` projects to ScratchPy, a beginner-friendly, typed language with Python-style syntax, and back again. Conversion happens in your browser. If you choose to use the AI Assistant, the current code, conversation, diagnostics and language reference are sent to your chosen AI provider after your consent.

## Contents

- [Open or create a project](#1-open-or-create-a-project)
- [Edit and check](#2-edit-and-check)
- [Export to Scratch](#3-export-to-scratch)
- [Important limitations](#important-limitations)
- [AI tutor](#ai-tutor-studio-editions)
- [Scratch preview](#scratch-preview)
- [Keyboard](#keyboard)
- [Drafts, undo and samples](#drafts-undo-and-samples)

## 1. Open or create a project

### Colour modes

The **colour mode** menu on the right of the toolbar offers six palettes: **Standard**, **Scratch**, **Pastel**, **High contrast**, **Night** and **Night high contrast**. Your choice is stored in `localStorage` (`sp-color-mode`) and restored on your next visit. Every mode keeps the text you can actually see — body text, buttons, tabs, the structure tree, badges, diagnostic pills and the editor line numbers — at WCAG AA (4.5:1) or better; focus rings and other non-text indicators target 3:1 (a dark amber on light palettes). The figures come from real-browser measurements that composite translucent layers: `npm run check:contrast` (all four editions, including quiz, hint and feedback states inside a lesson) and `npm run check:colours` (all six modes). Both scripts ship with the repository and run in CI; gradient midpoints are not measured. `npm run check:cssvars` additionally checks, without a browser, that every `var(--x)` has a definition and that no theme selector defines the same variable twice; `npm run check:editions` and `npm run check:headers` confirm the built editions and the header coverage of every shipped HTML file. The Education editions keep a fixed light palette for readability.

Choose a sample from the toolbar, or click **Open .sb3** and select a Scratch file. You can also drag a `.sb3` file into the editor. The imported text appears in the code editor; any original costumes and sounds are kept for export. Open **Log** to read conversion notes.

## 2. Edit and check

The **Code** tab is a text editor with line numbers. The **Blocks** tab presents the same program in a Blockly workspace. Drag blocks from the toolbox, connect them inside a stage or sprite and edit their fields. Click **Apply to code** to commit block edits. The block editor does not apply changes automatically.

**Reload from code** discards uncommitted block edits after confirmation. If the code contains syntax errors or cannot be represented faithfully as blocks, applying changes is disabled to protect the source. Unconnected blocks must be connected or removed first.

The **Diagnostics** tab shows errors and warnings; click a diagnostic to jump to its line. Parser, type-checking, export and structure-validation diagnostics are available in English. User-supplied names and unexpected external error details remain unchanged. The **Structure** and **JSON** tabs help you inspect your program.

## 3. Export to Scratch

Click **Download .sb3**, then open the downloaded file in the [Scratch editor](https://scratch.mit.edu/projects/editor/) using File → Load from your computer, or use [TurboWarp](https://turbowarp.org/). If there are errors, fix them first. Existing project assets are included when available.

## Important limitations

Some Scratch or TurboWarp extensions, unsupported blocks, and detached scripts cannot be represented in ScratchPy. They may be replaced with comments and lost when re-exported. Always read the import log and keep a copy of your original file. The block editor may disable applying changes when a faithful round trip is not possible.

Continue with the [ScratchPy language reference](language.md), the [.sb3 format guide](sb3.md), [conversion mapping](mapping.md), or the [architecture guide](architecture.md). The Japanese documentation in the repository includes additional opcode-level detail.

## AI tutor (Studio editions)

Select Google Gemini, OpenAI, or Anthropic, enter your own API key and model ID, acknowledge the data transfer and potential charges, then send a request. API settings occupy the chat panel until you select Back to chat. The optional high reasoning mode is specific to Gemini 2.5 Flash, with a thinking budget up to 24,576 and an output limit of 32,768 tokens. It can cost substantially more and take longer; better results are not guaranteed. It is not sent to other models. The key is kept only in page memory, but can be exposed to the device owner, browser extensions and developer tools. Avoid shared devices and restrict key permissions and spending. Code, conversation, diagnostics and the ScratchPy reference are sent directly to the chosen provider; image and sound files themselves are not sent. Browser CORS and organizational policies can block requests, especially for some Anthropic organizations.

The tutor **explains only**. It can define terms and syntax, explain types and events, interpret the diagnostics shown in the editor, quote a few lines and walk through them, and give examples of at most 12 lines. It cannot build or repair your project, output a finished file, apply changes to the editor, or run Scratch — there is no apply button and no automatic repair loop. Questions are one request each (Gemini 503 responses may be retried up to twice). The panel always shows what is sent, refuses to send a message that contains your API key, and hides the key in error messages. Each answer is sent with the beginning of the code, the current diagnostics and up to four previous exchanges. Treat the editor diagnostics and Scratch behaviour as the source of truth.


## AI learning support (Education editions)

The Education page has an optional chat learning guide, available in lessons and the free editor. A parent or teacher should choose a provider and enter their own API key, review age restrictions, parental consent, provider policies and possible charges. A checkbox is not age verification. The browser sends the conversation, lesson title and goal, and ScratchPy reference directly to the provider. Code and local errors are sent only when you opt in. Avoid personal information; images and sound files are not sent. The key stays in page memory, but may be visible to device users and extensions.

The assistant is prompted to offer hints rather than complete challenge answers, but its replies are not guaranteed accurate or appropriate; adult supervision is important. It cannot modify the editor or run Scratch. Clear the key via settings or reload the page. Changing the code-sharing setting resets the conversation history sent to the AI.


## Scratch preview

Select Run next to the editor to run the current converted project using TurboWarp Scaffolding; select Stop to stop it. After importing an .sb3, you can instead choose the original file. External extensions, networking, cloud sync, camera, microphone and external devices are disabled in the sandbox. ScratchPy conversion is not lossless for all blocks or extensions; review import warnings and keep the original. Lesson checks are static and do not grade runtime behavior.

### Gemini HTTP 503

A 503 can indicate temporary model overload or unavailability. The app retries up to twice with increasing delays; you can stop while it waits. If it still fails, wait and try again, or select another available model ID. You usually do not need to change your API key. Failed requests may still appear as 503 errors in browser developer tools. Retries can cause additional requests and charges. Studio can make up to nine API calls if each of its three generation/repair requests needs two retries.

## Keyboard

| Key | Action |
|---|---|
| Tab | Insert four spaces at the cursor |
| Shift + Tab | Remove one level of indentation |
| Esc, then Tab | Leave the editor and move to the next control (a "Tab moves focus" chip appears) |
| Ctrl/⌘ + M | Switch what Tab does (indent or move); works anywhere and is remembered on this device |
| Ctrl/⌘ + S | Download the `.sb3` (the browser save dialog is suppressed) |
| ← → / Home / End | Move between the inspector tabs (AI, diagnostics, structure, JSON, log) |
| Enter on a diagnostic | Jump to that line and select it |

## Drafts, undo and samples

- Your code is auto-saved **on this device only** (the browser's IndexedDB); nothing is uploaded.
- Loading a sample or starting a new project asks for confirmation first, and shows an **Undo**
  banner for one step after it happens.
- On a shared computer, use **Delete the draft on this device** in the inspector panel header (shown
  as **Delete draft** on narrow screens) to remove the saved code, images and sounds. It tells you how
  many drafts will be deleted first, and the code on screen stays as it is.
- On narrow screens the toolbar buttons show icons only; their names remain available to screen readers.
- Blocks reach the code only when you press apply; going back to code applies them for you.

Your saved draft never leaves this device, unless you choose to use the AI tutor.
