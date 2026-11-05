import assert from "node:assert/strict";
import {
	getCountryForceProfile,
	normalizeCountryIso3,
} from "../src/country-force-profiles.js";
import { createWarStart } from "../src/war-start.js";

// Identity: scenario metadata resolves by iso2, flag URL or name.
assert.equal(normalizeCountryIso3({ iso2: "UA" }), "UKR");
assert.equal(
	normalizeCountryIso3({ flagUrl: "https://flagcdn.com/w320/ru.png" }),
	"RUS",
);
assert.equal(normalizeCountryIso3({ name: "Germany" }), "DEU");
assert.equal(normalizeCountryIso3({ name: "Nationalist Spain (1936)" }), null);

// Observations are dated: nothing before the snapshot window, latest at or before the cutoff.
const russia2026 = getCountryForceProfile({ iso2: "RU" }, "2026-10-21");
assert.ok(russia2026.personnel.value > 500_000, "Russia has real personnel");
assert.ok(russia2026.personnel.asOf <= "2026-10-21");
assert.equal(
	getCountryForceProfile({ iso2: "RU" }, "1936-01-01").personnel,
	null,
);

// War start: formations take the real total; countries without data are untouched.
const UNIT_TO_SOLDIER_RATIO = 1000;
const runtime = {
	CONFIG: { UNIT_TO_SOLDIER_RATIO, UNIT_HEALTH: 100 },
	gameTimeEnabled: true,
	gameTimeDate: { year: 2023, month: 1, day: 1 },
	countryMetadata: [
		{ id: 1, name: "Ukraine", iso2: "UA" },
		{ id: 2, name: "Luxembourg", iso2: "LU" },
		{ id: 3, name: "Free Syrian Army" },
	],
	setUnitFormationPersonnel(unit, personnel) {
		unit.personnel = personnel;
		return unit;
	},
};
const warStart = createWarStart(runtime);
assert.equal(warStart.getForceDataDate(), "2023-01-01");
const formations = (count) =>
	Array.from({ length: count }, () => ({ personnel: UNIT_TO_SOLDIER_RATIO }));
const sum = (list) => list.reduce((total, unit) => total + unit.personnel, 0);

const ukraine = formations(120);
const ukraineReal = getCountryForceProfile({ iso2: "UA" }, "2023-01-01")
	.personnel.value;
assert.equal(
	warStart.applyRealForcePersonnel(1, ukraine, "2023-01-01"),
	ukraineReal,
);
assert.equal(sum(ukraine), ukraineReal, "exact real total is distributed");

const luxembourg = formations(8);
const applied = warStart.applyRealForcePersonnel(2, luxembourg, "2023-01-01");
assert.equal(applied, 8 * 250, "tiny militaries keep a playable floor");
assert.ok(luxembourg.every((unit) => unit.personnel >= 250));

const faction = formations(5);
assert.equal(warStart.applyRealForcePersonnel(3, faction, "2023-01-01"), 0);
assert.equal(sum(faction), 5 * UNIT_TO_SOLDIER_RATIO, "no data keeps defaults");
assert.equal(warStart.applyRealForcePersonnel(1, [], "2023-01-01"), 0);

runtime.gameTimeEnabled = false;
assert.equal(warStart.getForceDataDate(), "2024-12-31");

console.log(
	"Real force personnel: dated World Bank lookup, exact war-start totals, small-military floor and no-data fallback passed",
);
