# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Modern Wars is a browser grand-strategy war simulator on a real-world map. It builds with Vite. The simulation, menus and most modules are JavaScript ES modules; the camera, projection, scene and PixiJS rendering modules (`src/*.ts`) are strict TypeScript. PixiJS and JSZip are npm dependencies bundled by Vite, so serving the source directory directly no longer works.

## Commands

```sh
npm ci --ignore-scripts                 # install locked dependencies (Node 24+; CI uses Node 26)
npm run dev                             # Vite dev server
npm run check                           # what CI runs: tsc, Biome, the smoke suite, build, build-output check
npm run build && npm run preview        # build the static site into dist/ and serve it
npm run lint                            # Biome; it only checks the paths listed in biome.json
node scripts/<name>-smoke.mjs           # run one smoke check, e.g. node scripts/simulation-core-smoke.mjs
node --experimental-vm-modules scripts/module-graph-smoke.mjs   # module graph + offline shell check
node scripts/profile-performance.mjs --help   # CLI simulation profiler (writes to performance-results/)
```

There is no test runner. "Tests" are the standalone `scripts/*-smoke.mjs` files, each a Node script that exits non-zero on failure. They exercise real simulation code (worker/core/client checks use Node worker threads) but never launch a browser, so they do not verify rendering or frame rate. `npm run smoke` runs every smoke script through `scripts/modernization-smoke.mjs`, which fails if a new `*-smoke.mjs` file is not listed there. Run the smoke scripts that cover the modules you change. Shared fixtures are in `scripts/simulation-fixture.mjs` and `scripts/profiling/`.

Asset maintenance scripts (only run after changing their source data): `scripts/prepare-atlas-coast.mjs 110m|50m|10m`, `scripts/build-title-backdrop.mjs`, `scripts/build-scenario-binaries.mjs`, `scripts/build-geo-rasters.mjs`, `scripts/build-flags.mjs`. The Modern World 2026 and Ukraine 2023 packages come from `scripts/build-modern-2026-scenario.mjs` and `scripts/build-ukraine-scenario.mjs` (both called by `build-scenario-binaries.mjs`), and the admin-1 overlay from `scripts/prepare-admin-regions.mjs`. These rebuilds need several GB of memory. `modern-2026-smoke.mjs` and `ukraine-scenario-smoke.mjs` check the committed packages by default and only verify that they reproduce from source with `MW_HEAVY_SMOKES=1`.

## Release and caching rules

- The game version lives in places that must match: `<title>` in `index.html`, `CACHE_VERSION` in `workers/service-worker.js`, and `version` in `package.json` and `package-lock.json`. Bump them together when releasing.
- Pushes to main are checked and `dist/` is deployed to GitHub Pages by `.github/workflows/check-and-pages.yml`.
- Every module in `src/` (and other shell files) must be listed in `APP_SHELL_PATHS` in `workers/service-worker.js`. `module-graph-smoke.mjs` parses that list and fails if a reachable module is missing, so add new files there. The build rewrites the list with the emitted files.
- The root `service-worker.js` only `importScripts` the real implementation in `workers/` so it can control the whole site scope. The service worker caches aggressively; hard-refresh after source changes.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `perf:`).

## Architecture

**Entry.** `index.html` loads `src/entry.js`, which imports `src/bootstrap.js` (error overlay, service worker registration) and then `src/main.js`, a large (~7k lines) module that owns UI wiring and live game state. Systems receive state through `createLiveContext` (`src/runtime-context.js`), which builds getter/setter live bindings, so they don't import `main.js`. Only `renderer.js`, `editor.js` and `engine.js` still import from `main.js` directly.

**Simulation ownership.** The simulation runs in a resident module worker (`workers/war-simulation-worker.js`) built on `src/simulation-core.js`. The core composes the engine, world, state, tick, AI, territory and influence modules and is pure: no DOM, no `main.js`, so the same core runs in the worker, in Node smoke tests, and in the profiler. It advances on a fixed logical clock (`simulation-clock.js`) independent of rendering. Live clocks cap pending catch-up ticks at 60.
- `src/simulation-client.js` is the main-thread side. Rendering reads mirrors only. Any mutation (editing, diplomacy) needs an acknowledged ownership handoff, where full state is captured/applied via `src/simulation-protocol.js`.
- During play the worker sends presentation snapshots: packed unit positions plus only changed fields within dirty 32-cell map tiles. Stable graphs are omitted from later snapshots. Bump `SIMULATION_PROTOCOL_VERSION` when the wire format changes.
- Long-running work is split with `simulation-jobs.js` (deterministic resumable jobs) and `simulation-phase-wheel.js` (staggering phases across ticks).

**Army AI** (detailed in `docs/army-ai.md`). Strategic pipeline PROPOSE → WEIGH → DECIDE → EXECUTE → REASSESS in `ai-proposals.js`, `ai-planning.js`, `ai-plan-execution.js`, `ai-task-forces.js`, composed by `ai-runtime.js`. `army-command.js` splits fronts into sectors and assigns coverage, `army-navigation.js` builds bounded reverse-Dijkstra route fields, and `army-encirclement.js` handles encirclement. Each ordinary land formation has a single `_armyOrder` movement authority. Per-unit combat/movement is in `ground-unit.js` and `ground-movement.js`. Keep these modules browser-free.

**Presentation.** `presentation-runtime.js` paints snapshots at up to 30 Hz. `renderer.js` orchestrates rendering: PixiJS WebGL country meshes and unit sprites (`atlas-gpu.ts`, `atlas-scene.ts`, loaded on demand) under cached `render-*.js` Canvas overlays (labels, flags, selection, naval and battle markers, editor), with world-chunk caching and culling. The full Canvas path remains for capture, flag view and devices without WebGL. There is no Leaflet: `map-camera.ts` and `map-projection.ts` own the bounded Mercator camera, `camera-input.ts` owns drag, wheel, touch and keyboard input, and `map-runtime.ts` wires them together.

**Data.** Scenarios are compiled to MWSC v3 binaries (`assets/maps/compiled/*.mwsc.gz`) by `scenario-codec.js`. The v2 decoder and JSON import/export are still supported. Decoding runs in `workers/scenario-worker.js`. Geography is Natural Earth GeoJSON at 110m/50m/10m with derived rasters (`assets/geodata/derived/*.mwr`) and packed coastlines (`assets/atlas/`). Raw reference geography is loaded only when an editing tool needs it. Influence grids use lazy Float32 pages (`influence-grid.js`). Starting army size uses dated World Bank active-personnel observations (`country-force-profiles.js`, generated `country-force-data.js`, sources in `assets/data/forces/README.md`); population still sets the reserve pool.
- Regional theaters (`scenario-theater.js`) keep global cell coordinates but mask excluded countries, land and cities and constrain the camera; theater metadata survives export, load and restart. Masking does not shrink the grids.
- Sovereignty (`deJureMap`, `sovereigntyOverrides` in `scenario-territory.js`) is separate from military control (`worldControlMap`). Keep `sovereigntyOverrides` and `historicalSource` through load, export and restart, and update the scenario context through `setCurrentScenarioContext`.
- `occupation-regions.js` and `render-occupation.js` outline and hatch occupied territory within `historicalSource.territoryOwnerIds`. `admin-regions.js` and `render-admin-regions.js` lazily load Natural Earth admin-1 borders (`assets/geodata/admin1/`) as a reference overlay on Earth maps, not as simulation provinces.
- Source data, licenses and required attributions are in `assets/scenarios/*/README.md`, `assets/geodata/admin1/README.md` and `docs/GEOGRAPHIC-DATA.md`. The DeepState and OpenStreetMap/Overture credits shown under the scenario cards are license requirements: keep them visible.

**Other subsystems.** Editor (`editor*.js`), i18n (`i18n.js`, `translations.js`), preferences/settings, and in-game performance profiling (`performance-*.js`).

## Known state and performance

- The scenario menu exposes Modern World 2026 (political geography from a pinned Overture release, no live frontlines; also the Modern Day card in the Choose Era menu) and Ukraine 2023 · Eurasia (approximate 2023-01-01 control, fictional armies). Both were ported from the Bald1nh0/moder-wars fork. The compiled 2022 Modern Day package remains for the benchmark and country import, but is not offered in the menus. Its source JSON is the build input for the 2026, Ukraine and title-backdrop builds and lives gzipped in `source-data/` (read it with `scripts/source-data.mjs`); it is not under `assets/`, so it never deploys. The old WW1/WW2 eras were removed.
- The game has no online features. Player-chosen images load as data URLs and the custom soundtrack is kept in Cache Storage (`src/local-files.js`). Do not add network backends.
- Flags are bundled in `assets/flags/` (rebuild with `scripts/build-flags.mjs`); `src/flags.js` maps flagcdn.com and old WebSim blob links in loaded data to the local files. Use `localFlagUrl(code)` for new flag lookups instead of remote URLs.
- Measured CPU bottlenecks: per-unit enemy scans in `ground-unit.js`, proposal scoring in `ai-plan-execution.js` (proposal generation is now budgeted across ticks; see `docs/army-ai.md`), and full-world frontier scans in `frontline-core.js`. Measure with `scripts/profile-performance.mjs` before and after performance work.
