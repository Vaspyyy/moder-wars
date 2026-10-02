import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import {
	applyControlDeltas,
	collectTransferBuffers,
	CONTROL_MAP_FIELDS,
	createControlDeltaTracker,
	createPresentationSnapshot,
	createPresentationSnapshotCache,
	createPresentationUnitCache,
	cloneSimulationData,
	packPresentationUnits,
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

function checkOddTileByteFallback() {
	const state = fixture({ paused: true });
	state.gridWidth = 35;
	state.gridHeight = 33;
	const size = state.gridWidth * state.gridHeight;
	state.worldControlMap = new Uint16Array(size);
	state.dominantSideMap = new Int8Array(size);
	state.occupationMap = new Float32Array(size);
	state.primaryOccupierMap = new Uint16Array(size);
	state.landMask = new Uint8Array(new ArrayBuffer(size + 1), 1, size);
	state.provinceMap = new Int32Array(size);
	const tracker = createControlDeltaTracker(state);
	tracker.markAll();
	assert.equal(tracker.take().length, 4, "odd grid publishes all partial edge tiles");

	const edgeIndex = 32 * state.gridWidth + 34;
	state.landMask[edgeIndex] = 9;
	tracker.markCell(edgeIndex);
	const byteDelta = tracker.take();
	assert.equal(byteDelta.length, 1);
	assert.equal(byteDelta[0].key, 3);
	assert.equal(byteDelta[0].width, 3);
	assert.equal(byteDelta[0].height, 1);
	assert.equal(byteDelta[0].landMask[2], 9,
		"unaligned source views and partial rows copy with exact byte offsets");

	state.occupationMap[0] = -0;
	tracker.markCell(0);
	const negativeZero = tracker.take();
	assert.ok(Object.hasOwn(negativeZero[0], "occupationMap"));
	assert.ok(Object.is(negativeZero[0].occupationMap[0], -0),
		"word copies preserve Float32 negative zero");
	state.occupationMap[1] = NaN;
	tracker.markCell(1);
	const nan = tracker.take();
	assert.ok(Number.isNaN(nan[0].occupationMap[1]),
		"word copies preserve Float32 NaN values");
	tracker.markCell(1);
	assert.deepEqual(tracker.take(), [], "an unchanged NaN payload stays elided");
}

function checkTransportProtocol() {
	const state = fixture({ paused: true });
	const tracker = createControlDeltaTracker(state);
	tracker.markAll();
	const full = tracker.take();
	assert.equal(full.length, 2, "initial publication covers every control tile");
	for (const tile of full)
		for (const field of CONTROL_MAP_FIELDS)
			assert.ok(tile[field] instanceof Object.getPrototypeOf(state[field]).constructor,
				`initial tile includes ${field}`);
	structuredClone(full, { transfer: collectTransferBuffers(full) });
	tracker.markCell(0);
	assert.deepEqual(tracker.take(), [], "unchanged dirty tiles send no mirror fields");

	const mirrorState = fixture({ paused: true });
	const notifications = [];
	mirrorState.influenceLayer = {
		notifyControlTilesChanged: (...args) => notifications.push(args),
	};
	state.occupationMap[0] += 0.125;
	state.provinceMap[0] += 1;
	tracker.markCell(0);
	const nonGeometry = tracker.take();
	assert.equal(nonGeometry.length, 1);
	assert.deepEqual(
		CONTROL_MAP_FIELDS.filter((field) => Object.hasOwn(nonGeometry[0], field)),
		["occupationMap", "provinceMap"],
		"a dirty tile sends only fields whose contents changed",
	);
	applyControlDeltas(mirrorState, nonGeometry);
	assert.deepEqual(notifications.at(-1), [
		[nonGeometry[0].key],
		32,
		{ politicalTileKeys: [], regionTileKeys: [] },
	]);
	assert.deepEqual(mirrorState.occupationMap, state.occupationMap);
	assert.deepEqual(mirrorState.provinceMap, state.provinceMap);

	state.primaryOccupierMap[0] = 2;
	tracker.markCell(0);
	const geometry = tracker.take();
	assert.deepEqual(
		CONTROL_MAP_FIELDS.filter((field) => Object.hasOwn(geometry[0], field)),
		["primaryOccupierMap"],
	);
	applyControlDeltas(mirrorState, geometry);
	assert.deepEqual(notifications.at(-1), [
		[geometry[0].key],
		32,
		{ politicalTileKeys: [geometry[0].key], regionTileKeys: [geometry[0].key] },
	]);
	state.worldControlMap = state.worldControlMap.slice();
	state.worldControlMap[33] = 1;
	tracker.markCell(0);
	const replacedMap = tracker.take();
	assert.deepEqual(
		replacedMap.map((tile) => tile.key),
		[0, 1],
		"replacing a map forces its full field across every tile",
	);
	assert.ok(replacedMap.every((tile) => Object.hasOwn(tile, "worldControlMap")));
	applyControlDeltas(mirrorState, replacedMap);
	assert.deepEqual(mirrorState.worldControlMap, state.worldControlMap);

	const id = 0.1 + 0.2;
	const original = {
		id,
		lat: 1,
		lng: 2,
		personnel: 10,
		isAlpenjager: true,
		isAtSea: true,
	};
	const units = [original];
	const unitCache = createPresentationUnitCache(units);
	const firstUnits = unpackPresentationUnits(packPresentationUnits(units), units, unitCache);
	assert.strictEqual(firstUnits, units, "persistent unit result array is reused");
	assert.strictEqual(firstUnits[0], original, "Float64 fractional ID preserves object identity");
	const refreshed = {
		...original,
		personnel: null,
		isAlpenjager: false,
		isAtSea: false,
	};
	const secondUnits = unpackPresentationUnits(
		packPresentationUnits([refreshed]),
		units,
		unitCache,
	);
	assert.strictEqual(secondUnits[0], original);
	assert.equal(Object.hasOwn(original, "personnel"), false, "NaN removes stale optional numeric fields");
	assert.equal(original.isAlpenjager, false, "absent unit flags clear on later snapshots");
	assert.equal(original.isAtSea, false);
	const replacementId = id + 0.125;
	const replacementUnit = { ...refreshed, id: replacementId };
	const replacedUnits = unpackPresentationUnits(
		packPresentationUnits([replacementUnit]),
		secondUnits,
		unitCache,
	);
	assert.strictEqual(replacedUnits[0].id, replacementId, "fractional replacement IDs retain exact identity");
	assert.equal(unitCache.byId.size, 1, "steady-count ID replacement prunes its stale lookup entry");
	const removedUnits = unpackPresentationUnits(packPresentationUnits([]), replacedUnits, unitCache);
	assert.equal(removedUnits.length, 0);
	assert.equal(unitCache.byId.size, 0, "removed units are pruned from the persistent lookup");
	const returnedUnits = unpackPresentationUnits(
		packPresentationUnits([refreshed]),
		removedUnits,
		unitCache,
	);
	assert.notStrictEqual(returnedUnits[0], original, "a removed ID does not retain a stale object");

	const plans = fixture({ paused: true });
	plans.perf = { _mode: "off", _history: [], ticks: 0, tickTotal: 0, maxTick: 0 };
	plans._aiDebugPlans = [{ proposals: [{ scores: [1, 2, 3] }] }];
	plans._coastalDefensePlan = [{ target: { lat: 4, lng: 5 } }];
	const planCache = createPresentationSnapshotCache();
	const planTracker = createControlDeltaTracker(plans);
	const firstPlans = createPresentationSnapshot(plans, planTracker, {
		cache: planCache,
	});
	assert.ok(Object.hasOwn(firstPlans.values, "_aiDebugPlans"));
	const originalPlanValue = cloneSimulationData(plans._aiDebugPlans);
	firstPlans.values._aiDebugPlans[0].proposals[0].scores[0] = -1;
	assert.deepEqual(
		planCache.values.get("_aiDebugPlans").value,
		originalPlanValue,
		"consumer mutations cannot corrupt the cached content baseline",
	);
	const unchangedPlans = createPresentationSnapshot(plans, planTracker, { cache: planCache });
	assert.equal(Object.hasOwn(unchangedPlans.values, "_aiDebugPlans"), false,
		"unchanged debug graphs are omitted after their initial publication");
	assert.equal(Object.hasOwn(unchangedPlans.values, "_coastalDefensePlan"), false);
	plans._aiDebugPlans[0].proposals[0].scores[1] = 99;
	const changedPlans = createPresentationSnapshot(plans, planTracker, { cache: planCache });
	assert.deepEqual(changedPlans.values._aiDebugPlans, plans._aiDebugPlans,
		"in-place plan changes are detected and republished");
	plans._aiDebugPlans[0].proposals[0].scores[2] = 123;
	const hotPlans = createPresentationSnapshot(plans, planTracker, { cache: planCache });
	assert.ok(Object.hasOwn(hotPlans.values, "_aiDebugPlans"));
	assert.equal(planCache.values.get("_aiDebugPlans").kind, "hot",
		"consecutive changes bypass repeated deep comparison");
	for (let index = 0; index < 29; index++)
		createPresentationSnapshot(plans, planTracker, { cache: planCache });
	const cooledPlans = createPresentationSnapshot(plans, planTracker, { cache: planCache });
	assert.equal(Object.hasOwn(cooledPlans.values, "_aiDebugPlans"), false,
		"hot values return to content elision after a periodic unchanged check");
	const borrower = fixture({ paused: true });
	borrower.perf = plans.perf;
	borrower._aiDebugPlans = [{ proposal: { score: 7 } }];
	const borrowerCache = createPresentationSnapshotCache();
	const workerSnapshot = createPresentationSnapshot(
		borrower,
		createControlDeltaTracker(borrower),
		{ cache: borrowerCache, reuseBaselineForWorker: true },
	);
	assert.strictEqual(
		workerSnapshot.values._aiDebugPlans,
		borrowerCache.values.get("_aiDebugPlans").value,
		"worker publication can reuse its owned baseline without exposing owner state",
	);
	assert.notStrictEqual(workerSnapshot.values._aiDebugPlans, borrower._aiDebugPlans);
	const receivedBorrow = structuredClone(workerSnapshot, {
		transfer: collectTransferBuffers({
			units: workerSnapshot.units,
			tiles: workerSnapshot.tiles,
		}),
	});
	borrower._aiDebugPlans[0].proposal.score = 99;
	assert.equal(receivedBorrow.values._aiDebugPlans[0].proposal.score, 7,
		"worker postMessage snapshots the retained value baseline before later owner mutation");
	const filtered = fixture({ paused: true });
	filtered.perf = plans.perf;
	filtered._aiDebugPlans = [{ score: 7, flag: { marker: "UI image" }, callback: () => 1 }];
	const filteredSnapshot = createPresentationSnapshot(
		filtered,
		createControlDeltaTracker(filtered),
		{ cache: createPresentationSnapshotCache(), reuseBaselineForWorker: true },
	);
	assert.notStrictEqual(filteredSnapshot.values._aiDebugPlans, filtered._aiDebugPlans,
		"asset/function-bearing state graphs are never borrowed raw");
	assert.equal(filteredSnapshot.values._aiDebugPlans[0].flag, undefined);
	assert.equal(filteredSnapshot.values._aiDebugPlans[0].callback, undefined);
	const customArray = [{ value: 1 }];
	customArray.note = "first";
	plans._aiDebugPlans = customArray;
	const customArrayCache = createPresentationSnapshotCache();
	createPresentationSnapshot(plans, planTracker, { cache: customArrayCache });
	customArray.note = "changed";
	const customArraySnapshot = createPresentationSnapshot(plans, planTracker, { cache: customArrayCache });
	assert.equal(customArraySnapshot.values._aiDebugPlans.note, "changed",
		"custom array properties use exact deep comparison instead of JSON elision");
	const aliases = fixture({ paused: true });
	aliases.perf = plans.perf;
	const sharedValue = { score: 1 };
	aliases._aiDebugPlans = { first: sharedValue, second: sharedValue };
	const aliasCache = createPresentationSnapshotCache();
	const aliasTracker = createControlDeltaTracker(aliases);
	createPresentationSnapshot(aliases, aliasTracker, { cache: aliasCache });
	aliases._aiDebugPlans.second = { score: 1 };
	assert.ok(
		Object.hasOwn(createPresentationSnapshot(aliases, aliasTracker, { cache: aliasCache }).values, "_aiDebugPlans"),
		"changing a shared reference into equal independent objects is not elided",
	);
	if (typeof SharedArrayBuffer !== "undefined") {
		const sharedPlans = fixture({ paused: true });
		sharedPlans.perf = plans.perf;
		sharedPlans._aiDebugPlans = new SharedArrayBuffer(4);
		const sharedCache = createPresentationSnapshotCache();
		const sharedTracker = createControlDeltaTracker(sharedPlans);
		createPresentationSnapshot(sharedPlans, sharedTracker, { cache: sharedCache });
		assert.equal(
			Object.hasOwn(createPresentationSnapshot(sharedPlans, sharedTracker, { cache: sharedCache }).values, "_aiDebugPlans"),
			false,
			"unchanged shared buffers are elided",
		);
		new Uint8Array(sharedPlans._aiDebugPlans)[0] = 1;
		assert.ok(
			Object.hasOwn(createPresentationSnapshot(sharedPlans, sharedTracker, { cache: sharedCache }).values, "_aiDebugPlans"),
			"shared buffer mutations invalidate the cached content baseline",
		);
	}
	const rich = fixture({ paused: true });
	rich.perf = plans.perf;
	const ownerImage = { marker: "owner-only flag" };
	const keyedView = new Uint8Array(new ArrayBuffer(8));
	const richGraph = {
		date: new Date(1234),
		map: new Map([[keyedView, { current: new Uint8Array(keyedView.buffer) }]]),
		set: new Set(["stable"]),
		flag: ownerImage,
		callback: () => "owner-only function",
	};
	richGraph.self = richGraph;
	rich._aiDebugPlans = richGraph;
	const richCache = createPresentationSnapshotCache();
	const richTracker = createControlDeltaTracker(rich);
	const richFirst = createPresentationSnapshot(rich, richTracker, {
		cache: richCache,
		reuseBaselineForWorker: true,
	});
	assert.notStrictEqual(richFirst.values._aiDebugPlans, richGraph,
		"cyclic, typed, map, and date graphs use an owned clone");
	assert.notStrictEqual(richFirst.values._aiDebugPlans.flag, ownerImage,
		"asset keys are removed before values cross the owner boundary");
	assert.equal(richFirst.values._aiDebugPlans.callback, undefined,
		"functions are omitted instead of borrowed into a worker message");
	const defaultTransferCache = createPresentationSnapshotCache();
	const defaultTransferSnapshot = createPresentationSnapshot(
		rich,
		richTracker,
		{ cache: defaultTransferCache },
	);
	const defaultBaseline = defaultTransferCache.values.get("_aiDebugPlans").value;
	structuredClone(defaultTransferSnapshot, {
		transfer: collectTransferBuffers(defaultTransferSnapshot),
	});
	assert.equal(
		defaultBaseline.map.get(defaultBaseline.map.keys().next().value).current.buffer.byteLength,
		8,
		"default snapshots keep their deep cache safe when consumers transfer all output buffers",
	);
	const richWire = structuredClone(richFirst, {
		transfer: collectTransferBuffers({ units: richFirst.units, tiles: richFirst.tiles }),
	});
	assert.equal(keyedView.buffer.byteLength, 8,
		"transferring cloned map keys never detaches the source state");
	const richBaseline = richCache.values.get("_aiDebugPlans").value;
	const cachedView = richBaseline.map.get(richBaseline.map.keys().next().value).current;
	assert.equal(cachedView.buffer.byteLength, 8,
		"worker transfer lists leave owned value-cache buffers attached");
	assert.notStrictEqual(
		richWire.values._aiDebugPlans.map.get(
			richWire.values._aiDebugPlans.map.keys().next().value,
		).current.buffer,
		cachedView.buffer,
		"postMessage clones retained values without detaching cache storage",
	);
	assert.ok(richWire.values._aiDebugPlans.self === richWire.values._aiDebugPlans,
		"cyclic values survive the presentation transport");
	assert.equal(
		Object.hasOwn(createPresentationSnapshot(rich, richTracker, { cache: richCache }).values, "_aiDebugPlans"),
		false,
		"unchanged Date, Map, Set, view, and cycle values are elided",
	);
	richGraph.date.setTime(5678);
	richGraph.map.set("new", { current: 2 });
	richGraph.set.add("changed");
	keyedView[0] = 5;
	assert.ok(
		Object.hasOwn(createPresentationSnapshot(rich, richTracker, { cache: richCache }).values, "_aiDebugPlans"),
		"deep graph edits are detected across Date, Map, Set, and typed view content",
	);

	const shared = new ArrayBuffer(16);
	const view = new Uint8Array(shared);
	const viewMap = new Map([[view, new Set([new DataView(shared)])]]);
	viewMap.set(viewMap, viewMap);
	assert.deepEqual(collectTransferBuffers({ viewMap, view }), [shared],
		"cyclic maps, sets, and multiple views yield each backing buffer once");
	const ownerKey = new Uint8Array(new ArrayBuffer(8));
	const ownerMap = new Map([[ownerKey, new Set([ownerKey])]]);
	const clonedOwnerMap = cloneSimulationData(ownerMap);
	const clonedKey = clonedOwnerMap.keys().next().value;
	assert.notStrictEqual(clonedKey, ownerKey, "map keys are cloned with their owning graph");
	assert.strictEqual(clonedOwnerMap.values().next().value.values().next().value, clonedKey,
		"map key/value aliases survive the safe clone");
	structuredClone(clonedOwnerMap, { transfer: collectTransferBuffers(clonedOwnerMap) });
	assert.equal(ownerKey.buffer.byteLength, 8, "transfer discovery cannot detach a source map key");
}

try {
	checkOddTileByteFallback();
	checkTransportProtocol();
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
	const stillFrozenTicks = stillFrozen.values._simTickCount ?? frozenTicks;
	assert.equal(stillFrozenTicks, frozenTicks, "pause stops tick advancement while omitted values retain their prior state");
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
	assert.equal(afterStale.values._simTickCount ?? resetSnapshot.values._simTickCount, 0);
	assert.equal(afterStale.values.gameState ?? resetSnapshot.values.gameState, "SIMULATING");
	assert.equal(afterStale.units.numbers[0], 101, "old epoch units are replaced");

	// Equal real-time windows, generous thresholds: fixed clock speed does not use
	// frame count. These assert behavior, not a benchmark or exact timer precision.
	let lastTick = resetSnapshot.values._simTickCount;
	const readTick = presentation => {
		lastTick = presentation.values._simTickCount ?? lastTick;
		return lastTick;
	};
	send("CONTROL", 2, { paused: false, speed: 1 });
	await delay(230);
	send("CONTROL", 2, { paused: true });
	const slow = await snapshot(2);
	const slowCurrentTick = readTick(slow);
	const slowTicks = slowCurrentTick - resetSnapshot.values._simTickCount;
	send("CONTROL", 2, { paused: false, speed: 5 });
	await delay(230);
	send("CONTROL", 2, { paused: true });
	const fast = await snapshot(2);
	const fastTicks = readTick(fast) - slowCurrentTick;
	assert.ok(slowTicks >= 3);
	assert.ok(fastTicks > slowTicks * 1.5, `5x control accelerates worker ticks (${slowTicks} vs ${fastTicks})`);
	send("CONTROL", 2, { paused: false, speed: 10 });
	await delay(230);
	const fastest = await snapshot(2);
	const fastestTicks = readTick(fastest) - (slowCurrentTick + fastTicks);
	assert.ok(fastestTicks > slowTicks * 1.5, `10x control accelerates worker ticks (${slowTicks} vs ${fastestTicks})`);
	// Reduce directly while running: pausing first would erase the very backlog
	// that caused the reported speed lock and conceal a regression.
	send("CONTROL", 2, { speed: 1 });
	const slowdownStart = await snapshot(2);
	const slowdownStartTick = readTick(slowdownStart);
	const slowdownWallStart = performance.now();
	await delay(230);
	send("CONTROL", 2, { paused: true });
	const slowed = await snapshot(2);
	const slowdownElapsed = performance.now() - slowdownWallStart;
	const slowedTicks = readTick(slowed) - slowdownStartTick;
	assert.ok(slowedTicks >= 3, "lowering speed keeps the worker running");
	assert.ok(slowedTicks <= Math.ceil(slowdownElapsed * 60 / 1000) + 6, `1x follows current wall time instead of draining old 10x ticks (${slowedTicks} ticks in ${slowdownElapsed.toFixed(0)} ms)`);

	const resized = (await handoff(2, 22)).state;
	assert.equal(resized.simSpeed, 1, "lower speed survives the full-owner handoff");
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
	console.log(`Actual worker INIT, snapshots/deltas, pause, 1x/5x/10x/1x ${slowTicks}/${fastTicks}/${fastestTicks}/${slowedTicks} speed ticks, epochs, treaty, and dense/full-unit handoff passed.`);
} finally {
	await worker.terminate();
}
