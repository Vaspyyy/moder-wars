// A pocket is valid only if an enemy component that currently escapes a local
// window loses all exits when a short run of enemy cells between two friendly
// shoulders (a neck) is taken. Candidate necks are every short horizontal or
// vertical enemy run in the window with friendly land at both ends, tried
// shortest and nearest first, so salients and bulges anywhere near the origin
// qualify, not only those on a straight line from it.
export function findArmyEncirclement(context, side, origin, maxTests = 12) {
	const width = context.gridWidth,
		height = context.gridHeight,
		res = context.CONFIG.GRID_RES;
	const enemy = (idx) =>
		idx >= 0 &&
		idx < context.landMask.length &&
		context.landMask[idx] > 0 &&
		context.areSidesHostile(side, context.dominantSideMap[idx]);
	const friendly = (idx) =>
		idx >= 0 &&
		context.landMask[idx] > 0 &&
		context.dominantSideMap[idx] === side;
	const wraps = width * res >= 359.9;
	const at = (r, c) => {
		if (r < 0 || r >= height) return -1;
		if (!wraps && (c < 0 || c >= width)) return -1;
		return r * width + ((c + width) % width);
	};
	let seed = context.getGridIndex(origin.lat, origin.lng);
	if (seed < 0) return null;
	// Front points sit on the boundary; start from an adjacent enemy cell.
	if (!enemy(seed)) {
		const r = Math.floor(seed / width),
			c = seed % width;
		seed = [at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r + 1, c)].find(enemy);
		if (seed === undefined) return null;
	}
	const row = Math.floor(seed / width),
		col = seed % width;
	const radius = Math.min(32, Math.max(6, Math.ceil(3 / res)));
	const maxNeck = Math.min(16, Math.max(3, Math.ceil(2 / res)));
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
	function flood(start, blocked) {
		if (blocked.has(start) || !enemy(start)) return { escaped: true, count: 0 };
		const queue = [start],
			seen = new Set(queue);
		let head = 0;
		while (head < queue.length && head < 4096) {
			const idx = queue[head++],
				[dr, dc] = relative(idx);
			if (Math.abs(dr) >= radius || Math.abs(dc) >= radius)
				return { escaped: true, count: seen.size };
			const r = Math.floor(idx / width),
				c = idx % width;
			for (const next of [
				at(r, c - 1),
				at(r, c + 1),
				at(r - 1, c),
				at(r + 1, c),
			])
				if (next >= 0 && !seen.has(next) && !blocked.has(next) && enemy(next)) {
					seen.add(next);
					queue.push(next);
				}
		}
		return { escaped: head < queue.length, count: seen.size, cells: [...seen] };
	}
	if (!flood(seed, new Set()).escaped) return null;
	// Necks: enemy runs of at most maxNeck cells with friendly land at both ends.
	const necks = [];
	const span = radius - 1;
	for (const horizontal of [true, false])
		for (let a = -span; a <= span; a++)
			for (let b = -span; b <= span; b++) {
				const cellAt = (offset) =>
					horizontal
						? at(row + a, col + b + offset)
						: at(row + b + offset, col + a);
				if (!friendly(cellAt(0)) || !enemy(cellAt(1))) continue;
				let length = 1;
				while (length <= maxNeck && enemy(cellAt(length + 1))) length++;
				if (length > maxNeck || !friendly(cellAt(length + 1))) continue;
				const cells = [];
				for (let i = 1; i <= length; i++) cells.push(cellAt(i));
				const middle = cells[Math.floor(length / 2)];
				const [dr, dc] = relative(middle);
				necks.push({
					horizontal,
					cells,
					shoulders: [point(cellAt(0)), point(cellAt(length + 1))],
					rank: length * 4 + Math.abs(dr) + Math.abs(dc),
					order: necks.length,
				});
			}
	necks.sort((l, r) => l.rank - r.rank || l.order - r.order);
	for (const neck of necks.slice(0, maxTests)) {
		const closure = new Set(neck.cells);
		// The pocket lies on one side of the neck; the other side keeps its exit.
		for (const sign of [-1, 1]) {
			let start = -1;
			for (const idx of neck.cells) {
				const r = Math.floor(idx / width),
					c = idx % width;
				const next = neck.horizontal ? at(r + sign, c) : at(r, c + sign);
				if (enemy(next)) {
					start = next;
					break;
				}
			}
			if (start < 0) continue;
			const pocket = flood(start, closure);
			if (pocket.escaped || pocket.count < 3) continue;
			let sumR = 0,
				sumC = 0;
			for (const cell of pocket.cells) {
				const [dr, dc] = relative(cell);
				sumR += dr;
				sumC += dc;
			}
			const meanR = sumR / pocket.count,
				meanC = sumC / pocket.count;
			let pin = pocket.cells[0],
				pinDistance = Infinity;
			for (const cell of pocket.cells) {
				const [dr, dc] = relative(cell);
				const distance = (dr - meanR) ** 2 + (dc - meanC) ** 2;
				if (distance < pinDistance) {
					pinDistance = distance;
					pin = cell;
				}
			}
			return {
				target: point(neck.cells[Math.floor(neck.cells.length / 2)]),
				shoulders: neck.shoulders,
				closureCells: neck.cells,
				pocketCells: pocket.cells,
				pinTarget: point(pin),
				pocketSize: pocket.count,
			};
		}
	}
	return null;
}

export function armyPocketClosed(context, side, operation) {
	if (!operation?.closureCells?.length || !operation?.pocketCells?.length)
		return false;
	if (operation.window) return envelopmentClosed(context, side, operation);
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

// Two-pronged envelopment: arms breach the front at two points a few degrees
// apart and meet behind it, cutting off the enemy line between them. Spans are
// in degrees along the front; the meeting point lies this share of a span deep.
const ENVELOPMENT_SPANS = [3, 4.5];
const ENVELOPMENT_DEPTH = 0.45;
const ENVELOPMENT_STEP_DEG = 1.5;

function gridTools(context, side) {
	const width = context.gridWidth,
		height = context.gridHeight,
		res = context.CONFIG.GRID_RES;
	const wraps = width * res >= 359.9;
	const at = (r, c) => {
		if (r < 0 || r >= height) return -1;
		if (!wraps && (c < 0 || c >= width)) return -1;
		return r * width + ((c + width) % width);
	};
	const enemy = (idx) =>
		idx >= 0 &&
		context.landMask[idx] > 0 &&
		context.areSidesHostile(side, context.dominantSideMap[idx]);
	const friendly = (idx) =>
		idx >= 0 &&
		context.landMask[idx] > 0 &&
		context.dominantSideMap[idx] === side;
	return { width, height, res, at, enemy, friendly };
}

// Flood hostile cells from `starts`; escaped when it leaves the window or grows
// past `cap`. Cells in `blocked` are walls.
function floodHostile(tools, starts, blocked, window, cap) {
	const { width, at, enemy } = tools;
	const seen = new Set();
	const queue = [];
	for (const start of starts)
		if (enemy(start) && !blocked.has(start) && !seen.has(start)) {
			seen.add(start);
			queue.push(start);
		}
	for (let head = 0; head < queue.length; head++) {
		if (queue.length > cap) return { escaped: true, cells: queue };
		const idx = queue[head];
		const r = Math.floor(idx / width),
			c = idx % width;
		let dc = c - window.col;
		if (dc > width / 2) dc -= width;
		if (dc < -width / 2) dc += width;
		if (
			Math.abs(r - window.row) >= window.radius ||
			Math.abs(dc) >= window.radius
		)
			return { escaped: true, cells: queue };
		for (const next of [at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r + 1, c)])
			if (next >= 0 && !seen.has(next) && !blocked.has(next) && enemy(next)) {
				seen.add(next);
				queue.push(next);
			}
	}
	return { escaped: false, cells: queue };
}

function envelopmentClosed(context, side, operation) {
	const tools = gridTools(context, side);
	const starts = [...operation.pocketCells, ...operation.closureCells].filter(
		tools.enemy,
	);
	// Nothing hostile left inside: the pocket is closed and cleared.
	if (!starts.length) return true;
	const cap =
		(operation.pocketCells.length + operation.closureCells.length) * 2;
	return !floodHostile(tools, starts, new Set(), operation.window, cap).escaped;
}

// Cells crossed by a straight line, 4-connected so a flood cannot slip through
// a diagonal gap.
function rasterLine(tools, from, to, out) {
	const steps = Math.max(Math.abs(to.r - from.r), Math.abs(to.c - from.c), 1);
	let prevR = Math.round(from.r),
		prevC = Math.round(from.c);
	out.add(tools.at(prevR, prevC));
	for (let i = 1; i <= steps * 2; i++) {
		const t = i / (steps * 2);
		const r = Math.round(from.r + (to.r - from.r) * t),
			c = Math.round(from.c + (to.c - from.c) * t);
		if (r !== prevR && c !== prevC) out.add(tools.at(r, prevC));
		out.add(tools.at(r, c));
		prevR = r;
		prevC = c;
	}
}

/**
 * A double envelopment along one front polyline, or null. Tries breach pairs a
 * few degrees apart and returns the one that cuts off the most enemy
 * formations, in the same shape as findArmyEncirclement.
 */
export function findArmyDoubleEnvelopment(
	context,
	side,
	polyline,
	maxTests = 6,
) {
	if (!polyline || polyline.length < 3) return null;
	const tools = gridTools(context, side);
	const { width, res, at, enemy, friendly } = tools;
	const toCell = (p) => ({
		r: (p.lat + 90) / res - 0.5,
		c: (p.lng + 180) / res - 0.5,
	});
	const point = (idx) => ({
		lat: (Math.floor(idx / width) + 0.5) * res - 90,
		lng: ((idx % width) + 0.5) * res - 180,
	});
	// Arc length along the front; a jump over 1 degree breaks it.
	const arc = [0];
	for (let i = 1; i < polyline.length; i++) {
		const a = polyline[i - 1],
			b = polyline[i];
		let dLng = Math.abs(b.lng - a.lng);
		if (dLng > 180) dLng = 360 - dLng;
		const gap = Math.hypot(b.lat - a.lat, dLng);
		arc.push(arc[i - 1] + (gap > 1 ? Infinity : gap));
	}
	const enemyUnits = [];
	for (const unit of context.units || [])
		if (
			unit.health > 0 &&
			!unit.isAtSea &&
			context.areSidesHostile(side, unit.sideIndex)
		)
			enemyUnits.push(unit);
	let best = null,
		tests = 0,
		nextStart = 0;
	for (let i = 0; i < polyline.length && tests < maxTests; i++) {
		if (!Number.isFinite(arc[i]) || arc[i] < nextStart) {
			if (!Number.isFinite(arc[i])) nextStart = 0;
			continue;
		}
		nextStart = arc[i] + ENVELOPMENT_STEP_DEG;
		for (const span of ENVELOPMENT_SPANS) {
			let j = i + 1;
			while (j < polyline.length && arc[j] - arc[i] < span) j++;
			if (j >= polyline.length || !Number.isFinite(arc[j] - arc[i])) continue;
			if (tests++ >= maxTests) break;
			const a = toCell(polyline[i]),
				b = toCell(polyline[j]);
			let dr = b.r - a.r,
				dc = b.c - a.c;
			if (dc > width / 2) dc -= width;
			if (dc < -width / 2) dc += width;
			const length = Math.hypot(dr, dc);
			if (length < 2) continue;
			const mid = { r: a.r + dr / 2, c: a.c + dc / 2 };
			const depth = (span * ENVELOPMENT_DEPTH) / res;
			const back = 0.5 / res;
			let normal = null;
			for (const sign of [1, -1]) {
				const n = { r: (-dc / length) * sign, c: (dr / length) * sign };
				const probe = at(
					Math.round(mid.r + n.r * depth * 0.5),
					Math.round(mid.c + n.c * depth * 0.5),
				);
				const rear = at(
					Math.round(mid.r - n.r * back),
					Math.round(mid.c - n.c * back),
				);
				if (enemy(probe) && friendly(rear)) {
					normal = n;
					break;
				}
			}
			if (!normal) continue;
			const meet = {
				r: mid.r + normal.r * depth,
				c: mid.c + normal.c * depth,
			};
			const shoulderA = {
				r: a.r - normal.r * back,
				c: a.c - normal.c * back,
			};
			const shoulderB = {
				r: b.r - normal.r * back,
				c: b.c - normal.c * back,
			};
			const shoulderCells = [shoulderA, shoulderB].map((p) =>
				at(Math.round(p.r), Math.round(p.c)),
			);
			const meetCell = at(Math.round(meet.r), Math.round(meet.c));
			if (!shoulderCells.every(friendly) || !enemy(meetCell)) continue;
			const path = new Set();
			rasterLine(tools, shoulderA, meet, path);
			rasterLine(tools, meet, shoulderB, path);
			path.delete(-1);
			const window = {
				row: Math.round(mid.r),
				col: (Math.round(mid.c) + width) % width,
				radius: Math.ceil(length / 2 + depth + back + 2),
			};
			const seed = at(
				Math.round(mid.r + normal.r * depth * 0.4),
				Math.round(mid.c + normal.c * depth * 0.4),
			);
			const cap = Math.ceil((length + 2) * (depth + 2));
			const pocket = floodHostile(tools, [seed], path, window, cap);
			if (pocket.escaped || pocket.cells.length < 4) continue;
			const inside = new Set(pocket.cells);
			let trapped = 0;
			for (const unit of enemyUnits)
				if (inside.has(context.getGridIndex(unit.lat, unit.lng))) trapped++;
			const closureCells = [...path].filter(enemy);
			if (!trapped || !closureCells.length) continue;
			if (
				best &&
				(trapped < best.trapped ||
					(trapped === best.trapped &&
						pocket.cells.length >= best.pocketCells.length))
			)
				continue;
			best = {
				target: point(meetCell),
				shoulders: shoulderCells.map(point),
				closureCells,
				pocketCells: pocket.cells,
				pinTarget: point(at(Math.round(mid.r), Math.round(mid.c))),
				pocketSize: pocket.cells.length,
				trapped,
				window,
			};
		}
	}
	return best;
}
