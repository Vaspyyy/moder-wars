import { weightedBorderQuad } from "./border-geometry.js";
import {
	drawAtlasOcean,
	drawAtlasTexture,
	getAtlasCoastPaths,
} from "./render-atlas.js";
import { politicalMaterialFill } from "./render-political-cache.js";

const EPSILON = 1e-9;
export const BORDER_MOTION = Object.freeze({
	DURATION_MS: 180,
	MAX_CELLS: 512,
	FRAME_MS: 1000 / 60,
	BUSY_FRAME_MS: 1000 / 30,
	PAINT_BUDGET_MS: 8,
});
const single = (id) => new Map([[id, 1]]);
const mix = (from, to, fraction) => {
	const result = new Map();
	for (const [id, weight] of from) result.set(id, weight * (1 - fraction));
	for (const [id, weight] of to)
		result.set(id, (result.get(id) || 0) + weight * fraction);
	for (const [id, weight] of result) if (weight < EPSILON) result.delete(id);
	return result;
};

export function createBorderMotion({
	durationMs = BORDER_MOTION.DURATION_MS,
	maxCells = BORDER_MOTION.MAX_CELLS,
} = {}) {
	const cells = new Map();
	const sample = (index, fallback, time, channel) => {
		const cell = cells.get(index);
		if (!cell) return single(fallback);
		const linear = Math.max(0, Math.min(1, (time - cell.started) / durationMs));
		const fraction = linear * linear * (3 - 2 * linear);
		return mix(cell.from[channel], cell.to[channel], fraction);
	};
	return {
		sample,
		record(index, before, after, time) {
			if (
				before.material === after.material &&
				before.side === after.side &&
				before.owner === after.owner
			)
				return false;
			if (!cells.has(index) && cells.size >= maxCells) return false;
			const from = {},
				to = {};
			for (const channel of ["material", "side", "owner"]) {
				from[channel] = sample(index, before[channel], time, channel);
				to[channel] = single(after[channel]);
			}
			cells.set(index, { from, to, started: time });
			return true;
		},
		settle(time, committed = () => true) {
			for (const [index, cell] of cells)
				if (time >= cell.started + durationMs && committed(index))
					cells.delete(index);
		},
		quads(width, height) {
			const result = new Set();
			for (const index of cells.keys()) {
				const x = index % width,
					y = Math.floor(index / width);
				for (const dx of [-1, 0])
					for (const dy of [-1, 0])
						if (
							x + dx >= 0 &&
							x + dx + 1 < width &&
							y + dy >= 0 &&
							y + dy + 1 < height
						)
							result.add((y + dy) * width + x + dx);
			}
			return result;
		},
		clear: () => cells.clear(),
		get endTime() {
			let latest = 0;
			for (const cell of cells.values())
				latest = Math.max(latest, cell.started + durationMs);
			return latest;
		},
		get size() {
			return cells.size;
		},
	};
}

export function captureBorderMotion(layer, tiles, time) {
	const frame = layer._borderMotionFrame,
		cache = layer._politicalChunkCache,
		motion = layer._borderMotion;
	if (!frame || !motion || cache?.generation !== frame.materialGeneration)
		return;
	for (const tile of tiles) {
		for (let row = 0; row < tile.height; row++)
			for (let col = 0; col < tile.width; col++) {
				const x = tile.x + col,
					y = tile.y + row,
					offset = row * tile.width + col,
					index = y * frame.gridWidth + x;
				if (
					x < frame.xMin - 1 ||
					x > frame.xMax + 1 ||
					y < frame.yMin - 1 ||
					y > frame.yMax + 1
				)
					continue;
				const before = {
					worldControlMap: frame.worldControlMap[index],
					dominantSideMap: frame.dominantSideMap[index],
					primaryOccupierMap: frame.primaryOccupierMap[index],
					landMask: frame.landMask[index],
				};
				if (
					Object.entries(before).every(
						([key, value]) => (tile[key]?.[offset] ?? value) === value,
					)
				)
					continue;
				const after = Object.fromEntries(
					Object.keys(before).map((key) => [
						key,
						tile[key]?.[offset] ?? before[key],
					]),
				);
				if (!before.landMask || before.landMask !== after.landMask) continue;
				const state = (control) => ({
					material: cache.resolveMaterial(index, control),
					side: control.landMask === 2 ? control.dominantSideMap : -1,
					owner: control.worldControlMap,
				});
				motion.record(index, state(before), state(after), time);
			}
	}
}

// Leaflet's default Mercator projection is affine in normalized world space.
// Cache two camera anchors once; fractional animated vertices never call GIS APIs.
export function createBorderProjector(frame) {
	if (!frame.project) return frame.getGridPoint;
	const west = frame.project(0, -180),
		east = frame.project(0, 180);
	const scale = east.x - west.x,
		resolution = frame.CONFIG.GRID_RES;
	return (x, y) => {
		const latitude = Math.max(
			-85.05112878,
			Math.min(85.05112878, y * resolution - 90),
		);
		return {
			x: west.x + ((x * resolution) / 360) * scale,
			y:
				west.y -
				(scale * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))) /
					(2 * Math.PI),
		};
	};
}

export function drawBorderMotion(layer, frame, time, force = false) {
	const surface = layer._borderMotionSurface,
		motion = layer._borderMotion;
	const ctx = surface.getContext("2d");
	if (!frame || !motion.size) {
		ctx.clearRect(0, 0, surface.width, surface.height);
		layer._borderMotionLastPaint = null;
		layer._borderMotionPaintCost = 0;
		return;
	}
	const cache = layer._politicalChunkCache;
	if (cache.generation !== frame.materialGeneration) {
		motion.clear();
		ctx.clearRect(0, 0, surface.width, surface.height);
		return;
	}
	const projectionKey = `${frame.viewportKey}:${frame.CONFIG.GRID_RES}:${frame.gridWidth}:${frame.gridHeight}`;
	const cameraChanged = layer._borderMotionProjection?.key !== projectionKey;
	if (cameraChanged)
		layer._borderMotionProjection = {
			key: projectionKey,
			point: createBorderProjector(frame),
		};
	motion.settle(
		time,
		(index) =>
			!layer._allControlTilesDirty &&
			!layer._dirtyControlTiles.has(
				Math.floor(Math.floor(index / frame.gridWidth) / 32) *
					Math.ceil(frame.gridWidth / 32) +
					Math.floor((index % frame.gridWidth) / 32),
			),
	);
	const interval =
		layer._borderMotionPaintCost > BORDER_MOTION.PAINT_BUDGET_MS
			? BORDER_MOTION.BUSY_FRAME_MS
			: BORDER_MOTION.FRAME_MS;
	// Keep the existing surface on skipped frames. Static repaints and camera
	// changes always update it immediately; heavy transitions can paint at 30 Hz.
	if (
		motion.size &&
		!force &&
		!cameraChanged &&
		layer._borderMotionLastPaint !== null &&
		(time - layer._borderMotionLastPaint < interval - 0.5 ||
			layer._borderMotionLastPaint >= motion.endTime)
	)
		return;
	const started = performance.now();
	ctx.clearRect(0, 0, surface.width, surface.height);
	layer._borderMotionLastPaint = time;
	const quads = [...motion.quads(frame.gridWidth, frame.gridHeight)].filter(
		(index) => {
			const x = index % frame.gridWidth,
				y = Math.floor(index / frame.gridWidth);
			return (
				x >= frame.xMin - 1 &&
				x <= frame.xMax &&
				y >= frame.yMin - 1 &&
				y <= frame.yMax
			);
		},
	);
	if (!quads.length) {
		motion.clear();
		return;
	}
	ctx.save();
	ctx.scale(frame.dpr, frame.dpr);
	if (frame.padding) ctx.translate(frame.padding, frame.padding);
	const coast = getAtlasCoastPaths(layer, frame);
	if (coast) ctx.clip(coast.land);
	const fields = new Map(),
		frontlineEdges = [],
		ownerEdges = [];
	const project = layer._borderMotionProjection.point;
	const materialFrame = { ...frame, getGridPoint: project };
	const samples = new Map();
	const sampleNode = (index) => {
		if (samples.has(index)) return samples.get(index);
		const value = {
			material: motion.sample(
				index,
				cache.resolveMaterial(index),
				time,
				"material",
			),
			side: motion.sample(
				index,
				frame.landMask[index] === 2 ? frame.dominantSideMap[index] : -1,
				time,
				"side",
			),
			owner: motion.sample(
				index,
				frame.landMask[index] ? frame.worldControlMap[index] : -1,
				time,
				"owner",
			),
		};
		samples.set(index, value);
		return value;
	};
	const path = (points) => {
		const a = project(...points[0]);
		ctx.moveTo(a.x, a.y);
		for (let i = 1; i < points.length; i++) {
			const p = project(...points[i]);
			ctx.lineTo(p.x, p.y);
		}
		ctx.closePath();
	};
	ctx.beginPath();
	for (const index of quads) {
		const x = (index % frame.gridWidth) + 0.5,
			y = Math.floor(index / frame.gridWidth) + 0.5;
		path([
			[x, y],
			[x + 1, y],
			[x + 1, y + 1],
			[x, y + 1],
		]);
	}
	ctx.clip();
	if (coast) {
		ctx.fillStyle = "#667265";
		ctx.fill();
	} else {
		// Custom worlds and the geography fallback use the ocean under their
		// translucent land fills. Reproduce it so coastal patches cannot turn grey.
		drawAtlasOcean(
			ctx,
			{
				getSize: () => frame.mapSize,
				getZoom: () => frame.currentZoom,
			},
			(lat, lng) =>
				project(
					(lng + 180) / frame.CONFIG.GRID_RES,
					(lat + 90) / frame.CONFIG.GRID_RES,
				),
			frame.padding,
			frame.viewBounds,
		);
	}
	for (const index of quads) {
		const x = index % frame.gridWidth,
			y = Math.floor(index / frame.gridWidth);
		const nodes = [
			index,
			index + 1,
			index + frame.gridWidth + 1,
			index + frame.gridWidth,
		];
		const states = nodes.map(sampleNode);
		const materials = states.map((state) => state.material);
		for (const polygon of weightedBorderQuad(materials, x + 0.5, y + 0.5)
			.polygons) {
			if (!polygon.id) continue;
			if (!fields.has(polygon.id)) fields.set(polygon.id, []);
			fields.get(polygon.id).push(polygon.points);
		}
		const sides = states.map((state) => state.side);
		for (const edge of weightedBorderQuad(sides, x + 0.5, y + 0.5).borders)
			if (edge.left >= 0 && edge.right >= 0) frontlineEdges.push(edge);
		const owners = states.map((state) => state.owner);
		for (const edge of weightedBorderQuad(owners, x + 0.5, y + 0.5).borders)
			if (!coast || (edge.left >= 0 && edge.right >= 0)) ownerEdges.push(edge);
	}
	for (const [id, polygons] of fields) {
		const material = cache.materials[id];
		if (!material) continue;
		ctx.fillStyle = politicalMaterialFill(materialFrame, ctx, material);
		ctx.beginPath();
		for (const polygon of polygons) path(polygon);
		ctx.fill();
	}
	drawAtlasTexture(layer, { ...frame, ctx });
	const stroke = (edges, color, width) => {
		ctx.beginPath();
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		for (const edge of edges) {
			const a = project(...edge.from),
				b = project(...edge.to);
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
		}
		ctx.stroke();
	};
	stroke(
		frontlineEdges,
		frame.CONFIG.FRONTLINE_COLOR,
		Math.max(1.2, (3.5 * frame.currentZoom) / 5),
	);
	stroke(
		ownerEdges,
		"rgba(12,25,36,0.8)",
		Math.min(1.4, 0.65 + frame.currentZoom * 0.09),
	);
	if (coast) {
		ctx.strokeStyle = "rgba(9,24,35,0.85)";
		ctx.lineWidth = Math.min(1.6, 0.7 + frame.currentZoom * 0.1);
		ctx.stroke(coast.shore);
	}
	ctx.restore();
	const cost = performance.now() - started;
	layer._borderMotionPaintCost =
		(layer._borderMotionPaintCost ?? cost) * 0.75 + cost * 0.25;
}
