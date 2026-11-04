import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { encodeScenario } from "../src/scenario-codec.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = path.join(
	root,
	"assets/scenarios/modern-2026/countries.geojson.gz",
);
const release = "2026-10-21.0";
const sourceURL = `s3://overturemaps-us-west-2/release/${release}/theme=divisions/type=division_area/*`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const politicalAliases = Object.freeze({
	CP: "FR",
	XE: "BQ",
	XS: "BQ",
	XJ: "SJ",
	XG: "PS",
	XW: "PS",
	XH: "SY",
});
const politicalCode = (code) => politicalAliases[code] || code;
const neutralFlag =
	"data:image/svg+xml;charset=utf-8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><path fill="#6b7280" d="M0 0h60v40H0z"/><path fill="none" stroke="#d1d5db" stroke-width="2" d="M1 1h58v38H1z"/></svg>',
	);

/** Retain pinned land-only country geometry and source record provenance for offline builds. */
export function prepareModern2026Source(inputPath) {
	const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
	assert.ok(
		rows.every((row) => /^[A-Z]{2}$/.test(row.country)),
		"Each source feature needs an explicit ISO country code",
	);
	const source = {
		type: "FeatureCollection",
		release,
		source: sourceURL,
		license: "ODbL-1.0",
		simplificationDegrees: 0.015,
		features: rows
			.map((row) => {
				const names =
					typeof row.names === "string" ? JSON.parse(row.names) : row.names;
				const sources =
					typeof row.sources === "string"
						? JSON.parse(row.sources)
						: row.sources;
				return {
					type: "Feature",
					properties: {
						id: row.id,
						divisionId: row.division_id,
						country: row.country,
						subtype: row.subtype,
						name: names.common?.en || names.primary,
						names: {
							en: names.common?.en || names.primary,
							uk: names.common?.uk,
							ru: names.common?.ru,
						},
						sources,
					},
					geometry:
						typeof row.geometry === "string"
							? JSON.parse(row.geometry)
							: row.geometry,
				};
			})
			.sort(
				(a, b) =>
					a.properties.country.localeCompare(b.properties.country) ||
					a.properties.id.localeCompare(b.properties.id),
			),
	};
	assert.equal(
		source.features.length,
		272,
		"Review changed source coverage before updating the pinned release",
	);
	const json = JSON.stringify(source, (_key, value) =>
		typeof value === "number" ? Math.round(value * 100000) / 100000 : value,
	);
	fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
	const bytes = gzipSync(json, { level: 9 });
	fs.writeFileSync(sourcePath, bytes);
	console.log(
		JSON.stringify({
			source: path.relative(root, sourcePath),
			features: source.features.length,
			bytes: bytes.length,
			sha256: digest(bytes),
		}),
	);
}

function polygons(geometry) {
	return geometry.type === "Polygon"
		? [geometry.coordinates]
		: geometry.coordinates;
}
function intersections(ring, lat) {
	const xs = [];
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [x, y] = ring[i],
			[px, py] = ring[j];
		if (y > lat !== py > lat) xs.push(x + ((lat - y) * (px - x)) / (py - y));
	}
	return xs.sort((a, b) => a - b);
}
/** Rasterize the polygon's even-odd fill at geographic cell centers, respecting holes. */
export function rasterizePoliticalPolygon(
	control,
	polygon,
	owner,
	{ res = 0.1, width = 3600, height = 1800, existingLandOnly = false } = {},
) {
	let south = 90,
		north = -90;
	for (const ring of polygon)
		for (const [, lat] of ring) {
			south = Math.min(south, lat);
			north = Math.max(north, lat);
		}
	const fromY = Math.max(0, Math.ceil((south + 90) / res - 0.5));
	const toY = Math.min(height - 1, Math.floor((north + 90) / res - 0.5));
	for (let y = fromY; y <= toY; y++) {
		const lat = (y + 0.5) * res - 90;
		const xs = polygon
			.flatMap((ring) => intersections(ring, lat))
			.sort((a, b) => a - b);
		for (let i = 0; i + 1 < xs.length; i += 2) {
			const start = Math.max(0, Math.ceil((xs[i] + 180) / res - 0.5));
			const end = Math.min(width, Math.ceil((xs[i + 1] + 180) / res - 0.5));
			for (let x = start; x < end; x++)
				if (!existingLandOnly || control[y * width + x])
					control[y * width + x] = owner;
		}
	}
}

/** Build a political baseline from the 2026 Overture release, not from the 2022 control map. */
export function buildModern2026Scenario() {
	const sourceBytes = fs.readFileSync(sourcePath);
	const source = JSON.parse(gunzipSync(sourceBytes));
	assert.equal(source.release, release);
	const base = JSON.parse(
		fs.readFileSync(path.join(root, "assets/maps/world map 2022.json"), "utf8"),
	);
	const flags = JSON.parse(
		fs.readFileSync(path.join(root, "assets/geodata/flagcodes.json"), "utf8"),
	);
	const legacyByCode = new Map();
	for (const meta of base.metadata.filter((meta) => meta.id <= 177)) {
		const code = meta.flagUrl
			?.match(/flagcdn\.com\/[^/]+\/([a-z]{2})\.png$/)?.[1]
			?.toUpperCase();
		if (code) legacyByCode.set(code, meta);
	}
	legacyByCode.set(
		"AF",
		base.metadata.find((meta) => meta.id === 1),
	);
	legacyByCode.set(
		"SY",
		base.metadata.find((meta) => meta.id === 154),
	);
	legacyByCode.set(
		"XK",
		base.metadata.find((meta) => meta.id === 89),
	);
	const metadata = [];
	const idByCode = new Map();
	let nextId = 204;
	for (const code of [
		...new Set(
			source.features.map((feature) =>
				politicalCode(feature.properties.country),
			),
		),
	].sort()) {
		const feature = source.features.find(
			(feature) => politicalCode(feature.properties.country) === code,
		);
		const legacy = legacyByCode.get(code);
		const id = legacy?.id || nextId++;
		idByCode.set(code, id);
		metadata.push({
			id,
			name:
				legacy?.name || flags[code.toLowerCase()] || feature.properties.name,
			color:
				legacy?.color ||
				`rgba(${80 + ((id * 37) % 150)}, ${80 + ((id * 67) % 150)}, ${80 + ((id * 97) % 150)}, 0.5)`,
			isCustom: false,
			flagUrl: flags[code.toLowerCase()]
				? `https://flagcdn.com/w320/${code.toLowerCase()}.png`
				: neutralFlag,
			role: "OFFENSE",
			overlordId: null,
			releasableBy: null,
			savedCells: null,
			iso2: code,
			sourceCodes: source.features
				.filter((feature) => politicalCode(feature.properties.country) === code)
				.map((feature) => feature.properties.country),
			isDisputed: !flags[code.toLowerCase()],
			pop: legacy?.pop || 1000000,
			gdp: legacy?.gdp || 10,
		});
	}
	metadata.sort((a, b) => a.id - b.id);
	assert.equal(
		new Set(metadata.map((meta) => meta.id)).size,
		metadata.length,
		"Country identifiers must be unique",
	);
	const width = 3600,
		height = 1800,
		res = 0.1;
	const control = new Uint16Array(width * height);
	const ordered = [...source.features].sort(
		(a, b) =>
			Number(a.properties.subtype === "dependency") -
				Number(b.properties.subtype === "dependency") ||
			a.properties.country.localeCompare(b.properties.country) ||
			a.properties.id.localeCompare(b.properties.id),
	);
	for (const feature of ordered)
		for (const polygon of polygons(feature.geometry))
			rasterizePoliticalPolygon(
				control,
				polygon,
				idByCode.get(politicalCode(feature.properties.country)),
			);
	// This political scenario uses Ukraine's sovereign boundary, not a current front line.
	const ukraineId = idByCode.get("UA");
	assert.equal(ukraineId, 167);
	const admin = JSON.parse(
		gunzipSync(
			fs.readFileSync(path.join(root, "assets/geodata/admin1/regions.json.gz")),
		),
	);
	const ukrainianRegions = admin.regions.filter(
		(region) => region.country === "UKR",
	);
	assert.equal(ukrainianRegions.length, 27);
	for (const region of ukrainianRegions)
		for (const ring of region.rings) {
			const points = [];
			for (let i = 0; i < ring.length; i += 2)
				points.push([ring[i], ring[i + 1]]);
			rasterizePoliticalPolygon(control, [points], ukraineId, {
				existingLandOnly: true,
			});
		}
	const mapData = [];
	for (let i = 0; i < control.length; i++)
		if (control[i]) mapData.push([i, control[i], 0]);
	const ownerAt = (lat, lng) => {
		const x = Math.floor((lng + 180) / res),
			y = Math.floor((lat + 90) / res);
		if (x < 0 || x >= width || y < 0 || y >= height) return 0;
		return control[y * width + x];
	};
	const cities = base.cities
		.map((city) => ({ ...city, ownerId: ownerAt(city.lat, city.lng) }))
		.filter((city) => city.ownerId);
	for (const city of cities)
		if (city.ownerId === 167 && /^(Kiev|Kyiv)$/i.test(city.name))
			city.name = "Kyiv";
	const scenario = {
		name: "Modern World 2026 (political)",
		metadata,
		mapData,
		cities,
		mapRes: "50m",
		gridRes: res,
		timeEnabled: true,
		startDate: { year: 2026, month: 10, day: 21 },
		worldWidthDeg: 360,
		worldHeightDeg: 180,
		useScenarioLand: true,
		sovereigntyBase: "control",
		historicalSource: {
			attribution: "© OpenStreetMap contributors · Overture Maps",
			provider: "Overture Maps",
			release,
			kind: "political-boundaries",
			date: "2026-10-21",
			url: "https://docs.overturemaps.org/guides/divisions/",
			license: "https://opendatacommons.org/licenses/odbl/1-0/",
			politicalAliases,
			disputedSourceCodes: metadata
				.filter((meta) => meta.isDisputed)
				.map((meta) => meta.iso2),
			sourceSHA256: digest(sourceBytes),
			method:
				"Land-only country and dependency boundaries from the 2026-10-21.0 release, simplified at 0.015 degrees and sampled on the 0.1-degree game grid. Ukrainian sovereign territory is normalized with the bundled 27-region reference layer.",
			limitations:
				"Not a military-control map. No current frontlines, alliances or armed factions are asserted. Existing city positions and population/GDP inputs are inherited game-balance data, not 2026 statistics; new entities use fictional defaults. Tiny islands and states can disappear at grid resolution. Administrative-region labels use a separate pinned Natural Earth reference layer.",
		},
	};
	assert.ok(mapData.length > 1500000 && mapData.length < 3500000);
	for (const [lat, lng, code] of [
		[50.45, 30.52, "UA"],
		[44.95, 34.1, "UA"],
		[48.02, 37.8, "UA"],
		[55.75, 37.62, "RU"],
		[38.9, -77.04, "US"],
		[51.5, -0.12, "GB"],
		[35.68, 139.69, "JP"],
		[39.9, 116.4, "CN"],
	])
		assert.equal(
			ownerAt(lat, lng),
			idByCode.get(code),
			`Political landmark ${code} ${lat},${lng}`,
		);
	assert.ok(
		metadata.every((meta) => meta.id < 178 || meta.id >= 204),
		"Historical factions must not leak into 2026 metadata",
	);
	return scenario;
}

export function writeModern2026Scenario({ check = false } = {}) {
	const scenario = buildModern2026Scenario();
	const encoded = encodeScenario(scenario);
	const compressed = gzipSync(encoded, { level: 9 });
	const output = path.join(
		root,
		"assets/maps/compiled/world-map-2026-v3.mwsc.gz",
	);
	if (check)
		assert.deepEqual(
			fs.readFileSync(output),
			compressed,
			"Modern 2026 package is not reproducible",
		);
	else fs.writeFileSync(output, compressed);
	const result = {
		output: path.relative(root, output),
		countries: scenario.metadata.length,
		cities: scenario.cities.length,
		cells: scenario.mapData.length,
		bytes: compressed.length,
		contentRevision: digest(compressed).slice(0, 16),
		sourceSHA256: scenario.historicalSource.sourceSHA256,
	};
	console.log(JSON.stringify(result));
	return result;
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const prepare = process.argv.indexOf("--prepare-source");
	if (prepare >= 0) prepareModern2026Source(process.argv[prepare + 1]);
	else writeModern2026Scenario({ check: process.argv.includes("--check") });
}
