// Service Worker — cache-first for same-origin static assets

const CACHE_VERSION = "mw-v0.27.1";
const CACHE_NAME = `mw-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
	"/",
	"/index.html",
	"/src/bootstrap.js",
	"/src/main.js",
	"/src/operations.js",
	"/src/config.js",
	"/src/combined-arms.js",
	"/src/air-power.js",
	"/src/economy.js",
	"/src/mop-up.js",
	"/src/editor.js",
	"/src/engine.js",
	"/src/geo.js",
	"/src/renderer.js",
	"/src/surrender.js",
	"/src/constants.js",
	"/src/firebase.js",
	"/styles/style.css",
	"/workers/simulation-worker.js",
	"/workers/geo-parse-worker.js",
	// Geodata - core files used on most loads
	"/assets/geodata/110m/cultural/ne_110m_admin_0_countries.json",
	"/assets/geodata/50m/cultural/ne_50m_admin_0_countries.json",
	"/assets/geodata/110m/physical/ne_110m_geography_regions_polys.json",
	"/assets/geodata/50m/physical/ne_50m_geography_regions_polys.json",
	"/assets/geodata/50m/cultural/ne_50m_populated_places_simple.json",
	"/assets/geodata/flagcodes.json",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) =>
				Promise.allSettled(
					PRECACHE_URLS.map((url) =>
						cache
							.add(url)
							.catch((err) => console.warn("Precache failed:", url, err)),
					),
				),
			)
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

// Cache-first for all same-origin requests (covers geodata, JS, CSS, assets)
self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;
	const url = new URL(req.url);
	if (url.origin === location.origin) {
		event.respondWith(
			caches
				.match(req)
				.then((cached) => {
					if (cached) return cached;
					return fetch(req).then((response) => {
						if (response.ok) {
							const clone = response.clone();
							caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
						}
						return response;
					});
				})
				.catch(() => {
					if (req.mode === "navigate") return caches.match("/index.html");
					return new Response("", { status: 504, statusText: "Offline" });
				}),
		);
	}
});
