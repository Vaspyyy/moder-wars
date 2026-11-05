import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PREDERIVED_EARTH_ASSETS } from "../src/geo-raster-assets.js";
import { COMPILED_SCENARIO_URLS } from "../src/scenario-codec.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function verifyRevision(path, expectedRevision) {
	const bytes = await readFile(resolve(root, path));
	const digest = createHash("sha256").update(bytes).digest("hex");
	assert.equal(
		digest.slice(0, expectedRevision.length),
		expectedRevision,
		`${path} content revision is stale`,
	);
}

let scenarioCount = 0;
for (const url of Object.values(COMPILED_SCENARIO_URLS)) {
	const parsed = new URL(url, "https://example.test/");
	const revision = parsed.searchParams.get("rev");
	assert.ok(revision, `${url} has no content revision`);
	await verifyRevision(decodeURIComponent(parsed.pathname.slice(1)), revision);
	scenarioCount++;
}

let rasterCount = 0;
for (const resolutions of Object.values(PREDERIVED_EARTH_ASSETS)) {
	for (const asset of Object.values(resolutions)) {
		await verifyRevision(asset.path, asset.revision);
		rasterCount++;
	}
}

assert.equal(scenarioCount, 3);
assert.equal(rasterCount, 12);
console.log(
	`load asset manifest smoke: ${scenarioCount} scenarios and ${rasterCount} rasters verified`,
);
