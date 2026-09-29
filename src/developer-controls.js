// Controls receive live state and commands; they do not import the application.
export function createDeveloperControls(runtime) {
	function bindPerfEnableHandler() {
		window.perfEnable = (mode = "basic") => {
			const normalizedMode = mode === "detailed" ? "detailed" : "basic";
			if (!window.__perf)
				window.__perf = runtime.createPerfState(normalizedMode);
			window.__perf._mode = normalizedMode;
			window.__perf._enabled = true;
			window.__perf._trackingPaused = false;
			window.__perf._measurementStart = performance.now();
			runtime.ensurePerfLongTaskObserver();
			return `perf tracking enabled (${normalizedMode}) — let the sim run, then call window.perfReport()`;
		};
	}

	function bindPerfDisableHandler() {
		window.perfDisable = () => {
			if (window.__perf) {
				window.__perf._mode = "off";
				window.__perf._enabled = false;
			}
			return "perf tracking disabled";
		};
	}

	function bindPerfResetHandler() {
		window.perfReset = (mode = window.__perf?._mode || "off") => {
			const normalizedMode =
				mode === "detailed" ? "detailed" : mode === "basic" ? "basic" : "off";
			window.__perf = runtime.createPerfState(normalizedMode);
			runtime._perfSamples = [];
			runtime._perfFrameTimeSum = 0;
			runtime._perfFrameCount = 0;
			runtime._perfLastTime = 0;
			runtime._perfPendingFrameEntry = null;
			return `perf counters reset (${normalizedMode})`;
		};
	}

	function bindPerfReportJsonHandler() {
		window.perfReportJson = () => {
			const data = runtime.getPerfReportData();
			if (data.ok) {
				const avgs = {};
				for (const [k, stats] of Object.entries(data.categories)) {
					avgs[k] = stats.avg;
				}
				window.__perf._lastReportAvgs = avgs;
			}
			return data;
		};
	}

	function bindPerfReportHandler() {
		window.perfReport = () => {
			const data = runtime.getPerfReportData();
			if (data.ok) {
				const avgs = {};
				for (const [k, stats] of Object.entries(data.categories)) {
					avgs[k] = stats.avg;
				}
				window.__perf._lastReportAvgs = avgs;
			}
			return runtime.formatPerfReport(data);
		};
	}

	function bindPerfTraceEnableHandler() {
		window.perfTraceEnable = (mode = "detailed") => {
			if (!window.__perf || window.__perf._mode === "off")
				window.perfReset(mode);
			performance.clearMeasures();
			runtime._perfTraceMeasureCount = 0;
			window.__perf._traceMarksEnabled = true;
			return "DevTools trace markers enabled. Record a Performance trace, then run the simulation.";
		};
	}

	function bindPerfTraceDisableHandler() {
		window.perfTraceDisable = () => {
			if (window.__perf) window.__perf._traceMarksEnabled = false;
			return "DevTools trace markers disabled.";
		};
	}

	function bindPerfTraceClearHandler() {
		window.perfTraceClear = () => {
			performance.clearMeasures();
			runtime._perfTraceMeasureCount = 0;
			return "Modern Wars trace markers cleared.";
		};
	}

	function bindPerfRunQuickHandler() {
		window.perfRunQuick = (options = {}) =>
			runtime.runPerfSuite({
				...options,
				id: options.id || "quick",
				repetitions: options.repetitions || 1,
				durationMs: options.durationMs || 10_000,
				warmupMs: options.warmupMs ?? 2000,
				perfMode: options.perfMode || "detailed",
				cases: options.cases || [
					{
						id:
							options.caseId ||
							`${options.maxUnitsPerSide || 250}v${options.maxUnitsPerSide || 250}`,
						maxUnitsPerSide: options.maxUnitsPerSide || 250,
					},
				],
			});
	}

	function bindPerfRunSuiteHandler() {
		window.perfRunSuite = runtime.runPerfSuite;
	}

	function bindPerfSuiteReportHandler() {
		window.perfSuiteReport = () =>
			runtime.formatPerfSuite(runtime._lastPerfSuite);
	}

	function bindPerfSuiteJsonHandler() {
		window.perfSuiteJson = () => ({
			summary: runtime._lastPerfSuite,
			runs: runtime._lastPerfSuiteRuns,
		});
	}

	function bindPerfSaveBaselineHandler() {
		window.perfSaveBaseline = (
			name = "default",
			suite = runtime._lastPerfSuite,
		) => {
			if (!suite?.cases?.length) {
				throw new Error(
					"Run perfRunQuick() or perfRunSuite() before saving a baseline.",
				);
			}
			localStorage.setItem(
				runtime.perfBaselineStorageKey(name),
				JSON.stringify(suite),
			);
			return `Saved performance baseline '${name}' (${suite.aggregate.runCount} runs).`;
		};
	}

	function bindPerfLoadBaselineHandler() {
		window.perfLoadBaseline = runtime.loadPerfBaseline;
	}

	function bindPerfCompareBaselineHandler() {
		window.perfCompareBaseline = (
			name = "default",
			suite = runtime._lastPerfSuite,
			thresholdPercent = 5,
		) => {
			const baseline = runtime.loadPerfBaseline(name);
			if (!baseline)
				throw new Error(`Performance baseline '${name}' was not found.`);
			if (!suite)
				throw new Error("Run a performance suite before comparing it.");
			const comparison = runtime.comparePerfSuites(
				suite,
				baseline,
				thresholdPercent,
			);
			console.info(runtime.formatPerfComparison(comparison));
			return comparison;
		};
	}

	function bindPerfClearBaselineHandler() {
		window.perfClearBaseline = (name = "default") =>
			localStorage.removeItem(runtime.perfBaselineStorageKey(name));
	}
	return {
		bindPerfEnableHandler,
		bindPerfDisableHandler,
		bindPerfResetHandler,
		bindPerfReportJsonHandler,
		bindPerfReportHandler,
		bindPerfTraceEnableHandler,
		bindPerfTraceDisableHandler,
		bindPerfTraceClearHandler,
		bindPerfRunQuickHandler,
		bindPerfRunSuiteHandler,
		bindPerfSuiteReportHandler,
		bindPerfSuiteJsonHandler,
		bindPerfSaveBaselineHandler,
		bindPerfLoadBaselineHandler,
		bindPerfCompareBaselineHandler,
		bindPerfClearBaselineHandler,
	};
}
