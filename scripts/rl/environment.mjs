import { performance } from "node:perf_hooks";
import {
	COMMANDER_SCHEMA,
	chooseCommanderAction,
	commanderStateFeatures,
} from "../../src/commander-policy.js";
import { createSimulationCore } from "../../src/simulation-core.js";
import { CASES, createProfileFixture } from "../profiling/fixture.mjs";
import { randomStream } from "./common.mjs";

export const SCENARIOS = Object.freeze({
	two: { countries: ["Turkey", "Iraq"], split: "train" },
	three: { countries: ["Germany", "France", "Italy"], split: "train" },
	"heldout-two": { countries: ["Côte d'Ivoire", "Mali"], split: "evaluation" },
	"heldout-three": {
		countries: ["Germany", "France", "Poland"],
		split: "evaluation",
	},
});

export function scenarioList(names, split) {
	const list = names.split(",");
	if (
		!list.length ||
		list.some((name) => !SCENARIOS[name] || SCENARIOS[name].split !== split)
	)
		throw new RangeError(`Scenarios must belong to ${split}: ${names}`);
	return list;
}

function sideMetrics(context, initial) {
	const controlled = new Array(initial.length).fill(0);
	const initialIndex = context.sideUids.map((uid) =>
		initial.findIndex((side) => side.uid === uid),
	);
	for (let cell = 0; cell < context.dominantSideMap.length; cell++) {
		if (context.landMask[cell] !== 2) continue;
		const index = initialIndex[context.dominantSideMap[cell]];
		if (index >= 0) controlled[index]++;
	}
	return initial.map((side, index) => {
		const current = context.sideUids.indexOf(side.uid);
		const casualties =
			current < 0 ? side.personnel : context.sideCasualties[current];
		const casualtyRatio = casualties / Math.max(1, side.personnel);
		return {
			uid: side.uid,
			controlled: controlled[index],
			casualties,
			territoryRatio: controlled[index] / Math.max(1, side.cells),
			potential:
				controlled[index] / Math.max(1, side.cells) - 1 - 0.25 * casualtyRatio,
			active: current >= 0 && context.sides[current].length > 0,
		};
	});
}

/** Synchronous rollouts isolate simulation RNG from policy exploration and always restore globals. */
export function runEpisode({
	scenario = "two",
	seed = 17,
	ticks = 1800,
	units = 40,
	grid = 0.5,
	policies = [],
	learnerSides = [],
	teacher = false,
	policyRandom = randomStream(seed ^ 0x51f15e),
	record = true,
} = {}) {
	const definition = SCENARIOS[scenario];
	if (!definition) throw new RangeError(`Unknown RL scenario ${scenario}`);
	const simRandom = randomStream(seed);
	const originalRandom = Math.random,
		originalInfo = console.info;
	const trajectories = new Map();
	let core,
		initial,
		tickCount = 0,
		cpuMs = 0;
	const closeInterval = (trajectory, context, currentMetrics) => {
		const previous = trajectory.records.at(-1);
		if (!previous || previous.reward != null) return;
		const metrics = currentMetrics[trajectory.sideIndex];
		previous.reward = metrics.potential - previous.potential;
		previous.elapsed = Math.max(1, context._simTickCount - previous.tick);
	};
	try {
		Math.random = simRandom;
		console.info = () => {};
		const caseName = `rl-${scenario}`;
		CASES[caseName] = { countries: definition.countries, unitsPerSide: units };
		const fixture = createProfileFixture({
			case: caseName,
			unitsPerSide: units,
			gridRes: grid,
			ticks,
			warmup: 0,
		});
		fixture.state.commanderDisabled = true;
		initial = fixture.state.sides.map((side, index) => ({
			uid: fixture.state.sideUids[index],
			countries: side.map((country) => country.name),
			cells: fixture.fixture.selectedCells[index],
			personnel: fixture.state.initialSideSoldiers[index],
		}));
		for (const sideIndex of learnerSides) {
			if (!initial[sideIndex])
				throw new RangeError(`Unknown learner side ${sideIndex}`);
			trajectories.set(initial[sideIndex].uid, {
				sideIndex,
				sideUid: initial[sideIndex].uid,
				records: [],
			});
		}
		core = createSimulationCore(fixture.state, {
			commander: {
				decide: (observation, sideIndex) => {
					if (teacher) return null;
					const model = policies[sideIndex];
					return model
						? chooseCommanderAction(
								model,
								observation,
								learnerSides.includes(sideIndex) ? policyRandom : null,
							)
						: null;
				},
				onDecision: record
					? (decision, context) => {
							const trajectory = trajectories.get(decision.sideUid);
							if (!trajectory) return;
							const currentMetrics = sideMetrics(context, initial);
							closeInterval(trajectory, context, currentMetrics);
							trajectory.records.push({
								schema: COMMANDER_SCHEMA,
								tick: decision.tick,
								stateFeatures: decision.observation.stateFeatures,
								candidates: decision.observation.candidates.map(
									({ kind, features }) => ({ kind, features }),
								),
								action: teacher
									? decision.observation.teacherAction
									: decision.actionIndex,
								teacherAction: decision.observation.teacherAction,
								potential: currentMetrics[trajectory.sideIndex].potential,
								reward: null,
								elapsed: null,
							});
						}
					: null,
			},
		});
		for (; tickCount < ticks; tickCount++) {
			const start = performance.now();
			const advanced = core.tick();
			cpuMs += performance.now() - start;
			if (!advanced) break;
			if (core.state.gameState === "WAR_OVER") {
				tickCount++;
				break;
			}
		}
		const metrics = sideMetrics(core.state, initial);
		const terminated = core.state.gameState === "WAR_OVER";
		const active = metrics.flatMap((side, index) =>
			side.active ? [index] : [],
		);
		// Time limits never manufacture a winner from territory or shaped reward.
		const winner = terminated && active.length === 1 ? active[0] : null;
		for (const trajectory of trajectories.values()) {
			closeInterval(trajectory, core.state, metrics);
			const last = trajectory.records.at(-1);
			if (last && winner != null)
				last.reward += winner === trajectory.sideIndex ? 1 : -1;
			const index = core.state.sideUids.indexOf(trajectory.sideUid);
			trajectory.terminal = terminated;
			trajectory.finalFeatures =
				index < 0 || !metrics[trajectory.sideIndex].active
					? null
					: commanderStateFeatures(core.state, index);
		}
		return {
			format: "mw-commander-episode",
			schema: COMMANDER_SCHEMA,
			scenario,
			split: definition.split,
			seed,
			ticks: tickCount,
			terminated,
			truncated: !terminated,
			winner,
			cpuMs,
			msPerTick: cpuMs / Math.max(1, tickCount),
			fixture: fixture.fixture,
			initial,
			final: metrics,
			trajectories: [...trajectories.values()],
		};
	} finally {
		Math.random = originalRandom;
		console.info = originalInfo;
	}
}
