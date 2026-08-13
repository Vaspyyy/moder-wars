/**
 * @typedef {object} PerfSuiteCase
 * @property {string} id Stable case identity.
 * @property {number} maxUnitsPerSide Requested land formations per side.
 * @property {number} durationMs Measured duration after warm-up.
 * @property {number} warmupMs Unmeasured warm-up duration.
 * @property {number} seed Comparable experiment seed.
 * @property {"basic"|"detailed"} perfMode Instrumentation detail.
 * @property {number} speedIndex Simulation speed index.
 * @property {"POLITICAL"|"FLAG"} viewMode Map rendering mode.
 * @property {boolean} traceMarks Add named User Timing spans for DevTools traces.
 */

/**
 * @typedef {object} PerfSuiteSummary
 * @property {string} schemaVersion
 * @property {string} id
 * @property {string} createdAt
 * @property {Array<object>} cases
 * @property {object} aggregate
 */

/**
 * Optional tactical-grid counters captured by one benchmark report. Older
 * reports may omit this block entirely.
 * @typedef {object} TacticalPerfCounters
 * @property {number} [candidateVisits] Legacy mixed candidate counter.
 * @property {number} [friendlyCandidatePairs] Friendly pair candidates inspected.
 * @property {number} [enemyCandidateVisits] Enemy candidates inspected.
 * @property {number} acceptedPairs Candidate pairs accepted for tactical work.
 * @property {number} friendlyPairs Friendly pairs processed once.
 * @property {number} hostileCellVisits Hostile tactical cells inspected.
 * @property {number} cacheHits Cached tactical decisions reused.
 * @property {number} cacheMisses Tactical decisions that required refresh.
 * @property {number} ghostInvalidations Stale unit references invalidated.
 * @property {number} fastLaneUnits Units using cached task-force movement.
 * @property {number} maxBucketOccupancy Largest occupied tactical cell.
 * @property {number} cellCount Occupied tactical cells.
 * @property {number} insertedUnits Units indexed into tactical cells.
 * @property {number} [sampleTicks] Measured simulation ticks.
 * @property {number} [unitTicks] Sum of live units across measured ticks.
 */

export const PERF_SUITE_SCHEMA_VERSION = "1";
export const PERF_BASELINE_STORAGE_PREFIX = "mw_perf_baseline_v1:";

function finite(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function median(values) {
	if (!values.length) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

function optionalNonNegative(value) {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, value)
		: null;
}

function optionalMedian(values) {
	const available = values.filter((value) => Number.isFinite(value));
	return available.length ? median(available) : null;
}

const TACTICAL_RAW_COUNTER_KEYS = [
	"candidateVisits",
	"friendlyCandidatePairs",
	"enemyCandidateVisits",
	"acceptedPairs",
	"friendlyPairs",
	"hostileCellVisits",
	"cacheHits",
	"cacheMisses",
	"ghostInvalidations",
	"fastLaneUnits",
	"maxBucketOccupancy",
	"cellCount",
	"insertedUnits",
];

const TACTICAL_NORMALIZED_KEYS = [
	"friendlyCandidatePairsPerTick",
	"enemyCandidateVisitsPerUnitTick",
	"acceptedPairsPerTick",
	"friendlyPairsPerTick",
	"hostileCellVisitsPerTick",
	"acceptanceRate",
	"comparableAcceptanceRate",
	"cacheHitRate",
	"cacheMissesPerUnitTick",
	"ghostInvalidationsPerUnitTick",
	"fastLaneShare",
	"averageCellCount",
	"averageInsertedUnits",
];

const TACTICAL_COUNTER_KEYS = [
	...TACTICAL_RAW_COUNTER_KEYS,
	...TACTICAL_NORMALIZED_KEYS,
];

function normalizeTacticalCounters(tactical, report = null) {
	if (!tactical || typeof tactical !== "object") return null;
	const normalized = {};
	let hasCounter = false;
	for (const key of TACTICAL_COUNTER_KEYS) {
		const value = optionalNonNegative(tactical[key]);
		normalized[key] = value;
		if (value !== null) hasCounter = true;
	}
	if (!hasCounter) return null;
	const sampleTicks = Math.max(
		0,
		finite(tactical.sampleTicks, report?.ticks?.count || 0),
	);
	const unitTicks = Math.max(
		0,
		finite(tactical.unitTicks, finite(report?.units?.avg) * sampleTicks),
	);
	const friendlyCandidates = normalized.friendlyCandidatePairs;
	const legacyCandidates = normalized.candidateVisits;
	if (normalized.friendlyCandidatePairsPerTick === null && sampleTicks > 0) {
		normalized.friendlyCandidatePairsPerTick =
			friendlyCandidates !== null ? friendlyCandidates / sampleTicks : null;
	}
	if (
		normalized.enemyCandidateVisitsPerUnitTick === null &&
		unitTicks > 0 &&
		normalized.enemyCandidateVisits !== null
	) {
		normalized.enemyCandidateVisitsPerUnitTick =
			normalized.enemyCandidateVisits / unitTicks;
	}
	for (const [rawKey, normalizedKey] of [
		["acceptedPairs", "acceptedPairsPerTick"],
		["friendlyPairs", "friendlyPairsPerTick"],
		["hostileCellVisits", "hostileCellVisitsPerTick"],
	]) {
		if (normalized[normalizedKey] === null && sampleTicks > 0) {
			normalized[normalizedKey] =
				normalized[rawKey] !== null ? normalized[rawKey] / sampleTicks : null;
		}
	}
	if (normalized.acceptanceRate === null) {
		const denominator = friendlyCandidates ?? legacyCandidates;
		normalized.acceptanceRate =
			denominator > 0 && normalized.acceptedPairs !== null
				? normalized.acceptedPairs / denominator
				: null;
	}
	if (normalized.comparableAcceptanceRate === null) {
		normalized.comparableAcceptanceRate =
			friendlyCandidates !== null ? normalized.acceptanceRate : null;
	}
	const cacheTotal =
		normalized.cacheHits !== null && normalized.cacheMisses !== null
			? normalized.cacheHits + normalized.cacheMisses
			: 0;
	if (normalized.cacheHitRate === null) {
		normalized.cacheHitRate =
			cacheTotal > 0 ? normalized.cacheHits / cacheTotal : null;
	}
	for (const [rawKey, normalizedKey] of [
		["cacheMisses", "cacheMissesPerUnitTick"],
		["ghostInvalidations", "ghostInvalidationsPerUnitTick"],
		["fastLaneUnits", "fastLaneShare"],
	]) {
		if (normalized[normalizedKey] === null && unitTicks > 0) {
			normalized[normalizedKey] =
				normalized[rawKey] !== null ? normalized[rawKey] / unitTicks : null;
		}
	}
	if (normalized.averageCellCount === null) {
		normalized.averageCellCount = normalized.cellCount;
	}
	if (normalized.averageInsertedUnits === null) {
		normalized.averageInsertedUnits = normalized.insertedUnits;
	}
	return normalized;
}

/**
 * Produces median tactical counters while ignoring reports that predate the
 * tactical profiler block. Rates are calculated per run before taking their
 * median so large runs do not silently dominate smaller repetitions.
 */
export function summarizeTacticalPerfReports(reports) {
	const samples = (Array.isArray(reports) ? reports : [])
		.map((report) => normalizeTacticalCounters(report?.tactical, report))
		.filter(Boolean);
	if (!samples.length) return null;
	const summary = { sampleCount: samples.length };
	for (const key of TACTICAL_COUNTER_KEYS) {
		const label = `median${key[0].toUpperCase()}${key.slice(1)}`;
		summary[label] = optionalMedian(samples.map((sample) => sample[key]));
	}
	return summary;
}

function aggregateTacticalCases(cases) {
	const samples = cases.map((entry) => entry.tactical).filter(Boolean);
	if (!samples.length) return null;
	const summary = {
		caseCount: samples.length,
		sampleCount: samples.reduce(
			(total, sample) => total + finite(sample.sampleCount),
			0,
		),
	};
	for (const key of TACTICAL_COUNTER_KEYS) {
		const label = `median${key[0].toUpperCase()}${key.slice(1)}`;
		summary[label] = optionalMedian(samples.map((sample) => sample[label]));
	}
	return summary;
}

function categoryAverage(report, key) {
	return finite(report?.categories?.[key]?.avg);
}

function phaseAverage(report, key) {
	return finite(report?.phases?.[key]?.avg);
}

export function normalizePerfSuiteCases(cases, defaults = {}) {
	const source =
		Array.isArray(cases) && cases.length ? cases : [{ id: "250v250" }];
	return source.map((entry, index) => {
		const maxUnitsPerSide = Math.max(
			1,
			Math.floor(
				finite(entry?.maxUnitsPerSide, defaults.maxUnitsPerSide || 250),
			),
		);
		return {
			id: String(
				entry?.id || `${maxUnitsPerSide}v${maxUnitsPerSide}-${index + 1}`,
			),
			maxUnitsPerSide,
			durationMs: Math.max(
				1000,
				Math.floor(finite(entry?.durationMs, defaults.durationMs || 20_000)),
			),
			warmupMs: Math.max(
				0,
				Math.floor(finite(entry?.warmupMs, defaults.warmupMs ?? 3000)),
			),
			seed: Math.floor(finite(entry?.seed, defaults.seed ?? 0x4d575031)) >>> 0,
			perfMode:
				entry?.perfMode === "detailed" || defaults.perfMode === "detailed"
					? "detailed"
					: "basic",
			speedIndex: Math.max(
				0,
				Math.min(
					2,
					Math.floor(finite(entry?.speedIndex, defaults.speedIndex ?? 2)),
				),
			),
			viewMode:
				entry?.viewMode === "FLAG" || defaults.viewMode === "FLAG"
					? "FLAG"
					: "POLITICAL",
			traceMarks: Boolean(entry?.traceMarks ?? defaults.traceMarks),
		};
	});
}

export function summarizePerfSuiteRuns(runs, metadata = {}) {
	const validRuns = (Array.isArray(runs) ? runs : []).filter(
		(run) => run?.report?.ok && run.report.benchmark,
	);
	const grouped = new Map();
	for (const run of validRuns) {
		const id = String(run.caseId || "benchmark");
		if (!grouped.has(id)) grouped.set(id, []);
		grouped.get(id).push(run);
	}
	const cases = Array.from(grouped, ([id, caseRuns]) => {
		const reports = caseRuns.map((run) => run.report);
		const first = caseRuns[0];
		return {
			id,
			config: first.config || null,
			runs: caseRuns.length,
			medianAvgFps: median(reports.map((report) => report.benchmark.avgFps)),
			medianFrameMs: median(
				reports.map((report) => report.benchmark.avgFrameMs),
			),
			medianP95FrameMs: median(reports.map((report) => report.frames.p95)),
			medianP99FrameMs: median(reports.map((report) => report.frames.p99)),
			worstFrameMs: Math.max(
				...reports.map((report) => report.benchmark.maxFrameMs),
			),
			medianTickMs: median(reports.map((report) => report.ticks.avgMs)),
			medianP95TickMs: median(reports.map((report) => report.ticks.p95Ms)),
			medianTicksPerSecond: median(
				reports.map((report) => report.ticks.approxFps || 0),
			),
			medianMainWorkMs: median(
				reports.map((report) => report.frameStages?.mainWork?.avg || 0),
			),
			medianRenderMs: median(
				reports.map((report) => report.frameStages?.render?.avg || 0),
			),
			medianUnitLoopMs: median(
				reports.map((report) => phaseAverage(report, "unitLoop")),
			),
			medianOperationalAiMs: median(
				reports.map(
					(report) =>
						categoryAverage(report, "operationalIntel") +
						categoryAverage(report, "operationalTaskForces"),
				),
			),
			medianCappedSubticks: median(
				reports.map((report) => report.scheduler?.cappedSubTicks || 0),
			),
			medianLongTasks: median(
				reports.map((report) => report.browser?.longTasks?.count || 0),
			),
			tactical: summarizeTacticalPerfReports(reports),
		};
	});
	return {
		schemaVersion: PERF_SUITE_SCHEMA_VERSION,
		id: String(metadata.id || `perf-${Date.now().toString(36)}`),
		createdAt: metadata.createdAt || new Date().toISOString(),
		build: metadata.build || null,
		environment: metadata.environment || null,
		repetitions: finite(metadata.repetitions, 1),
		cases,
		aggregate: {
			caseCount: cases.length,
			runCount: validRuns.length,
			medianAvgFps: median(cases.map((entry) => entry.medianAvgFps)),
			worstFrameMs: cases.length
				? Math.max(...cases.map((entry) => entry.worstFrameMs))
				: 0,
			medianTickMs: median(cases.map((entry) => entry.medianTickMs)),
			medianOperationalAiMs: median(
				cases.map((entry) => entry.medianOperationalAiMs),
			),
			tactical: aggregateTacticalCases(cases),
		},
	};
}

function percentChange(current, baseline) {
	if (
		!Number.isFinite(current) ||
		!Number.isFinite(baseline) ||
		baseline === 0
	) {
		return null;
	}
	return ((current - baseline) / baseline) * 100;
}

const COMPARISON_METRICS = [
	["medianAvgFps", true],
	["medianFrameMs", false],
	["medianP95FrameMs", false],
	["medianP99FrameMs", false],
	["worstFrameMs", false],
	["medianTickMs", false],
	["medianMainWorkMs", false],
	["medianRenderMs", false],
	["medianUnitLoopMs", false],
	["medianOperationalAiMs", false],
];

const COMPARISON_CONFIG_KEYS = [
	"maxUnitsPerSide",
	"durationMs",
	"warmupMs",
	"seed",
	"perfMode",
	"speedIndex",
	"viewMode",
	"traceMarks",
];

const TACTICAL_COMPARISON_METRICS = [
	["medianCandidateVisits", "informational"],
	["medianFriendlyCandidatePairs", "informational"],
	["medianEnemyCandidateVisits", "informational"],
	["medianAcceptedPairs", "informational"],
	["medianFriendlyPairs", "informational"],
	["medianHostileCellVisits", "informational"],
	["medianCacheHits", "informational"],
	["medianCacheMisses", "informational"],
	["medianGhostInvalidations", "informational"],
	["medianFastLaneUnits", "informational"],
	["medianMaxBucketOccupancy", "informational"],
	["medianCellCount", "informational"],
	["medianInsertedUnits", "informational"],
	["medianFriendlyCandidatePairsPerTick", "lower"],
	["medianEnemyCandidateVisitsPerUnitTick", "lower"],
	["medianAcceptedPairsPerTick", "informational"],
	["medianFriendlyPairsPerTick", "informational"],
	["medianHostileCellVisitsPerTick", "lower"],
	["medianAcceptanceRate", "informational"],
	["medianComparableAcceptanceRate", "higher"],
	["medianCacheHitRate", "higher"],
	["medianCacheMissesPerUnitTick", "lower"],
	["medianGhostInvalidationsPerUnitTick", "lower"],
	["medianFastLaneShare", "higher"],
	["medianAverageCellCount", "informational"],
	["medianAverageInsertedUnits", "informational"],
];

function metricVerdict(changePercent, direction, thresholdPercent) {
	if (direction === "informational") return "INFORMATIONAL";
	if (changePercent === null) return "STABLE";
	const signedImpact = changePercent * (direction === "higher" ? -1 : 1);
	return signedImpact >= thresholdPercent
		? "REGRESSION"
		: signedImpact <= -thresholdPercent
			? "IMPROVEMENT"
			: "STABLE";
}

function compareTacticalSummaries(current, baseline, thresholdPercent) {
	if (!current || !baseline) return null;
	const metrics = {};
	for (const [key, direction] of TACTICAL_COMPARISON_METRICS) {
		const currentValue = optionalNonNegative(current[key]);
		const baselineValue = optionalNonNegative(baseline[key]);
		if (currentValue === null || baselineValue === null) continue;
		const changePercent = percentChange(currentValue, baselineValue);
		metrics[key] = {
			baseline: baselineValue,
			current: currentValue,
			changePercent,
			direction,
			verdict: metricVerdict(changePercent, direction, thresholdPercent),
		};
	}
	const directionalVerdicts = Object.values(metrics)
		.filter((metric) => metric.direction !== "informational")
		.map((metric) => metric.verdict);
	return {
		sampleCount: {
			baseline: finite(baseline.sampleCount),
			current: finite(current.sampleCount),
		},
		verdict: directionalVerdicts.includes("REGRESSION")
			? "REGRESSION"
			: directionalVerdicts.includes("IMPROVEMENT")
				? "IMPROVEMENT"
				: "STABLE",
		metrics,
	};
}

export function comparePerfSuites(current, baseline, thresholdPercent = 5) {
	const baselineById = new Map(
		(Array.isArray(baseline?.cases) ? baseline.cases : []).map((entry) => [
			entry.id,
			entry,
		]),
	);
	const cases = [];
	for (const currentCase of Array.isArray(current?.cases)
		? current.cases
		: []) {
		const baselineCase = baselineById.get(currentCase.id);
		if (!baselineCase) continue;
		const configMismatches = COMPARISON_CONFIG_KEYS.filter(
			(key) => currentCase.config?.[key] !== baselineCase.config?.[key],
		).map((key) => ({
			key,
			baseline: baselineCase.config?.[key] ?? null,
			current: currentCase.config?.[key] ?? null,
		}));
		const compatible = configMismatches.length === 0;
		const metrics = {};
		for (const [key, higherIsBetter] of COMPARISON_METRICS) {
			const currentValue = finite(currentCase[key]);
			const baselineValue = finite(baselineCase[key]);
			const changePercent = percentChange(currentValue, baselineValue);
			const signedImpact =
				changePercent === null ? 0 : changePercent * (higherIsBetter ? -1 : 1);
			metrics[key] = {
				baseline: baselineValue,
				current: currentValue,
				changePercent,
				verdict:
					signedImpact >= thresholdPercent
						? "REGRESSION"
						: signedImpact <= -thresholdPercent
							? "IMPROVEMENT"
							: "STABLE",
			};
		}
		const tactical = compareTacticalSummaries(
			currentCase.tactical,
			baselineCase.tactical,
			thresholdPercent,
		);
		cases.push({
			id: currentCase.id,
			compatible,
			configMismatches,
			metrics,
			tactical,
		});
	}
	const comparableCases = cases.filter((entry) => entry.compatible);
	const verdicts = comparableCases.flatMap((entry) => [
		...Object.values(entry.metrics).map((metric) => metric.verdict),
		...(entry.tactical ? [entry.tactical.verdict] : []),
	]);
	return {
		ok: cases.length > 0,
		comparable: comparableCases.length > 0,
		compatibleCaseCount: comparableCases.length,
		incompatibleCaseCount: cases.length - comparableCases.length,
		thresholdPercent,
		baselineId: baseline?.id || null,
		currentId: current?.id || null,
		verdict:
			comparableCases.length === 0
				? "INCOMPARABLE"
				: verdicts.includes("REGRESSION")
					? "REGRESSION"
					: verdicts.includes("IMPROVEMENT")
						? "IMPROVEMENT"
						: "STABLE",
		cases,
	};
}

export function perfBaselineStorageKey(name = "default") {
	return `${PERF_BASELINE_STORAGE_PREFIX}${String(name || "default")}`;
}
