import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

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
console.log(
	"Bundled editor startup and live loader delegation passed; no game entry.",
);
