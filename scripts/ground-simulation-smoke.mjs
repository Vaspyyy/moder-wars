import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createAiPlanner } from "../src/ai-planning.js";
import { createAiRuntime } from "../src/ai-runtime.js";
import { normalizeLongitudeDelta } from "../src/geographic-math.js";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
// These accounting helpers remain top-level functions until their state owner is extracted.
// Matching the top-level closing brace avoids relying on the location of the tick executor.
function sourceFunction(name) {
 const match = main.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, "m"));
 assert.ok(match, `Missing accounting helper: ${name}`);
 return match[0];
}
const runtime = {
 CONFIG: { UNIT_HEALTH: 100, UNIT_TO_SOLDIER_RATIO: 1000 }, MAX_SIDES: 8,
 UNIT_HASH_CELL_SIZE: 2.5,
 sides: [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]], countryMetadata: [],
 getLiveFormationStrength: unit => unit.personnel / 1000,
 getLiveFormationPersonnel: unit => unit.personnel,
 getEffectiveBuffState: () => "none",
 areSidesHostile: (a, b) => a !== b && a < 2 && b < 2,
 geoDistSq: (a, b, c, d) => (a - c) ** 2 + normalizeLongitudeDelta(b - d) ** 2,
 units: [], unitSpatialHash: new Map(), _liveSideCombatPower: new Float64Array(8),
 sideSoldiers: new Float64Array([10000, 10000]), sideCasualties: new Float64Array(8),
 countryCasualties: new Map(), casualtyByAttacker: new Map(),
 sidePairKey: (a, b) => [a, b].sort().join("|"),
};
const { operationalUnitPower } = createAiRuntime(runtime);
runtime.operationalUnitPower = operationalUnitPower;
const { estimateLocalForces } = createAiPlanner(runtime);
const context = vm.createContext(runtime);
for (const name of ["refreshLiveCombatPower", "getKnownEnemyPowerForSide", "formationDamage", "createHostilityMatrix", "recordCountryCombatLoss", "applyLandUnitDamage"])
 vm.runInContext(sourceFunction(name), context);
const makeUnit = (id, side, personnel, lng) => ({ id, sovereignId: side + 1, sideIndex: side, personnel, personnelCapacity: personnel, health: 100, maxHealth: 100, lat: 0, lng, deployTicks: 0, kind: "army" });
const friendly = makeUnit(1, 0, 5000, 179.8), enemy = makeUnit(2, 1, 2000, -179.8), neutral = makeUnit(3, 2, 9000, 179.9);
runtime.units = [friendly, enemy, neutral, { ...enemy, id: 4, health: 0 }, { ...enemy, id: 5, deployTicks: 30 }];
const fallback = estimateLocalForces(0, 0, 179.8, 1);
assert.equal(fallback.friendlies, 1); assert.equal(fallback.enemies, 1);
assert.equal(fallback.friendlyHealth, 5); assert.equal(fallback.enemyHealth, 2);
for (const unit of runtime.units) {
 const key = Math.floor((unit.lng + 180) / 2.5) * 100 + Math.floor((unit.lat + 90) / 2.5);
 const bucket = runtime.unitSpatialHash.get(key) || []; bucket.push(unit); runtime.unitSpatialHash.set(key, bucket);
}
assert.deepEqual(estimateLocalForces(0, 0, 179.8, 1), fallback, "hashed queries preserve wrapped local strengths");
context.refreshLiveCombatPower();
assert.equal(context.getKnownEnemyPowerForSide(0), 2, "exclude neutral, dead, and deploying forces");
assert.equal(context.formationDamage(10, friendly), 50, "compressed formations retain combat power");
assert.equal(context.applyLandUnitDamage(friendly, 10, enemy), 500);
assert.equal(friendly.health, 90); assert.equal(friendly.personnel, 4500);
assert.equal(context.sideSoldiers[0], 9500); assert.equal(context.sideCasualties[0], 500);
assert.equal(context.countryCasualties.get(1), 500); assert.equal(context.casualtyByAttacker.get(1).get(2), 500);
assert.equal(context.applyLandUnitDamage(friendly, Infinity, enemy), 0);
assert.equal(context.applyLandUnitDamage(friendly, 200, enemy), 4500);
assert.equal(context.applyLandUnitDamage(friendly, 10, enemy), 0, "never count a dead formation twice");
const matrix = context.createHostilityMatrix(3, new Set(["a|b"]), ["a", "b", "c"]);
assert.equal(matrix[1], 1); assert.equal(matrix[8], 1); assert.equal(matrix[2], 0); assert.equal(matrix[0], 0);

// Reference the two former scan policies independently: the combined snapshot must
// preserve their different deployment/dead-unit filters and compute each power once.
runtime.sides = [[{ id: 1 }], [{ id: 2 }]];
runtime.units = [];
for (const health of [0, 1, 100]) for (const deployTicks of [undefined, -1, 0, 30])
 for (const sideIndex of [undefined, NaN, -1, 0, 1, 2, 7, 8])
  runtime.units.push({ ...makeUnit(1, 0, 1000, 0), health, deployTicks, sideIndex });
const expectedLive = new Float64Array(8);
for (const unit of runtime.units.filter(u => u.health > 0 && u.deployTicks <= 0 && u.sideIndex >= 0 && u.sideIndex < 8))
 expectedLive[unit.sideIndex] += operationalUnitPower(unit);
const expectedStrength = [0, 0], expectedCounts = [0, 0];
for (const unit of runtime.units.filter(u => !(u.deployTicks > 0) && !(u.sideIndex < 0 || u.sideIndex >= 2))) {
 expectedStrength[unit.sideIndex] += operationalUnitPower(unit);
 expectedCounts[unit.sideIndex]++;
}
let powerCalls = 0;
runtime.operationalUnitPower = unit => { powerCalls++; return operationalUnitPower(unit); };
const snapshot = context.refreshLiveCombatPower(true);
assert.deepEqual(Array.from(runtime._liveSideCombatPower), Array.from(expectedLive));
const entries = array => Object.keys(array).map(key => [key, array[key]]);
assert.deepEqual(entries(snapshot.sideStrength), entries(expectedStrength));
assert.deepEqual(entries(snapshot.sideUnitCounts), entries(expectedCounts));
const eligible = runtime.units.filter(u => (u.health > 0 && u.deployTicks <= 0 && u.sideIndex >= 0 && u.sideIndex < 8) || (!(u.deployTicks > 0) && !(u.sideIndex < 0 || u.sideIndex >= 2))).length;
assert.equal(powerCalls, eligible, "calculate each eligible formation's power only once");
console.log("Ground combat, direct AI context, hostility, and 96 strength filter combinations passed");
