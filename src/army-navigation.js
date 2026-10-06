import { normalizeLongitudeDelta } from "./geographic-math.js";

export const ARMY_NAVIGATION = Object.freeze({
	NODE_BUDGET: 4096,
	MAX_FIELDS: 64,
	MAX_FIELD_NODES: 70000,
	FIELD_IDLE_TICKS: 60,
	STALL_TICKS: 180,
});

const FRIENDLY_ORDER_TYPES = new Set(["HOLD", "RESERVE", "WITHDRAW", "SCREEN"]);

export function armyDistanceSq(a, b) {
	return (a.lat - b.lat) ** 2 + normalizeLongitudeDelta(a.lng - b.lng) ** 2;
}

// A shared reverse Dijkstra field. Sparse storage avoids a global-sized array
// per formation; work is resumed under one deterministic budget per tick.
export function createArmyNavigator(context) {
	const fields = new Map();
	let lastTick = -1;
	let expanded = 0;
	let costs = new Map();
	let world = null;
	const seeds = new Map();
	const resolution = () => context.CONFIG.GRID_RES;
	const point = (idx) => ({
		lat: (Math.floor(idx / context.gridWidth) + 0.5) * resolution() - 90,
		lng: ((idx % context.gridWidth) + 0.5) * resolution() - 180,
	});
	function owner(idx) {
		const side = context.dominantSideMap[idx];
		return side >= 0
			? side
			: context.countryToSideMap.get(context.worldControlMap[idx]);
	}
	function passable(idx, side, friendlyOnly = false) {
		if (idx < 0 || idx >= context.landMask.length || !context.landMask[idx])
			return false;
		const controlled = owner(idx);
		return (
			controlled === side ||
			(!friendlyOnly &&
				controlled != null &&
				context.areSidesHostile(side, controlled))
		);
	}
	function push(heap, item) {
		let index = heap.length;
		heap.push(item);
		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (heap[parent].cost <= item.cost) break;
			heap[index] = heap[parent];
			index = parent;
		}
		heap[index] = item;
	}
	function pop(heap) {
		const first = heap[0];
		const last = heap.pop();
		if (heap.length) {
			let index = 0;
			while (index * 2 + 1 < heap.length) {
				let child = index * 2 + 1;
				if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost)
					child++;
				if (heap[child].cost >= last.cost) break;
				heap[index] = heap[child];
				index = child;
			}
			heap[index] = last;
		}
		return first;
	}
	function entryCost(idx, side) {
		const cell = costs.get(idx);
		let threat = 0;
		if (cell)
			for (const [other, power] of cell.power) {
				if (context.areSidesHostile(side, other)) threat += power;
			}
		return (
			1 +
			Math.min(6, threat * 0.35) +
			Math.min(3, (cell?.count || 0) * 0.08) +
			Math.max(0, context.terrainMask?.[idx] || 0) * 2
		);
	}
	function reset() {
		fields.clear();
		seeds.clear();
		costs.clear();
		lastTick = -1;
		world = context.landMask;
	}
	function beginTick(tick) {
		if (world !== context.landMask) reset();
		if (tick === lastTick) return;
		lastTick = tick;
		expanded = 0;
		if (tick % 30 === 0 || !costs.size) {
			costs = new Map();
			for (const unit of context.units) {
				if (unit.health <= 0 || unit.deployTicks > 0 || unit.isAtSea) continue;
				const idx = context.getGridIndex(unit.lat, unit.lng);
				if (idx < 0) continue;
				let cell = costs.get(idx);
				if (!cell) {
					cell = { count: 0, power: new Map() };
					costs.set(idx, cell);
				}
				cell.count++;
				cell.power.set(
					unit.sideIndex,
					(cell.power.get(unit.sideIndex) || 0) +
						Math.max(0, unit.health / (unit.maxHealth || 100)),
				);
			}
		}
		for (const [key, field] of fields)
			if (tick - field.used > ARMY_NAVIGATION.FIELD_IDLE_TICKS)
				fields.delete(key);
		const active = [...fields.values()].filter(
			(field) => field.heap.length && !field.exhausted,
		);
		const quota = Math.max(
			1,
			Math.floor(ARMY_NAVIGATION.NODE_BUDGET / Math.max(1, active.length)),
		);
		for (const field of active) {
			let visits = 0;
			while (
				field.heap.length &&
				visits < quota &&
				expanded < ARMY_NAVIGATION.NODE_BUDGET
			) {
				const current = pop(field.heap);
				visits++;
				expanded++;
				if (
					field.distance.get(current.idx) !== current.cost ||
					field.closed.has(current.idx)
				)
					continue;
				field.closed.add(current.idx);
				if (field.closed.size >= ARMY_NAVIGATION.MAX_FIELD_NODES) {
					field.exhausted = true;
					break;
				}
				// Entry cost depends only on the expanded cell, so it is shared by
				// all four neighbors. Visit order: west, east, south row, north row.
				const width = context.gridWidth;
				const row = Math.floor(current.idx / width);
				const col = current.idx % width;
				const wraps = width * resolution() >= 359.9;
				let cost = -1;
				for (let n = 0; n < 4; n++) {
					let idx;
					if (n === 0) {
						if (col > 0) idx = current.idx - 1;
						else if (wraps) idx = row * width + width - 1;
						else continue;
					} else if (n === 1) {
						if (col + 1 < width) idx = current.idx + 1;
						else if (wraps) idx = row * width;
						else continue;
					} else if (n === 2) {
						if (row > 0) idx = current.idx - width;
						else continue;
					} else if (row + 1 < context.gridHeight) idx = current.idx + width;
					else continue;
					if (!passable(idx, field.side, field.friendlyOnly)) continue;
					if (cost < 0)
						cost = current.cost + entryCost(current.idx, field.side);
					if (cost >= (field.distance.get(idx) ?? Infinity)) continue;
					field.distance.set(idx, cost);
					field.next.set(idx, current.idx);
					push(field.heap, { idx, cost });
				}
			}
		}
	}
	const offsetCache = new Map();
	function safePosition(
		target,
		side,
		friendlyOnly = false,
		radius = 6,
		occupied = null,
	) {
		if (!target) return null;
		const center = context.getGridIndex(target.lat, target.lng);
		if (center < 0) return null;
		const row = Math.floor(center / context.gridWidth),
			col = center % context.gridWidth;
		let offsets = offsetCache.get(radius);
		if (!offsets) {
			offsets = [];
			for (let dr = -radius; dr <= radius; dr++)
				for (let dc = -radius; dc <= radius; dc++)
					offsets.push({ dr, dc, score: dr * dr + dc * dc });
			offsets.sort((a, b) => a.score - b.score || a.dr - b.dr || a.dc - b.dc);
			offsetCache.set(radius, offsets);
		}
		for (const { dr, dc } of offsets) {
			const r = row + dr,
				rawCol = col + dc;
			if (
				r < 0 ||
				r >= context.gridHeight ||
				(context.gridWidth * resolution() < 359.9 &&
					(rawCol < 0 || rawCol >= context.gridWidth))
			)
				continue;
			const c = (rawCol + context.gridWidth) % context.gridWidth,
				idx = r * context.gridWidth + c;
			if (!passable(idx, side, friendlyOnly) || occupied?.has(idx)) continue;
			occupied?.add(idx);
			return point(idx);
		}
		return null;
	}
	function clearLine(start, end, side, friendlyOnly = false) {
		const delta = normalizeLongitudeDelta(end.lng - start.lng);
		const steps = Math.ceil(
			Math.max(Math.abs(end.lat - start.lat), Math.abs(delta)) /
				(resolution() * 0.4),
		);
		// Long routes must use the shared field rather than scan per unit per tick.
		if (steps > 32) return false;
		for (let s = 1; s <= steps; s++) {
			if (
				!passable(
					context.getGridIndex(
						start.lat + ((end.lat - start.lat) * s) / steps,
						start.lng + (delta * s) / steps,
					),
					side,
					friendlyOnly,
				)
			)
				return false;
		}
		return true;
	}
	function direction(unit, order, tick) {
		const start = context.getGridIndex(unit.lat, unit.lng);
		// A retreat may start on hostile ground; block neutral access, while allowing
		// the formation to escape to its already validated friendly destination.
		const friendlyOrder =
			order.friendlyOnly || FRIENDLY_ORDER_TYPES.has(order.type);
		const friendlyOnly = friendlyOrder && owner(start) === unit.sideIndex;
		const goal = context.getGridIndex(order.target.lat, order.target.lng);
		if (friendlyOrder && owner(goal) !== unit.sideIndex)
			return { status: "INVALID_DESTINATION" };
		if (!passable(goal, unit.sideIndex, friendlyOnly))
			return { status: "INVALID_DESTINATION" };
		let tracking = unit._armyNavigation;
		if (!tracking || tracking.signature !== order.signature) {
			tracking = {
				signature: order.signature,
				best: Infinity,
				progressTick: tick,
				lastCell: start,
				visits: [],
				replans: 0,
			};
			unit._armyNavigation = tracking;
		}
		const distance = armyDistanceSq(unit, order.target);
		if (
			distance <
			(order.arrivalRadius || Math.min(0.05, resolution() * 0.2)) ** 2
		)
			return { status: "ARRIVED" };
		if (distance < tracking.best - (resolution() * 0.1) ** 2) {
			tracking.best = distance;
			tracking.progressTick = tick;
		}
		if (tracking.lastCell !== start) {
			tracking.visits.push(start);
			if (tracking.visits.length > 12) tracking.visits.shift();
			tracking.lastCell = start;
		}
		let startVisits = 0;
		for (const cell of tracking.visits) if (cell === start) startVisits++;
		const loop = startVisits >= 3;
		if (
			(loop || tick - tracking.progressTick >= ARMY_NAVIGATION.STALL_TICKS) &&
			tick - (unit.lastCombatTick || -999) > 30
		) {
			tracking.replans++;
			tracking.progressTick = tick;
			tracking.visits = [];
			tracking.waypoint = null;
			tracking.path = null;
			tracking.routeEpoch = tick;
		}
		let waypoint;
		const direct =
			distance <= (resolution() * 12) ** 2 &&
			clearLine(unit, order.target, unit.sideIndex, friendlyOnly);
		const pathIndex = direct ? -1 : (tracking.path?.indexOf(start) ?? -1);
		if (direct) waypoint = order.target;
		else if (pathIndex >= 0 && pathIndex + 1 < tracking.path.length) {
			const next = tracking.path[pathIndex + 1];
			if (passable(next, unit.sideIndex, friendlyOnly)) {
				waypoint = point(next);
				if (!clearLine(unit, waypoint, unit.sideIndex, friendlyOnly))
					waypoint = point(start);
			} else {
				tracking.path = null;
				return { status: "BLOCKED" };
			}
		} else {
			// Neighboring formation slots share one field goal; precise approach is local.
			const bucket = 8;
			const row = Math.floor(goal / context.gridWidth),
				col = goal % context.gridWidth;
			const anchor = {
				lat:
					(Math.floor(row / bucket) * bucket + bucket / 2) * resolution() - 90,
				lng:
					(Math.floor(col / bucket) * bucket + bucket / 2) * resolution() - 180,
			};
			const seedKey = `${unit.sideIndex}:${Math.floor(row / bucket)}:${Math.floor(col / bucket)}:${friendlyOnly}`;
			let seedPoint = seeds.get(seedKey);
			if (
				!seedPoint ||
				!passable(
					context.getGridIndex(seedPoint.lat, seedPoint.lng),
					unit.sideIndex,
					friendlyOnly,
				)
			) {
				seedPoint =
					safePosition(anchor, unit.sideIndex, friendlyOnly, bucket) ||
					order.target;
				if (!clearLine(seedPoint, order.target, unit.sideIndex, friendlyOnly))
					seedPoint = order.target;
				if (seeds.size > 256) seeds.clear();
				seeds.set(seedKey, seedPoint);
			}
			if (!clearLine(seedPoint, order.target, unit.sideIndex, friendlyOnly))
				seedPoint = order.target;
			const seed = context.getGridIndex(seedPoint.lat, seedPoint.lng);
			const key = `${unit.sideIndex}:${seed}:${friendlyOnly}`;
			let field = fields.get(key);
			if (tracking.routeEpoch === tick && field) {
				fields.delete(key);
				field = null;
			}
			if (!field) {
				if (fields.size >= ARMY_NAVIGATION.MAX_FIELDS) {
					const oldest = [...fields.entries()]
						.filter(([, item]) => tick - item.used > 30)
						.sort((a, b) => a[1].used - b[1].used)[0];
					if (!oldest) {
						tracking.progressTick = tick;
						return { status: "ROUTE_PENDING" };
					}
					fields.delete(oldest[0]);
				}
				field = {
					side: unit.sideIndex,
					friendlyOnly,
					used: tick,
					heap: [{ idx: seed, cost: 0 }],
					distance: new Map([[seed, 0]]),
					next: new Map(),
					closed: new Set(),
					exhausted: false,
				};
				fields.set(key, field);
			}
			field.used = tick;
			if (!field.closed.has(start)) {
				tracking.progressTick = tick;
				return {
					status:
						field.exhausted || !field.heap.length
							? "UNREACHABLE"
							: "ROUTE_PENDING",
				};
			}
			const next = field.next.get(start);
			tracking.path = [start];
			let walk = start;
			for (let count = 0; count < 32; count++) {
				const cell = field.next.get(walk);
				if (cell == null) break;
				tracking.path.push(cell);
				walk = cell;
			}
			if (next == null) {
				if (!clearLine(unit, order.target, unit.sideIndex, friendlyOnly))
					return { status: "UNREACHABLE" };
				waypoint = order.target;
			} else {
				if (!passable(next, unit.sideIndex, friendlyOnly)) {
					fields.delete(key);
					return { status: "BLOCKED" };
				}
				waypoint = point(next);
				if (!clearLine(unit, waypoint, unit.sideIndex, friendlyOnly))
					waypoint = point(start);
			}
		}
		const dLat = waypoint.lat - unit.lat,
			dLng = normalizeLongitudeDelta(waypoint.lng - unit.lng);
		const length = Math.hypot(dLat, dLng);
		return length > 0
			? {
					status: "MOVING",
					lat: dLat / length,
					lng: dLng / length,
					distance: length,
					friendlyOnly,
				}
			: { status: "BLOCKED" };
	}
	return {
		beginTick,
		direction,
		safePosition,
		passable,
		clearLine,
		point,
		reset,
		stats: () => ({
			fields: fields.size,
			expanded,
			storedNodes: [...fields.values()].reduce(
				(sum, field) => sum + field.closed.size,
				0,
			),
		}),
	};
}

// Strategic movement is authoritative. Combat remains a separate contact action.
export function executeArmyOrder(input) {
	const {
		u,
		frame,
		CONFIG,
		speedBuffMult,
		aiProfile,
		isEncircled,
		getGridIndex,
		recordDamage,
		damageTakenMult,
	} = input;
	const order = u._armyOrder || u._taskForceOrder;
	if (!order?.target || !frame.getArmyMovement) return false;
	const movement = frame.getArmyMovement(u, order);
	u._armyMoveStatus = movement.status;
	if (movement.status !== "MOVING") {
		u.dirLat = 0;
		u.dirLng = 0;
		return true;
	}
	const speed =
		CONFIG.UNIT_SPEED *
		speedBuffMult *
		aiProfile.speedMult *
		(order.speed || 1) *
		(isEncircled ? 0.5 : 1);
	const step = Math.min(speed, movement.distance, CONFIG.GRID_RES * 0.4);
	const newLat = u.lat + movement.lat * step;
	const newLng = normalizeLongitudeDelta(u.lng + movement.lng * step);
	const destination = getGridIndex(newLat, newLng);
	if (
		!frame.isArmyCellPassable(destination, u.sideIndex, movement.friendlyOnly)
	) {
		u._armyMoveStatus = "BLOCKED";
		return true;
	}
	u.lat = newLat;
	u.lng = newLng;
	u.dirLat = movement.lat;
	u.dirLng = movement.lng;
	if (input.isNeutralCountry(input.currentIdx))
		recordDamage(u, CONFIG.ATTRITION_DAMAGE * damageTakenMult);
	return true;
}
