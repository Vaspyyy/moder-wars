import { CONFIG } from "./config.js";

/** Construct an army; deployment and mountain health are explicit spawn policies. */
export function createArmyFormation(
	{
		id = Math.random(),
		lat,
		lng,
		sideIndex,
		sovereignId,
		isAlpenjager = false,
		mountainHealth = false,
		deployTicks = 30,
		...fields
	},
	config = CONFIG,
) {
	return {
		id,
		kind: "army",
		lat,
		lng,
		sideIndex,
		sovereignId,
		beneficiaryId: sovereignId,
		isAlpenjager,
		health:
			config.UNIT_HEALTH *
			(mountainHealth && isAlpenjager ? config.ALPEN_HEALTH_MULT : 1),
		lastAttack: 0,
		deployTicks,
		...fields,
	};
}
