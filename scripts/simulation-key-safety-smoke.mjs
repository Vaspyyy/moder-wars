import assert from "node:assert/strict";
import { createAiPlanner } from "../src/ai-planning.js";
import { createAiRuntime } from "../src/ai-runtime.js";
import { createInfluenceRuntime } from "../src/influence-runtime.js";
import {
	applySimulationState,
	cloneSimulationData,
} from "../src/simulation-protocol.js";
import { createSimulationState } from "../src/simulation-state.js";
import { createSimulationWorld } from "../src/simulation-world.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

for (const key of ["__proto__", "constructor", "prototype"]) {
	const initial = JSON.parse(`{"${key}": {"polluted": true}}`);
	assert.throws(() => createSimulationState(initial), /unsafe property/);
}
for (const sides of [{ length: 2 }, [null], ["country"], "__proto__"]) {
	assert.throws(() => createSimulationState({ sides }), /arrays of countries/);
}
for (const initial of [null, [], "state"])
	assert.throws(() => createSimulationState(initial), /must be an object/);
assert.equal(Object.prototype.polluted, undefined);
assert.deepEqual(createSimulationState({ sides: [[], []] }).sides, [[], []]);

// Reserved property names may survive JSON parsing but must not cross state merges.
for (const key of [
	"__proto__",
	"constructor",
	"prototype",
	"toString",
	"valueOf",
	"hasOwnProperty",
]) {
	const hostile = JSON.parse(
		`{"${key}":{"polluted":true},"customScenarioField":{"kept":true}}`,
	);
	const cloned = cloneSimulationData(hostile);
	assert.equal(Object.hasOwn(cloned, key), false);
	assert.deepEqual(cloned.customScenarioField, { kept: true });
	assert.equal(Object.getPrototypeOf(cloned), Object.prototype);

	const runtime = createTinySimulationState();
	const originalPrototype = Object.getPrototypeOf(runtime);
	applySimulationState(runtime, hostile);
	assert.equal(Object.getPrototypeOf(runtime), originalPrototype);
	assert.equal(
		Object.hasOwn(runtime, "customScenarioField"),
		false,
		"unexpected root state fields are ignored",
	);
	applySimulationState(runtime, { CONFIG: hostile });
	assert.equal(Object.hasOwn(runtime.CONFIG, key), false);
	assert.deepEqual(runtime.CONFIG.customScenarioField, { kept: true });
	applySimulationState(runtime, { countryMetadata: [{ id: 1, ...hostile }] });
	assert.equal(Object.hasOwn(runtime.countryMetadata[0], key), false);
	assert.deepEqual(runtime.countryMetadata[0].customScenarioField, {
		kept: true,
	});
	assert.equal({}.polluted, undefined);
}
for (const key of ["map", "filter", "splice", "push"]) {
	const hostileArray = [1, 2];
	hostileArray[key] = "not a function";
	const cloned = cloneSimulationData(hostileArray);
	assert.deepEqual(cloned, [1, 2]);
	assert.equal(Object.hasOwn(cloned, key), false);
}

// Typed views are rebuilt from their real type, never from a forged constructor.
const forgedView = new Uint16Array([5, 9]);
let constructed = false;
Object.defineProperty(forgedView, "constructor", {
	value: () => {
		constructed = true;
	},
});
const clonedView = cloneSimulationData(forgedView);
assert.ok(clonedView instanceof Uint16Array);
assert.deepEqual(clonedView, new Uint16Array([5, 9]));
assert.equal(constructed, false, "view constructor properties never execute");
for (const view of [
	new Int8Array([-1, 2]),
	new Uint8ClampedArray([1, 255]),
	new Float32Array([0.5]),
	new Float64Array([1.25]),
	new BigInt64Array([3n]),
	new DataView(new ArrayBuffer(8), 2, 4),
]) {
	const copy = cloneSimulationData(view);
	assert.equal(Object.getPrototypeOf(copy), Object.getPrototypeOf(view));
	assert.notEqual(copy.buffer, view.buffer, "clones own their storage");
	if (view instanceof DataView) assert.equal(copy.byteLength, 4);
	else assert.deepEqual(Array.from(copy), Array.from(view));
}

// Strategy names and side/cell indexes from imported data stay numeric.
const strategies = ["BLITZ", "__proto__", "constructor", "unknown", 42, null];
const planner = createAiPlanner({
	sides: [
		strategies.map((strategy, id) => ({ id, strategy, initialCells: 1 })),
	],
	latestCountryStats: new Map(),
});
const profile = planner.getSideStrategyProfile(0);
assert.equal(profile.dominant, "BALANCED");
assert.deepEqual(Object.keys(profile.weights).sort(), [
	"AGGRESSIVE",
	"BALANCED",
	"BLITZ",
	"DEFENSIVE",
	"TURTLE",
]);
assert.equal(profile.weights.BALANCED, 5);
assert.equal(profile.weights.BLITZ, 1);

const invalidIndexes = [
	"__proto__",
	"constructor",
	"prototype",
	"0",
	NaN,
	0.5,
	-1,
	99,
	Infinity,
	-Infinity,
	null,
	true,
	0n,
	Symbol("cell"),
	{
		valueOf() {
			throw new Error("Untrusted index coercion");
		},
	},
];
const runtime = createSimulationState({
	gridWidth: 3,
	gridHeight: 3,
	landMask: new Uint8Array(9),
	units: [0, ...invalidIndexes].map((sideIndex) => ({
		sideIndex,
		health: 100,
		deployTicks: 0,
	})),
	operationalUnitPower: () => 5,
});
const world = createSimulationWorld(runtime);
const posture = world.refreshLiveCombatPower(true);
assert.deepEqual(posture.sideStrength, [5, 0]);
assert.deepEqual(posture.sideUnitCounts, [1, 0]);
assert.equal(runtime._liveSideCombatPower[0], 5);
assert.equal(Object.getPrototypeOf(posture.sideStrength), Array.prototype);

runtime._warPlan = ["first", "other", "second", "other-second"];
for (const index of invalidIndexes) world.clearSideLandPlanSlots(index);
assert.deepEqual(runtime._warPlan, [
	"first",
	"other",
	"second",
	"other-second",
]);
world.clearSideLandPlanSlots(0);
assert.deepEqual(runtime._warPlan, [null, "other", null, "other-second"]);

const ai = createAiRuntime(runtime);
for (const index of invalidIndexes) {
	ai.discardNonHostileOperationalPlans(index);
	ai.clearOperationalPlanForTaskForce(index, {});
}
assert.equal(Object.getPrototypeOf(runtime._warPlan), Array.prototype);
assert.deepEqual(runtime._warPlan, [null, "other", null, "other-second"]);
runtime._warPlan[0] = { signature: "test-plan" };
ai.clearOperationalPlanForTaskForce(0, { planSignature: "test-plan" });
assert.equal(runtime._warPlan[0], null);
assert.equal(runtime._planReassessNeeded[0], true);

const influence = createInfluenceRuntime(runtime);
influence.ensureInfluenceFrontierQueue();
const savedQueue = runtime._influenceFrontierQueued;
runtime._influenceFrontierQueued = { length: 9 };
influence.ensureInfluenceFrontierQueue();
assert.ok(runtime._influenceFrontierQueued instanceof Uint8Array);
assert.notEqual(runtime._influenceFrontierQueued, savedQueue);
for (const index of invalidIndexes) {
	assert.equal(influence.enqueueInfluenceFrontierIndex(index, true), false);
	influence.queueInfluenceFrontierCell(index, true);
}
assert.equal(runtime._influenceFrontierPriorityQueue.length, 0);
assert.equal(influence.enqueueInfluenceFrontierIndex(4, true), true);
runtime._influenceFrontierPriorityQueue.unshift(...invalidIndexes);
influence.processInfluenceFrontierDiffusion(1);
assert.equal(runtime._influenceFrontierQueued[4], 0);
assert.equal(
	runtime._influenceFrontierPriorityCursor,
	invalidIndexes.length + 1,
);
assert.equal(
	Object.hasOwn(runtime._influenceFrontierQueued, "constructor"),
	false,
);
console.log(
	"Simulation key safety: unsafe state, reserved keys, strategies and array indexes rejected; typed views rebuilt from real types.",
);
