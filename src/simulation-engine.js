import {
	clearInfluenceMap,
	createSparseInfluenceMap,
	readInfluence,
	writeInfluence,
} from "./influence-grid.js";

/** Numeric grid operations shared by the browser bridge and simulation worker. */
export function createEngine(runtime) {
	let occupationChangeListener = null;
	let influenceChangeListener = null;

	function setInfluenceChangeListener(listener) {
		influenceChangeListener = typeof listener === "function" ? listener : null;
	}

	function publishInfluenceChange(idx, previousSide, previousOccupation) {
		const nextSide = runtime.dominantSideMap[idx];
		const nextOccupation = runtime.occupationMap[idx];
		if (
			influenceChangeListener &&
			(previousSide !== nextSide ||
				!Object.is(previousOccupation, nextOccupation))
		)
			influenceChangeListener(idx, {
				previousSide,
				nextSide,
				previousOccupation,
				nextOccupation,
			});
	}

	function setOccupationChangeListener(listener) {
		occupationChangeListener = typeof listener === "function" ? listener : null;
	}

	function syncOccupationFromSideInfluence(idx) {
		const previousSide = runtime.dominantSideMap[idx];
		const previousOccupation = runtime.occupationMap[idx];
		let bestSide = -1,
			bestVal = 0;
		for (let s = 0; s < runtime.sideInfluenceMaps.length; s++) {
			const v = readInfluence(runtime.sideInfluenceMaps[s], idx);
			if (v > bestVal) {
				bestVal = v;
				bestSide = s;
			}
		}
		const currentOccupier = runtime.dominantSideMap[idx];
		// Hysteresis: require meaningful advantage to flip, prevents ping-pong flickering
		const HYSTERESIS = 0.15;
		if (bestSide >= 0) {
			if (currentOccupier === -1 || currentOccupier === bestSide) {
				// Unclaimed or same occupier: accept freely
				runtime.dominantSideMap[idx] = bestSide;
				runtime.occupationMap[idx] = bestSide % 2 === 0 ? bestVal : -bestVal;
			} else {
				// Challenger must beat current occupier by threshold
				const currentVal = runtime.sideInfluenceMaps[currentOccupier]
					? readInfluence(runtime.sideInfluenceMaps[currentOccupier], idx) || 0
					: 0;
				if (bestVal > currentVal + HYSTERESIS) {
					runtime.dominantSideMap[idx] = bestSide;
					runtime.occupationMap[idx] = bestSide % 2 === 0 ? bestVal : -bestVal;
				}
			}
		} else {
			runtime.dominantSideMap[idx] = -1;
			runtime.occupationMap[idx] = 0;
		}
		publishInfluenceChange(idx, previousSide, previousOccupation);
		if (
			occupationChangeListener &&
			previousSide !== runtime.dominantSideMap[idx]
		) {
			occupationChangeListener(idx, {
				previousSide,
				nextSide: runtime.dominantSideMap[idx],
				previousOccupation,
				nextOccupation: runtime.occupationMap[idx],
			});
		}
	}

	function ensureSideInfluenceMaps(sideCount = runtime.sides?.length || 0) {
		const count = Number(sideCount);
		if (!Number.isInteger(count) || count < 0 || count > runtime.MAX_SIDES) {
			throw new RangeError("Influence side count is out of range");
		}
		const gridSize = runtime.gridWidth * runtime.gridHeight;
		const sparse =
			runtime.sparseInfluence ||
			runtime.sideInfluenceMaps.some((map) => map?.pages);
		for (let side = 0; side < count; side++) {
			if (runtime.sideInfluenceMaps[side]?.length !== gridSize) {
				runtime.sideInfluenceMaps[side] = sparse
					? createSparseInfluenceMap(gridSize)
					: new Float32Array(gridSize);
			}
		}
		return runtime.sideInfluenceMaps;
	}

	function initSideInfluenceMaps(sideCount = runtime.sides?.length || 0) {
		runtime.sideInfluenceMaps = [];
		ensureSideInfluenceMaps(sideCount);
		const gridSize = runtime.gridWidth * runtime.gridHeight;
		if (runtime.dominantSideMap?.length === gridSize)
			runtime.dominantSideMap.fill(-1);
		else runtime.dominantSideMap = new Int8Array(gridSize).fill(-1);
	}

	function resetSideInfluenceMaps(sideCount = runtime.sides?.length || 0) {
		ensureSideInfluenceMaps(sideCount);
		runtime.sideInfluenceMaps.length = sideCount;
		for (const map of runtime.sideInfluenceMaps) clearInfluenceMap(map);
		if (runtime.dominantSideMap) runtime.dominantSideMap.fill(-1);
		if (runtime.occupationMap) runtime.occupationMap.fill(0);
	}

	function clearCellInfluence(i) {
		const previousSide = runtime.dominantSideMap[i];
		const previousOccupation = runtime.occupationMap[i];
		for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
			writeInfluence(runtime.sideInfluenceMaps[s], i, 0);
		runtime.dominantSideMap[i] = -1;
		runtime.occupationMap[i] = 0;
		publishInfluenceChange(i, previousSide, previousOccupation);
	}

	function isMyTerritory(idx, sideIndex) {
		return runtime.dominantSideMap[idx] === sideIndex;
	}

	function isEnemyTerritory(idx, sideIndex) {
		const ds = runtime.dominantSideMap[idx];
		return ds >= 0 && runtime.areSidesHostile(sideIndex, ds);
	}

	function myInfluenceAt(idx, sideIndex) {
		if (sideIndex < 0 || sideIndex >= runtime.sideInfluenceMaps.length)
			return 0;
		return readInfluence(runtime.sideInfluenceMaps[sideIndex], idx);
	}

	function getGridIndex(lat, lng) {
		// Normalize longitude to [-180, 180] before indexing to handle wrap-around coordinates
		const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
		const x = Math.floor((wrappedLng + 180) / runtime.CONFIG.GRID_RES);
		const y = Math.floor((lat + 90) / runtime.CONFIG.GRID_RES);
		if (x < 0 || x >= runtime.gridWidth || y < 0 || y >= runtime.gridHeight)
			return -1;
		return y * runtime.gridWidth + x;
	}

	function getBorderDirection(unit) {
		if (!runtime.worldControlMap || !runtime.landMask) return null;
		const idx = getGridIndex(unit.lat, unit.lng);
		if (idx === -1) return null;

		if (runtime.frontlineDirLat && runtime.frontlineDirLat.length > idx) {
			const lat = runtime.frontlineDirLat[idx];
			const lng = runtime.frontlineDirLng[idx];
			if (lat !== 0 || lng !== 0) return { lat, lng };
			return null;
		}
		return null;
	}

	return {
		setInfluenceChangeListener,
		setOccupationChangeListener,
		clearCellInfluence,
		getBorderDirection,
		getGridIndex,
		ensureSideInfluenceMaps,
		initSideInfluenceMaps,
		isEnemyTerritory,
		isMyTerritory,
		myInfluenceAt,
		resetSideInfluenceMaps,
		syncOccupationFromSideInfluence,
	};
}
