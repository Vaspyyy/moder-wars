// Movement/combat consumes this formation's tactical decision snapshot.
export function executeGroundTarget(input) {
	const {
		u,
		simFrameCount,
		_detailedPerfEnabled,
		_u3,
		isAtSea,
		CONFIG,
		isMyTerritory,
		gridIdxNow,
		myInfluenceAt,
		speedBuffMult,
		aiProfile,
		frame,
		_warPlan,
		sides,
		_navalPlan,
		_navalSupplyPlan,
		hasOperationalAssignment,
		shouldMopUp,
		retreatVector,
		localEnemyCount,
		borderDir,
		_overwhelmingForce,
		sideIndex,
		groupCentroid,
		currentIdx,
		isNeutralCountry,
		getGridIndex,
		isEncircled,
		isEffectivelyMyLand,
		isTooNearBorder,
		isMega,
		isSuper,
		geoDistSq,
		normalizeLongitudeDelta,
		_unitGridIdx,
		dominantSideMap,
		gridHeight,
		gridWidth,
		landMask,
		_transportPlan,
		pocketContained,
		_frontlinePolys,
		isEnemyTerritory,
		worldControlMap,
		countryToSideMap,
		areSidesHostile,
		role,
		damageTakenMult,
		recordDamage,
		isNeutral,
		sideVictoryRatios,
		countryObj,
		deJureMap,
		damageDealtMult,
		getLiveFormationStrength,
		currentControl,
		_theaterCitiesBySovereign,
	} = input;
	let {
		target,
		_u4,
		planSpeedMult,
		planDirLat,
		planDirLng,
		isPlanUnit,
		enemyCentroidLat,
		enemyCentroidLng,
	} = input;

	// Spatial Jitter: Add a small, unit-specific offset to the target destination
	// to prevent multiple units from converging on the exact same coordinate.
	const jitterScale = 0.08;
	const jitterLat = target.lat + Math.sin(u.id * 100) * jitterScale;
	const jitterLng = target.lng + Math.cos(u.id * 100) * jitterScale;

	const dLat = jitterLat - u.lat;
	let dLng = jitterLng - u.lng;

	// GLOBAL WRAP: Shortest path around the world
	if (dLng > 180) dLng -= 360;
	else if (dLng < -180) dLng += 360;

	const dist = Math.sqrt(dLat * dLat + dLng * dLng);

	const isEngaged = u.lastCombatTick && simFrameCount - u.lastCombatTick < 15;

	// ── unitLoop sub-timer checkpoint: end retreatMopUp, start combatMove ──
	_u4 = _detailedPerfEnabled ? performance.now() : 0;
	if (_detailedPerfEnabled) window.__perf.unitRetreatMopUp += _u4 - _u3;

	if (dist > 0.05) {
		// Movement logic
		const baseSpeed = isAtSea ? CONFIG.UNIT_NAVAL_SPEED : CONFIG.UNIT_SPEED;

		// Roaming Prevention: Removed exploratory wiggle to force a focused linear push
		const landSpeedBuff =
			!isAtSea &&
			isMyTerritory(gridIdxNow, u.sideIndex) &&
			myInfluenceAt(gridIdxNow, u.sideIndex) > 0.5
				? 1.8
				: 1.2;
		const speedMult = landSpeedBuff * speedBuffMult * aiProfile.speedMult;

		frame.moveDirLat = dLat / dist;
		frame.moveDirLng = dLng / dist;

		// ── War Plan Movement: override direction based on active plan ──
		planSpeedMult = 1.0;
		planDirLat = 0;
		planDirLng = 0;
		isPlanUnit = false;
		let activePlan = _warPlan[u.sideIndex];
		const plan1 = activePlan;
		const plan1Signature = plan1?.signature;
		let activePlanSignature = plan1Signature;
		// Land slot 2: keep sticky plan ownership first, otherwise pick the
		// closer offensive plan if one exists.
		const slot2Plan = _warPlan[u.sideIndex + sides.length];
		const slot2Signature = slot2Plan?.signature;
		if (slot2Plan && slot2Plan.type !== "DEFEND") {
			if (u._assignedPlanSignature === slot2Signature) {
				activePlan = slot2Plan;
				activePlanSignature = slot2Signature;
			} else if (u._assignedPlanSignature === plan1Signature) {
				activePlan = plan1;
				activePlanSignature = plan1Signature;
			} else {
				if (u._assignedPlanSignature) u._assignedPlanSignature = null;
				const getPlanAnchor = (plan) =>
					plan?.frontIntel?.weakPoint || plan?.arrowPoints?.[0] || plan?.target;
				const p1Anchor = getPlanAnchor(activePlan);
				const p2Anchor = getPlanAnchor(slot2Plan);
				const d1 = p1Anchor
					? geoDistSq(u.lat, u.lng, p1Anchor.lat, p1Anchor.lng)
					: Infinity;
				const d2 = p2Anchor
					? geoDistSq(u.lat, u.lng, p2Anchor.lat, p2Anchor.lng)
					: Infinity;
				if (d2 < d1) {
					activePlan = slot2Plan;
					activePlanSignature = slot2Signature;
				}
			}
		} else if (
			u._assignedPlanSignature &&
			u._assignedPlanSignature !== plan1Signature
		) {
			u._assignedPlanSignature = null;
		}

		const navalPlan = _navalPlan[u.sideIndex];
		const supplyPlan = _navalSupplyPlan[u.sideIndex];

		// Naval plan assignment: if this unit is close to staging coast and
		// the naval plan needs units, recruit it
		let isNavalUnit = false;

		if (
			navalPlan &&
			navalPlan.type === "NAVAL_INVASION" &&
			!hasOperationalAssignment &&
			!shouldMopUp &&
			!retreatVector &&
			!isEngaged &&
			!u.garrisonAssigned &&
			(navalPlan.activeUnitCount || 0) < (navalPlan.maxAssignedUnits || 0)
		) {
			if (u.navalAssigned) {
				isNavalUnit = true;
			} else {
				const sdLat = navalPlan.stagingPoint.lat - u.lat;
				const sdLng = normalizeLongitudeDelta(
					navalPlan.stagingPoint.lng - u.lng,
				);
				const sdSq = sdLat * sdLat + sdLng * sdLng;
				if (sdSq < 4.0) {
					// Within ~2 degrees of staging coast AND on friendly territory
					const uGI = _unitGridIdx.get(u);
					if (uGI === -1 || dominantSideMap[uGI] !== u.sideIndex) return false;
					u.navalAssigned = true;
					isNavalUnit = true;
				}
			}
		}

		if (
			isNavalUnit &&
			navalPlan &&
			(navalPlan.activeUnitCount || 0) < (navalPlan.maxAssignedUnits || 0)
		) {
			isPlanUnit = true;
			navalPlan.activeUnitCount = (navalPlan.activeUnitCount || 0) + 1;
			u.isTransport = true;

			if (navalPlan.phase === "GATHERING") {
				// Move toward staging point on friendly coast
				const sdLat = navalPlan.stagingPoint.lat - u.lat;
				const sdLng = normalizeLongitudeDelta(
					navalPlan.stagingPoint.lng - u.lng,
				);
				const sd = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
				if (sd > 0.01) {
					planDirLat = sdLat / sd;
					planDirLng = sdLng / sd;
				}
				planSpeedMult = 2.0;
			} else if (navalPlan.phase === "EMBARKATION") {
				// Move toward nearest water tile
				if (!isAtSea) {
					// Find nearest water cell
					let bestWDist = Infinity;
					let bestWLat = 0;
					let bestWLng = 0;
					const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
					const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
					for (let dr = -3; dr <= 3; dr++) {
						for (let dc = -3; dc <= 3; dc++) {
							const nr = r + dr;
							const nc = c + dc;
							if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
								continue;
							const ni = nr * gridWidth + nc;
							if (landMask[ni] !== 0) continue;
							const wlat = nr * CONFIG.GRID_RES - 90;
							const wlng = nc * CONFIG.GRID_RES - 180;
							const ddLng = normalizeLongitudeDelta(wlng - u.lng);
							const dd = (u.lat - wlat) ** 2 + ddLng ** 2;
							if (dd < bestWDist) {
								bestWDist = dd;
								bestWLat = wlat;
								bestWLng = wlng;
							}
						}
					}
					if (bestWDist < Infinity) {
						const dd = Math.sqrt(bestWDist);
						planDirLat = (bestWLat - u.lat) / dd;
						const ddLng = normalizeLongitudeDelta(bestWLng - u.lng);
						planDirLng = ddLng / dd;
					}
				}
				planSpeedMult = 2.0;
			} else if (navalPlan.phase === "TRANSIT") {
				// Sail toward target coast with mild land avoidance
				const tdLat = navalPlan.target.lat - u.lat;
				const tdLng = normalizeLongitudeDelta(navalPlan.target.lng - u.lng);
				const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
				if (td > 0.01) {
					planDirLat = tdLat / td;
					planDirLng = tdLng / td;
					const lookDist = CONFIG.UNIT_NAVAL_SPEED * 2;
					const checkLat = u.lat + planDirLat * lookDist;
					const checkLng = u.lng + planDirLng * lookDist;
					const checkIdx = getGridIndex(checkLat, checkLng);
					if (checkIdx !== -1 && landMask[checkIdx] > 0) {
						let bestDLat = planDirLat;
						let bestDLng = planDirLng;
						let bestScore = -Infinity;
						for (const ang of [-30, 30, -60, 60]) {
							const rad = (ang * Math.PI) / 180;
							const nx =
								planDirLat * Math.cos(rad) - planDirLng * Math.sin(rad);
							const ny =
								planDirLat * Math.sin(rad) + planDirLng * Math.cos(rad);
							let wc = 0;
							for (let s = 1; s <= 3; s++) {
								const si = getGridIndex(
									u.lat + nx * lookDist * s,
									u.lng + ny * lookDist * s,
								);
								if (si === -1 || landMask[si] === 0) wc++;
							}
							const dotProduct = nx * planDirLat + ny * planDirLng;
							const score = wc * 2 + dotProduct * 3;
							if (wc > 0 && score > bestScore) {
								bestScore = score;
								bestDLat = nx;
								bestDLng = ny;
							}
						}
						planDirLat = bestDLat;
						planDirLng = bestDLng;
						const mag = Math.sqrt(
							planDirLat * planDirLat + planDirLng * planDirLng,
						);
						if (mag > 0) {
							planDirLat /= mag;
							planDirLng /= mag;
						}
					}
				}
				planSpeedMult = 2.5;
			} else if (navalPlan.phase === "LANDING") {
				// Push inland from landing point
				u.isTransport = false;
				const tdLat = navalPlan.target.lat - u.lat;
				const tdLng = normalizeLongitudeDelta(navalPlan.target.lng - u.lng);
				const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
				if (td > 0.01) {
					planDirLat = tdLat / td;
					planDirLng = tdLng / td;
				} else {
					// At beachhead: keep advancing inland along approach path
					planDirLat = Math.sign(tdLat) || 0;
					planDirLng = Math.sign(tdLng) || 0;
					const uGI = _unitGridIdx.get(u) ?? -1;
					if (uGI !== -1 && landMask[uGI] !== 0) {
						u.navalAssigned = false;
						u._landedAt = simFrameCount;
					}
				}
				planSpeedMult = 1.5;
			}
			navalPlan.progress = isAtSea
				? 0.5
				: navalPlan.phase === "LANDING"
					? 0.8
					: 0.3;
			frame.moveDirLat = 0;
			frame.moveDirLng = 0;
		} else if (
			supplyPlan &&
			supplyPlan.type === "NAVAL_SUPPLY" &&
			!hasOperationalAssignment &&
			!shouldMopUp &&
			!retreatVector &&
			!isEngaged &&
			!u.garrisonAssigned &&
			!u.navalAssigned &&
			((supplyPlan.activeUnitCount || 0) < (supplyPlan.maxAssignedUnits || 0) ||
				(navalPlan && navalPlan.phase === "LANDING"))
		) {
			// Supply plan assignment
			let isSupplyUnit = false;
			if (u.supplyAssigned) {
				isSupplyUnit = true;
			} else {
				const sdLat = supplyPlan.stagingPoint.lat - u.lat;
				const sdLng = normalizeLongitudeDelta(
					supplyPlan.stagingPoint.lng - u.lng,
				);
				const sdSq = sdLat * sdLat + sdLng * sdLng;
				if (sdSq < 64.0) {
					u.supplyAssigned = true;
					isSupplyUnit = true;
				}
			}

			if (isSupplyUnit) {
				isPlanUnit = true;
				supplyPlan.activeUnitCount = (supplyPlan.activeUnitCount || 0) + 1;
				u.isTransport = true;

				if (supplyPlan.phase === "GATHERING") {
					const sdLat = supplyPlan.stagingPoint.lat - u.lat;
					const sdLng = normalizeLongitudeDelta(
						supplyPlan.stagingPoint.lng - u.lng,
					);
					const sd = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
					if (sd > 0.01) {
						planDirLat = sdLat / sd;
						planDirLng = sdLng / sd;
					}
					planSpeedMult = 2.0;
				} else if (supplyPlan.phase === "EMBARKATION" && !isAtSea) {
					let bestWDist = Infinity;
					let bestWLat = 0;
					let bestWLng = 0;
					const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
					const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
					for (let dr = -3; dr <= 3; dr++) {
						for (let dc = -3; dc <= 3; dc++) {
							const nr = r + dr;
							const nc = c + dc;
							if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
								continue;
							const ni = nr * gridWidth + nc;
							if (landMask[ni] !== 0) continue;
							const wlat = nr * CONFIG.GRID_RES - 90;
							const wlng = nc * CONFIG.GRID_RES - 180;
							const ddLng = normalizeLongitudeDelta(wlng - u.lng);
							const dd = (u.lat - wlat) ** 2 + ddLng ** 2;
							if (dd < bestWDist) {
								bestWDist = dd;
								bestWLat = wlat;
								bestWLng = wlng;
							}
						}
					}
					if (bestWDist < Infinity) {
						const dd = Math.sqrt(bestWDist);
						planDirLat = (bestWLat - u.lat) / dd;
						const ddLng = normalizeLongitudeDelta(bestWLng - u.lng);
						planDirLng = ddLng / dd;
					}
					planSpeedMult = 2.0;
				} else if (supplyPlan.phase === "TRANSIT") {
					const tdLat = supplyPlan.target.lat - u.lat;
					const tdLng = normalizeLongitudeDelta(supplyPlan.target.lng - u.lng);
					const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
					if (td > 0.01) {
						planDirLat = tdLat / td;
						planDirLng = tdLng / td;
						const lookDist = CONFIG.UNIT_NAVAL_SPEED * 2;
						const checkLat = u.lat + planDirLat * lookDist;
						const checkLng = u.lng + planDirLng * lookDist;
						const checkIdx = getGridIndex(checkLat, checkLng);
						if (checkIdx !== -1 && landMask[checkIdx] > 0) {
							let bestDLat = planDirLat;
							let bestDLng = planDirLng;
							let bestScore = -Infinity;
							for (const ang of [-30, 30, -60, 60]) {
								const rad = (ang * Math.PI) / 180;
								const nx =
									planDirLat * Math.cos(rad) - planDirLng * Math.sin(rad);
								const ny =
									planDirLat * Math.sin(rad) + planDirLng * Math.cos(rad);
								let wc = 0;
								for (let s = 1; s <= 3; s++) {
									const si = getGridIndex(
										u.lat + nx * lookDist * s,
										u.lng + ny * lookDist * s,
									);
									if (si === -1 || landMask[si] === 0) wc++;
								}
								const dotProduct = nx * planDirLat + ny * planDirLng;
								const score = wc * 2 + dotProduct * 3;
								if (wc > 0 && score > bestScore) {
									bestScore = score;
									bestDLat = nx;
									bestDLng = ny;
								}
							}
							planDirLat = bestDLat;
							planDirLng = bestDLng;
							const mag = Math.sqrt(
								planDirLat * planDirLat + planDirLng * planDirLng,
							);
							if (mag > 0) {
								planDirLat /= mag;
								planDirLng /= mag;
							}
						}
					}
					planSpeedMult = 2.5;
				} else if (supplyPlan.phase === "DELIVERED") {
					u.isTransport = false;
					const tdLat = supplyPlan.target.lat - u.lat;
					const tdLng = normalizeLongitudeDelta(supplyPlan.target.lng - u.lng);
					const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
					if (td > 0.01) {
						planDirLat = tdLat / td;
						planDirLng = tdLng / td;
					}
					planSpeedMult = 1.5;
				}
				frame.moveDirLat = 0;
				frame.moveDirLng = 0;
			} else {
				// Not a supply unit — clear supply flag
				u.supplyAssigned = false;
			}
			// Defender reaction: move toward enemy landing if assigned (independent of supply)
			if (
				!isPlanUnit &&
				u._defenderReactTarget &&
				!shouldMopUp &&
				!retreatVector &&
				!isEngaged
			) {
				isPlanUnit = true;
				const rdLat = u._defenderReactTarget.lat - u.lat;
				const rdLng = normalizeLongitudeDelta(
					u._defenderReactTarget.lng - u.lng,
				);
				const rd = Math.sqrt(rdLat * rdLat + rdLng * rdLng);
				if (rd < 1.0) {
					u._defenderReactTarget = null;
				} else {
					planDirLat = rdLat / rd;
					planDirLng = rdLng / rd;
					planSpeedMult = 2.0;
				}
				frame.moveDirLat = 0;
				frame.moveDirLng = 0;
			}
		} else {
			u.navalAssigned = false;
			u.isTransport = false;

			// TRANSPORT plan: fast-move stranded units toward frontline
			const transportPlan = _transportPlan[u.sideIndex];
			const transportSignature = transportPlan?.signature;
			if (
				u._transportPlanSignature &&
				u._transportPlanSignature !== transportSignature
			) {
				u._transportPlanSignature = null;
			}
			if (
				transportPlan &&
				!hasOperationalAssignment &&
				!shouldMopUp &&
				!retreatVector &&
				!isEngaged &&
				localEnemyCount < 2 &&
				transportPlan.target
			) {
				const tdLat = transportPlan.target.lat - u.lat;
				const tdLng = normalizeLongitudeDelta(transportPlan.target.lng - u.lng);
				const tdSq = tdLat * tdLat + tdLng * tdLng;
				const assignedToTransport =
					u._transportPlanSignature === transportSignature;
				const transportLimit = Math.max(1, transportPlan.maxAssignedUnits || 5);
				const transportFull =
					!assignedToTransport &&
					(transportPlan.activeUnitCount || 0) >= transportLimit;
				// Exit transport when within 1.5 degrees of frontline
				if (tdSq <= 2.25) {
					u._transportPlanSignature = null;
				} else if (!transportFull) {
					isPlanUnit = true;
					u._transportPlanSignature = transportSignature;
					transportPlan.activeUnitCount =
						(transportPlan.activeUnitCount || 0) + 1;
					u.isTransport = true;
					const td = Math.sqrt(tdSq);
					planDirLat = tdLat / td;
					planDirLng = tdLng / td;
					planSpeedMult = 6.0;
					frame.moveDirLat = 0;
					frame.moveDirLng = 0;
				}
			}

			// DEFEND plan and land plan execution — skip if unit is in transport mode
			if (!u.isTransport) {
				const taskForceOrder = u._taskForceOrder;
				if (taskForceOrder?.target && !shouldMopUp) {
					isPlanUnit = true;
					activePlan = null;
					activePlanSignature = null;
					u._assignedPlanSignature = null;
					const orderLat = taskForceOrder.target.lat - u.lat;
					const orderLng = normalizeLongitudeDelta(
						taskForceOrder.target.lng - u.lng,
					);
					const orderDistance = Math.sqrt(
						orderLat * orderLat + orderLng * orderLng,
					);
					if (orderDistance > 0.08) {
						planDirLat = orderLat / orderDistance;
						planDirLng = orderLng / orderDistance;
					} else {
						planDirLat = 0;
						planDirLng = 0;
					}
					planSpeedMult = taskForceOrder.speed || 1;
					frame.moveDirLat = 0;
					frame.moveDirLng = 0;
				} else {
					// Commander city defense: assign a bounded group to a ring of
					// friendly points around the selected city and hold once in place.

					// DEFEND plan: hold the frontline, do not advance
					if (
						activePlan &&
						activePlan.type === "DEFEND" &&
						!isEngaged &&
						!shouldMopUp &&
						!retreatVector
					) {
						isPlanUnit = true;
						activePlan.activeUnitCount = (activePlan.activeUnitCount || 0) + 1;
						// Check if unit is behind or at the frontline (on our side)
						const unitIdx = gridIdxNow;
						const onOurSide =
							unitIdx !== -1 && dominantSideMap[unitIdx] === u.sideIndex;
						const nearFrontline =
							borderDir &&
							Math.sqrt(
								borderDir.lat * borderDir.lat + borderDir.lng * borderDir.lng,
							) > 0;
						if (onOurSide && nearFrontline) {
							// Hold position near the frontline, don't advance
							frame.moveDirLat = 0;
							frame.moveDirLng = 0;
						} else if (!onOurSide) {
							// Unit drifted past the frontline — pull it back
							// Move toward nearest friendly territory
							let bestFRDist = Infinity;
							let bestFRLat = 0;
							let bestFRLng = 0;
							const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
							const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
							for (let dr = -5; dr <= 5; dr++) {
								for (let dc = -5; dc <= 5; dc++) {
									const nr = r + dr;
									const nc = c + dc;
									if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
										continue;
									const ni = nr * gridWidth + nc;
									if (dominantSideMap[ni] !== u.sideIndex) continue;
									const flat = nr * CONFIG.GRID_RES - 90;
									const flng = nc * CONFIG.GRID_RES - 180;
									const fdLng = normalizeLongitudeDelta(flng - u.lng);
									const fd = (u.lat - flat) ** 2 + fdLng ** 2;
									if (fd < bestFRDist) {
										bestFRDist = fd;
										bestFRLat = flat;
										bestFRLng = flng;
									}
								}
							}
							if (bestFRDist < Infinity) {
								const d = Math.sqrt(bestFRDist);
								frame.moveDirLat = (bestFRLat - u.lat) / d;
								const fdLng = normalizeLongitudeDelta(bestFRLng - u.lng);
								frame.moveDirLng = fdLng / d;
							}
						}
					}

					// Defender reaction: move toward enemy landing if assigned
					if (
						u._defenderReactTarget &&
						!shouldMopUp &&
						!retreatVector &&
						!isEngaged
					) {
						isPlanUnit = true;
						const rdLat = u._defenderReactTarget.lat - u.lat;
						const rdLng = normalizeLongitudeDelta(
							u._defenderReactTarget.lng - u.lng,
						);
						const rd = Math.sqrt(rdLat * rdLat + rdLng * rdLng);
						if (rd < 1.0) {
							u._defenderReactTarget = null;
						} else {
							planDirLat = rdLat / rd;
							planDirLng = rdLng / rd;
							planSpeedMult = 2.0;
						}
						frame.moveDirLat = 0;
						frame.moveDirLng = 0;
					}

					// Only apply plan when safe: no nearby enemies, not engaged, not retreating
					if (
						!shouldMopUp &&
						!retreatVector &&
						!isEngaged &&
						(localEnemyCount < 2 || pocketContained) &&
						activePlan &&
						activePlan.type !== "DEFEND"
					) {
						const planLimit = Math.max(1, activePlan.maxAssignedUnits || 5);
						const currentPlanSignature =
							activePlan.signature || activePlanSignature;
						const assignedToPlan =
							u._assignedPlanSignature === currentPlanSignature;
						const planFull =
							!assignedToPlan && (activePlan.activeUnitCount || 0) >= planLimit;
						const planAnchor =
							activePlan.frontIntel?.weakPoint ||
							activePlan.arrowPoints?.[0] ||
							activePlan.target;
						const planAnchorDistSq = planAnchor
							? geoDistSq(u.lat, u.lng, planAnchor.lat, planAnchor.lng)
							: 0;
						const planTheaterRadiusSq =
							activePlan.type === "PUSH_FRONT" ? 36.0 : 25.0;
						const needsSeedUnits =
							(activePlan.activeUnitCount || 0) < Math.ceil(planLimit * 0.15);
						const inPlanTheater =
							assignedToPlan ||
							!planAnchor ||
							planAnchorDistSq <= planTheaterRadiusSq ||
							(needsSeedUnits && planAnchorDistSq <= 100.0);
						if (!planFull && inPlanTheater) {
							isPlanUnit = true;
							u._assignedPlanSignature = currentPlanSignature;
							if (u._planWaypointSignature !== currentPlanSignature) {
								u._planWaypointSignature = currentPlanSignature;
								u._planWaypointIndex = 0;
							}
							if (activePlan.activeUnitCount !== undefined) {
								activePlan.activeUnitCount++;
							}

							if (
								activePlan.phase === "PREPARATION" &&
								activePlan.stagingCells?.length > 0
							) {
								// Rally to staging cells at 2× speed
								const staging = activePlan.stagingCells;
								const sc =
									staging[
										Math.floor(Math.abs(u.id * 1000000) % staging.length)
									];
								if (sc) {
									const pdLat = sc.lat - u.lat;
									const pdLng = normalizeLongitudeDelta(sc.lng - u.lng);
									const pd = Math.sqrt(pdLat * pdLat + pdLng * pdLng);
									if (pd > 0.01) {
										planDirLat = pdLat / pd;
										planDirLng = pdLng / pd;
									}
									planSpeedMult = 2.0;
								}
								// Zero out target direction so plan dominates; skip combat engagement
								frame.moveDirLat = 0;
								frame.moveDirLng = 0;
							} else if (
								activePlan.phase === "EXECUTION" &&
								activePlan.target
							) {
								// Waypoint routing: steer toward friendly waypoints around neutral blocks
								let useWaypoint = false;
								if (activePlan._waypoints && activePlan._waypoints.length > 0) {
									const wpIndex = Math.min(
										u._planWaypointIndex || 0,
										activePlan._waypoints.length,
									);
									const wp = activePlan._waypoints[wpIndex];
									if (wp) {
										const wLat = wp.lat - u.lat;
										const wLng = normalizeLongitudeDelta(wp.lng - u.lng);
										const wDistSq = wLat * wLat + wLng * wLng;
										if (wDistSq < 1.0) {
											u._planWaypointIndex = wpIndex + 1;
										} else {
											const wDist = Math.sqrt(wDistSq);
											planDirLat = wLat / wDist;
											planDirLng = wLng / wDist;
											planSpeedMult = 2.0;
											useWaypoint = true;
										}
									}
								}
								if (!useWaypoint) {
									const pdLat = activePlan.target.lat - u.lat;
									const pdLng = normalizeLongitudeDelta(
										activePlan.target.lng - u.lng,
									);
									const pd = Math.sqrt(pdLat * pdLat + pdLng * pdLng);

									if (activePlan.type === "ENCIRCLE") {
										const unitSeed = Math.floor(Math.abs(u.id * 1_000_000));
										const role = unitSeed % 3;
										if (role === 0) {
											// Pin: hold position, minimal advance
											if (pd > 0.01) {
												planDirLat = pdLat / pd;
												planDirLng = pdLng / pd;
											}
											planSpeedMult = 0.4;
										} else {
											// Flank through a fixed waypoint. Continuously rotating the
											// target vector makes units orbit the pocket instead of closing it.
											const approach =
												activePlan.stagingPoint || activePlan.arrowPoints?.[0];
											let approachLat =
												activePlan.target.lat - (approach?.lat ?? u.lat);
											let approachLng = normalizeLongitudeDelta(
												activePlan.target.lng - (approach?.lng ?? u.lng),
											);
											let approachDist = Math.sqrt(
												approachLat * approachLat + approachLng * approachLng,
											);
											if (approachDist <= 0.01 && pd > 0.01) {
												if (
													Number.isFinite(activePlan._encircleApproachLat) &&
													Number.isFinite(activePlan._encircleApproachLng)
												) {
													approachLat = activePlan._encircleApproachLat;
													approachLng = activePlan._encircleApproachLng;
													approachDist = 1;
												} else {
													approachLat = pdLat / pd;
													approachLng = pdLng / pd;
													approachDist = 1;
													activePlan._encircleApproachLat = approachLat;
													activePlan._encircleApproachLng = approachLng;
												}
											}
											if (approachDist > 0.01) {
												const forwardLat = approachLat / approachDist;
												const forwardLng = approachLng / approachDist;
												const flankSide = role === 1 ? -1 : 1;
												const lane = (Math.floor(unitSeed / 3) % 7) - 3;
												const flankRadius = 0.8 + lane * 0.06;
												const flankLat =
													activePlan.target.lat -
													forwardLng * flankSide * flankRadius +
													forwardLat * 0.2;
												const flankLng =
													activePlan.target.lng +
													forwardLat * flankSide * flankRadius +
													forwardLng * 0.2;
												const fdLat = flankLat - u.lat;
												const fdLng = normalizeLongitudeDelta(flankLng - u.lng);
												const flankDist = Math.sqrt(
													fdLat * fdLat + fdLng * fdLng,
												);
												if (flankDist > 0.3) {
													planDirLat = fdLat / flankDist;
													planDirLng = fdLng / flankDist;
												} else if (pd > 0.01) {
													planDirLat = pdLat / pd;
													planDirLng = pdLng / pd;
												}
											}
											planSpeedMult = 2.0;
										}
									} else {
										// CAPTURE_CITY / PUSH_FRONT: breakthrough push with spearhead variation
										if (pd > 0.01) {
											planDirLat = pdLat / pd;
											planDirLng = pdLng / pd;
										}
										const spearhead =
											0.8 + (Math.sin(u.id * 777) * 0.5 + 0.5) * 0.8;
										planSpeedMult = 2.0 * spearhead;
									}
									activePlan.progress = Math.min(
										1.0,
										Math.max(0, 1.0 - pd / 5.0),
									);
									// Zero out target direction so plan dominates; units follow the plan
									frame.moveDirLat = 0;
									frame.moveDirLng = 0;
								}
							} else if (
								activePlan.phase === "CONSOLIDATION" &&
								activePlan.target
							) {
								// Spread outward from captured objective toward new frontline
								let bestDist = Infinity;
								let bestLat = 0,
									bestLng = 0;
								for (const fk of Object.keys(_frontlinePolys || {})) {
									const [fa, fb] = fk.split("_").map(Number);
									if (fa !== u.sideIndex && fb !== u.sideIndex) continue;
									const poly = _frontlinePolys[fk];
									if (!poly) continue;
									const idx = Math.floor(
										Math.abs(u.id * 777 + simFrameCount) % poly.length,
									);
									const fc = poly[idx];
									const fLng = normalizeLongitudeDelta(fc.lng - u.lng);
									const dSq = (fc.lat - u.lat) ** 2 + fLng ** 2;
									if (dSq < bestDist) {
										bestDist = dSq;
										bestLat = fc.lat;
										bestLng = fc.lng;
									}
								}
								if (bestDist < Infinity && bestDist > 0.0001) {
									const d = Math.sqrt(bestDist);
									planDirLat = (bestLat - u.lat) / d;
									planDirLng = (bestLng - u.lng) / d;
									planSpeedMult = 1.5;
								}
								// During consolidation, zero out target direction so plan dominates
								frame.moveDirLat = 0;
								frame.moveDirLng = 0;
							}
						}
					}
				}
			} // end else (non-naval land plan)
		} // end if (!u.isTransport)

		// Blend plan direction into movement
		if (isPlanUnit && (planDirLat !== 0 || planDirLng !== 0)) {
			const operationalOrderActive = !!u._taskForceUid;
			const planBlend = operationalOrderActive
				? isEngaged || localEnemyCount > 0
					? 0.55
					: 0.96
				: isEngaged || localEnemyCount > 0
					? 0.3
					: aiProfile.frontlineBlend > 0
						? 0.85
						: 0.65;
			frame.moveDirLat =
				frame.moveDirLat * (1 - planBlend) + planDirLat * planBlend;
			frame.moveDirLng =
				frame.moveDirLng * (1 - planBlend) + planDirLng * planBlend;
			const magP = Math.sqrt(
				frame.moveDirLat * frame.moveDirLat +
					frame.moveDirLng * frame.moveDirLng,
			);
			if (magP > 0) {
				frame.moveDirLat /= magP;
				frame.moveDirLng /= magP;
			}
		}

		// When enemies are nearby, push toward local enemy centroid
		if (
			localEnemyCount > 0 &&
			!isAtSea &&
			(enemyCentroidLat !== 0 || enemyCentroidLng !== 0)
		) {
			enemyCentroidLat /= localEnemyCount;
			enemyCentroidLng /= localEnemyCount;
			const cLat = enemyCentroidLat - u.lat;
			const cLng = normalizeLongitudeDelta(enemyCentroidLng - u.lng);
			const cDist = Math.sqrt(cLat * cLat + cLng * cLng);
			if (cDist > 0.0001) {
				const combatWeight = isPlanUnit ? 0.35 : 0.7;
				frame.moveDirLat =
					(cLat / cDist) * combatWeight + frame.moveDirLat * (1 - combatWeight);
				frame.moveDirLng =
					(cLng / cDist) * combatWeight + frame.moveDirLng * (1 - combatWeight);
				const magC = Math.sqrt(
					frame.moveDirLat * frame.moveDirLat +
						frame.moveDirLng * frame.moveDirLng,
				);
				if (magC > 0) {
					frame.moveDirLat /= magC;
					frame.moveDirLng /= magC;
				}
			}
		}

		// Front-slot positioning: pull toward assigned frontline slot
		// Disabled during staging phases and for DEFEND plans (they hold the line)
		if (
			u.frontSlot &&
			!isPlanUnit &&
			!shouldMopUp &&
			!retreatVector &&
			!isEngaged &&
			(!activePlan ||
				(activePlan.phase !== "PREPARATION" &&
					activePlan.phase !== "CONSOLIDATION")) &&
			activePlan?.type !== "DEFEND"
		) {
			const sdLat = u.frontSlot.targetLat - u.lat;
			const sdLng = normalizeLongitudeDelta(u.frontSlot.targetLng - u.lng);
			const sdDist = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
			if (sdDist > 0.01) {
				const slotStrength = Math.min(0.6, dist * 2);
				frame.moveDirLat =
					frame.moveDirLat * (1 - slotStrength) +
					(sdLat / sdDist) * slotStrength;
				frame.moveDirLng =
					frame.moveDirLng * (1 - slotStrength) +
					(sdLng / sdDist) * slotStrength;
				const magSlot = Math.sqrt(
					frame.moveDirLat * frame.moveDirLat +
						frame.moveDirLng * frame.moveDirLng,
				);
				if (magSlot > 0) {
					frame.moveDirLat /= magSlot;
					frame.moveDirLng /= magSlot;
				}
			}
		}

		// Pull towards nearby frontline — disabled when plan is driving the unit
		if (
			borderDir &&
			!isAtSea &&
			!isPlanUnit &&
			!shouldMopUp &&
			(!activePlan ||
				(activePlan.phase !== "PREPARATION" &&
					activePlan.phase !== "CONSOLIDATION"))
		) {
			// Force units to prioritize the frontline even more heavily to prevent the "interior roaming" seen in clusters.
			const blendStrength = aiProfile.frontlineBlend;
			frame.moveDirLat =
				frame.moveDirLat * (1 - blendStrength) + borderDir.lat * blendStrength;
			frame.moveDirLng =
				frame.moveDirLng * (1 - blendStrength) + borderDir.lng * blendStrength;
			const magBorder = Math.sqrt(
				frame.moveDirLat * frame.moveDirLat +
					frame.moveDirLng * frame.moveDirLng,
			);
			if (magBorder > 0) {
				frame.moveDirLat /= magBorder;
				frame.moveDirLng /= magBorder;
			}
		}

		// Overwhelming force: all units rush the frontline when 10x advantage
		if (_overwhelmingForce[sideIndex] && !isPlanUnit && borderDir && !isAtSea) {
			frame.moveDirLat = borderDir.lat;
			frame.moveDirLng = borderDir.lng;
			isPlanUnit = false;
		}

		// Apply tactical retreat/border pushback
		let activeRetreat = false;
		if (retreatVector) {
			const rMag = Math.sqrt(retreatVector.lat ** 2 + retreatVector.lng ** 2);
			if (rMag > 0) {
				activeRetreat = true;
				const rDirLat = retreatVector.lat / rMag;
				const rDirLng = retreatVector.lng / rMag;

				// Blend target direction with retreat direction
				// Reduced retreat strength so units don't "dodge" and sprint away entirely,
				// allowing them to keep some forward pressure while backing off.
				const inHostileLand = isEnemyTerritory(gridIdxNow, u.sideIndex);
				const retreatStrength = inHostileLand ? 0.4 : 0.25;

				frame.moveDirLat =
					frame.moveDirLat * (1 - retreatStrength) + rDirLat * retreatStrength;
				frame.moveDirLng =
					frame.moveDirLng * (1 - retreatStrength) + rDirLng * retreatStrength;

				const finalMag = Math.sqrt(
					frame.moveDirLat ** 2 + frame.moveDirLng ** 2,
				);
				if (finalMag > 0) {
					frame.moveDirLat /= finalMag;
					frame.moveDirLng /= finalMag;
				}
			}
		}

		// Hive Cohesion & Alignment: Units stick with their squad and move in unison
		if (groupCentroid && !isAtSea && !activeRetreat) {
			// 1. Cohesion: Pull towards squad center
			const dCentLat = groupCentroid.lat - u.lat;
			const dCentLng = groupCentroid.lng - u.lng;
			const dCentDist = Math.sqrt(dCentLat * dCentLat + dCentLng * dCentLng);
			if (dCentDist > 0.1) {
				const cohesionStr = isPlanUnit ? 0.025 : 0.06;
				frame.moveDirLat += (dCentLat / dCentDist) * cohesionStr;
				frame.moveDirLng += (dCentLng / dCentDist) * cohesionStr;
			}

			// 2. Alignment: Match squad's average heading
			if (
				Math.abs(groupCentroid.vLat) > 0.01 ||
				Math.abs(groupCentroid.vLng) > 0.01
			) {
				const alignStr = isPlanUnit ? 0.1 : 0.25;
				frame.moveDirLat += groupCentroid.vLat * alignStr;
				frame.moveDirLng += groupCentroid.vLng * alignStr;
			}

			const newMag = Math.sqrt(
				frame.moveDirLat * frame.moveDirLat +
					frame.moveDirLng * frame.moveDirLng,
			);
			if (newMag > 0) {
				frame.moveDirLat /= newMag;
				frame.moveDirLng /= newMag;
			}
		}

		// Apply allied repulsion to ensure units spread out to borders
		// Suppression check: Repulsion is disabled during active retreats to prioritize survival
		if (u.repulsionVector && !activeRetreat) {
			const rMag = Math.sqrt(
				u.repulsionVector.lat ** 2 + u.repulsionVector.lng ** 2,
			);
			if (rMag > 0) {
				// Less aggressive repulsion so units keep their forward momentum and don't scatter sideways
				const repulsionStrength = isPlanUnit ? 0.25 : 0.4;
				frame.moveDirLat =
					frame.moveDirLat * (1 - repulsionStrength) +
					(u.repulsionVector.lat / rMag) * repulsionStrength;
				frame.moveDirLng =
					frame.moveDirLng * (1 - repulsionStrength) +
					(u.repulsionVector.lng / rMag) * repulsionStrength;
				const finalMag = Math.sqrt(
					frame.moveDirLat ** 2 + frame.moveDirLng ** 2,
				);
				if (finalMag > 0) {
					frame.moveDirLat /= finalMag;
					frame.moveDirLng /= finalMag;
				}
			}
			u.repulsionVector = null;
		}

		// Guided Pathfinding: Priority-based Corridor Seeking
		// Actively detours around neutral nations (like Czechoslovakia) to find internal routes.
		const isProtectedSupport = (idx) => {
			if (idx === -1 || landMask[idx] === 0) return false;
			const cellOwnerId = worldControlMap[idx];
			const ownerSideIdx = countryToSideMap.get(cellOwnerId);
			if (ownerSideIdx === undefined) return false;
			const isEnemySupport =
				areSidesHostile(sideIndex, ownerSideIdx) &&
				role === "OFFENSE" &&
				sides[ownerSideIdx].find((c) => c.id === cellOwnerId)?.role ===
					"SUPPORT";
			if (isEnemySupport) {
				return myInfluenceAt(idx, u.sideIndex) <= 0.1;
			}
			return false;
		};

		// OPT-3: Only re-evaluate the neutral boundary check when the unit has
		// moved far enough from the last check position (>= 0.5 grid cells).
		// The expensive 24–48 angle sweep is skipped on intermediate ticks.
		const NEUTRAL_CHECK_DIST_SQ = (CONFIG.GRID_RES * 0.5) ** 2;
		const lastNeutralLat = u._neutralCheckLat;
		const lastNeutralLng = u._neutralCheckLng;
		const movedEnoughForNeutralCheck =
			lastNeutralLat === undefined ||
			(u.lat - lastNeutralLat) ** 2 + (u.lng - lastNeutralLng) ** 2 >=
				NEUTRAL_CHECK_DIST_SQ;

		// Only treat enemy SUPPORT nations as blocked for pathfinding; pure neutral countries are pass‑through.
		const isInsideNeutralProtected = isProtectedSupport(currentIdx);
		// Dynamic lookahead: units stuck inside or near neutral territory look further to find a valid corridor.
		const lookAheadDist = isNeutralCountry(currentIdx)
			? 3.0
			: isNeutralCountry(
						getGridIndex(
							u.lat + frame.moveDirLat * 0.5,
							u.lng + frame.moveDirLng * 0.5,
						),
					)
				? 2.0
				: 1.5;

		const lookIdx = getGridIndex(
			u.lat + frame.moveDirLat * lookAheadDist,
			u.lng + frame.moveDirLng * lookAheadDist,
		);

		const lookAheadIsNeutral = lookIdx !== -1 && isNeutralCountry(lookIdx);

		if (
			(isProtectedSupport(lookIdx) ||
				isInsideNeutralProtected ||
				lookAheadIsNeutral) &&
			movedEnoughForNeutralCheck
		) {
			// Record position so we don't re-sweep until the unit moves again
			u._neutralCheckLat = u.lat;
			u._neutralCheckLng = u.lng;

			// Impending neutral border or already inside. Try to "pathfind" a local corridor that stays off neutral land.
			let bestLat = frame.moveDirLat;
			let bestLng = frame.moveDirLng;
			let foundFriendly = false;

			// Local corridor search: sweep angles and check both mid‑point and end‑point cells
			// so we don't just step over a single neutral cell but actually route around it.
			const sweepSteps = 24;
			const sweepAngle = Math.PI; // 180° left/right around current heading
			const corridorLook = lookAheadDist;
			const midFactor = 0.5;

			for (let j = 1; j <= sweepSteps; j++) {
				const angleOff = (sweepAngle / sweepSteps) * j;

				for (let sign = -1; sign <= 1; sign += 2) {
					const a = angleOff * sign;
					const curCos = Math.cos(a);
					const curSin = Math.sin(a);

					// Candidate direction
					const candLat = frame.moveDirLat * curCos - frame.moveDirLng * curSin;
					const candLng = frame.moveDirLat * curSin + frame.moveDirLng * curCos;

					// Sample mid‑point along this direction
					const midLat = u.lat + candLat * corridorLook * midFactor;
					const midLng = u.lng + candLng * corridorLook * midFactor;
					const midIdx = getGridIndex(midLat, midLng);

					// Sample end‑point along this direction
					const endLat = u.lat + candLat * corridorLook;
					const endLng = u.lng + candLng * corridorLook;
					const endIdx = getGridIndex(endLat, endLng);

					const midBlocked =
						midIdx !== -1 &&
						(isNeutralCountry(midIdx) || isProtectedSupport(midIdx));
					const endBlocked =
						endIdx !== -1 &&
						(isNeutralCountry(endIdx) || isProtectedSupport(endIdx));

					// We only accept directions where both mid and end are non‑neutral/non‑protected land.
					if (
						endIdx !== -1 &&
						landMask[endIdx] > 0 &&
						!midBlocked &&
						!endBlocked
					) {
						bestLat = candLat;
						bestLng = candLng;
						foundFriendly = true;
						break;
					}
				}
				if (foundFriendly) break;
			}

			if (!foundFriendly) {
				// Second pass: search a slightly larger ring to get around wider neutral "blocks"
				const farLook = corridorLook * 2.0;
				for (let j = 1; j <= sweepSteps && !foundFriendly; j++) {
					const angleOff = (sweepAngle / sweepSteps) * j;

					for (let sign = -1; sign <= 1; sign += 2) {
						const a = angleOff * sign;
						const curCos = Math.cos(a);
						const curSin = Math.sin(a);

						const candLat =
							frame.moveDirLat * curCos - frame.moveDirLng * curSin;
						const candLng =
							frame.moveDirLat * curSin + frame.moveDirLng * curCos;

						const midLat = u.lat + candLat * farLook * midFactor;
						const midLng = u.lng + candLng * farLook * midFactor;
						const midIdx = getGridIndex(midLat, midLng);

						const endLat = u.lat + candLat * farLook;
						const endLng = u.lng + candLng * farLook;
						const endIdx = getGridIndex(endLat, endLng);

						const midBlocked =
							midIdx !== -1 &&
							(isNeutralCountry(midIdx) || isProtectedSupport(midIdx));
						const endBlocked =
							endIdx !== -1 &&
							(isNeutralCountry(endIdx) || isProtectedSupport(endIdx));

						if (
							endIdx !== -1 &&
							landMask[endIdx] > 0 &&
							!midBlocked &&
							!endBlocked
						) {
							bestLat = candLat;
							bestLng = candLng;
							foundFriendly = true;
							break;
						}
					}
				}
			}

			if (foundFriendly) {
				const mag = Math.sqrt(bestLat ** 2 + bestLng ** 2);
				if (mag > 0) {
					frame.moveDirLat = bestLat / mag;
					frame.moveDirLng = bestLng / mag;
				}
				// Cache the resolved direction so intermediate ticks reuse it
				u._neutralDirLat = frame.moveDirLat;
				u._neutralDirLng = frame.moveDirLng;
				u._neutralBlocked = false;
			} else {
				// No safe corridor that avoids neutral/protected land – try a desperation retreat
				// away from enemies and blocking terrain, even if imperfect.
				const desperationLat = frame.moveDirLat * 0.3;
				const desperationLng = frame.moveDirLng * 0.3;
				// Add jitter to avoid all units trying the same blocked path
				frame.moveDirLat = desperationLat + (Math.random() - 0.5) * 0.4;
				frame.moveDirLng = desperationLng + (Math.random() - 0.5) * 0.4;
				const dMag = Math.sqrt(frame.moveDirLat ** 2 + frame.moveDirLng ** 2);
				if (dMag > 0) {
					frame.moveDirLat /= dMag;
					frame.moveDirLng /= dMag;
				}
				u._neutralDirLng = 0;
				u._neutralBlocked = true;
			}
		} else if (
			(isProtectedSupport(lookIdx) ||
				isInsideNeutralProtected ||
				lookAheadIsNeutral) &&
			!movedEnoughForNeutralCheck
		) {
			// Reuse cached corridor result from last sweep
			if (u._neutralBlocked) {
				frame.moveDirLat = 0;
				frame.moveDirLng = 0;
			} else if (u._neutralDirLat !== undefined) {
				frame.moveDirLat = u._neutralDirLat;
				frame.moveDirLng = u._neutralDirLng;
			}
		} else {
			// No longer near neutral — clear cached state so next encounter is fresh
			u._neutralCheckLat = undefined;
			u._neutralDirLat = undefined;
			u._neutralDirLng = undefined;
			u._neutralBlocked = undefined;
		}

		// Neutral / protected territory: heavy penalty to discourage traversal.
		// Units should path around neutral countries, not through them.
		let neutralPenalty = 1.0;
		let touchingNeutralForNaval = false;

		const currentlyInNeutral =
			isNeutralCountry(currentIdx) || isProtectedSupport(currentIdx);

		if (currentlyInNeutral) {
			if (!Number.isNaN(u.health)) {
				const neutralTickDamage =
					CONFIG.ATTRITION_DAMAGE * 2.0 * damageTakenMult;
				recordDamage(u, neutralTickDamage);
			}
			neutralPenalty = 0.15;
		} else if (isAtSea) {
			// For naval units, treat upcoming neutral coastline as contact for minor attrition
			const coastLookDist = 0.4;
			const coastIdx = getGridIndex(
				u.lat + frame.moveDirLat * coastLookDist,
				u.lng + frame.moveDirLng * coastLookDist,
			);
			if (isNeutral(coastIdx) || isProtectedSupport(coastIdx)) {
				touchingNeutralForNaval = true;
				// Ships skimming neutral coasts also move a bit faster along them
				neutralPenalty = 1.1;
			}
		}

		// Naval neutral-contact damage: greatly reduced, just a tiny scrape while near neutral coasts
		if (isAtSea && touchingNeutralForNaval && !Number.isNaN(u.health)) {
			const neutralHitDamage = CONFIG.ATTRITION_DAMAGE * 0.1 * damageTakenMult;
			recordDamage(u, neutralHitDamage);
		}

		// Massive speed boost when actively retreating to avoid being swallowed by fast borders
		// BUT trapped/encircled units cannot retreat efficiently
		let retreatBoost = activeRetreat ? 5.5 : 1.0;
		if (isEncircled) retreatBoost *= 0.25;

		// --- FORCED PUSH COORDINATION (Victory-Driven) ---
		// Disabled when a war/naval plan is driving the unit
		let pushReadiness = 1.0;
		const isAtFrontline = !isAtSea && !isEffectivelyMyLand && !isTooNearBorder;
		const warWeariness = Math.min(0.85, simFrameCount / 15000);

		if (!isPlanUnit && isAtFrontline && !isMega && !isSuper && !activeRetreat) {
			const victoryRatio = sideVictoryRatios[sideIndex] || 0;

			if (countryObj?.isSurging) {
				const spearheadAggression = 0.5 + (Math.sin(u.id * 777) * 0.5 + 0.5);
				const momentumScale = Math.min(1.8, victoryRatio * 2.5);
				pushReadiness = 4.2 * momentumScale * spearheadAggression;
				pushReadiness *= 1.0 - warWeariness * 0.5;
				if (u.victoryBoostTicks > 0) pushReadiness *= 1.4;
			} else {
				pushReadiness = 0.7 * (1.0 - warWeariness);
			}

			if (countryObj && !countryObj.isSaturated) {
				pushReadiness = 0.3;
			}
		}

		let moveDist =
			baseSpeed *
			speedMult *
			planSpeedMult *
			neutralPenalty *
			retreatBoost *
			pushReadiness *
			0.8; // Reduced movement speed

		// Safety: Prevent NaN from propagating if moveDir calculation fails
		if (
			!Number.isNaN(frame.moveDirLat) &&
			!Number.isNaN(frame.moveDirLng) &&
			!Number.isNaN(moveDist)
		) {
			// Naval block: non-transport units cannot enter water tiles
			let coastBlocked = false;
			if (!u.isTransport) {
				const newLat = u.lat + frame.moveDirLat * moveDist;
				const newLng = u.lng + frame.moveDirLng * moveDist;
				const destIdx = getGridIndex(newLat, newLng);
				if (destIdx !== -1 && landMask[destIdx] === 0) {
					if (!isAtSea) {
						// Would enter water — try coast deflection before stopping
						coastBlocked = true;
						let deflected = false;
						const lookDist = moveDist * 3;
						for (const ang of [-90, 90, -45, 45, -135, 135, -30, 30]) {
							const rad = (ang * Math.PI) / 180;
							const candLat =
								frame.moveDirLat * Math.cos(rad) -
								frame.moveDirLng * Math.sin(rad);
							const candLng =
								frame.moveDirLat * Math.sin(rad) +
								frame.moveDirLng * Math.cos(rad);
							let landCount = 0;
							for (let s = 1; s <= 3; s++) {
								const ci = getGridIndex(
									u.lat + candLat * lookDist * s,
									u.lng + candLng * lookDist * s,
								);
								if (ci !== -1 && landMask[ci] > 0) landCount++;
							}
							if (landCount >= 2) {
								const mag = Math.sqrt(candLat * candLat + candLng * candLng);
								if (mag > 0) {
									frame.moveDirLat = candLat / mag;
									frame.moveDirLng = candLng / mag;
								}
								// Re-check: does the deflected step land on land?
								const deflDestIdx = getGridIndex(
									u.lat + frame.moveDirLat * moveDist,
									u.lng + frame.moveDirLng * moveDist,
								);
								if (deflDestIdx !== -1 && landMask[deflDestIdx] === 0) {
									moveDist *= 0.5;
									window.__perf.coastDeflectHalved++;
								}
								deflected = true;
								break;
							}
						}
						if (!deflected) {
							frame.moveDirLat = 0;
							frame.moveDirLng = 0;
							moveDist = 0;
						}
					}
				}
			}

			// Coast stuck detection: abandon target after 60 ticks of coast deflection
			if (coastBlocked) {
				u._coastStuckTicks = (u._coastStuckTicks || 0) + 1;
				if (u._coastStuckTicks > 60) {
					target = null;
					u._cachedTarget = null;
					u._coastStuckTicks = 0;
					window.__perf.coastStuckAbandoned =
						(window.__perf.coastStuckAbandoned || 0) + 1;
				}
			} else {
				u._coastStuckTicks = 0;
			}

			u.lat += frame.moveDirLat * moveDist;
			u.lng += frame.moveDirLng * moveDist;
			u.dirLat = frame.moveDirLat; // Store trajectory for renderer
			u.dirLng = frame.moveDirLng;

			// Geographic clamping/wrapping to prevent units from flying off the map
			u.lat = Math.max(-89.9, Math.min(89.9, u.lat));
			// Wrap longitude [-180, 180]
			if (u.lng > 180) u.lng -= 360;
			if (u.lng < -180) u.lng += 360;
		}
	} else if (target && typeof target.health !== "undefined") {
		// Combat logic
		u.lastCombatTick = simFrameCount;
		target.lastCombatTick = simFrameCount;

		// Strategic Depth: Units defending their own de jure (historical) territory get a defense boost.
		let defenseBonus = 1.0;
		const currentIdx = gridIdxNow;
		const isDeJureLand =
			currentIdx !== -1 && deJureMap[currentIdx] === u.sovereignId;

		if (!isAtSea) {
			if (isDeJureLand) defenseBonus *= 0.65; // 35% reduction in historical land
			if (
				worldControlMap[gridIdxNow] === u.sovereignId &&
				Math.abs(currentControl) < 0.2
			) {
				defenseBonus *= 0.85; // Additional stack for unoccupied frontline
			}

			// City Fortification: Units near friendly cities are much harder to destroy
			let nearbyCity = null;
			const _myCities = _theaterCitiesBySovereign.get(u.sovereignId);
			if (_myCities) {
				for (let ci = 0; ci < _myCities.length; ci++) {
					const c = _myCities[ci];
					if ((u.lat - c.lat) ** 2 + (u.lng - c.lng) ** 2 < 0.04) {
						nearbyCity = c;
						break;
					}
				}
			}
			if (nearbyCity) {
				defenseBonus *= 0.45; // Significant defense boost in urban centers
			}
		}

		// War of Attrition: In long wars, units defending "dig in", taking less damage
		// but making it harder for the attacker to break through without high losses.
		const longWarDefense = simFrameCount > 6000 ? 0.75 : 1.0;

		const tDmg =
			CONFIG.COMBAT_DAMAGE *
			damageDealtMult *
			0.7 *
			(u.kind === "army" ? Math.max(0, getLiveFormationStrength(u)) : 1);
		const uDmg =
			CONFIG.COMBAT_DAMAGE *
			0.8 *
			damageTakenMult *
			defenseBonus *
			longWarDefense *
			(target.kind === "army"
				? Math.max(0, getLiveFormationStrength(target))
				: 1);

		// Casualties increase while battling (direct engagement)
		recordDamage(target, tDmg, u);
		recordDamage(u, uDmg, target);

		// Positional knockback: both units are pushed by the force of the engagement.
		// Direction is along the line between them; distance is small and scaled by relative damage.
		const dLat = target.lat - u.lat;
		const dLng = normalizeLongitudeDelta(target.lng - u.lng);
		const distSq = dLat * dLat + dLng * dLng;
		if (distSq > 0) {
			const dist = Math.sqrt(distSq) || 1e-6;
			const nx = dLng / dist;
			const ny = dLat / dist;

			// Base push scaled by movement speed so it feels consistent with unit motion
			const basePush =
				(isAtSea ? CONFIG.UNIT_NAVAL_SPEED : CONFIG.UNIT_SPEED) * 1.2;
			// Relative damage factor: more damage dealt -> stronger push on the target
			const totalDmg = tDmg + uDmg || 1e-6;
			const targetFactor = Math.min(1.5, (tDmg / totalDmg) * 1.5);
			const selfFactor = Math.min(1.0, (uDmg / totalDmg) * 1.0);

			// Push target away from attacker
			const targetPushLat = ny * basePush * targetFactor;
			const targetPushLng = nx * basePush * targetFactor;
			// Push attacker slightly backwards as recoil
			const selfPushLat = -ny * basePush * 0.5 * selfFactor;
			const selfPushLng = -nx * basePush * 0.5 * selfFactor;

			// Apply knockback, keeping within latitude limits and wrapping longitude
			const applyPush = (unitObj, dLatMove, dLngMove) => {
				let newLat = unitObj.lat + dLatMove;
				let newLng = unitObj.lng + dLngMove;
				newLat = Math.max(-89.9, Math.min(89.9, newLat));
				if (newLng > 180) newLng -= 360;
				else if (newLng < -180) newLng += 360;
				// Water guard: don't push land units into water
				const pushIdx = getGridIndex(newLat, newLng);
				if (pushIdx !== -1 && landMask[pushIdx] === 0 && !unitObj.isAtSea) {
					window.__perf.knockbackBlocked++;
					return;
				}
				unitObj.lat = newLat;
				unitObj.lng = newLng;
			};

			if (Number.isFinite(targetPushLat) && Number.isFinite(targetPushLng)) {
				applyPush(target, targetPushLat, targetPushLng);
			}
			if (Number.isFinite(selfPushLat) && Number.isFinite(selfPushLng)) {
				applyPush(u, selfPushLat, selfPushLng);
			}
		}

		if (target.health <= 0) {
			u.victoryBoostTicks = 180; // Reduced momentum duration
		}
	}

	return _u4;
}
