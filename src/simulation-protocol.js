import { toDenseInfluenceMap } from "./influence-grid.js";
import {
	createSimulationMetrics,
	PERF_COUNTER_DEFAULTS,
} from "./simulation-metrics.js";
import { createSimulationState } from "./simulation-state.js";

export const SIMULATION_PROTOCOL_VERSION = 1;
export const CONTROL_TILE_SIZE = 32;
export const CONTROL_MAP_FIELDS = [
	"worldControlMap",
	"dominantSideMap",
	"occupationMap",
	"primaryOccupierMap",
	"landMask",
	"provinceMap",
];
const omittedState = new Set([
	"_simulationJobs",
	"_territoryLedger",
	"_tacticalGrid",
	"unitSpatialHash",
	"unitHashBySide",
	"_battleHash",
	"_frameSimulationCommitFlags",
	"frontlineDirLat",
	"frontlineDirLng",
]);
const stateKeys = Object.keys(createSimulationState()).filter(
	(key) => !omittedState.has(key),
);
stateKeys.push("isPaused", "initialCombatants", "initialOwnerMap", "perf");
const assetKeys = new Set([
	"feature",
	"flag",
	"tempFlag",
	"allianceFlagTempFlag",
	"flagUrl",
	"baseFlagUrl",
	"rawGeoJsonData",
	"_cachedTarget",
	"_cachedEnemyTarget",
]);

/** Only data crosses the boundary; country flag images and geometry stay in the UI. */
export function cloneSimulationData(value, seen = new Map()) {
	if (value === null || typeof value !== "object")
		return typeof value === "function" ? undefined : value;
	if (seen.has(value)) return seen.get(value);
	if (value instanceof Date) {
		const result = new Date(value.getTime());
		seen.set(value, result);
		return result;
	}
	if (ArrayBuffer.isView(value)) {
		const buffer = cloneSimulationData(value.buffer, seen);
		const result =
			value instanceof DataView
				? new DataView(buffer, value.byteOffset, value.byteLength)
				: new value.constructor(buffer, value.byteOffset, value.length);
		seen.set(value, result);
		return result;
	}
	if (
		value instanceof ArrayBuffer ||
		(typeof SharedArrayBuffer !== "undefined" &&
			value instanceof SharedArrayBuffer)
	) {
		const result = value.slice(0);
		seen.set(value, result);
		return result;
	}
	if (value instanceof Map) {
		const result = new Map();
		seen.set(value, result);
		for (const [key, item] of value)
			result.set(
				cloneSimulationData(key, seen),
				cloneSimulationData(item, seen),
			);
		return result;
	}
	if (value instanceof Set) {
		const result = new Set();
		seen.set(value, result);
		for (const item of value) result.add(cloneSimulationData(item, seen));
		return result;
	}
	const result = Array.isArray(value) ? new Array(value.length) : {};
	seen.set(value, result);
	for (const key of Object.keys(value)) {
		if (assetKeys.has(key)) continue;
		const item = cloneSimulationData(value[key], seen);
		if (item !== undefined) result[key] = item;
	}
	return result;
}

export function captureSimulationState(
	runtime,
	{ denseInfluence = false } = {},
) {
	const result = {};
	const seen = new Map();
	for (const key of stateKeys) {
		const value = runtime[key];
		if (value === undefined || typeof value === "function") continue;
		if (key === "perf") {
			const perf = createSimulationMetrics(value._mode);
			for (const name of Object.keys(PERF_COUNTER_DEFAULTS))
				if (typeof value[name] === "number") perf[name] = value[name];
			result[key] = perf;
			continue;
		}
		result[key] =
			key === "sideInfluenceMaps" && denseInfluence
				? value.map((map) => {
						const dense = toDenseInfluenceMap(map);
						return dense === map ? dense.slice() : dense;
					})
				: cloneSimulationData(value, seen);
	}
	return result;
}

export function applySimulationState(
	runtime,
	incoming,
	{ preserveCountryControls = false } = {},
) {
	for (const [key, value] of Object.entries(incoming)) {
		if (
			key === "gameState" &&
			value === "SIMULATING" &&
			runtime.gameState?.startsWith("PEACE_SELECT_")
		)
			continue;
		if (key === "CONFIG") {
			Object.assign(runtime.CONFIG, value);
			continue;
		}
		if (key === "perf") continue;
		if (key === "sides" || key === "countryMetadata") {
			const oldCountries = new Map(
				(key === "sides" ? runtime.sides.flat() : runtime.countryMetadata)
					.filter(Boolean)
					.map((c) => [c.id, c]),
			);
			const merge = (country) => {
				if (!country) return country;
				const old = oldCountries.get(country.id) || {};
				const controls = {};
				if (preserveCountryControls)
					for (const field of [
						"name",
						"role",
						"strategy",
						"buffState",
						"hiddenBuffState",
						"color",
					])
						if (Object.hasOwn(old, field)) controls[field] = old[field];
				return Object.assign(old, country, controls);
			};
			const merged =
				key === "sides"
					? value.map((side) => side.map(merge))
					: value.map(merge);
			if (Object.getOwnPropertyDescriptor(runtime, key)?.set)
				runtime[key] = merged;
			else runtime[key].splice(0, runtime[key].length, ...merged);
			continue;
		}
		const descriptor = Object.getOwnPropertyDescriptor(runtime, key);
		if (descriptor?.set) runtime[key] = value;
		else if (
			ArrayBuffer.isView(runtime[key]) &&
			ArrayBuffer.isView(value) &&
			runtime[key].length === value.length
		)
			runtime[key].set(value);
		else if (runtime[key] instanceof Map && value instanceof Map) {
			const target = runtime[key];
			if (target === value) continue;
			target.clear();
			for (const [entryKey, entryValue] of value)
				target.set(entryKey, entryValue);
		} else if (runtime[key] instanceof Set && value instanceof Set) {
			const target = runtime[key];
			if (target === value) continue;
			target.clear();
			for (const item of value) target.add(item);
		} else if (Array.isArray(runtime[key]) && Array.isArray(value)) {
			const target = runtime[key];
			if (target === value) continue;
			target.length = value.length;
			for (let index = 0; index < value.length; index++)
				target[index] = value[index];
		}
	}
}

const unitFields = [
	"id",
	"lat",
	"lng",
	"sideIndex",
	"sovereignId",
	"beneficiaryId",
	"health",
	"maxHealth",
	"personnel",
	"personnelCapacity",
	"strengthMultiplier",
	"encircledTicks",
	"mountainIntensity",
	"victoryBoostTicks",
	"deployTicks",
	"lastCombatTick",
];
export function packPresentationUnits(units) {
	const numbers = new Float64Array(units.length * unitFields.length);
	const flags = new Uint8Array(units.length);
	units.forEach((unit, index) => {
		unitFields.forEach((key, column) => {
			numbers[index * unitFields.length + column] = unit[key] ?? NaN;
		});
		flags[index] =
			(unit.isAlpenjager ? 1 : 0) | (unit.isAtSea || unit._isAtSea ? 2 : 0);
	});
	return { numbers, flags };
}

/** A bounded owner for the stable unit lookup and result array used by snapshots. */
export function createPresentationUnitCache(previous = []) {
	return {
		byId: new Map(previous.map((unit) => [unit.id, { unit, generation: 0 }])),
		generation: 0,
		result: previous,
	};
}

export function resetPresentationUnitCache(cache, units = []) {
	cache.byId.clear();
	cache.generation = 0;
	for (const unit of units)
		cache.byId.set(unit.id, { unit, generation: cache.generation });
	cache.result = units;
}

export function unpackPresentationUnits(packed, previous = [], cache = null) {
	const persistent =
		cache && cache.byId instanceof Map && Array.isArray(cache.result);
	let generation = 0;
	if (persistent) {
		cache.generation =
			(Number.isSafeInteger(cache.generation) ? cache.generation : 0) + 1;
		generation = cache.generation;
	}
	const byId = persistent
		? cache.byId
		: new Map(previous.map((unit) => [unit.id, unit]));
	if (persistent && byId.size === 0 && previous.length)
		for (const unit of previous) byId.set(unit.id, { unit, generation });
	const result = persistent ? cache.result : new Array(packed.flags.length);
	result.length = packed.flags.length;
	for (let index = 0; index < result.length; index++) {
		const id = packed.numbers[index * unitFields.length];
		let record = persistent ? byId.get(id) : null;
		let unit = persistent ? record?.unit : byId.get(id);
		if (!unit) {
			unit = { kind: "army" };
			if (persistent) {
				record = { unit, generation };
				byId.set(id, record);
			} else byId.set(id, unit);
		}
		if (persistent) record.generation = generation;
		for (let column = 0; column < unitFields.length; column++) {
			const value = packed.numbers[index * unitFields.length + column];
			if (Number.isNaN(value)) delete unit[unitFields[column]];
			else unit[unitFields[column]] = value;
		}
		unit.isAlpenjager = !!(packed.flags[index] & 1);
		unit.isAtSea = !!(packed.flags[index] & 2);
		result[index] = unit;
	}
	if (persistent && byId.size > result.length)
		for (const [id, record] of byId)
			if (record.generation !== generation) byId.delete(id);
	return result;
}

function createUint32MapView(map) {
	if (
		!ArrayBuffer.isView(map) ||
		map instanceof DataView ||
		map.byteOffset % Uint32Array.BYTES_PER_ELEMENT !== 0 ||
		map.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0
	)
		return null;
	return new Uint32Array(
		map.buffer,
		map.byteOffset,
		map.byteLength / Uint32Array.BYTES_PER_ELEMENT,
	);
}

function createUint8MapView(map) {
	if (!ArrayBuffer.isView(map) || map instanceof DataView) return null;
	return new Uint8Array(map.buffer, map.byteOffset, map.byteLength);
}

export function createControlDeltaTracker(state) {
	const dirty = new Set();
	let all = false;
	const columns = Math.ceil(state.gridWidth / CONTROL_TILE_SIZE);
	const rows = Math.ceil(state.gridHeight / CONTROL_TILE_SIZE);
	const previousMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [field, state[field]?.slice() || null]),
	);
	const sourceMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [field, state[field] || null]),
	);
	const previousWordMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [
			field,
			createUint32MapView(previousMaps[field]),
		]),
	);
	const previousByteMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [
			field,
			createUint8MapView(previousMaps[field]),
		]),
	);
	const sourceWordMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [
			field,
			createUint32MapView(state[field]),
		]),
	);
	const sourceByteMaps = Object.fromEntries(
		CONTROL_MAP_FIELDS.map((field) => [
			field,
			createUint8MapView(state[field]),
		]),
	);
	return {
		markCell(index) {
			if (
				!Number.isInteger(index) ||
				index < 0 ||
				index >= state.gridWidth * state.gridHeight
			)
				return;
			dirty.add(
				Math.floor(index / state.gridWidth / CONTROL_TILE_SIZE) * columns +
					Math.floor((index % state.gridWidth) / CONTROL_TILE_SIZE),
			);
		},
		markAll() {
			all = true;
		},
		take() {
			const forceAllFields = all;
			const forceFields = new Set();
			for (const field of CONTROL_MAP_FIELDS) {
				const map = state[field];
				const cached = previousMaps[field];
				if (
					map &&
					(map !== sourceMaps[field] ||
						!cached ||
						cached.length !== map.length ||
						cached.constructor !== map.constructor)
				) {
					forceFields.add(field);
					sourceMaps[field] = map;
					sourceWordMaps[field] = createUint32MapView(map);
					sourceByteMaps[field] = createUint8MapView(map);
				}
			}
			for (const field of forceFields) {
				previousMaps[field] = state[field].slice();
				previousWordMaps[field] = createUint32MapView(previousMaps[field]);
				previousByteMaps[field] = createUint8MapView(previousMaps[field]);
			}
			if (all) {
				for (let key = 0; key < columns * rows; key++) dirty.add(key);
				all = false;
			}
			if (forceFields.size)
				for (let key = 0; key < columns * rows; key++) dirty.add(key);
			const tiles = Array.from(dirty, (key) => {
				const x = (key % columns) * CONTROL_TILE_SIZE,
					y = Math.floor(key / columns) * CONTROL_TILE_SIZE;
				const width = Math.min(CONTROL_TILE_SIZE, state.gridWidth - x),
					height = Math.min(CONTROL_TILE_SIZE, state.gridHeight - y);
				const tile = { key, x, y, width, height };
				for (const field of CONTROL_MAP_FIELDS) {
					const map = state[field];
					if (!map) continue;
					const cached = previousMaps[field];
					let changed = forceAllFields || forceFields.has(field);
					if (!changed) {
						const sourceWords = sourceWordMaps[field];
						const cachedWords = previousWordMaps[field];
						const sourceBytes = sourceByteMaps[field];
						const cachedBytes = previousByteMaps[field];
						const bytesPerElement = map.BYTES_PER_ELEMENT;
						const rowBytes = width * bytesPerElement;
						const rowStrideBytes = state.gridWidth * bytesPerElement;
						const firstRowBytes = (y * state.gridWidth + x) * bytesPerElement;
						const wordAligned =
							sourceWords &&
							cachedWords &&
							rowBytes % Uint32Array.BYTES_PER_ELEMENT === 0 &&
							rowStrideBytes % Uint32Array.BYTES_PER_ELEMENT === 0 &&
							firstRowBytes % Uint32Array.BYTES_PER_ELEMENT === 0;
						if (wordAligned) {
							const wordsPerRow = rowBytes / Uint32Array.BYTES_PER_ELEMENT;
							for (let row = 0; row < height && !changed; row++) {
								const offset =
									(firstRowBytes + row * rowStrideBytes) /
									Uint32Array.BYTES_PER_ELEMENT;
								for (let word = 0; word < wordsPerRow; word++)
									if (
										sourceWords[offset + word] !== cachedWords[offset + word]
									) {
										changed = true;
										break;
									}
							}
						} else if (sourceBytes && cachedBytes) {
							for (let row = 0; row < height && !changed; row++) {
								const offset = firstRowBytes + row * rowStrideBytes;
								for (let byte = 0; byte < rowBytes; byte++)
									if (
										sourceBytes[offset + byte] !== cachedBytes[offset + byte]
									) {
										changed = true;
										break;
									}
							}
						} else {
							for (let row = 0; row < height && !changed; row++) {
								const sourceOffset = (y + row) * state.gridWidth + x;
								for (let column = 0; column < width; column++)
									if (
										!Object.is(
											map[sourceOffset + column],
											cached[sourceOffset + column],
										)
									) {
										changed = true;
										break;
									}
							}
						}
					}
					if (!changed) continue;
					const values = new map.constructor(width * height);
					const sourceWords = sourceWordMaps[field];
					const cachedWords = previousWordMaps[field];
					const sourceBytes = sourceByteMaps[field];
					const cachedBytes = previousByteMaps[field];
					const valueBytes = createUint8MapView(values);
					const valueWords = createUint32MapView(values);
					const bytesPerElement = map.BYTES_PER_ELEMENT;
					const rowBytes = width * bytesPerElement;
					const rowStrideBytes = state.gridWidth * bytesPerElement;
					const firstRowBytes = (y * state.gridWidth + x) * bytesPerElement;
					const wordAligned =
						sourceWords &&
						cachedWords &&
						valueWords &&
						rowBytes % Uint32Array.BYTES_PER_ELEMENT === 0 &&
						rowStrideBytes % Uint32Array.BYTES_PER_ELEMENT === 0 &&
						firstRowBytes % Uint32Array.BYTES_PER_ELEMENT === 0;
					if (wordAligned) {
						const wordsPerRow = rowBytes / Uint32Array.BYTES_PER_ELEMENT;
						for (let row = 0; row < height; row++) {
							const sourceOffset =
								(firstRowBytes + row * rowStrideBytes) /
								Uint32Array.BYTES_PER_ELEMENT;
							const valueOffset =
								(row * rowBytes) / Uint32Array.BYTES_PER_ELEMENT;
							for (let word = 0; word < wordsPerRow; word++) {
								const value = sourceWords[sourceOffset + word];
								valueWords[valueOffset + word] = value;
								cachedWords[sourceOffset + word] = value;
							}
						}
					} else if (sourceBytes && cachedBytes && valueBytes) {
						for (let row = 0; row < height; row++) {
							const sourceOffset = firstRowBytes + row * rowStrideBytes;
							const valueOffset = row * rowBytes;
							for (let byte = 0; byte < rowBytes; byte++) {
								const value = sourceBytes[sourceOffset + byte];
								valueBytes[valueOffset + byte] = value;
								cachedBytes[sourceOffset + byte] = value;
							}
						}
					} else {
						for (let row = 0; row < height; row++) {
							const sourceOffset = (y + row) * state.gridWidth + x;
							const valueOffset = row * width;
							for (let column = 0; column < width; column++) {
								const value = map[sourceOffset + column];
								values[valueOffset + column] = value;
								cached[sourceOffset + column] = value;
							}
						}
					}
					tile[field] = values;
				}
				return tile;
			});
			dirty.clear();
			return tiles.filter((tile) =>
				CONTROL_MAP_FIELDS.some((field) => Object.hasOwn(tile, field)),
			);
		},
	};
}
export function applyControlDeltas(runtime, tiles) {
	const tileKeys = tiles.map((tile) => tile.key);
	const politicalTileKeys = new Set();
	const regionTileKeys = new Set();
	const geometryFields = [
		"worldControlMap",
		"landMask",
		"dominantSideMap",
		"primaryOccupierMap",
	];
	for (const tile of tiles)
		for (const field of geometryFields) {
			const values = tile[field];
			const map = runtime[field];
			if (!values || !map) continue;
			let changed = false;
			for (let row = 0; row < tile.height && !changed; row++) {
				const sourceOffset = row * tile.width;
				const mapOffset = (tile.y + row) * runtime.gridWidth + tile.x;
				for (let column = 0; column < tile.width; column++)
					if (
						!Object.is(map[mapOffset + column], values[sourceOffset + column])
					) {
						changed = true;
						break;
					}
			}
			if (changed) {
				politicalTileKeys.add(tile.key);
				regionTileKeys.add(tile.key);
			}
		}
	for (const tile of tiles)
		for (const field of CONTROL_MAP_FIELDS) {
			const values = tile[field],
				map = runtime[field];
			if (!values || !map) continue;
			for (let row = 0; row < tile.height; row++)
				map.set(
					values.subarray(row * tile.width, (row + 1) * tile.width),
					(tile.y + row) * runtime.gridWidth + tile.x,
				);
		}
	runtime.influenceLayer?.notifyControlTilesChanged(
		tileKeys,
		CONTROL_TILE_SIZE,
		{
			politicalTileKeys: Array.from(politicalTileKeys),
			regionTileKeys: Array.from(regionTileKeys),
		},
	);
}
export function collectTransferBuffers(
	value,
	buffers = new Set(),
	seen = new Set(),
) {
	const visit = (item) => {
		if (!item || typeof item !== "object" || seen.has(item)) return;
		seen.add(item);
		if (ArrayBuffer.isView(item)) {
			if (item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
			return;
		}
		if (item instanceof ArrayBuffer) {
			buffers.add(item);
			return;
		}
		if (item instanceof Map) {
			for (const [key, entry] of item) {
				visit(key);
				visit(entry);
			}
			return;
		}
		if (item instanceof Set) {
			for (const entry of item) visit(entry);
			return;
		}
		for (const entry of Object.values(item)) visit(entry);
	};
	visit(value);
	return Array.from(buffers);
}
const snapshotKeys = [
	"gameState",
	"_simTickCount",
	"simFrameCount",
	"soldiersPerUnit",
	"sideSoldiers",
	"sideRecruitableManpower",
	"initialSideSoldiers",
	"sideCasualties",
	"countryCasualties",
	"casualtyByAttacker",
	"latestCountryStats",
	"_cachedSideUnitCounts",
	"_cachedSideSoldierEsts",
	"_cachedSideTerritoryCounts",
	"_cachedSideTerritoryPcts",
	"_cachedP1T",
	"_cachedP2T",
	"_territoryLedgerSnapshot",
	"_sideWarPhase",
	"_sidePosture",
	"aiCountryState",
	"_frontlinePolys",
	"_warPlan",
	"_navalPlan",
	"_navalSupplyPlan",
	"_transportPlan",
	"_coastalDefensePlan",
	"_neutralGarrisonPlan",
	"_aiDebugPlans",
	"_aiTaskForcesBySide",
	"activeBattles",
	"bombs",
	"explosions",
	"gameTimeDate",
	"gameTimeEnabled",
	"gameTimeAccumulatorMs",
	"lastTreatyTime",
	"capitalLostCountries",
	"sides",
];
const PRESENTATION_HOT_CHANGE_THRESHOLD = 2;
const PRESENTATION_HOT_RECHECK_INTERVAL = 30;

/** Keeps one detached-safe baseline per known presentation field. */
export function createPresentationSnapshotCache() {
	return { values: new Map() };
}

function presentationValueEqual(left, right, pairs = new Map()) {
	if (left === right) return true;
	if (typeof left === "function") return right === undefined;
	if (typeof right === "function") return left === undefined;
	if (
		left === null ||
		right === null ||
		typeof left !== "object" ||
		typeof right !== "object"
	)
		return Object.is(left, right);
	if (left.constructor !== right.constructor) return false;
	let reversePairs = pairs.reverse;
	if (!reversePairs) {
		reversePairs = new Map();
		pairs.reverse = reversePairs;
	}
	if (pairs.has(left)) return pairs.get(left) === right;
	if (reversePairs.has(right)) return reversePairs.get(right) === left;
	pairs.set(left, right);
	reversePairs.set(right, left);
	if (left instanceof Date) return left.getTime() === right.getTime();
	if (ArrayBuffer.isView(left)) {
		if (left.byteLength !== right.byteLength) return false;
		const leftBytes = new Uint8Array(
			left.buffer,
			left.byteOffset,
			left.byteLength,
		);
		const rightBytes = new Uint8Array(
			right.buffer,
			right.byteOffset,
			right.byteLength,
		);
		for (let index = 0; index < leftBytes.length; index++)
			if (leftBytes[index] !== rightBytes[index]) return false;
		return true;
	}
	if (left instanceof ArrayBuffer) {
		if (left.byteLength !== right.byteLength) return false;
		const leftBytes = new Uint8Array(left);
		const rightBytes = new Uint8Array(right);
		for (let index = 0; index < leftBytes.length; index++)
			if (leftBytes[index] !== rightBytes[index]) return false;
		return true;
	}
	if (
		typeof SharedArrayBuffer !== "undefined" &&
		left instanceof SharedArrayBuffer
	) {
		if (left.byteLength !== right.byteLength) return false;
		const leftBytes = new Uint8Array(left);
		const rightBytes = new Uint8Array(right);
		for (let index = 0; index < leftBytes.length; index++)
			if (leftBytes[index] !== rightBytes[index]) return false;
		return true;
	}
	if (left instanceof Map) {
		if (left.size !== right.size) return false;
		const leftEntries = left.entries();
		const rightEntries = right.entries();
		while (true) {
			const leftEntry = leftEntries.next();
			const rightEntry = rightEntries.next();
			if (leftEntry.done || rightEntry.done)
				return leftEntry.done === rightEntry.done;
			if (
				!presentationValueEqual(
					leftEntry.value[0],
					rightEntry.value[0],
					pairs,
				) ||
				!presentationValueEqual(leftEntry.value[1], rightEntry.value[1], pairs)
			)
				return false;
		}
	}
	if (left instanceof Set) {
		if (left.size !== right.size) return false;
		const leftValues = left.values();
		const rightValues = right.values();
		while (true) {
			const leftValue = leftValues.next();
			const rightValue = rightValues.next();
			if (leftValue.done || rightValue.done)
				return leftValue.done === rightValue.done;
			if (!presentationValueEqual(leftValue.value, rightValue.value, pairs))
				return false;
		}
	}
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	if (Array.isArray(left) && left.length !== right.length) return false;
	let comparedKeys = 0;
	for (const key of Object.keys(left)) {
		if (assetKeys.has(key)) continue;
		const value = left[key];
		if (value === undefined || typeof value === "function") continue;
		if (
			!Object.hasOwn(right, key) ||
			!presentationValueEqual(value, right[key], pairs)
		)
			return false;
		comparedKeys++;
	}
	return comparedKeys === Object.keys(right).length;
}

export function createPresentationSnapshot(
	state,
	tracker,
	{
		includeTopology = false,
		cache = null,
		// Worker values share their owned cache clone; transfer only units and tiles.
		reuseBaselineForWorker = false,
	} = {},
) {
	const values = {};
	const valueCache = cache?.values instanceof Map ? cache.values : null;
	const wireSeen = new Map();
	const baselineSeen = new Map();
	const publishBaseline = (key, baseline) => {
		values[key] = reuseBaselineForWorker
			? baseline
			: cloneSimulationData(state[key], wireSeen);
	};
	const publishValue = (key) => {
		const value = state[key];
		if (!valueCache) {
			values[key] = cloneSimulationData(value, wireSeen);
			return;
		}
		const previous = valueCache.get(key);
		if (previous?.kind === "hot") {
			previous.snapshotsSinceCheck++;
			if (previous.snapshotsSinceCheck >= PRESENTATION_HOT_RECHECK_INTERVAL) {
				previous.snapshotsSinceCheck = 0;
				if (presentationValueEqual(value, previous.value)) {
					valueCache.set(key, {
						kind: "deep",
						value: previous.value,
						consecutiveChanges: 0,
					});
					return;
				}
			}
			const baseline = cloneSimulationData(value, baselineSeen);
			previous.value = baseline;
			publishBaseline(key, baseline);
			return;
		}
		if (previous && presentationValueEqual(value, previous.value)) {
			previous.consecutiveChanges = 0;
			return;
		}
		const consecutiveChanges = previous
			? (previous.consecutiveChanges || 0) + 1
			: 0;
		const baseline = cloneSimulationData(value, baselineSeen);
		valueCache.set(
			key,
			consecutiveChanges >= PRESENTATION_HOT_CHANGE_THRESHOLD
				? {
						kind: "hot",
						value: baseline,
						snapshotsSinceCheck: 0,
					}
				: { kind: "deep", value: baseline, consecutiveChanges },
		);
		publishBaseline(key, baseline);
	};
	for (const key of snapshotKeys) publishValue(key);
	if (includeTopology) {
		for (const key of [
			"countryMetadata",
			"cities",
			"activeTheaterCities",
			"sideUids",
			"hostilityMatrix",
			"hostileSidePairs",
		])
			publishValue(key);
	}
	const metrics = {
		controlGeneration: state._perfControlGeneration || 0,
		workerTickMs: state.workerTickMs || 0,
	};
	const keys =
		state.perf._mode === "off"
			? ["ticks", "tickTotal", "maxTick"]
			: Object.keys(PERF_COUNTER_DEFAULTS).filter(
					(key) =>
						typeof state.perf[key] === "number" && !key.startsWith("render"),
				);
	for (const key of keys) metrics[key] = state.perf[key];
	const history = [];
	if (state.perf._mode !== "off")
		for (let i = state.perf._history.length - 1; i >= 0; i--) {
			const entry = state.perf._history[i];
			if (entry.tick <= (state._lastPerfSnapshotTick || 0)) break;
			history.push(entry);
		}
	state._lastPerfSnapshotTick = state.perf.ticks;
	metrics.history = history.reverse();
	return {
		values,
		units: packPresentationUnits(state.units),
		tiles: tracker.take(),
		metrics,
	};
}
