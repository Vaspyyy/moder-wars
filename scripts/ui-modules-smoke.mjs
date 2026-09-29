import assert from "node:assert/strict";
import { collectCountryCells, createCountryExport } from "../src/country-export.js";
import { generateScenarioSnapshot } from "../src/scenario-export.js";
import { createSettingsController } from "../src/settings.js";
import { configureLanguageUi, applyLanguage, getTranslation, TRANSLATIONS } from "../src/i18n.js";

const cells = collectCountryCells(new Uint16Array([1, 0, 2, 1, 3, 2]), 3, [1, 2]);
assert.deepEqual(cells.get(1), [[0, 0], [0, 1]]);
assert.deepEqual(cells.get(2), [[2, 0], [2, 1]]);
assert.equal(cells.has(3), false);
const country = createCountryExport({id: 1, name: "Test", color: "red"}, cells.get(1), 0.1);
assert.equal(country.version, "1.0");
assert.equal(country.metadata.role, "OFFENSE");
assert.equal(country.gridRes, 0.1);

const state = {
 worldControlMap: new Uint16Array([1, 0, 2]), landMask: new Uint8Array([1, 1, 0]), biomeMask: new Uint8Array([3, 0, 1]),
 terrainMask: new Float32Array([0, 0.76, 0]), isCustomTerrain: true,
 countryMetadata: [{id: 1, name: "Alpha", savedCells: [[0,0]], releasableBy: 2}, null, {id: 2, name: "Beta", allies:[1]}],
 cities: [{name: "City", ownerId: 1, isCapital: true, lat: 5, lng: 7}], gridRes: 0.1, mapRes: "110m", imagery: "arcgis",
 gameTimeEnabled: true, gameTimeDate: {year: 2000, month: 2, day: 29}, refOpacity: 0.25, refAboveTerrain: true,
 referenceOverlay: {getBounds: () => ({getNorthWest: () => ({lat: 1,lng:2}), getSouthEast: () => ({lat:3,lng:4})})},
};
const scenario = generateScenarioSnapshot("Round trip", state);
assert.deepEqual(scenario.mapData, [[0,1,3],[1,0,0]]);
assert.deepEqual(scenario.mountainData, [[1,0.76]]);
assert.equal(scenario.metadata.length, 2);
assert.equal(scenario.metadata[0].releasableBy, 2);
assert.deepEqual(scenario.startDate, state.gameTimeDate);
assert.equal(scenario.cities[0].isCapital, true);
assert.equal(scenario.refDrawAbove, true);

const cookieValues = new Map();
const controls = new Map();
const notifications = [];
const classValues = new Set();
let domLabels = [];
globalThis.document = {
 get cookie() {return [...cookieValues].map(([k,v]) => `${k}=${v}`).join("; ");},
 set cookie(value) {let [k,v] = value.split(";")[0].split("="); cookieValues.set(k,v);},
 getElementById: id => controls.get(id),
 querySelectorAll: () => domLabels,
 addEventListener() {},
 body: {classList: {toggle(name, enabled) {if(enabled) classValues.add(name); else classValues.delete(name);}}},
};
for (const id of ["map-res-select", "grid-res-select", "unit-limit-select", "disable-country-gradient-checkbox", "disable-invisible-buffs-checkbox", "save-skip-checkbox"])
 controls.set(id,{value:"",checked:false,listeners: {},addEventListener(type, fn){this.listeners[type]=fn;}});
const settings = createSettingsController((...args) => notifications.push(args));
settings.wire();
settings.apply({"grid-res-select":"0.1", "disable-country-gradient-checkbox": true});
assert.equal(controls.get("grid-res-select").value,"0.1");
assert.equal(controls.get("disable-country-gradient-checkbox").checked,true);
settings.save();
settings.apply({"grid-res-select":"0.15", "disable-country-gradient-checkbox": false});
settings.restore();
assert.equal(controls.get("grid-res-select").value,"0.1");
assert.equal(controls.get("disable-country-gradient-checkbox").checked,true);
controls.get("grid-res-select").value="0.2";
controls.get("grid-res-select").listeners.change();
assert.equal(cookieValues.get("mw_grid_res"),"0.2");
assert(notifications.some(([id, value]) => id === "disable-auto-fullscreen-checkbox" && value === false));

let refreshes=0;
const metadata=[{name:"Germany"}];
domLabels=[{getAttribute:()=>"MODERN_WARS",innerText:""}];
configureLanguageUi({countryMetadata:()=>metadata,refreshSides:()=>refreshes++});
applyLanguage("de");
assert.equal(domLabels[0].innerText,TRANSLATIONS.de.MODERN_WARS);
assert.equal(metadata[0].displayName,getTranslation("Germany","de","NATIONS"));
assert.equal(refreshes,1);
applyLanguage("unknown");
assert.equal(domLabels[0].innerText,TRANSLATIONS.en.MODERN_WARS);

let audioContexts=0;
globalThis.window={AudioContext:class {constructor(){audioContexts++;this.state="running";}}};
const audio = await import("../src/audio.js");
assert.equal(audioContexts,1);
audio.setCustomTrack("test-track");
assert.equal(audio.customTrackUrl,"test-track");
audio.setSecretSounds(false);
assert.equal(audio.useSecretSounds,false);
audio.stopBackgroundMusic();
assert.equal(audio.bgMusicSource,null);
console.log("UI module smoke checks passed.");
