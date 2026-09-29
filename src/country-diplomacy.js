// Dependencies are supplied by the application; this module does not import it.
export function createCountryDiplomacy(runtime) {
	function openReleaseModal(releaserId, sideIdx) {
		const releasables = runtime.countryMetadata.filter(
			(m) => m && m.releasableBy === releaserId,
		);
		if (releasables.length === 0) return;

		runtime.releasableListContainer.innerHTML = releasables
			.map((m) => {
				if (!Number.isFinite(m.id)) return "";
				const safeId = Number(m.id);
				const safeName = runtime.escapeHtml(m.name);
				const safeFlagUrl = runtime.escapeHtml(m.flagUrl || "");
				return `
        <button class="menu-card" style="padding: 10px; width: 100%; text-align: left;" data-release-nation-id="${safeId}" data-release-releaser-id="${releaserId}" data-release-side-idx="${sideIdx}">
            <img src="${safeFlagUrl}" style="width: 30px; height: 18px; object-fit: cover; border: 1px solid #444; margin-right: 10px;">
            <div class="card-body">
                <span class="btn-text" style="font-size: 12px;">${safeName}</span>
            </div>
        </button>
    `;
			})
			.join("");
		runtime.releasableListContainer
			.querySelectorAll("[data-release-nation-id]")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const nationId = Number(btn.dataset.releaseNationId);
					const relId = Number(btn.dataset.releaseReleaserId);
					const sIdx = Number(btn.dataset.releaseSideIdx);
					window.releaseNation(nationId, relId, sIdx);
				});
			});

		runtime.releaseModal.style.display = "flex";
	}

	function _setAsReleasable(releasableId, releaserId) {
		const rMeta = runtime.countryMetadata[releasableId - 1];
		const hostMeta = runtime.countryMetadata[releaserId - 1];
		if (!rMeta || !hostMeta) return;

		rMeta.releasableBy = releaserId;

		// Capture territory snapshot for future restoration.
		// IMPORTANT: Only touch cells that are currently owned by the releasable.
		// This makes it visually look like the host fully annexed the releasable,
		// and we restore exactly these cells on release.
		const cells = [];
		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.worldControlMap[i] === releasableId) {
				const y = Math.floor(i / runtime.gridWidth);
				const x = i % runtime.gridWidth;
				cells.push([x, y]);
				// Hand this land to the host nation for now so it looks annexed
				runtime.worldControlMap[i] = releaserId;
			}
		}
		rMeta.savedCells = cells;

		// Remove from active sides
		runtime.sides.forEach((side) => {
			const idx = side.findIndex((c) => c.id === releasableId);
			if (idx > -1) side.splice(idx, 1);
		});

		runtime.statusText.innerText = `${rMeta.name} is now a releasable of ${hostMeta.name}`;
		runtime.countryInspector.style.display = "none";
		runtime.recalculateAllBounds();
		runtime.updateSidesUI();
		runtime.influenceLayer.render();
	}

	function _setVassalage(vassalId, overlordId) {
		const vassalMeta = runtime.countryMetadata[vassalId - 1];
		if (!vassalMeta) return;

		// Preserve the original flag the first time this country becomes a puppet
		if (!vassalMeta.baseFlagUrl) {
			vassalMeta.baseFlagUrl = vassalMeta.flagUrl || null;
		}

		vassalMeta.overlordId = overlordId;

		// Propagate to sides if active
		runtime.sides
			.flat()
			.filter(Boolean)
			.forEach((c) => {
				if (c.id === vassalId) c.overlordId = overlordId;
			});

		const overlordMeta = runtime.countryMetadata[overlordId - 1];
		runtime.statusText.innerText = `${vassalMeta.name} is now a vassal of ${overlordMeta ? overlordMeta.name : "Unknown"}`;

		// Generate a dynamic half-and-half puppet flag for vassals created after game start
		// (existing historical puppets keep their original flags unless re-vassalized through this function).
		runtime.generatePuppetFlag(vassalId, overlordId);

		runtime.openInspector(vassalId);
		runtime.influenceLayer.render();
	}

	function recruitNewSideMidWar(id) {
		// Create a new independent side and declare war on ALL existing sides
		if (runtime.sides.length >= runtime.MAX_SIDES) return;

		const meta = runtime.countryMetadata[id - 1];
		if (!meta) return;

		const newSideIdx = runtime.sides.length;

		// Remove from any existing side first (shouldn't happen for neutrals, but safety)
		runtime.sides.forEach((side) => {
			const idx = side.findIndex((c) => c.id === id);
			if (idx > -1) side.splice(idx, 1);
		});

		const newCountry = {
			id: id,
			name: meta.name,
			color: meta.color,
			role: "OFFENSE",
			strategy: "BALANCED",
			buffState: meta.buffState || "none",
			overlordId: meta.overlordId || null,
		};

		runtime.rebaseSecondaryWarPlanSlotsForSideAppend(runtime.sides.length);
		runtime.sides.push([newCountry]);
		runtime.ensureSideIdentities();
		for (let otherIdx = 0; otherIdx < newSideIdx; otherIdx++) {
			if (!runtime.sides[otherIdx]?.length) continue;
			runtime.hostileSidePairs.add(
				runtime.sidePairKey(
					runtime.sideUids[newSideIdx],
					runtime.sideUids[otherIdx],
				),
			);
		}
		runtime.rebuildHostilityMatrix();
		runtime.activeSideIndex = newSideIdx;
		runtime.activateCountryMidWar(newCountry, newSideIdx);
		runtime.reconcileOperationalAiLifecycle("new-side-joined");

		runtime.updateSidesUI();
		runtime.influenceLayer.render();

		const sideLabel = String.fromCharCode(65 + newSideIdx);
		runtime.statusText.innerText = `${newCountry.name} HAS JOINED AS SIDE ${sideLabel} — WAR ON ALL`;
		runtime.playWarStartSound();
	}

	function recruitNeutralMidWar(id, sideIdx) {
		runtime.ensureSideInfluenceMaps(
			Math.max(runtime.sides.length, sideIdx + 1),
		);
		const meta = runtime.countryMetadata[id - 1];
		if (!meta) return;
		const oldSideIdx = runtime.findCountrySideIndex(id);
		if (oldSideIdx === sideIdx) return;
		runtime.prepareEmptySideForNewMembership(sideIdx);

		if (oldSideIdx >= 0) {
			const country = runtime.sides[oldSideIdx].find(
				(candidate) => candidate.id === id,
			);

			const transfer = runtime.releaseCountryPersonnelFromSide(id, oldSideIdx, {
				transferHistory: true,
			}) || {
				surviving: 0,
				initial: 0,
				recruitable: 0,
				casualties: 0,
			};

			const oldCountryIndex = runtime.sides[oldSideIdx].findIndex(
				(candidate) => candidate.id === id,
			);
			if (oldCountryIndex >= 0)
				runtime.sides[oldSideIdx].splice(oldCountryIndex, 1);
			if (!runtime.sides[sideIdx]) runtime.sides[sideIdx] = [];
			if (
				country &&
				!runtime.sides[sideIdx].some((candidate) => candidate.id === id)
			) {
				runtime.sides[sideIdx].push(country);
			}
			runtime.sideSoldiers[sideIdx] += transfer.surviving;
			runtime.sideRecruitableManpower[sideIdx] += transfer.recruitable;
			runtime.initialSideSoldiers[sideIdx] += transfer.initial;
			runtime.sideCasualties[sideIdx] += transfer.casualties;
			const historicalCombatant = runtime.initialCombatants.find(
				(entry) => entry.id === id,
			);
			if (historicalCombatant) historicalCombatant.sideIndex = sideIdx;

			for (const unit of runtime.units) {
				if (unit.sovereignId !== id) continue;
				unit.sideIndex = sideIdx;
				runtime.clearUnitCommandAssignments(unit);
				unit._cachedTarget = null;
				unit._cachedScanKx = -999;
				unit._cachedScanKy = -999;
			}
			for (let index = 0; index < runtime.worldControlMap.length; index++) {
				if (
					runtime.dominantSideMap[index] !== oldSideIdx ||
					(runtime.worldControlMap[index] !== id &&
						runtime.primaryOccupierMap[index] !== id)
				)
					continue;
				const previousInfluence =
					runtime.sideInfluenceMaps[oldSideIdx]?.[index] || 0;
				if (runtime.sideInfluenceMaps[oldSideIdx]) {
					runtime.sideInfluenceMaps[oldSideIdx][index] = 0;
				}
				if (runtime.sideInfluenceMaps[sideIdx]) {
					runtime.sideInfluenceMaps[sideIdx][index] = Math.max(
						runtime.sideInfluenceMaps[sideIdx][index],
						previousInfluence,
						1,
					);
				}
				runtime.syncOccupationFromSideInfluence(index);
			}
			runtime.unitSpatialHash.clear();
			for (const sideHash of runtime.unitHashBySide) sideHash.clear();
			runtime.adjacencyCache = null;
			runtime.rebuildHostilityMatrix();
			runtime.invalidateFrontlineField();
			runtime.recalculateAllBounds();
			runtime.updateSidesUI();
			runtime.influenceLayer.render();
			runtime.reconcileOperationalAiLifecycle("country-changed-side");
			runtime.statusText.innerText = `${country?.name || meta.name} HAS SWITCHED TO ${runtime.getSideDisplayName(sideIdx)}`;
			runtime.playWarStartSound();
			return;
		}

		const newCountry = {
			id: id,
			name: meta.name,
			color: meta.color,
			role: "OFFENSE",
			strategy: "BALANCED",
			buffState: meta.buffState || "none",
			overlordId: meta.overlordId || null,
		};

		if (!runtime.sides[sideIdx]) runtime.sides[sideIdx] = [];
		runtime.sides[sideIdx].push(newCountry);
		runtime.activateCountryMidWar(newCountry, sideIdx);
		runtime.reconcileOperationalAiLifecycle("country-joined-side");

		runtime.updateSidesUI();
		runtime.influenceLayer.render();

		const sideLabel = String.fromCharCode(65 + sideIdx);
		runtime.statusText.innerText = `${newCountry.name} HAS DEPLOYED TO SIDE ${sideLabel}`;

		// Play sound if possible
		runtime.playWarStartSound();
	}
	return {
		openReleaseModal,
		_setAsReleasable,
		_setVassalage,
		recruitNewSideMidWar,
		recruitNeutralMidWar,
	};
}
