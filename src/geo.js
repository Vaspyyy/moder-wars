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
				delTx.objectStore("geojson").delete(url);
			} catch (_e) {}
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

export async function fetchJSONWithCache(url) {
	const key = new URL(url, window.location.href).href;
	const cached = await _geoCacheGet(key);
	if (cached) return cached;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const data = await response.json();
	_cachePut(key, data);
	return data;
}

export { _cachePut as _geoCachePut };
// ─── End Cache ─────────────────────────────────────────────────────────────
