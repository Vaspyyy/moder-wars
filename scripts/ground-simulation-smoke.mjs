import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
const slice=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0 && b>a,`Missing source boundary: ${start}`);return main.slice(a,b);};
const context=vm.createContext({
 CONFIG:{UNIT_HEALTH:100,UNIT_TO_SOLDIER_RATIO:1000}, MAX_SIDES:8,UNIT_HASH_CELL_SIZE:2.5,
 sides:[[{id:1}],[{id:2}],[{id:3}]],countryMetadata:[],
 getLiveFormationStrength:unit=>unit.personnel/1000,
 getLiveFormationPersonnel:unit=>unit.personnel,
 getEffectiveBuffState:()=>"none",
 areSidesHostile:(a,b)=>a!==b && a<2 && b<2,
 geoDistSq:(a,b,c,d)=>{let dl=b-d;if(dl>180)dl-=360;if(dl< -180)dl+=360;return (a-c)**2+dl**2;},
 units:[],unitSpatialHash:new Map(),_liveSideCombatPower:new Float64Array(8),
 sideSoldiers:new Float64Array([10000,10000]),sideCasualties:new Float64Array(8),countryCasualties:new Map(),casualtyByAttacker:new Map(),
 sidePairKey:(a,b)=>[a,b].sort().join("|"),
});
vm.runInContext(slice("function operationalUnitPower(","function serializeOperationalUnit("),context);
vm.runInContext(slice("function estimateLocalForces(","function operationalLocalRisk("),context);
vm.runInContext(slice("function refreshLiveCombatPower(","let _warLifecycleToken"),context);
vm.runInContext(slice("function recordCountryCombatLoss(","export function performSimulationTick("),context);
const makeUnit=(id,side,personnel,lng)=>({id,sovereignId:side+1,sideIndex:side,personnel,personnelCapacity:personnel,health:100,maxHealth:100,lat:0,lng,deployTicks:0,kind:"army"});
const friendly=makeUnit(1,0,5000,179.8),enemy=makeUnit(2,1,2000,-179.8),neutral=makeUnit(3,2,9000,179.9);
context.units=[friendly,enemy,neutral,{...enemy,id:4,health:0},{...enemy,id:5,deployTicks:30}];
const fallback=context.estimateLocalForces(0,0,179.8,1);
assert.equal(fallback.friendlies,1);assert.equal(fallback.enemies,1);
assert.equal(fallback.friendlyHealth,5);assert.equal(fallback.enemyHealth,2);
for(const unit of context.units){const key=Math.floor((unit.lng+180)/2.5)*100+Math.floor((unit.lat+90)/2.5);const bucket=context.unitSpatialHash.get(key)||[];bucket.push(unit);context.unitSpatialHash.set(key,bucket);}
assert.deepEqual(context.estimateLocalForces(0,0,179.8,1),fallback,"hashed queries preserve wrapped local strengths");
context.refreshLiveCombatPower();assert.equal(context.getKnownEnemyPowerForSide(0),2,"exclude neutral, dead, and deploying forces");
assert.equal(context.formationDamage(10,friendly),50,"compressed ground formations retain combat power");
assert.equal(context.applyLandUnitDamage(friendly,10,enemy),500);
assert.equal(friendly.health,90);assert.equal(friendly.personnel,4500);
assert.equal(context.sideSoldiers[0],9500);assert.equal(context.sideCasualties[0],500);
assert.equal(context.countryCasualties.get(1),500);assert.equal(context.casualtyByAttacker.get(1).get(2),500);
assert.equal(context.applyLandUnitDamage(friendly,Infinity,enemy),0);
assert.equal(context.applyLandUnitDamage(friendly,200,enemy),4500);
assert.equal(context.applyLandUnitDamage(friendly,10,enemy),0,"do not count a dead formation twice");
const matrix=context.createHostilityMatrix(3,new Set(["a|b"]),["a","b","c"]);
assert.equal(matrix[1],1);assert.equal(matrix[8],1);assert.equal(matrix[2],0);assert.equal(matrix[0],0);
console.log("Ground combat, hostility, and direct battlefield checks passed");
