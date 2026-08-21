import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
assert.match(main, /native-runtime-checkpoint-v5/);
assert.match(main, /native-operational-ai-v1/);
assert.match(main, /function buildMidWarNativeRuntimeCheckpointV5/);
assert.match(main, /if \(version === 5\) return buildMidWarNativeRuntimeCheckpointV5/);
assert.match(main, /Native runtime checkpoint version must be 1, 2, 3, 4, or 5/);
for (const field of [
	"hostileSideIndices", "prewarEnemyPower", "lastScanTick", "revision",
	"assignedTick", "routeProgress", "supplyInvalidatedTick", "intentRevision",
	"countryDesperation", "overrideEvents", "nextOverrideSequence",
]) assert.match(main, new RegExp(field));

const start = main.indexOf("function buildMidWarNativeRuntimeCheckpointV5");
const end = main.indexOf("function createNativeRuntimeCheckpoint", start);
assert.ok(start >= 0 && end > start);
const body = main.slice(start, end);
assert.match(body, /nativeRuntimeStableTopology\(\)/);
assert.match(body, /nativeUnitId/);
assert.match(body, /liveUnits = units\.filter/);
assert.match(body, /taskForces\.sort/);
assert.match(body, /countryDesperation\.sort/);
assert.doesNotMatch(
	body,
	/sideIndex: enemy\.sideIndex|nativeUnitSide\.get\(unitId\) !== entry\.sideIndex/,
);
console.log("native runtime checkpoint v5 smoke: ok");
