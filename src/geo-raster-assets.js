const ASSET_FORMAT_VERSION = 1;
export const PREDERIVED_EARTH_REVISION = "natural-earth-cell-center-v1";

export const PREDERIVED_EARTH_ASSETS = Object.freeze({
	"110m": Object.freeze({
		0.05: Object.freeze({
			path: "assets/geodata/derived/ne_110m_admin_0_countries_0.05.mwr",
			revision: "5f1b0de60eb742f8",
		}),
		0.1: Object.freeze({
			path: "assets/geodata/derived/ne_110m_admin_0_countries_0.1.mwr",
			revision: "c7a55e47668e558e",
		}),
		0.15: Object.freeze({
			path: "assets/geodata/derived/ne_110m_admin_0_countries_0.15.mwr",
			revision: "83e2e8ae716e788e",
		}),
		0.25: Object.freeze({
			path: "assets/geodata/derived/ne_110m_admin_0_countries_0.25.mwr",
			revision: "83fd0ed99616f5aa",
		}),
	}),
	"50m": Object.freeze({
		0.05: Object.freeze({
			path: "assets/geodata/derived/ne_50m_admin_0_countries_0.05.mwr",
			revision: "4722c011637be6c0",
		}),
		0.1: Object.freeze({
			path: "assets/geodata/derived/ne_50m_admin_0_countries_0.1.mwr",
			revision: "42dde4788359dd32",
		}),
		0.15: Object.freeze({
			path: "assets/geodata/derived/ne_50m_admin_0_countries_0.15.mwr",
			revision: "471148e793acb55e",
		}),
		0.25: Object.freeze({
			path: "assets/geodata/derived/ne_50m_admin_0_countries_0.25.mwr",
			revision: "2f58ef9075cb1fbc",
		}),
	}),
	"10m": Object.freeze({
		0.05: Object.freeze({
			path: "assets/geodata/derived/ne_10m_admin_0_countries_0.05.mwr",
			revision: "91f42bff66bb35a4",
		}),
		0.1: Object.freeze({
			path: "assets/geodata/derived/ne_10m_admin_0_countries_0.1.mwr",
			revision: "3c36c184dc00b206",
		}),
		0.15: Object.freeze({
			path: "assets/geodata/derived/ne_10m_admin_0_countries_0.15.mwr",
			revision: "793c850dec7dbd91",
		}),
		0.25: Object.freeze({
			path: "assets/geodata/derived/ne_10m_admin_0_countries_0.25.mwr",
			revision: "fdfdb29a6a37084f",
		}),
	}),
});

function decodeRaster(buffer, expectedResolution) {
	const view = new DataView(buffer);
	if (view.byteLength < 16)
		throw new Error("Derived raster asset is truncated");
	const magic = String.fromCharCode(
		view.getUint8(0),
		view.getUint8(1),
		view.getUint8(2),
		view.getUint8(3),
	);
	if (magic !== "MWR1") throw new Error("Invalid derived raster asset magic");
	if (view.getUint16(4, true) !== ASSET_FORMAT_VERSION) {
		throw new Error("Unsupported derived raster asset version");
	}
	const gridWidth = view.getUint16(6, true);
	const gridHeight = view.getUint16(8, true);
	const featureCount = view.getUint16(10, true);
	const runCount = view.getUint32(12, true);
	if (view.byteLength !== 16 + runCount * 4) {
		throw new Error("Derived raster asset has an invalid run table");
	}
	const expectedWidth = Math.round(360 / expectedResolution);
	const expectedHeight = Math.round(180 / expectedResolution);
	if (gridWidth !== expectedWidth || gridHeight !== expectedHeight) {
		throw new Error("Derived raster asset dimensions do not match resolution");
	}

	const deJureMap = new Uint16Array(gridWidth * gridHeight);
	let cellOffset = 0;
	let byteOffset = 16;
	for (let i = 0; i < runCount; i++) {
		const length = view.getUint16(byteOffset, true);
		const owner = view.getUint16(byteOffset + 2, true);
		byteOffset += 4;
		if (
			length === 0 ||
			owner > featureCount ||
			cellOffset + length > deJureMap.length
		) {
			throw new Error("Derived raster asset contains an invalid run");
		}
		deJureMap.fill(owner, cellOffset, cellOffset + length);
		cellOffset += length;
	}
	if (cellOffset !== deJureMap.length) {
		throw new Error("Derived raster asset does not cover the complete grid");
	}
	const landMask = new Uint8Array(deJureMap.length);
	for (let i = 0; i < deJureMap.length; i++) landMask[i] = deJureMap[i] ? 1 : 0;
	return { deJureMap, featureCount, gridHeight, gridWidth, landMask };
}

/** Combine selected coastline detail with the canonical scenario country IDs. */
export function combineScenarioEarthRasters(selected, canonical) {
	if (
		!selected?.landMask ||
		!canonical?.deJureMap ||
		selected.landMask.length !== canonical.deJureMap.length
	) {
		throw new Error("Scenario land and canonical de-jure rasters do not match");
	}
	return {
		...selected,
		assetBytes: (selected.assetBytes || 0) + (canonical.assetBytes || 0),
		deJureMap: canonical.deJureMap,
		deJureMapResolution: "110m",
		deJureSourceUrl: canonical.sourceUrl,
	};
}

/** Load a checked, prederived Natural Earth raster for a supported source/grid. */
export async function loadPrederivedEarthRaster(
	gridResolution,
	{ baseUrl, fetchImpl = fetch, mapResolution = "110m" } = {},
) {
	const asset =
		PREDERIVED_EARTH_ASSETS[mapResolution]?.[String(gridResolution)] || null;
	if (!asset) return null;
	const fallbackBase =
		baseUrl ||
		(typeof window !== "undefined"
			? window.location.href
			: "http://localhost/");
	const source = new URL(asset.path, fallbackBase);
	// The content digest keeps the persistent service-worker cache safe across
	// releases even though the human-readable filename remains stable.
	source.searchParams.set("rev", asset.revision);
	const sourceUrl = source.href;
	const response = await fetchImpl(sourceUrl);
	if (!response.ok) throw new Error(`Derived raster HTTP ${response.status}`);
	const buffer = await response.arrayBuffer();
	return {
		...decodeRaster(buffer, gridResolution),
		assetBytes: buffer.byteLength,
		gridResolution,
		mapResolution,
		revision: `${PREDERIVED_EARTH_REVISION}-${asset.revision}`,
		sourceUrl,
	};
}
