// ─── IndexedDB GeoJSON Cache ───────────────────────────────────────────────
// On first load, parsed GeoJSON is stored in IndexedDB (keyed by URL).
// Subsequent loads skip the network + JSON.parse entirely.

// On first load, parsed GeoJSON is stored in IndexedDB (keyed by URL).
// Subsequent loads skip the network + JSON.parse entirely — removes the
// 20-31MB main-thread stall on revisits.

async function _cacheOpen() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("mw-geocache", 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains("geojson")) {
				req.result.createObjectStore("geojson", { keyPath: "url" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function _geoCacheGet(url) {
	const db = await _cacheOpen();
	return new Promise((resolve, _reject) => {
		const tx = db.transaction("geojson", "readonly");
		const req = tx.objectStore("geojson").get(url);
		req.onsuccess = () => {
			const entry = req.result;
			if (entry?.data) {
				const age = Date.now() - (entry.timestamp || 0);
				if (age < 7 * 24 * 60 * 60 * 1000) {
					resolve(entry.data);
					return;
				}
			}
			resolve(null);
		};
		req.onerror = () => resolve(null);
	});
}

async function _cachePut(url, data) {
	const db = await _cacheOpen();
	return new Promise((resolve) => {
		const tx = db.transaction("geojson", "readwrite");
		tx.objectStore("geojson").put({ url, data, timestamp: Date.now() });
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
	});
}

async function fetchJSONWithCache(url) {
	// Normalize relative URLs to absolute so cache keys are stable across redirects / origins
	const key = new URL(url, window.location.href).href;
	const cached = await _geoCacheGet(key);
	if (cached) return cached;
	// Offload fetch + JSON.parse to Web Worker (keeps main thread responsive during 2-5s parse)
	let data;
	if (_geoParseWorker || typeof Worker !== "undefined") {
		data = await _fetchW(url);
		if (!data) throw new Error("Worker parse failed");
	} else {
		const response = await fetch(url);
		data = await response.json();
	}
	_cachePut(key, data);
	return data;
}


// ─── End Cache ─────────────────────────────────────────────────────────────

// GeoJSON parse worker — offloads 20-31MB JSON.parse from main thread
let _geoParseWorker = null;
let _geoParseReqId = 0;
const _geoParsePending = new Map();

function _getPw() {
	if (!_geoParseWorker) {
		_geoParseWorker = new Worker("geo-parse-worker.js");
		_geoParseWorker.onmessage = function (evt) {
			const { id, ok, data } = evt.data;
			const resolve = _geoParsePending.get(id);
			_geoParsePending.delete(id);
			if (resolve) resolve(ok ? data : null);
		};
	}
	return _geoParseWorker;
}

function _fetchW(url) {
	return new Promise((resolve) => {
		const id = ++_geoParseReqId;
		_geoParsePending.set(id, resolve);
		_getPw().postMessage({ url, id });
	});
}
