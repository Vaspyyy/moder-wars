import assert from "node:assert/strict";

import {
	comparePerfSuites,
	normalizePerfSuiteCases,
	perfBaselineStorageKey,
	summarizePerfSuiteRuns,
} from "../src/performance-profiler.js";

const cases = normalizePerfSuiteCases(
	[{ id: "small", maxUnitsPerSide: 100 }],
	{ durationMs: 5000, warmupMs: 1000, seed: 123 },
);
assert.deepEqual(cases[0], {
	id: "small",
	maxUnitsPerSide: 100,
	durationMs: 5000,
	warmupMs: 1000,
	seed: 123,
	perfMode: "basic",
	speedIndex: 2,
	viewMode: "POLITICAL",
	traceMarks: false,
});
assert.equal(
	normalizePerfSuiteCases([{ id: "no-warmup" }], { warmupMs: 0 })[0]
		.warmupMs,
	0,
);

function report(avgFps, frameMs, tickMs, aiMs) {
	return {
		ok: true,
		benchmark: { avgFps, avgFrameMs: frameMs, maxFrameMs: frameMs * 5 },
		frames: { p95: frameMs * 1.5, p99: frameMs * 2 },
		ticks: { avgMs: tickMs, p95Ms: tickMs * 2, approxFps: 1000 / tickMs },
		frameStages: {
			mainWork: { avg: frameMs * 0.8 },
			render: { avg: frameMs * 0.2 },
		},
		phases: { unitLoop: { avg: tickMs * 0.7 } },
		categories: {
			operationalIntel: { avg: aiMs * 0.4 },
			operationalTaskForces: { avg: aiMs * 0.6 },
		},
		scheduler: { cappedSubTicks: 2 },
		browser: { longTasks: { count: 1 } },
	};
}

const baseline = summarizePerfSuiteRuns([
	{ caseId: "small", report: report(30, 33, 12, 2) },
	{ caseId: "small", report: report(32, 31, 10, 1.8) },
]);
const faster = summarizePerfSuiteRuns([
	{ caseId: "small", report: report(36, 27, 8, 1.2) },
	{ caseId: "small", report: report(38, 26, 7, 1.1) },
]);
assert.equal(baseline.cases[0].runs, 2);
assert.equal(baseline.cases[0].medianAvgFps, 31);
assert.equal(comparePerfSuites(faster, baseline).verdict, "IMPROVEMENT");
assert.equal(comparePerfSuites(baseline, faster).verdict, "REGRESSION");
const incompatible = structuredClone(faster);
incompatible.cases[0].config = { ...incompatible.cases[0].config, seed: 999 };
assert.equal(comparePerfSuites(incompatible, baseline).verdict, "INCOMPARABLE");
assert.equal(comparePerfSuites(incompatible, baseline).incompatibleCaseCount, 1);
assert.equal(perfBaselineStorageKey("before"), "mw_perf_baseline_v1:before");

console.log("Performance profiler smoke tests passed");
