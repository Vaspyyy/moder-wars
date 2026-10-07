import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { findEncirclementPockets } from "../src/encirclement-pockets.js";
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
