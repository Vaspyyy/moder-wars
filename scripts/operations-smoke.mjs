import assert from "node:assert/strict";
import {
	advanceOperationActivePlay,
	applyCommanderDirective,
	calculateDirectiveAllocation,
	calculateOperationMedals,
	createOperationRuntime,
	EASTERN_FRONT_OPERATION,
	evaluateOperationDay,
	getDirectiveCooldownRemaining,
	getPriorityPlanType,
	resolveOperationEvent,
	validateOperationDefinition,
} from "../src/operations.js";

const definition = EASTERN_FRONT_OPERATION;
assert.deepEqual(validateOperationDefinition(definition), []);
assert.ok(validateOperationDefinition({}).length > 0);

let runtime = createOperationRuntime(definition);
assert.equal(getDirectiveCooldownRemaining(definition, runtime), 0);
runtime = applyCommanderDirective(definition, runtime, {
	stance: "HOLD",
	targetCity: "kharkiv",
	reserve: 0.4,
});
assert.ok(runtime);
assert.equal(runtime.directive.targetCity, "kharkiv");
assert.equal(applyCommanderDirective(definition, runtime, runtime.directive), null);
assert.equal(
	advanceOperationActivePlay(runtime, 45000, true).activePlayMs,
	runtime.activePlayMs,
);
runtime = advanceOperationActivePlay(runtime, 45000, false);
assert.equal(getDirectiveCooldownRemaining(definition, runtime), 0);

for (const [stance, offenseShare] of [
	["HOLD", 0.12],
	["BALANCED", 0.3],
	["COUNTERATTACK", 0.45],
]) {
	const allocation = calculateDirectiveAllocation({ stance, reserve: 0.4 });
	assert.ok(Math.abs(allocation.offense - offenseShare) < 1e-9);
	assert.ok(
		Math.abs(allocation.offense + allocation.defense + allocation.reserve - 1) <
			1e-9,
	);
}
assert.equal(
	calculateDirectiveAllocation(
		{ stance: "COUNTERATTACK", reserve: 0.4 },
		[{ type: "OFFENSE", forcedReserve: 0.1 }],
	).reserve,
	0.1,
);
assert.equal(getPriorityPlanType(true), "DEFEND_CITY");
assert.equal(getPriorityPlanType(false), "CAPTURE_CITY");

const friendlyCities = {
	kyiv: true,
	kharkiv: true,
	dnipro: true,
	odesa: true,
};
const baseSnapshot = {
	currentDay: 1,
	playerActive: true,
	enemyActive: true,
	cityFriendly: friendlyCities,
	coreControlRatio: 0.75,
};
runtime = createOperationRuntime(definition);
for (let day = 1; day <= 29; day++) {
	runtime = evaluateOperationDay(definition, runtime, {
		...baseSnapshot,
		currentDay: day,
		cityFriendly: { ...friendlyCities, kyiv: false },
	});
	assert.equal(runtime.result, null);
}
runtime = evaluateOperationDay(definition, runtime, {
	...baseSnapshot,
	currentDay: 30,
	cityFriendly: { ...friendlyCities, kyiv: false },
});
assert.equal(runtime.result, "DEFEAT");

runtime = evaluateOperationDay(definition, createOperationRuntime(definition), {
	...baseSnapshot,
	currentDay: 365,
});
assert.equal(runtime.result, "VICTORY");
assert.deepEqual(runtime.medals, [
	"capital_unbroken",
	"cities_held",
	"sovereign_majority",
]);

runtime = evaluateOperationDay(definition, createOperationRuntime(definition), {
	...baseSnapshot,
	enemyActive: false,
});
assert.equal(runtime.result, "EARLY_VICTORY");
assert.equal(
	evaluateOperationDay(definition, createOperationRuntime(definition), {
		...baseSnapshot,
		playerActive: false,
	}).result,
	"DEFEAT",
);
assert.deepEqual(
	calculateOperationMedals(
		{ ...createOperationRuntime(definition), capitalEverLost: true },
		{ cityFriendly: { ...friendlyCities, kharkiv: false }, coreControlRatio: 0.59 },
	),
	[],
);

runtime = evaluateOperationDay(definition, createOperationRuntime(definition), {
	...baseSnapshot,
	currentDay: 45,
});
assert.deepEqual(runtime.queuedEventIds, ["emergency_reserves"]);
const resolved = resolveOperationEvent(
	definition,
	runtime,
	"emergency_reserves",
	"capital",
);
assert.ok(resolved);
assert.equal(resolved.effect.groups[0].count, 30);
assert.deepEqual(resolved.runtime.queuedEventIds, []);
assert.deepEqual(resolved.runtime.resolvedEventIds, ["emergency_reserves"]);
assert.equal(
	resolveOperationEvent(
		definition,
		resolved.runtime,
		"emergency_reserves",
		"capital",
	),
	null,
);

console.log("operations smoke checks passed");
