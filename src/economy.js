export const ECONOMY_CONFIG = Object.freeze({
	PAY_CYCLE_TICKS: 600,
	PAYROLL_PER_UNIT: 1,
	RECRUITMENT_COST: 3,
	STARTING_RESERVE_CYCLES: 6,
	TARGET_STARTING_PAYROLL_SHARE: 0.7,
	CAPITAL_LOSS_INCOME_MULT: 0.65,
	OCCUPATION_YIELD_SHARE: 0.25,
	OCCUPATION_COST_SHARE: 0.15,
	MUTINY_RECOVERY_CYCLES: 3,
	MAX_ACTIVE_REBELLIONS: 2,
	MAX_REBELLIONS_PER_ANNEXER: 1,
});

export const COMMAND_BANDS = Object.freeze({
	PAID: "PAID",
	STRAINED: "STRAINED",
	UNPAID: "UNPAID",
	BREAKDOWN: "BREAKDOWN",
	MUTINY: "MUTINY",
});

export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function computeEconomicStrength({
	gdp = 0,
	pop = 0,
	territoryUnits = 0,
} = {}) {
	if (Number.isFinite(gdp) && gdp > 0) return Math.sqrt(gdp) * 2.5;
	if (Number.isFinite(pop) && pop > 0) return Math.sqrt(pop) * 0.15;
	return Math.max(0, Number.isFinite(territoryUnits) ? territoryUnits : 0);
}

export function createEconomyState({
	countryId,
	gdp = 0,
	pop = 0,
	territoryUnits = 0,
	initialCoreCells = 0,
	initialCityPop = 0,
} = {}) {
	const economicStrength = computeEconomicStrength({
		gdp,
		pop,
		territoryUnits,
	});
	const baseIncome = Math.max(
		3,
		economicStrength / ECONOMY_CONFIG.TARGET_STARTING_PAYROLL_SHARE,
	);
	return {
		countryId,
		economicStrength,
		baseIncome,
		treasury: baseIncome * ECONOMY_CONFIG.STARTING_RESERVE_CYCLES,
		income: baseIncome,
		occupationYield: 0,
		payrollDue: 0,
		occupationDue: 0,
		payrollCoverage: 1,
		occupationCoverage: 1,
		arrearsCycles: 0,
		commandBand: COMMAND_BANDS.PAID,
		mutinyRecoveryCycles: 0,
		initialCoreCells: Math.max(1, initialCoreCells || 0),
		initialCityPop: Math.max(0, initialCityPop || 0),
		coreControlRatio: 1,
		cityControlRatio: 1,
		capitalHeld: true,
		lastEventBand: COMMAND_BANDS.PAID,
		capitulated: false,
	};
}

export function computeCurrentIncome(
	baseIncome,
	{ coreControlRatio = 1, cityControlRatio = 1, capitalHeld = true } = {},
) {
	const productiveControl = Math.max(
		0.05,
		0.6 * clamp(coreControlRatio, 0, 1) + 0.4 * clamp(cityControlRatio, 0, 1),
	);
	return (
		Math.max(0, baseIncome || 0) *
		productiveControl *
		(capitalHeld ? 1 : ECONOMY_CONFIG.CAPITAL_LOSS_INCOME_MULT)
	);
}

export function getCommandBand(arrearsCycles, mutinyRecoveryCycles = 0) {
	const arrears = Math.max(0, arrearsCycles || 0);
	if (arrears >= 5) return COMMAND_BANDS.MUTINY;
	if (arrears >= 3) return COMMAND_BANDS.BREAKDOWN;
	if (arrears >= 2) return COMMAND_BANDS.UNPAID;
	if (arrears >= 1 || mutinyRecoveryCycles > 0) return COMMAND_BANDS.STRAINED;
	return COMMAND_BANDS.PAID;
}

export function commandRefusalShare(commandBand) {
	switch (commandBand) {
		case COMMAND_BANDS.STRAINED:
			return 0.25;
		case COMMAND_BANDS.UNPAID:
			return 0.6;
		case COMMAND_BANDS.BREAKDOWN:
		case COMMAND_BANDS.MUTINY:
			return 1;
		default:
			return 0;
	}
}

export function desertionRate(commandBand) {
	if (commandBand === COMMAND_BANDS.MUTINY) return 0.03;
	if (commandBand === COMMAND_BANDS.BREAKDOWN) return 0.01;
	return 0;
}

export function settleEconomyCycle(
	state,
	{ income = 0, occupationYield = 0, payrollDue = 0, occupationDue = 0 } = {},
) {
	const next = { ...state };
	const previousBand = getCommandBand(
		next.arrearsCycles,
		next.mutinyRecoveryCycles,
	);
	next.income = Math.max(0, income);
	next.occupationYield = Math.max(0, occupationYield);
	next.payrollDue = Math.max(0, payrollDue);
	next.occupationDue = Math.max(0, occupationDue);
	next.treasury = Math.max(
		0,
		(next.treasury || 0) + next.income + next.occupationYield,
	);

	const totalDue = next.payrollDue + next.occupationDue;
	const coverage = totalDue > 0 ? clamp(next.treasury / totalDue, 0, 1) : 1;
	const spend = Math.min(next.treasury, totalDue);
	next.treasury -= spend;
	next.payrollCoverage = next.payrollDue > 0 ? coverage : 1;
	next.occupationCoverage = next.occupationDue > 0 ? coverage : 1;

	if (next.payrollCoverage >= 0.999) {
		next.arrearsCycles = Math.max(0, (next.arrearsCycles || 0) - 1);
		if (next.arrearsCycles === 0 && next.mutinyRecoveryCycles > 0) {
			next.mutinyRecoveryCycles--;
		}
	} else {
		if (next.mutinyRecoveryCycles > 0) {
			next.mutinyRecoveryCycles = ECONOMY_CONFIG.MUTINY_RECOVERY_CYCLES;
		}
		next.arrearsCycles = Math.max(
			0,
			(next.arrearsCycles || 0) + (1 - next.payrollCoverage),
		);
	}

	const rawBand = getCommandBand(next.arrearsCycles, 0);
	if (
		previousBand !== COMMAND_BANDS.MUTINY &&
		rawBand === COMMAND_BANDS.MUTINY
	) {
		next.mutinyRecoveryCycles = ECONOMY_CONFIG.MUTINY_RECOVERY_CYCLES;
	}
	next.commandBand = getCommandBand(
		next.arrearsCycles,
		next.mutinyRecoveryCycles,
	);
	return next;
}

export function computeResistanceDelta({
	occupationCoverage = 1,
	garrisonCoverage = 1,
	casualtyPressure = 0,
} = {}) {
	const funding = clamp(occupationCoverage, 0, 1);
	const garrison = clamp(garrisonCoverage, 0, 1);
	const casualties = clamp(casualtyPressure, 0, 1);
	return clamp(
		12 * (1 - funding) +
			6 * (1 - garrison) +
			4 * casualties -
			4 * funding * garrison,
		-4,
		22,
	);
}

export function updateResistance(resistance, inputs) {
	return clamp(
		Math.max(0, resistance || 0) + computeResistanceDelta(inputs),
		0,
		100,
	);
}

export function createHostilityMatrix(
	sideCount,
	hostilePairs,
	sideUids,
	maxSides = 8,
) {
	const matrix = new Uint8Array(maxSides * maxSides);
	for (let a = 0; a < sideCount; a++) {
		for (let b = a + 1; b < sideCount; b++) {
			const uidA = sideUids[a];
			const uidB = sideUids[b];
			if (!uidA || !uidB) continue;
			const key = uidA < uidB ? `${uidA}|${uidB}` : `${uidB}|${uidA}`;
			if (!hostilePairs.has(key)) continue;
			matrix[a * maxSides + b] = 1;
			matrix[b * maxSides + a] = 1;
		}
	}
	return matrix;
}

export function selectRebellionCandidates(
	records,
	activeRebellions,
	cycle,
	{
		maxActive = ECONOMY_CONFIG.MAX_ACTIVE_REBELLIONS,
		maxPerAnnexer = ECONOMY_CONFIG.MAX_REBELLIONS_PER_ANNEXER,
	} = {},
) {
	const active = Array.from(activeRebellions || []);
	const annexerCounts = new Map();
	for (const rebellion of active) {
		annexerCounts.set(
			rebellion.annexerId,
			(annexerCounts.get(rebellion.annexerId) || 0) + 1,
		);
	}
	const available = Math.max(0, maxActive - active.length);
	if (available === 0) return [];
	const eligible = Array.from(records || [])
		.filter(
			(record) =>
				record.resistance >= 100 &&
				!record.active &&
				(record.cooldownUntilCycle || 0) <= cycle,
		)
		.sort(
			(a, b) =>
				b.resistance - a.resistance ||
				(a.queuedAtCycle || 0) - (b.queuedAtCycle || 0),
		);
	const selected = [];
	for (const record of eligible) {
		if (selected.length >= available) break;
		if ((annexerCounts.get(record.annexerId) || 0) >= maxPerAnnexer) {
			continue;
		}
		selected.push(record);
		annexerCounts.set(
			record.annexerId,
			(annexerCounts.get(record.annexerId) || 0) + 1,
		);
	}
	return selected;
}
