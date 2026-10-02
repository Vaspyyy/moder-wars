import { bindCameraInput } from "./camera-input.ts";
import type { CameraOptions } from "./map-camera.ts";
import { Events, MapCamera } from "./map-camera.ts";
import type { BoundsLike, LatLngLike, Point } from "./map-projection.ts";
import { geoJSON, latLng, latLngBounds, point } from "./map-projection.ts";
export class MapLayer extends Events {
	onAdd?(map: MapCamera): void;
	onRemove?(map: MapCamera): void;
	addTo(map: MapCamera) {
		map.addLayer(this);
		return this;
	}
	static extend(methods: object) {
		class Layer extends MapLayer {}
		Object.assign(Layer.prototype, methods);
		return Layer;
	}
}
class ReferenceImage extends MapLayer {
	private bounds;
	private image: HTMLImageElement;
	constructor(
		url: string,
		bounds: BoundsLike,
		private options: { opacity?: number } = {},
	) {
		super();
		this.bounds = latLngBounds(bounds);
		this.image = new Image();
		this.image.crossOrigin = "anonymous";
		this.image.onload = () => this.fire("load");
		this.image.src = url;
	}
	private notify?: () => void;
	onAdd(map: MapCamera) {
		this.notify = () => map.fire("referencechange");
		this.on("change load", this.notify);
	}
	onRemove() {
		if (this.notify) this.off("change load", this.notify);
		this.notify = undefined;
	}

	getBounds() {
		return this.bounds;
	}
	getElement() {
		return this.image;
	}
	setBounds(bounds: BoundsLike) {
		this.bounds = latLngBounds(bounds);
		this.fire("change");
		return this;
	}
	setOpacity(value: number) {
		this.options.opacity = value;
		this.fire("change");
		return this;
	}
}
interface IconOptions {
	className: string;
	html: string;
	iconSize: number[];
	iconAnchor: number[];
}
class ReferenceHandle extends MapLayer {
	private position;
	private element?: HTMLElement;
	private disposers: Array<() => void> = [];
	constructor(
		position: LatLngLike,
		private options: { icon: IconOptions; draggable?: boolean },
	) {
		super();
		this.position = latLng(position);
	}
	getLatLng() {
		return this.position;
	}
	onAdd(map: MapCamera) {
		const element = document.createElement("div");
		this.element = element;
		element.className = this.options.icon.className;
		element.innerHTML = this.options.icon.html;
		element.style.position = "absolute";
		element.style.zIndex = "450";
		element.style.touchAction = "none";
		element.style.cursor = "move";
		map.getContainer().appendChild(element);
		const update = () => {
			const p = map.latLngToContainerPoint(this.position);
			element.style.transform = `translate(${p.x - this.options.icon.iconAnchor[0]}px,${p.y - this.options.icon.iconAnchor[1]}px)`;
		};
		map.on("move zoomanim resize", update);
		this.disposers.push(() => map.off("move zoomanim resize", update));
		update();
		let pointer: number | null = null,
			offset: Point | null = null;
		const down = (event: PointerEvent) => {
			if (event.button !== 0 || !this.options.draggable) return;
			event.stopPropagation();
			pointer = event.pointerId;
			offset = map
				.mouseEventToContainerPoint(event)
				.subtract(map.latLngToContainerPoint(this.position));
			element.setPointerCapture(pointer);
			this.fire("dragstart");
		};
		const move = (event: PointerEvent) => {
			if (event.pointerId !== pointer || !offset) return;
			event.stopPropagation();
			this.position = map.containerPointToLatLng(
				map.mouseEventToContainerPoint(event).subtract(offset),
			);
			update();
			this.fire("drag");
		};
		const up = (event: PointerEvent) => {
			if (event.pointerId !== pointer) return;
			event.stopPropagation();
			pointer = null;
			this.fire("dragend");
		};
		element.addEventListener("pointerdown", down);
		element.addEventListener("pointermove", move);
		element.addEventListener("pointerup", up);
		element.addEventListener("pointercancel", up);
		element.addEventListener("lostpointercapture", up);
		this.disposers.push(() => {
			element.removeEventListener("pointerdown", down);
			element.removeEventListener("pointermove", move);
			element.removeEventListener("pointerup", up);
			element.removeEventListener("pointercancel", up);
			element.removeEventListener("lostpointercapture", up);
			if (pointer !== null) map.dragging.enable();
		});
	}
	onRemove() {
		for (const dispose of this.disposers) dispose();
		this.disposers = [];
		this.element?.remove();
	}
}
export const mapRuntime = {
	map: (id: string, options: CameraOptions) => {
		const container = document.getElementById(id);
		if (!container) throw new Error(`Missing map container ${id}`);
		const map = new MapCamera(container, options);
		bindCameraInput(map);
		return map;
	},
	latLng,
	latLngBounds,
	geoJSON,
	point,
	Layer: MapLayer,
	imageOverlay: (
		url: string,
		bounds: BoundsLike,
		options: { opacity?: number },
	) => new ReferenceImage(url, bounds, options),
	divIcon: (options: IconOptions) => options,
	marker: (
		position: LatLngLike,
		options: { icon: IconOptions; draggable?: boolean },
	) => new ReferenceHandle(position, options),
	DomUtil: {
		create: (tag: string, className: string) => {
			const element = document.createElement(tag);
			element.className = className;
			return element;
		},
		setTransform: (element: HTMLElement, offset: Point, scale: number) => {
			element.style.transform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`;
		},
	},
};
export default mapRuntime;
