import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { encodeScenario } from "../src/scenario-codec.js";
import { isInsideScenarioTheater } from "../src/scenario-theater.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = path.join(root, "assets/scenarios/ukraine-2023");
const UKRAINE = 167;
const RUSSIA = 136;

export function pointInRing(ring, x, y) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i],
			[xj, yj] = ring[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
			inside = !inside;
	}
	return inside;
}
function inPolygon(rings, x, y) {
	return (
		pointInRing(rings[0], x, y) &&
		!rings.slice(1).some((r) => pointInRing(r, x, y))
	);
}
function polygons(feature) {
	return feature.geometry.type === "Polygon"
		? [feature.geometry.coordinates]
		: feature.geometry.coordinates;
}

/** Convert only the displayed SVG contours; no remote endpoints or hidden map state. */
export function visualContours(capture) {
	assert.equal(capture.date, "2023-01-01");
	const [zoom, lat, lng] = new URL(capture.url).hash
		.slice(1)
		.split("/")
		.map(Number);
	assert.ok([zoom, lat, lng].every(Number.isFinite));
	const scale = 256 * 2 ** zoom,
		sine = Math.sin((lat * Math.PI) / 180);
	const cx = ((lng + 180) / 360) * scale,
		cy = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
	const rect = capture.mapRect;
	const convert = (x, y, m) => {
		const sx = m[0] * x + m[2] * y + m[4],
			sy = m[1] * x + m[3] * y + m[5];
		const px = cx + sx - rect.x - rect.width / 2,
			py = cy + sy - rect.y - rect.height / 2;
		return [
			(px / scale) * 360 - 180,
			(Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / scale))) * 180) / Math.PI,
		];
	};
	return capture.paths.map((p) => {
		// Leaflet renders these historical polygons as absolute M/L commands with even-odd fill.
		assert.ok(/^[MLzZ0-9.,\s-]+$/.test(p.d), "Unsupported SVG path commands");
		const rings = p.d
			.split(/[zZ]/)
			.filter((s) => s.trim())
			.map((s) => {
				const numbers = s.match(/-?\d+(?:\.\d+)?/g).map(Number);
				assert.equal(numbers.length % 2, 0);
				const points = [];
				for (let i = 0; i < numbers.length; i += 2)
					points.push(convert(numbers[i], numbers[i + 1], p.matrix));
				return points;
			})
			.filter((r) => r.length >= 3);
		return { fill: p.fill, rings };
	});
}

export function buildUkraine2023Scenario() {
	const base = JSON.parse(
		fs.readFileSync(path.join(root, "assets/maps/world map 2022.json"), "utf8"),
	);
	const capture = JSON.parse(
		fs.readFileSync(path.join(sourceDir, "deepstate-visual.json"), "utf8"),
	);
	const contours = visualContours(capture);
	const occupied = contours.filter(
		(p) => p.fill === "#a52714" || p.fill === "#880e4f",
	);
	const disputed = contours.filter((p) => p.fill === "#bcaaa4");
	const insidePaths = (paths, x, y) =>
		paths.some((p) =>
			p.rings.reduce((inside, r) => inside !== pointInRing(r, x, y), false),
		);
	const geography = JSON.parse(
		fs.readFileSync(
			path.join(
				root,
				"assets/geodata/110m/cultural/ne_110m_admin_0_countries.json",
			),
			"utf8",
		),
	);
	const ukraine = polygons(
		geography.features.find((f) => f.properties.ADMIN === "Ukraine"),
	);
	// The bundled Natural Earth dataset assigns Crimea to Russia. Restore Ukraine's
	// sovereign boundary using its separate peninsula polygon, selected by Simferopol.
	const crimea = polygons(
		geography.features.find((f) => f.properties.ADMIN === "Russia"),
	).find((p) => inPolygon(p, 34.1, 44.95));
	assert.ok(
		crimea && crimea[0].every(([x, y]) => x > 32 && x < 37 && y > 44 && y < 47),
		"Crimea polygon must be a separate peninsula",
	);
	const sovereignPolygons = [...ukraine, crimea];
	const width = Math.ceil(360 / base.gridRes),
		sovereignCells = [],
		sovereignSet = new Set(),
		disputedSet = new Set();
	let occupiedCount = 0,
		disputedCount = 0;
	for (const entry of base.mapData) {
		const [idx, owner] = entry;
		const x = idx % width,
			y = Math.floor(idx / width);
		const lng = x * base.gridRes - 180 + base.gridRes / 2,
			lat = y * base.gridRes - 90 + base.gridRes / 2;
		const isUkraine =
			[167, 193, 194].includes(owner) ||
			(owner === RUSSIA &&
				lng > 22 &&
				lng < 41 &&
				lat > 44 &&
				lat < 53 &&
				sovereignPolygons.some((p) => inPolygon(p, lng, lat)));
		if (!isUkraine) continue;
		sovereignCells.push(idx);
		sovereignSet.add(idx);
		const contested = insidePaths(disputed, lng, lat);
		// The engine has no neutral disputed-territory faction: grey areas remain
		// with Ukraine in this approximation, rather than claiming Russian control.
		entry[1] = !contested && insidePaths(occupied, lng, lat) ? RUSSIA : UKRAINE;
		if (entry[1] === RUSSIA) occupiedCount++;
		if (contested) {
			disputedCount++;
			disputedSet.add(idx);
		}
	}
	// SVG and Natural Earth boundaries do not coincide exactly. Remove tiny
	// disconnected Ukrainian slivers inside the occupied theater, but retain
	// explicitly disputed cells. This is a documented coarse-grid correction.
	const entries = new Map(
		base.mapData.filter(([i]) => sovereignSet.has(i)).map((e) => [e[0], e]),
	);
	const seen = new Set();
	let correctedCells = 0;
	for (const i of sovereignCells) {
		if (seen.has(i) || entries.get(i)[1] !== UKRAINE) continue;
		const component = [i];
		seen.add(i);
		let touchesRussia = false;
		for (let j = 0; j < component.length; j++) {
			for (const n of [
				component[j] - 1,
				component[j] + 1,
				component[j] - width,
				component[j] + width,
			]) {
				const e = entries.get(n);
				if (e?.[1] === RUSSIA) touchesRussia = true;
				if (e?.[1] === UKRAINE && !seen.has(n)) {
					seen.add(n);
					component.push(n);
				}
			}
		}
		if (
			component.length <= 8 &&
			touchesRussia &&
			!component.some((i) => disputedSet.has(i))
		) {
			for (const i of component) entries.get(i)[1] = RUSSIA;
			correctedCells += component.length;
			occupiedCount += component.length;
		}
	}
	const control = new Map(base.mapData.map(([idx, owner]) => [idx, owner]));
	base.metadata = base.metadata.filter((m) => m && ![193, 194].includes(m.id));
	for (const m of base.metadata) {
		if (m.savedCells)
			m.savedCells = m.savedCells.filter(
				([x, y]) => !sovereignSet.has(y * width + x),
			);
		if (m.id === UKRAINE) {
			m.savedCells = sovereignCells.map((i) => [
				i % width,
				Math.floor(i / width),
			]);
			m.color = "rgba(42, 110, 198, 0.5)";
		}
		if (m.id === RUSSIA) m.color = "rgba(170, 58, 58, 0.5)";
		if ([193, 194].includes(m.overlordId)) m.overlordId = null;
		if (Array.isArray(m.allies))
			m.allies = m.allies.filter((id) => ![193, 194].includes(id));
	}
	for (const c of base.cities) {
		const idx =
			Math.floor((c.lat + 90) / base.gridRes) * width +
			Math.floor((c.lng + 180) / base.gridRes);
		if (sovereignSet.has(idx) || [193, 194].includes(c.ownerId)) {
			c.ownerId = control.get(idx) || UKRAINE;
			c.isCapital = /^(Kyiv|Kiev)$/i.test(c.name);
		}
	}
	// Keep European and Asian actors, plus their existing regional releasables.
	// Global cell indices remain unchanged; only theater land and actors are packaged.
	const countryCodes = new Set((
		"ALB AND AUT BEL BGR BIH BLR CHE CYP CZE DEU DNK ESP EST FIN FRA GBR GRC HRV HUN IRL ISL ITA KOS LIE LTU LUX LVA MCO MDA MKD MLT MNE NLD NOR POL PRT ROU RUS SMR SRB SVK SVN SWE UKR VAT " +
		"AFG ARE ARM AZE BGD BHR BRN BTN CHN GEO IDN IND IRN IRQ ISR JOR JPN KAZ KGZ KHM KOR KWT LAO LBN LKA MDV MMR MNG MYS NPL OMN PAK PHL PRK PSE QAT SAU SGP SYR THA TJK TKM TLS TUR TWN UZB VNM YEM"
	).split(" "));
	const codeOverrides = { France: "FRA", Norway: "NOR", Kosovo: "KOS", "Northern Cyprus": "CYP" };
	const countryIds = new Set(geography.features.flatMap((feature, index) =>
		countryCodes.has(codeOverrides[feature.properties.ADMIN] || feature.properties.ISO_A3) ? [index + 1] : [],
	));
	for (const id of [178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,195,196,201,202,203]) countryIds.add(id);
	const theater = { id: "eurasia", bounds: [-25, -12, 180, 85], countryIds: [...countryIds].sort((a,b)=>a-b), countryCodes: [...countryCodes].sort() };
	const inTheaterCell = (index) => isInsideScenarioTheater(theater,
		(Math.floor(index / width) + 0.5) * base.gridRes - 90,
		(index % width + 0.5) * base.gridRes - 180,
	);
	base.mapData = base.mapData.filter(([index, owner]) => countryIds.has(owner) && inTheaterCell(index));
	base.metadata = base.metadata.filter(meta => countryIds.has(meta.id));
	const retainedIds = new Set(base.metadata.map(meta => meta.id));
	theater.countryIds = [...retainedIds].sort((a,b)=>a-b);
	for (const meta of base.metadata) {
		if (meta.savedCells) meta.savedCells = meta.savedCells.filter(([x,y]) => inTheaterCell(y * width + x));
		if (meta.allies) meta.allies = meta.allies.filter(id => retainedIds.has(id));
		if (!retainedIds.has(meta.overlordId)) meta.overlordId = null;
		if (!retainedIds.has(meta.releasableBy)) meta.releasableBy = null;
	}
	base.cities = base.cities.filter(city => {
		if (!isInsideScenarioTheater(theater, city.lat, city.lng)) return false;
		const x = Math.floor((city.lng + 180) / base.gridRes), y = Math.floor((city.lat + 90) / base.gridRes);
		let owner = city.ownerId || control.get(y * width + x);
		if (!owner) {
			for (let dy = -1; dy <= 1 && !owner; dy++) for (let dx = -1; dx <= 1 && !owner; dx++) {
				if (x+dx >= 0 && x+dx < width) owner = control.get((y+dy) * width + x+dx);
			}
		}
		if (!retainedIds.has(owner)) return false;
		city.ownerId = owner;
		return true;
	});
	return {
		...base,
		theater,
		name: "Ukraine 2023 · Eurasia (experimental)",
		timeEnabled: true,
		startDate: { year: 2023, month: 1, day: 1 },
		worldWidthDeg: 360,
		worldHeightDeg: 180,
		sovereigntyOverrides: [{ ownerId: UKRAINE, cells: sovereignCells }],
		historicalSource: {
			territoryOwnerIds: [UKRAINE],
			attribution: "DeepStateMap.live",
			url: capture.source,
			license: capture.license,
			date: capture.date,
			visualReference: "assets/scenarios/ukraine-2023/deepstate-2023-01-01.png",
			method:
				"Approximation of displayed historical SVG contours on a 0.1 degree game grid; not an official data export.",
			limitations:
				"Grey zones assigned to Ukraine. Armies and strength are fictional game estimates. Other Eurasian countries retain the base 2022 setup. The theater excludes land outside 25W–180E and 12S–85N, including Russia east of the antimeridian.",
			sovereignCells: sovereignCells.length,
			occupiedCells: occupiedCount,
			disputedCells: disputedCount,
			boundarySliverCorrections: correctedCells,
		},
	};
}

export function writeUkraine2023Scenario() {
	const scenario = buildUkraine2023Scenario();
	const compressed = gzipSync(encodeScenario(scenario), { level: 9 });
	const output = path.join(
		root,
		"assets/maps/compiled/ukraine-2023-v3.mwsc.gz",
	);
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, compressed);
	const revision = createHash("sha256")
		.update(compressed)
		.digest("hex")
		.slice(0, 16);
	console.log(
		JSON.stringify(
			{
				output,
				bytes: compressed.length,
				revision,
				...scenario.historicalSource,
			},
			null,
			2,
		),
	);
	return revision;
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
	writeUkraine2023Scenario();
