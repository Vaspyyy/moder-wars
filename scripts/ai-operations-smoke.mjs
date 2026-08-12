import assert from "node:assert/strict";

import {
	AI_INTEL_DEFAULTS,
	createAiIntelObserverSnapshot,
	createAiIntelState,
	decayAiIntel,
	estimateAiIntelArea,
	estimateObservedCombatPower,
	expireAiIntel,
	refreshAiIntel,
	setAiIntelHostilities,
	shouldScanAiIntel,
} from "../src/ai-intel.js";
import {
	AI_TASK_FORCE_DEFAULTS,
	advanceAiTaskForce,
	calculateTaskForceReadiness,
	cleanupAiTaskForces,
	createAiTaskForce,
	createAiTaskForceObserverSnapshot,
	estimateUnitCombatPower,
	getAiPostureThresholds,
	reconcileAiTaskForces,
	selectWithdrawalAnchor,
} from "../src/ai-task-forces.js";

function seededRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function rolePower(taskForce, units) {
	const byId = new Map(units.map((unit) => [String(unit.id), unit]));
	const totals = { SPEARHEAD: 0, LINE: 0, SUPPORT: 0, RESERVE: 0 };
	for (const [id, assignment] of Object.entries(taskForce.unitRoles)) {
		totals[assignment.role] += estimateUnitCombatPower(byId.get(id));
	}
	return totals;
}

assert.deepEqual(AI_INTEL_DEFAULTS, {
	SCAN_INTERVAL_TICKS: 150,
	FRESH_TICKS: 300,
	STALE_TICKS: 1200,
	EXPIRE_TICKS: 1800,
});

const observations = [
	{
		unitId: "red-visible",
		enemySideUid: "red",
		sectorId: "blue-red-north",
		countryId: "R1",
		lat: 10,
		lng: 179.8,
		kind: "armor",
		combatPower: 12,
		detectionChance: 1,
		errorRadiusDeg: 0.5,
		powerErrorFraction: 0.2,
		confidence: 0.9,
		source: "air-recon",
	},
	{
		unitId: "red-hidden",
		enemySideUid: "red",
		sectorId: "blue-red-north",
		lat: 11,
		lng: 12,
		visible: false,
	},
	{
		unitId: "green-neutral",
		enemySideUid: "green",
		lat: 0,
		lng: 0,
	},
];

const blueIntel = createAiIntelState("blue", {
	hostileSideUids: ["red"],
});
assert.equal(shouldScanAiIntel(blueIntel, 0), true);
const firstRefresh = refreshAiIntel(blueIntel, observations, {
	tick: 150,
	rng: seededRng(12345),
});
const repeatedRefresh = refreshAiIntel(blueIntel, observations, {
	tick: 150,
	rng: seededRng(12345),
});
assert.deepEqual(firstRefresh, repeatedRefresh, "seeded scans must repeat");
assert.deepEqual(Object.keys(firstRefresh.contacts), [
	"red:blue-red-north:red-visible",
]);
assert.equal(
	firstRefresh.contacts[Object.keys(firstRefresh.contacts)[0]].sectorId,
	"blue-red-north",
);
assert.equal(shouldScanAiIntel(firstRefresh, 299), false);
assert.equal(shouldScanAiIntel(firstRefresh, 300), true);

const staleIntel = decayAiIntel(firstRefresh, 451);
assert.equal(Object.values(staleIntel.contacts)[0].status, "STALE");
assert.ok(
	Object.values(staleIntel.contacts)[0].confidence <
		Object.values(firstRefresh.contacts)[0].confidence,
);
const degradedIntel = decayAiIntel(firstRefresh, 1351);
assert.equal(Object.values(degradedIntel.contacts)[0].status, "DEGRADED");
assert.equal(Object.keys(expireAiIntel(firstRefresh, 1951).contacts).length, 0);

const areaEstimate = estimateAiIntelArea(staleIntel, {
	tick: 451,
	center: { lat: 10, lng: 180 },
	radiusSq: 4,
});
assert.equal(areaEstimate.contactCount, 1);
assert.ok(areaEstimate.estimatedPower > 0);
assert.equal(createAiIntelObserverSnapshot(staleIntel, 451).contacts.length, 1);

const greenIntel = refreshAiIntel(
	createAiIntelState("green", { hostileSideUids: ["blue"] }),
	observations,
	{ tick: 150, rng: seededRng(12345) },
);
assert.equal(
	Object.keys(greenIntel.contacts).length,
	0,
	"an observer must not inherit another observer's enemy contacts",
);

const ffaObservations = ["alpha", "bravo", "charlie"].map((side, index) => ({
	unitId: `${side}-unit`,
	enemySideUid: side,
	lat: index,
	lng: index,
	detectionChance: 1,
}));
const alphaIntel = refreshAiIntel(
	createAiIntelState("alpha", { hostileSideUids: ["bravo", "charlie"] }),
	ffaObservations,
	{ tick: 0, rng: seededRng(8) },
);
const bravoIntel = refreshAiIntel(
	createAiIntelState("bravo", { hostileSideUids: ["alpha"] }),
	ffaObservations,
	{ tick: 0, rng: seededRng(8) },
);
assert.deepEqual(
	new Set(
		Object.values(alphaIntel.contacts).map((contact) => contact.enemySideUid),
	),
	new Set(["bravo", "charlie"]),
);
assert.deepEqual(
	new Set(
		Object.values(bravoIntel.contacts).map((contact) => contact.enemySideUid),
	),
	new Set(["alpha"]),
);
assert.equal(
	Object.keys(setAiIntelHostilities(alphaIntel, ["charlie"]).contacts).length,
	1,
);
assert.equal(
	estimateObservedCombatPower(
		{ kind: "armor", health: 50, maxHealth: 100, equipment: 400 },
		{ armorEnabled: false },
	),
	0.5,
);
assert.equal(
	estimateObservedCombatPower(
		{ kind: "air", health: 25, maxHealth: 100, equipment: 400 },
		{ airPowerEnabled: false },
	),
	0.25,
);

assert.equal(getAiPostureThresholds("blitz").reserveShare, 0.1);
assert.equal(getAiPostureThresholds("balanced").launchReadiness, 0.75);
assert.equal(getAiPostureThresholds("turtle").reserveShare, 0.25);
assert.equal(AI_TASK_FORCE_DEFAULTS.CONSOLIDATION_TICKS, 300);

const coalitionUnits = Array.from({ length: 20 }, (_, index) => ({
	id: index >= 18 ? `s${index - 17}` : `p${String(index + 1).padStart(2, "0")}`,
	sideUid: "blue",
	countryId: index >= 18 ? "ally" : "lead",
	countryRole: index >= 18 ? "SUPPORT" : "PRIMARY",
	kind: index < 4 ? "armor" : "army",
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
	"armor must not make every armored formation a spearhead",
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

const spearheadPriorityUnits = [
	{
		id: "armor-best",
		sideUid: "blue",
		kind: "armor",
		armorSupported: true,
		terrainSuitable: true,
		combatPower: 1,
	},
	{
		id: "armor-supported",
		sideUid: "blue",
		kind: "armor",
		armorSupported: true,
		combatPower: 1,
	},
	{
		id: "armor-terrain",
		sideUid: "blue",
		kind: "armor",
		terrainSuitable: true,
		combatPower: 1,
	},
	{
		id: "armor-plain",
		sideUid: "blue",
		kind: "armor",
		combatPower: 1,
	},
	...Array.from({ length: 5 }, (_, index) => ({
		id: `line-${index + 1}`,
		sideUid: "blue",
		kind: "army",
		combatPower: 1,
	})),
	{
		id: "support-ally",
		sideUid: "blue",
		kind: "army",
		countryRole: "SUPPORT",
		combatPower: 1,
	},
];
const [spearheadPriorityForce] = reconcileAiTaskForces(
	[],
	[
		{
			...pushPlan,
			signature: "spearhead-priority",
			desiredPower: 10,
			maxAssignedUnits: 10,
		},
	],
	spearheadPriorityUnits,
	{ tick: 10 },
);
assert.equal(spearheadPriorityForce.unitRoles["armor-best"].role, "SPEARHEAD");
assert.equal(
	spearheadPriorityForce.unitRoles["armor-supported"].role,
	"SPEARHEAD",
);
assert.notEqual(
	spearheadPriorityForce.unitRoles["armor-plain"].role,
	"SPEARHEAD",
);

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

const fallbackUnits = [
	{
		id: "fallback-armor",
		sideUid: "blue",
		kind: "armor",
		health: 50,
		maxHealth: 100,
		equipment: 400,
		lat: 0,
		lng: 0,
	},
	{
		id: "fallback-air",
		sideUid: "blue",
		kind: "air",
		health: 25,
		maxHealth: 100,
		equipment: 400,
		lat: 0,
		lng: 0,
	},
];
const [fallbackForce] = reconcileAiTaskForces(
	[],
	[
		{
			...pushPlan,
			signature: "fallback",
			desiredPower: 1,
			maxAssignedUnits: 2,
		},
	],
	fallbackUnits,
	{
		tick: 0,
		capabilities: { armorEnabled: false, airPowerEnabled: false },
	},
);
assert.deepEqual(
	new Set(fallbackForce.assignedUnitIds),
	new Set(["fallback-armor", "fallback-air"]),
);
assert.equal(fallbackForce.currentPower, 0.75);
assert.ok(
	Object.values(fallbackForce.unitRoles).some((assignment) =>
		["LINE", "SPEARHEAD"].includes(assignment.role),
	),
);

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
	assert.equal(
		advanceAiTaskForce(defensiveTaskForce, {
			tick: 600,
			currentPower: 100,
			severeSurprise: true,
		}).completionReason,
		"SEVERE_SURPRISE",
	);
}
const surprised = advanceAiTaskForce(attacking, {
	tick: 2,
	currentPower: 100,
	severeSurprise: true,
});
assert.equal(surprised.completionReason, "SEVERE_SURPRISE");
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

const contractTaskForce = createAiTaskForce({
	signature: "contract-roundtrip",
	sideUid: "blue",
	assignedUnitIds: ["line-1", "line-2"],
	reserveUnitIds: ["line-2"],
	unitRoles: {
		"line-1": { role: "LINE", assignedTick: 20 },
		"line-2": { role: "RESERVE", assignedTick: 20 },
	},
	supportRequest: {
		fighter: true,
		strike: true,
		sectorId: "blue-red-north",
		target: { lat: 5, lng: 5 },
	},
	outcome: "REGROUPED",
	tick: 20,
});
const [contractSnapshot] = createAiTaskForceObserverSnapshot(
	[contractTaskForce],
).taskForces;
assert.deepEqual(contractSnapshot.reserveUnitIds, ["line-2"]);
assert.deepEqual(contractSnapshot.supportRequest, {
	fighter: true,
	strike: true,
	sectorId: "blue-red-north",
	target: { lat: 5, lng: 5 },
});
assert.equal(contractSnapshot.outcome, "REGROUPED");

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
const observerSnapshot = createAiTaskForceObserverSnapshot(
	cleaned,
	staleIntel,
	451,
);
assert.equal(observerSnapshot.taskForces.length, 1);
assert.equal(observerSnapshot.intel.contactCount, 1);

console.log("AI operations smoke tests passed");
