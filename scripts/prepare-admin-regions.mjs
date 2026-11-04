// Build a compact display-only admin-1 layer from a pinned public-domain source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson";
const SOURCE_SHA256 = "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5";
const TOLERANCE = 0.025;
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const check = args.includes("--check");
if (args.some((arg, index) => arg !== "--check" && arg !== "--source" && !(sourceIndex >= 0 && index === sourceIndex + 1))) {
    throw new Error("Usage: node scripts/prepare-admin-regions.mjs [--source /path/to/source.geojson] [--check]");
}
if (sourceIndex >= 0 && !args[sourceIndex + 1]) throw new Error("--source requires a file path");
let bytes;
if (sourceIndex >= 0) bytes = await readFile(args[sourceIndex + 1]);
else {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
}
assert.equal(createHash("sha256").update(bytes).digest("hex"), SOURCE_SHA256, "Unexpected source revision; review changes before updating the pinned hash");
const source = JSON.parse(bytes);
const round = value => Math.round(value * 10000) / 10000;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function distanceSquared(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}
function simplifyLine(points, tolerance) {
    if (points.length <= 2) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [first, last] = stack.pop();
        let maximum = tolerance * tolerance, selected = -1;
        for (let i = first + 1; i < last; i++) {
            const distance = distanceSquared(points[i], points[first], points[last]);
            if (distance > maximum) { maximum = distance; selected = i; }
        }
        if (selected >= 0) {
            keep[selected] = 1;
            stack.push([first, selected], [selected, last]);
        }
    }
    return points.filter((_, i) => keep[i]);
}
function simplifyRing(ring) {
    const points = ring.map(([x, y]) => [round(x), round(y)]).filter((p, i, list) => !i || !same(p, list[i - 1]));
    if (!same(points[0], points.at(-1))) points.push(points[0]);
    let farthest = 1, maximum = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const distance = distanceSquared(points[i], points[0], points[0]);
        if (distance > maximum) { maximum = distance; farthest = i; }
    }
    // Splitting closed rings avoids treating identical start/end points as a single segment.
    const simplified = [
        ...simplifyLine(points.slice(0, farthest + 1), TOLERANCE).slice(0, -1),
        ...simplifyLine(points.slice(farthest), TOLERANCE),
    ];
    return (simplified.length >= 4 ? simplified : points).flat();
}
function insideRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[j];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
}
function insidePolygons(point, polygons) {
    return polygons.some(polygon => insideRing(point, polygon[0]) && !polygon.slice(1).some(hole => insideRing(point, hole)));
}
function anchorFor(properties, polygons, bbox) {
    const supplied = [properties.longitude, properties.latitude];
    if (supplied.every(Number.isFinite) && insidePolygons(supplied, polygons)) return supplied.map(round);
    // Choose the widest interior scanline segment; avoid placing labels in water/holes.
    let best = null, maximum = -1;
    const height = bbox[3] - bbox[1];
    for (let step = 1; step < 20; step++) {
        const y = bbox[1] + height * step / 20;
        for (const polygon of polygons) {
            const crossings = [];
            for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
                const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
                if ((ay > y) !== (by > y)) crossings.push(ax + (bx - ax) * (y - ay) / (by - ay));
            }
            crossings.sort((a, b) => a - b);
            for (let i = 1; i < crossings.length; i += 2) {
                const width = crossings[i] - crossings[i - 1];
                const point = [(crossings[i] + crossings[i - 1]) / 2, y];
                if (width > maximum && insidePolygons(point, polygons)) { best = point; maximum = width; }
            }
        }
    }
    return (best || polygons[0][0][0]).map(round);
}
const regions = source.features.map(feature => {
    const p = feature.properties;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) {
        bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
    }
    const country = p.iso_3166_2?.startsWith("UA-") ? "UKR" : p.adm0_a3;
    const names = { en: p.name_en || p.name || "", uk: p.name_uk || p.name_en || p.name || "", ru: p.name_ru || p.name_en || p.name || "" };
    if (country === "UKR") {
        if (p.iso_3166_2 === "UA-32") Object.assign(names, { en: "Kyiv Oblast", uk: "Київська область", ru: "Киевская область" });
        else if (p.iso_3166_2 === "UA-30") Object.assign(names, { en: "Kyiv (city)", uk: "м. Київ", ru: "г. Киев" });
        else if (p.iso_3166_2 === "UA-40") Object.assign(names, { en: "Sevastopol (city)", uk: "м. Севастополь", ru: "г. Севастополь" });
        else if (p.iso_3166_2 !== "UA-43") names.en = `${p.iso_3166_2 === "UA-51" ? "Odesa" : names.en} Oblast`;
    }
    return { id: p.adm1_code, country, names, bbox: bbox.map(round), anchor: anchorFor(p, polygons, bbox), rings: polygons.flatMap(polygon => polygon.map(simplifyRing)) };
}).sort((a, b) => a.id.localeCompare(b.id, "en"));
assert.equal(regions.length, 4596);
assert.equal(new Set(regions.map(r => r.id)).size, regions.length);
const ukraine = regions.filter(r => r.country === "UKR");
assert.equal(ukraine.length, 27, "Ukraine must include 24 oblasts, Crimea, Kyiv and Sevastopol");
assert.equal(ukraine.filter(r => r.names.uk.endsWith(" область")).length, 24);
assert.ok(ukraine.some(r => r.names.uk === "Автономна Республіка Крим"));
assert.ok(ukraine.some(r => r.names.uk === "м. Севастополь"));
for (const region of regions) {
    assert.ok(region.bbox.every(Number.isFinite) && region.anchor.every(Number.isFinite));
    assert.ok(region.rings.length);
    for (const ring of region.rings) {
        assert.ok(ring.length >= 8 && ring.length % 2 === 0 && ring.every(Number.isFinite));
        assert.deepEqual(ring.slice(0, 2), ring.slice(-2));
    }
}
const result = { version: 1, source: { name: "Natural Earth Admin 1", release: "v5.1.2", url: SOURCE_URL, sha256: SOURCE_SHA256, toleranceDegrees: TOLERANCE }, regions };
const json = Buffer.from(JSON.stringify(result));
const compressed = gzipSync(json, { level: 9 });
assert.ok(compressed.length < 2_000_000, "Keep admin overlay below its 2 MB download budget");
assert.ok(json.length < 5_000_000, `Keep parsed input below its 5 MB JSON budget: ${json.length} bytes (${compressed.length} gzip)`);
const output = new URL("../assets/geodata/admin1/regions.json.gz", import.meta.url);
if (check) assert.deepEqual(await readFile(output), compressed, "Committed admin layer differs from reproducible output");
else { await mkdir(new URL("../assets/geodata/admin1/", import.meta.url), { recursive: true }); await writeFile(output, compressed); }
console.log(`Admin-1: ${regions.length} regions, ${ukraine.length} Ukraine regions; ${json.length} JSON bytes, ${compressed.length} gzip bytes; ${check ? "reproduction verified" : "written"}`);
