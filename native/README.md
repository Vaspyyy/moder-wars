# Modern Wars, native

The native PC rewrite of Modern Wars: a player-led grand strategy game in real time with pause, built as a pure Rust simulation and a Godot 4.8 front end. The browser game in the repository root is the reference this rewrite is checked against. It is not a spec: rules are ported because we want them, not because the old code has them. See [docs/design.md](docs/design.md) for what the game is and the build order, and [docs/plan.md](docs/plan.md) for how we test and the rules of the road.

```
native/
  sim/        mw-sim: the simulation library. No engine, no window, tested with cargo test.
  godot/      mw-godot: thin GDExtension that hands mw-sim data to Godot.
  game/       The Godot 4.8 project (GDScript UI, shaders, scenes).
  fixtures/   Golden files exported from the JavaScript game.
  docs/       Design, plan, and the old game's features and rules as reference.
```

## Play it

From the repository root:

```sh
native/play.sh            # build the Rust extension, then open the game
native/play.sh --watch    # same, then follow main: pull, rebuild and restart whenever new commits land
```

Other options go to the game, e.g. `native/play.sh --scenario=ukraine-2023-v3 --view=34,48.5,9`. Close the game window or press Ctrl+C to stop. `--watch` checks every 30 seconds, only fast-forwards, and keeps the old game running if a build fails.

To watch divisions fight, start a sandbox war between two neighbours (names as the scenario spells them):

```sh
native/play.sh --war=Germany,France --view=7.5,49.3,14
```

That puts 24 German and 12 French divisions on their border, each side as one army group with a front along it, and gives the Germans an arrow about 150 km into France (`--war=Germany,France,30,20` changes the numbers). The game starts paused; orders work while paused.

| Key or mouse | Does |
| --- | --- |
| Space | pause and resume |
| 1 to 5 | speed: 2, 6, 12, 24 or 72 game hours per second |
| click a division | select it, or its whole army group (Shift-click adds or removes one division) |
| G | make the selected divisions an army group |
| F, then drag | draw the selected group's front along a border |
| R, then drag | draw the selected group's arrow into enemy land |
| X | take the selected group's arrow away |
| right-click | send the selected divisions there directly (takes them out of their group) |
| B | cycle the selected division's country's budget: peace, war, all-out |
| M | cycle its mobilization: peacetime, partial, general, total |
| W | the selected division's country declares war on the country under the mouse |
| P | the selected division's country offers peace to all its enemies |
| Y or N | accept or refuse the newest peace offer, for the country it was made to |
| I | hand the selected division's country to the AI, or take it back |
| Esc | stop drawing, or clear the selection |
| drag, WASD or arrows | pan |
| wheel, + or - | zoom |

A marker is a box in the country's colour with a bar for the soldiers left. An orange frame means it is fighting, a red corner means it is cut off from supply. A front is a thick line in the group's colour (gold when selected), an arrow is orange.

Add `--ai` to hand both sides to the AI and just watch (`native/play.sh --war=Germany,France --ai --play`). Add `--forces` to give every country its real starting army instead of the sandbox divisions (`native/play.sh --forces --war=Russia,Ukraine --ai --play --view=34,49,7`). Countries start without a controller and only move when you order them or give them to the AI.

The line above the credit shows the selected country's income, budget, mobilization and the men it can still draft. With a recruiting budget, new divisions appear at the capital once a day (a number shows how many stand together).

How a group behaves (details in `sim/src/army.rs`): without an arrow it spreads evenly along its front and holds. With an arrow it gathers on the stretch of front near the arrow and attacks cell by cell in the arrow's direction, the front bulging forward with it, until the arrow's tip is taken; then it holds again. The drawing controls are a stand-in until the real interface is designed.

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
godot-beta --headless --path game -- --probe="30.52,50.45;37.62,55.75"   # country and region under each point
```

`--hover=<lng>,<lat>` shows the hover label and highlight for a point, for screenshots. `--run=<hours>` runs the simulation before the first frame, `--select=<id>,...` selects divisions (or their whole army groups), `--play` starts unpaused, `--speed=<1-5>` and `--seed=<n>` set the obvious; the full list is at the top of `game/main.gd`.

Headless screenshot (no window, no sound; safe while someone plays on the same machine):

```sh
gamescope --backend headless -W 1600 -H 900 -w 1600 -h 900 -- \
  godot-beta --path game --audio-driver Dummy --resolution 1600x900 -- --screenshot=/tmp/map.png
# four days into the sandbox war, one division selected:
gamescope --backend headless -W 1600 -H 900 -w 1600 -h 900 -- \
  godot-beta --path game --audio-driver Dummy --resolution 1600x900 -- \
  --war=Germany,France --run=96 --view=7.5,49.3,14 --select=3 --screenshot=/tmp/war.png
```

Golden files (run from the repository root, they use the JavaScript code):

```sh
node scripts/export-native-golden.mjs           # rewrite native/fixtures/golden/
node scripts/export-native-golden.mjs --check   # fail if they are stale (CI runs this)
```

## Godot version

The project targets Godot 4.8 (developed on 4.8 beta3). godot-rust 0.5.5 has no 4.8 API yet, so `mw-godot` is built against the 4.7 API (`api-4-7`); Godot extensions are forward compatible. The `lazy-function-tables` feature is required: without it the extension resolves every engine method at startup and panics on `GDScriptTextDocument::foldingRange`, an editor method whose signature changed in 4.8. Switch to `api-4-8` once godot-rust ships it.

Known issue: the first import of a fresh project (no `game/.godot` folder yet, so Godot discovers the extension in the middle of its scan) crashes while shutting down, with exit code 134, after it has written everything. The crash is inside Godot (no Rust code on the stack; seen on 4.7.2 and 4.8 beta3). Later imports, the editor on an imported project and the game itself exit cleanly. `play.sh` imports the project when needed and checks the result by `game/.godot/extension_list.cfg` instead of the exit code.

## Data

Scenario packages are read straight from `../assets/maps/compiled/*.mwsc.gz` (MWSC v3, see `sim/src/scenario/`). The credit lines in the scenario data (DeepStateMap, OpenStreetMap/Overture) are license requirements and must stay visible on screen.

Starting armies (`--forces`, `sim/src/forces.rs`) come from `../assets/data/forces/world-bank.json.gz`: active military personnel, IISS figures published by the World Bank (CC BY 4.0, see its README; the credit is shown on screen while it is used). 60% of the latest observation up to the scenario's start counts as land forces, in divisions of 10,000 spread along each country's land borders (over its cities when it has none). Countries without an observation start with none.

Regions (states, provinces, oblasts) come from Natural Earth admin-1, `../assets/geodata/admin1/regions.json.gz` (public domain, see its README). `sim/src/regions.rs` lays them over the cell grid when a scenario loads (about 0.15 s): every owned land cell gets exactly one region, and a region never crosses a de jure border. Military control does not change regions; a region can be partly occupied. Peace settles whole regions (`sim/src/terms.rs`): a region the other side alone holds more than half of becomes theirs by law, whole, and everything else either side holds of the other's regions goes back.
