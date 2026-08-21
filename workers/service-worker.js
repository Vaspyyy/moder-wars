// Service Worker — versioned offline shell plus persistent runtime data cache

const CACHE_VERSION = "mw-v0.27.21";
const APP_SHELL_PREFIX = "mw-app-shell-";
const RUNTIME_PREFIX = "mw-runtime-";
const LEGACY_CACHE_PREFIX = "mw-cache-";
const APP_SHELL_CACHE = `${APP_SHELL_PREFIX}${CACHE_VERSION}`;
// Change this only when the runtime-cache format or policy becomes incompatible.
// Keeping it stable lets large, previously loaded assets survive patch releases.
const RUNTIME_CACHE = `${RUNTIME_PREFIX}v1`;

const APP_SHELL_PATHS = [
	"index.html",
	"src/bootstrap.js",
	"src/main.js",
	"src/ai-intel.js",
	"src/ai-task-forces.js",
	"src/experiment.js",
	"src/experiment-ui.js",
	"src/formation-strength.js",
	"src/operations.js",
	"src/performance-profiler.js",
	"src/simulation-phase-wheel.js",
	"src/simulation-jobs.js",
	"src/tactical-grid.js",
	"src/territory-ledger.js",
	"src/config.js",
	"src/combined-arms.js",
	"src/air-power.js",
	"src/economy.js",
	"src/mop-up.js",
	"src/editor.js",
	"src/engine.js",
	"src/geo.js",
	"src/geo-raster-assets.js",
	"src/geo-raster-core.js",
	"src/geo-raster.js",
	"src/load-profiler.js",
	"src/renderer.js",
	"src/scenario-codec.js",
	"src/surrender.js",
	"src/constants.js",
	"src/firebase.js",
	"styles/style.css",
	"workers/simulation-worker.js",
	"workers/geo-parse-worker.js",
	"workers/geo-raster-worker.js",
	"workers/scenario-worker.js",
];

// Resolve against the registration scope instead of the origin root. This keeps
// installs working both locally and under a GitHub Pages project subpath.
const scopeUrl = new URL(self.registration.scope);
const scopedUrl = (path) => new URL(path, scopeUrl).href;
const APP_SHELL_URLS = APP_SHELL_PATHS.map(scopedUrl);
const APP_SHELL_URL_SET = new Set(APP_SHELL_URLS);
const OFFLINE_SHELL_URL = scopedUrl("index.html");

function cacheable(response) {
	return response?.ok && response.type !== "opaque";
}

async function fetchAndCache(request, cacheName, cacheKey = request) {
	const response = await fetch(request);
	if (cacheable(response)) {
		const cache = await caches.open(cacheName);
		await cache.put(cacheKey, response.clone());
	}
	return response;
}

async function networkFirstNavigation(request) {
	try {
		// Always recheck HTML so a newly deployed worker/version can be discovered.
		return await fetchAndCache(request, APP_SHELL_CACHE, OFFLINE_SHELL_URL);
	} catch (_error) {
		return (
			(await caches.match(OFFLINE_SHELL_URL)) ||
			new Response("", { status: 504, statusText: "Offline" })
		);
	}
}

async function cacheFirstVersioned(request) {
	const cached = await caches.match(request, { cacheName: APP_SHELL_CACHE });
	if (cached) return cached;

	try {
		return await fetchAndCache(request, APP_SHELL_CACHE);
	} catch (_error) {
		return new Response("", { status: 504, statusText: "Offline" });
	}
}

async function staleWhileRevalidate(event) {
	const { request } = event;
	const cache = await caches.open(RUNTIME_CACHE);
	const cached = await cache.match(request);
	const refresh = fetch(request);
	const update = refresh.then(async (response) => {
		if (cacheable(response)) await cache.put(request, response.clone());
	});
	event.waitUntil(update.catch(() => undefined));

	if (cached) {
		// Serve warm scenarios/geodata immediately, but refresh them in the
		// background so the stable cache cannot remain stale indefinitely.
		return cached;
	}

	try {
		return await refresh;
	} catch (_error) {
		return new Response("", { status: 504, statusText: "Offline" });
	}
}

async function cacheFirstRuntime(request) {
	const cache = await caches.open(RUNTIME_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	try {
		return await fetchAndCache(request, RUNTIME_CACHE);
	} catch (_error) {
		return new Response("", { status: 504, statusText: "Offline" });
	}
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(APP_SHELL_CACHE)
			.then((cache) => cache.addAll(APP_SHELL_URLS))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	const currentCaches = new Set([APP_SHELL_CACHE, RUNTIME_CACHE]);
	const isModernWarsCache = (name) =>
		name.startsWith(APP_SHELL_PREFIX) ||
		name.startsWith(RUNTIME_PREFIX) ||
		name.startsWith(LEGACY_CACHE_PREFIX);

	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter(
							(name) => isModernWarsCache(name) && !currentCaches.has(name),
						)
						.map((name) => caches.delete(name)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET" || request.headers.has("range")) return;

	const url = new URL(request.url);
	if (url.origin !== scopeUrl.origin) return;

	if (request.mode === "navigate") {
		event.respondWith(networkFirstNavigation(request));
		return;
	}

	if (APP_SHELL_URL_SET.has(url.href)) {
		event.respondWith(cacheFirstVersioned(request));
		return;
	}

	// Versioned compiled scenarios are immutable. A cache hit must not trigger a
	// multi-megabyte background re-download on every rematch.
	if (
		/-v\d+\.mwsc\.gz$/.test(url.pathname) ||
		(url.pathname.endsWith(".mwr") && url.searchParams.has("rev"))
	) {
		event.respondWith(cacheFirstRuntime(request));
		return;
	}

	// Scenarios, geodata, images, audio, and other same-origin resources are
	// cached only after use and retained across normal patch releases.
	event.respondWith(staleWhileRevalidate(event));
});
