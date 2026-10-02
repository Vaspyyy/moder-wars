# Modern Wars

A browser-based grand strategy war simulation played on a real-world map. Choose countries or alliances, start a conflict, and follow the frontlines, manpower, casualties, and original territory retained.

## Status

**Active development.** This is a dev build, so expect bugs, balance issues, rough UI, and incomplete systems.

## Running

Open https://vaspyyy.github.io/moder-wars/ in a browser.

The game opens directly at the main menu with default or remembered preferences. Fullscreen is available only through an explicit menu action.

For local development, use Node 24 or newer:

```sh
npm ci --ignore-scripts
npm run dev
```

`npm run check` runs strict TypeScript checks for the new engine modules, lint, Node regressions, a production build, and offline asset checks. `npm run build` outputs the static site to `dist/`; `npm run preview` serves that output. See [the migration and deployment notes](docs/MODERNIZATION.md) before merging or deploying.

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
- The live toolbar has a five-bar speed selector: click 1×, 2×, 3×, 5× or 10× directly. Filled bars show the selected level; pausing retains your chosen speed. Restart, sandbox, sound, help, fullscreen, and navigation actions live under **Menu**.
- **God Mode** and editor tools can stage custom wars, alter borders, and test scenarios.

## Map Appearance

The default **Atlas (Menu Style)** view uses a blue ocean, restrained country colors, geographic coastlines, coastal shading, fine territory contours, and smaller labels. Capitals remain visible at world scale; other cities appear as you zoom in, with active theater cities retained. Country and city labels avoid overlapping their peers.

Atlas is the only visual style. Custom terrain, resized worlds, and editing use contours from the live grid so painted land is preserved. Ownership, occupation, and hit testing continue to use the simulation grid. The native camera handles dragging and zoom; PixiJS retains GPU country meshes and unit sprites, with cached Canvas overlays and a complete Canvas fallback for capture, flag view, and devices without WebGL.

Coastlines follow the selected 110m, 50m or 10m geography resolution. The small 110m asset is included in the offline shell; higher-resolution coastlines download on demand and enter the runtime cache. If geography cannot load, Atlas uses its grid coastline fallback.

During a war, soldier totals appear separately for each home country on each disconnected front. The numbers curve along the front on the troops' side, with a national flag and space between coalition members. Totals use surviving deployed land personnel across the whole front, so panning does not change them. Formations are counted once against their nearest front within six latitude-equivalent degrees; distant reserves and overseas garrisons receive local labels, with water gaps keeping islands separate.

## Custom Scenarios

Modern Wars can load custom scenario files and community scenarios. This is separate from the built-in era picker: the main era menu currently exposes only 2022 Modern Day, but the editor and community tools can still create, import, remix, and share other setups.

## Controls

- Click-and-drag to pan. Wheel and trackpad zoom ease continuously toward the cursor; reversing the wheel immediately reverses the camera.
- Click a country to inspect it and assign it during setup
- Space pauses/resumes during a war; + / − changes the speed level. The speed selector also supports native radio-button arrow-key navigation.

Speeds are target multipliers: large wars may reach the CPU's simulation limit before 5× or 10×. Lowering speed immediately clears accumulated catch-up time. Live clocks keep at most 60 pending ticks, so a slow period cannot leave minutes of time queued. Each completed tick still performs the full simulation; the calendar advances only for completed ticks.

## Known State

Older era data, thumbnails, hidden cards, dormant click handlers, and import presets may still exist in the codebase. They are not currently exposed as supported main-menu eras unless they are visible in the **Choose Era** screen.

## Development Notes

Atlas coast assets contain compressed packed coordinates derived from the bundled Natural Earth data, without feature properties. Regenerate an asset with `node scripts/prepare-atlas-coast.mjs 110m` (or `50m` / `10m`), then rebuild the static site.

Camera movement transforms buffered canvas layers during gestures and repaints near the buffer edge or when movement ends. Zoom detail levels retain their country geometry. Captures and recordings use a viewport-sized canvas.

`src/camera-input.ts` owns pointer, wheel, touch, and keyboard camera input. It publishes camera changes at most once per display frame, anchors wheel zoom at the cursor, and cancels momentum on resets. Reduced-motion preferences skip easing and inertia. Buffered Canvas overlays replenish near their edges, while GPU country meshes follow the camera matrix.

Run `node scripts/native-camera-smoke.mjs` for projection round trips, cursor anchoring, coalesced dragging, pinch transitions, inertia, cancellation, editor ownership, and camera bounds. `atlas-scene-smoke.mjs` checks retained geometry and neighboring chunk invalidation; `atlas-gpu-smoke.mjs` checks real Pixi drawing instructions and fallback control flow in Node. These do not launch a browser or execute GPU rendering.

Run `node scripts/camera-performance-smoke.mjs` to check exact cached half-cell projections against a full-Earth fixture. It reports Node CPU work and projection counts, not browser or GPU frame rate. For comparison, pass `--compare /path/to/previous-renderer.js` to use an earlier renderer's projection block on the same fixture.

Run `node scripts/atlas-smoke.mjs` for atlas topology, coastline, occupation, edited-map, full-Earth cache, and offline-shell checks. Verification remains source inspection, Biome, and Node smoke checks; these checks do not establish browser rendering or frame rate.

The title screen uses a dedicated vector backdrop with bundled 50m geography and scenario colors. Regenerate it with `node scripts/build-title-backdrop.mjs` after changing those source assets.

- Install the locked npm dependencies and use Vite for local development.
- Deploy the production output from `dist/` through the GitHub Actions Pages workflow.
- The service worker caches aggressively. After source changes, hard-refresh the browser or bump `CACHE_VERSION`.
- Game version appears in both `index.html` and `workers/service-worker.js`; keep them in sync.

## Tech

Vite, strict TypeScript camera/scene modules, PixiJS WebGL with Canvas overlays and fallback, existing JavaScript menus and simulation, IndexedDB caching, and a resident simulation worker. The simulation advances on a fixed logical clock independent of rendering; the UI receives packed unit positions and changed 32-cell map tiles. Editing and diplomacy take an acknowledged state handoff. Country geometry caches world chunks across camera movement.

Presentation paints fresh snapshots at up to 30 Hz independently of monitor refresh, with immediate camera settlement and bounded deferral after expensive snapshot intake. HUD values update only when their displayed text changes. Unit mirrors retain ID lookups and spatial buckets; flag sprites and strength badges are cached by their actual inputs.

Map snapshots send only changed fields within dirty tiles. Occupation-intensity updates refresh city markers without rebuilding political meshes or country regions. Partial political paints traverse the affected tile set, including seam padding, and reuse projected polygon paths. Stable presentation graphs are omitted from later worker snapshots; frequently changing graphs bypass repeated comparisons until a periodic recheck. Full ownership handoffs still return complete state.

Compiled scenarios use MWSC v3 with compact saved-territory runs and deduplicated flag blobs; the v2 decoder and JSON import/export remain supported. Raw reference geography is loaded only when an editing tool needs it. Worker influence grids use lazy Float32 pages; legacy editing receives dense arrays on demand.

## Offline Verification

Run `npm run check` for the integration suite and production output checks. Individual checks use `node scripts/<name>-smoke.mjs`; the module-graph check requires `node --experimental-vm-modules scripts/module-graph-smoke.mjs`. Worker/core/client checks use actual simulation code and Node worker threads without a browser.

Run `node scripts/soldier-labels-smoke.mjs` for separate fronts, country ownership, surviving personnel, worker snapshots, isolated garrisons, longitude wrapping, curved canvas commands and camera-independent totals. It also reports grouping CPU time for 2,400 formations across 24 fronts; this is a synthetic Node measurement.

The presentation checks are `presentation-runtime-smoke.mjs`, `render-chunks-smoke.mjs`, `render-passes-smoke.mjs`, `unit-render-cache-smoke.mjs`, `simulation-client-smoke.mjs`, and `simulation-worker-smoke.mjs`. They cover fresh-data cadence at different display rates, intake budgets, stable unit identity/removal, sparse terrain paints, flag/badge cache invalidation and ordered transport. `camera-performance-smoke.mjs` reports full and sparse political-paint CPU work; it does not establish browser frame rate.

Measured CPU probes during the performance refactor (synthetic fixtures, not browser FPS):

| Probe | Before | After |
| --- | ---: | ---: |
| Repeated 180,000-cell terrain paint | 75.2–95.3 ms | 6.1–6.5 ms |
| Unchanged 1,200-member allocation among 2,400 units | 24.55 ms | 0.76 ms |
| Eligible dense friendly group of 1,000 units | 12.36 ms | 0.053 ms |
| Modern Day compressed package | 1,109,544 bytes | 282,918 bytes |

Sparse influence pages reduce memory for regional wars, with extra scalar lookup cost; `node scripts/influence-storage-benchmark.mjs` measures that tradeoff. Full ownership transfers remain intentionally limited to starting wars and explicit UI edits.

The live overview keeps only current values. Intelligence/contact memory, economy, rebellions, armor, air power, occupation garrisons, experiment recording, rematches, interventions, and native runtime checkpoint exports have been removed. Existing scenario files still load; obsolete options are ignored.

## Code organization

`src/main.js` owns startup, browser state mirrors, menus, and editor integration. Live getter/setter bindings in `runtime-context.js` let browser controllers observe replaced arrays and current state without importing `main.js`. The independent simulation owner in `simulation-core.js` composes combat, AI, influence, territory, and calendar modules through explicit dependencies. `simulation-client.js` synchronizes controls and drawing snapshots, and returns full ownership before browser edits.

`src/editor.js` wires editor tools; `geography-loader.js` and `scenario-loader.js` handle geography and scenario loading. `src/renderer.js` owns the Canvas layer and caches, with separate terrain, unit, label, overlay, and flag passes. Translation data, language application, audio, settings, and exports also have their own modules.

The army AI reserves persistent front sectors and theater reserves before recruiting offensive task forces. Formations receive distinct positions and one authoritative movement order. Shared, budgeted navigation avoids water and neutral territory, while actual enemy contact still resolves combat. Operations assemble, breach, exploit, secure, withdraw and regroup; encirclement proposals require a geographic pocket and two shoulders. Depleted formations rotate out and can replenish from existing reserve personnel.

Enable **Settings → Display → Show Army Decisions** to inspect sector coverage, formation destinations, reserves and withdrawal reasons for the observed side. The optional overlay uses bounded samples. See [Army AI architecture and verification](docs/army-ai.md) for ownership, scheduling, limits and offline evaluation commands. The separate player Commander mode remains retired.

Run `biome check .` after editing. Individual offline checks live in `scripts/*-smoke.mjs`; the module graph check requires `node --experimental-vm-modules scripts/module-graph-smoke.mjs`. It verifies imports and offline-cache coverage without evaluating game code. `render-passes-smoke.mjs` additionally accepts `MW_RENDER_BASELINE` for an optional renderer comparison and uses native Canvas when available for flag-clipping checks. These scripts are offline checks, not interactive playtests.

## Terminal Profiling

Run the actual simulation against the bundled 2022 map, without opening a browser:

```sh
node scripts/profile-performance.mjs
node scripts/profile-performance.mjs --case regional --heap --phases
node scripts/profile-performance.mjs --case regional --spread --output /tmp/mw-spread
node scripts/profile-performance.mjs --compare /tmp/previous/report.json
```

The default suite covers Turkey–Iraq, Russia–China, and a four-country European FFA at standard grid resolution. It runs three fresh timing processes per case, then a separate V8 CPU sampling pass and a Node worker transport probe. `--heap` adds allocation sampling; `--phases` adds a separate intrusive timer/counter pass. `--help` lists army size, resolution, warmup, repetition, and output controls. Use the project's supported Node version and installed dependencies.

Reports default to the ignored `performance-results/` directory. Each output directory contains a terminal-readable `report.txt`, a machine-readable `report.json`, and `.cpuprofile` files, plus `.heapprofile` files when requested. Baseline comparisons reject changed workloads, hardware, OS, or Node versions. Keep the machine otherwise idle for timing runs. Debug console logging is suppressed in benchmark processes.

These are controlled deployments using real map data, not exact menu-start reproductions. Loading and warmup are excluded from tick statistics. Worker transport exercises the production core, packed snapshots, changed map tiles, and mirror application through Node worker threads at two logical ticks per snapshot; it excludes the browser worker's real-time timer and rendering. CPU and heap sampling are separate from the reported timing runs. Heap sampling estimates allocation churn, including collected objects; ArrayBuffer memory is reported separately. This measures CPU costs, not browser FPS or GPU rendering.

See [the measured bottleneck audit](docs/PERFORMANCE-AUDIT.md) for results and priorities. The harness uses [Node's V8 inspector](https://nodejs.org/api/inspector.html#cpu-profiler) and keeps all profiling machinery out of the game's runtime.
