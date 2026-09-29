// Dependencies are supplied by the application; this module does not import it.
export function createPerformanceReports(runtime) {
	function percentile(sortedValues, ratio) {
		if (!sortedValues.length) return 0;
		const idx = Math.min(
			sortedValues.length - 1,
			Math.floor(sortedValues.length * ratio),
		);
		return sortedValues[idx] || 0;
	}

	function summarizeSamples(samples) {
		if (!samples.length) {
			return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
		}
		const sorted = [...samples].sort((a, b) => a - b);
		const total = samples.reduce((sum, value) => sum + value, 0);
		return {
			count: samples.length,
			min: sorted[0],
			p50: percentile(sorted, 0.5),
			p95: percentile(sorted, 0.95),
			p99: percentile(sorted, 0.99),
			max: sorted[sorted.length - 1],
			avg: total / samples.length,
		};
	}

	function getRenderSkipCadence() {
		if (runtime.simSpeed >= 5) return "1 / 5 frames rendered";
		if (runtime.simSpeed >= 3) return "1 / 4 frames rendered";
		if (runtime.simSpeed >= 2) return "1 / 2 frames rendered";
		return "every frame";
	}

	function getPerfConfigSnapshot() {
		return {
			build: document.title || null,
			gridRes: runtime.CONFIG.GRID_RES,
			mapResolution: runtime.mapResSelect?.value || null,
			maxUnitsPerSide: runtime.CONFIG.MAX_UNITS_PER_SIDE,
			simSpeed: runtime.simSpeed,
			viewMode: runtime.viewMode,
			unitCount: runtime.units.length,
			sideCount: runtime.sides.length,
			renderSkipCadence: getRenderSkipCadence(),
			staleTargetScanInterval:
				runtime.simSpeed >= 3
					? runtime.CONFIG.STALE_TARGET_SCAN_INTERVAL_FAST
					: runtime.CONFIG.STALE_TARGET_SCAN_INTERVAL,
			staleTargetMaxCacheDistSq:
				runtime.simSpeed >= 3
					? runtime.CONFIG.STALE_TARGET_MAX_CACHE_DIST_SQ_FAST
					: runtime.CONFIG.STALE_TARGET_MAX_CACHE_DIST_SQ,
			frontlineFieldUpdateInterval: runtime.FRONTLINE_FIELD_UPDATE_INTERVAL,
			frontlinePolyUpdateInterval: runtime.FRONTLINE_POLY_UPDATE_INTERVAL,
			operationalAi: runtime.gameMode === "CONQUEST",
			traceMarksEnabled: window.__perf?._traceMarksEnabled === true,
		};
	}

	function getPerfEnvironmentSnapshot() {
		return {
			userAgent: navigator.userAgent,
			hardwareConcurrency: navigator.hardwareConcurrency || null,
			deviceMemoryGiB: navigator.deviceMemory || null,
			devicePixelRatio: window.devicePixelRatio || 1,
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
			},
			crossOriginIsolated: window.crossOriginIsolated === true,
		};
	}

	function recordPerfFrame(entry) {
		if (
			!window.__perf ||
			(window.__perf._mode === "off" &&
				!runtime._isBenchmarking &&
				!entry.benchmark)
		) {
			return;
		}
		if (!window.__perf._frameHistory) window.__perf._frameHistory = [];
		window.__perf._frameHistory.push(entry);
		if (window.__perf._frameHistory.length > runtime.PERF_FRAME_HISTORY_LIMIT) {
			window.__perf._frameHistory.shift();
		}
		if (entry.ms < 100) return;

		const history = window.__perf._history || [];
		const relatedTicks = history.filter(
			(tick) => tick.tick >= entry.tickStart && tick.tick <= entry.tickEnd,
		);
		const categoryTotals = {};
		for (const tick of relatedTicks) {
			for (const [name, ms] of Object.entries(tick.cats || {})) {
				categoryTotals[name] = (categoryTotals[name] || 0) + ms;
			}
		}
		const topCategories = Object.entries(categoryTotals)
			.filter(([name]) => !runtime.PERF_EXCLUSIVE_PHASES.includes(name))
			.map(([name, ms]) => ({ name, ms }))
			.sort((left, right) => right.ms - left.ms)
			.slice(0, 5);
		const tickMs = relatedTicks.reduce((sum, tick) => sum + tick.ms, 0);
		const reason =
			entry.ms >= 350 ? ">=350ms" : entry.ms >= 250 ? ">=250ms" : ">=100ms";
		if (!window.__perf._frameSpikes) window.__perf._frameSpikes = [];
		window.__perf._frameSpikes.push({
			...entry,
			reason,
			ticks: {
				start: entry.tickStart,
				end: entry.tickEnd,
				count: relatedTicks.length,
				totalMs: tickMs,
				topCategories,
			},
		});
		if (window.__perf._frameSpikes.length > runtime.PERF_SPIKE_HISTORY_LIMIT) {
			window.__perf._frameSpikes.shift();
		}
	}

	function getPerfReportData() {
		if (window.__perf?._trackingPaused && window.__perf._frozenReport) {
			return window.__perf._frozenReport;
		}
		const h = window.__perf?._history || [];
		const frameEntries = window.__perf?._frameHistory || [];
		const benchmark = window.__perf?._lastBenchmark || null;
		if (!h.length && !frameEntries.length && !benchmark) {
			return {
				ok: false,
				message:
					"no perf history yet — call window.perfEnable() and let the sim run",
				instrumentation: window.__perf?._mode || "off",
				benchmark: window.__perf?._lastBenchmark || null,
				config: getPerfConfigSnapshot(),
			};
		}
		const n = h.length;
		const tickSummary = summarizeSamples(h.map((e) => e.ms));

		// Unit stats
		const unitCounts = h.map((e) => e.units || 0);
		const avgUnits = n > 0 ? unitCounts.reduce((s, v) => s + v, 0) / n : 0;
		const maxUnits = unitCounts.length ? Math.max(...unitCounts) : 0;
		const taskForceCounts = frameEntries.map((entry) => entry.taskForces || 0);
		const averageTaskForces = taskForceCounts.length
			? taskForceCounts.reduce((sum, value) => sum + value, 0) /
				taskForceCounts.length
			: 0;

		// Per-category averages, percentiles, and max
		const catKeys = Object.keys(h[0]?.cats || {});
		const catSamples = {};
		for (const k of catKeys) catSamples[k] = [];
		for (const e of h) {
			for (const k of catKeys) {
				catSamples[k].push(e.cats[k] || 0);
			}
		}
		const categories = {};
		for (const k of catKeys) categories[k] = summarizeSamples(catSamples[k]);
		const phases = {};
		for (const key of runtime.PERF_EXCLUSIVE_PHASES) {
			phases[key] = categories[key] || summarizeSamples([]);
		}
		const phaseTotals = h.map((entry) =>
			runtime.PERF_EXCLUSIVE_PHASES.reduce(
				(sum, key) => sum + Math.max(0, entry.cats?.[key] || 0),
				0,
			),
		);
		const unattributedTick = h.map((entry, index) =>
			Math.max(0, entry.ms - phaseTotals[index]),
		);
		phases.unattributed = summarizeSamples(unattributedTick);

		// Reassessment totals from history
		const reassessKeys = [
			"proposalRuns",
			"proposalFailed",
			"reassess_noPlan",
			"reassess_interval",
			"reassess_forced",
			"reassess_territory",
			"reassess_posture",
			"reassess_ratio",
		];
		const reassessTotals = {};
		for (const k of reassessKeys) reassessTotals[k] = 0;
		for (const e of h) {
			if (e.reassess) {
				for (const k of reassessKeys) reassessTotals[k] += e.reassess[k] || 0;
			}
		}

		// Delta since last report (per-tick average change)
		const categoryAvgs = {};
		for (const [k, stats] of Object.entries(categories))
			categoryAvgs[k] = stats.avg;
		const prevAvgs = window.__perf._lastReportAvgs;
		const delta = {};
		if (prevAvgs) {
			for (const k of catKeys)
				delta[k] = (categoryAvgs[k] || 0) - (prevAvgs[k] || 0);
		}

		// Water avoidance debug counters from history
		const waterKeys = [
			"coastDeflectHalved",
			"knockbackBlocked",
			"waterPathPenalized",
			"coastStuckAbandoned",
		];
		const waterTotals = {};
		for (const k of waterKeys) waterTotals[k] = 0;
		for (const e of h) {
			if (e.water) {
				for (const k of waterKeys) waterTotals[k] += e.water[k] || 0;
			}
		}
		const waterTotal = Object.values(waterTotals).reduce((s, v) => s + v, 0);
		const tacticalCounterKeys = [
			"tacticalFriendlyCandidatePairs",
			"tacticalEnemyCandidateVisits",
			"tacticalAcceptedPairs",
			"tacticalFriendlyPairs",
			"tacticalHostileCellVisits",
			"tacticalCacheHits",
			"tacticalCacheMisses",
			"tacticalGhostInvalidations",
			"tacticalFastLaneUnits",
		];
		const tacticalTotals = Object.fromEntries(
			tacticalCounterKeys.map((key) => [key, 0]),
		);
		for (const entry of h) {
			for (const key of tacticalCounterKeys) {
				tacticalTotals[key] += entry.tactical?.[key] || 0;
			}
		}
		const tacticalUnitTicks = h.reduce(
			(total, entry) => total + Math.max(0, entry.units || 0),
			0,
		);
		const tacticalMaxBucketOccupancy = h.length
			? Math.max(...h.map((entry) => entry.tactical?.maxBucketOccupancy || 0))
			: 0;
		const tacticalAverageCellCount = n
			? h.reduce(
					(total, entry) => total + (entry.tactical?.cellCount || 0),
					0,
				) / n
			: 0;
		const tacticalAverageInsertedUnits = n
			? h.reduce(
					(total, entry) => total + (entry.tactical?.insertedUnits || 0),
					0,
				) / n
			: 0;
		const tacticalCacheQueries =
			tacticalTotals.tacticalCacheHits + tacticalTotals.tacticalCacheMisses;
		const tactical = {
			sampleTicks: n,
			unitTicks: tacticalUnitTicks,
			friendlyCandidatePairs: tacticalTotals.tacticalFriendlyCandidatePairs,
			enemyCandidateVisits: tacticalTotals.tacticalEnemyCandidateVisits,
			acceptedPairs: tacticalTotals.tacticalAcceptedPairs,
			friendlyPairs: tacticalTotals.tacticalFriendlyPairs,
			hostileCellVisits: tacticalTotals.tacticalHostileCellVisits,
			cacheHits: tacticalTotals.tacticalCacheHits,
			cacheMisses: tacticalTotals.tacticalCacheMisses,
			ghostInvalidations: tacticalTotals.tacticalGhostInvalidations,
			fastLaneUnits: tacticalTotals.tacticalFastLaneUnits,
			friendlyCandidatePairsPerTick:
				n > 0 ? tacticalTotals.tacticalFriendlyCandidatePairs / n : 0,
			enemyCandidateVisitsPerUnitTick:
				tacticalUnitTicks > 0
					? tacticalTotals.tacticalEnemyCandidateVisits / tacticalUnitTicks
					: 0,
			acceptedPairsPerTick:
				n > 0 ? tacticalTotals.tacticalAcceptedPairs / n : 0,
			friendlyPairsPerTick:
				n > 0 ? tacticalTotals.tacticalFriendlyPairs / n : 0,
			hostileCellVisitsPerTick:
				n > 0 ? tacticalTotals.tacticalHostileCellVisits / n : 0,
			acceptanceRate:
				tacticalTotals.tacticalFriendlyCandidatePairs > 0
					? tacticalTotals.tacticalAcceptedPairs /
						tacticalTotals.tacticalFriendlyCandidatePairs
					: 0,
			cacheHitRate:
				tacticalCacheQueries > 0
					? tacticalTotals.tacticalCacheHits / tacticalCacheQueries
					: 0,
			cacheMissesPerUnitTick:
				tacticalUnitTicks > 0
					? tacticalTotals.tacticalCacheMisses / tacticalUnitTicks
					: 0,
			ghostInvalidationsPerUnitTick:
				tacticalUnitTicks > 0
					? tacticalTotals.tacticalGhostInvalidations / tacticalUnitTicks
					: 0,
			fastLaneShare:
				tacticalUnitTicks > 0
					? tacticalTotals.tacticalFastLaneUnits / tacticalUnitTicks
					: 0,
			maxBucketOccupancy: tacticalMaxBucketOccupancy,
			averageCellCount: tacticalAverageCellCount,
			averageInsertedUnits: tacticalAverageInsertedUnits,
			// Compatibility aliases used by reports written before the counters split.
			candidateVisits:
				tacticalTotals.tacticalFriendlyCandidatePairs +
				tacticalTotals.tacticalEnemyCandidateVisits,
			cellCount: tacticalAverageCellCount,
			insertedUnits: tacticalAverageInsertedUnits,
		};

		const frameSummary = summarizeSamples(frameEntries.map((e) => e.ms));
		const renderSummary = summarizeSamples(
			frameEntries.filter((e) => e.rendered).map((e) => e.renderMs || 0),
		);
		const frameStages = {
			mainWork: summarizeSamples(
				frameEntries.map((entry) => entry.mainWorkMs || 0),
			),
			simulation: summarizeSamples(
				frameEntries.map((entry) => entry.simulationMs || 0),
			),
			hud: summarizeSamples(frameEntries.map((entry) => entry.hudMs || 0)),
			render: summarizeSamples(
				frameEntries.map((entry) => entry.renderMs || 0),
			),
			otherMain: summarizeSamples(
				frameEntries.map((entry) => entry.otherMainMs || 0),
			),
			browserWait: summarizeSamples(
				frameEntries.map((entry) => entry.browserWaitMs || 0),
			),
		};
		const longTasks = window.__perf._longTasks || [];
		const longTaskSummary = summarizeSamples(
			longTasks.map((entry) => entry.duration || 0),
		);
		const memorySamples = window.__perf._memorySamples || [];
		const firstMemory = memorySamples[0]?.usedBytes || null;
		const lastMemory = memorySamples.at(-1)?.usedBytes || null;
		const scheduler = window.__perf._scheduler || {};
		const avgAccumulator =
			scheduler.frames > 0 ? scheduler.accumulatorSum / scheduler.frames : 0;
		const verdict = benchmark
			? {
					target: "avg FPS >=25, max frame <350ms",
					avgFpsPass: benchmark.avgFps >= 25,
					maxFramePass: benchmark.maxFrameMs < 350,
					pass: benchmark.avgFps >= 25 && benchmark.maxFrameMs < 350,
					topLikelyCause:
						benchmark.maxFrameMs >= 350
							? "long frame spike"
							: benchmark.avgFps < 25
								? "sustained frame cost"
								: "within target",
				}
			: null;
		const rankedPhases = Object.entries(phases)
			.filter(([key]) => key !== "unattributed")
			.sort((left, right) => right[1].avg - left[1].avg);
		const rankedDetails = Object.entries(categories)
			.filter(([key]) => !runtime.PERF_EXCLUSIVE_PHASES.includes(key))
			.sort((left, right) => right[1].avg - left[1].avg);
		const rankedFrameStages = ["simulation", "hud", "render", "otherMain"]
			.map((key) => [key, frameStages[key]])
			.sort((left, right) => right[1].avg - left[1].avg);
		const recommendations = [];
		const topFrameStage = rankedFrameStages[0]?.[0] || null;
		const topPhase = rankedPhases[0]?.[0] || null;
		const topDetail = rankedDetails[0]?.[0] || null;
		if (topFrameStage === "simulation") {
			recommendations.push(
				`Simulation dominates main-thread work; start with ${topPhase || "the hottest tick phase"}${topDetail ? `, especially ${topDetail}` : ""}.`,
			);
		} else if (topFrameStage === "render") {
			recommendations.push(
				"Canvas rendering dominates measured work; profile renderer draw loops, map invalidation, and label/unit culling.",
			);
		} else if (topFrameStage === "hud") {
			recommendations.push(
				"DOM/HUD updates dominate measured work; reduce update frequency and avoid rebuilding unchanged War Desk or casualty nodes.",
			);
		}
		const operationalAiAverage = categories.operationalTaskForces?.avg || 0;
		if (operationalAiAverage > tickSummary.avg * 0.1) {
			recommendations.push(
				"Operational AI exceeds 10% of tick time; inspect contact refresh breadth and task-force reassessment frequency.",
			);
		}
		if ((scheduler.cappedSubTicks || 0) > 0) {
			recommendations.push(
				"The scheduler is capping requested subticks; improve simulation throughput before increasing render frequency.",
			);
		}
		if (longTaskSummary.max >= 100) {
			recommendations.push(
				"Long main-thread tasks are causing visible stalls; inspect the recorded spike frames and correlate them with territory phases or worker applies.",
			);
		}

		return {
			ok: true,
			instrumentation: window.__perf._mode || "off",
			ticks: {
				count: n,
				avgMs: tickSummary.avg,
				minMs: tickSummary.min,
				p50Ms: tickSummary.p50,
				p95Ms: tickSummary.p95,
				p99Ms: tickSummary.p99,
				maxMs: tickSummary.max,
				approxFps: tickSummary.avg > 0 ? 1000 / tickSummary.avg : null,
			},
			frames: {
				...frameSummary,
				avgFps: frameSummary.avg > 0 ? 1000 / frameSummary.avg : null,
				renderedFrameRenderMs: renderSummary,
				spikes: window.__perf._frameSpikes || [],
			},
			frameStages,
			units: {
				avg: avgUnits,
				max: maxUnits,
				current: runtime.units.length,
			},
			taskForces: {
				avg: averageTaskForces,
				max: taskForceCounts.length ? Math.max(...taskForceCounts) : 0,
				current: Array.from(runtime._aiTaskForcesBySide.values()).reduce(
					(sum, taskForces) => sum + taskForces.length,
					0,
				),
			},
			categories,
			phases,
			categoryDeltaSinceLastReport: delta,
			reassess: reassessTotals,
			water: {
				total: waterTotal,
				...waterTotals,
			},
			tactical,
			frontlineWorker: {
				dispatches: window.__perf.frontlineWorkerDispatches || 0,
				completed: window.__perf.frontlineWorkerCompleted || 0,
				coalesced: window.__perf.frontlineWorkerCoalesced || 0,
				errors: window.__perf.frontlineWorkerErrors || 0,
				staleResults: window.__perf.frontlineWorkerStaleResults || 0,
				busy: runtime._workerBusy,
				pending: runtime._frontlineWorkerPending,
				pendingField: runtime._frontlineWorkerPendingField,
				pendingLayout: runtime._frontlineWorkerPendingLayout,
				lastDurationMs: window.__perf.frontlineWorkerLastDurationMs || 0,
				maxDurationMs: window.__perf.frontlineWorkerMaxDurationMs || 0,
				lastFieldDurationMs:
					window.__perf.frontlineWorkerFieldLastDurationMs || 0,
				maxFieldDurationMs:
					window.__perf.frontlineWorkerFieldMaxDurationMs || 0,
				layoutDispatches: window.__perf.frontlineWorkerLayoutDispatches || 0,
				layoutCompleted: window.__perf.frontlineWorkerLayoutCompleted || 0,
				layoutCoalesced: window.__perf.frontlineWorkerLayoutCoalesced || 0,
				layoutErrors: window.__perf.frontlineWorkerLayoutErrors || 0,
				lastLayoutDurationMs:
					window.__perf.frontlineWorkerLayoutLastDurationMs || 0,
				maxLayoutDurationMs:
					window.__perf.frontlineWorkerLayoutMaxDurationMs || 0,
			},
			scheduler: {
				frames: scheduler.frames || 0,
				renderedFrames: scheduler.renderedFrames || 0,
				skippedRenderFrames: scheduler.skippedRenderFrames || 0,
				requestedSubTicks: scheduler.requestedSubTicks || 0,
				executedSubTicks: scheduler.executedSubTicks || 0,
				cappedSubTickFrames: scheduler.cappedSubTickFrames || 0,
				cappedSubTicks: scheduler.cappedSubTicks || 0,
				avgAccumulator,
				maxAccumulator: scheduler.maxAccumulator || 0,
			},
			benchmark,
			verdict,
			config: getPerfConfigSnapshot(),
			environment: getPerfEnvironmentSnapshot(),
			browser: {
				longTasks: {
					...longTaskSummary,
					entries: longTasks.slice(-20),
				},
				memory: {
					supported: memorySamples.length > 0,
					samples: memorySamples.length,
					firstUsedBytes: firstMemory,
					lastUsedBytes: lastMemory,
					deltaBytes:
						firstMemory !== null && lastMemory !== null
							? lastMemory - firstMemory
							: null,
					peakUsedBytes: memorySamples.length
						? Math.max(...memorySamples.map((entry) => entry.usedBytes))
						: null,
				},
			},
			analysis: {
				topFrameStage,
				topPhase,
				topDetail,
				operationalAiAverageMs: operationalAiAverage,
				recommendations,
			},
		};
	}

	function formatMs(value) {
		return Number.isFinite(value) ? value.toFixed(1) : "—";
	}

	function formatPerfReport(data) {
		if (!data.ok) return data.message;
		const tickFps =
			data.ticks.approxFps && Number.isFinite(data.ticks.approxFps)
				? data.ticks.approxFps.toFixed(0)
				: "—";
		const lines = [];
		lines.push(
			`=== PERF REPORT (${data.ticks.count} ticks, ${data.instrumentation} instrumentation, avg ${formatMs(data.ticks.avgMs)}ms, ~${tickFps} tick/s) ===`,
		);
		if (data.benchmark) {
			const v = data.verdict;
			lines.push(
				`  benchmark: ${v.pass ? "PASS" : "FAIL"} avgFPS ${data.benchmark.avgFps.toFixed(0)} (${v.avgFpsPass ? "pass" : "fail"}) | maxFrame ${formatMs(data.benchmark.maxFrameMs)}ms (${v.maxFramePass ? "pass" : "fail"})`,
			);
			lines.push(`  target: ${v.target} | likely cause: ${v.topLikelyCause}`);
		}
		lines.push(
			`  ticks: min ${formatMs(data.ticks.minMs)}ms | p50 ${formatMs(data.ticks.p50Ms)}ms | p95 ${formatMs(data.ticks.p95Ms)}ms | p99 ${formatMs(data.ticks.p99Ms)}ms | max ${formatMs(data.ticks.maxMs)}ms`,
		);
		if (data.frames.count > 0) {
			lines.push(
				`  frames: avg ${formatMs(data.frames.avg)}ms (${data.frames.avgFps.toFixed(0)} FPS) | p95 ${formatMs(data.frames.p95)}ms | p99 ${formatMs(data.frames.p99)}ms | max ${formatMs(data.frames.max)}ms | spikes ${data.frames.spikes.length}`,
			);
			lines.push(
				`  render: avg ${formatMs(data.frames.renderedFrameRenderMs.avg)}ms/rendered frame | p95 ${formatMs(data.frames.renderedFrameRenderMs.p95)}ms | max ${formatMs(data.frames.renderedFrameRenderMs.max)}ms`,
			);
			lines.push(
				`  frame work: main ${formatMs(data.frameStages.mainWork.avg)}ms | sim ${formatMs(data.frameStages.simulation.avg)}ms | HUD ${formatMs(data.frameStages.hud.avg)}ms | render ${formatMs(data.frameStages.render.avg)}ms | other ${formatMs(data.frameStages.otherMain.avg)}ms | browser wait ${formatMs(data.frameStages.browserWait.avg)}ms`,
			);
		}
		lines.push(
			`  units: avg ${data.units.avg.toFixed(0)} | max ${data.units.max} | current ${data.units.current} | task forces avg ${data.taskForces.avg.toFixed(1)} max ${data.taskForces.max}`,
		);
		lines.push(
			`  scheduler: rendered ${data.scheduler.renderedFrames}/${data.scheduler.frames} frames | subticks ${data.scheduler.executedSubTicks}/${data.scheduler.requestedSubTicks} | cappedFrames ${data.scheduler.cappedSubTickFrames} | cappedSubticks ${data.scheduler.cappedSubTicks}`,
		);
		const tacticalCacheRate = (
			(data.tactical?.cacheHitRate || 0) * 100
		).toFixed(1);
		lines.push(
			`  tactical grid: ${formatMs(data.tactical?.averageCellCount || 0)} cells/tick | max bucket ${data.tactical?.maxBucketOccupancy || 0} | enemy candidates ${formatMs(data.tactical?.enemyCandidateVisitsPerUnitTick || 0)}/unit-tick | friendly pairs ${formatMs(data.tactical?.acceptedPairsPerTick || 0)}/tick | cache ${tacticalCacheRate}% | fast lane ${((data.tactical?.fastLaneShare || 0) * 100).toFixed(1)}% | ghosts ${formatMs(data.tactical?.ghostInvalidationsPerUnitTick || 0)}/unit-tick`,
		);
		lines.push(
			`  frontline worker: ${data.frontlineWorker.completed}/${data.frontlineWorker.dispatches} done | layout ${data.frontlineWorker.layoutCompleted}/${data.frontlineWorker.layoutDispatches} (${formatMs(data.frontlineWorker.lastLayoutDurationMs)}ms, max ${formatMs(data.frontlineWorker.maxLayoutDurationMs)}ms) | errors ${data.frontlineWorker.errors}/${data.frontlineWorker.layoutErrors} | stale ${data.frontlineWorker.staleResults} | ${data.frontlineWorker.busy ? "busy" : "idle"}${data.frontlineWorker.pending ? `, pending${data.frontlineWorker.pendingField ? " field" : ""}${data.frontlineWorker.pendingLayout ? " layout" : ""}` : ""}`,
		);
		lines.push(
			`  config: simSpeed ${data.config.simSpeed}x | view ${data.config.viewMode} | grid ${data.config.gridRes} | map ${data.config.mapResolution || "n/a"} | render ${data.config.renderSkipCadence}`,
		);
		lines.push("  ─────────────────────────────────────────────");
		lines.push("  exclusive tick phases (these add up to tick time):");
		for (const key of [...runtime.PERF_EXCLUSIVE_PHASES, "unattributed"]) {
			const stats = data.phases[key];
			if (!stats || stats.avg < 0.01) continue;
			const rawPct = data.ticks.avgMs > 0 ? stats.avg / data.ticks.avgMs : 0;
			const pct = Number.isFinite(rawPct) ? (rawPct * 100).toFixed(0) : "—";
			lines.push(
				`    ${key.padEnd(16)} ${formatMs(stats.avg).padStart(6)}ms (${pct.padStart(2)}%) p95:${formatMs(stats.p95).padStart(5)}ms p99:${formatMs(stats.p99).padStart(5)}ms max:${formatMs(stats.max).padStart(5)}ms`,
			);
		}
		lines.push("  nested hot operations (diagnostic; do not add percentages):");

		const sorted = Object.entries(data.categories)
			.filter(([key]) => !runtime.PERF_EXCLUSIVE_PHASES.includes(key))
			.sort((a, b) => b[1].avg - a[1].avg);
		for (const [k, stats] of sorted) {
			if (stats.avg < 0.05 || Number.isNaN(stats.avg)) continue;
			const delta = data.categoryDeltaSinceLastReport[k];
			const deltaStr =
				typeof delta === "number"
					? `  Δ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}ms`
					: "";
			lines.push(
				`    ${k.padEnd(24)} ${stats.avg.toFixed(1).padStart(6)}ms p95:${formatMs(stats.p95).padStart(5)}ms p99:${formatMs(stats.p99).padStart(5)}ms max:${formatMs(stats.max).padStart(5)}ms${deltaStr}`,
			);
		}

		lines.push("  ─────────────────────────────────────────────");
		lines.push(
			`  reassess: ${data.reassess.proposalRuns} runs | forced: ${data.reassess.reassess_forced} | failed: ${data.reassess.proposalFailed}`,
		);
		lines.push(
			`    noPlan:${data.reassess.reassess_noPlan}  interval:${data.reassess.reassess_interval}  forced:${data.reassess.reassess_forced}  territory:${data.reassess.reassess_territory}  posture:${data.reassess.reassess_posture}  ratio:${data.reassess.reassess_ratio}`,
		);
		if (data.water.total > 0) {
			lines.push(`  water avoidance: ${data.water.total} events`);
			lines.push(
				`    pathPenalized:${data.water.waterPathPenalized}  coastDeflectHalved:${data.water.coastDeflectHalved}  knockbackBlocked:${data.water.knockbackBlocked}  coastStuckAbandoned:${data.water.coastStuckAbandoned}`,
			);
		}
		if (data.frames.spikes.length > 0) {
			lines.push("  ─────────────────────────────────────────────");
			lines.push("  recent frame spikes:");
			data.frames.spikes.slice(-5).forEach((spike) => {
				const topCat = spike.ticks?.topCategories?.[0];
				const catText = topCat
					? ` | ${spike.ticks.count} ticks (${formatMs(spike.ticks.totalMs)}ms), hot: ${topCat.name} ${formatMs(topCat.ms)}ms`
					: "";
				lines.push(
					`    ${formatMs(spike.ms)}ms at frame ${spike.frame} (${spike.reason}) | work ${formatMs(spike.mainWorkMs)}ms, sim ${formatMs(spike.simulationMs)}ms, HUD ${formatMs(spike.hudMs)}ms, render ${formatMs(spike.renderMs)}ms${catText}`,
				);
			});
		}
		if (data.browser.longTasks.count > 0 || data.browser.memory.supported) {
			lines.push("  ─────────────────────────────────────────────");
			lines.push(
				`  browser: long tasks ${data.browser.longTasks.count} (p95 ${formatMs(data.browser.longTasks.p95)}ms, max ${formatMs(data.browser.longTasks.max)}ms) | heap ${data.browser.memory.supported ? `${(data.browser.memory.lastUsedBytes / 1048576).toFixed(1)} MiB (${data.browser.memory.deltaBytes >= 0 ? "+" : ""}${(data.browser.memory.deltaBytes / 1048576).toFixed(1)} MiB)` : "unavailable"}`,
			);
		}
		if (data.analysis.recommendations.length > 0) {
			lines.push("  ─────────────────────────────────────────────");
			lines.push(
				`  diagnosis: frame=${data.analysis.topFrameStage || "n/a"} | phase=${data.analysis.topPhase || "n/a"} | nested=${data.analysis.topDetail || "n/a"}`,
			);
			for (const recommendation of data.analysis.recommendations) {
				lines.push(`    → ${recommendation}`);
			}
		}
		return lines.join("\n");
	}

	function formatPerfSuite(summary) {
		if (!summary?.cases?.length) return "No completed performance-suite runs.";
		const lines = [
			`=== PERF SUITE ${summary.id} · ${summary.aggregate.runCount} runs ===`,
		];
		for (const entry of summary.cases) {
			lines.push(
				`${entry.id}: ${entry.medianAvgFps.toFixed(1)} FPS | frame p95 ${formatMs(entry.medianP95FrameMs)}ms p99 ${formatMs(entry.medianP99FrameMs)}ms worst ${formatMs(entry.worstFrameMs)}ms | tick ${formatMs(entry.medianTickMs)}ms | unit loop ${formatMs(entry.medianUnitLoopMs)}ms | operational AI ${formatMs(entry.medianOperationalAiMs)}ms`,
			);
		}
		return lines.join("\n");
	}

	function formatPerfComparison(comparison) {
		if (!comparison?.ok) return "No matching performance cases to compare.";
		const lines = [
			`=== PERF COMPARISON: ${comparison.verdict} (threshold ${comparison.thresholdPercent}%) ===`,
		];
		for (const entry of comparison.cases) {
			lines.push(`  ${entry.id}${entry.compatible ? "" : " · INCOMPARABLE"}`);
			if (!entry.compatible) {
				for (const mismatch of entry.configMismatches) {
					lines.push(
						`    config ${mismatch.key}: baseline=${mismatch.baseline} current=${mismatch.current}`,
					);
				}
				continue;
			}
			for (const [key, metric] of Object.entries(entry.metrics)) {
				if (metric.changePercent === null) continue;
				lines.push(
					`    ${key}: ${metric.changePercent >= 0 ? "+" : ""}${metric.changePercent.toFixed(1)}% · ${metric.verdict}`,
				);
			}
		}
		return lines.join("\n");
	}

	async function runPerfSuite(options = {}) {
		const repetitions = Math.max(
			1,
			Math.floor(Number(options.repetitions) || 3),
		);
		const requestedCases = options.cases || [
			{ id: "100v100", maxUnitsPerSide: 100 },
			{ id: "250v250", maxUnitsPerSide: 250 },
			{ id: "500v500", maxUnitsPerSide: 500 },
		];
		const cases = runtime.normalizePerfSuiteCases(requestedCases, {
			maxUnitsPerSide: options.maxUnitsPerSide || 250,
			durationMs: options.durationMs || 15_000,
			warmupMs: options.warmupMs ?? 3000,
			perfMode: options.perfMode || "detailed",
			speedIndex: options.speedIndex ?? runtime.SPEED_STEPS.length - 1,
			viewMode: options.viewMode || "POLITICAL",
			traceMarks: options.traceMarks === true,
		});
		const runs = [];
		for (const suiteCase of cases) {
			for (let repetition = 1; repetition <= repetitions; repetition++) {
				console.info(
					`[MW PERF] ${suiteCase.id} · run ${repetition}/${repetitions} · warm-up ${(suiteCase.warmupMs / 1000).toFixed(1)}s · measure ${(suiteCase.durationMs / 1000).toFixed(1)}s`,
				);
				const report = await runtime.startBenchmark({
					...suiteCase,
					caseId: suiteCase.id,
				});
				runs.push({
					caseId: suiteCase.id,
					repetition,
					config: suiteCase,
					report,
				});
			}
		}
		runtime._lastPerfSuiteRuns = runs;
		runtime._lastPerfSuite = runtime.summarizePerfSuiteRuns(runs, {
			id: options.id,
			build: document.title,
			environment: getPerfEnvironmentSnapshot(),
			repetitions,
		});
		console.info(formatPerfSuite(runtime._lastPerfSuite));
		return runtime._lastPerfSuite;
	}

	function loadPerfBaseline(name = "default") {
		try {
			const raw = localStorage.getItem(runtime.perfBaselineStorageKey(name));
			return raw ? JSON.parse(raw) : null;
		} catch (_error) {
			return null;
		}
	}

	function finalizePendingPerfFrame(frameDurationMs) {
		const entry = runtime._perfPendingFrameEntry;
		if (!entry) return;
		entry.ms = frameDurationMs;
		entry.browserWaitMs = Math.max(0, frameDurationMs - entry.mainWorkMs);
		if (entry.benchmark) runtime._perfSamples.push(frameDurationMs);
		recordPerfFrame(entry);
		runtime._perfPendingFrameEntry = null;
	}

	function queuePerfFrame(entry, frameStartedAt) {
		if (!entry) return;
		entry.mainWorkMs = performance.now() - frameStartedAt;
		entry.otherMainMs = Math.max(
			0,
			entry.mainWorkMs - entry.simulationMs - entry.hudMs - entry.renderMs,
		);
		entry.tickEnd = window.__perf?.ticks || entry.tickStart - 1;
		entry.tickCount = Math.max(0, entry.tickEnd - entry.tickStart + 1);
		runtime.recordPerfMeasure(
			"Frame · Main Work",
			frameStartedAt,
			entry.mainWorkMs,
			{
				frame: entry.frame,
				rendered: entry.rendered,
				ticks: entry.tickCount,
			},
		);
		runtime.recordPerfMeasure(
			"Frame · Simulation",
			entry.simulationStart,
			entry.simulationMs,
		);
		runtime.recordPerfMeasure("Frame · HUD", entry.hudStart, entry.hudMs);
		runtime.recordPerfMeasure(
			"Frame · Render",
			entry.renderStart,
			entry.renderMs,
		);
		runtime._perfPendingFrameEntry = entry;
		runtime.recordPerfMemorySample();
	}
	return {
		percentile,
		summarizeSamples,
		getRenderSkipCadence,
		getPerfConfigSnapshot,
		getPerfEnvironmentSnapshot,
		recordPerfFrame,
		getPerfReportData,
		formatMs,
		formatPerfReport,
		formatPerfSuite,
		formatPerfComparison,
		runPerfSuite,
		loadPerfBaseline,
		finalizePendingPerfFrame,
		queuePerfFrame,
	};
}
