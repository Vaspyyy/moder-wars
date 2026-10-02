// Run with: node --experimental-vm-modules scripts/module-graph-smoke.mjs
// Parses and links application modules without evaluating browser or game code.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

assert.equal(typeof vm.SourceTextModule, "function", "Run Node with --experimental-vm-modules");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const context = vm.createContext({});
const modules = new Map();
const sources = new Map();
const externals = new Map(["jszip"].map((name) => [name,
	new vm.SyntheticModule(["default"], function () { this.setExport("default", {}); }, { context, identifier: name }),
]));
for (const name of ["pixi.js", "pixi.js/unsafe-eval"]) {
 const names = name === "pixi.js" ? ["Container", "FillGradient", "Graphics", "Sprite", "Texture", "WebGLRenderer"] : [];
 externals.set(name, new vm.SyntheticModule(names, function () { for (const key of names) this.setExport(key, {}); }, {context,identifier:name}));
}
for (const directory of ["src", "workers"]) {
for (const name of readdirSync(join(root, directory)).filter((name) => /\.(?:js|ts)$/.test(name))) {
	const path = join(root, directory, name);
	const raw = readFileSync(path, "utf8");
	const source = path.endsWith(".ts") ? ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText : raw;
	sources.set(path, source);
	modules.set(path, new vm.SourceTextModule(source, { context, identifier: path }));
}
}
function resolveDependency(specifier, importer) {
	if (!specifier.startsWith(".")) {
		assert.ok(externals.has(specifier), `Unexpected static external module: ${specifier}`);
		return externals.get(specifier);
	}
	const path = resolve(dirname(importer.identifier), specifier);
	assert.ok(modules.has(path), `Missing module ${specifier} imported by ${importer.identifier}`);
	return modules.get(path);
}
// Sequential root linking lets VM own cycles; cached modules are never evaluated.
for (const module of modules.values()) {
	if (module.status === "unlinked") await module.link(resolveDependency);
	assert.equal(module.status, "linked", `${module.identifier} should link without evaluation`);
}
const workerSource = readFileSync(join(root, "workers/service-worker.js"), "utf8");
const shellMatch = /const APP_SHELL_PATHS\s*=\s*(\[[\s\S]*?\]);/.exec(workerSource);
assert.ok(shellMatch, "Service worker must declare its static application shell");
const shell = new Set(vm.runInNewContext(shellMatch[1], {}, { timeout: 1000 }));
const reachable = new Set();
function visit(path) {
	if (reachable.has(path)) return;
	reachable.add(path);
	const module = modules.get(path);
	assert.ok(module, `Missing reachable module ${path}`);
	const relative = path.slice(root.length + 1);
	if (relative !== "workers/service-worker.js") {
		assert.ok(shell.has(relative), `Offline application shell is missing ${relative}`);
	}
	for (const specifier of module.dependencySpecifiers) {
		if (specifier.startsWith(".")) visit(resolve(dirname(path), specifier));
	}
	// VM linking checks static imports. Literal lazy imports also need cached files.
	for (const match of sources.get(path).matchAll(/\bimport\s*\(\s*(["'])(\.\.?\/[^"']+)\1\s*\)/g)) {
		visit(resolve(dirname(path), match[2]));
	}
}
visit(join(root, "src/entry.js"));
visit(join(root, "src/bootstrap.js"));
for (const path of modules.keys()) if (path.startsWith(join(root, "workers") + "/")) visit(path);
for (const path of shell) assert.ok(existsSync(join(root, path)), `Stale application shell entry: ${path}`);
const index = readFileSync(join(root, "index.html"), "utf8");
assert.doesNotMatch(index, /commander|operation-modal|operation-select/i, "Retired Commander menu must stay removed");
assert.doesNotMatch(readFileSync(join(root, "src/config.js"), "utf8"), /COMMANDER|OPERATION_DEFINITIONS/);
for (const [path, source] of sources) {
	assert.doesNotMatch(source, /\bCOMMANDER_STANCES\b|\bOPERATION_DEFINITIONS\b|gameMode\s*===?\s*["']OPERATION["']/, `Retired Commander runtime remains in ${path}`);
}
assert.equal(existsSync(join(root, "src/operations.js")), false, "Retired operation module must stay removed");
const cachedCount = [...reachable].filter((path) => shell.has(path.slice(root.length + 1))).length;
console.log(`Module graph smoke passed: ${modules.size} linked modules, ${cachedCount} cached reachable modules; no application evaluation`);
