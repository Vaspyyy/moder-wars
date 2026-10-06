export const TACTICAL_GRID_SCHEMA_VERSION = "1";
export const DEFAULT_TACTICAL_CELL_SIZE = 0.6;

/**
 * Minimal unit shape understood by the tactical grid. Runtime callers may use
 * richer mutable unit objects; the grid retains those original references.
 *
 * @typedef {object} TacticalGridUnit
 * @property {string|number} id Stable formation identity.
 * @property {string|number} [sideIndex] Owning side index or UID.
 * @property {string|number} [sideUid] Owning side UID fallback.
 * @property {number} lat Latitude in degrees.
 * @property {number} lng Longitude in degrees.
 */

/**
 * Unit bucket for one side in one fine tactical cell.
 *
 * @typedef {object} TacticalGridCell
 * @property {number} key Collision-free row-major cell key.
 * @property {number} x Longitude column.
 * @property {number} y Latitude row.
 * @property {string} sideKey Normalized side identity.
 * @property {Array<TacticalGridUnit>} units Original unit references.
 * @property {number} count Formation count.
 */

/**
 * Low-overhead counters intended for the runtime performance profiler.
 * Pair counts include only calls made since the latest grid rebuild or explicit
 * pair-counter reset.
 *
 * @typedef {object} TacticalGridCounters
 * @property {number} inputUnits Units supplied to the latest rebuild.
 * @property {number} insertedUnits Units placed into cells.
 * @property {number} skippedUnits Units omitted because side or position was invalid.
 * @property {number} sideCount Number of side maps.
 * @property {number} cellCount Number of occupied per-side cells.
 * @property {number} maxBucketOccupancy Largest occupied per-side cell.
 * @property {number} candidatePairs Pairs found in neighboring buckets.
 * @property {number} acceptedPairs Candidate pairs passing distance and caller filters.
 * @property {number} aggregatedPairs Pairs handled by an exact cell-pair aggregate.
 */

/**
 * Fine tactical grid. `bySide` maps normalized side identities to maps of
 * numeric cell keys and per-side unit buckets.
 *
 * @typedef {object} TacticalGrid
 * @property {string} schemaVersion
 * @property {number} cellSize Cell width and height in degrees.
 * @property {number} columns Number of longitude columns.
 * @property {number} rows Number of latitude rows.
 * @property {Map<string, Map<number, TacticalGridCell>>} bySide
 * @property {TacticalGridCounters} counters
 * @property {object} accessors Normalized unit accessor functions.
 */

function finite(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function positiveCellSize(value) {
	const size = finite(value, DEFAULT_TACTICAL_CELL_SIZE);
	if (size <= 0 || size > 180) {
		throw new RangeError(
			"Tactical cell size must be greater than 0 and at most 180",
		);
	}
	return size;
}

function normalizeSideKey(side) {
	return side == null ? "" : String(side);
}

export function wrapTacticalLongitude(lng) {
	const value = finite(lng);
	return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function getTacticalGridDimensions(
	cellSize = DEFAULT_TACTICAL_CELL_SIZE,
) {
	const size = positiveCellSize(cellSize);
	const columns = Math.ceil(360 / size);
	const rows = Math.ceil(180 / size);
	if (!Number.isSafeInteger(columns * rows)) {
		throw new RangeError(
			"Tactical cell size exceeds safe numeric key capacity",
		);
	}
	return {
		cellSize: size,
		columns,
		rows,
	};
}

/**
 * Returns a collision-free numeric key for valid row-major grid coordinates.
 */
export function tacticalCellKey(x, y, columns) {
	if (
		!Number.isInteger(x) ||
		!Number.isInteger(y) ||
		!Number.isInteger(columns) ||
		columns <= 0 ||
		x < 0 ||
		x >= columns ||
		y < 0
	) {
		throw new RangeError("Invalid tactical cell coordinates");
	}
	const key = y * columns + x;
	if (!Number.isSafeInteger(key)) {
		throw new RangeError("Tactical cell key exceeds safe integer capacity");
	}
	return key;
}

export function parseTacticalCellKey(key, columns) {
	if (
		!Number.isSafeInteger(key) ||
		key < 0 ||
		!Number.isInteger(columns) ||
		columns <= 0
	) {
		return null;
	}
	return { x: key % columns, y: Math.floor(key / columns) };
}

/**
 * Converts a world position to a fine-grid coordinate. Longitudes wrap at the
 * antimeridian and latitude 90 is clamped into the final row.
 */
export function tacticalCellCoords(
	lat,
	lng,
	cellSize = DEFAULT_TACTICAL_CELL_SIZE,
) {
	if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
		return null;
	}
	const dimensions = getTacticalGridDimensions(cellSize);
	const normalizedLat = Math.max(-90, Math.min(90, Number(lat)));
	const normalizedLng = wrapTacticalLongitude(Number(lng));
	const x = Math.min(
		dimensions.columns - 1,
		Math.floor((normalizedLng + 180) / dimensions.cellSize),
	);
	const y = Math.min(
		dimensions.rows - 1,
		Math.floor((normalizedLat + 90) / dimensions.cellSize),
	);
	return {
		x,
		y,
		key: tacticalCellKey(x, y, dimensions.columns),
	};
}

export function createTacticalGridCounters() {
	return {
		inputUnits: 0,
		insertedUnits: 0,
		skippedUnits: 0,
		sideCount: 0,
		cellCount: 0,
		maxBucketOccupancy: 0,
		candidatePairs: 0,
		acceptedPairs: 0,
		aggregatedPairs: 0,
	};
}

function defaultSide(unit) {
	return unit?.sideIndex ?? unit?.sideUid ?? unit?.side;
}

function defaultLat(unit) {
	return unit?.lat;
}

function defaultLng(unit) {
	return unit?.lng;
}

function normalizeAccessors(options = {}) {
	return {
		getSide: options.getSide || defaultSide,
		getLat: options.getLat || defaultLat,
		getLng: options.getLng || defaultLng,
	};
}

export function createTacticalGrid(options = {}) {
	const dimensions = getTacticalGridDimensions(
		options.cellSize ?? DEFAULT_TACTICAL_CELL_SIZE,
	);
	return {
		schemaVersion: TACTICAL_GRID_SCHEMA_VERSION,
		...dimensions,
		bySide: new Map(),
		counters: createTacticalGridCounters(),
		accessors: normalizeAccessors(options),
	};
}

function createCell(key, x, y, sideKey) {
	return {
		key,
		x,
		y,
		sideKey,
		units: [],
		count: 0,
	};
}

/**
 * Rebuilds an existing grid without replacing its side maps. This keeps the
 * top-level object stable for runtime integration while clearing stale cells.
 */
export function rebuildTacticalGrid(grid, units, options = {}) {
	if (!grid?.bySide || !(grid.bySide instanceof Map)) {
		throw new TypeError(
			"A TacticalGrid created by createTacticalGrid is required",
		);
	}
	if (options.cellSize != null && Number(options.cellSize) !== grid.cellSize) {
		throw new RangeError("Create a new tactical grid when changing cell size");
	}
	grid.bySide.clear();
	grid.accessors = options.accessors
		? normalizeAccessors(options.accessors)
		: options.getSide || options.getLat || options.getLng
			? normalizeAccessors({ ...grid.accessors, ...options })
			: grid.accessors;
	grid.counters = createTacticalGridCounters();
	const source = Array.isArray(units) ? units : [];
	grid.counters.inputUnits = source.length;
	const accessors = grid.accessors;

	for (const unit of source) {
		const sideKey = normalizeSideKey(accessors.getSide(unit));
		const lat = Number(accessors.getLat(unit));
		const lng = Number(accessors.getLng(unit));
		if (!sideKey || !Number.isFinite(lat) || !Number.isFinite(lng)) {
			grid.counters.skippedUnits++;
			continue;
		}
		const normalizedLat = Math.max(-90, Math.min(90, lat));
		const normalizedLng = wrapTacticalLongitude(lng);
		const x = Math.min(
			grid.columns - 1,
			Math.floor((normalizedLng + 180) / grid.cellSize),
		);
		const y = Math.min(
			grid.rows - 1,
			Math.floor((normalizedLat + 90) / grid.cellSize),
		);
		const key = tacticalCellKey(x, y, grid.columns);
		let sideCells = grid.bySide.get(sideKey);
		if (!sideCells) {
			sideCells = new Map();
			grid.bySide.set(sideKey, sideCells);
		}
		let cell = sideCells.get(key);
		if (!cell) {
			cell = createCell(key, x, y, sideKey);
			sideCells.set(key, cell);
			grid.counters.cellCount++;
		}

		cell.units.push(unit);
		cell.count++;

		grid.counters.insertedUnits++;
		grid.counters.maxBucketOccupancy = Math.max(
			grid.counters.maxBucketOccupancy,
			cell.count,
		);
	}

	grid.counters.sideCount = grid.bySide.size;
	return grid;
}

export function buildTacticalGrid(units, options = {}) {
	return rebuildTacticalGrid(createTacticalGrid(options), units);
}

export function getTacticalSideCells(grid, side) {
	return grid?.bySide?.get(normalizeSideKey(side)) || null;
}

export function getTacticalCell(grid, side, lat, lng) {
	const coords = tacticalCellCoords(lat, lng, grid?.cellSize);
	return coords
		? getTacticalSideCells(grid, side)?.get(coords.key) || null
		: null;
}

export function resetTacticalPairCounters(grid) {
	if (!grid?.counters) return;
	grid.counters.candidatePairs = 0;
	grid.counters.acceptedPairs = 0;
	grid.counters.aggregatedPairs = 0;
}

/**
 * Visits occupied neighboring cells for one side in stable row-major order.
 * `origin` may contain grid `x`/`y` or world `lat`/`lng` coordinates.
 * Antimeridian wrapping is automatic and duplicate cells are suppressed.
 *
 * @returns {number} Number of occupied cells visited.
 */
export function forEachNeighborCell(grid, side, origin, visitor, options = {}) {
	const sideCells = getTacticalSideCells(grid, side);
	if (!sideCells || typeof visitor !== "function" || !origin) return 0;
	let x = Number(origin.x);
	let y = Number(origin.y);
	if (!Number.isInteger(x) || !Number.isInteger(y)) {
		const coords = tacticalCellCoords(origin.lat, origin.lng, grid.cellSize);
		if (!coords) return 0;
		x = coords.x;
		y = coords.y;
	}
	if (x < 0 || x >= grid.columns || y < 0 || y >= grid.rows) return 0;

	const radiusCells = Math.max(0, Math.trunc(finite(options.radiusCells, 1)));
	const keys = new Set();
	for (let dy = -radiusCells; dy <= radiusCells; dy++) {
		const neighborY = y + dy;
		if (neighborY < 0 || neighborY >= grid.rows) continue;
		for (let dx = -radiusCells; dx <= radiusCells; dx++) {
			const neighborX =
				(((x + dx) % grid.columns) + grid.columns) % grid.columns;
			const key = tacticalCellKey(neighborX, neighborY, grid.columns);
			if (sideCells.has(key)) keys.add(key);
		}
	}
	const sortedKeys = [...keys].sort((left, right) => left - right);
	for (const key of sortedKeys) visitor(sideCells.get(key));
	return sortedKeys.length;
}

function wrappedDistanceSq(left, right, getLat, getLng) {
	const dLat = finite(getLat(left)) - finite(getLat(right));
	let dLng = finite(getLng(left)) - finite(getLng(right));
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;
	return dLat * dLat + dLng * dLng;
}

/**
 * Aggregate ally density when formation slots already replace repulsion for
 * every pair in a crowded block. Integer weights keep the result exact;
 * fractional weights and any hostile, mixed force, or boundary pair fall back.
 */
export function aggregateTaskForceCellPair(leftCell, rightCell, radiusSq) {
	const sameCell = leftCell === rightCell;
	const pairCount = sameCell
		? (leftCell.units.length * (leftCell.units.length - 1)) / 2
		: leftCell.units.length * rightCell.units.length;
	if (pairCount < 64) return false;
	const forceUid = leftCell.units[0]?._taskForceUid;
	if (!forceUid) return false;
	const originLng = leftCell.units[0].lng;
	let minLat = Infinity;
	let maxLat = -Infinity;
	let minLng = Infinity;
	let maxLng = -Infinity;
	const leftWeight = inspect(leftCell);
	if (leftWeight === null) return false;
	const rightWeight = sameCell ? leftWeight : inspect(rightCell);
	if (rightWeight === null) return false;
	const deltaLat = maxLat - minLat;
	const deltaLng = maxLng - minLng;
	if (deltaLat * deltaLat + deltaLng * deltaLng > radiusSq) return false;
	const totalWeight = leftWeight + (sameCell ? 0 : rightWeight);
	for (const cell of sameCell ? [leftCell] : [leftCell, rightCell]) {
		for (const unit of cell.units) {
			if (
				!skipsLocal(unit) &&
				!Number.isSafeInteger(unit._tickLocalAllyCount + totalWeight)
			)
				return false;
		}
	}
	for (const unit of leftCell.units) {
		if (!skipsLocal(unit)) {
			unit._tickLocalAllyCount += sameCell
				? leftWeight - (unit._tickAllyWeight || 1)
				: rightWeight;
		}
	}
	if (!sameCell) {
		for (const unit of rightCell.units) {
			if (!skipsLocal(unit)) unit._tickLocalAllyCount += leftWeight;
		}
	}
	return true;

	function skipsLocal(unit) {
		return unit.navalAssigned || unit.supplyAssigned || unit.coastalAssigned;
	}

	function inspect(cell) {
		let total = 0;
		for (const unit of cell.units) {
			if (
				unit._taskForceUid !== forceUid ||
				unit._tickHasNearbyHostile ||
				!Number.isFinite(unit.lat) ||
				!Number.isFinite(unit.lng) ||
				unit.lng < -180 ||
				unit.lng > 180
			)
				return null;
			const weight = unit._tickAllyWeight || 1;
			if (!Number.isSafeInteger(weight) || weight < 0) return null;
			total += weight;
			if (!Number.isSafeInteger(total)) return null;
			let lng = unit.lng - originLng;
			if (lng > 180) lng -= 360;
			else if (lng < -180) lng += 360;
			minLat = Math.min(minLat, unit.lat);
			maxLat = Math.max(maxLat, unit.lat);
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
		}
		return total;
	}
}

/**
 * Visits each unordered unit pair in the selected side's neighboring cells at
 * most once. Cells and neighbor keys use canonical numeric ordering, including
 * across the antimeridian. The visitor receives
 * `(leftUnit, rightUnit, distanceSq, leftCell, rightCell)`.
 *
 * @returns {{candidatePairs:number,acceptedPairs:number,maxBucketOccupancy:number}}
 */
export function forEachUnorderedNeighborPair(
	grid,
	side,
	visitor,
	options = {},
) {
	const sideCells = getTacticalSideCells(grid, side);
	const result = {
		candidatePairs: 0,
		acceptedPairs: 0,
		aggregatedPairs: 0,
		maxBucketOccupancy: grid?.counters?.maxBucketOccupancy || 0,
	};
	if (!sideCells || typeof visitor !== "function") return result;

	const radiusCells = Math.max(0, Math.trunc(finite(options.radiusCells, 1)));
	const radiusSq =
		options.radiusSq == null
			? Number.POSITIVE_INFINITY
			: Math.max(0, finite(options.radiusSq));
	const acceptPair =
		typeof options.acceptPair === "function" ? options.acceptPair : null;
	const aggregateCellPair =
		!acceptPair && typeof options.aggregateCellPair === "function"
			? options.aggregateCellPair
			: null;
	const sortedKeys = [...sideCells.keys()].sort((left, right) => left - right);
	const getLat = grid.accessors.getLat;
	const getLng = grid.accessors.getLng;
	// Inserted units always have finite coordinates, so the default accessors
	// can be read directly in the pair loop.
	const directCoordinates = getLat === defaultLat && getLng === defaultLng;
	const neighborKeys = [];

	for (const sourceKey of sortedKeys) {
		const sourceCell = sideCells.get(sourceKey);
		neighborKeys.length = 0;
		for (let dy = -radiusCells; dy <= radiusCells; dy++) {
			const y = sourceCell.y + dy;
			if (y < 0 || y >= grid.rows) continue;
			for (let dx = -radiusCells; dx <= radiusCells; dx++) {
				const x =
					(((sourceCell.x + dx) % grid.columns) + grid.columns) % grid.columns;
				const neighborKey = y * grid.columns + x;
				if (neighborKey < sourceKey || !sideCells.has(neighborKey)) continue;
				// Keep keys sorted and unique; a narrow grid can wrap onto itself.
				let index = neighborKeys.length;
				while (index > 0 && neighborKeys[index - 1] > neighborKey) index--;
				if (index > 0 && neighborKeys[index - 1] === neighborKey) continue;
				neighborKeys.splice(index, 0, neighborKey);
			}
		}

		for (const targetKey of neighborKeys) {
			const targetCell = sideCells.get(targetKey);
			if (aggregateCellPair?.(sourceCell, targetCell, radiusSq)) {
				const count =
					targetKey === sourceKey
						? (sourceCell.units.length * (sourceCell.units.length - 1)) / 2
						: sourceCell.units.length * targetCell.units.length;
				result.candidatePairs += count;
				result.acceptedPairs += count;
				result.aggregatedPairs += count;
				continue;
			}
			const sourceUnits = sourceCell.units;
			const targetUnits = targetCell.units;
			const sameCell = targetKey === sourceKey;
			for (let leftIndex = 0; leftIndex < sourceUnits.length; leftIndex++) {
				const left = sourceUnits[leftIndex];
				for (
					let rightIndex = sameCell ? leftIndex + 1 : 0;
					rightIndex < targetUnits.length;
					rightIndex++
				) {
					const right = targetUnits[rightIndex];
					result.candidatePairs++;
					let distanceSq;
					if (directCoordinates) {
						const dLat = left.lat - right.lat;
						let dLng = left.lng - right.lng;
						if (dLng > 180) dLng -= 360;
						else if (dLng < -180) dLng += 360;
						distanceSq = dLat * dLat + dLng * dLng;
					} else distanceSq = wrappedDistanceSq(left, right, getLat, getLng);
					if (distanceSq > radiusSq) continue;
					if (
						acceptPair &&
						!acceptPair(left, right, distanceSq, sourceCell, targetCell)
					)
						continue;
					result.acceptedPairs++;
					visitor(left, right, distanceSq, sourceCell, targetCell);
				}
			}
		}
	}

	if (grid.counters) {
		grid.counters.candidatePairs += result.candidatePairs;
		grid.counters.acceptedPairs += result.acceptedPairs;
		grid.counters.aggregatedPairs += result.aggregatedPairs;
	}
	return result;
}
