import type { MapCamera } from "./map-camera.ts";
import { Point, point } from "./map-projection.ts";
export function normalizeZoomWheel(
	event: Pick<WheelEvent, "deltaY" | "deltaX" | "deltaMode">,
	height: number,
) {
	if (
		!Number.isFinite(event.deltaY) ||
		Math.abs(event.deltaX) > Math.abs(event.deltaY)
	)
		return 0;
	return Math.max(
		-120,
		Math.min(
			120,
			event.deltaY *
				(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1),
		),
	);
}
export interface InputClock {
	requestFrame?: typeof requestAnimationFrame;
	cancelFrame?: typeof cancelAnimationFrame;
	now?: () => number;
	reducedMotion?: () => boolean;
}
/** Input publishes at most one camera change per animation frame. */
export function bindCameraInput(map: MapCamera, clock: InputClock = {}) {
	const container = map.getContainer(),
		request = clock.requestFrame ?? requestAnimationFrame,
		cancel = clock.cancelFrame ?? cancelAnimationFrame;
	const now = clock.now ?? (() => performance.now()),
		reduced =
			clock.reducedMotion ??
			(() =>
				window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
				true);
	const pointers = new Map<number, Point>();
	let raf = 0,
		active = false,
		zooming = false,
		targetZoom = map.getZoom(),
		last = 0,
		wheelTime = 0;
	let anchor = map.getCenter(),
		offset = new Point(0, 0),
		dragStart = new Point(0, 0),
		dragCenter = map.project(map.getCenter()),
		pending = new Point(0, 0);
	let moved = false,
		pinching = false,
		pinchDistance = 0,
		pinchZoom = 0,
		direction = 0,
		velocity = new Point(0, 0),
		inertia = false;
	const excluded = (event: Event) =>
		(event.target as Element)?.closest?.(
			'.ref-handle, .ref-handle-center, input, textarea, select, button, [contenteditable="true"]',
		);
	const payload = (
		event: MouseEvent,
		position = map.mouseEventToContainerPoint(event),
	) => ({
		latlng: map.containerPointToLatLng(position),
		originalEvent: event,
	});
	function finish() {
		if (raf) cancel(raf);
		raf = 0;
		if (active) map.endGesture(zooming);
		active = false;
		pinching = false;
		inertia = false;
		direction = 0;
		velocity = new Point(0, 0);
	}
	function begin(zoom: boolean) {
		if (active && zooming === zoom) return;
		finish();
		active = true;
		zooming = zoom;
		last = now();
		map.beginGesture(zoom);
	}
	function schedule() {
		if (!raf) raf = request(frame);
	}
	function updateZoom(zoom: number) {
		map.updateGesture(
			map.unproject(map.project(anchor, zoom).subtract(offset), zoom),
			zoom,
			true,
		);
	}
	function frame(time: number) {
		raf = 0;
		if (!active) return;
		const elapsed = Math.max(0, Math.min(64, time - last));
		last = time;
		if (zooming && !pinching) {
			const current = map.getZoom(),
				next = reduced()
					? targetZoom
					: current + (targetZoom - current) * (1 - Math.exp(-elapsed / 55));
			updateZoom(Math.abs(targetZoom - next) < 0.001 ? targetZoom : next);
			if (
				Math.abs(targetZoom - map.getZoom()) < 0.001 &&
				time - wheelTime >= 120
			) {
				finish();
				return;
			}
			schedule();
		} else if (pinching) updateZoom(targetZoom);
		else if (inertia) {
			pending = pending.add(velocity.multiplyBy(elapsed));
			velocity = velocity.multiplyBy(Math.exp(-elapsed / 160));
			const before = map.getCenter();
			map.updateGesture(map.unproject(dragCenter.subtract(pending)));
			const after = map.getCenter();
			if (
				Math.hypot(velocity.x, velocity.y) < 0.01 ||
				(before.lat === after.lat && before.lng === after.lng)
			) {
				finish();
				return;
			}
			schedule();
		} else map.updateGesture(map.unproject(dragCenter.subtract(pending)));
	}
	function onWheel(event: WheelEvent) {
		if (event.defaultPrevented || excluded(event) || pointers.size) return;
		const pixels = normalizeZoomWheel(event, map.getSize().y);
		if (!pixels) return;
		event.preventDefault();
		event.stopPropagation();
		if (!active || !zooming) {
			begin(true);
			targetZoom = map.getZoom();
		}
		const nextDirection = -Math.sign(pixels);
		if (direction && direction !== nextDirection) targetZoom = map.getZoom();
		direction = nextDirection;
		targetZoom = Math.max(
			map.getMinZoom(),
			Math.min(
				map.getMaxZoom(),
				Math.max(
					map.getZoom() - 1.5,
					Math.min(map.getZoom() + 1.5, targetZoom - pixels / 300),
				),
			),
		);
		offset = map
			.mouseEventToContainerPoint(event)
			.subtract(map.getSize().divideBy(2));
		anchor = map.unproject(map.project(map.getCenter()).add(offset));
		wheelTime = now();
		schedule();
	}
	function setupPinch() {
		const [a, b] = [...pointers.values()];
		if (!a || !b) return;
		begin(true);
		pinching = true;
		moved = true;
		pinchDistance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
		pinchZoom = map.getZoom();
		offset = a.add(b).divideBy(2).subtract(map.getSize().divideBy(2));
		anchor = map.containerPointToLatLng(a.add(b).divideBy(2));
	}
	function onDown(event: PointerEvent) {
		if (
			excluded(event) ||
			event.button !== 0 ||
			pointers.has(event.pointerId) ||
			pointers.size >= 2
		)
			return;
		finish();
		container.focus({ preventScroll: true });
		const p = map.mouseEventToContainerPoint(event);
		pointers.set(event.pointerId, p);
		container.setPointerCapture(event.pointerId);
		map.fire("mousedown", payload(event, p));
		if (pointers.size === 2 && map.dragging.enabled()) {
			setupPinch();
			return;
		}
		dragStart = p;
		pending = new Point(0, 0);
		dragCenter = map.project(map.getCenter());
		moved = false;
		last = now();
		if (map.dragging.enabled()) begin(false);
	}
	function onMove(event: PointerEvent) {
		// Read layout before handlers write the coordinate HUD or editor UI.
		const p = map.mouseEventToContainerPoint(event);
		map.fire("mousemove", payload(event, p));
		if (!pointers.has(event.pointerId)) return;
		const previous = pointers.get(event.pointerId) ?? new Point(0, 0);
		pointers.set(event.pointerId, p);
		if (!map.dragging.enabled()) return;
		if (pinching) {
			const [a, b] = [...pointers.values()];
			if (!a || !b) return;
			targetZoom = Math.max(
				map.getMinZoom(),
				Math.min(
					map.getMaxZoom(),
					pinchZoom +
						Math.log2(
							Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / pinchDistance,
						),
				),
			);
			offset = a.add(b).divideBy(2).subtract(map.getSize().divideBy(2));
			schedule();
			return;
		}
		pending = p.subtract(dragStart);
		if (Math.hypot(pending.x, pending.y) > 3) moved = true;
		const dt = Math.max(1, now() - last);
		velocity = p.subtract(previous).divideBy(dt);
		last = now();
		schedule();
	}
	function onUp(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		if (raf && active) {
			cancel(raf);
			raf = 0;
			frame(now());
			if (raf) {
				cancel(raf);
				raf = 0;
			}
		}
		pointers.delete(event.pointerId);
		if (container.hasPointerCapture(event.pointerId))
			container.releasePointerCapture(event.pointerId);
		map.fire("mouseup", payload(event));
		if (pinching) {
			finish();
			pinching = false;
			const p = pointers.values().next().value;
			if (p) {
				dragStart = point(p);
				dragCenter = map.project(map.getCenter());
				pending = new Point(0, 0);
				begin(false);
			}
			return;
		}
		if (!moved && event.type === "pointerup") map.fire("click", payload(event));
		if (
			active &&
			moved &&
			event.type === "pointerup" &&
			!reduced() &&
			Math.hypot(velocity.x, velocity.y) > 0.05
		) {
			inertia = true;
			schedule();
		} else finish();
	}
	function onKey(event: KeyboardEvent) {
		if (
			excluded(event) ||
			event.defaultPrevented ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return;
		const arrows: Record<string, number[]> = {
			ArrowLeft: [-80, 0],
			ArrowRight: [80, 0],
			ArrowUp: [0, -80],
			ArrowDown: [0, 80],
		};
		if (arrows[event.key]) {
			event.preventDefault();
			finish();
			map.setView(
				map.unproject(map.project(map.getCenter()).add(arrows[event.key])),
			);
		} else if (["+", "=", "-", "_"].includes(event.key)) {
			event.preventDefault();
			finish();
			map.setView(
				map.getCenter(),
				map.getZoom() + (event.key === "-" || event.key === "_" ? -0.25 : 0.25),
			);
		}
	}
	function onDouble(event: MouseEvent) {
		if (excluded(event) || event.defaultPrevented) return;
		event.preventDefault();
		finish();
		const cursor = map.mouseEventToContainerPoint(event),
			zoom = Math.min(map.getMaxZoom(), map.getZoom() + 1);
		map.setView(
			map.unproject(
				map
					.project(map.containerPointToLatLng(cursor), zoom)
					.subtract(cursor.subtract(map.getSize().divideBy(2))),
				zoom,
			),
			zoom,
		);
	}
	function cancelPointers() {
		const captured = [...pointers.keys()];
		pointers.clear();
		for (const id of captured)
			if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
		pinching = false;
		finish();
		map.fire("mouseup");
	}
	container.addEventListener("wheel", onWheel, { passive: false });
	container.addEventListener("pointerdown", onDown);
	container.addEventListener("pointermove", onMove);
	container.addEventListener("pointerup", onUp);
	container.addEventListener("pointercancel", onUp);
	container.addEventListener("lostpointercapture", onUp);
	container.addEventListener("keydown", onKey);
	container.addEventListener("dblclick", onDouble);
	container.addEventListener("blur", cancelPointers);
	map.on("camerareset", cancelPointers);
	map.on("resize", cancelPointers);
	const destroy = () => {
		cancelPointers();
		container.removeEventListener("wheel", onWheel);
		container.removeEventListener("pointerdown", onDown);
		container.removeEventListener("pointermove", onMove);
		container.removeEventListener("pointerup", onUp);
		container.removeEventListener("pointercancel", onUp);
		container.removeEventListener("lostpointercapture", onUp);
		container.removeEventListener("keydown", onKey);
		container.removeEventListener("dblclick", onDouble);
		container.removeEventListener("blur", cancelPointers);
		map.off("camerareset", cancelPointers);
		map.off("resize", cancelPointers);
	};
	map.on("unload", destroy);
	return { finish, destroy };
}
