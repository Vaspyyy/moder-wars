import assert from "node:assert/strict";
import {
	createSimulationClock,
	LIVE_SIMULATION_CLOCK_OPTIONS,
} from "../src/simulation-clock.js";

// Controlled CPU workload. The fake wall clock charges six milliseconds per
// completed tick plus eight milliseconds between turns; no browser or sleeps.
function workload(options = {}) {
	let wall = 0,
		ticks = 0;
	const clock = createSimulationClock({
		...options,
		speed: 10,
		now: () => wall,
		onTick() {
			ticks++;
			wall += 6;
		},
	});
	clock.pump(wall);
	function run(ms) {
		const deadline = wall + ms,
			startTicks = ticks;
		while (wall < deadline) {
			clock.pump(wall);
			wall += 8;
		}
		return ticks - startTicks;
	}
	return {
		clock,
		run,
		get wall() {
			return wall;
		},
	};
}
const previous = workload();
const fastTicks = previous.run(4000);
const oldBacklog = previous.clock.snapshot().pendingTicks;
previous.clock.configure({ speed: 1 }, previous.wall);
const oldSlowTicks = previous.run(4000);
assert.ok(
	oldBacklog > 1000,
	"old live clock accumulates thousands of unprocessed ticks",
);
assert.ok(
	oldSlowTicks >= fastTicks * 0.9,
	"queued time makes 1x continue near the old full-throttle pace",
);

const live = workload(LIVE_SIMULATION_CLOCK_OPTIONS);
live.run(4000);
assert.ok(
	live.clock.snapshot().pendingTicks <= 60,
	"live queue remains bounded under sustained overload",
);
live.clock.configure({ speed: 1 }, live.wall);
assert.equal(
	live.clock.snapshot().pendingTicks,
	0,
	"lowering speed discards obsolete catch-up time immediately",
);
const slowTicks = live.run(4000);
assert.ok(
	slowTicks >= 230 && slowTicks <= 246,
	"after slowdown, the sustainable 1x pace is restored",
);
assert.ok(slowTicks < oldSlowTicks * 0.7);
console.log(
	`CPU-controlled speed regression: old backlog ${oldBacklog} ticks; old 10x/1x ${fastTicks}/${oldSlowTicks}, corrected 1x ${slowTicks} ticks per four-second window`,
);
