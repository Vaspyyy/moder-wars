let worker = null;
let nextRequestId = 0;
const pending = new Map();

function rejectAll(error) {
	for (const request of pending.values()) request.reject(error);
	pending.clear();
}

function getWorker() {
	if (worker) return worker;
	worker = new Worker(
		new URL("../workers/geo-raster-worker.js", import.meta.url),
		{ type: "module" },
	);
	worker.onmessage = (event) => {
		const { id, type, progress, arrays, error } = event.data || {};
		const request = pending.get(id);
		if (!request) return;
		if (type === "progress") {
			request.onProgress?.(progress);
			return;
		}
		pending.delete(id);
		if (type === "result") request.resolve(arrays);
		else request.reject(new Error(error || "Geography raster worker failed"));
	};
	worker.onerror = (event) => {
		rejectAll(new Error(event.message || "Geography raster worker failed"));
		worker?.terminate();
		worker = null;
	};
	worker.onmessageerror = () => {
		rejectAll(new Error("Geography raster worker returned invalid data"));
		worker?.terminate();
		worker = null;
	};
	return worker;
}

/** Rasterize GeoJSON features off-main-thread; resolves with transferable arrays. */
export function rasterizeGeoFeaturesInWorker(features, options, onProgress) {
	return new Promise((resolve, reject) => {
		const id = ++nextRequestId;
		pending.set(id, { onProgress, reject, resolve });
		try {
			getWorker().postMessage({ features, id, options });
		} catch (error) {
			pending.delete(id);
			reject(error);
		}
	});
}

export function terminateGeoRasterWorker() {
	if (!worker) return;
	rejectAll(new Error("Geography raster worker terminated"));
	worker.terminate();
	worker = null;
}
