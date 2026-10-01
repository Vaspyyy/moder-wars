#!/usr/bin/env node
// Offline, seeded strategic evaluation on the real 2022 geography. No browser.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSimulationCore } from "../src/simulation-core.js";
import {
	CASES,
	createProfileFixture,
	repeatableRandom,
} from "./profiling/fixture.mjs";
import { distribution } from "./profiling/statistics.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(name);
	return i < 0 ? fallback : args[i + 1];
};
const ticks = Number(option("--ticks", 900)),
	units = Number(option("--units", 120));
const cases = option("--cases", "africa,regional,ffa").split(",");
assert.ok(Number.isSafeInteger(ticks) && ticks > 0);
assert.ok(Number.isSafeInteger(units) && units > 0 && units <= 2400);
CASES.africa = { countries: ["Côte d'Ivoire", "Mali"], unitsPerSide: units };
const originalRandom = Math.random,
	originalInfo = console.info;
const reports = [];
try {
	console.info = () => {};
	for (const name of cases) {
		assert.ok(CASES[name], `Unknown case: ${name}`);
		Math.random = repeatableRandom();
		const { state, fixture } = createProfileFixture({
			case: name,
			unitsPerSide: units,
			gridRes: 0.25,
			ticks,
			warmup: 0,
		});
		const core = createSimulationCore(state),
			times = [],
			samples = [],
			tracks = new Map(),
			phases = {};
		let loops = 0,
			unsafeMoves = 0,
			ended = false;
		for (let tick = 0; tick < ticks; tick++) {
			const start = performance.now();
			if (!core.tick()) {
				ended = true;
				break;
			}
			times.push(performance.now() - start);
			for (const forces of core.state._aiTaskForcesBySide.values())
				for (const force of forces)
					phases[force.phase] = (phases[force.phase] || 0) + 1;
			if (tick % 30) continue;
			const occupied = new Map(),
				statuses = {},
				types = {};
			for (const unit of core.state.units) {
				assert.ok(
					Number.isFinite(unit.lat) &&
						Number.isFinite(unit.lng) &&
						Number.isFinite(unit.health),
				);
				if (unit.health <= 0 || unit.deployTicks > 0) continue;
				const idx = core.state.getGridIndex(unit.lat, unit.lng),
					key = `${unit.sideIndex}:${idx}`;
				occupied.set(key, (occupied.get(key) || 0) + 1);
				if (unit._armyOrder) {
					types[unit._armyOrder.type] = (types[unit._armyOrder.type] || 0) + 1;
					const status = unit._armyMoveStatus || "ORDERED";
					statuses[status] = (statuses[status] || 0) + 1;
					if (status === "MOVING" && (idx < 0 || !core.state.landMask[idx]))
						unsafeMoves++;
					let track = tracks.get(unit.id);
					if (!track || track.signature !== unit._armyOrder.signature) {
						track = { signature: unit._armyOrder.signature, cells: [] };
						tracks.set(unit.id, track);
					}
					if (track.cells.at(-1) !== idx) {
						if (track.cells.filter((cell) => cell === idx).length >= 2) loops++;
						track.cells.push(idx);
						if (track.cells.length > 12) track.cells.shift();
					}
				}
			}
			const armies = core.state._aiDebugPlans
				.map((plan) => plan?.army)
				.filter(Boolean);
			samples.push({
				tick,
				units: core.state.units.length,
				maxCellOccupancy: Math.max(0, ...occupied.values()),
				sectors: armies.reduce((sum, army) => sum + army.stats.sectors, 0),
				uncovered: armies.reduce((sum, army) => sum + army.stats.uncovered, 0),
				types,
				statuses,
			});
		}
		assert.equal(unsafeMoves, 0, "ordered land movement cannot enter water");
		if (args.includes("--require-attack"))
			assert.ok(
				phases.ATTACKING > 0,
				`${name} must actually launch an operation`,
			);
		const outcome = core.state.sides.map((side, index) => ({
			countries: side.map((c) => c.name),
			casualties: core.state.sideCasualties[index],
			reservePersonnel: core.state.sideRecruitableManpower[index],
			units: core.state.units.filter(
				(u) => u.sideIndex === index && u.health > 0,
			).length,
			controlledCells: side.reduce(
				(sum, c) =>
					sum + (core.state.latestCountryStats.get(c.id)?.controlled || 0),
				0,
			),
			operations: (
				core.state._aiTaskForcesBySide.get(core.state.sideUids[index]) || []
			).map((force) => ({
				phase: force.phase,
				stage: force.stage,
				readiness: force.readiness,
				desiredPower: force.desiredPower,
				currentPower: force.currentPower,
				staging: force.stagingAnchor,
				target: force.target,
				progress: force.progress,
				units: force.assignedUnitIds.length,
				reason: force.completionReason,
				flankUnsafe: force.flankUnsafe,
				forceRatio: force.forceRatio,
			})),
		}));
		reports.push({
			fixture,
			ticks: times.length,
			ended,
			phases,
			cpu: distribution(times),
			loops,
			unsafeMoves,
			final: samples.at(-1),
			outcome,
			samples,
		});
		console.log(
			`${name}: ${times.length} ticks, ${reports.at(-1).cpu.mean.toFixed(2)} ms/tick; final uncovered ${samples.at(-1)?.uncovered}/${samples.at(-1)?.sectors}, max cell occupancy ${samples.at(-1)?.maxCellOccupancy}, repeated-cell events ${loops}`,
		);
	}
} finally {
	Math.random = originalRandom;
	console.info = originalInfo;
}
const directory = resolve(
	option("--output", "performance-results/army-evaluation"),
);
mkdirSync(directory, { recursive: true });
writeFileSync(
	resolve(directory, "report.json"),
	JSON.stringify(
		{
			seed: "0x5eed1234",
			note: "Node CPU and bounded seeded scenarios; not browser FPS or proof of general strategic superiority. Repeated-cell events include legitimate returning movement.",
			reports,
		},
		null,
		2,
	),
);
console.log(`Evaluation saved: ${directory}/report.json`);
