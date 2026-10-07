/**
 * Major rivers as defensive lines. The packed lines come from
 * scripts/build-river-lines.mjs; rasterizing is pure so the simulation, Node
 * smokes and the profiler share it.
 */

/** Decodes packed Int16 lines into arrays of [lng, lat] in degrees. */
export function decodeRiverLines(buffer) {
	const values = new Int16Array(buffer);
	const lines = [];
	let offset = 0;
	while (offset < values.length) {
		const count = values[offset++];
		if (count < 2 || offset + count * 2 > values.length)
			throw new Error("Unexpected river line data");
		const line = new Float32Array(count * 2);
		for (let i = 0; i < line.length; i++) line[i] = values[offset++] / 100;
		lines.push(line);
	}
	return lines;
}

/**
 * Marks land cells on or beside a river (4-neighbourhood), so a line holds
 * on either bank. Returns null for worlds that are not the real Earth grid.
 */
export function rasterizeRiverMask(
	lines,
	{ gridWidth, gridHeight, gridRes, landMask },
) {
	if (!lines?.length || !(gridRes > 0)) return null;
	if (
		Math.round(gridWidth * gridRes) !== 360 ||
		Math.round(gridHeight * gridRes) !== 180
	)
		return null;
	const river = new Uint8Array(gridWidth * gridHeight);
	const mark = (lng, lat) => {
		const x = Math.floor((lng + 180) / gridRes);
		const y = Math.floor((lat + 90) / gridRes);
		if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight)
			river[y * gridWidth + x] = 1;
	};
	const step = gridRes / 2;
	for (const line of lines) {
		for (let i = 2; i < line.length; i += 2) {
			const lng0 = line[i - 2];
			const lat0 = line[i - 1];
			const dLng = line[i] - lng0;
			const dLat = line[i + 1] - lat0;
			const steps = Math.max(
				1,
				Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / step),
			);
			for (let s = 0; s <= steps; s++)
				mark(lng0 + (dLng * s) / steps, lat0 + (dLat * s) / steps);
		}
	}
	const mask = new Uint8Array(river.length);
	for (let y = 0; y < gridHeight; y++)
		for (let x = 0; x < gridWidth; x++) {
			const i = y * gridWidth + x;
			if (landMask && landMask[i] === 0) continue;
			if (
				river[i] ||
				(x > 0 && river[i - 1]) ||
				(x + 1 < gridWidth && river[i + 1]) ||
				(y > 0 && river[i - gridWidth]) ||
				(y + 1 < gridHeight && river[i + gridWidth])
			)
				mask[i] = 1;
		}
	return mask;
}

let riverRequest = null;
/** Loads the packed river lines once; resolves to null if they are unavailable. */
export function loadRiverLines() {
	riverRequest ??= fetch(
		new URL("../assets/geodata/derived/rivers-50m.bin.gz", import.meta.url),
	)
		.then((response) => {
			if (!response.ok) throw new Error("River lines unavailable");
			return new Response(
				response.body.pipeThrough(new DecompressionStream("gzip")),
			).arrayBuffer();
		})
		.then(decodeRiverLines)
		.catch((error) => {
			console.warn("Wars run without river lines:", error);
			riverRequest = null;
			return null;
		});
	return riverRequest;
}
