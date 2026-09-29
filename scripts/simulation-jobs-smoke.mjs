import assert from "node:assert/strict";

import {
	claimFixedItemRange,
	createDeterministicJob,
	createDeterministicJobQueue,
	createDirtyTileTracker,
	createFixedItemCursor,
	neighboringTileIndices,
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

// Resetting a world cancels partial jobs without publishing completion.
let completed = false;
let cancellationReason = null;
const cancellable = createDeterministicJob({
	id: "coast-reset",
	totalItems: 3,
	processRange: () => {},
	onComplete: () => { completed = true; },
	onCancel: (job) => { cancellationReason = job.metadata.cancelReason; },
});
const cancellationQueue = createDeterministicJobQueue({ itemBudget: 1 });
cancellationQueue.enqueue(cancellable);
cancellationQueue.step();
assert.equal(cancellable.cursor, 1);
cancellationQueue.clear("world-changed");
assert.equal(cancellable.status, "CANCELLED");
assert.equal(completed, false);
assert.equal(cancellationReason, "world-changed");
assert.equal(cancellationQueue.size(), 0);

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

console.log("Simulation job smoke tests passed");
