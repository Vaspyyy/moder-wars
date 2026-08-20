import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const worker = fs.readFileSync(
	path.join(root, "workers/scenario-worker.js"),
	"utf8",
);

const start = main.indexOf("export async function _startWarInner()");
const end = main.indexOf("\nexport function computeAdjacency()", start);
assert.ok(start >= 0 && end > start, "startWar implementation is present");
const startWar = main.slice(start, end);
assert.ok(
	startWar.indexOf("captureInitialNativeRuntimeCheckpoint();") <
		startWar.lastIndexOf("requestAnimationFrame(updateLoop)"),
	"checkpoint is frozen before the first simulation frame is requested",
);

assert.match(main, /window\.nativeRuntimeCheckpoint\s*=\s*async/);
assert.match(main, /window\.downloadNativeRuntimeCheckpoint\s*=\s*async/);
assert.match(main, /_simTickCount !== 0 \|\| simFrameCount !== 0/);
assert.match(main, /native-runtime-checkpoint-v1/);
assert.match(main, /checkpointBoundary: "postStartWar"/);

const policyStart = main.indexOf("function resolveNativeRuntimeUnitPolicy");
const policyEnd = main.indexOf("\nfunction serializeNativeRuntimeUnit", policyStart);
assert.ok(policyStart >= 0 && policyEnd > policyStart, "policy resolver is present");
const policy = main.slice(policyStart, policyEnd);
assert.match(policy, /const temporalSeed = Number\(unit\.id\)/);
assert.match(policy, /radius: influenceRadius/);
assert.match(policy, /delta: influenceDelta/);
assert.match(policy, /temporalSeed,/);
assert.doesNotMatch(policy, /organicNoise|variedRadius|_simTickCount \/ 600/);

for (const field of [
	"checkpointBoundary",
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
]) {
	assert.match(
		main,
		new RegExp(`\\n\\t\\t${field}(?::|,)`),
		`checkpoint carries ${field}`,
	);
}

for (const field of ["landRuns", "deJureRuns", "worldControlRuns"]) {
	assert.match(main, new RegExp(`\\n\\t\\t${field}:`), `geography carries ${field}`);
}

const rleStart = main.indexOf("function encodeNativeRuntimeRuns");
const rleEnd = main.indexOf("\nfunction nativeRuntimeTopology", rleStart);
assert.ok(rleStart >= 0 && rleEnd > rleStart, "RLE encoder is present");
const encodeNativeRuntimeRuns = Function(
	`"use strict";\n${main.slice(rleStart, rleEnd)}\nreturn encodeNativeRuntimeRuns;`,
)();
const samples = [
	new Uint8Array([0, 0, 1, 1, 1, 0, 2, 2]),
	new Uint16Array([0, 65535, 65535, 3, 3, 3, 3, 0]),
	[7],
];
for (const [sampleIndex, sample] of samples.entries()) {
	const runs = encodeNativeRuntimeRuns(sample, `sample-${sampleIndex}`);
	const decoded = runs.flatMap(([length, value]) =>
		new Array(length).fill(value),
	);
	assert.deepEqual(decoded, Array.from(sample), "RLE roundtrips exactly");
	assert.equal(
		runs.reduce((total, [length]) => total + length, 0),
		sample.length,
		"RLE covers every cell exactly",
	);
	for (let index = 0; index < runs.length; index++) {
		const [length, value] = runs[index];
		assert.ok(
			Number.isSafeInteger(length) && length > 0,
			"run lengths are positive safe integers",
		);
		assert.ok(
			Number.isSafeInteger(value) && value >= 0,
			"run values are non-negative safe integers",
		);
		if (index > 0) {
			assert.notEqual(
				runs[index - 1][1],
				value,
				"adjacent equal values stay in one maximal run",
			);
		}
	}
}
assert.throws(
	() => encodeNativeRuntimeRuns([], "empty"),
	/non-empty dense map/,
);
assert.throws(
	() => encodeNativeRuntimeRuns([2], "land", 1),
	/integer from 0 through 1/,
);
assert.throws(
	() => encodeNativeRuntimeRuns([65536], "owner", 65535),
	/integer from 0 through 65535/,
);
const browserLandMask = new Uint8Array([0, 0, 1, 1, 2, 2, 1, 0]);
const semanticLandRuns = encodeNativeRuntimeRuns(
	browserLandMask,
	"landMask",
	1,
	(value) => (value === 0 ? 0 : 1),
);
assert.deepEqual(
	semanticLandRuns,
	[
		[2, 0],
		[5, 1],
		[1, 0],
	],
	"browser theater value 2 is preserved as semantic native land",
);
assert.deepEqual(
	semanticLandRuns.flatMap(([length, value]) =>
		new Array(length).fill(value),
	),
	Array.from(browserLandMask, (value) => (value === 0 ? 0 : 1)),
	"binary land RLE roundtrips every browser cell after semantic normalization",
);

const hash = worker.indexOf("await sha256Hex(downloadedBytes)");
const decompress = worker.indexOf("await decompressScenario(downloadedBytes)");
assert.ok(hash >= 0 && decompress > hash, "raw compressed bytes are hashed before decode");
const checkpointBuilderStart = main.indexOf(
	"function buildInitialNativeRuntimeCheckpoint",
);
const checkpointBuilderEnd = main.indexOf(
	"function captureInitialNativeRuntimeCheckpoint",
	checkpointBuilderStart,
);
assert.doesNotMatch(
	main.slice(checkpointBuilderStart, checkpointBuilderEnd),
	/scenarioHash|getExperimentScenarioHash/,
	"native SHA-256 identity never falls back to the experiment content hash",
);

console.log("Native runtime checkpoint static smoke tests passed.");
