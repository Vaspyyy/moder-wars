import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { createEditorCommands } from "../src/editor-commands.js";
import { paintClippedFlag, resolveRenderFlag } from "../src/render-flags.js";
import { drawLabels } from "../src/render-labels.js";
import { drawOverlays } from "../src/render-overlays.js";
import { drawTerrain } from "../src/render-terrain.js";
import { drawUnits } from "../src/render-units.js";

const layers = { STATIC: 1, LABELS: 2, OVERLAYS: 4 };

const annexCalls = [];
const annexWorld = new Uint16Array(8).fill(1);
const annexRuntime = {
	gridWidth: 4, gridHeight: 2, CONFIG: { GRID_RES: 1 },
	worldControlMap: annexWorld, landMask: new Uint8Array(8).fill(1), provinceMap: new Int32Array(8),
	countryMetadata: [{ id: 1 }, { id: 2 }],
	loadingStatus: {}, loadingOverlay: { style: {} },
	mapRuntime: { geoJSON: () => ({ getBounds: () => ({ getSouth: () => -90, getNorth: () => -88, getWest: () => -180, getEast: () => -178 }) }) },
	isPointInFeature: (_lat, lng) => lng < -178, getProvinceId: (_x, _y, id) => id,
	RENDER_LAYERS: layers,
	influenceLayer: { invalidate: (mask) => annexCalls.push(["invalidate", mask]), render: () => annexCalls.push(["render"]) },
	recalculateAllBounds: () => annexCalls.push(["bounds"]),
};
await createEditorCommands(annexRuntime).annexFeatureToCountry({ properties: { NAME: "Fixture" } }, 2);
assert.deepEqual(Array.from(annexWorld), [2, 2, 1, 1, 2, 2, 1, 1]);
assert.deepEqual(annexCalls, [["invalidate", layers.STATIC], ["bounds"], ["render"]], "bulk annex refreshes world caches and label bounds before painting");
function context(name, trace) {
	return new Proxy({}, {
		get(target, key) {
			if (key in target) return target[key];
			if (key === "measureText") return (text) => ({ width: text.length * 7 });
			if (key === "createRadialGradient") return (...args) => {
				trace.push([name, key, ...args]);
				return { addColorStop: (...stops) => trace.push([name, "addColorStop", ...stops]) };
			};
			return (...args) => trace.push([name, key, ...args.map((value) => value?.surfaceName || value)]);
		},
		set(target, key, value) { trace.push([name, key, value]); target[key] = value; return true; },
	});
}
function fixture() {
	const trace = [];
	const ctx = context("dynamic", trace);
	const surface = (name) => {
		const surfaceCtx = context(name, trace);
		return { surfaceName: name, width: 160, height: 100, getContext: () => surfaceCtx };
	};
	const bounds = {
		pad() { return this; }, contains: ([lat, lng]) => Math.abs(lat) < 10 && Math.abs(lng) < 10,
		getWest: () => -1, getEast: () => 1, getSouth: () => -1, getNorth: () => 1,
		getNorthWest: () => ({ lat: 1, lng: -1 }), getNorthEast: () => ({ lat: 1, lng: 1 }),
		getSouthEast: () => ({ lat: -1, lng: 1 }), getSouthWest: () => ({ lat: -1, lng: -1 }),
	};
	const project = (lat, lng) => ({ x: 80 + lng * 20, y: 50 - lat * 20 });
	const frame = {
		ctx, mainCtx: context("composite", trace), dpr: 1, RENDER_LAYERS: layers,
		viewportKey: "fixture", sideKey: "red", isWar: true, gameState: "SIMULATING",
		gameMode: "EDITOR", hideCurvedLabels: false, showCountryLabels: false, cinematicMode: true,
		showWarPlans: false, isCustomTerrain: true, refAboveTerrain: false, referenceImageUrl: "",
		refOpacity: 0.5, simFrameCount: 10, simSpeed: 1, isPaused: false,
		regions: [], countryMetadata: [], MAX_SIDES: 2, sides: [[{ id: 1 }], []],
		showUnitsVisually: false, showBattleIndicators: true, showNonCapitalCities: true,
		editingCountryId: -1, viewBounds: bounds, explosions: [], bombs: [], bases: [],
		cities: [{ name: "Capital", lat: 0, lng: 0, isCapital: true, pop: 1000000 }],
		activeTheaterCities: [], project, getGridIndex: () => 0, dominantSideMap: new Int8Array([-1]),
		sideInfluenceMaps: [], sideColors: ["rgba(200, 40, 30, 0.5)"], rgbaRe: /[\d.]+\)$/,
		activeBattles: [{ lat: 0.2, lng: 0.2, participants: 3 }],
		CONFIG: { GRID_RES: 0.15 }, godModeActive: false,
		map: { options: { maxBounds: bounds }, getZoom: () => 6, getSize: () => ({ x: 160, y: 100 }), getBounds: () => bounds, latLngToContainerPoint: ({ lat, lng }) => project(lat, lng) },
		renderStatic: false,
	};
	Object.assign(frame, {
		fullStaticRefresh: true, viewMode: "POLITICAL", currentZoom: 6,
		gridWidth: 2, gridHeight: 2, worldControlMap: new Uint16Array([1, 1, 1, 1]),
		landMask: new Uint8Array([1, 1, 1, 1]), sovereignSideMap: new Int8Array([-1, 0]),
		primaryOccupierMap: new Uint16Array(4), occupationMap: new Float32Array(4),
		gridProjection: { x: [0, 20, 40], y: [0, 20, 40] },
		vWidth: 2, vHeight: 2, staticVyStart: 0, staticVyEnd: 2,
		staticVxStart: 0, staticVxEnd: 2, step: 1,
		xMin: 0, xMax: 1, yMin: 0, yMax: 1,
		staticLoopYMin: 0, staticLoopYMax: 1, staticLoopXMin: 0, staticLoopXMax: 1,
		isStaticCellInPaintTiles: () => true, isSimplifiedMode: true,
		mountainsEnabled: false, terrain: {}, useSimplifiedBase: true,
		biomeMask: new Uint8Array(4), allianceViewEnabled: false,
		countryMetadata: [{ id: 1, rgba: [200, 40, 30, 1] }],
		disableCountryGradient: true, getGridPoint: (x, y) => ({ x: x * 20, y: y * 20 }),
		staticCacheKey: "static-fixture",
	});
	const layer = {
		_clearVisibleControlTiles: (...args) => trace.push(["clear-dirty", ...args]),
		_invalidLayers: 7, _regionsRevision: 1, _lastLabelsRenderFrame: -Infinity,
		_lastOverlaysRenderFrame: -Infinity, _labelsSurface: surface("labels"), _overlaysSurface: surface("overlays"),
		drawCurvedLabel: (_ctx, side) => trace.push(["side-label", side]),
		drawCasualtiesOnCanvas: () => trace.push(["casualties"]),
	};
	return { frame, layer, trace };
}
// Find the end of a source block without loading its browser dependencies.
function blockEnd(source, start) {
	let depth = 0, quote = null, comment = null;
	for (let i = source.indexOf("{", start); i < source.length; i++) {
		const ch = source[i], next = source[i + 1];
		if (comment === "line") { if (ch === "\n") comment = null; continue; }
		if (comment === "block") { if (ch === "*" && next === "/") { comment = null; i++; } continue; }
		if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
		if (ch === "/" && next === "/") { comment = "line"; i++; continue; }
		if (ch === "/" && next === "*") { comment = "block"; i++; continue; }
		if (["'", '"', "`"].includes(ch)) { quote = ch; continue; }
		if (ch === "{") depth++;
		if (ch === "}" && --depth === 0) return i + 1;
	}
	throw new Error("Unterminated archived terrain block");
}
const previousWindow = globalThis.window;
globalThis.window = {};
try {
	const result = fixture();
	const originalContext = result.frame.ctx;
	drawTerrain.call(result.layer, result.frame);
	assert.deepEqual(result.trace, [], "a clean terrain pass must leave caches and pixels untouched");
	drawTerrain.call(result.layer, { ...result.frame, renderStatic: true });
	assert.equal(result.layer._staticCacheKey, "static-fixture");
	assert.equal(result.layer._invalidLayers & layers.STATIC, 0);
	assert.ok(result.trace.some(([name, command]) => name === "dynamic" && command === "rect"));
	drawUnits.call(result.layer, result.frame);
	assert.ok(result.trace.some(([name, command]) => name === "dynamic" && command === "arc"));
	const mirroredCities = fixture();
	const activeCity = { id: 17, name: "Small frontline city", lat: 0, lng: 0, isCapital: false, pop: 20 };
	mirroredCities.frame.cities = [activeCity];
	mirroredCities.frame.activeTheaterCities = [{ ...activeCity }];
	mirroredCities.frame.map.getZoom = () => 4;
	mirroredCities.frame.showBattleIndicators = false;
	mirroredCities.frame.dominantSideMap[0] = 1;
	mirroredCities.frame.occupationMap[0] = -0.9;
	mirroredCities.frame.sideColors.push("rgba(20, 100, 200, 0.5)");
	drawUnits.call(mirroredCities.layer, mirroredCities.frame);
	assert.equal(mirroredCities.layer._citiesScratch.length, 1, "active city membership survives independent snapshot clones");
	assert.ok(mirroredCities.trace.some(([name, command, color]) => name === "dynamic" && command === "fillStyle" && color === "rgba(20, 100, 200, 1)"), "signed occupation colors city markers without full influence maps");
	mirroredCities.trace.length = 0;
	mirroredCities.frame.occupationMap[0] = -0.2;
	drawUnits.call(mirroredCities.layer, mirroredCities.frame);
	assert.ok(mirroredCities.trace.some(([name, command, color]) => name === "dynamic" && command === "fillStyle" && color === "#fff"), "weakly occupied cities keep neutral marker color");
	drawLabels.call(result.layer, result.frame);
	assert.ok(result.trace.some(([name]) => name === "side-label"));
	assert.ok(result.trace.some(([name]) => name === "casualties"));
	assert.equal(result.layer._invalidLayers & layers.LABELS, 0);
	assert.equal(result.layer._lastLabelsRenderFrame, 10);
	const before = result.trace.length;
	drawLabels.call(result.layer, result.frame);
	assert.deepEqual(result.trace.slice(before), [["composite", "drawImage", "labels", 0, 0]], "cached labels only composite");
	drawOverlays.call(result.layer, result.frame);
	assert.ok(result.trace.some(([name, command]) => name === "overlays" && command === "setLineDash"));
	assert.equal(result.layer._invalidLayers & layers.OVERLAYS, 0);
	const overlayBefore = result.trace.length;
	drawOverlays.call(result.layer, result.frame);
	assert.deepEqual(result.trace.slice(overlayBefore), [["composite", "drawImage", "overlays", 0, 0]], "cached overlays only composite");
	assert.equal(result.frame.ctx, originalContext, "pass-local contexts must not mutate the caller snapshot");
	result.layer._compositeLayers = false;
	const stackedBefore = result.trace.length;
	drawLabels.call(result.layer, result.frame);
	drawOverlays.call(result.layer, result.frame);
	assert.deepEqual(result.trace.slice(stackedBefore), [], "normal viewing leaves cached surfaces for the DOM compositor");
	result.layer._compositeLayers = true;
	const captureBefore = result.trace.length;
	drawLabels.call(result.layer, result.frame);
	drawOverlays.call(result.layer, result.frame);
	assert.deepEqual(result.trace.slice(captureBefore), [["composite", "drawImage", "labels", 0, 0], ["composite", "drawImage", "overlays", 0, 0]], "captures retain one complete composited canvas");


	// Optional reference is an archived source file, never a browser/runtime import.
	const baselinePath = process.env.MW_RENDER_BASELINE || "/tmp/mw-renderer-v02735.js";
	if (existsSync(baselinePath)) {
		const source = readFileSync(baselinePath, "utf8");
		const terrainStart = source.search(/if \(renderStatic\) \{\s*if \(\s*fullStaticRefresh &&/);
		assert.ok(terrainStart > 0, "archived terrain block must be present");
		const terrainEnd = blockEnd(source, terrainStart);
		const unitStart = source.indexOf('if (gameState !== "SIMULATING")');
		const labelStart = source.indexOf("const labelsCacheKey =", unitStart);
		const overlayStart = source.indexOf("const overlaysCacheKey =", labelStart);
		const overlayEnd = source.indexOf("mainCtx.drawImage(this._overlaysSurface, 0, 0);", overlayStart) + "mainCtx.drawImage(this._overlaysSurface, 0, 0);".length;
		assert.ok(unitStart > 0 && labelStart > unitStart && overlayStart > labelStart && overlayEnd > overlayStart);
		for (const [draw, start, end] of [[drawTerrain, terrainStart, terrainEnd], [drawUnits, unitStart, labelStart], [drawLabels, labelStart, overlayStart], [drawOverlays, overlayStart, overlayEnd]]) {
			const original = fixture(), split = fixture();
			if (draw === drawTerrain) { original.frame.renderStatic = true; split.frame.renderStatic = true; }
			const block = source.slice(start, end).replace(/mainCtx\.restore\(\);\s*this\._invalidLayers &= ~RENDER_LAYERS\.DYNAMIC;\s*$/, "");
			const legacy = new Function("frame", `let { ${Object.keys(original.frame).join(", ")} } = frame;\n${block}`);
			legacy.call(original.layer, original.frame);
			draw.call(split.layer, split.frame);
			assert.deepEqual(split.trace, original.trace, `${draw.name} must preserve the pre-split canvas commands`);
			assert.equal(split.layer._invalidLayers, original.layer._invalidLayers);
			assert.equal(split.layer._labelsCacheKey, original.layer._labelsCacheKey);
			if (draw === drawOverlays) {
				const key = split.layer._overlaysCacheKey.split(";");
				assert.equal(key[3], "0", "new diagnostics default remains off");
				key.splice(3, 1);
				assert.equal(key.join(";"), original.layer._overlaysCacheKey);
			} else assert.equal(split.layer._overlaysCacheKey, original.layer._overlaysCacheKey);
		}
		console.log("Pre-split terrain, units, labels, and overlays canvas traces match");
	}
} finally { globalThis.window = previousWindow; }

const calls = [];
const image = { naturalWidth: 80, naturalHeight: 40 };
const clipCtx = { globalAlpha: 1, drawImage: (...args) => calls.push(args) };
paintClippedFlag(clipCtx, image, -20, -10, 80, 40, 40, 20);
assert.deepEqual(calls, [[image, 20, 10, 40, 20, 0, 0, 40, 20]]);
assert.equal(clipCtx.globalAlpha, 1);
for (const geometry of [[100, 0, 10, 10], [0, 100, 10, 10], [0, 0, 0, 10], [NaN, 0, 10, 10], [0, 0, Infinity, 10]]) paintClippedFlag(clipCtx, image, ...geometry, 40, 20);
assert.equal(calls.length, 1, "invalid and invisible clips never reach drawImage");

const previousImage = globalThis.Image;
let created = 0, loaded = 0;
globalThis.Image = class {
	constructor() { created++; this.complete = false; this.naturalWidth = 0; }
};
try {
	const countryFlag = { complete: true, naturalWidth: 20 };
	const allianceFlag = { complete: true, naturalWidth: 30 };
	const meta = { flagUrl: "fixture.png", allianceFlagTempFlag: allianceFlag };
	assert.equal(resolveRenderFlag(meta, { flag: countryFlag }, () => {}, true), allianceFlag);
	assert.equal(resolveRenderFlag(meta, { flag: countryFlag }, () => {}, false), countryFlag);
	assert.equal(created, 0);
	assert.equal(resolveRenderFlag(meta, null, () => loaded++), null);
	assert.equal(meta.tempFlag.crossOrigin, "anonymous");
	assert.equal(meta.tempFlag.src, "fixture.png");
	assert.equal(resolveRenderFlag(meta, null, () => loaded++), null);
	assert.equal(created, 1, "only one image request per metadata object");
	meta.tempFlag.complete = true; meta.tempFlag.naturalWidth = 20; meta.tempFlag.onload();
	assert.equal(loaded, 1);
	assert.equal(resolveRenderFlag(meta, null, () => loaded++), meta.tempFlag);
} finally { globalThis.Image = previousImage; }

if (process.env.MW_CANVAS_MODULE) {
	const { createCanvas } = await import(pathToFileURL(process.env.MW_CANVAS_MODULE));
	const flag = createCanvas(80, 40), flagCtx = flag.getContext("2d");
	flagCtx.fillStyle = "#b13c39"; flagCtx.fillRect(0, 0, 40, 40);
	flagCtx.fillStyle = "#e9d58d"; flagCtx.fillRect(40, 0, 40, 40);
	const input = { naturalWidth: 80, naturalHeight: 40 };
	const actual = createCanvas(40, 20), expected = createCanvas(40, 20);
	const actualCtx = actual.getContext("2d");
	paintClippedFlag({ set globalAlpha(value) { actualCtx.globalAlpha = value; }, drawImage: (_image, ...args) => actualCtx.drawImage(flag, ...args) }, input, -20, -10, 80, 40, 40, 20);
	const expectedCtx = expected.getContext("2d");
	expectedCtx.globalAlpha = 0.55; expectedCtx.drawImage(flag, 20, 10, 40, 20, 0, 0, 40, 20);
	assert.deepEqual(actualCtx.getImageData(0, 0, 40, 20).data, expectedCtx.getImageData(0, 0, 40, 20).data);
	console.log("Native flag clipping pixels match");
}
console.log("Render pass and flag smoke checks passed");
