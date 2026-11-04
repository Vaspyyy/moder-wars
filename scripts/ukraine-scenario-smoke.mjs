import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { decodeScenarioBinary, encodeScenario } from "../src/scenario-codec.js";
import { applyScenarioTheater, getScenarioTheaterClip, isInsideScenarioTheater, normalizeScenarioTheater } from "../src/scenario-theater.js";
import { applyScenarioSovereigntyOverrides } from "../src/scenario-territory.js";
import {
	buildUkraine2023Scenario,
	pointInRing,
} from "./build-ukraine-scenario.mjs";

const bytes = fs.readFileSync(
	new URL("../assets/maps/compiled/ukraine-2023-v3.mwsc.gz", import.meta.url),
);
// Rebuilding the package parses the 31 MB 2022 world JSON and needs several GB
// of memory. It is opt-in so the curated smoke suite stays light.
const heavy = process.env.MW_HEAVY_SMOKES === "1";
const generated = heavy ? buildUkraine2023Scenario() : null;
if (generated)
	assert.deepEqual(
		gzipSync(encodeScenario(generated), { level: 9 }),
		bytes,
		"Committed package must reproduce from the visual reference",
	);
const decoded = decodeScenarioBinary(gunzipSync(bytes));
const source = decoded.scenario;
assert.deepEqual(source.startDate, { year: 2023, month: 1, day: 1 });
assert.equal(source.timeEnabled, true);
assert.equal(source.historicalSource.date, "2023-01-01");
assert.ok(source.historicalSource.attribution.includes("DeepState"));
assert.ok(!source.metadata.some((m) => [193, 194].includes(m.id)));
applyScenarioSovereigntyOverrides(source.sovereigntyOverrides, {
	sourceGridRes: 0.1,
	targetGridRes: 0.1,
	deJureMap: decoded.deJure,
	landMask: decoded.land,
	countryMetadata: source.metadata,
});
const idx = (lat, lng) =>
	Math.floor((lat + 90) / 0.1) * 3600 + Math.floor((lng + 180) / 0.1);
for (const [name, lat, lng, owner] of [
	["Kyiv", 50.45, 30.52, 167],
	["Kherson", 46.64, 32.62, 167],
	["Bakhmut", 48.595, 37.995, 167],
	["Soledar", 48.69, 38.07, 167],
	["Lyman", 48.98, 37.81, 167],
	["Izium", 49.21, 37.26, 167],
	["Melitopol", 46.85, 35.37, 136],
	["Donetsk", 48, 37.8, 136],
	["Luhansk", 48.57, 39.31, 136],
	["Simferopol", 44.95, 34.1, 136],
]) {
	const index = idx(lat, lng);
	assert.equal(
		decoded.worldControl[index],
		owner,
		`${name}: historical control`,
	);
	assert.equal(decoded.deJure[index], 167, `${name}: Ukrainian sovereignty`);
}
assert.equal(decoded.worldControl[idx(55.75, 37.62)], 136, "Moscow unchanged");
assert.equal(
	decoded.deJure[idx(55.75, 37.62)],
	136,
	"Moscow sovereignty unchanged",
);
const sovereignCells = new Set(source.sovereigntyOverrides[0].cells);
for (const m of generated?.metadata ?? []) {
	if (m.id === 136)
		assert.ok(
			!m.savedCells.some(([x, y]) => sovereignCells.has(y * 3600 + x)),
			"Russian release territory excludes Ukraine",
		);
}
for (const city of generated?.cities ?? source.cities) {
	assert.ok(
		![193, 194].includes(city.ownerId),
		"No deleted faction references",
	);
	if (["Donetsk", "Luhansk"].includes(city.name))
		assert.equal(city.isCapital, false);
}
const base = heavy
	? JSON.parse(
			fs.readFileSync(
				new URL("../assets/maps/world map 2022.json", import.meta.url),
			),
		)
	: { mapData: [] };
const ids = new Set(source.theater.countryIds);
for (const [i, owner] of base.mapData) {
	if (!sovereignCells.has(i))
		assert.equal(
			decoded.worldControl[i],
			ids.has(owner) && isInsideScenarioTheater(source.theater, (Math.floor(i / 3600) + 0.5) * 0.1 - 90, (i % 3600 + 0.5) * 0.1 - 180) ? owner : 0,
			`Theater control at ${i} changed`,
		);
}
assert.ok(
	pointInRing(
		[
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2],
		],
		1,
		1,
	),
);
assert.ok(
	!pointInRing(
		[
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2],
		],
		3,
		1,
	),
);
assert.ok(
	source.historicalSource.occupiedCells > 1000 &&
		source.historicalSource.occupiedCells < 2000,
);
console.log(
	`ukraine scenario smoke: ${heavy ? "reproducible" : "committed (set MW_HEAVY_SMOKES=1 to rebuild)"} ${bytes.length} byte package, historical landmarks, independent sovereignty, retained Eurasian countries preserved`,
);

assert.equal(source.theater.id, "eurasia");
for (const name of ["United States of America", "Canada", "Brazil", "Egypt", "Australia"]) {
    assert.ok(!source.metadata.some(meta => meta.name === name), `${name} excluded from selectable actors`);
}
for (const [lat, lng] of [[38.9,-77.0],[30.0,31.2],[-33.8,151.2],[-1.3,36.8]]) {
    assert.equal(decoded.worldControl[idx(lat,lng)],0,"off-theater control absent");
    assert.equal(decoded.land[idx(lat,lng)],0,"off-theater land absent");
}
for (const city of source.cities) assert.ok(isInsideScenarioTheater(source.theater,city.lat,city.lng));
const prederivedLand=new Uint8Array(decoded.land.length).fill(1);
const prederivedDeJure=new Uint16Array(decoded.deJure.length).fill(169);
prederivedDeJure.set(decoded.deJure);
applyScenarioTheater(source.theater,{worldControlMap:decoded.worldControl,deJureMap:prederivedDeJure,landMask:prederivedLand,gridWidth:3600,gridRes:0.1});
assert.equal(prederivedLand[idx(38.9,-77.0)],0,"prederived Earth cannot restore the Americas");
assert.equal(prederivedLand[idx(50.45,30.52)],1,"Kyiv remains land");
console.log("Eurasia theater: excluded actors/land/cities and prederived-Earth masking passed");

assert.ok(source.cities.length > 400, "Eurasian cities remain available");
for (const name of ["Moscow", "Paris", "Oslo"]) assert.ok(source.cities.some(city => city.name === name), `${name} retained`);
for (const name of ["Cairo", "Cape Town", "Washington, D.C.", "Sydney"]) assert.ok(!source.cities.some(city => city.name === name), `${name} excluded`);
for (const name of ["France", "Norway", "Kosovo"]) assert.ok(source.metadata.some(meta => meta.name === name), `${name} retained despite source ISO aliases`);
assert.throws(() => normalizeScenarioTheater({...source.theater, bounds: [20, 20, 10, 10]}), /Invalid scenario theater/);
const originalPath = globalThis.Path2D;
globalThis.Path2D = class { rects = []; rect(...args) { this.rects.push(args); } };
try {
    const layer = {};
    const frameAt = (lat,lng) => {
        const x = Math.floor((lng+180)/0.1), y = Math.floor((lat+90)/0.1);
        return { theater: source.theater, viewportKey: `${lat}:${lng}`, landMask: decoded.land, gridWidth: 3600, gridHeight: 1800, xMin: x-1, xMax: x+1, yMin: y-1, yMax: y+1, getGridPoint: (x,y) => ({x,y}) };
    };
    assert.equal(getScenarioTheaterClip(layer, frameAt(30,31.2)).rects.length, 0, "Cairo cannot be repainted by worldwide coastlines");
    const moscow = frameAt(55.75,37.62);
    const path = getScenarioTheaterClip(layer, moscow);
    assert.ok(path.rects.length > 0, "Moscow remains visible");
    assert.equal(getScenarioTheaterClip(layer, moscow), path, "Same viewport reuses the land clip");
    assert.notEqual(getScenarioTheaterClip(layer, {...moscow, theater: {...source.theater}}), path, "A changed theater rebuilds its clip");
    assert.equal(getScenarioTheaterClip(layer, {...moscow, theater: null}), null, "World scenarios have no theater clip");
} finally { globalThis.Path2D = originalPath; }
console.log("Eurasia theater: capital cities, ISO aliases and render clipping passed");
