import {
	buildDirectionField,
	buildLayout,
	createHostilityChecker,
} from "../src/frontline-core.js";

self.onmessage = (event) => {
	const started = performance.now();
	const {
		requestId = 0,
		generation = 0,
		territoryGeneration = 0,
		includeField = true,
		includeLayout = false,
	} = event.data || {};
	try {
		const {
			landMask: landMaskBuffer,
			dominantSideMap: dominantSideMapBuffer,
			hostilityMatrix,
			maxSides = 8,
			gridWidth,
			gridHeight,
			gridRes,
			units,
			sideCount,
		} = event.data;
		if (
			!landMaskBuffer ||
			!dominantSideMapBuffer ||
			!gridWidth ||
			!gridHeight
		) {
			throw new Error("Invalid input");
		}
		const landMask = new Uint8Array(landMaskBuffer);
		const dominantSideMap = new Int8Array(dominantSideMapBuffer);
		const relations = hostilityMatrix ? new Uint8Array(hostilityMatrix) : null;
		const hostile = createHostilityChecker(relations, maxSides);
		const input = {
			landMask,
			dominantSideMap,
			hostile,
			gridWidth,
			gridHeight,
			gridRes,
			units,
			sideCount,
			maxSides,
		};
		const response = {
			requestId,
			generation,
			territoryGeneration,
			includeField,
			includeLayout,
		};
		const transfers = [];
		if (includeField) {
			const field = buildDirectionField(input);
			response.fieldDurationMs = field.durationMs;
			response.frontlineDirLat = field.frontlineDirLat.buffer;
			response.frontlineDirLng = field.frontlineDirLng.buffer;
			transfers.push(
				field.frontlineDirLat.buffer,
				field.frontlineDirLng.buffer,
			);
		}
		if (includeLayout) {
			const layout = buildLayout(input);
			response.layoutDurationMs = layout.durationMs;
			response.polylines = layout.polylines;
			response.slotAssignments = layout.slotAssignments;
		}
		response.durationMs = performance.now() - started;
		self.postMessage(response, transfers);
	} catch (error) {
		self.postMessage({
			requestId,
			generation,
			territoryGeneration,
			includeField,
			includeLayout,
			durationMs: performance.now() - started,
			error: error.message,
		});
	}
};
