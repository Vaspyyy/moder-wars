import assert from "node:assert/strict";

import { getFormationStrengthBadge } from "../src/formation-strength.js";
import {
	getUnitFlagSprite,
	invalidateUnitFlagSprites,
	isRenderFlagReady,
} from "../src/render-flags.js";
import { drawUnits } from "../src/render-units.js";

function createSurfaceFactory(created) {
	return () => {
		const calls = [];
		const context = {
			calls,
			setTransform: (...args) => calls.push(["setTransform", ...args]),
			scale: (...args) => calls.push(["scale", ...args]),
			drawImage: (...args) => calls.push(["drawImage", ...args]),
			strokeRect: (...args) => calls.push(["strokeRect", ...args]),
		};
		const surface = {
			width: 0,
			height: 0,
			calls,
			getContext: () => context,
		};
		created.push(surface);
		return surface;
	};
}

const spriteLayer = {};
const spriteSources = [];
const createSpriteSurface = createSurfaceFactory(spriteSources);
const flag = { complete: true, naturalWidth: 80, naturalHeight: 40, src: "flag-a" };
const firstSprite = getUnitFlagSprite(
	spriteLayer,
	flag,
	14,
	9,
	1,
	createSpriteSurface,
);
assert.ok(firstSprite);
assert.strictEqual(
	getUnitFlagSprite(spriteLayer, flag, 14, 9, 1, createSpriteSurface),
	firstSprite,
	"the same source and marker dimensions reuse the sprite",
);
assert.equal(spriteSources.length, 1);
const bakedBorder = firstSprite.surface.calls.find(([name]) => name === "strokeRect");
assert.ok(bakedBorder);
assert.ok(bakedBorder[1] > 0 && bakedBorder[2] > 0, "sprite gutter keeps the full border inside its canvas");
assert.equal(bakedBorder[3], 14);
assert.equal(bakedBorder[4], 9);

assert.notStrictEqual(
	getUnitFlagSprite(spriteLayer, flag, 14.25, 9.16, 1, createSpriteSurface),
	firstSprite,
	"fractional zoom dimensions get their own correctly sized sprite",
);
assert.notStrictEqual(
	getUnitFlagSprite(spriteLayer, flag, 14, 9, 2, createSpriteSurface),
	firstSprite,
	"a DPR change gets a pixel-density-specific sprite",
);
const otherFlag = { complete: true, naturalWidth: 80, naturalHeight: 40, src: "flag-b" };
assert.notStrictEqual(
	getUnitFlagSprite(spriteLayer, otherFlag, 14, 9, 1, createSpriteSurface),
	firstSprite,
	"a new image identity never reuses another flag's pixels",
);
const versionedFlag = {
	complete: true,
	naturalWidth: 80,
	naturalHeight: 40,
	renderVersion: 1,
};
const versionOne = getUnitFlagSprite(
	spriteLayer,
	versionedFlag,
	14,
	9,
	1,
	createSpriteSurface,
);
versionedFlag.renderVersion++;
assert.notStrictEqual(
	getUnitFlagSprite(spriteLayer, versionedFlag, 14, 9, 1, createSpriteSurface),
	versionOne,
	"an explicit source version change cannot reuse stale pixels",
);

const editedCanvasFlag = { width: 80, height: 40 };
assert.ok(isRenderFlagReady(editedCanvasFlag), "canvas flags are valid sources without an Image.complete property");
const editedBefore = getUnitFlagSprite(
	spriteLayer,
	editedCanvasFlag,
	14,
	9,
	1,
	createSpriteSurface,
);
assert.equal(invalidateUnitFlagSprites(spriteLayer, editedCanvasFlag), 1);
const editedAfter = getUnitFlagSprite(
	spriteLayer,
	editedCanvasFlag,
	14,
	9,
	1,
	createSpriteSurface,
);
assert.notStrictEqual(editedAfter, editedBefore, "an in-place canvas edit can invalidate its old sprite");
assert.ok(invalidateUnitFlagSprites(spriteLayer) > 0);
assert.equal(spriteLayer._unitFlagSpriteCache.entries.size, 0, "full invalidation drops all cached sprites");

const loadingImage = { complete: false, naturalWidth: 0, naturalHeight: 0 };
const createdBeforeLoad = spriteSources.length;
assert.equal(
	getUnitFlagSprite(spriteLayer, loadingImage, 14, 9, 1, createSpriteSurface),
	null,
	"incomplete images use the caller's fallback marker",
);
assert.equal(spriteSources.length, createdBeforeLoad, "loading sources do not allocate blank sprites");
loadingImage.complete = true;
loadingImage.naturalWidth = 80;
loadingImage.naturalHeight = 40;
assert.ok(getUnitFlagSprite(spriteLayer, loadingImage, 14, 9, 1, createSpriteSurface));

for (let index = 0; index < 300; index++)
	getUnitFlagSprite(
		spriteLayer,
		flag,
		10 + index / 1000,
		5,
		1,
		createSpriteSurface,
	);
assert.ok(
	spriteLayer._unitFlagSpriteCache.entries.size <= 256,
	"fractional zoom churn remains bounded",
);
assert.ok(spriteLayer._unitFlagSpriteCache.pixels <= 4_000_000);

function makeDrawContext(calls) {
	return new Proxy({}, {
		get(_target, key) {
			if (key === "drawImage") return (...args) => calls.push(args);
			if (key === "measureText") return (text) => ({ width: String(text).length * 5 });
			if (key === "createRadialGradient")
				return () => ({ addColorStop() {} });
			return () => {};
		},
		set(_target, _key, _value) {
			return true;
		},
	});
}

const variableUnit = {
	id: 0.1,
	lat: 0,
	lng: 0,
	sovereignId: 1,
	sideIndex: 0,
	health: 100,
	maxHealth: 100,
	personnel: 2500,
};
const ordinaryUnit = {
	id: 0.2,
	lat: 0.1,
	lng: 0.1,
	sovereignId: 1,
	sideIndex: 0,
	health: 100,
	maxHealth: 100,
};
const unitBucket = [variableUnit, ordinaryUnit];
const bounds = {
	pad() { return this; },
	getWest: () => -1,
	getEast: () => 1,
	getSouth: () => -1,
	getNorth: () => 1,
};
const mainDrawCalls = [];
const unitSurfaces = [];
const countryFlag = { complete: true, naturalWidth: 80, naturalHeight: 40, src: "country" };
const allianceFlag = { complete: true, naturalWidth: 60, naturalHeight: 30, src: "alliance" };
const pendingFlag = {
	complete: false,
	naturalWidth: 0,
	naturalHeight: 0,
	src: "pending",
	onload: null,
};
const countryMetadata = [
	{ id: 1, tempFlag: countryFlag },
	{ id: 2, allianceFlagTempFlag: allianceFlag },
];
let badgeCalls = 0;
let paintedBadgeTexts = [];
let requestedRenders = 0;
let zoom = 6;
const frame = {
	ctx: makeDrawContext(mainDrawCalls),
	gameState: "SIMULATING",
	isAtlas: false,
	viewBounds: bounds,
	explosions: [],
	bombs: [],
	isWar: true,
	map: { getZoom: () => zoom },
	showNonCapitalCities: true,
	cities: [],
	activeTheaterCities: [],
	showUnitsVisually: true,
	showBattleIndicators: false,
	editingCountryId: -1,
	sides: [[{ id: 1 }], []],
	yMin: 0,
	yMax: 0,
	xMin: 0,
	xMax: 0,
	gridWidth: 1,
	worldControlMap: new Uint16Array(1),
	getGridPoint: (x, y) => ({ x, y }),
	sideColors: ["rgba(200, 40, 30, 0.5)"],
	rgbaRe: /[\d.]+\)$/,
	countryMetadata,
	project: (lat, lng) => ({ x: 100 + lng, y: 100 - lat }),
	bases: [],
	getGridIndex: () => -1,
	dominantSideMap: new Int8Array(1),
	occupationMap: new Float32Array(1),
	sideInfluenceMaps: [],
	UNIT_HASH_CELL_SIZE: 10,
	unitSpatialHash: new Map([[1809, unitBucket]]),
	CONFIG: {
		UNIT_HEALTH: 100,
		UNIT_TO_SOLDIER_RATIO: 1000,
		ALPEN_HEALTH_MULT: 1.5,
	},
	allianceViewEnabled: false,
	allianceKeyById: new Int32Array([0, 2, 2]),
	soldiersPerUnit: [1000],
	getFormationStrengthBadge(unit, options) {
		badgeCalls++;
		return getFormationStrengthBadge(unit, options);
	},
	drawFormationStrengthBadge(_ctx, _point, _width, badge) {
		paintedBadgeTexts.push(badge.text);
	},
	activeBattles: [],
	simFrameCount: 0,
	dpr: 1,
	createSurface: createSurfaceFactory(unitSurfaces),
	onFlagLoad: () => requestedRenders++,
};
const unitLayer = {};
const paint = () => drawUnits.call(unitLayer, frame);

paint();
assert.equal(unitSurfaces.length, 1, "units with the same flag share one presized sprite");
assert.equal(
	mainDrawCalls.filter(([image]) => image === unitSurfaces[0]).length,
	2,
	"each unit composites the cached sprite",
);
const firstSpriteDraw = mainDrawCalls.find(([image]) => image === unitSurfaces[0]);
assert.equal(firstSpriteDraw.length, 5);
assert.equal(
	firstSpriteDraw[3] * frame.dpr,
	unitSurfaces[0].width,
	"the DPR-scaled sprite destination maps to the same device-pixel width",
);
assert.equal(badgeCalls, 1);
paint();
assert.equal(unitSurfaces.length, 1, "a repeated paint reuses the flag sprite");
assert.equal(badgeCalls, 1, "a repeated paint reuses the computed personnel badge");

zoom = 7;
paint();
assert.equal(unitSurfaces.length, 2, "a zoom change builds the requested marker size");
frame.dpr = 2;
paint();
assert.equal(unitSurfaces.length, 3, "a DPR change rebuilds the sprite at its new pixel density");

variableUnit.personnel = 3500;
paint();
assert.equal(badgeCalls, 2, "personnel changes invalidate the strength badge");
delete variableUnit.personnel;
variableUnit.health = 200;
paint();
assert.equal(badgeCalls, 3, "health-derived strength computes a fresh badge");
variableUnit.health = 250;
paint();
assert.equal(badgeCalls, 4, "health changes invalidate a health-derived badge");
frame.CONFIG.UNIT_TO_SOLDIER_RATIO = 2000;
paint();
assert.equal(badgeCalls, 5, "reference personnel changes invalidate badge strength and text");
assert.ok(paintedBadgeTexts.includes("2.5×"));
const badgeDrawCount = paintedBadgeTexts.length;
variableUnit.personnel = 1100;
paint();
assert.equal(badgeCalls, 6);
assert.equal(paintedBadgeTexts.length, badgeDrawCount, "standard strength remains below the existing display threshold");
variableUnit.personnel = 2400;
paint();
assert.equal(badgeCalls, 7);
assert.equal(paintedBadgeTexts.length, badgeDrawCount + 1, "reinforced strength remains visible");

countryMetadata[0].tempFlag = pendingFlag;
const surfacesBeforeLoad = unitSurfaces.length;
paint();
assert.equal(unitSurfaces.length, surfacesBeforeLoad, "pending flags keep the colored fallback");
assert.equal(requestedRenders, 0);
pendingFlag.complete = true;
pendingFlag.naturalWidth = 80;
pendingFlag.naturalHeight = 40;
pendingFlag.onload();
assert.equal(requestedRenders, 1, "an asynchronous flag load requests a new paint");
paint();
assert.equal(unitSurfaces.length, surfacesBeforeLoad + 1, "the loaded flag receives a cached sprite");

const liveCanvasFlag = { width: 80, height: 40 };
countryMetadata[0].tempFlag = liveCanvasFlag;
paint();
assert.ok(
	[...unitLayer._unitFlagSpriteCache.entries.values()].some(
		(entry) => entry.source === liveCanvasFlag,
	),
	"canvas-backed country flags render and use the sprite cache",
);

frame.allianceViewEnabled = true;
paint();
assert.ok(
	[...unitLayer._unitFlagSpriteCache.entries.values()].some(
		(entry) => entry.source === allianceFlag,
	),
	"alliance view resolves and caches the alliance flag source",
);
frame.allianceViewEnabled = false;
paint();
assert.ok(
	[...unitLayer._unitFlagSpriteCache.entries.values()].some(
		(entry) => entry.source === liveCanvasFlag,
	),
	"switching back resolves the country's current flag source",
);

assert.ok(unitLayer._unitStrengthBadgeCache instanceof WeakMap);
const badgeCallsBeforeRemoval = badgeCalls;
unitBucket.splice(unitBucket.indexOf(variableUnit), 1);
paint();
assert.equal(badgeCalls, badgeCallsBeforeRemoval, "removed units no longer participate in badge lookup");

// The merged GPU path shares main's flag resolution and load notification but
// leaves presized Canvas sprites to the fallback renderer.
const markers = [];
const gpuLayer = { _gpu: { active: true, beginMarkers() {}, endMarkers() {}, marker(unit, source) { markers.push([unit.id, source]); return true; } } };
const gpuSurfaceCount = unitSurfaces.length;
const gpuDrawCount = mainDrawCalls.length;
drawUnits.call(gpuLayer, frame);
assert.deepEqual(markers, [[ordinaryUnit.id, liveCanvasFlag]]);
assert.equal(unitSurfaces.length, gpuSurfaceCount, "GPU flags do not also build Canvas sprites");
assert.equal(mainDrawCalls.length, gpuDrawCount, "GPU markers do not also paint fallback flags");
gpuLayer._gpu.active = false;
gpuLayer._gpu.marker = () => false;
drawUnits.call(gpuLayer, frame);
assert.equal(unitSurfaces.length, gpuSurfaceCount + 1, "Canvas fallback retains the new sprite cache");

console.log("Unit sprite and badge cache smoke checks passed");
