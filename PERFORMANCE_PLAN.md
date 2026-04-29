# Performance Optimization Plan — Modern Wars

## Baseline

- ~20K-line monolithic `main.js` SPA (vanilla JS, no framework, no bundler)
- Custom Canvas 2D render engine on Leaflet map overlay
- Grid-based simulation: 0.15° default resolution → ~2.88M cells (~360°/0.15° × 180°/0.15°)
- Up to 8 sides, each with its own `Float32Array` influence map
- Each grid array: ~11.5MB. Total grid memory with 8 sides: **~170-200MB**
- GeoJSON world maps: 20-31MB loaded + parsed at runtime
- No build pipeline (no minification, no tree shaking, no image optimization)

### Key Metrics

| Metric | Current |
|--------|---------|
| JS parse size | ~500KB+ |
| Grid memory (8 sides) | ~170-200MB |
| GeoJSON load + parse | 20-31MB blocking |
| Canvas draw calls/frame | Tens of thousands (`fillRect`) |
| DOM writes/frame | `innerText`/`innerHTML` on stats, counts, casualties |
| BFS frontline rebuild | Every 15 ticks, full grid scan |

---

## Phase 1 — Low-Hanging Fruit (Quick Wins)

### 1.1 Replace `innerHTML` with `textContent` / Targeted DOM Updates

**Location:** `updateLoop()` (line ~11561), stats panels, casualty panels, unit counts.

**Problem:** Setting `innerHTML` destroys and recreates child DOM nodes every frame, triggering GC, reflow, and recalc.

**Fix:**
- Replace `el.innerText = val` with `el.textContent = val` where only text changes
- Where HTML structure must change, use `DocumentFragment` or accumulate changes and write once
- Batch DOM reads/writes to avoid layout thrashing

**Files:** `main.js`

**Effort:** Low | **Impact:** Medium (reduces GC pressure, smoother frames)

---

### 1.2 Add IndexedDB Cache for GeoJSON

**Location:** GeoJSON fetch sites (line ~7116, ~14946, ~17841, etc.)

**Problem:** 20-31MB GeoJSON files are fetched and parsed fresh on every scenario load, blocking the main thread for seconds.

**Fix:**
- On first load, store the parsed JSON in IndexedDB keyed by URL
- On subsequent loads, read from IndexedDB, skipping both network and parse
- Use a version/hash check to invalidate stale cache (e.g., ETag or last-modified)

**Pattern:**
```js
async function loadGeoJSON(url) {
    const db = await openDB('mw-cache', 1);
    const cached = await db.get('geojson', url);
    if (cached) return cached;
    const resp = await fetch(url);
    const data = await resp.json();
    await db.put('geojson', data, url);
    return data;
}
```

**Files:** `main.js`

**Effort:** Medium | **Impact:** High (eliminates 2-5s pause on reloads)

---

### 1.3 Cache Flag Images + GeoJSON with Service Worker / Cache API

**Location:** Flag CDN fetches, GeoJSON fetches.

**Problem:** Every flag image (`flagcdn.com/w320/*.png`) and every GeoJSON fetch hits the network. No browser caching strategy.

**Fix:**
- Register a minimal service worker that caches `flagcdn.com/*` and GeoJSON URLs
- Alternatively, use `Cache-Control` headers + `fetch` with `cache: 'force-cache'`
- Pre-cache the 7 background PNGs in the service worker install event

**Files:** New `sw.js`, `index.html` (registration), `main.js` (fetch options)

**Effort:** Medium | **Impact:** Medium (faster repeat loads, offline support)

---

### 1.4 Optimize Background Images

**Location:** `*.png` files (1492.png ~1.5MB, 1914.png ~1.5MB, 1936.png ~1.5MB, etc.)

**Problem:** Era/background PNGs are 1.5-3MB each, loaded eagerly.

**Fix:**
- Convert to WebP (lossy quality 80) — expect 70-80% size reduction
- Add `loading="lazy"` and `decoding="async"` attributes
- Use `<picture>` with WebP + PNG fallback

**Files:** All `*.png` → `*.webp`, `index.html`

**Effort:** Low | **Impact:** Low-Medium

---

## Phase 2 — Rendering Pipeline

### 2.1 Replace `fillRect` Loop with `ImageData` Bulk Write

**Location:** `ControlMapLayer.render()` (line ~2982), territory color painting.

**Problem:** Territory colors are painted pixel-by-pixel with `ctx.fillRect(cx, cy, 1, 1)` in a nested loop over visible grid cells. At standard zoom on 1920×1080 with 0.15° grid, this is ~10K-50K individual draw calls per frame — all CPU-bound Canvas 2D.

**Fix:**
- Allocate one `ImageData` buffer per frame for the visible viewport
- Write pixel values into the buffer directly (Uint8ClampedArray)
- Single `ctx.putImageData(buffer, 0, 0)` call

**Before:**
```js
for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
        ctx.fillStyle = getColor(x, y);
        ctx.fillRect(cx * dpr, cy * dpr, dpr, dpr);
    }
}
```

**After:**
```js
const img = ctx.createImageData(viewportW, viewportH);
const pixels = img.data;
for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
        const [r, g, b, a] = getColorRGBA(x, y);
        const off = (py * viewportW + px) * 4;
        pixels[off] = r; pixels[off+1] = g; pixels[off+2] = b; pixels[off+3] = a;
    }
}
ctx.putImageData(img, 0, 0);
```

**Files:** `main.js` — `render()` function

**Effort:** Medium | **Impact:** High (~10-50x speedup on territory painting)

---

### 2.2 Use OffscreenCanvas for Background Composition

**Location:** `ControlMapLayer` constructor (line ~2880), `render()` method.

**Problem:** The canvas is drawn on the main thread. Complex drawing (satellite tile compositing, province borders, labels) blocks the UI.

**Fix:**
- Create an `OffscreenCanvas` for territory + border rendering
- Compose the final frame by `drawImage(offscreenCanvas, 0, 0)` (fast GPU blit)
- For tiles, already conditionally skipped (line ~3031: only when `cinematicMode || this._isCapturing`) — smart

**Note:** The existing code already conditionally skips tile compositing — good. The territory raster is the main remaining target.

**Files:** `main.js` — `ControlMapLayer`

**Effort:** Medium | **Impact:** Medium

---

### 2.3 Canvas Context Optimization

**Location:** `render()` (line ~3011: `this._container.getContext("2d")`).

**Problem:** Default `getContext("2d")` context assumes frequent CPU readback. Adding options signals GPU-backed rendering.

**Fix:**
```js
const ctx = this._container.getContext("2d", { willReadFrequently: false, alpha: false });
```

- `willReadFrequently: false` — GPU-backed, fast draw operations
- `alpha: false` — eliminates compositing with page background (map is opaque)

**Files:** `main.js` — `render()` and `_update()`

**Effort:** Trivial | **Impact:** Low (free win)

---

### 2.4 Cache `sovereignSideMap` Between Frames

**Location:** `render()` (line ~3068).

**Problem:** A new `Int8Array(metaMaxId+1)` is allocated and filled every frame to map country IDs → side indices. This is a small array, but it's created every frame unnecessarily.

**Fix:**
- Allocate `sovereignSideMap` once, rebuild only when `sides` composition changes
- Set a dirty flag when countries are added/removed from sides

**Files:** `main.js` — `render()`

**Effort:** Low | **Impact:** Low

---

## Phase 3 — Grid & Simulation Engine

### 3.1 Sparse Grid Storage

**Location:** All grid arrays (`worldControlMap`, `occupationMap`, `sideInfluenceMaps[]`, `frontlineDirLat/Lng`, `dominantSideMap`, etc.)

**Problem:** Every grid array allocates `gridWidth × gridHeight` elements (~2.88M each). Most cells are water (unused for simulation). With 8 sides: ~170-200MB total.

**Fix:**
- First, identify land cells from `landMask`. Create a lookup: `landCellToGridIndex`
- Store influence/occupation only for land cells using `Map<cellIndex, value>` or a packed `Float32Array` indexed by land-cell-index rather than grid-cell-index
- Alternatively: use `Uint16Array` instead of `Float32Array` for values that can be quantized (e.g., `sideInfluenceMaps` values 0.0-1.0 can be stored as 0-65535)

**Memory comparison (0.15° grid, ~2.88M cells):**
| Array | Current Type | Size | Sparse/Optimized | New Size |
|-------|-------------|------|-----------------|----------|
| worldControlMap | Int32Array | 11.5MB | Uint16Array | 5.7MB |
| deJureMap | Int32Array | 11.5MB | Uint16Array | 5.7MB |
| sideInfluenceMaps (×8) | Float32Array | 92MB | Spare land-only | ~10-20MB |
| occupationMap | Float32Array | 11.5MB | Spare land-only | ~2MB |
| dominantSideMap | Int8Array | 2.9MB | Int8Array (keep) | 2.9MB |
| frontlineDirLat/Lng (×2) | Float32Array | 23MB | Float16 (quantized) | 5.7MB |
| **Total** | | **~170MB** | | **~40-55MB** |

**Files:** `main.js` — grid allocation sites, all grid read/write sites

**Effort:** High (touches many sites) | **Impact:** High (memory cut by 4-5x)

---

### 3.2 Move Heavy Grid Operations to Web Workers

**Location:** `rebuildFrontlineField()`, influence blur/smoothing passes, `shouldCountLand` territory scan.

**Problem:** BFS frontline field rebuild runs on the main thread, expanding across all grid cells. Influence blur and territory counting also block the main thread for milliseconds per operation, causing frames to drop.

**Fix:**
- Create a `simulation-worker.js` Web Worker
- Post grid data to worker as `Transferable` typed arrays (zero-copy transfers)
- Worker performs BFS, blur, counting and posts results back
- Main thread reads results from shared `SharedArrayBuffer` or receives results via `postMessage`
- Workers can also handle `occupationLayer._update()` call for influence spreading

**Architecture:**
```
Main Thread                    Simulation Worker
    │                                │
    │── grid buffers (transfer) ──→  │
    │                                ├── BFS frontline field
    │                                ├── Influence blur/smooth
    │                                ├── Territory counting
    │←── results ──────────────────  │
    │                                │
    └── render() uses results        │
```

**Files:** New `simulation-worker.js`, `main.js` (Worker creation + message handling)

**Effort:** High | **Impact:** High (eliminates main-thread jank during heavy ticks)

---

### 3.3 Incremental Frontline Field Update

**Location:** `rebuildFrontlineField()`.

**Problem:** Full BFS expansion across all grid cells every 15 ticks is expensive. Most frontline cells change slowly.

**Fix:**
- Run full BFS only on war start and after major territory shifts
- Each tick, only recompute BFS from cells where units moved or territory changed hands
- Use a dirty-cell queue; BFS expands only from dirty cells

**Files:** `main.js` — `rebuildFrontlineField()`

**Effort:** Medium | **Impact:** Medium

---

### 3.4 Reduce Unit Stats Loop Cost

**Location:** `updateLoop()` (line ~11612).

**Problem:** The unit stats loop iterates the full `units[]` array every visual frame to count units and estimate soldiers — even when counts haven't changed since last tick.

**Fix:**
- Track cumulative unit counts/soldiers during `performSimulationTick()` (where units are already being iterated for combat/movement)
- Only recompute in the visual loop if a dirty flag is set
- Incrementally update counts when units are created/destroyed in simulation

**Files:** `main.js` — `updateLoop()`, `performSimulationTick()`

**Effort:** Low | **Impact:** Low-Medium

---

### 3.5 Avoid Deep Clone for War Restarts

**Location:** `startWar()` — `JSON.parse(JSON.stringify(countryMetadata))` and `JSON.parse(JSON.stringify(cities))`.

**Problem:** `JSON.parse(JSON.stringify(...))` is blocking on large data structures (hundreds of countries, thousands of cities).

**Fix:**
- Use `structuredClone()` (native, faster, handles more types)
- Or store snapshots as serialized blobs in IndexedDB
- Or keep a lightweight diff — only clone the fields that change during simulation

**Files:** `main.js` — war initialization

**Effort:** Low | **Impact:** Low (only happens at war start)

---

## Phase 4 — Code Architecture

### 4.1 Split `main.js` into ES Modules

**Location:** Entire codebase.

**Problem:** 20K lines in one file. Full parse + evaluation before anything renders. No code splitting possible.

**Proposed module split:**

| Module | Lines (est.) | Responsibility |
|--------|-------------|----------------|
| `config.js` | ~200 | CONFIG, constants, settings defaults |
| `i18n.js` | ~300 | Translation dictionaries + lookup |
| `engine.js` | ~4000 | Grid arrays, influence, simulation tick, frontline, pathfinding |
| `renderer.js` | ~2500 | ControlMapLayer, canvas drawing, territory/unit/city rendering |
| `ui.js` | ~3000 | DOM manipulation, menus, settings, stats panels |
| `setup.js` | ~2000 | War setup, country selection, side assignment |
| `audio.js` | ~400 | Web Audio, sound loading/playback |
| `editor.js` | ~3500 | Map editor, scenario import/export |
| `firebase.js` | ~2000 | Hub, chat, leaderboard, Firebase integration |
| `main.js` | ~1000 | Entry point, glue, initialization |
| `geo.js` | ~1000 | GeoJSON loading, caching, coordinate utils |

**Fix:**
- Identify seams where variables are only used within a domain
- Extract into ES modules using the existing `importmap` infrastructure
- Use `import()` dynamic imports for editor, firebase (only when needed)

**Files:** New `src/` module files, `index.html` (import map), `main.js` (imports)

**Effort:** Very High | **Impact:** High (enables code splitting + faster parse + better maintainability)

---

### 4.2 Dynamic Import for Heavy Dependencies

**Location:** `index.html` import map, `main.js`.

**Problem:** `jszip` (3.10.1), Firebase SDK, and editor code are loaded eagerly even though most users only simulate or view the map.

**Fix:**
- Move `jszip` to a dynamic `import("jszip")` call only in editor mode
- Load Firebase SDK dynamically when hub/chat is first opened
- Dynamic `import("./editor.js")` when editor mode is activated

**Files:** `index.html`, `main.js`

**Effort:** Medium | **Impact:** Medium (reduces initial JS weight by ~30-40%)

---

### 4.3 Streaming JSON Parse for Large GeoJSON

**Location:** GeoJSON fetch sites.

**Problem:** `response.json()` blocks the main thread for the entire 20-31MB parse.

**Fix:**
- Use `ReadableStream` to incrementally parse GeoJSON
- Query only the fields needed (geometry coordinates, properties) and discard the rest
- Or use `fetch()` + `Response.body.getReader()` + a streaming JSON parser (e.g., `oboe.js` or custom)

**Alternative:** Pre-process GeoJSON into a binary format (FlatBuffers/protobuf) stored alongside the JSON and fetch that instead.

**Files:** `main.js` — GeoJSON loading functions

**Effort:** Medium | **Impact:** High (eliminates multi-second main-thread block)

---

## Phase 5 — Build Pipeline (Optional, Higher Effort)

### 5.1 Add Vite or esbuild Bundler

**Problem:** No minification, no tree shaking, no dead code elimination.

**Fix:**
- Add `vite` or `esbuild` as a dev dependency
- Configure output as ES modules with `type: "module"` to preserve import map workflow
- Minified output would cut JS from ~500KB to ~150KB
- Tree shaking removes unused Firebase/editor code from initial chunk

**Files:** New `package.json`, `vite.config.js` (or `build.js`)

**Effort:** Medium | **Impact:** Medium (faster download + parse, enables code splitting)

---

### 5.2 Add Subresource Integrity (SRI) Hashes

**Location:** `index.html` — `<script>` tags, `<link>` tags.

**Problem:** CDN scripts (`esm.sh/leaflet`, `unpkg.com/leaflet.css`, Firebase CDN) lack `integrity` attributes — supply chain risk and no cache validation.

**Fix:**
- Generate SRI hashes for all third-party resources
- Add `integrity` + `crossorigin="anonymous"` attributes

**Files:** `index.html`

**Effort:** Low | **Impact:** Low (security, not performance)

---

## Existing Optimizations (Already Done)

The codebase already has several smart optimizations — these should be preserved:

| Optimization | Location | Description |
|-------------|----------|-------------|
| Render skip at high sim speeds | `updateLoop()` ~11594 | `simSpeed >= 5` → render every 5th frame; `>= 3` → every 3rd; `>= 2` → every 2nd |
| Conditional tile compositing | `render()` ~3031 | Only copies Leaflet tiles to canvas when `cinematicMode || isCapturing` |
| Spatial hash for units | `unitSpatialHash` ~1883 | O(1) unit lookup by grid region for combat/rendering culling |
| Occupancy scan throttling | `performSimulationTick()` ~9112 | Full territory scan only every 15+ ticks, cached between scans |
| Gradient cache | `render()` ~3669 | `Map<string, CanvasGradient>` avoids repeated gradient creation |
| `sovereignSideMap` precomputation | `render()` ~3068 | Int8Array lookup table per frame (small, but could be cached — see 2.4) |
| Terrain processing guard | `loadTerrain()` ~6537 | Skips terrain if too many cells; shows "simplified for performance" |
| Unit consolidation | `performSimulationTick()` ~9170 | Merges stacked units to reduce array size |
| City pre-grouping | `performSimulationTick()` ~9688 | Groups cities by sovereignId once instead of `filter()` per unit |
| Metadata pre-indexing | `performSimulationTick()` ~9705 | `Map<id, metadata>` for O(1) lookup instead of `find()` |
| Tab-hidden efficiency | `updateLoop()` ~11570 | Skips visual loop entirely when `document.hidden`; uses `setInterval(100ms)` for background ticks |
| `willReadFrequently` already set? | (check) | Verify if the canvas context already uses this optimization |

---

## Execution Order (Recommended)

**By impact-per-effort ratio:**

1. **Phase 1.2** — IndexedDB GeoJSON cache (High impact, Medium effort)
2. **Phase 2.1** — ImageData bulk rendering (High impact, Medium effort)
3. **Phase 1.1** — innerHTML → textContent (Medium impact, Low effort)
4. **Phase 2.3** — Canvas context options (Low impact, Trivial effort)
5. **Phase 3.4** — Reduce unit stats loop cost (Low-Medium impact, Low effort)
6. **Phase 3.5** — structuredClone for snapshots (Low impact, Low effort)
7. **Phase 3.2** — Web Worker grid ops (High impact, High effort)
8. **Phase 3.1** — Sparse grid storage (High impact, High effort)
9. **Phase 4.1** — Split into modules (High impact, Very High effort)
10. **Phase 3.3** — Incremental BFS (Medium impact, Medium effort)
11. **Phase 1.4** — Optimize images (Low-Medium impact, Low effort)
12. **Phase 4.2** — Dynamic imports (Medium impact, Medium effort)
13. **Phase 4.3** — Streaming JSON parse (High impact, Medium effort)
14. **Phase 1.3** — Service worker caching (Medium impact, Medium effort)
15. **Phase 5.1** — Build pipeline (Medium impact, Medium effort)

---

## Notes

- The existing `plans/plan.md` covers an architectural refactor for N-sided combat — coordinate with that plan to avoid conflicts
- The settings panel already offers grid density, map resolution, and visual toggles (mountains, provinces, units, gradient) — consider adding a "Performance Mode" toggle that enables several of the above optimizations at once
- Firebase/Firestore listeners (hub, chat, leaderboard) remain active during simulation — consider pausing Firestore listeners during active simulation to free network/CPU
