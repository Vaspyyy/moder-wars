import { normalizeLongitudeDelta } from "./geographic-math.js";
import { isSimulationPhaseDue } from "./simulation-phase-wheel.js";
/** createAiPlanExecutor owns AI behavior and receives current world state through explicit accessors. */
export function createAiPlanExecutor(context) {
	function shouldReassess(si) {
		const REASSESS_INTERVAL = 300; // sim-ticks (was visual frames; now per-tick)
		const HARD_COOLDOWN = 150; // minimum sim-ticks between reassessments (even forced)
		const FORCED_COOLDOWN = 20; // shorter cooldown for forced reassess — prevents infinite retry loops

		const lastReassess = context._proposalReassessTick[si] || 0;

		// Forced reassess (enemy offensive, plan stall, territory shift): bypass regular
		// cooldown but enforce a short gap to prevent CPU-burning retry cascades
		if (context._planReassessNeeded[si]) {
			const gap = context._simTickCount - lastReassess;
			if (gap >= FORCED_COOLDOWN) {
				if (window.__perf) window.__perf.reassess_forced++;
				return true;
			}
			// Flag stays set; will retry in FORCED_COOLDOWN ticks
			return false;
		}

		// Hard cooldown: prevent eval-block spam
		if (context._simTickCount - lastReassess < HARD_COOLDOWN) return false;

		// Stagger first reassessment per side to avoid all 70 sides firing on the
		// same tick — spreads reassessments across 140 ticks (70 sides × 2 offset)
		if (
			lastReassess === 0 &&
			context._simTickCount < HARD_COOLDOWN + (si % (HARD_COOLDOWN / 2)) * 2
		) {
			return false;
		}
		let result = false;

		if (context._simTickCount - lastReassess >= REASSESS_INTERVAL) {
			result = true;
			if (window.__perf) window.__perf.reassess_interval++;
		}
		if (!context._warPlan[si]) {
			result = true;
			if (window.__perf) window.__perf.reassess_noPlan++;
		}

		// Territory change >2%
		const sideCountries = context.sides[si];
		if (sideCountries) {
			let cur = 0;
			for (const c of sideCountries) {
				const stats = context.latestCountryStats.get(c.id);
				if (stats) cur += stats.controlled || 0;
			}
			const prev = context._sidePrevControlled[si] || 0;
			if (
				!result &&
				prev > 0 &&
				Math.abs(cur - prev) / Math.max(1, cur) > 0.02
			) {
				result = true;
				if (window.__perf) window.__perf.reassess_territory++;
			}
			context._sidePrevControlled[si] = cur;
		}

		// Posture change
		const curPosture = context._sidePosture[si] || "BALANCED";
		const prevPosture = context._sidePrevPosture[si];
		if (!result && prevPosture !== undefined && prevPosture !== curPosture) {
			result = true;
			if (window.__perf) window.__perf.reassess_posture++;
		}
		context._sidePrevPosture[si] = curPosture;

		// Force ratio change >20%
		const ourUnits = context._tickUnitsBySide[si]
			? context._tickUnitsBySide[si].reduce(
					(sum, unit) =>
						unit.health > 0 && unit.deployTicks <= 0
							? sum + context.operationalUnitPower(unit)
							: sum,
					0,
				)
			: 0;
		const totalEnemyUnits = context.getKnownEnemyPowerForSide(si);
		const curRatio =
			totalEnemyUnits > 0 ? ourUnits / totalEnemyUnits : Infinity;
		const prevRatio = context._sidePrevStrengthRatio[si];
		if (
			!result &&
			prevRatio !== undefined &&
			prevRatio > 0 &&
			Number.isFinite(curRatio)
		) {
			if (Math.abs(curRatio - prevRatio) / Math.max(0.01, prevRatio) > 0.2) {
				result = true;
				if (window.__perf) window.__perf.reassess_ratio++;
			}
		}
		context._sidePrevStrengthRatio[si] = curRatio;

		return result;
	}

	function evaluateAllPlans() {
		// ── Reassessment: run the proposal pipeline when triggers fire ──
		const _tp = performance.now();
		// Detect all sides that need new plans, but only generate proposals for one
		// side per simulation tick. Proposal generation contains bounded pathfinding
		// and coastal analysis; spreading it across ticks prevents several coalitions
		// from creating the same main-thread spike without changing queue order.
		for (let si = 0; si < context.sides.length; si++) {
			if (!context.sides[si] || context.sides[si].length === 0) continue;
			if (context._pendingProposalSideSet.has(si)) continue;
			if (shouldReassess(si)) {
				context._pendingProposalSides.push(si);
				context._pendingProposalSideSet.add(si);
			}
		}

		const si = context._pendingProposalSides.shift();
		if (si !== undefined) {
			context._pendingProposalSideSet.delete(si);
			if (context.sides[si] && context.sides[si].length > 0) {
				window.__perf.proposalRuns++;
				const forceReplace = !!context._planReassessNeeded[si];

				context._planReassessNeeded[si] = false;
				const proposals = context.generateAllProposals(si);

				// Score each proposal
				for (const p of proposals) {
					p.priority = context.scoreProposal(p, si);
				}

				// Select and apply plans
				const selected = context.selectPlans(si, proposals);

				// Apply land plans to _warPlan slots
				// Only overwrite on forced reassessment; otherwise fill gaps

				if (selected.land1 && !context._warPlan[si]) {
					context._warPlan[si] = selected.land1;
				}
				if (selected.land2) {
					const lSlot2 = si + context.sides.length;
					if (!context._warPlan[lSlot2]) {
						context._warPlan[lSlot2] = selected.land2;
					}
				}

				// Apply naval / supply plans — naval plans have their own lifecycle
				// and should not be force-replaced just because a land plan triggered reassessment
				if (selected.naval) {
					if (!context._navalPlan[si]) {
						context._navalPlan[si] = selected.naval;
					} else if (forceReplace) {
						// Only replace if current naval plan is truly stalled (>1200 ticks no progress)
						const nptsp =
							context.simFrameCount -
							(context._navalPlan[si].lastProgressTick ||
								context.simFrameCount);
						const nptss =
							context.simFrameCount -
							(context._navalPlan[si].startedTick || context.simFrameCount);
						if (nptsp > 1200 && nptss > 1200) {
							for (const u of context._tickUnitsBySide[si] || []) {
								if (u.navalAssigned) {
									u.navalAssigned = false;
									u.isTransport = false;
								}
							}
							context._navalPlan[si] = selected.naval;
						}
					}
				}
				if (selected.supply && !context._navalSupplyPlan[si]) {
					context._navalSupplyPlan[si] = selected.supply;
				}

				// Apply coastal defense plans
				if (selected.coastal && selected.coastal.length > 0) {
					for (let ci = 0; ci < selected.coastal.length; ci++) {
						const slot = si * 10 + ci;
						context._coastalDefensePlan[slot] = selected.coastal[ci];
					}
				}

				// Apply neutral garrison plans
				if (selected.garrisons && selected.garrisons.length > 0) {
					for (let gi = 0; gi < selected.garrisons.length; gi++) {
						const slot = si * 10 + gi;
						context._neutralGarrisonPlan[slot] = selected.garrisons[gi];
					}
				}

				// Apply transport plan
				if (selected.transport) {
					if (!context._transportPlan[si] || forceReplace) {
						context._transportPlan[si] = selected.transport;
					}
				}

				// Track failed proposals (standard reassessment interval handles retry)
				if (!context._warPlan[si]) {
					window.__perf.proposalFailed++;
				}

				const selectedDebugPlans = [
					selected.land1,
					selected.land2,
					selected.naval,
					selected.defend,
					selected.transport,
				].filter(Boolean);
				const selectedDebugSignatures = new Set(
					selectedDebugPlans.map(
						(p) => p.signature || context.getPlanSignature(si, p),
					),
				);
				context._aiDebugPlans[si] = {
					tick: context.simFrameCount,
					strategy: context.getSideStrategyProfile(si).dominant,
					selected: {
						land1: selected.land1,
						land2: selected.land2,
						naval: selected.naval,
						defend: selected.defend,
						transport: selected.transport,
					},
					topRejected: proposals
						.filter(
							(p) =>
								!selectedDebugSignatures.has(context.getPlanSignature(si, p)),
						)
						.sort((a, b) => (b.priority || 0) - (a.priority || 0))
						.slice(0, 5)
						.map((p) => ({
							type: p.type,
							target: p.target?.name || "",
							priority: p.priority || 0,
							theaterId: p.theaterId,
							scoreBreakdown: p.scoreBreakdown,
						})),
					fronts: (context._frontIntelBySide[si] || [])
						.slice(0, 4)
						.map((f) => ({
							pairKey: f.pairKey,
							enemySide: f.enemySide,
							localRatio: f.localRatio,
							pressureScore: f.pressureScore,
							friendlies: f.friendlies,
							enemies: f.enemies,
						})),
				};
				context._proposalReassessTick[si] = context._simTickCount;
			}
		}
		window.__perf.proposals =
			(window.__perf.proposals || 0) + performance.now() - _tp;

		// Reset plan activeUnitCount every tick (cheap, no unit iteration)
		for (let _ri = 0; _ri < context.sides.length; _ri++) {
			if (!context.sides[_ri] || context.sides[_ri].length === 0) continue;
			if (context._warPlan[_ri]) context._warPlan[_ri].activeUnitCount = 0;
			const _l2 = _ri + context.sides.length;
			if (context._warPlan[_l2]) context._warPlan[_l2].activeUnitCount = 0;
			if (context._navalPlan[_ri]) {
				context._navalPlan[_ri].activeUnitCount = 0;
			}
			if (context._navalSupplyPlan[_ri])
				context._navalSupplyPlan[_ri].activeUnitCount = 0;
			if (context._transportPlan[_ri])
				context._transportPlan[_ri].activeUnitCount = 0;
			if (context._defenderReactionPlan[_ri])
				context._defenderReactionPlan[_ri].activeUnitCount = 0;
			for (let _ci = 0; _ci < 10; _ci++) {
				const _cp = context._coastalDefensePlan[_ri * 10 + _ci];
				if (_cp) _cp.activeUnitCount = 0;
				const _gp = context._neutralGarrisonPlan[_ri * 10 + _ci];
				if (_gp) _gp.activeUnitCount = 0;
			}
		}

		const _te = performance.now();
		if (isSimulationPhaseDue(context._simTickCount, 5, 2)) {
			// ── Naval Plan Evaluation ──
			for (let si = 0; si < context.sides.length; si++) {
				if (!context.sides[si] || context.sides[si].length === 0) continue;
				const np = context._navalPlan[si];
				if (!np) {
					// Don't force reassessment — naval plans are optional; the 300-tick interval handles it
					continue;
				}

				// Reset per-tick counter
				np.activeUnitCount = 0;

				const ticksSinceStart =
					context.simFrameCount - (np.startedTick || context.simFrameCount);
				const ticksSinceProgress =
					context.simFrameCount -
					(np.lastProgressTick || context.simFrameCount);

				// Check if target is captured
				if (np.target) {
					const tIdx = context.getGridIndex(np.target.lat, np.target.lng);
					if (tIdx !== -1 && context.dominantSideMap[tIdx] === si) {
						// Target captured — clear naval plan
						context._navalPlan[si] = null;
						continue;
					}
				}

				// Stall detection: if stalled for 30s, cancel naval plan
				if (
					ticksSinceProgress > context.NAVAL_STALL_TICKS &&
					ticksSinceStart > context.NAVAL_STALL_TICKS
				) {
					// Release all assigned units
					for (const u of context._tickUnitsBySide[si] || []) {
						if (u.navalAssigned) {
							u.navalAssigned = false;
							u.isTransport = false;
						}
					}
					context._navalPlan[si] = null;
					context._planReassessNeeded[si] = true;
					continue;
				}

				// Phase transitions
				if (np.phase === "GATHERING") {
					// Count how many naval units are near staging point
					let gathered = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.navalAssigned) continue;
						const sdLat = np.stagingPoint.lat - u.lat;
						const sdLng = normalizeLongitudeDelta(np.stagingPoint.lng - u.lng);
						if (sdLat * sdLat + sdLng * sdLng < 0.5) gathered++;
					}
					// Force advance if gathering takes too long (staging point on land, ships loop)
					if (
						gathered >= Math.min(np.maxAssignedUnits, 5) ||
						ticksSinceProgress > context.NAVAL_STALL_TICKS
					) {
						np.phase = "EMBARKATION";
						np.lastProgressTick = context.simFrameCount;
					}
				} else if (np.phase === "EMBARKATION") {
					// Check if most naval units are at sea
					let atSea = 0;
					let total = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.navalAssigned) continue;
						total++;
						const gi = context.getGridIndex(u.lat, u.lng);
						if (gi === -1 || context.landMask[gi] === 0) atSea++;
					}
					if (total > 0 && atSea >= Math.ceil(total * 0.6)) {
						np.phase = "TRANSIT";
						np.lastProgressTick = context.simFrameCount;
					}
				} else if (np.phase === "TRANSIT") {
					// Check if naval units are reaching the target coast
					let landed = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.navalAssigned) continue;
						const gi = context.getGridIndex(u.lat, u.lng);
						if (gi !== -1 && context.landMask[gi] > 0) {
							const tdLat = np.target.lat - u.lat;
							const tdLng = normalizeLongitudeDelta(np.target.lng - u.lng);
							if (tdLat * tdLat + tdLng * tdLng < 2.0) landed++;
						}
					}
					if (landed >= 3) {
						np.phase = "LANDING";
						np.lastProgressTick = context.simFrameCount;
						// Immediately generate supply plan for the landing
						if (!context._navalSupplyPlan[si])
							context._planReassessNeeded[si] = true;
					}
				} else if (np.phase === "LANDING") {
					// After enough time in landing, the plan completes
					if (ticksSinceProgress > 900) {
						// Count enemies within 5 degrees of the landing zone
						let _nearEnemies = 0;
						let _nearFriendlies = 0;
						for (const u of context.units) {
							if (u.deployTicks > 0) continue;
							const dLat = np.target.lat - u.lat;
							const dLng = normalizeLongitudeDelta(np.target.lng - u.lng);
							const dSq = dLat * dLat + dLng * dLng;
							if (dSq < 25.0) {
								if (u.sideIndex === si) _nearFriendlies++;
								else _nearEnemies++;
							}
						}

						// Release naval-assigned units so they join the new land plan
						const landingUnitIds = [];
						for (const u of context._tickUnitsBySide[si] || []) {
							if (u.navalAssigned) {
								const gridIndex = context.getGridIndex(u.lat, u.lng);
								if (
									u.health > 0 &&
									gridIndex >= 0 &&
									context.landMask[gridIndex] > 0
								) {
									landingUnitIds.push(u.id);
								}
								u.navalAssigned = false;
								u.isTransport = false;
							}
						}
						if (context.sideUids[si]) {
							context._aiPendingLandingHandoffs.set(context.sideUids[si], {
								anchor: {
									lat: np.target.lat,
									lng: np.target.lng,
									name: np.target.name || "Naval beachhead",
								},
								unitIds: landingUnitIds,
								tick: context._simTickCount,
								frame: context.simFrameCount,
							});
							context._aiOperationsDirty = true;
						}
						context._navalPlan[si] = null;

						context._planReassessNeeded[si] = true;
					}
				}
			}

			// ── Naval Supply Plan Evaluation ──
			for (let si = 0; si < context.sides.length; si++) {
				if (!context.sides[si] || context.sides[si].length === 0) continue;
				const sp = context._navalSupplyPlan[si];

				if (!sp) {
					// Don't force reassessment — naval supply plans are optional; the 300-tick interval handles it
					continue;
				}

				sp.activeUnitCount = 0;

				// If the parent naval plan is gone, let supply finish independently

				const ticksSinceProgress =
					context.simFrameCount -
					(sp.lastProgressTick || context.simFrameCount);

				// Stall detection
				if (ticksSinceProgress > context.NAVAL_STALL_TICKS) {
					// line 8745
					for (const u of context._tickUnitsBySide[si] || []) {
						if (u.supplyAssigned) {
							u.supplyAssigned = false;
							u.isTransport = false;
						}
					}
					context._navalSupplyPlan[si] = null;
					context._planReassessNeeded[si] = true;
					continue;
				}

				// Phase transitions (mirrors naval invasion: GATHERING -> EMBARKATION -> TRANSIT -> DELIVERED)
				if (sp.phase === "GATHERING") {
					let gathered = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.supplyAssigned) continue;
						const sdLat = sp.stagingPoint.lat - u.lat;
						const sdLng = normalizeLongitudeDelta(sp.stagingPoint.lng - u.lng);
						if (sdLat * sdLat + sdLng * sdLng < 0.5) gathered++;
					}
					if (
						gathered >= Math.min(sp.maxAssignedUnits, 3) ||
						ticksSinceProgress > context.NAVAL_STALL_TICKS
					) {
						sp.phase = "EMBARKATION";
						sp.lastProgressTick = context.simFrameCount;
					}
				} else if (sp.phase === "EMBARKATION") {
					let atSea = 0;
					let total = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.supplyAssigned) continue;
						total++;
						const gi = context.getGridIndex(u.lat, u.lng);
						if (gi === -1 || context.landMask[gi] === 0) atSea++;
					}
					if (total > 0 && atSea >= Math.ceil(total * 0.6)) {
						sp.phase = "TRANSIT";
						sp.lastProgressTick = context.simFrameCount;
					}
				} else if (sp.phase === "TRANSIT") {
					let landed = 0;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u.supplyAssigned) continue;
						const gi = context.getGridIndex(u.lat, u.lng);
						if (gi !== -1 && context.landMask[gi] > 0) {
							const tdLat = sp.target.lat - u.lat;
							const tdLng = normalizeLongitudeDelta(sp.target.lng - u.lng);
							if (tdLat * tdLat + tdLng * tdLng < 2.0) landed++;
						}
					}
					if (landed >= 2) {
						sp.phase = "DELIVERED";
						sp.lastProgressTick = context.simFrameCount;
					}
				} else if (sp.phase === "DELIVERED") {
					if (ticksSinceProgress > context.NAVAL_STALL_TICKS) {
						for (const u of context._tickUnitsBySide[si] || []) {
							if (u.supplyAssigned) {
								u.supplyAssigned = false;
								u.isTransport = false;
							}
						}
						context._navalSupplyPlan[si] = null;
					}
				}

				if (sp) sp.lastProgressTick = context.simFrameCount;
			}

			// ── Coastal Defense Plan Evaluation ──
			for (let si = 0; si < context.sides.length; si++) {
				for (let ci = 0; ci < 10; ci++) {
					const slot = si * 10 + ci;
					const cp = context._coastalDefensePlan[slot];
					if (!cp) continue;
					cp.activeUnitCount = 0;
					if (cp.target) {
						const tIdx = context.getGridIndex(cp.target.lat, cp.target.lng);
						if (tIdx !== -1 && context.dominantSideMap[tIdx] !== si) {
							for (const u of context._tickUnitsBySide[si] || []) {
								if (u.coastalAssigned) u.coastalAssigned = false;
							}
							context._coastalDefensePlan[slot] = null;
							continue;
						}
					}
					// Decay threat flags after 900 ticks (~15s)
					if (
						cp.threatenedTick &&
						context.simFrameCount - cp.threatenedTick > 900
					) {
						cp.threatenedByTransit = false;
						cp.threatenedByGathering = false;
						delete cp.threatContact;
						delete cp.threatenedTick;
					}
				}
			}

			// ── Neutral Garrison Plan Evaluation ──
			for (let si = 0; si < context.sides.length; si++) {
				for (let gi = 0; gi < 10; gi++) {
					const slot = si * 10 + gi;
					const gp = context._neutralGarrisonPlan[slot];
					if (!gp) continue;
					gp.activeUnitCount = 0;
					// Cancel if the neutral country has joined a side (became combatant)
					if (
						gp.neutralCountryId != null &&
						context._tickCountryToSideMap.get(gp.neutralCountryId) !== undefined
					) {
						for (const u of context._tickUnitsBySide[si] || []) {
							if (u.garrisonAssigned) u.garrisonAssigned = false;
						}
						context._neutralGarrisonPlan[slot] = null;
					}
				}
			}

			// ── Proactive Detection: Enemy TRANSIT & GATHERING near our coast ──

			// ── Defender Reaction (Structured) ──
			for (let si = 0; si < context.sides.length; si++) {
				if (!context.sides[si] || context.sides[si].length === 0) continue;
				const rp = context._defenderReactionPlan[si];

				// ---- Cancel stale / obsolete reaction plans ----
				if (rp) {
					const enemyNP =
						rp.enemySideIdx != null
							? context._navalPlan[rp.enemySideIdx]
							: null;
					const enemySideDead =
						rp.enemySideIdx != null &&
						(!context.sides[rp.enemySideIdx] ||
							context.sides[rp.enemySideIdx].length === 0);

					let shouldCancel = false;
					if (enemySideDead || !enemyNP) {
						shouldCancel = true;
					} else if (rp._landingDefeatedTick) {
						if (
							context.simFrameCount - rp._landingDefeatedTick >
							context.NAVAL_STALL_TICKS
						)
							shouldCancel = true;
					}

					if (
						!shouldCancel &&
						context.simFrameCount - rp.lastProgressTick > 1800
					) {
						shouldCancel = true;
					}

					if (shouldCancel) {
						for (const u of context._tickUnitsBySide[si] || []) {
							u._defenderReactTarget = null;
						}
						context._defenderReactionPlan[si] = null;
					}
				}

				// Track arrivals: units within 1° of target clear their flag
				if (context._defenderReactionPlan[si]) {
					context._defenderReactionPlan[si].activeUnitCount = 0;
					let anyArrived = false;
					for (const u of context._tickUnitsBySide[si] || []) {
						if (!u._defenderReactTarget) continue;
						context._defenderReactionPlan[si].activeUnitCount++;
						const rdLat = u._defenderReactTarget.lat - u.lat;
						const rdLng = normalizeLongitudeDelta(
							u._defenderReactTarget.lng - u.lng,
						);
						if (rdLat * rdLat + rdLng * rdLng < 1.0) {
							u._defenderReactTarget = null;
							anyArrived = true;
						}
					}
					if (anyArrived) {
						context._defenderReactionPlan[si].lastProgressTick =
							context.simFrameCount;
					}
				}
				// Check both naval and land threats from enemies
			}
		}

		// ── Orphan _defenderReactTarget Cleanup ──
		for (const u of context.units) {
			if (
				u._defenderReactTarget &&
				!context._defenderReactionPlan[u.sideIndex]
			) {
				u._defenderReactTarget = null;
			}
		}

		// Clean up plans for inactive sides
		// Land plans use indices 0..sides.length-1 (slot 1) and
		// sides.length..sides.length*2-1 (slot 2). Only null beyond slot 2.
		for (
			let si = context.sides.length * 2;
			si < context._warPlan.length;
			si++
		) {
			context._warPlan[si] = null;
		}
		for (let si = context.sides.length; si < context._navalPlan.length; si++) {
			// Release any assigned units
			for (const u of context.units) {
				if (u.navalAssigned) {
					u.navalAssigned = false;
					u.isTransport = false;
				}
			}
			context._navalPlan[si] = null;
		}
		for (
			let si = context.sides.length;
			si < context._navalSupplyPlan.length;
			si++
		) {
			for (const u of context.units) {
				if (u.supplyAssigned) {
					u.supplyAssigned = false;
					u.isTransport = false;
				}
			}
			context._navalSupplyPlan[si] = null;
		}
		for (
			let si = context.sides.length;
			si < context._transportPlan.length;
			si++
		) {
			context._transportPlan[si] = null;
		}
		for (
			let si = context.sides.length * 10;
			si < context._coastalDefensePlan.length;
			si++
		) {
			for (const u of context.units) {
				if (u.coastalAssigned) u.coastalAssigned = false;
			}
			context._coastalDefensePlan[si] = null;
		}
		for (
			let si = context.sides.length * 10;
			si < context._neutralGarrisonPlan.length;
			si++
		) {
			for (const u of context._tickUnitsBySide[si] || []) {
				if (u.garrisonAssigned) u.garrisonAssigned = false;
			}
			context._neutralGarrisonPlan[si] = null;
		}
		for (
			let si = context.sides.length;
			si < context._defenderReactionPlan.length;
			si++
		) {
			for (const u of context._tickUnitsBySide[si] || []) {
				u._defenderReactTarget = null;
			}
			context._defenderReactionPlan[si] = null;
		}
		window.__perf.eval = (window.__perf.eval || 0) + performance.now() - _te;
	}
	return { shouldReassess, evaluateAllPlans };
}
