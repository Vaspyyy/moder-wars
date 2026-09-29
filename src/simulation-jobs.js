export const DEFAULT_SIMULATION_TILE_SIZE = 32;

/**
 * Mutable cursor for deterministic item-range processing.
 * @typedef {object} FixedItemCursor
 * @property {number} totalItems Exclusive upper bound of the work range.
 * @property {number} cursor Next item index that has not been processed.
 * @property {boolean} done Whether the full range has been claimed.
 */

/**
 * One range claimed from a {@link FixedItemCursor}.
 * @typedef {object} ItemRange
 * @property {number} start Inclusive start index.
 * @property {number} end Exclusive end index.
 * @property {number} count Number of items in the range.
 * @property {boolean} done Whether claiming this range exhausted the cursor.
 */

/**
 * A deterministic job processes monotonically increasing item ranges. Work is
 * bounded only by item counts; elapsed time is deliberately never consulted.
 * @typedef {object} DeterministicJob
 * @property {string} id Stable queue identity.
 * @property {number|string} generation World generation the work belongs to.
 * @property {number} totalItems Exclusive upper bound of the work range.
 * @property {number} cursor Next unprocessed item.
 * @property {number} maxItemsPerTurn Maximum items claimed from this job before rotating to another queued job.
 * @property {"QUEUED"|"RUNNING"|"COMPLETE"|"CANCELLED"|"FAILED"} status
 * @property {unknown} result Final job result, when one exists.
 * @property {unknown} error Failure thrown by range processing or completion.
 * @property {(start:number,end:number,job:DeterministicJob)=>void} processRange
 * @property {((job:DeterministicJob)=>void)|null} onComplete
 * @property {((job:DeterministicJob)=>void)|null} onCancel
 * @property {Record<string, unknown>} metadata Serializable scheduling context.
 */

/**
 * Summary returned after advancing a job once.
 * @typedef {object} JobChunkResult
 * @property {string} id Job identity.
 * @property {number} start Inclusive processed start.
 * @property {number} end Exclusive processed end.
 * @property {number} processed Number of items processed.
 * @property {number} remaining Number of unprocessed items.
 * @property {DeterministicJob["status"]} status Resulting job status.
 */

/**
 * Queue API for fixed-item-budget simulation work.
 * @typedef {object} DeterministicJobQueue
 * @property {(job:DeterministicJob)=>DeterministicJob} enqueue
 * @property {(id:string,reason?:string)=>boolean} cancel
 * @property {(id:string)=>DeterministicJob|undefined} get
 * @property {(id:string)=>boolean} has
 * @property {(itemBudget?:number)=>object} step
 * @property {()=>Array<object>} snapshot
 * @property {(reason?:string)=>void} clear
 * @property {()=>number} size
 */

function nonNegativeInteger(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric)
		? Math.max(0, Math.trunc(numeric))
		: Math.max(0, Math.trunc(Number(fallback) || 0));
}

function positiveInteger(value, fallback = 1) {
	return Math.max(1, nonNegativeInteger(value, fallback));
}

function terminalStatus(status) {
	return ["COMPLETE", "CANCELLED", "FAILED"].includes(status);
}

/**
 * Create a cursor over `[start, totalItems)`.
 * @param {number} totalItems
 * @param {number} [start=0]
 * @returns {FixedItemCursor}
 */
export function createFixedItemCursor(totalItems, start = 0) {
	const total = nonNegativeInteger(totalItems);
	const cursor = Math.min(total, nonNegativeInteger(start));
	return { totalItems: total, cursor, done: cursor >= total };
}

/**
 * Claim the next fixed-size range from a cursor. This is deterministic for a
 * given cursor and budget and never inspects the clock.
 * @param {FixedItemCursor} cursor
 * @param {number} itemBudget
 * @returns {ItemRange}
 */
export function claimFixedItemRange(cursor, itemBudget) {
	if (!cursor || !Number.isFinite(cursor.totalItems)) {
		throw new TypeError("A valid fixed-item cursor is required.");
	}
	const budget = nonNegativeInteger(itemBudget);
	const start = Math.min(cursor.totalItems, nonNegativeInteger(cursor.cursor));
	const end = Math.min(cursor.totalItems, start + budget);
	cursor.cursor = end;
	cursor.done = end >= cursor.totalItems;
	return { start, end, count: end - start, done: cursor.done };
}

/**
 * Create a range-based deterministic job.
 * @param {object} options
 * @param {string} options.id
 * @param {number} options.totalItems
 * @param {(start:number,end:number,job:DeterministicJob)=>void} options.processRange
 * @param {number|string} [options.generation=0]
 * @param {number} [options.start=0]
 * @param {number} [options.maxItemsPerTurn=Infinity]
 * @param {(job:DeterministicJob)=>void} [options.onComplete]
 * @param {(job:DeterministicJob)=>void} [options.onCancel]
 * @param {Record<string, unknown>} [options.metadata]
 * @returns {DeterministicJob}
 */
export function createDeterministicJob(options = {}) {
	const id = String(options.id || "").trim();
	if (!id) throw new TypeError("A deterministic job requires a stable id.");
	if (typeof options.processRange !== "function") {
		throw new TypeError(`Deterministic job '${id}' requires processRange().`);
	}
	const cursorState = createFixedItemCursor(options.totalItems, options.start);
	const finiteTurnBudget = Number.isFinite(Number(options.maxItemsPerTurn));
	return {
		id,
		generation: options.generation ?? 0,
		totalItems: cursorState.totalItems,
		cursor: cursorState.cursor,
		maxItemsPerTurn: finiteTurnBudget
			? positiveInteger(options.maxItemsPerTurn)
			: Number.POSITIVE_INFINITY,
		status: "QUEUED",
		result: undefined,
		error: null,
		processRange: options.processRange,
		onComplete:
			typeof options.onComplete === "function" ? options.onComplete : null,
		onCancel: typeof options.onCancel === "function" ? options.onCancel : null,
		metadata: { ...(options.metadata || {}) },
		_completionStarted: false,
	};
}

function finishDeterministicJob(job) {
	if (job._completionStarted || terminalStatus(job.status)) return;
	job._completionStarted = true;
	try {
		if (job.onComplete) job.onComplete(job);
		job.status = "COMPLETE";
	} catch (error) {
		job.error = error;
		job.status = "FAILED";
	}
}

/**
 * Advance one job by at most `itemBudget` items.
 * @param {DeterministicJob} job
 * @param {number} itemBudget
 * @returns {JobChunkResult}
 */
export function runDeterministicJobChunk(job, itemBudget) {
	if (!job || typeof job.processRange !== "function") {
		throw new TypeError("A deterministic job is required.");
	}
	const start = job.cursor;
	if (terminalStatus(job.status)) {
		return {
			id: job.id,
			start,
			end: start,
			processed: 0,
			remaining: Math.max(0, job.totalItems - job.cursor),
			status: job.status,
		};
	}
	if (job.cursor >= job.totalItems) {
		finishDeterministicJob(job);
		return {
			id: job.id,
			start,
			end: start,
			processed: 0,
			remaining: 0,
			status: job.status,
		};
	}
	const budget = Math.min(nonNegativeInteger(itemBudget), job.maxItemsPerTurn);
	if (budget === 0) {
		return {
			id: job.id,
			start,
			end: start,
			processed: 0,
			remaining: job.totalItems - job.cursor,
			status: job.status,
		};
	}
	const end = Math.min(job.totalItems, start + budget);
	job.status = "RUNNING";
	try {
		job.processRange(start, end, job);
		// Advance only after the entire claimed range succeeds.
		job.cursor = end;
	} catch (error) {
		job.error = error;
		job.status = "FAILED";
	}
	if (job.status !== "FAILED" && job.cursor >= job.totalItems) {
		finishDeterministicJob(job);
	}
	return {
		id: job.id,
		start,
		end: job.cursor,
		processed: job.cursor - start,
		remaining: Math.max(0, job.totalItems - job.cursor),
		status: job.status,
	};
}

/**
 * Cancel a job. Completion is never invoked for cancelled work.
 * @param {DeterministicJob} job
 * @param {string} [reason="cancelled"]
 * @returns {boolean} True when this call changed the job state.
 */
export function cancelDeterministicJob(job, reason = "cancelled") {
	if (!job || terminalStatus(job.status)) return false;
	job.status = "CANCELLED";
	job.metadata.cancelReason = String(reason);
	if (job.onCancel) job.onCancel(job);
	return true;
}

/**
 * Create a deterministic round-robin queue. A call to `step()` consumes no
 * more than the supplied total item budget across all jobs.
 * @param {object} [options]
 * @param {number} [options.itemBudget=4096]
 * @param {number} [options.maxItemsPerJobTurn=1024]
 * @returns {DeterministicJobQueue}
 */
export function createDeterministicJobQueue(options = {}) {
	const defaultItemBudget = positiveInteger(options.itemBudget, 4096);
	const maxItemsPerJobTurn = positiveInteger(
		options.maxItemsPerJobTurn,
		Math.min(1024, defaultItemBudget),
	);
	/** @type {Array<DeterministicJob>} */
	const jobs = [];
	const byId = new Map();
	let nextIndex = 0;
	let stepSequence = 0;

	const removeAt = (index) => {
		const [removed] = jobs.splice(index, 1);
		if (removed) byId.delete(removed.id);
		if (jobs.length === 0) nextIndex = 0;
		else if (index < nextIndex) nextIndex--;
		nextIndex %= Math.max(1, jobs.length);
		return removed;
	};

	return {
		enqueue(job) {
			if (!job || typeof job.id !== "string") {
				throw new TypeError("enqueue() requires a deterministic job.");
			}
			if (byId.has(job.id)) {
				throw new Error(`Deterministic job '${job.id}' is already queued.`);
			}
			if (terminalStatus(job.status)) {
				throw new Error(`Cannot enqueue terminal job '${job.id}'.`);
			}
			job.status = "QUEUED";
			jobs.push(job);
			byId.set(job.id, job);
			return job;
		},
		cancel(id, reason = "cancelled") {
			const job = byId.get(String(id));
			if (!job) return false;
			const index = jobs.indexOf(job);
			const changed = cancelDeterministicJob(job, reason);
			if (index >= 0) removeAt(index);
			return changed;
		},
		get(id) {
			return byId.get(String(id));
		},
		has(id) {
			return byId.has(String(id));
		},
		step(itemBudget = defaultItemBudget) {
			const requestedBudget = nonNegativeInteger(itemBudget);
			let remainingBudget = requestedBudget;
			let processed = 0;
			const chunks = [];
			let zeroProgressVisits = 0;
			while (remainingBudget > 0 && jobs.length > 0) {
				nextIndex %= jobs.length;
				const job = jobs[nextIndex];
				if (terminalStatus(job.status)) {
					removeAt(nextIndex);
					continue;
				}
				const perTurnBudget = Math.min(
					remainingBudget,
					maxItemsPerJobTurn,
					job.maxItemsPerTurn,
				);
				const chunk = runDeterministicJobChunk(job, perTurnBudget);
				chunks.push(chunk);
				processed += chunk.processed;
				remainingBudget -= chunk.processed;
				if (terminalStatus(job.status)) {
					removeAt(nextIndex);
				} else {
					nextIndex = (nextIndex + 1) % jobs.length;
				}
				if (chunk.processed === 0) {
					zeroProgressVisits++;
					if (zeroProgressVisits >= jobs.length) break;
				} else {
					zeroProgressVisits = 0;
				}
			}
			stepSequence++;
			return {
				sequence: stepSequence,
				requestedBudget,
				processed,
				unusedBudget: remainingBudget,
				queuedJobs: jobs.length,
				chunks,
			};
		},
		snapshot() {
			return jobs.map((job, index) => ({
				id: job.id,
				generation: job.generation,
				status: job.status,
				cursor: job.cursor,
				totalItems: job.totalItems,
				remaining: Math.max(0, job.totalItems - job.cursor),
				queueIndex: index,
			}));
		},
		clear(reason = "queue-cleared") {
			for (const job of [...jobs]) cancelDeterministicJob(job, reason);
			jobs.length = 0;
			byId.clear();
			nextIndex = 0;
		},
		size() {
			return jobs.length;
		},
	};
}

/**
 * Convert a grid cell index to its 32x32 tile by default.
 * @param {number} cellIndex
 * @param {number} gridWidth
 * @param {number} [tileSize=DEFAULT_SIMULATION_TILE_SIZE]
 */
export function tileCoordinatesForCell(
	cellIndex,
	gridWidth,
	tileSize = DEFAULT_SIMULATION_TILE_SIZE,
) {
	const width = positiveInteger(gridWidth);
	const size = positiveInteger(tileSize, DEFAULT_SIMULATION_TILE_SIZE);
	const index = nonNegativeInteger(cellIndex);
	const cellX = index % width;
	const cellY = Math.floor(index / width);
	const tilesWide = Math.ceil(width / size);
	const tileX = Math.floor(cellX / size);
	const tileY = Math.floor(cellY / size);
	return {
		cellX,
		cellY,
		tileX,
		tileY,
		tileIndex: tileY * tilesWide + tileX,
		tilesWide,
	};
}

/**
 * Return the row-major tile index containing a grid cell.
 * @param {number} cellIndex
 * @param {number} gridWidth
 * @param {number} [tileSize=DEFAULT_SIMULATION_TILE_SIZE]
 */
export function tileIndexForCell(
	cellIndex,
	gridWidth,
	tileSize = DEFAULT_SIMULATION_TILE_SIZE,
) {
	return tileCoordinatesForCell(cellIndex, gridWidth, tileSize).tileIndex;
}

/**
 * Return valid neighboring tile indices in stable row-major order.
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} tilesWide
 * @param {number} tilesHigh
 * @param {boolean} [includeCenter=true]
 * @returns {Array<number>}
 */
export function neighboringTileIndices(
	tileX,
	tileY,
	tilesWide,
	tilesHigh,
	includeCenter = true,
) {
	const width = positiveInteger(tilesWide);
	const height = positiveInteger(tilesHigh);
	const centerX = Math.trunc(Number(tileX));
	const centerY = Math.trunc(Number(tileY));
	const indices = [];
	for (let y = centerY - 1; y <= centerY + 1; y++) {
		if (y < 0 || y >= height) continue;
		for (let x = centerX - 1; x <= centerX + 1; x++) {
			if (x < 0 || x >= width) continue;
			if (!includeCenter && x === centerX && y === centerY) continue;
			indices.push(y * width + x);
		}
	}
	return indices;
}

/**
 * Return the clamped cell bounds for one row-major tile index.
 * @param {number} tileIndex
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @param {number} [tileSize=DEFAULT_SIMULATION_TILE_SIZE]
 */
export function tileBoundsForIndex(
	tileIndex,
	gridWidth,
	gridHeight,
	tileSize = DEFAULT_SIMULATION_TILE_SIZE,
) {
	const width = positiveInteger(gridWidth);
	const height = positiveInteger(gridHeight);
	const size = positiveInteger(tileSize, DEFAULT_SIMULATION_TILE_SIZE);
	const tilesWide = Math.ceil(width / size);
	const tilesHigh = Math.ceil(height / size);
	const index = Math.min(
		tilesWide * tilesHigh - 1,
		nonNegativeInteger(tileIndex),
	);
	const tileX = index % tilesWide;
	const tileY = Math.floor(index / tilesWide);
	const minX = tileX * size;
	const minY = tileY * size;
	return {
		tileIndex: index,
		tileX,
		tileY,
		minX,
		minY,
		maxX: Math.min(width, minX + size),
		maxY: Math.min(height, minY + size),
	};
}

/**
 * Track dirty simulation/render tiles without duplicate entries. Consumption
 * is sorted by tile index so callers receive deterministic work ordering.
 * @param {object} options
 * @param {number} options.gridWidth
 * @param {number} options.gridHeight
 * @param {number} [options.tileSize=DEFAULT_SIMULATION_TILE_SIZE]
 * @param {boolean} [options.includeNeighbors=true]
 */
export function createDirtyTileTracker(options = {}) {
	const gridWidth = positiveInteger(options.gridWidth);
	const gridHeight = positiveInteger(options.gridHeight);
	const tileSize = positiveInteger(
		options.tileSize,
		DEFAULT_SIMULATION_TILE_SIZE,
	);
	const tilesWide = Math.ceil(gridWidth / tileSize);
	const tilesHigh = Math.ceil(gridHeight / tileSize);
	const totalTiles = tilesWide * tilesHigh;
	const defaultIncludeNeighbors = options.includeNeighbors !== false;
	const flags = new Uint8Array(totalTiles);
	const dirty = [];
	let revision = 0;

	const markIndex = (tileIndex) => {
		const index = Math.trunc(Number(tileIndex));
		if (index < 0 || index >= totalTiles || flags[index]) return false;
		flags[index] = 1;
		dirty.push(index);
		return true;
	};
	const markTile = (
		tileX,
		tileY,
		includeNeighbors = defaultIncludeNeighbors,
	) => {
		const x = Math.trunc(Number(tileX));
		const y = Math.trunc(Number(tileY));
		if (x < 0 || x >= tilesWide || y < 0 || y >= tilesHigh) return 0;
		const indices = includeNeighbors
			? neighboringTileIndices(x, y, tilesWide, tilesHigh, true)
			: [y * tilesWide + x];
		let added = 0;
		for (const index of indices) added += Number(markIndex(index));
		if (added > 0) revision++;
		return added;
	};

	return {
		gridWidth,
		gridHeight,
		tileSize,
		tilesWide,
		tilesHigh,
		totalTiles,
		markCell(cellIndex, includeNeighbors = defaultIncludeNeighbors) {
			const index = Math.trunc(Number(cellIndex));
			if (index < 0 || index >= gridWidth * gridHeight) return 0;
			const tile = tileCoordinatesForCell(index, gridWidth, tileSize);
			return markTile(tile.tileX, tile.tileY, includeNeighbors);
		},
		markCellXY(cellX, cellY, includeNeighbors = defaultIncludeNeighbors) {
			const x = Math.trunc(Number(cellX));
			const y = Math.trunc(Number(cellY));
			if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return 0;
			return markTile(
				Math.floor(x / tileSize),
				Math.floor(y / tileSize),
				includeNeighbors,
			);
		},
		markTile,
		markAll() {
			let added = 0;
			for (let index = 0; index < totalTiles; index++) {
				added += Number(markIndex(index));
			}
			if (added > 0) revision++;
			return added;
		},
		peek() {
			return [...dirty].sort((left, right) => left - right);
		},
		consume(limit = Number.POSITIVE_INFINITY) {
			const count = Number.isFinite(Number(limit))
				? nonNegativeInteger(limit)
				: dirty.length;
			const sorted = [...dirty].sort((left, right) => left - right);
			const consumed = sorted.slice(0, count);
			if (consumed.length === 0) return [];
			const consumedSet = new Set(consumed);
			for (const index of consumed) flags[index] = 0;
			const retained = dirty.filter((index) => !consumedSet.has(index));
			dirty.length = 0;
			dirty.push(...retained);
			return consumed;
		},
		clear() {
			for (const index of dirty) flags[index] = 0;
			dirty.length = 0;
		},
		size() {
			return dirty.length;
		},
		getRevision() {
			return revision;
		},
		bounds(tileIndex) {
			return tileBoundsForIndex(tileIndex, gridWidth, gridHeight, tileSize);
		},
	};
}
