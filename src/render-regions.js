// Country geometry is segmented once per world chunk. Camera movement joins
// cached components along chunk edges instead of flood-filling visible land.
const SIZE = 32;
const LIMIT = 2048;

export function createRegionChunkCache() {
	const chunks = new Map();
	let key;
	let world;
	let land;
	let revision = 0;
	let view;
	let built = 0;
	const clear = () => {
		chunks.clear();
		key = undefined;
		view = undefined;
		world = undefined;
		land = undefined;
		revision++;
	};
	const getChunk = (frame, cx, cy, step) => {
		const columns = Math.ceil(frame.gridWidth / SIZE);
		const id = cy * columns + cx;
		let chunk = chunks.get(id);
		if (chunk) {
			chunks.delete(id);
			chunks.set(id, chunk);
			return chunk;
		}
		const x0 = cx * SIZE,
			y0 = cy * SIZE;
		const width = Math.min(SIZE, frame.gridWidth - x0),
			height = Math.min(SIZE, frame.gridHeight - y0);
		const labels = new Uint16Array(SIZE * SIZE);
		const owners = new Uint16Array(labels.length);
		for (let y = 0; y < height; y += step) {
			for (let x = 0; x < width; x += step) {
				const index = (y0 + y) * frame.gridWidth + x0 + x;
				let owner = frame.worldControlMap[index];
				if (
					frame.isWar &&
					frame.landMask[index] === 2 &&
					frame.dominantSideMap[index] !== -1 &&
					frame.dominantSideMap[index] !== frame.sovereignSideMap[owner]
				)
					owner = frame.primaryOccupierMap[index] || owner;
				owners[y * SIZE + x] = owner;
			}
		}
		const components = [];
		const queue = new Uint16Array(SIZE * SIZE);
		for (let y = 0; y < height; y += step) {
			for (let x = 0; x < width; x += step) {
				const start = y * SIZE + x;
				if (labels[start] || !owners[start]) continue;
				const label = components.length + 1;
				const component = {
					id: owners[start],
					pixels: [],
					columns: new Map(),
					count: 0,
					latSum: 0,
					lngSum: 0,
					regMinX: Infinity,
					regMaxX: -Infinity,
					regMinY: Infinity,
					regMaxY: -Infinity,
				};
				let length = 1;
				queue[0] = start;
				labels[start] = label;
				const visit = (next) => {
					if (!labels[next] && owners[next] === component.id) {
						labels[next] = label;
						queue[length++] = next;
					}
				};
				while (length) {
					const local = queue[--length];
					const ly = Math.floor(local / SIZE),
						lx = local % SIZE;
					const gx = x0 + lx,
						gy = y0 + ly;
					const lat = gy * frame.CONFIG.GRID_RES - 90,
						lng = gx * frame.CONFIG.GRID_RES - 180;
					component.pixels.push(gy * frame.gridWidth + gx);
					component.count++;
					component.latSum += lat;
					component.lngSum += lng;
					component.regMinX = Math.min(component.regMinX, gx);
					component.regMaxX = Math.max(component.regMaxX, gx);
					component.regMinY = Math.min(component.regMinY, gy);
					component.regMaxY = Math.max(component.regMaxY, gy);
					let column = component.columns.get(gx);
					if (!column) {
						column = { latSum: 0, lngSum: 0, count: 0 };
						component.columns.set(gx, column);
					}
					column.latSum += lat;
					column.lngSum += lng;
					column.count++;

					if (lx >= step) visit(local - step);
					if (lx + step < width) visit(local + step);
					if (ly >= step) visit(local - step * SIZE);
					if (ly + step < height) visit(local + step * SIZE);
				}
				component.pixels = new Uint32Array(component.pixels);
				components.push(component);
			}
		}
		chunk = { id, cx, cy, width, height, labels, owners, components };
		chunks.set(id, chunk);
		if (chunks.size > LIMIT) chunks.delete(chunks.keys().next().value);
		built++;
		return chunk;
	};
	return {
		clear,
		invalidateTiles(tileKeys) {
			for (const id of tileKeys) chunks.delete(id);
			revision++;
			view = undefined;
		},
		get(frame) {
			const step =
				frame.viewMode === "FLAG"
					? 1
					: frame.currentZoom < 4
						? 4
						: frame.currentZoom < 6
							? 2
							: 1;
			const nextKey = [
				frame.gridWidth,
				frame.gridHeight,
				frame.CONFIG.GRID_RES,
				step,
				frame.isWar ? 1 : 0,
				frame.viewMode === "FLAG" ? 1 : 0,
				frame.sideKey,
			].join(":");
			if (
				nextKey !== key ||
				world !== frame.worldControlMap ||
				land !== frame.landMask
			) {
				clear();
				key = nextKey;
				world = frame.worldControlMap;
				land = frame.landMask;
			}
			const minX = Math.floor(Math.max(0, frame.xMin - 25) / SIZE),
				maxX = Math.floor(
					Math.min(frame.gridWidth - 1, frame.xMax + 25) / SIZE,
				);
			const minY = Math.floor(Math.max(0, frame.yMin - 25) / SIZE),
				maxY = Math.floor(
					Math.min(frame.gridHeight - 1, frame.yMax + 25) / SIZE,
				);
			const viewKey = `${minX}:${maxX}:${minY}:${maxY}:${revision}`;
			if (view?.key === viewKey) return view.regions;
			const visible = new Map(),
				nodes = [],
				offsets = new Map();
			const columns = Math.ceil(frame.gridWidth / SIZE);
			for (let cy = minY; cy <= maxY; cy++) {
				for (let cx = minX; cx <= maxX; cx++) {
					const chunk = getChunk(frame, cx, cy, step);
					visible.set(chunk.id, chunk);
					offsets.set(chunk.id, nodes.length);
					for (const component of chunk.components) nodes.push(component);
				}
			}
			const parents = new Int32Array(nodes.length);
			for (let i = 0; i < parents.length; i++) parents[i] = i;
			const root = (index) => {
				let current = index;
				while (parents[current] !== current) {
					parents[current] = parents[parents[current]];
					current = parents[current];
				}
				return current;
			};
			const join = (a, localA, b, localB) => {
				if (!a.owners[localA] || a.owners[localA] !== b.owners[localB]) return;
				const first = root(offsets.get(a.id) + a.labels[localA] - 1);
				const second = root(offsets.get(b.id) + b.labels[localB] - 1);
				if (first !== second) parents[second] = first;
			};
			for (const chunk of visible.values()) {
				const right = chunk.cx < maxX ? visible.get(chunk.id + 1) : null;
				const below = chunk.cy < maxY ? visible.get(chunk.id + columns) : null;
				if (right)
					for (let y = 0; y < chunk.height; y += step)
						join(chunk, y * SIZE + SIZE - step, right, y * SIZE);
				if (below)
					for (let x = 0; x < chunk.width; x += step)
						join(chunk, (SIZE - step) * SIZE + x, below, x);
			}
			const groups = new Map();
			for (let i = 0; i < nodes.length; i++) {
				const component = nodes[i],
					id = root(i);
				let group = groups.get(id);
				if (!group) {
					group = {
						id: component.id,
						components: [],
						pixels: [],
						count: 0,
						latSum: 0,
						lngSum: 0,
						regMinX: Infinity,
						regMaxX: -Infinity,
						regMinY: Infinity,
						regMaxY: -Infinity,
					};
					groups.set(id, group);
				}
				group.components.push(component);
				group.count += component.count;
				group.latSum += component.latSum;
				group.lngSum += component.lngSum;
				group.regMinX = Math.min(group.regMinX, component.regMinX);
				group.regMaxX = Math.max(group.regMaxX, component.regMaxX);
				group.regMinY = Math.min(group.regMinY, component.regMinY);
				group.regMaxY = Math.max(group.regMaxY, component.regMaxY);
			}
			const regions = [];
			for (const group of groups.values()) {
				const bins = Array.from({ length: 4 }, () => ({
					latSum: 0,
					lngSum: 0,
					count: 0,
				}));
				const width = Math.max(1, group.regMaxX - group.regMinX + 1);
				for (const component of group.components) {
					if (frame.viewMode === "FLAG")
						for (const pixel of component.pixels) group.pixels.push(pixel);
					for (const [x, column] of component.columns) {
						const bin =
							bins[Math.min(3, Math.floor(((x - group.regMinX) / width) * 4))];
						bin.latSum += column.latSum;
						bin.lngSum += column.lngSum;
						bin.count += column.count;
					}
				}
				const centerLat = group.latSum / group.count,
					centerLng = group.lngSum / group.count;
				for (let i = 0; i < bins.length; i++) {
					if (bins[i].count) continue;
					let left, right;
					for (let j = i - 1; j >= 0; j--)
						if (bins[j].count) {
							left = bins[j];
							break;
						}
					for (let j = i + 1; j < 4; j++)
						if (bins[j].count) {
							right = bins[j];
							break;
						}
					const neighbor = left || right;
					bins[i] = {
						latSum:
							left && right
								? (left.latSum / left.count + right.latSum / right.count) / 2
								: neighbor
									? neighbor.latSum / neighbor.count
									: centerLat,
						lngSum:
							left && right
								? (left.lngSum / left.count + right.lngSum / right.count) / 2
								: neighbor
									? neighbor.lngSum / neighbor.count
									: centerLng,
						count: 1,
					};
				}
				delete group.components;
				group.bins = bins;
				regions.push(group);
			}
			view = { key: viewKey, regions };
			return regions;
		},
		get stats() {
			return { built, chunks: chunks.size };
		},
	};
}
