import { writeInfluence } from "./influence-grid.js";
// Explicit live context keeps replacements of arrays/state visible across awaits and callbacks.
export function createConflictResolution(runtime) {
	function capitulateCountry(country, sideIndex) {
		const side = runtime.sides[sideIndex];
		if (!side) return false;

		// Build owner -> side index map once for this operation
		const ownerToSideMap = new Map();
		runtime.sides.forEach((s, idx) => {
			s.forEach((c) => {
				ownerToSideMap.set(c.id, idx);
			});
		});

		const hostileAttackerIds = new Set();
		for (
			let otherSideIdx = 0;
			otherSideIdx < runtime.sides.length;
			otherSideIdx++
		) {
			if (!runtime.areSidesHostile(sideIndex, otherSideIdx)) continue;
			for (const attacker of runtime.sides[otherSideIdx] || []) {
				hostileAttackerIds.add(attacker.id);
			}
		}
		if (hostileAttackerIds.size === 0) {
			console.error("[MW] CAPITULATION ABORTED: no active hostile recipient", {
				countryId: country.id,
				countryName: country.name,
			});
			return false;
		}

		const attackerMap = runtime.casualtyByAttacker.get(country.id) || new Map();
		const activeAttackerEntries = Array.from(
			hostileAttackerIds,
			(countryId) => ({
				countryId,
				casualties: Math.max(0, attackerMap.get(countryId) || 0),
			}),
		);
		let selectedAttackers = runtime.selectEligibleCasualtyAttackers(
			activeAttackerEntries,
		);

		// Snapshot the victim's owned land, find its de-jure center, and count which
		// active enemies already physically control its de-jure territory.
		const victimTerritorySnapshot = [];
		const victimOwnedCells = [];
		const physicalControlCounts = new Map();
		let victimLatSum = 0;
		let victimLngSum = 0;
		let victimCoreCount = 0;
		let totalUnoccupied = 0;
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.deJureMap[i] === country.id && runtime.landMask[i] > 0) {
				const y = Math.floor(i / runtime.gridWidth);
				const x = i % runtime.gridWidth;
				victimLatSum += y * runtime.CONFIG.GRID_RES - 90;
				victimLngSum += x * runtime.CONFIG.GRID_RES - 180;
				victimCoreCount++;
				const controllerId =
					runtime.primaryOccupierMap[i] || runtime.worldControlMap[i];
				if (hostileAttackerIds.has(controllerId)) {
					physicalControlCounts.set(
						controllerId,
						(physicalControlCounts.get(controllerId) || 0) + 1,
					);
				}
			}
			if (
				runtime.worldControlMap[i] === country.id &&
				runtime.landMask[i] > 0
			) {
				const y = Math.floor(i / runtime.gridWidth);
				const x = i % runtime.gridWidth;
				victimTerritorySnapshot.push([x, y]);
				victimOwnedCells.push(i);
				if (!hostileAttackerIds.has(runtime.primaryOccupierMap[i]))
					totalUnoccupied++;
			}
		}

		if (selectedAttackers.length === 0) {
			const physicalController = runtime.selectOccupationController(
				Array.from(physicalControlCounts, ([countryId, controlledCells]) => ({
					countryId,
					controlledCells,
					casualties: attackerMap.get(countryId) || 0,
				})),
			);
			if (physicalController) {
				selectedAttackers = [
					{
						countryId: physicalController.countryId,
						casualties: physicalController.casualties,
						share: 1,
					},
				];
			} else {
				const center = {
					lat: victimCoreCount > 0 ? victimLatSum / victimCoreCount : 0,
					lng: victimCoreCount > 0 ? victimLngSum / victimCoreCount : 0,
				};
				let nearest = null;
				let nearestDist = Infinity;
				for (const unit of runtime.units) {
					if (!hostileAttackerIds.has(unit.sovereignId) || unit.health <= 0)
						continue;
					const dLng = runtime.normalizeLongitudeDelta(unit.lng - center.lng);
					const dSq = (unit.lat - center.lat) ** 2 + dLng ** 2;
					if (
						dSq < nearestDist ||
						(dSq === nearestDist &&
							unit.sovereignId < (nearest?.countryId || Infinity))
					) {
						nearestDist = dSq;
						nearest = {
							countryId: unit.sovereignId,
							casualties: attackerMap.get(unit.sovereignId) || 0,
							share: 1,
						};
					}
				}
				if (nearest) selectedAttackers = [nearest];
			}
		}

		if (selectedAttackers.length === 0) {
			console.error("[MW] CAPITULATION ABORTED: no deterministic recipient", {
				countryId: country.id,
				countryName: country.name,
				hostileAttackerIds: Array.from(hostileAttackerIds),
			});
			return false;
		}

		const quotaEntries = runtime.allocateLargestRemainderQuotas(
			selectedAttackers.map((entry) => ({
				...entry,
				weight: entry.casualties || entry.share || 1,
			})),
			totalUnoccupied,
		);
		const qualifyingAttackers = quotaEntries.map((entry) => ({
			sovereignId: entry.countryId,
			loss: entry.casualties || 0,
			share: entry.share || 0,
			quota: entry.quota,
		}));
		const qualifyingIds = new Set(
			qualifyingAttackers.map((entry) => entry.sovereignId),
		);

		// Compute attacker centroids in one map pass.
		const attackerCentroids = new Map();
		for (const attacker of qualifyingAttackers) {
			attackerCentroids.set(attacker.sovereignId, {
				latSum: 0,
				lngSum: 0,
				count: 0,
			});
		}
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			const ownerId = runtime.worldControlMap[i];
			if (!qualifyingIds.has(ownerId)) continue;
			const centroid = attackerCentroids.get(ownerId);
			const y = Math.floor(i / runtime.gridWidth);
			const x = i % runtime.gridWidth;
			centroid.latSum += y * runtime.CONFIG.GRID_RES - 90;
			centroid.lngSum += x * runtime.CONFIG.GRID_RES - 180;
			centroid.count++;
		}
		for (const [attackerId, centroid] of attackerCentroids) {
			if (centroid.count > 0) {
				attackerCentroids.set(attackerId, {
					lat: centroid.latSum / centroid.count,
					lng: centroid.lngSum / centroid.count,
				});
			} else {
				attackerCentroids.set(attackerId, {
					lat: victimCoreCount > 0 ? victimLatSum / victimCoreCount : 0,
					lng: victimCoreCount > 0 ? victimLngSum / victimCoreCount : 0,
				});
			}
		}

		const attackerTileCounts = new Map();
		const attackerQuotas = new Map();
		for (const attacker of qualifyingAttackers) {
			attackerTileCounts.set(attacker.sovereignId, 0);
			attackerQuotas.set(attacker.sovereignId, attacker.quota);
		}
		const assignments = new Map();
		for (const idx of victimOwnedCells) {
			const occupierId = runtime.primaryOccupierMap[idx];
			if (hostileAttackerIds.has(occupierId)) {
				assignments.set(idx, occupierId);
				continue;
			}
			const y = Math.floor(idx / runtime.gridWidth);
			const x = idx % runtime.gridWidth;
			const tileLat = y * runtime.CONFIG.GRID_RES - 90;
			const tileLng = x * runtime.CONFIG.GRID_RES - 180;
			let bestAttacker = 0;
			let bestDist = Infinity;
			for (const attacker of qualifyingAttackers) {
				const quota = attackerQuotas.get(attacker.sovereignId) || 0;
				const used = attackerTileCounts.get(attacker.sovereignId) || 0;
				if (used >= quota) continue;
				const centroid = attackerCentroids.get(attacker.sovereignId);
				const dLng = runtime.normalizeLongitudeDelta(tileLng - centroid.lng);
				const dSq = (tileLat - centroid.lat) ** 2 + dLng ** 2;
				if (
					dSq < bestDist ||
					(dSq === bestDist && attacker.sovereignId < bestAttacker)
				) {
					bestDist = dSq;
					bestAttacker = attacker.sovereignId;
				}
			}
			if (bestAttacker <= 0) {
				console.error("[MW] CAPITULATION ABORTED: incomplete land quotas", {
					countryId: country.id,
					cellIndex: idx,
					totalUnoccupied,
				});
				return false;
			}
			assignments.set(idx, bestAttacker);
			attackerTileCounts.set(
				bestAttacker,
				(attackerTileCounts.get(bestAttacker) || 0) + 1,
			);
		}

		for (const [idx, recipientId] of assignments) {
			runtime.worldControlMap[idx] = recipientId;
			runtime.primaryOccupierMap[idx] = recipientId;
		}
		const affectedIndices = victimOwnedCells;

		const finalControlCounts = new Map();
		for (let i = 0; i < runtime.deJureMap.length; i++) {
			if (runtime.deJureMap[i] !== country.id || runtime.landMask[i] === 0)
				continue;
			const controllerId = runtime.worldControlMap[i];
			if (!hostileAttackerIds.has(controllerId)) continue;
			finalControlCounts.set(
				controllerId,
				(finalControlCounts.get(controllerId) || 0) + 1,
			);
		}
		const primaryController = runtime.selectOccupationController(
			Array.from(hostileAttackerIds, (countryId) => ({
				countryId,
				controlledCells: finalControlCounts.get(countryId) || 0,
				casualties: attackerMap.get(countryId) || 0,
			})),
		);
		const primaryAnnexerId =
			primaryController?.countryId || qualifyingAttackers[0]?.sovereignId || 0;
		if (primaryAnnexerId <= 0) {
			console.error("[MW] CAPITULATION ABORTED: no occupation controller", {
				countryId: country.id,
			});
			return false;
		}

		runtime._lastCapitulationTick = runtime._simTickCount;
		runtime.presentCapitulation?.(country);

		// Re-evaluate warzone status for newly annexed tiles so winners can keep pushing
		affectedIndices.forEach((idx) => {
			const ownerId = runtime.worldControlMap[idx];
			if (ownerId <= 0) {
				runtime.landMask[idx] = 1;
				for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
					writeInfluence(runtime.sideInfluenceMaps[s], idx, 0);
				runtime.syncOccupationFromSideInfluence(idx);
				runtime.primaryOccupierMap[idx] = 0;
				return;
			}

			const ownerSideIdx = ownerToSideMap.get(ownerId);
			if (
				ownerSideIdx !== undefined &&
				ownerSideIdx < runtime.sideInfluenceMaps.length &&
				runtime.sides[ownerSideIdx].length > 0
			) {
				runtime.landMask[idx] = 2;
				for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
					writeInfluence(runtime.sideInfluenceMaps[s], idx, 0);
				writeInfluence(runtime.sideInfluenceMaps[ownerSideIdx], idx, 1.0);
				runtime.syncOccupationFromSideInfluence(idx);
				runtime.primaryOccupierMap[idx] = ownerId;
			} else {
				// Keep warzone if the cell still has occupation from a combatant side
				const hasOccupation = runtime.dominantSideMap[idx] !== -1;
				runtime.landMask[idx] = hasOccupation ? 2 : 1;
				if (!hasOccupation) {
					for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
						writeInfluence(runtime.sideInfluenceMaps[s], idx, 0);
					runtime.syncOccupationFromSideInfluence(idx);
				}
				runtime.primaryOccupierMap[idx] = 0;
			}
		});

		// RELEASABLE TRANSFER: Transfer any releasables owned by the capitulating country to the primary annexer
		runtime.countryMetadata.forEach((m) => {
			if (m && m.releasableBy === country.id) {
				m.releasableBy = primaryAnnexerId;
			}
		});

		// Make the capitulated country itself a releasable of the annexer and remember its old territory
		if (primaryAnnexerId > 0) {
			const victimMeta = runtime.countryMetadata[country.id - 1];
			if (victimMeta) {
				victimMeta.releasableBy = primaryAnnexerId;

				// Prefer the precise snapshot we made before any transfer; if empty, fall back to deJure cores
				if (victimTerritorySnapshot.length > 0) {
					victimMeta.savedCells = victimTerritorySnapshot;
				} else {
					const cells = [];
					for (let i = 0; i < runtime.deJureMap.length; i++) {
						if (runtime.deJureMap[i] === country.id) {
							const y = Math.floor(i / runtime.gridWidth);
							const x = i % runtime.gridWidth;
							cells.push([x, y]);
						}
					}
					victimMeta.savedCells = cells;
				}
			}
		}

		runtime.releaseCountryPersonnelFromSide(country.id, sideIndex);

		// Remove the country from its alliance list
		const cIdx = side.indexOf(country);
		if (cIdx > -1) side.splice(cIdx, 1);

		// Clear targets for any units that were focusing on this specific country's theater
		runtime.units.forEach((u) => {
			if (u.lastMopUpId === country.id) {
				u.mopUpTarget = null;
				u.lastMopUpId = null;
				u.targetSearchCooldown = 0;
			}
		});

		// Filter out all units belonging to the capitulated nation
		runtime.units = runtime.units.filter((u) => u.sovereignId !== country.id);

		// Sync provinces to new ownership
		runtime.generateProvinces();

		// Invalidate caches so the frontline field and adjacency reflect new borders
		runtime.adjacencyCache = null;
		runtime.invalidateFrontlineField();
		runtime._frontlinePolys = {};
		runtime._neutralBorderPolys = {};
		runtime._frontlinePolyTick = -999;

		// Refresh UI
		runtime.reconcileOperationalAiLifecycle("capitulation");
		runtime.onConflictMapChanged?.();
		return true;
	}

	function applyTreaty(
		type,
		winnerPoleOverride = null,
		_endingReasonOverride = null,
	) {
		if (runtime.gameState === "WAR_OVER") return;
		runtime.invalidateWarLifecycleTimers();
		runtime.gameState = "WAR_OVER";
		runtime.gameTimeEnabled = false;
		runtime.gameTimeAccumulatorMs = 0;
		runtime.presentTreatyStart?.();

		const sideTerritory = new Array(runtime.sides.length).fill(0);
		for (let i = 0; i < runtime.dominantSideMap.length; i++) {
			if (runtime.landMask[i] === 2) {
				const ds = runtime.dominantSideMap[i];
				if (ds >= 0 && ds < runtime.sides.length) sideTerritory[ds]++;
			}
		}

		let winnerSideIdx = sideTerritory.indexOf(Math.max(...sideTerritory));
		if (typeof winnerPoleOverride === "number" && winnerPoleOverride >= 0)
			winnerSideIdx = winnerPoleOverride;

		let winnerName = "The Winner";
		const sideUnitCounts = runtime.sides.map((s, i) => ({
			idx: i,
			units: runtime.units.filter((u) => u.sideIndex === i).length,
			side: s,
		}));

		const strongestWinner = sideUnitCounts
			.filter((s) => s.idx === winnerSideIdx)
			.sort((a, b) => b.units - a.units)[0];
		winnerName = strongestWinner?.side[0]
			? strongestWinner.side.length > 1
				? `${strongestWinner.side[0].name} Allies`
				: strongestWinner.side[0].name
			: runtime.getSideDisplayName?.(winnerSideIdx) ||
				`Side ${String.fromCharCode(65 + winnerSideIdx)}`;

		const isTotalCapitulation =
			type.includes("FULL_CAPITULATION") || type === "ANNEXATION";
		const isNegotiatedPeace = type === "PEACE_TREATY";

		const loserNames = runtime.sides
			.filter(
				(side, index) =>
					runtime.areSidesHostile(winnerSideIdx, index) && side.length > 0,
			)
			.map((side) => side[0]?.name || "Unknown")
			.join(", ");
		runtime.presentTreatyNotice?.({
			type,
			winnerName,
			loserNames,
			isTotalCapitulation,
			isNegotiatedPeace,
		});

		const countryToSideMap = new Map();
		runtime.sides.forEach((side, idx) => {
			side.forEach((c) => {
				countryToSideMap.set(c.id, idx);
			});
		});

		const treatyTransfers = [];
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.landMask[i] === 2) {
				const originalOwner = runtime.worldControlMap[i];
				const occupierId = runtime.primaryOccupierMap[i];
				const ds = runtime.dominantSideMap[i];
				const occupierSideIdx = countryToSideMap.get(occupierId);
				const ownerSideIdx = countryToSideMap.get(originalOwner);

				let cellNewOwner = originalOwner;
				if (
					ds >= 0 &&
					ownerSideIdx !== undefined &&
					runtime.areSidesHostile(ownerSideIdx, ds)
				) {
					cellNewOwner =
						occupierSideIdx !== undefined && occupierSideIdx === ds
							? occupierId
							: runtime.sides[ds]?.[0]?.id || originalOwner;
				}

				if (cellNewOwner !== originalOwner && cellNewOwner > 0) {
					runtime.worldControlMap[i] = cellNewOwner;
				}

				if (isTotalCapitulation) {
					const currentOwner = runtime.worldControlMap[i];
					const currentSideIdx = countryToSideMap.get(currentOwner);

					let newOwnerId = 0;
					if (
						currentSideIdx !== undefined &&
						runtime.areSidesHostile(winnerSideIdx, currentSideIdx)
					) {
						newOwnerId =
							occupierSideIdx !== undefined && occupierSideIdx === winnerSideIdx
								? occupierId
								: runtime.sides[winnerSideIdx]?.[0]?.id || 0;
					}

					if (newOwnerId > 0) {
						runtime.worldControlMap[i] = newOwnerId;
					}
				}
				const deJureOwner = runtime.deJureMap[i];
				const finalOwner = runtime.worldControlMap[i];
				if (deJureOwner > 0 && finalOwner > 0 && deJureOwner !== finalOwner) {
					treatyTransfers.push({
						originalOwner: deJureOwner,
						newOwner: finalOwner,
					});
				}

				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
			}
		}

		// Re-sync province map to final treaty borders to remove ghost province lines
		runtime.generateProvinces();

		// High-Performance Organic Border Smoothing: Uses frequency array to avoid GC pressure
		const smoothingPasses = 3;
		const maxId = runtime.countryMetadata.reduce(
			(max, m) => (m ? Math.max(max, m.id) : max),
			0,
		);
		// Static buffers to avoid re-allocation in loops
		const freq = new Uint16Array(maxId + 1);
		const activeIds = new Uint32Array(9);

		// Transfer Releasables: Move all releasables belonging to defeated countries to their new primary owners
		const ownerTransferMap =
			runtime.selectMajorityOwnerTransfers(treatyTransfers);
		runtime.countryMetadata.forEach((m) => {
			if (m?.releasableBy && ownerTransferMap.has(m.releasableBy)) {
				m.releasableBy = ownerTransferMap.get(m.releasableBy);
			}
		});

		for (let p = 0; p < smoothingPasses; p++) {
			const tempMap = new Uint16Array(runtime.worldControlMap);
			for (let y = 1; y < runtime.gridHeight - 1; y++) {
				const rowIdx = y * runtime.gridWidth;
				for (let x = 1; x < runtime.gridWidth - 1; x++) {
					const idx = rowIdx + x;
					if (runtime.landMask[idx] === 0) continue;

					let activeCount = 0;
					let maxFreq = 0;
					let winner = runtime.worldControlMap[idx];

					// Sample 3x3 neighborhood
					for (let dy = -1; dy <= 1; dy++) {
						const rOff = dy * runtime.gridWidth;
						for (let dx = -1; dx <= 1; dx++) {
							const owner = runtime.worldControlMap[idx + rOff + dx];
							if (owner > 0) {
								if (freq[owner] === 0) activeIds[activeCount++] = owner;
								freq[owner]++;
								if (freq[owner] > maxFreq) {
									maxFreq = freq[owner];
									winner = owner;
								}
							}
						}
					}

					// Apply majority rule
					if (maxFreq >= 6) tempMap[idx] = winner;

					// Cleanup frequency array for next pixel
					for (let i = 0; i < activeCount; i++) freq[activeIds[i]] = 0;
				}
			}
			runtime.worldControlMap.set(tempMap);
		}
		runtime.adjacencyCache = null;

		runtime.onConflictMapChanged?.();
		runtime.presentTreatyFinished?.();
	}
	return { capitulateCountry, applyTreaty };
}
