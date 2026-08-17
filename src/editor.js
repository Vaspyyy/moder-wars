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
import {
	activateImageryProvider,
	activeScenarioId,
	airPowerEnabled,
	applyEarthDeserts,
	applyWorldBounds,
	armorEnabled,
	biomeMask,
	brushSize,
	cities,
	clearRefHandles,
	computeCountryUrbanPop,
	confirmRandomGenBtn,
	countryInspector,
	countryMetadata,
	currentScenarioContext,
	customSatelliteImg,
	customSatelliteUrl,
	deepClone,
	deJureMap,
	disableBombsCheckbox,
	disableCountryGradient,
	disableCountryGradientCheckbox,
	editingCountryId,
	editorToolbox,
	editorToolsPage1Btn,
	editorToolsPage2Btn,
	editorToolsPage3Btn,
	editorToolsPage4Btn,
	editorToolsPage5Btn,
	editorUpdateBtn,
	findCodeByName,
	gameState,
	gameTimeDate,
	gameTimeEnabled,
	generateProvinces,
	getCookie,
	getCountryColor,
	getFlagUrl,
	getGridIndex,
	getProvinceId,
	getTranslation,
	godModeBtn,
	gridHeight,
	gridWidth,
	imagerySelect,
	importCountryCardList,
	importCountrySearch,
	importScenarioSelect,
	influenceLayer,
	initializeEngine,
	inspectFlagPreview,
	isCustomTerrain,
	isInsideWorldBoxLatLng,
	isPointInFeature,
	landMask,
	lastImportScenarioKey,
	loadCities,
	loadFlagCodes,
	loadingBar,
	loadingOverlay,
	loadingStatus,
	loadingTip,
	mainMenu,
	mapSettingsMissilesCheckbox,
	mapUi,
	markTerritoryCellsChanged,
	missilesEnabled,
	mountainsEnabled,
	noNationsModal,
	notifyPoliticalMapLoaded,
	occupationMap,
	paintMaskId,
	parseColorToRGBA,
	populateImportCountrySelect,
	primaryOccupierMap,
	provinceMap,
	randomNationsCountInput,
	rawGeoJsonData,
	recalculateAllBounds,
	refAboveTerrain,
	referenceImageUrl,
	referenceOverlay,
	refOpacity,
	refScale,
	resetBtn,
	resetConflictSetupState,
	resetSideInfluenceMaps,
	setAdjacencyCache,
	setAirPowerEnabled,
	setArmorEnabled,
	setBombsDisabled,
	setCities,
	setCountryMetadata,
	setCustomSatelliteImg,
	setCustomSatelliteUrl,
	setDisableCountryGradient,
	setGameMode,
	setGameState,
	setImageryProvider,
	setImportScenarioBuffer,
	setInitialCitiesSnapshot,
	setInitialCountryMetadataSnapshot,
	setInitialDeJureMapSnapshot,
	setInitialLandMaskSnapshot,
	setInitialProvinceMapSnapshot,
	setInitialWorldControlMapSnapshot,
	setIsCustomTerrain,
	setLoadingThematic,
	setMissilesEnabled,
	setRawGeoJsonData,
	setRefAboveTerrain,
	setReferenceImageUrl,
	setReferenceOverlay,
	setRefOpacity,
	setRefScale,
	setSelectedImportCountryId,
	setupPanel,
	setWarEconomyEnabled,
	sides,
	skipRandomGenBtn,
	spawnRandomNationsAcrossMap,
	statsPanel,
	statusText,
	terrainMask,
	terrainTypeSelect,
	timeDayInput,
	timeMonthInput,
	timeSystemCheckbox,
	timeYearInput,
	updateRefHandles,
	updateRestartVisibility,
	updateSidesUI,
	warEconomyEnabled,
	worldControlMap,
	worldHeightDeg,
	worldWidthDeg,
} from "./main.js";
import { loadScenario } from "./scenario-codec.js";

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

function updateCountryFlag(countryId, url) {
	if (countryId <= 0 || !url) return;

	const meta = countryMetadata.find((m) => m && m.id === countryId);
	if (meta) {
		meta.flagUrl = url;
		// Re-initialize image object to ensure the source change is picked up by the renderer
		meta.tempFlag = new Image();
		meta.tempFlag.crossOrigin = "anonymous";
		meta.tempFlag.onload = () => influenceLayer.render();
		meta.tempFlag.src = url;
	}

	// Propagate to live simulation/setup objects (units use these references)
	sides.flat().forEach((c) => {
		if (c && c.id === countryId) {
			c.flag = new Image();
			c.flag.crossOrigin = "anonymous";
			c.flag.onload = () => influenceLayer.render();
			c.flag.src = url;
		}
	});

	// Update Inspector UI if currently viewing this country
	if (
		editingCountryId === countryId &&
		countryInspector.style.display !== "none"
	) {
		inspectFlagPreview.src = url;
		inspectFlagPreview.style.display = "block";
	}

	updateSidesUI();
	influenceLayer.render();
}

async function updateLandMask(features, maskValue = 1, isBlank = false) {
	if (!isBlank) {
		setCountryMetadata(
			features.map((f, i) => {
				const color = getCountryColor(f);
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

				const code = findCodeByName(name) || getCode(f);
				return {
					id: i + 1,
					name: name,
					feature: f,
					color: color,
					rgba: parseColorToRGBA(color),
					flagUrl: getFlagUrl(code, name),
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
		setCountryMetadata([]);
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
			if (loadingBar) loadingBar.style.width = `${percent}%`;
			if (loadingStatus)
				loadingStatus.innerText = isBlank
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
				gridHeight - 1,
				Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
			);
			const startLng = Math.max(
				0,
				Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
			);
			const endLng = Math.min(
				gridWidth - 1,
				Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
			);

			for (let y = startLat; y <= endLat; y++) {
				const rowOffset = y * gridWidth;
				for (let x = startLng; x <= endLng; x++) {
					const lat = y * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES * 0.5;
					const lng = x * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES * 0.5;
					if (isPointInFeature(lat, lng, feature)) {
						const idx = rowOffset + x;
						if (idx >= 0 && idx < landMask.length) {
							landMask[idx] = maskValue;
							// Always populate De Jure map as a historical reference for rebellions, even in "blank" editor mode
							deJureMap[idx] = id;
							if (!isBlank) {
								worldControlMap[idx] = id;
								const meta = countryMetadata[id - 1];
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

	if (loadingBar) loadingBar.style.width = `100%`;
	if (loadingStatus) loadingStatus.innerText = `Optimization Complete`;

	// Automatically apply desert biomes to Earth-based scenarios for visual depth in Simple Mode
	if (!isCustomTerrain) {
		applyEarthDeserts();
	}
}

async function loadTerrain(res) {
	try {
		loadingStatus.innerText = "Scanning Topography...";
		loadingBar.style.width = "35%";

		// Every user-selectable global grid currently exceeds this threshold. Check
		// before downloading multi-megabyte physical GeoJSON that would be discarded
		// immediately after parsing.
		const totalCells = (gridWidth || 0) * (gridHeight || 0);
		if (totalCells > 600000) {
			terrainMask.fill(0);
			loadingBar.style.width = "100%";
			loadingStatus.innerText = "Terrain simplified for performance";
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
				terrainMask.fill(0);
				loadingBar.style.width = "100%";
				loadingStatus.innerText = "Terrain data unavailable, continuing...";
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
			terrainMask.fill(0);
			loadingBar.style.width = "100%";
			loadingStatus.innerText = "Terrain simplified for performance";
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

		terrainMask.fill(0);

		// Pass 1: Draw Mountains
		const totalMt = mountains.length;
		for (let i = 0; i < totalMt; i++) {
			if (i % 10 === 0) {
				const pct = 40 + Math.floor((i / Math.max(1, totalMt)) * 40);
				loadingBar.style.width = `${pct}%`;
				loadingStatus.innerText = `Mapping Rugged Peaks: ${pct}%`;
				await new Promise((r) => setTimeout(r, 0));
			}

			const feature = mountains[i];
			const bounds = getFeatureBounds(feature);
			const sLat = Math.max(
				0,
				Math.floor((bounds.getSouth() + 90) / CONFIG.GRID_RES),
			);
			const eLat = Math.min(
				gridHeight - 1,
				Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
			);
			const sLng = Math.max(
				0,
				Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
			);
			const eLng = Math.min(
				gridWidth - 1,
				Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
			);

			for (let y = sLat; y <= eLat; y++) {
				for (let x = sLng; x <= eLng; x++) {
					const lat = y * CONFIG.GRID_RES - 90;
					const lng = x * CONFIG.GRID_RES - 180;
					if (isPointInFeature(lat, lng, feature)) {
						const idx = y * gridWidth + x;
						if (idx >= 0 && idx < terrainMask.length) {
							const rank = feature.properties.scalerank || 5;
							const intensity = Math.max(0.3, (11 - rank) / 10);
							terrainMask[idx] = Math.max(terrainMask[idx], intensity);
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
				loadingBar.style.width = `${Math.min(95, pct)}%`;
				loadingStatus.innerText = `Carving Basins: ${Math.min(95, pct)}%`;
				await new Promise((r) => setTimeout(r, 0));
			}

			const feature = lowlands[i];
			const bounds = getFeatureBounds(feature);
			const sLat = Math.max(
				0,
				Math.floor((bounds.getSouth() + 90) / CONFIG.GRID_RES),
			);
			const eLat = Math.min(
				gridHeight - 1,
				Math.ceil((bounds.getNorth() + 90) / CONFIG.GRID_RES),
			);
			const sLng = Math.max(
				0,
				Math.floor((bounds.getWest() + 180) / CONFIG.GRID_RES),
			);
			const eLng = Math.min(
				gridWidth - 1,
				Math.ceil((bounds.getEast() + 180) / CONFIG.GRID_RES),
			);

			for (let y = sLat; y <= eLat; y++) {
				for (let x = sLng; x <= eLng; x++) {
					const lat = y * CONFIG.GRID_RES - 90;
					const lng = x * CONFIG.GRID_RES - 180;
					if (isPointInFeature(lat, lng, feature)) {
						const idx = y * gridWidth + x;
						if (idx >= 0 && idx < terrainMask.length) {
							// Set mountain intensity to 0 for identified basins/lowlands
							terrainMask[idx] = 0;
						}
					}
				}
			}
		}

		// Finalize progress if everything succeeded
		loadingBar.style.width = "100%";
		loadingStatus.innerText = "Topography mapped";
	} catch (e) {
		console.warn("Failed to load terrain data", e);
		// On any error, fall back to flat terrain so the loader never gets stuck
		if (terrainMask) terrainMask.fill(0);
		loadingBar.style.width = "100%";
		loadingStatus.innerText = "Terrain data unavailable, continuing...";
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
		const deJureMap = cached.arrays.deJureMap || cached.arrays.ownerMap || null;
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

let worldLoadGeneration = 0;

async function loadCountries(
	url,
	isBlank = false,
	suppressUi = false,
	loadGenerationOverride = null,
) {
	const loadGeneration =
		loadGenerationOverride === null
			? ++worldLoadGeneration
			: loadGenerationOverride;
	const loadTrace = suppressUi
		? null
		: beginLoadTrace(isBlank ? "earth-editor" : "political-map", {
				sourceUrl: url,
				gridResolution: CONFIG.GRID_RES,
			});
	try {
		if (!suppressUi) {
			setLoadingThematic(false);
			loadingOverlay.style.display = "flex";
			mapUi.style.display = "none";
			mainMenu.style.display = "none";
		}
		loadingStatus.innerText = "Downloading GeoData...";
		loadingBar.style.width = "10%";
		let loadedBlankRaster = null;
		const usePreparedBlankEarth = isBlank && !suppressUi;

		if (usePreparedBlankEarth) {
			loadingStatus.innerText = "Loading Prepared Landmasses...";
			setCities([]);
			const raster = await loadEarthRaster({
				gridResolution: CONFIG.GRID_RES,
				gridWidth,
				gridHeight,
				mapResolution: mapResolutionFromUrl(url),
				sourceUrl: url,
				onProgress(progress) {
					const percent = Math.floor(
						(progress.completed / Math.max(1, progress.total)) * 100,
					);
					loadingBar.style.width = `${percent}%`;
					loadingStatus.innerText = `Scanning Landmasses: ${percent}%`;
				},
			});
			worldControlMap.fill(0);
			occupationMap.fill(0);
			resetSideInfluenceMaps();
			primaryOccupierMap.fill(0);
			landMask.set(raster.landMask);
			deJureMap.set(raster.deJureMap);
			biomeMask.fill(0);
			setCountryMetadata([]);
			setRawGeoJsonData(raster.rawData);
			applyEarthDeserts();
			loadedBlankRaster = {
				deJureMap: raster.deJureMap,
				landMask: raster.landMask,
			};
			loadingBar.style.width = "100%";
			loadingStatus.innerText = "Landmasses Ready";
			loadTrace?.mark("prepared-earth-ready", {
				assetBytes: raster.assetBytes || 0,
				bytesSource: raster.sourceUrl,
				features: raster.featureCount,
			});

			// Raw feature geometry, flags, and cities are editor conveniences rather
			// than prerequisites for displaying the blank Earth canvas. Hydrate them
			// after the editor becomes usable so they do not hold the loading screen.
			scheduleIdleLoad(async () => {
				if (loadGeneration !== worldLoadGeneration) return;
				try {
					const [, , data] = await Promise.all([
						loadCities(() => loadGeneration === worldLoadGeneration, true),
						loadFlagCodes(),
						raster.rawData
							? Promise.resolve(raster.rawData)
							: fetchJSONWithCache(url),
					]);
					if (loadGeneration !== worldLoadGeneration) return;
					setRawGeoJsonData(data);
					setInitialCitiesSnapshot(deepClone(cities));
					influenceLayer?.render();
				} catch (error) {
					console.warn("Deferred editor geography hydration failed:", error);
				}
			});
		} else {
			await Promise.all([loadCities(), loadFlagCodes()]);
			loadTrace?.mark("support-data-ready");
			loadingBar.style.width = "20%";
			loadingTip.innerText =
				"Refining city coordinates for strategic deployment...";

			const data = await fetchJSONWithCache(url);
			loadTrace?.mark("geodata-ready", {
				features: data?.features?.length || 0,
			});
			setRawGeoJsonData(data);
			loadingBar.style.width = "30%";
			loadingStatus.innerText = isBlank
				? "Acquiring Topography..."
				: "Processing Geopolitics...";
			loadingTip.innerText = isBlank
				? "Cleaning political data..."
				: "Calculating terrain influence grids...";

			if (isBlank) {
				const rasterOptions = {
					sourceUrl: url,
					sourceRevision: PARSED_GEO_CACHE_REVISION,
					gridResolution: CONFIG.GRID_RES,
					gridWidth,
					gridHeight,
					blank: true,
				};
				const cached = await getDerivedRaster(rasterOptions);
				let arrays = cached?.arrays || null;
				if (!arrays) {
					arrays = await rasterizeGeoFeaturesInWorker(
						data.features,
						{
							gridResolution: CONFIG.GRID_RES,
							gridWidth,
							gridHeight,
							blank: true,
							maskValue: 1,
						},
						(progress) => {
							const percent = Math.floor(
								(progress.completed / Math.max(1, progress.total)) * 100,
							);
							loadingBar.style.width = `${percent}%`;
							loadingStatus.innerText = `Scanning Landmasses: ${percent}%`;
						},
					);
					const cacheArrays = {
						landMask: arrays.landMask,
						deJureMap: arrays.ownerMap,
						featureBounds: arrays.featureBounds,
					};
					scheduleIdleLoad(() => putDerivedRaster(rasterOptions, cacheArrays));
				}
				worldControlMap.fill(0);
				occupationMap.fill(0);
				resetSideInfluenceMaps();
				primaryOccupierMap.fill(0);
				landMask.set(arrays.landMask);
				deJureMap.set(arrays.deJureMap || arrays.ownerMap);
				biomeMask.fill(0);
				setCountryMetadata([]);
				applyEarthDeserts();
				loadedBlankRaster = {
					deJureMap: arrays.deJureMap || arrays.ownerMap,
					landMask: arrays.landMask,
				};
			} else {
				worldControlMap.fill(0);
				occupationMap.fill(0);
				resetSideInfluenceMaps();
				primaryOccupierMap.fill(0);
				landMask.fill(0);
				deJureMap.fill(0);
				biomeMask.fill(0);
				await updateLandMask(data.features, 1, false);
			}
		}
		loadTrace?.mark("land-raster-ready");

		// Blank geography has no political owners, so a full procedural province
		// pass can only write zeroes. Avoid scanning the entire grid for that no-op.
		if (isBlank) {
			provinceMap.fill(0);
			notifyPoliticalMapLoaded();
		} else {
			generateProvinces();
		}
		loadTrace?.mark("provinces-ready");

		// Generate initial country centers and label data
		if (!isBlank || countryMetadata.some(Boolean)) recalculateAllBounds();

		// Reset adjacency cache
		setAdjacencyCache(null);

		// Capture Instant Quick Restart Snapshots for the base map load
		if (worldControlMap && !suppressUi) {
			setInitialWorldControlMapSnapshot(
				isBlank
					? new Uint16Array(worldControlMap.length)
					: new Uint16Array(worldControlMap),
			);
			setInitialDeJureMapSnapshot(
				loadedBlankRaster?.deJureMap || new Uint16Array(deJureMap),
			);
			setInitialProvinceMapSnapshot(
				isBlank
					? new Int32Array(provinceMap.length)
					: new Int32Array(provinceMap),
			);
			setInitialLandMaskSnapshot(
				loadedBlankRaster?.landMask || new Uint8Array(landMask),
			);
			setInitialCountryMetadataSnapshot(deepClone(countryMetadata));
			setInitialCitiesSnapshot(deepClone(cities));
		}

		// Load and rasterize mountain terrain
		if (mountainsEnabled) {
			const currentMapRes = document.getElementById("map-res-select").value;
			await loadTerrain(currentMapRes);
		} else {
			terrainMask.fill(0);
		}
		loadTrace?.mark("terrain-ready");

		if (!suppressUi) {
			loadingOverlay.style.display = "none";
			mapUi.style.display = "flex";
			activateImageryProvider();
		}
		loadTrace?.finish({
			cells: worldControlMap?.length || 0,
			countries: countryMetadata.filter(Boolean).length,
		});
	} catch (err) {
		loadTrace?.fail(err);
		console.error("Failed to load geojson", err);
		loadingStatus.innerText = "Error Loading Assets";
		loadingStatus.style.color = "#ff4757";
		if (suppressUi) throw err;
	}
}

function fillTerrainAt(latlng) {
	// Do not start terrain fill outside the configured world-size box
	if (!isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return;
	const startIdx = getGridIndex(latlng.lat, latlng.lng);
	if (startIdx === -1) return;

	const replacementType = terrainTypeSelect.value;
	const res = CONFIG.GRID_RES;

	// Determine source state at click point
	const sourceIsLand = landMask[startIdx] > 0;
	const sourceIsDesert = biomeMask[startIdx] === 1;
	const sourceIsMtn = terrainMask[startIdx] > 0.1;
	const sourceIsOcean = landMask[startIdx] === 0;

	// Determine what we are trying to achieve
	const isTargetingLand = replacementType === "LAND";
	const isTargetingDesert = replacementType === "DESERT";
	const isTargetingMtn = replacementType === "MOUNTAIN";
	const isTargetingOcean = replacementType === "OCEAN";

	// Prevent redundant fills
	if (isTargetingLand && sourceIsLand && !sourceIsDesert && !sourceIsMtn)
		return;
	if (isTargetingDesert && sourceIsDesert) return;
	if (isTargetingMtn && sourceIsMtn) return;
	if (isTargetingOcean && sourceIsOcean) return;

	loadingStatus.innerText = "Filling Terrain...";
	loadingOverlay.style.display = "flex";

	setTimeout(() => {
		const queue = [startIdx];
		const visited = new Uint8Array(gridWidth * gridHeight);
		visited[startIdx] = 1;

		while (queue.length > 0) {
			const idx = queue.pop();

			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			const cellLat = (y + 0.5) * res - 90;
			const cellLng = (x + 0.5) * res - 180;

			// Never modify terrain outside the world-size box
			if (!isInsideWorldBoxLatLng(cellLat, cellLng)) continue;

			// Apply replacement
			if (isTargetingOcean) {
				landMask[idx] = 0;
				worldControlMap[idx] = 0;
				biomeMask[idx] = 0;
				terrainMask[idx] = 0;
			} else if (isTargetingLand) {
				landMask[idx] = 1;
				biomeMask[idx] = 0;
				terrainMask[idx] = 0;
			} else if (isTargetingDesert) {
				// Desert/Mtn fill only happens on land
				if (landMask[idx] > 0) {
					biomeMask[idx] = 1;
					terrainMask[idx] = 0;
				}
			} else if (isTargetingMtn) {
				if (landMask[idx] > 0) {
					terrainMask[idx] = 0.75;
					biomeMask[idx] = 0;
				}
			}

			const neighbors = [];
			if (y > 0) neighbors.push(idx - gridWidth);
			if (y < gridHeight - 1) neighbors.push(idx + gridWidth);
			if (x > 0) neighbors.push(idx - 1);
			if (x < gridWidth - 1) neighbors.push(idx + 1);
			if (x === 0) neighbors.push(idx + (gridWidth - 1));
			if (x === gridWidth - 1) neighbors.push(idx - (gridWidth - 1));

			for (const nIdx of neighbors) {
				if (!visited[nIdx]) {
					const ny = Math.floor(nIdx / gridWidth);
					const nx = nIdx % gridWidth;
					const nLat = (ny + 0.5) * res - 90;
					const nLng = (nx + 0.5) * res - 180;

					// Do not propagate fill outside the world-size box
					if (!isInsideWorldBoxLatLng(nLat, nLng)) continue;

					const nIsLand = landMask[nIdx] > 0;
					const nIsDesert = biomeMask[nIdx] === 1;
					const nIsMtn = terrainMask[nIdx] > 0.1;
					const nIsOcean = landMask[nIdx] === 0;

					// Match criteria: must have exact same terrain profile as start point
					if (
						nIsLand === sourceIsLand &&
						nIsDesert === sourceIsDesert &&
						nIsMtn === sourceIsMtn &&
						nIsOcean === sourceIsOcean
					) {
						visited[nIdx] = 1;
						queue.push(nIdx);
					}
				}
			}
		}

		recalculateAllBounds();
		loadingOverlay.style.display = "none";
		influenceLayer.render();
	}, 10);
}

function applyPaintAt(latlng) {
	const isUnclaiming = gameState === "EDITOR_UNCLAIMING";
	const isTerrain = gameState === "EDITOR_PAINTING_TERRAIN";
	if (!isUnclaiming && !isTerrain && editingCountryId <= 0) return false;

	// Safety check for grid initialization
	if (!worldControlMap) return false;

	// Do not paint outside the world-size box
	if (!isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return false;

	const radius = brushSize;
	const res = CONFIG.GRID_RES;

	const startLat = Math.max(0, Math.floor((latlng.lat - radius + 90) / res));
	const endLat = Math.min(
		gridHeight - 1,
		Math.ceil((latlng.lat + radius + 90) / res),
	);
	const startLng = Math.max(0, Math.floor((latlng.lng - radius + 180) / res));
	const endLng = Math.min(
		gridWidth - 1,
		Math.ceil((latlng.lng + radius + 180) / res),
	);

	let mapChanged = false;
	const changedCells = [];
	for (let y = startLat; y <= endLat; y++) {
		const rowOffset = y * gridWidth;
		for (let x = startLng; x <= endLng; x++) {
			const idx = rowOffset + x;
			if (idx < 0 || idx >= worldControlMap.length) continue;

			const cellCenterLat = (y + 0.5) * res - 90;
			const cellCenterLng = (x + 0.5) * res - 180;

			// Never paint or terrain-edit outside the world-size box
			if (!isInsideWorldBoxLatLng(cellCenterLat, cellCenterLng)) continue;

			// Masking logic: If a mask is active, only paint on pixels that match the mask ID
			if (paintMaskId !== -1 && worldControlMap[idx] !== paintMaskId) continue;

			// Global Wrap Support for distance calculation
			let dlng = latlng.lng - cellCenterLng;
			if (dlng > 180) dlng -= 360;
			if (dlng < -180) dlng += 360;

			const dSq = (latlng.lat - cellCenterLat) ** 2 + dlng ** 2;

			if (dSq < radius * radius) {
				if (isUnclaiming) {
					if (landMask[idx] > 0 && worldControlMap[idx] !== 0) {
						worldControlMap[idx] = 0;
						provinceMap[idx] = getProvinceId(x, y, 0);
						mapChanged = true;
						changedCells.push(idx);
					}
				} else if (isTerrain) {
					const type = terrainTypeSelect.value;
					if (type === "LAND") {
						if (
							landMask[idx] === 0 ||
							biomeMask[idx] !== 0 ||
							terrainMask[idx] !== 0
						) {
							landMask[idx] = 1;
							biomeMask[idx] = 0;
							terrainMask[idx] = 0;
							mapChanged = true;
							changedCells.push(idx);
						}
					} else if (type === "DESERT") {
						// Only works on existing land; does not create new land from ocean
						if (landMask[idx] > 0 && biomeMask[idx] !== 1) {
							biomeMask[idx] = 1;
							terrainMask[idx] = 0;
							mapChanged = true;
							changedCells.push(idx);
						}
					} else if (type === "MOUNTAIN") {
						if (landMask[idx] > 0 && terrainMask[idx] < 0.7) {
							terrainMask[idx] = 0.75;
							biomeMask[idx] = 0;
							mapChanged = true;
							changedCells.push(idx);
						}
					} else {
						// OCEAN
						if (landMask[idx] !== 0) {
							landMask[idx] = 0;
							worldControlMap[idx] = 0;
							biomeMask[idx] = 0;
							mapChanged = true;
							changedCells.push(idx);
						}
					}
				} else {
					if (landMask[idx] > 0 && worldControlMap[idx] !== editingCountryId) {
						worldControlMap[idx] = editingCountryId;
						deJureMap[idx] = editingCountryId;
						provinceMap[idx] = getProvinceId(x, y, editingCountryId);

						const meta = countryMetadata[editingCountryId - 1];
						if (meta) {
							if (!meta.bounds)
								meta.bounds = { minX: x, maxX: x, minY: y, maxY: y };
							meta.bounds.minX = Math.min(meta.bounds.minX, x);
							meta.bounds.maxX = Math.max(meta.bounds.maxX, x);
							meta.bounds.minY = Math.min(meta.bounds.minY, y);
							meta.bounds.maxY = Math.max(meta.bounds.maxY, y);
						}
						mapChanged = true;
						changedCells.push(idx);
					}
				}
			}
		}
	}
	if (changedCells.length > 0) markTerritoryCellsChanged(changedCells);
	return mapChanged;
}

function paintAt(latlng) {
	if (applyPaintAt(latlng)) {
		// Force a render refresh to ensure the canvas visually updates while dragging
		influenceLayer._forceRender = true;
		influenceLayer.render();
	}
}

function updateEditorToolPage(page) {
	// Page 1: Scenario-level tools
	const page1Ids = [
		"editor-create-btn",
		"editor-test-btn",
		"editor-update-btn",
		"editor-save-btn",
		"editor-load-btn",
		"editor-share-btn",
		"editor-hub-btn",
	];

	// Page 2: Library / country / ZIP tools
	const page2Ids = [
		"editor-library-btn",
		"editor-flag-library-btn",
		"editor-save-country-btn",
		"editor-load-country-btn",
		"editor-save-multi-btn",
		"editor-save-all-zip-btn",
		"editor-load-zip-btn",
		"editor-import-country-from-scenario-btn",
	];

	// Page 3: Map painting / Unit tools
	const page3Ids = [
		"editor-paint-btn",
		"editor-fill-btn",
		"editor-unclaim-btn",
		"editor-terrain-btn",
		"editor-place-division-btn",
		"brush-controls",
		"terrain-controls",
	];

	// Page 4: City tools
	const page4Ids = ["editor-city-new-btn", "editor-city-clear-btn"];

	// Page 5: Overlay tools
	const page5Ids = ["overlay-tools"];

	const allIds = page1Ids.concat(page2Ids, page3Ids, page4Ids, page5Ids);

	// Explicit display types so we don't depend on whatever inline style happened to be set before.
	const displayMap = {
		"brush-controls": "flex",
		"overlay-tools": "flex",
	};

	// Show only the tools belonging to the active page
	allIds.forEach((id) => {
		const el = document.getElementById(id);
		if (!el) return;

		const isOnPage1 = page1Ids.includes(id);
		const isOnPage2 = page2Ids.includes(id);
		const isOnPage3 = page3Ids.includes(id);
		const isOnPage4 = page4Ids.includes(id);
		const isOnPage5 = page5Ids.includes(id);

		const shouldShow =
			(page === 1 && isOnPage1) ||
			(page === 2 && isOnPage2) ||
			(page === 3 && isOnPage3) ||
			(page === 4 && isOnPage4) ||
			(page === 5 && isOnPage5);

		if (shouldShow) {
			el.style.display = displayMap[id] || "inline-flex";
		} else {
			el.style.display = "none";
		}
	});

	// Toggle handles visibility based on whether a reference image exists
	if (referenceOverlay) {
		updateRefHandles();
	} else {
		clearRefHandles();
	}

	// Highlight active page button
	if (
		editorToolsPage1Btn &&
		editorToolsPage2Btn &&
		editorToolsPage3Btn &&
		editorToolsPage4Btn &&
		editorToolsPage5Btn
	) {
		editorToolsPage1Btn.style.background = page === 1 ? "#2e86de" : "#444";
		editorToolsPage2Btn.style.background = page === 2 ? "#2e86de" : "#444";
		editorToolsPage3Btn.style.background = page === 3 ? "#2e86de" : "#444";
		editorToolsPage4Btn.style.background = page === 4 ? "#2e86de" : "#444";
		editorToolsPage5Btn.style.background = page === 5 ? "#2e86de" : "#444";
	}
}

function generatePresetData(name) {
	const mapData = [];
	// Save all cells that are land (mask != 0), even if they don't have a country owner (id == 0)
	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] !== 0) {
			// Store as [index, ownerId, biomeId]
			mapData.push([i, worldControlMap[i], biomeMask[i] || 0]);
		}
	}

	// Save mountain/terrain intensity for custom maps to prevent losing painted peaks
	const mountainData = [];
	if (isCustomTerrain) {
		for (let i = 0; i < terrainMask.length; i++) {
			if (terrainMask[i] > 0) {
				mountainData.push([i, parseFloat(terrainMask[i].toFixed(2))]);
			}
		}
	}

	const currentImagery = getCookie("mw_imagery") || "arcgis";

	// Filter countryMetadata to handle sparse arrays/null entries
	// Includes releasables (nations without current land but preserved in metadata)
	const cleanMetadata = countryMetadata
		.filter((m) => m && typeof m === "object" && m.id)
		.map((m) => ({
			id: m.id,
			name: m.name || m.feature?.properties?.NAME || "Unnamed Nation",
			color: m.color || "rgba(150, 150, 150, 0.5)",
			isCustom: !!m.isCustom,
			flagUrl: m.flagUrl || null,
			// Persist any full-alliance flag that may override member flags in Alliance View
			allianceFlagUrl: m.allianceFlagUrl || null,
			role: m.role || "OFFENSE",
			overlordId: m.overlordId || null,
			releasableBy: m.releasableBy || null,
			savedCells: m.savedCells || null,
			buffState: m.buffState || "none",
			hiddenBuffState: m.hiddenBuffState || "none",
			allies: Array.isArray(m.allies) ? m.allies : [],
			gdp: Number.isFinite(m.gdp) ? m.gdp : 0,
			pop: Number.isFinite(m.pop) ? m.pop : 0,
			armoredVehicles: Number.isFinite(m.armoredVehicles)
				? m.armoredVehicles
				: null,
			fighters: Number.isFinite(m.fighters) ? m.fighters : null,
			strikeAircraft: Number.isFinite(m.strikeAircraft)
				? m.strikeAircraft
				: null,
			armorQuality: Number.isFinite(m.armorQuality) ? m.armorQuality : null,
			airQuality: Number.isFinite(m.airQuality) ? m.airQuality : null,
		}));

	// Persist city data (custom + any edited capitals)
	const cleanCities = (cities || []).map((c, idx) => ({
		id: c.id || idx + 1,
		name: c.name,
		lat: c.lat,
		lng: c.lng,
		isCapital: !!c.isCapital,
		ownerId: c.ownerId || c.sovereignId || null,
		isCustom: !!c.isCustom,
		pop: c.pop || 0,
	}));

	return {
		name: name,
		metadata: cleanMetadata,
		mapData: mapData,
		mountainData: mountainData.length > 0 ? mountainData : null,
		mapRes: document.getElementById("map-res-select").value,
		gridRes: CONFIG.GRID_RES,
		cities: cleanCities,
		imagery: currentImagery,
		isCustomTerrain: isCustomTerrain,
		disableCountryGradient: disableCountryGradient,
		customSatelliteUrl: customSatelliteUrl,
		worldWidthDeg: worldWidthDeg,
		worldHeightDeg: worldHeightDeg,
		missilesEnabled: missilesEnabled,
		warEconomyEnabled: warEconomyEnabled,
		armorEnabled: armorEnabled,
		airPowerEnabled: airPowerEnabled,
		timeEnabled: gameTimeEnabled || timeSystemCheckbox?.checked === true,
		startDate:
			gameTimeDate || timeSystemCheckbox?.checked
				? {
						year: Number(gameTimeDate?.year || timeYearInput?.value || 1936),
						month: Number(gameTimeDate?.month || timeMonthInput?.value || 1),
						day: Number(gameTimeDate?.day || timeDayInput?.value || 1),
					}
				: null,
		// Reference image persistence
		referenceImageUrl: referenceImageUrl || null,
		refImageOpacity: typeof refOpacity === "number" ? refOpacity : 0.5,
		refImageBounds: referenceOverlay
			? {
					nw: referenceOverlay.getBounds().getNorthWest(),
					se: referenceOverlay.getBounds().getSouthEast(),
				}
			: null,
		refDrawAbove: !!refAboveTerrain,
	};
}

async function performPresetLoad(
	fileOrBlob,
	targetMode = "EDITOR",
	options = {},
) {
	if (!fileOrBlob) return;

	const MAX_PRESET_SIZE = 200 * 1024 * 1024;
	if (fileOrBlob.size && fileOrBlob.size > MAX_PRESET_SIZE) {
		alert("Scenario file is too large (max 200MB).");
		loadingOverlay.style.display = "none";
		return;
	}

	const loadGeneration = ++worldLoadGeneration;
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

		loadingOverlay.style.display = "flex";
		loadingStatus.innerText = "Processing Archives...";

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
							loadingBar.style.width = `${5 + Math.round(downloadPercent * 0.4)}%`;
							loadingStatus.innerText = `Downloading Scenario: ${downloadPercent}%`;
						}
					} else if (progress.phase === "decompress") {
						loadingBar.style.width = "48%";
						loadingStatus.innerText = "Unpacking World Data...";
					} else if (progress.phase === "decode") {
						loadingBar.style.width = "55%";
						loadingStatus.innerText = "Building Strategic Grid...";
					}
				},
			});
			const earthPromise = options.prederivedEarth
				? loadScenarioEarthRaster({
						gridResolution: desiredGridRes,
						gridWidth: targetGridWidth,
						gridHeight: targetGridHeight,
						mapResolution: selectedMapResolution,
						onProgress(progress) {
							const ratio = progress.completed / Math.max(1, progress.total);
							loadingBar.style.width = `${55 + Math.round(ratio * 20)}%`;
							loadingStatus.innerText = `Scanning Landmasses: ${Math.round(ratio * 100)}%`;
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

		if (!worldControlMap || CONFIG.GRID_RES !== desiredGridRes) {
			// Update engine config to the desired grid resolution and reallocate all grid arrays.
			CONFIG.GRID_RES = desiredGridRes;
			initializeEngine(false);
		} else {
			// Sync settings state (mountains/provinces) even if resolution hasn't changed
			initializeEngine(false);
		}
		loadTrace.mark("engine-ready", { cells: worldControlMap?.length || 0 });

		// Always clear previous conflict setup / selection so old picks don't bleed into new scenarios
		resetConflictSetupState();

		// Visual environment restoration
		if (data.imagery) {
			// If this is a custom terrain map, we always use the preset's imagery
			if (data.isCustomTerrain) {
				setImageryProvider(data.imagery, false, false);
			} else {
				// If it's NOT a custom map, ignore the preset's imagery and stick to current user settings
				// But handle the case where it might need a fallback if none selected
				const currentUserImagery = imagerySelect
					? imagerySelect.value
					: getCookie("mw_imagery") || "arcgis";
				setImageryProvider(currentUserImagery, true, false);
			}
		}
		if (data.disableCountryGradient !== undefined) {
			setDisableCountryGradient(data.disableCountryGradient);
			if (disableCountryGradientCheckbox) {
				disableCountryGradientCheckbox.checked = disableCountryGradient;
			}
		}

		// World size & missile settings restoration
		if (
			typeof data.worldWidthDeg === "number" &&
			typeof data.worldHeightDeg === "number"
		) {
			applyWorldBounds(data.worldWidthDeg, data.worldHeightDeg, false);
		} else {
			// Default to full world if not specified
			applyWorldBounds(360, 180, false);
		}
		if (typeof data.missilesEnabled === "boolean") {
			setMissilesEnabled(data.missilesEnabled);
		} else {
			setMissilesEnabled(true);
		}
		if (mapSettingsMissilesCheckbox) {
			mapSettingsMissilesCheckbox.checked = !!missilesEnabled;
		}
		if (disableBombsCheckbox) {
			disableBombsCheckbox.checked = !missilesEnabled;
		}
		setBombsDisabled(disableBombsCheckbox?.checked || !missilesEnabled);
		setWarEconomyEnabled(data.warEconomyEnabled !== false);
		setArmorEnabled(data.armorEnabled !== false);
		setAirPowerEnabled(data.airPowerEnabled !== false);
		if (timeSystemCheckbox) {
			timeSystemCheckbox.checked = data.timeEnabled === true;
		}
		if (data.startDate) {
			if (timeYearInput)
				timeYearInput.value = String(data.startDate.year || 1936);
			if (timeMonthInput)
				timeMonthInput.value = String(data.startDate.month || 1);
			if (timeDayInput) timeDayInput.value = String(data.startDate.day || 1);
		}

		// Restore Custom Overlays
		if (data.customSatelliteUrl) {
			setCustomSatelliteUrl(data.customSatelliteUrl);
			setCustomSatelliteImg(new Image());
			customSatelliteImg.crossOrigin = "anonymous";
			customSatelliteImg.src = customSatelliteUrl;
		} else {
			setCustomSatelliteUrl(null);
			setCustomSatelliteImg(null);
		}

		// Reference image metadata is always loaded, but the overlay is only drawn in editor modes.
		setReferenceImageUrl(data.referenceImageUrl || null);
		setRefOpacity(
			typeof data.refImageOpacity === "number" ? data.refImageOpacity : 0.5,
		);
		setRefScale(
			typeof data.refImageScale === "number" ? data.refImageScale : 1.0,
		);
		setRefAboveTerrain(!!data.refDrawAbove);

		if (referenceOverlay) {
			map.removeLayer(referenceOverlay);
			setReferenceOverlay(null);
		}

		if (referenceImageUrl && targetMode === "EDITOR") {
			let bounds;
			if (data.refImageBounds?.nw && data.refImageBounds.se) {
				// Use saved bounds to preserve proportions/position
				bounds = [
					[data.refImageBounds.nw.lat, data.refImageBounds.nw.lng],
					[data.refImageBounds.se.lat, data.refImageBounds.se.lng],
				];
			} else {
				// Fallback: center on map using approximate aspect
				const center = map.getCenter();
				const h = 20 * refScale;
				const w = h * 1.6;
				bounds = [
					[center.lat - h, center.lng - w],
					[center.lat + h, center.lng + w],
				];
			}
			setReferenceOverlay(
				L.imageOverlay(referenceImageUrl, bounds, {
					opacity: refOpacity,
					interactive: false,
					pane: "refImagePane",
				}).addTo(map),
			);
			// Rebuild handles in editor
			updateRefHandles();
		} else {
			setReferenceOverlay(null);
		}

		// Built-in compiled scenarios already contain their control grid. Pair them
		// with selected-resolution land and canonical 110m de-jure IDs without
		// downloading or scanning Natural Earth GeoJSON.
		if (compiledMaps) {
			setRawGeoJsonData(prederivedEarth?.rawData || null);
			worldControlMap.fill(0);
			occupationMap.fill(0);
			resetSideInfluenceMaps();
			primaryOccupierMap.fill(0);
			provinceMap.fill(0);
			biomeMask.fill(0);
			if (prederivedEarth && !data.isCustomTerrain) {
				if (
					prederivedEarth.landMask.length !== landMask.length ||
					prederivedEarth.deJureMap.length !== deJureMap.length
				) {
					throw new Error(
						"Prederived Earth raster dimensions do not match grid",
					);
				}
				landMask.set(prederivedEarth.landMask);
				deJureMap.set(prederivedEarth.deJureMap);
			} else {
				landMask.set(compiledMaps.land);
				deJureMap.set(compiledMaps.deJure);
			}
		} else if (!rawGeoJsonData && !data.isCustomTerrain) {
			const mapRes = document.getElementById("map-res-select").value;
			const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
			await loadCountries(geoUrl, true, true, loadGeneration);
		} else if (!data.isCustomTerrain) {
			// If we have GeoJSON, we still need to reset the masks but don't need to re-download
			worldControlMap.fill(0);
			occupationMap.fill(0);
			resetSideInfluenceMaps();
			primaryOccupierMap.fill(0);
			landMask.fill(0);
			provinceMap.fill(0);
			deJureMap.fill(0);
			// Land mask is usually preserved from first boot load but ensure it is ready
		}
		loadTrace.mark("geography-ready");

		// Check for empty metadata and prompt for procedural generation
		const metaList = data.metadata || [];
		if (metaList.length === 0 && targetMode !== "EDITOR") {
			loadingOverlay.style.display = "none";
			noNationsModal.style.display = "flex";
			userChoice = await new Promise((resolve) => {
				confirmRandomGenBtn.onclick = () => {
					const count = parseInt(randomNationsCountInput.value, 10) || 15;
					resolve({ action: "generate", count });
				};
				skipRandomGenBtn.onclick = () => {
					resolve({ action: "skip" });
				};
			});
			noNationsModal.style.display = "none";
			loadingOverlay.style.display = "flex";
		}

		// Restore metadata and reconstruct RGBA values for rendering
		const currentLang = getCookie("mw_lang") || "en";
		const deferredFlagLoads = [];

		// Reset and rebuild metadata
		setCountryMetadata([]);
		metaList.forEach((m) => {
			if (!m?.id) return;

			// Apply system language translation to country names in preset
			const translatedName = getTranslation(m.name, currentLang, "NATIONS");
			if (translatedName !== m.name) {
				m.displayName = translatedName;
			}

			// Resolution Normalization for Releasable Saved Cells
			const sourceRes = data.gridRes || CONFIG.GRID_RES;
			const targetRes = CONFIG.GRID_RES;
			let normalizedCells = null;

			if (Array.isArray(m.savedCells) && m.savedCells.length > 0) {
				if (sourceRes === targetRes) {
					// Same resolution: just clone the list so we don't mutate the original
					normalizedCells = m.savedCells.map((pair) => [pair[0], pair[1]]);
				} else {
					// Remap saved cells from source grid to current grid using lat/lng centers
					const seen = new Set();
					normalizedCells = [];
					m.savedCells.forEach(([sx, sy]) => {
						const latCenter = sy * sourceRes - 90 + sourceRes / 2;
						const lngCenter = sx * sourceRes - 180 + sourceRes / 2;
						const idx = getGridIndex(latCenter, lngCenter);
						if (idx === -1) return;
						const ty = Math.floor(idx / gridWidth);
						const tx = idx % gridWidth;
						const key = `${tx},${ty}`;
						if (!seen.has(key)) {
							seen.add(key);
							normalizedCells.push([tx, ty]);
						}
					});
					if (!normalizedCells.length) {
						console.log(
							`Satellite Notice: ${m.name} releasable cells could not be remapped; falling back to deJure/feature.`,
						);
						normalizedCells = null;
					}
				}
			}

			const meta = {
				...m,
				savedCells: normalizedCells,
				rgba: parseColorToRGBA(m.color || "rgba(150, 150, 150, 0.5)"),
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
					if (influenceLayer) influenceLayer.render();
				};
				deferredFlagLoads.push(() => {
					meta.allianceFlagTempFlag.src = meta.allianceFlagUrl;
				});
			}

			countryMetadata[m.id - 1] = meta;
		});
		loadTrace.mark("metadata-ready", {
			countries: countryMetadata.filter(Boolean).length,
		});

		worldControlMap.fill(0);
		occupationMap.fill(0);
		resetSideInfluenceMaps();
		primaryOccupierMap.fill(0);
		biomeMask.fill(0);

		// Ensure custom terrain state is preserved
		setIsCustomTerrain(!!data.isCustomTerrain);
		if (isCustomTerrain) {
			landMask.fill(0);
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
				["control", compiledMaps.worldControl, worldControlMap],
				["biome", compiledMaps.biome, biomeMask],
				["province", compiledMaps.province, provinceMap],
			]) {
				if (source.length !== target.length) {
					throw new Error(
						`Compiled ${name} grid dimensions do not match engine`,
					);
				}
				target.set(source);
			}
			if (data.isCustomTerrain || !prederivedEarth) {
				if (compiledMaps.land.length !== landMask.length) {
					throw new Error("Compiled land grid dimensions do not match engine");
				}
				landMask.set(compiledMaps.land);
			}
		} else if (sourceRes === targetRes) {
			// Optimized bulk assignment
			for (let i = 0; i < totalEntries; i++) {
				const entry = mapData[i];
				const idx = entry[0];
				const val = entry[1];
				const bio = entry[2] || 0;

				if (idx < worldControlMap.length) {
					worldControlMap[idx] = val;
					biomeMask[idx] = bio;
					// Any index present in the mapData array is land
					landMask[idx] = 1;
				}
			}
		} else {
			console.log(
				`Satellite Redrawing: Converting scenario grid (${sourceRes} -> ${targetRes})`,
			);
			// Pre-calculate loop limits and constants for resolution conversion
			const _ratio = sourceRes / targetRes;
			const _isUpscaling = sourceRes > targetRes;

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
					if (ty < 0 || ty >= gridHeight) continue;
					const rowOffset = ty * gridWidth;
					for (let tx = xStart; tx <= xEnd; tx++) {
						if (tx < 0 || tx >= gridWidth) continue;
						const tIdx = rowOffset + tx;
						if (tIdx < worldControlMap.length) {
							worldControlMap[tIdx] = val;
							landMask[tIdx] = 1;
						}
					}
				}
			}
		}
		loadTrace.mark("control-map-ready", { entries: totalEntries });

		// Restore mountain data
		terrainMask.fill(0);
		if (data.mountainData) {
			const mData = data.mountainData;
			for (let i = 0; i < mData.length; i++) {
				const [idx, intensity] = mData[i];
				if (idx < terrainMask.length) {
					terrainMask[idx] = intensity;
				}
			}
		} else if (!data.isCustomTerrain && mountainsEnabled) {
			// Earth scenario without baked mountains: trigger dynamic GeoJSON terrain scan
			const resToUse =
				data.mapRes ||
				document.getElementById("map-res-select").value ||
				"110m";
			await loadTerrain(resToUse);
		}
		loadTrace.mark("terrain-ready");

		// Compiled loads already received an exact province grid from the worker.
		// Legacy loads retain the procedural pass on the main thread.
		if (compiledMaps) notifyPoliticalMapLoaded();
		else generateProvinces();
		loadTrace.mark("provinces-ready");

		// Reset adjacency cache whenever map changes
		setAdjacencyCache(null);

		// Load cities from preset if present, otherwise fall back to global dataset
		if (Array.isArray(data.cities)) {
			setCities(
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
			await loadCities();
		}
		loadTrace.mark("cities-ready", { cities: cities.length });

		setGameMode(targetMode);
		mainMenu.style.display = "none";
		mapUi.style.display = "flex";

		if (targetMode === "CONQUEST" || targetMode === "OPERATION") {
			setGameState("SELECTING_P1");
			statusText.innerText = currentScenarioContext
				? `PLAYING: ${currentScenarioContext.name}`
				: getTranslation("SELECT_P1");
			setupPanel.style.display = "block";
			editorToolbox.style.display = "none";
			godModeBtn.style.display = "block";
			resetBtn.style.display = "block";
			statsPanel.style.display = "none";
		} else {
			setGameState("EDITOR_ACTIVE");
			statusText.innerText = currentScenarioContext
				? `REMIXING: ${currentScenarioContext.name}`
				: "Map Editor (Alpha)";
			setupPanel.style.display = "none";
			editorToolbox.style.display = "flex";
			statsPanel.style.display = "none";
		}
		updateRestartVisibility();

		if (activeScenarioId) {
			editorUpdateBtn.style.display = "block";
		} else {
			editorUpdateBtn.style.display = "none";
		}

		// Capture Instant Quick Restart Snapshots immediately upon scenario load
		setInitialWorldControlMapSnapshot(
			compiledMaps?.worldControl || new Uint16Array(worldControlMap),
		);
		setInitialDeJureMapSnapshot(
			prederivedEarth?.deJureMap ||
				compiledMaps?.deJure ||
				new Uint16Array(deJureMap),
		);
		setInitialProvinceMapSnapshot(
			compiledMaps?.province || new Int32Array(provinceMap),
		);
		setInitialLandMaskSnapshot(
			prederivedEarth?.landMask ||
				compiledMaps?.land ||
				new Uint8Array(landMask),
		);
		setInitialCountryMetadataSnapshot(deepClone(countryMetadata));
		setInitialCitiesSnapshot(deepClone(cities));

		// Compute urban population per country for army size estimation
		computeCountryUrbanPop();

		// If the user chose to generate random nations earlier, trigger it now after
		// the grid is ready. There is no artificial confirmation delay: the overlay
		// closes as soon as the actual initialization work is complete.
		if (metaList.length === 0 && userChoice.action === "generate") {
			await spawnRandomNationsAcrossMap(userChoice.count);
		}

		recalculateAllBounds();
		loadingOverlay.style.display = "none";
		mapUi.style.display = "flex";
		activateImageryProvider();
		influenceLayer.render();
		updateRestartVisibility();
		if (compiledMaps && !data.isCustomTerrain && !prederivedEarth?.rawData) {
			const geoUrl = `${CONFIG.GEOJSON_BASE}${selectedMapResolution}/cultural/ne_${selectedMapResolution}_admin_0_countries.json`;
			scheduleIdleLoad(async () => {
				if (loadGeneration !== worldLoadGeneration) return;
				try {
					const rawData = await fetchJSONWithCache(geoUrl);
					if (loadGeneration === worldLoadGeneration) {
						setRawGeoJsonData(rawData);
					}
				} catch (error) {
					console.warn("Deferred scenario geography hydration failed:", error);
				}
			});
		}
		scheduleIdleLoad(() => {
			if (loadGeneration !== worldLoadGeneration) return;
			for (const startFlagLoad of deferredFlagLoads) startFlagLoad();
		});
		return loadTrace.finish({
			cells: worldControlMap.length,
			countries: countryMetadata.filter(Boolean).length,
			cities: cities.length,
		});
	} catch (err) {
		loadTrace.fail(err);
		console.error("Satellite Load Error:", err);
		loadingOverlay.style.display = "none";
		if (isCompiledSource) throw err;
		alert(`Error loading preset: ${err.message || "File may be corrupted"}`);
	}
}

async function loadScenarioForCountryImportFromBlob(blob) {
	try {
		const text = await blob.text();
		const data = JSON.parse(text);
		if (!data?.metadata || !data.mapData) {
			throw new Error("Invalid preset structure");
		}
		setImportScenarioBuffer({
			metadata: data.metadata,
			mapData: data.mapData,
			gridRes: data.gridRes || CONFIG.GRID_RES,
		});
		populateImportCountrySelect();
		// Restore the last selected scenario key in the dropdown if we have one
		if (importScenarioSelect && lastImportScenarioKey) {
			importScenarioSelect.value = lastImportScenarioKey;
		}
	} catch (e) {
		console.error("Import scenario load failed:", e);
		alert(
			"Could not read that scenario file. Make sure it is a preset exported from this engine.",
		);
		setImportScenarioBuffer(null);
		setSelectedImportCountryId(null);
		if (importCountrySearch) {
			importCountrySearch.value = "";
			importCountrySearch.disabled = true;
		}
		if (importCountryCardList) {
			importCountryCardList.innerHTML = `
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
		alert("Failed to load built‑in scenario for import.");
	}
}

function importSingleCountryFromScenario(source, sourceCountryId) {
	if (!worldControlMap || !countryMetadata) return;

	const metaList = source.metadata || [];
	const sourceMeta = metaList.find((m) => m && m.id === sourceCountryId);
	if (!sourceMeta) {
		alert("Country not found in source scenario.");
		return;
	}

	// Allocate a fresh ID in the current scenario
	const maxId = countryMetadata.reduce(
		(max, m) => (m ? Math.max(max, m.id) : max),
		0,
	);
	const newId = maxId + 1;

	// Build new metadata entry
	const newMeta = {
		id: newId,
		name: sourceMeta.name || `Imported ${sourceCountryId}`,
		color: sourceMeta.color || "rgba(150,150,150,0.5)",
		rgba: parseColorToRGBA(sourceMeta.color || "rgba(150,150,150,0.5)"),
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
		newMeta.tempFlag.onload = () => influenceLayer?.render();
		newMeta.tempFlag.src = newMeta.flagUrl;
	}
	countryMetadata[newId - 1] = newMeta;

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
			const tIdx = gy * gridWidth + gx;
			if (tIdx >= 0 && tIdx < worldControlMap.length && landMask[tIdx] > 0) {
				worldControlMap[tIdx] = newId;
				deJureMap[tIdx] = newId;
				provinceMap[tIdx] = getProvinceId(gx, gy, newId);
				newMeta.bounds.minX = Math.min(newMeta.bounds.minX, gx);
				newMeta.bounds.maxX = Math.max(newMeta.bounds.maxX, gx);
				newMeta.bounds.minY = Math.min(newMeta.bounds.minY, gy);
				newMeta.bounds.maxY = Math.max(newMeta.bounds.maxY, gy);
				paintedAny = true;
			}
		} else {
			// Convert source cell area into one or more target cells
			const xStart = Math.floor((baseLng + 180) / targetRes);
			const xEnd = Math.floor((baseLng + sourceRes + 180 - 0.0001) / targetRes);
			const yStart = Math.floor((baseLat + 90) / targetRes);
			const yEnd = Math.floor((baseLat + sourceRes + 90 - 0.0001) / targetRes);
			for (let gy = yStart; gy <= yEnd; gy++) {
				if (gy < 0 || gy >= gridHeight) continue;
				const rowOffset = gy * gridWidth;
				for (let gx = xStart; gx <= xEnd; gx++) {
					if (gx < 0 || gx >= gridWidth) continue;
					const tIdx = rowOffset + gx;
					worldControlMap[tIdx] = newId;
					deJureMap[tIdx] = newId;
					provinceMap[tIdx] = getProvinceId(gx, gy, newId);
					landMask[tIdx] = landMask[tIdx] || 1;
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
		alert(
			"No territory for that country was found in the source scenario at this resolution.",
		);
		return;
	}

	recalculateAllBounds();
	influenceLayer.render();
	statusText.innerText = `Imported ${newMeta.name} from scenario into this map.`;
}

export {
	applyPaintAt,
	fillTerrainAt,
	generatePresetData,
	importSingleCountryFromScenario,
	loadCountries,
	loadScenarioForCountryImportFromBlob,
	loadScenarioForCountryImportFromUrl,
	loadTerrain,
	paintAt,
	performPresetLoad,
	updateCountryFlag,
	updateEditorToolPage,
	updateLandMask,
};
