/**
 * Pure formation-strength accounting. These helpers intentionally know nothing
 * about map markers or runtime unit objects, so simulation totals remain the
 * source of truth while renderers can choose a cheaper visual representation.
 */

export const FORMATION_STRENGTH_DEFAULTS = Object.freeze({
	BASE_PERSONNEL_PER_FORMATION: 1000,
	PRESERVE_SMALL_WAR_PERSONNEL: 250_000,
	LARGE_PERSONNEL_PER_FORMATION: 5000,
	MIN_FORMATIONS: 1,
	MAX_FORMATIONS: 800,
	BASE_HEALTH: 100,
});

/**
 * Serializable personnel and materiel carried by one simulated formation.
 * Personnel, equipment, and casualties are whole, non-negative counts.
 *
 * @typedef {Object} FormationAccounting
 * @property {string|number} [id] Stable formation identity.
 * @property {number} [personnel] Surviving personnel represented by the formation.
 * @property {number} [nominalPersonnel] Full-strength personnel when deriving personnel from health.
 * @property {number} [strengthMultiplier] Explicit fallback strength in standard formations.
 * @property {number} [health] Legacy health value used only when personnel is absent.
 * @property {number} [baseHealth] Health representing one nominal formation.
 * @property {number|Record<string,number>} [equipment] Discrete equipment total or totals by type.
 * @property {number} [casualties] Historical casualties attributed to the formation.
 */

/**
 * Formation descriptor returned by the deployment allocator.
 *
 * @typedef {FormationAccounting & {
 *   id:string|number,
 *   index:number,
 *   personnel:number,
 *   nominalPersonnel:number,
 *   strengthMultiplier:number
 * }} FormationStrengthDescriptor
 */

/**
 * @typedef {Object} FormationBudgetOptions
 * @property {number} [basePersonnelPerFormation=1000] Marker granularity retained for small wars.
 * @property {number} [preserveSmallWarsUpTo=250000] Personnel threshold using the small-war granularity.
 * @property {number} [largePersonnelPerFormation=5000] Personnel represented by each formation above the threshold.
 * @property {number} [minFormations=1] Minimum budget for a non-empty force.
 * @property {number} [maxFormations=800] Absolute simulation-formation ceiling.
 */

/**
 * @typedef {Object} FormationDistributionOptions
 * @property {number} [nominalPersonnel=1000] Personnel represented by one standard-strength formation.
 * @property {string} [idPrefix="formation"] Stable prefix used for generated identities.
 * @property {Record<string,unknown>} [template] Shallow-copied fields applied to every descriptor.
 * @property {Array<number>} [weights] Optional non-negative allocation weights.
 * @property {()=>number} [rng] Optional explicit seeded random source, used only to break equal-remainder ties.
 * @property {(index:number,personnel:number)=>string|number} [idFactory] Optional deterministic identity factory.
 */

function readFiniteNumber(value, name) {
	const number = Number(value);
	if (!Number.isFinite(number)) {
		throw new TypeError(`${name} must be a finite number`);
	}
	return number;
}

function readNonNegativeNumber(value, name) {
	const number = readFiniteNumber(value, name);
	if (number < 0) throw new RangeError(`${name} must be non-negative`);
	return number;
}

function readCount(value, name) {
	const number = readNonNegativeNumber(value, name);
	if (!Number.isSafeInteger(number)) {
		throw new RangeError(`${name} must be a safe whole-number count`);
	}
	return number;
}

function readPositiveCount(value, name) {
	const number = readCount(value, name);
	if (number < 1) throw new RangeError(`${name} must be at least 1`);
	return number;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function normalizedWeights(count, weights) {
	if (weights === undefined) return new Array(count).fill(1);
	if (!Array.isArray(weights) || weights.length !== count) {
		throw new RangeError("weights must contain one entry per formation");
	}
	const normalized = weights.map((weight, index) =>
		readNonNegativeNumber(weight, `weights[${index}]`),
	);
	if (normalized.some((weight) => weight > 0)) return normalized;
	return new Array(count).fill(1);
}

function seededTieOrder(count, rng) {
	const order = Array.from({ length: count }, (_, index) => index);
	if (rng === undefined) return order;
	if (typeof rng !== "function") throw new TypeError("rng must be a function");
	for (let index = count - 1; index > 0; index--) {
		const sample = readFiniteNumber(rng(), "rng result");
		if (sample < 0 || sample >= 1) {
			throw new RangeError(
				"rng must return values from 0 (inclusive) to 1 (exclusive)",
			);
		}
		const swapIndex = Math.floor(sample * (index + 1));
		[order[index], order[swapIndex]] = [order[swapIndex], order[index]];
	}
	return order;
}

/**
 * Hamilton apportionment for exact integer totals. Stable index order resolves
 * ties unless the caller supplies an explicit seeded RNG.
 */
function apportionCount(total, weights, rng) {
	if (weights.length === 0) {
		if (total === 0) return [];
		throw new RangeError(
			"cannot distribute a positive total across zero parts",
		);
	}
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
	const rawShares = weights.map((weight) => (total * weight) / weightTotal);
	const shares = rawShares.map((share) => Math.floor(share));
	let remainder = total - shares.reduce((sum, share) => sum + share, 0);
	if (remainder === 0) return shares;

	const tieOrder = seededTieOrder(weights.length, rng);
	const tieRank = new Map(tieOrder.map((index, rank) => [index, rank]));
	const allocationOrder = rawShares
		.map((share, index) => ({
			index,
			fraction: share - Math.floor(share),
		}))
		.sort(
			(left, right) =>
				right.fraction - left.fraction ||
				tieRank.get(left.index) - tieRank.get(right.index),
		);
	for (let index = 0; remainder > 0; index++, remainder--) {
		shares[allocationOrder[index % allocationOrder.length].index]++;
	}
	return shares;
}

/**
 * Choose a bounded simulation-formation budget without reducing the visible
 * granularity of small wars. With defaults, 250k personnel uses 250 formations
 * and one million personnel uses 400 formations.
 *
 * @param {number} personnel Total force personnel.
 * @param {FormationBudgetOptions} [options]
 * @returns {number}
 */
export function chooseFormationBudget(personnel, options = {}) {
	const total = readCount(personnel, "personnel");
	if (total === 0) return 0;
	const basePersonnel = readPositiveCount(
		options.basePersonnelPerFormation ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"basePersonnelPerFormation",
	);
	const preserveSmallWarsUpTo = readCount(
		options.preserveSmallWarsUpTo ??
			FORMATION_STRENGTH_DEFAULTS.PRESERVE_SMALL_WAR_PERSONNEL,
		"preserveSmallWarsUpTo",
	);
	const largePersonnel = readPositiveCount(
		options.largePersonnelPerFormation ??
			FORMATION_STRENGTH_DEFAULTS.LARGE_PERSONNEL_PER_FORMATION,
		"largePersonnelPerFormation",
	);
	const minFormations = readPositiveCount(
		options.minFormations ?? FORMATION_STRENGTH_DEFAULTS.MIN_FORMATIONS,
		"minFormations",
	);
	const maxFormations = readPositiveCount(
		options.maxFormations ?? FORMATION_STRENGTH_DEFAULTS.MAX_FORMATIONS,
		"maxFormations",
	);
	if (maxFormations < minFormations) {
		throw new RangeError("maxFormations must be at least minFormations");
	}

	const smallWarPersonnel = Math.min(total, preserveSmallWarsUpTo);
	const smallWarFormations = Math.ceil(smallWarPersonnel / basePersonnel);
	const scalablePersonnel = Math.max(0, total - preserveSmallWarsUpTo);
	const scalableFormations = Math.ceil(scalablePersonnel / largePersonnel);
	return clamp(
		smallWarFormations + scalableFormations,
		minFormations,
		maxFormations,
	);
}

/**
 * Distribute an exact personnel total across a fixed number of serializable
 * formation descriptors. The function never calls Math.random.
 *
 * @param {number} personnel Total whole personnel to allocate.
 * @param {number} formationCount Requested descriptor count.
 * @param {FormationDistributionOptions} [options]
 * @returns {Array<FormationStrengthDescriptor>}
 */
export function distributeFormationPersonnel(
	personnel,
	formationCount,
	options = {},
) {
	const total = readCount(personnel, "personnel");
	const count = readCount(formationCount, "formationCount");
	if (count === 0) {
		if (total > 0) {
			throw new RangeError(
				"formationCount must be positive when personnel is positive",
			);
		}
		return [];
	}
	const nominalPersonnel = readPositiveCount(
		options.nominalPersonnel ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"nominalPersonnel",
	);
	const weights = normalizedWeights(count, options.weights);
	const shares = apportionCount(total, weights, options.rng);
	const idPrefix = String(options.idPrefix || "formation");
	const template = options.template ? { ...options.template } : {};
	if (
		options.idFactory !== undefined &&
		typeof options.idFactory !== "function"
	) {
		throw new TypeError("idFactory must be a function");
	}
	return shares.map((share, index) => ({
		...template,
		id: options.idFactory
			? options.idFactory(index, share)
			: `${idPrefix}-${index + 1}`,
		index,
		personnel: share,
		nominalPersonnel,
		strengthMultiplier: share / nominalPersonnel,
	}));
}

/**
 * Resolve whole personnel from the explicit accounting field, then an explicit
 * multiplier, then legacy health. This makes migration from health-only units
 * possible without making health the long-term source of truth.
 *
 * @param {FormationAccounting} formation
 * @param {{nominalPersonnel?:number,baseHealth?:number}} [options]
 * @returns {number}
 */
export function getFormationPersonnel(formation, options = {}) {
	if (!formation || typeof formation !== "object") return 0;
	if (formation.personnel !== undefined) {
		return readCount(formation.personnel, "formation.personnel");
	}
	const nominalPersonnel = readPositiveCount(
		formation.nominalPersonnel ??
			options.nominalPersonnel ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"nominalPersonnel",
	);
	if (formation.strengthMultiplier !== undefined) {
		const multiplier = readNonNegativeNumber(
			formation.strengthMultiplier,
			"formation.strengthMultiplier",
		);
		return Math.round(nominalPersonnel * multiplier);
	}
	if (formation.health !== undefined) {
		const health = readNonNegativeNumber(formation.health, "formation.health");
		const baseHealth = readFiniteNumber(
			formation.baseHealth ??
				options.baseHealth ??
				FORMATION_STRENGTH_DEFAULTS.BASE_HEALTH,
			"baseHealth",
		);
		if (baseHealth <= 0) throw new RangeError("baseHealth must be positive");
		return Math.round((health / baseHealth) * nominalPersonnel);
	}
	return nominalPersonnel;
}

/**
 * Return combat/render strength in standard-formation equivalents.
 *
 * @param {FormationAccounting} formation
 * @param {{referencePersonnel?:number,nominalPersonnel?:number,baseHealth?:number}} [options]
 * @returns {number}
 */
export function getFormationStrengthMultiplier(formation, options = {}) {
	const referencePersonnel = readPositiveCount(
		options.referencePersonnel ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"referencePersonnel",
	);
	return getFormationPersonnel(formation, options) / referencePersonnel;
}

function isEquipmentRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEquipmentRecord(equipment, name) {
	const normalized = {};
	for (const key of Object.keys(equipment).sort()) {
		normalized[key] = readCount(equipment[key], `${name}.${key}`);
	}
	return normalized;
}

function mergeEquipment(formations, untypedEquipmentKey) {
	const hasRecord = formations.some((formation) =>
		isEquipmentRecord(formation?.equipment),
	);
	if (!hasRecord) {
		return formations.reduce(
			(sum, formation, index) =>
				sum +
				readCount(formation?.equipment ?? 0, `formations[${index}].equipment`),
			0,
		);
	}
	const totals = {};
	for (let index = 0; index < formations.length; index++) {
		const equipment = formations[index]?.equipment ?? 0;
		if (isEquipmentRecord(equipment)) {
			const record = normalizeEquipmentRecord(
				equipment,
				`formations[${index}].equipment`,
			);
			for (const [key, count] of Object.entries(record)) {
				totals[key] = (totals[key] || 0) + count;
			}
		} else {
			const count = readCount(equipment, `formations[${index}].equipment`);
			if (count > 0) {
				totals[untypedEquipmentKey] =
					(totals[untypedEquipmentKey] || 0) + count;
			}
		}
	}
	return Object.fromEntries(
		Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)),
	);
}

/**
 * Merge accounting totals without mutating any source formation. Numeric and
 * keyed equipment may be mixed; numeric equipment is then retained under the
 * configurable `untyped` key.
 *
 * @param {Array<FormationAccounting>} formations
 * @param {{id?:string|number,referencePersonnel?:number,untypedEquipmentKey?:string,nominalPersonnel?:number,baseHealth?:number}} [options]
 * @returns {FormationAccounting & {sourceIds:Array<string|number>}}
 */
export function mergeFormationAccounting(formations, options = {}) {
	if (!Array.isArray(formations)) {
		throw new TypeError("formations must be an array");
	}
	const personnel = formations.reduce(
		(sum, formation) => sum + getFormationPersonnel(formation, options),
		0,
	);
	const casualties = formations.reduce(
		(sum, formation, index) =>
			sum +
			readCount(formation?.casualties ?? 0, `formations[${index}].casualties`),
		0,
	);
	const equipment = mergeEquipment(
		formations,
		String(options.untypedEquipmentKey || "untyped"),
	);
	const referencePersonnel = readPositiveCount(
		options.referencePersonnel ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"referencePersonnel",
	);
	return {
		...(options.id === undefined ? {} : { id: options.id }),
		personnel,
		equipment,
		casualties,
		nominalPersonnel: referencePersonnel,
		strengthMultiplier: personnel / referencePersonnel,
		sourceIds: formations
			.map((formation) => formation?.id)
			.filter((id) => id !== undefined),
	};
}

function splitEquipment(equipment, weights, rng) {
	if (isEquipmentRecord(equipment)) {
		const normalized = normalizeEquipmentRecord(
			equipment,
			"formation.equipment",
		);
		const parts = weights.map(() => ({}));
		for (const key of Object.keys(normalized)) {
			const shares = apportionCount(normalized[key], weights, rng);
			for (let index = 0; index < shares.length; index++) {
				parts[index][key] = shares[index];
			}
		}
		return parts;
	}
	return apportionCount(
		readCount(equipment ?? 0, "formation.equipment"),
		weights,
		rng,
	);
}

/**
 * Split a formation into exact accounting parts. Every discrete total is
 * apportioned independently and re-merges to the original value.
 *
 * @param {FormationAccounting} formation
 * @param {number} partCount
 * @param {{weights?:Array<number>,rng?:()=>number,idPrefix?:string,referencePersonnel?:number,nominalPersonnel?:number,baseHealth?:number}} [options]
 * @returns {Array<FormationStrengthDescriptor>}
 */
export function splitFormationAccounting(formation, partCount, options = {}) {
	if (!formation || typeof formation !== "object") {
		throw new TypeError("formation must be an object");
	}
	const count = readPositiveCount(partCount, "partCount");
	const weights = normalizedWeights(count, options.weights);
	const personnel = apportionCount(
		getFormationPersonnel(formation, options),
		weights,
		options.rng,
	);
	const casualties = apportionCount(
		readCount(formation.casualties ?? 0, "formation.casualties"),
		weights,
		options.rng,
	);
	const equipment = splitEquipment(
		formation.equipment ?? 0,
		weights,
		options.rng,
	);
	const referencePersonnel = readPositiveCount(
		options.referencePersonnel ??
			FORMATION_STRENGTH_DEFAULTS.BASE_PERSONNEL_PER_FORMATION,
		"referencePersonnel",
	);
	const idPrefix = String(options.idPrefix || formation.id || "formation");
	return personnel.map((share, index) => ({
		id: `${idPrefix}:${index + 1}`,
		index,
		personnel: share,
		equipment: equipment[index],
		casualties: casualties[index],
		nominalPersonnel: referencePersonnel,
		strengthMultiplier: share / referencePersonnel,
		sourceId: formation.id ?? null,
	}));
}

function badgeTier(multiplier) {
	if (multiplier <= 0) return "empty";
	if (multiplier < 0.75) return "depleted";
	if (multiplier < 1.25) return "standard";
	if (multiplier < 3) return "reinforced";
	if (multiplier < 5) return "heavy";
	return "massed";
}

function formatMultiplier(multiplier, maximumFractionDigits) {
	const digits = clamp(Math.trunc(maximumFractionDigits), 0, 2);
	return multiplier
		.toFixed(digits)
		.replace(/\.0+$/, "")
		.replace(/(\.\d*?)0+$/, "$1");
}

/**
 * Return renderer-ready badge text and accessibility metadata without creating
 * DOM or canvas objects. Standard formations remain hidden by default.
 *
 * @param {FormationAccounting} formation
 * @param {{referencePersonnel?:number,nominalPersonnel?:number,baseHealth?:number,showStandard?:boolean,visibilityThreshold?:number,maximumFractionDigits?:number}} [options]
 * @returns {{text:string,visible:boolean,tier:"empty"|"depleted"|"standard"|"reinforced"|"heavy"|"massed",multiplier:number,personnel:number,ariaLabel:string}}
 */
export function getFormationStrengthBadge(formation, options = {}) {
	const personnel = getFormationPersonnel(formation, options);
	const multiplier = getFormationStrengthMultiplier(formation, options);
	const visibilityThreshold = readNonNegativeNumber(
		options.visibilityThreshold ?? 0.15,
		"visibilityThreshold",
	);
	const visible =
		options.showStandard === true ||
		Math.abs(multiplier - 1) >= visibilityThreshold;
	const text = visible
		? `${formatMultiplier(multiplier, options.maximumFractionDigits ?? 1)}×`
		: "";
	return {
		text,
		visible,
		tier: badgeTier(multiplier),
		multiplier,
		personnel,
		ariaLabel: `${personnel} personnel (${formatMultiplier(multiplier, 2)} times standard strength)`,
	};
}

/**
 * Convenience string-only badge formatter for canvas renderers.
 *
 * @param {FormationAccounting} formation
 * @param {Parameters<typeof getFormationStrengthBadge>[1]} [options]
 * @returns {string}
 */
export function formatFormationStrengthBadge(formation, options = {}) {
	return getFormationStrengthBadge(formation, options).text;
}
