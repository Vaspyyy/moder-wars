import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rasterizeGeoFeatures } from "../src/geo-raster-core.js";
import {
	combineScenarioEarthRasters,
	loadPrederivedEarthRaster,
} from "../src/geo-raster-assets.js";
import { createDerivedRasterDescriptor } from "../src/geo.js";

const polygon = (coordinates) => ({
	geometry: { coordinates, type: "Polygon" },
	properties: {},
	type: "Feature",
});

const features = [
	polygon([
		[
			[-2, -2],
			[2, -2],
			[2, 2],
			[-2, 2],
			[-2, -2],
		],
		[
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1],
			[-1, -1],
		],
	]),
	polygon([
		[
			[0, -2],
			[3, -2],
			[3, 2],
			[0, 2],
			[0, -2],
		],
	]),
];

const progress = [];
const arrays = await rasterizeGeoFeatures(
	features,
	{ gridHeight: 180, gridResolution: 1, gridWidth: 360, yieldEvery: 0 },
	(value) => progress.push(value.completed),
);
const index = (lng, lat) => (lat + 90) * 360 + (lng + 180);

assert.equal(arrays.ownerMap[index(-2, 0)], 1, "first polygon owns its cell");
assert.equal(arrays.ownerMap[index(-1, 0)], 0, "polygon hole remains empty");
assert.equal(arrays.ownerMap[index(1, 0)], 2, "later overlapping feature wins");
assert.equal(arrays.landMask[index(1, 0)], 1);
assert.deepEqual(progress, [1, 2]);
assert.deepEqual(
	[...arrays.featureBounds],
	[178, 181, 88, 91, 180, 182, 88, 91],
);

const descriptor = createDerivedRasterDescriptor({
	baseUrl: "https://example.test/game/",
	blank: true,
	gridHeight: 180,
	gridResolution: 1,
	gridWidth: 360,
	sourceRevision: "etag-a",
	sourceUrl: "./countries.json#ignored",
});
assert.equal(descriptor.sourceUrl, "https://example.test/game/countries.json");
assert.notEqual(
	descriptor.key,
	createDerivedRasterDescriptor({
		...descriptor,
		sourceRevision: "etag-b",
	}).key,
	"source revision explicitly invalidates the cache key",
);

const assetBytes = await readFile(
	new URL(
		"../assets/geodata/derived/ne_110m_admin_0_countries_0.25.mwr",
		import.meta.url,
	),
);
const asset = await loadPrederivedEarthRaster(0.25, {
	baseUrl: "https://example.test/",
	fetchImpl: async () => ({
		arrayBuffer: async () =>
			assetBytes.buffer.slice(
				assetBytes.byteOffset,
				assetBytes.byteOffset + assetBytes.byteLength,
			),
		ok: true,
	}),
});
assert.equal(asset.gridWidth, 1440);
assert.equal(asset.gridHeight, 720);
assert.equal(asset.deJureMap.length, asset.landMask.length);
for (let i = 0; i < asset.landMask.length; i += 7919) {
	assert.equal(asset.landMask[i], asset.deJureMap[i] === 0 ? 0 : 1);
}

const source = JSON.parse(
	await readFile(
		new URL(
			"../assets/geodata/110m/cultural/ne_110m_admin_0_countries.json",
			import.meta.url,
		),
		"utf8",
	),
);
const rebuilt = await rasterizeGeoFeatures(source.features, {
	gridHeight: 720,
	gridResolution: 0.25,
	gridWidth: 1440,
	yieldEvery: 0,
});
assert.equal(rebuilt.ownerMap.length, asset.deJureMap.length);
for (let i = 0; i < rebuilt.ownerMap.length; i++) {
	assert.equal(asset.deJureMap[i], rebuilt.ownerMap[i]);
}

function decodeMwr(bytes, expectedResolution) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	assert.equal(bytes.subarray(0, 4).toString("ascii"), "MWR1");
	assert.equal(view.getUint16(4, true), 1);
	const gridWidth = view.getUint16(6, true);
	const gridHeight = view.getUint16(8, true);
	const featureCount = view.getUint16(10, true);
	const runCount = view.getUint32(12, true);
	assert.equal(gridWidth, Math.round(360 / expectedResolution));
	assert.equal(gridHeight, Math.round(180 / expectedResolution));
	assert.equal(bytes.byteLength, 16 + runCount * 4);
	const ownerMap = new Uint16Array(gridWidth * gridHeight);
	let cellOffset = 0;
	for (let i = 0; i < runCount; i++) {
		const byteOffset = 16 + i * 4;
		const length = view.getUint16(byteOffset, true);
		const owner = view.getUint16(byteOffset + 2, true);
		assert.ok(length > 0);
		assert.ok(owner <= featureCount);
		assert.ok(cellOffset + length <= ownerMap.length);
		ownerMap.fill(owner, cellOffset, cellOffset + length);
		cellOffset += length;
	}
	assert.equal(cellOffset, ownerMap.length);
	return { featureCount, gridHeight, gridWidth, ownerMap };
}

const sourceResolutions = ["110m", "50m", "10m"];
const gridResolutions = [0.05, 0.1, 0.15, 0.25];
const decodedAssets = new Map();
for (const sourceResolution of sourceResolutions) {
	for (const gridResolution of gridResolutions) {
		const filename = `ne_${sourceResolution}_admin_0_countries_${gridResolution}.mwr`;
		const bytes = await readFile(
			new URL(`../assets/geodata/derived/${filename}`, import.meta.url),
		);
		decodedAssets.set(
			`${sourceResolution}/${gridResolution}`,
			decodeMwr(bytes, gridResolution),
		);
	}
}

// The runtime manifest must route every source resolution to its exact asset.
for (const sourceResolution of sourceResolutions) {
	const filename = `ne_${sourceResolution}_admin_0_countries_0.25.mwr`;
	const bytes = await readFile(
		new URL(`../assets/geodata/derived/${filename}`, import.meta.url),
	);
	let requestedUrl = null;
	const loaded = await loadPrederivedEarthRaster(0.25, {
		baseUrl: "https://example.test/",
		mapResolution: sourceResolution,
		fetchImpl: async (url) => {
			requestedUrl = String(url);
			return {
				arrayBuffer: async () =>
					bytes.buffer.slice(
						bytes.byteOffset,
						bytes.byteOffset + bytes.byteLength,
					),
				ok: true,
			};
		},
	});
	assert.ok(requestedUrl.includes(filename));
	assert.equal(loaded.mapResolution, sourceResolution);
	assert.deepEqual(
		loaded.deJureMap,
		decodedAssets.get(`${sourceResolution}/0.25`).ownerMap,
	);
}

const canonicalOwners = decodedAssets.get("110m/0.25").ownerMap;
const detailedOwners = decodedAssets.get("50m/0.25").ownerMap;
const differingOwnerIndex = detailedOwners.findIndex(
	(owner, index) => owner > 0 && canonicalOwners[index] > 0 && owner !== canonicalOwners[index],
);
assert.ok(
	differingOwnerIndex >= 0,
	"test data must contain different 110m/50m feature ordering",
);
const combinedScenarioRaster = combineScenarioEarthRasters(
	{
		assetBytes: 20,
		deJureMap: detailedOwners,
		landMask: new Uint8Array(detailedOwners.length).fill(1),
		mapResolution: "50m",
	},
	{
		assetBytes: 10,
		deJureMap: canonicalOwners,
		sourceUrl: "canonical-110m.mwr",
	},
);
assert.equal(
	combinedScenarioRaster.deJureMap[differingOwnerIndex],
	canonicalOwners[differingOwnerIndex],
);
assert.notEqual(
	combinedScenarioRaster.deJureMap[differingOwnerIndex],
	detailedOwners[differingOwnerIndex],
);
assert.equal(combinedScenarioRaster.mapResolution, "50m");
assert.equal(combinedScenarioRaster.deJureMapResolution, "110m");
assert.equal(combinedScenarioRaster.assetBytes, 30);

// Full cell-for-cell parity at a representative grid for every source dataset.
for (const sourceResolution of sourceResolutions) {
	const sourceData = JSON.parse(
		await readFile(
			new URL(
				`../assets/geodata/${sourceResolution}/cultural/ne_${sourceResolution}_admin_0_countries.json`,
				import.meta.url,
			),
			"utf8",
		),
	);
	const expected = await rasterizeGeoFeatures(sourceData.features, {
		gridHeight: 720,
		gridResolution: 0.25,
		gridWidth: 1440,
		yieldEvery: 0,
	});
	const decoded = decodedAssets.get(`${sourceResolution}/0.25`);
	assert.equal(decoded.featureCount, sourceData.features.length);
	assert.equal(decoded.ownerMap.length, expected.ownerMap.length);
	for (let i = 0; i < expected.ownerMap.length; i++) {
		assert.equal(decoded.ownerMap[i], expected.ownerMap[i]);
	}
}

console.log("geo-raster smoke: ok");
