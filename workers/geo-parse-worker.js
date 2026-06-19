// Web Worker: off-main-thread JSON.parse for large GeoJSON files
self.onmessage = (evt) => {
	try {
		const text = new TextDecoder().decode(evt.data);
		self.postMessage({ data: JSON.parse(text) });
	} catch (err) {
		self.postMessage({ error: err.message });
	}
};
