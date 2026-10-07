import { CONFIG } from "./config.js";
import { createDeterministicJobQueue } from "./simulation-jobs.js";
import { createTacticalGrid } from "./tactical-grid.js";

/** One simulation owns these buffers, plans and caches. No UI references cross this boundary. */
export function createSimulationState(initial = {}) {
	const state = { CONFIG: { ...CONFIG }, MAX_SIDES: 8 };
	state._frontlineLayoutApplyPendingMs = 0;
	state._frontlineSlotApplyPendingMs = 0;
	state._simTickCount = 0;
	state.gameState = "MAIN_MENU";
	state.godModeActive = false;
	state.preGodModeState = "SIMULATING";
	state._tickAllCombatants = [];
	state.sides = [[], []];
	state.activeBattles = [];
	state._battleHash = new Map();
	state.latestCountryStats = new Map();
	state._tickCombatantIds = new Set();
	state._tickCountryToSideMap = new Map();
	state._tickCountryById = new Map();
	state.landMask = undefined;
	state.worldControlMap = undefined;
	state.units = [];
	state.primaryOccupierMap = undefined;
	state.gridWidth = 0;
	state.gridHeight = 0;
	state._territoryLedger = null;
	state.dominantSideMap = undefined;
	state.sideInfluenceMaps = undefined;
	state._simulationJobs = createDeterministicJobQueue({
		itemBudget: 160_000,
		maxItemsPerJobTurn: 80_000,
	});
	state._territoryLedgerDecisionTick = Number.NEGATIVE_INFINITY;
	state.sideSoldiers = new Float64Array(state.MAX_SIDES);
	state.unitSpatialHash = new Map();
	state.unitHashBySide = Array.from(
		{ length: state.MAX_SIDES },
		() => new Map(),
	);
	state.UNIT_HASH_CELL_SIZE = 2.5;
	state._unitLiveGeneration = 0;
	state._tacticalGrid = createTacticalGrid({ cellSize: 0.6 });
	state.frontlineFieldTick = -999;
	state.FRONTLINE_FIELD_UPDATE_INTERVAL = 150;
	state._frontlinePolyTick = -999;
	state.FRONTLINE_POLY_UPDATE_INTERVAL = 30;
	state._workerBusy = false;
	state._frontlineWorkerPendingField = false;
	state._frontlineWorkerPendingLayout = false;
	state._tickUnitsBySide = [];
	state._tickUnitGridIdx = new Map();
	state._tickCountryToCityCount = new Map();
	state._tickCountryCapitalLost = new Map();
	state.activeTheaterCities = [];
	state.capitalLostCountries = new Set();
	state._capitalFallTick = new Map();
	// Sealed pockets for the map: [{ sideIndex, cells: Int32Array }].
	state.encirclementPockets = [];
	state.simFrameCount = 0;
	state.countryMetadata = [];
	state.AI_POSTURE = {
		NORMAL: "NORMAL",
		LAST_STAND: "LAST_STAND",
		DEFENSIVE_DESPERATION: "DEFENSIVE_DESPERATION",
		OFFENSIVE_DESPERATION: "OFFENSIVE_DESPERATION",
		UNDER_MOBILIZED: "UNDER_MOBILIZED",
	};
	state.aiCountryState = new Map();
	state._sideMomentumHistory = [];
	state._sideWarPhase = [];
	state.initialSideSoldiers = new Float64Array(state.MAX_SIDES);
	state._sidePosture = [];
	state._defenderReactionPlan = [];
	state._simulationWorldGeneration = 0;
	state._politicalMapRevision = 0;
	state.adjacencyCache = null;
	state._neutralBorderCacheSignature = "";
	state._neutralBorderPolys = {};
	state.manualSideManpower = new Array(state.MAX_SIDES).fill(null);
	state.sideRecruitableManpower = new Float64Array(state.MAX_SIDES);
	state.soldiersPerUnit = new Float64Array(state.MAX_SIDES).fill(
		state.CONFIG.UNIT_TO_SOLDIER_RATIO,
	);
	state.AI_MOBILIZATION = {
		INITIAL_SPAWN_FRAC: 0.18, // spawn ~18% of theoretical force at war start
		INITIAL_SPAWN_MIN: 2, // each nation starts with a tiny standing force
		START_FROM_FRONT_CHANCE: 0.25, // mostly start behind lines, not fully on border
		EARLY_TICKS: 1800, // first ~30s at 60fps = mobilization phase
		EARLY_RECRUIT_MULT: 2.3, // recruit faster early to fill armies over time
	};
	state.cities = [];
	state._tickCitiesBySovereign = new Map();
	state._tickMetadataById = new Map();
	state.mountainsEnabled = true;
	state.terrainMask = undefined;
	state.riverMask = undefined;
	state._strategicTargetGeneration = 0;
	state.simSpeed = 3.0;
	state.STRATEGIC_COHORT_COUNT = 4;
	state.CITY_OBJECTIVE_REFRESH_INTERVAL = 12;
	state.warGraceEndTick = 0;
	state._neutralGarrisonPlan = [];
	state._coastalDefensePlan = [];
	state._mopUpOwnedCellCache = new Map();
	state.CITY_WATER_CHECK_LIMIT = 4;
	state._warPlan = [];
	state._navalPlan = [];
	state._navalSupplyPlan = [];
	state._transportPlan = [];
	state._frontlinePolys = {};
	state.deJureMap = undefined;
	state.lastTreatyTick = 0;
	state._cachedSideTerritoryCounts = [];
	state._lastCapitulationTick = Number.NEGATIVE_INFINITY;
	state.peaceTreatiesDisabled = false;
	state.bombsDisabled = false;
	state.bombs = [];
	state.explosions = [];
	state.gameTimeDate = null;
	state.gameTimeEnabled = false;
	state.bases = [];
	state._cachedSideUnitCounts = [];
	state._cachedSideSoldierEsts = [];
	state.PERF_TICK_HISTORY_LIMIT = 4096;
	state._influenceCityGridSource = null;
	state._influenceCityGridSourceLength = -1;
	state._influenceCityGridWorldGeneration = -1;
	state._tickCityGridIndexSet = new Set();
	state._influenceCoalitionSignature = "";
	state._influenceActiveSideIndices = [];
	state._tickSideAllyIdSets = [];
	state._tickSideSupportIdSets = [];
	state._influenceHostileSideIndices = Array.from(
		{ length: state.MAX_SIDES },
		() => [],
	);
	state._influenceFrontierQueued = new Uint8Array(0);
	state._influenceFrontierWorldGeneration = -1;
	state._influenceFrontierQueue = [];
	state._influenceFrontierCursor = 0;
	state._influenceFrontierPriorityQueue = [];
	state._influenceFrontierPriorityCursor = 0;
	state.INFLUENCE_FRONTIER_PRIORITY_LIMIT = 8_192;
	state.INFLUENCE_FRONTIER_BACKLOG_LIMIT = 16_384;
	state._influenceNeighborDx = new Int8Array([0, 0, 1, -1, 1, 1, -1, -1]);
	state._influenceNeighborDy = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);
	state._influenceNeighborCountryIds = new Int32Array(8);
	state._influenceNeighborCountryCounts = new Uint8Array(8);
	state.occupationMap = undefined;
	state._territoryLedgerSnapshot = null;
	state._cachedP1T = 0;
	state._cachedP2T = 0;
	state._cachedSideTerritoryPcts = [];
	state._territoryLedgerCitiesSource = null;
	state._territoryLedgerCitiesLength = -1;
	state._territoryLedgerAppliedCitiesRevision = -1;
	state._territoryLedgerCitiesRevision = 0;
	state.sideUids = [];
	state.hostilityMatrix = new Uint8Array(state.MAX_SIDES * state.MAX_SIDES);
	state._frameSimulationCommitFlags = new Set();
	state._proposalReassessTick = [];
	state._planReassessNeeded = [];
	state._sidePrevControlled = [];
	state._sidePrevPosture = [];
	state._sidePrevStrengthRatio = [];
	state._pendingProposalSideSet = new Set();
	state._pendingProposalSides = [];
	state._aiDebugPlans = [];
	state._frontIntelBySide = [];
	state.NAVAL_STALL_TICKS = 600;
	state._aiPendingLandingHandoffs = new Map();
	state._aiOperationsDirty = true;
	state._planBfsSeen = new Uint32Array(0);
	state._planBfsParent = new Int32Array(0);
	state._planBfsQueue = new Int32Array(0);
	state._planBfsGeneration = 0;
	state._aiPlanMemory = new Map();
	state._coastalLandIndices = [];
	state._coastalTopologyReady = false;
	state._aiTaskForcesBySide = new Map();
	state._warOverviewSides = [];
	state._warOverviewLastUpdate = -Infinity;
	state._aiLastOperationsTick = Number.NEGATIVE_INFINITY;
	state._aiTaskForceTransitionById = new Map();
	state.casualtyByAttacker = new Map();
	state.gameTimeAccumulatorMs = 0;
	state.sideCasualties = new Float64Array(state.MAX_SIDES);
	state.countryCasualties = new Map();
	state._nextSideUid = 1;
	state.hostileSidePairs = new Set();
	state._liveSideCombatPower = new Float64Array(state.MAX_SIDES);
	state._enemyCityCacheGeneration = -1;
	state._enemyCityCacheSource = null;
	state._enemyCityCandidatesBySide = [];
	state.CITY_CANDIDATE_CACHE_LIMIT = 32;
	state._frontlineWorkerGeneration = 0;
	state._frontlineTerritoryGeneration = 0;
	state.frontlineDirLat = null;
	state.frontlineDirLng = null;
	state.provinceMap = undefined;
	state.AI_DESPERATION = {
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
	state.gameTimeDayDurationMs = 500;
	state.gameMode = "CONQUEST";
	state.invisibleBuffsEnabled = true;
	state.biomeMask = undefined;
	state.worldWidthDeg = 360;
	state.worldHeightDeg = 180;
	Object.assign(state, initial);
	state.CONFIG = { ...CONFIG, ...(initial.CONFIG || {}) };
	return state;
}
