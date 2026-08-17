import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "assets/geodata/derived");
const resolutions = [0.05, 0.1, 0.15, 0.25];
const sourceResolutions = ["110m", "50m", "10m"];
await mkdir(outputDir, { recursive: true });

function polygonBounds(polygon) {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	for (const ring of polygon) {
		for (const point of ring) {
			minLng = Math.min(minLng, point[0]);
			maxLng = Math.max(maxLng, point[0]);
			minLat = Math.min(minLat, point[1]);
			maxLat = Math.max(maxLat, point[1]);
		}
	}
	return { maxLat, maxLng, minLat, minLng };
}

function ringIntervals(ring, lat) {
	const crossings = [];
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		if (yi > lat !== yj > lat) {
			crossings.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
		}
	}
	crossings.sort((a, b) => a - b);
	const intervals = [];
	for (let i = 0; i + 1 < crossings.length; i += 2) {
		intervals.push([crossings[i], crossings[i + 1]]);
	}
	return intervals;
}

function subtractIntervals(exterior, holes) {
	if (holes.length === 0) return exterior;
	const cuts = holes.toSorted((a, b) => a[0] - b[0]);
	const result = [];
	for (const [left, right] of exterior) {
		let cursor = left;
		for (const [cutLeft, cutRight] of cuts) {
			if (cutRight <= cursor) continue;
			if (cutLeft >= right) break;
			if (cutLeft > cursor) result.push([cursor, Math.min(cutLeft, right)]);
			cursor = Math.max(cursor, cutRight);
			if (cursor >= right) break;
		}
		if (cursor < right) result.push([cursor, right]);
	}
	return result;
}

function firstCellAtOrAfter(targetLng, gridResolution, gridWidth) {
	let low = 0;
	let high = gridWidth;
	while (low < high) {
		const middle = (low + high) >> 1;
		const center =
			middle * gridResolution - 180 + gridResolution * 0.5;
		if (center < targetLng) low = middle + 1;
		else high = middle;
	}
	return low;
}

// Build-only exact scanline path. The edge predicate and intersection formula
// are identical to main.isPointInFeature; intervals are [left, right), and hole
// intervals are removed before writing so earlier owners remain visible there.
function rasterizeOwners(features, gridResolution, gridWidth, gridHeight) {
	const ownerMap = new Uint16Array(gridWidth * gridHeight);
	for (let featureIndex = 0; featureIndex < features.length; featureIndex++) {
		const geometry = features[featureIndex]?.geometry;
		const polygons =
			geometry?.type === "Polygon"
				? [geometry.coordinates]
				: geometry?.type === "MultiPolygon"
					? geometry.coordinates
					: [];
		for (const polygon of polygons) {
			const bounds = polygonBounds(polygon);
			const startY = Math.max(
				0,
				Math.floor((bounds.minLat + 90) / gridResolution),
			);
			const endY = Math.min(
				gridHeight - 1,
				Math.ceil((bounds.maxLat + 90) / gridResolution),
			);
			for (let y = startY; y <= endY; y++) {
				const lat = y * gridResolution - 90 + gridResolution * 0.5;
				const rowOffset = y * gridWidth;
				const exterior = ringIntervals(polygon[0], lat);
				if (exterior.length === 0) continue;
				const holes = [];
				for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
					holes.push(...ringIntervals(polygon[ringIndex], lat));
				}
				for (const [left, right] of subtractIntervals(exterior, holes)) {
					const startX = firstCellAtOrAfter(
						left,
						gridResolution,
						gridWidth,
					);
					const endX = firstCellAtOrAfter(
						right,
						gridResolution,
						gridWidth,
					);
					ownerMap.fill(featureIndex + 1, rowOffset + startX, rowOffset + endX);
				}
			}
		}
	}
	return ownerMap;
}

function encodeRuns(ownerMap, gridWidth, gridHeight, featureCount) {
	const runs = [];
	let owner = ownerMap[0] || 0;
	let length = 0;
	for (let i = 0; i < ownerMap.length; i++) {
		const next = ownerMap[i];
		if (next === owner && length < 0xffff) {
			length++;
			continue;
		}
		runs.push([length, owner]);
		owner = next;
		length = 1;
	}
	runs.push([length, owner]);

	const buffer = Buffer.allocUnsafe(16 + runs.length * 4);
	buffer.write("MWR1", 0, "ascii");
	buffer.writeUInt16LE(1, 4);
	buffer.writeUInt16LE(gridWidth, 6);
	buffer.writeUInt16LE(gridHeight, 8);
	buffer.writeUInt16LE(featureCount, 10);
	buffer.writeUInt32LE(runs.length, 12);
	for (let i = 0; i < runs.length; i++) {
		buffer.writeUInt16LE(runs[i][0], 16 + i * 4);
		buffer.writeUInt16LE(runs[i][1], 18 + i * 4);
	}
	return { buffer, runCount: runs.length };
}

for (const sourceResolution of sourceResolutions) {
	const sourcePath = resolve(
		root,
		`assets/geodata/${sourceResolution}/cultural/ne_${sourceResolution}_admin_0_countries.json`,
	);
	const data = JSON.parse(await readFile(sourcePath, "utf8"));
	const features = data.features || [];
	for (const gridResolution of resolutions) {
		const gridWidth = Math.round(360 / gridResolution);
		const gridHeight = Math.round(180 / gridResolution);
		const ownerMap = rasterizeOwners(
			features,
			gridResolution,
			gridWidth,
			gridHeight,
		);
		const { buffer, runCount } = encodeRuns(
			ownerMap,
			gridWidth,
			gridHeight,
			features.length,
		);
		const outputPath = resolve(
			outputDir,
			`ne_${sourceResolution}_admin_0_countries_${gridResolution}.mwr`,
		);
		await writeFile(outputPath, buffer);
		console.log(
			`${sourceResolution}/${gridResolution}: ${gridWidth}x${gridHeight}, ${features.length} features, ${runCount} runs, ${buffer.length} bytes`,
		);
	}
}
