window.onerror = (msg, _url, line, _col, err) => {
	document.body.innerHTML = `<div style="background:#111;color:#f44;padding:20px;font-family:monospace;white-space:pre-wrap;font-size:14px;">JS Error at line ${line}:\n${msg}\n\n${err?.stack || ""}</div>`;
	return true;
};

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("workers/service-worker.js");
}
