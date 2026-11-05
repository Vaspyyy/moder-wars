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
