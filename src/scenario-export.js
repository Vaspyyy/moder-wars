import { expandSavedCells } from "./saved-cells.js";

/** Serialize scenario state without depending on the simulation bootstrap. */
export function generateScenarioSnapshot(
	name,
	{
		worldControlMap,
		landMask,
		biomeMask,
		isCustomTerrain,
		terrainMask,
		countryMetadata,
		cities,
		gridRes,
		mapRes,
		imagery,
		disableCountryGradient,
		customSatelliteUrl,
		worldWidthDeg,
		worldHeightDeg,
		missilesEnabled,
		gameTimeEnabled,
		gameTimeDate,
		timeSystemCheckbox,
		timeYearInput,
		timeMonthInput,
		timeDayInput,
		referenceImageUrl,
		refOpacity,
		referenceOverlay,
		refAboveTerrain,
	},
) {
	const mapData = [];
	// Save all cells that are land (mask != 0), even if they don't have a country owner (id == 0)
	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] !== 0) {
			// Store as [index, ownerId, biomeId]
			mapData.push([i, worldControlMap[i], biomeMask[i] || 0]);
		}
	}

	// Save mountain/terrain intensity for custom maps to prevent losing painted peaks
	const mountainData = [];
	if (isCustomTerrain) {
		for (let i = 0; i < terrainMask.length; i++) {
			if (terrainMask[i] > 0) {
				mountainData.push([i, parseFloat(terrainMask[i].toFixed(2))]);
			}
		}
	}

	// Filter countryMetadata to handle sparse arrays/null entries
	// Includes releasables (nations without current land but preserved in metadata)
	const cleanMetadata = countryMetadata
		.filter((m) => m && typeof m === "object" && m.id)
		.map((m) => ({
			id: m.id,
			name: m.name || m.feature?.properties?.NAME || "Unnamed Nation",
			color: m.color || "rgba(150, 150, 150, 0.5)",
			isCustom: !!m.isCustom,
			flagUrl: m.flagUrl || null,
			// Persist any full-alliance flag that may override member flags in Alliance View
			allianceFlagUrl: m.allianceFlagUrl || null,
			role: m.role || "OFFENSE",
			overlordId: m.overlordId || null,
			releasableBy: m.releasableBy || null,
			savedCells: expandSavedCells(m),
			buffState: m.buffState || "none",
			hiddenBuffState: m.hiddenBuffState || "none",
			allies: Array.isArray(m.allies) ? m.allies : [],
			gdp: Number.isFinite(m.gdp) ? m.gdp : 0,
			pop: Number.isFinite(m.pop) ? m.pop : 0,
		}));

	// Persist city data (custom + any edited capitals)
	const cleanCities = (cities || []).map((c, idx) => ({
		id: c.id || idx + 1,
		name: c.name,
		lat: c.lat,
		lng: c.lng,
		isCapital: !!c.isCapital,
		ownerId: c.ownerId || c.sovereignId || null,
		isCustom: !!c.isCustom,
		pop: c.pop || 0,
	}));

	return {
		name: name,
		metadata: cleanMetadata,
		mapData: mapData,
		mountainData: mountainData.length > 0 ? mountainData : null,
		mapRes: mapRes,
		gridRes: gridRes,
		cities: cleanCities,
		imagery,
		isCustomTerrain: isCustomTerrain,
		disableCountryGradient: disableCountryGradient,
		customSatelliteUrl: customSatelliteUrl,
		worldWidthDeg: worldWidthDeg,
		worldHeightDeg: worldHeightDeg,
		missilesEnabled: missilesEnabled,

		timeEnabled: gameTimeEnabled || timeSystemCheckbox?.checked === true,
		startDate:
			gameTimeDate || timeSystemCheckbox?.checked
				? {
						year: Number(gameTimeDate?.year || timeYearInput?.value || 1936),
						month: Number(gameTimeDate?.month || timeMonthInput?.value || 1),
						day: Number(gameTimeDate?.day || timeDayInput?.value || 1),
					}
				: null,
		// Reference image persistence
		referenceImageUrl: referenceImageUrl || null,
		refImageOpacity: typeof refOpacity === "number" ? refOpacity : 0.5,
		refImageBounds: referenceOverlay
			? {
					nw: referenceOverlay.getBounds().getNorthWest(),
					se: referenceOverlay.getBounds().getSouthEast(),
				}
			: null,
		refDrawAbove: !!refAboveTerrain,
	};
}
