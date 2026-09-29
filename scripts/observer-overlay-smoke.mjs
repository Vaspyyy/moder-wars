import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
const start=main.indexOf("export function getAiOperationsSnapshot(");
const end=main.indexOf("function warDeskOverviewRows(",start);
assert.ok(start >= 0 && end > start, "live task-force snapshot function exists");
const context=vm.createContext({gameMode:"CONQUEST",gameState:"SIMULATING",sideUids:["a"],_aiTaskForcesBySide:new Map([["a",[{id:"push",phase:"ASSEMBLING",target:{lat:1,lng:2},readiness:.8}]]])});
vm.runInContext(main.slice(start,end).replace("export function","function"),context);
const snapshot=context.getAiOperationsSnapshot();
assert.equal(snapshot.taskForces.length,1);
assert.equal(snapshot.taskForces[0].phase,"ASSEMBLING");
assert.equal(snapshot.taskForces[0].objective.lat,1);
assert.equal(snapshot.contacts,undefined);
for(const mode of ["EDITOR","EDITOR_TEST"]){
 context.gameMode=mode;
 assert.equal(context.getAiOperationsSnapshot(),null,`${mode} must not expose Conquest task-force overlays`);
}
context.gameMode="CONQUEST";
assert.equal(context.getAiOperationsSnapshot("missing-side"),null,"retired or unknown side identities produce no overlay");
assert.equal(context.getAiOperationsSnapshot("a").sideIndex,0,"returning to Conquest retains live task-force state");
const renderer=readFileSync(new URL("../src/renderer.js",import.meta.url),"utf8");
const overlayStart=renderer.indexOf("function drawAiOperationsOverlay(");
const overlayEnd=renderer.indexOf("const _allianceCache",overlayStart);
assert.ok(overlayStart >= 0 && overlayEnd > overlayStart, "task-force overlay renderer exists");
vm.runInContext(renderer.slice(overlayStart,overlayEnd),context);
const canvas=new Proxy({},{get(){throw new Error("empty operations must draw nothing");}});
context.drawAiOperationsOverlay(canvas,{taskForces:[]},()=>{throw new Error("nothing to project");});
console.log("Operations overlay checks passed");
