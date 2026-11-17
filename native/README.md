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

The game opens on the world, paused, with every country's real army on its borders. Click a country to see its card (population, economy, forces, borders), then press "Lead" to take it: the camera moves to its capital, the bar along the top shows its date, speed, income, people left to draft, divisions and war support, and the AI runs every other country with the same orders you have. Now and then an AI country attacks a much weaker neighbor (rarely, and never while two wars are already going on), and that can be you. `--lead=Poland` skips the pick screen. While you lead a country, only its divisions take your orders, and the stand-in keys below (Shift+W, P, I) act for it.

While you lead a country, your army groups are listed on the left (you start with one for each border at least two of your divisions face, holding a front along it; click one to select it and look at it; a row under them selects the divisions in no group), the reports on the right tell what happened to you and your enemies (wars and peace anywhere too), and with divisions selected a bar at the bottom offers Draw front (F), Draw arrow (R) and Hold (X). Big events pause the game and open a card: a war declared on you, a peace offer (Accept or Refuse, or Y and N), a peace you made, a capitulation. Closing the last card lets the game run again if it was running. The key in the bottom right corner explains the marks on the map; the corner on the left names the region under the mouse.

Clicking Income or Can draft in the top bar (or pressing B or M) opens the budget and mobilization window: what your land produces and what mobilization costs, sliders for the recruiting and equipment shares (the home front gets the rest, so the three always add up to 100%), what that buys ("about 2 new divisions a day"), the four mobilization levels and the people you can still draft. Changes apply at once, even while paused; Esc closes it. While the AI runs your country (I) the window only shows what it chose.

Esc, once nothing else is open (a window, a selection or a line being drawn closes first), pauses the game and opens the menu: Continue, Saves, New game and Quit to desktop. Saves lists your saves for the country you lead in this scenario, newest first, with the quick save on top: type a name and press Save (or Enter) for a new one, and each row has Load, Overwrite and Delete (those two ask once, in the row). New game goes back to the pick screen of the same scenario. New game, Quit and closing the window ask "Leave this game?" first, but only when the game changed since your last save or load (an hour going by or an order counts). Saves live in Godot's user data folder (`~/.local/share/godot/app_userdata/Modern Wars/` on Linux), each `.mwsave` with a small `.json` beside it holding its name and dates.

Clicking another country's land (not a division) opens its card with how it stands with you: "Declare war" if you are at peace, "Offer peace" if you are at war. Offering peace, or getting an offer, opens the peace window: what the peace would do (the regions each side would hand over, named in the window and striped on the map, gold for what you gain and red for what you give up; everything else goes back), a table comparing both sides, and Accept or Refuse (Y or N) for an offer to you, or Offer peace or Cancel for yours. The game pauses while it is open.

To watch divisions fight, start a sandbox war between two neighbours (names as the scenario spells them); `--war` opens the viewer, where any country's divisions take orders, unless `--lead` is given too:

```sh
native/play.sh --war=Germany,France --view=7.5,49.3,14
```

That puts 24 German and 12 French divisions on their border, each side as one army group with a front along it, and gives the Germans an arrow about 150 km into France (`--war=Germany,France,30,20` changes the numbers). The game starts paused; orders work while paused.

| Key or mouse | Does |
| --- | --- |
| click a country (pick screen) | show its card; Esc hides it |
| Space | pause and resume |
| 1 to 5 | speed: 2, 6, 12, 24 or 72 game hours per second |
| click a division | select it, or its whole army group (Shift-click adds or removes one division) |
| Shift+drag | add every division in the box to the selection (only your own while you lead a country) |
| Ctrl+A | select all your divisions (while you lead a country) |
| G | make the selected divisions an army group |
| F, then drag | draw the selected group's front along a border |
| R, then drag | draw the selected group's arrow into enemy land |
| X | take the selected group's arrow away |
| right-click | send the selected divisions there directly (takes them out of their group) |
| B or M | open or close the budget and mobilization window (in the viewer: B cycles the selected division's country's budget, peace, war, all-out, and M its mobilization) |
| Shift+W | declare war on the country under the mouse (W alone pans) |
| P | offer peace to all enemies |
| Y or N | accept or refuse a peace offer (the peace window while you lead, in the viewer the newest offer to anyone) |
| I | hand the country to the AI, or take it back |
| F5 or F9 | quick save, or load the quick save (one slot for each country you lead and one for the viewer, in Godot's user data folder), also from the pause menu |
| Esc | stop drawing, or clear the selection; with nothing left to close, the pause menu (while leading a country); in the menu, back one step |
| drag, WASD or arrows | pan (WASD waits while Shift or Ctrl is held, for Shift+W and Ctrl+A) |
| wheel, + or - | zoom |

A marker is a box in the country's colour with a bar for the soldiers left. An orange frame means it is fighting, a red corner means it is cut off from supply. A front is a thick line in the group's colour (gold when selected), drawn smoothed where it steps around pockets (the rules still use the cells); an arrow is orange.

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
./test-screens.sh                       # headless screen tests (game/tests), about 10 s
./test-screens.sh war                   # just game/tests/war_test.gd
```

The screen tests start the game without a window or sound and click through it like a player: the pick screen, the war screen with its cards, list and country card, the budget window, selecting many divisions. Each test is a script in `game/tests/` that extends `harness.gd` (start the game, press keys, check, finish); a failed check prints `FAILED: <what>` and the script exits with 1. Rust tests cover the rules; these cover the wiring on screen. Run them when you change `game/` or the bridge.

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
# the pick screen with Poland's card:
gamescope --backend headless -W 1600 -H 900 -w 1600 -h 900 -- \
  godot-beta --path game --audio-driver Dummy --resolution 1600x900 -- \
  --view=17,51,6 --pick=Poland --screenshot=/tmp/pick.png
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

Starting armies (`--forces`, `sim/src/forces.rs`) come from `../assets/data/forces/world-bank.json.gz`: active military personnel, IISS figures published by the World Bank (CC BY 4.0, see its README; the credit is shown on screen while it is used). 60% of the latest observation up to the scenario's start counts as land forces, in divisions of 10,000 spread along each country's land borders, closer together where the neighbor's army is bigger (by the square root of its personnel, so one giant neighbor does not pull everyone to one border), and over its cities when it has no land border (or none that joins its main land or capital: divisions start on a sliver they cannot leave only when the country has nothing else, as Singapore and Bahrain, which hold no city on the map). The World Bank's groups of countries, which share codes with some disputed areas, are skipped. A country is found by its two-letter code, else the code in its flag link, else its name, so the Ukraine 2023 package (which carries no codes) has its armies too; where releasables share a country's name and flag, the entry holding the most land gets the figure. Countries without an observation start with none.

Regions (states, provinces, oblasts) come from Natural Earth admin-1, `../assets/geodata/admin1/regions.json.gz` (public domain, see its README). `sim/src/regions.rs` lays them over the cell grid when a scenario loads (about 0.15 s): every owned land cell gets exactly one region, and a region never crosses a de jure border. Military control does not change regions; a region can be partly occupied. Peace settles whole regions (`sim/src/terms.rs`): a region the other side alone holds more than half of becomes theirs by law, whole, and everything else either side holds of the other's regions goes back.
