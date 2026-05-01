import { CONFIG } from "./config.js";
import {
	MAX_SIDES,
	_cachedFrontierCells,
	_frontierScanCounter,
	_frontlineSourceCell,
	frontlineDirLat,
	frontlineDirLng,
	gridWidth,
	setDominantSideMap,
	setFrontlineDirLat,
	setFrontlineDirLng,
	setSideInfluenceMaps,
	setFrontierScanCounter,
	set_frontlineSourceCell,
	dominantSideMap,
	gridHeight,
	landMask,
	occupationMap,
	sideInfluenceMaps,
	worldControlMap
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
	if (bestSide >= 0) {
		dominantSideMap[idx] = bestSide;
		occupationMap[idx] = bestSide % 2 === 0 ? bestVal : -bestVal;
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
	return ds >= 0 && ds !== sideIndex;
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

function rebuildFrontlineField() {
	const total = gridWidth * gridHeight;

	let fdl = frontlineDirLat;
	let fdlng = frontlineDirLng;
	let fsrc = _frontlineSourceCell;

	if (!fdl || fdl.length !== total) {
		fdl = new Float32Array(total);
		fdlng = new Float32Array(total);
		fsrc = new Int32Array(total);
		setFrontlineDirLat(fdl);
		setFrontlineDirLng(fdlng);
		set_frontlineSourceCell(fsrc);
	}

	fdl.fill(0);
	fdlng.fill(0);
	fsrc.fill(-1);

	const queue = new Int32Array(total);
	let qHead = 0,
		qTail = 0;

	// Incremental seed: full frontier scan only every 3rd rebuild.
	// _cachedFrontierCells initialized as [] in main.js, reused here.
	if (!_cachedFrontierCells) _cachedFrontierCells.length = 0;
	setFrontierScanCounter((_frontierScanCounter + 1) % 3);

	if (_frontierScanCounter === 0 || _cachedFrontierCells.length === 0) {
		// Full scan: find all frontier cells
		_cachedFrontierCells.length = 0;
		for (let i = 0; i < total; i++) {
			if (landMask[i] !== 2) continue;
			const mySide = dominantSideMap[i];
			if (mySide < 0) continue;
			let isFront = false;
			if (i % gridWidth < gridWidth - 1) {
				const ns = dominantSideMap[i + 1];
				if (ns >= 0 && ns !== mySide) isFront = true;
			}
			if (!isFront && i % gridWidth > 0) {
				const ns = dominantSideMap[i - 1];
				if (ns >= 0 && ns !== mySide) isFront = true;
			}
			if (!isFront && i + gridWidth < total) {
				const ns = dominantSideMap[i + gridWidth];
				if (ns >= 0 && ns !== mySide) isFront = true;
			}
			if (!isFront && i - gridWidth >= 0) {
				const ns = dominantSideMap[i - gridWidth];
				if (ns >= 0 && ns !== mySide) isFront = true;
			}
			if (isFront) {
				_cachedFrontierCells.push(i);
			}
		}
	}

	// Seed queue from cached frontier cells
	for (let f = 0; f < _cachedFrontierCells.length; f++) {
		const i = _cachedFrontierCells[f];
		if (landMask[i] === 2 && dominantSideMap[i] >= 0) {
			queue[qTail++] = i;
			fsrc[i] = i;
		}
	}

	const dirs = [1, -1, gridWidth, -gridWidth];

	while (qHead < qTail) {
		const cur = queue[qHead++];
		const src = fsrc[cur];

		const cy = Math.floor(cur / gridWidth);
		const cx = cur % gridWidth;
		const sy = Math.floor(src / gridWidth);
		const sx = src % gridWidth;
		const dLat = (sy - cy) * CONFIG.GRID_RES;
		const dLng = (sx - cx) * CONFIG.GRID_RES;
		const mag = Math.sqrt(dLat * dLat + dLng * dLng);
		if (mag > 0) {
			fdl[cur] = dLat / mag;
			fdlng[cur] = dLng / mag;
		}

		for (let d = 0; d < 4; d++) {
			const nb = cur + dirs[d];
			if (nb < 0 || nb >= total) continue;
			if (fsrc[nb] !== -1) continue;
			if (landMask[nb] === 0) continue;
			fsrc[nb] = src;
			queue[qTail++] = nb;
		}
	}
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
	rebuildFrontlineField,
	resetSideInfluenceMaps,
	syncOccupationFromSideInfluence,
};
