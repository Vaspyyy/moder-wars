#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	COMMANDER_SCHEMA,
	createCommanderModel,
} from "../../src/commander-policy.js";
import {
	argumentsFor,
	fingerprint,
	numberOption,
	randomStream,
	simulationOptions,
	sourceFingerprint,
	validateCheckpoint,
	writeJson,
} from "./common.mjs";
import { runEpisode, SCENARIOS, scenarioList } from "./environment.mjs";
import {
	imitate,
	newTrainingState,
	reinforce,
	validateRecord,
} from "./optimizer.mjs";

const args = argumentsFor({
	episodes: { type: "string", default: "24" },
	bootstrap: { type: "string", default: "2" },
	"imitation-epochs": { type: "string", default: "8" },
	scenarios: { type: "string", default: "two,three" },
	hidden: { type: "string", default: "16" },
	rate: { type: "string", default: "0.01" },
	gamma: { type: "string", default: "0.99" },
	entropy: { type: "string", default: "0.01" },
	"league-every": { type: "string", default: "4" },
	resume: { type: "string" },
	dataset: { type: "string" },
});
const episodes = numberOption(args.episodes, "episodes", { min: 1 });
let config = {
	...simulationOptions(args),
	scenarios: scenarioList(args.scenarios, "train"),
	hidden: numberOption(args.hidden, "hidden", { min: 1, max: 64 }),
	rate: numberOption(args.rate, "rate", {
		min: 1e-6,
		max: 0.1,
		integer: false,
	}),
	gamma: numberOption(args.gamma, "gamma", { min: 0, max: 1, integer: false }),
	entropy: numberOption(args.entropy, "entropy", {
		min: 0,
		max: 1,
		integer: false,
	}),
	leagueEvery: numberOption(args["league-every"], "league-every", { min: 1 }),
};
const currentSource = sourceFingerprint();
let checkpoint, state, random;
if (args.resume) {
	checkpoint = validateCheckpoint(
		JSON.parse(readFileSync(args.resume, "utf8")),
	);
	if (checkpoint.sourceSha256 !== currentSource)
		throw new Error(
			"Training source changed since checkpoint; start a fresh experiment",
		);
	for (const [key, name] of Object.entries({
		ticks: "ticks",
		units: "units",
		grid: "grid",
		seed: "seed",
		scenarios: "scenarios",
		hidden: "hidden",
		rate: "rate",
		gamma: "gamma",
		entropy: "entropy",
		leagueEvery: "league-every",
	})) {
		if (
			process.argv.some(
				(value) => value === `--${name}` || value.startsWith(`--${name}=`),
			) &&
			JSON.stringify(config[key]) !== JSON.stringify(checkpoint.config[key])
		)
			throw new Error(`Resume configuration differs for --${name}`);
	}
	if (args.dataset)
		throw new Error(
			"A resumed on-policy run cannot replay a new imitation dataset",
		);
	config = checkpoint.config;
	scenarioList(config.scenarios.join(","), "train");
	state = {
		model: checkpoint.model,
		critic: checkpoint.critic,
		updates: checkpoint.updates,
	};
	random = randomStream();
	random.state = checkpoint.randomState;
} else {
	random = randomStream(config.seed ^ 0x1ea2beef);
	state = newTrainingState(
		createCommanderModel({ hiddenSize: config.hidden, random }),
	);
	checkpoint = {
		format: "mw-commander-checkpoint",
		schema: COMMANDER_SCHEMA,
		sourceSha256: currentSource,
		config,
		episodes: 0,
		league: [],
		history: [],
	};
	const demonstrations = [];
	if (args.dataset) {
		for (const line of readFileSync(args.dataset, "utf8")
			.split("\n")
			.filter(Boolean)) {
			const record = validateRecord(JSON.parse(line));
			if (
				!SCENARIOS[record.scenario] ||
				SCENARIOS[record.scenario].split !== "train"
			)
				throw new Error(
					"Evaluation scenarios cannot enter the imitation dataset",
				);
			demonstrations.push(record);
		}
		checkpoint.datasetSha256 = fingerprint(demonstrations);
	} else {
		const bootstrap = numberOption(args.bootstrap, "bootstrap", { min: 0 });
		for (let episode = 0; episode < bootstrap; episode++) {
			const scenario = config.scenarios[episode % config.scenarios.length];
			const result = runEpisode({
				...config,
				scenario,
				seed: (config.seed + 0x100000 + episode) >>> 0,
				teacher: true,
				learnerSides: SCENARIOS[scenario].countries.map((_, index) => index),
				policyRandom: random,
			});
			demonstrations.push(
				...result.trajectories.flatMap((trajectory) => trajectory.records),
			);
			console.log(
				`bootstrap ${episode + 1}/${bootstrap}: ${scenario}, ${demonstrations.length} decisions`,
			);
		}
	}
	if (demonstrations.length) {
		checkpoint.imitation = imitate(state, demonstrations, {
			epochs: numberOption(args["imitation-epochs"], "imitation-epochs", {
				min: 1,
			}),
		});
		console.log(
			`imitation: ${checkpoint.imitation.examples} examples, loss ${checkpoint.imitation.crossEntropy.toFixed(4)}`,
		);
	}
	checkpoint.league.push({ episode: 0, model: structuredClone(state.model) });
}

const directory = resolve(args.output);
const save = () => {
	Object.assign(checkpoint, state, { randomState: random.state });
	writeJson(resolve(directory, "checkpoint.json"), checkpoint);
	writeJson(resolve(directory, "model.json"), {
		...state.model,
		training: {
			episodes: checkpoint.episodes,
			updates: state.updates,
			sourceSha256: currentSource,
			config,
			validatedStrength: false,
		},
	});
};
save();
for (let addition = 0; addition < episodes; addition++) {
	const episode = checkpoint.episodes;
	const scenario = config.scenarios[episode % config.scenarios.length];
	const sides = SCENARIOS[scenario].countries.length;
	const mode = ["self-play", "scripted", "history", "mixed"][
		Math.floor(episode / config.scenarios.length) % 4
	];
	const learnerSide =
		Math.floor(episode / (config.scenarios.length * 4)) % sides;
	const learnerSides =
		mode === "self-play"
			? SCENARIOS[scenario].countries.map((_, index) => index)
			: [learnerSide];
	const historical =
		checkpoint.league[Math.floor(random() * checkpoint.league.length)];
	const policies = Array.from({ length: sides }, (_, side) => {
		if (learnerSides.includes(side)) return state.model;
		if (mode === "scripted") return null;
		if (mode === "mixed" && side % 2 === 0) return null;
		return historical.model;
	});
	const before = fingerprint(state.model);
	const result = runEpisode({
		...config,
		scenario,
		seed: (config.seed + episode) >>> 0,
		policies,
		learnerSides,
		policyRandom: random,
	});
	const update = reinforce(state, result.trajectories, config);
	checkpoint.episodes++;
	checkpoint.history.push({
		episode: checkpoint.episodes,
		scenario,
		seed: result.seed,
		mode,
		learnerSides,
		historicalEpisode: historical.episode,
		modelBefore: before,
		modelAfter: fingerprint(state.model),
		ticks: result.ticks,
		terminated: result.terminated,
		truncated: result.truncated,
		winner: result.winner,
		mapSha256: result.fixture.mapSha256,
		configSha256: result.fixture.configSha256,
		msPerTick: result.msPerTick,
		final: result.final,
		...update,
	});
	if (checkpoint.episodes % config.leagueEvery === 0) {
		checkpoint.league.push({
			episode: checkpoint.episodes,
			model: structuredClone(state.model),
		});
		// Retain the bootstrap opponent as well as the latest fifteen snapshots.
		if (checkpoint.league.length > 16) checkpoint.league.splice(1, 1);
	}
	save();
	console.log(
		`episode ${checkpoint.episodes}: ${scenario}, ${mode}, ${update.decisions} decisions, ${result.msPerTick.toFixed(2)} ms/tick, ${result.terminated ? "terminal" : "time limit"}`,
	);
}
console.log(`Checkpoint and portable model saved: ${directory}`);
