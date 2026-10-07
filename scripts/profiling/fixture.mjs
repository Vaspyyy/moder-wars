import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createArmyFormation } from "../../src/army-formation.js";
import {
	createSparseInfluenceMap,
	writeInfluence,
} from "../../src/influence-grid.js";
import { decodeRiverLines, rasterizeRiverMask } from "../../src/river-lines.js";
import { decodeScenarioBinary } from "../../src/scenario-codec.js";
import { cloneSimulationData } from "../../src/simulation-protocol.js";
import { createSimulationState } from "../../src/simulation-state.js";

export const CASES = {
	regional: { countries: ["Turkey", "Iraq"], unitsPerSide: 500 },
	large: {
		countries: ["Russia", "People's Republic of China"],
		unitsPerSide: 1200,
	},
	ffa: {
		countries: ["Germany", "France", "Italy", "Poland"],
		unitsPerSide: 400,
	},
};
export const RIVERS_URL = new URL(
	"../../assets/geodata/derived/rivers-50m.bin.gz",
	import.meta.url,
);
export const MAP_URL = new URL(
	"../../assets/maps/compiled/world-map-2022-v3.mwsc.gz",
	import.meta.url,
);

// Benchmark-only repeatable random stream. No gameplay seed system is introduced.
export function repeatableRandom() {
	let value = 0x5eed1234;
	return () => {
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		return (value >>> 0) / 4294967296;
	};
}

export function createProfileFixture(options) {
	const stages = {};
	let started = performance.now();
	const compressed = readFileSync(MAP_URL);
	const bytes = gunzipSync(compressed);
	stages.readAndInflateMs = performance.now() - started;
	started = performance.now();
	const decoded = decodeScenarioBinary(bytes, {
		targetGridRes: options.gridRes,
	});
	stages.decodeMs = performance.now() - started;
	started = performance.now();
	const definition = CASES[options.case];
	if (!definition) throw new Error(`Unknown case: ${options.case}`);
	const count = options.unitsPerSide ?? definition.unitsPerSide;
	const metadata = cloneSimulationData(decoded.scenario.metadata);
	const countries = definition.countries.map((name) => {
		const country = metadata.find((item) => item?.name === name);
		if (!country) throw new Error(`Map has no country named ${name}`);
		return {
			...country,
			role: "OFFENSE",
			strategy: "BALANCED",
			buffState: "none",
			hiddenBuffState: "none",
			troops: count * 1250,
			initialCells: 0,
		};
	});
	const { width: gridWidth, height: gridHeight, length } = decoded.target;
	const sideByCountry = new Map(
		countries.map((country, side) => [country.id, side]),
	);
	const cells = countries.map(() => []);
	const fronts = countries.map(() => []);
	const state = createSimulationState({
		CONFIG: { GRID_RES: options.gridRes, MAX_UNITS_PER_SIDE: count },
		gridWidth,
		gridHeight,
		simSpeed: 1,
		gameState: "SIMULATING",
		isPaused: false,
		peaceTreatiesDisabled: true,
		bombsDisabled: true,
		warGraceEndTick: 600,
		countryMetadata: metadata,
		sides: countries.map((country) => [country]),
		worldControlMap: decoded.worldControl,
		deJureMap: decoded.deJure,
		provinceMap: decoded.province,
		biomeMask: decoded.biome,
		landMask: decoded.land,
		terrainMask: new Float32Array(length),
		riverMask: rasterizeRiverMask(
			decodeRiverLines(gunzipSync(readFileSync(RIVERS_URL)).buffer),
			{
				gridWidth,
				gridHeight,
				gridRes: options.gridRes,
				landMask: decoded.land,
			},
		),
		primaryOccupierMap: new Uint16Array(length),
		dominantSideMap: new Int8Array(length).fill(-1),
		occupationMap: new Float32Array(length),
		sideInfluenceMaps: countries.map(() => createSparseInfluenceMap(length)),
	});
	for (const country of metadata)
		if (country)
			country.bounds = {
				minX: gridWidth,
				maxX: -1,
				minY: gridHeight,
				maxY: -1,
			};
	for (let index = 0; index < length; index++) {
		const id = state.worldControlMap[index];
		if (!id) continue;
		const x = index % gridWidth,
			y = Math.floor(index / gridWidth);
		const bounds = metadata[id - 1]?.bounds;
		if (bounds) {
			bounds.minX = Math.min(bounds.minX, x);
			bounds.maxX = Math.max(bounds.maxX, x);
			bounds.minY = Math.min(bounds.minY, y);
			bounds.maxY = Math.max(bounds.maxY, y);
		}
		const side = sideByCountry.get(id);
		if (side === undefined) continue;
		cells[side].push(index);
		state.landMask[index] = 2;
		state.dominantSideMap[index] = side;
		state.primaryOccupierMap[index] = id;
		writeInfluence(state.sideInfluenceMaps[side], index, 1);
		state.occupationMap[index] = side === 0 ? 1 : side === 1 ? -1 : 0;
	}
	for (let side = 0; side < countries.length; side++) {
		if (!cells[side].length)
			throw new Error(
				`Country has no cells at this resolution: ${countries[side].name}`,
			);
		countries[side].bounds = { ...metadata[countries[side].id - 1].bounds };
		countries[side].initialCells = cells[side].length;
		for (const index of cells[side]) {
			const x = index % gridWidth,
				y = Math.floor(index / gridWidth);
			const neighbors = [];
			if (x > 0) neighbors.push(index - 1);
			if (x + 1 < gridWidth) neighbors.push(index + 1);
			if (y > 0) neighbors.push(index - gridWidth);
			if (y + 1 < gridHeight) neighbors.push(index + gridWidth);
			if (
				neighbors.some(
					(next) =>
						state.dominantSideMap[next] >= 0 &&
						state.dominantSideMap[next] !== side,
				)
			)
				fronts[side].push(index);
		}
	}
	const gridIndex = (lat, lng) =>
		Math.floor((lat + 90) / options.gridRes) * gridWidth +
		Math.floor((lng + 180) / options.gridRes);
	state.cities = decoded.scenario.cities.map((city) => {
		const ownerId =
			state.worldControlMap[gridIndex(city.lat, city.lng)] || null;
		return { ...city, ownerId, sovereignId: ownerId, countryId: ownerId };
	});
	state.activeTheaterCities = state.cities.filter((city) =>
		sideByCountry.has(city.ownerId),
	);
	state.sideUids = countries.map((_, side) => `profile-side-${side}`);
	state.hostileSidePairs = new Set();
	for (let side = 0; side < countries.length; side++) {
		state.sideSoldiers[side] = state.initialSideSoldiers[side] = count * 1250;
		state.sideRecruitableManpower[side] = count * 250;
		state.manualSideManpower[side] = count * 1250;
		for (let enemy = side + 1; enemy < countries.length; enemy++) {
			state.hostilityMatrix[side * state.MAX_SIDES + enemy] = 1;
			state.hostilityMatrix[enemy * state.MAX_SIDES + side] = 1;
			state.hostileSidePairs.add(
				`${state.sideUids[side]}|${state.sideUids[enemy]}`,
			);
		}
		for (let unit = 0; unit < count; unit++) {
			// Mixed deployment: half the army on a hostile border, half throughout its home country.
			const pool =
				!options.spread && unit % 2 === 0 && fronts[side].length
					? fronts[side]
					: cells[side];
			const index = pool[Math.floor(Math.random() * pool.length)];
			state.units.push(
				createArmyFormation(
					{
						id: Math.random(),
						sideIndex: side,
						sovereignId: countries[side].id,
						lat: (Math.floor(index / gridWidth) + 0.5) * options.gridRes - 90,
						lng: ((index % gridWidth) + 0.5) * options.gridRes - 180,
						deployTicks: 0,
						health: 100,
						maxHealth: 100,
						personnel: 1000,
						personnelCapacity: 1000,
					},
					state.CONFIG,
				),
			);
		}
	}
	state.initialCombatants = countries.map((country, sideIndex) => ({
		id: country.id,
		name: country.name,
		sideIndex,
	}));
	state.initialOwnerMap = state.deJureMap.slice();
	stages.deploymentMs = performance.now() - started;
	return {
		state,
		stages,
		fixture: {
			revision: 2,
			case: options.case,
			countries: definition.countries,
			unitsPerSide: count,
			manpowerPerSide: count * 1250,
			personnelPerFormation: 1000,
			configSha256: createHash("sha256")
				.update(JSON.stringify(state.CONFIG))
				.digest("hex"),
			gridRes: options.gridRes,
			gridWidth,
			gridHeight,
			cells: length,
			warmup: options.warmup,
			ticks: options.ticks,
			initialUnits: state.units.length,
			selectedCells: cells.map((side) => side.length),
			borderCells: fronts.map((side) => side.length),
			cityCount: state.cities.length,
			theaterCities: state.activeTheaterCities.length,
			mapSha256: createHash("sha256").update(compressed).digest("hex"),
			rules: `1x; missiles and treaties disabled; ${options.spread ? "spread" : "mixed"} deployment; flat terrain matches global loader`,
		},
	};
}
