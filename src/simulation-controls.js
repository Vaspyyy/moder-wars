// Controls receive live state and commands; they do not import the application.
export function createSimulationControls(runtime) {
	function bindDocumentKeydown() {
		document.addEventListener(
			"keydown",
			(e) => {
				const active = document.activeElement;
				// Keep shortcuts out of text entry, select menus and browser commands.
				if (
					e.defaultPrevented ||
					e.ctrlKey ||
					e.metaKey ||
					e.altKey ||
					active?.isContentEditable ||
					["TEXTAREA", "SELECT"].includes(active?.tagName) ||
					(active?.tagName === "INPUT" &&
						!["radio", "checkbox"].includes(active.type))
				)
					return;

				const simulating =
					runtime.gameState === "SIMULATING" ||
					(runtime.godModeActive && runtime.preGodModeState === "SIMULATING");
				if (simulating && ["+", "=", "-"].includes(e.key)) {
					e.preventDefault();
					e.stopPropagation(); // Speed shortcuts must not also zoom Leaflet.
					runtime.setSpeed(
						runtime.currentSpeedIndex + (e.key === "-" ? -1 : 1),
					);
					return;
				}
				// Focused controls own Space (native radio selection or button click).
				if (
					e.code === "Space" &&
					simulating &&
					!e.repeat &&
					!active?.closest("button, input, a, summary")
				) {
					e.preventDefault();
					runtime.togglePause();
				}
				if (active?.tagName === "INPUT") return;

				if (e.key === "Delete" || e.key === "Backspace") {
					if (
						(runtime.gameMode === "EDITOR" || runtime.godModeActive) &&
						runtime.editingCountryId > 0
					) {
						e.preventDefault();
						runtime.unclaimSelectedCountry();
					}
				}

				// Z key: instantly zoom out to a global view of the entire world
				if (e.key === "z" || e.key === "Z") {
					e.preventDefault();
					// Fit the whole world into view with a small padding for aesthetics
					runtime.map.fitWorld({ animate: true, padding: [20, 20] });
				}

				if (e.key === "Escape") {
					if (
						runtime.gameState === "PEACE_SELECT_1" ||
						runtime.gameState === "PEACE_SELECT_2"
					) {
						e.preventDefault();
						runtime.gameState = "SIMULATING";
						runtime.simulationClient.syncControls();
						runtime.statusText.innerText = "Conflict Continued";
						requestAnimationFrame(runtime.updateLoop);
					} else if (runtime.countryInspector.style.display === "block") {
						runtime.closeInspectorBtn.click();
					}
				}
			},
			true,
		);
	}

	function bindDocumentVisibilityChange() {
		document.addEventListener("visibilitychange", () => {
			runtime.simulationClient.syncControls();
			if (runtime.animationFrameId !== null)
				cancelAnimationFrame(runtime.animationFrameId);
			runtime.animationFrameId = null;
			if (!document.hidden && runtime.gameState === "SIMULATING")
				runtime.animationFrameId = requestAnimationFrame(runtime.updateLoop);
		});
	}

	return { bindDocumentKeydown, bindDocumentVisibilityChange };
}
