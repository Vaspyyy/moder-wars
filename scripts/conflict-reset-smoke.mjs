import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/conflict-reset.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace("export function createConflictReset", "function createConflictReset");
const alerts = [];
const sandbox = vm.createContext({
    gameText: (key, values) => ({key, ...values}),
    showAlert: value => alerts.push(value),
    cancelAnimationFrame() {},
    console: {error() {}},
    fetch: async () => { throw new Error("Offline"); },
});
vm.runInContext(`${source}\nglobalThis.factory = createConflictReset;`, sandbox);

for (const scenario of [
    {name: "Ukraine 2023", theater: {id: "eurasia"}, blobUrl: "ukraine.mwsc.gz", compiledUrl: "ukraine.mwsc.gz"},
    {name: "Modern 2026", useScenarioLand: true, blobUrl: "modern.mwsc.gz", compiledUrl: "modern.mwsc.gz"},
    {name: "Imported theater", theater: {id: "eurasia"}},
    {name: "Remote JSON", useScenarioLand: true, blobUrl: "map.json"},
]) {
    let geographyReloads = 0;
    const runtime = {
        currentScenarioContext: scenario,
        gameState: "SIMULATING",
        isPaused: false,
        worldControlMap: Uint16Array.of(167, 136, 0),
        landMask: Uint8Array.of(1, 1, 0),
        loadingOverlay: {style: {display: "flex"}},
        loadingStatus: {},
        invalidateWarLifecycleTimers() {},
        togglePause() { this.isPaused = true; },
        performPresetLoad: async () => { throw new Error("Offline"); },
        loadCountries() { geographyReloads++; },
    };
    const beforeAlerts = alerts.length;
    await sandbox.factory(runtime).resetGame();
    assert.deepEqual([...runtime.worldControlMap], [167, 136, 0]);
    assert.deepEqual([...runtime.landMask], [1, 1, 0]);
    assert.equal(geographyReloads, 0, `${scenario.name}: never replace a scoped map with global geography`);
    assert.equal(runtime.isPaused, true, `${scenario.name}: failed restart pauses the simulation`);
    assert.equal(runtime.loadingOverlay.style.display, "none");
    assert.equal(alerts.length, beforeAlerts + 1);
    assert.equal(alerts.at(-1).key, "GAME_LOAD_SCENARIO_FAILED");
    assert.equal(alerts.at(-1).name, scenario.name);
}
let loads = 0;
const successful = {
    currentScenarioContext: {name: "Ukraine", theater: {id: "eurasia"}, blobUrl: "ukraine.mwsc.gz", compiledUrl: "ukraine.mwsc.gz"},
    loadingOverlay: {style: {}}, loadingStatus: {},
    invalidateWarLifecycleTimers() {},
    async performPresetLoad(url) { assert.equal(url, "ukraine.mwsc.gz"); loads++; },
};
const beforeAlerts = alerts.length;
await sandbox.factory(successful).resetGame();
assert.equal(loads, 1);
assert.equal(alerts.length, beforeAlerts);
console.log("Scoped scenario restart: failed network/import resets preserve territory, pause safely, and never restore legacy global geography; successful reload remains available");
