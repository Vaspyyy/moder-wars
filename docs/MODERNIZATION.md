# Atlas modernization

Modern Wars now builds with Vite. New camera, projection, native reference controls, retained scene, and PixiJS rendering modules use strict TypeScript. Existing simulation and menus remain JavaScript; a language conversion is not a simulation optimization.

## Development and deployment

Use Node 24 or newer (CI uses Node 26), then `npm ci --ignore-scripts` and `npm run dev`. `npm run check` checks typed modules, runs Biome and the Node integration suite, builds production files, and verifies emitted workers and offline cache paths. `npm run build` writes a self-contained static site to `dist/`. `npm run preview` serves that output. Serving the source directory directly is no longer supported.

The GitHub workflow checks PRs and builds/deploys `dist/` on main. **Before merging this migration, change Settings → Pages → Build and deployment → Source to GitHub Actions.** The repository currently uses legacy deployment from the main branch root; that source cannot serve TypeScript and bare npm imports. This PR does not change live repository settings or deploy its branch.

Vite bundles the worker entry points, JSZip, and PixiJS locally. The build copies `assets/` without changing scenario or geography formats. A build-generated offline manifest includes emitted scripts, CSS, workers, and default Atlas assets. Geography, scenario files, and non-default coastlines remain runtime cached. Registration is disabled in Vite development to avoid caching the dev server. Runtime data caches survive patch updates, following the existing policy.

## Camera and input

The camera owns a bounded Mercator world, viewport dimensions, world-to-screen conversion, continuous zoom, and country/world fitting. Simulation positions remain latitude/longitude. A single input controller maps drag, wheel, keyboard, double-click, and touch pinch into camera gestures. Pointer input is coalesced per animation frame, wheel zoom remains anchored at the cursor, and scenario changes cancel outstanding momentum. Editor painting takes ownership before dragging begins. Reference image handles use native pointer capture and explicitly invalidate the renderer when their bounds change.

No Leaflet, external imagery tiles, style selector, or private Leaflet method adapter remains. Old scenario imagery fields can still be read, but new scenarios always use Atlas. Geographic resolution and grid density remain separate settings: all three Natural Earth resolutions, cities, country rasters, and editor geometry are still needed.

## Rendering and ownership

PixiJS is loaded on demand and uses WebGL. The political view retains country polygons in zoom-zero world coordinates, transforms the world containers with the camera, and retains GPU flag sprites for visible units. Dirty ownership cells invalidate neighboring world chunks; zoom and pan do not rebuild country geometry. Scene retention is bounded, and scene objects remain entirely outside saveable simulation state.

The ocean and neutral coastline are behind the GPU country layer. Independently cached Canvas layers keep text, flags on countries, selection contours, naval icons, battle indicators, diagnostics, and editor overlays. Flag view, recording/export capture, initialization, and devices without WebGL use the complete Canvas path. This is a deliberate hybrid migration, not a claim that every drawing command now executes in WebGL. Pixi's CSP-safe uniform/shader adapters are included; `unsafe-eval` permission is not required.

The resident simulation worker remains authoritative. Recruitment, diplomacy, editing, and ownership handoffs retain the existing acknowledged protocol. Simulation algorithms, save formats, country identities, and geography assets are not rewritten here. AI targeting and proposal scheduling remain separate measured optimization work described in `PERFORMANCE-AUDIT.md`.

## Validation boundary

All automated verification runs in Node: projection round trips, cursor anchoring, pointer coalescing/cancellation, editor ownership, camera resets and bounds, retained meshes, dirty-cell invalidation, scenario/save compatibility, actual worker messages, pause/speed changes, UI module wiring, complete module linking, and production/offline asset resolution under a GitHub Pages project subpath.

The CPU scene benchmark measures preparation and cache reuse, not WebGL drawing or browser FPS. The original whole-world Canvas command benchmark and new retained-scene benchmark exercise different work: the latter deliberately reuses prepared geometry. Their timings are not an end-to-end speedup ratio.

No browser, game, fullscreen, visual output, or GPU execution is used for verification. Manual checks before release should cover dragging and pinch across bounds, country gradients/coast clipping, flags and naval markers, editor image handles and painted terrain, capture/recording, WebGL context restoration/fallback, and offline startup on the deployed subpath. This migration should remain a draft PR until that manual visual and device validation is complete.
