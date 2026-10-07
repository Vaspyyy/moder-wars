import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
	armyPocketClosed,
	findArmyDoubleEnvelopment,
} from "../src/army-encirclement.js";
import {
	enemyLineShare,
	findDefensiveLine,
	isSideInCapitalShock,
} from "../src/defensive-lines.js";
import {
	findEncirclementPockets,
	pocketCellLookup,
} from "../src/encirclement-pockets.js";
import { decodeRiverLines, rasterizeRiverMask } from "../src/river-lines.js";
import { createSimulationCore } from "../src/simulation-core.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

// Rivers: the packed asset decodes and rasterizes onto the real Earth grid.
{
	const lines = decodeRiverLines(
		gunzipSync(
			readFileSync(
				new URL("../assets/geodata/derived/rivers-50m.bin.gz", import.meta.url),
			),
		).buffer,
	);
	assert.ok(lines.length > 300, "major rivers are present");
	const gridRes = 0.25;
	const gridWidth = 360 / gridRes;
	const gridHeight = 180 / gridRes;
	const mask = rasterizeRiverMask(lines, { gridWidth, gridHeight, gridRes });
	const at = (lat, lng) =>
		mask[
			Math.floor((lat + 90) / gridRes) * gridWidth +
				Math.floor((lng + 180) / gridRes)
		];
	// The Danube at Budapest and the Dnieper at Kyiv lie on river lines.
	assert.equal(at(47.5, 19.05), 1, "Danube at Budapest");
	assert.equal(at(50.45, 30.55), 1, "Dnieper at Kyiv");
	assert.equal(at(25, 15), 0, "no river in the central Sahara");
	const sea = new Uint8Array(gridWidth * gridHeight);
	assert.equal(
		rasterizeRiverMask(lines, {
			gridWidth,
			gridHeight,
			gridRes,
			landMask: sea,
		}).some(Boolean),
		false,
		"sea cells never hold a river line",
	);
	assert.equal(
		rasterizeRiverMask(lines, { gridWidth: 100, gridHeight: 50, gridRes }),
		null,
		"resized worlds get no Earth rivers",
	);
}

// Pockets: a ring of hostile land seals a pocket; a gap to the sea opens it.
{
	const W = 9;
	const H = 7;
	const landMask = new Uint8Array(W * H).fill(2);
	const dominantSideMap = new Int8Array(W * H).fill(1);
	const worldControlMap = new Uint16Array(W * H).fill(2);
	for (let y = 2; y <= 4; y++)
		for (let x = 3; x <= 5; x++) dominantSideMap[y * W + x] = 0;
	const frame = {
		units: [{ lat: 3.5, lng: 4.5, sideIndex: 0, health: 1 }],
		sides: [[{ id: 1 }], [{ id: 2 }]],
		landMask,
		dominantSideMap,
		worldControlMap,
		gridWidth: W,
		gridHeight: H,
		getGridIndex: (lat, lng) => Math.floor(lat) * W + Math.floor(lng),
		areSidesHostile: (a, b) => a !== b,
	};
	const [pocket] = findEncirclementPockets(frame);
	assert.equal(pocket?.sideIndex, 0);
	assert.equal(pocket.cells.length, 9, "the whole 3x3 pocket is found");
	// Opening one side to the sea frees the pocket.
	landMask[3 * W + 6] = 0;
	assert.deepEqual(findEncirclementPockets(frame), []);
	landMask[3 * W + 6] = 2;
	// Land of the pocket's own side outside the war zone is a way home.
	landMask[3 * W + 6] = 1;
	worldControlMap[3 * W + 6] = 1;
	assert.deepEqual(findEncirclementPockets(frame), []);
	// Hostile land outside the war zone still closes the ring.
	worldControlMap[3 * W + 6] = 2;
	assert.equal(findEncirclementPockets(frame).length, 1);
}

// Pockets know where to break out to and where a relief force should strike.
{
	const W = 12;
	const H = 7;
	const landMask = new Uint8Array(W * H).fill(2);
	const dominantSideMap = new Int8Array(W * H).fill(1);
	for (let y = 2; y <= 4; y++)
		for (let x = 2; x <= 4; x++) dominantSideMap[y * W + x] = 0;
	// Friendly land beyond the ring, to the east.
	for (let y = 0; y < H; y++) dominantSideMap[y * W + 10] = 0;
	const [pocket] = findEncirclementPockets({
		units: [{ lat: 3.5, lng: 3.5, sideIndex: 0, health: 1 }],
		sides: [[{ id: 1 }], [{ id: 2 }]],
		landMask,
		dominantSideMap,
		worldControlMap: new Uint16Array(W * H).fill(2),
		gridWidth: W,
		gridHeight: H,
		getGridIndex: (lat, lng) => Math.floor(lat) * W + Math.floor(lng),
		areSidesHostile: (a, b) => a !== b,
		CONFIG: { GRID_RES: 1 },
	});
	// Cell centres sit on half degrees from -90/-180.
	assert.deepEqual(pocket.escape, { lat: 3.5 - 90, lng: 10.5 - 180 });
	assert.deepEqual(pocket.edge, { lat: 3.5 - 90, lng: 4.5 - 180 });
	assert.equal(pocketCellLookup([pocket]).get(3 * W + 3), pocket);
}

// A small fixture world: side 0 holds the west half, side 1 the east.
function lineWorld(width = 40, height = 40, res = 0.25) {
	const n = width * height;
	const dominantSideMap = new Int8Array(n);
	for (let i = 0; i < n; i++) dominantSideMap[i] = i % width < 20 ? 0 : 1;
	return {
		CONFIG: { GRID_RES: res },
		gridWidth: width,
		gridHeight: height,
		landMask: new Uint8Array(n).fill(2),
		dominantSideMap,
		riverMask: new Uint8Array(n),
		terrainMask: new Float32Array(n),
		mountainsEnabled: true,
		units: [],
		sides: [[{ id: 1 }], [{ id: 2 }]],
		_simTickCount: 0,
		areSidesHostile: (a, b) => a >= 0 && b >= 0 && a !== b,
		getGridIndex(lat, lng) {
			const r = Math.floor((lat + 90) / res),
				c = Math.floor((lng + 180) / res);
			return r >= 0 && r < height && c >= 0 && c < width ? r * width + c : -1;
		},
		point: (r, c) => ({ lat: (r + 0.5) * res - 90, lng: (c + 0.5) * res - 180 }),
	};
}

// The nearest friendly river or mountain line is found; enemy-held lines are not.
{
	const world = lineWorld();
	const front = world.point(20, 19);
	assert.equal(findDefensiveLine(world, 0, front, 3), null);
	for (let r = 0; r < 40; r++) world.riverMask[r * 40 + 12] = 1;
	for (let r = 0; r < 40; r++) world.riverMask[r * 40 + 25] = 1;
	const line = findDefensiveLine(world, 0, front, 3);
	assert.deepEqual(
		{ lat: line.lat, lng: line.lng },
		world.point(20, 12),
		"falls back west to its own river, not east to the enemy's",
	);
	assert.equal(findDefensiveLine(world, 0, front, 1), null, "too far back");
	world.terrainMask[20 * 40 + 17] = 0.8;
	assert.deepEqual(
		(({ lat, lng }) => ({ lat, lng }))(findDefensiveLine(world, 0, front, 3)),
		world.point(20, 17),
		"mountains count as a line",
	);
	world.mountainsEnabled = false;
	assert.deepEqual(
		(({ lat, lng }) => ({ lat, lng }))(findDefensiveLine(world, 0, front, 3)),
		world.point(20, 12),
	);
}

// Capital shock lasts six seconds at 1x; dug-in enemies are measured by power.
{
	const world = lineWorld();
	world._capitalFallTick = new Map([[2, 100]]);
	world._simTickCount = 300;
	assert.equal(isSideInCapitalShock(world, 1), true);
	assert.equal(isSideInCapitalShock(world, 0), false);
	world._simTickCount = 460;
	assert.equal(isSideInCapitalShock(world, 1), false);
	const enemy = (lat, lng, health, lineDefense) => ({
		lat,
		lng,
		health,
		lineDefense,
		sideIndex: 1,
	});
	world._tickUnitsBySide = [
		[],
		[enemy(0, 0, 60, 0.6), enemy(0, 1, 40, 1), enemy(0, 20, 100, 0.6)],
	];
	assert.equal(enemyLineShare(world, 0, { lat: 0, lng: 0 }), 0.6);
	assert.equal(enemyLineShare(world, 1, { lat: 0, lng: 0 }), 0);
}

// A straight front with no salient still yields a two-pronged envelopment that
// cuts off enemy formations; taking the closure seals it.
{
	const world = lineWorld();
	const front = [];
	for (let r = 4; r < 36; r++) front.push(world.point(r, 19.5));
	assert.equal(
		findArmyDoubleEnvelopment(world, 0, front),
		null,
		"no enemy formations to trap",
	);
	world.units.push({ ...world.point(20, 21), health: 100, sideIndex: 1 });
	const operation = findArmyDoubleEnvelopment(world, 0, front);
	assert.ok(operation, "envelop the enemy line");
	assert.equal(operation.trapped, 1);
	assert.ok(operation.pocketCells.includes(20 * 40 + 21));
	for (const point of operation.shoulders)
		assert.equal(world.dominantSideMap[world.getGridIndex(point.lat, point.lng)], 0);
	assert.equal(armyPocketClosed(world, 0, operation), false);
	for (const cell of operation.closureCells) world.dominantSideMap[cell] = 0;
	assert.equal(armyPocketClosed(world, 0, operation), true);
	world.dominantSideMap[operation.closureCells[0]] = 1;
	assert.equal(armyPocketClosed(world, 0, operation), false, "reopened");
	for (const cell of [...operation.closureCells, ...operation.pocketCells])
		world.dominantSideMap[cell] = 0;
	assert.equal(armyPocketClosed(world, 0, operation), true, "pocket cleared");
}

// Defensive lines scale damage taken by the defender; peace offers use ticks.
{
	const core = createSimulationCore(createTinySimulationState({ paused: true }));
	const { state } = core;
	const attacker = { kind: "navy" };
	assert.equal(state.formationDamage(10, attacker, { lineDefense: 0.6 }), 6);
	assert.equal(state.formationDamage(10, attacker, {}), 10);
	assert.equal(state.formationDamage(10, attacker), 10);
	state._simTickCount = 1234;
	state.showTreatyOffer(0, false);
	assert.equal(state.lastTreatyTick, 1234, "offers record the simulation tick");
	assert.equal(state.isTreatyNoticeVisible(), true);
}

console.log("war features smoke passed");
