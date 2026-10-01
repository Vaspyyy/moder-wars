import assert from "node:assert/strict";
import { createArmyFormation } from "../src/army-formation.js";
import { buildDirectionField, buildLayout } from "../src/frontline-core.js";
import { toDenseInfluenceMap } from "../src/influence-grid.js";
import { createSimulationClock } from "../src/simulation-clock.js";
import { createSimulationCore } from "../src/simulation-core.js";
import { applySimulationState, captureSimulationState, createControlDeltaTracker, createPresentationSnapshot } from "../src/simulation-protocol.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

// Offline simulation ownership and timing probes. No window, document, renderer,
// or browser/game automation is used by this script.
assert.equal(typeof window, "undefined");
assert.equal(typeof document, "undefined");

function runClock(schedule, speed = 1) {
 let ticks = 0;
 const clock = createSimulationClock(() => { ticks++; }, { speed, now: () => 0 });
 assert.equal(clock.pump(0).ticks, 0);
 for (const time of schedule) assert.ok(clock.pump(time).ticks <= 6);
 const end = schedule.at(-1);
 while (clock.snapshot().pendingTicks > 0) assert.ok(clock.pump(end).ticks <= 6);
 return { ticks, clock };
}
const frames60 = Array.from({ length: 60 }, (_, i) => (i + 1) * 1000 / 60);
const frames144 = Array.from({ length: 144 }, (_, i) => (i + 1) * 1000 / 144);
for (const schedule of [frames60, frames144, [7, 10, 29, 180, 191, 711, 1000], [1000]]) {
 assert.equal(runClock(schedule).ticks, 60);
 assert.equal(runClock(schedule, 3).ticks, 180);
 assert.equal(runClock(schedule, 5).ticks, 300);
 assert.equal(runClock(schedule, 10).ticks, 600);
}
let wallTime = 0;
const budgetClock = createSimulationClock({ onTick: () => { wallTime += 3; }, now: () => wallTime, maxTurnMs: 8 });
budgetClock.advance(0);
assert.equal(budgetClock.advance(1000).ticks, 3, "elapsed budget yields without deleting simulation debt");
assert.equal(budgetClock.snapshot().pendingTicks, 57);
while (budgetClock.snapshot().pendingTicks > 0) budgetClock.advance(1000);
assert.equal(budgetClock.snapshot().completedTicks, 60);
let controlledTicks = 0;
const controlled = createSimulationClock(() => { controlledTicks++; }, { now: () => 0 });
controlled.pump(0);
controlled.configure({ speed: 3 }, 500);
while (controlled.snapshot().pendingTicks) controlled.pump(500);
controlled.pump(1000);
while (controlled.snapshot().pendingTicks) controlled.pump(1000);
assert.equal(controlledTicks, 120, "speed changes charge elapsed time at the preceding speed");
controlled.configure({ paused: true }, 1500);
assert.equal(controlled.snapshot().pendingTicks, 0, "pausing clears unsimulated debt");
assert.equal(controlled.pump(15000).ticks, 0);
controlled.configure({ paused: false }, 15000);
assert.equal(controlled.pump(15000).ticks, 0, "resume excludes paused wall time");
assert.equal(controlled.pump(15000 + 1000 / 60).ticks, 3);
assert.throws(() => controlled.configure({ speed: 0 }, 16000), /positive/);
assert.throws(() => controlled.pump(100), /monotonic/);
const stopped = createSimulationClock(() => false, { now: () => 0 });
stopped.pump(0);
assert.equal(stopped.pump(1000).ticks, 0);
assert.equal(stopped.snapshot().paused, true);
assert.equal(stopped.snapshot().pendingTicks, 0);

function withDeterministicRandom(callback) {
 const original = Math.random;
 let seed = 0x7a11c0de;
 Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
 };
 try { return callback(); } finally { Math.random = original; }
}
function fixture(options = {}) {
 const initial = createTinySimulationState(options);
 initial.gameTimeEnabled = true;
 initial.gameTimeDate = { year: 2024, month: 2, day: 28 };
 return initial;
}
// City editing and simulation capital checks must observe the same objects
// after both full ownership transfers and topology-only presentation updates.
const cityCore = createSimulationCore(fixture({ paused: true }));
assert.equal(cityCore.state.cities[0], cityCore.state.activeTheaterCities[0]);
const cityReturn = structuredClone(captureSimulationState(cityCore.state, { denseInfluence: true }));
assert.equal(cityReturn.cities[0], cityReturn.activeTheaterCities[0]);
assert.notEqual(cityReturn.cities[0], cityCore.state.cities[0]);
const cityMirror = fixture({ paused: true });
applySimulationState(cityMirror, cityReturn);
cityMirror.cities[0].sovereignId = 2;
cityMirror.cities[0].isCapital = false;
assert.equal(cityMirror.activeTheaterCities[0].sovereignId, 2);
assert.equal(cityMirror.activeTheaterCities[0].isCapital, false);
const cityPresentation = structuredClone(createPresentationSnapshot(cityCore.state, createControlDeltaTracker(cityCore.state), { includeTopology: true }));
assert.equal(cityPresentation.values.cities[0], cityPresentation.values.activeTheaterCities[0]);
applySimulationState(cityMirror, cityPresentation.values);
cityMirror.cities[0].lat = 7.5;
assert.equal(cityMirror.activeTheaterCities[0].lat, 7.5);
function gameplaySnapshot(state) {
 return {
  tick: state._simTickCount,
  frame: state.simFrameCount,
  date: state.gameTimeDate,
  units: state.units.map(unit => ({
   id: unit.id, lat: unit.lat, lng: unit.lng, health: unit.health,
   personnel: unit.personnel, side: unit.sideIndex, sovereign: unit.sovereignId,
   slot: unit.frontSlot, order: unit._taskForceOrder,
  })),
  forces: [...state._aiTaskForcesBySide],
  soldiers: state.sideSoldiers,
  casualties: state.sideCasualties,
  influence: state.sideInfluenceMaps.map(toDenseInfluenceMap),
  control: state.worldControlMap,
  dominance: state.dominantSideMap,
  occupation: state.occupationMap,
 };
}
function scheduledSimulation(schedule) {
 return withDeterministicRandom(() => {
  const core = createSimulationCore(fixture({ speed: 3 }));
  const clock = createSimulationClock(core.tick, { speed: 3, now: () => 0 });
  clock.pump(0);
  for (const time of schedule) clock.pump(time);
  while (clock.snapshot().pendingTicks) clock.pump(schedule.at(-1));
  return gameplaySnapshot(core.state);
 });
}
const reference = scheduledSimulation(frames60);
assert.equal(reference.tick, 180);
assert.equal(reference.frame, 180, "cohorts advance once per simulation tick");
assert.deepEqual(reference.date, { year: 2024, month: 3, day: 5 });
assert.ok(reference.units.length > 4, "fixture exercises actual recruitment and AI allocation");
assert.ok(reference.units.some(unit => unit.slot), "frontline layout applies slots");
for (const schedule of [frames144, [7, 10, 29, 180, 191, 711, 1000], [1000]])
 assert.deepEqual(scheduledSimulation(schedule), reference, "display schedule cannot alter simulation outcomes");
const manual = withDeterministicRandom(() => {
 const core = createSimulationCore(fixture({ speed: 1 }));
 for (let i = 0; i < 180; i++) assert.equal(core.tick(), true);
 return gameplaySnapshot(core.state);
});
assert.deepEqual(manual, reference, "speed scheduling advances the calendar once per fixed tick");

const events = [], dirty = [];
const core = createSimulationCore(fixture({ paused: true }), {
 onEvent: (type, ...args) => events.push({ type, args }),
 onControlCellsChanged: cells => dirty.push(cells),
});
const sibling = createSimulationCore(fixture({ paused: true }));
assert.notEqual(core.state.CONFIG, sibling.state.CONFIG);
assert.notEqual(core.state.landMask, sibling.state.landMask);
assert.notEqual(core.state._simulationJobs, sibling.state._simulationJobs);
assert.notEqual(core.state.perf, sibling.state.perf);
const before = gameplaySnapshot(core.state);
assert.equal(core.tick(), false);
assert.deepEqual(gameplaySnapshot(core.state), before);
const perfIdentity = core.state.perf;
const initialDamage = core.state.CONFIG.COMBAT_DAMAGE;
assert.throws(() => core.command({ type: "CONTROL", paused: false, speed: 3, CONFIG: { GRID_RES: 5 } }), /resolution/);
assert.equal(core.state.isPaused, true, "invalid command cannot partially unpause a simulation");
assert.equal(core.state.simSpeed, 1);
core.command({ type: "CONTROL", speed: 3, paused: false, bombsDisabled: true,
 CONFIG: { COMBAT_DAMAGE: initialDamage + 2 }, perfMode: "detailed",
 countryPatches: [{ id: 1, role: "SUPPORT", hiddenBuffState: "buff", color: "#d2bb74" }],
});
assert.equal(core.state.perf, perfIdentity, "profiling controls retain held metric references");
assert.equal(core.state.perf._mode, "detailed");
assert.equal(core.state.perf._enabled, true);
assert.equal(core.state.sides[0][0].role, "SUPPORT");
assert.equal(core.state.countryMetadata[0].hiddenBuffState, "buff");
assert.equal(core.state.countryMetadata[0].color, "#d2bb74");
assert.equal(core.state.CONFIG.COMBAT_DAMAGE, initialDamage + 2);
assert.equal(sibling.state.CONFIG.COMBAT_DAMAGE, initialDamage, "owner config changes cannot leak into another core");
core.command({ type: "CONTROL", countries: [{ id: 2, strategy: "DEFENSIVE" }] });
assert.equal(core.state.sides[1][0].strategy, "DEFENSIVE");
core.command("CONTROL", { countryPatch: { countryId: 1, patch: { buffState: "none" } } });
assert.equal(core.tick(), true);
assert.equal(core.state.perf.ticks, 1);
assert.ok(dirty.some(cells => cells?.length), "occupation intensity updates emit deltas even without a side change");

const input = {
 landMask: core.state.landMask, dominantSideMap: core.state.dominantSideMap,
 hostile: core.state.areSidesHostile, gridWidth: core.state.gridWidth,
 gridHeight: core.state.gridHeight, gridRes: core.state.CONFIG.GRID_RES,
 sideCount: core.state.sides.length,
 units: core.state.units.map(unit => ({ ...unit, previousPairKey: unit.frontSlot?.pairKey,
 previousSegmentIdx: unit.frontSlot?.segmentIdx || 0 })),
};
const expectedField = buildDirectionField(input);
const expectedLayout = buildLayout(input);
core.state.dispatchFrontlineWork(true, true);
assert.deepEqual(core.state.frontlineDirLat, expectedField.frontlineDirLat);
assert.deepEqual(core.state.frontlineDirLng, expectedField.frontlineDirLng);
assert.deepEqual(core.state._frontlinePolys, expectedLayout.polylines);
for (const assignment of expectedLayout.slotAssignments) {
 const unit = core.state.units.find(entry => entry.id === assignment.unitId);
 assert.equal(unit.frontSlot?.pairKey ?? null, assignment.pairKey);
 if (assignment.pairKey) assert.equal(unit.frontSlot.segmentIdx, assignment.segmentIdx);
}
const fieldBuffer = core.state.frontlineDirLat;
core.state.dispatchFrontlineWork(true, false);
assert.equal(core.state.frontlineDirLat, fieldBuffer, "field rebuild reuses its owned scratch buffers");
const custom = core.state.createArmyFormation({ lat: 0, lng: 0, sideIndex: 0, sovereignId: 1, isAlpenjager: true, mountainHealth: true });
assert.equal(custom.health, core.state.CONFIG.UNIT_HEALTH * core.state.CONFIG.ALPEN_HEALTH_MULT);
assert.equal(createArmyFormation({ lat: 0, lng: 0 }, { UNIT_HEALTH: 123, ALPEN_HEALTH_MULT: 2 }).health, 123);

core.command({ type: "APPLY_TREATY", treatyType: "WHITE_PEACE" });
assert.equal(core.state.gameState, "WAR_OVER");
assert.equal(core.tick(), false);
assert.equal(core.state.gameTimeEnabled, false);
assert.ok(dirty.includes(null), "treaty map changes emit full dirty invalidation");
for (const type of ["presentTreatyStart", "presentTreatyNotice", "onPoliticalMapChanged", "onConflictMapChanged", "presentTreatyFinished"])
 assert.ok(events.some(event => event.type === type), `treaty emits ${type}`);
assert.ok(core.state.sideInfluenceMaps.every(map => toDenseInfluenceMap(map).every(value => value === 0)));
assert.equal(sibling.state.gameState, "SIMULATING");
assert.throws(() => core.command("UNKNOWN"), /Unknown/);
for (const treatyType of ["FULL_CAPITULATION", "PEACE_TREATY", "ANNEXATION"]) {
 const treaty = createSimulationCore(fixture());
 treaty.tick();
 treaty.command({ type: "APPLY_TREATY", treatyType, winnerSideIdx: 0 });
 assert.equal(treaty.state.gameState, "WAR_OVER");
 assert.ok(treaty.state.sideInfluenceMaps.every(map => toDenseInfluenceMap(map).every(value => value === 0)));
}
const surrender = createSimulationCore(fixture());
surrender.tick();
surrender.state.casualtyByAttacker.set(2, new Map([[1, 400]]));
assert.equal(surrender.state.capitulateCountry(surrender.state.sides[1][0], 1), true);
assert.equal(surrender.state.sides[1].length, 0);
assert.ok(surrender.state.units.every(unit => unit.sovereignId !== 2));
assert.equal(surrender.state.countryMetadata[1].releasableBy, 1);
surrender.tick();
assert.equal(surrender.state.gameState, "WAR_OVER", "country capitulation uses the same owned conflict resolution");

const profiling = createSimulationCore(fixture());
profiling.command({ type: "CONTROL", perfMode: "detailed", perfResetGeneration: 1 });
const heldMetrics = profiling.state.perf;
for (let tick = 0; tick < 4; tick++) profiling.tick();
const tracker = createControlDeltaTracker(profiling.state);
const firstProfile = createPresentationSnapshot(profiling.state, tracker);
assert.equal(firstProfile.metrics.controlGeneration, 1);
assert.deepEqual(firstProfile.metrics.history.map(entry => entry.tick), [1, 2, 3, 4]);
profiling.command({ type: "CONTROL", perfResetGeneration: 1 });
assert.equal(heldMetrics.ticks, 4, "repeated control generation preserves collected measurements");
const beforeReset = gameplaySnapshot(profiling.state);
profiling.command({ type: "CONTROL", perfMode: "detailed", perfResetGeneration: 2 });
assert.equal(profiling.state.perf, heldMetrics);
assert.equal(heldMetrics.ticks, 0);
assert.equal(heldMetrics.tickTotal, 0);
assert.equal(heldMetrics.maxTick, 0);
assert.deepEqual(heldMetrics._history, []);
assert.deepEqual(gameplaySnapshot(profiling.state), beforeReset,
 "profiling reset preserves simulation ticks, cohorts, calendar and formations");
profiling.tick(); profiling.tick();
const nextProfile = createPresentationSnapshot(profiling.state, tracker);
assert.equal(nextProfile.metrics.controlGeneration, 2);
assert.equal(nextProfile.metrics.ticks, 2);
assert.deepEqual(nextProfile.metrics.history.map(entry => entry.tick), [1, 2], "reset snapshot cursor admits the new profiling window from its first tick");
assert.equal(profiling.state._simTickCount, 6);
profiling.command({ type: "CONTROL", perfTrackingPaused: true });
profiling.tick();
assert.equal(heldMetrics._history.length, 2, "tracking pause suppresses history without pausing mechanics");
assert.equal(profiling.state._simTickCount, 7);
profiling.command({ type: "CONTROL", perfTrackingPaused: false });
profiling.tick();
assert.equal(heldMetrics._history.at(-1).tick, 4);
console.log("Fixed clock schedules, speed/pause budgets, deterministic real simulation, independent owners, frontline scratch and treaty controls passed");
