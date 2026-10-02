// Leaflet 1.9.4 adapter: advance its camera without resetting tile grids or
// announcing a completed gesture on every frame. Canvas and tile layers follow
// zoomanim; normal zoom/move/end events refresh them once the wheel settles.
const ZOOM_RESPONSE_MS = 55;
const WHEEL_IDLE_MS = 120;
const PIXELS_PER_ZOOM_LEVEL = 300;
const MAX_ZOOM_LEAD = 1.5;
const ZOOM_EPSILON = 0.001;

export function normalizeZoomWheel(event, viewportHeight) {
	if (
		!Number.isFinite(event.deltaY) ||
		Math.abs(event.deltaX || 0) > Math.abs(event.deltaY)
	)
		return 0;
	const multiplier =
		event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1;
	return Math.max(-120, Math.min(120, event.deltaY * multiplier));
}

export function createSmoothZoom(map, options = {}) {
	const requestFrame = options.requestFrame || requestAnimationFrame;
	const cancelFrame = options.cancelFrame || cancelAnimationFrame;
	const now = options.now || (() => performance.now());
	const reducedMotion =
		options.reducedMotion ||
		(() =>
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
	const container = map.getContainer();
	let active = false;
	let ownEvent = false;
	let raf = 0;
	let targetZoom = map.getZoom();
	let lastWheelTime = 0;
	let lastFrameTime = 0;
	let direction = 0;
	let center = map.getCenter();
	let anchor;
	let cursorOffset;

	function fireOwn(callback) {
		ownEvent = true;
		try {
			callback();
		} finally {
			ownEvent = false;
		}
	}

	function finish() {
		if (!active) return;
		if (raf) cancelFrame(raf);
		raf = 0;
		active = false;
		direction = 0;
		// Publish the current visual camera, including when a drag or scenario
		// change interrupts easing. Never jump to an obsolete pending target.
		fireOwn(() => map.fire("zoom").fire("move")._moveEnd(true));
		container.classList.remove("mw-smooth-zoom");
	}

	function onExternalMove() {
		if (!ownEvent) finish();
	}

	function frame(time) {
		raf = 0;
		if (!active) return;
		const elapsed = Math.max(0, time - lastFrameTime);
		lastFrameTime = time;
		const currentZoom = map.getZoom();
		const remaining = targetZoom - currentZoom;
		let nextZoom =
			reducedMotion() || Math.abs(remaining) <= ZOOM_EPSILON
				? targetZoom
				: currentZoom + remaining * (1 - Math.exp(-elapsed / ZOOM_RESPONSE_MS));
		if (Math.abs(targetZoom - nextZoom) <= ZOOM_EPSILON) nextZoom = targetZoom;
		const projectedAnchor = map.project(anchor, nextZoom);
		center = map.unproject(
			[projectedAnchor.x - cursorOffset.x, projectedAnchor.y - cursorOffset.y],
			nextZoom,
		);
		center = map._limitCenter(center, nextZoom, map.options.maxBounds);
		fireOwn(() => {
			map._move(center, nextZoom, undefined, true);
			map.fire("zoomanim", {
				center,
				zoom: nextZoom,
				noUpdate: true,
				smoothZoom: true,
			});
		});
		if (
			Math.abs(targetZoom - nextZoom) <= ZOOM_EPSILON &&
			time - lastWheelTime >= WHEEL_IDLE_MS
		) {
			finish();
			return;
		}
		raf = requestFrame(frame);
	}

	function onWheel(event) {
		if (
			event.defaultPrevented ||
			event.target?.closest?.(
				".leaflet-control, .ref-handle, .ref-handle-center, input, textarea, select, button, [contenteditable='true']",
			)
		)
			return;
		const size = map.getSize();
		const pixels = normalizeZoomWheel(event, size.y);
		if (!pixels) return;
		event.preventDefault();
		event.stopPropagation();
		if (!active) {
			// Finish a keyboard/double-click CSS zoom before taking over its camera.
			if (map._animatingZoom) map._onZoomTransitionEnd();
			map._stop();
			center = map.getCenter();
			targetZoom = map.getZoom();
		}
		const currentZoom = map.getZoom();
		const nextDirection = -Math.sign(pixels);
		// Reversing the wheel cancels outstanding momentum immediately.
		if (direction && nextDirection !== direction) targetZoom = currentZoom;
		direction = nextDirection;
		targetZoom = Math.max(
			map.getMinZoom(),
			Math.min(
				map.getMaxZoom(),
				Math.max(
					currentZoom - MAX_ZOOM_LEAD,
					Math.min(
						currentZoom + MAX_ZOOM_LEAD,
						targetZoom - pixels / PIXELS_PER_ZOOM_LEVEL,
					),
				),
			),
		);
		if (!active && targetZoom === currentZoom) return;
		const cursor = map.mouseEventToContainerPoint(event);
		cursorOffset = { x: cursor.x - size.x / 2, y: cursor.y - size.y / 2 };
		const projectedCenter = map.project(center, currentZoom);
		anchor = map.unproject(
			[projectedCenter.x + cursorOffset.x, projectedCenter.y + cursorOffset.y],
			currentZoom,
		);
		lastWheelTime = now();
		if (!active) {
			active = true;
			lastFrameTime = lastWheelTime;
			container.classList.add("mw-smooth-zoom");
			fireOwn(() => map._moveStart(true));
		}
		if (!raf) raf = requestFrame(frame);
	}

	container.addEventListener("wheel", onWheel, { passive: false });
	// Capture before Leaflet and editor handlers calculate their pointer position.
	container.addEventListener("pointerdown", finish, true);
	container.addEventListener("touchstart", finish, true);
	map.on("movestart zoomstart viewprereset resize", onExternalMove);

	function destroy() {
		finish();
		container.removeEventListener("wheel", onWheel);
		container.removeEventListener("pointerdown", finish, true);
		container.removeEventListener("touchstart", finish, true);
		map.off("movestart zoomstart viewprereset resize", onExternalMove);
		map.off("unload", destroy);
	}
	map.on("unload", destroy);
	return { finish, destroy };
}
