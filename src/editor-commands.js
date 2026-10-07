import { createArmyFormation } from "./army-formation.js";
import { showAlert } from "./dialogs.js";

// Dependencies are supplied by the application; this module does not import it.
export function createEditorCommands(runtime) {
	function _placeDivisionAt(latlng, sovereignId) {
		let sideIdx = runtime.sides.findIndex((s) =>
			s.some((c) => c.id === sovereignId),
		);

		if (sideIdx === -1) {
			if (runtime.gameState === "SIMULATING" || runtime.godModeActive) {
				sideIdx = 0;
				runtime.recruitNeutralMidWar(sovereignId, sideIdx);
			} else {
				runtime.statusText.innerText =
					"Nation must be assigned to a side to place units.";
				return;
			}
		}

		const idx = runtime.getGridIndex(latlng.lat, latlng.lng);
		const isMountainCell =
			idx !== -1 && runtime.terrainMask && runtime.terrainMask[idx] > 0.35;
		const isAlpen = isMountainCell && Math.random() < 0.4;

		const placedUnit = createArmyFormation({
			lat: latlng.lat,
			lng: latlng.lng,
			sideIndex: sideIdx,
			sovereignId,
			isAlpenjager: !!isAlpen,
			mountainHealth: true,
			deployTicks: 10,
		});
		runtime.setUnitFormationPersonnel(
			placedUnit,
			Math.max(
				1,
				Math.round(
					runtime.soldiersPerUnit[sideIdx] ||
						runtime.CONFIG.UNIT_TO_SOLDIER_RATIO,
				),
			),
		);
		runtime.units.push(placedUnit);

		if (sideIdx >= 0 && sideIdx < runtime.MAX_SIDES) {
			const representedPersonnel =
				runtime.getLiveFormationPersonnel(placedUnit);
			const available = Math.max(
				0,
				runtime.sideRecruitableManpower[sideIdx] || 0,
			);
			const unfundedPersonnel = Math.max(0, representedPersonnel - available);
			runtime.sideRecruitableManpower[sideIdx] = Math.max(
				0,
				available - representedPersonnel,
			);
			// God-mode placement may create a formation even when the reserve is empty.
			if (unfundedPersonnel > 0) {
				runtime.sideSoldiers[sideIdx] += unfundedPersonnel;
				runtime.initialSideSoldiers[sideIdx] += unfundedPersonnel;
			}
		}

		runtime.statusText.innerText = `MANUAL DEPLOYMENT: Division placed for ${runtime.countryMetadata[sovereignId - 1]?.name || "Nation"}`;
		runtime.influenceLayer.render();
	}

	async function _placeNewCountry(latlng) {
		// Do not place new countries outside the world-size box
		if (!runtime.isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return;
		const idx = runtime.getGridIndex(latlng.lat, latlng.lng);
		if (idx === -1) return;

		const y = Math.floor(idx / runtime.gridWidth);
		const x = idx % runtime.gridWidth;

		const maxId = runtime.countryMetadata.reduce(
			(max, m) => (m ? Math.max(max, m.id) : max),
			0,
		);
		const id = maxId + 1;
		const newMeta = {
			id: id,
			name: runtime.customCountryData.name,
			color: runtime.customCountryData.color,
			rgba: runtime.parseColorToRGBA(runtime.customCountryData.color),
			isCustom: true,
			flagUrl: runtime.customCountryData.flagUrl,
			bounds: { minX: x, maxX: x, minY: y, maxY: y },
		};

		// Ensure the array has enough space if there were gaps
		if (id > runtime.countryMetadata.length) {
			runtime.countryMetadata.push(newMeta);
		} else {
			runtime.countryMetadata[id - 1] = newMeta;
		}

		// Assign initial point
		runtime.worldControlMap[idx] = id;
		runtime.deJureMap[idx] = id;
		runtime.provinceMap[idx] = runtime.getProvinceId(x, y, id);
		// Mandatory land conversion at capital point
		runtime.landMask[idx] = 1;

		runtime.gameState = "EDITOR_ACTIVE";
		runtime.statusText.innerText = `Nation Established: ${newMeta.name}`;
		runtime.map.getContainer().classList.remove("painting-cursor");

		runtime.recalculateAllBounds();
		runtime.openInspector(id);
		runtime.influenceLayer.render();
	}

	function _fillAt(latlng) {
		const isUnclaiming = runtime.gameState === "EDITOR_UNCLAIMING";
		if (!isUnclaiming && runtime.editingCountryId <= 0) return;
		// Do not start fill outside the world-size box
		if (!runtime.isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return;
		const startIdx = runtime.getGridIndex(latlng.lat, latlng.lng);
		if (startIdx === -1 || runtime.landMask[startIdx] === 0) return;

		const targetId = runtime.worldControlMap[startIdx];
		const replacementId = isUnclaiming ? 0 : runtime.editingCountryId;
		if (!isUnclaiming && targetId === replacementId) return;

		runtime.loadingStatus.innerText = isUnclaiming
			? "Unclaiming Territory..."
			: "Filling Region...";
		runtime.loadingOverlay.style.display = "flex";

		const res = runtime.CONFIG.GRID_RES;

		// Use a small timeout to let the UI show the loader
		setTimeout(() => {
			const queue = [startIdx];
			const visited = new Uint8Array(runtime.gridWidth * runtime.gridHeight);
			visited[startIdx] = 1;

			while (queue.length > 0) {
				const idx = queue.pop();

				const y = Math.floor(idx / runtime.gridWidth);
				const x = idx % runtime.gridWidth;
				const cellLat = (y + 0.5) * res - 90;
				const cellLng = (x + 0.5) * res - 180;

				// Never modify ownership outside the world-size box
				if (!runtime.isInsideWorldBoxLatLng(cellLat, cellLng)) continue;

				runtime.worldControlMap[idx] = replacementId;

				// Re-sync province ID to the new country owner to prevent border-crossing provinces
				runtime.provinceMap[idx] = runtime.getProvinceId(x, y, replacementId);

				// Neighbors: N, S, E, W
				const neighbors = [];
				if (y > 0) neighbors.push(idx - runtime.gridWidth);
				if (y < runtime.gridHeight - 1) neighbors.push(idx + runtime.gridWidth);
				if (x > 0) neighbors.push(idx - 1);
				if (x < runtime.gridWidth - 1) neighbors.push(idx + 1);

				// Handle world wrapping for East/West if necessary (optional but good for world maps)
				if (x === 0) neighbors.push(idx + (runtime.gridWidth - 1));
				if (x === runtime.gridWidth - 1)
					neighbors.push(idx - (runtime.gridWidth - 1));

				for (const nIdx of neighbors) {
					if (
						!visited[nIdx] &&
						runtime.landMask[nIdx] > 0 &&
						runtime.worldControlMap[nIdx] === targetId
					) {
						const ny = Math.floor(nIdx / runtime.gridWidth);
						const nx = nIdx % runtime.gridWidth;
						const nLat = (ny + 0.5) * res - 90;
						const nLng = (nx + 0.5) * res - 180;

						// Do not flood-fill outside the world-size box
						if (!runtime.isInsideWorldBoxLatLng(nLat, nLng)) continue;

						visited[nIdx] = 1;
						queue.push(nIdx);
					}
				}
			}

			runtime.recalculateAllBounds();
			runtime.loadingOverlay.style.display = "none";
			runtime.influenceLayer.render();
		}, 10);
	}

	async function annexFeatureToCountry(feature, countryId) {
		if (!feature || countryId <= 0) return;

		runtime.loadingStatus.innerText = `Annexing ${feature.properties.NAME || feature.properties.name || "Region"}...`;
		runtime.loadingOverlay.style.display = "flex";

		// Brief timeout to let UI update
		await new Promise((r) => setTimeout(r, 50));

		const bounds = runtime.mapRuntime.geoJSON(feature).getBounds();
		const res = runtime.CONFIG.GRID_RES;
		const sLat = Math.max(0, Math.floor((bounds.getSouth() + 90) / res));
		const eLat = Math.min(
			runtime.gridHeight - 1,
			Math.ceil((bounds.getNorth() + 90) / res),
		);
		const sLng = Math.max(0, Math.floor((bounds.getWest() + 180) / res));
		const eLng = Math.min(
			runtime.gridWidth - 1,
			Math.ceil((bounds.getEast() + 180) / res),
		);

		for (let y = sLat; y <= eLat; y++) {
			for (let x = sLng; x <= eLng; x++) {
				const lat = y * res - 90 + res * 0.5;
				const lng = x * res - 180 + res * 0.5;
				if (runtime.isPointInFeature(lat, lng, feature)) {
					const idx = y * runtime.gridWidth + x;
					// Add this land to the country's world control map
					runtime.worldControlMap[idx] = countryId;
					// Sync province ID immediately
					runtime.provinceMap[idx] = runtime.getProvinceId(x, y, countryId);

					const meta = runtime.countryMetadata[countryId - 1];
					if (meta) {
						if (!meta.bounds)
							meta.bounds = { minX: x, maxX: x, minY: y, maxY: y };
						meta.bounds.minX = Math.min(meta.bounds.minX, x);
						meta.bounds.maxX = Math.max(meta.bounds.maxX, x);
						meta.bounds.minY = Math.min(meta.bounds.minY, y);
						meta.bounds.maxY = Math.max(meta.bounds.maxY, y);
					}
					// Ensure it's marked as land
					if (runtime.landMask[idx] === 0) runtime.landMask[idx] = 1;
				}
			}
		}

		runtime.loadingOverlay.style.display = "none";
		runtime.influenceLayer?.invalidate(runtime.RENDER_LAYERS.STATIC);
		runtime.recalculateAllBounds();
		runtime.influenceLayer.render();
	}

	async function spawnRandomNationsAcrossMap(count) {
		if (!runtime.worldControlMap || !runtime.landMask) return;

		runtime.loadingStatus.innerText = "Generating Civilizations...";
		runtime.loadingOverlay.style.display = "flex";

		// 1. Identify all valid land indices
		const landIndices = [];
		for (let i = 0; i < runtime.landMask.length; i++) {
			if (runtime.landMask[i] > 0) {
				landIndices.push(i);
				runtime.worldControlMap[i] = 0; // Ensure unowned start
			}
		}

		if (landIndices.length === 0) {
			runtime.loadingOverlay.style.display = "none";
			showAlert(
				"SATELLITE ERROR: No landmass identified to populate with civilizations.",
			);
			return;
		}

		const actualCount = Math.min(count, landIndices.length);
		const queues = [];

		// 2. Pick random seeds and initialize metadata
		runtime.countryMetadata = [];
		for (let i = 0; i < actualCount; i++) {
			let randIdx;
			let attempts = 0;
			// Try to pick seeds that aren't already taken
			do {
				randIdx = landIndices[Math.floor(Math.random() * landIndices.length)];
				attempts++;
			} while (runtime.worldControlMap[randIdx] !== 0 && attempts < 100);

			const id = i + 1;
			runtime.worldControlMap[randIdx] = id;

			const h = Math.floor(Math.random() * 360);
			const s = 60 + Math.random() * 30;
			const l = 40 + Math.random() * 20;
			const color = `hsla(${h}, ${s}%, ${l}%, 0.5)`;

			const prefixes = [
				"United",
				"New",
				"Grand",
				"Great",
				"North",
				"South",
				"East",
				"West",
				"Holy",
				"Royal",
				"Federal",
				"Imperial",
				"Democratic",
				"People's",
				"Sovereign",
			];
			const roots = [
				"Balt",
				"Nord",
				"Slav",
				"Franc",
				"Goth",
				"Rhone",
				"Iber",
				"Sax",
				"Slavia",
				"Anglo",
				"Lat",
				"Turk",
				"Persia",
				"Indo",
				"Sino",
				"Nippon",
				"Austral",
				"Afro",
				"Euro",
				"Ameri",
				"Veld",
				"Arid",
				"Boreal",
				"Luso",
				"Fenn",
				"Celt",
				"Gallic",
				"Helvet",
				"Austr",
				"Magyar",
				"Pannoni",
				"Daci",
				"Thrac",
				"Levant",
				"Mesopotam",
			];
			const suffixes = [
				"ia",
				"stan",
				"land",
				"ica",
				"any",
				"os",
				"nia",
				"ria",
				"via",
				"dia",
				"zania",
				"ga",
				"tania",
				"onia",
				"esia",
			];
			const forms = [
				"{Prefix} {Root}{Suffix}",
				"Republic of {Root}{Suffix}",
				"Kingdom of {Root}{Suffix}",
				"{Root}{Suffix} Empire",
				"Federation of {Prefix} {Root}{Suffix}",
				"United {Root}{Suffix} States",
				"{Root}{Suffix} Commonwealth",
			];

			const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
			const root = roots[Math.floor(Math.random() * roots.length)];
			const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
			const form = forms[Math.floor(Math.random() * forms.length)];

			const name = form
				.replace("{Prefix}", prefix)
				.replace("{Root}", root)
				.replace("{Suffix}", suffix);

			const newMeta = {
				id: id,
				name: name,
				color: color,
				rgba: runtime.parseColorToRGBA(color),
				isCustom: true,
				bounds: {
					minX: Infinity,
					maxX: -Infinity,
					minY: Infinity,
					maxY: -Infinity,
				},
			};
			runtime.countryMetadata.push(newMeta);

			queues.push([randIdx]);
		}

		// 3. Interleaved Expansion (BFS)
		// We expand each nation one "step" at a time in a round-robin to prevent one nation
		// from instantly claiming a giant continent while others are stuck.
		let unclaimedLand = true;
		let iterations = 0;

		while (unclaimedLand) {
			unclaimedLand = false;
			iterations++;

			if (iterations % 100 === 0) {
				await new Promise((r) => setTimeout(r, 0));
			}

			for (let i = 0; i < actualCount; i++) {
				const q = queues[i];
				const id = i + 1;
				const nextLevel = [];

				while (q.length > 0) {
					const curr = q.shift();
					const x = curr % runtime.gridWidth;

					const neighbors = [
						curr + 1,
						curr - 1,
						curr + runtime.gridWidth,
						curr - runtime.gridWidth,
					];

					for (const nIdx of neighbors) {
						if (nIdx < 0 || nIdx >= runtime.worldControlMap.length) continue;
						// Horizontal wrapping check
						const nx = nIdx % runtime.gridWidth;
						if (Math.abs(nx - x) > 1) continue;

						if (
							runtime.landMask[nIdx] > 0 &&
							runtime.worldControlMap[nIdx] === 0
						) {
							runtime.worldControlMap[nIdx] = id;
							nextLevel.push(nIdx);
							unclaimedLand = true;
						}
					}

					// Only process one "layer" per nation per round
					if (q.length === 0) {
						queues[i] = nextLevel;
						break;
					}
				}
			}
		}

		runtime.generateProvinces();
		runtime.recalculateAllBounds();
		runtime.loadingOverlay.style.display = "none";
		runtime.influenceLayer.render();
		runtime.statusText.innerText = `WORLD POPULATED: ${actualCount} nations established.`;
	}
	return {
		_placeDivisionAt,
		_placeNewCountry,
		_fillAt,
		annexFeatureToCountry,
		spawnRandomNationsAcrossMap,
	};
}
