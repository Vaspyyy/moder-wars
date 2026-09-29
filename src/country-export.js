/** Collect all requested country cells in a single grid pass. */
export function collectCountryCells(controlMap, gridWidth, ids) {
	const result = new Map(Array.from(ids, (id) => [id, []]));
	for (let i = 0; i < controlMap.length; i++) {
		const cells = result.get(controlMap[i]);
		if (cells) cells.push([i % gridWidth, Math.floor(i / gridWidth)]);
	}
	return result;
}

export function createCountryExport(meta, cells, gridRes) {
	return {
		name: `${meta.name}_country`,
		metadata: {
			id: meta.id,
			name: meta.name,
			color: meta.color,
			flagUrl: meta.flagUrl,
			isCustom: meta.isCustom,
			role: meta.role || "OFFENSE",
			overlordId: meta.overlordId || null,
		},
		cells,
		gridRes,
		version: "1.0",
	};
}

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export async function downloadCountriesZip(
	countries,
	cellsById,
	gridRes,
	getZip,
	filename,
) {
	const JSZip = await getZip();
	const zip = new JSZip();
	for (const meta of countries) {
		const cells = cellsById.get(meta.id) || [];
		meta.savedCells = cells;
		const safeName = (meta.name || `country_${meta.id}`).replace(
			/[^\w-]+/g,
			"_",
		);
		zip.file(
			`${safeName}.json`,
			JSON.stringify(createCountryExport(meta, cells, gridRes), null, 2),
		);
	}
	downloadBlob(await zip.generateAsync({ type: "blob" }), filename);
}
