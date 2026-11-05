import { showAlert } from "./dialogs.js";
import { gameText } from "./i18n.js";
import { COMPILED_SCENARIO_URLS } from "./scenario-codec.js";

export const BUILTIN_SCENARIOS = {
	modern: {
		id: "world_map_2026",
		name: "Modern World 2026 (political)",
		nameKey: "UI_MODERN_2026",
		url: "assets/maps/compiled/world-map-2026-v3.mwsc.gz",
		compiledOnly: true,
		loading: "Loading Modern World Theater...",
	},
	ukraine2023: {
		id: "ukraine_2023",
		name: "Ukraine 2023 · Eurasia",
		nameKey: "UI_UKRAINE_2023",
		url: "assets/maps/compiled/ukraine-2023-v3.mwsc.gz",
		compiledOnly: true,
		loading: "Loading Ukraine 2023...",
		bounds: [
			[44, 22],
			[53, 41],
		],
	},
	ww2: {
		id: "ww2_peru_update",
		name: "WW2 Peru Update",
		url: "assets/maps/WW2 Peru Update.json",
		loading: "Loading WW2 Peru Update...",
	},
	ww1: {
		id: "ww1_1914",
		name: "1914 Scenario",
		url: "assets/maps/world_war_1__1914_.json",
		loading: "Loading 1914 Theater...",
	},
};

export function createScenarioHandler(
	key,
	{
		primeAudio,
		setLoadingThematic,
		loadingStatus,
		loadingOverlay,
		mainMenu,
		setContext,
		loadPreset,
		initAudio,
		modernFallback,
		focusScenario,
	},
) {
	const scenario = BUILTIN_SCENARIOS[key];
	return async () => {
		const selector = document.getElementById("menu-scenario-selector");
		if (selector) {
			selector.style.opacity = "0";
			selector.style.transform = "translateX(50px)";
			selector.style.transition = "all 0.4s ease";
		}
		primeAudio();
		setLoadingThematic(true);
		loadingStatus.innerText = scenario.loading;
		loadingOverlay.style.display = "flex";
		try {
			const compiledUrl = COMPILED_SCENARIO_URLS[key];
			setContext({
				id: scenario.id,
				name: scenario.nameKey ? gameText(scenario.nameKey) : scenario.name,
				ownerUsername: "System",
				blobUrl: scenario.url,
				compiledUrl,
			});
			await loadPreset(compiledUrl, "CONQUEST", {
				jsonFallbackUrl: scenario.compiledOnly ? undefined : scenario.url,
				prederivedEarth: true,
			});
			if (scenario.bounds) focusScenario?.(scenario.bounds);
			initAudio();
			mainMenu.style.display = "none";
		} catch (error) {
			console.error(error);
			if (key === "modern" && !scenario.compiledOnly) await modernFallback();
			else {
				showAlert(
					gameText("GAME_LOAD_SCENARIO_FAILED", {
						name: scenario.nameKey
							? gameText(scenario.nameKey)
							: key === "ww1"
								? "1914"
								: scenario.name,
					}),
				);
				loadingOverlay.style.display = "none";
				if (selector) {
					selector.style.opacity = "1";
					selector.style.transform = "translateX(0)";
				}
			}
		}
	};
}
