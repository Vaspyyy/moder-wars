import assert from "node:assert/strict";
import {
	COMMAND_BANDS,
	computeCurrentIncome,
	computeEconomicStrength,
	computeResistanceDelta,
	createEconomyState,
	createHostilityMatrix,
	getCommandBand,
	selectRebellionCandidates,
	settleEconomyCycle,
	updateResistance,
} from "../src/economy.js";

assert.equal(computeEconomicStrength({ gdp: 100, pop: 999999 }), 25);
assert.equal(computeEconomicStrength({ pop: 10000 }), 15);
assert.equal(computeEconomicStrength({ territoryUnits: 7 }), 7);

const initial = createEconomyState({
	countryId: 1,
	gdp: 100,
	initialCoreCells: 100,
});
assert.equal(initial.baseIncome, 25 / 0.7);
assert.equal(initial.treasury, initial.baseIncome * 6);
assert.equal(computeCurrentIncome(100, {}), 100);
assert.equal(
	computeCurrentIncome(100, {
		coreControlRatio: 0,
		cityControlRatio: 0,
		capitalHeld: false,
	}),
	3.25,
);

let insolvent = {
	...initial,
	treasury: 0,
	arrearsCycles: 0,
	mutinyRecoveryCycles: 0,
};
for (let i = 0; i < 5; i++) {
	insolvent = settleEconomyCycle(insolvent, {
		income: 0,
		payrollDue: 10,
	});
}
assert.equal(insolvent.commandBand, COMMAND_BANDS.MUTINY);
assert.equal(insolvent.mutinyRecoveryCycles, 3);

for (let i = 0; i < 8; i++) {
	insolvent = settleEconomyCycle(
		{ ...insolvent, treasury: 10 },
		{ income: 0, payrollDue: 10 },
	);
}
assert.equal(insolvent.arrearsCycles, 0);
assert.equal(insolvent.mutinyRecoveryCycles, 0);
assert.equal(insolvent.commandBand, COMMAND_BANDS.PAID);
assert.equal(getCommandBand(0, 1), COMMAND_BANDS.STRAINED);

assert.equal(
	computeResistanceDelta({
		occupationCoverage: 1,
		garrisonCoverage: 1,
		casualtyPressure: 0,
	}),
	-4,
);
assert.equal(
	updateResistance(90, {
		occupationCoverage: 0,
		garrisonCoverage: 0,
		casualtyPressure: 1,
	}),
	100,
);

const allHostile = new Set(["side-1|side-2", "side-1|side-3"]);
const matrix = createHostilityMatrix(
	3,
	allHostile,
	["side-1", "side-2", "side-3"],
);
assert.equal(matrix[0 * 8 + 1], 1);
assert.equal(matrix[0 * 8 + 2], 1);
assert.equal(matrix[1 * 8 + 2], 0);
assert.equal(matrix[2 * 8 + 1], 0);

const rebellionRecords = [
	{ victimId: 10, annexerId: 1, resistance: 100, queuedAtCycle: 1 },
	{ victimId: 11, annexerId: 1, resistance: 100, queuedAtCycle: 2 },
	{ victimId: 12, annexerId: 2, resistance: 100, queuedAtCycle: 3 },
	{ victimId: 13, annexerId: 3, resistance: 90, queuedAtCycle: 0 },
];
const rebellionCandidates = selectRebellionCandidates(
	rebellionRecords,
	[],
	5,
);
assert.deepEqual(
	rebellionCandidates.map((record) => record.victimId),
	[10, 12],
);
assert.equal(
	selectRebellionCandidates(rebellionRecords, [
		{ rebelId: 20, annexerId: 2 },
		{ rebelId: 21, annexerId: 3 },
	], 5).length,
	0,
);

console.log("War economy smoke tests passed.");
