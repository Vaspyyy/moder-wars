import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createMenuControls } from "../src/menu-controls.js";
import { createSimulationControls } from "../src/simulation-controls.js";

// Source fragments and DOM doubles only: no application bootstrap or browser.
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inputs = [
	...html.matchAll(
		/<input class="hud-speed-input"[^>]*value="(\d+)" data-speed-index="(\d+)"/g,
	),
].map((match) => ({
	value: match[1],
	dataset: { speedIndex: match[2] },
	checked: false,
	listeners: {},
	addEventListener(type, handler) {
		this.listeners[type] = handler;
	},
	parentElement: {
		classList: {
			filled: false,
			toggle(name, state) {
				assert.equal(name, "is-filled");
				this.filled = state;
			},
		},
	},
}));
assert.equal(inputs.length, 5);
assert.doesNotMatch(html, /id="(?:ff-btn|speed-down-btn|speed-up-btn)"/);
assert.match(
	html,
	/<legend class="visually-hidden">Simulation speed<\/legend>/,
);
const pause = {
	attrs: {},
	listeners: {},
	title: "",
	setAttribute(key, value) {
		this.attrs[key] = value;
	},
	addEventListener(type, handler) {
		this.listeners[type] = handler;
	},
};
const synchronized = [],
	clockControls = [];
const context = vm.createContext({
	speedInputs: inputs,
	speedControls: { dataset: {} },
	pauseBtn: pause,
	isPaused: false,
	simSpeed: 1,
	frameAccumulator: 25,
	ffaMode: false,
	statusText: {},
	getTranslation: (key) => key,
	simulationClient: {
		syncControls() {
			synchronized.push({ speed: context.simSpeed, paused: context.isPaused });
		},
	},
	localSimulationClock: {
		configure(control) {
			clockControls.push(control);
		},
	},
});
const declarations = main
	.slice(
		main.indexOf("export const SPEED_STEPS"),
		main.indexOf("menu_controls.bindPauseBtnClick();"),
	)
	.replace(/export (?:const|let)/g, "var")
	.replace(/export function/g, "function");
const setSpeed = main
	.slice(
		main.indexOf("export function setSpeed(index)"),
		main.indexOf("menu_controls.bindSpeedSelectorChange();"),
	)
	.replace("export function", "function");
vm.runInContext(declarations + setSpeed, context);
assert.deepEqual(
	inputs.map((input) => Number(input.value)),
	Array.from(context.SPEED_STEPS),
	"markup matches the authoritative speed levels",
);
const runtime = {
	speedInputs: inputs,
	pauseBtn: pause,
	setSpeed: (index) => context.setSpeed(index),
	togglePause: () => context.togglePause(),
	get currentSpeedIndex() {
		return context.currentSpeedIndex;
	},
	gameState: "SIMULATING",
	godModeActive: false,
	preGodModeState: "SELECTING_P1",
};
const menu = createMenuControls(runtime);
menu.bindSpeedSelectorChange();
menu.bindPauseBtnClick();
for (let index = 0; index < inputs.length; index++) {
	inputs[index].checked = true;
	inputs[index].listeners.change();
	assert.equal(
		context.simSpeed,
		Number(inputs[index].value),
		"every speed is directly selectable",
	);
	assert.equal(inputs.filter((input) => input.checked).length, 1);
	assert.deepEqual(
		inputs.map((input) => input.parentElement.classList.filled),
		inputs.map((_, i) => i <= index),
	);
}
assert.equal(context.frameAccumulator, 0);
pause.listeners.click();
assert.equal(context.isPaused, true);
assert.equal(pause.attrs["aria-pressed"], "true");
assert.equal(pause.attrs["aria-label"], "Resume simulation");
context.setSpeed(3);
assert.equal(context.simSpeed, 5);
assert.equal(
	context.isPaused,
	true,
	"selecting a speed cannot silently resume",
);
assert.equal(inputs[3].checked, true);
pause.listeners.click();
assert.equal(context.isPaused, false);
assert.equal(context.simSpeed, 5, "resume retains the selected speed");
assert.equal(pause.attrs["aria-label"], "Pause simulation");
assert.equal(
	synchronized.at(-1).speed,
	clockControls.at(-1).speed,
	"worker and fallback receive the same control",
);
// Worker/recovery/benchmark pause changes flow through the actual live setter.
const pauseSetter = /isPaused: \(value\) => \{([\s\S]*?)\n\t\t\}/.exec(main);
assert.ok(pauseSetter);
vm.runInContext(`function applyPause(value) {${pauseSetter[1]}}`, context);
context.applyPause(true);
assert.equal(pause.attrs["aria-pressed"], "true");
assert.equal(inputs[3].checked, true);
context.applyPause(false);

let keydown, capture;
const originalDocument = globalThis.document;
const body = { tagName: "BODY", closest: () => null };
const documentDouble = {
	activeElement: body,
	addEventListener(type, handler, phase) {
		assert.equal(type, "keydown");
		keydown = handler;
		capture = phase;
	},
};
function key(key, extra = {}) {
	const event = {
		key,
		code: key === " " ? "Space" : "",
		repeat: false,
		defaultPrevented: false,
		prevented: false,
		stopped: false,
		preventDefault() {
			this.prevented = true;
		},
		stopPropagation() {
			this.stopped = true;
		},
		...extra,
	};
	keydown(event);
	return event;
}
try {
	globalThis.document = documentDouble;
	createSimulationControls(runtime).bindDocumentKeydown();
	assert.equal(
		capture,
		true,
		"speed shortcuts intercept before Leaflet zoom controls",
	);
	let event = key("+");
	assert.equal(context.simSpeed, 10);
	assert.ok(event.prevented && event.stopped);
	key("+");
	assert.equal(context.simSpeed, 10, "upper bound does not wrap to slow speed");
	key("-");
	assert.equal(context.simSpeed, 5);
	for (let i = 0; i < 8; i++) key("-");
	assert.equal(context.simSpeed, 1, "lower bound is clamped");
	key("=");
	assert.equal(context.simSpeed, 2, "unshifted plus key works");
	key(" ");
	assert.equal(context.isPaused, true);
	key(" ", { repeat: true });
	assert.equal(
		context.isPaused,
		true,
		"holding Space cannot repeatedly toggle pause",
	);
	for (const tagName of ["BUTTON", "INPUT", "SUMMARY", "A"]) {
		documentDouble.activeElement = {
			tagName,
			type: "radio",
			closest: () => ({}),
		};
		event = key(" ");
		assert.equal(event.prevented, false, "native focused controls own Space");
		assert.equal(context.isPaused, true);
	}
	documentDouble.activeElement = {
		tagName: "INPUT",
		type: "radio",
		closest: () => ({}),
	};
	event = key("ArrowRight");
	assert.equal(
		event.prevented,
		false,
		"native radio arrow navigation remains available",
	);
	key("+");
	assert.equal(
		context.simSpeed,
		3,
		"plus/minus still work with speed selector focus",
	);
	for (const active of [
		{ tagName: "INPUT", type: "text" },
		{ tagName: "TEXTAREA" },
		{ tagName: "SELECT" },
		{ tagName: "DIV", isContentEditable: true },
	]) {
		documentDouble.activeElement = active;
		event = key("+");
		assert.equal(context.simSpeed, 3);
		assert.equal(event.prevented, false);
	}
	documentDouble.activeElement = body;
	for (const extra of [
		{ ctrlKey: true },
		{ metaKey: true },
		{ altKey: true },
		{ defaultPrevented: true },
	]) {
		key("+", extra);
		assert.equal(context.simSpeed, 3);
	}
	runtime.gameState = "SELECTING_P1";
	key("+");
	assert.equal(context.simSpeed, 3, "setup ignores simulation shortcuts");
	runtime.godModeActive = true;
	runtime.preGodModeState = "SIMULATING";
	key("+");
	assert.equal(
		context.simSpeed,
		5,
		"active sandbox wars accept speed shortcuts",
	);
} finally {
	globalThis.document = originalDocument;
}
console.log(
	"Speed selector: direct selection, filled levels, pause/resume retention, live pause mirrors, clock controls, native keyboard ownership, clamping and Leaflet shortcut isolation passed",
);
