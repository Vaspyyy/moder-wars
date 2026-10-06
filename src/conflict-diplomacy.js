// Explicit live context keeps replacements of arrays/state visible across awaits and callbacks.
export function createConflictDiplomacy(runtime) {
	function unilateralExitConflict(country, sideIdx) {
		if (sideIdx === -1) return;
		runtime.releaseCountryPersonnelFromSide(country.id, sideIdx);

		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.landMask[i] !== 2) continue;

			const ownerId = runtime.worldControlMap[i];
			const occupierId = runtime.primaryOccupierMap[i];

			if (occupierId === country.id) {
				if (runtime.dominantSideMap[i] === sideIdx) {
					runtime.worldControlMap[i] = country.id;
				}
				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
				runtime.primaryOccupierMap[i] = 0;
			} else if (ownerId === country.id) {
				if (
					runtime.dominantSideMap[i] !== -1 &&
					runtime.dominantSideMap[i] !== sideIdx
				) {
					runtime.worldControlMap[i] = occupierId > 0 ? occupierId : ownerId;
				}
				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
				runtime.primaryOccupierMap[i] = 0;
			}
		}

		// Remove from sides
		const side = runtime.sides[sideIdx];
		const idx = side.findIndex((c) => c.id === country.id);
		if (idx > -1) side.splice(idx, 1);

		// Purge units
		runtime.removeCountryFormations(country.id);

		// Global cleanup for neutral land that might be stuck in war state
		const combatantIds = new Set(runtime.sides.flat().map((c) => c.id));
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (
				runtime.landMask[i] === 2 &&
				!combatantIds.has(runtime.worldControlMap[i]) &&
				Math.abs(runtime.occupationMap[i]) < 0.01
			) {
				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
				runtime.primaryOccupierMap[i] = 0;
			}
		}

		runtime.generateProvinces();
		runtime.recalculateAllBounds();
		runtime.updateSidesUI();
		runtime.influenceLayer.render();

		runtime.playPeaceSound();
		runtime.statusText.innerText = `${country.name} has exited the conflict and annexed occupied land.`;

		const activePoles = new Set();
		runtime.sides.forEach((s, idx) => {
			if (s.length > 0) activePoles.add(idx);
		});
		runtime.reconcileOperationalAiLifecycle("country-withdrew");

		if (activePoles.size < 2) {
			runtime.applyTreaty("PEACE_TREATY");
		}
	}

	function _signSelectiveSideExit(sideIdx) {
		const side = runtime.sides[sideIdx];
		if (!side || side.length === 0) return;

		runtime._lastCapitulationTick = runtime._simTickCount;
		const exitingIds = new Set(side.map((c) => c.id));
		// The formations and reserves leave the active war, while initial strength
		runtime.sideSoldiers[sideIdx] = 0;
		runtime.sideRecruitableManpower[sideIdx] = 0;

		// Clean up territory controlled by exiting side
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.landMask[i] !== 2) continue;
			const ownerId = runtime.worldControlMap[i];
			const occupierId = runtime.primaryOccupierMap[i];
			const ds = runtime.dominantSideMap[i];

			if (exitingIds.has(ownerId)) {
				if (ds !== -1 && ds !== sideIdx) {
					runtime.worldControlMap[i] =
						occupierId > 0 && !exitingIds.has(occupierId)
							? occupierId
							: occupierId > 0
								? occupierId
								: ownerId;
				}
				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
				runtime.primaryOccupierMap[i] = 0;
			} else if (exitingIds.has(occupierId)) {
				if (ds === sideIdx) {
					runtime.worldControlMap[i] = ownerId;
					runtime.landMask[i] = 1;
					runtime.clearCellInfluence(i);
				} else {
					runtime.clearCellInfluence(i);
				}
				runtime.primaryOccupierMap[i] = 0;
			}
		}

		// Remove all countries from this side
		runtime.sides[sideIdx] = [];

		// Clear all war plans for the exiting side
		runtime.clearSideLandPlanSlots(sideIdx);
		if (sideIdx < runtime._navalPlan.length) runtime._navalPlan[sideIdx] = null;
		if (sideIdx < runtime._navalSupplyPlan.length)
			runtime._navalSupplyPlan[sideIdx] = null;
		if (sideIdx < runtime._transportPlan.length)
			runtime._transportPlan[sideIdx] = null;
		if (sideIdx < runtime._planReassessNeeded.length)
			runtime._planReassessNeeded[sideIdx] = false;

		// Purge units belonging to exiting nations
		runtime.units = runtime.units.filter((u) => !exitingIds.has(u.sovereignId));
		runtime.units.forEach((u) => {
			if (exitingIds.has(u.beneficiaryId)) u.beneficiaryId = u.sovereignId;
		});

		// Check if war is over
		const activePoles = new Set();
		runtime.sides.forEach((s, idx) => {
			if (s.length > 0) activePoles.add(idx);
		});
		runtime.reconcileOperationalAiLifecycle("side-withdrew");

		if (activePoles.size < 2) {
			runtime.applyTreaty("PEACE_TREATY");
		} else {
			runtime.playPeaceSound();
			runtime.gameState = "SIMULATING";
			runtime.statusText.innerText =
				"Separate peace signed. Conflict continues.";
			cancelAnimationFrame(runtime.animationFrameId);
			requestAnimationFrame(runtime.updateLoop);
		}
	}

	// `withdrawing` leaves the war; land it lost to the opposing side goes to the
	// occupier (or `opponent`), and land it holds of others returns to peace.
	function _signSelectivePeace(opponent, withdrawing) {
		let opponentSideIdx = -1;
		let withdrawingSideIdx = -1;

		runtime.sides.forEach((s, i) => {
			if (s.some((c) => c.id === opponent.id)) opponentSideIdx = i;
			if (s.some((c) => c.id === withdrawing.id)) withdrawingSideIdx = i;
		});

		if (
			opponentSideIdx === -1 ||
			withdrawingSideIdx === -1 ||
			opponentSideIdx === withdrawingSideIdx
		) {
			alert("Diplomatic error: Negotiating nations must be on opposing sides.");
			runtime.gameState = "SIMULATING";
			runtime.statusText.innerText = "Conflict Continued";
			requestAnimationFrame(runtime.updateLoop);
			return;
		}
		runtime.releaseCountryPersonnelFromSide(withdrawing.id, withdrawingSideIdx);

		// Countries whose borders this peace redraws; smoothing touches nobody else.
		const involvedIds = new Set([opponent.id, withdrawing.id]);
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.landMask[i] !== 2) continue;

			const ownerId = runtime.worldControlMap[i];
			const occupierId = runtime.primaryOccupierMap[i];
			const ds = runtime.dominantSideMap[i];

			if (ownerId === withdrawing.id) {
				if (ds !== -1 && ds !== withdrawingSideIdx) {
					// Annexation: Give land to the specific occupier
					const recipientId = occupierId > 0 ? occupierId : opponent.id;
					runtime.worldControlMap[i] = recipientId;
					involvedIds.add(recipientId);
				}
				// Its own unoccupied land leaves the war zone with it.
				runtime.landMask[i] = 1;
				runtime.clearCellInfluence(i);
				runtime.primaryOccupierMap[i] = 0;
			}
			// Land the withdrawing nation holds of others is annexed by it
			else if (occupierId === withdrawing.id) {
				if (ds === withdrawingSideIdx) {
					runtime.worldControlMap[i] = withdrawing.id;
					runtime.landMask[i] = 1;
					runtime.clearCellInfluence(i);
					involvedIds.add(ownerId);
				} else {
					runtime.clearCellInfluence(i);
				}
				runtime.primaryOccupierMap[i] = 0;
			}
		}

		// 2. Remove the withdrawing country from its alliance list
		const withdrawingSide = runtime.sides[withdrawingSideIdx];
		const idx = withdrawingSide.findIndex((c) => c.id === withdrawing.id);
		if (idx > -1) withdrawingSide.splice(idx, 1);

		// 3. Purge units belonging to the withdrawing nation
		runtime.removeCountryFormations(withdrawing.id);

		// 4. Final Sweep: Stabilize land owned by nations no longer in the war
		const combatantIds = new Set(runtime.sides.flat().map((c) => c.id));
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.landMask[i] === 2) {
				const ownerId = runtime.worldControlMap[i];
				// If owner is not a combatant AND no one else is currently occupying it, stabilize it
				if (
					!combatantIds.has(ownerId) &&
					Math.abs(runtime.occupationMap[i]) < 0.01
				) {
					runtime.landMask[i] = 1;
					runtime.clearCellInfluence(i);
					runtime.primaryOccupierMap[i] = 0;
				}
			}
		}

		// 5. Separate Peace Smoothing Pass between the countries it redrew
		const smoothingPasses = 2;
		for (let p = 0; p < smoothingPasses; p++) {
			const tempMap = new Uint16Array(runtime.worldControlMap);
			const uniqueIds = new Int32Array(9);
			const idCounts = new Int32Array(9);

			for (let y = 1; y < runtime.gridHeight - 1; y++) {
				const rowIdx = y * runtime.gridWidth;
				for (let x = 1; x < runtime.gridWidth - 1; x++) {
					const i = rowIdx + x;
					if (runtime.landMask[i] !== 1) continue;
					if (!involvedIds.has(runtime.worldControlMap[i])) continue;

					uniqueIds.fill(0);
					idCounts.fill(0);
					let numUnique = 0;

					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							const nId =
								runtime.worldControlMap[i + dy * runtime.gridWidth + dx];
							if (nId > 0) {
								let found = false;
								for (let k = 0; k < numUnique; k++) {
									if (uniqueIds[k] === nId) {
										idCounts[k]++;
										found = true;
										break;
									}
								}
								if (!found && numUnique < 9) {
									uniqueIds[numUnique] = nId;
									idCounts[numUnique] = 1;
									numUnique++;
								}
							}
						}
					}

					let bestId = runtime.worldControlMap[i];
					let maxC = 0;
					for (let k = 0; k < numUnique; k++) {
						if (idCounts[k] > maxC) {
							maxC = idCounts[k];
							bestId = uniqueIds[k];
						}
					}
					if (maxC >= 5 && involvedIds.has(bestId)) tempMap[i] = bestId;
				}
			}
			runtime.worldControlMap.set(tempMap);
		}

		// 6. Update UI and check for total conflict end
		runtime.generateProvinces();
		runtime.recalculateAllBounds();
		runtime.updateSidesUI();
		runtime.influenceLayer.render();

		const activePoles = new Set();
		runtime.sides.forEach((side, idx) => {
			if (side.length > 0) activePoles.add(idx);
		});
		runtime.reconcileOperationalAiLifecycle("separate-peace");

		if (activePoles.size < 2) {
			runtime.applyTreaty("PEACE_TREATY");
		} else {
			runtime.playPeaceSound();
			runtime.gameState = "SIMULATING";
			runtime.statusText.innerText = `${withdrawing.name} signed separate peace. Conflict continues.`;
			cancelAnimationFrame(runtime.animationFrameId);
			requestAnimationFrame(runtime.updateLoop);
		}
	}
	return {
		unilateralExitConflict,
		_signSelectiveSideExit,
		_signSelectivePeace,
	};
}
