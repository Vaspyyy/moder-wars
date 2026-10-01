import assert from "node:assert/strict";
import {
	allocateArmyCoverage,
	buildArmySectors,
	formationOffset,
	issueArmyOrder,
	measureOperation,
	replenishArmyFormation,
} from "../src/army-command.js";
import {
	armyPocketClosed,
	findArmyEncirclement,
} from "../src/army-encirclement.js";
import {
	ARMY_NAVIGATION,
	armyDistanceSq,
	createArmyNavigator,
	executeArmyOrder,
} from "../src/army-navigation.js";
import { createAiRuntime } from "../src/ai-runtime.js";
import {
	createAiTaskForce,
	advanceAiTaskForce,
} from "../src/ai-task-forces.js";
import { executeGroundTarget } from "../src/ground-movement.js";
import { captureSimulationState } from "../src/simulation-protocol.js";
import { createSimulationCore } from "../src/simulation-core.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

function world(width = 40, height = 30, res = 0.5) {
	const n = width * height;
	const state = {
		CONFIG: {
			GRID_RES: res,
			UNIT_SPEED: res * 0.2,
			UNIT_HEALTH: 100,
			UNIT_TO_SOLDIER_RATIO: 1000,
			ATTRITION_DAMAGE: 0.01,
		},
		gridWidth: width,
		gridHeight: height,
		landMask: new Uint8Array(n).fill(1),
		dominantSideMap: new Int8Array(n),
		worldControlMap: new Uint16Array(n).fill(1),
		terrainMask: new Float32Array(n),
		countryToSideMap: new Map([
			[1, 0],
			[2, 1],
			[3, 2],
		]),
		units: [],
		_simTickCount: 0,
		areSidesHostile: (a, b) => a >= 0 && b >= 0 && a !== b && a < 2 && b < 2,
		getGridIndex(lat, lng) {
			const r = Math.floor((lat + 90) / res),
				c = Math.floor((lng + 180) / res);
			return r >= 0 && r < height && c >= 0 && c < width ? r * width + c : -1;
		},
		operationalUnitPower: (u) => u.health / 100,
		_frontlinePolys: {},
		activeTheaterCities: [],
		estimateLocalForces: () => ({ enemyHealth: 0, friendlyHealth: 1 }),
	};
	state.point = (r, c) => ({
		lat: (r + 0.5) * res - 90,
		lng: (c + 0.5) * res - 180,
	});
	return state;
}
function march(state, unit, target, type = "MOVE", limit = 500) {
	const nav = createArmyNavigator(state),
		visited = new Map();
	issueArmyOrder(
		unit,
		{ owner: "test", target, type, speed: 1, reason: "TEST_ROUTE" },
		0,
	);
	state.units = [unit];
	const frame = {
		getArmyMovement: (u, order) => nav.direction(u, order, state._simTickCount),
		isArmyCellPassable: nav.passable,
	};
	let changedCells = 0,
		prev = -1;
	for (let tick = 0; tick < limit; tick++) {
		state._simTickCount = tick;
		nav.beginTick(tick);
		assert.ok(nav.stats().expanded <= ARMY_NAVIGATION.NODE_BUDGET);
		executeArmyOrder({
			u: unit,
			frame,
			CONFIG: state.CONFIG,
			speedBuffMult: 1,
			aiProfile: { speedMult: 1 },
			isEncircled: false,
			getGridIndex: state.getGridIndex,
			isNeutralCountry: () => false,
			currentIdx: state.getGridIndex(unit.lat, unit.lng),
			recordDamage: () => {},
			damageTakenMult: 1,
		});
		const cell = state.getGridIndex(unit.lat, unit.lng);
		assert.ok(state.landMask[cell], "never enter water");
		assert.notEqual(
			state.dominantSideMap[cell],
			2,
			"never enter neutral territory",
		);
		if (cell !== prev) {
			visited.set(cell, (visited.get(cell) || 0) + 1);
			changedCells++;
			prev = cell;
		}
		if (unit._armyMoveStatus === "ARRIVED")
			return { unit, nav, changedCells, visited };
	}
	throw new Error(
		`Route failed: ${unit._armyMoveStatus} at ${JSON.stringify(unit)} toward ${JSON.stringify(target)}`,
	);
}

// U-shaped water forces the route away from the objective before it can approach.
const coast = world();
for (let r = 5; r <= 23; r++) coast.landMask[r * 40 + 20] = 0;
const walker = {
	id: 1,
	...coast.point(15, 12),
	health: 100,
	maxHealth: 100,
	sideIndex: 0,
	deployTicks: 0,
};
const detour = march(coast, walker, coast.point(15, 26));
assert.ok(detour.changedCells > 14, "must take a detour");
assert.ok(
	Math.max(...detour.visited.values()) <= 2,
	"no repeated circling around the barrier",
);
const settled = { lat: walker.lat, lng: walker.lng };
for (let tick = 501; tick < 550; tick++) {
	detour.nav.beginTick(tick);
	assert.equal(
		detour.nav.direction(walker, walker._armyOrder, tick).status,
		"ARRIVED",
	);
}
assert.deepEqual(
	{ lat: walker.lat, lng: walker.lng },
	settled,
	"holding must not jitter",
);

// The same navigation respects neutral access and lets a retreat escape hostile ground.
const neutral = world();
for (let r = 5; r <= 23; r++) {
	neutral.dominantSideMap[r * 40 + 20] = 2;
	neutral.worldControlMap[r * 40 + 20] = 3;
}
march(
	neutral,
	{ id: 2, ...neutral.point(15, 12), health: 100, sideIndex: 0 },
	neutral.point(15, 26),
);
const retreat = world();
for (let r = 0; r < 30; r++)
	for (let c = 20; c < 40; c++) retreat.dominantSideMap[r * 40 + c] = 1;
march(
	retreat,
	{ id: 3, ...retreat.point(15, 25), health: 100, sideIndex: 0 },
	retreat.point(15, 15),
	"WITHDRAW",
);

// Disconnected goals are reported, not replaced with random motion.
const island = world();
for (let r = 0; r < 30; r++) island.landMask[r * 40 + 20] = 0;
const isolatedNav = createArmyNavigator(island),
	stranded = { id: 4, ...island.point(15, 12), health: 100, sideIndex: 0 };
issueArmyOrder(
	stranded,
	{ owner: "island", target: island.point(15, 27), type: "MOVE" },
	0,
);
let unreachable = false;
for (let tick = 0; tick < 30; tick++) {
	isolatedNav.beginTick(tick);
	unreachable ||=
		isolatedNav.direction(stranded, stranded._armyOrder, tick).status ===
		"UNREACHABLE";
}
assert.ok(unreachable);

// Route sharing has one global work budget even when 1,200 units ask for orders.
const shared = world(80, 40);
shared.units = Array.from({ length: 1200 }, (_, id) => ({
	id,
	...shared.point(20, 5),
	health: 100,
	sideIndex: 0,
}));
const sharedNav = createArmyNavigator(shared);
for (const unit of shared.units) {
	issueArmyOrder(
		unit,
		{
			owner: "shared",
			target: shared.point(20, 60 + (unit.id % 3)),
			type: "MOVE",
		},
		0,
	);
	sharedNav.direction(unit, unit._armyOrder, 0);
}
assert.equal(sharedNav.stats().fields, 1);
sharedNav.beginTick(1);
assert.ok(sharedNav.stats().expanded <= ARMY_NAVIGATION.NODE_BUDGET);

// Defense gets every sector covered before offense; stronger threats get more power.
const sectors = Array.from({ length: 3 }, (_, i) => ({
	id: `s${i}`,
	hold: { lat: i * 2, lng: 0 },
	anchor: { lat: i * 2, lng: 0 },
	priority: i === 2 ? 10 : 1,
	enemyPower: i === 2 ? 10 : 0,
}));
const troops = Array.from({ length: 50 }, (_, id) => ({
	id,
	lat: 0,
	lng: 0,
	health: 100,
	maxHealth: 100,
	combatPower: 1,
	deployed: true,
	commandEligible: true,
}));
troops[0].health = 20;
let coverage = allocateArmyCoverage(sectors, troops);
assert.equal(coverage.recovering.length, 1);
assert.ok(sectors.every((s) => s.assignedUnitIds.length > 0));
assert.ok(sectors[2].assignedPower > sectors[0].assignedPower);
assert.ok(
	coverage.reserved.size < troops.length,
	"leave a genuine offensive pool",
);
for (const allocation of coverage.allocations)
	allocation.unit.sectorId = allocation.sector.id;
const previous = coverage.allocations.map((a) => [a.unit.id, a.sector.id]);
coverage = allocateArmyCoverage(sectors, troops);
assert.deepEqual(
	coverage.allocations.map((a) => [a.unit.id, a.sector.id]),
	previous,
	"stable assignment when world is unchanged",
);
const offsets = Array.from({ length: 500 }, (_, i) => formationOffset(i, 500));
assert.equal(new Set(offsets.map((p) => `${p.lateral}:${p.depth}`)).size, 500);

// Real sector construction and formation allocation reserve distinct reachable cells.
const front = world(80, 40, 0.25);
for (let r = 0; r < 40; r++)
	for (let c = 40; c < 80; c++) front.dominantSideMap[r * 80 + c] = 1;
front._frontlinePolys = {
	"0_1": Array.from({ length: 36 }, (_, r) => front.point(r + 2, 40)),
};
const nav = createArmyNavigator(front);
front.units = [
	{
		id: "threat",
		...front.point(12, 42),
		sideIndex: 1,
		health: 100,
		deployTicks: 0,
	},
];
const built = buildArmySectors(front, 0, [], nav);
assert.equal(
	built.reduce((sum, sector) => sum + sector.enemyPower, 0),
	1,
	"neighboring sectors cannot count the same threat twice",
);
assert.ok(built.length >= 3);
assert.equal(
	new Set(buildArmySectors(front, 0, built, nav).map((s) => s.id)).size,
	built.length,
);
const runtime = {
	...front,
	_frontIntelBySide: [],
	sides: [[{ id: 1 }], [{ id: 2 }]],
	sideUids: ["blue", "red"],
	countryMetadata: [{ id: 1 }, { id: 2 }],
	getEffectiveBuffState: () => "none",
	getLiveFormationStrength: (u) => u.health / 100,
	lngDelta: (a, b) => a - b,
	geoDistSq: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2,
};
const ai = createAiRuntime(runtime);
const formation = Array.from({ length: 100 }, (_, id) => ({
	id,
	...front.point(20, 10),
	health: 100,
	maxHealth: 100,
	sideIndex: 0,
	sovereignId: 1,
	deployTicks: 0,
}));
const force = createAiTaskForce({
	signature: "spread",
	sideUid: "blue",
	assignedUnitIds: formation.map((u) => u.id),
	phase: "ASSEMBLING",
	stagingAnchor: front.point(20, 30),
	target: front.point(20, 60),
	unitRoles: Object.fromEntries(
		formation.map((u) => [u.id, { role: "LINE", assignedTick: 0 }]),
	),
});
ai.assignOperationalTaskForceOrders(
	0,
	force,
	null,
	new Map(formation.map((u) => [String(u.id), u])),
);
assert.equal(
	new Set(
		formation.map((u) =>
			front.getGridIndex(u._armyOrder.target.lat, u._armyOrder.target.lng),
		),
	).size,
	formation.length,
);
assert.ok(
	formation.every((u) =>
		nav.passable(
			front.getGridIndex(u._armyOrder.target.lat, u._armyOrder.target.lng),
			0,
			true,
		),
	),
);
assert.ok(
	formation.every((u) => u._armyOrder.friendlyOnly),
	"assembly remains on friendly land until launch",
);

// A lone leader cannot drag operation progress forward or claim a captured objective.
const objective = world();
const routeForce = {
	stagingAnchor: objective.point(15, 5),
	target: objective.point(15, 25),
	route: [],
};
const members = Array.from({ length: 10 }, (_, id) => ({
	id,
	...(id === 0 ? routeForce.target : routeForce.stagingAnchor),
	health: 100,
	sideIndex: 0,
}));
let assessment = measureOperation(routeForce, members, objective);
assert.ok(assessment.advance < 0.15);
assert.equal(assessment.achieved, false);
for (const unit of members) Object.assign(unit, routeForce.target);
assessment = measureOperation(routeForce, members, objective);
assert.equal(assessment.achieved, true);
objective.dominantSideMap[15 * 40 + 15] = 1;
assert.equal(
	measureOperation(routeForce, members, objective).achieved,
	false,
	"capturing the tip without a corridor is insufficient",
);

// A geography-verified pincer closes a neck; reopening an escape invalidates it.
const pocket = world(40, 40, 0.25);
for (let r = 10; r <= 15; r++)
	for (let c = 15; c <= 23; c++) pocket.dominantSideMap[r * 40 + c] = 1;
for (let r = 0; r < 10; r++) pocket.dominantSideMap[r * 40 + 19] = 1;
const encirclement = findArmyEncirclement(pocket, 0, pocket.point(12, 19));
assert.ok(encirclement, "find a narrow enemy neck with two friendly shoulders");
assert.equal(armyPocketClosed(pocket, 0, encirclement), false);
for (const cell of encirclement.closureCells) pocket.dominantSideMap[cell] = 0;
assert.equal(armyPocketClosed(pocket, 0, encirclement), true);
pocket.dominantSideMap[encirclement.closureCells[0]] = 1;
assert.equal(armyPocketClosed(pocket, 0, encirclement), false);
assert.equal(
	findArmyEncirclement(world(40, 40), 0, pocket.point(12, 19)),
	null,
);

// No magic healing: reserve-to-formation transfer conserves living personnel.
const depleted = {
	id: 100,
	...objective.point(15, 5),
	health: 20,
	maxHealth: 100,
	sideIndex: 0,
	personnel: 200,
	personnelCapacity: 1000,
	_armyRecovering: true,
	_armyMoveStatus: "ARRIVED",
};
objective.sideRecruitableManpower = new Float64Array([100]);
const total = depleted.personnel + objective.sideRecruitableManpower[0];
assert.equal(replenishArmyFormation(depleted, objective, 300), 20);
assert.equal(depleted.personnel + objective.sideRecruitableManpower[0], total);
objective.sideRecruitableManpower[0] = 0;
assert.equal(replenishArmyFormation(depleted, objective, 330), 0);

// Army orders do not overwrite a contact combat target; no attraction/cohesion
// can move an arrived reserve. Exercise the actual ground executor.
const enemy = {
	id: 201,
	lat: 0,
	lng: 0,
	health: 100,
	sideIndex: 1,
	kind: "army",
};
const fighter = {
	id: 200,
	lat: 0,
	lng: 0,
	health: 100,
	sideIndex: 0,
	kind: "army",
	sovereignId: 1,
	_armyOrder: { target: { lat: 0, lng: 5 }, type: "ASSAULT" },
};
const groundInput = {
	target: enemy,
	u: fighter,
	frame: {
		getArmyMovement: () => ({ status: "ARRIVED" }),
		isArmyCellPassable: () => true,
	},
	CONFIG: { GRID_RES: 1, UNIT_SPEED: 0.1, COMBAT_DAMAGE: 1 },
	simFrameCount: 100,
	gridIdxNow: 0,
	currentIdx: 0,
	isAtSea: false,
	shouldMopUp: false,
	aiProfile: { speedMult: 1 },
	speedBuffMult: 1,
	getGridIndex: () => 0,
	landMask: new Uint8Array([1]),
	deJureMap: new Uint16Array([1]),
	worldControlMap: new Uint16Array([1]),
	currentControl: 1,
	_theaterCitiesBySovereign: new Map(),
	damageDealtMult: 1,
	damageTakenMult: 1,
	getLiveFormationStrength: () => 1,
	recordDamage: (u, damage) => {
		u.health -= damage;
	},
	normalizeLongitudeDelta: (v) => v,
	isNeutralCountry: () => false,
};
executeGroundTarget(groundInput);
assert.ok(enemy.health < 100);
assert.ok(fighter.health < 100);
executeGroundTarget({
	...groundInput,
	target: { lat: 0, lng: 5 },
	localEnemyCount: 50,
	enemyCentroidLat: 100,
	groupCentroid: { lat: 100, lng: 100 },
});
assert.deepEqual({ lat: fighter.lat, lng: fighter.lng }, { lat: 0, lng: 0 });

// Losing an exposed flank cancels an attack; stalls cannot persist forever.
let stalled = createAiTaskForce({
	signature: "stall",
	phase: "ATTACKING",
	launchPower: 10,
	currentPower: 10,
});
assert.equal(
	advanceAiTaskForce(stalled, { tick: 1200, currentPower: 10, forceRatio: 3 })
		.phase,
	"CULMINATED",
);
assert.equal(
	advanceAiTaskForce(stalled, {
		tick: 200,
		currentPower: 10,
		flankUnsafe: true,
	}).completionReason,
	"FLANK_UNCOVERED",
);

const ready = createAiTaskForce({
	signature: "ready",
	currentPower: 10,
	desiredPower: 10,
});
assert.equal(
	advanceAiTaskForce(ready, {
		tick: 60,
		readiness: 1,
		currentPower: 10,
		forceRatio: 2,
	}).phase,
	"ATTACKING",
);
assert.equal(
	advanceAiTaskForce(ready, {
		tick: 60,
		readiness: 1,
		currentPower: 10,
		flankUnsafe: true,
	}).phase,
	"ASSEMBLING",
);
assert.equal(
	advanceAiTaskForce(ready, {
		tick: 1800,
		readiness: 1,
		currentPower: 10,
		flankUnsafe: true,
	}).completionReason,
	"FLANK_UNCOVERED",
	"ready but blocked plans must eventually regroup",
);

// Full owner transfer carries orders, sectors and bounded explanations. A seeded
// simulation produces the same decisions after handoff to a fresh runtime.
function runReplay() {
	const initial = createTinySimulationState({
		gridWidth: 360,
		gridHeight: 180,
	});
	const core = createSimulationCore(initial);
	for (let i = 0; i < 45; i++) core.tick();
	const saved = captureSimulationState(core.state);
	const resumed = createSimulationCore(saved);
	assert.deepEqual(
		resumed.state.units.map((u) => u._armyOrder),
		core.state.units.map((u) => u._armyOrder),
	);
	assert.ok(core.state._aiDebugPlans.some((plan) => plan?.army));
	for (let i = 0; i < 30; i++) resumed.tick();
	assert.ok(resumed.state._aiDebugPlans.some((plan) => plan?.army?.stats));
	assert.ok(
		resumed.state.units.every(
			(u) => Number.isFinite(u.lat) && Number.isFinite(u.lng),
		),
	);
	return resumed.state.units.map((u) => ({
		id: u.id,
		lat: u.lat,
		lng: u.lng,
		order: u._armyOrder,
	}));
}
const originalRandom = Math.random;
try {
	const seededRun = () => {
		let seed = 77;
		Math.random = () =>
			(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
		return runReplay();
	};
	assert.deepEqual(seededRun(), seededRun());
} finally {
	Math.random = originalRandom;
}
console.log(
	"Army overhaul: coverage, 500 unique formation slots, water/neutral detours, retreat, shared route budget, holding/combat, corridor progress, pincers, manpower and deterministic owner transfer passed",
);
