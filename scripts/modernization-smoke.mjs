import { spawnSync } from "node:child_process";

const checks = [
	"native-camera",
	"native-reference",
	"atlas-scene",
	"atlas-gpu",
	"atlas",
	"render-chunks",
	"render-passes",
	"political-redraw",
	"editor-loaders",
	"geography-demand",
	"scenario-codec",
	"saved-territory",
	"simulation-client",
	"simulation-core",
	"simulation-engine",
	"simulation-worker",
	"simulation-speed",
	"simulation-resize",
	"speed-selector",
	"war-desk",
	"ui-modules",
];
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
