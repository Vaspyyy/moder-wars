import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolveWorkerAssetUrl } from "../src/worker-asset-url.js";

const workerUrl = "https://game.example/nested/assets/scenario-worker-abc.js";
const packaged = "https://game.example/nested/assets/maps/map.mwsc.gz?rev=123";
assert.equal(resolveWorkerAssetUrl(packaged, workerUrl), packaged);
assert.equal(
	resolveWorkerAssetUrl("maps/World%20War.json", workerUrl),
	"https://game.example/nested/assets/maps/World%20War.json",
);
const blob = "blob:https://game.example/fixture";
assert.equal(resolveWorkerAssetUrl(blob, workerUrl, true), blob);
assert.throws(() => resolveWorkerAssetUrl(blob, workerUrl));
for (const url of [
	"https://outside.example/nested/assets/map.json",
	"https://game.example.attacker.test/nested/assets/map.json",
	"https://user:password@game.example/nested/assets/map.json",
	"https://game.example/api/delete",
	"https://game.example/nested/assets/../../api/delete",
	"https://game.example/nested/assets/%2e%2e/api/delete",
	"https://game.example/nested/assets/maps/%252e%252e/private",
	"https://game.example/nested/assets/maps/a%2f..%2fprivate",
	"http://game.example/nested/assets/map.json",
	"blob:https://outside.example/fixture",
	"data:application/json,{}",
	"file:///etc/passwd",
])
	assert.throws(() => resolveWorkerAssetUrl(url, workerUrl, true), url);

// Exercise actual worker handlers: denied requests never reach fetch; reload
// fallback blobs still work and both download paths omit ambient credentials.
for (const name of ["geo-raster-worker", "scenario-worker"]) {
	const messages = [];
	const requests = [];
	const self = {
		location: { href: workerUrl },
		postMessage: (message) => messages.push(message),
	};
	const code = readFileSync(
		new URL(`../workers/${name}.js`, import.meta.url),
		"utf8",
	).replace(/^import[\s\S]*?;\n/gm, "");
	const arrays = () =>
		Object.fromEntries(
			["worldControl", "deJure", "land", "biome", "province"].map((key) => [
				key,
				new Uint8Array(1),
			]),
		);
	vm.runInNewContext(code, {
		self,
		resolveWorkerAssetUrl,
		performance,
		TextDecoder,
		Uint8Array,
		fetch: async (url, options) => {
			requests.push({ url, options });
			assert.equal(options.credentials, "omit");
			assert.equal(options.redirect, "error");
			if (url === packaged) return { ok: false, status: 404 };
			return {
				ok: true,
				headers: new Map(),
				json: async () => ({ features: [] }),
				arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
			};
		},
		rasterizeGeoFeatures: async () => ({ land: new Uint8Array(1) }),
		decodeScenarioJson: () => ({ ...arrays(), entryCount: 1 }),
	});
	await self.onmessage({
		data: {
			type: "load",
			id: 1,
			url: "https://outside.example/map.json",
			sourceUrl: "https://outside.example/map.json",
		},
	});
	assert.equal(requests.length, 0);
	assert.equal(messages.at(-1).type, "error");
	await self.onmessage({
		data: {
			type: "load",
			id: 2,
			url: packaged,
			jsonFallbackUrl: blob,
			sourceUrl: packaged.replace(
				"maps/map.mwsc.gz?rev=123",
				"geodata/map.json",
			),
		},
	});
	assert.equal(messages.at(-1).type, "result", name);
	assert.equal(requests.length, name === "scenario-worker" ? 2 : 1);
	if (name === "scenario-worker") assert.equal(requests.at(-1).url, blob);
}
console.log(
	"Worker asset boundaries, denied downloads and local-blob fallback passed.",
);
