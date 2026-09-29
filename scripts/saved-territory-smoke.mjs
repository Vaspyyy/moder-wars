import assert from 'node:assert/strict';
import { encodeScenario, decodeScenarioBinary, decodeScenarioJson } from '../src/scenario-codec.js';
import { expandSavedCells, normalizeSavedCells, packSavedCells } from '../src/saved-cells.js';
import { createCountryActions } from '../src/country-actions.js';
import { generateScenarioSnapshot } from '../src/scenario-export.js';

const pairs = [[1,0],[2,0],[3,0],[0,1],[2,1],[1,0]];
const flag = 'data:image/png;base64,' + 'AQID'.repeat(10000);
const original = {gridRes:90,metadata:[{id:1,name:'Host',flagUrl:flag},{id:2,name:'Core',savedCells:pairs,releasableBy:1,flagUrl:flag,allianceFlagUrl:flag}],mapData:[[0,1],[1,1],[2,1],[4,1]],cities:[]};
const encoded = encodeScenario(original);
const header = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
assert.equal(header.getUint8(4),3);
assert.equal(header.getUint32(28,true),1,'equal national/alliance flag URLs share one blob');
const metadataText = new TextDecoder().decode(encoded.subarray(32,32+header.getUint32(8,true)));
assert.ok(!metadataText.includes('AQID'),'flags do not inflate the JSON metadata section');
assert.ok(!metadataText.includes('savedCells'),'territory pairs are binary runs');
const decoded = decodeScenarioBinary(encoded);
const saved = decoded.scenario.metadata[1];
assert.equal(saved.savedCells,null);
assert.deepEqual(expandSavedCells(saved),pairs,'saved-cell order, row crossings, and duplicates survive packing');
assert.equal(decoded.scenario.metadata[0].flagUrl,flag);
assert.equal(saved.allianceFlagUrl,flag);
const expectedMetadata={...original};delete expectedMetadata.mapData;
assert.deepEqual(decodeScenarioBinary(encoded,{expandSavedCells:true}).scenario,expectedMetadata);
assert.deepEqual(expandSavedCells(decodeScenarioJson(original).scenario.metadata[1]),pairs,'JSON fallback also returns compact territory');
const targetIndex = (lat,lng)=>Math.floor((lat+90)/45)*8+Math.floor((lng+180)/45);
assert.deepEqual(expandSavedCells({...saved,savedCells:[]}),[], 'an explicitly replaced empty legacy mask does not reuse stale runs');
const normalized=normalizeSavedCells(saved,90,45,8,targetIndex);
assert.deepEqual(expandSavedCells(normalized),[[3,1],[5,1],[7,1],[1,3],[5,3]],'legacy cell-center remap deduplicates first-seen cells');
assert.deepEqual(packSavedCells(saved,4).savedCellRuns,saved.savedCellRuns);
assert.throws(()=>decodeScenarioBinary(encoded.subarray(0,encoded.length-1)),/Truncated/);

// The previous v2 packages remain readable, with the same compact runtime contract.
const oldMetadata=new TextEncoder().encode(JSON.stringify({gridRes:90,metadata:[{id:1,savedCells:[[1,0]]}]}));
const legacy=new Uint8Array(20+oldMetadata.length+4);legacy.set([0x4d,0x57,0x53,0x43]);
const legacyHeader=new DataView(legacy.buffer);legacyHeader.setUint8(4,2);legacyHeader.setUint16(6,20,true);legacyHeader.setUint32(8,oldMetadata.length,true);legacyHeader.setUint32(12,1,true);legacyHeader.setUint32(16,4,true);legacy.set(oldMetadata,20);legacy.set([0,1,1,2],20+oldMetadata.length);
const legacyDecoded=decodeScenarioBinary(legacy);assert.equal(legacyDecoded.worldControl[0],1);assert.equal(legacyDecoded.biome[0],2);assert.deepEqual(expandSavedCells(legacyDecoded.scenario.metadata[0]),[[1,0]]);

const previousWindow=globalThis.window;globalThis.window={};
try {
 const state={CONFIG:{GRID_RES:90},countryMetadata:[{id:1,name:'Host'},{...saved,flagUrl:null,allianceFlagUrl:null}],gameState:'EDITOR_ACTIVE',loadingStatus:{},loadingOverlay:{style:{}},releaseModal:{style:{}},statusText:{},gridWidth:4,gridHeight:2,worldControlMap:new Uint16Array(8).fill(9),deJureMap:new Uint16Array(8),provinceMap:new Int32Array(8),landMask:new Uint8Array(8),primaryOccupierMap:new Uint16Array(8),sides:[[],[]],getProvinceId:(x,y,id)=>id*100+y*4+x,clearCellInfluence:()=>{},recalculateAllBounds:()=>{},updateSidesUI:()=>{},influenceLayer:{render:()=>{}}};
 createCountryActions(state).bindReleaseNationHandler();await window.releaseNation(2,1,-1);
 for(const [x,y] of pairs)assert.equal(state.worldControlMap[y*4+x],2,'explicit packed cores override third-party owners just like legacy savedCells');
 assert.equal(state.worldControlMap[7],9,'cells outside the saved mask remain intact');
 assert.equal(state.countryMetadata[1].savedCells,null,'release iterates packed cells without rebuilding pair objects');
 const snapshot=generateScenarioSnapshot('roundtrip',{...state,biomeMask:new Uint8Array(8),terrainMask:new Float32Array(8),cities:[],gridRes:90});
 assert.deepEqual(snapshot.metadata[1].savedCells,pairs,'ordinary editor JSON exports retain legacy coordinate-pair format');
} finally {globalThis.window=previousWindow;}
console.log('Saved territory, flag blobs, legacy package, release, and export checks passed.');
