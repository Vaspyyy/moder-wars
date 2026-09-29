import { CONFIG } from "./config.js";

/** createAiPlanner owns AI behavior and receives current world state through explicit accessors. */
export function createAiPlanner(context) {
	function getSideStrategyProfile(sideIdx) {
		const sideCountries = context.sides[sideIdx] || [];
		const weights = {
			TURTLE: 0,
			DEFENSIVE: 0,
			BALANCED: 0,
			AGGRESSIVE: 0,
			BLITZ: 0,
		};
		for (const country of sideCountries) {
			const strategy = (country.strategy || "BALANCED").toUpperCase();
			const stats = context.latestCountryStats.get(country.id);
			const weight = Math.max(1, stats?.units || country.initialCells || 1);
			weights[strategy] = (weights[strategy] || 0) + weight;
		}
		let dominant = "BALANCED";
		let bestWeight = -1;
		for (const [strategy, weight] of Object.entries(weights)) {
			if (weight > bestWeight) {
				bestWeight = weight;
				dominant = strategy;
			}
		}
		return {
			dominant,
			weights,
			aggression:
				(weights.BLITZ * 1.0 +
					weights.AGGRESSIVE * 0.75 +
					weights.BALANCED * 0.45 +
					weights.DEFENSIVE * 0.2) /
				Math.max(
					1,
					Object.values(weights).reduce((sum, v) => sum + v, 0),
				),
		};
	}

	function estimateLocalForces(sideIdx, lat, lng, radiusSq = 9) {
		let friendlies = 0,
			enemies = 0,
			friendlyHealth = 0,
			enemyHealth = 0;
		const visit = (unit) => {
			if (
				unit.health <= 0 ||
				unit.deployTicks > 0 ||
				context.geoDistSq(unit.lat, unit.lng, lat, lng) > radiusSq
			)
				return;
			if (unit.sideIndex === sideIdx) {
				friendlies++;
				friendlyHealth += context.operationalUnitPower(unit);
			} else if (context.areSidesHostile(sideIdx, unit.sideIndex)) {
				enemies++;
				enemyHealth += context.operationalUnitPower(unit);
			}
		};
		if (context.unitSpatialHash.size) {
			const radius = Math.sqrt(radiusSq);
			const columns = Math.ceil(360 / context.UNIT_HASH_CELL_SIZE);
			const x0 = Math.floor((lng - radius + 180) / context.UNIT_HASH_CELL_SIZE);
			const x1 = Math.floor((lng + radius + 180) / context.UNIT_HASH_CELL_SIZE);
			const y0 = Math.max(
				0,
				Math.floor((lat - radius + 90) / context.UNIT_HASH_CELL_SIZE),
			);
			const y1 = Math.min(
				Math.floor(180 / context.UNIT_HASH_CELL_SIZE),
				Math.floor((lat + radius + 90) / context.UNIT_HASH_CELL_SIZE),
			);
			for (let x = x0; x <= x1; x++)
				for (let y = y0; y <= y1; y++) {
					for (const unit of context.unitSpatialHash.get(
						(((x % columns) + columns) % columns) * 100 + y,
					) || [])
						visit(unit);
				}
		} else {
			for (const unit of context.units) visit(unit);
		}
		return {
			friendlies,
			enemies,
			friendlyHealth,
			enemyHealth,
			ratio: friendlyHealth / Math.max(0.25, enemyHealth),
		};
	}

	function operationalLocalRisk(local) {
		const ourForcesNear = local.friendlyHealth;
		const enemyForcesNear = local.enemyHealth;
		return {
			enemyForcesNear,
			ourForcesNear,
			enemyCounterWeight:
				enemyForcesNear / Math.max(0.25, ourForcesNear + enemyForcesNear),
		};
	}

	function canTraverseLandForPlan(idx, sideIdx, targetIdx) {
		if (idx === targetIdx) return true;
		if (
			idx < 0 ||
			idx >= context.landMask.length ||
			context.landMask[idx] === 0
		)
			return false;
		const ds = context.dominantSideMap[idx];
		const targetSide = targetIdx >= 0 ? context.dominantSideMap[targetIdx] : -1;
		if (ds === sideIdx || ds === -1) return true;
		return (
			targetSide >= 0 &&
			ds === targetSide &&
			context.areSidesHostile(sideIdx, targetSide)
		);
	}

	function acquirePlanBfsBuffers(total) {
		if (context._planBfsSeen.length !== total) {
			context._planBfsSeen = new Uint32Array(total);
			context._planBfsParent = new Int32Array(total);
			context._planBfsQueue = new Int32Array(total);
			context._planBfsGeneration = 0;
		}
		context._planBfsGeneration = (context._planBfsGeneration + 1) >>> 0;
		if (context._planBfsGeneration === 0) {
			context._planBfsSeen.fill(0);
			context._planBfsGeneration = 1;
		}
		return {
			seen: context._planBfsSeen,
			parent: context._planBfsParent,
			queue: context._planBfsQueue,
			generation: context._planBfsGeneration,
		};
	}

	function findLandPathSummary(
		startIdx,
		targetIdx,
		sideIdx,
		maxVisited = 70000,
	) {
		if (startIdx === -1 || targetIdx === -1) return { reachable: false };
		if (!canTraverseLandForPlan(startIdx, sideIdx, targetIdx)) {
			const startRow = Math.floor(startIdx / context.gridWidth);
			const startCol = startIdx % context.gridWidth;
			let replacement = -1;
			let replacementDist = Infinity;
			for (let dr = -3; dr <= 3; dr++) {
				for (let dc = -3; dc <= 3; dc++) {
					const row = startRow + dr;
					const col = startCol + dc;
					if (
						row < 0 ||
						row >= context.gridHeight ||
						col < 0 ||
						col >= context.gridWidth
					)
						continue;
					const idx = row * context.gridWidth + col;
					if (!canTraverseLandForPlan(idx, sideIdx, targetIdx)) continue;
					const dSq = dr * dr + dc * dc;
					if (dSq < replacementDist) {
						replacementDist = dSq;
						replacement = idx;
					}
				}
			}
			if (replacement === -1) return { reachable: false };
			startIdx = replacement;
		}
		const total = context.landMask.length;
		const { seen, parent, queue, generation } = acquirePlanBfsBuffers(total);
		let head = 0;
		let tail = 0;
		let visited = 0;
		queue[tail++] = startIdx;
		seen[startIdx] = generation;
		parent[startIdx] = -1;
		const offsets = [1, -1, context.gridWidth, -context.gridWidth];
		while (head < tail && visited < maxVisited) {
			const cur = queue[head++];
			visited++;
			if (cur === targetIdx) {
				const waypoints = [];
				let walk = cur;
				let steps = 0;
				while (walk !== -1 && walk !== startIdx && steps < 2048) {
					if (steps === 12 || steps === 30 || steps === 60) {
						const r = Math.floor(walk / context.gridWidth);
						const c = walk % context.gridWidth;
						waypoints.unshift({
							lat: r * CONFIG.GRID_RES - 90,
							lng: c * CONFIG.GRID_RES - 180,
						});
					}
					walk = parent[walk];
					steps++;
				}
				return {
					reachable: true,
					visited,
					distanceCells: steps,
					waypoints: waypoints.slice(0, 3),
				};
			}
			const col = cur % context.gridWidth;
			for (const off of offsets) {
				if (
					(off === 1 && col === context.gridWidth - 1) ||
					(off === -1 && col === 0)
				) {
					continue;
				}
				const ni = cur + off;
				if (ni < 0 || ni >= total || seen[ni] === generation) continue;
				if (!canTraverseLandForPlan(ni, sideIdx, targetIdx)) continue;
				seen[ni] = generation;
				parent[ni] = cur;
				if (tail < queue.length) queue[tail++] = ni;
			}
		}
		return {
			reachable: false,
			visited,
			distanceCells: Infinity,
			waypoints: [],
		};
	}

	function findNearestSeaIdx(idx, radius = 6) {
		if (idx < 0 || idx >= context.landMask.length) return -1;
		const row0 = Math.floor(idx / context.gridWidth);
		const col0 = idx % context.gridWidth;
		let best = -1;
		let bestDist = Infinity;
		for (let dr = -radius; dr <= radius; dr++) {
			for (let dc = -radius; dc <= radius; dc++) {
				const row = row0 + dr;
				const col = col0 + dc;
				if (
					row < 0 ||
					row >= context.gridHeight ||
					col < 0 ||
					col >= context.gridWidth
				)
					continue;
				const ni = row * context.gridWidth + col;
				if (context.landMask[ni] !== 0) continue;
				const dSq = dr * dr + dc * dc;
				if (dSq < bestDist) {
					bestDist = dSq;
					best = ni;
				}
			}
		}
		return best;
	}

	function findSeaPathSummary(startIdx, targetIdx, maxVisited = 120000) {
		if (startIdx === -1 || targetIdx === -1) return { reachable: false };
		if (context.landMask[startIdx] !== 0 || context.landMask[targetIdx] !== 0) {
			return { reachable: false };
		}
		const total = context.landMask.length;
		const { seen, queue, generation } = acquirePlanBfsBuffers(total);
		let head = 0;
		let tail = 0;
		let visited = 0;
		let distanceCells = 0;
		queue[tail++] = startIdx;
		seen[startIdx] = generation;
		const offsets = [1, -1, context.gridWidth, -context.gridWidth];
		while (head < tail && visited < maxVisited) {
			const levelEnd = tail;
			while (head < levelEnd) {
				const cur = queue[head++];
				visited++;
				if (cur === targetIdx) {
					return { reachable: true, visited, distanceCells };
				}
				const col = cur % context.gridWidth;
				for (const off of offsets) {
					if (
						(off === 1 && col === context.gridWidth - 1) ||
						(off === -1 && col === 0)
					) {
						continue;
					}
					const ni = cur + off;
					if (
						ni < 0 ||
						ni >= total ||
						seen[ni] === generation ||
						context.landMask[ni] !== 0
					)
						continue;
					seen[ni] = generation;
					if (tail < queue.length) queue[tail++] = ni;
				}
			}
			distanceCells++;
		}
		return { reachable: false, visited, distanceCells: Infinity };
	}

	function getPlanSignature(sideIdx, planLike) {
		const target = planLike?.target;
		const lat = target ? Math.round(target.lat * 2) / 2 : 0;
		const lng = target ? Math.round(target.lng * 2) / 2 : 0;
		const identity = planLike?.victimId != null ? `:${planLike.victimId}` : "";
		return `${sideIdx}:${planLike?.type || "UNKNOWN"}${identity}:${lat}:${lng}`;
	}

	function getProposalMemory(sideIdx, proposal) {
		return context._aiPlanMemory.get(getPlanSignature(sideIdx, proposal));
	}

	function recordPlanOutcome(sideIdx, plan, outcome) {
		if (!plan) return;
		if (outcome !== "started" && plan._terminalOutcomeRecorded) return;
		if (outcome !== "started") plan._terminalOutcomeRecorded = outcome;
		const key = plan.signature || getPlanSignature(sideIdx, plan);
		const previous = context._aiPlanMemory.get(key) || {
			attempts: 0,
			successes: 0,
			failures: 0,
		};
		const next = {
			...previous,
			type: plan.type,
			targetName: plan.target?.name || previous.targetName || "",
			lastTick: context.simFrameCount,
			attempts: previous.attempts + (outcome === "started" ? 1 : 0),
			successes: previous.successes + (outcome === "success" ? 1 : 0),
			failures: previous.failures + (outcome === "failed" ? 1 : 0),
			lastOutcome: outcome,
		};
		context._aiPlanMemory.set(key, next);
		const eventType = {
			started: "AI_PLAN_STARTED",
			success: "AI_PLAN_SUCCEEDED",
			failed: "AI_PLAN_FAILED",
			replaced: "AI_PLAN_REPLACED",
		}[outcome];
		const retainLegacyEvent = ["NAVAL_INVASION", "NAVAL_SUPPLY"].includes(
			plan.type,
		);
		if (eventType && retainLegacyEvent) {
		}
	}

	function scoreProposal(proposal, sideIdx) {
		const strategyProfile = getSideStrategyProfile(sideIdx);
		const strategy = strategyProfile.dominant;
		const sideUnits = context._tickUnitsBySide[sideIdx] || [];

		const friendlyCombatPower = sideUnits.reduce(
			(sum, unit) =>
				unit.deployTicks === 0 && unit.health > 0
					? sum + context.operationalUnitPower(unit)
					: sum,
			0,
		);
		const enemyUnitCount = context.getKnownEnemyPowerForSide(sideIdx);
		const globalForceRatio =
			friendlyCombatPower / Math.max(0.25, enemyUnitCount);
		const geo = proposal.geographicData || {};
		const risk = proposal.riskAssessment || {};
		const localForceRatio =
			risk.ourForcesNear != null || risk.enemyForcesNear != null
				? (risk.ourForcesNear || 0) / Math.max(1, risk.enemyForcesNear || 0)
				: globalForceRatio;
		const effectiveForceRatio =
			globalForceRatio * 0.35 + localForceRatio * 0.65;
		const front = proposal.frontIntel;
		const memory = getProposalMemory(sideIdx, proposal);
		let score = 0;

		// ── Strategic Value (0–40) ──
		if (proposal.type === "CAPTURE_CITY") {
			if (proposal.target?.isCapital) score += 30;
			else score += 10;
			score += Math.sqrt(Math.max(0, geo.minLandDist || 0)) * 3;
		}
		if (proposal.type === "NAVAL_INVASION") {
			score += Math.sqrt(Math.max(0, geo.minLandDist || 0)) * 3;
			const seaDist = Math.sqrt(geo.minSeaDist || 1);
			if (seaDist > 3 && seaDist < 20) score += 15;
		}
		if (proposal.type === "COASTAL_DEFENSE") {
			score += (proposal.threatScore || 0) * 25;
		}
		if (proposal.type === "NEUTRAL_GARRISON") {
			score += Math.min(20, (proposal.borderLength || 0) * 0.3);
		}
		if (proposal.type === "DEFEND") {
			score += 10;
			if (globalForceRatio < 1.0) score += 15;
		}
		if (proposal.type === "ENCIRCLE") {
			score += 25;
		}
		if (proposal.type === "PUSH_FRONT") {
			score += 15;
		}
		if (proposal.type === "NAVAL_SUPPLY") {
			score += 20;
		}
		if (proposal.type === "TRANSPORT") {
			score += 25 + Math.min(30, (proposal.strandedCount || 0) * 2);
			// Transport is logistics, not combat — immune to force ratio penalties
			score *= 1.2; // mild universal boost
			proposal.scoreBreakdown = {
				strategy,
				globalForceRatio,
				localForceRatio,
				effectiveForceRatio,
				memory,
			};
			return Math.round(score * 100) / 100;
		}

		if (front) {
			if (proposal.type === "PUSH_FRONT" || proposal.type === "ENCIRCLE") {
				score += Math.min(25, Math.max(0, front.pressureScore * 0.25));
			}
			if (proposal.type === "DEFEND") {
				score += Math.min(
					20,
					front.enemies * 0.5 + front.friendlyCitiesThreatened * 6,
				);
			}
			if (proposal.type === "CAPTURE_CITY") {
				score += Math.min(18, front.enemyCitiesNear * 5 + front.localRatio * 4);
			}
		}

		// ── Feasibility (0–30) ──
		if (effectiveForceRatio >= 2.0) score += 20;
		else if (effectiveForceRatio >= 1.0) score += 10;
		else score -= 15;

		if (geo.reachesTarget) score += 10;
		else score -= 30;

		// ── Risk (0–20, inverted) ──
		if (effectiveForceRatio >= 4.0) score += 20;
		else if (effectiveForceRatio >= 2.5) score += 10;
		else score -= 20;
		score -= Math.min(15, (risk.enemyCounterWeight || 0) * 15);

		// ── Urgency (0–10) ──
		// Enemy naval landing on our territory boosts COASTAL_DEFENSE
		let enemyLandedOnUs = false;
		for (let ei = 0; ei < context.sides.length; ei++) {
			if (!context.areSidesHostile(sideIdx, ei)) continue;
			const plan = context._navalPlan[ei];
			const idx = plan?.target
				? context.getGridIndex(plan.target.lat, plan.target.lng)
				: -1;
			if (
				plan?.phase === "LANDING" &&
				idx >= 0 &&
				context.dominantSideMap[idx] === sideIdx
			)
				enemyLandedOnUs = true;
		}

		if (enemyLandedOnUs && proposal.type === "COASTAL_DEFENSE") {
			score += 20;
		}

		// ── Posture / Strategy alignment multiplier ──
		const isOffensive = [
			"CAPTURE_CITY",
			"ENCIRCLE",
			"PUSH_FRONT",
			"NAVAL_INVASION",
		].includes(proposal.type);
		const isDefensive = [
			"DEFEND",
			"COASTAL_DEFENSE",
			"NEUTRAL_GARRISON",
		].includes(proposal.type);

		const multipliers = {
			BLITZ: { offensive: 1.4, defensive: 0.4 },
			AGGRESSIVE: { offensive: 1.3, defensive: 0.5 },
			BALANCED: { offensive: 1.0, defensive: 1.0 },
			DEFENSIVE: { offensive: 0.4, defensive: 1.4 },
			TURTLE: { offensive: 0.0, defensive: 1.5 },
		};
		const mult = multipliers[strategy] || multipliers.BALANCED;
		// TURTLE: only permit offensive plans when we have overall force advantage
		if (strategy === "TURTLE" && globalForceRatio >= 1.0) {
			mult.offensive = 0.3;
		}
		if (isOffensive) score *= mult.offensive;
		else if (isDefensive) score *= mult.defensive;

		if (strategy === "BLITZ" && isOffensive) {
			if (front?.localRatio >= 1.6) score *= 1.18;
			if ((geo.pathDistanceCells || 0) > 120) score *= 0.85;
		}
		if (
			strategy === "AGGRESSIVE" &&
			isOffensive &&
			effectiveForceRatio >= 0.9
		) {
			score *= 1.08;
		}
		if (strategy === "DEFENSIVE" && proposal.type === "CAPTURE_CITY") {
			score *=
				proposal.target?.isCapital && effectiveForceRatio >= 1.5 ? 0.9 : 0.65;
		}
		if (strategy === "TURTLE" && isOffensive && effectiveForceRatio < 1.6) {
			score *= 0.05;
		}

		if (memory?.lastOutcome === "failed") score *= 0.7;
		if (memory?.lastOutcome === "success") score *= 1.1;
		if (memory?.failures > memory?.successes + 1) score *= 0.55;

		// ── Special modifiers ──
		if (proposal.type === "CAPTURE_CITY" && !geo.reachesTarget) {
			score *= 0.1;
		}
		// Boost naval proposals when no land connection exists
		if (
			!context._frontlinePolys ||
			Object.keys(context._frontlinePolys).length === 0
		) {
			if (
				isOffensive &&
				proposal.type !== "CAPTURE_CITY" &&
				proposal.type !== "ENCIRCLE"
			) {
				score *= 1.3;
			}
		}

		proposal.scoreBreakdown = {
			strategy,
			globalForceRatio,
			localForceRatio,
			effectiveForceRatio,
			front: front
				? {
						pairKey: front.pairKey,
						enemySide: front.enemySide,
						localRatio: front.localRatio,
						pressureScore: front.pressureScore,
					}
				: null,
			memory,
		};
		return Math.round(score * 100) / 100;
	}

	function selectPlans(sideIdx, scoredProposals) {
		if (!scoredProposals || scoredProposals.length === 0) return {};

		const strategyProfile = getSideStrategyProfile(sideIdx);
		const strategy = strategyProfile.dominant;
		const sideUnits = context._tickUnitsBySide[sideIdx] || [];
		const unitCount = sideUnits.filter((u) => u.deployTicks === 0).length;

		// Force allocation by strategy
		const alloc = {
			BLITZ: { offense: 0.85, defense: 0.1, reserve: 0.05 },
			AGGRESSIVE: { offense: 0.75, defense: 0.2, reserve: 0.05 },
			BALANCED: { offense: 0.5, defense: 0.4, reserve: 0.1 },
			DEFENSIVE: { offense: 0.25, defense: 0.65, reserve: 0.1 },
			TURTLE: { offense: 0.0, defense: 0.9, reserve: 0.1 },
		}[strategy] || { offense: 0.5, defense: 0.4, reserve: 0.1 };

		// TURTLE: only allocate offense when we have force advantage
		if (strategy === "TURTLE") {
			const turtleEnemyCount = context.getKnownEnemyPowerForSide(sideIdx);
			if (unitCount >= turtleEnemyCount) {
				alloc.offense = 0.3;
				alloc.defense = 0.6;
			}
		}

		const totalForce = Math.max(1, unitCount);
		const offensiveForce = Math.floor(totalForce * alloc.offense);
		const defensiveForce = Math.floor(totalForce * alloc.defense);

		// Sort by priority descending
		const sorted = [...scoredProposals].sort(
			(a, b) => (b.priority || 0) - (a.priority || 0),
		);

		// Group proposals by type
		const offensives = sorted.filter(
			(p) =>
				["CAPTURE_CITY", "ENCIRCLE", "PUSH_FRONT"].includes(p.type) &&
				(p.priority || 0) > 0,
		);
		const navals = sorted.filter(
			(p) => p.type === "NAVAL_INVASION" && (p.priority || 0) > 0,
		);
		const supplies = sorted.filter(
			(p) => p.type === "NAVAL_SUPPLY" && (p.priority || 0) > 0,
		);
		const defs = sorted.filter(
			(p) => p.type === "DEFEND" && (p.priority || 0) > 0,
		);
		const coastals = sorted.filter(
			(p) => p.type === "COASTAL_DEFENSE" && (p.priority || 0) > 0,
		);
		const garrisons = sorted.filter(
			(p) => p.type === "NEUTRAL_GARRISON" && (p.priority || 0) > 0,
		);

		const transports = sorted.filter(
			(p) => p.type === "TRANSPORT" && (p.priority || 0) > 0,
		);

		const result = {};

		// ── Land offensive slot 1 ──

		const land1 = offensives[0];
		// ── Land offensive slot 2 ──
		let land2 = null;
		if (!land2 && land1 && offensives.length > 1) {
			const secondCandidates = offensives.slice(1);
			const differentTheater = secondCandidates.find(
				(p) => p.theaterId && p.theaterId !== land1.theaterId,
			);
			const second = differentTheater || secondCandidates[0];
			const minSecondRatio = differentTheater ? 0.3 : 0.6;
			if ((second.priority || 0) >= (land1.priority || 1) * minSecondRatio) {
				const sameTheater =
					land1.theaterId &&
					second.theaterId &&
					land1.theaterId === second.theaterId;
				// Check direction conflict
				if (
					land1.target &&
					second.target &&
					land1.arrowPoints &&
					second.arrowPoints
				) {
					const d1Lat = land1.target.lat - land1.arrowPoints[0].lat;
					let d1Lng = land1.target.lng - land1.arrowPoints[0].lng;
					const d2Lat = second.target.lat - second.arrowPoints[0].lat;
					let d2Lng = second.target.lng - second.arrowPoints[0].lng;
					if (d1Lng > 180) d1Lng -= 360;
					else if (d1Lng < -180) d1Lng += 360;
					if (d2Lng > 180) d2Lng -= 360;
					else if (d2Lng < -180) d2Lng += 360;
					const m1 = Math.sqrt(d1Lat * d1Lat + d1Lng * d1Lng);
					const m2 = Math.sqrt(d2Lat * d2Lat + d2Lng * d2Lng);
					const dot =
						m1 > 0 && m2 > 0 ? (d1Lat * d2Lat + d1Lng * d2Lng) / (m1 * m2) : 0;
					if (
						dot <= 0.85 &&
						(!sameTheater || second.priority >= land1.priority * 0.85)
					) {
						land2 = second;
					}
				} else {
					if (!sameTheater || second.priority >= land1.priority * 0.85) {
						land2 = second;
					}
				}
			}
		}

		// ── Naval invasion slot ──
		const naval1 = navals[0];

		// ── Supply slot ──
		const supply1 = supplies[0];

		// ── Defensive slot ──
		const defend1 = defs.find((proposal) => proposal !== null);

		// ── Coastal defense zones ──
		const selectedCoastal = coastals.filter((p) => (p.threatScore || 0) >= 0.1);

		// ── Neutral garrisons ──
		const selectedGarr = garrisons;
		// ── Occupation garrisons ──

		// ── Force allocation ──
		const selectedOff = [
			land1,
			land2 !== null ? land2 : null,
			naval1,
			supply1,
		].filter(Boolean);
		const offSum = selectedOff.reduce((s, p) => s + (p.priority || 0), 0);
		// Count local enemies near each target and scale force accordingly

		for (const p of selectedOff) {
			p.allocatedForce =
				offSum > 0
					? Math.ceil(offensiveForce * ((p.priority || 0) / offSum))
					: 0;
			// Scale by local enemy presence
			const localRisk = p.riskAssessment || {};
			const localEnemiesFromRisk = localRisk.enemyForcesNear || 0;
			p.allocatedForce = Math.max(
				p.allocatedForce,
				Math.ceil((p.estimatedForceNeeded || 0) * 0.8),
				Math.ceil(localEnemiesFromRisk * 1.25),
			);
			p.allocatedForce = Math.min(
				p.allocatedForce,
				Math.max(3, Math.ceil(totalForce * 0.75)),
			);
		}

		const selectedDef = [
			null,
			defend1,
			...selectedCoastal,
			...selectedGarr,
		].filter(Boolean);
		const defSum = selectedDef.reduce((s, p) => s + (p.priority || 0), 0);
		for (const p of selectedDef) {
			p.allocatedForce =
				defSum > 0
					? Math.ceil(defensiveForce * ((p.priority || 0) / defSum))
					: 0;
		}
		// Ensure minimum force
		for (const p of selectedOff) {
			if (p.allocatedForce < 3) p.allocatedForce = Math.min(3, offensiveForce);
		}
		for (const p of selectedDef) {
			if (p.allocatedForce < 3) p.allocatedForce = Math.min(3, defensiveForce);
		}

		// ── Convert to plan objects ──
		const makePlan = (p, phase) => {
			const targetIndex = p.target
				? context.getGridIndex(p.target.lat, p.target.lng)
				: -1;
			const targetSideIndex = Number.isInteger(p.targetSideIndex)
				? p.targetSideIndex
				: targetIndex >= 0 && context.dominantSideMap[targetIndex] >= 0
					? context.dominantSideMap[targetIndex]
					: Number.isInteger(p.frontIntel?.enemySide)
						? p.frontIntel.enemySide
						: -1;
			const targetCountryId =
				p.targetCountryId ||
				p.target?.ownerId ||
				(targetIndex >= 0 ? context.worldControlMap[targetIndex] : null);
			const plan = {
				type: p.type,
				phase,
				target: p.target,
				targetCountryId,
				targetSideUid: context.sideUids[targetSideIndex],
				stagingCells: p.stagingCells || [],
				arrowPoints: p.arrowPoints,
				frontlinePoints: p.frontlinePoints,
				_waypoints: p._waypoints || [],
				stagingPoint: p.stagingPoint,
				zonePolyline: p.zonePolyline,
				borderPolyline:
					p.combatantCountryId != null
						? context._neutralBorderPolys[p.combatantCountryId]
						: null,
				neutralCountryId: p.neutralCountryId,
				victimId: p.victimId,
				annexerId: p.annexerId,
				garrisonPoints: p.garrisonPoints,
				requiredGarrison: p.requiredGarrison,
				garrisonDeficit: p.garrisonDeficit || 0,
				garrisonCoverage: p.garrisonCoverage || 0,
				resistance: p.resistance || 0,
				startedTick: context.simFrameCount,
				lastProgressTick: context.simFrameCount,
				progress: 0,
				signature: getPlanSignature(sideIdx, p),
				priority: p.priority || 0,
				theaterId: p.theaterId,
				scoreBreakdown: p.scoreBreakdown,
				riskAssessment: p.riskAssessment,
				frontIntel: p.frontIntel
					? {
							pairKey: p.frontIntel.pairKey,
							enemySide: p.frontIntel.enemySide,
							localRatio: p.frontIntel.localRatio,
							pressureScore: p.frontIntel.pressureScore,
							weakPoint: p.frontIntel.weakPoint,
						}
					: null,
				maxAssignedUnits: p.allocatedForce || 5,
				activeUnitCount: 0,
			};
			recordPlanOutcome(sideIdx, plan, "started");
			return plan;
		};

		if (land1) result.land1 = makePlan(land1, "EXECUTION");
		if (land2) result.land2 = makePlan(land2, "EXECUTION");
		if (naval1) result.naval = makePlan(naval1, "GATHERING");
		if (supply1) result.supply = makePlan(supply1, "GATHERING");
		if (defend1) result.defend = makePlan(defend1, "EXECUTION");
		result.coastal = selectedCoastal.map((p) => makePlan(p, "EXECUTION"));
		result.garrisons = selectedGarr.map((p) => makePlan(p, "EXECUTION"));

		if (transports[0]) result.transport = makePlan(transports[0], "EXECUTION");

		return result;
	}
	return {
		getSideStrategyProfile,
		estimateLocalForces,
		operationalLocalRisk,
		canTraverseLandForPlan,
		acquirePlanBfsBuffers,
		findLandPathSummary,
		findNearestSeaIdx,
		findSeaPathSummary,
		getPlanSignature,
		getProposalMemory,
		recordPlanOutcome,
		scoreProposal,
		selectPlans,
	};
}
