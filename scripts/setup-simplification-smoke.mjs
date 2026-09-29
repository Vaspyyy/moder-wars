import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const id of ["experiment-seed-input", "randomize-seed-btn", "force-mode-select", "advanced-sides-ai", "advanced-simulation-systems", "war-economy-checkbox", "armor-enabled-checkbox", "air-power-enabled-checkbox", "rebellion-btn"]) {
	assert.ok(!html.includes(`id="${id}"`), `${id} removed`);
}
assert.ok(html.indexOf('id="add-side-btn"') < html.indexOf('id="ffa-toggle-btn"'));
assert.ok(html.indexOf('id="ffa-toggle-btn"') < html.indexOf('id="sides-container"'));
for (const flag of ["warEconomyEnabled", "armorEnabled", "airPowerEnabled"]) {
	assert.match(main, new RegExp(`export let ${flag} = false;`));
}
const functionBody = (name, next) => main.slice(main.indexOf(`function ${name}(`), main.indexOf(next, main.indexOf(`function ${name}(`)));
let seed = "";
let storedSeed;
const context = vm.createContext({
	document: { getElementById: () => null },
	_experimentUi: { getSetupValues: () => ({ seed }), setSetupSeed: (value) => { seed = String(value); } },
	createRandomSeed: () => 12345,
	normalizeSeed: (value) => Number(value),
	setExperimentSeed: (value) => { storedSeed = value; },
});
vm.runInContext(functionBody("readExperimentSeedFromSetup", "function captureExperimentOptions"), context);
assert.equal(context.readExperimentSeedFromSetup(), 12345, "fresh seed without visible field");
seed = "0";
assert.equal(context.readExperimentSeedFromSetup(), 0, "zero is a valid repeat seed");
seed = "98765";
assert.equal(context.readExperimentSeedFromSetup(), 98765, "preserve rematch seed internally");
assert.equal(storedSeed, 98765);
assert.doesNotMatch(functionBody("prepareExperimentSetupForStart", "export function getAiObserverSnapshot"), /applyExperimentForceMode/, "do not clear manual manpower");
context.warEconomyEnabled = false;
context.armorEnabled = false;
context.airPowerEnabled = false;
vm.runInContext(functionBody("runWarEconomyCycle", "window.economyDebugReport"), context);
assert.doesNotThrow(() => context.runWarEconomyCycle(true), "disabled systems skip forced maintenance too");
console.log("Simplified setup smoke tests passed");
