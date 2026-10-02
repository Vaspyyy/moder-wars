import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {gunzipSync} from 'node:zlib';
import { atlasQuad, atlasColor, atlasCityVisible, decodeAtlasCoast, requestAtlasCoast, getAtlasCoastPaths, drawAtlasOcean } from '../src/render-atlas.js';
import { createPoliticalChunkCache, drawPoliticalChunks } from '../src/render-political-cache.js';
import { drawTerrain } from '../src/render-terrain.js';

const area = points => Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
const inside = (point, polygon) => {let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
for(let pattern=0;pattern<256;pattern++) {
 const values=Array.from({length:4},(_,i)=>(pattern>>(i*2))&3), mesh=atlasQuad(values,0,0);
 assert.ok(Math.abs(mesh.polygons.reduce((sum,p)=>sum+area(p.points),0)-1)<1e-9,'each junction partitions the square exactly');
 // Sample off the boundaries: every point belongs to exactly one polygon.
 for(let x=0;x<9;x++)for(let y=0;y<9;y++) {
  const point=[(x+0.317)/9,(y+0.619)/9];assert.equal(mesh.polygons.filter(p=>inside(point,p.points)).length,1);
 }
 for(let corner=0;corner<4;corner++) {
  const point=[[0.01,0.01],[0.99,0.01],[0.99,0.99],[0.01,0.99]][corner];
  assert.equal(mesh.polygons.find(p=>inside(point,p.points)).id,values[corner],'islands and narrow territories retain their corner ownership');
 }
}
assert.deepEqual(atlasQuad([1,1,1,0],0,0).borders,[[0,0.5,0.5,1]],'single-corner coast is diagonal, not a staircase');
const red=atlasColor(255,0,0);assert.ok(red[0]>red[1]&&red[1]===red[2]);
for(const channel of red)assert.ok(channel>=38&&channel<=228);
assert.ok(atlasCityVisible({isCapital:true,pop:1},2,false,false));
assert.ok(!atlasCityVisible({pop:2000000},3,false,true));
assert.ok(atlasCityVisible({pop:800000},4,false,true));
assert.ok(!atlasCityVisible({pop:800000},4,false,false));
assert.ok(atlasCityVisible({pop:1},2,true,true),'active theater cities remain visible');

const compressed=readFileSync(new URL('../assets/atlas/coast-110m.bin.gz',import.meta.url)), bytes=gunzipSync(compressed);
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), coast=decodeAtlasCoast(buffer);
assert.ok(coast.rings.length>200 && coast.edges.length>10000);
assert.throws(()=>decodeAtlasCoast(buffer.slice(0,100)),/Truncated|Invalid/);
assert.throws(()=>decodeAtlasCoast(new ArrayBuffer(16)),/Unsupported/);
for(const ring of coast.rings)for(let i=0;i<ring.length;i+=2){assert.ok(Math.abs(ring[i])<=180);assert.ok(Math.abs(ring[i+1])<86);}
let downloads=0;const originalFetch=globalThis.fetch, originalPath=globalThis.Path2D;
globalThis.fetch=async()=>{downloads++;return {ok:true,arrayBuffer:async()=>compressed.buffer.slice(compressed.byteOffset,compressed.byteOffset+compressed.byteLength)};};
class MockPath {constructor(){this.commands=[];}moveTo(...p){this.commands.push(['M',...p]);}lineTo(...p){this.commands.push(['L',...p]);}closePath(){this.commands.push(['Z']);}rect(...p){this.commands.push(['R',...p]);}addPath(path,m={a:1,d:1,e:0,f:0}){for(const [op,x,y,width,height] of path.commands)this.commands.push(op==='Z'?['Z']:op==='R'?['R',m.a*x+m.e,m.d*y+m.f,m.a*width,m.d*height]:[op,m.a*x+m.e,m.d*y+m.f]);}}
globalThis.Path2D=MockPath;
try {
 await Promise.all([new Promise(resolve=>requestAtlasCoast(resolve)),new Promise(resolve=>requestAtlasCoast(resolve))]);
 assert.equal(downloads,1,'coast download is shared');
 let projections=0;
 const layer={}, geographic={viewportKey:'a',project:(lat,lng)=>{projections++;const sine=Math.sin(lat*Math.PI/180);return{x:(lng+180)/360*1024+13,y:(0.5-Math.log((1+sine)/(1-sine))/(4*Math.PI))*1024-21};}};
 const paths=getAtlasCoastPaths(layer,geographic);assert.ok(paths.land.commands.length>10000);
 assert.equal(projections,2,'camera path transform uses two Leaflet anchors, regardless of coastline detail');
 const expected=geographic.project(coast.edges[1],coast.edges[0]), actual=paths.shore.commands[0];
 assert.ok(Math.abs(actual[1]-expected.x)<1e-6&&Math.abs(actual[2]-expected.y)<1e-6,'native path transforms preserve Mercator geography');
 assert.equal(getAtlasCoastPaths(layer,{...geographic,worldControlMap:new Uint16Array(4)}),paths,'ownership updates reuse projected coast');
 assert.notEqual(getAtlasCoastPaths(layer,{...geographic,viewportKey:'b'}),paths);
 assert.equal(getAtlasCoastPaths(layer,{...geographic,isEditing:true}),null);
 assert.equal(getAtlasCoastPaths(layer,{...geographic,isCustomTerrain:true}),null);
 assert.equal(getAtlasCoastPaths(layer,{...geographic,worldWidthDeg:100}),null);
 const n=64, state={gridWidth:n,gridHeight:n,step:1,currentZoom:5,
  worldControlMap:new Uint16Array(n*n).fill(1),landMask:new Uint8Array(n*n).fill(1),
  biomeMask:new Uint8Array(n*n),terrain:new Float32Array(n*n),dominantSideMap:new Int8Array(n*n).fill(-1),
  primaryOccupierMap:new Uint16Array(n*n),sovereignSideMap:new Int8Array([-1,0,1]),
  countryMetadata:[{id:1,rgba:[200,40,30,1]},{id:2,rgba:[20,100,200,1]}],sideColors:['rgba(200,40,30,1)','rgba(20,100,200,1)'],
  isAtlas:true,isSimplifiedMode:true,useSimplifiedBase:true,isCustomTerrain:true,isWar:false,
  viewMode:'POLITICAL',allianceViewEnabled:false,mountainsEnabled:false,disableCountryGradient:true,
  politicalStyleKey:'atlas',getGridPoint:(x,y)=>({x,y}),xMin:0,xMax:63,yMin:0,yMax:63,staticLoopXMin:0,staticLoopYMin:0,
  CONFIG:{FRONTLINE_COLOR:'#000'},
 };
 state.worldControlMap[31*n+31]=2;state.landMask[2*n+2]=0;
 const cache=createPoliticalChunkCache();cache.prepare(state);
 const first=cache.get(state,0,0), distant=cache.get(state,1,1);
 assert.ok(first.polygons.length>0);assert.ok(first.borders.some(v=>v%1!==0),'contours use subcell coordinates');
 cache.prepare({...state,xMin:4});assert.equal(cache.get(state,0,0),first,'pan preserves world meshes');
 const before=state.worldControlMap.slice();
 state.worldControlMap[31*n+31]=1;cache.invalidateCells([31*n+31],n,n);
 assert.notEqual(cache.get(state,1,1),distant,'neighbor halos rebuild at tile boundaries');
 state.isWar=true;state.landMask[20*n+20]=2;state.dominantSideMap[20*n+20]=1;state.primaryOccupierMap[20*n+20]=2;
 cache.clear();cache.prepare(state);const occupied=cache.get(state,0,0);
 assert.ok(occupied.polygons.length>0,'occupation colors remain in the atlas mesh');
 const stable=state.worldControlMap.slice();
 let fills=0;const ctx=new Proxy({fill(){fills++;}},{get:(target,key)=>target[key]||(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
 drawPoliticalChunks({}, {...state,ctx});assert.ok(fills>1);assert.deepEqual(state.worldControlMap,stable,'drawing never mutates ownership');
 const trace=[];const terrainCtx=new Proxy({fill(path){trace.push(['fill',path]);},clip(path){trace.push(['clip',path]);},save(){trace.push(['save']);},restore(){trace.push(['restore']);}},{get:(target,key)=>target[key]||(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
 const terrainLayer={_clearVisibleControlTiles(){}};
 drawTerrain.call(terrainLayer,{...state,...geographic,isCustomTerrain:false,ctx:terrainCtx,renderStatic:true,fullStaticRefresh:false,showCountryLabels:false,regions:[],dpr:1,RENDER_LAYERS:{STATIC:1,LABELS:2}});
 assert.ok(trace.some(([command])=>command==='clip'),'natural Earth terrain uses the geographic coast');
 trace.length=0;
 drawTerrain.call(terrainLayer,{...state,...geographic,ctx:terrainCtx,renderStatic:true,fullStaticRefresh:false,showCountryLabels:false,regions:[],dpr:1,RENDER_LAYERS:{STATIC:1,LABELS:2}});
 assert.ok(!trace.some(([command])=>command==='clip'),'custom land stays unclipped');
 let oceanFills=0;drawAtlasOcean({createLinearGradient:()=>({addColorStop(){}}),fillRect(){oceanFills++;},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}},{getSize:()=>({x:500,y:300}),getZoom:()=>3,getBounds:()=>({getWest:()=>-180,getEast:()=>180,getSouth:()=>-80,getNorth:()=>80})},(lat,lng)=>({x:lng,y:lat}));assert.equal(oceanFills,1);
 assert.equal(before[31*n+31],2);
} finally {globalThis.fetch=originalFetch;globalThis.Path2D=originalPath;}
// A full Earth overview exceeds the legacy 2,048-chunk limit. It must
// remain warm across another overview and a zoom, rather than thrash the LRU.
const raster=readFileSync(new URL('../assets/geodata/derived/ne_110m_admin_0_countries_0.15.mwr',import.meta.url));
const table=new DataView(raster.buffer,raster.byteOffset,raster.byteLength),width=table.getUint16(6,true),height=table.getUint16(8,true),countryCount=table.getUint16(10,true);
const owners=new Uint16Array(width*height);let position=0;
for(let offset=16;offset<raster.length;offset+=4){const count=table.getUint16(offset,true),id=table.getUint16(offset+2,true);owners.fill(id,position,position+count);position+=count;}
assert.equal(position,owners.length);
const earth={gridWidth:width,gridHeight:height,step:1,currentZoom:3,worldControlMap:owners,landMask:Uint8Array.from(owners,id=>id?1:0),biomeMask:new Uint8Array(owners.length),dominantSideMap:new Int8Array(owners.length).fill(-1),primaryOccupierMap:new Uint16Array(owners.length),sovereignSideMap:new Int8Array(countryCount+1).fill(-1),countryMetadata:Array.from({length:countryCount},(_,i)=>({id:i+1,rgba:[70+(i*37)%160,70+(i*71)%160,70+(i*53)%160,1]})),sideColors:[],isWar:false,isAtlas:true,isSimplifiedMode:true,useSimplifiedBase:true,atlasCoast:true,viewMode:'POLITICAL',allianceViewEnabled:false,mountainsEnabled:false,disableCountryGradient:true,politicalStyleKey:'atlas'};
const wholeWorld=createPoliticalChunkCache();wholeWorld.prepare(earth);
const visit=()=>{for(let y=0;y<Math.ceil(height/32);y++)for(let x=0;x<Math.ceil(width/32);x++)wholeWorld.get(earth,x,y);};
const started=performance.now();visit();const initialMs=performance.now()-started,built=wholeWorld.stats.built;
const reusedAt=performance.now();wholeWorld.prepare({...earth,currentZoom:6});visit();
assert.equal(wholeWorld.stats.built,built,'zoom and whole-world revisits must retain atlas meshes');
assert.equal(wholeWorld.stats.reused,built);
console.log(`Earth atlas: ${owners.length} cells, ${built} cached chunks; initial ${Math.round(initialMs)} ms, warm ${Math.round(performance.now()-reusedAt)} ms (Node mesh work only)`);
for(const resolution of ['50m','10m']) {
 const packed=gunzipSync(readFileSync(new URL(`../assets/atlas/coast-${resolution}.bin.gz`,import.meta.url)));
 const decoded=decodeAtlasCoast(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength));
 assert.ok(decoded.rings.length>coast.rings.length,'higher geography resolutions preserve additional islands');
}
const sw=readFileSync(new URL('../workers/service-worker.js',import.meta.url),'utf8');
for(const path of ['src/render-atlas.js','assets/atlas/coast-110m.bin.gz'])assert.ok(sw.includes(`"${path}"`),'atlas assets must work offline');
console.log('Atlas mesh partitions, coastline packing/clipping, custom maps, occupation, tile invalidation, cities, and offline shell checks passed');
