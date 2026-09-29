// Dependencies are supplied by the application; this module does not import it.
export function createTerritoryRuntime(runtime) {
	function territoryLedgerMaps() {
		return {
			landMask: runtime.landMask,
			worldControlMap: runtime.worldControlMap,
			dominantSideMap: runtime.dominantSideMap,
			deJureMap: runtime.deJureMap,
			primaryOccupierMap: runtime.primaryOccupierMap,
			occupationMap: runtime.occupationMap,
		};
	}

	function runtimeCountryToSideMap() {
		const mapping = new Map();
		for (let sideIndex = 0; sideIndex < runtime.sides.length; sideIndex++) {
			for (const country of runtime.sides[sideIndex] || []) {
				if (country?.id > 0) mapping.set(country.id, sideIndex);
			}
		}
		return mapping;
	}

	function publishTerritoryLedgerSnapshot(snapshot, decisionBoundary = false) {
		if (!snapshot) return false;
		runtime._territoryLedgerSnapshot = snapshot;
		runtime._cachedP1T = snapshot.positiveOccupationCells || 0;
		runtime._cachedP2T = snapshot.negativeOccupationCells || 0;

		const counts = new Array(runtime.sides.length).fill(0);
		for (let sideIndex = 0; sideIndex < runtime.sides.length; sideIndex++) {
			counts[sideIndex] =
				runtime.getSideLedger(snapshot, sideIndex)?.territory || 0;
		}
		runtime._cachedSideTerritoryCounts = counts;
		const total = counts.reduce((sum, count) => sum + count, 0);
		runtime._cachedSideTerritoryPcts = counts.map((count) =>
			total > 0 ? Math.round((count / total) * 100) : 50,
		);

		if (decisionBoundary) {
			for (const country of runtime.sides.flat()) {
				if (!country) continue;
				const ledger = runtime.getCountryLedger(snapshot, country.id);
				country.lastOwnedCount = ledger?.owned || 0;
				country.lastControlledCount = ledger?.controlled || 0;
				country.lastFrontlineCount = ledger?.frontline || 0;
			}
			runtime._territoryLedgerDecisionTick = runtime._simTickCount;
		}
		return true;
	}

	function createRuntimeTerritoryLedger(
		countryToSide = runtimeCountryToSideMap(),
	) {
		if (
			runtime.gridWidth <= 0 ||
			runtime.gridHeight <= 0 ||
			!runtime.landMask?.length ||
			runtime.landMask.length !== runtime.gridWidth * runtime.gridHeight
		) {
			return null;
		}
		const citySource = runtime.activeTheaterCities || [];
		runtime._territoryLedgerCitiesSource = citySource;
		runtime._territoryLedgerCitiesLength = citySource.length;
		runtime._territoryLedgerAppliedCitiesRevision =
			runtime._territoryLedgerCitiesRevision;
		return runtime.createTerritoryLedger({
			gridWidth: runtime.gridWidth,
			gridHeight: runtime.gridHeight,
			tileSize: 32,
			maps: territoryLedgerMaps(),
			countryToSide,
			sideUids: runtime.sideUids,
			hostilityMatrix: runtime.hostilityMatrix,
			maxSides: runtime.MAX_SIDES,
			topologyRevision: runtime._simulationWorldGeneration,
			worldRevision: runtime._simulationWorldGeneration,
			cityRevision: runtime._territoryLedgerCitiesRevision,
			cities: citySource,
			getCityCellIndex: (city) => runtime.getGridIndex(city.lat, city.lng),
			countedLandValue: 2,
			defaultItemBudget: 160_000,
			onCommit: (snapshot) => publishTerritoryLedgerSnapshot(snapshot, false),
		});
	}

	function ensureRuntimeTerritoryLedger(countryToSide) {
		if (!runtime._territoryLedger) {
			runtime._territoryLedger = createRuntimeTerritoryLedger(countryToSide);
		}
		if (!runtime._territoryLedger) return null;
		const topologyChanged = runtime._territoryLedger.setSideTopology({
			countryToSide,
			sideUids: runtime.sideUids,
			hostilityMatrix: runtime.hostilityMatrix,
			maxSides: runtime.MAX_SIDES,
			revision: runtime._simulationWorldGeneration,
		});
		if (topologyChanged) {
			runtime._territoryLedgerSnapshot = null;
			runtime._cachedSideTerritoryCounts = [];
			runtime._cachedSideTerritoryPcts = [];
		}
		const citySource = runtime.activeTheaterCities || [];
		const citySourceChanged =
			runtime._territoryLedgerCitiesSource !== citySource ||
			runtime._territoryLedgerCitiesLength !== citySource.length;
		if (
			citySourceChanged ||
			runtime._territoryLedgerAppliedCitiesRevision !==
				runtime._territoryLedgerCitiesRevision
		) {
			if (
				citySourceChanged &&
				runtime._territoryLedgerAppliedCitiesRevision ===
					runtime._territoryLedgerCitiesRevision
			) {
				runtime._territoryLedgerCitiesRevision++;
			}
			runtime._territoryLedger.setCities(citySource, {
				getCityCellIndex: (city) => runtime.getGridIndex(city.lat, city.lng),
				revision: runtime._territoryLedgerCitiesRevision,
			});
			runtime._territoryLedgerCitiesSource = citySource;
			runtime._territoryLedgerCitiesLength = citySource.length;
			runtime._territoryLedgerAppliedCitiesRevision =
				runtime._territoryLedgerCitiesRevision;
			runtime._territoryLedgerSnapshot = null;
		}
		return runtime._territoryLedger;
	}

	function stepTerritoryLedger(countryToSide, itemBudget = 160_000) {
		const ledger = ensureRuntimeTerritoryLedger(countryToSide);
		if (!ledger) return null;
		const result = ledger.step(itemBudget);
		if (result.committed)
			runtime._frameSimulationCommitFlags.add("territory-ledger");
		return result;
	}

	function flushTerritoryLedger(countryToSide = runtimeCountryToSideMap()) {
		const ledger = ensureRuntimeTerritoryLedger(countryToSide);
		if (!ledger) return null;
		const result = ledger.flush(160_000);
		if (result.committedGenerations > 0) {
			runtime._frameSimulationCommitFlags.add("territory-ledger");
		}
		if (result.snapshot) publishTerritoryLedgerSnapshot(result.snapshot, false);
		return result.snapshot || runtime._territoryLedgerSnapshot;
	}
	return {
		runtimeCountryToSideMap,
		territoryLedgerMaps,
		publishTerritoryLedgerSnapshot,
		createRuntimeTerritoryLedger,
		ensureRuntimeTerritoryLedger,
		stepTerritoryLedger,
		flushTerritoryLedger,
	};
}
