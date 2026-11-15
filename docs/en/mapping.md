# ScratchPy and Scratch conversion mapping

ScratchPy is designed around Scratch concepts, but it is not a lossless representation of every possible `.sb3`. The tables below describe common supported mappings, not a guarantee for all projects. See [the file format](sb3.md) for the underlying block graph and [the language guide](language.md) for syntax.

## Conversion pipeline

**Export:** parse ScratchPy → type-check → build the Scratch block graph → validate the project and asset references → save a ZIP archive. Errors prevent export.

**Import:** open `.sb3` → read targets and block graphs → infer types where possible → produce ScratchPy and import notes. Review those notes before re-exporting. Keep the original file.

## Targets and declarations

| ScratchPy | Scratch representation |
| --- | --- |
| `stage:` | Stage target |
| `sprite Cat:` | Sprite target named Cat |
| Stage / sprite `var` | Global / local variable |
| `list items: list[str] = []` | Scratch list |
| `costume costume1`, `sound Meow` | Named costume or sound; matching imported assets are reused when available |
| `x: 0`, `direction: 90` | Initial target properties |
| `@show`, `@hide` | Supported variable or list monitor settings |
| Numeric `@cloud` | Cloud flag and Scratch-style cloud name/value |

## Events and scripts

| ScratchPy | Scratch opcode or concept |
| --- | --- |
| `on flag:` | `event_whenflagclicked` |
| `on key "space":` | `event_whenkeypressed` |
| `on click:` | `event_whenthisspriteclicked` |
| `on clone:` | `control_start_as_clone` |
| `on receive "go":` | `event_whenbroadcastreceived` |
| `broadcast("go")` | `event_broadcast` |
| `def jump(power: int):` | A command-style custom block definition |

## Statements and expressions

| ScratchPy | Scratch representation |
| --- | --- |
| `move(10)` | `motion_movesteps` |
| `say("Hi")` | `looks_say` |
| `wait(1)` | `control_wait` |
| `repeat 10:` | `control_repeat` |
| `if` / `else` | `control_if` / `control_if_else` |
| `while condition:` | Repeat until the inverse condition |
| `score += 1` | `data_changevariableby` |
| `items.add("x")` | `data_addtolist` |
| `items[1]` | `data_itemoflist` (Scratch positions start at 1) |
| `len(items)` | `data_lengthoflist` |
| `item_number(items, "x")` | `data_itemnumoflist` |
| `a + b`, comparison and boolean operators | Corresponding Scratch operator blocks where supported |

Backdrop switch-and-wait and selected pen and music commands also have mappings. Availability of a mapping does not enable external extensions or devices in the preview.

## Type inference and assets

Scratch values are dynamically typed; ScratchPy variables are statically typed. The importer uses initial values and usage to infer types. Ambiguous or incompatible uses may need manual changes. Cloud numeric strings are converted when safe; unusual values can generate notes or type errors. Asset bytes are retained when matching imported names are used, but changing a target or asset name can produce placeholders.

## What may be lost

Unsupported blocks, reporters, dynamic menu values, detached scripts, special TurboWarp extensions and some monitor or editor metadata may not round-trip. Some become comments or fallback values. A warning-free type check or structurally valid export is not a runtime equivalence test. Review the log, preserve the source `.sb3`, and run the exported project in Scratch when behavior matters.

For detailed opcode and encoding tables, consult the Japanese mapping specification in the source repository. Next: [Architecture](architecture.md) or [Getting started](usage.md).
