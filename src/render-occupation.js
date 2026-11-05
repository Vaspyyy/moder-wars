import { gameText, getLanguage, getTranslation } from "./i18n.js";
import { createOccupationRegionCache } from "./occupation-regions.js";

function projectedPaths(region, gridWidth, res, project) {
	const fill = new Path2D();
	const outline = new Path2D();
	const cells = new Set(region.cells);
	const rows = new Map();
	for (const index of region.cells) {
		const x = index % gridWidth;
		const y = Math.floor(index / gridWidth);
		if (!rows.has(y)) rows.set(y, []);
		rows.get(y).push(x);
		const topLeft = project((y + 1) * res - 90, x * res - 180);
		const bottomRight = project(y * res - 90, (x + 1) * res - 180);
		const edge = (x1, y1, x2, y2) => {
			outline.moveTo(x1, y1);
			outline.lineTo(x2, y2);
		};
		if (!cells.has(index + gridWidth))
			edge(topLeft.x, topLeft.y, bottomRight.x, topLeft.y);
		if (!cells.has(index - gridWidth))
			edge(topLeft.x, bottomRight.y, bottomRight.x, bottomRight.y);
		if (x === 0 || !cells.has(index - 1))
			edge(topLeft.x, topLeft.y, topLeft.x, bottomRight.y);
		if (x === gridWidth - 1 || !cells.has(index + 1))
			edge(bottomRight.x, topLeft.y, bottomRight.x, bottomRight.y);
	}
	// Merge adjacent cells into row strips to keep cached paths compact.
	for (const [y, xs] of rows) {
		xs.sort((a, b) => a - b);
		for (let i = 0; i < xs.length; ) {
			const start = xs[i];
			let end = start;
			while (++i < xs.length && xs[i] === end + 1) end = xs[i];
			const topLeft = project((y + 1) * res - 90, start * res - 180);
			const bottomRight = project(y * res - 90, (end + 1) * res - 180);
			fill.rect(
				topLeft.x - 0.25,
				topLeft.y - 0.25,
				bottomRight.x - topLeft.x + 0.5,
				bottomRight.y - topLeft.y + 0.5,
			);
		}
	}
	return { fill, outline };
}

/** Reuse the existing dynamic canvas; no world-sized texture or extra viewport surface. */
export function drawOccupationOverlay(frame) {
	const { ctx, project, gridWidth, res, viewportKey, countryMetadata } = frame;
	this._occupationRegions ??= createOccupationRegionCache();
	const model = this._occupationRegions.get(frame);
	if (!model.regions.length) {
		this._occupationDrawing = null;
		return;
	}
	if (
		this._occupationDrawing?.model !== model ||
		this._occupationDrawing?.viewportKey !== viewportKey
	) {
		const regions = model.regions
			.filter(
				({ bounds }) =>
					bounds.maxX >= frame.xMin &&
					bounds.minX <= frame.xMax &&
					bounds.maxY >= frame.yMin &&
					bounds.minY <= frame.yMax,
			)
			.map((region) => ({
				...region,
				...projectedPaths(region, gridWidth, res, project),
			}));
		this._occupationDrawing = { model, viewportKey, regions };
	}
	if (!this._occupationPattern || this._occupationPatternContext !== ctx) {
		const tile = document.createElement("canvas");
		tile.width = tile.height = 14;
		const brush = tile.getContext("2d");
		brush.strokeStyle = "rgba(255, 206, 116, 0.35)";
		brush.lineWidth = 1;
		brush.beginPath();
		brush.moveTo(-1, 1);
		brush.lineTo(1, -1);
		brush.moveTo(-1, 15);
		brush.lineTo(15, -1);
		brush.moveTo(13, 15);
		brush.lineTo(15, 13);
		brush.stroke();
		this._occupationPattern = ctx.createPattern(tile, "repeat");
		this._occupationPatternContext = ctx;
	}
	ctx.save();
	for (const region of this._occupationDrawing.regions) {
		ctx.fillStyle = "rgba(255, 197, 92, 0.055)";
		ctx.fill(region.fill);
		ctx.fillStyle = this._occupationPattern;
		ctx.fill(region.fill);
		ctx.setLineDash([]);
		ctx.strokeStyle = "rgba(18, 23, 29, 0.9)";
		ctx.lineWidth = 3;
		ctx.stroke(region.outline);
		ctx.setLineDash([5, 4]);
		ctx.strokeStyle = "#ffd18b";
		ctx.lineWidth = 1.5;
		ctx.stroke(region.outline);
	}
	ctx.setLineDash([]);
	if (frame.showCountryLabels) {
		const occupiedLabels = [];
		const name = (id) => {
			const meta = countryMetadata[id - 1];
			return (
				meta?.displayName ||
				getTranslation(meta?.name || String(id), getLanguage(), "NATIONS")
			);
		};
		for (const region of [...this._occupationDrawing.regions].sort(
			(a, b) => b.cells.length - a.cells.length,
		)) {
			if (region.cells.length < 8 || occupiedLabels.length >= 6) continue;
			const { bounds, anchor } = region;
			const nw = project((bounds.maxY + 1) * res - 90, bounds.minX * res - 180);
			const se = project(bounds.minY * res - 90, (bounds.maxX + 1) * res - 180);
			if (se.x - nw.x < 80 || se.y - nw.y < 35) continue;
			const p = project(
				(anchor.y + 0.5) * res - 90,
				(anchor.x + 0.5) * res - 180,
			);
			if (
				p.x < 0 ||
				p.x > frame.mapSize.x ||
				p.y < 90 ||
				p.y > frame.mapSize.y - 20
			)
				continue;
			const title = gameText("MAP_OCCUPIED_TERRITORY");
			const detail = gameText("MAP_OCCUPATION_CONTROL", {
				sovereign: name(region.sovereignId),
				controller: name(region.controllerId),
			});
			ctx.font = "700 11px sans-serif";
			const titleWidth = ctx.measureText(title).width;
			ctx.font = "10px sans-serif";
			const width = Math.min(
				frame.mapSize.x - 20,
				250,
				Math.max(titleWidth, ctx.measureText(detail).width) + 16,
			);
			const height = 36;
			const left = Math.max(
				10,
				Math.min(frame.mapSize.x - width - 10, p.x - width / 2),
			);
			const top = p.y - height / 2;
			if (
				occupiedLabels.some(
					(b) =>
						left < b.right + 6 &&
						left + width > b.left - 6 &&
						top < b.bottom + 6 &&
						top + height > b.top - 6,
				)
			)
				continue;
			occupiedLabels.push({
				left,
				top,
				right: left + width,
				bottom: top + height,
			});
			ctx.fillStyle = "rgba(12, 23, 32, 0.9)";
			ctx.strokeStyle = "#ffd18b";
			ctx.lineWidth = 1;
			ctx.fillRect(left, top, width, height);
			ctx.strokeRect(left, top, width, height);
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#ffe1a8";
			ctx.font = "700 11px sans-serif";
			ctx.fillText(title, left + width / 2, top + 11, width - 12);
			ctx.fillStyle = "#e2ebef";
			ctx.font = "10px sans-serif";
			ctx.fillText(detail, left + width / 2, top + 25, width - 12);
		}
	}
	ctx.restore();
}
