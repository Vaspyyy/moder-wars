export const CONFIG = {
	GEOJSON_BASE: "assets/geodata/",
	GRID_RES: 0.15,
	INFLUENCE_RATE: 0.18,
	INFLUENCE_RADIUS: 0.4,
	UNIT_SPAWN_COUNT: 180, // Base count (5x finer granularity)
	MAX_UNITS_PER_SIDE: 2400,
	UNIT_DENSITY_FACTOR: 0.066, // 3x density for 5x more units at 1/5th size
	HOI4_COLORS: {
		Germany: "#6e6e6e",
		Russia: "#911c1c",
		"Soviet Union": "#911c1c",
		"United Kingdom": "#bd9c61",
		"United States of America": "#3a5c32",
		"United States": "#3a5c32",
		France: "#304f9e",
		Italy: "#4d6e35",
		Japan: "#d4d4d4",
		China: "#ded433",
		Poland: "#f59595",
		Turkey: "#8f1d1d",
		Brazil: "#3da33d",
		Canada: "#e31e24",
		Australia: "#2e41a3",
		India: "#e39d3b",
		Spain: "#d1bc4d",
		Mexico: "#d3a550",
		Argentina: "#75aadb",
		Chile: "#d43b3b",
		Egypt: "#e3d17d",
		"South Africa": "#de8664",
		Israel: "#2e86de",
		Mongolia: "#943821",
		Iran: "#1a8227",
		Iraq: "#7a6021",
		"Saudi Arabia": "#2e7a3e",
		Sweden: "#3a7bad",
		Norway: "#4e5b8a",
		Finland: "#7798ab",
		Romania: "#b59b31",
		Hungary: "#396b41",
		Yugoslavia: "#bd8c42",
		Greece: "#4a7ea3",
		"South Korea": "#2e86de",
		"North Korea": "#ff4757",
		Vietnam: "#cc3333",
		Ukraine: "#ffdd00",
	},
	UNIT_SPEED: 0.003,
	UNIT_NAVAL_SPEED: 0.025, // Significantly faster for swift naval invasions
	UNIT_TO_SOLDIER_RATIO: 1000, // 1K soldiers per unit flag (finer control)
	UNIT_HEALTH: 100,
	// Alpenjäger tuning: small, subtle advantages
	ALPEN_HEALTH_MULT: 1.25, // +25% health
	ALPEN_MTN_SPEED_MULT: 1.4, // faster in mountains
	ALPEN_COMBAT_MULT: 1.12, // +12% damage, -12% damage taken
	COMBAT_DAMAGE: 0.7,
	ATTRITION_DAMAGE: 0.06,
	REINFORCEMENT_RATE: 0.006,
	ENCIRCLEMENT_DAMAGE_MULT: 5.0,
	ENCIRCLEMENT_RADIUS: 0.7,
	WAR_GRACE_TICKS: 600, // ~10s ceasefire after war declaration for mobilization
	NAVAL_INVASION_FORCE_FRAC: 1.0, // Unlimited for testing
	NAVAL_LANDING_DEBUFF: 0.5, // 50% damage reduction for first 300 ticks after landing
	NAVAL_LANDING_DEBUFF_TICKS: 300,
	NAVAL_SUPPLY_FORCE_FRAC: 1.0, // Unlimited for testing
	NAVAL_SUPPLY_INTERVAL: 3600, // ~60s between supply run re-evaluations
	TEAM_A_COLOR: "rgba(255, 50, 50, 0.5)",
	TEAM_B_COLOR: "rgba(50, 100, 255, 0.5)",
	FRONTLINE_COLOR: "rgba(0, 0, 0, 1.0)",
	// Combat perf flags (Phase 1+); all off = legacy behavior
	ENABLE_SIDE_HASH_COMBAT: true,
	ENABLE_STALE_TARGET_SKIP: true,
	STALE_TARGET_SCAN_INTERVAL: 3,
	STALE_TARGET_MAX_CACHE_DIST_SQ: 0.09, // ~0.3° engagement radius squared
};
