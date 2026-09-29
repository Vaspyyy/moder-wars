import assert from "node:assert/strict";

import {
	decideRenderAdmission,
	isSimulationPhaseDue,
} from "../src/simulation-phase-wheel.js";

// Consolidation retains its original tick phase independently of frame tokens.
const dueTicks = Array.from({ length: 101 }, (_, tick) => tick).filter((tick) =>
	isSimulationPhaseDue(tick, 30, 11),
);
assert.deepEqual(dueTicks, [11, 41, 71]);
assert.equal(isSimulationPhaseDue(10, 30, 11), false);
assert.equal(isSimulationPhaseDue(11, 30, -19), true);
assert.equal(isSimulationPhaseDue(11, 30, 41), true);
assert.equal(isSimulationPhaseDue(11.9, 30.9, 11.9), true);
assert.equal(isSimulationPhaseDue(-5, 0), true);
assert.equal(isSimulationPhaseDue(Number.NaN, Number.NaN), true);
assert.equal(isSimulationPhaseDue(Number.POSITIVE_INFINITY, 30, 11), false);

const clean = decideRenderAdmission({ visualDirty: false, force: true });
assert.equal(clean.admit, false);
assert.equal(clean.reason, "clean");
const normal = decideRenderAdmission({ simulationWorkMs: 12, simulationBudgetMs: 12 });
assert.equal(normal.admit, true);
assert.equal(normal.reason, "within-budget");
const busy = decideRenderAdmission({ simulationWorkMs: 13, simulationBudgetMs: 12 });
assert.equal(busy.admit, false);
assert.equal(busy.reason, "simulation-over-budget");

for (const commitFlags of [
	["territory", "field", "territory", ""],
	new Set(["territory", "field", ""]),
	{ territory: true, field: 1, ignored: false },
]) {
	const committed = decideRenderAdmission({ simulationWorkMs: 13, commitFlags });
	assert.equal(committed.admit, false);
	assert.equal(committed.reason, "commit-frame");
	assert.deepEqual(committed.commitFlags, ["field", "territory"]);
	const forced = decideRenderAdmission({ simulationWorkMs: 13, commitFlags, force: true });
	assert.equal(forced.admit, true);
	assert.equal(forced.reason, "forced");
	const bounded = decideRenderAdmission({ simulationWorkMs: 13, commitFlags, framesSinceRender: 2 });
	assert.equal(bounded.admit, true);
	assert.equal(bounded.reason, "max-deferral");
}
assert.deepEqual(decideRenderAdmission({ commitFlags: true }).commitFlags, ["commit"]);
assert.equal(decideRenderAdmission({ simulationWorkMs: 100, framesSinceRender: 1 }).admit, false);
assert.equal(decideRenderAdmission({ simulationWorkMs: 100, maxDeferredFrames: 0 }).admit, true);
const normalized = decideRenderAdmission({
	simulationWorkMs: -1,
	simulationBudgetMs: Number.NaN,
	framesSinceRender: -2,
	maxDeferredFrames: 2.9,
});
assert.equal(normalized.simulationWorkMs, 0);
assert.equal(normalized.simulationBudgetMs, 12);
assert.equal(normalized.framesSinceRender, 0);
assert.equal(normalized.maxDeferredFrames, 2);

console.log("Simulation phase and render admission smoke tests passed");
