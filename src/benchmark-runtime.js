import { showAlert } from "./dialogs.js";
// Dependencies are supplied by the application; this module does not import it.
export function createBenchmarkRuntime(runtime) {
	function restoreBenchmarkSettings() {
		runtime._benchmarkForcePersonnelPerSide = null;
		runtime._benchmarkSuppressAutomaticPuppets = false;
		if (!runtime._benchmarkRestoreSettings) return;
		runtime.CONFIG.MAX_UNITS_PER_SIDE =
			runtime._benchmarkRestoreSettings.maxUnitsPerSide;
		if (runtime.noPeaceCheckbox) {
			runtime.noPeaceCheckbox.checked =
				runtime._benchmarkRestoreSettings.noPeaceChecked;
		}
		runtime._benchmarkRestoreSettings = null;
	}

	function prepareIsolatedBenchmarkRun() {
		runtime.simulationClient?.stop();
		runtime.resetLocalSimulationClock?.();
		runtime.invalidateWarLifecycleTimers();
		if (runtime.animationFrameId !== null) {
			cancelAnimationFrame(runtime.animationFrameId);
			runtime.animationFrameId = null;
		}
		if (runtime.backgroundTickId) {
			clearInterval(runtime.backgroundTickId);
			runtime.backgroundTickId = null;
		}
		if (
			runtime.initialWorldControlMapSnapshot?.length ===
				runtime.worldControlMap?.length &&
			runtime.initialDeJureMapSnapshot?.length === runtime.deJureMap?.length &&
			runtime.initialProvinceMapSnapshot?.length ===
				runtime.provinceMap?.length &&
			runtime.initialLandMaskSnapshot?.length === runtime.landMask?.length
		) {
			runtime.worldControlMap.set(runtime.initialWorldControlMapSnapshot);
			runtime.deJureMap.set(runtime.initialDeJureMapSnapshot);
			runtime.provinceMap.set(runtime.initialProvinceMapSnapshot);
			runtime.landMask.set(runtime.initialLandMaskSnapshot);
			if (
				runtime.initialBiomeMaskSnapshot?.length === runtime.biomeMask?.length
			) {
				runtime.biomeMask.set(runtime.initialBiomeMaskSnapshot);
			}
			if (runtime.initialCountryMetadataSnapshot) {
				runtime.countryMetadata = runtime.deepClone(
					runtime.initialCountryMetadataSnapshot,
				);
			}
			if (runtime.initialCitiesSnapshot)
				runtime.cities = runtime.deepClone(runtime.initialCitiesSnapshot);
		}
		runtime.occupationMap.fill(0);
		runtime.resetSideInfluenceMaps();
		runtime.primaryOccupierMap.fill(0);
		runtime.units = [];
		runtime.unitSpatialHash.clear();
		for (const sideHash of runtime.unitHashBySide) sideHash.clear();
		runtime.bombs = [];
		runtime.explosions = [];
		runtime.bases = [];
		runtime.activeBattles = [];
		runtime._battleHash.clear();
		runtime.resetOperationalAiRuntime();
		document.body.classList.remove("conflict-active");
		document.getElementById("war-desk").style.display = "none";
		runtime._warOverviewSides = [];
		runtime._warOverviewLastUpdate = -Infinity;
		runtime.latestCountryStats.clear();
		runtime.sideSoldiers.fill(0);
		runtime.initialSideSoldiers.fill(0);
		runtime.sideRecruitableManpower.fill(0);
		runtime.soldiersPerUnit.fill(runtime.CONFIG.UNIT_TO_SOLDIER_RATIO);
		runtime.sideCasualties.fill(0);
		runtime.countryCasualties.clear();
		runtime.casualtyByAttacker.clear();
		runtime.capitalLostCountries = new Set();
		runtime._capitalFallTick = new Map();
		runtime.frameAccumulator = 0;
		runtime.simFrameCount = 0;
	}

	function showBenchmarkResults() {
		if (runtime._benchmarkTimeoutId !== null) {
			clearTimeout(runtime._benchmarkTimeoutId);
			runtime._benchmarkTimeoutId = null;
		}
		if (runtime._perfSamples.length === 0) {
			restoreBenchmarkSettings();
			runtime._benchmarkReject?.(
				new Error("Benchmark ended without frame samples."),
			);
			runtime._benchmarkResolve = null;
			runtime._benchmarkReject = null;
			return;
		}
		const avg =
			runtime._perfSamples.reduce((a, b) => a + b, 0) /
			runtime._perfSamples.length;
		const max = Math.max(...runtime._perfSamples);
		const min = Math.min(...runtime._perfSamples);
		const avgFps = 1000 / avg;
		const minFps = 1000 / max;
		const maxFps = 1000 / min;
		if (window.__perf) {
			window.__perf._lastBenchmark = {
				...runtime._benchmarkMetadata,
				frames: runtime._perfSamples.length,
				speed: runtime.simSpeed,
				maxUnitsPerSide: runtime._benchmarkUnitsPerSide,
				avgFps,
				minFps,
				maxFps,
				avgFrameMs: avg,
				maxFrameMs: max,
				minFrameMs: min,
				endedAt: new Date().toISOString(),
			};
		}
		const report = runtime.getPerfReportData();
		if (runtime.benchmarkStatsEl) {
			const initialPersonnel =
				runtime._benchmarkMetadata?.initialPersonnelBySide || [];
			const initialFormations =
				runtime._benchmarkMetadata?.initialFormationCountBySide || [];
			const forceSummary = initialPersonnel.length
				? ` &nbsp;|&nbsp; Personnel: ${initialPersonnel.map((value) => Math.round(value).toLocaleString()).join(" / ")} &nbsp;|&nbsp; Formations: ${initialFormations.join(" / ")}`
				: runtime._benchmarkUnitsPerSide
					? ` &nbsp;|&nbsp; Nominal scale/side: ${runtime._benchmarkUnitsPerSide.toLocaleString()}`
					: "";
			runtime.benchmarkStatsEl.innerHTML =
				`Frames: ${runtime._perfSamples.length} &nbsp;|&nbsp; Speed: ${runtime.simSpeed}x${forceSummary}<br>` +
				`Avg FPS: ${avgFps.toFixed(0)} &nbsp;|&nbsp; Min FPS: ${minFps.toFixed(0)} &nbsp;|&nbsp; Max FPS: ${maxFps.toFixed(0)}<br>` +
				`Avg frame: ${avg.toFixed(1)}ms &nbsp;|&nbsp; P95: ${report.frames.p95.toFixed(1)}ms &nbsp;|&nbsp; P99: ${report.frames.p99.toFixed(1)}ms &nbsp;|&nbsp; Max: ${max.toFixed(1)}ms<br>` +
				`Main work: ${report.frameStages.mainWork.avg.toFixed(1)}ms &nbsp;|&nbsp; Sim: ${report.frameStages.simulation.avg.toFixed(1)}ms &nbsp;|&nbsp; HUD: ${report.frameStages.hud.avg.toFixed(1)}ms &nbsp;|&nbsp; Render: ${report.frameStages.render.avg.toFixed(1)}ms<br>` +
				`Tick: ${report.ticks.avgMs.toFixed(1)}ms avg / ${report.ticks.p95Ms.toFixed(1)}ms P95 &nbsp;|&nbsp; Long tasks: ${report.browser.longTasks.count}`;
		}
		if (runtime.benchmarkResults)
			runtime.benchmarkResults.style.display = "flex";
		if (window.__perf) {
			window.__perf._frozenReport = report;
			window.__perf._trackingPaused = true;
		}
		restoreBenchmarkSettings();
		runtime._benchmarkResolve?.(report);
		runtime._benchmarkResolve = null;
		runtime._benchmarkReject = null;
	}

	async function startBenchmark(options = {}) {
		if (
			runtime._isBenchmarking ||
			runtime._isBenchmarkWarmingUp ||
			runtime._benchmarkResolve
		) {
			throw new Error("A benchmark is already running.");
		}
		const requestedUnits = Number.isFinite(options.maxUnitsPerSide)
			? Math.max(1, Math.floor(options.maxUnitsPerSide))
			: null;
		const durationMs = Number.isFinite(options.durationMs)
			? Math.max(1_000, Math.floor(options.durationMs))
			: 60_000;
		const warmupMs = Number.isFinite(options.warmupMs)
			? Math.max(0, Math.floor(options.warmupMs))
			: 3000;

		const benchmarkSpeedIndex = Number.isFinite(options.speedIndex)
			? Math.max(
					0,
					Math.min(
						runtime.SPEED_STEPS.length - 1,
						Math.floor(options.speedIndex),
					),
				)
			: runtime.SPEED_STEPS.length - 1;
		const benchmarkViewMode =
			options.viewMode === "FLAG" ? "FLAG" : "POLITICAL";
		const perfMode =
			options.perfMode === "detailed"
				? "detailed"
				: options.perfMode === "basic"
					? "basic"
					: null;
		runtime._benchmarkRestoreSettings = {
			maxUnitsPerSide: runtime.CONFIG.MAX_UNITS_PER_SIDE,
			noPeaceChecked: runtime.noPeaceCheckbox?.checked === true,
		};
		runtime._benchmarkSuppressAutomaticPuppets = true;
		if (requestedUnits !== null) {
			runtime.CONFIG.MAX_UNITS_PER_SIDE = requestedUnits;
			runtime._benchmarkUnitsPerSide = requestedUnits;
		} else {
			runtime._benchmarkUnitsPerSide = null;
		}
		// Load the 2022 Modern Day scenario if countryMetadata isn't populated yet
		if (!runtime.countryMetadata || runtime.countryMetadata.length === 0) {
			runtime.loadingStatus.innerText = "Loading Modern World Theater...";
			runtime.loadingOverlay.style.display = "flex";
			runtime.mainMenu.style.display = "none";
			try {
				const url = "assets/maps/world map 2022.json";
				await runtime.performPresetLoad(
					runtime.COMPILED_SCENARIO_URLS.modern,
					"CONQUEST",
					{
						jsonFallbackUrl: url,
						prederivedEarth: true,
					},
				);
			} catch (e) {
				console.error(e);
				showAlert("Failed to load 2022 Modern Day scenario.");
				restoreBenchmarkSettings();
				throw e;
			}
		}

		// Match Russia and China by name (China may be "People's Republic of China")
		const metaRussia = runtime.countryMetadata.find(
			(m) => m && m.name === "Russia",
		);
		const metaChina = runtime.countryMetadata.find(
			(m) => m && typeof m.name === "string" && m.name.includes("China"),
		);
		if (!metaRussia || !metaChina) {
			showAlert("Russia or China not found in country data.");
			restoreBenchmarkSettings();
			throw new Error("Russia or China not found in country data.");
		}
		prepareIsolatedBenchmarkRun();
		const isolatedRussia = runtime.countryMetadata.find(
			(meta) => meta?.name === "Russia",
		);
		const isolatedChina = runtime.countryMetadata.find(
			(meta) =>
				meta && typeof meta.name === "string" && meta.name.includes("China"),
		);
		if (!isolatedRussia || !isolatedChina) {
			restoreBenchmarkSettings();
			throw new Error(
				"Russia or China missing after benchmark world restoration.",
			);
		}

		const russia = {
			id: isolatedRussia.id,
			name: isolatedRussia.name,
			color: isolatedRussia.color,
			role: "OFFENSE",
			strategy: "BALANCED",
			buffState: "none",
		};
		const china = {
			id: isolatedChina.id,
			name: isolatedChina.name,
			color: isolatedChina.color,
			role: "OFFENSE",
			strategy: "BALANCED",
			buffState: "none",
		};

		runtime.sides = [[russia], [china]];
		runtime.activeSideIndex = 0;
		if (runtime.noPeaceCheckbox) runtime.noPeaceCheckbox.checked = true;
		// Scenario loading reapplies saved settings, so the programmatic benchmark
		// cap must be restored immediately before war creation.
		if (requestedUnits !== null)
			runtime.CONFIG.MAX_UNITS_PER_SIDE = requestedUnits;
		runtime._benchmarkForcePersonnelPerSide =
			requestedUnits !== null
				? requestedUnits * runtime.CONFIG.UNIT_TO_SOLDIER_RATIO
				: null;
		runtime.updateSidesUI();
		await runtime.startWar();
		runtime._benchmarkForcePersonnelPerSide = null;
		if (runtime.gameState !== "SIMULATING") {
			restoreBenchmarkSettings();
			throw new Error("Benchmark war failed to initialize.");
		}
		const benchmarkInitialPersonnelBySide = runtime.sides.map(
			(_side, sideIdx) => runtime.sideSoldiers[sideIdx] || 0,
		);
		const benchmarkInitialFormationCountBySide = runtime.sides.map(
			(_side, sideIdx) =>
				runtime.units.reduce(
					(count, unit) => count + Number(unit.sideIndex === sideIdx),
					0,
				),
		);
		runtime.viewMode = benchmarkViewMode;
		if (runtime.viewModeBtn) {
			runtime.viewModeBtn.innerText =
				runtime.viewMode === "FLAG" ? "FLAG VIEW" : "POLITICAL";
			runtime.viewModeBtn.style.background =
				runtime.viewMode === "FLAG" ? "#8e44ad" : "#3498db";
		}
		runtime.recalculateAllBounds();
		if (runtime.influenceLayer) runtime.influenceLayer._forceRender = true;
		runtime.setSpeed(benchmarkSpeedIndex);
		runtime.ensurePerfLongTaskObserver();
		if (runtime.benchmarkResults)
			runtime.benchmarkResults.style.display = "none";
		// Warm the simulation and JIT before resetting measured counters.
		runtime.isPaused = false;
		runtime._isBenchmarkWarmingUp = warmupMs > 0;
		if (runtime.perfOverlay && runtime._isBenchmarkWarmingUp) {
			runtime.perfOverlay.style.display = "block";
			runtime.perfOverlay.textContent = `PERF WARM-UP · ${(warmupMs / 1000).toFixed(1)}s`;
		}
		if (warmupMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, warmupMs));
		}
		runtime._isBenchmarkWarmingUp = false;
		if (runtime.gameState !== "SIMULATING") {
			restoreBenchmarkSettings();
			throw new Error("Benchmark war ended during warm-up.");
		}
		// Initialize benchmark state after warm-up.
		runtime._perfSamples = [];
		window.perfReset(perfMode || "basic");
		window.__perf._traceMarksEnabled = options.traceMarks === true;
		if (window.__perf) {
			window.__perf._frameHistory = [];
			window.__perf._frameSpikes = [];
			window.__perf._scheduler = runtime.createPerfState(
				window.__perf._mode,
			)._scheduler;
			window.__perf._lastBenchmark = null;
		}
		runtime._benchmarkMetadata = {
			caseId: String(options.caseId || "benchmark"),
			speedIndex: benchmarkSpeedIndex,
			viewMode: benchmarkViewMode,
			traceMarks: options.traceMarks === true,
			durationMs,
			warmupMs,
			initialPersonnelBySide: benchmarkInitialPersonnelBySide,
			initialFormationCountBySide: benchmarkInitialFormationCountBySide,
			startedAt: new Date().toISOString(),
		};
		runtime._perfBenchmarkEnd = performance.now() + durationMs;
		runtime._isBenchmarking = true;
		return new Promise((resolve, reject) => {
			runtime._benchmarkResolve = resolve;
			runtime._benchmarkReject = reject;
			runtime._benchmarkTimeoutId = setTimeout(() => {
				if (!runtime._isBenchmarking) return;
				runtime._isBenchmarking = false;
				runtime.isPaused = true;
				runtime._benchmarkMetadata.endedBy =
					runtime.gameState === "SIMULATING" ? "WALL_CLOCK" : "WAR_ENDED";
				showBenchmarkResults();
			}, durationMs + 250);
		});
	}
	return {
		restoreBenchmarkSettings,
		prepareIsolatedBenchmarkRun,
		showBenchmarkResults,
		startBenchmark,
	};
}
