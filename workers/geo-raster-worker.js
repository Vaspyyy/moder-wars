import { rasterizeGeoFeatures } from "../src/geo-raster-core.js";
import { resolveWorkerAssetUrl } from "../src/worker-asset-url.js";

self.onmessage = async (event) => {
	const {
		id,
		features: providedFeatures,
		sourceUrl,
		options,
	} = event.data || {};
	try {
		let features = providedFeatures;
		if (sourceUrl) {
			const url = resolveWorkerAssetUrl(sourceUrl, self.location.href);
			const response = await fetch(url, {
				credentials: "omit",
				redirect: "error",
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			features = (await response.json()).features;
		}
		const arrays = await rasterizeGeoFeatures(features, options, (progress) => {
			self.postMessage({ id, progress, type: "progress" });
		});
		const transfer = Object.values(arrays).map((value) => value.buffer);
		self.postMessage(
			{ id, arrays, featureCount: features.length, type: "result" },
			transfer,
		);
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error),
			id,
			type: "error",
		});
	}
};
