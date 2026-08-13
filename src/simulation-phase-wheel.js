import {
	createDeterministicJob,
	createDeterministicJobQueue,
} from "./simulation-jobs.js";

/**
 * One immediate or resumable job registered with a deterministic phase wheel.
 *
 * Resumable jobs split preparation into fixed item ranges. Their finalized
 * result is staged until `flushReadyCommits()` is called, so partial work never
 * becomes visible to the simulation.
 *
 * @typedef {object} SimulationPhaseJob
 * @property {string} id Stable identity used for ordering and default phase selection.
 * @property {number} intervalTicks Positive simulation-tick interval.
 * @property {number} [phaseOffset] Tick offset within the interval. Defaults to a stable hash of `id`.
 * @property {number} [priority=0] Lower priorities run first; ties use `id`.
 * @property {boolean} [oncePerFrame=true] Prevent this job starting twice under the same visual-frame token.
 * @property {(context:object)=>unknown} [run] Immediate job callback.
 * @property {(context:object)=>PhasePreparation} [prepare] Start a fixed-budget resumable preparation.
 * @property {(result:unknown,context:object)=>void} [commit] Atomically publish a completed preparation.
 */

/**
 * Fixed-item preparation returned by a resumable phase job.
 * @typedef {object} PhasePreparation
 * @property {number} totalItems Exclusive upper bound of the deterministic work range.
 * @property {unknown} [state] Private mutable preparation state.
 * @property {(start:number,end:number,state:unknown,context:object)=>void} processRange
 * @property {(state:unknown,context:object)=>unknown} [finalize]
 * @property {number} [maxItemsPerTurn=Infinity]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Staged output that is complete but not yet visible to the simulation.
 * @typedef {object} PhaseCommitTicket
 * @property {string} id Registered phase-job identity.
 * @property {number} sequence Stable preparation sequence.
 * @property {number|string} generation World generation that produced the result.
 * @property {number} dueTick Simulation tick that started preparation.
 * @property {number|string} frameToken Visual-frame token that started preparation.
 * @property {unknown} result Finalized private result.
 */

function nonNegativeInteger(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric)
		? Math.max(0, Math.trunc(numeric))
		: Math.max(0, Math.trunc(Number(fallback) || 0));
}

function positiveInteger(value, fallback = 1) {
	return Math.max(1, nonNegativeInteger(value, fallback));
}

function normalizeOffset(offset, intervalTicks) {
	const interval = positiveInteger(intervalTicks);
	const numeric = Math.trunc(Number(offset) || 0);
	return ((numeric % interval) + interval) % interval;
}

/**
 * Stable FNV-1a hash used only for phase placement, never random decisions.
 * @param {unknown} value
 * @returns {number} Unsigned 32-bit hash.
 */
export function stablePhaseHash(value) {
	const text = String(value ?? "");
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Derive a repeatable phase offset for a stable job id.
 * @param {string} id
 * @param {number} intervalTicks
 * @param {string|number} [salt=""]
 * @returns {number}
 */
export function deterministicPhaseOffset(id, intervalTicks, salt = "") {
	const interval = positiveInteger(intervalTicks);
	return stablePhaseHash(`${String(salt)}\u0000${String(id)}`) % interval;
}

/**
 * Assign deterministic, collision-free offsets while an interval has at least
 * as many phases as jobs. Input order does not affect the result.
 * @param {Array<string>} jobIds
 * @param {number} intervalTicks
 * @param {string|number} [salt=""]
 * @returns {Map<string, number>}
 */
export function assignDeterministicPhaseOffsets(
	jobIds,
	intervalTicks,
	salt = "",
) {
	const interval = positiveInteger(intervalTicks);
	const ids = [...new Set((jobIds || []).map((id) => String(id)))].sort();
	const load = new Uint32Array(interval);
	const assignments = new Map();
	for (const id of ids) {
		const start = deterministicPhaseOffset(id, interval, salt);
		let selected = start;
		let selectedLoad = load[start];
		for (let step = 1; step < interval && selectedLoad > 0; step++) {
			const candidate = (start + step) % interval;
			if (load[candidate] < selectedLoad) {
				selected = candidate;
				selectedLoad = load[candidate];
				if (selectedLoad === 0) break;
			}
		}
		load[selected]++;
		assignments.set(id, selected);
	}
	return assignments;
}

/**
 * Test whether a simulation tick belongs to a periodic phase.
 * @param {number} tick
 * @param {number} intervalTicks
 * @param {number} [phaseOffset=0]
 * @returns {boolean}
 */
export function isSimulationPhaseDue(tick, intervalTicks, phaseOffset = 0) {
	const simulationTick = nonNegativeInteger(tick);
	const interval = positiveInteger(intervalTicks);
	const offset = normalizeOffset(phaseOffset, interval);
	return simulationTick >= offset && (simulationTick - offset) % interval === 0;
}

function validatePhaseJob(options) {
	const id = String(options?.id || "").trim();
	if (!id) throw new TypeError("A phase job requires a stable id.");
	const hasRun = typeof options.run === "function";
	const hasPrepare = typeof options.prepare === "function";
	if (hasRun === hasPrepare) {
		throw new TypeError(
			`Phase job '${id}' requires exactly one of run() or prepare().`,
		);
	}
	if (hasPrepare && typeof options.commit !== "function") {
		throw new TypeError(
			`Resumable phase job '${id}' requires an atomic commit() callback.`,
		);
	}
	const intervalTicks = positiveInteger(options.intervalTicks);
	return {
		id,
		intervalTicks,
		phaseOffset: normalizeOffset(
			options.phaseOffset ?? deterministicPhaseOffset(id, intervalTicks),
			intervalTicks,
		),
		priority: Math.trunc(Number(options.priority) || 0),
		oncePerFrame: options.oncePerFrame !== false,
		run: hasRun ? options.run : null,
		prepare: hasPrepare ? options.prepare : null,
		commit: hasPrepare ? options.commit : null,
	};
}

function validatePreparation(id, preparation) {
	if (!preparation || typeof preparation !== "object") {
		throw new TypeError(`Phase job '${id}' did not return a preparation.`);
	}
	if (typeof preparation.processRange !== "function") {
		throw new TypeError(
			`Phase job '${id}' preparation requires processRange().`,
		);
	}
	return {
		totalItems: nonNegativeInteger(preparation.totalItems),
		state: preparation.state,
		processRange: preparation.processRange,
		finalize:
			typeof preparation.finalize === "function"
				? preparation.finalize
				: (state) => state,
		maxItemsPerTurn: Number.isFinite(Number(preparation.maxItemsPerTurn))
			? positiveInteger(preparation.maxItemsPerTurn)
			: Number.POSITIVE_INFINITY,
		metadata: { ...(preparation.metadata || {}) },
	};
}

function compareRuntime(left, right) {
	return (
		left.spec.priority - right.spec.priority ||
		left.spec.id.localeCompare(right.spec.id)
	);
}

function compareTicket(left, right) {
	return (
		left.dueTick - right.dueTick ||
		left.sequence - right.sequence ||
		left.id.localeCompare(right.id)
	);
}

/**
 * Create a deterministic phase wheel for low-frequency simulation systems.
 * Scheduling uses integer simulation ticks and fixed item budgets only. The
 * only wall-clock-aware helper in this module is `decideRenderAdmission()`,
 * whose result must never feed back into simulation scheduling or outcomes.
 *
 * @param {object} [options]
 * @param {number|string} [options.generation=0]
 * @param {number} [options.itemBudget=4096]
 * @param {number} [options.maxItemsPerJobTurn=1024]
 */
export function createSimulationPhaseWheel(options = {}) {
	let generation = options.generation ?? 0;
	const defaultItemBudget = positiveInteger(options.itemBudget, 4096);
	const queue = createDeterministicJobQueue({
		itemBudget: defaultItemBudget,
		maxItemsPerJobTurn: positiveInteger(
			options.maxItemsPerJobTurn,
			Math.min(1024, defaultItemBudget),
		),
	});
	const runtimes = new Map();
	const internalJobs = new Map();
	/** @type {Array<PhaseCommitTicket>} */
	const readyCommits = [];
	let preparationSequence = 0;

	const resetRuntime = (runtime) => {
		runtime.lastTick = null;
		runtime.lastFrameToken = null;
		runtime.hasLastFrameToken = false;
		runtime.inFlightId = null;
		runtime.lastError = null;
		runtime.runCount = 0;
		runtime.prepareCount = 0;
		runtime.commitCount = 0;
	};

	const orderedRuntimes = () => [...runtimes.values()].sort(compareRuntime);
	const readyForJob = (id) => readyCommits.some((ticket) => ticket.id === id);

	return {
		register(jobOptions) {
			const spec = validatePhaseJob(jobOptions);
			if (runtimes.has(spec.id)) {
				throw new Error(`Phase job '${spec.id}' is already registered.`);
			}
			const runtime = { spec };
			resetRuntime(runtime);
			runtimes.set(spec.id, runtime);
			return {
				id: spec.id,
				intervalTicks: spec.intervalTicks,
				phaseOffset: spec.phaseOffset,
				priority: spec.priority,
			};
		},
		unregister(id, reason = "phase-job-unregistered") {
			const key = String(id);
			const runtime = runtimes.get(key);
			if (!runtime) return false;
			if (runtime.inFlightId) queue.cancel(runtime.inFlightId, reason);
			internalJobs.delete(runtime.inFlightId);
			for (let index = readyCommits.length - 1; index >= 0; index--) {
				if (readyCommits[index].id === key) readyCommits.splice(index, 1);
			}
			runtimes.delete(key);
			return true;
		},
		setGeneration(nextGeneration) {
			if (Object.is(nextGeneration, generation)) return false;
			queue.clear("phase-generation-changed");
			internalJobs.clear();
			readyCommits.length = 0;
			generation = nextGeneration;
			for (const runtime of runtimes.values()) resetRuntime(runtime);
			return true;
		},
		getGeneration() {
			return generation;
		},
		advance({
			tick,
			frameToken = tick,
			context = null,
			itemBudget = defaultItemBudget,
		} = {}) {
			const simulationTick = nonNegativeInteger(tick);
			const immediateRuns = [];
			const preparedStarts = [];
			const skipped = [];
			const errors = [];
			for (const runtime of orderedRuntimes()) {
				const spec = runtime.spec;
				if (
					!isSimulationPhaseDue(
						simulationTick,
						spec.intervalTicks,
						spec.phaseOffset,
					)
				) {
					continue;
				}
				if (runtime.lastTick === simulationTick) {
					skipped.push({ id: spec.id, reason: "duplicate-tick" });
					continue;
				}
				if (
					spec.oncePerFrame &&
					runtime.hasLastFrameToken &&
					Object.is(runtime.lastFrameToken, frameToken)
				) {
					runtime.lastTick = simulationTick;
					skipped.push({ id: spec.id, reason: "duplicate-frame" });
					continue;
				}
				runtime.lastTick = simulationTick;
				runtime.lastFrameToken = frameToken;
				runtime.hasLastFrameToken = true;
				const runContext = {
					id: spec.id,
					generation,
					tick: simulationTick,
					frameToken,
					context,
				};
				if (runtime.inFlightId || readyForJob(spec.id)) {
					skipped.push({ id: spec.id, reason: "preparation-busy" });
					continue;
				}
				if (spec.run) {
					try {
						const result = spec.run(runContext);
						runtime.runCount++;
						immediateRuns.push({ id: spec.id, result });
					} catch (error) {
						runtime.lastError = error;
						errors.push({ id: spec.id, stage: "run", error });
					}
					continue;
				}
				try {
					const preparation = validatePreparation(
						spec.id,
						spec.prepare(runContext),
					);
					const sequence = ++preparationSequence;
					const internalId = `${spec.id}@${String(generation)}:${sequence}`;
					const job = createDeterministicJob({
						id: internalId,
						generation,
						totalItems: preparation.totalItems,
						maxItemsPerTurn: preparation.maxItemsPerTurn,
						metadata: {
							kind: "phase-preparation",
							phaseJobId: spec.id,
							dueTick: simulationTick,
							...preparation.metadata,
						},
						processRange(start, end) {
							preparation.processRange(
								start,
								end,
								preparation.state,
								runContext,
							);
						},
						onComplete(completedJob) {
							const result = preparation.finalize(
								preparation.state,
								runContext,
							);
							completedJob.result = result;
							readyCommits.push({
								id: spec.id,
								sequence,
								generation,
								dueTick: simulationTick,
								frameToken,
								result,
							});
							runtime.inFlightId = null;
							internalJobs.delete(internalId);
						},
					});
					runtime.inFlightId = internalId;
					runtime.prepareCount++;
					internalJobs.set(internalId, { runtime, job });
					queue.enqueue(job);
					preparedStarts.push({
						id: spec.id,
						sequence,
						totalItems: preparation.totalItems,
					});
				} catch (error) {
					runtime.lastError = error;
					errors.push({ id: spec.id, stage: "prepare", error });
				}
			}

			const work = queue.step(itemBudget);
			for (const chunk of work.chunks) {
				if (chunk.status !== "FAILED" && chunk.status !== "CANCELLED") continue;
				const internal = internalJobs.get(chunk.id);
				const runtime = internal?.runtime;
				const job = internal?.job;
				if (runtime) {
					runtime.inFlightId = null;
					runtime.lastError = job?.error || new Error(chunk.status);
					errors.push({
						id: runtime.spec.id,
						stage: "process",
						error: runtime.lastError,
					});
				}
				internalJobs.delete(chunk.id);
			}
			readyCommits.sort(compareTicket);
			return {
				generation,
				tick: simulationTick,
				frameToken,
				immediateRuns,
				preparedStarts,
				skipped,
				errors,
				work,
				readyCommits: readyCommits.map((ticket) => ({
					id: ticket.id,
					sequence: ticket.sequence,
					generation: ticket.generation,
					dueTick: ticket.dueTick,
				})),
			};
		},
		flushReadyCommits({
			expectedGeneration = generation,
			maxCommits = Number.POSITIVE_INFINITY,
			context = null,
		} = {}) {
			if (!Object.is(expectedGeneration, generation)) {
				return {
					committed: [],
					errors: [],
					remaining: readyCommits.length,
					staleGeneration: true,
				};
			}
			const limit = Number.isFinite(Number(maxCommits))
				? nonNegativeInteger(maxCommits)
				: readyCommits.length;
			const committed = [];
			const errors = [];
			for (let count = 0; count < limit && readyCommits.length > 0; count++) {
				const ticket = readyCommits[0];
				const runtime = runtimes.get(ticket.id);
				if (!runtime || !Object.is(ticket.generation, generation)) {
					readyCommits.shift();
					continue;
				}
				try {
					runtime.spec.commit(ticket.result, {
						id: ticket.id,
						sequence: ticket.sequence,
						generation: ticket.generation,
						dueTick: ticket.dueTick,
						frameToken: ticket.frameToken,
						context,
					});
					readyCommits.shift();
					runtime.commitCount++;
					runtime.lastError = null;
					committed.push({
						id: ticket.id,
						sequence: ticket.sequence,
						dueTick: ticket.dueTick,
					});
				} catch (error) {
					runtime.lastError = error;
					errors.push({ id: ticket.id, stage: "commit", error });
					break;
				}
			}
			return {
				committed,
				errors,
				remaining: readyCommits.length,
				staleGeneration: false,
			};
		},
		snapshot() {
			return {
				generation,
				readyCommits: readyCommits.map((ticket) => ({
					id: ticket.id,
					sequence: ticket.sequence,
					generation: ticket.generation,
					dueTick: ticket.dueTick,
				})),
				queuedPreparations: queue.snapshot(),
				jobs: orderedRuntimes().map((runtime) => ({
					id: runtime.spec.id,
					intervalTicks: runtime.spec.intervalTicks,
					phaseOffset: runtime.spec.phaseOffset,
					priority: runtime.spec.priority,
					oncePerFrame: runtime.spec.oncePerFrame,
					lastTick: runtime.lastTick,
					lastFrameToken: runtime.lastFrameToken,
					inFlight: Boolean(runtime.inFlightId),
					commitReady: readyForJob(runtime.spec.id),
					runCount: runtime.runCount,
					prepareCount: runtime.prepareCount,
					commitCount: runtime.commitCount,
					lastError: runtime.lastError,
				})),
			};
		},
		clear(reason = "phase-wheel-cleared") {
			queue.clear(reason);
			internalJobs.clear();
			readyCommits.length = 0;
			for (const runtime of runtimes.values()) resetRuntime(runtime);
		},
	};
}

function activeCommitFlags(commitFlags) {
	if (!commitFlags) return [];
	if (Array.isArray(commitFlags)) {
		return [...new Set(commitFlags.filter(Boolean).map(String))].sort();
	}
	if (commitFlags instanceof Set) {
		return [...commitFlags].filter(Boolean).map(String).sort();
	}
	if (typeof commitFlags === "object") {
		return Object.keys(commitFlags)
			.filter((key) => Boolean(commitFlags[key]))
			.sort();
	}
	return commitFlags ? ["commit"] : [];
}

/**
 * Decide whether to render after a simulation frame. This helper may inspect
 * measured wall-clock work because it controls presentation only. Never use
 * its result to skip, delay, reorder, or budget simulation work.
 *
 * @param {object} [options]
 * @param {boolean} [options.visualDirty=true]
 * @param {number} [options.simulationWorkMs=0]
 * @param {number} [options.simulationBudgetMs=12]
 * @param {object|Array<string>|Set<string>|boolean} [options.commitFlags]
 * @param {number} [options.framesSinceRender=0]
 * @param {number} [options.maxDeferredFrames=2]
 * @param {boolean} [options.force=false]
 * @returns {object}
 */
export function decideRenderAdmission(options = {}) {
	const visualDirty = options.visualDirty !== false;
	const simulationWorkMs = Math.max(0, Number(options.simulationWorkMs) || 0);
	const simulationBudgetMs = Number.isFinite(Number(options.simulationBudgetMs))
		? Math.max(0, Number(options.simulationBudgetMs))
		: 12;
	const framesSinceRender = nonNegativeInteger(options.framesSinceRender);
	const maxDeferredFrames = nonNegativeInteger(options.maxDeferredFrames, 2);
	const commitFlags = activeCommitFlags(options.commitFlags);
	const overBudget = simulationWorkMs > simulationBudgetMs;
	const forcedByStarvation = framesSinceRender >= maxDeferredFrames;
	let admit = false;
	let reason = "clean";
	if (visualDirty) {
		if (options.force) {
			admit = true;
			reason = "forced";
		} else if (forcedByStarvation) {
			admit = true;
			reason = "max-deferral";
		} else if (commitFlags.length > 0 && overBudget) {
			reason = "commit-frame";
		} else if (overBudget) {
			reason = "simulation-over-budget";
		} else {
			admit = true;
			reason = "within-budget";
		}
	}
	return {
		admit,
		reason,
		visualDirty,
		simulationWorkMs,
		simulationBudgetMs,
		overBudget,
		commitFlags,
		framesSinceRender,
		maxDeferredFrames,
		forcedByStarvation,
	};
}
