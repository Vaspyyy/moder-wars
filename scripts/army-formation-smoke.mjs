import assert from "node:assert/strict";
import { createArmyFormation } from "../src/army-formation.js";
import { CONFIG } from "../src/config.js";
import { createEditorCommands } from "../src/editor-commands.js";
import { normalizeLongitudeDelta } from "../src/geographic-math.js";

for (const mountain of [false, true]) for (const mountainHealth of [false, true]) {
 const formation = createArmyFormation({ id: 3, lat: 1, lng: 2, sideIndex: 0, sovereignId: 1, isAlpenjager: mountain, mountainHealth });
 assert.deepEqual(formation, { id: 3, kind: "army", lat: 1, lng: 2, sideIndex: 0, sovereignId: 1, beneficiaryId: 1, isAlpenjager: mountain, health: CONFIG.UNIT_HEALTH * (mountain && mountainHealth ? CONFIG.ALPEN_HEALTH_MULT : 1), lastAttack: 0, deployTicks: 30 });
}
const cached = createArmyFormation({ id: 4, lat: 0, lng: 0, sideIndex: 0, sovereignId: 1, _cachedTarget: null, _cachedScanKx: -999, _cachedScanKy: -999, _lastFullScanTick: 0 });
assert.equal(cached._cachedTarget, null); assert.equal(cached._cachedScanKx, -999);
assert.equal(cached._cachedScanKy, -999); assert.equal(cached._lastFullScanTick, 0);

// Manual placement remains allowed with an empty reserve. Check the exact existing
// formation shape, shorter deployment, RNG sequence, and funding/initial-manpower policy.
const realRandom = Math.random;
try {
 for (const mountain of [false, true]) for (const available of [0, 500, 5000]) {
  const randomValues = [0.2, 0.6789]; let randomCalls = 0;
  Math.random = () => { randomCalls++; return randomValues.shift() ?? 0.5; };
  const runtime = {
   sides: [[{ id: 1 }]], gameState: "SIMULATING", godModeActive: true,
   getGridIndex: () => 0, terrainMask: new Float32Array([mountain ? 1 : 0]),
   CONFIG, units: [], soldiersPerUnit: [1000], MAX_SIDES: 8,
   sideRecruitableManpower: [available], sideSoldiers: [available], initialSideSoldiers: [available],
   setUnitFormationPersonnel: (unit, personnel) => { unit.personnel = personnel; unit.personnelCapacity = personnel; },
   getLiveFormationPersonnel: unit => unit.personnel, statusText: {}, countryMetadata: [{ name: "Test" }],
   influenceLayer: { render() {} }, recruitNeutralMidWar() { assert.fail("unexpected recruitment"); },
  };
  createEditorCommands(runtime)._placeDivisionAt({ lat: 1, lng: 2 }, 1);
  assert.deepEqual(runtime.units, [{ id: mountain ? 0.6789 : 0.2, kind: "army", lat: 1, lng: 2, sideIndex: 0, sovereignId: 1, beneficiaryId: 1, isAlpenjager: mountain, health: CONFIG.UNIT_HEALTH * (mountain ? CONFIG.ALPEN_HEALTH_MULT : 1), lastAttack: 0, deployTicks: 10, personnel: 1000, personnelCapacity: 1000 }]);
  assert.equal(randomCalls, mountain ? 2 : 1, "preserve mountain choice and formation ID randomness");
  assert.equal(runtime.sideRecruitableManpower[0], Math.max(0, available - 1000));
  assert.equal(runtime.sideSoldiers[0], Math.max(1000, available));
  assert.equal(runtime.initialSideSoldiers[0], Math.max(1000, available));
 }
} finally { Math.random = realRandom; }
for (const delta of [-720, -360, -181, -180, 0, 180, 181, 360, 720]) {
 let expected = delta;
 if (expected > 180) expected -= 360; else if (expected < -180) expected += 360;
 assert.equal(normalizeLongitudeDelta(delta), expected, "preserve one-step longitude boundary normalization");
}
console.log("Army constructor policies, six manual deployment budgets, and longitude boundaries passed");
