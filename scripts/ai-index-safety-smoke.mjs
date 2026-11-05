import assert from "node:assert/strict";
import { createAiPlanner } from "../src/ai-planning.js";

const context = {
	gridWidth: 3,
	gridHeight: 3,
	landMask: new Uint8Array(9).fill(1),
	dominantSideMap: new Int8Array(9),
	worldControlMap: new Uint16Array(9).fill(1),
	_planBfsSeen: new Uint32Array(9),
	_planBfsParent: new Int32Array(9),
	_planBfsQueue: new Int32Array(9),
	_planBfsGeneration: 0,
};
const planner = createAiPlanner(context);
const searches = [
	(start, target) => planner.findLandPathSummary(start, target, 0),
	(start, target) => planner.findSeaPathSummary(start, target),
];
const invalidIndexes = [
	"__proto__",
	"constructor",
	"prototype",
	"0",
	undefined,
	null,
	NaN,
	Infinity,
	-Infinity,
	-1,
	0.5,
	9,
	Symbol("index"),
	{
		valueOf() {
			throw new Error("Input coercion must not run");
		},
	},
];

// Both entry indices must be rejected before writing scratch cells or advancing
// the search generation; valid typed-buffer indices still produce the same paths.
for (const search of searches) {
	for (const value of invalidIndexes) {
		const generation = context._planBfsGeneration;
		assert.equal(search(value, 8).reachable, false);
		assert.equal(search(0, value).reachable, false);
		assert.equal(context._planBfsGeneration, generation);
	}
	for (const [key, value] of [
		["gridWidth", "3"],
		["gridWidth", 0],
		["gridWidth", 1.5],
		["gridWidth", NaN],
		["gridWidth", Symbol("width")],
		["gridHeight", "3"],
		["gridHeight", 2],
	]) {
		const original = context[key];
		context[key] = value;
		assert.equal(search(0, 8).reachable, false);
		context[key] = original;
	}
}

for (const land of [true, false]) {
	context.landMask.fill(land ? 1 : 0);
	const search = searches[land ? 0 : 1];
	const baseline = search(0, 8);
	assert.equal(baseline.reachable, true);
	assert.equal(baseline.distanceCells, 4);
	assert.equal(search(2, 3).distanceCells, 3, "row edges cannot wrap");
	for (const [key, malformed] of [
		["_planBfsSeen", { length: 9 }],
		["_planBfsParent", new Array(9).fill(-1)],
		["_planBfsParent", new Int32Array(1)],
		["_planBfsQueue", new Uint32Array(9)],
		["_planBfsQueue", new Int32Array(1)],
	]) {
		context[key] = malformed;
		assert.deepEqual(search(0, 8), baseline);
		assert.ok(context._planBfsSeen instanceof Uint32Array);
		assert.ok(context._planBfsParent instanceof Int32Array);
		assert.ok(context._planBfsQueue instanceof Int32Array);
		assert.equal(context._planBfsParent.length, 9);
		assert.equal(context._planBfsQueue.length, 9);
	}
}

assert.equal(Object.prototype.polluted, undefined);
console.log(
	"AI index safety: invalid search inputs rejected, scratch buffers rebuilt, valid routes preserved.",
);
