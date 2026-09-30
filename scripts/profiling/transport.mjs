import {
	isMainThread,
	parentPort,
	Worker,
	workerData,
} from "node:worker_threads";
import { createLiveContext } from "../../src/runtime-context.js";
import { createSimulationCore } from "../../src/simulation-core.js";
import {
	applyControlDeltas,
	applySimulationState,
	collectTransferBuffers,
	createControlDeltaTracker,
	createPresentationSnapshot,
	unpackPresentationUnits,
} from "../../src/simulation-protocol.js";
import { createProfileFixture, repeatableRandom } from "./fixture.mjs";
import { distribution } from "./statistics.mjs";

// Exercise the production core and wire format through real Node worker messages.
// Advance two logical ticks per ACK, without the browser worker's real-time sleep.
export function runTransport(options) {
	const originalRandom = Math.random;
	let mirror;
	try {
		Math.random = repeatableRandom();
		mirror = createProfileFixture(options).state;
	} finally {
		Math.random = originalRandom;
	}
	// Browser mirrors expose live setters; plain state objects would ignore
	// primitive fields when passed to applySimulationState.
	const mirrorState = mirror;
	const keys = Object.keys(mirrorState);
	mirror = createLiveContext(
		Object.fromEntries(keys.map((key) => [key, () => mirrorState[key]])),
		Object.fromEntries(
			keys.map((key) => [
				key,
				(value) => {
					mirrorState[key] = value;
				},
			]),
		),
	);
	const worker = new Worker(new URL(import.meta.url), {
		workerData: options,
		execArgv: [],
	});
	const applyTimes = [],
		deliveryTimes = [],
		byteCounts = [];
	return new Promise((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(
			() => fail(new Error("Transport probe exceeded 5 minutes")),
			300000,
		);
		function fail(error) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			worker.terminate();
			reject(error);
		}
		worker.on("error", fail);
		worker.on("exit", (code) => {
			if (!settled)
				fail(new Error(`Worker exited before completing (${code})`));
		});
		worker.on("message", (message) => {
			try {
				if (message.error) return fail(new Error(message.error));
				if (message.result) {
					settled = true;
					clearTimeout(timeout);
					worker.terminate();
					resolve({
						...message.result,
						apply: distribution(applyTimes),
						delivery: distribution(deliveryTimes),
						payloadBytes: distribution(byteCounts, { budget: null }),
						finalMirrorTick: mirror._simTickCount,
						finalMirrorUnits: mirror.units.length,
					});
					return;
				}
				const received = process.hrtime.bigint();
				const started = performance.now();
				const snapshot = message.snapshot;
				applyControlDeltas(mirror, snapshot.tiles);
				applySimulationState(mirror, snapshot.values, {
					preserveCountryControls: true,
				});
				mirror.units = unpackPresentationUnits(snapshot.units, mirror.units);
				const applyMs = performance.now() - started;
				if (message.measured) {
					applyTimes.push(applyMs);
					deliveryTimes.push(Number(received - message.sentNs) / 1e6);
					byteCounts.push(message.bytes);
				}
				worker.postMessage({ ack: true });
			} catch (error) {
				fail(error);
			}
		});
	});
}

if (!isMainThread) {
	console.log = console.info = () => {};
	let tracker;
	let core;
	let remaining;
	let started;
	let postedAt;
	let measured = false;
	let topology = false;
	const events = [];
	const tickTimes = [],
		packTimes = [],
		postTimes = [],
		ackTimes = [];
	try {
		Math.random = repeatableRandom();
		const { state, fixture } = createProfileFixture(workerData);
		core = createSimulationCore(state, {
			onEvent(type, ...args) {
				events.push({ type, args });
				if (type === "onConflictMapChanged" || type === "onPoliticalMapChanged")
					topology = true;
			},
			onControlCellsChanged(indices) {
				if (!tracker) return;
				if (indices == null) tracker.markAll();
				else
					for (const index of typeof indices === "number" ? [indices] : indices)
						tracker.markCell(index);
			},
		});
		tracker = createControlDeltaTracker(core.state);
		for (let tick = 0; tick < workerData.warmup; tick++)
			if (!core.tick()) throw new Error("War ended during transport warmup");
		remaining = workerData.ticks;
		function sendSnapshot(includeTopology = false) {
			const begin = performance.now();
			const snapshot = createPresentationSnapshot(core.state, tracker, {
				includeTopology: includeTopology || topology,
			});
			topology = false;
			snapshot.events = events.splice(0);
			const transfers = collectTransferBuffers(snapshot);
			const bytes = transfers.reduce(
				(sum, buffer) => sum + buffer.byteLength,
				0,
			);
			if (measured) packTimes.push(performance.now() - begin);
			const postBegin = performance.now();
			parentPort.postMessage(
				{ snapshot, bytes, measured, sentNs: process.hrtime.bigint() },
				transfers,
			);
			if (measured) postTimes.push(performance.now() - postBegin);
			postedAt = performance.now();
		}
		parentPort.on("message", () => {
			try {
				if (measured) ackTimes.push(performance.now() - postedAt);
				else {
					measured = true;
					started = performance.now();
				}
				if (!remaining) {
					parentPort.postMessage({
						result: {
							fixture,
							tick: distribution(tickTimes),
							pack: distribution(packTimes),
							post: distribution(postTimes),
							ackWait: distribution(ackTimes),
							wallMs: performance.now() - started,
							snapshots: packTimes.length,
							finalTick: core.state._simTickCount,
							finalUnits: core.state.units.length,
						},
					});
					parentPort.close();
					return;
				}
				for (let turn = 0; turn < 2 && remaining; turn++, remaining--) {
					const begin = performance.now();
					if (!core.tick())
						throw new Error("War ended during transport measurement");
					tickTimes.push(performance.now() - begin);
				}
				sendSnapshot();
			} catch (error) {
				parentPort.postMessage({ error: error.stack });
				parentPort.close();
			}
		});
		sendSnapshot(true); // Synchronize all warmup deltas before timing messages.
	} catch (error) {
		parentPort.postMessage({ error: error.stack });
		parentPort.close();
	}
}
