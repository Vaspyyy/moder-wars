# Performance Optimization Plan — Modern Wars

## Measured Baseline (V0.20.11-PF)

**Benchmark:** Russia vs China, 2022 Modern Day scenario, speed 5x, 60-second run.

| Metric | Value |
|--------|-------|
| Frames sampled | 600 |
| Average FPS | 10 |
| Min FPS (worst) | 2 |
| Max FPS | 38 |
| Average frame time | 100.0 ms |
| Max frame time (spike) | 606.2 ms |
| Min frame time | 26.4 ms |
| Speed | 5x |

At speed 5, each visual frame runs up to 5 simulation ticks. The average frame of 100ms means ~500ms of simulation work per visual frame — the game is heavily CPU-bound on simulation, not rendering.

## Target Platform

Mid-range mobile phones (e.g., Pixel 6a, iPhone 13, Galaxy A54). Baseline: ~100ms avg frame (10 FPS). Target: **16ms (60 FPS)** with 3000+ units actively fighting.

## Current Bottleneck Profile

| Source | % of frame | Cost |
|--------|-----------|------|
| Simulation tick (`performSimulationTick`) | ~86% | ~56ms |
| Canvas rendering (`renderer.js`) | ~14% | ~9ms |
| DOM updates (innerHTML every 5 frames) | intermittent | spike |
| GC pauses (5000 Maps/tick allocations) | intermittent | spike |

The simulation tick is the dominant bottleneck. Within it, the top costs are:

1. Tactical 3×3 spatial hash sweep — every unit checks all others in 9 buckets (O(units × local density))
2. Full 2.88M-cell grid scans (3 per `shouldCountLand` frame)
3. Mop-up target search: 250 random grid samples per unit
4. Object allocation: 5000+ `new Map()` per tick + per-unit `{lat, lng}` objects
5. `units.filter()` called repeatedly creating intermediate arrays
6. Double-nested `units.filter()` calls inside garrison neighbor-threat loop
7. Influence propagation: `new Map()` allocated per influenced cell on enemy territory

---

## Phase 1 — High-ROI Immediate Wins

### Goal
Reduce frame time from 65ms to ~40ms with ~10 targeted changes. Estimated 38% improvement.

### Files involved
`src/main.js`, `src/config.js`

### Concrete steps

**1.1 Eliminate 5000 Maps/tick in occupancy smoothing** (`main.js:6964`)
The occupancy smoothing loop creates `new Map()` per sample (up to 5000 per tick). Replace with a pre-allocated `Object.create(null)` plain object counter.
- **Impact:** Removes 5000 heap allocations per tick. Reduces GC pauses.
- **Result:** Avg FPS 10→11 (+10%), Avg frame 100.0→92.9ms (-7.1%)
- **Risk:** Low — counting neighbors doesn't need a Map

**1.2 Remove per-unit `activeTargetPos` object allocation** (`main.js:8662`)
Every unit allocates `u.activeTargetPos = {lat, lng}` every tick. Cache a reusable object or use two number fields (`u.targetLat`, `u.targetLng`).
- **Impact:** Eliminates 1000+ allocations/tick
- **Risk:** Low — renderer needs updating to read new fields (1 line in renderer.js)
- **Gain:** ~2-3ms

**1.3 Combine duplicate `units.filter()` calls in garrison block** (`main.js:7534, 7548`)
Two separate `.filter()` passes over all units per neighbor country. Pre-compute unit counts by sovereign once, reuse.
- **Impact:** Removes O(neighbors × units) filtering
- **Risk:** Low
- **Gain:** ~2-4ms on `shouldCountLand` frames

**1.4 Replace `units.filter().indexOf()` garrison check** (`main.js:8651`)
Per garrison unit: full filter pass + indexOf scan. Pre-build a `sovereignUnitList` map once per tick.
- **Impact:** Removes O(garrison × units) scanning
- **Risk:** Low
- **Gain:** ~2-3ms

**1.5 Pathfinding result caching in unit loop** (`main.js:9055-9141`)
The 96-angle neutral pathfinding sweep runs per unit. A position-cache already exists but is scope-limited. Broaden the cache or skip for units that haven't moved.
- **Impact:** Reduces per-moving-unit cost
- **Risk:** Medium — must not break pathfinding around dynamic obstacles
- **Gain:** ~3-5ms when many units are pathfinding

**1.6 Move theater stats full-grid scan to simulation tick** (`renderer.js:1617-1636`)
The renderer scans all 2.88M `dominantSideMap` cells every 10 frames. The simulation tick already scans these grids on `shouldCountLand` frames. Expose the pre-computed territory percentages from the sim tick and have the renderer read cached values.
- **Impact:** Eliminates redundant O(2.88M) scan every 10 frames
- **Risk:** Low — data is already available in main.js, just needs exposure
- **Gain:** ~2-4ms every 10th frame (spike removal)

**1.7 Throttle spatial hash rebuild frequency** (`main.js:6935`)
Currently cleared and rebuilt every tick. For static position changes, rebuild every 2-3 ticks.
- **Impact:** ~1ms saved on alternate ticks
- **Risk:** Low — units move slowly (0.003 deg/tick); hash cell is 2.5° across
- **Gain:** ~1ms

**1.8 Add passive flag to mousemove listeners** (`main.js:10835, 13644`)
Two non-passive `mousemove` listeners on the map prevent the browser from optimizing compositing.
- **Impact:** Reduces compositor jank on mobile touch drags
- **Risk:** None
- **Gain:** Smoother panning, no direct frame-time reduction

**1.9 Add `<link rel="modulepreload" href="src/main.js">`** (`index.html:10`)
The importmap blocks module resolution until parsed. Preloading `main.js` lets the browser start fetching while parsing the importmap.
- **Impact:** Faster first paint
- **Risk:** None
- **Gain:** ~200-500ms initial load improvement

**1.10 Stop rebuilding casualty panel via innerHTML every 5 frames** (`main.js:9902`)
Replace `innerHTML` string concatenation with cached DOM element references and `textContent` updates.
- **Impact:** Eliminates DOM parse + layout + paint cycle every 5 frames
- **Risk:** Low — simple string → textContent migration
- **Gain:** ~2-5ms spike removal

### Expected gains
~15-25ms reduction in average frame time. 65ms → ~40ms (25-40 FPS).

---

## Phase 2 — Major Architectural Improvements

### Goal
Restructure hot data paths to avoid repeated work. Reduce per-frame allocations by 90%. Target 40ms → ~25ms.

### Files involved
`src/main.js`, `src/engine.js`, `src/renderer.js`

### Concrete steps

**2.1 Object pool for frequently allocated objects**
Create a ring-buffer pool for `{lat, lng}` objects, `{pairKey, segmentIdx, ...}` front slots, and retreat vectors. Allocate once (pool size = max units × 3), recycle.
- **Files:** `src/main.js` (all object allocation sites)
- **Impact:** Eliminates 99% of per-tick heap allocations
- **Risk:** Medium — must ensure objects are returned to pool after use
- **Gain:** ~5-10ms (eliminates most GC pauses)

**2.2 Pre-allocate and reuse all per-tick Maps and Sets**
Create persistent Maps/Sets at module scope and `.clear()` them each tick instead of `new Map()`/`new Set()`.
- Current allocations: `combatantIds`, `countryToSideMap`, `countryFrontlines`, `countryToCityCount`, `countryCapitalLost`, `neighborThreat`, `_citiesBySovereign`, `_metadataById`, `activeSideSet`, `effectiveSideSet`, `unitsToRemove`
- All become persistent with `.clear()` instead of `new`
- **Gain:** Eliminates ~15 Map/Set allocations per tick → removes ~3ms of GC pressure

**2.3 Remove double-nested frontline cell scanning in `generateWarPlan()`** (`main.js:6414-6447`)
The ENCIRCLE plan generation loops over frontline cells × all units — triple nested. Cache unit counts by grid region instead of iterating all units per cell.
- Pre-build a `regionUnitCounts` grid (subsampled at coarser resolution) in the spatial hash build
- Query the region count instead of iterating all units
- **Gain:** ~5-10ms when war plans are generated (sporadic but critically expensive)

**2.4 Convert `units.filter()` chains to pre-built lookup maps**
All per-tick `.filter()` calls over the units array should use pre-built Maps keyed by sovereign/side:
- `unitsBySovereignId` (Map: countryId → unit[])
- `unitsBySideIdx` (Map: sideIdx → unit[])
- `unitCountBySovereignId` (Map: countryId → count)
Build these once in the spatial hash pass (which already iterates all units).
- **Gain:** ~5-8ms

**2.5 Incremental grid scanning instead of full 2.88M scans**
All three full-grid scans (lines 6908, 7061, 9506) iterate the entire grid even when only a small fraction changed. Use dirty-region tracking or incremental delta accumulation:
- Track cells that changed ownership each tick (already partially done via `syncOccupationFromSideInfluence`)
- Accumulate territory counts incrementally instead of re-scanning
- **Gain:** ~8-12ms on `shouldCountLand` frames
- **Risk:** High — must maintain correctness; implement as opt-in behind a flag first

**2.6 Simplify encirclement detection to single grid sample** (`main.js:7972-7984`)
The 8-point radial sample uses `getControlValue()` + `getGridIndex()` per point. Can reduce to 4 cardinal samples without meaningful accuracy loss.
- **Gain:** Marginal per unit (~0.5ms total) but compounds

### Expected gains
~15-20ms further reduction. 40ms → ~20-25ms (40-50 FPS).

---

## Phase 3 — Simulation Tick Overhaul

### Goal
Restructure the main unit loop (1700 lines, `main.js:7700-9402`) into distinct, cullable passes. Target 20ms → ~8-10ms per tick.

### Files involved
`src/main.js`

### Concrete steps

**3.1 Split the monolithic unit loop into discrete passes**
The current loop interleaves target acquisition, combat, movement, pathfinding, retreat, mop-up, and war plan execution in one 1700-line block. Split into:
- **Pass A: Scan** — spatial hash build + target finding (all units)
- **Pass B: Plan** — war plan assignment + direction computation (plan units only)
- **Pass C: Move** — movement + pathfinding + retreat (moving units only)
- **Pass D: Fight** — proximity combat + encirclement + attrition (engaged units only)
- Each pass can skip idle units early using pre-computed flags.
- **Gain:** Better cache locality; passes can be individually throttled

**3.2 Tactical scan: check 1 bucket instead of 9 for idle units** (`main.js:8126`)
Units with `isEngaged = false` and no recent combat don't need a 3×3 sweep. Check the center bucket only. Only expand to 3×3 when local enemies are detected.
- **Gain:** ~5-8ms at high unit counts (most units are not actively fighting)

**3.3 Mop-up: reduce 250 samples → 50 samples** (`main.js:8473-8545`)
250 random grid samples per mop-up unit is excessive. 50 samples covers the same area with acceptable accuracy for territory capture.
- **Gain:** ~3-5ms during mop-up phase

**3.4 Pre-compute garrison unit lists instead of per-unit checks** (`main.js:8631-8641`)
The `units.filter().indexOf()` per garrison unit is O(n^2). Build garrison unit lists once after flagging, then batch-process.
- **Gain:** ~2-3ms (eliminates quadratic garrison check)

**3.5 Move influence propagation completely off the critical path**
Influence updates (`updatePersistentInfluence`, line 3745) currently run in-section inside the tick. Decouple: run influence in a microtask or separate `requestAnimationFrame` callback. Influence lag of 1 frame is invisible at 30+ FPS.
- **Risk:** Medium — territory capture feels slightly delayed
- **Gain:** ~5-8ms removed from tick budget

**3.6 Skip frontline poly recompute if front hasn't changed** (`engine.js:187`)
`computeFrontlinePolys()` runs every 15 ticks regardless of whether the frontline moved. Compare a hash of changed cells since last call; skip if unchanged.
- **Gain:** Eliminates ~10ms compute spikes on static fronts

### Expected gains
~10-12ms reduction. 20ms → ~8-10ms per tick. Combined with Phases 1-2: target 60 FPS achievable.

---

## Phase 4 — Rendering + Memory Optimization

### Goal
Reduce render cost from ~9ms to ~3ms. Eliminate GC pressure completely.

### Files involved
`src/renderer.js`, `src/main.js`, `styles/style.css`

### Concrete steps

**4.1 Cache grid-to-screen projections per frame** (`renderer.js:772-777`)
`getGridPoint()` is called thousands of times per frame, each calling `map.latLngToContainerPoint()`. Cache projection results keyed by grid coordinates for the frame duration.
- **Gain:** ~2-3ms

**4.2 Render only changed territory cells** (`renderer.js:627-767`)
The territory fill pre-calculation iterates all visible cells every frame. Track which cells changed this tick (via dirty-cell Set from influence updates) and only re-compute fills for those cells.
- **Gain:** ~2-4ms on static viewpoints

**4.3 Disable backdrop-filter on mobile** (`style.css:46, 61, 385, 2019`)
14 backdrop-filter rules consume significant GPU compositing budget on mobile. Detect mobile via `max-width` media query or JS and disable.
- **Gain:** ~2-5ms render time on mobile, also reduces thermal throttling

**4.4 Flag image preloading with dimensions** (`renderer.js:1860`)
Flag images (`new Image()`) are loaded lazily. Preload all active country flags with explicit dimensions to avoid layout shift and per-frame image decode costs.
- **Gain:** Eliminates first-load jank; marginal ongoing improvement

**4.5 Remove `getComputedStyle()` call in cinematic mode** (`renderer.js:224`)
Forces style recalculation. Replace with a boolean flag or cached opacity value.
- **Gain:** Minor — only in cinematic mode

**4.6 Use `OffscreenCanvas` for territory rendering on supporting browsers**
Territory fills and meshes could render on an `OffscreenCanvas` in a web worker, then `drawImage()` onto the main canvas. Only viable on Chrome (Firefox/Safari support is limited).
- **Risk:** High — limited browser support; implement as progressive enhancement
- **Gain:** ~5ms moved off main thread

**4.7 TypedArray reuse instead of per-frame allocation** (`renderer.js:610-613`)
`viewportFills`, `processedCells`, `gridXPositions`, `gridYPositions` are re-created if size is insufficient. Pre-allocate at max size once.
- **Gain:** Eliminates occasional large allocations

### Expected gains
~6ms render reduction. 9ms → ~3ms.

---

## Phase 5 — Mobile-Specific Hardening

### Goal
Ensure stable 30+ FPS on mid-range phones under thermal throttling. Handle background/foreground transitions, memory pressure, touch input efficiently.

### Files involved
`src/main.js`, `index.html`, `workers/service-worker.js`, `styles/style.css`, `src/config.js`

### Concrete steps

**5.1 Dynamic quality scaling based on frame budget**
Monitor `performance.now()` delta in the update loop. If frame time exceeds 16ms for 30 consecutive frames, progressively degrade:
- Reduce `CONFIG.MAX_UNITS_PER_SIDE` by 20%
- Increase `simulation-worker.js` BFS interval from 15 → 30 ticks
- Skip occupancy smoothing (section 1a) entirely
- Reduce render step from 1 → 2 (coarser territory rendering)
- Restore when frame time drops below 12ms for 60 frames
- **Gain:** Adaptive to device capability without code changes

**5.2 Replace `setInterval` background tick with `requestAnimationFrame` throttling** (`main.js:16352`)
`setInterval(100ms)` fires even during layout. Use a delta-time accumulator within the raF loop that simulates ticks when tab is backgrounded.
- **Risk:** Medium — must ensure correct timing
- **Gain:** Cleaner background behavior, no interval overhead

**5.3 Add `will-change: transform` to frequently animated elements** (`style.css`)
Elements with transition on `transform` (lines 91, 166, 240, etc.) should declare `will-change: transform` to promote to GPU layer before animation starts. Remove `will-change` after animation ends.
- **Gain:** Smoother UI transitions on mobile

**5.4 Service worker: add stale-while-revalidate for static assets** (`service-worker.js:43`)
Current cache-first strategy never updates assets after initial install. Use stale-while-revalidate so returning users get cached content immediately while background update checks.
- **Gain:** Faster repeat loads

**5.5 Memory pressure: evict IndexedDB cache on low-memory event** (`geo.js:9`)
Listen for `navigator.storage.estimate()` and `pressure` events. Clear old GeoJSON cache entries when storage quota is near limit.
- **Gain:** Prevents IndexedDB quota errors on low-storage phones

**5.6 Reduce `GRID_RES` for mobile** via adaptive config
At initial load, check `navigator.hardwareConcurrency` and `deviceMemory`. On <4 cores or <4GB RAM: use `GRID_RES = 0.20` (reduces grid cells from 2.88M → 1.62M — 44% reduction).
- **Risk:** Medium — map details become coarser
- **Gain:** All O(grid) operations become 44% cheaper

**5.7 Disable terrain rasterization on low-memory devices** (`editor.js:355-371`)
The existing guard skips terrain processing at `totalCells > 600000`. On mobile with adaptive GRID_RES, this threshold should trigger more aggressively.

**5.8 Touch event optimization**
Replace `map.on("mousemove")` with `map.on("touchmove", {passive: true})` for mobile to prevent compositor-blocking.
- **Gain:** Smoother pan gestures

### Expected gains
Mobile-specific: prevents thermal throttling degradation. Maintains 30+ FPS even under sustained load.

---

## Implementation Order & Dependencies

| Phase | Depends on | Effort | Risk |
|-------|-----------|--------|------|
| 1 — Quick Wins | — | ~4 hours | Low |
| 2 — Architecture | Phase 1 | ~8 hours | Medium |
| 3 — Tick Overhaul | Phase 2 | ~12 hours | High |
| 4 — Render/Memory | Phase 2 | ~6 hours | Medium |
| 5 — Mobile | Phase 3, 4 | ~4 hours | Low-Medium |

**Total: ~34 hours, targeting 65ms → 16ms per frame (15 FPS → 60 FPS).**

---

## Metrics to Track

| Metric | Baseline (V0.20.11) | 1.1 Result (V0.20.12) | Phase 1 target | Final target |
|--------|---------------------|----------------------|---------------|-------------|
| Avg FPS | 10 | 11 | 25 | 60 |
| Frame avg (ms) | 100.0 | 92.9 | 40 | 16 |
| Max spike (ms) | 606.2 | 698.5 | 200 | 32 |
| Render % of frame | ~14% | 20% | 30% | 35% |
| GC pauses/sec | ~5 | ~2 | ~0.5 | ~0.2 |
| allocations/tick (objects) | ~6000 | ~1000 | ~200 | ~50 |
| Memory baseline (MB) | ~150 | ~120 | ~90 | ~70 |
| `shouldCountLand` spike (ms) | ~120 | ~60 | ~30 | ~20 |
