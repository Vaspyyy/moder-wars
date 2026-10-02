// Portable inference and observation contract, shared by Node and the simulation owner.
export const COMMANDER_SCHEMA = 1;
export const COMMANDER_MAX_CANDIDATES = 50;
export const COMMANDER_STATE_FEATURES = Object.freeze([
	"powerShare",
	"reserveShare",
	"armySize",
	"territoryRatio",
	"casualtyRatio",
	"hostileSides",
	"frontPressure",
	"threatenedCities",
	"coverageDeficit",
	"hasOperation",
	"attackingOperations",
	"elapsed",
]);
export const COMMANDER_FEATURES = Object.freeze([
	...COMMANDER_STATE_FEATURES,
	"keep",
	"defend",
	"captureCity",
	"encircle",
	"pushFront",
	"scriptedPriority",
	"localPowerShare",
	"distance",
	"forceNeeded",
	"capital",
	"reachable",
	"pastSuccess",
	"targetPressure",
]);
const LAND_TYPES = new Set(["CAPTURE_CITY", "ENCIRCLE", "PUSH_FRONT"]);
const bounded = (value, max = 1) =>
	Math.max(0, Math.min(max, Number(value) || 0));

export function commanderStateFeatures(context, sideIndex) {
	const units = context._tickUnitsBySide[sideIndex] || [];
	let ourPower = 0;
	for (const unit of units)
		if (unit.health > 0 && unit.deployTicks <= 0)
			ourPower += context.operationalUnitPower(unit);
	const enemyPower = context.getKnownEnemyPowerForSide(sideIndex);
	const countries = context.sides[sideIndex] || [];
	let controlled = 0,
		original = 0,
		hostile = 0;
	for (const country of countries) {
		controlled += context.latestCountryStats.get(country.id)?.controlled || 0;
		original += country.initialCells || 0;
	}
	for (let other = 0; other < context.sides.length; other++)
		if (
			context.sides[other]?.length &&
			context.areSidesHostile(sideIndex, other)
		)
			hostile++;
	const fronts = context._frontIntelBySide[sideIndex] || [];
	const army = context._aiDebugPlans[sideIndex]?.army?.stats;
	const operations =
		context._aiTaskForcesBySide.get(context.sideUids[sideIndex]) || [];
	const initial = Math.max(1, context.initialSideSoldiers[sideIndex]);
	return [
		ourPower / Math.max(1, ourPower + enemyPower),
		bounded(context.sideRecruitableManpower[sideIndex] / initial),
		bounded(Math.log1p(units.length) / 8),
		bounded(controlled / Math.max(1, original), 2) / 2,
		bounded(context.sideCasualties[sideIndex] / initial),
		hostile / 7,
		bounded(
			Math.max(0, ...fronts.map((front) => front.pressureScore || 0)) / 100,
		),
		bounded(
			fronts.reduce(
				(sum, front) => sum + (front.friendlyCitiesThreatened || 0),
				0,
			) / 10,
		),
		bounded((army?.uncovered || 0) / Math.max(1, army?.sectors || 0)),
		context._warPlan[sideIndex] ? 1 : 0,
		bounded(operations.filter((op) => op.phase === "ATTACKING").length / 4),
		bounded(Math.log1p(context._simTickCount) / 12),
	];
}

/** Candidate indices are local to this reassessment; no country ID or raw geography enters the model. */
export function buildCommanderObservation(context, sideIndex, proposals) {
	const stateFeatures = commanderStateFeatures(context, sideIndex);
	const candidates = [
		{ kind: "KEEP", proposalIndex: -1 },
		{ kind: "DEFEND", proposalIndex: -1 },
	];
	const eligible = proposals
		.map((proposal, proposalIndex) => ({ proposal, proposalIndex }))
		.filter(
			({ proposal }) =>
				LAND_TYPES.has(proposal.type) &&
				proposal.priority > 0 &&
				Number.isFinite(proposal.target?.lat) &&
				Number.isFinite(proposal.target?.lng) &&
				proposal.geographicData?.reachesTarget !== false,
		)
		.sort(
			(a, b) =>
				b.proposal.priority - a.proposal.priority ||
				a.proposalIndex - b.proposalIndex,
		)
		.slice(0, COMMANDER_MAX_CANDIDATES - 2);
	for (const { proposalIndex } of eligible)
		candidates.push({ kind: "FOCUS", proposalIndex });
	for (const candidate of candidates) {
		const proposal = proposals[candidate.proposalIndex];
		const risk = proposal?.riskAssessment || {};
		const memory = proposal?.scoreBreakdown?.memory || {};
		const friend = Math.max(0, risk.ourForcesNear || 0);
		const enemy = Math.max(0, risk.enemyForcesNear || 0);
		candidate.features = [
			...stateFeatures,
			candidate.kind === "KEEP" ? 1 : 0,
			candidate.kind === "DEFEND" ? 1 : 0,
			proposal?.type === "CAPTURE_CITY" ? 1 : 0,
			proposal?.type === "ENCIRCLE" ? 1 : 0,
			proposal?.type === "PUSH_FRONT" ? 1 : 0,
			bounded(proposal?.priority / 200),
			friend / Math.max(1, friend + enemy),
			bounded(
				Math.sqrt(Math.max(0, proposal?.geographicData?.minLandDist || 0)) / 40,
			),
			bounded(
				(proposal?.estimatedForceNeeded || 0) /
					Math.max(1, context._tickUnitsBySide[sideIndex]?.length || 0),
			),
			proposal?.target?.isCapital ? 1 : 0,
			proposal?.geographicData?.reachesTarget ? 1 : 0,
			(memory.successes || 0) /
				Math.max(1, (memory.successes || 0) + (memory.failures || 0)),
			bounded(proposal?.frontIntel?.pressureScore / 100),
		];
	}
	// Match the existing commander's persistence, then its highest-priority legal land plan.
	const teacherAction = context._warPlan[sideIndex]
		? 0
		: eligible.length
			? 2
			: 1;
	return { schema: COMMANDER_SCHEMA, stateFeatures, candidates, teacherAction };
}

export function createCommanderModel({
	hiddenSize = 16,
	random = Math.random,
} = {}) {
	const width = COMMANDER_FEATURES.length;
	const model = {
		format: "mw-commander",
		schema: COMMANDER_SCHEMA,
		features: [...COMMANDER_FEATURES],
		hiddenSize,
		inputWeights: Array.from(
			{ length: width * hiddenSize },
			() => (random() * 2 - 1) / Math.sqrt(width),
		),
		hiddenBias: new Array(hiddenSize).fill(0),
		outputWeights: Array.from(
			{ length: hiddenSize },
			() => (random() * 2 - 1) * 0.1,
		),
	};
	return validateCommanderModel(model);
}

export function validateCommanderModel(model) {
	if (
		!model ||
		model.format !== "mw-commander" ||
		model.schema !== COMMANDER_SCHEMA ||
		JSON.stringify(model.features) !== JSON.stringify(COMMANDER_FEATURES)
	)
		throw new TypeError("Incompatible commander model or feature schema");
	if (
		!Number.isSafeInteger(model.hiddenSize) ||
		model.hiddenSize < 1 ||
		model.hiddenSize > 64
	)
		throw new RangeError("Commander hidden size must be between 1 and 64");
	for (const [name, length] of [
		["inputWeights", COMMANDER_FEATURES.length * model.hiddenSize],
		["hiddenBias", model.hiddenSize],
		["outputWeights", model.hiddenSize],
	]) {
		if (
			!Array.isArray(model[name]) ||
			model[name].length !== length ||
			model[name].some(
				(value) => !Number.isFinite(value) || Math.abs(value) > 100,
			)
		)
			throw new TypeError(`Invalid commander ${name}`);
	}
	return model;
}

export function commanderForward(model, features) {
	if (
		features.length !== COMMANDER_FEATURES.length ||
		features.some((value) => !Number.isFinite(value) || Math.abs(value) > 1)
	)
		throw new TypeError("Invalid commander observation features");
	const hidden = new Array(model.hiddenSize);
	let logit = 0;
	for (let h = 0; h < hidden.length; h++) {
		let value = model.hiddenBias[h];
		for (let i = 0; i < features.length; i++)
			value += model.inputWeights[h * features.length + i] * features[i];
		hidden[h] = Math.tanh(value);
		logit += model.outputWeights[h] * hidden[h];
	}
	return { hidden, logit };
}

export function commanderDistribution(model, candidates) {
	if (candidates.length < 2 || candidates.length > COMMANDER_MAX_CANDIDATES)
		throw new RangeError("Invalid commander candidate count");
	const logits = candidates.map(
		(candidate) => commanderForward(model, candidate.features).logit,
	);
	const max = Math.max(...logits);
	const weights = logits.map((logit) => Math.exp(logit - max));
	const sum = weights.reduce((total, value) => total + value, 0);
	return weights.map((value) => value / sum);
}

export function chooseCommanderAction(model, observation, random = null) {
	const probabilities = commanderDistribution(model, observation.candidates);
	if (!random) return probabilities.indexOf(Math.max(...probabilities));
	let roll = random();
	if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
		throw new RangeError("Invalid policy RNG value");
	for (let i = 0; i < probabilities.length; i++) {
		roll -= probabilities[i];
		if (roll < 0) return i;
	}
	return probabilities.length - 1;
}

export function applyCommanderAction(observation, actionIndex, proposals) {
	if (
		!Number.isSafeInteger(actionIndex) ||
		!observation.candidates[actionIndex]
	)
		throw new RangeError("Commander chose an unavailable action");
	const action = observation.candidates[actionIndex];
	if (action.kind === "KEEP")
		return { proposals, replaceLand: false, kind: action.kind };
	return {
		kind: action.kind,
		replaceLand: true,
		proposals: proposals.filter(
			(proposal, index) =>
				!LAND_TYPES.has(proposal.type) || index === action.proposalIndex,
		),
	};
}
