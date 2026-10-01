/** Fixed simulation time advances independently of display refresh and rendering. */
export const LIVE_SIMULATION_CLOCK_OPTIONS = Object.freeze({
	maxPendingTicks: 60,
	resetBacklogOnSpeedReduction: true,
});

export function createSimulationClock(callbackOrOptions = {}, options = {}) {
	const {
		onTick,
		now = () => performance.now(),
		ticksPerSecond = 60,
		maxTicksPerTurn = 6,
		maxTurnMs = 8,
		maxPendingTicks = Infinity,
		resetBacklogOnSpeedReduction = false,
		speed = 1,
		paused = false,
	} = typeof callbackOrOptions === "function"
		? { ...options, onTick: callbackOrOptions }
		: callbackOrOptions;
	if (typeof onTick !== "function")
		throw new TypeError("A tick callback is required");
	if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0)
		throw new RangeError("Tick frequency must be positive");
	if (!Number.isInteger(maxTicksPerTurn) || maxTicksPerTurn < 1)
		throw new RangeError("A turn must permit at least one tick");
	if (!(maxTurnMs > 0)) throw new RangeError("Turn budget must be positive");
	if (
		maxPendingTicks !== Infinity &&
		(!Number.isInteger(maxPendingTicks) || maxPendingTicks < 1)
	)
		throw new RangeError("Pending tick limit must be a positive integer");
	const tickMs = 1000 / ticksPerSecond;
	const turnLimit = Math.min(6, maxTicksPerTurn);
	let lastTimestamp = null;
	let accumulatorMs = 0;
	let completedTicks = 0;
	let currentSpeed = validateSpeed(speed);
	let isPaused = Boolean(paused);

	function validateSpeed(value) {
		if (!Number.isFinite(value) || value <= 0)
			throw new RangeError("Simulation speed must be positive");
		return value;
	}

	function accrue(timestamp) {
		if (!Number.isFinite(timestamp))
			throw new TypeError("Timestamp must be finite");
		if (lastTimestamp !== null && timestamp < lastTimestamp)
			throw new RangeError("Simulation timestamps must be monotonic");
		if (lastTimestamp !== null && !isPaused)
			accumulatorMs = Math.min(
				accumulatorMs + (timestamp - lastTimestamp) * currentSpeed,
				tickMs * maxPendingTicks,
			);
		lastTimestamp = timestamp;
	}

	function snapshot() {
		return {
			tickMs,
			speed: currentSpeed,
			paused: isPaused,
			accumulatorMs,
			pendingTicks: Math.floor((accumulatorMs + tickMs * 1e-9) / tickMs),
			completedTicks,
		};
	}

	function advance(timestamp = now()) {
		accrue(timestamp);
		let ticks = 0;
		const started = now();
		while (
			!isPaused &&
			accumulatorMs + tickMs * 1e-9 >= tickMs &&
			ticks < turnLimit
		) {
			if (ticks > 0 && now() - started >= maxTurnMs) break;
			if (onTick(tickMs) === false) {
				isPaused = true;
				accumulatorMs = 0;
				break;
			}
			accumulatorMs = Math.max(0, accumulatorMs - tickMs);
			ticks++;
			completedTicks++;
		}
		return { ticks, ...snapshot() };
	}

	function setControl(control = {}, timestamp = now()) {
		const nextSpeed =
			control.speed == null ? currentSpeed : validateSpeed(control.speed);
		accrue(timestamp);
		// Live play follows the newly selected pace. Keeping old high-speed debt
		// would run at full throughput long after the player asks to slow down.
		if (resetBacklogOnSpeedReduction && nextSpeed < currentSpeed)
			accumulatorMs = 0;
		currentSpeed = nextSpeed;
		if (control.paused != null) {
			const nextPaused = Boolean(control.paused);
			if (nextPaused !== isPaused || nextPaused) accumulatorMs = 0;
			isPaused = nextPaused;
		}
		return snapshot();
	}

	function reset(timestamp = null) {
		if (timestamp !== null && !Number.isFinite(timestamp))
			throw new TypeError("Timestamp must be finite");
		accumulatorMs = 0;
		lastTimestamp = timestamp;
		return snapshot();
	}

	return {
		advance,
		pump: advance,
		setControl,
		configure: setControl,
		reset,
		snapshot,
	};
}
