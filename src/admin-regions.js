/** Validate the compact, read-only administrative geography independently of game ownership. */
export function decodeAdminRegions(data) {
	if (data?.version !== 1 || !Array.isArray(data.regions))
		throw new Error("Unsupported administrative region data");
	const point = (value) =>
		Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
	for (const region of data.regions) {
		if (
			typeof region.id !== "string" ||
			typeof region.names?.en !== "string" ||
			!point(region.anchor) ||
			!Array.isArray(region.bbox) ||
			region.bbox.length !== 4 ||
			!region.bbox.every(Number.isFinite) ||
			!Array.isArray(region.rings) ||
			region.rings.some(
				(ring) =>
					!Array.isArray(ring) ||
					ring.length < 6 ||
					ring.length % 2 ||
					!ring.every(Number.isFinite),
			)
		)
			throw new Error(`Invalid administrative region: ${region.id}`);
	}
	return data.regions;
}

/** Share one decoded data set and bound retries when optional geography is unavailable. */
export function createAdminRegionsLoader({
	fetcher = (...args) => fetch(...args),
	now = () => Date.now(),
	retryMs = 30_000,
	maxAttempts = 3,
	warn = (error) =>
		console.warn("Administrative boundaries unavailable:", error),
} = {}) {
	let data = null;
	let pending = null;
	let attempts = 0;
	let retryAt = -Infinity;
	return {
		get data() {
			return data;
		},
		load() {
			if (pending) return pending;
			if (data || attempts >= maxAttempts || now() < retryAt) return null;
			attempts++;
			pending = Promise.resolve()
				.then(() =>
					fetcher(
						new URL(
							"../assets/geodata/admin1/regions.json.gz",
							import.meta.url,
						),
					),
				)
				.then(async (response) => {
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					let buffer = await response.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					// A server may already have decoded the gzip content encoding.
					if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
						buffer = await new Response(
							new Blob([buffer])
								.stream()
								.pipeThrough(new DecompressionStream("gzip")),
						).arrayBuffer();
					}
					data = decodeAdminRegions(
						JSON.parse(new TextDecoder().decode(buffer)),
					);
					return data;
				})
				.catch((error) => {
					retryAt = now() + retryMs;
					warn(error);
					return null;
				})
				.finally(() => {
					pending = null;
				});
			return pending;
		},
	};
}

/** Longitude intervals can cross the antimeridian; wide source bounds remain conservative. */
export function intersectsAdminBounds(bbox, viewBounds) {
	const [west, south, east, north] = bbox;
	if (south > viewBounds.getNorth() || north < viewBounds.getSouth())
		return false;
	const viewWest = viewBounds.getWest();
	const viewEast = viewBounds.getEast();
	if (viewEast - viewWest >= 360) return true;
	const intervals = (left, right) =>
		left <= right
			? [[left, right]]
			: [
					[left, 180],
					[-180, right],
				];
	return intervals(west, east).some(([left, right]) =>
		intervals(viewWest, viewEast).some(([a, b]) => left <= b && right >= a),
	);
}
