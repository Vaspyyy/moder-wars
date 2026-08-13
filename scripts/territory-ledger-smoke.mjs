import assert from "node:assert/strict";

import {
	createTerritoryLedger,
	getCountryLedger,
	getDeJureControlByCountry,
	getDeJureControlBySide,
	getSideLedger,
	selectOccupationControl,
} from "../src/territory-ledger.js";

const gridWidth = 4;
const gridHeight = 3;
const landMask = new Uint8Array(gridWidth * gridHeight).fill(2);
const worldControlMap = Uint16Array.from([
	1, 1, 2, 2,
	1, 1, 2, 2,
	3, 3, 2, 2,
]);
const deJureMap = Uint16Array.from(worldControlMap);
const dominantSideMap = Int8Array.from([
	0, 0, 1, 1,
	0, 1, 1, 1,
	2, 2, 1, 1,
]);
const primaryOccupierMap = Uint16Array.from([
	1, 1, 2, 2,
	1, 2, 2, 2,
	3, 3, 2, 2,
]);
const occupationMap = Float32Array.from([
	1, 1, -1, -1,
	1, -1, -1, -1,
	1, 1, -1, -1,
]);
const maps = {
	landMask,
	worldControlMap,
	deJureMap,
	dominantSideMap,
	primaryOccupierMap,
	occupationMap,
};
const countryToSide = new Map([
	[1, 0],
	[2, 1],
	[3, 2],
]);
const sideUids = ["blue", "red", "green"];
const cities = [
	{ id: "blue-capital", cellIndex: 0, ownerId: 1, pop: 100, isCapital: true },
	{ id: "blue-city", cellIndex: 5, ownerId: 1, pop: 50 },
	{ id: "red-capital", cellIndex: 2, ownerId: 2, pop: 200, isCapital: true },
	{ id: "green-capital", cellIndex: 8, ownerId: 3, pop: 30, isCapital: true },
];

const commits = [];
const ledger = createTerritoryLedger({
	gridWidth,
	gridHeight,
	tileSize: 2,
	maps,
	countryToSide,
	sideUids,
	hostileSidePairs: [[0, 1]],
	topologyRevision: "coalitions-1",
	worldRevision: "world-1",
	cityRevision: "cities-1",
	cities,
	countedLandValue: 2,
	defaultItemBudget: 3,
	onCommit: (snapshot) => commits.push(snapshot),
});

assert.equal(ledger.totalTiles, 4);
assert.equal(ledger.getSnapshot(), null);
const firstChunk = ledger.step(3);
assert.equal(firstChunk.processedItems, 3);
assert.equal(firstChunk.committed, false);
assert.equal(ledger.getSnapshot(), null, "partial first generation must stay hidden");
assert.equal(commits.length, 0);

const initialFlush = ledger.flush(3);
assert.equal(initialFlush.committedGenerations, 1);
assert.equal(commits.length, 1);
const initial = initialFlush.snapshot;
assert.ok(Object.isFrozen(initial));
assert.equal(initial.landCells, 12);
assert.equal(initial.positiveOccupationCells, 5);
assert.equal(initial.negativeOccupationCells, 7);
assert.equal(initial.worldRevision, "world-1");
assert.equal(initial.topologyRevision, "coalitions-1");

assert.deepEqual(
	initial.sides.map((side) => [side.sideIndex, side.territory]),
	[
		[0, 3],
		[1, 7],
		[2, 2],
	],
);
assert.equal(getSideLedger(initial, 0).frontline, 2);
assert.equal(getSideLedger(initial, 1).frontline, 2);
assert.equal(getSideLedger(initial, 2).frontline, 0);

const blue = getCountryLedger(initial, 1);
assert.equal(blue.owned, 4);
assert.equal(blue.controlled, 3);
assert.equal(blue.frontline, 2);
assert.equal(blue.deJureTotal, 4);
assert.equal(blue.coreControlled, 3);
assert.equal(blue.coreControlRatio, 0.75);
assert.equal(blue.creditedTerritory, 3);
assert.equal(getDeJureControlBySide(initial, 1, 0), 3);
assert.equal(getDeJureControlBySide(initial, 1, 1), 1);
assert.equal(getDeJureControlByCountry(initial, 1, 2), 1);
assert.equal(blue.citiesTotal, 2);
assert.equal(blue.citiesControlled, 1);
assert.equal(blue.cityPopulationTotal, 150);
assert.equal(blue.cityPopulationControlled, 100);
assert.equal(blue.capitalHeld, true);
assert.deepEqual(blue.cityControlBySide, { 0: 1, 1: 1 });
assert.equal(getSideLedger(initial, 1).citiesControlled, 2);
assert.equal(getSideLedger(initial, 1).cityPopulationControlled, 250);
assert.deepEqual(selectOccupationControl(initial, 1, 2, 1), {
	victimCountryId: 1,
	annexerCountryId: 2,
	annexerSideIndex: 1,
	total: 4,
	heldByAnnexerSide: 1,
	heldByAnnexerCountry: 1,
	heldRatio: 0.25,
});

// A controller mutation dirties its tile and neighboring tiles. The old
// snapshot remains fully visible until the replacement generation commits.
dominantSideMap[0] = 1;
primaryOccupierMap[0] = 2;
assert.equal(ledger.markControllerChange(0), 4);
assert.deepEqual(ledger.getStatus().dirtyTileIndices, [0, 1, 2, 3]);
const mutationChunk = ledger.step(1);
assert.equal(mutationChunk.committed, false);
assert.equal(ledger.getSnapshot(), initial);
assert.equal(getCountryLedger(ledger.getSnapshot(), 1).controlled, 3);
const changed = ledger.flush(2).snapshot;
assert.notEqual(changed, initial);
assert.equal(getCountryLedger(changed, 1).controlled, 2);
assert.equal(getSideLedger(changed, 0).territory, 2);
assert.equal(getSideLedger(changed, 1).territory, 8);
assert.equal(getDeJureControlByCountry(changed, 1, 2), 2);

// A mutation during an active generation appends a dirty tail. Stable tiles are
// retained privately, changed tiles are rescanned, and no mixed snapshot is
// published between those passes.
dominantSideMap[4] = 1;
primaryOccupierMap[4] = 2;
ledger.markControllerChange(4);
ledger.step(2);
dominantSideMap[1] = 1;
primaryOccupierMap[1] = 2;
ledger.markControllerChange(1);
const beforeTwoGenerationFlush = ledger.getSnapshot();
assert.equal(getCountryLedger(beforeTwoGenerationFlush, 1).controlled, 2);
const commitsBeforeInterruptedGeneration = commits.length;
let interruptedGenerationCommit = null;
for (let attempt = 0; attempt < 20; attempt++) {
	const result = ledger.step(2);
	if (result.committed) {
		interruptedGenerationCommit = result;
		break;
	}
	assert.equal(
		commits.length,
		commitsBeforeInterruptedGeneration,
		"an incomplete dirty tail must never invoke onCommit",
	);
	assert.equal(ledger.getSnapshot(), beforeTwoGenerationFlush);
}
assert.equal(interruptedGenerationCommit?.committed, true);
assert.equal(interruptedGenerationCommit?.discarded, false);
assert.equal(commits.length, commitsBeforeInterruptedGeneration + 1);
assert.equal(
	getCountryLedger(interruptedGenerationCommit.snapshot, 1).controlled,
	0,
);

// A continuously changing front must still publish incrementally when a step
// has enough budget to consume both its prior work and the newly dirtied tail.
const liveDominance = Int8Array.of(0, 0, 1, 1);
const liveLedger = createTerritoryLedger({
	gridWidth: 4,
	gridHeight: 1,
	tileSize: 2,
	maps: {
		landMask: new Uint8Array(4).fill(2),
		worldControlMap: Uint16Array.of(1, 1, 2, 2),
		dominantSideMap: liveDominance,
	},
	countryToSide: new Map([
		[1, 0],
		[2, 1],
	]),
	sideUids: ["left", "right"],
	hostileSidePairs: [[0, 1]],
});
liveLedger.step(1);
let liveSnapshot = null;
for (let attempt = 0; attempt < 4 && !liveSnapshot; attempt++) {
	liveDominance[attempt % 2] = 1;
	liveLedger.markControllerChange(attempt % 2);
	const result = liveLedger.step(16);
	if (result.committed) liveSnapshot = result.snapshot;
}
assert.ok(liveSnapshot, "a busy dirty tail must not require a synchronous flush");
assert.equal(getSideLedger(liveSnapshot, 1).territory, 3);

// Hostility and coalition changes revoke the old snapshot immediately, rebuild
// every tile, and publish only the new topology generation.
assert.equal(
	ledger.setSideTopology({
		countryToSide,
		sideUids,
		hostileSidePairs: [],
		revision: "coalitions-2",
	}),
	true,
);
assert.equal(ledger.getSnapshot(), null);
assert.equal(ledger.getStatus().dirtyTiles, 4);
ledger.step(1);
assert.equal(ledger.getSnapshot(), null);
const peaceful = ledger.flush(4).snapshot;
assert.equal(peaceful.topologyRevision, "coalitions-2");
assert.equal(getSideLedger(peaceful, 0).frontline, 0);
assert.equal(getSideLedger(peaceful, 1).frontline, 0);
assert.equal(
	ledger.setSideTopology({
		countryToSide,
		sideUids,
		hostileSidePairs: [],
		revision: "coalitions-2",
	}),
	false,
	"an identical mapping revision must not trigger another reset",
);

// Optional city inputs and world arrays have their own atomic revisions.
ledger.setCities(cities.slice(0, 3), { revision: "cities-2" });
assert.equal(ledger.getSnapshot(), null);
const fewerCities = ledger.flush(5).snapshot;
assert.equal(fewerCities.cityRevision, "cities-2");
assert.equal(getCountryLedger(fewerCities, 3).citiesTotal, 0);

const replacementDominance = Int8Array.from(dominantSideMap);
replacementDominance[8] = 1;
ledger.replaceMaps(
	{ ...maps, dominantSideMap: replacementDominance },
	"world-2",
);
assert.equal(ledger.getSnapshot(), null);
const replacement = ledger.flush(7).snapshot;
assert.equal(replacement.worldRevision, "world-2");
assert.equal(getSideLedger(replacement, 1).territory, 11);
assert.equal(getSideLedger(replacement, 2).territory, 1);

const twoCellMaps = {
	landMask: new Uint8Array(2).fill(2),
	worldControlMap: Uint16Array.of(1, 2),
	dominantSideMap: Int8Array.of(0, 1),
};
const twoCountrySides = new Map([
	[1, 0],
	[2, 1],
]);

// An omitted maxSides is inferred only from a non-empty square matrix.
const inferredMatrixLedger = createTerritoryLedger({
	gridWidth: 2,
	gridHeight: 1,
	tileSize: 1,
	maps: twoCellMaps,
	countryToSide: twoCountrySides,
	sideUids: ["left", "right"],
	hostilityMatrix: Uint8Array.of(0, 1, 1, 0),
});
const inferredMatrixSnapshot = inferredMatrixLedger.flush().snapshot;
assert.equal(getSideLedger(inferredMatrixSnapshot, 0).frontline, 1);
assert.equal(getSideLedger(inferredMatrixSnapshot, 1).frontline, 1);
assert.throws(
	() =>
		createTerritoryLedger({
			gridWidth: 2,
			gridHeight: 1,
			maps: twoCellMaps,
			hostilityMatrix: Uint8Array.of(0, 1, 1),
		}),
	/perfect square/,
);
assert.throws(
	() =>
		createTerritoryLedger({
			gridWidth: 2,
			gridHeight: 1,
			maps: twoCellMaps,
			maxSides: 2,
			hostilityMatrix: new Uint8Array(9),
		}),
	/expected 4 entries/,
);
assert.throws(
	() =>
		createTerritoryLedger({
			gridWidth: 2,
			gridHeight: 1,
			maps: twoCellMaps,
			hostilityMatrix: new Uint8Array(0),
		}),
	/non-empty/,
);
assert.throws(
	() =>
		createTerritoryLedger({
			gridWidth: 2,
			gridHeight: 1,
			maps: twoCellMaps,
			countryToSide: new Map([[1, 2]]),
			sideUids: ["left", "right"],
			maxSides: 2,
			hostilityMatrix: Uint8Array.of(0, 1, 1, 0),
		}),
	/exceeds maxSides/,
);

// Structured topology signatures cannot collide through delimiter placement
// or through multi-digit matrix entries.
const signatureLedger = createTerritoryLedger({
	gridWidth: 2,
	gridHeight: 1,
	maps: twoCellMaps,
	countryToSide: twoCountrySides,
	sideUids: ["a,b", "c"],
	topologyRevision: "same",
});
assert.equal(
	signatureLedger.setSideTopology({
		countryToSide: twoCountrySides,
		sideUids: ["a", "b,c"],
		revision: "same",
	}),
	true,
);
const matrixSignatureLedger = createTerritoryLedger({
	gridWidth: 2,
	gridHeight: 1,
	maps: twoCellMaps,
	countryToSide: twoCountrySides,
	sideUids: ["left", "right"],
	maxSides: 2,
	hostilityMatrix: Uint8Array.of(1, 11, 1, 1),
	topologyRevision: "same-matrix",
});
assert.equal(
	matrixSignatureLedger.setSideTopology({
		countryToSide: twoCountrySides,
		sideUids: ["left", "right"],
		maxSides: 2,
		hostilityMatrix: Uint8Array.of(11, 1, 1, 1),
		revision: "same-matrix",
	}),
	true,
);

// Explicit city indices take precedence; the resolver remains a fallback for
// cities that do not carry an index themselves.
let cityResolverCalls = 0;
const explicitCityLedger = createTerritoryLedger({
	gridWidth: 2,
	gridHeight: 1,
	tileSize: 1,
	maps: twoCellMaps,
	countryToSide: twoCountrySides,
	sideUids: ["left", "right"],
	cities: [
		{ id: "explicit", cellIndex: 0, ownerId: 1, isCapital: true },
		{ id: "fallback", ownerId: 1 },
	],
	getCityCellIndex() {
		cityResolverCalls++;
		return 1;
	},
});
const explicitCitySnapshot = explicitCityLedger.flush().snapshot;
assert.equal(cityResolverCalls, 1);
assert.equal(getCountryLedger(explicitCitySnapshot, 1).citiesTotal, 2);
assert.equal(getCountryLedger(explicitCitySnapshot, 1).citiesControlled, 1);
assert.equal(getCountryLedger(explicitCitySnapshot, 1).capitalHeld, true);
const explicitCityStatus = explicitCityLedger.getStatus();
assert.throws(
	() =>
		explicitCityLedger.setCities(
			[{ id: "bad-city", ownerId: 1 }],
			{
				revision: "bad-cities",
				getCityCellIndex() {
					throw new Error("city resolver failed");
				},
			},
		),
	/city resolver failed/,
);
assert.equal(explicitCityLedger.getSnapshot(), explicitCitySnapshot);
assert.equal(
	explicitCityLedger.getStatus().cityRevision,
	explicitCityStatus.cityRevision,
);

assert.throws(
	() =>
		createTerritoryLedger({
			gridWidth: 2,
			gridHeight: 2,
			maps: {
				landMask: new Uint8Array(4),
				worldControlMap: new Uint16Array(3),
				dominantSideMap: new Int8Array(4),
			},
		}),
	/4 cells/,
);

console.log("Territory ledger smoke tests passed");
