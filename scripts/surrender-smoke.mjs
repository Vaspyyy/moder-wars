import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	allocateLargestRemainderQuotas,
	evaluateCountryCapitulation,
	evaluateGlobalConflict,
	selectEligibleCasualtyAttackers,
	selectMajorityOwnerTransfers,
	selectOccupationController,
	updateRebellionFailureCycles,
} from "../src/surrender.js";

const evaluate = (overrides = {}) =>
	evaluateCountryCapitulation({
		hasFreshTerritoryData: true,
		unitCount: 1,
		ownedCells: 100,
		controlledCells: 100,
		initialCells: 100,
		...overrides,
	});

assert.equal(
	evaluate({ hasFreshTerritoryData: false, ownedCells: 0 }).capitulate,
	false,
);
assert.equal(evaluate({ controlledCells: 2 }).capitulate, false);
assert.equal(evaluate({ controlledCells: 1.99 }).capitulate, true);
assert.equal(evaluate({ unitCount: 0, controlledCells: 25 }).capitulate, false);
assert.equal(
	evaluate({ unitCount: 0, controlledCells: 24.99 }).capitulate,
	true,
);
assert.equal(evaluate({ unitCount: 2, ownedCells: 0 }).capitulate, true);
assert.equal(
	evaluate({ unitCount: 0, controlledCells: 90, initialCityCount: 0 })
		.capitulate,
	false,
);
assert.equal(
	evaluate({ isRebel: true, unitCount: 0, ownedCells: 0 }).reason,
	"REBELLION_RULES",
);
assert.equal(
	evaluate({ role: "SUPPORT", controlledCells: 1 }).reason,
	"DEFENDED_CONTROL_COLLAPSE",
);

let failedCycles = updateRebellionFailureCycles(0, {
	unitCount: 0,
	controlRatio: 0.04,
});
failedCycles = updateRebellionFailureCycles(failedCycles, {
	unitCount: 0,
	controlRatio: 0.04,
});
assert.equal(failedCycles, 2);
failedCycles = updateRebellionFailureCycles(failedCycles, {
	unitCount: 0,
	controlRatio: 0.04,
});
assert.equal(failedCycles, 3);
failedCycles = updateRebellionFailureCycles(failedCycles, {
	unitCount: 0,
	controlRatio: 0.05,
});
assert.equal(failedCycles, 0);

const casualtyAttackers = selectEligibleCasualtyAttackers([
	{ countryId: 1, casualties: 40 },
	{ countryId: 2, casualties: 30 },
	{ countryId: 3, casualties: 20 },
	{ countryId: 4, casualties: 10 },
]);
assert.deepEqual(
	casualtyAttackers.map((entry) => entry.countryId),
	[1, 2],
);
const quotas = allocateLargestRemainderQuotas(casualtyAttackers, 17);
assert.equal(
	quotas.reduce((sum, entry) => sum + entry.quota, 0),
	17,
);
assert.deepEqual(
	quotas.map((entry) => entry.quota),
	[10, 7],
);
assert.equal(
	selectEligibleCasualtyAttackers([
		{ countryId: 7, casualties: 2 },
		{ countryId: 5, casualties: 2 },
		{ countryId: 9, casualties: 2 },
		{ countryId: 8, casualties: 2 },
		{ countryId: 6, casualties: 2 },
	])[0].countryId,
	5,
);

assert.equal(
	selectOccupationController([
		{ countryId: 2, controlledCells: 10, casualties: 50 },
		{ countryId: 1, controlledCells: 10, casualties: 50 },
		{ countryId: 3, controlledCells: 9, casualties: 500 },
	]).countryId,
	1,
);

assert.equal(
	evaluateGlobalConflict(
		[0, 1, 2, 3],
		[
			[0, 1],
			[2, 3],
		],
	),
	null,
);
assert.equal(evaluateGlobalConflict([0, 2, 3], [[2, 3]]), null);
assert.deepEqual(evaluateGlobalConflict([0, 2], []), {
	type: "WHITE_PEACE",
	winnerSideIdx: null,
});
assert.deepEqual(evaluateGlobalConflict([2], []), {
	type: "FULL_CAPITULATION",
	winnerSideIdx: 2,
});

const transfers = selectMajorityOwnerTransfers([
	{ originalOwner: 10, newOwner: 1, count: 4 },
	{ originalOwner: 10, newOwner: 2, count: 6 },
	{ originalOwner: 11, newOwner: 4, count: 3 },
	{ originalOwner: 11, newOwner: 3, count: 3 },
]);
assert.equal(transfers.get(10), 2);
assert.equal(transfers.get(11), 3);

const mainSource = readFileSync(
	new URL("../src/main.js", import.meta.url),
	"utf8",
);
const transferCaptureIndex = mainSource.indexOf("treatyTransfers.push(");
const warCellCleanupIndex = mainSource.indexOf(
	"landMask[i] = 1;",
	transferCaptureIndex,
);
assert.ok(transferCaptureIndex >= 0);
assert.ok(warCellCleanupIndex > transferCaptureIndex);

console.log("Surrender smoke tests passed.");
