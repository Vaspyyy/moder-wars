// Controls receive live state and commands; they do not import the application.
export function createCountryActions(runtime) {
	function bindReleaseNationHandler() {
		window.releaseNation = async (nationId, releaserId, sideIdx) => {
			const meta = runtime.countryMetadata[nationId - 1];
			if (!meta) return;

			// Clear releasable flag so this entry doesn’t show again until re‑set
			meta.releasableBy = null;

			const isWar = runtime.gameState === "SIMULATING";

			runtime.loadingStatus.innerText = `RESTORING NATION: ${meta.name}...`;
			runtime.loadingOverlay.style.display = "flex";
			await new Promise((r) => setTimeout(r, 50));

			// Decide which cell list to use for restoration:
			// 1) explicit savedCells from when it was marked releasable
			// 2) deJure cores
			// 3) rasterized from GeoJSON feature (slowest; last resort)
			let cellList =
				Array.isArray(meta.savedCells) && meta.savedCells.length
					? meta.savedCells
					: null;

			if (!cellList && runtime.deJureMap) {
				const cells = [];
				for (let i = 0; i < runtime.deJureMap.length; i++) {
					if (runtime.deJureMap[i] === nationId) {
						const y = Math.floor(i / runtime.gridWidth);
						const x = i % runtime.gridWidth;
						cells.push([x, y]);
					}
				}
				if (cells.length) cellList = cells;
			}

			if (!cellList && meta.feature) {
				const bounds = runtime.L.geoJSON(meta.feature).getBounds();
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
				const cells = [];
				for (let y = sLat; y <= eLat; y++) {
					for (let x = sLng; x <= eLng; x++) {
						const lat = y * res - 90 + res * 0.5;
						const lng = x * res - 180 + res * 0.5;
						if (runtime.isPointInFeature(lat, lng, meta.feature)) {
							cells.push([x, y]);
						}
					}
				}
				if (cells.length) cellList = cells;
			}

			let restoredAny = false;
			// If this nation came from a preset with savedCells, we can safely override any current owner on those cells.
			const hasExplicitSavedCells =
				Array.isArray(meta.savedCells) && meta.savedCells.length > 0;

			if (cellList?.length) {
				for (let i = 0; i < cellList.length; i++) {
					const [x, y] = cellList[i];
					const idx = y * runtime.gridWidth + x;
					if (idx < 0 || idx >= runtime.worldControlMap.length) continue;

					const currentOwner = runtime.worldControlMap[idx];

					// Only restrict to releaser/neutral when we don't have an explicit savedCells mask.
					if (!hasExplicitSavedCells) {
						if (
							currentOwner !== releaserId &&
							currentOwner !== 0 &&
							currentOwner !== nationId
						) {
							continue;
						}
					}

					runtime.worldControlMap[idx] = nationId;
					runtime.deJureMap[idx] = nationId;
					runtime.provinceMap[idx] = runtime.getProvinceId(x, y, nationId);

					if (isWar && sideIdx !== -1) {
						runtime.landMask[idx] = 2;
						for (let s = 0; s < runtime.sideInfluenceMaps.length; s++)
							runtime.sideInfluenceMaps[s][idx] = 0;
						if (sideIdx < runtime.sideInfluenceMaps.length)
							runtime.sideInfluenceMaps[sideIdx][idx] = 1.0;
						runtime.syncOccupationFromSideInfluence(idx);
						runtime.primaryOccupierMap[idx] = nationId;
					} else {
						if (runtime.landMask[idx] === 0) runtime.landMask[idx] = 1;
						runtime.clearCellInfluence(idx);
						runtime.primaryOccupierMap[idx] = 0;
					}

					restoredAny = true;
				}
			}

			if (!restoredAny) {
				runtime.loadingOverlay.style.display = "none";
				runtime.releaseModal.style.display = "none";
				runtime.statusText.innerText = `No valid territory found to release for ${meta.name}.`;
				runtime.influenceLayer.render();
				return;
			}

			// If in setup or mid‑war, make sure this nation actually participates on the chosen side
			const newCountry = {
				id: nationId,
				name: meta.name,
				color: meta.color,
				role: "OFFENSE",
				strategy: "BALANCED",
				buffState: "none",
				overlordId: meta.overlordId,
				flag: meta.tempFlag,
			};

			if (!newCountry.flag && meta.flagUrl) {
				newCountry.flag = new Image();
				newCountry.flag.crossOrigin = "anonymous";
				newCountry.flag.src = meta.flagUrl;
				meta.tempFlag = newCountry.flag;
			}

			if (sideIdx !== -1) {
				if (runtime.gameState === "SIMULATING") {
					runtime.activateCountryMidWar(newCountry, sideIdx);
				} else {
					if (!runtime.sides[sideIdx]) runtime.sides[sideIdx] = [];
					if (!runtime.sides[sideIdx].some((c) => c.id === nationId)) {
						runtime.sides[sideIdx].push(newCountry);
					}
				}
			}

			runtime.loadingOverlay.style.display = "none";
			runtime.releaseModal.style.display = "none";
			runtime.recalculateAllBounds();
			runtime.updateSidesUI();
			runtime.influenceLayer.render();
			runtime.statusText.innerText = `${meta.name} has been released!`;
		};
	}
	return { bindReleaseNationHandler };
}
