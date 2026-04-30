// Web Worker: rebuildFrontlineField BFS
// Receives grid snapshots, runs BFS, posts back direction arrays.
// Runs off main thread to avoid jank during the 15-tick rebuild cycle.

self.onmessage = (evt) => {
	const { landMask, dominantSideMap, gridWidth, gridHeight, gridRes } =
		evt.data;
	const total = gridWidth * gridHeight;

	const frontlineDirLat = new Float32Array(total);
	const frontlineDirLng = new Float32Array(total);
	const sourceCell = new Int32Array(total);
	sourceCell.fill(-1);

	const queue = new Int32Array(total);
	let qHead = 0;
	let qTail = 0;

	// Seed: cells where two different sides are adjacent (frontline)
	for (let i = 0; i < total; i++) {
		if (landMask[i] !== 2) continue;
		const mySide = dominantSideMap[i];
		if (mySide < 0) continue;
		let isFront = false;
		if (i % gridWidth < gridWidth - 1) {
			const ns = dominantSideMap[i + 1];
			if (ns >= 0 && ns !== mySide) isFront = true;
		}
		if (!isFront && i % gridWidth > 0) {
			const ns = dominantSideMap[i - 1];
			if (ns >= 0 && ns !== mySide) isFront = true;
		}
		if (!isFront && i + gridWidth < total) {
			const ns = dominantSideMap[i + gridWidth];
			if (ns >= 0 && ns !== mySide) isFront = true;
		}
		if (!isFront && i - gridWidth >= 0) {
			const ns = dominantSideMap[i - gridWidth];
			if (ns >= 0 && ns !== mySide) isFront = true;
		}
		if (isFront) {
			queue[qTail++] = i;
			sourceCell[i] = i;
		}
	}

	const dirs = [1, -1, gridWidth, -gridWidth];

	while (qHead < qTail) {
		const cur = queue[qHead++];
		const src = sourceCell[cur];

		const cy = Math.floor(cur / gridWidth);
		const cx = cur % gridWidth;
		const sy = Math.floor(src / gridWidth);
		const sx = src % gridWidth;
		const dLat = (sy - cy) * gridRes;
		const dLng = (sx - cx) * gridRes;
		const mag = Math.sqrt(dLat * dLat + dLng * dLng);
		if (mag > 0) {
			frontlineDirLat[cur] = dLat / mag;
			frontlineDirLng[cur] = dLng / mag;
		}

		for (let d = 0; d < 4; d++) {
			const nb = cur + dirs[d];
			if (nb < 0 || nb >= total) continue;
			if (sourceCell[nb] !== -1) continue;
			if (landMask[nb] === 0) continue;
			sourceCell[nb] = src;
			queue[qTail++] = nb;
		}
	}

	// Transfer the result arrays back (zero-copy)
	self.postMessage(
		{
			frontlineDirLat: frontlineDirLat.buffer,
			frontlineDirLng: frontlineDirLng.buffer,
			sourceCell: sourceCell.buffer,
		},
		[frontlineDirLat.buffer, frontlineDirLng.buffer, sourceCell.buffer],
	);
};
