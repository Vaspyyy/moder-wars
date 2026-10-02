import { CONFIG } from "./config.js";
import { getFormationStrengthBadge } from "./formation-strength.js";
import {
	_aiDebugPlans,
	_allianceCacheDirty,
	_coastalDefensePlan,
	_frontlinePolys,
	_navalPlan,
	_navalSupplyPlan,
	_neutralGarrisonPlan,
	_transportPlan,
	_warPlan,
	activeBattles,
	activeTheaterCities,
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
	gameMode,
	gameState,
	getAiOperationsSnapshot,
	getGridIndex,
	godModeActive,
	gridHeight,
	gridWidth,
	hideCurvedLabels,
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
	showArmyDiagnostics,
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
import mapRuntime from "./map-runtime.ts";
import { drawAtlasOcean, requestAtlasCoast } from "./render-atlas.js";
import {
	invalidateUnitFlagSprites,
	paintClippedFlag,
	resolveRenderFlag,
} from "./render-flags.js";
import { drawLabels } from "./render-labels.js";
import { drawOverlays } from "./render-overlays.js";
import { createPoliticalStyleTracker } from "./render-political-cache.js";
import { drawTerrain } from "./render-terrain.js";
import { drawUnits } from "./render-units.js";

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
	if (showArmyDiagnostics && snapshot.army) {
		ctx.save();
		for (const sector of snapshot.army.sectors || []) {
			ctx.strokeStyle = sector.deficit > 0 ? "#ff925e" : "#86dcc2";
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = 3;
			drawOperationPolyline(ctx, project, sector.points);
			const anchor = project(sector.hold.lat, sector.hold.lng);
			ctx.font = "9px monospace";
			ctx.fillStyle = ctx.strokeStyle;
			ctx.fillText(
				`${sector.assignedUnitIds.length} · ${sector.deficit > 0 ? "NEEDS REINFORCEMENT" : "COVERED"}`,
				anchor.x + 5,
				anchor.y - 5,
			);
		}
		for (const order of snapshot.army.orders || []) {
			const from = project(order.from.lat, order.from.lng),
				to = project(order.target.lat, order.target.lng);
			ctx.strokeStyle =
				order.type === "WITHDRAW"
					? "#ff925e"
					: order.type === "RESERVE"
						? "#a8a0ed"
						: color;
			ctx.globalAlpha = 0.3;
			ctx.lineWidth = 1;
			ctx.setLineDash([2, 4]);
			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 0.85;
			ctx.fillStyle = ctx.strokeStyle;
			ctx.fillRect(to.x - 2, to.y - 2, 4, 4);
			if (!compact) {
				ctx.font = "8px monospace";
				ctx.fillText(
					`${order.type} · ${order.reason.toLowerCase().replaceAll("_", " ")}`,
					from.x + 6,
					from.y + 10,
				);
			}
		}
		ctx.restore();
	}
	if (!showWarPlans) return;
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
			const label = `${phase}${taskForce.stage ? ` · ${taskForce.stage}` : ""}${readinessLabel}${objectiveLabel ? ` · ${objectiveLabel}` : ""}`;
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
const CAMERA_PADDING = 192;
const CAMERA_REPAINT_INTERVAL = 120;

// Partial redraw clips include a one-cell halo. Sampling blocks that touch it
// must also be repainted, including blocks starting in a neighboring tile.
function intersectsControlPaintTiles(x, y, step, tileColumns, dirtyTiles) {
	const minTileX = Math.max(0, Math.floor((x - 1) / CONTROL_DIRTY_TILE_SIZE));
	const maxTileX = Math.min(
		tileColumns - 1,
		Math.floor((x + step) / CONTROL_DIRTY_TILE_SIZE),
	);
	const minTileY = Math.max(0, Math.floor((y - 1) / CONTROL_DIRTY_TILE_SIZE));
	const maxTileY = Math.floor((y + step) / CONTROL_DIRTY_TILE_SIZE);
	for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
		for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
			if (dirtyTiles.has(tileY * tileColumns + tileX)) return true;
		}
	}
	return false;
}
const CONTROL_DIRTY_TILE_LIMIT = 4096;

function createRenderSurface() {
	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	canvas.className = "mw-map-surface";
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

const ControlMapLayer = mapRuntime.Layer.extend({
	onAdd: function (map) {
		// Create a canvas that is viewport-locked rather than layer-locked to ensure
		// screen-space coordinates (container points) map 1:1 without parent transform interference.
		this._container = mapRuntime.DomUtil.create("canvas", "mw-map-surface");
		this._container.style.position = "absolute";
		this._container.style.top = "0";
		this._container.style.left = "0";
		this._container.style.pointerEvents = "none";
		this._container.style.zIndex = "400";
		this._backgroundSurface = createRenderSurface();
		this._staticSurface = createRenderSurface();
		this._labelsSurface = createRenderSurface();
		this._overlaysSurface = createRenderSurface();
		this._surfaces = [
			this._backgroundSurface,
			this._staticSurface,
			this._container,
			this._labelsSurface,
			this._overlaysSurface,
		];
		for (const surface of this._surfaces) {
			surface.style.position = "absolute";
			surface.style.top = "0";
			surface.style.left = "0";
			surface.style.pointerEvents = "none";
			surface.style.zIndex = "400";
		}
		this._compositeLayers = false;

		this._lastZoom = map.getZoom();
		this._renderRequested = false;
		this._renderRaf = 0;
		this._invalidLayers = RENDER_LAYERS.ALL;
		this._staticCacheKey = "";
		this._cachedRegions = [];
		this._gridProjectionCache = null;
		this._materialCache = null;
		this._politicalChunkCache = null;
		this._dirtyControlTiles = new Set();
		this._allControlTilesDirty = true;
		this._controlChangeTrackingEnabled = false;
		this._lastStaticRenderFrame = Number.NEGATIVE_INFINITY;
		this._lastLabelsRenderFrame = Number.NEGATIVE_INFINITY;
		this._lastOverlaysRenderFrame = Number.NEGATIVE_INFINITY;
		this._labelsCacheKey = "";
		this._overlaysCacheKey = "";
		this._regionsRevision = 0;
		this._zooming = false;
		this._smoothZooming = false;
		this._cameraMoving = false;
		this._cameraRepaintPending = false;
		this._surfacePadding = 0;
		this._lastCameraPaintTime = 0;
		this._zoomSettlePending = false;
		this._renderedZoom = map.getZoom();
		this._renderedCenter = map.getCenter();

		// Append to map container directly to avoid double-transforms from mapPane/overlayPane
		for (const surface of this._surfaces)
			map.getContainer().appendChild(surface);

		this._backgroundSurface.style.zIndex = "398";
		this._container.style.zIndex = "402";
		this._labelsSurface.style.zIndex = "403";
		this._overlaysSurface.style.zIndex = "404";
		this._gpu = null;
		this._gpuRequested = false;
		this._disposed = false;
		this._update();

		this._onMoveStart = () => {
			this._cameraMoving = true;
			for (const surface of this._surfaces)
				surface.style.willChange = "transform";
		};
		this._onMove = () => {
			if (this._zooming) return;
			const nextBounds = map.getBounds();
			if (!this._cameraMoving && this._lastBounds?.equals(nextBounds)) return;
			const offset = this._applyCameraTransform(map.getCenter(), map.getZoom());
			if (cinematicMode || this._isCapturing) {
				this._cameraRepaintPending = true;
				this.requestRender(RENDER_LAYERS.ALL, true);
				return;
			}
			// A buffered frame follows short drags on the compositor. Only replenish
			// it near its edge, at most once per interval during a long drag/inertia.
			if (
				this._cameraMoving &&
				Math.max(Math.abs(offset.x), Math.abs(offset.y)) >
					this._surfacePadding * 0.75 &&
				performance.now() - this._lastCameraPaintTime >= CAMERA_REPAINT_INTERVAL
			) {
				this._cameraRepaintPending = true;
				this.requestRender(RENDER_LAYERS.ALL, true);
			}
		};
		this._onMoveEnd = () => {
			this._cameraMoving = false;
			if (this._zooming) return;
			this._lastBounds = map.getBounds();
			this._zoomSettlePending = true;
			this.requestRender(RENDER_LAYERS.ALL, true);
		};

		this._onZoomStart = () => {
			this._zooming = true;
			this._smoothZooming = false;
			for (const surface of this._surfaces) {
				surface.style.willChange = "transform";
				// These canvases live outside the map camera's animated map pane, so they
				// need the same transition explicitly for keyboard/double-click zoom.
				surface.style.transition =
					"transform 250ms cubic-bezier(0, 0, 0.25, 1)";
			}
		};

		this._onZoomAnim = (e) => {
			if (e.smoothZoom && !this._smoothZooming) {
				this._smoothZooming = true;
				for (const surface of this._surfaces) surface.style.transition = "none";
			}
			const offset = this._applyCameraTransform(e.center, e.zoom);
			if (!this._smoothZooming) return;
			const scale = map.getZoomScale(e.zoom, this._renderedZoom);
			const size = map.getSize();
			const padding = this._surfacePadding;
			const margin = Math.min(48, padding / 4);
			const needsCoverage =
				offset.x - scale * padding > -margin ||
				offset.y - scale * padding > -margin ||
				offset.x + scale * (size.x + padding) < size.x + margin ||
				offset.y + scale * (size.y + padding) < size.y + margin;
			// Replenish only near an exposed edge or after doubling the texture.
			// Normal wheel samples reuse the painted frame and warm world meshes.
			if (
				(needsCoverage || scale > 2) &&
				performance.now() - this._lastCameraPaintTime >= CAMERA_REPAINT_INTERVAL
			) {
				this._cameraRepaintPending = true;
				this.requestRender(RENDER_LAYERS.ALL, true);
			}
		};

		this._onZoomEnd = () => {
			this._zooming = false;
			this._smoothZooming = false;
			this._lastBounds = map.getBounds();
			this._zoomSettlePending = true;
			// Keep the transformed old frame visible until one complete final-zoom
			// render can replace it atomically. requestRender schedules that frame in
			// paused/menu views; the simulation loop force-admits it during a live war.
			this.requestRender(RENDER_LAYERS.ALL, true);
		};

		this._onReferenceChange = () => {
			this.invalidate(RENDER_LAYERS.STATIC | RENDER_LAYERS.OVERLAYS);
			this.requestRender(RENDER_LAYERS.ALL, true);
		};
		map.on("referencechange", this._onReferenceChange, this);
		map.on("movestart", this._onMoveStart, this);
		map.on("move", this._onMove, this);
		map.on("moveend", this._onMoveEnd, this);
		map.on("zoomstart", this._onZoomStart, this);
		map.on("zoomanim", this._onZoomAnim, this);
		map.on("zoomend", this._onZoomEnd, this);
	},
	onRemove: function (map) {
		this._disposed = true;
		this._gpu?.destroy();
		if (this._renderRaf) cancelAnimationFrame(this._renderRaf);
		this._renderRaf = 0;
		this._renderRequested = false;
		this._zoomSettlePending = false;
		this._zooming = false;
		this._smoothZooming = false;
		this._cameraMoving = false;
		this._cameraRepaintPending = false;
		for (const surface of this._surfaces || []) {
			surface.parentNode?.removeChild(surface);
		}
		this._politicalChunkCache?.clear();
		this._regionChunkCache?.clear();
		map.off("referencechange", this._onReferenceChange, this);
		map.off("movestart", this._onMoveStart, this);
		map.off("move", this._onMove, this);
		map.off("moveend", this._onMoveEnd, this);
		map.off("zoomstart", this._onZoomStart, this);
		map.off("zoomanim", this._onZoomAnim, this);
		map.off("zoomend", this._onZoomEnd, this);
	},

	_applyCameraTransform: function (center, zoom) {
		const baseZoom = this._renderedZoom ?? map.getZoom(),
			baseCenter = this._renderedCenter ?? map.getCenter();
		const viewportCenter = map.getSize().divideBy(2);
		const oldCenter = map
			.project(center, baseZoom)
			.subtract(map.project(baseCenter, baseZoom))
			.add(viewportCenter);
		const scale = map.getZoomScale(zoom, baseZoom),
			offset = viewportCenter.subtract(oldCenter.multiplyBy(scale));
		// Surface coordinates include an overscan border; compensate its origin
		// while scaling so the geographic point under the cursor stays anchored.
		const padding = this._surfacePadding || 0;
		const adjusted = offset.add({
			x: (1 - scale) * padding,
			y: (1 - scale) * padding,
		});
		for (const surface of this._surfaces) {
			surface.style.transformOrigin = "0 0";
			mapRuntime.DomUtil.setTransform(surface, adjusted, scale);
		}
		this._gpu?.setCamera();
		return offset;
	},
	_resizeSurfaces: function () {
		const size = map.getSize(),
			dpr = window.devicePixelRatio || 1;
		const padding = cinematicMode || this._isCapturing ? 0 : CAMERA_PADDING;
		const width = Math.round((size.x + padding * 2) * dpr),
			height = Math.round((size.y + padding * 2) * dpr);
		if (
			this._container.width === width &&
			this._container.height === height &&
			this._surfacePadding === padding
		)
			return;
		this._surfacePadding = padding;
		for (const surface of this._surfaces) {
			surface.width = width;
			surface.height = height;
			surface.style.width = `${size.x + padding * 2}px`;
			surface.style.height = `${size.y + padding * 2}px`;
			surface.style.left = `${-padding}px`;
			surface.style.top = `${-padding}px`;
		}
		this._gridProjectionCache = null;
		this.invalidate(RENDER_LAYERS.ALL, true);
	},
	_getRenderBounds: function (viewBounds) {
		const padding = this._surfacePadding || 0,
			size = map.getSize();
		if (!padding || !map.containerPointToLatLng) return viewBounds;
		return mapRuntime.latLngBounds(
			map.containerPointToLatLng([-padding, size.y + padding]),
			map.containerPointToLatLng([size.x + padding, -padding]),
		);
	},

	/**
	 * Marks renderer-owned caches stale without forcing an immediate paint.
	 * Callers can combine RENDER_LAYERS masks.
	 */
	invalidate: function (
		layerMask = RENDER_LAYERS.ALL,
		preserveWorldCache = false,
	) {
		this._invalidLayers = (this._invalidLayers || 0) | layerMask;
		if (layerMask & RENDER_LAYERS.STATIC) {
			this._staticCacheKey = "";
			if (!preserveWorldCache) {
				this._politicalChunkCache?.clear();
				this._regionChunkCache?.clear();
				invalidateUnitFlagSprites(this);
				this._gpu?.invalidateWorld();
				this._gpu?.invalidateFlagTextures();
			}
		}
		if (layerMask & RENDER_LAYERS.LABELS) this._labelsCacheKey = "";
		if (layerMask & RENDER_LAYERS.OVERLAYS) this._overlaysCacheKey = "";
	},
	invalidateUnitFlagSprites: function (source) {
		invalidateUnitFlagSprites(this, source);
		this._gpu?.invalidateFlagTextures(source);
		this.requestRender(RENDER_LAYERS.DYNAMIC);
	},

	_simulationOwnsRendering: () =>
		!isPaused &&
		(gameState === "SIMULATING" ||
			(godModeActive && preGodModeState === "SIMULATING")),

	hasPendingZoomSettle: function () {
		return (
			this._cameraRepaintPending === true ||
			(this._zoomSettlePending === true && !this._zooming)
		);
	},

	_commitZoomSettle: function () {
		if (!this._zoomSettlePending && !this._cameraRepaintPending) return;
		this._zoomSettlePending = false;
		this._cameraRepaintPending = false;
		for (const surface of this._surfaces) {
			surface.style.transition = this._zooming ? "none" : "";
			surface.style.transform = "";
			surface.style.transformOrigin = "";
			surface.style.willChange =
				this._cameraMoving || this._zooming ? "transform" : "";
		}
	},

	/**
	 * Coalesces multiple paint requests into one animation-frame callback.
	 * `render()` remains synchronous for capture/export compatibility.
	 */
	requestRender: function (
		layerMask = RENDER_LAYERS.DYNAMIC,
		preserveWorldCache = false,
	) {
		this.invalidate(layerMask, preserveWorldCache);
		// The simulation loop performs spike-aware render admission. Renderer-owned
		// callbacks during an active war can otherwise bypass that admission or paint
		// the same frame twice. Paused/non-war views still receive immediate updates.
		if (this._simulationOwnsRendering()) return;
		if (this._renderRaf) return;
		this._renderRequested = true;
		this._renderRaf = requestAnimationFrame(() => {
			this._renderRaf = 0;
			this._renderRequested = false;
			if (this._zooming && !this._cameraRepaintPending) return;
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
			this._regionChunkCache?.invalidateTiles([tileY * tileColumns + tileX]);
			this._politicalChunkCache?.invalidateCells(
				[cellIndex],
				gridWidth,
				gridHeight,
			);
			if (this._dirtyControlTiles.size > CONTROL_DIRTY_TILE_LIMIT) {
				this._dirtyControlTiles.clear();
				this._allControlTilesDirty = true;
				this._politicalChunkCache?.clear();
				break;
			}
		}
		// The simulation loop owns wartime paint admission. Scheduling an additional
		// rAF here would bypass spike-aware render deferral and can paint twice in one
		// visual frame. The dirty tile remains queued until the admitted render.
		this.invalidate(RENDER_LAYERS.DYNAMIC);
		this.requestRender(RENDER_LAYERS.DYNAMIC);
	},

	// Worker snapshots report dirty world tiles directly, avoiding a temporary
	// array and invalidation call for every one of their 1,024 cells.
	notifyControlTilesChanged: function (
		tileKeys,
		tileSize = CONTROL_DIRTY_TILE_SIZE,
		changes = null,
	) {
		if (tileSize !== CONTROL_DIRTY_TILE_SIZE) {
			this._allControlTilesDirty = true;
			this.requestRender(RENDER_LAYERS.STATIC | RENDER_LAYERS.DYNAMIC);
			return;
		}
		this._controlChangeTrackingEnabled = true;
		const columns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
		const count = columns * Math.ceil(gridHeight / CONTROL_DIRTY_TILE_SIZE);
		const validKeys = (keys) => {
			const result = [];
			for (const value of keys || []) {
				const key = Number(value);
				if (Number.isInteger(key) && key >= 0 && key < count) result.push(key);
			}
			return result;
		};
		const political = validKeys(changes?.politicalTileKeys ?? tileKeys);
		const regions = validKeys(changes?.regionTileKeys ?? tileKeys);
		for (const key of political) this._dirtyControlTiles.add(key);
		this._politicalChunkCache?.invalidateTiles(
			political,
			gridWidth,
			gridHeight,
		);
		if (regions.length) this._regionChunkCache?.invalidateTiles(regions);
		if (this._dirtyControlTiles.size > CONTROL_DIRTY_TILE_LIMIT) {
			this._dirtyControlTiles.clear();
			this._allControlTilesDirty = true;
			this._politicalChunkCache?.clear();
			this._regionChunkCache?.clear();
		}
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
		// Transforms handle gesture frames. Paint only for buffered coverage or
		// when the gesture ends, preserving the complete final view.
		if ((this._zooming || this._cameraMoving) && !this._cameraRepaintPending)
			return;

		this._resizeSurfaces();

		const isSimulating =
			(gameState === "SIMULATING" ||
				(godModeActive && preGodModeState === "SIMULATING")) &&
			!isPaused;
		const currentBounds = map.getBounds();
		const mapMoved = !this._lastBounds?.equals(currentBounds);
		if (mapMoved) this._lastBounds = currentBounds;
		if (mapMoved) this.invalidate(RENDER_LAYERS.ALL, true);
		if (this._forceRender) this.invalidate(RENDER_LAYERS.ALL);

		if (isSimulating || mapMoved || this._forceRender) {
			this.render();
			this._forceRender = false;
		}
	},
	render: function () {
		const _r0 = window.__perf?._enabled ? performance.now() : 0;
		if (!worldControlMap || !landMask) return;
		// The main simulation loop calls render() directly, so it needs the same
		// gesture/coverage guard as renderer-owned animation-frame callbacks.
		if ((this._zooming || this._cameraMoving) && !this._cameraRepaintPending)
			return;
		if (!this._gpuRequested && !cinematicMode && !this._isCapturing) {
			this._gpuRequested = true;
			import("./atlas-gpu.ts")
				.then(({ AtlasGpuLayer }) => {
					if (this._disposed) return;
					this._gpu = new AtlasGpuLayer(map, () => {
						this.invalidate(RENDER_LAYERS.ALL, true);
						this.requestRender(RENDER_LAYERS.ALL, true);
					});
				})
				.catch((error) => {
					console.warn("Atlas GPU renderer unavailable:", error);
				});
		}
		if (this._renderRaf) {
			cancelAnimationFrame(this._renderRaf);
			this._renderRaf = 0;
			this._renderRequested = false;
		}
		if (this._forceRender) {
			this.invalidate(RENDER_LAYERS.ALL);
			this._forceRender = false;
		}
		this._resizeSurfaces();
		const viewBounds = this._getRenderBounds(map.getBounds());
		this._lastBounds = map.getBounds();
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
		const padding = this._surfacePadding || 0;

		const isWar =
			gameState === "SIMULATING" ||
			(godModeActive && preGodModeState === "SIMULATING");
		const currentImagery = "atlas";
		const isAtlas = true;
		const isSimplifiedMode = true;
		const useSimplifiedBase = true;
		const mapResolution =
			document.getElementById("map-res-select")?.value || "110m";
		if (
			isAtlas &&
			!isCustomTerrain &&
			this._atlasCoastRequested !== mapResolution
		) {
			this._atlasCoastRequested = mapResolution;
			requestAtlasCoast(() => {
				this.invalidate(RENDER_LAYERS.STATIC);
				this.render();
			}, mapResolution);
		}
		const isEditing =
			gameMode === "EDITOR" || gameMode === "EDITOR_TEST" || godModeActive;
		if (!this._countryStyleChanged)
			this._countryStyleChanged = createPoliticalStyleTracker();
		if (this._countryStyleChanged({ countryMetadata, sideColors }))
			this.invalidate(RENDER_LAYERS.STATIC);
		const viewportKey = `${map.getZoom()}:${getBoundsCacheKey(bounds)}:${this._container.width}x${this._container.height}`;
		const sideKey = sides
			.map((side) => side.map((country) => country?.id || 0).join(","))
			.join("|");
		const staticCacheKey = [
			viewportKey,
			viewMode,
			isAtlas ? `${currentImagery}:${mapResolution}` : currentImagery,
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
		const politicalStyleKey = [
			viewMode,
			currentImagery,
			useSimplifiedBase ? 1 : 0,
			mountainsEnabled ? 1 : 0,
			disableCountryGradient ? 1 : 0,
			allianceViewEnabled ? 1 : 0,
			isWar ? 1 : 0,
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
			(isWar && !canReuseStaticSurface) ||
			(this._invalidLayers & RENDER_LAYERS.STATIC) !== 0 ||
			this._staticCacheKey !== staticCacheKey ||
			_allianceCacheDirty ||
			this._allControlTilesDirty ||
			(viewMode === "FLAG" && hasVisibleControlChanges && politicalRefreshDue);
		const partialControlRedraw =
			!fullStaticRefresh && hasVisibleControlChanges && politicalRefreshDue;
		const renderStatic = fullStaticRefresh || partialControlRedraw;
		const controlTileColumns = Math.ceil(gridWidth / CONTROL_DIRTY_TILE_SIZE);
		if (this._allControlTilesDirty) {
			this._politicalChunkCache?.clear();
			this._regionChunkCache?.clear();
		}
		const isStaticCellInPaintTiles = (x, y) => {
			if (!partialControlRedraw) return true;
			return intersectsControlPaintTiles(
				x,
				y,
				step,
				controlTileColumns,
				dirtyControlPaintTiles,
			);
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
		const gpuActive =
			this._gpu?.ready &&
			!cinematicMode &&
			!this._isCapturing &&
			viewMode !== "FLAG";
		this._gpu?.setActive(gpuActive);
		const staticCtx = this._backgroundSurface.getContext("2d", {
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
			if (padding) ctx.translate(padding, padding);
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
					const left = Math.min(cornerA.x, cornerB.x);
					const top = Math.min(cornerA.y, cornerB.y);
					const width = Math.abs(cornerB.x - cornerA.x);
					const height = Math.abs(cornerB.y - cornerA.y);
					ctx.rect(left, top, width, height);
				}
				ctx.clip();
				ctx.clearRect(
					-padding,
					-padding,
					mapSize.x + padding * 2,
					mapSize.y + padding * 2,
				);
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
			if (isAtlas) {
				drawAtlasOcean(ctx, map, project, padding, bounds);
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
		if (isEditing || isAtlas) {
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
			const x = new Float32Array((vWidth + 1) * 2 + 1);
			const y = new Float32Array((vHeight + 1) * 2 + 1);
			for (let offset = 0; offset <= (vWidth + 1) * 2; offset++) {
				x[offset] = project(yMin * res - 90, (xMin + offset / 2) * res - 180).x;
			}
			for (let offset = 0; offset <= (vHeight + 1) * 2; offset++) {
				y[offset] = project((yMin + offset / 2) * res - 90, xMin * res - 180).y;
			}
			gridProjection = { key: projectionKey, x, y };
			this._gridProjectionCache = gridProjection;
		}

		const getGridPoint = (gx, gy) => {
			const xOffset = (gx - xMin) * 2;
			const yOffset = (gy - yMin) * 2;
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

		const backgroundCtx = ctx;
		if (renderStatic) {
			ctx = this._staticSurface.getContext("2d");
			if (fullStaticRefresh)
				ctx.clearRect(
					0,
					0,
					this._staticSurface.width,
					this._staticSurface.height,
				);
			ctx.save();
			ctx.scale(dpr, dpr);
			if (padding) ctx.translate(padding, padding);
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
					const left = Math.min(cornerA.x, cornerB.x);
					const top = Math.min(cornerA.y, cornerB.y);
					const width = Math.abs(cornerB.x - cornerA.x);
					const height = Math.abs(cornerB.y - cornerA.y);
					ctx.rect(left, top, width, height);
				}
				ctx.clip();
				ctx.clearRect(
					-padding,
					-padding,
					mapSize.x + padding * 2,
					mapSize.y + padding * 2,
				);
			}
		}
		drawTerrain.call(this, {
			backgroundCtx,
			padding,
			createSurface: () => document.createElement("canvas"),
			mapResolution,
			viewBounds,
			mapSize,
			isAtlas,
			isEditing,
			worldWidthDeg,
			worldHeightDeg,
			viewportKey,
			project,
			renderStatic,
			fullStaticRefresh,
			partialControlRedraw,
			dirtyControlPaintTiles,
			viewMode,
			showCountryLabels,
			gridProjection,
			isWar,
			ctx,
			currentZoom,
			gridWidth,
			staticCacheKey,
			politicalStyleKey,
			sideKey,
			staticPaintXMax: staticPaintGridBounds.xMax,
			staticPaintYMax: staticPaintGridBounds.yMax,
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
			occupationMap,
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
			onFlagLoad: () => {
				influenceLayer?.invalidate?.(RENDER_LAYERS.STATIC);
				influenceLayer?.render();
			},
			paintClippedFlag,
			dpr,
			staticLoopYMin,
			staticLoopYMax,
			staticLoopXMin,
			staticLoopXMax,
		});

		if (renderStatic) backgroundCtx.restore();
		// Let the browser composite unchanged map layers during normal viewing.
		// Exports and recordings still receive the complete public canvas.
		this._compositeLayers = cinematicMode || this._isCapturing === true;
		for (const surface of [
			this._backgroundSurface,
			this._staticSurface,
			this._labelsSurface,
			this._overlaysSurface,
		]) {
			surface.style.display = this._compositeLayers ? "none" : "";
		}
		mainCtx.clearRect(0, 0, this._container.width, this._container.height);
		mainCtx.save();
		mainCtx.scale(dpr, dpr);
		if (padding) mainCtx.translate(padding, padding);
		if (this._compositeLayers) {
			mainCtx.drawImage(
				this._backgroundSurface,
				0,
				0,
				this._container.width / dpr,
				this._container.height / dpr,
			);
			mainCtx.drawImage(
				this._staticSurface,
				0,
				0,
				this._container.width / dpr,
				this._container.height / dpr,
			);
		}
		ctx = mainCtx;

		// Pass 4: Selection Highlight
		drawUnits.call(this, {
			isAtlas,
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
			ctx,
			dpr,
			createSurface: () => document.createElement("canvas"),
			onFlagLoad: () => this.requestRender(RENDER_LAYERS.DYNAMIC),
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
		});
		mainCtx.restore();
		this._invalidLayers &= ~RENDER_LAYERS.DYNAMIC;

		drawLabels.call(this, {
			units,
			frontlines: _frontlinePolys,
			soldiersPerUnit,
			sideColors,
			landMask,
			getGridIndex,
			padding,
			viewBounds,
			isAtlas,
			viewportKey,
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
			ctx,
			regions,
			countryMetadata,
			MAX_SIDES,
			sides,
			map,
			CONFIG,
			project,
		});

		drawOverlays.call(this, {
			padding,
			viewportKey,
			isWar,
			showWarPlans,
			showArmyDiagnostics,
			isCustomTerrain,
			refAboveTerrain,
			referenceImageUrl,
			refOpacity,
			simFrameCount,
			isPaused,
			RENDER_LAYERS,
			mainCtx,
			dpr,
			ctx,
			gameMode,
			referenceOverlay,
			godModeActive,
			map,
			worldWidthDeg,
			worldHeightDeg,
			mapRuntime,
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
		});
		this._gpu?.setCamera();
		this._renderedZoom = currentZoom;
		this._renderedCenter = map.getCenter();
		this._lastCameraPaintTime = performance.now();
		this._commitZoomSettle();

		if (_r0)
			window.__perf.render =
				(window.__perf.render || 0) + performance.now() - _r0;
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
		atlas = false,
	) {
		if (!text || Number.isNaN(fontSize) || fontSize <= 0) return;
		ctx.font = atlas
			? `500 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`
			: `bold ${fontSize}px "Times New Roman", Times, serif`;
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
				ctx.lineWidth = atlas ? 1.5 : Math.max(2, fontSize / 5);
				ctx.strokeText(char, 0, 0);
			}
			ctx.fillStyle = atlas ? "#e5dcc7" : "white";
			ctx.fillText(char, 0, 0);

			ctx.restore();
		});
	},

	formatSoldiers: (n) => Math.floor(Math.max(0, n)).toLocaleString(),

	drawCasualtiesOnCanvas: function (ctx) {
		if (gameState !== "SIMULATING" && gameState !== "WAR_OVER") return;

		const boxWidth = 160;
		const entryHeight = 25;

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
