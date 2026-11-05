import assert from "node:assert/strict";
import { createOccupationRegionCache } from "../src/occupation-regions.js";

function fixture(width = 5, height = 5) {
	const size = width * height;
	return {
		source: { territoryOwnerIds: [167] },
		gridWidth: width,
		gridHeight: height,
		worldControlMap: new Uint16Array(size).fill(167),
		deJureMap: new Uint16Array(size).fill(167),
		landMask: new Uint8Array(size).fill(1),
		dominantSideMap: new Int8Array(size).fill(-1),
		primaryOccupierMap: new Uint16Array(size),
		sovereignSideMap: new Int8Array(256).fill(-1),
		isWar: false,
		now: 0,
	};
}

const cache = createOccupationRegionCache();
const frame = fixture();
frame.worldControlMap.fill(136);
const initial = cache.get(frame);
assert.equal(initial.regions.length, 1);
assert.equal(initial.regions[0].controllerId, 136);
assert.equal(initial.regions[0].sovereignId, 167);
assert.equal(initial.regions[0].cells.length, 25);
assert.deepEqual(initial.regions[0].bounds, { minX: 0, maxX: 4, minY: 0, maxY: 4 });
assert.deepEqual(initial.regions[0].anchor, { x: 2, y: 2 });
frame.now = 250;
assert.strictEqual(cache.get(frame), initial, "unchanged samples preserve identity");
frame.worldControlMap[0] = 167;
frame.now = 499;
assert.strictEqual(cache.get(frame), initial, "updates are throttled");
frame.now = 500;
const recaptured = cache.get(frame);
assert.equal(recaptured.regions[0].cells.length, 24);
assert.ok(recaptured.revision > initial.revision);
assert.equal(initial.regions[0].cells.length, 25, "old snapshots remain unchanged");
assert.throws(() => initial.regions[0].cells.push(999), TypeError);
assert.throws(() => { initial.regions[0].bounds.minX = 99; }, TypeError);
assert.throws(() => { initial.regions[0].anchor.x = 99; }, TypeError);
assert.throws(() => initial.regions.pop(), TypeError);
frame.worldControlMap.fill(167);
frame.now = 750;
assert.equal(cache.get(frame).regions.length, 0, "full recapture removes occupation");

// Contested cells use the effective controller, including allied liberation.
frame.isWar = true;
frame.sovereignSideMap[167] = 0;
frame.sovereignSideMap[136] = 1;
frame.sovereignSideMap[42] = 0;
frame.landMask[12] = 2;
frame.dominantSideMap[12] = 1;
frame.primaryOccupierMap[12] = 136;
frame.now = 1000;
assert.equal(cache.get(frame).regions[0].controllerId, 136);
frame.primaryOccupierMap[12] = 43;
frame.now = 1250;
assert.equal(cache.get(frame).regions[0].controllerId, 43, "controller changes rebuild");
frame.primaryOccupierMap[12] = 42;
frame.now = 1500;
assert.equal(cache.get(frame).regions.length, 0, "allied liberation is excluded");
frame.primaryOccupierMap[12] = 0;
frame.now = 1750;
assert.equal(cache.get(frame).regions.length, 0, "zero occupier falls back to world owner");
frame.worldControlMap[12] = 136;
frame.dominantSideMap[12] = -1;
frame.now = 2000;
assert.equal(cache.get(frame).regions[0].controllerId, 136);
frame.dominantSideMap[12] = 1;
frame.primaryOccupierMap[12] = 43;
frame.now = 2250;
assert.equal(cache.get(frame).regions[0].controllerId, 136, "same dominant side preserves world owner");
frame.worldControlMap[12] = 42;
frame.now = 2500;
frame.landMask[12] = 1;
assert.equal(cache.get(frame).regions.length, 0);

// Water, owner zero, and territory outside the source scope never appear.
const filtered = fixture(4, 1);
filtered.worldControlMap.set([136, 0, 136, 136]);
filtered.landMask[0] = 0;
filtered.deJureMap[2] = 42;
const filteredModel = cache.get(filtered);
assert.deepEqual(filteredModel.regions[0].cells, [3]);

// Holes do not become label anchors; diagonal contacts and row ends stay separate.
const ring = fixture(5, 5);
ring.worldControlMap.fill(136);
ring.worldControlMap[12] = 167;
const ringRegion = cache.get(ring).regions[0];
assert.equal(ringRegion.cells.length, 24);
assert.notEqual(ringRegion.anchor.y * 5 + ringRegion.anchor.x, 12);
assert.ok(ringRegion.cells.includes(ringRegion.anchor.y * 5 + ringRegion.anchor.x));
const separate = fixture(4, 3);
separate.worldControlMap[3] = 136;
separate.worldControlMap[4] = 136;
separate.worldControlMap[9] = 136;
assert.equal(cache.get(separate).regions.length, 3);
separate.worldControlMap[5] = 43;
separate.now = 250;
assert.equal(cache.get(separate).regions.length, 4, "different controllers stay separate");
separate.source.territoryOwnerIds.push(42);
separate.deJureMap[5] = 42;
separate.worldControlMap[5] = 136;
const distinctSovereigns = cache.get(separate);
assert.equal(distinctSovereigns.regions.length, 4, "different sovereigns stay separate");
assert.equal(distinctSovereigns.regions.find((r) => r.cells.includes(5)).sovereignId, 42);

// Replacement arrays and sources bypass throttling; explicit clear handles in-place resets.
const restart = fixture(2, 2);
const empty = cache.get(restart);
restart.worldControlMap = new Uint16Array(4).fill(136);
const restarted = cache.get(restart);
assert.notStrictEqual(restarted, empty);
assert.equal(restarted.regions[0].cells.length, 4);
restart.deJureMap = new Uint16Array(4).fill(136);
assert.equal(cache.get(restart).regions.length, 0);
restart.deJureMap.fill(167);
cache.clear();
assert.equal(cache.get(restart).regions[0].cells.length, 4);
restart.landMask = new Uint8Array(4);
assert.equal(cache.get(restart).regions.length, 0);
restart.landMask.fill(1);
restart.source = { territoryOwnerIds: [167] };
assert.equal(cache.get(restart).regions[0].cells.length, 4);
restart.now = 100;
cache.get(restart);
restart.worldControlMap.fill(167);
restart.now = 99;
assert.equal(cache.get(restart).regions.length, 0, "clock reversal refreshes immediately");
restart.worldControlMap.fill(136);
restart.source = undefined;
assert.equal(cache.get(restart).regions.length, 0);
restart.source = { territoryOwnerIds: [] };
assert.equal(cache.get(restart).regions.length, 0);
restart.source = { territoryOwnerIds: [167] };
assert.equal(cache.get(restart).regions[0].cells.length, 4);
restart.gridWidth = 4;
restart.gridHeight = 1;
assert.deepEqual(cache.get(restart).regions[0].bounds, { minX: 0, maxX: 3, minY: 0, maxY: 0 });

for (const ids of [[0], [-1], [65536], [1.5], ["167"]]) {
	assert.throws(() => cache.get({ ...restart, source: { territoryOwnerIds: ids } }), TypeError);
}
for (const dimensions of [[0, 1], [1.5, 1], [2, -1], [3, 2]]) {
	assert.throws(() => cache.get({ ...restart, gridWidth: dimensions[0], gridHeight: dimensions[1] }), RangeError);
}
assert.throws(() => cache.get({ ...restart, isWar: true, dominantSideMap: [] }), RangeError);
assert.throws(() => cache.get({ ...restart, isWar: true, sovereignSideMap: undefined }), TypeError);
console.log("Occupation region smoke passed: scope, controllers, components, anchors, cache and immutable snapshots");
