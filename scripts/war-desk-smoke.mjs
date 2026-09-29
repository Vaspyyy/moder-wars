import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {initWarOverview, renderWarOverview} from "../src/war-overview.js";
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const start = main.indexOf("function warDeskOverviewRows(");
const end = main.indexOf("function updateWarOverview(", start);
assert.ok(start >= 0 && end > start, "overview accounting function exists");
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
class Node {
 constructor(){this.children=[];this.attributes={};this.styles={};this.textContent="";this.hidden=false;this.style={setProperty:(key,value)=>{this.styles[key]=value;}};}
 append(...children){this.children.push(...children);}
 replaceChildren(fragment){this.children=fragment.children;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(event,handler){assert.equal(event,"click");this.click=handler;}
}
const button=new Node(),body=new Node(),target=new Node();
const classes=new Set();
const root={classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);}}};
const nodes={"war-desk-toggle-btn":button,"war-desk-body":body,"war-desk":root,"war-desk-overview-metrics":target};
const dom={getElementById:id=>nodes[id],createElement:()=>new Node(),createDocumentFragment:()=>new Node()};
initWarOverview(dom);
button.click();
assert.equal(body.hidden,true);
assert.equal(button.attributes["aria-expanded"],"false");
assert.equal(classes.has("collapsed"),true);
button.click();
assert.equal(body.hidden,false);
assert.equal(button.attributes["aria-expanded"],"true");
assert.equal(classes.has("collapsed"),false);
renderWarOverview(rows,dom);
assert.equal(target.children.length,3);
assert.equal(target.children[0].styles["--war-accent"],"#e9d58d");
assert.equal(target.children[0].children[2].textContent,"62.5% original territory retained");
assert.equal(target.children[1].children[1].children[0].children[1].textContent,"80");
assert.equal(target.children[2].children[1].children[1].children[1].textContent,"70");
assert.match(target.children[2].className,/metric--country/);
renderWarOverview([],dom);
assert.equal(target.children.length,0,"empty updates remove stale country rows");
console.log("War overview accounting and collapse checks passed");
