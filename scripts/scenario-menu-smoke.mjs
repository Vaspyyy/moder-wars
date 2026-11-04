import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { COMPILED_SCENARIO_URLS } from "../src/scenario-codec.js";

const source = readFileSync(new URL("../src/scenario-menu.js", import.meta.url), "utf8")
	.replace(/^import .*;\n/gm, "")
	.replaceAll("export ", "");
for (const key of ["modern", "ukraine2023"]) {
	for (const failed of [false, true]) {
		const selector = { style: {} };
		const mainMenu = { style: { display: "flex" } };
		const loadingOverlay = { style: {} };
		let alerts = 0, loads = 0, context;
		const sandbox = vm.createContext({
			document: { getElementById: () => selector },
			gameText: key => key,
			showAlert: () => alerts++,
			COMPILED_SCENARIO_URLS,
			console: { error() {} },
		});
		vm.runInContext(`${source}\nglobalThis.factory = createScenarioHandler;`, sandbox);
		await sandbox.factory(key, {
			primeAudio() {}, setLoadingThematic() {}, initAudio() {}, focusScenario() {},
			loadingStatus: {}, loadingOverlay, mainMenu,
			setContext(value) { context = value; },
			modernFallback() { assert.fail("Dated scenarios must not silently load legacy geography"); },
			async loadPreset(url, mode, options) {
				loads++;
				assert.equal(url, COMPILED_SCENARIO_URLS[key]);
				assert.equal(mode, "CONQUEST");
				assert.equal(options.jsonFallbackUrl, undefined);
				if (failed) throw new Error("Offline");
			},
		})();
		assert.equal(loads, 1);
		assert.equal(alerts, Number(failed));
		if (key === "modern") {
			assert.equal(context.id, "world_map_2026");
			assert.match(context.compiledUrl, /world-map-2026-v3/);
		}
		if (failed) {
			assert.equal(mainMenu.style.display, "flex");
			assert.equal(loadingOverlay.style.display, "none");
			assert.equal(selector.style.opacity, "1", "Failed selection remains available for retry");
			assert.equal(selector.style.transform, "translateX(0)");
		} else assert.equal(mainMenu.style.display, "none");
	}
}
console.log("Dated scenario selection: correct package, no legacy fallback, recoverable failure passed");
