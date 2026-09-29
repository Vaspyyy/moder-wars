import { CONFIG } from "./config.js";
import { createGeographyLoader } from "./geography-loader.js";
import * as runtime from "./main.js";
import {
	biomeMask,
	brushSize,
	clearRefHandles,
	countryInspector,
	countryMetadata,
	deJureMap,
	editingCountryId,
	editorToolsPage1Btn,
	editorToolsPage2Btn,
	editorToolsPage3Btn,
	editorToolsPage4Btn,
	editorToolsPage5Btn,
	gameState,
	getGridIndex,
	getProvinceId,
	gridHeight,
	gridWidth,
	influenceLayer,
	inspectFlagPreview,
	isInsideWorldBoxLatLng,
	landMask,
	loadingOverlay,
	loadingStatus,
	markTerritoryCellsChanged,
	paintMaskId,
	provinceMap,
	recalculateAllBounds,
	referenceOverlay,
	sides,
	terrainMask,
	terrainTypeSelect,
	updateRefHandles,
	updateSidesUI,
	worldControlMap,
} from "./main.js";
import { createScenarioLoader } from "./scenario-loader.js";

const loadSession = { generation: 0 };
const loaderContext = Object.create(runtime);
const geographyLoader = createGeographyLoader(loaderContext, loadSession);
Object.defineProperties(
	loaderContext,
	Object.fromEntries(
		Object.entries(geographyLoader).map(([name, value]) => [name, { value }]),
	),
);
const scenarioLoader = createScenarioLoader(loaderContext, loadSession);
Object.defineProperties(
	loaderContext,
	Object.fromEntries(
		Object.entries(scenarioLoader).map(([name, value]) => [name, { value }]),
	),
);
const { updateLandMask, loadTerrain, loadCountries, ensureRawGeography } =
	geographyLoader;
const {
	generatePresetData,
	performPresetLoad,
	loadScenarioForCountryImportFromBlob,
	loadScenarioForCountryImportFromUrl,
	importSingleCountryFromScenario,
} = scenarioLoader;

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

const EDITOR_TOOL_PAGES = [
	[
		"editor-create-btn",
		"editor-test-btn",
		"editor-update-btn",
		"editor-save-btn",
		"editor-load-btn",
		"editor-share-btn",
		"editor-hub-btn",
	],
	[
		"editor-library-btn",
		"editor-flag-library-btn",
		"editor-save-country-btn",
		"editor-load-country-btn",
		"editor-save-multi-btn",
		"editor-save-all-zip-btn",
		"editor-load-zip-btn",
		"editor-import-country-from-scenario-btn",
	],
	[
		"editor-paint-btn",
		"editor-fill-btn",
		"editor-unclaim-btn",
		"editor-terrain-btn",
		"editor-place-division-btn",
		"brush-controls",
		"terrain-controls",
	],
	["editor-city-new-btn", "editor-city-clear-btn"],
	["overlay-tools"],
];

function updateEditorToolPage(page) {
	for (let index = 0; index < EDITOR_TOOL_PAGES.length; index++) {
		for (const id of EDITOR_TOOL_PAGES[index]) {
			const element = document.getElementById(id);
			if (!element) continue;
			element.style.display =
				page === index + 1
					? id === "brush-controls" || id === "overlay-tools"
						? "flex"
						: "inline-flex"
					: "none";
		}
	}
	if (referenceOverlay) updateRefHandles();
	else clearRefHandles();
	const buttons = [
		editorToolsPage1Btn,
		editorToolsPage2Btn,
		editorToolsPage3Btn,
		editorToolsPage4Btn,
		editorToolsPage5Btn,
	];
	if (buttons.every(Boolean))
		buttons.forEach((button, index) => {
			button.style.background = page === index + 1 ? "#2e86de" : "#444";
		});
}

export {
	applyPaintAt,
	ensureRawGeography,
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
