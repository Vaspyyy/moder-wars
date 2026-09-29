import {
	multiplyInfluence,
	readInfluence,
	sumInfluenceNeighborhood,
	writeInfluence,
} from "./influence-grid.js";

// Dependencies are supplied by the application; this module does not import it.
export function createInfluenceRuntime(runtime) {
	function refreshInfluenceLookupCaches() {
		const citySource = runtime.activeTheaterCities;
		if (
			runtime._influenceCityGridSource !== citySource ||
			runtime._influenceCityGridSourceLength !== citySource.length ||
			runtime._influenceCityGridWorldGeneration !==
				runtime._simulationWorldGeneration
		) {
			runtime._tickCityGridIndexSet.clear();
			for (let cityIndex = 0; cityIndex < citySource.length; cityIndex++) {
				const gridIndex = runtime.getGridIndex(
					citySource[cityIndex].lat,
					citySource[cityIndex].lng,
				);
				if (gridIndex !== -1) runtime._tickCityGridIndexSet.add(gridIndex);
			}
			runtime._influenceCityGridSource = citySource;
			runtime._influenceCityGridSourceLength = citySource.length;
			runtime._influenceCityGridWorldGeneration =
				runtime._simulationWorldGeneration;
		}

		let signature = `${runtime.sides.length}|`;
		for (let sideIndex = 0; sideIndex < runtime.sides.length; sideIndex++) {
			const side = runtime.sides[sideIndex] || [];
			signature += `${sideIndex}:`;
			for (let countryIndex = 0; countryIndex < side.length; countryIndex++) {
				const country = side[countryIndex];
				signature += `${country.id},${country.role || "OFFENSE"};`;
			}
			for (
				let otherIndex = 0;
				otherIndex < runtime.sides.length;
				otherIndex++
			) {
				if (runtime.areSidesHostile(sideIndex, otherIndex))
					signature += `h${otherIndex},`;
			}
			signature += "|";
		}
		if (signature === runtime._influenceCoalitionSignature) return;
		runtime._influenceCoalitionSignature = signature;
		runtime._influenceActiveSideIndices.length = 0;
		while (runtime._tickSideAllyIdSets.length < runtime.sides.length) {
			runtime._tickSideAllyIdSets.push(new Set());
			runtime._tickSideSupportIdSets.push(new Set());
		}
		for (let sideIndex = 0; sideIndex < runtime.MAX_SIDES; sideIndex++) {
			runtime._influenceHostileSideIndices[sideIndex].length = 0;
			const allies = runtime._tickSideAllyIdSets[sideIndex];
			const support = runtime._tickSideSupportIdSets[sideIndex];
			allies?.clear();
			support?.clear();
			const side = runtime.sides[sideIndex] || [];
			if (side.length === 0) continue;
			runtime._influenceActiveSideIndices.push(sideIndex);
			for (const country of side) {
				allies.add(country.id);
				if (country.role === "SUPPORT") support.add(country.id);
			}
			for (
				let otherIndex = 0;
				otherIndex < runtime.sides.length;
				otherIndex++
			) {
				if (runtime.areSidesHostile(sideIndex, otherIndex)) {
					runtime._influenceHostileSideIndices[sideIndex].push(otherIndex);
				}
			}
		}
	}

	function ensureInfluenceFrontierQueue() {
		const gridSize = runtime.gridWidth * runtime.gridHeight;
		if (
			runtime._influenceFrontierQueued.length === gridSize &&
			runtime._influenceFrontierWorldGeneration ===
				runtime._simulationWorldGeneration
		) {
			return;
		}
		runtime._influenceFrontierQueued = new Uint8Array(gridSize);
		runtime._influenceFrontierQueue = [];
		runtime._influenceFrontierCursor = 0;
		runtime._influenceFrontierPriorityQueue = [];
		runtime._influenceFrontierPriorityCursor = 0;
		runtime._influenceFrontierWorldGeneration =
			runtime._simulationWorldGeneration;
	}

	function enqueueInfluenceFrontierIndex(index, priority = false) {
		if (index < 0 || index >= runtime._influenceFrontierQueued.length)
			return false;
		const queuedState = runtime._influenceFrontierQueued[index];
		if (priority) {
			if (queuedState === 2) return false;
			if (
				runtime._influenceFrontierPriorityQueue.length -
					runtime._influenceFrontierPriorityCursor >=
				runtime.INFLUENCE_FRONTIER_PRIORITY_LIMIT
			) {
				return false;
			}
			// Controller changes jump ahead of smoothing work. If this upgrades an
			// existing regular entry, that stale FIFO entry is ignored when reached.
			runtime._influenceFrontierQueued[index] = 2;
			runtime._influenceFrontierPriorityQueue.push(index);
			return true;
		}
		if (queuedState !== 0) return false;
		if (
			runtime._influenceFrontierQueue.length -
				runtime._influenceFrontierCursor >=
			runtime.INFLUENCE_FRONTIER_BACKLOG_LIMIT
		) {
			return false;
		}
		runtime._influenceFrontierQueued[index] = 1;
		runtime._influenceFrontierQueue.push(index);
		return true;
	}

	function queueInfluenceFrontierCell(index, priority = false) {
		ensureInfluenceFrontierQueue();
		if (index < 0 || index >= runtime._influenceFrontierQueued.length) return;
		const x = index % runtime.gridWidth;
		enqueueInfluenceFrontierIndex(index, priority);
		if (x > 0) enqueueInfluenceFrontierIndex(index - 1, priority);
		if (x + 1 < runtime.gridWidth)
			enqueueInfluenceFrontierIndex(index + 1, priority);
		if (index >= runtime.gridWidth) {
			enqueueInfluenceFrontierIndex(index - runtime.gridWidth, priority);
		}
		if (index + runtime.gridWidth < runtime._influenceFrontierQueued.length) {
			enqueueInfluenceFrontierIndex(index + runtime.gridWidth, priority);
		}
	}

	function isInfluenceFrontierIndex(index) {
		if (
			index < 0 ||
			index >= runtime.dominantSideMap.length ||
			runtime.landMask[index] !== 2
		) {
			return false;
		}
		const x = index % runtime.gridWidth;
		const y = Math.floor(index / runtime.gridWidth);
		if (
			x <= 0 ||
			x >= runtime.gridWidth - 1 ||
			y <= 0 ||
			y >= runtime.gridHeight - 1
		) {
			return false;
		}
		const controller = runtime.dominantSideMap[index];
		return (
			runtime.dominantSideMap[index - 1] !== controller ||
			runtime.dominantSideMap[index + 1] !== controller ||
			runtime.dominantSideMap[index - runtime.gridWidth] !== controller ||
			runtime.dominantSideMap[index + runtime.gridWidth] !== controller
		);
	}

	function processInfluenceFrontierDiffusion(itemBudget) {
		ensureInfluenceFrontierQueue();
		const priorityEnd = runtime._influenceFrontierPriorityQueue.length;
		const regularEnd = runtime._influenceFrontierQueue.length;
		let processed = 0;
		while (processed < itemBudget) {
			let index = -1;
			let expectedState = 0;
			if (runtime._influenceFrontierPriorityCursor < priorityEnd) {
				index =
					runtime._influenceFrontierPriorityQueue[
						runtime._influenceFrontierPriorityCursor++
					];
				expectedState = 2;
			} else if (runtime._influenceFrontierCursor < regularEnd) {
				index =
					runtime._influenceFrontierQueue[runtime._influenceFrontierCursor++];
				expectedState = 1;
			} else {
				break;
			}
			if (runtime._influenceFrontierQueued[index] !== expectedState) continue;
			runtime._influenceFrontierQueued[index] = 0;
			processed++;
			if (runtime.landMask[index] !== 2) continue;
			const y = Math.floor(index / runtime.gridWidth);
			const x = index % runtime.gridWidth;
			if (
				x <= 0 ||
				x >= runtime.gridWidth - 1 ||
				y <= 0 ||
				y >= runtime.gridHeight - 1
			) {
				continue;
			}
			const blur = 0.25;
			for (
				let activeIndex = 0;
				activeIndex < runtime._influenceActiveSideIndices.length;
				activeIndex++
			) {
				const sideIndex = runtime._influenceActiveSideIndices[activeIndex];
				const influenceMap = runtime.sideInfluenceMaps[sideIndex];
				const sum = sumInfluenceNeighborhood(
					influenceMap,
					index,
					runtime.gridWidth,
				);
				writeInfluence(
					influenceMap,
					index,
					readInfluence(influenceMap, index) * (1 - blur) + (sum / 9) * blur,
				);
			}
			runtime.syncOccupationFromSideInfluence(index);
			if (isInfluenceFrontierIndex(index)) {
				enqueueInfluenceFrontierIndex(index);
			}
		}
		if (runtime._influenceFrontierPriorityCursor > 4096) {
			runtime._influenceFrontierPriorityQueue =
				runtime._influenceFrontierPriorityQueue.slice(
					runtime._influenceFrontierPriorityCursor,
				);
			runtime._influenceFrontierPriorityCursor = 0;
		}
		if (runtime._influenceFrontierCursor > 4096) {
			runtime._influenceFrontierQueue = runtime._influenceFrontierQueue.slice(
				runtime._influenceFrontierCursor,
			);
			runtime._influenceFrontierCursor = 0;
		}
	}

	function selectInfluenceNeighborCredit(x, y, sideIndex, countryToSideMap) {
		let uniqueCountries = 0;
		for (let direction = 0; direction < 8; direction++) {
			const neighborX = x + runtime._influenceNeighborDx[direction];
			const neighborY = y + runtime._influenceNeighborDy[direction];
			if (
				neighborX < 0 ||
				neighborX >= runtime.gridWidth ||
				neighborY < 0 ||
				neighborY >= runtime.gridHeight
			) {
				continue;
			}
			const countryId =
				runtime.primaryOccupierMap[neighborY * runtime.gridWidth + neighborX];
			if (countryId <= 0 || countryToSideMap.get(countryId) !== sideIndex) {
				continue;
			}
			let slot = 0;
			while (
				slot < uniqueCountries &&
				runtime._influenceNeighborCountryIds[slot] !== countryId
			) {
				slot++;
			}
			if (slot === uniqueCountries) {
				runtime._influenceNeighborCountryIds[slot] = countryId;
				runtime._influenceNeighborCountryCounts[slot] = 1;
				uniqueCountries++;
			} else {
				runtime._influenceNeighborCountryCounts[slot]++;
			}
		}
		let bestCountryId = 0;
		let bestCount = 0;
		for (let slot = 0; slot < uniqueCountries; slot++) {
			const count = runtime._influenceNeighborCountryCounts[slot];
			if (count > bestCount && count >= 3) {
				bestCount = count;
				bestCountryId = runtime._influenceNeighborCountryIds[slot];
			}
			runtime._influenceNeighborCountryCounts[slot] = 0;
		}
		return bestCountryId;
	}

	function updatePersistentInfluence(
		p1Count,
		p2Count,
		countryToSideMap,
		countryById = runtime._tickCountryById,
	) {
		let baseInfluence = runtime.CONFIG.INFLUENCE_RATE;
		refreshInfluenceLookupCaches();

		// Dynamic optimization: More sides => fewer expensive samples / unit updates
		const optimizationFactor = runtime.getOptimizationFactor();

		// Mobilization Ramp: Influence starts at 5% and climbs to 100% over 600
		// simulation ticks, independent of render cadence.
		const rampDuration = 600;
		const rampScale = Math.min(
			1.0,
			0.05 + (runtime._simTickCount / rampDuration) * 0.95,
		);
		baseInfluence *= rampScale;

		// Boost expansion when unopposed
		if (p1Count > 0 && p2Count === 0) baseInfluence *= 6;
		if (p2Count > 0 && p1Count === 0) baseInfluence *= 6;

		// Every simulation tick owns one stable formation cohort. Unlike the visual
		// frame counter, `_simTickCount` advances between high-speed subticks, so the
		// same cohort cannot be charged twice inside one animation frame.
		const influenceStride = 3;
		const influenceCohort = runtime._simTickCount % influenceStride;

		// Smooth only cells near active influence or controller changes. The previous
		// global random sampler rejected most water/stable cells and produced a large
		processInfluenceFrontierDiffusion(
			Math.max(400, Math.floor(1600 / optimizationFactor)),
		);

		// Strategic Batching: Process a fixed max number of units per frame for influence
		// This prevents framerate drops when unit counts explode (e.g. 1000+ units)
		const maxUnitsBase = 300;
		const maxInfluenceApplications = Math.max(
			50,
			Math.floor(maxUnitsBase / optimizationFactor),
		);
		// Each processed cohort member represents `influenceStride` elapsed ticks.
		// Divide the old per-tick application cap by that stride so large armies keep
		// the same total pressure instead of receiving a 2-3x capture-rate boost.
		const influenceApplicationShare = Math.floor(
			maxInfluenceApplications / influenceStride,
		);
		const influenceApplicationRemainder =
			maxInfluenceApplications % influenceStride;
		const maxUnitsToProcess = Math.max(
			1,
			influenceApplicationShare +
				(influenceCohort < influenceApplicationRemainder ? 1 : 0),
		);
		let unitsProcessed = 0;

		// Start index rotates through the unit list using simulation time rather than
		// visual time, and cached lookups rebuild only when their source revisions move.
		const startIndex =
			(runtime._simTickCount * 30) % Math.max(1, runtime.units.length);
		const cityGridIndexSet = runtime._tickCityGridIndexSet;
		const sideAllyIdSets = runtime._tickSideAllyIdSets;
		const sideSupportIdSets = runtime._tickSideSupportIdSets;

		for (let i = 0; i < runtime.units.length; i++) {
			const idx = (startIndex + i) % runtime.units.length;
			const u = runtime.units[idx];
			const cohortId = runtime.stableUnitCohort(u, influenceStride);
			if (cohortId !== influenceCohort) continue;
			if (u.deployTicks > 0) continue;

			// If this unit is currently in active combat, it should not exert territorial influence
			if (
				typeof u.lastCombatTick === "number" &&
				runtime.simFrameCount - u.lastCombatTick <= 5
			) {
				continue;
			}

			// The batch limits map-marker/cell work. A compressed formation still
			// touches the same cells as one ordinary marker, so charging its represented
			// personnel here can permanently starve large formations from influence.
			unitsProcessed++;
			if (unitsProcessed > maxUnitsToProcess) break;

			if (u.deployTicks > 0) continue;
			let r = runtime.CONFIG.INFLUENCE_RADIUS;
			let teamMult = 1.0;

			const gridIdx = runtime.getGridIndex(u.lat, u.lng);
			const isAtSea = gridIdx === -1 || runtime.landMask[gridIdx] === 0;
			const mountainIntensity =
				runtime.mountainsEnabled && gridIdx !== -1
					? runtime.terrainMask[gridIdx]
					: 0;

			if (mountainIntensity > 0) {
				// Nerf advancement size (radius) and expansion rate (influence power) in mountains
				// Higher intensity mountains require units to be significantly closer to the border to flip it
				r *= 1.0 - mountainIntensity * 0.65;
				teamMult *= 1.0 - mountainIntensity * 0.5;
			}

			const countryObj = countryById.get(u.sovereignId);

			const role = countryObj?.role || "OFFENSE";

			if (countryObj) {
				if (countryObj.buffState === "buff") teamMult = 2.5;
				else if (countryObj.buffState === "super") teamMult = 8.0;
				else if (countryObj.buffState === "godly") {
					teamMult = 45.0;
					r *= 0.5;
				} else if (countryObj.buffState === "weakened") teamMult = 0.7;
				else if (countryObj.buffState === "crippled") teamMult = 0.4;

				// Apply continuous attack modifier to influence strength as well
				const atkPct =
					typeof countryObj.attackBuffPercent === "number"
						? countryObj.attackBuffPercent
						: 0;
				const atkFactor = 1 + atkPct / 100;
				if (atkFactor > 0) teamMult *= atkFactor;
			}

			if (u.victoryBoostTicks > 0) {
				teamMult *= 3.0; // Buffed influence capture power
				r *= 1.4; // Increased capture radius
			}
			// Naval units exert less influence on territory capture than land units.
			if (isAtSea) teamMult *= 0.4;
			teamMult *= runtime.getLiveFormationStrength(u);

			// Organic Push: Randomize push intensity per unit to create ragged, non-linear salients
			const organicNoise =
				0.8 + Math.sin(u.id * 1000 + runtime._simTickCount * 0.05) * 0.4;
			const delta = baseInfluence * teamMult * organicNoise * influenceStride;
			const mySideIdx = u.sideIndex;

			// Ragged Frontiers: Perturb the influence radius slightly to create "fingers" and "bubbles"
			const rVar =
				r * (0.9 + Math.sin(u.id * 500 + runtime._simTickCount * 0.1) * 0.2);
			const radiusSq = rVar * rVar;
			const concentrationBonus = Math.min(2.5, (u.lastAllyCount || 1) / 5);

			const hostileSideIndices =
				runtime._influenceHostileSideIndices[mySideIdx];
			const myInfluenceMap = runtime.sideInfluenceMaps[mySideIdx];

			const startLat = Math.max(
				0,
				Math.floor((u.lat - rVar + 90) / runtime.CONFIG.GRID_RES),
			);
			const endLat = Math.min(
				runtime.gridHeight - 1,
				Math.floor((u.lat + rVar + 90) / runtime.CONFIG.GRID_RES),
			);
			const startLng = Math.max(
				0,
				Math.floor((u.lng - rVar + 180) / runtime.CONFIG.GRID_RES),
			);
			const endLng = Math.min(
				runtime.gridWidth - 1,
				Math.floor((u.lng + rVar + 180) / runtime.CONFIG.GRID_RES),
			);

			for (let y = startLat; y <= endLat; y++) {
				const deltaLat = u.lat - (y * runtime.CONFIG.GRID_RES - 90);
				const deltaLatSq = deltaLat * deltaLat;
				const rowOffset = y * runtime.gridWidth;
				for (let x = startLng; x <= endLng; x++) {
					const idx = rowOffset + x;
					if (runtime.landMask[idx] !== 2) continue;
					const previousControllerSide = runtime.dominantSideMap[idx];
					const deltaLng = u.lng - (x * runtime.CONFIG.GRID_RES - 180);
					const dSq = deltaLatSq + deltaLng * deltaLng;
					if (dSq >= radiusSq) continue;

					// City Resistance: Cells containing cities are much harder for frontlines to pass through
					let cellDelta = delta;
					if (cityGridIndexSet.has(idx)) cellDelta *= 0.35;

					{
						const dist = Math.sqrt(dSq);
						// Strategic Concentration: Units push harder when clustered or in spearheads
						const weight = (1 - dist / rVar) ** 2.0 * concentrationBonus;

						const curInfluence = readInfluence(myInfluenceMap, idx);
						let newInfluence = curInfluence + Math.abs(cellDelta) * weight;
						if (newInfluence > 1) newInfluence = 1;

						const ownerId = runtime.worldControlMap[idx];
						const ownerSideIdx = countryToSideMap.get(ownerId);
						if (
							ownerSideIdx !== undefined &&
							ownerSideIdx !== mySideIdx &&
							!runtime.areSidesHostile(mySideIdx, ownerSideIdx)
						) {
							continue;
						}
						const isOwnerAlly =
							sideAllyIdSets[u.sideIndex] &&
							sideAllyIdSets[u.sideIndex].has(ownerId);

						// If owner is a SUPPORT nation on the other side and we are OFFENSE, don't invade (skip influence)
						// unless we already have established some occupation in that cell.
						if (!isOwnerAlly && ownerId > 0 && role === "OFFENSE") {
							if (ownerSideIdx !== undefined && ownerSideIdx !== u.sideIndex) {
								if (sideSupportIdSets[ownerSideIdx]?.has(ownerId)) {
									const curOcc = runtime.occupationMap[idx];
									const isAlreadyInvaded = Math.abs(curOcc) > 0.1;
									if (!isAlreadyInvaded) continue;
								}
							}
						}

						const currentOccupierId = runtime.primaryOccupierMap[idx];

						if (!isOwnerAlly) {
							const creditToId = u.beneficiaryId || u.sovereignId;
							const currentOccSideIdx = countryToSideMap.get(currentOccupierId);
							const isCurrentOccAlly =
								currentOccSideIdx !== undefined &&
								currentOccSideIdx === u.sideIndex;

							if (!isCurrentOccAlly) {
								const bestAllyId = selectInfluenceNeighborCredit(
									x,
									y,
									u.sideIndex,
									countryToSideMap,
								);

								const finalCreditId = bestAllyId || creditToId;
								if (newInfluence > 0.05 || currentOccupierId === 0) {
									runtime.primaryOccupierMap[idx] = finalCreditId;
								}
							}
						}

						writeInfluence(myInfluenceMap, idx, newInfluence);
						// Decay opposing sides' influence when we enter a cell
						let touchedHostileInfluence = false;
						for (
							let hostileIndex = 0;
							hostileIndex < hostileSideIndices.length;
							hostileIndex++
						) {
							const sideIndex = hostileSideIndices[hostileIndex];
							const hostileInfluenceMap = runtime.sideInfluenceMaps[sideIndex];
							const hostileInfluence = readInfluence(hostileInfluenceMap, idx);
							if (hostileInfluence > 0) {
								touchedHostileInfluence = true;
								writeInfluence(
									hostileInfluenceMap,
									idx,
									Math.max(0, hostileInfluence - cellDelta * 0.5),
								);
							}
						}
						// De-jure owner reclaim bonus: 1.5x influence when retaking own territory
						if (runtime.worldControlMap[idx] === u.sovereignId) {
							multiplyInfluence(myInfluenceMap, idx, 1.5);
						}
						runtime.syncOccupationFromSideInfluence(idx);
						if (runtime.primaryOccupierMap[idx] !== currentOccupierId) {
							runtime._territoryLedger?.markControllerChange(idx);
							runtime.influenceLayer?.notifyControlCellsChanged(idx);
							queueInfluenceFrontierCell(idx, true);
						} else if (
							touchedHostileInfluence ||
							previousControllerSide !== mySideIdx ||
							isInfluenceFrontierIndex(idx)
						) {
							queueInfluenceFrontierCell(idx);
						}
					}
				}
			}
		}
	}
	return {
		refreshInfluenceLookupCaches,
		ensureInfluenceFrontierQueue,
		enqueueInfluenceFrontierIndex,
		queueInfluenceFrontierCell,
		isInfluenceFrontierIndex,
		processInfluenceFrontierDiffusion,
		selectInfluenceNeighborCredit,
		updatePersistentInfluence,
	};
}
