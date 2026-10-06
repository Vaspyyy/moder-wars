# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Modern Wars is a browser grand-strategy war simulator on a real-world map. It is vanilla JavaScript ES modules served as static files: no build step, no `package.json`, no npm install. Leaflet 1.9.4 and JSZip come from CDNs via the import map in `index.html`.

## Commands

```sh
python3 -m http.server 8000             # run locally, open http://127.0.0.1:8000/
biome check .                           # lint/format (biome.json is gitignored/local; Biome may not be installed)
node scripts/<name>-smoke.mjs           # run one smoke check, e.g. node scripts/simulation-core-smoke.mjs
node --experimental-vm-modules scripts/module-graph-smoke.mjs   # module graph + offline shell check
node scripts/profile-performance.mjs --help   # CLI simulation profiler (writes to performance-results/)
```

There is no test runner. "Tests" are the standalone `scripts/*-smoke.mjs` files, each a Node script that exits non-zero on failure. They exercise real simulation code (worker/core/client checks use Node worker threads) but never launch a browser, so they do not verify rendering or frame rate. Run the smoke scripts that cover the modules you change. Shared fixtures are in `scripts/simulation-fixture.mjs` and `scripts/profiling/`.

Asset maintenance scripts (only run after changing their source data): `scripts/prepare-atlas-coast.mjs 110m|50m|10m`, `scripts/build-title-backdrop.mjs`, `scripts/build-scenario-binaries.mjs`, `scripts/build-geo-rasters.mjs`.

## Release and caching rules

- The game version lives in two places that must match: `<title>` in `index.html` and `CACHE_VERSION` in `workers/service-worker.js`. Bump both when releasing.
- Every module in `src/` (and other shell files) must be listed in `APP_SHELL_PATHS` in `workers/service-worker.js`. `module-graph-smoke.mjs` parses that list and fails if a reachable module is missing, so add new files there.
- The root `service-worker.js` only `importScripts` the real implementation in `workers/` so it can control the whole site scope. The service worker caches aggressively; hard-refresh after source changes.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `perf:`).

## Architecture

**Entry.** `index.html` loads `src/bootstrap.js` (error overlay, service worker registration) and then `src/main.js`, a large (~7k lines) module that owns UI wiring and live game state. Systems receive state through `createLiveContext` (`src/runtime-context.js`), which builds getter/setter live bindings, so they don't import `main.js`. Only `renderer.js`, `editor.js`, `engine.js` and `firebase.js` still import from `main.js` directly.

**Simulation ownership.** The simulation runs in a resident module worker (`workers/war-simulation-worker.js`) built on `src/simulation-core.js`. The core composes the engine, world, state, tick, AI, territory and influence modules and is pure: no DOM, no `main.js`, so the same core runs in the worker, in Node smoke tests, and in the profiler. It advances on a fixed logical clock (`simulation-clock.js`) independent of rendering. Live clocks cap pending catch-up ticks at 60.
- `src/simulation-client.js` is the main-thread side. Rendering reads mirrors only. Any mutation (editing, diplomacy) needs an acknowledged ownership handoff, where full state is captured/applied via `src/simulation-protocol.js`.
- During play the worker sends presentation snapshots: packed unit positions plus only changed fields within dirty 32-cell map tiles. Stable graphs are omitted from later snapshots. Bump `SIMULATION_PROTOCOL_VERSION` when the wire format changes.
- Long-running work is split with `simulation-jobs.js` (deterministic resumable jobs) and `simulation-phase-wheel.js` (staggering phases across ticks).

**Army AI** (detailed in `docs/army-ai.md`). Strategic pipeline PROPOSE → WEIGH → DECIDE → EXECUTE → REASSESS in `ai-proposals.js`, `ai-planning.js`, `ai-plan-execution.js`, `ai-task-forces.js`, composed by `ai-runtime.js`. `army-command.js` splits fronts into sectors and assigns coverage, `army-navigation.js` builds bounded reverse-Dijkstra route fields, and `army-encirclement.js` handles encirclement. Each ordinary land formation has a single `_armyOrder` movement authority. Per-unit combat/movement is in `ground-unit.js` and `ground-movement.js`. Keep these modules browser-free.

**Presentation.** `presentation-runtime.js` paints snapshots at up to 30 Hz. `renderer.js` orchestrates the `render-*.js` canvas layers (political cache, atlas coastlines, units, labels, flags, overlays) over Leaflet, with world-chunk caching and culling. `smooth-zoom.js` owns wheel input and drives Leaflet's camera through private methods, so recheck it before changing the Leaflet version.

**Data.** Scenarios are compiled to MWSC v3 binaries (`assets/maps/compiled/*.mwsc.gz`) by `scenario-codec.js`. The v2 decoder and JSON import/export are still supported. Decoding runs in `workers/scenario-worker.js`. Geography is Natural Earth GeoJSON at 110m/50m/10m with derived rasters (`assets/geodata/derived/*.mwr`) and packed coastlines (`assets/atlas/`). Raw reference geography is loaded only when an editing tool needs it. Influence grids use lazy Float32 pages (`influence-grid.js`).

**Other subsystems.** Editor (`editor*.js`), community sharing via Firebase (`community-*.js`, `firebase.js`), i18n (`i18n.js`, `translations.js`), preferences/settings, and in-game performance profiling (`performance-*.js`).

## Known state and performance

- Only the 2022 Modern Day era is exposed in the Choose Era menu. Older era data, thumbnails, hidden cards, and dormant handlers still exist in the code and are not supported eras.
- `docs/PERFORMANCE-AUDIT.md` records measured CPU bottlenecks: per-unit enemy scans in `ground-unit.js`, synchronous proposal scoring in `ai-plan-execution.js`, and full-world frontier scans in `frontline-core.js`. Check it before doing performance work, and measure with `scripts/profile-performance.mjs`.
