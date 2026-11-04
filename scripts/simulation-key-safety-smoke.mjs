import assert from "node:assert/strict";
import {
	applySimulationState,
	cloneSimulationData,
} from "../src/simulation-protocol.js";
import { createSimulationState } from "../src/simulation-state.js";
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

console.log(
	"Simulation key safety: unsafe state and reserved keys rejected; typed views rebuilt from real types.",
);
