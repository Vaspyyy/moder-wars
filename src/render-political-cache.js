import { atlasColor, atlasQuad } from "./render-atlas.js";

// Political materials and meshes live in world-grid coordinates. Camera motion
// only projects cached rectangles; it never creates a color string per cell.
const CHUNK_SIZE = 32;
const MAX_CHUNKS = 2048;
const UNKNOWN_RGBA = [150, 150, 150, 1];
const ALLIANCE_RGBA = [180, 180, 180, 1];

// Compare the few country/material inputs directly. Numeric snapshots avoid
// allocating a color string per country on every frame and retain exact values.
export function createPoliticalStyleTracker() {
	let values = new Float64Array(0);
	let sideColors = [];
	return (frame) => {
		const size = frame.countryMetadata.length * 9;
		let changed = values.length !== size;
		if (changed) values = new Float64Array(size);
		let cursor = 0;
		const record = (value) => {
			if (!Object.is(values[cursor], value)) changed = true;
			values[cursor++] = value;
		};
		for (const metadata of frame.countryMetadata) {
			const id = metadata?.id || 0;
			const rgba = metadata?.rgba || UNKNOWN_RGBA;
			const root = frame.allianceViewEnabled
				? frame.allianceKeyById?.[id] || id
				: 0;
			const alliance = root
				? frame.allianceColorByRoot?.[root] || ALLIANCE_RGBA
				: ALLIANCE_RGBA;
			record(id);
			record(rgba[0]);
			record(rgba[1]);
			record(rgba[2]);
			record(metadata?.overlordId || 0);
			record(root);
			record(alliance[0]);
			record(alliance[1]);
			record(alliance[2]);
		}
		if (
			sideColors.length !== frame.sideColors.length ||
			frame.sideColors.some((color, index) => color !== sideColors[index])
		) {
			sideColors = frame.sideColors.slice();
			changed = true;
		}
		return changed;
	};
}

function makeMaterials(frame) {
	const materials = [null];
	const materialIndex = new Map();
	const countries = [];
	const occupants = new Map();
	const sideRgba = frame.sideColors.map((color) =>
		(color.match(/[\d.]+/g) || [180, 180, 180]).map(Number),
	);
	const baseAlpha = frame.isAtlas
		? 1
		: frame.isSimplifiedMode && !frame.isCustomTerrain
			? 1
			: 0.65;
	const createBase = (r, g, b, alpha, id) => {
		if (frame.isAtlas) [r, g, b] = atlasColor(r, g, b);
		return {
			r,
			g,
			b,
			alpha,
			id,
			variants: new Map(),
		};
	};
	const neutral = [
		createBase(20, 38, 20, 1, 0),
		createBase(140, 120, 70, 1, 0),
	];
	const flag = createBase(150, 150, 150, baseAlpha, 0);
	const unknown = createBase(150, 150, 150, 0.6, 0);
	for (const metadata of frame.countryMetadata) {
		if (!metadata?.id) continue;
		const id = metadata.id;
		let rgba = metadata.rgba || [150, 150, 150, 1];
		if (frame.allianceViewEnabled) {
			const root = frame.allianceKeyById[id] || id;
			rgba = frame.allianceColorByRoot[root] || [180, 180, 180, 1];
		} else if (metadata.overlordId) {
			const overlord = frame.countryMetadata[metadata.overlordId - 1];
			if (overlord?.rgba) {
				rgba = rgba.map((channel, index) =>
					index < 3
						? Math.round(overlord.rgba[index] * 0.75 + channel * 0.25)
						: channel,
				);
			}
		}
		const alpha = frame.allianceViewEnabled
			? frame.isSimplifiedMode && !frame.isCustomTerrain
				? 1
				: 0.85
			: baseAlpha;
		countries[id] = [
			createBase(rgba[0], rgba[1], rgba[2], alpha, id),
			createBase(rgba[0], rgba[1], rgba[2], frame.isAtlas ? 0.96 : 0.7, id),
		];
	}
	const materialFor = (base, intensity, biome, sovereignId) => {
		let variants = base.variants.get(intensity);
		if (!variants) {
			variants = [];
			base.variants.set(intensity, variants);
		}
		const desert =
			frame.useSimplifiedBase && !frame.isAtlas && biome === 1 ? 1 : 0;
		const variantIndex =
			desert + (frame.useSimplifiedBase && sovereignId === 0 ? 2 : 0);
		if (variants[variantIndex]) return variants[variantIndex];
		let { r, g, b, alpha } = base;
		if (intensity > 0) {
			if (frame.useSimplifiedBase && sovereignId === 0) {
				const lift = intensity * 42;
				r = Math.min(255, r + lift);
				g = Math.min(255, g + lift * 1.1);
				b = Math.min(255, b + lift);
				alpha = 0.95;
			} else {
				const dim = frame.isAtlas
					? 1 - intensity * 0.12
					: 0.7 - intensity * 0.25;
				r = Math.floor(r * dim);
				g = Math.floor(g * dim);
				b = Math.floor(b * dim);
				alpha = frame.isAtlas ? alpha : frame.isWar ? alpha * 0.75 : 0.75;
			}
		}
		if (desert) {
			r = Math.min(255, r * 1.1 + 30);
			g = Math.min(255, g * 1.1 + 10);
			b = Math.max(0, b * 0.85);
		}
		const countryId =
			frame.useSimplifiedBase && !frame.disableCountryGradient ? base.id : 0;
		let index = materialIndex;
		for (const key of [countryId, r, g, b]) {
			let next = index.get(key);
			if (!next) {
				next = new Map();
				index.set(key, next);
			}
			index = next;
		}
		const alphaKey = Number(alpha.toFixed(3));
		const existing = index.get(alphaKey);
		if (existing) {
			variants[variantIndex] = existing;
			return existing;
		}
		const id = materials.length;
		index.set(alphaKey, id);
		materials.push({
			r,
			g,
			b,
			alpha: alpha.toFixed(3),
			countryId,
			fill: `rgba(${r},${g},${b},${alpha.toFixed(3)})`,
		});
		variants[variantIndex] = id;
		return id;
	};
	const resolve = (index) => {
		// Extend the color field by one cell only when a precise Earth coast clips
		// it back. The extension cannot paint unselectable islands into the ocean.
		if (frame.atlasCoast && frame.landMask[index] === 0) {
			const x = index % frame.gridWidth,
				y = Math.floor(index / frame.gridWidth);
			let nearest = -1,
				distance = Infinity;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					if (
						x + dx < 0 ||
						x + dx >= frame.gridWidth ||
						y + dy < 0 ||
						y + dy >= frame.gridHeight
					)
						continue;
					const candidate = (y + dy) * frame.gridWidth + x + dx,
						d = dx * dx + dy * dy;
					if (frame.landMask[candidate] > 0 && d < distance) {
						nearest = candidate;
						distance = d;
					}
				}
			if (nearest >= 0) index = nearest;
		}
		const mask = frame.landMask[index];
		if (mask !== 1 && mask !== 2) return 0;
		const sovereignId = frame.worldControlMap[index];
		const background = frame.viewMode === "FLAG";
		const biome = frame.biomeMask[index];
		let base;
		if (sovereignId === 0 || background) {
			if (frame.useSimplifiedBase) base = neutral[biome === 1 ? 1 : 0];
			else if (background) base = flag;
			else return 0;
		} else {
			base = countries[sovereignId]?.[0] || unknown;
			if (
				!frame.allianceViewEnabled &&
				countries[sovereignId] &&
				frame.isWar &&
				mask === 2
			) {
				const side = frame.dominantSideMap[index];
				if (side !== -1) {
					if (side === frame.sovereignSideMap[sovereignId]) {
						base = countries[sovereignId][1];
					} else {
						const occupier = frame.primaryOccupierMap[index];
						const key =
							occupier > 0 ? occupier : -(side + 1) * 65536 - sovereignId;
						base = occupants.get(key);
						if (!base) {
							const rgba = frame.countryMetadata[occupier - 1]?.rgba ||
								sideRgba[side] || [180, 180, 180];
							base = createBase(
								Math.round(rgba[0] * 0.7 + 255 * 0.3),
								Math.round(rgba[1] * 0.7 + 255 * 0.3),
								Math.round(rgba[2] * 0.7 + 255 * 0.3),
								0.85,
								occupier > 0 ? occupier : sovereignId,
							);
							occupants.set(key, base);
						}
					}
				}
			}
		}
		const intensity =
			frame.mountainsEnabled && frame.terrain ? frame.terrain[index] || 0 : 0;
		return materialFor(
			base,
			frame.isAtlas ? Math.round(intensity * 4) / 4 : intensity,
			biome,
			sovereignId,
		);
	};
	return {
		materials,
		resolve,
		update(nextFrame) {
			frame = nextFrame;
		},
	};
}

export function createPoliticalChunkCache() {
	const chunks = new Map();
	const styleInputsChanged = createPoliticalStyleTracker();
	const values = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
	const processed = new Uint8Array(values.length);
	let styleKey;
	let palette;
	let world;
	let mask;
	let dimensions;
	let built = 0;
	let reused = 0;
	const clear = () => {
		chunks.clear();
		styleKey = undefined;
		palette = undefined;
		world = undefined;
		mask = undefined;
		dimensions = undefined;
	};
	const prepare = (frame) => {
		const nextDimensions = `${frame.gridWidth}:${frame.gridHeight}:${frame.isAtlas ? "atlas" : `${frame.step}:${frame.currentZoom < 5 ? 2 : 1}`}`;
		const nextStyle = `${frame.politicalStyleKey || frame.staticCacheKey}:${frame.isAtlas ? 1 : 0}:${frame.atlasCoast ? 1 : 0}`;
		const changedPalette = styleInputsChanged(frame);
		if (
			changedPalette ||
			(palette?.materials.length || 0) > 65536 ||
			styleKey !== nextStyle ||
			world !== frame.worldControlMap ||
			mask !== frame.landMask ||
			dimensions !== nextDimensions
		) {
			clear();
			styleKey = nextStyle;
			world = frame.worldControlMap;
			mask = frame.landMask;
			dimensions = nextDimensions;
			palette = makeMaterials(frame);
		}
		palette.update(frame);
	};
	const get = (frame, chunkX, chunkY) => {
		const columns = Math.ceil(frame.gridWidth / CHUNK_SIZE);
		const key = chunkY * columns + chunkX;
		let chunk = chunks.get(key);
		if (chunk) {
			reused++;
			chunks.delete(key);
			chunks.set(key, chunk);
			return chunk;
		}
		const x = chunkX * CHUNK_SIZE;
		const y = chunkY * CHUNK_SIZE;
		const width = Math.min(CHUNK_SIZE, frame.gridWidth - x);
		const height = Math.min(CHUNK_SIZE, frame.gridHeight - y);
		const step = frame.step;
		values.fill(0);
		processed.fill(0);
		for (let row = 0; row < height && !frame.isAtlas; row += step) {
			for (let column = 0; column < width; column += step) {
				values[row * CHUNK_SIZE + column] = palette.resolve(
					(y + row) * frame.gridWidth + x + column,
				);
			}
		}
		const rectangles = [];
		for (let row = 0; row < height && !frame.isAtlas; row += step) {
			for (let column = 0; column < width; column += step) {
				const index = row * CHUNK_SIZE + column;
				const material = values[index];
				if (!material || processed[index]) continue;
				let w = step;
				while (
					column + w < width &&
					values[index + w] === material &&
					!processed[index + w]
				)
					w += step;
				let h = step;
				while (row + h < height) {
					let match = true;
					for (let offset = 0; offset < w; offset += step) {
						const next = (row + h) * CHUNK_SIZE + column + offset;
						if (values[next] !== material || processed[next]) {
							match = false;
							break;
						}
					}
					if (!match) break;
					h += step;
				}
				w = Math.min(w, width - column);
				h = Math.min(h, height - row);
				rectangles.push(material, x + column, y + row, w, h);
				for (let dy = 0; dy < h; dy += step) {
					for (let dx = 0; dx < w; dx += step)
						processed[(row + dy) * CHUNK_SIZE + column + dx] = 1;
				}
			}
		}
		const polygons = [];
		const borders = [];
		const frontlines = [];
		const effectiveOwner = (index) => {
			if (frame.landMask[index] === 0) return -1;
			const owner = frame.worldControlMap[index];
			if (
				frame.viewMode === "FLAG" &&
				frame.isWar &&
				frame.landMask[index] === 2 &&
				frame.dominantSideMap[index] !== -1 &&
				frame.dominantSideMap[index] !== frame.sovereignSideMap[owner]
			)
				return frame.primaryOccupierMap[index] || owner;
			return owner;
		};
		const borderStep = frame.currentZoom < 5 ? 2 : 1;
		for (let row = 0; row < height && !frame.isAtlas; row += borderStep) {
			const gy = y + row;
			for (let column = 0; column < width; column += borderStep) {
				const gx = x + column;
				const index = gy * frame.gridWidth + gx;
				const owner = effectiveOwner(index);
				if (
					gx + borderStep < frame.gridWidth &&
					owner !== effectiveOwner(index + borderStep)
				)
					borders.push(gx + borderStep, gy, gx + borderStep, gy + borderStep);
				if (
					gy + borderStep < frame.gridHeight &&
					owner !== effectiveOwner(index + borderStep * frame.gridWidth)
				)
					borders.push(gx, gy + borderStep, gx + borderStep, gy + borderStep);
			}
		}
		if (frame.isAtlas) {
			rectangles.length = 0;
			borders.length = 0;
			const stride = width + 1,
				samples = new Uint32Array(stride * (height + 1)),
				ownersCache = new Int32Array(samples.length);
			for (let row = 0; row <= height; row++)
				for (let column = 0; column <= width; column++) {
					const gx = Math.min(frame.gridWidth - 1, x + column),
						gy = Math.min(frame.gridHeight - 1, y + row),
						index = gy * frame.gridWidth + gx;
					samples[row * stride + column] = palette.resolve(index);
					ownersCache[row * stride + column] = effectiveOwner(index);
				}
			const sample = (gx, gy) => samples[(gy - y) * stride + gx - x];
			const owner = (gx, gy) => ownersCache[(gy - y) * stride + gx - x];
			for (let row = 0; row < height; row++)
				for (let column = 0; column < width; column++) {
					const gx = x + column,
						gy = y + row;
					const ids = [
						sample(gx, gy),
						sample(gx + 1, gy),
						sample(gx + 1, gy + 1),
						sample(gx, gy + 1),
					];
					const owners = [
						owner(gx, gy),
						owner(gx + 1, gy),
						owner(gx + 1, gy + 1),
						owner(gx, gy + 1),
					];
					const outlines = owners.every((id) => id === owners[0])
						? null
						: atlasQuad(owners, gx + 0.5, gy + 0.5);
					// Earth's shoreline is drawn separately; custom maps retain grid contours.
					if (outlines && (!frame.atlasCoast || owners.every((id) => id >= 0)))
						for (const edge of outlines.borders) borders.push(...edge);
					if (ids.every((id) => id === ids[0])) {
						let run = 1;
						while (
							column + run < width &&
							sample(gx + run + 1, gy) === ids[0] &&
							sample(gx + run + 1, gy + 1) === ids[0]
						)
							run++;
						// Skipped quads have the same material but can have country borders
						// (e.g. alliance colors). Do not skip their owner contours.
						for (let j = 1; j < run; j++) {
							const labels = [
								owner(gx + j, gy),
								owner(gx + j + 1, gy),
								owner(gx + j + 1, gy + 1),
								owner(gx + j, gy + 1),
							];
							if (
								!labels.every((id) => id === labels[0]) &&
								(!frame.atlasCoast || labels.every((id) => id >= 0))
							)
								for (const edge of atlasQuad(labels, gx + j + 0.5, gy + 0.5)
									.borders)
									borders.push(...edge);
						}
						if (ids[0]) rectangles.push(ids[0], gx + 0.5, gy + 0.5, run, 1);
						column += run - 1;
					} else {
						for (const polygon of atlasQuad(ids, gx + 0.5, gy + 0.5).polygons) {
							if (!polygon.id) continue;
							polygons.push(polygon.id, polygon.points.length);
							for (const point of polygon.points) polygons.push(...point);
						}
					}
				}
		}
		if (frame.isWar) {
			const crossings = new Float32Array(8);
			for (let row = 0; row < height; row += step) {
				const gy = y + row;
				if (gy + 1 >= frame.gridHeight) continue;
				for (let column = 0; column < width; column += step) {
					const gx = x + column;
					if (gx + 1 >= frame.gridWidth) continue;
					const index = gy * frame.gridWidth + gx;
					const below = index + frame.gridWidth;
					if (
						frame.landMask[index] !== 2 &&
						frame.landMask[index + 1] !== 2 &&
						frame.landMask[below] !== 2 &&
						frame.landMask[below + 1] !== 2
					)
						continue;
					const a = frame.dominantSideMap[index];
					const b = frame.dominantSideMap[index + 1];
					const c = frame.dominantSideMap[below + 1];
					const d = frame.dominantSideMap[below];
					let count = 0;
					if (a >= 0 && b >= 0 && a !== b) {
						crossings[count++] = gx + 0.5;
						crossings[count++] = gy;
					}
					if (b >= 0 && c >= 0 && b !== c) {
						crossings[count++] = gx + 1;
						crossings[count++] = gy + 0.5;
					}
					if (d >= 0 && c >= 0 && d !== c) {
						crossings[count++] = gx + 0.5;
						crossings[count++] = gy + 1;
					}
					if (a >= 0 && d >= 0 && a !== d) {
						crossings[count++] = gx;
						crossings[count++] = gy + 0.5;
					}
					if (count === 2)
						frontlines.push(crossings[0], crossings[1], gx + 0.5, gy + 0.5);
					else if (count >= 4) {
						frontlines.push(
							crossings[0],
							crossings[1],
							crossings[2],
							crossings[3],
						);
						if (count >= 6)
							frontlines.push(
								crossings[2],
								crossings[3],
								crossings[4],
								crossings[5],
							);
					}
				}
			}
		}
		chunk = {
			rectangles: frame.isAtlas
				? new Float32Array(rectangles)
				: new Uint32Array(rectangles),
			polygons: new Float32Array(polygons),
			borders: new Float32Array(borders),
			frontlines: new Float32Array(frontlines),
		};
		chunks.set(key, chunk);
		if (chunks.size > (frame.isAtlas ? 32768 : MAX_CHUNKS))
			chunks.delete(chunks.keys().next().value);
		built++;
		return chunk;
	};
	return {
		prepare,
		get,
		clear,
		invalidateTiles(tileKeys, gridWidth, gridHeight) {
			const columns = Math.ceil(gridWidth / CHUNK_SIZE);
			const rows = Math.ceil(gridHeight / CHUNK_SIZE);
			for (const key of tileKeys) {
				const cx = key % columns;
				const cy = Math.floor(key / columns);
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) {
						if (
							cx + dx >= 0 &&
							cx + dx < columns &&
							cy + dy >= 0 &&
							cy + dy < rows
						)
							chunks.delete((cy + dy) * columns + cx + dx);
					}
			}
		},

		invalidateCells(cellIndices, gridWidth, gridHeight) {
			const columns = Math.ceil(gridWidth / CHUNK_SIZE);
			const rows = Math.ceil(gridHeight / CHUNK_SIZE);
			for (const index of cellIndices) {
				const cx = Math.floor((index % gridWidth) / CHUNK_SIZE);
				const cy = Math.floor(Math.floor(index / gridWidth) / CHUNK_SIZE);
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (
							cx + dx >= 0 &&
							cx + dx < columns &&
							cy + dy >= 0 &&
							cy + dy < rows
						)
							chunks.delete((cy + dy) * columns + cx + dx);
					}
				}
			}
		},
		get materials() {
			return palette?.materials || [];
		},
		get stats() {
			return { built, reused, chunks: chunks.size };
		},
	};
}

export function drawPoliticalChunks(layer, frame) {
	if (!layer._politicalChunkCache)
		layer._politicalChunkCache = createPoliticalChunkCache();
	const cache = layer._politicalChunkCache;
	cache.prepare(frame);
	if (!layer._politicalBatches) layer._politicalBatches = new Map();
	const batches = layer._politicalBatches;
	batches.clear();
	const materials = cache.materials;
	if (!layer._visiblePoliticalChunks) layer._visiblePoliticalChunks = [];
	const visibleChunks = layer._visiblePoliticalChunks;
	visibleChunks.length = 0;
	const fills = new Map();
	const polygonBatches = new Map();
	const { ctx } = frame;
	const fillFor = (id) => {
		if (fills.has(id)) return fills.get(id);
		const material = materials[id];
		const metadata = frame.countryMetadata[material.countryId - 1];
		let fill = material.fill;
		if (
			frame.useSimplifiedBase &&
			!frame.disableCountryGradient &&
			metadata?.bounds
		) {
			const top = frame.getGridPoint(0, metadata.bounds.minY).y;
			const bottom = frame.getGridPoint(0, metadata.bounds.maxY).y;
			fill = ctx.createLinearGradient(0, top, 0, bottom);
			const { r, g, b, alpha } = material;
			fill.addColorStop(
				0,
				`rgba(${Math.min(255, r + (frame.isAtlas ? 8 : 25))},${Math.min(255, g + (frame.isAtlas ? 8 : 25))},${Math.min(255, b + (frame.isAtlas ? 8 : 25))},${alpha})`,
			);
			fill.addColorStop(0.3, material.fill);
			fill.addColorStop(
				1,
				`rgba(${Math.floor(r * (frame.isAtlas ? 0.92 : 0.65))},${Math.floor(g * (frame.isAtlas ? 0.92 : 0.65))},${Math.floor(b * (frame.isAtlas ? 0.92 : 0.65))},${alpha})`,
			);
		}
		fills.set(id, fill);
		return fill;
	};
	const minX = Math.max(
		0,
		Math.floor((frame.staticLoopXMin - (frame.isAtlas ? 0.5 : 0)) / CHUNK_SIZE),
	);
	const maxX = Math.floor((frame.staticPaintXMax ?? frame.xMax) / CHUNK_SIZE);
	const minY = Math.max(
		0,
		Math.floor((frame.staticLoopYMin - (frame.isAtlas ? 0.5 : 0)) / CHUNK_SIZE),
	);
	const maxY = Math.floor((frame.staticPaintYMax ?? frame.yMax) / CHUNK_SIZE);
	for (let cy = minY; cy <= maxY; cy++) {
		for (let cx = minX; cx <= maxX; cx++) {
			const chunk = cache.get(frame, cx, cy);
			visibleChunks.push(chunk);
			const mesh = chunk.polygons;
			for (let offset = 0; offset < mesh.length; ) {
				const id = mesh[offset++],
					count = mesh[offset++],
					points = [];
				for (let i = 0; i < count; i++) {
					const p = frame.getGridPoint(mesh[offset++], mesh[offset++]);
					points.push(p.x, p.y);
				}
				let batch = polygonBatches.get(id);
				if (!batch) {
					batch = [];
					polygonBatches.set(id, batch);
				}
				batch.push(points);
			}
			const rectangles = chunk.rectangles;
			for (let offset = 0; offset < rectangles.length; offset += 5) {
				const id = rectangles[offset];
				const x = rectangles[offset + 1];
				const y = rectangles[offset + 2];
				const width = rectangles[offset + 3];
				const height = rectangles[offset + 4];
				if (
					x > frame.xMax + (frame.isAtlas ? 1 : 0) ||
					y > frame.yMax + (frame.isAtlas ? 1 : 0) ||
					x + width <= frame.xMin ||
					y + height <= frame.yMin
				)
					continue;
				const a = frame.getGridPoint(x, y);
				const b = frame.getGridPoint(x + width, y + height);
				let batch = batches.get(id);
				if (!batch) {
					batch = [];
					batches.set(id, batch);
				}
				batch.push(
					Math.min(a.x, b.x) - (frame.isAtlas ? 0 : 0.25),
					Math.min(a.y, b.y) - (frame.isAtlas ? 0 : 0.25),
					Math.abs(b.x - a.x) + (frame.isAtlas ? 0 : 0.5),
					Math.abs(b.y - a.y) + (frame.isAtlas ? 0 : 0.5),
				);
			}
		}
	}
	for (const id of polygonBatches.keys())
		if (!batches.has(id)) batches.set(id, []);
	for (const [id, rectangles] of batches) {
		ctx.fillStyle = fillFor(id);
		ctx.beginPath();
		for (let offset = 0; offset < rectangles.length; offset += 4)
			ctx.rect(
				rectangles[offset],
				rectangles[offset + 1],
				rectangles[offset + 2],
				rectangles[offset + 3],
			);
		for (const points of polygonBatches.get(id) || []) {
			ctx.moveTo(points[0], points[1]);
			for (let i = 2; i < points.length; i += 2)
				ctx.lineTo(points[i], points[i + 1]);
			ctx.closePath();
		}
		ctx.fill();
	}
}

export function drawPoliticalBorders(layer, frame) {
	const { ctx } = frame;
	const draw = (field) => {
		ctx.beginPath();
		for (const chunk of layer._visiblePoliticalChunks || []) {
			const segments = chunk[field];
			for (let offset = 0; offset < segments.length; offset += 4) {
				const x1 = segments[offset];
				const y1 = segments[offset + 1];
				const x2 = segments[offset + 2];
				const y2 = segments[offset + 3];
				if (
					Math.max(x1, x2) < frame.xMin ||
					Math.min(x1, x2) > frame.xMax + 1 ||
					Math.max(y1, y2) < frame.yMin ||
					Math.min(y1, y2) > frame.yMax + 1
				)
					continue;
				const shift = frame.isAtlas && field === "frontlines" ? 0.5 : 0;
				const a = frame.getGridPoint(x1 + shift, y1 + shift);
				const b = frame.getGridPoint(x2 + shift, y2 + shift);
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
			}
		}
		ctx.stroke();
	};
	if (frame.isWar) {
		ctx.strokeStyle = frame.CONFIG.FRONTLINE_COLOR;
		ctx.lineWidth = Math.max(1.2, 3.5 * (frame.currentZoom / 5));
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		draw("frontlines");
	}
	const flag = frame.viewMode === "FLAG";
	ctx.strokeStyle = flag
		? "rgba(255,255,255,0.45)"
		: frame.isAtlas
			? "rgba(12,25,36,0.8)"
			: "rgba(0,0,0,0.3)";
	ctx.lineWidth = flag
		? 1.5
		: frame.isAtlas
			? Math.min(1.4, 0.65 + frame.currentZoom * 0.09)
			: 1;
	if (frame.isAtlas) {
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
	}
	draw("borders");
}
