// Web Worker: fetches and parses large GeoJSON off the main thread.
// The 20-31MB JSON.parse blocks the main thread for 2-5 seconds on first load.
// Running it in a worker keeps the loading spinner responsive.

let reqId = 0;

self.onmessage = function (evt) {
	const { url, id } = evt.data;
	fetch(url)
		.then((r) => r.json())
		.then((data) => {
			self.postMessage({ id, ok: true, data });
		})
		.catch((err) => {
			self.postMessage({ id, ok: false, error: err.message });
		});
};
