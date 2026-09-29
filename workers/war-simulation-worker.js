import { createSimulationClock } from "../src/simulation-clock.js";
import { createSimulationCore } from "../src/simulation-core.js";
import {
	captureSimulationState,
	collectTransferBuffers,
	createControlDeltaTracker,
	createPresentationSnapshot,
	SIMULATION_PROTOCOL_VERSION,
} from "../src/simulation-protocol.js";

let core,
	clock,
	tracker,
	epoch,
	timer,
	outstanding = false,
	lastSnapshot = 0;
let topology = false;
let lastPublishedTick = -1;
const events = [];
function publish(force = false) {
	if (
		core &&
		!force &&
		core.state._simTickCount === lastPublishedTick &&
		!events.length
	)
		return;
	if (
		!core ||
		outstanding ||
		(!force && performance.now() - lastSnapshot < 1000 / 30)
	)
		return;
	const snapshot = createPresentationSnapshot(core.state, tracker, {
		includeTopology: topology,
	});
	topology = false;
	lastPublishedTick = core.state._simTickCount;
	snapshot.events = events.splice(0);
	lastSnapshot = performance.now();
	outstanding = true;
	self.postMessage(
		{ type: "SNAPSHOT", epoch, snapshot },
		collectTransferBuffers(snapshot),
	);
}
function turn() {
	if (!core) return;
	try {
		clock.pump(performance.now());
		publish(events.length > 0);
		if (core.state.gameState === "SIMULATING") timer = setTimeout(turn, 8);
	} catch (error) {
		clock.configure({ paused: true });
		const state = captureSimulationState(core.state, { denseInfluence: true });
		self.postMessage({
			type: "ERROR",
			epoch,
			message: error.stack || error.message,
			state,
		});
	}
}
self.onmessage = ({ data }) => {
	try {
		if (data.type === "INIT") {
			clearTimeout(timer);
			epoch = data.epoch;
			outstanding = false;
			events.length = 0;
			topology = false;
			lastPublishedTick = -1;
			if (data.version !== SIMULATION_PROTOCOL_VERSION)
				throw new Error("Simulation protocol mismatch");
			core = createSimulationCore(data.state, {
				onEvent: (type, ...args) => {
					events.push({ type, args });
					if (
						type === "onConflictMapChanged" ||
						type === "onPoliticalMapChanged"
					) {
						topology = true;
						tracker?.markAll();
					}
				},
				onControlCellsChanged: (indices) => {
					if (indices == null) tracker?.markAll();
					else
						for (const index of typeof indices === "number"
							? [indices]
							: indices)
							tracker?.markCell(index);
				},
			});
			tracker = createControlDeltaTracker(core.state);
			clock = createSimulationClock(() => core.tick(), {
				speed: core.state.simSpeed,
				paused: core.state.isPaused,
			});
			self.postMessage({ type: "READY", epoch });
			turn();
			return;
		}
		if (data.epoch !== epoch || !core) return;
		if (data.type === "ACK") {
			outstanding = false;
			publish(events.length > 0 || data.requestSnapshot === true);
		} else if (data.type === "CONTROL") {
			core.command(data);
			clock.configure({
				speed: core.state.simSpeed,
				paused: core.state.isPaused || core.state.gameState !== "SIMULATING",
			});
		} else if (data.type === "COMMAND") {
			core.command(data.command);
			publish(true);
		} else if (data.type === "HANDOFF") {
			clearTimeout(timer);
			clock.configure({ paused: true });
			const state = captureSimulationState(core.state, {
				denseInfluence: true,
			});
			self.postMessage(
				{
					type: "HANDOFF",
					epoch,
					requestId: data.requestId,
					state,
					events: events.splice(0),
				},
				collectTransferBuffers(state),
			);
		}
	} catch (error) {
		self.postMessage({
			type: "ERROR",
			epoch,
			message: error.stack || error.message,
		});
	}
};
