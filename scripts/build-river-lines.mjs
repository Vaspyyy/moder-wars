// Packs Natural Earth river centerlines into assets/geodata/derived/rivers-50m.bin.gz.
// Usage: node scripts/build-river-lines.mjs path/to/ne_50m_rivers_lake_centerlines.geojson
// Format (little-endian Int16): per river a point count, then lng,lat pairs in
// hundredths of a degree. Lake centerlines are dropped; only rivers form lines.
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const source = process.argv[2];
if (!source) {
	console.error("Pass the ne_50m_rivers_lake_centerlines GeoJSON path.");
	process.exit(1);
}
// Points closer than this to the last kept point add nothing at a 0.05° grid.
const MIN_STEP_DEG = 0.03;
const geojson = JSON.parse(readFileSync(source, "utf8"));
const values = [];
let rivers = 0;
let points = 0;
for (const feature of geojson.features) {
	if (feature.properties?.featurecla !== "River") continue;
	const { type, coordinates } = feature.geometry || {};
	const lines =
		type === "LineString"
			? [coordinates]
			: type === "MultiLineString"
				? coordinates
				: [];
	for (const line of lines) {
		const kept = [];
		for (const [lng, lat] of line) {
			const last = kept.at(-1);
			if (
				last &&
				Math.abs(last[0] - lng) < MIN_STEP_DEG &&
				Math.abs(last[1] - lat) < MIN_STEP_DEG
			)
				continue;
			kept.push([lng, lat]);
		}
		const tail = line.at(-1);
		if (tail && kept.at(-1) !== tail) kept.push(tail);
		if (kept.length < 2) continue;
		values.push(kept.length);
		for (const [lng, lat] of kept)
			values.push(Math.round(lng * 100), Math.round(lat * 100));
		rivers++;
		points += kept.length;
	}
}
const packed = new Int16Array(values);
const output = new URL(
	"../assets/geodata/derived/rivers-50m.bin.gz",
	import.meta.url,
);
writeFileSync(output, gzipSync(Buffer.from(packed.buffer), { level: 9 }));
console.log(`${rivers} river lines, ${points} points`);
