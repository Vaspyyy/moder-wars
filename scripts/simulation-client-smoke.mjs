import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createSimulationClient } from "../src/simulation-client.js";
import { createEngine } from "../src/simulation-engine.js";
import { createDeterministicJob } from "../src/simulation-jobs.js";
import { createSimulationMetrics } from "../src/simulation-metrics.js";
import { applySimulationState, captureSimulationState, packPresentationUnits } from "../src/simulation-protocol.js";
import { createSimulationState } from "../src/simulation-state.js";
import { createSimulationWorld } from "../src/simulation-world.js";
import { createTerritoryLedger, getCountryLedger, getSideLedger } from "../src/territory-ledger.js";
import { createTerritoryRuntime } from "../src/territory-runtime.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

// Fake transport tests ownership and UI transactions independently of worker CPU
// mechanics. The companion worker smoke runs the actual simulation separately.
function createBoundRuntime() {
	const data = createSimulationState(createTinySimulationState({ paused: true }));
	data.perf = createSimulationMetrics();
	const runtime = {};
	for (const key of Object.keys(data)) Object.defineProperty(runtime, key, {
		get: () => data[key], set: value => { data[key] = value; }, enumerable: true,
	});
	return runtime;
}
class FakeWorker {
	constructor({ autoReady = true } = {}) {
		this.autoReady = autoReady;
		this.messages = [];
		this.terminated = false;
		this.handoffMode = "normal";
	}
	emit(data) { this.onmessage?.({ data }); }
	postMessage(message, transfer = []) {
		// Real transfer semantics expose accidental detachment of UI-owned buffers.
		const received = structuredClone(message, { transfer });
		this.messages.push(received);
		if (received.type === "INIT") {
			this.epoch = received.epoch;
			this.state = received.state;
			if (this.autoReady) queueMicrotask(() => this.emit({ type: "READY", epoch: this.epoch }));
		} else if (received.type === "HANDOFF") {
			if (this.handoffMode === "error") {
				queueMicrotask(() => this.onerror?.(new Error("simulated port failure during handoff")));
				return;
			}
			if (this.handoffMode === "hold") return;
			const state = structuredClone(this.state);
			state.units[0].smokeMarker += "-owner";
			if (this.handoffMode === "recovered-error") {
				queueMicrotask(() => this.emit({ type: "ERROR", epoch: this.epoch,
					message: "simulated recovered state during handoff", state }));
				return;
			}
			if (this.handoffMode === "wrong-first") {
				const wrong = structuredClone(state); wrong._simTickCount = 9000;
				queueMicrotask(() => this.emit({ type: "HANDOFF", epoch: this.epoch, requestId: received.requestId + 1000, state: wrong }));
			}
			setTimeout(() => this.emit({ type: "HANDOFF", epoch: this.epoch, requestId: received.requestId, state, events: [{ type: "handoffEvent", args: [received.requestId] }] }), 8);
		}
	}
	terminate() { this.terminated = true; }
	publishSnapshot(metrics = {}) {
		const units = structuredClone(this.state.units);
		units[0].lat += 0.125;
		this.state.units = units;
		this.state._simTickCount = 17;
		this.state.occupationMap[0] = 0.85;
		this.emit({ type: "SNAPSHOT", epoch: this.epoch, snapshot: {
			values: { _simTickCount: 17, sides: this.state.sides }, units: packPresentationUnits(units),
			tiles: [{ key: 0, x: 0, y: 0, width: 1, height: 1, occupationMap: this.state.occupationMap.slice(0, 1) }],
			metrics: { ticks: 17, tickTotal: 2, maxTick: 1, workerTickMs: 0.1, ...metrics }, events: [{ type: "snapshotEvent", args: [17] }],
		} });
	}
}
function harness(options) {
	const runtime = createBoundRuntime(), workers = [], events = [];
	let snapshots = 0;
	const client = createSimulationClient(runtime, {
		workerFactory: () => {
			const worker = new FakeWorker(options); workers.push(worker); return worker;
		},
		onEvent: (type, ...args) => events.push({ type, args }), onSnapshot: () => { snapshots++; },
	});
	return { runtime, workers, events, client, get snapshots() { return snapshots; } };
}
async function bounded(promise, message) {
	let timer;
	try {
		return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 300); })]);
	} finally { clearTimeout(timer); }
}

function installDerivedRuntime(runtime) {
	Object.assign(runtime, { createTerritoryLedger, getCountryLedger, getSideLedger, createDeterministicJob });
	Object.assign(runtime, createEngine(runtime), createTerritoryRuntime(runtime), createSimulationWorld(runtime));
	const originalMap = runtime.worldControlMap;
	const oldJob = createDeterministicJob({ id: "old-owner-job", totalItems: 1,
		processRange: () => { originalMap[0] = 99; } });
	runtime._simulationJobs.enqueue(oldJob);
	runtime.flushTerritoryLedger();
	const originalLedger = runtime._territoryLedger;
	assert.equal(getCountryLedger(runtime._territoryLedgerSnapshot, 1).owned, 324);
	runtime.frontlineDirLat = new Float32Array(runtime.landMask.length).fill(1);
	runtime.frontlineDirLng = new Float32Array(runtime.landMask.length).fill(2);
	runtime.frontlineFieldTick = 123;
	runtime._frontlineWorkerGeneration = 7;
	runtime._frontlineTerritoryGeneration = 11;
	runtime._coastalLandIndices = [12]; runtime._coastalTopologyReady = true;
	runtime.adjacencyCache = new Map([[1, new Set([2])]]);
	runtime._mopUpDeJureCellCache = new Map([[1, [0]]]);
	runtime._mopUpOwnedCellCache.set(1, [0]);
	let clockResets = 0;
	runtime.resetLocalSimulationClock = () => { clockResets++; };
	runtime.syncFrontlineWorkerPendingState = () => {
		runtime._frontlineWorkerPending = runtime._frontlineWorkerPendingField || runtime._frontlineWorkerPendingLayout;
	};
	runtime.perf._history.push({ tick: 5, marker: "retained profiling history" });
	return { originalMap, originalLedger, oldJob, get clockResets() { return clockResets; } };
}
function setReturnedOwnerData(state) {
	state.worldControlMap.fill(2);
	state.dominantSideMap.fill(1);
	state.primaryOccupierMap.fill(2);
	state.occupationMap.fill(-0.9);
	state.landMask[100] = 0;
	state._simTickCount = 271;
	state.frontlineFieldTick = 270;
	state._frontlinePolyTick = 269;
	state._frontlinePolys = { "0|1": [[[10, 20], [30, 40]]] };
	state.units[0].frontSlot = { pairKey: "0|1", targetLat: 12, targetLng: 20 };
	state.units[0]._taskForceOrder = { type: "ATTACK", targetLat: 12, targetLng: 20 };
	state.units[0].personnel = 1307;
	state.soldiersPerUnit[0] = 1703;
	state.sideSoldiers[0] = 8421;
	state.countryCasualties.set(1, 987);
	state._sideMomentumHistory = [[{ tick: 270, territory: 400 }]];
	state._aiTaskForcesBySide.set("side-1", [{ id: "fresh-force", memberIds: [1], phase: "ATTACKING" }]);
}
function assertFullOwnerIntake(runtime, derived) {
	assert.equal(derived.oldJob.status, "CANCELLED", "old jobs are cancelled before returned arrays replace mirrors");
	assert.equal(derived.originalMap[0], 1, "no old job writes into its previous owner arrays");
	assert.notEqual(runtime.worldControlMap, derived.originalMap);
	assert.notEqual(runtime._territoryLedger, derived.originalLedger);
	assert.equal(getCountryLedger(runtime._territoryLedgerSnapshot, 1).owned, 0,
		"a fresh ledger reads the returned owner grid, rather than recomputing from its previous buffers");
	derived.originalLedger.markAllDirty();
	assert.equal(getCountryLedger(derived.originalLedger.flush().snapshot, 1).owned, 324);
	runtime.worldControlMap[0] = 1;
	runtime._territoryLedger.markControllerChange(0);
	runtime.flushTerritoryLedger();
	assert.equal(getCountryLedger(runtime._territoryLedgerSnapshot, 1).owned, 1,
		"subsequent browser-owned edits update the replacement ledger");
	assert.equal(runtime._simTickCount, 271);
	assert.equal(runtime.frontlineDirLat, null); assert.equal(runtime.frontlineDirLng, null);
	assert.equal(runtime.frontlineFieldTick, -999);
	assert.equal(runtime._frontlineWorkerGeneration, 10, "standalone field epochs advance beyond both owners");
	assert.equal(runtime._frontlineTerritoryGeneration, 14);
	assert.equal(runtime._frontlineWorkerPending, true);
	assert.deepEqual(runtime._frontlinePolys, { "0|1": [[[10, 20], [30, 40]]] });
	assert.equal(runtime._frontlinePolyTick, 269);
	assert.deepEqual(runtime.units[0].frontSlot, { pairKey: "0|1", targetLat: 12, targetLng: 20 });
	assert.deepEqual(runtime.units[0]._taskForceOrder, { type: "ATTACK", targetLat: 12, targetLng: 20 });
	assert.equal(runtime.units[0].personnel, 1307);
	assert.equal(runtime.soldiersPerUnit[0], 1703, "intake does not reset formation scaling");
	assert.equal(runtime.sideSoldiers[0], 8421);
	assert.equal(runtime.countryCasualties.get(1), 987);
	assert.deepEqual(runtime._sideMomentumHistory, [[{ tick: 270, territory: 400 }]]);
	assert.equal(runtime._aiTaskForcesBySide.get("side-1")[0].id, "fresh-force");
	assert.equal(runtime.perf._history[0].marker, "retained profiling history");
	assert.equal(runtime.adjacencyCache, null);
	assert.equal(runtime._mopUpOwnedCellCache.size, 0);
	assert.equal(runtime._mopUpDeJureCellCache.size, 0);
	assert.equal(runtime._coastalTopologyReady, false);
	assert.deepEqual(runtime._coastalLandIndices, []);
	assert.equal(runtime._simulationJobs.size(), 1);
	assert.equal(runtime._simulationJobs.has("coastal-topology"), true);
	runtime._simulationJobs.step();
	assert.equal(runtime._coastalTopologyReady, true);
	assert.ok(runtime._coastalLandIndices.includes(99), "coast rebuild reads the returned land mask");
	assert.equal(derived.clockResets, 1);
}

const originalError = console.error;
console.error = (...args) => { if (!String(args).includes("simulated port failure") && !String(args).includes("simulated recovered state")) originalError(...args); };
try {
	const h = harness();
	try {
		const originalUnits = h.runtime.units, originalCountry = h.runtime.sides[0][0];
		const flagImage = { marker: "UI-owned image" }; originalCountry.flag = flagImage;
		await h.client.start();
		assert.ok(h.client.active && h.client.ownsState);
		assert.equal(h.runtime.worldControlMap.byteLength, 36 * 18 * 2, "starting worker never detaches UI mirrors");
		assert.equal(h.runtime.sideInfluenceMaps.length, 0, "worker takes influence ownership after READY");
		assert.equal(h.workers[0].state.sideInfluenceMaps.length, 2);
		assert.equal(h.workers[0].state.sides[0][0].flag, undefined, "UI images do not cross the transport");
		h.workers[0].publishSnapshot();
		assert.equal(h.runtime._simTickCount, 17);
		assert.equal(h.runtime.perf.ticks, 17);
		assert.equal(h.runtime.occupationMap[0], Math.fround(0.85));
		assert.equal(h.runtime.units[0], originalUnits[0], "presentation preserves existing unit identity");
		assert.equal(h.runtime.sides[0][0], originalCountry);
		assert.equal(h.runtime.sides[0][0].flag, flagImage, "country merges retain UI-owned assets");
		assert.equal(h.snapshots, 1);
		assert.ok(h.events.some(event => event.type === "snapshotEvent"));
		assert.equal(h.workers[0].messages.at(-1).type, "ACK");
		h.client.syncControls(); h.client.syncControls();
		assert.equal(h.workers[0].messages.filter(message => message.type === "CONTROL").length, 1, "unchanged controls are coalesced");
		h.runtime.simSpeed = 4; h.client.syncControls();
		assert.equal(h.workers[0].messages.at(-1).speed, 4);
		h.client.command({ type: "APPLY_TREATY", winnerSideIdx: 0 });
		assert.equal(h.workers[0].messages.at(-1).type, "COMMAND");
		h.workers[0].handoffMode = "wrong-first";
		await h.client.suspend();
		assert.equal(h.runtime._simTickCount, 17, "wrong handoff request ID cannot apply stale state");
		assert.equal(h.runtime.units[0].smokeMarker, "formation-1-owner", "full handoff restores strategic fields");
		assert.equal(h.runtime.sideInfluenceMaps.length, 2);
		assert.ok(!h.client.active && !h.client.ownsState);
		assert.ok(h.workers[0].terminated);
		await h.client.start();
		h.workers[0].emit({ type: "SNAPSHOT", epoch: h.workers[0].epoch, snapshot: { values: { _simTickCount: 9999 } } });
		assert.equal(h.runtime._simTickCount, 17, "old worker generations cannot mutate current mirrors");

		const order = [];
		let mutationStarted;
		const started = new Promise(resolve => { mutationStarted = resolve; });
		const first = h.client.edit(async () => {
			order.push("first-start"); mutationStarted(); await delay(20);
			assert.ok(!h.client.ownsState, "mutation runs after worker ownership was returned");
			h.runtime.units[0].smokeMarker += "-edited"; order.push("first-end"); return 11;
		});
		await started;
		const second = h.client.edit(() => {
			order.push("second"); assert.ok(h.runtime.units[0].smokeMarker.includes("-edited")); return 22;
		});
		assert.deepEqual(await Promise.all([first, second]), [11, 22]);
		assert.deepEqual(order, ["first-start", "first-end", "second"], "edits remain serialized while the preceding mutation temporarily owns state");
		assert.ok(h.client.active);
	} finally { h.client.stop(); }

	const readiness = harness({ autoReady: false });
	const pending = readiness.client.start(); readiness.client.stop(); await pending;
	assert.ok(!readiness.client.active && !readiness.client.ownsState, "stopped readiness cannot start a fallback owner");

	const stopped = harness();
	await stopped.client.start(); stopped.workers[0].handoffMode = "hold";
	const stoppedHandoff = stopped.client.suspend(); const rejection = assert.rejects(stoppedHandoff, /stopped during handoff/);
	stopped.client.stop(); await rejection;

	const failed = harness();
	try {
		await failed.client.start(); failed.workers[0].handoffMode = "error";
		await assert.rejects(bounded(failed.client.suspend(), "handoff hangs after transport failure"), /simulated port failure/);
		assert.ok(!failed.client.active && !failed.client.ownsState, "failed transport releases ownership");
	} finally { failed.client.stop(); }

	const shared = harness();
	try {
		await shared.client.start();
		const owner = shared.workers[0]; owner.handoffMode = "hold";
		let firstDone = false, secondDone = false;
		const firstSuspend = shared.client.suspend().then(() => { firstDone = true; });
		const secondSuspend = shared.client.suspend().then(() => { secondDone = true; });
		await delay(15);
		assert.equal(firstDone, false);
		assert.equal(secondDone, false, "concurrent suspensions wait for the same ownership return");
		assert.equal(owner.messages.filter(message => message.type === "HANDOFF").length, 1);
		assert.equal(shared.client.ownsState, true);
		assert.equal(owner.terminated, false);
		const request = owner.messages.find(message => message.type === "HANDOFF");
		owner.emit({ type: "HANDOFF", epoch: owner.epoch, requestId: request.requestId,
			state: structuredClone(owner.state) });
		await bounded(Promise.all([firstSuspend, secondSuspend]), "concurrent suspensions did not settle after ownership return");
		assert.ok(firstDone && secondDone);
		assert.ok(!shared.client.active && !shared.client.ownsState);
		assert.equal(owner.terminated, true);
	} finally { shared.client.stop(); }

	const recovered = harness();
	try {
		await recovered.client.start();
		const owner = recovered.workers[0]; owner.handoffMode = "recovered-error";
		await bounded(recovered.client.suspend(), "recovered state left a handoff pending");
		assert.equal(recovered.runtime.units[0].smokeMarker, "formation-1-owner");
		assert.equal(recovered.runtime.sideInfluenceMaps.length, 2);
		assert.ok(!recovered.client.active && !recovered.client.ownsState,
			"a recovered handoff returns ownership without starting fallback simulation");
		await delay(25);
		assert.ok(!recovered.client.ownsState);
		assert.equal(recovered.snapshots, 1, "full intake refreshes mirrors once without a fallback timer");
		assert.equal(owner.terminated, true);
	} finally { recovered.client.stop(); }

	const cancelled = harness();
	try {
		await cancelled.client.start();
		const workersBefore = cancelled.workers.length;
		let enter, finish, staleMutations = 0;
		const entered = new Promise(resolve => { enter = resolve; });
		const finishMutation = new Promise(resolve => { finish = resolve; });
		const activeEdit = cancelled.client.edit(async () => {
			enter(); await finishMutation; return "completed started edit";
		});
		await entered;
		const queuedEdit = cancelled.client.edit(() => { staleMutations++; });
		const rejected = assert.rejects(queuedEdit, /cancelled by reset/);
		cancelled.client.stop();
		finish();
		assert.equal(await activeEdit, "completed started edit");
		await rejected;
		assert.equal(staleMutations, 0, "explicit stop cancels an old queued mutation before it can touch replacement state");
		assert.equal(cancelled.workers.length, workersBefore, "an edit completing after stop cannot restart simulation");
		assert.ok(!cancelled.client.active && !cancelled.client.ownsState);
	} finally { cancelled.client.stop(); }

	const profiling = harness();
	try {
		profiling.runtime.perf = createSimulationMetrics("basic");
		await profiling.client.start();
		profiling.client.syncControls();
		const owner = profiling.workers[0];
		const firstGeneration = owner.messages.at(-1).perfResetGeneration;
		owner.publishSnapshot({ controlGeneration: firstGeneration, ticks: 20, history: [{ tick: 20 }] });
		assert.equal(profiling.runtime.perf.ticks, 20);
		profiling.runtime.perf = createSimulationMetrics("basic");
		profiling.client.syncControls();
		const nextGeneration = owner.messages.at(-1).perfResetGeneration;
		assert.equal(nextGeneration, firstGeneration + 1, "same-mode resets still reach the owner");
		owner.publishSnapshot({ controlGeneration: firstGeneration, ticks: 9000, history: [{ tick: 9000 }] });
		assert.equal(profiling.runtime.perf.ticks, 0);
		assert.deepEqual(profiling.runtime.perf._history, [], "a queued pre-reset snapshot cannot contaminate the new profiling window");
		owner.publishSnapshot({ controlGeneration: nextGeneration, ticks: 2, history: [{ tick: 1 }, { tick: 2 }] });
		assert.equal(profiling.runtime.perf.ticks, 2);
		assert.deepEqual(profiling.runtime.perf._history.map(entry => entry.tick), [1, 2]);
	} finally { profiling.client.stop(); }

	for (const handoffMode of ["normal", "recovered-error"]) {
		const full = harness();
		try {
			const derived = installDerivedRuntime(full.runtime);
			const direction = full.runtime.frontlineDirLat;
			await full.client.start();
			const owner = full.workers[0]; owner.handoffMode = handoffMode;
			owner.publishSnapshot();
			assert.equal(full.runtime._territoryLedger, derived.originalLedger);
			assert.equal(full.runtime._simulationJobs.has("old-owner-job"), true,
				"presentation snapshots retain derived ownership and do not clear job queues");
			assert.equal(full.runtime.frontlineDirLat, direction);
			assert.equal(derived.clockResets, 0);
			setReturnedOwnerData(owner.state);
			full.runtime._frontlineWorkerGeneration = 9;
			full.runtime._frontlineTerritoryGeneration = 13;
			await bounded(full.client.suspend(), "full intake did not complete");
			assertFullOwnerIntake(full.runtime, derived);
			assert.equal(full.snapshots, 2, "owner return immediately refreshes unit spatial mirrors");
			assert.equal(full.events.filter(event => event.type === "onPoliticalMapChanged").length, 1);
		} finally { full.client.stop(); }
	}

	const localRuntime = createBoundRuntime();
	const localDerived = installDerivedRuntime(localRuntime);
	const localOwnerData = captureSimulationState(localRuntime);
	setReturnedOwnerData(localOwnerData);
	applySimulationState(localRuntime, localOwnerData);
	// The browser's existing derived ledger/jobs still point to the old territory.
	let localSnapshots = 0, localStaticRefreshes = 0;
	const localClient = createSimulationClient(localRuntime, {
		workerFactory: () => { throw new Error("simulated unavailable worker"); },
		onSnapshot: () => { localSnapshots++; },
		onEvent: type => { if (type === "onPoliticalMapChanged") localStaticRefreshes++; },
	});
	const originalWarn = console.warn;
	try {
		console.warn = (...args) => { if (!String(args).includes("simulated unavailable worker")) originalWarn(...args); };
		await localClient.start();
		localRuntime._frontlineWorkerGeneration = 9;
		localRuntime._frontlineTerritoryGeneration = 13;
		await localClient.suspend();
		assertFullOwnerIntake(localRuntime, localDerived);
		assert.equal(localSnapshots, 1);
		assert.equal(localStaticRefreshes, 1);
		assert.ok(!localClient.active && !localClient.ownsState);
	} finally { console.warn = originalWarn; localClient.stop(); }
	console.log("Client transport ownership, snapshots/assets, coalesced controls, queued edit cancellation, shared suspension, recovered handoff, profiling generations and full-owner derived-cache rebuilds passed.");
} finally { console.error = originalError; }
