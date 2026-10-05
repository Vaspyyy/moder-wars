import { findArmyEncirclement } from "./army-encirclement.js";
import { CONFIG as DEFAULT_CONFIG } from "./config.js";
import { normalizeLongitudeDelta } from "./geographic-math.js";

/** Reuse one reachability workspace and clear only cells touched by its last BFS. */
export function createAiReachabilityScratch() {
	let seen = new Uint8Array(0);
	let queue = new Int32Array(0);
	let touchedCount = 0;
	return {
		acquire(cellCount) {
			if (seen.length !== cellCount) {
				seen = new Uint8Array(cellCount);
				queue = new Int32Array(cellCount);
			} else {
				for (let index = 0; index < touchedCount; index++) {
					seen[queue[index]] = 0;
				}
			}
			touchedCount = 0;
			return { seen, queue };
		},
		release(count) {
			touchedCount = count;
		},
	};
}

// One integer per whole-degree cell, matching the former "lat_lng" string key.
function coastalDegreeKey(lat, lng) {
	return (Math.floor(lat) + 90) * 400 + Math.floor(lng) + 180;
}

/** createAiProposalPipeline owns AI behavior and receives current world state through explicit accessors. */
export function createAiProposalPipeline(context) {
	const CONFIG = context.CONFIG || DEFAULT_CONFIG;
	const reachabilityScratch = createAiReachabilityScratch();
	function buildFrontIntel(sideIdx) {
		const steps = buildFrontIntelSteps(sideIdx);
		let step = steps.next();
		while (!step.done) step = steps.next();
		return step.value;
	}
	/** Front assessment yields after each front's local-force samples. */
	function* buildFrontIntelSteps(sideIdx) {
		const fronts = [];
		const keys = Object.keys(context._frontlinePolys || {});
		for (const key of keys) {
			const [a, b] = key.split("_").map(Number);
			if (a !== sideIdx && b !== sideIdx) continue;
			const enemySide = a === sideIdx ? b : a;
			const poly = context._frontlinePolys[key];
			if (!poly || poly.length === 0) continue;

			let lat = 0;
			let lng = 0;
			const samples = [];
			const stride = Math.max(1, Math.floor(poly.length / 18));
			for (let p = 0; p < poly.length; p += stride) {
				const pt = poly[p];
				samples.push(pt);
				lat += pt.lat;
				lng += pt.lng;
			}
			if (samples.length === 0) continue;
			lat /= samples.length;
			lng /= samples.length;

			let friendlies = 0;
			let enemies = 0;
			let friendlyPower = 0;
			let enemyPower = 0;
			let bestWeakPoint = samples[0];
			let bestWeakScore = -Infinity;
			for (const sample of samples) {
				const local = context.estimateLocalForces(
					sideIdx,
					sample.lat,
					sample.lng,
					16,
				);
				friendlies = Math.max(friendlies, local.friendlies);
				enemies = Math.max(enemies, local.enemies);
				friendlyPower = Math.max(friendlyPower, local.friendlyHealth);
				enemyPower = Math.max(enemyPower, local.enemyHealth);
			}
			for (const sample of samples) {
				const local = context.estimateLocalForces(
					sideIdx,
					sample.lat,
					sample.lng,
					4.0,
				);
				const overstackPenalty = Math.max(
					0,
					local.friendlies - Math.max(4, local.enemies * 2),
				);
				const weakScore =
					Math.min(local.ratio, 2.5) * 10 +
					Math.min(local.enemies, 12) * 0.6 -
					overstackPenalty * 0.8;
				if (weakScore > bestWeakScore) {
					bestWeakScore = weakScore;
					bestWeakPoint = sample;
				}
			}

			let enemyCitiesNear = 0;
			let friendlyCitiesThreatened = 0;
			for (const city of context.activeTheaterCities) {
				if (context.geoDistSq(city.lat, city.lng, lat, lng) > 64) continue;
				const idx = context.getGridIndex(city.lat, city.lng);
				if (idx === -1) continue;
				const citySide = context.dominantSideMap[idx];
				if (citySide === sideIdx) friendlyCitiesThreatened++;
				else if (citySide === enemySide) enemyCitiesNear++;
			}

			const localRatio = friendlyPower / Math.max(0.25, enemyPower);
			const pressureScore =
				localRatio * 30 +
				enemyCitiesNear * 8 -
				friendlyCitiesThreatened * 5 +
				Math.min(20, poly.length / 15);
			fronts.push({
				pairKey: key,
				enemySide,
				lat,
				lng,
				length: poly.length,
				samples,
				weakPoint: { lat: bestWeakPoint.lat, lng: bestWeakPoint.lng },
				friendlies,
				enemies,
				friendlyPower,
				enemyPower,
				localRatio,
				enemyCitiesNear,
				friendlyCitiesThreatened,
				pressureScore,
			});
			yield 1;
		}
		fronts.sort((a, b) => b.pressureScore - a.pressureScore);
		context._frontIntelBySide[sideIdx] = fronts;
		return fronts;
	}

	function findNearestFront(fronts, lat, lng) {
		let best = null;
		let bestDist = Infinity;
		for (const front of fronts || []) {
			const dSq = context.geoDistSq(lat, lng, front.lat, front.lng);
			if (dSq < bestDist) {
				bestDist = dSq;
				best = front;
			}
		}
		return { front: best, distSq: bestDist };
	}

	function selectEvenlySpaced(items, limit) {
		if (items.length <= limit) return items;
		const selected = new Array(limit);
		const step = (items.length - 1) / Math.max(1, limit - 1);
		for (let i = 0; i < limit; i++) {
			selected[i] = items[Math.round(i * step)];
		}
		return selected;
	}

	/**
	 * Re-apply the selection test of an offensive proposal to the current map,
	 * using its target's current owner rather than the one recorded at selection.
	 */
	function isProposalTargetCurrent(sideIdx, proposal) {
		const { target } = proposal;
		const hostile = (ownerSide) =>
			ownerSide !== undefined && context.areSidesHostile(sideIdx, ownerSide);
		const ownerSideOf = (countryId) =>
			context._tickCountryToSideMap.get(countryId);
		switch (proposal.type) {
			case "PUSH_FRONT":
				return hostile(proposal.targetSideIndex);
			case "ENCIRCLE":
				return hostile(
					context.dominantSideMap[context.getGridIndex(target.lat, target.lng)],
				);
			case "NAVAL_INVASION": {
				const idx = context.getGridIndex(target.lat, target.lng);
				return (
					context.dominantSideMap[idx] !== sideIdx &&
					hostile(ownerSideOf(context.worldControlMap[idx]))
				);
			}
			case "CAPTURE_CITY": {
				const idx = context.getGridIndex(target.lat, target.lng);
				const city = context.activeTheaterCities.find(
					(candidate) =>
						candidate.lat === target.lat && candidate.lng === target.lng,
				);
				return (
					!!city &&
					context.dominantSideMap[idx] !== sideIdx &&
					hostile(ownerSideOf(city.ownerId))
				);
			}
			default:
				return true;
		}
	}

	/**
	 * Generate every proposal for one side as a resumable sequence. Each yield
	 * reports the bounded searches completed since the previous yield, so callers
	 * can spread one reassessment across ticks without consulting the clock.
	 */
	function* generateProposalSteps(sideIdx) {
		const startTick = context._simTickCount;
		const proposals = [];
		const sideCountries = context.sides[sideIdx] || [];
		if (sideCountries.length === 0) return proposals;

		const sideUnits = context._tickUnitsBySide[sideIdx] || [];
		const unitCount = sideUnits.filter((u) => u.deployTicks === 0).length;

		if (unitCount < 3) return proposals;

		const myAllyIds = new Set(sideCountries.map((c) => c.id));
		const frontIntel = yield* buildFrontIntelSteps(sideIdx);
		const landPathCache = new Map();
		const getLandPath = (startIdx, targetIdx) => {
			const key = `${startIdx}:${targetIdx}`;
			if (!landPathCache.has(key)) {
				landPathCache.set(
					key,
					context.findLandPathSummary(startIdx, targetIdx, sideIdx),
				);
			}
			return landPathCache.get(key);
		};

		// ── Pre-compute shared data ──

		// Friendly unit centroid
		let uLat = 0,
			uLng = 0,
			uCount = 0;
		for (let ui = 0; ui < context.units.length; ui++) {
			const u = context.units[ui];
			if (u.sideIndex !== sideIdx || u.deployTicks > 0) continue;
			uLat += u.lat;
			uLng += u.lng;
			uCount++;
		}
		if (uCount > 0) {
			uLat /= uCount;
			uLng /= uCount;
		}

		// Proposal arrows only need to know whether sampled enemy land exists.
		let hasEnemyTerritory = false;
		for (let i = 0; i < context.dominantSideMap.length; i += 20) {
			if (context.landMask[i] === 0) continue;
			if (context.areSidesHostile(sideIdx, context.dominantSideMap[i])) {
				hasEnemyTerritory = true;
				break;
			}
		}
		yield 1;

		// Friendly coastal staging cells (for naval proposals)
		let friendlyCoastCells = [];
		const sampledFriendly = new Set();
		let enemyCoastalTiles = [];
		const sampledEnemy = new Set();
		const coastalStride = Math.max(
			1,
			Math.floor(context._coastalLandIndices.length / 24_000),
		);
		for (
			let coastalIndex = 0;
			context._coastalTopologyReady &&
			coastalIndex < context._coastalLandIndices.length;
			coastalIndex += coastalStride
		) {
			const gi = context._coastalLandIndices[coastalIndex];
			if (context.dominantSideMap[gi] !== sideIdx) continue;
			const row = Math.floor(gi / context.gridWidth);
			const col = gi % context.gridWidth;
			const lat = row * CONFIG.GRID_RES - 90;
			const lng = col * CONFIG.GRID_RES - 180;
			const key = coastalDegreeKey(lat, lng);
			if (sampledFriendly.has(key)) continue;
			sampledFriendly.add(key);
			friendlyCoastCells.push({ lat, lng, idx: gi });
		}

		yield 1;

		// Enemy coastal tiles (for naval and coastal defense)
		for (
			let coastalIndex = 0;
			context._coastalTopologyReady &&
			coastalIndex < context._coastalLandIndices.length;
			coastalIndex += coastalStride
		) {
			const gi = context._coastalLandIndices[coastalIndex];
			if (context.dominantSideMap[gi] === sideIdx) continue;
			const cellOwnerId = context.worldControlMap[gi];
			const ownerSide = context._tickCountryToSideMap.get(cellOwnerId);
			if (
				ownerSide === undefined ||
				!context.areSidesHostile(sideIdx, ownerSide)
			)
				continue;
			if (myAllyIds.has(cellOwnerId)) continue;
			const row = Math.floor(gi / context.gridWidth);
			const col = gi % context.gridWidth;
			const lat = row * CONFIG.GRID_RES - 90;
			const lng = col * CONFIG.GRID_RES - 180;
			const key = coastalDegreeKey(lat, lng);
			if (sampledEnemy.has(key)) continue;
			sampledEnemy.add(key);
			enemyCoastalTiles.push({ lat, lng, idx: gi });
		}
		yield 1;
		// Strategic proposals need geographic coverage, not every coastal grid cell.
		// Keep a deterministic world-order sample so quadratic zone and distance
		// checks stay bounded even for large coalitions with continental coastlines.
		friendlyCoastCells = selectEvenlySpaced(friendlyCoastCells, 96);
		enemyCoastalTiles = selectEvenlySpaced(enemyCoastalTiles, 96);

		// ── 1. CAPTURE_CITY proposals ──
		const enemyCities = [];
		for (let ci = 0; ci < context.activeTheaterCities.length; ci++) {
			const city = context.activeTheaterCities[ci];
			const cIdx = context.getGridIndex(city.lat, city.lng);
			if (cIdx === -1) continue;
			const ownerId = city.ownerId;
			if (myAllyIds.has(ownerId)) continue;
			const citySide = context._tickCountryToSideMap.get(ownerId);
			if (
				citySide === undefined ||
				!context.areSidesHostile(sideIdx, citySide) ||
				context.dominantSideMap[cIdx] === sideIdx
			)
				continue;
			enemyCities.push({
				city,
				isCapital: city.isCapital,
				idx: cIdx,
			});
		}

		// Find frontline centroid for distance reference
		let fLat = 0,
			fLng = 0,
			fCount = 0;
		if (context._frontlinePolys) {
			for (const key of Object.keys(context._frontlinePolys)) {
				const [a, b] = key.split("_").map(Number);
				if (a !== sideIdx && b !== sideIdx) continue;
				const poly = context._frontlinePolys[key];
				if (!poly) continue;
				const stride = Math.max(1, Math.floor(poly.length / 20));
				for (let p = 0; p < poly.length; p += stride) {
					fLat += poly[p].lat;
					fLng += poly[p].lng;
					fCount++;
				}
			}
		}
		if (fCount > 0) {
			fLat /= fCount;
			fLng /= fCount;
		}

		const prioritizedEnemyCities = enemyCities
			.map((ec) => {
				const nearest = findNearestFront(frontIntel, ec.city.lat, ec.city.lng);
				const capitalBoost = ec.isCapital ? 1000 : 0;
				return {
					...ec,
					_nearestFront: nearest.front,
					_frontDistSq: nearest.distSq,
					_sortScore: capitalBoost - nearest.distSq,
				};
			})
			.sort((a, b) => b._sortScore - a._sortScore)
			.slice(0, 12);

		for (const ec of prioritizedEnemyCities) {
			// Score proximity to frontline
			const deLng = normalizeLongitudeDelta(ec.city.lng - fLng);
			const dSq = (ec.city.lat - fLat) ** 2 + deLng ** 2;

			const source = ec._nearestFront?.weakPoint ||
				ec._nearestFront || {
					lat: fCount > 0 ? fLat : uLat,
					lng: fCount > 0 ? fLng : uLng,
				};
			const sourceIdx = context.getGridIndex(source.lat, source.lng);
			const path = getLandPath(sourceIdx, ec.idx);
			yield 1;

			// Skip if bounded land pathing cannot reach this target.
			if (!path.reachable) continue;
			const local = context.estimateLocalForces(
				sideIdx,
				ec.city.lat,
				ec.city.lng,
				9.0,
			);

			proposals.push({
				type: "CAPTURE_CITY",
				targetSideIndex: context._tickCountryToSideMap.get(ec.city.ownerId),
				targetCountryId: ec.city.ownerId,
				target: {
					lat: ec.city.lat,
					lng: ec.city.lng,
					name: ec.city.name || "Enemy City",
					isCapital: ec.isCapital,
					ownerId: ec.city.ownerId,
				},
				stagingCells: [],
				arrowPoints:
					uCount > 0 && hasEnemyTerritory
						? [
								{ lat: source.lat, lng: source.lng },
								{ lat: ec.city.lat, lng: ec.city.lng },
							]
						: null,
				estimatedForceNeeded: Math.ceil(unitCount * 0.15),
				theaterId: ec._nearestFront?.pairKey,
				frontIntel: ec._nearestFront,
				riskAssessment: context.operationalLocalRisk(local),
				geographicData: {
					frontlineDistSq: dSq,
					reachesTarget: path.reachable,
					minSeaDist: Infinity,
					minLandDist: Math.max(
						Math.sqrt(dSq || 1),
						(path.distanceCells || 1) * CONFIG.GRID_RES,
					),
					pathDistanceCells: path.distanceCells || 0,
				},
				_waypoints: path.waypoints || [],
			});
		}

		// Commander Mode adds one explicit city directive to the normal proposal pool.
		// Friendly targets become localized defense plans; lost targets promote the
		// matching capture proposal into a high-priority recapture order.

		// Geography-verified pockets, with two shoulders and an actual closure.
		let encirclementTests = 0;
		const frontlineKeys = Object.keys(context._frontlinePolys || {});
		for (const key of Object.keys(context._frontlinePolys || {})) {
			const [a, b] = key.split("_").map(Number);
			if (a !== sideIdx && b !== sideIdx) continue;
			const poly = context._frontlinePolys[key] || [];
			const stride = Math.max(1, Math.floor(poly.length / 8));
			for (let i = 0; i < poly.length && encirclementTests < 8; i += stride) {
				const cell = poly[i];
				const local = context.estimateLocalForces(
					sideIdx,
					cell.lat,
					cell.lng,
					4,
				);
				if (local.enemies < 2 || local.friendlyHealth < local.enemyHealth * 1.5)
					continue;
				encirclementTests++;
				const operation = findArmyEncirclement(context, sideIdx, cell);
				yield 1;
				if (!operation) continue;
				proposals.push({
					type: "ENCIRCLE",
					targetSideIndex: a === sideIdx ? b : a,
					target: { ...operation.target, name: "Close enemy pocket" },
					stagingPoint: operation.shoulders[0],
					stagingCells: operation.shoulders,
					arrowPoints: [operation.shoulders[0], operation.target],
					encirclement: operation,
					estimatedForceNeeded: Math.max(4, Math.ceil(local.enemyHealth * 2)),
					theaterId: key,
					frontIntel: frontIntel.find((f) => f.pairKey === key),
					riskAssessment: {
						enemyForcesNear: local.enemyHealth,
						ourForcesNear: local.friendlyHealth,
						enemyCounterWeight:
							local.enemyHealth /
							Math.max(0.25, local.friendlyHealth + local.enemyHealth),
					},
				});
			}
		}

		// ── 3. PUSH_FRONT proposals (one per land-connected enemy side) ──
		// Collect enemy sides that share a land frontline with us
		const landConnectedEnemySides = new Set();
		if (context._frontlinePolys) {
			for (const key of Object.keys(context._frontlinePolys)) {
				const [a, b] = key.split("_").map(Number);
				if (
					a === sideIdx &&
					b !== sideIdx &&
					context._frontlinePolys[key]?.length > 0
				) {
					landConnectedEnemySides.add(b);
				} else if (
					b === sideIdx &&
					a !== sideIdx &&
					context._frontlinePolys[key]?.length > 0
				) {
					landConnectedEnemySides.add(a);
				}
			}
		}
		// Generate a PUSH_FRONT proposal for each land-connected enemy side
		if (uCount > 0 && landConnectedEnemySides.size > 0) {
			for (const enemySide of landConnectedEnemySides) {
				// Compute centroid of this specific enemy side's territory
				let esLat = 0,
					esLng = 0,
					esCount = 0;
				for (let i = 0; i < context.dominantSideMap.length; i += 20) {
					if (context.landMask[i] === 0) continue;
					if (context.dominantSideMap[i] !== enemySide) continue;
					const row = Math.floor(i / context.gridWidth);
					const col = i % context.gridWidth;
					esLat += row * CONFIG.GRID_RES - 90;
					esLng += col * CONFIG.GRID_RES - 180;
					esCount++;
				}
				if (esCount === 0) continue;
				esLat /= esCount;
				esLng /= esCount;

				const front =
					frontIntel.find((f) => f.enemySide === enemySide) ||
					findNearestFront(frontIntel, esLat, esLng).front;
				const source = front?.weakPoint || front || { lat: uLat, lng: uLng };
				const path = getLandPath(
					context.getGridIndex(source.lat, source.lng),
					context.getGridIndex(esLat, esLng),
				);
				yield 1;
				if (!path.reachable) continue;
				const local = context.estimateLocalForces(
					sideIdx,
					source.lat,
					source.lng,
					9.0,
				);

				proposals.push({
					type: "PUSH_FRONT",
					targetSideIndex: enemySide,
					target: {
						lat: esLat,
						lng: esLng,
						name: `Enemy Side ${enemySide}`,
						isCapital: false,
					},
					stagingCells: [],
					arrowPoints: [
						{ lat: source.lat, lng: source.lng },
						{ lat: esLat, lng: esLng },
					],
					estimatedForceNeeded: Math.ceil(unitCount * 0.5),
					theaterId: front?.pairKey,
					frontIntel: front,
					riskAssessment: context.operationalLocalRisk(local),
					geographicData: {
						frontlineDistSq: 0,
						reachesTarget: path.reachable,
						minSeaDist: Infinity,
						minLandDist: (path.distanceCells || 0) * CONFIG.GRID_RES,
						pathDistanceCells: path.distanceCells || 0,
					},
					_waypoints: path.waypoints || [],
				});
			}
		}

		// ── 4. DEFEND proposal ──
		const flPts = [];
		if (context._frontlinePolys) {
			for (const key of frontlineKeys) {
				const [a, b] = key.split("_").map(Number);
				if (a !== sideIdx && b !== sideIdx) continue;
				const poly = context._frontlinePolys[key];
				if (!poly) continue;
				const pStride = Math.max(1, Math.floor(poly.length / 60));
				for (let p = 0; p < poly.length; p += pStride) {
					flPts.push({ lat: poly[p].lat, lng: poly[p].lng });
				}
			}
		}
		proposals.push({
			type: "DEFEND",
			target: null,
			stagingCells: [],
			arrowPoints: null,
			frontlinePoints: flPts,
			estimatedForceNeeded: Math.ceil(unitCount * 0.3),
			frontIntel: frontIntel[0],
			geographicData: {
				frontlineDistSq: 0,
				reachesTarget: true,
				minSeaDist: Infinity,
				minLandDist: 0,
			},
		});

		// ── 5. NAVAL_INVASION proposals ──
		// Only propose naval invasions if enough units are near the coast
		let _coastalUnitCount = 0;
		for (
			let _cui = 0;
			_cui < (context._tickUnitsBySide[sideIdx] || []).length;
			_cui++
		) {
			const _cu = context._tickUnitsBySide[sideIdx][_cui];
			if (_cu.deployTicks > 0) continue;
			for (let _fci = 0; _fci < friendlyCoastCells.length; _fci++) {
				const _dLat = _cu.lat - friendlyCoastCells[_fci].lat;
				const _dLng = normalizeLongitudeDelta(
					_cu.lng - friendlyCoastCells[_fci].lng,
				);
				if (_dLat * _dLat + _dLng * _dLng < 9.0) {
					_coastalUnitCount++;
					break;
				}
			}
		}

		if (
			friendlyCoastCells.length > 0 &&
			enemyCoastalTiles.length > 0 &&
			_coastalUnitCount >= 5
		) {
			let navalPathChecks = 0;
			for (const et of enemyCoastalTiles) {
				let minSeaDist = Infinity;
				let minLandDist = Infinity;
				for (const fc of friendlyCoastCells) {
					const dLat2 = et.lat - fc.lat;
					const dLng2 = normalizeLongitudeDelta(et.lng - fc.lng);
					const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
					if (dSq2 < minSeaDist) minSeaDist = dSq2;
				}
				if (context._frontlinePolys) {
					for (const key of frontlineKeys) {
						const [a, b] = key.split("_").map(Number);
						if (a !== sideIdx && b !== sideIdx) continue;
						const poly = context._frontlinePolys[key];
						if (!poly) continue;
						for (
							let p = 0;
							p < poly.length;
							p += Math.max(1, Math.floor(poly.length / 10))
						) {
							const dLat2 = et.lat - poly[p].lat;
							const dLng2 = normalizeLongitudeDelta(et.lng - poly[p].lng);
							const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
							if (dSq2 < minLandDist) minLandDist = dSq2;
						}
					}
				}
				if (minSeaDist > 400 || minSeaDist < 4.0) continue;
				if (minLandDist < 0.1) continue;

				// Find closest friendly coast as staging point
				let bestStaging = null;
				let bestStagingDist = Infinity;
				for (const fc of friendlyCoastCells) {
					const dLat2 = et.lat - fc.lat;
					const dLng2 = normalizeLongitudeDelta(et.lng - fc.lng);
					const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
					if (dSq2 < bestStagingDist) {
						bestStagingDist = dSq2;
						bestStaging = fc;
					}
				}
				if (!bestStaging) continue;
				if (navalPathChecks >= 12) continue;
				navalPathChecks++;
				const seaStart = context.findNearestSeaIdx(bestStaging.idx);
				const seaTarget = context.findNearestSeaIdx(et.idx);
				const seaPath = context.findSeaPathSummary(seaStart, seaTarget);
				yield 1;
				if (!seaPath.reachable) continue;
				minSeaDist = Math.max(
					minSeaDist,
					Math.max(1, seaPath.distanceCells) * CONFIG.GRID_RES,
				);

				proposals.push({
					type: "NAVAL_INVASION",
					target: {
						lat: et.lat,
						lng: et.lng,
						name: "Enemy Coast",
						isCapital: false,
					},
					stagingPoint: { lat: bestStaging.lat, lng: bestStaging.lng },
					arrowPoints: [
						{ lat: bestStaging.lat, lng: bestStaging.lng },
						{ lat: et.lat, lng: et.lng },
					],
					estimatedForceNeeded: Math.ceil(unitCount * 0.15),
					geographicData: {
						frontlineDistSq: 0,
						reachesTarget: true,
						minSeaDist,
						minLandDist,
						seaPathDistanceCells: seaPath.distanceCells || 0,
					},
				});
			}
		}

		// ── 6. NAVAL_SUPPLY proposal ──
		if (context._navalPlan[sideIdx]?.phase === "LANDING") {
			const np = context._navalPlan[sideIdx];
			let bestStaging = null;
			let bestStagingDist = Infinity;
			for (const fc of friendlyCoastCells) {
				const dLat2 = np.target.lat - fc.lat;
				const dLng2 = normalizeLongitudeDelta(np.target.lng - fc.lng);
				const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
				if (dSq2 < bestStagingDist) {
					bestStagingDist = dSq2;
					bestStaging = fc;
				}
			}
			if (bestStaging && bestStagingDist <= 400) {
				const seaStart = context.findNearestSeaIdx(bestStaging.idx);
				const targetIdx = context.getGridIndex(np.target.lat, np.target.lng);
				const seaTarget = context.findNearestSeaIdx(targetIdx);
				const seaPath = context.findSeaPathSummary(seaStart, seaTarget);
				yield 1;
				if (seaPath.reachable) {
					proposals.push({
						type: "NAVAL_SUPPLY",
						target: {
							lat: np.target.lat,
							lng: np.target.lng,
							name: np.target.name || "Supply Target",
							isCapital: false,
						},
						stagingPoint: { lat: bestStaging.lat, lng: bestStaging.lng },
						arrowPoints: [
							{ lat: bestStaging.lat, lng: bestStaging.lng },
							{ lat: np.target.lat, lng: np.target.lng },
						],
						estimatedForceNeeded: Math.ceil(unitCount * 0.1),
						geographicData: {
							frontlineDistSq: 0,
							reachesTarget: true,
							minSeaDist: Math.max(
								bestStagingDist,
								Math.max(1, seaPath.distanceCells) * CONFIG.GRID_RES,
							),
							minLandDist: 0,
							seaPathDistanceCells: seaPath.distanceCells || 0,
						},
					});
				}
			}
		}

		yield 0;
		// ── 7. COASTAL_DEFENSE proposals ──
		if (friendlyCoastCells.length > 0 && enemyCoastalTiles.length > 0) {
			// Cluster friendly coast cells into contiguous zones
			for (const fc of friendlyCoastCells) {
				fc._visited = false;
			}
			const coastalZones = [];
			for (const seed of friendlyCoastCells) {
				if (seed._visited) continue;
				const zone = [seed];
				seed._visited = true;
				for (let zi = 0; zi < zone.length; zi++) {
					for (const other of friendlyCoastCells) {
						if (other._visited) continue;
						const dLat2 = zone[zi].lat - other.lat;
						const dLng2 = normalizeLongitudeDelta(zone[zi].lng - other.lng);
						if (dLat2 * dLat2 + dLng2 * dLng2 < 4.0) {
							other._visited = true;
							zone.push(other);
						}
					}
				}
				coastalZones.push(zone);
			}
			for (const fc of friendlyCoastCells) {
				delete fc._visited;
			}

			for (const zone of coastalZones) {
				let zLat = 0,
					zLng = 0;
				for (const cell of zone) {
					zLat += cell.lat;
					zLng += cell.lng;
				}
				zLat /= zone.length;
				zLng /= zone.length;

				let threatScore = 0;
				for (const et of enemyCoastalTiles) {
					const dLat2 = zLat - et.lat;
					const dLng2 = normalizeLongitudeDelta(zLng - et.lng);
					const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
					if (dSq2 < 400) threatScore++;
				}
				threatScore = Math.min(1, threatScore / 50);

				let enemyNavalThreat = 0;
				for (let ei = 0; ei < context.sides.length; ei++) {
					if (!context.areSidesHostile(sideIdx, ei)) continue;
					const plan = context._navalPlan[ei];
					if (
						plan?.target &&
						context.geoDistSq(zLat, zLng, plan.target.lat, plan.target.lng) <
							100
					)
						enemyNavalThreat += 0.3;
				}

				const zonePolyline = zone.map((c) => ({ lat: c.lat, lng: c.lng }));
				proposals.push({
					type: "COASTAL_DEFENSE",
					target: { lat: zLat, lng: zLng, name: "Coastal Zone" },
					stagingCells: [],
					arrowPoints: null,
					zonePolyline,
					estimatedForceNeeded: Math.ceil(
						zone.length * 0.8 * (threatScore + 0.2),
					),
					threatScore: Math.min(1, threatScore + enemyNavalThreat),
					geographicData: {
						frontlineDistSq: 0,
						reachesTarget: true,
						minSeaDist: 0,
						minLandDist: 0,
					},
				});
			}
		}

		// ── 8. NEUTRAL_GARRISON proposals ──
		if (context.adjacencyCache) {
			// Build sovereign unit count map for threat estimation
			const sovUnitCounts = new Map();
			for (const uu of context.units) {
				if (uu.deployTicks > 0) continue;
				sovUnitCounts.set(
					uu.sovereignId,
					(sovUnitCounts.get(uu.sovereignId) || 0) + 1,
				);
			}
			for (const [countryId, neighbors] of context.adjacencyCache.entries()) {
				if (!myAllyIds.has(countryId)) continue;
				for (const nId of neighbors) {
					const nSide = context._tickCountryToSideMap.get(nId);
					if (nSide !== undefined) continue;
					if (myAllyIds.has(nId)) continue;

					const alreadyProposed = proposals.some(
						(p) => p.type === "NEUTRAL_GARRISON" && p.neutralCountryId === nId,
					);
					if (alreadyProposed) continue;

					const neutralUnitCount = sovUnitCounts.get(nId) || 0;
					const estimatedThreat = Math.max(
						5,
						Math.ceil(neutralUnitCount * 0.3),
					);

					proposals.push({
						type: "NEUTRAL_GARRISON",
						target: {
							lat: 0,
							lng: 0,
							name: `Neutral Border #${nId}`,
						},
						stagingCells: [],
						arrowPoints: null,
						neutralCountryId: nId,
						combatantCountryId: countryId,
						borderLength: context._neutralBorderPolys[countryId]?.length || 0,
						estimatedForceNeeded: Math.min(
							Math.ceil(unitCount * 0.25),
							estimatedThreat,
						),
						geographicData: {
							frontlineDistSq: 0,
							reachesTarget: true,
							minSeaDist: Infinity,
							minLandDist: 0,
						},
					});
				}
			}
		}

		yield 0;
		// ── Exclave reinforcement ──
		// For each country on this side, detect territory not land-connected
		// to the capital (exclaves) and generate supply runs to reinforce them.
		// Uses one BFS per side from all capitals; only triggers when exclave
		// borders enemy territory.
		if (
			friendlyCoastCells.length > 0 &&
			unitCount >= 8 &&
			proposals.length < 12
		) {
			const totalCells = context.landMask.length;
			const { seen: reachable, queue: bfsq } =
				reachabilityScratch.acquire(totalCells);
			let qTail = 0;
			const MAX_BFS = 80000;
			for (const c of sideCountries) {
				const capLat = c.capital?.lat;
				if (capLat == null) continue;
				const capLng = c.capital?.lng !== undefined ? c.capital.lng : c.lng;
				const ci = context.getGridIndex(capLat, capLng);
				if (ci !== -1 && context.landMask[ci] !== 0 && !reachable[ci]) {
					bfsq[qTail++] = ci;
					reachable[ci] = 1;
				}
			}
			if (qTail > 0) {
				for (let qHead = 0; qHead < qTail && qHead < MAX_BFS; qHead++) {
					const gi = bfsq[qHead];
					const row = Math.floor(gi / context.gridWidth);
					const col = gi % context.gridWidth;
					for (let dr = -1; dr <= 1; dr++) {
						for (let dc = -1; dc <= 1; dc++) {
							if (dr === 0 && dc === 0) continue;
							const nr = row + dr,
								nc = col + dc;
							if (
								nr < 0 ||
								nr >= context.gridHeight ||
								nc < 0 ||
								nc >= context.gridWidth
							)
								continue;
							const ni = nr * context.gridWidth + nc;
							if (reachable[ni]) continue;
							if (context.landMask[ni] === 0) continue;
							const nds = context.dominantSideMap[ni];
							if (nds !== -1 && nds !== sideIdx) continue;
							reachable[ni] = 1;
							bfsq[qTail++] = ni;
						}
					}
				}
				reachabilityScratch.release(qTail);
				// Sample-scan for unreachable exclaves with enemy adjacency
				for (const country of sideCountries) {
					const exclaveCells = [];
					const step = Math.max(3, Math.floor(totalCells / 6000));
					for (let gi = 0; gi < totalCells; gi += step) {
						if (context.landMask[gi] === 0) continue;
						if (reachable[gi]) continue;
						if (context.dominantSideMap[gi] !== sideIdx) continue;
						if (context.worldControlMap[gi] !== country.id) continue;
						const r = Math.floor(gi / context.gridWidth);
						const cc = gi % context.gridWidth;
						let hasEnemy = false;
						for (let dr = -1; dr <= 1 && !hasEnemy; dr++) {
							for (let dc = -1; dc <= 1 && !hasEnemy; dc++) {
								if (dr === 0 && dc === 0) continue;
								const nr = r + dr,
									nc = cc + dc;
								if (
									nr < 0 ||
									nr >= context.gridHeight ||
									nc < 0 ||
									nc >= context.gridWidth
								)
									continue;
								const ni = nr * context.gridWidth + nc;
								if (context.landMask[ni] === 0) continue;
								const nds = context.dominantSideMap[ni];
								if (context.areSidesHostile(sideIdx, nds)) hasEnemy = true;
							}
						}
						if (hasEnemy) {
							exclaveCells.push({
								lat: r * CONFIG.GRID_RES - 90,
								lng: cc * CONFIG.GRID_RES - 180,
							});
						}
					}
					if (exclaveCells.length < 5) continue;

					// Centroid of exclave
					let exLat = 0,
						exLng = 0;
					for (const ec of exclaveCells) {
						exLat += ec.lat;
						exLng += ec.lng;
					}
					exLat /= exclaveCells.length;
					exLng /= exclaveCells.length;

					// Skip if existing supply plan targets near this exclave
					const sp = context._navalSupplyPlan[sideIdx];
					if (sp && sp.phase !== "DELIVERED") {
						const st = sp.target;
						if (st) {
							const dLat = st.lat - exLat;
							const dLng = normalizeLongitudeDelta(st.lng - exLng);
							if (dLat * dLat + dLng * dLng < 16) continue;
						}
					}

					// Find nearest friendly staging point
					let bestStaging = null;
					let bestDist = Infinity;
					for (const fc of friendlyCoastCells) {
						const sgi = context.getGridIndex(fc.lat, fc.lng);
						if (sgi === -1 || !reachable[sgi]) continue;
						const dLat = exLat - fc.lat;
						const dLng = normalizeLongitudeDelta(exLng - fc.lng);
						const dSq = dLat * dLat + dLng * dLng;
						if (dSq < bestDist) {
							bestDist = dSq;
							bestStaging = fc;
						}
					}
					if (!bestStaging || bestDist > 400) continue;

					proposals.push({
						type: "NAVAL_SUPPLY",
						target: {
							lat: exLat,
							lng: exLng,
							name: `${country.name} Exclave`,
							isCapital: false,
						},
						stagingPoint: { lat: bestStaging.lat, lng: bestStaging.lng },
						arrowPoints: [
							{ lat: bestStaging.lat, lng: bestStaging.lng },
							{ lat: exLat, lng: exLng },
						],
						estimatedForceNeeded: Math.ceil(unitCount * 0.08),
						geographicData: {
							frontlineDistSq: 0,
							reachesTarget: true,
							minSeaDist: bestDist,
							minLandDist: 0,
						},
					});
				}
			}
		}
		yield 1;
		// ── Friendly-only reachability for waypoint routing ──
		// Compute which cells are reachable from side capitals through friendly-only
		// territory (not neutral/enemy). Used to route units around neutral blocks.
		const friendlyTotal = context.landMask.length;
		const { seen: friendlyOnly, queue: fq } =
			reachabilityScratch.acquire(friendlyTotal);
		let fqTail = 0;
		for (const c of sideCountries) {
			const capLat = c.capital?.lat;
			if (capLat == null) continue;
			const capLng = c.capital?.lng !== undefined ? c.capital.lng : c.lng;
			const ci = context.getGridIndex(capLat, capLng);
			if (ci !== -1 && context.landMask[ci] !== 0 && !friendlyOnly[ci]) {
				fq[fqTail++] = ci;
				friendlyOnly[ci] = 1;
			}
		}
		for (let qHead = 0; qHead < fqTail; qHead++) {
			const gi = fq[qHead];
			const row = Math.floor(gi / context.gridWidth);
			const col = gi % context.gridWidth;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					if (dr === 0 && dc === 0) continue;
					const nr = row + dr,
						nc = col + dc;
					if (
						nr < 0 ||
						nr >= context.gridHeight ||
						nc < 0 ||
						nc >= context.gridWidth
					)
						continue;
					const ni = nr * context.gridWidth + nc;
					if (friendlyOnly[ni]) continue;
					if (context.landMask[ni] === 0) continue;
					if (context.dominantSideMap[ni] !== sideIdx) continue;
					friendlyOnly[ni] = 1;
					fq[fqTail++] = ni;
				}
			}
		}
		reachabilityScratch.release(fqTail);
		// Add waypoints for land proposals whose targets are blocked by neutral territory
		for (const p of proposals) {
			if (
				p.type !== "CAPTURE_CITY" &&
				p.type !== "ENCIRCLE" &&
				p.type !== "PUSH_FRONT" &&
				p.type !== "DEFEND"
			)
				continue;
			if (!p.target) continue;
			const tIdx = context.getGridIndex(p.target.lat, p.target.lng);
			if (tIdx === -1) continue;
			// Target reachable through friendly territory — no waypoint needed
			if (friendlyOnly[tIdx]) continue;
			// Find the closest friendly-reachable frontier cell to the target
			let bestDist = Infinity;
			let bestLat = 0,
				bestLng = 0;
			const wstep = Math.max(3, Math.floor(friendlyTotal / 6000));
			for (let gi = 0; gi < friendlyTotal; gi += wstep) {
				if (!friendlyOnly[gi]) continue;
				if (context.landMask[gi] === 0) continue;
				// Only cells at the frontline (adjacent to enemy territory)
				const r = Math.floor(gi / context.gridWidth);
				const ccol = gi % context.gridWidth;
				let bordersEnemy = false;
				for (let dr = -1; dr <= 1 && !bordersEnemy; dr++) {
					for (let dc = -1; dc <= 1 && !bordersEnemy; dc++) {
						if (dr === 0 && dc === 0) continue;
						const nr2 = r + dr,
							nc2 = ccol + dc;
						if (
							nr2 < 0 ||
							nr2 >= context.gridHeight ||
							nc2 < 0 ||
							nc2 >= context.gridWidth
						)
							continue;
						const ni2 = nr2 * context.gridWidth + nc2;
						if (context.landMask[ni2] === 0) continue;
						const nds2 = context.dominantSideMap[ni2];
						if (context.areSidesHostile(sideIdx, nds2)) bordersEnemy = true;
					}
				}
				if (!bordersEnemy) continue;
				const clat = r * CONFIG.GRID_RES - 90;
				const clng = ccol * CONFIG.GRID_RES - 180;
				const dLat = p.target.lat - clat;
				const dLng = normalizeLongitudeDelta(p.target.lng - clng);
				const dSq = dLat * dLat + dLng * dLng;
				if (dSq < bestDist) {
					bestDist = dSq;
					bestLat = clat;
					bestLng = clng;
				}
			}
			if (bestDist < Infinity) {
				p._waypoints = [
					...(p._waypoints || []),
					{ lat: bestLat, lng: bestLng },
				];
			}
		}
		yield 1;
		// ── 9. TRANSPORT proposals ──
		// Find units stranded far from the frontline and propose fast transport to front.
		// Simulates railways/logistics — prevents large countries from losing due to
		// units spawning far behind the front.
		{
			const sideUnitList = context._tickUnitsBySide[sideIdx] || [];
			const deployed = sideUnitList.filter(
				(u) => u.deployTicks === 0 && u.health > 0,
			);
			if (deployed.length >= 6 && frontIntel.length > 0) {
				const strandedThreshold = 3.0; // degrees from frontline
				let strandedCount = 0;
				let strandedLat = 0,
					strandedLng = 0;
				const targetFrontCounts = new Map();
				for (const u of deployed) {
					const nearest = findNearestFront(frontIntel, u.lat, u.lng);
					const dSq = nearest.distSq;
					if (dSq > strandedThreshold * strandedThreshold) {
						strandedCount++;
						strandedLat += u.lat;
						strandedLng += u.lng;
						const key = nearest.front?.pairKey || frontIntel[0].pairKey;
						targetFrontCounts.set(key, (targetFrontCounts.get(key) || 0) + 1);
					}
				}
				if (strandedCount >= 5) {
					strandedLat /= strandedCount;
					strandedLng /= strandedCount;
					let targetFront = frontIntel[0];
					let targetFrontCount = -1;
					for (const front of frontIntel) {
						const count = targetFrontCounts.get(front.pairKey) || 0;
						const score = count * 10 + front.pressureScore;
						if (score > targetFrontCount) {
							targetFrontCount = score;
							targetFront = front;
						}
					}
					const targetPoint = targetFront?.weakPoint || {
						lat: fLat,
						lng: fLng,
					};
					proposals.push({
						type: "TRANSPORT",
						target: {
							lat: targetPoint.lat,
							lng: targetPoint.lng,
							name: "Nearest Frontline",
						},
						stagingCells: [],
						arrowPoints: [
							{ lat: strandedLat, lng: strandedLng },
							{ lat: targetPoint.lat, lng: targetPoint.lng },
						],
						estimatedForceNeeded: strandedCount,
						strandedCount,
						theaterId: targetFront?.pairKey,
						frontIntel: targetFront,
						geographicData: {
							frontlineDistSq: 0,
							reachesTarget: true,
							minSeaDist: Infinity,
							minLandDist: 0,
						},
					});
				}
			}
		}
		// Targets taken, or owners at peace, while the generation was suspended
		// would install plans against ground the side already holds.
		if (context._simTickCount !== startTick)
			return proposals.filter((proposal) =>
				isProposalTargetCurrent(sideIdx, proposal),
			);
		return proposals;
	}
	function generateAllProposals(sideIdx) {
		const steps = generateProposalSteps(sideIdx);
		let step = steps.next();
		while (!step.done) step = steps.next();
		return step.value;
	}
	return {
		buildFrontIntel,
		findNearestFront,
		selectEvenlySpaced,
		generateProposalSteps,
		generateAllProposals,
	};
}
