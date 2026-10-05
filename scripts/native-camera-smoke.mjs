import assert from "node:assert/strict";
import "./register-types.mjs";
const { MapCamera } = await import("../src/map-camera.ts");
const { project, unproject, Bounds } = await import("../src/map-projection.ts");
const { bindCameraInput } = await import("../src/camera-input.ts");
class Element {
	clientWidth = 960;
	clientHeight = 600;
	tabIndex = -1;
	listeners = new Map();
	captures = new Set();
	classList = { add() {} };
	getBoundingClientRect() {
		return { left: 0, top: 0 };
	}
	focus() {}
	addEventListener(type, fn) {
		this.listeners.set(type, fn);
	}
	removeEventListener(type) {
		this.listeners.delete(type);
	}
	setPointerCapture(id) {
		this.captures.add(id);
	}
	hasPointerCapture(id) {
		return this.captures.has(id);
	}
	releasePointerCapture(id) {
		this.captures.delete(id);
	}
	emit(type, data = {}) {
		this.listeners.get(type)?.({
			type,
			button: 0,
			pointerId: 1,
			clientX: 480,
			clientY: 300,
			target: { closest: () => null },
			preventDefault() {},
			stopPropagation() {},
			...data,
		});
	}
}
for (const lat of [-85, -45, 0, 45, 85])
	for (const lng of [-180, -100, 0, 100, 180])
		for (const zoom of [0, 3, 8, 12]) {
			const p = unproject(project([lat, lng], zoom), zoom);
			assert.ok(Math.abs(p.lat - lat) < 1e-8 && Math.abs(p.lng - lng) < 1e-8);
		}
const element = new Element(),
	map = new MapCamera(element, {
		center: [0, 0],
		zoom: 4,
		minZoom: 2,
		maxZoom: 12,
	});
const bounds = new Bounds([
	[-10, -10],
	[10, 10],
]);
assert.ok(bounds.pad(0.1).contains([11, 11]));
map.fitBounds(bounds);
assert.ok(map.getBounds().contains([-10, -10]));
assert.ok(map.getBounds().contains([10, 10]));
map.setView([0, 0], 4);
let now = 0,
	sequence = 0;
const frames = new Map();
let starts = 0,
	ends = 0,
	moves = 0;
map.on("movestart", () => starts++);
map.on("moveend", () => ends++);
map.on("move", () => moves++);
const controls = bindCameraInput(map, {
	now: () => now,
	requestFrame: (fn) => {
		frames.set(++sequence, fn);
		return sequence;
	},
	cancelFrame: (id) => frames.delete(id),
	reducedMotion: () => false,
});
function step(ms = 16) {
	now += ms;
	const callbacks = [...frames.values()];
	frames.clear();
	for (const fn of callbacks) fn(now);
}
const anchor = map.containerPointToLatLng([650, 230]);
element.emit("wheel", {
	deltaY: -90,
	deltaX: 0,
	deltaMode: 0,
	clientX: 650,
	clientY: 230,
});
for (let i = 0; i < 150 && frames.size; i++) {
	step();
	const p = map.latLngToContainerPoint(anchor);
	assert.ok(
		Math.abs(p.x - 650) < 1e-5 && Math.abs(p.y - 230) < 1e-5,
		"wheel must stay anchored",
	);
}
assert.equal(starts, 1);
assert.equal(ends, 1);
assert.ok(map.getZoom() > 4);
const previous = map.getCenter();
element.emit("pointerdown", { clientX: 480, clientY: 300 });
const before = moves;
for (let i = 1; i <= 30; i++)
	element.emit("pointermove", { clientX: 480 + i, clientY: 300 });
assert.equal(moves, before, "pointer input is coalesced");
step();
assert.equal(moves, before + 1);
assert.ok(map.getCenter().lng < previous.lng);
element.emit("pointercancel", { clientX: 510, clientY: 300 });
assert.equal(frames.size, 0);
// Two fingers zoom around their midpoint. Extra fingers cannot interrupt the gesture.
map.setView([0, 0], 4);
const pinchAnchor = map.containerPointToLatLng([480, 300]);
element.emit("pointerdown", { pointerId: 1, clientX: 380 });
element.emit("pointerdown", { pointerId: 2, clientX: 580 });
element.emit("pointerdown", { pointerId: 3, clientX: 700 });
assert.equal(element.captures.size, 2);
element.emit("pointermove", { pointerId: 1, clientX: 280 });
element.emit("pointermove", { pointerId: 2, clientX: 680 });
step();
assert.equal(map.getZoom(), 5);
assert.deepEqual(
	{ ...map.latLngToContainerPoint(pinchAnchor) },
	{ x: 480, y: 300 },
);
element.emit("pointerup", { pointerId: 2, clientX: 680 });
const pinchCenter = map.getCenter();
element.emit("pointermove", { pointerId: 1, clientX: 300 });
step();
assert.ok(map.getCenter().lng < pinchCenter.lng);
element.emit("blur");
assert.equal(element.captures.size, 0);
assert.equal(frames.size, 0);
// Momentum advances after release, then settles and balances its gesture events.
map.setView([0, 0], 5);
element.emit("pointerdown");
now += 16;
element.emit("pointermove", { clientX: 500 });
step();
element.emit("pointerup", { clientX: 500 });
const released = map.getCenter();
assert.equal(frames.size, 1);
step();
assert.ok(map.getCenter().lng < released.lng);
for (let i = 0; i < 150 && frames.size; i++) step();
assert.equal(frames.size, 0);
assert.equal(starts, ends);
// Editor handlers get first ownership of each stroke, and pointer capture survives leaving the viewport.
map.on("mousedown", () => map.dragging.disable());
let clicks = 0;
map.on("click", () => clicks++);
const center = map.getCenter();
element.emit("pointerdown");
assert.ok(element.captures.has(1));
element.emit("pointermove", { clientX: 1200 });
step();
assert.deepEqual(map.getCenter(), center);
element.emit("pointerup", { clientX: 1200 });
assert.equal(element.captures.size, 0);
assert.equal(clicks, 0, "an editor stroke is not a click");
element.emit("pointerdown");
element.emit("pointermove", { clientX: 482 });
element.emit("pointerup", { clientX: 482 });
assert.equal(clicks, 1, "a stationary editor tap still clicks");
map.dragging.enable();
// A reference handle neither pans the map nor changes its zoom.
const zoom = map.getZoom();
element.emit("wheel", {
	deltaY: -120,
	deltaX: 0,
	deltaMode: 0,
	target: { closest: () => true },
});
assert.equal(map.getZoom(), zoom);
assert.equal(frames.size, 0);
// Resetting/scenario changes cancel momentum and zoom targets rather than replaying them later.
element.emit("wheel", { deltaY: -120, deltaX: 0, deltaMode: 0 });
step();
map.setView([5, 10], 3);
assert.equal(frames.size, 0);
assert.equal(map.getZoom(), 3);
assert.equal(map.getCenter().lng, 10);
map.setMaxBounds([
	[-20, -30],
	[20, 30],
]);
map.setView([80, 100], 6);
assert.ok(map.getBounds().getEast() <= 30 + 1e-7);
assert.ok(map.getBounds().getNorth() <= 20 + 1e-7);
const start = performance.now();
for (let i = 0; i < 100000; i++) map.getWorldTransform();
const elapsed = performance.now() - start;
controls.destroy();
assert.equal(element.listeners.size, 0);
map.destroy();
console.log(
	JSON.stringify({
		scope: "Node camera math and event scheduling; no browser/GPU",
		matrixUpdates: 100000,
		matrixCpuMs: elapsed,
	}),
);
