import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {createEngine} from '../src/simulation-engine.js';
import {createInfluenceRuntime} from '../src/influence-runtime.js';
import {createSparseInfluenceMap,readInfluence,writeInfluence,addInfluence,multiplyInfluence,clearInfluenceMap,toSparseInfluenceMap,toDenseInfluenceMap,influenceStorageBytes,sumInfluenceNeighborhood} from '../src/influence-grid.js';

const length=1024*16+5,dense=new Float32Array(length),sparse=createSparseInfluenceMap(length);
assert.equal(sparse.pageCount,0);writeInfluence(sparse,1,0);assert.equal(sparse.pageCount,0,'zero writes do not allocate pages');
for(const index of [-1,length,NaN,Infinity,.5]){assert.equal(readInfluence(sparse,index),dense[index]);writeInfluence(sparse,index,1);assert.equal(sparse.pageCount,0);}
const values=[0,-0,1,.1,-.7,Infinity,-Infinity,NaN,1e-40,1e-50];let random=42;
function next(){random=(Math.imul(random,1664525)+1013904223)>>>0;return random;}
for(let operation=0;operation<40000;operation++){
 const index=next()%length,value=values[next()%values.length],kind=next()%3;
 if(kind===0){dense[index]=value;writeInfluence(sparse,index,value);}
 else if(kind===1){dense[index]+=value;addInfluence(sparse,index,value);}
 else {dense[index]*=value;multiplyInfluence(sparse,index,value);}
 assert.ok(Object.is(readInfluence(sparse,index),dense[index]),`Float32 write parity at operation${operation}`);
}
const expanded=toDenseInfluenceMap(sparse);
for(let i=0;i<length;i++)assert.ok(Object.is(expanded[i],dense[i]),`Full Float32 value parity at index${i}`);
const converted=toSparseInfluenceMap(dense);assert.deepEqual(new Uint32Array(toDenseInfluenceMap(converted).buffer),new Uint32Array(dense.buffer));
const nanPayload=new Float32Array(1025);new Uint32Array(nanPayload.buffer)[1024]=0x7fc01234;assert.equal(new Uint32Array(toDenseInfluenceMap(toSparseInfluenceMap(nanPayload)).buffer)[1024],0x7fc01234,'dense conversion retains NaN payload bits');
clearInfluenceMap(sparse);assert.equal(sparse.pageCount,0);assert.equal(influenceStorageBytes(sparse),0);assert.equal(readInfluence(sparse,length-1),0);
writeInfluence(sparse,length-1,-0);assert.ok(Object.is(readInfluence(sparse,length-1),-0));assert.equal(toDenseInfluenceMap(sparse).length,length,'partial final page does not overrun dense destination');

// Interior samples straddle page boundaries and touch omitted zero pages.
const neighborhoodWidth=511,neighborhoodHeight=40,neighborhoodDense=new Float32Array(neighborhoodWidth*neighborhoodHeight);
for(let i=0;i<neighborhoodDense.length;i++)if((i>>>10)%3===0)neighborhoodDense[i]=values[next()%values.length];
const neighborhoodSparse=toSparseInfluenceMap(neighborhoodDense);
for(let y=1;y<neighborhoodHeight-1;y++)for(let x=1;x<neighborhoodWidth-1;x++){
 const index=y*neighborhoodWidth+x;
 assert.ok(Object.is(sumInfluenceNeighborhood(neighborhoodSparse,index,neighborhoodWidth),sumInfluenceNeighborhood(neighborhoodDense,index,neighborhoodWidth)),`3x3 sum parity at index${index}`);
}

function makeRuntime(useSparse){
 const config={...CONFIG,GRID_RES:.5,INFLUENCE_RADIUS:.8};const gridWidth=720,gridHeight=360,total=gridWidth*gridHeight;
 const state={CONFIG:config,MAX_SIDES:8,sides:[[{id:1,role:'OFFENSE'}],[{id:2,role:'OFFENSE'}]],gridWidth,gridHeight,sparseInfluence:useSparse,sideInfluenceMaps:[],dominantSideMap:new Int8Array(total).fill(-1),occupationMap:new Float32Array(total),landMask:new Uint8Array(total),worldControlMap:new Uint16Array(total),primaryOccupierMap:new Uint16Array(total),terrainMask:new Float32Array(total),areSidesHostile:(a,b)=>a>=0&&b>=0&&a!==b,
  activeTheaterCities:[{lat:0,lng:0}],_simulationWorldGeneration:1,_influenceCityGridSource:null,_influenceCityGridSourceLength:-1,_influenceCityGridWorldGeneration:-1,_tickCityGridIndexSet:new Set(),_influenceCoalitionSignature:'',_influenceActiveSideIndices:[],_tickSideAllyIdSets:[],_tickSideSupportIdSets:[],_influenceHostileSideIndices:Array.from({length:8},()=>[]),_influenceFrontierQueued:new Uint8Array(0),_influenceFrontierWorldGeneration:-1,_influenceFrontierQueue:[],_influenceFrontierCursor:0,_influenceFrontierPriorityQueue:[],_influenceFrontierPriorityCursor:0,INFLUENCE_FRONTIER_PRIORITY_LIMIT:8192,INFLUENCE_FRONTIER_BACKLOG_LIMIT:16384,_influenceNeighborCountryIds:new Int32Array(8),_influenceNeighborCountryCounts:new Uint8Array(8),_influenceNeighborDx:new Int8Array([0,0,1,-1,1,1,-1,-1]),_influenceNeighborDy:new Int8Array([1,-1,0,0,1,-1,1,-1]),_simTickCount:0,simFrameCount:0,mountainsEnabled:true,getOptimizationFactor:()=>1,getLiveFormationStrength:()=>1,stableUnitCohort:(unit,stride)=>unit.id%stride,_tickCountryById:new Map([[1,{id:1,role:'OFFENSE',buffState:'none'}],[2,{id:2,role:'OFFENSE',buffState:'none'}]]),units:Array.from({length:12},(_,id)=>({id,sideIndex:id%2,sovereignId:id%2+1,beneficiaryId:id%2+1,lat:-1.1+(id%4)*.6,lng:id%2===0?-.7:.7,deployTicks:0,lastAllyCount:3})),_territoryLedger:{markControllerChange:()=>{}},influenceLayer:{notifyControlCellsChanged:()=>{}}};
 const engine=createEngine(state);Object.assign(state,engine);engine.initSideInfluenceMaps();
 for(let y=160;y<200;y++)for(let x=340;x<380;x++){const index=y*gridWidth+x;state.landMask[index]=2;const side=x<360?0:1;state.worldControlMap[index]=side+1;state.primaryOccupierMap[index]=side+1;writeInfluence(state.sideInfluenceMaps[side],index,1);state.syncOccupationFromSideInfluence(index);state.terrainMask[index]=(x+y)%9===0?.4:0;}
 return {state,influence:createInfluenceRuntime(state)};
}
const denseRun=makeRuntime(false),sparseRun=makeRuntime(true),countryToSide=new Map([[1,0],[2,1]]);
for(let tick=1;tick<=120;tick++){
 for(const run of [denseRun,sparseRun]){run.state._simTickCount=tick;run.state.simFrameCount=tick;run.influence.updatePersistentInfluence(6,6,countryToSide);}
 assert.deepEqual(sparseRun.state.dominantSideMap,denseRun.state.dominantSideMap,`dominance tick${tick}`);
 assert.deepEqual(sparseRun.state.occupationMap,denseRun.state.occupationMap,`occupation tick${tick}`);
}
for(let side=0;side<2;side++)assert.deepEqual(toDenseInfluenceMap(sparseRun.state.sideInfluenceMaps[side]),denseRun.state.sideInfluenceMaps[side]);
assert.deepEqual(sparseRun.state.primaryOccupierMap,denseRun.state.primaryOccupierMap);
const observed=[];const sideChanges=[];sparseRun.state.setInfluenceChangeListener((index,change)=>observed.push(change));sparseRun.state.setOccupationChangeListener((index,change)=>sideChanges.push(change));const index=170*720+345;writeInfluence(sparseRun.state.sideInfluenceMaps[0],index,.9);sparseRun.state.syncOccupationFromSideInfluence(index);assert.equal(observed.length,1);assert.equal(sideChanges.length,0,'same-side occupation strength changes reach snapshot listener only');sparseRun.state.syncOccupationFromSideInfluence(index);assert.equal(observed.length,1,'unchanged values do not produce deltas');sparseRun.state.clearCellInfluence(index);assert.equal(observed.length,2);
sparseRun.state.ensureSideInfluenceMaps(3);assert.ok(sparseRun.state.sideInfluenceMaps[2].pages);assert.equal(sparseRun.state.sideInfluenceMaps[2].pageCount,0,'new side starts sparse without allocating world pages');
console.log('Sparse/dense Float32 operations, 120 influence ticks, listeners, and added-side invariants passed.');
