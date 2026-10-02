/** Paint admission depends on presentation time/data, never simulation ordering. */
export function createPresentationScheduler({
	intervalMs = 1000 / 30,
	workBudgetMs = 12,
	maxDeferralMs = 50,
} = {}) {
	let nextPaint = Number.NEGATIVE_INFINITY;
	let lastRevision;
	let deferredAt = null;
	return {
		reset() {
			nextPaint = Number.NEGATIVE_INFINITY;
			lastRevision = undefined;
			deferredAt = null;
		},
		admit({ now, revision, dirty = false, force = false, workMs = 0 }) {
			if (!force && !dirty && Object.is(revision, lastRevision)) {
				deferredAt = null;
				return false;
			}
			if (!force && workMs > workBudgetMs) deferredAt ??= now;
			if (!force && now + 0.001 < nextPaint) return false;
			if (!force && workMs > workBudgetMs && now - deferredAt < maxDeferralMs)
				return false;
			return true;
		},
		painted(now, revision, force = false) {
			nextPaint =
				!force && Number.isFinite(nextPaint) && now - nextPaint < intervalMs
					? nextPaint + intervalMs
					: now + intervalMs;
			lastRevision = revision;
			deferredAt = null;
		},
	};
}

/** Preserve buckets and unit objects while updating presentation-only membership. */
export function createUnitSpatialMirror(hash, sideHashes, cellSize) {
	const records = new Map();
	const columns = Math.ceil(360 / cellSize);
	let generation = 0;
	const bucket = (map, key) => {
		let result = map.get(key);
		if (!result) {
			result = [];
			map.set(key, result);
		}
		return result;
	};
	const removeFrom = (map, key, slot, slotName) => {
		const list = map?.get(key);
		if (!list || slot >= list.length) return;
		const tail = list.pop();
		if (slot < list.length) {
			list[slot] = tail;
			const moved = records.get(tail.id);
			if (moved) moved[slotName] = slot;
		}
		if (!list.length) map.delete(key);
	};
	const remove = (record) => {
		removeFrom(hash, record.key, record.slot, "slot");
		removeFrom(
			sideHashes[record.side],
			record.key,
			record.sideSlot,
			"sideSlot",
		);
		records.delete(record.unit.id);
	};
	const reset = () => {
		records.clear();
		hash.clear();
		for (const map of sideHashes) map.clear();
	};
	return {
		reset,
		update(units, fullOwner = false) {
			if (fullOwner || (records.size && !hash.size)) reset();
			generation++;
			let present = 0;
			for (const unit of units) {
				let record = records.get(unit.id);
				if (!Number.isFinite(unit.lat) || !Number.isFinite(unit.lng)) {
					if (record) remove(record);
					continue;
				}
				present++;
				const rawX = Math.floor((unit.lng + 180) / cellSize);
				const x = ((rawX % columns) + columns) % columns;
				const key = x * 100 + Math.floor((unit.lat + 90) / cellSize);
				if (record && (record.key !== key || record.side !== unit.sideIndex)) {
					remove(record);
					record = null;
				}
				if (!record) {
					const list = bucket(hash, key);
					const sideMap = sideHashes[unit.sideIndex];
					const sideList = sideMap ? bucket(sideMap, key) : null;
					record = {
						unit,
						key,
						side: unit.sideIndex,
						slot: list.length,
						sideSlot: sideList?.length ?? -1,
					};
					list.push(unit);
					sideList?.push(unit);
					records.set(unit.id, record);
				} else if (record.unit !== unit) {
					hash.get(key)[record.slot] = unit;
					const list = sideHashes[record.side]?.get(key);
					if (list) list[record.sideSlot] = unit;
					record.unit = unit;
				}
				record.generation = generation;
			}
			if (records.size > present)
				for (const record of records.values()) {
					if (record.generation !== generation) remove(record);
				}
		},
	};
}

export function setPresentationText(element, value) {
	if (element) {
		const text = String(value);
		if (element.textContent !== text) element.textContent = text;
	}
}
