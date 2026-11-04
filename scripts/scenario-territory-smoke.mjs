import assert from "node:assert/strict";
import { decodeScenarioBinary, decodeScenarioJson, encodeScenario } from "../src/scenario-codec.js";
import { generateScenarioSnapshot } from "../src/scenario-export.js";
import { applyScenarioSovereigntyOverrides, scenarioContextWithHistoricalSource } from "../src/scenario-territory.js";

const countryMetadata = [{ id: 136, name: "Russia" }, { id: 167, name: "Ukraine" }];
function target(resolution) {
	const width = Math.ceil(360 / resolution);
	const length = width * Math.ceil(180 / resolution);
	return {
		width,
		sourceGridRes: 0.1,
		targetGridRes: resolution,
		deJureMap: new Uint16Array(length).fill(136),
		landMask: new Uint8Array(length).fill(1),
		countryMetadata,
	};
}

for (const resolution of [0.1, 0.15, 0.25]) {
	const context = target(resolution);
	const control = new Uint16Array(context.deJureMap);
	context.worldControlMap = control;
	const sourceCells = [0, 1, 3600, 3601];
	applyScenarioSovereigntyOverrides([{ ownerId: 167, cells: sourceCells }], context);
	const expected = resolution === 0.25 ? [0] : [0, 1, context.width, context.width + 1];
	for (const index of expected) assert.equal(context.deJureMap[index], 167);
	assert.equal(context.deJureMap[2], 136, "neighboring territory is unchanged");
	assert.equal(context.deJureMap[context.deJureMap.length - 1], 136);
	assert.deepEqual(control, new Uint16Array(control.length).fill(136), "military control remains unchanged");
}

const fine = target(0.1);
fine.sourceGridRes = 0.25;
fine.landMask[1] = 0;
const writes = applyScenarioSovereigntyOverrides([{ ownerId: 167, cells: [0] }], fine);
assert.equal(writes, 8, "one coarse cell covers nine fine cells, excluding water");
assert.equal(fine.deJureMap[1], 136, "overrides do not create sovereignty on water");
assert.equal(fine.deJureMap[2 * fine.width + 2], 167);
assert.equal(fine.deJureMap[3], 136);

const tiny = target(90);
tiny.sourceGridRes = 90;
const unchanged = new Uint16Array(tiny.deJureMap);
for (const invalid of [
	{},
	[{ ownerId: 0, cells: [0] }],
	[{ ownerId: 65_536, cells: [0] }],
	[{ ownerId: 123, cells: [0] }],
	[{ ownerId: 167, cells: "0" }],
	[{ ownerId: 167, cells: [-1] }],
	[{ ownerId: 167, cells: [0.5] }],
	[{ ownerId: 167, cells: [Number.NaN] }],
	[{ ownerId: 167, cells: [8] }],
	[{ ownerId: 167, cells: new Array(9).fill(0) }],
	[{ ownerId: 167, cells: [0] }, { ownerId: 167, cells: [99] }],
]) {
	assert.throws(() => applyScenarioSovereigntyOverrides(invalid, tiny));
	assert.deepEqual(tiny.deJureMap, unchanged, "invalid input cannot partially mutate sovereignty");
}
for (const sourceGridRes of [0, 0.001, Infinity, Number.NaN, "0.1"]) {
	assert.throws(() => applyScenarioSovereigntyOverrides([{ ownerId: 167, cells: [0] }], { ...tiny, sourceGridRes }));
}
assert.throws(() => applyScenarioSovereigntyOverrides([{ ownerId: 167, cells: [0] }], { ...tiny, landMask: new Uint8Array(1) }));
assert.equal(applyScenarioSovereigntyOverrides(undefined, {}), 0, "legacy scenarios need no sovereignty data");
assert.equal(applyScenarioSovereigntyOverrides([], {}), 0);

// Export only known, occupied land. The binary metadata retains the optional mask.
const state = {
	worldControlMap: Uint16Array.from([136, 167, 136, 136, 0, 136, 0, 0]),
	deJureMap: Uint16Array.from([167, 167, 167, 999, 167, 0, 0, 0]),
	landMask: Uint8Array.from([1, 1, 0, 1, 1, 1, 0, 0]),
	biomeMask: new Uint8Array(8),
	countryMetadata,
	cities: [],
	gridRes: 90,
};
const snapshot = generateScenarioSnapshot("Historical ownership", state);
assert.equal(snapshot.sovereigntyBase, "control");
assert.deepEqual(snapshot.sovereigntyOverrides, [{ ownerId: 167, cells: [0] }]);
const restored = decodeScenarioBinary(encodeScenario(snapshot));
const militaryControl = new Uint16Array(restored.worldControl);
applyScenarioSovereigntyOverrides(restored.scenario.sovereigntyOverrides, {
	sourceGridRes: restored.scenario.gridRes,
	targetGridRes: restored.target.gridRes,
	deJureMap: restored.deJure,
	landMask: restored.land,
	countryMetadata: restored.scenario.metadata,
	sovereigntyBase: restored.scenario.sovereigntyBase,
	worldControlMap: restored.worldControl,
});
assert.equal(restored.deJure[0], 167);
assert.equal(restored.worldControl[0], 136);
assert.deepEqual(restored.worldControl, militaryControl);
assert.equal(Object.hasOwn(generateScenarioSnapshot("Legacy", { ...state, deJureMap: undefined }), "sovereigntyOverrides"), false);
assert.equal(Object.hasOwn(generateScenarioSnapshot("Legacy", { ...state, deJureMap: undefined }), "sovereigntyBase"), false);

// Liberated Crimea has equal control and sovereignty, so its compact export has
// no override. A control baseline must replace both a cleared JSON grid and an
// unrelated Natural Earth sovereignty raster before applying remaining claims.
const liberated = generateScenarioSnapshot("Liberated Crimea", {
	...state,
	worldControlMap: Uint16Array.from([167, 136, 0, 0, 0, 0, 0, 0]),
	deJureMap: Uint16Array.from([167, 136, 0, 0, 0, 0, 0, 0]),
	landMask: Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0]),
});
assert.equal(liberated.sovereigntyOverrides, undefined);
for (const decode of [() => decodeScenarioJson(liberated), () => decodeScenarioBinary(encodeScenario(liberated))]) {
	for (const staleOwner of [0, 136]) {
		const loaded = decode();
		loaded.deJure.fill(staleOwner);
		const changed = applyScenarioSovereigntyOverrides(loaded.scenario.sovereigntyOverrides, {
			sourceGridRes: loaded.scenario.gridRes,
			targetGridRes: loaded.target.gridRes,
			deJureMap: loaded.deJure,
			landMask: loaded.land,
			countryMetadata: loaded.scenario.metadata,
			sovereigntyBase: loaded.scenario.sovereigntyBase,
			worldControlMap: loaded.worldControl,
		});
		assert.ok(changed > 0, "baseline-only restoration requires a fresh restart snapshot");
		assert.equal(loaded.deJure[0], 167, "liberated Crimea keeps Ukrainian sovereignty");
		assert.equal(loaded.deJure[1], 136, "other control territory remains unchanged");
		assert.equal(loaded.deJure[2], 0, "a stale map cannot retain water claims");
	}
}
assert.throws(() => applyScenarioSovereigntyOverrides(undefined, { ...tiny, sovereigntyBase: "unknown" }));
assert.throws(() => applyScenarioSovereigntyOverrides(undefined, { ...tiny, sovereigntyBase: "control", worldControlMap: new Uint16Array(1) }));
assert.throws(() => applyScenarioSovereigntyOverrides([{ ownerId: 167, cells: [99] }], { ...tiny, sovereigntyBase: "control", worldControlMap: new Uint16Array(8).fill(167) }));
assert.deepEqual(tiny.deJureMap, unchanged, "invalid overrides cannot partially apply a new baseline");

const historicalSource = {
	name: "DeepStateMap.live",
	url: "https://deepstatemap.live/",
	date: "2023-01-01",
	method: "Independent manual reconstruction",
};
const historical = { name: "Ukraine 2023", historicalSource };
const firstContext = scenarioContextWithHistoricalSource(null, historical);
assert.equal(firstContext.name, historical.name);
assert.deepEqual(firstContext.historicalSource, historicalSource);
assert.notEqual(firstContext.historicalSource, historicalSource, "runtime provenance is not shared with imported data");
const exported = generateScenarioSnapshot("Remix", { ...state, historicalSource: firstContext.historicalSource });
assert.deepEqual(exported.historicalSource, historicalSource);
assert.notEqual(exported.historicalSource, firstContext.historicalSource);
const reloadedContext = scenarioContextWithHistoricalSource(null, decodeScenarioBinary(encodeScenario(exported)).scenario);
assert.deepEqual(reloadedContext.historicalSource, historicalSource);
assert.equal(reloadedContext.name, "Remix");
const unrelated = scenarioContextWithHistoricalSource(firstContext, { name: "Other scenario" });
assert.equal(Object.hasOwn(unrelated, "historicalSource"), false, "unrelated loads clear historical attribution");
assert.deepEqual(firstContext.historicalSource, historicalSource, "clearing a subsequent context does not mutate the previous one");
assert.equal(scenarioContextWithHistoricalSource(null, { name: "Legacy" }), null);
assert.equal(Object.hasOwn(scenarioContextWithHistoricalSource(firstContext, { historicalSource: "invalid" }), "historicalSource"), false);
console.log("Scenario sovereignty remapping, bounds, control isolation, liberated territory and provenance roundtrips passed");
