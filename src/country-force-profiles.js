import { COUNTRY_FORCE_DATA } from "./country-force-data.js";

export const FORCE_EQUIPMENT_CATEGORIES = Object.freeze([
	"tank",
	"artillery",
	"airDefense",
	"combatAircraft",
	"aircraftTotal",
	"uavSystems",
	"armouredVehicles",
	"missiles",
	"strikeDrones",
]);

// biome-ignore lint/suspicious/noControlCharactersInRegex: Strip control characters from imported display metadata.
const UNSAFE_TEXT = /[\u0000-\u001f<>]/g;
const text = (value, limit = 300) =>
	typeof value === "string"
		? value.replace(UNSAFE_TEXT, "").slice(0, limit)
		: "";
const finite = (value) =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value >= 0 &&
	value <= 1e16;
const id = (value) =>
	Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
const normalizedName = (value) =>
	text(value)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
const iso2 = new Map(
	Object.entries(COUNTRY_FORCE_DATA.countries).map(([code, country]) => [
		country.iso2,
		code,
	]),
);
const names = new Map(
	Object.entries(COUNTRY_FORCE_DATA.countries).map(([code, country]) => [
		normalizedName(country.name),
		code,
	]),
);
for (const [name, code] of Object.entries({
	Russia: "RUS",
	"United States": "USA",
	"United States of America": "USA",
	"People's Republic of China": "CHN",
	China: "CHN",
	"South Korea": "KOR",
	"North Korea": "PRK",
	Iran: "IRN",
	Syria: "SYR",
	Egypt: "EGY",
	Vietnam: "VNM",
	Laos: "LAO",
	Venezuela: "VEN",
	Turkey: "TUR",
	Türkiye: "TUR",
	Slovakia: "SVK",
	"Czech Republic": "CZE",
	"Democratic Republic of the Congo": "COD",
	"Republic of the Congo": "COG",
	"Ivory Coast": "CIV",
	Palestine: "PSE",
	Kyrgyzstan: "KGZ",
	Taiwan: "TWN",
	"Falkland Islands": "FLK",
	Gibraltar: "GIB",
}))
	names.set(normalizedName(name), code);
iso2.set("TW", "TWN");
iso2.set("FK", "FLK");

/** Resolve scenario identity without depending on numeric IDs or translated labels. */
export function normalizeCountryIso3(country) {
	if (!country || typeof country !== "object") return null;
	for (const value of [country.iso3, country.iso2, country.countryCode]) {
		if (typeof value !== "string") continue;
		const code = value.trim().toUpperCase();
		if (iso2.has(code)) return iso2.get(code);
		if (COUNTRY_FORCE_DATA.countries[code] || ["TWN", "FLK"].includes(code))
			return code;
	}
	const flagCode =
		typeof country.flagUrl === "string"
			? country.flagUrl
					.match(
						/^https:\/\/flagcdn\.com\/(?:w\d+\/)?([a-z]{2})\.(?:png|svg)$/i,
					)?.[1]
					?.toUpperCase()
			: null;
	return iso2.get(flagCode) || names.get(normalizedName(country.name)) || null;
}

export function normalizeScenarioDate(value) {
	if (value instanceof Date)
		return Number.isFinite(value.getTime())
			? value.toISOString().slice(0, 10)
			: null;
	if (typeof value === "object" && value)
		value = `${value.year}-${String(value.month || 1).padStart(2, "0")}-${String(value.day || 1).padStart(2, "0")}`;
	if (typeof value === "number" && Number.isInteger(value))
		value = `${value}-12-31`;
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isFinite(date.getTime()) &&
		date.toISOString().slice(0, 10) === value
		? value
		: null;
}

function sourceUrl(value) {
	if (typeof value !== "string" || value.length > 1000) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}

function normalizeObservation(value) {
	if (!value || typeof value !== "object" || !finite(value.value)) return null;
	const asOf = normalizeScenarioDate(value.asOf);
	const url = sourceUrl(value.sourceUrl);
	if (!asOf || !url || !text(value.license) || !text(value.definition))
		return null;
	return {
		value: value.value,
		asOf,
		sourceDate: normalizeScenarioDate(value.sourceDate),
		sourceUrl: url,
		license: text(value.license, 80),
		confidence: ["official", "estimate", "scenario"].includes(value.confidence)
			? value.confidence
			: "scenario",
		definition: text(value.definition, 600),
		unit: text(value.unit, 60) || "items",
		status: text(value.status, 80) || "reported_total",
	};
}

/** Strip imported metadata to bounded, JSON-safe factual and scenario fields. */
export function normalizeForceProfile(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const equipment = {};
	for (const category of FORCE_EQUIPMENT_CATEGORIES)
		equipment[category] = normalizeObservation(value.equipment?.[category]);
	const gameAssumptions = {
		origin: "scenario_balance",
		personnel: null,
		equipment: {},
	};
	if (finite(value.gameAssumptions?.personnel))
		gameAssumptions.personnel = Math.min(1e9, value.gameAssumptions.personnel);
	for (const key of ["treasury", "baseIncome", "civilianPool"]) {
		const amount = value.gameAssumptions?.[key];
		gameAssumptions[key] = finite(amount) ? Math.min(1e12, amount) : null;
	}
	for (const category of [
		"armor",
		"artillery",
		"airDefense",
		"aircraft",
		"reconDrone",
		"strikeDrone",
		"missile",
	]) {
		const count = value.gameAssumptions?.equipment?.[category];
		gameAssumptions.equipment[category] = finite(count)
			? Math.min(1e9, count)
			: null;
	}
	return {
		version: 1,
		iso3: normalizeCountryIso3({ iso3: value.iso3 }),
		origin:
			value.origin === "public_aggregate" ? "public_aggregate" : "scenario",
		personnel: normalizeObservation(value.personnel),
		equipment,
		economy: {
			population: normalizeObservation(value.economy?.population),
			gdp: normalizeObservation(value.economy?.gdp),
		},
		gameAssumptions,
	};
}

const indicators = {
	personnel: [
		"MS.MIL.TOTL.P1",
		"people",
		"Active military and qualifying active paramilitary personnel; reserves excluded. Historical IISS estimate published through the World Bank; not present-day readiness.",
	],
	population: [
		"SP.POP.TOTL",
		"people",
		"Annual resident population estimate; a historical demographic aggregate, not recruitable manpower.",
	],
	gdp: [
		"NY.GDP.MKTP.CD",
		"current_USD",
		"Annual gross domestic product in current US dollars; not a military budget or game treasury.",
	],
};

function bankObservation(code, key, cutoff) {
	const row = COUNTRY_FORCE_DATA.countries[code]?.[key]?.find(
		([year]) => `${year}-12-31` <= cutoff,
	);
	if (!row) return null;
	const [indicator, unit, definition] = indicators[key];
	return {
		value: row[1],
		asOf: `${row[0]}-12-31`,
		sourceDate: COUNTRY_FORCE_DATA.sourceDates[key],
		sourceUrl: `https://data.worldbank.org/indicator/${indicator}?locations=${code}`,
		license: "CC-BY-4.0",
		confidence: "estimate",
		definition,
		unit,
		status:
			key === "personnel" ? "active_including_paramilitary" : "annual_total",
	};
}

const ukEquipment = {
	artillery: [
		219,
		"UK MOD artillery vehicles total; equipment holdings do not establish availability or combat readiness.",
	],
	aircraftTotal: [
		507,
		"All UK MOD fixed-wing platforms including training and support aircraft; not a combat-aircraft count. In-service figures may include stored aircraft.",
	],
	uavSystems: [
		189,
		"UK MOD Certified or S2 uncrewed aircraft systems only; excludes smaller unreported drones and is not a stock of expendable strike drones.",
	],
	armouredVehicles: [
		1024,
		"UK MOD armoured fighting vehicles total; this category includes several vehicle types and is not a tank count.",
	],
};

/** Runtime uses packaged observations only; no API request occurs during play. */
export function getCountryForceProfile(country, scenarioDate) {
	const cutoff = normalizeScenarioDate(scenarioDate);
	const code = normalizeCountryIso3(country);
	const profile =
		normalizeForceProfile(country?.forceProfile) ||
		normalizeForceProfile({ iso3: code, origin: "public_aggregate" });
	if (!country?.forceProfile && cutoff && code) {
		profile.personnel = bankObservation(code, "personnel", cutoff);
		profile.economy = {
			population: bankObservation(code, "population", cutoff),
			gdp: bankObservation(code, "gdp", cutoff),
		};
		if (code === "GBR" && cutoff >= "2026-04-01") {
			for (const [category, [value, definition]] of Object.entries(ukEquipment))
				profile.equipment[category] = {
					value,
					definition,
					asOf: "2026-04-01",
					sourceDate: "2026-08-20",
					sourceUrl:
						"https://www.gov.uk/government/statistics/uk-armed-forces-equipment-and-formations-2026/uk-armed-forces-equipment-and-formations-2026",
					license: "OGL-3.0",
					confidence: "official",
					unit: "platforms",
					status: "reported_holdings",
				};
		}
	}
	const eligible = (observation) =>
		cutoff && observation?.asOf <= cutoff ? observation : null;
	profile.personnel = eligible(profile.personnel);
	for (const key of FORCE_EQUIPMENT_CATEGORIES)
		profile.equipment[key] = eligible(profile.equipment[key]);
	for (const key of ["population", "gdp"])
		profile.economy[key] = eligible(profile.economy[key]);
	return profile;
}

export function getCountryForceProfiles(countries, scenarioDate) {
	return Object.fromEntries(
		(countries || [])
			.filter((country) => id(country?.id))
			.map((country) => [
				country.id,
				getCountryForceProfile(country, scenarioDate),
			]),
	);
}

const legalRelationships = {
	GRL: [
		"self_governing_realm",
		"DNK",
		"2009-06-21",
		"https://english.stm.dk/the-prime-ministers-office/the-unity-of-the-realm/greenland/",
		"Self-governing part of the Danish Realm; not game vassalage or a claim of military occupation.",
	],
	FRO: [
		"self_governing_realm",
		"DNK",
		"2005-07-29",
		"https://english.stm.dk/the-prime-ministers-office/the-unity-of-the-realm/faroe-islands/",
		"Self-governing community within the Danish Realm under the Home Rule and Takeover Acts; not game vassalage.",
	],
	FLK: [
		"overseas_territory",
		"GBR",
		"2025-04-28",
		"https://www.gov.uk/government/publications/the-central-government-s-concept-of-operations/the-amber-book-appendices-html",
		"UK Overseas Territory in the cited UK administrative list. This label describes administration, not resolution of sovereignty disputes.",
	],
	GIB: [
		"overseas_territory",
		"GBR",
		"2025-04-28",
		"https://www.gov.uk/government/publications/the-central-government-s-concept-of-operations/the-amber-book-appendices-html",
		"UK Overseas Territory in the cited UK administrative list; separate from game military control and alliances.",
	],
	BMU: [
		"overseas_territory",
		"GBR",
		"2025-04-28",
		"https://www.gov.uk/government/publications/the-central-government-s-concept-of-operations/the-amber-book-appendices-html",
		"UK Overseas Territory with its own government; separate from game vassalage and military control.",
	],
};

export function normalizeCountryDependency(value) {
	if (
		!value ||
		!["self_governing_realm", "overseas_territory", "game_vassal"].includes(
			value.type,
		)
	)
		return null;
	return {
		type: value.type,
		controllerIso3: normalizeCountryIso3({ iso3: value.controllerIso3 }),
		controllerId: id(value.controllerId),
		asOf: normalizeScenarioDate(value.asOf),
		sourceDate: normalizeScenarioDate(value.sourceDate),
		checkedAt: normalizeScenarioDate(value.checkedAt),
		sourceUrl: sourceUrl(value.sourceUrl),
		confidence: value.confidence === "official" ? "official" : "scenario",
		definition: text(value.definition, 600),
	};
}

/** Constitutional administration and in-game diplomacy are deliberately independent. */
export function resolveCountryRelationship(
	country,
	countries = [],
	scenarioDate,
) {
	const cutoff = normalizeScenarioDate(scenarioDate);
	const row = legalRelationships[normalizeCountryIso3(country)];
	let legal = normalizeCountryDependency(country?.dependency);
	if (!legal && row)
		legal = {
			type: row[0],
			controllerIso3: row[1],
			controllerId: null,
			asOf: row[2],
			sourceDate: row[0] === "overseas_territory" ? "2025-04-28" : null,
			checkedAt: "2026-10-28",
			sourceUrl: row[3],
			confidence: "official",
			definition: row[4],
		};
	if (
		legal?.type === "game_vassal" ||
		!cutoff ||
		!legal?.asOf ||
		legal.asOf > cutoff
	)
		legal = null;
	if (legal)
		legal.controllerId = id(
			countries.find(
				(candidate) => normalizeCountryIso3(candidate) === legal.controllerIso3,
			)?.id,
		);
	const overlord = id(country?.overlordId);
	const game =
		overlord && overlord !== country?.id
			? {
					type: "game_vassal",
					controllerIso3: normalizeCountryIso3(
						countries.find((candidate) => candidate?.id === overlord),
					),
					controllerId: overlord,
					asOf: null,
					sourceDate: null,
					sourceUrl: null,
					confidence: "scenario",
					definition:
						"Relationship set by scenario data or game diplomacy; not an independently verified real-world classification.",
				}
			: null;
	return { legal, game };
}
