import assert from "node:assert/strict";

import {
	chooseFormationBudget,
	distributeFormationPersonnel,
	formatFormationStrengthBadge,
	getFormationPersonnel,
	getFormationStrengthBadge,
	getFormationStrengthMultiplier,
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


console.log("Formation strength smoke tests passed");
