import { CONFIG } from "./config.js";
import { showAlert } from "./dialogs.js";
import { beginLoadTrace } from "./load-profiler.js";
import mapRuntime from "./map-runtime.ts";
import { normalizeSavedCells } from "./saved-cells.js";
import { loadScenario } from "./scenario-codec.js";
import { generateScenarioSnapshot } from "./scenario-export.js";

/** Read live state only when a loader runs; module construction is cycle-safe. */
export function createScenarioLoader(context, loadSession) {
	function generatePresetData(name) {
		return generateScenarioSnapshot(name, {
			worldControlMap: context.worldControlMap,
			landMask: context.landMask,
			biomeMask: context.biomeMask,
			isCustomTerrain: context.isCustomTerrain,
			terrainMask: context.terrainMask,
			countryMetadata: context.countryMetadata,
			cities: context.cities,
			gridRes: CONFIG.GRID_RES,
			mapRes: document.getElementById("map-res-select").value,
			imagery: "atlas",
			disableCountryGradient: context.disableCountryGradient,
			customSatelliteUrl: context.customSatelliteUrl,
			worldWidthDeg: context.worldWidthDeg,
			worldHeightDeg: context.worldHeightDeg,
			missilesEnabled: context.missilesEnabled,
			gameTimeEnabled: context.gameTimeEnabled,
			gameTimeDate: context.gameTimeDate,
			timeSystemCheckbox: context.timeSystemCheckbox,
			timeYearInput: context.timeYearInput,
			timeMonthInput: context.timeMonthInput,
			timeDayInput: context.timeDayInput,
			referenceImageUrl: context.referenceImageUrl,
			refOpacity: context.refOpacity,
			referenceOverlay: context.referenceOverlay,
			refAboveTerrain: context.refAboveTerrain,
		});
	}

	async function performPresetLoad(
		fileOrBlob,
		targetMode = "EDITOR",
		options = {},
	) {
		if (!fileOrBlob) return;

		const MAX_PRESET_SIZE = 200 * 1024 * 1024;
		if (fileOrBlob.size && fileOrBlob.size > MAX_PRESET_SIZE) {
			showAlert("Scenario file is too large (max 200MB).");
			context.loadingOverlay.style.display = "none";
			return;
		}

		const loadGeneration = ++loadSession.generation;
		const isCompiledSource =
			typeof fileOrBlob === "string" ||
			(typeof URL !== "undefined" && fileOrBlob instanceof URL);
		let userChoice = { action: "skip" };
		const loadTrace = beginLoadTrace("scenario", {
			targetMode,
			source:
				typeof fileOrBlob === "string" ? fileOrBlob : fileOrBlob.name || "blob",
			gridResolution: Number(
				document.getElementById("grid-res-select")?.value || CONFIG.GRID_RES,
			),
		});

		try {
			// Reset Selector transition state if we're coming from there
			const selector = document.getElementById("menu-scenario-selector");
			if (selector) {
				selector.style.opacity = "1";
				selector.style.transform = "none";
			}

			context.loadingOverlay.style.display = "flex";
			context.loadingStatus.innerText = "Processing Archives...";

			// Ensure engine is initialized with the CURRENT grid density before we use worldControlMap.
			// This fixes cases where a preset was saved at a low grid density, but your settings are now higher.
			const gridSelect = document.getElementById("grid-res-select");
			const desiredGridRes = gridSelect
				? parseFloat(gridSelect.value)
				: CONFIG.GRID_RES;
			const selectedMapResolution =
				document.getElementById("map-res-select")?.value || "110m";
			const targetGridWidth = Math.ceil(360 / desiredGridRes);
			const targetGridHeight = Math.ceil(180 / desiredGridRes);
			let compiledMaps = null;
			let prederivedEarth = null;
			let data;

			if (isCompiledSource) {
				const scenarioPromise = loadScenario(fileOrBlob, {
					jsonFallbackUrl: options.jsonFallbackUrl,
					targetGridRes: desiredGridRes,
					targetWidth: targetGridWidth,
					targetHeight: targetGridHeight,
					onProgress(progress) {
						if (progress.phase === "download") {
							const ratio = Number(progress.ratio);
							if (Number.isFinite(ratio)) {
								const downloadPercent = Math.round(Math.min(1, ratio) * 100);
								context.loadingBar.style.width = `${5 + Math.round(downloadPercent * 0.4)}%`;
								context.loadingStatus.innerText = `Downloading Scenario: ${downloadPercent}%`;
							}
						} else if (progress.phase === "decompress") {
							context.loadingBar.style.width = "48%";
							context.loadingStatus.innerText = "Unpacking World Data...";
						} else if (progress.phase === "decode") {
							context.loadingBar.style.width = "55%";
							context.loadingStatus.innerText = "Building Strategic Grid...";
						}
					},
				});
				const earthPromise = options.prederivedEarth
					? context.loadScenarioEarthRaster({
							gridResolution: desiredGridRes,
							gridWidth: targetGridWidth,
							gridHeight: targetGridHeight,
							mapResolution: selectedMapResolution,
							onProgress(progress) {
								const ratio = progress.completed / Math.max(1, progress.total);
								context.loadingBar.style.width = `${55 + Math.round(ratio * 20)}%`;
								context.loadingStatus.innerText = `Scanning Landmasses: ${Math.round(ratio * 100)}%`;
							},
						})
					: Promise.resolve(null);
				[compiledMaps, prederivedEarth] = await Promise.all([
					scenarioPromise,
					earthPromise,
				]);
				data = compiledMaps.scenario;
				loadTrace.mark("scenario-decoded", {
					downloadBytes: compiledMaps.timing.downloadBytes,
					earthRasterBytes: prederivedEarth?.assetBytes || 0,
					format: compiledMaps.format,
					entries: compiledMaps.entryCount,
					downloadMs: compiledMaps.timing.downloadMs,
					decompressMs: compiledMaps.timing.decompressMs,
					decodeMs: compiledMaps.timing.decodeMs,
					prederivedEarth: Boolean(prederivedEarth),
				});
			} else {
				const text = await fileOrBlob.text();
				data = JSON.parse(text);
				loadTrace.mark("scenario-decoded", {
					format: "json",
					bytes: fileOrBlob.size || text.length,
					entries: data?.mapData?.length || 0,
				});
			}

			if (!data?.metadata || (!compiledMaps && !data.mapData)) {
				throw new Error("Invalid preset structure");
			}

			if (!context.worldControlMap || CONFIG.GRID_RES !== desiredGridRes) {
				// Update engine config to the desired grid resolution and reallocate all grid arrays.
				CONFIG.GRID_RES = desiredGridRes;
				context.initializeEngine(false);
			} else {
				// Sync settings state (mountains/provinces) even if resolution hasn't changed
				context.initializeEngine(false);
			}
			loadTrace.mark("engine-ready", {
				cells: context.worldControlMap?.length || 0,
			});

			// Always clear previous conflict setup / selection so old picks don't bleed into new scenarios
			context.resetConflictSetupState();

			// Older imagery fields remain readable; all scenarios now use Atlas.
			if (data.disableCountryGradient !== undefined) {
				context.setDisableCountryGradient(data.disableCountryGradient);
				if (context.disableCountryGradientCheckbox) {
					context.disableCountryGradientCheckbox.checked =
						context.disableCountryGradient;
				}
			}

			// World size & missile settings restoration
			if (
				typeof data.worldWidthDeg === "number" &&
				typeof data.worldHeightDeg === "number"
			) {
				context.applyWorldBounds(
					data.worldWidthDeg,
					data.worldHeightDeg,
					false,
				);
			} else {
				// Default to full world if not specified
				context.applyWorldBounds(360, 180, false);
			}
			if (typeof data.missilesEnabled === "boolean") {
				context.setMissilesEnabled(data.missilesEnabled);
			} else {
				context.setMissilesEnabled(true);
			}
			if (context.mapSettingsMissilesCheckbox) {
				context.mapSettingsMissilesCheckbox.checked = !!context.missilesEnabled;
			}
			if (context.disableBombsCheckbox) {
				context.disableBombsCheckbox.checked = !context.missilesEnabled;
			}
			context.setBombsDisabled(
				context.disableBombsCheckbox?.checked || !context.missilesEnabled,
			);
			if (context.timeSystemCheckbox) {
				context.timeSystemCheckbox.checked = data.timeEnabled === true;
			}
			if (data.startDate) {
				if (context.timeYearInput)
					context.timeYearInput.value = String(data.startDate.year || 1936);
				if (context.timeMonthInput)
					context.timeMonthInput.value = String(data.startDate.month || 1);
				if (context.timeDayInput)
					context.timeDayInput.value = String(data.startDate.day || 1);
			}

			// Restore Custom Overlays
			if (data.customSatelliteUrl) {
				context.setCustomSatelliteUrl(data.customSatelliteUrl);
				context.setCustomSatelliteImg(new Image());
				context.customSatelliteImg.crossOrigin = "anonymous";
				context.customSatelliteImg.src = context.customSatelliteUrl;
			} else {
				context.setCustomSatelliteUrl(null);
				context.setCustomSatelliteImg(null);
			}

			// Reference image metadata is always loaded, but the overlay is only drawn in editor modes.
			context.setReferenceImageUrl(data.referenceImageUrl || null);
			context.setRefOpacity(
				typeof data.refImageOpacity === "number" ? data.refImageOpacity : 0.5,
			);
			context.setRefScale(
				typeof data.refImageScale === "number" ? data.refImageScale : 1.0,
			);
			context.setRefAboveTerrain(!!data.refDrawAbove);

			if (context.referenceOverlay) {
				context.map.removeLayer(context.referenceOverlay);
				context.setReferenceOverlay(null);
			}

			if (context.referenceImageUrl && targetMode === "EDITOR") {
				let bounds;
				if (data.refImageBounds?.nw && data.refImageBounds.se) {
					// Use saved bounds to preserve proportions/position
					bounds = [
						[data.refImageBounds.nw.lat, data.refImageBounds.nw.lng],
						[data.refImageBounds.se.lat, data.refImageBounds.se.lng],
					];
				} else {
					// Fallback: center on map using approximate aspect
					const center = context.map.getCenter();
					const h = 20 * context.refScale;
					const w = h * 1.6;
					bounds = [
						[center.lat - h, center.lng - w],
						[center.lat + h, center.lng + w],
					];
				}
				context.setReferenceOverlay(
					mapRuntime
						.imageOverlay(context.referenceImageUrl, bounds, {
							opacity: context.refOpacity,
							interactive: false,
							pane: "refImagePane",
						})
						.addTo(context.map),
				);
				// Rebuild handles in editor
				context.updateRefHandles();
			} else {
				context.setReferenceOverlay(null);
			}

			// Built-in compiled scenarios already contain their control grid. Pair them
			// with selected-resolution land and canonical 110m de-jure IDs without
			// downloading or scanning Natural Earth GeoJSON.
			if (compiledMaps) {
				context.setRawGeoJsonData(prederivedEarth?.rawData || null);
				context.worldControlMap.fill(0);
				context.occupationMap.fill(0);
				context.resetSideInfluenceMaps();
				context.primaryOccupierMap.fill(0);
				context.provinceMap.fill(0);
				context.biomeMask.fill(0);
				if (prederivedEarth && !data.isCustomTerrain) {
					if (
						prederivedEarth.landMask.length !== context.landMask.length ||
						prederivedEarth.deJureMap.length !== context.deJureMap.length
					) {
						throw new Error(
							"Prederived Earth raster dimensions do not match grid",
						);
					}
					context.landMask.set(prederivedEarth.landMask);
					context.deJureMap.set(prederivedEarth.deJureMap);
				} else {
					context.landMask.set(compiledMaps.land);
					context.deJureMap.set(compiledMaps.deJure);
				}
			} else if (!context.rawGeoJsonData && !data.isCustomTerrain) {
				const mapRes = document.getElementById("map-res-select").value;
				const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
				await context.loadCountries(geoUrl, true, true, loadGeneration);
			} else if (!data.isCustomTerrain) {
				// If we have GeoJSON, we still need to reset the masks but don't need to re-download
				context.worldControlMap.fill(0);
				context.occupationMap.fill(0);
				context.resetSideInfluenceMaps();
				context.primaryOccupierMap.fill(0);
				context.landMask.fill(0);
				context.provinceMap.fill(0);
				context.deJureMap.fill(0);
				// Land mask is usually preserved from first boot load but ensure it is ready
			}
			loadTrace.mark("geography-ready");

			// Check for empty metadata and prompt for procedural generation
			const metaList = data.metadata || [];
			if (metaList.length === 0 && targetMode !== "EDITOR") {
				context.loadingOverlay.style.display = "none";
				context.noNationsModal.style.display = "flex";
				userChoice = await new Promise((resolve) => {
					context.confirmRandomGenBtn.onclick = () => {
						const count =
							parseInt(context.randomNationsCountInput.value, 10) || 15;
						resolve({ action: "generate", count });
					};
					context.skipRandomGenBtn.onclick = () => {
						resolve({ action: "skip" });
					};
				});
				context.noNationsModal.style.display = "none";
				context.loadingOverlay.style.display = "flex";
			}

			// Restore metadata and reconstruct RGBA values for rendering
			const currentLang = context.getCookie("mw_lang") || "en";
			const deferredFlagLoads = [];

			// Reset and rebuild metadata
			context.setCountryMetadata([]);
			metaList.forEach((m) => {
				if (!m?.id) return;

				// Apply system language translation to country names in preset
				const translatedName = context.getTranslation(
					m.name,
					currentLang,
					"NATIONS",
				);
				if (translatedName !== m.name) {
					m.displayName = translatedName;
				}

				const normalizedTerritory = normalizeSavedCells(
					m,
					data.gridRes || CONFIG.GRID_RES,
					CONFIG.GRID_RES,
					context.gridWidth,
					context.getGridIndex,
				);

				const meta = {
					...m,
					...normalizedTerritory,
					rgba: context.parseColorToRGBA(m.color || "rgba(150, 150, 150, 0.5)"),
					bounds: m.bounds || {
						minX: Infinity,
						maxX: -Infinity,
						minY: Infinity,
						maxY: -Infinity,
					},
					buffState: m.buffState || "none",
					hiddenBuffState: m.hiddenBuffState || "none",
					allies: Array.isArray(m.allies) ? m.allies : [],
				};

				// Load primary national flag image
				if (meta.flagUrl) {
					meta.tempFlag = new Image();
					meta.tempFlag.crossOrigin = "anonymous";
					deferredFlagLoads.push(() => {
						meta.tempFlag.src = meta.flagUrl;
					});
				}

				// Load alliance flag image (used in Alliance View for both regions and units)
				if (meta.allianceFlagUrl) {
					meta.allianceFlagTempFlag = new Image();
					meta.allianceFlagTempFlag.crossOrigin = "anonymous";
					meta.allianceFlagTempFlag.onload = () => {
						if (context.influenceLayer) context.influenceLayer.render();
					};
					deferredFlagLoads.push(() => {
						meta.allianceFlagTempFlag.src = meta.allianceFlagUrl;
					});
				}

				context.countryMetadata[m.id - 1] = meta;
			});
			loadTrace.mark("metadata-ready", {
				countries: context.countryMetadata.filter(Boolean).length,
			});

			context.worldControlMap.fill(0);
			context.occupationMap.fill(0);
			context.resetSideInfluenceMaps();
			context.primaryOccupierMap.fill(0);
			context.biomeMask.fill(0);

			// Ensure custom terrain state is preserved
			context.setIsCustomTerrain(!!data.isCustomTerrain);
			if (context.isCustomTerrain) {
				context.landMask.fill(0);
			}

			// Compiled scenarios arrive as target-resolution typed arrays from the worker.
			// Legacy/community JSON keeps the existing main-thread remapping fallback.
			const sourceRes = data.gridRes || CONFIG.GRID_RES;
			const targetRes = CONFIG.GRID_RES;
			const sourceGridWidth = Math.ceil(360 / sourceRes);
			const mapData = data.mapData || [];
			const totalEntries = compiledMaps
				? compiledMaps.entryCount
				: mapData.length;

			if (compiledMaps) {
				for (const [name, source, target] of [
					["control", compiledMaps.worldControl, context.worldControlMap],
					["biome", compiledMaps.biome, context.biomeMask],
					["province", compiledMaps.province, context.provinceMap],
				]) {
					if (source.length !== target.length) {
						throw new Error(
							`Compiled ${name} grid dimensions do not match engine`,
						);
					}
					target.set(source);
				}
				if (data.isCustomTerrain || !prederivedEarth) {
					if (compiledMaps.land.length !== context.landMask.length) {
						throw new Error(
							"Compiled land grid dimensions do not match engine",
						);
					}
					context.landMask.set(compiledMaps.land);
				}
			} else if (sourceRes === targetRes) {
				// Optimized bulk assignment
				for (let i = 0; i < totalEntries; i++) {
					const entry = mapData[i];
					const idx = entry[0];
					const val = entry[1];
					const bio = entry[2] || 0;

					if (idx < context.worldControlMap.length) {
						context.worldControlMap[idx] = val;
						context.biomeMask[idx] = bio;
						// Any index present in the mapData array is land
						context.landMask[idx] = 1;
					}
				}
			} else {
				console.log(
					`Satellite Redrawing: Converting scenario grid (${sourceRes} -> ${targetRes})`,
				);
				// Pre-calculate loop limits and constants for resolution conversion

				for (let i = 0; i < totalEntries; i++) {
					const entry = mapData[i];
					const idx = entry[0];
					const val = entry[1];

					const sy = Math.floor(idx / sourceGridWidth);
					const sx = idx % sourceGridWidth;
					const baseLat = sy * sourceRes - 90;
					const baseLng = sx * sourceRes - 180;

					// Robust conversion: Map all target cells covered by the source cell
					const xStart = Math.floor((baseLng + 180) / targetRes);
					const xEnd = Math.floor(
						(baseLng + sourceRes + 180 - 0.0001) / targetRes,
					);
					const yStart = Math.floor((baseLat + 90) / targetRes);
					const yEnd = Math.floor(
						(baseLat + sourceRes + 90 - 0.0001) / targetRes,
					);

					for (let ty = yStart; ty <= yEnd; ty++) {
						if (ty < 0 || ty >= context.gridHeight) continue;
						const rowOffset = ty * context.gridWidth;
						for (let tx = xStart; tx <= xEnd; tx++) {
							if (tx < 0 || tx >= context.gridWidth) continue;
							const tIdx = rowOffset + tx;
							if (tIdx < context.worldControlMap.length) {
								context.worldControlMap[tIdx] = val;
								context.landMask[tIdx] = 1;
							}
						}
					}
				}
			}
			loadTrace.mark("control-map-ready", { entries: totalEntries });

			// Restore mountain data
			context.terrainMask.fill(0);
			if (data.mountainData) {
				const mData = data.mountainData;
				for (let i = 0; i < mData.length; i++) {
					const [idx, intensity] = mData[i];
					if (idx < context.terrainMask.length) {
						context.terrainMask[idx] = intensity;
					}
				}
			} else if (!data.isCustomTerrain && context.mountainsEnabled) {
				// Earth scenario without baked mountains: trigger dynamic GeoJSON terrain scan
				const resToUse =
					data.mapRes ||
					document.getElementById("map-res-select").value ||
					"110m";
				await context.loadTerrain(resToUse);
			}
			loadTrace.mark("terrain-ready");

			// Compiled loads already received an exact province grid from the worker.
			// Legacy loads retain the procedural pass on the main thread.
			if (compiledMaps) context.notifyPoliticalMapLoaded();
			else context.generateProvinces();
			loadTrace.mark("provinces-ready");

			// Reset adjacency cache whenever map changes
			context.setAdjacencyCache(null);

			// Load cities from preset if present, otherwise fall back to global dataset
			if (Array.isArray(data.cities)) {
				context.setCities(
					data.cities.map((c, idx) => ({
						id: c.id || idx + 1,
						name: c.name,
						lat: c.lat,
						lng: c.lng,
						pop: c.pop || 0,
						isCapital: !!c.isCapital,
						ownerId: c.ownerId || null,
						isCustom: !!c.isCustom,
					})),
				);
			} else {
				await context.loadCities();
			}
			loadTrace.mark("cities-ready", { cities: context.cities.length });

			context.setGameMode(targetMode);
			context.mainMenu.style.display = "none";
			context.mapUi.style.display = "flex";

			if (targetMode === "CONQUEST") {
				context.setGameState("SELECTING_P1");
				context.statusText.innerText = context.currentScenarioContext
					? `PLAYING: ${context.currentScenarioContext.name}`
					: context.getTranslation("SELECT_P1");
				context.setupPanel.style.display = "block";
				context.editorToolbox.style.display = "none";
				context.godModeBtn.style.display = "block";
				context.resetBtn.style.display = "block";
				context.statsPanel.style.display = "none";
			} else {
				context.setGameState("EDITOR_ACTIVE");
				context.statusText.innerText = context.currentScenarioContext
					? `REMIXING: ${context.currentScenarioContext.name}`
					: "Map Editor (Alpha)";
				context.setupPanel.style.display = "none";
				context.editorToolbox.style.display = "flex";
				context.statsPanel.style.display = "none";
			}
			context.updateRestartVisibility();

			if (context.activeScenarioId) {
				context.editorUpdateBtn.style.display = "block";
			} else {
				context.editorUpdateBtn.style.display = "none";
			}

			// Capture Instant Quick Restart Snapshots immediately upon scenario load
			context.setInitialWorldControlMapSnapshot(
				compiledMaps?.worldControl || new Uint16Array(context.worldControlMap),
			);
			context.setInitialDeJureMapSnapshot(
				prederivedEarth?.deJureMap ||
					compiledMaps?.deJure ||
					new Uint16Array(context.deJureMap),
			);
			context.setInitialProvinceMapSnapshot(
				compiledMaps?.province || new Int32Array(context.provinceMap),
			);
			context.setInitialLandMaskSnapshot(
				prederivedEarth?.landMask ||
					compiledMaps?.land ||
					new Uint8Array(context.landMask),
			);
			context.setInitialCountryMetadataSnapshot(
				context.deepClone(context.countryMetadata),
			);
			context.setInitialCitiesSnapshot(context.deepClone(context.cities));

			// Compute urban population per country for army size estimation
			context.computeCountryUrbanPop();

			// If the user chose to generate random nations earlier, trigger it now after
			// the grid is ready. There is no artificial confirmation delay: the overlay
			// closes as soon as the actual initialization work is complete.
			if (metaList.length === 0 && userChoice.action === "generate") {
				await context.spawnRandomNationsAcrossMap(userChoice.count);
			}

			context.recalculateAllBounds();
			context.loadingOverlay.style.display = "none";
			context.mapUi.style.display = "flex";
			context.influenceLayer.render();
			context.updateRestartVisibility();

			context.scheduleIdleLoad(() => {
				if (loadGeneration !== loadSession.generation) return;
				for (const startFlagLoad of deferredFlagLoads) startFlagLoad();
			});
			return loadTrace.finish({
				cells: context.worldControlMap.length,
				countries: context.countryMetadata.filter(Boolean).length,
				cities: context.cities.length,
			});
		} catch (err) {
			loadTrace.fail(err);
			console.error("Satellite Load Error:", err);
			context.loadingOverlay.style.display = "none";
			if (isCompiledSource) throw err;
			showAlert(
				`Error loading preset: ${err.message || "File may be corrupted"}`,
			);
		}
	}

	async function loadScenarioForCountryImportFromBlob(blob) {
		try {
			const text = await blob.text();
			const data = JSON.parse(text);
			if (!data?.metadata || !data.mapData) {
				throw new Error("Invalid preset structure");
			}
			context.setImportScenarioBuffer({
				metadata: data.metadata,
				mapData: data.mapData,
				gridRes: data.gridRes || CONFIG.GRID_RES,
			});
			context.populateImportCountrySelect();
			// Restore the last selected scenario key in the dropdown if we have one
			if (context.importScenarioSelect && context.lastImportScenarioKey) {
				context.importScenarioSelect.value = context.lastImportScenarioKey;
			}
		} catch (e) {
			console.error("Import scenario load failed:", e);
			showAlert(
				"Could not read that scenario file. Make sure it is a preset exported from this engine.",
			);
			context.setImportScenarioBuffer(null);
			context.setSelectedImportCountryId(null);
			if (context.importCountrySearch) {
				context.importCountrySearch.value = "";
				context.importCountrySearch.disabled = true;
			}
			if (context.importCountryCardList) {
				context.importCountryCardList.innerHTML = `
                <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                    Failed to load scenario
                </div>
            `;
			}
		}
	}

	async function loadScenarioForCountryImportFromUrl(url) {
		try {
			const resp = await fetch(url);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const blob = await resp.blob();
			await loadScenarioForCountryImportFromBlob(blob);
		} catch (e) {
			console.error("Import built‑in scenario load failed:", e);
			showAlert("Failed to load built‑in scenario for import.");
		}
	}

	function importSingleCountryFromScenario(source, sourceCountryId) {
		if (!context.worldControlMap || !context.countryMetadata) return;

		const metaList = source.metadata || [];
		const sourceMeta = metaList.find((m) => m && m.id === sourceCountryId);
		if (!sourceMeta) {
			showAlert("Country not found in source scenario.");
			return;
		}

		// Allocate a fresh ID in the current scenario
		const maxId = context.countryMetadata.reduce(
			(max, m) => (m ? Math.max(max, m.id) : max),
			0,
		);
		const newId = maxId + 1;

		// Build new metadata entry
		const newMeta = {
			id: newId,
			name: sourceMeta.name || `Imported ${sourceCountryId}`,
			color: sourceMeta.color || "rgba(150,150,150,0.5)",
			rgba: context.parseColorToRGBA(
				sourceMeta.color || "rgba(150,150,150,0.5)",
			),
			isCustom: true,
			flagUrl: sourceMeta.flagUrl || null,
			role: sourceMeta.role || "OFFENSE",
			overlordId: sourceMeta.overlordId || null,
			bounds: {
				minX: Infinity,
				maxX: -Infinity,
				minY: Infinity,
				maxY: -Infinity,
			},
		};
		if (newMeta.flagUrl) {
			newMeta.tempFlag = new Image();
			newMeta.tempFlag.crossOrigin = "anonymous";
			newMeta.tempFlag.onload = () => context.influenceLayer?.render();
			newMeta.tempFlag.src = newMeta.flagUrl;
		}
		context.countryMetadata[newId - 1] = newMeta;

		const sourceRes = source.gridRes || CONFIG.GRID_RES;
		const targetRes = CONFIG.GRID_RES;
		const sourceGridWidth = Math.ceil(360 / sourceRes);

		const mapData = source.mapData || [];
		let paintedAny = false;

		// Map each source cell belonging to the selected country into our grid
		for (let i = 0; i < mapData.length; i++) {
			const [idx, val] = mapData[i];
			if (val !== sourceCountryId) continue;

			const sy = Math.floor(idx / sourceGridWidth);
			const sx = idx % sourceGridWidth;
			const baseLat = sy * sourceRes - 90;
			const baseLng = sx * sourceRes - 180;

			if (sourceRes === targetRes) {
				const gx = sx;
				const gy = sy;
				const tIdx = gy * context.gridWidth + gx;
				if (
					tIdx >= 0 &&
					tIdx < context.worldControlMap.length &&
					context.landMask[tIdx] > 0
				) {
					context.worldControlMap[tIdx] = newId;
					context.deJureMap[tIdx] = newId;
					context.provinceMap[tIdx] = context.getProvinceId(gx, gy, newId);
					newMeta.bounds.minX = Math.min(newMeta.bounds.minX, gx);
					newMeta.bounds.maxX = Math.max(newMeta.bounds.maxX, gx);
					newMeta.bounds.minY = Math.min(newMeta.bounds.minY, gy);
					newMeta.bounds.maxY = Math.max(newMeta.bounds.maxY, gy);
					paintedAny = true;
				}
			} else {
				// Convert source cell area into one or more target cells
				const xStart = Math.floor((baseLng + 180) / targetRes);
				const xEnd = Math.floor(
					(baseLng + sourceRes + 180 - 0.0001) / targetRes,
				);
				const yStart = Math.floor((baseLat + 90) / targetRes);
				const yEnd = Math.floor(
					(baseLat + sourceRes + 90 - 0.0001) / targetRes,
				);
				for (let gy = yStart; gy <= yEnd; gy++) {
					if (gy < 0 || gy >= context.gridHeight) continue;
					const rowOffset = gy * context.gridWidth;
					for (let gx = xStart; gx <= xEnd; gx++) {
						if (gx < 0 || gx >= context.gridWidth) continue;
						const tIdx = rowOffset + gx;
						context.worldControlMap[tIdx] = newId;
						context.deJureMap[tIdx] = newId;
						context.provinceMap[tIdx] = context.getProvinceId(gx, gy, newId);
						context.landMask[tIdx] = context.landMask[tIdx] || 1;
						newMeta.bounds.minX = Math.min(newMeta.bounds.minX, gx);
						newMeta.bounds.maxX = Math.max(newMeta.bounds.maxX, gx);
						newMeta.bounds.minY = Math.min(newMeta.bounds.minY, gy);
						newMeta.bounds.maxY = Math.max(newMeta.bounds.maxY, gy);
						paintedAny = true;
					}
				}
			}
		}

		if (!paintedAny) {
			showAlert(
				"No territory for that country was found in the source scenario at this resolution.",
			);
			return;
		}

		context.recalculateAllBounds();
		context.influenceLayer.render();
		context.statusText.innerText = `Imported ${newMeta.name} from scenario into this map.`;
	}
	return {
		generatePresetData,
		performPresetLoad,
		loadScenarioForCountryImportFromBlob,
		loadScenarioForCountryImportFromUrl,
		importSingleCountryFromScenario,
	};
}
