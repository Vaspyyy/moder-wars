import { showAlert, showConfirm } from "./dialogs.js";
// Controls receive live state and commands; they do not import the application.
export function createMenuControls(runtime) {
	function bindImportCountrySearchInput() {
		if (runtime.importCountrySearch) {
			runtime.importCountrySearch.addEventListener("input", () => {
				runtime.renderImportCountryCards(runtime.importCountrySearch.value);
			});
		}
	}

	function bindTutorialSkipBtnClick() {
		document.getElementById("tutorial-skip-btn").onclick = () => {
			runtime.endTutorial();
		};
	}

	function bindTutorialPrevBtnClick() {
		runtime.tutorialPrevBtn.onclick = () => {
			if (runtime.currentTutorialStep > 0) {
				runtime.currentTutorialStep--;
				runtime.updateTutorialUI();
			}
		};
	}

	function bindAddSideBtnClick() {
		runtime.addSideBtn.onclick = () => {
			if (runtime.sides.length >= runtime.MAX_SIDES) {
				showAlert(`Maximum ${runtime.MAX_SIDES} sides supported.`);
				return;
			}
			runtime.sides.push([]);
			runtime.activeSideIndex = runtime.sides.length - 1;
			runtime.rebuildManpowerInputs();
			runtime.updateSidesUI();
		};
	}

	function bindFfaToggleBtnClick() {
		runtime.ffaToggleBtn.onclick = () => {
			runtime.ffaMode = !runtime.ffaMode;
			runtime.updateSidesUI();
		};
	}

	function bindRandomWarBtnClick() {
		runtime.randomWarBtn.onclick = () => {
			runtime.randomWarMode = !runtime.randomWarMode;
			runtime.updateRandomWarButton();

			if (
				runtime.randomWarMode &&
				(runtime.gameState === "SELECTING_P1" ||
					runtime.gameState === "SELECTING_P2")
			) {
				runtime.triggerRandomWar();
			}
		};
	}

	function bindViewModeBtnClick() {
		runtime.viewModeBtn.addEventListener("click", () => {
			// Cycle between POLITICAL <-> FLAG; alliance overlay is controlled separately by its own toggle
			if (runtime.viewMode === "POLITICAL") {
				runtime.viewMode = "FLAG";
				runtime.viewModeBtn.innerText = "FLAG VIEW";
				runtime.viewModeBtn.style.background = "#8e44ad";
			} else {
				runtime.viewMode = "POLITICAL";
				runtime.viewModeBtn.innerText = "POLITICAL";
				runtime.viewModeBtn.style.background = "#3498db";
			}

			// When switching view modes mid‑war, force a fresh recompute of country
			// bounds and occupation visuals so frontlines don't appear to vanish.
			if (
				runtime.gameState === "SIMULATING" ||
				(runtime.godModeActive && runtime.preGodModeState === "SIMULATING")
			) {
				if (typeof runtime.recalculateAllBounds === "function") {
					runtime.recalculateAllBounds();
				}
			}

			if (
				runtime.influenceLayer &&
				typeof runtime.influenceLayer._update === "function"
			) {
				runtime.influenceLayer._forceRender = true;
				runtime.influenceLayer._update();
			} else if (runtime.influenceLayer) {
				runtime.influenceLayer.render();
			}
		});
	}

	function bindAllianceViewCheckboxChange() {
		if (runtime.allianceViewCheckbox) {
			runtime.allianceViewCheckbox.checked = runtime.allianceViewEnabled;
			runtime.allianceViewCheckbox.addEventListener("change", (e) => {
				runtime.allianceViewEnabled = e.target.checked;
				if (runtime.arrowsToggleBtn) {
					runtime.arrowsToggleBtn.classList.toggle(
						"active",
						runtime.allianceViewEnabled,
					);
				}
				if (runtime.influenceLayer) {
					runtime.influenceLayer._forceRender = true;
					if (typeof runtime.influenceLayer._update === "function")
						runtime.influenceLayer._update();
					else runtime.influenceLayer.render();
				}
			});
		}
	}

	function bindBattlesToggleBtnClick() {
		if (runtime.battlesToggleBtn) {
			runtime.battlesToggleBtn.addEventListener("click", () => {
				runtime.showBattleIndicators = !runtime.showBattleIndicators;
				runtime.battlesToggleBtn.classList.toggle(
					"active",
					runtime.showBattleIndicators,
				);
				runtime.influenceLayer.render();
			});
		}
	}

	function bindLabelsToggleBtnClick() {
		if (runtime.labelsToggleBtn) {
			runtime.labelsToggleBtn.classList.toggle(
				"active",
				runtime.showCountryLabels,
			);
			runtime.labelsToggleBtn.addEventListener("click", () => {
				runtime.showCountryLabels = !runtime.showCountryLabels;
				// Clear cached anchors whenever label mode changes so they can be re-anchored once
				runtime.countryLabelAnchors.clear();
				runtime.labelsToggleBtn.classList.toggle(
					"active",
					runtime.showCountryLabels,
				);
				// Force a full redraw so labels respond instantly, even outside active wars
				if (runtime.influenceLayer) {
					runtime.influenceLayer._forceRender = true;
					if (typeof runtime.influenceLayer._update === "function") {
						runtime.influenceLayer._update();
					} else {
						runtime.influenceLayer.render();
					}
				}
			});
		}
	}

	function bindCitiesToggleBtnClick() {
		if (runtime.citiesToggleBtn) {
			runtime.citiesToggleBtn.classList.toggle(
				"active",
				runtime.showNonCapitalCities,
			);
			runtime.citiesToggleBtn.addEventListener("click", () => {
				runtime.showNonCapitalCities = !runtime.showNonCapitalCities;
				runtime.citiesToggleBtn.classList.toggle(
					"active",
					runtime.showNonCapitalCities,
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindWarplansToggleBtnClick() {
		if (runtime.warplansToggleBtn) {
			runtime.warplansToggleBtn.classList.toggle(
				"active",
				runtime.showWarPlans,
			);
			runtime.warplansToggleBtn.addEventListener("click", () => {
				runtime.showWarPlans = !runtime.showWarPlans;
				runtime.warplansToggleBtn.classList.toggle(
					"active",
					runtime.showWarPlans,
				);
				const preferenceCheckbox = document.getElementById(
					"show-warplans-checkbox",
				);
				if (preferenceCheckbox)
					preferenceCheckbox.checked = runtime.showWarPlans;
				runtime.setCookie(
					"mw_show_warplans",
					runtime.showWarPlans ? "true" : "false",
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindShowWarplansCheckboxChange() {
		if (runtime.showWarplansCheckbox) {
			runtime.showWarplansCheckbox.checked = runtime.showWarPlans;
			runtime.showWarplansCheckbox.addEventListener("change", (e) => {
				runtime.showWarPlans = e.target.checked;
				if (runtime.warplansToggleBtn)
					runtime.warplansToggleBtn.classList.toggle(
						"active",
						runtime.showWarPlans,
					);
				runtime.setCookie(
					"mw_show_warplans",
					e.target.checked ? "true" : "false",
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindShowLabelsCheckboxChange() {
		if (runtime.showLabelsCheckbox) {
			runtime.showLabelsCheckbox.checked = runtime.showCountryLabels;
			runtime.showLabelsCheckbox.addEventListener("change", (e) => {
				runtime.showCountryLabels = e.target.checked;
				runtime.countryLabelAnchors.clear();
				if (runtime.labelsToggleBtn)
					runtime.labelsToggleBtn.classList.toggle(
						"active",
						runtime.showCountryLabels,
					);
				runtime.setCookie(
					"mw_show_labels",
					e.target.checked ? "true" : "false",
				);
				if (runtime.influenceLayer) {
					runtime.influenceLayer._forceRender = true;
					if (typeof runtime.influenceLayer._update === "function")
						runtime.influenceLayer._update();
					else runtime.influenceLayer.render();
				}
			});
		}
	}

	function bindShowCitiesCheckboxChange() {
		if (runtime.showCitiesCheckbox) {
			runtime.showCitiesCheckbox.checked = runtime.showNonCapitalCities;
			runtime.showCitiesCheckbox.addEventListener("change", (e) => {
				runtime.showNonCapitalCities = e.target.checked;
				if (runtime.citiesToggleBtn)
					runtime.citiesToggleBtn.classList.toggle(
						"active",
						runtime.showNonCapitalCities,
					);
				runtime.setCookie(
					"mw_show_cities",
					e.target.checked ? "true" : "false",
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindShowBattlesCheckboxChange() {
		if (runtime.showBattlesCheckbox) {
			runtime.showBattlesCheckbox.checked = runtime.showBattleIndicators;
			runtime.showBattlesCheckbox.addEventListener("change", (e) => {
				runtime.showBattleIndicators = e.target.checked;
				if (runtime.battlesToggleBtn)
					runtime.battlesToggleBtn.classList.toggle(
						"active",
						runtime.showBattleIndicators,
					);
				runtime.setCookie(
					"mw_show_battles",
					e.target.checked ? "true" : "false",
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindShowAllianceCheckboxChange() {
		if (runtime.showAllianceCheckbox) {
			runtime.showAllianceCheckbox.checked = runtime.allianceViewEnabled;
			runtime.showAllianceCheckbox.addEventListener("change", (e) => {
				runtime.allianceViewEnabled = e.target.checked;
				if (runtime.allianceViewCheckbox)
					runtime.allianceViewCheckbox.checked = runtime.allianceViewEnabled;
				runtime.setCookie(
					"mw_show_alliance",
					e.target.checked ? "true" : "false",
				);
				if (runtime.influenceLayer) runtime.influenceLayer.render();
			});
		}
	}

	function bindNoPeaceCheckboxChange() {
		if (runtime.noPeaceCheckbox) {
			runtime.noPeaceCheckbox.addEventListener("change", () => {
				runtime.peaceTreatiesDisabled = runtime.noPeaceCheckbox.checked;
			});
		}
	}

	function bindUseSecretSoundsCheckboxChange() {
		if (runtime.useSecretSoundsCheckbox) {
			runtime.useSecretSoundsCheckbox.checked = runtime.useSecretSounds;
			runtime.useSecretSoundsCheckbox.addEventListener("change", (e) => {
				runtime.setSecretSounds(e.target.checked);
				runtime.setCookie(
					"mw_secret_sounds",
					e.target.checked ? "true" : "false",
				);
			});
		}
	}

	function bindSetupDisableMountainsCheckboxChange() {
		runtime.setupDisableMountainsCheckbox.addEventListener(
			"change",
			async (e) => {
				const disabled = e.target.checked;
				runtime.mountainsEnabled = !disabled;
				runtime.mainDisableMountainsCheckbox.checked = disabled;
				// Persist immediately
				runtime.setCookie("mw_disable_mountains", disabled ? "true" : "false");

				if (
					runtime.mountainsEnabled &&
					runtime.terrainMask.every((v) => v === 0)
				) {
					const currentMapRes = document.getElementById("map-res-select").value;
					await runtime.loadTerrain(currentMapRes);
				}
				runtime.influenceLayer.render();
			},
		);
	}

	function bindMainDisableMountainsCheckboxChange() {
		runtime.mainDisableMountainsCheckbox.addEventListener("change", (e) => {
			runtime.setupDisableMountainsCheckbox.checked = e.target.checked;
			runtime.mountainsEnabled = !e.target.checked;
			// Persist immediately
			runtime.setCookie(
				"mw_disable_mountains",
				e.target.checked ? "true" : "false",
			);
			runtime.influenceLayer.render();
		});
	}

	function bindRestartScenarioBtnClick() {
		runtime.restartScenarioBtn.addEventListener("click", runtime.resetGame);
	}

	function bindResetBtnClick() {
		runtime.resetBtn.addEventListener("click", runtime.resetGame);
	}

	function bindForcePeaceBtnClick() {
		runtime.forcePeaceBtn.addEventListener("click", () => {
			if (runtime.gameState === "SIMULATING") {
				runtime.gameState = "PEACE_SELECT_1";
				runtime.simulationClient.syncControls();
				runtime.statusText.innerText =
					"DIPLOMACY: Click nation to withdraw from war";
				runtime.peaceSelection1 = null;
			} else if (
				runtime.gameState === "PEACE_SELECT_1" ||
				runtime.gameState === "PEACE_SELECT_2"
			) {
				// Double click/cancel to just do a global peace
				showConfirm("Sign global white peace for all remaining combatants?", {
					title: "Diplomacy",
					okLabel: "Sign peace",
					cancelLabel: "Keep fighting",
				}).then((accepted) => {
					// Escape may already have resumed the war, or the war may have ended.
					if (!runtime.gameState.startsWith("PEACE_SELECT_")) return;
					if (accepted) {
						runtime.applyTreaty("PEACE_TREATY");
					} else {
						runtime.gameState = "SIMULATING";
						runtime.statusText.innerText = "Conflict Continued";
						requestAnimationFrame(runtime.updateLoop);
					}
				});
			}
		});
	}

	function bindPauseBtnClick() {
		runtime.pauseBtn.addEventListener("click", runtime.togglePause);
	}

	function bindSpeedSelectorChange() {
		for (const input of runtime.speedInputs)
			input.addEventListener("change", () => {
				if (input.checked) runtime.setSpeed(Number(input.dataset.speedIndex));
			});
	}

	function bindCustomTrackInputChange() {
		if (runtime.customTrackInput) {
			runtime.customTrackInput.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (!file) return;

				runtime.loadingStatus.innerText = "Uploading Soundtrack...";
				runtime.loadingOverlay.style.display = "flex";

				try {
					const url = await websim.upload(file);
					runtime.setCustomTrack(url);
					runtime.setCookie("mw_custom_track", url);

					// Restart music with new track
					runtime.stopBackgroundMusic();
					runtime.initAudio();
					runtime.loadingOverlay.style.display = "none";
					showAlert("Custom soundtrack applied and saved!");
				} catch (err) {
					console.error(err);
					showAlert("Failed to upload soundtrack.");
					runtime.loadingOverlay.style.display = "none";
				}
			});
		}
	}

	function bindClearCustomTrackBtnClick() {
		if (runtime.clearCustomTrackBtn) {
			runtime.clearCustomTrackBtn.addEventListener("click", () => {
				runtime.setCustomTrack(null);
				runtime.setCookie("mw_custom_track", "");
				if (runtime.customTrackInput) runtime.customTrackInput.value = "";

				runtime.stopBackgroundMusic();
				runtime.initAudio();
				showAlert("Soundtrack reset to original.");
			});
		}
	}

	function bindTabScenariosBtnClick() {
		runtime.tabScenariosBtn.onclick = () => runtime.switchHubTab("scenarios");
	}

	function bindTabCountriesBtnClick() {
		runtime.tabCountriesBtn.onclick = () => runtime.switchHubTab("countries");
	}

	function bindTabFlagsBtnClick() {
		runtime.tabFlagsBtn.onclick = () => runtime.switchHubTab("flags");
	}

	function bindPresetLowBtnClick() {
		runtime.presetLowBtn.addEventListener("click", () => {
			runtime.settingsController.apply({
				"map-res-select": "110m",
				"grid-res-select": "0.15",
				"unit-limit-select": "100",
				"disable-country-gradient-checkbox": true,
				"disable-mountains-checkbox": true,
			});
			runtime.presetLowBtn.style.boxShadow = "0 0 15px rgba(192, 57, 43, 0.5)";
			runtime.presetDefaultBtn.style.boxShadow = "none";
		});
	}

	function bindPresetDefaultBtnClick() {
		runtime.presetDefaultBtn.addEventListener("click", () => {
			runtime.settingsController.apply({
				"map-res-select": "50m",
				"grid-res-select": "0.1",
				"unit-limit-select": "250",
				"disable-country-gradient-checkbox": false,
				"disable-mountains-checkbox": false,
			});
			runtime.presetDefaultBtn.style.boxShadow =
				"0 0 15px rgba(46, 134, 222, 0.5)";
			runtime.presetLowBtn.style.boxShadow = "none";
		});
	}

	function bindLaunchBtnClick() {
		runtime.launchBtn.addEventListener("click", async () => {
			runtime.primeAudio();
			await runtime.initializeEngine();

			if (runtime.saveSkipCheckbox.checked) runtime.settingsController.save();
			else runtime.setCookie("mw_skip_settings", "false");

			runtime.settingsOverlay.style.display = "none";
			if (runtime.gameState === "MAIN_MENU") {
				runtime.simulationClient?.stop();
				runtime.mainMenu.style.display = "flex";
			} else {
				runtime.mapUi.style.display = "flex";
				if (runtime.currentScenarioContext && runtime.gameMode === "EDITOR") {
					runtime.statusText.innerText = `REMIXING: ${runtime.currentScenarioContext.name}`;
				} else if (
					runtime.currentScenarioContext &&
					runtime.gameMode === "CONQUEST"
				) {
					runtime.statusText.innerText = `PLAYING: ${runtime.currentScenarioContext.name}`;
				}
			}
			runtime.launchBtn.innerText = "Save settings"; // Change for subsequent opens
		});
	}

	function bindSettingsTabBtnClick() {
		document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const tab = btn.dataset.tab;
				// Buttons UI
				document.querySelectorAll(".settings-tab-btn").forEach((b) => {
					b.classList.remove("active");
				});
				btn.classList.add("active");
				// Panes UI
				document.querySelectorAll(".settings-tab-pane").forEach((pane) => {
					pane.style.display = "none";
				});
				const target = document.getElementById(`settings-tab-${tab}`);
				if (target) target.style.display = "block";
			});
		});
	}

	function bindLanguageSelectChange() {
		document
			.getElementById("language-select")
			?.addEventListener("change", (event) =>
				runtime.applyLanguage(event.target.value),
			);
	}

	function bindMainSettingsBtnClick() {
		runtime.mainSettingsBtn.addEventListener("click", () => {
			runtime.settingsOverlay.style.display = "flex";
			runtime.mainMenu.style.display = "none";
		});
	}

	function bindBenchmarkBtnClick() {
		if (runtime.benchmarkBtn) {
			runtime.benchmarkBtn.addEventListener("click", () => {
				runtime.mainMenu.style.display = "none";
				runtime.settingsOverlay.style.display = "none";
				runtime.startBenchmark().catch((error) => {
					console.error("[MW PERF] Benchmark failed:", error);
					showAlert(`Benchmark failed: ${error.message}`);
				});
			});
		}
	}

	function bindBenchmarkDismissBtnClick() {
		if (runtime.benchmarkDismissBtn) {
			runtime.benchmarkDismissBtn.addEventListener("click", () => {
				if (runtime.benchmarkResults)
					runtime.benchmarkResults.style.display = "none";
				runtime.isPaused = false;
			});
		}
	}

	function bindHelpBtnClick() {
		document.getElementById("help-btn")?.addEventListener("click", () => {
			runtime.startTutorial(
				runtime.conquestTutorialSteps,
				"mw_tutorial_finished",
			);
		});
	}

	function bindFullscreenBtnClick() {
		document
			.getElementById("fullscreen-btn")
			?.addEventListener("click", async () => {
				try {
					if (document.fullscreenElement) await document.exitFullscreen();
					else await document.documentElement.requestFullscreen();
				} catch (error) {
					console.warn("Fullscreen unavailable", error);
				}
			});
	}

	function bindHudMenuClick() {
		document.getElementById("hud-menu")?.addEventListener("click", (event) => {
			if (event.target.closest("button")) event.currentTarget.open = false;
		});
	}

	function bindIngameSettingsBtnClick() {
		runtime.ingameSettingsBtn.addEventListener("click", () => {
			runtime.settingsOverlay.style.display = "flex";
			runtime.mapUi.style.display = "none";
		});
	}

	function bindCloseSettingsBtnClick() {
		if (runtime.closeSettingsBtn) {
			runtime.closeSettingsBtn.addEventListener("click", () => {
				runtime.settingsOverlay.style.display = "none";
				if (runtime.gameState === "MAIN_MENU") {
					runtime.simulationClient?.stop();
					runtime.mainMenu.style.display = "flex";
				} else {
					runtime.mapUi.style.display = "flex";
				}
			});
		}
	}

	function bindPlayModeBtnClick() {
		runtime.playModeBtn.addEventListener("click", () => {
			const navMain = document.getElementById("nav-links-container");
			const selector = document.getElementById("menu-scenario-selector");
			navMain.style.display = "none";
			selector.style.display = "flex";
			runtime.selectScenario("scroller-choice-modern", () =>
				runtime.choiceModernDay.click(),
			);
		});
	}

	function bindBackToNavBtnClick() {
		document.getElementById("back-to-nav-btn").addEventListener("click", () => {
			const navMain = document.getElementById("nav-links-container");
			const selector = document.getElementById("menu-scenario-selector");

			selector.style.opacity = "0";
			selector.style.transform = "translateX(50px)";

			setTimeout(() => {
				selector.style.display = "none";
				selector.style.opacity = "1";
				selector.style.transform = "none";
				navMain.style.display = "flex";
				setTimeout(() => navMain.classList.remove("hidden"), 10);
			}, 400);
		});
	}

	function bindEnterScenarioBtnClick() {
		runtime.enterScenarioBtn.onclick = () => {
			if (runtime.queuedScenarioAction) {
				runtime.queuedScenarioAction();
			}
		};
	}

	function bindScrollerChoiceModernClick() {
		document.getElementById("scroller-choice-modern").onclick = () =>
			runtime.selectScenario("scroller-choice-modern", () =>
				runtime.choiceModernDay.click(),
			);
	}

	function bindScrollerChoice1936Click() {
		document.getElementById("scroller-choice-1936").onclick = () =>
			runtime.selectScenario("scroller-choice-1936", () =>
				runtime.choice1936Scenario.click(),
			);
	}

	function bindScrollerChoice1914Click() {
		document.getElementById("scroller-choice-1914").onclick = () =>
			runtime.selectScenario("scroller-choice-1914", () =>
				runtime.choiceWW1Scenario.click(),
			);
	}

	function bindChoiceModernDayClick() {
		runtime.choiceModernDay.onclick = runtime.createScenarioHandler(
			"modern",
			runtime.scenarioMenuDependencies,
		);
	}

	function bindChoice1936ScenarioClick() {
		runtime.choice1936Scenario.onclick = runtime.createScenarioHandler(
			"ww2",
			runtime.scenarioMenuDependencies,
		);
	}

	function bindChoiceWW1ScenarioClick() {
		runtime.choiceWW1Scenario.onclick = runtime.createScenarioHandler(
			"ww1",
			runtime.scenarioMenuDependencies,
		);
	}

	function bindCancelConquestChoiceClick() {
		runtime.cancelConquestChoice.onclick = () => {
			runtime.conquestChoiceModal.style.display = "none";
		};
	}

	function bindCloseReleaseModalBtnClick() {
		runtime.closeReleaseModalBtn.onclick = () => {
			runtime.releaseModal.style.display = "none";
		};
	}

	function bindCancelCreateBtnClick() {
		runtime.cancelCreateBtn.addEventListener("click", () => {
			runtime.createCountryModal.style.display = "none";
		});
	}

	function bindBrushSizeSliderInput() {
		runtime.brushSizeSlider.addEventListener("input", (e) => {
			runtime.brushSize = parseFloat(e.target.value);
			runtime.brushSizeVal.innerText = runtime.brushSize.toFixed(1);
		});
	}

	function bindSetOverlordBtnClick() {
		document.getElementById("set-overlord-btn").onclick = () => {
			if (runtime.editingCountryId <= 0) return;
			runtime.selectingOverlordForId = runtime.editingCountryId;
			runtime.gameState = "EDITOR_SELECTING_OVERLORD";
			runtime.statusText.innerText = "Select Overlord Country (Click map)";
			runtime.countryInspector.style.display = "none";
			runtime.map.getContainer().classList.add("painting-cursor");
		};
	}

	function bindSetReleasableBtnClick() {
		document.getElementById("set-releasable-btn").onclick = () => {
			if (runtime.editingCountryId <= 0) return;
			runtime.selectingOverlordForId = runtime.editingCountryId;
			runtime.gameState = "EDITOR_SELECTING_RELEASER";
			runtime.statusText.innerText = "Select Host Nation (Releaser) on map";
			runtime.countryInspector.style.display = "none";
			runtime.map.getContainer().classList.add("painting-cursor");
		};
	}

	function bindMapSettingsCancelBtnClick() {
		if (runtime.mapSettingsCancelBtn && runtime.mapSettingsModal) {
			runtime.mapSettingsCancelBtn.addEventListener("click", () => {
				runtime.mapSettingsModal.style.display = "none";
			});
		}
	}

	function bindMapSettingsApplyBtnClick() {
		if (runtime.mapSettingsApplyBtn && runtime.mapSettingsModal) {
			runtime.mapSettingsApplyBtn.addEventListener("click", () => {
				const newName =
					runtime.mapSettingsNameInput.value.trim() || "Untitled Map";
				const newW = parseFloat(runtime.mapSettingsWidthInput.value) || 360;
				const newH = parseFloat(runtime.mapSettingsHeightInput.value) || 180;
				const newMissilesEnabled =
					!!runtime.mapSettingsMissilesCheckbox.checked;

				const sizeChanged =
					newW !== runtime.worldWidthDeg || newH !== runtime.worldHeightDeg;

				runtime.mapName = newName;
				runtime.missilesEnabled = newMissilesEnabled;

				if (sizeChanged) runtime.applyWorldBounds(newW, newH);

				// Sync missiles toggle with simulation-level bombsDisabled and checkboxes
				if (runtime.disableBombsCheckbox) {
					runtime.disableBombsCheckbox.checked = !runtime.missilesEnabled;
				}
				runtime.bombsDisabled =
					runtime.disableBombsCheckbox?.checked || !runtime.missilesEnabled;

				runtime.mapSettingsModal.style.display = "none";
				runtime.statusText.innerText = `MAP SETTINGS UPDATED: ${runtime.mapName}`;
				runtime.influenceLayer.render();
			});
		}
	}

	function bindClearSatBtnClick() {
		document.getElementById("clear-sat-btn")?.addEventListener("click", () => {
			runtime.customSatelliteUrl = null;
			runtime.customSatelliteImg = null;
			runtime.influenceLayer.render();
		});
	}

	function bindImportCountryCancelBtnClick() {
		if (runtime.importCountryCancelBtn) {
			runtime.importCountryCancelBtn.addEventListener("click", () => {
				runtime.importCountryModal.style.display = "none";
			});
		}
	}

	function bindLeaderboardBtnClick() {
		if (runtime.leaderboardBtn) {
			runtime.leaderboardBtn.addEventListener("click", () => {
				runtime.openLeaderboard();
			});
		}
	}

	function bindCloseLeaderboardBtnClick() {
		if (runtime.closeLeaderboardBtn) {
			runtime.closeLeaderboardBtn.addEventListener("click", () => {
				runtime.leaderboardOverlay.style.display = "none";
			});
		}
	}

	function bindCloseHubBtnClick() {
		runtime.closeHubBtn.addEventListener("click", () => {
			runtime.closeHub();
		});
	}

	function bindMinimizeSetupBtnClick() {
		runtime.minimizeSetupBtn.onclick = (e) => {
			e.stopPropagation();
			const isMinimized = runtime.setupPanel.classList.toggle("minimized");
			runtime.minimizeSetupBtn.innerText = isMinimized ? "+" : "−";
		};
	}

	function bindMinimizeStatsBtnClick() {
		runtime.minimizeStatsBtn.onclick = (e) => {
			e.stopPropagation();
			const isMinimized = runtime.statsPanel.classList.toggle("minimized");
			runtime.minimizeStatsBtn.innerText = isMinimized ? "+" : "−";
		};
	}

	function bindMinimizeStatusBtnClick() {
		runtime.minimizeStatusBtn.onclick = (e) => {
			e.stopPropagation();
			const isMinimized = document
				.getElementById("game-status")
				.classList.toggle("minimized");
			runtime.minimizeStatusBtn.innerText = isMinimized ? "+" : "−";
		};
	}

	function bindStartBtnClick() {
		runtime.startBtn.addEventListener("click", () => runtime.startWar());
	}

	function bindQuickRestartBtnClick() {
		runtime.quickRestartBtn.addEventListener("click", () => {
			runtime.resetGame();
		});
	}
	return {
		bindImportCountrySearchInput,
		bindTutorialSkipBtnClick,
		bindTutorialPrevBtnClick,
		bindAddSideBtnClick,
		bindFfaToggleBtnClick,
		bindRandomWarBtnClick,
		bindViewModeBtnClick,
		bindAllianceViewCheckboxChange,
		bindBattlesToggleBtnClick,
		bindLabelsToggleBtnClick,
		bindCitiesToggleBtnClick,
		bindWarplansToggleBtnClick,
		bindShowWarplansCheckboxChange,
		bindShowLabelsCheckboxChange,
		bindShowCitiesCheckboxChange,
		bindShowBattlesCheckboxChange,
		bindShowAllianceCheckboxChange,
		bindNoPeaceCheckboxChange,
		bindUseSecretSoundsCheckboxChange,
		bindSetupDisableMountainsCheckboxChange,
		bindMainDisableMountainsCheckboxChange,
		bindRestartScenarioBtnClick,
		bindResetBtnClick,
		bindForcePeaceBtnClick,
		bindPauseBtnClick,
		bindSpeedSelectorChange,
		bindCustomTrackInputChange,
		bindClearCustomTrackBtnClick,
		bindTabScenariosBtnClick,
		bindTabCountriesBtnClick,
		bindTabFlagsBtnClick,
		bindPresetLowBtnClick,
		bindPresetDefaultBtnClick,
		bindLaunchBtnClick,
		bindSettingsTabBtnClick,
		bindLanguageSelectChange,
		bindMainSettingsBtnClick,
		bindBenchmarkBtnClick,
		bindBenchmarkDismissBtnClick,
		bindHelpBtnClick,
		bindFullscreenBtnClick,
		bindHudMenuClick,
		bindIngameSettingsBtnClick,
		bindCloseSettingsBtnClick,
		bindPlayModeBtnClick,
		bindBackToNavBtnClick,
		bindEnterScenarioBtnClick,
		bindScrollerChoiceModernClick,
		bindScrollerChoice1936Click,
		bindScrollerChoice1914Click,
		bindChoiceModernDayClick,
		bindChoice1936ScenarioClick,
		bindChoiceWW1ScenarioClick,
		bindCancelConquestChoiceClick,
		bindCloseReleaseModalBtnClick,
		bindCancelCreateBtnClick,
		bindBrushSizeSliderInput,
		bindSetOverlordBtnClick,
		bindSetReleasableBtnClick,
		bindMapSettingsCancelBtnClick,
		bindMapSettingsApplyBtnClick,
		bindClearSatBtnClick,
		bindImportCountryCancelBtnClick,
		bindLeaderboardBtnClick,
		bindCloseLeaderboardBtnClick,
		bindCloseHubBtnClick,
		bindMinimizeSetupBtnClick,
		bindMinimizeStatsBtnClick,
		bindMinimizeStatusBtnClick,
		bindStartBtnClick,
		bindQuickRestartBtnClick,
	};
}
