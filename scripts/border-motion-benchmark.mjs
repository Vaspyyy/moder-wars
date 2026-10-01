// Controlled CPU-only fixture: scattered captures maximize affected quads.
// Forced paints measure real geometry/command work, excluding adaptive skips.
// This mock Canvas benchmark does not measure browser compositing or FPS.
import {
	createBorderMotion,
	drawBorderMotion,
} from "../src/render-border-motion.js";
import { createPoliticalChunkCache } from "../src/render-political-cache.js";
const width = 96,
	height = 96,
	n = width * height;
let calls = 0;
const ctx = new Proxy(
	{},
	{
		get(target, key) {
			if (key in target) return target[key];
			return () => {
				calls++;
				if (key === "createPattern") return "texture";
				if (key === "createLinearGradient") return { addColorStop() {} };
			};
		},
	},
);
const frame = {
	isAtlas: true,
	isWar: true,
	isCustomTerrain: true,
	isEditing: false,
	viewMode: "POLITICAL",
	gridWidth: width,
	gridHeight: height,
	step: 1,
	currentZoom: 6,
	politicalStyleKey: "atlas-war",
	worldControlMap: new Uint16Array(n).fill(1),
	landMask: new Uint8Array(n).fill(2),
	dominantSideMap: new Int8Array(n),
	primaryOccupierMap: new Uint16Array(n).fill(1),
	sovereignSideMap: new Int8Array([-1, 0, 1]),
	countryMetadata: [
		{ id: 1, rgba: [180, 60, 50, 1] },
		{ id: 2, rgba: [50, 60, 180, 1] },
	],
	sideColors: ["rgba(180,60,50,1)", "rgba(50,60,180,1)"],
	biomeMask: new Uint8Array(n),
	terrain: new Float32Array(n),
	allianceViewEnabled: false,
	disableCountryGradient: true,
	CONFIG: { FRONTLINE_COLOR: "#fff", GRID_RES: 1 },
	viewBounds: {
		getWest: () => -180,
		getEast: () => -84,
		getSouth: () => -90,
		getNorth: () => 6,
	},
	xMin: 0,
	xMax: width - 1,
	yMin: 0,
	yMax: height - 1,
	dpr: 1,
	padding: 0,
	mapSize: { x: 1200, y: 900 },
	getGridPoint: (x, y) => ({ x: x * 10, y: y * 10 }),
};
for (const size of [64, 128, 512]) {
	const cache = createPoliticalChunkCache();
	cache.prepare(frame);
	const motion = createBorderMotion();
	const layer = {
		_politicalChunkCache: cache,
		_borderMotion: motion,
		_allControlTilesDirty: true,
		_dirtyControlTiles: new Set(),
		_borderMotionSurface: { width: 1200, height: 900, getContext: () => ctx },
		_atlasTexture: {},
	};
	for (let i = 0; i < size; i++) {
		const idx = (Math.floor(i / 30) * 3 + 2) * width + (i % 30) * 3 + 2;
		const old = cache.resolveMaterial(idx);
		const next = cache.resolveMaterial(idx, {
			worldControlMap: 1,
			landMask: 2,
			dominantSideMap: 1,
			primaryOccupierMap: 2,
		});
		motion.record(
			idx,
			{ material: old, side: 0, owner: 1 },
			{ material: next, side: 1, owner: 1 },
			0,
		);
		frame.dominantSideMap[idx] = 1;
		frame.primaryOccupierMap[idx] = 2;
	}
	frame.materialGeneration = cache.generation;
	for (let i = 0; i < 5; i++) drawBorderMotion(layer, frame, 90, true);
	calls = 0;
	const timings = [];
	for (let i = 0; i < 40; i++) {
		const start = performance.now();
		drawBorderMotion(layer, frame, 20 + i * 3, true);
		timings.push(performance.now() - start);
	}
	timings.sort((a, b) => a - b);
	console.log(
		JSON.stringify({
			cells: size,
			quads: motion.quads(width, height).size,
			mean: timings.reduce((a, b) => a + b) / timings.length,
			p95: timings[Math.floor(timings.length * 0.95)],
			canvasCalls: calls / 40,
			rebuiltChunks: cache.stats.built,
		}),
	);
	frame.dominantSideMap.fill(0);
	frame.primaryOccupierMap.fill(1);
}
