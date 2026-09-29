import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CONFIG } from "../src/config.js";
import { generateScenarioSnapshot } from "../src/scenario-export.js";

function loadFactory(file, name, dependencies = {}) {
 const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
  .replace(/import\s[\s\S]*?from\s"[^"]+";/g, "")
  .replace(`export function ${name}`, `function ${name}`);
 return vm.runInNewContext(`${source}\n${name}`, {CONFIG, console, setTimeout, ...dependencies});
}
const blockedContext = new Proxy({}, {get(){throw new Error("Construction must not read runtime bindings");}});
const session = {generation: 0};
const makeGeography = loadFactory("geography-loader.js", "createGeographyLoader", {
 L: {latLng:(lat,lng)=>({lat,lng}),latLngBounds:(southwest,northeast)=>({getSouth:()=>southwest.lat,getWest:()=>southwest.lng,getNorth:()=>northeast.lat,getEast:()=>northeast.lng})},
});
const makeScenario = loadFactory("scenario-loader.js", "createScenarioLoader", {
 generateScenarioSnapshot, document:{getElementById:()=>({value:"110m"})}, alert(message){throw new Error(message);},
});
assert.equal(typeof makeGeography(blockedContext,session).loadCountries,"function");
assert.equal(typeof makeScenario(blockedContext,session).performPresetLoad,"function");
assert.equal(session.generation,0);

const previousResolution = CONFIG.GRID_RES;
CONFIG.GRID_RES = 90;
try {
 let renders=0,deserts=0,boundsUpdates=0;
 const context = {
  worldControlMap:new Uint16Array(8),deJureMap:new Uint16Array(8),landMask:new Uint8Array(8),provinceMap:new Int32Array(8),biomeMask:new Uint8Array(8),terrainMask:new Float32Array(8),
  gridWidth:4,gridHeight:2,countryMetadata:[],cities:[],isCustomTerrain:true,
  setCountryMetadata(value){this.countryMetadata=value;},getCountryColor:()=>"red",findCodeByName:()=>null,parseColorToRGBA:()=>[255,0,0,1],getFlagUrl:()=>null,
  isPointInFeature:()=>true,applyEarthDeserts(){deserts++;},getCookie:()=>"",getProvinceId:(x,y,id)=>id*100+x+y,
  loadingBar:{style:{}},loadingStatus:{innerText:""},statusText:{innerText:""},recalculateAllBounds(){boundsUpdates++;},influenceLayer:{render(){renders++;}},
 };
 const geography = makeGeography(context,session);
 await geography.updateLandMask([{properties:{NAME:"First"},geometry:{coordinates:[[-180,-90],[180,90]]}}]);
 assert.equal(context.countryMetadata[0].name,"First");
 assert.equal([...context.worldControlMap].filter(id=>id===1).length,8);
 // Replacing arrays and metadata after factory creation must remain visible.
 context.worldControlMap=new Uint16Array(8);
 context.deJureMap=new Uint16Array(8);
 context.countryMetadata=[];
 await geography.updateLandMask([{properties:{NAME:"Second"},geometry:{coordinates:[[-180,-90],[180,90]]}}]);
 assert.equal(context.countryMetadata[0].name,"Second");
 assert.equal(context.worldControlMap[7],1);
 assert.equal(deserts,0);
 const scenarios=makeScenario(context,session);
 let snapshot=scenarios.generatePresetData("Current state");
 assert.equal(snapshot.metadata[0].name,"Second");
 context.countryMetadata[0].name="Updated";
 snapshot=scenarios.generatePresetData("Current state");
 assert.equal(snapshot.metadata[0].name,"Updated");
 scenarios.importSingleCountryFromScenario({gridRes:90,metadata:[{id:8,name:"Imported"}],mapData:[[0,8],[4,8]]},8);
 assert.equal(context.worldControlMap[0],2);
 assert.equal(context.deJureMap[4],2);
 assert.equal(context.countryMetadata[1].name,"Imported");
 assert.equal(boundsUpdates,1);
 assert.equal(renders,1);
 assert.equal(session.generation,0);
} finally {CONFIG.GRID_RES=previousResolution;}
console.log("Editor loader smoke checks passed.");
