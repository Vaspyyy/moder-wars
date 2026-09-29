// Dependencies are supplied by the application; this module does not import it.
export function createSimulationCalendar(runtime) {
	function setGameTimeFromInputs() {
		if (!runtime.timeSystemCheckbox?.checked) {
			runtime.gameTimeEnabled = false;
			runtime.gameTimeDate = null;
			runtime.gameTimeAccumulatorMs = 0;
			if (runtime.gameDateDisplay)
				runtime.gameDateDisplay.style.display = "none";
			return;
		}
		const y = parseInt(runtime.timeYearInput.value || "0", 10);
		const m = parseInt(runtime.timeMonthInput.value || "0", 10);
		const d = parseInt(runtime.timeDayInput.value || "0", 10);
		if (!y || !m || !d) {
			// fallback default if user left blanks
			runtime.gameTimeDate = { year: 1936, month: 1, day: 1 };
		} else {
			runtime.gameTimeDate = { year: y, month: m, day: d };
		}
		runtime.gameTimeEnabled = true;
		runtime.gameTimeAccumulatorMs = 0;
		if (runtime.gameDateDisplay) {
			runtime.gameDateDisplay.style.display = "block";
			runtime.gameDateDisplay.textContent = formatGameDate();
		}
	}

	function formatGameDate() {
		if (!runtime.gameTimeDate) return "0000/00/00";
		const y = runtime.gameTimeDate.year.toString().padStart(4, "0");
		const m = runtime.gameTimeDate.month.toString().padStart(2, "0");
		const d = runtime.gameTimeDate.day.toString().padStart(2, "0");
		return `${y}/${m}/${d}`;
	}

	function daysInMonth(year, month) {
		if (
			month === 1 ||
			month === 3 ||
			month === 5 ||
			month === 7 ||
			month === 8 ||
			month === 10 ||
			month === 12
		)
			return 31;
		if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
		// February
		const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
		return isLeap ? 29 : 28;
	}

	function advanceGameDateOneDay() {
		if (!runtime.gameTimeEnabled || !runtime.gameTimeDate) return;
		runtime.gameTimeDate.day += 1;
		const dim = daysInMonth(
			runtime.gameTimeDate.year,
			runtime.gameTimeDate.month,
		);
		if (runtime.gameTimeDate.day > dim) {
			runtime.gameTimeDate.day = 1;
			runtime.gameTimeDate.month += 1;
			if (runtime.gameTimeDate.month > 12) {
				runtime.gameTimeDate.month = 1;
				runtime.gameTimeDate.year += 1;
			}
		}
		if (runtime.gameDateDisplay) {
			runtime.gameDateDisplay.textContent = formatGameDate();
		}
	}

	function tickGameTime(elapsedMs) {
		if (
			!runtime.gameTimeEnabled ||
			runtime.gameState !== "SIMULATING" ||
			runtime.isPaused ||
			!runtime.gameTimeDate
		)
			return;

		// Scale in-game time progression with the current simulation speed
		runtime.gameTimeAccumulatorMs += elapsedMs * runtime.simSpeed;
		const step = runtime.gameTimeDayDurationMs;
		while (
			runtime.gameTimeAccumulatorMs >= step &&
			runtime.gameState === "SIMULATING"
		) {
			advanceGameDateOneDay();
			runtime.gameTimeAccumulatorMs -= step;
		}
	}
	return {
		setGameTimeFromInputs,
		formatGameDate,
		daysInMonth,
		advanceGameDateOneDay,
		tickGameTime,
	};
}
