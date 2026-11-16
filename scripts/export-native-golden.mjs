#!/usr/bin/env node
// Save "golden" answers from the JavaScript game for the native rewrite.
// The Rust simulation in native/sim must read the same scenario packages and
// produce the same results; native/sim/tests/golden.rs compares against these
// files. Only exact, pure data goes here (decoded maps, countries, starting
// personnel), never behavior that the rewrite is meant to improve.
//
//   node scripts/export-native-golden.mjs           write native/fixtures/golden/
//   node scripts/export-native-golden.mjs --check   fail if the files are stale
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { getCountryForceProfile } from "../src/country-force-profiles.js";
import { localizeFlagUrl } from "../src/flags.js";
import { decodeScenarioBinary } from "../src/scenario-codec.js";
import { applyScenarioSovereigntyOverrides } from "../src/scenario-territory.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputDir = `${root}native/fixtures/golden/`;
const SCENARIOS = ["world-map-2026-v3", "ukraine-2023-v3"];
const SAMPLE_COUNT = 4096;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const typedBytes = (array) =>
	new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const countValues = (array) => {
	const counts = new Map();
	for (const value of array)
		if (value) counts.set(value, (counts.get(value) || 0) + 1);
	return Object.fromEntries([...counts].sort((a, b) => a[0] - b[0]));
};

/** Header fields exactly as stored, so the Rust parser can check each one. */
function readHeader(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		magic: new TextDecoder().decode(bytes.subarray(0, 4)),
		version: view.getUint8(4),
		headerBytes: view.getUint16(6, true),
		metadataBytes: view.getUint32(8, true),
		entryCount: view.getUint32(12, true),
		payloadBytes: view.getUint32(16, true),
		savedBytes: view.getUint32(20, true),
		blobBytes: view.getUint32(24, true),
		blobCount: view.getUint32(28, true),
	};
}

/** Count map runs by walking the payload the same way the decoder does. */
function countRuns(bytes, header) {
	let offset = header.headerBytes + header.metadataBytes;
	const end = offset + header.payloadBytes;
	let runs = 0;
	const skipVarint = () => {
		while (bytes[offset++] & 0x80);
	};
	while (offset < end) {
		for (let field = 0; field < 4; field++) skipVarint();
		runs++;
	}
	return runs;
}

/** Repeatable cell picks: half land cells, half anywhere (mostly water). */
function sampleIndices(land, count) {
	let state = 0x5eed1234;
	const next = () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
	const landCells = [];
	for (let index = 0; index < land.length; index++)
		if (land[index]) landCells.push(index);
	const picks = new Set();
	while (picks.size < count / 2)
		picks.add(landCells[next() % landCells.length]);
	while (picks.size < count) picks.add(next() % land.length);
	return [...picks].sort((a, b) => a - b);
}

function flagInfo(url) {
	if (typeof url !== "string" || !url) return null;
	const local = localizeFlagUrl(url);
	return {
		kind: url.startsWith("data:") ? "data-url" : "url",
		sha256: sha256(new TextEncoder().encode(url)),
		bundledPath: local !== url ? local : null,
	};
}

function exportScenario(name) {
	const file = `assets/maps/compiled/${name}.mwsc.gz`;
	const compressed = readFileSync(`${root}${file}`);
	const bytes = gunzipSync(compressed);
	const header = readHeader(bytes);
	const decoded = decodeScenarioBinary(bytes);
	const { scenario, source } = decoded;
	const metadata = scenario.metadata || [];

	// Same call the game makes after loading (src/scenario-loader.js).
	const deJure = decoded.deJure.slice();
	const sovereigntyWrites = applyScenarioSovereigntyOverrides(
		scenario.sovereigntyOverrides,
		{
			sourceGridRes: source.gridRes,
			targetGridRes: source.gridRes,
			deJureMap: deJure,
			landMask: decoded.land,
			countryMetadata: metadata,
			sovereigntyBase: scenario.sovereigntyBase,
			worldControlMap: decoded.worldControl,
		},
	);

	const occupation = new Map();
	for (let index = 0; index < deJure.length; index++) {
		const controller = decoded.worldControl[index];
		const sovereign = deJure[index];
		if (controller === sovereign) continue;
		const key = `${controller}>${sovereign}`;
		occupation.set(key, (occupation.get(key) || 0) + 1);
	}

	const startDate = scenario.startDate
		? `${scenario.startDate.year}-${String(scenario.startDate.month).padStart(2, "0")}-${String(scenario.startDate.day).padStart(2, "0")}`
		: null;
	const countries = metadata.map((meta, metadataIndex) => {
		if (!meta) return null;
		const personnel = getCountryForceProfile(meta, startDate).personnel;
		return {
			metadataIndex,
			id: meta.id,
			name: meta.name,
			iso2: meta.iso2 ?? null,
			role: meta.role ?? null,
			color: meta.color ?? null,
			pop: meta.pop ?? null,
			gdp: meta.gdp ?? null,
			isDisputed: meta.isDisputed ?? null,
			releasableBy: meta.releasableBy ?? null,
			flag: flagInfo(meta.flagUrl),
			savedCells: meta.savedCellRuns
				? {
						width: meta.savedCellWidth,
						runs: meta.savedCellRuns.length / 2,
						cells: meta.savedCellRuns.reduce(
							(sum, value, index) => (index % 2 ? sum + value : sum),
							0,
						),
						first: meta.savedCellRuns.slice(0, 2),
					}
				: null,
			startingPersonnel: personnel
				? { value: personnel.value, asOf: personnel.asOf }
				: null,
		};
	});

	const cities = scenario.cities || [];
	const pick = (city) =>
		city && {
			id: city.id,
			name: city.name,
			lat: city.lat,
			lng: city.lng,
			ownerId: city.ownerId,
			isCapital: city.isCapital,
			pop: city.pop,
		};
	const samples = sampleIndices(decoded.land, SAMPLE_COUNT).map((index) => [
		index,
		decoded.worldControl[index],
		deJure[index],
		decoded.land[index],
		decoded.biome[index],
		decoded.province[index],
	]);

	return {
		format: "mw-native-golden",
		revision: 1,
		generator: "scripts/export-native-golden.mjs",
		note: "Exact answers from the JavaScript game. Do not edit by hand; regenerate with the generator.",
		file,
		sha256Gzip: sha256(compressed),
		sha256Raw: sha256(bytes),
		rawBytes: bytes.length,
		header,
		runs: countRuns(bytes, header),
		scenario: {
			name: scenario.name,
			mapRes: scenario.mapRes ?? null,
			gridRes: scenario.gridRes,
			worldWidthDeg: scenario.worldWidthDeg ?? 360,
			worldHeightDeg: scenario.worldHeightDeg ?? 180,
			startDate,
			sovereigntyBase: scenario.sovereigntyBase ?? null,
			useScenarioLand: scenario.useScenarioLand ?? null,
			theater: scenario.theater ?? null,
			attribution: scenario.historicalSource?.attribution ?? null,
		},
		grid: {
			width: source.width,
			height: source.height,
			length: source.length,
		},
		layers: {
			worldControl: {
				type: "u16le",
				sha256: sha256(typedBytes(decoded.worldControl)),
			},
			deJure: { type: "u16le", sha256: sha256(typedBytes(deJure)) },
			land: { type: "u8", sha256: sha256(typedBytes(decoded.land)) },
			biome: { type: "u8", sha256: sha256(typedBytes(decoded.biome)) },
			province: {
				type: "i32le",
				sha256: sha256(typedBytes(decoded.province)),
				distinct: new Set(decoded.province).size,
				note: "Legacy noise 'provinces' hashed from sin/cos (scenario-codec.js getProvinceId). The rewrite may replace them.",
			},
		},
		landCells: decoded.land.reduce((sum, value) => sum + value, 0),
		controlCells: countValues(decoded.worldControl),
		deJureCells: countValues(deJure),
		biomeCells: countValues(decoded.biome),
		sovereignty: {
			overrides: (scenario.sovereigntyOverrides || []).map((override) => ({
				ownerId: override.ownerId,
				cells: override.cells.length,
			})),
			writes: sovereigntyWrites,
			occupation: Object.fromEntries(
				[...occupation].sort((a, b) => b[1] - a[1]),
			),
		},
		countries,
		cities: {
			count: cities.length,
			capitals: cities.filter((city) => city.isCapital).length,
			totalPop: cities.reduce((sum, city) => sum + (city.pop || 0), 0),
			first: pick(cities[0]),
			last: pick(cities.at(-1)),
			largest: pick(
				cities.reduce((best, city) => (city.pop > best.pop ? city : best)),
			),
		},
		flagBlobs: header.blobCount,
		sampleColumns: ["index", "control", "deJure", "land", "biome", "province"],
		samples,
	};
}

const check = process.argv.includes("--check");
let stale = 0;
mkdirSync(outputDir, { recursive: true });
for (const name of SCENARIOS) {
	const path = `${outputDir}${name}.json`;
	// Readable JSON, but number arrays (the samples) stay on one line each.
	const text = `${JSON.stringify(exportScenario(name), null, "\t").replace(
		/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g,
		(_, inner) => `[${inner.replace(/\s+/g, "")}]`,
	)}\n`;
	if (check) {
		let current = "";
		try {
			current = readFileSync(path, "utf8");
		} catch {}
		if (current !== text) {
			stale++;
			console.error(`stale: native/fixtures/golden/${name}.json`);
		}
		continue;
	}
	writeFileSync(path, text);
	console.log(
		`wrote native/fixtures/golden/${name}.json (${(text.length / 1024).toFixed(0)} KB)`,
	);
}
if (stale) {
	console.error("Run node scripts/export-native-golden.mjs to refresh them.");
	process.exit(1);
}
if (check) console.log("native golden files are up to date");
