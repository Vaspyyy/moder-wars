// Explicit live context keeps replacements of arrays/state visible across awaits and callbacks.
export function createConflictPersonnel(runtime) {
	function getCountryLivePersonnel(countryId) {
		let personnel = 0;
		for (const unit of runtime.units) {
			if (unit.sovereignId !== countryId || unit.health <= 0) continue;
			personnel += runtime.getLiveFormationPersonnel(unit);
		}
		return personnel;
	}

	function getSideLivePersonnel(sideIdx) {
		return (runtime.sides[sideIdx] || []).reduce(
			(total, country) => total + getCountryLivePersonnel(country.id),
			0,
		);
	}

	function clearSidePersonnelAccounting(sideIdx) {
		if (sideIdx < 0 || sideIdx >= runtime.MAX_SIDES) return;
		runtime.sideSoldiers[sideIdx] = 0;
		runtime.initialSideSoldiers[sideIdx] = 0;
		runtime.sideRecruitableManpower[sideIdx] = 0;
		runtime.sideCasualties[sideIdx] = 0;
		runtime.soldiersPerUnit[sideIdx] = runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
	}

	function releaseCountryPersonnelFromSide(
		countryId,
		sideIdx,
		{ transferHistory = false } = {},
	) {
		const side = runtime.sides[sideIdx] || [];
		if (!side.some((country) => country.id === countryId)) return null;
		const countryLivePersonnel = getCountryLivePersonnel(countryId);
		const sideLivePersonnel = getSideLivePersonnel(sideIdx);
		const countryCount = Math.max(1, side.length);
		const liveShare = Math.min(
			1,
			sideLivePersonnel > 0
				? countryLivePersonnel / sideLivePersonnel
				: 1 / countryCount,
		);
		const casualties = Math.min(
			Math.max(0, runtime.sideCasualties[sideIdx] || 0),
			Math.max(0, runtime.countryCasualties.get(countryId) || 0),
		);
		const isOnlyCountry = side.length === 1;
		const recruitable = Math.round(
			Math.max(0, runtime.sideRecruitableManpower[sideIdx] || 0) * liveShare,
		);
		const surviving = Math.min(
			Math.max(0, runtime.sideSoldiers[sideIdx] || 0),
			countryLivePersonnel + recruitable,
		);
		const initial = isOnlyCountry
			? Math.max(0, runtime.initialSideSoldiers[sideIdx] || 0)
			: Math.min(
					Math.max(0, runtime.initialSideSoldiers[sideIdx] || 0),
					surviving + casualties,
				);
		runtime.sideSoldiers[sideIdx] = Math.max(
			0,
			runtime.sideSoldiers[sideIdx] - surviving,
		);
		runtime.sideRecruitableManpower[sideIdx] = Math.max(
			0,
			runtime.sideRecruitableManpower[sideIdx] - recruitable,
		);
		if (transferHistory) {
			runtime.initialSideSoldiers[sideIdx] = Math.max(
				0,
				runtime.initialSideSoldiers[sideIdx] - initial,
			);
			runtime.sideCasualties[sideIdx] = Math.max(
				0,
				runtime.sideCasualties[sideIdx] - casualties,
			);
		}
		return {
			countryLivePersonnel,
			surviving,
			initial,
			recruitable,
			casualties,
		};
	}

	function removeCountryFormations(countryId) {
		runtime.units = runtime.units.filter(
			(unit) => unit.sovereignId !== countryId,
		);
		runtime.units.forEach((unit) => {
			if (unit.beneficiaryId === countryId)
				unit.beneficiaryId = unit.sovereignId;
		});
	}
	return {
		getCountryLivePersonnel,
		getSideLivePersonnel,
		clearSidePersonnelAccounting,
		releaseCountryPersonnelFromSide,
		removeCountryFormations,
	};
}
