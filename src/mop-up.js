export const MOP_UP_CELL_CACHE_LIMIT = 64;

function mixUint32(value) {
	let mixed = value >>> 0;
	mixed ^= mixed >>> 16;
	mixed = Math.imul(mixed, 0x7feb352d);
	mixed ^= mixed >>> 15;
	mixed = Math.imul(mixed, 0x846ca68b);
	mixed ^= mixed >>> 16;
	return mixed >>> 0;
}

export function cacheMopUpCell(
	cache,
	countryId,
	cellIndex,
	limit = MOP_UP_CELL_CACHE_LIMIT,
) {
	const normalizedId = Number(countryId) || 0;
	const normalizedIndex = Number(cellIndex);
	const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
	if (
		!(cache instanceof Map) ||
		normalizedId <= 0 ||
		!Number.isInteger(normalizedIndex) ||
		normalizedIndex < 0
	) {
		return;
	}

	let entry = cache.get(normalizedId);
	if (!entry || entry.cells.length !== normalizedLimit) {
		entry = {
			cells: new Int32Array(normalizedLimit).fill(-1),
			ranks: new Uint32Array(normalizedLimit).fill(0xffffffff),
		};
		cache.set(normalizedId, entry);
	}

	const countrySalt = Math.imul(normalizedId, 0x9e3779b1);
	const hash = mixUint32(normalizedIndex ^ countrySalt);
	const slot = hash % normalizedLimit;
	const rank = mixUint32(hash ^ 0x85ebca6b);
	if (entry.cells[slot] === -1 || rank < entry.ranks[slot]) {
		entry.cells[slot] = normalizedIndex;
		entry.ranks[slot] = rank;
	}
}

export function selectAssignedMopUpCountryId(countryIds, unitIndex) {
	if (!countryIds || countryIds.length === 0) return 0;
	const normalizedIndex = Math.max(0, Math.floor(Number(unitIndex) || 0));
	return Number(countryIds[normalizedIndex % countryIds.length]) || 0;
}

export function selectNearestMopUpCell(
	cells,
	{ unitLat, unitLng, gridWidth, gridRes, isEligible = () => true } = {},
) {
	if (!cells || cells.length === 0 || gridWidth <= 0 || gridRes <= 0) {
		return -1;
	}

	let bestCellIndex = -1;
	let bestDistanceSq = Infinity;
	for (
		let candidateIndex = 0;
		candidateIndex < cells.length;
		candidateIndex++
	) {
		const cellIndex = cells[candidateIndex];
		if (cellIndex < 0 || !isEligible(cellIndex)) continue;
		const row = Math.floor(cellIndex / gridWidth);
		const column = cellIndex % gridWidth;
		const cellLat = row * gridRes - 90 + gridRes * 0.5;
		const cellLng = column * gridRes - 180 + gridRes * 0.5;
		let deltaLng = cellLng - unitLng;
		if (deltaLng > 180) deltaLng -= 360;
		else if (deltaLng < -180) deltaLng += 360;
		const distanceSq = (cellLat - unitLat) ** 2 + deltaLng ** 2;
		if (
			distanceSq < bestDistanceSq ||
			(distanceSq === bestDistanceSq && cellIndex < bestCellIndex)
		) {
			bestDistanceSq = distanceSq;
			bestCellIndex = cellIndex;
		}
	}
	return bestCellIndex;
}
