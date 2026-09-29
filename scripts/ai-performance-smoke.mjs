import assert from "node:assert/strict";
import { createAiPlanner } from "../src/ai-planning.js";
import { createAiReachabilityScratch } from "../src/ai-proposals.js";
import {
	calculateTaskForceReadiness,
	reconcileAiTaskForces,
} from "../src/ai-task-forces.js";
import { countNearbyFriendlySupplyCells } from "../src/ground-unit.js";
import {
	aggregateTaskForceCellPair,
	buildTacticalGrid,
	forEachUnorderedNeighborPair,
} from "../src/tactical-grid.js";

let randomState = 42;
const random = () => {
	randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
	return randomState / 2 ** 32;
};
const choose = (values) => values[Math.floor(random() * values.length)];

// Every cache invalidation is checked against the uncached allocator through
// multiple fronts, losses, deployment, support roles, changed power and retreats.
for (let trial = 0; trial < 40; trial++) {
	const units = Array.from({ length: 50 }, (_, id) => ({
		id,
		sideUid: id < 40 ? "red" : "blue",
		lat: random() * 20 - 10,
		lng: random() * 360 - 180,
		health: choose([0, 25, 100]),
		maxHealth: 100,
		combatPower: random() * 5,
		deployed: choose([true, true, false]),
		commandEligible: choose([true, true, false]),
		countryRole: choose(["PRIMARY", "SUPPORT"]),
	}));
	const plans = Array.from({ length: 3 }, (_, id) => ({
		signature: `plan:${id}`,
		sideUid: id < 2 ? "red" : "blue",
		planType: choose(["PUSH_FRONT", "DEFEND"]),
		posture: choose(["BLITZ", "TURTLE", "BALANCED", "AGGRESSIVE", "DEFENSIVE"]),
		desiredPower: random() * 50,
		maxAssignedUnits: Math.ceil(random() * 25),
		priority: random() * 50,
		stagingAnchor: { lat: random() * 10, lng: random() * 300 - 150 },
	}));
	let reference = [];
	let cached = [];
	const roleCache = new Map();
	for (let step = 0; step < 30; step++) {
		const tick = step * 15;
		reference = reconcileAiTaskForces(reference, plans, units, { tick });
		cached = reconcileAiTaskForces(cached, plans, units, { tick, roleCache });
		assert.deepEqual(cached, reference, `trial ${trial}, reassessment ${step}`);
		const unitsById = new Map(units.map((unit) => [String(unit.id), unit]));
		for (const force of cached) {
			assert.deepEqual(
				calculateTaskForceReadiness(force, units, { unitsById }),
				calculateTaskForceReadiness(force, units),
				"shared lookup preserves readiness filters and power",
			);
		}
		const unit = choose(units);
		switch (step % 8) {
			case 0:
				unit.health = choose([0, 25, 100]);
				break;
			case 1:
				unit.commandEligible = !unit.commandEligible;
				break;
			case 2:
				unit.deployed = !unit.deployed;
				break;
			case 3:
				unit.countryRole = choose(["PRIMARY", "SUPPORT"]);
				break;
			case 4:
				unit.combatPower = random() * 5;
				break;
			case 5:
				for (let index = 0; index < 3; index++) {
					reference[index].phase = cached[index].phase = choose([
						"ATTACKING", "REGROUPING", "WITHDRAWING",
					]);
				}
				break;
			case 6:
				choose(plans).posture = choose(["BALANCED", "AGGRESSIVE", "DEFENSIVE"]);
				break;
			case 7:
				unit.lat = random() * 10;
				unit.lng = random() * 360 - 180;
				break;
		}
	}
}

// Reused BFS buffers clear the entire queued frontier, including cells enqueued
// just before a bounded search stops. Resizing discards the old generation.
const scratch = createAiReachabilityScratch();
const first = scratch.acquire(100);
for (const [index, cell] of [1, 40, 90, 99].entries()) {
	first.seen[cell] = 1;
	first.queue[index] = cell;
}
scratch.release(4);
const second = scratch.acquire(100);
assert.equal(second.seen, first.seen);
assert.equal(second.queue, first.queue);
assert.ok(second.seen.every((value) => value === 0));
second.seen[70] = 1;
second.queue[0] = 70;
scratch.release(1);
const resized = scratch.acquire(50);
assert.notEqual(resized.seen, second.seen);
assert.equal(resized.seen.length, 50);
assert.ok(resized.seen.every((value) => value === 0));

// Compare all supply thresholds against a full scan, including coastlines,
// grid edges and immediate ownership changes. Early exit must not cache a stale result.
for (const resolution of [0.05, 0.15, 0.25, 1]) {
	const gridWidth = 35;
	const gridHeight = 21;
	const landMask = new Uint8Array(gridWidth * gridHeight);
	const dominantSideMap = new Int8Array(landMask.length);
	const frame = { CONFIG: { GRID_RES: resolution }, gridWidth, gridHeight, landMask, dominantSideMap };
	for (let trial = 0; trial < 150; trial++) {
		for (let index = 0; index < landMask.length; index++) {
			landMask[index] = choose([0, 1, 1]);
			dominantSideMap[index] = choose([-1, 0, 1]);
		}
		const gridIndex = Math.floor(random() * landMask.length);
		for (const sideIndex of [0, 1]) {
			let reference = 0;
			const radius = Math.round(0.8 / resolution);
			const row = Math.floor(gridIndex / gridWidth);
			const col = gridIndex % gridWidth;
			for (let nr = row - radius; nr <= row + radius; nr++) {
				for (let nc = col - radius; nc <= col + radius; nc++) {
					if (nr === row && nc === col) continue;
					if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth) continue;
					const index = nr * gridWidth + nc;
					if (landMask[index] > 0 && dominantSideMap[index] === sideIndex) reference++;
				}
			}
			assert.equal(countNearbyFriendlySupplyCells(frame, gridIndex, sideIndex), Math.min(8, reference));
		}
	}
}

// One scoring batch calculates coalition strength once, while independent scores
// remain fresh. Use every strategy and plan type, with naval landing urgency.
const types = ["CAPTURE_CITY", "ENCIRCLE", "PUSH_FRONT", "DEFEND", "NAVAL_INVASION", "NAVAL_SUPPLY", "COASTAL_DEFENSE", "NEUTRAL_GARRISON", "TRANSPORT"];
let powerCalls = 0;
let enemyPowerCalls = 0;
const plannerContext = {
	sides: [[{ id: 1, strategy: "BALANCED" }], [{ id: 2 }]],
	latestCountryStats: new Map([[1, { units: 2400 }]]),
	_tickUnitsBySide: [Array.from({ length: 2400 }, (_, id) => ({ id, health: 100, deployTicks: 0, power: 1 }))],
	operationalUnitPower: (unit) => { powerCalls++; return unit.power; },
	getKnownEnemyPowerForSide: () => { enemyPowerCalls++; return 1200; },
	_navalPlan: [null, { phase: "LANDING", target: { lat: 0, lng: 0 } }],
	areSidesHostile: (left, right) => left !== right,
	getGridIndex: () => 0,
	dominantSideMap: new Int8Array([0]),
	_frontlinePolys: {},
	_aiPlanMemory: new Map(),
};
const planner = createAiPlanner(plannerContext);
const proposals = Array.from({ length: 40 }, (_, index) => ({
	type: types[index % types.length],
	target: { lat: index, lng: 0, isCapital: index % 3 === 0 },
	geographicData: { reachesTarget: index % 2 === 0, minLandDist: index, minSeaDist: index + 1 },
	riskAssessment: { ourForcesNear: index + 1, enemyForcesNear: 3 },
	threatScore: 0.7,
	borderLength: 10,
	strandedCount: 6,
}));
for (const strategy of ["BLITZ", "AGGRESSIVE", "BALANCED", "DEFENSIVE", "TURTLE"]) {
	plannerContext.sides[0][0].strategy = strategy;
	const independent = proposals.map((proposal) => structuredClone(proposal));
	const batched = proposals.map((proposal) => structuredClone(proposal));
	powerCalls = enemyPowerCalls = 0;
	const expected = independent.map((proposal) => planner.scoreProposal(proposal, 0));
	assert.equal(powerCalls, 2400 * 40);
	assert.equal(enemyPowerCalls, 40);
	powerCalls = enemyPowerCalls = 0;
	const batch = {};
	assert.deepEqual(batched.map((proposal) => planner.scoreProposal(proposal, 0, batch)), expected);
	assert.deepEqual(batched, independent, "scores and diagnostic breakdowns match");
	assert.equal(powerCalls, 2400);
	assert.equal(enemyPowerCalls, 1);
}
plannerContext._tickUnitsBySide[0][0].power = 10;
const freshProposal = structuredClone(proposals[0]);
planner.scoreProposal(freshProposal, 0, {});
assert.equal(freshProposal.scoreBreakdown.globalForceRatio, 2409 / 1200);

// Dense formation blocks may aggregate only when every pair already uses slots
// instead of repulsion. Mixed forces, combat, fractional weights and partial
// radius overlaps retain exactly the ordinary traversal and pair statistics.
function visitFriendlyPair(left, right, distanceSq) {
	const skips = (unit) => unit.navalAssigned || unit.supplyAssigned || unit.coastalAssigned;
	if (!skips(left)) left._tickLocalAllyCount += right._tickAllyWeight || 1;
	if (!skips(right)) right._tickLocalAllyCount += left._tickAllyWeight || 1;
	if ((left._taskForceUid && left._taskForceUid === right._taskForceUid && !left._tickHasNearbyHostile && !right._tickHasNearbyHostile) || distanceSq >= 0.45 ** 2 || distanceSq <= 0.00001) return;
	const distance = Math.sqrt(distanceSq);
	const dLat = left.lat - right.lat;
	let dLng = left.lng - right.lng;
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;
	if (!skips(left)) {
		left.repulsionVector ||= { lat: 0, lng: 0 };
		left.repulsionVector.lat += dLat / distance;
		left.repulsionVector.lng += dLng / distance;
	}
	if (!skips(right)) {
		right.repulsionVector ||= { lat: 0, lng: 0 };
		right.repulsionVector.lat -= dLat / distance;
		right.repulsionVector.lng -= dLng / distance;
	}
}
for (const situation of ["dense", "cross-cell", "seam", "mixed", "hostile", "fractional", "radius", "assigned", "custom-filter"]) {
	const units = Array.from({ length: 100 }, (_, id) => ({
		id, sideIndex: 0, lat: 0.01 + (id % 10) * 0.001, lng: 0.01 + Math.floor(id / 10) * 0.001,
		_taskForceUid: "one", _tickHasNearbyHostile: false,
		_tickAllyWeight: 1, _tickLocalAllyCount: 1, repulsionVector: null,
	}));
	if (situation === "cross-cell") for (const unit of units) unit.lng += unit.id < 50 ? 0.56 : 0.61;
	if (situation === "seam") for (const unit of units) unit.lng = unit.id < 50 ? 179.98 : -179.98;
	if (situation === "mixed") units[0]._taskForceUid = "two";
	if (situation === "hostile") units[0]._tickHasNearbyHostile = true;
	if (situation === "fractional") units[0]._tickAllyWeight = 0.333;
	if (situation === "radius") for (const unit of units) unit.lng += unit.id < 50 ? 0 : 0.59;
	if (situation === "assigned") for (const unit of units.filter((unit) => unit.id % 3 === 0)) unit.navalAssigned = true;
	const reference = structuredClone(units);
	const options = { radiusCells: 1, radiusSq: 0.6 ** 2 };
	if (situation === "custom-filter") options.acceptPair = (left, right) => (left.id + right.id) % 2 === 0;
	const expected = forEachUnorderedNeighborPair(buildTacticalGrid(reference), 0, visitFriendlyPair, options);
	const result = forEachUnorderedNeighborPair(buildTacticalGrid(units), 0, visitFriendlyPair, { ...options, aggregateCellPair: aggregateTaskForceCellPair });
	assert.deepEqual(units, reference, `${situation}: preserve exact density and repulsion`);
	assert.equal(result.candidatePairs, expected.candidatePairs);
	assert.equal(result.acceptedPairs, expected.acceptedPairs);
	if (["dense", "cross-cell", "seam", "assigned"].includes(situation)) assert.ok(result.aggregatedPairs > 0, `${situation}: actually reduce pair work`);
	if (["mixed", "hostile", "fractional", "custom-filter"].includes(situation)) assert.equal(result.aggregatedPairs, 0, `${situation}: preserve ordinary traversal`);
}
console.log("AI performance checks passed: 1,200 cache sequences, 1,200 supply classifications, BFS reuse, batched scores, and exact dense pair aggregation");
