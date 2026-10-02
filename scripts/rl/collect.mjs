#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	COMMANDER_FEATURES,
	COMMANDER_SCHEMA,
} from "../../src/commander-policy.js";
import {
	argumentsFor,
	numberOption,
	simulationOptions,
	sourceFingerprint,
	writeJson,
} from "./common.mjs";
import { runEpisode, scenarioList } from "./environment.mjs";

const args = argumentsFor({
	episodes: { type: "string", default: "4" },
	scenarios: { type: "string", default: "two,three" },
});
const options = simulationOptions(args);
const episodes = numberOption(args.episodes, "episodes", { min: 1 });
const scenarios = scenarioList(args.scenarios, "train");
const directory = resolve(args.output);
mkdirSync(directory, { recursive: true });
const summaries = [],
	lines = [];
for (let episode = 0; episode < episodes; episode++) {
	const scenario = scenarios[episode % scenarios.length];
	const sides = scenario === "two" ? 2 : 3;
	const result = runEpisode({
		...options,
		seed: (options.seed + episode) >>> 0,
		scenario,
		teacher: true,
		learnerSides: Array.from({ length: sides }, (_, index) => index),
	});
	for (const trajectory of result.trajectories)
		for (const record of trajectory.records)
			lines.push(
				JSON.stringify({
					...record,
					episode,
					scenario,
					seed: result.seed,
					sideUid: trajectory.sideUid,
				}),
			);
	const { trajectories: _trajectories, ...summary } = result;
	summaries.push(summary);
	console.log(
		`teacher ${episode + 1}/${episodes}: ${scenario}, ${result.ticks} ticks, ${lines.length} total decisions`,
	);
}
if (!lines.length) throw new Error("No teacher decisions; increase --ticks");
writeFileSync(
	resolve(directory, "demonstrations.jsonl"),
	`${lines.join("\n")}\n`,
);
writeJson(resolve(directory, "dataset.json"), {
	format: "mw-commander-demonstrations",
	schema: COMMANDER_SCHEMA,
	features: COMMANDER_FEATURES,
	sourceSha256: sourceFingerprint(),
	options,
	decisions: lines.length,
	summaries,
});
console.log(`Demonstrations saved: ${directory}/demonstrations.jsonl`);
