const SAMPLE_INTERVAL = 250;
const validOwner = (id) => Number.isInteger(id) && id > 0 && id <= 65535;

function checkGrid(frame) {
	const size = frame.gridWidth * frame.gridHeight;
	if (
		!Number.isSafeInteger(frame.gridWidth) ||
		!Number.isSafeInteger(frame.gridHeight) ||
		frame.gridWidth <= 0 ||
		frame.gridHeight <= 0 ||
		!Number.isSafeInteger(size) ||
		size > 0xffffffff
	)
		throw new RangeError(
			"Occupation grid dimensions must be positive integers",
		);
	for (const name of [
		"worldControlMap",
		"deJureMap",
		"landMask",
		...(frame.isWar ? ["dominantSideMap", "primaryOccupierMap"] : []),
	]) {
		if (!frame[name] || frame[name].length < size)
			throw new RangeError(`${name} does not cover the occupation grid`);
	}
	if (frame.isWar && !frame.sovereignSideMap)
		throw new TypeError(
			"Occupation sampling during war requires sovereignSideMap",
		);
	return size;
}

function neighbors(index, width, height, visit) {
	const x = index % width;
	if (x > 0) visit(index - 1);
	if (x + 1 < width) visit(index + 1);
	if (index >= width) visit(index - width);
	if (index + width < width * height) visit(index + width);
}

function regionAnchor(cells, width, height, sumX, sumY) {
	const distances = new Map(cells.map((index) => [index, 0]));
	const queue = [];
	for (const index of cells) {
		let adjacent = 0;
		neighbors(index, width, height, (next) => {
			if (distances.has(next)) adjacent++;
		});
		if (adjacent < 4) {
			distances.set(index, 1);
			queue.push(index);
		}
	}
	let maximum = 1;
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const index = queue[cursor];
		const distance = distances.get(index) + 1;
		neighbors(index, width, height, (next) => {
			if (distances.get(next) === 0) {
				distances.set(next, distance);
				maximum = Math.max(maximum, distance);
				queue.push(next);
			}
		});
	}
	// Prefer interior cells without moving the label far from its centroid.
	const clearance = Math.min(3, maximum);
	const centerX = sumX / cells.length;
	const centerY = sumY / cells.length;
	let best = cells[0];
	let bestDistance = Infinity;
	for (const index of cells) {
		if (distances.get(index) < clearance) continue;
		const distance =
			((index % width) - centerX) ** 2 +
			(Math.floor(index / width) - centerY) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}
	return Object.freeze({ x: best % width, y: Math.floor(best / width) });
}

function buildRegions(candidates, sovereigns, controllers, width, height) {
	const occupied = new Map();
	for (let offset = 0; offset < candidates.length; offset++) {
		if (controllers[offset]) occupied.set(candidates[offset], offset);
	}
	const regions = [];
	for (const [start, offset] of occupied) {
		const sovereignId = sovereigns[offset];
		const controllerId = controllers[offset];
		const cells = [start];
		occupied.delete(start);
		const bounds = { minX: width, maxX: -1, minY: height, maxY: -1 };
		let sumX = 0;
		let sumY = 0;
		for (let cursor = 0; cursor < cells.length; cursor++) {
			const index = cells[cursor];
			const x = index % width;
			const y = Math.floor(index / width);
			sumX += x;
			sumY += y;
			bounds.minX = Math.min(bounds.minX, x);
			bounds.maxX = Math.max(bounds.maxX, x);
			bounds.minY = Math.min(bounds.minY, y);
			bounds.maxY = Math.max(bounds.maxY, y);
			neighbors(index, width, height, (next) => {
				const neighborOffset = occupied.get(next);
				if (
					neighborOffset !== undefined &&
					sovereigns[neighborOffset] === sovereignId &&
					controllers[neighborOffset] === controllerId
				) {
					occupied.delete(next);
					cells.push(next);
				}
			});
		}
		regions.push(
			Object.freeze({
				sovereignId,
				controllerId,
				cells: Object.freeze(cells),
				bounds: Object.freeze(bounds),
				anchor: regionAnchor(cells, width, height, sumX, sumY),
			}),
		);
	}
	return Object.freeze(regions);
}

export function createOccupationRegionCache() {
	let identity;
	let candidates = [];
	let sovereigns = [];
	let controllers;
	let lastSample = -Infinity;
	let lastNow = -Infinity;
	let revision = 0;
	let model = Object.freeze({ revision, regions: Object.freeze([]) });
	const clear = () => {
		identity = undefined;
		candidates = [];
		sovereigns = [];
		controllers = undefined;
		lastSample = -Infinity;
		lastNow = -Infinity;
		model = Object.freeze({ revision: ++revision, regions: Object.freeze([]) });
	};
	return {
		clear,
		get(frame) {
			const ids = frame.source?.territoryOwnerIds;
			if (!ids?.length) {
				if (identity) clear();
				return model;
			}
			if (!Array.isArray(ids) || !ids.every(validOwner))
				throw new TypeError(
					"territoryOwnerIds must contain positive uint16 IDs",
				);
			const size = checkGrid(frame);
			const scope = new Set(ids);
			const scopeKey = [...scope].sort((a, b) => a - b).join(",");
			const nextIdentity = [
				frame.source,
				frame.deJureMap,
				frame.worldControlMap,
				frame.landMask,
				frame.gridWidth,
				frame.gridHeight,
				scopeKey,
			];
			if (!identity || nextIdentity.some((value, i) => value !== identity[i])) {
				clear();
				identity = nextIdentity;
				for (let index = 0; index < size; index++) {
					if (frame.landMask[index] && scope.has(frame.deJureMap[index])) {
						candidates.push(index);
						sovereigns.push(frame.deJureMap[index]);
					}
				}
			}
			const now = Number.isFinite(frame.now) ? frame.now : Date.now();
			const backwards = now < lastNow;
			lastNow = now;
			if (!backwards && now - lastSample < SAMPLE_INTERVAL) return model;
			lastSample = now;
			const sampled = new Uint16Array(candidates.length);
			let changed = !controllers;
			for (let offset = 0; offset < candidates.length; offset++) {
				const index = candidates[offset];
				const sovereign = sovereigns[offset];
				let owner = frame.worldControlMap[index];
				if (
					frame.isWar &&
					frame.landMask[index] === 2 &&
					frame.dominantSideMap[index] >= 0 &&
					frame.dominantSideMap[index] !== frame.sovereignSideMap[owner]
				)
					owner = frame.primaryOccupierMap[index] || owner;
				const liberatedByAlly =
					frame.isWar &&
					frame.sovereignSideMap[sovereign] >= 0 &&
					frame.sovereignSideMap[owner] === frame.sovereignSideMap[sovereign];
				if (
					frame.landMask[index] &&
					validOwner(owner) &&
					owner !== sovereign &&
					!liberatedByAlly
				)
					sampled[offset] = owner;
				if (controllers?.[offset] !== sampled[offset]) changed = true;
			}
			if (changed) {
				controllers = sampled;
				model = Object.freeze({
					revision: ++revision,
					regions: buildRegions(
						candidates,
						sovereigns,
						controllers,
						frame.gridWidth,
						frame.gridHeight,
					),
				});
			}
			return model;
		},
	};
}
