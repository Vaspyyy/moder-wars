import { normalizeScenarioTheater } from "./scenario-theater.js";

const MAX_GRID_CELLS = 25_920_000;

/** Carry source attribution through edits without inheriting the previous map's credit. */
export function scenarioContextWithHistoricalSource(context, scenario) {
	const source = scenario.historicalSource;
	const hasSource =
		source && typeof source === "object" && !Array.isArray(source);
	const theater = normalizeScenarioTheater(scenario.theater);
	if (!context && !hasSource && !theater && !scenario.useScenarioLand)
		return null;
	const next = { ...context };
	delete next.historicalSource;
	delete next.theater;
	delete next.useScenarioLand;
	if (scenario.useScenarioLand === true) next.useScenarioLand = true;
	if (theater) next.theater = theater;
	if (hasSource) {
		next.historicalSource = structuredClone(source);
		if (!next.name) next.name = scenario.name || "";
	}
	return next;
}

function scenarioGrid(resolution) {
	if (!Number.isFinite(resolution) || resolution < 0.05 || resolution > 180) {
		throw new RangeError(
			"Sovereignty grid resolution must be between 0.05 and 180 degrees",
		);
	}
	const width = Math.ceil(360 / resolution);
	const height = Math.ceil(180 / resolution);
	const length = width * height;
	if (length > MAX_GRID_CELLS) {
		throw new RangeError("Sovereignty grid exceeds the supported cell limit");
	}
	return { width, height, length };
}

/** Restore sovereign ownership independently of military control on land cells. */
export function applyScenarioSovereigntyOverrides(
	overrides,
	{
		sourceGridRes,
		targetGridRes,
		deJureMap,
		landMask,
		countryMetadata,
		sovereigntyBase,
		worldControlMap,
	},
) {
	if (sovereigntyBase != null && sovereigntyBase !== "control") {
		throw new TypeError("Unsupported scenario sovereignty baseline");
	}
	const useControlBaseline = sovereigntyBase === "control";
	if (overrides == null && !useControlBaseline) return 0;
	overrides ??= [];
	if (!Array.isArray(overrides) || overrides.length > 65_535) {
		throw new TypeError("Invalid scenario sovereignty override list");
	}
	if (overrides.length === 0 && !useControlBaseline) return 0;
	const source = scenarioGrid(sourceGridRes);
	const target = scenarioGrid(targetGridRes);
	if (
		!(deJureMap instanceof Uint16Array) ||
		!(landMask instanceof Uint8Array) ||
		deJureMap.length !== target.length ||
		landMask.length !== target.length
	) {
		throw new RangeError("Sovereignty target grid dimensions do not match");
	}
	if (
		useControlBaseline &&
		(!(worldControlMap instanceof Uint16Array) ||
			worldControlMap.length !== target.length)
	) {
		throw new RangeError(
			"Sovereignty control baseline dimensions do not match",
		);
	}
	const knownOwners = new Set(
		countryMetadata.filter(Boolean).map((meta) => meta.id),
	);
	let cellCount = 0;
	// Validate the entire input before modifying live state. The count also bounds
	// duplicate input and prevents a tiny source cell from causing unbounded work.
	for (const override of overrides) {
		if (
			!Number.isInteger(override?.ownerId) ||
			override.ownerId <= 0 ||
			override.ownerId > 65_535 ||
			!knownOwners.has(override.ownerId) ||
			!Array.isArray(override.cells)
		) {
			throw new TypeError("Invalid scenario sovereignty owner or cells");
		}
		cellCount += override.cells.length;
		if (cellCount > source.length) {
			throw new RangeError(
				"Sovereignty overrides exceed the source grid cell limit",
			);
		}
		for (const index of override.cells) {
			if (!Number.isInteger(index) || index < 0 || index >= source.length) {
				throw new RangeError(
					"Sovereignty override contains an invalid cell index",
				);
			}
		}
	}
	let writes = 0;
	if (useControlBaseline) {
		deJureMap.set(worldControlMap);
		writes = deJureMap.length;
	}
	for (const { ownerId, cells } of overrides) {
		for (const index of cells) {
			if (sourceGridRes === targetGridRes) {
				if (landMask[index]) {
					deJureMap[index] = ownerId;
					writes++;
				}
				continue;
			}
			const sourceY = Math.floor(index / source.width);
			const sourceX = index % source.width;
			// Match scenario-codec's covered-cell remap, including boundary rounding.
			const baseLat = sourceY * sourceGridRes - 90;
			const baseLng = sourceX * sourceGridRes - 180;
			const xStart = Math.max(0, Math.floor((baseLng + 180) / targetGridRes));
			const xEnd = Math.min(
				target.width - 1,
				Math.floor((baseLng + sourceGridRes + 180 - 0.0001) / targetGridRes),
			);
			const yStart = Math.max(0, Math.floor((baseLat + 90) / targetGridRes));
			const yEnd = Math.min(
				target.height - 1,
				Math.floor((baseLat + sourceGridRes + 90 - 0.0001) / targetGridRes),
			);
			for (let y = yStart; y <= yEnd; y++) {
				for (let x = xStart; x <= xEnd; x++) {
					const targetIndex = y * target.width + x;
					if (!landMask[targetIndex]) continue;
					deJureMap[targetIndex] = ownerId;
					writes++;
				}
			}
		}
	}
	return writes;
}
