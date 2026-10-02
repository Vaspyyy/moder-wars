import { createHash } from "node:crypto";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	COMMANDER_SCHEMA,
	COMMANDER_STATE_FEATURES,
	validateCommanderModel,
} from "../../src/commander-policy.js";
import { MAP_URL } from "../profiling/fixture.mjs";

export function randomStream(seed = 17) {
	let state = seed >>> 0 || 0x9e3779b9;
	const random = () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4294967296;
	};
	Object.defineProperty(random, "state", {
		get: () => state >>> 0,
		set: (value) => {
			if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff)
				throw new RangeError("Invalid RNG checkpoint");
			state = value;
		},
	});
	return random;
}

export function argumentsFor(extra = {}) {
	return parseArgs({
		options: {
			output: { type: "string", default: "training-results/commander" },
			seed: { type: "string", default: "17" },
			ticks: { type: "string", default: "1800" },
			units: { type: "string", default: "40" },
			grid: { type: "string", default: "0.5" },
			...extra,
		},
		strict: true,
	}).values;
}

export function numberOption(
	value,
	name,
	{ min = 0, max = Number.MAX_SAFE_INTEGER, integer = true } = {},
) {
	const number = Number(value);
	if (
		!Number.isFinite(number) ||
		number < min ||
		number > max ||
		(integer && !Number.isSafeInteger(number))
	)
		throw new RangeError(`Invalid --${name}: ${value}`);
	return number;
}

export function simulationOptions(args) {
	const options = {
		seed: numberOption(args.seed, "seed", { max: 0xffffffff }),
		ticks: numberOption(args.ticks, "ticks", { min: 301 }),
		units: numberOption(args.units, "units", { min: 6, max: 2400 }),
		grid: numberOption(args.grid, "grid", { min: 0.1, max: 1, integer: false }),
	};
	if (!Number.isSafeInteger(180 / options.grid))
		throw new RangeError("--grid must divide 180 degrees evenly");
	return options;
}

export function fingerprint(value) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sourceFingerprint() {
	const hash = createHash("sha256");
	for (const [label, directory] of [
		["src/", new URL("../../src/", import.meta.url)],
		["scripts/rl/", new URL("./", import.meta.url)],
		["scripts/profiling/", new URL("../profiling/", import.meta.url)],
	]) {
		for (const name of readdirSync(directory).sort()) {
			if (!/\.(?:js|mjs)$/.test(name) || name === "commander-model.js")
				continue;
			hash
				.update(`${label}${name}\0`)
				.update(readFileSync(new URL(name, directory)));
		}
	}
	hash.update("world-map-2022\0").update(readFileSync(MAP_URL));
	return hash.digest("hex");
}

export function writeJson(path, value) {
	const absolute = resolve(path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(`${absolute}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
	renameSync(`${absolute}.tmp`, absolute);
}

export function readModel(path) {
	const value = JSON.parse(readFileSync(path, "utf8"));
	return validateCommanderModel(value.model || value);
}

export function validateCheckpoint(checkpoint) {
	if (
		checkpoint?.format !== "mw-commander-checkpoint" ||
		checkpoint.schema !== COMMANDER_SCHEMA ||
		!Number.isSafeInteger(checkpoint.episodes) ||
		checkpoint.episodes < 0
	)
		throw new TypeError("Invalid commander checkpoint");
	validateCommanderModel(checkpoint.model);
	if (!Array.isArray(checkpoint.league) || checkpoint.league.length > 16)
		throw new TypeError("Invalid checkpoint league");
	for (const entry of checkpoint.league) validateCommanderModel(entry.model);
	if (
		!Array.isArray(checkpoint.critic) ||
		checkpoint.critic.length !== COMMANDER_STATE_FEATURES.length + 1 ||
		checkpoint.critic.some((value) => !Number.isFinite(value))
	)
		throw new TypeError("Invalid checkpoint critic");
	if (
		!Number.isSafeInteger(checkpoint.updates) ||
		checkpoint.updates < 0 ||
		!Array.isArray(checkpoint.history) ||
		!checkpoint.config ||
		typeof checkpoint.sourceSha256 !== "string"
	)
		throw new TypeError("Incomplete training checkpoint");
	const rng = randomStream();
	rng.state = checkpoint.randomState;
	return checkpoint;
}
