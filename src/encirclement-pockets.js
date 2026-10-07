/**
 * Finds sealed pockets: war-zone land held by one side that touches only
 * hostile-held land and holds at least one of its formations. Floods start
 * from formations; each cell is flooded at most once per scan. Browser-free.
 */
const MAX_POCKET_CELLS = 20000;

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
		if (sealed)
			pockets.push({ sideIndex: side, cells: Int32Array.from(cells) });
	}
	return pockets;
}
