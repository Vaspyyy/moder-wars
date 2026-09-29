import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const button = { setAttribute(name, value) { this[name] = value; } };
const note = { hidden: true };
const sides = [[{ id: 1 }, { id: 2 }], []];
const context = vm.createContext({
	ffaMode: false,
	ffaToggleBtn: button,
	setupPanel: { classList: { toggle() {} } },
	document: { getElementById: () => note },
	getTranslation: () => "FFA",
	sides,
	activeSideIndex: 0,
	MAX_SIDES: 2,
	statusText: {},
});
const start = main.indexOf("function updateFfaSetupUi()");
const end = main.indexOf("export const randomWarBtn", start);
vm.runInContext(main.slice(start, end), context);
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
const selectionStart = main.indexOf("\tif (ffaMode) {\n\t\t// In FFA");
const selectionEnd = main.indexOf("\tconst targetList", selectionStart);
vm.runInContext(`function selectFfaSide() { ${main.slice(selectionStart, selectionEnd)} }`, context);
context.ffaMode = true;
context.selectFfaSide();
assert.equal(context.activeSideIndex, 1, "reuse an empty side even at the side limit");
assert.equal(sides.length, 2);
sides[1].push({ id: 3 });
context.selectFfaSide();
assert.equal(sides.length, 2, "never exceed the side limit");
assert.match(context.statusText.textContent, /Maximum 2 sides/);
console.log("FFA setup smoke tests passed");
