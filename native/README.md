# Modern Wars, native

The native PC rewrite of Modern Wars: a pure Rust simulation and a Godot 4.8 front end. The browser game in the repository root is the reference this rewrite is checked against. It is not a spec: rules are ported because we want them, not because the old code has them. See [docs/plan.md](docs/plan.md) for the steps and the rules of the road.

```
native/
  sim/        mw-sim: the simulation library. No engine, no window, tested with cargo test.
  godot/      mw-godot: thin GDExtension that hands mw-sim data to Godot.
  game/       The Godot 4.8 project (GDScript UI, shaders, scenes).
  fixtures/   Golden files exported from the JavaScript game.
  docs/       Plan, v1 scope, and the old game's rules as reference.
```

## Commands

Run from `native/` unless noted.

```sh
cargo test                              # all Rust tests, including the golden tests
cargo clippy --all-targets -- -D warnings
cargo build -p mw-godot                 # build the extension Godot loads (debug)
godot-beta --path game                  # play/look (needs the extension built first)
godot-beta -e --path game               # open the editor
```

The game takes options after `--`:

```sh
godot-beta --path game -- --scenario=ukraine-2023-v3 --view=34,48.5,9
godot-beta --headless --path game -- --probe="30.52,50.45;37.62,55.75"   # country under each point
```

Headless screenshot (no window, no sound; safe while someone plays on the same machine):

```sh
gamescope --backend headless -W 1600 -H 900 -w 1600 -h 900 -- \
  godot-beta --path game --audio-driver Dummy --resolution 1600x900 -- --screenshot=/tmp/map.png
```

Golden files (run from the repository root, they use the JavaScript code):

```sh
node scripts/export-native-golden.mjs           # rewrite native/fixtures/golden/
node scripts/export-native-golden.mjs --check   # fail if they are stale (CI runs this)
```

## Godot version

The project targets Godot 4.8 (developed on 4.8 beta3). godot-rust 0.5.5 has no 4.8 API yet, so `mw-godot` is built against the 4.7 API (`api-4-7`); Godot extensions are forward compatible. The `lazy-function-tables` feature is required: without it the extension resolves every engine method at startup and panics on `GDScriptTextDocument::foldingRange`, an editor method whose signature changed in 4.8. Switch to `api-4-8` once godot-rust ships it.

## Data

Scenario packages are read straight from `../assets/maps/compiled/*.mwsc.gz` (MWSC v3, see `sim/src/scenario.rs`). The credit lines in the scenario data (DeepStateMap, OpenStreetMap/Overture) are license requirements and must stay visible on screen.
