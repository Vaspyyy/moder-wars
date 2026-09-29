import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { rasterizeGeoFeatures } from '../src/geo-raster-core.js';
import { rasterizeGeoSourceInWorker, terminateGeoRasterWorker } from '../src/geo-raster.js';
import { createInspectorControls } from '../src/inspector-controls.js';

const features=[{type:'Feature',properties:{NAME:'Reference',ISO_A2:'RF'},geometry:{type:'Polygon',coordinates:[[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]]}}];
const messages=[];let downloads=0;
const workerSource=fs.readFileSync(new URL('../workers/geo-raster-worker.js',import.meta.url),'utf8').replace(/^import[^;]+;/,'');
const self={postMessage(message,transfers){messages.push({message,transfers});}};
vm.runInNewContext(workerSource,{self,rasterizeGeoFeatures,fetch:async url=>{downloads++;assert.equal(url,'https://example.test/reference.json');return {ok:true,json:async()=>({features})};}});
await self.onmessage({data:{id:4,sourceUrl:'https://example.test/reference.json',options:{gridResolution:1,gridWidth:360,gridHeight:180,yieldEvery:0}}});
const result=messages.find(item=>item.message.type==='result');assert.equal(downloads,1);assert.equal(result.message.featureCount,1);assert.ok(!('features' in result.message),'full polygon objects never leave the raster worker');assert.equal(result.transfers.length,3);assert.equal(result.message.arrays.ownerMap[90*360+180],1);

let posted;const oldWorker=globalThis.Worker;const oldWindow=globalThis.window;
class MockWorker {postMessage(message){posted=message;queueMicrotask(()=>this.onmessage({data:{id:message.id,type:'result',arrays:{landMask:new Uint8Array(1)},featureCount:1}}));}terminate(){}}
globalThis.Worker=MockWorker;globalThis.window={location:{href:'https://example.test/game/'}};
try {const received=await rasterizeGeoSourceInWorker('./countries.json',{gridResolution:90,gridWidth:4,gridHeight:2});assert.equal(posted.sourceUrl,'https://example.test/game/countries.json');assert.ok(!('features' in posted));assert.equal(received.featureCount,1);}finally{terminateGeoRasterWorker();globalThis.Worker=oldWorker;globalThis.window=oldWindow;}

const source=fs.readFileSync(new URL('../src/geography-loader.js',import.meta.url),'utf8').replace(/import\s[\s\S]*?from\s"[^"]+";/g,'').replace('export function createGeographyLoader','function createGeographyLoader');
let resolveDownload,referenceDownloads=0;
const session={generation:1};const state={rawGeoJsonData:null,setRawGeoJsonData(value){this.rawGeoJsonData=value;}};
const document={getElementById:()=>({value:'110m'})};
const createLoader=vm.runInNewContext(`${source}\ncreateGeographyLoader`,{CONFIG:{GEOJSON_BASE:'assets/geodata/'},document,fetchJSONWithCache:()=>{referenceDownloads++;return new Promise(resolve=>{resolveDownload=resolve;});}});
const loader=createLoader(state,session);assert.equal(referenceDownloads,0,'constructing the loader does not fetch raw geometry');
const pending=loader.ensureRawGeography();const duplicate=loader.ensureRawGeography();assert.equal(referenceDownloads,1,'simultaneous demand requests coalesce');resolveDownload({features});assert.equal(await pending,await duplicate);assert.equal(state.rawGeoJsonData.features[0],features[0]);
state.rawGeoJsonData=null;const stale=loader.ensureRawGeography();session.generation++;resolveDownload({features});assert.equal(await stale,null,'old scenario demand loads cannot overwrite new geometry');assert.equal(state.rawGeoJsonData,null);

const handlers={};let referenceRequests=0,annexed=0,selectedFlag=null;
const runtime={editingCountryId:1,rawGeoJsonData:null,inspectFetchFlagBtn:{addEventListener:(type,handler)=>{handlers.flag=handler;}},annexCountryBtn:{addEventListener:(type,handler)=>{handlers.annex=handler;}},inspectNameInput:{value:'Reference'},annexCountryInput:{value:'Reference'},findCodeByName:()=>null,loadingStatus:{},loadingOverlay:{style:{}},ensureRawGeography:async()=>{referenceRequests++;return {features};},updateCountryFlag:(id,url)=>{selectedFlag=url;},annexFeatureToCountry:async(feature,id)=>{assert.equal(feature,features[0]);assert.equal(id,1);annexed++;}};
const inspector=createInspectorControls(runtime);inspector.bindAnnexCountryBtnClick();inspector.bindInspectFetchFlagBtnClick();assert.equal(referenceRequests,0);await handlers.annex();assert.equal(referenceRequests,1);assert.equal(annexed,1);await handlers.flag();assert.equal(referenceRequests,2);assert.equal(selectedFlag,'https://flagcdn.com/w160/rf.webp');assert.equal(runtime.loadingOverlay.style.display,'none');
console.log('Single-worker geography rasterization and editor demand-load checks passed.');
