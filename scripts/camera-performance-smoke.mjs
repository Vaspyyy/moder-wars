import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawPoliticalChunks} from '../src/render-political-cache.js';
const root=new URL('../',import.meta.url),b=readFileSync(new URL('assets/geodata/derived/ne_110m_admin_0_countries_0.15.mwr',root)),v=new DataView(b.buffer,b.byteOffset,b.byteLength),w=v.getUint16(6,true),h=v.getUint16(8,true),n=v.getUint16(10,true),world=new Uint16Array(w*h);let at=0;
for(let offset=16;offset<b.length;offset+=4){const count=v.getUint16(offset,true),id=v.getUint16(offset+2,true);world.fill(id,at,at+count);at+=count;}
const state={gridWidth:w,gridHeight:h,step:1,currentZoom:3,worldControlMap:world,landMask:Uint8Array.from(world,id=>id?1:0),biomeMask:new Uint8Array(w*h),dominantSideMap:new Int8Array(w*h).fill(-1),primaryOccupierMap:new Uint16Array(w*h),sovereignSideMap:new Int8Array(n+1).fill(-1),countryMetadata:Array.from({length:n},(_,i)=>({id:i+1,rgba:[70+(i*37)%160,70+(i*71)%160,70+(i*53)%160,1]})),sideColors:[],isWar:false,isAtlas:true,isSimplifiedMode:true,useSimplifiedBase:true,atlasCoast:true,viewMode:'POLITICAL',allianceViewEnabled:false,mountainsEnabled:false,disableCountryGradient:true,politicalStyleKey:'atlas',xMin:0,xMax:w-1,yMin:0,yMax:h-1,staticLoopXMin:0,staticLoopYMin:0,ctx:{beginPath(){},fill(){},rect(){},moveTo(){},lineTo(){},closePath(){}}};
// Measure actual renderer projection code and actual political paint commands.
// The context discards commands: this measures Node CPU, never browser/GPU FPS.
function measure(source) {
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
 drawPoliticalChunks(layer,state);calls=0;const start=performance.now();
 for(let i=0;i<5;i++)drawPoliticalChunks(layer,state);
 return {warmPaintMs:(performance.now()-start)/5,leafletProjectionCallsPerPaint:calls/5,cache:layer._politicalChunkCache.stats};
}
const current=measure(readFileSync(new URL('src/renderer.js',root),'utf8'));
assert.equal(current.leafletProjectionCallsPerPaint,0,'steady atlas paints must not send half-cell vertices back through Leaflet');
assert.equal(current.cache.built,2850);assert.equal(current.cache.reused,14250);
const comparison=process.argv[2]==='--compare'?measure(readFileSync(process.argv[3],'utf8')):null;
console.log(JSON.stringify({scope:'Node projection and paint command CPU; no browser or GPU',current,...comparison&&{comparison}},null,2));
