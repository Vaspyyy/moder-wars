import assert from "node:assert/strict";
import "./register-types.mjs";
const { AtlasGpuLayer } = await import("../src/atlas-gpu.ts");
const { Container, Sprite, Texture, TextureSource } = await import("pixi.js");
// Construct actual Pixi path instructions in Node, without a renderer, canvas or GPU.
const layer = Object.create(AtlasGpuLayer.prototype);
Object.assign(layer, {
	countries: new Container(),
	fills: new Map(),
	frame: {
		CONFIG: { GRID_RES: 0.15 },
		disableCountryGradient: true,
		countryMetadata: [{ bounds: { minY: 0, maxY: 100 } }],
	},
	materials: [
		null,
		{
			countryId: 1,
			fill: "rgba(100,130,80,0.96)",
			r: 100,
			g: 130,
			b: 80,
			alpha: 0.96,
		},
	],
});
const chunk = {
	polygons: new Float32Array([1, 3, 100, 100, 101, 100, 100, 101]),
	rectangles: new Float32Array([1, 105, 105, 2, 3]),
	borders: new Float32Array(),
	frontlines: new Float32Array(),
};
const graphics = layer.build(chunk);
assert.equal(layer.countries.children.length, 1);
assert.equal(
	graphics.context.instructions.length,
	1,
	"one shared material fill batches both polygon paths",
);
const bounds = graphics.getBounds();
assert.ok(
	Number.isFinite(bounds.x) &&
		Number.isFinite(bounds.y) &&
		bounds.width > 0 &&
		bounds.height > 0,
);
assert.equal(layer.fills.size, 1);
// New main-branch flag caches support canvases and explicit source edits.
// Texture notifications are observable without uploading anything to a GPU.
const canvasFlag = { width: 80, height: 40, renderVersion: 1 };
const otherFlag = { width: 80, height: 40 };
const texture = new Texture({
	source: new TextureSource({ width: 80, height: 40 }),
});
const otherTexture = new Texture({
	source: new TextureSource({ width: 80, height: 40 }),
});
let updates = 0;
texture.source.on("update", () => updates++);
layer.flagTextures = new Map([
	[canvasFlag, { texture, stamp: "80:40:1" }],
	[otherFlag, { texture: otherTexture, stamp: "80:40:" }],
]);
assert.equal(layer.flagTexture(canvasFlag), texture);
assert.equal(updates, 0, "unchanged flags retain their texture");
canvasFlag.renderVersion++;
assert.equal(layer.flagTexture(canvasFlag), texture);
assert.equal(updates, 1, "an edited flag refreshes retained texture pixels");
layer.invalidateFlagTextures(canvasFlag);
assert.equal(layer.flagTextures.get(otherFlag).stamp, "80:40:");
layer.flagTexture(canvasFlag);
assert.equal(updates, 2, "an explicit canvas edit invalidates its GPU pixels");
canvasFlag.width = 100;
layer.flagTexture(canvasFlag);
assert.equal(texture.source.width, 100);
assert.equal(
	layer.flagTexture({ complete: false, naturalWidth: 80, naturalHeight: 40 }),
	null,
);
texture.destroy(true);
otherTexture.destroy(true);
// Replenishing a buffered camera view must update the coastline texture in
// place. Exercise real Pixi source notifications with inert Canvas commands.
const coastLayer = Object.create(AtlasGpuLayer.prototype);
const coastTexture = new Texture({
	source: new TextureSource({ width: 1, height: 1 }),
});
const coastMask = new Sprite(coastTexture);
const coastTrace = [];
const coastContext = Object.fromEntries(
	["clearRect", "save", "scale", "translate", "fill", "restore"].map((name) => [
		name,
		(...args) => coastTrace.push([name, ...args]),
	]),
);
const coastCanvas = { width: 1, height: 1, getContext: () => coastContext };
let coastUpdates = 0;
coastTexture.source.on("update", () => coastUpdates++);
Object.assign(coastLayer, {
	active: false,
	mask: coastMask,
	maskCanvas: coastCanvas,
	maskKey: "",
	countries: new Container(),
	fills: new Map(),
	scene: { prepare: () => false, values: () => [], trim() {} },
	map: {
		getSize: () => ({ x: 960, y: 600 }),
		getWorldTransform: () => ({ x: 17, y: 31, scale: 16 }),
	},
});
const coastFrame = {
	CONFIG: { GRID_RES: 0.15 },
	politicalStyleKey: "coast",
	countryMetadata: [],
	disableCountryGradient: true,
	viewportKey: "first",
	mapResolution: "110m",
	padding: 192,
	dpr: 2,
};
const coastPath = {};
coastLayer.updateChunks([], [], coastFrame, coastPath);
assert.equal(coastCanvas.width, 2688);
assert.equal(coastCanvas.height, 1968);
assert.deepEqual(coastTrace.slice(0, 6), [
	["clearRect", 0, 0, 2688, 1968],
	["save"],
	["scale", 2, 2],
	["translate", 192, 192],
	["fill", coastPath],
	["restore"],
]);
coastLayer.updateChunks(
	[],
	[],
	{ ...coastFrame, viewportKey: "second" },
	coastPath,
);
assert.equal(coastLayer.mask, coastMask);
assert.equal(coastLayer.mask.texture, coastTexture);
assert.equal(coastLayer.maskCanvas, coastCanvas);
assert.equal(
	coastUpdates,
	2,
	"camera refills upload into one retained mask texture",
);
assert.equal(coastMask.x, (-192 - 17) / 16);
assert.equal(coastMask.width, (960 + 384) / 16);
coastLayer.updateChunks(
	[],
	[],
	{ ...coastFrame, viewportKey: "second" },
	coastPath,
);
assert.equal(coastUpdates, 2, "unchanged views do not reupload coast masks");
coastLayer.updateChunks([], [], coastFrame, null);
assert.equal(coastLayer.mask, undefined);
assert.equal(coastLayer.maskCanvas, undefined);
assert.equal(coastLayer.countries.mask ?? null, null);
coastLayer.countries.destroy();
// Pixi viewport dimensions use CSS pixels; resolution belongs to the source.
// Comparing them to device pixels would resize the renderer on every paint.
let viewportWidth = 960,
	resizes = 0;
const viewportTexture = new Texture({
	source: new TextureSource({ width: 1344, height: 984, resolution: 2 }),
});
const viewportRenderer = {
	screen: { width: 1344, height: 984 },
	resolution: 2,
	get width() {
		return viewportTexture.frame.width;
	},
	get height() {
		return viewportTexture.frame.height;
	},
	resize(width, height) {
		resizes++;
		this.screen.width = width;
		this.screen.height = height;
		viewportTexture.source.resize(width, height);
	},
};
Object.assign(coastLayer, {
	active: true,
	ready: true,
	frame: coastFrame,
	world: new Container(),
	markers: new Container(),
	markerPool: new Map(),
	canvas: { style: {} },
	markerCanvas: { style: {} },
	renderer: viewportRenderer,
	markerRenderer: viewportRenderer,
	map: {
		getZoom: () => 4,
		getSize: () => ({ x: viewportWidth, y: 600 }),
		getWorldTransform: () => ({ x: 17, y: 31, scale: 16 }),
	},
});
for (let i = 0; i < 10; i++) coastLayer.setCamera(false);
assert.equal(
	resizes,
	0,
	"unchanged HiDPI camera paints must not resize render targets",
);
assert.equal(coastLayer.world.x, 17 + 192);
viewportWidth = 1024;
coastLayer.setCamera(false);
assert.equal(resizes, 1);
assert.equal(viewportTexture.source.pixelWidth, 2816);
assert.equal(coastLayer.canvas.style.left, "-192px");
coastLayer.world.destroy();
coastLayer.markers.destroy();
viewportTexture.destroy(true);
// Device failures must fall back to Canvas instead of escaping to window.onerror.
let invalidated = 0;
Object.assign(layer, {
	active: true,
	ready: true,
	renderer: {
		render() {
			throw new Error("simulated context failure");
		},
	},
	markerPool: new Map(),
	canvas: { style: {} },
	markerCanvas: { style: {} },
	invalidate() {
		invalidated++;
	},
});
const warn = console.warn;
console.warn = () => {};
try {
	assert.doesNotThrow(() => layer.render());
} finally {
	console.warn = warn;
}
assert.equal(layer.active, false);
assert.equal(layer.ready, false);
assert.equal(invalidated, 1);
// A lost context must opt in to browser restoration and leave the GPU path.
const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
globalThis.document = {
	createElement: () => ({ style: {}, addEventListener() {} }),
};
globalThis.window = { devicePixelRatio: 1 };
console.warn = () => {};
let lostLayer;
try {
	lostLayer = new AtlasGpuLayer(
		{
			getContainer: () => ({ appendChild() {} }),
			getSize: () => ({ x: 8, y: 8 }),
		},
		() => {},
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
} finally {
	console.warn = warn;
	globalThis.document = priorDocument;
	globalThis.window = priorWindow;
}
Object.assign(lostLayer, { ready: true, active: true });
let restorationRequested = false;
lostLayer.onLost({
	preventDefault() {
		restorationRequested = true;
	},
});
assert.equal(restorationRequested, true, "context loss allows restoration");
assert.equal(lostLayer.ready, false);
assert.equal(lostLayer.active, false);
graphics.destroy();
layer.countries.destroy();
console.log(
	"Actual Pixi geometry instructions and GPU failure recovery passed in Node; no GPU drawing",
);
