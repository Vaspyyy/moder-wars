// This pass receives a frame snapshot; surface caches stay on the map layer.
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
		MAX_SIDES,
		sides,
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
		ctx = labelsCtx;

		// PASS 6: Curved Soldier Labels (HOI4 Style)
		// Drawn AFTER units so they appear on top
		if (isWar && !hideCurvedLabels) {
			for (let sIdx = 0; sIdx < MAX_SIDES; sIdx++) {
				if (sides[sIdx] && sides[sIdx].length > 0) {
					this.drawCurvedLabel(ctx, sIdx);
				}
			}
			// Only bake the casualty list into the map canvas during Cinematic Mode
			// so it appears in the WebM recording while the standard HTML UI is hidden.
			if (cinematicMode) {
				this.drawCasualtiesOnCanvas(ctx);
			}
		}

		// PASS 7: Country Labels (HOI4 Curved Style)
		// Drawn per contiguous region so overseas territories get their own labels,
		// recomputed every frame in map-space so they move naturally with the camera.
		if (showCountryLabels && regions?.length && countryMetadata) {
			const mapSize = map.getSize();
			const viewBounds = map.getBounds();
			const res = CONFIG.GRID_RES;

			const safeLatLngToPoint = (lat, lng) => {
				if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
				try {
					return project(lat, lng);
				} catch (_e) {
					return null;
				}
			};

			const occupied = [];
			const orderedRegions = isAtlas
				? [...regions].sort((a, b) => b.count - a.count)
				: regions;
			orderedRegions.forEach((region) => {
				const meta = countryMetadata[region.id - 1];
				if (!meta) return;

				const centerLat = region.latSum / region.count;
				const centerLng = region.lngSum / region.count;

				// Skip regions far from the current view
				if (!viewBounds.pad(0.5).contains([centerLat, centerLng])) return;
				const pCenter = safeLatLngToPoint(centerLat, centerLng);
				if (
					!pCenter ||
					pCenter.x < -400 ||
					pCenter.x > mapSize.x + 400 ||
					pCenter.y < -400 ||
					pCenter.y > mapSize.y + 400
				) {
					return;
				}

				const nameRaw = meta.displayName || meta.name || "Unknown";
				const name = nameRaw.toUpperCase();

				// Area scale based on this region only
				const pMin = safeLatLngToPoint(
					region.regMinY * res - 90,
					region.regMinX * res - 180,
				);
				const pMax = safeLatLngToPoint(
					region.regMaxY * res - 90,
					region.regMaxX * res - 180,
				);
				if (!pMin || !pMax) return;
				const areaScale = Math.sqrt(
					Math.abs(pMax.x - pMin.x) * Math.abs(pMax.y - pMin.y),
				);

				const zoom = map.getZoom();
				let fontSize = isAtlas
					? Math.max(8, Math.min(26, 10 + zoom * 2, areaScale / 7))
					: Math.max(8, Math.min(zoom * 12, areaScale / 4.5));

				// Build control points from region bins in lat/lng -> screen space
				const points = (region.bins || []).map((bin) => {
					if (!bin || bin.count <= 0) return null;
					const lat = bin.latSum / bin.count;
					const lng = bin.lngSum / bin.count;
					return safeLatLngToPoint(lat, lng);
				});

				if (!points || points.length < 4) return;

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
				if (fontSize < 7) return;

				if (isAtlas) {
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
					if (
						occupied.some(
							(box) =>
								bounds.left < box.right + 5 &&
								bounds.right > box.left - 5 &&
								bounds.top < box.bottom + 5 &&
								bounds.bottom > box.top - 5,
						)
					)
						return;
					occupied.push(bounds);
				}
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
			});
		}
		ctx.restore();
		this._labelsCacheKey = labelsCacheKey;
		this._lastLabelsRenderFrame = simFrameCount;
		this._invalidLayers &= ~RENDER_LAYERS.LABELS;
	}
	if (this._compositeLayers !== false)
		mainCtx.drawImage(this._labelsSurface, 0, 0);
}
