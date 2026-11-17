# Plan

## Why a rewrite

The browser game grew to about 55,000 lines with a 7,000-line `main.js`, simulation code tangled with UI code, and tests that check internal wiring instead of game behavior. The native version keeps what is worth keeping (the data, the rules we like, the lessons about what is slow) and leaves the structure behind.

## Steps

| # | Step | State |
| --- | --- | --- |
| 0 | Freeze the JavaScript game: fixes only, no new features | done (2026-11-16) |
| 1 | Read the real scenario packages in Rust, checked by golden files | done |
| 2 | First pixels: the political map in Godot 4.8 | done |
| 3 | Decide the direction: a player-led grand strategy game in real time with pause ([design.md](design.md)) | done (2026-11-16) |
| 4-7 | Simulation foundation, regions, divisions, army groups, economy, war and peace, AI, then the front end and packaging: see the build order in [design.md](design.md) | 4a to 4g done (2026-11-16): divisions, fronts, arrows, recruitment, peace and the AI, all playable in the viewer; next: 5 (front end, mockups first) |

The first playable is smaller than today's game on purpose. It must be playable early; missing features come back after that, one at a time, only if they earn their place. [rules.md](rules.md) describes what the old game does, for reference when a rule is ported.

## How we test

- **Golden tests** (`sim/tests/golden.rs`) only for exact data: the native code must read a scenario exactly like the old game did. The files come from `scripts/export-native-golden.mjs`.
- **Behavior tests** for rules, written before the code. They state what should happen, not how the code is built. Examples: the same seed gives the same result; 3:1 odds win most battles; an encircled army surrenders; a year of Modern World 2026 runs within a time budget.
- **Scenario tests** for AI: a small setup and an outcome ("attacks the weak border within N days"), never exact numbers.
- **Screen tests** (`game/tests/*_test.gd`, `test-screens.sh`) click through the screens headless like a player would; CI runs them on every pull request.
- **Screenshots** for the screen: `--screenshot` and `--probe` run headless, so they never open a window.

## Rules of the road

These exist because the old code broke all of them.

1. `mw-sim` has no engine, no window and no file system access beyond decoding bytes it is given. Everything in it is testable with `cargo test`.
2. The simulation is deterministic: fixed tick, seeded random numbers, `libm` for `sin`/`cos`/`exp` (same bits on every platform), no logic that depends on hash map iteration order.
3. `mw-godot` only converts data. If a function in it makes a game decision, it belongs in `mw-sim`.
4. Modules stay small. When a file passes about 500 lines, split it or simplify it. No manager-of-managers layers, no feature flags for "legacy behavior".
5. One way to do each thing. No second copy of a rule "for the fast path".
6. Performance is a test: budgets for tick time live in the test suite, so slowdowns fail loudly.
7. The map stays clean: flat colors, thin borders. New layers (units, frontlines, labels) are added sparingly and can be turned off. The UX is designed from scratch, never copied from the browser game.
8. No online features. Credits required by data licenses stay visible.

## Godot 4.7 and 4.8 features worth using

- `DrawableTexture2D` (4.7): a texture that can draw into itself. Good for painting territory changes on the GPU instead of re-uploading the whole 3600 x 1800 owner map.
- HDR output (4.7, Wayland): brighter frontline and explosion highlights on HDR screens.
- Theme audio items (4.8): UI click and hover sounds set once in the theme.
- The game view docked in the editor (4.8) makes tuning the map shader quick.
