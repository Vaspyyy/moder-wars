import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createMapInput } from "../src/map-input.js";
import "./register-types.mjs";
const { MapCamera } = await import("../src/map-camera.ts");
const { bindCameraInput } = await import("../src/camera-input.ts");
const { mapRuntime } = await import("../src/map-runtime.ts");
const { AtlasGpuLayer } = await import("../src/atlas-gpu.ts");
const { Container, Sprite, Texture, TextureSource } = await import("pixi.js");

let time = 0,
	sequence = 0;
const callbacks = new Map();
const metrics = {
	layoutReads: 0,
	hudWrites: 0,
	flagSizeWrites: 0,
	gpuPresents: 0,
	fullPaints: 0,
};
const requestFrame = (fn) => {
	callbacks.set(++sequence, fn);
	return sequence;
};
const cancelFrame = (id) => callbacks.delete(id);
function surface() {
	return { style: {}, width: 0, height: 0, setAttribute() {}, remove() {} };
}
const container = {
	clientWidth: 960,
	clientHeight: 600,
	classList: { add() {} },
	listeners: new Map(),
	captures: new Set(),
	appendChild() {},
	focus() {},
	getBoundingClientRect() {
		metrics.layoutReads++;
		return { left: 0, top: 0 };
	},
	addEventListener(name, fn) {
		this.listeners.set(name, fn);
	},
	removeEventListener(name) {
		this.listeners.delete(name);
	},
	setPointerCapture(id) {
		this.captures.add(id);
	},
	hasPointerCapture(id) {
		return this.captures.has(id);
	},
	releasePointerCapture(id) {
		this.captures.delete(id);
	},
};
const map = new MapCamera(container, { center: [0, 0], zoom: 5 });
const source = readFileSync(
	new URL("../src/renderer.js", import.meta.url),
	"utf8",
)
	.replace(/import\s[\s\S]*?from\s"[^"]+";/g, "")
	.replace(/export\s*\{[^}]+\};/g, "");
// Evaluate renderer definitions against an inert owner. The full game render
// is replaced with a paint counter; real camera/gesture/GPU transform code runs.
const methods = vm.runInNewContext(`${source}\nControlMapLayer;`, {
	map,
	mapRuntime: {
		...mapRuntime,
		Layer: { extend: (value) => value },
		DomUtil: { ...mapRuntime.DomUtil, create: surface },
	},
	document: { createElement: surface },
	window: { devicePixelRatio: 1 },
	performance: { now: () => time },
	requestAnimationFrame: requestFrame,
	cancelAnimationFrame: cancelFrame,
	cinematicMode: false,
	isPaused: true,
	gameState: "SETUP",
	godModeActive: false,
});
const layer = {
	...methods,
	render() {
		metrics.fullPaints++;
		this._gpu?.setCamera();
		this._renderedZoom = map.getZoom();
		this._renderedCenter = map.getCenter();
		this._lastCameraPaintTime = time;
		this._invalidLayers = 0;
		this._commitZoomSettle();
	},
};
map.addLayer(layer);
const renderer = () => ({
	width: 960,
	height: 600,
	screen: { width: 960, height: 600 },
	resolution: 1,
	resize(width, height) {
		this.width = width;
		this.height = height;
		this.screen.width = width;
		this.screen.height = height;
	},
	render() {
		metrics.gpuPresents++;
	},
});
const gpu = Object.create(AtlasGpuLayer.prototype);
Object.assign(gpu, {
	map,
	active: true,
	ready: true,
	world: new Container(),
	markers: new Container(),
	markerPool: new Map(),
	canvas: surface(),
	markerCanvas: surface(),
	renderer: renderer(),
	markerRenderer: renderer(),
	frame: { padding: 192 },
});
const texture = new Texture({
	source: new TextureSource({ width: 80, height: 40 }),
});
for (let id = 0; id < 5000; id++) {
	const sprite = new Sprite(texture);
	for (const name of ["width", "height"]) {
		const property = Object.getOwnPropertyDescriptor(Sprite.prototype, name);
		Object.defineProperty(sprite, name, {
			get() {
				return property.get.call(this);
			},
			set(value) {
				metrics.flagSizeWrites++;
				property.set.call(this, value);
			},
		});
	}
	gpu.markerPool.set(id, sprite);
	gpu.markers.addChild(sprite);
}
layer._gpu = gpu;
layer._cameraSurfaces = [...layer._surfaces, gpu.canvas, gpu.markerCanvas];
gpu.setCamera(false);
if (!process.argv.includes("--measure")) {
	assert.equal(gpu.renderer.width, 1344);
	assert.equal(gpu.renderer.height, 984);
	assert.equal(gpu.canvas.style.left, "-192px");
}
let hudText = "";
const coordsDisplay = {
	get textContent() {
		return hudText;
	},
	set textContent(value) {
		metrics.hudWrites++;
		hudText = value;
	},
};
const previousRequest = globalThis.requestAnimationFrame;
const previousCancel = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = requestFrame;
globalThis.cancelAnimationFrame = cancelFrame;
const mapInput = createMapInput({ map, coordsDisplay, isPainting: false });
mapInput.bindMapCoordinatesMousemove();
mapInput.bindMapPaintMousemove();
const controls = bindCameraInput(map, {
	now: () => time,
	requestFrame,
	cancelFrame,
	reducedMotion: () => true,
});
function emit(type, values = {}) {
	container.listeners.get(type)({
		type,
		button: 0,
		pointerId: 1,
		clientX: 480,
		clientY: 300,
		target: { closest: () => null },
		preventDefault() {},
		stopPropagation() {},
		...values,
	});
}
function step() {
	time += 16;
	const next = [...callbacks.values()];
	callbacks.clear();
	for (const fn of next) fn(time);
}
function reset() {
	for (const name of Object.keys(metrics)) metrics[name] = 0;
}
function alignment() {
	const transform = gpu.canvas.style.transform;
	assert.ok(
		transform,
		"GPU buffer follows the same compositor transform as Canvas",
	);
	const [, x, y, scale] = /translate\(([^p]+)px,([^p]+)px\) scale\(([^)]+)\)/
		.exec(transform)
		.map(Number);
	const point = map.project([10, 20], 0),
		expected = map.latLngToContainerPoint([10, 20]);
	assert.ok(
		Math.abs(
			-192 +
				x +
				(gpu.world.x + point.x * gpu.world.scale.x) * scale -
				expected.x,
		) < 1e-7,
	);
	assert.ok(
		Math.abs(
			-192 +
				y +
				(gpu.world.y + point.y * gpu.world.scale.y) * scale -
				expected.y,
		) < 1e-7,
	);
}
const measure = process.argv.includes("--measure");
reset();
emit("pointerdown");
reset();
const started = performance.now();
for (let frame = 0; frame < 120; frame++) {
	for (let sample = 1; sample <= 4; sample++)
		emit("pointermove", { clientX: 480 + (frame * 4 + sample) / 5 });
	step();
}
const pan = { ...metrics, cpuMs: performance.now() - started };
if (!measure) {
	assert.equal(pan.layoutReads, 480, "one layout read per pointer sample");
	assert.ok(
		pan.hudWrites > 0 && pan.hudWrites <= 120,
		"coordinate HUD writes at most once per frame",
	);
	assert.equal(
		pan.gpuPresents,
		0,
		"buffered camera frames do not submit GPU scenes",
	);
	assert.equal(pan.flagSizeWrites, 0, "panning does not resize unit flags");
	assert.equal(pan.fullPaints, 0, "short pans reuse complete buffered frames");
	alignment();
}
emit("pointercancel");
step();
assert.equal(
	metrics.fullPaints,
	1,
	"settlement paints one complete final view",
);
if (!measure) {
	assert.equal(gpu.canvas.style.transform, "");
	assert.equal(gpu.markerCanvas.style.transform, "");
}
reset();
emit("wheel", {
	deltaY: -90,
	deltaX: 0,
	deltaMode: 0,
	clientX: 650,
	clientY: 230,
});
step();
const zoom = { ...metrics };
if (!measure) {
	assert.equal(zoom.gpuPresents, 0);
	assert.equal(zoom.flagSizeWrites, 0);
	alignment();
}
for (let i = 0; i < 30 && callbacks.size; i++) step();
assert.equal(metrics.fullPaints, 1, "wheel settlement performs a final paint");
// A long drag must replenish coverage, still throttled, and retain alignment.
reset();
emit("pointerdown");
for (let frame = 0; frame < 40; frame++) {
	emit("pointermove", { clientX: 480 + frame * 12 });
	step();
}
assert.ok(
	metrics.fullPaints > 0 && metrics.fullPaints < 8,
	"long pans refill buffers rather than paint every frame",
);
emit("pointercancel");
step();
controls.destroy();
if (!measure) {
	const firstWrite = metrics.hudWrites;
	map.fire("mousemove", { latlng: { lat: 1, lng: 2 } });
	map.fire("mousemove", { latlng: { lat: 3, lng: 4 } });
	assert.equal(callbacks.size, 1);
	step();
	assert.equal(coordsDisplay.textContent, "3.0000, 4.0000");
	assert.equal(
		metrics.hudWrites,
		firstWrite + 1,
		"paint and coordinate handlers share one HUD write per frame",
	);
	const before = metrics.hudWrites;
	map.fire("mousemove", { latlng: { lat: 3, lng: 4 } });
	step();
	assert.equal(
		metrics.hudWrites,
		before,
		"unchanged coordinates do not write DOM text",
	);
	map.fire("mousemove", { latlng: { lat: 5, lng: 6 } });
	assert.equal(callbacks.size, 1);
	map.fire("unload");
	assert.equal(callbacks.size, 0, "map disposal cancels the queued HUD update");
}
globalThis.requestAnimationFrame = previousRequest;
globalThis.cancelAnimationFrame = previousCancel;
gpu.world.destroy({ children: true });
gpu.markers.destroy({ children: true });
texture.destroy(true);
console.log(
	JSON.stringify({
		scope:
			"Node gesture work with 5000 real Pixi sprites; no browser/GPU timing",
		pan,
		zoom,
	}),
);
