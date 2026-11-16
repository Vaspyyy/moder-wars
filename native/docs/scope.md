# v1 scope

**Status: on hold.** The owner wants to discuss turning the native game from an AI-vs-AI sandbox into a player-led grand strategy game. That decision comes first and may rewrite this list. Until then, the verdicts below are proposals for the sandbox version.

v1 is the smallest version that is fun to play: pick a scenario, pick one or more countries, a war happens on the real map with AI-controlled armies, the player watches and steers, frontlines move, and wars end through peace or surrender.

- **KEEP**: in v1.
- **LATER**: worth porting after v1 is playable.
- **CUT**: web-only plumbing, dead UI, or something that should not come back.
- **(?)**: open; the reason is given.

The inventory lists what the browser game (version 0.28.3, commit `0ab5744`) offers players. `file:line` references point into the browser game so a port can find the original. They describe the old game, not the native design.

## Decided so far

- **The whole UX is designed from scratch** (owner, 2026-11-16). The old title screen, menus and panels show *what* players needed, never *how* it should look or flow. "KEEP" on a UI row means the need stays, not the design.
- **Naval invasions (E22) are LATER.** A prototype without them is fine, even though island countries cannot be attacked yet.
- **Scenario data (B5):** the native game reads the existing MWSC v3 packages directly (`sim/src/scenario/`), proven by golden tests.
- **Mountains (A18, C7, E6, E8):** the browser game's simulation never had mountains on Earth maps. Its terrain scan is skipped for grids over 600,000 cells (`src/geography-loader.js:231`), and the shipped scenarios carry no mountain data, so every mountain rule was dormant. Native terrain needs new data and is a design decision, not a port.
- **Secret sounds (I7) stay** (owner's decision; the owner takes responsibility for the files).

## Notes that affect verdicts

1. The standalone map editor cannot be opened from the menus; it is reachable only through God mode (`src/sandbox-controls.js:51-100`).
2. The "Recruitment model" setting only changes troop *estimates* on setup cards and the leaderboard; real army sizes come from tile density, the unit cap, World Bank personnel and the population reserve (`src/main.js:4309-4360`, `src/war-start.js:583-630`).
3. The three restart buttons all call the same reset (`src/menu-controls.js:377-383, 852-855`).
4. There is no save game for a running war; "Save preset" saves the map only.
5. The player never answers AI peace offers: acceptance is rolled automatically (`src/simulation-tick.js:1590-1650`).

---

## 1. Menus and game setup

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| A1 | Title screen / main menu | "MODERN WARS" title over a vector world backdrop, PLAY and SETTINGS buttons, version in the footer | index.html:180-230, menu-controls.js:638-666, main.js:3178-3185 | 120 | KEEP | Entry point of the game |
| A2 | Scenario picker | Two cards (Modern 2026, Ukraine 2023), a "Selected" state, source/credit links, then "Start scenario" | index.html:196-226, menu-controls.js:5-21, 668-701, scenario-menu.js:1-79 | 180 | KEEP | Core flow. The OSM/Overture and DeepState credits are license requirements and must stay visible |
| A3 | Loading screens | Spinner, progress bar, status text and flavour tips; plain and "thematic" variants | index.html:236-270, main.js:3227-3233 | 60 | KEEP | Scenario load takes time; one simple version is enough |
| A4 | Pick countries into sides on the map | Click a country to add it to the active side; click again to inspect; clicking a country on another side moves it; side headers show estimated troops | main.js:5130-5266 (handleCountryClickOwned, setup branch), conflict-setup.js:89-240 | 450 | KEEP | This *is* "pick one or more countries" |
| A5 | Add / remove sides | "+ Side" adds a column up to 8 sides (MAX_SIDES, main.js:2022); "Remove Side" for sides beyond two; each side has its own colour | menu-controls.js:46-57, conflict-setup.js:468-505, main.js:2011-2026 | 80 | KEEP | Multi-side wars are cheap once the sim supports N sides |
| A6 | FFA mode | Each participant fights alone on its own side; existing allied groups stay together | menu-controls.js:59-64, conflict-setup.js:508-521, main.js:5195-5211 | 60 | KEEP | Small and adds replay value |
| A7 | AI posture | One select (Adaptive / Aggressive / Cautious) that maps to every country's doctrine (BALANCED / AGGRESSIVE / DEFENSIVE) | index.html:430-437, main.js:5348-5363 | 30 | KEEP | A simple steering lever before the war |
| A8 | Per-country role and doctrine | Under "Configure": role Offensive / Support, doctrine Hold / Defensive / Balanced / Aggressive / Blitz | conflict-setup.js:4-44, 268-283, 421-431 | 70 | KEEP (?) | Cheap UI, but only worth it if the Rust AI honours roles and doctrines from day one; defaults would also work |
| A9 | Combat buffs | Cycle a visible buff per country: Major penalty, Minor penalty, None, Small, Medium, Large buff | main.js:1925-1985, conflict-setup.js:296-330, inspector-controls.js:339-398 | 130 | LATER | Balance cheat; not needed to have fun |
| A10 | Invisible (secret) buffs | Alt-click the buff button to set a hidden buff that overrides the visible one; a Settings box disables them globally | inspector-controls.js:355-366, index.html:52-56, main.js:3162-3165 | 40 | CUT | Hidden cheat that makes results confusing |
| A11 | "Add Allies" button | Pulls a country's overlord, vassals and editor-defined allies into its side | conflict-setup.js:333-415 | 85 | LATER | Needs alliance/vassal data and the vassal system |
| A12 | Fight to the Death | Disables peace deals; the war ends only by defeat | index.html:441-447, menu-controls.js:319-325 | 10 | KEEP | One flag, clear player choice |
| A13 | Random War | Toggle that immediately picks a random pair of neighbouring countries (plus extra sides) and starts a war; only works from the setup state | main.js:5515-5622, menu-controls.js:66-79 | 110 | LATER (?) | Nice "instant war" button; easy to add once setup works. The tooltip says it spawns wars *periodically*, but the code only fires on the click (main.js:5518-5520) |
| A14 | Side manpower override | Advanced: type total soldiers for Side A / Side B | index.html:503-525, conflict-setup.js:61-88 | 50 | LATER | Tuning knob for power users |
| A15 | Time system and start date | Advanced: turn the calendar on and pick a start date; the date gates missiles (1942+) and selects the force-data year | index.html:528-558, war-start.js:15-21, simulation-calendar.js:1-101 | 140 | LATER | v1 can start on the scenario's own date (see F11 for the date readout) |
| A16 | Disable long-range missiles | Advanced checkbox | index.html:566-569, menu-controls.js:776-781 | 10 | LATER | Follows the missile feature (E25) |
| A17 | Disable puppets | Advanced checkbox (checked by default) that stops overlords auto-calling vassals into the war | index.html:574-577, war-start.js:975-993 | 25 | LATER | Follows the vassal feature (E26) |
| A18 | Disable mountains | Checkbox in setup and in Settings: removes mountain movement penalties and shading | index.html:57-60, 570-573, menu-controls.js:340-375 | 45 | CUT | Removes terrain, which is part of what makes fronts interesting |
| A19 | Cinematic mode (record war) | Hides most UI and records a local WebM video with MediaRecorder; also draws a casualty panel on the canvas | war-start.js:198-220, conflict-presentation.js:20-36, renderer.js:1886-1970, render-labels.js:68-70 | 150 | CUT | Browser recording API; players use OS/Steam recorders. A "hide HUD" key could come LATER |
| A20 | Start War | Validates at least two non-empty sides, shows loading, spawns armies, starts the clock | war-start.js:52-75 and 75-1020, menu-controls.js:848-850 | (in E) | KEEP | Core |
| A21 | Tutorial / "How to play" | Step-by-step popup (6 conquest steps, 5 editor steps) with Next/Back/Skip and required actions | main.js:3315-3530, menu-controls.js:31-44, 588-595 | 220 | LATER (?) | Worth having, but the conquest steps ask for Germany vs Poland and a "load map" step (main.js:3317-3360) that may not fit the current two-scenario flow |
| A22 | "Choose Era" / Conquest modal | A modal with one Modern Day card; the scenario picker only uses its button as a click proxy (menu-controls.js:644-645, 696-701) | index.html:782-823 | 45 | CUT | Duplicate of the scenario picker; never shown on its own |
| A23 | Credits / attributions screen | Existing modal is unreachable and stale (never opened by any code; it credits a soundtrack that does not ship) | index.html:865-890 | 25 | KEEP (rewrite) | A native release needs a reachable credits screen for data licenses (OSM, Overture, Natural Earth, DeepState, sound licences) |

## 2. Scenarios and eras

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| B1 | Modern World 2026 | Whole-world political map from a pinned Overture release, with regions; no live frontlines | scenario-menu.js:5-11, assets/maps/compiled/world-map-2026-v3.mwsc.gz, scripts/build-modern-2026-scenario.mjs | data | KEEP | The main sandbox scenario |
| B2 | Ukraine 2023 · Eurasia | Eurasian theater with approximate 2023-01-01 control and fictional armies; camera zooms to Ukraine | scenario-menu.js:12-23, menu-controls.js:683-694, assets/maps/compiled/ukraine-2023-v3.mwsc.gz | data | KEEP (?) | A ready-made war is great for a first session, but it needs B3 and B4. If theater masking slips, it becomes LATER |
| B3 | Regional theater masking | Masks countries, land and cities outside the theater and constrains the camera, while keeping global cell coordinates | scenario-theater.js:1-115 | 115 | KEEP (?) | Only needed for B2 |
| B4 | Sovereignty vs military control | Separate de-jure owner (`deJureMap`, `sovereigntyOverrides`) from who holds the ground (`worldControlMap`); keeps `historicalSource` through load/export/restart | scenario-territory.js:1-153, occupation-regions.js:1-233 | 390 | KEEP | Drives occupation display and "original territory retained" |
| B5 | Compiled scenario format (MWSC v3) | Compact binary scenario packages decoded in a worker | scenario-codec.js:1-543, workers/scenario-worker.js:1-148 | 690 | KEEP (?) | The native game needs scenario data; either port the decoder to Rust or convert the packages offline once. Format choice is open |
| B6 | Legacy scenario formats | MWSC v2 decoder and JSON scenario import/export | scenario-codec.js (v2 paths), scenario-loader.js:61-740 | 400 | LATER | Only for old user files |
| B7 | 2022 Modern Day package | Compiled package used only by the benchmark and "Import from Scenario"; not in menus | assets/maps/compiled (2022), benchmark-runtime.js, index.html:1067 | data | CUT | Not offered to players |
| B8 | Real-world army sizes | Starting formations are scaled to each country's dated World Bank active personnel | country-force-profiles.js:1-413, country-force-data.js, war-start.js:22-50, assets/data/forces/README.md | 480 | KEEP | Makes "real map" wars feel right |
| B9 | Population reserve pool | Each side's recruitable reserve is 1% of member populations (territory fallback) | war-start.js:900-930, 1088-1100 | 50 | KEEP | Needed for manpower to run out and wars to end |
| B10 | Geography and terrain data | Natural Earth 110m/50m/10m, derived land/terrain/river rasters, packed coastlines, desert overlay | geography-loader.js:1-824, geo-raster*.js (~390), geo.js:1-399, river-lines.js:1-103, main.js:4405-4447 | 2,100 | KEEP | The real map. One resolution is enough for v1 |
| B11 | Bundled flags | All flags ship locally; `localFlagUrl(code)` lookups | flags.js:1-48, flag-manifest.js:1-334, assets/flags/ | 380 | KEEP | Flags are on units, labels and panels |
| B12 | Procedural nations ("Uninhabited world") | When a loaded map has no countries, offers to spawn N random nations that expand over all land | scenario-loader.js:360-380, editor-commands.js:251-473, index.html:1100-1116 | 240 | LATER | Only for blank/custom maps |

## 3. Map display and overlays

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| C1 | Map camera | Drag to pan, wheel/trackpad zoom toward the cursor with easing and inertia, pinch, keyboard zoom, `Z` zooms out to the world, bounded Mercator | map-camera.ts:1-295, camera-input.ts:1-356, map-projection.ts:1-173, map-runtime.ts:1-181, simulation-controls.js:56-60 | 1,000 | KEEP | Reimplement in Godot |
| C2 | Political atlas map | Blue ocean, restrained country colours, coastlines with shading, fine contours, political borders | render-political-cache.js:1-906, render-terrain.js:1-335, render-atlas.js:1-311, atlas-gpu.ts:1-537, atlas-scene.ts:1-96 | 2,200 | KEEP | The look of the game |
| C3 | Frontlines | Lines where hostile sides' controlled land meets | render-political-cache.js:462-620, frontline-core.js:1-504 | 650 | KEEP | "Frontlines move" is the core visual |
| C4 | Occupation hatch and outline | Occupied land inside its historical owner is outlined and hatched | render-occupation.js:1-189, occupation-regions.js | 190 | KEEP | Shows who holds what |
| C5 | Country labels | Curved, collision-avoiding country names; capitals labelled | render-labels.js:1-268 | 270 | KEEP | Readability |
| C6 | Cities and capitals | Capitals visible at world scale; other cities appear on zoom; theater cities kept | render-atlas.js:280-287, renderer.js (cities pass) | 150 | KEEP | Cities matter in the territory ledger |
| C7 | Terrain shading | Mountains darkened, deserts marked; rivers exist as a raster mask (no separate river drawing found) | render-terrain.js, geo-raster.js, river-lines.js:27-78 | 200 | KEEP | Terrain explains why fronts stall |
| C8 | Battle visuals | Battle markers and explosions on the map; "Show Battle Visuals" toggle (also enables pocket hatch) | render-units.js:298-340, 836-870, menu-controls.js:138-149, 284-301 | 120 | KEEP | Makes fighting visible |
| C9 | Encirclement pocket hatch | Sealed pockets get a pulsing red hatch | render-pockets.js:1-71, renderer.js:1655 | 70 | KEEP | Pairs with E5, a highlight moment |
| C10 | Setup side tint and selection highlight | Countries on a side are tinted in that side's colour during setup; selected country highlighted | renderer.js, render-units.js:123-260 | 150 | KEEP | Players need to see their picks |
| C11 | Flag view | Toggle that paints each country with its flag instead of a colour | menu-controls.js:81-115, render-terrain.js:40-80 | 120 | LATER | Cosmetic |
| C12 | Alliance view | Colours/flags by alliance group; custom alliance flags | menu-controls.js:117-136, 303-317, index.html:372-375, main.js:4125-4165 | 150 | LATER | Needs alliance data (editor) |
| C13 | Country gradient toggle | Turns off the country colour gradient | index.html:89-92, settings.js:11 | 20 | LATER | Cosmetic toggle |
| C14 | Admin-1 regions overlay | Zoomed-in modern oblast/state borders and names as reference, not simulation provinces | admin-regions.js:1-107, render-admin-regions.js:1-164, assets/geodata/admin1/ | 270 | LATER | Nice context, not needed to play |
| C15 | Fade captured land | Newly captured cells briefly keep the previous side's colour | border-fade.js:1-83, renderer.js:1643 | 90 | LATER | Polish |
| C16 | Coordinates readout | Shows cursor lat/lng in the bottom bar | map-input.js:104-124, index.html:670 | 25 | CUT | Debug-style readout |
| C17 | Title backdrop | Vector world map behind the main menu | assets/images/title-map.svg, scripts/build-title-backdrop.mjs | asset | KEEP | Free, already built |
| C18 | Web render plumbing | Canvas fallback, PixiJS/Canvas split, world-chunk caching, culling, render budget, buffered layers | renderer.js:1-1972 (most), render-culling.js, render-budget.ts, render-regions.js, presentation-runtime.js | 2,500 | CUT | Godot renders natively; only the visual rules carry over |

## 4. Unit and army display

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| D1 | Unit markers | Each formation is a flag sprite with a strength badge | render-units.js:12-120, 600-700, render-flags.js:1-252, formation-strength.js:1-371 | 900 | KEEP | The armies the player watches |
| D2 | Soldier front labels | Per-country troop totals curved along each disconnected front, with a flag; separate labels for distant garrisons | render-soldier-labels.js:1-562 | 560 | KEEP | Big readability win at world zoom |
| D3 | Front hover tooltip | Hover near a front to see both sides' troops on that stretch and who is advancing | front-hover.js:1-240 | 240 | KEEP | Cheap way to "read" a front |
| D4 | AI operations overlay | Arrows for war plans (push/defend), naval invasion and supply routes, transport arrows, coastal/garrison zones; "Show AI Operations" is on by default | render-overlays.js:146-588, renderer.js:159-330 | 600 | KEEP (?) | Showing AI intent is fun to watch; v1 could start with only push arrows |
| D5 | Army decisions diagnostics | "Show Army Decisions": sector coverage, destinations, reserves, withdrawal reasons for one side | renderer.js:207-330, ai-runtime.js diagnostics | 250 | LATER | Developer view |
| D6 | Missile arcs and explosions | Rising/falling missile trails and blast circles | render-units.js:298-340 | 50 | LATER | Follows E25 |
| D7 | Inspector unit highlight | Units of the inspected country are highlighted | render-units.js:123-220 | 100 | KEEP | Supports the country inspector |
| D8 | Hide units / hide soldier labels | Two Display toggles | index.html:116-121, main.js:3154-3158 | 20 | LATER | Cosmetic |
| D9 | Canvas casualty panel | Casualty lists painted into the canvas, only in cinematic mode | renderer.js:1886-1970, render-labels.js:68-70 | 90 | CUT | Exists only for A19 recording |

## 5. Simulation features the player experiences

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| E1 | Ground combat | Formations engage nearby enemies; health, damage, attrition, battle tracking | ground-unit.js:1-1527, config.js:53-64 | 1,550 | KEEP | Core |
| E2 | Movement and navigation | Bounded reverse-Dijkstra route fields; avoids water and neutral land; terrain and congestion costs; formation slots | ground-movement.js:1-1588, army-navigation.js:1-497, army-formation.js:1-107 | 2,200 | KEEP | Core |
| E3 | Strategic army AI | PROPOSE, WEIGH, DECIDE, EXECUTE, REASSESS; operations assemble, breach, exploit, secure, withdraw, regroup | ai-proposals.js:1-1365, ai-planning.js:1-906, ai-plan-execution.js:1-801, ai-task-forces.js:1-843, ai-runtime.js:1-1859, docs/army-ai.md | 5,800 | KEEP | The AI that makes fronts move |
| E4 | Front sectors, coverage, reserves | Fronts split into ~2.5° sectors; defense shares by posture; 12% theater reserves | army-command.js:1-506 | 510 | KEEP | Stops fronts from collapsing for silly reasons |
| E5 | Encirclement | AI pincers/salient cuts; sealed pockets take mounting attrition and surrender after ~5 s at 1×; breakouts and relief attacks | army-encirclement.js:1-419, encirclement-pockets.js:1-183, simulation-tick.js:1475-1478 | 620 | KEEP | High-drama moment |
| E6 | Defensive lines | Major rivers and mountain ranges reduce damage on friendly ground; river crossings into enemy land are slow; outnumbered fronts fall back to the nearest line | defensive-lines.js:1-106 | 110 | KEEP | Geography matters on a real map |
| E7 | Capital fall | Short morale shock (all fronts fall back for a few seconds), lasting penalty, and new formations spawn weakened ("supply failed") | defensive-lines.js:69-86, simulation-tick.js:770-780, 1179, simulation-world.js:652-657 | 60 | KEEP | Clear objective for the AI and the viewer |
| E8 | Mountain terrain and Alpenjäger | Mountains slow movement; 40% of formations spawned on mountain cells become Alpenjäger (+25% health, faster in mountains, +12% combat) | config.js:53-56, war-start.js:691, simulation-world.js:636 | 40 | KEEP (?) | Tiny; keep if terrain is in v1 (it is), but it is a random hidden bonus |
| E9 | Territory control (influence) | Units push control cell by cell; occupation map, dominant side per cell | influence-runtime.js:1-610, influence-grid.js:1-141, territory-runtime.js:1-164 | 920 | KEEP | How land changes hands |
| E10 | Territory ledger | Per-country and per-side counts: de-jure totals, retained %, cities held, used for capitulation | territory-ledger.js:1-1125 | 1,130 | KEEP | Feeds war end and the War Overview |
| E11 | Manpower and reinforcement | Deployed personnel vs recruitable reserve; reinforcement; depleted formations rotate out and refill; recruitment ramps as reserves fall | simulation-tick.js:1170-1270, conflict-personnel.js:1-105, main.js:2034-2044 | 350 | KEEP | Wars of attrition end by exhaustion |
| E12 | Casualties | Losses per country, shown live | main.js (countryCasualties), main.js:5936-5990 | 80 | KEEP | Key number players watch |
| E13 | War phases and momentum | Per side: ADVANCING / STALEMATE / RETREATING / COLLAPSING from momentum slope; offensive surges start above 60% momentum and stop below 35% | simulation-tick.js:660-680, 870-995 | 200 | KEEP | Drives AI pacing and peace pressure |
| E14 | War grace period | ~10 s ceasefire after declaration for mobilization | config.js:62, war-start.js:146-149 | 10 | KEEP | Trivial |
| E15 | Mop-up | Leftover enemy cells behind the front get cleared | mop-up.js:1-100, ground-movement.js:109 | 100 | KEEP | Prevents stuck islands of control |
| E16 | Multi-side hostility | Hostility matrix decides which sides fight each other | main.js:2167-2212, territory-ledger.js:266-375 | 80 | KEEP | Needed for more than 2 sides and separate peace |
| E17 | AI peace proposals | On a cooldown, a random side may offer peace; chance grows with peace pressure; acceptance depends on land and pressure; a banner shows "requests peace", then accepted/rejected | simulation-tick.js:1590-1650, main.js:6170-6208 | 120 | KEEP | One of the two ways wars end. Note: the player does not answer offers; the result is pre-rolled |
| E18 | Peace treaty and white peace | Ends the war; occupied war-zone land transfers by occupier majority, borders smoothed only inside the war zone; white peace keeps borders | conflict-resolution.js:375-579 | 210 | KEEP | War end |
| E19 | Country capitulation | A country whose units and held territory fall below thresholds capitulates and is annexed; its land is split among attackers | surrender.js:1-166, conflict-resolution.js:4-374, simulation-tick.js:1484-1522 | 540 | KEEP | The other way wars end |
| E20 | Full capitulation / global end | A side holding ≥99.9% (or ≤0.1%) ends the war; evaluateGlobalConflict ends it when no hostile pairs remain; all units gone means white peace | simulation-tick.js:1526-1590, 1653-1656, surrender.js:129-140 | 80 | KEEP | War end |
| E21 | Fixed logical clock | Simulation advances on fixed ticks independent of frame rate; catch-up capped at 60 ticks; speed changes clear backlog | simulation-clock.js:1-126, simulation-phase-wheel.js, simulation-jobs.js | 830 | KEEP | Port the idea to Rust; determinism helps testing |
| E22 | Naval invasions and supply | AI gathers troops at a staging point, ships them across water (faster naval speed), landing debuff for 300 ticks, periodic supply runs | ground-movement.js:160-260, ai-proposals.js, ai-plan-execution.js, config.js:59-66 | 600 | LATER | Big subsystem; without it island countries (UK, Japan, Taiwan) cannot be attacked. Owner: fine for a prototype |
| E23 | Transport to the front | Units stranded >3° behind the front get a fast "railway" move to it | ai-proposals.js:1274-1330, ai-plan-execution.js:299-371 | 150 | KEEP | Otherwise big countries lose because troops spawn far from the front |
| E24 | Coastal defense and neutral garrisons | AI keeps troops on threatened coasts and neutral borders | ai-proposals.js:953+, ai-planning.js:476-690, ai-plan-execution.js:285-375, 614 | 300 | LATER | Mostly matters with naval invasions |
| E25 | Long-range missiles | 2-8 random silo bases per side; ~1% chance per tick to fire at a random enemy unit; 1942 date gate | war-start.js:830-850, simulation-tick.js:1690-1765, simulation-world.js:691-707 | 150 | LATER | Random decorative damage, not strategy |
| E26 | Vassals and puppets | Vassals auto-join their overlord's war (unless disabled); generated puppet flags | war-start.js:975-993, main.js:1837-1925 | 150 | LATER | Needs vassal data from the editor |
| E27 | Releasable nations | Release a stored "releasable core" country from a host, in setup or mid-war | country-actions.js:1-159, country-diplomacy.js:5-85, conflict-setup.js:448-456 | 300 | LATER | Needs releasable data from the editor |

## 6. Player controls during play

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| F1 | Pause / resume | Button and Space key | main.js:6426-6442, simulation-controls.js:35-43, index.html:381-384 | 40 | KEEP | Basic |
| F2 | Speed selector | 1×, 2×, 3×, 5×, 10× radio bars; `+`/`-` keys; pausing keeps the chosen speed | main.js:6406-6425, 6481-6495, index.html:385-392, simulation-controls.js:25-33 | 60 | KEEP | Basic |
| F3 | Country inspector (in war) | Click a country: name, colour, buff, current side, actions below | inspectors.js:38-283, inspector-controls.js:331-338 | 250 | KEEP | Hub for steering actions |
| F4 | Join a side mid-war | Neutral country: "JOIN SIDE X" or "JOIN NEW SIDE" (declares on everyone) | inspectors.js:100-151, country-diplomacy.js:116-200, war-start.js:1021-1260 | 330 | KEEP | Main "steer" lever: widen the war |
| F5 | Exit conflict | "EXIT CONFLICT (ANNEX OCCUPIED)": a country leaves and keeps what it occupies | inspectors.js:84-98, conflict-diplomacy.js:4-74 | 90 | KEEP (?) | Good lever; unsure how often players use it |
| F6 | Diplomacy: separate and global peace | DIPLOMACY button: click the withdrawing nation, then its opponent, for a separate peace; press again for global white peace; Esc cancels | menu-controls.js:385-415, main.js:5070-5097, conflict-diplomacy.js:75-321, simulation-controls.js:63-76 | 300 | KEEP | Main "steer" lever: end parts of the war |
| F7 | Force vassalization | Mid-war button when a country has lost over half its land: it becomes a vassal of the main occupier and joins that side | inspectors.js:153-196 | 45 | LATER | Follows E26 |
| F8 | War Overview (war desk) | Per side and per country: manpower, casualties, % original territory retained | war-overview.js:1-61, main.js:5395-5463, 1000-1010 (war-start setup), index.html:608-640 | 140 | KEEP | The main "who is winning" panel |
| F9 | Combat Operations Report | Side cards (personnel, cities, momentum), VS, a tug-of-war territory bar, plus the treaty/capitulation banner | main.js:3612-3786, conflict-presentation.js:1-101, index.html:649-667 | 280 | KEEP | Live drama; may merge with F8 |
| F10 | Casualties and Manpower panel | Live counting casualty lists per side | main.js:5934-5990, index.html:642-645 | 70 | KEEP (?) | Overlaps F8; could be merged |
| F11 | HUD readouts | Status text line, game date, unit count | index.html:363-366, 604, main.js:5900-5932 | 60 | KEEP | Basic feedback |
| F12 | Minimize panels | Collapse setup, stats, status and war desk | menu-controls.js:822-846, index.html:618-627 | 40 | KEEP | Map space |
| F13 | Restart | Quick restart / Reload scenario / Reset; all reload the scenario (note 3) | conflict-reset.js:118-184, menu-controls.js:377-383, 852-855 | 120 | KEEP | One "Restart" button is enough |
| F14 | Back to setup after war | After a treaty the setup panel reopens ~1.5 s later with the final date kept | conflict-presentation.js:84-101, main.js:5465-5470, conflict-reset.js:5-100 | 120 | KEEP | Loop: play again |
| F15 | God mode | Pauses the sim and opens editor tools mid-game (paint borders, cities, etc.), then resumes | sandbox-controls.js:51-160 | 110 | LATER | Depends on the editor |
| F16 | God bomb | In God mode during war: pick a sender country, click anywhere to launch a missile | sandbox-controls.js:3-28, main.js:4865-4912 | 75 | LATER | Fun toy, depends on E25 |
| F17 | Leaderboard | Local ranking of countries by tiles and estimated units (it is local, despite the "Global Leaderboard" title) | main.js:6075-6163, index.html:893-921 | 100 | LATER | Not online; low value |
| F18 | Main menu button | Should return to the title screen; has no handler (the button has no click handler) | index.html:397, main.js:3558 | 5 | KEEP (?) | Needed in a native game; current one appears dead |
| F19 | Fullscreen button | Browser Fullscreen API | menu-controls.js:597-608 | 15 | CUT | Native window mode setting instead |
| F20 | Mute button | "Sound: on/off" | audio.js:395-416 | 25 | KEEP | Basic |
| F21 | Keyboard shortcuts | Space, `+`/`-`, Esc (cancel peace pick / close inspector), `Z` (world view), Delete (unclaim in editor) | simulation-controls.js:1-79, camera-input.ts:295-335 | 110 | KEEP | Delete belongs to the editor (LATER) |

## 7. Editor

All editor features are reachable today only via God mode (note 1).

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| G1 | Editor entry | "Real Earth" or "Blank Canvas" (with width/height); editor tutorial on first use | editor-tool-controls.js:226-360, index.html:682-733 | 140 | LATER | Unreachable from menus now |
| G2 | Toolbox pages | P1 scenario tools, P2 country library, P3 terrain, City, Images | index.html:274-359, editor.js:411-454, editor-tool-controls.js:169-177 | 150 | LATER | |
| G3 | New nation | Name, colour, flag upload, then click to place | editor-commands.js:71-117, inspector-controls.js:23-59, index.html:826-847 | 90 | LATER | |
| G4 | Border painting | Paint brush with size slider, flood fill, unclaim, annex by click, annex a real country by name, Delete to unclaim | editor.js:253-410, editor-commands.js:118-250, map-input.js:125-229, main.js:4930-5055, 6443-6480 | 700 | LATER | |
| G5 | Terrain brush | Paint Land / Desert / Mountain / Ocean, terrain fill | editor.js:140-252, editor-tool-controls.js:100-124 | 140 | LATER | |
| G6 | Place division | Click to deploy a formation for a chosen country | editor-commands.js:6-70, editor-tool-controls.js:125-149 | 90 | LATER | |
| G7 | City tools | New, move, delete, clear all, rename, owner, set capital | inspector-controls.js:399-551, inspectors.js:285-310 | 180 | LATER | |
| G8 | Country identity | Rename, colour picker, flag upload, "Fetch Modern" (local flag lookup), alliance flag | inspector-controls.js:60-170, 269-308, editor.js:104-139 | 250 | LATER | |
| G9 | Diplomacy setup | Vassalize, set releasable, clear overlord, add ally by clicking, clear allies | menu-controls.js:728-748, inspector-controls.js:227-330, country-diplomacy.js:50-115, main.js:5000-5040 | 220 | LATER | |
| G10 | Map settings | Map name, world width/height in degrees, enable missiles | menu-controls.js:750-788, main.js:4078-4124, index.html:736-779 | 120 | LATER | |
| G11 | Test scenario | Play the edited map, return to the editor afterwards | editor-tool-controls.js:178-200, conflict-reset.js:31-50 | 50 | LATER | |
| G12 | Background and reference images | Custom satellite background; reference image with opacity, scale, draw-above toggle and drag handles | reference-controls.js:1-155, reference-overlay.js:1-104, render-overlays.js:124-145 | 290 | LATER | Tracing aid for map makers |
| G13 | Download map PNG | High-res PNG of the map layout | editor-file-controls.js:122-185 | 65 | LATER | |
| G14 | Editor tutorial | 5-step popup | main.js:3362-3398 | 40 | LATER | |

## 8. Settings and preferences

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| H1 | Settings screen | Tabs Gameplay, Display, Audio, Interface, Advanced; Back and Save | index.html:16-178, menu-controls.js:498-546, 617-636 | 250 | KEEP | Needed, much smaller in v1 |
| H2 | Max units | 100 / 250 / 500 / 1000 (labelled "Global", stored as MAX_UNITS_PER_SIDE) | index.html:35-41, war-start.js:583-620 | 20 | KEEP | Main performance knob |
| H3 | Recruitment model | Balanced / Land area / Population / GDP; changes only displayed estimates (note 2) | index.html:43-50, main.js:4309-4360, 6542-6545 | 60 | CUT (?) | Misleading as it stands; unsure if the author intended it to drive real army size |
| H4 | Map resolution | 110m / 50m / 10m geography | index.html:63-69, geography-loader.js | 30 | LATER | v1 can ship one resolution |
| H5 | Grid density | Simulation cell size 0.25 / 0.15 / 0.1 / 0.05 degrees | index.html:71-78, config.js:3 | 30 | LATER (?) | Changes front smoothness and CPU cost; a native build may just fix one value |
| H6 | Performance presets | LOW / DEFAULT set resolution, grid, units, gradient, mountains at once | menu-controls.js:469-496 | 30 | LATER | |
| H7 | Display toggles | Labels, cities, battle visuals, AI operations (plus the LATER ones listed in C/D) | index.html:89-122, menu-controls.js:151-317, main.js:6296-6320 | 200 | KEEP | Only for kept features |
| H8 | Use system font | Replace the Playfair Display title font | index.html:162-166, main.js:3170-3171 | 10 | CUT | Web font workaround |
| H9 | Remember preferences | Saves settings in cookies; restored at start | settings.js:1-70, preferences.js:1-18, main.js:6626-6634 | 90 | KEEP | As a native config file; cookie code is CUT |
| H10 | Disable auto-fullscreen | Settings key `mw_disable_fullscreen` with no checkbox in index.html | settings.js:12, main.js:3166-3168 | 5 | CUT | Orphan setting |

## 9. Audio and music

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| I1 | UI click | Click sound on buttons and picks | audio.js:314-325 | 15 | KEEP | |
| I2 | War start and peace stingers | `war.wav` at war start, `peace.wav` at peace | audio.js:326-379 | 55 | KEEP | Marks the big moments |
| I3 | War ambiance | Looping battle ambiance at low volume while simulating | audio.js:251-287 | 40 | KEEP | Atmosphere |
| I4 | Explosion sound | On missile impacts | audio.js:288-313, simulation-tick.js:1696 | 25 | LATER | Follows E25 |
| I5 | Background music | Music system with volume, but no track ships (audio.js:17-18) | audio.js:86-250 | 170 | KEEP (?) | Slot is worth keeping; needs a licensed or generated track |
| I6 | Custom soundtrack | Pick a local audio file; stored in Cache Storage | menu-controls.js:428-467, local-files.js:41-79 | 90 | LATER | Native: a music folder would do |
| I7 | Secret sounds | Replaces the war and peace stingers with two alternative clips; on by default (see "Decided so far") | audio.js:23-40, 226-240, menu-controls.js:327-338 | 40 | KEEP | Owner's decision |
| I8 | Volume and mute | Music volume slider, mute toggle, remembered | audio.js:380-416, index.html:124-128 | 40 | KEEP | |

## 10. Save/load, import/export

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| J1 | Save / load scenario preset | Download the current map as `<name>_preset.json`; load it back | editor-file-controls.js:7-46, scenario-loader.js:25-740, scenario-export.js:1-169 | 900 | LATER | Map-making feature, not a war save (note 4) |
| J2 | Save / load single country | Country JSON with its cells, colour, flag | editor-tool-controls.js:201-216, main.js:6496-6514, country-export.js:1-62, country-import-menu.js:6-163 | 260 | LATER | |
| J3 | Country ZIP packs | Save Ctrl-selected or all countries to ZIP; load a ZIP (JSZip) | editor-file-controls.js:47-121, 270-410, main.js:1763-1780 | 230 | LATER | |
| J4 | Import country from scenario | Pick a country from the built-in 2022 map or a saved JSON and merge it in | country-import-menu.js:164-289, editor-file-controls.js:186-269, scenario-loader.js:742-951, main.js:3000-3100 | 500 | LATER | |

Not present today: saving and resuming a running war. Worth deciding separately whether v1 needs it (?).

## 11. Performance and debug tools

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| K1 | Benchmark | Settings → Advanced → BENCHMARK runs a scripted Russia vs China war and shows a results modal | benchmark-runtime.js:1-368, index.html:86, 1122-1128 | 380 | LATER | Useful dev/QA tool; Rust will need its own |
| K2 | FPS overlay | "FPS / Frame ms" box, also used during benchmark warm-up | index.html:923-925, benchmark-runtime.js:312-315 | 20 | LATER | Godot has its own monitors |
| K3 | Console perf API | `window.perfEnable`, `perfReport`, `perfRunSuite`, baselines in localStorage, DevTools trace marks | developer-controls.js:1-197, performance-profiler.js:1-541, performance-reports.js:1-804, performance-runtime.js:1-106 | 1,650 | CUT | Browser-specific; use Rust/Godot profilers |
| K4 | Load profiler | Load-phase timing traces | load-profiler.js:1-99 | 100 | CUT | Browser-specific |
| K5 | CLI simulation profiler | `scripts/profile-performance.mjs` runs the sim in Node with V8 profiles | scripts/profile-performance.mjs, scripts/profiling/ | 800 | CUT | Replace with Rust benches (keep the case list as reference) |
| K6 | Error overlay | Replaces the page with the JS error and stack | bootstrap.js:1-10 | 10 | CUT | Native crash handling instead |

## 12. i18n

| # | Feature | What it does for the player | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| L1 | UI language | 13 languages in the selector. English has ~145 keys; ru/ja/es/fr/de/pt ~100 each; it/pl/zh/uk/hi/ar only 10-30 keys. Many strings (setup, war desk, editor, alerts) are hard-coded English and never translated | i18n.js:1-99, translations.js:1-903, index.html:145-160 | 1,000 | LATER | English-only v1; set up Godot translation files early |
| L2 | Country name translations | `NATIONS` dictionaries translate country names in some languages | translations.js (NATIONS blocks), i18n.js:56-70 | 150 | LATER | |

## 13. Web platform plumbing

| # | Feature | What it does | Main files | ~Lines | Verdict | Reason |
|---|---|---|---|---|---|---|
| M1 | Service worker offline cache | Versioned app shell plus runtime cache; must list every module | workers/service-worker.js:1-295, service-worker.js:1-3 | 300 | CUT | Native game is offline by nature |
| M2 | Service worker registration | Registers after load/idle | bootstrap.js:12-30 | 20 | CUT | |
| M3 | IndexedDB geography cache | Caches parsed geography in `mw-geocache` | geo.js:20-60 | 60 | CUT | Native loads files directly |
| M4 | Simulation worker and client | Resident worker, client mirrors, acknowledged ownership handoff, packed snapshots, dirty 32-cell tiles, protocol versioning | workers/war-simulation-worker.js:1-174, simulation-client.js:1-483, simulation-protocol.js:1-956, presentation-runtime.js:1-132, simulation-core.js:1-470 | 2,200 | CUT (as code) | Rust sim + Godot needs its own bridge; the sim/presentation split is the idea to keep |
| M5 | Helper workers | Frontline worker, scenario decoder, geo parse, geo raster | workers/simulation-worker.js, scenario-worker.js, geo-parse-worker.js, geo-raster-worker.js, worker-asset-url.js | 300 | CUT | |
| M6 | Build and page shell | Vite, CSP meta, Google Fonts link (it loads a font from Google Fonts), `#map` div | vite.config.ts, index.html:1-12, tsconfig*.json | 150 | CUT | |
| M7 | Browser storage helpers | Cookies, data-URL images, Cache Storage soundtrack | preferences.js, local-files.js | 100 | CUT | |
| M8 | Live context bindings | Getter/setter bridge so modules see main.js state | runtime-context.js, main.js:1-1300 | 1,300 | CUT | Architecture artefact of main.js |
| M9 | Custom dialogs | In-page alert/confirm/prompt with focus trap | dialogs.js:1-180 | 180 | CUT | Godot has dialogs |
| M10 | Legacy flag URL remap | Maps old flagcdn.com and WebSim blob links in loaded data to local flags | flags.js:1-48 | 50 | CUT | Only for old web data; must not reintroduce remote URLs |

Not player-facing, but useful to carry over: the Node asset build scripts (`scripts/build-*.mjs`, `prepare-*.mjs`) can keep producing scenario data offline, and the `scripts/*-smoke.mjs` checks describe expected sim behaviour that could become Rust test cases.

---

## Summary

| Area | Features | KEEP | LATER | CUT |
|---|---:|---:|---:|---:|
| 1. Menus and game setup | 23 | 11 | 8 | 4 |
| 2. Scenarios and eras | 12 | 9 | 2 | 1 |
| 3. Map display and overlays | 18 | 11 | 5 | 2 |
| 4. Unit and army display | 9 | 5 | 3 | 1 |
| 5. Simulation features | 27 | 22 | 5 | 0 |
| 6. Player controls during play | 21 | 16 | 4 | 1 |
| 7. Editor | 14 | 0 | 14 | 0 |
| 8. Settings and preferences | 10 | 4 | 3 | 3 |
| 9. Audio and music | 8 | 5 | 2 | 1 |
| 10. Save/load, import/export | 4 | 0 | 4 | 0 |
| 11. Performance and debug | 6 | 0 | 2 | 4 |
| 12. i18n | 2 | 0 | 2 | 0 |
| 13. Web platform plumbing | 10 | 0 | 0 | 10 |
| **Total** | **164** | **83** | **54** | **27** |

(?) items counted under their proposed verdict: A8, A13, A21, B2, B3, B5, D4, E8, E17 note, F5, F10, F18, H3, H5, I5. Since the counts: I7 moved from CUT to KEEP.

**The 5 features that matter most for fun:**

1. **Army AI that moves the fronts** (E2 movement, E3 strategic AI, E4 sectors, E23 transport): without it nothing happens on the map.
2. **Live frontline map on real geography** (C2 atlas, C3 frontlines, C4 occupation, D1 unit markers): the thing players watch.
3. **Click countries into sides** (A4, A5, A6 FFA, A12 fight to the death): any matchup on the real map in seconds.
4. **Wars that end** (E17 peace offers, E18 treaties, E19/E20 capitulation) **plus the steering levers** (F4 join mid-war, F6 separate/global peace).
5. **Encirclements and defensive lines** (E5, E6, E7 capital fall, C9 pocket hatch): the dramatic moments that make a war feel like a story.

Runner-up: the readouts that explain what is happening (F8 War Overview, D2 soldier front labels, D3 front hover).
