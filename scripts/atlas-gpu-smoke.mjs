import assert from "node:assert/strict";
import "./register-types.mjs";
const { AtlasGpuLayer } = await import("../src/atlas-gpu.ts");
const { CanvasSource, Container, Sprite, Texture, TextureSource } =
	await import("pixi.js");
const { project } = await import("../src/map-projection.ts");
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
// One texture carries the color ramp; country bounds only change its matrix.
// Real Pixi textures/graphics are used with a small inert Canvas source.
const previousDocument = globalThis.document;
const previousOffscreenCanvas = globalThis.OffscreenCanvas;
const gradientStops = [];
class GradientCanvas {
	width = 1;
	height = 1;
	getContext() {
		return {
			createLinearGradient: (...points) => ({
				addColorStop: (offset, color) =>
					gradientStops.push({ points, offset, color }),
			}),
			fillRect() {},
		};
	}
}
globalThis.OffscreenCanvas = GradientCanvas;
globalThis.document = { createElement: () => new GradientCanvas() };
const gradientLayer = Object.create(AtlasGpuLayer.prototype);
Object.assign(gradientLayer, {
	countries: new Container(),
	fills: new Map(),
	gradientTextures: new Map(),
	scene: { clear() {} },
	frame: {
		CONFIG: { GRID_RES: 0.15 },
		disableCountryGradient: false,
		countryMetadata: [{ bounds: { minY: 800, maxY: 1000 } }],
	},
	materials: layer.materials,
});
try {
	const firstFill = gradientLayer.fill(1);
	const gradientTexture = firstFill.texture;
	assert.equal(gradientTexture.source.pixelWidth, 1);
	assert.equal(gradientTexture.source.pixelHeight, 256);
	assert.equal(gradientTexture.source.style.addressModeU, "repeat");
	assert.equal(gradientTexture.source.style.addressModeV, "clamp-to-edge");
	assert.deepEqual(
		gradientStops.slice(0, 3).map(({ offset, color }) => [offset, color]),
		[
			[0, "rgba(108,138,88,0.96)"],
			[0.3, "rgba(100,130,80,0.96)"],
			[1, "rgba(92,119,73,0.96)"],
		],
	);
	const top = project([30, 0]).y;
	const bottom = project([60, 0]).y;
	for (const fraction of [0, 0.3, 1]) {
		const point = firstFill.matrix.apply({ x: 0, y: 256 * fraction });
		assert.ok(Math.abs(point.y - (top + (bottom - top) * fraction)) < 1e-9);
	}
	assert.equal(firstFill.alpha, 1, "the ramp already contains material alpha");
	gradientLayer.invalidateWorld();
	gradientLayer.frame.countryMetadata[0].bounds = { minY: 700, maxY: 900 };
	const resizedFill = gradientLayer.fill(1);
	assert.equal(
		resizedFill.texture,
		gradientTexture,
		"bounds changes retain texture identity",
	);
	assert.notEqual(resizedFill.matrix.ty, firstFill.matrix.ty);
	for (let i = 0; i < 30; i++) {
		gradientLayer.invalidateWorld();
		assert.equal(gradientLayer.fill(1).texture, gradientTexture);
	}
	assert.equal(
		gradientLayer.gradientTextures.size,
		1,
		"style resets do not allocate new ramps",
	);
	const renderedGradient = gradientLayer.build(chunk);
	assert.equal(
		renderedGradient.context.instructions[0].data.style.texture,
		gradientTexture,
	);
	renderedGradient.destroy({ children: true, context: true });
	assert.equal(
		gradientTexture.destroyed,
		false,
		"chunk disposal preserves the shared ramp",
	);
	// Live fill textures cannot be evicted, even when the cache is exhausted.
	for (let i = 1; i < 512; i++) {
		const color = `rgba(${i % 256},${Math.floor(i / 256)},10,1)`;
		gradientLayer.materials[i + 1] = {
			countryId: 1,
			fill: color,
			r: i % 256,
			g: Math.floor(i / 256),
			b: 10,
			alpha: 1,
		};
		gradientLayer.fill(i + 1);
	}
	assert.equal(gradientLayer.gradientTextures.size, 512);
	gradientLayer.materials[513] = {
		countryId: 1,
		fill: "rgba(2,3,4,1)",
		r: 2,
		g: 3,
		b: 4,
		alpha: 1,
	};
	assert.equal(
		gradientLayer.fill(513).texture,
		undefined,
		"full live palette falls back to solid color",
	);
	assert.equal(gradientTexture.destroyed, false);
	gradientLayer.invalidateWorld();
	assert.ok(
		gradientLayer.fill(513).texture,
		"an unused palette slot can be reclaimed",
	);
	assert.equal(gradientLayer.gradientTextures.size, 512);
	assert.equal(
		gradientTexture.destroyed,
		true,
		"only an unreferenced LRU ramp is reclaimed",
	);
} finally {
	for (const entry of gradientLayer.gradientTextures.values())
		entry.destroy(true);
	gradientLayer.countries.destroy({ children: true });
	globalThis.document = previousDocument;
	globalThis.OffscreenCanvas = previousOffscreenCanvas;
}
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
let maskWidth = 1,
	maskHeight = 1;
const maskAllocations = [];
const coastCanvas = {
	get width() {
		return maskWidth;
	},
	set width(value) {
		maskWidth = value;
		maskAllocations.push(maskWidth * maskHeight);
	},
	get height() {
		return maskHeight;
	},
	set height(value) {
		maskHeight = value;
		maskAllocations.push(maskWidth * maskHeight);
	},
	getContext: () => coastContext,
};
let coastSize = { x: 960, y: 600 };
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
		getSize: () => coastSize,
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
maskAllocations.length = 0;
coastSize = { x: 600, y: 960 };
coastLayer.updateChunks(
	[],
	[],
	{ ...coastFrame, viewportKey: "second" },
	coastPath,
);
coastSize = { x: 960, y: 600 };
coastLayer.updateChunks(
	[],
	[],
	{ ...coastFrame, viewportKey: "second" },
	coastPath,
);
assert.equal(
	coastUpdates,
	4,
	"orientation changes invalidate the mask without a new viewport key",
);
assert.ok(
	Math.max(...maskAllocations) <= 2688 * 1968,
	"rotating a mask never allocates an intermediate square",
);
coastLayer.updateChunks([], [], coastFrame, null);
assert.equal(coastLayer.mask, undefined);
assert.equal(coastLayer.maskCanvas, undefined);
assert.equal(coastLayer.countries.mask ?? null, null);
coastLayer.countries.destroy();
// Pixi viewport dimensions use CSS pixels; resolution belongs to the source.
// Comparing them to device pixels would resize the renderer on every paint.
let viewportWidth = 960,
	viewportHeight = 600,
	resizes = 0;
let gpuWidth = 2688,
	gpuHeight = 1968;
const gpuAllocations = [];
const gpuCanvas = {
	style: {},
	get width() {
		return gpuWidth;
	},
	set width(value) {
		gpuWidth = value;
		gpuAllocations.push(gpuWidth * gpuHeight);
	},
	get height() {
		return gpuHeight;
	},
	set height(value) {
		gpuHeight = value;
		gpuAllocations.push(gpuWidth * gpuHeight);
	},
};
const viewportTexture = new Texture({
	source: new CanvasSource({
		resource: gpuCanvas,
		width: 1344,
		height: 984,
		resolution: 2,
	}),
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
	resize(width, height, resolution = this.resolution) {
		resizes++;
		this.resolution = resolution;
		viewportTexture.source.resize(width, height, resolution);
		this.screen.width = viewportTexture.frame.width;
		this.screen.height = viewportTexture.frame.height;
	},
};
Object.assign(coastLayer, {
	active: true,
	ready: true,
	frame: coastFrame,
	world: new Container(),
	markers: new Container(),
	markerPool: new Map(),
	canvas: gpuCanvas,
	markerCanvas: gpuCanvas,
	renderer: viewportRenderer,
	markerRenderer: viewportRenderer,
	map: {
		getZoom: () => 4,
		getSize: () => ({ x: viewportWidth, y: viewportHeight }),
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
coastLayer.frame = { ...coastFrame, dpr: 1.25 };
coastLayer.setCamera(false);
assert.equal(
	resizes,
	2,
	"DPR changes resize GPU targets even with unchanged CSS dimensions",
);
assert.equal(viewportRenderer.resolution, 1.25);
assert.equal(viewportTexture.source.pixelWidth, 1760);
coastLayer.setCamera(false);
assert.equal(resizes, 2, "the new resolution is retained");
gpuAllocations.length = 0;
viewportWidth = 600;
viewportHeight = 1024;
coastLayer.setCamera(false);
viewportWidth = 1024;
viewportHeight = 600;
coastLayer.setCamera(false);
assert.ok(
	Math.max(...gpuAllocations) <= 1760 * 1230,
	"GPU resize releases the old buffer before swapping axes",
);
// Exercise real Pixi rounding and its no-op resize with the production budget.
const { getRenderBudget } = await import("../src/render-budget.ts");
for (const [width, height, nativeDpr] of [
	[2246, 1199, 2],
	[390, 844, 3],
]) {
	viewportWidth = width;
	viewportHeight = height;
	const budget = getRenderBudget(width, height, nativeDpr);
	coastLayer.frame = {
		...coastFrame,
		dpr: budget.dpr,
		padding: budget.padding,
	};
	coastLayer.setCamera(false);
	const before = resizes;
	for (let i = 0; i < 10; i++) coastLayer.setCamera(false);
	assert.equal(
		resizes,
		before,
		"fractional DPR must not repeatedly resize Pixi",
	);
	assert.equal(
		gpuCanvas.width,
		Math.round((width + budget.padding * 2) * budget.dpr),
	);
	assert.equal(
		gpuCanvas.height,
		Math.round((height + budget.padding * 2) * budget.dpr),
	);
}
coastLayer.world.destroy();
coastLayer.markers.destroy();
viewportTexture.destroy(true);
// Device failures must fall back to Canvas instead of escaping to window.onerror.
let invalidated = 0;
let rendererDestroyed = 0;
const surface = () => ({ style: {}, removeEventListener() {}, remove() {} });
Object.assign(layer, {
	active: true,
	ready: true,
	renderer: {
		render() {
			throw new Error("simulated context failure");
		},
		destroy() {
			rendererDestroyed++;
		},
	},
	world: new Container(),
	markers: new Container(),
	scene: { clear() {} },
	gradientTextures: new Map(),
	visibleMarkers: new Set(),
	visibleFlagTextures: new Set(),
	markerPool: new Map(),
	canvas: surface(),
	markerCanvas: surface(),
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
assert.equal(
	rendererDestroyed,
	1,
	"fatal fallback releases GPU resources before Canvas takes over",
);
assert.equal(layer.renderer, undefined);
assert.doesNotThrow(() => layer.destroy(), "cleanup is idempotent");
layer.scene.prepare = () =>
	assert.fail("destroyed layer must not rebuild geometry");
layer.scene.clear = () =>
	assert.fail("destroyed layer invalidation is a no-op");
assert.doesNotThrow(() =>
	layer.updateChunks([chunk], [], coastFrame, coastPath),
);
assert.doesNotThrow(() => layer.invalidateWorld());
layer.setActive(true);
assert.equal(layer.active, false);
assert.equal(layer.frame, undefined);
assert.equal(layer.materials.length, 0);
// A lost context must opt in to browser restoration and leave the GPU path.
const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
globalThis.document = {
	createElement: () => ({ ...surface(), addEventListener() {} }),
};
globalThis.window = { devicePixelRatio: 1 };
console.warn = () => {};
let lostLayer;
const initialize = AtlasGpuLayer.prototype.initialize;
try {
	const fakeMap = {
		getContainer: () => ({ appendChild() {} }),
		getSize: () => ({ x: 8, y: 8 }),
	};
	const failedLayer = new AtlasGpuLayer(fakeMap, () => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(
		failedLayer.destroyed,
		true,
		"partial initialization releases the layer",
	);
	assert.equal(failedLayer.renderer, undefined);
	AtlasGpuLayer.prototype.initialize = async () => {};
	lostLayer = new AtlasGpuLayer(fakeMap, () => {});
} finally {
	AtlasGpuLayer.prototype.initialize = initialize;
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
// Exercise the real RetainedChunkScene disposer installed by the constructor.
lostLayer.frame = layer.frame;
lostLayer.materials = layer.materials;
const ownedGraphics = lostLayer.scene.get(chunk);
const ownedContext = ownedGraphics.context;
lostLayer.invalidateWorld();
assert.equal(ownedGraphics.destroyed, true);
assert.equal(
	ownedContext.destroyed,
	true,
	"world invalidation releases owned graphics contexts immediately",
);
assert.equal(ownedContext.instructions, null);

// Old scenario flag objects are not retained forever after their sprites leave.
const flagLayer = Object.create(AtlasGpuLayer.prototype);
const retainedFlags = Array.from({ length: 258 }, (_, id) => ({
	flag: { id },
	texture: new Texture({ source: new TextureSource({ width: 1, height: 1 }) }),
}));
Object.assign(flagLayer, {
	markerPool: new Map(),
	visibleMarkers: new Set(),
	visibleFlagTextures: new Set([retainedFlags[0].texture]),
	flagTextures: new Map(
		retainedFlags.map(({ flag, texture }) => [flag, { texture, stamp: "" }]),
	),
});
flagLayer.endMarkers();
assert.equal(flagLayer.flagTextures.size, 256);
assert.equal(
	retainedFlags[0].texture.destroyed,
	false,
	"visible flags stay alive",
);
assert.equal(retainedFlags[1].texture.destroyed, true);
assert.equal(retainedFlags[2].texture.destroyed, true);
for (const { texture } of flagLayer.flagTextures.values())
	texture.destroy(true);
graphics.destroy();
layer.countries.destroy();
console.log(
	"Actual Pixi geometry instructions and GPU failure recovery passed in Node; no GPU drawing",
);
