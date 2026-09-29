// Dependencies are supplied by the application; this module does not import it.
export function createPerformanceRuntime(runtime) {
	function createPerfState(mode = "off") {
		return {
			...runtime.PERF_COUNTER_DEFAULTS,
			_mode: mode,
			_enabled: mode !== "off",
			_trackingPaused: false,
			_measurementStart: mode === "off" ? null : performance.now(),
			_traceMarksEnabled: false,
			_history: [],
			_frameHistory: [],
			_frameSpikes: [],
			_longTasks: [],
			_memorySamples: [],
			_frozenReport: null,
			_scheduler: {
				frames: 0,
				renderedFrames: 0,
				skippedRenderFrames: 0,
				requestedSubTicks: 0,
				executedSubTicks: 0,
				cappedSubTickFrames: 0,
				cappedSubTicks: 0,
				accumulatorSum: 0,
				maxAccumulator: 0,
			},
			_lastBenchmark: null,
		};
	}

	function ensurePerfLongTaskObserver() {
		if (
			runtime._perfLongTaskObserver ||
			typeof PerformanceObserver === "undefined"
		)
			return;
		try {
			const supported = PerformanceObserver.supportedEntryTypes || [];
			if (!supported.includes("longtask")) return;
			runtime._perfLongTaskObserver = new PerformanceObserver((list) => {
				if (
					!window.__perf ||
					window.__perf._trackingPaused ||
					(window.__perf._mode === "off" &&
						!runtime._isBenchmarking &&
						!runtime._isBenchmarkWarmingUp)
				) {
					return;
				}
				for (const entry of list.getEntries()) {
					if (
						window.__perf._measurementStart !== null &&
						entry.startTime < window.__perf._measurementStart
					) {
						continue;
					}
					window.__perf._longTasks.push({
						name: entry.name || "longtask",
						startTime: entry.startTime,
						duration: entry.duration,
						frame: runtime.simFrameCount,
						tick: runtime._simTickCount,
					});
				}
				if (
					window.__perf._longTasks.length > runtime.PERF_LONG_TASK_HISTORY_LIMIT
				) {
					window.__perf._longTasks.splice(
						0,
						window.__perf._longTasks.length -
							runtime.PERF_LONG_TASK_HISTORY_LIMIT,
					);
				}
			});
			runtime._perfLongTaskObserver.observe({ type: "longtask" });
		} catch (_error) {
			runtime._perfLongTaskObserver = null;
		}
	}

	function recordPerfMemorySample() {
		if (!window.__perf || runtime.simFrameCount % 60 !== 0) return;
		const memory = performance.memory;
		if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return;
		window.__perf._memorySamples.push({
			frame: runtime.simFrameCount,
			tick: runtime._simTickCount,
			usedBytes: memory.usedJSHeapSize,
			totalBytes: memory.totalJSHeapSize,
			limitBytes: memory.jsHeapSizeLimit,
		});
		if (
			window.__perf._memorySamples.length > runtime.PERF_MEMORY_HISTORY_LIMIT
		) {
			window.__perf._memorySamples.shift();
		}
	}

	function recordPerfMeasure(name, startTime, duration, detail = undefined) {
		if (
			!window.__perf?._traceMarksEnabled ||
			!Number.isFinite(startTime) ||
			!Number.isFinite(duration) ||
			duration < 0
		) {
			return;
		}
		try {
			performance.measure(`MW · ${name}`, {
				start: startTime,
				duration,
				detail,
			});
			runtime._perfTraceMeasureCount++;
			if (runtime._perfTraceMeasureCount >= 2000) {
				performance.clearMeasures();
				runtime._perfTraceMeasureCount = 0;
			}
		} catch (_error) {
			window.__perf._traceMarksEnabled = false;
		}
	}
	return {
		createPerfState,
		ensurePerfLongTaskObserver,
		recordPerfMemorySample,
		recordPerfMeasure,
	};
}
