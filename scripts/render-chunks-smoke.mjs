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
const offscreenCache = createRegionChunkCache();
const wideRegions = frame(128, 96);
wideRegions.CONFIG.GRID_RES = 1;
wideRegions.xMax = 127;
wideRegions.yMax = 95;
offscreenCache.get(wideRegions);
const narrowRegions = { ...wideRegions, xMax: 63, yMax: 63 };
const narrowGroups = offscreenCache.get(narrowRegions);
const narrowBuilds = offscreenCache.stats.built;
wideRegions.worldControlMap[3] = 2;
offscreenCache.invalidateTiles([3]);
assert.equal(
	offscreenCache.get(narrowRegions),
	narrowGroups,
	"an offscreen structural tile does not rebuild the joined visible region view",
);
assert.equal(offscreenCache.stats.built, narrowBuilds, "offscreen invalidation keeps visible component chunks cached");
assert.equal(
	offscreenCache.get({ ...narrowRegions, intensityMap: new Uint8Array(128 * 96) }),
	narrowGroups,
	"intensity-only frame changes do not rebuild joined region geometry",
);
offscreenCache.invalidateTiles([]);
assert.equal(offscreenCache.get(narrowRegions), narrowGroups, "empty structural invalidations keep the joined view");
const occupied = 20 * regionState.gridWidth + 31;
regionState.worldControlMap[occupied] = 1;
geography.invalidateTiles([0]);
const joined = geography.get(regionState);
assert.equal(joined.filter((region) => region.id === 1).length, 1, "a changed bridge joins previously disconnected geometry");
assert.equal(geography.stats.built, regionBuilds + 1, "only changed component chunks rebuild");
const coarse=geography.get({...regionState,currentZoom:3});
const lodBuilds=geography.stats.built;
geography.get(regionState);
assert.equal(geography.stats.built,lodBuilds,"zooming back to a previously built detail level reuses its world chunks");
geography.invalidateTiles([0]);geography.get(regionState);
assert.equal(geography.stats.built,lodBuilds+1,"changed geometry rebuilds the detailed tile");
geography.get({...regionState,currentZoom:3});
assert.equal(geography.stats.built,lodBuilds+2,"the same mutation also invalidates the coarse tile");
assert.ok(coarse.length>0);
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

const sparseFrame = frame(512, 512);
sparseFrame.xMax = 511;
sparseFrame.yMax = 511;
sparseFrame.staticPaintXMax = 511;
sparseFrame.staticPaintYMax = 511;
const sparseRectangles = [];
sparseFrame.ctx = {
	fillStyle: "",
	beginPath() {},
	fill() {},
	stroke() {},
	moveTo() {},
	lineTo() {},
	rect: (...rectangle) => sparseRectangles.push(rectangle),
};
const sparseLayer = {};
drawPoliticalChunks(sparseLayer, sparseFrame);
assert.equal(sparseLayer._politicalChunkCache.stats.built, 256);
const dirtyPaintTiles = new Set();
for (const [centerX, centerY] of [[2, 2], [8, 8]])
	for (let y = centerY - 1; y <= centerY + 1; y++)
		for (let x = centerX - 1; x <= centerX + 1; x++)
			dirtyPaintTiles.add(y * 16 + x);
assert.equal(dirtyPaintTiles.size, 18);
const sparseStart = sparseRectangles.length;
const sparseReusedStart = sparseLayer._politicalChunkCache.stats.reused;
drawPoliticalChunks(sparseLayer, {
	...sparseFrame,
	partialControlRedraw: true,
	dirtyControlPaintTiles: dirtyPaintTiles,
	staticLoopXMin: 31,
	staticLoopYMin: 31,
	staticPaintXMax: 321,
	staticPaintYMax: 321,
});
const sparseChunkCount =
	sparseLayer._politicalChunkCache.stats.reused - sparseReusedStart;
assert.equal(sparseChunkCount, 50, "sparse dirty islands visit only chunks touched by their padded clips");
assert.equal(sparseRectangles.length - sparseStart, 50, "paint commands stay local to far-apart dirty tiles");
assert.ok(sparseChunkCount < 121, "sparse traversal avoids the 11-by-11 bounding-box walk");

let projectedVertexCommands = 0;
const filledPaths = [];
class Path2DStub {
	constructor() {
		this.commands = [];
	}
	moveTo(x, y) {
		projectedVertexCommands++;
		this.commands.push(["moveTo", x, y]);
	}
	lineTo(x, y) {
		projectedVertexCommands++;
		this.commands.push(["lineTo", x, y]);
	}
	closePath() {
		this.commands.push(["closePath"]);
	}
	rect(x, y, width, height) {
		this.commands.push(["rect", x, y, width, height]);
	}
	addPath(path) {
		this.commands.push(...path.commands);
	}
}
const priorPath2D = globalThis.Path2D;
try {
	globalThis.Path2D = Path2DStub;
	const pathFrame = frame(16, 16);
	pathFrame.xMax = 15;
	pathFrame.yMax = 15;
	pathFrame.staticPaintXMax = 15;
	pathFrame.staticPaintYMax = 15;
	pathFrame.isAtlas = true;
	pathFrame.atlasCoast = false;
	pathFrame.viewportKey = "path-view-a";
	pathFrame.gridProjection = {
		key: "path-projection-a",
		x: new Float32Array([0]),
		y: new Float32Array([0]),
	};
	for (let y = 0; y < 16; y++)
		for (let x = 0; x < 16; x++)
			pathFrame.worldControlMap[y * 16 + x] = (x + y) % 2 ? 1 : 2;
	pathFrame.ctx = {
		fillStyle: "",
		beginPath() {},
		fill(path) {
			filledPaths.push(path);
		},
		stroke() {},
		moveTo() {},
		lineTo() {},
		rect() {},
	};
	const pathLayer = {};
	drawPoliticalChunks(pathLayer, pathFrame);
	const firstProjectedCommands = projectedVertexCommands;
	assert.ok(firstProjectedCommands > 0, "atlas polygon points are projected into cached Path2D geometry");
	assert.ok(filledPaths.every((path) => path instanceof Path2DStub));
	drawPoliticalChunks(pathLayer, pathFrame);
	assert.equal(
		projectedVertexCommands,
		firstProjectedCommands,
		"repeated paints reuse chunk Path2D commands for the same projection",
	);
	pathFrame.viewportKey = "path-view-b";
	drawPoliticalChunks(pathLayer, pathFrame);
	const viewportCommands = projectedVertexCommands;
	assert.ok(viewportCommands > firstProjectedCommands, "viewport changes invalidate projected chunk paths");
	pathFrame.gridProjection = {
		key: "path-projection-b",
		x: new Float32Array([1]),
		y: new Float32Array([1]),
	};
	drawPoliticalChunks(pathLayer, pathFrame);
	const projectionCommands = projectedVertexCommands;
	assert.ok(projectionCommands > viewportCommands, "projection object changes invalidate projected chunk paths");
	pathFrame.worldControlMap[0] = pathFrame.worldControlMap[0] === 1 ? 2 : 1;
	pathLayer._politicalChunkCache.invalidateCells([0], 16, 16);
	drawPoliticalChunks(pathLayer, pathFrame);
	assert.ok(
		projectedVertexCommands > projectionCommands,
		"geometry invalidation rebuilds the affected chunk's projected paths",
	);
} finally {
	if (priorPath2D === undefined) delete globalThis.Path2D;
	else globalThis.Path2D = priorPath2D;
}

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
const globals = { document: { createElement: canvas }, window: { devicePixelRatio: 2 }, map, worldControlMap: null, landMask: null, isPaused: true, gameState: "MENU", godModeActive: false, preGodModeState: "MENU", cinematicMode: false, gridWidth: 128, gridHeight: 96, performance, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, invalidateUnitFlagSprites() {}, L: { Layer: { extend(methods) { function Layer() {} Object.assign(Layer.prototype, methods); return Layer; } }, DomUtil: { create: canvas, setTransform(surface, offset, scale) { surface.style.transform = `${offset.x},${offset.y},${scale}`; } } } };
const { ControlMapLayer: Layer, RENDER_LAYERS } = vm.runInNewContext(
	`${source}\n({ ControlMapLayer, RENDER_LAYERS });`,
	globals,
);
const view = new Layer();
view.onAdd(map);
assert.equal(children.length, 4, "unchanged layers are presented by the DOM compositor");
assert.ok(children.every((surface) => surface.style.width === "484px" && surface.style.height === "444px"));
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
const politicalInvalidations = [];
const regionInvalidations = [];
let regionClears = 0;
const politicalCache = {
	clear() {
		clears++;
	},
	invalidateCells() {},
	invalidateTiles(...args) {
		politicalInvalidations.push(
			[...args].map((value) =>
				Array.isArray(value) ? Array.from(value) : value,
			),
		);
	},
};
const regionCache = {
	clear() {
		regionClears++;
	},
	invalidateTiles(keys) {
		regionInvalidations.push([...keys]);
	},
};
view._politicalChunkCache = politicalCache;
view._regionChunkCache = regionCache;
view._dirtyControlTiles.clear();
view._allControlTilesDirty = false;
const requestedMasks = [];
const originalRequestRender = view.requestRender;
view.requestRender = (mask) => requestedMasks.push(mask);
const clearsBeforeTileNotifications = clears;
view.notifyControlTilesChanged([4], 32, {
	politicalTileKeys: [],
	regionTileKeys: [],
});
assert.equal(view._politicalChunkCache, politicalCache, "occupation-only updates retain political world chunks");
assert.equal(view._regionChunkCache, regionCache, "occupation-only updates retain region world chunks");
assert.equal(clears, clearsBeforeTileNotifications);
assert.equal(regionClears, 0);
assert.deepEqual(Array.from(view._dirtyControlTiles), [], "occupation-only updates queue no dirty paint tile");
assert.deepEqual(politicalInvalidations, [[[], 128, 96]], "empty political keys invalidate no world chunk");
assert.deepEqual(regionInvalidations, [], "empty region keys invalidate no joined component");
assert.deepEqual(requestedMasks, [RENDER_LAYERS.DYNAMIC], "occupation-only updates still request a dynamic paint");
politicalInvalidations.length = 0;
requestedMasks.length = 0;
view.notifyControlTilesChanged([4], 32, {
	politicalTileKeys: [5],
	regionTileKeys: [9],
});
assert.deepEqual(politicalInvalidations, [[[5], 128, 96]], "structural political changes invalidate only their supplied tiles");
assert.deepEqual(regionInvalidations, [[9]], "structural region changes invalidate only their supplied tiles");
assert.deepEqual(Array.from(view._dirtyControlTiles), [5], "only structural political tiles enter the paint queue");
assert.deepEqual(requestedMasks, [RENDER_LAYERS.DYNAMIC]);
view.requestRender = originalRequestRender;
// Real layer event scheduling and render guards, still entirely in Node.
let center={lat:0,lng:0}, queued=null, nextRaf=10, paints=0;
map.getCenter=()=>center;map.getBounds=()=>({equals:()=>false});
globals.requestAnimationFrame=callback=>{queued=callback;return nextRaf++;};
view._renderRaf=0;view._lastCameraPaintTime=performance.now();
view._onMoveStart();
for(let i=1;i<=100;i++){center={lat:0,lng:i/10};view._onMove();}
assert.equal(queued,null,"small drag samples only transform the buffered surfaces");
assert.ok(children.every(surface=>surface.style.transform==='-10,0,1'));
// Supplying a world makes the actual render guard observable: if it falls
// through, the deliberately absent application bindings would throw.
globals.worldControlMap=new Uint16Array(1);globals.landMask=new Uint8Array(1);
assert.doesNotThrow(()=>Layer.prototype.render.call(view),"simulation render calls are suspended inside a short gesture");
const actualRender=view.render;view.render=()=>{paints++;view._renderRaf=0;view._commitZoomSettle();};
view._onMoveEnd();assert.ok(queued);queued();queued=null;
assert.equal(paints,1,"one final paint replaces the translated frame");
assert.ok(children.every(surface=>surface.style.transform===''));
view._onMoveStart();view._lastCameraPaintTime=performance.now()-1000;
center={lat:0,lng:300};view._onMove();assert.equal(view._cameraRepaintPending,true);assert.ok(queued);
queued();queued=null;view._lastCameraPaintTime=performance.now();view._renderedCenter=center;
for(let i=0;i<100;i++){center={lat:0,lng:301+i/100};view._onMove();}
assert.equal(queued,null,"long-drag replenishment cannot run at pointer-event frequency");
view._onMoveEnd();queued();queued=null;
// Captures keep the public viewport canvas size, with no overscan margin.
view._isCapturing=true;view._resizeSurfaces();assert.equal(view._surfacePadding,0);assert.equal(view._container.width,200);assert.equal(view._container.height,120);
view._isCapturing=false;view._resizeSurfaces();assert.equal(view._surfacePadding,192);assert.equal(view._container.width,968);
// Camera settle remains force-admitted by the active simulation, without a
// second renderer-owned rAF bypassing its render admission policy.
globals.gameState="SIMULATING";globals.isPaused=false;view._renderRaf=0;
view._onMoveStart();view._onMoveEnd();assert.equal(queued,null);assert.equal(view.hasPendingZoomSettle(),true);
view._commitZoomSettle();view.render=actualRender;globals.worldControlMap=null;globals.landMask=null;
view.onRemove(map);
assert.equal(children.length, 0);
console.log("World chunk cache, political materials, culling, selection, stacked surfaces, and zoom smoke checks passed");
