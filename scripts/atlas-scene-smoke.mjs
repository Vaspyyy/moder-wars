import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./register-types.mjs";
const { RetainedChunkScene, buildChunkShapes } = await import(
	"../src/atlas-scene.ts"
);
const { drawPoliticalChunks } = await import(
	"../src/render-political-cache.js"
);
const b = readFileSync(
	new URL(
		"../assets/geodata/derived/ne_110m_admin_0_countries_0.15.mwr",
		import.meta.url,
	),
);
const v = new DataView(b.buffer, b.byteOffset, b.byteLength),
	width = v.getUint16(6, true),
	height = v.getUint16(8, true),
	n = v.getUint16(10, true),
	owners = new Uint16Array(width * height);
let at = 0;
for (let i = 16; i < b.length; i += 4) {
	const size = v.getUint16(i, true);
	owners.fill(v.getUint16(i + 2, true), at, at + size);
	at += size;
}
const frame = {
	gridWidth: width,
	gridHeight: height,
	step: 1,
	currentZoom: 3,
	worldControlMap: owners,
	landMask: Uint8Array.from(owners, (id) => (id ? 1 : 0)),
	biomeMask: new Uint8Array(owners.length),
	dominantSideMap: new Int8Array(owners.length).fill(-1),
	primaryOccupierMap: new Uint16Array(owners.length),
	sovereignSideMap: new Int8Array(n + 1).fill(-1),
	countryMetadata: Array.from({ length: n }, (_, i) => ({
		id: i + 1,
		rgba: [
			70 + ((i * 37) % 160),
			70 + ((i * 71) % 160),
			70 + ((i * 53) % 160),
			1,
		],
	})),
	sideColors: [],
	isWar: false,
	isAtlas: true,
	isSimplifiedMode: true,
	useSimplifiedBase: true,
	atlasCoast: true,
	viewMode: "POLITICAL",
	allianceViewEnabled: false,
	mountainsEnabled: false,
	disableCountryGradient: true,
	politicalStyleKey: "atlas",
	xMin: 0,
	xMax: width - 1,
	yMin: 0,
	yMax: height - 1,
	CONFIG: { GRID_RES: 0.15 },
	staticLoopXMin: 0,
	staticLoopYMin: 0,
	ctx: {
		beginPath() {},
		fill() {},
		rect() {},
		moveTo() {},
		lineTo() {},
		closePath() {},
	},
	getGridPoint: (x, y) => ({ x, y }),
};
const scene = new RetainedChunkScene(
	(chunk) => buildChunkShapes(chunk, 0.15),
	() => {},
);
let chunks = [];
const layer = {
	_gpu: {
		active: true,
		updateChunks(next) {
			chunks = next;
			scene.prepare("atlas");
			for (const chunk of chunks) scene.get(chunk);
		},
	},
};
const started = performance.now();
drawPoliticalChunks(layer, frame);
const cold = performance.now() - started,
	built = scene.stats.built;
assert.equal(built, 2850);
const start = performance.now();
for (let i = 0; i < 10; i++)
	drawPoliticalChunks(layer, { ...frame, currentZoom: 4 + i / 10 });
const warm = (performance.now() - start) / 10;
assert.equal(
	scene.stats.built,
	built,
	"camera changes must not rebuild GPU geometry",
);
assert.equal(scene.stats.reused, 28500);
assert.ok(
	chunks.every((chunk) =>
		scene.get(chunk).every((shape) => shape.points.every(Number.isFinite)),
	),
);
const before = scene.stats.built;
layer._politicalChunkCache.invalidateCells([1200000], width, height);
drawPoliticalChunks(layer, frame);
assert.ok(
	scene.stats.built > before && scene.stats.built - before <= 9,
	"ownership changes rebuild neighboring chunks only",
);
scene.prepare("new-colors");
assert.ok(scene.stats.destroyed > 0);
scene.clear();
console.log(
	JSON.stringify({
		scope: "Node retained world geometry and CPU preparation; no GPU/FPS",
		chunks: built,
		coldGeometryMs: cold,
		warmScenePreparationMs: warm,
	}),
);
