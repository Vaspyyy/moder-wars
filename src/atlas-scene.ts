import { project } from "./map-projection.ts";
export interface PoliticalChunk {
	polygons: Float32Array;
	rectangles: Float32Array | Uint32Array;
	borders: Float32Array;
	frontlines: Float32Array;
}
export interface Material {
	countryId: number;
	fill: string;
	r: number;
	g: number;
	b: number;
	alpha: number;
}
export interface Shape {
	material: number;
	points: number[];
}
export function buildChunkShapes(
	chunk: PoliticalChunk,
	resolution: number,
): Shape[] {
	const shapes: Shape[] = [];
	const convert = (x: number, y: number) =>
		project([y * resolution - 90, x * resolution - 180]);
	for (let offset = 0; offset < chunk.polygons.length; ) {
		const material = chunk.polygons[offset++],
			count = chunk.polygons[offset++],
			points: number[] = [];
		for (let i = 0; i < count; i++) {
			const p = convert(chunk.polygons[offset++], chunk.polygons[offset++]);
			points.push(p.x, p.y);
		}
		shapes.push({ material, points });
	}
	for (let offset = 0; offset < chunk.rectangles.length; offset += 5) {
		const [material, x, y, width, height] = chunk.rectangles.subarray(
			offset,
			offset + 5,
		);
		const a = convert(x, y),
			b = convert(x + width, y + height);
		shapes.push({ material, points: [a.x, a.y, b.x, a.y, b.x, b.y, a.x, b.y] });
	}
	return shapes;
}
/** Scene objects belong to rendering. Simulation arrays are never mutated. */
export class RetainedChunkScene<T> {
	private objects = new Map<PoliticalChunk, T>();
	private style = "";
	readonly stats = { built: 0, reused: 0, destroyed: 0 };
	constructor(
		private create: (chunk: PoliticalChunk) => T,
		private dispose: (object: T) => void,
		private budget = 4096,
	) {}
	prepare(style: string) {
		if (style !== this.style) {
			this.clear();
			this.style = style;
			return true;
		}
		return false;
	}
	get(chunk: PoliticalChunk) {
		const existing = this.objects.get(chunk);
		if (existing !== undefined) {
			this.objects.delete(chunk);
			this.objects.set(chunk, existing);
			this.stats.reused++;
			return existing;
		}
		const object = this.create(chunk);
		this.objects.set(chunk, object);
		this.stats.built++;
		return object;
	}
	trim(visible: Set<PoliticalChunk>) {
		for (const [chunk, object] of this.objects) {
			if (this.objects.size <= this.budget) break;
			if (visible.has(chunk)) continue;
			this.dispose(object);
			this.objects.delete(chunk);
			this.stats.destroyed++;
		}
	}
	clear() {
		for (const object of this.objects.values()) this.dispose(object);
		this.stats.destroyed += this.objects.size;
		this.objects.clear();
	}
	values() {
		return this.objects.values();
	}
}
