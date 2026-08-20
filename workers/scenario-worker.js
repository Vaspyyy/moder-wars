import {
	decodeScenarioBinary,
	decodeScenarioJson,
	sha256Hex,
} from "../src/scenario-codec.js";

const now = () => performance.now();

function progress(phase, details = {}) {
	self.postMessage({
		type: "progress",
		progress: { phase, elapsedMs: now() - loadStartedAt, ...details },
	});
}

async function fetchBytes(url, source) {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(
			`Scenario request failed: ${response.status} ${response.statusText}`,
		);
	const total = Number(response.headers.get("content-length")) || null;
	if (!response.body) {
		const bytes = new Uint8Array(await response.arrayBuffer());
		progress("download", {
			source,
			loaded: bytes.length,
			total,
			ratio: total ? 1 : null,
		});
		return bytes;
	}
	const reader = response.body.getReader();
	const chunks = [];
	let loaded = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.length;
		progress("download", {
			source,
			loaded,
			total,
			ratio: total ? loaded / total : null,
		});
	}
	const bytes = new Uint8Array(loaded);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}

async function decompressScenario(bytes) {
	if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
	if (typeof DecompressionStream !== "function") {
		throw new Error(
			"This browser does not support gzip scenario decompression",
		);
	}
	progress("decompress", { source: "binary", loaded: bytes.length });
	const stream = new Blob([bytes])
		.stream()
		.pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

let loadStartedAt = 0;

self.onmessage = async ({ data }) => {
	if (data.type !== "load") return;
	loadStartedAt = now();
	try {
		let decoded;
		let source = "binary";
		let sourceIdentity = null;
		const downloadStartedAt = now();
		try {
			const downloadedBytes = await fetchBytes(data.url, source);
			const downloadMs = now() - downloadStartedAt;
			let sha256 = null;
			try {
				sha256 = await sha256Hex(downloadedBytes);
			} catch (hashError) {
				console.warn("[MW] Compiled scenario identity unavailable:", hashError);
			}
			const decompressStartedAt = now();
			const bytes = await decompressScenario(downloadedBytes);
			const decompressMs = now() - decompressStartedAt;
			progress("decode", { source });
			const decodeStartedAt = now();
			decoded = decodeScenarioBinary(bytes, data);
			if (sha256) {
				sourceIdentity = {
					format: source,
					name: decoded.scenario?.name || "Unnamed scenario",
					sha256,
					url: data.url,
				};
			}
			decoded.timing = {
				downloadBytes: downloadedBytes.length,
				downloadMs,
				decompressMs,
				decodeMs: now() - decodeStartedAt,
			};
		} catch (binaryError) {
			if (!data.jsonFallbackUrl) throw binaryError;
			source = "json";
			progress("fallback", { source, reason: binaryError.message });
			const fallbackStartedAt = now();
			const bytes = await fetchBytes(data.jsonFallbackUrl, source);
			const downloadMs = now() - fallbackStartedAt;
			progress("decode", { source });
			const decodeStartedAt = now();
			decoded = decodeScenarioJson(
				JSON.parse(new TextDecoder().decode(bytes)),
				data,
			);
			decoded.timing = {
				downloadBytes: bytes.length,
				downloadMs,
				decompressMs: 0,
				decodeMs: now() - decodeStartedAt,
			};
		}
		decoded.format = source;
		decoded.sourceIdentity = sourceIdentity;
		progress("complete", { source, loaded: decoded.entryCount });
		self.postMessage({ type: "result", result: decoded }, [
			decoded.worldControl.buffer,
			decoded.deJure.buffer,
			decoded.land.buffer,
			decoded.biome.buffer,
			decoded.province.buffer,
		]);
	} catch (error) {
		self.postMessage({ type: "error", error: error?.message || String(error) });
	}
};
