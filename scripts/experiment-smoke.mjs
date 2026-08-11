import assert from "node:assert/strict";
import {
	appendWarCheckpoint,
	appendWarEvent,
	compareWarReports,
	createExperimentRecorder,
	createSeededRng,
	deriveDecisiveContributors,
	finalizeWarReport,
	hashScenarioContent,
	normalizeExperimentSpec,
	normalizeSeed,
	persistWarReport,
	readWarArchive,
	WAR_ARCHIVE_KEY,
	WAR_ARCHIVE_LIMIT,
} from "../src/experiment.js";

assert.equal(normalizeSeed(-1), 0xffffffff);
assert.equal(normalizeSeed("4294967297"), 1);
assert.equal(
	normalizeSeed("repeatable-label"),
	normalizeSeed("repeatable-label"),
);

const firstRng = createSeededRng(123456789);
const secondRng = createSeededRng(123456789);
const firstSequence = Array.from({ length: 6 }, () => firstRng.next());
assert.deepEqual(
	firstSequence,
	Array.from({ length: 6 }, () => secondRng.next()),
);
assert.deepEqual(
	firstSequence.map((value) => Number(value.toFixed(8))),
	[0.25779074, 0.97077211, 0.78532801, 0.20616458, 0.30307189, 0.74706605],
);
const savedState = firstRng.getState();
const savedValue = firstRng.next();
firstRng.setState(savedState);
assert.equal(firstRng.next(), savedValue);

const binaryScenario = Uint8Array.of(1, 2, 3, 4);
assert.equal(
	hashScenarioContent(binaryScenario),
	hashScenarioContent(binaryScenario.buffer),
);
assert.equal(
	hashScenarioContent({ z: 1, a: 2 }),
	hashScenarioContent({ a: 2, z: 1 }),
);

const spec = normalizeExperimentSpec({
	build: "0.27.2",
	scenario: {
		id: "smoke-map",
		name: "Smoke Test World",
		hash: hashScenarioContent(binaryScenario),
	},
	seed: "123456789",
	sides: [
		{
			uid: "allies",
			label: "Allied Coalition",
			color: "#4f83cc",
			countries: [
				{
					id: 1,
					name: "One",
					role: "PRIMARY",
					strategy: "AGGRESSIVE",
					buffState: "major",
					hiddenBuffState: "minor",
					color: "#3366aa",
				},
				{ id: 2, name: "Two", role: "SUPPORT" },
			],
		},
		{
			uid: "axis",
			name: "Axis",
			countries: [{ countryId: 3, displayName: "Three", role: "PRIMARY" }],
		},
		{ uid: "axis", name: "Third Coalition", countryIds: [4] },
	],
	hostilities: [
		{ attacker: "allies", defender: "axis" },
		{ attacker: "missing", defender: "allies" },
	],
	options: {
		warEconomy: false,
		armor: false,
		airPower: false,
		gameTime: { enabled: false, year: null, month: null, day: null },
		ffa: true,
		randomWar: true,
		randomWarChaining: true,
	},
});
assert.deepEqual(
	spec.sides.map((side) => side.uid),
	["allies", "axis", "axis-2"],
);
assert.equal(spec.sides[0].countries[0].id, 1);
assert.equal(spec.sides[1].countries[0].name, "Three");
assert.equal(spec.hostilities.length, 1);
assert.deepEqual(spec.scenario, {
	id: "smoke-map",
	name: "Smoke Test World",
	hash: hashScenarioContent(binaryScenario),
});
assert.equal(spec.scenarioId, "smoke-map");
assert.equal(spec.scenarioName, "Smoke Test World");
assert.equal(spec.sides[0].label, "Allied Coalition");
assert.equal(spec.sides[0].color, "#4f83cc");
assert.deepEqual(spec.sides[0].countries[0], {
	id: 1,
	name: "One",
	role: "PRIMARY",
	strategy: "AGGRESSIVE",
	buffState: "major",
	hiddenBuffState: "minor",
	color: "#3366aa",
});
assert.deepEqual(spec.options, {
	warEconomy: false,
	armor: false,
	airPower: false,
	gameTime: { enabled: false, year: null, month: null, day: null },
	ffa: true,
	randomWar: true,
	randomWarChaining: true,
});

const freshRematchSpec = normalizeExperimentSpec({
	...spec,
	seed: spec.seed + 1,
	parentReportId: "smoke-parent",
	runMode: "REMATCH",
});
const repeatSeedSpec = normalizeExperimentSpec({
	...spec,
	parentReportId: "smoke-parent",
	runMode: "REPEAT_SEED",
});
assert.notEqual(freshRematchSpec.seed, spec.seed);
assert.equal(repeatSeedSpec.seed, spec.seed);
assert.equal(freshRematchSpec.runMode, "REMATCH");
assert.equal(repeatSeedSpec.runMode, "REPEAT_SEED");
const originalRunRng = createSeededRng(spec.seed);
const repeatedRunRng = createSeededRng(repeatSeedSpec.seed);
assert.deepEqual(
	Array.from({ length: 4 }, () => originalRunRng.next()),
	Array.from({ length: 4 }, () => repeatedRunRng.next()),
);
assert.notEqual(
	createSeededRng(freshRematchSpec.seed).next(),
	createSeededRng(repeatSeedSpec.seed).next(),
);

const initialMetrics = [
	{
		sideUid: "allies",
		territory: 100,
		cities: 6,
		capitals: 2,
		personnel: 1000,
		casualties: 0,
		economy: 80,
		equipment: 70,
		activeCountries: 2,
	},
	{
		sideUid: "axis",
		territory: 95,
		cities: 5,
		capitals: 1,
		personnel: 900,
		casualties: 0,
		economy: 75,
		equipment: 68,
		activeCountries: 1,
	},
	{
		sideUid: "axis-2",
		territory: 60,
		cities: 3,
		capitals: 1,
		personnel: 500,
		casualties: 0,
		economy: 40,
		equipment: 35,
		activeCountries: 1,
	},
];
const recorder = createExperimentRecorder(spec, {
	runId: "smoke-parent",
	now: "2026-08-11T10:00:00.000Z",
	initialMetrics,
	maxEvents: 4,
	maxCheckpoints: 2,
});
for (let tick = 1; tick <= 5; tick++) {
	appendWarEvent(recorder, {
		type: tick === 4 ? "COUNTRY_CAPITULATED" : "CITY_CAPTURED",
		tick,
		actorSideUid: "allies",
		targetSideUid: "axis",
		summary: `Event ${tick}`,
		evidence: { cities: tick },
	});
}
appendWarEvent(recorder, {
	type: "INTERVENTION",
	tick: 6,
	actorSideUid: "allies",
	summary: "Director supplied equipment",
	evidence: { equipment: 10 },
	intervention: true,
});
assert.equal(recorder.events.length, 4);
assert.equal(recorder.events[0].tick, 3);
assert.equal(recorder.modified, true);

const checkpointRng = createSeededRng(spec.seed);
for (let tick = 200; tick <= 600; tick += 200) {
	checkpointRng.next();
	appendWarCheckpoint(recorder, {
		tick,
		reason: "TERRITORY_SCAN",
		sideMetrics: initialMetrics,
		rngState: checkpointRng.getState(),
		evidence: { randomWarChaining: spec.options.randomWarChaining },
	});
}
assert.equal(recorder.checkpoints.length, 2);
assert.equal(recorder.checkpoints[0].tick, 400);
assert.equal(recorder.checkpoints[1].rngState, checkpointRng.getState());
const resumedRng = createSeededRng(0);
resumedRng.setState(recorder.checkpoints[1].rngState);
assert.equal(resumedRng.next(), checkpointRng.next());
assert.deepEqual(recorder.checkpoints[1].evidence, {
	randomWarChaining: true,
});

const finalMetrics = [
	{
		sideUid: "allies",
		name: "Allies",
		territory: 170,
		cities: 11,
		capitals: 3,
		personnel: 850,
		casualties: 150,
		economy: 72,
		equipment: 80,
		activeCountries: 2,
	},
	{
		sideUid: "axis",
		name: "Axis",
		territory: 35,
		cities: 1,
		capitals: 0,
		personnel: 180,
		casualties: 720,
		economy: 18,
		equipment: 12,
		activeCountries: 0,
	},
	{
		sideUid: "axis-2",
		name: "Third Coalition",
		territory: 30,
		cities: 1,
		capitals: 0,
		personnel: 120,
		casualties: 380,
		economy: 15,
		equipment: 8,
		activeCountries: 0,
	},
];
const outcome = {
	type: "FULL_CAPITULATION",
	endingReason: "All hostile coalitions capitulated",
	winnerSideUid: "allies",
	survivingSideUids: ["allies"],
};
const contributors = deriveDecisiveContributors({
	initialMetrics,
	finalMetrics,
	events: recorder.events,
	outcome,
});
assert.equal(contributors.length, 3);
assert.ok(
	contributors.every((factor) => factor.summary.includes("contributor")),
);
assert.ok(
	contributors.every((factor) => Object.keys(factor.evidence).length > 0),
);

const parent = finalizeWarReport(recorder, {
	outcome,
	finalMetrics,
	durationTicks: 600,
	now: "2026-08-11T10:10:00.000Z",
});
assert.equal(parent.finalMetrics.length, 3);
assert.equal(parent.decisiveContributors.length, 3);
assert.equal(parent.interventions.length, 1);
assert.equal(parent.modified, true);
assert.deepEqual(parent.configuration, spec);
assert.equal(parent.configuration.options.warEconomy, false);
assert.equal(parent.configuration.options.armor, false);
assert.equal(parent.configuration.options.airPower, false);
assert.equal(parent.configuration.options.gameTime.enabled, false);

const childRecorder = createExperimentRecorder(
	{ ...spec, parentReportId: parent.id, runMode: "REMATCH" },
	{ runId: "smoke-child", now: "2026-08-11T11:00:00.000Z", initialMetrics },
);
const child = finalizeWarReport(childRecorder, {
	outcome: {
		...outcome,
		type: "NEGOTIATED_PEACE",
		endingReason: "Peace agreement",
	},
	finalMetrics: finalMetrics.map((side) => ({
		...side,
		territory: side.territory + 5,
	})),
	durationTicks: 500,
	now: "2026-08-11T11:08:00.000Z",
	parentReport: parent,
});
const comparison = compareWarReports(parent, child);
assert.equal(comparison.outcomeChanged, true);
assert.equal(comparison.durationTicks, -100);
assert.ok(comparison.sideDeltas.every((side) => side.territory === 5));
assert.deepEqual(child.comparison, comparison);

const endingCases = [
	{
		type: "NEGOTIATED_PEACE",
		endingReason: "Coalitions accepted a negotiated settlement",
		winnerSideUid: "allies",
		survivingSideUids: ["allies", "axis", "axis-2"],
		eventType: "PEACE_ACCEPTED",
	},
	{
		type: "WHITE_PEACE",
		endingReason: "No coalition secured victory",
		winnerSideUid: null,
		survivingSideUids: ["allies", "axis", "axis-2"],
		eventType: "PEACE_ACCEPTED",
	},
	{
		type: "SEPARATE_PEACE",
		endingReason: "Third Coalition exited separately",
		winnerSideUid: "allies",
		survivingSideUids: ["allies", "axis"],
		eventType: "SIDE_WITHDRAWN",
	},
	{
		type: "FULL_CAPITULATION",
		endingReason: "A successful rebellion collapsed the remaining coalition",
		winnerSideUid: "allies",
		survivingSideUids: ["allies"],
		eventType: "REBELLION_SUCCEEDED",
	},
];

for (const [index, ending] of endingCases.entries()) {
	const shapeRecorder = createExperimentRecorder(spec, {
		runId: `ending-shape-${index}`,
		now: `2026-08-11T12:0${index}:00.000Z`,
		initialMetrics,
	});
	appendWarEvent(shapeRecorder, {
		type: "RANDOM_WAR_STARTED",
		tick: 1,
		source: "random-war",
		actorSideUid: "allies",
		targetSideUid: "axis",
		summary: "Random War chained into a multi-side FFA conflict",
		evidence: { freeForAll: true, chained: true, sideCount: 3 },
	});
	appendWarEvent(shapeRecorder, {
		type: "REBELLION_STARTED",
		tick: 40,
		actorCountryId: 4,
		actorSideUid: "axis-2",
		targetSideUid: "axis",
		summary: "Country Four started a rebellion",
		evidence: { parentSideUid: "axis" },
	});
	appendWarEvent(shapeRecorder, {
		type: ending.eventType,
		tick: 80,
		actorSideUid: "axis-2",
		targetSideUid: "axis",
		summary: ending.endingReason,
		evidence: { endingType: ending.type },
		major: true,
	});
	const shapeReport = finalizeWarReport(shapeRecorder, {
		outcome: ending,
		finalMetrics,
		durationTicks: 80,
		now: `2026-08-11T12:1${index}:00.000Z`,
	});
	assert.equal(shapeReport.outcome.type, ending.type);
	assert.equal(shapeReport.outcome.winnerSideUid, ending.winnerSideUid);
	assert.deepEqual(
		shapeReport.outcome.survivingSideUids,
		ending.survivingSideUids,
	);
	assert.equal(shapeReport.configuration.sides.length, 3);
	assert.equal(shapeReport.configuration.options.ffa, true);
	assert.equal(shapeReport.configuration.options.randomWar, true);
	assert.equal(shapeReport.configuration.options.randomWarChaining, true);
	assert.ok(
		shapeReport.pivotalEvents.some((event) => event.type === ending.eventType),
	);
	assert.ok(
		shapeReport.pivotalEvents.some(
			(event) => event.type === "REBELLION_STARTED",
		),
	);
}

class MemoryStorage {
	constructor(maxLength = Infinity) {
		this.maxLength = maxLength;
		this.values = new Map();
	}
	getItem(key) {
		return this.values.get(key) ?? null;
	}
	setItem(key, value) {
		if (value.length > this.maxLength) throw new Error("QuotaExceededError");
		this.values.set(key, value);
	}
}

const storage = new MemoryStorage();
for (let index = 0; index < 30; index++) {
	persistWarReport({ ...parent, id: `report-${index}` }, storage);
}
const archive = readWarArchive(storage);
assert.equal(archive.length, WAR_ARCHIVE_LIMIT);
assert.equal(archive[0].id, "report-29");
assert.equal(archive.at(-1).id, "report-5");
assert.ok(storage.getItem(WAR_ARCHIVE_KEY));

const quotaStorage = new MemoryStorage(
	JSON.stringify([archiveSummary(parent)]).length * 3,
);
function archiveSummary(report) {
	return { ...report, pivotalEvents: [], interventions: [] };
}
for (let index = 0; index < 10; index++) {
	persistWarReport({ ...parent, id: `quota-${index}` }, quotaStorage);
}
const quotaArchive = readWarArchive(quotaStorage);
assert.ok(quotaArchive.length > 0 && quotaArchive.length < 10);
assert.equal(quotaArchive[0].id, "quota-9");

console.log("Experiment smoke tests passed.");
