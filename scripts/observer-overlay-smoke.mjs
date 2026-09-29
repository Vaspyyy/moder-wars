import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const start = main.indexOf("export function getAiObserverSnapshot(");
const end = main.indexOf("export function setAiObserverSideUid(", start);
let contactReads = 0;
const context = vm.createContext({
	aiObserverSideUid: "a", gameMode: "CONQUEST", gameState: "SIMULATING",
	_frozenAiObserverSnapshots: new Map(), sideUids: ["a"],
	_aiIntelBySide: new Map([["a", {}]]), _aiTaskForcesBySide: new Map([["a", []]]),
	_simTickCount: 10, getSideDisplayName: () => "Side A",
	createAiIntelObserverSnapshot: () => { contactReads++; return { contacts: [{ key: "enemy", confidence: 0.83, lat: 1, lng: 2 }] }; },
	createAiTaskForceObserverSnapshot: () => ({ taskForces: [] }),
});
vm.runInContext(main.slice(start, end).replace("export function", "function"), context);
assert.equal(context.getAiObserverSnapshot(undefined, { includeContacts: false }).contacts.length, 0);
assert.equal(contactReads, 0, "map snapshots skip contact serialization");
assert.equal(context.getAiObserverSnapshot().contacts.length, 1, "AI and checkpoint consumers retain their information");
const frozen = context.getAiObserverSnapshot();
context._frozenAiObserverSnapshots.set("a", frozen);
context.gameState = "WAR_OVER";
assert.equal(context.getAiObserverSnapshot(undefined, { includeContacts: false }).contacts.length, 0);
assert.equal(frozen.contacts.length, 1, "stripping map contacts must not mutate frozen simulation evidence");
const renderer = readFileSync(new URL("../src/renderer.js", import.meta.url), "utf8");
const overlayStart = renderer.indexOf("function drawAiOperationsOverlay(");
const overlayEnd = renderer.indexOf("const _allianceCache", overlayStart);
vm.runInContext(renderer.slice(overlayStart, overlayEnd), context);
const canvas = new Proxy({}, { get() { throw new Error("contact-only snapshots must draw nothing"); } });
context.drawAiOperationsOverlay(canvas, { taskForces: [], contacts: frozen.contacts }, () => { throw new Error("contacts must not be projected"); });
console.log("Observer overlay smoke tests passed");
