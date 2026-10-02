#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The local project Biome config excludes .mjs files. Check tooling through a JS stdin path.
const directory = new URL("./", import.meta.url);
const files = readdirSync(directory)
	.filter((name) => name.endsWith(".mjs"))
	.sort()
	.map((name) => new URL(name, directory));
files.push(new URL("../rl-smoke.mjs", import.meta.url));
for (const file of files) {
	const source = readFileSync(file, "utf8");
	const result = spawnSync(
		"biome",
		["check", "--stdin-file-path=src/rl-tool.js", "--write"],
		{
			cwd: fileURLToPath(new URL("../../", import.meta.url)),
			input: source,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	if (result.error || result.status !== 0 || result.stdout !== source) {
		console.error(
			fileURLToPath(file),
			result.error?.message ||
				result.stderr ||
				"Tooling source needs Biome formatting or fixes",
		);
		process.exit(1);
	}
}
console.log(`RL tooling lint passed: ${files.length} files`);
