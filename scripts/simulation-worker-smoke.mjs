import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import {
	applyControlDeltas,
	SIMULATION_PROTOCOL_VERSION,
	unpackPresentationUnits,
} from "../src/simulation-protocol.js";
import { createTinySimulationState as fixture } from "./simulation-fixture.mjs";

// This is the actual browser worker module inside a Node port shim. No browser,
// rendering loop, or main-module/UI imports participate in these checks.
const workerUrl = new URL("../workers/war-simulation-worker.js", import.meta.url).href;
const adapter = `import { parentPort } from "node:worker_threads";
 globalThis.self = { postMessage: (message, transfers) => parentPort.postMessage(message, transfers) };
 await import(${JSON.stringify(workerUrl)});
 parentPort.on("message", data => self.onmessage({ data }));`;
const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(adapter)}`));
const inbox = [];
const waiters = new Set();
let failure;
worker.on("error", error => {
	failure = error;
	for (const waiter of waiters) waiter();
});
worker.on("message", message => {
	inbox.push(message);
	if (message.type === "ERROR") failure = new Error(message.message);
	for (const waiter of waiters) waiter();
});
function waitFor(predicate, timeoutMs = 4000) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => finish(new Error(`Timed out waiting for worker message; queued ${inbox.map(message => `${message.type}:${message.epoch}`).join(", ")}`)), timeoutMs);
		function finish(error, value) {
			clearTimeout(timeout);
			waiters.delete(check);
			if (error) reject(error);
			else resolve(value);
		}
		function check() {
			if (failure) return finish(failure);
			const index = inbox.findIndex(predicate);
			if (index >= 0) finish(null, inbox.splice(index, 1)[0]);
		}
		waiters.add(check);
		check();
	});
}
function send(type, epoch, fields = {}) {
	worker.postMessage({ type, epoch, ...fields });
}
async function initialize(epoch, state) {
	send("INIT", epoch, { version: SIMULATION_PROTOCOL_VERSION, state });
	await waitFor(message => message.type === "READY" && message.epoch === epoch);
	return (await waitFor(message => message.type === "SNAPSHOT" && message.epoch === epoch)).snapshot;
}
async function snapshot(epoch) {
	send("ACK", epoch, { requestSnapshot:true });
	return (await waitFor(message => message.type === "SNAPSHOT" && message.epoch === epoch)).snapshot;
}
async function handoff(epoch, requestId) {
	send("HANDOFF", epoch, { requestId });
	const result = await waitFor(message => message.type === "HANDOFF" && message.epoch === epoch);
	assert.equal(result.requestId, requestId);
	return result;
}
function mirror(initial, presentation) {
	applyControlDeltas(initial, presentation.tiles);
	initial.units = unpackPresentationUnits(presentation.units, initial.units);
}
function assertMirrorState(initial, incoming) {
	for (const name of ["worldControlMap", "dominantSideMap", "occupationMap", "primaryOccupierMap", "landMask", "provinceMap"])
		assert.deepEqual(initial[name], incoming[name], `${name} mirror includes every changed cell`);
	assert.equal(initial.units.length, incoming.units.length);
	for (const unit of initial.units) {
		const full = incoming.units.find(entry => entry.id === unit.id);
		assert.ok(full, `handoff retains unit ${unit.id}`);
		for (const key of ["lat", "lng", "health", "personnel", "deployTicks", "sideIndex", "sovereignId"])
			assert.equal(unit[key], full[key], `presentation and full-unit ${key} agree`);
	}
}

try {
	const initial = fixture();
	const first = await initialize(1, initial);
	assert.equal(first.values._simTickCount, 0);
	assert.equal(first.units.flags.length, 4);
	mirror(initial, first);
	// A withheld presentation ACK keeps rendering frozen while the worker advances.
	await delay(230);
	assert.equal(inbox.filter(message => message.type === "SNAPSHOT" && message.epoch === 1).length, 0, "snapshot backpressure is bounded to one outstanding message");
	send("CONTROL", 1, { paused: true, speed: 1 });
	const frozen = await snapshot(1);
	assert.ok(frozen.values._simTickCount >= 3, "simulation advances without display frames or ACKs");
	assert.ok(frozen.tiles.length > 0, "same-side intensity/control changes produce terrain mirror deltas");
	mirror(initial, frozen);
	const frozenTicks = frozen.values._simTickCount;
	await delay(100);
	const stillFrozen = await snapshot(1);
	assert.equal(stillFrozen.values._simTickCount, frozenTicks, "pause stops tick advancement");
	mirror(initial, stillFrozen);
	const recovered = (await handoff(1, 11)).state;
	assertMirrorState(initial, recovered);
	for (const map of recovered.sideInfluenceMaps) {
		assert.ok(map instanceof Float32Array, "handoff expands sparse influences for editor compatibility");
		assert.equal(map.length, initial.gridWidth * initial.gridHeight);
		assert.ok(map.some(value => value !== 0));
	}
	for (let id = 1; id <= 4; id++) assert.equal(recovered.units.find(unit => unit.id === id)?.smokeMarker, `formation-${id}`, "handoff retains full strategic unit data");

	// Each epoch receives fresh state; old controls and treaties cannot mutate it.
	const reset = fixture({ paused: true, idOffset: 100, gridWidth: 72 });
	const resetSnapshot = await initialize(2, reset);
	assert.equal(resetSnapshot.values._simTickCount, 0);
	send("CONTROL", 1, { paused: false, speed: 100 });
	send("COMMAND", 1, { command: { type: "APPLY_TREATY", treatyType: "ANNEXATION", winnerSideIdx: 0 } });
	send("ACK", 1);
	await delay(100);
	const afterStale = await snapshot(2);
	assert.equal(afterStale.values._simTickCount, 0);
	assert.equal(afterStale.values.gameState, "SIMULATING");
	assert.equal(afterStale.units.numbers[0], 101, "old epoch units are replaced");

	// Equal real-time windows, generous thresholds: fixed clock speed does not use
	// frame count. These assert behavior, not a benchmark or exact timer precision.
	send("CONTROL", 2, { paused: false, speed: 1 });
	await delay(230);
	send("CONTROL", 2, { paused: true });
	const slow = await snapshot(2);
	send("CONTROL", 2, { paused: false, speed: 4 });
	await delay(230);
	send("CONTROL", 2, { paused: true });
	const fast = await snapshot(2);
	const slowTicks = slow.values._simTickCount, fastTicks = fast.values._simTickCount - slowTicks;
	assert.ok(slowTicks >= 3);
	assert.ok(fastTicks > slowTicks * 1.5, `4x control accelerates worker ticks (${slowTicks} vs ${fastTicks})`);

	const resized = (await handoff(2, 22)).state;
	assert.equal(resized.gridWidth, 72, "new INIT replaces grid dimensions and tracker layout");
	assert.equal(resized.CONFIG.GRID_RES, 5);
	assert.equal(resized.worldControlMap.length, 72 * 36);
	assert.ok(resized.sideInfluenceMaps.every(map => map instanceof Float32Array && map.length === 72 * 36));

	const treatyInitial = fixture({ paused: true, idOffset: 200 });
	mirror(treatyInitial, await initialize(3, treatyInitial));
	send("COMMAND", 3, { command: { type: "APPLY_TREATY", treatyType: "ANNEXATION", winnerSideIdx: 0 } });
	const treatySnapshot = await snapshot(3);
	assert.equal(treatySnapshot.values.gameState, "WAR_OVER");
	assert.ok(treatySnapshot.events.some(event => event.type === "presentTreatyNotice"));
	mirror(treatyInitial, treatySnapshot);
	const treaty = await handoff(3, 33);
	assertMirrorState(treatyInitial, treaty.state);
	assert.ok(treaty.state.landMask.every(value => value === 1));
	assert.ok(treaty.state.worldControlMap.every(value => value === 1));
	assert.ok(treaty.state.dominantSideMap.every(value => value === -1));
	assert.ok(treaty.state.occupationMap.every(value => value === 0));
	assert.ok(treaty.state.sideInfluenceMaps.every(map => map.every(value => value === 0)));
	assert.equal(treaty.state.units.length, 4, "ending a war preserves army data for the UI handoff");
	const overlays = fixture({ paused: true });
	overlays._coastalDefensePlan = [{ smokeMarker: "coastal", lat: 0, lng: 0 }];
	overlays._neutralGarrisonPlan = [{ smokeMarker: "garrison", lat: 1, lng: 1 }];
	overlays._aiDebugPlans = [{ smokeMarker: "debug", proposals: [] }];
	const overlaySnapshot = await initialize(4, overlays);
	for (const field of ["_coastalDefensePlan", "_neutralGarrisonPlan", "_aiDebugPlans"])
		assert.deepEqual(overlaySnapshot.values[field], overlays[field], `${field} remains visible across the worker boundary`);
	console.log(`Actual worker INIT, snapshots/deltas, pause, ${slowTicks}/${fastTicks} speed ticks, epochs, treaty, and dense/full-unit handoff passed.`);
} finally {
	await worker.terminate();
}
