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
	if (value instanceof Date) return new Date(value.getTime());
	if (ArrayBuffer.isView(value)) return value.slice();
	if (value instanceof Map) {
		const result = new Map();
		seen.set(value, result);
		for (const [key, item] of value)
			result.set(key, cloneSimulationData(item, seen));
		return result;
	}
	if (value instanceof Set) return new Set(value);
	const result = Array.isArray(value) ? [] : {};
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
export function unpackPresentationUnits(packed, previous = []) {
	const byId = new Map(previous.map((unit) => [unit.id, unit]));
	const result = new Array(packed.flags.length);
	for (let index = 0; index < result.length; index++) {
		const unit = byId.get(packed.numbers[index * unitFields.length]) || {
			kind: "army",
		};
		for (let column = 0; column < unitFields.length; column++) {
			const value = packed.numbers[index * unitFields.length + column];
			if (Number.isNaN(value)) delete unit[unitFields[column]];
			else unit[unitFields[column]] = value;
		}
		unit.isAlpenjager = !!(packed.flags[index] & 1);
		unit.isAtSea = !!(packed.flags[index] & 2);
		result[index] = unit;
	}
	return result;
}
export function createControlDeltaTracker(state) {
	const dirty = new Set();
	let all = false;
	const columns = Math.ceil(state.gridWidth / CONTROL_TILE_SIZE);
	return {
		markCell(index) {
			dirty.add(
				Math.floor(index / state.gridWidth / CONTROL_TILE_SIZE) * columns +
					Math.floor((index % state.gridWidth) / CONTROL_TILE_SIZE),
			);
		},
		markAll() {
			all = true;
		},
		take() {
			if (all) {
				for (
					let key = 0;
					key < columns * Math.ceil(state.gridHeight / CONTROL_TILE_SIZE);
					key++
				)
					dirty.add(key);
				all = false;
			}
			const tiles = Array.from(dirty, (key) => {
				const x = (key % columns) * CONTROL_TILE_SIZE,
					y = Math.floor(key / columns) * CONTROL_TILE_SIZE;
				const width = Math.min(CONTROL_TILE_SIZE, state.gridWidth - x),
					height = Math.min(CONTROL_TILE_SIZE, state.gridHeight - y);
				const tile = { key, x, y, width, height };
				for (const field of CONTROL_MAP_FIELDS) {
					const map = state[field];
					if (!map) continue;
					const values = new map.constructor(width * height);
					for (let row = 0; row < height; row++)
						values.set(
							map.subarray(
								(y + row) * state.gridWidth + x,
								(y + row) * state.gridWidth + x + width,
							),
							row * width,
						);
					tile[field] = values;
				}
				return tile;
			});
			dirty.clear();
			return tiles;
		},
	};
}
export function applyControlDeltas(runtime, tiles) {
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
		tiles.map((tile) => tile.key),
		CONTROL_TILE_SIZE,
	);
}
export function collectTransferBuffers(
	value,
	buffers = new Set(),
	seen = new Set(),
) {
	if (value && typeof value === "object") {
		if (seen.has(value)) return Array.from(buffers);
		seen.add(value);
	}
	if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
	else if (value && typeof value === "object") {
		for (const item of value instanceof Map
			? value.values()
			: Object.values(value))
			collectTransferBuffers(item, buffers, seen);
	}
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
export function createPresentationSnapshot(
	state,
	tracker,
	{ includeTopology = false } = {},
) {
	const values = {};
	const seen = new Map();
	for (const key of snapshotKeys)
		values[key] = cloneSimulationData(state[key], seen);
	if (includeTopology) {
		for (const key of [
			"countryMetadata",
			"cities",
			"activeTheaterCities",
			"sideUids",
			"hostilityMatrix",
			"hostileSidePairs",
		])
			values[key] = cloneSimulationData(state[key], seen);
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
