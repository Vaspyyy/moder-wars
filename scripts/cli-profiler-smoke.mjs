import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOptions } from "./profile-performance.mjs";
import {
	createProfileFixture,
	repeatableRandom,
} from "./profiling/fixture.mjs";
import {
	compareReports,
	distribution,
	summarizeCpuProfile,
	summarizeHeapProfile,
} from "./profiling/statistics.mjs";

assert.deepEqual(distribution([1, 2, 3, 4, 20]), {
	count: 5,
	total: 30,
	mean: 6,
	median: 3,
	p95: 20,
	p99: 20,
	max: 20,
	overBudget: 1,
});
assert.throws(() => distribution([]), /empty/);
assert.equal(parseOptions(["--warmup", "0", "--no-cpu"]).warmup, 0);
for (const args of [
	["--ticks", "0"],
	["--case", "bogus"],
	["--grid-res", "0.2"],
	["--ticks"],
	["--units-per-side", "2401"],
])
	assert.throws(() => parseOptions(args));

// Different sample weights and recursive instances must not double-count inclusive time.
const frame = (name) => ({
	functionName: name,
	url: "file:///fixture.js",
	lineNumber: 4,
});
const profile = {
	nodes: [
		{ id: 1, callFrame: frame("root"), children: [2] },
		{
			id: 2,
			callFrame: frame("recursive"),
			children: [3, 4],
			positionTicks: [{ line: 8, ticks: 2 }],
		},
		{
			id: 3,
			callFrame: frame("recursive"),
			positionTicks: [{ line: 8, ticks: 1 }],
		},
		{ id: 4, callFrame: frame("leaf") },
	],
	samples: [3, 4],
	timeDeltas: [1000, 3000],
};
const cpu = summarizeCpuProfile(profile);
assert.equal(cpu.sampledMs, 4);
assert.equal(cpu.self.find((row) => row.name === "leaf").selfPct, 75);
assert.equal(
	cpu.inclusive.find((row) => row.name === "recursive").inclusivePct,
	100,
);
assert.equal(cpu.lines[0].hits, 3);
assert.equal(summarizeCpuProfile({ nodes: [], samples: [] }).sampledMs, 0);
assert.equal(
	summarizeHeapProfile({
		head: {
			callFrame: frame("root"),
			selfSize: 0,
			children: [{ callFrame: frame("leaf"), selfSize: 42 }],
		},
	})[0].bytes,
	42,
);

const originalRandom = Math.random;
try {
	Math.random = repeatableRandom();
	const first = createProfileFixture({
		case: "regional",
		gridRes: 0.25,
		unitsPerSide: 12,
		warmup: 15,
		ticks: 20,
	});
	Math.random = repeatableRandom();
	const second = createProfileFixture({
		case: "regional",
		gridRes: 0.25,
		unitsPerSide: 12,
		warmup: 15,
		ticks: 20,
	});
	assert.deepEqual(
		first.state.units,
		second.state.units,
		"deployment is repeatable",
	);
	assert.equal(first.state.units.length, 24);
	assert.equal(new Set(first.state.units.map((unit) => unit.id)).size, 24);
	assert.ok(
		new Set(first.state.units.map((unit) => Math.floor(unit.id * 1000) % 4))
			.size > 1,
		"benchmark IDs preserve normal strategic group distribution",
	);
	for (const unit of first.state.units) {
		const index =
			Math.floor((unit.lat + 90) / 0.25) * first.state.gridWidth +
			Math.floor((unit.lng + 180) / 0.25);
		assert.equal(first.state.worldControlMap[index], unit.sovereignId);
		assert.equal(first.state.dominantSideMap[index], unit.sideIndex);
	}
	assert.ok(
		first.state.activeTheaterCities.every(
			(city) => city.ownerId === city.sovereignId && city.ownerId,
		),
	);
	assert.ok(first.fixture.borderCells.every((count) => count > 0));
} finally {
	Math.random = originalRandom;
}

const output = mkdtempSync(join(tmpdir(), "mw-cli-profiler-test-"));
try {
	const args = [
		"scripts/profile-performance.mjs",
		"--case",
		"regional",
		"--grid-res",
		"0.25",
		"--units-per-side",
		"12",
		"--warmup",
		"15",
		"--ticks",
		"20",
		"--repeat",
		"1",
		"--heap",
		"--phases",
		"--output",
		output,
	];
	const child = spawnSync(process.execPath, args, {
		encoding: "utf8",
		timeout: 45000,
	});
	assert.equal(child.status, 0, child.stderr);
	const report = JSON.parse(readFileSync(join(output, "report.json"), "utf8"));
	const result = report.cases[0];
	assert.equal(result.timing.count, 20);
	assert.equal(result.phases.ticks, 20);
	assert.ok(result.detailedSpikes[0].phases);
	assert.equal(result.fixture.initialUnits, 24);
	assert.equal(result.transport.snapshots, 10);
	assert.equal(result.transport.finalMirrorTick, result.transport.finalTick);
	assert.equal(result.transport.finalMirrorUnits, result.transport.finalUnits);
	assert.equal(result.transport.finalTick, 35);
	assert.ok(result.transport.payloadBytes.max > 0);
	assert.ok(result.cpu.samples > 0);
	assert.ok(result.heap.length > 0);
	assert.ok(
		result.runs[0].memory.after.arrayBuffers >
			result.runs[0].memory.influenceBytes,
	);
	for (const name of [
		"regional.cpuprofile",
		"regional.heapprofile",
		"report.txt",
	])
		assert.ok(existsSync(join(output, name)));
	assert.equal(
		compareReports(report, structuredClone(report))[0].meanSpeedup,
		1,
	);
	const incompatible = structuredClone(report);
	incompatible.cases[0].fixture.gridRes = 0.15;
	assert.throws(() => compareReports(report, incompatible), /workload differs/);
	incompatible.host.node = "different";
	assert.throws(
		() => compareReports(report, incompatible),
		/hardware, OS, or Node/,
	);
	const compare = spawnSync(
		process.execPath,
		[
			"scripts/profile-performance.mjs",
			"--case",
			"regional",
			"--grid-res",
			"0.25",
			"--units-per-side",
			"12",
			"--warmup",
			"15",
			"--ticks",
			"20",
			"--repeat",
			"1",
			"--no-cpu",
			"--no-transport",
			"--compare",
			join(output, "report.json"),
			"--output",
			join(output, "comparison"),
		],
		{ encoding: "utf8", timeout: 45000 },
	);
	assert.equal(compare.status, 0, compare.stderr);
	assert.match(compare.stdout, /versus baseline/);
} finally {
	rmSync(output, { recursive: true, force: true });
}
console.log(
	"CLI profiler smoke checks passed (real map, V8 profiles, worker transport, comparisons).",
);
