import assert from "node:assert/strict";

import {
	chooseFormationBudget,
	distributeFormationPersonnel,
	formatFormationStrengthBadge,
	getFormationPersonnel,
	getFormationStrengthBadge,
	getFormationStrengthMultiplier,
	mergeFormationAccounting,
	splitFormationAccounting,
} from "../src/formation-strength.js";

function seededRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function sum(parts, key) {
	return parts.reduce((total, part) => total + part[key], 0);
}

assert.equal(chooseFormationBudget(0), 0);
assert.equal(chooseFormationBudget(50_000), 50);
assert.equal(chooseFormationBudget(250_000), 250);
assert.equal(
	chooseFormationBudget(1_000_000),
	400,
	"one million personnel should use a few hundred simulation formations",
);
assert.equal(chooseFormationBudget(10_000_000), 800, "the hard cap must apply");

const million = distributeFormationPersonnel(
	1_000_003,
	chooseFormationBudget(1_000_003),
	{ idPrefix: "blue" },
);
assert.equal(million.length, 401);
assert.equal(sum(million, "personnel"), 1_000_003);
assert.ok(
	Math.max(...million.map((formation) => formation.personnel)) -
		Math.min(...million.map((formation) => formation.personnel)) <=
		1,
);
assert.deepEqual(
	distributeFormationPersonnel(10, 3, { rng: seededRng(44) }),
	distributeFormationPersonnel(10, 3, { rng: seededRng(44) }),
	"an explicit seeded tie-breaker must reproduce exactly",
);

assert.equal(getFormationPersonnel({ personnel: 2500 }), 2500);
assert.equal(getFormationPersonnel({ health: 250 }), 2500);
assert.equal(
	getFormationPersonnel({ nominalPersonnel: 2000, strengthMultiplier: 1.5 }),
	3000,
);
assert.equal(getFormationStrengthMultiplier({ personnel: 2500 }), 2.5);

const mergedNumeric = mergeFormationAccounting(
	[
		{ id: "a", personnel: 1201, equipment: 51, casualties: 11 },
		{ id: "b", personnel: 799, equipment: 49, casualties: 9 },
	],
	{ id: "ab" },
);
assert.deepEqual(mergedNumeric, {
	id: "ab",
	personnel: 2000,
	equipment: 100,
	casualties: 20,
	nominalPersonnel: 1000,
	strengthMultiplier: 2,
	sourceIds: ["a", "b"],
});

const mixedEquipment = mergeFormationAccounting([
	{ personnel: 1000, equipment: 5 },
	{ personnel: 1000, equipment: { armor: 17, trucks: 8 } },
]);
assert.deepEqual(mixedEquipment.equipment, {
	armor: 17,
	trucks: 8,
	untyped: 5,
});

const original = {
	id: "large-formation",
	personnel: 10_003,
	equipment: { armor: 101, trucks: 77 },
	casualties: 29,
};
const split = splitFormationAccounting(original, 4, {
	weights: [4, 3, 2, 1],
});
assert.equal(split.length, 4);
assert.equal(sum(split, "personnel"), original.personnel);
assert.equal(sum(split, "casualties"), original.casualties);
assert.equal(
	split.reduce((total, part) => total + part.equipment.armor, 0),
	original.equipment.armor,
);
assert.equal(
	split.reduce((total, part) => total + part.equipment.trucks, 0),
	original.equipment.trucks,
);
const remerged = mergeFormationAccounting(split);
assert.equal(remerged.personnel, original.personnel);
assert.deepEqual(remerged.equipment, original.equipment);
assert.equal(remerged.casualties, original.casualties);

assert.deepEqual(getFormationStrengthBadge({ personnel: 1000 }), {
	text: "",
	visible: false,
	tier: "standard",
	multiplier: 1,
	personnel: 1000,
	ariaLabel: "1000 personnel (1 times standard strength)",
});
assert.equal(formatFormationStrengthBadge({ personnel: 2500 }), "2.5×");
assert.equal(
	getFormationStrengthBadge({ personnel: 5000 }).tier,
	"massed",
);

assert.throws(
	() => distributeFormationPersonnel(1000, 0),
	/formationCount must be positive/,
);
assert.throws(
	() => splitFormationAccounting({ personnel: 1000 }, 0),
	/partCount must be at least 1/,
);

console.log("Formation strength smoke tests passed");
