import assert from "node:assert/strict";
import { buildDirectionField } from "../src/frontline-core.js";
import { createSimulationState } from "../src/simulation-state.js";
import { createSimulationTick } from "../src/simulation-tick.js";
import { createSimulationWorld } from "../src/simulation-world.js";

const fieldInput = {
	gridWidth: 3,
	gridHeight: 3,
	gridRes: 1,
	landMask: new Uint8Array(9).fill(2),
	dominantSideMap: new Int8Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
	hostile: (a, b) => a !== b,
};
const expected = buildDirectionField(fieldInput);
let coerced = false;
const coercible = {
	valueOf() {
		coerced = true;
		return 3;
	},
};
for (const value of ["3", "__proto__", -1, 0.5, NaN, Infinity, coercible]) {
	for (const dimension of ["gridWidth", "gridHeight"]) {
		assert.throws(
			() => buildDirectionField({ ...fieldInput, [dimension]: value }),
			/frontline dimensions/i,
		);
	}
}
assert.equal(coerced, false, "invalid dimensions must not invoke coercion");
assert.throws(
	() => buildDirectionField({ ...fieldInput, gridWidth: 0x80000000 }),
	/frontline dimensions/i,
);

const scratch = Object.fromEntries(
	["lat", "lng", "source", "queue"].map((name) => [
		name,
		{
			length: 9,
			fill() {
				throw new Error("An array-like object must not be used as scratch");
			},
		},
	]),
);
const result = buildDirectionField({ ...fieldInput, scratch });
assert.deepEqual(result.frontlineDirLat, expected.frontlineDirLat);
assert.deepEqual(result.frontlineDirLng, expected.frontlineDirLng);
assert.ok(scratch.source instanceof Int32Array);
assert.ok(scratch.queue instanceof Int32Array);
const buffers = { ...scratch };
buildDirectionField({ ...fieldInput, scratch });
for (const key of Object.keys(buffers))
	assert.equal(scratch[key], buffers[key]);

const runtime = createSimulationState({
	sides: [[{ id: 1 }], [{ id: 2 }]],
	units: [],
});
const world = createSimulationWorld(runtime);
const plans = ["first", "other", "second", "other-second"];
runtime._warPlan = plans.slice();
for (const side of [2, 3, 4, "0", "__proto__", NaN, 0.5, -1, coercible]) {
	world.clearSideLandPlanSlots(side);
	assert.deepEqual(runtime._warPlan, plans);
}
assert.equal(coerced, false, "invalid side IDs must not invoke coercion");
world.clearSideLandPlanSlots(1);
assert.deepEqual(runtime._warPlan, ["first", null, "second", null]);

function smoothCenter(owners, extraAllyIds = []) {
	const endOfSmoothing = new Error("Stop after the occupancy smoothing phase");
	const state = createSimulationState({
		gridWidth: 3,
		gridHeight: 3,
		landMask: new Uint8Array(9).fill(2),
		primaryOccupierMap: owners.slice(),
		units: [],
		sides: [[1, 2, 3, ...extraAllyIds].map((id) => ({ id })), [{ id: 4 }]],
		updatePersistentInfluence() {},
		isSimulationPhaseDue: (_tick, interval, phase) =>
			interval === 120 && phase === 83,
		// Isolate the public tick's smoothing phase from later combat phases.
		getOptimizationFactor() {
			throw endOfSmoothing;
		},
	});
	const originalRandom = Math.random;
	try {
		Math.random = () => 0.5;
		assert.throws(
			() => createSimulationTick(state).performSimulationTick(),
			(error) => error === endOfSmoothing,
		);
	} finally {
		Math.random = originalRandom;
	}
	return state.primaryOccupierMap[4];
}

assert.equal(smoothCenter([1, 1, 1, 1, 3, 1, 2, 2, 2]), 1);
assert.equal(smoothCenter([2, 2, 2, 2, 3, 2, 1, 1, 1]), 2);
// Tied counts cannot reach the five-of-nine majority threshold. Neither the
// first encountered ID nor the lower ID may replace the current owner.
assert.equal(smoothCenter([2, 2, 2, 2, 3, 1, 1, 1, 1]), 3);
assert.equal(smoothCenter([1, 1, 1, 1, 3, 2, 2, 2, 2]), 3);
assert.equal(smoothCenter([0, 0, 0, 0, 3, 0, 0, 0, 0]), 3);
assert.equal(smoothCenter([4, 4, 4, 4, 3, 4, 4, 4, 4]), 3);
assert.equal(smoothCenter(new Array(9).fill(0)), 0);
for (const owner of [
	"1",
	"__proto__",
	"constructor",
	NaN,
	1.5,
	65536,
	coercible,
]) {
	assert.equal(
		smoothCenter(
			[owner, owner, owner, owner, 3, owner, owner, owner, owner],
			[owner],
		),
		3,
		"malformed owners must not become an allied majority",
	);
}
assert.equal(coerced, false, "invalid owner IDs must not invoke coercion");

console.log(
	"Simulation index boundaries: malformed dimensions, owner/side IDs rejected; scratch reuse, plan slots and occupancy majority behavior preserved.",
);
