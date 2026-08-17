import { rasterizeGeoFeatures } from "../src/geo-raster-core.js";

self.onmessage = async (event) => {
	const { id, features, options } = event.data || {};
	try {
		const arrays = await rasterizeGeoFeatures(features, options, (progress) => {
			self.postMessage({ id, progress, type: "progress" });
		});
		const transfer = Object.values(arrays).map((value) => value.buffer);
		self.postMessage({ id, arrays, type: "result" }, transfer);
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error),
			id,
			type: "error",
		});
	}
};
