// This pass receives a frame snapshot; surface caches stay on the map layer.
export function drawOverlays(frame) {
	const {
		viewportKey,
		isWar,
		showWarPlans,
		isCustomTerrain,
		refAboveTerrain,
		referenceImageUrl,
		refOpacity,
		simFrameCount,
		isPaused,
		RENDER_LAYERS,
		mainCtx,
		dpr,
		gameMode,
		referenceOverlay,
		godModeActive,
		map,
		worldWidthDeg,
		worldHeightDeg,
		L,
		getAiOperationsSnapshot,
		_aiDebugPlans,
		_navalPlan,
		_navalSupplyPlan,
		_transportPlan,
		_coastalDefensePlan,
		_neutralGarrisonPlan,
		drawAiOperationsOverlay,
		project,
		sideColors,
		_warPlan,
		sides,
		rgbaRe,
	} = frame;
	let { ctx } = frame;
	const overlaysCacheKey = [
		viewportKey,
		isWar ? 1 : 0,
		showWarPlans ? 1 : 0,
		isCustomTerrain ? 1 : 0,
		refAboveTerrain ? 1 : 0,
		referenceImageUrl || "",
		refOpacity,
		this._isCapturing ? 1 : 0,
		window.__mwAiOperationReveal?.uid || "",
	].join(";");
	const overlaysRefreshDue =
		isWar && showWarPlans && simFrameCount - this._lastOverlaysRenderFrame >= 5;
	const renderOverlays =
		!isWar ||
		isPaused ||
		(this._invalidLayers & RENDER_LAYERS.OVERLAYS) !== 0 ||
		this._overlaysCacheKey !== overlaysCacheKey ||
		overlaysRefreshDue;
	const overlaysCtx = this._overlaysSurface.getContext("2d", {
		willReadFrequently: false,
	});
	if (renderOverlays) {
		overlaysCtx.clearRect(
			0,
			0,
			this._overlaysSurface.width,
			this._overlaysSurface.height,
		);
		overlaysCtx.save();
		overlaysCtx.scale(dpr, dpr);
		if (frame.padding) overlaysCtx.translate(frame.padding, frame.padding);
		ctx = overlaysCtx;

		// Show the custom map extent only while editing it. Keeping this frame out of
		// simulations prevents the editor guide from leaking into live and final maps.
		// It should match the world size set before the map loads:
		// use explicit maxBounds if configured (blank canvas size), otherwise the full world.
		if (isCustomTerrain && gameMode === "EDITOR") {
			let boundsToUse = null;
			if (map.options.maxBounds) {
				boundsToUse = map.options.maxBounds;
			} else {
				const halfW = (worldWidthDeg || 360) / 2;
				const halfH = (worldHeightDeg || 180) / 2;
				boundsToUse = L.latLngBounds(
					L.latLng(-halfH, -halfW),
					L.latLng(halfH, halfW),
				);
			}

			if (boundsToUse) {
				try {
					const nw = boundsToUse.getNorthWest();
					const ne = boundsToUse.getNorthEast();
					const se = boundsToUse.getSouthEast();
					const sw = boundsToUse.getSouthWest();

					const pNW = map.latLngToContainerPoint(nw);
					const pNE = map.latLngToContainerPoint(ne);
					const pSE = map.latLngToContainerPoint(se);
					const pSW = map.latLngToContainerPoint(sw);

					ctx.save();
					ctx.strokeStyle = "rgba(255,255,255,0.9)";
					ctx.lineWidth = 2.0;
					ctx.setLineDash([6, 4]);
					ctx.beginPath();
					ctx.moveTo(pNW.x, pNW.y);
					ctx.lineTo(pNE.x, pNE.y);
					ctx.lineTo(pSE.x, pSE.y);
					ctx.lineTo(pSW.x, pSW.y);
					ctx.closePath();
					ctx.stroke();
					ctx.restore();
				} catch (_e) {
					// If projection fails (e.g. bounds offscreen), just skip drawing the frame.
				}
			}
		}

		// Draw Reference Image Guide (Over everything) when "Draw Above Terrain" is enabled.
		// Hidden during preview capture to ensure clean Hub thumbnails and exports.
		// This pass runs last so the reference image sits on top of terrain, countries, oceans, and units.
		if (
			!this._isCapturing &&
			refAboveTerrain &&
			referenceImageUrl &&
			referenceOverlay &&
			(gameMode === "EDITOR" || gameMode === "EDITOR_TEST" || godModeActive)
		) {
			const img = referenceOverlay.getElement();
			if (img?.complete && img.naturalWidth > 0) {
				const b = referenceOverlay.getBounds();
				const pTL = map.latLngToContainerPoint(b.getNorthWest());
				const pBR = map.latLngToContainerPoint(b.getSouthEast());
				ctx.save();
				ctx.globalAlpha = refOpacity;
				ctx.drawImage(img, pTL.x, pTL.y, pBR.x - pTL.x, pBR.y - pTL.y);
				ctx.restore();
			}
		}

		// Draw war plan arrows between warring sides
		if (isWar && showWarPlans) {
			const operationsSnapshot = getAiOperationsSnapshot();
			if (operationsSnapshot) {
				drawAiOperationsOverlay(
					ctx,
					operationsSnapshot,
					project,
					sideColors[operationsSnapshot.sideIndex] || "rgba(255, 196, 64, 0.9)",
					window.innerWidth < 480,
					window.__mwAiOperationReveal?.uid || null,
				);
			}
			for (let si = 0; !operationsSnapshot && si < _warPlan.length; si++) {
				const plan = _warPlan[si];
				if (!plan) continue;
				const owningSide = si >= sides.length ? si - sides.length : si;
				const color = sideColors[owningSide] || "rgba(255,255,0,0.6)";

				// DEFEND plan: draw dotted frontline line
				if (plan.type === "DEFEND" && plan.frontlinePoints?.length > 1) {
					ctx.save();
					ctx.strokeStyle = color.replace(rgbaRe, "0.5)");
					ctx.lineWidth = 2;
					ctx.setLineDash([6, 4]);
					ctx.beginPath();
					const fp0 = project(
						plan.frontlinePoints[0].lat,
						plan.frontlinePoints[0].lng,
					);
					ctx.moveTo(fp0.x, fp0.y);
					for (let fi = 1; fi < plan.frontlinePoints.length; fi++) {
						const fp = project(
							plan.frontlinePoints[fi].lat,
							plan.frontlinePoints[fi].lng,
						);
						ctx.lineTo(fp.x, fp.y);
					}
					ctx.stroke();
					ctx.setLineDash([]);

					// Label at midpoint
					const mid =
						plan.frontlinePoints[Math.floor(plan.frontlinePoints.length / 2)];
					const midP = project(mid.lat, mid.lng);
					ctx.font = "bold 9px monospace";
					ctx.fillStyle = color.replace(rgbaRe, "0.8)");
					ctx.fillText("DEFEND", midP.x + 8, midP.y - 6);
					if (plan.frontIntel) {
						ctx.font = "8px monospace";
						ctx.fillText(
							`FR ${plan.frontIntel.localRatio.toFixed(1)} P${Math.round(plan.frontIntel.pressureScore)}`,
							midP.x + 8,
							midP.y + 6,
						);
					}
					ctx.restore();
					continue;
				}

				// PUSH_FRONT: draw arrow from unit centroid to enemy territory centroid
				if (
					plan.type === "PUSH_FRONT" &&
					plan.arrowPoints &&
					plan.arrowPoints.length >= 2
				) {
					const pts = plan.arrowPoints;
					const p0 = project(pts[0].lat, pts[0].lng);
					const p1 = project(pts[1].lat, pts[1].lng);
					const midX = (p0.x + p1.x) / 2;
					const midY = (p0.y + p1.y) / 2 - 40;

					ctx.strokeStyle = color.replace(rgbaRe, "0.4)");
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 6]);
					ctx.beginPath();
					ctx.moveTo(p0.x, p0.y);
					ctx.quadraticCurveTo(midX, midY, p1.x, p1.y);
					ctx.stroke();
					ctx.setLineDash([]);

					ctx.font = "bold 9px monospace";
					ctx.fillStyle = color.replace(rgbaRe, "0.6)");
					ctx.fillText("PUSH", midX + 8, midY);
					if (plan.scoreBreakdown) {
						ctx.font = "8px monospace";
						ctx.fillText(
							`S${Math.round(plan.priority || 0)} R${plan.scoreBreakdown.effectiveForceRatio.toFixed(1)}`,
							midX + 8,
							midY + 12,
						);
					}
					continue;
				}

				if (!plan?.arrowPoints || plan.arrowPoints.length < 2) continue;
				const isDashed = plan.phase === "PREPARATION";
				ctx.strokeStyle = color.replace(rgbaRe, isDashed ? "0.4)" : "0.7)");
				ctx.lineWidth = Math.max(
					2,
					Math.min(6, 2 + Math.floor((plan.activeUnitCount || 0) / 5)),
				);
				if (isDashed) ctx.setLineDash([8, 6]);
				else ctx.setLineDash([]);

				ctx.beginPath();
				const pts = plan.arrowPoints;
				if (
					Number.isNaN(pts[0].lat) ||
					Number.isNaN(pts[0].lng) ||
					Number.isNaN(pts[1].lat) ||
					Number.isNaN(pts[1].lng)
				) {
					continue;
				}
				const p0 = project(pts[0].lat, pts[0].lng);
				const p1 = project(pts[1].lat, pts[1].lng);
				const midX = (p0.x + p1.x) / 2;
				const midY = (p0.y + p1.y) / 2 - 40;
				ctx.moveTo(p0.x, p0.y);
				ctx.quadraticCurveTo(midX, midY, p1.x, p1.y);
				ctx.stroke();
				ctx.setLineDash([]);

				const angle = Math.atan2(p1.y - midY, p1.x - midX);
				const headLen = 12;
				ctx.beginPath();
				ctx.moveTo(p1.x, p1.y);
				ctx.lineTo(
					p1.x - headLen * Math.cos(angle - 0.5),
					p1.y - headLen * Math.sin(angle - 0.5),
				);
				ctx.lineTo(
					p1.x - headLen * Math.cos(angle + 0.5),
					p1.y - headLen * Math.sin(angle + 0.5),
				);
				ctx.closePath();
				ctx.fillStyle = ctx.strokeStyle;
				ctx.fill();

				ctx.font = "bold 10px monospace";
				ctx.fillStyle = color;
				const planLabel = plan.type ? `${plan.type} ${plan.phase}` : plan.phase;
				ctx.fillText(planLabel, midX + 10, midY - 2);
				if (plan.scoreBreakdown) {
					ctx.font = "8px monospace";
					const theater = plan.theaterId ? ` ${plan.theaterId}` : "";
					ctx.fillText(
						`S${Math.round(plan.priority || 0)} R${plan.scoreBreakdown.effectiveForceRatio.toFixed(1)}${theater}`,
						midX + 10,
						midY + 10,
					);
				}
			}

			if (!operationsSnapshot && _aiDebugPlans?.length) {
				for (let si = 0; si < _aiDebugPlans.length; si++) {
					const debug = _aiDebugPlans[si];
					if (!debug?.fronts?.length) continue;
					const color = sideColors[si] || "rgba(255,255,0,0.6)";
					ctx.save();
					ctx.font = "8px monospace";
					ctx.fillStyle = color.replace(rgbaRe, "0.65)");
					for (const front of debug.fronts.slice(0, 2)) {
						const weak =
							_warPlan[si]?.frontIntel?.weakPoint ||
							_warPlan[si + sides.length]?.frontIntel?.weakPoint;
						if (!weak) continue;
						const p = project(weak.lat, weak.lng);
						ctx.fillText(
							`AI ${debug.strategy} FR ${front.localRatio.toFixed(1)} P${Math.round(front.pressureScore)}`,
							p.x + 8,
							p.y + 14,
						);
					}
					ctx.restore();
				}
			}

			// Draw naval invasion arrows (dashed, country-colored)
			if (typeof _navalPlan !== "undefined" && _navalPlan) {
				for (let si = 0; si < _navalPlan.length; si++) {
					if (operationsSnapshot && si !== operationsSnapshot.sideIndex)
						continue;
					const np = _navalPlan[si];
					if (!np?.arrowPoints || np.arrowPoints.length < 2) continue;
					const pts = np.arrowPoints;
					if (
						Number.isNaN(pts[0].lat) ||
						Number.isNaN(pts[0].lng) ||
						Number.isNaN(pts[1].lat) ||
						Number.isNaN(pts[1].lng)
					)
						continue;
					const p0 = project(pts[0].lat, pts[0].lng);
					const p1 = project(pts[1].lat, pts[1].lng);
					const midX = (p0.x + p1.x) / 2;
					const midY = (p0.y + p1.y) / 2 - 50;
					const sideColor = sideColors[si] || "rgba(255,255,0,0.6)";

					ctx.setLineDash([4, 4]);
					ctx.strokeStyle = sideColor.replace(rgbaRe, "0.75)");
					ctx.lineWidth = Math.max(
						2,
						Math.min(5, 2 + Math.floor((np.activeUnitCount || 0) / 3)),
					);
					ctx.beginPath();
					ctx.moveTo(p0.x, p0.y);
					ctx.quadraticCurveTo(midX, midY, p1.x, p1.y);
					ctx.stroke();
					ctx.setLineDash([]);

					const angle = Math.atan2(p1.y - midY, p1.x - midX);
					const headLen = 10;
					ctx.beginPath();
					ctx.moveTo(p1.x, p1.y);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle - 0.5),
						p1.y - headLen * Math.sin(angle - 0.5),
					);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle + 0.5),
						p1.y - headLen * Math.sin(angle + 0.5),
					);
					ctx.closePath();
					ctx.fillStyle = sideColor.replace(rgbaRe, "0.85)");
					ctx.fill();

					if (!operationsSnapshot || window.innerWidth >= 480) {
						ctx.font = "bold 9px monospace";
						ctx.fillStyle = sideColor.replace(rgbaRe, "0.9)");
						ctx.fillText(`NAVAL: ${np.phase}`, midX + 10, midY - 2);
					}
				}
			}

			// Draw naval supply arrows (dashed, country-colored)
			if (typeof _navalSupplyPlan !== "undefined" && _navalSupplyPlan) {
				for (let si = 0; si < _navalSupplyPlan.length; si++) {
					if (operationsSnapshot && si !== operationsSnapshot.sideIndex)
						continue;
					const sp = _navalSupplyPlan[si];
					if (!sp?.arrowPoints || sp.arrowPoints.length < 2) continue;
					const pts = sp.arrowPoints;
					if (
						Number.isNaN(pts[0].lat) ||
						Number.isNaN(pts[0].lng) ||
						Number.isNaN(pts[1].lat) ||
						Number.isNaN(pts[1].lng)
					)
						continue;
					const p0 = project(pts[0].lat, pts[0].lng);
					const p1 = project(pts[1].lat, pts[1].lng);
					const midX = (p0.x + p1.x) / 2;
					const midY = (p0.y + p1.y) / 2 - 50;
					const sideColor = sideColors[si] || "rgba(255,255,0,0.6)";

					ctx.setLineDash([3, 5]);
					ctx.strokeStyle = sideColor.replace(rgbaRe, "0.6)");
					ctx.lineWidth = Math.max(
						2,
						Math.min(4, 2 + Math.floor((sp.activeUnitCount || 0) / 3)),
					);
					ctx.beginPath();
					ctx.moveTo(p0.x, p0.y);
					ctx.quadraticCurveTo(midX, midY, p1.x, p1.y);
					ctx.stroke();
					ctx.setLineDash([]);

					const angle = Math.atan2(p1.y - midY, p1.x - midX);
					const headLen = 8;
					ctx.beginPath();
					ctx.moveTo(p1.x, p1.y);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle - 0.5),
						p1.y - headLen * Math.sin(angle - 0.5),
					);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle + 0.5),
						p1.y - headLen * Math.sin(angle + 0.5),
					);
					ctx.closePath();
					ctx.fillStyle = sideColor.replace(rgbaRe, "0.75)");
					ctx.fill();

					if (!operationsSnapshot || window.innerWidth >= 480) {
						ctx.font = "bold 8px monospace";
						ctx.fillStyle = sideColor.replace(rgbaRe, "0.85)");
						ctx.fillText(`SUPPLY: ${sp.phase}`, midX + 10, midY + 10);
					}
				}
			}

			// Draw transport arrows (dashed, side-colored, railway-style)
			if (
				!operationsSnapshot &&
				typeof _transportPlan !== "undefined" &&
				_transportPlan
			) {
				for (let si = 0; si < _transportPlan.length; si++) {
					const tp = _transportPlan[si];
					if (!tp?.arrowPoints || tp.arrowPoints.length < 2) continue;
					const pts = tp.arrowPoints;
					if (
						Number.isNaN(pts[0].lat) ||
						Number.isNaN(pts[0].lng) ||
						Number.isNaN(pts[1].lat) ||
						Number.isNaN(pts[1].lng)
					)
						continue;
					const p0 = project(pts[0].lat, pts[0].lng);
					const p1 = project(pts[1].lat, pts[1].lng);
					const midX = (p0.x + p1.x) / 2;
					const midY = (p0.y + p1.y) / 2 - 30;
					const sideColor = sideColors[si] || "rgba(255,255,0,0.6)";

					ctx.setLineDash([8, 4]);
					ctx.strokeStyle = sideColor.replace(rgbaRe, "0.5)");
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(p0.x, p0.y);
					ctx.quadraticCurveTo(midX, midY, p1.x, p1.y);
					ctx.stroke();
					ctx.setLineDash([]);

					const angle = Math.atan2(p1.y - midY, p1.x - midX);
					const headLen = 8;
					ctx.beginPath();
					ctx.moveTo(p1.x, p1.y);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle - 0.5),
						p1.y - headLen * Math.sin(angle - 0.5),
					);
					ctx.lineTo(
						p1.x - headLen * Math.cos(angle + 0.5),
						p1.y - headLen * Math.sin(angle + 0.5),
					);
					ctx.closePath();
					ctx.fillStyle = sideColor.replace(rgbaRe, "0.6)");
					ctx.fill();

					ctx.font = "bold 9px monospace";
					ctx.fillStyle = sideColor.replace(rgbaRe, "0.8)");
					ctx.fillText(
						`TRANSPORT (${tp.activeUnitCount || 0})`,
						midX + 10,
						midY - 2,
					);
				}
			}

			// Draw coastal defense zones (passive overlay, subtle)
			if (
				!operationsSnapshot &&
				typeof _coastalDefensePlan !== "undefined" &&
				_coastalDefensePlan
			) {
				for (let si = 0; si < sides.length; si++) {
					const color = sideColors[si] || "rgba(255,255,0,0.6)";
					for (let ci = 0; ci < 10; ci++) {
						const cp = _coastalDefensePlan[si * 10 + ci];
						if (!cp?.zonePolyline || cp.zonePolyline.length < 2) continue;
						const pts = cp.zonePolyline;

						ctx.strokeStyle = color.replace(rgbaRe, "0.25)");
						ctx.lineWidth = 1.5;
						ctx.setLineDash([2, 6]);
						ctx.beginPath();
						const p0 = project(pts[0].lat, pts[0].lng);
						ctx.moveTo(p0.x, p0.y);
						for (let pi = 1; pi < pts.length; pi++) {
							const pp = project(pts[pi].lat, pts[pi].lng);
							ctx.lineTo(pp.x, pp.y);
						}
						ctx.stroke();
						ctx.setLineDash([]);

						if (cp.target) {
							const tp = project(cp.target.lat, cp.target.lng);
							ctx.font = "bold 7px monospace";
							ctx.fillStyle = color.replace(rgbaRe, "0.35)");
							ctx.fillText(
								`COASTAL (${cp.activeUnitCount || 0})`,
								tp.x + 6,
								tp.y - 4,
							);
						}
					}
				}
			}

			// Draw neutral garrison zones (passive overlay, subtle)
			if (
				!operationsSnapshot &&
				typeof _neutralGarrisonPlan !== "undefined" &&
				_neutralGarrisonPlan
			) {
				for (let si = 0; si < sides.length; si++) {
					const color = sideColors[si] || "rgba(255,255,0,0.6)";
					for (let gi = 0; gi < 10; gi++) {
						const gp = _neutralGarrisonPlan[si * 10 + gi];
						if (!gp?.borderPolyline || gp.borderPolyline.length < 2) continue;
						const pts = gp.borderPolyline;

						ctx.strokeStyle = color.replace(rgbaRe, "0.2)");
						ctx.lineWidth = 1.0;
						ctx.setLineDash([3, 9]);
						ctx.beginPath();
						const p0 = project(pts[0].lat, pts[0].lng);
						ctx.moveTo(p0.x, p0.y);
						for (let pi = 1; pi < pts.length; pi++) {
							const pp = project(pts[pi].lat, pts[pi].lng);
							ctx.lineTo(pp.x, pp.y);
						}
						ctx.stroke();
						ctx.setLineDash([]);

						if (gp.target) {
							const tp = project(gp.target.lat, gp.target.lng);
							ctx.font = "bold 7px monospace";
							ctx.fillStyle = color.replace(rgbaRe, "0.3)");
							ctx.fillText(
								`GARRISON (${gp.activeUnitCount || 0})`,
								tp.x + 6,
								tp.y - 4,
							);
						}
					}
				}
			}
		}

		ctx.restore();
		this._overlaysCacheKey = overlaysCacheKey;
		this._lastOverlaysRenderFrame = simFrameCount;
		this._invalidLayers &= ~RENDER_LAYERS.OVERLAYS;
	}
	if (this._compositeLayers !== false)
		mainCtx.drawImage(this._overlaysSurface, 0, 0);
}
