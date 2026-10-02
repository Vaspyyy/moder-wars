import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import { bundledCommanderModel } from "../src/commander-model.js";
import {
	applyCommanderAction,
	buildCommanderObservation,
	COMMANDER_FEATURES,
	COMMANDER_SCHEMA,
	COMMANDER_STATE_FEATURES,
	chooseCommanderAction,
	commanderDistribution,
	createCommanderModel,
	validateCommanderModel,
} from "../src/commander-policy.js";
import { createSimulationCore } from "../src/simulation-core.js";
import {
	captureSimulationState,
	SIMULATION_PROTOCOL_VERSION,
} from "../src/simulation-protocol.js";
import { randomStream, validateCheckpoint } from "./rl/common.mjs";
import { runEpisode } from "./rl/environment.mjs";
import {
	actorGradient,
	discountedReturns,
	imitate,
	newTrainingState,
	reinforce,
} from "./rl/optimizer.mjs";
import { createTinySimulationState } from "./simulation-fixture.mjs";

if (bundledCommanderModel) validateCommanderModel(bundledCommanderModel);
const rng = randomStream(123),
	model = createCommanderModel({ hiddenSize: 3, random: rng });
const record = {
	schema: COMMANDER_SCHEMA,
	stateFeatures: new Array(COMMANDER_STATE_FEATURES.length).fill(0.2),
	candidates: [0, 1, 2].map((index) => ({
		features: Array.from(
			{ length: COMMANDER_FEATURES.length },
			(_, i) => ((i + index) % 3) / 3,
		),
	})),
	action: 1,
	teacherAction: 1,
	reward: 1,
	elapsed: 300,
};
const probabilities = commanderDistribution(model, record.candidates);
assert.ok(Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
assert.equal(
	chooseCommanderAction(model, record),
	probabilities.indexOf(Math.max(...probabilities)),
);
assert.throws(() => chooseCommanderAction(model, record, () => 1), /RNG/);
assert.throws(() => validateCommanderModel({ ...model, schema: 99 }), /schema/);
assert.throws(
	() => validateCommanderModel({ ...model, outputWeights: [NaN, 0, 0] }),
	/outputWeights/,
);
assert.throws(
	() => validateCommanderModel({ ...model, hiddenSize: 1000 }),
	/hidden size/,
);

// Verify the actual network + entropy derivative against finite differences, not its own implementation.
const advantage = 0.8,
	entropyWeight = 0.07;
const analytic = actorGradient(
	model,
	record,
	advantage,
	entropyWeight,
).gradient;
const objective = () => {
	const p = commanderDistribution(model, record.candidates);
	return (
		advantage * Math.log(p[record.action]) -
		entropyWeight * p.reduce((sum, v) => sum + v * Math.log(v), 0)
	);
};
for (const name of Object.keys(analytic))
	for (let i = 0; i < model[name].length; i++) {
		const previous = model[name][i],
			epsilon = 1e-6;
		model[name][i] = previous + epsilon;
		const plus = objective();
		model[name][i] = previous - epsilon;
		const minus = objective();
		model[name][i] = previous;
		assert.ok(
			Math.abs((plus - minus) / (2 * epsilon) - analytic[name][i]) < 1e-7,
			`gradient ${name}[${i}]`,
		);
	}
const teacherState = newTrainingState(structuredClone(model));
const before = commanderDistribution(teacherState.model, record.candidates)[1];
imitate(teacherState, [record], { epochs: 40, rate: 0.1 });
assert.ok(
	commanderDistribution(teacherState.model, record.candidates)[1] >
		before + 0.1,
	"Imitation must increase teacher probability",
);
const learned = newTrainingState(structuredClone(model));
for (let i = 0; i < 30; i++)
	reinforce(
		learned,
		[
			{ terminal: true, records: [{ ...record, action: 1, reward: 1 }] },
			{ terminal: true, records: [{ ...record, action: 0, reward: -1 }] },
		],
		{ rate: 0.1, criticRate: 0, entropy: 0 },
	);
assert.ok(
	commanderDistribution(learned.model, record.candidates)[1] > before + 0.1,
	"Reward learning must increase the better action's probability",
);
const critic = [2, ...new Array(COMMANDER_STATE_FEATURES.length).fill(0)];
const trajectory = {
	terminal: false,
	finalFeatures: record.stateFeatures,
	records: [
		{ reward: 1, elapsed: 300 },
		{ reward: 2, elapsed: 600 },
	],
};
assert.deepEqual(discountedReturns(trajectory, critic, 0.5), [2.25, 2.5]);
assert.deepEqual(
	discountedReturns({ ...trajectory, terminal: true }, critic, 0.5),
	[2, 2],
);

const core = createSimulationCore(createTinySimulationState());
const uid = core.state.sideUids[0];
core.command("SET_COMMANDER_POLICY", { sideUid: uid, model });
assert.deepEqual(core.state.commanderPolicies[uid], model);
const snapshot = captureSimulationState(core.state);
assert.equal(
	snapshot.decideCommander,
	undefined,
	"Training closures must not cross ownership transfers",
);
assert.deepEqual(
	createSimulationCore(snapshot).state.commanderPolicies[uid],
	model,
);
assert.throws(
	() => core.command("SET_COMMANDER_POLICY", { sideUid: "missing", model }),
	/side UID/,
);
core.command("SET_COMMANDER_POLICY", { model: null });
const restored = createSimulationCore(captureSimulationState(core.state));
assert.equal(restored.state.commanderDisabled, true);
assert.equal(restored.state.decideCommander(0, []), null);
assert.ok(restored.state.commanderDisabledSides.has(uid));

const proposals = [
	{
		type: "PUSH_FRONT",
		priority: 20,
		target: { lat: 5, lng: 15 },
		geographicData: { reachesTarget: true },
	},
	{
		type: "CAPTURE_CITY",
		priority: 99,
		target: { lat: 5, lng: 15 },
		geographicData: { reachesTarget: false },
	},
	{ type: "DEFEND", priority: 30 },
	{ type: "TRANSPORT", priority: 40 },
];
const observation = buildCommanderObservation(core.state, 0, proposals);
assert.equal(
	observation.candidates.length,
	3,
	"Unreachable attacks must be masked out",
);
assert.strictEqual(
	applyCommanderAction(observation, 0, proposals).proposals,
	proposals,
);
assert.deepEqual(
	applyCommanderAction(observation, 1, proposals).proposals,
	proposals.slice(2),
);
assert.deepEqual(applyCommanderAction(observation, 2, proposals).proposals, [
	proposals[0],
	...proposals.slice(2),
]);
assert.throws(
	() => applyCommanderAction(observation, 7, proposals),
	/unavailable/,
);

const originalRandom = Math.random;
const scripted = runEpisode({
	scenario: "two",
	seed: 23,
	ticks: 420,
	units: 8,
	grid: 1,
	record: false,
});
const observed = runEpisode({
	scenario: "two",
	seed: 23,
	ticks: 420,
	units: 8,
	grid: 1,
	teacher: true,
	learnerSides: [0, 1],
});
assert.deepEqual(
	observed.final,
	scripted.final,
	"Teacher collection must preserve scripted behavior and RNG",
);
assert.equal(Math.random, originalRandom);
const three = runEpisode({
	scenario: "three",
	seed: 42,
	ticks: 420,
	units: 8,
	grid: 1,
	policies: [model, model, model],
	learnerSides: [0, 1, 2],
});
assert.equal(three.trajectories.length, 3);
assert.ok(
	three.trajectories.every(
		(side) =>
			side.records.length > 0 &&
			side.records.every((r) => Number.isFinite(r.reward) && r.action >= 0),
	),
);
assert.equal(three.truncated, true);
assert.equal(three.winner, null);

// Load the real browser worker through a Node port shim, then exercise policy commands and inference.
const workerUrl = new URL(
	"../workers/war-simulation-worker.js",
	import.meta.url,
).href;
const adapter = `import { parentPort } from "node:worker_threads";
globalThis.self = { postMessage: (message, transfers) => parentPort.postMessage(message, transfers) };
await import(${JSON.stringify(workerUrl)});
parentPort.on("message", data => self.onmessage({ data }));`;
const worker = new Worker(
	new URL(`data:text/javascript,${encodeURIComponent(adapter)}`),
);
const inbox = [],
	listeners = new Set();
let workerError;
worker.on("error", (error) => {
	workerError = error;
	for (const listener of listeners) listener();
});
worker.on("message", (message) => {
	inbox.push(message);
	if (message.type === "ERROR") workerError = new Error(message.message);
	for (const listener of listeners) listener();
});
function waitWorker(type, epoch) {
	return new Promise((resolve, reject) => {
		const finish = (error, message) => {
			clearTimeout(timer);
			listeners.delete(check);
			if (error) reject(error);
			else resolve(message);
		};
		const check = () => {
			if (workerError) return finish(workerError);
			const index = inbox.findIndex(
				(message) => message.type === type && message.epoch === epoch,
			);
			if (index >= 0) finish(null, inbox.splice(index, 1)[0]);
		};
		const timer = setTimeout(
			() => finish(new Error(`Worker policy timeout: ${type}`)),
			4000,
		);
		listeners.add(check);
		check();
	});
}
try {
	const initial = createTinySimulationState({ paused: true });
	initial._simTickCount = initial.simFrameCount = 300;
	initial.commanderDisabled = true;
	worker.postMessage({
		type: "INIT",
		epoch: 1,
		version: SIMULATION_PROTOCOL_VERSION,
		state: initial,
	});
	await waitWorker("READY", 1);
	await waitWorker("SNAPSHOT", 1);
	worker.postMessage({
		type: "COMMAND",
		epoch: 1,
		command: { type: "SET_COMMANDER_POLICY", payload: { model, sideUid: uid } },
	});
	worker.postMessage({ type: "CONTROL", epoch: 1, paused: false, speed: 10 });
	let decision;
	for (let attempt = 0; attempt < 10 && !decision; attempt++) {
		await delay(20);
		worker.postMessage({ type: "ACK", epoch: 1, requestSnapshot: true });
		decision = (await waitWorker("SNAPSHOT", 1)).snapshot.values
			._commanderDecisions?.[0];
	}
	assert.ok(
		decision && decision.candidates >= 2,
		"The actual worker must perform model inference",
	);
	worker.postMessage({ type: "HANDOFF", epoch: 1, requestId: "rl-policy" });
	const handed = (await waitWorker("HANDOFF", 1)).state;
	assert.deepEqual(handed.commanderPolicies[uid], model);
	assert.ok(handed._commanderDecisions[0]);
	handed.isPaused = true;
	worker.postMessage({
		type: "INIT",
		epoch: 2,
		version: SIMULATION_PROTOCOL_VERSION,
		state: handed,
	});
	await waitWorker("READY", 2);
	await waitWorker("SNAPSHOT", 2);
	worker.postMessage({
		type: "COMMAND",
		epoch: 2,
		command: {
			type: "SET_COMMANDER_POLICY",
			payload: { model: null, sideUid: uid },
		},
	});
	worker.postMessage({ type: "HANDOFF", epoch: 2, requestId: "rl-disable" });
	const disabled = (await waitWorker("HANDOFF", 2)).state;
	assert.equal(Object.hasOwn(disabled.commanderPolicies, uid), false);
	assert.ok(disabled.commanderDisabledSides.has(uid));
	assert.equal(
		createSimulationCore(disabled).state.decideCommander(0, []),
		null,
	);
} finally {
	await worker.terminate();
}

// Exercise real collection, CLI training, checkpoint resume, evaluation and portable export.
const directory = mkdtempSync(resolve(tmpdir(), "mw-rl-smoke-"));
const root = resolve(new URL("..", import.meta.url).pathname);
const cli = (name, args) =>
	execFileSync(process.execPath, [`scripts/rl/${name}.mjs`, ...args], {
		cwd: root,
		encoding: "utf8",
		timeout: 120_000,
	});
const config = [
	"--ticks",
	"420",
	"--units",
	"8",
	"--grid",
	"1",
	"--scenarios",
	"two,three",
	"--bootstrap",
	"1",
	"--imitation-epochs",
	"2",
];
try {
	cli("collect", [
		"--episodes",
		"2",
		"--ticks",
		"420",
		"--units",
		"8",
		"--grid",
		"1",
		"--output",
		resolve(directory, "data"),
	]);
	cli("train", [
		...config,
		"--episodes",
		"2",
		"--output",
		resolve(directory, "full"),
	]);
	cli("train", [
		...config,
		"--episodes",
		"1",
		"--output",
		resolve(directory, "split"),
	]);
	cli("train", [
		"--resume",
		resolve(directory, "split/checkpoint.json"),
		"--episodes",
		"1",
		"--output",
		resolve(directory, "split"),
	]);
	const full = validateCheckpoint(
		JSON.parse(
			readFileSync(resolve(directory, "full/checkpoint.json"), "utf8"),
		),
	);
	const split = validateCheckpoint(
		JSON.parse(
			readFileSync(resolve(directory, "split/checkpoint.json"), "utf8"),
		),
	);
	assert.deepEqual(
		full.model,
		split.model,
		"Resumed actor must reproduce uninterrupted training",
	);
	assert.deepEqual(full.critic, split.critic);
	assert.equal(full.randomState, split.randomState);
	assert.equal(split.episodes, 2);
	cli("train", [
		"--dataset",
		resolve(directory, "data/demonstrations.jsonl"),
		...config,
		"--episodes",
		"1",
		"--output",
		resolve(directory, "imported"),
	]);
	cli("evaluate", [
		"--model",
		resolve(directory, "full/model.json"),
		"--seeds",
		"1",
		"--ticks",
		"420",
		"--units",
		"8",
		"--grid",
		"1",
		"--output",
		resolve(directory, "evaluation"),
	]);
	const evaluation = JSON.parse(
		readFileSync(resolve(directory, "evaluation/evaluation.json"), "utf8"),
	);
	assert.equal(
		evaluation.matches.length,
		5,
		"Every two/three-side position must be evaluated",
	);
	assert.ok(
		evaluation.summaries.every(
			(summary) =>
				summary.wins === 0 &&
				summary.losses === 0 &&
				summary.truncated === summary.matches,
		),
	);
	cli("export", [
		"--model",
		resolve(directory, "full/checkpoint.json"),
		"--output",
		resolve(directory, "export"),
	]);
	assert.deepEqual(
		validateCommanderModel(
			JSON.parse(
				readFileSync(resolve(directory, "export/exported-model.json"), "utf8"),
			),
		),
		full.model,
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
console.log(
	"RL smoke passed: numerical gradients, reward learning, action masks, actual worker inference/commands/handoff, two/three-side rollouts, deterministic resume, dataset import, held-out evaluation and portable export",
);
