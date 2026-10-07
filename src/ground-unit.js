import { executeGroundTarget } from "./ground-movement.js";
import { getSimulationMetrics } from "./simulation-metrics.js";

// Defensive-line tuning: damage a line holder takes, the mountain share of that
// effect at full intensity, and movement speed while crossing a river.
const RIVER_LINE_DAMAGE_TAKEN = 0.6;
const MOUNTAIN_LINE_DEFENSE = 0.35;
const RIVER_CROSSING_SPEED = 0.6;
// Ticks (6 s at 1x) over which the capital-fall morale shock fades out.
const CAPITAL_SHOCK_TICKS = 360;

/** Supply decisions only distinguish 0, 1–2, 3–7, and at least 8 friendly cells. */
export function countNearbyFriendlySupplyCells(frame, gridIndex, sideIndex) {
	const { CONFIG, gridWidth, gridHeight, landMask, dominantSideMap } = frame;
	const radius = Math.round(0.8 / CONFIG.GRID_RES);
	const row = Math.floor(gridIndex / gridWidth);
	const col = gridIndex % gridWidth;
	let count = 0;
	for (let dr = -radius; dr <= radius; dr++) {
		const nr = row + dr;
		if (nr < 0 || nr >= gridHeight) continue;
		for (let dc = -radius; dc <= radius; dc++) {
			if (dr === 0 && dc === 0) continue;
			const nc = col + dc;
			if (nc < 0 || nc >= gridWidth) continue;
			const index = nr * gridWidth + nc;
			if (landMask[index] > 0 && dominantSideMap[index] === sideIndex) {
				if (++count === 8) return count;
			}
		}
	}
	return count;
}

// One formation uses a stable per-tick snapshot; no global getters in the unit loop.
export function updateGroundFormation(frame, i) {
	return createGroundFormationUpdater(frame)(i);
}

/** Unpacks the per-tick frame once and returns the per-formation update. */
export function createGroundFormationUpdater(frame) {
	const perf = getSimulationMetrics(frame);
	const {
		units,
		_detailedPerfEnabled,
		getLiveFormationStrength,
		numGroups,
		sideCentroids,
		sides,
		_countryById,
		aiCountryState,
		_metadataById,
		getEffectiveBuffState,
		countryCapitalLost,
		_capitalFallTick,
		_sideWarPhase,
		_unitGridIdx,
		countryToSideMap,
		landMask,
		mountainsEnabled,
		terrainMask,
		riverMask,
		getControlValue,
		isEnemyTerritory,
		simFrameCount,
		HASH_SIZE,
		getGridIndex,
		hostileUnitCountsBySide,
		worldControlMap,
		isMyTerritory,
		myInfluenceAt,
		areSidesHostile,
		getBorderDirection,
		_strategicTargetGeneration,
		simSpeed,
		STRATEGIC_COHORT_COUNT,
		_simTickCount,
		enemyCityCandidatesBySide,
		CITY_OBJECTIVE_REFRESH_INTERVAL,
		returnUnitPersonnelToReserve,
		CONFIG,
		countryStats,
		recordDamage,
		gridWidth,
		gridHeight,
		dominantSideMap,
		_unitLiveGeneration,
		stableUnitCohort,
		normalizeLongitudeDelta,
		warGraceEndTick,
		formationDamage,
		_cityIdxSetTick,
		_battleKey,
		_battleHash,
		activeBattles,
		unitHashBySide,
		isNeutralCountry,
		_neutralGarrisonPlan,
		_coastalDefensePlan,
		clearUnitStrategicTargets,
		_mopUpOwnedCellCache,
		selectNearestMopUpCell,
		CITY_WATER_CHECK_LIMIT,
		_warPlan,
		_navalPlan,
		_navalSupplyPlan,
		_overwhelmingForce,
		geoDistSq,
		_transportPlan,
		_frontlinePolys,
		isNeutral,
		sideVictoryRatios,
		deJureMap,
		_theaterCitiesBySovereign,
	} = frame;
	return function updateFormation(i) {
		const u = units[i];
		const _u1 = _detailedPerfEnabled ? performance.now() : 0; // per-unit sub-timer start

		// Scrub NaN units immediately to prevent rendering crashes
		if (Number.isNaN(u.lat) || Number.isNaN(u.lng)) {
			returnUnitPersonnelToReserve(u);
			units.splice(i, 1);
			return;
		}
		if (u.health <= 0 || getLiveFormationStrength(u) <= 0) {
			units.splice(i, 1);
			return;
		}

		u.dirLat = 0;
		u.dirLng = 0; // Reset movement indicators for the current tick

		// Handle deployment/mobilization phase
		if (u.deployTicks > 0) {
			u.deployTicks--;
			return; // Skip AI and movement while deploying
		}

		let sideIndex = u.sideIndex !== undefined ? u.sideIndex : 0;
		const gIdx = Math.floor(u.id * 1000) % numGroups;
		const centroids = sideCentroids[sideIndex];
		const groupCentroid = centroids ? centroids[gIdx] : null;

		// Ensure sideIndex is valid if sides were removed via capitulation
		if (sideIndex >= sides.length) sideIndex = sides.length - 1;
		if (sideIndex < 0) sideIndex = 0;

		// Sync index back to object for the renderer
		u.sideIndex = sideIndex;

		const sideList = sides[sideIndex];
		if (!sideList) return;

		const countryObj = _countryById.get(u.sovereignId);

		const aiProfile = aiCountryState.get(u.sovereignId) || {
			mode: "NORMAL",
			retreatTriggerMultiple: 8.0,
			frontlineBlend: 0.35,
			speedMult: 1.0,
			targetCityWeight: 0.0,
			forceDefensive: false,
			reserveShare: 0.02,
			peacePressure: 0.0,
		};
		const isDefensive = countryObj?.strategy === "DEFENSIVE";
		const effectiveDefensive = isDefensive || aiProfile.forceDefensive;
		const metaForBuff = _metadataById.get(u.sovereignId);
		const effectiveBuff = getEffectiveBuffState(countryObj, metaForBuff);

		let damageDealtMult = 1.0;
		let damageTakenMult = 1.0;
		let speedBuffMult = 1.0;

		// Victory Boost Logic: Momentum Phase
		if (u.victoryBoostTicks > 0) {
			u.victoryBoostTicks--;
			damageDealtMult *= 1.4; // Reduced damage boost for longer battles
			speedBuffMult *= 1.3; // Reduced speed boost for slower pushing
		}

		// Capital Loss Penalty (Nerfed to prevent instant collapse of smaller nations)
		if (countryCapitalLost.has(u.sovereignId)) {
			damageDealtMult *= 0.8; // 20% reduction (was 35%)
			damageTakenMult *= 1.15; // 15% more vulnerable (was 25%)
			speedBuffMult *= 0.9; // 10% slower (was 20%)
			// Morale shock: right after the capital falls, the defence buckles,
			// then recovers to the lasting penalty above.
			const shock =
				1 -
				(_simTickCount - (_capitalFallTick?.get(u.sovereignId) ?? -Infinity)) /
					CAPITAL_SHOCK_TICKS;
			if (shock > 0) {
				damageDealtMult *= 1 - 0.4 * shock;
				damageTakenMult *= 1 + 0.4 * shock;
				speedBuffMult *= 1 - 0.15 * shock;
			}
		}

		// Momentum cascade effects
		const warPhase = _sideWarPhase[u.sideIndex];
		if (warPhase === "COLLAPSING") {
			damageDealtMult *= 0.7;
		}

		const gridIdxNow = _unitGridIdx.get(u) ?? -1;
		const _uSideIdx = countryToSideMap.get(u.sovereignId);
		const isAtSea = gridIdxNow === -1 || landMask[gridIdxNow] === 0;
		const mountainIntensity =
			mountainsEnabled && gridIdxNow !== -1 ? terrainMask[gridIdxNow] : 0;
		const isMountain = mountainIntensity > 0;
		const currentControl = getControlValue(u.lat, u.lng);

		// Cache terrain and sea states for the renderer
		u.isAtSea = isAtSea;
		u.mountainIntensity = mountainIntensity;

		if (countryObj) {
			if (effectiveBuff === "buff") {
				damageDealtMult = 2.5;
				damageTakenMult = 0.6;
				speedBuffMult = 1.3;
			} else if (effectiveBuff === "super") {
				damageDealtMult = 10.0;
				damageTakenMult = 0.2;
				speedBuffMult = 1.8;
			} else if (effectiveBuff === "godly") {
				damageDealtMult = 40.0;
				damageTakenMult = 0.015;
				speedBuffMult = 2.2;
			} else if (effectiveBuff === "weakened") {
				damageDealtMult = 0.7;
				damageTakenMult = 1.4;
				speedBuffMult = 0.7; // slightly slower when weakened
			} else if (effectiveBuff === "crippled") {
				damageDealtMult = 0.4;
				damageTakenMult = 2.5;
				speedBuffMult = 0.7;
			}

			// Continuous attack/defense modifiers from sliders (-90% .. +90%)
			const atkPct =
				typeof countryObj.attackBuffPercent === "number"
					? countryObj.attackBuffPercent
					: 0;
			const defPct =
				typeof countryObj.defenseBuffPercent === "number"
					? countryObj.defenseBuffPercent
					: 0;
			const atkFactor = 1 + atkPct / 100;
			const defFactor = 1 + defPct / 100;
			if (atkFactor > 0) damageDealtMult *= atkFactor;
			// positive defPct reduces damageTaken (tougher), negative increases (softer)
			if (defFactor > 0.01) damageTakenMult *= 1 / defFactor;
		}

		// Terrain Modifiers: Mountains reduce speed and lethality based on intensity (size/scale)
		if (isMountain) {
			// Intensity 1.0 = full penalty, Intensity 0.1 = minimal penalty
			speedBuffMult *= 1.0 - 0.65 * mountainIntensity;
			damageDealtMult *= 1.0 - 0.4 * mountainIntensity;
			damageTakenMult *= 1.0 - 0.4 * mountainIntensity;
		}

		// Alpenjägers: small, quiet buffs with emphasis on mountain warfare
		if (u.isAlpenjager) {
			if (isMountain) {
				speedBuffMult *= CONFIG.ALPEN_MTN_SPEED_MULT;
			}
			damageDealtMult *= CONFIG.ALPEN_COMBAT_MULT;
			damageTakenMult *= 1.0 / CONFIG.ALPEN_COMBAT_MULT;
		}

		// Exile Disbandment: If a navy is at sea and its nation has lost all land, it slowly disbands
		if (isAtSea && countryObj) {
			const stats = countryStats.get(u.sovereignId);
			if (stats && stats.controlled === 0) {
				if (Math.random() < 0.02) {
					returnUnitPersonnelToReserve(u);
					units.splice(i, 1);
					return;
				}
			}
			// Non-transport units at sea take attrition until they reach land
			if (!u.isTransport) {
				recordDamage(u, CONFIG.ATTRITION_DAMAGE * 3.0);
			}
		}

		// --- ENCIRCLEMENT DETECTION ---
		let encirclementFactor = 0;
		const isMega = effectiveBuff === "super";
		const isSuper = effectiveBuff === "buff";

		if (!isAtSea && !isMega && !isSuper && gridIdxNow !== -1) {
			const eR = CONFIG.ENCIRCLEMENT_RADIUS;
			const eRCells = Math.round(eR / CONFIG.GRID_RES);
			const gw = gridWidth;
			const row = Math.floor(gridIdxNow / gw);
			const col = gridIdxNow % gw;
			const offsets = [
				[0, eRCells],
				[0, -eRCells],
				[eRCells, 0],
				[-eRCells, 0],
				[Math.round(eRCells * 0.7), Math.round(eRCells * 0.7)],
				[-Math.round(eRCells * 0.7), -Math.round(eRCells * 0.7)],
				[Math.round(eRCells * 0.7), -Math.round(eRCells * 0.7)],
				[-Math.round(eRCells * 0.7), Math.round(eRCells * 0.7)],
			];
			let enemyCount = 0;
			for (let oi = 0; oi < offsets.length; oi++) {
				const [dc, dr] = offsets[oi];
				const nr = row + dr;
				const nc = col + dc;
				if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gw) continue;
				const sIdx = nr * gw + nc;
				if (landMask[sIdx] > 0 && isEnemyTerritory(sIdx, u.sideIndex))
					enemyCount++;
			}
			encirclementFactor = enemyCount / offsets.length;
		}
		const isEncircled = encirclementFactor > 0.875;

		// Track encirclement duration for escalating pressure
		if (isEncircled) {
			u.encircledTicks = (u.encircledTicks || 0) + 1;
		} else {
			u.encircledTicks = 0;
		}

		if (isEncircled && !isMega && !isSuper) {
			// Escalating penalty: longer encirclement = worse combat effectiveness
			const encircleDuration =
				u.encircledTicks > 180 ? 0.15 : u.encircledTicks > 60 ? 0.2 : 0.25;
			damageDealtMult *= encircleDuration;
			damageTakenMult *= 4.0;
		}

		// Attrition logic: logistics strain increases the further you push into large nations
		const inEnemyTerritory =
			!isAtSea && isEnemyTerritory(gridIdxNow, u.sideIndex);

		// Defensive lines: holding a river bank or mountain range on friendly ground
		// blunts incoming damage, and crossing a river into enemy land is slow.
		let lineDefense = 1;
		if (!isAtSea) {
			const onRiverLine = riverMask?.[gridIdxNow] === 1;
			if (!inEnemyTerritory) {
				if (onRiverLine) lineDefense = RIVER_LINE_DAMAGE_TAKEN;
				if (isMountain)
					lineDefense = Math.min(
						lineDefense,
						1 - MOUNTAIN_LINE_DEFENSE * mountainIntensity,
					);
			} else if (onRiverLine) speedBuffMult *= RIVER_CROSSING_SPEED;
		}
		u.lineDefense = lineDefense;

		// Attrition is disabled during Victory Boost (momentum) to prevent breakthroughs from stalling instantly
		if (
			(inEnemyTerritory || isEncircled) &&
			!isMega &&
			!isSuper &&
			(u.victoryBoostTicks <= 0 || isEncircled)
		) {
			// Logistics Strain: Attrition scales with the target's total land area
			let targetLandSize = 0;
			const enemySideIndices = sides
				.map((_, idx) => idx)
				.filter((idx) => areSidesHostile(sideIndex, idx));
			enemySideIndices.forEach((idx) => {
				sides[idx].forEach((enemy) => {
					const s = countryStats.get(enemy.id);
					if (s) targetLandSize += s.controlled;
				});
			});

			const logisticsPenalty = Math.max(
				1,
				Math.log10(targetLandSize / 500 + 1),
			);
			// War Fatigue: Attrition damage scales with war duration, wearing out enemies over time
			const warFatigueFactor = 1.0 + simFrameCount / 8000;
			let dmg =
				CONFIG.ATTRITION_DAMAGE *
				(1 + Math.abs(currentControl) * 3) *
				logisticsPenalty *
				warFatigueFactor;

			if (isEncircled) {
				// Escalating attrition: longer encirclement = faster death
				const encircleTickScale =
					u.encircledTicks > 360
						? 4.0
						: u.encircledTicks > 180
							? 2.5
							: u.encircledTicks > 60
								? 1.5
								: 1.0;
				dmg *= CONFIG.ENCIRCLEMENT_DAMAGE_MULT * encircleTickScale;
			}
			// SUPPLY CUT-OFF: units deep in enemy territory with no friendly tiles nearby
			// take extreme damage — they're completely isolated from logistics.
			if (inEnemyTerritory && !isEncircled && !isAtSea) {
				const friendlyTilesNearby = countNearbyFriendlySupplyCells(
					frame,
					gridIdxNow,
					u.sideIndex,
				);
				// No friendly tiles within ~0.8° → total supply collapse
				if (friendlyTilesNearby === 0) {
					u._supplyCollapsedTick = _simTickCount;
					dmg += 2.5; // massive cut-off damage: ~25× base attrition
				} else if (friendlyTilesNearby < 3) {
					u._supplyCollapsedTick = Number.NEGATIVE_INFINITY;
					dmg += 0.8; // severely isolated
				} else if (friendlyTilesNearby < 8) {
					u._supplyCollapsedTick = Number.NEGATIVE_INFINITY;
					dmg += 0.3; // partially cut off
				} else {
					u._supplyCollapsedTick = Number.NEGATIVE_INFINITY;
				}
			}
			recordDamage(u, dmg * damageTakenMult);

			// Instant death triggers full remaining health as casualties
		}

		// --- EXPEDITIONARY SUPPORT SYSTEM ---
		const role = countryObj?.role || "OFFENSE";
		const alliesMetadata = sideList.filter((c) => c.id !== u.sovereignId);
		const offensiveAllies = alliesMetadata.filter((c) => c.role === "OFFENSE");

		if (role === "SUPPORT") {
			if (offensiveAllies.length > 0) {
				if (
					!u.beneficiaryId ||
					u.beneficiaryId === u.sovereignId ||
					!offensiveAllies.some((a) => a.id === u.beneficiaryId)
				) {
					u.beneficiaryId =
						offensiveAllies[
							Math.floor(Math.random() * offensiveAllies.length)
						].id;
				}
			} else if (alliesMetadata.length > 0) {
				if (!u.beneficiaryId || u.beneficiaryId === u.sovereignId) {
					u.beneficiaryId =
						alliesMetadata[
							Math.floor(Math.random() * alliesMetadata.length)
						].id;
				}
			} else {
				u.beneficiaryId = u.sovereignId;
			}
		} else {
			// Offensive units: Drastically reduced chance to randomly wander off to support allies (like Britain to Canada)
			// unless their sovereign land is almost entirely occupied.
			const myStats = countryStats.get(u.sovereignId);
			const myInitial = countryObj?.initialCells || 1;
			const beingOverrun = myStats
				? myStats.controlled < myInitial * 0.3
				: false;

			// Significantly reduced probability to wander to an ally's territory (0.02% per frame)
			if (
				!beingOverrun &&
				Math.random() < 0.0002 &&
				alliesMetadata.length > 0
			) {
				u.beneficiaryId =
					alliesMetadata[Math.floor(Math.random() * alliesMetadata.length)].id;
			} else if (Math.random() < 0.12 || !u.beneficiaryId) {
				// High chance to reset to sovereign target to ensure focus on the main theater
				u.beneficiaryId = u.sovereignId;
			}
		}

		// ── unitLoop sub-timer checkpoint: end setupTerrain, start unitSpatialHash ──
		const _u2 = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) perf.unitSetupTerrain += _u2 - _u1;

		// Tactical Awareness: Identify enemies and local balance of power using O(1) Spatial Hash
		let target = null;
		let minDist = Infinity;
		let retreatVector = null;

		const tacticalRadiusSq = 0.6 * 0.6;

		let localEnemyCount = 0;
		const localAllyCount = u._tickLocalAllyCount || 1;
		let enemyCentroidLat = 0;
		let enemyCentroidLng = 0;

		// Skip full spatial-hash scan for units that have been idle for a while,
		// but maintain a wider 5×5 sweep so nearby enemies are never invisible.
		const idleTicks = simFrameCount - (u.lastCombatTick || 0);
		const isTacticallyIdle =
			idleTicks > 60 &&
			idleTicks < 600 && // force re-scan after 600 idle frames to break perpetual idle loop
			u.mopUpTargetId === 0;

		const hasOperationalAssignment = !!(u._armyOrder || u._taskForceUid);
		const operationalFastLane = !!(
			hasOperationalAssignment &&
			(u._armyOrder?.target || u._taskForceOrder?.target) &&
			!u._tickHasNearbyHostile &&
			!isAtSea
		);
		if (operationalFastLane) {
			target = u._armyOrder?.target || u._taskForceOrder.target;
			perf.tacticalFastLaneUnits++;
		}

		const kx = Math.floor((u.lng + 180) / HASH_SIZE);
		const ky = Math.floor((u.lat + 90) / HASH_SIZE);
		const maxKx = Math.ceil(360 / HASH_SIZE);

		// War-plan movement variables — declared here so both scan paths can use them
		let planSpeedMult = 1.0;
		let planDirLat = 0,
			planDirLng = 0,
			isPlanUnit = false;

		// Active units search adjacent 3×3 hash cells; idle units widen to 5×5
		const fullScan = !isTacticallyIdle;

		{
			// ═══ Phase 1: side-separated spatial hash scan ═══
			if (!perf._sideHashLogged) {
				perf._sideHashLogged = true;
				console.info(
					"%c⚡ Phase 1 active: side-separated spatial hash scan",
					"color:#0f0;font-size:14px",
				);
			}

			// ── Phase 3: stale-target skip ──
			let didStaleSkip = operationalFastLane;
			if (
				u._cachedTarget &&
				(u._cachedTarget._liveGeneration !== _unitLiveGeneration ||
					u._cachedTarget.health <= 0)
			) {
				if (u._cachedTarget._liveGeneration !== _unitLiveGeneration) {
					perf.tacticalGhostInvalidations++;
				}
				u._cachedTarget = null;
				u._cachedLocalEnemyCount = 0;
			}
			if (
				!operationalFastLane &&
				CONFIG.ENABLE_STALE_TARGET_SKIP &&
				u._cachedTarget &&
				u._cachedTarget.health > 0 &&
				areSidesHostile(sideIndex, u._cachedTarget.sideIndex)
			) {
				const movedCell = u._cachedScanKx !== kx || u._cachedScanKy !== ky;
				const staleScanInterval =
					simSpeed >= 3
						? CONFIG.STALE_TARGET_SCAN_INTERVAL_FAST
						: CONFIG.STALE_TARGET_SCAN_INTERVAL;
				const staleMaxDistSq =
					simSpeed >= 3
						? CONFIG.STALE_TARGET_MAX_CACHE_DIST_SQ_FAST
						: CONFIG.STALE_TARGET_MAX_CACHE_DIST_SQ;
				const refreshDue =
					_simTickCount - (u._lastFullScanTick ?? -staleScanInterval) >=
						staleScanInterval &&
					stableUnitCohort(u, staleScanInterval) ===
						_simTickCount % staleScanInterval;
				if (!movedCell && !refreshDue) {
					const cached = u._cachedTarget;
					const deLng = normalizeLongitudeDelta(cached.lng - u.lng);
					const cdSq = (u.lat - cached.lat) ** 2 + deLng ** 2;
					if (cdSq <= staleMaxDistSq) {
						target = cached;
						localEnemyCount = Math.max(1, u._cachedLocalEnemyCount || 0);
						enemyCentroidLat =
							u._cachedEnemyCentroidLat || cached.lat * localEnemyCount;
						enemyCentroidLng =
							u._cachedEnemyCentroidLng || cached.lng * localEnemyCount;
						didStaleSkip = true;
						perf.tacticalCacheHits++;
						// Proximity damage vs cached target (same logic as full scan)
						if (cdSq < 0.09) {
							const inWarGrace = simFrameCount < warGraceEndTick;
							if (!inWarGrace) {
								const eIdx = _unitGridIdx.get(cached) ?? -1;
								const eAtSea = eIdx === -1 || landMask[eIdx] === 0;
								let proximityDamage =
									CONFIG.COMBAT_DAMAGE *
									0.45 *
									damageDealtMult *
									(1.0 - Math.sqrt(cdSq) / 0.3);
								if (isAtSea && eAtSea) proximityDamage *= 2.2;
								if (cached.isTransport && !u.isTransport)
									proximityDamage *= 1.05;
								if (u.isTransport && !cached.isTransport) {
									recordDamage(
										u,
										proximityDamage * 1.05 * damageTakenMult,
										cached,
									);
									proximityDamage *= 0.85;
								}
								recordDamage(
									cached,
									formationDamage(proximityDamage, u, cached, {
										mountain: isMountain || cached.mountainIntensity > 0,
										urban:
											_cityIdxSetTick.has(gridIdxNow) ||
											_cityIdxSetTick.has(eIdx),
									}),
									u,
								);
								recordDamage(
									u,
									formationDamage(
										proximityDamage * 0.8 * damageTakenMult,
										cached,
										u,
										{
											mountain: isMountain || cached.mountainIntensity > 0,
											urban:
												_cityIdxSetTick.has(gridIdxNow) ||
												_cityIdxSetTick.has(eIdx),
										},
									),
									cached,
								);
								u.lastCombatTick = simFrameCount;
								cached.lastCombatTick = simFrameCount;
								if (cached.health <= 0) u.victoryBoostTicks = 240;
								const battleLat = (u.lat + cached.lat) / 2;
								const battleLng = (u.lng + cached.lng) / 2;
								const bKey = _battleKey(battleLat, battleLng);
								let existing = null;
								for (let bk = -1; bk <= 1 && !existing; bk++) {
									for (let bl = -1; bl <= 1 && !existing; bl++) {
										const nk = bKey + bk * 10000 + bl;
										const b = _battleHash.get(nk);
										if (b && (u.lat - b.lat) ** 2 + (u.lng - b.lng) ** 2 < 0.16)
											existing = b;
									}
								}
								if (existing) {
									existing.participants++;
									existing.lat =
										(existing.lat * (existing.participants - 1) + battleLat) /
										existing.participants;
									existing.lng =
										(existing.lng * (existing.participants - 1) + battleLng) /
										existing.participants;
									const newKey = _battleKey(existing.lat, existing.lng);
									if (newKey !== bKey) _battleHash.set(newKey, existing);
								} else {
									const battle = {
										lat: battleLat,
										lng: battleLng,
										participants: 2,
									};
									activeBattles.push(battle);
									_battleHash.set(bKey, battle);
								}
							}
						}
					}
				}
			}
			if (
				!operationalFastLane &&
				CONFIG.ENABLE_STALE_TARGET_SKIP &&
				!didStaleSkip
			) {
				perf.tacticalCacheMisses++;
			}

			// ── Enemy pass: iterate each enemy side's hash cells ──
			if (!didStaleSkip) {
				for (let ei = 0; ei < sides.length; ei++) {
					if (!areSidesHostile(sideIndex, ei)) continue;
					const eHash = unitHashBySide[ei];
					for (let dy = -2; dy <= 2; dy++) {
						for (let dx = -2; dx <= 2; dx++) {
							if (fullScan && (dx < -1 || dx > 1 || dy < -1 || dy > 1))
								continue;
							let cx = kx + dx;
							const cy = ky + dy;
							if (cx < 0) cx += maxKx;
							else if (cx >= maxKx) cx -= maxKx;
							const arr = eHash.get(cx * 100 + cy);
							if (!arr) continue;
							for (let j = 0; j < arr.length; j++) {
								const e = arr[j];
								perf.tacticalEnemyCandidateVisits++;
								const deLng = normalizeLongitudeDelta(e.lng - u.lng);
								const dSq = (u.lat - e.lat) ** 2 + deLng ** 2;
								// (enemy — no isEnemy check; bucket is enemy-only)
								const eIdx = _unitGridIdx.get(e) ?? -1;
								const eAtSea = e._isAtSea;
								if (effectiveDefensive && !isAtSea) {
									const isEnemyInMyMandatedLand =
										eIdx !== -1 && worldControlMap[eIdx] === u.sovereignId;
									if (!isEnemyInMyMandatedLand && dSq > 0.25) continue;
								}
								const distMult = eAtSea && !isAtSea ? 50.0 : 1.0;
								const noisyDSq = dSq * distMult;
								const healthModifier =
									Math.max(0, 1.0 - (e.health || 100) / 100) * 0.02;
								let targetScore = noisyDSq - healthModifier;
								let eBuff = "none";
								// Only do expensive _countryById lookup for viable candidates
								if (targetScore < minDist) {
									const eCountry = _countryById.get(e.sovereignId);
									eBuff = eCountry?.buffState || "none";
									const superPenalty =
										!isMega &&
										!isSuper &&
										(eBuff === "super" || eBuff === "godly")
											? 5.0
											: 0;
									targetScore += superPenalty;
								}
								if (targetScore < minDist) {
									// Water-path + neutral-path check: penalize enemies unreachable by friendly land
									if (!isAtSea && !eAtSea && dSq > 4.0) {
										const lineLen = Math.sqrt(dSq);
										const steps = Math.min(12, Math.ceil(lineLen / 0.4));
										let waterSamples = 0;
										let neutralSamples = 0;
										for (let s = 1; s < steps; s++) {
											const t = s / steps;
											const wIdx = getGridIndex(
												u.lat + (e.lat - u.lat) * t,
												u.lng + deLng * t,
											);
											if (wIdx !== -1 && landMask[wIdx] === 0) waterSamples++;
											if (wIdx !== -1 && isNeutralCountry(wIdx))
												neutralSamples++;
										}
										if (waterSamples > steps * 0.3) {
											targetScore += 10000;
											perf.waterPathPenalized =
												(perf.waterPathPenalized || 0) + 1;
										}
										if (neutralSamples > steps * 0.3) {
											targetScore += 10000;
										}
									}
									if (targetScore < minDist) {
										minDist = targetScore;
										target = e;
									}
								}
								if (dSq < tacticalRadiusSq) {
									let eWeight = Math.max(0, getLiveFormationStrength(e));
									if (eAtSea) eWeight *= isAtSea ? 0.6 : 0.2;
									if (eBuff === "super") eWeight *= 200;
									else if (eBuff === "buff") eWeight *= 50;
									localEnemyCount += eWeight;
									enemyCentroidLat += e.lat * eWeight;
									enemyCentroidLng += e.lng * eWeight;
									if (dSq < 0.09) {
										const inWarGrace = simFrameCount < warGraceEndTick;
										if (inWarGrace) continue;
										let proximityDamage =
											CONFIG.COMBAT_DAMAGE *
											0.45 *
											damageDealtMult *
											(1.0 - Math.sqrt(dSq) / 0.3);
										if (isAtSea && eAtSea) proximityDamage *= 2.2;
										if (e.isTransport && !u.isTransport)
											proximityDamage *= 1.05;
										if (u.isTransport && !e.isTransport) {
											recordDamage(
												u,
												proximityDamage * 1.05 * damageTakenMult,
												e,
											);
											proximityDamage *= 0.85;
										}
										recordDamage(
											e,
											formationDamage(proximityDamage, u, e, {
												mountain: isMountain || e.mountainIntensity > 0,
												urban:
													_cityIdxSetTick.has(gridIdxNow) ||
													_cityIdxSetTick.has(_unitGridIdx.get(e) ?? -1),
											}),
											u,
										);
										recordDamage(
											u,
											formationDamage(
												proximityDamage * 0.8 * damageTakenMult,
												e,
												u,
												{
													mountain: isMountain || e.mountainIntensity > 0,
													urban:
														_cityIdxSetTick.has(gridIdxNow) ||
														_cityIdxSetTick.has(_unitGridIdx.get(e) ?? -1),
												},
											),
											e,
										);
										u.lastCombatTick = simFrameCount;
										e.lastCombatTick = simFrameCount;
										if (e.health <= 0) u.victoryBoostTicks = 240;
										const battleLat = (u.lat + e.lat) / 2;
										const battleLng = (u.lng + e.lng) / 2;
										const bKey = _battleKey(battleLat, battleLng);
										let existing = null;
										for (let bk = -1; bk <= 1 && !existing; bk++) {
											for (let bl = -1; bl <= 1 && !existing; bl++) {
												const nk = bKey + bk * 10000 + bl;
												const b = _battleHash.get(nk);
												if (
													b &&
													(u.lat - b.lat) ** 2 + (u.lng - b.lng) ** 2 < 0.16
												)
													existing = b;
											}
										}
										if (existing) {
											existing.participants++;
											existing.lat =
												(existing.lat * (existing.participants - 1) +
													battleLat) /
												existing.participants;
											existing.lng =
												(existing.lng * (existing.participants - 1) +
													battleLng) /
												existing.participants;
											const newKey = _battleKey(existing.lat, existing.lng);
											if (newKey !== bKey) _battleHash.set(newKey, existing);
										} else {
											const battle = {
												lat: battleLat,
												lng: battleLng,
												participants: 2,
											};
											activeBattles.push(battle);
											_battleHash.set(bKey, battle);
										}
									}
								}
							}
						}
					}
				}
				// ── Phase 3: update stale-target cache after full scan ──
				if (CONFIG.ENABLE_STALE_TARGET_SKIP) {
					u._cachedTarget = target?.health !== undefined ? target : null;
					u._cachedScanKx = kx;
					u._cachedScanKy = ky;
					u._cachedLocalEnemyCount = localEnemyCount;
					u._cachedEnemyCentroidLat = enemyCentroidLat;
					u._cachedEnemyCentroidLng = enemyCentroidLng;
					u._lastFullScanTick = _simTickCount;
				}
			}
			// ── End stale-skip guard ──

			const _tEnemyDone = _detailedPerfEnabled ? performance.now() : 0;
			if (_detailedPerfEnabled) {
				perf.unitEnemyScan = (perf.unitEnemyScan || 0) + _tEnemyDone - _u2;
			}

			// ── Garrison (moved out of neighbor loop — runs once per unit) ──
			if (
				!hasOperationalAssignment &&
				!u.navalAssigned &&
				!u.supplyAssigned &&
				!u.coastalAssigned
			) {
				let bestGP = null;
				let bestGPDist = Infinity;
				for (let gsi = _uSideIdx * 10; gsi < _uSideIdx * 10 + 10; gsi++) {
					const gp = _neutralGarrisonPlan[gsi];
					if (!gp || gp.type !== "NEUTRAL_GARRISON") continue;
					if ((gp.activeUnitCount || 0) >= (gp.maxAssignedUnits || 0)) continue;
					if (!gp.borderPolyline || gp.borderPolyline.length === 0) continue;
					const dLat = gp.target.lat - u.lat;
					const dLng = normalizeLongitudeDelta(gp.target.lng - u.lng);
					const gdSq = dLat * dLat + dLng * dLng;
					if (gdSq < 256.0 && gdSq < bestGPDist) {
						bestGPDist = gdSq;
						bestGP = gp;
					}
				}
				if (u.garrisonAssigned) {
					let foundGP = false;
					for (let gsi = _uSideIdx * 10; gsi < _uSideIdx * 10 + 10; gsi++) {
						const gp = _neutralGarrisonPlan[gsi];
						if (
							!gp ||
							gp.type !== "NEUTRAL_GARRISON" ||
							!gp.borderPolyline ||
							gp.borderPolyline.length === 0
						)
							continue;
						const dLat = gp.target.lat - u.lat;
						const dLng = normalizeLongitudeDelta(gp.target.lng - u.lng);
						if (dLat * dLat + dLng * dLng < 256.0) {
							foundGP = true;
							isPlanUnit = true;
							gp.activeUnitCount = (gp.activeUnitCount || 0) + 1;
							const slot =
								gp.borderPolyline[
									Math.floor(Math.abs(u.id * 777) % gp.borderPolyline.length)
								];
							const sLat = slot.lat - u.lat;
							const sLng = normalizeLongitudeDelta(slot.lng - u.lng);
							const sDist = Math.sqrt(sLat * sLat + sLng * sLng);
							if (sDist > 0.01) {
								planDirLat = sLat / sDist;
								planDirLng = sLng / sDist;
							}
							planSpeedMult = 0.5;
							frame.moveDirLat = 0;
							frame.moveDirLng = 0;
							break;
						}
					}
					if (!foundGP) {
						u.garrisonAssigned = false;
					}
				} else if (bestGP) {
					u.garrisonAssigned = true;
				}
			}

			// ── Coastal defense (moved out of neighbor loop — runs once per unit) ──
			if (!hasOperationalAssignment && !u.navalAssigned && !u.supplyAssigned) {
				let bestCDPlan = null;
				let bestCDSlot = -1;
				let bestCDDist = Infinity;
				for (let csi = _uSideIdx * 10; csi < _uSideIdx * 10 + 10; csi++) {
					const cp = _coastalDefensePlan[csi];
					if (!cp || cp.type !== "COASTAL_DEFENSE") continue;
					if ((cp.activeUnitCount || 0) >= (cp.maxAssignedUnits || 0)) continue;
					if (!cp.target) continue;
					const dLat = cp.target.lat - u.lat;
					const dLng = normalizeLongitudeDelta(cp.target.lng - u.lng);
					const cdSq = dLat * dLat + dLng * dLng;
					if (cdSq < 64.0 && cdSq < bestCDDist) {
						bestCDDist = cdSq;
						bestCDPlan = cp;
						bestCDSlot = csi;
					}
				}
				if (u.coastalAssigned) {
					let foundCD = false;
					for (let csi = _uSideIdx * 10; csi < _uSideIdx * 10 + 10; csi++) {
						const cp = _coastalDefensePlan[csi];
						if (
							!cp ||
							cp.type !== "COASTAL_DEFENSE" ||
							!cp.zonePolyline ||
							cp.zonePolyline.length === 0
						)
							continue;
						const sdLat = cp.target.lat - u.lat;
						const sdLng = normalizeLongitudeDelta(cp.target.lng - u.lng);
						if (sdLat * sdLat + sdLng * sdLng < 64.0) {
							foundCD = true;
							isPlanUnit = true;
							cp.activeUnitCount = (cp.activeUnitCount || 0) + 1;
							const threatActive =
								cp.threatContact &&
								simFrameCount - (cp.threatenedTick || 0) < 900;
							if (threatActive) {
								const tLat = cp.threatContact.lat - u.lat;
								const tLng = normalizeLongitudeDelta(
									cp.threatContact.lng - u.lng,
								);
								const tDist = Math.sqrt(tLat * tLat + tLng * tLng);
								if (tDist > 0.01) {
									planDirLat = tLat / tDist;
									planDirLng = tLng / tDist;
								}
								planSpeedMult = 1.5;
							} else {
								const slot =
									cp.zonePolyline[
										Math.floor(Math.abs(u.id * 777) % cp.zonePolyline.length)
									];
								const sLat = slot.lat - u.lat;
								const sLng = normalizeLongitudeDelta(slot.lng - u.lng);
								const sDist = Math.sqrt(sLat * sLat + sLng * sLng);
								if (sDist > 0.01) {
									planDirLat = sLat / sDist;
									planDirLng = sLng / sDist;
								}
								planSpeedMult = 0.5;
							}
							frame.moveDirLat = 0;
							frame.moveDirLng = 0;
							break;
						}
					}
					if (!foundCD) {
						u.coastalAssigned = false;
					}
				} else if (bestCDPlan) {
					u.coastalAssigned = true;
					_coastalDefensePlan[bestCDSlot]._slotIdx = bestCDSlot;
				}
			}

			const _tGarrisonCoastal = _detailedPerfEnabled ? performance.now() : 0;
			if (_detailedPerfEnabled) {
				perf.unitGarrisonCoastal =
					(perf.unitGarrisonCoastal || 0) + _tGarrisonCoastal - _tEnemyDone;
			}

			// precomputed once above instead of rescanning 9–25 coarse buckets per unit.
		}

		u.lastAllyCount = localAllyCount;

		// ── unitLoop sub-timer checkpoint: end unitSpatialHash, start retreatMopUp ──
		const _u3 = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) {
			perf.unitScanPhase = (perf.unitScanPhase || 0) + _u3 - _u2;
		}

		// Retreat logic: If enemy force is > 5x ally force (increased threshold to prevent premature dodging)
		if (
			localEnemyCount > localAllyCount * aiProfile.retreatTriggerMultiple &&
			localEnemyCount >= 5
		) {
			const avgLat = enemyCentroidLat / localEnemyCount;
			const avgLng = enemyCentroidLng / localEnemyCount;
			const dirLat = u.lat - avgLat;
			const dirLng = u.lng - avgLng;
			const mag = Math.sqrt(dirLat * dirLat + dirLng * dirLng);
			if (mag > 0) {
				retreatVector = { lat: dirLat / mag, lng: dirLng / mag };
			}
		}

		const _u3a = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) perf.unitRetreatDecision += _u3a - _u3;

		const totalEnemiesCount = hostileUnitCountsBySide[sideIndex] || 0;

		const pocketContained =
			localEnemyCount > 0 && localAllyCount > localEnemyCount * 3;

		// Global Target Fallback (if no enemies were found in the local 6-degree spatial hash but enemies exist somewhere)
		// Add scatter to avoid blob: ±1° random offset
		if (!operationalFastLane && !target && totalEnemiesCount > 0) {
			let bestCentroidDist = Infinity;
			sideCentroids.forEach((centroids, idx) => {
				const isEnemySide = areSidesHostile(sideIndex, idx);
				if (isEnemySide && centroids) {
					centroids.forEach((c) => {
						if (!c) return;
						const dcLng = normalizeLongitudeDelta(c.lng - u.lng);
						const dSq = (u.lat - c.lat) ** 2 + dcLng ** 2;
						if (dSq < bestCentroidDist) {
							bestCentroidDist = dSq;
							// Add scatter to avoid blob: ±1° random offset
							const scatterLat = (Math.random() - 0.5) * 2;
							const scatterLng = (Math.random() - 0.5) * 2;
							target = {
								lat: c.lat + scatterLat,
								lng: c.lng + scatterLng,
							};
						}
					});
				}
			});
		}

		const _u3b = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) perf.unitGlobalFallback += _u3b - _u3a;

		// Unified behavior: Units hunt enemies when nearby, but switch to focused territory capture (mop-up)
		// when there are literally zero enemy units remaining.
		const shouldMopUp = totalEnemiesCount === 0;
		if (shouldMopUp && !u._mopUpModeActive) {
			u._mopUpModeActive = true;
			u._cityObjective = null;
			u._cityObjectiveTick = -999;
			u._assignedPlanSignature = null;
			u._transportPlanSignature = null;
			u._planWaypointSignature = null;
			u._planWaypointIndex = 0;
			u.navalAssigned = false;
			u.supplyAssigned = false;
			u.coastalAssigned = false;
			u.isTransport = false;
			u.frontSlot = null;
		} else if (!shouldMopUp && u._mopUpModeActive) {
			u._mopUpModeActive = false;
			u.mopUpTarget = null;
			u.mopUpTargetId = 0;
			u.lastMopUpId = null;
			u.targetSearchCooldown = 0;
		}

		// Target Caching: Only re-search for mop-up targets every few ticks to save CPU
		if (u.targetSearchCooldown > 0) {
			u.targetSearchCooldown--;
		}

		// Frontline Pressure: If unit is too close to a moving/losing border, push it back
		const borderBuffer = -0.05; // Tightened buffer to prevent endless retreating / stuttering
		const currentIdx = gridIdxNow;

		// Tactical Control: If we significantly occupy the land, it's not "enemy land" for movement purposes
		// Broadened "friendly" land check to make units wait further back from the actual border
		const isEffectivelyMyLand =
			isMyTerritory(gridIdxNow, u.sideIndex) &&
			myInfluenceAt(gridIdxNow, u.sideIndex) > 0.35;

		// Mega and Super units are immune to the automatic pushback; they ARE the pushback.
		// BUG FIX: Units were being "pushed back" and taking skirmish damage even when attacking into enemy land.
		// Pushback now only triggers if the unit is on friendly/sovereign territory that is being overrun by enemies.
		const ownerIdAtUnit = currentIdx !== -1 ? worldControlMap[currentIdx] : 0;
		const ownerSideIdx = countryToSideMap.get(ownerIdAtUnit);
		const onFriendlySovereignLand =
			ownerSideIdx !== undefined && ownerSideIdx === sideIndex;

		const isTooNearBorder =
			!isAtSea &&
			!isMega &&
			!isSuper &&
			onFriendlySovereignLand &&
			currentIdx !== -1 &&
			landMask[currentIdx] === 2 &&
			myInfluenceAt(currentIdx, u.sideIndex) < borderBuffer &&
			localEnemyCount > 0;

		// Direction toward nearby frontline (used to pull units to the border instead of roaming)
		const borderDir = getBorderDirection(u);

		if (isTooNearBorder && !isAtSea) {
			// Frontline Skirmish Damage: only when losing control badly (< -0.3)
			if (currentControl < -0.3) {
				const skirmishDamage =
					CONFIG.COMBAT_DAMAGE * 0.15 * (1.0 + Math.abs(currentControl) * 2);
				recordDamage(u, skirmishDamage * damageTakenMult);
			}

			// Find direction of safety (deeper into friendly territory) by sampling nearby grid
			let bestLat = 0,
				bestLng = 0,
				bestVal = -Infinity;
			const sDist = 0.6;
			const samples = [
				[0, sDist],
				[0, -sDist],
				[sDist, 0],
				[-sDist, 0],
				[sDist * 0.7, sDist * 0.7],
				[-sDist * 0.7, -sDist * 0.7],
				[sDist * 0.7, -sDist * 0.7],
				[-sDist * 0.7, sDist * 0.7],
			];

			samples.forEach(([dlng, dlat]) => {
				const sampleLat = u.lat + dlat;
				const sampleLng = u.lng + dlng;
				const sIdx = getGridIndex(sampleLat, sampleLng);
				const isSampleLand = sIdx !== -1 && landMask[sIdx] > 0;

				let score = myInfluenceAt(sIdx, u.sideIndex);

				const sampleOwnerId = sIdx !== -1 ? worldControlMap[sIdx] : 0;
				const isSampleAlly = sideList.some((c) => c.id === sampleOwnerId);

				if (!isSampleLand) {
					score = -999;
				} else if (sIdx !== -1 && isNeutralCountry(sIdx)) {
					score = -2500;
				} else if (!isSampleAlly) {
					score = -800;
				}

				if (score > bestVal) {
					bestVal = score;
					bestLat = dlat;
					bestLng = dlng;
				}
			});

			if (bestVal !== -Infinity) {
				const mag = Math.sqrt(bestLat * bestLat + bestLng * bestLng);
				if (mag > 0) {
					if (!retreatVector) retreatVector = { lat: 0, lng: 0 };
					retreatVector.lat += (bestLat / mag) * 1.2;
					retreatVector.lng += (bestLng / mag) * 1.2;
				}
			}
		}

		const _u3c = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) perf.unitFrontlinePress += _u3c - _u3b;
		if (
			u._strategicTargetGeneration !== _strategicTargetGeneration ||
			u._strategicBeneficiaryId !== u.beneficiaryId
		) {
			clearUnitStrategicTargets(u);
		}
		const staggerStrategicTargets = simSpeed >= 3 && units.length >= 800;
		const strategicCohort =
			Math.floor(Math.abs(u.id * 1_000_000)) % STRATEGIC_COHORT_COUNT;
		const canRefreshStrategicTarget =
			!staggerStrategicTargets ||
			strategicCohort === _simTickCount % STRATEGIC_COHORT_COUNT;
		if (u.mopUpTarget) {
			const mopUpIdx = getGridIndex(u.mopUpTarget.lat, u.mopUpTarget.lng);
			const mopUpOccupier = mopUpIdx === -1 ? -1 : dominantSideMap[mopUpIdx];
			if (
				mopUpIdx === -1 ||
				mopUpOccupier === u.sideIndex ||
				(mopUpOccupier >= 0 && !areSidesHostile(u.sideIndex, mopUpOccupier))
			) {
				u.mopUpTarget = null;
				u.mopUpTargetId = 0;
				u.targetSearchCooldown = 0;
			}
		}

		if (shouldMopUp) {
			// Mop-up mode: Enemy has no units or target is far and collapsed nations exist
			let enemyId = -1;

			if (u._mopUpAssignedCountryId > 0) {
				enemyId = u._mopUpAssignedCountryId;
			}

			// If supporting an ally and no enemies nearby, move towards their frontlines
			// Only actually go to the ally if that ally is losing land (has occupation)
			let activeSupportTarget = null;
			if (u.beneficiaryId !== u.sovereignId) {
				const ally = sideList.find((c) => c.id === u.beneficiaryId);
				const allyStats = countryStats.get(u.beneficiaryId);
				const allyInitial = ally?.initialCells || 1;
				// Only support allies that are at least 5% occupied to prevent unnecessary wandering
				if (ally && allyStats && allyStats.controlled < allyInitial * 0.95) {
					activeSupportTarget = ally;
				} else {
					// Force redirect back to sovereign/enemy goals if ally is safe
					u.beneficiaryId = u.sovereignId;
					clearUnitStrategicTargets(u);
				}
			}

			const needsNewTarget =
				!u.mopUpTarget ||
				u.targetSearchCooldown <= 0 ||
				u.mopUpTargetId !==
					(activeSupportTarget ? activeSupportTarget.id : enemyId);

			if (needsNewTarget && canRefreshStrategicTarget) {
				const targetId = activeSupportTarget ? activeSupportTarget.id : enemyId;
				u.lastMopUpId = targetId;
				const cellCache = _mopUpOwnedCellCache;
				const cachedCells = cellCache.get(targetId)?.cells;
				const bestCellIdx = selectNearestMopUpCell(cachedCells, {
					unitLat: u.lat,
					unitLng: u.lng,
					gridWidth,
					gridRes: CONFIG.GRID_RES,
					isEligible: (cellIndex) => {
						if (landMask[cellIndex] !== 2) return false;
						if (worldControlMap[cellIndex] !== targetId) {
							return false;
						}
						const occupierSide = dominantSideMap[cellIndex];
						return (
							occupierSide !== u.sideIndex &&
							(occupierSide < 0 || areSidesHostile(u.sideIndex, occupierSide))
						);
					},
				});

				if (bestCellIdx !== -1) {
					const y = Math.floor(bestCellIdx / gridWidth);
					const x = bestCellIdx % gridWidth;
					u.mopUpTarget = {
						lat: y * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES * 0.5,
						lng: x * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES * 0.5,
					};
					u.mopUpTargetId = targetId;
					u.targetSearchCooldown = 15 + Math.floor(Math.random() * 20);
				} else {
					u.mopUpTarget = null;
					u.mopUpTargetId = 0;
					u.targetSearchCooldown = 1;
				}
			}
			target = u.mopUpTarget;
		}
		const _u3MopUpDone = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) {
			perf.unitMopUpTargetSearch += _u3MopUpDone - _u3c;
		}

		// Nearby enemy-unit targets always win. City objectives are cached strategic
		// guidance and only refresh on this unit's cohort at high load.
		const hasDirectEnemyTarget = target && target.health !== undefined;
		if (!operationalFastLane && u._cityObjective) {
			const objective = u._cityObjective;
			const objectiveSide = countryToSideMap.get(objective.ownerId);
			const objectiveIdx = objective.gridIndex;
			if (
				objectiveSide === undefined ||
				!areSidesHostile(sideIndex, objectiveSide) ||
				objectiveIdx < 0 ||
				(dominantSideMap[objectiveIdx] === sideIndex &&
					myInfluenceAt(objectiveIdx, sideIndex) >= 0.35)
			) {
				u._cityObjective = null;
				u._cityObjectiveTick = -999;
			}
		}
		const cityCandidates = enemyCityCandidatesBySide[sideIndex] || [];
		if (
			!shouldMopUp &&
			!operationalFastLane &&
			!hasDirectEnemyTarget &&
			aiProfile.targetCityWeight > 0 &&
			cityCandidates.length > 0 &&
			canRefreshStrategicTarget &&
			(!u._cityObjective ||
				_simTickCount - (u._cityObjectiveTick || -999) >=
					CITY_OBJECTIVE_REFRESH_INTERVAL)
		) {
			const rankedCities = [];
			for (const city of cityCandidates) {
				const deltaLng = normalizeLongitudeDelta(city.lng - u.lng);
				const distSq = (u.lat - city.lat) ** 2 + deltaLng ** 2;
				const cityIdx = getGridIndex(city.lat, city.lng);
				const contested = myInfluenceAt(cityIdx, u.sideIndex) < 0.35;
				let score = -(distSq * 0.6);
				if (contested) score += 120;
				if (city.isCapital) score += 260;
				rankedCities.push({ city, cityIdx, deltaLng, distSq, score });
			}
			rankedCities.sort((a, b) => b.score - a.score);
			let bestCityEntry = null;
			for (
				let candidateIndex = 0;
				candidateIndex < Math.min(CITY_WATER_CHECK_LIMIT, rankedCities.length);
				candidateIndex++
			) {
				const entry = rankedCities[candidateIndex];
				let blockedByWater = false;
				if (!isAtSea && entry.distSq > 4) {
					const lineLength = Math.sqrt(entry.distSq);
					const steps = Math.min(12, Math.ceil(lineLength / 0.4));
					let waterSamples = 0;
					for (let sampleIndex = 1; sampleIndex < steps; sampleIndex++) {
						const progress = sampleIndex / steps;
						const waterIdx = getGridIndex(
							u.lat + (entry.city.lat - u.lat) * progress,
							u.lng + entry.deltaLng * progress,
						);
						if (waterIdx !== -1 && landMask[waterIdx] === 0) waterSamples++;
					}
					blockedByWater = waterSamples > steps * 0.3;
				}
				if (!blockedByWater) {
					bestCityEntry = entry;
					break;
				}
			}
			u._cityObjective = bestCityEntry
				? {
						lat: bestCityEntry.city.lat,
						lng: bestCityEntry.city.lng,
						gridIndex: bestCityEntry.cityIdx,
						ownerId:
							bestCityEntry.city.sovereignId || bestCityEntry.city.ownerId || 0,
					}
				: null;
			u._cityObjectiveTick = _simTickCount;
		}
		if (!operationalFastLane && !hasDirectEnemyTarget && u._cityObjective) {
			const cityObjective = u._cityObjective;
			if (target && target.lat !== undefined && target.lng !== undefined) {
				const weight = aiProfile.targetCityWeight;
				target = {
					lat: target.lat * (1 - weight) + cityObjective.lat * weight,
					lng: target.lng * (1 - weight) + cityObjective.lng * weight,
				};
			} else {
				target = { lat: cityObjective.lat, lng: cityObjective.lng };
			}
		}
		const _u3CityDone = _detailedPerfEnabled ? performance.now() : 0;
		if (_detailedPerfEnabled) {
			perf.unitCityObjective += _u3CityDone - _u3MopUpDone;
		}

		if (_detailedPerfEnabled) {
			perf.unitMopUpSearch += _u3CityDone - _u3c;
		}
		if (
			(u._armyOrder?.target || u._taskForceOrder?.target) &&
			!shouldMopUp &&
			target?.health === undefined
		) {
			target = u._armyOrder?.target || u._taskForceOrder.target;
		}

		// CITY-FOCUS COMBAT MODE:
		let _u4;
		if (target) {
			const movementTiming = executeGroundTarget({
				target,
				u,
				simFrameCount,
				_u4,
				_detailedPerfEnabled,
				_u3,
				isAtSea,
				CONFIG,
				isMyTerritory,
				gridIdxNow,
				myInfluenceAt,
				speedBuffMult,
				aiProfile,
				frame,
				planSpeedMult,
				planDirLat,
				planDirLng,
				isPlanUnit,
				_warPlan,
				sides,
				_navalPlan,
				_navalSupplyPlan,
				hasOperationalAssignment,
				shouldMopUp,
				retreatVector,
				localEnemyCount,
				enemyCentroidLat,
				enemyCentroidLng,
				borderDir,
				_overwhelmingForce,
				sideIndex,
				groupCentroid,
				currentIdx,
				isNeutralCountry,
				getGridIndex,
				isEncircled,
				isEffectivelyMyLand,
				isTooNearBorder,
				isMega,
				isSuper,
				geoDistSq,
				normalizeLongitudeDelta,
				_unitGridIdx,
				dominantSideMap,
				gridHeight,
				gridWidth,
				landMask,
				_transportPlan,
				pocketContained,
				_frontlinePolys,
				isEnemyTerritory,
				worldControlMap,
				countryToSideMap,
				areSidesHostile,
				role,
				damageTakenMult,
				recordDamage,
				isNeutral,
				sideVictoryRatios,
				countryObj,
				deJureMap,
				damageDealtMult,
				getLiveFormationStrength,
				currentControl,
				_theaterCitiesBySovereign,
			});
			if (movementTiming === false) return;
			_u4 = movementTiming;
		} else {
			u.lastCombatTick = 0;
		}

		if (u.health <= 0) {
			// Units are already being counted for casualties per-hit during simulation.
			// This just cleans them up when they reach 0 health.

			units.splice(i, 1);
		}

		// ── unitLoop sub-timer: end combatMove ──
		if (_detailedPerfEnabled && _u4 !== undefined)
			perf.unitCombatMove += performance.now() - _u4;
	};
}
