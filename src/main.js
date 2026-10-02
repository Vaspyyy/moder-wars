import { createConflictPresentation } from "./conflict-presentation.js";
import {
	createPresentationScheduler,
	createUnitSpatialMirror,
	setPresentationText,
} from "./presentation-runtime.js";
import { createLiveContext } from "./runtime-context.js";
import { createSimulationClient } from "./simulation-client.js";
import {
	createSimulationClock,
	LIVE_SIMULATION_CLOCK_OPTIONS,
} from "./simulation-clock.js";
import { PERF_COUNTER_DEFAULTS } from "./simulation-metrics.js";
import { resizeSimulationGrid } from "./simulation-resize.js";

// Shared live binding bridge. Systems receive commands/state without importing main.js.
const applicationRuntime = createLiveContext(
	{
		perf: () => window.__perf,
		simulationClient: () => simulationClient,
		editSimulation: () => editSimulation,
		resetLocalSimulationClock: () => resetLocalSimulationClock,
		_territoryDecisionPending: () => _territoryDecisionPending,
		onControlCellsChanged: () => onControlCellsChanged,
		onPoliticalMapChanged: () => onPoliticalMapChanged,
		onOperationalAiReset: () => onOperationalAiReset,
		isTreatyNoticeVisible: () => isTreatyNoticeVisible,
		ensureRawGeography: () => ensureRawGeography,
		ensureSideInfluenceMaps: () => ensureSideInfluenceMaps,
		presentCapitulation: () => conflictPresentation.presentCapitulation,
		presentTreatyStart: () => conflictPresentation.presentTreatyStart,
		presentTreatyNotice: () => conflictPresentation.presentTreatyNotice,
		onConflictMapChanged: () => conflictPresentation.onConflictMapChanged,
		presentTreatyFinished: () => conflictPresentation.presentTreatyFinished,
		invisibleBuffsEnabled: () => invisibleBuffsEnabled,
		_nextSideUid: () => _nextSideUid,
		getFormationPersonnel: () => getFormationPersonnel,
		getFormationStrengthMultiplier: () => getFormationStrengthMultiplier,
		createDeterministicJob: () => createDeterministicJob,
		_liveSideCombatPower: () => _liveSideCombatPower,
		_enemyCityCacheGeneration: () => _enemyCityCacheGeneration,
		_enemyCityCacheSource: () => _enemyCityCacheSource,
		_enemyCityCandidatesBySide: () => _enemyCityCandidatesBySide,
		CITY_CANDIDATE_CACHE_LIMIT: () => CITY_CANDIDATE_CACHE_LIMIT,
		_frontlineWorkerGeneration: () => _frontlineWorkerGeneration,
		_frontlineTerritoryGeneration: () => _frontlineTerritoryGeneration,
		syncFrontlineWorkerPendingState: () => syncFrontlineWorkerPendingState,
		frontlineDirLat: () => frontlineDirLat,
		frontlineDirLng: () => frontlineDirLng,
		activeTheaterCities: () => activeTheaterCities,
		_influenceCityGridSource: () => _influenceCityGridSource,
		_influenceCityGridSourceLength: () => _influenceCityGridSourceLength,
		_influenceCityGridWorldGeneration: () => _influenceCityGridWorldGeneration,
		_simulationWorldGeneration: () => _simulationWorldGeneration,
		sides: () => sides,
		_influenceCoalitionSignature: () => _influenceCoalitionSignature,
		_influenceActiveSideIndices: () => _influenceActiveSideIndices,
		_tickSideAllyIdSets: () => _tickSideAllyIdSets,
		_tickCityGridIndexSet: () => _tickCityGridIndexSet,
		getGridIndex: () => getGridIndex,
		areSidesHostile: () => areSidesHostile,
		_tickSideSupportIdSets: () => _tickSideSupportIdSets,
		MAX_SIDES: () => MAX_SIDES,
		_influenceHostileSideIndices: () => _influenceHostileSideIndices,
		gridWidth: () => gridWidth,
		gridHeight: () => gridHeight,
		_influenceFrontierQueued: () => _influenceFrontierQueued,
		_influenceFrontierWorldGeneration: () => _influenceFrontierWorldGeneration,
		_influenceFrontierQueue: () => _influenceFrontierQueue,
		_influenceFrontierCursor: () => _influenceFrontierCursor,
		_influenceFrontierPriorityQueue: () => _influenceFrontierPriorityQueue,
		_influenceFrontierPriorityCursor: () => _influenceFrontierPriorityCursor,
		INFLUENCE_FRONTIER_BACKLOG_LIMIT: () => INFLUENCE_FRONTIER_BACKLOG_LIMIT,
		INFLUENCE_FRONTIER_PRIORITY_LIMIT: () => INFLUENCE_FRONTIER_PRIORITY_LIMIT,
		dominantSideMap: () => dominantSideMap,
		landMask: () => landMask,
		syncOccupationFromSideInfluence: () => syncOccupationFromSideInfluence,
		sideInfluenceMaps: () => sideInfluenceMaps,
		_influenceNeighborDx: () => _influenceNeighborDx,
		_influenceNeighborDy: () => _influenceNeighborDy,
		primaryOccupierMap: () => primaryOccupierMap,
		_influenceNeighborCountryIds: () => _influenceNeighborCountryIds,
		_influenceNeighborCountryCounts: () => _influenceNeighborCountryCounts,
		_tickCountryById: () => _tickCountryById,
		CONFIG: () => CONFIG,
		getOptimizationFactor: () => getOptimizationFactor,
		_simTickCount: () => _simTickCount,
		units: () => units,
		stableUnitCohort: () => stableUnitCohort,
		simFrameCount: () => simFrameCount,
		mountainsEnabled: () => mountainsEnabled,
		terrainMask: () => terrainMask,
		getLiveFormationStrength: () => getLiveFormationStrength,
		worldControlMap: () => worldControlMap,
		occupationMap: () => occupationMap,
		_territoryLedger: () => _territoryLedger,
		influenceLayer: () => influenceLayer,
		deJureMap: () => deJureMap,
		_territoryLedgerSnapshot: () => _territoryLedgerSnapshot,
		_cachedP1T: () => _cachedP1T,
		_cachedP2T: () => _cachedP2T,
		_cachedSideTerritoryCounts: () => _cachedSideTerritoryCounts,
		_cachedSideTerritoryPcts: () => _cachedSideTerritoryPcts,
		getSideLedger: () => getSideLedger,
		_territoryLedgerDecisionTick: () => _territoryLedgerDecisionTick,
		getCountryLedger: () => getCountryLedger,
		_territoryLedgerCitiesSource: () => _territoryLedgerCitiesSource,
		_territoryLedgerCitiesLength: () => _territoryLedgerCitiesLength,
		_territoryLedgerAppliedCitiesRevision: () =>
			_territoryLedgerAppliedCitiesRevision,
		_territoryLedgerCitiesRevision: () => _territoryLedgerCitiesRevision,
		createTerritoryLedger: () => createTerritoryLedger,
		sideUids: () => sideUids,
		hostilityMatrix: () => hostilityMatrix,
		_frameSimulationCommitFlags: () => _frameSimulationCommitFlags,
		createPerfState: () => createPerfState,
		_frontlineLayoutApplyPendingMs: () => _frontlineLayoutApplyPendingMs,
		_frontlineSlotApplyPendingMs: () => _frontlineSlotApplyPendingMs,
		gameState: () => gameState,
		godModeActive: () => godModeActive,
		preGodModeState: () => preGodModeState,
		_tickAllCombatants: () => _tickAllCombatants,
		activeBattles: () => activeBattles,
		_battleHash: () => _battleHash,
		latestCountryStats: () => latestCountryStats,
		_tickCombatantIds: () => _tickCombatantIds,
		_tickCountryToSideMap: () => _tickCountryToSideMap,
		updatePersistentInfluence: () => updatePersistentInfluence,
		isSimulationPhaseDue: () => isSimulationPhaseDue,
		_simulationJobs: () => _simulationJobs,
		stepTerritoryLedger: () => stepTerritoryLedger,
		unitSpatialHash: () => unitSpatialHash,
		UNIT_HASH_CELL_SIZE: () => UNIT_HASH_CELL_SIZE,
		_unitLiveGeneration: () => _unitLiveGeneration,
		frontlineFieldTick: () => frontlineFieldTick,
		FRONTLINE_FIELD_UPDATE_INTERVAL: () => FRONTLINE_FIELD_UPDATE_INTERVAL,
		_frontlinePolyTick: () => _frontlinePolyTick,
		FRONTLINE_POLY_UPDATE_INTERVAL: () => FRONTLINE_POLY_UPDATE_INTERVAL,
		_workerBusy: () => _workerBusy,
		_frontlineWorkerPendingField: () => _frontlineWorkerPendingField,
		_frontlineWorkerPendingLayout: () => _frontlineWorkerPendingLayout,
		_tickUnitsBySide: () => _tickUnitsBySide,
		_tickUnitGridIdx: () => _tickUnitGridIdx,
		_tickCountryToCityCount: () => _tickCountryToCityCount,
		_tickCountryCapitalLost: () => _tickCountryCapitalLost,
		capitalLostCountries: () => capitalLostCountries,
		refreshLiveCombatPower: () => refreshLiveCombatPower,
		_sidePosture: () => _sidePosture,
		evaluateAllPlans: () => evaluateAllPlans,
		updateOperationalAiTaskForces: () => updateOperationalAiTaskForces,
		getArmyMovement: () => getArmyMovement,
		isArmyCellPassable: () => isArmyCellPassable,
		recordPerfMeasure: () => recordPerfMeasure,
		_politicalMapRevision: () => _politicalMapRevision,
		adjacencyCache: () => adjacencyCache,
		_neutralBorderCacheSignature: () => _neutralBorderCacheSignature,
		_neutralBorderPolys: () => _neutralBorderPolys,
		cities: () => cities,
		getEnemyCityCandidatesBySide: () => getEnemyCityCandidatesBySide,
		_tickCitiesBySovereign: () => _tickCitiesBySovereign,
		_tickMetadataById: () => _tickMetadataById,
		aiCountryState: () => aiCountryState,
		getEffectiveBuffState: () => getEffectiveBuffState,
		_sideWarPhase: () => _sideWarPhase,
		getControlValue: () => getControlValue,
		isEnemyTerritory: () => isEnemyTerritory,
		isMyTerritory: () => isMyTerritory,
		myInfluenceAt: () => myInfluenceAt,
		getBorderDirection: () => getBorderDirection,
		_strategicTargetGeneration: () => _strategicTargetGeneration,
		simSpeed: () => simSpeed,
		STRATEGIC_COHORT_COUNT: () => STRATEGIC_COHORT_COUNT,
		CITY_OBJECTIVE_REFRESH_INTERVAL: () => CITY_OBJECTIVE_REFRESH_INTERVAL,
		returnUnitPersonnelToReserve: () => returnUnitPersonnelToReserve,
		normalizeLongitudeDelta: () => normalizeLongitudeDelta,
		warGraceEndTick: () => warGraceEndTick,
		formationDamage: () => formationDamage,
		_battleKey: () => _battleKey,
		unitHashBySide: () => unitHashBySide,
		_neutralGarrisonPlan: () => _neutralGarrisonPlan,
		_coastalDefensePlan: () => _coastalDefensePlan,
		clearUnitStrategicTargets: () => clearUnitStrategicTargets,
		_mopUpOwnedCellCache: () => _mopUpOwnedCellCache,
		selectNearestMopUpCell: () => selectNearestMopUpCell,
		CITY_WATER_CHECK_LIMIT: () => CITY_WATER_CHECK_LIMIT,
		_warPlan: () => _warPlan,
		_navalPlan: () => _navalPlan,
		_navalSupplyPlan: () => _navalSupplyPlan,
		geoDistSq: () => geoDistSq,
		_transportPlan: () => _transportPlan,
		_frontlinePolys: () => _frontlinePolys,
		lastTreatyTime: () => lastTreatyTime,
		_lastCapitulationTick: () => _lastCapitulationTick,
		treatyAlert: () => treatyAlert,
		bombsDisabled: () => bombsDisabled,
		gameTimeDate: () => gameTimeDate,
		gameTimeEnabled: () => gameTimeEnabled,
		_cachedSideUnitCounts: () => _cachedSideUnitCounts,
		_cachedSideSoldierEsts: () => _cachedSideSoldierEsts,
		PERF_TICK_HISTORY_LIMIT: () => PERF_TICK_HISTORY_LIMIT,
		applyLandUnitDamage: () => applyLandUnitDamage,
		flushTerritoryLedger: () => flushTerritoryLedger,
		publishTerritoryLedgerSnapshot: () => publishTerritoryLedgerSnapshot,
		sideSoldiers: () => sideSoldiers,
		rebuildTacticalGrid: () => rebuildTacticalGrid,
		_tacticalGrid: () => _tacticalGrid,
		forEachNeighborCell: () => forEachNeighborCell,
		forEachUnorderedNeighborPair: () => forEachUnorderedNeighborPair,
		dispatchFrontlineWork: () => dispatchFrontlineWork,
		consolidateOverlappingUnits: () => consolidateOverlappingUnits,
		selectAssignedMopUpCountryId: () => selectAssignedMopUpCountryId,
		AI_DESPERATION: () => AI_DESPERATION,
		AI_POSTURE: () => AI_POSTURE,
		countryMetadata: () => countryMetadata,
		_sideMomentumHistory: () => _sideMomentumHistory,
		initialSideSoldiers: () => initialSideSoldiers,
		getKnownEnemyPowerForSide: () => getKnownEnemyPowerForSide,
		_defenderReactionPlan: () => _defenderReactionPlan,
		manualSideManpower: () => manualSideManpower,
		sideRecruitableManpower: () => sideRecruitableManpower,
		soldiersPerUnit: () => soldiersPerUnit,
		AI_MOBILIZATION: () => AI_MOBILIZATION,
		spawnSingleUnit: () => spawnSingleUnit,
		updateGroundFormation: () => updateGroundFormation,
		evaluateCountryCapitulation: () => evaluateCountryCapitulation,
		capitulateCountry: () => capitulateCountry,
		getActiveHostilePairs: () => getActiveHostilePairs,
		evaluateGlobalConflict: () => evaluateGlobalConflict,
		applyTreaty: () => applyTreaty,
		peaceTreatiesDisabled: () => peaceTreatiesDisabled,
		showTreatyOffer: () => showTreatyOffer,
		bombs: () => bombs,
		playExplosionSound: () => playExplosionSound,
		explosions: () => explosions,
		bases: () => bases,
		launchBomb: () => launchBomb,
		getLiveFormationPersonnel: () => getLiveFormationPersonnel,
		importCountrySearch: () => importCountrySearch,
		renderImportCountryCards: () => renderImportCountryCards,
		endTutorial: () => endTutorial,
		tutorialPrevBtn: () => tutorialPrevBtn,
		currentTutorialStep: () => currentTutorialStep,
		updateTutorialUI: () => updateTutorialUI,
		addSideBtn: () => addSideBtn,
		activeSideIndex: () => activeSideIndex,
		rebuildManpowerInputs: () => rebuildManpowerInputs,
		updateSidesUI: () => updateSidesUI,
		ffaToggleBtn: () => ffaToggleBtn,
		ffaMode: () => ffaMode,
		randomWarBtn: () => randomWarBtn,
		randomWarMode: () => randomWarMode,
		updateRandomWarButton: () => updateRandomWarButton,
		triggerRandomWar: () => triggerRandomWar,
		viewModeBtn: () => viewModeBtn,
		viewMode: () => viewMode,
		recalculateAllBounds: () => recalculateAllBounds,
		allianceViewCheckbox: () => allianceViewCheckbox,
		allianceViewEnabled: () => allianceViewEnabled,
		arrowsToggleBtn: () => arrowsToggleBtn,
		battlesToggleBtn: () => battlesToggleBtn,
		showBattleIndicators: () => showBattleIndicators,
		labelsToggleBtn: () => labelsToggleBtn,
		showCountryLabels: () => showCountryLabels,
		countryLabelAnchors: () => countryLabelAnchors,
		citiesToggleBtn: () => citiesToggleBtn,
		showNonCapitalCities: () => showNonCapitalCities,
		warplansToggleBtn: () => warplansToggleBtn,
		showWarPlans: () => showWarPlans,
		setCookie: () => setCookie,
		showWarplansCheckbox: () => showWarplansCheckbox,
		showLabelsCheckbox: () => showLabelsCheckbox,
		showCitiesCheckbox: () => showCitiesCheckbox,
		showBattlesCheckbox: () => showBattlesCheckbox,
		showAllianceCheckbox: () => showAllianceCheckbox,
		noPeaceCheckbox: () => noPeaceCheckbox,
		useSecretSoundsCheckbox: () => useSecretSoundsCheckbox,
		useSecretSounds: () => useSecretSounds,
		setSecretSounds: () => setSecretSounds,
		setupDisableMountainsCheckbox: () => setupDisableMountainsCheckbox,
		mainDisableMountainsCheckbox: () => mainDisableMountainsCheckbox,
		loadTerrain: () => loadTerrain,
		restartScenarioBtn: () => restartScenarioBtn,
		resetGame: () => resetGame,
		resetBtn: () => resetBtn,
		forcePeaceBtn: () => forcePeaceBtn,
		statusText: () => statusText,
		peaceSelection1: () => peaceSelection1,
		updateLoop: () => updateLoop,
		pauseBtn: () => pauseBtn,
		togglePause: () => togglePause,
		speedControls: () => speedControls,
		speedInputs: () => speedInputs,
		currentSpeedIndex: () => currentSpeedIndex,
		SPEED_STEPS: () => SPEED_STEPS,
		setSpeed: () => setSpeed,
		customTrackInput: () => customTrackInput,
		loadingStatus: () => loadingStatus,
		loadingOverlay: () => loadingOverlay,
		setCustomTrack: () => setCustomTrack,
		stopBackgroundMusic: () => stopBackgroundMusic,
		initAudio: () => initAudio,
		clearCustomTrackBtn: () => clearCustomTrackBtn,
		tabScenariosBtn: () => tabScenariosBtn,
		switchHubTab: () => switchHubTab,
		tabCountriesBtn: () => tabCountriesBtn,
		tabFlagsBtn: () => tabFlagsBtn,
		presetLowBtn: () => presetLowBtn,
		settingsController: () => settingsController,
		presetDefaultBtn: () => presetDefaultBtn,
		launchBtn: () => launchBtn,
		primeAudio: () => primeAudio,
		initializeEngine: () => initializeEngine,
		saveSkipCheckbox: () => saveSkipCheckbox,
		settingsOverlay: () => settingsOverlay,
		mainMenu: () => mainMenu,
		mapUi: () => mapUi,
		currentScenarioContext: () => currentScenarioContext,
		gameMode: () => gameMode,
		applyLanguage: () => applyLanguage,
		mainSettingsBtn: () => mainSettingsBtn,
		benchmarkBtn: () => benchmarkBtn,
		startBenchmark: () => startBenchmark,
		benchmarkDismissBtn: () => benchmarkDismissBtn,
		benchmarkResults: () => benchmarkResults,
		isPaused: () => isPaused,
		startTutorial: () => startTutorial,
		conquestTutorialSteps: () => conquestTutorialSteps,
		ingameSettingsBtn: () => ingameSettingsBtn,
		closeSettingsBtn: () => closeSettingsBtn,
		playModeBtn: () => playModeBtn,
		selectScenario: () => selectScenario,
		choiceModernDay: () => choiceModernDay,
		enterScenarioBtn: () => enterScenarioBtn,
		queuedScenarioAction: () => queuedScenarioAction,
		choice1936Scenario: () => choice1936Scenario,
		choiceWW1Scenario: () => choiceWW1Scenario,
		createScenarioHandler: () => createScenarioHandler,
		scenarioMenuDependencies: () => scenarioMenuDependencies,
		cancelConquestChoice: () => cancelConquestChoice,
		conquestChoiceModal: () => conquestChoiceModal,
		closeReleaseModalBtn: () => closeReleaseModalBtn,
		releaseModal: () => releaseModal,
		cancelCreateBtn: () => cancelCreateBtn,
		createCountryModal: () => createCountryModal,
		brushSizeSlider: () => brushSizeSlider,
		brushSize: () => brushSize,
		brushSizeVal: () => brushSizeVal,
		editingCountryId: () => editingCountryId,
		selectingOverlordForId: () => selectingOverlordForId,
		countryInspector: () => countryInspector,
		map: () => map,
		mapSettingsCancelBtn: () => mapSettingsCancelBtn,
		mapSettingsModal: () => mapSettingsModal,
		mapSettingsApplyBtn: () => mapSettingsApplyBtn,
		mapSettingsNameInput: () => mapSettingsNameInput,
		mapSettingsWidthInput: () => mapSettingsWidthInput,
		mapSettingsHeightInput: () => mapSettingsHeightInput,
		mapSettingsMissilesCheckbox: () => mapSettingsMissilesCheckbox,
		worldWidthDeg: () => worldWidthDeg,
		worldHeightDeg: () => worldHeightDeg,
		mapName: () => mapName,
		missilesEnabled: () => missilesEnabled,
		disableBombsCheckbox: () => disableBombsCheckbox,
		getCookie: () => getCookie,
		applyWorldBounds: () => applyWorldBounds,
		customSatelliteUrl: () => customSatelliteUrl,
		customSatelliteImg: () => customSatelliteImg,
		importCountryCancelBtn: () => importCountryCancelBtn,
		importCountryModal: () => importCountryModal,
		leaderboardBtn: () => leaderboardBtn,
		openLeaderboard: () => openLeaderboard,
		closeLeaderboardBtn: () => closeLeaderboardBtn,
		leaderboardOverlay: () => leaderboardOverlay,
		closeHubBtn: () => closeHubBtn,
		closeHub: () => closeHub,
		minimizeSetupBtn: () => minimizeSetupBtn,
		setupPanel: () => setupPanel,
		minimizeStatsBtn: () => minimizeStatsBtn,
		statsPanel: () => statsPanel,
		minimizeStatusBtn: () => minimizeStatusBtn,
		startBtn: () => startBtn,
		startWar: () => startWar,
		quickRestartBtn: () => quickRestartBtn,
		ensurePerfLongTaskObserver: () => ensurePerfLongTaskObserver,
		_perfSamples: () => _perfSamples,
		_perfFrameTimeSum: () => _perfFrameTimeSum,
		_perfFrameCount: () => _perfFrameCount,
		_perfLastTime: () => _perfLastTime,
		_perfPendingFrameEntry: () => _perfPendingFrameEntry,
		getPerfReportData: () => getPerfReportData,
		formatPerfReport: () => formatPerfReport,
		_perfTraceMeasureCount: () => _perfTraceMeasureCount,
		runPerfSuite: () => runPerfSuite,
		formatPerfSuite: () => formatPerfSuite,
		_lastPerfSuite: () => _lastPerfSuite,
		_lastPerfSuiteRuns: () => _lastPerfSuiteRuns,
		perfBaselineStorageKey: () => perfBaselineStorageKey,
		loadPerfBaseline: () => loadPerfBaseline,
		comparePerfSuites: () => comparePerfSuites,
		formatPerfComparison: () => formatPerfComparison,
		cityEditMode: () => cityEditMode,
		editingCityId: () => editingCityId,
		handleCountryClick: () => handleCountryClick,
		getAiOperationsSnapshot: () => getAiOperationsSnapshot,
		invalidateTerritoryLedgerCities: () => invalidateTerritoryLedgerCities,
		cityInspector: () => cityInspector,
		openCityInspector: () => openCityInspector,
		findCityAtLatLng: () => findCityAtLatLng,
		coordsDisplay: () => coordsDisplay,
		isCustomTerrain: () => isCustomTerrain,
		disableCountryGradientCheckbox: () => disableCountryGradientCheckbox,
		disableCountryGradient: () => disableCountryGradient,
		isPainting: () => isPainting,
		lastPaintLatLng: () => lastPaintLatLng,
		paintAt: () => paintAt,
		paintMaskId: () => paintMaskId,
		applyPaintAt: () => applyPaintAt,
		editorUpdateBtn: () => editorUpdateBtn,
		activeScenarioId: () => activeScenarioId,
		setLoadingThematic: () => setLoadingThematic,
		generatePresetData: () => generatePresetData,
		room: () => room,
		shareCountryBtn: () => shareCountryBtn,
		shareCountryNameInput: () => shareCountryNameInput,
		shareCountryDescInput: () => shareCountryDescInput,
		shareCountryModal: () => shareCountryModal,
		shareFlagBtn: () => shareFlagBtn,
		shareFlagNameInput: () => shareFlagNameInput,
		shareFlagDescInput: () => shareFlagDescInput,
		shareFlagModal: () => shareFlagModal,
		cancelShareFlagBtn: () => cancelShareFlagBtn,
		confirmShareFlagBtn: () => confirmShareFlagBtn,
		cancelShareCountryBtn: () => cancelShareCountryBtn,
		confirmShareCountryBtn: () => confirmShareCountryBtn,
		editorSaveBtn: () => editorSaveBtn,
		editorLoadBtn: () => editorLoadBtn,
		performPresetLoad: () => performPresetLoad,
		editorSaveMultiBtn: () => editorSaveMultiBtn,
		selectedCountryIds: () => selectedCountryIds,
		downloadCountriesZip: () => downloadCountriesZip,
		collectCountryCells: () => collectCountryCells,
		getJSZip: () => getJSZip,
		editorSaveAllZipBtn: () => editorSaveAllZipBtn,
		importScenarioSelect: () => importScenarioSelect,
		lastImportScenarioKey: () => lastImportScenarioKey,
		importScenarioBuffer: () => importScenarioBuffer,
		selectedImportCountryId: () => selectedImportCountryId,
		importCountryCardList: () => importCountryCardList,
		loadScenarioForCountryImportFromUrl: () =>
			loadScenarioForCountryImportFromUrl,
		importScenarioFileInput: () => importScenarioFileInput,
		loadScenarioForCountryImportFromBlob: () =>
			loadScenarioForCountryImportFromBlob,
		importCountryConfirmBtn: () => importCountryConfirmBtn,
		importSingleCountryFromScenario: () => importSingleCountryFromScenario,
		editorLoadZipBtn: () => editorLoadZipBtn,
		parseColorToRGBA: () => parseColorToRGBA,
		editorShareBtn: () => editorShareBtn,
		uploadNameInput: () => uploadNameInput,
		uploadDescInput: () => uploadDescInput,
		uploadDetailsModal: () => uploadDetailsModal,
		godBombBtn: () => godBombBtn,
		godBombActive: () => godBombActive,
		godBombSourceId: () => godBombSourceId,
		godModeBtn: () => godModeBtn,
		getTranslation: () => getTranslation,
		editorToolbox: () => editorToolbox,
		editorHubBtn: () => editorHubBtn,
		editorLibraryBtn: () => editorLibraryBtn,
		editorExitBtn: () => editorExitBtn,
		editorTestBtn: () => editorTestBtn,
		editorUnclaimBtn: () => editorUnclaimBtn,
		updateRestartVisibility: () => updateRestartVisibility,
		editorPaintBtn: () => editorPaintBtn,
		editorFillBtn: () => editorFillBtn,
		editorTerrainBtn: () => editorTerrainBtn,
		editorPlaceDivisionBtn: () => editorPlaceDivisionBtn,
		brushControls: () => brushControls,
		terrainControls: () => terrainControls,
		animationFrameId: () => animationFrameId,
		unclaimSelectedCountry: () => unclaimSelectedCountry,
		closeInspectorBtn: () => closeInspectorBtn,
		backgroundTickId: () => backgroundTickId,
		frameAccumulator: () => frameAccumulator,
		tickGameTime: () => tickGameTime,
		performSimulationTick: () => performSimulationTick,
		updateCountryFlag: () => updateCountryFlag,
		scenarioHubModal: () => scenarioHubModal,
		globalChatClose: () => globalChatClose,
		globalChatModal: () => globalChatModal,
		globalChatSend: () => globalChatSend,
		globalChatInput: () => globalChatInput,
		itemCommentSubmit: () => itemCommentSubmit,
		currentCommentItemType: () => currentCommentItemType,
		currentCommentItemId: () => currentCommentItemId,
		itemCommentInput: () => itemCommentInput,
		currentEditingCommentId: () => currentEditingCommentId,
		currentReplyParentId: () => currentReplyParentId,
		itemReplyIndicator: () => itemReplyIndicator,
		itemCancelReplyBtn: () => itemCancelReplyBtn,
		closeItemModalBtn: () => closeItemModalBtn,
		itemCommentModal: () => itemCommentModal,
		commentsUnsubscribe: () => commentsUnsubscribe,
		cancelUploadBtn: () => cancelUploadBtn,
		confirmUploadBtn: () => confirmUploadBtn,
		mapRuntime: () => mapRuntime,
		isPointInFeature: () => isPointInFeature,
		provinceMap: () => provinceMap,
		getProvinceId: () => getProvinceId,
		clearCellInfluence: () => clearCellInfluence,
		activateCountryMidWar: () => activateCountryMidWar,
		editorCreateBtn: () => editorCreateBtn,
		editorMapSettingsBtn: () => editorMapSettingsBtn,
		editorToolsPage1Btn: () => editorToolsPage1Btn,
		updateEditorToolPage: () => updateEditorToolPage,
		editorToolsPage2Btn: () => editorToolsPage2Btn,
		editorToolsPage3Btn: () => editorToolsPage3Btn,
		editorToolsPage4Btn: () => editorToolsPage4Btn,
		editorToolsPage5Btn: () => editorToolsPage5Btn,
		setupOptions: () => setupOptions,
		_attackers: () => _attackers,
		_defenders: () => _defenders,
		openHub: () => openHub,
		saveCountryLocally: () => saveCountryLocally,
		loadCountryFromPC: () => loadCountryFromPC,
		editorImportCountryBtn: () => editorImportCountryBtn,
		openImportCountryModal: () => openImportCountryModal,
		editorFlagLibraryBtn: () => editorFlagLibraryBtn,
		cancelEditorChoice: () => cancelEditorChoice,
		editorChoiceModal: () => editorChoiceModal,
		choiceExternalEditor: () => choiceExternalEditor,
		choiceIngameEditor: () => choiceIngameEditor,
		editorSourceModal: () => editorSourceModal,
		cancelSourceChoice: () => cancelSourceChoice,
		choiceSourceEarth: () => choiceSourceEarth,
		loadCountries: () => loadCountries,
		editorTutorialSteps: () => editorTutorialSteps,
		choiceSourceBlank: () => choiceSourceBlank,
		confirmCreateBtn: () => confirmCreateBtn,
		newCountryNameInput: () => newCountryNameInput,
		newCountryColorInput: () => newCountryColorInput,
		newCountryFlagInput: () => newCountryFlagInput,
		customCountryData: () => customCountryData,
		inspectNameInput: () => inspectNameInput,
		inspectHubFlagBtn: () => inspectHubFlagBtn,
		inspectFetchFlagBtn: () => inspectFetchFlagBtn,
		findCodeByName: () => findCodeByName,
		rawGeoJsonData: () => rawGeoJsonData,
		inspectFlagInput: () => inspectFlagInput,
		inspectColorPicker: () => inspectColorPicker,
		inspectColorSwatch: () => inspectColorSwatch,
		inspectPaintBtn: () => inspectPaintBtn,
		inspectAnnexClickBtn: () => inspectAnnexClickBtn,
		annexCountryBtn: () => annexCountryBtn,
		annexCountryInput: () => annexCountryInput,
		annexFeatureToCountry: () => annexFeatureToCountry,
		addAllyBtn: () => addAllyBtn,
		selectingAllyForId: () => selectingAllyForId,
		clearAlliesBtn: () => clearAlliesBtn,
		markAllianceCacheDirty: () => markAllianceCacheDirty,
		openInspector: () => openInspector,
		allianceFlagInput: () => allianceFlagInput,
		getAllianceRootId: () => getAllianceRootId,
		inspectBuffBtn: () => inspectBuffBtn,
		cycleBuffState: () => cycleBuffState,
		BUFF_METADATA: () => BUFF_METADATA,
		cityNameInput: () => cityNameInput,
		cityOwnerSelect: () => cityOwnerSelect,
		cityCapitalCheckbox: () => cityCapitalCheckbox,
		cityMoveBtn: () => cityMoveBtn,
		cityDeleteBtn: () => cityDeleteBtn,
		cityCloseBtn: () => cityCloseBtn,
		editorCityNewBtn: () => editorCityNewBtn,
		editorCityClearBtn: () => editorCityClearBtn,
		playClickSound: () => playClickSound,
		referenceImageUrl: () => referenceImageUrl,
		referenceOverlay: () => referenceOverlay,
		refScale: () => refScale,
		refOpacity: () => refOpacity,
		updateRefHandles: () => updateRefHandles,
		refAboveCheckbox: () => refAboveCheckbox,
		refAboveTerrain: () => refAboveTerrain,
		clearRefHandles: () => clearRefHandles,
		_aiDebugPlans: () => _aiDebugPlans,
		_aiPlanMemory: () => _aiPlanMemory,
		_benchmarkSuppressAutomaticPuppets: () =>
			_benchmarkSuppressAutomaticPuppets,
		_frontIntelBySide: () => _frontIntelBySide,
		_mopUpDeJureCellCache: () => _mopUpDeJureCellCache,
		_planReassessNeeded: () => _planReassessNeeded,
		_proposalReassessTick: () => _proposalReassessTick,
		_sidePrevControlled: () => _sidePrevControlled,
		_sidePrevPosture: () => _sidePrevPosture,
		_sidePrevStrengthRatio: () => _sidePrevStrengthRatio,
		_warOverviewLastUpdate: () => _warOverviewLastUpdate,
		_warOverviewSides: () => _warOverviewSides,
		activeTutorialSet: () => activeTutorialSet,
		advanceTutorial: () => advanceTutorial,
		allocateLargestRemainderQuotas: () => allocateLargestRemainderQuotas,
		applyBroadSetupPosture: () => applyBroadSetupPosture,
		applyPendingBenchmarkForceOverride: () =>
			applyPendingBenchmarkForceOverride,
		biomeMask: () => biomeMask,
		cacheMopUpCell: () => cacheMopUpCell,
		casualtyByAttacker: () => casualtyByAttacker,
		casualtyPanel: () => casualtyPanel,
		cinematicMode: () => cinematicMode,
		clearSideLandPlanSlots: () => clearSideLandPlanSlots,
		clearUnitCommandAssignments: () => clearUnitCommandAssignments,
		compactVariableStrengthFormationsForSide: () =>
			compactVariableStrengthFormationsForSide,
		countryCasualties: () => countryCasualties,
		createArmyFormation: () => createArmyFormation,
		deepClone: () => deepClone,
		DEFAULT_SIDE_COLORS: () => DEFAULT_SIDE_COLORS,
		disablePuppetsCheckbox: () => disablePuppetsCheckbox,
		formatGameDate: () => formatGameDate,
		gameDateDisplay: () => gameDateDisplay,
		gameTimeAccumulatorMs: () => gameTimeAccumulatorMs,
		generals: () => generals,
		generateProvinces: () => generateProvinces,
		getCountryLivePersonnel: () => getCountryLivePersonnel,
		getSideDisplayName: () => getSideDisplayName,
		initialBiomeMaskSnapshot: () => initialBiomeMaskSnapshot,
		initialCitiesSnapshot: () => initialCitiesSnapshot,
		initialCombatants: () => initialCombatants,
		initialCountryMetadataSnapshot: () => initialCountryMetadataSnapshot,
		initialDeJureMapSnapshot: () => initialDeJureMapSnapshot,
		initializeOperationalAiRuntime: () => initializeOperationalAiRuntime,
		initialLandMaskSnapshot: () => initialLandMaskSnapshot,
		initialProvinceMapSnapshot: () => initialProvinceMapSnapshot,
		initialWorldControlMapSnapshot: () => initialWorldControlMapSnapshot,
		invalidateFrontlineField: () => invalidateFrontlineField,
		invalidateWarLifecycleTimers: () => invalidateWarLifecycleTimers,
		loadingBar: () => loadingBar,
		mediaRecorder: () => mediaRecorder,
		playPeaceSound: () => playPeaceSound,
		playWarAmbiance: () => playWarAmbiance,
		playWarStartSound: () => playWarStartSound,
		rebuildStatsPanel: () => rebuildStatsPanel,
		reconcileOperationalAiLifecycle: () => reconcileOperationalAiLifecycle,
		recordedChunks: () => recordedChunks,
		recruitNeutralMidWar: () => recruitNeutralMidWar,
		releaseCountryPersonnelFromSide: () => releaseCountryPersonnelFromSide,
		removeCountryFormations: () => removeCountryFormations,
		RENDER_LAYERS: () => RENDER_LAYERS,
		reopenConflictSetupAfterWar: () => reopenConflictSetupAfterWar,
		resetOperationalAiRuntime: () => resetOperationalAiRuntime,
		resetSideHostilities: () => resetSideHostilities,
		resetSideInfluenceMaps: () => resetSideInfluenceMaps,
		resetSimulationOptimizationRuntime: () =>
			resetSimulationOptimizationRuntime,
		scheduleCoastalTopologyJob: () => scheduleCoastalTopologyJob,
		scheduleWarLifecycleCallback: () => scheduleWarLifecycleCallback,
		selectEligibleCasualtyAttackers: () => selectEligibleCasualtyAttackers,
		selectMajorityOwnerTransfers: () => selectMajorityOwnerTransfers,
		selectOccupationController: () => selectOccupationController,
		setGameTimeFromInputs: () => setGameTimeFromInputs,
		setUnitFormationPersonnel: () => setUnitFormationPersonnel,
		sideCasualties: () => sideCasualties,
		sideColors: () => sideColors,
		stopWarAmbiance: () => stopWarAmbiance,
		timeDayInput: () => timeDayInput,
		timeMonthInput: () => timeMonthInput,
		timeYearInput: () => timeYearInput,
		treatyMsg: () => treatyMsg,
		tutorialActive: () => tutorialActive,
		unitCountsDiv: () => unitCountsDiv,
		updateFfaSetupUi: () => updateFfaSetupUi,
		updateWarOverview: () => updateWarOverview,
		timeSystemCheckbox: () => timeSystemCheckbox,
		gameTimeDayDurationMs: () => gameTimeDayDurationMs,
		rgbaRe: () => rgbaRe,
		sidesContainer: () => sidesContainer,
		estimateUnitsForCountry: () => estimateUnitsForCountry,
		openReleaseModal: () => openReleaseModal,
		currentUsername: () => currentUsername,
		renderHub: () => renderHub,
		hubCountryCache: () => hubCountryCache,
		libraryList: () => libraryList,
		escapeHtml: () => escapeHtml,
		openItemModal: () => openItemModal,
		hubFlagCache: () => hubFlagCache,
		flagLibraryList: () => flagLibraryList,
		globalChatList: () => globalChatList,
		globalChatUnsubscribe: () => globalChatUnsubscribe,
		initMultiplayer: () => initMultiplayer,
		itemCommentsList: () => itemCommentsList,
		itemModalTitle: () => itemModalTitle,
		itemModalDesc: () => itemModalDesc,
		itemModalActions: () => itemModalActions,
		itemModalPreview: () => itemModalPreview,
		itemModalPlayBtn: () => itemModalPlayBtn,
		itemModalRemixBtn: () => itemModalRemixBtn,
		importScenarioCountriesCache: () => importScenarioCountriesCache,
		refHandles: () => refHandles,
		isInsideWorldBoxLatLng: () => isInsideWorldBoxLatLng,
		allyList: () => allyList,
		unilateralExitConflict: () => unilateralExitConflict,
		recruitNewSideMidWar: () => recruitNewSideMidWar,
		inspectFlagPreview: () => inspectFlagPreview,
		releasableListContainer: () => releasableListContainer,
		generatePuppetFlag: () => generatePuppetFlag,
		rebaseSecondaryWarPlanSlotsForSideAppend: () =>
			rebaseSecondaryWarPlanSlotsForSideAppend,
		ensureSideIdentities: () => ensureSideIdentities,
		rebuildHostilityMatrix: () => rebuildHostilityMatrix,
		hostileSidePairs: () => hostileSidePairs,
		sidePairKey: () => sidePairKey,
		findCountrySideIndex: () => findCountrySideIndex,
		prepareEmptySideForNewMembership: () => prepareEmptySideForNewMembership,
		_benchmarkForcePersonnelPerSide: () => _benchmarkForcePersonnelPerSide,
		_benchmarkRestoreSettings: () => _benchmarkRestoreSettings,
		_benchmarkTimeoutId: () => _benchmarkTimeoutId,
		benchmarkStatsEl: () => benchmarkStatsEl,
		_benchmarkResolve: () => _benchmarkResolve,
		_benchmarkReject: () => _benchmarkReject,
		_benchmarkMetadata: () => _benchmarkMetadata,
		_benchmarkUnitsPerSide: () => _benchmarkUnitsPerSide,
		_isBenchmarking: () => _isBenchmarking,
		_isBenchmarkWarmingUp: () => _isBenchmarkWarmingUp,
		perfOverlay: () => perfOverlay,
		_perfBenchmarkEnd: () => _perfBenchmarkEnd,
		COMPILED_SCENARIO_URLS: () => COMPILED_SCENARIO_URLS,
		PERF_COUNTER_DEFAULTS: () => PERF_COUNTER_DEFAULTS,
		_perfLongTaskObserver: () => _perfLongTaskObserver,
		PERF_LONG_TASK_HISTORY_LIMIT: () => PERF_LONG_TASK_HISTORY_LIMIT,
		PERF_MEMORY_HISTORY_LIMIT: () => PERF_MEMORY_HISTORY_LIMIT,
		mapResSelect: () => mapResSelect,
		PERF_FRAME_HISTORY_LIMIT: () => PERF_FRAME_HISTORY_LIMIT,
		PERF_SPIKE_HISTORY_LIMIT: () => PERF_SPIKE_HISTORY_LIMIT,
		PERF_EXCLUSIVE_PHASES: () => PERF_EXCLUSIVE_PHASES,
		_aiTaskForcesBySide: () => _aiTaskForcesBySide,
		_frontlineWorkerPending: () => _frontlineWorkerPending,
		normalizePerfSuiteCases: () => normalizePerfSuiteCases,
		summarizePerfSuiteRuns: () => summarizePerfSuiteRuns,
		recordPerfMemorySample: () => recordPerfMemorySample,
		_planBfsGeneration: () => _planBfsGeneration,
		_planBfsParent: () => _planBfsParent,
		_planBfsQueue: () => _planBfsQueue,
		_planBfsSeen: () => _planBfsSeen,
		operationalUnitPower: () => operationalUnitPower,
		_aiLastOperationsTick: () => _aiLastOperationsTick,
		_aiOperationsDirty: () => _aiOperationsDirty,
		_aiPendingLandingHandoffs: () => _aiPendingLandingHandoffs,
		_aiTaskForceTransitionById: () => _aiTaskForceTransitionById,
		estimateLocalForces: () => estimateLocalForces,
		findLandPathSummary: () => findLandPathSummary,
		getPlanSignature: () => getPlanSignature,
		getSideStrategyProfile: () => getSideStrategyProfile,
		lngDelta: () => lngDelta,
		requestOperationalAiReassessment: () => requestOperationalAiReassessment,
		_coastalLandIndices: () => _coastalLandIndices,
		_coastalTopologyReady: () => _coastalTopologyReady,
		findNearestSeaIdx: () => findNearestSeaIdx,
		findSeaPathSummary: () => findSeaPathSummary,
		operationalLocalRisk: () => operationalLocalRisk,
		_pendingProposalSides: () => _pendingProposalSides,
		_pendingProposalSideSet: () => _pendingProposalSideSet,
		generateAllProposals: () => generateAllProposals,
		NAVAL_STALL_TICKS: () => NAVAL_STALL_TICKS,
		scoreProposal: () => scoreProposal,
		selectPlans: () => selectPlans,
	},
	{
		primaryOccupierMap: (value) => {
			primaryOccupierMap = value;
		},
		deJureMap: (value) => {
			deJureMap = value;
		},
		_workerBusy: (value) => {
			_workerBusy = value;
		},
		simSpeed: (value) => {
			simSpeed = value;
		},
		currentSpeedIndex: (value) => {
			currentSpeedIndex = value;
		},
		queuedScenarioAction: (value) => {
			queuedScenarioAction = value;
		},
		worldWidthDeg: (value) => {
			worldWidthDeg = value;
		},
		worldHeightDeg: (value) => {
			worldHeightDeg = value;
		},
		rawGeoJsonData: (value) => {
			rawGeoJsonData = value;
		},
		activeTutorialSet: (value) => {
			activeTutorialSet = value;
		},
		biomeMask: (value) => {
			biomeMask = value;
		},
		tutorialActive: (value) => {
			tutorialActive = value;
		},
		_frontlineWorkerPending: (value) => {
			_frontlineWorkerPending = value;
		},
		invisibleBuffsEnabled: (value) => {
			invisibleBuffsEnabled = value;
		},
		sideUids: (value) => {
			sideUids = value;
		},
		_nextSideUid: (value) => {
			_nextSideUid = value;
		},
		hostilityMatrix: (value) => {
			hostilityMatrix = value;
		},
		landMask: (value) => {
			landMask = value;
		},
		_simulationWorldGeneration: (value) => {
			_simulationWorldGeneration = value;
		},
		gridWidth: (value) => {
			gridWidth = value;
		},
		gridHeight: (value) => {
			gridHeight = value;
		},
		_coastalLandIndices: (value) => {
			_coastalLandIndices = value;
		},
		_coastalTopologyReady: (value) => {
			_coastalTopologyReady = value;
		},
		_strategicTargetGeneration: (value) => {
			_strategicTargetGeneration = value;
		},
		_enemyCityCacheGeneration: (value) => {
			_enemyCityCacheGeneration = value;
		},
		_enemyCityCacheSource: (value) => {
			_enemyCityCacheSource = value;
		},
		_enemyCityCandidatesBySide: (value) => {
			_enemyCityCandidatesBySide = value;
		},
		_frontlineWorkerGeneration: (value) => {
			_frontlineWorkerGeneration = value;
		},
		_frontlineTerritoryGeneration: (value) => {
			_frontlineTerritoryGeneration = value;
		},
		_frontlineWorkerPendingField: (value) => {
			_frontlineWorkerPendingField = value;
		},
		_frontlineWorkerPendingLayout: (value) => {
			_frontlineWorkerPendingLayout = value;
		},
		frontlineFieldTick: (value) => {
			frontlineFieldTick = value;
		},
		frontlineDirLat: (value) => {
			frontlineDirLat = value;
		},
		frontlineDirLng: (value) => {
			frontlineDirLng = value;
		},
		provinceMap: (value) => {
			provinceMap = value;
		},
		worldControlMap: (value) => {
			worldControlMap = value;
		},
		_politicalMapRevision: (value) => {
			_politicalMapRevision = value;
		},
		influenceLayer: (value) => {
			influenceLayer = value;
		},
		occupationMap: (value) => {
			occupationMap = value;
		},
		dominantSideMap: (value) => {
			dominantSideMap = value;
		},
		terrainMask: (value) => {
			terrainMask = value;
		},
		_influenceCityGridSource: (value) => {
			_influenceCityGridSource = value;
		},
		_influenceCityGridSourceLength: (value) => {
			_influenceCityGridSourceLength = value;
		},
		_influenceCityGridWorldGeneration: (value) => {
			_influenceCityGridWorldGeneration = value;
		},
		_influenceCoalitionSignature: (value) => {
			_influenceCoalitionSignature = value;
		},
		_influenceFrontierQueued: (value) => {
			_influenceFrontierQueued = value;
		},
		_influenceFrontierWorldGeneration: (value) => {
			_influenceFrontierWorldGeneration = value;
		},
		_influenceFrontierQueue: (value) => {
			_influenceFrontierQueue = value;
		},
		_influenceFrontierCursor: (value) => {
			_influenceFrontierCursor = value;
		},
		_influenceFrontierPriorityQueue: (value) => {
			_influenceFrontierPriorityQueue = value;
		},
		_influenceFrontierPriorityCursor: (value) => {
			_influenceFrontierPriorityCursor = value;
		},
		_territoryLedgerSnapshot: (value) => {
			_territoryLedgerSnapshot = value;
		},
		_cachedP1T: (value) => {
			_cachedP1T = value;
		},
		_cachedP2T: (value) => {
			_cachedP2T = value;
		},
		_cachedSideTerritoryCounts: (value) => {
			_cachedSideTerritoryCounts = value;
		},
		_cachedSideTerritoryPcts: (value) => {
			_cachedSideTerritoryPcts = value;
		},
		_territoryLedgerDecisionTick: (value) => {
			_territoryLedgerDecisionTick = value;
		},
		_territoryLedgerCitiesSource: (value) => {
			_territoryLedgerCitiesSource = value;
		},
		_territoryLedgerCitiesLength: (value) => {
			_territoryLedgerCitiesLength = value;
		},
		_territoryLedgerAppliedCitiesRevision: (value) => {
			_territoryLedgerAppliedCitiesRevision = value;
		},
		_territoryLedgerCitiesRevision: (value) => {
			_territoryLedgerCitiesRevision = value;
		},
		_territoryLedger: (value) => {
			_territoryLedger = value;
		},
		_territoryDecisionPending: (value) => {
			_territoryDecisionPending = value;
		},
		sideInfluenceMaps: (value) => {
			sideInfluenceMaps = value;
		},
		_frontlineLayoutApplyPendingMs: (value) => {
			_frontlineLayoutApplyPendingMs = value;
		},
		_frontlineSlotApplyPendingMs: (value) => {
			_frontlineSlotApplyPendingMs = value;
		},
		_simTickCount: (value) => {
			_simTickCount = value;
		},
		_tickAllCombatants: (value) => {
			_tickAllCombatants = value;
		},
		activeBattles: (value) => {
			activeBattles = value;
		},
		_unitLiveGeneration: (value) => {
			_unitLiveGeneration = value;
		},
		capitalLostCountries: (value) => {
			capitalLostCountries = value;
		},
		_sidePosture: (value) => {
			_sidePosture = value;
		},
		_neutralBorderCacheSignature: (value) => {
			_neutralBorderCacheSignature = value;
		},
		_neutralBorderPolys: (value) => {
			_neutralBorderPolys = value;
		},
		_cachedSideUnitCounts: (value) => {
			_cachedSideUnitCounts = value;
		},
		_cachedSideSoldierEsts: (value) => {
			_cachedSideSoldierEsts = value;
		},
		bombs: (value) => {
			bombs = value;
		},
		currentTutorialStep: (value) => {
			currentTutorialStep = value;
		},
		activeSideIndex: (value) => {
			activeSideIndex = value;
		},
		ffaMode: (value) => {
			ffaMode = value;
		},
		randomWarMode: (value) => {
			randomWarMode = value;
		},
		gameState: (value) => {
			gameState = value;
			simulationClient.syncControls();
		},
		viewMode: (value) => {
			viewMode = value;
		},
		allianceViewEnabled: (value) => {
			allianceViewEnabled = value;
		},
		showBattleIndicators: (value) => {
			showBattleIndicators = value;
		},
		showCountryLabels: (value) => {
			showCountryLabels = value;
		},
		showNonCapitalCities: (value) => {
			showNonCapitalCities = value;
		},
		showWarPlans: (value) => {
			showWarPlans = value;
		},
		peaceTreatiesDisabled: (value) => {
			peaceTreatiesDisabled = value;
		},
		mountainsEnabled: (value) => {
			mountainsEnabled = value;
		},
		peaceSelection1: (value) => {
			peaceSelection1 = value;
		},
		isPaused: (value) => {
			isPaused = value;
			updateSpeedControls();
		},
		brushSize: (value) => {
			brushSize = value;
		},
		selectingOverlordForId: (value) => {
			selectingOverlordForId = value;
		},
		mapName: (value) => {
			mapName = value;
		},
		missilesEnabled: (value) => {
			missilesEnabled = value;
		},
		bombsDisabled: (value) => {
			bombsDisabled = value;
		},
		customSatelliteUrl: (value) => {
			customSatelliteUrl = value;
		},
		customSatelliteImg: (value) => {
			customSatelliteImg = value;
		},
		_perfSamples: (value) => {
			_perfSamples = value;
		},
		_perfFrameTimeSum: (value) => {
			_perfFrameTimeSum = value;
		},
		_perfFrameCount: (value) => {
			_perfFrameCount = value;
		},
		_perfLastTime: (value) => {
			_perfLastTime = value;
		},
		_perfPendingFrameEntry: (value) => {
			_perfPendingFrameEntry = value;
		},
		_perfTraceMeasureCount: (value) => {
			_perfTraceMeasureCount = value;
		},
		cityEditMode: (value) => {
			cityEditMode = value;
		},
		activeTheaterCities: (value) => {
			activeTheaterCities = value;
		},
		disableCountryGradient: (value) => {
			disableCountryGradient = value;
		},
		isPainting: (value) => {
			isPainting = value;
		},
		lastPaintLatLng: (value) => {
			lastPaintLatLng = value;
		},
		paintMaskId: (value) => {
			paintMaskId = value;
		},
		currentScenarioContext: (value) => {
			currentScenarioContext = value;
		},
		lastImportScenarioKey: (value) => {
			lastImportScenarioKey = value;
		},
		importScenarioBuffer: (value) => {
			importScenarioBuffer = value;
		},
		selectedImportCountryId: (value) => {
			selectedImportCountryId = value;
		},
		godBombActive: (value) => {
			godBombActive = value;
		},
		godBombSourceId: (value) => {
			godBombSourceId = value;
		},
		godModeActive: (value) => {
			godModeActive = value;
		},
		preGodModeState: (value) => {
			preGodModeState = value;
		},
		animationFrameId: (value) => {
			animationFrameId = value;
		},
		backgroundTickId: (value) => {
			backgroundTickId = value;
		},
		frameAccumulator: (value) => {
			frameAccumulator = value;
		},
		simFrameCount: (value) => {
			simFrameCount = value;
		},
		activeScenarioId: (value) => {
			activeScenarioId = value;
		},
		currentEditingCommentId: (value) => {
			currentEditingCommentId = value;
		},
		currentReplyParentId: (value) => {
			currentReplyParentId = value;
		},
		commentsUnsubscribe: (value) => {
			commentsUnsubscribe = value;
		},
		editingCountryId: (value) => {
			editingCountryId = value;
		},
		countryMetadata: (value) => {
			countryMetadata = value;
		},
		gameMode: (value) => {
			gameMode = value;
		},
		_attackers: (value) => {
			_attackers = value;
		},
		_defenders: (value) => {
			_defenders = value;
		},
		isCustomTerrain: (value) => {
			isCustomTerrain = value;
		},
		cities: (value) => {
			cities = value;
		},
		customCountryData: (value) => {
			customCountryData = value;
		},
		selectingAllyForId: (value) => {
			selectingAllyForId = value;
		},
		editingCityId: (value) => {
			editingCityId = value;
		},
		referenceImageUrl: (value) => {
			referenceImageUrl = value;
		},
		referenceOverlay: (value) => {
			referenceOverlay = value;
		},
		refScale: (value) => {
			refScale = value;
		},
		refOpacity: (value) => {
			refOpacity = value;
		},
		refAboveTerrain: (value) => {
			refAboveTerrain = value;
		},
		_aiDebugPlans: (value) => {
			_aiDebugPlans = value;
		},
		_frontIntelBySide: (value) => {
			_frontIntelBySide = value;
		},
		_frontlinePolys: (value) => {
			_frontlinePolys = value;
		},
		_frontlinePolyTick: (value) => {
			_frontlinePolyTick = value;
		},
		_lastCapitulationTick: (value) => {
			_lastCapitulationTick = value;
		},
		_sideMomentumHistory: (value) => {
			_sideMomentumHistory = value;
		},
		_sideWarPhase: (value) => {
			_sideWarPhase = value;
		},
		_warOverviewLastUpdate: (value) => {
			_warOverviewLastUpdate = value;
		},
		_warOverviewSides: (value) => {
			_warOverviewSides = value;
		},
		_warPlan: (value) => {
			_warPlan = value;
		},
		adjacencyCache: (value) => {
			adjacencyCache = value;
		},
		bases: (value) => {
			bases = value;
		},
		cinematicMode: (value) => {
			cinematicMode = value;
		},
		explosions: (value) => {
			explosions = value;
		},
		gameTimeAccumulatorMs: (value) => {
			gameTimeAccumulatorMs = value;
		},
		gameTimeEnabled: (value) => {
			gameTimeEnabled = value;
		},
		generals: (value) => {
			generals = value;
		},
		initialBiomeMaskSnapshot: (value) => {
			initialBiomeMaskSnapshot = value;
		},
		initialCitiesSnapshot: (value) => {
			initialCitiesSnapshot = value;
		},
		initialCombatants: (value) => {
			initialCombatants = value;
		},
		initialCountryMetadataSnapshot: (value) => {
			initialCountryMetadataSnapshot = value;
		},
		initialDeJureMapSnapshot: (value) => {
			initialDeJureMapSnapshot = value;
		},
		initialLandMaskSnapshot: (value) => {
			initialLandMaskSnapshot = value;
		},
		initialProvinceMapSnapshot: (value) => {
			initialProvinceMapSnapshot = value;
		},
		initialWorldControlMapSnapshot: (value) => {
			initialWorldControlMapSnapshot = value;
		},
		lastTreatyTime: (value) => {
			lastTreatyTime = value;
		},
		mediaRecorder: (value) => {
			mediaRecorder = value;
		},
		recordedChunks: (value) => {
			recordedChunks = value;
		},
		sideColors: (value) => {
			sideColors = value;
		},
		sides: (value) => {
			sides = value;
		},
		units: (value) => {
			units = value;
		},
		warGraceEndTick: (value) => {
			warGraceEndTick = value;
		},
		gameTimeDate: (value) => {
			gameTimeDate = value;
		},
		room: (value) => {
			room = value;
		},
		currentUsername: (value) => {
			currentUsername = value;
		},
		hubCountryCache: (value) => {
			hubCountryCache = value;
		},
		hubFlagCache: (value) => {
			hubFlagCache = value;
		},
		globalChatUnsubscribe: (value) => {
			globalChatUnsubscribe = value;
		},
		currentCommentItemType: (value) => {
			currentCommentItemType = value;
		},
		currentCommentItemId: (value) => {
			currentCommentItemId = value;
		},
		importScenarioCountriesCache: (value) => {
			importScenarioCountriesCache = value;
		},
		refHandles: (value) => {
			refHandles = value;
		},
		_benchmarkForcePersonnelPerSide: (value) => {
			_benchmarkForcePersonnelPerSide = value;
		},
		_benchmarkSuppressAutomaticPuppets: (value) => {
			_benchmarkSuppressAutomaticPuppets = value;
		},
		_benchmarkRestoreSettings: (value) => {
			_benchmarkRestoreSettings = value;
		},
		_benchmarkTimeoutId: (value) => {
			_benchmarkTimeoutId = value;
		},
		_benchmarkResolve: (value) => {
			_benchmarkResolve = value;
		},
		_benchmarkReject: (value) => {
			_benchmarkReject = value;
		},
		_benchmarkMetadata: (value) => {
			_benchmarkMetadata = value;
		},
		_benchmarkUnitsPerSide: (value) => {
			_benchmarkUnitsPerSide = value;
		},
		_isBenchmarking: (value) => {
			_isBenchmarking = value;
		},
		_isBenchmarkWarmingUp: (value) => {
			_isBenchmarkWarmingUp = value;
		},
		_perfBenchmarkEnd: (value) => {
			_perfBenchmarkEnd = value;
		},
		_perfLongTaskObserver: (value) => {
			_perfLongTaskObserver = value;
		},
		_lastPerfSuiteRuns: (value) => {
			_lastPerfSuiteRuns = value;
		},
		_lastPerfSuite: (value) => {
			_lastPerfSuite = value;
		},
		color: (val) => {
			document.querySelectorAll(".loading-status-text").forEach((el) => {
				el.style.color = val;
			});
		},
		width: (val) => {
			updateLoadingText(undefined, val);
		},
		_planBfsGeneration: (value) => {
			_planBfsGeneration = value;
		},
		_planBfsParent: (value) => {
			_planBfsParent = value;
		},
		_planBfsQueue: (value) => {
			_planBfsQueue = value;
		},
		_planBfsSeen: (value) => {
			_planBfsSeen = value;
		},
		_aiLastOperationsTick: (value) => {
			_aiLastOperationsTick = value;
		},
		_aiOperationsDirty: (value) => {
			_aiOperationsDirty = value;
		},
		_aiTaskForcesBySide: (value) => {
			_aiTaskForcesBySide = value;
		},
	},
);

let _territoryDecisionPending = false;
function resetLocalSimulationClock() {
	localSimulationClock.reset();
}
function editSimulation(mutation) {
	return simulationClient.ownsState
		? simulationClient.edit(mutation)
		: mutation();
}
function onControlCellsChanged(indices) {
	influenceLayer?.notifyControlCellsChanged(indices);
}
function onPoliticalMapChanged() {
	influenceLayer?.invalidate(RENDER_LAYERS.STATIC);
}
function isTreatyNoticeVisible() {
	return treatyAlert.style.display !== "none";
}
function onOperationalAiReset() {
	_warOverviewSides = [];
	_warOverviewLastUpdate = -Infinity;
	const panel = document.getElementById("war-desk");
	if (panel) panel.style.display = "none";
}
const conflictPresentation = createConflictPresentation(applicationRuntime);
const presentationScheduler = createPresentationScheduler();
let unitSpatialMirror = null;
let _lastCombatantsHudAt = Number.NEGATIVE_INFINITY;
let _lastCasualtyHudAt = Number.NEGATIVE_INFINITY;
const localSimulationClock = createSimulationClock(
	() => {
		const ended = performSimulationTick();
		simFrameCount++;
		tickGameTime(1000 / 60 / Math.max(simSpeed, 0.01));
		return !ended;
	},
	{ ...LIVE_SIMULATION_CLOCK_OPTIONS, speed: 1, paused: true },
);
const simulationClient = createSimulationClient(applicationRuntime, {
	onEvent: (type, ...args) => {
		if (type === "showTreatyOffer") showTreatyOffer(...args);
		else if (type === "playExplosionSound") playExplosionSound();
		else if (type === "onPoliticalMapChanged") onPoliticalMapChanged();
		else conflictPresentation[type]?.(...args);
	},
	onSnapshot: ({ fullOwner = false } = {}) => {
		unitSpatialMirror ??= createUnitSpatialMirror(
			unitSpatialHash,
			unitHashBySide,
			UNIT_HASH_CELL_SIZE,
		);
		unitSpatialMirror.update(units, fullOwner);
		influenceLayer?.requestRender(RENDER_LAYERS.DYNAMIC);
		if (gameDateDisplay && gameTimeDate)
			setPresentationText(gameDateDisplay, formatGameDate());
	},
});

import { createSimulationWorld } from "./simulation-world.js";

const {
	applyLandUnitDamage,
	getLiveFormationPersonnel,
	getLiveFormationStrength,
	getOptimizationFactor,
	areSidesHostile,
	consolidateOverlappingUnits,
	refreshLiveCombatPower,
	getKnownEnemyPowerForSide,
	spawnSingleUnit,
	setUnitFormationPersonnel,
	getEnemyCityCandidatesBySide,
	getEffectiveBuffState,
	getControlValue,
	returnUnitPersonnelToReserve,
	stableUnitCohort,
	formationDamage,
	_battleKey,
	clearUnitStrategicTargets,
	geoDistSq,
	lngDelta,
	getActiveHostilePairs,
	launchBomb,
	ensureSideIdentities,
	allocateSideUid,
	requestOperationalAiReassessment,
	findCountrySideIndex,
	generateProvinces,
	getProvinceId,
	notifyPoliticalMapLoaded,
	invalidateFrontlineField,
	sidePairKey,
	createHostilityMatrix,
	clearSideLandPlanSlots,
	clearUnitCommandAssignments,
	scheduleCoastalTopologyJob,
} = createSimulationWorld(applicationRuntime);

export {
	areSidesHostile,
	generateProvinces,
	getControlValue,
	getEffectiveBuffState,
	getOptimizationFactor,
	getProvinceId,
	launchBomb,
	notifyPoliticalMapLoaded,
	spawnSingleUnit,
};

import { createInfluenceRuntime } from "./influence-runtime.js";

const { queueInfluenceFrontierCell, updatePersistentInfluence } =
	createInfluenceRuntime(applicationRuntime);

export { updatePersistentInfluence };

import { createTerritoryRuntime } from "./territory-runtime.js";

const {
	publishTerritoryLedgerSnapshot,
	createRuntimeTerritoryLedger,
	stepTerritoryLedger,
	flushTerritoryLedger,
} = createTerritoryRuntime(applicationRuntime);

import { createSimulationTick } from "./simulation-tick.js";

const { performSimulationTick } = createSimulationTick(applicationRuntime);

export { performSimulationTick };

// Shared live binding bridge. Systems receive commands/state without importing main.js.

import { updateGroundFormation } from "./ground-unit.js";
import { createMenuControls } from "./menu-controls.js";

const menu_controls = createMenuControls(applicationRuntime);

import { createDeveloperControls } from "./developer-controls.js";

const developer_controls = createDeveloperControls(applicationRuntime);

import { createMapInput } from "./map-input.js";

const map_input = createMapInput(applicationRuntime);

import { createEditorFileControls } from "./editor-file-controls.js";

const editor_file_controls = createEditorFileControls(applicationRuntime);

import { createSandboxControls } from "./sandbox-controls.js";

const sandbox_controls = createSandboxControls(applicationRuntime);

import { createSimulationControls } from "./simulation-controls.js";

const simulation_controls = createSimulationControls(applicationRuntime);

import { createCommunityControls } from "./community-controls.js";

const community_controls = createCommunityControls(applicationRuntime);

import { createCountryActions } from "./country-actions.js";

const country_actions = createCountryActions(applicationRuntime);

import { createEditorToolControls } from "./editor-tool-controls.js";

const editor_tool_controls = createEditorToolControls(applicationRuntime);

import { createInspectorControls } from "./inspector-controls.js";

const inspector_controls = createInspectorControls(applicationRuntime);

import { createReferenceControls } from "./reference-controls.js";

const reference_controls = createReferenceControls(applicationRuntime);

import { createConflictDiplomacy } from "./conflict-diplomacy.js";
import { createConflictPersonnel } from "./conflict-personnel.js";
import { createConflictReset } from "./conflict-reset.js";
import { createConflictResolution } from "./conflict-resolution.js";
import { createWarStart } from "./war-start.js";

// Live lifecycle context. Getters avoid stale snapshots when policies replace runtime state.
const lifecycleRuntime = applicationRuntime;
const lifecycle = {
	...createWarStart(lifecycleRuntime),
	...createConflictResolution(lifecycleRuntime),
	...createConflictReset(lifecycleRuntime),
	...createConflictDiplomacy(lifecycleRuntime),
	...createConflictPersonnel(lifecycleRuntime),
};

import { createAiPlanExecutor } from "./ai-plan-execution.js";
import { createAiPlanner } from "./ai-planning.js";
import { createAiProposalPipeline } from "./ai-proposals.js";
import { createAiRuntime } from "./ai-runtime.js";
import { createArmyFormation } from "./army-formation.js";
import { normalizeLongitudeDelta } from "./geographic-math.js";
import { createSimulationCalendar } from "./simulation-calendar.js";

const {
	setGameTimeFromInputs,
	formatGameDate,
	daysInMonth,
	advanceGameDateOneDay,
	tickGameTime,
} = createSimulationCalendar(applicationRuntime);

export {
	advanceGameDateOneDay,
	daysInMonth,
	formatGameDate,
	setGameTimeFromInputs,
	tickGameTime,
};

import { createConflictSetup } from "./conflict-setup.js";

const {
	updateSidesUI,
	updateFfaSetupUi,
	updateRandomWarButton,
	rebuildManpowerInputs,
	resetConflictSetupState,
} = createConflictSetup(applicationRuntime);

export { rebuildManpowerInputs, resetConflictSetupState, updateSidesUI };

import { createCommunityLibrary } from "./community-library.js";

const { initMultiplayer, renderCountryLibrary, renderFlagLibrary } =
	createCommunityLibrary(applicationRuntime);

export { initMultiplayer, renderCountryLibrary, renderFlagLibrary };

import { createCommunityChat } from "./community-chat.js";

const { renderGlobalChatList, _openGlobalChat } =
	createCommunityChat(applicationRuntime);

export { _openGlobalChat, renderGlobalChatList };

import { createCommunityComments } from "./community-comments.js";

const { renderCommentsList, openItemModal } =
	createCommunityComments(applicationRuntime);

export { openItemModal, renderCommentsList };

import { createCountryImportMenu } from "./country-import-menu.js";

const {
	populateImportCountrySelect,
	openImportCountryModal,
	loadCountryFromPC,
} = createCountryImportMenu(applicationRuntime);

export {
	loadCountryFromPC,
	openImportCountryModal,
	populateImportCountrySelect,
};

import { createReferenceOverlay } from "./reference-overlay.js";

const { clearRefHandles, updateRefHandles } =
	createReferenceOverlay(applicationRuntime);

export { clearRefHandles, updateRefHandles };

import { createEditorCommands } from "./editor-commands.js";

const {
	_placeDivisionAt,
	_placeNewCountry,
	_fillAt,
	annexFeatureToCountry,
	spawnRandomNationsAcrossMap,
} = createEditorCommands(applicationRuntime);

export {
	_fillAt,
	_placeDivisionAt,
	_placeNewCountry,
	annexFeatureToCountry,
	spawnRandomNationsAcrossMap,
};

import { createInspectors } from "./inspectors.js";

const { openInspector, refreshCityOwnerSelect, openCityInspector } =
	createInspectors(applicationRuntime);

export { openCityInspector, openInspector, refreshCityOwnerSelect };

import { createCountryDiplomacy } from "./country-diplomacy.js";

const {
	openReleaseModal,
	_setAsReleasable: local_setAsReleasable,
	_setVassalage: local_setVassalage,
	recruitNewSideMidWar: localrecruitNewSideMidWar,
	recruitNeutralMidWar: localrecruitNeutralMidWar,
} = createCountryDiplomacy(applicationRuntime);
const recruitNeutralMidWar = (...args) =>
	editSimulation(() => localrecruitNeutralMidWar(...args));
const recruitNewSideMidWar = (...args) =>
	editSimulation(() => localrecruitNewSideMidWar(...args));
const _setVassalage = (...args) =>
	editSimulation(() => local_setVassalage(...args));
const _setAsReleasable = (...args) =>
	editSimulation(() => local_setAsReleasable(...args));

export {
	_setAsReleasable,
	_setVassalage,
	openReleaseModal,
	recruitNeutralMidWar,
	recruitNewSideMidWar,
};

import { getCookie, setCookie } from "./preferences.js";

export { getCookie, setCookie } from "./preferences.js";

import { applyLanguage, configureLanguageUi, getTranslation } from "./i18n.js";

export { applyLanguage, getTranslation, TRANSLATIONS } from "./i18n.js";

import {
	initAudio,
	playClickSound,
	playExplosionSound,
	playPeaceSound,
	playWarAmbiance,
	playWarStartSound,
	primeAudio,
	setCustomTrack,
	setSecretSounds,
	stopBackgroundMusic,
	stopWarAmbiance,
	useSecretSounds,
	wireAudioControls,
} from "./audio.js";

export {
	audioCtx,
	bgMusicBuffers,
	bgMusicGain,
	bgMusicSource,
	bgMusicUrls,
	clickBuffer,
	clickUrl,
	currentBgTrackIndex,
	customTrackUrl,
	explosionBuffer,
	explosionUrl,
	initAudio,
	isAudioLoading,
	isMuted,
	loadImmediate,
	peaceBuffer,
	peaceUrl,
	playClickSound,
	playExplosionSound,
	playPeaceSound,
	playWarAmbiance,
	playWarStartSound,
	primeAudio,
	secretPeaceDealBuffer,
	secretPeaceDealUrl,
	secretWarDeclaredBuffer,
	secretWarDeclaredUrl,
	stopWarAmbiance,
	useSecretSounds,
	warAmbianceBuffer,
	warAmbianceGain,
	warAmbianceSource,
	warAmbianceUrl,
	warStartBuffer,
	warStartUrl,
} from "./audio.js";

import { createBenchmarkRuntime } from "./benchmark-runtime.js";
import {
	collectCountryCells,
	createCountryExport,
	downloadBlob,
	downloadCountriesZip,
} from "./country-export.js";
import { createScenarioHandler } from "./scenario-menu.js";
import { createSettingsController } from "./settings.js";

const { showBenchmarkResults, startBenchmark } =
	createBenchmarkRuntime(applicationRuntime);

export { startBenchmark };

import { createPerformanceRuntime } from "./performance-runtime.js";

const {
	createPerfState,
	ensurePerfLongTaskObserver,
	recordPerfMemorySample,
	recordPerfMeasure,
} = createPerformanceRuntime(applicationRuntime);

import { createPerformanceReports } from "./performance-reports.js";

const {
	getPerfReportData,
	formatPerfReport,
	formatPerfSuite,
	formatPerfComparison,
	runPerfSuite,
	loadPerfBaseline,
	finalizePendingPerfFrame,
	queuePerfFrame,
} = createPerformanceReports(applicationRuntime);

import { CONFIG } from "./config.js";
import {
	chooseFormationBudget,
	distributeFormationPersonnel,
	getFormationPersonnel,
	getFormationStrengthMultiplier,
} from "./formation-strength.js";
import { fetchJSONWithCache } from "./geo.js";
import mapRuntime from "./map-runtime.ts";
import {
	cacheMopUpCell,
	selectAssignedMopUpCountryId,
	selectNearestMopUpCell,
} from "./mop-up.js";

import {
	comparePerfSuites,
	normalizePerfSuiteCases,
	perfBaselineStorageKey,
	summarizePerfSuiteRuns,
} from "./performance-profiler.js";
import { COMPILED_SCENARIO_URLS } from "./scenario-codec.js";
import {
	createDeterministicJob,
	createDeterministicJobQueue,
} from "./simulation-jobs.js";
import { isSimulationPhaseDue } from "./simulation-phase-wheel.js";
import {
	allocateLargestRemainderQuotas,
	evaluateCountryCapitulation,
	evaluateGlobalConflict,
	selectEligibleCasualtyAttackers,
	selectMajorityOwnerTransfers,
	selectOccupationController,
} from "./surrender.js";
import {
	createTacticalGrid,
	forEachNeighborCell,
	forEachUnorderedNeighborPair,
	rebuildTacticalGrid,
} from "./tactical-grid.js";
import {
	createTerritoryLedger,
	getCountryLedger,
	getSideLedger,
} from "./territory-ledger.js";
import { initWarOverview, renderWarOverview } from "./war-overview.js";

let _jsZipPromise = null;
async function getJSZip() {
	_jsZipPromise ||= import("jszip").then((module) => module.default);
	return _jsZipPromise;
}

export function escapeHtml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * TRANSLATION SYSTEM (i18n)
 */

/**
 * HELPERS
 */

const _colorCanvas = document.createElement("canvas");
_colorCanvas.width = 1;
_colorCanvas.height = 1;
const _colorCtx = _colorCanvas.getContext("2d");

export function parseColorToRGBA(c) {
	if (!c) return [150, 150, 150, 1.0];
	_colorCtx.fillStyle = c;
	_colorCtx.fillRect(0, 0, 1, 1);
	const data = _colorCtx.getImageData(0, 0, 1, 1).data;
	return [data[0], data[1], data[2], data[3] / 255];
}

/**
 * Updates a country's flag across all data structures and UI components.
 */

export function getFlagUrl(code, name) {
	if (!code || code === "-99") {
		code = findCodeByName(name);
	}
	if (!code || code === "-99") return null;
	return `https://flagcdn.com/w320/${code.toLowerCase()}.webp`;
}

// biome-ignore lint/complexity/useRegexLiterals: regex literal contains )$ which confuses some parsers
export const rgbaRe = new RegExp("[\\d.]+\\)$", "g");

/**
 * Ensure we have a drawable flag image object for a country metadata entry.
 * This prefers any existing tempFlag, otherwise tries to load from flagUrl.
 */
export function ensureFlagImage(meta) {
	return new Promise((resolve) => {
		if (!meta) return resolve(null);

		// If we already have a canvas or image ready, use it
		if (
			meta.tempFlag &&
			(meta.tempFlag.complete === undefined || meta.tempFlag.complete)
		) {
			return resolve(meta.tempFlag);
		}

		if (!meta.flagUrl) return resolve(null);

		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			meta.tempFlag = img;
			resolve(img);
		};
		img.onerror = () => resolve(null);
		img.src = meta.flagUrl;
	});
}

/**
 * Generate a dynamic puppet flag: left half = puppet, right half = overlord.
 * This is only used for vassalages created after the game has started.
 */
export async function generatePuppetFlag(puppetId, overlordId) {
	if (!puppetId || !overlordId) return;
	const puppetMeta = countryMetadata[puppetId - 1];
	const overlordMeta = countryMetadata[overlordId - 1];
	if (!puppetMeta || !overlordMeta) return;

	const puppetImg = await ensureFlagImage(puppetMeta);
	const overlordImg = await ensureFlagImage(overlordMeta);
	if (!puppetImg || !overlordImg) return;

	// Create composite canvas
	const width = 160;
	const height = 100;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");

	// Base background
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);

	// Draw puppet flag covering the whole flag area
	ctx.drawImage(
		puppetImg,
		0,
		0,
		puppetImg.naturalWidth || puppetImg.width,
		puppetImg.naturalHeight || puppetImg.height,
		0,
		0,
		width,
		height,
	);

	// Draw overlord flag as a canton in the top‑left corner
	const cantonWidth = Math.floor(width * 0.35);
	const cantonHeight = Math.floor(height * 0.45);

	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, cantonWidth, cantonHeight);
	ctx.clip();

	ctx.drawImage(
		overlordImg,
		0,
		0,
		overlordImg.naturalWidth || overlordImg.width,
		overlordImg.naturalHeight || overlordImg.height,
		0,
		0,
		cantonWidth,
		cantonHeight,
	);
	ctx.restore();

	// Border around the canton
	ctx.strokeStyle = "rgba(0,0,0,0.85)";
	ctx.lineWidth = 2;
	ctx.strokeRect(0.5, 0.5, cantonWidth - 1, cantonHeight - 1);

	// Slight border around whole flag
	ctx.strokeStyle = "rgba(0,0,0,0.7)";
	ctx.lineWidth = 2;
	ctx.strokeRect(0, 0, width, height);

	// Use the canvas as the in‑memory flag immediately so units render correctly
	puppetMeta.tempFlag = canvas;
	sides.flat().forEach((c) => {
		if (c && c.id === puppetId) {
			c.flag = canvas;
		}
	});

	// Export as a data:image URL so all UI elements can use it without uploading
	try {
		const dataUrl = canvas.toDataURL("image/png");
		updateCountryFlag(puppetId, dataUrl);
	} catch (e) {
		console.warn("Failed to generate data URL for puppet flag", e);
	}

	// Force a re-render so the new flag is visible on map and in UI
	if (influenceLayer) influenceLayer.render();
}

/**
 * CONFIGURATION & STATE
 */
export const BUFF_STATES = [
	"crippled",
	"weakened",
	"none",
	"buff",
	"super",
	"godly",
];
export const BUFF_METADATA = {
	crippled: {
		label: "MAJOR PENALTY",
		color: "#7b241c",
		textColor: "#fff",
		class: "crippled-active",
	},
	weakened: {
		label: "MINOR PENALTY",
		color: "#a04000",
		textColor: "#fff",
		class: "weakened-active",
	},
	none: { label: "NONE", color: "#444", textColor: "#fff", class: "" },
	buff: {
		label: "SMALL BUFF",
		color: "#f1c40f",
		textColor: "#000",
		class: "active",
	},
	super: {
		label: "MEDIUM BUFF",
		color: "#9b59b6",
		textColor: "#fff",
		class: "super-active",
	},
	godly: {
		label: "LARGE BUFF",
		color: "#ffffff",
		textColor: "#000",
		class: "godly-active",
	},
};

/**
 * Returns the buff state that should actually affect combat:
 * - If invisible buffs are enabled and a hidden buff exists (not 'none'), it overrides the visible buff.
 * - Otherwise, falls back to the visible buff or 'none'.
 */

/**
 * Cycle a buff state forwards (direction = 1) or backwards (direction = -1).
 */
export function cycleBuffState(current, direction) {
	if (!BUFF_STATES.length) return "none";
	const dir = direction === -1 ? -1 : 1;
	const idx = BUFF_STATES.indexOf(current);
	const baseIndex = idx === -1 ? 0 : idx;
	const nextIndex = (baseIndex + dir + BUFF_STATES.length) % BUFF_STATES.length;
	return BUFF_STATES[nextIndex];
}

export let gameState = "MAIN_MENU";
export let gameMode = "CONQUEST"; // 'CONQUEST', 'EDITOR', or 'EDITOR_TEST'
export let mapName = "Untitled Map";
export let worldWidthDeg = 360;
export let worldHeightDeg = 180;
export let missilesEnabled = true;
export let gameTimeEnabled = false;
export let gameTimeDate = null; // {year, month, day}
export let gameTimeAccumulatorMs = 0;
export const gameTimeDayDurationMs = 500;

export let viewMode = "POLITICAL"; // 'POLITICAL' or 'FLAG'
export let allianceViewEnabled = false; // when true, alliances override colors/flags in political/flag views
export let showCountryLabels = true;
export let showNonCapitalCities = true;
// Cache for screen-space label curves so they don't move with the camera
export const countryLabelAnchors = new Map(); // key: `${countryId}:${regionIndex}` -> { name, points, fontSize }
export let showBattleIndicators = true;
export let showWarPlans = true;
export let showArmyDiagnostics = false;
// Side leaders used to coordinate strong plans.
export let generals = [];
export const DEFAULT_SIDE_COLORS = [
	"rgba(255, 50, 50, 0.5)",
	"rgba(50, 100, 255, 0.5)",
	"rgba(255, 200, 0, 0.5)",
	"rgba(0, 200, 100, 0.5)",
	"rgba(180, 50, 220, 0.5)",
	"rgba(255, 130, 0, 0.5)",
	"rgba(0, 210, 210, 0.5)",
	"rgba(200, 200, 200, 0.5)",
];
export const MAX_SIDES = 8;
export let sides = [[], []];
let _attackers = sides[0];
let _defenders = sides[1];
export let activeSideIndex = 0;
export let activeScenarioId = null;
export let ffaMode = false;
export let randomWarMode = false;
export let adjacencyCache = null;

export let sideColors = [...DEFAULT_SIDE_COLORS];
export let lastSelectionTime = 0;
export let lastSelectedId = -1;
export const sideSoldiers = new Float64Array(MAX_SIDES);
export const initialSideSoldiers = new Float64Array(MAX_SIDES);
// Uncommitted personnel available for new formations. `sideSoldiers` remains
// total surviving personnel for the HUD, reports, and war-phase calculations.
export const sideRecruitableManpower = new Float64Array(MAX_SIDES);
export const soldiersPerUnit = new Float64Array(MAX_SIDES).fill(
	CONFIG.UNIT_TO_SOLDIER_RATIO,
);
export const manualSideManpower = new Array(MAX_SIDES).fill(null);
export let units = [];
export let activeBattles = [];
export const _battleHash = new Map(); // spatial hash: gridKey -> battle object reference

export let capitalLostCountries = new Set();
export let bombs = [];
export let explosions = [];
export let bases = [];
export let cities = [];
export let activeTheaterCities = [];

export let influenceLayer = null;
export let rawGeoJsonData = null;
export let customCountryData = {
	name: "",
	color: "",
	flagUrl: null,
};
export let editingCountryId = -1;
export let editingCityId = -1;
export const selectedCountryIds = new Set();
export let selectingOverlordForId = -1;
export let selectingAllyForId = -1;
export let peaceSelection1 = null;
export let isPainting = false;
export let lastPaintLatLng = null;
export let brushSize = 0.5;
export let isCustomTerrain = false;
export let cinematicMode = false;
export let mediaRecorder = null;
export let recordedChunks = [];

// Overlay System State
export let customSatelliteUrl = null;
export let customSatelliteImg = null;
export let referenceImageUrl = null;
export let referenceOverlay = null; // Native reference image
export let refHandles = []; // Native reference handles
export let refOpacity = 0.5;
export let refScale = 1.0;
export let refAboveTerrain = false;
export let paintMaskId = -1; // -1 means no mask, >= 0 restricts painting to that ID
export let peaceTreatiesDisabled = false;
export let bombsDisabled = false;

export let sideUids = [];
export const hostileSidePairs = new Set();
export let hostilityMatrix = new Uint8Array(MAX_SIDES * MAX_SIDES);
let _nextSideUid = 1;
export let mountainsEnabled = true;
export let showUnitsVisually = true;
export let hideCurvedLabels = false;
export let disableCountryGradient = false;
// When false, hiddenBuffState is ignored and only visible buffState is used.
export let invisibleBuffsEnabled =
	getCookie("mw_disable_invis_buffs") !== "true";
export let cityEditMode = null; // 'CREATE' | 'MOVE' | null
export let animationFrameId = null;
export let backgroundTickId = null;
export let simFrameCount = 0;
let _simTickCount = 0; // per-simulation-tick counter (unlike simFrameCount which is per-visual-frame)

let warGraceEndTick = 0;
export let simSpeed = 3.0;
let _perfLastTime = 0;
let _perfFrameTimeSum = 0;
let _perfFrameCount = 0;
let _isBenchmarking = false;
let _isBenchmarkWarmingUp = false;
let _perfBenchmarkEnd = 0;
let _perfSamples = [];
let _benchmarkUnitsPerSide = null;
let _benchmarkForcePersonnelPerSide = null;
let _benchmarkResolve = null;
let _benchmarkReject = null;
let _benchmarkMetadata = null;
let _benchmarkTimeoutId = null;
let _benchmarkRestoreSettings = null;
let _benchmarkSuppressAutomaticPuppets = false;
let _perfPendingFrameEntry = null;
let _perfLongTaskObserver = null;
let _lastPerfSuite = null;
let _lastPerfSuiteRuns = [];
let _perfTraceMeasureCount = 0;
export let _cachedP1T = 0,
	_cachedP2T = 0;
const _simulationJobs = createDeterministicJobQueue({
	itemBudget: 160_000,
	maxItemsPerJobTurn: 80_000,
});

let _simulationWorldGeneration = 0;
let _territoryLedger = null;
let _territoryLedgerSnapshot = null;
let _territoryLedgerDecisionTick = Number.NEGATIVE_INFINITY;
let _territoryLedgerCitiesSource = null;
let _territoryLedgerCitiesLength = -1;
let _territoryLedgerCitiesRevision = 0;
let _territoryLedgerAppliedCitiesRevision = -1;
let _coastalTopologyReady = false;
let _coastalLandIndices = [];
const _frameSimulationCommitFlags = new Set();

const _pendingProposalSides = [];
const _pendingProposalSideSet = new Set();

export let _cachedSoldierEls = [];
export let _cachedSideUnitCounts = [];
export let _cachedSideSoldierEsts = [];
export let _cachedSideTerritoryCounts = [];
export let _cachedSideTerritoryPcts = [];
export let _cachedCityEls = [];
export let _cachedUnitCountSpans = [];
export let _cachedTerritoryCtrlEls = [];
export let _cachedMomentumEls = [];
export let _cachedTerritorySegEls = [];

const PHASE_CONFIG = {
	ADVANCING: { color: "#2ecc71", symbol: "▲" },
	STALEMATE: { color: "#f39c12", symbol: "◆" },
	RETREATING: { color: "#e74c3c", symbol: "▼" },
	COLLAPSING: { color: "#c0392b", symbol: "✗" },
};

export function rebuildHostilityMatrix() {
	ensureSideIdentities();
	hostilityMatrix = createHostilityMatrix(
		sides.length,
		hostileSidePairs,
		sideUids,
		MAX_SIDES,
	);
	_frontlinePolys = {};
	invalidateFrontlineField();
	for (const u of units) {
		if (
			u._cachedTarget &&
			!areSidesHostile(u.sideIndex, u._cachedTarget.sideIndex)
		) {
			u._cachedTarget = null;
		}
	}
	reconcileOperationalAiLifecycle("hostility-matrix");
	return hostilityMatrix;
}

export function resetSideHostilities() {
	ensureSideIdentities(true);
	for (let a = 0; a < sides.length; a++) {
		if (!sides[a]?.length) continue;
		for (let b = a + 1; b < sides.length; b++) {
			if (!sides[b]?.length) continue;
			hostileSidePairs.add(sidePairKey(sideUids[a], sideUids[b]));
		}
	}
	rebuildHostilityMatrix();
}

export function setSidesHostile(sideA, sideB, hostile = true) {
	ensureSideIdentities();
	const uidA = sideUids[sideA];
	const uidB = sideUids[sideB];
	if (!uidA || !uidB || sideA === sideB) return false;
	const key = sidePairKey(uidA, uidB);
	if (hostile) hostileSidePairs.add(key);
	else hostileSidePairs.delete(key);
	rebuildHostilityMatrix();
	return true;
}

function compactVariableStrengthFormationsForSide(
	sideIdx,
	targetPersonnel = null,
) {
	const formations = units.filter(
		(unit) => unit.sideIndex === sideIdx && unit.kind === "army",
	);
	if (formations.length === 0) return 0;
	const existingPersonnel = formations.reduce(
		(sum, unit) => sum + getLiveFormationPersonnel(unit),
		0,
	);
	const totalPersonnel = Math.max(
		formations.length,
		Math.round(targetPersonnel ?? existingPersonnel),
	);
	const budget = Math.min(
		formations.length,
		chooseFormationBudget(totalPersonnel),
	);
	if (budget >= formations.length) {
		const descriptors = distributeFormationPersonnel(
			totalPersonnel,
			formations.length,
			{ nominalPersonnel: CONFIG.UNIT_TO_SOLDIER_RATIO },
		);
		for (let index = 0; index < formations.length; index++) {
			setUnitFormationPersonnel(
				formations[index],
				descriptors[index].personnel,
			);
		}
		soldiersPerUnit[sideIdx] = CONFIG.UNIT_TO_SOLDIER_RATIO;
		return formations.length;
	}

	const countryGroups = new Map();
	for (const formation of formations) {
		let group = countryGroups.get(formation.sovereignId);
		if (!group) {
			group = [];
			countryGroups.set(formation.sovereignId, group);
		}
		group.push(formation);
	}
	const groups = [...countryGroups.entries()].sort(
		([leftId], [rightId]) => Number(leftId) - Number(rightId),
	);
	const minimumMarkers = Math.min(budget, groups.length);
	const markerRemainder = Math.max(0, budget - minimumMarkers);
	const markerQuotas = allocateLargestRemainderQuotas(
		groups.map(([countryId, group]) => ({
			countryId,
			weight: group.length,
		})),
		markerRemainder,
	);
	const markerQuotaByCountry = new Map(
		markerQuotas.map((entry) => [entry.countryId, entry.quota]),
	);
	for (let index = 0; index < minimumMarkers; index++) {
		const countryId = Number(groups[index][0]);
		markerQuotaByCountry.set(
			countryId,
			(markerQuotaByCountry.get(countryId) || 0) + 1,
		);
	}
	const personnelQuotas = allocateLargestRemainderQuotas(
		groups.map(([countryId, group]) => ({
			countryId,
			weight: group.length,
		})),
		totalPersonnel,
	);
	const personnelByCountry = new Map(
		personnelQuotas.map((entry) => [entry.countryId, entry.quota]),
	);
	const retained = new Set();
	for (const [rawCountryId, group] of groups) {
		const countryId = Number(rawCountryId);
		const quota = Math.min(
			group.length,
			markerQuotaByCountry.get(countryId) || 0,
		);
		if (quota <= 0) continue;
		const descriptors = distributeFormationPersonnel(
			personnelByCountry.get(countryId) || quota,
			quota,
			{ nominalPersonnel: CONFIG.UNIT_TO_SOLDIER_RATIO },
		);
		for (let markerIndex = 0; markerIndex < quota; markerIndex++) {
			const sourceIndex = Math.min(
				group.length - 1,
				Math.floor((markerIndex * group.length) / quota),
			);
			const survivor = group[sourceIndex];
			setUnitFormationPersonnel(survivor, descriptors[markerIndex].personnel);
			retained.add(survivor);
		}
	}
	units = units.filter(
		(unit) =>
			unit.sideIndex !== sideIdx || unit.kind !== "army" || retained.has(unit),
	);
	soldiersPerUnit[sideIdx] = CONFIG.UNIT_TO_SOLDIER_RATIO;
	return retained.size;
}

function applyPendingBenchmarkForceOverride() {
	const target = _benchmarkForcePersonnelPerSide;
	if (!Number.isFinite(target) || target <= 0) return;
	for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
		manualSideManpower[sideIndex] = target;
		compactVariableStrengthFormationsForSide(sideIndex, Math.round(target));
	}
	for (const unit of units) unit.deployTicks = 0;
	_benchmarkForcePersonnelPerSide = null;
}

function resetSimulationOptimizationRuntime() {
	_simulationWorldGeneration++;
	_simulationJobs.clear("world-reset");

	soldiersPerUnit.fill(CONFIG.UNIT_TO_SOLDIER_RATIO);
	_territoryLedgerSnapshot = null;
	_territoryLedgerDecisionTick = Number.NEGATIVE_INFINITY;
	_territoryLedgerCitiesSource = null;
	_territoryLedgerCitiesLength = -1;
	_territoryLedgerAppliedCitiesRevision = -1;
	_coastalTopologyReady = false;
	_coastalLandIndices = [];
	_pendingProposalSides.length = 0;
	_pendingProposalSideSet.clear();

	_territoryLedger = createRuntimeTerritoryLedger();
	_frameSimulationCommitFlags.clear();
	presentationScheduler.reset();
	unitSpatialMirror?.reset();
	_lastCombatantsHudAt = Number.NEGATIVE_INFINITY;
	_lastCasualtyHudAt = Number.NEGATIVE_INFINITY;
}

function resetOperationalAiRuntime() {
	window.__mwAiOperationReveal = null;
	_aiTaskForcesBySide = new Map();
	_aiTaskForceTransitionById.clear();
	_aiPendingLandingHandoffs.clear();
	_aiLastOperationsTick = Number.NEGATIVE_INFINITY;
	_aiOperationsDirty = true;
	for (const unit of units) {
		unit._taskForceUid = null;
		unit._taskForceRole = null;
		unit._taskForceOrder = null;
	}
}

export let _casualtyStructureKey = "";
export let _casualtyValueEls = {};
export let _casualtySideMpEls = {};
export let isPaused = false;
export let frameAccumulator = 0;
export let lastTreatyTime = 0;
export const sideCasualties = new Float64Array(MAX_SIDES);
export const countryCasualties = new Map();
export const casualtyByAttacker = new Map(); // Map<victimCountryId, Map<attackerSovereignId, loss>>
export let initialCombatants = []; // Tracks nations that started the war for stable casualty menu display
export let room = null;
export let currentUsername = null;
export let flagCodes = null;

export let currentScenarioContext = null; // { id, name, ownerUsername }

export let hubReturnState = null;
export let hubWasInEditor = false;
export let godModeActive = false;
export let godBombActive = false;
export let godBombSourceId = -1;
export let buffedSideIdx;
export let preGodModeState = "SIMULATING";
export const latestCountryStats = new Map();
export let disableFullscreen = true;

let _warOverviewSides = [];
let _warOverviewLastUpdate = -Infinity;
const _liveSideCombatPower = new Float64Array(MAX_SIDES);

let _warLifecycleToken = 0;
const _warLifecycleTimers = new Set();

function invalidateWarLifecycleTimers() {
	_warLifecycleToken++;
	for (const timer of _warLifecycleTimers) clearTimeout(timer);
	_warLifecycleTimers.clear();
	return _warLifecycleToken;
}

function scheduleWarLifecycleCallback(
	callback,
	delay,
	token = _warLifecycleToken,
) {
	const timer = setTimeout(() => {
		_warLifecycleTimers.delete(timer);
		if (token !== _warLifecycleToken) return;
		callback();
	}, delay);
	_warLifecycleTimers.add(timer);
	return timer;
}

const PERF_TICK_HISTORY_LIMIT = 4096;
const PERF_FRAME_HISTORY_LIMIT = 4096;
const PERF_SPIKE_HISTORY_LIMIT = 200;
const PERF_LONG_TASK_HISTORY_LIMIT = 200;
const PERF_MEMORY_HISTORY_LIMIT = 240;
const PERF_EXCLUSIVE_PHASES = [
	"prePlans",
	"plans",
	"neutralBorder",
	"recruit",
	"unitLoop",
	"post",
];

// ── Global perf profiler init (once at module load, before any tick code runs) ──
window.__perf = createPerfState();

// High-performance spatial cache for unit culling and combat
export const unitSpatialHash = new Map();
// Per-side spatial buckets for combat scans (Phase 1+); renderer uses unitSpatialHash only
export const unitHashBySide = Array.from(
	{ length: MAX_SIDES },
	() => new Map(),
);
export const UNIT_HASH_CELL_SIZE = 2.5; // Degrees per spatial bucket

// Phase 2.1: Persistent tick caches (reused via .clear() to reduce GC pressure)
const _tickCombatantIds = new Set();
const _tickCountryToSideMap = new Map();
const _tickCountryToCityCount = new Map();
const _tickCountryCapitalLost = new Map();
const _tickCitiesBySovereign = new Map();
const _tickMetadataById = new Map();
const _tickCountryById = new Map();
const _tickCityGridIndexSet = new Set();
const _tickSideAllyIdSets = [];
const _tickSideSupportIdSets = [];
const _influenceActiveSideIndices = [];
const _influenceHostileSideIndices = Array.from(
	{ length: MAX_SIDES },
	() => [],
);
const _influenceNeighborCountryIds = new Int32Array(8);
const _influenceNeighborCountryCounts = new Uint8Array(8);
const _influenceNeighborDx = new Int8Array([0, 0, 1, -1, 1, 1, -1, -1]);
const _influenceNeighborDy = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);
let _influenceCityGridSource = null;
let _influenceCityGridSourceLength = -1;
let _influenceCityGridWorldGeneration = -1;
let _influenceCoalitionSignature = "";
let _influenceFrontierQueued = new Uint8Array(0);
let _influenceFrontierQueue = [];
let _influenceFrontierCursor = 0;
let _influenceFrontierPriorityQueue = [];
let _influenceFrontierPriorityCursor = 0;
let _influenceFrontierWorldGeneration = -1;
const INFLUENCE_FRONTIER_BACKLOG_LIMIT = 16_384;
const INFLUENCE_FRONTIER_PRIORITY_LIMIT = 8_192;
export const _tickUnitsBySide = [];
const _tickUnitGridIdx = new Map();
let _tickAllCombatants = [];
let _unitLiveGeneration = 0;
const _tacticalGrid = createTacticalGrid({ cellSize: 0.6 });
let _planBfsSeen = new Uint32Array(0);
let _planBfsParent = new Int32Array(0);
let _planBfsQueue = new Int32Array(0);
let _planBfsGeneration = 0;
const STRATEGIC_COHORT_COUNT = 4;
const CITY_CANDIDATE_CACHE_LIMIT = 32;
const CITY_WATER_CHECK_LIMIT = 4;
const CITY_OBJECTIVE_REFRESH_INTERVAL = 12;
let _strategicTargetGeneration = 0;
let _enemyCityCacheGeneration = -1;
let _enemyCityCacheSource = null;
let _enemyCityCandidatesBySide = [];
const _mopUpOwnedCellCache = new Map();
const _mopUpDeJureCellCache = new Map();

// Temporary diagnostics for cross-war state/capitulation bugs.
export const aiCountryState = new Map();
export let _sidePosture = []; // per-side auto posture (OFFENSIVE/BALANCED/DEFENSIVE)
export let _sideMomentumHistory = []; // per-side: array of {tick, controlled} entries
export let _sideWarPhase = []; // per-side: "ADVANCING" | "STALEMATE" | "RETREATING" | "COLLAPSING"
let _lastCapitulationTick = Number.NEGATIVE_INFINITY;
export let _warPlan = []; // per-side war plan: { type, phase, target, ... }
export const _navalPlan = []; // per-side naval invasion plan (1 per side max)
export const _navalSupplyPlan = []; // per-side naval supply run plan (1 per side max)
export const _transportPlan = []; // per-side transport plan (1 per side max)
export const _coastalDefensePlan = []; // per-side coastal defense passive overlay
export const _neutralGarrisonPlan = []; // per-side neutral border garrison plans
// victimId -> occupation suppression plan
export const _defenderReactionPlan = []; // per-side emergency DEFEND at enemy naval beachhead
export let _frontIntelBySide = []; // per-side tactical front/theater summaries
export const _aiPlanMemory = new Map(); // key: side:type:target -> recent plan outcome data
export let _aiDebugPlans = []; // per-side diagnostics for the war plan overlay/console
// stable side UID -> observer-scoped contact state
export let _aiTaskForcesBySide = new Map(); // stable side UID -> coalition task-force list

const _aiTaskForceTransitionById = new Map();

const _aiPendingLandingHandoffs = new Map();
let _aiLastOperationsTick = Number.NEGATIVE_INFINITY;
let _aiOperationsDirty = true;

const _proposalReassessTick = []; // per-side last reassessment tick
// per-side cached scored proposals
const _planReassessNeeded = []; // per-side flag: force immediate reassessment
// per-side flag: directive replacement is not an AI failure
const _sidePrevControlled = []; // per-side total controlled cells on last territory check
const _sidePrevStrengthRatio = []; // per-side force ratio vs enemies
const _sidePrevPosture = []; // per-side posture string from previous tick

function rebaseSecondaryWarPlanSlotsForSideAppend(previousSideCount) {
	for (let sideIndex = previousSideCount - 1; sideIndex >= 0; sideIndex--) {
		const previousSlot = sideIndex + previousSideCount;
		const nextSlot = sideIndex + previousSideCount + 1;
		_warPlan[nextSlot] = _warPlan[previousSlot];
		_warPlan[previousSlot] = null;
	}
}

export const WAR_PLAN_TYPES = [
	"DEFEND",
	"PUSH_FRONT",
	"CAPTURE_CITY",
	"ENCIRCLE",
	"NAVAL_INVASION",
	"NAVAL_SUPPLY",
	"COASTAL_DEFENSE",
	"NEUTRAL_GARRISON",
	"TRANSPORT",
];
export const WAR_PLAN_PHASES = [
	"PREPARATION",
	"EXECUTION",
	"CONSOLIDATION",
	"GATHERING",
	"EMBARKATION",
	"TRANSIT",
	"LANDING",
	"DELIVERED",
];
export const AI_DESPERATION = {
	OFFENSE_MIN_WAR_TICKS: 1200, // ~20s at 60fps
	OFFENSE_STALL_TICKS: 900, // sustained stall before "push harder"
	OFFENSE_STALL_DELTA_FRAC: 0.002, // <=0.2% map gain counts as stalled
	DEFENSE_TRIGGER_RATIO: 0.4, // under 40% land -> defensive desperation
	LAST_STAND_TRIGGER_RATIO: 0.22, // under 22% land -> last stand
	CITY_RATIO_DEFENSE_TRIGGER: 0.35, // under 35% of starting cities -> defensive desperation
	CITY_RATIO_LAST_STAND_TRIGGER: 0.2, // under 20% of starting cities -> last stand
	PEACE_PRESSURE_PROPOSAL_BASE: 0.001, // base treaty proposal chance
	PEACE_PRESSURE_PROPOSAL_MULT_MAX: 5.0, // cap additional desperation pressure
};
export const AI_POSTURE = {
	NORMAL: "NORMAL",
	LAST_STAND: "LAST_STAND",
	DEFENSIVE_DESPERATION: "DEFENSIVE_DESPERATION",
	OFFENSIVE_DESPERATION: "OFFENSIVE_DESPERATION",
	UNDER_MOBILIZED: "UNDER_MOBILIZED",
};
export const AI_MOBILIZATION = {
	INITIAL_SPAWN_FRAC: 0.18, // spawn ~18% of theoretical force at war start
	INITIAL_SPAWN_MIN: 2, // each nation starts with a tiny standing force
	START_FROM_FRONT_CHANCE: 0.25, // mostly start behind lines, not fully on border
	EARLY_TICKS: 1800, // first ~30s at 60fps = mobilization phase
	EARLY_RECRUIT_MULT: 2.3, // recruit faster early to fill armies over time
};

// Frontline Distance Field: pre-computed per-cell direction toward nearest frontline cell.
// Updated once every FRONTLINE_FIELD_UPDATE_INTERVAL ticks instead of scanning per-unit.
// Each entry stores [dirLat, dirLng] packed as two Float32 values.
export let frontlineDirLat = null; // Float32Array, length = gridWidth * gridHeight
export let frontlineDirLng = null; // Float32Array, length = gridWidth * gridHeight
export let frontlineFieldTick = -999; // sim tick when the latest worker request was dispatched
export const FRONTLINE_FIELD_UPDATE_INTERVAL = 150; // rebuild field via worker every N ticks (15→30→60→150)
export let _simWorker = null; // Web Worker for async frontline BFS
export let _workerBusy = false;
let _frontlineWorkerPending = false;
let _frontlineWorkerPendingField = false;
let _frontlineWorkerPendingLayout = false;
let _frontlineWorkerRequestId = 0;
let _frontlineWorkerActiveRequestId = 0;
let _frontlineWorkerActiveField = false;
let _frontlineWorkerActiveLayout = false;
let _frontlineWorkerGeneration = 0;
let _frontlineTerritoryGeneration = 0;
let _frontlineLayoutApplyPendingMs = 0;
let _frontlineSlotApplyPendingMs = 0;
// Frontline polyline system: distributed unit stationing along war fronts
export let _frontlinePolys = {};
export let _neutralBorderPolys = {}; // combatant-vs-neutral border polylines for garrison stationing
let _neutralBorderCacheSignature = "";
let _politicalMapRevision = 0;
export let _frontlinePolyTick = -999;
export const FRONTLINE_POLY_UPDATE_INTERVAL = 30; // visual frames between polyline rebuilds (15→30)

// Grid dimensions calculated after settings choice
export let gridWidth = 0,
	gridHeight = 0,
	worldControlMap,
	deJureMap,
	provinceMap,
	occupationMap,
	sideInfluenceMaps,
	dominantSideMap,
	primaryOccupierMap,
	landMask,
	biomeMask,
	terrainMask;
export function setBombsDisabled(val) {
	bombsDisabled = val;
}
export function markTerritoryCellsChanged(cellIndices) {
	if (!cellIndices?.[Symbol.iterator]) return 0;
	_politicalMapRevision++;
	_neutralBorderCacheSignature = "";
	const changed = _territoryLedger?.markCellsChanged(cellIndices, true) || 0;
	influenceLayer?.notifyControlCellsChanged(cellIndices);
	return changed;
}
function invalidateTerritoryLedgerCities() {
	_territoryLedgerCitiesRevision++;
	_influenceCityGridSource = null;
}
export function setCities(val) {
	cities = val;
	invalidateTerritoryLedgerCities();
}
export function setCountryMetadata(val) {
	countryMetadata = val;
}
export function setCustomSatelliteImg(val) {
	customSatelliteImg = val;
}
export function setCustomSatelliteUrl(val) {
	customSatelliteUrl = val;
}
export function setGameState(val) {
	gameState = val;
	simulationClient.syncControls();
}
export function setHubReturnState(val) {
	hubReturnState = val;
}
export function setHubWasInEditor(val) {
	hubWasInEditor = val;
}
export function setGodBombActive(val) {
	godBombActive = val;
}
export function setGodBombSourceId(val) {
	godBombSourceId = val;
}
export function setBuffedSideIdx(val) {
	buffedSideIdx = val;
}
export function setImportScenarioBuffer(val) {
	importScenarioBuffer = val;
}
export function setDisableCountryGradient(val) {
	disableCountryGradient = val;
}
export function setGameMode(val) {
	gameMode = val;
}
export function setInitialCitiesSnapshot(val) {
	initialCitiesSnapshot = val;
}
export function setInitialCountryMetadataSnapshot(val) {
	initialCountryMetadataSnapshot = val;
}
export function setInitialDeJureMapSnapshot(val) {
	initialDeJureMapSnapshot = val;
}
export function setInitialLandMaskSnapshot(val) {
	initialLandMaskSnapshot = val;
}
export function setInitialProvinceMapSnapshot(val) {
	initialProvinceMapSnapshot = val;
}
export function setInitialWorldControlMapSnapshot(val) {
	initialWorldControlMapSnapshot = val;
}
export function setIsCustomTerrain(val) {
	isCustomTerrain = val;
}
export function setMissilesEnabled(val) {
	missilesEnabled = val;
}

export function setRawGeoJsonData(val) {
	rawGeoJsonData = val;
}
export function setRefAboveTerrain(val) {
	refAboveTerrain = val;
}
export function setReferenceImageUrl(val) {
	referenceImageUrl = val;
}
export function setSelectedImportCountryId(val) {
	selectedImportCountryId = val;
}
export function setHubScenarioCache(val) {
	hubScenarioCache = val;
}
export function setQueuedScenarioAction(val) {
	queuedScenarioAction = val;
}
export function setRefOpacity(val) {
	refOpacity = val;
}
export function setRefScale(val) {
	refScale = val;
}
export function setSideInfluenceMaps(val) {
	sideInfluenceMaps = val;
}
export function setNeutralBorderPolys(val) {
	_neutralBorderPolys = val;
	_neutralBorderCacheSignature = "";
}
export function setDominantSideMap(val) {
	dominantSideMap = val;
}
export function setReferenceOverlay(val) {
	referenceOverlay = val;
}
// ── State setters for module imports (ES imports are read-only) ────
export function setAdjacencyCache(val) {
	adjacencyCache = val;
}

// Snapshots of borders at scenario start for quick restart
export let initialWorldControlMapSnapshot = null;
export let initialDeJureMapSnapshot = null;
export let initialProvinceMapSnapshot = null;
export let initialLandMaskSnapshot = null;
export let initialBiomeMaskSnapshot = null;
// Snapshots for releasables and metadata at scenario start so annexed nations are still releasable on quick restart
export let initialCountryMetadataSnapshot = null;
export let initialCitiesSnapshot = null;
export let countryMetadata = []; // Stores {feature, color, id}
export let _allianceCacheDirty = true;
export function markAllianceCacheDirty() {
	_allianceCacheDirty = true;
}
export function clearAllianceCacheDirty() {
	_allianceCacheDirty = false;
}
export let countryUrbanPop = new Map(); // countryId -> total urban population from city data
export let recruitModel = "balanced"; // "area" | "pop" | "balanced"

/** Sum city populations per country for use in army size estimation. */
export function computeCountryUrbanPop() {
	if (!cities || !worldControlMap) return;
	countryUrbanPop = new Map();
	for (const city of cities) {
		const idx = getGridIndex(city.lat, city.lng);
		if (idx === -1) continue;
		const ownerId = worldControlMap[idx];
		if (ownerId > 0 && city.pop > 0) {
			countryUrbanPop.set(
				ownerId,
				(countryUrbanPop.get(ownerId) || 0) + city.pop,
			);
		}
	}
}

// UI Elements
export const addSideBtn = document.getElementById("add-side-btn");
export const ffaToggleBtn = document.getElementById("ffa-toggle-btn");
export const sidesContainer = document.getElementById("sides-container");
export const editorToolbox = document.getElementById("editor-toolbox");
export const editorCreateBtn = document.getElementById("editor-create-btn");
export const editorTestBtn = document.getElementById("editor-test-btn");
export const editorUpdateBtn = document.getElementById("editor-update-btn");
export const editorSaveBtn = document.getElementById("editor-save-btn");
export const editorLoadBtn = document.getElementById("editor-load-btn");
export const editorShareBtn = document.getElementById("editor-share-btn");
export const editorHubBtn = document.getElementById("editor-hub-btn");
export const editorLibraryBtn = document.getElementById("editor-library-btn");
export const editorFlagLibraryBtn = document.getElementById(
	"editor-flag-library-btn",
);
export const editorPaintBtn = document.getElementById("editor-paint-btn");
export const editorFillBtn = document.getElementById("editor-fill-btn");
export const editorUnclaimBtn = document.getElementById("editor-unclaim-btn");
export const editorTerrainBtn = document.getElementById("editor-terrain-btn");
export const terrainTypeSelect = document.getElementById("terrain-type-select");
export const terrainControls = document.getElementById("terrain-controls");
export const editorPlaceDivisionBtn = document.getElementById(
	"editor-place-division-btn",
);
export const editorSaveMultiBtn = document.getElementById(
	"editor-save-multi-btn",
);
export const editorSaveAllZipBtn = document.getElementById(
	"editor-save-all-zip-btn",
);
export const editorLoadZipBtn = document.getElementById("editor-load-zip-btn");
export const editorImportCountryBtn = document.getElementById(
	"editor-import-country-from-scenario-btn",
);
export const editorCityNewBtn = document.getElementById("editor-city-new-btn");
export const editorCityClearBtn = document.getElementById(
	"editor-city-clear-btn",
);
export const editorToolsPage1Btn = document.getElementById(
	"editor-tools-page-1-btn",
);
export const editorToolsPage2Btn = document.getElementById(
	"editor-tools-page-2-btn",
);
export const editorToolsPage3Btn = document.getElementById(
	"editor-tools-page-3-btn",
);
export const editorToolsPage4Btn = document.getElementById(
	"editor-tools-page-4-btn",
);
export const editorToolsPage5Btn = document.getElementById(
	"editor-tools-page-5-btn",
);
export const editorExitBtn = document.getElementById("editor-exit-btn");
export const editorMapSettingsBtn = document.getElementById(
	"editor-map-settings-btn",
);
export const brushControls = document.getElementById("brush-controls");
export const brushSizeSlider = document.getElementById("brush-size-slider");
export const brushSizeVal = document.getElementById("brush-size-val");
export const viewModeBtn = document.getElementById("view-mode-btn");
export const arrowsToggleBtn = document.getElementById("arrows-toggle-btn");
export const battlesToggleBtn = document.getElementById("battles-toggle-btn");
export const labelsToggleBtn = document.getElementById("labels-toggle-btn");
export const citiesToggleBtn = document.getElementById("cities-toggle-btn");
export const warplansToggleBtn = document.getElementById("warplans-toggle-btn");
export const allianceViewCheckbox = document.getElementById(
	"alliance-view-checkbox",
);

// Fully retire the legacy ARROWS button so it no longer appears or controls alliance view.
if (arrowsToggleBtn) {
	arrowsToggleBtn.style.display = "none";
}

export const scenarioHubModal = document.getElementById("scenario-hub-modal");
export const hubList = document.getElementById("hub-list");
export const libraryList = document.getElementById("library-list");
export const flagLibraryList = document.getElementById("flag-library-list");
export const closeHubBtn = document.getElementById("close-hub-btn");
export const tabScenariosBtn = document.getElementById("tab-scenarios-btn");
export const tabCountriesBtn = document.getElementById("tab-countries-btn");
export const tabFlagsBtn = document.getElementById("tab-flags-btn");

// Item details + comments modal elements
export const itemCommentModal = document.getElementById("item-comment-modal");
export const itemModalTitle = document.getElementById("item-modal-title");
export const itemModalDesc = document.getElementById("item-modal-desc");
export const itemModalPreview = document.getElementById("item-modal-preview");
export const itemCommentsList = document.getElementById("item-comments-list");
export const itemCommentInput = document.getElementById("item-comment-input");
export const itemCommentSubmit = document.getElementById("item-comment-submit");
export const itemReplyIndicator = document.getElementById(
	"item-reply-indicator",
);
export const itemCancelReplyBtn = document.getElementById(
	"item-comment-cancel-reply",
);
export const closeItemModalBtn = document.getElementById(
	"close-item-modal-btn",
);
export const itemModalActions = document.getElementById("item-modal-actions");
export const itemModalPlayBtn = document.getElementById("item-modal-play");
export const itemModalRemixBtn = document.getElementById("item-modal-remix");

// Global chat modal elements
export const globalChatModal = document.getElementById("global-chat-modal");
export const globalChatList = document.getElementById("global-chat-list");
export const globalChatInput = document.getElementById("global-chat-input");
export const globalChatSend = document.getElementById("global-chat-send");
export const globalChatClose = document.getElementById("global-chat-close");

// Hub caches for item details
export let hubScenarioCache = {};
export let hubCountryCache = {};
export let hubFlagCache = {};

// Comment state
export let currentCommentItemType = null;
export let currentCommentItemId = null;
export let currentReplyParentId = null;
export let currentEditingCommentId = null;
export let commentsUnsubscribe = null;

// Global chat state
export let globalChatUnsubscribe = null;

export const uploadDetailsModal = document.getElementById(
	"upload-details-modal",
);
export const confirmUploadBtn = document.getElementById("confirm-upload-btn");
export const cancelUploadBtn = document.getElementById("cancel-upload-btn");
export const uploadNameInput = document.getElementById("upload-scenario-name");
export const uploadDescInput = document.getElementById("upload-scenario-desc");

export const shareCountryModal = document.getElementById("share-country-modal");
export const confirmShareCountryBtn = document.getElementById(
	"confirm-share-country-btn",
);
export const cancelShareCountryBtn = document.getElementById(
	"cancel-share-country-btn",
);
export const shareCountryNameInput =
	document.getElementById("share-country-name");
export const shareCountryDescInput =
	document.getElementById("share-country-desc");

export const shareFlagModal = document.getElementById("share-flag-modal");
export const releaseModal = document.getElementById("release-modal");
export const releasableListContainer =
	document.getElementById("releasable-list");
export const closeReleaseModalBtn = document.getElementById(
	"close-release-modal",
);
export const confirmShareFlagBtn = document.getElementById(
	"confirm-share-flag-btn",
);
export const cancelShareFlagBtn = document.getElementById(
	"cancel-share-flag-btn",
);
export const shareFlagNameInput = document.getElementById("share-flag-name");
export const shareFlagDescInput = document.getElementById("share-flag-desc");
export const shareFlagBtn = document.getElementById("share-flag-btn");

export const createCountryModal = document.getElementById(
	"create-country-modal",
);
export const confirmCreateBtn = document.getElementById("confirm-create-btn");
export const cancelCreateBtn = document.getElementById("cancel-create-btn");
export const newCountryNameInput = document.getElementById("new-country-name");
export const newCountryColorInput =
	document.getElementById("new-country-color");
export const newCountryFlagInput = document.getElementById("new-country-flag");

export const countryInspector = document.getElementById("country-inspector");
export const inspectNameInput = document.getElementById("inspect-name-input");
export const inspectFlagInput = document.getElementById("inspect-flag-input");
export const inspectFetchFlagBtn = document.getElementById(
	"inspect-fetch-flag-btn",
);
export const inspectHubFlagBtn = document.getElementById(
	"inspect-hub-flag-btn",
);
export const inspectFlagPreview = document.getElementById(
	"inspect-flag-preview",
);
export const inspectColorSwatch = document.getElementById(
	"inspect-color-swatch",
);
export const inspectColorPicker = document.getElementById(
	"inspect-color-picker",
);
export const inspectPaintBtn = document.getElementById("inspect-paint-btn");
export const inspectAnnexClickBtn = document.getElementById(
	"inspect-annex-click-btn",
);
export const shareCountryBtn = document.getElementById("share-country-btn");
export const closeInspectorBtn = document.getElementById("close-inspector-btn");
export const inspectBuffBtn = document.getElementById("inspect-buff-btn");

export const annexCountryInput = document.getElementById("annex-country-input");
export const annexCountryBtn = document.getElementById("annex-country-btn");
export const addAllyBtn = document.getElementById("add-ally-btn");
export const clearAlliesBtn = document.getElementById("clear-allies-btn");
export const allyList = document.getElementById("ally-list");
export const allianceFlagInput = document.getElementById("alliance-flag-input");

// City inspector elements
export const cityInspector = document.getElementById("city-inspector");

// Import-from-scenario modal elements
export const importCountryModal = document.getElementById(
	"import-country-modal",
);
export const importScenarioSelect = document.getElementById(
	"import-scenario-select",
);
export const importScenarioFileInput = document.getElementById(
	"import-scenario-file",
);
export const importCountrySearch = document.getElementById(
	"import-country-search",
);
export const importCountryCardList = document.getElementById(
	"import-country-card-list",
);
export const importCountryConfirmBtn = document.getElementById(
	"import-country-confirm-btn",
);
export const importCountryCancelBtn = document.getElementById(
	"import-country-cancel-btn",
);

// Temporary holder for loaded scenario used for country import
export let importScenarioBuffer = null; // { metadata, mapData, gridRes }
export let selectedImportCountryId = null;
export let importScenarioCountriesCache = []; // [{id,name,tiles,flagUrl}]
// Remember which scenario option was last used for import (e.g. builtin:modern_2022)
export let lastImportScenarioKey = null;

export function renderImportCountryCards(filterText = "") {
	if (!importCountryCardList) return;
	const ft = (filterText || "").toLowerCase();
	const filtered = importScenarioCountriesCache.filter(
		(c) => !ft || c.name.toLowerCase().includes(ft),
	);

	if (!filtered.length) {
		importCountryCardList.innerHTML = `
            <div style="font-size: 12px; color:#777; text-align:center; padding:10px;">
                No countries match that search.
            </div>
        `;
		return;
	}

	importCountryCardList.innerHTML = filtered
		.map((c) => {
			const selectedClass = c.id === selectedImportCountryId ? " selected" : "";
			const tilesLabel = c.tiles.toLocaleString();
			const flagHtml = c.flagUrl
				? `<img src="${c.flagUrl}" class="import-country-flag">`
				: `<div class="import-country-flag" style="background:#000;"></div>`;
			return `
            <div class="import-country-card${selectedClass}" data-country-id="${c.id}">
                ${flagHtml}
                <div style="flex:1; min-width:0;">
                    <div class="import-country-name">${c.name}</div>
                    <div class="import-country-tiles">${tilesLabel} tiles</div>
                </div>
            </div>
        `;
		})
		.join("");

	// Wire selection handlers
	importCountryCardList
		.querySelectorAll(".import-country-card")
		.forEach((card) => {
			card.addEventListener("click", () => {
				const id = parseInt(card.getAttribute("data-country-id") || "0", 10);
				if (!id) return;
				selectedImportCountryId = id;
				importCountryCardList
					.querySelectorAll(".import-country-card")
					.forEach((c) => {
						c.classList.remove("selected");
					});
				card.classList.add("selected");
			});
		});
}

// Hook search box once
menu_controls.bindImportCountrySearchInput();
export const cityNameInput = document.getElementById("city-name-input");
export const cityOwnerSelect = document.getElementById("city-owner-select");
export const cityCapitalCheckbox = document.getElementById(
	"city-capital-checkbox",
);
export const cityMoveBtn = document.getElementById("city-move-btn");
export const cityDeleteBtn = document.getElementById("city-delete-btn");
export const cityCloseBtn = document.getElementById("city-close-btn");

export const presetLowBtn = document.getElementById("preset-low-btn");
export const presetDefaultBtn = document.getElementById("preset-default-btn");
export const launchBtn = document.getElementById("launch-btn");
export const musicVolumeSlider = document.getElementById("music-volume-slider");
export const musicVolVal = document.getElementById("music-vol-val");
export const saveSkipCheckbox = document.getElementById("save-skip-checkbox");
export const mapResSelect = document.getElementById("map-res-select");
export const gridResSelect = document.getElementById("grid-res-select");
export const unitLimitSelect = document.getElementById("unit-limit-select");
export const customTrackInput = document.getElementById("custom-track-input");
export const clearCustomTrackBtn = document.getElementById(
	"clear-custom-track-btn",
);
export const disableUnitsVisuallyCheckbox = document.getElementById(
	"disable-units-visually-checkbox",
);
export const hideCurvedLabelsCheckbox = document.getElementById(
	"hide-curved-labels-checkbox",
);
export const disableAutoFullscreenCheckbox = document.getElementById(
	"disable-auto-fullscreen-checkbox",
);
export const disableCountryGradientCheckbox = document.getElementById(
	"disable-country-gradient-checkbox",
);

export const useSystemFontCheckbox = document.getElementById(
	"use-system-font-checkbox",
);
export const disableInvisibleBuffsCheckbox = document.getElementById(
	"disable-invisible-buffs-checkbox",
);
export const benchmarkBtn = document.getElementById("benchmark-btn");
export const perfOverlay = document.getElementById("perf-overlay");
export const benchmarkResults = document.getElementById("benchmark-results");
export const benchmarkStatsEl = document.getElementById("benchmark-stats");
export const benchmarkDismissBtn = document.getElementById(
	"benchmark-dismiss-btn",
);

const settingsController = createSettingsController((id, value) => {
	switch (id) {
		case "disable-mountains-checkbox":
			mountainsEnabled = !value;
			if (setupDisableMountainsCheckbox)
				setupDisableMountainsCheckbox.checked = value;
			break;
		case "disable-units-visually-checkbox":
			showUnitsVisually = !value;
			break;
		case "hide-curved-labels-checkbox":
			hideCurvedLabels = value;
			break;
		case "disable-country-gradient-checkbox":
			disableCountryGradient = value;
			break;
		case "disable-invisible-buffs-checkbox":
			invisibleBuffsEnabled = !value;
			influenceLayer?.render();
			break;
		case "disable-auto-fullscreen-checkbox":
			disableFullscreen = value;
			break;
		case "use-system-font-checkbox":
			document.body.classList.toggle("use-system-font", value);
			break;
	}
});
settingsController.wire();

export const settingsOverlay = document.getElementById("settings-overlay");
export const mainMenu = document.getElementById("main-menu");
const titleScreenVersion = document.getElementById("title-screen-version");
if (titleScreenVersion)
	titleScreenVersion.textContent = document.title.replace("MW-V", "v");
export const loadingOverlay = document.getElementById("loading-overlay");

// Helper to update loading UI across both standard and thematic containers
export const updateLoadingText = (status, progress = null, tip = null) => {
	if (status !== undefined) {
		document.querySelectorAll(".loading-status-text").forEach((el) => {
			el.innerText = status;
		});
	}
	if (progress !== null) {
		const pct = typeof progress === "string" ? progress : `${progress}%`;
		document.querySelectorAll(".loading-bar-fill-el").forEach((el) => {
			el.style.width = pct;
		});
	}
	if (tip !== null) {
		document.querySelectorAll(".loading-tip-text").forEach((el) => {
			el.innerText = tip;
		});
	}
};

// Define proxy objects for backward compatibility with existing code
export const loadingStatus = {
	set innerText(val) {
		updateLoadingText(val);
	},
	get innerText() {
		return document.querySelector(".loading-status-text")?.innerText;
	},
	style: applicationRuntime,
};
export const loadingBar = {
	style: applicationRuntime,
};
export const loadingTip = applicationRuntime;

export function setLoadingThematic(enabled) {
	if (enabled) {
		loadingOverlay.classList.add("thematic-overlay");
	} else {
		loadingOverlay.classList.remove("thematic-overlay");
	}
}
export const playModeBtn = document.getElementById("play-mode-btn");

export const editorChoiceModal = document.getElementById("editor-choice-modal");
export const choiceIngameEditor = document.getElementById(
	"choice-ingame-editor",
);
export const choiceExternalEditor = document.getElementById(
	"choice-external-editor",
);
export const cancelEditorChoice = document.getElementById(
	"cancel-editor-choice",
);

export const editorSourceModal = document.getElementById("editor-source-modal");
export const choiceSourceEarth = document.getElementById("choice-source-earth");
export const choiceSourceBlank = document.getElementById("choice-source-blank");
export const cancelSourceChoice = document.getElementById(
	"cancel-source-choice",
);

export const mapSettingsModal = document.getElementById("map-settings-modal");
export const mapSettingsNameInput = document.getElementById(
	"map-settings-name-input",
);
export const mapSettingsWidthInput = document.getElementById(
	"map-settings-width-input",
);
export const mapSettingsHeightInput = document.getElementById(
	"map-settings-height-input",
);
export const mapSettingsMissilesCheckbox = document.getElementById(
	"map-settings-missiles-checkbox",
);
export const mapSettingsApplyBtn = document.getElementById(
	"map-settings-apply-btn",
);
export const mapSettingsCancelBtn = document.getElementById(
	"map-settings-cancel-btn",
);

export const conquestChoiceModal = document.getElementById(
	"conquest-choice-modal",
);

export const eraPageModern = document.getElementById("era-page-modern");
export const eraPageWars = document.getElementById("era-page-wars");
export const choiceModernDay = document.getElementById("choice-modern-day");
export const choice1936Scenario = document.getElementById(
	"choice-1936-scenario",
);
export const choiceWW1Scenario = document.getElementById("choice-ww1-1914");
export const cancelConquestChoice = document.getElementById(
	"cancel-conquest-choice",
);
export const mainSettingsBtn = document.getElementById("main-settings-btn");
export const minimizeSetupBtn = document.getElementById("minimize-setup-btn");
export const minimizeStatsBtn = document.getElementById("minimize-stats-btn");
export const minimizeStatusBtn = document.getElementById("minimize-status-btn");
export const muteBtn = document.getElementById("mute-btn");
export const ingameSettingsBtn = document.getElementById("ingame-settings-btn");

export const tutorialOverlay = document.getElementById("tutorial-overlay");
export const tutorialStepContainer = document.getElementById(
	"tutorial-step-container",
);
export const tutorialPrevBtn = document.getElementById("tutorial-prev-btn");
export const tutorialNextBtn = document.getElementById("tutorial-next-btn");
export const tutorialDotsContainer = document.getElementById("tutorial-dots");

export let currentTutorialStep = 0;
export let tutorialActive = false;
export let activeTutorialSet = [];
export let activeTutorialKey = "mw_tutorial_finished";

export const conquestTutorialSteps = [
	{
		icon: "⚔️",
		title: "Welcome Commander",
		content:
			"Modern Wars is a grand strategy simulation of <b>organic frontlines</b>. Let's walk through a basic engagement setup.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🌍",
		title: "Initialize World",
		content:
			"First, let's load the global theater. Click 'Next' to initialize the engine.",
		actionRequired: "LOAD_MAP",
	},
	{
		icon: "🇩🇪",
		title: "Recruit Side A",
		content:
			"We need an aggressor. Find <b>Germany</b> on the map and click it to recruit for Side A.",
		actionRequired: "SELECT_GERMANY",
	},
	{
		icon: "🇵🇱",
		title: "Recruit Side B",
		content:
			"Now for the opposition. Switch to <b>Side B</b> in the setup panel, then click <b>Poland</b> on the map.",
		actionRequired: "SELECT_POLAND",
	},
	{
		icon: "⚔️",
		title: "Launch Operation",
		content:
			"Both sides are ready. Click <b>Inaugurate Conflict</b> to begin the simulation.",
		actionRequired: "START_WAR",
	},
	{
		icon: "🛡️",
		title: "The Frontline",
		content:
			"The war is live! Units will now push borders organically. You can use <b>God Mode</b> to edit the map while the simulation runs. Good luck, Commander.",
		actionRequired: "CLICK_FINISH",
	},
];

export const editorTutorialSteps = [
	{
		icon: "🛠️",
		title: "World Builder",
		content:
			"Welcome to the <b>Satellite Editor</b>. Here you can redraw history or create entirely new worlds from scratch.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🏳️",
		title: "Establish Nations",
		content:
			"First, click the <b>New Nation</b> button in the top-left toolbox. Define its name and color, then <b>click on the map</b> to establish its capital.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🎨",
		title: "Painting Borders",
		content:
			"Once a nation exists, <b>select it</b> on the map to open the <b>Inspector</b>. Use the <b>Manual Paint</b> tool to grow its territory cell by cell.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "📐",
		title: "Annexation Tool",
		content:
			"Want modern borders instantly? Use the <b>Annex Tool</b> in the Inspector. Type a name like <b>'France'</b> to absorb its real-world territory.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "📥",
		title: "The Library",
		content:
			"Don't build alone. The <b>Country Library</b> lets you import nations designed by the community directly into your map.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "💾",
		title: "Share Your Vision",
		content:
			"Once your map is complete, use <b>Save Preset</b> to keep it locally, or <b>Share to Hub</b> for others to play and remix!",
		actionRequired: "CLICK_FINISH",
	},
];

export function updateTutorialUI() {
	const step = activeTutorialSet[currentTutorialStep];
	if (!step) return;

	// Move the tutorial panel to the right for step 4 (index 3) of the Conquest tutorial
	// to prevent it from overlapping the Side B recruitment list.
	if (
		activeTutorialKey === "mw_tutorial_finished" &&
		currentTutorialStep === 3
	) {
		tutorialOverlay.style.justifyContent = "flex-end";
		tutorialOverlay.style.paddingLeft = "0";
		tutorialOverlay.style.paddingRight = "5%";
	} else {
		tutorialOverlay.style.justifyContent = "flex-start";
		tutorialOverlay.style.paddingLeft = "5%";
		tutorialOverlay.style.paddingRight = "0";
	}

	tutorialStepContainer.innerHTML = `
        <div class="tutorial-step">
            <div class="tutorial-header">
                <span class="tutorial-icon">${step.icon}</span>
                <h2 class="tutorial-title">${step.title}</h2>
            </div>
            <div class="tutorial-body">${step.content}</div>
        </div>
    `;

	tutorialPrevBtn.style.visibility =
		currentTutorialStep === 0 ? "hidden" : "visible";
	tutorialNextBtn.innerText =
		currentTutorialStep === activeTutorialSet.length - 1 ? "Finish" : "Next";

	const needsAction =
		step.actionRequired !== "CLICK_NEXT" &&
		step.actionRequired !== "CLICK_FINISH" &&
		step.actionRequired !== "LOAD_MAP";
	tutorialNextBtn.disabled = needsAction;
	tutorialNextBtn.style.opacity = needsAction ? "0.5" : "1";

	tutorialDotsContainer.innerHTML = activeTutorialSet
		.map(
			(_, i) =>
				`<div class="dot ${i === currentTutorialStep ? "active" : ""}"></div>`,
		)
		.join("");

	if (step.actionRequired === "LOAD_MAP") {
		tutorialNextBtn.onclick = () => {
			// Automatically trigger Modern Day scenario loading to skip the selection modal
			choiceModernDay.click();
			advanceTutorial();
		};
	} else {
		tutorialNextBtn.onclick = () => {
			if (currentTutorialStep < activeTutorialSet.length - 1) {
				currentTutorialStep++;
				updateTutorialUI();
			} else {
				endTutorial();
			}
		};
	}
}

export function advanceTutorial() {
	if (currentTutorialStep < activeTutorialSet.length - 1) {
		currentTutorialStep++;
		updateTutorialUI();
	}
}

export function endTutorial() {
	tutorialOverlay.style.display = "none";
	tutorialActive = false;
	setCookie(activeTutorialKey, "true");
}

export function startTutorial(set, key) {
	activeTutorialSet = set;
	activeTutorialKey = key;
	currentTutorialStep = 0;
	tutorialActive = true;
	updateTutorialUI();
	tutorialOverlay.style.display = "flex";
}

menu_controls.bindTutorialSkipBtnClick();

menu_controls.bindTutorialPrevBtnClick();

export const mapUi = document.getElementById("main-ui");
export const statusText = document.getElementById("status-text");
export const setupPanel = document.getElementById("setup-panel");
export const setupOptions = document.getElementById("setup-options");
export const startBtn = document.getElementById("start-btn");

export const noPeaceCheckbox = document.getElementById("no-peace-checkbox");

export const disableBombsCheckbox = document.getElementById(
	"disable-bombs-checkbox",
);
export const setupDisableMountainsCheckbox = document.getElementById(
	"setup-disable-mountains-checkbox",
);
export const disablePuppetsCheckbox = document.getElementById(
	"disable-puppets-checkbox",
);
export const mainDisableMountainsCheckbox = document.getElementById(
	"disable-mountains-checkbox",
);

export const casualtyPanel = document.getElementById("casualty-panel");
export const leaderboardOverlay = document.getElementById(
	"leaderboard-overlay",
);
export const leaderboardList = document.getElementById("leaderboard-list");
export const closeLeaderboardBtn = document.getElementById(
	"close-leaderboard-btn",
);

// Status & control panels
export const statsPanel = document.getElementById("stats-panel");

export const restartScenarioBtn = document.getElementById(
	"restart-scenario-btn",
);
export const quickRestartBtn = document.getElementById("quick-restart-btn");
export const resetBtn = document.getElementById("reset-btn");

// Buttons use clear text, ensure visibility is correct
if (quickRestartBtn) {
	quickRestartBtn.textContent = "QUICK RESTART";
}
if (resetBtn) {
	resetBtn.textContent = "RESET";
}
export const mainMenuBtn = document.getElementById("main-menu-btn");
export const leaderboardBtn = document.getElementById("leaderboard-btn");

export function updateRestartVisibility() {
	if (!restartScenarioBtn || !mainMenuBtn || !quickRestartBtn) return;
	const inEditorLikeMode = gameMode === "EDITOR" || godModeActive;
	const hasSnapshots = !!(
		initialWorldControlMapSnapshot && initialDeJureMapSnapshot
	);

	// Hide restart + menu + leaderboard while in editor / godmode, show them during normal scenarios
	if (inEditorLikeMode) {
		restartScenarioBtn.style.display = "none";
		quickRestartBtn.style.display = "none";
		mainMenuBtn.style.display = "none";
		if (leaderboardBtn) leaderboardBtn.style.display = "none";
	} else {
		restartScenarioBtn.style.display = "block";
		// Only show quick restart if we have the data to do it instantly
		quickRestartBtn.style.display = hasSnapshots ? "block" : "none";
		mainMenuBtn.style.display = "block";
		if (leaderboardBtn) leaderboardBtn.style.display = "block";
	}
}
export const pauseBtn = document.getElementById("pause-btn");
export const speedControls = document.getElementById("speed-controls");
export const speedInputs = Array.from(
	speedControls.querySelectorAll('input[name="simulation-speed"]'),
);
export const godModeBtn = document.getElementById("god-mode-btn");
export const godBombBtn = document.getElementById("god-bomb-btn");
export const forcePeaceBtn = document.getElementById("force-peace-btn");
export const statsGrid = document.getElementById("stats-grid");
export const tugOfWarContainer = document.getElementById(
	"tug-of-war-container",
);
export const coordsDisplay = document.getElementById("coords");
export const unitCountsDiv = document.getElementById("unit-counts");
export const unitCountsDisplay = document.getElementById("unit-counts-display");

export function rebuildStatsPanel() {
	const activeSides = sides
		.map((s, i) => ({ idx: i, countries: s }))
		.filter((x) => x.countries.length > 0);
	if (activeSides.length < 2) return;

	let gridHtml = "";
	activeSides.forEach((s, pos) => {
		const main = s.countries[0];
		const name =
			s.countries.length > 1
				? `${main.name} +${s.countries.length - 1}`
				: main.name || `Side ${String.fromCharCode(65 + s.idx)}`;
		if (pos > 0) gridHtml += `<div class="stats-vs">VS</div>`;
		gridHtml += `<div class="side-stats" data-side-idx="${s.idx}">
			<div class="stat-name hud-side-accent" data-sidename="${s.idx}">${name}</div>
            <div class="stat-metrics">
				<div class="metric"><span class="metric-label">PERSONNEL</span><span class="metric-value hud-side-accent" data-sidesoldiers="${s.idx}">0</span></div>
                <div class="metric"><span class="metric-label">CITIES</span><span class="metric-value" data-sidecities="${s.idx}">0</span></div>
				<div class="metric"><span class="metric-label">MOMENTUM</span><span class="metric-value metric-value--momentum" data-sidemomentum="${s.idx}">◆ STALEMATE</span></div>
            </div>
        </div>`;
	});
	statsGrid.innerHTML = gridHtml;
	for (const s of activeSides) {
		const sideStats = statsGrid.querySelector(`[data-side-idx="${s.idx}"]`);
		sideStats?.style.setProperty(
			"--side-color",
			sideColors[s.idx].replace(rgbaRe, "1)"),
		);
	}

	_cachedSoldierEls = [];
	_cachedCityEls = [];
	_cachedTerritoryCtrlEls = [];
	_cachedTerritorySegEls = [];
	_cachedMomentumEls = [];
	for (const s of activeSides) {
		_cachedSoldierEls[s.idx] = document.querySelector(
			`[data-sidesoldiers="${s.idx}"]`,
		);
		_cachedCityEls[s.idx] = document.querySelector(
			`[data-sidecities="${s.idx}"]`,
		);
		_cachedTerritoryCtrlEls[s.idx] = document.querySelector(
			`[data-sidecontrol="${s.idx}"]`,
		);
		_cachedTerritorySegEls[s.idx] = document.querySelector(
			`[data-tugsegment="${s.idx}"]`,
		);
		_cachedMomentumEls[s.idx] = document.querySelector(
			`[data-sidemomentum="${s.idx}"]`,
		);
	}

	if (unitCountsDisplay) {
		unitCountsDisplay.innerHTML = "";
		const spans = [];
		for (let i = 0; i < sides.length; i++) {
			if (i > 0) {
				const vs = document.createElement("span");
				vs.className = "hud-vs-separator";
				vs.textContent = " vs ";
				unitCountsDisplay.appendChild(vs);
			}
			const span = document.createElement("span");
			span.className = "hud-side-accent";
			span.style.setProperty(
				"--side-color",
				sideColors[i].replace(rgbaRe, "1)"),
			);
			span.textContent = "0";
			unitCountsDisplay.appendChild(span);
			spans[i] = span;
		}
		_cachedUnitCountSpans = spans;
	}

	let tugHtml = '<div class="tug-bar">';
	activeSides.forEach((s) => {
		tugHtml += `<div class="tug-segment" data-tugsegment="${s.idx}"></div>`;
	});
	tugHtml += '</div><div class="tug-labels">';
	activeSides.forEach((s) => {
		tugHtml += `<span class="control-pct hud-side-accent" data-sidecontrol="${s.idx}">${Math.floor(100 / activeSides.length)}%</span>`;
	});
	tugHtml += "</div>";
	tugOfWarContainer.innerHTML = tugHtml;
	for (const s of activeSides) {
		const segment = tugOfWarContainer.querySelector(
			`[data-tugsegment="${s.idx}"]`,
		);
		segment?.style.setProperty(
			"--side-color",
			sideColors[s.idx].replace(rgbaRe, "0.85)"),
		);
		if (segment)
			segment.style.width = `${Math.floor(100 / activeSides.length)}%`;
		const label = tugOfWarContainer.querySelector(
			`[data-sidecontrol="${s.idx}"]`,
		);
		label?.style.setProperty(
			"--side-color",
			sideColors[s.idx].replace(rgbaRe, "1)"),
		);
	}
}
export const treatyAlert = document.getElementById("treaty-alert");

rebuildManpowerInputs();
export const treatyMsg = document.getElementById("treaty-msg");
export const timeSystemCheckbox = document.getElementById(
	"enable-time-checkbox",
);
export const timeYearInput = document.getElementById("time-year-input");
export const timeMonthInput = document.getElementById("time-month-input");
export const timeDayInput = document.getElementById("time-day-input");
export const gameDateDisplay = document.getElementById("game-date-display");

/**
 * INITIALIZATION
 */
export const map = mapRuntime.map("map", {
	center: [20, 0],
	zoom: 3,
	minZoom: 2,
	maxZoom: 12,
	dragging: true,
	// Use viscosity so panning against the world-size box feels smooth instead of snapping back
	// Wheel motion is owned by the continuous camera controller below.
});

// Create Web Worker for async frontline field and layout rebuilds.
_simWorker = new Worker(
	new URL("../workers/simulation-worker.js", import.meta.url),
	{ type: "module" },
);

function syncFrontlineWorkerPendingState() {
	_frontlineWorkerPending =
		_frontlineWorkerPendingField || _frontlineWorkerPendingLayout;
}

function applyFrontlineLayout(data) {
	const layoutApplyStarted = performance.now();
	_frontlinePolys = data.polylines;
	const layoutApplyMs = performance.now() - layoutApplyStarted;

	const slotApplyStarted = performance.now();
	const unitsById = new Map(units.map((unit) => [unit.id, unit]));
	for (const assignment of data.slotAssignments) {
		const unit = unitsById.get(assignment.unitId);
		if (!unit) continue;
		if (assignment.pairKey == null) {
			unit.frontSlot = null;
			continue;
		}
		if (
			!Number.isFinite(assignment.targetLat) ||
			!Number.isFinite(assignment.targetLng)
		) {
			continue;
		}
		unit.frontSlot = {
			pairKey: assignment.pairKey,
			segmentIdx: assignment.segmentIdx || 0,
			targetLat: assignment.targetLat,
			targetLng: assignment.targetLng,
		};
	}
	const slotApplyMs = performance.now() - slotApplyStarted;
	_frontlineLayoutApplyPendingMs += layoutApplyMs;
	_frontlineSlotApplyPendingMs += slotApplyMs;
}

_simWorker.onmessage = (evt) => {
	const data = evt.data;
	if (!data || data.requestId !== _frontlineWorkerActiveRequestId) {
		if (window.__perf) window.__perf.frontlineWorkerStaleResults++;
		return;
	}
	const completedField = _frontlineWorkerActiveField;
	const completedLayout = _frontlineWorkerActiveLayout;
	_workerBusy = false;
	_frontlineWorkerActiveRequestId = 0;
	_frontlineWorkerActiveField = false;
	_frontlineWorkerActiveLayout = false;
	if (window.__perf) {
		window.__perf.frontlineWorkerCompleted++;
		const durationMs = Number(data.durationMs) || 0;
		window.__perf.frontlineWorkerLastDurationMs = durationMs;
		window.__perf.frontlineWorkerMaxDurationMs = Math.max(
			window.__perf.frontlineWorkerMaxDurationMs || 0,
			durationMs,
		);
	}
	if (data.error) {
		if (window.__perf) {
			window.__perf.frontlineWorkerErrors++;
			if (completedLayout) window.__perf.frontlineWorkerLayoutErrors++;
		}
		return;
	}
	if (
		data.generation !== _frontlineWorkerGeneration ||
		data.territoryGeneration !== _frontlineTerritoryGeneration
	) {
		if (window.__perf) window.__perf.frontlineWorkerStaleResults++;
		return;
	}
	if (completedField) {
		const { frontlineDirLat: latBuf, frontlineDirLng: lngBuf } = data;
		if (
			!(latBuf instanceof ArrayBuffer) ||
			!(lngBuf instanceof ArrayBuffer) ||
			latBuf.byteLength === 0
		) {
			if (window.__perf) window.__perf.frontlineWorkerErrors++;
			return;
		}
		frontlineDirLat = new Float32Array(latBuf);
		frontlineDirLng = new Float32Array(lngBuf);
		if (window.__perf) {
			const fieldDurationMs = Number(data.fieldDurationMs) || 0;
			window.__perf.frontlineWorkerFieldLastDurationMs = fieldDurationMs;
			window.__perf.frontlineWorkerFieldMaxDurationMs = Math.max(
				window.__perf.frontlineWorkerFieldMaxDurationMs || 0,
				fieldDurationMs,
			);
		}
	}
	if (completedLayout) {
		if (
			!data.polylines ||
			typeof data.polylines !== "object" ||
			!Array.isArray(data.slotAssignments)
		) {
			if (window.__perf) {
				window.__perf.frontlineWorkerErrors++;
				window.__perf.frontlineWorkerLayoutErrors++;
			}
			return;
		}
		applyFrontlineLayout(data);
		if (window.__perf) {
			const layoutDurationMs = Number(data.layoutDurationMs) || 0;
			window.__perf.frontlineWorkerLayoutCompleted++;
			window.__perf.frontlineWorkerLayoutLastDurationMs = layoutDurationMs;
			window.__perf.frontlineWorkerLayoutMaxDurationMs = Math.max(
				window.__perf.frontlineWorkerLayoutMaxDurationMs || 0,
				layoutDurationMs,
			);
		}
	}
};
_simWorker.onerror = () => {
	_workerBusy = false;
	_frontlineWorkerActiveRequestId = 0;
	if (window.__perf) {
		window.__perf.frontlineWorkerErrors++;
		if (_frontlineWorkerActiveLayout)
			window.__perf.frontlineWorkerLayoutErrors++;
	}
	_frontlineWorkerActiveField = false;
	_frontlineWorkerActiveLayout = false;
};
_simWorker.onmessageerror = () => {
	_workerBusy = false;
	_frontlineWorkerActiveRequestId = 0;
	if (window.__perf) {
		window.__perf.frontlineWorkerErrors++;
		if (_frontlineWorkerActiveLayout)
			window.__perf.frontlineWorkerLayoutErrors++;
	}
	_frontlineWorkerActiveField = false;
	_frontlineWorkerActiveLayout = false;
};

function dispatchFrontlineWork(includeField = false, includeLayout = false) {
	if (!_simWorker) {
		if (window.__perf) window.__perf.frontlineWorkerErrors++;
		return false;
	}
	if (includeField) frontlineFieldTick = _simTickCount;
	if (includeLayout) _frontlinePolyTick = _simTickCount;
	if (_workerBusy) {
		let coalesced = false;
		if (includeField && !_frontlineWorkerPendingField) {
			_frontlineWorkerPendingField = true;
			coalesced = true;
		}
		if (includeLayout && !_frontlineWorkerPendingLayout) {
			_frontlineWorkerPendingLayout = true;
			coalesced = true;
			if (window.__perf) window.__perf.frontlineWorkerLayoutCoalesced++;
		}
		syncFrontlineWorkerPendingState();
		if (coalesced && window.__perf) window.__perf.frontlineWorkerCoalesced++;
		return false;
	}
	includeField ||= _frontlineWorkerPendingField;
	includeLayout ||= _frontlineWorkerPendingLayout;
	if (!includeField && !includeLayout) return false;

	const requestId = ++_frontlineWorkerRequestId;
	const generation = _frontlineWorkerGeneration;
	const territoryGeneration = _frontlineTerritoryGeneration;
	try {
		const lmCopy = new Uint8Array(landMask);
		const dsCopy = new Int8Array(dominantSideMap);
		const hostilityCopy = new Uint8Array(hostilityMatrix);
		const unitSnapshots = includeLayout
			? units.map((unit) => ({
					id: unit.id,
					sideIndex: unit.sideIndex,
					lat: unit.lat,
					lng: unit.lng,
					deployTicks: unit.deployTicks || 0,

					previousPairKey: unit.frontSlot?.pairKey,
					previousSegmentIdx: unit.frontSlot?.segmentIdx || 0,
				}))
			: null;
		_workerBusy = true;
		_frontlineWorkerPendingField = false;
		_frontlineWorkerPendingLayout = false;
		syncFrontlineWorkerPendingState();
		_frontlineWorkerActiveRequestId = requestId;
		_frontlineWorkerActiveField = includeField;
		_frontlineWorkerActiveLayout = includeLayout;
		_simWorker.postMessage(
			{
				requestId,
				generation,
				territoryGeneration,
				includeField,
				includeLayout,
				landMask: lmCopy.buffer,
				dominantSideMap: dsCopy.buffer,
				hostilityMatrix: hostilityCopy.buffer,
				maxSides: MAX_SIDES,
				gridWidth,
				gridHeight,
				gridRes: CONFIG.GRID_RES,
				sideCount: sides.length,
				units: unitSnapshots,
			},
			[lmCopy.buffer, dsCopy.buffer, hostilityCopy.buffer],
		);
		if (window.__perf) {
			window.__perf.frontlineWorkerDispatches++;
			if (includeLayout) window.__perf.frontlineWorkerLayoutDispatches++;
		}
		return true;
	} catch (error) {
		console.warn("Frontline worker dispatch failed:", error);
		_workerBusy = false;
		_frontlineWorkerPendingField ||= includeField;
		_frontlineWorkerPendingLayout ||= includeLayout;
		syncFrontlineWorkerPendingState();
		_frontlineWorkerActiveRequestId = 0;
		_frontlineWorkerActiveField = false;
		_frontlineWorkerActiveLayout = false;
		if (window.__perf) window.__perf.frontlineWorkerErrors++;
		return false;
	}
}

import {
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
} from "./editor.js";
import {
	clearCellInfluence,
	ensureSideInfluenceMaps,
	getBorderDirection,
	getGridIndex,
	initSideInfluenceMaps,
	isEnemyTerritory,
	isMyTerritory,
	myInfluenceAt,
	resetSideInfluenceMaps,
	setOccupationChangeListener,
	syncOccupationFromSideInfluence,
} from "./engine.js";
import {
	closeHub,
	openHub,
	renderHub,
	selectScenario,
	switchHubTab,
} from "./firebase.js";
import { ControlMapLayer, RENDER_LAYERS } from "./renderer.js";

export { ensureSideInfluenceMaps, getGridIndex, resetSideInfluenceMaps };

setOccupationChangeListener((cellIndex, change) => {
	// Float influence changes are continuous; census totals only depend on which
	// side controls a cell. Revisit the tile (and its border neighbors) when that
	// discrete controller changes.
	if (change?.previousSide === change?.nextSide) return;
	_territoryLedger?.markControllerChange(cellIndex);
	influenceLayer?.notifyControlCellsChanged(cellIndex);
	queueInfluenceFrontierCell(cellIndex, true);
});

influenceLayer = new ControlMapLayer().addTo(map);

// Create dedicated pane for reference images to ensure they stay behind the control map but above base imagery
map.createPane("refImagePane");
map.getPane("refImagePane").style.zIndex = 350;

/**
 * PERSISTENT GRID LOGIC
 */

/**
 * Completely remade province generation using multi-octave cellular noising.
 * Generates an organic, non-repeating province ID that is strictly unique to a specific sovereign country.
 */

/** Invalidate political-map consumers after a precomputed grid is installed. */

export function applyWorldBounds(widthDeg, heightDeg) {
	// Clamp to safe ranges
	const w = Math.max(10, Math.min(360, widthDeg || 360));
	const h = Math.max(10, Math.min(180, heightDeg || 180));
	worldWidthDeg = w;
	worldHeightDeg = h;

	const halfW = w / 2;
	const halfH = h / 2;
	const bounds = mapRuntime.latLngBounds(
		mapRuntime.latLng(-halfH, -halfW),
		mapRuntime.latLng(halfH, halfW),
	);
	map.setMaxBounds(bounds);

	// If current center is outside new bounds, fit map into the new box
	if (!bounds.contains(map.getCenter())) {
		map.fitBounds(bounds, { animate: true });
	}

	// Force bounding box redraw
	if (influenceLayer) {
		influenceLayer._forceRender = true;
		if (typeof influenceLayer._update === "function") {
			influenceLayer._update();
		} else {
			influenceLayer.render();
		}
	}
}

export function isInsideWorldBoxLatLng(lat, lng) {
	if (!worldWidthDeg || !worldHeightDeg) return true;
	const halfW = worldWidthDeg / 2;
	const halfH = worldHeightDeg / 2;
	return lat >= -halfH && lat <= halfH && lng >= -halfW && lng <= halfW;
}

export function getAllianceRootId(startId) {
	if (!startId || startId <= 0 || !countryMetadata) return null;
	const visited = new Set();
	const queue = [startId];
	let rootId = startId;
	while (queue.length) {
		const cid = queue.shift();
		if (visited.has(cid)) continue;
		visited.add(cid);
		if (cid < rootId) rootId = cid;
		const meta = countryMetadata[cid - 1];
		const allies = meta && Array.isArray(meta.allies) ? meta.allies : [];
		allies.forEach((aid) => {
			if (aid > 0 && !visited.has(aid)) queue.push(aid);
		});
	}
	return rootId;
}

/**
 * Returns all member country IDs in the same alliance graph as the given startId,
 * including the startId itself.
 */
export function getAllianceMembers(startId) {
	if (!startId || startId <= 0 || !countryMetadata) return [];
	const visited = new Set();
	const queue = [startId];
	while (queue.length) {
		const cid = queue.shift();
		if (visited.has(cid)) continue;
		visited.add(cid);
		const meta = countryMetadata[cid - 1];
		const allies = meta && Array.isArray(meta.allies) ? meta.allies : [];
		allies.forEach((aid) => {
			if (aid > 0 && !visited.has(aid)) queue.push(aid);
		});
	}
	return Array.from(visited);
}

export function recalculateAllBounds(forceFullScan = false) {
	influenceLayer?.invalidate(RENDER_LAYERS.STATIC);
	if (!countryMetadata || !worldControlMap) return;
	const isWar =
		gameState === "SIMULATING" ||
		(godModeActive && preGodModeState === "SIMULATING");

	// Performance optimization: when zoomed in deep, we only scan a slightly larger padding of the view
	// to update labels, rather than the entire 6.4 million cell world grid.
	// However, for critical systems like defining a war theater, we MUST scan the full world.
	const view = map.getBounds();
	const res = CONFIG.GRID_RES;

	let vXMin = 0,
		vXMax = gridWidth - 1,
		vYMin = 0,
		vYMax = gridHeight - 1;

	if (!forceFullScan) {
		vXMin = Math.max(0, Math.floor((view.getWest() + 180) / res) - 10);
		vXMax = Math.min(
			gridWidth - 1,
			Math.ceil((view.getEast() + 180) / res) + 10,
		);
		vYMin = Math.max(0, Math.floor((view.getSouth() + 90) / res) - 10);
		vYMax = Math.min(
			gridHeight - 1,
			Math.ceil((view.getNorth() + 90) / res) + 10,
		);
	}

	countryMetadata.forEach((meta) => {
		if (!meta) return;
		// Store last bounds for stable binning
		meta.prevBounds = meta.bounds ? { ...meta.bounds } : null;
		meta.bounds = {
			minX: Infinity,
			maxX: -Infinity,
			minY: Infinity,
			maxY: -Infinity,
		};
		meta.labelBins = Array.from({ length: 4 }, () => ({
			latSum: 0,
			lngSum: 0,
			count: 0,
		}));
		meta.totalLatSum = 0;
		meta.totalLngSum = 0;
		meta.totalCount = 0;
	});

	// Scan viewport only for label updates to drastically reduce CPU pressure
	for (let y = vYMin; y <= vYMax; y++) {
		const rowOffset = y * gridWidth;
		const lat = y * res - 90;
		for (let x = vXMin; x <= vXMax; x++) {
			const i = rowOffset + x;
			const lng = x * res - 180;
			let id = worldControlMap[i];

			if (isWar && landMask[i] === 2) {
				const occ = occupationMap[i];
				if (Math.abs(occ) > 0.05) {
					const occupierId = primaryOccupierMap[i];
					if (occupierId > 0) id = occupierId;
				}
			}

			if (id > 0 && id <= countryMetadata.length) {
				const meta = countryMetadata[id - 1];
				if (meta) {
					const b = meta.bounds;
					if (x < b.minX) b.minX = x;
					if (x > b.maxX) b.maxX = x;
					if (y < b.minY) b.minY = y;
					if (y > b.maxY) b.maxY = y;

					// Stable Label Data Accumulation
					meta.totalLatSum += lat;
					meta.totalLngSum += lng;
					meta.totalCount++;

					// Use prev bounds to determine stable binning during this pass
					if (meta.prevBounds && meta.prevBounds.minX !== Infinity) {
						const width = Math.max(
							1,
							meta.prevBounds.maxX - meta.prevBounds.minX,
						);
						const binIdx = Math.max(
							0,
							Math.min(3, Math.floor(((x - meta.prevBounds.minX) / width) * 4)),
						);
						const bin = meta.labelBins[binIdx];
						bin.latSum += lat;
						bin.lngSum += lng;
						bin.count++;
					}
				}
			}
		}
	}

	// Finalize stable centers
	countryMetadata.forEach((meta) => {
		if (meta && meta.totalCount > 0) {
			meta.stableCenter = {
				lat: meta.totalLatSum / meta.totalCount,
				lng: meta.totalLngSum / meta.totalCount,
			};
			// If prev bounds weren't available, the bins will be empty; Pass 7 will handle fallback
		}
	});
}

export function getCountryColor(feature, alpha = 1) {
	if (!feature) return `rgba(150, 150, 150, ${alpha})`;
	const name =
		feature.properties.NAME ||
		feature.properties.name ||
		feature.properties.admin ||
		feature.properties.NAME_LONG ||
		"Unknown";

	// Check for predefined HOI4 colors
	if (CONFIG.HOI4_COLORS[name]) {
		const hex = CONFIG.HOI4_COLORS[name];
		// Convert hex to rgba
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	// Fallback to deterministic hash-based HSL
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h = Math.abs(hash % 360);
	const s = 60 + Math.abs((hash >> 8) % 30); // 60-90%
	const l = 45 + Math.abs((hash >> 16) % 20); // 45-65%
	return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

export function estimateUnitsForCountry(countryId) {
	if (!worldControlMap?.length || !countryId) return 0;

	// Count how many grid cells this country controls on the current map
	let cellCount = 0;
	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === countryId) cellCount++;
	}
	if (cellCount === 0) return 0;

	const sizeFactor = Math.max(1, cellCount / 1500);
	const densityScale = 1.0 / sizeFactor ** 0.45;

	// Calculate army size based on recruitment model
	let effectiveCount = cellCount;
	const meta = countryMetadata[countryId - 1];
	const pop = meta?.pop || countryUrbanPop.get(countryId) || 0;
	const gdp = meta?.gdp || 0;
	const popScore = Math.sqrt(pop) * 0.15;
	const gdpScore = Math.sqrt(gdp) * 2.5;

	if (recruitModel === "pop" && pop > 0) {
		effectiveCount = popScore;
	} else if (recruitModel === "gdp" && gdp > 0) {
		effectiveCount = gdpScore;
	} else if (recruitModel === "balanced" && pop > 0 && gdp > 0) {
		effectiveCount = popScore * 0.5 + gdpScore * 0.5;
	}

	// Only apply density for area-based models (pop/gdp coefficients are already calibrated)
	const useAreaModel = recruitModel === "area";
	let count = Math.floor(
		effectiveCount *
			(useAreaModel ? CONFIG.UNIT_DENSITY_FACTOR * densityScale : 1),
	);
	const flatFloor = 3;
	count = Math.max(flatFloor, Math.min(count, CONFIG.MAX_UNITS_PER_SIDE));

	return count * CONFIG.UNIT_TO_SOLDIER_RATIO;
}

menu_controls.bindAddSideBtnClick();

menu_controls.bindFfaToggleBtnClick();

export const randomWarBtn = document.getElementById("random-war-btn");

menu_controls.bindRandomWarBtnClick();

/**
 * Simple Point-In-Polygon check for GeoJSON features
 */
export function isPointInFeature(lat, lng, feature) {
	const point = [lng, lat];
	const type = feature.geometry.type;
	const coords = feature.geometry.coordinates;

	const isPointInRing = (ring, pt) => {
		let inside = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const xi = ring[i][0],
				yi = ring[i][1];
			const xj = ring[j][0],
				yj = ring[j][1];
			const intersect =
				yi > pt[1] !== yj > pt[1] &&
				pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		return inside;
	};

	const checkPolygon = (polygon, pt) => {
		// Exterior ring
		if (!isPointInRing(polygon[0], pt)) return false;
		// Interior holes
		for (let i = 1; i < polygon.length; i++) {
			if (isPointInRing(polygon[i], pt)) return false;
		}
		return true;
	};

	if (type === "Polygon") {
		return checkPolygon(coords, point);
	} else if (type === "MultiPolygon") {
		return coords.some((part) => checkPolygon(part, point));
	}
	return false;
}

/**
 * Procedurally generates desert biomes based on known global geographical coordinates.
 * This provides visual variety in 'Simplified Mode' for real-earth scenarios.
 */
export function applyEarthDeserts() {
	if (!biomeMask) return;

	// Bounding boxes for major global deserts
	const deserts = [
		{ lat: [14, 31], lng: [-17, 35] }, // Sahara
		{ lat: [12, 32], lng: [35, 59] }, // Arabian
		{ lat: [36, 48], lng: [75, 115] }, // Gobi / Taklamakan
		{ lat: [-34, -18], lng: [114, 150] }, // Australian Outback
		{ lat: [-30, -18], lng: [14, 28] }, // Kalahari / Namib
		{ lat: [23, 37], lng: [-118, -102] }, // Mojave / Sonoran / Chihuahuan
		{ lat: [-27, -15], lng: [-72, -66] }, // Atacama
		{ lat: [24, 32], lng: [68, 77] }, // Thar
		{ lat: [35, 45], lng: [52, 72] }, // Central Asian (Kyzylkum/Kara-Kum)
	];

	const res = CONFIG.GRID_RES;
	for (const desert of deserts) {
		const yStart = Math.max(0, Math.ceil((desert.lat[0] + 90) / res));
		const yEnd = Math.min(
			gridHeight - 1,
			Math.floor((desert.lat[1] + 90) / res),
		);
		const xStart = Math.max(0, Math.ceil((desert.lng[0] + 180) / res));
		const xEnd = Math.min(
			gridWidth - 1,
			Math.floor((desert.lng[1] + 180) / res),
		);
		for (let y = yStart; y <= yEnd; y++) {
			const lat = y * res - 90;
			const rowOffset = y * gridWidth;
			for (let x = xStart; x <= xEnd; x++) {
				const index = rowOffset + x;
				if (landMask[index] === 0) continue;
				const lng = x * res - 180;
				// Apply a sinus-based noise threshold to prevent perfectly rectangular deserts
				const noise = Math.sin(lat * 3.5) * Math.cos(lng * 3.5);
				if (noise > -0.85) biomeMask[index] = 1;
			}
		}
	}
}

export async function loadFlagCodes() {
	if (flagCodes) return;
	try {
		const url = "assets/geodata/flagcodes.json";
		flagCodes = await fetchJSONWithCache(url);
	} catch (e) {
		console.error("Failed to load flag codes", e);
	}
}

export const FLAG_CDN_MAPPING = {
	ad: "Andorra",
	ae: "United Arab Emirates",
	af: "Afghanistan",
	ag: "Antigua and Barbuda",
	ai: "Anguilla",
	al: "Albania",
	am: "Armenia",
	ao: "Angola",
	aq: "Antarctica",
	ar: "Argentina",
	as: "American Samoa",
	at: "Austria",
	au: "Australia",
	aw: "Aruba",
	ax: "Åland Islands",
	az: "Azerbaijan",
	ba: "Bosnia and Herzegovina",
	bb: "Barbados",
	bd: "Bangladesh",
	be: "Belgium",
	bf: "Burkina Faso",
	bg: "Bulgaria",
	bh: "Bahrain",
	bi: "Burundi",
	bj: "Benin",
	bl: "Saint Barthélemy",
	bm: "Bermuda",
	bn: "Brunei",
	bo: "Bolivia",
	bq: "Caribbean Netherlands",
	br: "Brazil",
	bs: "Bahamas",
	bt: "Bhutan",
	bv: "Bouvet Island",
	bw: "Botswana",
	by: "Belarus",
	bz: "Belize",
	ca: "Canada",
	cc: "Cocos (Keeling) Islands",
	cd: "DR Congo",
	cf: "Central African Republic",
	cg: "Republic of the Congo",
	ch: "Switzerland",
	ci: "Côte d'Ivoire (Ivory Coast)",
	ck: "Cook Islands",
	cl: "Chile",
	cm: "Cameroon",
	cn: "China",
	co: "Colombia",
	cr: "Costa Rica",
	cu: "Cuba",
	cv: "Cape Verde",
	cw: "Curaçao",
	cx: "Christmas Island",
	cy: "Cyprus",
	cz: "Czechia",
	de: "Germany",
	dj: "Djibouti",
	dk: "Denmark",
	dm: "Dominica",
	do: "Dominican Republic",
	dz: "Algeria",
	ec: "Ecuador",
	ee: "Estonia",
	eg: "Egypt",
	eh: "Western Sahara",
	er: "Eritrea",
	es: "Spain",
	et: "Ethiopia",
	eu: "European Union",
	fi: "Finland",
	fj: "Fiji",
	fk: "Falkland Islands",
	fm: "Micronesia",
	fo: "Faroe Islands",
	fr: "France",
	ga: "Gabon",
	gb: "United Kingdom",
	"gb-eng": "England",
	"gb-nir": "Northern Ireland",
	"gb-sct": "Scotland",
	"gb-wls": "Wales",
	gd: "Grenada",
	ge: "Georgia",
	gf: "French Guiana",
	gg: "Guernsey",
	gh: "Ghana",
	gi: "Gibraltar",
	gl: "Greenland",
	gm: "Gambia",
	gn: "Guinea",
	gp: "Guadeloupe",
	gq: "Equatorial Guinea",
	gr: "Greece",
	gs: "South Georgia",
	gt: "Guatemala",
	gu: "Guam",
	gw: "Guinea-Bissau",
	gy: "Guyana",
	hk: "Hong Kong",
	hm: "Heard Island and McDonald Islands",
	hn: "Honduras",
	hr: "Croatia",
	ht: "Haiti",
	hu: "Hungary",
	id: "Indonesia",
	ie: "Ireland",
	il: "Israel",
	im: "Isle of Man",
	in: "India",
	io: "British Indian Ocean Territory",
	iq: "Iraq",
	ir: "Iran",
	is: "Iceland",
	it: "Italy",
	je: "Jersey",
	jm: "Jamaica",
	jo: "Jordan",
	jp: "Japan",
	ke: "Kenya",
	kg: "Kyrgyzstan",
	kh: "Cambodia",
	ki: "Kiribati",
	km: "Comoros",
	kn: "Saint Kitts and Nevis",
	kp: "North Korea",
	kr: "South Korea",
	kw: "Kuwait",
	ky: "Cayman Islands",
	kz: "Kazakhstan",
	la: "Laos",
	lb: "Lebanon",
	lc: "Saint Lucia",
	li: "Liechtenstein",
	lk: "Sri Lanka",
	lr: "Liberia",
	ls: "Lesotho",
	lt: "Lithuania",
	lu: "Luxembourg",
	lv: "Latvia",
	ly: "Libya",
	ma: "Morocco",
	mc: "Monaco",
	md: "Moldova",
	me: "Montenegro",
	mf: "Saint Martin",
	mg: "Madagascar",
	mh: "Marshall Islands",
	mk: "North Macedonia",
	ml: "Mali",
	mm: "Myanmar",
	mn: "Mongolia",
	mo: "Macau",
	mp: "Northern Mariana Islands",
	mq: "Martinique",
	mr: "Mauritania",
	ms: "Montserrat",
	mt: "Malta",
	mu: "Mauritius",
	mv: "Maldives",
	mw: "Malawi",
	mx: "Mexico",
	my: "Malaysia",
	mz: "Mozambique",
	na: "Namibia",
	nc: "New Caledonia",
	ne: "Niger",
	nf: "Norfolk Island",
	ng: "Nigeria",
	ni: "Nicaragua",
	nl: "Netherlands",
	no: "Norway",
	np: "Nepal",
	nr: "Nauru",
	nu: "Niue",
	nz: "New Zealand",
	om: "Oman",
	pa: "Panama",
	pe: "Peru",
	pf: "French Polynesia",
	pg: "Papua New Guinea",
	ph: "Philippines",
	pk: "Pakistan",
	pl: "Poland",
	pm: "Saint Pierre and Miquelon",
	pn: "Pitcairn Islands",
	pr: "Puerto Rico",
	ps: "Palestine",
	pt: "Portugal",
	pw: "Palau",
	py: "Paraguay",
	qa: "Qatar",
	re: "Réunion",
	ro: "Romania",
	rs: "Serbia",
	ru: "Russia",
	rw: "Rwanda",
	sa: "Saudi Arabia",
	sb: "Solomon Islands",
	sc: "Seychelles",
	sd: "Sudan",
	se: "Sweden",
	sg: "Singapore",
	sh: "Saint Helena, Ascension and Tristan da Cunha",
	si: "Slovenia",
	sj: "Svalbard and Jan Mayen",
	sk: "Slovakia",
	sl: "Sierra Leone",
	sm: "San Marino",
	sn: "Senegal",
	so: "Somalia",
	sr: "Suriname",
	ss: "South Sudan",
	st: "São Tomé and Príncipe",
	sv: "El Salvador",
	sx: "Sint Maarten",
	sy: "Syria",
	sz: "Eswatini (Swaziland)",
	tc: "Turks and Caicos Islands",
	td: "Chad",
	tf: "French Southern and Antarctic Lands",
	tg: "Togo",
	th: "Thailand",
	tj: "Tajikistan",
	tk: "Tokelau",
	tl: "Timor-Leste",
	tm: "Turkmenistan",
	tn: "Tunisia",
	to: "Tonga",
	tr: "Turkey",
	tt: "Trinidad and Tobago",
	tv: "Tuvalu",
	tw: "Taiwan",
	tz: "Tanzania",
	ua: "Ukraine",
	ug: "Uganda",
	um: "United States Minor Outlying Islands",
	un: "United Nations",
	us: "United States",
	"us-ak": "Alaska",
	"us-al": "Alabama",
	"us-ar": "Arkansas",
	"us-az": "Arizona",
	"us-ca": "California",
	"us-co": "Colorado",
	"us-ct": "Connecticut",
	"us-de": "Delaware",
	"us-fl": "Florida",
	"us-ga": "Georgia",
	"us-hi": "Hawaii",
	"us-ia": "Iowa",
	"us-id": "Idaho",
	"us-il": "Illinois",
	"us-in": "Indiana",
	"us-ks": "Kansas",
	"us-ky": "Kentucky",
	"us-la": "Louisiana",
	"us-ma": "Massachusetts",
	"us-md": "Maryland",
	"us-me": "Maine",
	"us-mi": "Michigan",
	"us-mn": "Minnesota",
	"us-mo": "Missouri",
	"us-ms": "Mississippi",
	"us-mt": "Montana",
	"us-nc": "North Carolina",
	"us-nd": "North Dakota",
	"us-ne": "Nebraska",
	"us-nh": "New Hampshire",
	"us-nj": "New Jersey",
	"us-nm": "New Mexico",
	"us-nv": "Nevada",
	"us-ny": "New York",
	"us-oh": "Ohio",
	"us-ok": "Oklahoma",
	"us-or": "Oregon",
	"us-pa": "Pennsylvania",
	"us-ri": "Rhode Island",
	"us-sc": "South Carolina",
	"us-sd": "South Dakota",
	"us-tn": "Tennessee",
	"us-tx": "Texas",
	"us-ut": "Utah",
	"us-va": "Virginia",
	"us-vt": "Vermont",
	"us-wa": "Washington",
	"us-wi": "Wisconsin",
	"us-wv": "West Virginia",
	"us-wy": "Wyoming",
	uy: "Uruguay",
	uz: "Uzbekistan",
	va: "Vatican City (Holy See)",
	vc: "Saint Vincent and the Grenadines",
	ve: "Venezuela",
	vg: "British Virgin Islands",
	vi: "United States Virgin Islands",
	vn: "Vietnam",
	vu: "Vanuatu",
	wf: "Wallis and Futuna",
	ws: "Samoa",
	xk: "Kosovo",
	ye: "Yemen",
	yt: "Mayotte",
	za: "South Africa",
	zm: "Zambia",
	zw: "Zimbabwe",
};

export function findCodeByName(name) {
	if (!name) return null;
	const search = name.toLowerCase().trim();

	// Check comprehensive static mapping first
	for (const [code, fullName] of Object.entries(FLAG_CDN_MAPPING)) {
		if (fullName.toLowerCase() === search) return code;
	}

	// Then check dynamically fetched codes if available
	if (flagCodes) {
		for (const [code, fullName] of Object.entries(flagCodes)) {
			if (fullName.toLowerCase() === search) return code;
		}
	}

	// Also check for common aliases or shortened names
	const aliases = {
		"united states": "us",
		"united states of america": "us",
		russia: "ru",
		"russian federation": "ru",
		"soviet union": "ru",
		"united kingdom": "gb",
		"great britain": "gb",
		britain: "gb",
		"south korea": "kr",
		"north korea": "kp",
		vietnam: "vn",
		iran: "ir",
		syria: "sy",
		"czech republic": "cz",
		"ivory coast": "ci",
		"republic of the congo": "cg",
		"democratic republic of the congo": "cd",
		"congo, republic of the": "cg",
		"congo, democratic republic of the": "cd",
		czechia: "cz",
		eswatini: "sz",
		swaziland: "sz",
	};
	return aliases[search];
}

export async function loadCities(
	shouldApply = () => true,
	preserveExistingCustom = false,
) {
	try {
		// Upgrade to 50m resolution for a significantly higher city count (thousands vs hundreds)
		const url =
			"assets/geodata/50m/cultural/ne_50m_populated_places_simple.json";
		const data = await fetchJSONWithCache(url);
		const loadedCities = data.features.map((f, idx) => ({
			id: idx + 1,
			name: f.properties.name || f.properties.NAME || "City",
			lat: f.geometry.coordinates[1],
			lng: f.geometry.coordinates[0],
			pop: f.properties.pop_max || 0,
			isCapital: f.properties.adm0cap === 1,
			ownerId: null,
			isCustom: false,
		}));
		if (!shouldApply()) return false;
		const customCities = preserveExistingCustom
			? cities
					.filter((city) => city?.isCustom)
					.map((city, index) => ({
						...city,
						id: loadedCities.length + index + 1,
					}))
			: [];
		setCities([...loadedCities, ...customCities]);

		// Apply historical renames for the 1936 WW2 scenario
		if (currentScenarioContext && currentScenarioContext.id === "ww2_1936") {
			cities.forEach((city) => {
				if (city.name === "Kaliningrad") {
					city.name = "Koenisberg";
				}
				if (city.name === "Gdańsk" || city.name === "Gdansk") {
					city.name = "Danzig";
				}
			});
		}
		return true;
	} catch (err) {
		console.error("Failed to load cities", err);
		return false;
	}
}

export function handleCountryClick(...args) {
	if (simulationClient.active && gameState.startsWith("EDITOR_"))
		return editSimulation(() => handleCountryClickOwned(...args));
	return handleCountryClickOwned(...args);
}
function handleCountryClickOwned(
	_feature,
	_layer,
	latlng,
	originalEvent = null,
) {
	const idx = getGridIndex(latlng.lat, latlng.lng);

	const isCtrlClick = !!(
		originalEvent &&
		(originalEvent.ctrlKey || originalEvent.metaKey)
	);

	if (godModeActive && godBombActive) {
		const ownerIdAtClick = idx !== -1 ? worldControlMap[idx] : 0;
		const isShift = originalEvent?.shiftKey;

		// Selection Phase: Pick a source country if none selected, or if Shift-clicking a new country
		if (godBombSourceId <= 0 || (isShift && ownerIdAtClick > 0)) {
			if (ownerIdAtClick > 0) {
				godBombSourceId = ownerIdAtClick;
				const meta = countryMetadata[godBombSourceId - 1];
				statusText.innerText = `GOD BOMB: ${meta?.name || "Nation"} is the bomber. Click anywhere to target.`;
				playClickSound();
			} else {
				statusText.innerText = "GOD BOMB: Click a country to select who fires.";
			}
		} else {
			// Firing Phase: Launch bomb from the source country to the clicked location
			const senderMeta = countryMetadata[godBombSourceId - 1];
			const sideIdx = sides.findIndex((s) =>
				s.some((c) => c.id === godBombSourceId),
			);
			const myBases = bases.filter(
				(b) =>
					b.sideIndex === sideIdx &&
					getGridIndex(b.lat, b.lng) !== -1 &&
					worldControlMap[getGridIndex(b.lat, b.lng)] === godBombSourceId,
			);
			let fromLat, fromLng;

			if (myBases.length > 0) {
				const b = myBases[Math.floor(Math.random() * myBases.length)];
				fromLat = b.lat;
				fromLng = b.lng;
			} else if (senderMeta?.stableCenter) {
				fromLat = senderMeta.stableCenter.lat;
				fromLng = senderMeta.stableCenter.lng;
			} else {
				// Fallback for nations with no center or land
				fromLat = latlng.lat + 5;
				fromLng = latlng.lng + 5;
			}

			launchBomb(fromLat, fromLng, latlng.lat, latlng.lng, sideIdx);
			playClickSound();
			statusText.innerText = `GOD BOMB: ${senderMeta?.name || "Nation"} strike launched. (Shift+Click to change bomber)`;
		}
		return;
	}

	if (gameState === "EDITOR_PLACING") {
		placeNewCountry(latlng);
		return;
	}

	if (gameState === "EDITOR_PAINTING_TERRAIN") {
		// paintAt already handles the actual landMask modification via mousedown/mousemove
		return;
	}

	if (gameState === "EDITOR_PLACING_DIVISION") {
		const countryIdAtClick = idx !== -1 ? worldControlMap[idx] : 0;
		if (editingCountryId <= 0) {
			if (countryIdAtClick > 0) {
				editingCountryId = countryIdAtClick;
				const meta = countryMetadata[editingCountryId - 1];
				statusText.innerText = `DEPLOYMENT: ${meta?.name || "Unknown"} (Click map to deploy divisions)`;
			} else {
				statusText.innerText = "SELECT SOURCE: Click a nation on the map first";
			}
		} else {
			placeDivisionAt(latlng, editingCountryId);
		}
		return;
	}

	if (gameState === "EDITOR_ANNEXING") {
		const targetId = idx !== -1 ? worldControlMap[idx] : 0;
		if (targetId > 0 && targetId !== editingCountryId) {
			const victimMeta = countryMetadata[targetId - 1];
			const victimName = victimMeta ? victimMeta.name : "Target";

			// RELEASABLE TRANSFER: Transfer victim's releasables to the annexer
			countryMetadata.forEach((m) => {
				if (m && m.releasableBy === targetId) {
					m.releasableBy = editingCountryId;
				}
			});

			// Transfer all territory
			for (let i = 0; i < worldControlMap.length; i++) {
				if (worldControlMap[i] === targetId) {
					worldControlMap[i] = editingCountryId;
				}
			}

			// Clean up live simulation data for the victim
			sides.forEach((side) => {
				const sIdx = side.findIndex((c) => c.id === targetId);
				if (sIdx > -1) side.splice(sIdx, 1);
			});
			units = units.filter((u) => u.sovereignId !== targetId);

			statusText.innerText = `ANNEXED: ${victimName} absorbed.`;
			recalculateAllBounds();
			influenceLayer.render();
			updateSidesUI();

			// Return to inspector
			openInspector(editingCountryId);
			gameState = "EDITOR_ACTIVE";
			map.getContainer().classList.remove("painting-cursor");
		} else {
			statusText.innerText =
				"Selection Cancelled: Clicked neutral land or self.";
			openInspector(editingCountryId);
			gameState = "EDITOR_ACTIVE";
			map.getContainer().classList.remove("painting-cursor");
		}
		return;
	}

	if (gameState === "EDITOR_SELECTING_OVERLORD") {
		const sovereignId = idx !== -1 ? worldControlMap[idx] : 0;
		if (sovereignId > 0 && sovereignId !== selectingOverlordForId) {
			setVassalage(selectingOverlordForId, sovereignId);
		} else {
			statusText.innerText = "Selection Cancelled";
		}
		gameState = godModeActive ? "EDITOR_ACTIVE" : "EDITOR_ACTIVE";
		if (godModeActive) gameState = "EDITOR_ACTIVE";
		selectingOverlordForId = -1;
		map.getContainer().classList.remove("painting-cursor");
		return;
	}

	if (gameState === "EDITOR_SELECTING_ALLY") {
		const targetId = idx !== -1 ? worldControlMap[idx] : 0;
		if (targetId > 0 && targetId !== selectingAllyForId) {
			const aMeta = countryMetadata[selectingAllyForId - 1];
			const bMeta = countryMetadata[targetId - 1];
			if (aMeta && bMeta) {
				aMeta.allies = Array.from(new Set([...(aMeta.allies || []), targetId]));
				bMeta.allies = Array.from(
					new Set([...(bMeta.allies || []), selectingAllyForId]),
				);
				markAllianceCacheDirty();
				statusText.innerText = `Alliance formed: ${aMeta.name} ↔ ${bMeta.name}`;
			}
		} else {
			statusText.innerText = "Ally selection cancelled";
		}
		selectingAllyForId = -1;
		gameState = "EDITOR_ACTIVE";
		map.getContainer().classList.remove("painting-cursor");
		recalculateAllBounds();
		influenceLayer.render();
		return;
	}

	if (gameState === "EDITOR_SELECTING_RELEASER") {
		const sovereignId = idx !== -1 ? worldControlMap[idx] : 0;
		if (sovereignId > 0 && sovereignId !== selectingOverlordForId) {
			setAsReleasable(selectingOverlordForId, sovereignId);
		} else {
			statusText.innerText = "Selection Cancelled";
		}
		gameState = "EDITOR_ACTIVE";
		selectingOverlordForId = -1;
		map.getContainer().classList.remove("painting-cursor");
		return;
	}

	if (idx === -1) return;

	let sovereignId = worldControlMap[idx];

	// Ctrl-click multi-select support in editor / god mode
	if (
		isCtrlClick &&
		sovereignId > 0 &&
		(gameMode === "EDITOR" || godModeActive)
	) {
		if (selectedCountryIds.has(sovereignId)) {
			selectedCountryIds.delete(sovereignId);
		} else {
			selectedCountryIds.add(sovereignId);
		}
		const count = selectedCountryIds.size;
		statusText.innerText =
			count > 0
				? `Selected ${count} countr${count === 1 ? "y" : "ies"} for ZIP export`
				: "Map Editor (Alpha)";
		// Keep normal inspector / setup logic from running on Ctrl-click
		influenceLayer.render();
		return;
	}

	// In God Mode or Simulation, clicking occupied land selects the current occupier
	if (gameState === "SIMULATING" || godModeActive) {
		const occ = occupationMap[idx];
		if (landMask[idx] === 2 && Math.abs(occ) > 0.1) {
			const occupierId = primaryOccupierMap[idx];
			if (occupierId > 0) sovereignId = occupierId;
		}
	}

	if (gameState === "PEACE_SELECT_1") {
		if (sovereignId > 0) {
			const sideCountry = sides
				.flat()
				.filter(Boolean)
				.find((c) => c.id === sovereignId);
			if (sideCountry) {
				peaceSelection1 = sideCountry;
				gameState = "PEACE_SELECT_2";
				statusText.innerText = `Peace for ${sideCountry.name}: Select Opponent`;
				influenceLayer.render();
			}
		}
		return;
	}

	if (gameState === "PEACE_SELECT_2") {
		if (sovereignId > 0) {
			const sideCountry = sides
				.flat()
				.filter(Boolean)
				.find((c) => c.id === sovereignId);
			if (sideCountry) {
				signSelectivePeace(peaceSelection1, sideCountry);
			}
		}
		return;
	}

	if (gameState === "SIMULATING") {
		if (sovereignId > 0) {
			openInspector(sovereignId);
		}
		return;
	}

	if (gameState === "WAR_OVER") return;

	if (
		gameState === "EDITOR_ACTIVE" ||
		gameState === "EDITOR_PAINTING" ||
		gameState === "EDITOR_FILLING" ||
		gameState === "EDITOR_FILLING_TERRAIN"
	) {
		if (gameState === "EDITOR_FILLING") {
			fillAt(latlng);
		} else if (gameState === "EDITOR_FILLING_TERRAIN") {
			fillTerrainAt(latlng);
		} else if (sovereignId > 0) {
			// Select the nation and open the inspector
			editingCountryId = sovereignId;
			openInspector(sovereignId);

			if (godModeActive && gameState === "EDITOR_ACTIVE") {
				const meta = countryMetadata[sovereignId - 1];
				statusText.innerText = `GOD MODE: ${meta?.name || "Selected Nation"} selected.`;
			}
		}
		return;
	}

	// Conquest Selection Logic
	if (sovereignId <= 0) return; // Must click a country in Conquest mode

	const meta = countryMetadata[sovereignId - 1];
	if (!meta) return;

	const targetFeature = meta.feature;
	const countryName =
		meta.name ||
		targetFeature?.properties?.NAME ||
		targetFeature?.properties?.name ||
		"Unknown";
	const color = meta.color;

	// Smart Reassignment Logic: If country is already in a side, move it or open inspector
	let existingSideIdx = -1;
	sides.forEach((side, idx) => {
		if (side?.some((c) => c && c.id === sovereignId)) existingSideIdx = idx;
	});

	if (existingSideIdx !== -1) {
		if (existingSideIdx === activeSideIndex) {
			// Already in active side: open inspector for editing, with double-click protection
			if (
				Date.now() - lastSelectionTime > 350 ||
				lastSelectedId !== sovereignId
			) {
				openInspector(sovereignId);
			}
		} else {
			// In a different side: transfer to active side instead of blocking or opening inspector
			const countryToMove = sides[existingSideIdx].find(
				(c) => c.id === sovereignId,
			);
			sides[existingSideIdx] = sides[existingSideIdx].filter(
				(c) => c.id !== sovereignId,
			);
			sides[activeSideIndex].push(countryToMove);
			updateSidesUI();
			statusText.innerText = `REASSIGNED: ${countryName} moved to Side ${String.fromCharCode(65 + activeSideIndex)}`;
			influenceLayer.render();
		}
		lastSelectionTime = Date.now();
		lastSelectedId = sovereignId;
		return;
	}

	if (ffaMode) {
		// New FFA participants use an empty side before adding another.
		if (sides[activeSideIndex] && sides[activeSideIndex].length > 0) {
			const emptySideIndex = sides.findIndex((side) => side.length === 0);
			if (emptySideIndex >= 0) {
				activeSideIndex = emptySideIndex;
			} else {
				if (sides.length >= MAX_SIDES) {
					statusText.textContent = `Maximum ${MAX_SIDES} sides supported. Select an existing side to reassign a country.`;
					return;
				}
				sides.push([]);
				activeSideIndex = sides.length - 1;
			}
		}
	}

	const targetList = sides[activeSideIndex];
	if (!targetList) return;

	const newCountry = {
		feature: targetFeature,
		id: sovereignId,
		color: color,
		name: countryName,
		buffState: meta.buffState || "none", // Carry over buff state from meta
		flag: null,
		strategy: "BALANCED",
		role: "OFFENSE",
	};

	targetList.push(newCountry);

	// In alliance view, automatically recruit other members of the same alliance
	// into the same side when one member is selected.
	if (allianceViewEnabled) {
		const allianceMembers = getAllianceMembers(sovereignId);
		const alreadyInAnySide = new Set(
			sides
				.flat()
				.filter(Boolean)
				.map((c) => c.id),
		);
		allianceMembers.forEach((aid) => {
			if (aid === sovereignId) return;
			if (alreadyInAnySide.has(aid)) return;
			const m = countryMetadata[aid - 1];
			if (!m) return;
			// Only add members that actually have territory on the current map
			const hasLand = worldControlMap.indexOf(aid) !== -1;
			if (!hasLand) return;
			targetList.push({
				feature: m.feature,
				id: m.id,
				color: m.color,
				name: m.name,
				buffState: m.buffState || "none",
				flag: m.tempFlag,
				strategy: "BALANCED",
				role: "OFFENSE",
			});
			alreadyInAnySide.add(aid);
		});
	}

	lastSelectionTime = Date.now();
	lastSelectedId = sovereignId;
	updateSidesUI();
	statusText.innerText = "Conflict Setup (Select more or click Inaugurate)";
	influenceLayer.render();

	// Tutorial Progression Logic
	if (tutorialActive) {
		const step = activeTutorialSet[currentTutorialStep];
		if (
			step.actionRequired === "SELECT_GERMANY" &&
			countryName.toLowerCase() === "germany"
		) {
			advanceTutorial();
		} else if (
			step.actionRequired === "SELECT_POLAND" &&
			countryName.toLowerCase() === "poland" &&
			activeSideIndex === 1
		) {
			advanceTutorial();
		}
	}
}

function getCountryLivePersonnel(...args) {
	return lifecycle.getCountryLivePersonnel(...args);
}

function clearSidePersonnelAccounting(...args) {
	return lifecycle.clearSidePersonnelAccounting(...args);
}

function releaseCountryPersonnelFromSide(...args) {
	return lifecycle.releaseCountryPersonnelFromSide(...args);
}

function clearSideHostilities(sideIdx) {
	clearSideLandPlanSlots(sideIdx);
	ensureSideIdentities();
	const uid = sideUids[sideIdx];
	if (!uid) return;
	for (const key of Array.from(hostileSidePairs)) {
		if (key.startsWith(`${uid}|`) || key.endsWith(`|${uid}`)) {
			hostileSidePairs.delete(key);
		}
	}
	rebuildHostilityMatrix();
}

function prepareEmptySideForNewMembership(sideIdx) {
	if (sideIdx < 0 || sideIdx >= MAX_SIDES) return false;
	if (sides[sideIdx]?.length) return false;
	ensureSideIdentities();
	const previousUid = sideUids[sideIdx];
	const hostilePeers = new Set();
	for (const pair of hostileSidePairs) {
		const [leftUid, rightUid] = pair.split("|");
		if (leftUid === previousUid) hostilePeers.add(rightUid);
		else if (rightUid === previousUid) hostilePeers.add(leftUid);
	}
	clearSideHostilities(sideIdx);
	clearSidePersonnelAccounting(sideIdx);
	if (!sides[sideIdx]) sides[sideIdx] = [];
	sideUids[sideIdx] = allocateSideUid();
	for (const peerUid of hostilePeers) {
		const peerIndex = sideUids.indexOf(peerUid);
		if (peerIndex >= 0 && sides[peerIndex]?.length) {
			hostileSidePairs.add(sidePairKey(sideUids[sideIdx], peerUid));
		}
	}
	rebuildHostilityMatrix();
	return true;
}

export function deepClone(obj) {
	if (!obj) return obj;
	try {
		return structuredClone(obj);
	} catch (_e) {
		return JSON.parse(
			JSON.stringify(obj, (_k, v) => {
				if (
					v &&
					typeof v === "object" &&
					(v instanceof HTMLImageElement ||
						v instanceof HTMLCanvasElement ||
						v instanceof Node)
				) {
					return undefined;
				}
				return v;
			}),
		);
	}
}

function getSideDisplayName(sideIndex, sideCountries = sides[sideIndex] || []) {
	const first = sideCountries[0];
	if (!first) return `Side ${String.fromCharCode(65 + sideIndex)}`;
	return sideCountries.length > 1
		? `${first.name} Allies`
		: first.name || `Side ${String.fromCharCode(65 + sideIndex)}`;
}

function applyBroadSetupPosture(posture) {
	const strategy = {
		ADAPTIVE: "BALANCED",
		AGGRESSIVE: "AGGRESSIVE",
		CAUTIOUS: "DEFENSIVE",
	}[posture];
	if (!strategy) return;
	for (const country of sides.flat()) {
		if (country) country.strategy = strategy;
	}
	document
		.querySelectorAll("#sides-container .strategy-select")
		.forEach((select) => {
			select.value = strategy;
		});
}

export function getAiOperationsSnapshot(
	sideUid = sideUids.find((uid) => _aiTaskForcesBySide.has(uid)),
) {
	if (gameMode !== "CONQUEST" || !sideUid) return null;
	const sideIndex = sideUids.indexOf(sideUid);
	if (sideIndex < 0) return null;
	return {
		sideUid,
		sideIndex,
		army: _aiDebugPlans[sideIndex]?.army || null,
		taskForces: (_aiTaskForcesBySide.get(sideUid) || []).map((task) => ({
			uid: task.id,
			id: task.id,
			label: task.target?.name || task.planType,
			phase: task.phase,
			readiness: task.readiness,
			stage: task.stage,
			progress: task.progress,
			advance: task.advance,
			secured: task.secured,
			reason: task.completionReason,
			objective: task.target,
			assemblyArea: task.assemblyArea || task.stagingAnchor,
			frontage: task.frontage || [],
			corridor: task.corridor || task.route || [],
			withdrawalAnchor: task.withdrawalAnchor,
		})),
	};
}

function warDeskOverviewRows() {
	const personnel = new Map();
	for (const unit of units) {
		if (unit.health > 0)
			personnel.set(
				unit.sovereignId,
				(personnel.get(unit.sovereignId) || 0) +
					getLiveFormationPersonnel(unit),
			);
	}
	const rows = [];
	const detail = (held, total) =>
		total > 0
			? `${((held / total) * 100).toFixed(1)}% original territory retained`
			: "Original territory unavailable";
	for (const definition of _warOverviewSides) {
		const sideIndex = sideUids.indexOf(definition.uid);
		let held = 0,
			total = 0,
			casualties = 0;
		const countryRows = [];
		for (const country of definition.countries) {
			const ledger = getCountryLedger(_territoryLedgerSnapshot, country.id);
			const original = ledger?.deJureTotal || 0;
			const retained =
				sideIndex >= 0 ? ledger?.deJureControlBySide?.[sideIndex] || 0 : 0;
			const losses = Math.round(countryCasualties.get(country.id) || 0);
			held += retained;
			total += original;
			casualties += losses;
			countryRows.push({
				kind: "country",
				color: country.color,
				label: country.name,
				primaryLabel: "Deployed manpower",
				value: Math.round(personnel.get(country.id) || 0),
				secondaryValue: losses,
				detail: detail(retained, original),
			});
		}
		rows.push({
			kind: "side",
			color:
				definition.countries.length === 1
					? countryRows[0].color
					: definition.color,
			label: definition.name,
			primaryLabel: "Manpower",
			value: sideIndex >= 0 ? Math.round(sideSoldiers[sideIndex] || 0) : 0,
			secondaryValue: casualties,
			detail: detail(held, total),
		});
		if (countryRows.length > 1) rows.push(...countryRows);
	}
	return rows;
}

function updateWarOverview(force = false) {
	if (gameMode !== "CONQUEST" || !_warOverviewSides.length) return;
	const now = performance.now();
	if (
		!force &&
		(now - _warOverviewLastUpdate < 500 ||
			document.getElementById("war-desk-body")?.hidden)
	)
		return;
	_warOverviewLastUpdate = now;
	renderWarOverview(warDeskOverviewRows());
}

function reopenConflictSetupAfterWar(...args) {
	simulationClient.stop();
	resetLocalSimulationClock();
	return lifecycle.reopenConflictSetupAfterWar(...args);
}

export async function startWar(...args) {
	simulationClient.stop();
	ensureSideInfluenceMaps();
	const result = await lifecycle.startWar(...args);
	if (gameState === "SIMULATING") await simulationClient.start();
	return result;
}

export async function _startWarInner(...args) {
	simulationClient.stop();
	ensureSideInfluenceMaps();
	const result = await lifecycle._startWarInner(...args);
	if (gameState === "SIMULATING") await simulationClient.start();
	return result;
}

export function computeAdjacency() {
	const adj = new Map();
	const total = worldControlMap.length;
	for (let i = 0; i < total; i++) {
		const id1 = worldControlMap[i];
		if (id1 <= 0) continue;

		const x = i % gridWidth;
		const y = Math.floor(i / gridWidth);

		// Only check right and down to avoid redundant pairs
		const neighbors = [];
		if (x < gridWidth - 1) neighbors.push(i + 1);
		if (y < gridHeight - 1) neighbors.push(i + gridWidth);

		for (const nIdx of neighbors) {
			const id2 = worldControlMap[nIdx];
			if (id2 > 0 && id1 !== id2) {
				if (!adj.has(id1)) adj.set(id1, new Set());
				if (!adj.has(id2)) adj.set(id2, new Set());
				adj.get(id1).add(id2);
				adj.get(id2).add(id1);
			}
		}
	}
	return adj;
}

export function triggerRandomWar() {
	if (!randomWarMode) return;

	// Never start a random war while a major conflict is already simulating,
	// to avoid corrupting existing sides and soft‑locking the game.
	if (!["SELECTING_P1", "SELECTING_P2"].includes(gameState)) return;

	if (!adjacencyCache) adjacencyCache = computeAdjacency();

	// Pre‑compute tile counts so we only pick real countries with land
	const tileCounts = new Map();
	for (let i = 0; i < worldControlMap.length; i++) {
		const id = worldControlMap[i];
		if (id > 0) {
			tileCounts.set(id, (tileCounts.get(id) || 0) + 1);
		}
	}

	const currentCombatants = new Set(sides.flat().map((c) => c.id));
	const eligibleCountries = Array.from(adjacencyCache.keys()).filter(
		(id) => id > 0 && tileCounts.get(id) > 0 && !currentCombatants.has(id),
	);

	if (eligibleCountries.length < 2) return;

	// Try to find a VALID pair of neighbors (different ids, both real countries with adjacency)
	let idA = -1,
		idB = -1;
	const shuffledEligible = eligibleCountries
		.slice()
		.sort(() => Math.random() - 0.5);

	for (const candidateA of shuffledEligible) {
		const neighborsSet = adjacencyCache.get(candidateA);
		if (!neighborsSet || neighborsSet.size === 0) continue;

		const neighborIds = Array.from(neighborsSet).filter(
			(id) =>
				id > 0 &&
				id !== candidateA &&
				tileCounts.get(id) > 0 &&
				!currentCombatants.has(id),
		);
		if (neighborIds.length === 0) continue;

		idA = candidateA;
		idB = neighborIds[Math.floor(Math.random() * neighborIds.length)];
		break;
	}

	// If we couldn't find a safe, adjacent pair, abort the random war request
	if (idA <= 0 || idB <= 0 || idA === idB) return;

	const metaA = countryMetadata[idA - 1];
	const metaB = countryMetadata[idB - 1];
	if (!metaA || !metaB) return;

	const countryA = {
		id: idA,
		name: metaA.name,
		color: metaA.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};
	const countryB = {
		id: idB,
		name: metaB.name,
		color: metaB.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};

	// Random war from setup: start a clean conflict using normal flow
	sides = [[countryA], [countryB]];
	const combatantIds = new Set([idA, idB]);
	let addProb = 0.5;
	while (sides.length < MAX_SIDES && addProb > 0.01) {
		if (Math.random() >= addProb) break;
		addProb /= 2;
		const candidates = [];
		for (const cid of combatantIds) {
			const neighbors = adjacencyCache.get(cid);
			if (!neighbors) continue;
			for (const nid of neighbors) {
				if (nid > 0 && tileCounts.get(nid) > 0 && !combatantIds.has(nid)) {
					candidates.push(nid);
				}
			}
		}
		if (candidates.length === 0) break;
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		const meta = countryMetadata[pick - 1];
		if (!meta) break;
		combatantIds.add(pick);
		sides.push([
			{
				id: pick,
				name: meta.name,
				color: meta.color,
				role: "OFFENSE",
				strategy: "BALANCED",
				buffState: "none",
			},
		]);
	}
	activeSideIndex = 0;
	updateSidesUI();
	startWar();
}

/**
 * Show benchmark results modal with frame timing statistics.
 */

/**
 * Benchmark mode: load Modern Day scenario, launch Russia vs China at max speed.
 * Auto-fetches the 2022 preset if the main menu is open with no data loaded yet.
 */

export function activateCountryMidWar(...args) {
	ensureSideInfluenceMaps(Math.max(sides.length, (args[1] || 0) + 1));
	return lifecycle.activateCountryMidWar(...args);
}

/**
 * Rebuild the global frontline direction field.
 * For every land cell, stores the unit-vector pointing toward the nearest
 * warzone cell whose |occupation| <= 0.25 (the "contested border band").
 * Uses a BFS / wave-front expansion so each cell is visited at most once — O(N).
 * Called at most once every FRONTLINE_FIELD_UPDATE_INTERVAL ticks.
 * All typed arrays are allocated once and reused to avoid GC pressure.
 */

/**
 * O(1) lookup: return direction from a unit's grid cell toward the nearest frontline.
 * Falls back to the old scan only if the field hasn't been built yet.
 */

/**
 * Assign proportional slots to garrison units along neutral border polylines
 * so they spread evenly instead of clustering at cities.
 */

const aiPlanner = createAiPlanner(applicationRuntime);
export const { scoreProposal, selectPlans } = aiPlanner;
const {
	getSideStrategyProfile,
	estimateLocalForces,
	operationalLocalRisk,
	findLandPathSummary,
	findNearestSeaIdx,
	findSeaPathSummary,
	getPlanSignature,
} = aiPlanner;

const aiRuntime = createAiRuntime(applicationRuntime);
const {
	operationalUnitPower,
	reconcileOperationalAiLifecycle,
	initializeOperationalAiRuntime,
	updateOperationalAiTaskForces,
	getArmyMovement,
	isArmyCellPassable,
} = aiRuntime;

const aiProposalPipeline = createAiProposalPipeline(applicationRuntime);
export const { generateAllProposals } = aiProposalPipeline;

/**
 * Proposal Engine: generate every possible plan candidate for a side.
 * Returns an array of lightweight proposal objects — no plan objects created yet.
 * @param {number} sideIdx
 * @returns {Array<Object>}
 */

/**
 * Score a proposal based on strategic value, feasibility, risk, urgency,
 * and posture/strategy alignment. Returns a numeric priority score.
 * @param {Object} proposal - proposal from generateAllProposals
 * @param {number} sideIdx
 * @returns {number} priority score
 */

/**
 * Select the best plans from scored proposals, allocate forces, and
 * create actual war plan objects. Returns array of created plan entries.
 * @param {number} sideIdx
 * @param {Array<Object>} scoredProposals - proposals with priority scores
 * @returns {Object} Selected offensive, defensive, naval, and garrison plans.
 */

const aiPlanExecutor = createAiPlanExecutor(applicationRuntime);
export const { evaluateAllPlans } = aiPlanExecutor;

const NAVAL_STALL_TICKS = 600; // ticks of no progress before abandoning naval/coastal plan
// longer stall before aborting second-wave naval plan

// ── Perf Report: type window.perfReport() in console ──
window.startBenchmark = startBenchmark;
developer_controls.bindPerfEnableHandler();
developer_controls.bindPerfDisableHandler();
developer_controls.bindPerfResetHandler();
developer_controls.bindPerfReportJsonHandler();
developer_controls.bindPerfReportHandler();
developer_controls.bindPerfTraceEnableHandler();
developer_controls.bindPerfTraceDisableHandler();
developer_controls.bindPerfTraceClearHandler();
developer_controls.bindPerfRunQuickHandler();
developer_controls.bindPerfRunSuiteHandler();
developer_controls.bindPerfSuiteReportHandler();
developer_controls.bindPerfSuiteJsonHandler();
developer_controls.bindPerfSaveBaselineHandler();
developer_controls.bindPerfLoadBaselineHandler();
developer_controls.bindPerfCompareBaselineHandler();
developer_controls.bindPerfClearBaselineHandler();
window.aiDebugReport = (sideIdx = null) => {
	if (sideIdx == null) return _aiDebugPlans;
	return _aiDebugPlans[sideIdx];
};

export function updateLoop() {
	const shouldSimulate =
		gameState === "SIMULATING" ||
		(godModeActive &&
			(preGodModeState === "SIMULATING" || preGodModeState === "WAR_OVER"));
	if (!shouldSimulate) {
		return;
	}
	// Avoid running the visual loop while a background tick loop is active
	if (document.hidden) return;

	// --- Performance measurement ---
	const realNow = performance.now();
	const _frameDt = _perfLastTime > 0 ? realNow - _perfLastTime : 16.67;
	if (_perfLastTime > 0) finalizePendingPerfFrame(_frameDt);
	let framePerfEntry = null;
	const shouldTrackFrame =
		window.__perf &&
		!window.__perf._trackingPaused &&
		(window.__perf._mode !== "off" || _isBenchmarking);
	if (_perfLastTime > 0) {
		const dt = _frameDt;
		if (shouldTrackFrame) {
			framePerfEntry = {
				frame: simFrameCount,
				ms: 0,
				benchmark: _isBenchmarking,
				mainWorkMs: 0,
				browserWaitMs: 0,
				simulationMs: 0,
				hudMs: 0,
				renderMs: 0,
				otherMainMs: 0,
				simSpeed,
				units: units.length,
				taskForces: Array.from(_aiTaskForcesBySide.values()).reduce(
					(sum, taskForces) => sum + taskForces.length,
					0,
				),
				tickStart: (window.__perf?.ticks || 0) + 1,
				tickEnd: window.__perf?.ticks || 0,
				tickCount: 0,
				rendered: false,
				skippedRender: false,
				requestedSubTicks: 0,
				executedSubTicks: 0,
				cappedSubTicks: 0,
				accumulatorBefore: frameAccumulator,
				accumulatorAfter: frameAccumulator,
			};
		}
		_perfFrameTimeSum += dt;
		_perfFrameCount++;
		if (_perfFrameCount >= 30) {
			const avgMs = _perfFrameTimeSum / _perfFrameCount;
			const fps = 1000 / avgMs;
			let text = `FPS: ${fps.toFixed(0)} | Frame: ${avgMs.toFixed(1)}ms`;
			if (_isBenchmarking) {
				const remaining = Math.max(
					0,
					Math.ceil((_perfBenchmarkEnd - realNow) / 1000),
				);
				text += ` | Remaining Sim Time: ${remaining}s`;
			}
			perfOverlay.textContent = text;
			_perfFrameTimeSum = 0;
			_perfFrameCount = 0;
		}
	}
	_perfLastTime = realNow;

	// End-of-benchmark check: auto-pause at 60s mark
	if (_isBenchmarking && realNow >= _perfBenchmarkEnd) {
		_isBenchmarking = false;
		isPaused = true;
		updateSpeedControls();
		if (perfOverlay) perfOverlay.style.display = "none";
		showBenchmarkResults();
		animationFrameId = requestAnimationFrame(updateLoop);
		return;
	}
	// --- End performance measurement ---

	_frameSimulationCommitFlags.clear();
	let simulationWorkMs = 0;
	simulationClient.syncControls();
	if (!simulationClient.ownsState && !isPaused) {
		const started = performance.now();
		localSimulationClock.configure(
			{ speed: simSpeed, paused: isPaused },
			realNow,
		);
		localSimulationClock.pump(realNow);
		simulationWorkMs = performance.now() - started;
		if (framePerfEntry) framePerfEntry.simulationMs = simulationWorkMs;
	}
	// Worker positions/effects change with snapshots, not display refresh. Keep
	// dirty settings/load events and camera settlement responsive while avoiding
	// duplicate paints and stacking a paint on a costly snapshot intake.
	const snapshotWorkMs = simulationClient.consumePresentationWork();
	if (framePerfEntry) framePerfEntry.snapshotMs = snapshotWorkMs;
	const presentationRevision = simulationClient.ownsState
		? simulationClient.presentationRevision
		: _simTickCount;
	const zoomSettleDue =
		typeof influenceLayer?.hasPendingZoomSettle === "function" &&
		influenceLayer.hasPendingZoomSettle();
	const shouldPaint = presentationScheduler.admit({
		now: realNow,
		revision: presentationRevision,
		dirty: Boolean(influenceLayer?._invalidLayers),
		workMs: simulationWorkMs + snapshotWorkMs,
		force: zoomSettleDue,
	});

	if (!shouldPaint) {
		if (shouldTrackFrame) {
			window.__perf._scheduler.skippedRenderFrames++;
		}
		if (framePerfEntry) {
			framePerfEntry.skippedRender = true;
			queuePerfFrame(framePerfEntry, realNow);
		}
		animationFrameId = requestAnimationFrame(updateLoop);
		return;
	}
	if (shouldTrackFrame) {
		window.__perf._scheduler.renderedFrames++;
	}

	const sideUnitCounts = _cachedSideUnitCounts;
	const sideSoldierEsts = _cachedSideSoldierEsts;
	const hudStarted = framePerfEntry ? performance.now() : 0;
	if (framePerfEntry) framePerfEntry.hudStart = hudStarted;

	for (let si = 0; si < sides.length; si++) {
		const el = _cachedSoldierEls[si];
		if (el)
			setPresentationText(
				el,
				influenceLayer.formatSoldiers(
					sideSoldierEsts[si] > 0 && sideSoldierEsts[si] < 1
						? 1
						: sideSoldierEsts[si],
				),
			);
		// Update momentum indicator
		const mel = _cachedMomentumEls[si];
		if (mel) {
			const phase = _sideWarPhase[si] || "STALEMATE";
			const pc = PHASE_CONFIG[phase] || PHASE_CONFIG.STALEMATE;
			if (mel.style.getPropertyValue("--momentum-color") !== pc.color)
				mel.style.setProperty("--momentum-color", pc.color);
			setPresentationText(mel, `${pc.symbol} ${phase}`);
		}
	}

	if (_cachedUnitCountSpans.length) {
		for (let si = 0; si < _cachedUnitCountSpans.length; si++) {
			setPresentationText(_cachedUnitCountSpans[si], sideUnitCounts[si]);
		}
	}

	for (let si = 0; si < sides.length; si++) {
		const el = _cachedCityEls[si];
		if (el) {
			setPresentationText(
				el,
				getSideLedger(_territoryLedgerSnapshot, si)?.citiesControlled || 0,
			);
		}
	}

	// Update tug-of-war bar with actual territory percentages
	if (_cachedSideTerritoryPcts.length > 0) {
		for (let si = 0; si < sides.length; si++) {
			const segEl = _cachedTerritorySegEls[si];
			const width = `${_cachedSideTerritoryPcts[si]}%`;
			if (segEl && segEl.style.width !== width) segEl.style.width = width;
			const pctEl = _cachedTerritoryCtrlEls[si];
			setPresentationText(pctEl, width);
		}
	}

	// Throttled UI rendering in Flag mode to maintain responsive interaction and framerate

	// Throttled Combatants UI update
	if (realNow - _lastCombatantsHudAt >= 500) {
		_lastCombatantsHudAt = realNow;
		updateCombatantsUI();
		updateWarOverview();
	}

	// Refresh casualty values at most every 100 ms for a live counting effect.
	const casualtyContainer = document.getElementById("casualty-lists-container");
	if (casualtyContainer && realNow - _lastCasualtyHudAt >= 100) {
		_lastCasualtyHudAt = realNow;
		let entriesKey = "";
		const entriesFlat = [];
		const activeIds = new Set(_tickAllCombatants.map((c) => c.id));
		for (let sIdx = 0; sIdx < sides.length; sIdx++) {
			if (!sides[sIdx] || sides[sIdx].length === 0) continue;
			entriesKey += `side:${sIdx}|`;
			const entries = initialCombatants.filter((c) => c.sideIndex === sIdx);
			sides[sIdx].forEach((c) => {
				if (!entries.some((e) => e.id === c.id)) {
					entries.push({ id: c.id, name: c.name, sideIndex: sIdx });
				}
			});
			if (entries.length === 0) continue;
			for (const e of entries) {
				entriesFlat.push({ ...e, side: sIdx });
				entriesKey += `${e.id}:${activeIds.has(e.id) ? "active" : "defeated"},`;
			}
		}
		const structureChanged = entriesKey !== _casualtyStructureKey;
		if (structureChanged) {
			_casualtyStructureKey = entriesKey;
			const primaryActiveCountryBySide = new Map();
			for (const entry of entriesFlat) {
				if (
					activeIds.has(entry.id) &&
					!primaryActiveCountryBySide.has(entry.side)
				) {
					primaryActiveCountryBySide.set(entry.side, entry.id);
				}
			}
			let html = "";
			let currentSide = -1;
			for (const e of entriesFlat) {
				const casualties = countryCasualties.get(e.id) || 0;
				const formatted = influenceLayer.formatSoldiers(casualties);
				const isDefeated = !activeIds.has(e.id);
				if (e.side !== currentSide) {
					if (currentSide !== -1) html += `</div>`;
					currentSide = e.side;
					html += `<div class="casualty-side-list">`;
				}
				const isPrimary = primaryActiveCountryBySide.get(e.side) === e.id;
				const meta = countryMetadata[e.id - 1];
				let flagSrc = meta?.flagUrl || "";
				if (meta?.tempFlag instanceof HTMLCanvasElement) {
					try {
						flagSrc = meta.tempFlag.toDataURL();
					} catch (_e) {}
				}
				const safeFlagSrc = escapeHtml(flagSrc);
				html += `<div class="casualty-item ${isPrimary ? "primary" : "secondary"} ${isDefeated ? "is-defeated" : ""}" data-ctype="cas-item" data-cid="${e.id}" data-side="${currentSide}">
					<img src="${safeFlagSrc}" class="cas-flag ${isPrimary ? "" : "small"}" alt="" loading="lazy" decoding="async">
					<div class="cas-value hud-side-accent" data-cval="${e.id}">${formatted}</div>`;
				if (isPrimary) {
					const mpRemaining = Math.max(0, sideSoldiers[currentSide]);
					html += `<span class="cas-side-mp hud-side-accent" data-sidemp="${currentSide}">${influenceLayer.formatSoldiers(mpRemaining)}</span>`;
				}
				html += `</div>`;
			}
			if (currentSide !== -1) html += `</div>`;
			casualtyContainer.innerHTML = html;
			casualtyContainer
				.querySelectorAll(".casualty-item[data-side]")
				.forEach((item) => {
					const sideIdx = Number(item.getAttribute("data-side"));
					item.style.setProperty(
						"--side-color",
						sideColors[sideIdx].replace(rgbaRe, "1)"),
					);
				});
			_casualtyValueEls = {};
			casualtyContainer.querySelectorAll("[data-cval]").forEach((el) => {
				_casualtyValueEls[el.getAttribute("data-cval")] = el;
			});
			_casualtySideMpEls = {};
			casualtyContainer.querySelectorAll(".cas-side-mp").forEach((el) => {
				_casualtySideMpEls[el.getAttribute("data-sidemp")] = el;
			});
		} else {
			for (const e of entriesFlat) {
				const el = _casualtyValueEls[e.id];
				if (el) {
					const casualties = countryCasualties.get(e.id) || 0;
					setPresentationText(el, influenceLayer.formatSoldiers(casualties));
				}
			}
			// Update side manpower footers
			for (const [si, el] of Object.entries(_casualtySideMpEls || {})) {
				const sIdx = Number(si);
				const mpRemaining = Math.max(0, sideSoldiers[sIdx]);
				setPresentationText(el, influenceLayer.formatSoldiers(mpRemaining));
			}
		}
	}
	if (framePerfEntry) framePerfEntry.hudMs = performance.now() - hudStarted;

	const renderStart = framePerfEntry ? performance.now() : 0;
	if (framePerfEntry) framePerfEntry.renderStart = renderStart;
	influenceLayer.render();
	presentationScheduler.painted(realNow, presentationRevision, zoomSettleDue);
	if (framePerfEntry) {
		framePerfEntry.renderMs = performance.now() - renderStart;
		framePerfEntry.rendered = true;
		queuePerfFrame(framePerfEntry, realNow);
	}

	// Show/hide performance overlay only during benchmark runs
	if (perfOverlay) {
		perfOverlay.style.display =
			_isBenchmarking || _isBenchmarkWarmingUp ? "block" : "none";
	}

	animationFrameId = requestAnimationFrame(updateLoop);
}

export function updateCombatantsUI() {
	// Combatants list removed from stats panel to reduce clutter.
	// Users can click nations directly on the map to buff them via the inspector.
}

/**
 * Build and show global leaderboard of all countries with current size and estimated unit strength.
 */
export function openLeaderboard() {
	if (
		!leaderboardOverlay ||
		!leaderboardList ||
		!countryMetadata ||
		!worldControlMap
	)
		return;

	// Count tiles per country id
	const maxId = countryMetadata.reduce(
		(max, m) => (m ? Math.max(max, m.id) : max),
		0,
	);
	const tileCounts = new Int32Array(maxId + 1);
	for (let i = 0; i < worldControlMap.length; i++) {
		const id = worldControlMap[i];
		if (id > 0 && id <= maxId) tileCounts[id]++;
	}

	const lang = getCookie("mw_lang") || "en";

	const rows = [];
	for (let i = 0; i < countryMetadata.length; i++) {
		const meta = countryMetadata[i];
		if (!meta) continue;
		const id = meta.id;
		const tiles = tileCounts[id] || 0;

		// Exclude Antarctica from the leaderboard to avoid it dominating due to map area
		const rawName = meta.name || "Unknown";
		if (rawName === "Antarctica") continue;

		// Size zero: still show (releasables / dead states), but mark as 0 tiles
		const estUnits = estimateUnitsForCountry ? estimateUnitsForCountry(id) : 0;

		const displayName = getTranslation(rawName, lang, "NATIONS");
		const flagUrl = meta.tempFlag?.src
			? meta.tempFlag.src
			: meta.flagUrl || getFlagUrl(findCodeByName(meta.name), meta.name);
		rows.push({
			id,
			name: displayName,
			rawName,
			tiles,
			estUnits,
			flagUrl,
		});
	}

	// Primary sort: estimated units desc, secondary: tiles desc, tertiary: name
	rows.sort((a, b) => {
		if (b.estUnits !== a.estUnits) return b.estUnits - a.estUnits;
		if (b.tiles !== a.tiles) return b.tiles - a.tiles;
		return a.name.localeCompare(b.name);
	});

	leaderboardList.innerHTML = rows
		.map((row, idx) => {
			const unitsLabel =
				row.estUnits > 0 ? influenceLayer.formatSoldiers(row.estUnits) : "—";
			const tilesLabel = row.tiles.toLocaleString();
			const rank = idx + 1;
			const flagSrc = row.flagUrl ? escapeHtml(row.flagUrl) : "";
			const safeName = escapeHtml(row.name);
			return `
            <div class="scroller-card" style="padding: 10px; display: flex; align-items: center; gap: 10px;">
                <div class="leaderboard-rank" style="width: 30px; font-family: 'Playfair Display'; font-size: 18px;">${rank}</div>
                ${flagSrc ? `<img src="${flagSrc}" class="leaderboard-flag" style="width: 35px; height: 22px;">` : `<div class="leaderboard-flag" style="width: 35px; height: 22px; background:#111;"></div>`}
                <div class="scroller-card-name" style="flex: 2; font-size: 16px; margin: 0;">${safeName}</div>
                <div class="leaderboard-tiles" style="flex: 1; text-align: right; color: #888; font-size: 12px;">${tilesLabel}</div>
                <div class="leaderboard-units" style="flex: 1; text-align: right; font-weight: bold; font-size: 13px;">${unitsLabel}</div>
            </div>
        `;
		})
		.join("");

	leaderboardOverlay.style.display = "flex";
}

export function showTreatyOffer(proposerSideIdx, willAccept) {
	lastTreatyTime = Date.now();
	const name = getSideDisplayName(proposerSideIdx);
	treatyMsg.innerText = `${name} requests peace`;
	treatyAlert.style.display = "block";
	document.getElementById("treaty-status").innerText =
		"Considering proposal...";
	const token = _warLifecycleToken;
	scheduleWarLifecycleCallback(
		() => {
			if (gameState !== "SIMULATING") return;
			document.getElementById("treaty-status").innerText = willAccept
				? "Treaty Accepted"
				: "Proposal Rejected";
			scheduleWarLifecycleCallback(
				() => {
					if (gameState !== "SIMULATING") return;
					if (willAccept) {
						if (sides.length > 2) _signSelectiveSideExit(proposerSideIdx);
						else applyTreaty("PEACE_TREATY");
					} else {
						treatyAlert.style.display = "none";
						lastTreatyTime = Date.now();
					}
				},
				1500,
				token,
			);
		},
		2000,
		token,
	);
}

export function capitulateCountry(...args) {
	return lifecycle.capitulateCountry(...args);
}

export function applyTreaty(...args) {
	if (simulationClient.active)
		return simulationClient.command({
			type: "APPLY_TREATY",
			treatyType: args[0],
			winnerSideIdx: args[1],
			endingReason: args[2],
		});
	return lifecycle.applyTreaty(...args);
}

export function resetToSelection(...args) {
	simulationClient.stop();
	return lifecycle.resetToSelection(...args);
}

export async function resetGame(...args) {
	simulationClient.stop();
	return lifecycle.resetGame(...args);
}

/**
 * INTERACTION
 */
export function findCityAtLatLng(latlng) {
	if (!cities || cities.length === 0) return null;
	const pt = map.latLngToContainerPoint(latlng);
	const maxDistSq = 8 * 8;
	let best = null;
	let bestDistSq = maxDistSq;

	const bounds = map.getBounds();
	cities.forEach((c) => {
		if (c.lat == null || c.lng == null) return;
		if (!bounds.contains([c.lat, c.lng])) return;
		const cp = map.latLngToContainerPoint([c.lat, c.lng]);
		const dx = cp.x - pt.x;
		const dy = cp.y - pt.y;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestDistSq) {
			bestDistSq = d2;
			best = c;
		}
	});
	return best;
}

map_input.bindMapClick();

map_input.bindMapCoordinatesMousemove();

menu_controls.bindViewModeBtnClick();

menu_controls.bindAllianceViewCheckboxChange();

menu_controls.bindBattlesToggleBtnClick();

menu_controls.bindLabelsToggleBtnClick();

menu_controls.bindCitiesToggleBtnClick();

menu_controls.bindWarplansToggleBtnClick();

// UI settings tab wiring
const showWarplansCheckbox = document.getElementById("show-warplans-checkbox");
const showLabelsCheckbox = document.getElementById("show-labels-checkbox");
const showCitiesCheckbox = document.getElementById("show-cities-checkbox");
const showBattlesCheckbox = document.getElementById("show-battles-checkbox");
const showAllianceCheckbox = document.getElementById("show-alliance-checkbox");

const armyDiagnosticsCheckbox = document.getElementById(
	"show-army-diagnostics-checkbox",
);
showArmyDiagnostics = getCookie("mw_show_army_decisions") === "true";
if (armyDiagnosticsCheckbox) {
	armyDiagnosticsCheckbox.checked = showArmyDiagnostics;
	armyDiagnosticsCheckbox.addEventListener("change", (event) => {
		showArmyDiagnostics = event.target.checked;
		setCookie("mw_show_army_decisions", showArmyDiagnostics ? "true" : "false");
		influenceLayer?.render();
	});
}

// Load saved UI preferences
if (getCookie("mw_show_warplans") === "false") {
	showWarPlans = false;
	if (showWarplansCheckbox) showWarplansCheckbox.checked = false;
}
if (getCookie("mw_show_labels") === "false") {
	showCountryLabels = false;
	if (showLabelsCheckbox) showLabelsCheckbox.checked = false;
}
if (getCookie("mw_show_cities") === "false") {
	showNonCapitalCities = false;
	if (showCitiesCheckbox) showCitiesCheckbox.checked = false;
}
if (getCookie("mw_show_battles") === "true") {
	showBattleIndicators = true;
	if (showBattlesCheckbox) showBattlesCheckbox.checked = true;
} else if (getCookie("mw_show_battles") === "false") {
	showBattleIndicators = false;
	if (showBattlesCheckbox) showBattlesCheckbox.checked = false;
}
if (getCookie("mw_show_alliance") === "true") {
	allianceViewEnabled = true;
	if (showAllianceCheckbox) showAllianceCheckbox.checked = true;
}

menu_controls.bindShowWarplansCheckboxChange();
menu_controls.bindShowLabelsCheckboxChange();
menu_controls.bindShowCitiesCheckboxChange();
menu_controls.bindShowBattlesCheckboxChange();
menu_controls.bindShowAllianceCheckboxChange();

// Sync mountain toggles
menu_controls.bindNoPeaceCheckboxChange();

// Secret Sounds checkbox
const useSecretSoundsCheckbox = document.getElementById(
	"use-secret-sounds-checkbox",
);

menu_controls.bindUseSecretSoundsCheckboxChange();

menu_controls.bindSetupDisableMountainsCheckboxChange();

menu_controls.bindMainDisableMountainsCheckboxChange();

menu_controls.bindRestartScenarioBtnClick();

// QUICK RESTART: instant in‑memory reset back to scenario start without loading overlay

menu_controls.bindResetBtnClick();
// In‑game MENU button: return to main menu without full page reload

editor_file_controls.bindEditorUpdateBtnClick();

sandbox_controls.bindGodBombBtnClick();

menu_controls.bindForcePeaceBtnClick();

export function unilateralExitConflict(...args) {
	return editSimulation(() => lifecycle.unilateralExitConflict(...args));
}

export function _signSelectiveSideExit(...args) {
	return editSimulation(() => lifecycle._signSelectiveSideExit(...args));
}

export function _signSelectivePeace(...args) {
	return editSimulation(() => lifecycle._signSelectivePeace(...args));
}

export const SPEED_STEPS = [1, 2, 3, 5, 10];
export let currentSpeedIndex = 0; // Start at 1x.

export function updateSpeedControls() {
	for (const input of speedInputs) {
		const index = Number(input.dataset.speedIndex);
		input.checked = index === currentSpeedIndex;
		input.parentElement.classList.toggle(
			"is-filled",
			index <= currentSpeedIndex,
		);
	}
	speedControls.dataset.paused = String(isPaused);
	pauseBtn.setAttribute("aria-pressed", String(isPaused));
	pauseBtn.setAttribute(
		"aria-label",
		isPaused ? "Resume simulation" : "Pause simulation",
	);
	pauseBtn.title = isPaused
		? "Resume simulation (Space)"
		: "Pause simulation (Space)";
}

export function togglePause() {
	isPaused = !isPaused;
	simulationClient.syncControls();
	localSimulationClock.configure({ paused: isPaused, speed: simSpeed });
	updateSpeedControls();
	statusText.innerText = isPaused
		? getTranslation("SIM_PAUSED")
		: ffaMode
			? getTranslation("STABLE")
			: getTranslation("STABLE");
}

menu_controls.bindPauseBtnClick();

// Keybinds
simulation_controls.bindDocumentKeydown();

export function unclaimSelectedCountry() {
	if (editingCountryId <= 0) return;

	const meta = countryMetadata[editingCountryId - 1];
	const name = meta ? meta.name : "Nation";

	// Visual confirmation is good for destructive actions
	if (
		!confirm(
			`Satellite Directive: Are you sure you want to unclaim all territory for ${name}?`,
		)
	)
		return;

	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === editingCountryId) {
			worldControlMap[i] = 0;
		}
	}

	// Also remove from any active conflict sides
	sides.forEach((side) => {
		const idx = side.findIndex((c) => c.id === editingCountryId);
		if (idx > -1) side.splice(idx, 1);
	});

	updateSidesUI();
	countryInspector.style.display = "none";
	editingCountryId = -1;
	recalculateAllBounds();
	influenceLayer.render();
	statusText.innerText = `UNCLAIMED: ${name} territory has been returned to neutral status.`;
}

export function setSpeed(index) {
	currentSpeedIndex = Math.max(0, Math.min(index, SPEED_STEPS.length - 1));
	simSpeed = SPEED_STEPS[currentSpeedIndex];
	simulationClient.syncControls();
	localSimulationClock.configure({ speed: simSpeed, paused: isPaused });
	updateSpeedControls();
	frameAccumulator = 0;
}

menu_controls.bindSpeedSelectorChange();

menu_controls.bindCustomTrackInputChange();

menu_controls.bindClearCustomTrackBtnClick();

menu_controls.bindTabScenariosBtnClick();
menu_controls.bindTabCountriesBtnClick();
menu_controls.bindTabFlagsBtnClick();

community_controls.bindDeleteScenarioHandler();

community_controls.bindDeleteFlagHandler();

/**
 * GLOBAL EXPORTS FOR HUB INTERACTION
 */
community_controls.bindImportFlagFromLibraryHandler();

export function saveCountryLocally(countryId) {
	const meta = countryMetadata[countryId - 1];
	if (!meta) return;
	const cells = collectCountryCells(worldControlMap, gridWidth, [
		countryId,
	]).get(countryId);
	meta.savedCells = cells;
	const data = createCountryExport(meta, cells, CONFIG.GRID_RES);
	downloadBlob(
		new Blob([JSON.stringify(data)], { type: "application/json" }),
		`${meta.name.replace(/\s+/g, "_")}_country.json`,
	);
	statusText.innerText = `SAVED: ${meta.name} exported locally`;
}

community_controls.bindDeleteCountryHandler();

community_controls.bindImportFromLibraryHandler();

community_controls.bindPlayFromHubHandler();

community_controls.bindRemixFromHubHandler();

/**
 * PRELOAD CORE VISUAL ASSETS
 * Caches large menu backgrounds and thematic overlays to prevent flickering during transitions.
 */
export function preloadAssets() {
	const assets = [
		"assets/images/2022.webp",
		"assets/images/1974.webp",
		"assets/images/1942.webp",
		"assets/images/1936.webp",
		"assets/images/1914.webp",
		"assets/images/1804.webp",
		"assets/images/1492.webp",
	];
	assets.forEach((src) => {
		const img = new Image();
		img.src = src;
	});
}

// Initialization logic
export function initializeEngine(refreshLoadedGeography = true) {
	if (simulationClient.active)
		return editSimulation(() => initializeEngineOwned(refreshLoadedGeography));
	return initializeEngineOwned(refreshLoadedGeography);
}
function initializeEngineOwned(refreshLoadedGeography) {
	const gridRes = parseFloat(document.getElementById("grid-res-select").value);
	const unitLimit = parseInt(
		document.getElementById("unit-limit-select").value,
		10,
	);

	recruitModel =
		document.getElementById("recruit-model-select")?.value || "balanced";

	// Sync global toggles from both main settings and setup panel sources
	const mtDisabled =
		document.getElementById("disable-mountains-checkbox").checked ||
		document.getElementById("setup-disable-mountains-checkbox").checked;
	mountainsEnabled = !mtDisabled;

	showUnitsVisually = !document.getElementById(
		"disable-units-visually-checkbox",
	).checked;
	hideCurvedLabels = !!document.getElementById("hide-curved-labels-checkbox")
		?.checked;
	disableCountryGradient = !!document.getElementById(
		"disable-country-gradient-checkbox",
	)?.checked;

	if (
		worldControlMap &&
		CONFIG.GRID_RES !== gridRes &&
		(gameState === "SIMULATING" || godModeActive)
	)
		resizeSimulationGrid(applicationRuntime, gridRes);
	const hadGeography = rawGeoJsonData || landMask?.some((value) => value > 0);
	// Check if configuration changed enough to require re-allocation
	if (CONFIG.GRID_RES !== gridRes || !worldControlMap) {
		CONFIG.GRID_RES = gridRes;
		CONFIG.MAX_UNITS_PER_SIDE = unitLimit;

		// Allocate Grid
		gridWidth = Math.ceil(360 / CONFIG.GRID_RES);
		gridHeight = Math.ceil(180 / CONFIG.GRID_RES);
		worldControlMap = new Uint16Array(gridWidth * gridHeight);
		deJureMap = new Uint16Array(gridWidth * gridHeight);
		provinceMap = new Int32Array(gridWidth * gridHeight);
		occupationMap = new Float32Array(gridWidth * gridHeight);
		initSideInfluenceMaps();
		primaryOccupierMap = new Uint16Array(gridWidth * gridHeight);
		landMask = new Uint8Array(gridWidth * gridHeight);
		biomeMask = new Uint8Array(gridWidth * gridHeight);
		terrainMask = new Float32Array(gridWidth * gridHeight);

		// If we are already in a mode that has geography loaded, we should refresh it
		if (hadGeography && refreshLoadedGeography) {
			const isBlank = gameMode === "EDITOR";
			ensureRawGeography()
				.then((data) => data && updateLandMask(data.features, 1, isBlank))
				.catch((error) => {
					console.warn("Geography refresh failed:", error);
				});
		}
	} else {
		CONFIG.MAX_UNITS_PER_SIDE = unitLimit;
	}
}

wireAudioControls({
	musicVolumeSlider,
	musicVolVal,
	muteBtn,
	isSimulating: () => gameState === "SIMULATING",
});

menu_controls.bindPresetLowBtnClick();

menu_controls.bindPresetDefaultBtnClick();

menu_controls.bindLaunchBtnClick();

// Auto-load settings on boot
export function checkAutoLaunch() {
	if (getCookie("mw_skip_settings") === "true") settingsController.restore();

	initializeEngine();
	settingsOverlay.style.display = "none";
	mainMenu.style.display = "flex";
	gameState = "MAIN_MENU";
	launchBtn.textContent = "Save settings";
}

// Settings Tab Logic
menu_controls.bindSettingsTabBtnClick();

// Global invisible buffs toggle wiring
if (disableInvisibleBuffsCheckbox)
	disableInvisibleBuffsCheckbox.checked = !invisibleBuffsEnabled;

checkAutoLaunch();
// Initial language application must happen after all DOM is ready and checkAutoLaunch is done
configureLanguageUi({
	statusText: () => statusText,
	countryMetadata: () => countryMetadata,
	refreshSides: updateSidesUI,
});
menu_controls.bindLanguageSelectChange();
applyLanguage();
updateRestartVisibility();

// Initialize editor tools page if toolbox exists
if (editorToolbox) {
	updateEditorToolPage(1);
}

menu_controls.bindMainSettingsBtnClick();

menu_controls.bindBenchmarkBtnClick();

menu_controls.bindBenchmarkDismissBtnClick();

menu_controls.bindHelpBtnClick();

menu_controls.bindFullscreenBtnClick();
menu_controls.bindHudMenuClick();

menu_controls.bindIngameSettingsBtnClick();

export const closeSettingsBtn = document.getElementById("close-settings-btn");
menu_controls.bindCloseSettingsBtnClick();

menu_controls.bindPlayModeBtnClick();

menu_controls.bindBackToNavBtnClick();

/**
 * DYNAMIC MENU BACKGROUND SYSTEM
 */

export let queuedScenarioAction = null;
export const enterScenarioBtn = document.getElementById("enter-scenario-btn");

menu_controls.bindEnterScenarioBtnClick();

// Wire Scroller Cards
menu_controls.bindScrollerChoiceModernClick();
menu_controls.bindScrollerChoice1936Click();
menu_controls.bindScrollerChoice1914Click();

const scenarioMenuDependencies = {
	primeAudio,
	setLoadingThematic,
	loadingStatus,
	loadingOverlay,
	mainMenu,
	initAudio,
	loadPreset: performPresetLoad,
	setContext: (context) => {
		currentScenarioContext = context;
		activeScenarioId = null;
	},
	modernFallback: async () => {
		gameMode = "CONQUEST";
		gameState = "SELECTING_P1";
		const mapRes = document.getElementById("map-res-select").value;
		const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
		mainMenu.style.display = "none";
		await loadCountries(geoUrl, false);
		initAudio();
	},
};
menu_controls.bindChoiceModernDayClick();

menu_controls.bindChoice1936ScenarioClick();

menu_controls.bindChoiceWW1ScenarioClick();

menu_controls.bindCancelConquestChoiceClick();

/**
 * EDITOR LOGIC
 */

menu_controls.bindCloseReleaseModalBtnClick();

country_actions.bindReleaseNationHandler();

map_input.bindMapMousedown();

map_input.bindMapPaintMousemove();

map_input.bindMapMouseup();

editor_tool_controls.bindEditorCreateBtnClick();

menu_controls.bindCancelCreateBtnClick();

inspector_controls.bindConfirmCreateBtnClick();

inspector_controls.bindInspectNameInputInput();

inspector_controls.bindInspectHubFlagBtnClick();

inspector_controls.bindInspectFetchFlagBtnClick();

inspector_controls.bindInspectFlagInputChange();

inspector_controls.bindInspectColorPickerInput();

editor_file_controls.bindShareCountryBtnClick();

editor_file_controls.bindShareFlagBtnClick();

editor_file_controls.bindCancelShareFlagBtnClick();

editor_file_controls.bindConfirmShareFlagBtnClick();

editor_file_controls.bindCancelShareCountryBtnClick();

editor_file_controls.bindConfirmShareCountryBtnClick();

inspector_controls.bindInspectPaintBtnClick();

inspector_controls.bindInspectAnnexClickBtnClick();

editor_tool_controls.bindEditorPaintBtnClick();

editor_tool_controls.bindEditorFillBtnClick();

editor_tool_controls.bindEditorUnclaimBtnClick();

editor_tool_controls.bindEditorTerrainBtnClick();

editor_tool_controls.bindEditorPlaceDivisionBtnClick();

menu_controls.bindBrushSizeSliderInput();

inspector_controls.bindAnnexCountryBtnClick();

// Ally controls
inspector_controls.bindAddAllyBtnClick();

inspector_controls.bindClearAlliesBtnClick();

// Alliance flag upload: sets a shared flag for the whole alliance group (used only in Alliance View / Flag View)
inspector_controls.bindAllianceFlagInputChange();

menu_controls.bindSetOverlordBtnClick();

menu_controls.bindSetReleasableBtnClick();

inspector_controls.bindClearOverlordBtnClick();

inspector_controls.bindCloseInspectorBtnClick();

inspector_controls.bindInspectBuffBtnClick();

// City inspector logic

inspector_controls.bindCityNameInputInput();

inspector_controls.bindCityOwnerSelectChange();

inspector_controls.bindCityCapitalCheckboxChange();

inspector_controls.bindCityMoveBtnClick();

inspector_controls.bindCityDeleteBtnClick();

inspector_controls.bindCityCloseBtnClick();

editor_tool_controls.bindEditorExitBtnClick();

editor_tool_controls.bindEditorMapSettingsBtnClick();

menu_controls.bindMapSettingsCancelBtnClick();

menu_controls.bindMapSettingsApplyBtnClick();

/**
 * Editor tools paging: split the crowded toolbox into two pages.
 * Page 1: scenario-level tools; Page 2: country library / ZIP tools.
 */

editor_tool_controls.bindEditorToolPages();

editor_tool_controls.bindEditorTestBtnClick();

editor_file_controls.bindEditorSaveBtnClick();

editor_file_controls.bindEditorLoadBtnClick();

editor_tool_controls.bindEditorHubBtnClick();

editor_tool_controls.bindEditorLibraryBtnClick();

editor_tool_controls.bindEditorSaveCountryBtnClick();

editor_tool_controls.bindEditorLoadCountryBtnClick();

editor_file_controls.bindEditorSaveMultiBtnClick();

/**
 * Save all countries with any territory in the scenario into a ZIP of per‑country JSONs.
 */
editor_file_controls.bindEditorSaveAllZipBtnClick();

/**
 * Load multiple country JSON files from a ZIP and merge them into the current scenario.
 */

// -------- Overlay Tools Implementation --------

reference_controls.bindCustomSatInputChange();

menu_controls.bindClearSatBtnClick();

reference_controls.bindUploadSatBtnClick();
reference_controls.bindUploadRefBtnClick();

reference_controls.bindRefImageInputChange();

reference_controls.bindRefOpacitySliderInput();

export const refAboveCheckbox = document.getElementById("ref-above-checkbox");
reference_controls.bindRefAboveCheckboxChange();

reference_controls.bindRefScaleSliderInput();

reference_controls.bindClearRefBtnClick();

editor_file_controls.bindEditorDownloadMapBtnClick();

// -------- Procedural Nation Generation (For empty presets) --------
export const noNationsModal = document.getElementById("no-nations-modal");

export const randomNationsCountInput = document.getElementById(
	"random-nations-count",
);
export const confirmRandomGenBtn = document.getElementById(
	"confirm-random-gen-btn",
);
export const skipRandomGenBtn = document.getElementById("skip-random-gen-btn");

/**
 * Procedurally populates all land cells on the map with a specified number of random nations.
 * Uses an interleaved BFS expansion to ensure organic, relatively balanced territory sizes.
 */

// -------- Import Country From Scenario (editor / godmode) --------

editor_tool_controls.bindEditorImportCountryBtnClick();

menu_controls.bindImportCountryCancelBtnClick();

editor_file_controls.bindImportScenarioSelectChange();

editor_file_controls.bindImportScenarioFileInputChange();

editor_file_controls.bindImportCountryConfirmBtnClick();

editor_file_controls.bindEditorLoadZipBtnClick();

editor_tool_controls.bindEditorFlagLibraryBtnClick();

// City tools buttons
inspector_controls.bindEditorCityNewBtnClick();

inspector_controls.bindEditorCityClearBtnClick();

menu_controls.bindLeaderboardBtnClick();

menu_controls.bindCloseLeaderboardBtnClick();

menu_controls.bindCloseHubBtnClick();

// -------- Item details + comments modal logic --------

// -------- Global Chat Logic --------

community_controls.bindGlobalChatCloseClick();

community_controls.bindGlobalChatSendClick();

community_controls.bindGlobalChatInputKeydown();

community_controls.bindItemCommentSubmitClick();

community_controls.bindItemCancelReplyBtnClick();

community_controls.bindCloseItemModalBtnClick();

editor_file_controls.bindEditorShareBtnClick();

community_controls.bindCancelUploadBtnClick();

community_controls.bindConfirmUploadBtnClick();

editor_tool_controls.bindCancelEditorChoiceClick();

editor_tool_controls.bindChoiceExternalEditorClick();

editor_tool_controls.bindChoiceIngameEditorClick();

editor_tool_controls.bindCancelSourceChoiceClick();

editor_tool_controls.bindChoiceSourceEarthClick();

editor_tool_controls.bindChoiceSourceBlankClick();

editor_tool_controls.bindCancelBlankSizeBtnClick();

editor_tool_controls.bindConfirmBlankSizeBtnClick();

menu_controls.bindMinimizeSetupBtnClick();

menu_controls.bindMinimizeStatsBtnClick();

menu_controls.bindMinimizeStatusBtnClick();

// Keep simulation running when tab is not focused (background ticking)
simulation_controls.bindDocumentVisibilityChange();

sandbox_controls.bindGodModeBtnClick();

initWarOverview();
menu_controls.bindStartBtnClick();
menu_controls.bindQuickRestartBtnClick();

function removeCountryFormations(...args) {
	return lifecycle.removeCountryFormations(...args);
}
