// Shades sealed encirclement pockets with a pulsing red hatch under the units.
let hatchPattern = null;
let hatchContext = null;

function getHatch(ctx, createSurface) {
	if (hatchPattern && hatchContext === ctx) return hatchPattern;
	const tile = createSurface();
	tile.width = 10;
	tile.height = 10;
	const tileCtx = tile.getContext("2d");
	tileCtx.strokeStyle = "rgba(255, 70, 60, 0.9)";
	tileCtx.lineWidth = 2;
	tileCtx.beginPath();
	tileCtx.moveTo(-2, 12);
	tileCtx.lineTo(12, -2);
	tileCtx.moveTo(-2, 2);
	tileCtx.lineTo(2, -2);
	tileCtx.moveTo(8, 12);
	tileCtx.lineTo(12, 8);
	tileCtx.stroke();
	hatchPattern = ctx.createPattern(tile, "repeat");
	hatchContext = ctx;
	return hatchPattern;
}

export function drawEncirclementPockets({
	ctx,
	pockets,
	gridWidth,
	res,
	xMin,
	xMax,
	yMin,
	yMax,
	project,
	createSurface,
	now = performance.now(),
}) {
	if (!pockets?.length) return;
	const path = new Path2D();
	let drawn = 0;
	for (const pocket of pockets) {
		for (const cell of pocket.cells) {
			const gx = cell % gridWidth;
			const gy = (cell - gx) / gridWidth;
			if (gx < xMin || gx > xMax || gy < yMin || gy > yMax) continue;
			const topLeft = project((gy + 1) * res - 90, gx * res - 180);
			const left = topLeft.x;
			const top = topLeft.y;
			const bottomRight = project(gy * res - 90, (gx + 1) * res - 180);
			// Overlap by half a pixel so neighbouring cells leave no seams.
			path.rect(
				left - 0.5,
				top - 0.5,
				bottomRight.x - left + 1,
				bottomRight.y - top + 1,
			);
			drawn++;
		}
	}
	if (!drawn) return;
	const pulse = 0.5 + 0.5 * Math.sin(now / 320);
	ctx.save();
	ctx.globalAlpha = 0.18 + 0.12 * pulse;
	ctx.fillStyle = "rgb(200, 20, 20)";
	ctx.fill(path);
	ctx.globalAlpha = 0.45 + 0.25 * pulse;
	ctx.fillStyle = getHatch(ctx, createSurface);
	ctx.fill(path);
	ctx.restore();
}
