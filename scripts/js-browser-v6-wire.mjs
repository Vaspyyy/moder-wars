#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(webRoot, "src/main.js"), "utf8");
const start = main.indexOf("function buildMidWarNativeRuntimeCheckpointV6");
const end = main.indexOf("function createNativeRuntimeCheckpoint", start);
assert.ok(start >= 0 && end > start, "browser v6 checkpoint exporter exists");
assert.match(
	main.slice(end, main.indexOf("window.nativeRuntimeCheckpoint", end)),
	/if \(version === 6\) return buildMidWarNativeRuntimeCheckpointV6\(options\)/,
	"checkpoint dispatcher exposes version 6",
);

const base = {
	schema: "native-runtime-checkpoint-v5",
	checkpointBoundary: "midWar",
	scenario: { sha256: "a".repeat(64), name: "wire", gridRes: 1 },
	geography: {},
	sides: [{ countryIds: [10] }, { countryIds: [20] }],
	activeSides: [0, 1],
	hostilityMatrix: [0, 1, 1, 0],
	tick: 600,
	frame: 400,
	warGraceEnd: 0,
	strategicCycle: 1,
	steps: 1,
	units: [
		{ id: 1, side: 0, countryId: 10, kind: "army" },
		{ id: 2, side: 0, countryId: 10, kind: "army" },
		{ id: 3, side: 0, countryId: 10, kind: "army" },
		{ id: 4, side: 0, countryId: 10, kind: "army" },
		{ id: 5, side: 1, countryId: 20, kind: "army" },
		{ id: 6, side: 1, countryId: 20, kind: "armor" },
	],
	economies: [{ countryId: 10 }, { countryId: 20 }],
	occupations: [],
	casualties: { 10: 0, 20: 0 },
	casualtiesByVictim: { 10: {}, 20: {} },
	territory: {},
	battlefield: {},
	influenceRuntime: {},
	sideDynamics: {},
	operationalAi: {
		schema: "native-operational-ai-v1",
		sides: [],
		taskForces: [],
		countryDesperation: [],
		overrideEvents: [],
		nextOverrideSequence: 1,
	},
};
const topology = {
	stable: [{ browserSideIndex: 0 }, { browserSideIndex: 1 }],
	browserToNativeSide: new Map([
		[0, 0],
		[1, 1],
	]),
};
const browserUnits = [
	{
		id: "unit-a",
		sideIndex: 0,
		kind: "army",
		health: 100,
		formationStrength: 1,
		lat: 50,
		lng: 5,
		navalAssigned: true,
	},
	{
		id: "unit-b",
		sideIndex: 0,
		kind: "army",
		health: 100,
		formationStrength: 1,
		lat: 50.2,
		lng: 5.2,
		navalAssigned: true,
	},
	{
		id: "unit-c",
		sideIndex: 0,
		kind: "army",
		health: 100,
		formationStrength: 1,
		lat: 49,
		lng: 4,
		supplyAssigned: true,
	},
	{
		id: "unit-d",
		sideIndex: 0,
		kind: "army",
		health: 100,
		formationStrength: 1,
		lat: 48,
		lng: 3,
		_transportPlanSignature: "0:TRANSPORT:50:7",
	},
	{
		id: "unit-e",
		sideIndex: 1,
		kind: "army",
		health: 100,
		formationStrength: 1,
		lat: 53,
		lng: 9,
		_defenderReactTarget: { lat: 51, lng: 7 },
	},
	{
		id: "unit-f",
		sideIndex: 1,
		kind: "armor",
		health: 100,
		formationStrength: 1,
		lat: 52,
		lng: 8,
	},
];
const invasion = {
	type: "NAVAL_INVASION",
	signature: "0:NAVAL_INVASION:51:7",
	phase: "LANDING",
	target: { lat: 51, lng: 7 },
	targetCountryId: 20,
	targetSideUid: "side-b",
	stagingPoint: { lat: 49, lng: 3 },
	arrowPoints: [
		{ lat: 49, lng: 3 },
		{ lat: 50, lng: 5 },
		{ lat: 51, lng: 7 },
	],
	maxAssignedUnits: 4,
	progress: 0.81,
	startedTick: 300,
	lastProgressTick: 390,
};
const supply = {
	type: "NAVAL_SUPPLY",
	signature: "0:NAVAL_SUPPLY:51:7",
	phase: "TRANSIT",
	target: { lat: 51, lng: 7 },
	stagingPoint: { lat: 49, lng: 3 },
	arrowPoints: [
		{ lat: 49, lng: 3 },
		{ lat: 51, lng: 7 },
	],
	maxAssignedUnits: 3,
	progress: 0.55,
	startedTick: 320,
	lastProgressTick: 370,
};
const transport = {
	type: "TRANSPORT",
	signature: "0:TRANSPORT:50:7",
	phase: "EXECUTION",
	target: { lat: 50, lng: 7 },
	arrowPoints: [
		{ lat: 48, lng: 3 },
		{ lat: 50, lng: 7 },
	],
	maxAssignedUnits: 5,
	progress: 0.25,
	startedTick: 340,
	lastProgressTick: 380,
};
const reaction = {
	type: "DEFEND",
	target: { lat: 51, lng: 7 },
	enemySideIdx: 0,
	phase: "EXECUTION",
	maxUnits: 3,
	activeUnitCount: 1,
	startedTick: 350,
	lastProgressTick: 390,
	_landingDefeatedTick: 395,
};
const browserAirfields = [
	{
		id: "airfield-a",
		lat: 49,
		lng: 3,
		ownerId: 10,
		controllerId: 10,
		sideIndex: 0,
		isCapital: true,
		health: 100,
		disabled: false,
		captureRepairCycles: 2,
	},
	{
		id: "airfield-b",
		lat: 52,
		lng: 9,
		ownerId: 20,
		controllerId: 20,
		sideIndex: 1,
		isCapital: false,
		health: 75,
		disabled: false,
		captureRepairCycles: 1,
	},
];
const browserAirWings = [
	{
		id: "fighter-a",
		role: "FIGHTER",
		sovereignId: 10,
		sideIndex: 0,
		equipment: 20,
		maxEquipment: 24,
		quality: 70,
		airfieldId: "airfield-a",
		lat: 50,
		lng: 5,
		state: "INTERCEPT",
		targetId: "strike-b",
		cooldownTicks: 0,
		rearmTicks: 0,
		enduranceTicks: 18,
		nextMissionTick: 600,
		forceMission: false,
	},
	{
		id: "strike-b",
		role: "STRIKE",
		sovereignId: 20,
		sideIndex: 1,
		equipment: 18,
		maxEquipment: 24,
		quality: 65,
		airfieldId: "airfield-b",
		lat: 51,
		lng: 7,
		state: "ATTACKING",
		targetId: "unit-a",
		targetType: "ARMY",
		cooldownTicks: 0,
		rearmTicks: 0,
		enduranceTicks: 0,
		nextMissionTick: null,
		forceMission: true,
	},
];
const navalPlans = [invasion, null];
const supplyPlans = [supply, null];
const transportPlans = [transport, null];
const defenderReactionPlans = [null, reaction];
const countryEquipment = new Map([
	[10, { airOperationsCoverage: 0.4 }],
]);

const exporter = Function(
	"buildMidWarNativeRuntimeCheckpointV5",
	"nativeRuntimeStableTopology",
	"units",
	"getLiveFormationStrength",
	"sides",
	"sideUids",
	"_navalPlan",
	"_navalSupplyPlan",
	"_transportPlan",
	"_defenderReactionPlan",
	"countryEquipment",
	"airfields",
	"airWings",
	"NATIVE_RUNTIME_CHECKPOINT_V6_SCHEMA",
	"NATIVE_OPERATIONAL_EXECUTION_SCHEMA",
	"NATIVE_AIR_POWER_SCHEMA",
	`"use strict";\n${main.slice(start, end)}\nreturn buildMidWarNativeRuntimeCheckpointV6;`,
)(
	() => structuredClone(base),
	() => topology,
	browserUnits,
	(unit) => unit.formationStrength,
	[[{ id: 10 }], [{ id: 20 }]],
	["side-a", "side-b"],
	navalPlans,
	supplyPlans,
	transportPlans,
	defenderReactionPlans,
	countryEquipment,
	browserAirfields,
	browserAirWings,
	"native-runtime-checkpoint-v6",
	"native-operational-execution-v1",
	"native-air-v2",
);

const first = exporter({ steps: 2 });
const second = exporter({ steps: 2 });
assert.deepEqual(first, second, "v6 export is deterministic");
assert.equal(JSON.stringify(first), JSON.stringify(second));
assert.equal(first.schema, "native-runtime-checkpoint-v6");
assert.equal(first.steps, 1, "the v5 exporter remains authoritative for baseline state");

assert.deepEqual(Object.keys(first.operationalExecution), [
	"schema",
	"navalOperations",
	"defenderReactions",
	"nextReactionSequence",
]);
assert.equal(
	first.operationalExecution.schema,
	"native-operational-execution-v1",
);
assert.deepEqual(
	first.operationalExecution.navalOperations.map((operation) => operation.kind),
	["INVASION", "SUPPLY", "FAST_TRANSPORT"],
);
const navalKeys = [
	"id",
	"signature",
	"kind",
	"phase",
	"side",
	"country",
	"enemySide",
	"maxAssignedUnits",
	"members",
	"staging",
	"target",
	"route",
	"routeIndex",
	"progress",
	"startedTick",
	"phaseStartedTick",
	"lastProgressTick",
	"completionReason",
];
for (const operation of first.operationalExecution.navalOperations) {
	assert.deepEqual(Object.keys(operation), navalKeys);
	assert.ok(Object.hasOwn(operation, "enemySide"));
	assert.ok(Object.hasOwn(operation, "completionReason"));
	assert.equal(operation.completionReason, null);
	for (const member of operation.members) {
		assert.deepEqual(Object.keys(member), ["unitId", "role", "assignedTick"]);
	}
}
const invasionWire = first.operationalExecution.navalOperations[0];
assert.equal(invasionWire.enemySide, 1);
assert.deepEqual(
	invasionWire.members.map((member) => member.unitId),
	[1, 2],
);
assert.deepEqual(invasionWire.route, [{ lat: 50, lng: 5 }]);
assert.equal(first.operationalExecution.navalOperations[1].enemySide, null);
assert.equal(first.operationalExecution.navalOperations[2].enemySide, null);

base.operationalAi.taskForces = [
	{ members: [{ unitId: 1 }, { unitId: 5 }] },
];
const taskForceClaimed = exporter();
assert.deepEqual(
	taskForceClaimed.operationalExecution.navalOperations
		.find((operation) => operation.kind === "INVASION")
		.members.map((member) => member.unitId),
	[2],
	"task-force ownership excludes the same unit from naval execution",
);
assert.deepEqual(
	taskForceClaimed.operationalExecution.defenderReactions[0].unitIds,
	[],
	"task-force ownership excludes the same unit from defender execution",
);
base.operationalAi.taskForces = [];
base.units[2].aiPolicy = { garrisonExcluded: true };
const garrisonClaimed = exporter();
assert.deepEqual(
	garrisonClaimed.operationalExecution.navalOperations.find(
		(operation) => operation.kind === "SUPPLY",
	).members,
	[],
	"garrison ownership excludes the same unit from naval execution",
);
delete base.units[2].aiPolicy;

assert.equal(first.operationalExecution.defenderReactions.length, 1);
const reactionWire = first.operationalExecution.defenderReactions[0];
assert.deepEqual(Object.keys(reactionWire), [
	"id",
	"sequence",
	"threatSignature",
	"side",
	"enemySide",
	"kind",
	"target",
	"unitIds",
	"maxUnits",
	"startedTick",
	"lastProgressTick",
	"bestDistanceSquared",
	"landingDefeatedTick",
]);
assert.equal(reactionWire.kind, "LANDING");
assert.equal(reactionWire.threatSignature, invasion.signature);
assert.deepEqual(reactionWire.unitIds, [5]);
assert.ok(Object.hasOwn(reactionWire, "bestDistanceSquared"));
assert.ok(Object.hasOwn(reactionWire, "landingDefeatedTick"));
assert.equal(first.operationalExecution.nextReactionSequence, 2);

assert.deepEqual(Object.keys(first.airPower), [
	"schema",
	"countryCoverage",
	"airfields",
	"wings",
]);
assert.equal(first.airPower.schema, "native-air-v2");
assert.deepEqual(first.airPower.countryCoverage, [
	{ countryId: 10, operationsCoverage: 0.4 },
	{ countryId: 20, operationsCoverage: 1 },
]);
for (const coverage of first.airPower.countryCoverage) {
	assert.deepEqual(Object.keys(coverage), [
		"countryId",
		"operationsCoverage",
	]);
}
assert.equal(first.airPower.airfields.length, 2);
assert.deepEqual(Object.keys(first.airPower.airfields[0]), [
	"id",
	"side",
	"ownerCountryId",
	"controllerCountryId",
	"lat",
	"lng",
	"capacity",
	"health",
	"disabled",
	"captureRepairCycles",
	"capital",
]);
assert.equal(first.airPower.airfields[0].capacity, 3);
assert.deepEqual(Object.keys(first.airPower.wings[0]), [
	"id",
	"side",
	"sovereignCountryId",
	"airfieldId",
	"returnAirfieldId",
	"role",
	"quality",
	"maxCount",
	"count",
	"lat",
	"lng",
	"state",
	"targetKind",
	"targetId",
	"rearmTicks",
	"cooldownTicks",
	"enduranceTicks",
	"nextMissionTick",
	"forceMission",
]);
for (const wing of first.airPower.wings) {
	for (const key of [
		"returnAirfieldId",
		"targetKind",
		"targetId",
		"nextMissionTick",
	])
		assert.ok(Object.hasOwn(wing, key), `wing includes nullable ${key}`);
}
assert.equal(first.airPower.wings[0].role, "FIGHTER");
assert.equal(first.airPower.wings[0].targetKind, "AIR_WING");
assert.equal(first.airPower.wings[0].targetId, 2);
assert.equal(first.airPower.wings[1].role, "STRIKE");
assert.equal(first.airPower.wings[1].targetKind, "ARMY");
assert.equal(first.airPower.wings[1].targetId, 1);
assert.equal(first.airPower.wings[1].nextMissionTick, null);

const savedNavalPlan = navalPlans[0];
navalPlans[0] = null;
base.operationalAi.taskForces = [
	{
		id: "same-target-not-attacking",
		sideIndex: 0,
		phase: "ASSEMBLING",
		target: { ...reaction.target },
		planSignature: "same-target-land-plan",
	},
];
const nonAttacking = exporter();
assert.deepEqual(
	nonAttacking.operationalExecution.defenderReactions,
	[],
	"same-target non-attacking task force does not continue a land reaction",
);
base.operationalAi.taskForces[0].phase = "ATTACKING";
const attacking = exporter();
assert.equal(attacking.operationalExecution.defenderReactions.length, 1);
assert.equal(
	attacking.operationalExecution.defenderReactions[0].threatSignature,
	"same-target-land-plan",
);
base.operationalAi.taskForces = [];
navalPlans[0] = savedNavalPlan;

countryEquipment.get(10).airOperationsCoverage = Number.NaN;
assert.throws(
	() => exporter(),
	/Native air coverage for country 10 is not finite/,
);
countryEquipment.get(10).airOperationsCoverage = 0.4;

navalPlans.fill(null);
supplyPlans.fill(null);
transportPlans.fill(null);
defenderReactionPlans.fill(null);
browserAirfields.length = 0;
browserAirWings.length = 0;
const empty = exporter();
assert.deepEqual(empty.operationalExecution, {
	schema: "native-operational-execution-v1",
	navalOperations: [],
	defenderReactions: [],
	nextReactionSequence: 1,
});
assert.deepEqual(empty.airPower, {
	schema: "native-air-v2",
	countryCoverage: [
		{ countryId: 10, operationsCoverage: 0.4 },
		{ countryId: 20, operationsCoverage: 1 },
	],
	airfields: [],
	wings: [],
});

console.log("browser v6 operational execution and air-power wire contract ok");
