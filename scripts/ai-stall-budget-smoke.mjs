import assert from "node:assert/strict";
import { allocateArmyCoverage } from "../src/army-command.js";
import { armyDistanceSq } from "../src/army-navigation.js";
import { createSimulationCore } from "../src/simulation-core.js";
import {
	createProfileFixture,
	repeatableRandom,
} from "./profiling/fixture.mjs";

let randomState = 7;
const random = () => {
	randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
	return randomState / 2 ** 32;
};

// Bounded selection must pick exactly what a full sort of the remaining army
// would, sector by sector, including tied distances on a coarse lattice.
for (let trial = 0; trial < 60; trial++) {
	const sectors = Array.from(
		{ length: 1 + Math.floor(random() * 24) },
		(_, i) => ({
			id: `sector:${i}`,
			priority: 1 + Math.floor(random() * 4),
			enemyPower: random() < 0.5 ? random() * 5 : 0,
			hold: { lat: Math.floor(random() * 6), lng: Math.floor(random() * 6) },
		}),
	);
	const units = Array.from({ length: Math.floor(random() * 400) }, (_, i) => ({
		id: random() < 0.5 ? i : i + 0.5,
		lat: Math.floor(random() * 6),
		lng: Math.floor(random() * 6),
		health: random() < 0.15 ? 30 : 100,
		maxHealth: 100,
		combatPower: random() * 2,
		sectorId:
			random() < 0.3 ? `sector:${Math.floor(random() * 24)}` : undefined,
		taskForceId: random() < 0.2 ? "force" : undefined,
	}));
	const posture = ["BALANCED", "DEFENSIVE", "AGGRESSIVE"][trial % 3];
	const coverage = allocateArmyCoverage(sectors, units, posture);
	const used = new Set(coverage.recovering.map((unit) => String(unit.id)));
	const ordered = [...sectors].sort(
		(a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
	);
	for (const sector of ordered) {
		const cost = (u) =>
			armyDistanceSq(u, sector.hold) * (u.sectorId === sector.id ? 0.45 : 1) +
			(u.taskForceId ? 0.5 : 0);
		const expected = units
			.filter((u) => u.health > 0 && !used.has(String(u.id)))
			.sort(
				(a, b) => cost(a) - cost(b) || String(a.id).localeCompare(String(b.id)),
			)
			.slice(0, sector.desiredCount)
			.map((u) => u.id);
		for (const id of expected) used.add(String(id));
		assert.deepEqual(
			sector.assignedUnitIds.slice(0, expected.length),
			expected,
			`trial ${trial}, ${sector.id}`,
		);
	}
}

// One side's proposal generation runs under a fixed per-tick work budget and
// keeps its queue slot until the proposals are applied.
const originalRandom = Math.random,
	originalInfo = console.info;
try {
	console.info = () => {};
	Math.random = repeatableRandom();
	const fixture = createProfileFixture({
		case: "ffa",
		unitsPerSide: 80,
		gridRes: 0.25,
	});
	const core = createSimulationCore(fixture.state);
	const state = core.state;
	const generate = state.generateProposalSteps;
	const workByTick = new Map(),
		runs = [];
	state.generateProposalSteps = function* (sideIdx) {
		const run = { sideIdx, started: state._simTickCount, finished: null };
		runs.push(run);
		const steps = generate(sideIdx);
		for (;;) {
			const step = steps.next();
			if (step.done) {
				run.finished = state._simTickCount;
				return step.value;
			}
			assert.equal(state._pendingProposalSides[0], sideIdx);
			workByTick.set(
				state._simTickCount,
				(workByTick.get(state._simTickCount) || 0) + step.value,
			);
			yield step.value;
		}
	};
	for (let tick = 0; tick < 600; tick++) assert.ok(core.tick());
	const finished = runs.filter((run) => run.finished !== null);
	assert.ok(finished.length >= 4, "every side reassesses");
	assert.ok(
		finished.some((run) => run.finished > run.started),
		"a reassessment spans several ticks",
	);
	assert.ok(Math.max(...workByTick.values()) <= 2, "per-tick work budget");
	for (const run of finished) {
		const later = finished.filter(
			(other) => other.sideIdx === run.sideIdx && other.started > run.started,
		);
		if (later.length === 0)
			assert.equal(state._proposalReassessTick[run.sideIdx], run.finished);
	}

	// A suspended job restarts when its coalition or world changes under it,
	// including diplomacy that moves countries between sides in place.
	const restartAfter = (change) => {
		while (!runs.length || runs.at(-1).finished !== null)
			assert.ok(core.tick());
		const stale = runs.at(-1);
		change(stale.sideIdx);
		assert.ok(core.tick());
		assert.equal(stale.finished, null, "stale job is abandoned");
		return stale;
	};
	const grown = restartAfter((sideIdx) => {
		const donor = state.sides.findIndex(
			(side, index) => index !== sideIdx && side.length > 1,
		);
		const from = donor >= 0 ? donor : (sideIdx + 1) % state.sides.length;
		state.sides[sideIdx].push(state.sides[from].pop());
	});
	assert.equal(runs.at(-1).sideIdx, grown.sideIdx);
	assert.equal(runs.at(-1).started, state._simTickCount);
	const reset = restartAfter(() => state._simulationWorldGeneration++);
	assert.equal(runs.at(-1).sideIdx, reset.sideIdx);
	assert.equal(runs.at(-1).started, state._simTickCount);
	const emptied = restartAfter((sideIdx) => {
		const to = state.sides.findIndex(
			(side, index) => index !== sideIdx && side.length > 0,
		);
		state.sides[to].push(...state.sides[sideIdx].splice(0));
	});
	assert.ok(!state._pendingProposalSideSet.has(emptied.sideIdx));
	assert.ok(!state._pendingProposalSides.includes(emptied.sideIdx));

	// Every path search is charged to the step that ran it, including the
	// supply route of a side that is landing an invasion, and a step that runs
	// a search makes no pass over the ownership map besides it.
	const supplySide = state.sides.findIndex((side) => side.length > 0);
	const enemyIds = new Set(
		state.sides
			.flat()
			.filter((country) => !state.sides[supplySide].includes(country))
			.map((country) => country.id),
	);
	const enemyCapital = state.cities.find(
		(city) => city.isCapital && enemyIds.has(city.sovereignId),
	);
	const savedPlan = state._navalPlan[supplySide];
	const ownership = state.dominantSideMap;
	const searchNames = ["findSeaPathSummary", "findLandPathSummary"];
	const savedSearches = searchNames.map((name) => state[name]);
	let searches = 0,
		seaSearches = 0,
		searching = 0,
		mapReads = 0,
		searchSteps = 0;
	try {
		state._navalPlan[supplySide] = {
			phase: "LANDING",
			target: { lat: enemyCapital.lat, lng: enemyCapital.lng },
		};
		searchNames.forEach((name, index) => {
			state[name] = (...args) => {
				searches++;
				if (index === 0) seaSearches++;
				searching++;
				try {
					return savedSearches[index](...args);
				} finally {
					searching--;
				}
			};
		});
		state.dominantSideMap = new Proxy(ownership, {
			get(target, key) {
				if (!searching && typeof key === "string") {
					const code = key.charCodeAt(0);
					if (code >= 48 && code <= 57) mapReads++;
				}
				const value = Reflect.get(target, key);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		const steps = generate(supplySide);
		for (let step = steps.next(); !step.done; step = steps.next()) {
			assert.ok(searches <= step.value, "path search charged to its step");
			if (searches > 0) {
				searchSteps++;
				assert.ok(mapReads < 5000, `map pass beside a search (${mapReads})`);
			}
			searches = 0;
			mapReads = 0;
		}
		assert.equal(searches, 0, "no path search after the last step");
		assert.ok(seaSearches > 0, "supply route searched");
		assert.ok(searchSteps > seaSearches, "land routes searched");
	} finally {
		state.dominantSideMap = ownership;
		state._navalPlan[supplySide] = savedPlan;
		searchNames.forEach((name, index) => {
			state[name] = savedSearches[index];
		});
	}

	// Targets the side takes, or that pass to a non-hostile owner, after their
	// offensive proposals were recorded are dropped once generation finishes.
	const takerSide = state.sides.findIndex((side) => side.length > 0);
	const proposalsAfterChange = (type, change) => {
		const savedTick = state._simTickCount;
		let undo = () => {};
		try {
			const steps = generate(takerSide);
			let step = steps.next();
			// The first zero-work step follows the land and naval offensives.
			while (!step.done && step.value !== 0) step = steps.next();
			state._simTickCount++;
			undo = change();
			while (!step.done) step = steps.next();
			return step.value.filter((proposal) => proposal.type === type);
		} finally {
			state._simTickCount = savedTick;
			undo();
		}
	};
	const holdCells =
		(cells, holder = takerSide) =>
		() => {
			const before = cells.map((idx) => state.dominantSideMap[idx]);
			for (const idx of cells) state.dominantSideMap[idx] = holder;
			return () => {
				for (let i = cells.length - 1; i >= 0; i--)
					state.dominantSideMap[cells[i]] = before[i];
			};
		};
	const cellOf = (point) => state.getGridIndex(point.lat, point.lng);
	const unchanged = () => () => {};
	assert.ok(proposalsAfterChange("CAPTURE_CITY", unchanged).length > 0);
	const cityCells = state.activeTheaterCities.map(cellOf);
	assert.deepEqual(
		proposalsAfterChange("CAPTURE_CITY", holdCells(cityCells)),
		[],
		"captured targets are dropped",
	);
	const ally = state.sides[takerSide][0].id;
	const handedOver = proposalsAfterChange("CAPTURE_CITY", () => {
		const owners = state.activeTheaterCities.map((city) => city.ownerId);
		for (const city of state.activeTheaterCities) city.ownerId = ally;
		return () => {
			state.activeTheaterCities.forEach((city, i) => {
				city.ownerId = owners[i];
			});
		};
	});
	assert.deepEqual(handedOver, [], "targets now held by a friend are dropped");
	const pushes = proposalsAfterChange("PUSH_FRONT", unchanged);
	assert.ok(pushes.length > 0, "front pushes proposed");
	const aims = pushes.map((push) => cellOf(push.target));
	for (const holder of [takerSide, -1])
		assert.deepEqual(
			proposalsAfterChange("PUSH_FRONT", holdCells(aims, holder)),
			[],
			`front pushes whose aim passed to side ${holder} are dropped`,
		);

	// A formation that stepped off the coast this tick still has a stale
	// isAtSea flag; it must not be offered for land orders.
	const unit = state.units.find((u) => u.health > 0 && u.deployTicks <= 0);
	let sea = -1;
	for (let idx = 0; idx < state.landMask.length && sea < 0; idx++)
		if (!state.landMask[idx]) sea = idx;
	unit.isAtSea = false;
	unit.lat = (Math.floor(sea / state.gridWidth) + 0.5) * 0.25 - 90;
	unit.lng = ((sea % state.gridWidth) + 0.5) * 0.25 - 180;
	assert.equal(state.serializeOperationalUnit(unit).deployed, false);
} finally {
	Math.random = originalRandom;
	console.info = originalInfo;
}

console.log(
	"AI stall budgets: 60 coverage selections match full sorts, budgeted multi-tick proposal runs charge every path search and map pass separately, restart on coalition changes and drop targets taken or handed to a friend, and at-sea formations excluded from land orders",
);
