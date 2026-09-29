# Modern Wars

A browser-based grand strategy war simulation played on a real-world map. Choose countries or alliances, start a conflict, and follow the frontlines, manpower, casualties, and original territory retained.

## Status

**Active development.** This is a dev build, so expect bugs, balance issues, rough UI, and incomplete systems.

## Running

Open https://vaspyyy.github.io/moder-wars/ in a browser.

The game opens directly at the main menu with default or remembered preferences. Fullscreen is available only through an explicit menu action.

For local development, serve the repository as static files:

```sh
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/.

## Current Era

The current **Choose Era** menu exposes one playable era:

- **2022 Modern Day** - current borders and geopolitics from `assets/maps/world map 2022.json`

## What You Can Do

- **PLAY** opens the 2022 Modern Day era and starts the conflict setup. The Basic panel covers AI posture and war rules, with + Side and FFA above the side cards. Optional manpower totals, date, and capture rules remain under Advanced. The simulation uses ground formations, naval planning, and optional missiles.
- **War Overview** shows manpower, casualties, and the percentage of original territory retained for each side and its countries. Country manpower shows deployed personnel; side manpower includes pooled reserves. Country rows are indented beneath their side totals.
- **EDITOR** redraws borders, creates countries, manages cities, and saves or loads scenarios.
- **COMMUNITY** browses, uploads, remixes, and downloads shared scenarios or countries.
- **SETTINGS** groups preferences into Gameplay, Display, Audio, Interface, and Advanced. Benchmark and performance tuning live under Advanced.
- Country cards keep identity and manpower visible, with buffs, allies, role, and doctrine under **Configure**.
- The live toolbar keeps map controls and simulation speed visible; restart, sandbox, sound, help, fullscreen, and navigation actions live under **Menu**.
- **God Mode** and editor tools can stage custom wars, alter borders, and test scenarios.

## Custom Scenarios

Modern Wars can load custom scenario files and community scenarios. This is separate from the built-in era picker: the main era menu currently exposes only 2022 Modern Day, but the editor and community tools can still create, import, remix, and share other setups.

## Controls

- Click-and-drag to pan, scroll to zoom
- Click a country to inspect it and assign it during setup

## Known State

Older era data, thumbnails, hidden cards, dormant click handlers, and import presets may still exist in the codebase. They are not currently exposed as supported main-menu eras unless they are visible in the **Choose Era** screen.

## Development Notes

The title screen uses a dedicated vector backdrop with bundled 50m geography and scenario colors. Regenerate it with `node scripts/build-title-backdrop.mjs` after changing those source assets.

- There is no build step and no root npm install requirement for the main app.
- Serve the repo as static files during local development.
- The service worker caches aggressively. After source changes, hard-refresh the browser or bump `CACHE_VERSION`.
- Game version appears in both `index.html` and `workers/service-worker.js`; keep them in sync.

## Tech

Vanilla JavaScript, Leaflet map, Canvas overlay, IndexedDB GeoJSON cache, and Web Workers for frontline and GeoJSON processing.

The live overview keeps only current values. Intelligence/contact memory, economy, rebellions, armor, air power, occupation garrisons, experiment recording, rematches, interventions, and native runtime checkpoint exports have been removed. Existing scenario files still load; obsolete options are ignored.

## Code organization

`src/main.js` owns shared application state and startup. Live getter/setter bindings in `runtime-context.js` let feature controllers observe replaced arrays and current state without importing `main.js`. These controllers cover setup, conflict lifecycle, AI planning, simulation ticks, menus, community tools, and editor actions. This is an incremental split: shared state still belongs to the application, rather than a fully independent simulation store.

`src/editor.js` wires editor tools; `geography-loader.js` and `scenario-loader.js` handle geography and scenario loading. `src/renderer.js` owns the Canvas layer and caches, with separate terrain, unit, label, overlay, and flag passes. Translation data, language application, audio, settings, and exports also have their own modules.

Commander mode has been retired, including its menus, briefing, HUD, operation definitions, and simulation branches. Conquest AI, task forces, tactical spatial buckets, cached decisions, workers, profiling, and benchmarks remain.

Run `biome check .` after editing. Individual offline checks live in `scripts/*-smoke.mjs`; the module graph check requires `node --experimental-vm-modules scripts/module-graph-smoke.mjs`. It verifies imports and offline-cache coverage without evaluating game code. `render-passes-smoke.mjs` additionally accepts `MW_RENDER_BASELINE` for an optional renderer comparison and uses native Canvas when available for flag-clipping checks. These scripts are offline checks, not interactive playtests.
