import assert from "node:assert/strict";
import {
	createPresentationScheduler,
	createUnitSpatialMirror,
	setPresentationText,
} from "../src/presentation-runtime.js";

// The same presentation stream admits the same paint rate on different displays.
for (const hz of [60, 120, 165, 240]) {
	const scheduler = createPresentationScheduler();
	let paints = 0;
	for (let frame = 0; frame < hz; frame++) {
		const now = frame * 1000 / hz;
		const revision = Math.floor((now + 0.001) / (1000 / 30));
		if (scheduler.admit({ now, revision })) {
			scheduler.painted(now, revision);
			paints++;
		}
	}
	assert.ok(paints <= 30 && paints >= 29, `${hz} Hz: ${paints} paints`);
}
const scheduler = createPresentationScheduler();
assert.equal(scheduler.admit({ now: 0, revision: 1 }), true);
scheduler.painted(0, 1);
assert.equal(scheduler.admit({ now: 100, revision: 1 }), false, "unchanged snapshots stay cached");
assert.equal(scheduler.admit({ now: 100, revision: 2, workMs: 20 }), false);
assert.equal(scheduler.admit({ now: 130, revision: 2, workMs: 20 }), false);
assert.equal(scheduler.admit({ now: 150, revision: 2, workMs: 20 }), true, "intake spikes cannot starve paint");
scheduler.painted(150, 2);
assert.equal(scheduler.admit({ now: 151, revision: 2, force: true }), true, "camera settlement bypasses cadence");
assert.equal(scheduler.admit({ now: 200, revision: 2, dirty: true }), true, "settings/loading still repaint");
scheduler.reset();
assert.equal(scheduler.admit({ now: 0, revision: 2 }), true);
const bounded = createPresentationScheduler();
bounded.painted(0, 1);
assert.equal(bounded.admit({ now: 10, revision: 2, workMs: 20 }), false);
assert.equal(bounded.admit({ now: 34, revision: 3, workMs: 20 }), false);
assert.equal(bounded.admit({ now: 60, revision: 4, workMs: 20 }), true,
	"costly intake starts the deferral bound even before the paint cadence is due");

const hash = new Map(), sideHashes = [new Map(), new Map()];
const mirror = createUnitSpatialMirror(hash, sideHashes, 2.5);
const units = Array.from({ length: 200 }, (_, i) => ({ id: (i + 1) / 1001, lat: i % 13, lng: i % 23, sideIndex: i % 2 }));
mirror.update(units);
const firstBuckets = new Map(hash);
mirror.update(units);
for (const [key, list] of firstBuckets) assert.equal(hash.get(key), list, "unchanged buckets retain allocation");
const expectedKey = ({lat,lng}) => (((Math.floor((lng + 180) / 2.5) % 144) + 144) % 144) * 100 + Math.floor((lat + 90) / 2.5);
function verify(current) {
	const valid = current.filter(u => Number.isFinite(u.lat) && Number.isFinite(u.lng));
	const flattened = [...hash.values()].flat();
	assert.equal(flattened.length, valid.length);
	assert.deepEqual(new Set(flattened), new Set(valid));
	for (const [key, list] of hash) for (const u of list) assert.equal(key, expectedKey(u));
	for (let side = 0; side < sideHashes.length; side++) {
		assert.deepEqual(new Set([...sideHashes[side].values()].flat()), new Set(valid.filter(u => u.sideIndex === side)));
	}
}
for (let turn = 0; turn < 12; turn++) {
	for (let i = 0; i < units.length; i += 7) { units[i].lng += 6; units[i].sideIndex ^= 1; }
	units.splice(turn, 2);
	units.push({ id: 900 + turn / 1001, lat: 1, lng: turn % 2 ? 180 : -180, sideIndex: turn % 2 });
	if (turn === 2) units[0].lat = NaN;
	if (turn === 3) units[1] = { ...units[1] };
	mirror.update(units);
	verify(units);
}
hash.clear();
for (const map of sideHashes) map.clear();
mirror.update(units);
verify(units);
mirror.update(units, true);
verify(units);
mirror.update([]);
assert.equal(hash.size, 0);
assert.ok(sideHashes.every(map => !map.size));

let writes = 0, text = "";
const element = { get textContent() { return text; }, set textContent(value) { writes++; text = value; } };
setPresentationText(element, 42);
setPresentationText(element, 42);
setPresentationText(element, 43);
assert.equal(writes, 2);
console.log("Presentation cadence, snapshot budget, spatial identity/removal and changed HUD text checks passed");
