import assert from "node:assert/strict";

// Simulate an old tab holding the v1 database open. The v2 cache upgrade must
// fail open instead of leaving geography downloads waiting forever.
globalThis.indexedDB = {
	open() {
		const request = {};
		queueMicrotask(() => request.onblocked?.());
		return request;
	},
};

const { _geoCacheGet, _geoCachePut } = await import("../src/geo.js");

async function withTimeout(promise, label) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`${label} timed out`)), 250),
		),
	]);
}

assert.equal(
	await withTimeout(_geoCacheGet("blocked-cache-test"), "cache read"),
	null,
);
assert.equal(
	await withTimeout(
		_geoCachePut("blocked-cache-test", { type: "FeatureCollection" }),
		"cache write",
	),
	null,
);

console.log("geo cache smoke: blocked upgrades fail open");
