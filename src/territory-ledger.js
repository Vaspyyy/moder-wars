import {
	createDirtyTileTracker,
	tileBoundsForIndex,
} from "./simulation-jobs.js";

export const DEFAULT_TERRITORY_LEDGER_TILE_SIZE = 32;

/**
 * Maps consumed by the territory ledger. The arrays remain owned by the
 * simulation; callers must mark changed cells after mutating them.
 * @typedef {object} TerritoryLedgerMaps
 * @property {ArrayLike<number>} landMask
 * @property {ArrayLike<number>} worldControlMap Sovereign/current country id.
 * @property {ArrayLike<number>} dominantSideMap Side currently controlling the cell.
 * @property {ArrayLike<number>} [deJureMap] Historical/core country id.
 * @property {ArrayLike<number>} [primaryOccupierMap] Country credited with current control.
 * @property {ArrayLike<number>} [occupationMap] Optional signed legacy occupation value.
 */

/**
 * Optional city input. `cellIndex` may be supplied directly; otherwise the
 * ledger calls the configured `getCityCellIndex` once when cities are indexed.
 * @typedef {object} TerritoryLedgerCity
 * @property {number|string} [id]
 * @property {number} [cellIndex]
 * @property {number} [gridIndex]
 * @property {number} [ownerId]
 * @property {number} [sovereignId]
 * @property {number} [pop]
 * @property {number} [population]
 * @property {boolean} [isCapital]
 */

/**
 * Immutable, atomically published territory snapshot.
 * @typedef {object} TerritoryLedgerSnapshot
 * @property {number} generation
 * @property {number} commitSequence
 * @property {number|string} topologyRevision
 * @property {number|string} worldRevision
 * @property {number|string} cityRevision
 * @property {number} landCells
 * @property {number} positiveOccupationCells
 * @property {number} negativeOccupationCells
 * @property {ReadonlyArray<object>} countries
 * @property {Readonly<Record<string, object>>} countryById
 * @property {ReadonlyArray<object>} sides
 * @property {Readonly<Record<string, object>>} sideByIndex
 */

const COUNTRY_SCALARS = Object.freeze([
	"owned",
	"controlled",
	"creditedTerritory",
	"frontline",
	"deJureTotal",
	"coreControlled",
	"citiesTotal",
	"citiesControlled",
	"cityPopulationTotal",
	"cityPopulationControlled",
	"capitalsTotal",
	"capitalsHeld",
]);

const COUNTRY_NESTED = Object.freeze([
	"deJureControlBySide",
	"deJureControlByCountry",
	"cityControlBySide",
	"cityPopulationBySide",
	"capitalControlBySide",
]);

const SIDE_SCALARS = Object.freeze([
	"territory",
	"ownedTerritory",
	"homeTerritoryControlled",
	"frontline",
	"deJureCellsControlled",
	"citiesControlled",
	"cityPopulationControlled",
	"capitalsControlled",
]);

function integer(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function positiveInteger(value, fallback = 1) {
	return Math.max(1, integer(value, fallback));
}

function countryId(value) {
	const id = integer(value, 0);
	return id > 0 ? id : 0;
}

function sideIndex(value) {
	const index = integer(value, -1);
	return index >= 0 ? index : -1;
}

function increment(map, key, amount = 1) {
	if (key === undefined || key === null || amount === 0) return;
	map.set(key, (map.get(key) || 0) + amount);
}

function frozenNumericRecord(map) {
	const record = {};
	for (const [key, value] of [...map.entries()].sort(
		([left], [right]) => Number(left) - Number(right),
	)) {
		if (value !== 0) record[key] = value;
	}
	return Object.freeze(record);
}

function createCountryCounts() {
	return {
		owned: 0,
		controlled: 0,
		creditedTerritory: 0,
		frontline: 0,
		deJureTotal: 0,
		coreControlled: 0,
		citiesTotal: 0,
		citiesControlled: 0,
		cityPopulationTotal: 0,
		cityPopulationControlled: 0,
		capitalsTotal: 0,
		capitalsHeld: 0,
		deJureControlBySide: new Map(),
		deJureControlByCountry: new Map(),
		cityControlBySide: new Map(),
		cityPopulationBySide: new Map(),
		capitalControlBySide: new Map(),
	};
}

function createSideCounts() {
	return {
		territory: 0,
		ownedTerritory: 0,
		homeTerritoryControlled: 0,
		frontline: 0,
		deJureCellsControlled: 0,
		citiesControlled: 0,
		cityPopulationControlled: 0,
		capitalsControlled: 0,
	};
}

function createAggregate() {
	return {
		landCells: 0,
		positiveOccupationCells: 0,
		negativeOccupationCells: 0,
		countries: new Map(),
		sides: new Map(),
	};
}

function countryCounts(aggregate, id) {
	let counts = aggregate.countries.get(id);
	if (!counts) {
		counts = createCountryCounts();
		aggregate.countries.set(id, counts);
	}
	return counts;
}

function sideCounts(aggregate, index) {
	let counts = aggregate.sides.get(index);
	if (!counts) {
		counts = createSideCounts();
		aggregate.sides.set(index, counts);
	}
	return counts;
}

function cloneAggregate(source) {
	const clone = createAggregate();
	clone.landCells = source.landCells;
	clone.positiveOccupationCells = source.positiveOccupationCells;
	clone.negativeOccupationCells = source.negativeOccupationCells;
	for (const [id, sourceCounts] of source.countries) {
		const next = createCountryCounts();
		for (const field of COUNTRY_SCALARS) next[field] = sourceCounts[field];
		for (const field of COUNTRY_NESTED) {
			next[field] = new Map(sourceCounts[field]);
		}
		clone.countries.set(id, next);
	}
	for (const [index, sourceCounts] of source.sides) {
		clone.sides.set(index, { ...sourceCounts });
	}
	return clone;
}

function applyNestedCounts(target, source, direction) {
	for (const [key, count] of source) {
		const next = (target.get(key) || 0) + count * direction;
		if (next === 0) target.delete(key);
		else target.set(key, next);
	}
}

function applyTileSummary(aggregate, summary, direction) {
	if (!summary) return;
	aggregate.landCells += summary.landCells * direction;
	aggregate.positiveOccupationCells +=
		summary.positiveOccupationCells * direction;
	aggregate.negativeOccupationCells +=
		summary.negativeOccupationCells * direction;
	for (const [id, sourceCounts] of summary.countries) {
		const target = countryCounts(aggregate, id);
		for (const field of COUNTRY_SCALARS) {
			target[field] += sourceCounts[field] * direction;
		}
		for (const field of COUNTRY_NESTED) {
			applyNestedCounts(target[field], sourceCounts[field], direction);
		}
	}
	for (const [index, sourceCounts] of summary.sides) {
		const target = sideCounts(aggregate, index);
		for (const field of SIDE_SCALARS) {
			target[field] += sourceCounts[field] * direction;
		}
	}
}

function normalizeCountryToSide(source) {
	const mapping = new Map();
	let entries;
	if (source instanceof Map) entries = source.entries();
	else if (source && typeof source[Symbol.iterator] === "function") {
		entries = source;
	} else if (source && typeof source === "object") {
		entries = Object.entries(source);
	} else entries = [];
	for (const entry of entries) {
		if (!entry || entry.length < 2) continue;
		const id = countryId(entry[0]);
		const index = sideIndex(entry[1]);
		if (id > 0 && index >= 0) mapping.set(id, index);
	}
	return mapping;
}

function normalizeSideUids(source) {
	if (Array.isArray(source)) return source.map((value) => String(value || ""));
	const uids = [];
	if (source instanceof Map) {
		for (const [index, uid] of source) {
			const normalized = sideIndex(index);
			if (normalized >= 0) uids[normalized] = String(uid || "");
		}
	}
	return uids;
}

function hostileKey(left, right) {
	return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function resolveSideReference(value, sideUids) {
	const numeric = Number(value);
	if (Number.isInteger(numeric) && numeric >= 0) return numeric;
	const uid = String(value || "");
	return sideUids.indexOf(uid);
}

function normalizeHostilePairs(source, sideUids) {
	const pairs = new Set();
	if (!source || typeof source[Symbol.iterator] !== "function") return pairs;
	for (const pair of source) {
		let left;
		let right;
		if (Array.isArray(pair)) [left, right] = pair;
		else if (typeof pair === "string") [left, right] = pair.split("|");
		else continue;
		const leftIndex = resolveSideReference(left, sideUids);
		const rightIndex = resolveSideReference(right, sideUids);
		if (leftIndex >= 0 && rightIndex >= 0 && leftIndex !== rightIndex) {
			pairs.add(hostileKey(leftIndex, rightIndex));
		}
	}
	return pairs;
}

function createTopology(options = {}) {
	const countryToSide = normalizeCountryToSide(options.countryToSide);
	const sideUids = normalizeSideUids(options.sideUids);
	const highestMappedSide = Math.max(-1, ...countryToSide.values());
	const suppliedMatrix = options.hostilityMatrix;
	const hasSuppliedMatrix =
		suppliedMatrix !== undefined && suppliedMatrix !== null;
	const hasExplicitMaxSides =
		options.maxSides !== undefined && options.maxSides !== null;
	let maxSides = positiveInteger(
		options.maxSides,
		Math.max(sideUids.length, highestMappedSide + 1, 1),
	);
	let hostilityMatrix = null;
	if (hasSuppliedMatrix) {
		const matrixLength = Number(suppliedMatrix.length);
		if (!Number.isInteger(matrixLength) || matrixLength <= 0) {
			throw new RangeError(
				"A hostility matrix must contain a non-empty square number of entries.",
			);
		}
		if (!hasExplicitMaxSides) {
			const square = Math.sqrt(matrixLength);
			if (!Number.isInteger(square)) {
				throw new RangeError(
					`Cannot infer maxSides from hostility matrix length ${matrixLength}; the length must be a perfect square.`,
				);
			}
			maxSides = square;
		}
		const expectedLength = maxSides * maxSides;
		if (matrixLength !== expectedLength) {
			throw new RangeError(
				`Hostility matrix length ${matrixLength} does not match maxSides ${maxSides}; expected ${expectedLength} entries.`,
			);
		}
		hostilityMatrix = Uint8Array.from(suppliedMatrix);
	}
	if (sideUids.length > maxSides || highestMappedSide >= maxSides) {
		throw new RangeError(
			`Side topology exceeds maxSides ${maxSides}; received ${sideUids.length} side UIDs and mapped side index ${highestMappedSide}.`,
		);
	}
	const hostilePairs = hostilityMatrix
		? new Set()
		: normalizeHostilePairs(options.hostileSidePairs, sideUids);
	const revision = options.revision ?? options.topologyRevision ?? 0;
	const mappingSignature = [...countryToSide.entries()].sort(
		([left], [right]) => left - right,
	);
	const hostilitySignature = hostilityMatrix
		? ["matrix", ...hostilityMatrix]
		: ["pairs", ...[...hostilePairs].sort()];
	const signature = JSON.stringify([
		revision,
		mappingSignature,
		sideUids,
		maxSides,
		hostilitySignature,
	]);
	return {
		countryToSide,
		sideUids,
		maxSides,
		hostilityMatrix,
		hostilePairs,
		revision,
		signature,
	};
}

function sidesHostile(topology, left, right) {
	if (left < 0 || right < 0 || left === right) return false;
	if (topology.hostilityMatrix) {
		if (left >= topology.maxSides || right >= topology.maxSides) return false;
		return topology.hostilityMatrix[left * topology.maxSides + right] === 1;
	}
	return topology.hostilePairs.has(hostileKey(left, right));
}

function validateMaps(maps, totalCells) {
	if (!maps || typeof maps !== "object") {
		throw new TypeError("A territory ledger requires simulation maps.");
	}
	for (const name of ["landMask", "worldControlMap", "dominantSideMap"]) {
		if (!maps[name] || Number(maps[name].length) !== totalCells) {
			throw new RangeError(
				`Territory ledger map '${name}' must contain ${totalCells} cells.`,
			);
		}
	}
	for (const name of ["deJureMap", "primaryOccupierMap", "occupationMap"]) {
		if (maps[name] && Number(maps[name].length) !== totalCells) {
			throw new RangeError(
				`Territory ledger map '${name}' must contain ${totalCells} cells.`,
			);
		}
	}
	return maps;
}

function normalizeCities(
	cities,
	getCityCellIndex,
	totalCells,
	gridWidth,
	tileSize,
) {
	const byTile = new Map();
	let total = 0;
	for (
		let sourceIndex = 0;
		sourceIndex < (cities || []).length;
		sourceIndex++
	) {
		const city = cities[sourceIndex];
		if (!city) continue;
		const explicitIndex = city.cellIndex ?? city.gridIndex;
		const resolvedIndex =
			explicitIndex !== undefined && explicitIndex !== null
				? explicitIndex
				: typeof getCityCellIndex === "function"
					? getCityCellIndex(city, sourceIndex)
					: explicitIndex;
		const cellIndex = integer(resolvedIndex, -1);
		if (cellIndex < 0 || cellIndex >= totalCells) continue;
		const ownerCountryId = countryId(city.ownerId || city.sovereignId);
		const population = Math.max(
			0,
			Number(city.pop ?? city.population ?? 0) || 0,
		);
		const cellX = cellIndex % gridWidth;
		const cellY = Math.floor(cellIndex / gridWidth);
		const tilesWide = Math.ceil(gridWidth / tileSize);
		const tileIndex =
			Math.floor(cellY / tileSize) * tilesWide + Math.floor(cellX / tileSize);
		const record = Object.freeze({
			id: city.id ?? sourceIndex,
			sourceIndex,
			cellIndex,
			ownerCountryId,
			population,
			isCapital: city.isCapital === true,
		});
		if (!byTile.has(tileIndex)) byTile.set(tileIndex, []);
		byTile.get(tileIndex).push(record);
		total++;
	}
	for (const records of byTile.values()) {
		records.sort(
			(left, right) =>
				left.cellIndex - right.cellIndex ||
				left.sourceIndex - right.sourceIndex,
		);
	}
	return { byTile, total };
}

function buildSnapshot(aggregate, context) {
	const countryIds = new Set([
		...aggregate.countries.keys(),
		...context.topology.countryToSide.keys(),
	]);
	const countryById = {};
	const countries = [...countryIds]
		.sort((left, right) => left - right)
		.map((id) => {
			const counts = aggregate.countries.get(id) || createCountryCounts();
			const index = context.topology.countryToSide.get(id) ?? -1;
			const deJureTotal = Math.max(0, counts.deJureTotal);
			const coreControlled = Math.max(0, counts.coreControlled);
			const capitalsTotal = Math.max(0, counts.capitalsTotal);
			const capitalsHeld = Math.max(0, counts.capitalsHeld);
			const record = Object.freeze({
				countryId: id,
				sideIndex: index,
				sideUid: index >= 0 ? context.topology.sideUids[index] || null : null,
				owned: Math.max(0, counts.owned),
				controlled: Math.max(0, counts.controlled),
				creditedTerritory: Math.max(0, counts.creditedTerritory),
				frontline: Math.max(0, counts.frontline),
				deJureTotal,
				coreControlled,
				coreControlRatio:
					deJureTotal > 0 ? Math.min(1, coreControlled / deJureTotal) : 0,
				deJureNotHeld: Math.max(0, deJureTotal - coreControlled),
				deJureControlBySide: frozenNumericRecord(counts.deJureControlBySide),
				deJureControlByCountry: frozenNumericRecord(
					counts.deJureControlByCountry,
				),
				citiesTotal: Math.max(0, counts.citiesTotal),
				citiesControlled: Math.max(0, counts.citiesControlled),
				cityPopulationTotal: Math.max(0, counts.cityPopulationTotal),
				cityPopulationControlled: Math.max(0, counts.cityPopulationControlled),
				capitalsTotal,
				capitalsHeld,
				capitalHeld: capitalsTotal === 0 || capitalsHeld === capitalsTotal,
				cityControlBySide: frozenNumericRecord(counts.cityControlBySide),
				cityPopulationBySide: frozenNumericRecord(counts.cityPopulationBySide),
				capitalControlBySide: frozenNumericRecord(counts.capitalControlBySide),
			});
			countryById[id] = record;
			return record;
		});

	const sideIndices = new Set(aggregate.sides.keys());
	for (const index of context.topology.countryToSide.values()) {
		sideIndices.add(index);
	}
	const sideByIndex = {};
	const sides = [...sideIndices]
		.sort((left, right) => left - right)
		.map((index) => {
			const counts = aggregate.sides.get(index) || createSideCounts();
			const record = Object.freeze({
				sideIndex: index,
				sideUid: context.topology.sideUids[index] || null,
				countryIds: Object.freeze(
					[...context.topology.countryToSide.entries()]
						.filter(([, mappedSide]) => mappedSide === index)
						.map(([id]) => id)
						.sort((left, right) => left - right),
				),
				territory: Math.max(0, counts.territory),
				ownedTerritory: Math.max(0, counts.ownedTerritory),
				homeTerritoryControlled: Math.max(0, counts.homeTerritoryControlled),
				frontline: Math.max(0, counts.frontline),
				deJureCellsControlled: Math.max(0, counts.deJureCellsControlled),
				citiesControlled: Math.max(0, counts.citiesControlled),
				cityPopulationControlled: Math.max(0, counts.cityPopulationControlled),
				capitalsControlled: Math.max(0, counts.capitalsControlled),
			});
			sideByIndex[index] = record;
			return record;
		});

	return Object.freeze({
		generation: context.generation,
		commitSequence: context.commitSequence,
		topologyRevision: context.topology.revision,
		worldRevision: context.worldRevision,
		cityRevision: context.cityRevision,
		processedTiles: context.processedTiles,
		processedItems: context.processedItems,
		pendingDirtyTilesAtCommit: context.pendingDirtyTilesAtCommit,
		landCells: Math.max(0, aggregate.landCells),
		positiveOccupationCells: Math.max(0, aggregate.positiveOccupationCells),
		negativeOccupationCells: Math.max(0, aggregate.negativeOccupationCells),
		countries: Object.freeze(countries),
		countryById: Object.freeze(countryById),
		sides: Object.freeze(sides),
		sideByIndex: Object.freeze(sideByIndex),
	});
}

/**
 * Create an incremental territory ledger. Every call to `step()` is bounded by
 * a deterministic number of grid/city items. Changed tile summaries remain
 * private until the entire generation commits, so consumers see either the
 * prior complete snapshot or the next complete snapshot, never a mixture.
 *
 * Controller changes made while a generation is running append only the dirty
 * tiles to a private rescan tail. `flush()` is intended for exact decision
 * boundaries where the simulation is not mutating maps concurrently.
 *
 * @param {object} options
 * @param {number} options.gridWidth
 * @param {number} options.gridHeight
 * @param {number} [options.tileSize=32]
 * @param {TerritoryLedgerMaps} options.maps
 * @param {Map<number,number>|Array<[number,number]>|Record<string,number>} [options.countryToSide]
 * @param {Array<string>} [options.sideUids]
 * @param {ArrayLike<number>} [options.hostilityMatrix]
 * @param {Iterable<[number|string,number|string]|string>} [options.hostileSidePairs]
 * @param {number} [options.maxSides]
 * @param {number|string} [options.topologyRevision=0]
 * @param {number|string} [options.worldRevision=0]
 * @param {number|string} [options.cityRevision=0]
 * @param {Array<TerritoryLedgerCity>} [options.cities]
 * @param {(city:TerritoryLedgerCity,index:number)=>number} [options.getCityCellIndex]
 * @param {number} [options.countedLandValue] Exact mask value to count; omit to count every value above zero.
 * @param {(landValue:number,index:number)=>boolean} [options.isCountedLand]
 * @param {number} [options.defaultItemBudget=16384]
 * @param {(snapshot:TerritoryLedgerSnapshot)=>void} [options.onCommit]
 */
export function createTerritoryLedger(options = {}) {
	const gridWidth = positiveInteger(options.gridWidth);
	const gridHeight = positiveInteger(options.gridHeight);
	const totalCells = gridWidth * gridHeight;
	const tileSize = positiveInteger(
		options.tileSize,
		DEFAULT_TERRITORY_LEDGER_TILE_SIZE,
	);
	const defaultItemBudget = positiveInteger(options.defaultItemBudget, 16_384);
	const exactLandValue = Number.isFinite(Number(options.countedLandValue))
		? Number(options.countedLandValue)
		: null;
	const customLandPredicate =
		typeof options.isCountedLand === "function" ? options.isCountedLand : null;
	const isCountedLand = (value, index) => {
		if (customLandPredicate) return customLandPredicate(value, index) === true;
		return exactLandValue === null
			? Number(value) > 0
			: value === exactLandValue;
	};

	let maps = validateMaps(options.maps, totalCells);
	let topology = createTopology({
		countryToSide: options.countryToSide,
		sideUids: options.sideUids,
		hostilityMatrix: options.hostilityMatrix,
		hostileSidePairs: options.hostileSidePairs,
		maxSides: options.maxSides,
		revision: options.topologyRevision ?? 0,
	});
	let worldRevision = options.worldRevision ?? 0;
	let cityRevision = options.cityRevision ?? 0;
	let cityIndex = normalizeCities(
		options.cities || [],
		options.getCityCellIndex,
		totalCells,
		gridWidth,
		tileSize,
	);
	let getCityCellIndex = options.getCityCellIndex;
	const onCommit =
		typeof options.onCommit === "function" ? options.onCommit : null;
	const dirty = createDirtyTileTracker({
		gridWidth,
		gridHeight,
		tileSize,
		includeNeighbors: true,
	});
	let committedTiles = new Array(dirty.totalTiles).fill(null);
	let committedAggregate = createAggregate();
	/** @type {TerritoryLedgerSnapshot|null} */
	let committedSnapshot = null;
	let activeGeneration = null;
	let nextGeneration = 1;
	let commitSequence = 0;
	let mutationSequence = 0;
	let lastCommitError = null;

	const resetCommittedState = () => {
		activeGeneration = null;
		committedTiles = new Array(dirty.totalTiles).fill(null);
		committedAggregate = createAggregate();
		committedSnapshot = null;
		dirty.clear();
		dirty.markAll();
		mutationSequence++;
	};

	const beginGeneration = () => {
		if (activeGeneration || dirty.size() === 0) return activeGeneration;
		const tileIndices = dirty.consume();
		let totalItems = 0;
		for (const tileIndex of tileIndices) {
			const bounds = tileBoundsForIndex(
				tileIndex,
				gridWidth,
				gridHeight,
				tileSize,
			);
			totalItems +=
				(bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) +
				(cityIndex.byTile.get(tileIndex)?.length || 0);
		}
		activeGeneration = {
			generation: nextGeneration++,
			tileIndices,
			tileCursor: 0,
			tileState: null,
			changedSummaries: new Map(),
			totalItems,
			processedItems: 0,
			startedMutationSequence: mutationSequence,
		};
		return activeGeneration;
	};

	const appendDirtyTail = (generation) => {
		const tileIndices = dirty.consume();
		for (const tileIndex of tileIndices) {
			const bounds = tileBoundsForIndex(
				tileIndex,
				gridWidth,
				gridHeight,
				tileSize,
			);
			generation.tileIndices.push(tileIndex);
			generation.totalItems +=
				(bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) +
				(cityIndex.byTile.get(tileIndex)?.length || 0);
		}
		generation.startedMutationSequence = mutationSequence;
		return tileIndices.length;
	};

	const createTileState = (tileIndex) => {
		const bounds = tileBoundsForIndex(
			tileIndex,
			gridWidth,
			gridHeight,
			tileSize,
		);
		return {
			tileIndex,
			bounds,
			cellOffset: 0,
			cellCount: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
			cityOffset: 0,
			cities: cityIndex.byTile.get(tileIndex) || [],
			summary: createAggregate(),
		};
	};

	const activeFrontline = (cellIndex, cellX, cellY, controllerSide) => {
		if (controllerSide < 0) return false;
		if (cellX > 0) {
			const neighborSide = sideIndex(maps.dominantSideMap[cellIndex - 1]);
			if (sidesHostile(topology, controllerSide, neighborSide)) return true;
		}
		if (cellX + 1 < gridWidth) {
			const neighborSide = sideIndex(maps.dominantSideMap[cellIndex + 1]);
			if (sidesHostile(topology, controllerSide, neighborSide)) return true;
		}
		if (cellY > 0) {
			const neighborSide = sideIndex(
				maps.dominantSideMap[cellIndex - gridWidth],
			);
			if (sidesHostile(topology, controllerSide, neighborSide)) return true;
		}
		if (cellY + 1 < gridHeight) {
			const neighborSide = sideIndex(
				maps.dominantSideMap[cellIndex + gridWidth],
			);
			if (sidesHostile(topology, controllerSide, neighborSide)) return true;
		}
		return false;
	};

	const processCell = (summary, index, cellX, cellY) => {
		if (!isCountedLand(maps.landMask[index], index)) return;
		summary.landCells++;
		const ownerId = countryId(maps.worldControlMap[index]);
		const coreId = countryId(maps.deJureMap?.[index] ?? ownerId);
		const controllerSide = sideIndex(maps.dominantSideMap[index]);
		const ownerSide = topology.countryToSide.get(ownerId) ?? -1;
		const coreSide = topology.countryToSide.get(coreId) ?? -1;
		const creditedCountryId = countryId(
			maps.primaryOccupierMap?.[index] || ownerId,
		);
		const occupation = Number(maps.occupationMap?.[index] || 0);
		if (occupation > 0) summary.positiveOccupationCells++;
		else if (occupation < 0) summary.negativeOccupationCells++;

		const isFrontline = activeFrontline(index, cellX, cellY, controllerSide);
		if (controllerSide >= 0) {
			const controllerCounts = sideCounts(summary, controllerSide);
			controllerCounts.territory++;
			if (isFrontline) controllerCounts.frontline++;
		}
		if (ownerId > 0) {
			const ownerCounts = countryCounts(summary, ownerId);
			ownerCounts.owned++;
			if (ownerSide >= 0) sideCounts(summary, ownerSide).ownedTerritory++;
			if (controllerSide === ownerSide && ownerSide >= 0) {
				ownerCounts.controlled++;
				sideCounts(summary, ownerSide).homeTerritoryControlled++;
				if (isFrontline) ownerCounts.frontline++;
			}
		}
		if (creditedCountryId > 0) {
			countryCounts(summary, creditedCountryId).creditedTerritory++;
		}
		if (coreId > 0) {
			const coreCounts = countryCounts(summary, coreId);
			coreCounts.deJureTotal++;
			if (controllerSide >= 0) {
				increment(coreCounts.deJureControlBySide, controllerSide);
				sideCounts(summary, controllerSide).deJureCellsControlled++;
			}
			if (creditedCountryId > 0) {
				increment(coreCounts.deJureControlByCountry, creditedCountryId);
			}
			if (coreSide >= 0 && controllerSide === coreSide) {
				coreCounts.coreControlled++;
			}
		}
	};

	const processCity = (summary, city) => {
		const index = city.cellIndex;
		if (!isCountedLand(maps.landMask[index], index)) return;
		const ownerId = city.ownerCountryId;
		const ownerSide = topology.countryToSide.get(ownerId) ?? -1;
		const controllerSide = sideIndex(maps.dominantSideMap[index]);
		if (ownerId > 0) {
			const ownerCounts = countryCounts(summary, ownerId);
			ownerCounts.citiesTotal++;
			ownerCounts.cityPopulationTotal += city.population;
			if (city.isCapital) ownerCounts.capitalsTotal++;
			if (controllerSide >= 0) {
				increment(ownerCounts.cityControlBySide, controllerSide);
				increment(
					ownerCounts.cityPopulationBySide,
					controllerSide,
					city.population,
				);
				if (city.isCapital) {
					increment(ownerCounts.capitalControlBySide, controllerSide);
				}
			}
			if (ownerSide >= 0 && controllerSide === ownerSide) {
				ownerCounts.citiesControlled++;
				ownerCounts.cityPopulationControlled += city.population;
				if (city.isCapital) ownerCounts.capitalsHeld++;
			}
		}
		if (controllerSide >= 0) {
			const controllerCounts = sideCounts(summary, controllerSide);
			controllerCounts.citiesControlled++;
			controllerCounts.cityPopulationControlled += city.population;
			if (city.isCapital) controllerCounts.capitalsControlled++;
		}
	};

	const commitActiveGeneration = () => {
		const generation = activeGeneration;
		const nextAggregate = cloneAggregate(committedAggregate);
		const nextTiles = committedTiles.slice();
		for (const [tileIndex, nextSummary] of generation.changedSummaries) {
			applyTileSummary(nextAggregate, nextTiles[tileIndex], -1);
			applyTileSummary(nextAggregate, nextSummary, 1);
			nextTiles[tileIndex] = nextSummary;
		}
		const nextCommitSequence = commitSequence + 1;
		const nextSnapshot = buildSnapshot(nextAggregate, {
			generation: generation.generation,
			commitSequence: nextCommitSequence,
			topology,
			worldRevision,
			cityRevision,
			processedTiles: generation.tileIndices.length,
			processedItems: generation.processedItems,
			pendingDirtyTilesAtCommit: dirty.size(),
		});
		committedAggregate = nextAggregate;
		committedTiles = nextTiles;
		committedSnapshot = nextSnapshot;
		commitSequence = nextCommitSequence;
		activeGeneration = null;
		lastCommitError = null;
		if (onCommit) {
			try {
				onCommit(nextSnapshot);
			} catch (error) {
				lastCommitError = error;
			}
		}
		return nextSnapshot;
	};

	dirty.markAll();

	return {
		gridWidth,
		gridHeight,
		tileSize,
		totalTiles: dirty.totalTiles,
		/**
		 * Advance by an exact item count. The clock is never inspected.
		 * @param {number} [itemBudget]
		 */
		step(itemBudget = defaultItemBudget) {
			let budget = Math.max(0, integer(itemBudget, defaultItemBudget));
			let processedItems = 0;
			let committed = false;
			let publishedSnapshot = null;
			const generation = beginGeneration();
			if (!generation || budget === 0) {
				return {
					processedItems: 0,
					committed: false,
					discarded: false,
					generation: generation?.generation ?? null,
					remainingItems: generation
						? generation.totalItems - generation.processedItems
						: 0,
					dirtyTiles: dirty.size(),
					hasSnapshot: committedSnapshot !== null,
				};
			}

			while (budget > 0 && !committed) {
				while (
					budget > 0 &&
					generation.tileCursor < generation.tileIndices.length
				) {
					if (!generation.tileState) {
						generation.tileState = createTileState(
							generation.tileIndices[generation.tileCursor],
						);
					}
					const tile = generation.tileState;
					while (budget > 0 && tile.cellOffset < tile.cellCount) {
						const tileWidth = tile.bounds.maxX - tile.bounds.minX;
						const cellX = tile.bounds.minX + (tile.cellOffset % tileWidth);
						const cellY =
							tile.bounds.minY + Math.floor(tile.cellOffset / tileWidth);
						const index = cellY * gridWidth + cellX;
						processCell(tile.summary, index, cellX, cellY);
						tile.cellOffset++;
						generation.processedItems++;
						processedItems++;
						budget--;
					}
					while (budget > 0 && tile.cityOffset < tile.cities.length) {
						processCity(tile.summary, tile.cities[tile.cityOffset]);
						tile.cityOffset++;
						generation.processedItems++;
						processedItems++;
						budget--;
					}
					if (
						tile.cellOffset >= tile.cellCount &&
						tile.cityOffset >= tile.cities.length
					) {
						generation.changedSummaries.set(tile.tileIndex, tile.summary);
						generation.tileCursor++;
						generation.tileState = null;
					}
				}

				if (generation.tileCursor < generation.tileIndices.length) break;
				if (generation.startedMutationSequence !== mutationSequence) {
					// Revisit only tiles dirtied while this private generation was
					// scanning. Already stable summaries stay staged, so a busy front
					// cannot starve publication or force a whole-world rescan. Continue
					// immediately when this call still owns deterministic item budget.
					appendDirtyTail(generation);
					continue;
				}
				publishedSnapshot = commitActiveGeneration();
				committed = true;
			}
			return {
				processedItems,
				committed,
				discarded: false,
				generation: generation.generation,
				remainingItems: committed
					? 0
					: generation.totalItems - generation.processedItems,
				dirtyTiles: dirty.size(),
				hasSnapshot: committedSnapshot !== null,
				snapshot: publishedSnapshot,
				commitError: committed ? lastCommitError : null,
			};
		},
		/**
		 * Complete all currently dirty generations synchronously using fixed item
		 * chunks. Suitable for treaty/surrender/economy decision boundaries.
		 * @param {number} [itemBudget]
		 */
		flush(itemBudget = defaultItemBudget) {
			const budget = positiveInteger(itemBudget, defaultItemBudget);
			let processedItems = 0;
			let committedGenerations = 0;
			while (activeGeneration || dirty.size() > 0) {
				const result = this.step(budget);
				processedItems += result.processedItems;
				if (result.committed) committedGenerations++;
				if (result.processedItems === 0 && !result.committed) {
					throw new Error(
						"Territory ledger flush made no deterministic progress.",
					);
				}
			}
			return {
				processedItems,
				committedGenerations,
				snapshot: committedSnapshot,
			};
		},
		/** Mark a controller change and every neighboring tile it can affect. */
		markControllerChange(cellIndex) {
			const added = dirty.markCell(cellIndex, true);
			if (added > 0) mutationSequence++;
			return added;
		},
		/** Mark arbitrary owner/de-jure/land/controller cell mutations. */
		markCellsChanged(cellIndices, includeNeighborTiles = true) {
			let added = 0;
			for (const index of cellIndices || []) {
				added += dirty.markCell(index, includeNeighborTiles);
			}
			if (added > 0) mutationSequence++;
			return added;
		},
		markAllDirty() {
			const added = dirty.markAll();
			if (added > 0) mutationSequence++;
			return added;
		},
		/**
		 * Replace coalition mapping or hostilities. A changed signature invalidates
		 * all tile summaries because controlled/core/frontline meaning changed.
		 */
		setSideTopology(nextOptions = {}) {
			const next = createTopology({
				countryToSide: nextOptions.countryToSide,
				sideUids: nextOptions.sideUids,
				hostilityMatrix: nextOptions.hostilityMatrix,
				hostileSidePairs: nextOptions.hostileSidePairs,
				maxSides: nextOptions.maxSides,
				revision:
					nextOptions.revision ??
					nextOptions.topologyRevision ??
					topology.revision,
			});
			if (next.signature === topology.signature) return false;
			topology = next;
			resetCommittedState();
			return true;
		},
		/** Replace world-array references and begin a new atomic world generation. */
		replaceMaps(nextMaps, nextWorldRevision = worldRevision) {
			maps = validateMaps(nextMaps, totalCells);
			worldRevision = nextWorldRevision;
			resetCommittedState();
			return true;
		},
		/** Replace optional point aggregates and begin a new atomic generation. */
		setCities(nextCities, nextOptions = {}) {
			const nextGetCityCellIndex =
				nextOptions.getCityCellIndex ?? getCityCellIndex;
			const nextCityRevision = nextOptions.revision ?? cityRevision + 1;
			const nextCityIndex = normalizeCities(
				nextCities || [],
				nextGetCityCellIndex,
				totalCells,
				gridWidth,
				tileSize,
			);
			getCityCellIndex = nextGetCityCellIndex;
			cityRevision = nextCityRevision;
			cityIndex = nextCityIndex;
			resetCommittedState();
			return true;
		},
		/** Return the last complete generation, or null while the first builds. */
		getSnapshot() {
			return committedSnapshot;
		},
		getStatus() {
			return Object.freeze({
				hasSnapshot: committedSnapshot !== null,
				commitSequence,
				activeGeneration: activeGeneration?.generation ?? null,
				activeProcessedItems: activeGeneration?.processedItems ?? 0,
				activeTotalItems: activeGeneration?.totalItems ?? 0,
				dirtyTiles: dirty.size(),
				dirtyTileIndices: Object.freeze(dirty.peek()),
				mutationSequence,
				topologyRevision: topology.revision,
				worldRevision,
				cityRevision,
				indexedCities: cityIndex.total,
				lastCommitError,
			});
		},
	};
}

/** @param {TerritoryLedgerSnapshot|null|undefined} snapshot */
export function getCountryLedger(snapshot, id) {
	return snapshot?.countryById?.[countryId(id)] || null;
}

/** @param {TerritoryLedgerSnapshot|null|undefined} snapshot */
export function getSideLedger(snapshot, index) {
	return snapshot?.sideByIndex?.[sideIndex(index)] || null;
}

/**
 * Exact de-jure control count for occupation, rebellion, and core-control rules.
 * @param {TerritoryLedgerSnapshot|null|undefined} snapshot
 * @param {number} deJureCountryId
 * @param {number} controllerSideIndex
 */
export function getDeJureControlBySide(
	snapshot,
	deJureCountryId,
	controllerSideIndex,
) {
	const country = getCountryLedger(snapshot, deJureCountryId);
	return country?.deJureControlBySide?.[sideIndex(controllerSideIndex)] || 0;
}

/**
 * Exact credited-country control count for annexer migration and peace cleanup.
 * @param {TerritoryLedgerSnapshot|null|undefined} snapshot
 * @param {number} deJureCountryId
 * @param {number} controllerCountryId
 */
export function getDeJureControlByCountry(
	snapshot,
	deJureCountryId,
	controllerCountryId,
) {
	const country = getCountryLedger(snapshot, deJureCountryId);
	return country?.deJureControlByCountry?.[countryId(controllerCountryId)] || 0;
}

/**
 * Derive the economy/rebellion view for one occupied country without rescanning
 * the world grid.
 * @param {TerritoryLedgerSnapshot|null|undefined} snapshot
 * @param {number} victimCountryId
 * @param {number} annexerCountryId
 * @param {number} annexerSideIndex
 */
export function selectOccupationControl(
	snapshot,
	victimCountryId,
	annexerCountryId,
	annexerSideIndex,
) {
	const victim = getCountryLedger(snapshot, victimCountryId);
	const total = victim?.deJureTotal || 0;
	const heldByAnnexerSide = getDeJureControlBySide(
		snapshot,
		victimCountryId,
		annexerSideIndex,
	);
	const heldByAnnexerCountry = getDeJureControlByCountry(
		snapshot,
		victimCountryId,
		annexerCountryId,
	);
	return Object.freeze({
		victimCountryId: countryId(victimCountryId),
		annexerCountryId: countryId(annexerCountryId),
		annexerSideIndex: sideIndex(annexerSideIndex),
		total,
		heldByAnnexerSide,
		heldByAnnexerCountry,
		heldRatio: total > 0 ? Math.min(1, heldByAnnexerSide / total) : 0,
	});
}
