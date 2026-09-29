import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const start = main.indexOf("function warDeskOverviewRows(");
const end = main.indexOf("function updateWarOverview(", start);
const context = vm.createContext({
 _warOverviewSides: [{uid:"allies", name:"Allies", color:"#e9d58d", countries:[{id:1,name:"A",color:"#c83232"},{id:2,name:"B",color:"#3498db"}]}],
 units: [{sovereignId:1,health:100,personnel:80},{sovereignId:2,health:0,personnel:50}],
 sideUids:["allies"], sideSoldiers:[120],
 getLiveFormationPersonnel: unit=>unit.personnel,
 getCountryLedger: (_,id)=>new Map([[1,{deJureTotal:100,deJureControlBySide:{0:100}}],[2,{deJureTotal:300,deJureControlBySide:{0:150}}]]).get(id),
 _territoryLedgerSnapshot:{}, countryCasualties:new Map([[1,20],[2,70]]),
});
vm.runInContext(main.slice(start,end),context);
const rows=context.warDeskOverviewRows();
assert.equal(rows.length,3);
assert.equal(rows[0].label,"Allies");
assert.equal(rows[0].value,120,"side manpower includes pooled reserves");
assert.equal(rows[0].secondaryValue,90);
assert.equal(rows[0].detail,"62.5% original territory retained","original territory is weighted by area");
assert.equal(rows[1].value,80);
assert.equal(rows[2].value,0,"dead formations do not contribute personnel");
assert.equal(rows[2].color,"#3498db","defeated countries retain their color and losses");
context.sideUids=[];
assert.equal(context.warDeskOverviewRows()[0].value,0);
assert.equal(context.warDeskOverviewRows()[0].detail,"0.0% original territory retained");
console.log("War overview accounting checks passed");
