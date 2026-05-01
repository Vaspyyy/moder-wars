// Service Worker — cache-first for same-origin static assets

const CACHE_NAME = "mw-v1";

const PRECACHE_URLS = [
	"/",
	"/index.html",
	"/src/main.js",
	"/styles/style.css",
	"/workers/simulation-worker.js",
	"/assets/images/2022.webp",
	"/1974.webp",
	"/1942.webp",
	"/1936.webp",
	"/1914.webp",
	"/1804.webp",
	"/1492.webp",
	"/modern-war-129016.mp3",
	"/explosion-pas-61639.mp3",
	"/low-button-click-331780.mp3",
	"/war.wav",
	"/peace.wav",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((names) =>
			Promise.all(
				names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
			),
		),
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin === location.origin) {
		event.respondWith(
			caches.match(event.request).then((cached) => cached || fetch(event.request)),
		);
	}
});
