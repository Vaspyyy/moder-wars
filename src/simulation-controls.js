// Controls receive live state and commands; they do not import the application.
export function createSimulationControls(runtime) {
	function bindDocumentKeydown() {
		document.addEventListener("keydown", (e) => {
			// Don't trigger if user is typing in an input or textarea
			if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName))
				return;

			if (e.code === "Space") {
				if (runtime.gameState === "SIMULATING") {
					e.preventDefault();
					runtime.togglePause();
				}
			}

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
					runtime.statusText.innerText = "Conflict Continued";
					requestAnimationFrame(runtime.updateLoop);
				} else if (runtime.countryInspector.style.display === "block") {
					runtime.closeInspectorBtn.click();
				}
			}
		});
	}

	function bindDocumentVisibilityChange() {
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				// Stop visual loop and start a lightweight background tick loop
				if (runtime.animationFrameId !== null) {
					cancelAnimationFrame(runtime.animationFrameId);
					runtime.animationFrameId = null;
				}
				if (!runtime.backgroundTickId && runtime.gameState === "SIMULATING") {
					runtime.backgroundTickId = setInterval(() => {
						if (runtime.gameState !== "SIMULATING" || runtime.isPaused) return;
						// Advance simulation based on simSpeed, but skip rendering/UI-heavy work
						runtime.frameAccumulator += runtime.simSpeed;
						while (runtime.frameAccumulator >= 1) {
							const warEnded = runtime.performSimulationTick();
							if (warEnded) {
								runtime.frameAccumulator = 0;
								break;
							}
							runtime.frameAccumulator -= 1;
						}
						// Advance in-game date based on background tick interval
						runtime.tickGameTime(100);
						runtime.simFrameCount++;
					}, 100); // ~10 ticks per second while unfocused
				}
			} else {
				// Back to foreground: stop background loop and resume visual loop
				if (runtime.backgroundTickId) {
					clearInterval(runtime.backgroundTickId);
					runtime.backgroundTickId = null;
				}
				if (runtime.gameState === "SIMULATING") {
					if (runtime.animationFrameId !== null) {
						cancelAnimationFrame(runtime.animationFrameId);
					}
					runtime.animationFrameId = requestAnimationFrame(runtime.updateLoop);
				}
			}
		});
	}
	return { bindDocumentKeydown, bindDocumentVisibilityChange };
}
