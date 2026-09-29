import { readFileSync, writeFileSync } from "node:fs";

// A decorative vector map built from bundled Natural Earth geometry. No game runtime.
const root = new URL("../", import.meta.url);
const geo = JSON.parse(readFileSync(new URL("assets/geodata/50m/cultural/ne_50m_admin_0_countries.json", root)));
const scenario = JSON.parse(readFileSync(new URL("assets/maps/world map 2022.json", root)));
const colors = new Map(scenario.metadata.map((country) => [country.name, country.color]));
const project = ([lon, lat]) => [(lon + 60) * 24, (75 - lat) * 35];
const point = (coordinates) => project(coordinates).map((n) => n.toFixed(1)).join(",");
const paths = [];
for (const feature of geo.features) {
	const geometry = feature.geometry;
	if (!geometry) continue;
	const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
	const visible = polygons.filter((polygon) => polygon[0].some(([lon, lat]) => lon >= -60 && lon <= 55 && lat >= 23 && lat <= 75));
	if (!visible.length) continue;
	const name = feature.properties.ADMIN || feature.properties.NAME;
	const color = (colors.get(name) || "#627c88").replace(/[\d.]+\)$/, "1)");
	const d = visible.map((polygon) => polygon.map((ring) => `M${ring.map(point).join("L")}Z`).join("")).join("");
	paths.push(`<path d="${d}" fill="${color}"/>`);
}
const labels = [
	["FRANCE", 2, 46.8], ["GERMANY", 10.4, 51.2], ["POLAND", 19.5, 52.2],
	["SPAIN", -3.5, 39.6], ["ITALY", 12.5, 42.6], ["SWEDEN", 15, 63],
	["UKRAINE", 31.5, 49], ["TURKEY", 34.7, 39], ["ROMANIA", 25, 45.7],
];
const capitals = [[2.35, 48.86], [13.4, 52.52], [21.01, 52.23], [30.52, 50.45]];
const graticule = [];
for (let lon = -60; lon <= 55; lon += 10) {
	const [x] = project([lon, 0]);
	graticule.push(`<path d="M${x} 0V1800"/>`);
}
for (let lat = 25; lat <= 75; lat += 10) {
	const [, y] = project([0, lat]);
	graticule.push(`<path d="M0 ${y}H2760"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2760 1800" width="2760" height="1800">
<title>Modern Wars title map</title>
<desc>Decorative map of Europe with colorful territories, fine borders and restrained labels.</desc>
<defs>
<radialGradient id="sea"><stop stop-color="#284555"/><stop offset="1" stop-color="#0e1c2b"/></radialGradient>
<pattern id="texture" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="#fff" opacity="0.06"/></pattern>
</defs>
<rect width="2760" height="1800" fill="url(#sea)"/>
<g stroke="#bbd9e5" stroke-width="1" opacity="0.1">${graticule.join("")}</g>
<g stroke="#101e2b" stroke-width="2.5" stroke-linejoin="round" fill-rule="evenodd" opacity="0.82">${paths.join("\n")}</g>
<rect width="2760" height="1800" fill="url(#texture)"/>
<g fill="#f6eee0" fill-opacity="0.8" font-family="sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" paint-order="stroke" stroke="#172332" stroke-width="2">
${labels.map(([name, lon, lat]) => { const [x, y] = project([lon, lat]); return `<text x="${x}" y="${y}">${name}</text>`; }).join("\n")}
</g>
<g fill="#f1d397" stroke="#172332" stroke-width="2">${capitals.map((coordinate) => { const [x, y] = project(coordinate); return `<circle cx="${x}" cy="${y}" r="4"/>`; }).join("")}</g>
</svg>\n`;
writeFileSync(new URL("assets/images/title-map.svg", root), svg);
console.log(`Title map generated: ${paths.length} countries, ${Buffer.byteLength(svg)} bytes`);
