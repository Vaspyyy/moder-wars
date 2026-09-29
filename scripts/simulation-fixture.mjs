import { createArmyFormation } from "../src/army-formation.js";
import { captureSimulationState } from "../src/simulation-protocol.js";
import { createSimulationState } from "../src/simulation-state.js";

export function createTinySimulationState({ paused = false, speed = 1, idOffset = 0, gridWidth = 36, gridHeight = gridWidth / 2 } = {}) {
	const length = gridWidth * gridHeight;
	const countries = [
		{ id: 1, name: "West", role: "OFFENSE", strategy: "BALANCED", color: "#cf5050", troops: 10000, initialCells: length / 2, buffState: "none" },
		{ id: 2, name: "East", role: "OFFENSE", strategy: "BALANCED", color: "#507dcf", troops: 10000, initialCells: length / 2, buffState: "none" },
	];
	const state = createSimulationState({
		CONFIG: { GRID_RES: 360 / gridWidth, INFLUENCE_RADIUS: 12 },
		gridWidth, gridHeight, gameState: "SIMULATING", isPaused: paused, simSpeed: speed,
		peaceTreatiesDisabled: true, bombsDisabled: true, warGraceEndTick: 100000,
		sides: countries.map(country => [{ ...country }]), countryMetadata: countries.map(country => ({ ...country })),
		sideInfluenceMaps: [new Float32Array(length), new Float32Array(length)],
		landMask: new Uint8Array(length).fill(2), worldControlMap: new Uint16Array(length), deJureMap: new Uint16Array(length),
		primaryOccupierMap: new Uint16Array(length), dominantSideMap: new Int8Array(length), occupationMap: new Float32Array(length),
		terrainMask: new Float32Array(length), biomeMask: new Uint8Array(length), provinceMap: new Int32Array(length),
		cities: [
			{ id: 1, name: "West City", lat: 5, lng: -15, sovereignId: 1, countryId: 1, isCapital: true },
			{ id: 2, name: "East City", lat: 5, lng: 15, sovereignId: 2, countryId: 2, isCapital: true },
		],
		units: [0, 1, 2, 3].map(index => createArmyFormation({ id: idOffset + index + 1, lat: index < 2 ? 5 : 15, lng: index % 2 ? 5 : -5, sideIndex: index % 2, sovereignId: index % 2 + 1, deployTicks: 0, health: 100, maxHealth: 100, personnel: 1000, personnelCapacity: 1000, smokeMarker: `formation-${idOffset + index + 1}` })),
	});
	for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
		const index = y * gridWidth + x, side = x < gridWidth / 2 ? 0 : 1;
		state.worldControlMap[index] = side + 1;
		state.deJureMap[index] = side + 1;
		state.primaryOccupierMap[index] = side + 1;
		state.dominantSideMap[index] = side;
		// Fractional values make same-side occupation-intensity deltas observable.
		state.sideInfluenceMaps[side][index] = 0.6;
		state.occupationMap[index] = side === 0 ? 0.6 : -0.6;
		state.terrainMask[index] = (x + y) % 7 === 0 ? 0.2 : 0;
	}
	state.sideUids = ["side-1", "side-2"];
	state.hostileSidePairs = new Set(["side-1|side-2"]);
	state.hostilityMatrix[1] = state.hostilityMatrix[state.MAX_SIDES] = 1;
	state.sideSoldiers.set([10000, 10000]);
	state.initialSideSoldiers.set([10000, 10000]);
	state.sideRecruitableManpower.set([6000, 6000]);
	state.soldiersPerUnit.fill(1000);
	state.activeTheaterCities = state.cities;
	state.initialCombatants = countries.map(country => ({ ...country }));
	state.initialOwnerMap = state.deJureMap.slice();
	return captureSimulationState(state);
}
