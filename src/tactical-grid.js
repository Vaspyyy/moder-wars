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
 * @property {number} [combatPower] Explicit tactical strength.
 * @property {number} [health] Strength fallback when combatPower is absent.
 * @property {number} [allyWeight] Local-balance weight.
 * @property {string} [kind] Formation kind, such as army or armor.
 * @property {boolean} [armorSupported] Whether armor has local line support.
 * @property {boolean} [supportRole] Whether this formation provides support.
 */

/**
 * Aggregated information for one side in one fine tactical cell.
 *
 * @typedef {object} TacticalGridCell
 * @property {number} key Collision-free row-major cell key.
 * @property {number} x Longitude column.
 * @property {number} y Latitude row.
 * @property {string} sideKey Normalized side identity.
 * @property {Array<TacticalGridUnit>} units Original unit references.
 * @property {number} count Formation count.
 * @property {number} totalStrength Sum of non-negative formation strength.
 * @property {number} totalAllyWeight Sum of non-negative local-balance weight.
 * @property {number} weightedStrength Sum of strength multiplied by ally weight.
 * @property {number} centroidLat Ally-weighted latitude centroid.
 * @property {number} centroidLng Ally-weighted circular longitude centroid.
 * @property {number} armorCount Armor formations in this cell.
 * @property {number} supportCount Support-capable formations in this cell.
 * @property {boolean} hasArmor Whether the cell contains armor.
 * @property {boolean} hasSupport Whether the cell contains support.
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
 */

/**
 * Fine tactical grid. `bySide` maps normalized side identities to maps of
 * numeric cell keys and per-side cell summaries.
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
	};
}

function defaultSide(unit) {
	return unit?.sideIndex ?? unit?.sideUid ?? unit?.side;
}

function defaultStrength(unit) {
	if (Number.isFinite(Number(unit?.combatPower))) {
		return Math.max(0, Number(unit.combatPower));
	}
	if (Number.isFinite(Number(unit?.health))) {
		return Math.max(0, Number(unit.health));
	}
	return 1;
}

function defaultAllyWeight(unit) {
	return Number.isFinite(Number(unit?.allyWeight))
		? Math.max(0, Number(unit.allyWeight))
		: 1;
}

function defaultArmor(unit) {
	return unit?.kind === "armor" || unit?.isArmor === true;
}

function defaultSupport(unit) {
	return (
		unit?.supportRole === true ||
		String(
			unit?.role || unit?.countryRole || unit?._taskForceRole || "",
		).toUpperCase() === "SUPPORT"
	);
}

function normalizeAccessors(options = {}) {
	return {
		getSide: options.getSide || defaultSide,
		getLat: options.getLat || ((unit) => unit?.lat),
		getLng: options.getLng || ((unit) => unit?.lng),
		getStrength: options.getStrength || defaultStrength,
		getAllyWeight: options.getAllyWeight || defaultAllyWeight,
		isArmor: options.isArmor || defaultArmor,
		isSupport: options.isSupport || defaultSupport,
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
		totalStrength: 0,
		totalAllyWeight: 0,
		weightedStrength: 0,
		centroidLat: 0,
		centroidLng: 0,
		armorCount: 0,
		supportCount: 0,
		hasArmor: false,
		hasSupport: false,
		_sumLat: 0,
		_sumLngSin: 0,
		_sumLngCos: 0,
		_sumRawLat: 0,
		_sumRawLngSin: 0,
		_sumRawLngCos: 0,
	};
}

function finalizeCell(cell) {
	const weighted = cell.totalAllyWeight > 0;
	const divisor = weighted ? cell.totalAllyWeight : Math.max(1, cell.count);
	cell.centroidLat = (weighted ? cell._sumLat : cell._sumRawLat) / divisor;
	const sin = weighted ? cell._sumLngSin : cell._sumRawLngSin;
	const cos = weighted ? cell._sumLngCos : cell._sumRawLngCos;
	cell.centroidLng = wrapTacticalLongitude(
		(Math.atan2(sin / divisor, cos / divisor) * 180) / Math.PI,
	);
	delete cell._sumLat;
	delete cell._sumLngSin;
	delete cell._sumLngCos;
	delete cell._sumRawLat;
	delete cell._sumRawLngSin;
	delete cell._sumRawLngCos;
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
		: options.getSide ||
				options.getLat ||
				options.getLng ||
				options.getStrength ||
				options.getAllyWeight ||
				options.isArmor ||
				options.isSupport
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

		const strength = Math.max(0, finite(accessors.getStrength(unit), 1));
		const allyWeight = Math.max(0, finite(accessors.getAllyWeight(unit), 1));
		const lngRadians = (normalizedLng * Math.PI) / 180;
		cell.units.push(unit);
		cell.count++;
		cell.totalStrength += strength;
		cell.totalAllyWeight += allyWeight;
		cell.weightedStrength += strength * allyWeight;
		cell._sumLat += normalizedLat * allyWeight;
		cell._sumLngSin += Math.sin(lngRadians) * allyWeight;
		cell._sumLngCos += Math.cos(lngRadians) * allyWeight;
		cell._sumRawLat += normalizedLat;
		cell._sumRawLngSin += Math.sin(lngRadians);
		cell._sumRawLngCos += Math.cos(lngRadians);
		if (accessors.isArmor(unit)) cell.armorCount++;
		if (accessors.isSupport(unit)) cell.supportCount++;
		cell.hasArmor = cell.armorCount > 0;
		cell.hasSupport = cell.supportCount > 0;
		grid.counters.insertedUnits++;
		grid.counters.maxBucketOccupancy = Math.max(
			grid.counters.maxBucketOccupancy,
			cell.count,
		);
	}

	grid.counters.sideCount = grid.bySide.size;
	for (const sideCells of grid.bySide.values()) {
		for (const cell of sideCells.values()) finalizeCell(cell);
	}
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
	const sortedKeys = [...sideCells.keys()].sort((left, right) => left - right);
	const getLat = grid.accessors.getLat;
	const getLng = grid.accessors.getLng;

	for (const sourceKey of sortedKeys) {
		const sourceCell = sideCells.get(sourceKey);
		const neighborKeys = new Set();
		for (let dy = -radiusCells; dy <= radiusCells; dy++) {
			const y = sourceCell.y + dy;
			if (y < 0 || y >= grid.rows) continue;
			for (let dx = -radiusCells; dx <= radiusCells; dx++) {
				const x =
					(((sourceCell.x + dx) % grid.columns) + grid.columns) % grid.columns;
				const neighborKey = tacticalCellKey(x, y, grid.columns);
				if (neighborKey >= sourceKey && sideCells.has(neighborKey)) {
					neighborKeys.add(neighborKey);
				}
			}
		}

		for (const targetKey of [...neighborKeys].sort(
			(left, right) => left - right,
		)) {
			const targetCell = sideCells.get(targetKey);
			if (targetKey === sourceKey) {
				for (
					let leftIndex = 0;
					leftIndex < sourceCell.units.length;
					leftIndex++
				) {
					for (
						let rightIndex = leftIndex + 1;
						rightIndex < sourceCell.units.length;
						rightIndex++
					) {
						visitCandidatePair(
							sourceCell.units[leftIndex],
							sourceCell.units[rightIndex],
							sourceCell,
							targetCell,
						);
					}
				}
			} else {
				for (const left of sourceCell.units) {
					for (const right of targetCell.units) {
						visitCandidatePair(left, right, sourceCell, targetCell);
					}
				}
			}
		}
	}

	if (grid.counters) {
		grid.counters.candidatePairs += result.candidatePairs;
		grid.counters.acceptedPairs += result.acceptedPairs;
	}
	return result;

	function visitCandidatePair(left, right, leftCell, rightCell) {
		result.candidatePairs++;
		const distanceSq = wrappedDistanceSq(left, right, getLat, getLng);
		if (distanceSq > radiusSq) return;
		if (
			acceptPair &&
			!acceptPair(left, right, distanceSq, leftCell, rightCell)
		) {
			return;
		}
		result.acceptedPairs++;
		visitor(left, right, distanceSq, leftCell, rightCell);
	}
}
