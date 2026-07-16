export const CAPITULATION_THRESHOLDS = Object.freeze({
	DEFENDED_CONTROL_PERCENT: 2,
	UNITLESS_CONTROL_PERCENT: 25,
});

export function evaluateCountryCapitulation({
	hasFreshTerritoryData = false,
	isRebel = false,
	unitCount = 0,
	ownedCells = 0,
	controlledCells = 0,
	initialCells = 1,
} = {}) {
	const safeInitial = Math.max(1, Number(initialCells) || 1);
	const controlPercent =
		(Math.max(0, Number(controlledCells) || 0) / safeInitial) * 100;
	if (!hasFreshTerritoryData) {
		return {
			capitulate: false,
			reason: "STALE_TERRITORY_DATA",
			controlPercent,
		};
	}
	if (isRebel) {
		return { capitulate: false, reason: "REBELLION_RULES", controlPercent };
	}
	if ((Number(ownedCells) || 0) <= 0) {
		return { capitulate: true, reason: "NO_OWNED_CELLS", controlPercent };
	}

	const threshold =
		(Number(unitCount) || 0) > 0
			? CAPITULATION_THRESHOLDS.DEFENDED_CONTROL_PERCENT
			: CAPITULATION_THRESHOLDS.UNITLESS_CONTROL_PERCENT;
	if (controlPercent < threshold) {
		return {
			capitulate: true,
			reason:
				(Number(unitCount) || 0) > 0
					? "DEFENDED_CONTROL_COLLAPSE"
					: "UNITLESS_CONTROL_COLLAPSE",
			controlPercent,
			threshold,
		};
	}
	return {
		capitulate: false,
		reason: "ABOVE_THRESHOLD",
		controlPercent,
		threshold,
	};
}

export function selectEligibleCasualtyAttackers(entries, minimumShare = 0.25) {
	const eligible = (entries || [])
		.filter((entry) => Number(entry?.countryId) > 0)
		.map((entry) => ({
			...entry,
			countryId: Number(entry.countryId),
			casualties: Math.max(0, Number(entry.casualties) || 0),
		}));
	const totalCasualties = eligible.reduce(
		(sum, entry) => sum + entry.casualties,
		0,
	);
	if (totalCasualties <= 0) return [];

	const ranked = eligible
		.map((entry) => ({
			...entry,
			share: entry.casualties / totalCasualties,
		}))
		.sort((a, b) => b.casualties - a.casualties || a.countryId - b.countryId);
	const selected = ranked.filter((entry) => entry.share >= minimumShare);
	return selected.length > 0 ? selected : [ranked[0]];
}

export function allocateLargestRemainderQuotas(entries, totalCells) {
	const total = Math.max(0, Math.floor(Number(totalCells) || 0));
	const weighted = (entries || [])
		.filter((entry) => Number(entry?.countryId) > 0)
		.map((entry) => ({
			...entry,
			countryId: Number(entry.countryId),
			weight: Math.max(
				0,
				Number(entry.weight ?? entry.casualties ?? entry.share) || 0,
			),
		}));
	if (weighted.length === 0) return [];

	let weightTotal = weighted.reduce((sum, entry) => sum + entry.weight, 0);
	if (weightTotal <= 0) {
		for (const entry of weighted) entry.weight = 1;
		weightTotal = weighted.length;
	}
	const quotas = weighted.map((entry) => {
		const exact = (entry.weight / weightTotal) * total;
		return { ...entry, quota: Math.floor(exact), remainder: exact % 1 };
	});
	const remaining = total - quotas.reduce((sum, entry) => sum + entry.quota, 0);
	const remainderOrder = [...quotas].sort(
		(a, b) =>
			b.remainder - a.remainder ||
			b.weight - a.weight ||
			a.countryId - b.countryId,
	);
	for (let i = 0; i < remaining; i++) {
		remainderOrder[i % remainderOrder.length].quota++;
	}
	return quotas.map(({ remainder: _remainder, ...entry }) => entry);
}

export function selectOccupationController(entries) {
	const ranked = (entries || [])
		.filter((entry) => Number(entry?.countryId) > 0)
		.map((entry) => ({
			...entry,
			countryId: Number(entry.countryId),
			controlledCells: Math.max(0, Number(entry.controlledCells) || 0),
			casualties: Math.max(0, Number(entry.casualties) || 0),
		}))
		.filter((entry) => entry.controlledCells > 0)
		.sort(
			(a, b) =>
				b.controlledCells - a.controlledCells ||
				b.casualties - a.casualties ||
				a.countryId - b.countryId,
		);
	return ranked[0] || null;
}

export function evaluateGlobalConflict(activeSideIndices, activeHostilePairs) {
	const active = [...new Set(activeSideIndices || [])].sort((a, b) => a - b);
	if (active.length === 0) return { type: "WHITE_PEACE", winnerSideIdx: null };
	if (active.length === 1) {
		return { type: "FULL_CAPITULATION", winnerSideIdx: active[0] };
	}
	if ((activeHostilePairs || []).length === 0) {
		return { type: "WHITE_PEACE", winnerSideIdx: null };
	}
	return null;
}

export function updateRebellionFailureCycles(
	failedCycles,
	{ unitCount = 0, controlRatio = 0 } = {},
) {
	return (Number(unitCount) || 0) === 0 && (Number(controlRatio) || 0) < 0.05
		? Math.max(0, Number(failedCycles) || 0) + 1
		: 0;
}

export function selectMajorityOwnerTransfers(transfers) {
	const countsByOwner = new Map();
	for (const transfer of transfers || []) {
		const originalOwner = Number(transfer?.originalOwner) || 0;
		const newOwner = Number(transfer?.newOwner) || 0;
		const count = Math.max(0, Number(transfer?.count) || 1);
		if (originalOwner <= 0 || newOwner <= 0 || originalOwner === newOwner)
			continue;
		let recipientCounts = countsByOwner.get(originalOwner);
		if (!recipientCounts) {
			recipientCounts = new Map();
			countsByOwner.set(originalOwner, recipientCounts);
		}
		recipientCounts.set(newOwner, (recipientCounts.get(newOwner) || 0) + count);
	}

	const result = new Map();
	for (const [originalOwner, recipientCounts] of countsByOwner) {
		const winner = Array.from(recipientCounts, ([countryId, count]) => ({
			countryId,
			count,
		})).sort((a, b) => b.count - a.count || a.countryId - b.countryId)[0];
		if (winner) result.set(originalOwner, winner.countryId);
	}
	return result;
}
