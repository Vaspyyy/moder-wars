import assert from "node:assert/strict";
import { createMenuControls } from "../src/menu-controls.js";

// DOM doubles only: enough for the in-game dialog to open and be answered.
class FakeElement {
	constructor(tag) {
		this.tag = tag;
		this.style = {};
		this.children = [];
		this.listeners = {};
		this.textContent = "";
		this.classList = { toggle() {}, add() {} };
	}
	appendChild(child) {
		this.children.push(child);
		return child;
	}
	append(...children) {
		for (const child of children) this.appendChild(child);
	}
	setAttribute() {}
	addEventListener(type, handler) {
		this.listeners[type] = handler;
	}
	focus() {}
	select() {}
}
const created = [];
globalThis.document = {
	body: new FakeElement("body"),
	activeElement: null,
	createElement(tag) {
		const element = new FakeElement(tag);
		created.push(element);
		return element;
	},
	createTextNode: (text) => ({ text }),
};
globalThis.window = { addEventListener() {} };
let reloads = 0;
globalThis.location = {
	reload() {
		reloads++;
	},
};

const button = new FakeElement("button");
createMenuControls({ mainMenuBtn: button }).bindMainMenuBtnClick();
assert.equal(
	typeof button.listeners.click,
	"function",
	"Main menu has a handler",
);

const dialogButton = (name) =>
	created.find((element) => element.className?.includes(name));
const answer = async (name) => {
	const pending = button.listeners.click();
	assert.match(
		created.find((element) => element.id === "game-dialog-message").textContent,
		/return to the main menu/,
	);
	dialogButton(name).listeners.click();
	await pending;
};

await answer("game-dialog-cancel");
assert.equal(reloads, 0, "Cancel keeps the game running");
await answer("game-dialog-ok");
assert.equal(reloads, 1, "Leave reloads into the main menu");
console.log("Main menu button asks first, then returns to the title screen");
