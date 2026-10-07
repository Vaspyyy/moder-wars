import { showAlert } from "./dialogs.js";
import { COMPILED_SCENARIO_URLS } from "./scenario-codec.js";

export const BUILTIN_SCENARIOS = {
	modern: {
		id: "world_map_2022",
		name: "Modern Day",
		url: "assets/maps/world map 2022.json",
		loading: "Loading Modern World Theater...",
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
				name: scenario.name,
				ownerUsername: "System",
				blobUrl: scenario.url,
				compiledUrl,
			});
			await loadPreset(compiledUrl, "CONQUEST", {
				jsonFallbackUrl: scenario.url,
				prederivedEarth: true,
			});
			initAudio();
			mainMenu.style.display = "none";
		} catch (error) {
			console.error(error);
			if (key === "modern") await modernFallback();
			else {
				showAlert(
					`Failed to load ${key === "ww1" ? "1914" : scenario.name} scenario.`,
				);
				loadingOverlay.style.display = "none";
			}
		}
	};
}
