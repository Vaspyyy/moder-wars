const EPSILON = 1e-9;

// Piecewise-linear categorical fields move their shared edges geometrically.
// Every triangle is partitioned by the greatest weight, never alpha-crossfaded.
export function weightedBorderQuad(samples, x, y, size = 1) {
	let sharedWinner;
	let uniform = true;
	for (const sample of samples) {
		let winner,
			best = -1;
		for (const [id, weight] of sample)
			if (weight > best || (weight === best && id < winner)) {
				winner = id;
				best = weight;
			}
		if (sharedWinner === undefined) sharedWinner = winner;
		else if (winner !== sharedWinner) {
			uniform = false;
			break;
		}
	}
	if (uniform)
		return {
			polygons: [
				{
					id: sharedWinner,
					points: [
						[x, y],
						[x + size, y],
						[x + size, y + size],
						[x, y + size],
					],
				},
			],
			borders: [],
		};
	const labels = [
		...new Set(samples.flatMap((sample) => [...sample.keys()])),
	].sort((a, b) => a - b);
	const corners = [
		[x, y],
		[x + size, y],
		[x + size, y + size],
		[x, y + size],
	];
	if (labels.length === 1)
		return { polygons: [{ id: labels[0], points: corners }], borders: [] };
	const weights = samples.map((sample) =>
		labels.map((id) => sample.get(id) || 0),
	);
	const totals = labels.map((_, i) =>
		weights.reduce((sum, w) => sum + w[i], 0),
	);
	const presence = labels.map((_, i) => Math.max(...weights.map((w) => w[i])));
	const totalPresence = presence.reduce((sum, value) => sum + value, 0);
	const major = totals.indexOf(Math.max(...totals));
	const bias = Math.min(1, Math.max(0, totals[major] - 2));
	const middle = presence.map(
		(value, i) =>
			((1 - bias) * value) / totalPresence + (i === major ? bias : 0),
	);
	const center = { point: [x + size / 2, y + size / 2], weights: middle };
	const polygons = [],
		borders = [];
	if (labels.length === 2) {
		const differences = weights.map((w) => w[0] - w[1]);
		const centerDifference = middle[0] - middle[1];
		for (let corner = 0; corner < 4; corner++) {
			const next = (corner + 1) % 4;
			const points = [corners[corner], corners[next], center.point];
			const values = [differences[corner], differences[next], centerDifference];
			const crossings = [];
			for (let winner = 0; winner < 2; winner++) {
				if (winner === 1 && values.every((v) => Math.abs(v) < EPSILON))
					continue;
				const sign = winner === 0 ? 1 : -1;
				const region = [];
				for (let i = 0; i < 3; i++) {
					const j = (i + 1) % 3,
						a = values[i],
						b = values[j];
					if (sign * a >= -EPSILON) region.push(points[i]);
					if ((a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON)) {
						const t = a / (a - b);
						const point = [
							points[i][0] + (points[j][0] - points[i][0]) * t,
							points[i][1] + (points[j][1] - points[i][1]) * t,
						];
						region.push(point);
						if (winner === 0) crossings.push(point);
					}
					if (winner === 0 && Math.abs(a) < EPSILON) crossings.push(points[i]);
				}
				if (region.length >= 3)
					polygons.push({ id: labels[winner], points: region });
			}
			if (
				crossings.length === 2 &&
				Math.hypot(
					crossings[0][0] - crossings[1][0],
					crossings[0][1] - crossings[1][1],
				) > EPSILON
			)
				borders.push({
					from: crossings[0],
					to: crossings[1],
					left: labels[0],
					right: labels[1],
				});
		}
		return { polygons, borders };
	}
	for (let corner = 0; corner < 4; corner++) {
		const next = (corner + 1) % 4;
		const triangle = [
			{ point: corners[corner], weights: weights[corner] },
			{ point: corners[next], weights: weights[next] },
			center,
		];
		for (let winner = 0; winner < labels.length; winner++) {
			if (!triangle.some((v) => v.weights[winner] > EPSILON)) continue;
			let polygon = triangle;
			for (let rival = 0; rival < labels.length && polygon.length; rival++) {
				if (winner === rival) continue;
				if (
					polygon.every(
						(v) => Math.abs(v.weights[winner] - v.weights[rival]) < EPSILON,
					)
				) {
					if (winner > rival) polygon = [];
					continue;
				}
				const clipped = [];
				for (let i = 0; i < polygon.length; i++) {
					const a = polygon[i],
						b = polygon[(i + 1) % polygon.length];
					const da = a.weights[winner] - a.weights[rival],
						db = b.weights[winner] - b.weights[rival];
					if (da >= -EPSILON) clipped.push(a);
					if (
						(da > EPSILON && db < -EPSILON) ||
						(da < -EPSILON && db > EPSILON)
					) {
						const t = da / (da - db);
						clipped.push({
							point: a.point.map(
								(value, j) => value + (b.point[j] - value) * t,
							),
							weights: a.weights.map(
								(value, j) => value + (b.weights[j] - value) * t,
							),
						});
					}
				}
				polygon = clipped;
			}
			if (polygon.length < 3) continue;
			polygons.push({
				id: labels[winner],
				points: polygon.map((v) => v.point),
			});
			for (let i = 0; i < polygon.length; i++) {
				const a = polygon[i],
					b = polygon[(i + 1) % polygon.length];
				if (
					Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]) < EPSILON
				)
					continue;
				for (let rival = winner + 1; rival < labels.length; rival++) {
					if (
						Math.abs(a.weights[winner] - a.weights[rival]) < EPSILON &&
						Math.abs(b.weights[winner] - b.weights[rival]) < EPSILON
					) {
						borders.push({
							from: a.point,
							to: b.point,
							left: labels[winner],
							right: labels[rival],
						});
						break;
					}
				}
			}
		}
	}
	return { polygons, borders };
}
