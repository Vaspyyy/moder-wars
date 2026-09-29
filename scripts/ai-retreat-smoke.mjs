import assert from "node:assert/strict";
import { createAiRuntime } from "../src/ai-runtime.js";
import {
	AI_TASK_FORCE_DEFAULTS,
	advanceAiTaskForce,
	assignTaskForceRoles,
	createAiTaskForce,
	reconcileAiTaskForces,
	selectWithdrawalAnchor,
} from "../src/ai-task-forces.js";

function fixture(count = 100, phase = "REGROUPING") {
	const sideUid = "fixture";
	const units = Array.from({ length: count }, (_, id) => ({
		id,
		lat: 0,
		lng: 2,
		health: 100,
		maxHealth: 100,
		sideIndex: 0,
		sovereignId: 1,
		deployTicks: 0,
	}));
	const state = {
		sides: [[{ id: 1 }]],
		sideUids: [sideUid],
		countryMetadata: [{ id: 1 }],
		units,
		_tickUnitsBySide: [units],
		_simTickCount: 15,
		_aiOperationsDirty: true,
		_aiLastOperationsTick: -Infinity,
		_aiTaskForceTransitionById: new Map(),
		_aiPendingLandingHandoffs: new Map(),
		_aiDebugPlans: [null],
		_sideWarPhase: ["STALEMATE"],
		_frontIntelBySide: [[]],
		_frontlinePolys: {},
		_warPlan: [null, null],
		_planReassessNeeded: [],
		getLiveFormationStrength: (unit) => unit.health / 100,
		getEffectiveBuffState: () => "none",
		getGridIndex: () => 0,
		dominantSideMap: new Int8Array([0]),
		landMask: new Uint8Array([1]),
		worldControlMap: new Uint16Array([1]),
		countryToSideMap: new Map([[1, 0]]),
		areSidesHostile: () => false,
		estimateLocalForces: () => ({ enemyHealth: 0 }),
		lngDelta: (a, b) => ((a - b + 540) % 360) - 180,
		geoDistSq: (a, b, c, d) =>
			(a - c) ** 2 + (((b - d + 540) % 360) - 180) ** 2,
		findLandPathSummary: () => ({ reachable: true }),
		activeTheaterCities: [],
		getSideStrategyProfile: () => ({ dominant: "BALANCED" }),
		getPlanSignature: (_, plan) => plan.signature,
	};
	const ai = createAiRuntime(state);
	let force = createAiTaskForce({
		signature: "old-push",
		sideUid,
		phase,
		planType: "PUSH_FRONT",
		assignedUnitIds: units.map((unit) => unit.id),
		stagingAnchor: { lat: 0, lng: 0 },
		target: { lat: 0, lng: -1 },
		withdrawalAnchor: { lat: 0, lng: 2 },
		launchPower: count,
		currentPower: count,
		peakPower: count,
		recoveryPower: count,
		tick: 0,
	});
	force = assignTaskForceRoles(force, units.map(ai.serializeOperationalUnit));
	state._aiTaskForcesBySide = new Map([[sideUid, [force]]]);
	const tick = (at) => {
		state._simTickCount = at;
		state._aiOperationsDirty = true;
		ai.updateOperationalAiTaskForces();
	};
	return {
		state,
		ai,
		force,
		units,
		tick,
		forces: () => state._aiTaskForcesBySide.get(sideUid),
	};
}

// Even a fully recovered force used to be frozen by the collapsing-side override.
const collapse = fixture();
collapse.state._sideWarPhase[0] = "COLLAPSING";
collapse.tick(15000);
assert.equal(
	collapse.forces().some((force) => force.phase === "REGROUPING"),
	false,
);
assert.equal(
	collapse.units.some((unit) => unit._taskForceOrder?.phase === "REGROUPING"),
	false,
);

// 58/100 members can be inside the center radius while all100 have reached their
// assigned spread positions. Arrival must use the positions actually ordered.
const spread = fixture(100, "WITHDRAWING");
spread.ai.assignOperationalTaskForceOrders(
	0,
	spread.force,
	null,
	new Map(spread.units.map((unit) => [String(unit.id), unit])),
);
for (const unit of spread.units)
	Object.assign(unit, unit._taskForceOrder.target);
assert.ok(
	spread.units.filter(
		(unit) => spread.state.geoDistSq(unit.lat, unit.lng, 0, 2) <= 1,
	).length < 65,
);
spread.tick(15);
assert.equal(spread.forces()[0]?.phase, "REGROUPING");
spread.tick(30);
assert.equal(spread.forces().length, 0, "recovered members must be released");

// A wide theater cannot pull a remote frontline cohort across the whole country.
// Its local destination must also stay fixed as it moves, rather than sliding
// another few degrees inland on every assessment.
const wide = fixture(10, "WITHDRAWING");
for (const unit of wide.units) unit.lng = 20;
const byId = new Map(wide.units.map((unit) => [String(unit.id), unit]));
wide.ai.assignOperationalTaskForceOrders(0, wide.force, null, byId);
const destinations = wide.units.map((unit) => ({
	...unit._taskForceOrder.target,
}));
for (const unit of wide.units) {
	assert.ok(
		wide.state.geoDistSq(
			unit.lat,
			unit.lng,
			unit._taskForceOrder.target.lat,
			unit._taskForceOrder.target.lng,
		) <=
			AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_DISTANCE_SQ + 1e-9,
	);
	unit.lng -= 1;
}
wide.ai.assignOperationalTaskForceOrders(0, wide.force, null, byId);
assert.deepEqual(
	wide.units.map((unit) => unit._taskForceOrder.target),
	destinations,
);

// Lateral spreading must not place recovery destinations in water or hostile land.
const coast = fixture(100, "WITHDRAWING");
coast.state.getGridIndex = (lat) => (Math.abs(lat) < 0.4 ? 0 : 1);
coast.state.landMask = new Uint8Array([1, 0]);
coast.state.dominantSideMap = new Int8Array([0, 1]);
coast.ai.assignOperationalTaskForceOrders(
	0,
	coast.force,
	null,
	new Map(coast.units.map((unit) => [String(unit.id), unit])),
);
assert.ok(
	coast.units.every(
		(unit) =>
			coast.state.getGridIndex(
				unit._taskForceOrder.target.lat,
				unit._taskForceOrder.target.lng,
			) === 0,
	),
);

// A planner replacing an objective must not send its healthy army inland first.
const replacement = fixture(10, "ATTACKING");
replacement.state._warPlan[0] = {
	type: "DEFEND",
	signature: "new-defense",
	maxAssignedUnits: 10,
	stagingPoint: { lat: 0, lng: 0 },
	target: { lat: 0, lng: 0 },
	frontlinePoints: [{ lat: 0, lng: 0 }],
};
replacement.tick(15);
assert.equal(replacement.forces().length, 1);
assert.equal(replacement.forces()[0].planType, "DEFEND");
assert.equal(replacement.forces()[0].assignedUnitIds.length, 10);
assert.equal(
	replacement.units.some((unit) =>
		["WITHDRAWING", "REGROUPING"].includes(unit._taskForceOrder?.phase),
	),
	false,
);

// Existing retirees cannot reserve the whole army away from a replacement defense.
const reclaim = fixture(10, "WITHDRAWING");
reclaim.state._warPlan[0] = { ...replacement.state._warPlan[0] };
reclaim.tick(15);
assert.equal(reclaim.forces().length, 1);
assert.equal(reclaim.forces()[0].assignedUnitIds.length, 10);
assert.equal(
	new Set(reclaim.forces().flatMap((force) => force.assignedUnitIds)).size,
	10,
);

// Replacing a recovering DEFEND force must keep the selected defensive plan alive.
const defendRecovery = fixture(10, "WITHDRAWING");
defendRecovery.force.planType = "DEFEND";
defendRecovery.state._warPlan[0] = {
	...replacement.state._warPlan[0],
	signature: defendRecovery.force.signature,
};
defendRecovery.state._sideWarPhase[0] = "COLLAPSING";
defendRecovery.tick(15);
defendRecovery.tick(30);
assert.equal(defendRecovery.state._warPlan[0]?.type, "DEFEND");
assert.equal(defendRecovery.forces().length, 1);
assert.equal(defendRecovery.forces()[0].assignedUnitIds.length, 10);

// A recovering force must not drain fresh formations from the frontline.
const serialized = replacement.units.map(
	replacement.ai.serializeOperationalUnit,
);
const recovering = {
	...replacement.force,
	phase: "WITHDRAWING",
	assignedUnitIds: [0, 1],
	maxAssignedUnits: 10,
	desiredPower: 10,
};
const [retained] = reconcileAiTaskForces(
	[recovering],
	[{ ...recovering }],
	serialized,
	{ tick: 15 },
);
assert.deepEqual(retained.assignedUnitIds, [0, 1]);

const anchors = [
	{
		id: "near-front",
		sideUid: "fixture",
		lat: 0,
		lng: 0.5,
		controlStrength: 1,
	},
	{
		id: "rear-capital",
		sideUid: "fixture",
		lat: 0,
		lng: 10,
		controlStrength: 1.5,
	},
];
assert.equal(
	selectWithdrawalAnchor(spread.force, anchors, {
		origin: { lat: 0, lng: 0 },
		enemyEstimates: [{ lat: 0, lng: 0 }],
	}).id,
	"near-front",
);
assert.equal(
	selectWithdrawalAnchor(spread.force, [anchors[1]], {
		origin: { lat: 0, lng: 0 },
	}),
	null,
);

// The runtime considers nearby friendly ground, excludes neutral territory and
// distant capitals, and caps path work when local candidates are unreachable.
const local = fixture(10, "CULMINATED");
for (const unit of local.units) {
	unit.lat = 0;
	unit.lng = 0;
}
local.state.units.push({
	id: "enemy",
	sideIndex: 1,
	health: 100,
	lat: 0,
	lng: 0,
});
local.state.areSidesHostile = (a, b) => a !== b;
local.state.getGridIndex = (_, lng) => (lng < 0 ? 0 : lng <= 2 ? 1 : 2);
local.state.landMask = new Uint8Array([1, 1, 1]);
local.state.dominantSideMap = new Int8Array([0, -1, 0]);
local.state.worldControlMap = new Uint16Array([1, 99, 1]);
local.state.activeTheaterCities = [
	{ id: "capital", lat: 0, lng: 10, isCapital: true },
];
let pathCalls = 0;
local.state.findLandPathSummary = () => {
	pathCalls++;
	return { reachable: true };
};
const near = local.ai.findOperationalWithdrawalAnchor(
	0,
	local.force,
	local.units.slice(0, 10),
);
assert.ok(
	near.lng < 0,
	"fallback must belong to this side rather than neutral land",
);
assert.ok(
	local.state.geoDistSq(near.lat, near.lng, 0, 0) <=
		AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_DISTANCE_SQ,
);
assert.ok(pathCalls <= 4);
pathCalls = 0;
local.state.findLandPathSummary = () => {
	pathCalls++;
	return { reachable: false };
};
const blocked = local.ai.findOperationalWithdrawalAnchor(
	0,
	local.force,
	local.units.slice(0, 10),
);
assert.deepEqual(blocked, { lat: 0, lng: 0 });
assert.equal(
	pathCalls,
	4,
	"unreachable candidates cannot cause unbounded path searches",
);

// Wrapped formations near the dateline must not get a fallback on another continent.
const wrapped = fixture(2, "CULMINATED");
wrapped.units[0].lng = 179.8;
wrapped.units[1].lng = -179.8;
const wrappedAnchor = wrapped.ai.findOperationalWithdrawalAnchor(
	0,
	wrapped.force,
	wrapped.units,
);
assert.ok(Math.abs(wrappedAnchor.lng) > 178);

const empty = fixture(0, "WITHDRAWING");
empty.tick(15);
assert.equal(
	empty.forces().length,
	0,
	"empty recovery forces must be removed immediately",
);

// No unreachable or continuously reinforced retreat may reserve formations forever.
const timeout = advanceAiTaskForce(
	{ ...spread.force, phaseStartedTick: 0 },
	{
		tick: AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_TICKS,
		currentPower: 100,
		withdrawalArrived: false,
	},
);
assert.equal(timeout.phase, "COMPLETE");
const recoveryTimeout = advanceAiTaskForce(
	{
		...spread.force,
		phase: "REGROUPING",
		phaseStartedTick: 0,
		launchPower: 100,
		recoveryPower: 10,
		lastRecoveryTick: 0,
	},
	{ tick: AI_TASK_FORCE_DEFAULTS.REGROUP_MAX_TICKS, currentPower: 30 },
);
assert.equal(recoveryTimeout.phase, "COMPLETE");

console.log(
	"AI retreat recovery, spread arrival, defense handoff, local fallback and timeout checks passed",
);
