import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../dist/", import.meta.url),
	read = (path) => readFileSync(new URL(path, root), "utf8");
const shell = JSON.parse(read("offline-manifest.json"));
for (const path of shell)
	assert.ok(existsSync(new URL(path, root)), `offline asset ${path}`);
assert.ok(shell.some((path) => path.includes("war-simulation-worker-")));
assert.ok(shell.every((path) => !path.startsWith("src/")));
const html = read("index.html");
assert.doesNotMatch(html, /leaflet|imagery-select|src\/main\.js|\.ts["']/i);
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g))
	assert.ok(existsSync(new URL(match[1], root)), match[1]);
const scripts = readdirSync(new URL("assets/", root)).filter((path) =>
	path.endsWith(".js"),
);
for (const path of scripts) {
	const source = read(`assets/${path}`);
	assert.doesNotMatch(
		source,
		/\.\.\/src\//,
		"bundled workers must not reference source modules",
	);
	if (path.startsWith("war-simulation-worker-"))
		assert.ok(
			source.length > 100000,
			"simulation code belongs in the worker bundle",
		);
}
assert.ok(existsSync(new URL("assets/maps/world map 2022.json", root)));
assert.ok(
	existsSync(
		new URL(
			"assets/geodata/50m/cultural/ne_50m_populated_places_simple.json",
			root,
		),
	),
);
// Exercise install/activate/fetch handlers against a project subpath in Node.
const handlers = new Map(),
	cacheEntries = new Map(),
	caches = new Map();
const storage = {
	open: async (name) => {
		if (!caches.has(name))
			caches.set(name, {
				addAll: async (urls) => {
					for (const url of urls) {
						const relative = url.replace("https://example.com/moder-wars/", "");
						assert.ok(existsSync(new URL(relative, root)), relative);
						cacheEntries.set(url, new Response("cached"));
					}
				},
				put: async (key, value) =>
					cacheEntries.set(typeof key === "string" ? key : key.url, value),
				match: async (key) =>
					cacheEntries.get(typeof key === "string" ? key : key.url),
			});
		return caches.get(name);
	},
	keys: async () => [...caches.keys()],
	delete: async (name) => caches.delete(name),
	match: async (key) =>
		cacheEntries.get(typeof key === "string" ? key : key.url),
};
vm.runInNewContext(read("service-worker.js"), {
	self: {
		registration: { scope: "https://example.com/moder-wars/" },
		addEventListener: (name, fn) => handlers.set(name, fn),
		skipWaiting: async () => {},
		clients: { claim: async () => {} },
	},
	caches: storage,
	fetch: async () => new Response("network"),
	URL,
	Response,
	Request,
	console,
});
let pending;
handlers.get("install")({
	waitUntil: (promise) => {
		pending = promise;
	},
});
await pending;
assert.ok(cacheEntries.has("https://example.com/moder-wars/index.html"));
console.log(
	`Build output: ${shell.length} offline assets, ${scripts.length} bundled modules/workers, project-subpath installation passed; no browser/game`,
);

const workerFile = scripts.find((path) =>
	path.startsWith("war-simulation-worker-"),
);
const result = spawnSync(
	process.execPath,
	["scripts/simulation-worker-smoke.mjs"],
	{
		stdio: "inherit",
		timeout: 30000,
		env: {
			...process.env,
			MW_WORKER_URL: new URL(`assets/${workerFile}`, root).href,
		},
	},
);
assert.equal(
	result.status,
	0,
	"production worker transport must behave like its source",
);
