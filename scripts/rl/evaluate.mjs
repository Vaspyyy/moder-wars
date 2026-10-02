#!/usr/bin/env node
import { resolve } from "node:path";
import {
	argumentsFor,
	fingerprint,
	numberOption,
	readModel,
	simulationOptions,
	sourceFingerprint,
	writeJson,
} from "./common.mjs";
import { runEpisode, SCENARIOS, scenarioList } from "./environment.mjs";

const args = argumentsFor({
	model: { type: "string" },
	opponent: { type: "string" },
	seeds: { type: "string", default: "3" },
	scenarios: { type: "string", default: "heldout-two,heldout-three" },
	"require-improvement": { type: "boolean", default: false },
	seed: { type: "string", default: "100000" },
});
if (!args.model)
	throw new Error(
		"Usage: node scripts/rl/evaluate.mjs --model PATH [--opponent PATH]",
	);
const model = readModel(args.model),
	opponent = args.opponent ? readModel(args.opponent) : null;
const options = simulationOptions(args),
	seeds = numberOption(args.seeds, "seeds", { min: 1 });
const scenarios = scenarioList(args.scenarios, "evaluation"),
	matches = [];
for (const scenario of scenarios)
	for (let trial = 0; trial < seeds; trial++) {
		const seed = (options.seed + trial) >>> 0;
		const sides = SCENARIOS[scenario].countries.length;
		const baseline = runEpisode({
			...options,
			scenario,
			seed,
			policies: new Array(sides).fill(opponent),
			record: false,
		});
		for (let candidateSide = 0; candidateSide < sides; candidateSide++) {
			const policies = new Array(sides).fill(opponent);
			policies[candidateSide] = model;
			// No learner sides means deterministic inference and no training or gradient updates.
			const candidate = runEpisode({
				...options,
				scenario,
				seed,
				policies,
				record: false,
			});
			const a = candidate.final[candidateSide],
				b = baseline.final[candidateSide];
			matches.push({
				scenario,
				seed,
				candidateSide,
				countries: candidate.initial[candidateSide].countries,
				territoryDelta: a.territoryRatio - b.territoryRatio,
				rewardDelta: a.potential - b.potential,
				candidate: {
					winner: candidate.winner,
					terminated: candidate.terminated,
					truncated: candidate.truncated,
					ticks: candidate.ticks,
					msPerTick: candidate.msPerTick,
					final: a,
				},
				baseline: {
					winner: baseline.winner,
					terminated: baseline.terminated,
					truncated: baseline.truncated,
					ticks: baseline.ticks,
					msPerTick: baseline.msPerTick,
					final: b,
				},
				mapSha256: candidate.fixture.mapSha256,
				configSha256: candidate.fixture.configSha256,
			});
			console.log(
				`${scenario} seed ${seed} side ${candidateSide}: territory delta ${(a.territoryRatio - b.territoryRatio).toFixed(4)}, ${candidate.truncated ? "time limit" : "terminal"}`,
			);
		}
	}
const summaries = scenarios.map((scenario) => {
	const group = matches.filter((match) => match.scenario === scenario);
	const mean = (get) =>
		group.reduce((sum, match) => sum + get(match), 0) / group.length;
	const wins = group.filter(
		(match) => match.candidate.winner === match.candidateSide,
	).length;
	const losses = group.filter(
		(match) =>
			match.candidate.winner != null &&
			match.candidate.winner !== match.candidateSide,
	).length;
	return {
		scenario,
		matches: group.length,
		wins,
		losses,
		terminalDraws: group.filter(
			(match) => match.candidate.terminated && match.candidate.winner == null,
		).length,
		truncated: group.filter((match) => match.candidate.truncated).length,
		meanTerritoryDelta: mean((match) => match.territoryDelta),
		meanRewardDelta: mean((match) => match.rewardDelta),
		meanCandidateMsPerTick: mean((match) => match.candidate.msPerTick),
		meanBaselineMsPerTick: mean((match) => match.baseline.msPerTick),
	};
});
const improved = summaries.every(
	(summary) => summary.meanRewardDelta > 0 && summary.meanTerritoryDelta >= 0,
);
writeJson(resolve(args.output, "evaluation.json"), {
	format: "mw-commander-evaluation",
	sourceSha256: sourceFingerprint(),
	modelSha256: fingerprint(model),
	opponentSha256: opponent ? fingerprint(opponent) : "scripted",
	options,
	summaries,
	matches,
	improved,
	note: "Paired scenarios with every side rotated. Time limits are reported separately from victories. Shaped-reward improvement is a preliminary metric, not proof of general strategic strength or browser performance.",
});
if (fingerprint(model) !== fingerprint(readModel(args.model)))
	throw new Error("Model changed during evaluation");
console.log(`Evaluation saved: ${resolve(args.output, "evaluation.json")}`);
if (args["require-improvement"] && !improved) process.exitCode = 1;
