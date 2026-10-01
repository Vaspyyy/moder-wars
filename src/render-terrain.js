import { drawAtlasTexture, getAtlasCoastPaths } from "./render-atlas.js";
import {
	drawPoliticalBorders,
	drawPoliticalChunks,
} from "./render-political-cache.js";
import { createRegionChunkCache } from "./render-regions.js";

// This pass receives a frame snapshot; surface caches stay on the map layer.
export function drawTerrain(frame) {
	const {
		renderStatic,
		fullStaticRefresh,
		viewMode,
		showCountryLabels,
		gridWidth,
		staticCacheKey,
		simFrameCount,
		RENDER_LAYERS,
		xMin,
		xMax,
		yMin,
		yMax,
		regions,
		step,
		allianceViewEnabled,
		allianceKeyById,
		countryMetadata,
		getGridPoint,
		sides,
		allianceFlagMetaByRoot,
		resolveRenderFlag,
		onFlagLoad,
		paintClippedFlag,
		dpr,
	} = frame;
	const { ctx } = frame;
	if (renderStatic) {
		if (viewMode === "FLAG" || showCountryLabels) {
			if (!this._regionChunkCache)
				this._regionChunkCache = createRegionChunkCache();
			const geometry = this._regionChunkCache.get(frame);
			if (this._sourceRegionGeometry !== geometry || regions.length === 0) {
				regions.length = 0;
				for (const region of geometry) regions.push(region);
				this._sourceRegionGeometry = geometry;
				this._regionsRevision++;
				this._invalidLayers |= RENDER_LAYERS.LABELS;
			}
		}

		const coast = frame.isAtlas ? getAtlasCoastPaths(this, frame) : null;
		frame.atlasCoast = Boolean(coast);
		if (coast) {
			ctx.save();
			ctx.fillStyle = "#667265";
			ctx.fill(coast.land);
			// One shadowed shore path gives a narrow shelf without blurring inland borders.
			ctx.strokeStyle = "rgba(118,169,182,0.18)";
			ctx.lineWidth = 3;
			ctx.shadowColor = "rgba(133,189,199,0.2)";
			ctx.shadowBlur = 5;
			ctx.stroke(coast.shore);
			ctx.shadowBlur = 0;
			ctx.clip(coast.land);
		}
		drawPoliticalChunks(this, frame);

		// PASS 1.5: Flag Overlays (Only in Flag View)
		if (viewMode === "FLAG") {
			const _countryById = new Map();
			for (const side of sides) for (const c of side) _countryById.set(c.id, c);
			// Group regions by alliance root when alliance view is enabled, so each alliance
			// gets a single merged clipping mask and flag overlay.
			if (allianceViewEnabled) {
				const allianceGroups = new Map();
				regions.forEach((region) => {
					const rootId = allianceKeyById[region.id] || region.id;
					if (!allianceGroups.has(rootId)) allianceGroups.set(rootId, []);
					allianceGroups.get(rootId).push(region);
				});

				allianceGroups.forEach((group, rootId) => {
					const rootMeta =
						allianceFlagMetaByRoot[rootId] || countryMetadata[rootId - 1];
					if (!rootMeta) return;

					const flagMeta = rootMeta;
					ctx.save();
					ctx.beginPath();

					const pixelsByRow = new Map();
					let regMinX = Infinity,
						regMaxX = -Infinity,
						regMinY = Infinity,
						regMaxY = -Infinity;

					group.forEach((region) => {
						region.pixels.forEach((idx) => {
							const py = Math.floor(idx / gridWidth);
							const px = idx % gridWidth;
							let row = pixelsByRow.get(py);
							if (!row) {
								row = [];
								pixelsByRow.set(py, row);
							}
							row.push(px);
							if (px < regMinX) regMinX = px;
							if (px > regMaxX) regMaxX = px;
							if (py < regMinY) regMinY = py;
							if (py > regMaxY) regMaxY = py;
						});
					});

					pixelsByRow.forEach((rowPixels, py) => {
						rowPixels.sort((a, b) => a - b);
						let spanStart = rowPixels[0];
						const pY1 = getGridPoint(0, py).y;
						const pY2 = getGridPoint(0, py + step).y;
						const drawY = Math.min(pY1, pY2);
						const drawH = Math.abs(pY2 - pY1) + 0.5;

						for (let i = 0; i < rowPixels.length; i++) {
							if (
								i === rowPixels.length - 1 ||
								rowPixels[i + 1] !== rowPixels[i] + step
							) {
								const pXStart = getGridPoint(spanStart, py).x;
								const pXEnd = getGridPoint(rowPixels[i] + step, py).x;
								ctx.rect(pXStart, drawY, pXEnd - pXStart + 0.5, drawH);
								if (i < rowPixels.length - 1) spanStart = rowPixels[i + 1];
							}
						}
					});
					ctx.clip();

					const p1 = getGridPoint(regMinX, regMinY);
					const p2 = getGridPoint(regMaxX + step, regMaxY + step);
					const drawX = Math.min(p1.x, p2.x);
					const drawY = Math.min(p1.y, p2.y);
					const drawW = Math.abs(p1.x - p2.x);
					const drawH = Math.abs(p1.y - p2.y);

					const flagImg = resolveRenderFlag(
						flagMeta,
						_countryById.get(flagMeta.id),
						onFlagLoad,
						true,
					);
					if (
						flagImg &&
						drawW > 0 &&
						drawH > 0 &&
						Number.isFinite(drawX) &&
						Number.isFinite(drawY)
					) {
						paintClippedFlag(
							ctx,
							flagImg,
							drawX,
							drawY,
							drawW,
							drawH,
							this._container.width / dpr,
							this._container.height / dpr,
							frame.padding || 0,
						);
					} else if (
						Number.isFinite(drawX) &&
						Number.isFinite(drawY) &&
						Number.isFinite(drawW) &&
						Number.isFinite(drawH)
					) {
						const c = flagMeta.rgba || [180, 180, 180, 1];
						ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.35)`;
						ctx.fillRect(drawX, drawY, drawW, drawH);
					}

					ctx.restore();
				});
			} else {
				regions.forEach((region) => {
					const id = region.id;
					const pixels = region.pixels;
					const meta = countryMetadata[id - 1];
					if (!meta) return;

					const flagMeta = meta;

					ctx.save();
					ctx.beginPath();

					const pixelsByRow = new Map();
					let regMinX = Infinity,
						regMaxX = -Infinity,
						regMinY = Infinity,
						regMaxY = -Infinity;

					pixels.forEach((idx) => {
						const py = Math.floor(idx / gridWidth);
						const px = idx % gridWidth;
						if (!pixelsByRow.has(py)) pixelsByRow.set(py, []);
						pixelsByRow.get(py).push(px);
						if (px < regMinX) regMinX = px;
						if (px > regMaxX) regMaxX = px;
						if (py < regMinY) regMinY = py;
						if (py > regMaxY) regMaxY = py;
					});

					pixelsByRow.forEach((rowPixels, py) => {
						rowPixels.sort((a, b) => a - b);
						let spanStart = rowPixels[0];
						const pY1 = getGridPoint(0, py).y;
						const pY2 = getGridPoint(0, py + step).y;
						const drawY = Math.min(pY1, pY2);
						const drawH = Math.abs(pY2 - pY1) + 0.5;

						for (let i = 0; i < rowPixels.length; i++) {
							if (
								i === rowPixels.length - 1 ||
								rowPixels[i + 1] !== rowPixels[i] + step
							) {
								const pXStart = getGridPoint(spanStart, py).x;
								const pXEnd = getGridPoint(rowPixels[i] + step, py).x;
								ctx.rect(pXStart, drawY, pXEnd - pXStart + 0.5, drawH);
								if (i < rowPixels.length - 1) spanStart = rowPixels[i + 1];
							}
						}
					});
					ctx.clip();

					const p1 = getGridPoint(region.regMinX, region.regMinY);
					const p2 = getGridPoint(region.regMaxX + step, region.regMaxY + step);
					const drawX = Math.min(p1.x, p2.x);
					const drawY = Math.min(p1.y, p2.y);
					const drawW = Math.abs(p1.x - p2.x);
					const drawH = Math.abs(p1.y - p2.y);

					const flagImg = resolveRenderFlag(
						flagMeta,
						_countryById.get(flagMeta.id),
						onFlagLoad,
						false,
					);
					if (
						flagImg &&
						drawW > 0 &&
						drawH > 0 &&
						Number.isFinite(drawX) &&
						Number.isFinite(drawY)
					) {
						paintClippedFlag(
							ctx,
							flagImg,
							drawX,
							drawY,
							drawW,
							drawH,
							this._container.width / dpr,
							this._container.height / dpr,
							frame.padding || 0,
						);
					} else if (
						Number.isFinite(drawX) &&
						Number.isFinite(drawY) &&
						Number.isFinite(drawW) &&
						Number.isFinite(drawH)
					) {
						const c = meta.rgba;
						ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.35)`;
						ctx.fillRect(drawX, drawY, drawW, drawH);
					}

					ctx.restore();
				});
			}
		}

		if (frame.isAtlas) drawAtlasTexture(this, frame);
		drawPoliticalBorders(this, frame);
		if (coast) {
			ctx.restore();
			ctx.strokeStyle = "rgba(9,24,35,0.85)";
			ctx.lineWidth = Math.min(1.6, 0.7 + frame.currentZoom * 0.1);
			ctx.stroke(coast.shore);
		}
		ctx.restore();
		if (fullStaticRefresh) {
			this._cachedRegions = regions;
			this._regionsRevision++;
			this._invalidLayers |= RENDER_LAYERS.LABELS;
		}
		this._staticCacheKey = staticCacheKey;
		this._lastStaticRenderFrame = simFrameCount;
		this._invalidLayers &= ~RENDER_LAYERS.STATIC;
		this._clearVisibleControlTiles(xMin, xMax, yMin, yMax);
	}
}
