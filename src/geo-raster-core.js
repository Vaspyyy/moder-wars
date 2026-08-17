export const GEO_RASTER_ALGORITHM_VERSION = "cell-center-polygon-v1";

function isPointInRing(ring, lng, lat) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersects =
			yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

function isPointInPolygon(polygon, lng, lat) {
	if (!polygon?.[0] || !isPointInRing(polygon[0], lng, lat)) return false;
	for (let i = 1; i < polygon.length; i++) {
		if (isPointInRing(polygon[i], lng, lat)) return false;
	}
	return true;
}

function geometryPolygons(geometry) {
	if (geometry?.type === "Polygon") return [geometry.coordinates];
	if (geometry?.type === "MultiPolygon") return geometry.coordinates;
	return [];
}

function polygonBounds(polygon) {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	const stack = polygon ? [polygon] : [];
	while (stack.length) {
		const value = stack.pop();
		if (
			Array.isArray(value) &&
			typeof value[0] === "number" &&
			typeof value[1] === "number"
		) {
			minLng = Math.min(minLng, value[0]);
			maxLng = Math.max(maxLng, value[0]);
			minLat = Math.min(minLat, value[1]);
			maxLat = Math.max(maxLat, value[1]);
		} else if (Array.isArray(value)) {
			for (const child of value) stack.push(child);
		}
	}
	return { maxLat, maxLng, minLat, minLng };
}

function validateOptions(features, options) {
	if (!Array.isArray(features))
		throw new TypeError("features must be an array");
	for (const name of ["gridResolution", "gridWidth", "gridHeight"]) {
		if (!Number.isFinite(options?.[name]) || options[name] <= 0) {
			throw new TypeError(`${name} must be a positive number`);
		}
	}
	if (
		!Number.isInteger(options.gridWidth) ||
		!Number.isInteger(options.gridHeight)
	) {
		throw new TypeError("gridWidth and gridHeight must be integers");
	}
}

/**
 * Rasterizes in feature order. Later features overwrite earlier owner IDs,
 * matching editor.updateLandMask. Cell-center and polygon-hole behavior matches
 * main.isPointInFeature.
 */
export async function rasterizeGeoFeatures(features, options, onProgress) {
	validateOptions(features, options);
	const {
		gridResolution,
		gridWidth,
		gridHeight,
		blank = false,
		maskValue = 1,
		yieldEvery = 12,
	} = options;
	const cellCount = gridWidth * gridHeight;
	const landMask = new Uint8Array(cellCount);
	const OwnerArray = features.length <= 0xffff ? Uint16Array : Uint32Array;
	const ownerMap = new OwnerArray(cellCount);
	const featureBounds = new Int32Array(features.length * 4);
	featureBounds.fill(-1);

	for (let i = 0; i < features.length; i++) {
		const feature = features[i];
		const polygons = geometryPolygons(feature?.geometry);
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const polygon of polygons) {
			const bounds = polygonBounds(polygon);
			if (!Number.isFinite(bounds.minLng)) continue;
			const startY = Math.max(
				0,
				Math.floor((bounds.minLat + 90) / gridResolution),
			);
			const endY = Math.min(
				gridHeight - 1,
				Math.ceil((bounds.maxLat + 90) / gridResolution),
			);
			const startX = Math.max(
				0,
				Math.floor((bounds.minLng + 180) / gridResolution),
			);
			const endX = Math.min(
				gridWidth - 1,
				Math.ceil((bounds.maxLng + 180) / gridResolution),
			);
			for (let y = startY; y <= endY; y++) {
				const lat = y * gridResolution - 90 + gridResolution * 0.5;
				const rowOffset = y * gridWidth;
				for (let x = startX; x <= endX; x++) {
					const lng = x * gridResolution - 180 + gridResolution * 0.5;
					if (!isPointInPolygon(polygon, lng, lat)) continue;
					const index = rowOffset + x;
					landMask[index] = maskValue;
					ownerMap[index] = i + 1;
					if (!blank) {
						minX = Math.min(minX, x);
						maxX = Math.max(maxX, x);
						minY = Math.min(minY, y);
						maxY = Math.max(maxY, y);
					}
				}
			}
		}
		if (!blank && minX !== Infinity) {
			featureBounds.set([minX, maxX, minY, maxY], i * 4);
		}

		onProgress?.({ completed: i + 1, total: features.length });
		if (yieldEvery > 0 && (i + 1) % yieldEvery === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	return { featureBounds, landMask, ownerMap };
}
