import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {createConflictSetup} from "../src/conflict-setup.js";
import {createMenuControls} from "../src/menu-controls.js";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const button = { setAttribute(name, value) { this[name] = value; } };
const note = { hidden: true };
const sides = [[{ id: 1 }, { id: 2 }], []];
const context = vm.createContext({
	ffaMode: false,
	ffaToggleBtn: button,
	addSideBtn: {},
	updateSidesUI: () => context.updateFfaSetupUi(),
	setupPanel: { classList: { toggle() {} } },
	document: { getElementById: () => note },
	getTranslation: () => "FFA",
	sides,
	activeSideIndex: 0,
	MAX_SIDES: 2,
	statusText: {},
});
globalThis.document = context.document;
const setup = createConflictSetup(context);
context.updateFfaSetupUi = setup.updateFfaSetupUi;
createMenuControls(context).bindFfaToggleBtnClick();
button.onclick();
assert.equal(context.ffaMode, true);
assert.equal(button["aria-pressed"], "true");
assert.equal(button.textContent, "FFA: ON");
assert.equal(note.hidden, false);
assert.equal(context.sides, sides, "toggling must preserve side arrays and country selections");
assert.equal(context.activeSideIndex, 0);
button.onclick();
assert.equal(button["aria-pressed"], "false");
assert.equal(button.textContent, "FFA: OFF");
assert.equal(note.hidden, true);
assert.equal(context.sides, sides);
const selectionStart = main.indexOf("\tif (ffaMode) {\n\t\t// New FFA participants");
const selectionEnd = main.indexOf("\tconst targetList", selectionStart);
assert.ok(selectionStart >= 0 && selectionEnd > selectionStart, "FFA selection branch must exist");
vm.runInContext(`function selectFfaSide() { ${main.slice(selectionStart, selectionEnd)} }`, context);
context.ffaMode = true;
context.selectFfaSide();
assert.equal(context.activeSideIndex, 1, "reuse an empty side even at the side limit");
assert.equal(sides.length, 2);
sides[1].push({ id: 3 });
context.selectFfaSide();
assert.equal(sides.length, 2, "never exceed the side limit");
assert.match(context.statusText.textContent, /Maximum 2 sides/);
// Exercise the real setup renderer without loading or playing the game.
class Node {
	constructor() { this.children = []; this.style = {}; this.dataset = {}; }
	append(...nodes) { this.children.push(...nodes); }
	appendChild(node) { this.children.push(node); }
	set innerHTML(value) { this.html = value; this.children = []; }
	querySelectorAll() { return []; }
	querySelector(selector) {
		if ([".buff-toggle-btn", ".add-allies-btn", ".release-btn"].includes(selector)) return null;
		return new Node();
	}
}
const container = new Node();
Object.assign(context, {
	sidesContainer: container,
	document: { createElement: () => new Node(), getElementById: () => note },
	sides: [[{ id: 1, name: "France", color: "rgba(50, 100, 255, 0.5)" }],
		[{ id: 2, name: "Germany", color: "rgba(100, 100, 100, 0.5)" }], []],
	sideColors: ["rgba(255, 50, 50, 0.5)", "rgba(50, 100, 255, 0.5)", "rgba(255, 200, 0, 0.5)"],
	DEFAULT_SIDE_COLORS: ["rgba(255, 50, 50, 0.5)", "rgba(50, 100, 255, 0.5)"],
	rgbaRe: /[\d.]+\)$/g,
	countryMetadata: [], BUFF_METADATA: { none: {} },
	estimateUnitsForCountry: () => 100,
	influenceLayer: { formatSoldiers: String },
	getCookie: () => "en", getTranslation: (key) => key,
	rebellionBtn: null, setupOptions: new Node(), startBtn: new Node(),
	rebuildManpowerInputs() {}, rebuildStatsPanel() {},
});
globalThis.document = context.document;
context.updateSidesUI = setup.updateSidesUI;
context.ffaMode = false;
context.activeSideIndex = 0;
context.updateSidesUI();
const headers = container.children.filter((node) => node.className === "side-col").map((node) => node.children[0]);
assert.equal(headers.length, 3);
assert.equal(headers[1].style.backgroundColor, "rgba(50, 100, 255, 0.1)", "inactive sides keep a colored surface");
assert.equal(headers[1].style.borderColor, "rgba(50, 100, 255, 0.5)");
button.onclick();
assert.equal(container.children.length, 2, "FFA renders a heading and one shared grid");
assert.equal(container.children[1].className, "ffa-participants-grid");
assert.equal(container.children[1].children.length, 2, "only selected countries appear, no empty sides or dividers");
assert.equal(context.addSideBtn.hidden, true);
assert.equal(context.sides.length, 3, "presentation changes preserve country groups");
button.onclick();
assert.equal(context.addSideBtn.hidden, false);
assert.equal(container.children.filter((node) => node.className === "side-col").length, 3);
context.ffaMode = true;
context.sides = [[], []];
context.updateSidesUI();
assert.equal(container.children[1].children[0].className, "ffa-participants-empty");
assert.equal(context.startBtn.disabled, true);
console.log("FFA setup smoke tests passed");
