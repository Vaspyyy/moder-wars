import type { BoundsLike, LatLngLike, PointLike } from "./map-projection.ts";
import {
	Bounds,
	latLng,
	latLngBounds,
	Point,
	point,
	project,
	unproject,
} from "./map-projection.ts";
export interface CameraEvent {
	type: string;
	target: MapCamera | object;
	center?: { lat: number; lng: number };
	zoom?: number;
	latlng?: { lat: number; lng: number };
	originalEvent?: Event;
	smoothZoom?: boolean;
}
type Listener = { callback: (event: CameraEvent) => void; context?: object };
export interface CameraOptions {
	center?: LatLngLike;
	zoom?: number;
	minZoom?: number;
	maxZoom?: number;
	dragging?: boolean;
	maxBounds?: BoundsLike;
}
export class Events {
	private listeners = new Map<string, Listener[]>();
	on(types: string, callback: Listener["callback"], context?: object) {
		for (const type of types.split(/\s+/)) {
			const list = this.listeners.get(type) ?? [];
			list.push({ callback, context });
			this.listeners.set(type, list);
		}
		return this;
	}
	off(types: string, callback: Listener["callback"], context?: object) {
		for (const type of types.split(/\s+/))
			this.listeners.set(
				type,
				(this.listeners.get(type) ?? []).filter(
					(item) => item.callback !== callback || item.context !== context,
				),
			);
		return this;
	}
	fire(type: string, data: Partial<CameraEvent> = {}) {
		const event = { ...data, type, target: data.target ?? this };
		for (const item of [...(this.listeners.get(type) ?? [])])
			item.callback.call(item.context, event);
		return this;
	}
}
export interface CameraLayer {
	onAdd?(map: MapCamera): void;
	onRemove?(map: MapCamera): void;
}
export class MapCamera extends Events {
	private center;
	private zoom;
	private size: Point;
	private bounds: Bounds | null = null;
	private layers = new Set<CameraLayer>();
	private panes = new Map<string, HTMLElement>();
	private observer?: ResizeObserver;
	readonly dragging: {
		enabled: () => boolean;
		enable: () => void;
		disable: () => void;
	};
	constructor(
		private container: HTMLElement,
		public options: CameraOptions = {},
	) {
		super();
		this.center = latLng(options.center ?? [20, 0]);
		this.zoom = options.zoom ?? 3;
		this.size = new Point(container.clientWidth, container.clientHeight);
		let dragging = options.dragging !== false;
		this.dragging = {
			enabled: () => dragging,
			enable: () => {
				dragging = true;
			},
			disable: () => {
				dragging = false;
			},
		};
		container.classList.add("mw-map");
		container.tabIndex = 0;
		if (typeof ResizeObserver !== "undefined") {
			this.observer = new ResizeObserver(() => this.resize());
			this.observer.observe(container);
		}
		if (options.maxBounds) this.setMaxBounds(options.maxBounds);
	}
	getContainer() {
		return this.container;
	}
	getCenter() {
		return latLng(this.center);
	}
	getZoom() {
		return this.zoom;
	}
	getSize() {
		return point(this.size);
	}
	getMinZoom() {
		return this.options.minZoom ?? 2;
	}
	getMaxZoom() {
		return this.options.maxZoom ?? 12;
	}
	getZoomScale(to: number, from: number) {
		return 2 ** (to - from);
	}
	project(value: LatLngLike, zoom = this.zoom) {
		return project(value, zoom);
	}
	unproject(value: PointLike, zoom = this.zoom) {
		return unproject(value, zoom);
	}
	latLngToContainerPoint(value: LatLngLike) {
		return project(value, this.zoom)
			.subtract(project(this.center, this.zoom))
			.add(this.size.divideBy(2));
	}
	containerPointToLatLng(value: PointLike) {
		return unproject(
			point(value)
				.subtract(this.size.divideBy(2))
				.add(project(this.center, this.zoom)),
			this.zoom,
		);
	}
	mouseEventToContainerPoint(event: MouseEvent) {
		const rect = this.container.getBoundingClientRect();
		return new Point(event.clientX - rect.left, event.clientY - rect.top);
	}
	getBounds() {
		return new Bounds([
			this.containerPointToLatLng([0, this.size.y]),
			this.containerPointToLatLng([this.size.x, 0]),
		]);
	}
	/** Matrix from immutable zoom-zero world coordinates to viewport pixels. */
	getWorldTransform() {
		const scale = 2 ** this.zoom,
			center = project(this.center, 0);
		return {
			scale,
			x: this.size.x / 2 - center.x * scale,
			y: this.size.y / 2 - center.y * scale,
		};
	}
	private limit(value: LatLngLike, zoom: number) {
		const p = project(value, zoom),
			size = 256 * 2 ** zoom;
		const bounds =
			this.bounds ??
			new Bounds([
				[-85.0511287798066, -180],
				[85.0511287798066, 180],
			]);
		const a = project(bounds.getNorthWest(), zoom),
			b = project(bounds.getSouthEast(), zoom);
		const clamp = (n: number, low: number, high: number, half: number) =>
			high - low < half * 2
				? (low + high) / 2
				: Math.max(low + half, Math.min(high - half, n));
		p.x = clamp(p.x, a.x, b.x, this.size.x / 2);
		p.y = clamp(p.y, a.y, b.y, this.size.y / 2);
		p.y = Math.max(0, Math.min(size, p.y));
		return unproject(p, zoom);
	}
	beginGesture(zoom = false) {
		this.fire("movestart");
		if (zoom) this.fire("zoomstart");
	}
	updateGesture(value: LatLngLike, zoom = this.zoom, zooming = false) {
		if (!Number.isFinite(zoom)) return;
		const center = latLng(value);
		if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
		this.zoom = Math.max(this.getMinZoom(), Math.min(this.getMaxZoom(), zoom));
		this.center = this.limit(center, this.zoom);
		if (zooming)
			this.fire("zoomanim", {
				center: this.getCenter(),
				zoom: this.zoom,
				smoothZoom: true,
			});
		this.fire("move");
	}
	endGesture(zoom = false) {
		if (zoom) {
			this.fire("zoom");
			this.fire("zoomend");
		}
		this.fire("moveend");
	}
	setView(value: LatLngLike, zoom = this.zoom) {
		this.fire("camerareset");
		const changed = zoom !== this.zoom;
		this.beginGesture(changed);
		this.updateGesture(value, zoom, changed);
		this.endGesture(changed);
		return this;
	}
	fitBounds(value: BoundsLike) {
		const bounds = latLngBounds(value);
		if (!bounds.isValid()) return this;
		const a = project(bounds.getNorthWest()),
			b = project(bounds.getSouthEast());
		const scale = Math.min(
			this.size.x / Math.max(1e-10, b.x - a.x),
			this.size.y / Math.max(1e-10, b.y - a.y),
		);
		return this.setView(unproject(a.add(b).divideBy(2)), Math.log2(scale));
	}
	fitWorld() {
		return this.fitBounds([
			[-85.0511287798066, -180],
			[85.0511287798066, 180],
		]);
	}
	setMaxBounds(value: BoundsLike | null) {
		this.bounds = value ? latLngBounds(value) : null;
		this.options.maxBounds = value ?? undefined;
		this.setView(this.center);
		return this;
	}
	resize() {
		const next = new Point(
			this.container.clientWidth,
			this.container.clientHeight,
		);
		if (next.x === this.size.x && next.y === this.size.y) return;
		this.size = next;
		this.center = this.limit(this.center, this.zoom);
		this.fire("resize");
		this.fire("moveend");
	}
	addLayer(layer: CameraLayer) {
		if (!this.layers.has(layer)) {
			this.layers.add(layer);
			layer.onAdd?.(this);
		}
		return this;
	}
	removeLayer(layer: CameraLayer) {
		if (this.layers.delete(layer)) layer.onRemove?.(this);
		return this;
	}
	createPane(name: string) {
		const existing = this.panes.get(name);
		if (existing) return existing;
		const pane = document.createElement("div");
		pane.className = "mw-map-pane";
		this.container.appendChild(pane);
		this.panes.set(name, pane);
		return pane;
	}
	getPane(name: string) {
		return this.panes.get(name) ?? this.createPane(name);
	}
	destroy() {
		this.fire("unload");
		for (const layer of [...this.layers]) this.removeLayer(layer);
		this.observer?.disconnect();
		for (const pane of this.panes.values()) pane.remove();
	}
}
