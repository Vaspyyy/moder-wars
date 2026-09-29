import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const worker=readFileSync(new URL("../workers/service-worker.js",import.meta.url),"utf8");
for(const module of ["ai-intel","experiment","experiment-ui","economy","combined-arms","air-power"]){
 assert.equal(existsSync(new URL(`../src/${module}.js`,import.meta.url)),false);
 assert.equal(worker.includes(`src/${module}.js`),false);
 assert.equal(main.includes(`./${module}.js`),false);
}
for(const id of ["experiment-seed-input","randomize-seed-btn","force-mode-select","advanced-sides-ai","advanced-simulation-systems","war-economy-checkbox","armor-enabled-checkbox","air-power-enabled-checkbox","rebellion-btn","after-action-report","war-archive-overlay","reopen-report-btn","auto-after-action-report-checkbox","combined-arms-editor-section"])
 assert.equal(html.includes(`id="${id}"`),false,`${id} removed`);
assert.ok(html.indexOf('id="ffa-toggle-btn"')<html.indexOf('id="sides-container"'));
assert.doesNotMatch(main,/createNativeRuntimeCheckpoint|_aiIntelBySide|activeExperimentRecorder|occupationGarrisonPlans|countryEconomy|airWings|armorEnabled/);
assert.match(main,/startBtn.addEventListener\("click"/);
assert.match(worker,/src\/war-overview.js/);
console.log("Removed subsystem and setup checks passed");
