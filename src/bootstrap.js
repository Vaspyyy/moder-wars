window.onerror = (msg, _url, line, _col, err) => {
	document.body.innerHTML = `<div style="background:#111;color:#f44;padding:20px;font-family:monospace;white-space:pre-wrap;font-size:14px;">JS Error at line ${line}:\n${msg}\n\n${err?.stack || ""}</div>`;
	return true;
};

if ("serviceWorker" in navigator) {
	// Register from the project root so the worker controls the game, not only
	// requests below /workers/. Delay install/update traffic until the initial
	// document and module graph are settled so first-load downloads do not compete.
	const registerServiceWorker = () => {
		navigator.serviceWorker.register("service-worker.js").catch((error) => {
			console.warn("Service worker registration failed", error);
		});
	};
	const scheduleRegistration = () => {
		if (typeof requestIdleCallback === "function") {
			requestIdleCallback(registerServiceWorker, { timeout: 5000 });
		} else {
			setTimeout(registerServiceWorker, 1000);
		}
	};
	if (document.readyState === "complete") scheduleRegistration();
	else window.addEventListener("load", scheduleRegistration, { once: true });
}
