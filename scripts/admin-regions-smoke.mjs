import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createAdminRegionsLoader, decodeAdminRegions, intersectsAdminBounds } from "../src/admin-regions.js";
import { clearAdminRegionDrawing, drawAdminRegions } from "../src/render-admin-regions.js";

const fixture = { version: 1, regions: [
    { id: "UA-TEST", country: "UKR", names: { en: "Kyiv Region", uk: "Київська область", ru: "Киевская область" }, bbox: [25,45,35,55], anchor: [30,50], rings: [[25,45,35,45,35,55,25,55,25,45]] },
    { id: "UA-OVERLAP", country: "UKR", names: { en: "Overlap" }, bbox: [26,46,34,54], anchor: [30,50], rings: [[26,46,34,46,34,54,26,54,26,46]] },
    { id: "US-OFFSCREEN", country: "USA", names: { en: "Offscreen" }, bbox: [-105,35,-100,40], anchor: [-102,37], rings: [[-105,35,-100,35,-100,40,-105,40,-105,35]] },
] };
const bounds = (w,s,e,n) => ({ getWest:()=>w, getSouth:()=>s, getEast:()=>e, getNorth:()=>n });
assert.equal(decodeAdminRegions(fixture),fixture.regions);
assert.throws(()=>decodeAdminRegions({ version: 2, regions: [] }));
assert.throws(()=>decodeAdminRegions({ version: 1, regions: [{...fixture.regions[0], rings:[[0,NaN,1,1,0,0]]}] }));
assert.equal(intersectsAdminBounds([25,45,35,55], bounds(20,40,40,60)),true);
assert.equal(intersectsAdminBounds([25,45,35,55], bounds(-110,30,-90,45)),false);
assert.equal(intersectsAdminBounds([175,40,179,50], bounds(170,30,-170,60)),true);
assert.equal(intersectsAdminBounds([-179,40,-175,50], bounds(170,30,-170,60)),true);
assert.equal(intersectsAdminBounds([25,45,35,55], bounds(170,30,-170,60)),false);
assert.equal(intersectsAdminBounds([25,45,35,55], bounds(-200,-90,200,90)),true);

for (const compressed of [false,true]) {
    let requests=0;
    const data=Buffer.from(JSON.stringify(fixture));
    const loader=createAdminRegionsLoader({fetcher:async()=>{requests++;return new Response(compressed?gzipSync(data):data);}});
    const first=loader.load();
    assert.equal(loader.load(),first,"concurrent views share one request");
    assert.deepEqual(await first,fixture.regions);
    assert.equal(loader.data.length,3);
    assert.equal(loader.load(),null,"decoded geography is reused");
    assert.equal(requests,1);
}
let time=0, failures=0;
const unavailable=createAdminRegionsLoader({fetcher:async()=>{failures++;return new Response("missing",{status:404});},now:()=>time,retryMs:100,warn:()=>{}});
for(let attempt=0;attempt<3;attempt++) {
    assert.equal(await unavailable.load(),null);
    for(let frame=0;frame<100;frame++) assert.equal(unavailable.load(),null,"failed geography must not retry every frame");
    time+=100;
}
assert.equal(unavailable.load(),null,"retry budget is bounded");
assert.equal(failures,3);

const originalFetch=globalThis.fetch, originalPath=globalThis.Path2D, originalDocument=globalThis.document;
try {
    let requests=0, oldReady=0, newReady=0;
    globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify(fixture));};
    globalThis.document={cookie:"mw_lang=en"};
    class RecordedPath {
        commands=[];
        moveTo(x,y){this.commands.push(["M",x,y]);}
        lineTo(x,y){this.commands.push(["L",x,y]);}
    }
    globalThis.Path2D=RecordedPath;
    const labels=[], paths=[];
    const ctx={save(){},restore(){},setLineDash(){},stroke(path){paths.push(path);},strokeText(){},fillText(text){labels.push(text);},measureText(text){return {width:text.length*5};}};
    const layer={};
    const frame={ctx,project:(lat,lng)=>({x:(lng-20)*20,y:(60-lat)*20}),viewBounds:bounds(20,40,40,60),currentZoom:6,viewportKey:"view1",mapSize:{x:400,y:400},enabled:true,onReady:()=>oldReady++};
    drawAdminRegions.call(layer,{...frame,enabled:false});
    drawAdminRegions.call(layer,{...frame,currentZoom:3});
    drawAdminRegions.call(layer,{...frame,isCustomTerrain:true});
    assert.equal(requests,0,"hidden, world-scale and custom maps do not load geography");
    drawAdminRegions.call(layer,frame);
    const request=layer._adminRegionRequest.promise;
    clearAdminRegionDrawing(layer);
    drawAdminRegions.call(layer,{...frame,onReady:()=>newReady++});
    await request;
    assert.equal(oldReady,0,"removed-layer request cannot trigger stale redraw");
    assert.equal(newReady,1);
    assert.equal(requests,1);
    drawAdminRegions.call(layer,frame);
    assert.equal(layer._adminRegionDrawing.visible.length,2,"offscreen geometry is culled");
    assert.deepEqual(labels,["Kyiv Region"],"overlapping labels are suppressed");
    assert.equal(layer._adminRegionLabelBoxes.length,1,"rendered labels reserve space for other map labels");
    for (const disabled of [{enabled:false},{showLabels:false},{currentZoom:4},{isCustomTerrain:true}]) {
        drawAdminRegions.call(layer,{...frame,...disabled});
        assert.deepEqual(layer._adminRegionLabelBoxes,[],"hidden administrative labels must release collision boxes");
        drawAdminRegions.call(layer,frame);
        assert.equal(layer._adminRegionLabelBoxes.length,1);
    }
    const drawing=layer._adminRegionDrawing;
    drawAdminRegions.call(layer,frame);
    assert.equal(layer._adminRegionDrawing,drawing,"unchanged view reuses paths and placement");
    globalThis.document.cookie="mw_lang=uk";
    labels.length=0;
    drawAdminRegions.call(layer,frame);
    assert.deepEqual(labels,["Київська область"],"language updates cached labels without rebuilding paths");
    assert.equal(layer._adminRegionDrawing,drawing);
    drawAdminRegions.call(layer,{...frame,viewportKey:"view2"});
    assert.notEqual(layer._adminRegionDrawing,drawing,"camera changes rebuild projected geometry");
    labels.length=0;
    drawAdminRegions.call(layer,{...frame,allowedCountryCodes:["USA"]});
    assert.deepEqual(labels,[],"theater excludes other countries' labels");
    assert.equal(layer._adminRegionDrawing.visible.length,0,"theater excludes other countries' outlines");
    drawAdminRegions.call(layer,frame);
    assert.ok(layer._adminRegionDrawing.visible.length>0,"world scenario restores unfiltered geography");
    clearAdminRegionDrawing(layer);
    assert.equal(layer._adminRegionDrawing,null);
    assert.deepEqual(layer._adminRegionLabelBoxes,[],"removed layer must release label collision boxes");
} finally {
    globalThis.fetch=originalFetch;
    globalThis.Path2D=originalPath;
    if(originalDocument===undefined) delete globalThis.document;
    else globalThis.document=originalDocument;
}
console.log("Administrative regions: gzip/raw loading, retry bounds, antimeridian culling, lazy loading, layer disposal, projection cache and localized collision-free labels passed");

const packed = readFileSync(new URL("../assets/geodata/admin1/regions.json.gz", import.meta.url));
assert.ok(packed.length < 2_000_000, "administrative layer stays within its download budget");
const bundled = decodeAdminRegions(JSON.parse(gunzipSync(packed)));
const ukrainian = bundled.filter(region => region.country === "UKR");
assert.equal(ukrainian.length, 27, "all Ukrainian administrative units remain in the reference layer");
assert.equal(ukrainian.filter(region => region.names.uk.endsWith(" область")).length, 24);
assert.ok(ukrainian.some(region => region.names.uk === "Автономна Республіка Крим"));
assert.ok(ukrainian.some(region => region.names.uk === "м. Севастополь"));
assert.equal(new Set(bundled.map(region => region.id)).size, bundled.length);
console.log(`Bundled administrative geography: ${bundled.length} regions, Ukraine 27, compressed size budget passed`);
