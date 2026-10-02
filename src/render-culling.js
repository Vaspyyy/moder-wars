// Numeric bounds checks avoid allocating the map camera LatLng objects in entity loops.
export function containsRenderPoint(bounds, lat, lng) {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
	if (lat < bounds.getSouth() || lat > bounds.getNorth()) return false;
	const west = bounds.getWest();
	const east = bounds.getEast();
	const width = east - west;
	if (width >= 360) return true;
	const span = ((width % 360) + 360) % 360;
	const offset = (((lng - west) % 360) + 360) % 360;
	return offset <= span;
}

// Scan each visible quad once, even when many countries are selected. Keep the
// original per-country draw order while skipping every unrelated interior cell.
export function collectSelectionQuads(world, width, bounds, selected, output) {
	output.clear();
	for (const id of selected) output.set(id, []);
	if (!selected.size) return output;
	for (let y = bounds.yMin; y < bounds.yMax; y++) {
		for (let x = bounds.xMin; x < bounds.xMax; x++) {
			const index = y * width + x;
			const a = world[index];
			const b = world[index + 1];
			const c = world[index + width + 1];
			const d = world[index + width];
			if (a === b && b === c && c === d) continue;
			if (selected.has(a)) output.get(a).push(index);
			if (b !== a && selected.has(b)) output.get(b).push(index);
			if (c !== a && c !== b && selected.has(c)) output.get(c).push(index);
			if (d !== a && d !== b && d !== c && selected.has(d))
				output.get(d).push(index);
		}
	}
	return output;
}
