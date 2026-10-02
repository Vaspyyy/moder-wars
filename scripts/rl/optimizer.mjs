import {
	COMMANDER_SCHEMA,
	COMMANDER_STATE_FEATURES,
	commanderDistribution,
	commanderForward,
	validateCommanderModel,
} from "../../src/commander-policy.js";

export function validateRecord(record) {
	if (
		record.schema !== COMMANDER_SCHEMA ||
		!Array.isArray(record.candidates) ||
		!Number.isSafeInteger(record.action) ||
		!record.candidates[record.action]
	)
		throw new TypeError("Invalid training decision");
	if (
		!Array.isArray(record.stateFeatures) ||
		record.stateFeatures.length !== COMMANDER_STATE_FEATURES.length ||
		record.stateFeatures.some(
			(value) => !Number.isFinite(value) || Math.abs(value) > 1,
		)
	)
		throw new TypeError("Invalid training state");
	return record;
}

export function newTrainingState(model) {
	validateCommanderModel(model);
	return {
		model,
		critic: new Array(COMMANDER_STATE_FEATURES.length + 1).fill(0),
		updates: 0,
	};
}

export function valueEstimate(critic, features) {
	return features
		? critic[0] +
				features.reduce(
					(sum, value, index) => sum + critic[index + 1] * value,
					0,
				)
		: 0;
}

/** Exact gradient of A log pi(a|s) + beta H(pi), with a scalar tanh proposal scorer. */
export function actorGradient(model, record, advantage = 1, entropy = 0) {
	validateRecord(record);
	const probabilities = commanderDistribution(model, record.candidates);
	const distributionEntropy = -probabilities.reduce(
		(sum, p) => sum + p * Math.log(Math.max(1e-300, p)),
		0,
	);
	const gradient = {
		inputWeights: new Array(model.inputWeights.length).fill(0),
		hiddenBias: new Array(model.hiddenSize).fill(0),
		outputWeights: new Array(model.hiddenSize).fill(0),
	};
	for (let c = 0; c < record.candidates.length; c++) {
		const features = record.candidates[c].features;
		const { hidden } = commanderForward(model, features);
		const p = probabilities[c];
		const coefficient =
			advantage * ((c === record.action ? 1 : 0) - p) -
			entropy * p * (Math.log(Math.max(1e-300, p)) + distributionEntropy);
		for (let h = 0; h < model.hiddenSize; h++) {
			gradient.outputWeights[h] += coefficient * hidden[h];
			const derivative =
				coefficient * model.outputWeights[h] * (1 - hidden[h] ** 2);
			gradient.hiddenBias[h] += derivative;
			for (let i = 0; i < features.length; i++)
				gradient.inputWeights[h * features.length + i] +=
					derivative * features[i];
		}
	}
	return {
		gradient,
		entropy: distributionEntropy,
		logProbability: Math.log(Math.max(1e-300, probabilities[record.action])),
	};
}

function applyGradient(model, gradient, rate, divisor, maxNorm = 1) {
	let normSquared = 0;
	for (const values of Object.values(gradient))
		for (const value of values) normSquared += (value / divisor) ** 2;
	const scale =
		(Math.min(1, maxNorm / Math.max(1e-12, Math.sqrt(normSquared))) * rate) /
		divisor;
	for (const name of Object.keys(gradient))
		for (let i = 0; i < gradient[name].length; i++)
			model[name][i] += scale * gradient[name][i];
	validateCommanderModel(model);
}

export function imitate(state, records, { rate = 0.03, epochs = 8 } = {}) {
	if (!records.length)
		throw new RangeError("Imitation requires demonstrations");
	let loss = 0;
	for (let epoch = 0; epoch < epochs; epoch++) {
		loss = 0;
		for (const record of records) {
			const example = {
				...record,
				action: record.teacherAction ?? record.action,
			};
			const result = actorGradient(state.model, example);
			loss -= result.logProbability;
			applyGradient(state.model, result.gradient, rate, 1);
		}
	}
	return {
		examples: records.length,
		epochs,
		crossEntropy: loss / records.length,
	};
}

export function discountedReturns(trajectory, critic, gamma = 0.99) {
	let next = trajectory.terminal
		? 0
		: valueEstimate(critic, trajectory.finalFeatures);
	const returns = new Array(trajectory.records.length);
	for (let i = trajectory.records.length - 1; i >= 0; i--) {
		const record = trajectory.records[i];
		if (
			!Number.isFinite(record.reward) ||
			!Number.isFinite(record.elapsed) ||
			record.elapsed < 1
		)
			throw new TypeError("Unfinished reward interval");
		next = record.reward + gamma ** (record.elapsed / 300) * next;
		returns[i] = next;
	}
	return returns;
}

/** One on-policy batch gets exactly one actor update; archived opponents never contribute gradients. */
export function reinforce(
	state,
	trajectories,
	{ rate = 0.01, criticRate = 0.03, gamma = 0.99, entropy = 0.01 } = {},
) {
	const examples = trajectories.flatMap((trajectory) => {
		const returns = discountedReturns(trajectory, state.critic, gamma);
		return trajectory.records.map((record, index) => ({
			record,
			target: returns[index],
		}));
	});
	if (!examples.length)
		throw new RangeError("No on-policy decisions; increase rollout ticks");
	const total = {
		inputWeights: new Array(state.model.inputWeights.length).fill(0),
		hiddenBias: new Array(state.model.hiddenSize).fill(0),
		outputWeights: new Array(state.model.hiddenSize).fill(0),
	};
	const criticGradient = new Array(state.critic.length).fill(0);
	let entropySum = 0,
		advantageSum = 0,
		valueLoss = 0;
	for (const { record, target } of examples) {
		const error = target - valueEstimate(state.critic, record.stateFeatures);
		const advantage = Math.max(-5, Math.min(5, error));
		const result = actorGradient(state.model, record, advantage, entropy);
		entropySum += result.entropy;
		advantageSum += advantage;
		valueLoss += error ** 2;
		for (const name of Object.keys(total))
			for (let i = 0; i < total[name].length; i++)
				total[name][i] += result.gradient[name][i];
		criticGradient[0] += advantage;
		for (let i = 0; i < record.stateFeatures.length; i++)
			criticGradient[i + 1] += advantage * record.stateFeatures[i];
	}
	applyGradient(state.model, total, rate, examples.length);
	for (let i = 0; i < state.critic.length; i++)
		state.critic[i] += (criticRate * criticGradient[i]) / examples.length;
	state.updates++;
	return {
		decisions: examples.length,
		entropy: entropySum / examples.length,
		advantage: advantageSum / examples.length,
		valueLoss: valueLoss / examples.length,
	};
}
