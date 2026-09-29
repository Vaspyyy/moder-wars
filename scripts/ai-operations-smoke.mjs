import assert from "node:assert/strict";

import {
	AI_TASK_FORCE_DEFAULTS,
	advanceAiTaskForce,
	calculateTaskForceReadiness,
	cleanupAiTaskForces,
	createAiTaskForce,
	estimateUnitCombatPower,
	getAiPostureThresholds,
	reconcileAiTaskForces,
	selectWithdrawalAnchor,
} from "../src/ai-task-forces.js";

function rolePower(taskForce, units) {
	const byId = new Map(units.map((unit) => [String(unit.id), unit]));
	const totals = { SPEARHEAD: 0, LINE: 0, SUPPORT: 0, RESERVE: 0 };
	for (const [id, assignment] of Object.entries(taskForce.unitRoles)) {
		totals[assignment.role] += estimateUnitCombatPower(byId.get(id));
	}
	return totals;
}

assert.equal(getAiPostureThresholds("blitz").reserveShare, 0.1);
assert.equal(getAiPostureThresholds("balanced").launchReadiness, 0.75);
assert.equal(getAiPostureThresholds("turtle").reserveShare, 0.25);
assert.equal(AI_TASK_FORCE_DEFAULTS.CONSOLIDATION_TICKS, 300);

const coalitionUnits = Array.from({ length: 20 }, (_, index) => ({
	id: index >= 18 ? `s${index - 17}` : `p${String(index + 1).padStart(2, "0")}`,
	sideUid: "blue",
	countryId: index >= 18 ? "ally" : "lead",
	countryRole: index >= 18 ? "SUPPORT" : "PRIMARY",
	kind: "army",
	lat: 0,
	lng: 0,
	health: 100,
	maxHealth: 100,
	combatPower: 5,
}));
const pushPlan = {
	signature: "push:north",
	sideUid: "blue",
	planType: "PUSH_FRONT",
	posture: "BALANCED",
	stagingAnchor: { lat: 0, lng: 0 },
	target: { lat: 5, lng: 5 },
	desiredPower: 100,
	maxAssignedUnits: 20,
	priority: 10,
};
const [allocated] = reconcileAiTaskForces([], [pushPlan], coalitionUnits, {
	tick: 10,
});
assert.equal(allocated.assignedUnitIds.length, 20);
assert.deepEqual(rolePower(allocated, coalitionUnits), {
	SPEARHEAD: 20,
	LINE: 55,
	SUPPORT: 10,
	RESERVE: 15,
});
assert.equal(allocated.unitRoles.s1.role, "SUPPORT");
assert.equal(allocated.unitRoles.s2.role, "SUPPORT");
assert.equal(
	Object.values(allocated.unitRoles).filter(
		(assignment) => assignment.role === "SPEARHEAD",
	).length,
	4,
	"only part of the force should be a spearhead",
);

const [deterministicAllocation] = reconcileAiTaskForces(
	[],
	[structuredClone(pushPlan)],
	structuredClone(coalitionUnits).reverse(),
	{ tick: 10 },
);
assert.deepEqual(
	deterministicAllocation.assignedUnitIds,
	allocated.assignedUnitIds,
	"task-force membership must be deterministic regardless of input order",
);
assert.deepEqual(deterministicAllocation.unitRoles, allocated.unitRoles);
assert.deepEqual(deterministicAllocation.reserveUnitIds, allocated.reserveUnitIds);

const assignedBefore = [...allocated.assignedUnitIds];
const rolesBefore = structuredClone(allocated.unitRoles);
const [reconciled] = reconcileAiTaskForces(
	[allocated],
	[pushPlan],
	[
		...coalitionUnits.map((unit) => ({ ...unit, lat: 30, lng: 30 })),
		{
			id: "new-super-unit",
			sideUid: "blue",
			lat: 0,
			lng: 0,
			combatPower: 100,
		},
	],
	{ tick: 200 },
);
assert.deepEqual(reconciled.assignedUnitIds, assignedBefore);
assert.deepEqual(reconciled.unitRoles, rolesBefore);
assert.equal(reconciled.createdTick, 10);

const splitPlans = [
	{ ...pushPlan, signature: "push:a", desiredPower: 50, maxAssignedUnits: 10 },
	{
		...pushPlan,
		signature: "push:b",
		desiredPower: 50,
		maxAssignedUnits: 10,
		priority: 5,
	},
];
const splitForces = reconcileAiTaskForces([], splitPlans, coalitionUnits, {
	tick: 20,
});
assert.equal(splitForces.length, 2);
const firstMembership = new Set(splitForces[0].assignedUnitIds.map(String));
assert.equal(
	splitForces[1].assignedUnitIds.some((id) => firstMembership.has(String(id))),
	false,
	"a unit cannot belong to two task forces",
);

const readiness = calculateTaskForceReadiness(allocated, coalitionUnits);
assert.equal(readiness.readiness, 1);
assert.equal(readiness.currentPower, 100);

const [landingReceiver] = reconcileAiTaskForces(
	[
		createAiTaskForce({
			...pushPlan,
			signature: "landing-handoff",
			assignedUnitIds: ["p01"],
		}),
	],
	[
		{
			...pushPlan,
			signature: "landing-handoff",
			assignedUnitIds: ["p02", "p03"],
			desiredPower: 15,
		},
	],
	coalitionUnits,
	{ tick: 10 },
);
assert.deepEqual(
	new Set(landingReceiver.assignedUnitIds),
	new Set(["p01", "p02", "p03"]),
);

const assembling = createAiTaskForce({
	signature: "lifecycle",
	sideUid: "blue",
	posture: "BALANCED",
	desiredPower: 100,
	currentPower: 100,
	peakPower: 100,
	tick: 0,
});
assert.equal(
	advanceAiTaskForce(assembling, {
		tick: 1,
		readiness: 0.74,
		currentPower: 100,
	}).phase,
	"ASSEMBLING",
);
const attacking = advanceAiTaskForce(assembling, {
	tick: 1,
	readiness: 0.75,
	currentPower: 100,
});
assert.equal(attacking.phase, "ATTACKING");
assert.equal(attacking.launchPower, 100);
const culminated = advanceAiTaskForce(attacking, {
	tick: 2,
	currentPower: 54,
	progress: 0.1,
});
assert.equal(culminated.phase, "CULMINATED");
assert.equal(culminated.completionReason, "POWER_LOSS");

const withdrawalAnchor = selectWithdrawalAnchor(
	culminated,
	[
		{ id: "unsafe", sideUid: "blue", lat: 0, lng: 0, controlStrength: 1 },
		{ id: "rear", sideUid: "blue", lat: 5, lng: 0, controlStrength: 2 },
		{ id: "hostile", sideUid: "red", lat: 10, lng: 0, controlStrength: 9 },
	],
	{
		origin: { lat: 0, lng: 0 },
		enemyEstimates: [{ lat: 0, lng: 0 }],
	},
);
assert.equal(withdrawalAnchor.id, "rear");
const withdrawing = advanceAiTaskForce(culminated, {
	tick: 3,
	currentPower: 54,
	withdrawalAnchor,
});
assert.equal(withdrawing.phase, "WITHDRAWING");
const regrouping = advanceAiTaskForce(withdrawing, {
	tick: 4,
	currentPower: 54,
	withdrawalArrived: true,
});
assert.equal(regrouping.phase, "REGROUPING");
const regrouped = advanceAiTaskForce(regrouping, {
	tick: 5,
	currentPower: 70,
});
assert.equal(regrouped.phase, "COMPLETE");
assert.equal(regrouped.completionReason, "REGROUPED");
const steadilyRecovering = advanceAiTaskForce(
	{
		...regrouping,
		lastRecoveryTick: 4,
		recoveryPower: 54,
	},
	{
		tick: 1204,
		currentPower: 60,
	},
);
assert.equal(steadilyRecovering.phase, "REGROUPING");
assert.equal(steadilyRecovering.lastRecoveryTick, 1204);
assert.equal(steadilyRecovering.recoveryPower, 60);
const recoveryPlateau = advanceAiTaskForce(steadilyRecovering, {
	tick: 2404,
	currentPower: 60,
});
assert.equal(recoveryPlateau.phase, "COMPLETE");
assert.equal(recoveryPlateau.completionReason, "REGROUP_PLATEAU");

const stalled = advanceAiTaskForce(
	createAiTaskForce({
		signature: "stall",
		sideUid: "blue",
		phase: "ATTACKING",
		launchPower: 100,
		currentPower: 100,
		lastProgressTick: 0,
		tick: 0,
	}),
	{ tick: 600, currentPower: 100, forceRatio: 0.8 },
);
assert.equal(stalled.completionReason, "UNFAVORABLE_STALL");
for (const planType of ["DEFEND", "DEFEND_CITY"]) {
	const defensiveTaskForce = createAiTaskForce({
		signature: `hold:${planType}`,
		sideUid: "blue",
		planType,
		phase: "ATTACKING",
		launchPower: 100,
		currentPower: 100,
		lastProgressTick: 0,
		tick: 0,
	});
	const defensiveStall = advanceAiTaskForce(defensiveTaskForce, {
		tick: 600,
		currentPower: 100,
		forceRatio: 0.8,
	});
	assert.equal(defensiveStall.phase, "ATTACKING");
	assert.equal(defensiveStall.completionReason, null);
	assert.equal(
		advanceAiTaskForce(defensiveTaskForce, {
			tick: 600,
			currentPower: 54,
		}).completionReason,
		"POWER_LOSS",
	);
	assert.equal(
		advanceAiTaskForce(defensiveTaskForce, {
			tick: 600,
			currentPower: 100,
			supplyCollapsed: true,
		}).completionReason,
		"SUPPLY_COLLAPSE",
	);
	assert.equal(
		advanceAiTaskForce(defensiveTaskForce, {
			tick: 600,
			currentPower: 100,
			encirclementRiskSevere: true,
		}).completionReason,
		"ENCIRCLEMENT_RISK",
	);
}
const supplyCollapsed = advanceAiTaskForce(attacking, {
	tick: 2,
	currentPower: 100,
	supplyCollapsed: true,
});
assert.equal(supplyCollapsed.phase, "CULMINATED");
assert.equal(supplyCollapsed.completionReason, "SUPPLY_COLLAPSE");
const encirclementThreatened = advanceAiTaskForce(attacking, {
	tick: 2,
	currentPower: 100,
	encirclementRiskSevere: true,
});
assert.equal(encirclementThreatened.phase, "CULMINATED");
assert.equal(encirclementThreatened.completionReason, "ENCIRCLEMENT_RISK");

const consolidating = advanceAiTaskForce(attacking, {
	tick: 10,
	currentPower: 90,
	objectiveAchieved: true,
});
assert.equal(consolidating.phase, "CONSOLIDATING");
assert.equal(
	advanceAiTaskForce(consolidating, { tick: 309, currentPower: 90 }).phase,
	"CONSOLIDATING",
);
assert.equal(
	advanceAiTaskForce(consolidating, { tick: 310, currentPower: 90 }).phase,
	"COMPLETE",
);
const plateau = advanceAiTaskForce(
	createAiTaskForce({
		signature: "plateau",
		sideUid: "blue",
		phase: "REGROUPING",
		phaseStartedTick: 0,
		launchPower: 100,
		currentPower: 20,
		tick: 0,
	}),
	{ tick: 1200, currentPower: 20 },
);
assert.equal(plateau.completionReason, "REGROUP_PLATEAU");

const withDeadMember = {
	...allocated,
	assignedUnitIds: ["p01", "dead"],
	unitRoles: {
		p01: { role: "SPEARHEAD", assignedTick: 10 },
		dead: { role: "LINE", assignedTick: 10 },
	},
};
const cleaned = cleanupAiTaskForces(
	[withDeadMember, regrouped, { ...allocated, id: "inactive", sideUid: "red" }],
	{
		liveUnitIds: new Set(["p01"]),
		activeSideUids: new Set(["blue"]),
	},
);
assert.equal(cleaned.length, 1);
assert.deepEqual(cleaned[0].assignedUnitIds, ["p01"]);
assert.deepEqual(Object.keys(cleaned[0].unitRoles), ["p01"]);
assert.deepEqual(
	cleaned[0].reserveUnitIds,
	[],
	"cleanup must not retain reserve IDs for released formations",
);
console.log("AI operations smoke tests passed");
