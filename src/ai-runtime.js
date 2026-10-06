import {
	AI_TASK_FORCE_DEFAULTS,
	advanceAiTaskForce,
	calculateTaskForceReadiness,
	cleanupAiTaskForces,
	reconcileAiTaskForces,
	selectWithdrawalAnchor,
} from "./ai-task-forces.js";
import {
	allocateArmyCoverage,
	buildArmySectors,
	formationOffset,
	issueArmyOrder,
	measureOperation,
	replenishArmyFormation,
} from "./army-command.js";
import { armyPocketClosed } from "./army-encirclement.js";
import { armyDistanceSq, createArmyNavigator } from "./army-navigation.js";
import { CONFIG as DEFAULT_CONFIG } from "./config.js";

/** createAiRuntime owns AI behavior and receives current world state through explicit accessors. */
export function createAiRuntime(context) {
	const CONFIG = context.CONFIG || DEFAULT_CONFIG;
	const unitIndex = new Map();
	const serializedUnitIndex = new Map();
	const roleCache = new Map();
	const navigator = createArmyNavigator(context);
	const armyReports = new Map();
	let armySideCursor = 0;
	function getArmyMovement(unit, order) {
		const movement = navigator.direction(unit, order, context._simTickCount);
		if (
			unit._armyLastNavStatus !== movement.status &&
			["UNREACHABLE", "INVALID_DESTINATION", "BLOCKED"].includes(
				movement.status,
			)
		) {
			recordArmyEvent(unit.sideIndex, {
				unitId: unit.id,
				type: order.type,
				owner: order.owner,
				reason: movement.status,
			});
			const report = armyReports.get(unit.sideIndex);
			if (
				movement.status === "UNREACHABLE" &&
				["MOVE", "ASSAULT"].includes(order.type) &&
				context._simTickCount - (report?.lastRouteReassess ?? -Infinity) >= 300
			) {
				context._planReassessNeeded[unit.sideIndex] = true;
				if (report) report.lastRouteReassess = context._simTickCount;
			}
		}
		unit._armyLastNavStatus = movement.status;
		return movement;
	}
	function isArmyCellPassable(idx, side, friendlyOnly) {
		return navigator.passable(idx, side, friendlyOnly);
	}
	function recordArmyEvent(sideIndex, event) {
		const report = armyReports.get(sideIndex);
		if (!report) return;
		report.events.push({ tick: context._simTickCount, ...event });
		if (report.events.length > 64) report.events.shift();
	}

	function operationalUnitPower(unit, country = undefined) {
		if (!unit || unit.health <= 0) return 0;
		let power = Math.max(0, context.getLiveFormationStrength(unit));
		const sideCountry =
			country ||
			context.sides[unit.sideIndex]?.find(
				(candidate) => candidate.id === unit.sovereignId,
			);
		const buff = context.getEffectiveBuffState(
			sideCountry,
			context.countryMetadata[unit.sovereignId - 1],
		);
		power *=
			{
				buff: 2.5,
				super: 10,
				godly: 40,
				weakened: 0.7,
				crippled: 0.4,
			}[buff] || 1;
		return power;
	}

	// isAtSea is refreshed during unit movement, after the AI has run; a unit
	// that just left the coast must not receive land orders on this tick.
	function isOnLand(unit) {
		const idx = context.getGridIndex(unit.lat, unit.lng);
		return idx >= 0 && context.landMask[idx] !== 0;
	}

	function writeOperationalUnit(unit, serialized) {
		const country = context.sides[unit.sideIndex]?.find(
			(candidate) => candidate.id === unit.sovereignId,
		);

		return Object.assign(serialized, {
			id: unit.id,
			sideUid: context.sideUids[unit.sideIndex] || "",
			countryId: unit.sovereignId,
			countryRole: country?.role === "SUPPORT" ? "SUPPORT" : "PRIMARY",
			kind: unit.kind || "army",
			lat: unit.lat,
			lng: unit.lng,
			health: unit.health,
			maxHealth:
				unit.maxHealth ||
				CONFIG.UNIT_HEALTH * (unit.isAlpenjager ? CONFIG.ALPEN_HEALTH_MULT : 1),
			combatPower: operationalUnitPower(unit, country),
			deployed: unit.deployTicks <= 0 && !unit.isAtSea && isOnLand(unit),
			commandEligible:
				!unit.navalAssigned &&
				!unit.supplyAssigned &&
				!unit.garrisonAssigned &&
				!unit.coastalAssigned &&
				!unit._armyNavalReserve,
			taskForceId: unit._taskForceUid,
			sectorId: unit._armySectorId,
			recovering: unit._armyRecovering,
			rotationEligible:
				!unit._armyExhaustedHealth ||
				unit.health < unit._armyExhaustedHealth * 0.8,
		});
	}

	function serializeOperationalUnit(unit) {
		return writeOperationalUnit(unit, {});
	}

	function prepareOperationalSide(sideIndex) {
		const units = [];
		const unitsById = new Map();
		let availablePower = 0;
		let availableCount = 0;
		for (const unit of context._tickUnitsBySide[sideIndex] || []) {
			const key = String(unit.id);
			let serialized = serializedUnitIndex.get(key);
			if (!serialized) {
				serialized = {};
				serializedUnitIndex.set(key, serialized);
			}
			writeOperationalUnit(unit, serialized);
			units.push(serialized);
			unitsById.set(key, serialized);
			if (serialized.health > 0 && serialized.deployed) {
				availablePower += serialized.combatPower;
				availableCount++;
			}
		}
		return {
			units,
			unitsById,
			availablePower,
			availableCount,
			posture: context.getSideStrategyProfile(sideIndex).dominant,
		};
	}

	function reconcileOperationalAiLifecycle(reason = "world-change") {
		if (context._aiTaskForcesBySide.size === 0) return;
		context.ensureSideIdentities();
		const activeSideUids = new Set();
		const sideIndexByUid = new Map();
		for (let sideIndex = 0; sideIndex < context.sides.length; sideIndex++) {
			const uid = context.sideUids[sideIndex];
			if (!uid || !context.sides[sideIndex]?.length) continue;
			activeSideUids.add(uid);
			sideIndexByUid.set(uid, sideIndex);
		}
		const liveUnitsById = new Map(
			context.units
				.filter((unit) => unit.health > 0)
				.map((unit) => [String(unit.id), unit]),
		);
		const liveUnitIds = new Set(liveUnitsById.keys());

		const nextTaskForces = new Map();
		for (const [sideUid] of sideIndexByUid) {
			const taskForces = cleanupAiTaskForces(
				context._aiTaskForcesBySide.get(sideUid) || [],
				{ liveUnitIds, activeSideUids },
			).map((taskForce) => {
				const assignedUnitIds = taskForce.assignedUnitIds.filter((unitId) => {
					const unit = liveUnitsById.get(String(unitId));
					return unit && context.sideUids[unit.sideIndex] === sideUid;
				});
				const assigned = new Set(assignedUnitIds.map(String));
				return {
					...taskForce,
					assignedUnitIds,
					unitRoles: Object.fromEntries(
						Object.entries(taskForce.unitRoles || {}).filter(([unitId]) =>
							assigned.has(String(unitId)),
						),
					),
				};
			});
			nextTaskForces.set(sideUid, taskForces);
		}
		context._aiTaskForcesBySide = nextTaskForces;

		const validAssignments = new Map();
		for (const taskForces of nextTaskForces.values()) {
			for (const taskForce of taskForces) {
				for (const unitId of taskForce.assignedUnitIds) {
					validAssignments.set(String(unitId), taskForce.id);
				}
			}
		}
		for (const unit of context.units) {
			if (validAssignments.get(String(unit.id)) === unit._taskForceUid)
				continue;
			unit._taskForceUid = null;
			unit._taskForceRole = null;
			unit._taskForceOrder = null;
		}

		context.requestOperationalAiReassessment();
		if (reason) context._aiOperationsDirty = true;
	}

	function initializeOperationalAiRuntime() {
		unitIndex.clear();
		serializedUnitIndex.clear();
		roleCache.clear();
		navigator.reset();
		armyReports.clear();
		for (const unit of context.units) {
			unit._armyOrder = null;
			unit._armyNavigation = null;
			unit._armySectorId = null;
			unit._armyRecovering = false;
		}
		context.resetOperationalAiRuntime();
		context.onOperationalAiReset?.();
		context.ensureSideIdentities();
		for (let sideIndex = 0; sideIndex < context.sides.length; sideIndex++) {
			if (context.sides[sideIndex]?.length)
				context._aiTaskForcesBySide.set(context.sideUids[sideIndex], []);
		}
		context.refreshLiveCombatPower();
		context._aiOperationsDirty = true;
	}

	function isOperationalLandPlan(plan) {
		return !!(
			plan &&
			["CAPTURE_CITY", "ENCIRCLE", "PUSH_FRONT", "DEFEND"].includes(plan.type)
		);
	}

	function isOperationalDefensePlanType(planType) {
		return planType === "DEFEND";
	}

	function operationalPlanStillHostile(sideIndex, plan) {
		if (!plan?.target || isOperationalDefensePlanType(plan.type)) return true;
		if (plan.targetCountryId) {
			const targetSideIndex = context.findCountrySideIndex(
				plan.targetCountryId,
			);
			return (
				targetSideIndex >= 0 &&
				context.areSidesHostile(sideIndex, targetSideIndex)
			);
		}
		if (plan.targetSideUid) {
			const targetSideIndex = context.sideUids.indexOf(plan.targetSideUid);
			return (
				targetSideIndex >= 0 &&
				context.areSidesHostile(sideIndex, targetSideIndex)
			);
		}
		const targetIndex = context.getGridIndex(plan.target.lat, plan.target.lng);
		if (targetIndex === -1) return false;
		const targetSide = context.dominantSideMap[targetIndex];
		return targetSide >= 0 && context.areSidesHostile(sideIndex, targetSide);
	}

	function discardNonHostileOperationalPlans(sideIndex) {
		for (const slot of [sideIndex, sideIndex + context.sides.length]) {
			const plan = context._warPlan[slot];
			if (
				isOperationalLandPlan(plan) &&
				!operationalPlanStillHostile(sideIndex, plan)
			) {
				context._warPlan[slot] = null;
			}
		}
	}

	function getOperationalSelectedPlans(sideIndex) {
		const selected = [
			context._warPlan[sideIndex],
			context._warPlan[sideIndex + context.sides.length],
		].filter(
			(plan) =>
				isOperationalLandPlan(plan) &&
				operationalPlanStillHostile(sideIndex, plan),
		);
		const defensivePlan = context._aiDebugPlans[sideIndex]?.selected?.defend;
		if (
			isOperationalLandPlan(defensivePlan) &&
			(context._sideWarPhase[sideIndex] === "COLLAPSING" ||
				selected.length === 0)
		) {
			selected.push(defensivePlan);
		}
		return selected.filter(
			(plan, index, list) =>
				list.findIndex(
					(candidate) => candidate.signature === plan.signature,
				) === index,
		);
	}

	function getOperationalFrontage(sideIndex, plan) {
		if (plan.frontlinePoints?.length) return plan.frontlinePoints.slice(0, 40);
		const poly = plan.theaterId
			? context._frontlinePolys?.[plan.theaterId]
			: null;
		if (poly?.length) {
			const stride = Math.max(1, Math.floor(poly.length / 30));
			return poly
				.filter((_, index) => index % stride === 0)
				.slice(0, 30)
				.map((point) => ({ lat: point.lat, lng: point.lng }));
		}
		const front = (context._frontIntelBySide[sideIndex] || []).find(
			(candidate) => candidate.pairKey === plan.theaterId,
		);
		return (front?.samples || []).map((point) => ({
			lat: point.lat,
			lng: point.lng,
		}));
	}

	function operationalPlanInput(
		sideIndex,
		plan,
		landingHandoff = null,
		sideSummary = null,
	) {
		const sideUid = context.sideUids[sideIndex];
		const summary = sideSummary || prepareOperationalSide(sideIndex);
		const requestedFormationCount = Math.max(1, plan.maxAssignedUnits || 5);
		const requestedPower =
			summary.availablePower *
			Math.min(
				1,
				requestedFormationCount / Math.max(1, summary.availableCount),
			);
		const landingPower = (landingHandoff?.unitIds || []).reduce(
			(sum, unitId) => {
				const unit = summary.unitsById.get(String(unitId));
				return sum + (unit?.health > 0 && unit.deployed ? unit.combatPower : 0);
			},
			0,
		);
		const landingAnchor = landingHandoff?.anchor;
		const baseSignature =
			plan.signature || context.getPlanSignature(sideIndex, plan);
		const stagingAnchor =
			landingAnchor ||
			plan.stagingPoint ||
			plan.stagingCells?.[0] ||
			plan.frontIntel?.weakPoint ||
			plan.arrowPoints?.[0] ||
			plan.target;
		const route = [
			...(plan._waypoints || []),
			...(plan.target ? [plan.target] : []),
		];
		return {
			signature: baseSignature,
			planSignature: baseSignature,
			planType: plan.type,
			type: plan.type,
			sideUid,
			theaterId: plan.theaterId,
			target: plan.target ? { ...plan.target } : stagingAnchor,
			stagingAnchor: stagingAnchor ? { ...stagingAnchor } : null,
			route,
			encirclement: plan.encirclement || null,
			posture: summary.posture,
			assignedUnitIds: landingHandoff?.unitIds || [],
			desiredPower: Math.max(1, requestedPower, landingPower),
			maxAssignedUnits: Math.max(
				3,
				requestedFormationCount,
				landingHandoff?.unitIds?.length || 0,
			),
			priority: plan.priority || 0,
		};
	}

	function interpolateOperationalPoint(start, end, progress, lateral = 0) {
		if (!start && !end) return null;
		if (!start) return { lat: end.lat, lng: end.lng };
		if (!end) return { lat: start.lat, lng: start.lng };
		const clamped = Math.max(-1, Math.min(1, progress));
		const dLat = end.lat - start.lat;
		const dLng = context.lngDelta(end.lng, start.lng);
		const distance = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
		let lng = start.lng + dLng * clamped - (dLat / distance) * lateral;
		while (lng > 180) lng -= 360;
		while (lng < -180) lng += 360;
		return {
			lat: Math.max(
				-89.5,
				Math.min(
					89.5,
					start.lat + dLat * clamped + (dLng / distance) * lateral,
				),
			),
			lng,
		};
	}

	function interpolateOperationalCorridor(taskForce, progress, lateral = 0) {
		const points = [
			taskForce.stagingAnchor,
			...(taskForce.route || []),
			taskForce.target,
		].filter((point, index, list) => {
			if (!point) return false;
			const previous = list[index - 1];
			return (
				!previous ||
				context.geoDistSq(point.lat, point.lng, previous.lat, previous.lng) >
					0.0001
			);
		});
		if (points.length < 2) {
			return interpolateOperationalPoint(
				taskForce.stagingAnchor,
				taskForce.target,
				progress,
				lateral,
			);
		}
		const segmentLengths = [];
		let totalLength = 0;
		for (let index = 1; index < points.length; index++) {
			const length = Math.sqrt(
				context.geoDistSq(
					points[index - 1].lat,
					points[index - 1].lng,
					points[index].lat,
					points[index].lng,
				),
			);
			segmentLengths.push(length);
			totalLength += length;
		}
		let remaining =
			Math.max(0, Math.min(1, progress)) * Math.max(totalLength, 1);
		for (let index = 0; index < segmentLengths.length; index++) {
			const length = segmentLengths[index];
			if (remaining <= length || index === segmentLengths.length - 1) {
				return interpolateOperationalPoint(
					points[index],
					points[index + 1],
					length > 0 ? remaining / length : 1,
					lateral,
				);
			}
			remaining -= length;
		}
		return interpolateOperationalPoint(
			points.at(-2),
			points.at(-1),
			1,
			lateral,
		);
	}

	function isOperationalFriendlyPoint(point, sideIndex) {
		const idx = context.getGridIndex(point.lat, point.lng);
		return (
			idx >= 0 &&
			context.landMask[idx] > 0 &&
			(context.dominantSideMap[idx] === sideIndex ||
				(context.dominantSideMap[idx] === -1 &&
					context.countryToSideMap.get(context.worldControlMap[idx]) ===
						sideIndex))
		);
	}

	function findOperationalWithdrawalAnchor(sideIndex, taskForce, members) {
		const sideUid = context.sideUids[sideIndex];
		const referenceLng = members[0]?.lng || 0;
		const origin = members.length
			? {
					lat:
						members.reduce((sum, unit) => sum + unit.lat, 0) / members.length,
					lng:
						referenceLng +
						members.reduce(
							(sum, unit) => sum + context.lngDelta(unit.lng, referenceLng),
							0,
						) /
							members.length,
				}
			: taskForce.stagingAnchor || taskForce.target;
		if (!origin) return null;
		origin.lng = ((origin.lng + 540) % 360) - 180;

		const candidates = [];
		const add = (point, id) => {
			if (
				!point ||
				!isOperationalFriendlyPoint(point, sideIndex) ||
				context.geoDistSq(origin.lat, origin.lng, point.lat, point.lng) >
					AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_DISTANCE_SQ
			)
				return;
			candidates.push({ ...point, id, sideUid, controlStrength: 1 });
		};
		add(origin, "current-position");
		add(taskForce.stagingAnchor, "original-assembly");
		// Sample local friendly ground so an inland city is never the only option.
		for (const distance of [0.5, 1, 2]) {
			for (let direction = 0; direction < 8; direction++) {
				const angle = (direction * Math.PI) / 4;
				add(
					{
						lat: origin.lat + Math.sin(angle) * distance,
						lng: ((origin.lng + Math.cos(angle) * distance + 540) % 360) - 180,
					},
					`local-${distance}-${direction}`,
				);
			}
		}
		for (const city of context.activeTheaterCities || [])
			add(city, `city-${city.id || city.name}`);
		const enemyEstimates = context.units.filter(
			(unit) =>
				unit.health > 0 && context.areSidesHostile(sideIndex, unit.sideIndex),
		);
		const startIdx = context.getGridIndex(origin.lat, origin.lng);
		// Rank first, then path-check only a few local candidates.
		for (let attempt = 0; attempt < 4 && candidates.length; attempt++) {
			const anchor = selectWithdrawalAnchor(taskForce, candidates, {
				origin,
				enemyEstimates,
			});
			if (!anchor) break;
			const targetIdx = context.getGridIndex(anchor.lat, anchor.lng);
			if (
				startIdx === targetIdx ||
				context.findLandPathSummary(startIdx, targetIdx, sideIndex, 30000)
					.reachable
			)
				return anchor;
			candidates.splice(
				candidates.findIndex((candidate) => candidate.id === anchor.id),
				1,
			);
		}
		// If no short safe route exists, release to local tactics after the timeout.
		return { ...origin };
	}

	function _taskForceLocation(taskForce) {
		const target = taskForce.target || taskForce.stagingAnchor;
		return target
			? {
					name: target.name || "Operational sector",
					lat: target.lat,
					lng: target.lng,
				}
			: null;
	}

	function clearOperationalPlanForTaskForce(sideIndex, taskForce) {
		const slots = [sideIndex, sideIndex + context.sides.length];
		for (const slot of slots) {
			if (context._warPlan[slot]?.signature === taskForce.planSignature) {
				context._warPlan[slot] = null;
			}
		}
		context._planReassessNeeded[sideIndex] = true;
	}

	function assignOperationalTaskForceOrders(
		sideIndex,
		taskForce,
		plan,
		unitsById,
	) {
		const members = taskForce.assignedUnitIds
			.map((unitId) => unitsById.get(String(unitId)))
			.filter(Boolean);
		const assembly = taskForce.stagingAnchor || taskForce.target;
		const objective = taskForce.target || assembly;
		const frontage = getOperationalFrontage(sideIndex, plan || taskForce);
		const occupied = new Set();
		const operation = taskForce.encirclement;
		const report = armyReports.get(sideIndex);
		const byRole = new Map();
		for (const unit of members) {
			const role = taskForce.unitRoles[String(unit.id)]?.role || "LINE";
			if (!byRole.has(role)) byRole.set(role, []);
			byRole.get(role).push(unit);
		}
		for (const roleMembers of byRole.values()) {
			roleMembers.sort((left, right) =>
				String(left.id).localeCompare(String(right.id)),
			);
		}
		const roleIndexByUnit = new Map();
		for (const roleMembers of byRole.values()) {
			for (let index = 0; index < roleMembers.length; index++) {
				roleIndexByUnit.set(roleMembers[index], index);
			}
		}
		for (const unit of members) {
			const role = taskForce.unitRoles[String(unit.id)]?.role || "LINE";
			const roleMembers = byRole.get(role) || [unit];
			const roleIndex = roleIndexByUnit.get(unit);
			const spacing = Math.max(0.12, CONFIG.GRID_RES);
			const offset = formationOffset(
				roleIndex,
				roleMembers.length,
				spacing,
				role === "LINE" ? 2.4 : 1.8,
			);
			const lateral = offset.lateral;
			let target = assembly;
			let speed = 1;
			if (taskForce.phase === "ASSEMBLING") {
				const depth =
					role === "SPEARHEAD"
						? 0.12
						: role === "LINE"
							? 0
							: role === "SUPPORT"
								? -0.12
								: -0.28;
				target = interpolateOperationalPoint(
					assembly,
					objective,
					depth,
					lateral,
				);
				speed = role === "RESERVE" ? 1.05 : 1.55;
				if (operation && role === "SPEARHEAD")
					target = interpolateOperationalPoint(
						operation.shoulders[roleIndex % 2],
						operation.target,
						0,
						lateral,
					);
			} else if (taskForce.phase === "ATTACKING") {
				if (
					isOperationalDefensePlanType(taskForce.planType) &&
					frontage.length
				) {
					target =
						frontage[
							Math.min(
								frontage.length - 1,
								Math.floor(
									((roleIndex + 0.5) * frontage.length) / roleMembers.length,
								),
							)
						];
					speed = 0.7;
				} else {
					let routeProgress = 0;
					if (role === "SPEARHEAD") {
						routeProgress = Math.min(1, taskForce.progress + 0.18);
						speed = 2.15;
					} else if (role === "LINE") {
						routeProgress = Math.min(1, taskForce.progress + 0.12);
						speed = 1.65;
					} else if (role === "SUPPORT") {
						routeProgress = Math.max(0, taskForce.progress - 0.04);
						speed = 1.4;
					} else {
						routeProgress =
							taskForce.progress >= 0.4
								? Math.max(0, taskForce.progress - 0.12)
								: 0;
						speed = routeProgress > 0 ? 1.3 : 0.35;
					}
					target = interpolateOperationalCorridor(
						taskForce,
						routeProgress,
						lateral,
					);
				}
			} else if (taskForce.phase === "CONSOLIDATING") {
				target = interpolateOperationalPoint(
					assembly,
					objective,
					1,
					lateral * 0.75,
				);
				speed = 0.8;
			} else if (["WITHDRAWING", "REGROUPING"].includes(taskForce.phase)) {
				target = interpolateOperationalPoint(
					taskForce.withdrawalAnchor || assembly,
					assembly,
					0,
					lateral,
				);
				const previousOrder = unit._taskForceOrder;
				if (
					unit._taskForceUid === taskForce.id &&
					previousOrder?.target &&
					["WITHDRAWING", "REGROUPING"].includes(previousOrder.phase) &&
					isOperationalFriendlyPoint(previousOrder.target, sideIndex)
				) {
					target = previousOrder.target;
				} else if (target) {
					const distanceSq = context.geoDistSq(
						unit.lat,
						unit.lng,
						target.lat,
						target.lng,
					);
					if (
						distanceSq > AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_DISTANCE_SQ ||
						!isOperationalFriendlyPoint(target, sideIndex)
					) {
						const travel = Math.min(
							1,
							Math.sqrt(
								AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_MAX_DISTANCE_SQ /
									Math.max(0.0001, distanceSq),
							),
						);
						const destination = target;
						target = { lat: unit.lat, lng: unit.lng };
						for (const fraction of [travel, travel / 2]) {
							const nearby = interpolateOperationalPoint(
								unit,
								destination,
								fraction,
							);
							if (isOperationalFriendlyPoint(nearby, sideIndex)) {
								target = nearby;
								break;
							}
						}
					}
				}
				speed = taskForce.phase === "WITHDRAWING" ? 1.85 : 0.45;
			} else if (taskForce.phase === "CULMINATED") {
				target = { lat: unit.lat, lng: unit.lng };
				speed = 0.25;
			}
			let type = "MOVE";
			let reason = "ASSEMBLE_OPERATION";
			if (taskForce.phase === "ATTACKING") {
				type =
					role === "RESERVE"
						? "RESERVE"
						: role === "SUPPORT"
							? "SCREEN"
							: "ASSAULT";
				reason = taskForce.stage || "BREACH";
				if (isOperationalDefensePlanType(taskForce.planType)) {
					type = "HOLD";
					reason = "DEFEND_OBJECTIVE";
				}
				if (operation) {
					if (role === "LINE" || role === "SUPPORT") {
						target = operation.pinTarget;
						type = "SCREEN";
						reason = "PIN_AND_PROTECT_SHOULDERS";
					} else if (role === "SPEARHEAD") {
						const shoulder = operation.shoulders[roleIndex % 2];
						target = interpolateOperationalPoint(
							shoulder,
							operation.target,
							Math.min(1, taskForce.progress + 0.25),
							lateral,
						);
						type = "ASSAULT";
						reason = "CLOSE_PINCER";
					}
				}
			} else if (
				["WITHDRAWING", "REGROUPING", "CULMINATED"].includes(taskForce.phase)
			) {
				type = taskForce.phase === "WITHDRAWING" ? "WITHDRAW" : "RESERVE";
				reason = taskForce.completionReason || "RECOVER_FORMATION";
			} else if (taskForce.phase === "CONSOLIDATING") {
				type = "HOLD";
				reason = "SECURE_CAPTURED_CORRIDOR";
			}
			if (taskForce.paused && taskForce.phase === "ATTACKING") {
				target = { lat: unit.lat, lng: unit.lng };
				type = "HOLD";
				reason = "ATTACK_PAUSED_FLANK_UNCOVERED";
			}
			if (
				taskForce.phase === "WITHDRAWING" &&
				role === "SUPPORT" &&
				context._simTickCount - taskForce.phaseStartedTick < 120 &&
				unit.health / (unit.maxHealth || 100) > 0.6 &&
				unit.lastCombatTick != null &&
				context._simTickCount - unit.lastCombatTick < 30
			) {
				target = { lat: unit.lat, lng: unit.lng };
				type = "ASSAULT";
				speed = 0.5;
				reason = "COVER_WITHDRAWAL";
			}
			if (
				taskForce.phase === "ATTACKING" &&
				role === "RESERVE" &&
				taskForce.progress >= 0.4
			) {
				type = "ASSAULT";
				speed = 1.4;
				reason = "EXPLOIT_BREACH";
			}
			if (target && offset.depth > 0 && assembly && objective) {
				const dl = objective.lat - assembly.lat,
					dg = context.lngDelta(objective.lng, assembly.lng);
				const length = Math.hypot(dl, dg) || 1;
				target = {
					...target,
					lat: target.lat - (dl / length) * offset.depth,
					lng: ((target.lng - (dg / length) * offset.depth + 540) % 360) - 180,
				};
			}
			if (target && context.gridWidth && context.gridHeight) {
				const safe = navigator.safePosition(
					target,
					sideIndex,
					taskForce.phase === "ASSEMBLING" ||
						["HOLD", "RESERVE", "SCREEN", "WITHDRAW"].includes(type),
					10,
					occupied,
				);
				if (safe) target = safe;
				else {
					target = { lat: unit.lat, lng: unit.lng };
					type = "HOLD";
					reason = "FORMATION_CAPACITY_EXCEEDED";
				}
			}
			unit._taskForceUid = taskForce.id;
			unit._taskForceRole = role;
			unit._taskForceOrder = target
				? {
						target,
						phase: taskForce.phase,
						friendlyOnly: taskForce.phase === "ASSEMBLING",
						role,
						speed,
						tick: context._simTickCount,
					}
				: null;
			if (target)
				issueArmyOrder(
					unit,
					{
						target,
						type,
						owner: taskForce.id,
						phase: taskForce.phase,
						friendlyOnly: taskForce.phase === "ASSEMBLING",
						role,
						speed,
						reason,
					},
					context._simTickCount,
					report?.events,
				);
		}
		return { assembly, objective, frontage, members };
	}

	function updateOperationalAiTaskForces() {
		if (context.gridWidth && context.gridHeight)
			navigator.beginTick(context._simTickCount);
		if (context._aiTaskForcesBySide.size === 0) return;
		const forceAll = context._aiOperationsDirty;
		context._aiLastOperationsTick = context._simTickCount;
		context._aiOperationsDirty = false;
		unitIndex.clear();
		for (const unit of context.units) unitIndex.set(String(unit.id), unit);
		const unitsById = unitIndex;
		for (const id of serializedUnitIndex.keys()) {
			if (!unitsById.has(id)) serializedUnitIndex.delete(id);
		}
		const allAssignedUnitIds = new Set();
		const liveTaskForceIds = new Set();
		const orderedUnitIds = new Set();
		const processedSides = new Set();
		let processedCount = 0;

		for (let step = 0; step < context.sides.length; step++) {
			const sideIndex = (armySideCursor + step) % context.sides.length;
			const sideUid = context.sideUids[sideIndex];
			if (!sideUid || !context.sides[sideIndex]?.length) continue;
			if (
				armyReports.has(sideIndex) &&
				armyReports.get(sideIndex).sideUid !== sideUid
			)
				armyReports.delete(sideIndex);
			const lastUpdate = armyReports.get(sideIndex)?.lastUpdate ?? -Infinity;
			if (
				!forceAll &&
				(processedCount > 0 || context._simTickCount - lastUpdate < 15)
			) {
				for (const force of context._aiTaskForcesBySide.get(sideUid) || [])
					liveTaskForceIds.add(force.id);
				continue;
			}
			processedSides.add(sideIndex);
			processedCount++;
			discardNonHostileOperationalPlans(sideIndex);
			let selectedPlans = getOperationalSelectedPlans(sideIndex);
			const emergencyDefense =
				context._sideWarPhase[sideIndex] === "COLLAPSING";
			if (
				emergencyDefense &&
				selectedPlans.some((plan) => isOperationalDefensePlanType(plan.type))
			) {
				selectedPlans = selectedPlans.filter((plan) =>
					isOperationalDefensePlanType(plan.type),
				);
			}
			let landingHandoff = context._aiPendingLandingHandoffs.get(sideUid);
			if (
				landingHandoff &&
				context._simTickCount - landingHandoff.tick > 1800
			) {
				context._aiPendingLandingHandoffs.delete(sideUid);
				landingHandoff = null;
			}
			const handoffCandidates = landingHandoff
				? selectedPlans.filter((plan) => plan.target)
				: [];
			if (landingHandoff && handoffCandidates.length === 0) {
				const targetIndex = context.getGridIndex(
					landingHandoff.anchor.lat,
					landingHandoff.anchor.lng,
				);
				let targetSideIndex =
					targetIndex >= 0 ? context.dominantSideMap[targetIndex] : -1;
				if (!context.areSidesHostile(sideIndex, targetSideIndex)) {
					targetSideIndex = context.sides.findIndex(
						(side, candidateIndex) =>
							side?.length &&
							context.areSidesHostile(sideIndex, candidateIndex),
					);
				}
				const beachheadPlan = {
					type: "PUSH_FRONT",
					phase: "EXECUTION",
					target: { ...landingHandoff.anchor },
					targetSideUid: context.sideUids[targetSideIndex],
					stagingPoint: { ...landingHandoff.anchor },
					startedTick: landingHandoff.frame,
					lastProgressTick: landingHandoff.frame,
					progress: 0,
					priority: 200,
					maxAssignedUnits: Math.max(3, landingHandoff.unitIds.length),
					signature: `${sideIndex}:BEACHHEAD:${Math.round(landingHandoff.anchor.lat * 2) / 2}:${Math.round(landingHandoff.anchor.lng * 2) / 2}`,
				};
				const slot = !context._warPlan[sideIndex]
					? sideIndex
					: !context._warPlan[sideIndex + context.sides.length]
						? sideIndex + context.sides.length
						: sideIndex;
				context._warPlan[slot] = beachheadPlan;
				selectedPlans.push(beachheadPlan);
				handoffCandidates.push(beachheadPlan);
			}
			const postLandingCandidates = handoffCandidates.filter(
				(plan) => (plan.startedTick || 0) >= landingHandoff.frame,
			);
			const handoffPlan = landingHandoff
				? (postLandingCandidates.length
						? postLandingCandidates
						: handoffCandidates
					).sort(
						(left, right) =>
							context.geoDistSq(
								left.target.lat,
								left.target.lng,
								landingHandoff.anchor.lat,
								landingHandoff.anchor.lng,
							) -
							context.geoDistSq(
								right.target.lat,
								right.target.lng,
								landingHandoff.anchor.lat,
								landingHandoff.anchor.lng,
							),
					)[0]
				: null;
			const handoffPlanSignature = handoffPlan
				? handoffPlan.signature ||
					context.getPlanSignature(sideIndex, handoffPlan)
				: null;
			const recovering = (taskForce) =>
				["CULMINATED", "WITHDRAWING", "REGROUPING"].includes(taskForce.phase);
			const previousForces = context._aiTaskForcesBySide.get(sideUid) || [];
			const hasDefensePlan = selectedPlans.some((plan) =>
				isOperationalDefensePlanType(plan.type),
			);
			if (hasDefensePlan) {
				const recoveringSignatures = new Set(
					previousForces.filter(recovering).map((force) => force.signature),
				);
				selectedPlans = selectedPlans.filter(
					(plan) =>
						isOperationalDefensePlanType(plan.type) ||
						!recoveringSignatures.has(
							plan.signature || context.getPlanSignature(sideIndex, plan),
						),
				);
			}
			const seaReserved = new Set();
			for (const plan of [
				context._navalPlan?.[sideIndex],
				context._navalSupplyPlan?.[sideIndex],
			]) {
				if (
					!plan?.stagingPoint ||
					["DELIVERED", "CONSOLIDATION"].includes(plan.phase)
				)
					continue;
				const candidates = (context._tickUnitsBySide[sideIndex] || [])
					.filter(
						(u) =>
							u.health > 0 &&
							u.deployTicks <= 0 &&
							!u.garrisonAssigned &&
							armyDistanceSq(u, plan.stagingPoint) <
								(plan.type === "NAVAL_INVASION" ? 4 : 64),
					)
					.sort(
						(a, b) =>
							armyDistanceSq(a, plan.stagingPoint) -
							armyDistanceSq(b, plan.stagingPoint),
					);
				for (const unit of candidates.slice(0, plan.maxAssignedUnits || 0))
					seaReserved.add(String(unit.id));
			}
			for (const unit of context._tickUnitsBySide[sideIndex] || []) {
				unit._armyNavalReserve = seaReserved.has(String(unit.id));
				if (unit._armyNavalReserve) {
					unit._armyOrder = null;
					unit._taskForceUid = null;
					unit._taskForceOrder = null;
				}
				if (
					unit._cachedLocalEnemyCount >
						Math.max(3, (unit._tickLocalAllyCount || 1) * 3) &&
					unit.health / (unit.maxHealth || 100) < 0.7 &&
					!unit.navalAssigned &&
					!unit.supplyAssigned &&
					!unit.garrisonAssigned
				) {
					const local = context.estimateLocalForces(
						sideIndex,
						unit.lat,
						unit.lng,
						4,
					);
					if (local.enemyHealth > (local.friendlyHealth || 0) * 2) {
						if (!unit._armyRecovering)
							unit._armyRecoveryTick = context._simTickCount;
						unit._armyRecovering = true;
					}
				}
				if (
					unit._armyRecovering &&
					context._simTickCount - (unit._armyRecoveryTick || 0) >= 600
				) {
					unit._armyRecovering = false;
					unit._armyExhaustedHealth = unit.health;
				}
				replenishArmyFormation(unit, context, context._simTickCount);
			}
			const sideSummary = prepareOperationalSide(sideIndex);
			let report = armyReports.get(sideIndex);
			if (!report) {
				const saved = context._aiDebugPlans[sideIndex]?.army;
				report = {
					sideUid,
					sectors: saved?.sectors || [],
					events: saved?.events || [],
					stats: {},
					sectorTick: -Infinity,
				};
				armyReports.set(sideIndex, report);
			}
			if (
				context.gridWidth &&
				context.gridHeight &&
				(context._simTickCount - (report.sectorTick ?? -Infinity) >= 60 ||
					!report.sectors.length)
			) {
				report.sectors = buildArmySectors(
					context,
					sideIndex,
					report.sectors,
					navigator,
					operationalUnitPower,
				);
				report.sectorTick = context._simTickCount;
			}
			const coverage = allocateArmyCoverage(
				report.sectors,
				sideSummary.units.map((unit) =>
					previousForces.some(
						(force) =>
							recovering(force) &&
							force.assignedUnitIds.some(
								(id) => String(id) === String(unit.id),
							),
					)
						? { ...unit, commandEligible: false }
						: unit,
				),
				sideSummary.posture,
			);
			const occupiedCoverage = new Set();
			for (const allocation of coverage.allocations) {
				const unit = unitsById.get(String(allocation.unit.id));
				const sector = allocation.sector;
				let target = sector.hold;
				if (allocation.type === "RESERVE") {
					const nearby = sideSummary.units.filter(
						(u) => armyDistanceSq(u, sector.anchor) < 16,
					);
					if (nearby.length)
						target = {
							lat: nearby.reduce((sum, u) => sum + u.lat, 0) / nearby.length,
							lng: nearby[0].lng,
						};
				}
				target =
					navigator.safePosition(
						target,
						sideIndex,
						true,
						10,
						occupiedCoverage,
					) || sector.hold;
				unit._armySectorId = sector.id;
				unit._armyRecovering = false;
				issueArmyOrder(
					unit,
					{
						type: allocation.type,
						target,
						owner: sector.id,
						role: allocation.type === "RESERVE" ? "RESERVE" : "LINE",
						speed: 1,
						reason: allocation.reason,
					},
					context._simTickCount,
					report.events,
				);
				orderedUnitIds.add(String(unit.id));
			}
			for (const serialized of coverage.recovering) {
				const unit = unitsById.get(String(serialized.id));
				if (!unit._armyRecovering)
					unit._armyRecoveryTick = context._simTickCount;
				unit._armyRecovering = true;
				const sector = [...report.sectors].sort(
					(a, b) => armyDistanceSq(unit, a.hold) - armyDistanceSq(unit, b.hold),
				)[0];
				const previousRecovery =
					unit._armyOrder?.reason === "ROTATE_DEPLETED_FORMATION"
						? unit._armyOrder.target
						: null;
				const target =
					previousRecovery &&
					isOperationalFriendlyPoint(previousRecovery, sideIndex)
						? previousRecovery
						: findOperationalWithdrawalAnchor(
								sideIndex,
								{ stagingAnchor: sector.hold, target: sector.hold },
								[unit],
							);
				issueArmyOrder(
					unit,
					{
						type: "WITHDRAW",
						target,
						owner: `recovery:${sideUid}`,
						role: "RESERVE",
						speed: 1.4,
						reason: "ROTATE_DEPLETED_FORMATION",
					},
					context._simTickCount,
					report.events,
				);
				orderedUnitIds.add(String(unit.id));
			}
			const freeUnits = sideSummary.units.filter(
				(unit) =>
					unit.commandEligible &&
					unit.deployed &&
					!coverage.reserved.has(String(unit.id)),
			);
			const freePower = freeUnits.reduce(
				(sum, unit) => sum + unit.combatPower,
				0,
			);
			const requestedCount = selectedPlans.reduce(
				(sum, plan) => sum + Math.max(1, plan.maxAssignedUnits || 5),
				0,
			);
			const planInputs = selectedPlans.map((plan) => {
				const signature =
					plan.signature || context.getPlanSignature(sideIndex, plan);
				return operationalPlanInput(
					sideIndex,
					{
						...plan,
						maxAssignedUnits: Math.max(
							1,
							Math.floor(
								(freeUnits.length * Math.max(1, plan.maxAssignedUnits || 5)) /
									Math.max(1, requestedCount),
							),
						),
					},
					signature === handoffPlanSignature ? landingHandoff : null,
					{
						...sideSummary,
						availableCount: freeUnits.length,
						availablePower: freePower,
					},
				);
			});
			const selectedSignatures = new Set(
				planInputs.map((plan) => plan.signature),
			);
			const existing = previousForces.filter((taskForce) => {
				if (!recovering(taskForce) || (!emergencyDefense && !hasDefensePlan))
					return true;
				// A surviving defensive plan gets fresh membership while its slot stays live.
				if (!selectedSignatures.has(taskForce.signature))
					clearOperationalPlanForTaskForce(sideIndex, taskForce);
				return false;
			});
			const retiring = [];
			for (const taskForce of existing) {
				if (
					selectedSignatures.has(taskForce.signature) ||
					taskForce.phase === "COMPLETE"
				)
					continue;
				// Changing an objective hands healthy units directly to the new plan.
				if (!recovering(taskForce)) continue;
				const members = taskForce.assignedUnitIds
					.map((unitId) => unitsById.get(String(unitId)))
					.filter(Boolean);
				retiring.push({
					...taskForce,
					withdrawalAnchor:
						taskForce.withdrawalAnchor ||
						findOperationalWithdrawalAnchor(sideIndex, taskForce, members),
				});
			}

			const reservedUnitIds = new Set(
				retiring.flatMap((taskForce) => taskForce.assignedUnitIds.map(String)),
			);
			const readinessUnits = sideSummary.units;
			const operationalUnits =
				reservedUnitIds.size || coverage.reserved.size
					? readinessUnits.map((serialized) =>
							reservedUnitIds.has(String(serialized.id)) ||
							coverage.reserved.has(String(serialized.id))
								? { ...serialized, commandEligible: false }
								: serialized,
						)
					: readinessUnits;
			const taskForces = reconcileAiTaskForces(
				existing.filter((taskForce) =>
					selectedSignatures.has(taskForce.signature),
				),
				planInputs,
				operationalUnits,
				{
					tick: context._simTickCount,
					roleCache,
				},
			);
			taskForces.push(...retiring);
			const retained = [];
			for (let taskForce of taskForces) {
				const plan = selectedPlans.find(
					(candidate) =>
						(candidate.signature ||
							context.getPlanSignature(sideIndex, candidate)) ===
						taskForce.planSignature,
				);
				const runtime =
					context._aiTaskForceTransitionById.get(taskForce.id) || {};

				const members = taskForce.assignedUnitIds
					.map((unitId) => unitsById.get(String(unitId)))
					.filter(Boolean);
				if (!members.length) {
					clearOperationalPlanForTaskForce(sideIndex, taskForce);
					continue;
				}
				const readinessResult = calculateTaskForceReadiness(
					taskForce,
					readinessUnits,
					{
						assemblyRadiusSq: 9,
						unitsById: sideSummary.unitsById,
					},
				);
				const assessment = measureOperation(taskForce, members, {
					CONFIG,
					operationalUnitPower,
					getGridIndex: context.getGridIndex,
					dominantSideMap: context.dominantSideMap,
				});
				const objectiveInvalid = taskForce.encirclement?.shoulders.some(
					(point) => !isOperationalFriendlyPoint(point, sideIndex),
				);
				const objectiveAchieved =
					!isOperationalDefensePlanType(taskForce.planType) &&
					(taskForce.encirclement
						? armyPocketClosed(context, sideIndex, taskForce.encirclement)
						: assessment.achieved);
				const initialDistance = runtime.initialObjectiveDistance || 1;
				if (taskForce.encirclement) {
					const arms = [[], []];
					const spearheads = members
						.filter(
							(unit) =>
								taskForce.unitRoles[String(unit.id)]?.role === "SPEARHEAD",
						)
						.sort((a, b) => String(a.id).localeCompare(String(b.id)));
					for (let index = 0; index < spearheads.length; index++) {
						const unit = spearheads[index],
							anchor = taskForce.encirclement.shoulders[index % 2];
						const distance = Math.sqrt(
							armyDistanceSq(anchor, taskForce.target),
						);
						arms[index % 2].push(
							Math.max(
								0,
								Math.min(
									1,
									1 -
										Math.sqrt(armyDistanceSq(unit, taskForce.target)) /
											Math.max(CONFIG.GRID_RES, distance),
								),
							),
						);
					}
					assessment.progress = Math.min(
						...arms.map((arm) =>
							arm.length
								? arm.reduce((sum, value) => sum + value, 0) / arm.length
								: 0,
						),
					);
				}
				const progress = isOperationalDefensePlanType(taskForce.planType)
					? taskForce.progress
					: Math.max(taskForce.progress, assessment.progress);
				taskForce.stage =
					taskForce.phase === "ASSEMBLING"
						? "ASSEMBLE"
						: objectiveAchieved
							? "SECURE"
							: progress < 0.25
								? "BREACH"
								: "EXPLOIT";
				const relevantSectors = report.sectors.filter(
					(sector) =>
						!taskForce.theaterId || sector.pairKey === taskForce.theaterId,
				);
				const flankUnsafe = relevantSectors.some(
					(sector) =>
						sector.enemyPower > 0 &&
						(sector.assignedUnitIds.length === 0 ||
							sector.enemyPower >
								Math.max(1, sector.assignedPower, sector.friendlyPower) * 2.5),
				);
				taskForce.paused =
					!isOperationalDefensePlanType(taskForce.planType) && flankUnsafe;
				taskForce.advance = assessment.advance;
				taskForce.secured = assessment.secured;
				// Launch against opposition at the breach, not every enemy within a
				// four-degree circle around a distant final objective.
				const contact =
					interpolateOperationalCorridor(
						taskForce,
						Math.min(1, taskForce.progress + 0.12),
					) || taskForce.target;
				const opposition = {
					estimatedPower: contact
						? context.estimateLocalForces(
								sideIndex,
								contact.lat,
								contact.lng,
								1,
							).enemyHealth
						: 0,
				};
				taskForce.flankUnsafe = flankUnsafe;
				taskForce.forceRatio =
					readinessResult.currentPower /
					Math.max(0.25, opposition.estimatedPower);
				const supplyCollapsed =
					members.length > 0 &&
					members.filter(
						(unit) =>
							context._simTickCount -
								(unit._supplyCollapsedTick ?? Number.NEGATIVE_INFINITY) <=
							15,
					).length >= Math.ceil(members.length * 0.35);
				const encirclementRiskSevere =
					members.length > 0 &&
					members.filter((unit) => (unit.encircledTicks || 0) >= 60).length >=
						Math.ceil(members.length * 0.35);
				let withdrawalAnchor = taskForce.withdrawalAnchor;
				if (
					["CULMINATED", "WITHDRAWING"].includes(taskForce.phase) &&
					!withdrawalAnchor
				) {
					withdrawalAnchor = findOperationalWithdrawalAnchor(
						sideIndex,
						taskForce,
						members,
					);
				}
				// Generate the current spread before testing arrival; previous orders can
				// refer to a different anchor or still be an attacking order.
				let geometry;
				if (taskForce.phase === "WITHDRAWING") {
					taskForce = { ...taskForce, withdrawalAnchor };
					geometry = assignOperationalTaskForceOrders(
						sideIndex,
						taskForce,
						plan,
						unitsById,
					);
				}
				const withdrawalArrived =
					taskForce.phase === "WITHDRAWING" &&
					members.length > 0 &&
					members.filter(
						(unit) =>
							unit._taskForceOrder?.target &&
							context.geoDistSq(
								unit.lat,
								unit.lng,
								unit._taskForceOrder.target.lat,
								unit._taskForceOrder.target.lng,
							) <= AI_TASK_FORCE_DEFAULTS.WITHDRAWAL_ARRIVAL_RADIUS_SQ,
					).length >= Math.ceil(members.length * 0.65);
				taskForce = advanceAiTaskForce(taskForce, {
					tick: context._simTickCount,
					readinessResult,
					progress,
					objectiveAchieved,
					supplyCollapsed,
					encirclementRiskSevere,
					flankUnsafe,
					objectiveInvalid,
					forceRatio: taskForce.forceRatio,
					withdrawalAnchor,
					withdrawalArrived,
				});
				if (taskForce.phase !== "ATTACKING") {
					taskForce.stage =
						{
							ASSEMBLING: "ASSEMBLE",
							CONSOLIDATING: "SECURE",
							CULMINATED: "HALT",
							WITHDRAWING: "WITHDRAW",
							REGROUPING: "REGROUP",
							COMPLETE: "COMPLETE",
						}[taskForce.phase] || taskForce.phase;
				} else if (taskForce.stage === "ASSEMBLE") {
					taskForce.stage = "BREACH";
				}

				if (taskForce.phase === "COMPLETE") {
					clearOperationalPlanForTaskForce(sideIndex, taskForce);
					for (const unit of members) {
						unit._taskForceUid = null;
						unit._taskForceRole = null;
						unit._taskForceOrder = null;
					}
					continue;
				}
				if (!geometry || taskForce.phase !== "WITHDRAWING") {
					geometry = assignOperationalTaskForceOrders(
						sideIndex,
						taskForce,
						plan,
						unitsById,
					);
				}
				taskForce = {
					...taskForce,
					assemblyArea: geometry.assembly,
					frontage: geometry.frontage,
					corridor: [
						geometry.assembly,
						...(taskForce.route || []),
						geometry.objective,
					].filter(Boolean),
				};
				for (const unitId of taskForce.assignedUnitIds) {
					allAssignedUnitIds.add(String(unitId));
					orderedUnitIds.add(String(unitId));
				}
				liveTaskForceIds.add(taskForce.id);
				context._aiTaskForceTransitionById.set(taskForce.id, {
					initialObjectiveDistance:
						runtime.initialObjectiveDistance || initialDistance,
				});
				retained.push(taskForce);
			}
			context._aiTaskForcesBySide.set(sideUid, retained);
			for (const serialized of sideSummary.units) {
				const unit = unitsById.get(String(serialized.id));
				if (
					orderedUnitIds.has(String(unit.id)) ||
					!serialized.commandEligible ||
					!serialized.deployed ||
					!report.sectors.length
				)
					continue;
				const sector = [...report.sectors].sort(
					(a, b) => armyDistanceSq(unit, a.hold) - armyDistanceSq(unit, b.hold),
				)[0];
				const target = navigator.safePosition(
					sector.hold,
					sideIndex,
					true,
					12,
					occupiedCoverage,
				) || { lat: unit.lat, lng: unit.lng };
				issueArmyOrder(
					unit,
					{
						type: "SCREEN",
						target,
						owner: sector.id,
						role: "SUPPORT",
						speed: 1,
						reason: "PROTECT_OPERATION_FLANK",
					},
					context._simTickCount,
					report.events,
				);
				orderedUnitIds.add(String(unit.id));
			}
			report.lastUpdate = context._simTickCount;
			report.stats = {
				sectors: report.sectors.length,
				uncovered: report.sectors.filter((s) => !s.assignedUnitIds.length)
					.length,
				reserveCount: coverage.reserveCount,
				recovering: coverage.recovering.length,
				blocked: sideSummary.units.filter((u) =>
					["BLOCKED", "UNREACHABLE", "INVALID_DESTINATION"].includes(
						unitsById.get(String(u.id))._armyMoveStatus,
					),
				).length,
				assignmentChanges: report.events.filter(
					(e) => context._simTickCount - e.tick <= 60,
				).length,
				...navigator.stats(),
			};
			const debug = context._aiDebugPlans[sideIndex] || {};
			debug.army = {
				sectors: report.sectors,
				events: [...report.events],
				orders: sideSummary.units
					.filter(
						(_, index) =>
							index % Math.max(1, Math.ceil(sideSummary.units.length / 96)) ===
							0,
					)
					.map((serialized) => {
						const unit = unitsById.get(String(serialized.id));
						return unit._armyOrder
							? {
									unitId: unit.id,
									from: { lat: unit.lat, lng: unit.lng },
									target: unit._armyOrder.target,
									type: unit._armyOrder.type,
									reason: unit._armyOrder.reason,
									role: unit._armyOrder.role,
									status: unit._armyMoveStatus || "ORDERED",
								}
							: null;
					})
					.filter(Boolean),
				stats: report.stats,
				tick: context._simTickCount,
			};
			context._aiDebugPlans[sideIndex] = debug;
			const receivingTaskForce = landingHandoff
				? retained.find(
						(taskForce) => taskForce.signature === handoffPlanSignature,
					)
				: null;
			const liveLandingUnitIds = (landingHandoff?.unitIds || []).filter(
				(unitId) => {
					const unit = unitsById.get(String(unitId));
					return (
						unit &&
						unit.health > 0 &&
						context.sideUids[unit.sideIndex] === sideUid
					);
				},
			);
			if (
				receivingTaskForce &&
				liveLandingUnitIds.every((unitId) =>
					receivingTaskForce.assignedUnitIds.some(
						(assignedId) => String(assignedId) === String(unitId),
					),
				)
			) {
				context._aiPendingLandingHandoffs.delete(sideUid);
			}
		}
		armySideCursor =
			(armySideCursor + Math.max(1, processedCount)) %
			Math.max(1, context.sides.length);
		for (const unit of context.units) {
			if (!processedSides.has(unit.sideIndex)) continue;
			if (!orderedUnitIds.has(String(unit.id))) {
				unit._armyOrder = null;
				unit._armySectorId = null;
			}
			if (allAssignedUnitIds.has(String(unit.id))) continue;
			unit._taskForceUid = null;
			unit._taskForceRole = null;
			unit._taskForceOrder = null;
		}
		for (const taskForceId of Array.from(
			context._aiTaskForceTransitionById.keys(),
		)) {
			if (!liveTaskForceIds.has(taskForceId)) {
				context._aiTaskForceTransitionById.delete(taskForceId);
			}
		}
		for (const id of roleCache.keys()) {
			if (!liveTaskForceIds.has(id)) roleCache.delete(id);
		}
	}
	return {
		getArmyMovement,
		isArmyCellPassable,
		recordArmyEvent,
		operationalUnitPower,
		serializeOperationalUnit,
		reconcileOperationalAiLifecycle,
		initializeOperationalAiRuntime,
		isOperationalLandPlan,
		isOperationalDefensePlanType,
		operationalPlanStillHostile,
		discardNonHostileOperationalPlans,
		getOperationalSelectedPlans,
		getOperationalFrontage,
		operationalPlanInput,
		interpolateOperationalPoint,
		interpolateOperationalCorridor,
		findOperationalWithdrawalAnchor,
		_taskForceLocation,
		clearOperationalPlanForTaskForce,
		assignOperationalTaskForceOrders,
		updateOperationalAiTaskForces,
	};
}
