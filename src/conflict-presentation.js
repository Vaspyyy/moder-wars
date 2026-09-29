/** Browser presentation for domain events; the simulation never reads the DOM. */
export function createConflictPresentation(runtime) {
	function presentCapitulation(country) {
		runtime.statusText.innerText = `${country.name} HAS CAPITULATED`;
		runtime.treatyMsg.innerText = "NATION ANNEXED";
		document.getElementById("treaty-status").innerText =
			`${country.name} territory has been seized.`;
		runtime.treatyAlert.style.display = "block";
		runtime.scheduleWarLifecycleCallback(() => {
			if (runtime.gameState === "SIMULATING")
				runtime.treatyAlert.style.display = "none";
		}, 4000);
	}
	function presentTreatyStart() {
		runtime.playPeaceSound();

		// Stop recording if active
		if (runtime.mediaRecorder && runtime.mediaRecorder.state !== "inactive") {
			runtime.mediaRecorder.onstop = () => {
				const blob = new Blob(runtime.recordedChunks, { type: "video/webm" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `ModernWars_${Date.now()}.webm`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
				runtime.recordedChunks = [];
			};
			runtime.mediaRecorder.stop();
		}

		// Freeze time system at war end and reflect final date in the setup inputs
		if (
			runtime.gameTimeDate &&
			runtime.timeYearInput &&
			runtime.timeMonthInput &&
			runtime.timeDayInput
		) {
			runtime.gameTimeEnabled = false;
			runtime.gameTimeAccumulatorMs = 0;
			runtime.timeYearInput.value = runtime.gameTimeDate.year;
			runtime.timeMonthInput.value = runtime.gameTimeDate.month;
			runtime.timeDayInput.value = runtime.gameTimeDate.day;
			if (runtime.gameDateDisplay) {
				runtime.gameDateDisplay.textContent = runtime.formatGameDate();
				runtime.gameDateDisplay.style.display = "block";
			}
		}
	}
	function presentTreatyNotice({
		winnerName,
		loserNames,
		isTotalCapitulation,
		isNegotiatedPeace,
	}) {
		runtime.casualtyPanel.style.display = "none";
		if (isTotalCapitulation) {
			runtime.statusText.innerText = `Victory! ${winnerName} prevails${loserNames ? ` — ${loserNames} defeated` : ""}`;
			runtime.treatyMsg.innerText = "TOTAL ANNEXATION";
			document.getElementById("treaty-status").innerText =
				"The conflict has concluded";
			runtime.treatyAlert.style.display = "block";
		} else if (isNegotiatedPeace) {
			runtime.statusText.innerText = "Peace Treaty Signed";
			runtime.treatyMsg.innerText = "BORDERS REDRAWN";
			document.getElementById("treaty-status").innerText =
				"Territorial adjustments finalized";
			runtime.treatyAlert.style.display = "block";
		} else {
			runtime.statusText.innerText = "White Peace Signed";
		}
	}
	function onConflictMapChanged() {
		runtime.recalculateAllBounds();
		runtime.updateSidesUI();
		runtime.influenceLayer?.render();
	}
	function presentTreatyFinished() {
		runtime.animationFrameId = null;
		runtime.stopWarAmbiance();
		runtime.treatyAlert.style.display = "none";
		runtime.updateWarOverview(true);
		runtime.scheduleWarLifecycleCallback(
			runtime.reopenConflictSetupAfterWar,
			1500,
		);
	}
	return {
		presentCapitulation,
		presentTreatyStart,
		presentTreatyNotice,
		onConflictMapChanged,
		presentTreatyFinished,
	};
}
