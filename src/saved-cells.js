/** Compact, ordered saved territory. Runs keep historical masks out of JSON metadata. */
export function hasSavedCells(meta) {
	if (Array.isArray(meta?.savedCells)) return meta.savedCells.length > 0;
	return Boolean(meta?.savedCellRuns?.length);
}

/** Visit legacy pairs or compact linear runs without allocating coordinate pairs. */
export function visitSavedCells(meta, visitor) {
	if (Array.isArray(meta?.savedCells)) {
		for (const [x, y] of meta.savedCells) visitor(x, y);
		return;
	}
	const width = meta?.savedCellWidth;
	if (!Number.isInteger(width) || width <= 0) return;
	const runs = meta.savedCellRuns || [];
	for (let i = 0; i < runs.length; i += 2) {
		const start = runs[i];
		const length = runs[i + 1];
		for (let j = 0; j < length; j++) {
			const index = start + j;
			visitor(index % width, Math.floor(index / width));
		}
	}
}

/** Materialize the legacy export format only when an export is requested. */
export function expandSavedCells(meta) {
	if (Array.isArray(meta?.savedCells) && !meta.savedCells.length) return [];
	if (!hasSavedCells(meta)) return null;
	const cells = [];
	visitSavedCells(meta, (x, y) => cells.push([x, y]));
	return cells;
}

export function appendSavedCellRun(runs, index) {
	const last = runs.length - 2;
	if (last >= 0 && runs[last] + runs[last + 1] === index) runs[last + 1]++;
	else runs.push(index, 1);
}

/** Preserve pair ordering and duplicates; coordinate order can affect exported masks. */
export function packSavedCells(meta, width) {
	if (!hasSavedCells(meta))
		return {
			savedCells: null,
			savedCellRuns: undefined,
			savedCellWidth: undefined,
		};
	if (!meta.savedCells?.length && meta.savedCellWidth === width) {
		return {
			savedCells: null,
			savedCellRuns: Array.from(meta.savedCellRuns),
			savedCellWidth: width,
		};
	}
	const runs = [];
	visitSavedCells(meta, (x, y) => {
		if (
			!Number.isInteger(x) ||
			!Number.isInteger(y) ||
			x < 0 ||
			x >= width ||
			y < 0
		) {
			throw new TypeError(
				"Saved territory must contain valid non-negative grid coordinates",
			);
		}
		appendSavedCellRun(runs, y * width + x);
	});
	return { savedCells: null, savedCellRuns: runs, savedCellWidth: width };
}

/** Match the historical center-sample remap and first-seen deduplication. */
export function normalizeSavedCells(
	meta,
	sourceRes,
	targetRes,
	targetWidth,
	getGridIndex,
) {
	if (!hasSavedCells(meta))
		return {
			savedCells: null,
			savedCellRuns: undefined,
			savedCellWidth: undefined,
		};
	if (sourceRes === targetRes) return packSavedCells(meta, targetWidth);
	const seen = new Set();
	const runs = [];
	visitSavedCells(meta, (x, y) => {
		const index = getGridIndex(
			y * sourceRes - 90 + sourceRes / 2,
			x * sourceRes - 180 + sourceRes / 2,
		);
		if (index < 0 || seen.has(index)) return;
		seen.add(index);
		appendSavedCellRun(runs, index);
	});
	return runs.length
		? { savedCells: null, savedCellRuns: runs, savedCellWidth: targetWidth }
		: { savedCells: null };
}
