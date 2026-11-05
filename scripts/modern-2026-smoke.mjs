import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { decodeScenarioBinary, encodeScenario } from "../src/scenario-codec.js";
import {
	buildModern2026Scenario,
	rasterizePoliticalPolygon,
} from "./build-modern-2026-scenario.mjs";

// A lake remains unowned; a neighboring polygon must not fill it by accident.
const sample = new Uint16Array(100);
const box = (x0, y0, x1, y1) => [
	[x0, y0],
	[x1, y0],
	[x1, y1],
	[x0, y1],
	[x0, y0],
];
rasterizePoliticalPolygon(
	sample,
	[box(-180, -90, -170, -80), box(-177, -87, -173, -83)],
	1,
	{ res: 1, width: 10, height: 10 },
);
assert.equal(sample[55], 0, "Polygon holes remain water");
assert.equal(sample[11], 1, "Polygon exterior is painted");
rasterizePoliticalPolygon(sample, [box(-180, -90, -170, -80)], 2, {
	res: 1,
	width: 10,
	height: 10,
	existingLandOnly: true,
});
assert.equal(sample[55], 0, "Sovereignty normalization cannot create land");
assert.equal(sample[11], 2);

const bytes = fs.readFileSync(
	new URL("../assets/maps/compiled/world-map-2026-v3.mwsc.gz", import.meta.url),
);
// Rebuilding from the pinned Overture source is memory heavy, so it is opt-in.
const heavy = process.env.MW_HEAVY_SMOKES === "1";
if (heavy)
	assert.deepEqual(
		gzipSync(encodeScenario(buildModern2026Scenario()), { level: 9 }),
		bytes,
		"Committed package must reproduce from pinned source",
	);
const decoded = decodeScenarioBinary(gunzipSync(bytes));
const data = decoded.scenario;
assert.equal(decoded.land.length, 3600 * 1800);
assert.equal(data.gridRes, 0.1);
assert.equal(data.worldWidthDeg, 360);
assert.equal(data.worldHeightDeg, 180);
// Country names fall back to the scenario name when no NATIONS translation exists.
for (const meta of data.metadata)
	assert.ok(meta.name?.trim(), `country ${meta.id} has a display name`);
assert.deepEqual(data.startDate, { year: 2026, month: 10, day: 21 });
assert.equal(data.useScenarioLand, true);
assert.equal(data.sovereigntyBase, "control");
assert.equal(data.historicalSource.release, "2026-10-21.0");
assert.match(data.historicalSource.attribution, /OpenStreetMap/);
assert.match(data.historicalSource.license, /odbl/);
assert.match(data.historicalSource.sourceSHA256, /^[a-f0-9]{64}$/);
assert.ok(data.metadata.every((meta) => meta.id < 178 || meta.id >= 204));
assert.ok(
	data.metadata.every(
		(meta) => !meta.overlordId && !meta.releasableBy && !meta.savedCells,
	),
);
assert.deepEqual(data.historicalSource.politicalAliases, {
	CP: "FR",
	XE: "BQ",
	XS: "BQ",
	XJ: "SJ",
	XG: "PS",
	XW: "PS",
	XH: "SY",
});
assert.ok(
	data.metadata
		.filter((meta) => meta.isDisputed)
		.every((meta) => meta.flagUrl.startsWith("data:image/svg+xml;")),
	"Disputed pseudo-codes must never request nonexistent country flags",
);
for (const [alias, country] of Object.entries(
	data.historicalSource.politicalAliases,
)) {
	assert.ok(!data.metadata.some((meta) => meta.iso2 === alias));
	assert.ok(
		data.metadata
			.find((meta) => meta.iso2 === country)
			.sourceCodes.includes(alias),
	);
}
const idByCode = new Map(data.metadata.map((meta) => [meta.iso2, meta.id]));
const idx = (lat, lng) =>
	Math.floor((lat + 90) / 0.1) * 3600 + Math.floor((lng + 180) / 0.1);
for (const [name, lat, lng, code] of [
	["Kyiv", 50.45, 30.52, "UA"],
	["Simferopol", 44.95, 34.1, "UA"],
	["Donetsk", 48.02, 37.8, "UA"],
	["Kherson", 46.64, 32.62, "UA"],
	["Stepanakert", 39.82, 46.75, "AZ"],
	["Damascus", 33.51, 36.29, "SY"],
	["Raqqa", 35.95, 39.01, "SY"],
	["Golan", 33.0, 35.8, "SY"],
	["West Bank", 32.22, 35.26, "PS"],
	["Moscow", 55.75, 37.62, "RU"],
	["Washington", 38.9, -77.04, "US"],
	["Tokyo", 35.68, 139.69, "JP"],
]) {
	assert.equal(
		decoded.worldControl[idx(lat, lng)],
		idByCode.get(code),
		`${name}: political owner`,
	);
	assert.equal(
		decoded.deJure[idx(lat, lng)],
		idByCode.get(code),
		`${name}: sovereign owner`,
	);
	assert.equal(decoded.land[idx(lat, lng)], 1, `${name}: compiled land`);
}
assert.equal(decoded.land[idx(0, -140)], 0, "Open Pacific is water");
assert.equal(decoded.land[idx(40, -30)], 0, "Open Atlantic is water");
assert.equal(
	decoded.land[idx(42, 34)],
	0,
	"Black Sea is water, not maritime territory",
);
assert.ok(
	data.cities.every(
		(city) => city.ownerId === decoded.worldControl[idx(city.lat, city.lng)],
	),
);
console.log(
	`Modern 2026: pinned political source, land/holes, sovereignty, historical-faction removal and ${heavy ? "reproducible" : "committed"} package passed`,
);
