export const AI_INTEL_DEFAULTS = Object.freeze({
	SCAN_INTERVAL_TICKS: 150,
	FRESH_TICKS: 300,
	STALE_TICKS: 1200,
	EXPIRE_TICKS: 1800,
});

/**
 * One observer's last known, serialized view of an enemy formation. It never
 * retains the live enemy unit object or its current position.
 * @typedef {Object} AiIntelContact
 * @property {string} key Observer-local key (`enemySideUid:sectorId:unitId`).
 * @property {string} observerSideUid Side that owns this information.
 * @property {string} enemySideUid Observed hostile side.
 * @property {string} sectorId Hostile-side or front-sector scope.
 * @property {string|number} unitId Stable observed formation identifier.
 * @property {string|number|null} countryId Observed sovereign, when known.
 * @property {"LAND"|"SEA"|"AIR"} domain Observed operating domain.
 * @property {string} kind Observed unit kind.
 * @property {number} lat Last observed latitude.
 * @property {number} lng Last observed longitude.
 * @property {number} velocityLat Estimated latitude change per tick.
 * @property {number} velocityLng Estimated wrapped longitude change per tick.
 * @property {number} observedPower Combat power estimated at observation time.
 * @property {number} baseConfidence Confidence assigned to the observation.
 * @property {number} confidence Age-decayed confidence.
 * @property {number} observedTick Tick of the latest successful observation.
 * @property {number} ageTicks Age at the last decay pass.
 * @property {"FRESH"|"STALE"|"DEGRADED"} status Freshness band.
 * @property {string} source Observation source such as local land or air recon.
 */

/**
 * Observer-scoped contact ledger. Each side owns a separate state so a contact
 * learned by one coalition is not silently shared with another.
 * @typedef {Object} AiIntelState
 * @property {string} observerSideUid Side that owns the ledger.
 * @property {Array<string>} hostileSideUids Sides currently eligible as contacts.
 * @property {Record<string, AiIntelContact>} contacts Contacts keyed by enemy side and unit.
 * @property {number} lastScanTick Last scheduled observation scan.
 * @property {number} revision Monotonic state revision.
 * @property {{scanIntervalTicks:number,freshTicks:number,staleTicks:number,expireTicks:number}} config Timing configuration.
 */

/**
 * Live information supplied by the simulation only when the observer can
 * actually detect a unit.
 * @typedef {Object} AiIntelObservation
 * @property {string|number} unitId Stable formation identifier.
 * @property {string} enemySideUid Observed side.
 * @property {string} [sectorId] Front pair key; defaults to the hostile side.
 * @property {string|number|null} [countryId] Observed sovereign.
 * @property {number} lat Observed latitude.
 * @property {number} lng Observed longitude.
 * @property {string} [kind] Unit kind.
 * @property {"LAND"|"SEA"|"AIR"} [domain] Operating domain.
 * @property {number} [combatPower] Explicit combat power, when available.
 * @property {number} [health] Current health fallback.
 * @property {number} [maxHealth] Maximum health fallback.
 * @property {number} [equipment] Equipment fallback for armor or air units.
 * @property {boolean} [visible] False prevents observation.
 * @property {number} [detectionChance] Chance of detecting this visible unit.
 * @property {number} [errorRadiusDeg] Maximum seeded position error.
 * @property {number} [powerErrorFraction] Maximum seeded proportional power error.
 * @property {number} [confidence] Base observation confidence from zero to one.
 * @property {string} [source] Recon source.
 */

function finite(value, fallback = 0) {
	return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function wrapLongitude(lng) {
	let wrapped = lng;
	while (wrapped > 180) wrapped -= 360;
	while (wrapped < -180) wrapped += 360;
	return wrapped;
}

function wrappedDelta(to, from) {
	return wrapLongitude(to - from);
}

function randomValue(rng) {
	const value = typeof rng === "function" ? rng() : rng?.next?.();
	return Number.isFinite(value) ? clamp(value, 0, 0.9999999999999999) : 0.5;
}

function normalizeConfig(config = {}) {
	const scanIntervalTicks = Math.max(
		1,
		Math.trunc(
			finite(config.scanIntervalTicks, AI_INTEL_DEFAULTS.SCAN_INTERVAL_TICKS),
		),
	);
	const freshTicks = Math.max(
		1,
		Math.trunc(finite(config.freshTicks, AI_INTEL_DEFAULTS.FRESH_TICKS)),
	);
	const staleTicks = Math.max(
		freshTicks,
		Math.trunc(finite(config.staleTicks, AI_INTEL_DEFAULTS.STALE_TICKS)),
	);
	const expireTicks = Math.max(
		staleTicks + 1,
		Math.trunc(finite(config.expireTicks, AI_INTEL_DEFAULTS.EXPIRE_TICKS)),
	);
	return { scanIntervalTicks, freshTicks, staleTicks, expireTicks };
}

export function createAiIntelState(observerSideUid, options = {}) {
	const observer =
		typeof observerSideUid === "object"
			? observerSideUid.observerSideUid
			: observerSideUid;
	const settings =
		typeof observerSideUid === "object" ? observerSideUid : options;
	return {
		observerSideUid: String(observer ?? ""),
		hostileSideUids: [...new Set((settings.hostileSideUids || []).map(String))],
		contacts: {},
		lastScanTick: -normalizeConfig(settings.config).scanIntervalTicks,
		revision: 0,
		config: normalizeConfig(settings.config),
	};
}

export function setAiIntelHostilities(state, hostileSideUids) {
	const hostiles = [...new Set((hostileSideUids || []).map(String))].filter(
		(sideUid) => sideUid !== state.observerSideUid,
	);
	const allowed = new Set(hostiles);
	return {
		...state,
		hostileSideUids: hostiles,
		contacts: Object.fromEntries(
			Object.entries(state.contacts).filter(([, contact]) =>
				allowed.has(contact.enemySideUid),
			),
		),
		revision: state.revision + 1,
	};
}

export function shouldScanAiIntel(state, tick) {
	return (
		Math.max(0, Math.trunc(finite(tick))) - state.lastScanTick >=
		state.config.scanIntervalTicks
	);
}

export function estimateObservedCombatPower(
	observation,
	{ armorEnabled = true, airPowerEnabled = true } = {},
) {
	if (Number.isFinite(Number(observation.combatPower))) {
		return Math.max(0, Number(observation.combatPower));
	}
	const healthRatio = clamp(
		finite(observation.health, 100) /
			Math.max(1, finite(observation.maxHealth, 100)),
		0,
		1,
	);
	const kind = String(observation.kind || "army").toLowerCase();
	const equipment = Math.max(0, finite(observation.equipment));
	if (kind === "armor" && armorEnabled) {
		return healthRatio * Math.max(1, Math.sqrt(equipment || 1) * 0.5);
	}
	if ((kind === "air" || observation.domain === "AIR") && airPowerEnabled) {
		return healthRatio * Math.max(1, Math.sqrt(equipment || 1) * 0.4);
	}
	return healthRatio;
}

function contactStatus(ageTicks, config) {
	if (ageTicks <= config.freshTicks) return "FRESH";
	if (ageTicks <= config.staleTicks) return "STALE";
	return "DEGRADED";
}

function decayedConfidence(contact, tick, config) {
	const age = Math.max(0, tick - contact.observedTick);
	if (age <= config.freshTicks) {
		return contact.baseConfidence * (1 - 0.15 * (age / config.freshTicks));
	}
	if (age <= config.staleTicks) {
		const progress =
			(age - config.freshTicks) / (config.staleTicks - config.freshTicks || 1);
		return contact.baseConfidence * (0.85 - progress * 0.5);
	}
	const progress =
		(age - config.staleTicks) / (config.expireTicks - config.staleTicks || 1);
	return contact.baseConfidence * (0.35 - progress * 0.3);
}

export function decayAiIntel(state, tick) {
	const currentTick = Math.max(0, Math.trunc(finite(tick)));
	const contacts = {};
	for (const [key, contact] of Object.entries(state.contacts)) {
		const ageTicks = Math.max(0, currentTick - contact.observedTick);
		if (ageTicks > state.config.expireTicks) continue;
		contacts[key] = {
			...contact,
			ageTicks,
			confidence: clamp(
				decayedConfidence(contact, currentTick, state.config),
				0,
				1,
			),
			status: contactStatus(ageTicks, state.config),
		};
	}
	return { ...state, contacts, revision: state.revision + 1 };
}

export function expireAiIntel(state, tick) {
	return decayAiIntel(state, tick);
}

export function refreshAiIntel(state, observations, options = {}) {
	const tick = Math.max(0, Math.trunc(finite(options.tick)));
	const decayed = decayAiIntel(state, tick);
	if (!options.force && !shouldScanAiIntel(decayed, tick)) return decayed;
	const hostileSideUids = new Set(
		(options.hostileSideUids || decayed.hostileSideUids).map(String),
	);
	const contacts = { ...decayed.contacts };
	for (const observation of observations || []) {
		if (!observation || observation.visible === false) continue;
		const enemySideUid = String(
			observation.enemySideUid ?? observation.sideUid ?? "",
		);
		if (
			!enemySideUid ||
			enemySideUid === decayed.observerSideUid ||
			!hostileSideUids.has(enemySideUid)
		) {
			continue;
		}
		const detectionChance = clamp(finite(observation.detectionChance, 1), 0, 1);
		if (randomValue(options.rng) >= detectionChance) continue;
		const unitId = observation.unitId ?? observation.id;
		if (unitId == null) continue;
		const sectorId = String(observation.sectorId ?? enemySideUid);
		const key = `${enemySideUid}:${sectorId}:${String(unitId)}`;
		const previous = contacts[key];
		const errorRadius = Math.max(0, finite(observation.errorRadiusDeg));
		const angle = randomValue(options.rng) * Math.PI * 2;
		const radius = Math.sqrt(randomValue(options.rng)) * errorRadius;
		const lat = clamp(
			finite(observation.lat) + Math.sin(angle) * radius,
			-90,
			90,
		);
		const lng = wrapLongitude(
			finite(observation.lng) + Math.cos(angle) * radius,
		);
		const elapsed = Math.max(1, tick - (previous?.observedTick ?? tick - 1));
		const rawPower = estimateObservedCombatPower(
			observation,
			options.capabilities,
		);
		const powerError = Math.max(0, finite(observation.powerErrorFraction));
		const observedPower = Math.max(
			0,
			rawPower * (1 + (randomValue(options.rng) * 2 - 1) * powerError),
		);
		const baseConfidence = clamp(
			finite(observation.confidence, 1 - Math.min(0.75, errorRadius / 4)),
			0.05,
			1,
		);
		contacts[key] = {
			key,
			observerSideUid: decayed.observerSideUid,
			enemySideUid,
			sectorId,
			unitId,
			countryId: observation.countryId ?? observation.sovereignId ?? null,
			domain: ["LAND", "SEA", "AIR"].includes(observation.domain)
				? observation.domain
				: "LAND",
			kind: String(observation.kind ?? "army"),
			lat,
			lng,
			velocityLat: previous ? (lat - previous.lat) / elapsed : 0,
			velocityLng: previous ? wrappedDelta(lng, previous.lng) / elapsed : 0,
			observedPower,
			baseConfidence,
			confidence: baseConfidence,
			observedTick: tick,
			ageTicks: 0,
			status: "FRESH",
			source: String(observation.source ?? "local"),
		};
	}
	return {
		...decayed,
		hostileSideUids: [...hostileSideUids],
		contacts,
		lastScanTick: tick,
		revision: decayed.revision + 1,
	};
}

export function estimateAiIntelContact(contact, tick, config = {}) {
	const timing = normalizeConfig(config);
	const ageTicks = Math.max(0, Math.trunc(finite(tick)) - contact.observedTick);
	if (ageTicks > timing.expireTicks) return null;
	const confidence = clamp(decayedConfidence(contact, tick, timing), 0, 1);
	const predictionTicks = Math.min(ageTicks, timing.staleTicks);
	const power = Math.max(0, contact.observedPower * (0.6 + confidence * 0.4));
	return {
		...contact,
		lat: clamp(contact.lat + contact.velocityLat * predictionTicks, -90, 90),
		lng: wrapLongitude(contact.lng + contact.velocityLng * predictionTicks),
		ageTicks,
		confidence,
		status: contactStatus(ageTicks, timing),
		estimatedPower: power,
		minimumPower: power * (0.5 + confidence * 0.5),
		maximumPower: power * (1.5 - confidence * 0.5),
	};
}

export function estimateAiIntelArea(
	state,
	{ tick, center = null, radiusSq = Infinity, enemySideUids = null } = {},
) {
	const allowed = enemySideUids
		? new Set(enemySideUids.map(String))
		: new Set(state.hostileSideUids);
	const contacts = [];
	let estimatedPower = 0;
	let confidencePower = 0;
	for (const contact of Object.values(state.contacts)) {
		if (!allowed.has(contact.enemySideUid)) continue;
		const estimate = estimateAiIntelContact(contact, tick, state.config);
		if (!estimate) continue;
		if (center) {
			const dLat = estimate.lat - center.lat;
			const dLng = wrappedDelta(estimate.lng, center.lng);
			if (dLat * dLat + dLng * dLng > radiusSq) continue;
		}
		contacts.push(estimate);
		estimatedPower += estimate.estimatedPower;
		confidencePower += estimate.estimatedPower * estimate.confidence;
	}
	contacts.sort(
		(left, right) =>
			right.estimatedPower - left.estimatedPower ||
			left.key.localeCompare(right.key),
	);
	return {
		observerSideUid: state.observerSideUid,
		tick: Math.max(0, Math.trunc(finite(tick))),
		contactCount: contacts.length,
		estimatedPower,
		confidence:
			estimatedPower > 0 ? clamp(confidencePower / estimatedPower, 0, 1) : 0,
		contacts,
	};
}

export function createAiIntelObserverSnapshot(state, tick) {
	const estimate = estimateAiIntelArea(state, { tick });
	return {
		observerSideUid: state.observerSideUid,
		tick: estimate.tick,
		lastScanTick: state.lastScanTick,
		revision: state.revision,
		hostileSideUids: [...state.hostileSideUids],
		contacts: estimate.contacts.map((contact) => ({ ...contact })),
	};
}
