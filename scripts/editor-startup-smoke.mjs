import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "vite";
import { CONFIG } from "../src/config.js";
import { normalizeSavedCells } from "../src/saved-cells.js";
import { decodeScenarioJson } from "../src/scenario-codec.js";
import { generateScenarioSnapshot } from "../src/scenario-export.js";
import {
	applyScenarioSovereigntyOverrides,
	scenarioContextWithHistoricalSource,
} from "../src/scenario-territory.js";
import {
	applyScenarioTheater,
	isInsideScenarioTheater,
} from "../src/scenario-theater.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const editorPath = resolve(root, "src/editor.js");
const ownerPath = resolve(root, "editor-startup-owner.js");
const editorSource = readFileSync(editorPath, "utf8");
const runtimeNames = /import\s*\{([^}]+)\}\s*from "\.\/main\.js"/
	.exec(editorSource)[1]
	.split(",")
	.map((name) => name.trim())
	.filter(Boolean);
const geographyNames = [
	"updateLandMask",
	"loadTerrain",
	"loadCountries",
	"ensureRawGeography",
];
const scenarioNames = [
	"generatePresetData",
	"performPresetLoad",
	"loadScenarioForCountryImportFromBlob",
	"loadScenarioForCountryImportFromUrl",
	"importSingleCountryFromScenario",
];

function loaderFixture(factory, kind, names) {
	return `export function ${factory}(context, session) {
  context.startupProbe.constructions.push("${kind}");
  return Object.fromEntries(${JSON.stringify(names)}.map(name => [name, (...args) => {
    const result = { name, args, generation: ++session.generation, width: context.gridWidth };
    if (name === "performPresetLoad") result.geography = context.loadCountries(...args);
    return result;
  }]));
}`;
}

// Bundle the real editor against an inert owner with the same import cycle.
// Only loader factories are stubbed; the game entry, DOM and rendering never run.
const sources = new Map([
	[
		ownerPath,
		`import * as editorApi from ${JSON.stringify(editorPath)};
export { editorApi };
export const startupProbe = { constructions: [] };
${runtimeNames.map((name) => `export let ${name} = ${name === "gridWidth" ? "4" : "null"};`).join("\n")}
export function replaceGridWidth(value) { gridWidth = value; }`,
	],
	[
		"\0editor-startup-geography",
		loaderFixture("createGeographyLoader", "geography", geographyNames),
	],
	[
		"\0editor-startup-scenario",
		loaderFixture("createScenarioLoader", "scenario", scenarioNames),
	],
]);
const result = await build({
	configFile: false,
	logLevel: "silent",
	plugins: [
		{
			name: "inert-editor-owner",
			enforce: "pre",
			resolveId(id, importer) {
				if (sources.has(id)) return id;
				if (importer !== editorPath) return;
				if (id === "./main.js") return ownerPath;
				if (id === "./geography-loader.js") return "\0editor-startup-geography";
				if (id === "./scenario-loader.js") return "\0editor-startup-scenario";
			},
			load(id) {
				return sources.get(id);
			},
		},
	],
	build: {
		write: false,
		minify: true,
		target: "es2022",
		lib: { entry: ownerPath, formats: ["es"] },
	},
});
const output = (Array.isArray(result) ? result[0] : result).output;
assert.equal(output.length, 1, "startup fixture must be self contained");
const owner = await import(
	`data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`
).catch((error) => {
	throw new Error(`Bundled editor startup failed: ${error.message}`);
});
assert.deepEqual(
	owner.startupProbe.constructions,
	[],
	"defer loader construction",
);
const first = owner.editorApi.loadCountries("first", true);
assert.equal(first.width, 4);
assert.deepEqual(first.args, ["first", true]);
assert.equal(first.generation, 1);
assert.deepEqual(owner.startupProbe.constructions, ["geography", "scenario"]);
owner.replaceGridWidth(8);
const second = owner.editorApi.performPresetLoad("second", "EDITOR", {
	test: true,
});
assert.equal(second.width, 8, "loaders must read replaced owner state");
assert.deepEqual(second.args, ["second", "EDITOR", { test: true }]);
assert.equal(second.generation, 2);
assert.equal(second.geography.generation, 3, "both loaders share one session");
assert.equal(second.geography.width, 8);
assert.deepEqual(owner.startupProbe.constructions, ["geography", "scenario"]);
for (const name of [...geographyNames, ...scenarioNames]) {
	assert.equal(
		owner.editorApi[name](name).name,
		name,
		`${name} forwards its call`,
	);
}

// Exercise the actual loader body, including cold load and provenance writes.
// The editor inherits read-only owner bindings; only explicit commands can
// change them. The startup delegation stubs above cannot expose this boundary.
const scenarioSource = readFileSync(
	resolve(root, "src/scenario-loader.js"),
	"utf8",
)
	.replace(/import\s[\s\S]*?from\s"[^"]+";/g, "")
	.replace(
		"export function createScenarioLoader",
		"function createScenarioLoader",
	);
const historicalSource = {
	name: "DeepStateMap.live",
	url: "https://deepstatemap.live/",
	date: "2023-01-01",
};
const scenarioData = {
	name: "Ukraine 2023",
	gridRes: 90,
	metadata: [
		{ id: 167, name: "Ukraine" },
		{ id: 136, name: "Russia" },
	],
	mapData: [
		[0, 136],
		[1, 167],
	],
	cities: [],
	isCustomTerrain: true,
	sovereigntyBase: "control",
	sovereigntyOverrides: [{ ownerId: 167, cells: [0] }],
	historicalSource,
};
const factory = vm.runInNewContext(
	`"use strict";\n${scenarioSource}\ncreateScenarioLoader`,
	{
		CONFIG,
		Uint16Array,
		Uint8Array,
		Int32Array,
		URL,
		console,
		setTimeout,
		normalizeSavedCells,
		generateScenarioSnapshot,
		applyScenarioSovereigntyOverrides,
		applyScenarioTheater,
		isInsideScenarioTheater,
		scenarioContextWithHistoricalSource,
		loadScenario: async () => ({
			...decodeScenarioJson(scenarioData),
			format: "mwsc",
			timing: {},
		}),
		gameText: (key) => key,
		showAlert: (message) => {
			throw new Error(message);
		},
		beginLoadTrace: () => ({
			mark() {},
			fail() {},
			finish: () => ({ status: "complete" }),
		}),
		document: {
			getElementById: (id) =>
				id === "menu-scenario-selector"
					? null
					: { value: id === "grid-res-select" ? "90" : "110m" },
		},
	},
);
let currentScenarioContext = null;
let contextWrites = 0;
const readonlyOwner = Object.freeze({
	get currentScenarioContext() {
		return currentScenarioContext;
	},
	setCurrentScenarioContext(value) {
		contextWrites++;
		currentScenarioContext = value;
	},
});
const context = Object.create(readonlyOwner);
assert.throws(() => {
	context.currentScenarioContext = {};
}, TypeError);
Object.assign(context, {
	worldControlMap: new Uint16Array(8),
	deJureMap: new Uint16Array(8),
	landMask: new Uint8Array(8),
	occupationMap: new Uint8Array(8),
	primaryOccupierMap: new Uint16Array(8),
	provinceMap: new Int32Array(8),
	biomeMask: new Uint8Array(8),
	terrainMask: new Float32Array(8),
	gridWidth: 4,
	gridHeight: 2,
	countryMetadata: [],
	cities: [],
	getCookie: () => "en",
	getTranslation: (name) => name,
	parseColorToRGBA: () => [0, 0, 0, 1],
	deepClone: structuredClone,
	influenceLayer: { render() {} },
	scheduleIdleLoad: (callback) => callback(),
});
for (const property of [
	"loadingOverlay",
	"loadingStatus",
	"loadingBar",
	"mainMenu",
	"mapUi",
	"statusText",
	"setupPanel",
	"editorToolbox",
	"godModeBtn",
	"resetBtn",
	"statsPanel",
	"editorUpdateBtn",
])
	context[property] = { style: {} };
for (const name of [
	"initializeEngine",
	"resetConflictSetupState",
	"applyWorldBounds",
	"resetSideInfluenceMaps",
	"notifyPoliticalMapLoaded",
	"generateProvinces",
	"updateRestartVisibility",
	"computeCountryUrbanPop",
	"recalculateAllBounds",
])
	context[name] = () => {};
for (const property of [
	"MissilesEnabled",
	"BombsDisabled",
	"CustomSatelliteUrl",
	"CustomSatelliteImg",
	"ReferenceImageUrl",
	"ReferenceOverlay",
	"RefOpacity",
	"RefScale",
	"RefAboveTerrain",
	"RawGeoJsonData",
	"CountryMetadata",
	"IsCustomTerrain",
	"AdjacencyCache",
	"Cities",
	"GameMode",
	"GameState",
	"InitialWorldControlMapSnapshot",
	"InitialDeJureMapSnapshot",
	"InitialProvinceMapSnapshot",
	"InitialLandMaskSnapshot",
	"InitialCountryMetadataSnapshot",
	"InitialCitiesSnapshot",
]) {
	context[`set${property}`] = (value) => {
		context[property[0].toLowerCase() + property.slice(1)] = value;
	};
}
const previousGridRes = CONFIG.GRID_RES;
CONFIG.GRID_RES = 90;
try {
	const loaders = factory(context, { generation: 0 });
	const coldLoad = await loaders.performPresetLoad(
		"fixture.mwsc.gz",
		"CONQUEST",
	);
	assert.equal(
		coldLoad.status,
		"complete",
		"cold load reaches the end of the real loader",
	);
	assert.equal(contextWrites, 1, "provenance uses the explicit owner command");
	assert.equal(Object.hasOwn(context, "currentScenarioContext"), false);
	assert.deepEqual(
		context.currentScenarioContext.historicalSource,
		historicalSource,
	);
	assert.equal(context.worldControlMap[0], 136);
	assert.equal(context.deJureMap[0], 167);
	assert.equal(context.initialDeJureMapSnapshot[0], 167);
	assert.deepEqual(
		loaders.generatePresetData("Edited").historicalSource,
		historicalSource,
	);
	const unrelated = { ...scenarioData, name: "Unrelated scenario" };
	delete unrelated.historicalSource;
	const jsonLoad = await loaders.performPresetLoad(
		new Blob([JSON.stringify(unrelated)]),
		"EDITOR",
	);
	assert.equal(
		jsonLoad.status,
		"complete",
		"JSON import also reaches the end of the real loader",
	);
	assert.equal(contextWrites, 2);
	const theater = {
		id: "fixture",
		bounds: [-180, -90, -90, 0],
		countryIds: [136, 167],
		countryCodes: ["UKR", "RUS"],
	};
	scenarioData.theater = theater;
	scenarioData.useScenarioLand = true;
	const scopedLoad = await loaders.performPresetLoad(
		"fixture.mwsc.gz",
		"CONQUEST",
	);
	assert.equal(scopedLoad.status, "complete");
	assert.equal(
		context.worldControlMap[1],
		0,
		"theater masks control outside bounds",
	);
	assert.equal(context.landMask[1], 0);
	assert.equal(
		context.initialLandMaskSnapshot[1],
		0,
		"restart snapshot retains land mask",
	);
	assert.equal(context.initialWorldControlMapSnapshot[1], 0);
	assert.deepEqual(context.currentScenarioContext.theater, theater);
	const exported = loaders.generatePresetData("Theater export");
	assert.deepEqual(exported.theater, theater);
	assert.equal(exported.useScenarioLand, true);
	delete scenarioData.theater;
	delete scenarioData.useScenarioLand;
	await loaders.performPresetLoad(
		new Blob([JSON.stringify(unrelated)]),
		"EDITOR",
	);
	assert.equal(
		context.currentScenarioContext.theater,
		undefined,
		"later world load clears theater",
	);
	assert.equal(context.currentScenarioContext.useScenarioLand, undefined);

	assert.equal(
		Object.hasOwn(context.currentScenarioContext, "historicalSource"),
		false,
	);
	assert.equal(Object.hasOwn(context, "currentScenarioContext"), false);
	assert.equal(
		loaders.generatePresetData("Unrelated").historicalSource,
		undefined,
	);
} finally {
	CONFIG.GRID_RES = previousGridRes;
}
console.log(
	"Bundled editor startup, live delegation and real cold-load provenance writes passed; no game entry.",
);
