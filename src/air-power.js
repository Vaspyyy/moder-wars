import {
	COMBINED_ARMS_CONFIG,
	getAircraftCommandPolicy,
	getAirfieldCapacity,
	getQualityMultiplier,
	haversineKm,
	selectStrikeTarget,
} from "./combined-arms.js";

export const AIR_WING_STATES = Object.freeze({
	GROUNDED: "GROUNDED",
	PATROL: "PATROL",
	INTERCEPT: "INTERCEPT",
	ATTACKING: "ATTACKING",
	RETURNING: "RETURNING",
	REARMING: "REARMING",
	EVACUATED: "EVACUATED",
});

function moveToward(wing, target, distancePerTick) {
	const dLat = target.lat - wing.lat;
	let dLng = target.lng - wing.lng;
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;
	const distance = Math.sqrt(dLat * dLat + dLng * dLng);
	if (distance <= distancePerTick || distance === 0) {
		wing.lat = target.lat;
		wing.lng = target.lng;
		return true;
	}
	wing.lat += (dLat / distance) * distancePerTick;
	wing.lng += (dLng / distance) * distancePerTick;
	if (wing.lng > 180) wing.lng -= 360;
	else if (wing.lng < -180) wing.lng += 360;
	return false;
}

function findField(airfields, fieldId) {
	return airfields.find((field) => field.id === fieldId) || null;
}

function countFieldWings(wings, fieldId, ownerId) {
	let national = 0;
	let allied = 0;
	for (const wing of wings) {
		if (wing.airfieldId !== fieldId || wing.state === AIR_WING_STATES.EVACUATED)
			continue;
		if (wing.sovereignId === ownerId) national++;
		else allied++;
	}
	return { national, allied };
}

export function findEligibleAirfield({
	wing,
	airfields,
	wings,
	allowAllied = true,
	ferryRangeKm = COMBINED_ARMS_CONFIG.STRIKE_RANGE_KM *
		COMBINED_ARMS_CONFIG.FERRY_RANGE_MULT,
}) {
	let best = null;
	for (const field of airfields) {
		if (field.health <= 0 || field.disabled) continue;
		if (field.sideIndex !== wing.sideIndex) continue;
		const operationalOwnerId = field.controllerId || field.ownerId;
		const isNational = operationalOwnerId === wing.sovereignId;
		if (!isNational && !allowAllied) continue;
		const distance = haversineKm(wing, field);
		if (distance > ferryRangeKm) continue;
		const capacity = getAirfieldCapacity(field);
		const occupancy = countFieldWings(wings, field.id, operationalOwnerId);
		if (isNational) {
			if (occupancy.national + occupancy.allied >= capacity) continue;
		} else {
			const alliedCapacity = Math.floor(capacity / 2);
			if (occupancy.allied >= alliedCapacity) continue;
		}
		const score = (isNational ? 100000 : 0) - distance;
		if (!best || score > best.score) best = { field, score, distance };
	}
	return best?.field || null;
}

export function evacuateDefeatedWings({
	countryId,
	sideIndex,
	wings,
	airfields,
	ferryRangeKm = COMBINED_ARMS_CONFIG.STRIKE_RANGE_KM *
		COMBINED_ARMS_CONFIG.FERRY_RANGE_MULT,
}) {
	let evacuatedAircraft = 0;
	let lostAircraft = 0;
	const alliedFields = airfields.filter(
		(field) =>
			field.sideIndex === sideIndex &&
			field.controllerId !== countryId &&
			field.ownerId !== countryId,
	);
	for (let index = wings.length - 1; index >= 0; index--) {
		const wing = wings[index];
		if (wing.sovereignId !== countryId) continue;
		const destination = findEligibleAirfield({
			wing,
			airfields: alliedFields,
			wings,
			ferryRangeKm,
		});
		if (!destination) {
			lostAircraft += Math.max(0, wing.equipment || 0);
			wings.splice(index, 1);
			continue;
		}
		evacuatedAircraft += Math.max(0, wing.equipment || 0);
		wing.airfieldId = destination.id;
		wing.lat = destination.lat;
		wing.lng = destination.lng;
		wing.state = AIR_WING_STATES.EVACUATED;
		wing.targetId = null;
		wing.returnFieldId = null;
		wing.evacuatedFromCountryId = countryId;
	}
	return { evacuatedAircraft, lostAircraft };
}

function chooseInterceptTarget(
	wing,
	wings,
	areSidesHostile,
	{ homeField = null, homeDefense = false } = {},
) {
	let best = null;
	for (const target of wings) {
		if (target === wing || target.equipment <= 0) continue;
		if (target.state === AIR_WING_STATES.GROUNDED) continue;
		if (target.state === AIR_WING_STATES.EVACUATED) continue;
		if (!areSidesHostile(wing.sideIndex, target.sideIndex)) continue;
		const distance = haversineKm(wing, target);
		if (distance > COMBINED_ARMS_CONFIG.FIGHTER_RANGE_KM) continue;
		if (
			homeDefense &&
			homeField &&
			haversineKm(homeField, target) > COMBINED_ARMS_CONFIG.FIGHTER_RANGE_KM
		)
			continue;
		const priority = target.role === "STRIKE" ? 10000 : 0;
		const score = priority - distance;
		if (!best || score > best.score) best = { target, score };
	}
	return best?.target || null;
}

function missionOffsetForWing(wing) {
	const text = String(wing.id || `${wing.sovereignId}-${wing.role}`);
	let hash = 0;
	for (let index = 0; index < text.length; index++) {
		hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
	}
	const slots = Math.max(
		1,
		Math.floor(
			COMBINED_ARMS_CONFIG.AIR_MISSION_INTERVAL /
				COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL,
		),
	);
	return (hash % slots) * COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL;
}

function wingMissionIsDue(wing, tick) {
	if (wing.forceMission) {
		wing.forceMission = false;
		wing.nextMissionTick = tick + COMBINED_ARMS_CONFIG.AIR_MISSION_INTERVAL;
		return true;
	}
	if (!Number.isFinite(wing.nextMissionTick)) {
		const cycleStart =
			tick - (tick % COMBINED_ARMS_CONFIG.AIR_MISSION_INTERVAL);
		wing.nextMissionTick = cycleStart + missionOffsetForWing(wing);
		if (wing.nextMissionTick < tick) {
			wing.nextMissionTick += COMBINED_ARMS_CONFIG.AIR_MISSION_INTERVAL;
		}
	}
	if (tick < wing.nextMissionTick) return false;
	wing.nextMissionTick = tick + COMBINED_ARMS_CONFIG.AIR_MISSION_INTERVAL;
	return true;
}

export function createAirPowerRuntime() {
	return {
		lastMissionTick: 0,
		lastUpdateMs: 0,
	};
}

export function runAirPowerTick({
	tick,
	wings,
	airfields,
	units,
	countryEquipment,
	countryEconomy,
	areSidesHostile,
	applyStrikeDamage,
	applyAirLoss,
	onEvent,
	runtime,
}) {
	if (tick % COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL !== 0) return;
	const started = performance.now();
	const missionDue = new Set();
	for (const wing of wings) {
		if (
			wing.equipment > 0 &&
			wing.state !== AIR_WING_STATES.EVACUATED &&
			wingMissionIsDue(wing, tick)
		)
			missionDue.add(wing);
	}
	if (missionDue.size > 0) runtime.lastMissionTick = tick;

	const strikeCandidates = [];
	const needsStrikeCandidates =
		missionDue.size > 0 ||
		wings.some(
			(wing) =>
				wing.role === "STRIKE" && wing.state === AIR_WING_STATES.ATTACKING,
		);
	if (needsStrikeCandidates) {
		for (const unit of units) {
			if (unit.health <= 0) continue;
			strikeCandidates.push({
				id: unit.id,
				type: unit.kind === "armor" ? "ARMOR" : "ARMY",
				lat: unit.lat,
				lng: unit.lng,
				sideIndex: unit.sideIndex,
				equipment: unit.equipment || 0,
				clusterSize: unit._localAllyCount || 1,
				unit,
			});
		}
		for (const field of airfields) {
			strikeCandidates.push({
				id: field.id,
				type: "AIRFIELD",
				lat: field.lat,
				lng: field.lng,
				sideIndex: field.sideIndex,
				health: field.health,
				field,
			});
		}
	}

	for (const wing of wings) {
		if (wing.equipment <= 0 || wing.state === AIR_WING_STATES.EVACUATED)
			continue;
		const equipmentState = countryEquipment.get(wing.sovereignId);
		const economyState = countryEconomy.get(wing.sovereignId);
		const policy = getAircraftCommandPolicy(
			economyState?.commandBand || "PAID",
		);
		const field = findField(airfields, wing.airfieldId);
		const shouldSelectMission = missionDue.has(wing);

		if (!field || field.health <= 0 || field.disabled) {
			const replacement = findEligibleAirfield({
				wing,
				airfields,
				wings,
			});
			if (replacement) {
				wing.returnFieldId = replacement.id;
				wing.state = AIR_WING_STATES.RETURNING;
			} else {
				wing.state = AIR_WING_STATES.GROUNDED;
			}
		}
		if (
			wing.state === AIR_WING_STATES.GROUNDED &&
			(!field || field.health <= 0 || field.disabled)
		) {
			continue;
		}

		if (
			policy.fighters === "GROUNDED" ||
			(equipmentState?.airOperationsCoverage ?? 1) < 0.25
		) {
			wing.state = AIR_WING_STATES.GROUNDED;
			wing.targetId = null;
			if (field?.health > 0 && !field.disabled) {
				wing.lat = field.lat;
				wing.lng = field.lng;
			}
			continue;
		}
		if (
			wing.role === "STRIKE" &&
			!policy.strikes &&
			wing.state === AIR_WING_STATES.ATTACKING
		) {
			wing.state = AIR_WING_STATES.RETURNING;
			wing.returnFieldId = wing.airfieldId;
		}

		if (wing.state === AIR_WING_STATES.REARMING) {
			wing.rearmTicks = Math.max(
				0,
				(wing.rearmTicks || 0) - COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL,
			);
			if (wing.rearmTicks === 0) {
				wing.state =
					wing.role === "FIGHTER"
						? AIR_WING_STATES.PATROL
						: AIR_WING_STATES.GROUNDED;
			}
			continue;
		}

		if (wing.state === AIR_WING_STATES.RETURNING) {
			const destination = findField(
				airfields,
				wing.returnFieldId || wing.airfieldId,
			);
			if (!destination) {
				wing.state = AIR_WING_STATES.GROUNDED;
				continue;
			}
			if (moveToward(wing, destination, 0.08)) {
				wing.airfieldId = destination.id;
				wing.returnFieldId = null;
				wing.state = AIR_WING_STATES.REARMING;
				wing.rearmTicks =
					wing.role === "FIGHTER"
						? COMBINED_ARMS_CONFIG.FIGHTER_REARM_TICKS
						: COMBINED_ARMS_CONFIG.STRIKE_REARM_TICKS;
			}
			continue;
		}

		if (wing.role === "FIGHTER") {
			if (wing.state === AIR_WING_STATES.GROUNDED && field?.health > 0) {
				wing.state = AIR_WING_STATES.PATROL;
			}
			if (shouldSelectMission) {
				const intercept = chooseInterceptTarget(wing, wings, areSidesHostile, {
					homeField: field,
					homeDefense: policy.fighters === "HOME_DEFENSE",
				});
				if (intercept) {
					wing.targetId = intercept.id;
					wing.state = AIR_WING_STATES.INTERCEPT;
				}
			}
			if (wing.state === AIR_WING_STATES.INTERCEPT) {
				const target = wings.find((other) => other.id === wing.targetId);
				if (
					!target ||
					target.equipment <= 0 ||
					!areSidesHostile(wing.sideIndex, target.sideIndex) ||
					(field &&
						haversineKm(field, target) > COMBINED_ARMS_CONFIG.FIGHTER_RANGE_KM)
				) {
					wing.state = AIR_WING_STATES.RETURNING;
					wing.returnFieldId = wing.airfieldId;
					continue;
				}
				if (moveToward(wing, target, 0.1)) {
					const quality = getQualityMultiplier(wing.quality);
					const strength = Math.max(0.2, wing.equipment / wing.maxEquipment);
					const loss = Math.max(1, Math.round(2 * quality * strength));
					applyAirLoss(target, loss, wing.sovereignId);
					if (target.role === "FIGHTER" && target.equipment > 0) {
						const returnLoss = Math.max(
							1,
							Math.round(
								1.25 *
									getQualityMultiplier(target.quality) *
									(target.equipment / target.maxEquipment),
							),
						);
						applyAirLoss(wing, returnLoss, target.sovereignId);
					}
					wing.state = AIR_WING_STATES.RETURNING;
					wing.returnFieldId = wing.airfieldId;
				}
			}
			wing.enduranceTicks =
				(wing.enduranceTicks || 0) + COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL;
			if (wing.enduranceTicks >= COMBINED_ARMS_CONFIG.FIGHTER_ENDURANCE_TICKS) {
				wing.enduranceTicks = 0;
				wing.state = AIR_WING_STATES.RETURNING;
				wing.returnFieldId = wing.airfieldId;
			}
			continue;
		}

		wing.cooldownTicks = Math.max(
			0,
			(wing.cooldownTicks || 0) - COMBINED_ARMS_CONFIG.AIR_TICK_INTERVAL,
		);
		if (
			shouldSelectMission &&
			policy.strikes &&
			(equipmentState?.airOperationsCoverage ?? 1) >= 0.999 &&
			wing.cooldownTicks === 0 &&
			field?.health > 0 &&
			!field.disabled
		) {
			const selected = selectStrikeTarget(field, strikeCandidates, {
				isHostile: (sideIndex) => areSidesHostile(wing.sideIndex, sideIndex),
			});
			if (selected) {
				wing.targetId = selected.target.id;
				wing.targetType = selected.target.type;
				wing.targetLat = selected.target.lat;
				wing.targetLng = selected.target.lng;
				wing.state = AIR_WING_STATES.ATTACKING;
			}
		}
		if (wing.state === AIR_WING_STATES.ATTACKING) {
			const target = strikeCandidates.find(
				(candidate) =>
					candidate.id === wing.targetId && candidate.type === wing.targetType,
			);
			if (
				!target ||
				!areSidesHostile(wing.sideIndex, target.sideIndex) ||
				(field &&
					haversineKm(field, target) > COMBINED_ARMS_CONFIG.STRIKE_RANGE_KM)
			) {
				wing.state = AIR_WING_STATES.RETURNING;
				wing.returnFieldId = wing.airfieldId;
				continue;
			}
			if (moveToward(wing, target, 0.075)) {
				const strength = Math.max(0.2, wing.equipment / wing.maxEquipment);
				const baseDamage = 10 * getQualityMultiplier(wing.quality) * strength;
				const multiplier =
					target.type === "ARMOR" ? 2.5 : target.type === "AIRFIELD" ? 1.5 : 1;
				applyStrikeDamage(target, baseDamage * multiplier, wing);
				wing.cooldownTicks = COMBINED_ARMS_CONFIG.STRIKE_COOLDOWN_TICKS;
				wing.state = AIR_WING_STATES.RETURNING;
				wing.returnFieldId = wing.airfieldId;
			}
		}
	}

	for (let index = wings.length - 1; index >= 0; index--) {
		const wing = wings[index];
		if (wing.equipment > 0) continue;
		onEvent?.(
			`${wing.role === "FIGHTER" ? "Fighter" : "Strike"} wing destroyed`,
			"danger",
		);
		wings.splice(index, 1);
	}
	runtime.lastUpdateMs = performance.now() - started;
}
