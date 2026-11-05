import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const checks = [
	"admin-regions",
	"occupation-regions",
	"native-camera",
	"native-reference",
	"atlas-scene",
	"atlas-gpu",
	"atlas",
	"render-budget",
	"camera-performance",
	"camera-gesture",
	"presentation-runtime",
	"render-chunks",
	"render-passes",
	"soldier-labels",
	"unit-render-cache",
	"political-redraw",
	"editor-loaders",
	"editor-startup",
	"conflict-reset",
	"geography-demand",
	"scenario-codec",
	"scenario-territory",
	"ukraine-scenario",
	"modern-2026",
	"scenario-menu",
	"saved-territory",
	"peace-deal",
	"war-features",
	"army-formation",
	"ai-retreat",
	"ai-operations",
	"army-overhaul",
	"ai-stall-budget",
	"ground-simulation",
	"formation-strength",
	"real-force-personnel",
	"worker-asset-security",
	"simulation-key-safety",
	"simulation-index-boundaries",
	"ai-index-safety",
	"simulation-client",
	"simulation-core",
	"simulation-engine",
	"simulation-worker",
	"simulation-speed",
	"simulation-resize",
	"speed-selector",
	"war-desk",
	"ui-modules",
	"ai-performance",
	"cli-profiler",
	"ffa-setup",
	"geo-cache",
	"geo-raster",
	"influence-grid",
	"load-asset-manifest",
	"mop-up",
	"observer-overlay",
	"performance-profiler",
	"setup-simplification",
	"simulation-jobs",
	"simulation-phase-wheel",
	"surrender",
	"tactical-grid",
	"territory-ledger",
	"ui-modernization",
	"flags",
];
// Smokes run elsewhere: this runner, module-graph (below, needs a flag) and
// build-output (needs dist/, run by `npm run check` after the build).
const runSeparately = new Set([
	"modernization",
	"module-graph",
	"build-output",
]);
const unlisted = readdirSync(new URL(".", import.meta.url))
	.filter((file) => file.endsWith("-smoke.mjs"))
	.map((file) => file.slice(0, -"-smoke.mjs".length))
	.filter((name) => !checks.includes(name) && !runSeparately.has(name));
if (unlisted.length) {
	console.error(`Smoke scripts missing from the suite: ${unlisted.join(", ")}`);
	process.exit(1);
}
// Keep the focused integration suite explicit. No browser or game entry is evaluated.
for (const name of checks) {
	const result = spawnSync(process.execPath, [`scripts/${name}-smoke.mjs`], {
		stdio: "inherit",
		timeout: 120000,
	});
	if (result.status !== 0) {
		console.error(`${name} failed`, result.error ?? "");
		process.exit(result.status ?? 1);
	}
}
const graph = spawnSync(
	process.execPath,
	["--experimental-vm-modules", "scripts/module-graph-smoke.mjs"],
	{ stdio: "inherit", timeout: 30000 },
);
if (graph.status !== 0) process.exit(graph.status ?? 1);
