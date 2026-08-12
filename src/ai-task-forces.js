export const AI_TASK_FORCE_DEFAULTS = Object.freeze({
	RESERVE_SHARE: Object.freeze({
		AGGRESSIVE: 0.1,
		BALANCED: 0.15,
		DEFENSIVE: 0.25,
	}),
	LAUNCH_READINESS: Object.freeze({
		AGGRESSIVE: 0.65,
		BALANCED: 0.75,
		DEFENSIVE: 0.85,
	}),
	CULMINATION_POWER_RATIO: 0.55,
	UNFAVORABLE_STALL_TICKS: 600,
	REGROUP_POWER_RATIO: 0.7,
	REGROUP_PLATEAU_TICKS: 1200,
	CONSOLIDATION_TICKS: 300,
	WITHDRAWAL_ARRIVAL_RADIUS_SQ: 1,
	SPEARHEAD_POWER_SHARE: 0.2,
	SUPPORT_POWER_SHARE: 0.1,
});

/**
 * Durable operational formation owned by one side. Membership and unit roles
 * survive proposal reassessment while the stable signature remains selected.
 * @typedef {Object} AiTaskForce
 * @property {string} id Stable task-force identifier.
 * @property {string} signature Stable plan identity used for reconciliation.
 * @property {string} sideUid Owning side.
 * @property {string} planSignature Strategic plan identity.
 * @property {string} planType Strategic plan type.
 * @property {string|null} theaterId Front/theater identity.
 * @property {{lat:number,lng:number,name?:string}|null} target Operational objective.
 * @property {{lat:number,lng:number,name?:string}|null} objective Objective alias for reports and observers.
 * @property {{lat:number,lng:number,name?:string}|null} stagingAnchor Assembly point.
 * @property {{lat:number,lng:number,name?:string}|null} assemblyArea Current assembly area.
 * @property {Array<{lat:number,lng:number,name?:string}>} route Ordered route anchors.
 * @property {Array<{lat:number,lng:number,name?:string}>} corridor Cached attack corridor.
 * @property {Array<{lat:number,lng:number,name?:string}>} frontage Connected frontage positions.
 * @property {"ASSEMBLING"|"ATTACKING"|"CONSOLIDATING"|"CULMINATED"|"WITHDRAWING"|"REGROUPING"|"COMPLETE"} phase Lifecycle phase.
 * @property {"AGGRESSIVE"|"BALANCED"|"DEFENSIVE"} posture Operational posture.
 * @property {Array<string|number>} assignedUnitIds Sticky formation membership.
 * @property {Record<string,{role:"SPEARHEAD"|"LINE"|"RESERVE"|"SUPPORT",assignedTick:number}>} unitRoles Role by serialized unit id.
 * @property {Array<string|number>} reserveUnitIds Formations held in operational reserve.
 * @property {number} desiredPower Requested combat power.
 * @property {number} launchPower Power when ATTACKING first began.
 * @property {number} currentPower Current assigned combat power.
 * @property {number} peakPower Highest current power observed.
 * @property {number} readiness Current zero-to-one readiness.
 * @property {number} maxAssignedUnits Hard formation-size cap.
 * @property {number} createdTick Creation tick.
 * @property {number} phaseStartedTick Current phase start tick.
 * @property {number} lastProgressTick Last meaningful progress tick.
 * @property {number} lastRecoveryTick Last meaningful regrouping power gain.
 * @property {number} recoveryPower Power at the last meaningful recovery.
 * @property {number} progress Highest objective progress.
 * @property {{lat:number,lng:number,name?:string}|null} withdrawalAnchor Chosen friendly fallback.
 * @property {{fighter:boolean,strike:boolean,sectorId:string|null,target:{lat:number,lng:number,name?:string}|null}|null} supportRequest Existing air support requested for this sector.
 * @property {string|null} completionReason Terminal reason.
 * @property {string|null} outcome Final task-force result after completion.
 * @property {boolean} severeSurprise Whether fresh intel forced culmination.
 * @property {number|null} parentTaskForceId Lineage when a task force is replaced.
 */

/**
 * Serialized unit input used by the pure allocator.
 * @typedef {Object} AiOperationalUnit
 * @property {string|number} id Stable unit identifier.
 * @property {string} sideUid Owning side.
 * @property {string|number|null} [countryId] Sovereign country.
 * @property {string} [countryRole] Coalition role such as PRIMARY or SUPPORT.
 * @property {string} [kind] army, armor, or air.
 * @property {number} [lat] Latitude.
 * @property {number} [lng] Longitude.
 * @property {number} [health] Current health.
 * @property {number} [maxHealth] Maximum health.
 * @property {number} [equipment] Equipment count.
 * @property {boolean} [armorSupported] Whether nearby line formations support armor.
 * @property {boolean} [terrainSuitable] Whether the formation is in suitable spearhead terrain.
 * @property {number} [combatPower] Explicit power override.
 * @property {boolean} [deployed] Whether available for assignment.
 * @property {boolean} [commandEligible] Whether command/economy state permits assignment.
 * @property {string|null} [taskForceId] Existing sticky owner.
 */

function finite(value, fallback = 0) {
	return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function normalizePosture(posture) {
	const value = String(posture || "BALANCED").toUpperCase();
	if (["AGGRESSIVE", "BLITZ"].includes(value)) return "AGGRESSIVE";
	if (["DEFENSIVE", "TURTLE"].includes(value)) return "DEFENSIVE";
	return "BALANCED";
}

function unitKey(id) {
	return String(id);
}

function wrappedDistanceSq(a, b) {
	if (!a || !b) return 0;
	let dLng = finite(a.lng) - finite(b.lng);
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;
	const dLat = finite(a.lat) - finite(b.lat);
	return dLat * dLat + dLng * dLng;
}

function targetAnchor(input) {
	return (
		input.stagingAnchor ||
		input.stagingPoint ||
		input.stagingCells?.[0] ||
		input.target ||
		null
	);
}

export function getAiPostureThresholds(posture) {
	const normalized = normalizePosture(posture);
	return {
		posture: normalized,
		reserveShare: AI_TASK_FORCE_DEFAULTS.RESERVE_SHARE[normalized],
		launchReadiness: AI_TASK_FORCE_DEFAULTS.LAUNCH_READINESS[normalized],
	};
}

export function estimateUnitCombatPower(
	unit,
	{ armorEnabled = true, airPowerEnabled = true } = {},
) {
	if (Number.isFinite(Number(unit.combatPower))) {
		return Math.max(0, Number(unit.combatPower));
	}
	const healthRatio = clamp(
		finite(unit.health, 100) / Math.max(1, finite(unit.maxHealth, 100)),
		0,
		1,
	);
	const kind = String(unit.kind || "army").toLowerCase();
	const equipment = Math.max(0, finite(unit.equipment));
	if (kind === "armor" && armorEnabled) {
		return healthRatio * Math.max(1.5, Math.sqrt(equipment || 1) * 0.55);
	}
	if (kind === "air" && airPowerEnabled) {
		return healthRatio * Math.max(1.25, Math.sqrt(equipment || 1) * 0.45);
	}
	return healthRatio;
}

export function createAiTaskForce(input = {}) {
	const signature = String(
		input.signature || input.planSignature || input.id || "task-force",
	);
	const sideUid = String(input.sideUid ?? "");
	const tick = Math.max(0, Math.trunc(finite(input.tick)));
	const createdTick = Math.max(0, Math.trunc(finite(input.createdTick, tick)));
	const target = input.target || input.objective;
	const stagingAnchor = targetAnchor(input);
	return {
		id: String(input.id || `${sideUid}:${signature}`),
		signature,
		sideUid,
		planSignature: String(input.planSignature || signature),
		planType: String(input.planType || input.type || "PUSH_FRONT"),
		theaterId: input.theaterId == null ? null : String(input.theaterId),
		target: target ? { ...target } : null,
		objective: target ? { ...target } : null,
		stagingAnchor: stagingAnchor ? { ...stagingAnchor } : null,
		assemblyArea: input.assemblyArea
			? { ...input.assemblyArea }
			: stagingAnchor
				? { ...stagingAnchor }
				: null,
		route: (input.route || input.waypoints || input._waypoints || []).map(
			(point) => ({ ...point }),
		),
		corridor: (input.corridor || []).map((point) => ({ ...point })),
		frontage: (input.frontage || []).map((point) => ({ ...point })),
		phase: input.phase || "ASSEMBLING",
		posture: normalizePosture(input.posture),
		assignedUnitIds: [
			...new Set((input.assignedUnitIds || []).map((id) => id)),
		],
		unitRoles: { ...(input.unitRoles || {}) },
		reserveUnitIds: [...(input.reserveUnitIds || [])],
		desiredPower: Math.max(
			1,
			finite(
				input.desiredPower,
				input.allocatedPower || input.maxAssignedUnits || 1,
			),
		),
		launchPower: Math.max(0, finite(input.launchPower)),
		currentPower: Math.max(0, finite(input.currentPower)),
		peakPower: Math.max(0, finite(input.peakPower)),
		readiness: clamp(finite(input.readiness), 0, 1),
		maxAssignedUnits: Math.max(
			1,
			Math.trunc(finite(input.maxAssignedUnits, 5)),
		),
		createdTick,
		phaseStartedTick: Math.max(
			0,
			Math.trunc(finite(input.phaseStartedTick, createdTick)),
		),
		lastProgressTick: Math.max(
			0,
			Math.trunc(finite(input.lastProgressTick, createdTick)),
		),
		lastRecoveryTick: Math.max(
			0,
			Math.trunc(finite(input.lastRecoveryTick, createdTick)),
		),
		recoveryPower: Math.max(0, finite(input.recoveryPower, input.currentPower)),
		progress: clamp(finite(input.progress), 0, 1),
		withdrawalAnchor: input.withdrawalAnchor
			? { ...input.withdrawalAnchor }
			: null,
		supportRequest: input.supportRequest
			? {
					...input.supportRequest,
					target: input.supportRequest.target
						? { ...input.supportRequest.target }
						: null,
				}
			: null,
		completionReason:
			input.completionReason == null ? null : String(input.completionReason),
		outcome: input.outcome == null ? null : String(input.outcome),
		severeSurprise: Boolean(input.severeSurprise),
		parentTaskForceId:
			input.parentTaskForceId == null ? null : String(input.parentTaskForceId),
	};
}

function eligibleUnit(unit, sideUid) {
	if (!unit || String(unit.sideUid) !== sideUid) return false;
	if (unit.deployed === false || unit.commandEligible === false) return false;
	if (finite(unit.health, 100) <= 0) return false;
	return true;
}

export function assignTaskForceRoles(taskForce, units, options = {}) {
	const tick = Math.max(0, Math.trunc(finite(options.tick)));
	const thresholds = getAiPostureThresholds(taskForce.posture);
	const byId = new Map((units || []).map((unit) => [unitKey(unit.id), unit]));
	const members = taskForce.assignedUnitIds
		.map((id) => byId.get(unitKey(id)))
		.filter((unit) => eligibleUnit(unit, taskForce.sideUid));
	members.sort(
		(left, right) =>
			estimateUnitCombatPower(right, options.capabilities) -
				estimateUnitCombatPower(left, options.capabilities) ||
			unitKey(left.id).localeCompare(unitKey(right.id)),
	);
	const powerById = new Map(
		members.map((unit) => [
			unitKey(unit.id),
			estimateUnitCombatPower(unit, options.capabilities),
		]),
	);
	const totalPower = [...powerById.values()].reduce(
		(sum, power) => sum + power,
		0,
	);
	const claimed = new Set();
	const roles = new Map();
	const oldRole = (unit, role) =>
		taskForce.unitRoles[unitKey(unit.id)]?.role === role;
	const claimUntil = (candidates, role, targetPower, strictMaximum = false) => {
		if (targetPower <= 0) return 0;
		let rolePower = 0;
		for (const candidate of candidates) {
			const key = unitKey(candidate.id);
			if (claimed.has(key)) continue;
			const power = powerById.get(key) || 0;
			if (strictMaximum && rolePower > 0 && rolePower + power > targetPower) {
				continue;
			}
			claimed.add(key);
			roles.set(key, role);
			rolePower += power;
			if (rolePower >= targetPower) break;
		}
		return rolePower;
	};
	const weakestFirst = [...members].reverse();
	const reserveCandidates = [
		...weakestFirst.filter((unit) => oldRole(unit, "RESERVE")),
		...weakestFirst.filter(
			(unit) =>
				!oldRole(unit, "RESERVE") &&
				String(unit.countryRole || "PRIMARY").toUpperCase() !== "SUPPORT",
		),
		...weakestFirst.filter(
			(unit) =>
				!oldRole(unit, "RESERVE") &&
				String(unit.countryRole || "PRIMARY").toUpperCase() === "SUPPORT",
		),
	];
	claimUntil(
		reserveCandidates,
		"RESERVE",
		totalPower * thresholds.reserveShare,
	);
	const supportCandidates = [
		...members.filter(
			(unit) =>
				String(unit.countryRole || "PRIMARY").toUpperCase() === "SUPPORT" &&
				oldRole(unit, "SUPPORT"),
		),
		...members.filter(
			(unit) =>
				String(unit.countryRole || "PRIMARY").toUpperCase() === "SUPPORT" &&
				!oldRole(unit, "SUPPORT"),
		),
		...members.filter((unit) => oldRole(unit, "SUPPORT")),
		...members,
	];
	claimUntil(
		supportCandidates,
		"SUPPORT",
		totalPower * AI_TASK_FORCE_DEFAULTS.SUPPORT_POWER_SHARE,
	);
	const spearheadCandidates = [
		...members.filter((unit) => oldRole(unit, "SPEARHEAD")),
		...members
			.filter(
				(unit) =>
					!oldRole(unit, "SPEARHEAD") &&
					String(unit.kind || "army").toLowerCase() === "armor",
			)
			.sort(
				(left, right) =>
					Number(Boolean(right.armorSupported && right.terrainSuitable)) -
						Number(Boolean(left.armorSupported && left.terrainSuitable)) ||
					Number(Boolean(right.armorSupported)) -
						Number(Boolean(left.armorSupported)) ||
					Number(Boolean(right.terrainSuitable)) -
						Number(Boolean(left.terrainSuitable)) ||
					estimateUnitCombatPower(right, options.capabilities) -
						estimateUnitCombatPower(left, options.capabilities),
			),
		...members.filter((unit) => !oldRole(unit, "SPEARHEAD")),
	];
	claimUntil(
		spearheadCandidates,
		"SPEARHEAD",
		totalPower * AI_TASK_FORCE_DEFAULTS.SPEARHEAD_POWER_SHARE,
		true,
	);
	const unitRoles = {};
	for (const member of members) {
		const key = unitKey(member.id);
		const role = roles.get(key) || "LINE";
		const previous = taskForce.unitRoles[key];
		unitRoles[key] = {
			role,
			assignedTick: previous?.role === role ? previous.assignedTick : tick,
		};
	}
	if (
		members.length > 0 &&
		!Object.values(unitRoles).some((assignment) =>
			["LINE", "SPEARHEAD"].includes(assignment.role),
		)
	) {
		const combatMember = [...members].sort(
			(left, right) =>
				estimateUnitCombatPower(right, options.capabilities) -
					estimateUnitCombatPower(left, options.capabilities) ||
				unitKey(left.id).localeCompare(unitKey(right.id)),
		)[0];
		const key = unitKey(combatMember.id);
		unitRoles[key] = {
			role:
				String(combatMember.kind || "army").toLowerCase() === "armor"
					? "SPEARHEAD"
					: "LINE",
			assignedTick: tick,
		};
	}
	return {
		...taskForce,
		unitRoles,
		reserveUnitIds: members
			.filter((member) => unitRoles[unitKey(member.id)]?.role === "RESERVE")
			.map((member) => member.id),
	};
}

export function reconcileAiTaskForces(
	existingTaskForces,
	selectedPlans,
	units,
	options = {},
) {
	const tick = Math.max(0, Math.trunc(finite(options.tick)));
	const existingBySignature = new Map(
		(existingTaskForces || []).map((taskForce) => [
			taskForce.signature,
			taskForce,
		]),
	);
	const usedUnits = new Set();
	const taskForces = [];
	const sortedPlans = [...(selectedPlans || [])].sort(
		(left, right) =>
			finite(right.priority) - finite(left.priority) ||
			String(left.signature || left.planSignature || "").localeCompare(
				String(right.signature || right.planSignature || ""),
			),
	);
	const selectedSignatures = new Set(
		sortedPlans
			.map((plan) =>
				String(plan.signature || plan.planSignature || plan.id || ""),
			)
			.filter(Boolean),
	);
	const stickyOwnerByUnit = new Map();
	for (const taskForce of existingTaskForces || []) {
		if (!selectedSignatures.has(taskForce.signature)) continue;
		for (const unitId of taskForce.assignedUnitIds || []) {
			stickyOwnerByUnit.set(unitKey(unitId), taskForce.signature);
		}
	}
	for (const plan of sortedPlans) {
		const signature = String(
			plan.signature || plan.planSignature || plan.id || "",
		);
		if (!signature) continue;
		const previous = existingBySignature.get(signature);
		let taskForce = previous
			? createAiTaskForce({
					...previous,
					...plan,
					id: previous.id,
					stagingAnchor: previous.stagingAnchor || plan.stagingAnchor,
					assemblyArea: previous.assemblyArea || plan.assemblyArea,
					phase: previous.phase,
					assignedUnitIds: [
						...new Set([
							...previous.assignedUnitIds,
							...(plan.assignedUnitIds || []),
						]),
					],
					unitRoles: previous.unitRoles,
					createdTick: previous.createdTick,
					phaseStartedTick: previous.phaseStartedTick,
					lastProgressTick: previous.lastProgressTick,
					lastRecoveryTick: previous.lastRecoveryTick,
					recoveryPower: previous.recoveryPower,
					launchPower: previous.launchPower,
					peakPower: previous.peakPower,
					progress: previous.progress,
					tick,
				})
			: createAiTaskForce({ ...plan, tick });
		const available = (units || []).filter(
			(unit) =>
				eligibleUnit(unit, taskForce.sideUid) &&
				!usedUnits.has(unitKey(unit.id)) &&
				(!stickyOwnerByUnit.has(unitKey(unit.id)) ||
					stickyOwnerByUnit.get(unitKey(unit.id)) === signature),
		);
		const availableById = new Map(
			available.map((unit) => [unitKey(unit.id), unit]),
		);
		const sticky = taskForce.assignedUnitIds
			.map((id) => availableById.get(unitKey(id)))
			.filter(Boolean);
		sticky.sort(
			(left, right) =>
				taskForce.assignedUnitIds.findIndex(
					(id) => unitKey(id) === unitKey(left.id),
				) -
				taskForce.assignedUnitIds.findIndex(
					(id) => unitKey(id) === unitKey(right.id),
				),
		);
		for (const unit of sticky) usedUnits.add(unitKey(unit.id));
		const anchor =
			taskForce.phase === "WITHDRAWING"
				? taskForce.withdrawalAnchor || taskForce.stagingAnchor
				: taskForce.stagingAnchor || taskForce.target;
		const candidates = available
			.filter((unit) => !usedUnits.has(unitKey(unit.id)))
			.sort(
				(left, right) =>
					wrappedDistanceSq(left, anchor) - wrappedDistanceSq(right, anchor) ||
					estimateUnitCombatPower(right, options.capabilities) -
						estimateUnitCombatPower(left, options.capabilities) ||
					unitKey(left.id).localeCompare(unitKey(right.id)),
			);
		const selected = [...sticky];
		let selectedPower = selected.reduce(
			(sum, unit) => sum + estimateUnitCombatPower(unit, options.capabilities),
			0,
		);
		for (const candidate of candidates) {
			if (selected.length >= taskForce.maxAssignedUnits) break;
			if (selectedPower >= taskForce.desiredPower && selected.length > 0) break;
			selected.push(candidate);
			usedUnits.add(unitKey(candidate.id));
			selectedPower += estimateUnitCombatPower(candidate, options.capabilities);
		}
		taskForce.assignedUnitIds = selected.map((unit) => unit.id);
		taskForce.currentPower = selectedPower;
		taskForce.peakPower = Math.max(taskForce.peakPower, selectedPower);
		taskForce = assignTaskForceRoles(taskForce, selected, {
			tick,
			capabilities: options.capabilities,
		});
		taskForces.push(taskForce);
	}
	return taskForces;
}

export function calculateTaskForceReadiness(taskForce, units, options = {}) {
	const byId = new Map((units || []).map((unit) => [unitKey(unit.id), unit]));
	const members = taskForce.assignedUnitIds
		.map((id) => byId.get(unitKey(id)))
		.filter((unit) => eligibleUnit(unit, taskForce.sideUid));
	const currentPower = members.reduce(
		(sum, unit) => sum + estimateUnitCombatPower(unit, options.capabilities),
		0,
	);
	const anchor = taskForce.stagingAnchor || taskForce.target;
	const radiusSq = Math.max(0, finite(options.assemblyRadiusSq, 2));
	const assembledPower = members.reduce(
		(sum, unit) =>
			sum +
			(wrappedDistanceSq(unit, anchor) <= radiusSq
				? estimateUnitCombatPower(unit, options.capabilities)
				: 0),
		0,
	);
	const commandReadyPower = members.reduce(
		(sum, unit) =>
			sum +
			(unit.commandEligible === false
				? 0
				: estimateUnitCombatPower(unit, options.capabilities)),
		0,
	);
	const desiredPower = Math.max(1, taskForce.desiredPower);
	const readiness = clamp(
		Math.min(1, currentPower / desiredPower) * 0.35 +
			Math.min(1, assembledPower / desiredPower) * 0.5 +
			Math.min(1, commandReadyPower / Math.max(1, currentPower)) * 0.15,
		0,
		1,
	);
	return {
		readiness,
		currentPower,
		assembledPower,
		commandReadyPower,
		assignedCount: members.length,
	};
}

export function selectWithdrawalAnchor(taskForce, anchors, context = {}) {
	const origin = context.origin || taskForce.target || taskForce.stagingAnchor;
	const enemyEstimates = context.enemyEstimates || [];
	const friendlySideUid = taskForce.sideUid;
	const valid = (anchors || [])
		.filter(
			(anchor) =>
				anchor &&
				anchor.passable !== false &&
				anchor.hostile !== true &&
				(anchor.sideUid == null || String(anchor.sideUid) === friendlySideUid),
		)
		.map((anchor) => {
			let nearestEnemySq = Infinity;
			for (const enemy of enemyEstimates) {
				nearestEnemySq = Math.min(
					nearestEnemySq,
					wrappedDistanceSq(anchor, enemy),
				);
			}
			const rearward = Math.max(0, finite(anchor.controlStrength, 1)) * 10;
			const safety = Number.isFinite(nearestEnemySq)
				? Math.min(25, nearestEnemySq)
				: 25;
			const distancePenalty = wrappedDistanceSq(anchor, origin) * 0.15;
			return { anchor, score: rearward + safety - distancePenalty };
		})
		.sort(
			(left, right) =>
				right.score - left.score ||
				String(left.anchor.id || left.anchor.name || "").localeCompare(
					String(right.anchor.id || right.anchor.name || ""),
				),
		);
	return valid[0]?.anchor ? { ...valid[0].anchor } : null;
}

function transition(taskForce, phase, tick, fields = {}) {
	return {
		...taskForce,
		...fields,
		phase,
		phaseStartedTick: tick,
		lastProgressTick: fields.lastProgressTick ?? tick,
	};
}

export function advanceAiTaskForce(taskForce, context = {}) {
	const tick = Math.max(0, Math.trunc(finite(context.tick)));
	const readinessResult = context.readinessResult || {
		readiness: finite(context.readiness, taskForce.readiness),
		currentPower: finite(context.currentPower, taskForce.currentPower),
	};
	const next = {
		...taskForce,
		readiness: clamp(readinessResult.readiness, 0, 1),
		currentPower: Math.max(0, readinessResult.currentPower),
		peakPower: Math.max(taskForce.peakPower, readinessResult.currentPower),
	};
	const progress = clamp(finite(context.progress, next.progress), 0, 1);
	if (progress > next.progress + 0.02) {
		next.progress = progress;
		next.lastProgressTick = tick;
	}
	const thresholds = getAiPostureThresholds(next.posture);
	const severeSurprise = Boolean(context.severeSurprise);
	const unfavorable =
		context.forceRatio == null ? false : finite(context.forceRatio) < 1;
	const defensivePlan = ["DEFEND", "DEFEND_CITY"].includes(
		String(next.planType || "").toUpperCase(),
	);
	const stalledTicks = Math.max(0, tick - next.lastProgressTick);
	if (next.phase === "ASSEMBLING") {
		if (context.cancelled || context.objectiveInvalid) {
			return transition(next, "WITHDRAWING", tick, {
				withdrawalAnchor:
					context.withdrawalAnchor ||
					next.withdrawalAnchor ||
					next.stagingAnchor,
				completionReason: "OBJECTIVE_INVALID",
			});
		}
		if (next.readiness >= thresholds.launchReadiness) {
			return transition(next, "ATTACKING", tick, {
				launchPower: Math.max(0.0001, next.currentPower),
				completionReason: null,
			});
		}
	} else if (next.phase === "ATTACKING") {
		if (context.objectiveAchieved) {
			return transition(next, "CONSOLIDATING", tick, {
				progress: 1,
				completionReason: null,
			});
		}
		const powerRatio = next.currentPower / Math.max(0.0001, next.launchPower);
		if (
			powerRatio < AI_TASK_FORCE_DEFAULTS.CULMINATION_POWER_RATIO ||
			(!defensivePlan &&
				unfavorable &&
				stalledTicks >= AI_TASK_FORCE_DEFAULTS.UNFAVORABLE_STALL_TICKS) ||
			severeSurprise ||
			context.supplyCollapsed ||
			context.encirclementRiskSevere
		) {
			return transition(next, "CULMINATED", tick, {
				severeSurprise,
				completionReason: severeSurprise
					? "SEVERE_SURPRISE"
					: context.supplyCollapsed
						? "SUPPLY_COLLAPSE"
						: context.encirclementRiskSevere
							? "ENCIRCLEMENT_RISK"
							: powerRatio < AI_TASK_FORCE_DEFAULTS.CULMINATION_POWER_RATIO
								? "POWER_LOSS"
								: "UNFAVORABLE_STALL",
			});
		}
	} else if (next.phase === "CONSOLIDATING") {
		if (
			context.consolidationComplete ||
			tick - next.phaseStartedTick >= AI_TASK_FORCE_DEFAULTS.CONSOLIDATION_TICKS
		) {
			return transition(next, "COMPLETE", tick, {
				completionReason: "OBJECTIVE_SECURED",
				outcome: "OBJECTIVE_SECURED",
			});
		}
	} else if (next.phase === "CULMINATED") {
		return transition(next, "WITHDRAWING", tick, {
			withdrawalAnchor:
				context.withdrawalAnchor || next.withdrawalAnchor || next.stagingAnchor,
		});
	} else if (next.phase === "WITHDRAWING") {
		if (context.withdrawalArrived) {
			return transition(next, "REGROUPING", tick, {
				completionReason: null,
				lastRecoveryTick: tick,
				recoveryPower: next.currentPower,
			});
		}
	} else if (next.phase === "REGROUPING") {
		const launchBaseline = Math.max(0.0001, next.launchPower || next.peakPower);
		const meaningfulRecovery = Math.max(0.01, launchBaseline * 0.02);
		if (next.currentPower >= next.recoveryPower + meaningfulRecovery) {
			next.recoveryPower = next.currentPower;
			next.lastRecoveryTick = tick;
		}
		if (
			next.currentPower / launchBaseline >=
				AI_TASK_FORCE_DEFAULTS.REGROUP_POWER_RATIO ||
			tick - next.lastRecoveryTick >=
				AI_TASK_FORCE_DEFAULTS.REGROUP_PLATEAU_TICKS
		) {
			return transition(next, "COMPLETE", tick, {
				completionReason:
					next.currentPower / launchBaseline >=
					AI_TASK_FORCE_DEFAULTS.REGROUP_POWER_RATIO
						? "REGROUPED"
						: "REGROUP_PLATEAU",
				outcome:
					next.currentPower / launchBaseline >=
					AI_TASK_FORCE_DEFAULTS.REGROUP_POWER_RATIO
						? "REGROUPED"
						: "REGROUP_PLATEAU",
			});
		}
	}
	return next;
}

export function cleanupAiTaskForces(taskForces, context = {}) {
	const liveUnitIds = context.liveUnitIds
		? new Set([...context.liveUnitIds].map(unitKey))
		: null;
	const activeSideUids = context.activeSideUids
		? new Set([...context.activeSideUids].map(String))
		: null;
	const keepComplete = Boolean(context.keepComplete);
	return (taskForces || [])
		.filter(
			(taskForce) =>
				(!activeSideUids || activeSideUids.has(taskForce.sideUid)) &&
				(keepComplete || taskForce.phase !== "COMPLETE"),
		)
		.map((taskForce) => {
			if (!liveUnitIds) return taskForce;
			const assignedUnitIds = taskForce.assignedUnitIds.filter((id) =>
				liveUnitIds.has(unitKey(id)),
			);
			const assigned = new Set(assignedUnitIds.map(unitKey));
			return {
				...taskForce,
				assignedUnitIds,
				reserveUnitIds: (taskForce.reserveUnitIds || []).filter((id) =>
					assigned.has(unitKey(id)),
				),
				unitRoles: Object.fromEntries(
					Object.entries(taskForce.unitRoles).filter(([id]) =>
						assigned.has(id),
					),
				),
			};
		});
}

export function createAiTaskForceObserverSnapshot(
	taskForces,
	intelState = null,
	tick = 0,
) {
	return {
		tick: Math.max(0, Math.trunc(finite(tick))),
		taskForces: (taskForces || []).map((taskForce) => ({
			id: taskForce.id,
			signature: taskForce.signature,
			sideUid: taskForce.sideUid,
			planType: taskForce.planType,
			theaterId: taskForce.theaterId,
			target: taskForce.target ? { ...taskForce.target } : null,
			phase: taskForce.phase,
			posture: taskForce.posture,
			assignedUnitIds: [...taskForce.assignedUnitIds],
			unitRoles: { ...taskForce.unitRoles },
			reserveUnitIds: [...(taskForce.reserveUnitIds || [])],
			readiness: taskForce.readiness,
			currentPower: taskForce.currentPower,
			launchPower: taskForce.launchPower,
			progress: taskForce.progress,
			withdrawalAnchor: taskForce.withdrawalAnchor
				? { ...taskForce.withdrawalAnchor }
				: null,
			completionReason: taskForce.completionReason,
			supportRequest: taskForce.supportRequest
				? {
						...taskForce.supportRequest,
						target: taskForce.supportRequest.target
							? { ...taskForce.supportRequest.target }
							: null,
					}
				: null,
			outcome: taskForce.outcome,
		})),
		intel: intelState
			? {
					observerSideUid: intelState.observerSideUid,
					lastScanTick: intelState.lastScanTick,
					contactCount: Object.keys(intelState.contacts || {}).length,
				}
			: null,
	};
}
