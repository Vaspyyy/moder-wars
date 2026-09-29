import assert from "node:assert/strict";
import { createBenchmarkRuntime } from "../src/benchmark-runtime.js";
import { createSimulationCore } from "../src/simulation-core.js";
import { createEngine } from "../src/simulation-engine.js";
import { captureSimulationState } from "../src/simulation-protocol.js";
import { resizeSimulationGrid } from "../src/simulation-resize.js";
import { createSimulationState } from "../src/simulation-state.js";
import { createDeterministicJob } from "../src/simulation-jobs.js";
import { expandSavedCells, packSavedCells } from "../src/saved-cells.js";
import { createTinySimulationState } from "./simulation-fixture.mjs";

const snapshotFields = new Map([
 ["initialWorldControlMapSnapshot", "worldControlMap"],
 ["initialDeJureMapSnapshot", "deJureMap"],
 ["initialProvinceMapSnapshot", "provinceMap"],
 ["initialLandMaskSnapshot", "landMask"],
 ["initialBiomeMaskSnapshot", "biomeMask"],
]);
const fields = ["worldControlMap", "deJureMap", "landMask", "provinceMap", "occupationMap", "dominantSideMap", "primaryOccupierMap", "biomeMask", "terrainMask", "initialOwnerMap", ...snapshotFields.keys()];
function makeRuntime() {
	const state = createSimulationState(createTinySimulationState({ paused: true }));
	for (let i = 0; i < state.landMask.length; i++) {
		state.worldControlMap[i] = 1 + i % 2;
		state.deJureMap[i] = 1 + i % 3;
		state.landMask[i] = i % 3;
		state.provinceMap[i] = Math.imul(i + 1, 1234567);
		state.occupationMap[i] = (i % 2 ? -1 : 1) * (i % 19) / 19;
		state.dominantSideMap[i] = i % 3 - 1;
		state.primaryOccupierMap[i] = i % 4;
		state.biomeMask[i] = i % 16;
		state.terrainMask[i] = i % 17 / 16;
		state.initialOwnerMap[i] = i % 5;
		state.sideInfluenceMaps[0][i] = i % 11 / 10;
		state.sideInfluenceMaps[1][i] = i % 13 / 12;
	}
	const pairs = [[17, 9], [18, 9], [17, 9], [0, 0], [35, 17]];
	Object.assign(state.countryMetadata[0], packSavedCells({ savedCells: pairs }, state.gridWidth));
	state.countryMetadata[1].savedCells = pairs;
	for (const [snapshot, field] of snapshotFields) {
		state[snapshot] = state[field].slice();
		// Baseline owner/province state differs from the live war grid.
		if (field === "worldControlMap" || field === "deJureMap") state[snapshot].fill(2);
		if (field === "provinceMap") state[snapshot].fill(71);
	}
	state.initialCountryMetadataSnapshot = structuredClone(state.countryMetadata);
	state.initialCitiesSnapshot = structuredClone(state.cities);
	// One object can occur in several membership/metadata/history collections.
	state.sides[0][0] = state.countryMetadata[0];
	state.initialCombatants[0] = state.countryMetadata[0];
	state.countryMetadata[0].flag = { marker: "UI flag image" };
	state.countryMetadata[0].feature = { marker: "raw editor geometry" };
	state.units[0].history = [{ tick: 12, action: "landed" }];
	state.aiCountryState.set(1, { pressureHistory: [0.1, 0.3], priorPlan: "PUSH" });
	state.countryCasualties.set(1, 1234);
	state._simulationWorldGeneration = 7;
	state._territoryLedger = { marker: "old ledger" };
	state._mopUpOwnedCellCache.set(1, [123]);
	state._tickUnitGridIdx.set(state.units[0], 123);
	state._coastalLandIndices = [123];
	state._coastalTopologyReady = true;
	state._simulationJobs.enqueue(createDeterministicJob({ id: "old-grid", totalItems: 100, processRange: () => { throw new Error("stale job ran"); } }));
	return state;
}
function sourceIndex(old, resolution, x, y) {
	const lat = Math.min(90 - 1e-9, (y + 0.5) * resolution - 90);
	const lng = Math.min(180 - 1e-9, (x + 0.5) * resolution - 180);
	return createEngine(old).getGridIndex(lat, lng);
}
function expectedMask(pairs, sourceResolution, resized) {
	const engine = createEngine(resized), seen = new Set(), result = [];
	for (const [x, y] of pairs) {
		const index = engine.getGridIndex((y + 0.5) * sourceResolution - 90, (x + 0.5) * sourceResolution - 180);
		if (index < 0 || seen.has(index)) continue;
		seen.add(index); result.push([index % resized.gridWidth, Math.floor(index / resized.gridWidth)]);
	}
	return result;
}
for (const resolution of [5, 7.5, 20, 17]) {
	const runtime = makeRuntime();
	const old = { CONFIG: { ...runtime.CONFIG }, gridWidth: runtime.gridWidth, gridHeight: runtime.gridHeight };
	const maps = Object.fromEntries(fields.map(name => [name, runtime[name]]));
	const influences = runtime.sideInfluenceMaps;
	const masks = runtime.countryMetadata.map(country => expandSavedCells(country));
	const restartMetadata = runtime.initialCountryMetadataSnapshot;
	const restartMasks = restartMetadata.map(country => expandSavedCells(country));
	const restartCities = runtime.initialCitiesSnapshot;
	const restartCityValues = structuredClone(restartCities);
	const countries = runtime.countryMetadata.slice(), units = runtime.units;
	const unitValues = structuredClone(units), sideSoldiers = runtime.sideSoldiers, casualties = runtime.countryCasualties, ai = runtime.aiCountryState;
	const flag = countries[0].flag, geometry = countries[0].feature;
	const calls = [];
	runtime.invalidateFrontlineField = () => calls.push("frontline");
	runtime.notifyPoliticalMapLoaded = () => calls.push("political");
	runtime.requestOperationalAiReassessment = () => calls.push("reassess");
	runtime.scheduleCoastalTopologyJob = () => calls.push("coast");
	runtime.createRuntimeTerritoryLedger = () => { calls.push("ledger"); assert.equal(runtime.CONFIG.GRID_RES, resolution); return { marker: "new ledger" }; };
	runtime.flushTerritoryLedger = () => { calls.push("flush"); return { marker: "new snapshot" }; };
	runtime.publishTerritoryLedgerSnapshot = (snapshot, decisionBoundary) => { assert.equal(snapshot.marker, "new snapshot"); assert.equal(decisionBoundary, true); calls.push("publish"); };
	assert.equal(resizeSimulationGrid(runtime, resolution), true);
	assert.equal(runtime.gridWidth, Math.ceil(360 / resolution));
	assert.equal(runtime.gridHeight, Math.ceil(180 / resolution));
	for (let y = 0; y < runtime.gridHeight; y++) for (let x = 0; x < runtime.gridWidth; x++) {
		const source = sourceIndex(old, resolution, x, y), target = y * runtime.gridWidth + x;
		for (const name of fields) {
			assert.equal(runtime[name].constructor, maps[name].constructor, `${name} typed storage survives`);
			assert.ok(Object.is(runtime[name][target], maps[name][source]), `${name} exact sample at ${x},${y}, resolution${resolution}`);
		}
		for (let side = 0; side < influences.length; side++) assert.ok(Object.is(runtime.sideInfluenceMaps[side][target], influences[side][source]));
	}
	for (let i = 0; i < countries.length; i++) {
		assert.equal(runtime.countryMetadata[i], countries[i], "country object identities remain stable");
		assert.equal(countries[i].initialCells, 324 * (10 / resolution) ** 2, "original territory scales once by physical cell area");
		assert.deepEqual(expandSavedCells(countries[i]), expectedMask(masks[i], 10, runtime));
		assert.equal(countries[i].savedCellWidth, runtime.gridWidth);
	}
	assert.equal(runtime.initialCountryMetadataSnapshot, restartMetadata, "start metadata snapshot identity is preserved");
	for (let i = 0; i < restartMetadata.length; i++) {
		assert.deepEqual(expandSavedCells(restartMetadata[i]), expectedMask(restartMasks[i], 10, runtime), "start snapshot releasable masks use the resized grid");
		assert.equal(restartMetadata[i].initialCells, 324 * (10 / resolution) ** 2);
	}
	assert.equal(runtime.initialCitiesSnapshot, restartCities, "geographic city snapshots are unchanged");
	assert.deepEqual(restartCities, restartCityValues);
	assert.equal(countries[0].flag, flag); assert.equal(countries[0].feature, geometry);
	assert.equal(runtime.units, units); assert.deepEqual(runtime.units, unitValues);
	assert.equal(runtime.sideSoldiers, sideSoldiers); assert.equal(runtime.countryCasualties, casualties); assert.equal(runtime.aiCountryState, ai);
	assert.equal(runtime.countryCasualties.get(1), 1234);
	assert.equal(runtime._simulationWorldGeneration, 8);
	assert.equal(runtime._simulationJobs.size(), 0);
	assert.equal(runtime._mopUpOwnedCellCache.size, 0);
	assert.equal(runtime._tickUnitGridIdx.size, 0);
	assert.deepEqual(runtime._coastalLandIndices, []);
	assert.equal(runtime._coastalTopologyReady, false);
	assert.deepEqual(calls, ["frontline", "political", "reassess", "coast", "ledger", "flush", "publish"]);
	const identities = fields.map(name => runtime[name]);
	assert.equal(resizeSimulationGrid(runtime, resolution), false);
	assert.deepEqual(fields.map(name => runtime[name]), identities);
	for (let i = 0; i < fields.length; i++) assert.equal(runtime[fields[i]], identities[i], "no-op resize does not allocate");
}

// Exercise the actual baseline-restore function with inert DOM method stubs.
// No browser is created: this verifies its typed-grid length guards and copies.
const restart = makeRuntime();
resizeSimulationGrid(restart, 7.5);
const expectedRestored = Object.fromEntries([...snapshotFields].map(([snapshot, field]) => [field, restart[snapshot].slice()]));
for (const field of snapshotFields.values()) restart[field].fill(0);
Object.assign(restart, createEngine(restart), {
 deepClone: structuredClone, invalidateWarLifecycleTimers: () => {}, resetOperationalAiRuntime: () => {}, animationFrameId: null,
});
const previousDocument = globalThis.document;
globalThis.document = { body: { classList: { remove: () => {} } }, getElementById: () => ({ style: {} }) };
try {
 createBenchmarkRuntime(restart).prepareIsolatedBenchmarkRun();
 for (const field of snapshotFields.values()) assert.deepEqual(restart[field], expectedRestored[field], `${field} actual start-state restore works after live resize`);
 assert.deepEqual(restart.countryMetadata, restart.initialCountryMetadataSnapshot);
 assert.deepEqual(restart.cities, restart.initialCitiesSnapshot);
} finally {
 if (previousDocument === undefined) delete globalThis.document;
 else globalThis.document = previousDocument;
}

const invalid = makeRuntime();
const originalGrid = invalid.worldControlMap;
for (const resolution of [0, -1, NaN, Infinity, "5", 1e-10]) assert.throws(() => resizeSimulationGrid(invalid, resolution), RangeError);
invalid.terrainMask = new Float32Array(1);
assert.throws(() => resizeSimulationGrid(invalid, 5), /Source grid size mismatch/);
assert.equal(invalid.worldControlMap, originalGrid); assert.equal(invalid.CONFIG.GRID_RES, 10, "failed preparation never commits partial new state");

// Verify actual runtime helpers rebuild ledger/frontline caches, then resume in a
// new worker owner with valid dense handoff arrays rather than an empty world.
const core = createSimulationCore(createTinySimulationState({ paused: true }));
const priorUnits = core.state.units, history = core.state.countryCasualties;
core.state.units[0].history = ["held-front"];
core.state.units[0].frontSlot = { targetLat: 5, targetLng: -5 };
assert.equal(resizeSimulationGrid(core.state, 5), true);
assert.equal(core.state.units, priorUnits); assert.equal(core.state.countryCasualties, history);
assert.deepEqual(core.state.units[0].history, ["held-front"]);
assert.equal(core.state.units[0].frontSlot, null, "derived frontline slots are invalidated");
assert.ok(core.state._territoryLedger);
assert.equal(core.state._cachedSideTerritoryCounts[0], 72 * 36 / 2);
assert.equal(core.state._cachedSideTerritoryCounts[1], 72 * 36 / 2);
const resumed = createSimulationCore(captureSimulationState(core.state, { denseInfluence: true }));
resumed.command({ type: "CONTROL", paused: false });
for (let i = 0; i < 8; i++) assert.equal(resumed.tick(), true);
assert.equal(resumed.state.gameState, "SIMULATING");
assert.ok(resumed.state.worldControlMap.some(value => value === 1) && resumed.state.worldControlMap.some(value => value === 2));
console.log("Grid integer/fractional center samples, dense influences, saved masks, area baselines, atomic failures, preserved history/assets, and resumed-core ledger caches passed.");
