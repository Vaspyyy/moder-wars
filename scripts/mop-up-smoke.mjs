import assert from "node:assert/strict";
import {
	cacheMopUpCell,
	MOP_UP_CELL_CACHE_LIMIT,
	selectAssignedMopUpCountryId,
	selectNearestMopUpCell,
} from "../src/mop-up.js";

const countryIds = [10, 20, 30];
const assignments = Array.from({ length: 7 }, (_unused, unitIndex) =>
	selectAssignedMopUpCountryId(countryIds, unitIndex),
);
assert.deepEqual(assignments, [10, 20, 30, 10, 20, 30, 10]);
assert.equal(selectAssignedMopUpCountryId([], 3), 0);

const cacheA = new Map();
const cacheB = new Map();
for (let cellIndex = 0; cellIndex < 5000; cellIndex++) {
	cacheMopUpCell(cacheA, 7, cellIndex);
	cacheMopUpCell(cacheB, 7, cellIndex);
}
assert.equal(cacheA.get(7).cells.length, MOP_UP_CELL_CACHE_LIMIT);
assert.deepEqual(cacheA.get(7).cells, cacheB.get(7).cells);
assert.ok(Array.from(cacheA.get(7).cells).every((cellIndex) => cellIndex >= 0));

const cells = Int32Array.from([11, 88, 55, -1]);
const nearest = selectNearestMopUpCell(cells, {
	unitLat: -88.5,
	unitLng: -178.5,
	gridWidth: 10,
	gridRes: 1,
	isEligible: (cellIndex) => cellIndex !== 11,
});
assert.equal(nearest, 55);
assert.equal(
	selectNearestMopUpCell(cells, {
		unitLat: 0,
		unitLng: 0,
		gridWidth: 10,
		gridRes: 1,
		isEligible: () => false,
	}),
	-1,
);

console.log("Mop-up smoke tests passed.");
