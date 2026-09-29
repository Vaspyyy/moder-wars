import { createSimulationClock } from "./simulation-clock.js";
import { createSimulationCore } from "./simulation-core.js";
import {
	applyControlDeltas,
	applySimulationState,
	captureSimulationState,
	collectTransferBuffers,
	createControlDeltaTracker,
	createPresentationSnapshot,
	SIMULATION_PROTOCOL_VERSION,
	unpackPresentationUnits,
} from "./simulation-protocol.js";

/** Rendering reads mirrors. Mutations take an acknowledged handoff from the owner. */
export function createSimulationClient(
	runtime,
	{
		workerFactory = (url) => new Worker(url, { type: "module" }),
		onEvent = () => {},
		onSnapshot = () => {},
	} = {},
) {
	let worker = null,
		local = null,
		clock = null,
		localTimer = null,
		epoch = 0,
		active = false,
		ready = null,
		handoff = null,
		queue = Promise.resolve(),
		signature = "",
		lastLocalSnapshot = 0;
	let nextRequest = 0;
	let pendingEdits = 0;
	let handoffPromise = null,
		editGeneration = 0,
		lastPerf = null,
		perfResetGeneration = 0;
	const events = [];
	function applyFullOwnerState(state, pendingEvents = []) {
		// Jobs and ledgers close over their owner's arrays. A full return replaces
		// those arrays; dirtying the old ledger cannot retarget its references.
		const fieldGeneration = runtime._frontlineWorkerGeneration || 0;
		const territoryGeneration = runtime._frontlineTerritoryGeneration || 0;
		runtime._simulationJobs?.clear("simulation-handoff");
		applySimulationState(runtime, state);
		const reset = {
			_territoryLedger: null,
			_territoryLedgerCitiesSource: null,
			_territoryLedgerCitiesLength: -1,
			_territoryLedgerAppliedCitiesRevision: -1,
			_territoryLedgerDecisionTick: Number.NEGATIVE_INFINITY,
			_territoryDecisionPending: false,
			frontlineDirLat: null,
			frontlineDirLng: null,
			frontlineFieldTick: -999,
			_frontlineWorkerPendingField: true,
			_workerBusy: false,
			_frontlineWorkerGeneration:
				Math.max(fieldGeneration, runtime._frontlineWorkerGeneration || 0) + 1,
			_frontlineTerritoryGeneration:
				Math.max(
					territoryGeneration,
					runtime._frontlineTerritoryGeneration || 0,
				) + 1,
			_coastalLandIndices: [],
			_coastalTopologyReady: false,
			adjacencyCache: null,
			_neutralBorderCacheSignature: "",
			_neutralBorderPolys: {},
			_influenceCityGridSource: null,
			_influenceCityGridSourceLength: -1,
			_influenceCityGridWorldGeneration: -1,
			_enemyCityCacheGeneration: -1,
			_enemyCityCacheSource: null,
			_enemyCityCandidatesBySide: [],
		};
		for (const [key, value] of Object.entries(reset))
			if (key in runtime) runtime[key] = value;
		runtime._mopUpOwnedCellCache?.clear();
		runtime._mopUpDeJureCellCache?.clear();
		runtime._battleHash?.clear();
		runtime._tacticalGrid?.bySide.clear();
		// Keep the owner's current layout/slots, plans, manpower and history.
		runtime.syncFrontlineWorkerPendingState?.();
		runtime.flushTerritoryLedger?.();
		runtime.scheduleCoastalTopologyJob?.();
		runtime.resetLocalSimulationClock?.();
		for (const event of pendingEvents) onEvent(event.type, ...event.args);
		onEvent("onPoliticalMapChanged");
		onSnapshot();
	}
	function applySnapshot(snapshot) {
		applyControlDeltas(runtime, snapshot.tiles);
		applySimulationState(runtime, snapshot.values, {
			preserveCountryControls: true,
		});
		runtime.units = unpackPresentationUnits(snapshot.units, runtime.units);
		if (
			runtime.perf &&
			(snapshot.metrics.controlGeneration == null ||
				snapshot.metrics.controlGeneration === perfResetGeneration)
		) {
			const { history = [], ...counters } = snapshot.metrics;
			Object.assign(runtime.perf, counters);
			runtime.perf._history.push(...history);
			if (runtime.perf._history.length > runtime.PERF_TICK_HISTORY_LIMIT)
				runtime.perf._history.splice(
					0,
					runtime.perf._history.length - runtime.PERF_TICK_HISTORY_LIMIT,
				);
		}

		for (const event of snapshot.events || [])
			onEvent(event.type, ...event.args);
		onSnapshot();
	}
	function stop({ invalidateEdits = true } = {}) {
		if (invalidateEdits) editGeneration++;
		active = false;
		epoch++;
		worker?.terminate();
		worker = null;
		clearTimeout(localTimer);
		localTimer = null;
		local = null;
		clock = null;
		signature = "";
		if (ready) {
			ready.reject(new Error("Simulation stopped before readiness"));
			ready = null;
		}
		if (handoff) {
			handoff.reject(new Error("Simulation stopped during handoff"));
			handoff = null;
		}
	}
	function startLocal(state) {
		const trackerState = {};
		local = createSimulationCore(state, {
			onEvent: (type, ...args) => {
				events.push({ type, args });
				if (type === "onConflictMapChanged" || type === "onPoliticalMapChanged")
					trackerState.tracker?.markAll();
			},
			onControlCellsChanged: (indices) => {
				if (indices == null) trackerState.tracker?.markAll();
				else
					for (const index of typeof indices === "number" ? [indices] : indices)
						trackerState.tracker?.markCell(index);
			},
		});
		trackerState.tracker = createControlDeltaTracker(local.state);
		clock = createSimulationClock(() => local.tick(), {
			speed: local.state.simSpeed,
			paused: local.state.isPaused,
		});
		const turn = () => {
			if (!active || !local) return;
			try {
				clock.pump(performance.now());
				if (
					performance.now() - lastLocalSnapshot >= 1000 / 30 ||
					events.length
				) {
					const snapshot = createPresentationSnapshot(
						local.state,
						trackerState.tracker,
						{
							includeTopology: events.some(
								(event) =>
									event.type === "onConflictMapChanged" ||
									event.type === "onPoliticalMapChanged",
							),
						},
					);
					snapshot.events = events.splice(0);
					applySnapshot(snapshot);
					lastLocalSnapshot = performance.now();
				}
			} catch (error) {
				active = false;
				console.error("Simulation stopped", error);
			}
			if (active) localTimer = setTimeout(turn, 8);
		};
		localTimer = setTimeout(turn, 8);
	}
	async function start() {
		stop({ invalidateEdits: false });
		const generation = epoch;
		const initial = captureSimulationState(runtime);
		active = true;
		try {
			worker = workerFactory(
				new URL("../workers/war-simulation-worker.js", import.meta.url),
			);
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(
					() =>
						ready?.reject(new Error("Simulation worker did not initialize")),
					5000,
				);
				ready = {
					resolve: () => {
						clearTimeout(timeout);
						ready = null;
						resolve();
					},
					reject: (error) => {
						clearTimeout(timeout);
						ready = null;
						reject(error);
					},
				};
				worker.onmessage = ({ data }) => {
					if (data.epoch !== epoch) return;
					if (data.type === "READY") ready?.resolve();
					else if (data.type === "SNAPSHOT") {
						applySnapshot(data.snapshot);
						worker?.postMessage({ type: "ACK", epoch });
					} else if (data.type === "HANDOFF") {
						if (!handoff || data.requestId !== handoff.requestId) return;
						applyFullOwnerState(data.state, data.events);
						handoff?.resolve();
						handoff = null;
					} else if (data.type === "ERROR") {
						console.error("Simulation worker failed", data.message);
						if (ready) ready.reject(new Error(data.message));
						else if (data.state) {
							worker?.terminate();
							worker = null;
							applyFullOwnerState(data.state, data.events);
							if (handoff) {
								handoff.resolve();
								handoff = null;
							} else startLocal(data.state);
						} else {
							active = false;
							runtime.isPaused = true;
							worker?.terminate();
							worker = null;
							handoff?.reject(new Error(data.message));
							handoff = null;
						}
					}
				};
				worker.onerror = (error) => {
					if (ready) ready.reject(error);
					else {
						active = false;
						runtime.isPaused = true;
						worker?.terminate();
						worker = null;
						handoff?.reject(error);
						handoff = null;
						console.error("Simulation worker failed", error);
					}
				};
				worker.postMessage(
					{
						type: "INIT",
						epoch,
						version: SIMULATION_PROTOCOL_VERSION,
						state: initial,
					},
					collectTransferBuffers(initial),
				);
			});
			if (
				generation === epoch &&
				Object.getOwnPropertyDescriptor(runtime, "sideInfluenceMaps")?.set
			)
				runtime.sideInfluenceMaps = [];
		} catch (error) {
			if (generation !== epoch) return;
			worker?.terminate();
			worker = null;
			console.warn("Using local simulation owner:", error.message);
			startLocal(captureSimulationState(runtime));
			if (Object.getOwnPropertyDescriptor(runtime, "sideInfluenceMaps")?.set)
				runtime.sideInfluenceMaps = [];
		}
	}
	async function suspend() {
		if (handoffPromise) return handoffPromise;
		if (!active) {
			if (!handoff) {
				worker?.terminate();
				worker = null;
			}
			return;
		}
		syncControls();
		active = false;
		clearTimeout(localTimer);
		if (local) {
			applyFullOwnerState(
				captureSimulationState(local.state, { denseInfluence: true }),
				events.splice(0),
			);
			local = null;
			clock = null;
			return;
		}
		if (worker) {
			const pending = new Promise((resolve, reject) => {
				const requestId = ++nextRequest;
				handoff = { resolve, reject, requestId };
				worker.postMessage({
					type: "HANDOFF",
					epoch,
					requestId,
				});
			});
			handoffPromise = pending
				.then(() => {
					worker?.terminate();
					worker = null;
				})
				.finally(() => {
					handoffPromise = null;
				});
			return handoffPromise;
		}
	}
	function edit(mutation) {
		if (!active && !handoff && pendingEdits === 0) return mutation();
		pendingEdits++;
		const queuedGeneration = editGeneration;
		const result = queue.then(async () => {
			if (queuedGeneration !== editGeneration)
				throw new Error("Simulation edit cancelled by reset");
			const wasActive = active;
			const generation = epoch;
			await suspend();
			if (queuedGeneration !== editGeneration)
				throw new Error("Simulation edit cancelled by reset");
			try {
				return await mutation();
			} finally {
				if (
					wasActive &&
					generation === epoch &&
					runtime.gameState === "SIMULATING" &&
					!runtime.godModeActive
				)
					await start();
			}
		});
		result
			.finally(() => {
				pendingEdits--;
			})
			.catch(() => {});
		queue = result.catch(() => {});
		return result;
	}
	function command(command) {
		if (worker && active)
			worker.postMessage({ type: "COMMAND", epoch, command });
		else if (local && active) local.command(command);
	}
	function syncControls() {
		if (!active) return;
		if (runtime.perf !== lastPerf) {
			lastPerf = runtime.perf;
			perfResetGeneration++;
		}
		const control = {
			perfResetGeneration,
			perfTrackingPaused: runtime.perf?._trackingPaused || false,
			type: "CONTROL",
			treatyNoticeVisible: runtime.isTreatyNoticeVisible?.() || false,
			paused: runtime.isPaused || runtime.gameState !== "SIMULATING",
			speed: runtime.simSpeed,
			CONFIG: runtime.CONFIG,
			mountainsEnabled: runtime.mountainsEnabled,
			bombsDisabled: runtime.bombsDisabled,
			peaceTreatiesDisabled: runtime.peaceTreatiesDisabled,
			invisibleBuffsEnabled: runtime.invisibleBuffsEnabled,
			perfMode: runtime.perf?._mode || "off",
			countryPatches: runtime.sides
				.flat()
				.map(({ id, name, role, strategy, buffState, hiddenBuffState }) => ({
					name,
					id,
					role,
					strategy,
					buffState,
					hiddenBuffState:
						hiddenBuffState ??
						runtime.countryMetadata[id - 1]?.hiddenBuffState ??
						"none",
				})),
		};
		const next = JSON.stringify(control);
		if (next === signature) return;
		signature = next;
		if (worker) worker.postMessage({ ...control, epoch });
		else if (local) {
			local.command(control);
			clock.configure({
				speed: local.state.simSpeed,
				paused: local.state.isPaused || local.state.gameState !== "SIMULATING",
			});
		}
	}
	if (globalThis.document?.addEventListener) {
		for (const event of ["input", "change", "click"])
			document.addEventListener(event, syncControls);
	}
	return {
		start,
		stop,
		suspend,
		edit,
		command,
		syncControls,
		get active() {
			return active;
		},
		get ownsState() {
			return !!(worker || local);
		},
	};
}
