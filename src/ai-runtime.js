import {
	advanceAiTaskForce,
	calculateTaskForceReadiness,
	cleanupAiTaskForces,
	reconcileAiTaskForces,
	selectWithdrawalAnchor,
} from "./ai-task-forces.js";
import { CONFIG } from "./config.js";

/** createAiRuntime owns AI behavior and receives current world state through explicit accessors. */
export function createAiRuntime(context) {
	function operationalUnitPower(unit) {
		if (!unit || unit.health <= 0) return 0;
		let power = Math.max(0, context.getLiveFormationStrength(unit));
		const sideCountry = context.sides[unit.sideIndex]?.find(
			(country) => country.id === unit.sovereignId,
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

	function serializeOperationalUnit(unit) {
		const country = context.sides[unit.sideIndex]?.find(
			(candidate) => candidate.id === unit.sovereignId,
		);

		return {
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
			combatPower: operationalUnitPower(unit),
			deployed: unit.deployTicks <= 0 && !unit.isAtSea,
			commandEligible:
				!unit.navalAssigned && !unit.supplyAssigned && !unit.garrisonAssigned,
			taskForceId: unit._taskForceUid,
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
		context.resetOperationalAiRuntime();
		document.body.classList.remove("conflict-active");
		document.getElementById("war-desk").style.display = "none";
		context._warOverviewSides = [];
		context._warOverviewLastUpdate = -Infinity;
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

	function operationalPlanInput(sideIndex, plan, landingHandoff = null) {
		const sideUid = context.sideUids[sideIndex];
		const availableUnits = (context._tickUnitsBySide[sideIndex] || []).filter(
			(unit) => unit.health > 0 && unit.deployTicks <= 0 && !unit.isAtSea,
		);
		const requestedFormationCount = Math.max(1, plan.maxAssignedUnits || 5);
		const availablePower = availableUnits.reduce(
			(sum, unit) => sum + operationalUnitPower(unit),
			0,
		);
		const requestedPower =
			availablePower *
			Math.min(1, requestedFormationCount / Math.max(1, availableUnits.length));
		const landingPower = (landingHandoff?.unitIds || []).reduce(
			(sum, unitId) => {
				const unit = availableUnits.find(
					(candidate) => String(candidate.id) === String(unitId),
				);
				return sum + (unit ? operationalUnitPower(unit) : 0);
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
			posture: context.getSideStrategyProfile(sideIndex).dominant,
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
		const clamped = Math.max(0, Math.min(1, progress));
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

	function findOperationalWithdrawalAnchor(sideIndex, taskForce, members) {
		const sideUid = context.sideUids[sideIndex];
		const origin = members.length
			? {
					lat:
						members.reduce((sum, unit) => sum + unit.lat, 0) / members.length,
					lng:
						members.reduce((sum, unit) => sum + unit.lng, 0) / members.length,
				}
			: taskForce.target || taskForce.stagingAnchor;
		const candidates = [];
		if (taskForce.stagingAnchor) {
			const startIdx = context.getGridIndex(origin.lat, origin.lng);
			const stagingIdx = context.getGridIndex(
				taskForce.stagingAnchor.lat,
				taskForce.stagingAnchor.lng,
			);
			const stagingFriendly =
				stagingIdx !== -1 &&
				context.landMask[stagingIdx] > 0 &&
				(context.dominantSideMap[stagingIdx] === sideIndex ||
					context.dominantSideMap[stagingIdx] === -1);
			const stagingPath = stagingFriendly
				? context.findLandPathSummary(startIdx, stagingIdx, sideIndex, 30000)
				: { reachable: false };
			if (stagingPath.reachable) {
				candidates.push({
					...taskForce.stagingAnchor,
					id: "original-assembly",
					sideUid,
					controlStrength: 1,
				});
			}
		}
		const friendlyCities = (context.activeTheaterCities || [])
			.filter((city) => {
				const idx = context.getGridIndex(city.lat, city.lng);
				return idx !== -1 && context.dominantSideMap[idx] === sideIndex;
			})
			.sort(
				(left, right) =>
					context.geoDistSq(origin.lat, origin.lng, left.lat, left.lng) -
					context.geoDistSq(origin.lat, origin.lng, right.lat, right.lng),
			)
			.slice(0, 8);
		for (const city of friendlyCities) {
			const startIdx = context.getGridIndex(origin.lat, origin.lng);
			const targetIdx = context.getGridIndex(city.lat, city.lng);
			const path = context.findLandPathSummary(
				startIdx,
				targetIdx,
				sideIndex,
				30000,
			);
			if (!path.reachable) continue;
			candidates.push({
				lat: city.lat,
				lng: city.lng,
				name: city.name || "Defensive line",
				id: `city-${city.id || city.name || targetIdx}`,
				sideUid,
				controlStrength: city.isCapital ? 1.5 : 1.1,
			});
		}

		const enemyEstimates = context.units
			.filter(
				(unit) =>
					unit.health > 0 && context.areSidesHostile(sideIndex, unit.sideIndex),
			)
			.map((unit) => ({
				lat: unit.lat,
				lng: unit.lng,
				estimatedPower: operationalUnitPower(unit),
				confidence: 1,
			}));
		return (
			selectWithdrawalAnchor(taskForce, candidates, {
				origin,
				enemyEstimates,
			}) ||
			taskForce.stagingAnchor ||
			origin
		);
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
		for (const unit of members) {
			const role = taskForce.unitRoles[String(unit.id)]?.role || "LINE";
			const roleMembers = byRole.get(role) || [unit];
			const roleIndex = roleMembers.indexOf(unit);
			const centeredIndex = roleIndex - (roleMembers.length - 1) / 2;
			const lateralSpacing =
				role === "LINE" ? 0.16 : role === "RESERVE" ? 0.12 : 0.1;
			const lateralLimit =
				role === "LINE" ? 2.4 : role === "RESERVE" ? 1.8 : 1.2;
			const lateral = Math.max(
				-lateralLimit,
				Math.min(lateralLimit, centeredIndex * lateralSpacing),
			);
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
			} else if (taskForce.phase === "ATTACKING") {
				if (
					isOperationalDefensePlanType(taskForce.planType) &&
					frontage.length
				) {
					target = frontage[roleIndex % frontage.length];
					speed = 0.7;
				} else {
					let routeProgress = 0;
					if (role === "SPEARHEAD") {
						routeProgress = Math.min(1, 0.35 + taskForce.progress * 0.75);
						speed = 2.15;
					} else if (role === "LINE") {
						routeProgress = Math.min(1, 0.2 + taskForce.progress * 0.85);
						speed = 1.65;
					} else if (role === "SUPPORT") {
						routeProgress = Math.min(0.72, 0.1 + taskForce.progress * 0.58);
						speed = 1.4;
					} else {
						routeProgress =
							taskForce.progress >= 0.4
								? Math.min(0.45, taskForce.progress * 0.5)
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
				speed = taskForce.phase === "WITHDRAWING" ? 1.85 : 0.45;
			} else if (taskForce.phase === "CULMINATED") {
				target = { lat: unit.lat, lng: unit.lng };
				speed = 0.25;
			}
			unit._taskForceUid = taskForce.id;
			unit._taskForceRole = role;
			unit._taskForceOrder = target
				? {
						target,
						phase: taskForce.phase,
						role,
						speed,
						tick: context._simTickCount,
					}
				: null;
		}
		return { assembly, objective, frontage, members };
	}

	function updateOperationalAiTaskForces() {
		if (context._aiTaskForcesBySide.size === 0) return;
		if (
			!context._aiOperationsDirty &&
			context._simTickCount - context._aiLastOperationsTick < 15
		) {
			return;
		}
		context._aiLastOperationsTick = context._simTickCount;
		context._aiOperationsDirty = false;
		const unitsById = new Map(
			context.units.map((unit) => [String(unit.id), unit]),
		);
		const allAssignedUnitIds = new Set();
		const liveTaskForceIds = new Set();

		for (let sideIndex = 0; sideIndex < context.sides.length; sideIndex++) {
			const sideUid = context.sideUids[sideIndex];
			if (!sideUid || !context.sides[sideIndex]?.length) continue;
			discardNonHostileOperationalPlans(sideIndex);
			const selectedPlans = getOperationalSelectedPlans(sideIndex);
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
			const planInputs = selectedPlans.map((plan) => {
				const signature =
					plan.signature || context.getPlanSignature(sideIndex, plan);
				return operationalPlanInput(
					sideIndex,
					plan,
					signature === handoffPlanSignature ? landingHandoff : null,
				);
			});
			const selectedSignatures = new Set(
				planInputs.map((plan) => plan.signature),
			);
			const existing = context._aiTaskForcesBySide.get(sideUid) || [];
			const retiring = [];
			for (const taskForce of existing) {
				if (
					selectedSignatures.has(taskForce.signature) ||
					taskForce.phase === "COMPLETE"
				) {
					continue;
				}
				const members = taskForce.assignedUnitIds
					.map((unitId) => unitsById.get(String(unitId)))
					.filter(Boolean);
				const withdrawalAnchor =
					taskForce.withdrawalAnchor ||
					findOperationalWithdrawalAnchor(sideIndex, taskForce, members);
				const alreadyRetiring = [
					"CULMINATED",
					"WITHDRAWING",
					"REGROUPING",
				].includes(taskForce.phase);
				retiring.push({
					...taskForce,
					phase:
						taskForce.phase === "REGROUPING"
							? "REGROUPING"
							: taskForce.phase === "WITHDRAWING"
								? "WITHDRAWING"
								: "CULMINATED",
					phaseStartedTick: alreadyRetiring
						? taskForce.phaseStartedTick
						: context._simTickCount,
					withdrawalAnchor,
					completionReason: taskForce.completionReason || "PLAN_CANCELLED",
				});
			}
			const reservedUnitIds = new Set(
				retiring.flatMap((taskForce) => taskForce.assignedUnitIds.map(String)),
			);
			const readinessUnits = (context._tickUnitsBySide[sideIndex] || []).map(
				(unit) => serializeOperationalUnit(unit),
			);
			const operationalUnits = readinessUnits.map((serialized) => {
				const allocationUnit = { ...serialized };
				if (reservedUnitIds.has(String(serialized.id))) {
					allocationUnit.commandEligible = false;
				}
				return allocationUnit;
			});
			const taskForces = reconcileAiTaskForces(
				existing.filter((taskForce) =>
					selectedSignatures.has(taskForce.signature),
				),
				planInputs,
				operationalUnits,
				{
					tick: context._simTickCount,
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
				const readinessResult = calculateTaskForceReadiness(
					taskForce,
					readinessUnits,
					{
						assemblyRadiusSq: 9,
					},
				);
				const targetIdx = taskForce.target
					? context.getGridIndex(taskForce.target.lat, taskForce.target.lng)
					: -1;
				const objectiveAchieved =
					!isOperationalDefensePlanType(taskForce.planType) &&
					targetIdx !== -1 &&
					context.dominantSideMap[targetIdx] === sideIndex;
				const closestObjectiveDistance = taskForce.target
					? members.reduce(
							(best, unit) =>
								Math.min(
									best,
									Math.sqrt(
										context.geoDistSq(
											unit.lat,
											unit.lng,
											taskForce.target.lat,
											taskForce.target.lng,
										),
									),
								),
							Infinity,
						)
					: 0;
				const initialDistance =
					Number.isFinite(runtime.initialObjectiveDistance) &&
					runtime.initialObjectiveDistance > 0
						? runtime.initialObjectiveDistance
						: Number.isFinite(closestObjectiveDistance)
							? Math.max(0.5, closestObjectiveDistance)
							: null;
				const progress = objectiveAchieved
					? 1
					: isOperationalDefensePlanType(taskForce.planType)
						? taskForce.progress
						: !Number.isFinite(closestObjectiveDistance) || !initialDistance
							? taskForce.progress
							: Math.max(
									taskForce.progress,
									1 - closestObjectiveDistance / Math.max(0.5, initialDistance),
								);

				const opposition = {
					estimatedPower: taskForce.target
						? context.estimateLocalForces(
								sideIndex,
								taskForce.target.lat,
								taskForce.target.lng,
								16,
							).enemyHealth
						: 0,
				};
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
				const withdrawalArrived = !!(
					withdrawalAnchor &&
					members.length > 0 &&
					members.filter(
						(unit) =>
							context.geoDistSq(
								unit.lat,
								unit.lng,
								withdrawalAnchor.lat,
								withdrawalAnchor.lng,
							) <= 1,
					).length >= Math.ceil(members.length * 0.65)
				);
				if (
					taskForce.phase === "REGROUPING" &&
					context._sideWarPhase[sideIndex] === "COLLAPSING"
				) {
					taskForce = {
						...taskForce,
						planType: "DEFEND",
						readiness: readinessResult.readiness,
						currentPower: readinessResult.currentPower,
						completionReason: "COLLAPSING_DEFENSE",
						outcome: null,
					};
				} else {
					taskForce = advanceAiTaskForce(taskForce, {
						tick: context._simTickCount,
						readinessResult,
						progress,
						objectiveAchieved,

						supplyCollapsed,
						encirclementRiskSevere,
						forceRatio:
							readinessResult.currentPower /
							Math.max(0.25, opposition.estimatedPower),
						withdrawalAnchor,
						withdrawalArrived,
					});
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
				const geometry = assignOperationalTaskForceOrders(
					sideIndex,
					taskForce,
					plan,
					unitsById,
				);
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
				}
				liveTaskForceIds.add(taskForce.id);
				context._aiTaskForceTransitionById.set(taskForce.id, {
					initialObjectiveDistance:
						runtime.initialObjectiveDistance || initialDistance,
				});
				retained.push(taskForce);
			}
			context._aiTaskForcesBySide.set(sideUid, retained);
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
		for (const unit of context.units) {
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
	}
	return {
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
