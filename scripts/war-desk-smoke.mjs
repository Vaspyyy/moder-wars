import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const start = main.indexOf("function warDeskOverviewRows(");
const end = main.indexOf("function updateExperimentWarDesk(", start);
const countries = [{ countryId: 1, name: "A", color: "rgba(200, 50, 50, 0.5)" }, { countryId: 2, name: "B", color: "#3498db" }];
const ledger = new Map([
	[1, { deJureTotal: 100, deJureControlBySide: { 0: 100 } }],
	[2, { deJureTotal: 300, deJureControlBySide: { 0: 150 } }],
]);
const context = vm.createContext({
	experimentSideDefinitions: () => [{ uid: "allies", color: "#e9d58d", countries }],
	sideUids: ["allies"],
	sides: [[{ id: 1, name: "A" }]],
	getCountryLedger: (_, id) => ledger.get(id),
	_territoryLedgerSnapshot: {},
	getCountryLivePersonnel: (id) => id === 1 ? 80 : 0,
	countryMetadata: [{ color: "rgba(200, 50, 50, 0.5)" }],
	sideColors: ["#e9d58d"],
	countryCasualties: new Map([[1, 20], [2, 70]]),
});
vm.runInContext(main.slice(start, end), context);
const metric = { sideUid: "allies", name: "A Allies", personnel: 120, casualties: 90 };
const rows = context.warDeskOverviewRows([metric]);
assert.equal(rows[0].color, "#e9d58d");
assert.equal(rows[1].color, "rgba(200, 50, 50, 0.5)");
assert.equal(rows[2].color, "#3498db", "retired members retain country colors");
assert.equal(rows.length, 3, "retain country rows after a member capitulates");
assert.equal(rows[0].detail, "62.5% original territory retained", "weight by original land area");
assert.equal(rows[0].value, 120, "side manpower includes its pooled reserve");
assert.equal(rows[1].value, 80, "country manpower uses deployed personnel");
assert.equal(rows[1].detail, "100.0% original territory retained");
assert.equal(rows[2].secondaryValue, 70);
context.sideUids = [];
assert.equal(context.warDeskOverviewRows([metric])[0].detail, "0.0% original territory retained");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const id of ["economy-tab", "events-tab", "intervene-tab", "economy-panel", "events-panel", "intervene-panel", "advantage", "phase", "ai-operations"]) {
	assert.ok(!html.includes(`id="war-desk-${id}"`), `${id} removed from War Desk`);
}
const ui = readFileSync(new URL("../src/experiment-ui.js", import.meta.url), "utf8");
const entriesStart = ui.indexOf("function metricEntries(");
const entriesEnd = ui.indexOf("function nestedMetricEntries(", entriesStart);
const cardsStart = ui.indexOf("function renderMetricCards(");
const cardsEnd = ui.indexOf("function renderTelemetryList(", cardsStart);
const node = () => ({
	children: [], properties: {}, classList: { add() {} },
	style: { setProperty(key, value) { this[key] = value; } },
	append(...children) { this.children.push(...children); },
	replaceChildren(...children) { this.children = children; },
});
const target = node();
Object.assign(context, {
	asText: (value, fallback = "") => value == null ? fallback : String(value),
	createElement: () => node(), setTone() {}, formatExperimentMetric: String,
});
vm.runInContext(ui.slice(entriesStart, entriesEnd) + ui.slice(cardsStart, cardsEnd), context);
context.renderMetricCards({ createDocumentFragment: node }, target, rows, "");
const cards = target.children[0].children;
assert.equal(cards[0].style["--war-accent"], "#e9d58d");
assert.equal(cards[1].style["--war-accent"], "rgba(200, 50, 50, 1)", "card accents are opaque even if map colors are translucent");
assert.equal(cards[2].style["--war-accent"], "#3498db");
console.log("War Desk overview smoke tests passed");
