import L from "leaflet";
import { CONFIG } from "./config.js";
import {
	_geoCacheGet,
	_geoCachePut,
	fetchJSONWithCache,
	getDerivedRaster,
	PARSED_GEO_CACHE_REVISION,
	putDerivedRaster,
} from "./geo.js";
import { rasterizeGeoFeaturesInWorker } from "./geo-raster.js";
import {
	combineScenarioEarthRasters,
	loadPrederivedEarthRaster,
} from "./geo-raster-assets.js";
import { beginLoadTrace } from "./load-profiler.js";

/** Read live state only when a loader runs; module construction is cycle-safe. */
export function createGeographyLoader(context, loadSession) {
	function getFeatureBounds(feature) {
		const geom = feature?.geometry?.coordinates;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		if (Array.isArray(geom)) {
			const stack = [...geom];
			while (stack.length) {
				const item = stack.pop();
				if (typeof item[0] === "number" && typeof item[1] === "number") {
					const lng = item[0],
						lat = item[1];
					if (lng < minX) minX = lng;
					if (lng > maxX) maxX = lng;
					if (lat < minY) minY = lat;
					if (lat > maxY) maxY = lat;
				} else if (Array.isArray(item)) {
					for (let k = 0; k < item.length; k++) stack.push(item[k]);
				}
			}
		}
		if (minX === Infinity) {
			return L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
		}
		return L.latLngBounds(L.latLng(minY, minX), L.latLng(maxY, maxX));
	}

	async function updateLandMask(features, maskValue = 1, isBlank = false) {
		if (!isBlank) {
			context.setCountryMetadata(
				features.map((f, i) => {
					const color = context.getCountryColor(f);
					const name =
						f.properties.NAME ||
						f.properties.name ||
						f.properties.admin ||
						f.properties.NAME_LONG ||
						"Unknown";

					const getCode = (feat) => {
						if (!feat?.properties) return null;
						const p = feat.properties;
						const code =
							p.ISO_A2 ||
							p.iso_a2 ||
							p.ISO_A2_EH ||
							p.iso_a2_eh ||
							p.ADDR_A2 ||
							null;
						if (code === "-99") return null;
						return code;
					};

					const code = context.findCodeByName(name) || getCode(f);
					return {
						id: i + 1,
						name: name,
						feature: f,
						color: color,
						rgba: context.parseColorToRGBA(color),
						flagUrl: context.getFlagUrl(code, name),
						bounds: {
							minX: Infinity,
							maxX: -Infinity,
							minY: Infinity,
							maxY: -Infinity,
						},
						buffState: "none",
						hiddenBuffState: "none",
					};
				}),
			);
		} else {
			context.setCountryMetadata([]);
		}

		const total = features.length;
		// Process features in small async chunks so the main thread can breathe and the UI stays responsive.
		const CHUNK = 12; // number of features per micro-batch; tuned for responsiveness vs. throughput
		let processedFeatures = 0;
		while (processedFeatures < features.length) {
			const end = Math.min(processedFeatures + CHUNK, features.length);
			for (let i = processedFeatures; i < end; i++) {
				const feature = features[i];
				const id = i + 1;

				// Update loading UI for this micro-batch
				const percent = Math.floor((i / total) * 100);
				if (context.loadingBar) context.loadingBar.style.width = `${percent}%`;
				if (context.loadingStatus)
					context.loadingStatus.innerText = isBlank
						? `Scanning Landmasses: ${percent}%`
						: `Mapping Borders: ${percent}%`;

				// Use GeoJSON bounds (fast path) where available; fallback to computing via a lightweight bbox helper
				let bounds;
				try {
					bounds = getFeatureBounds(feature);
				} catch (_e) {
					bounds = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
				}

				const startLat = Math.max(
					0,
					Math.floor((bounds.getSouth() + 90) / CONFIG.GRID_RES),
				);
				const endLat = Math.min(
					context.gridHeight - 1,
					Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
				);
				const startLng = Math.max(
					0,
					Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
				);
				const endLng = Math.min(
					context.gridWidth - 1,
					Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
				);

				for (let y = startLat; y <= endLat; y++) {
					const rowOffset = y * context.gridWidth;
					for (let x = startLng; x <= endLng; x++) {
						const lat = y * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES * 0.5;
						const lng = x * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES * 0.5;
						if (context.isPointInFeature(lat, lng, feature)) {
							const idx = rowOffset + x;
							if (idx >= 0 && idx < context.landMask.length) {
								context.landMask[idx] = maskValue;
								// Always populate De Jure map as a historical reference for original territory, even in "blank" editor mode
								context.deJureMap[idx] = id;
								if (!isBlank) {
									context.worldControlMap[idx] = id;
									const meta = context.countryMetadata[id - 1];
									if (meta) {
										meta.bounds.minX = Math.min(meta.bounds.minX, x);
										meta.bounds.maxX = Math.max(meta.bounds.maxX, x);
										meta.bounds.minY = Math.min(meta.bounds.minY, y);
										meta.bounds.maxY = Math.max(meta.bounds.maxY, y);
									}
								}
							}
						}
					}
				}
			}

			processedFeatures = end;

			// Yield back to the browser to keep UI responsive
			// micro-delay (0) allows the event loop to handle input/paint/other tasks
			// while keeping throughput reasonable.
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		if (context.loadingBar) context.loadingBar.style.width = `100%`;
		if (context.loadingStatus)
			context.loadingStatus.innerText = `Optimization Complete`;

		// Automatically apply desert biomes to Earth-based scenarios for visual depth in Simple Mode
		if (!context.isCustomTerrain) {
			context.applyEarthDeserts();
		}
	}

	async function loadTerrain(res) {
		try {
			context.loadingStatus.innerText = "Scanning Topography...";
			context.loadingBar.style.width = "35%";

			// Every user-selectable global grid currently exceeds this threshold. Check
			// before downloading multi-megabyte physical GeoJSON that would be discarded
			// immediately after parsing.
			const totalCells = (context.gridWidth || 0) * (context.gridHeight || 0);
			if (totalCells > 600000) {
				context.terrainMask.fill(0);
				context.loadingBar.style.width = "100%";
				context.loadingStatus.innerText = "Terrain simplified for performance";
				return;
			}

			// Fallback to 50m if 10m is selected for physical features, as 10m physical data is often missing/split differently
			const terrainRes = res === "110m" ? "110m" : "50m";
			const terrainUrl = `${CONFIG.GEOJSON_BASE}${terrainRes}/physical/ne_${terrainRes}_geography_regions_polys.json`;

			let data = await _geoCacheGet(terrainUrl);
			if (!data) {
				const response = await fetch(terrainUrl);

				if (!response.ok) {
					console.warn("Terrain fetch failed with status", response.status);
					context.terrainMask.fill(0);
					context.loadingBar.style.width = "100%";
					context.loadingStatus.innerText =
						"Terrain data unavailable, continuing...";
					return;
				}

				data = await response.json();
				_geoCachePut(terrainUrl, data);
			}

			const features = data.features || [];

			// PERFORMANCE GUARD:
			// On very large grids or huge terrain datasets, skip heavy per‑cell terrain processing
			// to avoid getting "stuck" on the Scanning Topography step (especially on mobile).
			const isHugeFeatureSet = features.length > 400;

			if (isHugeFeatureSet) {
				console.warn(
					"Terrain processing skipped for performance (cells:",
					totalCells,
					"features:",
					features.length,
					")",
				);
				context.terrainMask.fill(0);
				context.loadingBar.style.width = "100%";
				context.loadingStatus.innerText = "Terrain simplified for performance";
				return;
			}

			const mountains = [];
			const lowlands = [];

			features.forEach((f) => {
				const p = f.properties;
				const name = (p.name || p.name_en || "").toLowerCase();
				const type = (p.featurecla || "").toLowerCase();

				const isMt =
					type.includes("mountain") ||
					type.includes("range") ||
					name.includes("mountain") ||
					name.includes("alps") ||
					name.includes("himalaya") ||
					name.includes("karakoram") ||
					name.includes("kunlun") ||
					name.includes("pamir") ||
					name.includes("tibet") ||
					name.includes("hindu kush") ||
					name.includes("tian shan") ||
					name.includes("andes") ||
					name.includes("rockies") ||
					name.includes("carpathian") ||
					name.includes("caucasus") ||
					name.includes("atlas") ||
					name.includes("pyrenees");

				// Categorize basins and depressions as lowlands to act as "holes" in larger mountain ranges
				const isLow =
					name.includes("basin") ||
					name.includes("depression") ||
					name.includes("plain") ||
					name.includes("lowland") ||
					name.includes("valley") ||
					name.includes("transylvania") ||
					name.includes("pannonian") ||
					name.includes("carpathian basin");

				if (isMt) mountains.push(f);
				if (isLow) lowlands.push(f);
			});

			context.terrainMask.fill(0);

			// Pass 1: Draw Mountains
			const totalMt = mountains.length;
			for (let i = 0; i < totalMt; i++) {
				if (i % 10 === 0) {
					const pct = 40 + Math.floor((i / Math.max(1, totalMt)) * 40);
					context.loadingBar.style.width = `${pct}%`;
					context.loadingStatus.innerText = `Mapping Rugged Peaks: ${pct}%`;
					await new Promise((r) => setTimeout(r, 0));
				}

				const feature = mountains[i];
				const bounds = getFeatureBounds(feature);
				const sLat = Math.max(
					0,
					Math.floor((bounds.getSouth() + 90) / CONFIG.GRID_RES),
				);
				const eLat = Math.min(
					context.gridHeight - 1,
					Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
				);
				const sLng = Math.max(
					0,
					Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
				);
				const eLng = Math.min(
					context.gridWidth - 1,
					Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
				);

				for (let y = sLat; y <= eLat; y++) {
					for (let x = sLng; x <= eLng; x++) {
						const lat = y * CONFIG.GRID_RES - 90;
						const lng = x * CONFIG.GRID_RES - 180;
						if (context.isPointInFeature(lat, lng, feature)) {
							const idx = y * context.gridWidth + x;
							if (idx >= 0 && idx < context.terrainMask.length) {
								const rank = feature.properties.scalerank || 5;
								const intensity = Math.max(0.3, (11 - rank) / 10);
								context.terrainMask[idx] = Math.max(
									context.terrainMask[idx],
									intensity,
								);
							}
						}
					}
				}
			}

			// Pass 2: Clear Lowlands (Holes in ranges like the Transylvanian Depression)
			const totalLow = lowlands.length;
			for (let i = 0; i < totalLow; i++) {
				if (i % 20 === 0) {
					const pct = 80 + Math.floor((i / Math.max(1, totalLow)) * 15);
					context.loadingBar.style.width = `${Math.min(95, pct)}%`;
					context.loadingStatus.innerText = `Carving Basins: ${Math.min(95, pct)}%`;
					await new Promise((r) => setTimeout(r, 0));
				}

				const feature = lowlands[i];
				const bounds = getFeatureBounds(feature);
				const sLat = Math.max(
					0,
					Math.floor((bounds.getSouth() + 90) / CONFIG.GRID_RES),
				);
				const eLat = Math.min(
					context.gridHeight - 1,
					Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
				);
				const sLng = Math.max(
					0,
					Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
				);
				const eLng = Math.min(
					context.gridWidth - 1,
					Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
				);

				for (let y = sLat; y <= eLat; y++) {
					for (let x = sLng; x <= eLng; x++) {
						const lat = y * CONFIG.GRID_RES - 90;
						const lng = x * CONFIG.GRID_RES - 180;
						if (context.isPointInFeature(lat, lng, feature)) {
							const idx = y * context.gridWidth + x;
							if (idx >= 0 && idx < context.terrainMask.length) {
								// Set mountain intensity to 0 for identified basins/lowlands
								context.terrainMask[idx] = 0;
							}
						}
					}
				}
			}

			// Finalize progress if everything succeeded
			context.loadingBar.style.width = "100%";
			context.loadingStatus.innerText = "Topography mapped";
		} catch (e) {
			console.warn("Failed to load terrain data", e);
			// On any error, fall back to flat terrain so the loader never gets stuck
			if (context.terrainMask) context.terrainMask.fill(0);
			context.loadingBar.style.width = "100%";
			context.loadingStatus.innerText =
				"Terrain data unavailable, continuing...";
		}
	}

	function scheduleIdleLoad(task) {
		if (typeof requestIdleCallback === "function") {
			requestIdleCallback(() => task(), { timeout: 3000 });
		} else {
			setTimeout(() => task(), 750);
		}
	}

	function mapResolutionFromUrl(url) {
		return String(url).match(/\/(10m|50m|110m)\//)?.[1] || "110m";
	}

	async function loadEarthRaster({
		gridResolution,
		gridWidth: targetWidth,
		gridHeight: targetHeight,
		mapResolution,
		onProgress,
		sourceUrl,
	}) {
		try {
			const prepared = await loadPrederivedEarthRaster(gridResolution, {
				mapResolution,
			});
			if (
				prepared &&
				prepared.landMask.length === targetWidth * targetHeight &&
				prepared.deJureMap.length === targetWidth * targetHeight
			) {
				return { ...prepared, rawData: null };
			}
			if (prepared) {
				console.warn(
					"Prepared Earth raster dimensions do not match the selected grid; rebuilding",
				);
			}
		} catch (error) {
			console.warn("Prepared Earth raster unavailable; rebuilding", error);
		}

		const rasterOptions = {
			sourceUrl,
			sourceRevision: PARSED_GEO_CACHE_REVISION,
			gridResolution,
			gridWidth: targetWidth,
			gridHeight: targetHeight,
			blank: true,
		};
		const cached = await getDerivedRaster(rasterOptions);
		if (cached?.arrays) {
			const deJureMap =
				cached.arrays.deJureMap || cached.arrays.ownerMap || null;
			if (
				cached.arrays.landMask?.length === targetWidth * targetHeight &&
				deJureMap?.length === targetWidth * targetHeight
			) {
				return {
					...cached.arrays,
					deJureMap,
					featureCount: null,
					rawData: null,
					sourceUrl,
				};
			}
		}

		const rawData = await fetchJSONWithCache(sourceUrl);
		const arrays = await rasterizeGeoFeaturesInWorker(
			rawData.features,
			{
				gridResolution,
				gridWidth: targetWidth,
				gridHeight: targetHeight,
				blank: true,
				maskValue: 1,
			},
			onProgress,
		);
		const deJureMap = arrays.ownerMap;
		const cacheArrays = {
			landMask: arrays.landMask,
			deJureMap,
			featureBounds: arrays.featureBounds,
		};
		scheduleIdleLoad(() => {
			putDerivedRaster(rasterOptions, cacheArrays).catch((error) =>
				console.warn("Deferred Earth raster cache write failed", error),
			);
		});
		return {
			...arrays,
			deJureMap,
			featureCount: rawData.features.length,
			rawData,
			sourceUrl,
		};
	}

	async function loadScenarioEarthRaster({
		gridResolution,
		gridWidth: targetWidth,
		gridHeight: targetHeight,
		mapResolution,
		onProgress,
	}) {
		const selectedSourceUrl = `${CONFIG.GEOJSON_BASE}${mapResolution}/cultural/ne_${mapResolution}_admin_0_countries.json`;
		const selectedPromise = loadEarthRaster({
			gridResolution,
			gridWidth: targetWidth,
			gridHeight: targetHeight,
			mapResolution,
			onProgress,
			sourceUrl: selectedSourceUrl,
		});
		if (mapResolution === "110m") return selectedPromise;

		// Built-in scenario country IDs follow the 110m Natural Earth feature order.
		// Higher-detail sources use a different order, so use them only for coastline
		// precision and retain the canonical 110m owner IDs for de-jure semantics.
		const canonicalSourceUrl = `${CONFIG.GEOJSON_BASE}110m/cultural/ne_110m_admin_0_countries.json`;
		const canonicalPromise = loadEarthRaster({
			gridResolution,
			gridWidth: targetWidth,
			gridHeight: targetHeight,
			mapResolution: "110m",
			sourceUrl: canonicalSourceUrl,
		});
		const [selected, canonical] = await Promise.all([
			selectedPromise,
			canonicalPromise,
		]);
		return combineScenarioEarthRasters(selected, canonical);
	}

	async function loadCountries(
		url,
		isBlank = false,
		suppressUi = false,
		loadGenerationOverride = null,
	) {
		const loadGeneration =
			loadGenerationOverride === null
				? ++loadSession.generation
				: loadGenerationOverride;
		const loadTrace = suppressUi
			? null
			: beginLoadTrace(isBlank ? "earth-editor" : "political-map", {
					sourceUrl: url,
					gridResolution: CONFIG.GRID_RES,
				});
		try {
			if (!suppressUi) {
				context.setLoadingThematic(false);
				context.loadingOverlay.style.display = "flex";
				context.mapUi.style.display = "none";
				context.mainMenu.style.display = "none";
			}
			context.loadingStatus.innerText = "Downloading GeoData...";
			context.loadingBar.style.width = "10%";
			let loadedBlankRaster = null;
			const usePreparedBlankEarth = isBlank && !suppressUi;

			if (usePreparedBlankEarth) {
				context.loadingStatus.innerText = "Loading Prepared Landmasses...";
				context.setCities([]);
				const raster = await loadEarthRaster({
					gridResolution: CONFIG.GRID_RES,
					gridWidth: context.gridWidth,
					gridHeight: context.gridHeight,
					mapResolution: mapResolutionFromUrl(url),
					sourceUrl: url,
					onProgress(progress) {
						const percent = Math.floor(
							(progress.completed / Math.max(1, progress.total)) * 100,
						);
						context.loadingBar.style.width = `${percent}%`;
						context.loadingStatus.innerText = `Scanning Landmasses: ${percent}%`;
					},
				});
				context.worldControlMap.fill(0);
				context.occupationMap.fill(0);
				context.resetSideInfluenceMaps();
				context.primaryOccupierMap.fill(0);
				context.landMask.set(raster.landMask);
				context.deJureMap.set(raster.deJureMap);
				context.biomeMask.fill(0);
				context.setCountryMetadata([]);
				context.setRawGeoJsonData(raster.rawData);
				context.applyEarthDeserts();
				loadedBlankRaster = {
					deJureMap: raster.deJureMap,
					landMask: raster.landMask,
				};
				context.loadingBar.style.width = "100%";
				context.loadingStatus.innerText = "Landmasses Ready";
				loadTrace?.mark("prepared-earth-ready", {
					assetBytes: raster.assetBytes || 0,
					bytesSource: raster.sourceUrl,
					features: raster.featureCount,
				});

				// Raw feature geometry, flags, and cities are editor conveniences rather
				// than prerequisites for displaying the blank Earth canvas. Hydrate them
				// after the editor becomes usable so they do not hold the loading screen.
				scheduleIdleLoad(async () => {
					if (loadGeneration !== loadSession.generation) return;
					try {
						const [, , data] = await Promise.all([
							context.loadCities(
								() => loadGeneration === loadSession.generation,
								true,
							),
							context.loadFlagCodes(),
							raster.rawData
								? Promise.resolve(raster.rawData)
								: fetchJSONWithCache(url),
						]);
						if (loadGeneration !== loadSession.generation) return;
						context.setRawGeoJsonData(data);
						context.setInitialCitiesSnapshot(context.deepClone(context.cities));
						context.influenceLayer?.render();
					} catch (error) {
						console.warn("Deferred editor geography hydration failed:", error);
					}
				});
			} else {
				await Promise.all([context.loadCities(), context.loadFlagCodes()]);
				loadTrace?.mark("support-data-ready");
				context.loadingBar.style.width = "20%";
				context.loadingTip.innerText =
					"Refining city coordinates for strategic deployment...";

				const data = await fetchJSONWithCache(url);
				loadTrace?.mark("geodata-ready", {
					features: data?.features?.length || 0,
				});
				context.setRawGeoJsonData(data);
				context.loadingBar.style.width = "30%";
				context.loadingStatus.innerText = isBlank
					? "Acquiring Topography..."
					: "Processing Geopolitics...";
				context.loadingTip.innerText = isBlank
					? "Cleaning political data..."
					: "Calculating terrain influence grids...";

				if (isBlank) {
					const rasterOptions = {
						sourceUrl: url,
						sourceRevision: PARSED_GEO_CACHE_REVISION,
						gridResolution: CONFIG.GRID_RES,
						gridWidth: context.gridWidth,
						gridHeight: context.gridHeight,
						blank: true,
					};
					const cached = await getDerivedRaster(rasterOptions);
					let arrays = cached?.arrays || null;
					if (!arrays) {
						arrays = await rasterizeGeoFeaturesInWorker(
							data.features,
							{
								gridResolution: CONFIG.GRID_RES,
								gridWidth: context.gridWidth,
								gridHeight: context.gridHeight,
								blank: true,
								maskValue: 1,
							},
							(progress) => {
								const percent = Math.floor(
									(progress.completed / Math.max(1, progress.total)) * 100,
								);
								context.loadingBar.style.width = `${percent}%`;
								context.loadingStatus.innerText = `Scanning Landmasses: ${percent}%`;
							},
						);
						const cacheArrays = {
							landMask: arrays.landMask,
							deJureMap: arrays.ownerMap,
							featureBounds: arrays.featureBounds,
						};
						scheduleIdleLoad(() =>
							putDerivedRaster(rasterOptions, cacheArrays),
						);
					}
					context.worldControlMap.fill(0);
					context.occupationMap.fill(0);
					context.resetSideInfluenceMaps();
					context.primaryOccupierMap.fill(0);
					context.landMask.set(arrays.landMask);
					context.deJureMap.set(arrays.deJureMap || arrays.ownerMap);
					context.biomeMask.fill(0);
					context.setCountryMetadata([]);
					context.applyEarthDeserts();
					loadedBlankRaster = {
						deJureMap: arrays.deJureMap || arrays.ownerMap,
						landMask: arrays.landMask,
					};
				} else {
					context.worldControlMap.fill(0);
					context.occupationMap.fill(0);
					context.resetSideInfluenceMaps();
					context.primaryOccupierMap.fill(0);
					context.landMask.fill(0);
					context.deJureMap.fill(0);
					context.biomeMask.fill(0);
					await updateLandMask(data.features, 1, false);
				}
			}
			loadTrace?.mark("land-raster-ready");

			// Blank geography has no political owners, so a full procedural province
			// pass can only write zeroes. Avoid scanning the entire grid for that no-op.
			if (isBlank) {
				context.provinceMap.fill(0);
				context.notifyPoliticalMapLoaded();
			} else {
				context.generateProvinces();
			}
			loadTrace?.mark("provinces-ready");

			// Generate initial country centers and label data
			if (!isBlank || context.countryMetadata.some(Boolean))
				context.recalculateAllBounds();

			// Reset adjacency cache
			context.setAdjacencyCache(null);

			// Capture Instant Quick Restart Snapshots for the base map load
			if (context.worldControlMap && !suppressUi) {
				context.setInitialWorldControlMapSnapshot(
					isBlank
						? new Uint16Array(context.worldControlMap.length)
						: new Uint16Array(context.worldControlMap),
				);
				context.setInitialDeJureMapSnapshot(
					loadedBlankRaster?.deJureMap || new Uint16Array(context.deJureMap),
				);
				context.setInitialProvinceMapSnapshot(
					isBlank
						? new Int32Array(context.provinceMap.length)
						: new Int32Array(context.provinceMap),
				);
				context.setInitialLandMaskSnapshot(
					loadedBlankRaster?.landMask || new Uint8Array(context.landMask),
				);
				context.setInitialCountryMetadataSnapshot(
					context.deepClone(context.countryMetadata),
				);
				context.setInitialCitiesSnapshot(context.deepClone(context.cities));
			}

			// Load and rasterize mountain terrain
			if (context.mountainsEnabled) {
				const currentMapRes = document.getElementById("map-res-select").value;
				await loadTerrain(currentMapRes);
			} else {
				context.terrainMask.fill(0);
			}
			loadTrace?.mark("terrain-ready");

			if (!suppressUi) {
				context.loadingOverlay.style.display = "none";
				context.mapUi.style.display = "flex";
				context.activateImageryProvider();
			}
			loadTrace?.finish({
				cells: context.worldControlMap?.length || 0,
				countries: context.countryMetadata.filter(Boolean).length,
			});
		} catch (err) {
			loadTrace?.fail(err);
			console.error("Failed to load geojson", err);
			context.loadingStatus.innerText = "Error Loading Assets";
			context.loadingStatus.style.color = "#ff4757";
			if (suppressUi) throw err;
		}
	}
	return {
		updateLandMask,
		loadTerrain,
		scheduleIdleLoad,
		loadScenarioEarthRaster,
		loadCountries,
	};
}
