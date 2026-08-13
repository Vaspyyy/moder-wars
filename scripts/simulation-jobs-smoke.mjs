import assert from "node:assert/strict";

import {
	claimFixedItemRange,
	createChunkedArrayCensus,
	createDeterministicJob,
	createDeterministicJobQueue,
	createDirtyTileTracker,
	createFixedItemCursor,
	createGenerationKeyedCache,
	neighboringTileIndices,
	plannerCacheKey,
	runDeterministicJobChunk,
	tileBoundsForIndex,
	tileCoordinatesForCell,
	tileIndexForCell,
} from "../src/simulation-jobs.js";

const cursor = createFixedItemCursor(10, 2);
assert.deepEqual(claimFixedItemRange(cursor, 3), {
	start: 2,
	end: 5,
	count: 3,
	done: false,
});
assert.deepEqual(claimFixedItemRange(cursor, 20), {
	start: 5,
	end: 10,
	count: 5,
	done: true,
});

const directRanges = [];
const direct = createDeterministicJob({
	id: "direct",
	totalItems: 7,
	maxItemsPerTurn: 3,
	processRange: (start, end) => directRanges.push([start, end]),
});
assert.equal(runDeterministicJobChunk(direct, 99).processed, 3);
assert.equal(runDeterministicJobChunk(direct, 99).processed, 3);
assert.equal(runDeterministicJobChunk(direct, 99).processed, 1);
assert.equal(direct.status, "COMPLETE");
assert.deepEqual(directRanges, [
	[0, 3],
	[3, 6],
	[6, 7],
]);

const queueOrder = [];
const queue = createDeterministicJobQueue({
	itemBudget: 6,
	maxItemsPerJobTurn: 2,
});
queue.enqueue(
	createDeterministicJob({
		id: "alpha",
		totalItems: 5,
		processRange: (start, end) => queueOrder.push(`a:${start}-${end}`),
	}),
);
queue.enqueue(
	createDeterministicJob({
		id: "bravo",
		totalItems: 5,
		processRange: (start, end) => queueOrder.push(`b:${start}-${end}`),
	}),
);
const firstStep = queue.step();
assert.equal(firstStep.processed, 6);
assert.deepEqual(queueOrder, ["a:0-2", "b:0-2", "a:2-4"]);
const secondStep = queue.step();
assert.equal(secondStep.processed, 4);
assert.equal(queue.size(), 0);
assert.deepEqual(queueOrder, [
	"a:0-2",
	"b:0-2",
	"a:2-4",
	"b:2-4",
	"a:4-5",
	"b:4-5",
]);

const values = Uint16Array.from({ length: 11 }, (_, index) => index + 1);
let committed = null;
let commitCount = 0;
const census = createChunkedArrayCensus({
	id: "territory-census",
	generation: 12,
	source: values,
	createAccumulator: () => ({ sum: 0, even: 0 }),
	visit(accumulator, value) {
		accumulator.sum += value;
		if (value % 2 === 0) accumulator.even++;
	},
	finalize: (accumulator) => Object.freeze({ ...accumulator }),
	commit(result, context) {
		commitCount++;
		committed = { result, context };
	},
});
const censusQueue = createDeterministicJobQueue({
	itemBudget: 4,
	maxItemsPerJobTurn: 4,
});
censusQueue.enqueue(census);
censusQueue.step();
censusQueue.step();
assert.equal(committed, null, "partial census chunks must not be observable");
censusQueue.step();
assert.equal(commitCount, 1);
assert.deepEqual(committed, {
	result: { sum: 66, even: 5 },
	context: { id: "territory-census", generation: 12, totalItems: 11 },
});
assert.equal(census.committed, true);
assert.equal(census.status, "COMPLETE");

let cancelledCommit = false;
const cancelledCensus = createChunkedArrayCensus({
	id: "cancelled-census",
	source: [1, 2, 3],
	createAccumulator: () => 0,
	visit: () => {},
	commit: () => {
		cancelledCommit = true;
	},
});
const cancellationQueue = createDeterministicJobQueue({ itemBudget: 1 });
cancellationQueue.enqueue(cancelledCensus);
cancellationQueue.step();
assert.equal(cancellationQueue.cancel("cancelled-census", "world-changed"), true);
assert.equal(cancelledCommit, false);

assert.deepEqual(tileCoordinatesForCell(32 + 32 * 70, 70), {
	cellX: 32,
	cellY: 32,
	tileX: 1,
	tileY: 1,
	tileIndex: 4,
	tilesWide: 3,
});
assert.equal(tileIndexForCell(69, 70), 2);
assert.deepEqual(neighboringTileIndices(0, 0, 3, 3), [0, 1, 3, 4]);
assert.deepEqual(tileBoundsForIndex(8, 70, 65), {
	tileIndex: 8,
	tileX: 2,
	tileY: 2,
	minX: 64,
	minY: 64,
	maxX: 70,
	maxY: 65,
});

const dirty = createDirtyTileTracker({ gridWidth: 70, gridHeight: 65 });
assert.equal(dirty.tileSize, 32);
assert.equal(dirty.markCellXY(32, 32), 9);
assert.deepEqual(dirty.peek(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(dirty.consume(3), [0, 1, 2]);
assert.deepEqual(dirty.peek(), [3, 4, 5, 6, 7, 8]);
dirty.clear();
assert.equal(dirty.markCellXY(0, 0), 4);
assert.deepEqual(dirty.consume(), [0, 1, 3, 4]);

const cache = createGenerationKeyedCache({ generation: 3 });
const topologyKey = plannerCacheKey("blue", "red", "LAND");
let factoryRuns = 0;
const topology = cache.getOrCreate("topology", topologyKey, () => {
	factoryRuns++;
	return { component: 7 };
});
assert.deepEqual(topology, { component: 7 });
assert.equal(
	cache.getOrCreate("topology", topologyKey, () => {
		factoryRuns++;
		return { component: 99 };
	}),
	topology,
);
assert.equal(factoryRuns, 1);
assert.equal(cache.size("topology"), 1);
assert.equal(cache.set("reachability", "blue:red", true, 2), false);
assert.equal(cache.setGeneration(4), true);
assert.equal(cache.get("topology", topologyKey), undefined);
assert.equal(cache.set("reachability", "blue:red", true, 3), false);
assert.equal(cache.set("reachability", "blue:red", true, 4), true);
assert.equal(cache.get("reachability", "blue:red", 4), true);

console.log("Simulation job smoke tests passed");
