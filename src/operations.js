/**
 * @typedef {Object} CommanderDirective
 * @property {"HOLD"|"BALANCED"|"COUNTERATTACK"} stance
 * @property {"kyiv"|"kharkiv"|"dnipro"|"odesa"} targetCity
 * @property {0.1|0.25|0.4} reserve
 */

/**
 * @typedef {Object} OperationObjective
 * @property {string} id
 * @property {string} label
 * @property {"PRIMARY"|"DEFEAT"|"MEDAL"} type
 */

/**
 * @typedef {Object} OperationEvent
 * @property {string} id
 * @property {number} day
 * @property {string} title
 * @property {string} body
 * @property {Array<{id:string,label:string,description:string,effect:Object}>} choices
 */

/**
 * @typedef {Object} OperationDefinition
 * @property {string} id
 * @property {number} version
 * @property {string} title
 * @property {string} scenarioUrl
 * @property {number} durationDays
 * @property {number} dayDurationMs
 * @property {number} directiveCooldownMs
 * @property {number} playerSideIdx
 * @property {number} playerCountryId
 * @property {number} enemyCountryId
 * @property {Object<string,{dataName:string,displayName:string}>} targetCities
 * @property {Array<OperationObjective>} objectives
 * @property {Array<OperationEvent>} events
 */

/**
 * @typedef {Object} OperationRuntime
 * @property {string} operationId
 * @property {number} currentDay
 * @property {number} activePlayMs
 * @property {number} lastDirectiveAtMs
 * @property {CommanderDirective} directive
 * @property {number} kyivEnemyDays
 * @property {boolean} capitalEverLost
 * @property {Array<string>} resolvedEventIds
 * @property {Array<string>} queuedEventIds
 * @property {Array<{type:string,multiplier?:number,forcedReserve?:number,expiresDay:number}>} modifiers
 * @property {null|"VICTORY"|"EARLY_VICTORY"|"DEFEAT"} result
 * @property {Array<string>} medals
 */

export const COMMANDER_STANCES = Object.freeze({
	HOLD: { label: "Hold", strategy: "DEFENSIVE", offenseShare: 0.2 },
	BALANCED: { label: "Balanced", strategy: "BALANCED", offenseShare: 0.5 },
	COUNTERATTACK: {
		label: "Counterattack",
		strategy: "AGGRESSIVE",
		offenseShare: 0.75,
	},
});

export const EASTERN_FRONT_OPERATION = Object.freeze({
	id: "eastern-front-2022",
	version: 1,
	title: "Eastern Front: Hold Ukraine",
	subtitle: "An alternate-history command operation",
	scenarioUrl: "assets/maps/world map 2022.json",
	startDate: { year: 2022, month: 2, day: 24 },
	durationDays: 365,
	dayDurationMs: 4000,
	directiveCooldownMs: 45000,
	playerSideIdx: 1,
	playerCountryId: 167,
	enemyCountryId: 136,
	playerManpower: 360000,
	enemyManpower: 520000,
	defaultDirective: { stance: "HOLD", targetCity: "kyiv", reserve: 0.25 },
	targetCities: {
		kyiv: { dataName: "Kiev", displayName: "Kyiv" },
		kharkiv: { dataName: "Kharkiv", displayName: "Kharkiv" },
		dnipro: { dataName: "Dnipro", displayName: "Dnipro" },
		odesa: { dataName: "Odessa", displayName: "Odesa" },
	},
	objectives: [
		{
			id: "survive",
			label: "Remain active and control Kyiv through 24 February 2023",
			type: "PRIMARY",
		},
		{
			id: "kyiv_30",
			label: "Do not allow Russia to hold Kyiv for 30 consecutive days",
			type: "DEFEAT",
		},
		{ id: "capital_unbroken", label: "Capital Unbroken", type: "MEDAL" },
		{ id: "cities_held", label: "Cities Held", type: "MEDAL" },
		{ id: "sovereign_majority", label: "Sovereign Majority", type: "MEDAL" },
	],
	events: [
		{
			id: "emergency_reserves",
			day: 45,
			title: "Emergency Reserves",
			body: "Fresh formations are ready. Decide where they enter the theater.",
			choices: [
				{
					id: "capital",
					label: "Reinforce Kyiv",
					description: "Deploy 30 units around the capital.",
					effect: {
						type: "SPAWN",
						groups: [{ city: "kyiv", count: 30, health: 1 }],
					},
				},
				{
					id: "east",
					label: "Reinforce the East",
					description: "Deploy 15 units at Kharkiv and 15 at Dnipro.",
					effect: {
						type: "SPAWN",
						groups: [
							{ city: "kharkiv", count: 15, health: 1 },
							{ city: "dnipro", count: 15, health: 1 },
						],
					},
				},
			],
		},
		{
			id: "aid_doctrine",
			day: 150,
			title: "Aid Doctrine",
			body: "A new aid package can strengthen quality or expand the army quickly.",
			choices: [
				{
					id: "quality",
					label: "Precision Support",
					description: "Add 20 units and gain a small combat buff for 60 days.",
					effect: {
						type: "QUALITY_AID",
						groups: [{ city: "kyiv", count: 20, health: 1 }],
						durationDays: 60,
					},
				},
				{
					id: "mass",
					label: "Mass Mobilization",
					description: "Add 50 units at 75% health across the theater.",
					effect: {
						type: "SPAWN",
						groups: [
							{ city: "kyiv", count: 20, health: 0.75 },
							{ city: "kharkiv", count: 15, health: 0.75 },
							{ city: "odesa", count: 15, health: 0.75 },
						],
					},
				},
			],
		},
		{
			id: "final_campaign",
			day: 270,
			title: "Final Campaign",
			body: "Choose how the command will approach the operation's final months.",
			choices: [
				{
					id: "counterattack",
					label: "Commit the Reserves",
					description:
						"Gain +25% offensive plan weight and force reserves to 10% for 45 days.",
					effect: {
						type: "PLAN_MODIFIER",
						plan: "OFFENSE",
						multiplier: 1.25,
						forcedReserve: 0.1,
						durationDays: 45,
					},
				},
				{
					id: "consolidate",
					label: "Consolidate the Line",
					description:
						"Gain +25% defensive plan weight and keep at least 25% in reserve for 45 days.",
					effect: {
						type: "PLAN_MODIFIER",
						plan: "DEFENSE",
						multiplier: 1.25,
						forcedReserve: 0.25,
						durationDays: 45,
					},
				},
			],
		},
	],
});

export const OPERATION_DEFINITIONS = Object.freeze({
	[EASTERN_FRONT_OPERATION.id]: EASTERN_FRONT_OPERATION,
});

export function validateOperationDefinition(definition) {
	const errors = [];
	if (!definition || typeof definition !== "object")
		return ["definition is required"];
	for (const key of [
		"id",
		"title",
		"scenarioUrl",
		"durationDays",
		"dayDurationMs",
		"directiveCooldownMs",
		"playerCountryId",
		"enemyCountryId",
	]) {
		if (definition[key] == null || definition[key] === "")
			errors.push(`missing ${key}`);
	}
	if (!COMMANDER_STANCES[definition.defaultDirective?.stance]) {
		errors.push("invalid default stance");
	}
	if (!definition.targetCities?.[definition.defaultDirective?.targetCity]) {
		errors.push("invalid default target city");
	}
	if (![0.1, 0.25, 0.4].includes(definition.defaultDirective?.reserve)) {
		errors.push("invalid default reserve");
	}
	const eventIds = new Set();
	for (const event of definition.events || []) {
		if (eventIds.has(event.id)) errors.push(`duplicate event ${event.id}`);
		eventIds.add(event.id);
		if (!Number.isFinite(event.day) || event.day <= 0)
			errors.push(`invalid event day ${event.id}`);
		if (!Array.isArray(event.choices) || event.choices.length < 2) {
			errors.push(`event ${event.id} requires choices`);
		}
	}
	return errors;
}

export function createOperationRuntime(definition) {
	const errors = validateOperationDefinition(definition);
	if (errors.length) throw new Error(`Invalid operation: ${errors.join(", ")}`);
	return {
		operationId: definition.id,
		currentDay: 0,
		activePlayMs: 0,
		lastDirectiveAtMs: -definition.directiveCooldownMs,
		directive: { ...definition.defaultDirective },
		kyivEnemyDays: 0,
		capitalEverLost: false,
		resolvedEventIds: [],
		queuedEventIds: [],
		modifiers: [],
		result: null,
		medals: [],
	};
}

export function getDirectiveCooldownRemaining(definition, runtime) {
	return Math.max(
		0,
		definition.directiveCooldownMs -
			(runtime.activePlayMs - runtime.lastDirectiveAtMs),
	);
}

export function advanceOperationActivePlay(runtime, elapsedMs, paused = false) {
	if (paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return runtime;
	return { ...runtime, activePlayMs: runtime.activePlayMs + elapsedMs };
}

export function applyCommanderDirective(definition, runtime, directive) {
	if (getDirectiveCooldownRemaining(definition, runtime) > 0) return null;
	if (!COMMANDER_STANCES[directive?.stance]) return null;
	if (!definition.targetCities[directive.targetCity]) return null;
	if (![0.1, 0.25, 0.4].includes(Number(directive.reserve))) return null;
	return {
		...runtime,
		lastDirectiveAtMs: runtime.activePlayMs,
		directive: {
			stance: directive.stance,
			targetCity: directive.targetCity,
			reserve: Number(directive.reserve),
		},
	};
}

export function calculateDirectiveAllocation(directive, modifiers = []) {
	const stance =
		COMMANDER_STANCES[directive.stance] || COMMANDER_STANCES.BALANCED;
	let reserve = Number(directive.reserve);
	for (const modifier of modifiers) {
		if (modifier.forcedReserve == null) continue;
		reserve =
			modifier.type === "OFFENSE"
				? Math.min(reserve, modifier.forcedReserve)
				: Math.max(reserve, modifier.forcedReserve);
	}
	reserve = Math.max(0, Math.min(0.8, reserve));
	const available = 1 - reserve;
	return {
		offense: available * stance.offenseShare,
		defense: available * (1 - stance.offenseShare),
		reserve,
	};
}

export function getPriorityPlanType(isFriendly) {
	return isFriendly ? "DEFEND_CITY" : "CAPTURE_CITY";
}

export function evaluateOperationDay(definition, runtime, snapshot) {
	const currentDay = Math.max(
		runtime.currentDay,
		Number(snapshot.currentDay) || 0,
	);
	const kyivFriendly = !!snapshot.cityFriendly?.kyiv;
	const next = {
		...runtime,
		currentDay,
		kyivEnemyDays: kyivFriendly ? 0 : runtime.kyivEnemyDays + 1,
		capitalEverLost: runtime.capitalEverLost || !kyivFriendly,
		queuedEventIds: [...runtime.queuedEventIds],
		resolvedEventIds: [...runtime.resolvedEventIds],
		modifiers: runtime.modifiers.filter(
			(modifier) => modifier.expiresDay > currentDay,
		),
	};

	for (const event of definition.events) {
		if (
			event.day <= currentDay &&
			!next.resolvedEventIds.includes(event.id) &&
			!next.queuedEventIds.includes(event.id)
		) {
			next.queuedEventIds.push(event.id);
		}
	}

	if (!snapshot.enemyActive) next.result = "EARLY_VICTORY";
	else if (!snapshot.playerActive || next.kyivEnemyDays >= 30)
		next.result = "DEFEAT";
	else if (currentDay >= definition.durationDays) {
		next.result = kyivFriendly ? "VICTORY" : "DEFEAT";
	}

	if (next.result === "VICTORY" || next.result === "EARLY_VICTORY") {
		next.medals = calculateOperationMedals(next, snapshot);
	}
	return next;
}

export function calculateOperationMedals(runtime, snapshot) {
	const medals = [];
	if (!runtime.capitalEverLost) medals.push("capital_unbroken");
	if (
		["kyiv", "kharkiv", "odesa"].every((city) => snapshot.cityFriendly?.[city])
	) {
		medals.push("cities_held");
	}
	if ((snapshot.coreControlRatio || 0) >= 0.6)
		medals.push("sovereign_majority");
	return medals;
}

export function resolveOperationEvent(definition, runtime, eventId, choiceId) {
	if (!runtime.queuedEventIds.includes(eventId)) return null;
	const event = definition.events.find((candidate) => candidate.id === eventId);
	const choice = event?.choices.find((candidate) => candidate.id === choiceId);
	if (!event || !choice) return null;
	const next = {
		...runtime,
		queuedEventIds: runtime.queuedEventIds.filter((id) => id !== eventId),
		resolvedEventIds: [...runtime.resolvedEventIds, eventId],
		modifiers: [...runtime.modifiers],
	};
	if (choice.effect.type === "PLAN_MODIFIER") {
		next.modifiers.push({
			type: choice.effect.plan,
			multiplier: choice.effect.multiplier,
			forcedReserve: choice.effect.forcedReserve,
			expiresDay: runtime.currentDay + choice.effect.durationDays,
		});
	}
	if (choice.effect.type === "QUALITY_AID") {
		next.modifiers.push({
			type: "COMBAT_BUFF",
			expiresDay: runtime.currentDay + choice.effect.durationDays,
		});
	}
	return { runtime: next, event, choice, effect: choice.effect };
}
