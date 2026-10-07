/**
 * Finds sealed pockets: war-zone land held by one side that touches only
 * hostile-held land and holds at least one of its formations. Floods start
 * from formations; each cell is flooded at most once per scan. Browser-free.
 */
const MAX_POCKET_CELLS = 20000;
// Breakout and relief look this many degrees beyond a pocket for friendly land.
const ESCAPE_SEARCH_DEG = 8;

export function findEncirclementPockets({
	units,
	sides,
	landMask,
	dominantSideMap,
	worldControlMap,
	gridWidth,
	gridHeight,
	getGridIndex,
	areSidesHostile,
	CONFIG,
}) {
	const sideOfCountry = new Map();
	sides.forEach((members, index) => {
		for (const country of members || []) sideOfCountry.set(country.id, index);
	});
	const pockets = [];
	// Cell -> flood number; meeting another flood's cell means one region.
	const visited = new Map();
	let flood = 0;
	for (const unit of units) {
		if (unit.health <= 0) continue;
		const seed = getGridIndex(unit.lat, unit.lng);
		const side = unit.sideIndex;
		if (seed < 0 || visited.has(seed)) continue;
		if (landMask[seed] !== 2 || dominantSideMap[seed] !== side) continue;
		flood++;
		const cells = [seed];
		visited.set(seed, flood);
		let sealed = true;
		for (let head = 0; sealed && head < cells.length; head++) {
			const cell = cells[head];
			const x = cell % gridWidth;
			const y = (cell - x) / gridWidth;
			for (let n = 0; n < 4; n++) {
				const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
				const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
				if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
					sealed = false;
					break;
				}
				const next = ny * gridWidth + nx;
				const holder = dominantSideMap[next];
				if (landMask[next] === 2 && holder === side) {
					const seen = visited.get(next);
					if (seen === undefined) {
						visited.set(next, flood);
						cells.push(next);
						continue;
					}
					if (seen === flood) continue;
					// Joins a region an earlier flood already found open.
					sealed = false;
					break;
				}
				// Outside the war zone (or unheld), the owner decides: only land of a
				// hostile side closes the ring; sea, neutrals, allies and home do not.
				const closer =
					landMask[next] === 2 && holder >= 0
						? holder
						: landMask[next] === 0
							? undefined
							: sideOfCountry.get(worldControlMap[next]);
				if (closer === undefined || !areSidesHostile(side, closer)) {
					sealed = false;
					break;
				}
			}
			if (cells.length > MAX_POCKET_CELLS) sealed = false;
		}
		if (sealed) {
			const pocket = { sideIndex: side, cells: Int32Array.from(cells) };
			const route = findPocketRoute(pocket, {
				landMask,
				dominantSideMap,
				gridWidth,
				gridHeight,
				res: CONFIG?.GRID_RES,
			});
			if (route) Object.assign(pocket, route);
			pockets.push(pocket);
		}
	}
	return pockets;
}

/**
 * The nearest friendly land outside a pocket (`escape`, where trapped armies
 * break out to) and the pocket cell closest to it (`edge`, where a relief force
 * attacks). Both are cell-centre points; null when no friendly land is near.
 */
function findPocketRoute(
	pocket,
	{ landMask, dominantSideMap, gridWidth, gridHeight, res },
) {
	if (!(res > 0)) return null;
	const inside = new Set(pocket.cells);
	const wraps = gridWidth * res >= 359.9;
	let sumRow = 0;
	let sumCol = 0;
	const refCol = pocket.cells[0] % gridWidth;
	for (const cell of pocket.cells) {
		const col = cell % gridWidth;
		let dc = col - refCol;
		if (wraps && dc > gridWidth / 2) dc -= gridWidth;
		if (wraps && dc < -gridWidth / 2) dc += gridWidth;
		sumRow += (cell - col) / gridWidth;
		sumCol += dc;
	}
	const row = Math.round(sumRow / pocket.cells.length);
	const col = refCol + Math.round(sumCol / pocket.cells.length);
	const radius = Math.max(1, Math.round(ESCAPE_SEARCH_DEG / res));
	let exit = -1;
	// Square rings outward from the centroid: the first hit is near-closest.
	for (let ring = 1; ring <= radius && exit < 0; ring++) {
		let best = Infinity;
		for (let dr = -ring; dr <= ring; dr++) {
			const edgeRow = Math.abs(dr) === ring;
			for (let dc = -ring; dc <= ring; dc += edgeRow ? 1 : ring * 2) {
				const r = row + dr;
				const c = col + dc;
				if (r < 0 || r >= gridHeight) continue;
				if (!wraps && (c < 0 || c >= gridWidth)) continue;
				const idx = r * gridWidth + ((c + gridWidth) % gridWidth);
				if (
					inside.has(idx) ||
					landMask[idx] === 0 ||
					dominantSideMap[idx] !== pocket.sideIndex
				)
					continue;
				const distance = dr * dr + dc * dc;
				if (distance < best) {
					best = distance;
					exit = idx;
				}
			}
		}
	}
	if (exit < 0) return null;
	const exitRow = Math.floor(exit / gridWidth);
	const exitCol = exit % gridWidth;
	let edge = pocket.cells[0];
	let edgeDistance = Infinity;
	for (const cell of pocket.cells) {
		const c = cell % gridWidth;
		let dc = Math.abs(c - exitCol);
		if (wraps && dc > gridWidth / 2) dc = gridWidth - dc;
		const dr = (cell - c) / gridWidth - exitRow;
		const distance = dr * dr + dc * dc;
		if (distance < edgeDistance) {
			edgeDistance = distance;
			edge = cell;
		}
	}
	const point = (idx) => ({
		lat: (Math.floor(idx / gridWidth) + 0.5) * res - 90,
		lng: ((idx % gridWidth) + 0.5) * res - 180,
	});
	return { escape: point(exit), edge: point(edge) };
}

const lookups = new WeakMap();
/** Cell index -> pocket, cached per scan result. */
export function pocketCellLookup(pockets) {
	if (!pockets?.length) return null;
	let lookup = lookups.get(pockets);
	if (!lookup) {
		lookup = new Map();
		for (const pocket of pockets)
			for (const cell of pocket.cells) lookup.set(cell, pocket);
		lookups.set(pockets, lookup);
	}
	return lookup;
}
