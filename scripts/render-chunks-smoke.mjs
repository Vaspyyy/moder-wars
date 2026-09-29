import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRegionChunkCache } from "../src/render-regions.js";
import { collectSelectionQuads, containsRenderPoint } from "../src/render-culling.js";
import { createPoliticalChunkCache, drawPoliticalChunks, drawPoliticalBorders } from "../src/render-political-cache.js";

function frame(width = 128, height = 96) {
	return {
		gridWidth: width, gridHeight: height, step: 1, currentZoom: 6,
		worldControlMap: new Uint16Array(width * height).fill(1),
		landMask: new Uint8Array(width * height).fill(1),
		dominantSideMap: new Int8Array(width * height).fill(-1),
		primaryOccupierMap: new Uint16Array(width * height),
		sovereignSideMap: new Int8Array([-1, 0, 1]),
		biomeMask: new Uint8Array(width * height), terrain: new Float32Array(width * height),
		countryMetadata: [{ id: 1, rgba: [200, 40, 30, 1], bounds: { minY: 0, maxY: height } }, { id: 2, rgba: [20, 100, 200, 1] }],
		sideColors: ["rgba(200,40,30,0.6)", "rgba(20,100,200,0.6)"],
		isWar: false, isSimplifiedMode: false, isCustomTerrain: false, useSimplifiedBase: false,
		viewMode: "POLITICAL", allianceViewEnabled: false, mountainsEnabled: true,
		disableCountryGradient: true, politicalStyleKey: "political",
		CONFIG: { FRONTLINE_COLOR: "#000" },
		xMin: 0, xMax: 63, yMin: 0, yMax: 63, staticLoopXMin: 0, staticLoopYMin: 0,
		getGridPoint: (x, y) => ({ x: x * 4, y: y * 4 }),
	};
}
const cache = createPoliticalChunkCache();
const state = frame();
cache.prepare(state);
const first = cache.get(state, 0, 0);
assert.deepEqual(Array.from(first.rectangles), [1, 0, 0, 32, 32]);
assert.equal(cache.materials[1].fill, "rgba(200,40,30,0.650)");
cache.prepare({ ...state, xMin: 4, xMax: 67, staticCacheKey: "another-camera" });
assert.equal(cache.get(state, 0, 0), first, "camera position must not invalidate world meshes");
const distant = cache.get(state, 3, 2);
cache.get(state, 1, 0);
state.worldControlMap[31] = 2;
cache.invalidateCells([31], state.gridWidth, state.gridHeight);
assert.notEqual(cache.get(state, 0, 0), first);
assert.equal(cache.get(state, 3, 2), distant, "offscreen unrelated chunks remain cached");
assert.ok(cache.get(state, 0, 0).borders.length > 0, "border neighbors invalidate along with fills");
const oldBuilt = cache.stats.built;
cache.prepare({ ...state, step: 2 });
cache.get({ ...state, step: 2 }, 0, 0);
assert.equal(cache.stats.built, oldBuilt + 1, "sampling changes rebuild world meshes");

const paletteCache = createPoliticalChunkCache();
const paletteFrame = frame(64, 64);
paletteCache.prepare(paletteFrame);
const oldPaletteChunk = paletteCache.get(paletteFrame, 0, 0);
paletteFrame.countryMetadata[0].rgba[0] = 100;
paletteCache.prepare(paletteFrame);
const recoloredChunk = paletteCache.get(paletteFrame, 0, 0);
assert.notEqual(recoloredChunk, oldPaletteChunk, "editing a color in place invalidates cached palette meshes");
assert.equal(paletteCache.materials[recoloredChunk.rectangles[0]].fill, "rgba(100,40,30,0.650)");
paletteCache.prepare({ ...paletteFrame, xMin: 1 });
assert.equal(paletteCache.get(paletteFrame, 0, 0), recoloredChunk, "unchanged country colors still reuse geometry on pan");
paletteFrame.countryMetadata[0].overlordId = 2;
paletteCache.prepare(paletteFrame);
const vassalChunk = paletteCache.get(paletteFrame, 0, 0);
assert.equal(paletteCache.materials[vassalChunk.rectangles[0]].fill, "rgba(40,85,158,0.650)", "vassalage changes update blended colors");
paletteFrame.allianceViewEnabled = true;
paletteFrame.allianceKeyById = new Int32Array([0, 2, 2]);
paletteFrame.allianceColorByRoot = { 2: [20, 100, 200, 1] };
paletteCache.prepare(paletteFrame);
const allianceChunk = paletteCache.get(paletteFrame, 0, 0);
assert.equal(paletteCache.materials[allianceChunk.rectangles[0]].fill, "rgba(20,100,200,0.850)");
paletteFrame.allianceColorByRoot[2][0] = 200;
paletteCache.prepare(paletteFrame);
const allianceRecolor = paletteCache.get(paletteFrame, 0, 0);
assert.notEqual(allianceRecolor, allianceChunk);
assert.equal(paletteCache.materials[allianceRecolor.rectangles[0]].fill, "rgba(200,100,200,0.850)", "alliance root colors update even when style keys are unchanged");

const styles = frame(8, 8);
styles.worldControlMap.set([1, 1, 1, 0, 2, 1, 1, 1]);
styles.landMask.set([1, 2, 2, 1, 1, 1, 1, 1]);
styles.dominantSideMap.set([-1, 0, 1, -1, -1, -1, -1, -1]);
styles.primaryOccupierMap[2] = 2;
styles.terrain[5] = 0.4;
styles.isWar = true;
styles.politicalStyleKey = "war";
cache.prepare(styles);
const war = cache.get(styles, 0, 0);
const materialAt = (x, y = 0) => {
	for (let i = 0; i < war.rectangles.length; i += 5) {
		const [id, left, top, width, height] = war.rectangles.subarray(i, i + 5);
		if (x >= left && x < left + width && y >= top && y < top + height) return cache.materials[id];
	}
	return undefined;
};
assert.equal(materialAt(0).fill, "rgba(200,40,30,0.650)");
assert.equal(materialAt(1).fill, "rgba(200,40,30,0.700)");
assert.equal(materialAt(2).fill, "rgba(91,147,217,0.850)");
assert.equal(materialAt(3), undefined, "neutral land remains transparent over satellite imagery");
assert.equal(materialAt(5).fill, "rgba(119,23,17,0.488)", "mountain shading and alpha remain intact");
assert.ok(war.frontlines.length > 0);

const geography = createRegionChunkCache();
const regionState = frame(128, 96);
regionState.CONFIG.GRID_RES = 1;
for (let y = 0; y < regionState.gridHeight; y++) regionState.worldControlMap[y * regionState.gridWidth + 31] = 2;
const groups = geography.get(regionState);
assert.equal(groups.filter((region) => region.id === 1).length, 2, "disconnected territories keep separate curved labels");
assert.equal(groups.filter((region) => region.id === 2).length, 1, "components join across vertical chunk seams");
assert.equal(groups.reduce((total, region) => total + region.count, 0), 96 * 96);
const regionBuilds = geography.stats.built;
const panGroups = geography.get({ ...regionState, xMin: 4, xMax: 67 });
assert.equal(panGroups, groups, "moving within cached chunk coverage preserves label geometry");
assert.equal(geography.stats.built, regionBuilds, "pan does not repeat flood-fill");
const occupied = 20 * regionState.gridWidth + 31;
regionState.worldControlMap[occupied] = 1;
geography.invalidateTiles([0]);
const joined = geography.get(regionState);
assert.equal(joined.filter((region) => region.id === 1).length, 1, "a changed bridge joins previously disconnected geometry");
assert.equal(geography.stats.built, regionBuilds + 1, "only changed component chunks rebuild");
const flagGroups = geography.get({ ...regionState, viewMode: "FLAG" });
assert.equal(flagGroups.reduce((total, region) => total + region.pixels.length, 0), 96 * 96, "flag clipping gets the full cached country mask");
assert.ok(flagGroups.every((region) => region.bins.length === 4 && region.bins.every((bin) => Number.isFinite(bin.latSum / bin.count) && Number.isFinite(bin.lngSum / bin.count))));

const calls = [];
const layer = {};
const drawn = frame();
drawn.ctx = { fillStyle: "", beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, rect: (...args) => calls.push(args) };
drawPoliticalChunks(layer, drawn);
drawPoliticalBorders(layer, drawn);
const initial = layer._politicalChunkCache.stats;
assert.equal(initial.built, 4);
drawPoliticalChunks(layer, { ...drawn, xMin: 1, staticLoopXMin: 1, getGridPoint: (x, y) => ({ x: x * 4 - 4, y: y * 4 }) });
assert.equal(layer._politicalChunkCache.stats.built, initial.built);
assert.ok(layer._politicalChunkCache.stats.reused >= 4);
assert.ok(calls.every((rectangle) => rectangle.every(Number.isFinite)));

const bounds = { getWest: () => 170, getEast: () => 190, getSouth: () => -10, getNorth: () => 10 };
assert.equal(containsRenderPoint(bounds, 0, -179), true);
assert.equal(containsRenderPoint(bounds, 0, 160), false);
assert.equal(containsRenderPoint(bounds, 11, 180), false);
assert.equal(containsRenderPoint(bounds, NaN, 180), false);
const world = new Uint16Array([1, 1, 2, 1, 3, 2, 3, 3, 2]);
const selected = new Set([1, 2, 3]);
const quads = collectSelectionQuads(world, 3, { xMin: 0, xMax: 2, yMin: 0, yMax: 2 }, selected, new Map());
for (const id of selected) {
	const expected = [];
	for (const index of [0, 1, 3, 4]) {
		const neighbors = [world[index], world[index + 1], world[index + 4], world[index + 3]];
		if (neighbors.includes(id) && !neighbors.every((owner) => owner === id)) expected.push(index);
	}
	assert.deepEqual(quads.get(id), expected);
}

// Exercise the actual layer lifecycle with plain DOM and map doubles. No browser
// or game bootstrap is launched, and no third-party test dependency is required.
function point(x, y) {
	return { x, y, divideBy: (n) => point(x / n, y / n), subtract: (p) => point(x - p.x, y - p.y), add: (p) => point(x + p.x, y + p.y), multiplyBy: (n) => point(x * n, y * n) };
}
const children = [];
const container = { appendChild(surface) { children.push(surface); surface.parentNode = this; }, removeChild(surface) { children.splice(children.indexOf(surface), 1); surface.parentNode = null; } };
const canvas = () => ({ style: {}, width: 0, height: 0, setAttribute() {} });
const map = { getZoom: () => 6, getCenter: () => ({ lat: 0, lng: 0 }), getContainer: () => container, getBounds: () => ({ equals: () => true }), getSize: () => point(100, 60), on() {}, off() {}, getPane: () => null, project: (center) => point(center.lng, center.lat), getZoomScale: (next, previous) => 2 ** (next - previous) };
const source = readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8").replace(/^import[\s\S]*?from "[^"]+";\n/gm, "").replace(/export \{ ControlMapLayer, RENDER_LAYERS \};/, "");
const globals = { document: { createElement: canvas }, window: { devicePixelRatio: 2 }, map, worldControlMap: null, landMask: null, isPaused: true, gameState: "MENU", godModeActive: false, preGodModeState: "MENU", cinematicMode: false, gridWidth: 128, gridHeight: 96, performance, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, L: { Layer: { extend(methods) { function Layer() {} Object.assign(Layer.prototype, methods); return Layer; } }, DomUtil: { create: canvas, setTransform(surface, offset, scale) { surface.style.transform = `${offset.x},${offset.y},${scale}`; } } } };
const Layer = vm.runInNewContext(`${source}\nControlMapLayer;`, globals);
const view = new Layer();
view.onAdd(map);
assert.equal(children.length, 4, "unchanged layers are presented by the DOM compositor");
assert.ok(children.every((surface) => surface.style.width === "100px" && surface.style.height === "60px"));
assert.equal(view._compositeLayers, false);
view._onZoomStart();
view._onZoomAnim({ center: { lat: 3, lng: 4 }, zoom: 7 });
assert.equal(new Set(children.map((surface) => surface.style.transform)).size, 1, "zoom transforms all visible surfaces together");
view._onZoomEnd();
view._commitZoomSettle();
assert.ok(children.every((surface) => surface.style.transform === ""));
let clears = 0;
view._politicalChunkCache = { clear() { clears++; }, invalidateCells() {} };
view.requestRender(15, true);
assert.equal(clears, 0, "camera paint requests preserve world chunks");
view.invalidate(1);
assert.equal(clears, 1, "bulk and political style updates invalidate world chunks");
view.onRemove(map);
assert.equal(children.length, 0);
console.log("World chunk cache, political materials, culling, selection, stacked surfaces, and zoom smoke checks passed");
