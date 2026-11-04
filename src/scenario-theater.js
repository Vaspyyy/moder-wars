/** Validate an optional geographic theater without changing global grid coordinates. */
export function normalizeScenarioTheater(value) {
	if (value == null) return null;
	const bounds = value.bounds;
	if (
		typeof value.id !== "string" ||
		!Array.isArray(bounds) ||
		bounds.length !== 4 ||
		!bounds.every(Number.isFinite) ||
		bounds[0] < -180 ||
		bounds[2] > 180 ||
		bounds[1] < -90 ||
		bounds[3] > 90 ||
		bounds[0] >= bounds[2] ||
		bounds[1] >= bounds[3] ||
		!Array.isArray(value.countryIds) ||
		!value.countryIds.length ||
		!value.countryIds.every(
			(id) => Number.isInteger(id) && id > 0 && id <= 65535,
		) ||
		!Array.isArray(value.countryCodes) ||
		!value.countryCodes.every(
			(code) => typeof code === "string" && /^[A-Z]{3}$/.test(code),
		)
	)
		throw new TypeError("Invalid scenario theater");
	return {
		id: value.id,
		bounds: [...bounds],
		countryIds: [...new Set(value.countryIds)],
		countryCodes: [...new Set(value.countryCodes)],
	};
}

export function isInsideScenarioTheater(theater, lat, lng) {
	if (!theater) return true;
	const [west, south, east, north] = theater.bounds;
	return lat >= south && lat <= north && lng >= west && lng <= east;
}

/** Remove off-theater land from Earth rasters; retained arrays keep global indices. */
export function applyScenarioTheater(theater, frame) {
	if (!theater) return 0;
	const scope = normalizeScenarioTheater(theater);
	const owners = new Set(scope.countryIds);
	const { worldControlMap, deJureMap, landMask, gridWidth, gridRes } = frame;
	const grids = [
		worldControlMap,
		deJureMap,
		landMask,
		frame.biomeMask,
		frame.provinceMap,
		frame.terrainMask,
	].filter(Boolean);
	let removed = 0;
	for (let i = 0; i < landMask.length; i++) {
		const lat = (Math.floor(i / gridWidth) + 0.5) * gridRes - 90;
		const lng = ((i % gridWidth) + 0.5) * gridRes - 180;
		const owner = worldControlMap[i] || deJureMap[i];
		if (isInsideScenarioTheater(scope, lat, lng) && owners.has(owner)) continue;
		if (landMask[i]) removed++;
		for (const grid of grids) {
			grid[i] = 0;
		}
	}
	return removed;
}

/** Cache a row-merged land clip so worldwide coastlines cannot repaint excluded continents. */
export function getScenarioTheaterClip(layer, frame) {
	if (!frame.theater) return null;
	if (
		layer._theaterLandClip?.viewportKey === frame.viewportKey &&
		layer._theaterLandClip.land === frame.landMask &&
		layer._theaterLandClip.theater === frame.theater
	)
		return layer._theaterLandClip.path;
	const path = new Path2D();
	const { gridWidth, landMask, getGridPoint } = frame;
	for (
		let y = Math.max(0, frame.yMin);
		y <= Math.min(frame.gridHeight - 1, frame.yMax);
		y++
	) {
		for (
			let x = Math.max(0, frame.xMin);
			x <= Math.min(gridWidth - 1, frame.xMax);
			x++
		) {
			if (!landMask[y * gridWidth + x]) continue;
			const start = x;
			while (
				x + 1 <= frame.xMax &&
				x + 1 < gridWidth &&
				landMask[y * gridWidth + x + 1]
			)
				x++;
			const a = getGridPoint(start, y + 1),
				b = getGridPoint(x + 1, y);
			path.rect(
				Math.min(a.x, b.x),
				Math.min(a.y, b.y),
				Math.abs(b.x - a.x),
				Math.abs(b.y - a.y),
			);
		}
	}
	layer._theaterLandClip = {
		viewportKey: frame.viewportKey,
		theater: frame.theater,
		land: landMask,
		path,
	};
	return path;
}
