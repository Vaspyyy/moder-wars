import assert from "node:assert/strict";
import "./register-types.mjs";
const { AtlasGpuLayer } = await import("../src/atlas-gpu.ts");
const { Container, Texture, TextureSource } = await import("pixi.js");
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
graphics.destroy();
layer.countries.destroy();
console.log(
	"Actual Pixi geometry instructions and GPU failure recovery passed in Node; no GPU drawing",
);
