// Player-chosen files stay on this device. Images become data URLs so they
// survive scenario export and reload; the soundtrack lives in Cache Storage.

/** @param {Blob} file @returns {Promise<string>} */
export function readFileAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

const FLAG_MAX_WIDTH = 320;

/**
 * Read a flag image as a data URL, scaled down to the bundled flag width so a
 * large photo does not bloat country metadata, state handoffs and exports.
 * @param {Blob} file @returns {Promise<string>}
 */
export async function readFlagAsDataUrl(file) {
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, FLAG_MAX_WIDTH / bitmap.width);
		if (scale < 1) {
			const canvas = document.createElement("canvas");
			canvas.width = FLAG_MAX_WIDTH;
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			canvas
				.getContext("2d")
				?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
			return canvas.toDataURL("image/webp", 0.9);
		}
		bitmap.close();
	} catch {
		// Formats createImageBitmap cannot read (such as some SVGs) stay as they are.
	}
	return readFileAsDataUrl(file);
}

const MEDIA_CACHE = "mw-user-media";
const TRACK_KEY = "/__mw-user-media/custom-track";

function trackRequest() {
	return new Request(new URL(TRACK_KEY, location.origin));
}

/** Store the soundtrack and return a playable object URL. */
export async function storeCustomTrack(file) {
	if (globalThis.caches) {
		const cache = await caches.open(MEDIA_CACHE);
		await cache.put(
			trackRequest(),
			new Response(file, {
				headers: { "Content-Type": file.type || "audio/mpeg" },
			}),
		);
	}
	return URL.createObjectURL(file);
}

/** @returns {Promise<string|null>} an object URL for the stored soundtrack */
export async function loadStoredCustomTrack() {
	if (!globalThis.caches) return null;
	try {
		const cache = await caches.open(MEDIA_CACHE);
		const response = await cache.match(trackRequest());
		return response ? URL.createObjectURL(await response.blob()) : null;
	} catch {
		return null;
	}
}

export async function clearStoredCustomTrack() {
	if (!globalThis.caches) return;
	const cache = await caches.open(MEDIA_CACHE);
	await cache.delete(trackRequest());
}
