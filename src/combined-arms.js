export const COMBINED_ARMS_CONFIG = Object.freeze({
	ARMOR_AVAILABLE_YEAR: 1916,
	AIR_AVAILABLE_YEAR: 1914,
	EARLY_ERA_FACTOR: 0.25,
	WARTIME_ERA_FACTOR: 0.75,
	MODERN_ERA_FACTOR: 1,
	ARMOR_PER_BASIS: 8,
	FIGHTERS_PER_BASIS: 1.5,
	STRIKE_AIRCRAFT_PER_BASIS: 1,
	ARMOR_GROUP_SIZE: 100,
	AIR_WING_SIZE: 24,
	MAX_ARMOR_GROUPS_PER_COUNTRY: 12,
	MAX_WINGS_PER_ROLE_PER_COUNTRY: 8,
	MAX_ACTIVE_AIR_WINGS: 256,
	MAX_AIRFIELDS_PER_COUNTRY: 8,
	MIN_AIRFIELD_SEPARATION_KM: 250,
	ARMOR_CREW_PER_VEHICLE: 2,
	AIRCREW_PER_AIRCRAFT: 1,
	ARMOR_PAYROLL_PER_100: 3,
	FIGHTER_OPERATIONS_PER_100: 1,
	STRIKE_OPERATIONS_PER_100: 1.5,
	REPLACEMENT_RATE: 0.01,
	ARMOR_REPLACEMENT_COST: 0.05,
	FIGHTER_REPLACEMENT_COST: 0.15,
	STRIKE_REPLACEMENT_COST: 0.2,
	ARMOR_SUPPORT_RADIUS_DEG: 0.6,
	ARMOR_UNSUPPORTED_INFLUENCE: 0.25,
	ARMOR_SUPPORTED_ATTACK_MULT: 1.15,
	FIGHTER_RANGE_KM: 800,
	STRIKE_RANGE_KM: 1200,
	FERRY_RANGE_MULT: 2,
	AIR_TICK_INTERVAL: 6,
	AIR_MISSION_INTERVAL: 120,
	FIGHTER_ENDURANCE_TICKS: 600,
	FIGHTER_REARM_TICKS: 180,
	STRIKE_COOLDOWN_TICKS: 600,
	STRIKE_REARM_TICKS: 300,
	AIRFIELD_MAX_HEALTH: 100,
	AIRFIELD_CAPTURE_REPAIR_CYCLES: 2,
	AIRFIELD_REPAIR_PER_CYCLE: 25,
	AIRFIELD_REPAIR_COST: 2,
});

const MAX_ARMOR_CAPACITY = 50000;
const MAX_AIRCRAFT_CAPACITY = 10000;

export function clampCombinedArms(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function finiteNonNegative(value, fallback = 0) {
	return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function hasExplicitNumber(object, key) {
	return (
		Object.hasOwn(object || {}, key) &&
		object[key] !== "" &&
		object[key] !== null &&
		Number.isFinite(Number(object[key]))
	);
}

export function countryMayDeployStrategicEquipment(country) {
	return country?.isRebel !== true;
}

export function airInfrastructureIsAvailable({
	airPowerEnabled = true,
	timeEnabled = false,
	startDate = null,
	aircraftCapacity = 0,
} = {}) {
	if (!airPowerEnabled) return false;
	if (!timeEnabled || aircraftCapacity > 0) return true;
	return Number(startDate?.year) >= COMBINED_ARMS_CONFIG.AIR_AVAILABLE_YEAR;
}

export function getCombinedArmsEraFactor(year, minimumYear) {
	if (!Number.isFinite(year)) return COMBINED_ARMS_CONFIG.MODERN_ERA_FACTOR;
	if (year < minimumYear) return 0;
	if (year < 1939) return COMBINED_ARMS_CONFIG.EARLY_ERA_FACTOR;
	if (year <= 1945) return COMBINED_ARMS_CONFIG.WARTIME_ERA_FACTOR;
	return COMBINED_ARMS_CONFIG.MODERN_ERA_FACTOR;
}

export function getQualityMultiplier(quality = 50) {
	const normalized = clampCombinedArms(Number(quality) || 0, 0, 100);
	return 0.75 + normalized / 200;
}

export function resolveEquipmentProfile({
	metadata = {},
	expectedArmyUnits = 0,
	economicStrength = 0,
	timeEnabled = false,
	startDate = null,
	armorEnabled = true,
	airPowerEnabled = true,
} = {}) {
	const army = Math.max(0, finiteNonNegative(expectedArmyUnits));
	const economy = Math.max(0, finiteNonNegative(economicStrength, army));
	const basis = Math.sqrt(army * economy);
	const year = timeEnabled ? Number(startDate?.year) : Number.NaN;
	const armorEraFactor = getCombinedArmsEraFactor(
		year,
		COMBINED_ARMS_CONFIG.ARMOR_AVAILABLE_YEAR,
	);
	const airEraFactor = getCombinedArmsEraFactor(
		year,
		COMBINED_ARMS_CONFIG.AIR_AVAILABLE_YEAR,
	);

	const explicitArmor = hasExplicitNumber(metadata, "armoredVehicles");
	const explicitFighters = hasExplicitNumber(metadata, "fighters");
	const explicitStrike = hasExplicitNumber(metadata, "strikeAircraft");
	const fallbackArmor = Math.round(
		basis * COMBINED_ARMS_CONFIG.ARMOR_PER_BASIS * armorEraFactor,
	);
	const fallbackFighters = Math.round(
		basis * COMBINED_ARMS_CONFIG.FIGHTERS_PER_BASIS * airEraFactor,
	);
	const fallbackStrike = Math.round(
		basis * COMBINED_ARMS_CONFIG.STRIKE_AIRCRAFT_PER_BASIS * airEraFactor,
	);

	const armoredVehicles = armorEnabled
		? clampCombinedArms(
				explicitArmor
					? Math.round(Number(metadata.armoredVehicles))
					: fallbackArmor,
				0,
				MAX_ARMOR_CAPACITY,
			)
		: 0;
	const fighters = airPowerEnabled
		? clampCombinedArms(
				explicitFighters
					? Math.round(Number(metadata.fighters))
					: fallbackFighters,
				0,
				MAX_AIRCRAFT_CAPACITY,
			)
		: 0;
	const strikeAircraft = airPowerEnabled
		? clampCombinedArms(
				explicitStrike
					? Math.round(Number(metadata.strikeAircraft))
					: fallbackStrike,
				0,
				MAX_AIRCRAFT_CAPACITY,
			)
		: 0;

	return {
		armoredVehicles,
		fighters,
		strikeAircraft,
		armorQuality: clampCombinedArms(
			hasExplicitNumber(metadata, "armorQuality")
				? Number(metadata.armorQuality)
				: 50,
			0,
			100,
		),
		airQuality: clampCombinedArms(
			hasExplicitNumber(metadata, "airQuality")
				? Number(metadata.airQuality)
				: 50,
			0,
			100,
		),
		basis,
		explicit: {
			armor: explicitArmor,
			fighters: explicitFighters,
			strike: explicitStrike,
		},
	};
}

export function groupEquipment(total, approximateSize, maxGroups) {
	const equipment = Math.max(0, Math.round(Number(total) || 0));
	if (equipment === 0) return [];
	const groupCount = Math.max(
		1,
		Math.min(
			Math.max(1, Math.floor(maxGroups || 1)),
			Math.ceil(equipment / Math.max(1, approximateSize || 1)),
		),
	);
	const base = Math.floor(equipment / groupCount);
	let remainder = equipment % groupCount;
	const groups = [];
	for (let index = 0; index < groupCount; index++) {
		groups.push(base + (remainder-- > 0 ? 1 : 0));
	}
	return groups;
}

export function allocateAirWingMarkers(
	entries,
	globalCap = COMBINED_ARMS_CONFIG.MAX_ACTIVE_AIR_WINGS,
) {
	const normalized = Array.from(entries || [])
		.map((entry) => ({
			countryId: Number(entry.countryId),
			role: entry.role === "STRIKE" ? "STRIKE" : "FIGHTER",
			count: Math.max(0, Math.round(Number(entry.count) || 0)),
		}))
		.filter((entry) => entry.countryId > 0 && entry.count > 0)
		.map((entry) => ({
			...entry,
			desired: Math.min(
				COMBINED_ARMS_CONFIG.MAX_WINGS_PER_ROLE_PER_COUNTRY,
				Math.ceil(entry.count / COMBINED_ARMS_CONFIG.AIR_WING_SIZE),
			),
			allocated: 0,
		}));
	let remaining = Math.max(0, Math.floor(globalCap || 0));
	const priority = [...normalized].sort(
		(a, b) =>
			b.count - a.count ||
			a.countryId - b.countryId ||
			a.role.localeCompare(b.role),
	);
	for (const entry of priority) {
		if (remaining <= 0) break;
		entry.allocated = 1;
		remaining--;
	}
	while (remaining > 0) {
		let best = null;
		for (const entry of normalized) {
			if (entry.allocated >= entry.desired) continue;
			const score = entry.count / (entry.allocated + 1);
			if (
				!best ||
				score > best.score ||
				(score === best.score && entry.countryId < best.entry.countryId) ||
				(score === best.score &&
					entry.countryId === best.entry.countryId &&
					entry.role < best.entry.role)
			) {
				best = { entry, score };
			}
		}
		if (!best) break;
		best.entry.allocated++;
		remaining--;
	}

	const markers = [];
	const reserves = [];
	for (const entry of normalized) {
		const desiredGroups = groupEquipment(
			entry.count,
			COMBINED_ARMS_CONFIG.AIR_WING_SIZE,
			COMBINED_ARMS_CONFIG.MAX_WINGS_PER_ROLE_PER_COUNTRY,
		);
		const deployedGroups = desiredGroups.slice(0, entry.allocated);
		for (const equipment of deployedGroups) {
			markers.push({
				countryId: entry.countryId,
				role: entry.role,
				equipment,
			});
		}
		reserves.push({
			...entry,
			reserve: desiredGroups
				.slice(entry.allocated)
				.reduce((sum, equipment) => sum + equipment, 0),
		});
	}
	return { markers, reserves };
}

export function computeArmorPayroll(vehicleCount) {
	return (
		(finiteNonNegative(vehicleCount) / 100) *
		COMBINED_ARMS_CONFIG.ARMOR_PAYROLL_PER_100
	);
}

export function computeAirOperationsCost({ fighters = 0, strikeAircraft = 0 }) {
	return (
		(finiteNonNegative(fighters) / 100) *
			COMBINED_ARMS_CONFIG.FIGHTER_OPERATIONS_PER_100 +
		(finiteNonNegative(strikeAircraft) / 100) *
			COMBINED_ARMS_CONFIG.STRIKE_OPERATIONS_PER_100
	);
}

export function isCombinedArmsFullyFunded(economyState) {
	return (
		(economyState?.payrollCoverage ?? 0) >= 0.999 &&
		(economyState?.occupationCoverage ?? 0) >= 0.999 &&
		(economyState?.arrearsCycles ?? 0) < 1
	);
}

export function computeReplacementPurchase({
	capacity = 0,
	current = 0,
	unitCost = 0,
	budget = 0,
	rate = COMBINED_ARMS_CONFIG.REPLACEMENT_RATE,
} = {}) {
	const safeCapacity = Math.max(0, Math.floor(capacity || 0));
	const missing = Math.max(
		0,
		safeCapacity - Math.max(0, Math.floor(current || 0)),
	);
	const cost = Math.max(0, Number(unitCost) || 0);
	if (missing === 0 || cost <= 0 || budget < cost) {
		return { purchased: 0, spent: 0 };
	}
	const cycleLimit = Math.min(
		missing,
		Math.floor(safeCapacity * Math.max(0, rate || 0)),
	);
	const affordable = Math.floor(Math.max(0, budget || 0) / cost);
	const purchased = Math.min(cycleLimit, affordable);
	return { purchased, spent: purchased * cost };
}

export function getArmorCombatMultiplier(
	attackerKind,
	targetKind,
	{ urban = false, mountain = false, supported = false } = {},
) {
	const attacker = attackerKind === "armor" ? "armor" : "army";
	const target = targetKind === "armor" ? "armor" : "army";
	let multiplier = 1;
	if (attacker === "armor" && target === "army") {
		multiplier = mountain ? 0.65 : urban ? 1 : 2;
	} else if (attacker === "army" && target === "armor") {
		multiplier = mountain ? 0.8 : urban ? 0.7 : 0.35;
	} else if (attacker === "armor" && target === "armor") {
		multiplier = mountain ? 0.6 : urban ? 0.8 : 1;
	}
	if (attacker === "armor" && supported) {
		multiplier *= COMBINED_ARMS_CONFIG.ARMOR_SUPPORTED_ATTACK_MULT;
	}
	return multiplier;
}

export function getArmorSpeedMultiplier({
	urban = false,
	mountain = false,
	atSea = false,
} = {}) {
	if (atSea) return 0.75;
	if (mountain) return 0.45;
	if (urban) return 0.75;
	return 1.6;
}

export function getArmorInfluenceMultiplier(supported) {
	return supported ? 1 : COMBINED_ARMS_CONFIG.ARMOR_UNSUPPORTED_INFLUENCE;
}

export function unitCountsForCapitulation(unit) {
	if (!unit || unit.health <= 0) return false;
	if (unit.kind && unit.kind !== "army" && unit.kind !== "armor") return false;
	const kind = unit.kind === "armor" ? "armor" : "army";
	return kind === "army" || (unit.equipment || 0) > 0;
}

export function unitCountsAsOccupationGarrison(unit) {
	return (
		!!unit &&
		unit.health > 0 &&
		(unit.kind === undefined || unit.kind === "army")
	);
}

export function computeEquipmentPersonnel({
	armoredVehicles = 0,
	fighters = 0,
	strikeAircraft = 0,
} = {}) {
	return (
		Math.max(0, armoredVehicles || 0) *
			COMBINED_ARMS_CONFIG.ARMOR_CREW_PER_VEHICLE +
		(Math.max(0, fighters || 0) + Math.max(0, strikeAircraft || 0)) *
			COMBINED_ARMS_CONFIG.AIRCREW_PER_AIRCRAFT
	);
}

export function haversineKm(a, b) {
	if (!a || !b) return Number.POSITIVE_INFINITY;
	const toRadians = Math.PI / 180;
	const lat1 = Number(a.lat) * toRadians;
	const lat2 = Number(b.lat) * toRadians;
	const dLat = (Number(b.lat) - Number(a.lat)) * toRadians;
	let dLng = Number(b.lng) - Number(a.lng);
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;
	dLng *= toRadians;
	const sinLat = Math.sin(dLat / 2);
	const sinLng = Math.sin(dLng / 2);
	const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
	return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function selectAirfieldSites(
	cities,
	centroidFallback = null,
	maxFields = COMBINED_ARMS_CONFIG.MAX_AIRFIELDS_PER_COUNTRY,
) {
	const candidates = Array.from(cities || [])
		.filter((city) => Number.isFinite(city.lat) && Number.isFinite(city.lng))
		.sort(
			(a, b) =>
				Number(!!b.isCapital) - Number(!!a.isCapital) ||
				(Number(b.pop) || 0) - (Number(a.pop) || 0) ||
				String(a.name || "").localeCompare(String(b.name || "")),
		);
	const selected = [];
	for (const city of candidates) {
		if (selected.length >= Math.max(1, maxFields || 1)) break;
		if (
			selected.length > 0 &&
			selected.some(
				(existing) =>
					haversineKm(existing, city) <
					COMBINED_ARMS_CONFIG.MIN_AIRFIELD_SEPARATION_KM,
			)
		) {
			continue;
		}
		selected.push({ ...city, isCapital: !!city.isCapital });
	}
	if (selected.length === 0 && centroidFallback) {
		selected.push({
			...centroidFallback,
			name: centroidFallback.name || "Field Airbase",
			isCapital: false,
		});
	}
	return selected;
}

export function getAirfieldCapacity(field) {
	if (!field || field.health <= 0 || field.disabled) return 0;
	if (field.health <= 50) return 1;
	return field.isCapital ? 3 : 2;
}

export function getAlliedAirfieldCapacity(field) {
	return Math.floor(getAirfieldCapacity(field) / 2);
}

export function captureAirfield(field, { controllerId, sideIndex }) {
	return {
		...field,
		controllerId,
		sideIndex,
		health: 0,
		disabled: true,
		captureRepairCycles: 0,
	};
}

export function advanceAirfieldRepair(
	field,
	{ fullyFunded = false, budget = 0 } = {},
) {
	const next = { ...field };
	if (!fullyFunded || budget < COMBINED_ARMS_CONFIG.AIRFIELD_REPAIR_COST) {
		return { field: next, spent: 0 };
	}
	if (
		next.captureRepairCycles <
		COMBINED_ARMS_CONFIG.AIRFIELD_CAPTURE_REPAIR_CYCLES
	) {
		next.captureRepairCycles = (next.captureRepairCycles || 0) + 1;
		if (
			next.captureRepairCycles >=
			COMBINED_ARMS_CONFIG.AIRFIELD_CAPTURE_REPAIR_CYCLES
		) {
			next.health = 50;
			next.disabled = false;
		}
		return {
			field: next,
			spent: COMBINED_ARMS_CONFIG.AIRFIELD_REPAIR_COST,
		};
	}
	if (next.health >= COMBINED_ARMS_CONFIG.AIRFIELD_MAX_HEALTH) {
		return { field: next, spent: 0 };
	}
	next.health = Math.min(
		COMBINED_ARMS_CONFIG.AIRFIELD_MAX_HEALTH,
		(next.health || 0) + COMBINED_ARMS_CONFIG.AIRFIELD_REPAIR_PER_CYCLE,
	);
	next.disabled = false;
	return {
		field: next,
		spent: COMBINED_ARMS_CONFIG.AIRFIELD_REPAIR_COST,
	};
}

export function getAircraftCommandPolicy(commandBand) {
	if (commandBand === "PAID") {
		return { fighters: "PATROL", strikes: true };
	}
	if (commandBand === "STRAINED") {
		return { fighters: "HOME_DEFENSE", strikes: false };
	}
	return { fighters: "GROUNDED", strikes: false };
}

export function getStrikeTargetScore(candidate) {
	if (!candidate) return -Infinity;
	if (candidate.type === "ARMOR") return 300 + (candidate.equipment || 0);
	if (candidate.type === "AIRFIELD") {
		return candidate.health > 0 ? 200 + candidate.health : -Infinity;
	}
	if (candidate.type === "ARMY") return 100 + (candidate.clusterSize || 1) * 5;
	return -Infinity;
}

export function selectStrikeTarget(
	source,
	candidates,
	{ rangeKm = COMBINED_ARMS_CONFIG.STRIKE_RANGE_KM, isHostile } = {},
) {
	let best = null;
	for (const candidate of candidates || []) {
		if (isHostile && !isHostile(candidate.sideIndex)) continue;
		const distance = haversineKm(source, candidate);
		if (distance > rangeKm) continue;
		const score = getStrikeTargetScore(candidate) - distance * 0.01;
		if (
			!best ||
			score > best.score ||
			(score === best.score && String(candidate.id) < String(best.target.id))
		) {
			best = { target: candidate, score, distance };
		}
	}
	return best;
}
