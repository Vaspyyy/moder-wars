/** Geographic data remains in degrees; drawing uses a normalized Mercator world. */
export type LatLngLike = { lat: number; lng: number } | readonly number[];
export type PointLike = { x: number; y: number } | readonly number[];
export class Point {
	constructor(
		public x: number,
		public y: number,
	) {}
	add(value: PointLike) {
		const p = point(value);
		return new Point(this.x + p.x, this.y + p.y);
	}
	subtract(value: PointLike) {
		const p = point(value);
		return new Point(this.x - p.x, this.y - p.y);
	}
	multiplyBy(value: number) {
		return new Point(this.x * value, this.y * value);
	}
	divideBy(value: number) {
		return this.multiplyBy(1 / value);
	}
}
export function point(value: PointLike): Point {
	return Array.isArray(value)
		? new Point(value[0], value[1])
		: new Point((value as { x: number }).x, (value as { y: number }).y);
}
export class LatLng {
	constructor(
		public lat: number,
		public lng: number,
	) {}
}
export function latLng(value: LatLngLike | number, lng?: number): LatLng {
	if (typeof value === "number") return new LatLng(value, lng ?? 0);
	return Array.isArray(value)
		? new LatLng(value[0], value[1])
		: new LatLng((value as LatLng).lat, (value as LatLng).lng);
}
export const MAX_LATITUDE = 85.0511287798066;
export function project(value: LatLngLike, zoom = 0): Point {
	const p = latLng(value),
		size = 256 * 2 ** zoom;
	const latitude =
		(Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, p.lat)) * Math.PI) / 180;
	return new Point(
		((p.lng + 180) / 360) * size,
		((1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2) * size,
	);
}
export function unproject(value: PointLike, zoom = 0): LatLng {
	const p = point(value),
		size = 256 * 2 ** zoom;
	return new LatLng(
		(Math.atan(Math.sinh(Math.PI * (1 - (2 * p.y) / size))) * 180) / Math.PI,
		(p.x / size) * 360 - 180,
	);
}
export type BoundsLike = Bounds | readonly LatLngLike[];
export class Bounds {
	private south = Infinity;
	private west = Infinity;
	private north = -Infinity;
	private east = -Infinity;
	constructor(values: readonly LatLngLike[] = []) {
		for (const value of values) this.extend(value);
	}
	extend(value: LatLngLike | Bounds) {
		if (value instanceof Bounds) {
			if (value.isValid()) {
				this.extend(value.getSouthWest());
				this.extend(value.getNorthEast());
			}
			return this;
		}
		const p = latLng(value);
		this.south = Math.min(this.south, p.lat);
		this.north = Math.max(this.north, p.lat);
		this.west = Math.min(this.west, p.lng);
		this.east = Math.max(this.east, p.lng);
		return this;
	}
	getSouth() {
		return this.south;
	}
	getNorth() {
		return this.north;
	}
	getWest() {
		return this.west;
	}
	getEast() {
		return this.east;
	}
	getSouthWest() {
		return new LatLng(this.south, this.west);
	}
	getNorthEast() {
		return new LatLng(this.north, this.east);
	}
	getNorthWest() {
		return new LatLng(this.north, this.west);
	}
	getSouthEast() {
		return new LatLng(this.south, this.east);
	}
	getCenter() {
		return new LatLng(
			(this.south + this.north) / 2,
			(this.west + this.east) / 2,
		);
	}
	isValid() {
		return (
			Number.isFinite(this.south) &&
			Number.isFinite(this.west) &&
			Number.isFinite(this.north) &&
			Number.isFinite(this.east)
		);
	}
	contains(value: LatLngLike) {
		const p = latLng(value);
		return (
			p.lat >= this.south &&
			p.lat <= this.north &&
			p.lng >= this.west &&
			p.lng <= this.east
		);
	}
	equals(value: Bounds) {
		return (
			this.south === value.getSouth() &&
			this.north === value.getNorth() &&
			this.west === value.getWest() &&
			this.east === value.getEast()
		);
	}
	pad(ratio: number) {
		const y = (this.north - this.south) * ratio,
			x = (this.east - this.west) * ratio;
		return new Bounds([
			[this.south - y, this.west - x],
			[this.north + y, this.east + x],
		]);
	}
}
export function latLngBounds(
	first: BoundsLike | LatLngLike,
	second?: LatLngLike,
): Bounds {
	if (first instanceof Bounds) return first;
	return new Bounds(
		second ? [first as LatLngLike, second] : (first as readonly LatLngLike[]),
	);
}
/** Bounds only: never create a hidden vector layer or attach geography to the DOM. */
export function geoJSON(feature: {
	geometry?: { coordinates?: unknown };
	features?: unknown[];
}) {
	const bounds = new Bounds();
	function walk(value: unknown) {
		if (!Array.isArray(value)) return;
		if (typeof value[0] === "number" && typeof value[1] === "number")
			bounds.extend([value[1], value[0]]);
		else for (const child of value) walk(child);
	}
	walk(feature.geometry?.coordinates);
	for (const child of feature.features ?? [])
		bounds.extend(geoJSON(child as typeof feature).getBounds());
	return { getBounds: () => bounds };
}
