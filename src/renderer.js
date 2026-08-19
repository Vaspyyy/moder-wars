import L from "leaflet";
import { getAirfieldCapacity } from "./combined-arms.js";
import { CONFIG } from "./config.js";
import {
	getFormationPersonnel,
	getFormationStrengthBadge,
} from "./formation-strength.js";
import {
	_aiDebugPlans,
	_allianceCacheDirty,
	_coastalDefensePlan,
	_navalPlan,
	_navalSupplyPlan,
	_neutralGarrisonPlan,
	_transportPlan,
	_warPlan,
	activeBattles,
	activeTheaterCities,
	airfields,
	airWings,
	allianceViewEnabled,
	bases,
	biomeMask,
	bombs,
	cinematicMode,
	cities,
	clearAllianceCacheDirty,
	countryCasualties,
	countryMetadata,
	disableCountryGradient,
	dominantSideMap,
	editingCountryId,
	explosions,
	flagProcessedBuffer,
	gameMode,
	gameState,
	getAiObserverSnapshot,
	getCookie,
	getGridIndex,
	godModeActive,
	gridHeight,
	gridWidth,
	hideCurvedLabels,
	imagerySelect,
	influenceLayer,
	initialCombatants,
	isCustomTerrain,
	isPaused,
	landMask,
	MAX_SIDES,
	map,
	mountainsEnabled,
	occupationMap,
	preGodModeState,
	primaryOccupierMap,
	refAboveTerrain,
	referenceImageUrl,
	referenceOverlay,
	refOpacity,
	rgbaRe,
	showBattleIndicators,
	showCountryLabels,
	showNonCapitalCities,
	showUnitsVisually,
	showWarPlans,
	sideColors,
	sideInfluenceMaps,
	sides,
	simFrameCount,
	simSpeed,
	soldiersPerUnit,
	terrainMask,
	UNIT_HASH_CELL_SIZE,
	unitSpatialHash,
	units,
	viewMode,
	worldControlMap,
	worldHeightDeg,
	worldWidthDeg,
} from "./main.js";

function drawFormationStrengthBadge(
	ctx,
	point,
	markerWidth,
	badge,
	zoomScale,
	color,
) {
	if (!badge?.visible || !badge.text) return;
	ctx.save();
	const fontSize = Math.max(6, Math.min(10, 6 * zoomScale));
	ctx.font = `900 ${fontSize}px monospace`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	const paddingX = Math.max(2, 2 * zoomScale);
	const badgeHeight = fontSize + Math.max(2, 2 * zoomScale);
	const badgeWidth = ctx.measureText(badge.text).width + paddingX * 2;
	const badgeX = point.x + markerWidth / 2 + Math.max(1, zoomScale);
	const badgeY = point.y - badgeHeight / 2;
	ctx.fillStyle = "rgba(7, 9, 11, 0.86)";
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(0.75, 0.75 * zoomScale);
	ctx.beginPath();
	if (typeof ctx.roundRect === "function") {
		ctx.roundRect(
			badgeX,
			badgeY,
			badgeWidth,
			badgeHeight,
			Math.max(2, 2 * zoomScale),
		);
	} else {
		ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
	}
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = "#f3f5f7";
	ctx.fillText(badge.text, badgeX + paddingX, point.y);
	ctx.restore();
}

function isMapPoint(point) {
	return (
		point &&
		point.lat !== null &&
		point.lat !== undefined &&
		point.lng !== null &&
		point.lng !== undefined &&
		Number.isFinite(Number(point.lat)) &&
		Number.isFinite(Number(point.lng))
	);
}

function normalizedReadiness(value) {
	if (value === null || value === undefined || value === "") return null;
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function drawOperationPolyline(ctx, project, points) {
	const validPoints = (Array.isArray(points) ? points : []).filter(isMapPoint);
	if (validPoints.length < 2) return [];
	const projected = validPoints.map((point) => project(point.lat, point.lng));
	ctx.beginPath();
	ctx.moveTo(projected[0].x, projected[0].y);
	for (let index = 1; index < projected.length; index++) {
		ctx.lineTo(projected[index].x, projected[index].y);
	}
	ctx.stroke();
	return projected;
}

function drawOperationAnchor(ctx, point, kind, color) {
	if (!point) return;
	ctx.save();
	ctx.translate(point.x, point.y);
	ctx.strokeStyle = color;
	ctx.fillStyle = "rgba(8, 10, 12, 0.82)";
	ctx.lineWidth = 1.6;
	ctx.setLineDash([]);
	if (kind === "objective") {
		ctx.rotate(Math.PI / 4);
		ctx.beginPath();
		ctx.rect(-5, -5, 10, 10);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(-8, 0);
		ctx.lineTo(8, 0);
		ctx.moveTo(0, -8);
		ctx.lineTo(0, 8);
		ctx.stroke();
	} else if (kind === "withdrawal") {
		ctx.setLineDash([2, 2]);
		ctx.strokeRect(-4, -4, 8, 8);
	} else {
		ctx.beginPath();
		ctx.arc(0, 0, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, 8, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

function drawAiOperationsOverlay(
	ctx,
	snapshot,
	project,
	color,
	compact,
	revealedTaskForceUid = null,
) {
	const taskForces = Array.isArray(snapshot.taskForces)
		? snapshot.taskForces.slice(0, 6)
		: [];
	for (const taskForce of taskForces) {
		const assembly = isMapPoint(taskForce.assemblyArea)
			? project(taskForce.assemblyArea.lat, taskForce.assemblyArea.lng)
			: null;
		const objective = isMapPoint(taskForce.objective)
			? project(taskForce.objective.lat, taskForce.objective.lng)
			: null;
		const withdrawal = isMapPoint(taskForce.withdrawalAnchor)
			? project(taskForce.withdrawalAnchor.lat, taskForce.withdrawalAnchor.lng)
			: null;
		const route = [
			taskForce.assemblyArea,
			...(Array.isArray(taskForce.corridor) ? taskForce.corridor : []),
			taskForce.objective,
		].filter(isMapPoint);
		const phase = String(taskForce.phase || "FORMING").toUpperCase();
		const readiness = normalizedReadiness(taskForce.readiness);
		const isPreparing = ["FORMING", "ASSEMBLING", "REGROUPING"].includes(phase);

		ctx.save();
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.1;
		ctx.lineWidth = 11;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		drawOperationPolyline(ctx, project, route);
		ctx.globalAlpha = isPreparing ? 0.58 : 0.82;
		ctx.lineWidth = 2.5;
		ctx.setLineDash(isPreparing ? [8, 6] : []);
		const routePoints = drawOperationPolyline(ctx, project, route);
		ctx.setLineDash([]);

		if (routePoints.length >= 2) {
			const tip = routePoints.at(-1);
			const previous = routePoints.at(-2);
			const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
			ctx.beginPath();
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(
				tip.x - 11 * Math.cos(angle - 0.48),
				tip.y - 11 * Math.sin(angle - 0.48),
			);
			ctx.lineTo(
				tip.x - 11 * Math.cos(angle + 0.48),
				tip.y - 11 * Math.sin(angle + 0.48),
			);
			ctx.closePath();
			ctx.fillStyle = color;
			ctx.fill();
		}

		ctx.globalAlpha = 0.62;
		ctx.lineWidth = 2;
		ctx.setLineDash([3, 4]);
		drawOperationPolyline(ctx, project, taskForce.frontage);
		ctx.setLineDash([]);
		ctx.globalAlpha = 0.92;
		drawOperationAnchor(ctx, assembly, "assembly", color);
		drawOperationAnchor(ctx, objective, "objective", color);
		drawOperationAnchor(ctx, withdrawal, "withdrawal", color);

		if (withdrawal && routePoints.length) {
			const origin = routePoints[0];
			ctx.globalAlpha = 0.38;
			ctx.setLineDash([3, 6]);
			ctx.beginPath();
			ctx.moveTo(origin.x, origin.y);
			ctx.lineTo(withdrawal.x, withdrawal.y);
			ctx.stroke();
			ctx.setLineDash([]);
		}

		const labelPoint = objective || routePoints.at(-1) || assembly;
		if (
			labelPoint &&
			(!compact ||
				String(taskForce.uid || taskForce.id) === revealedTaskForceUid)
		) {
			const readinessLabel =
				readiness === null ? "" : ` · ${Math.round(readiness * 100)}% READY`;
			const objectiveLabel = compact
				? ""
				: String(taskForce.objective?.label || taskForce.label || "").trim();
			const label = `${phase}${readinessLabel}${objectiveLabel ? ` · ${objectiveLabel}` : ""}`;
			ctx.globalAlpha = 0.92;
			ctx.font = `800 ${compact ? 8 : 9}px monospace`;
			const width = ctx.measureText(label).width;
			ctx.fillStyle = "rgba(8, 10, 12, 0.84)";
			ctx.fillRect(labelPoint.x + 8, labelPoint.y - 16, width + 8, 14);
			ctx.fillStyle = color;
			ctx.fillText(label, labelPoint.x + 12, labelPoint.y - 6);
		}
		ctx.restore();
	}

	const contacts = Array.isArray(snapshot.contacts)
		? snapshot.contacts.slice(0, compact ? 10 : 18)
		: [];
	for (const [index, contact] of contacts.entries()) {
		if (!isMapPoint(contact.position)) continue;
		const point = project(contact.position.lat, contact.position.lng);
		const rawConfidence = Number(contact.confidence);
		const confidence =
			contact.confidence !== null &&
			contact.confidence !== undefined &&
			Number.isFinite(rawConfidence)
				? Math.max(
						0.15,
						Math.min(
							1,
							rawConfidence > 1 ? rawConfidence / 100 : rawConfidence,
						),
					)
				: 0.5;
		const age = Math.max(0, Number(contact.ageTicks) || 0);
		const ageFade = Math.max(0.18, 1 / (1 + age / 180));
		const alpha = Math.min(contact.stale ? 0.34 : 0.88, confidence * ageFade);
		const power = Math.max(0, Number(contact.estimatedCombatPower) || 0);
		const radius = Math.max(4, Math.min(9, 4 + Math.log10(power + 1)));
		ctx.save();
		ctx.translate(point.x, point.y);
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = "#ffad42";
		ctx.fillStyle = "rgba(15, 8, 3, 0.76)";
		ctx.lineWidth = 1.5;
		ctx.setLineDash(contact.stale ? [2, 3] : []);
		ctx.rotate(Math.PI / 4);
		ctx.beginPath();
		ctx.rect(-radius, -radius, radius * 2, radius * 2);
		ctx.fill();
		ctx.stroke();
		ctx.rotate(-Math.PI / 4);
		ctx.beginPath();
		ctx.moveTo(-radius - 3, 0);
		ctx.lineTo(radius + 3, 0);
		ctx.moveTo(0, -radius - 3);
		ctx.lineTo(0, radius + 3);
		ctx.stroke();
		ctx.restore();

		if (!compact && index < 6) {
			const source = String(contact.source || "CONTACT").toUpperCase();
			const status = contact.stale
				? "STALE"
				: `${Math.round(confidence * 100)}%`;
			ctx.save();
			ctx.globalAlpha = Math.max(0.35, alpha);
			ctx.font = "700 8px monospace";
			ctx.fillStyle = "#ffbd69";
			ctx.fillText(`${source} · ${status}`, point.x + radius + 6, point.y + 3);
			ctx.restore();
		}
	}
}

const _allianceCache = {
	metaLen: -1,
	metaMaxId: -1,
	keyById: null,
	colorByRoot: {},
	flagMetaByRoot: {},
};

const RENDER_LAYERS = Object.freeze({
	NONE: 0,
	STATIC: 1 << 0,
	DYNAMIC: 1 << 1,
	LABELS: 1 << 2,
	OVERLAYS: 1 << 3,
	ALL: (1 << 4) - 1,
});

const CONTROL_DIRTY_TILE_SIZE = 32;
const CONTROL_DIRTY_TILE_LIMIT = 4096;

function createRenderSurface() {
	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	return canvas;
}

function getBoundsCacheKey(bounds) {
	return [
		bounds.getWest(),
		bounds.getSouth(),
		bounds.getEast(),
		bounds.getNorth(),
	].join(":");
}

const ControlMapLayer = L.Layer.extend({
	onAdd: function (map) {
		// Create a canvas that is viewport-locked rather than layer-locked to ensure
		// screen-space coordinates (container points) map 1:1 without parent transform interference.
		this._container = L.DomUtil.create("canvas", "");
		this._container.style.position = "absolute";
		this._container.style.top = "0";
		this._container.style.left = "0";
		this._container.style.pointerEvents = "none";
		this._container.style.zIndex = "400";
		this._staticSurface = createRenderSurface();
		this._labelsSurface = createRenderSurface();
		this._overlaysSurface = createRenderSurface();

		this._lastZoom = map.getZoom();
		this._renderRequested = false;
		this._renderRaf = 0;
		this._invalidLayers = RENDER_LAYERS.ALL;
		this._staticCacheKey = "";
		this._cachedRegions = [];
		this._gridProjectionCache = null;
		this._materialCache = null;
		this._dirtyControlTiles = new Set();
		this._allControlTilesDirty = true;
		this._controlChangeTrackingEnabled = false;
		this._lastStaticRenderFrame = Number.NEGATIVE_INFINITY;
		this._lastLabelsRenderFrame = Number.NEGATIVE_INFINITY;
		this._lastOverlaysRenderFrame = Number.NEGATIVE_INFINITY;
		this._labelsCacheKey = "";
		this._overlaysCacheKey = "";
		this._regionsRevision = 0;
		this._visitId = 0;
		this._zooming = false;
		this._zoomSettlePending = false;
		this._renderedZoom = map.getZoom();
		this._renderedCenter = map.getCenter();

		// Append to map container directly to avoid double-transforms from mapPane/overlayPane
		map.getContainer().appendChild(this._container);

		this._update();

		this._onMove = () => {
			const nextBounds = map.getBounds();
			if (this._lastBounds?.equals(nextBounds)) return;
			this._lastBounds = nextBounds;
			this.requestRender(RENDER_LAYERS.ALL);
		};
		this._onTileLoad = () => {
			if (!cinematicMode && !this._isCapturing) return;
			this.requestRender(RENDER_LAYERS.STATIC);
		};

		this._onZoomStart = () => {
			this._zooming = true;
			this._container.style.willChange = "transform";
		};

		this._onZoomAnim = (e) => {
			// The canvas is viewport-locked, so it does not inherit Leaflet's
			// animated map-pane transform. Always transform from the last completed
			// canvas render so chained wheel gestures cannot accumulate drift.
			const baseZoom = this._renderedZoom ?? map.getZoom();
			const baseCenter = this._renderedCenter ?? map.getCenter();
			const viewportCenter = map.getSize().divideBy(2);
			const baseCenterWorld = map.project(baseCenter, baseZoom);
			const targetCenterWorld = map.project(e.center, baseZoom);
			const oldTargetCenter = targetCenterWorld
				.subtract(baseCenterWorld)
				.add(viewportCenter);
			const scale = map.getZoomScale(e.zoom, baseZoom);
			const offset = viewportCenter.subtract(oldTargetCenter.multiplyBy(scale));
			this._container.style.transformOrigin = "0 0";
			L.DomUtil.setTransform(this._container, offset, scale);
		};

		this._onZoomEnd = () => {
			this._zooming = false;
			this._lastBounds = map.getBounds();
			this._zoomSettlePending = true;
			// Keep the transformed old frame visible until one complete final-zoom
			// render can replace it atomically. requestRender schedules that frame in
			// paused/menu views; the simulation loop force-admits it during a live war.
			this.requestRender(RENDER_LAYERS.ALL);
		};

		map.on("move", this._onMove, this);
		map.on("moveend", this._onMove, this);
		map.on("zoomstart", this._onZoomStart, this);
		map.on("zoomanim", this._onZoomAnim, this);
		map.on("zoomend", this._onZoomEnd, this);
		map.on("tileload", this._onTileLoad, this);
		this._tilePane = map.getPane("tilePane");
		this._tilePane?.addEventListener("load", this._onTileLoad, true);
	},
	onRemove: function (map) {
		if (this._renderRaf) cancelAnimationFrame(this._renderRaf);
		this._renderRaf = 0;
		this._renderRequested = false;
		this._zoomSettlePending = false;
		if (this._container?.parentNode) {
			this._container.parentNode.removeChild(this._container);
		}
		map.off("move", this._onMove, this);
		map.off("moveend", this._onMove, this);
		map.off("zoomstart", this._onZoomStart, this);
		map.off("zoomanim", this._onZoomAnim, this);
		map.off("zoomend", this._onZoomEnd, this);
		map.off("tileload", this._onTileLoad, this);
		this._tilePane?.removeEventListener("load", this._onTileLoad, true);
		this._tilePane = null;
	},

	/**
	 * Marks renderer-owned caches stale without forcing an immediate paint.
	 * Callers can combine RENDER_LAYERS masks.
	 */
	invalidate: function (layerMask = RENDER_LAYERS.ALL) {
		this._invalidLayers = (this._invalidLayers || 0) | layerMask;
		if (layerMask & RENDER_LAYERS.STATIC) this._staticCacheKey = "";
		if (layerMask & RENDER_LAYERS.LABELS) this._labelsCacheKey = "";
		if (layerMask & RENDER_LAYERS.OVERLAYS) this._overlaysCacheKey = "";
	},

	_simulationOwnsRendering: () =>
		!isPaused &&
		(gameState === "SIMULATING" ||
			(godModeActive && preGodModeState === "SIMULATING")),

	hasPendingZoomSettle: function () {
		return this._zoomSettlePending === true && !this._zooming;
	},

	_commitZoomSettle: function () {
		if (!this._zoomSettlePending) return;
		this._zoomSettlePending = false;
		this._container.style.transform = "";
		this._container.style.transformOrigin = "";
		this._container.style.willChange = "";
	},

	/**
	 * Coalesces multiple paint requests into one animation-frame callback.
	 * `render()` remains synchronous for capture/export compatibility.
	 */
	requestRender: function (layerMask = RENDER_LAYERS.DYNAMIC) {
		this.invalidate(layerMask);
		// The simulation loop performs spike-aware render admission. Renderer-owned
		// callbacks during an active war can otherwise bypass that admission or paint
		// the same frame twice. Paused/non-war views still receive immediate updates.
		if (this._simulationOwnsRendering()) return;
		if (this._renderRaf) return;
		this._renderRequested = true;
		this._renderRaf = requestAnimationFrame(() => {
			this._renderRaf = 0;
			this._renderRequested = false;
			if (this._zooming) return;
			this.render();
		});
	},

	/**
	 * Enables cache reuse while a war is running. The owner must then report every
	 * controller/occupier mutation through notifyControlCellsChanged(), and call
	 * invalidate(STATIC) for bulk world replacement or political-style changes.
	 */
	setControlChangeTrackingEnabled: function (enabled = true) {
		this._controlChangeTrackingEnabled = Boolean(enabled);
		this._allControlTilesDirty = true;
		this.invalidate(RENDER_LAYERS.STATIC);
	},

	/**
	 * Records dirty 32x32 control-grid tiles. Offscreen changes remain queued and
	 * invalidate the political surface only when that portion of the map is shown.
	 * Accepts one cell index or any iterable of cell indices.
	 */
	notifyControlCellsChanged: function (cellIndices) {
		if (cellIndices === null || cellIndices === undefined) return;
		this._controlChangeTrackingEnabled = true;
		const iterable =
			typeof cellIndices === "number" ? [cellIndices] : cellIndices;
		if (!iterable?.[Symbol.iterator]) {
			this._allControlTilesDirty = true;
			this.requestRender(RENDER_LAYERS.STATIC | RENDER_LAYERS.DYNAMIC);
			return;
		}
		for (const rawIndex of iterable) {
			const cellIndex = Number(rawIndex);
			if (
				!Number.isInteger(cellIndex) ||
				cellIndex < 0 ||
				cellIndex >= gridWidth * gridHeight
			)
				continue;
			const x = cellIndex % gridWidth;
			const y = Math.floor(cellIndex / gridWidth);
			const tileX = Math.floor(x / CONTROL_DIRTY_TILE_SIZE);
			const tileY = Math.floor(y / CONTROL_DIRTY_TILE_SIZE);
			const tileColumns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
			this._dirtyControlTiles.add(tileY * tileColumns + tileX);
			if (this._dirtyControlTiles.size > CONTROL_DIRTY_TILE_LIMIT) {
				this._dirtyControlTiles.clear();
				this._allControlTilesDirty = true;
				break;
			}
		}
		// The simulation loop owns wartime paint admission. Scheduling an additional
		// rAF here would bypass spike-aware render deferral and can paint twice in one
		// visual frame. The dirty tile remains queued until the admitted render.
		this.invalidate(RENDER_LAYERS.DYNAMIC);
		this.requestRender(RENDER_LAYERS.DYNAMIC);
	},

	_getVisibleDirtyControlTileKeys: function (xMin, xMax, yMin, yMax) {
		const result = new Set();
		if (!this._dirtyControlTiles?.size) return result;
		const tileColumns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
		const tileRows = Math.ceil(gridHeight / CONTROL_DIRTY_TILE_SIZE);
		const visibleTileXMin = Math.floor(xMin / CONTROL_DIRTY_TILE_SIZE);
		const visibleTileXMax = Math.floor(xMax / CONTROL_DIRTY_TILE_SIZE);
		const visibleTileYMin = Math.floor(yMin / CONTROL_DIRTY_TILE_SIZE);
		const visibleTileYMax = Math.floor(yMax / CONTROL_DIRTY_TILE_SIZE);

		for (const tileKey of this._dirtyControlTiles) {
			const tileX = tileKey % tileColumns;
			const tileY = Math.floor(tileKey / tileColumns);
			// Repaint one neighboring tile around a mutation so coastlines,
			// frontlines and greedy meshes crossing a tile edge remain seamless.
			for (let offsetY = -1; offsetY <= 1; offsetY++) {
				const paintTileY = tileY + offsetY;
				if (
					paintTileY < 0 ||
					paintTileY >= tileRows ||
					paintTileY < visibleTileYMin ||
					paintTileY > visibleTileYMax
				)
					continue;
				for (let offsetX = -1; offsetX <= 1; offsetX++) {
					const paintTileX = tileX + offsetX;
					if (
						paintTileX < 0 ||
						paintTileX >= tileColumns ||
						paintTileX < visibleTileXMin ||
						paintTileX > visibleTileXMax
					)
						continue;
					result.add(paintTileY * tileColumns + paintTileX);
				}
			}
		}
		return result;
	},

	_clearVisibleControlTiles: function (xMin, xMax, yMin, yMax) {
		this._allControlTilesDirty = false;
		if (!this._dirtyControlTiles?.size) return;
		const tileXMin = Math.floor(xMin / CONTROL_DIRTY_TILE_SIZE);
		const tileXMax = Math.floor(xMax / CONTROL_DIRTY_TILE_SIZE);
		const tileYMin = Math.floor(yMin / CONTROL_DIRTY_TILE_SIZE);
		const tileYMax = Math.floor(yMax / CONTROL_DIRTY_TILE_SIZE);
		const tileColumns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
		for (let tileY = tileYMin; tileY <= tileYMax; tileY++) {
			for (let tileX = tileXMin; tileX <= tileXMax; tileX++) {
				this._dirtyControlTiles.delete(tileY * tileColumns + tileX);
			}
		}
	},
	_update: function () {
		// During zoom animation, CSS transform handles the visual zoom.
		// Skip expensive canvas re-render — zoomend will re-render at final zoom.
		if (this._zooming) return;

		const size = map.getSize();
		const dpr = window.devicePixelRatio || 1;
		const newW = Math.round(size.x * dpr);
		const newH = Math.round(size.y * dpr);

		if (this._container.width !== newW || this._container.height !== newH) {
			this._container.width = newW;
			this._container.height = newH;
			this._container.style.width = `${size.x}px`;
			this._container.style.height = `${size.y}px`;
			this._staticSurface.width = newW;
			this._staticSurface.height = newH;
			this._labelsSurface.width = newW;
			this._labelsSurface.height = newH;
			this._overlaysSurface.width = newW;
			this._overlaysSurface.height = newH;
			this._gridProjectionCache = null;
			this.invalidate(RENDER_LAYERS.ALL);
		}

		const isSimulating =
			(gameState === "SIMULATING" ||
				(godModeActive && preGodModeState === "SIMULATING")) &&
			!isPaused;
		const currentBounds = map.getBounds();
		const mapMoved = !this._lastBounds?.equals(currentBounds);
		if (mapMoved) this._lastBounds = currentBounds;
		if (mapMoved) this.invalidate(RENDER_LAYERS.ALL);
		if (this._forceRender) this.invalidate(RENDER_LAYERS.ALL);

		if (isSimulating || mapMoved || this._forceRender) {
			this.render();
			this._forceRender = false;
		}
	},
	render: function () {
		const _r0 = performance.now();
		if (!worldControlMap || !landMask) return;
		// The animated CSS transform owns presentation until zoomend. The main
		// simulation loop calls render() directly, so it needs the same guard as
		// renderer-owned requestAnimationFrame callbacks.
		if (this._zooming) return;
		if (this._renderRaf) {
			cancelAnimationFrame(this._renderRaf);
			this._renderRaf = 0;
			this._renderRequested = false;
		}
		if (this._forceRender) {
			this.invalidate(RENDER_LAYERS.ALL);
			this._forceRender = false;
		}
		const viewBounds = map.getBounds();
		this._lastBounds = viewBounds;
		const bounds = viewBounds;
		const res = CONFIG.GRID_RES;
		const currentZoom = map.getZoom();
		const _ll = [0, 0];
		const project = (lat, lng) => {
			_ll[0] = lat;
			_ll[1] = lng;
			return map.latLngToContainerPoint(_ll);
		};

		// SATELLITE ENGINE STABILIZATION:
		// Handle longitude wrap-around (e.g. crossing the 180 meridian).
		// If the viewport wraps or is zoomed out enough to see the whole world,
		// we default to the full horizontal grid span to prevent negative width RangeErrors.
		let xMin = Math.max(0, Math.floor((bounds.getWest() + 180) / res));
		let xMax = Math.min(
			gridWidth - 1,
			Math.ceil((bounds.getEast() + 180) / res),
		);

		if (xMin > xMax || bounds.getEast() - bounds.getWest() >= 360) {
			xMin = 0;
			xMax = gridWidth - 1;
		}

		const yMin = Math.max(0, Math.floor((bounds.getSouth() + 90) / res));
		const yMax = Math.min(
			gridHeight - 1,
			Math.ceil((bounds.getNorth() + 90) / res),
		);

		const terrain = terrainMask;
		const mainCtx = this._container.getContext("2d", {
			willReadFrequently: false,
		});
		const dpr = window.devicePixelRatio || 1;
		const mapSize = map.getSize();
		const surfaceWidth = Math.round(mapSize.x * dpr);
		const surfaceHeight = Math.round(mapSize.y * dpr);
		if (
			this._container.width !== surfaceWidth ||
			this._container.height !== surfaceHeight
		) {
			this._container.width = surfaceWidth;
			this._container.height = surfaceHeight;
			this._container.style.width = `${mapSize.x}px`;
			this._container.style.height = `${mapSize.y}px`;
			this._staticSurface.width = surfaceWidth;
			this._staticSurface.height = surfaceHeight;
			this._labelsSurface.width = surfaceWidth;
			this._labelsSurface.height = surfaceHeight;
			this._overlaysSurface.width = surfaceWidth;
			this._overlaysSurface.height = surfaceHeight;
			this._gridProjectionCache = null;
			this.invalidate(RENDER_LAYERS.ALL);
		}
		const isWar =
			gameState === "SIMULATING" ||
			(godModeActive && preGodModeState === "SIMULATING");
		// Use the active dropdown value rather than the cookie to support non-persisted session-only mode switches
		const currentImagery = imagerySelect
			? imagerySelect.value
			: getCookie("mw_imagery") || "arcgis";
		const isSimplifiedMode = currentImagery === "wargames";
		// Custom terrain maps always use the Simplified/WarGames base (ocean/neutral land) for visual clarity
		const useSimplifiedBase = isSimplifiedMode || isCustomTerrain;
		const isEditing =
			gameMode === "EDITOR" || gameMode === "EDITOR_TEST" || godModeActive;
		const viewportKey = `${map.getZoom()}:${getBoundsCacheKey(bounds)}:${this._container.width}x${this._container.height}`;
		const sideKey = sides
			.map((side) => side.map((country) => country?.id || 0).join(","))
			.join("|");
		const staticCacheKey = [
			viewportKey,
			viewMode,
			currentImagery,
			useSimplifiedBase ? 1 : 0,
			mountainsEnabled ? 1 : 0,
			disableCountryGradient ? 1 : 0,
			allianceViewEnabled ? 1 : 0,
			showCountryLabels ? 1 : 0,
			isWar ? 1 : 0,
			gameMode,
			cinematicMode ? 1 : 0,
			this._isCapturing ? 1 : 0,
			refAboveTerrain ? 1 : 0,
			referenceImageUrl || "",
			refOpacity,
			simSpeed,
			countryMetadata.length,
			sideKey,
			sideColors.join("|"),
		].join(";");
		const canReuseStaticSurface =
			this._controlChangeTrackingEnabled && isWar && !isEditing;
		const dirtyControlPaintTiles = this._allControlTilesDirty
			? new Set()
			: this._getVisibleDirtyControlTileKeys(xMin, xMax, yMin, yMax);
		const hasVisibleControlChanges =
			this._allControlTilesDirty || dirtyControlPaintTiles.size > 0;
		const politicalBatchFrames = isPaused
			? 1
			: simSpeed >= 5
				? 10
				: simSpeed >= 3
					? 8
					: simSpeed >= 2
						? 4
						: 2;
		const politicalRefreshDue =
			isPaused ||
			simFrameCount - this._lastStaticRenderFrame >= politicalBatchFrames;
		const fullStaticRefresh =
			!canReuseStaticSurface ||
			(this._invalidLayers & RENDER_LAYERS.STATIC) !== 0 ||
			this._staticCacheKey !== staticCacheKey ||
			_allianceCacheDirty ||
			this._allControlTilesDirty ||
			(viewMode === "FLAG" && hasVisibleControlChanges && politicalRefreshDue);
		const partialControlRedraw =
			!fullStaticRefresh && hasVisibleControlChanges && politicalRefreshDue;
		const renderStatic = fullStaticRefresh || partialControlRedraw;
		const controlTileColumns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
		const isStaticCellInPaintTiles = (x, y) => {
			if (!partialControlRedraw) return true;
			const tileX = Math.floor(x / CONTROL_DIRTY_TILE_SIZE);
			const tileY = Math.floor(y / CONTROL_DIRTY_TILE_SIZE);
			return dirtyControlPaintTiles.has(tileY * controlTileColumns + tileX);
		};
		const staticPaintGridBounds = {
			xMin,
			xMax,
			yMin,
			yMax,
		};
		if (partialControlRedraw) {
			staticPaintGridBounds.xMin = gridWidth;
			staticPaintGridBounds.xMax = 0;
			staticPaintGridBounds.yMin = gridHeight;
			staticPaintGridBounds.yMax = 0;
			for (const tileKey of dirtyControlPaintTiles) {
				const tileX = tileKey % controlTileColumns;
				const tileY = Math.floor(tileKey / controlTileColumns);
				staticPaintGridBounds.xMin = Math.min(
					staticPaintGridBounds.xMin,
					Math.max(xMin, tileX * CONTROL_DIRTY_TILE_SIZE - 1),
				);
				staticPaintGridBounds.xMax = Math.max(
					staticPaintGridBounds.xMax,
					Math.min(xMax, (tileX + 1) * CONTROL_DIRTY_TILE_SIZE + 1),
				);
				staticPaintGridBounds.yMin = Math.min(
					staticPaintGridBounds.yMin,
					Math.max(yMin, tileY * CONTROL_DIRTY_TILE_SIZE - 1),
				);
				staticPaintGridBounds.yMax = Math.max(
					staticPaintGridBounds.yMax,
					Math.min(yMax, (tileY + 1) * CONTROL_DIRTY_TILE_SIZE + 1),
				);
			}
		}
		const staticCtx = this._staticSurface.getContext("2d", {
			willReadFrequently: false,
		});
		let ctx = staticCtx;

		if (renderStatic) {
			if (fullStaticRefresh) {
				ctx.clearRect(
					0,
					0,
					this._staticSurface.width,
					this._staticSurface.height,
				);
			}
			ctx.save();
			ctx.scale(dpr, dpr);
			if (partialControlRedraw) {
				ctx.beginPath();
				for (const tileKey of dirtyControlPaintTiles) {
					const tileX = tileKey % controlTileColumns;
					const tileY = Math.floor(tileKey / controlTileColumns);
					const cellX0 = Math.max(xMin, tileX * CONTROL_DIRTY_TILE_SIZE - 1);
					const cellX1 = Math.min(
						xMax + 1,
						(tileX + 1) * CONTROL_DIRTY_TILE_SIZE + 1,
					);
					const cellY0 = Math.max(yMin, tileY * CONTROL_DIRTY_TILE_SIZE - 1);
					const cellY1 = Math.min(
						yMax + 1,
						(tileY + 1) * CONTROL_DIRTY_TILE_SIZE + 1,
					);
					const cornerA = project(cellY0 * res - 90, cellX0 * res - 180);
					const cornerB = project(cellY1 * res - 90, cellX1 * res - 180);
					const left = Math.min(cornerA.x, cornerB.x) - 2;
					const top = Math.min(cornerA.y, cornerB.y) - 2;
					const width = Math.abs(cornerB.x - cornerA.x) + 4;
					const height = Math.abs(cornerB.y - cornerA.y) + 4;
					ctx.rect(left, top, width, height);
				}
				ctx.clip();
				ctx.clearRect(0, 0, mapSize.x, mapSize.y);
			}

			// --- COMPOSITE LEAFLET TILES INTO CANVAS ---
			// Optimization: Only draw tiles into canvas if we are actively capturing for Hub/Video.
			// Leaflet already renders these to the screen; re-drawing them on canvas is a huge redundant GPU hit.
			if (!useSimplifiedBase && (cinematicMode || this._isCapturing)) {
				const tilePane = map.getPane("tilePane");
				if (tilePane) {
					const tiles = tilePane.querySelectorAll("img.leaflet-tile");
					const mapRect = map.getContainer().getBoundingClientRect();
					tiles.forEach((tile) => {
						if (tile.complete && tile.naturalWidth > 0) {
							const rect = tile.getBoundingClientRect();
							const x = rect.left - mapRect.left;
							const y = rect.top - mapRect.top;

							if (
								x + rect.width > 0 &&
								y + rect.height > 0 &&
								x < mapRect.width &&
								y < mapRect.height
							) {
								const opacity = window.getComputedStyle(tile).opacity;
								ctx.globalAlpha = parseFloat(opacity) || 1.0;
								try {
									ctx.drawImage(tile, x, y, rect.width, rect.height);
								} catch (_e) {
									// Silent catch for CORS
								}
								ctx.globalAlpha = 1.0;
							}
						}
					});
				}
			}
		}

		// Cache renderer material lookups that otherwise allocate once per frame.
		let materialCache = this._materialCache;
		const metadataChanged =
			isEditing ||
			materialCache?.metadata !== countryMetadata ||
			materialCache?.metadataLength !== countryMetadata.length;
		if (metadataChanged) {
			const metaMaxId = countryMetadata.reduce(
				(max, metadata) => (metadata ? Math.max(max, metadata.id || 0) : max),
				0,
			);
			materialCache = {
				metadata: countryMetadata,
				metadataLength: countryMetadata.length,
				metaMaxId,
				sideKey: "",
				sovereignSideMap: null,
			};
			this._materialCache = materialCache;
		}
		const metaMaxId = materialCache.metaMaxId;
		if (materialCache.sideKey !== sideKey || !materialCache.sovereignSideMap) {
			const sovereignSideMap = new Int8Array(metaMaxId + 1).fill(-1);
			sides.forEach((side, sideIndex) => {
				side.forEach((country) => {
					if (country.id > 0 && country.id <= metaMaxId) {
						sovereignSideMap[country.id] = sideIndex;
					}
				});
			});
			materialCache.sideKey = sideKey;
			materialCache.sovereignSideMap = sovereignSideMap;
		}
		const sovereignSideMap = materialCache.sovereignSideMap;

		// Alliance mapping: group countries into alliances via mutual allies graph.
		// Root = smallest id in connected component. Every country gets a key so “non‑aligned” shows too.
		// Cached: recompute only when allies graph or countryMetadata length changes.
		const allianceDirty =
			_allianceCacheDirty ||
			_allianceCache.metaLen !== countryMetadata.length ||
			_allianceCache.metaMaxId !== metaMaxId;
		let allianceKeyById;
		let allianceColorByRoot;
		let allianceFlagMetaByRoot;
		if (allianceDirty) {
			allianceKeyById = new Int32Array(metaMaxId + 1); // root id per country
			allianceColorByRoot = {}; // rootId -> [r,g,b,a]
			allianceFlagMetaByRoot = {}; // rootId -> meta used for alliance flag

			if (countryMetadata?.length) {
				const visitedAlliance = new Uint8Array(metaMaxId + 1);

				for (let i = 0; i < countryMetadata.length; i++) {
					const m = countryMetadata[i];
					if (!m?.id) continue;
					const id = m.id;
					if (visitedAlliance[id]) continue;

					// BFS over allies graph to find connected component
					const queue = [id];
					let qIdx = 0;
					const component = [];
					visitedAlliance[id] = 1;
					while (qIdx < queue.length) {
						const cid = queue[qIdx++];
						component.push(cid);
						const cMeta = countryMetadata[cid - 1];
						const allies =
							cMeta && Array.isArray(cMeta.allies) ? cMeta.allies : [];
						allies.forEach((aid) => {
							if (aid > 0 && aid <= metaMaxId && !visitedAlliance[aid]) {
								visitedAlliance[aid] = 1;
								queue.push(aid);
							}
						});
					}

					// Root = minimum id in this component
					const rootId = component.reduce(
						(min, v) => Math.min(min, v),
						component[0],
					);
					component.forEach((cid) => {
						allianceKeyById[cid] = rootId;
					});

					const rootMeta = countryMetadata[rootId - 1];
					const rgba = rootMeta?.rgba ? rootMeta.rgba : [180, 180, 180, 1];
					allianceColorByRoot[rootId] = rgba;
					allianceFlagMetaByRoot[rootId] = rootMeta || null;
				}
			}
			_allianceCache.metaLen = countryMetadata.length;
			_allianceCache.metaMaxId = metaMaxId;
			_allianceCache.keyById = allianceKeyById;
			_allianceCache.colorByRoot = allianceColorByRoot;
			_allianceCache.flagMetaByRoot = allianceFlagMetaByRoot;
			clearAllianceCacheDirty();
		} else {
			allianceKeyById = _allianceCache.keyById;
			allianceColorByRoot = _allianceCache.colorByRoot;
			allianceFlagMetaByRoot = _allianceCache.flagMetaByRoot;
		}

		if (renderStatic) {
			if (useSimplifiedBase) {
				const size = map.getSize();
				// Always render the procedural ocean/land gradient; custom satellite imagery is disabled.
				const centerLng = map.getCenter().lng;
				const grad = ctx.createLinearGradient(0, 0, 0, size.y);

				// Generate a latitude-aware gradient by sampling the viewport's geographic coordinates
				const stops = 12;
				for (let i = 0; i <= stops; i++) {
					const pct = i / stops;
					const screenY = size.y * pct;
					let lat = 0;
					try {
						// Convert screen position to latitude for color calculation
						lat = map.containerPointToLatLng([0, screenY]).lat;
					} catch (_e) {}

					// Add noise to the equator logic so transitions aren't perfectly uniform
					// Noise is tied to longitude and screen stop index for a dynamic, non-perfect feel
					const noise = Math.sin(i * 0.7 + centerLng * 0.04) * 3.5;
					const absLat = Math.min(90, Math.max(0, Math.abs(lat) + noise));
					const t = Math.min(1, Math.max(0, absLat / 90));

					// Narrower, more subtle ocean color spectrum
					// Equator (0): rgb(5, 52, 72)
					// Poles (1): rgb(2, 18, 34)
					const r = Math.round(5 * (1 - t) + 2 * t);
					const g = Math.round(52 * (1 - t) + 18 * t);
					const b = Math.round(72 * (1 - t) + 34 * t);

					grad.addColorStop(pct, `rgb(${r},${g},${b})`);
				}
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, size.x, size.y);
			}

			// Draw reference image underneath terrain/countries but above ocean/background
			// when "Draw Above Terrain" is disabled. This now runs after both tile and
			// simplified ocean rendering so the guide is never hidden by the water layer.
			if (
				!this._isCapturing &&
				!refAboveTerrain &&
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
		}

		// Performance optimization: Downsample grid sampling dynamically.
		// During active zoom animations or ultra-high speeds, we use a coarser step.
		let step = 1;
		const vArea = (xMax - xMin) * (yMax - yMin);

		// Dynamic sampling based on zoom level and engine load
		if (isEditing) {
			step = 1;
		} else if (this._zooming) {
			step = currentZoom <= 3 ? 4 : currentZoom <= 5 ? 2 : 1;
		} else {
			if (currentZoom <= 3) step = 4;
			else if (currentZoom <= 4) step = 2;
			else if (vArea > 150000 && simSpeed >= 2)
				step = 2; // Auto-downsample on heavy macro-zoom load
			else step = 1;
		}

		const vWidth = xMax - xMin + 1;
		const vHeight = yMax - yMin + 1;
		const staticVxStart = Math.max(
			0,
			Math.floor((staticPaintGridBounds.xMin - xMin) / step) * step,
		);
		const staticVxEnd = Math.min(
			vWidth,
			Math.ceil((staticPaintGridBounds.xMax - xMin + 1) / step) * step,
		);
		const staticVyStart = Math.max(
			0,
			Math.floor((staticPaintGridBounds.yMin - yMin) / step) * step,
		);
		const staticVyEnd = Math.min(
			vHeight,
			Math.ceil((staticPaintGridBounds.yMax - yMin + 1) / step) * step,
		);
		const staticLoopXMin = xMin + staticVxStart;
		const staticLoopXMax = Math.min(xMax, xMin + staticVxEnd);
		const staticLoopYMin = yMin + staticVyStart;
		const staticLoopYMax = Math.min(yMax, yMin + staticVyEnd);
		const projectionKey = `${viewportKey}:${xMin}:${xMax}:${yMin}:${yMax}`;
		let gridProjection = this._gridProjectionCache;
		if (gridProjection?.key !== projectionKey) {
			const x = new Float32Array(vWidth + 1);
			const y = new Float32Array(vHeight + 1);
			for (let offset = 0; offset <= vWidth; offset++) {
				x[offset] = project(yMin * res - 90, (xMin + offset) * res - 180).x;
			}
			for (let offset = 0; offset <= vHeight; offset++) {
				y[offset] = project((yMin + offset) * res - 90, xMin * res - 180).y;
			}
			gridProjection = { key: projectionKey, x, y };
			this._gridProjectionCache = gridProjection;
		}

		const getGridPoint = (gx, gy) => {
			const xOffset = gx - xMin;
			const yOffset = gy - yMin;
			const hasCachedX =
				Number.isInteger(xOffset) &&
				xOffset >= 0 &&
				xOffset < gridProjection.x.length;
			const hasCachedY =
				Number.isInteger(yOffset) &&
				yOffset >= 0 &&
				yOffset < gridProjection.y.length;
			const rawPoint =
				hasCachedX && hasCachedY
					? null
					: project(gy * res - 90, gx * res - 180);
			const x = hasCachedX ? gridProjection.x[xOffset] : rawPoint.x;
			const y = hasCachedY ? gridProjection.y[yOffset] : rawPoint.y;
			return { x, y };
		};

		// --- REGION SEGMENTATION & DATA COLLECTION ---
		// Performance Fix: "only render parts of flags that are onscreen"
		// We limit contiguous blob detection to a slightly padded viewport and use global metadata
		// bounds for UV mapping, preventing the engine from walking entire massive nations like Russia.
		const regions = fullStaticRefresh ? [] : this._cachedRegions || [];

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
												(left.latSum / left.count +
													right.latSum / right.count) /
												2;
											bins[i].lngSum =
												(left.lngSum / left.count +
													right.lngSum / right.count) /
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
						const _occ = occupationMap[idx];
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
									baseRgba = [
										allianceRgba[0],
										allianceRgba[1],
										allianceRgba[2],
									];
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
													occupierId > 0
														? countryMetadata[occupierId - 1]
														: null;
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
				for (const side of sides)
					for (const c of side) _countryById.set(c.id, c);
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

						let flagImg = null;
						const countryObj = _countryById.get(flagMeta.id);
						if (flagMeta.allianceFlagTempFlag?.complete) {
							flagImg = flagMeta.allianceFlagTempFlag;
						} else if (
							countryObj?.flag?.complete &&
							countryObj.flag.naturalWidth > 0
						) {
							flagImg = countryObj.flag;
						} else {
							if (!flagMeta.tempFlag && flagMeta.flagUrl) {
								flagMeta.tempFlag = new Image();
								flagMeta.tempFlag.crossOrigin = "anonymous";
								flagMeta.tempFlag.onload = () => {
									if (influenceLayer) {
										influenceLayer.invalidate?.(RENDER_LAYERS.STATIC);
										influenceLayer.render();
									}
								};
								flagMeta.tempFlag.src = flagMeta.flagUrl;
							}
							if (
								flagMeta.tempFlag?.complete &&
								flagMeta.tempFlag.naturalWidth > 0
							) {
								flagImg = flagMeta.tempFlag;
							}
						}

						if (
							flagImg &&
							drawW > 0 &&
							drawH > 0 &&
							Number.isFinite(drawX) &&
							Number.isFinite(drawY)
						) {
							const viewW = this._container.width / dpr;
							const viewH = this._container.height / dpr;

							const vL = Math.max(0, drawX);
							const vT = Math.max(0, drawY);
							const vR = Math.min(viewW, drawX + drawW);
							const vB = Math.min(viewH, drawY + drawH);

							const vW = vR - vL;
							const vH = vB - vT;

							if (
								vW > 0 &&
								vH > 0 &&
								Number.isFinite(vW) &&
								Number.isFinite(vH)
							) {
								const sx = ((vL - drawX) / drawW) * flagImg.naturalWidth;
								const sy = ((vT - drawY) / drawH) * flagImg.naturalHeight;
								const sw = (vW / drawW) * flagImg.naturalWidth;
								const sh = (vH / drawH) * flagImg.naturalHeight;

								if (
									Number.isFinite(sx) &&
									Number.isFinite(sy) &&
									Number.isFinite(sw) &&
									Number.isFinite(sh) &&
									sw > 0 &&
									sh > 0
								) {
									ctx.globalAlpha = 0.55;
									ctx.drawImage(flagImg, sx, sy, sw, sh, vL, vT, vW, vH);
									ctx.globalAlpha = 1.0;
								}
							}
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
						const p2 = getGridPoint(
							region.regMaxX + step,
							region.regMaxY + step,
						);
						const drawX = Math.min(p1.x, p2.x);
						const drawY = Math.min(p1.y, p2.y);
						const drawW = Math.abs(p1.x - p2.x);
						const drawH = Math.abs(p1.y - p2.y);

						let flagImg = null;
						const countryObj = _countryById.get(flagMeta.id);
						if (
							countryObj?.flag?.complete &&
							countryObj.flag.naturalWidth > 0
						) {
							flagImg = countryObj.flag;
						} else {
							if (!flagMeta.tempFlag && flagMeta.flagUrl) {
								flagMeta.tempFlag = new Image();
								flagMeta.tempFlag.crossOrigin = "anonymous";
								flagMeta.tempFlag.onload = () => {
									if (influenceLayer) {
										influenceLayer.invalidate?.(RENDER_LAYERS.STATIC);
										influenceLayer.render();
									}
								};
								flagMeta.tempFlag.src = flagMeta.flagUrl;
							}
							if (
								flagMeta.tempFlag?.complete &&
								flagMeta.tempFlag.naturalWidth > 0
							) {
								flagImg = flagMeta.tempFlag;
							}
						}

						if (
							flagImg &&
							drawW > 0 &&
							drawH > 0 &&
							Number.isFinite(drawX) &&
							Number.isFinite(drawY)
						) {
							const viewW = this._container.width / dpr;
							const viewH = this._container.height / dpr;

							const vL = Math.max(0, drawX);
							const vT = Math.max(0, drawY);
							const vR = Math.min(viewW, drawX + drawW);
							const vB = Math.min(viewH, drawY + drawH);

							const vW = vR - vL;
							const vH = vB - vT;

							if (
								vW > 0 &&
								vH > 0 &&
								Number.isFinite(vW) &&
								Number.isFinite(vH)
							) {
								const sx = ((vL - drawX) / drawW) * flagImg.naturalWidth;
								const sy = ((vT - drawY) / drawH) * flagImg.naturalHeight;
								const sw = (vW / drawW) * flagImg.naturalWidth;
								const sh = (vH / drawH) * flagImg.naturalHeight;

								if (
									Number.isFinite(sx) &&
									Number.isFinite(sy) &&
									Number.isFinite(sw) &&
									Number.isFinite(sh) &&
									sw > 0 &&
									sh > 0
								) {
									ctx.globalAlpha = 0.55;
									ctx.drawImage(flagImg, sx, sy, sw, sh, vL, vT, vW, vH);
									ctx.globalAlpha = 1.0;
								}
							}
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
						if (isOccupiedByEnemy)
							return primaryOccupierMap[idx] || sovereignId;
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
							const idD =
								landMask[downIdx] === 0 ? -1 : worldControlMap[downIdx];
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

		// Dynamic entities, labels, editor highlights and operation overlays stay on
		// the public canvas. Captures therefore continue to receive one composited
		// surface even though the political/control work is cached separately.
		mainCtx.clearRect(0, 0, this._container.width, this._container.height);
		mainCtx.save();
		mainCtx.scale(dpr, dpr);
		mainCtx.drawImage(
			this._staticSurface,
			0,
			0,
			this._container.width / dpr,
			this._container.height / dpr,
		);
		ctx = mainCtx;

		// Pass 4: Selection Highlight
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

			const drawSelectionHighlight = (input, sideIdx) => {
				let id = -1;
				if (typeof input === "number") {
					id = input;
				} else if (input?.properties) {
					id = countryMetadata.findIndex((m) => m.feature === input) + 1;
				}
				if (id <= 0) return;

				ctx.beginPath();
				ctx.strokeStyle = sideColors[sideIdx].replace(rgbaRe, "1)");
				ctx.lineWidth = 3;

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
				}
				ctx.stroke();
			};
			sides.forEach((side, idx) => {
				side.forEach((c) => {
					if (c.feature) drawSelectionHighlight(c.feature, idx);
					else if (c.id) drawSelectionHighlight(c.id, idx);
				});
			});
		}

		// Draw Explosions - Viewport Culled
		const drawBounds = viewBounds.pad(0.1);
		explosions.forEach((exp) => {
			if (
				Number.isNaN(exp.lat) ||
				Number.isNaN(exp.lng) ||
				!drawBounds.contains([exp.lat, exp.lng])
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
				!drawBounds.contains([b.currentLat, b.currentLng])
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
				if (!drawBounds.contains([base.lat, base.lng])) return;
				const p = project(base.lat, base.lng);
				ctx.beginPath();
				ctx.arc(p.x, p.y, baseSize * 1.2, 0, Math.PI * 2);
				ctx.fillStyle = sideColors[base.sideIndex].replace(rgbaRe, "0.3)");
				ctx.fill();
				ctx.fillStyle = "#fff";
				ctx.strokeStyle = sideColors[base.sideIndex].replace(
					/[\d.]+\)$/g,
					"1)",
				);
				ctx.lineWidth = 2;
				ctx.fillRect(
					p.x - baseSize / 2,
					p.y - baseSize / 2,
					baseSize,
					baseSize,
				);
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

		// Draw destructible airfields and active wings from cached simulation state.
		if (isWar) {
			const airZoomScale = Math.max(0.8, 1.15 ** (map.getZoom() - 3));
			for (const field of airfields) {
				if (!drawBounds.contains([field.lat, field.lng])) continue;
				const p = project(field.lat, field.lng);
				const radius = 6 * airZoomScale;
				ctx.save();
				ctx.globalAlpha = field.health > 0 ? 0.9 : 0.45;
				ctx.strokeStyle =
					sideColors[field.sideIndex]?.replace(rgbaRe, "1") || "#fff";
				ctx.fillStyle = "rgba(15, 20, 25, 0.85)";
				ctx.lineWidth = Math.max(1, airZoomScale);
				ctx.beginPath();
				ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(p.x - radius * 0.7, p.y);
				ctx.lineTo(p.x + radius * 0.7, p.y);
				ctx.moveTo(p.x, p.y - radius * 0.7);
				ctx.lineTo(p.x, p.y + radius * 0.7);
				ctx.strokeStyle = field.health > 0 ? "#dce8ef" : "#e74c3c";
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(
					p.x,
					p.y,
					radius + 2,
					-Math.PI / 2,
					-Math.PI / 2 + Math.PI * 2 * Math.max(0, field.health / 100),
				);
				ctx.strokeStyle = field.health > 50 ? "#2ecc71" : "#f39c12";
				ctx.stroke();
				ctx.fillStyle = "#fff";
				ctx.font = `bold ${Math.max(6, 6 * airZoomScale)}px monospace`;
				ctx.textAlign = "center";
				ctx.textBaseline = "top";
				ctx.fillText(
					`${getAirfieldCapacity(field)}·${Math.round(field.health)}`,
					p.x,
					p.y + radius + 2,
				);
				ctx.restore();
			}

			for (const wing of airWings) {
				if (
					wing.equipment <= 0 ||
					wing.state === "GROUNDED" ||
					wing.state === "REARMING" ||
					wing.state === "EVACUATED" ||
					!drawBounds.contains([wing.lat, wing.lng])
				)
					continue;
				const p = project(wing.lat, wing.lng);
				const size = 7 * airZoomScale;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.fillStyle =
					sideColors[wing.sideIndex]?.replace(rgbaRe, "1") || "#fff";
				ctx.strokeStyle = "rgba(0,0,0,0.8)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(size, 0);
				ctx.lineTo(-size * 0.55, -size * 0.4);
				ctx.lineTo(-size * 0.2, 0);
				ctx.lineTo(-size * 0.55, size * 0.4);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = "#fff";
				ctx.font = `bold ${Math.max(7, 7 * airZoomScale)}px monospace`;
				ctx.textAlign = "center";
				ctx.fillText(String(wing.equipment), 0, -size * 0.75);
				ctx.font = `bold ${Math.max(6, 6 * airZoomScale)}px monospace`;
				ctx.fillText(
					`${wing.role === "FIGHTER" ? "F" : "S"}·${wing.state.slice(0, 1)}`,
					0,
					size * 1.25,
				);
				ctx.restore();
			}
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
					if (!viewBounds.contains([c.lat, c.lng])) continue;
				} else {
					const qualifies =
						(c.pop > minPop && viewBounds.contains([c.lat, c.lng])) ||
						activeTheaterCities.includes(c);
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
				sideInfluenceMaps[ds][gIdx] > 0.3
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

			const visibleUnits = [];
			for (let kx = minKx; kx <= maxKx; kx++) {
				// Handle longitude wrap
				const wrappedKx = ((kx % 144) + 144) % 144; // 360/2.5 = 144 buckets
				for (let ky = minKy; ky <= maxKy; ky++) {
					const bucket = unitSpatialHash.get(wrappedKx * 100 + ky);
					if (bucket) {
						for (let bu = 0; bu < bucket.length; bu++) {
							const u = bucket[bu];
							if (uDrawBounds.contains([u.lat, u.lng])) {
								visibleUnits.push(u);
							}
						}
					}
				}
			}

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
					let country = null;

					// Mountain Visuals: Units are "snow-capped" for visibility
					const sw = w;
					const sh = h;

					// Robust lookup: first try assigned side, then search all sides as fallback
					if (u.sideIndex !== undefined && sides[u.sideIndex]) {
						country = sides[u.sideIndex].find((c) => c.id === u.sovereignId);
					}

					if (!country) {
						// Deep search fallback
						for (let s = 0; s < sides.length; s++) {
							country = sides[s].find((c) => c.id === u.sovereignId);
							if (country) break;
						}
					}

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
						if (
							allianceViewEnabled &&
							flagMeta.allianceFlagTempFlag?.complete
						) {
							// nothing to preload
						} else if (!flagMeta.tempFlag && flagMeta.flagUrl) {
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

					if (u.kind === "armor") {
						ctx.save();
						ctx.fillStyle = "rgba(20, 24, 22, 0.62)";
						ctx.strokeStyle = sideColors[u.sideIndex].replace(rgbaRe, "1");
						ctx.lineWidth = Math.max(0.8, zoomScale * 0.7);
						ctx.fillRect(p.x - sw * 0.55, p.y - sh * 0.45, sw * 1.1, sh * 0.9);
						ctx.strokeRect(
							p.x - sw * 0.55,
							p.y - sh * 0.45,
							sw * 1.1,
							sh * 0.9,
						);
						ctx.beginPath();
						ctx.arc(p.x, p.y - sh * 0.1, sh * 0.38, 0, Math.PI * 2);
						ctx.fillStyle = sideColors[u.sideIndex].replace(rgbaRe, "1");
						ctx.fill();
						ctx.fillRect(p.x, p.y - sh * 0.18, sw * 0.65, sh * 0.14);
						ctx.fillStyle = "#fff";
						ctx.font = `bold ${Math.max(6, 7 * zoomScale)}px monospace`;
						ctx.textAlign = "center";
						ctx.textBaseline = "bottom";
						ctx.fillText(
							String(Math.max(0, u.equipment || 0)),
							p.x,
							p.y - sh * 0.7,
						);
						ctx.restore();
					}

					// Victory Boost Visual (Star)
					if (showBattleIndicators && u.victoryBoostTicks > 0) {
						ctx.save();
						const starSize = 10 * zoomScale;
						ctx.font = `${starSize}px serif`;
						ctx.textAlign = "center";
						ctx.textBaseline = "middle";
						ctx.shadowBlur = 6;
						ctx.shadowColor = "gold";
						ctx.fillText("⭐", p.x, p.y - sh - 2);
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
					(u.kind !== "armor" && u.health > CONFIG.UNIT_HEALTH * 1.15);
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
				if (!drawBounds.contains([b.lat, b.lng])) return;
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

				ctx.shadowBlur = 10;
				ctx.shadowColor = "rgba(255,255,255,0.4)";
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 0;

				// Pulsing animation
				const pulse = 0.9 + Math.sin(simFrameCount * 0.2) * 0.1;
				ctx.translate(p.x, p.y);
				ctx.scale(pulse, pulse);

				ctx.fillText("⚔️", 0, 0);
				ctx.restore();
			});
		}
		mainCtx.restore();
		this._invalidLayers &= ~RENDER_LAYERS.DYNAMIC;

		const labelsCacheKey = [
			viewportKey,
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

				regions.forEach((region) => {
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
					let fontSize = Math.max(8, Math.min(zoom * 12, areaScale / 4.5));

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
					const spacingFactor = 0.35;
					const idealFontSize =
						(pathLength * 0.9) / (name.length * (charFactor + spacingFactor));
					fontSize = Math.min(idealFontSize, fontSize);
					if (fontSize < 7) return;

					this.drawTextOnCurve(
						ctx,
						name,
						points[0],
						points[1],
						points[2],
						points[3],
						fontSize,
						fontSize * spacingFactor,
					);
				});
			}
			ctx.restore();
			this._labelsCacheKey = labelsCacheKey;
			this._lastLabelsRenderFrame = simFrameCount;
			this._invalidLayers &= ~RENDER_LAYERS.LABELS;
		}
		mainCtx.drawImage(this._labelsSurface, 0, 0);

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
			isWar &&
			showWarPlans &&
			simFrameCount - this._lastOverlaysRenderFrame >= 5;
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
				const aiObserverSnapshot = getAiObserverSnapshot();
				if (aiObserverSnapshot) {
					drawAiOperationsOverlay(
						ctx,
						aiObserverSnapshot,
						project,
						sideColors[aiObserverSnapshot.sideIndex] ||
							"rgba(255, 196, 64, 0.9)",
						window.innerWidth < 480,
						window.__mwAiOperationReveal?.uid || null,
					);
				}
				for (let si = 0; !aiObserverSnapshot && si < _warPlan.length; si++) {
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
					const planLabel = plan.type
						? `${plan.type} ${plan.phase}`
						: plan.phase;
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

				if (!aiObserverSnapshot && _aiDebugPlans?.length) {
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
						if (aiObserverSnapshot && si !== aiObserverSnapshot.sideIndex)
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

						if (!aiObserverSnapshot || window.innerWidth >= 480) {
							ctx.font = "bold 9px monospace";
							ctx.fillStyle = sideColor.replace(rgbaRe, "0.9)");
							ctx.fillText(`NAVAL: ${np.phase}`, midX + 10, midY - 2);
						}
					}
				}

				// Draw naval supply arrows (dashed, country-colored)
				if (typeof _navalSupplyPlan !== "undefined" && _navalSupplyPlan) {
					for (let si = 0; si < _navalSupplyPlan.length; si++) {
						if (aiObserverSnapshot && si !== aiObserverSnapshot.sideIndex)
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

						if (!aiObserverSnapshot || window.innerWidth >= 480) {
							ctx.font = "bold 8px monospace";
							ctx.fillStyle = sideColor.replace(rgbaRe, "0.85)");
							ctx.fillText(`SUPPLY: ${sp.phase}`, midX + 10, midY + 10);
						}
					}
				}

				// Draw transport arrows (dashed, side-colored, railway-style)
				if (
					!aiObserverSnapshot &&
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
					!aiObserverSnapshot &&
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
					!aiObserverSnapshot &&
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
		mainCtx.drawImage(this._overlaysSurface, 0, 0);
		this._renderedZoom = currentZoom;
		this._renderedCenter = map.getCenter();
		this._commitZoomSettle();

		if (window.__perf)
			window.__perf.render =
				(window.__perf.render || 0) + performance.now() - _r0;
	},

	drawCurvedLabel: function (ctx, sideIdx) {
		const viewBounds = map.getBounds();
		const vS = viewBounds.getSouth();
		const vN = viewBounds.getNorth();
		const vW = viewBounds.getWest();
		const vE = viewBounds.getEast();
		const isWrapped = vW > vE;

		const teamUnits = units.filter((u) => {
			if (u.sideIndex !== sideIdx) return false;
			if (u.lat < vS || u.lat > vN) return false;
			if (isWrapped) {
				if (u.lng < vW && u.lng > vE) return false;
			} else {
				if (u.lng < vW || u.lng > vE) return false;
			}
			return true;
		});

		if (teamUnits.length < 1) return;

		let avgLat = 0,
			avgLng = 0;
		let clusterManpower = 0;
		const sp = soldiersPerUnit[sideIdx] || CONFIG.UNIT_TO_SOLDIER_RATIO;

		teamUnits.forEach((u) => {
			avgLat += u.lat;
			avgLng += u.lng;
			if (u.kind !== "armor") {
				clusterManpower += getFormationPersonnel(u, {
					nominalPersonnel: sp,
					baseHealth:
						u.maxHealth ||
						CONFIG.UNIT_HEALTH *
							(u.isAlpenjager ? CONFIG.ALPEN_HEALTH_MULT : 1),
				});
			}
		});
		avgLat /= teamUnits.length;
		avgLng /= teamUnits.length;

		if (Number.isNaN(avgLat) || Number.isNaN(avgLng)) return;
		let p;
		try {
			p = map.latLngToContainerPoint([avgLat, avgLng]);
		} catch (_e) {
			return;
		}
		const zoom = map.getZoom();

		// Stable label height offset
		const yOffset = -Math.max(30, zoom * 5);

		// Determine general trend of the unit cluster for rotation
		let angle = 0;
		if (teamUnits.length > 5) {
			// Find two points that represent the "spread"
			let furthest = teamUnits[0];
			let maxDist = -1;
			teamUnits.forEach((u) => {
				const d = (u.lat - avgLat) ** 2 + (u.lng - avgLng) ** 2;
				if (d > maxDist) {
					maxDist = d;
					furthest = u;
				}
			});
			const pStart = map.latLngToContainerPoint([avgLat, avgLng]);
			const pEnd = map.latLngToContainerPoint([furthest.lat, furthest.lng]);
			angle = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);

			// Normalize angle to be horizontal-ish and upright
			if (angle > Math.PI / 2) angle -= Math.PI;
			if (angle < -Math.PI / 2) angle += Math.PI;
			// Dampen rotation to prevent extreme jitters
			angle *= 0.3;
		}

		// Show a minimum of 1 if there are still units in the cluster
		const text = this.formatSoldiers(
			clusterManpower > 0 && clusterManpower < 1 ? 1 : clusterManpower,
		);

		ctx.save();
		ctx.translate(p.x, p.y + yOffset);
		ctx.rotate(angle);

		const fontSize = Math.max(12, zoom * 4);
		ctx.font = `900 ${fontSize}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		// Background stroke for maximum legibility
		ctx.strokeStyle = "black";
		ctx.lineWidth = 5;
		ctx.strokeText(text, 0, 0);

		ctx.fillStyle = sideColors[sideIdx].replace(rgbaRe, "1)");
		ctx.fillText(text, 0, 0);

		ctx.restore();
	},

	getBezierPoint: (t, p0, p1, p2, p3) => {
		const cx = 3 * (p1.x - p0.x);
		const bx = 3 * (p2.x - p1.x) - cx;
		const ax = p3.x - p0.x - cx - bx;
		const cy = 3 * (p1.y - p0.y);
		const by = 3 * (p2.y - p1.y) - cy;
		const ay = p3.y - p0.y - cy - by;
		const x = ax * t ** 3 + bx * t ** 2 + cx * t + p0.x;
		const y = ay * t ** 3 + by * t ** 2 + cy * t + p0.y;
		return { x, y };
	},

	getBezierTangent: (t, p0, p1, p2, p3) => {
		const cx = 3 * (p1.x - p0.x);
		const bx = 3 * (p2.x - p1.x) - cx;
		const ax = p3.x - p0.x - cx - bx;
		const cy = 3 * (p1.y - p0.y);
		const by = 3 * (p2.y - p1.y) - cy;
		const ay = p3.y - p0.y - cy - by;
		const dx = 3 * ax * t ** 2 + 2 * bx * t + cx;
		const dy = 3 * ay * t ** 2 + 2 * by * t + cy;
		return Math.atan2(dy, dx);
	},

	drawTextOnCurve: function (
		ctx,
		text,
		p0,
		p1,
		p2,
		p3,
		fontSize,
		letterSpacing,
	) {
		if (!text || Number.isNaN(fontSize) || fontSize <= 0) return;
		ctx.font = `bold ${fontSize}px "Times New Roman", Times, serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const chars = text.split("");
		const charCount = chars.length;

		// Calculate total path length roughly
		const samples = 10;
		let length = 0;
		let prev = p0;
		for (let i = 1; i <= samples; i++) {
			const curr = this.getBezierPoint(i / samples, p0, p1, p2, p3);
			length += Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
			prev = curr;
		}

		const charWidth = fontSize * 0.6;
		const totalTextWidth = charCount * (charWidth + letterSpacing);

		// Center the text on the path
		const startT = 0.5 - (totalTextWidth / length) * 0.5;
		const stepT = totalTextWidth / length / charCount;

		const isZooming = this._zooming;
		chars.forEach((char, i) => {
			const t = startT + i * stepT + stepT / 2;
			if (t < 0 || t > 1) return;

			const pos = this.getBezierPoint(t, p0, p1, p2, p3);
			const angle = this.getBezierTangent(t, p0, p1, p2, p3);

			ctx.save();
			ctx.translate(pos.x, pos.y);
			ctx.rotate(angle);

			// Optimization: Skip expensive stroke operations for labels during active zoom/pan
			if (!isZooming) {
				ctx.strokeStyle = "rgba(0,0,0,0.8)";
				ctx.lineWidth = Math.max(2, fontSize / 5);
				ctx.strokeText(char, 0, 0);
			}
			ctx.fillStyle = "white";
			ctx.fillText(char, 0, 0);

			ctx.restore();
		});
	},

	formatSoldiers: (n) => Math.floor(Math.max(0, n)).toLocaleString(),

	drawCasualtiesOnCanvas: function (ctx) {
		if (gameState !== "SIMULATING" && gameState !== "WAR_OVER") return;

		const _padding = 15;
		const boxWidth = 160;
		const entryHeight = 25;
		const _dpr = window.devicePixelRatio || 1;

		// Background for casualties panel
		const drawSidePanel = (sIdx, x, y) => {
			const entries = initialCombatants.filter((c) => c.sideIndex === sIdx);
			if (sides[sIdx]) {
				sides[sIdx].forEach((c) => {
					if (!entries.some((e) => e.id === c.id)) {
						entries.push({ id: c.id, name: c.name, sideIndex: sIdx });
					}
				});
			}

			if (entries.length === 0) return 0;

			const totalHeight = 30 + entries.length * entryHeight;
			const sideColor = sideColors[sIdx].replace(rgbaRe, "1)");

			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			if (typeof ctx.roundRect === "function") {
				ctx.roundRect(x, y, boxWidth, totalHeight, 8);
			} else {
				ctx.rect(x, y, boxWidth, totalHeight);
			}
			ctx.fill();
			ctx.stroke();

			ctx.fillStyle = "#fff";
			ctx.font = '900 12px "Segoe UI", Arial';
			ctx.textAlign = "center";
			ctx.fillText(
				`SIDE ${String.fromCharCode(65 + sIdx)}`,
				x + boxWidth / 2,
				y + 20,
			);

			entries.forEach((c, i) => {
				const casualties = countryCasualties.get(c.id) || 0;
				const formatted = this.formatSoldiers(casualties);
				const isDefeated = !sides
					.flat()
					.some((active) => active && active.id === c.id);
				const isPrimary = i === 0 && !isDefeated;
				const itemY = y + 45 + i * entryHeight;

				ctx.save();
				if (isDefeated) ctx.globalAlpha = 0.45;

				const meta = countryMetadata[c.id - 1];
				const flag = meta?.tempFlag;
				if (flag?.complete && flag.naturalWidth > 0) {
					const fw = isPrimary ? 28 : 20;
					const fh = isPrimary ? 16 : 12;
					ctx.drawImage(flag, x + 10, itemY - fh / 2 - 2, fw, fh);
				}

				ctx.fillStyle = sideColor;
				ctx.font = `900 ${isPrimary ? "16px" : "11px"} monospace`;
				ctx.textAlign = "left";
				ctx.fillText(formatted, x + 45, itemY);

				ctx.restore();
			});

			return totalHeight;
		};

		const mapSize = map.getSize();
		const startY = mapSize.y * 0.15;
		const startX = mapSize.x * 0.05;
		let panelY = startY;
		for (let si = 0; si < sides.length; si++) {
			if (!sides[si] || sides[si].length === 0) continue;
			const h = drawSidePanel(si, startX, panelY);
			panelY += h + 15;
		}
	},
});

export { ControlMapLayer, RENDER_LAYERS };
