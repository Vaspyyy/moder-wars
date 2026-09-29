import { toDenseInfluenceMap } from "./influence-grid.js";
import { hasSavedCells, normalizeSavedCells } from "./saved-cells.js";

const GRID_FIELDS = [
	"worldControlMap",
	"deJureMap",
	"landMask",
	"provinceMap",
	"occupationMap",
	"dominantSideMap",
	"primaryOccupierMap",
	"biomeMask",
	"terrainMask",
	"initialOwnerMap",
	"initialWorldControlMapSnapshot",
	"initialDeJureMapSnapshot",
	"initialProvinceMapSnapshot",
	"initialLandMaskSnapshot",
	"initialBiomeMaskSnapshot",
];

/** Resize authoritative, suspended state without resetting an ongoing conflict. */
export function resizeSimulationGrid(runtime, newResolution) {
	const oldResolution = runtime.CONFIG.GRID_RES;
	if (
		!Number.isFinite(newResolution) ||
		newResolution <= 0 ||
		!Number.isFinite(oldResolution) ||
		oldResolution <= 0
	)
		throw new RangeError("Grid resolutions must be positive finite numbers");
	if (newResolution === oldResolution) return false;
	const oldWidth = runtime.gridWidth;
	const oldHeight = runtime.gridHeight;
	const oldSize = oldWidth * oldHeight;
	const gridWidth = Math.ceil(360 / newResolution);
	const gridHeight = Math.ceil(180 / newResolution);
	const gridSize = gridWidth * gridHeight;
	if (
		!Number.isInteger(oldWidth) ||
		!Number.isInteger(oldHeight) ||
		oldWidth <= 0 ||
		oldHeight <= 0 ||
		!Number.isSafeInteger(gridSize) ||
		gridSize > 0xffffffff
	)
		throw new RangeError("Grid dimensions are out of range");

	// Rows start at -90 degrees, as in getGridIndex. Clamp partial edge cells
	// rather than wrapping their centers across the antimeridian or the poles.
	const sourceColumns = Uint32Array.from({ length: gridWidth }, (_, x) =>
		Math.min(
			oldWidth - 1,
			Math.floor(((x + 0.5) * newResolution) / oldResolution),
		),
	);
	function resample(source) {
		if (!ArrayBuffer.isView(source) || source.length !== oldSize)
			throw new RangeError("Source grid size mismatch");
		const target = new source.constructor(gridSize);
		for (let y = 0; y < gridHeight; y++) {
			const sourceRow = Math.min(
				oldHeight - 1,
				Math.floor(((y + 0.5) * newResolution) / oldResolution),
			);
			const sourceOffset = sourceRow * oldWidth;
			const targetOffset = y * gridWidth;
			for (let x = 0; x < gridWidth; x++)
				target[targetOffset + x] = source[sourceOffset + sourceColumns[x]];
		}
		return target;
	}
	const grids = {};
	for (const name of GRID_FIELDS)
		if (runtime[name] != null) grids[name] = resample(runtime[name]);
	const influences = (runtime.sideInfluenceMaps || []).map((map) =>
		resample(toDenseInfluenceMap(map)),
	);
	const countries = new Set([
		...(runtime.countryMetadata || []),
		...(runtime.sides || []).flat(),
		...(runtime.initialCombatants || []),
		...(runtime.initialCountryMetadataSnapshot || []),
	]);
	const getTargetGridIndex = (lat, lng) => {
		const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
		const x = Math.floor((wrappedLng + 180) / newResolution);
		const y = Math.floor((lat + 90) / newResolution);
		return x < 0 || x >= gridWidth || y < 0 || y >= gridHeight
			? -1
			: y * gridWidth + x;
	};
	const savedMasks = new Map();
	for (const country of countries)
		if (hasSavedCells(country))
			savedMasks.set(
				country,
				normalizeSavedCells(
					country,
					oldResolution,
					newResolution,
					gridWidth,
					getTargetGridIndex,
				),
			);

	// All allocations and mask conversions succeeded before changing live state.
	Object.assign(runtime, grids);
	runtime.sideInfluenceMaps = influences;
	runtime.gridWidth = gridWidth;
	runtime.gridHeight = gridHeight;
	runtime.CONFIG.GRID_RES = newResolution;
	const cellAreaRatio = (oldResolution / newResolution) ** 2;
	for (const country of countries) {
		if (!country) continue;
		if (Number.isFinite(country.initialCells))
			country.initialCells *= cellAreaRatio;
		if (savedMasks.has(country))
			Object.assign(country, savedMasks.get(country));
	}

	runtime._simulationWorldGeneration =
		(runtime._simulationWorldGeneration || 0) + 1;
	runtime._simulationJobs?.clear("grid resized");
	runtime._territoryLedger = null;
	runtime._territoryLedgerSnapshot = null;
	runtime._territoryLedgerDecisionTick = -Infinity;
	runtime._mopUpOwnedCellCache?.clear();
	runtime._tickUnitGridIdx?.clear();
	runtime._coastalLandIndices = [];
	runtime._coastalTopologyReady = false;
	runtime.adjacencyCache = null;
	runtime.invalidateFrontlineField?.();
	runtime.notifyPoliticalMapLoaded?.();
	runtime.requestOperationalAiReassessment?.();
	runtime.scheduleCoastalTopologyJob?.();
	if (runtime.createRuntimeTerritoryLedger)
		runtime._territoryLedger = runtime.createRuntimeTerritoryLedger();
	const snapshot = runtime.flushTerritoryLedger?.();
	if (snapshot) runtime.publishTerritoryLedgerSnapshot?.(snapshot, true);
	return true;
}
