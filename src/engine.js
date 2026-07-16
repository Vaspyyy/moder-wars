import { CONFIG } from "./config.js";
import {
	_frontlinePolys,
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
	setFrontlinePolys,
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

function computeFrontlinePolys() {
	setFrontlinePolys({});
	const total = gridWidth * gridHeight;
	if (!dominantSideMap || !landMask) return;

	// Collect frontier cells per side-pair
	const frontierSets = {};

	for (let i = 0; i < total; i++) {
		if (landMask[i] !== 2) continue;
		const ds = dominantSideMap[i];
		if (ds < 0) continue;

		// Check 4 neighbors for different sides
		const neighbors = [i + 1, i - 1, i + gridWidth, i - gridWidth];
		for (let n = 0; n < neighbors.length; n++) {
			const nb = neighbors[n];
			if (nb < 0 || nb >= total) continue;
			if (landMask[nb] !== 2) continue;
			const nds = dominantSideMap[nb];
			if (nds < 0 || !areSidesHostile(ds, nds)) continue;

			// Normalize pair key (lower side first)
			const key = ds < nds ? `${ds}_${nds}` : `${nds}_${ds}`;
			if (!frontierSets[key]) frontierSets[key] = new Set();
			frontierSets[key].add(i);
			frontierSets[key].add(nb);
			break; // Count each cell once per pair
		}
	}

	// Convert sets to arrays and sort each connected segment into its own polyline
	for (const key of Object.keys(frontierSets)) {
		const cells = Array.from(frontierSets[key]);
		const visited = new Set();

		const getCoord = (idx) => {
			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			return {
				x,
				y,
				lat: y * CONFIG.GRID_RES - 90,
				lng: x * CONFIG.GRID_RES - 180,
			};
		};

		const findStart = () => {
			for (let c = 0; c < cells.length; c++) {
				if (!visited.has(cells[c])) return cells[c];
			}
			return -1;
		};

		let start = findStart();
		let segIdx = 0;
		while (start !== -1) {
			const segment = [];
			let cur = start;
			visited.add(cur);
			const curCoord = getCoord(cur);
			segment.push(curCoord);

			let _prev = -1;
			while (true) {
				let bestDist = Infinity;
				let best = -1;
				const cc = getCoord(cur);
				for (let c = 0; c < cells.length; c++) {
					if (visited.has(cells[c])) continue;
					const nc = getCoord(cells[c]);
					const dSq = (cc.lat - nc.lat) ** 2 + (cc.lng - nc.lng) ** 2;
					if (dSq < bestDist && dSq < (CONFIG.GRID_RES * 3) ** 2) {
						bestDist = dSq;
						best = cells[c];
					}
				}
				if (best === -1) break;
				_prev = cur;
				cur = best;
				visited.add(cur);
				segment.push(getCoord(cur));
			}
			if (segment.length > 0) {
				const segKey = `${key}_${segIdx}`;
				_frontlinePolys[segKey] = segment;
				segIdx++;
			}
			start = findStart();
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
	computeFrontlinePolys,
	getBorderDirection,
	getGridIndex,
	initSideInfluenceMaps,
	isEnemyTerritory,
	isMyTerritory,
	myInfluenceAt,
	resetSideInfluenceMaps,
	syncOccupationFromSideInfluence,
};
