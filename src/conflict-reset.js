// Explicit live context keeps replacements of arrays/state visible across awaits and callbacks.
export function createConflictReset(runtime) {
	function resetToSelection() {
		runtime.invalidateWarLifecycleTimers();
		runtime.countryLabelAnchors.clear();
		runtime.stopWarAmbiance();
		// Stop in‑game time progression but keep the last war date visible in the setup
		runtime.gameTimeEnabled = false;
		runtime.gameTimeAccumulatorMs = 0;
		if (
			runtime.gameTimeDate &&
			runtime.timeYearInput &&
			runtime.timeMonthInput &&
			runtime.timeDayInput
		) {
			runtime.timeYearInput.value = runtime.gameTimeDate.year;
			runtime.timeMonthInput.value = runtime.gameTimeDate.month;
			runtime.timeDayInput.value = runtime.gameTimeDate.day;
			if (runtime.gameDateDisplay) {
				runtime.gameDateDisplay.textContent = runtime.formatGameDate();
				runtime.gameDateDisplay.style.display = "block";
			}
		}

		// If in God Mode, we reset the underlying state that will be restored on exit
		if (runtime.godModeActive) {
			runtime.preGodModeState = "SELECTING_P1";
		}

		if (runtime.gameMode === "EDITOR" || runtime.gameMode === "EDITOR_TEST") {
			if (runtime.gameMode === "EDITOR_TEST") {
				runtime.gameMode = "EDITOR";
				runtime.editorToolbox.style.display = "flex";
			}
			if (!runtime.godModeActive) {
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = "Map Editor (Alpha)";
			}
			runtime.setupPanel.style.display = "none";
			runtime.statsPanel.style.display = "none";
			runtime.resetBtn.style.display = "block";
			runtime.ffBtn.style.display = "none";
			runtime.forcePeaceBtn.style.display = "none";
			runtime.unitCountsDiv.style.display = "none";
			runtime.updateRestartVisibility();
			runtime.influenceLayer.render();
			if (!runtime.godModeActive) return;
		}
		runtime.gameState = "SELECTING_P1";
		runtime.sides = [[], []];
		runtime._attackers = runtime.sides[0];
		runtime._defenders = runtime.sides[1];
		runtime.activeSideIndex = 0;
		runtime.ffaMode = false;
		runtime.updateFfaSetupUi();
		runtime.units = [];
		runtime.unitSpatialHash.clear();
		for (let si = 0; si < runtime.unitHashBySide.length; si++)
			runtime.unitHashBySide[si].clear();
		runtime.activeBattles = [];
		runtime._battleHash.clear();
		runtime.bombs = [];
		runtime.explosions = [];
		runtime.bases = [];
		runtime.resetOperationalAiRuntime();
		document.body.classList.remove("conflict-active");
		document.getElementById("war-desk").style.display = "none";
		runtime._warOverviewSides = [];
		runtime._warOverviewLastUpdate = -Infinity;
		runtime.resetSideHostilities();
		runtime.setSpeed(0);
		runtime.frameAccumulator = 0;

		runtime.statusText.innerText = "Select First Country";
		runtime.setupPanel.style.display = "block";
		runtime.setupOptions.style.display = "none";

		runtime.updateSidesUI();

		runtime.statsPanel.style.display = "none";
		document.getElementById("game-status").style.display = "flex"; // Restore if cinematic
		runtime.casualtyPanel.style.display = "none";
		runtime.resetBtn.style.display = runtime.currentScenarioContext
			? "block"
			: "none";
		runtime.restartScenarioBtn.style.display = "block";
		document.getElementById("speed-controls").style.display = "none";
		runtime.godModeBtn.style.display =
			runtime.gameMode === "CONQUEST" || runtime.godModeActive
				? "block"
				: "none";
		runtime.godBombBtn.style.display = "none";
		runtime.godBombActive = false;
		runtime.godBombSourceId = -1;
		runtime.godBombBtn.innerText = "GOD BOMB: OFF";
		runtime.godBombBtn.classList.remove("active");
		runtime.forcePeaceBtn.style.display = "none";
		runtime.unitCountsDiv.style.display = "none";
	}

	async function resetGame() {
		runtime.invalidateWarLifecycleTimers();
		cancelAnimationFrame(runtime.animationFrameId);

		// Scenario-specific reset: Reload the original preset if available
		if (runtime.currentScenarioContext?.blobUrl) {
			runtime.loadingStatus.innerText = "Reloading Scenario Assets...";
			runtime.loadingOverlay.style.display = "flex";
			try {
				if (runtime.currentScenarioContext.compiledUrl) {
					await runtime.performPresetLoad(
						runtime.currentScenarioContext.compiledUrl,
						runtime.gameMode,
						{
							jsonFallbackUrl: runtime.currentScenarioContext.blobUrl,
							prederivedEarth: true,
						},
					);
					runtime.loadingOverlay.style.display = "none";
					return;
				}
				const response = await fetch(runtime.currentScenarioContext.blobUrl);
				if (!response.ok) throw new Error("Reload failed");
				const blob = await response.blob();
				await runtime.performPresetLoad(blob, runtime.gameMode);
				runtime.loadingOverlay.style.display = "none";
				return;
			} catch (e) {
				console.error("Satellite Reset Failed:", e);
				runtime.loadingOverlay.style.display = "none";
			}
		}

		runtime.worldControlMap.fill(0);
		runtime.occupationMap.fill(0);
		runtime.resetSideInfluenceMaps();
		runtime.landMask.fill(0);
		resetToSelection();
		runtime.updateRestartVisibility();
		// Re-initialize landmask from features
		const mapRes = document.getElementById("map-res-select").value;
		const geoUrl = `${runtime.CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
		runtime.loadCountries(geoUrl, runtime.gameMode === "EDITOR");
	}

	function reopenConflictSetupAfterWar() {
		if (runtime.gameMode !== "CONQUEST") return;
		const setupAlreadyOpen =
			runtime.gameState.startsWith("SELECTING") &&
			runtime.setupPanel.style.display !== "none";
		if (setupAlreadyOpen) return;
		resetToSelection();
		if (runtime.influenceLayer) {
			runtime.influenceLayer.invalidate(runtime.RENDER_LAYERS.ALL);
			runtime.influenceLayer.render();
		}
	}
	return { resetToSelection, resetGame, reopenConflictSetupAfterWar };
}
