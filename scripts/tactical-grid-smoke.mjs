import assert from "node:assert/strict";

import {
	buildTacticalGrid,
	createTacticalGrid,
	forEachNeighborCell,
	forEachUnorderedNeighborPair,
	getTacticalCell,
	getTacticalGridDimensions,
	getTacticalSideCells,
	parseTacticalCellKey,
	rebuildTacticalGrid,
	resetTacticalPairCounters,
	tacticalCellCoords,
	tacticalCellKey,
} from "../src/tactical-grid.js";

const dimensions = getTacticalGridDimensions(0.6);
assert.deepEqual(dimensions, { cellSize: 0.6, columns: 600, rows: 300 });

const keys = new Set();
for (let y = 0; y < dimensions.rows; y++) {
	for (let x = 0; x < dimensions.columns; x++) {
		const key = tacticalCellKey(x, y, dimensions.columns);
		assert.deepEqual(parseTacticalCellKey(key, dimensions.columns), { x, y });
		keys.add(key);
	}
}
assert.equal(keys.size, dimensions.columns * dimensions.rows);
assert.throws(() => getTacticalGridDimensions(1e-9), RangeError);
assert.deepEqual(tacticalCellCoords(90, 180, 0.6), {
	x: 0,
	y: 299,
	key: 299 * 600,
});

const units = [
	{
		id: "a",
		sideIndex: 0,
		lat: 0.1,
		lng: 0.1,
		combatPower: 4,
		allyWeight: 2,
		kind: "armor",
	},
	{
		id: "b",
		sideIndex: 0,
		lat: 0.3,
		lng: 0.3,
		combatPower: 2,
		allyWeight: 1,
		countryRole: "SUPPORT",
	},
	{
		id: "c",
		sideIndex: 0,
		lat: 0.3,
		lng: 0.7,
		combatPower: 3,
		allyWeight: 1,
	},
	{
		id: "d",
		sideIndex: 0,
		lat: 10,
		lng: 10,
		combatPower: 5,
	},
	{
		id: "enemy",
		sideIndex: 1,
		lat: 0.2,
		lng: 0.2,
		combatPower: 7,
	},
	{ id: "invalid", sideIndex: 0, lat: Number.NaN, lng: 0 },
];

const grid = buildTacticalGrid(units, { cellSize: 0.6 });
assert.equal(grid.counters.inputUnits, 6);
assert.equal(grid.counters.insertedUnits, 5);
assert.equal(grid.counters.skippedUnits, 1);
assert.equal(grid.counters.sideCount, 2);
assert.equal(grid.counters.maxBucketOccupancy, 2);

const homeCell = getTacticalCell(grid, 0, 0.1, 0.1);
assert.ok(homeCell);
assert.equal(homeCell.count, 2);
assert.equal(homeCell.totalStrength, 6);
assert.equal(homeCell.totalAllyWeight, 3);
assert.equal(homeCell.weightedStrength, 10);
assert.ok(Math.abs(homeCell.centroidLat - 1 / 6) < 1e-12);
assert.ok(Math.abs(homeCell.centroidLng - 1 / 6) < 1e-7);
assert.equal(homeCell.armorCount, 1);
assert.equal(homeCell.supportCount, 1);
assert.equal(homeCell.hasArmor, true);
assert.equal(homeCell.hasSupport, true);
assert.equal(getTacticalSideCells(grid, 1)?.size, 1);
const neighborCells = [];
assert.equal(
	forEachNeighborCell(grid, 0, { lat: 0.1, lng: 0.1 }, (cell) => {
		neighborCells.push(cell.key);
	}),
	2,
);
assert.deepEqual(neighborCells, [...neighborCells].sort((left, right) => left - right));

const visited = [];
const pairStats = forEachUnorderedNeighborPair(
	grid,
	0,
	(left, right) => {
		visited.push([left.id, right.id].sort().join(":"));
	},
	{ radiusSq: 0.5 * 0.5 },
);
assert.deepEqual(visited, ["a:b", "b:c"]);
assert.equal(new Set(visited).size, visited.length);
assert.equal(pairStats.candidatePairs, 3);
assert.equal(pairStats.acceptedPairs, 2);
assert.equal(grid.counters.candidatePairs, 3);
assert.equal(grid.counters.acceptedPairs, 2);

resetTacticalPairCounters(grid);
assert.equal(grid.counters.candidatePairs, 0);
assert.equal(grid.counters.acceptedPairs, 0);

const seamGrid = buildTacticalGrid(
	[
		{ id: "west", sideUid: "coalition", lat: 0, lng: -179.9 },
		{ id: "east", sideUid: "coalition", lat: 0, lng: 179.9 },
	],
	{ cellSize: 0.6 },
);
const seamPairs = [];
const seamStats = forEachUnorderedNeighborPair(
	seamGrid,
	"coalition",
	(left, right, distanceSq) => {
		seamPairs.push(`${left.id}:${right.id}:${distanceSq.toFixed(4)}`);
	},
	{ radiusSq: 0.3 * 0.3 },
);
assert.deepEqual(seamPairs, ["west:east:0.0400"]);
assert.equal(seamStats.candidatePairs, 1);
assert.equal(seamStats.acceptedPairs, 1);

const reusable = createTacticalGrid({ cellSize: 0.75 });
const identity = reusable;
rebuildTacticalGrid(reusable, [
	{ id: 1, sideIndex: 0, lat: 1, lng: 1, health: 80 },
]);
assert.equal(reusable, identity);
assert.equal(reusable.counters.insertedUnits, 1);
rebuildTacticalGrid(reusable, []);
assert.equal(reusable.bySide.size, 0);
assert.equal(reusable.counters.insertedUnits, 0);

console.log("Tactical grid smoke tests passed");
