import { armyDistanceSq } from "./army-navigation.js";
import { normalizeLongitudeDelta } from "./geographic-math.js";

export const ARMY_COMMAND = Object.freeze({
	SECTOR_LENGTH: 2.5,
	MAX_SECTORS: 96,
	DEFENSE_SHARE: 0.4,
	RESERVE_SHARE: 0.12,
	ROTATE_AT: 0.4,
	RECOVER_AT: 0.75,
});
const power = (unit) =>
	Math.max(0, unit.combatPower ?? unit.health / (unit.maxHealth || 100));
const center = (points) => {
	const reference = points[0].lng;
	return {
		lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
		lng: normalizeLongitudeDelta(
			reference +
				points.reduce(
					(sum, p) => sum + normalizeLongitudeDelta(p.lng - reference),
					0,
				) /
					points.length,
		),
	};
};

export function buildArmySectors(
	context,
	sideIndex,
	previous = [],
	navigator,
	unitPower = power,
) {
	const result = [],
		reused = new Set();
	for (const [pairKey, polyline] of Object.entries(
		context._frontlinePolys || {},
	)) {
		const [a, b] = pairKey.split("_").map(Number);
		if (a !== sideIndex && b !== sideIndex) continue;
		if (!context.areSidesHostile(sideIndex, a === sideIndex ? b : a)) continue;
		let points = [],
			length = 0;
		const append = () => {
			if (!points.length || result.length >= ARMY_COMMAND.MAX_SECTORS) return;
			const anchor = center(points);
			const old = previous
				.filter((s) => s.pairKey === pairKey && !reused.has(s.id))
				.sort(
					(l, r) =>
						armyDistanceSq(l.anchor, anchor) - armyDistanceSq(r.anchor, anchor),
				)[0];
			const id =
				old &&
				armyDistanceSq(old.anchor, anchor) < ARMY_COMMAND.SECTOR_LENGTH ** 2
					? old.id
					: `${pairKey}:${Math.round(anchor.lat * 2)}:${Math.round(anchor.lng * 2)}`;
			reused.add(id);
			const hold = navigator.safePosition(anchor, sideIndex, true, 10);
			if (!hold) return;
			const cityValue = (context.activeTheaterCities || []).reduce(
				(sum, city) => {
					const idx = context.getGridIndex(city.lat, city.lng);
					return (
						sum +
						(idx >= 0 &&
						context.dominantSideMap[idx] === sideIndex &&
						armyDistanceSq(city, anchor) < 16
							? city.isCapital
								? 3
								: 1
							: 0)
					);
				},
				0,
			);
			result.push({
				id,
				pairKey,
				anchor,
				hold,
				points: points
					.filter(
						(_, i) => i % Math.max(1, Math.floor(points.length / 12)) === 0,
					)
					.slice(0, 12),
				length: Math.max(context.CONFIG.GRID_RES, length),
				enemyPower: 0,
				friendlyPower: 0,
				priority: 1 + cityValue,
				cityValue,
				assignedUnitIds: [],
				assignedPower: 0,
				deficit: 0,
			});
		};
		for (const point of polyline) {
			const gap = points.length
				? Math.sqrt(armyDistanceSq(points.at(-1), point))
				: 0;
			if (
				points.length &&
				(length + gap > ARMY_COMMAND.SECTOR_LENGTH || gap > 1)
			) {
				append();
				points = [];
				length = 0;
			}
			points.push(point);
			length += gap > 1 ? 0 : gap;
		}
		append();
	}
	// A formation threatens one nearest sector. Overlapping radius queries count
	// clustered armies several times and permanently forbid otherwise safe attacks.
	for (const unit of context.units || []) {
		if (unit.health <= 0 || unit.deployTicks > 0 || unit.isAtSea) continue;
		const friendly = unit.sideIndex === sideIndex;
		if (!friendly && !context.areSidesHostile(sideIndex, unit.sideIndex))
			continue;
		let nearest = null,
			distance = 9;
		for (const sector of result) {
			if (
				!friendly &&
				!sector.pairKey.split("_").includes(String(unit.sideIndex))
			)
				continue;
			const candidate = armyDistanceSq(unit, sector.anchor);
			if (candidate < distance) {
				distance = candidate;
				nearest = sector;
			}
		}
		if (nearest)
			nearest[friendly ? "friendlyPower" : "enemyPower"] += unitPower(unit);
	}
	for (const sector of result) sector.priority += sector.enemyPower * 1.4;
	return result;
}

// Coverage is allocated before offensive recruitment. Sticky positions receive a
// travel discount; wounded formations rotate out rather than hold an attack slot.
export function allocateArmyCoverage(sectors, units, posture = "BALANCED") {
	const available = units.filter(
		(u) => u.deployed !== false && u.commandEligible !== false && u.health > 0,
	);
	const used = new Set(),
		allocations = [],
		recovering = [];
	if (!sectors.length)
		return { reserved: used, allocations, recovering, reserveCount: 0 };
	for (const unit of available) {
		const ratio = unit.health / (unit.maxHealth || 100);
		if (
			(ratio < ARMY_COMMAND.ROTATE_AT && unit.rotationEligible !== false) ||
			(unit.recovering && ratio < ARMY_COMMAND.RECOVER_AT)
		) {
			recovering.push(unit);
			used.add(String(unit.id));
		}
	}
	const healthy = available.filter((u) => !used.has(String(u.id)));
	const share = ["TURTLE", "DEFENSIVE"].includes(posture)
		? 0.65
		: ["BLITZ", "AGGRESSIVE"].includes(posture)
			? 0.3
			: ARMY_COMMAND.DEFENSE_SHARE;
	const budget = Math.min(
		healthy.length,
		Math.max(
			Math.min(sectors.length, healthy.length),
			Math.ceil(healthy.length * share),
		),
	);
	const totalWeight = sectors.reduce((sum, s) => sum + s.priority, 0);
	for (const sector of sectors) {
		sector.desiredCount = 0;
		sector.assignedUnitIds = [];
		sector.assignedPower = 0;
	}
	const ordered = [...sectors].sort(
		(a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
	);
	for (let i = 0; i < budget; i++) {
		const sector =
			i < ordered.length
				? ordered[i]
				: ordered.reduce(
						(best, s) =>
							s.desiredCount / s.priority < best.desiredCount / best.priority
								? s
								: best,
						ordered[0],
					);
		sector.desiredCount++;
	}
	for (const sector of ordered) {
		const candidates = healthy
			.filter((u) => !used.has(String(u.id)))
			.sort((a, b) => {
				const cost = (u) =>
					armyDistanceSq(u, sector.hold) *
						(u.sectorId === sector.id ? 0.45 : 1) +
					(u.taskForceId ? 0.5 : 0);
				return cost(a) - cost(b) || String(a.id).localeCompare(String(b.id));
			});
		for (const unit of candidates.slice(0, sector.desiredCount)) {
			used.add(String(unit.id));
			sector.assignedUnitIds.push(unit.id);
			sector.assignedPower += power(unit);
			allocations.push({
				unit,
				sector,
				type: "HOLD",
				reason:
					sector.enemyPower > 0 ? "SECTOR_UNDER_PRESSURE" : "FRONT_COVERAGE",
			});
		}
		const armyPower = healthy.reduce((sum, unit) => sum + power(unit), 0);
		sector.requiredPower = Math.max(
			(armyPower * share * sector.priority) / Math.max(1, totalWeight),
			sector.enemyPower * 0.75,
		);
		sector.deficit = Math.max(0, sector.requiredPower - sector.assignedPower);
	}
	// Reserves reinforce a dangerous deficit instead of blindly waiting behind it.
	const reserveBudget = Math.min(
		healthy.length - budget,
		Math.ceil(healthy.length * ARMY_COMMAND.RESERVE_SHARE),
	);
	let reserveCount = 0;
	for (const unit of healthy
		.filter((u) => !used.has(String(u.id)))
		.sort((a, b) => String(a.id).localeCompare(String(b.id)))
		.slice(0, reserveBudget)) {
		const sector = [...sectors].sort(
			(a, b) =>
				b.deficit * 3 +
				b.priority -
				Math.sqrt(armyDistanceSq(unit, b.hold)) -
				(a.deficit * 3 + a.priority - Math.sqrt(armyDistanceSq(unit, a.hold))),
		)[0];
		const reinforce = sector.deficit > power(unit) * 0.5;
		used.add(String(unit.id));
		reserveCount++;
		allocations.push({
			unit,
			sector,
			type: reinforce ? "HOLD" : "RESERVE",
			reason: reinforce ? "BREACH_REINFORCEMENT" : "THEATER_RESERVE",
		});
		if (reinforce) {
			sector.assignedPower += power(unit);
			sector.assignedUnitIds.push(unit.id);
			sector.deficit = Math.max(0, sector.deficit - power(unit));
		}
	}
	return { reserved: used, allocations, recovering, reserveCount };
}

// Positions use multiple rows in depth, never clamp multiple members onto one
// lateral offset. Reachability and cell reservations resolve coast/terrain limits.
export function formationOffset(index, count, spacing = 0.16, width = 2.4) {
	const columns = Math.max(1, Math.floor((width * 2) / spacing) + 1);
	const row = Math.floor(index / columns);
	const rowCount = Math.min(columns, count - row * columns);
	return {
		lateral: ((index % columns) - (rowCount - 1) / 2) * spacing,
		depth: row * spacing * 1.5,
	};
}

export function measureOperation(taskForce, members, context) {
	const route = [
		taskForce.stagingAnchor,
		...(taskForce.route || []),
		taskForce.target,
	].filter(Boolean);
	if (route.length < 2 || !members.length)
		return { advance: 0, secured: 0, progress: 0, achieved: false };
	const lengths = route
		.slice(1)
		.map((p, i) => Math.sqrt(armyDistanceSq(p, route[i])));
	const total = lengths.reduce((sum, v) => sum + v, 0) || 1;
	let advancingPower = 0,
		totalPower = 0;
	for (const unit of members) {
		let bestDistance = Infinity,
			along = 0,
			offset = 0;
		for (let i = 1; i < route.length; i++) {
			const a = route[i - 1],
				b = route[i];
			const dl = b.lat - a.lat,
				dg = normalizeLongitudeDelta(b.lng - a.lng);
			const t = Math.max(
				0,
				Math.min(
					1,
					((unit.lat - a.lat) * dl +
						normalizeLongitudeDelta(unit.lng - a.lng) * dg) /
						Math.max(1e-9, dl * dl + dg * dg),
				),
			);
			const projected = {
				lat: a.lat + dl * t,
				lng: normalizeLongitudeDelta(a.lng + dg * t),
			};
			const distance = armyDistanceSq(unit, projected);
			if (distance < bestDistance) {
				bestDistance = distance;
				along = (offset + lengths[i - 1] * t) / total;
			}
			offset += lengths[i - 1];
		}
		const strength = Math.max(0, context.operationalUnitPower(unit));
		totalPower += strength;
		advancingPower +=
			strength * along * Math.max(0, 1 - Math.sqrt(bestDistance) / 4);
	}
	let secured = 0,
		sampled = 0,
		connected = true;
	for (let i = 1; i < route.length; i++) {
		const steps = Math.max(
			1,
			Math.min(128, Math.ceil(lengths[i - 1] / context.CONFIG.GRID_RES)),
		);
		for (let s = 1; s <= steps; s++) {
			const p = {
				lat: route[i - 1].lat + ((route[i].lat - route[i - 1].lat) * s) / steps,
				lng: normalizeLongitudeDelta(
					route[i - 1].lng +
						(normalizeLongitudeDelta(route[i].lng - route[i - 1].lng) * s) /
							steps,
				),
			};
			const idx = context.getGridIndex(p.lat, p.lng);
			connected &&=
				idx >= 0 && context.dominantSideMap[idx] === members[0].sideIndex;
			if (connected) secured++;
			sampled++;
		}
	}
	const advance = advancingPower / Math.max(0.001, totalPower);
	const held = secured / Math.max(1, sampled);
	const idx = context.getGridIndex(taskForce.target.lat, taskForce.target.lng);
	const achieved =
		idx >= 0 &&
		context.dominantSideMap[idx] === members[0].sideIndex &&
		held >= 0.8 &&
		advance >= 0.65;
	return {
		advance,
		secured: held,
		progress: Math.min(advance, held + 0.2),
		achieved,
	};
}

export function issueArmyOrder(unit, order, tick, events = null) {
	const signature = `${order.owner}:${order.type}:${Math.round(order.target.lat * 10)}:${Math.round(order.target.lng * 10)}`;
	const previous = unit._armyOrder;
	unit._armyOrder = { ...order, signature, tick };
	if (
		events &&
		(!previous ||
			previous.type !== order.type ||
			previous.owner !== order.owner ||
			previous.reason !== order.reason)
	) {
		events.push({
			tick,
			unitId: unit.id,
			type: order.type,
			owner: order.owner,
			reason: order.reason,
		});
		if (events.length > 64) events.splice(0, events.length - 64);
	}
}

// Transfers existing reserve personnel into a depleted formation; never creates
// manpower or reverses casualties. Only a safe, resting formation can replenish.
export function replenishArmyFormation(unit, context, tick) {
	if (
		!unit._armyRecovering ||
		unit._armyMoveStatus !== "ARRIVED" ||
		tick - (unit.lastCombatTick || 0) < 180 ||
		tick - (unit._armyLastReinforceTick ?? -Infinity) < 30
	)
		return 0;
	const idx = context.getGridIndex(unit.lat, unit.lng);
	if (idx < 0 || context.dominantSideMap[idx] !== unit.sideIndex) return 0;
	if (
		(context.estimateLocalForces(unit.sideIndex, unit.lat, unit.lng, 4)
			.enemyHealth || 0) > 0
	)
		return 0;
	const capacity =
		unit.personnelCapacity || context.soldiersPerUnit?.[unit.sideIndex] || 1000;
	const current =
		unit.personnel ??
		Math.round((capacity * unit.health) / (unit.maxHealth || 100));
	const reserve = context.sideRecruitableManpower?.[unit.sideIndex] || 0;
	const added = Math.max(
		0,
		Math.min(
			capacity - current,
			Math.max(1, Math.floor(capacity * 0.02)),
			Math.floor(reserve),
		),
	);
	unit._armyLastReinforceTick = tick;
	if (!added) return 0;
	context.sideRecruitableManpower[unit.sideIndex] -= added;
	unit.personnel = current + added;
	unit.personnelCapacity = capacity;
	unit.strengthMultiplier =
		unit.personnel / (context.CONFIG.UNIT_TO_SOLDIER_RATIO || 1000);
	unit.health = ((unit.maxHealth || 100) * unit.personnel) / capacity;
	return added;
}
