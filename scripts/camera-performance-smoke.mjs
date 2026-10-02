import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {drawPoliticalChunks} from '../src/render-political-cache.js';
const root=new URL('../',import.meta.url),b=readFileSync(new URL('assets/geodata/derived/ne_110m_admin_0_countries_0.15.mwr',root)),v=new DataView(b.buffer,b.byteOffset,b.byteLength),w=v.getUint16(6,true),h=v.getUint16(8,true),n=v.getUint16(10,true),world=new Uint16Array(w*h);let at=0;
for(let offset=16;offset<b.length;offset+=4){const count=v.getUint16(offset,true),id=v.getUint16(offset+2,true);world.fill(id,at,at+count);at+=count;}
const state={gridWidth:w,gridHeight:h,step:1,currentZoom:3,worldControlMap:world,landMask:Uint8Array.from(world,id=>id?1:0),biomeMask:new Uint8Array(w*h),dominantSideMap:new Int8Array(w*h).fill(-1),primaryOccupierMap:new Uint16Array(w*h),sovereignSideMap:new Int8Array(n+1).fill(-1),countryMetadata:Array.from({length:n},(_,i)=>({id:i+1,rgba:[70+(i*37)%160,70+(i*71)%160,70+(i*53)%160,1]})),sideColors:[],isWar:false,isAtlas:true,isSimplifiedMode:true,useSimplifiedBase:true,atlasCoast:true,viewMode:'POLITICAL',allianceViewEnabled:false,mountainsEnabled:false,disableCountryGradient:true,politicalStyleKey:'atlas',xMin:0,xMax:w-1,yMin:0,yMax:h-1,staticLoopXMin:0,staticLoopYMin:0,ctx:{beginPath(){},fill(){},rect(){},moveTo(){},lineTo(){},closePath(){}}};
// Measure renderer projection code and political paint commands with Node CPU.
// The context discards commands; this reports no browser or GPU performance.
function measure(source, paint=drawPoliticalChunks, assertSparse=true) {
 const layer={};let calls=0;
 const project=(lat,lng)=>{calls++;const rad=Math.max(-85,Math.min(85,lat))*Math.PI/180;return{x:(lng+180)*1024/360,y:(1-Math.log(Math.tan(Math.PI/4+rad/2))/Math.PI)*512};};
 const a=source.indexOf('const projectionKey ='),z=source.indexOf('// --- REGION SEGMENTATION',a);
 assert.ok(a>=0&&z>a);
 const make=new Function('viewportKey','xMin','xMax','yMin','yMax','vWidth','vHeight','res','project',source.slice(a,z)+'\nreturn getGridPoint;');
 state.getGridPoint=make.call(layer,'view',0,w-1,0,h-1,w,h,.15,project);
 for(const [x,y] of [[0,0],[23.5,457.5],[w-0.5,h-0.5]]) {
  const expected=project(y*.15-90,x*.15-180),actual=state.getGridPoint(x,y);
  assert.ok(Math.abs(actual.x-expected.x)<0.001&&Math.abs(actual.y-expected.y)<0.001,'cached half-cell points retain geographic coordinates');
 }
 paint(layer,state);calls=0;const fullSamples=[];
 for(let i=0;i<9;i++){const start=performance.now();paint(layer,state);fullSamples.push(performance.now()-start);}
 const median=(samples)=>samples.sort((a,b)=>a-b)[Math.floor(samples.length/2)];
 const full={medianWarmPaintMs:median(fullSamples),leafletProjectionCallsPerPaint:calls/9,cache:{...layer._politicalChunkCache.stats}};
 const tileColumns=Math.ceil(w/32),tileRows=Math.ceil(h/32),dirtyTiles=new Set();
 assert.ok(tileColumns>10&&tileRows>10,'atlas has room for two sparse far-apart paint islands');
 for(const [centerX,centerY] of [[2,2],[8,8]])
  for(let y=centerY-1;y<=centerY+1;y++)
   for(let x=centerX-1;x<=centerX+1;x++)dirtyTiles.add(y*tileColumns+x);
 assert.equal(dirtyTiles.size,18,'sparse partial benchmark uses two far-apart 3-by-3 paint islands');
 const dirtyXs=[...dirtyTiles].map(key=>key%tileColumns),dirtyYs=[...dirtyTiles].map(key=>Math.floor(key/tileColumns));
 const partial={
  ...state,
  partialControlRedraw:true,
  dirtyControlPaintTiles:dirtyTiles,
  staticLoopXMin:Math.max(state.xMin,Math.min(...dirtyXs)*32-1),
  staticLoopYMin:Math.max(state.yMin,Math.min(...dirtyYs)*32-1),
  staticPaintXMax:Math.min(state.xMax, (Math.max(...dirtyXs)+1)*32+1),
  staticPaintYMax:Math.min(state.yMax, (Math.max(...dirtyYs)+1)*32+1)
 };
 paint(layer,partial);
 const partialBefore=layer._politicalChunkCache.stats.reused;
 const partialSamples=[];
 for(let i=0;i<9;i++){const start=performance.now();paint(layer,partial);partialSamples.push(performance.now()-start);}
 const touchedPerPaint=(layer._politicalChunkCache.stats.reused-partialBefore)/9;
 if(assertSparse)assert.equal(touchedPerPaint,50,'sparse partial paints traverse only chunks touched by clip padding');
 return {full,sparsePartial:{medianWarmPaintMs:median(partialSamples),dirtyPaintTiles:dirtyTiles.size,chunksPerPaint:touchedPerPaint}};
}
const priorPath2D=globalThis.Path2D;
let current,projectionComparison=null,paintComparison=null;
try{
 globalThis.Path2D=undefined;
 const rendererSource=readFileSync(new URL('src/renderer.js',root),'utf8');
 current=measure(rendererSource);
 assert.equal(current.full.leafletProjectionCallsPerPaint,0,'steady atlas paints must not send half-cell vertices back through Leaflet');
 assert.equal(current.full.cache.built,2850);assert.equal(current.full.cache.reused,2850*9);
 if(process.argv[2]==='--compare')projectionComparison=measure(readFileSync(process.argv[3],'utf8'));
 if(process.argv[2]==='--paint-compare'){
  const baseline=await import(pathToFileURL(process.argv[3]).href);
  paintComparison=measure(rendererSource,baseline.drawPoliticalChunks,false);
  assert.equal(paintComparison.sparsePartial.chunksPerPaint,121,'original paint code traverses the 11-by-11 bounding box');
 }
}finally{
 if(priorPath2D===undefined)delete globalThis.Path2D;
 else globalThis.Path2D=priorPath2D;
}
console.log(JSON.stringify({scope:'same-process Node CPU timing with Path2D disabled; no browser or GPU claims',current,...projectionComparison&&{projectionComparison},...paintComparison&&{baselinePaintModule:paintComparison}},null,2));
