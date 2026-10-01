// Pure atlas styling/mesh helpers. Geography is prepacked offline; no raw
// GeoJSON is fetched, parsed or installed into browser simulation mirrors.
export function atlasColor(r, g, b) {
	const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
	return [r, g, b].map((channel) =>
		Math.round(Math.min(228, Math.max(38, channel * 0.78 + gray * 0.12 + 16))),
	);
}

export function decodeAtlasCoast(buffer) {
	const view = new DataView(buffer);
	let offset = 0;
	const uint = () => {
		if (offset + 4 > view.byteLength) throw new Error("Truncated atlas coast");
		const n = view.getUint32(offset, true);
		offset += 4;
		return n;
	};
	const float = () => {
		if (offset + 4 > view.byteLength) throw new Error("Truncated atlas coast");
		const n = view.getFloat32(offset, true);
		offset += 4;
		if (!Number.isFinite(n)) throw new Error("Invalid atlas coordinate");
		return n;
	};
	if (uint() !== 0x534c5441 || uint() !== 1)
		throw new Error("Unsupported atlas coast");
	const count = uint(),
		edgeCount = uint(),
		rings = [];
	if (count > 100000 || edgeCount > 1000000)
		throw new Error("Invalid atlas coast size");
	for (let i = 0; i < count; i++) {
		const n = uint();
		if (n < 3 || n > 1000000 || n * 8 > view.byteLength - offset)
			throw new Error("Invalid atlas ring");
		const points = new Float32Array(n * 2);
		for (let j = 0; j < points.length; j++) points[j] = float();
		rings.push(points);
	}
	const edges = new Float32Array(edgeCount * 4);
	for (let i = 0; i < edges.length; i++) edges[i] = float();
	if (offset !== view.byteLength)
		throw new Error("Unexpected atlas coast data");
	return { rings, edges };
}
const coasts = new Map(),
	coastRequests = new Map();
const resolutionFor = (value) =>
	["110m", "50m", "10m"].includes(value) ? value : "110m";
export function requestAtlasCoast(onReady, requestedResolution = "110m") {
	const resolution = resolutionFor(requestedResolution);
	if (coasts.has(resolution)) return;
	let request = coastRequests.get(resolution);
	if (!request) {
		request = fetch(
			new URL(`../assets/atlas/coast-${resolution}.bin.gz`, import.meta.url),
		)
			.then((response) => {
				if (!response.ok) throw new Error("Atlas coast unavailable");
				return response.arrayBuffer();
			})
			.then((buffer) =>
				new Response(
					new Blob([buffer])
						.stream()
						.pipeThrough(new DecompressionStream("gzip")),
				).arrayBuffer(),
			)
			.then((buffer) => {
				coasts.set(resolution, decodeAtlasCoast(buffer));
			})
			.catch((error) => {
				coasts.set(resolution, null);
				console.warn("Atlas uses grid coastline fallback:", error);
			});
		coastRequests.set(resolution, request);
	}
	request.then(onReady);
}

// Cache projected geography by viewport, independently of changing ownership.
// Disable earth clipping for editing/custom worlds; their painted coast remains authoritative.
export function getAtlasCoastPaths(layer, frame) {
	const resolution = resolutionFor(frame.mapResolution),
		coast = coasts.get(resolution),
		key = `${frame.viewportKey}:${resolution}`;
	if (
		!coast ||
		frame.isEditing ||
		frame.isCustomTerrain ||
		(frame.worldWidthDeg !== undefined && frame.worldWidthDeg !== 360) ||
		(frame.worldHeightDeg !== undefined && frame.worldHeightDeg !== 180)
	)
		return null;
	if (layer._atlasCoastPaths?.key === key) return layer._atlasCoastPaths;
	if (!coast.worldPaths) {
		const land = new Path2D(),
			shore = new Path2D();
		const normalized = (lng, lat) => {
			const sine = Math.sin(
				(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180,
			);
			return [
				(lng + 180) / 360,
				0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI),
			];
		};
		for (const ring of coast.rings) {
			for (let i = 0; i < ring.length; i += 2) {
				const p = normalized(ring[i], ring[i + 1]);
				if (i === 0) land.moveTo(...p);
				else land.lineTo(...p);
			}
			land.closePath();
		}
		for (let i = 0; i < coast.edges.length; i += 4) {
			shore.moveTo(...normalized(coast.edges[i], coast.edges[i + 1]));
			shore.lineTo(...normalized(coast.edges[i + 2], coast.edges[i + 3]));
		}
		coast.worldPaths = { land, shore };
	}
	// Leaflet's default Mercator camera is affine in these normalized world
	// coordinates. Project two anchors, then transform the native paths rather
	// than walking every geographic vertex through Leaflet after every move.
	const west = frame.project(0, -180),
		east = frame.project(0, 180),
		scale = east.x - west.x;
	const transform = {
		a: scale,
		b: 0,
		c: 0,
		d: scale,
		e: west.x,
		f: west.y - scale / 2,
	};
	const land = new Path2D(),
		shore = new Path2D();
	land.addPath(coast.worldPaths.land, transform);
	shore.addPath(coast.worldPaths.shore, transform);
	const paths = { key, land, shore };
	layer._atlasCoastPaths = paths;
	return paths;
}

export function drawAtlasOcean(
	ctx,
	map,
	project,
	padding = 0,
	renderBounds = map.getBounds(),
) {
	const size = map.getSize(),
		gradient = ctx.createLinearGradient(0, 0, 0, size.y);
	gradient.addColorStop(0, "#142332");
	gradient.addColorStop(0.5, "#243e4e");
	gradient.addColorStop(1, "#122231");
	ctx.fillStyle = gradient;
	ctx.fillRect(-padding, -padding, size.x + padding * 2, size.y + padding * 2);
	// Geographic grid moves with the world; density stays quiet at every zoom.
	const bounds = renderBounds,
		spacing = map.getZoom() < 4 ? 30 : map.getZoom() < 6 ? 10 : 5;
	ctx.save();
	ctx.strokeStyle = "rgba(187,217,229,0.055)";
	ctx.lineWidth = 0.7;
	ctx.beginPath();
	for (
		let lng = Math.ceil(bounds.getWest() / spacing) * spacing;
		lng <= bounds.getEast();
		lng += spacing
	) {
		const p = project(0, lng);
		ctx.moveTo(p.x, -padding);
		ctx.lineTo(p.x, size.y + padding);
	}
	for (
		let lat = Math.ceil(bounds.getSouth() / spacing) * spacing;
		lat <= Math.min(85, bounds.getNorth());
		lat += spacing
	) {
		const p = project(lat, 0);
		ctx.moveTo(-padding, p.y);
		ctx.lineTo(size.x + padding, p.y);
	}
	ctx.stroke();
	ctx.restore();
}

// A categorical marching-square mesh. Single-corner cells get a diagonal
// contour; junctions and isolated islands retain their centers. Every square
// is partitioned exactly, so ownership fills never leave gaps or overlap.
export function atlasQuad(values, x, y, size = 1) {
	const corners = [
		[x, y],
		[x + size, y],
		[x + size, y + size],
		[x, y + size],
	];
	const mids = [
		[x + size / 2, y],
		[x + size, y + size / 2],
		[x + size / 2, y + size],
		[x, y + size / 2],
	];
	const unique = [...new Set(values)],
		polygons = [],
		borders = [];
	if (unique.length === 1)
		return { polygons: [{ id: values[0], points: corners }], borders };
	if (unique.length === 2) {
		const single = values.findIndex(
			(id) => values.filter((value) => value === id).length === 1,
		);
		if (single !== -1) {
			const before = (single + 3) % 4;
			polygons.push({
				id: values[single],
				points: [corners[single], mids[single], mids[before]],
			});
			polygons.push({
				id: values[(single + 1) % 4],
				points: [
					mids[single],
					corners[(single + 1) % 4],
					corners[(single + 2) % 4],
					corners[before],
					mids[before],
				],
			});
			borders.push([...mids[single], ...mids[before]]);
			return { polygons, borders };
		}
	}
	const center = [x + size / 2, y + size / 2];
	for (let i = 0; i < 4; i++) {
		polygons.push({
			id: values[i],
			points: [corners[i], mids[i], center, mids[(i + 3) % 4]],
		});
		if (values[i] !== values[(i + 1) % 4])
			borders.push([...mids[i], ...center]);
	}
	return { polygons, borders };
}

export function atlasCityVisible(city, zoom, active, showNonCapital) {
	if (!city.isCapital && !showNonCapital) return false;
	if (active || city.isCapital) return true;
	if (zoom < 4) return false;
	return zoom >= 6 || city.pop >= (zoom >= 5 ? 100000 : 750000);
}

// The caller supplies a surface factory so this module remains DOM-independent.
export function drawAtlasTexture(layer, frame) {
	if (!layer._atlasTexture && frame.createSurface) {
		const surface = frame.createSurface();
		surface.width = 64;
		surface.height = 64;
		const ink = surface.getContext("2d");
		ink.fillStyle = "rgba(240,229,206,0.035)";
		for (let y = 2; y < 64; y += 8)
			for (let x = 2; x < 64; x += 8) ink.fillRect(x + (y % 3), y, 0.8, 0.8);
		layer._atlasTexture = surface;
	}
	if (!layer._atlasTexture) return;
	const ctx = frame.ctx;
	ctx.save();
	ctx.fillStyle = ctx.createPattern(layer._atlasTexture, "repeat");
	const padding = frame.padding || 0;
	ctx.fillRect(
		-padding,
		-padding,
		frame.mapSize.x + padding * 2,
		frame.mapSize.y + padding * 2,
	);
	ctx.restore();
}
