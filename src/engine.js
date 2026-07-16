import { CONFIG } from "./config.js";
import {
	areSidesHostile,
	dominantSideMap,
	frontlineDirLat,
	frontlineDirLng,
	gridHeight,
	gridWidth,
	landMask,
	MAX_SIDES,
	occupationMap,
	setDominantSideMap,
	setSideInfluenceMaps,
	sideInfluenceMaps,
	worldControlMap,
} from "./main.js";

function syncOccupationFromSideInfluence(idx) {
	let bestSide = -1,
		bestVal = 0;
	for (let s = 0; s < sideInfluenceMaps.length; s++) {
		const v = sideInfluenceMaps[s][idx];
		if (v > bestVal) {
			bestVal = v;
			bestSide = s;
		}
	}
	const currentOccupier = dominantSideMap[idx];
	// Hysteresis: require meaningful advantage to flip, prevents ping-pong flickering
	const HYSTERESIS = 0.15;
	if (bestSide >= 0) {
		if (currentOccupier === -1 || currentOccupier === bestSide) {
			// Unclaimed or same occupier: accept freely
			dominantSideMap[idx] = bestSide;
			occupationMap[idx] = bestSide % 2 === 0 ? bestVal : -bestVal;
		} else {
			// Challenger must beat current occupier by threshold
			const currentVal = sideInfluenceMaps[currentOccupier]?.[idx] || 0;
			if (bestVal > currentVal + HYSTERESIS) {
				dominantSideMap[idx] = bestSide;
				occupationMap[idx] = bestSide % 2 === 0 ? bestVal : -bestVal;
			}
		}
	} else {
		dominantSideMap[idx] = -1;
		occupationMap[idx] = 0;
	}
}

function initSideInfluenceMaps() {
	setSideInfluenceMaps([]);
	for (let s = 0; s < MAX_SIDES; s++) {
		sideInfluenceMaps[s] = new Float32Array(gridWidth * gridHeight);
	}
	const gridSize = gridWidth * gridHeight;
	if (dominantSideMap && dominantSideMap.length === gridSize) {
		dominantSideMap.fill(-1);
	} else {
		setDominantSideMap(new Int8Array(gridSize).fill(-1));
	}
}

function resetSideInfluenceMaps() {
	for (let s = 0; s < sideInfluenceMaps.length; s++) {
		if (sideInfluenceMaps[s]) sideInfluenceMaps[s].fill(0);
	}
	if (dominantSideMap) dominantSideMap.fill(-1);
	if (occupationMap) occupationMap.fill(0);
}

function clearCellInfluence(i) {
	for (let s = 0; s < sideInfluenceMaps.length; s++)
		sideInfluenceMaps[s][i] = 0;
	dominantSideMap[i] = -1;
	occupationMap[i] = 0;
}

function isMyTerritory(idx, sideIndex) {
	return dominantSideMap[idx] === sideIndex;
}

function isEnemyTerritory(idx, sideIndex) {
	const ds = dominantSideMap[idx];
	return ds >= 0 && areSidesHostile(sideIndex, ds);
}

function myInfluenceAt(idx, sideIndex) {
	if (sideIndex < 0 || sideIndex >= sideInfluenceMaps.length) return 0;
	return sideInfluenceMaps[sideIndex][idx];
}

function getGridIndex(lat, lng) {
	// Normalize longitude to [-180, 180] before indexing to handle wrap-around coordinates
	const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
	const x = Math.floor((wrappedLng + 180) / CONFIG.GRID_RES);
	const y = Math.floor((lat + 90) / CONFIG.GRID_RES);
	if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return -1;
	return y * gridWidth + x;
}

function getBorderDirection(unit) {
	if (!worldControlMap || !landMask) return null;
	const idx = getGridIndex(unit.lat, unit.lng);
	if (idx === -1) return null;

	if (frontlineDirLat && frontlineDirLat.length > idx) {
		const lat = frontlineDirLat[idx];
		const lng = frontlineDirLng[idx];
		if (lat !== 0 || lng !== 0) return { lat, lng };
		return null;
	}
	return null;
}

export {
	clearCellInfluence,
	getBorderDirection,
	getGridIndex,
	initSideInfluenceMaps,
	isEnemyTerritory,
	isMyTerritory,
	myInfluenceAt,
	resetSideInfluenceMaps,
	syncOccupationFromSideInfluence,
};
