# Inside a Scratch .sb3 file

A `.sb3` project is a ZIP archive containing `project.json` and asset files for costumes and sounds. ScratchPy imports this structure and exports a new archive; it does not promise that every project will round-trip without changes. For how fields map to code, see [Conversion mapping](mapping.md).

## Contents

- [Archive and project metadata](#archive-and-project-metadata)
- [Targets and assets](#targets-and-assets)
- [Variables, lists and broadcasts](#variables-lists-and-broadcasts)
- [Blocks and connections](#blocks-and-connections)
- [Input encodings](#input-encodings)
- [Custom blocks and monitors](#custom-blocks-and-monitors)
- [Loss and compatibility](#loss-and-compatibility)

## Archive and project metadata

A typical archive contains:

```text
project.json
<asset-id>.svg
<asset-id>.png
<asset-id>.wav
```

`project.json` contains `targets`, `monitors`, `extensions` and `meta`. Targets are the stage and sprites. `extensions` identifies extensions used by the project; `meta` describes the format and saving application. Asset names usually combine a content-based ID with an extension.

## Targets and assets

Each target contains a name, an `isStage` flag, dictionaries of variables, lists and blocks, and arrays of costumes and sounds. Sprite targets also have position, size, direction, visibility, rotation style and layer order. The stage and sprites are distinct targets; an exported project has one stage.

Costume records reference an asset and may include bitmap resolution and rotation center. Sound records include an asset reference and audio metadata. ScratchPy retains original imported asset bytes when a matching asset is available. Renaming or removing targets or assets can break that match; missing assets may be replaced with placeholders.

## Variables, lists and broadcasts

A variable dictionary maps an ID to `[name, value]`; a cloud variable may have a third `true` element. Cloud names normally begin with `☁ `. Numeric cloud values can be stored as strings, such as `"100"`. The importer handles safely representable numeric values as numeric ScratchPy types; unsafe or non-numeric values require attention in the log and diagnostics.

Lists are stored as IDs mapped to a name and an array of contents. Broadcasts are also identified by IDs and names. Stage variables and lists are global; sprite-local data belongs to its sprite. Monitors separately describe which values are visible and how they are displayed.

## Blocks and connections

Each target has a `blocks` dictionary keyed by block ID. A block can contain:

| Field | Purpose |
| --- | --- |
| `opcode` | Block type, such as `motion_movesteps` |
| `next` / `parent` | Links to the next or parent block ID |
| `inputs` | Values or connected blocks plugged into inputs |
| `fields` | Dropdown selections, names and IDs |
| `shadow` / `topLevel` | Whether this is a default shadow or a top-level block |
| `x`, `y` | Editor position for top-level blocks |
| `mutation` | Additional data for procedures and certain other blocks |

Event hats and procedure definitions are typical script roots. Nested control bodies and reporters are connected through inputs. Preserving links and IDs correctly matters: a visually similar but broken graph may not run.

## Input encodings

Scratch uses compact input arrays. A mode of `1` represents a shadow input; `2` a connected block without a shadow; and `3` a connected block plus an obscured shadow. Literal arrays use type codes, including `4`–`8` for numeric forms, `9` for a color, `10` for text, `11` for a broadcast, `12` for a variable and `13` for a list. Exact details depend on the block and slot.

`fields` commonly hold a display value and an ID. Some menu choices are separate shadow blocks rather than a simple field. Dynamic menu inputs are not always representable in ScratchPy and can produce a warning.

## Custom blocks and monitors

Custom-block definitions and calls use procedure opcodes and mutation data such as the procedure code, argument IDs, argument names and the warp flag. ScratchPy's `def` describes command-style custom blocks; TurboWarp value-returning procedures are not generally supported.

Variable and list monitors map to annotations such as `@show`. Supported built-in reporter monitors, including the timer, map to initial visibility settings such as `timer_visible: true`; music tempo and selected no-input extension monitors are supported too. Unsupported extension monitors are logged and omitted, and reporter positions and display modes may be normalized. Original editor positions, comments, extensions or other metadata can also differ after conversion.

## Loss and compatibility

Unsupported opcodes, dynamic menus, extensions and detached scripts may be converted to comments, replaced or omitted. Always inspect the import log and keep the original archive. A successful export validates structural consistency; it is not proof that the result preserves all behavior or that every third-party extension will run.

For full opcode tables and deeper format notes, the Japanese structural analysis remains available in the source repository. Continue with [Conversion mapping](mapping.md) or [Architecture](architecture.md).
