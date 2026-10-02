// Node camera/layer doubles only: no game bootstrap, browser, or gameplay.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createSmoothZoom, normalizeZoomWheel } from "../src/smooth-zoom.js";

function point(x, y) {
	return { x, y, divideBy: n => point(x / n, y / n), subtract: p => point(x - p.x, y - p.y), add: p => point(x + p.x, y + p.y), multiplyBy: n => point(x * n, y * n) };
}
function project(center, zoom) {
	const world = 256 * 2 ** zoom;
	const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, center.lat)) * Math.PI / 180);
	return point((center.lng + 180) / 360 * world, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world);
}
function unproject(value, zoom) {
	const [x, y] = Array.isArray(value) ? value : [value.x, value.y];
	const world = 256 * 2 ** zoom;
	return { lng: x / world * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world))) * 180 / Math.PI };
}
function events() {
	const listeners = new Map();
	return {
		listeners,
		on(names, fn) { for (const name of names.split(" ")) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); } return this; },
		off(names, fn) { for (const name of names.split(" ")) listeners.get(name)?.delete(fn); return this; },
		fire(name, data = {}) { for (const fn of [...(listeners.get(name) || [])]) fn(data); return this; },
	};
}
const rendererSource = readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8")
	.replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
	.replace(/export \{ ControlMapLayer, RENDER_LAYERS \};/, "");

function fixture({ zoom = 5, reduced = false, live = false } = {}) {
	let time = 0, nextId = 1;
	const callbacks = new Map(), children = [], classes = new Set();
	const dom = events();
	const container = Object.assign(dom, {
		addEventListener: dom.on, removeEventListener: dom.off,
		classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
		appendChild(surface) { children.push(surface); surface.parentNode = this; },
		removeChild(surface) { children.splice(children.indexOf(surface), 1); surface.parentNode = null; },
	});
	const requestFrame = fn => { const id = nextId++; callbacks.set(id, fn); return id; };
	const cancelFrame = id => callbacks.delete(id);
	const stats = { starts: 0, ends: 0, previews: 0, paints: 0, tileUpdates: 0, zoomEvents: 0, moves: 0 };
	const map = Object.assign(events(), {
		options: {}, _zoom: zoom, _lastCenter: { lat: 30, lng: 20 },
		getZoom() { return this._zoom; }, getCenter() { return this._lastCenter; },
		getSize: () => point(960, 600), getContainer: () => container, getPane: () => null,
		getBounds: () => ({ equals: () => false }), getMinZoom: () => 2, getMaxZoom: () => 12,
		project, unproject, getZoomScale: (next, previous) => 2 ** (next - previous),
		mouseEventToContainerPoint: event => point(event.x, event.y),
		_limitCenter(center, _zoom, bounds) {
			return bounds ? { lat: Math.min(bounds.north, Math.max(bounds.south, center.lat)), lng: Math.min(bounds.east, Math.max(bounds.west, center.lng)) } : center;
		},
		_stop() {},
		_moveStart() { this.fire("zoomstart").fire("movestart"); return this; },
		_move(center, zoom, _data, suppress) {
			assert.equal(suppress, true, "intermediate camera steps must not reset Leaflet tile grids");
			this._zoom = zoom; this._lastCenter = center; stats.moves++; return this;
		},
		_moveEnd() { this.fire("zoomend").fire("moveend"); return this; },
	});
	map.on("zoomstart", () => stats.starts++);
	map.on("zoomend", () => stats.ends++);
	map.on("zoomanim", event => { assert.equal(event.noUpdate, true); stats.previews++; });
	map.on("zoom", () => { stats.zoomEvents++; stats.tileUpdates++; });
	const controller = createSmoothZoom(map, { requestFrame, cancelFrame, now: () => time, reducedMotion: () => reduced });
	const canvas = () => ({ style: {}, width: 0, height: 0, setAttribute() {} });
	const globals = {
		document: { createElement: canvas }, window: { devicePixelRatio: 2 },
		map, worldControlMap: null, landMask: null, isPaused: !live,
		gameState: live ? "SIMULATING" : "MENU", godModeActive: false, preGodModeState: "MENU", cinematicMode: false,
		gridWidth: 128, gridHeight: 96, performance: { now: () => time }, requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame,
		L: { Layer: { extend(methods) { function Layer() {} Object.assign(Layer.prototype, methods); return Layer; } }, DomUtil: { create: canvas, setTransform(surface, offset, scale) { surface.style.transform = `${offset.x},${offset.y},${scale}`; } } },
	};
	const Layer = vm.runInNewContext(`${rendererSource}\nControlMapLayer;`, globals);
	const view = new Layer(); view.onAdd(map);
	view.render = () => {
		if ((view._zooming || view._cameraMoving) && !view._cameraRepaintPending) return;
		stats.paints++;
		view._renderedZoom = map.getZoom(); view._renderedCenter = map.getCenter();
		view._lastCameraPaintTime = time; view._commitZoomSettle();
	};
	function advance(ms) {
		time += ms;
		for (const [id, callback] of [...callbacks]) {
			if (!callbacks.delete(id)) continue;
			callback(time);
		}
		if (live && view.hasPendingZoomSettle()) view.render();
	}
	function settle() {
		for (let i = 0; callbacks.size && i < 300; i++) advance(1000 / 60);
		assert.equal(callbacks.size, 0, "gesture and final paint must settle without a timer leak");
	}
	function wheel(deltaY, x = 660, y = 240, extra = {}) {
		let prevented = false;
		const event = { deltaY, deltaX: 0, deltaMode: 0, x, y, preventDefault() { prevented = true; }, stopPropagation() {}, ...extra };
		container.fire("wheel", event);
		return prevented;
	}
	function cursorLatLng(x = 660, y = 240) {
		const p = map.project(map.getCenter(), map.getZoom());
		return map.unproject([p.x + x - 480, p.y + y - 300], map.getZoom());
	}
	return { map, view, controller, stats, callbacks, container, classes, children, globals, Layer, advance, settle, wheel, cursorLatLng };
}
function anchored(actual, expected) {
	assert.ok(Math.abs(actual.lat - expected.lat) < 1e-9 && Math.abs(actual.lng - expected.lng) < 1e-9, "geographic cursor anchor must survive every intermediate frame");
}

assert.equal(normalizeZoomWheel({ deltaY: 3, deltaMode: 1 }, 600), 48);
assert.equal(normalizeZoomWheel({ deltaY: 1, deltaMode: 2 }, 600), 120);
assert.equal(normalizeZoomWheel({ deltaY: NaN }, 600), 0);
assert.equal(normalizeZoomWheel({ deltaY: 10, deltaX: 20 }, 600), 0);

const zoomIn = fixture(), anchor = zoomIn.cursorLatLng();
assert.equal(zoomIn.wheel(-120), true);
zoomIn.advance(1000 / 60);
assert.ok(zoomIn.map.getZoom() > 5 && zoomIn.map.getZoom() < 5.4, "first display frame responds without jumping to the target");
assert.equal(zoomIn.stats.ends, 0);
assert.equal(zoomIn.stats.tileUpdates, 0);
assert.ok(zoomIn.children.every(surface => surface.style.transition === "none"));
assert.equal(new Set(zoomIn.children.map(surface => surface.style.transform)).size, 1, "all map surfaces use the same camera transform");
for (let i = 0; i < 5; i++) { zoomIn.advance(1000 / 60); anchored(zoomIn.cursorLatLng(), anchor); }
assert.equal(zoomIn.stats.paints, 0, "ordinary zoom must reuse the canvas throughout easing");
zoomIn.globals.worldControlMap = new Uint16Array(1); zoomIn.globals.landMask = new Uint8Array(1);
assert.doesNotThrow(() => zoomIn.Layer.prototype.render.call(zoomIn.view), "direct simulation renders must obey the gesture guard");
zoomIn.settle(); anchored(zoomIn.cursorLatLng(), anchor);
assert.ok(Math.abs(zoomIn.map.getZoom() - 5.4) < 0.001);
assert.deepEqual([zoomIn.stats.starts, zoomIn.stats.ends, zoomIn.stats.paints, zoomIn.stats.tileUpdates], [1, 1, 1, 1]);
assert.ok(zoomIn.children.every(surface => surface.style.transform === "" && surface.style.willChange === "" && surface.style.transition === ""));
assert.equal(zoomIn.classes.size, 0);

// Frame-rate-independent easing, including high refresh rate displays.
const sixty = fixture(), highRefresh = fixture();
sixty.wheel(-120); highRefresh.wheel(-120);
for (let i = 0; i < 5; i++) sixty.advance(1000 / 60);
for (let i = 0; i < 12; i++) highRefresh.advance(1000 / 144);
assert.ok(Math.abs(sixty.map.getZoom() - highRefresh.map.getZoom()) < 1e-12);
sixty.settle(); highRefresh.settle();

// More wheel samples retarget the same animation instead of getting lost in it.
const sustained = fixture(), history = [];
for (let i = 0; i < 12; i++) {
	sustained.wheel(-60); sustained.advance(1000 / 60); history.push(sustained.map.getZoom());
}
assert.ok(history.every((value, i) => i === 0 || value > history[i - 1]));
assert.equal(sustained.stats.starts, 1); assert.equal(sustained.stats.ends, 0);
assert.equal(sustained.stats.tileUpdates, 0);
const reversedAt = sustained.map.getZoom(); sustained.wheel(120); sustained.advance(1000 / 60);
assert.ok(sustained.map.getZoom() < reversedAt, "reversal must react on the next frame despite the queued zoom-in target");
const newAnchor = sustained.cursorLatLng(200, 400);
sustained.wheel(40, 200, 400); sustained.advance(1000 / 60);
anchored(sustained.cursorLatLng(200, 400), newAnchor);
sustained.settle();
assert.equal(sustained.stats.ends, 1);

// Edge anchoring during zoom-out replenishes coverage at a bounded rate.
for (const live of [false, true]) {
	const outward = fixture({ zoom: 8, live });
	for (let i = 0; i < 60; i++) { outward.wheel(30, 900, 570); outward.advance(1000 / 60); }
	assert.ok(outward.stats.paints > 0, "long outward zoom must replenish its overscan before empty edges persist");
	assert.ok(outward.stats.paints <= 9, "repainting must never follow wheel/display event frequency");
	assert.equal(outward.stats.ends, 0); assert.equal(outward.stats.tileUpdates, 0);
	if (live) assert.equal(outward.callbacks.size, 1, "live simulation owns replenishment, with only the camera rAF queued");
	outward.settle(); assert.equal(outward.stats.ends, 1);
}

for (const [zoom, delta] of [[2, 120], [12, -120]]) {
	const bounded = fixture({ zoom }); bounded.wheel(delta); bounded.advance(16);
	assert.equal(bounded.map.getZoom(), zoom); assert.equal(bounded.stats.starts, 0); assert.equal(bounded.callbacks.size, 0);
}
const limited = fixture({ zoom: 11.9 }); for (let i = 0; i < 100; i++) limited.wheel(-120); limited.settle();
assert.ok(limited.map.getZoom() <= 12);
const low = fixture({ zoom: 2.1 }); low.wheel(120); low.settle(); assert.ok(low.map.getZoom() >= 2);
const customBounds = fixture({ zoom: 8 });
customBounds.map.options.maxBounds = { north: 35, south: 25, west: 15, east: 25 };
for (let i = 0; i < 20; i++) { customBounds.wheel(120, 950, 590); customBounds.advance(16); }
customBounds.settle();
const boundedCenter = customBounds.map.getCenter();
assert.ok(boundedCenter.lat >= 25 && boundedCenter.lat <= 35 && boundedCenter.lng >= 15 && boundedCenter.lng <= 25, "custom-map world bounds constrain every zoom camera");
const noMotion = fixture({ reduced: true }); noMotion.wheel(-120); noMotion.advance(16);
assert.equal(noMotion.map.getZoom(), 5.4); noMotion.settle();

const interrupted = fixture(); interrupted.wheel(-120); interrupted.advance(16);
const interruptedZoom = interrupted.map.getZoom(); interrupted.container.fire("pointerdown"); interrupted.settle();
assert.equal(interrupted.map.getZoom(), interruptedZoom, "starting a drag commits the visible camera without snapping to the wheel target");
interrupted.wheel(-120); interrupted.advance(16); interrupted.map.fire("viewprereset"); interrupted.settle();
assert.equal(interrupted.stats.ends, 2, "scenario reset cancels a stale wheel animation");
const ignored = fixture();
assert.equal(ignored.wheel(-120, 660, 240, { target: { closest: () => ({}) } }), false);
assert.equal(ignored.wheel(-120, 660, 240, { defaultPrevented: true }), false);
assert.equal(ignored.callbacks.size, 0);
const removed = fixture(); removed.wheel(-120); removed.advance(16); removed.controller.destroy(); removed.settle();
assert.equal(removed.container.listeners.get("wheel").size, 0);
assert.equal(removed.classes.size, 0);
removed.view.onRemove(removed.map); assert.equal(removed.children.length, 0);
const unloaded = fixture(); unloaded.wheel(-120); unloaded.advance(16); unloaded.map.fire("unload"); unloaded.settle();
assert.equal(unloaded.container.listeners.get("wheel").size, 0);

const keyboardZoom = fixture(); keyboardZoom.view._onZoomStart();
assert.ok(keyboardZoom.children.every(surface => surface.style.transition.includes("250ms")), "standard Leaflet zoom animates the canvases outside its map pane");
keyboardZoom.view._onZoomEnd(); keyboardZoom.settle();
assert.ok(keyboardZoom.children.every(surface => surface.style.transition === ""));

// Adapter/CSS assumptions are tied to the application's pinned Leaflet version.
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
assert.match(main, /scrollWheelZoom: false/);
assert.equal([...main.matchAll(/updateWhenZooming: false/g)].length, 3);
assert.equal([...main.matchAll(/updateWhenIdle: true/g)].length, 3);
assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /leaflet@1\.9\.4/);

// Optional real-library compatibility probe. Supply an existing source file;
// normal offline smoke checks do not fetch or install third-party dependencies.
if (process.env.MW_LEAFLET_SOURCE) {
	const element = () => ({ style: { transform: "", transition: "", perspective: "" }, getContext() { return {}; } });
	const document = { documentElement: element(), createElement: element, addEventListener() {}, removeEventListener() {} };
	const window = { document, navigator: { userAgent: "Node", platform: "Linux" }, screen: { deviceXDPI: 96, logicalXDPI: 96 }, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };
	vm.runInNewContext(readFileSync(process.env.MW_LEAFLET_SOURCE, "utf8"), { window, document, navigator: window.navigator, setTimeout, clearTimeout });
	const L = window.L;
	assert.equal(L.version, "1.9.4");
	const listeners = new Map(), classes = new Set(), callbacks = new Map();
	let id = 0, time = 0, starts = 0, ends = 0, previews = 0, updates = 0, transforms = 0;
	const container = {
		classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
		addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
	};
	const map = Object.create(L.Map.prototype);
	Object.assign(map, {
		options: { crs: L.CRS.EPSG3857, zoomSnap: 0, minZoom: 2, maxZoom: 12 },
		_loaded: true, _zoom: 5, _lastCenter: L.latLng(30, 20), _mapPane: { _leaflet_pos: L.point(0, 0) },
		getSize: () => L.point(960, 600), getContainer: () => container, mouseEventToContainerPoint: e => L.point(e.x, e.y),
	});
	map._move(map._lastCenter, 5, undefined, true);
	map.on("zoomstart", () => starts++); map.on("zoomend", () => ends++); map.on("zoomanim", () => previews++);
	const tiles = Object.create(L.GridLayer.prototype);
	Object.assign(tiles, {
		_map: map, _zoomAnimated: true, _tileZoom: 5,
		options: { updateWhenZooming: false, updateWhenIdle: true, minZoom: 0, maxZoom: 19 },
		_updateLevels() { updates++; }, _resetGrid() { updates++; }, _update() { updates++; }, _pruneTiles() {}, _setZoomTransforms() { transforms++; },
	});
	for (const [name, callback] of Object.entries(tiles.getEvents())) map.on(name, callback, tiles);
	const controller = createSmoothZoom(map, {
		requestFrame: fn => { callbacks.set(++id, fn); return id; }, cancelFrame: id => callbacks.delete(id), now: () => time, reducedMotion: () => false,
	});
	const cursor = () => map.unproject(map.project(map.getCenter()).add(L.point(180, -60)));
	const anchor = cursor();
	listeners.get("wheel")({ deltaY: -120, deltaMode: 0, x: 660, y: 240, preventDefault() {}, stopPropagation() {} });
	for (let frame = 0; frame < 100 && callbacks.size; frame++) {
		time += 1000 / 60;
		for (const [key, fn] of [...callbacks]) { callbacks.delete(key); fn(time); }
		const projected = map.project(anchor).subtract(map.project(cursor()));
		assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, "real Leaflet anchor stays within its pixel rounding");
		if (ends === 0) assert.equal(updates, 0, "real GridLayer must defer intermediate grid rebuilds");
	}
	assert.equal(starts, 1); assert.equal(ends, 1); assert.ok(previews > 10); assert.ok(updates > 0);
	assert.equal(map.getZoom(), 5.4); assert.equal(classes.size, 0); controller.destroy();
	console.log(JSON.stringify({ scope: "real Leaflet 1.9.4 camera and GridLayer in Node, no browser/game", starts, ends, previews, gridOperationsAtSettle: updates, tileTransforms: transforms }));
}
console.log("Smooth zoom smoke passed: continuous/reversible cursor anchoring, refresh-rate independence, limits, interruptions, tile deferral, bounded replenishment, and one final paint");
