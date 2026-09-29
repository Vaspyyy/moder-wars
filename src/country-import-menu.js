// Dependencies are supplied by the application; this module does not import it.
export function createCountryImportMenu(runtime) {
	function loadCountryFromPC() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			runtime.loadingStatus.innerText = "Loading Country Data...";
			runtime.loadingOverlay.style.display = "flex";

			try {
				const text = await file.text();
				const data = JSON.parse(text);

				if (!data.metadata || !data.cells) {
					throw new Error("Invalid country file structure");
				}

				const currentRes = runtime.CONFIG.GRID_RES;
				const sourceRes = data.gridRes || currentRes;

				// Find next available country ID
				const maxId = runtime.countryMetadata.reduce(
					(max, m) => (m ? Math.max(max, m.id) : max),
					0,
				);
				const newId = maxId + 1;

				// Create metadata entry
				const meta = {
					id: newId,
					name: data.metadata.name || "Imported Nation",
					color: data.metadata.color || "rgba(150, 150, 150, 0.5)",
					rgba: runtime.parseColorToRGBA(
						data.metadata.color || "rgba(150, 150, 150, 0.5)",
					),
					isCustom: true,
					flagUrl: data.metadata.flagUrl || null,
					role: data.metadata.role || "OFFENSE",
					overlordId: data.metadata.overlordId || null,
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

				// Place cells on map with resolution conversion if needed
				for (const [sx, sy] of data.cells) {
					if (sourceRes === currentRes) {
						const idx = sy * runtime.gridWidth + sx;
						if (idx < runtime.worldControlMap.length) {
							runtime.worldControlMap[idx] = newId;
							runtime.provinceMap[idx] = runtime.getProvinceId(sx, sy, newId);
							if (runtime.landMask[idx] === 0) runtime.landMask[idx] = 1;

							// Update bounds
							meta.bounds.minX = Math.min(meta.bounds.minX, sx);
							meta.bounds.maxX = Math.max(meta.bounds.maxX, sx);
							meta.bounds.minY = Math.min(meta.bounds.minY, sy);
							meta.bounds.maxY = Math.max(meta.bounds.maxY, sy);
						}
					} else {
						// Convert coordinates
						const baseLat = sy * sourceRes - 90;
						const baseLng = sx * sourceRes - 180;

						if (sourceRes > currentRes) {
							for (
								let lat = baseLat;
								lat < baseLat + sourceRes;
								lat += currentRes
							) {
								for (
									let lng = baseLng;
									lng < baseLng + sourceRes;
									lng += currentRes
								) {
									const tIdx = runtime.getGridIndex(
										lat + currentRes / 2,
										lng + currentRes / 2,
									);
									if (tIdx !== -1) {
										runtime.worldControlMap[tIdx] = newId;
										runtime.provinceMap[tIdx] = runtime.getProvinceId(
											Math.floor((lng + currentRes / 2 + 180) / currentRes),
											Math.floor((lat + currentRes / 2 + 90) / currentRes),
											newId,
										);
										if (runtime.landMask[tIdx] === 0)
											runtime.landMask[tIdx] = 1;
									}
								}
							}
						} else {
							const tIdx = runtime.getGridIndex(
								baseLat + sourceRes / 2,
								baseLng + sourceRes / 2,
							);
							if (tIdx !== -1) {
								runtime.worldControlMap[tIdx] = newId;
								const tx = Math.floor(
									(baseLng + sourceRes / 2 + 180) / currentRes,
								);
								const ty = Math.floor(
									(baseLat + sourceRes / 2 + 90) / currentRes,
								);
								runtime.provinceMap[tIdx] = runtime.getProvinceId(
									tx,
									ty,
									newId,
								);
								if (runtime.landMask[tIdx] === 0) runtime.landMask[tIdx] = 1;

								// Update bounds
								meta.bounds.minX = Math.min(meta.bounds.minX, tx);
								meta.bounds.maxX = Math.max(meta.bounds.maxX, tx);
								meta.bounds.minY = Math.min(meta.bounds.minY, ty);
								meta.bounds.maxY = Math.max(meta.bounds.maxY, ty);
							}
						}
					}
				}

				runtime.loadingOverlay.style.display = "none";

				// Check if bounds were updated, if not set reasonable defaults
				if (meta.bounds.minX === Infinity) {
					meta.bounds = {
						minX: 0,
						maxX: runtime.gridWidth - 1,
						minY: 0,
						maxY: runtime.gridHeight - 1,
					};
				}

				runtime.openInspector(newId);
				runtime.statusText.innerText = `IMPORTED: ${meta.name} from local file`;
				runtime.influenceLayer.render();
			} catch (err) {
				console.error("Country import error:", err);
				alert(`Failed to import country: ${err.message}`);
				runtime.loadingOverlay.style.display = "none";
			}
		};
		input.click();
	}

	function populateImportCountrySelect() {
		if (
			!runtime.importScenarioBuffer ||
			!runtime.importCountryCardList ||
			!runtime.importCountrySearch
		)
			return;
		const metaList = runtime.importScenarioBuffer.metadata || [];
		if (!metaList.length) {
			runtime.importCountryCardList.innerHTML = `
            <div style="font-size: 12px; color:#777; text-align:center; padding:10px;">
                No countries found in scenario
            </div>
        `;
			runtime.importCountrySearch.disabled = true;
			runtime.selectedImportCountryId = null;
			runtime.importScenarioCountriesCache = [];
			return;
		}

		// Count tiles per country id in the source scenario for a useful size hint
		const mapData = runtime.importScenarioBuffer.mapData || [];
		const tileCounts = new Map();
		mapData.forEach(([_idx, val]) => {
			if (!val) return;
			tileCounts.set(val, (tileCounts.get(val) || 0) + 1);
		});

		const sortedMeta = metaList
			.filter((m) => m?.id)
			.map((m) => {
				const tiles = tileCounts.get(m.id) || 0;
				// Try to find a flagUrl from metadata if present
				const flagUrl = m.flagUrl || null;
				return {
					id: m.id,
					name: m.name || `Country ${m.id}`,
					tiles,
					flagUrl,
				};
			})
			.filter((m) => m.tiles > 0)
			.sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name));

		if (!sortedMeta.length) {
			runtime.importCountryCardList.innerHTML = `
            <div style="font-size: 12px; color:#777; text-align:center; padding:10px;">
                No countries with territory found
            </div>
        `;
			runtime.importCountrySearch.disabled = true;
			runtime.selectedImportCountryId = null;
			runtime.importScenarioCountriesCache = [];
			return;
		}

		runtime.importScenarioCountriesCache = sortedMeta;
		runtime.selectedImportCountryId = null;
		runtime.importCountrySearch.disabled = false;
		runtime.importCountrySearch.value = "";
		runtime.renderImportCountryCards("");
	}

	function openImportCountryModal() {
		if (!runtime.importCountryModal) return;
		if (!(runtime.gameMode === "EDITOR" || runtime.godModeActive)) {
			alert(
				"You can only import from scenario while in the editor or God Mode.",
			);
			return;
		}

		// If we already have a loaded source scenario, reuse it and its country list
		if (
			runtime.importScenarioBuffer &&
			runtime.importScenarioCountriesCache.length > 0
		) {
			runtime.importCountryModal.style.display = "flex";
			if (runtime.importScenarioSelect && runtime.lastImportScenarioKey) {
				runtime.importScenarioSelect.value = runtime.lastImportScenarioKey;
			}
			if (runtime.importScenarioFileInput) {
				runtime.importScenarioFileInput.style.display = "none";
			}
			if (runtime.importCountrySearch) {
				// Keep any existing search text; just ensure the field is enabled
				runtime.importCountrySearch.disabled = false;
			}
			// Re-render cards from cache (filtered by current search if any)
			runtime.renderImportCountryCards(
				runtime.importCountrySearch ? runtime.importCountrySearch.value : "",
			);
			return;
		}

		// Fresh open with no cached source scenario
		runtime.importScenarioBuffer = null;
		runtime.selectedImportCountryId = null;
		runtime.importScenarioCountriesCache = [];
		if (runtime.importScenarioSelect) runtime.importScenarioSelect.value = "";
		if (runtime.importScenarioFileInput) {
			runtime.importScenarioFileInput.value = "";
			runtime.importScenarioFileInput.style.display = "none";
		}
		if (runtime.importCountrySearch) {
			runtime.importCountrySearch.value = "";
			runtime.importCountrySearch.disabled = true;
		}
		if (runtime.importCountryCardList) {
			runtime.importCountryCardList.innerHTML = `
            <div style="font-size: 12px; color:#777; text-align:center; padding:10px;">
                Choose a source scenario first
            </div>
        `;
		}
		runtime.importCountryModal.style.display = "flex";
	}
	return {
		populateImportCountrySelect,
		openImportCountryModal,
		loadCountryFromPC,
	};
}
