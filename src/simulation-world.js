/** Simulation helpers operate on an explicit state owner, independent of the DOM. */
export function createSimulationWorld(runtime) {
	function getEffectiveBuffState(countryObj, meta) {
		const visible = countryObj?.buffState || meta?.buffState || "none";

		// If global invisible buffs are disabled, always use the visible buff only.
		if (!runtime.invisibleBuffsEnabled) return visible;

		const hidden =
			(countryObj && countryObj.hiddenBuffState !== undefined
				? countryObj.hiddenBuffState
				: null) ??
			(meta && meta.hiddenBuffState !== undefined
				? meta.hiddenBuffState
				: null);
		if (hidden && hidden !== "none") return hidden;
		return visible;
	}

	function getOptimizationFactor() {
		// More active sides => higher factor => more aggressive optimization
		const activeSides =
			runtime.sides.filter((s) => s && s.length > 0).length || 1;
		return Math.max(1, activeSides / 2);
	}

	function _battleKey(lat, lng) {
		return (Math.round(lat * 10) + 900) * 10000 + (Math.round(lng * 10) + 1800);
	}

	function sidePairKey(uidA, uidB) {
		return uidA < uidB ? `${uidA}|${uidB}` : `${uidB}|${uidA}`;
	}

	function synchronizeSideUidCounter() {
		for (const uid of runtime.sideUids) {
			const match = /^side-(\d+)$/.exec(String(uid || ""));
			if (match)
				runtime._nextSideUid = Math.max(
					runtime._nextSideUid,
					Number(match[1]) + 1,
				);
		}
	}

	function allocateSideUid() {
		let uid;
		do {
			uid = `side-${runtime._nextSideUid++}`;
		} while (runtime.sideUids.includes(uid));
		return uid;
	}

	function ensureSideIdentities(reset = false) {
		if (reset) {
			runtime.sideUids = [];
			runtime.hostileSidePairs.clear();
		}
		synchronizeSideUidCounter();
		for (let i = 0; i < runtime.sides.length; i++) {
			if (!runtime.sideUids[i]) runtime.sideUids[i] = allocateSideUid();
		}
		if (runtime.sideUids.length > runtime.sides.length)
			runtime.sideUids.length = runtime.sides.length;
	}

	function areSidesHostile(sideA, sideB) {
		if (
			!Number.isInteger(sideA) ||
			!Number.isInteger(sideB) ||
			sideA < 0 ||
			sideB < 0 ||
			sideA >= runtime.MAX_SIDES ||
			sideB >= runtime.MAX_SIDES ||
			sideA === sideB
		)
			return false;
		return runtime.hostilityMatrix[sideA * runtime.MAX_SIDES + sideB] === 1;
	}

	function getActiveHostilePairs() {
		const pairs = [];
		for (let a = 0; a < runtime.sides.length; a++) {
			if (!runtime.sides[a]?.length) continue;
			for (let b = a + 1; b < runtime.sides.length; b++) {
				if (runtime.sides[b]?.length && areSidesHostile(a, b))
					pairs.push([a, b]);
			}
		}
		return pairs;
	}

	function clearUnitCommandAssignments(unit) {
		unit._assignedPlanSignature = null;
		unit._taskForceUid = null;
		unit._taskForceRole = null;
		unit._taskForceOrder = null;
		unit._armyOrder = null;
		unit._armyNavigation = null;
		unit._armySectorId = null;
		unit._armyRecovering = false;
		unit._armyNavalReserve = false;
		unit._armyExhaustedHealth = null;
		unit._armyLastNavStatus = null;
		unit._transportPlanSignature = null;
		unit._planWaypointSignature = null;
		unit._planWaypointIndex = 0;
		unit.navalAssigned = false;
		unit.supplyAssigned = false;
		unit.coastalAssigned = false;
		unit.garrisonAssigned = false;

		unit.frontSlot = null;
		unit._defenderReactTarget = null;
		unit._cachedTarget = null;
		unit._cachedLocalEnemyCount = 0;
		unit._cachedEnemyCentroidLat = 0;
		unit._cachedEnemyCentroidLng = 0;
	}

	function getUnitPersonnelFallback(unit) {
		const sideIdx = Number.isInteger(unit?.sideIndex) ? unit.sideIndex : -1;
		return sideIdx >= 0 && sideIdx < runtime.MAX_SIDES
			? runtime.soldiersPerUnit[sideIdx] || runtime.CONFIG.UNIT_TO_SOLDIER_RATIO
			: runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
	}

	function getLiveFormationPersonnel(unit) {
		return runtime.getFormationPersonnel(unit, {
			nominalPersonnel: getUnitPersonnelFallback(unit),
			baseHealth:
				unit?.maxHealth ||
				runtime.CONFIG.UNIT_HEALTH *
					(unit?.isAlpenjager ? runtime.CONFIG.ALPEN_HEALTH_MULT : 1),
		});
	}

	function getLiveFormationStrength(unit) {
		if (!unit) return 1;
		return runtime.getFormationStrengthMultiplier(unit, {
			referencePersonnel: runtime.CONFIG.UNIT_TO_SOLDIER_RATIO,
			nominalPersonnel: getUnitPersonnelFallback(unit),
			baseHealth:
				unit.maxHealth ||
				runtime.CONFIG.UNIT_HEALTH *
					(unit.isAlpenjager ? runtime.CONFIG.ALPEN_HEALTH_MULT : 1),
		});
	}

	function returnUnitPersonnelToReserve(unit) {
		const sideIdx = Number.isInteger(unit?.sideIndex) ? unit.sideIndex : -1;
		if (sideIdx < 0 || sideIdx >= runtime.MAX_SIDES) return 0;
		const personnel = getLiveFormationPersonnel(unit);
		if (personnel > 0) {
			runtime.sideRecruitableManpower[sideIdx] += personnel;
		}
		return personnel;
	}

	function setUnitFormationPersonnel(unit, personnel) {
		if (!unit) return unit;
		const wholePersonnel = Math.max(1, Math.round(Number(personnel) || 0));
		const strengthMultiplier =
			wholePersonnel / Math.max(1, runtime.CONFIG.UNIT_TO_SOLDIER_RATIO);
		const terrainHealthMultiplier = unit.isAlpenjager
			? runtime.CONFIG.ALPEN_HEALTH_MULT
			: 1;
		unit.personnel = wholePersonnel;
		unit.personnelCapacity = wholePersonnel;
		unit.nominalPersonnel = runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
		unit.strengthMultiplier = strengthMultiplier;
		unit.maxHealth =
			runtime.CONFIG.UNIT_HEALTH * strengthMultiplier * terrainHealthMultiplier;
		unit.health = unit.maxHealth;
		return unit;
	}

	function stableUnitCohort(unit, interval) {
		const numericId = Math.abs(Number(unit?.id) || 0);
		const stableId = Math.floor(numericId * 2_147_483_647) >>> 0;
		return interval > 0 ? stableId % interval : 0;
	}

	function scheduleCoastalTopologyJob() {
		if (
			!runtime.landMask?.length ||
			runtime._simulationJobs.has("coastal-topology")
		)
			return;
		const generation = runtime._simulationWorldGeneration;
		const coastal = [];
		runtime._simulationJobs.enqueue(
			runtime.createDeterministicJob({
				id: "coastal-topology",
				generation,
				totalItems: runtime.landMask.length,
				maxItemsPerTurn: 80_000,
				processRange(start, end) {
					for (let index = start; index < end; index++) {
						if (runtime.landMask[index] === 0) continue;
						const column = index % runtime.gridWidth;
						const row = Math.floor(index / runtime.gridWidth);
						let coastalCell = false;
						for (
							let rowOffset = -1;
							rowOffset <= 1 && !coastalCell;
							rowOffset++
						) {
							for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
								if (rowOffset === 0 && columnOffset === 0) continue;
								const neighborRow = row + rowOffset;
								const neighborColumn = column + columnOffset;
								if (
									neighborRow < 0 ||
									neighborRow >= runtime.gridHeight ||
									neighborColumn < 0 ||
									neighborColumn >= runtime.gridWidth
								) {
									continue;
								}
								if (
									runtime.landMask[
										neighborRow * runtime.gridWidth + neighborColumn
									] === 0
								) {
									coastalCell = true;
									break;
								}
							}
						}
						if (coastalCell) coastal.push(index);
					}
				},
				onComplete() {
					if (generation !== runtime._simulationWorldGeneration) return;
					runtime._coastalLandIndices = coastal;
					runtime._coastalTopologyReady = true;
					for (let sideIdx = 0; sideIdx < runtime.sides.length; sideIdx++) {
						if (runtime.sides[sideIdx]?.length)
							runtime._planReassessNeeded[sideIdx] = true;
					}
				},
			}),
		);
	}

	function consolidateOverlappingUnits() {
		if (runtime.units.length <= 40) return 0;
		const mergeDistSq = 0.14 * 0.14;
		const maxMergedHealth = runtime.CONFIG.UNIT_HEALTH * 5;
		const unitsToRemove = new Set();

		for (let index = 0; index < runtime.units.length; index++) {
			const unit = runtime.units[index];
			if (
				unitsToRemove.has(unit) ||
				unit.personnel !== undefined ||
				(unit.personnelCapacity || 0) > runtime.CONFIG.UNIT_TO_SOLDIER_RATIO ||
				unit.health >= maxMergedHealth ||
				unit.deployTicks > 0
			) {
				continue;
			}

			const hashX = Math.floor((unit.lng + 180) / runtime.UNIT_HASH_CELL_SIZE);
			const hashY = Math.floor((unit.lat + 90) / runtime.UNIT_HASH_CELL_SIZE);
			const hashKey = hashX * 100 + hashY;
			const sideIndex = unit.sideIndex;
			const cellUnits =
				sideIndex >= 0 && sideIndex < runtime.sides.length
					? runtime.unitHashBySide[sideIndex].get(hashKey)
					: runtime.unitSpatialHash.get(hashKey);
			if (!cellUnits) continue;

			for (let otherIndex = 0; otherIndex < cellUnits.length; otherIndex++) {
				const other = cellUnits[otherIndex];
				if (
					other === unit ||
					unitsToRemove.has(other) ||
					other.personnel !== undefined ||
					(other.personnelCapacity || 0) >
						runtime.CONFIG.UNIT_TO_SOLDIER_RATIO ||
					other.sovereignId !== unit.sovereignId ||
					other.deployTicks > 0
				) {
					continue;
				}

				const deltaLng = runtime.normalizeLongitudeDelta(other.lng - unit.lng);
				const distanceSq = (unit.lat - other.lat) ** 2 + deltaLng ** 2;
				if (distanceSq >= mergeDistSq) continue;

				const transfer = Math.min(maxMergedHealth - unit.health, other.health);
				unit.health += transfer;
				other.health -= transfer;
				if (other.health <= 0) unitsToRemove.add(other);
				if (unit.health >= maxMergedHealth) break;
			}
		}

		if (unitsToRemove.size > 0) {
			runtime.units = runtime.units.filter((unit) => !unitsToRemove.has(unit));
			runtime._frameSimulationCommitFlags.add("unit-consolidation");
		}
		return unitsToRemove.size;
	}

	function requestOperationalAiReassessment(sideIndex = null) {
		runtime._aiOperationsDirty = true;
		if (Number.isInteger(sideIndex) && sideIndex >= 0) {
			runtime._planReassessNeeded[sideIndex] = true;
			return;
		}
		for (let index = 0; index < runtime.sides.length; index++) {
			if (runtime.sides[index]?.length)
				runtime._planReassessNeeded[index] = true;
		}
	}

	function refreshLiveCombatPower(collectPosture = false) {
		runtime._liveSideCombatPower.fill(0);
		const sideStrength = collectPosture
			? new Array(runtime.sides.length).fill(0)
			: null;
		const sideUnitCounts = collectPosture
			? new Array(runtime.sides.length).fill(0)
			: null;
		for (const unit of runtime.units) {
			const sideIndex = unit.sideIndex;
			const countsForLivePower =
				unit.health > 0 &&
				unit.deployTicks <= 0 &&
				sideIndex >= 0 &&
				sideIndex < runtime.MAX_SIDES;
			// Preserve the original posture scan: missing deployTicks is accepted and dead units still count.
			const countsForPosture =
				collectPosture &&
				!(unit.deployTicks > 0) &&
				!(sideIndex < 0 || sideIndex >= runtime.sides.length);
			if (!countsForLivePower && !countsForPosture) continue;
			const power = runtime.operationalUnitPower(unit);
			if (countsForLivePower) runtime._liveSideCombatPower[sideIndex] += power;
			if (countsForPosture) {
				sideStrength[sideIndex] += power;
				sideUnitCounts[sideIndex]++;
			}
		}
		return collectPosture ? { sideStrength, sideUnitCounts } : undefined;
	}

	function getKnownEnemyPowerForSide(sideIndex) {
		let power = 0;
		for (let index = 0; index < runtime.sides.length; index++)
			if (areSidesHostile(sideIndex, index))
				power += runtime._liveSideCombatPower[index];
		return power;
	}

	function formationDamage(damage, attacker, defender) {
		return (
			damage *
			(attacker.kind === "army"
				? Math.max(0, getLiveFormationStrength(attacker))
				: 1) *
			// Defenders holding a river or mountain line take less damage.
			(defender?.lineDefense ?? 1)
		);
	}

	function createHostilityMatrix(sideCount, pairs, uids, maxSides = 8) {
		const matrix = new Uint8Array(maxSides * maxSides);
		for (let a = 0; a < sideCount; a++)
			for (let b = a + 1; b < sideCount; b++)
				if (uids[a] && uids[b] && pairs.has(sidePairKey(uids[a], uids[b]))) {
					matrix[a * maxSides + b] = 1;
					matrix[b * maxSides + a] = 1;
				}
		return matrix;
	}

	function invalidateStrategicTargetCaches() {
		runtime._strategicTargetGeneration++;
		runtime._enemyCityCacheGeneration = -1;
		runtime._enemyCityCacheSource = null;
		runtime._enemyCityCandidatesBySide = [];
	}

	function clearUnitStrategicTargets(unit) {
		unit.mopUpTarget = null;
		unit.mopUpTargetId = 0;
		unit.lastMopUpId = null;
		unit.targetSearchCooldown = 0;
		unit._cityObjective = null;
		unit._cityObjectiveTick = -999;
		unit._strategicTargetGeneration = runtime._strategicTargetGeneration;
		unit._strategicBeneficiaryId = unit.beneficiaryId;
	}

	function getEnemyCityCandidatesBySide(citySource, countryToSideMap) {
		if (
			runtime._enemyCityCacheGeneration ===
				runtime._strategicTargetGeneration &&
			runtime._enemyCityCacheSource === citySource &&
			runtime._enemyCityCandidatesBySide.length === runtime.sides.length
		) {
			return runtime._enemyCityCandidatesBySide;
		}
		const candidates = Array.from({ length: runtime.sides.length }, () => []);
		for (const city of citySource || []) {
			const ownerId = city.sovereignId || city.ownerId || 0;
			const ownerSide = countryToSideMap.get(ownerId);
			if (ownerSide === undefined) continue;
			for (let sideIndex = 0; sideIndex < runtime.sides.length; sideIndex++) {
				if (areSidesHostile(sideIndex, ownerSide))
					candidates[sideIndex].push(city);
			}
		}
		for (const sideCandidates of candidates) {
			sideCandidates.sort((a, b) => {
				const capitalDelta = Number(b.isCapital) - Number(a.isCapital);
				if (capitalDelta !== 0) return capitalDelta;
				return (b.population || b.pop || 0) - (a.population || a.pop || 0);
			});
			if (sideCandidates.length > runtime.CITY_CANDIDATE_CACHE_LIMIT) {
				sideCandidates.length = runtime.CITY_CANDIDATE_CACHE_LIMIT;
			}
		}
		runtime._enemyCityCacheGeneration = runtime._strategicTargetGeneration;
		runtime._enemyCityCacheSource = citySource;
		runtime._enemyCityCandidatesBySide = candidates;
		return candidates;
	}

	function invalidateFrontlineField() {
		runtime._frontlineWorkerGeneration++;
		runtime._frontlineTerritoryGeneration++;
		invalidateStrategicTargetCaches();
		runtime._frontlineWorkerPendingField = true;
		runtime._frontlineWorkerPendingLayout = true;
		runtime.syncFrontlineWorkerPendingState();
		runtime.frontlineFieldTick = -999;
		runtime._frontlinePolyTick = -999;
		runtime.frontlineDirLat = null;
		runtime.frontlineDirLng = null;
		runtime._frontlinePolys = {};
		for (const unit of runtime.units) unit.frontSlot = null;
	}

	function getProvinceId(x, y, countryId) {
		if (countryId <= 0) return 0;
		const res = runtime.CONFIG.GRID_RES;
		const lat = y * res - 90;
		const lng = x * res - 180;

		// Base coordinates scaled for province density
		const scale = 0.65;
		const nx = lng * scale;
		const ny = lat * scale;

		// Octave 1: Domain warping
		const w1 = Math.sin(nx * 0.8 + ny * 0.6 + countryId * 0.1) * 1.2;
		const w2 = Math.cos(nx * 0.5 - ny * 0.9 + countryId * 0.2) * 1.1;

		// Octave 2: High-frequency fractal noise composition
		const noise =
			Math.sin((nx + w1) * 2.3) * 0.5 +
			Math.sin((ny + w2) * 1.9) * 0.5 +
			Math.sin((nx + ny) * 1.4 + countryId) * 0.3 +
			Math.cos(nx * 3.1 - ny * 2.7) * 0.2;

		// Grid snap into "cells"
		const cellX = Math.floor(nx + w1 + noise);
		const cellY = Math.floor(ny + w2 + noise);

		// Unique hashing using prime pairing to ensure no two provinces share an ID, even across countries.
		// The countryId is a primary component of the hash, forcing province lines to reset at borders.
		const h1 = Math.abs(cellX * 73856093);
		const h2 = Math.abs(cellY * 19349663);
		const h3 = Math.abs(countryId * 83492791);

		return (h1 ^ h2 ^ h3) >>> 0;
	}

	function generateProvinces() {
		if (!runtime.provinceMap || !runtime.worldControlMap) return;
		for (let y = 0; y < runtime.gridHeight; y++) {
			const rowOffset = y * runtime.gridWidth;
			for (let x = 0; x < runtime.gridWidth; x++) {
				const idx = rowOffset + x;
				runtime.provinceMap[idx] = getProvinceId(
					x,
					y,
					runtime.worldControlMap[idx],
				);
			}
		}
		notifyPoliticalMapLoaded();
	}

	function notifyPoliticalMapLoaded() {
		runtime._politicalMapRevision++;
		runtime._neutralBorderCacheSignature = "";
		runtime._territoryLedger?.markAllDirty();
		runtime.onPoliticalMapChanged?.();
	}

	function getControlValue(lat, lng) {
		const idx = runtime.getGridIndex(lat, lng);
		if (idx === -1 || runtime.landMask[idx] === 0) return 0;
		// For combat logic, return occupation if in active warzone
		if (runtime.gameState === "SIMULATING" && runtime.landMask[idx] === 2)
			return runtime.occupationMap[idx];
		return 0;
	}

	function spawnSingleUnit(sideIdx, sovereignId, _preferEnemyFront = false) {
		const supplyFailed = runtime.capitalLostCountries?.has(sovereignId);
		const nominalPersonnel = Math.max(
			1,
			Math.round(
				runtime.soldiersPerUnit[sideIdx] ||
					runtime.CONFIG.UNIT_TO_SOLDIER_RATIO,
			),
		);
		const recruitedPersonnel = Math.max(
			1,
			Math.round(nominalPersonnel * (supplyFailed ? 0.4 : 1)),
		);
		if ((runtime.sideRecruitableManpower[sideIdx] || 0) < recruitedPersonnel) {
			return false;
		}
		// Enforce per‑side unit cap: if this side is already at or above the limit, do not spawn.
		const sideUnits = runtime.units.filter(
			(u) => u.sideIndex === sideIdx,
		).length;
		const manualMP = runtime.manualSideManpower[sideIdx];
		const effectiveMax =
			manualMP !== null
				? Math.max(
						runtime.CONFIG.MAX_UNITS_PER_SIDE,
						Math.min(
							10000,
							Math.floor(manualMP / runtime.CONFIG.UNIT_TO_SOLDIER_RATIO),
						),
					)
				: runtime.CONFIG.MAX_UNITS_PER_SIDE;
		if (sideUnits >= effectiveMax) return false;

		// ── Spawn from friendly cities ──────────────────────────────────────
		const friendlyCities = runtime.cities.filter((c) => {
			if (!c.ownerId || c.ownerId !== sovereignId) return false;
			const cIdx = runtime.getGridIndex(c.lat, c.lng);
			if (cIdx === -1 || runtime.landMask[cIdx] === 0) return false;
			if (runtime.dominantSideMap[cIdx] !== sideIdx) return false;
			return true;
		});

		let lat, lng;

		if (friendlyCities.length > 0) {
			// Pick a random friendly city, bias toward frontline-adjacent ones
			const frontlineCities = friendlyCities.filter((c) => {
				const cIdx = runtime.getGridIndex(c.lat, c.lng);
				const neighbors = [
					cIdx + 1,
					cIdx - 1,
					cIdx + runtime.gridWidth,
					cIdx - runtime.gridWidth,
				];
				for (const n of neighbors) {
					if (n >= 0 && n < runtime.landMask.length) {
						const nds = runtime.dominantSideMap[n];
						if (nds >= 0 && areSidesHostile(sideIdx, nds)) return true;
					}
				}
				return false;
			});

			const pick =
				frontlineCities.length > 0 && !supplyFailed
					? frontlineCities[Math.floor(Math.random() * frontlineCities.length)]
					: friendlyCities[Math.floor(Math.random() * friendlyCities.length)];

			lat = pick.lat + (Math.random() - 0.5) * runtime.CONFIG.GRID_RES * 0.8;
			lng = pick.lng + (Math.random() - 0.5) * runtime.CONFIG.GRID_RES * 0.8;

			// Validate: ensure still within friendly territory
			const vIdx = runtime.getGridIndex(lat, lng);
			if (
				vIdx === -1 ||
				runtime.worldControlMap[vIdx] !== sovereignId ||
				runtime.dominantSideMap[vIdx] !== sideIdx
			) {
				lat = pick.lat;
				lng = pick.lng;
			}
		} else {
			// Fallback: spawn in friendly warzone territory
			const theaterIndices = [];
			const step = Math.max(1, Math.floor(runtime.landMask.length / 500000));
			for (let i = 0; i < runtime.landMask.length; i += step) {
				if (
					runtime.landMask[i] === 2 &&
					runtime.worldControlMap[i] === sovereignId &&
					runtime.dominantSideMap[i] === sideIdx
				) {
					theaterIndices.push(i);
				}
			}
			if (theaterIndices.length === 0) {
				console.warn(
					"[MW] spawnSingleUnit FAILED for country",
					sovereignId,
					": no friendly territory to spawn on (dominantSideMap check)",
				);
				return false;
			}

			const idx =
				theaterIndices[Math.floor(Math.random() * theaterIndices.length)];
			const y = Math.floor(idx / runtime.gridWidth);
			const x = idx % runtime.gridWidth;
			lat = y * runtime.CONFIG.GRID_RES - 90 + runtime.CONFIG.GRID_RES / 2;
			lng = x * runtime.CONFIG.GRID_RES - 180 + runtime.CONFIG.GRID_RES / 2;
		}

		const finalIdx = runtime.getGridIndex(lat, lng);
		const isMountainCell =
			runtime.terrainMask && finalIdx >= 0
				? runtime.terrainMask[finalIdx] > 0.35
				: false;
		// Alpenjägers: mostly drawn from mountainous recruitment cells
		const isAlpen = isMountainCell && Math.random() < 0.4;

		const unitId = Math.random();

		const unit = runtime.createArmyFormation({
			id: unitId,
			lat,
			lng,
			sideIndex: sideIdx,
			sovereignId: sovereignId,
			isAlpenjager: !!isAlpen,
			_cachedTarget: null,
			_cachedScanKx: -999,
			_cachedScanKy: -999,
			_lastFullScanTick: 0,
		});
		setUnitFormationPersonnel(unit, nominalPersonnel);
		if (supplyFailed) {
			unit.health *= 0.4;
			unit.personnel = Math.round(unit.personnelCapacity * 0.4);
			unit.strengthMultiplier =
				unit.personnel / runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
		}
		runtime.units.push(unit);

		if (sideIdx >= 0 && sideIdx < runtime.MAX_SIDES) {
			runtime.sideRecruitableManpower[sideIdx] = Math.max(
				0,
				runtime.sideRecruitableManpower[sideIdx] - unit.personnel,
			);
		}

		return true;
	}

	function findCountrySideIndex(countryId) {
		return runtime.sides.findIndex((side) =>
			side?.some((c) => c.id === countryId),
		);
	}

	function clearSideLandPlanSlots(sideIdx) {
		if (sideIdx < 0) return;
		if (sideIdx < runtime._warPlan.length) runtime._warPlan[sideIdx] = null;
		const secondSlot = sideIdx + runtime.sides.length;
		if (secondSlot < runtime._warPlan.length)
			runtime._warPlan[secondSlot] = null;
	}

	function launchBomb(fromLat, fromLng, toLat, toLng, sideIdx) {
		runtime.bombs.push({
			id: Math.random(),
			startLat: fromLat,
			startLng: fromLng,
			targetLat: toLat,
			targetLng: toLng,
			currentLat: fromLat,
			currentLng: fromLng,
			nextLat: fromLat,
			nextLng: fromLng,
			progress: 0,
			sideIndex: sideIdx,
			state: "rising",
			trail: [],
			peakAlt: 1.5 + Math.random() * 2.5,
		});
	}

	function lngDelta(a, b) {
		const d = runtime.normalizeLongitudeDelta(a - b);
		return d;
	}

	function geoDistSq(aLat, aLng, bLat, bLng) {
		const dLat = aLat - bLat;
		const dLng = lngDelta(aLng, bLng);
		return dLat * dLat + dLng * dLng;
	}

	function recordCountryCombatLoss(victimId, loss, attackerId = null) {
		if (!Number.isFinite(loss) || loss <= 0 || victimId <= 0) return;
		runtime.countryCasualties.set(
			victimId,
			(runtime.countryCasualties.get(victimId) || 0) + loss,
		);
		if (attackerId && attackerId !== victimId) {
			let victimMap = runtime.casualtyByAttacker.get(victimId);
			if (!victimMap) {
				victimMap = new Map();
				runtime.casualtyByAttacker.set(victimId, victimMap);
			}
			victimMap.set(attackerId, (victimMap.get(attackerId) || 0) + loss);
		}
	}

	function applyLandUnitDamage(targetUnit, damage, attacker = null) {
		if (
			!targetUnit ||
			!Number.isFinite(damage) ||
			damage <= 0 ||
			!Number.isFinite(targetUnit.health) ||
			targetUnit.health <= 0
		)
			return 0;
		const effectiveDamage = Math.min(targetUnit.health, damage);
		const attackerId = attacker?.sovereignId || Number(attacker);
		let personnelLoss = 0;
		{
			const beforePersonnel = getLiveFormationPersonnel(targetUnit);
			const maxHealth = Math.max(
				1,
				targetUnit.maxHealth || runtime.CONFIG.UNIT_HEALTH,
			);
			const personnelCapacity = Math.max(
				beforePersonnel,
				targetUnit.personnelCapacity || beforePersonnel,
			);
			const nextHealth = Math.max(0, targetUnit.health - effectiveDamage);
			const nextPersonnel = Math.min(
				beforePersonnel,
				Math.max(0, Math.round(personnelCapacity * (nextHealth / maxHealth))),
			);
			personnelLoss = beforePersonnel - nextPersonnel;
			targetUnit.personnel = nextPersonnel;
			targetUnit.strengthMultiplier =
				targetUnit.personnel / runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
			if (targetUnit.personnel <= 0) targetUnit.health = 0;
		}
		targetUnit.health = Math.max(0, targetUnit.health - effectiveDamage);
		const targetSideIndex = targetUnit.sideIndex;
		if (targetSideIndex >= 0 && targetSideIndex < runtime.MAX_SIDES) {
			runtime.sideCasualties[targetSideIndex] += personnelLoss;
			runtime.sideSoldiers[targetSideIndex] = Math.max(
				0,
				runtime.sideSoldiers[targetSideIndex] - personnelLoss,
			);
		}
		recordCountryCombatLoss(targetUnit.sovereignId, personnelLoss, attackerId);
		return personnelLoss;
	}

	return {
		applyLandUnitDamage,
		getLiveFormationPersonnel,
		getUnitPersonnelFallback,
		recordCountryCombatLoss,
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
		synchronizeSideUidCounter,
		allocateSideUid,
		requestOperationalAiReassessment,
		findCountrySideIndex,
		generateProvinces,
		getProvinceId,
		notifyPoliticalMapLoaded,
		invalidateFrontlineField,
		invalidateStrategicTargetCaches,
		sidePairKey,
		createHostilityMatrix,
		clearSideLandPlanSlots,
		clearUnitCommandAssignments,
		scheduleCoastalTopologyJob,
	};
}
