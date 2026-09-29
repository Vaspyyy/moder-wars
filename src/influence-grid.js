// Flat pages retain every Float32 value while omitting untouched zero regions.
export const INFLUENCE_PAGE_SHIFT = 10;
export const INFLUENCE_PAGE_SIZE = 1 << INFLUENCE_PAGE_SHIFT;
const PAGE_MASK = INFLUENCE_PAGE_SIZE - 1;

export function createSparseInfluenceMap(length) {
	if (!Number.isInteger(length) || length < 0 || length > 0xffffffff) {
		throw new RangeError("Influence map length must be a uint32 integer");
	}
	return {
		length,
		pages: new Array(Math.ceil(length / INFLUENCE_PAGE_SIZE)),
		pageCount: 0,
	};
}

/** Dense typed-array inputs keep the browser/editor path compatible. */
export function readInfluence(map, index) {
	const pages = map.pages;
	if (!pages) return map[index];
	if (index !== index >>> 0 || index >= map.length) return undefined;
	const page = pages[index >>> INFLUENCE_PAGE_SHIFT];
	return page ? page[index & PAGE_MASK] : 0;
}

/** Return the stored Float32 value, not the unrounded arithmetic result. */
export function writeInfluence(map, index, value) {
	const pages = map.pages;
	if (!pages) {
		map[index] = value;
		return map[index];
	}
	if (index !== index >>> 0 || index >= map.length) return undefined;
	const pageIndex = index >>> INFLUENCE_PAGE_SHIFT;
	let page = pages[pageIndex];
	if (!page) {
		const rounded = Math.fround(value);
		if (rounded === 0 && !Object.is(rounded, -0)) return 0;
		page = new Float32Array(INFLUENCE_PAGE_SIZE);
		pages[pageIndex] = page;
		map.pageCount++;
	}
	page[index & PAGE_MASK] = value;
	return page[index & PAGE_MASK];
}

/** Interior 3x3 smoothing keeps row-major addition order and reuses page lookups. */
export function sumInfluenceNeighborhood(map, index, gridWidth) {
	let sum = 0;
	const pages = map.pages;
	if (!pages) {
		for (let dy = -1; dy <= 1; dy++) {
			const row = index + dy * gridWidth;
			for (let dx = -1; dx <= 1; dx++) sum += map[row + dx];
		}
		return sum;
	}
	for (let dy = -1; dy <= 1; dy++) {
		const start = index + dy * gridWidth - 1;
		const offset = start & PAGE_MASK;
		const page = pages[start >>> INFLUENCE_PAGE_SHIFT];
		if (offset < INFLUENCE_PAGE_SIZE - 2) {
			if (page) {
				sum += page[offset];
				sum += page[offset + 1];
				sum += page[offset + 2];
			}
		} else {
			for (let dx = 0; dx < 3; dx++) sum += readInfluence(map, start + dx);
		}
	}
	return sum;
}

export function addInfluence(map, index, value) {
	return writeInfluence(map, index, readInfluence(map, index) + value);
}

export function multiplyInfluence(map, index, factor) {
	return writeInfluence(map, index, readInfluence(map, index) * factor);
}

/** Clearing a sparse map releases its pages without scanning the world grid. */
export function clearInfluenceMap(map) {
	if (!map.pages) {
		map.fill(0);
		return;
	}
	map.pages.fill(undefined);
	map.pageCount = 0;
}

/** Convert incoming dense state once; sparse inputs are already worker-owned. */
export function toSparseInfluenceMap(map) {
	if (map.pages) return map;
	const sparse = createSparseInfluenceMap(map.length);
	for (let offset = 0; offset < map.length; offset += INFLUENCE_PAGE_SIZE) {
		const end = Math.min(map.length, offset + INFLUENCE_PAGE_SIZE);
		let present = false;
		for (let index = offset; index < end; index++) {
			const value = map[index];
			if (value !== 0 || Object.is(value, -0)) {
				present = true;
				break;
			}
		}
		if (!present) continue;
		const page = new Float32Array(INFLUENCE_PAGE_SIZE);
		page.set(map.subarray(offset, end));
		sparse.pages[offset >>> INFLUENCE_PAGE_SHIFT] = page;
		sparse.pageCount++;
	}
	return sparse;
}

/** Materialize only when handing control back to legacy editor/diplomacy code. */
export function toDenseInfluenceMap(map) {
	if (!map.pages) return map;
	const dense = new Float32Array(map.length);
	for (let pageIndex = 0; pageIndex < map.pages.length; pageIndex++) {
		const page = map.pages[pageIndex];
		if (!page) continue;
		const offset = pageIndex << INFLUENCE_PAGE_SHIFT;
		dense.set(
			page.subarray(0, Math.min(page.length, map.length - offset)),
			offset,
		);
	}
	return dense;
}

/** Numeric payload bytes; excludes the small page-reference table and JS headers. */
export function influenceStorageBytes(map) {
	return map.pages ? map.pageCount * INFLUENCE_PAGE_SIZE * 4 : map.byteLength;
}
