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
