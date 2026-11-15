# Scratch project fixtures

This folder holds the `.sb3` and `project.json` examples used for conversion tests and format research. Identical copies formerly stored in the top-level `research/` directory were deduplicated after comparing SHA-256 hashes; unique files were moved here without changing their contents.

- `*.sb3` at this level: project fixtures used by the real-file test suite, including examples from the Scratch VM / TurboWarp test collections.
- `real_165661752.json`: research sample retained as-is.
- `nested-archive/origin.sb3`: preserved research sample with `project.json` and assets inside an `origin/` subdirectory. It is kept separate from the standard root-level-asset fixture suite; support for the nonstandard nested asset layout is not implied.

These files are test/research inputs, not application build output or user-created projects. Do not delete or move them without updating the tests and documentation.
