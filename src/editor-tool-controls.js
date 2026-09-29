// Controls receive live state and commands; they do not import the application.
export function createEditorToolControls(runtime) {
	function bindEditorCreateBtnClick() {
		runtime.editorCreateBtn.addEventListener("click", () => {
			runtime.createCountryModal.style.display = "flex";
		});
	}

	function bindEditorPaintBtnClick() {
		runtime.editorPaintBtn.addEventListener("click", () => {
			if (runtime.gameState === "EDITOR_PAINTING") {
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = "Map Editor (Alpha)";
				runtime.editorPaintBtn.classList.remove("active");
				runtime.map.getContainer().classList.remove("painting-cursor");
				runtime.brushControls.style.display = "none";
			} else if (
				runtime.editingCountryId > 0 ||
				runtime.gameState === "EDITOR_UNCLAIMING"
			) {
				runtime.gameState = "EDITOR_PAINTING";
				runtime.statusText.innerText = "PAINTING BORDERS (Drag to draw)";
				runtime.editorPaintBtn.classList.add("active");
				runtime.editorFillBtn.classList.remove("active");
				runtime.editorUnclaimBtn.classList.remove("active");
				runtime.map.getContainer().classList.add("painting-cursor");
				runtime.brushControls.style.display = "flex";
			}
		});
	}

	function bindEditorFillBtnClick() {
		runtime.editorFillBtn.addEventListener("click", () => {
			if (
				runtime.gameState === "EDITOR_FILLING" ||
				runtime.gameState === "EDITOR_FILLING_TERRAIN"
			) {
				const wasTerrain = runtime.gameState === "EDITOR_FILLING_TERRAIN";
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = "Map Editor (Alpha)";
				runtime.editorFillBtn.classList.remove("active");
				runtime.map.getContainer().classList.remove("painting-cursor");
				// If we were filling terrain, return to the terrain menu state
				if (wasTerrain) {
					runtime.gameState = "EDITOR_PAINTING_TERRAIN";
					runtime.editorTerrainBtn.classList.add("active");
					runtime.statusText.innerText =
						"TERRAIN BRUSH (Paint land or carve oceans)";
					runtime.map.getContainer().classList.add("painting-cursor");
					runtime.brushControls.style.display = "flex";
					runtime.terrainControls.style.display = "flex";
				}
			} else if (runtime.gameState === "EDITOR_PAINTING_TERRAIN") {
				runtime.gameState = "EDITOR_FILLING_TERRAIN";
				runtime.statusText.innerText = "FILL TERRAIN (Click a region)";
				runtime.editorFillBtn.classList.add("active");
				runtime.editorTerrainBtn.classList.remove("active");
				runtime.brushControls.style.display = "none";
				runtime.map.getContainer().classList.add("painting-cursor");
			} else if (
				runtime.editingCountryId > 0 ||
				runtime.gameState === "EDITOR_UNCLAIMING"
			) {
				runtime.gameState = "EDITOR_FILLING";
				runtime.statusText.innerText = "FILL TOOL (Click a region)";
				runtime.editorFillBtn.classList.add("active");
				runtime.editorPaintBtn.classList.remove("active");
				runtime.editorUnclaimBtn.classList.remove("active");
				runtime.brushControls.style.display = "none";
				runtime.map.getContainer().classList.add("painting-cursor");
			}
		});
	}

	function bindEditorUnclaimBtnClick() {
		runtime.editorUnclaimBtn.addEventListener("click", () => {
			if (runtime.gameState === "EDITOR_UNCLAIMING") {
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = "Map Editor (Alpha)";
				runtime.editorUnclaimBtn.classList.remove("active");
				runtime.map.getContainer().classList.remove("painting-cursor");
				runtime.brushControls.style.display = "none";
			} else {
				runtime.gameState = "EDITOR_UNCLAIMING";
				runtime.statusText.innerText =
					"UNCLAIM TOOL (Remove country ownership)";
				runtime.editorUnclaimBtn.classList.add("active");
				runtime.editorPaintBtn.classList.remove("active");
				runtime.editorFillBtn.classList.remove("active");
				runtime.editorTerrainBtn.classList.remove("active");
				runtime.terrainControls.style.display = "none";
				runtime.editorPlaceDivisionBtn.classList.remove("active");
				runtime.map.getContainer().classList.add("painting-cursor");
				runtime.brushControls.style.display = "flex";
			}
		});
	}

	function bindEditorTerrainBtnClick() {
		runtime.editorTerrainBtn.addEventListener("click", () => {
			if (runtime.gameState === "EDITOR_PAINTING_TERRAIN") {
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = "Map Editor (Alpha)";
				runtime.editorTerrainBtn.classList.remove("active");
				runtime.map.getContainer().classList.remove("painting-cursor");
				runtime.brushControls.style.display = "none";
				runtime.terrainControls.style.display = "none";
			} else {
				runtime.gameState = "EDITOR_PAINTING_TERRAIN";
				runtime.statusText.innerText =
					"TERRAIN BRUSH (Paint land or carve oceans)";
				runtime.editorTerrainBtn.classList.add("active");
				runtime.editorPaintBtn.classList.remove("active");
				runtime.editorFillBtn.classList.remove("active");
				runtime.editorUnclaimBtn.classList.remove("active");
				runtime.editorPlaceDivisionBtn.classList.remove("active");
				runtime.map.getContainer().classList.add("painting-cursor");
				runtime.brushControls.style.display = "flex";
				runtime.terrainControls.style.display = "flex";
			}
		});
	}

	function bindEditorPlaceDivisionBtnClick() {
		runtime.editorPlaceDivisionBtn.addEventListener("click", () => {
			if (runtime.gameState === "EDITOR_PLACING_DIVISION") {
				runtime.gameState = "EDITOR_ACTIVE";
				runtime.statusText.innerText = runtime.godModeActive
					? "GOD MODE: Map Editing Active"
					: "Map Editor (Alpha)";
				runtime.editorPlaceDivisionBtn.classList.remove("active");
				runtime.map.getContainer().classList.remove("painting-cursor");
			} else {
				runtime.gameState = "EDITOR_PLACING_DIVISION";
				runtime.editingCountryId = -1; // Reset to force selecting a new country source
				runtime.statusText.innerText =
					"SELECT SOURCE: Click a nation to deploy its divisions";
				runtime.editorPlaceDivisionBtn.classList.add("active");
				runtime.editorPaintBtn.classList.remove("active");
				runtime.editorFillBtn.classList.remove("active");
				runtime.editorUnclaimBtn.classList.remove("active");
				runtime.countryInspector.style.display = "none";
				runtime.brushControls.style.display = "none";
				runtime.map.getContainer().classList.add("painting-cursor");
			}
		});
	}

	function bindEditorExitBtnClick() {
		runtime.editorExitBtn.addEventListener("click", () => {
			location.reload(); // Quick reset
		});
	}

	function bindEditorMapSettingsBtnClick() {
		if (runtime.editorMapSettingsBtn && runtime.mapSettingsModal) {
			runtime.editorMapSettingsBtn.addEventListener("click", () => {
				// Pre-fill fields from current state
				runtime.mapSettingsNameInput.value = runtime.mapName || "";
				runtime.mapSettingsWidthInput.value = runtime.worldWidthDeg || 360;
				runtime.mapSettingsHeightInput.value = runtime.worldHeightDeg || 180;
				runtime.mapSettingsMissilesCheckbox.checked = !!runtime.missilesEnabled;
				runtime.mapSettingsModal.style.display = "flex";
			});
		}
	}

	function bindEditorToolPages() {
		for (let page = 1; page <= 5; page++) {
			const button = runtime[`editorToolsPage${page}Btn`];
			button?.addEventListener("click", () =>
				runtime.updateEditorToolPage(page),
			);
		}
	}

	function bindEditorTestBtnClick() {
		runtime.editorTestBtn.addEventListener("click", () => {
			if (runtime.countryMetadata.length < 2) {
				alert("You need at least 2 nations to test a conflict.");
				return;
			}
			runtime.gameMode = "EDITOR_TEST";
			runtime.gameState = "SELECTING_P1";
			runtime.statusText.innerText = "Test: Select First Country";
			runtime.editorToolbox.style.display = "none";
			runtime.setupPanel.style.display = "block";
			runtime.setupOptions.style.display = "none";
			runtime.resetBtn.style.display = "block";

			// Clear selections
			runtime._attackers = [];
			runtime._defenders = [];

			runtime.updateSidesUI();
			runtime.influenceLayer.render();
		});
	}

	function bindEditorHubBtnClick() {
		runtime.editorHubBtn.addEventListener("click", () => {
			runtime.openHub("scenarios");
		});
	}

	function bindEditorLibraryBtnClick() {
		runtime.editorLibraryBtn.addEventListener("click", () => {
			runtime.openHub("countries");
		});
	}

	function bindEditorSaveCountryBtnClick() {
		document
			.getElementById("editor-save-country-btn")
			.addEventListener("click", () => {
				if (runtime.editingCountryId <= 0) return;
				runtime.saveCountryLocally(runtime.editingCountryId);
			});
	}

	function bindEditorLoadCountryBtnClick() {
		document
			.getElementById("editor-load-country-btn")
			.addEventListener("click", () => {
				runtime.loadCountryFromPC();
			});
	}

	function bindEditorImportCountryBtnClick() {
		if (runtime.editorImportCountryBtn) {
			runtime.editorImportCountryBtn.addEventListener("click", () => {
				runtime.openImportCountryModal();
			});
		}
	}

	function bindEditorFlagLibraryBtnClick() {
		runtime.editorFlagLibraryBtn.addEventListener("click", () => {
			runtime.openHub("flags");
		});
	}

	function bindCancelEditorChoiceClick() {
		runtime.cancelEditorChoice.onclick = () => {
			runtime.editorChoiceModal.style.display = "none";
		};
	}

	function bindChoiceExternalEditorClick() {
		runtime.choiceExternalEditor.onclick = () => {
			window.open(
				"https://websim.com/@thepineguy/modern-wars-alternative-editor",
				"_blank",
			);
			runtime.editorChoiceModal.style.display = "none";
		};
	}

	function bindChoiceIngameEditorClick() {
		runtime.choiceIngameEditor.onclick = () => {
			runtime.editorChoiceModal.style.display = "none";
			runtime.editorSourceModal.style.display = "flex";
		};
	}

	function bindCancelSourceChoiceClick() {
		runtime.cancelSourceChoice.onclick = () => {
			runtime.editorSourceModal.style.display = "none";
			runtime.editorChoiceModal.style.display = "flex";
		};
	}

	function bindChoiceSourceEarthClick() {
		runtime.choiceSourceEarth.onclick = async () => {
			runtime.isCustomTerrain = false;
			runtime.editorSourceModal.style.display = "none";
			runtime.primeAudio();
			runtime.gameMode = "EDITOR";
			runtime.gameState = "EDITOR_ACTIVE";
			runtime.currentScenarioContext = null;
			runtime.activeScenarioId = null;
			runtime.editorUpdateBtn.style.display = "none";
			runtime.mainMenu.style.display = "none";
			runtime.mapUi.style.display = "flex";
			runtime.editorToolbox.style.display = "flex";

			// Allocate every grid buffer through the canonical engine path. This also
			// keeps biome and influence buffers synchronized after resolution changes.
			runtime.initializeEngine(false);
			runtime.statusText.innerText = "Map Editor (Alpha)";
			runtime.setupPanel.style.display = "none";
			runtime.resetBtn.style.display = "block";
			runtime.editorUnclaimBtn.style.display = "block";

			// Load real‑earth geography without establishing countries
			const mapRes = document.getElementById("map-res-select").value;
			const geoUrl = `${runtime.CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
			await runtime.loadCountries(geoUrl, true);
			runtime.initAudio();

			if (runtime.getCookie("mw_editor_tutorial_finished") !== "true") {
				runtime.startTutorial(
					runtime.editorTutorialSteps,
					"mw_editor_tutorial_finished",
				);
			}

			runtime.updateRestartVisibility();
		};
	}

	function bindChoiceSourceBlankClick() {
		runtime.choiceSourceBlank.onclick = () => {
			document.getElementById("blank-size-modal").style.display = "flex";
		};
	}

	function bindCancelBlankSizeBtnClick() {
		document.getElementById("cancel-blank-size-btn").onclick = () => {
			document.getElementById("blank-size-modal").style.display = "none";
		};
	}

	function bindConfirmBlankSizeBtnClick() {
		document.getElementById("confirm-blank-size-btn").onclick = () => {
			const w =
				parseFloat(document.getElementById("blank-width-input").value) || 360;
			const h =
				parseFloat(document.getElementById("blank-height-input").value) || 180;

			document.getElementById("blank-size-modal").style.display = "none";
			runtime.isCustomTerrain = true;
			runtime.editorSourceModal.style.display = "none";
			runtime.initAudio();
			runtime.gameMode = "EDITOR";
			runtime.gameState = "EDITOR_ACTIVE";
			runtime.currentScenarioContext = null;
			runtime.activeScenarioId = null;
			runtime.editorUpdateBtn.style.display = "none";
			runtime.mainMenu.style.display = "none";
			runtime.mapUi.style.display = "flex";
			runtime.editorToolbox.style.display = "flex";

			// Ensure grid is ready
			if (!runtime.worldControlMap) {
				runtime.initializeEngine();
			}

			// Initialize Blank Canvas State
			runtime.worldControlMap.fill(0);
			runtime.deJureMap.fill(0);
			runtime.landMask.fill(0);
			runtime.provinceMap.fill(0);
			runtime.terrainMask.fill(0);
			runtime.cities = [];
			runtime.activeTheaterCities = [];
			runtime.countryMetadata = [];

			// Custom World Size Logic:
			// If w or h are smaller than full world, we restrict the view and paintable area
			if (w < 360 || h < 180) {
				const halfW = w / 2;
				const halfH = h / 2;
				const bounds = [
					[-halfH, -halfW],
					[halfH, halfW],
				];
				runtime.map.setMaxBounds(bounds);
				runtime.map.fitBounds(bounds);

				// Block painting outside these bounds by keeping landMask at 0 (Ocean) for those cells
				// Note: The paintAt logic already checks landMask[idx] > 0 for country painting.
				// We'll also update terrain brush to respect these bounds if we really wanted to be strict.
			} else {
				runtime.map.setMaxBounds(null);
			}

			// Switch to Simplified View for better "blank canvas" painting feel (temporarily)
			runtime.setImageryProvider("wargames", false);
			if (runtime.disableCountryGradientCheckbox) {
				runtime.disableCountryGradientCheckbox.checked = true;
				runtime.disableCountryGradient = true;
			}

			runtime.statusText.innerText = "Blank Canvas: Draw Terrain";
			runtime.setupPanel.style.display = "none";
			runtime.resetBtn.style.display = "block";

			// Instantly jump to Page 3 tools so they see the terrain brush
			runtime.updateEditorToolPage(3);

			runtime.influenceLayer.render();
			runtime.updateRestartVisibility();
		};
	}
	return {
		bindEditorCreateBtnClick,
		bindEditorPaintBtnClick,
		bindEditorFillBtnClick,
		bindEditorUnclaimBtnClick,
		bindEditorTerrainBtnClick,
		bindEditorPlaceDivisionBtnClick,
		bindEditorExitBtnClick,
		bindEditorMapSettingsBtnClick,
		bindEditorToolPages,
		bindEditorTestBtnClick,
		bindEditorHubBtnClick,
		bindEditorLibraryBtnClick,
		bindEditorSaveCountryBtnClick,
		bindEditorLoadCountryBtnClick,
		bindEditorImportCountryBtnClick,
		bindEditorFlagLibraryBtnClick,
		bindCancelEditorChoiceClick,
		bindChoiceExternalEditorClick,
		bindChoiceIngameEditorClick,
		bindCancelSourceChoiceClick,
		bindChoiceSourceEarthClick,
		bindChoiceSourceBlankClick,
		bindCancelBlankSizeBtnClick,
		bindConfirmBlankSizeBtnClick,
	};
}
