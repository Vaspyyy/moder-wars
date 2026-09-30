import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { PerformanceObserver } from "node:perf_hooks";
import { influenceStorageBytes } from "../../src/influence-grid.js";
import { createSimulationCore } from "../../src/simulation-core.js";
import { createSimulationMetrics } from "../../src/simulation-metrics.js";
import { createProfileFixture, repeatableRandom } from "./fixture.mjs";
import {
	distribution,
	summarizeCpuProfile,
	summarizeHeapProfile,
} from "./statistics.mjs";

export async function runCore(options) {
	Math.random = repeatableRandom();
	const { state, fixture, stages } = createProfileFixture(options);
	let started = performance.now();
	const core = createSimulationCore(state);
	stages.coreInitializationMs = performance.now() - started;
	started = performance.now();
	for (let tick = 0; tick < options.warmup; tick++)
		if (!core.tick()) throw new Error("War ended during warmup");
	stages.warmupMs = performance.now() - started;
	// Drain events from startup before installing the steady-state GC observer.
	await new Promise((resolve) => setImmediate(resolve));
	if (options.mode === "phases")
		// AI factories retain this metrics object; reset its fields in place.
		Object.assign(core.state.perf, createSimulationMetrics("detailed"));
	const before = process.memoryUsage();
	const gc = { count: 0, durationMs: 0 };
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			gc.count++;
			gc.durationMs += entry.duration;
		}
	});
	observer.observe({ entryTypes: ["gc"] });
	let session;
	if (options.mode === "cpu" || options.mode === "heap") {
		session = new Session();
		session.connect();
		if (options.mode === "cpu") {
			await session.post("Profiler.enable");
			await session.post("Profiler.setSamplingInterval", { interval: 1000 });
			await session.post("Profiler.start");
		} else {
			await session.post("HeapProfiler.enable");
			await session.post("HeapProfiler.startSampling", {
				samplingInterval: 32768,
				includeObjectsCollectedByMajorGC: true,
				includeObjectsCollectedByMinorGC: true,
			});
		}
	}
	const times = [],
		slowTicks = [];
	let unitSum = 0,
		minUnits = core.state.units.length,
		maxUnits = minUnits;
	const peak = { ...before };
	started = performance.now();
	for (let tick = 0; tick < options.ticks; tick++) {
		const tickStart = performance.now();
		if (!core.tick())
			throw new Error(`War ended at measured tick ${tick}; shorten workload`);
		const elapsed = performance.now() - tickStart;
		times.push(elapsed);
		slowTicks.push({ tick: core.state._simTickCount, ms: elapsed });
		const count = core.state.units.length;
		unitSum += count;
		minUnits = Math.min(minUnits, count);
		maxUnits = Math.max(maxUnits, count);
		if (tick % 60 === 0) {
			const memory = process.memoryUsage();
			for (const key of Object.keys(peak))
				peak[key] = Math.max(peak[key], memory[key]);
		}
	}
	const wallMs = performance.now() - started;
	let cpu, heap;
	if (options.mode === "cpu") {
		const { profile } = await session.post("Profiler.stop");
		writeFileSync(options.artifact, JSON.stringify(profile));
		cpu = summarizeCpuProfile(profile);
	} else if (options.mode === "heap") {
		const { profile } = await session.post("HeapProfiler.stopSampling");
		writeFileSync(options.artifact, JSON.stringify(profile));
		heap = summarizeHeapProfile(profile);
	}
	session?.disconnect();
	const after = process.memoryUsage();
	for (const key of Object.keys(peak))
		peak[key] = Math.max(peak[key], after[key]);
	// GC notifications are delivered asynchronously after the synchronous tick loop.
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
	observer.disconnect();
	return {
		mode: options.mode,
		fixture,
		stages,
		timing: distribution(times),
		tickSamplesMs: times,
		wallMs,
		slowTicks: slowTicks.sort((a, b) => b.ms - a.ms).slice(0, 12),
		units: {
			initial: fixture.initialUnits,
			mean: unitSum / times.length,
			min: minUnits,
			max: maxUnits,
			final: core.state.units.length,
		},
		memory: {
			before,
			after,
			sampledPeak: peak,
			influenceBytes: core.state.sideInfluenceMaps.reduce(
				(sum, map) => sum + influenceStorageBytes(map),
				0,
			),
		},
		gc,
		cpu,
		heap,
		detailedSpikes:
			options.mode === "phases"
				? slowTicks.slice(0, 12).map((tick) => ({
						...tick,
						phases: core.state.perf._history.find(
							(entry) => entry.tick === tick.tick - options.warmup,
						)?.cats,
					}))
				: undefined,
		phases:
			options.mode === "phases"
				? Object.fromEntries(
						Object.entries(core.state.perf).filter(
							([key, value]) =>
								typeof value === "number" && !key.startsWith("_"),
						),
					)
				: undefined,
	};
}

// A child process isolates RNG/JIT/memory between repetitions and profiling passes.
if (
	process.argv[1] &&
	new URL(`file://${process.argv[1]}`).href === import.meta.url
) {
	console.log = console.info = () => {}; // Keep gameplay debug logging out of benchmark timings and the JSON channel.
	try {
		const result = await runCore(JSON.parse(process.argv[2]));
		process.stdout.write(JSON.stringify(result));
	} catch (error) {
		process.stderr.write(`${error.stack}\n`);
		process.exitCode = 1;
	}
}
