// Web Worker: rebuild frontline direction fields and layouts off the main thread.

function wrappedLngDelta(a, b) {
	let delta = a - b;
	if (delta > 180) delta -= 360;
	else if (delta < -180) delta += 360;
	return delta;
}

function geoDistSq(aLat, aLng, bLat, bLng) {
	const dLat = aLat - bLat;
	const dLng = wrappedLngDelta(aLng, bLng);
	return dLat * dLat + dLng * dLng;
}

function createHostilityChecker(relations, maxSides) {
	return (a, b) =>
		a >= 0 &&
		b >= 0 &&
		a !== b &&
		(!relations || relations[a * maxSides + b] === 1);
}

function buildDirectionField({
	landMask,
	dominantSideMap,
	hostile,
	gridWidth,
	gridHeight,
	gridRes,
}) {
	const started = performance.now();
	const total = gridWidth * gridHeight;
	const frontlineDirLat = new Float32Array(total);
	const frontlineDirLng = new Float32Array(total);
	const sourceCell = new Int32Array(total);
	sourceCell.fill(-1);
	const queue = new Int32Array(total);
	let qHead = 0;
	let qTail = 0;

	for (let i = 0; i < total; i++) {
		if (landMask[i] !== 2) continue;
		const mySide = dominantSideMap[i];
		if (mySide < 0) continue;
		const x = i % gridWidth;
		let isFront = x < gridWidth - 1 && hostile(mySide, dominantSideMap[i + 1]);
		if (!isFront && x > 0) isFront = hostile(mySide, dominantSideMap[i - 1]);
		if (!isFront && i + gridWidth < total) {
			isFront = hostile(mySide, dominantSideMap[i + gridWidth]);
		}
		if (!isFront && i >= gridWidth) {
			isFront = hostile(mySide, dominantSideMap[i - gridWidth]);
		}
		if (isFront) {
			queue[qTail++] = i;
			sourceCell[i] = i;
		}
	}

	const offsets = [1, -1, gridWidth, -gridWidth];
	while (qHead < qTail) {
		const cur = queue[qHead++];
		const src = sourceCell[cur];
		const cy = Math.floor(cur / gridWidth);
		const cx = cur % gridWidth;
		const sy = Math.floor(src / gridWidth);
		const sx = src % gridWidth;
		const dLat = (sy - cy) * gridRes;
		const dLng = (sx - cx) * gridRes;
		const magnitude = Math.sqrt(dLat * dLat + dLng * dLng);
		if (magnitude > 0) {
			frontlineDirLat[cur] = dLat / magnitude;
			frontlineDirLng[cur] = dLng / magnitude;
		}

		for (let d = 0; d < offsets.length; d++) {
			const neighbor = cur + offsets[d];
			if (neighbor < 0 || neighbor >= total) continue;
			if (d < 2 && Math.floor(neighbor / gridWidth) !== cy) continue;
			if (sourceCell[neighbor] !== -1 || landMask[neighbor] === 0) continue;
			sourceCell[neighbor] = src;
			queue[qTail++] = neighbor;
		}
	}

	return {
		frontlineDirLat,
		frontlineDirLng,
		durationMs: performance.now() - started,
	};
}

function collectFrontierSets({
	landMask,
	dominantSideMap,
	hostile,
	gridWidth,
	gridHeight,
}) {
	const total = gridWidth * gridHeight;
	const frontierSets = new Map();
	for (let i = 0; i < total; i++) {
		if (landMask[i] !== 2) continue;
		const side = dominantSideMap[i];
		if (side < 0) continue;
		const x = i % gridWidth;
		const neighbors = [];
		if (x < gridWidth - 1) neighbors.push(i + 1);
		if (x > 0) neighbors.push(i - 1);
		if (i + gridWidth < total) neighbors.push(i + gridWidth);
		if (i >= gridWidth) neighbors.push(i - gridWidth);
		for (const neighbor of neighbors) {
			if (landMask[neighbor] !== 2) continue;
			const otherSide = dominantSideMap[neighbor];
			if (!hostile(side, otherSide)) continue;
			const key =
				side < otherSide ? `${side}_${otherSide}` : `${otherSide}_${side}`;
			let cells = frontierSets.get(key);
			if (!cells) {
				cells = new Set();
				frontierSets.set(key, cells);
			}
			cells.add(i);
			cells.add(neighbor);
			break;
		}
	}
	return frontierSets;
}

function buildNeighborOffsets(gridWidth) {
	const offsets = [];
	for (let dy = -2; dy <= 2; dy++) {
		for (let dx = -2; dx <= 2; dx++) {
			if (dx === 0 && dy === 0) continue;
			if (dx * dx + dy * dy >= 9) continue;
			offsets.push({ dx, dy, offset: dy * gridWidth + dx });
		}
	}
	return offsets;
}

function getLocalNeighbors(cell, cellSet, gridWidth, gridHeight, offsets) {
	const x = cell % gridWidth;
	const y = Math.floor(cell / gridWidth);
	const neighbors = [];
	for (const item of offsets) {
		const nx = x + item.dx;
		const ny = y + item.dy;
		if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
		const neighbor = cell + item.offset;
		if (cellSet.has(neighbor)) neighbors.push(neighbor);
	}
	return neighbors;
}

function buildPolylines({ frontierSets, gridWidth, gridHeight, gridRes }) {
	const polylines = {};
	const offsets = buildNeighborOffsets(gridWidth);
	for (const [pairKey, cellSet] of frontierSets) {
		const undiscovered = new Set(cellSet);
		const keyCollisions = new Map();
		while (undiscovered.size > 0) {
			const seed = undiscovered.values().next().value;
			const component = new Set([seed]);
			const queue = [seed];
			undiscovered.delete(seed);
			for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
				const cell = queue[queueIndex];
				for (const neighbor of getLocalNeighbors(
					cell,
					cellSet,
					gridWidth,
					gridHeight,
					offsets,
				)) {
					if (!undiscovered.delete(neighbor)) continue;
					component.add(neighbor);
					queue.push(neighbor);
				}
			}

			let start = seed;
			for (const cell of component) {
				const degree = getLocalNeighbors(
					cell,
					component,
					gridWidth,
					gridHeight,
					offsets,
				).length;
				if (degree <= 1) {
					start = cell;
					break;
				}
			}

			// Depth-first traversal with explicit backtracking yields one continuous
			// bounded-neighbor walk per connected theater. Repeated backtrack points
			// are intentional: they prevent visual jumps across branches.
			const segment = [];
			const visited = new Set([start]);
			const stack = [start];
			const pushPoint = (cell) => {
				const y = Math.floor(cell / gridWidth);
				const x = cell % gridWidth;
				segment.push({
					lat: y * gridRes - 90,
					lng: x * gridRes - 180,
				});
			};
			pushPoint(start);
			while (stack.length > 0) {
				const current = stack[stack.length - 1];
				const neighbors = getLocalNeighbors(
					current,
					component,
					gridWidth,
					gridHeight,
					offsets,
				).filter((neighbor) => !visited.has(neighbor));
				if (neighbors.length === 0) {
					stack.pop();
					if (stack.length > 0) pushPoint(stack[stack.length - 1]);
					continue;
				}
				const cx = current % gridWidth;
				const cy = Math.floor(current / gridWidth);
				neighbors.sort((a, b) => {
					const ax = a % gridWidth;
					const ay = Math.floor(a / gridWidth);
					const bx = b % gridWidth;
					const by = Math.floor(b / gridWidth);
					return (
						(ax - cx) ** 2 + (ay - cy) ** 2 - ((bx - cx) ** 2 + (by - cy) ** 2)
					);
				});
				const next = neighbors[0];
				visited.add(next);
				stack.push(next);
				pushPoint(next);
			}
			if (segment.length > 0) {
				let xSum = 0;
				let ySum = 0;
				for (const cell of component) {
					xSum += cell % gridWidth;
					ySum += Math.floor(cell / gridWidth);
				}
				const latBand = Math.floor(
					((ySum / component.size) * gridRes - 90) / 10,
				);
				const lngBand = Math.floor(
					((xSum / component.size) * gridRes - 180) / 10,
				);
				const baseKey = `${pairKey}_${latBand}_${lngBand}`;
				const collisionIndex = keyCollisions.get(baseKey) || 0;
				keyCollisions.set(baseKey, collisionIndex + 1);
				const stableKey =
					collisionIndex === 0 ? baseKey : `${baseKey}_${collisionIndex}`;
				polylines[stableKey] = segment;
			}
		}
	}
	return polylines;
}

function sampleFront(polyline) {
	const samples = [];
	const stride = Math.max(1, Math.floor(polyline.length / 24));
	for (let index = 0; index < polyline.length; index += stride) {
		samples.push({ point: polyline[index], index });
	}
	if (
		polyline.length > 0 &&
		samples[samples.length - 1]?.index !== polyline.length - 1
	) {
		samples.push({
			point: polyline[polyline.length - 1],
			index: polyline.length - 1,
		});
	}
	return samples;
}

function assignFrontlineSlots(polylines, units, sideCount) {
	const assignments = units.map((unit) => ({ unitId: unit.id, pairKey: null }));
	const assignmentById = new Map(
		assignments.map((entry) => [entry.unitId, entry]),
	);
	const sideFronts = Array.from({ length: sideCount }, () => []);
	const sideUnits = Array.from({ length: sideCount }, () => []);
	const frontSamples = new Map();

	for (const [key, polyline] of Object.entries(polylines)) {
		const [a, b] = key.split("_").map(Number);
		if (sideFronts[a]) sideFronts[a].push(key);
		if (sideFronts[b]) sideFronts[b].push(key);
		frontSamples.set(key, sampleFront(polyline));
	}
	for (const unit of units) {
		if (unit.garrisonExcluded || unit.deployTicks > 0) continue;
		if (sideUnits[unit.sideIndex] && sideFronts[unit.sideIndex]?.length > 0) {
			sideUnits[unit.sideIndex].push(unit);
		}
	}

	const distanceCache = new Map();
	const distanceToFront = (unit, key) => {
		const cacheKey = `${unit.id}|${key}`;
		const cached = distanceCache.get(cacheKey);
		if (cached) return cached;
		let bestDistSq = Infinity;
		let bestIndex = 0;
		for (const sample of frontSamples.get(key) || []) {
			const distSq = geoDistSq(
				unit.lat,
				unit.lng,
				sample.point.lat,
				sample.point.lng,
			);
			if (distSq < bestDistSq) {
				bestDistSq = distSq;
				bestIndex = sample.index;
			}
		}
		const result = { distSq: bestDistSq, nearestIndex: bestIndex };
		distanceCache.set(cacheKey, result);
		return result;
	};

	for (let sideIndex = 0; sideIndex < sideCount; sideIndex++) {
		const fronts = sideFronts[sideIndex];
		const candidates = sideUnits[sideIndex];
		if (!fronts?.length || !candidates?.length) continue;

		const totalLength = fronts.reduce(
			(sum, key) => sum + (polylines[key]?.length || 0),
			0,
		);
		if (totalLength <= 0) continue;
		const sortedFronts = [...fronts].sort(
			(a, b) => polylines[b].length - polylines[a].length,
		);
		const desired = new Map();
		let desiredSum = 0;
		if (candidates.length <= fronts.length) {
			for (const key of fronts) desired.set(key, 0);
			for (let i = 0; i < candidates.length; i++)
				desired.set(sortedFronts[i], 1);
			desiredSum = candidates.length;
		} else {
			for (const key of fronts) {
				const count = Math.max(
					1,
					Math.floor((candidates.length * polylines[key].length) / totalLength),
				);
				desired.set(key, count);
				desiredSum += count;
			}
		}
		for (let i = 0; i < candidates.length - desiredSum; i++) {
			const key = sortedFronts[i % sortedFronts.length];
			desired.set(key, desired.get(key) + 1);
		}

		const assigned = new Map(fronts.map((key) => [key, []]));
		const leftovers = [];
		for (const unit of candidates) {
			const ranked = fronts
				.map((key) => ({ key, ...distanceToFront(unit, key) }))
				.sort((a, b) => a.distSq - b.distSq);
			const previous = unit.previousPairKey;
			const previousRank = ranked.find((item) => item.key === previous);
			if (
				previousRank &&
				assigned.get(previous).length < desired.get(previous) &&
				previousRank.distSq <= ranked[0].distSq * 1.8 + 4
			) {
				assigned.get(previous).push(unit);
			} else {
				leftovers.push({ unit, ranked });
			}
		}

		const rankedPairs = [];
		for (const leftover of leftovers) {
			for (const rank of leftover.ranked) {
				rankedPairs.push({ unit: leftover.unit, ...rank });
			}
		}
		rankedPairs.sort((a, b) => a.distSq - b.distSq);
		const placed = new Set();
		for (const candidate of rankedPairs) {
			if (placed.has(candidate.unit.id)) continue;
			const bucket = assigned.get(candidate.key);
			if (bucket.length >= desired.get(candidate.key)) continue;
			bucket.push(candidate.unit);
			placed.add(candidate.unit.id);
		}
		for (const leftover of leftovers) {
			if (placed.has(leftover.unit.id)) continue;
			assigned.get(leftover.ranked[0].key).push(leftover.unit);
		}

		for (const [key, bucket] of assigned) {
			const polyline = polylines[key];
			if (!polyline?.length || bucket.length === 0) continue;
			bucket.sort((a, b) => {
				const aIndex =
					a.previousPairKey === key
						? a.previousSegmentIdx || 0
						: distanceToFront(a, key).nearestIndex;
				const bIndex =
					b.previousPairKey === key
						? b.previousSegmentIdx || 0
						: distanceToFront(b, key).nearestIndex;
				return aIndex - bIndex;
			});
			const step = polyline.length / bucket.length;
			for (let i = 0; i < bucket.length; i++) {
				const segmentIdx = Math.min(
					polyline.length - 1,
					Math.floor((i + 0.5) * step),
				);
				const point = polyline[segmentIdx];
				Object.assign(assignmentById.get(bucket[i].id), {
					pairKey: key,
					segmentIdx,
					targetLat: point.lat,
					targetLng: point.lng,
				});
			}
		}
	}
	return assignments;
}

function buildLayout(input) {
	const started = performance.now();
	const frontierSets = collectFrontierSets(input);
	const polylines = buildPolylines({
		frontierSets,
		gridWidth: input.gridWidth,
		gridHeight: input.gridHeight,
		gridRes: input.gridRes,
	});
	const slotAssignments = assignFrontlineSlots(
		polylines,
		input.units || [],
		input.sideCount || input.maxSides,
	);
	return {
		polylines,
		slotAssignments,
		durationMs: performance.now() - started,
	};
}

self.onmessage = (event) => {
	const started = performance.now();
	const {
		requestId = 0,
		generation = 0,
		territoryGeneration = 0,
		includeField = true,
		includeLayout = false,
	} = event.data || {};
	try {
		const {
			landMask: landMaskBuffer,
			dominantSideMap: dominantSideMapBuffer,
			hostilityMatrix,
			maxSides = 8,
			gridWidth,
			gridHeight,
			gridRes,
			units,
			sideCount,
		} = event.data;
		if (
			!landMaskBuffer ||
			!dominantSideMapBuffer ||
			!gridWidth ||
			!gridHeight
		) {
			throw new Error("Invalid input");
		}
		const landMask = new Uint8Array(landMaskBuffer);
		const dominantSideMap = new Int8Array(dominantSideMapBuffer);
		const relations = hostilityMatrix ? new Uint8Array(hostilityMatrix) : null;
		const hostile = createHostilityChecker(relations, maxSides);
		const input = {
			landMask,
			dominantSideMap,
			hostile,
			gridWidth,
			gridHeight,
			gridRes,
			units,
			sideCount,
			maxSides,
		};
		const response = {
			requestId,
			generation,
			territoryGeneration,
			includeField,
			includeLayout,
		};
		const transfers = [];
		if (includeField) {
			const field = buildDirectionField(input);
			response.fieldDurationMs = field.durationMs;
			response.frontlineDirLat = field.frontlineDirLat.buffer;
			response.frontlineDirLng = field.frontlineDirLng.buffer;
			transfers.push(
				field.frontlineDirLat.buffer,
				field.frontlineDirLng.buffer,
			);
		}
		if (includeLayout) {
			const layout = buildLayout(input);
			response.layoutDurationMs = layout.durationMs;
			response.polylines = layout.polylines;
			response.slotAssignments = layout.slotAssignments;
		}
		response.durationMs = performance.now() - started;
		self.postMessage(response, transfers);
	} catch (error) {
		self.postMessage({
			requestId,
			generation,
			territoryGeneration,
			includeField,
			includeLayout,
			durationMs: performance.now() - started,
			error: error.message,
		});
	}
};
