// Controls receive live state and commands; they do not import the application.
export function createEditorFileControls(runtime) {
	function bindEditorUpdateBtnClick() {
		runtime.editorUpdateBtn.addEventListener("click", async () => {
			if (!runtime.activeScenarioId) return;
			if (
				!confirm(
					"Update existing scenario? This will overwrite the map file and thumbnail on the Hub.",
				)
			)
				return;

			runtime.setLoadingThematic(false);
			runtime.loadingStatus.innerText = "Updating Scenario...";
			runtime.loadingOverlay.style.display = "flex";

			try {
				// 1. Generate updated preview
				let previewUrl = null;
				if (runtime.influenceLayer?._container) {
					runtime.influenceLayer._isCapturing = true;
					runtime.influenceLayer.render();
					const canvas = runtime.influenceLayer._container;
					const previewBlob = await new Promise((resolve) =>
						canvas.toBlob(resolve, "image/jpeg", 0.8),
					);
					runtime.influenceLayer._isCapturing = false;
					runtime.influenceLayer.render();
					if (previewBlob) {
						const previewFile = new File([previewBlob], "update_preview.jpg", {
							type: "image/jpeg",
						});
						previewUrl = await websim.upload(previewFile);
					}
				}

				// 2. Generate updated preset data
				const currentName = runtime.statusText.innerText
					.replace("REMIXING: ", "")
					.replace("Map Editor (Alpha)", "Updated Scenario");
				const saveData = runtime.generatePresetData(currentName);
				const blob = new Blob([JSON.stringify(saveData)], {
					type: "application/json",
				});
				const file = new File([blob], "updated_scenario.json", {
					type: "application/json",
				});
				const blobUrl = await websim.upload(file);

				// 3. Update existing record
				await runtime.room
					.collection("scenario_v1")
					.update(runtime.activeScenarioId, {
						previewUrl: previewUrl,
						blobUrl: blobUrl,
					});

				runtime.loadingOverlay.style.display = "none";
				alert("Scenario updated successfully!");
			} catch (e) {
				console.error(e);
				alert("Update failed. You can only update scenarios you created.");
				runtime.loadingOverlay.style.display = "none";
			}
		});
	}

	function bindShareCountryBtnClick() {
		runtime.shareCountryBtn.addEventListener("click", () => {
			if (runtime.editingCountryId <= 0) return;
			const meta = runtime.countryMetadata[runtime.editingCountryId - 1];
			if (!meta) return;

			runtime.shareCountryNameInput.value = meta.name || "Custom Nation";
			runtime.shareCountryDescInput.value = "";
			runtime.shareCountryModal.style.display = "flex";
		});
	}

	function bindShareFlagBtnClick() {
		runtime.shareFlagBtn.addEventListener("click", () => {
			if (runtime.editingCountryId <= 0) return;
			const meta = runtime.countryMetadata[runtime.editingCountryId - 1];
			if (!meta?.flagUrl) {
				alert(
					"This nation does not have a flag to share. Upload or fetch one first.",
				);
				return;
			}

			runtime.shareFlagNameInput.value = `${meta.name || "Custom"} Flag`;
			runtime.shareFlagDescInput.value = "";
			runtime.shareFlagModal.style.display = "flex";
		});
	}

	function bindCancelShareFlagBtnClick() {
		runtime.cancelShareFlagBtn.onclick = () => {
			runtime.shareFlagModal.style.display = "none";
		};
	}

	function bindConfirmShareFlagBtnClick() {
		runtime.confirmShareFlagBtn.onclick = async () => {
			if (runtime.editingCountryId <= 0) return;
			const meta = runtime.countryMetadata[runtime.editingCountryId - 1];
			if (!meta?.flagUrl) return;

			const publicName =
				runtime.shareFlagNameInput.value.trim() || "Custom Flag";
			const description = runtime.shareFlagDescInput.value.trim();

			runtime.shareFlagModal.style.display = "none";
			runtime.loadingStatus.innerText = "Sharing Flag to Library...";
			runtime.loadingOverlay.style.display = "flex";

			try {
				await runtime.room.collection("flag_library_v1").create({
					name: publicName,
					description: description,
					flagUrl: meta.flagUrl,
				});
				runtime.loadingOverlay.style.display = "none";
				alert("Flag successfully shared!");
			} catch (e) {
				console.error(e);
				alert("Failed to share flag.");
				runtime.loadingOverlay.style.display = "none";
			}
		};
	}

	function bindCancelShareCountryBtnClick() {
		runtime.cancelShareCountryBtn.onclick = () => {
			runtime.shareCountryModal.style.display = "none";
		};
	}

	function bindConfirmShareCountryBtnClick() {
		runtime.confirmShareCountryBtn.onclick = async () => {
			if (runtime.editingCountryId <= 0) return;
			const meta = runtime.countryMetadata[runtime.editingCountryId - 1];
			if (!meta) return;

			const publicName =
				runtime.shareCountryNameInput.value.trim() ||
				meta.name ||
				"Custom Nation";
			const description = runtime.shareCountryDescInput.value.trim();

			runtime.shareCountryModal.style.display = "none";
			runtime.loadingStatus.innerText = `Saving ${publicName} to Library...`;
			runtime.loadingOverlay.style.display = "flex";

			try {
				// 1. Generate Border Preview
				let previewUrl = null;
				if (runtime.influenceLayer?._container) {
					runtime.influenceLayer._isCapturing = true;
					runtime.influenceLayer.render();
					const canvas = runtime.influenceLayer._container;
					const previewBlob = await new Promise((resolve) =>
						canvas.toBlob(resolve, "image/jpeg", 0.8),
					);
					runtime.influenceLayer._isCapturing = false;
					runtime.influenceLayer.render();
					if (previewBlob) {
						const previewFile = new File([previewBlob], "country_preview.jpg", {
							type: "image/jpeg",
						});
						previewUrl = await websim.upload(previewFile);
					}
				}

				// 2. Collect all cells belonging to this country
				const cells = [];
				for (let i = 0; i < runtime.worldControlMap.length; i++) {
					if (runtime.worldControlMap[i] === runtime.editingCountryId) {
						const y = Math.floor(i / runtime.gridWidth);
						const x = i % runtime.gridWidth;
						cells.push([x, y]);
					}
				}

				if (cells.length === 0) {
					alert("Country has no territory to share!");
					runtime.loadingOverlay.style.display = "none";
					return;
				}

				// 3. Upload Cells Data as a file to bypass 250KB record limit
				const cellsBlob = new Blob([JSON.stringify(cells)], {
					type: "application/json",
				});
				const cellsFile = new File([cellsBlob], "country_cells.json", {
					type: "application/json",
				});
				const cellsUrl = await websim.upload(cellsFile);

				// 4. Create Persistent Record
				await runtime.room.collection("country_library_v1").create({
					name: publicName,
					description: description,
					previewUrl: previewUrl,
					color: meta.color,
					flagUrl: meta.flagUrl,
					gridRes: runtime.CONFIG.GRID_RES,
					cellsUrl: cellsUrl,
				});

				runtime.loadingOverlay.style.display = "none";
				alert("Country added to Global Library!");
			} catch (e) {
				console.error(e);
				alert("Failed to share country.");
				runtime.loadingOverlay.style.display = "none";
			}
		};
	}

	function bindEditorSaveBtnClick() {
		runtime.editorSaveBtn.addEventListener("click", () => {
			const presetName = prompt(
				"Enter a name for this preset:",
				"My Custom Scenario",
			);
			if (!presetName) return;

			const saveData = runtime.generatePresetData(presetName);
			const blob = new Blob([JSON.stringify(saveData)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${presetName.replace(/\s+/g, "_")}_preset.json`;
			a.click();
			URL.revokeObjectURL(url);
		});
	}

	function bindEditorLoadBtnClick() {
		runtime.editorLoadBtn.addEventListener("click", () => {
			runtime.initAudio();
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".json";
			input.onchange = (e) => {
				runtime.currentScenarioContext = null;
				runtime.setLoadingThematic(true);
				runtime.performPresetLoad(e.target.files[0], "EDITOR");
			};
			input.click();
		});
	}

	function bindEditorSaveMultiBtnClick() {
		if (runtime.editorSaveMultiBtn)
			runtime.editorSaveMultiBtn.addEventListener("click", async () => {
				if (runtime.selectedCountryIds.size === 0) {
					alert(
						"Ctrl+click countries on the map to select them, then use this button to export a ZIP.",
					);
					return;
				}
				const ids = Array.from(runtime.selectedCountryIds);
				const countries = ids
					.map((id) => runtime.countryMetadata[id - 1])
					.filter(Boolean);
				try {
					await runtime.downloadCountriesZip(
						countries,
						runtime.collectCountryCells(
							runtime.worldControlMap,
							runtime.gridWidth,
							ids,
						),
						runtime.CONFIG.GRID_RES,
						runtime.getJSZip,
						"selected_countries.zip",
					);
					runtime.statusText.innerText =
						"Exported " +
						ids.length +
						" countr" +
						(ids.length === 1 ? "y" : "ies") +
						" to selected_countries.zip";
				} catch (error) {
					console.error("ZIP export failed:", error);
					alert("Failed to generate ZIP. Check console for details.");
				}
			});
	}

	function bindEditorSaveAllZipBtnClick() {
		if (runtime.editorSaveAllZipBtn)
			runtime.editorSaveAllZipBtn.addEventListener("click", async () => {
				if (!runtime.countryMetadata || !runtime.worldControlMap) {
					alert("No map is loaded yet.");
					return;
				}
				const cellMap = runtime.collectCountryCells(
					runtime.worldControlMap,
					runtime.gridWidth,
					runtime.countryMetadata.filter(Boolean).map((meta) => meta.id),
				);
				const countries = runtime.countryMetadata.filter(
					(meta) => meta?.id && cellMap.get(meta.id)?.length,
				);
				if (!countries.length) {
					alert("No countries with territory to export.");
					return;
				}
				try {
					await runtime.downloadCountriesZip(
						countries,
						cellMap,
						runtime.CONFIG.GRID_RES,
						runtime.getJSZip,
						"all_countries.zip",
					);
					runtime.statusText.innerText = `Exported ${countries.length} countries to all_countries.zip`;
				} catch (error) {
					console.error("ZIP export (all countries) failed:", error);
					alert(
						"Failed to generate ZIP for all countries. Check console for details.",
					);
				}
			});
	}

	function bindEditorDownloadMapBtnClick() {
		document
			.getElementById("editor-download-map-btn")
			?.addEventListener("click", () => {
				if (!runtime.worldControlMap || !runtime.landMask) return;

				runtime.statusText.innerText = "GENERATING GLOBAL MAP EXPORT...";

				// GLOBAL EXPORT SYSTEM: Produces a 1:1 Plate Carree projection of the world grid.
				// This allows the resulting PNG to be re-imported as a Custom Satellite background
				// that aligns perfectly with the engine's geographical coordinate system.
				const canvas = document.createElement("canvas");
				canvas.width = runtime.gridWidth;
				canvas.height = runtime.gridHeight;
				const ctx = canvas.getContext("2d");
				const imgData = ctx.createImageData(
					runtime.gridWidth,
					runtime.gridHeight,
				);
				const data = imgData.data;

				for (let i = 0; i < runtime.worldControlMap.length; i++) {
					const lm = runtime.landMask[i];

					// Base palette for the Atlas editor
					let r = 5,
						g = 52,
						b = 72; // Deep Ocean Blue

					if (lm > 0) {
						// Country colors are excluded from the terrain layout export for a cleaner reference image
						r = 20;
						g = 38;
						b = 20; // Dark Military Green (Neutral Land)
					}

					// Project grid cell index to image pixel coordinates (Flipping Y axis)
					const gx = i % runtime.gridWidth;
					const gy = Math.floor(i / runtime.gridWidth);
					const ty = runtime.gridHeight - 1 - gy;
					const pixelIdx = (ty * runtime.gridWidth + gx) * 4;

					data[pixelIdx] = r;
					data[pixelIdx + 1] = g;
					data[pixelIdx + 2] = b;
					data[pixelIdx + 3] = 255;
				}

				ctx.putImageData(imgData, 0, 0);

				try {
					const link = document.createElement("a");
					const timestamp = Date.now();
					link.download = `modern_wars_world_layout_${timestamp}.png`;
					link.href = canvas.toDataURL("image/png");
					link.click();
					runtime.statusText.innerText = "GLOBAL MAP EXPORTED";
				} catch (e) {
					console.error("Export failed:", e);
					alert("SATELLITE ERROR: Could not generate export file.");
				}
			});
	}

	function bindImportScenarioSelectChange() {
		if (runtime.importScenarioSelect) {
			runtime.importScenarioSelect.addEventListener("change", async (e) => {
				const val = e.target.value;
				runtime.lastImportScenarioKey = val;
				runtime.importScenarioBuffer = null;
				runtime.selectedImportCountryId = null;
				if (runtime.importCountrySearch) {
					runtime.importCountrySearch.value = "";
					runtime.importCountrySearch.disabled = true;
				}
				if (runtime.importCountryCardList) {
					runtime.importCountryCardList.innerHTML = `
                <div style="font-size: 12px; color:#777; text-align:center; padding:10px;">
                    Loading…
                </div>
            `;
				}

				if (val === "file") {
					if (runtime.importScenarioFileInput) {
						runtime.importScenarioFileInput.style.display = "block";
						runtime.importScenarioFileInput.click();
					}
					return;
				} else {
					if (runtime.importScenarioFileInput)
						runtime.importScenarioFileInput.style.display = "none";
				}

				// Map built‑in keys to local preset JSONs
				const keyToUrl = {
					"builtin:modern_2022": "@2022 world invis.json",
					"builtin:ww2_1936": "assets/maps/WW2 Peru Update.json",
					"builtin:ww2_1942": "1942.json",
					"builtin:ww1_1914": "assets/maps/world_war_1__1914_.json",
					"builtin:coldwar_1974": "better_cold_war_preset.json",
					"builtin:coldwar_1948": "1948 (1).json",
					"builtin:france_states": "France_states_preset (2).json",
					"builtin:england_states": "England_states_preset.json",
				};
				const url = keyToUrl[val];
				if (!url) {
					runtime.importScenarioSelect.innerHTML =
						'<option value="">Unknown source selection</option>';
					runtime.importScenarioSelect.disabled = true;
					return;
				}
				await runtime.loadScenarioForCountryImportFromUrl(url);
			});
		}
	}

	function bindImportScenarioFileInputChange() {
		if (runtime.importScenarioFileInput) {
			runtime.importScenarioFileInput.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (!file) return;
				// Remember that we're using a file source so the select can reflect it
				runtime.lastImportScenarioKey = "file";
				await runtime.loadScenarioForCountryImportFromBlob(file);
			});
		}
	}

	function bindImportCountryConfirmBtnClick() {
		if (runtime.importCountryConfirmBtn) {
			runtime.importCountryConfirmBtn.addEventListener("click", () => {
				if (!runtime.importScenarioBuffer) {
					alert("Choose a source scenario first.");
					return;
				}
				const cid = runtime.selectedImportCountryId || 0;
				if (!cid) {
					alert("Choose a country to import.");
					return;
				}
				runtime.importSingleCountryFromScenario(
					runtime.importScenarioBuffer,
					cid,
				);
				runtime.importCountryModal.style.display = "none";
			});
		}
	}

	function bindEditorLoadZipBtnClick() {
		if (runtime.editorLoadZipBtn) {
			runtime.editorLoadZipBtn.addEventListener("click", () => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".zip";
				input.onchange = async (e) => {
					const file = e.target.files[0];
					if (!file) return;

					runtime.loadingStatus.innerText = "Importing countries from ZIP...";
					runtime.loadingOverlay.style.display = "flex";

					try {
						const JSZip = await runtime.getJSZip();
						const zip = await JSZip.loadAsync(file);
						const files = Object.values(zip.files).filter(
							(f) => !f.dir && f.name.toLowerCase().endsWith(".json"),
						);
						if (files.length === 0) {
							alert("ZIP file does not contain any .json country files.");
							runtime.loadingOverlay.style.display = "none";
							return;
						}

						// Find current max id so we can assign new, non‑conflicting IDs
						let maxId = runtime.countryMetadata.reduce(
							(m, c) => (c?.id ? Math.max(m, c.id) : m),
							0,
						);

						for (const zf of files) {
							try {
								const text = await zf.async("text");
								const data = JSON.parse(text);

								if (!data.metadata || !data.cells) continue;

								maxId += 1;
								const newId = maxId;

								const sourceRes = data.gridRes || runtime.CONFIG.GRID_RES;
								const meta = {
									id: newId,
									name: data.metadata.name || "Imported Nation",
									color: data.metadata.color || "rgba(150,150,150,0.5)",
									rgba: runtime.parseColorToRGBA(
										data.metadata.color || "rgba(150,150,150,0.5)",
									),
									isCustom: true,
									flagUrl: data.metadata.flagUrl,
									role: data.metadata.role || "OFFENSE",
									overlordId: data.metadata.overlordId,
									bounds: {
										minX: Infinity,
										maxX: -Infinity,
										minY: Infinity,
										maxY: -Infinity,
									},
								};

								if (meta.flagUrl) {
									meta.tempFlag = new Image();
									meta.tempFlag.crossOrigin = "anonymous";
									meta.tempFlag.src = meta.flagUrl;
								}

								runtime.countryMetadata[newId - 1] = meta;

								// Map cells to current grid
								const currentRes = runtime.CONFIG.GRID_RES;
								data.cells.forEach(([sx, sy]) => {
									if (sourceRes === currentRes) {
										const idx = sy * runtime.gridWidth + sx;
										if (
											idx < runtime.worldControlMap.length &&
											runtime.landMask[idx] > 0
										) {
											runtime.worldControlMap[idx] = newId;
											meta.bounds.minX = Math.min(meta.bounds.minX, sx);
											meta.bounds.maxX = Math.max(meta.bounds.maxX, sx);
											meta.bounds.minY = Math.min(meta.bounds.minY, sy);
											meta.bounds.maxY = Math.max(meta.bounds.maxY, sy);
										}
									} else {
										const baseLat = sy * sourceRes - 90;
										const baseLng = sx * sourceRes - 180;
										const tIdx = runtime.getGridIndex(
											baseLat + sourceRes / 2,
											baseLng + sourceRes / 2,
										);
										if (tIdx !== -1 && runtime.landMask[tIdx] > 0) {
											const tx = Math.floor(
												(baseLng + sourceRes / 2 + 180) / currentRes,
											);
											const ty = Math.floor(
												(baseLat + sourceRes / 2 + 90) / currentRes,
											);
											runtime.worldControlMap[tIdx] = newId;
											meta.bounds.minX = Math.min(meta.bounds.minX, tx);
											meta.bounds.maxX = Math.max(meta.bounds.maxX, tx);
											meta.bounds.minY = Math.min(meta.bounds.minY, ty);
											meta.bounds.maxY = Math.max(meta.bounds.maxY, ty);
										}
									}
								});
							} catch (innerErr) {
								console.warn(
									"Failed to import one country from ZIP:",
									innerErr,
								);
							}
						}

						runtime.recalculateAllBounds();
						runtime.loadingOverlay.style.display = "none";
						runtime.influenceLayer.render();
						runtime.statusText.innerText = "Imported countries from ZIP.";
					} catch (err) {
						console.error("ZIP import failed:", err);
						alert("Failed to import ZIP of countries.");
						runtime.loadingOverlay.style.display = "none";
					}
				};
				input.click();
			});
		}
	}

	function bindEditorShareBtnClick() {
		runtime.editorShareBtn.addEventListener("click", () => {
			if (runtime.countryMetadata.length < 2) {
				alert("Your map must have at least 2 nations to be playable.");
				return;
			}
			runtime.uploadNameInput.value = "";
			runtime.uploadDescInput.value = "";
			runtime.uploadDetailsModal.style.display = "flex";
		});
	}
	return {
		bindEditorUpdateBtnClick,
		bindShareCountryBtnClick,
		bindShareFlagBtnClick,
		bindCancelShareFlagBtnClick,
		bindConfirmShareFlagBtnClick,
		bindCancelShareCountryBtnClick,
		bindConfirmShareCountryBtnClick,
		bindEditorSaveBtnClick,
		bindEditorLoadBtnClick,
		bindEditorSaveMultiBtnClick,
		bindEditorSaveAllZipBtnClick,
		bindEditorDownloadMapBtnClick,
		bindImportScenarioSelectChange,
		bindImportScenarioFileInputChange,
		bindImportCountryConfirmBtnClick,
		bindEditorLoadZipBtnClick,
		bindEditorShareBtnClick,
	};
}
