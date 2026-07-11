// Web Worker: off-main-thread JSON.parse for large GeoJSON files
self.onmessage = (evt) => {
	const { id, buf } = evt.data || {};
	try {
		const text = new TextDecoder().decode(buf);
		self.postMessage({ id, data: JSON.parse(text) });
	} catch (err) {
		self.postMessage({ id, error: err.message });
	}
};
