import {
	collectSelectionQuads,
	containsRenderPoint,
} from "./render-culling.js";

// This pass receives a frame snapshot; surface caches stay on the map layer.
export function drawUnits(frame) {
	const {
		gameState,
		viewBounds,
		explosions,
		bombs,
		isWar,
		map,
		showNonCapitalCities,
		cities,
		activeTheaterCities,
		showUnitsVisually,
		showBattleIndicators,
		editingCountryId,
		sides,
		yMin,
		yMax,
		xMin,
		xMax,
		gridWidth,
		worldControlMap,
		getGridPoint,
		sideColors,
		rgbaRe,
		countryMetadata,
		project,
		bases,
		getGridIndex,
		dominantSideMap,
		occupationMap,
		sideInfluenceMaps,
		UNIT_HASH_CELL_SIZE,
		unitSpatialHash,
		CONFIG,
		allianceViewEnabled,
		allianceKeyById,
		soldiersPerUnit,
		getFormationStrengthBadge,
		drawFormationStrengthBadge,
		activeBattles,
		simFrameCount,
	} = frame;
	const { ctx } = frame;
	if (gameState !== "SIMULATING") {
		const drawInspectorHighlight = (id) => {
			if (id <= 0) return;
			ctx.beginPath();
			ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
			ctx.setLineDash([5, 5]);
			ctx.lineWidth = 2;
			for (let y = yMin; y < yMax; y++) {
				for (let x = xMin; x < xMax; x++) {
					const i1 = y * gridWidth + x;
					const i2 = y * gridWidth + (x + 1);
					const i3 = (y + 1) * gridWidth + (x + 1);
					const i4 = (y + 1) * gridWidth + x;
					const b1 = worldControlMap[i1] === id ? 1 : 0;
					const b2 = worldControlMap[i2] === id ? 1 : 0;
					const b3 = worldControlMap[i3] === id ? 1 : 0;
					const b4 = worldControlMap[i4] === id ? 1 : 0;

					const pT = getGridPoint(x + 0.5, y);
					const pR = getGridPoint(x + 1, y + 0.5);
					const pB = getGridPoint(x + 0.5, y + 1);
					const pL = getGridPoint(x, y + 0.5);
					const pD = getGridPoint(x + 0.5, y + 0.5);

					// Split quad highlight into triangles for smoother inspector visuals
					const id1 = (b1 << 2) | (b2 << 1) | b4;
					if (id1 !== 0 && id1 !== 7) {
						switch (id1) {
							case 1:
							case 6:
								ctx.moveTo(pL.x, pL.y);
								ctx.lineTo(pD.x, pD.y);
								break;
							case 2:
							case 5:
								ctx.moveTo(pT.x, pT.y);
								ctx.lineTo(pD.x, pD.y);
								break;
							case 3:
							case 4:
								ctx.moveTo(pT.x, pT.y);
								ctx.lineTo(pL.x, pL.y);
								break;
						}
					}
					const id2 = (b2 << 2) | (b3 << 1) | b4;
					if (id2 !== 0 && id2 !== 7) {
						switch (id2) {
							case 1:
							case 6:
								ctx.moveTo(pB.x, pB.y);
								ctx.lineTo(pD.x, pD.y);
								break;
							case 2:
							case 5:
								ctx.moveTo(pR.x, pR.y);
								ctx.lineTo(pB.x, pB.y);
								break;
							case 3:
							case 4:
								ctx.moveTo(pR.x, pR.y);
								ctx.lineTo(pD.x, pD.y);
								break;
						}
					}
				}
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};

		if (editingCountryId > 0) drawInspectorHighlight(editingCountryId);

		const selected = new Set();
		const selectionOrder = [];
		const featureIds = new Map(
			countryMetadata
				.filter(Boolean)
				.map((metadata, index) => [metadata.feature, metadata.id || index + 1]),
		);
		for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
			for (const country of sides[sideIndex]) {
				const id = country.feature
					? featureIds.get(country.feature)
					: country.id;
				if (!(id > 0)) continue;
				selected.add(id);
				selectionOrder.push([id, sideIndex]);
			}
		}
		if (!this._selectionQuads) this._selectionQuads = new Map();
		const selectionQuads = collectSelectionQuads(
			worldControlMap,
			gridWidth,
			{ xMin, xMax, yMin, yMax },
			selected,
			this._selectionQuads,
		);
		const drawSelectionHighlight = (id, sideIdx) => {
			ctx.beginPath();
			ctx.strokeStyle = sideColors[sideIdx].replace(rgbaRe, "1)");
			ctx.lineWidth = 3;

			for (const i1 of selectionQuads.get(id) || []) {
				const y = Math.floor(i1 / gridWidth);
				const x = i1 % gridWidth;
				const i2 = y * gridWidth + (x + 1);
				const i3 = (y + 1) * gridWidth + (x + 1);
				const i4 = (y + 1) * gridWidth + x;
				const b1 = worldControlMap[i1] === id ? 1 : 0;
				const b2 = worldControlMap[i2] === id ? 1 : 0;
				const b3 = worldControlMap[i3] === id ? 1 : 0;
				const b4 = worldControlMap[i4] === id ? 1 : 0;
				const mid = (b1 << 3) | (b2 << 2) | (b3 << 1) | b4;
				if (mid === 0 || mid === 15) continue;
				const pT = getGridPoint(x + 0.5, y);
				const pR = getGridPoint(x + 1, y + 0.5);
				const pB = getGridPoint(x + 0.5, y + 1);
				const pL = getGridPoint(x, y + 0.5);
				switch (mid) {
					case 1:
					case 14:
						ctx.moveTo(pL.x, pL.y);
						ctx.lineTo(pB.x, pB.y);
						break;
					case 2:
					case 13:
						ctx.moveTo(pR.x, pR.y);
						ctx.lineTo(pB.x, pB.y);
						break;
					case 3:
					case 12:
						ctx.moveTo(pL.x, pL.y);
						ctx.lineTo(pR.x, pR.y);
						break;
					case 4:
					case 11:
						ctx.moveTo(pT.x, pT.y);
						ctx.lineTo(pR.x, pR.y);
						break;
					case 5:
						ctx.moveTo(pL.x, pL.y);
						ctx.lineTo(pT.x, pT.y);
						ctx.moveTo(pR.x, pR.y);
						ctx.lineTo(pB.x, pB.y);
						break;
					case 6:
					case 9:
						ctx.moveTo(pT.x, pT.y);
						ctx.lineTo(pB.x, pB.y);
						break;
					case 7:
					case 8:
						ctx.moveTo(pL.x, pL.y);
						ctx.lineTo(pT.x, pT.y);
						break;
					case 10:
						ctx.moveTo(pT.x, pT.y);
						ctx.lineTo(pR.x, pR.y);
						ctx.moveTo(pL.x, pL.y);
						ctx.lineTo(pB.x, pB.y);
						break;
				}
			}
			ctx.stroke();
		};
		for (const [id, sideIndex] of selectionOrder)
			drawSelectionHighlight(id, sideIndex);
	}

	// Draw Explosions - Viewport Culled
	const drawBounds = viewBounds.pad(0.1);
	if (!this._activeCitySet) this._activeCitySet = new Set();
	const activeCitySet = this._activeCitySet;
	activeCitySet.clear();
	for (const city of activeTheaterCities) activeCitySet.add(city.id ?? city);
	explosions.forEach((exp) => {
		if (
			Number.isNaN(exp.lat) ||
			Number.isNaN(exp.lng) ||
			!containsRenderPoint(drawBounds, exp.lat, exp.lng)
		)
			return;
		let p;
		try {
			p = project(exp.lat, exp.lng);
		} catch (_e) {
			return;
		}

		const lifePct = exp.life / 30; // 30 frames life
		const radius = exp.maxRadius * (1 - lifePct) * (map.getZoom() / 5);

		ctx.beginPath();
		ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
		const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
		gradient.addColorStop(0, `rgba(255, 255, 255, ${lifePct})`);
		gradient.addColorStop(0.3, `rgba(255, 200, 50, ${lifePct * 0.8})`);
		gradient.addColorStop(1, `rgba(255, 50, 0, 0)`);
		ctx.fillStyle = gradient;
		ctx.fill();
	});

	// Draw Bombs - Viewport Culled
	bombs.forEach((b) => {
		if (
			Number.isNaN(b.currentLat) ||
			Number.isNaN(b.currentLng) ||
			!containsRenderPoint(drawBounds, b.currentLat, b.currentLng)
		)
			return;
		let p, pn;
		try {
			p = project(b.currentLat, b.currentLng);
			pn = project(b.nextLat ?? b.currentLat, b.nextLng ?? b.currentLng);
		} catch (_e) {
			return;
		}
		const zoomScale = 1.2 ** (map.getZoom() - 3);

		// Draw trail - Improved glowing plume with better tapering
		b.trail.forEach((t, i) => {
			const tp = project(t.lat, t.lng);
			const progress = i / b.trail.length;
			const opacity = progress * 0.7;
			const baseRadius = 2.5 * zoomScale * progress;

			// Outer Glow
			ctx.beginPath();
			ctx.arc(tp.x, tp.y, baseRadius * 3, 0, Math.PI * 2);
			ctx.fillStyle = sideColors[b.sideIndex].replace(
				/[\d.]+\)$/,
				`${opacity * 0.2})`,
			);
			ctx.fill();

			ctx.beginPath();
			ctx.arc(tp.x, tp.y, baseRadius, 0, Math.PI * 2);
			ctx.fillStyle = sideColors[b.sideIndex].replace(
				/[\d.]+\)$/,
				`${opacity})`,
			);
			ctx.fill();

			// White-hot core
			if (progress > 0.8) {
				ctx.beginPath();
				ctx.arc(tp.x, tp.y, baseRadius * 0.5, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
				ctx.fill();
			}
		});

		// Draw Bomb (Missile shape)
		ctx.save();
		ctx.translate(p.x, p.y);

		// Calculate smooth rotation based on screen-space trajectory
		const angle = Math.atan2(pn.y - p.y, pn.x - p.x);
		ctx.rotate(angle);

		// Bomb Body
		ctx.fillStyle = "#fff";
		ctx.strokeStyle = sideColors[b.sideIndex].replace(rgbaRe, "1)");
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(10 * zoomScale, 0); // Nose
		ctx.lineTo(-2 * zoomScale, -4 * zoomScale); // Top fin
		ctx.lineTo(-6 * zoomScale, -4 * zoomScale); // Back top
		ctx.lineTo(-6 * zoomScale, 4 * zoomScale); // Back bottom
		ctx.lineTo(-2 * zoomScale, 4 * zoomScale); // Bottom fin
		ctx.closePath();
		ctx.fill();
		ctx.stroke();

		// Engine Glow
		ctx.beginPath();
		ctx.arc(-6 * zoomScale, 0, 3 * zoomScale, 0, Math.PI * 2);
		ctx.fillStyle = sideColors[b.sideIndex].replace(rgbaRe, "1)");
		ctx.fill();

		ctx.restore();
	});

	// Draw Bases (Missile Silos & Airports) - Viewport Culled
	if (isWar) {
		const zoom = map.getZoom();
		const baseSize = Math.max(4, zoom * 1.5);

		bases.forEach((base) => {
			if (!containsRenderPoint(drawBounds, base.lat, base.lng)) return;
			const p = project(base.lat, base.lng);
			ctx.beginPath();
			ctx.arc(p.x, p.y, baseSize * 1.2, 0, Math.PI * 2);
			ctx.fillStyle = sideColors[base.sideIndex].replace(rgbaRe, "0.3)");
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.strokeStyle = sideColors[base.sideIndex].replace(/[\d.]+\)$/g, "1)");
			ctx.lineWidth = 2;
			ctx.fillRect(p.x - baseSize / 2, p.y - baseSize / 2, baseSize, baseSize);
			ctx.strokeRect(
				p.x - baseSize / 2,
				p.y - baseSize / 2,
				baseSize,
				baseSize,
			);
			ctx.beginPath();
			ctx.moveTo(p.x - baseSize / 2, p.y);
			ctx.lineTo(p.x + baseSize / 2, p.y);
			ctx.moveTo(p.x, p.y - baseSize / 2);
			ctx.lineTo(p.x, p.y + baseSize / 2);
			ctx.stroke();
		});
	}

	// Draw cities
	const zoom = map.getZoom();
	const citySize = Math.max(2, zoom - 2);

	// Single-pass filter into reused scratch array
	if (!this._citiesScratch) this._citiesScratch = [];
	const citiesToDraw = this._citiesScratch;
	citiesToDraw.length = 0;

	const skipNonCapital = !showNonCapitalCities;
	const minPop = zoom >= 5 ? 100000 : zoom >= 4 ? 400000 : 1000000;
	const allSource = zoom >= 3 ? cities : activeTheaterCities;
	const len = allSource.length;
	for (let i = 0; i < len; i++) {
		const c = allSource[i];
		if (skipNonCapital && !c.isCapital) continue;
		if (zoom >= 3) {
			if (zoom >= 6) {
				if (!containsRenderPoint(viewBounds, c.lat, c.lng)) continue;
			} else {
				const qualifies =
					(c.pop > minPop && containsRenderPoint(viewBounds, c.lat, c.lng)) ||
					activeCitySet.has(c.id ?? c);
				if (!qualifies) continue;
			}
		}
		citiesToDraw.push(c);
	}

	citiesToDraw.forEach((city) => {
		let p;
		try {
			p = project(city.lat, city.lng);
		} catch (_e) {
			return;
		}
		const gIdx = getGridIndex(city.lat, city.lng);
		const ds = gIdx !== -1 && dominantSideMap ? dominantSideMap[gIdx] : -1;
		const isCapital = city.isCapital;
		const actualSize = isCapital ? citySize * 1.6 : citySize;

		ctx.beginPath();
		ctx.arc(p.x, p.y, actualSize, 0, Math.PI * 2);

		if (
			ds >= 0 &&
			ds < sideColors.length &&
			(sideInfluenceMaps[ds]?.[gIdx] ?? Math.abs(occupationMap?.[gIdx] || 0)) >
				0.3
		) {
			ctx.fillStyle = sideColors[ds].replace(rgbaRe, "1)");
			ctx.strokeStyle = "rgba(0,0,0,0.4)";
		} else {
			ctx.fillStyle = "#fff";
			ctx.strokeStyle = "rgba(0,0,0,0.6)";
		}

		ctx.lineWidth = 1;
		ctx.fill();
		ctx.stroke();

		// City labels at high zoom
		if (zoom >= 6) {
			ctx.fillStyle = "#fff";
			ctx.font = "bold 10px monospace";
			ctx.shadowBlur = 4;
			ctx.shadowColor = "black";
			ctx.fillText(city.name, p.x + citySize + 2, p.y + 4);
			ctx.shadowBlur = 0;
		}
	});

	// Draw units - Small flags for land, ships for water
	if (showUnitsVisually) {
		const currentZoom = map.getZoom();
		const zoomScale = 1.3 ** (currentZoom - 3);
		const w = 7 * zoomScale;
		const h = 4.5 * zoomScale;

		const drawProb = currentZoom < 3 ? 0.2 : currentZoom < 4 ? 0.5 : 1.0;
		const uDrawBounds = viewBounds.pad(0.02); // Tight culling

		// O(Visible) RENDERING: Use spatial hash to only iterate over units in visible buckets.
		const b = viewBounds;
		const minKx = Math.floor((b.getWest() + 180) / UNIT_HASH_CELL_SIZE);
		const maxKx = Math.floor((b.getEast() + 180) / UNIT_HASH_CELL_SIZE);
		const minKy = Math.floor((b.getSouth() + 90) / UNIT_HASH_CELL_SIZE);
		const maxKy = Math.floor((b.getNorth() + 90) / UNIT_HASH_CELL_SIZE);

		if (!this._visibleUnitsScratch) this._visibleUnitsScratch = [];
		const visibleUnits = this._visibleUnitsScratch;
		visibleUnits.length = 0;
		const hashColumns = Math.ceil(360 / UNIT_HASH_CELL_SIZE);
		const visitedColumns = new Set();
		for (let kx = minKx; kx <= maxKx; kx++) {
			// Handle longitude wrap
			const wrappedKx = ((kx % hashColumns) + hashColumns) % hashColumns;
			if (visitedColumns.has(wrappedKx)) continue;
			visitedColumns.add(wrappedKx);
			for (let ky = minKy; ky <= maxKy; ky++) {
				const bucket = unitSpatialHash.get(wrappedKx * 100 + ky);
				if (bucket) {
					for (let bu = 0; bu < bucket.length; bu++) {
						const u = bucket[bu];
						if (containsRenderPoint(uDrawBounds, u.lat, u.lng)) {
							visibleUnits.push(u);
						}
					}
				}
			}
		}

		if (!this._renderCountryById) this._renderCountryById = new Map();
		const countryById = this._renderCountryById;
		countryById.clear();
		for (const side of sides)
			for (const country of side) countryById.set(country.id, country);
		visibleUnits.forEach((u) => {
			if (drawProb < 1.0 && u.id % 1 > drawProb) return;
			let p;
			try {
				p = project(u.lat, u.lng);
			} catch (_e) {
				return;
			}

			// Safety: check resulting container points
			if (
				Number.isNaN(p.x) ||
				Number.isNaN(p.y) ||
				!Number.isFinite(p.x) ||
				!Number.isFinite(p.y)
			)
				return;

			const isAtSea = u.isAtSea;
			const isMountain = u.mountainIntensity > 0;
			const mountainIntensity = u.mountainIntensity || 0;

			if (isAtSea) {
				// Draw a simple ship icon
				ctx.fillStyle = sideColors[u.sideIndex].replace(rgbaRe, "1)");
				ctx.beginPath();
				ctx.moveTo(p.x - w / 2, p.y + h / 4);
				ctx.lineTo(p.x + w / 2, p.y + h / 4);
				ctx.lineTo(p.x + w / 4, p.y + h / 2);
				ctx.lineTo(p.x - w / 4, p.y + h / 2);
				ctx.closePath();
				ctx.fill();
				// Sail
				ctx.beginPath();
				ctx.moveTo(p.x, p.y + h / 4);
				ctx.lineTo(p.x, p.y - h / 2);
				ctx.lineTo(p.x + w / 3, p.y + h / 8);
				ctx.closePath();
				ctx.fillStyle = "white";
				ctx.fill();
			} else {
				const country = countryById.get(u.sovereignId);
				const sw = w;
				const sh = h;

				// If still not found, try searching the metadata (for dead countries)
				let flagMeta = null;
				if (country?.id) {
					flagMeta = countryMetadata[country.id - 1] || null;
				} else if (u.sovereignId > 0) {
					flagMeta = countryMetadata[u.sovereignId - 1] || null;
				}

				// If alliance view is enabled during war, show the alliance flag instead of per‑nation
				if (allianceViewEnabled && isWar && flagMeta) {
					const rootId = allianceKeyById[flagMeta.id] || flagMeta.id;
					const rootMeta = countryMetadata[rootId - 1];
					if (rootMeta) flagMeta = rootMeta;
				}

				if (flagMeta) {
					// In alliance view, prefer a dedicated alliance flag if one exists
					if (!(allianceViewEnabled && flagMeta.allianceFlagTempFlag?.complete))
						if (!flagMeta.tempFlag && flagMeta.flagUrl) {
							flagMeta.tempFlag = new Image();
							flagMeta.tempFlag.crossOrigin = "anonymous";
							flagMeta.tempFlag.src = flagMeta.flagUrl;
						}
				}

				const flag =
					allianceViewEnabled && flagMeta?.allianceFlagTempFlag
						? flagMeta.allianceFlagTempFlag
						: flagMeta?.tempFlag || country?.flag || country?.tempFlag;
				if (flag?.complete && flag.naturalWidth > 0) {
					ctx.drawImage(flag, p.x - sw / 2, p.y - sh / 2, sw, sh);
					ctx.strokeStyle = "rgba(0,0,0,0.3)";
					ctx.lineWidth = Math.max(0.3, 0.3 * zoomScale);
					ctx.strokeRect(p.x - sw / 2, p.y - sh / 2, sw, sh);
				} else {
					ctx.fillStyle = sideColors[u.sideIndex].replace(rgbaRe, "1)");
					ctx.fillRect(p.x - sw / 2, p.y - sh / 2, sw, sh);
				}

				// Victory Boost Visual (Star)
				if (showBattleIndicators && u.victoryBoostTicks > 0) {
					ctx.save();
					const starSize = 10 * zoomScale;
					ctx.font = `${starSize}px serif`;
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.shadowBlur = 0;
					ctx.shadowColor = "gold";
					ctx.fillStyle = "#e9d58d";
					ctx.beginPath();
					ctx.moveTo(p.x, p.y - sh - 2 - starSize / 2);
					ctx.lineTo(p.x + starSize / 2, p.y - sh - 2);
					ctx.lineTo(p.x, p.y - sh - 2 + starSize / 2);
					ctx.lineTo(p.x - starSize / 2, p.y - sh - 2);
					ctx.closePath();
					ctx.fill();
					ctx.restore();
				}

				// Encirclement Badge
				if (u.encircledTicks > 30) {
					ctx.save();
					ctx.fillStyle = "rgba(255, 0, 0, 0.9)";
					ctx.font = `bold ${Math.max(6, 7 * zoomScale)}px monospace`;
					ctx.textAlign = "center";
					ctx.textBaseline = "bottom";
					ctx.fillText("ENCIRCLED", p.x, p.y - sh / 2 - 3);
					ctx.restore();
				}

				if (isMountain) {
					// Floating triangle indicator well above the unit to signify mountain traversal
					const triSize = 5 * zoomScale;
					const triOffset = 10 * zoomScale;
					ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + mountainIntensity * 0.3})`;
					ctx.beginPath();
					ctx.moveTo(p.x, p.y - sh / 2 - triOffset);
					ctx.lineTo(p.x - triSize / 2, p.y - sh / 2 - triOffset + triSize);
					ctx.lineTo(p.x + triSize / 2, p.y - sh / 2 - triOffset + triSize);
					ctx.closePath();
					ctx.fill();

					// Subtle outline for visibility against various backgrounds
					ctx.strokeStyle = "rgba(0,0,0,0.6)";
					ctx.lineWidth = 0.5 * zoomScale;
					ctx.stroke();
				}
			}

			// Variable-strength formations keep one map marker while carrying
			// multiple standard formations. Ordinary 1x units remain unchanged.
			const hasVariableStrength =
				u.personnel !== undefined ||
				u.strengthMultiplier !== undefined ||
				u.health > CONFIG.UNIT_HEALTH * 1.15;
			if (currentZoom >= 3 && hasVariableStrength) {
				const nominalPersonnel =
					soldiersPerUnit[u.sideIndex] || CONFIG.UNIT_TO_SOLDIER_RATIO;
				const badge = getFormationStrengthBadge(u, {
					nominalPersonnel,
					baseHealth:
						u.maxHealth ||
						CONFIG.UNIT_HEALTH *
							(u.isAlpenjager ? CONFIG.ALPEN_HEALTH_MULT : 1),
					referencePersonnel: CONFIG.UNIT_TO_SOLDIER_RATIO,
				});
				if (badge.multiplier > 1.15) {
					drawFormationStrengthBadge(
						ctx,
						p,
						w,
						badge,
						zoomScale,
						sideColors[u.sideIndex]?.replace(rgbaRe, "1") || "#fff",
					);
				}
			}
		});
	}

	// PASS 5: Battle Clusters (Sword Emojis) - Viewport Culled
	if (isWar && showBattleIndicators) {
		const zoomScale = 1.3 ** (map.getZoom() - 3);
		activeBattles.forEach((b) => {
			if (!containsRenderPoint(drawBounds, b.lat, b.lng)) return;
			let p;
			try {
				p = project(b.lat, b.lng);
			} catch (_e) {
				return;
			}

			ctx.save();
			// Scale based on zoom and number of units in the battle
			const sizeMult = Math.min(2.0, 1.0 + b.participants / 15);
			const emojiSize = Math.max(18, 26 * zoomScale * sizeMult);

			ctx.font = `${emojiSize}px serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			ctx.shadowBlur = 0;
			ctx.shadowColor = "rgba(255,255,255,0.4)";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;

			// Pulsing animation
			const pulse = 0.9 + Math.sin(simFrameCount * 0.2) * 0.1;
			ctx.translate(p.x, p.y);
			ctx.scale(pulse, pulse);

			ctx.strokeStyle = "#e9d58d";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(-emojiSize / 3, -emojiSize / 3);
			ctx.lineTo(emojiSize / 3, emojiSize / 3);
			ctx.moveTo(emojiSize / 3, -emojiSize / 3);
			ctx.lineTo(-emojiSize / 3, emojiSize / 3);
			ctx.stroke();
			ctx.restore();
		});
	}
}
