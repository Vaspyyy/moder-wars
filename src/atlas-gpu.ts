import "pixi.js/unsafe-eval";
import type { FillInput } from "pixi.js";
import {
	Container,
	FillGradient,
	Graphics,
	Sprite,
	Texture,
	WebGLRenderer,
} from "pixi.js";
import type { Material, PoliticalChunk } from "./atlas-scene.ts";
import { buildChunkShapes, RetainedChunkScene } from "./atlas-scene.ts";
import type { MapCamera } from "./map-camera.ts";
import { project } from "./map-projection.ts";

interface GpuFrame {
	CONFIG: { GRID_RES: number };
	politicalStyleKey: string;
	disableCountryGradient: boolean;
	countryMetadata: Array<{ bounds?: { minY: number; maxY: number } } | null>;
	viewportKey: string;
	mapResolution: string;
	currentZoom: number;
	padding: number;
	dpr: number;
}
interface Marker {
	id: number;
	lat: number;
	lng: number;
	isAtSea?: boolean;
}
/** Countries are persistent GPU geometry. Canvas overlays are independently cached. */
export class AtlasGpuLayer {
	readonly canvas: HTMLCanvasElement;
	readonly markerCanvas: HTMLCanvasElement;
	private renderer?: WebGLRenderer;
	private markerRenderer?: WebGLRenderer;
	private world = new Container({ isRenderGroup: true });
	private countries = new Container();
	private markers = new Container({ isRenderGroup: true });
	private scene: RetainedChunkScene<Graphics>;
	private fills = new Map<number, FillInput>();
	private frame?: GpuFrame;
	private materials: Material[] = [];
	private mask?: Sprite;
	private maskKey = "";
	private markerPool = new Map<number, Sprite>();
	private flagTextures = new Map<HTMLImageElement, Texture>();
	private visibleMarkers = new Set<number>();
	ready = false;
	active = false;
	private destroyed = false;
	private scale = 1;
	constructor(
		private map: MapCamera,
		private invalidate: () => void,
	) {
		this.canvas = document.createElement("canvas");
		this.markerCanvas = document.createElement("canvas");
		for (const [canvas, z] of [
			[this.canvas, 399],
			[this.markerCanvas, 401],
		] as const) {
			canvas.className = "mw-gpu-surface";
			Object.assign(canvas.style, {
				position: "absolute",
				left: "0",
				top: "0",
				pointerEvents: "none",
				zIndex: String(z),
				display: "none",
			});
			map.getContainer().appendChild(canvas);
		}
		this.world.addChild(this.countries);
		this.scene = new RetainedChunkScene(
			(chunk) => this.build(chunk),
			(object) => object.destroy({ children: true }),
		);
		void this.initialize();
	}
	private async initialize() {
		try {
			const size = this.map.getSize(),
				resolution = window.devicePixelRatio || 1;
			const renderer = new WebGLRenderer(),
				markers = new WebGLRenderer();
			this.renderer = renderer;
			this.markerRenderer = markers;
			await renderer.init({
				canvas: this.canvas,
				width: size.x,
				height: size.y,
				resolution,
				autoDensity: true,
				antialias: true,
				backgroundAlpha: 0,
			});
			await markers.init({
				canvas: this.markerCanvas,
				width: size.x,
				height: size.y,
				resolution,
				autoDensity: true,
				antialias: true,
				backgroundAlpha: 0,
			});
			if (this.destroyed) {
				renderer.destroy();
				markers.destroy();
				return;
			}
			this.ready = true;
			this.canvas.addEventListener("webglcontextlost", this.onLost);
			this.markerCanvas.addEventListener("webglcontextlost", this.onLost);
			this.canvas.addEventListener("webglcontextrestored", this.onRestored);
			this.markerCanvas.addEventListener(
				"webglcontextrestored",
				this.onRestored,
			);
			this.invalidate();
		} catch (error) {
			this.ready = false;
			this.canvas.style.display = "none";
			this.markerCanvas.style.display = "none";
			console.warn("Atlas uses Canvas rendering on this device:", error);
			this.invalidate();
		}
	}
	private onLost = () => {
		this.ready = false;
		this.setActive(false);
		this.invalidate();
	};
	private onRestored = () => {
		this.ready =
			!!this.renderer?.gl &&
			!!this.markerRenderer?.gl &&
			!this.renderer.gl.isContextLost() &&
			!this.markerRenderer.gl.isContextLost();
		this.invalidate();
	};
	setActive(value: boolean) {
		this.active = value && this.ready;
		this.canvas.style.display = this.active ? "" : "none";
		this.markerCanvas.style.display = this.active ? "" : "none";
		if (!this.active) {
			for (const sprite of this.markerPool.values()) sprite.visible = false;
		}
	}
	setCamera(present = true) {
		if (!this.ready || !this.active) return;
		const size = this.map.getSize(),
			transform = this.map.getWorldTransform();
		this.scale = transform.scale;
		for (const renderer of [this.renderer, this.markerRenderer])
			if (
				renderer &&
				(renderer.width !== Math.round(size.x * renderer.resolution) ||
					renderer.height !== Math.round(size.y * renderer.resolution))
			)
				renderer.resize(size.x, size.y);
		for (const root of [this.world, this.markers]) {
			root.position.set(transform.x, transform.y);
			root.scale.set(transform.scale);
		}
		for (const sprite of this.markerPool.values()) {
			sprite.width = (7 * 1.3 ** (this.map.getZoom() - 3)) / this.scale;
			sprite.height = (4.5 * 1.3 ** (this.map.getZoom() - 3)) / this.scale;
		}
		if (present) this.render();
	}
	private fill(id: number): FillInput {
		const cached = this.fills.get(id);
		if (cached) return cached;
		const material = this.materials[id];
		if (!material) return 0x969696;
		let fill: FillInput = { color: material.fill };
		const bounds = this.frame?.countryMetadata[material.countryId - 1]?.bounds;
		if (!this.frame?.disableCountryGradient && bounds) {
			const res = this.frame?.CONFIG.GRID_RES ?? 0.15;
			const top = project([bounds.minY * res - 90, 0]).y,
				bottom = project([bounds.maxY * res - 90, 0]).y;
			if (Math.abs(top - bottom) > 1e-9) {
				const { r, g, b, alpha } = material;
				fill = new FillGradient({
					start: { x: 0, y: top },
					end: { x: 0, y: bottom },
					textureSpace: "global",
					colorStops: [
						{
							offset: 0,
							color: `rgba(${Math.min(255, r + 8)},${Math.min(255, g + 8)},${Math.min(255, b + 8)},${alpha})`,
						},
						{ offset: 0.3, color: material.fill },
						{
							offset: 1,
							color: `rgba(${Math.floor(r * 0.92)},${Math.floor(g * 0.92)},${Math.floor(b * 0.92)},${alpha})`,
						},
					],
				});
			}
		}
		this.fills.set(id, fill);
		return fill;
	}
	private build(chunk: PoliticalChunk) {
		const graphics = new Graphics();
		const shapes = buildChunkShapes(chunk, this.frame?.CONFIG.GRID_RES ?? 0.15);
		const groups = new Map<number, number[][]>();
		for (const shape of shapes) {
			const group = groups.get(shape.material) ?? [];
			group.push(shape.points);
			groups.set(shape.material, group);
		}
		for (const [id, polygons] of groups) {
			for (const points of polygons) graphics.poly(points);
			graphics.fill(this.fill(id));
		}
		this.countries.addChild(graphics);
		return graphics;
	}
	updateChunks(
		chunks: PoliticalChunk[],
		materials: Material[],
		frame: GpuFrame,
		coast: Path2D | null,
	) {
		this.frame = frame;
		this.materials = materials;
		const style = `${frame.politicalStyleKey}:${frame.disableCountryGradient}:${frame.CONFIG.GRID_RES}:${Boolean(coast)}:${frame.countryMetadata.map((meta) => `${meta?.bounds?.minY}:${meta?.bounds?.maxY}`).join(";")}`;
		if (this.scene.prepare(style)) {
			for (const fill of this.fills.values())
				if (fill instanceof FillGradient) fill.destroy();
			this.fills.clear();
		}
		for (const object of this.scene.values()) object.visible = false;
		const visible = new Set(chunks);
		for (const chunk of chunks) this.scene.get(chunk).visible = true;
		this.scene.trim(visible);
		const maskKey = coast ? `${frame.viewportKey}:${frame.mapResolution}` : "";
		if (maskKey !== this.maskKey) {
			this.maskKey = maskKey;
			this.mask?.destroy({ texture: true, textureSource: true });
			this.mask = undefined;
			this.countries.mask = null;
			if (coast) {
				const size = this.map.getSize(),
					padding = frame.padding,
					canvas = document.createElement("canvas");
				canvas.width = Math.ceil((size.x + padding * 2) * frame.dpr);
				canvas.height = Math.ceil((size.y + padding * 2) * frame.dpr);
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.scale(frame.dpr, frame.dpr);
					ctx.translate(padding, padding);
					ctx.fillStyle = "white";
					ctx.fill(coast);
					const mask = new Sprite(Texture.from(canvas));
					const transform = this.map.getWorldTransform();
					mask.position.set(
						(-padding - transform.x) / transform.scale,
						(-padding - transform.y) / transform.scale,
					);
					mask.width = (size.x + padding * 2) / transform.scale;
					mask.height = (size.y + padding * 2) / transform.scale;
					this.world.addChild(mask);
					this.mask = mask;
					this.countries.mask = mask;
				}
			}
		}
		this.setCamera(false);
	}
	beginMarkers() {
		this.visibleMarkers.clear();
	}
	marker(unit: Marker, flag: HTMLImageElement | null, color: string) {
		if (!this.active || unit.isAtSea) return false;
		let sprite = this.markerPool.get(unit.id);
		if (!sprite) {
			sprite = new Sprite(Texture.WHITE);
			sprite.anchor.set(0.5);
			this.markers.addChild(sprite);
			this.markerPool.set(unit.id, sprite);
		}
		if (flag?.complete && flag.naturalWidth > 0 && !unit.isAtSea) {
			let texture = this.flagTextures.get(flag);
			if (!texture) {
				texture = Texture.from(flag);
				this.flagTextures.set(flag, texture);
			}
			sprite.texture = texture;
			sprite.tint = 0xffffff;
		} else {
			sprite.texture = Texture.WHITE;
			sprite.tint = color;
		}
		const p = project([unit.lat, unit.lng]);
		sprite.position.set(p.x, p.y);
		sprite.width = (7 * 1.3 ** (this.map.getZoom() - 3)) / this.scale;
		sprite.height = (4.5 * 1.3 ** (this.map.getZoom() - 3)) / this.scale;
		sprite.visible = true;
		this.visibleMarkers.add(unit.id);
		return true;
	}
	endMarkers() {
		for (const [id, sprite] of this.markerPool) {
			if (!this.visibleMarkers.has(id)) {
				sprite.destroy();
				this.markerPool.delete(id);
			}
		}
	}
	render() {
		if (!this.active) return;
		try {
			this.renderer?.render(this.world);
			this.markerRenderer?.render(this.markers);
		} catch (error) {
			this.ready = false;
			this.setActive(false);
			console.warn("Atlas returns to Canvas rendering:", error);
			this.invalidate();
		}
	}
	destroy() {
		this.destroyed = true;
		for (const canvas of [this.canvas, this.markerCanvas]) {
			canvas.removeEventListener("webglcontextlost", this.onLost);
			canvas.removeEventListener("webglcontextrestored", this.onRestored);
		}
		this.scene.clear();
		for (const fill of this.fills.values())
			if (fill instanceof FillGradient) fill.destroy();
		for (const texture of this.flagTextures.values()) texture.destroy(true);
		this.world.destroy({ children: true });
		this.markers.destroy({ children: true });
		this.renderer?.destroy();
		this.markerRenderer?.destroy();
		this.canvas.remove();
		this.markerCanvas.remove();
	}
}
