import assert from "node:assert/strict";
import "./register-types.mjs";
const { AtlasGpuLayer } = await import("../src/atlas-gpu.ts");
const { Container } = await import("pixi.js");
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
