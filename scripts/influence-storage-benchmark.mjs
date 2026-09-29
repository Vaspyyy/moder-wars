import {performance} from 'node:perf_hooks';
import {createSparseInfluenceMap,toSparseInfluenceMap,influenceStorageBytes,readInfluence,writeInfluence,multiplyInfluence} from '../src/influence-grid.js';

const width=2400,height=1200,length=width*height;
const dense=new Float32Array(length);
const activeIndices=[];
// Synthetic regional theater: 70x70 cells, around10.5° square at the standard grid.
for(let y=430;y<500;y++)for(let x=1180;x<1250;x++){const i=y*width+x;dense[i]=.5;activeIndices.push(i);}
const convertedAt=performance.now();const sparse=toSparseInfluenceMap(dense);const conversionMs=performance.now()-convertedAt;
const iterations=300000;
const indices=Uint32Array.from({length:iterations},(_,i)=>activeIndices[i%activeIndices.length]);
function sample(map){let checksum=0;const started=performance.now();for(let i=0;i<indices.length;i++){const index=indices[i];checksum+=readInfluence(map,index);writeInfluence(map,index,Math.min(1,readInfluence(map,index)+.001));multiplyInfluence(map,index,.999);}return {ms:performance.now()-started,checksum};}
for(let i=0;i<3;i++){sample(dense);sample(sparse);}
function median(map){const results=Array.from({length:9},()=>sample(map));results.sort((a,b)=>a.ms-b.ms);return results[4].ms;}
const denseMs=median(dense),sparseMs=median(sparse);
console.log(JSON.stringify({fixture:'70x70 regional cells in standard2.88-million-cell world',operations:iterations,allocatedDenseBytes:influenceStorageBytes(dense),allocatedSparseBytes:influenceStorageBytes(sparse),sparsePages:sparse.pageCount,pageTableSlots:sparse.pages.length,conversionMs:+conversionMs.toFixed(3),denseMedianMs:+denseMs.toFixed(3),sparseMedianMs:+sparseMs.toFixed(3),sparseTimeRatio:+(sparseMs/denseMs).toFixed(2),emptySidePayloadBytes:influenceStorageBytes(createSparseInfluenceMap(length)),note:'Numeric payload only; JS table/header overhead excluded. Node synthetic storage microbenchmark, not whole-game FPS.'},null,2));
