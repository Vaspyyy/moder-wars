#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./profiling/fixture.mjs";
import { compareReports, distribution } from "./profiling/statistics.mjs";
import { runTransport } from "./profiling/transport.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const help = `Usage: node scripts/profile-performance.mjs [options]

  --case regional|large|ffa|all   Real 2022 map (default all)
  --units-per-side N             Initial deployment (default 500/1200/400)
  --grid-res 0.25|0.15|0.1|0.05   Global grid (default 0.15)
  --spread                       Deploy throughout countries instead of half on borders
  --warmup N                     Untimed ticks (default 300)
  --ticks N                      Measured ticks per pass (default 600)
  --repeat N                     Fresh unprofiled processes (default 3)
  --output DIR                   JSON, text, and profiles (default performance-results/TIMESTAMP)
  --heap                         Separate allocation-sampling pass
  --phases                       Separate intrusive per-unit timer/counter pass
  --no-cpu                       Skip separate V8 CPU-sampling pass
  --no-transport                 Skip worker transfer/application probe
  --compare REPORT.json          Compare matching timing workloads and host
  --help                         Print this help

No browser or root npm dependencies. Requires Node 22.7+.
Timing and sampling are separate passes. Node CPU results are not browser FPS.
`;

export function parseOptions(args) {
	const options = {
		case: "all",
		gridRes: 0.15,
		warmup: 300,
		ticks: 600,
		repeat: 3,
		cpu: true,
		transport: true,
		heap: false,
		phases: false,
	};
	const values = new Map([
		["--case", "case"],
		["--grid-res", "gridRes"],
		["--units-per-side", "unitsPerSide"],
		["--warmup", "warmup"],
		["--ticks", "ticks"],
		["--repeat", "repeat"],
		["--output", "output"],
		["--compare", "compare"],
	]);
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--help") {
			options.help = true;
			continue;
		}
		if (argument === "--spread") {
			options.spread = true;
			continue;
		}
		if (argument === "--phases") {
			options.phases = true;
			continue;
		}
		if (argument === "--heap") {
			options.heap = true;
			continue;
		}
		if (argument === "--no-cpu") {
			options.cpu = false;
			continue;
		}
		if (argument === "--no-transport") {
			options.transport = false;
			continue;
		}
		const key = values.get(argument);
		if (!key || args[index + 1] == null || args[index + 1].startsWith("--"))
			throw new Error(`Unknown option or missing value: ${argument}`);
		const value = args[++index];
		options[key] = ["case", "output", "compare"].includes(key)
			? value
			: Number(value);
	}
	if (options.help) return options;
	if (options.case !== "all" && !Object.hasOwn(CASES, options.case))
		throw new Error("Choose regional, large, ffa, or all");
	if (![0.25, 0.15, 0.1, 0.05].includes(options.gridRes))
		throw new Error(
			"Choose a supported grid resolution: 0.25, 0.15, 0.1, 0.05",
		);
	for (const key of ["warmup", "ticks", "repeat", "unitsPerSide"]) {
		if (options[key] == null) continue;
		if (
			!Number.isSafeInteger(options[key]) ||
			options[key] < (key === "warmup" ? 0 : 1)
		)
			throw new Error(
				`${key} must be a ${key === "warmup" ? "nonnegative" : "positive"} integer`,
			);
	}
	if (options.unitsPerSide > 2400)
		throw new Error("units-per-side cannot exceed the gameplay cap of 2400");
	options.output = resolve(
		options.output ||
			resolve(
				root,
				"performance-results",
				new Date().toISOString().replaceAll(":", "-"),
			),
	);
	if (options.compare) options.compare = resolve(options.compare);
	return options;
}

function runChild(options) {
	return new Promise((resolveResult, reject) => {
		const child = spawn(
			process.execPath,
			[
				fileURLToPath(new URL("./profiling/runner.mjs", import.meta.url)),
				JSON.stringify(options),
			],
			{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
		);
		const interrupt = (signal) => {
			child.kill(signal);
			process.exit(signal === "SIGINT" ? 130 : 143);
		};
		const onInterrupt = () => interrupt("SIGINT");
		const onTerminate = () => interrupt("SIGTERM");
		process.once("SIGINT", onInterrupt);
		process.once("SIGTERM", onTerminate);
		let stdout = "",
			stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			process.removeListener("SIGINT", onInterrupt);
			process.removeListener("SIGTERM", onTerminate);
			if (code !== 0)
				return reject(new Error(`Profiling child exited ${code}: ${stderr}`));
			try {
				resolveResult(JSON.parse(stdout.trim().split("\n").at(-1)));
			} catch (error) {
				reject(
					new Error(
						`Invalid child report: ${error.message}\n${stderr}\n${stdout.slice(0, 500)}`,
					),
				);
			}
		});
	});
}

const ms = (value) => `${value.toFixed(2)} ms`;
const mib = (value) => `${(value / 1048576).toFixed(1)} MiB`;
function location(row) {
	if (!row.url?.startsWith("file:")) return row.url || row.name;
	return `${relative(root, fileURLToPath(row.url))}:${row.line}`;
}
export function renderReport(report) {
	const lines = [
		"Modern Wars CLI performance report",
		`${report.date} | ${report.host.cpu} | ${report.host.node} | ${report.commit}`,
		"CPU timings exclude loading, warmup, profiler sampling, and snapshot work. 60 Hz tick budget: 16.67 ms.",
		"",
	];
	for (const result of report.cases) {
		const { fixture, timing } = result;
		lines.push(
			`${fixture.case}: ${fixture.countries.join(" / ")}; ${fixture.initialUnits} units; ${fixture.gridWidth} x ${fixture.gridHeight}`,
		);
		lines.push(
			`  mean ${ms(timing.mean)} | median ${ms(timing.median)} | P95 ${ms(timing.p95)} | P99 ${ms(timing.p99)} | worst ${ms(timing.max)}`,
		);
		lines.push(
			`  ${timing.overBudget}/${timing.count} ticks above budget; mean armies ${result.runs.map((run) => run.units.mean.toFixed(0)).join(", ")}; run means ${result.runs.map((run) => ms(run.timing.mean)).join(", ")}`,
		);
		const memory = result.runs[0].memory;
		lines.push(
			`  memory, first process: heap ${mib(memory.after.heapUsed)} | ArrayBuffers ${mib(memory.after.arrayBuffers)} | RSS sampled peak ${mib(memory.sampledPeak.rss)} | influence ${mib(memory.influenceBytes)}`,
		);
		lines.push(
			`  GC, unprofiled runs: ${result.runs.map((run) => `${run.gc.count} collections / ${ms(run.gc.durationMs)}`).join(", ")}`,
		);
		const stages = result.runs[0].stages;
		lines.push(
			`  first-run startup: inflate ${ms(stages.readAndInflateMs)}, decode ${ms(stages.decodeMs)}, deploy ${ms(stages.deploymentMs)}, core ${ms(stages.coreInitializationMs)}; untimed warmup ${ms(stages.warmupMs)}`,
		);
		lines.push(
			`  slowest logical ticks: ${result.runs
				.flatMap((run) => run.slowTicks)
				.sort((a, b) => b.ms - a.ms)
				.slice(0, 5)
				.map((tick) => `${tick.tick} (${ms(tick.ms)})`)
				.join(", ")}`,
		);
		if (result.cpu) {
			lines.push(
				`  CPU sampling: ${result.cpu.samples} samples, ${ms(result.cpu.sampledMs)} sampled window; percentages are estimates.`,
			);
			lines.push("  Self CPU (where time executes):");
			for (const row of result.cpu.self.slice(0, 10))
				lines.push(
					`    ${row.selfPct.toFixed(1).padStart(5)}% ${row.name} (${location(row)})`,
				);
			lines.push(
				"  Hot source lines (unweighted sample hits; inlining may attribute work to callers):",
			);
			for (const row of result.cpu.lines
				.filter((row) => row.url?.includes("/src/"))
				.slice(0, 6))
				lines.push(`    ${row.hits} hits ${location(row)}`);
			lines.push(
				"  Inclusive CPU (callers include descendants; percentages overlap):",
			);
			for (const row of result.cpu.inclusive
				.filter((row) => row.url?.includes("/src/"))
				.slice(0, 8))
				lines.push(
					`    ${row.inclusivePct.toFixed(1).padStart(5)}% ${row.name} (${location(row)})`,
				);
		}
		if (result.transport) {
			const transport = result.transport;
			lines.push(
				`  worker messages (${transport.snapshots} snapshots, 2 ticks/snapshot, no render/sleep):`,
			);
			lines.push(
				`    packing ${ms(transport.pack.mean)} | postMessage ${ms(transport.post.mean)} | delivery ${ms(transport.delivery.mean)} | mirror apply ${ms(transport.apply.mean)} per snapshot`,
			);
			lines.push(
				`    numeric payload mean ${mib(transport.payloadBytes.mean)}, maximum ${mib(transport.payloadBytes.max)}; delivery includes scheduling and structured cloning of non-buffer fields`,
			);
		}
		if (result.phases) {
			const phases = result.phases;
			lines.push(
				"  Detailed timers (separate intrusive run; overlapping categories):",
			);
			for (const key of [
				"unitLoop",
				"unitEnemyScan",
				"unitCombatMove",
				"unitRetreatMopUp",
				"frontline",
				"influence",
				"spatialHash",
				"plans",
				"operationalTaskForces",
				"post",
			])
				lines.push(`    ${key}: ${ms(phases[key] / phases.ticks)} per tick`);
			lines.push(
				`    enemy candidates per tick: ${(phases.tacticalEnemyCandidateVisits / phases.ticks).toFixed(0)}`,
			);
		}
		if (result.heap) {
			lines.push(
				"  Sampled allocation sites (including collected objects; excludes typed-array payload):",
			);
			for (const row of result.heap.slice(0, 8))
				lines.push(`    ${mib(row.bytes)} ${row.name} (${location(row)})`);
		}
		lines.push("");
	}
	for (const row of report.comparison || [])
		lines.push(
			`${row.case} versus baseline: mean ${row.meanSpeedup.toFixed(2)}x, P95 ${row.p95Speedup.toFixed(2)}x (>1 means faster)`,
		);
	lines.push(`Artifacts: ${report.output}`);
	return `${lines.join("\n")}\n`;
}

export async function main(args) {
	const options = parseOptions(args);
	if (options.help) {
		process.stdout.write(help);
		return;
	}
	const baseline = options.compare
		? JSON.parse(readFileSync(options.compare, "utf8"))
		: null;
	mkdirSync(options.output, { recursive: true });
	const report = {
		schema: 1,
		date: new Date().toISOString(),
		output: options.output,
		host: {
			cpu: cpus()[0]?.model,
			logicalCpus: cpus().length,
			node: process.version,
			platform: platform(),
			arch: arch(),
			osRelease: release(),
			memoryBytes: totalmem(),
		},
		commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).trim(),
		dirty: Boolean(
			execFileSync("git", ["status", "--porcelain"], {
				cwd: root,
				encoding: "utf8",
			}).trim(),
		),
		cases: [],
	};
	if (baseline) compareReports(report, baseline); // Reject a different host before running workloads.
	const names = options.case === "all" ? Object.keys(CASES) : [options.case];
	for (const name of names) {
		const workload = { ...options, case: name };
		const runs = [];
		for (let repeat = 0; repeat < options.repeat; repeat++) {
			process.stderr.write(
				`${name}: unprofiled timing ${repeat + 1}/${options.repeat}\n`,
			);
			runs.push(await runChild({ ...workload, mode: "timing" }));
			process.stderr.write(
				`${name}: mean ${ms(runs.at(-1).timing.mean)}, P95 ${ms(runs.at(-1).timing.p95)}\n`,
			);
		}
		const result = {
			fixture: runs[0].fixture,
			timing: distribution(runs.flatMap((run) => run.tickSamplesMs)),
			runs,
		};
		if (options.cpu) {
			process.stderr.write(`${name}: separate CPU sampling pass\n`);
			const sampled = await runChild({
				...workload,
				mode: "cpu",
				artifact: resolve(options.output, `${name}.cpuprofile`),
			});
			result.cpu = sampled.cpu;
			result.cpuRunTiming = sampled.timing;
		}
		if (options.transport) {
			process.stderr.write(`${name}: worker transport pass\n`);
			result.transport = await runTransport(workload);
		}
		if (options.phases) {
			process.stderr.write(`${name}: separate detailed phase/counter pass\n`);
			const detailed = await runChild({ ...workload, mode: "phases" });
			result.phases = detailed.phases;
			result.phaseRunTiming = detailed.timing;
			result.detailedSpikes = detailed.detailedSpikes;
		}
		if (options.heap) {
			process.stderr.write(`${name}: separate allocation sampling pass\n`);
			const sampled = await runChild({
				...workload,
				mode: "heap",
				artifact: resolve(options.output, `${name}.heapprofile`),
			});
			result.heap = sampled.heap;
		}
		report.cases.push(result);
		// Preserve completed cases if a later workload fails or is interrupted.
		writeFileSync(
			resolve(options.output, "report.json"),
			JSON.stringify(report, null, 2),
		);
	}
	if (baseline) report.comparison = compareReports(report, baseline);
	writeFileSync(
		resolve(options.output, "report.json"),
		JSON.stringify(report, null, 2),
	);
	const summary = renderReport(report);
	writeFileSync(resolve(options.output, "report.txt"), summary);
	process.stdout.write(summary);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main(process.argv.slice(2)).catch((error) => {
		process.stderr.write(`${error.stack}\n`);
		process.exitCode = 1;
	});
}
