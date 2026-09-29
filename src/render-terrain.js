// This pass receives a frame snapshot; surface caches stay on the map layer.
export function drawTerrain(frame) {
	const {
		renderStatic,
		fullStaticRefresh,
		viewMode,
		showCountryLabels,
		flagProcessedBuffer,
		gridProjection,
		isWar,
		currentZoom,
		gridWidth,
		staticCacheKey,
		simFrameCount,
		RENDER_LAYERS,
		xMin,
		xMax,
		yMin,
		yMax,
		worldControlMap,
		landMask,
		sovereignSideMap,
		dominantSideMap,
		primaryOccupierMap,
		gridHeight,
		CONFIG,
		regions,
		vWidth,
		vHeight,
		staticVyStart,
		staticVyEnd,
		step,
		staticVxStart,
		staticVxEnd,
		isStaticCellInPaintTiles,
		isSimplifiedMode,
		isCustomTerrain,
		mountainsEnabled,
		terrain,
		useSimplifiedBase,
		biomeMask,
		allianceViewEnabled,
		allianceKeyById,
		allianceColorByRoot,
		countryMetadata,
		sideColors,
		rgbaRe,
		disableCountryGradient,
		getGridPoint,
		sides,
		allianceFlagMetaByRoot,
		resolveRenderFlag,
		onFlagLoad,
		paintClippedFlag,
		dpr,
		staticLoopYMin,
		staticLoopYMax,
		staticLoopXMin,
		staticLoopXMax,
	} = frame;
	const { ctx } = frame;
	if (renderStatic) {
		if (
			fullStaticRefresh &&
			(viewMode === "FLAG" || showCountryLabels) &&
			flagProcessedBuffer
		) {
			this._visitId = (this._visitId || 0) + 1;
			if (this._visitId > 1e15) {
				flagProcessedBuffer.fill(0);
				this._visitId = 1;
			}
			const visitId = this._visitId;

			// In FLAG view we always sample at full resolution to avoid blocky / dotted flags.
			// For label-only mode we still downsample for performance when zoomed out.
			let samplingStep = 1;
			if (viewMode !== "FLAG") {
				if (currentZoom < 4) samplingStep = 4;
				else if (currentZoom < 6) samplingStep = 2;
			}

			const startX = Math.floor(xMin / samplingStep) * samplingStep;
			const startY = Math.floor(yMin / samplingStep) * samplingStep;

			for (let y = startY; y <= yMax; y += samplingStep) {
				const rowOffset = y * gridWidth;
				for (let x = startX; x <= xMax; x += samplingStep) {
					const idx = rowOffset + x;
					if (flagProcessedBuffer[idx] === visitId) continue;

					const sovereignId = worldControlMap[idx];
					if (sovereignId <= 0) continue;

					let effectiveOwner = sovereignId;
					if (isWar && landMask[idx] === 2) {
						const sSide = sovereignSideMap[sovereignId];
						const ds = dominantSideMap[idx];
						const isOccupiedByEnemy = ds !== -1 && ds !== sSide;
						if (isOccupiedByEnemy) {
							effectiveOwner = primaryOccupierMap[idx] || effectiveOwner;
						}
					}

					if (effectiveOwner > 0) {
						const regionPixels = [];
						const queue = [idx];
						flagProcessedBuffer[idx] = visitId;

						let latSum = 0,
							lngSum = 0,
							count = 0;

						// Contiguous search limited to viewport + padding to fulfill "only onscreen" directive
						const pad = 25;
						const vXMin = Math.max(0, xMin - pad);
						const vXMax = Math.min(gridWidth - 1, xMax + pad);
						const vYMin = Math.max(0, yMin - pad);
						const vYMax = Math.min(gridHeight - 1, yMax + pad);

						let bfsCellCount = 0;
						while (queue.length > 0) {
							if (++bfsCellCount > 100000) break;
							const curr = queue.pop();
							const cy = Math.floor(curr / gridWidth);
							const cx = curr % gridWidth;

							if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) {
								regionPixels.push(curr);
							}

							const lat = cy * CONFIG.GRID_RES - 90;
							const lng = cx * CONFIG.GRID_RES - 180;
							latSum += lat;
							lngSum += lng;
							count++;

							const neighbors = [
								curr + samplingStep,
								curr - samplingStep,
								curr + gridWidth * samplingStep,
								curr - gridWidth * samplingStep,
							];
							for (const nIdx of neighbors) {
								if (
									nIdx < 0 ||
									nIdx >= gridWidth * gridHeight ||
									flagProcessedBuffer[nIdx] === visitId
								)
									continue;

								const ny = Math.floor(nIdx / gridWidth);
								const nx = nIdx % gridWidth;
								if (nx < vXMin || nx > vXMax || ny < vYMin || ny > vYMax)
									continue;

								const nSovereign = worldControlMap[nIdx];
								let nEffectiveOwner = nSovereign;
								if (isWar && landMask[nIdx] === 2) {
									const nSSide = sovereignSideMap[nSovereign];
									const nDs = dominantSideMap[nIdx];
									const isOccupiedByEnemy = nDs !== -1 && nDs !== nSSide;
									if (isOccupiedByEnemy)
										nEffectiveOwner =
											primaryOccupierMap[nIdx] || nEffectiveOwner;
								}

								if (nEffectiveOwner === effectiveOwner) {
									flagProcessedBuffer[nIdx] = visitId;
									queue.push(nIdx);
								}
							}
						}

						if (regionPixels.length > 0) {
							// Calculate local Lat/Lng bounds for label scaling
							let minLat = 90,
								maxLat = -90,
								minLng = 180,
								maxLng = -180;
							let regMinX = Infinity,
								regMaxX = -Infinity,
								regMinY = Infinity,
								regMaxY = -Infinity;
							regionPixels.forEach((pxIdx) => {
								const py = Math.floor(pxIdx / gridWidth);
								const px = pxIdx % gridWidth;
								const lat = py * CONFIG.GRID_RES - 90;
								const lng = px * CONFIG.GRID_RES - 180;
								if (lat < minLat) minLat = lat;
								if (lat > maxLat) maxLat = lat;
								if (lng < minLng) minLng = lng;
								if (lng > maxLng) maxLng = lng;
								if (px < regMinX) regMinX = px;
								if (px > regMaxX) regMaxX = px;
								if (py < regMinY) regMinY = py;
								if (py > regMaxY) regMaxY = py;
							});

							// Build 4 bins along the region's width so each disconnected landmass
							// gets its own curved label spine independent of overseas territories.
							const bins = Array.from({ length: 4 }, () => ({
								latSum: 0,
								lngSum: 0,
								count: 0,
							}));
							const width = Math.max(1, regMaxX - regMinX + 1);
							regionPixels.forEach((pxIdx) => {
								const py = Math.floor(pxIdx / gridWidth);
								const px = pxIdx % gridWidth;
								const lat = py * CONFIG.GRID_RES - 90;
								const lng = px * CONFIG.GRID_RES - 180;
								const rel = (px - regMinX) / width;
								const binIdx = Math.max(0, Math.min(3, Math.floor(rel * 4)));
								const b = bins[binIdx];
								b.latSum += lat;
								b.lngSum += lng;
								b.count++;
							});

							// Fallback for empty bins: interpolate from neighbors or region center
							const centerLat = latSum / count;
							const centerLng = lngSum / count;
							for (let i = 0; i < 4; i++) {
								if (bins[i].count === 0) {
									let left = null,
										right = null;
									for (let j = i - 1; j >= 0; j--) {
										if (bins[j].count > 0) {
											left = bins[j];
											break;
										}
									}
									for (let j = i + 1; j < 4; j++) {
										if (bins[j].count > 0) {
											right = bins[j];
											break;
										}
									}
									if (left && right) {
										bins[i].latSum =
											(left.latSum / left.count + right.latSum / right.count) /
											2;
										bins[i].lngSum =
											(left.lngSum / left.count + right.lngSum / right.count) /
											2;
										bins[i].count = 1;
									} else if (left && left.count > 0) {
										bins[i].latSum = left.latSum;
										bins[i].lngSum = left.lngSum;
										bins[i].count = left.count;
									} else if (right && right.count > 0) {
										bins[i].latSum = right.latSum;
										bins[i].lngSum = right.lngSum;
										bins[i].count = right.count;
									} else {
										bins[i].latSum = centerLat;
										bins[i].lngSum = centerLng;
										bins[i].count = 1;
									}
								}
							}

							regions.push({
								id: effectiveOwner,
								sovereignId: sovereignId,
								pixels: regionPixels,
								latSum,
								lngSum,
								count,
								minLat,
								maxLat,
								minLng,
								maxLng,
								regMinX,
								regMaxX,
								regMinY,
								regMaxY,
								bins,
							});
						}
					}
				}
			}
		}

		// PASS 1: Base Background & Topography Rendering (Greedy Meshing)
		{
			// GC Optimization: Pre-allocate reusable buffers for the greedy mesh pass instead of new Array().fill(null)
			const maxVSize = vWidth * vHeight;
			if (!this._viewportFills || this._viewportFills.length < maxVSize) {
				this._viewportFills = new Array(maxVSize);
				this._processedCells = new Uint8Array(maxVSize);
			}

			// Only clear the specific bounds we are iterating over
			for (let vy = staticVyStart; vy < staticVyEnd; vy += step) {
				const rowOffset = vy * vWidth;
				for (let vx = staticVxStart; vx < staticVxEnd; vx += step) {
					if (!isStaticCellInPaintTiles(xMin + vx, yMin + vy)) continue;
					this._viewportFills[rowOffset + vx] = null;
					this._processedCells[rowOffset + vx] = 0;
				}
			}

			const viewportFills = this._viewportFills;

			// 1. Pass: Pre-calculate fill styles and Label Data
			for (let vy = staticVyStart; vy < staticVyEnd; vy += step) {
				const y = yMin + vy;
				const rowOffset = vy * vWidth;
				for (let vx = staticVxStart; vx < staticVxEnd; vx += step) {
					const x = xMin + vx;
					if (!isStaticCellInPaintTiles(x, y)) continue;
					if (x >= gridWidth || y >= gridHeight) continue;

					const idx = y * gridWidth + x;
					const sovereignId = worldControlMap[idx];

					const lMask = landMask[idx];
					const isWarZone = lMask === 2;
					const isStable = lMask === 1;

					if (isWarZone || isStable) {
						let fillStyle = null;
						let baseRgba = [150, 150, 150];
						let alpha = isSimplifiedMode && !isCustomTerrain ? 1.0 : 0.65;
						let effectiveId = sovereignId;

						// FLAG MODE OVERRIDE: Render all land using the neutral "Map" palette so topography
						// and biomes are visible behind the country flags.
						const isBackgroundPass = viewMode === "FLAG";

						if (sovereignId === 0 || isBackgroundPass) {
							if (useSimplifiedBase) {
								const isDesert = biomeMask[idx] === 1;
								baseRgba = isDesert ? [140, 120, 70] : [20, 38, 20];
								alpha = 1.0;
							} else if (!isBackgroundPass) {
								continue;
							}
						}

						if (sovereignId > 0 && !isBackgroundPass) {
							// Alliance view: collapse members into a single color
							if (allianceViewEnabled) {
								const rootId = allianceKeyById[sovereignId] || sovereignId;
								const allianceRgba = allianceColorByRoot[rootId] || [
									180, 180, 180, 1,
								];
								baseRgba = [allianceRgba[0], allianceRgba[1], allianceRgba[2]];
								alpha = isSimplifiedMode && !isCustomTerrain ? 1.0 : 0.85;
							} else {
								const meta = countryMetadata[sovereignId - 1];
								if (!meta) {
									baseRgba = [150, 150, 150];
									alpha = 0.6;
								} else {
									let effectiveRgba = meta.rgba;
									if (meta.overlordId) {
										const overlordMeta = countryMetadata[meta.overlordId - 1];
										if (overlordMeta) {
											effectiveRgba = [
												Math.round(
													overlordMeta.rgba[0] * 0.75 + meta.rgba[0] * 0.25,
												),
												Math.round(
													overlordMeta.rgba[1] * 0.75 + meta.rgba[1] * 0.25,
												),
												Math.round(
													overlordMeta.rgba[2] * 0.75 + meta.rgba[2] * 0.25,
												),
												meta.rgba[3] || 1,
											];
										}
									}

									baseRgba = [
										effectiveRgba[0],
										effectiveRgba[1],
										effectiveRgba[2],
									];
									alpha = isSimplifiedMode && !isCustomTerrain ? 1.0 : 0.65;

									if (isWar && isWarZone && dominantSideMap[idx] !== -1) {
										const sSide = sovereignSideMap[sovereignId];
										const ds = dominantSideMap[idx];
										const isOccupiedLand = ds !== sSide;

										if (isOccupiedLand) {
											const occupierId = primaryOccupierMap[idx];
											const occMeta =
												occupierId > 0 ? countryMetadata[occupierId - 1] : null;
											if (occupierId > 0) effectiveId = occupierId;
											const dsColor = sideColors[ds]
												? sideColors[ds]
														.replace(rgbaRe, "0.5)")
														.match(/[\d.]+/g)
														.map(Number)
												: [180, 180, 180, 0.5];
											const occColor = occMeta ? occMeta.rgba : dsColor;
											baseRgba = [
												Math.round(occColor[0] * 0.7 + 255 * 0.3),
												Math.round(occColor[1] * 0.7 + 255 * 0.3),
												Math.round(occColor[2] * 0.7 + 255 * 0.3),
											];
											alpha = 0.85;
										} else {
											alpha = 0.7;
										}
									}
								}
							}
						}

						// Apply mountain visuals across all states (War or Peace), including neutral land
						if (mountainsEnabled && terrain && terrain[idx] > 0) {
							const intensity = terrain[idx];

							if (useSimplifiedBase && sovereignId === 0) {
								// In Simplified Mode on neutral land, use a "highlight" for mountains to make them pop
								// instead of just darkening, since the base color is already quite dark.
								const lift = intensity * 42;
								baseRgba[0] = Math.min(255, baseRgba[0] + lift);
								baseRgba[1] = Math.min(255, baseRgba[1] + lift * 1.1);
								baseRgba[2] = Math.min(255, baseRgba[2] + lift);
								alpha = 0.95;
							} else {
								const dim = 0.7 - intensity * 0.25;
								baseRgba[0] = Math.floor(baseRgba[0] * dim);
								baseRgba[1] = Math.floor(baseRgba[1] * dim);
								baseRgba[2] = Math.floor(baseRgba[2] * dim);

								if (isWar) {
									alpha *= 0.75;
								} else {
									alpha = 0.75;
								}
							}
						}

						if (useSimplifiedBase) {
							fillStyle = `WG_${effectiveId}_${baseRgba.join(",")}_${alpha.toFixed(3)}_${biomeMask[idx]}`;
						} else {
							fillStyle = `rgba(${baseRgba[0]},${baseRgba[1]},${baseRgba[2]},${alpha.toFixed(3)})`;
						}
						viewportFills[rowOffset + vx] = fillStyle;
					}
				}
			}

			// 2. Pass: Greedy Mesh Rendering (Batched)
			this._gradientCache = null; // Clear per-frame gradient cache (camera may have moved)
			const processed = this._processedCells;
			const gridXPositions = gridProjection.x;
			const gridYPositions = gridProjection.y;

			// Batch mesh rectangles by resolved fillStyle to minimize ctx.fillStyle + ctx.fill() calls
			if (!this._meshBatch) this._meshBatch = new Map();
			this._meshBatch.clear();
			const meshBatch = this._meshBatch;

			for (let vy = staticVyStart; vy < staticVyEnd; vy += step) {
				const rowOffset = vy * vWidth;
				for (let vx = staticVxStart; vx < staticVxEnd; vx += step) {
					if (!isStaticCellInPaintTiles(xMin + vx, yMin + vy)) continue;
					const vIdx = rowOffset + vx;
					const fill = viewportFills[vIdx];
					if (fill === null || processed[vIdx]) continue;

					// Mesh Width (respecting sampling step)
					let mw = step;
					while (
						vx + mw < staticVxEnd &&
						isStaticCellInPaintTiles(xMin + vx + mw, yMin + vy) &&
						viewportFills[rowOffset + vx + mw] === fill &&
						!processed[rowOffset + vx + mw]
					) {
						mw += step;
					}
					if (vx + mw > vWidth) mw = vWidth - vx;

					// Mesh Height (respecting sampling step)
					let mh = step;
					while (vy + mh < staticVyEnd) {
						let rowMatch = true;
						const nextRowOffset = (vy + mh) * vWidth;
						for (let k = 0; k < mw; k += step) {
							if (
								!isStaticCellInPaintTiles(xMin + vx + k, yMin + vy + mh) ||
								viewportFills[nextRowOffset + vx + k] !== fill ||
								processed[nextRowOffset + vx + k]
							) {
								rowMatch = false;
								break;
							}
						}
						if (!rowMatch) break;
						mh += step;
					}
					if (vy + mh > vHeight) mh = vHeight - vy;

					// Compute mesh rectangle bounds
					const pX1 = gridXPositions[vx];
					const pX2 = gridXPositions[vx + mw];
					const pY1 = gridYPositions[vy];
					const pY2 = gridYPositions[vy + mh];

					const drawX = Math.min(pX1, pX2);
					const drawY = Math.min(pY1, pY2);
					const drawW = Math.abs(pX2 - pX1);
					const drawH = Math.abs(pY2 - pY1);

					if (drawW > 0 && drawH > 0) {
						let resolvedFill = fill;
						if (typeof fill === "string" && fill.startsWith("WG_")) {
							const parts = fill.split("_");
							const sid = parseInt(parts[1], 10);
							const colorParts = parts[2].split(",").map(Number);
							const a = parts[3] || "1";
							const biome = parseInt(parts[4], 10) || 0;

							if (biome === 1) {
								colorParts[0] = Math.min(255, colorParts[0] * 1.1 + 30);
								colorParts[1] = Math.min(255, colorParts[1] * 1.1 + 10);
								colorParts[2] = Math.max(0, colorParts[2] * 0.85);
							}

							const meta = countryMetadata[sid - 1];
							if (!disableCountryGradient && meta && meta.bounds) {
								if (!this._gradientCache) this._gradientCache = new Map();
								let cached = this._gradientCache.get(fill);
								if (!cached) {
									const pTop = getGridPoint(0, meta.bounds.minY).y;
									const pBottom = getGridPoint(0, meta.bounds.maxY).y;
									const g = ctx.createLinearGradient(0, pTop, 0, pBottom);
									g.addColorStop(
										0,
										`rgba(${Math.min(255, colorParts[0] + 25)},${Math.min(255, colorParts[1] + 25)},${Math.min(255, colorParts[2] + 25)},${a})`,
									);
									g.addColorStop(
										0.3,
										`rgba(${colorParts[0]},${colorParts[1]},${colorParts[2]},${a})`,
									);
									g.addColorStop(
										1,
										`rgba(${Math.floor(colorParts[0] * 0.65)},${Math.floor(colorParts[1] * 0.65)},${Math.floor(colorParts[2] * 0.65)},${a})`,
									);
									cached = g;
									this._gradientCache.set(fill, cached);
								}
								resolvedFill = cached;
							} else {
								resolvedFill = `rgba(${colorParts[0]},${colorParts[1]},${colorParts[2]},${a})`;
							}
						}
						if (!meshBatch.has(resolvedFill)) meshBatch.set(resolvedFill, []);
						meshBatch
							.get(resolvedFill)
							.push([drawX - 0.25, drawY - 0.25, drawW + 0.5, drawH + 0.5]);
					}

					// Mark as processed
					for (let j = 0; j < mh; j += step) {
						const targetRowOffset = (vy + j) * vWidth;
						for (let i = 0; i < mw; i += step) {
							processed[targetRowOffset + vx + i] = 1;
						}
					}
				}
			}

			// Render all batched rectangles: one ctx.fill() per unique fillStyle
			for (const [fillStyle, rects] of meshBatch) {
				ctx.fillStyle = fillStyle;
				ctx.beginPath();
				for (let r = 0; r < rects.length; r++) {
					const rc = rects[r];
					ctx.rect(rc[0], rc[1], rc[2], rc[3]);
				}
				ctx.fill();
			}
		}

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

		// Pre-build grid-to-screen position arrays (reused by border loop)
		const gridXP = gridProjection.x;
		const gridYP = gridProjection.y;

		// PASS 2: Frontlines (Organic borders during war)
		if (isWar) {
			ctx.strokeStyle = CONFIG.FRONTLINE_COLOR;
			// Adaptive line width: Thinner at distance to prevent "blobby" lines
			ctx.lineWidth = Math.max(1.2, 3.5 * (currentZoom / 5));
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			ctx.beginPath();

			const lineStep = step; // Downsample frontline calculations matching the greedy mesh

			for (let y = staticLoopYMin; y < staticLoopYMax; y += lineStep) {
				for (let x = staticLoopXMin; x < staticLoopXMax; x += lineStep) {
					if (!isStaticCellInPaintTiles(x, y)) continue;
					const i1 = y * gridWidth + x;
					const i2 = y * gridWidth + (x + 1);
					const i3 = (y + 1) * gridWidth + (x + 1);
					const i4 = (y + 1) * gridWidth + x;

					if (
						landMask[i1] !== 2 &&
						landMask[i2] !== 2 &&
						landMask[i3] !== 2 &&
						landMask[i4] !== 2
					)
						continue;

					const ds1 = dominantSideMap[i1];
					const ds2 = dominantSideMap[i2];
					const ds3 = dominantSideMap[i3];
					const ds4 = dominantSideMap[i4];

					const s1 = ds1 >= 0 ? ds1 : -1;
					const s2 = ds2 >= 0 ? ds2 : -1;
					const s3 = ds3 >= 0 ? ds3 : -1;
					const s4 = ds4 >= 0 ? ds4 : -1;

					// For each edge of the quad, if the two corners belong to different
					// combatant sides, there is a border crossing somewhere along it.
					// We use a simple midpoint approach: draw a short line segment
					// between crossing points on edges that span different sides.
					const crossings = [];

					const addCrossing = (ax, ay, sa, bx, by, sb) => {
						if (sa !== sb && sa >= 0 && sb >= 0) {
							crossings.push(getGridPoint((ax + bx) / 2, (ay + by) / 2));
						}
					};

					// Top edge (v1 -> v2)
					addCrossing(x, y, s1, x + 1, y, s2);
					// Right edge (v2 -> v3)
					addCrossing(x + 1, y, s2, x + 1, y + 1, s3);
					// Bottom edge (v4 -> v3)
					addCrossing(x, y + 1, s4, x + 1, y + 1, s3);
					// Left edge (v1 -> v4)
					addCrossing(x, y, s1, x, y + 1, s4);

					if (crossings.length >= 2) {
						ctx.moveTo(crossings[0].x, crossings[0].y);
						ctx.lineTo(crossings[1].x, crossings[1].y);
						if (crossings.length >= 3) {
							ctx.lineTo(crossings[2].x, crossings[2].y);
						}
					} else if (crossings.length === 1) {
						// Single crossing — connect to diagonal midpoint
						const mid = getGridPoint(x + 0.5, y + 0.5);
						ctx.moveTo(crossings[0].x, crossings[0].y);
						ctx.lineTo(mid.x, mid.y);
					}
				}
			}
			ctx.stroke();
		}

		// PASS 3: Borders
		// PASS 3: Dynamic Borders & Coastlines
		// Outlines of annexed nations disappear because they now share the same owner ID in the grid.
		const isFlag = viewMode === "FLAG";
		ctx.strokeStyle = isFlag ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.3)";
		ctx.lineWidth = isFlag ? 1.5 : 1;
		ctx.beginPath();

		const borderStep = currentZoom < 5 ? 2 : 1;
		const borderRowStep = gridWidth * borderStep;

		if (isFlag) {
			const getEffectiveId = (idx) => {
				if (idx < 0 || idx >= worldControlMap.length || landMask[idx] === 0)
					return -1; // -1 represents water

				const sovereignId = worldControlMap[idx];
				if (sovereignId <= 0) return 0;
				if (isWar && landMask[idx] === 2) {
					const sSide = sovereignSideMap[sovereignId];
					const ds = dominantSideMap[idx];
					const isOccupiedByEnemy = ds !== -1 && ds !== sSide;
					if (isOccupiedByEnemy) return primaryOccupierMap[idx] || sovereignId;
				}
				return sovereignId;
			};

			for (let y = staticLoopYMin; y < staticLoopYMax; y += borderStep) {
				const rowOffset = y * gridWidth;
				for (let x = staticLoopXMin; x < staticLoopXMax; x += borderStep) {
					if (!isStaticCellInPaintTiles(x, y)) continue;
					const i = rowOffset + x;
					const id = getEffectiveId(i);

					if (x + borderStep < gridWidth) {
						const idR = getEffectiveId(i + borderStep);
						if (id !== idR && (id !== -1 || idR !== -1)) {
							const p1x = gridXP[x + borderStep - xMin];
							const p1y = gridYP[y - yMin];
							const p2x = gridXP[x + borderStep - xMin];
							const p2y = gridYP[y + borderStep - yMin];
							ctx.moveTo(p1x, p1y);
							ctx.lineTo(p2x, p2y);
						}
					}
					if (y + borderStep < gridHeight) {
						const idD = getEffectiveId(i + borderRowStep);
						if (id !== idD && (id !== -1 || idD !== -1)) {
							const p1x = gridXP[x - xMin];
							const p1y = gridYP[y + borderStep - yMin];
							const p2x = gridXP[x + borderStep - xMin];
							const p2y = gridYP[y + borderStep - yMin];
							ctx.moveTo(p1x, p1y);
							ctx.lineTo(p2x, p2y);
						}
					}
				}
			}
		} else {
			for (let y = staticLoopYMin; y < staticLoopYMax; y += borderStep) {
				const rowOffset = y * gridWidth;
				for (let x = staticLoopXMin; x < staticLoopXMax; x += borderStep) {
					if (!isStaticCellInPaintTiles(x, y)) continue;
					const i = rowOffset + x;
					const id = landMask[i] === 0 ? -1 : worldControlMap[i];

					if (x + borderStep < gridWidth) {
						const rightIdx = i + borderStep;
						const idR =
							landMask[rightIdx] === 0 ? -1 : worldControlMap[rightIdx];
						if (id !== idR && (id !== -1 || idR !== -1)) {
							const p1x = gridXP[x + borderStep - xMin];
							const p1y = gridYP[y - yMin];
							const p2x = gridXP[x + borderStep - xMin];
							const p2y = gridYP[y + borderStep - yMin];
							ctx.moveTo(p1x, p1y);
							ctx.lineTo(p2x, p2y);
						}
					}
					if (y + borderStep < gridHeight) {
						const downIdx = i + borderRowStep;
						const idD = landMask[downIdx] === 0 ? -1 : worldControlMap[downIdx];
						if (id !== idD && (id !== -1 || idD !== -1)) {
							const p1x = gridXP[x - xMin];
							const p1y = gridYP[y + borderStep - yMin];
							const p2x = gridXP[x + borderStep - xMin];
							const p2y = gridYP[y + borderStep - yMin];
							ctx.moveTo(p1x, p1y);
							ctx.lineTo(p2x, p2y);
						}
					}
				}
			}
		}
		ctx.stroke();
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
