import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// Build-only source scenario. It is not under assets/, so it is never deployed.
export const WORLD_MAP_2022_SOURCE = new URL(
	"../source-data/world-map-2022.json.gz",
	import.meta.url,
);

export function readWorldMap2022Bytes() {
	return gunzipSync(readFileSync(WORLD_MAP_2022_SOURCE));
}

export function readWorldMap2022() {
	return JSON.parse(readWorldMap2022Bytes().toString("utf8"));
}
