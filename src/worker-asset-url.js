/** Limit worker downloads to packaged assets and explicitly allowed local blobs. */
export function resolveWorkerAssetUrl(value, workerUrl, allowBlob = false) {
	const assets = new URL("../assets/", workerUrl);
	const url = new URL(value, assets);
	if (url.origin !== assets.origin || url.username || url.password) {
		throw new Error("Worker assets must use the application origin.");
	}
	// Scenario reloads may use a blob created by this application's document.
	if (allowBlob && url.protocol === "blob:") return url.href;
	if (
		!["https:", "http:"].includes(url.protocol) ||
		!url.pathname.startsWith(assets.pathname) ||
		/%(?:2e|2f|5c|25)/i.test(url.pathname)
	) {
		throw new Error("Worker downloads must stay inside packaged assets.");
	}
	return url.href;
}
