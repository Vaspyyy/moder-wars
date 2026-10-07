// Optional "Fade Captured Land": a cell that changes hands keeps a fading tint of
// its previous holder's side colour, so fast advances read as motion.
const FADE_MS = 700;
const MAX_FADES = 30000;
// cell index -> { side, at }
const fades = new Map();

export function recordControlFade(
	index,
	previousSide,
	now = performance.now(),
) {
	if (previousSide < 0) return;
	if (fades.size >= MAX_FADES && !fades.has(index)) return;
	fades.set(index, { side: previousSide, at: now });
}

export function clearControlFades() {
	fades.clear();
}

export function hasControlFades() {
	return fades.size > 0;
}

export function drawControlFades({
	ctx,
	gridWidth,
	res,
	xMin,
	xMax,
	yMin,
	yMax,
	project,
	sideColors,
	now = performance.now(),
}) {
	if (!fades.size) return;
	// Bucket by side and by a few alpha steps so one fill covers many cells.
	const STEPS = 6;
	const paths = new Map();
	for (const [index, fade] of fades) {
		const age = (now - fade.at) / FADE_MS;
		if (age >= 1) {
			fades.delete(index);
			continue;
		}
		const gx = index % gridWidth;
		const gy = (index - gx) / gridWidth;
		if (gx < xMin || gx > xMax || gy < yMin || gy > yMax) continue;
		const step = Math.min(STEPS - 1, Math.floor(age * STEPS));
		const key = fade.side * STEPS + step;
		let path = paths.get(key);
		if (!path) {
			path = new Path2D();
			paths.set(key, path);
		}
		const topLeft = project((gy + 1) * res - 90, gx * res - 180);
		const left = topLeft.x;
		const top = topLeft.y;
		const bottomRight = project(gy * res - 90, (gx + 1) * res - 180);
		path.rect(
			left - 0.5,
			top - 0.5,
			bottomRight.x - left + 1,
			bottomRight.y - top + 1,
		);
	}
	if (!paths.size) return;
	ctx.save();
	for (const [key, path] of paths) {
		const side = Math.floor(key / STEPS);
		const step = key % STEPS;
		const rgb = (sideColors[side]?.match(/[\d.]+/g) || [180, 180, 180]).slice(
			0,
			3,
		);
		ctx.globalAlpha = 0.75 * (1 - (step + 0.5) / STEPS);
		ctx.fillStyle = `rgb(${rgb.join(",")})`;
		ctx.fill(path);
	}
	ctx.restore();
}
