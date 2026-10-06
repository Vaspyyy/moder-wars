import assert from "node:assert/strict";
import { createConflictDiplomacy } from "../src/conflict-diplomacy.js";
import { createConflictResolution } from "../src/conflict-resolution.js";

// Separate peace and treaty borders on a tiny grid. Ids: 1 withdraws (side 0),
// 2 is its opponent (side 1), 4 is 1's ally, 3 and 5 are neutral bystanders.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
globalThis.alert ??= (message) => {
	throw new Error(message);
};

const W = 12;
const H = 8;
function createRuntime() {
	const length = W * H;
	const worldControlMap = new Uint16Array(length);
	const landMask = new Uint8Array(length).fill(1);
	const primaryOccupierMap = new Uint16Array(length);
	const dominantSideMap = new Int8Array(length).fill(-1);
	const occupationMap = new Float32Array(length);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			// Columns 0-2 belong to 1, 3-5 to 2, 6-7 to 4, 8-11 to neutral 5.
			worldControlMap[i] = x < 3 ? 1 : x < 6 ? 2 : x < 8 ? 4 : 5;
		}
	// A one-cell neutral enclave that a whole-world majority filter would erase.
	worldControlMap[3 * W + 9] = 3;
	// The war zone: 1's border column, 2's border column, and 4's land.
	for (let y = 0; y < H; y++) {
		for (const x of [2, 3, 6]) {
			const i = y * W + x;
			landMask[i] = 2;
			occupationMap[i] = 0.5;
		}
	}
	// 2 occupies the top half of 1's border column; 1 holds the rest.
	for (let y = 0; y < H; y++) {
		const i = y * W + 2;
		dominantSideMap[i] = y < 4 ? 1 : 0;
		primaryOccupierMap[i] = y < 4 ? 2 : 0;
	}
	// 1 occupies the bottom half of 2's border column.
	for (let y = 4; y < H; y++) {
		const i = y * W + 3;
		dominantSideMap[i] = 0;
		primaryOccupierMap[i] = 1;
	}
	const calls = [];
	const runtime = {
		CONFIG: { GRID_RES: 1 },
		gridWidth: W,
		gridHeight: H,
		worldControlMap,
		landMask,
		primaryOccupierMap,
		dominantSideMap,
		occupationMap,
		deJureMap: new Uint16Array(worldControlMap),
		sides: [
			[
				{ id: 1, name: "One" },
				{ id: 4, name: "Four" },
			],
			[{ id: 2, name: "Two" }],
		],
		units: [
			{ id: 1, sovereignId: 1, beneficiaryId: 1, sideIndex: 0 },
			{ id: 2, sovereignId: 2, beneficiaryId: 2, sideIndex: 1 },
			{ id: 3, sovereignId: 4, beneficiaryId: 4, sideIndex: 0 },
		],
		countryMetadata: [1, 2, 3, 4, 5].map((id) => ({ id })),
		statusText: {},
		influenceLayer: { render() {} },
		gameState: "PEACE_SELECT_2",
		clearCellInfluence(i) {
			occupationMap[i] = 0;
			dominantSideMap[i] = -1;
		},
		releaseCountryPersonnelFromSide: (...args) =>
			calls.push(["release", ...args]),
		removeCountryFormations(countryId) {
			runtime.units = runtime.units.filter((u) => u.sovereignId !== countryId);
		},
		generateProvinces() {},
		recalculateAllBounds() {},
		updateSidesUI() {},
		reconcileOperationalAiLifecycle() {},
		playPeaceSound() {},
		applyTreaty: (...args) => calls.push(["applyTreaty", ...args]),
		areSidesHostile: (a, b) => a !== b,
		invalidateWarLifecycleTimers() {},
		selectMajorityOwnerTransfers: () => new Map(),
	};
	return { runtime, calls };
}

{
	const { runtime, calls } = createRuntime();
	const before = new Uint16Array(runtime.worldControlMap);
	const diplomacy = createConflictDiplomacy(runtime);
	// The UI picks the withdrawing nation first; the call takes (opponent, withdrawing).
	diplomacy._signSelectivePeace({ id: 2 }, { id: 1, name: "One" });

	assert.deepEqual(
		runtime.sides.map((side) => side.map((c) => c.id)),
		[[4], [2]],
		"the nation that asked for peace leaves its side; its opponent stays",
	);
	assert.deepEqual(calls[0], ["release", 1, 0]);
	assert.equal(
		calls.some(([name]) => name === "applyTreaty"),
		false,
		"the war continues while 4 still fights 2",
	);
	assert.equal(runtime.gameState, "SIMULATING");
	assert.equal(
		runtime.units.some((u) => u.sovereignId === 1),
		false,
	);
	for (let y = 0; y < H; y++) {
		const i = y * W + 2;
		assert.equal(runtime.landMask[i], 1, "1's land leaves the war zone");
		// Rows 3 and 4 sit on the new border, where smoothing may move them.
		if (y === 3 || y === 4) continue;
		assert.equal(
			runtime.worldControlMap[i],
			y < 3 ? 2 : 1,
			`cell (2,${y}): land 2 occupied is annexed, the rest stays with 1`,
		);
	}
	for (let y = 5; y < H; y++)
		assert.equal(
			runtime.worldControlMap[y * W + 3],
			1,
			"1 keeps what it held of 2",
		);
	for (let i = 0; i < before.length; i++) {
		const x = i % W;
		if (x >= 8)
			assert.equal(
				runtime.worldControlMap[i],
				before[i],
				`neutral cell ${i} must not change in a separate peace`,
			);
	}
}

{
	const { runtime } = createRuntime();
	const before = new Uint16Array(runtime.worldControlMap);
	runtime.gameState = "SIMULATING";
	createConflictResolution(runtime).applyTreaty("PEACE_TREATY");
	assert.equal(runtime.gameState, "WAR_OVER");
	assert.equal(
		runtime.landMask.some((value) => value === 2),
		false,
	);
	for (let i = 0; i < before.length; i++)
		if (i % W >= 8)
			assert.equal(
				runtime.worldControlMap[i],
				before[i],
				`neutral cell ${i} must not change at war end`,
			);
}

console.log("peace deal smoke passed");
