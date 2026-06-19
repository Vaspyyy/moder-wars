// ─── IndexedDB GeoJSON Cache ───────────────────────────────────────────────
// On first load, parsed GeoJSON is stored in IndexedDB (keyed by URL).
// Subsequent loads skip the network + JSON.parse entirely.

let _dbPromise = null;
function _cacheOpen() {
	if (!_dbPromise) {
		_dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open("mw-geocache", 1);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains("geojson")) {
					req.result.createObjectStore("geojson", { keyPath: "url" });
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => {
				_dbPromise = null;
				reject(req.error);
			};
		});
	}
	return _dbPromise;
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
			try {
				const delTx = db.transaction("geojson", "readwrite");
				const delReq = delTx.objectStore("geojson").delete(url);
				delTx.onerror = () =>
					console.warn("geoCache: delete tx error", delTx.error);
				delTx.onabort = () => console.warn("geoCache: delete tx aborted");
				delReq.onerror = () =>
					console.warn("geoCache: delete req error", delReq.error);
			} catch (e) {
				console.warn("geoCache: delete failed", e);
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

let _geoParseWorker = null;
function _parseInWorker(buf) {
	if (!_geoParseWorker) {
		_geoParseWorker = new Worker("../workers/geo-parse-worker.js");
		_geoParseWorker.onerror = (e) => console.warn("geo-parse-worker error:", e);
	}
	return new Promise((resolve, reject) => {
		const worker = _geoParseWorker;
		const handler = (evt) => {
			worker.removeEventListener("message", handler);
			if (evt.data?.error) reject(new Error(evt.data.error));
			else resolve(evt.data.data);
		};
		worker.addEventListener("message", handler);
		worker.postMessage(buf, [buf]);
	});
}

export async function fetchJSONWithCache(url) {
	const key = new URL(url, window.location.href).href;
	const cached = await _geoCacheGet(key);
	if (cached) return cached;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const buf = await response.arrayBuffer();
	const data = await _parseInWorker(buf);
	_cachePut(key, data);
	return data;
}

export { _cachePut as _geoCachePut };
// ─── End Cache ─────────────────────────────────────────────────────────────
