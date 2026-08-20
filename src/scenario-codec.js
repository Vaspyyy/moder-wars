const MAGIC = new Uint8Array([0x4d, 0x57, 0x53, 0x43]); // MWSC
const VERSION = 2;
const HEADER_BYTES = 20;

/** Return the lowercase SHA-256 digest of an ArrayBuffer or typed-array view. */
export async function sha256Hex(input) {
	if (!globalThis.crypto?.subtle) {
		throw new Error("SHA-256 is unavailable in this runtime");
	}
	const bytes =
		input instanceof Uint8Array
			? input
			: ArrayBuffer.isView(input)
				? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
				: new Uint8Array(input);
	const digest = new Uint8Array(
		await globalThis.crypto.subtle.digest("SHA-256", bytes),
	);
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

// Content-addressed query revisions keep the persistent runtime cache fast
// without allowing rebuilt packages with stable filenames to remain stale.
export const COMPILED_SCENARIO_URLS = Object.freeze({
	modern: "assets/maps/compiled/world-map-2022-v2.mwsc.gz?rev=e360e86fbcc5decb",
	ww1: "assets/maps/compiled/world-war-1-1914-v2.mwsc.gz?rev=dd4b9981901746de",
	ww2: "assets/maps/compiled/world-war-2-v2.mwsc.gz?rev=1237a0dfbdded431",
});

function writeVarUint(target, offset, value) {
	let current = Number(value) >>> 0;
	do {
		let byte = current & 0x7f;
		current >>>= 7;
		if (current !== 0) byte |= 0x80;
		target[offset++] = byte;
	} while (current !== 0);
	return offset;
}

function writeVarInt(target, offset, value) {
	const zigzag = value >= 0 ? value * 2 : -value * 2 - 1;
	return writeVarUint(target, offset, zigzag);
}

function readVarUint(bytes, state) {
	let value = 0;
	let shift = 0;
	while (state.offset < bytes.length && shift <= 28) {
		const byte = bytes[state.offset++];
		value |= (byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) return value >>> 0;
		shift += 7;
	}
	throw new Error("Invalid or truncated scenario varint");
}

function readVarInt(bytes, state) {
	const zigzag = readVarUint(bytes, state);
	return zigzag & 1 ? -((zigzag + 1) / 2) : zigzag / 2;
}

function assertScenario(data) {
	if (!data || typeof data !== "object" || !Array.isArray(data.mapData)) {
		throw new TypeError("Scenario must be an object with a mapData array");
	}
	if (!(Number(data.gridRes) > 0)) {
		throw new TypeError("Scenario gridRes must be a positive number");
	}
}

/** Encode a JSON scenario into the MWSC v2 binary format. */
export function encodeScenario(data) {
	assertScenario(data);
	const scenario = { ...data };
	delete scenario.mapData;
	const metadata = new TextEncoder().encode(JSON.stringify(scenario));
	// Preserve source order because overlapping cells during resolution remapping
	// intentionally use the scenario's last-write-wins ordering.
	const entries = data.mapData;
	// Four uint32 varints require at most 20 bytes per run.
	const output = new Uint8Array(
		HEADER_BYTES + metadata.length + entries.length * 20,
	);
	output.set(MAGIC, 0);
	const view = new DataView(output.buffer);
	view.setUint8(4, VERSION);
	view.setUint8(5, 0);
	view.setUint16(6, HEADER_BYTES, true);
	view.setUint32(8, metadata.length, true);
	view.setUint32(12, entries.length, true);
	view.setUint32(16, 0, true);
	output.set(metadata, HEADER_BYTES);

	let offset = HEADER_BYTES + metadata.length;
	let previousRunStart = 0;
	for (let i = 0; i < entries.length; ) {
		const entry = entries[i];
		if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || entry[0] < 0) {
			throw new TypeError(
				"Each mapData entry must start with a non-negative integer index",
			);
		}
		const runStart = entry[0];
		const owner = entry[1] || 0;
		const biome = entry[2] || 0;
		let runLength = 1;
		while (
			i + runLength < entries.length &&
			entries[i + runLength][0] === runStart + runLength &&
			(entries[i + runLength][1] || 0) === owner &&
			(entries[i + runLength][2] || 0) === biome
		) {
			runLength++;
		}
		offset = writeVarInt(output, offset, runStart - previousRunStart);
		offset = writeVarUint(output, offset, runLength);
		offset = writeVarUint(output, offset, owner);
		offset = writeVarUint(output, offset, biome);
		previousRunStart = runStart;
		i += runLength;
	}
	view.setUint32(16, offset - HEADER_BYTES - metadata.length, true);
	return output.slice(0, offset);
}

function parseEnvelope(input) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (
		bytes.length < HEADER_BYTES ||
		!MAGIC.every((byte, index) => bytes[index] === byte)
	) {
		throw new Error("Not an MWSC scenario binary");
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const version = view.getUint8(4);
	if (version !== VERSION)
		throw new Error(`Unsupported MWSC version ${version}`);
	const headerBytes = view.getUint16(6, true);
	const metadataBytes = view.getUint32(8, true);
	const entryCount = view.getUint32(12, true);
	const payloadBytes = view.getUint32(16, true);
	const payloadOffset = headerBytes + metadataBytes;
	if (
		headerBytes < HEADER_BYTES ||
		payloadOffset + payloadBytes > bytes.length
	) {
		throw new Error("Truncated MWSC scenario binary");
	}
	const metadataText = new TextDecoder().decode(
		bytes.subarray(headerBytes, payloadOffset),
	);
	return {
		bytes,
		scenario: JSON.parse(metadataText),
		entryCount,
		payloadOffset,
		payloadEnd: payloadOffset + payloadBytes,
	};
}

function sourceGrid(scenario) {
	const gridRes = Number(scenario.gridRes);
	if (!(gridRes > 0)) throw new Error("Decoded scenario has no valid gridRes");
	const width = Math.ceil((Number(scenario.worldWidthDeg) || 360) / gridRes);
	const height = Math.ceil((Number(scenario.worldHeightDeg) || 180) / gridRes);
	return {
		gridRes,
		width,
		height,
		length: width * height,
		mapRes: scenario.mapRes || null,
	};
}

/** Decode MWSC bytes into dense typed maps ready for the simulation state. */
export function decodeScenarioBinary(input, options = {}) {
	const envelope = parseEnvelope(input);
	return expandSparseEntries(
		envelope.scenario,
		envelope.entryCount,
		options,
		(visit) => {
			const state = { offset: envelope.payloadOffset };
			let previousRunStart = 0;
			let decodedEntries = 0;
			while (state.offset < envelope.payloadEnd) {
				const runStart = previousRunStart + readVarInt(envelope.bytes, state);
				const runLength = readVarUint(envelope.bytes, state);
				const owner = readVarUint(envelope.bytes, state);
				const biome = readVarUint(envelope.bytes, state);
				if (runLength === 0) throw new Error("MWSC run length cannot be zero");
				for (let j = 0; j < runLength; j++) visit(runStart + j, owner, biome);
				decodedEntries += runLength;
				previousRunStart = runStart;
			}
			if (
				state.offset !== envelope.payloadEnd ||
				decodedEntries !== envelope.entryCount
			) {
				throw new Error("MWSC payload length does not match its entry count");
			}
		},
	);
}

/** Expand a normal JSON scenario through the same output contract as binary decode. */
export function decodeScenarioJson(data, options = {}) {
	assertScenario(data);
	const scenario = { ...data };
	const entries = scenario.mapData;
	delete scenario.mapData;
	return expandSparseEntries(scenario, entries.length, options, (visit) => {
		for (const entry of entries) visit(entry[0], entry[1] || 0, entry[2] || 0);
	});
}

function targetGrid(source, scenario, options) {
	const gridRes = Number(options.targetGridRes) || source.gridRes;
	if (!(gridRes > 0))
		throw new Error("targetGridRes must be a positive number");
	const width =
		Number(options.targetWidth) ||
		Math.ceil((Number(scenario.worldWidthDeg) || 360) / gridRes);
	const height =
		Number(options.targetHeight) ||
		Math.ceil((Number(scenario.worldHeightDeg) || 180) / gridRes);
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0
	) {
		throw new Error("Target grid dimensions must be positive integers");
	}
	return { gridRes, width, height, length: width * height };
}

function getProvinceId(x, y, countryId, gridRes) {
	if (countryId <= 0) return 0;
	const lat = y * gridRes - 90;
	const lng = x * gridRes - 180;
	const scale = 0.65;
	const nx = lng * scale;
	const ny = lat * scale;
	const w1 = Math.sin(nx * 0.8 + ny * 0.6 + countryId * 0.1) * 1.2;
	const w2 = Math.cos(nx * 0.5 - ny * 0.9 + countryId * 0.2) * 1.1;
	const noise =
		Math.sin((nx + w1) * 2.3) * 0.5 +
		Math.sin((ny + w2) * 1.9) * 0.5 +
		Math.sin((nx + ny) * 1.4 + countryId) * 0.3 +
		Math.cos(nx * 3.1 - ny * 2.7) * 0.2;
	const cellX = Math.floor(nx + w1 + noise);
	const cellY = Math.floor(ny + w2 + noise);
	const h1 = Math.abs(cellX * 73856093);
	const h2 = Math.abs(cellY * 19349663);
	const h3 = Math.abs(countryId * 83492791);
	return (h1 ^ h2 ^ h3) >>> 0;
}

function expandSparseEntries(scenario, entryCount, options, readEntries) {
	const source = sourceGrid(scenario);
	const target = targetGrid(source, scenario, options);
	const worldControl = new Uint16Array(target.length);
	const deJure = new Uint16Array(target.length);
	const land = new Uint8Array(target.length);
	const biome = new Uint8Array(target.length);
	const sameGrid =
		source.gridRes === target.gridRes &&
		source.width === target.width &&
		source.height === target.height;
	readEntries((index, owner, biomeId) => {
		if (index >= source.length) return;
		if (sameGrid) {
			worldControl[index] = owner;
			deJure[index] = owner;
			land[index] = 1;
			biome[index] = biomeId;
			return;
		}
		const sourceY = Math.floor(index / source.width);
		const sourceX = index % source.width;
		const baseLat = sourceY * source.gridRes - 90;
		const baseLng = sourceX * source.gridRes - 180;
		const xStart = Math.floor((baseLng + 180) / target.gridRes);
		const xEnd = Math.floor(
			(baseLng + source.gridRes + 180 - 0.0001) / target.gridRes,
		);
		const yStart = Math.floor((baseLat + 90) / target.gridRes);
		const yEnd = Math.floor(
			(baseLat + source.gridRes + 90 - 0.0001) / target.gridRes,
		);
		for (let y = yStart; y <= yEnd; y++) {
			if (y < 0 || y >= target.height) continue;
			const rowOffset = y * target.width;
			for (let x = xStart; x <= xEnd; x++) {
				if (x < 0 || x >= target.width) continue;
				const targetIndex = rowOffset + x;
				worldControl[targetIndex] = owner;
				deJure[targetIndex] = owner;
				land[targetIndex] = 1;
			}
		}
	});
	const province = new Int32Array(target.length);
	for (let index = 0; index < target.length; index++) {
		const owner = worldControl[index];
		if (owner > 0) {
			province[index] = getProvinceId(
				index % target.width,
				Math.floor(index / target.width),
				owner,
				target.gridRes,
			);
		}
	}
	return {
		scenario,
		source,
		target,
		entryCount,
		worldControl,
		deJure,
		land,
		biome,
		province,
	};
}

/**
 * Load and decode a scenario in a dedicated worker.
 *
 * @param {string|URL} url compiled .mwsc.gz URL
 * @param {{workerUrl?: string|URL, jsonFallbackUrl?: string|URL, targetGridRes?: number, targetWidth?: number, targetHeight?: number, onProgress?: Function, signal?: AbortSignal}} options
 */
export function loadScenario(url, options = {}) {
	const workerUrl =
		options.workerUrl ||
		new URL("../workers/scenario-worker.js", import.meta.url);
	const worker = new Worker(workerUrl, { type: "module" });
	const startedAt = performance.now();
	const baseUrl =
		typeof window !== "undefined" ? window.location.href : import.meta.url;
	const scenarioUrl = new URL(String(url), baseUrl).href;
	const jsonFallbackUrl = options.jsonFallbackUrl
		? new URL(String(options.jsonFallbackUrl), baseUrl).href
		: null;
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			worker.terminate();
			options.signal?.removeEventListener("abort", abort);
		};
		const abort = () => {
			cleanup();
			reject(new DOMException("Scenario load aborted", "AbortError"));
		};
		worker.onmessage = ({ data }) => {
			if (data.type === "progress") {
				options.onProgress?.(data.progress);
				return;
			}
			cleanup();
			if (data.type === "result") {
				resolve({
					...data.result,
					timing: {
						...data.result.timing,
						totalMs: performance.now() - startedAt,
					},
				});
			} else {
				reject(new Error(data.error || "Scenario worker failed"));
			}
		};
		worker.onerror = (event) => {
			cleanup();
			reject(
				event.error || new Error(event.message || "Scenario worker failed"),
			);
		};
		if (options.signal?.aborted) return abort();
		options.signal?.addEventListener("abort", abort, { once: true });
		worker.postMessage({
			type: "load",
			url: scenarioUrl,
			jsonFallbackUrl,
			targetGridRes: options.targetGridRes,
			targetWidth: options.targetWidth,
			targetHeight: options.targetHeight,
		});
	});
}
