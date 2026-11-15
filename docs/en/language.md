# ScratchPy language reference

ScratchPy is a typed language designed to represent Scratch projects in text. It uses Python-style indentation, but **it is not Python**: it has Scratch events, sprites and blocks, and cannot be run by a Python interpreter. See [Getting started](usage.md) for the editor and [Conversion mapping](mapping.md) for what can be converted.

## Contents

- [A complete first project](#a-complete-first-project)
- [Structure and indentation](#structure-and-indentation)
- [Types, variables and lists](#types-variables-and-lists)
- [Events and control flow](#events-and-control-flow)
- [Custom blocks](#custom-blocks)
- [Built-in commands and reporters](#built-in-commands-and-reporters)
- [Properties and names](#properties-and-names)
- [Errors and limitations](#errors-and-limitations)

## A complete first project

```scratchpy
stage:
    var score: int = 0 @show

sprite Cat:
    costume costume1
    on flag:
        say("Hello!")
        repeat 10:
            move(10)
            wait(0.1)
        score += 1
```

The stage contains a global `score`. The `Cat` sprite reacts to the green flag, says a message, moves ten times and increases the score. Run the project in the preview to try it, then download it as `.sb3` if needed.

## Structure and indentation

A project consists of a `stage:` and zero or more `sprite Name:` sections. The stage may be omitted and will be created during export. Sprite names with spaces can be quoted, for example `sprite "My Cat":`. Under each target, write declarations, initial settings, event scripts and custom-block definitions. Only a stage and sprites belong at the top level.

Indent the contents beneath a line ending in `:`. Four spaces are recommended; keep indentation consistent within each block. Lines beginning with `#` are comments. Write `pass` when a script or block intentionally does nothing.

Strings use quotes, and booleans use lowercase `true` and `false`. Arithmetic operators include `+`, `-`, `*`, `/` and `%`; comparison uses `==`, `!=`, `<`, `>`, `<=` and `>=`. Boolean operators are `and`, `or` and `not`. Division produces a `float`.

## Types, variables and lists

| Type | Example | Meaning |
| --- | --- | --- |
| `int` | `0`, `42` | Whole number |
| `float` | `1.5` | Number with a fractional part |
| `str` | `"hello"` | Text |
| `bool` | `true` | True or false |
| `any` | | A flexible type |
| `list[T]` | `list[str]` | A list whose items have type `T` |

Declare a variable with `var name: type = value`. Initial values must be literals; assign runtime reporters such as `timer` inside an event. Stage variables are global; sprite variables belong to that sprite. Add `@show` to show a monitor, `@hide` to hide one, or `@show(slider, 0, 100)` for a slider. `@cloud` is restricted to numeric variables; the preview does not synchronize cloud values.

Declare a list with `list items: list[str] = []`. List positions are **1-based**, like Scratch, not 0-based like Python. You can use `items[1]`, `items[1] = "apple"`, `len(items)`, `"apple" in items`, `items.add("apple")`, `items.insert(1, "apple")`, `items.delete(1)` and `items.clear()`. A whole list cannot be passed as an ordinary value to `say`. In `item_number(items, 1)`, the first argument must be a declared list, not a number; an invalid first argument is a type error.

```scratchpy
stage:
    var score: int = 0 @show
    list items: list[str] = [] @show

sprite Cat:
    on flag:
        items.add("apple")
        score += 1
        say(items[1])
```

## Events and control flow

An event starts a script. Supported forms include `on flag:`, `on click:`, `on clone:`, `on key "space":`, `on receive "message":`, `on backdrop "name":`, `on timer > 10:` and `on loudness > 30:`. A clone event belongs to a sprite. Keys include `space`, `up arrow`, `down arrow`, `left arrow`, `right arrow`, `a`–`z`, `0`–`9` and `any`; write the name as a quoted literal. `on key "space":` starts an event when the key is pressed; `key_pressed("space")` checks its current state. Microphone input is unavailable in the sandboxed preview.

Use `if` / `elif` / `else` to choose actions, `repeat` for a fixed number of repetitions, `forever` for a continuous loop, and `while` while a condition is true. `wait(seconds)` pauses the current script; `broadcast("name")` sends a message.

```scratchpy
stage:
    var score: int = 0

sprite Cat:
    on flag:
        repeat 3:
            score += 1
            wait(0.2)
        if score > 2:
            say("Well done!")
        else:
            say("Try again")
```

## Custom blocks

Use `def` to define a Scratch custom block with typed parameters. Add `@warp` on the preceding line to request Scratch's run-without-screen-refresh mode. Parameters are read-only and custom blocks do not return values.

```scratchpy
sprite Cat:
    @warp
    def draw_square(length: int):
        repeat 4:
            move(length)
            turn_right(90)

    on flag:
        draw_square(50)
```

## Built-in commands and reporters

These examples are a practical selection, not a promise that every extension is supported. Some commands apply only to sprites or need assets with matching names.

| Category | Examples |
| --- | --- |
| Motion | `move(10)`, `turn_right(15)`, `goto(0, 0)`, `change_y(10)`, `bounce()` |
| Looks | `say("Hi")`, `think("Hmm")`, `show()`, `hide()`, `switch_costume("costume1")`, `switch_backdrop("backdrop1")` |
| Sound | `play_sound("Meow")`, `play_sound_until_done("Meow")`, `stop_all_sounds()` |
| Events and control | `broadcast("go")`, `broadcast_and_wait("go")`, `wait(1)`, `wait_until(condition)`, `create_clone()`, `delete_clone()` |
| Sensing | `touching("edge")`, `key_pressed("space")`, `distance_to("mouse")`, `ask("Name?")`, `set_drag_mode("draggable")`, `set_drag_mode("not draggable")` |
| Operators | `random(1, 10)`, `round(2.4)`, `abs(-3)`, `join("a", "b")`, `letter(1, "cat")`, `len(items)`, `item_number(items, "apple")` |
| Pen | `pen_down()`, `pen_up()`, `clear_pen()`, `set_pen_color("#ff0000")` |

The longer Japanese language specification in the source repository contains a fuller catalog and details for music commands. Availability in conversion is different from availability in the preview: external extensions, networking, camera, microphone and external hardware are disabled there.

## Properties and names

Properties such as `x`, `y`, `direction`, `size`, `mouse_x`, `mouse_y`, `timer`, `loudness` and `answer` are read-only reporters. `backdrop_number`, `backdrop_name` and `tempo` can be used from either the stage or a sprite. Use commands such as `set_x(0)` instead of assigning to `x`. Names are resolved from a custom-block parameter, then the current sprite's variables, then stage variables, then built-in properties. Built-in property and function names are reserved for unquoted names. Quoted variables and lists may use them: `var "timer": int = 0` and `var("timer")`. Custom-block parameters still require identifiers and may be renamed with an import note.

Costume and sound names should match assets in the imported project. If an asset is missing, export can use a placeholder; it does not generate the intended artwork or sound. Preserve the original project and check the result.

## Errors and limitations

The editor checks syntax, types and Scratch project structure. It does not prove that a program behaves as intended. User-supplied names and unexpected external error details remain unchanged. Unsupported blocks and extensions can be lost in conversion; read the import log, keep the original `.sb3`, and test important results in Scratch.

Next: [Explore the .sb3 file structure](sb3.md) or [see conversion details](mapping.md).


## Initial reporter monitor visibility

Some Scratch value monitors, such as the timer, do not have show/hide command blocks. Put their initial visibility in the stage or sprite configuration. Use the literal `true` or `false`; leaving a setting out means hidden. These settings do not change visibility while a project is running.

```scratchpy
stage:
    timer_visible: true
    current_year_visible: true
    var score: int = 0 @show
    on flag:
        reset_timer()
        hide(score)

sprite Cat:
    x_position_visible: true
    direction_visible: true
    on flag:
        move(10)
```

On `stage`: `timer_visible`, `answer_visible`, `loudness_visible`, `backdrop_number_visible`, `backdrop_name_visible`, `tempo_visible`, and `current_year_visible`, `current_month_visible`, `current_date_visible`, `current_dayofweek_visible`, `current_hour_visible`, `current_minute_visible`, `current_second_visible`. On each sprite: `x_position_visible`, `y_position_visible`, `direction_visible`, `size_visible`, `costume_number_visible`, and `costume_name_visible`. `volume_visible` can be set on the stage or each sprite. The tempo monitor adds the music extension. Selected no-input extension monitors can be saved with `ev3_distance_visible`, `ev3_brightness_visible`, `wedo2_distance_visible`, `force_visible`, `speech_visible`, and `viewer_language_visible`; the corresponding extensions are added to the exported project. This preserves visibility only, not support for external devices or services.

Supported reporter monitor visibility is imported and exported. Layout and display mode may be normalized; unsupported extension monitors are noted and omitted. Microphone, camera, and external hardware are disabled in the embedded preview. Variable and list monitors continue to use `@show` / `@hide` and runtime `show()` / `hide()`.

`set_drag_mode("sync")` is retained for compatibility with nonstandard imported files; the official Scratch VM treats all values other than `"draggable"` as not draggable.

## Round-trip and safety notes

Sprite names with spaces, symbols or keywords are preserved; use `"My Cat".x` to reference a property. A quoted variable name may also appear after the dot, e.g. `"My Cat"."my score"`. Use `@show(slider, -10, 50, false)` for a continuous slider, or `@hide(slider, -10, 50, false)` to keep its settings hidden. `@hide(large)` preserves hidden large mode. Numeric literals accept exponential notation such as `1.5E-3`.

Multiple stages or duplicate targets are errors. Duplicate target names in .sb3 are rejected instead of silently renaming ambiguous references. Limits: 200 nested parentheses, 100 indentation levels, and 80 nested .sb3 blocks; overly deep input is rejected rather than truncated. Monitor positions and extension declarations are retained with imported asset metadata, not in copied text alone. Blockly disables applying changes when it cannot faithfully represent the source. Keep the original .sb3. Parser, type-checking, export and validation diagnostics are shown in English; unexpected external error details remain unchanged.

### Stage references and monitor validation

Use `stage.volume`, `Stage.volume`, or `"Stage".volume` for the stage. `"stage"` also means the stage unless there is a sprite named `stage`, in which case the quoted form refers to that sprite; unquoted `stage` in a property reference always means the stage; `stage` alone is not a value. Lists do not accept arguments on `@show` or `@hide`, and reversed slider bounds generate a warning. The 100 indentation-level limit includes the stage/sprite body and event/definition body. Exponent notation whose value is integral is classified as `int`.
