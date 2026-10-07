// Rivers and mountain ranges on friendly ground are where a side prefers to hold.
// Browser-free: shared by army command, ground units and proposal scoring.

// Mountain cells at or above this terrain intensity count as a defensive line.
export const LINE_MOUNTAIN_MIN = 0.25;
// A capital's fall shakes its country for this many ticks (6 s at 1x).
export const CAPITAL_SHOCK_TICKS = 360;

export function isDefensiveLineCell(context, idx) {
	if (idx < 0) return false;
	if (context.riverMask?.[idx] === 1) return true;
	return (
		context.mountainsEnabled !== false &&
		(context.terrainMask?.[idx] || 0) >= LINE_MOUNTAIN_MIN
	);
}

const offsetCache = new Map();
function ringOffsets(radius) {
	let offsets = offsetCache.get(radius);
	if (offsets) return offsets;
	offsets = [];
	for (let dr = -radius; dr <= radius; dr++)
		for (let dc = -radius; dc <= radius; dc++)
			if (dr * dr + dc * dc <= radius * radius)
				offsets.push({ dr, dc, score: dr * dr + dc * dc });
	offsets.sort((a, b) => a.score - b.score || a.dr - b.dr || a.dc - b.dc);
	offsetCache.set(radius, offsets);
	return offsets;
}

/**
 * The nearest friendly line cell (river bank or mountain) to `anchor` within
 * `radiusDeg`, as a cell-centre point with its distance in degrees, or null.
 */
export function findDefensiveLine(context, side, anchor, radiusDeg) {
	const res = context.CONFIG?.GRID_RES;
	const width = context.gridWidth;
	const height = context.gridHeight;
	if (!(res > 0) || !width || !height) return null;
	if (!context.riverMask && !context.terrainMask) return null;
	const center = context.getGridIndex(anchor.lat, anchor.lng);
	if (center < 0) return null;
	const row = Math.floor(center / width);
	const col = center % width;
	const wraps = width * res >= 359.9;
	const radius = Math.max(1, Math.round(radiusDeg / res));
	for (const { dr, dc, score } of ringOffsets(radius)) {
		const r = row + dr;
		const rawCol = col + dc;
		if (r < 0 || r >= height) continue;
		if (!wraps && (rawCol < 0 || rawCol >= width)) continue;
		const idx = r * width + ((rawCol + width) % width);
		if (
			context.landMask[idx] > 0 &&
			context.dominantSideMap[idx] === side &&
			isDefensiveLineCell(context, idx)
		)
			return {
				lat: (r + 0.5) * res - 90,
				lng: (((rawCol + width) % width) + 0.5) * res - 180,
				distance: Math.sqrt(score) * res,
			};
	}
	return null;
}

/** True while a member of `side` lost its capital within the shock window. */
export function isSideInCapitalShock(context, side) {
	const fallen = context._capitalFallTick;
	if (!fallen?.size) return false;
	for (const country of context.sides?.[side] || []) {
		const tick = fallen.get(country.id);
		if (
			tick !== undefined &&
			context._simTickCount - tick < CAPITAL_SHOCK_TICKS
		)
			return true;
	}
	return false;
}

/**
 * Power-weighted share of hostile formations near `point` that are dug in on a
 * river or mountain line. Frontal attacks into such a sector are poor value.
 */
export function enemyLineShare(context, side, point, radiusDeg = 3) {
	const bySide = context._tickUnitsBySide;
	if (!bySide || !point) return 0;
	const radiusSq = radiusDeg * radiusDeg;
	let held = 0;
	let total = 0;
	for (let other = 0; other < bySide.length; other++) {
		if (other === side || !context.areSidesHostile(side, other)) continue;
		for (const unit of bySide[other] || []) {
			if (unit.health <= 0 || unit.isAtSea) continue;
			const dLat = unit.lat - point.lat;
			let dLng = Math.abs(unit.lng - point.lng);
			if (dLng > 180) dLng = 360 - dLng;
			if (dLat * dLat + dLng * dLng > radiusSq) continue;
			total += unit.health;
			if ((unit.lineDefense ?? 1) < 1) held += unit.health;
		}
	}
	return total > 0 ? held / total : 0;
}
