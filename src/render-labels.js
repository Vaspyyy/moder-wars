import { drawSoldierFrontLabels } from "./render-soldier-labels.js";

// This pass receives a frame snapshot; surface caches stay on the map layer.
/** Runs as a method of the control map layer. @this {any} */
export function drawLabels(frame) {
	const {
		viewportKey,
		isAtlas,
		isWar,
		hideCurvedLabels,
		showCountryLabels,
		cinematicMode,
		sideKey,
		simSpeed,
		simFrameCount,
		isPaused,
		RENDER_LAYERS,
		mainCtx,
		dpr,
		regions,
		countryMetadata,
		map,
		CONFIG,
		project,
	} = frame;
	let { ctx } = frame;
	const labelsCacheKey = [
		isAtlas ? `${viewportKey}:atlas` : viewportKey,
		isWar ? 1 : 0,
		hideCurvedLabels ? 1 : 0,
		showCountryLabels ? 1 : 0,
		cinematicMode ? 1 : 0,
		this._isCapturing ? 1 : 0,
		this._regionsRevision,
		sideKey,
	].join(";");
	const labelsRefreshFrames = simSpeed >= 3 ? 6 : 3;
	const movingLabelsRefreshDue =
		isWar &&
		!hideCurvedLabels &&
		simFrameCount - this._lastLabelsRenderFrame >= labelsRefreshFrames;
	const renderLabels =
		(isWar && isPaused) ||
		(this._invalidLayers & RENDER_LAYERS.LABELS) !== 0 ||
		this._labelsCacheKey !== labelsCacheKey ||
		movingLabelsRefreshDue;
	const labelsCtx = this._labelsSurface.getContext("2d", {
		willReadFrequently: false,
	});
	if (renderLabels) {
		labelsCtx.clearRect(
			0,
			0,
			this._labelsSurface.width,
			this._labelsSurface.height,
		);
		labelsCtx.save();
		labelsCtx.scale(dpr, dpr);
		if (frame.padding) labelsCtx.translate(frame.padding, frame.padding);
		ctx = labelsCtx;

		// PASS 6: Curved Soldier Labels (HOI4 Style)
		// Drawn AFTER units so they appear on top
		if (isWar && !hideCurvedLabels) {
			drawSoldierFrontLabels({ ...frame, ctx });
			// Only bake the casualty list into the map canvas during Cinematic Mode
			// so it appears in the WebM recording while the standard HTML UI is hidden.
			if (cinematicMode) {
				this.drawCasualtiesOnCanvas(ctx);
			}
		}

		// PASS 7: Country Labels (HOI4 Curved Style)
		// Placement comes from each contiguous region of the whole world, and the font
		// scales with the map, so a name sits at a fixed spot on the map. Panning and
		// zooming only move it as part of the map, never relative to the country.
		if (showCountryLabels && regions?.length && countryMetadata) {
			const mapSize = map.getSize();
			const res = CONFIG.GRID_RES;
			const fadeStart = Math.max(90, mapSize.y * 0.18);
			const fadeEnd = Math.max(140, mapSize.y * 0.32);

			const safeLatLngToPoint = (lat, lng) => {
				if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
				try {
					return project(lat, lng);
				} catch (_e) {
					return null;
				}
			};

			// Bigger regions claim space first; ties break on id so the order is stable.
			if (this._labelOrderSource !== regions) {
				this._labelOrderSource = regions;
				this._labelOrder = [...regions].sort(
					(a, b) => b.count - a.count || a.id - b.id,
				);
			}
			const occupied = [];
			for (const region of this._labelOrder) {
				const meta = countryMetadata[region.id - 1];
				if (!meta) continue;

				// Area scale based on this region only
				const pMin = safeLatLngToPoint(
					region.regMinY * res - 90,
					region.regMinX * res - 180,
				);
				const pMax = safeLatLngToPoint(
					(region.regMaxY + 1) * res - 90,
					(region.regMaxX + 1) * res - 180,
				);
				if (!pMin || !pMax) continue;
				const areaScale = Math.sqrt(
					Math.abs(pMax.x - pMin.x) * Math.abs(pMax.y - pMin.y),
				);
				let fontSize = areaScale / (isAtlas ? 7 : 4.5);
				if (fontSize < 7) continue;

				const nameRaw = meta.displayName || meta.name || "Unknown";
				const name = nameRaw.toUpperCase();

				// Build control points from region bins in lat/lng -> screen space
				const points = (region.bins || []).map((bin) => {
					if (!bin || bin.count <= 0) return null;
					return safeLatLngToPoint(
						bin.latSum / bin.count,
						bin.lngSum / bin.count,
					);
				});
				if (points.length < 4) continue;
				const pCenter = safeLatLngToPoint(
					region.latSum / region.count,
					region.lngSum / region.count,
				);
				if (!pCenter) continue;

				// Fill any missing points by interpolating neighbours, or fall back to center
				for (let i = 0; i < 4; i++) {
					if (!points[i]) {
						let left = null,
							right = null;
						for (let j = i - 1; j >= 0; j--) {
							if (points[j]) {
								left = { p: points[j], idx: j };
								break;
							}
						}
						for (let j = i + 1; j < 4; j++) {
							if (points[j]) {
								right = { p: points[j], idx: j };
								break;
							}
						}
						if (left && right) {
							const t = (i - left.idx) / (right.idx - left.idx);
							points[i] = {
								x: left.p.x + (right.p.x - left.p.x) * t,
								y: left.p.y + (right.p.y - left.p.y) * t,
							};
						} else if (left) {
							points[i] = { ...left.p };
						} else if (right) {
							points[i] = { ...right.p };
						} else {
							points[i] = { ...pCenter };
						}
					}
				}

				// Measure curve length to fit text nicely
				let pathLength = 0;
				let prev = points[0];
				for (let i = 1; i <= 10; i++) {
					const curr = this.getBezierPoint(
						i / 10,
						points[0],
						points[1],
						points[2],
						points[3],
					);
					pathLength += Math.sqrt(
						(curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2,
					);
					prev = curr;
				}

				const charFactor = 0.65;
				const spacingFactor = isAtlas ? 0.22 : 0.35;
				const idealFontSize =
					(pathLength * 0.9) / (name.length * (charFactor + spacingFactor));
				fontSize = Math.min(idealFontSize, fontSize);
				if (fontSize < 7) continue;

				const bounds = {
					left: Infinity,
					top: Infinity,
					right: -Infinity,
					bottom: -Infinity,
				};
				const textFraction = Math.min(
					1,
					(name.length * fontSize * (0.6 + spacingFactor)) / pathLength,
				);
				for (let i = 0; i <= 10; i++) {
					const p = this.getBezierPoint(
						0.5 - textFraction / 2 + (i / 10) * textFraction,
						points[0],
						points[1],
						points[2],
						points[3],
					);
					bounds.left = Math.min(bounds.left, p.x - fontSize / 2);
					bounds.right = Math.max(bounds.right, p.x + fontSize / 2);
					bounds.top = Math.min(bounds.top, p.y - fontSize / 2);
					bounds.bottom = Math.max(bounds.bottom, p.y + fontSize / 2);
				}
				if (isAtlas) {
					// Collision runs for off-screen labels too, so which names survive
					// does not depend on where the camera is.
					const gap = fontSize * 0.3;
					if (
						occupied.some(
							(box) =>
								bounds.left < box.right + gap &&
								bounds.right > box.left - gap &&
								bounds.top < box.bottom + gap &&
								bounds.bottom > box.top - gap,
						)
					)
						continue;
					occupied.push(bounds);
				}
				if (
					bounds.right < -40 ||
					bounds.left > mapSize.x + 40 ||
					bounds.bottom < -40 ||
					bounds.top > mapSize.y + 40
				)
					continue;
				// Names fade out once zoomed in so far that they would cover the screen.
				if (fontSize >= fadeEnd) continue;
				ctx.globalAlpha =
					fontSize > fadeStart
						? 1 - (fontSize - fadeStart) / (fadeEnd - fadeStart)
						: 1;
				this.drawTextOnCurve(
					ctx,
					name,
					points[0],
					points[1],
					points[2],
					points[3],
					fontSize,
					fontSize * spacingFactor,
					isAtlas,
				);
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		this._labelsCacheKey = labelsCacheKey;
		this._lastLabelsRenderFrame = simFrameCount;
		this._invalidLayers &= ~RENDER_LAYERS.LABELS;
	}
	if (this._compositeLayers !== false)
		mainCtx.drawImage(this._labelsSurface, 0, 0);
}
