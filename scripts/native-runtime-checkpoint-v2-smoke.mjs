#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");

const signedStart = main.indexOf("function encodeNativeRuntimeRuns");
const signedEnd = main.indexOf("\nfunction nativeRuntimeTopology", signedStart);
assert.ok(signedStart >= 0 && signedEnd > signedStart, "v2 RLE encoders exist");
const encoders = Function(
	`"use strict";\n${main.slice(signedStart, signedEnd)}\nreturn { encodeNativeRuntimeSignedRuns, encodeNativeRuntimeFloat32BitRuns, encodeNativeRuntimeFiniteFloat32BitRuns, encodeNativeRuntimeOccupationBitRuns };`,
)();

const floatBitPattern = Uint32Array.of(
	0x00000000,
	0x80000000,
	0x3f800000,
	0x3f800000,
	0x7fc00001,
	0x7fc00001,
	0xff800000,
);
const floatSource = new Float32Array(floatBitPattern.buffer);
const floatRuns = encoders.encodeNativeRuntimeFloat32BitRuns(
	floatSource,
	"float32",
);
assert.deepEqual(
	floatRuns,
	[
		[1, 0x00000000],
		[1, 0x80000000],
		[2, 0x3f800000],
		[2, 0x7fc00001],
		[1, 0xff800000],
	],
	"Float32 RLE preserves exact u32 bits and emits maximal runs",
);
assert.deepEqual(
	floatRuns.flatMap(([length, value]) => new Array(length).fill(value)),
	Array.from(floatBitPattern),
	"Float32 bit RLE roundtrips every element",
);
assert.deepEqual(
	encoders.encodeNativeRuntimeSignedRuns(
		Int8Array.of(-1, -1, 0, 0, 1, -1),
		"dominance",
		-1,
		1,
	),
	[
		[2, -1],
		[2, 0],
		[1, 1],
		[1, -1],
	],
	"signed dominance RLE preserves neutral cells",
);
assert.throws(
	() => encoders.encodeNativeRuntimeFloat32BitRuns([1], "wrong-type"),
	/Float32Array/,
);

const terrainBits = Uint32Array.of(
	0x00000000,
	0x80000000,
	0x3f000000,
	0x3f000000,
	0x3f400000,
);
const terrainRuns = encoders.encodeNativeRuntimeFiniteFloat32BitRuns(
	new Float32Array(terrainBits.buffer),
	"terrain",
);
assert.deepEqual(
	terrainRuns,
	[
		[1, 0x00000000],
		[1, 0x80000000],
		[2, 0x3f000000],
		[1, 0x3f400000],
	],
	"finite terrain RLE preserves exact float bits and emits maximal runs",
);
assert.equal(
	terrainRuns.reduce((covered, [length]) => covered + length, 0),
	terrainBits.length,
	"finite terrain RLE exactly covers its dense map",
);
for (let index = 1; index < terrainRuns.length; index++) {
	assert.notEqual(
		terrainRuns[index - 1][1],
		terrainRuns[index][1],
		"finite terrain RLE has no adjacent equal-bit runs",
	);
}
for (const invalidTerrain of [
	Number.NaN,
	Number.POSITIVE_INFINITY,
	-0.25,
	1.25,
]) {
	assert.throws(
		() =>
			encoders.encodeNativeRuntimeFiniteFloat32BitRuns(
				Float32Array.of(0, invalidTerrain),
				"terrain",
			),
		/finite and within \[0, 1\]/,
	);
}

const browserOccupation = Float32Array.of(-7, -0.5, -0.5, 0.25, 0.25, 0.75);
const browserDominance = Int8Array.of(-1, 1, 1, 2, 2, 2);
const compactSides = new Map([
	[1, 0],
	[2, 1],
]);
const occupationRuns = encoders.encodeNativeRuntimeOccupationBitRuns(
	browserOccupation,
	browserDominance,
	compactSides,
	"occupation",
);
assert.deepEqual(
	occupationRuns,
	[
		[1, 0x00000000],
		[2, 0x3f000000],
		[2, 0xbe800000],
		[1, 0xbf400000],
	],
	"occupation sign follows compact native parity and equal projected bits form maximal runs",
);
const projectedOccupationBits = occupationRuns.flatMap(([length, value]) =>
	new Array(length).fill(value),
);
assert.deepEqual(
	projectedOccupationBits,
	[0x00000000, 0x3f000000, 0x3f000000, 0xbe800000, 0xbe800000, 0xbf400000],
	"browser sides 1/2 compact exactly to native occupation sides 0/1",
);
assert.equal(
	projectedOccupationBits[0],
	0,
	"a cell without a dominant side exports canonical positive zero",
);

assert.match(main, /native-runtime-checkpoint-v2/);
assert.match(main, /native-runtime-checkpoint-v3/);
assert.match(main, /native-runtime-checkpoint-v4/);
assert.match(main, /native-side-dynamics-v1/);
assert.match(main, /checkpointBoundary: "midWar"/);
assert.match(main, /version === 1.*cloneInitialNativeRuntimeCheckpoint/s);
assert.match(main, /version === 2.*buildMidWarNativeRuntimeCheckpoint/s);
assert.match(main, /version === 3.*buildMidWarNativeRuntimeCheckpointV3/s);
assert.match(main, /version === 4.*buildMidWarNativeRuntimeCheckpointV4/s);
assert.match(main, /const version = options\.version \?\? 1/);

const v1Start = main.indexOf("function buildInitialNativeRuntimeCheckpoint");
const v1End = main.indexOf(
	"function nativeRuntimeCasualtiesByVictim",
	v1Start,
);
const v1Builder = main.slice(v1Start, v1End);
assert.match(v1Builder, /schema: NATIVE_RUNTIME_CHECKPOINT_SCHEMA/);
assert.match(v1Builder, /checkpointBoundary: "postStartWar"/);
assert.doesNotMatch(v1Builder, /territory|casualtiesByVictim/);
assert.doesNotMatch(v1Builder, /battlefield/);
assert.doesNotMatch(v1Builder, /policyContext, true/);

const v2Start = main.indexOf("function buildMidWarNativeRuntimeCheckpoint");
const v2End = main.indexOf(
	"function captureInitialNativeRuntimeCheckpoint",
	v2Start,
);
const v2Builder = main.slice(v2Start, v2End);
assert.match(v2Builder, /serializeNativeRuntimeUnit\(unit, index \+ 1, policyContext, true\)/);
assert.doesNotMatch(v2Builder, /influenceRuntime/);
assert.doesNotMatch(v2Builder, /sideDynamics/);
const v3DynamicsStart = main.indexOf("function buildMidWarNativeRuntimeCheckpointV3");
const v3DynamicsEnd = main.indexOf("function nativeRuntimeV4SideDynamics", v3DynamicsStart);
const v3DynamicsBuilder = main.slice(v3DynamicsStart, v3DynamicsEnd);
assert.doesNotMatch(v3DynamicsBuilder, /sideDynamics/);
const v4Start = main.indexOf("function nativeRuntimeV4SideDynamics");
const v4End = main.indexOf(
	"function buildMidWarNativeRuntimeCheckpointV5",
	v4Start,
);
const v4Builder = main.slice(v4Start, v4End);
assert.match(v4Builder, /browserToNativeSide/);
assert.match(v4Builder, /sideIndex: nativeSideIndex/);
assert.doesNotMatch(v4Builder, /browserSideIndex,|sideUid,|countryIds:|activeCountryIds|capitulatedCountryIds/);
assert.match(v4Builder, /sideSoldiers\[browserSideIndex\]/);
assert.match(v4Builder, /initialSideSoldiers\[browserSideIndex\]/);
assert.match(v4Builder, /_sideMomentumHistory\[browserSideIndex\]/);
assert.match(v4Builder, /frame: Number\(entry\.tick\)/);
assert.match(v4Builder, /_sideWarPhase\[browserSideIndex\]/);
assert.match(v4Builder, /_sidePosture\[browserSideIndex\]/);
assert.match(v4Builder, /postureOverride/);
assert.match(v4Builder, /AI_POSTURE\.LAST_STAND/);
assert.match(v4Builder, /AI_POSTURE\.OFFENSIVE_DESPERATION/);
assert.match(v4Builder, /_defenderReactionPlan\[browserSideIndex\]/);
assert.match(v4Builder, /nativeRuntimeV4BaseAiSpeedMultiplier/);
assert.match(v4Builder, /battlefield,/);
assert.match(v4Builder, /history.length > 10/);
assert.match(v4Builder, /entry.frame > simFrameCount/);
assert.match(v4Builder, /entry.frame < history\[index - 1\].frame/);
assert.match(v4Builder, /Native side dynamics phase is invalid/);
assert.match(v4Builder, /Native side dynamics posture is invalid/);

const sideDynamicsEnd = main.indexOf(
	"function buildMidWarNativeRuntimeCheckpointV4",
	v4Start,
);
const aiProfiles = new Map([[1, { mode: "LAST_STAND" }]]);
const aiPostures = {
	LAST_STAND: "LAST_STAND",
	OFFENSIVE_DESPERATION: "OFFENSIVE_DESPERATION",
	DEFENSIVE_DESPERATION: "DEFENSIVE_DESPERATION",
};
const defenderReactionPlans = [true, true];
const v4Helpers = Function(
	"sideUids",
	"_retiredSidePersonnelByUid",
	"sideSoldiers",
	"initialSideSoldiers",
	"_sideMomentumHistory",
	"simFrameCount",
	"_sideWarPhase",
	"_sidePosture",
	"NATIVE_SIDE_DYNAMICS_SCHEMA",
	"sides",
	"aiCountryState",
	"AI_POSTURE",
	"_defenderReactionPlan",
	`"use strict";\n${main.slice(v4Start, sideDynamicsEnd)}\nreturn { sideDynamics: nativeRuntimeV4SideDynamics, baseSpeed: nativeRuntimeV4BaseAiSpeedMultiplier };`,
)(
	["active-side", "retired-side"],
	new Map([
		[
			"retired-side",
			{ personnel: 125.5, initialPersonnel: 400 },
		],
	]),
	Float64Array.of(700.25, 0),
	Float64Array.of(1_000, 0),
	[
		[
			{ tick: 37, controlled: 100 },
			{ tick: 237, controlled: 105 },
		],
		[{ tick: 37, controlled: 20 }],
	],
	237,
	["ADVANCING", "RETREATING"],
	["OFFENSIVE", "DEFENSIVE"],
	"native-side-dynamics-v1",
	[[{ id: 1 }], []],
	aiProfiles,
	aiPostures,
	defenderReactionPlans,
);
const makeSideDynamics = v4Helpers.sideDynamics;
const sideDynamics = makeSideDynamics({
	stable: [{ browserSideIndex: 0 }, { browserSideIndex: 1 }],
	browserToNativeSide: new Map([
		[0, 0],
		[1, 1],
	]),
});
assert.deepEqual(sideDynamics, {
	schema: "native-side-dynamics-v1",
	sides: [
		{
			sideIndex: 0,
			initialPersonnel: 1_000,
			personnel: 700.25,
			momentumHistory: [
				{ frame: 37, controlled: 100 },
				{ frame: 237, controlled: 105 },
			],
			warPhase: "ADVANCING",
			posture: "OFFENSIVE",
			postureOverride: "DEFENSIVE",
		},
		{
			sideIndex: 1,
			initialPersonnel: 400,
			personnel: 125.5,
			momentumHistory: [{ frame: 37, controlled: 20 }],
			warPhase: "RETREATING",
			posture: "DEFENSIVE",
			postureOverride: null,
		},
	],
});
aiProfiles.set(1, { mode: "OFFENSIVE_DESPERATION" });
assert.equal(
	makeSideDynamics({
		stable: [{ browserSideIndex: 0 }, { browserSideIndex: 1 }],
		browserToNativeSide: new Map([
			[0, 0],
			[1, 1],
		]),
	}).sides[0].postureOverride,
	"OFFENSIVE",
);
assert.equal(v4Helpers.baseSpeed(1), 1.08);
aiProfiles.set(1, { mode: "DEFENSIVE_DESPERATION" });
assert.equal(v4Helpers.baseSpeed(1), 0.96);
aiProfiles.set(1, { mode: "LAST_STAND" });
assert.equal(v4Helpers.baseSpeed(1), 0.92);
aiProfiles.clear();
assert.equal(v4Helpers.baseSpeed(1), 1);
assert.equal(
	makeSideDynamics({
		stable: [{ browserSideIndex: 0 }, { browserSideIndex: 1 }],
		browserToNativeSide: new Map([
			[0, 0],
			[1, 1],
		]),
	}).sides[0].postureOverride,
	"DEFENSIVE",
);
defenderReactionPlans[0] = false;
assert.equal(
	makeSideDynamics({
		stable: [{ browserSideIndex: 0 }, { browserSideIndex: 1 }],
		browserToNativeSide: new Map([
			[0, 0],
			[1, 1],
		]),
	}).sides[0].postureOverride,
	null,
);
for (const field of [
	"scenario",
	"geography",
	"sides",
	"activeSides",
	"hostilityMatrix",
	"tick",
	"frame",
	"warGraceEnd",
	"strategicCycle",
	"steps",
	"units",
	"economies",
	"occupations",
	"casualties",
	"casualtiesByVictim",
	"territory",
	"battlefield",
]) {
	assert.match(v2Builder, new RegExp(`\\n\\t\\t${field}(?::|,)`));
}

const influenceRuntimeStart = main.indexOf(
	"function nativeRuntimeV3InfluenceRuntime",
);
const influenceRuntimeEnd = main.indexOf(
	"function buildMidWarNativeRuntimeCheckpointV3",
	influenceRuntimeStart,
);
assert.ok(
	influenceRuntimeStart >= 0 && influenceRuntimeEnd > influenceRuntimeStart,
	"v3 influence runtime builder exists",
);
const influenceRuntimeBuilder = main.slice(
	influenceRuntimeStart,
	influenceRuntimeEnd,
);
assert.match(influenceRuntimeBuilder, /ensureInfluenceFrontierQueue\(\)/);
assert.match(
	influenceRuntimeBuilder,
	/_influenceFrontierQueue\.slice\(_influenceFrontierCursor\)/,
);
assert.match(
	influenceRuntimeBuilder,
	/_influenceFrontierPriorityQueue\.slice\(\s*_influenceFrontierPriorityCursor,?\s*\)/s,
);
assert.match(influenceRuntimeBuilder, /queuedCells\.push\(\[cell, state\]\)/);
assert.match(influenceRuntimeBuilder, /schema: NATIVE_INFLUENCE_RUNTIME_SCHEMA/);

const v3Start = main.indexOf("function buildMidWarNativeRuntimeCheckpointV3");
const v3End = main.indexOf("function createNativeRuntimeCheckpoint", v3Start);
assert.ok(v3Start >= 0 && v3End > v3Start, "v3 checkpoint builder exists");
const v3Builder = main.slice(v3Start, v3End);
assert.match(v3Builder, /buildMidWarNativeRuntimeCheckpoint\(options\)/);
assert.match(v3Builder, /schema: NATIVE_RUNTIME_CHECKPOINT_V3_SCHEMA/);
assert.match(
	v3Builder,
	/influenceRuntime: nativeRuntimeV3InfluenceRuntime\(\)/,
);

const battlefieldStart = main.indexOf("function nativeRuntimeV2Battlefield");
const battlefieldEnd = main.indexOf(
	"function buildMidWarNativeRuntimeCheckpoint",
	battlefieldStart,
);
assert.ok(
	battlefieldStart >= 0 && battlefieldEnd > battlefieldStart,
	"v2 battlefield builder exists",
);
const battlefieldBuilder = main.slice(battlefieldStart, battlefieldEnd);
assert.match(battlefieldBuilder, /schema: NATIVE_RUNTIME_BATTLEFIELD_SCHEMA/);
assert.match(battlefieldBuilder, /mountainsEnabled: !!mountainsEnabled/);
assert.match(
	battlefieldBuilder,
	/encodeNativeRuntimeFiniteFloat32BitRuns\(\s*terrainMask,/s,
);
assert.match(battlefieldBuilder, /terrainMask\.length !== cellCount/);
assert.match(battlefieldBuilder, /countries\.length !== declaredCountryIds\.length/);
assert.match(battlefieldBuilder, /battlefieldUnits\.length !== liveUnits\.length/);
assert.match(battlefieldBuilder, /nativeSpeedScale: 1,/);
for (const field of [
	"discipline",
	"refusesOffense",
	"returnHome",
	"selfDefenseOnly",
	"homeTarget",
	"transitionCycle",
]) {
	assert.match(main, new RegExp(`\\n\\s+${field}(?::|,)`));
}
for (const field of [
	"unitSpeed",
	"unitNavalSpeed",
	"influenceRate",
	"influenceRadius",
	"encirclementRadius",
	"alpenMountainSpeedMultiplier",
	"alpenCombatMultiplier",
	"nativeSpeedScale",
	"activeCombatExclusionFrames",
	"longWarFrameThreshold",
	"longWarDefenseMultiplier",
	"armorSupportRadius",
	"armorSupportMemoryTicks",
]) {
	assert.match(battlefieldBuilder, new RegExp(`\\n\\t\\t${field}:`));
}
assert.doesNotMatch(
	main,
	/speedMultiplier:\s*landSpeedMultiplier\s*\*\s*Number\(aiProfile\.speedMult \|\| 1\)\s*\*\s*0\.8/,
	"the movement kernel owns the final 0.8 scale",
);
assert.match(
	battlefieldBuilder,
	/return \{ id, countryId, cell, lat, lng \}/,
);
for (const field of [
	"combatBuff",
	"influenceBuff",
	"attackBuffPercent",
	"defenseBuffPercent",
	"capitalLost",
	"warPhase",
	"conquestMode",
	"aiSpeedMultiplier",
]) {
	assert.match(battlefieldBuilder, new RegExp(`\\n\\t\\t\\t${field}(?::|,)`));
}
for (const field of [
	"unitId",
	"isAlpenjager",
	"cohesionSeed",
	"localTacticsExcluded",
	"encircledTicks",
	"armorSupportLastTick",
	"lastAllyCount",
]) {
	assert.match(battlefieldBuilder, new RegExp(`\\n\\t\\t\\t${field}(?::|,)`));
}

const territoryStart = main.indexOf("function nativeRuntimeV2Territory");
const territoryEnd = main.indexOf(
	"function buildMidWarNativeRuntimeCheckpoint",
	territoryStart,
);
const territoryBuilder = main.slice(territoryStart, territoryEnd);
assert.ok(
	territoryBuilder.indexOf("flushTerritoryLedger()") <
		territoryBuilder.indexOf("_territoryLedger?.getStatus()"),
	"v2 synchronously flushes the ledger before auditing census status",
);
for (const field of [
	"landRuns",
	"worldControlRuns",
	"deJureRuns",
	"primaryOccupierRuns",
	"dominantSideRuns",
	"occupationBitsRuns",
	"sideInfluenceBitsRuns",
]) {
	assert.match(territoryBuilder, new RegExp(`\\n\\t\\t\\t${field}(?::|,)`));
}
for (const field of [
	"topologyRevision",
	"worldRevision",
	"cityRevision",
	"generation",
	"commitSequence",
	"mutationSequence",
	"processedTiles",
	"processedItems",
]) {
	assert.match(territoryBuilder, new RegExp(`\\n\\t\\t\\t${field}:`));
}
assert.match(territoryBuilder, /encoding: "rle-bits-v1"/);
assert.match(
	territoryBuilder,
	/encodeNativeRuntimeRuns\(landMask, "landMask", 2\)/,
);
assert.match(territoryBuilder, /status\.activeGeneration !== null/);
assert.match(territoryBuilder, /status\.dirtyTiles !== 0/);
assert.match(territoryBuilder, /snapshot\.pendingDirtyTilesAtCommit !== 0/);
assert.match(
	territoryBuilder,
	/encodeNativeRuntimeOccupationBitRuns\(\s*occupationMap,\s*dominantSideMap,\s*topology\.browserToNativeSide,/s,
);

const topologyStart = main.indexOf("function nativeRuntimeStableTopology");
const topologyEnd = main.indexOf(
	"function nativeRuntimeUnitIsEncircled",
	topologyStart,
);
const topologyBuilder = main.slice(topologyStart, topologyEnd);
assert.match(topologyBuilder, /for \(const entry of initialCombatants\)/);
assert.match(topologyBuilder, /countryEconomy\.get\(countryId\)\?\.capitulated/);
assert.match(topologyBuilder, /activeSides/);

const armorSpawnStart = main.indexOf("function createArmorFormationAtIndex");
const armorSpawnEnd = main.indexOf(
	"function initializeCombinedArms",
	armorSpawnStart,
);
const armorSpawn = main.slice(armorSpawnStart, armorSpawnEnd);
assert.match(armorSpawn, /countryEconomy\.get\(countryId\)\?\.commandBand/);
assert.match(armorSpawn, /commandRefusalShare\(unitCommandBand\)/);
assert.doesNotMatch(armorSpawn, /_commandBand: COMMAND_BANDS\.PAID/);

assert.match(v2Builder, /nativeRuntimeWarIsActive\(\)/);
assert.match(v2Builder, /requires a mid-war state/);
assert.match(v2Builder, /nativeRuntimeStableTopology\(\)/);

console.log("Native runtime checkpoint v2/v3/v4 smoke tests passed.");
