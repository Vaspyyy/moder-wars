import { findEncirclementPockets } from "./encirclement-pockets.js";
import { multiplyInfluence } from "./influence-grid.js";
import { getSimulationMetrics } from "./simulation-metrics.js";
import { aggregateTaskForceCellPair } from "./tactical-grid.js";

// 6 seconds at the 60 ticks per second of 1x speed.
const TREATY_COOLDOWN_TICKS = 360;
const POCKET_SCAN_INTERVAL = 30;
// Dependencies are supplied by the application; this module does not import it.
export function createSimulationTick(runtime) {
	function performSimulationTick() {
		const perf = getSimulationMetrics(runtime);
		const clockNow = perf._mode === "off" ? () => 0 : () => performance.now();
		perf.ticks++;
		// ── Perf snapshot for per-tick delta computation ──
		const _perfEnabled = perf._mode !== "off" && !perf._trackingPaused;
		const _perfSnap = _perfEnabled ? {} : null;
		const _perfKeys = [
			"plans",
			"legacyPlans",
			"operationalTaskForces",
			"proposals",
			"eval",
			"neutralBorder",
			"recruit",
			"unitLoop",
			"post",
			"prePlans",
			"influence",
			"smoothing",
			"phase0",
			"phase67",
			"phase133",
			"spatialHash",
			"frontline",
			"frontlineDispatch",
			"frontlinePolys",
			"frontlineLayoutApply",
			"frontlineSlotApply",
			"phaseWheel",
			"consolidate",
			"caches",
			"victory",
			"aiPosture",
			"posture",
			"render",
			"unitSetupTerrain",
			"unitScanPhase",
			"unitEnemyScan",
			"unitAllyScan",
			"unitGarrisonCoastal",
			"unitRetreatMopUp",
			"unitRetreatDecision",
			"unitGlobalFallback",
			"unitFrontlinePress",
			"unitMopUpSearch",
			"unitMopUpTargetSearch",
			"unitCityObjective",
			"unitGarrisonTarget",
			"unitCombatMove",
		];
		if (_perfEnabled) {
			for (const k of _perfKeys) _perfSnap[k] = perf[k] || 0;
			for (const k of [
				"proposalRuns",
				"proposalFailed",
				"reassess_noPlan",
				"reassess_interval",
				"reassess_forced",
				"reassess_territory",
				"reassess_posture",
				"reassess_ratio",
			])
				_perfSnap[k] = perf[k] || 0;
			for (const k of [
				"coastDeflectHalved",
				"knockbackBlocked",
				"waterPathPenalized",
				"coastStuckAbandoned",
			])
				_perfSnap[k] = perf[k] || 0;
			for (const k of [
				"tacticalFriendlyCandidatePairs",
				"tacticalEnemyCandidateVisits",
				"tacticalAcceptedPairs",
				"tacticalFriendlyPairs",
				"tacticalHostileCellVisits",
				"tacticalCacheHits",
				"tacticalCacheMisses",
				"tacticalGhostInvalidations",
				"tacticalFastLaneUnits",
			]) {
				_perfSnap[k] = perf[k] || 0;
			}
		}
		if (
			runtime._frontlineLayoutApplyPendingMs ||
			runtime._frontlineSlotApplyPendingMs
		) {
			const asyncApplyMs =
				runtime._frontlineLayoutApplyPendingMs +
				runtime._frontlineSlotApplyPendingMs;
			perf.frontlineLayoutApply += runtime._frontlineLayoutApplyPendingMs;
			perf.frontlineSlotApply += runtime._frontlineSlotApplyPendingMs;
			perf.frontlinePolys += asyncApplyMs;
			perf.frontline += asyncApplyMs;
			runtime._frontlineLayoutApplyPendingMs = 0;
			runtime._frontlineSlotApplyPendingMs = 0;
		}
		runtime._simTickCount++;
		// DEBUG: throttled out (was 0)
		let moveDirLat, moveDirLng;
		const _t0 = clockNow();

		// If war is over, stop simulation mechanics (but update loop may continue for aftermath recording)
		if (runtime.gameState === "WAR_OVER") return false;
		// If in God Mode but the war hasn't started yet, don't tick simulation mechanics
		if (runtime.godModeActive && runtime.preGodModeState !== "SIMULATING")
			return false;

		runtime._tickAllCombatants = runtime.sides.flat();
		const _allCombatants = runtime._tickAllCombatants;

		// 0. Initial Utility Helpers
		const recordDamage = (targetUnit, dmg, attackerUnit) => {
			if (
				Number.isNaN(dmg) ||
				dmg <= 0 ||
				Number.isNaN(targetUnit.health) ||
				targetUnit.health <= 0
			) {
				return;
			}

			runtime.applyLandUnitDamage(targetUnit, dmg, attackerUnit);
		};

		// Random War Mode mid‑simulation has been disabled to avoid corrupting existing wars.
		// Random wars can still be started manually from the setup screen via the Random War button.

		// 0. Initialize Tick Caches early to avoid access-before-initialization errors
		runtime.activeBattles = [];
		runtime._battleHash.clear();
		runtime.latestCountryStats.clear();
		const countryStats = runtime.latestCountryStats;
		runtime._tickCombatantIds.clear();
		const combatantIds = runtime._tickCombatantIds;
		runtime._tickCountryToSideMap.clear();
		const countryToSideMap = runtime._tickCountryToSideMap;
		runtime._tickCountryById.clear();
		const _countryById = runtime._tickCountryById;

		runtime.sides.forEach((side, idx) => {
			side.forEach((c) => {
				combatantIds.add(c.id);
				countryToSideMap.set(c.id, idx);
				_countryById.set(c.id, c);
				countryStats.set(c.id, { units: 0, controlled: 0, owned: 0 });
			});
		});

		const isNeutral = (idx) =>
			idx !== -1 &&
			runtime.landMask[idx] > 0 &&
			!combatantIds.has(runtime.worldControlMap[idx]);
		const isNeutralCountry = (idx) =>
			isNeutral(idx) && runtime.worldControlMap[idx] > 0;

		// Determine unit counts once
		const _tInfluence = clockNow();
		let p1UnitsCount = 0;
		let p2UnitsCount = 0;
		for (let i = 0; i < runtime.units.length; i++) {
			const u = runtime.units[i];
			const countsAsLandFormation = u.kind === "army";
			const formationEquivalent = countsAsLandFormation
				? runtime.getLiveFormationStrength(u)
				: 0;
			if (countsAsLandFormation && u.sideIndex === 0)
				p1UnitsCount += formationEquivalent;
			else if (countsAsLandFormation && u.sideIndex === 1)
				p2UnitsCount += formationEquivalent;
			const s = countryStats.get(u.sovereignId);
			if (s && countsAsLandFormation) s.units += formationEquivalent;
		}

		// 1. Update territory
		runtime.updatePersistentInfluence(
			p1UnitsCount,
			p2UnitsCount,
			countryToSideMap,
		);
		perf.influence = (perf.influence || 0) + clockNow() - _tInfluence;

		// 1a. Occupancy Smoothing: Occasionally clean up primaryOccupierMap during war to prevent speckling
		const _tSmooth = clockNow();
		if (runtime.isSimulationPhaseDue(runtime._simTickCount, 120, 83)) {
			const sampleCount = 5000;
			const modified = [];
			for (let s = 0; s < sampleCount; s++) {
				const idx = Math.floor(
					Math.random() * runtime.primaryOccupierMap.length,
				);
				if (
					runtime.landMask[idx] !== 2 ||
					runtime.primaryOccupierMap[idx] === 0
				)
					continue;

				const myId = runtime.primaryOccupierMap[idx];
				const mySide = countryToSideMap.get(myId);

				// Sample 3x3 neighborhood
				const y = Math.floor(idx / runtime.gridWidth);
				const x = idx % runtime.gridWidth;
				const counts = Object.create(null);
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const nx = x + dx;
						const ny = y + dy;
						if (
							nx >= 0 &&
							nx < runtime.gridWidth &&
							ny >= 0 &&
							ny < runtime.gridHeight
						) {
							const nId =
								runtime.primaryOccupierMap[ny * runtime.gridWidth + nx];
							const nSide = countryToSideMap.get(nId);
							// Only count allies
							if (nId > 0 && nSide !== undefined && nSide === mySide) {
								counts[nId] = (counts[nId] || 0) + 1;
							}
						}
					}
				}

				let dominantAlly = myId;
				let maxC = 0;
				for (const id of Object.keys(counts)) {
					const c = counts[id];
					if (c > maxC) {
						maxC = c;
						dominantAlly = Number(id);
					}
				}

				// If the occupier is a tiny island in an allied sea (majority neighbors are a single ally), flip to them.
				if (maxC >= 5 && dominantAlly !== myId) {
					modified.push({ idx, dominantAlly });
				}
			}
			// Apply modifications without a massive 24MB array GC copy
			for (let i = 0; i < modified.length; i++) {
				const change = modified[i];
				runtime.primaryOccupierMap[change.idx] = change.dominantAlly;
				runtime._territoryLedger?.markControllerChange(change.idx);
				runtime.onControlCellsChanged?.(change.idx);
			}
		}
		perf.smoothing = (perf.smoothing || 0) + clockNow() - _tSmooth;

		// 1b. Territorial Integrity: Collapse deep pockets and isolated protrusions (Enclaves/Exclaves)
		// We sample the grid to find territory that is surrounded by the enemy.
		// This aggressively decays "border gore" and isolated bubbles.
		// Full-map statistics run as deterministic fixed-size chunks. This keeps
		// results atomic without producing a multi-million-cell frame spike.
		const optimizationFactor = runtime.getOptimizationFactor();
		const countInterval = 200;
		const shouldCountLand = runtime.isSimulationPhaseDue(
			runtime._simTickCount,
			countInterval,
			37,
		);
		const shouldCommitTerritoryDecision = runtime.isSimulationPhaseDue(
			runtime._simTickCount,
			countInterval,
			133,
		);
		if (
			runtime.isSimulationPhaseDue(runtime._simTickCount, countInterval, 67)
		) {
			const _tP0 = clockNow();
			const integBase = 5000;
			const integSamples = Math.max(
				1000,
				Math.floor(integBase / optimizationFactor),
			);
			for (let s = 0; s < integSamples; s++) {
				const idx = Math.floor(Math.random() * runtime.landMask.length);
				if (runtime.landMask[idx] !== 2) continue;
				const dsIdx = runtime.dominantSideMap[idx];
				if (dsIdx < 0) continue;

				const ownerId = runtime.worldControlMap[idx];
				const sideIdx = countryToSideMap.get(ownerId);
				if (sideIdx === undefined) continue;

				const isEnemyOccupation = runtime.areSidesHostile(sideIdx, dsIdx);
				const isSelfOccupation = dsIdx === sideIdx;

				const y = Math.floor(idx / runtime.gridWidth);
				const x = idx % runtime.gridWidth;
				let sovereignNeighbors = 0;
				let enemyOccupiedNeighbors = 0;

				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dy === 0 && dx === 0) continue;
						const ny = y + dy;
						const nx = x + dx;
						if (
							ny < 0 ||
							ny >= runtime.gridHeight ||
							nx < 0 ||
							nx >= runtime.gridWidth
						)
							continue;
						const nIdx = ny * runtime.gridWidth + nx;
						if (runtime.worldControlMap[nIdx] === ownerId) sovereignNeighbors++;
						const nDsIdx = runtime.dominantSideMap[nIdx];
						if (runtime.areSidesHostile(sideIdx, nDsIdx))
							enemyOccupiedNeighbors++;
					}
				}

				if (isEnemyOccupation && sovereignNeighbors >= 6) {
					for (let si = 0; si < runtime.sideInfluenceMaps.length; si++)
						multiplyInfluence(runtime.sideInfluenceMaps[si], idx, 0.8);
					runtime.syncOccupationFromSideInfluence(idx);
				}

				if (isSelfOccupation && enemyOccupiedNeighbors >= 7) {
					multiplyInfluence(runtime.sideInfluenceMaps[dsIdx], idx, 0.75);
					runtime.syncOccupationFromSideInfluence(idx);
				}
			}
			perf.phase67 += clockNow() - _tP0;
		} // end territorial integrity

		// 2. Statistics & Soldiers: shared territory ledger and direct manpower counts.
		const _tP133 = clockNow();
		runtime._simulationJobs.step(160_000);
		if (shouldCommitTerritoryDecision) runtime._territoryDecisionPending = true;
		const census = runtime.stepTerritoryLedger(countryToSideMap, 160_000);
		if (
			runtime._territoryDecisionPending &&
			census &&
			(census.committed ||
				(census.remainingItems === 0 && census.dirtyTiles === 0))
		) {
			runtime.publishTerritoryLedgerSnapshot(
				runtime._territoryLedgerSnapshot,
				true,
			);
			runtime._territoryDecisionPending = false;
		}
		perf.phase133 = (perf.phase133 || 0) + clockNow() - _tP133;
		const territoryCensusFresh =
			runtime._territoryLedgerDecisionTick === runtime._simTickCount;

		// Manpower is a fixed pool initialized at war start and reduced by casualties;
		// do not recompute it from current unit counts here.
		// We only ensure it never goes negative and keep casualties in sync with it below.
		for (let sIdx = 0; sIdx < runtime.MAX_SIDES; sIdx++) {
			runtime.sideSoldiers[sIdx] = Math.max(0, runtime.sideSoldiers[sIdx]);
		}

		// 3. AI & Combat (Including Mid-War Recruitment)
		// NOTE: shouldCountLand and countInterval are now computed earlier (before territorial integrity)
		//       to share the same throttle cadence across all heavy grid scans.

		// Build Spatial Hash for ultra-fast O(1) local combat & target lookup
		// Shared with renderer to allow high-performance unit culling
		const _tsh = clockNow();
		for (const arr of runtime.unitSpatialHash.values()) arr.length = 0;
		for (let si = 0; si < runtime.sides.length; si++) {
			for (const arr of runtime.unitHashBySide[si].values()) arr.length = 0;
		}
		const unitHash = runtime.unitSpatialHash;
		const HASH_SIZE = runtime.UNIT_HASH_CELL_SIZE;
		runtime._unitLiveGeneration++;
		for (let i = 0; i < runtime.units.length; i++) {
			const u = runtime.units[i];
			if (Number.isNaN(u.lat) || Number.isNaN(u.lng)) continue;
			u._liveGeneration = runtime._unitLiveGeneration;
			const country = _countryById.get(u.sovereignId);
			let allyWeight = Math.max(0, runtime.getLiveFormationStrength(u));
			if (country?.buffState === "super") allyWeight *= 200;
			else if (country?.buffState === "buff") allyWeight *= 50;
			u._tickAllyWeight = allyWeight;
			u._tickLocalAllyCount = Math.max(0, runtime.getLiveFormationStrength(u));
			u._tickHasNearbyHostile = false;
			u.repulsionVector = null;
			const kx = Math.floor((u.lng + 180) / HASH_SIZE);
			const ky = Math.floor((u.lat + 90) / HASH_SIZE);
			const k = kx * 100 + ky;
			let arr = unitHash.get(k);
			if (!arr) {
				arr = [];
				unitHash.set(k, arr);
			}
			arr.push(u);
			// Phase 1: also index into per-side hash (unused until ENABLE_SIDE_HASH_COMBAT)
			const si = u.sideIndex;
			if (si >= 0 && si < runtime.sides.length) {
				let sArr = runtime.unitHashBySide[si].get(k);
				if (!sArr) {
					sArr = [];
					runtime.unitHashBySide[si].set(k, sArr);
				}
				sArr.push(u);
			}
		}
		const _tTactical = clockNow();
		{
			runtime.rebuildTacticalGrid(runtime._tacticalGrid, runtime.units, {
				getSide: (unit) =>
					unit.health > 0 && runtime.getLiveFormationStrength(unit) > 0
						? unit.sideIndex
						: null,
			});
			let hostileCellVisits = 0;
			const tacticalRadiusSq = 0.6 * 0.6;
			for (let sideIdx = 0; sideIdx < runtime.sides.length; sideIdx++) {
				const sideCells = runtime._tacticalGrid.bySide.get(String(sideIdx));
				if (!sideCells) continue;
				for (const cell of sideCells.values()) {
					let hasTaskForceUnit = false;
					for (const unit of cell.units) {
						if (unit._taskForceUid) {
							hasTaskForceUnit = true;
							break;
						}
					}
					if (!hasTaskForceUnit) continue;
					for (
						let hostileIdx = 0;
						hostileIdx < runtime.sides.length;
						hostileIdx++
					) {
						if (!runtime.areSidesHostile(sideIdx, hostileIdx)) continue;
						hostileCellVisits += runtime.forEachNeighborCell(
							runtime._tacticalGrid,
							hostileIdx,
							cell,
							(hostileCell) => {
								for (const unit of cell.units) {
									if (!unit._taskForceUid) continue;
									if (unit._tickHasNearbyHostile) continue;
									for (const hostile of hostileCell.units) {
										const deltaLat = unit.lat - hostile.lat;
										const deltaLng = runtime.normalizeLongitudeDelta(
											unit.lng - hostile.lng,
										);
										if (
											deltaLat * deltaLat + deltaLng * deltaLng <=
											tacticalRadiusSq
										) {
											unit._tickHasNearbyHostile = true;
											break;
										}
									}
								}
							},
							{ radiusCells: 1 },
						);
					}
				}
			}
			let tacticalCandidatePairs = 0;
			let tacticalAcceptedPairs = 0;
			let tacticalFriendlyPairs = 0;
			const repulsionRadiusSq = 0.45 * 0.45;
			for (let sideIdx = 0; sideIdx < runtime.sides.length; sideIdx++) {
				const pairResult = runtime.forEachUnorderedNeighborPair(
					runtime._tacticalGrid,
					sideIdx,
					(left, right, distanceSq) => {
						tacticalFriendlyPairs++;
						const leftSkipsLocal =
							left.navalAssigned || left.supplyAssigned || left.coastalAssigned;
						const rightSkipsLocal =
							right.navalAssigned ||
							right.supplyAssigned ||
							right.coastalAssigned;
						if (!leftSkipsLocal) {
							left._tickLocalAllyCount += right._tickAllyWeight || 1;
						}
						if (!rightSkipsLocal) {
							right._tickLocalAllyCount += left._tickAllyWeight || 1;
						}
						const slotsReplaceRepulsion =
							left._taskForceUid &&
							right._taskForceUid &&
							left._taskForceUid === right._taskForceUid &&
							!left._tickHasNearbyHostile &&
							!right._tickHasNearbyHostile;
						if (
							slotsReplaceRepulsion ||
							distanceSq >= repulsionRadiusSq ||
							distanceSq <= 0.00001
						) {
							return;
						}
						const distance = Math.sqrt(distanceSq);
						const deltaLng = runtime.normalizeLongitudeDelta(
							left.lng - right.lng,
						);
						const deltaLat = left.lat - right.lat;
						if (!leftSkipsLocal) {
							left.repulsionVector = left.repulsionVector || { lat: 0, lng: 0 };
							left.repulsionVector.lat += deltaLat / distance;
							left.repulsionVector.lng += deltaLng / distance;
						}
						if (!rightSkipsLocal) {
							right.repulsionVector = right.repulsionVector || {
								lat: 0,
								lng: 0,
							};
							right.repulsionVector.lat -= deltaLat / distance;
							right.repulsionVector.lng -= deltaLng / distance;
						}
					},
					{
						radiusCells: 1,
						radiusSq: tacticalRadiusSq,
						aggregateCellPair: aggregateTaskForceCellPair,
					},
				);
				tacticalCandidatePairs += pairResult.candidatePairs;
				tacticalAcceptedPairs += pairResult.acceptedPairs;
				tacticalFriendlyPairs += pairResult.aggregatedPairs;
			}
			perf.tacticalFriendlyCandidatePairs += tacticalCandidatePairs;
			perf.tacticalAcceptedPairs += tacticalAcceptedPairs;
			perf.tacticalFriendlyPairs += tacticalFriendlyPairs;
			perf.tacticalHostileCellVisits += hostileCellVisits;
			perf.tacticalMaxBucketOccupancy =
				runtime._tacticalGrid.counters.maxBucketOccupancy;
			perf.tacticalPeakBucketOccupancy = Math.max(
				perf.tacticalPeakBucketOccupancy || 0,
				runtime._tacticalGrid.counters.maxBucketOccupancy,
			);
			perf.tacticalCellCount = runtime._tacticalGrid.counters.cellCount;
			perf.tacticalInsertedUnits = runtime._tacticalGrid.counters.insertedUnits;
		}
		perf.unitAllyScan += clockNow() - _tTactical;
		perf.spatialHash = (perf.spatialHash || 0) + clockNow() - _tsh;

		const _tFrontline = clockNow();
		// Direction fields and polyline/slot layouts share one async worker. While it
		// is busy, each work type coalesces to one newest snapshot for the next tick.
		const fieldDue =
			runtime._simTickCount - runtime.frontlineFieldTick >=
				runtime.FRONTLINE_FIELD_UPDATE_INTERVAL &&
			runtime.isSimulationPhaseDue(runtime._simTickCount, 7, 3);
		const layoutDue =
			runtime._simTickCount - runtime._frontlinePolyTick >=
				runtime.FRONTLINE_POLY_UPDATE_INTERVAL &&
			runtime.isSimulationPhaseDue(runtime._simTickCount, 7, 5);
		if (
			fieldDue ||
			layoutDue ||
			(!runtime._workerBusy &&
				(runtime._frontlineWorkerPendingField ||
					runtime._frontlineWorkerPendingLayout))
		) {
			const _tFrontlineDispatch = clockNow();
			runtime.dispatchFrontlineWork(fieldDue, layoutDue);
			perf.frontlineDispatch += clockNow() - _tFrontlineDispatch;
		}
		perf.frontline = (perf.frontline || 0) + clockNow() - _tFrontline;

		const _tPhaseWheel = clockNow();
		if (runtime.isSimulationPhaseDue(runtime._simTickCount, 30, 11)) {
			const started = clockNow();
			runtime.consolidateOverlappingUnits();
			perf.consolidate += clockNow() - started;
		}
		perf.phaseWheel += clockNow() - _tPhaseWheel;
		// Consume only committed census data; partial tile refreshes never leak into AI or
		// surrender decisions.
		_allCombatants.forEach((c) => {
			const stats = countryStats.get(c.id);
			if (!stats) return;
			const fallback = stats.units === 0 ? 0 : c.initialCells || 0;
			stats.controlled = c.lastControlledCount ?? fallback;
			stats.owned = c.lastOwnedCount ?? fallback;
			if (territoryCensusFresh) {
				const frontCount = c.lastFrontlineCount || 0;
				if (stats.units >= frontCount) c.isSaturated = true;
				else if (stats.units < frontCount * 0.6) c.isSaturated = false;
			}
		});

		while (runtime._tickUnitsBySide.length < runtime.sides.length)
			runtime._tickUnitsBySide.push([]);
		for (let si = 0; si < runtime.sides.length; si++)
			runtime._tickUnitsBySide[si].length = 0;
		const _tbs = clockNow();
		for (let ui = 0; ui < runtime.units.length; ui++) {
			const sIdx = runtime.units[ui].sideIndex;
			if (sIdx >= 0 && sIdx < runtime.sides.length)
				runtime._tickUnitsBySide[sIdx].push(runtime.units[ui]);
		}
		const unitsBySide = runtime._tickUnitsBySide;
		const hostileUnitCountsBySide = runtime.sides.map((_, sideIdx) => {
			let count = 0;
			for (let otherIdx = 0; otherIdx < unitsBySide.length; otherIdx++) {
				if (runtime.areSidesHostile(sideIdx, otherIdx)) {
					count += unitsBySide[otherIdx]?.length || 0;
				}
			}
			return count;
		});

		// Overwhelming force: if one side has 10x more deployed personnel, all units attack evenly
		const _overwhelmingForce = new Array(runtime.sides.length).fill(false);
		if (runtime.sides.length === 2) {
			const side0Strength = unitsBySide[0].reduce(
				(total, unit) => total + runtime.getLiveFormationStrength(unit),
				0,
			);
			const side1Strength = unitsBySide[1].reduce(
				(total, unit) => total + runtime.getLiveFormationStrength(unit),
				0,
			);
			if (side0Strength > 0 && side1Strength > 0) {
				if (side0Strength >= side1Strength * 10) {
					_overwhelmingForce[0] = true;
				} else if (side1Strength >= side0Strength * 10) {
					_overwhelmingForce[1] = true;
				}
			}
		}

		// Pre-compute grid index for every unit (O(n) once, avoids O(n) getGridIndex per enemy)
		runtime._tickUnitGridIdx.clear();
		const _unitGridIdx = runtime._tickUnitGridIdx;
		for (let _ugi = 0; _ugi < runtime.units.length; _ugi++) {
			const _ug = runtime.units[_ugi];
			const idx = runtime.getGridIndex(_ug.lat, _ug.lng);
			_unitGridIdx.set(_ug, idx);
			_ug._isAtSea = idx === -1 || runtime.landMask[idx] === 0;
		}

		perf.caches = (perf.caches || 0) + clockNow() - _tbs;

		const _tVictory = clockNow();

		// Calculate Victory Ratios for each side to coordinate surges
		const sideVictoryRatios = unitsBySide.map((sideUnits, sIdx) => {
			if (sideUnits.length === 0) return 0;
			const winners = sideUnits.filter((u) => u.victoryBoostTicks > 0).length;
			const ratio = winners / sideUnits.length;

			// Global Surge State: Update coordinated push status for each side
			const sideCountries = runtime.sides[sIdx];
			if (sideCountries) {
				sideCountries.forEach((c) => {
					// Lowered surge threshold to 60% momentum for more consistent offensive action.
					// A side starts a coordinated surge when victory momentum is good (>60%)
					// and frontline saturation is achieved.
					if (!c.isSurging && ratio > 0.6 && c.isSaturated) {
						c.isSurging = true;
					}
					// The surge breaks and units hold once momentum falls below 35%.
					else if (c.isSurging && ratio < 0.35) {
						c.isSurging = false;
					}

					// If not saturated, immediately kill any active surge to force line-filling.
					if (!c.isSaturated) c.isSurging = false;
				});
			}

			return ratio;
		});

		// Calculate centroids for each side to help with strategic "fanning out"
		// Group-Based Hive Intelligence: Partition each side into 4 tactical battle groups
		const numGroups = 4;
		const sideCentroids = runtime.sides.map((_, idx) => {
			const sideUnits = unitsBySide[idx];
			if (sideUnits.length === 0) return null;

			const groups = Array.from({ length: numGroups }, () => ({
				latSum: 0,
				lngSum: 0,
				count: 0,
				vLat: 0,
				vLng: 0,
			}));
			sideUnits.forEach((u) => {
				const gIdx = Math.floor(u.id * 1000) % numGroups;
				groups[gIdx].latSum += u.lat;
				groups[gIdx].lngSum += u.lng;
				groups[gIdx].vLat += u.dirLat || 0;
				groups[gIdx].vLng += u.dirLng || 0;
				groups[gIdx].count++;
			});

			return groups.map((g) =>
				g.count > 0
					? {
							lat: g.latSum / g.count,
							lng: g.lngSum / g.count,
							vLat: g.vLat / g.count,
							vLng: g.vLng / g.count,
							count: g.count,
						}
					: null,
			);
		});

		// Pre-calculate unitless hostile nations for each side. SUPPORT is an AI role,
		// not immunity from final occupation.
		const sideToCollapsedNationIds = runtime.sides.map((_side, idx) => {
			const enemies = [];
			runtime.sides.forEach((s, sIdx) => {
				const isEnemy = runtime.areSidesHostile(idx, sIdx);
				if (isEnemy && s.length > 0) {
					s.forEach((country) => {
						const stats = countryStats.get(country.id);
						if (stats && stats.units === 0 && stats.controlled > 0) {
							enemies.push(country.id);
						}
					});
				}
			});
			enemies.sort((a, b) => a - b);
			return enemies;
		});
		for (let sideIndex = 0; sideIndex < unitsBySide.length; sideIndex++) {
			const sideUnits = unitsBySide[sideIndex] || [];
			const targetCountryIds = sideToCollapsedNationIds[sideIndex] || [];
			for (let unitIndex = 0; unitIndex < sideUnits.length; unitIndex++) {
				sideUnits[unitIndex]._mopUpAssignedCountryId =
					runtime.selectAssignedMopUpCountryId(targetCountryIds, unitIndex);
			}
		}

		runtime._tickCountryToCityCount.clear();
		const countryToCityCount = runtime._tickCountryToCityCount;
		runtime._tickCountryCapitalLost.clear();
		const countryCapitalLost = runtime._tickCountryCapitalLost;

		for (const city of runtime.activeTheaterCities) {
			const idx = runtime.getGridIndex(city.lat, city.lng);
			if (idx < 0) continue;
			const ownerId = runtime.primaryOccupierMap[idx];
			if (ownerId > 0)
				countryToCityCount.set(
					ownerId,
					(countryToCityCount.get(ownerId) || 0) + 1,
				);
			if (
				city.isCapital &&
				city.sovereignId > 0 &&
				runtime.areSidesHostile(
					countryToSideMap.get(city.sovereignId),
					runtime.dominantSideMap[idx],
				)
			)
				countryCapitalLost.set(city.sovereignId, true);
		}
		// A capital that just fell starts a morale shock for its country.
		for (const countryId of countryCapitalLost.keys())
			if (!runtime.capitalLostCountries.has(countryId))
				runtime._capitalFallTick.set(countryId, runtime._simTickCount);
		// Expose capital-loss state globally so recruitment/spawn logic can react to supply failure
		runtime.capitalLostCountries = new Set(countryCapitalLost.keys());

		// --- COUNTRY AI POSTURE (Desperation + realism tuning) ---
		// Recomputed on counting frames and reused between them.
		const _tAiPosture = clockNow();
		perf.victory = (perf.victory || 0) + clockNow() - _tVictory;
		if (shouldCountLand) {
			_allCombatants.forEach((country) => {
				if (!country) return;
				const stats = countryStats.get(country.id);
				if (!stats) return;

				const initialLand = Math.max(1, country.initialCells || 1);
				const controlRatio = stats.controlled / initialLand;
				const cityCount = countryToCityCount.get(country.id) || 0;
				if (country._aiInitialCities === undefined)
					country._aiInitialCities = cityCount;
				const initCities = Math.max(1, country._aiInitialCities || 1);
				const cityRatio = cityCount / initCities;

				const prevControlled =
					country._aiPrevControlled !== undefined
						? country._aiPrevControlled
						: stats.controlled;
				const deltaControlled = stats.controlled - prevControlled;
				country._aiPrevControlled = stats.controlled;

				const stallDeltaThreshold = Math.max(
					1,
					Math.floor(
						initialLand * runtime.AI_DESPERATION.OFFENSE_STALL_DELTA_FRAC,
					),
				);
				const isStalled = Math.abs(deltaControlled) <= stallDeltaThreshold;
				if (isStalled) {
					country._aiStallTicks = (country._aiStallTicks || 0) + countInterval;
				} else {
					country._aiStallTicks = Math.max(
						0,
						(country._aiStallTicks || 0) - countInterval * 2,
					);
				}

				const role = country.role || "OFFENSE";
				const canUseOffensiveDesperation =
					role === "OFFENSE" &&
					runtime.simFrameCount >=
						runtime.AI_DESPERATION.OFFENSE_MIN_WAR_TICKS &&
					(country._aiStallTicks || 0) >=
						runtime.AI_DESPERATION.OFFENSE_STALL_TICKS &&
					controlRatio > 0.45;

				// UNDER_MOBILIZED: safe territory but severely under‑armied relative to manpower pool
				const deployedPersonnel =
					stats.units * runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
				if (country._aiInitialManpower === undefined) {
					const metadata = runtime.countryMetadata[country.id - 1] || country;
					const estimatedPool = metadata?.pop
						? Math.round(metadata.pop * 0.01)
						: Math.round(initialLand * 200 + initCities * 10000);
					country._aiInitialManpower = Math.max(
						deployedPersonnel,
						estimatedPool,
					);
				}
				const mobilizationRatio =
					deployedPersonnel / Math.max(1, country._aiInitialManpower);
				const canUseUnderMobilized = mobilizationRatio < 0.75;

				const lastStand =
					controlRatio <= runtime.AI_DESPERATION.LAST_STAND_TRIGGER_RATIO ||
					cityRatio <= runtime.AI_DESPERATION.CITY_RATIO_LAST_STAND_TRIGGER;
				const defensiveDesperation =
					!lastStand &&
					(controlRatio <= runtime.AI_DESPERATION.DEFENSE_TRIGGER_RATIO ||
						cityRatio <= runtime.AI_DESPERATION.CITY_RATIO_DEFENSE_TRIGGER);

				let mode = runtime.AI_POSTURE.NORMAL;
				if (lastStand) mode = runtime.AI_POSTURE.LAST_STAND;
				else if (defensiveDesperation)
					mode = runtime.AI_POSTURE.DEFENSIVE_DESPERATION;
				else if (canUseOffensiveDesperation)
					mode = runtime.AI_POSTURE.OFFENSIVE_DESPERATION;
				else if (canUseUnderMobilized)
					mode = runtime.AI_POSTURE.UNDER_MOBILIZED;

				let profile = {
					mode,
					recruitCapMult: 1.0,
					recruitChanceMult: 1.0,
					retreatTriggerMultiple: 8.0,
					frontlineBlend: 0.35,
					speedMult: 1.0,
					targetCityWeight: 0.0,
					forceDefensive: false,
					reserveShare: 0.02,
					peacePressure: 0.0,
				};
				if (mode === runtime.AI_POSTURE.OFFENSIVE_DESPERATION) {
					profile = {
						mode,
						recruitCapMult: 1.2,
						recruitChanceMult: 1.45,
						retreatTriggerMultiple: 10.0,
						frontlineBlend: 0.45,
						speedMult: 1.08,
						targetCityWeight: 0.45,
						forceDefensive: false,
						reserveShare: 0.01,
						peacePressure: 0.02,
					};
				} else if (mode === runtime.AI_POSTURE.DEFENSIVE_DESPERATION) {
					profile = {
						mode,
						recruitCapMult: 1.45,
						recruitChanceMult: 1.8,
						retreatTriggerMultiple: 5.8,
						frontlineBlend: 0.4,
						speedMult: 0.96,
						targetCityWeight: 0.18,
						forceDefensive: true,
						reserveShare: 0.06,
						peacePressure: 0.36,
					};
				} else if (mode === runtime.AI_POSTURE.LAST_STAND) {
					profile = {
						mode,
						recruitCapMult: 1.85,
						recruitChanceMult: 2.5,
						retreatTriggerMultiple: 4.8,
						frontlineBlend: 0.3,
						speedMult: 0.92,
						targetCityWeight: 0.05,
						forceDefensive: true,
						reserveShare: 0.1,
						peacePressure: 0.7,
					};
				} else if (mode === runtime.AI_POSTURE.UNDER_MOBILIZED) {
					profile = {
						mode,
						recruitCapMult: 3.0,
						recruitChanceMult: 5.0,
						retreatTriggerMultiple: 8.0,
						frontlineBlend: 0.35,
						speedMult: 1.0,
						targetCityWeight: 0.0,
						forceDefensive: false,
						reserveShare: 0.02,
						peacePressure: 0.0,
					};
				}

				// Total war strategies (TURTLE, BLITZ): all-in mobilization
				// 4x unit cap, 6x recruitment speed — meat grinder that sustains itself

				runtime.aiCountryState.set(country.id, profile);
			});
		}
		perf.aiPosture = (perf.aiPosture || 0) + clockNow() - _tAiPosture;

		// ── Momentum Tracking & War Phase Computation ──
		if (shouldCountLand) {
			const MOMENTUM_WINDOW = 10;
			for (let si = 0; si < runtime.sides.length; si++) {
				if (!runtime.sides[si] || runtime.sides[si].length === 0) continue;
				if (!runtime._sideMomentumHistory[si])
					runtime._sideMomentumHistory[si] = [];
				let totalControlled = 0;
				for (const c of runtime.sides[si]) {
					const s = countryStats.get(c.id);
					if (s) totalControlled += s.controlled || 0;
				}
				runtime._sideMomentumHistory[si].push({
					tick: runtime.simFrameCount,
					controlled: totalControlled,
				});
				if (runtime._sideMomentumHistory[si].length > MOMENTUM_WINDOW) {
					runtime._sideMomentumHistory[si].shift();
				}
			}

			// Compute war phase from momentum slope
			for (let si = 0; si < runtime.sides.length; si++) {
				const hist = runtime._sideMomentumHistory[si];
				if (!hist || hist.length < 3) {
					runtime._sideWarPhase[si] = "STALEMATE";
					continue;
				}

				const first = hist[0].controlled;
				const last = hist[hist.length - 1].controlled;
				const delta = last - first;
				const deltaRatio = first > 0 ? delta / first : 0;

				// Count consecutive trend direction (last 3 entries)
				let trendUp = 0;
				let trendDown = 0;
				for (let i = Math.max(0, hist.length - 3); i < hist.length; i++) {
					if (i > 0) {
						if (hist[i].controlled > hist[i - 1].controlled) trendUp++;
						else if (hist[i].controlled < hist[i - 1].controlled) trendDown++;
					}
				}

				const mpRatio =
					runtime.initialSideSoldiers[si] > 0
						? runtime.sideSoldiers[si] / runtime.initialSideSoldiers[si]
						: 1;

				if (deltaRatio < -0.05 || mpRatio < 0.1) {
					runtime._sideWarPhase[si] = "COLLAPSING";
				} else if (deltaRatio < -0.005 || trendDown >= 2) {
					runtime._sideWarPhase[si] = "RETREATING";
				} else if (deltaRatio > 0.005 || trendUp >= 2) {
					runtime._sideWarPhase[si] = "ADVANCING";
				} else {
					runtime._sideWarPhase[si] = "STALEMATE";
				}
			}
		}
		const { sideStrength, sideUnitCounts } =
			runtime.refreshLiveCombatPower(true);

		// ── Auto Posture: per-side strength ratio → OFFENSIVE/BALANCED/DEFENSIVE ──
		const _tpo = clockNow();

		runtime._sidePosture = new Array(runtime.sides.length).fill("BALANCED");
		for (let si = 0; si < runtime.sides.length; si++) {
			if (sideUnitCounts[si] === 0) continue;
			const totalEnemyStrength = runtime.getKnownEnemyPowerForSide(si);
			const totalEnemyUnits = totalEnemyStrength;
			// Check if this side has LAST_STAND or OFFENSIVE_DESPERATION countries
			let hasLastStand = false;
			let hasOffDesp = false;
			runtime.sides[si].forEach((c) => {
				const prof = runtime.aiCountryState.get(c.id);
				if (prof?.mode === runtime.AI_POSTURE.LAST_STAND) hasLastStand = true;
				if (prof?.mode === runtime.AI_POSTURE.OFFENSIVE_DESPERATION)
					hasOffDesp = true;
			});

			// Force defensive posture if a defender reaction plan is active
			if (runtime._defenderReactionPlan[si])
				runtime._sidePosture[si] = "DEFENSIVE";
			if (hasLastStand) {
				runtime._sidePosture[si] = "DEFENSIVE";
			} else if (hasOffDesp) {
				runtime._sidePosture[si] = "OFFENSIVE";
			} else if (totalEnemyUnits > 0) {
				const ratio = sideStrength[si] / Math.max(1, totalEnemyStrength);
				if (ratio > 1.5) runtime._sidePosture[si] = "OFFENSIVE";
				else if (ratio < 0.7) runtime._sidePosture[si] = "DEFENSIVE";
			}

			// Apply posture to country profiles
			// MANPOWER: critically low manpower forces defensive posture regardless of strength
			if (runtime.initialSideSoldiers[si] > 0) {
				const mpRatio =
					runtime.sideSoldiers[si] / runtime.initialSideSoldiers[si];
				if (mpRatio < 0.15) {
					runtime._sidePosture[si] = "DEFENSIVE"; // under 15% manpower = forced defense
				}
			}

			if (runtime._sidePosture[si] === "DEFENSIVE") {
				runtime.sides[si].forEach((c) => {
					const prof = runtime.aiCountryState.get(c.id);
					if (prof) {
						prof.forceDefensive = true;
						// Scale defensive severity by manpower: lower MP = tighter defense
						const mpRatio =
							runtime.initialSideSoldiers[si] > 0
								? Math.max(
										0,
										runtime.sideSoldiers[si] / runtime.initialSideSoldiers[si],
									)
								: 0;
						const defensiveScale =
							mpRatio < 0.25 ? 0.6 : mpRatio < 0.5 ? 0.8 : 1.0;
						prof.frontlineBlend = Math.min(
							prof.frontlineBlend,
							0.3 * defensiveScale,
						);
						prof.speedMult = Math.min(prof.speedMult, 0.96 * defensiveScale);
					}
				});
			} else if (runtime._sidePosture[si] === "OFFENSIVE") {
				runtime.sides[si].forEach((c) => {
					const prof = runtime.aiCountryState.get(c.id);
					if (prof) {
						prof.forceDefensive = false;
						prof.frontlineBlend = Math.max(prof.frontlineBlend, 0.4);
					}
				});
			}
		}

		// Evaluate war plans — check completion/failure, regenerate if needed
		perf.posture = (perf.posture || 0) + clockNow() - _tpo;
		// Cumulative pre-plans profiler: everything from tick start (_t0) to here
		perf.prePlans = (perf.prePlans || 0) + clockNow() - _t0;
		const _t1 = clockNow();
		const _tLegacyPlans = clockNow();
		runtime.evaluateAllPlans();
		perf.legacyPlans += clockNow() - _tLegacyPlans;
		const _tOperationalTaskForces = clockNow();
		runtime.updateOperationalAiTaskForces();
		const operationalTaskForceMs = clockNow() - _tOperationalTaskForces;
		perf.operationalTaskForces += operationalTaskForceMs;
		runtime.recordPerfMeasure(
			"Operational AI · Task Forces",
			_tOperationalTaskForces,
			operationalTaskForceMs,
		);
		perf.plans += clockNow() - _t1;

		// ── Compute neutral border polylines only when political topology changes ──
		const _tn = clockNow();
		const neutralBorderSignature = `${runtime._simulationWorldGeneration}:${runtime._politicalMapRevision}:${[...combatantIds].sort((left, right) => left - right).join(",")}`;
		if (
			runtime.adjacencyCache &&
			neutralBorderSignature !== runtime._neutralBorderCacheSignature
		) {
			runtime._neutralBorderCacheSignature = neutralBorderSignature;
			runtime._neutralBorderPolys = {};

			// Identify combatant countries with neutral neighbors
			const combatantNeutralBorders = {};
			for (const [countryId, neighbors] of runtime.adjacencyCache.entries()) {
				if (!combatantIds.has(countryId)) continue;
				const neutralNeighbors = [];
				for (const nId of neighbors) {
					if (combatantIds.has(nId)) continue;
					neutralNeighbors.push(nId);
				}
				if (neutralNeighbors.length > 0) {
					combatantNeutralBorders[countryId] = new Set();
				}
			}

			// Full-grid scan to find frontier cells between combatants and neutrals
			if (Object.keys(combatantNeutralBorders).length > 0) {
				const total = runtime.gridWidth * runtime.gridHeight;
				for (let i = 0; i < total; i++) {
					if (runtime.landMask[i] !== 2) continue;
					const owner = runtime.worldControlMap[i];
					if (!combatantNeutralBorders[owner]) continue;
					const nb4 = [
						i + 1,
						i - 1,
						i + runtime.gridWidth,
						i - runtime.gridWidth,
					];
					for (let nb = 0; nb < 4; nb++) {
						const ni = nb4[nb];
						if (ni < 0 || ni >= total) continue;
						if (runtime.landMask[ni] !== 2) continue;
						const nbOwner = runtime.worldControlMap[ni];
						if (nbOwner === 0 || nbOwner === owner) continue;
						if (!combatantIds.has(nbOwner)) {
							combatantNeutralBorders[owner].add(i);
							break;
						}
					}
				}

				for (const [countryId, cells] of Object.entries(
					combatantNeutralBorders,
				)) {
					if (cells.size === 0) continue;
					const poly = [];
					for (const idx of cells) {
						const y = Math.floor(idx / runtime.gridWidth);
						const x = idx % runtime.gridWidth;
						poly.push({
							lat: y * runtime.CONFIG.GRID_RES - 90,
							lng: x * runtime.CONFIG.GRID_RES - 180,
						});
					}
					runtime._neutralBorderPolys[countryId] = poly;
				}
			}
		}
		// Prevent infinite re-run when no borders exist: sentinel key stops the length===0 fallback
		if (Object.keys(runtime._neutralBorderPolys).length === 0) {
			runtime._neutralBorderPolys.__empty = true;
		}
		perf.neutralBorder += clockNow() - _tn;

		const _t2 = clockNow();
		// Mid-War Recruitment (Steady, Land-Capped, and Underdog-Aware)
		runtime.sides.forEach((side, sIdx) => {
			side.forEach((country) => {
				const stats = countryStats.get(country.id);
				if (!stats) return;

				const currentUnits = stats.units;
				const initialLand = country.initialCells || 1;
				const currentLand = stats.controlled;

				const supplyFailed = runtime.capitalLostCountries.has(country.id);
				// Increased army caps to accommodate the much higher frontline saturation requirements.
				// Less aggressive size scaling to allow large empires to maintain thick lines.
				const sizeFactor = Math.max(1, currentLand / 2000);
				const densityScale = 1.0 / sizeFactor ** 0.35;
				// Stronger city-based cap: more cities = more potential divisions in the field.
				const cityCount = countryToCityCount.get(country.id) || 0;
				const landCityMultiplier = 1 + cityCount * 0.12; // each city adds +12% to this country's cap (capped later by side limits)
				const landBasedCap = Math.max(
					8,
					Math.floor(
						currentLand *
							runtime.CONFIG.UNIT_DENSITY_FACTOR *
							1.5 *
							densityScale *
							landCityMultiplier,
					),
				);
				const sideLimit = runtime.CONFIG.MAX_UNITS_PER_SIDE;

				// Flexible Limit: allow bigger armies but still clamp for performance
				const flexibleLimit =
					sideLimit *
					(1 + Math.min(3.0, currentLand / 4000 + cityCount * 0.15));
				let absoluteCap = Math.min(landBasedCap, flexibleLimit);

				// When manual manpower is set, allow recruiting up to the manpower-based cap
				const manualMP = runtime.manualSideManpower[sIdx];
				if (manualMP !== null) {
					absoluteCap = Math.max(
						absoluteCap,
						Math.floor(manualMP / runtime.CONFIG.UNIT_TO_SOLDIER_RATIO),
					);
				}

				// GODLY Buff: Higher cap and ignores flexible limits
				if (country.buffState === "godly") {
					absoluteCap = Math.max(absoluteCap, 3600);
				}

				// If the capital has fallen, supply is failing: drastically limit total fieldable troops
				if (supplyFailed) {
					absoluteCap = Math.max(15, Math.floor(absoluteCap * 0.3));
				}
				// MANPOWER: hard cap based on remaining side manpower
				const recruitableFormationEquivalents =
					runtime.sideRecruitableManpower[sIdx] > 0
						? Math.ceil(
								runtime.sideRecruitableManpower[sIdx] /
									(runtime.soldiersPerUnit[sIdx] ||
										runtime.CONFIG.UNIT_TO_SOLDIER_RATIO),
							)
						: 0;
				if (
					recruitableFormationEquivalents === 0 &&
					runtime.sideRecruitableManpower[sIdx] <= 0
				) {
					absoluteCap = 0; // no manpower = no more troops
				} else if (recruitableFormationEquivalents > 0) {
					absoluteCap = Math.min(
						absoluteCap,
						currentUnits + recruitableFormationEquivalents,
					);
				}

				const isTotalWar = false;
				const overcapLimit = isTotalWar
					? Math.floor(absoluteCap * 1.2)
					: absoluteCap;
				if (currentUnits < overcapLimit) {
					const controlRatio = currentLand / initialLand;
					const cityCountLocal = countryToCityCount.get(country.id) || 0;
					const cityBonus = 0.5 + cityCountLocal * 0.5; // Cities are a primary driver of recruitment speed

					// Manpower Scale: Diminishing returns on recruitment for massive nations
					// to prevent them from overwhelmingly flooding the screen with unit flags.
					const landRatio = currentLand / 2000; // Reference size
					const scaleFactor = Math.max(0.8, landRatio ** 0.4); // raised floor so small countries aren't recruit-starved

					// Underdog Bonus: help nations that have lost most of their land cycle recruits faster
					const underdogFactor = 0;

					// Annexation Urgency: once a country drops under 60% of its original land,
					// ramp recruitment up sharply the closer it gets to zero to avoid soft capitulations.
					const annexationUrgency = 0;
					const annexationMultiplier = 1 + annexationUrgency;

					// Faster baseline recruitment, heavily amplified by city count, underdog status,
					// and annexation urgency.
					const baseRecruitmentChance = 0.012; // doubled for more aggressive mid-war reinforcement
					let recruitmentChance =
						baseRecruitmentChance *
						scaleFactor *
						(controlRatio + cityBonus + underdogFactor) *
						annexationMultiplier;
					const mobilizationMult =
						runtime.simFrameCount < runtime.AI_MOBILIZATION.EARLY_TICKS
							? 1 +
								(runtime.AI_MOBILIZATION.EARLY_RECRUIT_MULT - 1) *
									(1 -
										runtime.simFrameCount / runtime.AI_MOBILIZATION.EARLY_TICKS)
							: 1;
					recruitmentChance *= mobilizationMult;

					if (country.buffState === "godly") {
						recruitmentChance *= 12.0; // 12x recruitment speed
					}

					// If the capital is lost, recruitment almost collapses
					if (supplyFailed) {
						recruitmentChance *= 0.1; // 90% reduction in new troops
						// MANPOWER: scale recruitment chance by remaining manpower ratio
						// At 50% manpower: 70% chance. At 25%: 35%. At 0%: no recruits.
						if (runtime.initialSideSoldiers[sIdx] > 0) {
							const mpRatio = Math.max(
								0,
								runtime.sideSoldiers[sIdx] / runtime.initialSideSoldiers[sIdx],
							);
							if (mpRatio <= 0) {
								recruitmentChance = 0; // no manpower = no new units
							} else {
								recruitmentChance *= Math.min(1, mpRatio * 2); // linear scale, capped at 100%
							}
						}
					}

					// Cap-fill urgency: the more empty the army, the harder they draft
					const capFillRatio = Math.min(
						1,
						currentUnits / Math.max(1, absoluteCap),
					);
					const capFillMult = 1.0 + (1 - capFillRatio) * 3.0; // 1× at full → 4× at empty
					recruitmentChance *= capFillMult;
					// Total war double-dip: extra recruitment pressure when losses mount
					if (isTotalWar && capFillRatio < 0.5) {
						recruitmentChance *= 1.0 + (0.5 - capFillRatio) * 4.0; // up to 3× extra when half-empty
					}
					// Momentum-based recruitment: panic conscription when losing

					// Clamp per-tick chance at 80% to prevent deterministic spam
					if (recruitmentChance > 0.8) recruitmentChance = 0.8;

					// Panic conscription: spawn multiple units per tick when desperate
					const spawnsThisTick = 1;
					for (let sp = 0; sp < spawnsThisTick; sp++) {
						if (Math.random() < recruitmentChance) {
							runtime.spawnSingleUnit(sIdx, country.id);
						}
					}
				}
			});
		});

		// Precompute city list once per tick
		const globalCityTargets = runtime.activeTheaterCities?.length
			? runtime.activeTheaterCities
			: runtime.cities;
		const enemyCityCandidatesBySide = runtime.getEnemyCityCandidatesBySide(
			globalCityTargets,
			countryToSideMap,
		);

		// PERF: Pre-group cities by sovereignId once, instead of cities.filter() per-unit (was 4.3% self-time).
		runtime._tickCitiesBySovereign.clear();
		const _citiesBySovereign = runtime._tickCitiesBySovereign;
		if (runtime.cities?.length) {
			for (let ci = 0; ci < runtime.cities.length; ci++) {
				const c = runtime.cities[ci];
				const oid = c.ownerId || c.sovereignId;
				if (oid !== null) {
					let arr = _citiesBySovereign.get(oid);
					if (!arr) {
						arr = [];
						_citiesBySovereign.set(oid, arr);
					}
					arr.push(c);
				}
			}
		}

		// PERF: Pre-build Map<id, metadata> for O(1) lookup instead of countryMetadata.find() per-unit (was 1.5% self-time).
		runtime._tickMetadataById.clear();
		const _metadataById = runtime._tickMetadataById;
		for (let mi = 0; mi < runtime.countryMetadata.length; mi++) {
			const m = runtime.countryMetadata[mi];
			if (m && m.id !== undefined) _metadataById.set(m.id, m);
		}

		perf.recruit += clockNow() - _t2;
		const _t3 = clockNow();
		// Pre-build city grid index Set once per tick (not per unit)
		const _cityIdxSetTick = new Set();
		for (let _cci = 0; _cci < runtime.activeTheaterCities.length; _cci++) {
			const _cIdx = runtime.getGridIndex(
				runtime.activeTheaterCities[_cci].lat,
				runtime.activeTheaterCities[_cci].lng,
			);
			if (_cIdx !== -1) _cityIdxSetTick.add(_cIdx);
		}
		// Pre-build city-by-sovereign Map for O(1) lookup in combat (replaces O(C) activeTheaterCities.find)
		const _theaterCitiesBySovereign = new Map();
		for (let _cci = 0; _cci < runtime.activeTheaterCities.length; _cci++) {
			const city = runtime.activeTheaterCities[_cci];
			if (!city.sovereignId) continue;
			let arr = _theaterCitiesBySovereign.get(city.sovereignId);
			if (!arr) {
				arr = [];
				_theaterCitiesBySovereign.set(city.sovereignId, arr);
			}
			arr.push(city);
		}
		const _detailedPerfEnabled = perf._mode === "detailed";
		const groundFrame = {
			getArmyMovement: runtime.getArmyMovement,
			isArmyCellPassable: runtime.isArmyCellPassable,
			perf,
			units: runtime.units,
			_detailedPerfEnabled,
			getLiveFormationStrength: runtime.getLiveFormationStrength,
			numGroups,
			sideCentroids,
			sides: runtime.sides,
			_countryById,
			aiCountryState: runtime.aiCountryState,
			_metadataById,
			getEffectiveBuffState: runtime.getEffectiveBuffState,
			countryCapitalLost,
			_capitalFallTick: runtime._capitalFallTick,
			_sideWarPhase: runtime._sideWarPhase,
			_unitGridIdx,
			countryToSideMap,
			landMask: runtime.landMask,
			mountainsEnabled: runtime.mountainsEnabled,
			terrainMask: runtime.terrainMask,
			riverMask: runtime.riverMask,
			encirclementPockets: runtime.encirclementPockets,
			getControlValue: runtime.getControlValue,
			isEnemyTerritory: runtime.isEnemyTerritory,
			simFrameCount: runtime.simFrameCount,
			HASH_SIZE,
			getGridIndex: runtime.getGridIndex,
			hostileUnitCountsBySide,
			worldControlMap: runtime.worldControlMap,
			isMyTerritory: runtime.isMyTerritory,
			myInfluenceAt: runtime.myInfluenceAt,
			areSidesHostile: runtime.areSidesHostile,
			getBorderDirection: runtime.getBorderDirection,
			_strategicTargetGeneration: runtime._strategicTargetGeneration,
			simSpeed: runtime.simSpeed,
			STRATEGIC_COHORT_COUNT: runtime.STRATEGIC_COHORT_COUNT,
			_simTickCount: runtime._simTickCount,
			enemyCityCandidatesBySide,
			CITY_OBJECTIVE_REFRESH_INTERVAL: runtime.CITY_OBJECTIVE_REFRESH_INTERVAL,
			returnUnitPersonnelToReserve: runtime.returnUnitPersonnelToReserve,
			CONFIG: runtime.CONFIG,
			countryStats,
			recordDamage,
			gridWidth: runtime.gridWidth,
			gridHeight: runtime.gridHeight,
			dominantSideMap: runtime.dominantSideMap,
			_unitLiveGeneration: runtime._unitLiveGeneration,
			stableUnitCohort: runtime.stableUnitCohort,
			normalizeLongitudeDelta: runtime.normalizeLongitudeDelta,
			warGraceEndTick: runtime.warGraceEndTick,
			formationDamage: runtime.formationDamage,
			_cityIdxSetTick,
			_battleKey: runtime._battleKey,
			_battleHash: runtime._battleHash,
			activeBattles: runtime.activeBattles,
			unitHashBySide: runtime.unitHashBySide,
			isNeutralCountry,
			_neutralGarrisonPlan: runtime._neutralGarrisonPlan,
			_coastalDefensePlan: runtime._coastalDefensePlan,
			clearUnitStrategicTargets: runtime.clearUnitStrategicTargets,
			_mopUpOwnedCellCache: runtime._mopUpOwnedCellCache,
			selectNearestMopUpCell: runtime.selectNearestMopUpCell,
			CITY_WATER_CHECK_LIMIT: runtime.CITY_WATER_CHECK_LIMIT,
			_warPlan: runtime._warPlan,
			_navalPlan: runtime._navalPlan,
			_navalSupplyPlan: runtime._navalSupplyPlan,
			_overwhelmingForce,
			geoDistSq: runtime.geoDistSq,
			_transportPlan: runtime._transportPlan,
			_frontlinePolys: runtime._frontlinePolys,
			isNeutral,
			sideVictoryRatios,
			deJureMap: runtime.deJureMap,
			_theaterCitiesBySovereign,
			moveDirLat,
			moveDirLng,
		};
		const updateFormation = runtime.createGroundFormationUpdater(groundFrame);
		for (let i = runtime.units.length - 1; i >= 0; i--) updateFormation(i);

		// A side can keep fighting at zero reserve, but it cannot recruit new formations.
		perf.unitLoop += clockNow() - _t3;
		// Sealed pockets drive attrition, breakout and relief; twice a second at 1x
		// is enough.
		if (runtime._simTickCount % POCKET_SCAN_INTERVAL === 0)
			runtime.encirclementPockets = findEncirclementPockets(runtime);
		const _t4 = clockNow();
		// 4. Individual Capitulation & Treaty Logic
		// Peace offers pace on simulation ticks, so every speed sees the same rate.
		const ticksSinceTreaty = runtime._simTickCount - runtime.lastTreatyTick;

		// Capitulation is evaluated only when a complete dirty-tile census commits, so
		// every country observes one coherent territory snapshot.
		if (territoryCensusFresh) {
			for (let sIdx = 0; sIdx < runtime.sides.length; sIdx++) {
				const side = runtime.sides[sIdx];
				const hasActiveHostility = runtime.sides.some(
					(other, otherIdx) =>
						otherIdx !== sIdx &&
						other?.length > 0 &&
						runtime.areSidesHostile(sIdx, otherIdx),
				);
				if (!hasActiveHostility) continue;
				for (let i = side.length - 1; i >= 0; i--) {
					const country = side[i];
					const stats = countryStats.get(country.id);
					if (!stats) continue;
					const decision = runtime.evaluateCountryCapitulation({
						hasFreshTerritoryData: true,
						unitCount: stats.units,
						ownedCells: stats.owned,
						controlledCells: stats.controlled,
						initialCells: country.initialCells,
					});
					if (!decision.capitulate) continue;

					console.warn("[MW] CAPITULATION:", country.name, {
						reason: decision.reason,
						units: stats.units,
						controlledPercent: Number(decision.controlPercent.toFixed(2)),
						owned: stats.owned,
						initialCells: country.initialCells,
						threshold: decision.threshold ?? 0,
					});
					if (runtime.capitulateCountry(country, sIdx)) {
						// Exit tick early to re-evaluate state with updated sides and units.
						return false;
					}
				}
			}
		}

		// Determine which sides still contain participating countries.
		const activeSideSet = new Set();
		runtime.sides.forEach((side, idx) => {
			if (side.length > 0) activeSideSet.add(idx);
		});

		if (runtime.gameState === "SIMULATING") {
			const activeHostilePairs = runtime.getActiveHostilePairs();
			const resolution = runtime.evaluateGlobalConflict(
				Array.from(activeSideSet),
				activeHostilePairs,
			);
			if (resolution) {
				runtime.applyTreaty(resolution.type, resolution.winnerSideIdx);
				return true;
			}
		}

		let sideTerritoryCounts = runtime._cachedSideTerritoryCounts;
		if (shouldCountLand) {
			// The last atomically committed ledger generation is coherent. Avoid the
			// former multi-million-cell scan on every 200-tick report boundary.
			sideTerritoryCounts = runtime._cachedSideTerritoryCounts;
		}
		const totalTerritory = sideTerritoryCounts.reduce((a, b) => a + b, 0);
		const side0Pct =
			totalTerritory > 0 ? (sideTerritoryCounts[0] / totalTerritory) * 100 : 50;

		// Territory-based capitulation — only fire when BOTH sides still have units
		// and allow grace period after recent capitulation to prevent cascade
		const side0HasUnits = runtime.sides[0]?.some((c) =>
			runtime.units.some((u) => u.sovereignId === c.id),
		);
		const side1HasUnits =
			runtime.sides.length > 1 &&
			runtime.sides[1] &&
			runtime.sides[1].some((c) =>
				runtime.units.some((u) => u.sovereignId === c.id),
			);
		const recentCapitulation =
			runtime._simTickCount - runtime._lastCapitulationTick < 600;

		const primarySidesHostile =
			runtime.sides.length === 2 && runtime.areSidesHostile(0, 1);
		if (
			primarySidesHostile &&
			!recentCapitulation &&
			side0Pct >= 99.9 &&
			side0HasUnits &&
			side1HasUnits
		) {
			runtime.applyTreaty("FULL_CAPITULATION", 0);
			return true;
		} else if (
			primarySidesHostile &&
			!recentCapitulation &&
			side0Pct <= 0.1 &&
			side0HasUnits &&
			side1HasUnits
		) {
			runtime.applyTreaty(
				"FULL_CAPITULATION",
				runtime.sides.length > 1 ? 1 : 0,
			);
			return true;
		} else if (
			ticksSinceTreaty > TREATY_COOLDOWN_TICKS &&
			!runtime.isTreatyNoticeVisible()
		) {
			if (!runtime.peaceTreatiesDisabled) {
				const getSidePressure = (sIdx) => {
					let total = 0;
					let count = 0;
					const side = runtime.sides[sIdx];
					if (!side) return 0;
					side.forEach((c) => {
						total += runtime.aiCountryState.get(c.id)?.peacePressure || 0;
						count++;
					});
					return count > 0 ? total / count : 0;
				};
				const pressures = runtime.sides.map((_, idx) => getSidePressure(idx));
				const maxPressure = Math.max(...pressures.filter((p) => p > 0));
				const proposalChance =
					runtime.AI_DESPERATION.PEACE_PRESSURE_PROPOSAL_BASE *
					(1 +
						Math.min(
							runtime.AI_DESPERATION.PEACE_PRESSURE_PROPOSAL_MULT_MAX,
							maxPressure * 5,
						));

				if (Math.random() < proposalChance) {
					const proposerSideIdx = Math.floor(
						Math.random() * runtime.sides.length,
					);
					if (
						runtime.sides[proposerSideIdx] &&
						runtime.sides[proposerSideIdx].length > 0
					) {
						const receiverSideIdx = runtime.sides.findIndex(
							(s, i) =>
								i !== proposerSideIdx &&
								s.length > 0 &&
								runtime.areSidesHostile(proposerSideIdx, i),
						);
						if (receiverSideIdx !== -1) {
							const receiverLand =
								totalTerritory > 0
									? (sideTerritoryCounts[receiverSideIdx] / totalTerritory) *
										100
									: 50;
							const proposerPressure = pressures[proposerSideIdx];
							const receiverPressure = pressures[receiverSideIdx];
							let acceptChance = Math.max(0.1, (100 - receiverLand) / 100);
							acceptChance += receiverPressure * 0.25;
							acceptChance -=
								Math.max(0, proposerPressure - receiverPressure) * 0.12;
							acceptChance = Math.max(0.05, Math.min(0.95, acceptChance));
							runtime.showTreatyOffer(
								proposerSideIdx,
								Math.random() < acceptChance,
								proposerSideIdx,
							);
						}
					}
				}
			}
		}

		if (runtime.units.length === 0 && runtime.gameState === "SIMULATING") {
			runtime.applyTreaty("WHITE_PEACE");
			return true;
		}

		// 5. Update Bombs & Explosions
		if (runtime.bombsDisabled) {
			runtime.bombs = [];
		}
		for (let i = runtime.bombs.length - 1; i >= 0; i--) {
			const b = runtime.bombs[i];
			// Slower step for smoother movement, accelerating slightly on descent
			const step =
				0.0055 * (b.state === "falling" ? 1 + (b.progress - 0.5) * 2.5 : 1);
			b.progress += step;

			if (b.state === "rising" && b.progress >= 0.5) {
				b.state = "falling";
			}

			const t = b.progress;
			const latBase = b.startLat + (b.targetLat - b.startLat) * t;
			const lngBase = b.startLng + (b.targetLng - b.startLng) * t;

			const alt = Math.sin(Math.PI * t) * b.peakAlt;
			b.currentLat = latBase + alt;
			b.currentLng = lngBase;

			// Predict next position for rotation calculation
			const nextT = Math.min(1.0, t + 0.005);
			const nextLatBase = b.startLat + (b.targetLat - b.startLat) * nextT;
			const nextLngBase = b.startLng + (b.targetLng - b.startLng) * nextT;
			const nextAlt = Math.sin(Math.PI * nextT) * b.peakAlt;
			b.nextLat = nextLatBase + nextAlt;
			b.nextLng = nextLngBase;

			// Trail logic
			b.trail.push({ lat: b.currentLat, lng: b.currentLng });
			if (b.trail.length > 40) b.trail.shift();

			if (b.progress >= 1.0) {
				// Impact!
				runtime.playExplosionSound();
				runtime.explosions.push({
					lat: b.targetLat,
					lng: b.targetLng,
					life: 30,
					maxRadius: 20,
				});

				// Damage units in radius instead of instantly killing them
				const killRadiusSq = 0.5 * 0.5;
				const killRadius = Math.sqrt(killRadiusSq);
				for (let j = 0; j < runtime.units.length; j++) {
					const victim = runtime.units[j];
					if (!runtime.areSidesHostile(b.sideIndex, victim.sideIndex)) continue;
					const dSq =
						(victim.lat - b.targetLat) ** 2 + (victim.lng - b.targetLng) ** 2;
					if (dSq < killRadiusSq) {
						const dist = Math.sqrt(dSq);
						const falloff = 1 - dist / killRadius; // 1 at center, 0 at edge
						// Base missile damage scaled by distance; strong but non‑lethal except near center
						const baseDamage = runtime.CONFIG.COMBAT_DAMAGE * 4;
						const damage = baseDamage * Math.max(0.2, falloff); // ensure a minimum chunk
						recordDamage(victim, damage);
						// Do NOT splice here; units will be removed later when their health <= 0
					}
				}
				runtime.bombs.splice(i, 1);
			}
		}

		// AI Bomb Launching (Restored and buffed frequency)
		const simYear = runtime.gameTimeDate ? runtime.gameTimeDate.year : 2024;
		// Enforce 1942 technology gate for missiles/bombs
		const canFireMissiles = !runtime.gameTimeEnabled || simYear >= 1942;

		if (!runtime.bombsDisabled && canFireMissiles) {
			const activeSideList = runtime.sides
				.map((s, idx) => ({ s, idx }))
				.filter((x) => x.s.length > 0);

			if (activeSideList.length >= 2) {
				if (runtime.bases.length > 0 && Math.random() < 0.01) {
					const launcherEntry =
						activeSideList[Math.floor(Math.random() * activeSideList.length)];
					const launcherSideIdx = launcherEntry.idx;
					const enemyEntries = activeSideList.filter((x) =>
						runtime.areSidesHostile(launcherSideIdx, x.idx),
					);
					if (enemyEntries.length > 0) {
						const targetEntry =
							enemyEntries[Math.floor(Math.random() * enemyEntries.length)];
						const targetSideIdx = targetEntry.idx;
						const myBases = runtime.bases.filter(
							(b) => b.sideIndex === launcherSideIdx,
						);
						const enemyUnits = runtime._tickUnitsBySide[targetSideIdx] || [];
						if (myBases.length > 0 && enemyUnits.length > 0) {
							const launcher =
								myBases[Math.floor(Math.random() * myBases.length)];
							const target =
								enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
							runtime.launchBomb(
								launcher.lat,
								launcher.lng,
								target.lat,
								target.lng,
								launcherSideIdx,
							);
						}
					}
				}
			}
		}

		for (let i = runtime.explosions.length - 1; i >= 0; i--) {
			runtime.explosions[i].life--;
			if (runtime.explosions[i].life <= 0) runtime.explosions.splice(i, 1);
		}

		// Cache unit counts / soldier estimates once per tick instead of re-scanning
		// the full units[] array every visual frame in updateLoop().
		const numSides = runtime.sides.length;
		const unitCounts = new Array(numSides).fill(0);
		const soldierEsts = new Array(numSides).fill(0);
		for (let i = 0; i < runtime.units.length; i++) {
			const u = runtime.units[i];
			const si = u.sideIndex;
			if (si >= 0 && si < numSides) {
				unitCounts[si]++;
				soldierEsts[si] += runtime.getLiveFormationPersonnel(u);
			}
		}
		runtime._cachedSideUnitCounts = unitCounts;
		runtime._cachedSideSoldierEsts = soldierEsts;

		perf.post += clockNow() - _t4;
		const _tickMs = clockNow() - _t0;
		perf.tickTotal += _tickMs;
		if (_tickMs > perf.maxTick) perf.maxTick = _tickMs;
		runtime.recordPerfMeasure("Simulation Tick", _t0, _tickMs, {
			tick: perf.ticks,
			units: runtime.units.length,
		});

		// ── Per-tick perf history ring buffer ──
		if (!_perfEnabled) return false;
		const _tickEntry = {
			tick: perf.ticks,
			ms: _tickMs,
			units: runtime.units.length,
			cats: {},
			reassess: {},
			tactical: {},
			water: {},
		};
		for (const k of _perfKeys)
			_tickEntry.cats[k] = (perf[k] || 0) - _perfSnap[k];
		for (const k of [
			"proposalRuns",
			"proposalFailed",
			"reassess_noPlan",
			"reassess_interval",
			"reassess_forced",
			"reassess_territory",
			"reassess_posture",
			"reassess_ratio",
		])
			_tickEntry.reassess[k] = (perf[k] || 0) - (_perfSnap[k] || 0);
		for (const k of [
			"coastDeflectHalved",
			"knockbackBlocked",
			"waterPathPenalized",
			"coastStuckAbandoned",
		])
			_tickEntry.water[k] = (perf[k] || 0) - (_perfSnap[k] || 0);
		for (const k of [
			"tacticalFriendlyCandidatePairs",
			"tacticalEnemyCandidateVisits",
			"tacticalAcceptedPairs",
			"tacticalFriendlyPairs",
			"tacticalHostileCellVisits",
			"tacticalCacheHits",
			"tacticalCacheMisses",
			"tacticalGhostInvalidations",
			"tacticalFastLaneUnits",
		]) {
			_tickEntry.tactical[k] = (perf[k] || 0) - (_perfSnap[k] || 0);
		}
		_tickEntry.tactical.maxBucketOccupancy =
			perf.tacticalMaxBucketOccupancy || 0;
		_tickEntry.tactical.cellCount = perf.tacticalCellCount || 0;
		_tickEntry.tactical.insertedUnits = perf.tacticalInsertedUnits || 0;
		if (!perf._history) perf._history = [];
		perf._history.push(_tickEntry);
		if (perf._history.length > runtime.PERF_TICK_HISTORY_LIMIT) {
			perf._history.shift();
		}

		return false;
	}
	return { performSimulationTick };
}
