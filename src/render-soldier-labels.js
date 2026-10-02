import { getFormationPersonnel } from "./formation-strength.js";

const CELL_SIZE = 2;
const COLUMNS = 360 / CELL_SIZE;
const FRONT_RANGE = 6;
const MAX_FRONT_SAMPLES = 96;
const EMPTY_FRONTS = {};
// The worker and editor replace polylines when rebuilding fronts. Reusing the
// spatial index until then keeps camera and personnel updates inexpensive.
const frontIndicesCache = new WeakMap();
const wrap = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
const cellX = (lng) => Math.floor((wrap(lng) + 180) / CELL_SIZE);
const cellY = (lat) => Math.min(89, Math.floor((lat + 90) / CELL_SIZE));
const cellKey = (x, y) => y * COLUMNS + ((x + COLUMNS) % COLUMNS);
const longitudeScale = (lat) => Math.max(0.25, Math.cos((lat * Math.PI) / 180));
const distanceSq = (a, b) =>
	(a.lat - b.lat) ** 2 + (wrap(a.lng - b.lng) * longitudeScale(a.lat)) ** 2;

function samplePoints(points) {
	if (points.length <= MAX_FRONT_SAMPLES) return points;
	return Array.from(
		{ length: MAX_FRONT_SAMPLES },
		(_, i) =>
			points[Math.round((i * (points.length - 1)) / (MAX_FRONT_SAMPLES - 1))],
	);
}

function makeGroup(key, sideIndex, countryId, front, unit) {
	return {
		key,
		sideIndex,
		countryId,
		front,
		personnel: 0,
		unitCount: 0,
		latSum: 0,
		lngSum: 0,
		originLng: wrap(unit.lng),
		points: [],
	};
}
function addUnit(group, unit, personnel) {
	group.latSum += unit.lat * personnel;
	group.lngSum += wrap(unit.lng - group.originLng) * personnel;
	group.personnel += personnel;
	group.unitCount++;
	if (!group.front) group.points.push({ lat: unit.lat, lng: wrap(unit.lng) });
}
function groupCenter(group) {
	return {
		lat: group.latSum / group.personnel,
		lng: wrap(group.originLng + group.lngSum / group.personnel),
	};
}
function connectedLand(a, b, frame) {
	if (!frame.landMask || !frame.getGridIndex) return true;
	const lngDelta = wrap(b.lng - a.lng);
	const steps = Math.min(
		32,
		Math.ceil(
			Math.hypot(b.lat - a.lat, lngDelta) / (frame.CONFIG.GRID_RES || 0.15),
		),
	);
	for (let i = 1; i < steps; i++) {
		const index = frame.getGridIndex(
			a.lat + ((b.lat - a.lat) * i) / steps,
			wrap(a.lng + (lngDelta * i) / steps),
		);
		if (index < 0 || frame.landMask[index] === 0) return false;
	}
	return true;
}

function indexFrontlines(frontlines) {
	const cached = frontIndicesCache.get(frontlines);
	if (cached) return cached;
	const indices = new Map();
	for (const [key, polyline] of Object.entries(frontlines).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const [a, b] = key.split("_").map(Number);
		if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) continue;
		const points = polyline.filter(
			(p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
		);
		if (!points.length) continue;
		const front = { key, sides: [a, b], points: samplePoints(points) };
		// Accounting uses the complete front. Sparse drawing samples can miss
		// troops on a short branch beside another invasion or encirclement.
		const unique = new Map();
		for (const point of points)
			unique.set(`${point.lat}:${wrap(point.lng)}`, point);
		for (const side of [a, b]) {
			if (!indices.has(side)) indices.set(side, new Map());
			const index = indices.get(side);
			for (const point of unique.values()) {
				const key = cellKey(cellX(point.lng), cellY(point.lat));
				if (!index.has(key)) index.set(key, []);
				index.get(key).push({ front, lat: point.lat, lng: wrap(point.lng) });
			}
		}
	}
	frontIndicesCache.set(frontlines, indices);
	return indices;
}

/** Read-only world-space accounting. Camera culling must never alter a total. */
export function collectSoldierFrontGroups(frame) {
	const indices = indexFrontlines(frame.frontlines || EMPTY_FRONTS);
	const groups = new Map();
	const reserves = new Map();
	for (const unit of frame.units || []) {
		if (
			!Number.isFinite(unit.lat) ||
			Math.abs(unit.lat) > 90 ||
			!Number.isFinite(unit.lng) ||
			unit.health <= 0 ||
			unit.deployTicks > 0 ||
			unit.isAtSea ||
			unit._isAtSea
		)
			continue;
		const sideIndex = unit.sideIndex;
		if (!frame.sides[sideIndex]?.length) continue;
		const countryId =
			unit.sovereignId ||
			(frame.sides[sideIndex].length === 1 ? frame.sides[sideIndex][0].id : 0);
		if (!countryId) continue;
		const personnel = getFormationPersonnel(unit, {
			nominalPersonnel:
				frame.soldiersPerUnit?.[sideIndex] ||
				frame.CONFIG.UNIT_TO_SOLDIER_RATIO,
			baseHealth:
				unit.maxHealth ||
				frame.CONFIG.UNIT_HEALTH *
					(unit.isAlpenjager ? frame.CONFIG.ALPEN_HEALTH_MULT : 1),
		});
		if (!personnel) continue;
		const index = indices.get(sideIndex);
		let nearest = null,
			best = FRONT_RANGE ** 2;
		const x = cellX(unit.lng),
			y = cellY(unit.lat);
		const unitLng = wrap(unit.lng),
			cosine = longitudeScale(unit.lat);
		const xRadius = Math.ceil(FRONT_RANGE / (CELL_SIZE * cosine));
		if (index)
			for (let radius = 0; radius <= xRadius; radius++) {
				const yRadius = Math.min(radius, 3);
				for (let dy = -yRadius; dy <= yRadius; dy++)
					for (let dx = -radius; dx <= radius; dx++) {
						if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
						const bucket = index.get(cellKey(x + dx, y + dy));
						if (!bucket) continue;
						for (const candidate of bucket) {
							let deltaLng = unitLng - candidate.lng;
							if (deltaLng > 180) deltaLng -= 360;
							else if (deltaLng < -180) deltaLng += 360;
							const distance =
								(unit.lat - candidate.lat) ** 2 + (deltaLng * cosine) ** 2;
							if (distance < best) {
								best = distance;
								nearest = candidate.front;
							}
						}
					}
				// A sample outside this searched rectangle cannot beat the closest
				// point when its minimum distance exceeds best. Most border units
				// need only their own bucket and its immediate neighbors.
				const outside = Math.min(
					unit.lat - ((y - yRadius) * CELL_SIZE - 90),
					(y + yRadius + 1) * CELL_SIZE - 90 - unit.lat,
					(unitLng - ((x - radius) * CELL_SIZE - 180)) * cosine,
					((x + radius + 1) * CELL_SIZE - 180 - unitLng) * cosine,
				);
				if (nearest && best < outside ** 2) break;
			}
		if (nearest) {
			const key = `${nearest.key}:${sideIndex}:${countryId}`;
			if (!groups.has(key))
				groups.set(key, makeGroup(key, sideIndex, countryId, nearest, unit));
			addUnit(groups.get(key), unit, personnel);
		} else {
			const countryKey = `${sideIndex}:${countryId}`;
			if (!reserves.has(countryKey)) reserves.set(countryKey, new Map());
			const cells = reserves.get(countryKey),
				key = cellKey(x, y);
			if (!cells.has(key)) cells.set(key, []);
			const bucket = cells.get(key);
			let group = bucket.find((g) =>
				connectedLand(groupCenter(g), unit, frame),
			);
			if (!group) {
				group = makeGroup(
					`reserve:${countryKey}:${key}:${bucket.length}`,
					sideIndex,
					countryId,
					null,
					unit,
				);
				group.x = x;
				group.y = y;
				group.parent = group;
				bucket.push(group);
			}
			addUnit(group, unit, personnel);
		}
	}
	// Join nearby reserves without an all-pairs formation scan. Water gaps keep
	// islands and overseas garrisons separate even before an active front exists.
	const root = (group) => {
		while (group.parent !== group) {
			group.parent = group.parent.parent;
			group = group.parent;
		}
		return group;
	};
	for (const cells of reserves.values()) {
		for (const bucket of cells.values())
			for (const group of bucket) {
				const center = groupCenter(group);
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) {
						for (const other of cells.get(
							cellKey(group.x + dx, group.y + dy),
						) || []) {
							const a = root(group),
								b = root(other);
							if (
								a !== b &&
								distanceSq(center, groupCenter(other)) <= 12.25 &&
								connectedLand(center, groupCenter(other), frame)
							)
								b.parent = a;
						}
					}
			}
		const merged = new Map();
		for (const bucket of cells.values())
			for (const group of bucket) {
				const key = root(group).key;
				if (!merged.has(key))
					merged.set(key, {
						...group,
						key,
						points: [],
						personnel: 0,
						unitCount: 0,
						latSum: 0,
						lngSum: 0,
					});
				const target = merged.get(key);
				target.latSum += group.latSum;
				target.lngSum +=
					wrap(groupCenter(group).lng - target.originLng) * group.personnel;
				target.personnel += group.personnel;
				target.unitCount += group.unitCount;
				target.points.push(...group.points);
			}
		for (const [key, group] of merged) groups.set(key, group);
	}
	return Array.from(groups.values(), (group) => ({
		key: group.key,
		frontKey: group.front?.key || null,
		sideIndex: group.sideIndex,
		countryId: group.countryId,
		personnel: group.personnel,
		unitCount: group.unitCount,
		...groupCenter(group),
		points: group.front?.points || samplePoints(group.points),
		frontSides: group.front?.sides,
	}));
}

function curvePoint(points, t) {
	const u = 1 - t;
	return {
		x:
			u ** 3 * points[0].x +
			3 * u ** 2 * t * points[1].x +
			3 * u * t ** 2 * points[2].x +
			t ** 3 * points[3].x,
		y:
			u ** 3 * points[0].y +
			3 * u ** 2 * t * points[1].y +
			3 * u * t ** 2 * points[2].y +
			t ** 3 * points[3].y,
	};
}
const overlaps = (a, b) =>
	a.left < b.right + 4 &&
	a.right > b.left - 4 &&
	a.top < b.bottom + 4 &&
	a.bottom > b.top - 4;

/** Fit readable curves to the local front and offset each country's own side. */
export function layoutSoldierFrontLabels(groups, frame) {
	const fontSize = Math.max(12, Math.min(26, frame.map.getZoom() * 3.5));
	frame.ctx.font = `700 ${fontSize}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
	const occupied = [],
		lanes = new Map(),
		labels = [],
		projectedFronts = new Map();
	const cameraLng = frame.map.getCenter?.().lng ?? 0;
	for (const group of [...groups].sort((a, b) => a.key.localeCompare(b.key))) {
		let projected = projectedFronts.get(group.points);
		if (!projected) {
			const origin = group.frontKey ? group.points[0].lng : group.lng;
			const reference = cameraLng + wrap(origin - cameraLng);
			projected = {
				reference,
				points: group.points
					.map((p) => frame.project(p.lat, reference + wrap(p.lng - reference)))
					.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
			};
			projectedFronts.set(group.points, projected);
		}
		const anchor = frame.project(
			group.lat,
			projected.reference + wrap(group.lng - projected.reference),
		);
		const { points } = projected;
		if (
			!points.length ||
			!Number.isFinite(anchor.x) ||
			!Number.isFinite(anchor.y)
		)
			continue;
		const text = group.personnel.toLocaleString();
		const flagWidth = fontSize * 1.2,
			textWidth = frame.ctx.measureText(text).width;
		const width = textWidth + flagWidth + 8;
		const center = group.frontKey
			? points.reduce((best, p) =>
					Math.hypot(p.x - anchor.x, p.y - anchor.y) <
					Math.hypot(best.x - anchor.x, best.y - anchor.y)
						? p
						: best,
				)
			: anchor;
		let local = points.filter(
			(p) =>
				Math.hypot(p.x - center.x, p.y - center.y) < Math.max(60, width * 1.2),
		);
		if (local.length < 2) local = points;
		let xx = 0,
			xy = 0,
			yy = 0;
		const mean = local.reduce(
			(sum, p) => ({
				x: sum.x + p.x / local.length,
				y: sum.y + p.y / local.length,
			}),
			{ x: 0, y: 0 },
		);
		for (const p of local) {
			xx += (p.x - mean.x) ** 2;
			xy += (p.x - mean.x) * (p.y - mean.y);
			yy += (p.y - mean.y) ** 2;
		}
		const angle = group.frontKey ? Math.atan2(2 * xy, xx - yy) / 2 : 0;
		let tangent = { x: Math.cos(angle), y: Math.sin(angle) };
		if (Math.abs(tangent.y) > Math.abs(tangent.x) * 2 && tangent.y < 0)
			tangent = { x: -tangent.x, y: -tangent.y };
		const normal = { x: -tangent.y, y: tangent.x };
		const dot =
			(anchor.x - center.x) * normal.x + (anchor.y - center.y) * normal.y;
		const sign =
			Math.abs(dot) > 1
				? Math.sign(dot)
				: group.sideIndex === group.frontSides?.[0]
					? 1
					: -1;
		const laneKey = `${group.frontKey || group.key}:${group.sideIndex}`;
		const lane = lanes.get(laneKey) || 0;
		lanes.set(laneKey, lane + 1);
		const bends = [-0.5, -1 / 6, 1 / 6, 0.5].map((fraction) => {
			const nearby = local.filter(
				(p) =>
					Math.abs(
						(p.x - center.x) * tangent.x +
							(p.y - center.y) * tangent.y -
							width * fraction,
					) <
					width / 4,
			);
			return group.frontKey && nearby.length
				? Math.max(
						-fontSize,
						Math.min(
							fontSize,
							nearby.reduce(
								(sum, p) =>
									sum +
									((p.x - center.x) * normal.x + (p.y - center.y) * normal.y) /
										nearby.length,
								0,
							),
						),
					)
				: 0;
		});
		let chosen;
		for (let attempt = 0; attempt < 8; attempt++) {
			const offset = group.frontKey
				? sign * (24 + (lane + attempt) * (fontSize + 10))
				: -28 - attempt * (fontSize + 10);
			const curve = [-0.5, -1 / 6, 1 / 6, 0.5].map((fraction, i) => ({
				x:
					center.x +
					tangent.x * width * fraction +
					normal.x * (offset + bends[i]),
				y:
					center.y +
					tangent.y * width * fraction +
					normal.y * (offset + bends[i]),
			}));
			const samples = Array.from({ length: 33 }, (_, i) =>
				curvePoint(curve, i / 32),
			);
			const bounds = {
				left: Math.min(...samples.map((p) => p.x)) - fontSize,
				right: Math.max(...samples.map((p) => p.x)) + fontSize,
				top: Math.min(...samples.map((p) => p.y)) - fontSize,
				bottom: Math.max(...samples.map((p) => p.y)) + fontSize,
			};
			const collisions = occupied.filter((b) => overlaps(bounds, b)).length;
			if (!chosen || collisions < chosen.collisions)
				chosen = {
					...group,
					text,
					fontSize,
					flagWidth,
					curve,
					samples,
					bounds,
					collisions,
				};
			if (!collisions) break;
		}
		const padding = frame.padding || 0,
			size = frame.map.getSize();
		if (
			chosen.bounds.right < -padding ||
			chosen.bounds.left > size.x + padding ||
			chosen.bounds.bottom < -padding ||
			chosen.bounds.top > size.y + padding
		)
			continue;
		occupied.push(chosen.bounds);
		labels.push(chosen);
	}
	return labels;
}

function pointOnPath(samples, lengths, distance) {
	let i = 1;
	while (i < lengths.length - 1 && lengths[i] < distance) i++;
	const a = samples[i - 1],
		b = samples[i];
	const t = Math.max(
		0,
		Math.min(
			1,
			(distance - lengths[i - 1]) /
				Math.max(0.001, lengths[i] - lengths[i - 1]),
		),
	);
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		angle: Math.atan2(b.y - a.y, b.x - a.x),
	};
}

export function drawSoldierFrontLabels(frame) {
	const groups = collectSoldierFrontGroups(frame);
	const labels = layoutSoldierFrontLabels(groups, frame);
	const countries = new Map(
		(frame.sides || []).flat().map((country) => [country.id, country]),
	);
	const { ctx } = frame;
	for (const label of labels) {
		const { fontSize, flagWidth, text } = label;
		const lengths = [0];
		for (let i = 1; i < label.samples.length; i++)
			lengths.push(
				lengths[i - 1] +
					Math.hypot(
						label.samples[i].x - label.samples[i - 1].x,
						label.samples[i].y - label.samples[i - 1].y,
					),
			);
		const country = countries.get(label.countryId),
			meta = frame.countryMetadata?.[label.countryId - 1];
		// Reuse loaded unit flags; avoid spawning image requests from label paints.
		const flag =
			country?.flag?.complete && country.flag.naturalWidth > 0
				? country.flag
				: meta?.tempFlag?.complete && meta.tempFlag.naturalWidth > 0
					? meta.tempFlag
					: null;
		const color =
			frame.sideColors?.[label.sideIndex]?.replace(/[\d.]+\)$/, "1)") ||
			"white";
		ctx.save();
		ctx.font = `700 ${fontSize}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
		ctx.lineWidth = Math.max(2.5, fontSize / 7);
		ctx.lineJoin = "round";
		ctx.fillStyle = color;
		const flagPoint = pointOnPath(label.samples, lengths, flagWidth / 2);
		ctx.save();
		ctx.translate(flagPoint.x, flagPoint.y);
		ctx.rotate(flagPoint.angle);
		if (flag) {
			ctx.drawImage(
				flag,
				-flagWidth / 2,
				-fontSize * 0.36,
				flagWidth,
				fontSize * 0.72,
			);
			ctx.strokeRect(
				-flagWidth / 2,
				-fontSize * 0.36,
				flagWidth,
				fontSize * 0.72,
			);
		} else {
			ctx.font = `700 ${Math.max(8, fontSize * 0.55)}px sans-serif`;
			const name =
				meta?.displayName ||
				meta?.name ||
				country?.name ||
				String(label.countryId);
			const tag = name
				.replace(/[^\p{L}\p{N}]/gu, "")
				.slice(0, 3)
				.toUpperCase();
			ctx.strokeText(tag, 0, 0);
			ctx.fillText(tag, 0, 0);
		}
		ctx.restore();
		let distance = flagWidth + 8;
		for (const char of text) {
			const width = ctx.measureText(char).width;
			const p = pointOnPath(label.samples, lengths, distance + width / 2);
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.angle);
			ctx.strokeText(char, 0, 0);
			ctx.fillText(char, 0, 0);
			ctx.restore();
			distance += width;
		}
		ctx.restore();
	}
	return labels;
}
