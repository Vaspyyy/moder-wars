// Controls receive live state and commands; they do not import the application.
export function createSandboxControls(runtime) {
	function bindGodBombBtnClick() {
		runtime.godBombBtn.addEventListener("click", () => {
			runtime.godBombActive = !runtime.godBombActive;
			runtime.godBombBtn.innerText = runtime.godBombActive
				? "GOD BOMB: ON"
				: "GOD BOMB: OFF";
			runtime.godBombBtn.classList.toggle("active", runtime.godBombActive);

			if (runtime.godBombActive) {
				runtime.godBombSourceId = -1;
				runtime.statusText.innerText =
					"GOD BOMB ACTIVE: Click a country to set as sender";
				runtime.map.getContainer().classList.add("painting-cursor");
				runtime.countryInspector.style.display = "none";
			} else {
				runtime.godBombSourceId = -1;
				runtime.statusText.innerText = runtime.godModeActive
					? "GOD MODE: Map Editing Active"
					: "Simulation Continued";
				runtime.map.getContainer().classList.remove("painting-cursor");
			}
		});
	}

	function bindGodModeBtnClick() {
		runtime.godModeBtn.addEventListener("click", () => {
			if (!runtime.godModeActive) {
				// Activate God Mode
				runtime.godModeActive = true;
				runtime.godBombActive = false;
				if (runtime.godBombBtn) {
					runtime.godBombBtn.innerText = "GOD BOMB: OFF";
					runtime.godBombBtn.classList.remove("active");
				}
				runtime.preGodModeState = runtime.gameState;
				runtime.gameState = "EDITOR_ACTIVE";

				runtime.godModeBtn.innerText = runtime.getTranslation("GOD_ACTIVE");
				runtime.godModeBtn.style.background = "#27ae60";

				// Setup UI
				runtime.editorToolbox.style.display = "flex";
				runtime.setupPanel.style.display = "none";
				runtime.statsPanel.style.display = "none";
				// Allow sharing and saving any current map state from God Mode, including official presets
				runtime.editorShareBtn.style.display = "block";
				runtime.editorSaveBtn.style.display = "block";
				runtime.editorHubBtn.style.display = "block";
				runtime.editorLibraryBtn.style.display = "block";
				runtime.shareFlagBtn.style.display = "block";
				runtime.editorExitBtn.style.display = "none";
				runtime.editorTestBtn.style.display = "none";
				runtime.editorUpdateBtn.style.display = runtime.activeScenarioId
					? "block"
					: "none";
				runtime.editorUnclaimBtn.style.display = "block";

				if (runtime.preGodModeState === "SIMULATING") {
					runtime.godBombBtn.style.display = "block";
				}

				// Ensure alliance view toggle always remains visible while in God Mode
				if (runtime.allianceViewCheckbox?.parentElement) {
					runtime.allianceViewCheckbox.style.display = "inline-block";
					runtime.allianceViewCheckbox.parentElement.style.display =
						"inline-flex";
				}

				runtime.statusText.innerText = runtime.currentScenarioContext
					? `GOD MODE // REMIXING: ${runtime.currentScenarioContext.name}`
					: "GOD MODE: Map Editing Active";
				runtime.updateRestartVisibility();
			} else {
				// Deactivate God Mode
				runtime.godModeActive = false;
				runtime.godBombActive = false;
				runtime.godBombSourceId = -1;

				// Sanitize state: ensure that exiting from an active editor tool (like painting)
				// doesn't leave the engine in an "EDITOR" state if we were previously in selection mode.
				if (
					runtime.gameMode === "CONQUEST" &&
					runtime.preGodModeState !== "SIMULATING"
				) {
					runtime.gameState = "SELECTING_P1";
				} else {
					runtime.gameState = runtime.preGodModeState;
				}

				runtime.godModeBtn.innerText = runtime.getTranslation("GOD_MODE");
				runtime.godModeBtn.style.background = "#d35400";

				// Hide editor UI & Reset Tool Classes to prevent sticky sub-states
				runtime.editorToolbox.style.display = "none";
				[
					runtime.editorPaintBtn,
					runtime.editorFillBtn,
					runtime.editorUnclaimBtn,
					runtime.editorTerrainBtn,
					runtime.editorPlaceDivisionBtn,
				].forEach((btn) => {
					if (btn) btn.classList.remove("active");
				});
				if (runtime.brushControls) runtime.brushControls.style.display = "none";
				if (runtime.terrainControls)
					runtime.terrainControls.style.display = "none";

				runtime.godBombBtn.style.display = "none";
				runtime.godBombBtn.innerText = "GOD BOMB: OFF";
				runtime.godBombBtn.classList.remove("active");
				runtime.countryInspector.style.display = "none";
				runtime.shareFlagBtn.style.display = "none";
				runtime.map.getContainer().classList.remove("painting-cursor");

				// Make sure the alliance view checkbox + label are visible again when returning to normal play
				if (runtime.allianceViewCheckbox?.parentElement) {
					runtime.allianceViewCheckbox.style.display = "inline-block";
					runtime.allianceViewCheckbox.parentElement.style.display =
						"inline-flex";
				}

				// Refresh simulation caches in case land changed
				if (runtime.gameState === "SIMULATING") {
					runtime.statsPanel.style.display = "block";
					runtime.activeTheaterCities = runtime.cities.filter((c) => {
						const idx = runtime.getGridIndex(c.lat, c.lng);
						return idx !== -1 && runtime.landMask[idx] === 2;
					});
					// Ensure loop restarts if it was stopped
					cancelAnimationFrame(runtime.animationFrameId);
					requestAnimationFrame(runtime.updateLoop);
				}

				if (
					runtime.gameState.startsWith("SELECTING") ||
					runtime.gameState === "WAR_OVER"
				) {
					if (runtime.gameState === "WAR_OVER")
						runtime.gameState = "SELECTING_P1";
					runtime.setupPanel.style.display = "block";
					runtime.statusText.innerText = runtime.currentScenarioContext
						? `PLAYING: ${runtime.currentScenarioContext.name}`
						: runtime.getTranslation("SELECT_P1");
					runtime.updateSidesUI();
				} else if (runtime.gameState === "SIMULATING") {
					runtime.statsPanel.style.display = "block";
					runtime.statusText.innerText = runtime.ffaMode
						? "Free For All Active"
						: "Global Conflict Active";
				} else {
					// Safety fallback: transition any orphaned state to setup mode
					runtime.gameState = "SELECTING_P1";
					runtime.setupPanel.style.display = "block";
					runtime.statusText.innerText = runtime.getTranslation("SELECT_P1");
					runtime.updateSidesUI();
				}
				runtime.updateRestartVisibility();
			}
		});
	}
	return { bindGodBombBtnClick, bindGodModeBtnClick };
}
