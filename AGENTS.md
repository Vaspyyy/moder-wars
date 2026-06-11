# AGENTS.md — Modern Wars

## What this is

Browser-based grand strategy war simulation on a real-world map. Vanilla JS, no framework, no bundler, no TypeScript. Deployed to GitHub Pages as static files.

## Build & dev

There is **no build step**. Files are served directly. Open `index.html` in a browser or use any static server (`npx serve .`).

**Lint**: `biome check .` (Biome v2.x, config in `biome.json`). Run this after changes. There is no typecheck, no test suite, no CI.

**Utility script**: `node scripts/simplify-geojson.js` — strips GeoJSON files in `assets/geodata/` to reduce size (rounds coordinates, drops non-essential properties).

## Architecture

```
index.html          — entry point, all HTML UI (menus, modals, settings, editor toolbox)
src/main.js         — 20k+ line "god module": game state, UI wiring, audio, i18n, simulation loop
src/engine.js       — grid influence maps, occupation logic, frontline field rebuild
src/renderer.js     — Canvas overlay rendering (frontlines, units, battles, flags, labels)
src/editor.js       — map/scenario editor (paint borders, manage countries, import/export)
src/firebase.js     — community hub (upload/download scenarios, country library)
src/geo.js          — IndexedDB cache for parsed GeoJSON (7-day TTL)
src/config.js       — game constants (speeds, damage, colors, grid resolution)
src/constants.js    — scenario menu background image mappings
workers/simulation-worker.js — BFS frontline direction field (off main thread)
workers/geo-parse-worker.js  — GeoJSON JSON.parse (off main thread)
workers/service-worker.js    — cache-first SW for offline play
```

### The main.js dependency pattern

`main.js` exports ~600 mutable variables and functions. Every other module imports what it needs from `main.js` and mutates exports directly. There is no store, no event bus — shared state lives in `main.js` and flows via ES module bindings.

When adding new shared state (game variables, UI refs, flags), export them from `main.js`.

## Dependencies

Loaded via `<script type="importmap">` in `index.html` from esm.sh CDN:
- `leaflet` (map tiles, pan/zoom)
- `jszip` (country import/export ZIP bundles)

No npm dependencies at the project root. `package.json` only exists under `.opencode/` for the AI plugin.

## Key patterns

- **Web Workers** handle CPU-heavy work (frontline BFS, GeoJSON parsing). Communication via `postMessage`/`onmessage`.
- **Service Worker** (`workers/service-worker.js`) precaches static assets. The `PRECACHE_URLS` array and `CACHE_VERSION` string must be updated when adding or renaming files.
- **GeoJSON data** lives in `assets/geodata/{10m,50m,110m}/` at three resolutions. The `110m` set is default (performance). `scripts/simplify-geojson.js` can shrink these files.
- **Map data** (scenarios) lives in `assets/maps/` as JSON.
- **Game version** is set in two places: `index.html` `<title>` and `service-worker.js` `CACHE_VERSION`. Keep them in sync. **Bump the patch version on every change** (0.26.1 → 0.26.2 → ... → 0.26.10 → 0.26.11). Never bump minor version for bug fixes or features.
- **i18n**: translations are inline in `main.js` (`TRANSLATIONS` object). HTML uses `data-i18n` attributes. `applyLanguage()` wires them.
- **Country colors**: HOI4-style colors in `CONFIG.HOI4_COLORS` (`src/config.js`). Team colors are `TEAM_A_COLOR` / `TEAM_B_COLOR` (RGBA strings).
- **Buff system**: countries have visible/invisible combat buffs managed via `BUFF_STATES` / `BUFF_METADATA` in `main.js`. States cycle with `cycleBuffState()`.

## AI Commander

Strategic AI design is documented in `AI_COMMANDER.md`. The AI uses a proposal-scoring pipeline: PROPOSE → WEIGH → DECIDE → EXECUTE → REASSESS. This is the authoritative reference for how war plans, naval invasions, encirclements, and unit allocation work.

## Gotchas

- `main.js` is 20k+ lines. Edits to it affect the entire app — be surgical, don't refactor casually.
- No TypeScript means no compile-time safety on the ~600 shared exports. Watch for typos in import names.
- The service worker aggressively caches. After changing source files, hard-refresh or bump `CACHE_VERSION`.
- GeoJSON files are large (10–30MB). The `geo-parse-worker` exists specifically to avoid blocking the main thread during parse.
- `index.html` contains all UI markup (1300 lines). The game has no component system — UI is created/mutated via DOM manipulation in `main.js`.
- GitHub Pages deploys from the repo root. The remote name is `moder-wars` (typo in repo name, not `modern-wars`).
