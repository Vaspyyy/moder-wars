import assert from "node:assert/strict";
import {
	advanceAirfieldRepair,
	airInfrastructureIsAvailable,
	allocateAirWingMarkers,
	captureAirfield,
	COMBINED_ARMS_CONFIG,
	computeAirOperationsCost,
	computeArmorPayroll,
	computeEquipmentPersonnel,
	computeReplacementPurchase,
	countryMayDeployStrategicEquipment,
	getAircraftCommandPolicy,
	getAirfieldCapacity,
	getAlliedAirfieldCapacity,
	getArmorCombatMultiplier,
	getArmorInfluenceMultiplier,
	getArmorSpeedMultiplier,
	getQualityMultiplier,
	groupEquipment,
	isCombinedArmsFullyFunded,
	resolveEquipmentProfile,
	selectAirfieldSites,
	selectStrikeTarget,
	unitCountsAsOccupationGarrison,
	unitCountsForCapitulation,
} from "../src/combined-arms.js";
import {
	AIR_WING_STATES,
	evacuateDefeatedWings,
	findEligibleAirfield,
	runAirPowerTick,
} from "../src/air-power.js";

const fallbackInputs = {
	expectedArmyUnits: 100,
	economicStrength: 100,
	armorEnabled: true,
	airPowerEnabled: true,
};

assert.deepEqual(
	resolveEquipmentProfile({
		...fallbackInputs,
		timeEnabled: true,
		startDate: { year: 1913 },
	}).armoredVehicles,
	0,
);
assert.equal(
	resolveEquipmentProfile({
		...fallbackInputs,
		timeEnabled: true,
		startDate: { year: 1914 },
	}).fighters,
	38,
);
assert.equal(
	resolveEquipmentProfile({
		...fallbackInputs,
		timeEnabled: true,
		startDate: { year: 1916 },
	}).armoredVehicles,
	200,
);
assert.equal(
	resolveEquipmentProfile({
		...fallbackInputs,
		timeEnabled: true,
		startDate: { year: 1910 },
		metadata: { armoredVehicles: 17, fighters: 9, strikeAircraft: 4 },
	}).armoredVehicles,
	17,
);
assert.deepEqual(
	resolveEquipmentProfile({
		...fallbackInputs,
		metadata: { armoredVehicles: 0, fighters: 0, strikeAircraft: 0 },
	}),
	{
		armoredVehicles: 0,
		fighters: 0,
		strikeAircraft: 0,
		armorQuality: 50,
		airQuality: 50,
		basis: 100,
		explicit: { armor: true, fighters: true, strike: true },
	},
);
assert.equal(
	resolveEquipmentProfile({ ...fallbackInputs, armorEnabled: false })
		.armoredVehicles,
	0,
);
assert.equal(
	resolveEquipmentProfile({ ...fallbackInputs, airPowerEnabled: false })
		.fighters,
	0,
);
assert.equal(getQualityMultiplier(0), 0.75);
assert.equal(getQualityMultiplier(50), 1);
assert.equal(getQualityMultiplier(100), 1.25);

const armorGroups = groupEquipment(1207, 100, 12);
assert.equal(armorGroups.length, 12);
assert.equal(armorGroups.reduce((sum, value) => sum + value, 0), 1207);
assert.ok(Math.max(...armorGroups) - Math.min(...armorGroups) <= 1);

const wingAllocation = allocateAirWingMarkers(
	[
		{ countryId: 1, role: "FIGHTER", count: 240 },
		{ countryId: 1, role: "STRIKE", count: 96 },
		{ countryId: 2, role: "FIGHTER", count: 48 },
	],
	6,
);
assert.equal(wingAllocation.markers.length, 6);
assert.equal(
	wingAllocation.markers.reduce((sum, marker) => sum + marker.equipment, 0) +
		wingAllocation.reserves.reduce((sum, entry) => sum + entry.reserve, 0),
	384,
);
assert.ok(
	wingAllocation.markers.filter(
		(marker) => marker.countryId === 1 && marker.role === "FIGHTER",
	).length <= COMBINED_ARMS_CONFIG.MAX_WINGS_PER_ROLE_PER_COUNTRY,
);

const globallyCappedAllocation = allocateAirWingMarkers(
	Array.from({ length: 180 }, (_, index) => ({
		countryId: index + 1,
		role: index % 2 === 0 ? "FIGHTER" : "STRIKE",
		count: 96,
	})),
);
assert.equal(
	globallyCappedAllocation.markers.length,
	COMBINED_ARMS_CONFIG.MAX_ACTIVE_AIR_WINGS,
);
assert.equal(
	globallyCappedAllocation.markers.reduce(
		(sum, marker) => sum + marker.equipment,
		0,
	) +
		globallyCappedAllocation.reserves.reduce(
			(sum, entry) => sum + entry.reserve,
			0,
		),
	180 * 96,
);

assert.equal(computeArmorPayroll(100), 3);
assert.equal(
	computeAirOperationsCost({ fighters: 100, strikeAircraft: 100 }),
	2.5,
);
assert.equal(
	isCombinedArmsFullyFunded({
		payrollCoverage: 1,
		occupationCoverage: 1,
		arrearsCycles: 0,
	}),
	true,
);
assert.equal(
	isCombinedArmsFullyFunded({
		payrollCoverage: 1,
		occupationCoverage: 1,
		arrearsCycles: 1,
	}),
	false,
);
assert.deepEqual(
	computeReplacementPurchase({
		capacity: 1000,
		current: 900,
		unitCost: 0.05,
		budget: 1,
	}),
	{ purchased: 10, spent: 0.5 },
);
assert.deepEqual(
	computeReplacementPurchase({
		capacity: 40,
		current: 39,
		unitCost: 0.2,
		budget: 0.1,
	}),
	{ purchased: 0, spent: 0 },
);

assert.equal(
	getArmorCombatMultiplier("armor", "army", { supported: true }),
	2.3,
);
assert.equal(
	getArmorCombatMultiplier("army", "armor", { mountain: true }),
	0.8,
);
assert.equal(
	getArmorCombatMultiplier("armor", "army", { urban: true }),
	1,
);
assert.equal(getArmorSpeedMultiplier({}), 1.6);
assert.equal(getArmorSpeedMultiplier({ mountain: true }), 0.45);
assert.equal(getArmorInfluenceMultiplier(false), 0.25);
assert.equal(getArmorInfluenceMultiplier(true), 1);

assert.equal(
	computeEquipmentPersonnel({
		armoredVehicles: 100,
		fighters: 24,
		strikeAircraft: 24,
	}),
	248,
);
assert.equal(
	unitCountsForCapitulation({ kind: "armor", health: 10, equipment: 1 }),
	true,
);
assert.equal(
	unitCountsForCapitulation({ kind: "armor", health: 10, equipment: 0 }),
	false,
);
assert.equal(unitCountsForCapitulation({ health: 10 }), true);
assert.equal(unitCountsAsOccupationGarrison({ kind: "armor", health: 10 }), false);
assert.equal(unitCountsAsOccupationGarrison({ kind: "army", health: 10 }), true);
assert.equal(
	unitCountsAsOccupationGarrison({ kind: "aircraft", health: 10 }),
	false,
);
assert.equal(unitCountsForCapitulation({ kind: "aircraft", health: 100 }), false);
assert.equal(countryMayDeployStrategicEquipment({ isRebel: true }), false);
assert.equal(countryMayDeployStrategicEquipment({ isRebel: false }), true);
assert.equal(
	airInfrastructureIsAvailable({
		airPowerEnabled: true,
		timeEnabled: true,
		startDate: { year: 1913 },
		aircraftCapacity: 0,
	}),
	false,
);
assert.equal(
	airInfrastructureIsAvailable({
		airPowerEnabled: true,
		timeEnabled: true,
		startDate: { year: 1914 },
		aircraftCapacity: 0,
	}),
	true,
);

const fields = selectAirfieldSites([
	{ name: "Capital", lat: 0, lng: 0, pop: 10, isCapital: true },
	{ name: "Near", lat: 0.1, lng: 0.1, pop: 100 },
	{ name: "Far", lat: 5, lng: 5, pop: 50 },
]);
assert.deepEqual(
	fields.map((field) => field.name),
	["Capital", "Far"],
);
assert.equal(getAirfieldCapacity({ health: 100, isCapital: true }), 3);
assert.equal(getAirfieldCapacity({ health: 50, isCapital: true }), 1);
assert.equal(getAlliedAirfieldCapacity({ health: 100, isCapital: true }), 1);

const capturedField = captureAirfield(
	{
		id: "captured",
		ownerId: 1,
		controllerId: 1,
		sideIndex: 0,
		health: 100,
		disabled: false,
		captureRepairCycles: 2,
	},
	{ controllerId: 2, sideIndex: 1 },
);
assert.equal(capturedField.ownerId, 1);
assert.equal(capturedField.controllerId, 2);
assert.equal(capturedField.sideIndex, 1);
assert.equal(capturedField.health, 0);
assert.equal(capturedField.disabled, true);

let repair = advanceAirfieldRepair(
	{ health: 0, disabled: true, captureRepairCycles: 0 },
	{ fullyFunded: true, budget: 10 },
);
assert.equal(repair.field.health, 0);
repair = advanceAirfieldRepair(repair.field, {
	fullyFunded: true,
	budget: 10,
});
assert.equal(repair.field.health, 50);
assert.equal(repair.field.disabled, false);
repair = advanceAirfieldRepair(repair.field, {
	fullyFunded: true,
	budget: 10,
});
assert.equal(repair.field.health, 75);

assert.deepEqual(getAircraftCommandPolicy("PAID"), {
	fighters: "PATROL",
	strikes: true,
});
assert.deepEqual(getAircraftCommandPolicy("STRAINED"), {
	fighters: "HOME_DEFENSE",
	strikes: false,
});
assert.deepEqual(getAircraftCommandPolicy("MUTINY"), {
	fighters: "GROUNDED",
	strikes: false,
});

const target = selectStrikeTarget(
	{ lat: 0, lng: 0 },
	[
		{ id: 1, type: "ARMY", sideIndex: 1, lat: 1, lng: 1 },
		{
			id: 2,
			type: "ARMOR",
			sideIndex: 1,
			lat: 2,
			lng: 2,
			equipment: 50,
		},
		{ id: 3, type: "ARMOR", sideIndex: 2, lat: 0.5, lng: 0.5 },
	],
	{ isHostile: (sideIndex) => sideIndex === 1 },
);
assert.equal(target.target.id, 2);

const nationalField = {
	id: "national",
	ownerId: 1,
	sideIndex: 0,
	lat: 0,
	lng: 0,
	health: 100,
	isCapital: false,
};
const alliedField = {
	id: "allied",
	ownerId: 2,
	sideIndex: 0,
	lat: 1,
	lng: 1,
	health: 100,
	isCapital: false,
};
const rebasingWing = {
	id: "wing",
	sovereignId: 1,
	sideIndex: 0,
	lat: 0.5,
	lng: 0.5,
	state: AIR_WING_STATES.RETURNING,
};
assert.equal(
	findEligibleAirfield({
		wing: rebasingWing,
		airfields: [nationalField, alliedField],
		wings: [rebasingWing],
	}).id,
	"national",
);

const fullAlliedField = {
	...alliedField,
	controllerId: 2,
};
const stationedAlly = {
	id: "stationed-ally",
	sovereignId: 3,
	sideIndex: 0,
	airfieldId: fullAlliedField.id,
	state: AIR_WING_STATES.GROUNDED,
};
assert.equal(
	findEligibleAirfield({
		wing: rebasingWing,
		airfields: [fullAlliedField],
		wings: [stationedAlly, rebasingWing],
	}),
	null,
);

const evacuationWings = [
	{
		id: "evacuates",
		role: "FIGHTER",
		sovereignId: 1,
		sideIndex: 0,
		lat: 0,
		lng: 0,
		equipment: 12,
		state: AIR_WING_STATES.PATROL,
	},
	{
		id: "too-far",
		role: "STRIKE",
		sovereignId: 1,
		sideIndex: 0,
		lat: 80,
		lng: 80,
		equipment: 8,
		state: AIR_WING_STATES.GROUNDED,
	},
];
const evacuation = evacuateDefeatedWings({
	countryId: 1,
	sideIndex: 0,
	wings: evacuationWings,
	airfields: [{ ...alliedField, controllerId: 2 }],
	ferryRangeKm: 500,
});
assert.deepEqual(evacuation, { evacuatedAircraft: 12, lostAircraft: 8 });
assert.equal(evacuationWings.length, 1);
assert.equal(evacuationWings[0].state, AIR_WING_STATES.EVACUATED);

const combatFields = [
	{
		id: "fighter-base",
		ownerId: 1,
		controllerId: 1,
		sideIndex: 0,
		lat: 0,
		lng: 0,
		health: 100,
		isCapital: true,
	},
];
const combatWings = [
	{
		id: "interceptor",
		role: "FIGHTER",
		sovereignId: 1,
		sideIndex: 0,
		lat: 0,
		lng: 0,
		equipment: 24,
		maxEquipment: 24,
		quality: 50,
		airfieldId: "fighter-base",
		state: AIR_WING_STATES.PATROL,
		forceMission: true,
	},
	{
		id: "hostile-strike",
		role: "STRIKE",
		sovereignId: 2,
		sideIndex: 1,
		lat: 0,
		lng: 0,
		equipment: 24,
		maxEquipment: 24,
		quality: 50,
		state: AIR_WING_STATES.ATTACKING,
	},
	{
		id: "neutral-strike",
		role: "STRIKE",
		sovereignId: 3,
		sideIndex: 2,
		lat: 0,
		lng: 0,
		equipment: 24,
		maxEquipment: 24,
		quality: 50,
		state: AIR_WING_STATES.ATTACKING,
	},
];
const equipmentStates = new Map(
	[1, 2, 3].map((countryId) => [
		countryId,
		{ airOperationsCoverage: 1 },
	]),
);
const economyStates = new Map(
	[1, 2, 3].map((countryId) => [countryId, { commandBand: "PAID" }]),
);
runAirPowerTick({
	tick: 0,
	wings: combatWings,
	airfields: combatFields,
	units: [],
	countryEquipment: equipmentStates,
	countryEconomy: economyStates,
	areSidesHostile: (a, b) => (a === 0 && b === 1) || (a === 1 && b === 0),
	applyStrikeDamage: () => {},
	applyAirLoss: (wing, loss) => {
		wing.equipment -= loss;
	},
	onEvent: () => {},
	runtime: { lastMissionTick: 0, lastUpdateMs: 0 },
});
assert.ok(combatWings.find((wing) => wing.id === "hostile-strike").equipment < 24);
assert.equal(
	combatWings.find((wing) => wing.id === "neutral-strike").equipment,
	24,
);

const persistentStrikeWing = {
	id: "persistent-strike",
	role: "STRIKE",
	sovereignId: 1,
	sideIndex: 0,
	lat: 0,
	lng: 0,
	equipment: 24,
	maxEquipment: 24,
	quality: 50,
	airfieldId: "fighter-base",
	state: AIR_WING_STATES.GROUNDED,
	cooldownTicks: 0,
	forceMission: true,
};
const strikeTargetUnit = {
	id: 99,
	kind: "army",
	sideIndex: 1,
	lat: 0.3,
	lng: 0,
	health: 100,
};
let strikeDamage = 0;
const strikeRuntime = { lastMissionTick: 0, lastUpdateMs: 0 };
for (let tick = 0; tick <= 48; tick += 6) {
	runAirPowerTick({
		tick,
		wings: [persistentStrikeWing],
		airfields: combatFields,
		units: [strikeTargetUnit],
		countryEquipment: equipmentStates,
		countryEconomy: economyStates,
		areSidesHostile: (a, b) =>
			(a === 0 && b === 1) || (a === 1 && b === 0),
		applyStrikeDamage: (_target, damage) => {
			strikeDamage += damage;
		},
		applyAirLoss: () => {},
		onEvent: () => {},
		runtime: strikeRuntime,
	});
}
assert.ok(strikeDamage > 0);
assert.notEqual(persistentStrikeWing.state, AIR_WING_STATES.ATTACKING);

const scenarioRoundTrip = JSON.parse(
	JSON.stringify({
		armorEnabled: false,
		airPowerEnabled: true,
		timeEnabled: true,
		startDate: { year: 1916, month: 1, day: 1 },
		metadata: [
			{
				id: 1,
				armoredVehicles: 0,
				fighters: 17,
				strikeAircraft: 9,
				armorQuality: 61,
				airQuality: 72,
			},
		],
	}),
);
assert.deepEqual(scenarioRoundTrip.startDate, { year: 1916, month: 1, day: 1 });
assert.equal(scenarioRoundTrip.metadata[0].armoredVehicles, 0);
assert.equal(scenarioRoundTrip.metadata[0].fighters, 17);
assert.equal(scenarioRoundTrip.metadata[0].airQuality, 72);

console.log("Combined arms smoke tests passed.");
