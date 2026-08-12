export const WAR_ARCHIVE_KEY = "modern-wars:war-archive:v1";
export const WAR_ARCHIVE_LIMIT = 25;

/**
 * @typedef {Object} ExperimentCountry
 * @property {string|number} id Stable serialized country identifier.
 * @property {string} name Display name captured at the start of the run.
 * @property {string} role Country role, such as PRIMARY, SUPPORT, or REBEL.
 * @property {string} [strategy] Per-country AI behavior.
 * @property {string} [buffState] Visible combat buff state.
 * @property {string} [hiddenBuffState] Hidden combat buff state.
 * @property {string} [color] Serialized country color.
 */

/**
 * @typedef {Object} ExperimentSide
 * @property {string} uid Stable side identifier, independent of array position.
 * @property {string} label Display name captured at the start of the run.
 * @property {string} [color] Serialized side color.
 * @property {Array<ExperimentCountry>} countries Serialized member countries.
 */

/**
 * Complete, serializable description of a run's starting conditions.
 * @typedef {Object} ExperimentSpec
 * @property {number} schemaVersion Contract version.
 * @property {string} buildVersion Game build that started the run.
 * @property {string} scenarioId Scenario or map identifier.
 * @property {string} scenarioName Scenario display name.
 * @property {string} scenarioHash Hash of the pristine scenario state.
 * @property {{id:string,name:string,hash:string}} scenario Scenario identity captured together for archive compatibility.
 * @property {Array<ExperimentSide>} sides Stable sides and their country roles.
 * @property {Array<{attackerSideUid:string,defenderSideUid:string}>} hostilities Directed starting hostilities.
 * @property {Record<string, unknown>} options Every result-affecting game option.
 * @property {number} seed Unsigned 32-bit gameplay RNG seed.
 * @property {string|null} parentReportId Report this run repeats or modifies.
 * @property {"FRESH"|"REMATCH"|"REPEAT_SEED"|"MODIFIED"} runMode How the run was created.
 */

/**
 * Structured evidence attached to a side at a point in the simulation.
 * Known numeric fields include territory, cities, capitals, personnel,
 * casualties, economy, equipment, and activeCountries. Additional fields are
 * retained so disabled or future systems do not invalidate reports.
 * @typedef {Object} SideMetrics
 * @property {string} sideUid Stable side identifier.
 * @property {string} [name] Side display name.
 * @property {number} [territory] Controlled territory or cells.
 * @property {number} [cities] Controlled cities.
 * @property {number} [capitals] Controlled capitals.
 * @property {number} [personnel] Active personnel or units.
 * @property {number} [casualties] Accumulated casualties.
 * @property {number} [economy] Aggregate economic strength.
 * @property {number} [equipment] Aggregate equipment strength.
 * @property {number} [activeCountries] Countries still fighting.
 * @property {string} [warPhase] Current side war phase.
 */

/**
 * @typedef {Object} WarEvent
 * @property {number} sequence Monotonic sequence across events and checkpoints.
 * @property {string} type Stable uppercase event type.
 * @property {number} tick Simulation tick when observed.
 * @property {string|null} date In-world date label or ISO value.
 * @property {string} source Subsystem that observed or initiated the event.
 * @property {string} summary Human-readable factual description.
 * @property {string|number|null} actorCountryId Acting country, when applicable.
 * @property {string|number|null} targetCountryId Target country, when applicable.
 * @property {string|null} actorSideUid Acting side, when applicable.
 * @property {string|null} targetSideUid Target side, when applicable.
 * @property {{label?:string,lat?:number,lng?:number}|null} location Optional map location.
 * @property {Record<string, unknown>} evidence Structured observations supporting the event.
 * @property {boolean} intervention Whether a director action caused the event.
 * @property {boolean} major Whether the event should be prioritized in the report.
 */

/**
 * @typedef {Object} WarCheckpoint
 * @property {number} sequence Monotonic sequence across events and checkpoints.
 * @property {number} tick Simulation tick.
 * @property {string|null} date In-world date label or ISO value.
 * @property {string} reason Why the snapshot was captured.
 * @property {Array<SideMetrics>} sideMetrics Compact metrics for every side.
 * @property {number|null} rngState Seeded gameplay RNG state, when captured.
 * @property {Record<string, unknown>} evidence Optional checkpoint context.
 */

/**
 * @typedef {Object} DecisiveContributor
 * @property {string} id Stable contributor category.
 * @property {string} title Short display title.
 * @property {string} summary Observed contribution, never a counterfactual claim.
 * @property {Record<string, unknown>} evidence Values or events supporting the summary.
 */

/**
 * Final, serializable account of one experiment.
 * @typedef {Object} WarReport
 * @property {number} schemaVersion Contract version.
 * @property {string} id Stable report identifier.
 * @property {string} startedAt ISO start timestamp.
 * @property {string} finishedAt ISO completion timestamp.
 * @property {number} durationMs Wall-clock run duration.
 * @property {number} durationTicks Simulation duration.
 * @property {{type:string,endingReason:string,winnerSideUid:string|null,survivingSideUids:Array<string>}} outcome Exact ending state.
 * @property {Array<SideMetrics>} initialMetrics Baseline before the first simulation frame.
 * @property {Array<SideMetrics>} finalMetrics Final or pre-cleanup side evidence.
 * @property {Array<DecisiveContributor>} decisiveContributors Three observed contributors.
 * @property {Array<WarEvent>} pivotalEvents Five to ten report-worthy events when available.
 * @property {Array<WarEvent>} interventions Logged director actions.
 * @property {boolean} modified Whether any intervention changed the run.
 * @property {ExperimentSpec} configuration Reconstructable starting configuration.
 * @property {number} seed Unsigned 32-bit gameplay RNG seed.
 * @property {string|null} parentReportId Parent report, when this is a rerun.
 * @property {Object|null} comparison Deltas against the parent report.
 * @property {number} eventCount Total retained events.
 * @property {number} checkpointCount Total retained checkpoints.
 */

/**
 * @typedef {Object} ExperimentRecorder
 * @property {ExperimentSpec} spec Normalized run configuration.
 * @property {string} runId Unique run identifier.
 * @property {string} startedAt ISO start timestamp.
 * @property {Array<WarEvent>} events Retained structured events.
 * @property {Array<WarCheckpoint>} checkpoints Retained metric checkpoints.
 * @property {Array<SideMetrics>} initialMetrics Baseline metrics.
 * @property {boolean} modified Whether an intervention occurred.
 * @property {number} sequence Next shared sequence number.
 * @property {{events:number,checkpoints:number}} limits Retention limits.
 */

const UINT32_RANGE = 0x100000000;

export function normalizeSeed(seed, fallback = 0) {
	if (typeof seed === "bigint") return Number(BigInt.asUintN(32, seed));
	if (typeof seed === "string" && seed.trim()) {
		try {
			return Number(BigInt.asUintN(32, BigInt(seed.trim())));
		} catch {
			return hashText(seed) >>> 0;
		}
	}
	const value = Number(seed);
	if (Number.isFinite(value)) return Math.trunc(value) >>> 0;
	return Math.trunc(Number(fallback) || 0) >>> 0;
}

export function createRandomSeed(random = null) {
	if (!random && globalThis.crypto?.getRandomValues) {
		return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
	}
	const source = random || Math.random;
	return (
		Math.floor(
			Math.max(0, Math.min(0.9999999999999999, source())) * UINT32_RANGE,
		) >>> 0
	);
}

export function createSeededRng(seed) {
	const normalizedSeed = normalizeSeed(seed);
	let state = normalizedSeed;
	const nextUint32 = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return (value ^ (value >>> 14)) >>> 0;
	};
	return {
		seed: normalizedSeed,
		next: () => nextUint32() / UINT32_RANGE,
		nextUint32,
		getState: () => state,
		setState: (nextState) => {
			state = normalizeSeed(nextState);
			return state;
		},
		int: (min, max) => {
			const low = Math.ceil(Math.min(min, max));
			const high = Math.floor(Math.max(min, max));
			return low + Math.floor((nextUint32() / UINT32_RANGE) * (high - low + 1));
		},
		pick: (values) =>
			values?.length
				? values[Math.floor((nextUint32() / UINT32_RANGE) * values.length)]
				: undefined,
	};
}

function hashText(text, hash = 0x811c9dc5) {
	let result = hash >>> 0;
	for (let index = 0; index < text.length; index++) {
		result ^= text.charCodeAt(index);
		result = Math.imul(result, 0x01000193) >>> 0;
	}
	return result;
}

function stableStringify(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(",")}}`;
}

export function hashScenarioContent(content) {
	let hash = 0x811c9dc5;
	if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
		const bytes =
			content instanceof ArrayBuffer
				? new Uint8Array(content)
				: new Uint8Array(
						content.buffer,
						content.byteOffset,
						content.byteLength,
					);
		for (const byte of bytes) {
			hash ^= byte;
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
	} else {
		hash = hashText(
			typeof content === "string" ? content : stableStringify(content),
		);
	}
	return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function cloneSerializable(value, fallback) {
	try {
		return value == null ? fallback : JSON.parse(JSON.stringify(value));
	} catch {
		return fallback;
	}
}

function normalizeCountry(country, index) {
	if (country == null || typeof country !== "object") {
		return {
			id: country ?? index,
			name: String(country ?? `Country ${index + 1}`),
			role: "SUPPORT",
			strategy: "BALANCED",
			buffState: "none",
			hiddenBuffState: "none",
			color: null,
		};
	}
	return {
		id: country.id ?? country.countryId ?? index,
		name: String(
			country.name ??
				country.displayName ??
				country.id ??
				`Country ${index + 1}`,
		),
		role: String(country.role ?? "SUPPORT").toUpperCase(),
		strategy: String(country.strategy ?? "BALANCED").toUpperCase(),
		buffState: String(country.buffState ?? "none"),
		hiddenBuffState: String(country.hiddenBuffState ?? "none"),
		color: country.color == null ? null : String(country.color),
	};
}

export function normalizeExperimentSpec(spec = {}) {
	const rawSides = Array.isArray(spec.sides) ? spec.sides : [];
	const usedUids = new Set();
	const sides = rawSides.map((side, index) => {
		let uid = String(side?.uid ?? side?.sideUid ?? `side-${index + 1}`);
		const baseUid = uid;
		let suffix = 2;
		while (usedUids.has(uid)) uid = `${baseUid}-${suffix++}`;
		usedUids.add(uid);
		const countries = Array.isArray(side?.countries)
			? side.countries
			: Array.isArray(side?.countryIds)
				? side.countryIds
				: [];
		return {
			uid,
			name: String(side?.name ?? side?.label ?? `Side ${index + 1}`),
			label: String(side?.label ?? side?.name ?? `Side ${index + 1}`),
			color: side?.color == null ? null : String(side.color),
			countries: countries.map(normalizeCountry),
			posture: String(
				side?.posture ?? side?.strategy ?? "BALANCED",
			).toUpperCase(),
		};
	});
	const sideUids = new Set(sides.map((side) => side.uid));
	const hostilities = (Array.isArray(spec.hostilities) ? spec.hostilities : [])
		.map((hostility) => ({
			attackerSideUid: String(
				hostility?.attackerSideUid ?? hostility?.attacker ?? "",
			),
			defenderSideUid: String(
				hostility?.defenderSideUid ?? hostility?.defender ?? "",
			),
		}))
		.filter(
			(entry) =>
				sideUids.has(entry.attackerSideUid) &&
				sideUids.has(entry.defenderSideUid) &&
				entry.attackerSideUid !== entry.defenderSideUid,
		);
	const scenario =
		spec.scenario && typeof spec.scenario === "object" ? spec.scenario : {};
	const scenarioId = String(
		spec.scenarioId ?? scenario.id ?? spec.scenario ?? "unknown",
	);
	const scenarioName = String(spec.scenarioName ?? scenario.name ?? scenarioId);
	const scenarioHash = String(spec.scenarioHash ?? scenario.hash ?? "unknown");
	return {
		schemaVersion: 1,
		buildVersion: String(spec.buildVersion ?? spec.build ?? "unknown"),
		scenarioId,
		scenarioName,
		scenarioHash,
		scenario: { id: scenarioId, name: scenarioName, hash: scenarioHash },
		sides,
		hostilities,
		options: cloneSerializable(spec.options, {}),
		seed: normalizeSeed(spec.seed),
		parentReportId:
			spec.parentReportId == null ? null : String(spec.parentReportId),
		runMode: ["FRESH", "REMATCH", "REPEAT_SEED", "MODIFIED"].includes(
			spec.runMode,
		)
			? spec.runMode
			: "FRESH",
	};
}

function isoNow(now) {
	const value = typeof now === "function" ? now() : now;
	return new Date(value ?? Date.now()).toISOString();
}

function normalizeMetrics(metrics) {
	const entries = Array.isArray(metrics)
		? metrics
		: Object.entries(metrics || {}).map(([sideUid, value]) => ({
				sideUid,
				...value,
			}));
	return entries.map((entry) => ({
		...cloneSerializable(entry, {}),
		sideUid: String(entry.sideUid ?? entry.uid ?? ""),
	}));
}

export function createExperimentRecorder(spec, options = {}) {
	const normalized = normalizeExperimentSpec(spec);
	return {
		spec: normalized,
		runId: String(
			options.runId ??
				`war-${Date.now().toString(36)}-${normalized.seed.toString(16)}`,
		),
		startedAt: isoNow(options.now),
		events: [],
		checkpoints: [],
		initialMetrics: normalizeMetrics(options.initialMetrics),
		modified: false,
		sequence: 0,
		limits: {
			events: Math.max(1, Math.trunc(options.maxEvents ?? 2000)),
			checkpoints: Math.max(1, Math.trunc(options.maxCheckpoints ?? 500)),
		},
	};
}

function trimOldest(values, limit) {
	if (values.length > limit) values.splice(0, values.length - limit);
}

export function appendWarEvent(recorder, input = {}) {
	if (!recorder?.events)
		throw new TypeError("A valid experiment recorder is required");
	const event = {
		sequence: recorder.sequence++,
		type: String(input.type ?? "OBSERVATION")
			.trim()
			.toUpperCase()
			.replaceAll(/[^A-Z0-9]+/g, "_"),
		tick: Math.max(0, Math.trunc(Number(input.tick) || 0)),
		date: input.date == null ? null : String(input.date),
		source: String(input.source ?? "simulation"),
		summary: String(
			input.summary ?? input.label ?? input.type ?? "Observation",
		),
		actorCountryId: input.actorCountryId ?? null,
		targetCountryId: input.targetCountryId ?? null,
		actorSideUid:
			input.actorSideUid == null ? null : String(input.actorSideUid),
		targetSideUid:
			input.targetSideUid == null ? null : String(input.targetSideUid),
		location: cloneSerializable(input.location, null),
		evidence: cloneSerializable(input.evidence, {}),
		intervention: Boolean(input.intervention || input.type === "INTERVENTION"),
		major: Boolean(input.major),
	};
	if (event.intervention) recorder.modified = true;
	recorder.events.push(event);
	trimOldest(recorder.events, recorder.limits.events);
	return event;
}

export function appendWarCheckpoint(recorder, input = {}) {
	if (!recorder?.checkpoints)
		throw new TypeError("A valid experiment recorder is required");
	const checkpoint = {
		sequence: recorder.sequence++,
		tick: Math.max(0, Math.trunc(Number(input.tick) || 0)),
		date: input.date == null ? null : String(input.date),
		reason: String(input.reason ?? "PERIODIC"),
		sideMetrics: normalizeMetrics(input.sideMetrics ?? input.metrics),
		rngState: input.rngState == null ? null : normalizeSeed(input.rngState),
		evidence: cloneSerializable(input.evidence, {}),
	};
	if (!recorder.initialMetrics.length && input.baseline) {
		recorder.initialMetrics = cloneSerializable(checkpoint.sideMetrics, []);
	}
	recorder.checkpoints.push(checkpoint);
	trimOldest(recorder.checkpoints, recorder.limits.checkpoints);
	return checkpoint;
}

const FACTOR_METRICS = [
	["capitals", "Capital control"],
	["cities", "City control"],
	["territory", "Territorial control"],
	["personnel", "Force preservation"],
	["economy", "Economic endurance"],
	["equipment", "Equipment readiness"],
	["activeCountries", "Coalition survival"],
];

const OPERATIONAL_COORDINATION_EVENT_TYPES = new Set([
	"TASK_FORCE_FORMED",
	"OFFENSIVE_LAUNCHED",
	"OBJECTIVE_SECURED",
	"OFFENSIVE_CULMINATED",
	"TASK_FORCE_WITHDREW",
	"TASK_FORCE_REGROUPED",
]);

const OPERATIONAL_AI_EVENT_TYPES = new Set([
	...OPERATIONAL_COORDINATION_EVENT_TYPES,
	"INTEL_SURPRISE",
]);

const OPERATIONAL_EVENT_COUNT_LABELS = {
	TASK_FORCE_FORMED: ["task force formation", "task force formations"],
	OFFENSIVE_LAUNCHED: ["offensive launch", "offensive launches"],
	OBJECTIVE_SECURED: ["secured objective", "secured objectives"],
	OFFENSIVE_CULMINATED: ["offensive culmination", "offensive culminations"],
	TASK_FORCE_WITHDREW: ["task force withdrawal", "task force withdrawals"],
	TASK_FORCE_REGROUPED: ["task force regrouping", "task force regroupings"],
	INTEL_SURPRISE: ["intelligence surprise", "intelligence surprises"],
};

function operationalEventCounts(events, acceptedTypes) {
	const counts = new Map();
	for (const event of events) {
		if (!acceptedTypes.has(event.type)) continue;
		counts.set(event.type, (counts.get(event.type) || 0) + 1);
	}
	return counts;
}

function describeOperationalEventCounts(counts) {
	return Array.from(counts, ([type, count]) => {
		const labels = OPERATIONAL_EVENT_COUNT_LABELS[type] || [type, type];
		return `${count} ${count === 1 ? labels[0] : labels[1]}`;
	}).join(", ");
}

function observedSideUids(events) {
	return [
		...new Set(
			events.flatMap((event) => [event.actorSideUid, event.targetSideUid]),
		),
	].filter(Boolean);
}

function metricValue(metrics, key) {
	const value = Number(metrics?.[key]);
	return Number.isFinite(value) ? value : null;
}

export function deriveDecisiveContributors({
	initialMetrics = [],
	finalMetrics = [],
	events = [],
	outcome = {},
} = {}) {
	const final = normalizeMetrics(finalMetrics);
	const initial = normalizeMetrics(initialMetrics);
	const winnerUid =
		outcome.winnerSideUid == null ? null : String(outcome.winnerSideUid);
	const reference =
		final.find((entry) => entry.sideUid === winnerUid) ||
		[...final].sort(
			(left, right) =>
				(metricValue(right, "territory") || 0) -
					(metricValue(left, "territory") || 0) ||
				(metricValue(right, "cities") || 0) -
					(metricValue(left, "cities") || 0) ||
				(metricValue(right, "personnel") || 0) -
					(metricValue(left, "personnel") || 0),
		)[0];
	const rivals = final.filter((entry) => entry.sideUid !== reference?.sideUid);
	const ranked = [];
	if (reference && rivals.length) {
		for (const [key, title] of FACTOR_METRICS) {
			const referenceValue = metricValue(reference, key);
			const rivalValues = rivals
				.map((entry) => metricValue(entry, key))
				.filter((value) => value != null);
			if (referenceValue == null || !rivalValues.length) continue;
			const rivalValue = Math.max(...rivalValues);
			const scale = Math.max(1, Math.abs(referenceValue), Math.abs(rivalValue));
			const advantage = (referenceValue - rivalValue) / scale;
			const referenceInitial = initial.find(
				(entry) => entry.sideUid === reference.sideUid,
			);
			ranked.push({
				id: key,
				title,
				score: advantage,
				summary: `${title} was an observed contributor: ${reference.name ?? reference.sideUid} finished at ${referenceValue}, compared with the strongest rival at ${rivalValue}.`,
				evidence: {
					metric: key,
					referenceSideUid: reference.sideUid,
					referenceValue,
					rivalValue,
					referenceChange:
						referenceValue -
						(metricValue(referenceInitial, key) ?? referenceValue),
				},
			});
		}
	}
	const interventionCount = events.filter((event) => event.intervention).length;
	if (interventionCount > 0) {
		ranked.push({
			id: "director-interventions",
			title: "Director interventions",
			score: 0.45,
			summary: `${interventionCount} logged director intervention${interventionCount === 1 ? " was" : "s were"} an observed contributor; this run is marked Modified.`,
			evidence: { interventionCount, modified: true },
		});
	}
	const coordinationEvents = events.filter((event) =>
		OPERATIONAL_COORDINATION_EVENT_TYPES.has(event.type),
	);
	if (coordinationEvents.length > 0) {
		const counts = operationalEventCounts(
			coordinationEvents,
			OPERATIONAL_COORDINATION_EVENT_TYPES,
		);
		ranked.push({
			id: "operational-coordination",
			title: "Operational coordination",
			priority: 1,
			score: Math.min(0.75, 0.5 + coordinationEvents.length / 40),
			summary: `Operational coordination was an observed contributor. The run recorded ${describeOperationalEventCounts(counts)}. These observations accompany the ending state without asserting what would have happened otherwise.`,
			evidence: {
				eventCount: coordinationEvents.length,
				eventTypes: Object.fromEntries(counts),
				sideUids: observedSideUids(coordinationEvents),
			},
		});
	}
	const intelligenceEvents = events.filter(
		(event) => event.type === "INTEL_SURPRISE",
	);
	if (intelligenceEvents.length > 0) {
		const counts = operationalEventCounts(
			intelligenceEvents,
			OPERATIONAL_AI_EVENT_TYPES,
		);
		ranked.push({
			id: "intelligence-surprise",
			title: "Intelligence surprise",
			priority: 1,
			score: Math.min(0.7, 0.5 + intelligenceEvents.length / 40),
			summary: `Intelligence conditions were an observed contributor. The run recorded ${describeOperationalEventCounts(counts)} alongside operational decisions. The report treats that timing as observed evidence, not a counterfactual conclusion.`,
			evidence: {
				eventCount: intelligenceEvents.length,
				eventTypes: Object.fromEntries(counts),
				sideUids: observedSideUids(intelligenceEvents),
			},
		});
	}
	const eventCounts = new Map();
	for (const event of events) {
		if (
			OPERATIONAL_AI_EVENT_TYPES.has(event.type) ||
			[
				"INTERVENTION",
				"CHECKPOINT",
				"OBSERVATION",
				"AI_PLAN_STARTED",
				"ECONOMY_EVENT",
				"CONFIGURATION_LOCKED",
				"BASELINE_RECORDED",
				"FINAL_STATE_CAPTURED",
			].includes(event.type)
		)
			continue;
		eventCounts.set(event.type, (eventCounts.get(event.type) || 0) + 1);
	}
	for (const [type, count] of eventCounts) {
		ranked.push({
			id: `event-${type.toLowerCase()}`,
			title: type
				.toLowerCase()
				.replaceAll("_", " ")
				.replace(/^./, (letter) => letter.toUpperCase()),
			score: Math.min(0.5, count / 10),
			summary: `${count} recorded ${type.toLowerCase().replaceAll("_", " ")} event${count === 1 ? "" : "s"} were observed contributors to the ending state.`,
			evidence: { eventType: type, count },
		});
	}
	ranked.sort(
		(left, right) =>
			(right.priority || 0) - (left.priority || 0) ||
			right.score - left.score ||
			left.id.localeCompare(right.id),
	);
	const selected = ranked
		.slice(0, 3)
		.map(({ priority: _priority, score: _score, ...factor }) => factor);
	while (selected.length < 3) {
		selected.push({
			id: `ending-state-${selected.length + 1}`,
			title: "Ending state",
			summary: `${outcome.endingReason ?? outcome.type ?? "The recorded ending"} was an observed contributor to the reported result.`,
			evidence: {
				endingType: outcome.type ?? "UNKNOWN",
				endingReason: outcome.endingReason ?? "Unknown",
			},
		});
	}
	return selected;
}

function selectPivotalEvents(events) {
	const relevant = events.filter(
		(event) => !["CHECKPOINT", "OBSERVATION"].includes(event.type),
	);
	if (relevant.length <= 10) return relevant;
	const priorityTypes = new Set([
		"WAR_STARTED",
		"CAPITAL_LOST",
		"CAPITAL_RECOVERED",
		"CITY_CONTROLLER_CHANGED",
		"WAR_PHASE_CHANGED",
		"EQUIPMENT_SHORTAGE",
		"ECONOMY_BAND_CHANGED",
		"AIRFIELD_DESTROYED",
		"AIRFIELD_CAPTURED",
		"AI_PLAN_SUCCEEDED",
		"AI_PLAN_FAILED",
		...OPERATIONAL_AI_EVENT_TYPES,
		"REBELLION_STARTED",
		"REBELLION_SUCCEEDED",
		"REBELLION_FAILED",
		"CAPITULATION_TRIGGERED",
		"COUNTRY_CAPITULATED",
		"PEACE_OFFERED",
		"PEACE_ACCEPTED",
		"PEACE_REJECTED",
		"INTERVENTION",
		"ENDING_TRIGGERED",
		"WAR_ENDED",
	]);
	const selected = [];
	const seen = new Set();
	const add = (event) => {
		if (!event || seen.has(event.sequence) || selected.length >= 10) return;
		seen.add(event.sequence);
		selected.push(event);
	};
	for (const type of ["WAR_STARTED", "ENDING_TRIGGERED", "WAR_ENDED"]) {
		add(relevant.find((event) => event.type === type));
	}
	for (const type of OPERATIONAL_AI_EVENT_TYPES) {
		add(relevant.find((event) => event.type === type));
	}
	for (const event of relevant) {
		if (event.major || event.intervention || priorityTypes.has(event.type)) {
			add(event);
		}
	}
	for (const event of relevant) {
		if (selected.length >= 5) break;
		add(event);
	}
	return selected.sort((left, right) => left.sequence - right.sequence);
}

export function compareWarReports(parent, child) {
	if (!parent || !child) return null;
	const parentMetrics = normalizeMetrics(parent.finalMetrics);
	const childMetrics = normalizeMetrics(child.finalMetrics);
	const sideUids = [
		...new Set(
			[...parentMetrics, ...childMetrics].map((entry) => entry.sideUid),
		),
	];
	const metrics = [
		"territory",
		"cities",
		"capitals",
		"personnel",
		"casualties",
		"economy",
		"equipment",
		"activeCountries",
	];
	const sideDeltas = sideUids.map((sideUid) => {
		const before =
			parentMetrics.find((entry) => entry.sideUid === sideUid) || {};
		const after = childMetrics.find((entry) => entry.sideUid === sideUid) || {};
		const deltas = {};
		for (const metric of metrics) {
			const beforeValue = metricValue(before, metric);
			const afterValue = metricValue(after, metric);
			if (beforeValue != null || afterValue != null)
				deltas[metric] = (afterValue || 0) - (beforeValue || 0);
		}
		return { sideUid, ...deltas };
	});
	return {
		parentReportId: parent.id,
		outcomeChanged:
			parent.outcome?.type !== child.outcome?.type ||
			parent.outcome?.winnerSideUid !== child.outcome?.winnerSideUid,
		durationTicks: (child.durationTicks || 0) - (parent.durationTicks || 0),
		durationMs: (child.durationMs || 0) - (parent.durationMs || 0),
		sideDeltas,
	};
}

export function finalizeWarReport(recorder, input = {}) {
	if (!recorder?.spec)
		throw new TypeError("A valid experiment recorder is required");
	const rawOutcome = input.outcome || input;
	const outcome = {
		type: String(rawOutcome.type ?? input.endingType ?? "UNKNOWN"),
		endingReason: String(
			rawOutcome.endingReason ?? input.endingReason ?? "Unknown",
		),
		winnerSideUid:
			rawOutcome.winnerSideUid == null
				? null
				: String(rawOutcome.winnerSideUid),
		survivingSideUids: (
			rawOutcome.survivingSideUids ||
			input.survivingSideUids ||
			[]
		).map(String),
	};
	const finalMetrics = normalizeMetrics(
		input.finalMetrics ?? recorder.checkpoints.at(-1)?.sideMetrics,
	);
	const finishedAt = isoNow(input.now);
	const durationMs = Number.isFinite(input.durationMs)
		? Math.max(0, input.durationMs)
		: Math.max(0, Date.parse(finishedAt) - Date.parse(recorder.startedAt));
	const durationTicks = Math.max(
		0,
		Math.trunc(
			input.durationTicks ??
				input.tick ??
				recorder.checkpoints.at(-1)?.tick ??
				0,
		),
	);
	const report = {
		schemaVersion: 1,
		id: String(input.reportId ?? recorder.runId),
		startedAt: recorder.startedAt,
		finishedAt,
		durationMs,
		durationTicks,
		outcome,
		initialMetrics: cloneSerializable(recorder.initialMetrics, []),
		finalMetrics,
		decisiveContributors: deriveDecisiveContributors({
			initialMetrics: recorder.initialMetrics,
			finalMetrics,
			events: recorder.events,
			outcome,
		}),
		pivotalEvents: selectPivotalEvents(recorder.events),
		interventions: recorder.events.filter((event) => event.intervention),
		modified: recorder.modified,
		configuration: cloneSerializable(recorder.spec, recorder.spec),
		seed: recorder.spec.seed,
		parentReportId: recorder.spec.parentReportId,
		comparison: null,
		eventCount: recorder.events.length,
		checkpointCount: recorder.checkpoints.length,
	};
	if (input.parentReport)
		report.comparison = compareWarReports(input.parentReport, report);
	return report;
}

function resolveStorage(storage) {
	return storage ?? globalThis.localStorage ?? null;
}

function archiveSummary(report) {
	return cloneSerializable(
		{
			...report,
			pivotalEvents: report.pivotalEvents?.slice(0, 10) || [],
			interventions: report.interventions?.slice(-25) || [],
		},
		null,
	);
}

export function readWarArchive(storage = null, { key = WAR_ARCHIVE_KEY } = {}) {
	const target = resolveStorage(storage);
	if (!target?.getItem) return [];
	try {
		const parsed = JSON.parse(target.getItem(key) || "[]");
		return Array.isArray(parsed)
			? parsed.filter((entry) => entry && typeof entry === "object")
			: [];
	} catch {
		return [];
	}
}

export function persistWarReport(
	report,
	storage = null,
	{ key = WAR_ARCHIVE_KEY, limit = WAR_ARCHIVE_LIMIT } = {},
) {
	const target = resolveStorage(storage);
	if (!target?.setItem) return [];
	const archive = readWarArchive(target, { key }).filter(
		(entry) => entry.id !== report.id,
	);
	archive.unshift(archiveSummary(report));
	archive.length = Math.min(archive.length, Math.max(1, Math.trunc(limit)));
	while (archive.length) {
		try {
			target.setItem(key, JSON.stringify(archive));
			return archive;
		} catch {
			archive.pop();
		}
	}
	try {
		target.setItem(key, "[]");
	} catch {
		// Storage can remain unavailable; the live report is still valid.
	}
	return [];
}
