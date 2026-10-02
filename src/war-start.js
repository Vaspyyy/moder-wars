// Explicit live context keeps replacements of arrays/state visible across awaits and callbacks.
export function createWarStart(runtime) {
	async function startWar() {
		const activeSides = runtime.sides.filter((s) => s.length > 0);
		if (activeSides.length < 2) {
			alert("Please assign countries to at least two sides.");
			return;
		}

		runtime.setLoadingThematic(false);
		runtime.loadingOverlay.style.display = "flex";
		runtime.loadingStatus.innerText = runtime.getTranslation("LOADING");
		runtime.loadingBar.style.width = "0%";

		await new Promise((r) => setTimeout(r, 50));

		try {
			await _startWarInner();
		} catch (err) {
			console.error("[MW] startWar FAILED:", err);
			runtime.loadingOverlay.style.display = "none";
			alert(`War failed to start: ${err.message}`);
		}
	}

	async function _startWarInner() {
		runtime.invalidateWarLifecycleTimers();
		if (runtime.gameMode === "CONQUEST")
			runtime.applyBroadSetupPosture(
				document.getElementById("setup-posture-select")?.value || "ADAPTIVE",
			);
		runtime.initAudio().then(() => {
			runtime.playWarAmbiance();
		});
		runtime.playWarStartSound();

		// Capture a clean snapshot of the scenario just before the war starts
		// so QUICK RESTART can restore it instantly with no loading screen.
		runtime.initialWorldControlMapSnapshot = runtime.worldControlMap
			? new Uint16Array(runtime.worldControlMap)
			: null;
		runtime.initialDeJureMapSnapshot = runtime.deJureMap
			? new Uint16Array(runtime.deJureMap)
			: null;
		runtime.initialProvinceMapSnapshot = runtime.provinceMap
			? new Int32Array(runtime.provinceMap)
			: null;
		runtime.initialLandMaskSnapshot = runtime.landMask
			? new Uint8Array(runtime.landMask)
			: null;
		runtime.initialBiomeMaskSnapshot = runtime.biomeMask
			? new Uint8Array(runtime.biomeMask)
			: null;
		runtime.initialCountryMetadataSnapshot = runtime.deepClone(
			runtime.countryMetadata,
		);
		runtime.initialCitiesSnapshot = runtime.deepClone(runtime.cities);

		runtime.resetOperationalAiRuntime();
		document.body.classList.remove("conflict-active");
		document.getElementById("war-desk").style.display = "none";
		runtime._warOverviewSides = [];
		runtime._warOverviewLastUpdate = -Infinity;
		runtime.resetSimulationOptimizationRuntime();
		runtime.capitalLostCountries = new Set();
		runtime.resetSideHostilities();

		// Initialize time system for this war
		runtime.setGameTimeFromInputs();

		// Read optional manual manpower overrides from the setup inputs
		runtime.manualSideManpower.fill(null);
		for (let si = 0; si < runtime.sides.length; si++) {
			const mpInput = document.getElementById(`manpower-side-${si}`);
			const parsed = mpInput ? parseInt(mpInput.value, 10) : NaN;
			runtime.manualSideManpower[si] =
				!Number.isNaN(parsed) && parsed > 0 ? parsed : null;
		}

		runtime.gameState = "SIMULATING";
		runtime.isPaused = false;
		runtime.influenceLayer?.setControlChangeTrackingEnabled(true);
		runtime.influenceLayer?.invalidate(runtime.RENDER_LAYERS.ALL);
		runtime._simTickCount = 0;
		runtime.warGraceEndTick =
			runtime.simFrameCount + runtime.CONFIG.WAR_GRACE_TICKS;
		runtime._lastCapitulationTick = Number.NEGATIVE_INFINITY;

		// Hard reset dynamic war-state before building a new theater.
		// This prevents stale frontline/occupation data from previous wars from
		// pulling units to old hotspots or breaking capitulation logic.
		for (let i = 0; i < runtime.landMask.length; i++) {
			if (runtime.landMask[i] === 2) runtime.landMask[i] = 1;
			for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
				runtime.sideInfluenceMaps[s][i] = 0;
			runtime.dominantSideMap[i] = -1;
			runtime.occupationMap[i] = 0;
			runtime.primaryOccupierMap[i] = 0;
		}
		runtime._cachedP1T = 0;
		runtime._cachedP2T = 0;
		runtime._cachedSideTerritoryCounts = [];
		runtime._cachedSideTerritoryPcts = [];
		runtime.latestCountryStats.clear();
		runtime.aiCountryState.clear();
		runtime._warPlan = [];
		runtime._navalPlan.length = 0;
		runtime._navalSupplyPlan.length = 0;
		runtime._transportPlan.length = 0;
		runtime._coastalDefensePlan.length = 0;
		runtime._neutralGarrisonPlan.length = 0;
		runtime._defenderReactionPlan.length = 0;
		runtime._proposalReassessTick.length = 0;

		runtime._planReassessNeeded.length = 0;

		runtime._sidePrevControlled.length = 0;
		runtime._sidePrevStrengthRatio.length = 0;
		runtime._sidePrevPosture.length = 0;
		runtime._sideMomentumHistory = [];
		runtime._sideWarPhase = [];
		runtime._frontIntelBySide = [];
		runtime._aiDebugPlans = [];
		runtime._aiPlanMemory.clear();
		runtime.sides.flat().forEach((c) => {
			if (!c) return;
			c.lastControlledCount = undefined;
			c.lastOwnedCount = undefined;
			c._aiPrevControlled = undefined;
			c._aiStallTicks = 0;
			c._aiInitialCities = undefined;
			c._aiInitialManpower = undefined;
		});

		// Cinematic Mode logic
		runtime.cinematicMode = document.getElementById(
			"cinematic-mode-checkbox",
		)?.checked;
		if (runtime.cinematicMode) {
			document.getElementById("game-status").style.display = "none";
			document.getElementById("stats-panel").style.display = "none";

			// Start Recording
			try {
				const canvas = runtime.influenceLayer._container;
				runtime.recordedChunks = [];
				const stream = canvas.captureStream(30); // 30fps recording
				runtime.mediaRecorder = new MediaRecorder(stream, {
					mimeType: "video/webm; codecs=vp9",
				});
				runtime.mediaRecorder.ondataavailable = (e) => {
					if (e.data.size > 0) runtime.recordedChunks.push(e.data);
				};
				runtime.mediaRecorder.start();
			} catch (e) {
				console.warn("MediaRecorder failed to start:", e);
			}
		} else {
			document.getElementById("game-status").style.display = "flex";
			document.getElementById("stats-panel").style.display = "block";
		}
		runtime.lastTreatyTime = Date.now();
		runtime.sideCasualties.fill(0);
		runtime.countryCasualties.clear();
		runtime.casualtyByAttacker.clear();
		runtime.sides.flat().forEach((c) => {
			runtime.countryCasualties.set(c.id, 0);
			runtime.casualtyByAttacker.set(c.id, new Map());
		});
		runtime.frameAccumulator = 0;
		runtime.simFrameCount = 0;
		// Reset cached frontline field state between wars.
		// Without this, a new war may reuse old direction vectors and pull both
		// teams toward the same stale hotspot from the previous conflict.
		runtime.invalidateFrontlineField();
		runtime._frontlinePolys = {};
		runtime._neutralBorderPolys = {};
		runtime._frontlinePolyTick = -999;

		runtime.setSpeed(0); // Conflicts start at 1x speed (Index 0 in SPEED_STEPS)

		// Initialize diplomacy and technology toggles
		runtime.peaceTreatiesDisabled = runtime.noPeaceCheckbox.checked;

		const startYear =
			runtime.gameTimeEnabled && runtime.gameTimeDate
				? runtime.gameTimeDate.year
				: 2024;
		// Historical technology gate: bombs/missiles are disabled for any scenario starting before 1942
		let isHistoricalGateActive = runtime.gameTimeEnabled && startYear < 1942;

		// Also look at the scenario name to decide if this is a pre-missile era
		const scName = (runtime.currentScenarioContext?.name || "").toLowerCase();
		const preMissileKeywords = [
			"1936",
			"1914",
			"1804",
			"1492",
			"1 ad",
			"napoleonic",
			"ww1",
			"great war",
			"renaissance",
			"classical",
			"antique",
		];
		if (preMissileKeywords.some((k) => scName.includes(k))) {
			isHistoricalGateActive = true;
		}

		runtime.bombsDisabled =
			runtime.disableBombsCheckbox.checked ||
			!runtime.missilesEnabled ||
			isHistoricalGateActive;

		runtime.statusText.innerText = runtime.ffaMode
			? "Free For All Active"
			: "Global Conflict Active";
		runtime.recalculateAllBounds();
		runtime.setupPanel.style.display = "none";
		runtime.statsPanel.style.display = "block";
		runtime.casualtyPanel.style.display = "flex";
		runtime.resetBtn.style.display = "block";
		runtime.updateRestartVisibility();

		// Final sync of mountain state before sim starts
		runtime.mountainsEnabled = !runtime.setupDisableMountainsCheckbox.checked;
		document.getElementById("speed-controls").style.display = "flex";
		runtime.godModeBtn.style.display = "block";
		if (runtime.godModeActive) runtime.godBombBtn.style.display = "block";
		runtime.forcePeaceBtn.style.display = "block";
		runtime.unitCountsDiv.style.display = "flex";
		runtime.treatyAlert.style.display = "none";

		const getCode = (feat) => {
			if (!feat?.properties) return "un";
			const p = feat.properties;
			let code =
				p.ISO_A2 || p.iso_a2 || p.ISO_A2_EH || p.iso_a2_eh || p.ADDR_A2 || "un";
			if (code === "-99") code = "un";
			return code.toLowerCase();
		};

		// Optimize: Single pass to count initial cells and set up masks/occupancy
		const countryToSideMap = new Map();
		const cellCounts = new Map();
		const countryIndices = new Map();
		const sideCellIndices = runtime.sides.map(() => []);
		runtime._mopUpOwnedCellCache.clear();
		runtime._mopUpDeJureCellCache.clear();

		// Ensure country bounds are up to date before we derive any war theater extents
		runtime.recalculateAllBounds();

		runtime.initialCombatants = [];
		runtime.sides.forEach((side, idx) => {
			side.forEach((c) => {
				runtime.initialCombatants.push({
					id: c.id,
					name: c.name,
					sideIndex: idx,
				});
				countryToSideMap.set(c.id, idx);
				cellCounts.set(c.id, 0);
				countryIndices.set(c.id, []);

				// Flag initialization: Reuse existing flag objects from metadata to prevent flickering and redundant fetches
				const meta = runtime.countryMetadata[c.id - 1];
				if (meta?.tempFlag) {
					c.flag = meta.tempFlag;
				} else {
					c.flag = new Image();
					c.flag.crossOrigin = "anonymous";
					if (meta?.flagUrl) {
						c.flag.src = meta.flagUrl;
					} else {
						const nameCode = runtime.findCodeByName(c.name);
						const src = nameCode
							? `https://flagcdn.com/w80/${nameCode}.webp`
							: c.feature
								? `https://flagcdn.com/w80/${getCode(c.feature)}.webp`
								: null;
						if (src) c.flag.src = src;
					}
					if (meta) meta.tempFlag = c.flag;
				}
				c.isCapitulated = false;
				c.isSaturated = false;
			});
		});

		runtime.primaryOccupierMap.fill(0);

		// SATELLITE THEATER DEFINITION:
		// Ensure we have complete, non-viewport-limited bounds for every country involved.
		// This fixes the "early frontline cutoff" bug in big countries.
		runtime.recalculateAllBounds(true);

		// Determine the minimal bounding box that covers all warring countries on the grid
		let minX = runtime.gridWidth - 1;
		let maxX = 0;
		let minY = runtime.gridHeight - 1;
		let maxY = 0;

		runtime.countryMetadata.forEach((meta) => {
			if (!meta) return;
			if (!countryToSideMap.has(meta.id)) return;
			if (!meta.bounds) return;
			minX = Math.min(minX, meta.bounds.minX);
			maxX = Math.max(maxX, meta.bounds.maxX);
			minY = Math.min(minY, meta.bounds.minY);
			maxY = Math.max(maxY, meta.bounds.maxY);
		});

		// Fallback to full map if bounds are invalid for some reason
		if (
			!Number.isFinite(minX) ||
			!Number.isFinite(maxX) ||
			!Number.isFinite(minY) ||
			!Number.isFinite(maxY) ||
			minX < 0 ||
			minY < 0 ||
			maxX <= minX ||
			maxY <= minY
		) {
			minX = 0;
			minY = 0;
			maxX = runtime.gridWidth - 1;
			maxY = runtime.gridHeight - 1;
		}

		// THE OPTIMIZED PASS: Only scan the war theater bounding box, chunked to keep UI responsive
		const regionWidth = maxX - minX + 1;
		const regionHeight = maxY - minY + 1;
		const regionTotalCells = regionWidth * regionHeight;
		const chunkSize = 250000; // Smaller chunks for smoother big-war startup

		let processed = 0;
		for (let y = minY; y <= maxY; y++) {
			const rowOffset = y * runtime.gridWidth;
			for (let x = minX; x <= maxX; x++) {
				const i = rowOffset + x;
				const id = runtime.worldControlMap[i];
				if (id > 0 && countryToSideMap.has(id)) {
					const sideIdx = countryToSideMap.get(id);

					runtime.landMask[i] = 2;
					runtime.sideInfluenceMaps[sideIdx][i] = 1.0;
					runtime.syncOccupationFromSideInfluence(i);
					runtime.primaryOccupierMap[i] = id;

					cellCounts.set(id, cellCounts.get(id) + 1);
					countryIndices.get(id).push(i);
					sideCellIndices[sideIdx].push(i);
					runtime.cacheMopUpCell(runtime._mopUpOwnedCellCache, id, i);
					runtime.cacheMopUpCell(
						runtime._mopUpDeJureCellCache,
						runtime.deJureMap[i],
						i,
					);
				}
				processed++;
				if (processed % chunkSize === 0) {
					runtime.loadingBar.style.width = `${Math.min(90, (processed / regionTotalCells) * 70)}%`;
					// Yield back to the browser so the UI doesn't freeze on giant conflicts
					await new Promise((r) => setTimeout(r, 0));
				}
			}
		}
		runtime.scheduleCoastalTopologyJob();

		// Set counts back to country objects
		runtime.sides.forEach((side) => {
			side.forEach((c) => {
				c.initialCells = cellCounts.get(c.id) || 0;
			});
		});

		// --- GENERALS & BATTLE PLANS ---
		// Each side gets a "general" with a plan quality; underdogs with a brilliant plan get powerful buffs.
		runtime.generals = [];
		const sideLand = runtime.sides.map((side) =>
			side.reduce((sum, c) => sum + (cellCounts.get(c.id) || 0), 0),
		);

		// Automatically switch to POLITICAL view at the start of every war for consistent visibility.
		runtime.viewMode = "POLITICAL";
		if (runtime.viewModeBtn) {
			runtime.viewModeBtn.innerText = "POLITICAL";
			runtime.viewModeBtn.style.background = "#3498db";
		}
		if (
			runtime.influenceLayer &&
			typeof runtime.influenceLayer._update === "function"
		) {
			runtime.influenceLayer._forceRender = true;
			runtime.influenceLayer._update();
		}

		runtime.sides.forEach((side, idx) => {
			const myLand = sideLand[idx] || 0;
			const enemyLand = sideLand.reduce(
				(sum, v, i) => (runtime.areSidesHostile(idx, i) ? sum + v : sum),
				0,
			);
			const isUnderdog = enemyLand > 0 && myLand < enemyLand;

			// Base plan quality; underdogs get a small bias towards better plans.
			// Overall values are kept modest so "cracked" generals are rare.
			let planQuality = Math.random();
			if (runtime.gameMode !== "CONQUEST" && isUnderdog) {
				// Pull slightly towards the upper half but keep a lot of randomness.
				planQuality = Math.min(
					1,
					planQuality * 0.3 + 0.3 + Math.random() * 0.2,
				);
			}

			const general = {
				sideIndex: idx,
				isUnderdog,
				planQuality,
				name: isUnderdog ? `Underdog General ${idx + 1}` : `General ${idx + 1}`,
			};
			runtime.generals.push(general);

			// If the plan is strong enough and this side is the underdog, consider super‑buffs.
			// However, if the opposing pole already fields heavily buffed nations (buff/super/godly),
			// their raw quality largely negates this general advantage.
			const enemyHasStrongBuff = runtime.sides.some(
				(otherSide, j) =>
					runtime.areSidesHostile(idx, j) &&
					otherSide.some((c) =>
						["buff", "super", "godly"].includes(c.buffState || "none"),
					),
			);

			// Make strong underdog generals much rarer (high threshold) and disable them
			// when facing strongly buffed opponents (e.g. Luxembourg vs a buffed Germany).
			if (
				runtime.gameMode !== "CONQUEST" &&
				isUnderdog &&
				planQuality > 0.9 &&
				!enemyHasStrongBuff
			) {
				side.forEach((c) => {
					c.buffState = c.buffState === "godly" ? "godly" : "super";
					const meta = runtime.countryMetadata[c.id - 1];
					if (meta) meta.buffState = c.buffState;
				});
			}
		});

		runtime.sideColors = [...runtime.DEFAULT_SIDE_COLORS];
		runtime.sides.forEach((side, idx) => {
			if (side.length > 0 && side[0].color) {
				runtime.sideColors[idx] = side[0].color;
			}
		});

		runtime.rebuildStatsPanel();

		runtime.activeTheaterCities = runtime.cities.filter((c) => {
			const idx = runtime.getGridIndex(c.lat, c.lng);
			if (idx !== -1 && runtime.landMask[idx] === 2) {
				c.sovereignId = runtime.worldControlMap[idx];
				return true;
			}
			return false;
		});

		// Identify frontline cells for each country for smarter spawning
		const frontlineIndices = new Map();
		runtime.sides.flat().forEach((c) => {
			frontlineIndices.set(c.id, []);
		});

		// Scan warzone for borders to define the initial "front"
		const totalCells = runtime.worldControlMap.length;
		for (let i = 0; i < totalCells; i++) {
			const id = runtime.worldControlMap[i];
			if (id > 0 && countryToSideMap.has(id)) {
				const sideIdx = countryToSideMap.get(id);

				let isFrontline = false;
				// Check cardinal neighbors and calculate push vector
				const neighbors = [
					{ id: i + 1, dx: 1, dy: 0 },
					{ id: i - 1, dx: -1, dy: 0 },
					{ id: i + runtime.gridWidth, dx: 0, dy: 1 },
					{ id: i - runtime.gridWidth, dx: 0, dy: -1 },
				];
				let vx = 0,
					vy = 0;
				for (const n of neighbors) {
					if (n.id >= 0 && n.id < totalCells) {
						const nId = runtime.worldControlMap[n.id];
						// A cell is a frontline if its neighbor belongs to an enemy side
						if (
							nId > 0 &&
							countryToSideMap.has(nId) &&
							runtime.areSidesHostile(sideIdx, countryToSideMap.get(nId))
						) {
							isFrontline = true;
							vx -= n.dx; // Vector away from enemy neighbor
							vy -= n.dy;
						}
					}
				}
				if (isFrontline) {
					const mag = Math.sqrt(vx * vx + vy * vy);
					frontlineIndices.get(id).push({
						idx: i,
						vx: mag > 0 ? vx / mag : 0,
						vy: mag > 0 ? vy / mag : 0,
					});
				}
			}
		}
		// Efficient spawn based on pre-collected indices

		runtime.sides.forEach((side, sideIdx) => {
			// Track how many units this side already has so we can enforce CONFIG.MAX_UNITS_PER_SIDE strictly.
			let sideCurrentUnits = runtime.units.filter(
				(u) => u.sideIndex === sideIdx,
			).length;

			side.forEach((c) => {
				const theaterIndices = countryIndices.get(c.id);
				const fronts = frontlineIndices.get(c.id);
				if (!theaterIndices || theaterIndices.length === 0) return;

				// Diminishing Density: Large countries have lower unit density to prevent overcrowding
				const sizeFactor = Math.max(1, theaterIndices.length / 1500);
				const densityScale = 1.0 / sizeFactor ** 0.45;

				const fullDesiredCount = Math.floor(
					theaterIndices.length *
						runtime.CONFIG.UNIT_DENSITY_FACTOR *
						densityScale,
				);
				const standingFloor = Math.max(
					runtime.AI_MOBILIZATION.INITIAL_SPAWN_MIN,
					Math.floor((c.startingUnitsFloor || 3) * 0.67),
				);
				let desiredCount = Math.floor(
					fullDesiredCount * runtime.AI_MOBILIZATION.INITIAL_SPAWN_FRAC,
				);
				desiredCount = Math.max(standingFloor, desiredCount);
				desiredCount = Math.min(
					desiredCount,
					Math.max(standingFloor, fullDesiredCount),
				);

				const remainingCap = Math.max(
					0,
					runtime.CONFIG.MAX_UNITS_PER_SIDE - sideCurrentUnits,
				);
				const count = Math.min(desiredCount, remainingCap);
				if (count <= 0) return;

				const friendlyCities = runtime.cities.filter((city) => {
					if (!city.ownerId || city.ownerId !== c.id) return false;
					const cIdx = runtime.getGridIndex(city.lat, city.lng);
					return cIdx !== -1 && runtime.landMask[cIdx] !== 0;
				});

				for (let j = 0; j < count; j++) {
					// At war start, spread units along the frontline with city preference.
					let fromFront = false;
					let fData;

					if (
						fronts &&
						fronts.length > 0 &&
						Math.random() < runtime.AI_MOBILIZATION.START_FROM_FRONT_CHANCE
					) {
						// Cycle-based frontline distribution
						const fIdx = j % fronts.length;
						fData = fronts[fIdx];
						fromFront = true;
					} else {
						// Prefer spawning near friendly cities if available
						if (friendlyCities.length > 0) {
							const pick =
								friendlyCities[
									Math.floor(Math.random() * friendlyCities.length)
								];
							const cIdx = runtime.getGridIndex(pick.lat, pick.lng);
							fData = { idx: cIdx, vx: 0, vy: 0 };
						} else {
							const tidx =
								theaterIndices[
									Math.floor(Math.random() * theaterIndices.length)
								];
							fData = { idx: tidx, vx: 0, vy: 0 };
						}
					}

					// Spread units widely along the frontline, distributing evenly
					const py = Math.floor(fData.idx / runtime.gridWidth);
					const px = fData.idx % runtime.gridWidth;

					const jitterRange = runtime.CONFIG.GRID_RES * 1.5;
					const pushBack = fromFront ? runtime.CONFIG.GRID_RES * 0.6 : 0;

					let lat =
						py * runtime.CONFIG.GRID_RES -
						90 +
						(Math.random() - 0.5) * jitterRange +
						fData.vy * pushBack;
					let lng =
						px * runtime.CONFIG.GRID_RES -
						180 +
						(Math.random() - 0.5) * jitterRange +
						fData.vx * pushBack;

					// Validation: Ensure final coordinate is within the country's sovereign grid
					const finalIdx = runtime.getGridIndex(lat, lng);
					if (finalIdx === -1 || runtime.worldControlMap[finalIdx] !== c.id) {
						lat =
							py * runtime.CONFIG.GRID_RES - 90 + runtime.CONFIG.GRID_RES / 2;
						lng =
							px * runtime.CONFIG.GRID_RES - 180 + runtime.CONFIG.GRID_RES / 2;
					}

					const isMountainCell =
						runtime.terrainMask && runtime.terrainMask[fData.idx] > 0.35;
					const isAlpen = isMountainCell && Math.random() < 0.4;

					runtime.units.push(
						runtime.createArmyFormation({
							lat,
							lng,
							sideIndex: sideIdx,
							sovereignId: c.id,
							isAlpenjager: !!isAlpen,
							mountainHealth: true,
						}),
					);
					sideCurrentUnits++;
					if (sideCurrentUnits >= runtime.CONFIG.MAX_UNITS_PER_SIDE) break;
				}
			});
		});
		for (let sideIdx = 0; sideIdx < runtime.sides.length; sideIdx++) {
			runtime.compactVariableStrengthFormationsForSide(sideIdx);
		}

		/**
		 * Allied Cross‑Deployment:
		 * After initial spawns, push a slice of each country's divisions into allied territory so weaker
		 * friends aren't left with a paper-thin, isolated frontline that gets instantly rolled.
		 */
		runtime.sides.forEach((side, sideIdx) => {
			if (!side || side.length < 2) return; // nothing to balance
			const samePoleSides = side; // all entries here share the same pole by construction

			// Sort allies by land size so bigger partners share more units with smaller ones
			const sorted = samePoleSides
				.map((c) => ({
					country: c,
					land: cellCounts.get(c.id) || 0,
				}))
				.sort((a, b) => b.land - a.land);

			// Build quick lookup of candidate cells per country for redistribution
			const perCountryCells = new Map();
			sorted.forEach((entry) => {
				perCountryCells.set(
					entry.country.id,
					(countryIndices.get(entry.country.id) || []).slice(),
				);
			});

			const sideUnits = runtime.units.filter((u) => u.sideIndex === sideIdx);
			if (!sideUnits.length) return;

			// For each stronger country, move a small portion of its units into each weaker ally's land
			for (let i = 0; i < sorted.length; i++) {
				const strong = sorted[i];
				if (!strong.land) continue;

				const strongUnits = sideUnits.filter(
					(u) => u.sovereignId === strong.country.id,
				);
				if (strongUnits.length === 0) continue;

				// Up to ~20% of this country's units are available for cross‑deployment (min 2)
				const poolSize = Math.max(2, Math.floor(strongUnits.length * 0.2));

				for (let j = i + 1; j < sorted.length; j++) {
					const weak = sorted[j];
					if (!weak.land) continue;

					const weakCells = perCountryCells.get(weak.country.id);
					if (!weakCells || weakCells.length === 0) continue;

					// Number of units to move into this specific ally's territory (capped)
					const shareCount = Math.min(
						Math.max(1, Math.floor(poolSize / (sorted.length - i - 1))),
						strongUnits.length,
					);
					if (shareCount <= 0) continue;

					for (let k = 0; k < shareCount; k++) {
						const unit = strongUnits.pop();
						if (!unit) break;

						// Pick a random cell belonging to the weaker ally
						const cellIdx =
							weakCells[Math.floor(Math.random() * weakCells.length)];
						const cy = Math.floor(cellIdx / runtime.gridWidth);
						const cx = cellIdx % runtime.gridWidth;
						const baseLat = cy * runtime.CONFIG.GRID_RES - 90;
						const baseLng = cx * runtime.CONFIG.GRID_RES - 180;

						// Slight jitter inside the target cell, but keep the unit firmly inside ally territory
						const jitter = runtime.CONFIG.GRID_RES * 0.4;
						unit.lat =
							baseLat +
							runtime.CONFIG.GRID_RES / 2 +
							(Math.random() - 0.5) * jitter;
						unit.lng =
							baseLng +
							runtime.CONFIG.GRID_RES / 2 +
							(Math.random() - 0.5) * jitter;

						// Make sure longitude stays normalized
						if (unit.lng > 180) unit.lng -= 360;
						else if (unit.lng < -180) unit.lng += 360;

						// Credit for land capture stays with the original sovereign; we only change location
						unit.beneficiaryId = strong.country.id;
					}
				}
			}
		});

		// Historical Tech Guard for Base Generation
		const currentYear = runtime.gameTimeDate ? runtime.gameTimeDate.year : 2024;
		const allowSilos = !runtime.gameTimeEnabled || currentYear >= 1942;

		sideCellIndices.forEach((validIndices, si) => {
			if (!validIndices || validIndices.length === 0) return;

			if (allowSilos) {
				const baseCount = Math.min(
					8,
					Math.max(2, Math.floor(validIndices.length / 500)),
				);
				for (let i = 0; i < baseCount; i++) {
					const randIdx =
						validIndices[Math.floor(Math.random() * validIndices.length)];
					const y = Math.floor(randIdx / runtime.gridWidth);
					const x = randIdx % runtime.gridWidth;
					runtime.bases.push({
						lat: y * runtime.CONFIG.GRID_RES - 90 + runtime.CONFIG.GRID_RES / 2,
						lng:
							x * runtime.CONFIG.GRID_RES - 180 + runtime.CONFIG.GRID_RES / 2,
						sideIndex: si,
					});
				}
			}
		});

		// Automated performance cases describe an exact personnel budget, not a
		// request to create that many independently simulated map markers.
		runtime.applyPendingBenchmarkForceOverride();

		runtime.loadingOverlay.style.display = "none";

		if (
			runtime.tutorialActive &&
			runtime.activeTutorialSet[runtime.currentTutorialStep].actionRequired ===
				"START_WAR"
		) {
			runtime.advanceTutorial();
		}

		// Initialize displayed manpower, honoring any manual overrides if present.
		// Total personnel includes deployed formations plus an uncommitted reserve.
		runtime.sideSoldiers.fill(0);
		runtime.initialSideSoldiers.fill(0);
		runtime.sideRecruitableManpower.fill(0);
		// Small wars keep one marker per nominal division; large wars retain exact
		// personnel while using stronger, fewer formations.
		const sideArmyFormationCounts = new Float64Array(runtime.MAX_SIDES);
		const sideDeployedPersonnel = new Float64Array(runtime.MAX_SIDES);
		const sideCellCounts = new Float64Array(runtime.MAX_SIDES);
		const sideCityCounts = new Float64Array(runtime.MAX_SIDES);
		for (let i = 0; i < runtime.units.length; i++) {
			const sIdx = runtime.units[i].sideIndex;
			if (sIdx >= 0 && sIdx < runtime.MAX_SIDES) {
				sideArmyFormationCounts[sIdx]++;
				sideDeployedPersonnel[sIdx] += runtime.getLiveFormationPersonnel(
					runtime.units[i],
				);
			}
		}

		// Count territory cells and cities per side
		for (const [countryId, cellArr] of countryIndices) {
			const sIdx = countryToSideMap.get(countryId);
			if (sIdx != null && sIdx >= 0 && sIdx < runtime.MAX_SIDES) {
				sideCellCounts[sIdx] += cellArr.length;
			}
		}
		for (const city of runtime.activeTheaterCities) {
			const sIdx = countryToSideMap.get(city.sovereignId);
			if (sIdx != null && sIdx >= 0 && sIdx < runtime.MAX_SIDES) {
				sideCityCounts[sIdx]++;
			}
		}

		for (let sIdx = 0; sIdx < runtime.MAX_SIDES; sIdx++) {
			const initialArmyPool = sideDeployedPersonnel[sIdx];
			// Manpower = 1% of total population
			let populationPool = 0;
			for (const [countryId, _cellArr] of countryIndices) {
				const sIdx2 = countryToSideMap.get(countryId);
				if (sIdx2 === sIdx) {
					const meta = runtime.countryMetadata[countryId - 1];
					if (meta?.pop) {
						populationPool += meta.pop;
					}
				}
			}
			populationPool = Math.round(populationPool * 0.01);
			// If no population data, fall back to territory-based calculation
			if (populationPool === 0) {
				populationPool =
					Math.round(sideCellCounts[sIdx] * 200) +
					Math.round(sideCityCounts[sIdx] * 10000);
			}
			const hasActiveForce = sideArmyFormationCounts[sIdx] > 0;
			const autoPool = hasActiveForce
				? Math.max(initialArmyPool, populationPool)
				: initialArmyPool;
			runtime.initialSideSoldiers[sIdx] = Math.max(
				initialArmyPool,
				runtime.manualSideManpower[sIdx] !== null
					? runtime.manualSideManpower[sIdx]
					: autoPool,
			);
			runtime.sideSoldiers[sIdx] = runtime.initialSideSoldiers[sIdx];
			runtime.sideRecruitableManpower[sIdx] = Math.max(
				0,
				runtime.sideSoldiers[sIdx] - initialArmyPool,
			);
			if (sideArmyFormationCounts[sIdx] > 0) {
				runtime.soldiersPerUnit[sIdx] = runtime.CONFIG.UNIT_TO_SOLDIER_RATIO;
			}
		}

		const bounds = runtime.mapRuntime.latLngBounds([]);
		runtime.sides.forEach((side) => {
			side.forEach((c) => {
				if (c.feature)
					try {
						bounds.extend(runtime.mapRuntime.geoJSON(c.feature).getBounds());
					} catch (_e) {
						console.warn("GeoJSON bounds computation failed", _e);
					}
			});
		});

		if (!bounds.isValid()) {
			for (let i = 0; i < runtime.worldControlMap.length; i++) {
				const id = runtime.worldControlMap[i];
				if (runtime.sides.some((s) => s.some((c) => c.id === id))) {
					const y = Math.floor(i / runtime.gridWidth);
					const x = i % runtime.gridWidth;
					const lat = y * runtime.CONFIG.GRID_RES - 90;
					const lng = x * runtime.CONFIG.GRID_RES - 180;
					bounds.extend([lat, lng]);
				}
			}
		}

		if (bounds.isValid()) {
			runtime.map.fitBounds(bounds.pad(0.2));
		}

		// Automatically join all vassals of countries starting the war if not disabled
		if (
			!runtime.disablePuppetsCheckbox.checked &&
			!runtime._benchmarkSuppressAutomaticPuppets
		) {
			runtime.sides.forEach((side, sIdx) => {
				if (!side) return;
				const initialVassals = [];
				side.forEach((c) => {
					if (!c) return;
					runtime.countryMetadata.forEach((m) => {
						if (
							m &&
							m.overlordId === c.id &&
							!runtime.sides.flat().some((exist) => exist && exist.id === m.id)
						) {
							initialVassals.push(m.id);
						}
					});
				});
				initialVassals.forEach((vid) => {
					runtime.recruitNeutralMidWar(vid, sIdx);
				});
			});
		}

		// Editor test wars use the same ground AI lifecycle as regular conflicts.
		runtime.initializeOperationalAiRuntime();
		if (runtime.gameMode === "CONQUEST") {
			runtime._warOverviewSides = runtime.sides.map((countries, index) => ({
				uid: runtime.sideUids[index],
				name: runtime.getSideDisplayName(index),
				color: runtime.sideColors[index],
				countries: countries.map((country) => ({
					id: country.id,
					name: country.name,
					color: country.color,
				})),
			}));
			document.getElementById("war-desk").style.display = "block";
			document.body.classList.add("conflict-active");
			runtime.updateWarOverview(true);
		}

		requestAnimationFrame(runtime.updateLoop);
	}

	function activateCountryMidWar(country, sideIdx) {
		const countryId = country.id;
		if (!runtime.sides[sideIdx]) runtime.sides[sideIdx] = [];
		if (!runtime.sides[sideIdx].some((member) => member.id === countryId)) {
			runtime.sides[sideIdx].push(country);
		}
		const historicalCombatant = runtime.initialCombatants.find(
			(entry) => entry.id === countryId,
		);
		if (historicalCombatant) historicalCombatant.sideIndex = sideIdx;
		else {
			runtime.initialCombatants.push({
				id: countryId,
				name: country.name,
				sideIndex: sideIdx,
			});
		}

		runtime.units.forEach((u) => {
			if (u.sovereignId === countryId) {
				u.sideIndex = sideIdx;
				u.beneficiaryId = countryId;
				u.deployTicks = 15;
				runtime.clearUnitCommandAssignments(u);
				// Phase 3: clear stale cache on side change
				u._cachedTarget = null;
				u._cachedScanKx = -999;
				u._cachedScanKy = -999;
			}
		});

		let cellCount = 0;
		const theaterIndices = [];

		for (let i = 0; i < runtime.worldControlMap.length; i++) {
			if (runtime.worldControlMap[i] === countryId) {
				runtime.cacheMopUpCell(runtime._mopUpOwnedCellCache, countryId, i);
				runtime.cacheMopUpCell(
					runtime._mopUpDeJureCellCache,
					runtime.deJureMap[i],
					i,
				);
				runtime.landMask[i] = 2;
				// Don't erase enemy occupation if the cell is already under enemy control.
				// Otherwise the German army that already conquered Czechia would need to
				// re-propagate influence from scratch — taking hundreds of throttled ticks.
				const currentDs = runtime.dominantSideMap[i];
				if (currentDs < 0 || currentDs === sideIdx) {
					for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
						runtime.sideInfluenceMaps[s][i] = 0;
					runtime.sideInfluenceMaps[sideIdx][i] = 1.0;
					runtime.syncOccupationFromSideInfluence(i);
					runtime.primaryOccupierMap[i] = countryId;
				}
				theaterIndices.push(i);
				cellCount++;
			}
		}
		country.initialCells = cellCount;

		// Add cities of the new country to the active theater so they can be captured
		const newCities = runtime.cities.filter((c) => {
			const idx = runtime.getGridIndex(c.lat, c.lng);
			return idx !== -1 && runtime.worldControlMap[idx] === countryId;
		});
		runtime.activeTheaterCities = [
			...runtime.activeTheaterCities,
			...newCities,
		];

		// Compute manpower pool contribution from the joining country (1% of population)
		const popMeta = runtime.countryMetadata[countryId - 1];
		const populationPool = popMeta?.pop ? Math.round(popMeta.pop * 0.01) : 0;
		// Fall back to territory-based if no population data
		const territoryPool = Math.round(cellCount * 200);
		const cityPool = Math.round(newCities.length * 10000);
		const joiningPool =
			populationPool > 0
				? populationPool
				: Math.max(0, territoryPool + cityPool);
		if (runtime.initialSideSoldiers[sideIdx] <= 0) {
			runtime.initialSideSoldiers[sideIdx] = joiningPool;
			runtime.sideSoldiers[sideIdx] = joiningPool;
		} else {
			runtime.initialSideSoldiers[sideIdx] += joiningPool;
			runtime.sideSoldiers[sideIdx] += joiningPool;
		}

		const meta = runtime.countryMetadata[countryId - 1];
		if (meta?.tempFlag) {
			country.flag = meta.tempFlag;
		} else {
			country.flag = new Image();
			country.flag.crossOrigin = "anonymous";
			if (meta?.flagUrl) {
				country.flag.src = meta.flagUrl;
			}
			if (meta) meta.tempFlag = country.flag;
		}

		// Identify frontline cells for the intervening country for smart spawning
		const frontlines = [];
		theaterIndices.forEach((i) => {
			let isF = false;
			let vx = 0,
				vy = 0;
			const neighbors = [
				{ id: i + 1, dx: 1, dy: 0 },
				{ id: i - 1, dx: -1, dy: 0 },
				{ id: i + runtime.gridWidth, dx: 0, dy: 1 },
				{ id: i - runtime.gridWidth, dx: 0, dy: -1 },
			];
			for (const n of neighbors) {
				if (n.id >= 0 && n.id < runtime.worldControlMap.length) {
					const nId = runtime.worldControlMap[n.id];
					// A cell is a frontline if its neighbor belongs to an enemy side
					if (nId > 0 && nId !== countryId) {
						const nSide = runtime.sides.findIndex((s) =>
							s.some((c) => c.id === nId),
						);
						if (nSide !== -1 && runtime.areSidesHostile(sideIdx, nSide)) {
							isF = true;
							vx -= n.dx;
							vy -= n.dy;
						}
					}
				}
			}
			if (isF) {
				const mag = Math.sqrt(vx * vx + vy * vy);
				frontlines.push({
					idx: i,
					vx: mag > 0 ? vx / mag : 0,
					vy: mag > 0 ? vy / mag : 0,
				});
			}
		});

		// Diminishing Density: Large countries have lower unit density to prevent overcrowding
		const sizeFactor = Math.max(1, theaterIndices.length / 1500);
		const densityScale = 1.0 / sizeFactor ** 0.45;

		let count = Math.floor(
			theaterIndices.length * runtime.CONFIG.UNIT_DENSITY_FACTOR * densityScale,
		);
		const remainingFormationSlots = Math.max(
			0,
			runtime.CONFIG.MAX_UNITS_PER_SIDE -
				runtime.units.reduce(
					(total, unit) => total + Number(unit.sideIndex === sideIdx),
					0,
				),
		);
		count = theaterIndices.length
			? Math.min(
					remainingFormationSlots,
					Math.max(4, Math.min(count, runtime.CONFIG.MAX_UNITS_PER_SIDE)),
				)
			: 0;

		for (let j = 0; j < count; j++) {
			let fData;
			let fromFront = false;
			if (frontlines.length > 0 && Math.random() < 0.95) {
				fData = frontlines[Math.floor(Math.random() * frontlines.length)];
				fromFront = true;
			} else {
				const idx =
					theaterIndices[Math.floor(Math.random() * theaterIndices.length)];
				fData = { idx, vx: 0, vy: 0 };
			}

			const y = Math.floor(fData.idx / runtime.gridWidth);
			const x = fData.idx % runtime.gridWidth;

			// Use pushback logic consistent with startWar for clean frontline deployment
			const pushBack = fromFront ? runtime.CONFIG.GRID_RES * 0.45 : 0;

			const spawnIdx = fData.idx;
			const isMountainCell =
				runtime.terrainMask && runtime.terrainMask[spawnIdx] > 0.35;
			const isAlpen = isMountainCell && Math.random() < 0.4;

			const unitId = Math.random();
			const activatedUnit = runtime.createArmyFormation({
				id: unitId,
				lat:
					y * runtime.CONFIG.GRID_RES -
					90 +
					(Math.random() - 0.5) * runtime.CONFIG.GRID_RES * 1.2 +
					fData.vy * pushBack,
				lng:
					x * runtime.CONFIG.GRID_RES -
					180 +
					(Math.random() - 0.5) * runtime.CONFIG.GRID_RES * 1.2 +
					fData.vx * pushBack,
				sideIndex: sideIdx,
				sovereignId: countryId,
				isAlpenjager: !!isAlpen,
				mountainHealth: true,
			});
			runtime.setUnitFormationPersonnel(
				activatedUnit,
				Math.max(
					1,
					Math.round(
						runtime.soldiersPerUnit[sideIdx] ||
							runtime.CONFIG.UNIT_TO_SOLDIER_RATIO,
					),
				),
			);
			runtime.units.push(activatedUnit);
		}
		const joiningLivePersonnel = runtime.getCountryLivePersonnel(countryId);
		const unfundedPersonnel = Math.max(0, joiningLivePersonnel - joiningPool);
		runtime.sideRecruitableManpower[sideIdx] += Math.max(
			0,
			joiningPool - joiningLivePersonnel,
		);
		if (unfundedPersonnel > 0) {
			runtime.sideSoldiers[sideIdx] += unfundedPersonnel;
			runtime.initialSideSoldiers[sideIdx] += unfundedPersonnel;
		}
		runtime.recalculateAllBounds();
		runtime.reconcileOperationalAiLifecycle("country-activated");
	}
	return { startWar, _startWarInner, activateCountryMidWar };
}
