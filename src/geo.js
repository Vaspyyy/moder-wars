// ─── IndexedDB GeoJSON Cache ───────────────────────────────────────────────
import { GEO_RASTER_ALGORITHM_VERSION } from "./geo-raster-core.js";

export { GEO_RASTER_ALGORITHM_VERSION };

// On first load, parsed GeoJSON is stored in IndexedDB (keyed by URL).
// Subsequent loads skip the network + JSON.parse entirely.

let _dbPromise = null;
const GEO_CACHE_DB_VERSION = 2;
const DERIVED_RASTER_STORE = "derivedRasters";
export const PARSED_GEO_CACHE_REVISION = "natural-earth-assets-v1";

function _versionedGeoKey(url) {
	const value = String(url);
	return value.endsWith(`::${PARSED_GEO_CACHE_REVISION}`)
		? value
		: `${value}::${PARSED_GEO_CACHE_REVISION}`;
}

function _cacheOpen() {
	if (!_dbPromise) {
		_dbPromise = new Promise((resolve, reject) => {
			if (typeof indexedDB === "undefined") {
				reject(new Error("IndexedDB is unavailable"));
				return;
			}
			const req = indexedDB.open("mw-geocache", GEO_CACHE_DB_VERSION);
			let blocked = false;
			req.onupgradeneeded = () => {
				let geoStore;
				if (!req.result.objectStoreNames.contains("geojson")) {
					geoStore = req.result.createObjectStore("geojson", {
						keyPath: "url",
					});
				} else {
					geoStore = req.transaction.objectStore("geojson");
				}
				// v1 keys had no asset revision and could silently survive a deploy.
				geoStore.clear();
				if (!req.result.objectStoreNames.contains(DERIVED_RASTER_STORE)) {
					req.result.createObjectStore(DERIVED_RASTER_STORE, {
						keyPath: "key",
					});
				}
			};
			req.onsuccess = () => {
				const db = req.result;
				if (blocked) {
					db.close();
					return;
				}
				db.onversionchange = () => {
					db.close();
					_dbPromise = null;
				};
				resolve(db);
			};
			req.onblocked = () => {
				// An older open tab can hold the v1 database indefinitely. Cache access
				// must never be allowed to block the actual geography download.
				blocked = true;
				_dbPromise = null;
				reject(new Error("IndexedDB upgrade is blocked by another tab"));
			};
			req.onerror = () => {
				_dbPromise = null;
				reject(req.error);
			};
		});
	}
	return _dbPromise;
}

export async function _geoCacheGet(url) {
	let db;
	try {
		db = await _cacheOpen();
	} catch (error) {
		console.warn("geoCache: read unavailable, using network", error);
		return null;
	}
	const key = _versionedGeoKey(url);
	try {
		return await new Promise((resolve) => {
			const tx = db.transaction("geojson", "readonly");
			const req = tx.objectStore("geojson").get(key);
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
					const delReq = delTx.objectStore("geojson").delete(key);
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
	} catch (error) {
		console.warn("geoCache: read failed, using network", error);
		return null;
	}
}

async function _cachePut(url, data) {
	let db;
	try {
		db = await _cacheOpen();
	} catch (error) {
		console.warn("geoCache: write unavailable", error);
		return null;
	}
	const key = _versionedGeoKey(url);
	return new Promise((resolve) => {
		const tx = db.transaction("geojson", "readwrite");
		tx.objectStore("geojson").put({ url: key, data, timestamp: Date.now() });
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
	});
}

let _geoParseWorker = null;
let _geoParseRequestId = 0;
const _pendingGeoParses = new Map();

function _rejectPendingGeoParses(error) {
	for (const { reject } of _pendingGeoParses.values()) reject(error);
	_pendingGeoParses.clear();
}

function _getGeoParseWorker() {
	if (_geoParseWorker) return _geoParseWorker;

	const worker = new Worker(
		new URL("../workers/geo-parse-worker.js", import.meta.url),
	);
	worker.onmessage = (evt) => {
		const { id, data, error } = evt.data || {};
		const pending = _pendingGeoParses.get(id);
		if (!pending) return;

		_pendingGeoParses.delete(id);
		if (error) pending.reject(new Error(error));
		else pending.resolve(data);
	};
	worker.onerror = (evt) => {
		console.warn("geo-parse-worker error:", evt);
		_rejectPendingGeoParses(
			new Error(evt.message || "GeoJSON parser worker failed"),
		);
		worker.terminate();
		if (_geoParseWorker === worker) _geoParseWorker = null;
	};
	worker.onmessageerror = () => {
		_rejectPendingGeoParses(new Error("GeoJSON parser returned invalid data"));
		worker.terminate();
		if (_geoParseWorker === worker) _geoParseWorker = null;
	};
	_geoParseWorker = worker;
	return worker;
}

function _parseInWorker(buf) {
	return new Promise((resolve, reject) => {
		const worker = _getGeoParseWorker();
		const id = ++_geoParseRequestId;
		_pendingGeoParses.set(id, { resolve, reject });
		try {
			worker.postMessage({ id, buf }, [buf]);
		} catch (error) {
			_pendingGeoParses.delete(id);
			reject(error);
		}
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
	_cachePut(key, data).catch((error) =>
		console.warn("geoCache: deferred write failed", error),
	);
	return data;
}

export { _cachePut as _geoCachePut };

function _normalizeSourceUrl(sourceUrl, baseUrl) {
	if (typeof sourceUrl !== "string" || !sourceUrl.trim()) {
		throw new TypeError("sourceUrl must be a non-empty string");
	}
	const fallbackBase =
		baseUrl ||
		(typeof window !== "undefined"
			? window.location.href
			: "http://localhost/");
	const normalized = new URL(sourceUrl, fallbackBase);
	normalized.hash = "";
	return normalized.href;
}

function _positiveFinite(value, name, integer = false) {
	if (
		!Number.isFinite(value) ||
		value <= 0 ||
		(integer && !Number.isInteger(value))
	) {
		throw new TypeError(
			`${name} must be a positive ${integer ? "integer" : "number"}`,
		);
	}
	return value;
}

/** Build the complete stable identity for one derived geography raster. */
export function createDerivedRasterDescriptor(options) {
	const sourceUrl = _normalizeSourceUrl(options?.sourceUrl, options?.baseUrl);
	const sourceRevision = String(options?.sourceRevision ?? "");
	const gridResolution = _positiveFinite(
		options?.gridResolution,
		"gridResolution",
	);
	const gridWidth = _positiveFinite(options?.gridWidth, "gridWidth", true);
	const gridHeight = _positiveFinite(options?.gridHeight, "gridHeight", true);
	const blank = Boolean(options?.blank);
	const algorithmVersion = String(
		options?.algorithmVersion || GEO_RASTER_ALGORITHM_VERSION,
	);
	if (!algorithmVersion) {
		throw new TypeError("algorithmVersion must be a non-empty string");
	}

	const identity = {
		algorithmVersion,
		blank,
		gridHeight,
		gridResolution,
		gridWidth,
		sourceRevision,
		sourceUrl,
	};
	return { ...identity, key: JSON.stringify(identity) };
}

function _isTypedArray(value) {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function _cloneRasterArrays(arrays) {
	if (!arrays || typeof arrays !== "object" || Array.isArray(arrays)) {
		throw new TypeError("raster arrays must be an object of typed arrays");
	}
	const result = {};
	for (const [name, value] of Object.entries(arrays)) {
		if (!_isTypedArray(value)) {
			throw new TypeError(`raster array ${name} must be a typed array`);
		}
		result[name] = value.slice();
	}
	if (Object.keys(result).length === 0) {
		throw new TypeError("at least one raster typed array is required");
	}
	return result;
}

function _derivedEntryMatches(entry, descriptor) {
	if (!entry || entry.key !== descriptor.key || !entry.arrays) return false;
	for (const field of [
		"sourceUrl",
		"sourceRevision",
		"gridResolution",
		"gridWidth",
		"gridHeight",
		"blank",
		"algorithmVersion",
	]) {
		if (entry[field] !== descriptor[field]) return false;
	}
	return Object.values(entry.arrays).every(_isTypedArray);
}

/** Return isolated typed-array copies, safe to transfer to another worker. */
export async function getDerivedRaster(options) {
	const descriptor = createDerivedRasterDescriptor(options);
	try {
		const db = await _cacheOpen();
		return await new Promise((resolve) => {
			const tx = db.transaction(DERIVED_RASTER_STORE, "readonly");
			const req = tx.objectStore(DERIVED_RASTER_STORE).get(descriptor.key);
			req.onsuccess = () => {
				const entry = req.result;
				if (!_derivedEntryMatches(entry, descriptor)) {
					resolve(null);
					return;
				}
				try {
					resolve({
						arrays: _cloneRasterArrays(entry.arrays),
						createdAt: entry.createdAt,
						descriptor,
					});
				} catch (_error) {
					resolve(null);
				}
			};
			req.onerror = () => resolve(null);
		});
	} catch (error) {
		console.warn("derivedRasterCache: read failed", error);
		return null;
	}
}

/** Store cloned typed arrays so later caller mutation or transfer is harmless. */
export async function putDerivedRaster(options, arrays) {
	const descriptor = createDerivedRasterDescriptor(options);
	const safeArrays = _cloneRasterArrays(arrays);
	try {
		const db = await _cacheOpen();
		return await new Promise((resolve) => {
			const tx = db.transaction(DERIVED_RASTER_STORE, "readwrite");
			tx.objectStore(DERIVED_RASTER_STORE).put({
				...descriptor,
				arrays: safeArrays,
				createdAt: Date.now(),
			});
			tx.oncomplete = () => resolve(descriptor);
			tx.onerror = () => resolve(null);
			tx.onabort = () => resolve(null);
		});
	} catch (error) {
		console.warn("derivedRasterCache: write failed", error);
		return null;
	}
}

/** Explicitly invalidate one exact derived-raster identity. */
export async function deleteDerivedRaster(options) {
	const descriptor = createDerivedRasterDescriptor(options);
	try {
		const db = await _cacheOpen();
		return await new Promise((resolve) => {
			const tx = db.transaction(DERIVED_RASTER_STORE, "readwrite");
			tx.objectStore(DERIVED_RASTER_STORE).delete(descriptor.key);
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => resolve(false);
			tx.onabort = () => resolve(false);
		});
	} catch (error) {
		console.warn("derivedRasterCache: delete failed", error);
		return false;
	}
}

/** Explicitly invalidate all derived rasters without touching parsed GeoJSON. */
export async function clearDerivedRasters() {
	try {
		const db = await _cacheOpen();
		return await new Promise((resolve) => {
			const tx = db.transaction(DERIVED_RASTER_STORE, "readwrite");
			tx.objectStore(DERIVED_RASTER_STORE).clear();
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => resolve(false);
			tx.onabort = () => resolve(false);
		});
	} catch (error) {
		console.warn("derivedRasterCache: clear failed", error);
		return false;
	}
}
// ─── End Cache ─────────────────────────────────────────────────────────────
