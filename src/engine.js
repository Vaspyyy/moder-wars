import { CONFIG } from "./config.js";
import {
	areSidesHostile,
	dominantSideMap,
	frontlineDirLat,
	frontlineDirLng,
	gridHeight,
	gridWidth,
	landMask,
	MAX_SIDES,
	occupationMap,
	setDominantSideMap,
	setSideInfluenceMaps,
	sideInfluenceMaps,
	sides,
	worldControlMap,
} from "./main.js";
import { createEngine } from "./simulation-engine.js";

const engine = createEngine({
	get CONFIG() {
		return CONFIG;
	},
	get areSidesHostile() {
		return areSidesHostile;
	},
	get dominantSideMap() {
		return dominantSideMap;
	},
	get frontlineDirLat() {
		return frontlineDirLat;
	},
	get frontlineDirLng() {
		return frontlineDirLng;
	},
	get gridHeight() {
		return gridHeight;
	},
	get gridWidth() {
		return gridWidth;
	},
	get landMask() {
		return landMask;
	},
	get occupationMap() {
		return occupationMap;
	},
	get sideInfluenceMaps() {
		return sideInfluenceMaps;
	},
	get worldControlMap() {
		return worldControlMap;
	},
	get MAX_SIDES() {
		return MAX_SIDES;
	},
	get sides() {
		return sides;
	},
	set sideInfluenceMaps(value) {
		setSideInfluenceMaps(value);
	},
	set dominantSideMap(value) {
		setDominantSideMap(value);
	},
});

export const {
	setOccupationChangeListener,
	clearCellInfluence,
	getBorderDirection,
	getGridIndex,
	ensureSideInfluenceMaps,
	initSideInfluenceMaps,
	isEnemyTerritory,
	isMyTerritory,
	myInfluenceAt,
	resetSideInfluenceMaps,
	syncOccupationFromSideInfluence,
} = engine;
