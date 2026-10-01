import { normalizeLongitudeDelta } from "./geographic-math.js";

// A pocket is valid only if an enemy component that currently escapes a local
// window loses all exits when a traversable neck between friendly shoulders closes.
export function findArmyEncirclement(context, side, origin, maxTests = 12) {
	const width = context.gridWidth,
		height = context.gridHeight,
		res = context.CONFIG.GRID_RES;
	const seed = context.getGridIndex(origin.lat, origin.lng);
	if (seed < 0) return null;
	const enemy = (idx) =>
		idx >= 0 &&
		idx < context.landMask.length &&
		context.landMask[idx] > 0 &&
		context.areSidesHostile(side, context.dominantSideMap[idx]);
	const friendly = (idx) =>
		idx >= 0 &&
		context.landMask[idx] > 0 &&
		context.dominantSideMap[idx] === side;
	if (!enemy(seed)) return null;
	const row = Math.floor(seed / width),
		col = seed % width;
	const radius = Math.min(32, Math.max(6, Math.ceil(3 / res)));
	const point = (idx) => ({
		lat: (Math.floor(idx / width) + 0.5) * res - 90,
		lng: ((idx % width) + 0.5) * res - 180,
	});
	const relative = (idx) => {
		const r = Math.floor(idx / width),
			c = idx % width;
		let dc = c - col;
		if (dc > width / 2) dc -= width;
		if (dc < -width / 2) dc += width;
		return [r - row, dc];
	};
	function flood(blocked) {
		if (blocked.has(seed)) return { escaped: true, count: 0 };
		const queue = [seed],
			seen = new Set(queue);
		let head = 0;
		while (head < queue.length && head < 4096) {
			const idx = queue[head++],
				[dr, dc] = relative(idx);
			if (Math.abs(dr) >= radius || Math.abs(dc) >= radius)
				return { escaped: true, count: seen.size };
			const r = Math.floor(idx / width),
				c = idx % width;
			const neighbors = [
				r * width + ((c + width - 1) % width),
				r * width + ((c + 1) % width),
			];
			if (r > 0) neighbors.push(idx - width);
			if (r + 1 < height) neighbors.push(idx + width);
			for (const next of neighbors)
				if (!seen.has(next) && !blocked.has(next) && enemy(next)) {
					seen.add(next);
					queue.push(next);
				}
		}
		return { escaped: head < queue.length, count: seen.size, cells: [...seen] };
	}
	if (!flood(new Set()).escaped) return null;
	let tested = 0;
	const reach = Math.min(12, Math.max(3, Math.ceil(1.5 / res)));
	for (let distance = 2; distance <= radius / 2; distance++) {
		for (const [dr, dc] of [
			[distance, 0],
			[-distance, 0],
			[0, distance],
			[0, -distance],
		]) {
			const r = row + dr,
				c = (col + dc + width) % width;
			if (r < 0 || r >= height) continue;
			const neck = r * width + c;
			if (!enemy(neck)) continue;
			const horizontal = dr !== 0;
			const closure = new Set([neck]),
				shoulders = [];
			for (const sign of [-1, 1]) {
				for (let step = 1; step <= reach; step++) {
					const rr = r + (horizontal ? 0 : sign * step),
						cc = (c + (horizontal ? sign * step : 0) + width) % width;
					if (rr < 0 || rr >= height) break;
					const idx = rr * width + cc;
					if (friendly(idx)) {
						shoulders.push(point(idx));
						break;
					}
					if (!enemy(idx)) break;
					closure.add(idx);
				}
			}
			if (shoulders.length !== 2) continue;
			const pocket = flood(closure);
			if (++tested >= maxTests && pocket.escaped) return null;
			if (pocket.escaped || pocket.count < 3) continue;
			return {
				target: point(neck),
				shoulders,
				closureCells: [...closure],
				pocketCells: pocket.cells,
				pinTarget: {
					lat: origin.lat,
					lng: normalizeLongitudeDelta(origin.lng),
				},
				pocketSize: pocket.count,
			};
		}
	}
	return null;
}

export function armyPocketClosed(context, side, operation) {
	if (!operation?.closureCells?.length || !operation?.pocketCells?.length)
		return false;
	if (
		!operation.closureCells.every(
			(idx) => context.dominantSideMap[idx] === side,
		)
	)
		return false;
	const pocket = new Set(operation.pocketCells);
	const width = context.gridWidth;
	for (const idx of pocket) {
		if (!context.areSidesHostile(side, context.dominantSideMap[idx])) continue;
		const row = Math.floor(idx / width),
			col = idx % width;
		const neighbors = [
			row * width + ((col + width - 1) % width),
			row * width + ((col + 1) % width),
		];
		if (row > 0) neighbors.push(idx - width);
		if (row + 1 < context.gridHeight) neighbors.push(idx + width);
		if (
			neighbors.some(
				(next) =>
					!pocket.has(next) &&
					context.areSidesHostile(side, context.dominantSideMap[next]),
			)
		)
			return false;
	}
	return true;
}
