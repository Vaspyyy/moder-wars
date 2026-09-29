import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const source = readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8");
const start = source.indexOf("function intersectsControlPaintTiles(");
const end = source.indexOf("const CONTROL_DIRTY_TILE_LIMIT", start);
const context = vm.createContext({ CONTROL_DIRTY_TILE_SIZE: 32 });
vm.runInContext(source.slice(start, end), context);
const intersects = context.intersectsControlPaintTiles;
const tileColumns = 4;
const dirty = new Set([5, 6, 14]);
const rects = [...dirty].map((key) => ({
	x0: (key % tileColumns) * 32 - 1,
	x1: (key % tileColumns + 1) * 32 + 1,
	y0: Math.floor(key / tileColumns) * 32 - 1,
	y1: (Math.floor(key / tileColumns) + 1) * 32 + 1,
}));
const cleared = (x, y) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
let canvasFactory;
if (process.env.MW_CANVAS_MODULE) {
	canvasFactory = createRequire(import.meta.url)(process.env.MW_CANVAS_MODULE).createCanvas;
}
for (const step of [1, 2, 4]) {
	for (const origin of [0, 1, 3, 29, 33]) {
		const coverage = new Uint8Array(128 * 128);
		const oldCoverage = new Uint8Array(128 * 128);
		const canvas = canvasFactory?.(512, 512);
		const ctx = canvas?.getContext("2d");
		if (ctx) {
			ctx.fillStyle = "#395cbb";
			ctx.fillRect(0, 0, 512, 512);
			ctx.save();
			ctx.scale(4, 4);
			ctx.beginPath();
			for (const r of rects) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
			ctx.clip();
			ctx.clearRect(0, 0, 128, 128);
			ctx.fillStyle = "#395cbb";
		}
		for (let y = origin; y < 128; y += step) {
			for (let x = origin; x < 128; x += step) {
				const paint = intersects(x, y, step, tileColumns, dirty);
				const oldPaint = dirty.has(Math.floor(y / 32) * tileColumns + Math.floor(x / 32));
				if (paint) ctx?.fillRect(x, y, step, step);
				for (let py = y; py < Math.min(128, y + step); py++) {
					for (let px = x; px < Math.min(128, x + step); px++) {
						if (paint) coverage[py * 128 + px] = 1;
						if (oldPaint) oldCoverage[py * 128 + px] = 1;
					}
				}
			}
		}
		let oldHoles = 0;
		for (let y = origin; y < 128; y++) {
			for (let x = origin; x < 128; x++) {
				if (!cleared(x, y)) continue;
				assert.equal(coverage[y * 128 + x], 1, `cleared cell ${x},${y} must be repainted at step ${step}, origin ${origin}`);
				if (!oldCoverage[y * 128 + x]) oldHoles++;
			}
		}
		assert.ok(oldHoles > 0, "fixture reproduces missing strips with the previous tile-only filter");
		if (ctx) {
			ctx.restore();
			const pixels = ctx.getImageData(0, 0, 512, 512).data;
			for (let y = origin; y < 128; y++) {
				for (let x = origin; x < 128; x++) {
					if (cleared(x, y)) assert.equal(pixels[((y * 4 + 2) * 512 + x * 4 + 2) * 4 + 3], 255);
				}
			}
		}
	}
}
assert.equal(intersects(10, 10, 1, tileColumns, dirty), false, "unrelated terrain stays cached");
console.log("Political redraw smoke tests passed");
