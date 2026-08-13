import assert from "node:assert/strict";

import {
	assignDeterministicPhaseOffsets,
	createSimulationPhaseWheel,
	decideRenderAdmission,
	deterministicPhaseOffset,
	isSimulationPhaseDue,
	stablePhaseHash,
} from "../src/simulation-phase-wheel.js";

assert.equal(stablePhaseHash("economy"), stablePhaseHash("economy"));
assert.notEqual(stablePhaseHash("economy"), stablePhaseHash("census"));
assert.equal(
	deterministicPhaseOffset("economy", 600),
	deterministicPhaseOffset("economy", 600),
);
assert.equal(isSimulationPhaseDue(7, 10, 7), true);
assert.equal(isSimulationPhaseDue(17, 10, 7), true);
assert.equal(isSimulationPhaseDue(16, 10, 7), false);

const offsetsForward = assignDeterministicPhaseOffsets(
	["economy", "census", "intel", "air"],
	10,
	"war",
);
const offsetsReverse = assignDeterministicPhaseOffsets(
	["air", "intel", "census", "economy"],
	10,
	"war",
);
assert.deepEqual([...offsetsForward], [...offsetsReverse]);
assert.equal(new Set(offsetsForward.values()).size, 4);

const calls = [];
const wheel = createSimulationPhaseWheel({
	generation: "war-1",
	itemBudget: 2,
	maxItemsPerJobTurn: 2,
});
wheel.register({
	id: "bravo",
	intervalTicks: 2,
	phaseOffset: 0,
	priority: 5,
	run: ({ tick, frameToken }) => calls.push(`bravo:${tick}:${frameToken}`),
});
wheel.register({
	id: "alpha",
	intervalTicks: 2,
	phaseOffset: 0,
	priority: 5,
	run: ({ tick, frameToken }) => calls.push(`alpha:${tick}:${frameToken}`),
});

const first = wheel.advance({ tick: 2, frameToken: "frame-a" });
assert.deepEqual(
	first.immediateRuns.map(({ id }) => id),
	["alpha", "bravo"],
	"same-priority jobs must run in stable id order",
);
assert.deepEqual(calls, ["alpha:2:frame-a", "bravo:2:frame-a"]);
const duplicateTick = wheel.advance({ tick: 2, frameToken: "frame-b" });
assert.deepEqual(
	duplicateTick.skipped.map(({ reason }) => reason),
	["duplicate-tick", "duplicate-tick"],
);
const duplicateFrame = wheel.advance({ tick: 4, frameToken: "frame-a" });
assert.deepEqual(
	duplicateFrame.skipped.map(({ reason }) => reason),
	["duplicate-frame", "duplicate-frame"],
);
assert.equal(calls.length, 2);

const nullFrameCalls = [];
const nullFrameWheel = createSimulationPhaseWheel();
nullFrameWheel.register({
	id: "null-frame",
	intervalTicks: 1,
	phaseOffset: 0,
	run: ({ tick }) => nullFrameCalls.push(tick),
});
nullFrameWheel.advance({ tick: 1, frameToken: null });
const duplicateNullFrame = nullFrameWheel.advance({ tick: 2, frameToken: null });
assert.deepEqual(nullFrameCalls, [1]);
assert.deepEqual(duplicateNullFrame.skipped, [
	{ id: "null-frame", reason: "duplicate-frame" },
]);

const perTickCalls = [];
wheel.register({
	id: "per-tick",
	intervalTicks: 1,
	phaseOffset: 0,
	oncePerFrame: false,
	run: ({ tick }) => perTickCalls.push(tick),
});
wheel.advance({ tick: 5, frameToken: "shared-frame" });
wheel.advance({ tick: 6, frameToken: "shared-frame" });
assert.deepEqual(perTickCalls, [5, 6]);

let published = null;
const processedRanges = [];
wheel.register({
	id: "territory-ledger",
	intervalTicks: 10,
	phaseOffset: 0,
	prepare: ({ tick }) => ({
		totalItems: 5,
		state: { tick, sum: 0 },
		maxItemsPerTurn: 2,
		processRange(start, end, state) {
			processedRanges.push([start, end]);
			for (let index = start; index < end; index++) state.sum += index + 1;
		},
		finalize: (state) => Object.freeze({ tick: state.tick, sum: state.sum }),
	}),
	commit(result) {
		published = result;
	},
});

const prepared = wheel.advance({
	tick: 10,
	frameToken: "frame-10",
	itemBudget: 2,
});
assert.deepEqual(prepared.preparedStarts, [
	{ id: "territory-ledger", sequence: 1, totalItems: 5 },
]);
assert.equal(published, null, "partial preparation must stay private");
wheel.advance({ tick: 11, frameToken: "frame-11", itemBudget: 2 });
assert.equal(published, null, "a second partial chunk must stay private");
const ready = wheel.advance({
	tick: 12,
	frameToken: "frame-12",
	itemBudget: 2,
});
assert.deepEqual(processedRanges, [
	[0, 2],
	[2, 4],
	[4, 5],
]);
assert.deepEqual(ready.readyCommits, [
	{
		id: "territory-ledger",
		sequence: 1,
		generation: "war-1",
		dueTick: 10,
	},
]);
assert.equal(published, null, "completed preparation requires explicit commit");
const committed = wheel.flushReadyCommits({ expectedGeneration: "war-1" });
assert.deepEqual(committed.committed, [
	{ id: "territory-ledger", sequence: 1, dueTick: 10 },
]);
assert.deepEqual(published, { tick: 10, sum: 15 });

const commitError = new Error("transient commit failure");
let commitAttempts = 0;
let retryPublished = null;
const retryWheel = createSimulationPhaseWheel({ itemBudget: 1 });
retryWheel.register({
	id: "retry-commit",
	intervalTicks: 1,
	phaseOffset: 0,
	prepare: () => ({
		totalItems: 1,
		state: "prepared",
		processRange: () => {},
	}),
	commit(result) {
		commitAttempts++;
		if (commitAttempts === 1) throw commitError;
		retryPublished = result;
	},
});
retryWheel.advance({ tick: 0, frameToken: "retry-frame" });
const failedCommit = retryWheel.flushReadyCommits();
assert.equal(failedCommit.committed.length, 0);
assert.equal(failedCommit.errors[0].error, commitError);
assert.equal(failedCommit.remaining, 1);
assert.equal(retryWheel.snapshot().jobs[0].commitReady, true);
const retriedCommit = retryWheel.flushReadyCommits();
assert.deepEqual(retriedCommit.committed, [
	{ id: "retry-commit", sequence: 1, dueTick: 0 },
]);
assert.equal(retriedCommit.remaining, 0);
assert.equal(commitAttempts, 2);
assert.equal(retryPublished, "prepared");

const processError = new Error("original process failure");
const failingWheel = createSimulationPhaseWheel({ itemBudget: 1 });
failingWheel.register({
	id: "failing-process",
	intervalTicks: 1,
	phaseOffset: 0,
	prepare: () => ({
		totalItems: 1,
		processRange() {
			throw processError;
		},
	}),
	commit: () => assert.fail("failed preparation must not commit"),
});
const failedProcess = failingWheel.advance({
	tick: 0,
	frameToken: "failure-frame",
});
assert.equal(failedProcess.errors.length, 1);
assert.equal(failedProcess.errors[0].stage, "process");
assert.equal(failedProcess.errors[0].error, processError);
assert.equal(failingWheel.snapshot().jobs[0].lastError, processError);
assert.equal(failingWheel.snapshot().jobs[0].inFlight, false);

let stalePublished = false;
wheel.register({
	id: "stale-work",
	intervalTicks: 20,
	phaseOffset: 0,
	prepare: () => ({
		totalItems: 4,
		state: 0,
		processRange: () => {},
	}),
	commit: () => {
		stalePublished = true;
	},
});
wheel.advance({ tick: 20, frameToken: "frame-20", itemBudget: 1 });
assert.equal(
	wheel.snapshot().jobs.find(({ id }) => id === "stale-work").inFlight,
	true,
);
assert.equal(wheel.setGeneration("war-2"), true);
assert.equal(wheel.snapshot().queuedPreparations.length, 0);
assert.equal(wheel.snapshot().readyCommits.length, 0);
assert.equal(stalePublished, false);
assert.equal(
	wheel.flushReadyCommits({ expectedGeneration: "war-1" }).staleGeneration,
	true,
);

assert.deepEqual(
	decideRenderAdmission({
		visualDirty: true,
		simulationWorkMs: 8,
		simulationBudgetMs: 12,
	}),
	{
		admit: true,
		reason: "within-budget",
		visualDirty: true,
		simulationWorkMs: 8,
		simulationBudgetMs: 12,
		overBudget: false,
		commitFlags: [],
		framesSinceRender: 0,
		maxDeferredFrames: 2,
		forcedByStarvation: false,
	},
);
assert.equal(
	decideRenderAdmission({
		simulationWorkMs: 20,
		simulationBudgetMs: 12,
	}).reason,
	"simulation-over-budget",
);
assert.deepEqual(
	decideRenderAdmission({
		simulationWorkMs: 5,
		commitFlags: { economy: true, territory: false },
	}),
	{
		admit: true,
		reason: "within-budget",
		visualDirty: true,
		simulationWorkMs: 5,
		simulationBudgetMs: 12,
		overBudget: false,
		commitFlags: ["economy"],
		framesSinceRender: 0,
		maxDeferredFrames: 2,
		forcedByStarvation: false,
	},
	"cheap atomic commits should not suppress an otherwise healthy paint",
);
assert.equal(
	decideRenderAdmission({
		simulationWorkMs: 20,
		simulationBudgetMs: 12,
		commitFlags: { economy: true },
	}).reason,
	"commit-frame",
);
assert.equal(
	decideRenderAdmission({
		simulationWorkMs: 50,
		commitFlags: ["economy"],
		framesSinceRender: 2,
		maxDeferredFrames: 2,
	}).reason,
	"max-deferral",
	"render deferral must be bounded even on heavy frames",
);

console.log("Simulation phase-wheel smoke tests passed");
