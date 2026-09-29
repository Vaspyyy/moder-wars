import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = main.indexOf("export function checkAutoLaunch()");
const end = main.indexOf("// Settings Tab Logic", start);
const boot = main.slice(start, end).replace("export function", "function");
for (const remember of [false, true]) {
	const elements = new Map();
	const element = (id) => {
		if (!elements.has(id)) elements.set(id, { style: {}, checked: false, value: "" });
		return elements.get(id);
	};
	let initialized = 0;
	const context = vm.createContext({
		getCookie: (key) => key === "mw_skip_settings" ? String(remember) : null,
		document: { getElementById: element, body: { classList: { add() {}, remove() {} } } },
		initializeEngine: () => { initialized++; },
		settingsOverlay: element("settings"), mainMenu: element("menu"), launchBtn: element("launch"),
		mapResSelect: element("map"), gridResSelect: element("grid"), unitLimitSelect: element("units"),
		setupDisableMountainsCheckbox: element("mountains"), disableCountryGradientCheckbox: element("gradient"),
		disableInvisibleBuffsCheckbox: element("buffs"), disableAutoFullscreenCheckbox: null,
		useSystemFontCheckbox: element("font"), saveSkipCheckbox: element("remember"),
	});
	vm.runInContext(boot, context);
	context.checkAutoLaunch();
	assert.equal(initialized, 1);
	assert.equal(context.settingsOverlay.style.display, "none", "first launch must not require settings");
	assert.equal(context.mainMenu.style.display, "flex");
	assert.equal(context.gameState, "MAIN_MENU");
}
assert.equal((main.match(/requestFullscreen\(/g) || []).length, 1, "only the explicit fullscreen action requests fullscreen");
const clickHandler = main.slice(main.indexOf('// Global click listener'), main.indexOf('export let', main.indexOf('// Global click listener')));
assert.doesNotMatch(clickHandler, /requestFullscreen/);
assert.doesNotMatch(main, /addEventListener\("dblclick"/);
assert.ok(!html.includes('id="war-desk-overview-tab"'));
assert.ok(main.includes('<details class="country-configuration">'));
assert.ok(main.includes('expandedCountries.has('), "keep Configure expanded while editing country options");
const menuStart = html.indexOf('id="hud-menu"');
const menuEnd = html.indexOf('</details>', menuStart);
for (const id of ['quick-restart-btn', 'restart-scenario-btn', 'god-mode-btn', 'ingame-settings-btn', 'main-menu-btn']) {
	assert.ok(html.slice(menuStart, menuEnd).includes(`id="${id}"`), `${id} belongs in the utility menu`);
}
console.log("UI modernization smoke tests passed");
