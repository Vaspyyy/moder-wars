import { createAiPlanExecutor } from "./ai-plan-execution.js";
import { createAiPlanner } from "./ai-planning.js";
import { createAiProposalPipeline } from "./ai-proposals.js";
import { createAiRuntime } from "./ai-runtime.js";
import { createArmyFormation } from "./army-formation.js";
import { createConflictPersonnel } from "./conflict-personnel.js";
import { createConflictResolution } from "./conflict-resolution.js";
import {
	getFormationPersonnel,
	getFormationStrengthMultiplier,
} from "./formation-strength.js";
import { buildDirectionField, buildLayout } from "./frontline-core.js";
import { normalizeLongitudeDelta } from "./geographic-math.js";
import { updateGroundFormation } from "./ground-unit.js";
import { toSparseInfluenceMap, writeInfluence } from "./influence-grid.js";
import { createInfluenceRuntime } from "./influence-runtime.js";
import {
	selectAssignedMopUpCountryId,
	selectNearestMopUpCell,
} from "./mop-up.js";
import { createSimulationCalendar } from "./simulation-calendar.js";
import { createEngine } from "./simulation-engine.js";
import { createDeterministicJob } from "./simulation-jobs.js";
import { createSimulationMetrics } from "./simulation-metrics.js";
import { isSimulationPhaseDue } from "./simulation-phase-wheel.js";
import { createSimulationState } from "./simulation-state.js";
import { createSimulationTick } from "./simulation-tick.js";
import { createSimulationWorld } from "./simulation-world.js";
import {
	allocateLargestRemainderQuotas,
	evaluateCountryCapitulation,
	evaluateGlobalConflict,
	selectEligibleCasualtyAttackers,
	selectMajorityOwnerTransfers,
	selectOccupationController,
} from "./surrender.js";
import {
	forEachNeighborCell,
	forEachUnorderedNeighborPair,
	rebuildTacticalGrid,
} from "./tactical-grid.js";
import {
	createTerritoryLedger,
	getCountryLedger,
	getSideLedger,
} from "./territory-ledger.js";
import { createTerritoryRuntime } from "./territory-runtime.js";

const BASE_TICK_MS = 1000 / 60;
const CONTROL_FLAGS = [
	"mountainsEnabled",
	"invisibleBuffsEnabled",
	"peaceTreatiesDisabled",
	"bombsDisabled",
	"godModeActive",
	"treatyNoticeVisible",
];
const COUNTRY_FIELDS = [
	"buffState",
	"hiddenBuffState",
	"strategy",
	"role",
	"color",
];

/** An independently owned simulation. Presentation events contain no DOM references. */
export function createSimulationCore(
	initial = {},
	{ onEvent, onControlCellsChanged } = {},
) {
	const state = createSimulationState(initial);
	const dirtyCells = new Set();
	let allCellsDirty = false;
	const frontlineScratch = {};
	state.isPaused = Boolean(initial.isPaused);
	state.treatyNoticeVisible = Boolean(initial.treatyNoticeVisible);
	state.perf = initial.perf || createSimulationMetrics();
	state.sparseInfluence = true;
	const total = state.gridWidth * state.gridHeight;
	if (!Number.isSafeInteger(total) || total <= 0)
		throw new RangeError("A simulation requires a nonempty grid");
	for (const [name, Type] of [
		["landMask", Uint8Array],
		["worldControlMap", Uint16Array],
		["deJureMap", Uint16Array],
		["provinceMap", Int32Array],
		["occupationMap", Float32Array],
		["primaryOccupierMap", Uint16Array],
		["terrainMask", Float32Array],
		["biomeMask", Uint8Array],
	]) {
		if (state[name] == null) state[name] = new Type(total);
		if (state[name].length !== total)
			throw new RangeError(`${name} grid size mismatch`);
	}
	if (state.dominantSideMap == null)
		state.dominantSideMap = new Int8Array(total).fill(-1);
	if (state.dominantSideMap.length !== total)
		throw new RangeError("Dominance grid size mismatch");
	state.sideInfluenceMaps = (state.sideInfluenceMaps || [])
		.slice(0, state.sides.length)
		.map(toSparseInfluenceMap);

	const emit = (type, ...args) => onEvent?.(type, ...args);
	function markChanged(indices) {
		if (indices == null) {
			allCellsDirty = true;
			dirtyCells.clear();
		} else if (!allCellsDirty) {
			if (typeof indices === "number") dirtyCells.add(indices);
			else for (const index of indices) dirtyCells.add(index);
		}
	}
	function publishChanges() {
		if (!allCellsDirty && dirtyCells.size === 0) return;
		onControlCellsChanged?.(allCellsDirty ? null : [...dirtyCells]);
		allCellsDirty = false;
		dirtyCells.clear();
	}

	Object.assign(state, {
		getFormationPersonnel,
		getFormationStrengthMultiplier,
		createDeterministicJob,
		createTerritoryLedger,
		getCountryLedger,
		getSideLedger,
		normalizeLongitudeDelta,
		evaluateCountryCapitulation,
		evaluateGlobalConflict,
		selectEligibleCasualtyAttackers,
		allocateLargestRemainderQuotas,
		selectOccupationController,
		selectMajorityOwnerTransfers,
		selectAssignedMopUpCountryId,
		selectNearestMopUpCell,
		isSimulationPhaseDue,
		rebuildTacticalGrid,
		forEachNeighborCell,
		forEachUnorderedNeighborPair,
		updateGroundFormation,
		onControlCellsChanged: markChanged,
		onPoliticalMapChanged: () => {
			markChanged(null);
			emit("onPoliticalMapChanged");
		},
		onConflictMapChanged: () => {
			markChanged(null);
			emit("onConflictMapChanged");
		},
		onOperationalAiReset: () => {
			state._warOverviewSides = [];
			state._warOverviewLastUpdate = -Infinity;
		},
		recordPerfMeasure: () => {},
		invalidateWarLifecycleTimers: () => {},
		isTreatyNoticeVisible: () => state.treatyNoticeVisible,
		presentCapitulation: (country) => emit("presentCapitulation", country),
		presentTreatyStart: () => {
			state.treatyNoticeVisible = false;
			emit("presentTreatyStart");
		},
		presentTreatyNotice: (notice) => emit("presentTreatyNotice", notice),
		presentTreatyFinished: () => emit("presentTreatyFinished"),
		showTreatyOffer: (sideIndex, willAccept) => {
			state.treatyNoticeVisible = true;
			state.lastTreatyTime = Date.now();
			emit("showTreatyOffer", sideIndex, willAccept);
		},
		playExplosionSound: () => emit("playExplosionSound"),
		getSideDisplayName: (sideIndex) => {
			const side = state.sides[sideIndex] || [];
			return side.length > 1
				? `${side[0].name} Allies`
				: side[0]?.name || `Side ${String.fromCharCode(65 + sideIndex)}`;
		},
		createArmyFormation: (fields) => createArmyFormation(fields, state.CONFIG),
		syncFrontlineWorkerPendingState: () => {},
		resetOperationalAiRuntime: () => {
			state._aiTaskForcesBySide.clear();
			state._aiTaskForceTransitionById.clear();
			state._aiPendingLandingHandoffs.clear();
			state._aiLastOperationsTick = Number.NEGATIVE_INFINITY;
			state._aiOperationsDirty = true;
			for (const unit of state.units) {
				unit._taskForceUid = null;
				unit._taskForceRole = null;
				unit._taskForceOrder = null;
			}
		},
		dispatchFrontlineWork,
	});
	Object.defineProperty(state, "countryToSideMap", {
		get: () => state._tickCountryToSideMap,
		configurable: true,
	});
	Object.assign(state, createSimulationWorld(state), createEngine(state));
	Object.assign(
		state,
		createInfluenceRuntime(state),
		createTerritoryRuntime(state),
	);
	Object.assign(
		state,
		createAiPlanner(state),
		createAiProposalPipeline(state),
		createAiRuntime(state),
		createAiPlanExecutor(state),
	);
	Object.assign(
		state,
		createConflictPersonnel(state),
		createConflictResolution(state),
		createSimulationCalendar(state),
	);
	const { performSimulationTick } = createSimulationTick(state);
	state.ensureSideIdentities();
	if (!Object.hasOwn(initial, "hostilityMatrix")) {
		if (!Object.hasOwn(initial, "hostileSidePairs")) {
			for (let left = 0; left < state.sides.length; left++) {
				for (let right = left + 1; right < state.sides.length; right++) {
					if (state.sides[left]?.length && state.sides[right]?.length)
						state.hostileSidePairs.add(
							state.sidePairKey(state.sideUids[left], state.sideUids[right]),
						);
				}
			}
		}
		state.hostilityMatrix = state.createHostilityMatrix(
			state.sides.length,
			state.hostileSidePairs,
			state.sideUids,
			state.MAX_SIDES,
		);
	}
	state.frontlineFieldTick = -999;
	state._frontlineWorkerPendingField = true;
	state.ensureSideInfluenceMaps();
	if (!initial.sideInfluenceMaps) {
		const countrySides = state.runtimeCountryToSideMap();
		for (let index = 0; index < total; index++) {
			if (state.landMask[index] !== 2) continue;
			const side =
				state.dominantSideMap[index] >= 0
					? state.dominantSideMap[index]
					: countrySides.get(state.worldControlMap[index]);
			if (side == null || !state.sideInfluenceMaps[side]) continue;
			writeInfluence(
				state.sideInfluenceMaps[side],
				index,
				Math.abs(state.occupationMap[index]) || 1,
			);
			state.syncOccupationFromSideInfluence(index);
		}
	}
	state.setInfluenceChangeListener((index) => markChanged(index));
	state.setOccupationChangeListener((index) => {
		state._territoryLedger?.markControllerChange(index);
		state.queueInfluenceFrontierCell(index, true);
	});
	for (let side = 0; side < state.sides.length; side++) {
		if (
			state.sides[side]?.length &&
			!state._aiTaskForcesBySide.has(state.sideUids[side])
		)
			state._aiTaskForcesBySide.set(state.sideUids[side], []);
	}
	state._territoryLedger = state.createRuntimeTerritoryLedger();
	state.flushTerritoryLedger();
	state.scheduleCoastalTopologyJob();

	function dispatchFrontlineWork(includeField, includeLayout) {
		includeField ||= state._frontlineWorkerPendingField;
		includeLayout ||= state._frontlineWorkerPendingLayout;
		if (!includeField && !includeLayout) return false;
		const input = {
			landMask: state.landMask,
			dominantSideMap: state.dominantSideMap,
			hostile: state.areSidesHostile,
			gridWidth: state.gridWidth,
			gridHeight: state.gridHeight,
			gridRes: state.CONFIG.GRID_RES,
			units: state.units,
			sideCount: state.sides.length,
			maxSides: state.MAX_SIDES,
		};
		if (includeField) {
			const result = buildDirectionField({
				...input,
				scratch: frontlineScratch,
			});
			state.frontlineDirLat = result.frontlineDirLat;
			state.frontlineDirLng = result.frontlineDirLng;
			state.frontlineFieldTick = state._simTickCount;
			state._frontlineWorkerPendingField = false;
		}
		if (includeLayout) {
			const result = buildLayout({
				...input,
				units: state.units.map((unit) => ({
					id: unit.id,
					sideIndex: unit.sideIndex,
					lat: unit.lat,
					lng: unit.lng,
					deployTicks: unit.deployTicks || 0,
					previousPairKey: unit.frontSlot?.pairKey,
					previousSegmentIdx: unit.frontSlot?.segmentIdx || 0,
				})),
			});
			state._frontlinePolys = result.polylines;
			const byId = new Map(state.units.map((unit) => [unit.id, unit]));
			for (const assignment of result.slotAssignments) {
				const unit = byId.get(assignment.unitId);
				if (!unit) continue;
				unit.frontSlot =
					assignment.pairKey == null
						? null
						: {
								pairKey: assignment.pairKey,
								segmentIdx: assignment.segmentIdx || 0,
								targetLat: assignment.targetLat,
								targetLng: assignment.targetLng,
							};
			}
			state._frontlinePolyTick = state._simTickCount;
			state._frontlineWorkerPendingLayout = false;
			state._frameSimulationCommitFlags.add("frontline-layout");
		}
		state._workerBusy = false;
		return true;
	}

	function tick() {
		if (
			state.isPaused ||
			!(
				state.gameState === "SIMULATING" ||
				(state.gameState === "GOD_MODE" &&
					state.preGodModeState === "SIMULATING")
			)
		)
			return false;
		const started = performance.now(),
			before = state.perf.tickTotal;
		performSimulationTick();
		state.workerTickMs = performance.now() - started;
		state.perf.tickTotal = before + state.workerTickMs;
		state.perf.maxTick = Math.max(state.perf.maxTick, state.workerTickMs);
		state.simFrameCount++;
		state.tickGameTime(BASE_TICK_MS / state.simSpeed);
		publishChanges();
		return true;
	}

	function command(message, payload = {}) {
		const type = typeof message === "string" ? message : message.type;
		const input =
			typeof message === "string" ? payload : message.payload || message;
		if (type === "APPLY_TREATY") {
			state.applyTreaty(
				input.treatyType ||
					(input.type !== "APPLY_TREATY" && input.type) ||
					"PEACE_TREATY",
				input.winnerSideIdx ?? input.winnerPoleOverride ?? null,
				input.endingReason ?? null,
			);
		} else if (type === "CONTROL") {
			const settings = { ...input.settings, ...input };
			const speed = settings.speed ?? settings.simSpeed;
			if (speed != null && (!Number.isFinite(speed) || speed <= 0))
				throw new RangeError("Simulation speed must be positive");
			const config = settings.CONFIG || settings.config || {};
			if (config.GRID_RES != null && config.GRID_RES !== state.CONFIG.GRID_RES)
				throw new RangeError(
					"Grid resolution cannot change during a running simulation",
				);
			for (const [name, value] of Object.entries(config)) {
				if (!Object.hasOwn(state.CONFIG, name)) continue;
				if (typeof value === "number" && !Number.isFinite(value))
					throw new TypeError(`Invalid CONFIG.${name}`);
			}
			if (settings.paused != null || settings.isPaused != null)
				state.isPaused = Boolean(settings.paused ?? settings.isPaused);
			if (speed != null) state.simSpeed = speed;
			for (const name of CONTROL_FLAGS)
				if (settings[name] != null) state[name] = Boolean(settings[name]);
			if (
				settings.lastTreatyTime != null &&
				Number.isFinite(settings.lastTreatyTime)
			)
				state.lastTreatyTime = settings.lastTreatyTime;
			for (const [name, value] of Object.entries(config)) {
				if (Object.hasOwn(state.CONFIG, name)) state.CONFIG[name] = value;
			}
			if (
				settings.perfResetGeneration != null &&
				state._perfControlGeneration !== settings.perfResetGeneration
			) {
				if (state._perfControlGeneration != null) {
					Object.assign(
						state.perf,
						createSimulationMetrics(settings.perfMode || state.perf._mode),
					);
					state._lastPerfSnapshotTick = 0;
				}
				state._perfControlGeneration = settings.perfResetGeneration;
			}
			if (settings.perfTrackingPaused != null)
				state.perf._trackingPaused = !!settings.perfTrackingPaused;
			if (settings.perfMode != null && settings.perfMode !== state.perf._mode) {
				state.perf._mode = settings.perfMode;
				state.perf._enabled = settings.perfMode !== "off";
				state.perf._measurementStart =
					settings.perfMode === "off" ? null : performance.now();
			}
			const changes =
				settings.countryPatches ||
				settings.countries ||
				(settings.countryPatch ? [settings.countryPatch] : []);
			for (const change of changes) {
				const id = change.countryId ?? change.id;
				const patch = change.patch || change;
				const country = state.sides.flat().find((entry) => entry.id === id);
				const metadata = state.countryMetadata.find(
					(entry) => entry?.id === id,
				);
				for (const name of COUNTRY_FIELDS) {
					if (patch[name] == null) continue;
					if (country) country[name] = patch[name];
					if (metadata && name !== "role") metadata[name] = patch[name];
				}
			}
			if (changes.length) state.requestOperationalAiReassessment();
		} else throw new RangeError(`Unknown simulation command: ${type}`);
		publishChanges();
		return {
			gameState: state.gameState,
			isPaused: state.isPaused,
			simSpeed: state.simSpeed,
		};
	}

	return { state, tick, command };
}
