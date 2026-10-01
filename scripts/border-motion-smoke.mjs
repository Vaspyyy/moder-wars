import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { weightedBorderQuad } from "../src/border-geometry.js";
import {
	drawAtlasOcean,
	drawAtlasTexture,
	atlasQuad,
} from "../src/render-atlas.js";
import {
	BORDER_MOTION,
	createBorderMotion,
	captureBorderMotion,
	drawBorderMotion,
	createBorderProjector,
} from "../src/render-border-motion.js";
import {
	createPoliticalChunkCache,
	drawPoliticalChunks,
	drawPoliticalBorders,
} from "../src/render-political-cache.js";
import { applyControlDeltas } from "../src/simulation-protocol.js";

const area = (points) =>
	Math.abs(
		points.reduce((sum, a, i) => {
			const b = points[(i + 1) % points.length];
			return sum + a[0] * b[1] - b[0] * a[1];
		}, 0),
	) / 2;
const inside = ([x, y], points) => {
	let result = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i],
			b = points[j];
		if (
			a[1] > y !== b[1] > y &&
			x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
		)
			result = !result;
	}
	return result;
};
const one = (id) => new Map([[id, 1]]);
// All 256 static junctions agree with the existing atlas at both endpoints.
for (let pattern = 0; pattern < 256; pattern++) {
	const labels = Array.from({ length: 4 }, (_, i) => (pattern >> (i * 2)) & 3),
		expected = atlasQuad(labels, 0, 0),
		actual = weightedBorderQuad(labels.map(one), 0, 0);
	assert.ok(
		Math.abs(actual.polygons.reduce((sum, p) => sum + area(p.points), 0) - 1) <
			1e-8,
	);
	for (let y = 0; y < 7; y++)
		for (let x = 0; x < 7; x++) {
			const p = [(x + 0.317) / 7, (y + 0.619) / 7],
				a = actual.polygons.filter((poly) => inside(p, poly.points)),
				b = expected.polygons.find((poly) => inside(p, poly.points));
			assert.equal(a.length, 1, "no holes or overlapping fills");
			assert.equal(
				a[0].id,
				b.id,
				"no endpoint pop against cached atlas geometry",
			);
		}
}
// Intermediate multi-country fields also partition exactly and stay in bounds.
for (let t = 0; t <= 1; t += 0.05) {
	const mesh = weightedBorderQuad(
		[
			new Map([
				[0, 1 - t],
				[1, t],
			]),
			one(1),
			one(2),
			new Map([
				[2, t],
				[3, 1 - t],
			]),
		],
		0,
		0,
	);
	assert.ok(
		Math.abs(mesh.polygons.reduce((sum, p) => sum + area(p.points), 0) - 1) <
			1e-7,
	);
	assert.ok(
		mesh.polygons.every((p) =>
			p.points.every(
				([x, y]) => x >= -1e-8 && x <= 1 + 1e-8 && y >= -1e-8 && y <= 1 + 1e-8,
			),
		),
	);
}
// Fractional vertices use two Mercator anchors instead of per-vertex GIS calls.
let projections = 0;
const mercator = (lat, lng) => ({
	x: 25 + ((lng + 180) / 360) * 1024,
	y:
		300 -
		(1024 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
			(2 * Math.PI),
});
const projector = createBorderProjector({
	CONFIG: { GRID_RES: 1 },
	project: (lat, lng) => {
		projections++;
		return mercator(lat, lng);
	},
});
for (const [x, y] of [
	[0, 90],
	[180.125, 130.375],
	[359.8, 5],
	[45.375, 175],
	[0, 0],
	[0, 180],
]) {
	const actual = projector(x, y),
		expected = mercator(
			Math.max(-85.05112878, Math.min(85.05112878, y - 90)),
			x - 180,
		);
	assert.ok(
		Math.abs(actual.x - expected.x) < 1e-8 &&
			Math.abs(actual.y - expected.y) < 1e-8,
	);
}
assert.equal(
	projections,
	2,
	"all fractional vertices reuse two camera anchors",
);

const motion = createBorderMotion(),
	before = { material: 1, side: 0, owner: 1 },
	after = { material: 2, side: 1, owner: 1 };
motion.record(5, before, after, 0);
assert.deepEqual(motion.sample(5, 2, 0, "material"), one(1));
const middle = motion.sample(5, 2, BORDER_MOTION.DURATION_MS / 2, "material");
assert.equal(middle.get(1), 0.5);
assert.equal(middle.get(2), 0.5);
motion.record(5, after, before, BORDER_MOTION.DURATION_MS / 2);
assert.deepEqual(
	motion.sample(5, 1, BORDER_MOTION.DURATION_MS / 2, "material"),
	middle,
	"retargeting starts at current display, without jumping",
);
motion.settle(400, () => false);
assert.equal(motion.size, 1, "do not reveal an outdated static surface");
motion.settle(400);
assert.equal(motion.size, 0);
for (let i = 0; i < 800; i++) motion.record(i, before, after, 0);
assert.equal(motion.size, BORDER_MOTION.MAX_CELLS);
assert.ok(motion.quads(40, 30).size <= BORDER_MOTION.MAX_CELLS * 4);
motion.clear();
// A moving vertical front travels through fractional positions, never crossfades.
const travel = createBorderMotion();
travel.record(1, before, after, 0);
travel.record(4, before, after, 0);
const positions = [];
for (const time of [0, 30, 60, 90, 120, 150, 180]) {
	const edges = [];
	for (let x = 0; x < 2; x++) {
		const nodes = [x, x + 1, x + 4, x + 3],
			samples = nodes.map((i) =>
				travel.sample(i, i % 3 === 2 ? 1 : 0, time, "side"),
			);
		edges.push(...weightedBorderQuad(samples, x, 0).borders);
	}
	assert.ok(edges.length > 0);
	positions.push(
		edges.reduce((sum, e) => sum + e.from[0] + e.to[0], 0) / (edges.length * 2),
	);
}
assert.ok(
	positions.every((value, i) => !i || value <= positions[i - 1] + 1e-8),
);
assert.ok(positions.some((value) => value !== Math.round(value * 2) / 2));

const frame = {
	isAtlas: true,
	isWar: true,
	isCustomTerrain: true,
	isEditing: false,
	viewMode: "POLITICAL",
	gridWidth: 4,
	gridHeight: 4,
	step: 1,
	currentZoom: 6,
	politicalStyleKey: "atlas-war",
	worldControlMap: new Uint16Array(16).fill(1),
	landMask: new Uint8Array(16).fill(2),
	dominantSideMap: new Int8Array(16),
	primaryOccupierMap: new Uint16Array(16).fill(1),
	sovereignSideMap: new Int8Array([-1, 0, 1]),
	countryMetadata: [
		{ id: 1, rgba: [180, 60, 50, 1] },
		{ id: 2, rgba: [50, 60, 180, 1] },
	],
	sideColors: ["rgba(180,60,50,1)", "rgba(50,60,180,1)"],
	biomeMask: new Uint8Array(16),
	terrain: new Float32Array(16),
	allianceViewEnabled: false,
	disableCountryGradient: true,
	CONFIG: { FRONTLINE_COLOR: "#fff", GRID_RES: 1 },
	viewBounds: {
		getWest: () => -180,
		getEast: () => -176,
		getSouth: () => -90,
		getNorth: () => -86,
	},
	xMin: 0,
	xMax: 3,
	yMin: 0,
	yMax: 3,
	dpr: 1,
	padding: 0,
	mapSize: { x: 100, y: 100 },
	getGridPoint: (x, y) => ({ x: x * 10, y: y * 10 }),
};
const cache = createPoliticalChunkCache();
cache.prepare(frame);
cache.get(frame, 0, 0);
const trace = [];
const ctx = new Proxy(
	{},
	{
		get(target, key) {
			if (key in target) return target[key];
			return (...args) => {
				trace.push([key, ...args]);
				if (key === "createPattern") return "texture";
				if (key === "createLinearGradient") return { addColorStop() {} };
			};
		},
	},
);
const layer = {
	_politicalChunkCache: cache,
	_borderMotion: createBorderMotion(),
	_borderMotionFrame: { ...frame, materialGeneration: cache.generation },
	_allControlTilesDirty: false,
	_dirtyControlTiles: new Set([0]),
	_borderMotionSurface: { width: 100, height: 100, getContext: () => ctx },
	_atlasTexture: {},
};
let notification = 0;
const runtime = {
	...frame,
	influenceLayer: {
		beginControlTileTransition: (tiles) => captureBorderMotion(layer, tiles, 0),
		notifyControlTilesChanged: () => notification++,
	},
};
const tiles = [
	{
		key: 0,
		x: 1,
		y: 1,
		width: 1,
		height: 1,
		dominantSideMap: new Int8Array([1]),
		primaryOccupierMap: new Uint16Array([2]),
		worldControlMap: new Uint16Array([1]),
		landMask: new Uint8Array([2]),
	},
];
const original = frame.dominantSideMap.slice();
captureBorderMotion(layer, tiles, 0);
assert.deepEqual(
	frame.dominantSideMap,
	original,
	"presentation cannot alter simulation ownership",
);
layer._borderMotion.clear();
applyControlDeltas(runtime, tiles);
assert.equal(
	frame.dominantSideMap[5],
	1,
	"authoritative ownership changes immediately",
);
assert.equal(notification, 1);
assert.equal(
	layer._borderMotion.size,
	1,
	"capture previous state before applying the snapshot",
);
const builds = cache.stats.built;
drawBorderMotion(layer, layer._borderMotionFrame, 0);
let paintCalls = trace.length;
drawBorderMotion(layer, layer._borderMotionFrame, 1);
assert.equal(
	trace.length,
	paintCalls,
	"skipped animation frames preserve the current surface",
);
layer._borderMotionPaintCost = 100;
drawBorderMotion(layer, layer._borderMotionFrame, 20);
assert.equal(
	trace.length,
	paintCalls,
	"expensive updates reduce redraw frequency",
);
drawBorderMotion(layer, layer._borderMotionFrame, 20, true);
assert.ok(
	trace.length > paintCalls,
	"static/capture repaints always refresh the overlay",
);
for (const time of [0, 30, 60, 90, 120, 150, 180])
	drawBorderMotion(layer, layer._borderMotionFrame, time);
assert.equal(
	cache.stats.built,
	builds,
	"animation never rebuilds static world chunks",
);
assert.ok(trace.some(([method]) => method === "fill"));
assert.ok(trace.some(([method]) => method === "stroke"));
drawBorderMotion(layer, layer._borderMotionFrame, 180, true);
paintCalls = trace.length;
drawBorderMotion(layer, layer._borderMotionFrame, 200);
assert.equal(
	trace.length,
	paintCalls,
	"completed geometry is reused while awaiting its static repaint",
);
layer._dirtyControlTiles.clear();
drawBorderMotion(layer, layer._borderMotionFrame, 200);
assert.equal(layer._borderMotion.size, 0);
// Optional native Canvas check exercises real fill/clip/stroke pixels, without
// evaluating the application, launching a browser, or running the simulation.
if (process.env.MW_CANVAS_MODULE) {
	const { createCanvas } = await import(
		pathToFileURL(process.env.MW_CANVAS_MODULE)
	);
	for (const coastal of [false, true]) {
		const fixture = {
			...frame,
			staticLoopXMin: 0,
			staticLoopYMin: 0,
			worldControlMap: frame.worldControlMap.slice(),
			landMask: frame.landMask.slice(),
			dominantSideMap: new Int8Array(16),
			primaryOccupierMap: new Uint16Array(16).fill(1),
			createSurface: () => createCanvas(64, 64),
		};
		if (coastal) {
			fixture.landMask[6] = 0;
			fixture.worldControlMap[6] = 0;
			fixture.dominantSideMap[6] = -1;
		}
		const palette = createPoliticalChunkCache();
		palette.prepare(fixture);
		const surface = createCanvas(100, 100),
			visual = {
				_politicalChunkCache: palette,
				_borderMotion: createBorderMotion(),
				_borderMotionFrame: {
					...fixture,
					materialGeneration: palette.generation,
				},
				_borderMotionSurface: surface,
				_allControlTilesDirty: true,
				_dirtyControlTiles: new Set([0]),
			};
		const paintStatic = () => {
			const output = createCanvas(100, 100),
				ctx = output.getContext("2d"),
				state = { ...fixture, ctx },
				owner = {};
			drawAtlasOcean(
				ctx,
				{ getSize: () => state.mapSize, getZoom: () => state.currentZoom },
				(lat, lng) => state.getGridPoint(lng + 180, lat + 90),
				0,
				state.viewBounds,
			);
			drawPoliticalChunks(owner, state);
			drawAtlasTexture(owner, state);
			drawPoliticalBorders(owner, state);
			return output;
		};
		const oldStatic = paintStatic();
		captureBorderMotion(visual, tiles, 0);
		fixture.dominantSideMap[5] = 1;
		fixture.primaryOccupierMap[5] = 2;
		const newStatic = paintStatic();
		for (const [time, expected] of [
			[0, oldStatic],
			[180, newStatic],
		]) {
			drawBorderMotion(visual, visual._borderMotionFrame, time, true);
			for (const [x, y] of [
				[8, 8],
				[15, 15],
				[21, 21],
				[23, 8],
			]) {
				const actual = surface.getContext("2d").getImageData(x, y, 1, 1).data,
					wanted = expected.getContext("2d").getImageData(x, y, 1, 1).data;
				assert.ok(
					actual.every((value, i) => Math.abs(value - wanted[i]) <= 2),
					"animated endpoints reproduce static fill pixels, including coastal water",
				);
			}
		}
		drawBorderMotion(visual, visual._borderMotionFrame, 90, true);
		assert.notDeepEqual(
			surface.getContext("2d").getImageData(14, 14, 3, 3).data,
			newStatic.getContext("2d").getImageData(14, 14, 3, 3).data,
			"midpoint really draws intermediate geometry",
		);
	}
	console.log(
		"Native Canvas border endpoints, coastal water and intermediate pixels passed",
	);
}
console.log(
	"Border motion: exact atlas endpoints, gap-free junctions, fractional advancing edges, continuous retargeting, bounded work, snapshot ordering and unchanged ownership/chunk caches passed",
);
