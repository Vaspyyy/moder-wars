import "pixi.js/unsafe-eval";
import type { FillInput } from "pixi.js";
import {
	Container,
	Graphics,
	Matrix,
	Sprite,
	Texture,
	WebGLRenderer,
} from "pixi.js";
import type { Material, PoliticalChunk } from "./atlas-scene.ts";
import { buildChunkShapes, RetainedChunkScene } from "./atlas-scene.ts";
import type { MapCamera } from "./map-camera.ts";
import { project } from "./map-projection.ts";
import { getRenderBudget } from "./render-budget.ts";

const GRADIENT_SIZE = 256;
const GRADIENT_TEXTURE_LIMIT = 512;
const FLAG_TEXTURE_LIMIT = 256;

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
type FlagSource = (HTMLImageElement | HTMLCanvasElement | OffscreenCanvas) & {
	renderVersion?: unknown;
	_renderVersion?: unknown;
	version?: unknown;
};
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
	private gradientTextures = new Map<string, Texture>();
	private frame?: GpuFrame;
	private materials: Material[] = [];
	private mask?: Sprite;
	private maskCanvas?: HTMLCanvasElement;
	private maskKey = "";
	private markerPool = new Map<number, Sprite>();
	private flagTextures = new Map<
		FlagSource,
		{ texture: Texture; stamp: string }
	>();
	private visibleMarkers = new Set<number>();
	private visibleFlagTextures = new Set<Texture>();
	ready = false;
	active = false;
	private destroyed = false;
	private scale = 1;
	private markerWidth = 0;
	private markerHeight = 0;
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
			(object) => object.destroy({ children: true, context: true }),
		);
		void this.initialize();
	}
	private async initialize() {
		try {
			const size = this.map.getSize(),
				resolution = getRenderBudget(
					size.x,
					size.y,
					window.devicePixelRatio,
				).dpr;
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
				antialias: false,
				backgroundAlpha: 0,
			});
			if (this.destroyed) {
				this.destroyRenderer(renderer);
				return;
			}
			await markers.init({
				canvas: this.markerCanvas,
				width: size.x,
				height: size.y,
				resolution,
				autoDensity: true,
				antialias: false,
				backgroundAlpha: 0,
			});
			if (this.destroyed) {
				this.destroyRenderer(renderer);
				this.destroyRenderer(markers);
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
			this.destroy();
			console.warn("Atlas uses Canvas rendering on this device:", error);
			this.invalidate();
		}
	}
	private onLost = (event: Event) => {
		// Opt in to restoration explicitly; Pixi does too, but recovery must not
		// depend on its private listener order.
		event.preventDefault();
		this.ready = false;
		this.setActive(false);
		this.invalidate();
	};
	private onRestored = () => {
		if (this.destroyed) return;
		this.ready =
			!!this.renderer?.gl &&
			!!this.markerRenderer?.gl &&
			!this.renderer.gl.isContextLost() &&
			!this.markerRenderer.gl.isContextLost();
		this.invalidate();
	};
	setActive(value: boolean) {
		this.active = value && this.ready && !this.destroyed;
		this.canvas.style.display = this.active ? "" : "none";
		this.markerCanvas.style.display = this.active ? "" : "none";
		if (!this.active) {
			for (const sprite of this.markerPool.values()) sprite.visible = false;
		}
	}
	setCamera(present = true) {
		if (!this.ready || !this.active) return;
		const size = this.map.getSize(),
			transform = this.map.getWorldTransform(),
			padding = this.frame?.padding ?? 0,
			width = size.x + padding * 2,
			height = size.y + padding * 2,
			resolution =
				this.frame?.dpr ??
				getRenderBudget(size.x, size.y, window.devicePixelRatio).dpr;
		this.scale = transform.scale;
		for (const [renderer, canvas] of [
			[this.renderer, this.canvas],
			[this.markerRenderer, this.markerCanvas],
		] as const)
			if (
				renderer &&
				(canvas.width !== Math.round(width * resolution) ||
					canvas.height !== Math.round(height * resolution) ||
					renderer.resolution !== resolution)
			) {
				// Pixi rounds backing pixels, so its CSS screen size can be fractional.
				// Shrink only for a physical resize: Pixi skips restoring the canvas
				// when the requested backing size has not changed.
				if (
					canvas.width !== Math.round(width * resolution) ||
					canvas.height !== Math.round(height * resolution)
				) {
					canvas.width = 1;
					canvas.height = 1;
				}
				renderer.resize(width, height, resolution);
			}
		// Keep the same overscan origin as the Canvas layers. Gesture frames can
		// then move the complete GPU image on the compositor without scene work.
		for (const canvas of [this.canvas, this.markerCanvas]) {
			canvas.style.left = `${-padding}px`;
			canvas.style.top = `${-padding}px`;
		}
		for (const root of [this.world, this.markers]) {
			root.position.set(transform.x + padding, transform.y + padding);
			root.scale.set(transform.scale);
		}
		const markerScale = 1.3 ** (this.map.getZoom() - 3) / this.scale,
			markerWidth = 7 * markerScale,
			markerHeight = 4.5 * markerScale;
		if (
			markerWidth !== this.markerWidth ||
			markerHeight !== this.markerHeight
		) {
			this.markerWidth = markerWidth;
			this.markerHeight = markerHeight;
			for (const sprite of this.markerPool.values()) {
				sprite.width = markerWidth;
				sprite.height = markerHeight;
			}
		}
		if (present) this.render();
	}
	private gradientTexture(material: Material): Texture | null {
		const key = material.fill;
		const cached = this.gradientTextures.get(key);
		if (cached) {
			this.gradientTextures.delete(key);
			this.gradientTextures.set(key, cached);
			return cached;
		}
		if (this.gradientTextures.size >= GRADIENT_TEXTURE_LIMIT) {
			// Every retained chunk uses a fill from this palette. Never evict a
			// texture still referenced by its graphics instructions.
			const used = new Set(
				[...this.fills.values()].flatMap((fill) =>
					typeof fill === "object" && fill && "texture" in fill
						? [fill.texture]
						: [],
				),
			);
			for (const [oldKey, texture] of this.gradientTextures) {
				if (used.has(texture)) continue;
				this.gradientTextures.delete(oldKey);
				texture.destroy(true);
				break;
			}
			if (this.gradientTextures.size >= GRADIENT_TEXTURE_LIMIT) return null;
		}
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = GRADIENT_SIZE;
		const context = canvas.getContext("2d");
		if (!context) return null;
		const { r, g, b, alpha } = material;
		const gradient = context.createLinearGradient(0, 0, 0, GRADIENT_SIZE);
		gradient.addColorStop(
			0,
			`rgba(${Math.min(255, r + 8)},${Math.min(255, g + 8)},${Math.min(255, b + 8)},${alpha})`,
		);
		gradient.addColorStop(0.3, material.fill);
		gradient.addColorStop(
			1,
			`rgba(${Math.floor(r * 0.92)},${Math.floor(g * 0.92)},${Math.floor(b * 0.92)},${alpha})`,
		);
		context.fillStyle = gradient;
		context.fillRect(0, 0, 1, GRADIENT_SIZE);
		const texture = Texture.from(canvas, true);
		// The single column is constant horizontally; clamp only the gradient
		// axis. This also avoids Pixi's automatic repeat conversion for fills.
		texture.source.style.addressModeU = "repeat";
		texture.source.style.addressModeV = "clamp-to-edge";
		this.gradientTextures.set(key, texture);
		return texture;
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
				const texture = this.gradientTexture(material);
				if (texture)
					fill = {
						texture,
						matrix: new Matrix(1, 0, 0, (bottom - top) / GRADIENT_SIZE, 0, top),
						textureSpace: "global",
						color: 0xffffff,
						alpha: 1,
					};
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
	invalidateWorld() {
		if (this.destroyed) return;
		this.scene.clear();
		this.fills.clear();
	}
	invalidateFlagTextures(source: FlagSource | null = null) {
		for (const [flag, entry] of this.flagTextures)
			if (!source || flag === source) entry.stamp = "";
	}
	private flagTexture(flag: FlagSource) {
		if ("complete" in flag && !flag.complete) return null;
		const width = "naturalWidth" in flag ? flag.naturalWidth : flag.width;
		const height = "naturalHeight" in flag ? flag.naturalHeight : flag.height;
		if (!(width > 0 && height > 0)) return null;
		const version =
			flag.renderVersion ??
			flag._renderVersion ??
			flag.version ??
			("currentSrc" in flag ? flag.currentSrc || flag.src : "");
		const stamp = `${width}:${height}:${String(version)}`;
		let entry = this.flagTextures.get(flag);
		if (!entry) {
			entry = { texture: Texture.from(flag, true), stamp };
			this.flagTextures.set(flag, entry);
		} else if (entry.stamp !== stamp) {
			entry.texture.source.resize(width, height);
			entry.texture.source.update();
			entry.stamp = stamp;
		}
		this.flagTextures.delete(flag);
		this.flagTextures.set(flag, entry);
		return entry.texture;
	}
	updateChunks(
		chunks: PoliticalChunk[],
		materials: Material[],
		frame: GpuFrame,
		coast: Path2D | null,
	) {
		if (this.destroyed) return;
		this.frame = frame;
		this.materials = materials;
		const style = `${frame.politicalStyleKey}:${frame.disableCountryGradient}:${frame.CONFIG.GRID_RES}:${Boolean(coast)}:${frame.countryMetadata.map((meta) => `${meta?.bounds?.minY}:${meta?.bounds?.maxY}`).join(";")}`;
		if (this.scene.prepare(style)) {
			this.fills.clear();
		}
		for (const object of this.scene.values()) object.visible = false;
		const visible = new Set(chunks);
		for (const chunk of chunks) this.scene.get(chunk).visible = true;
		this.scene.trim(visible);
		const size = this.map.getSize();
		const maskKey = coast
			? `${frame.viewportKey}:${frame.mapResolution}:${frame.dpr}:${frame.padding}:${size.x}:${size.y}`
			: "";
		if (maskKey !== this.maskKey) {
			this.maskKey = maskKey;
			if (coast) {
				const padding = frame.padding,
					canvas = this.maskCanvas ?? document.createElement("canvas"),
					width = Math.ceil((size.x + padding * 2) * frame.dpr),
					height = Math.ceil((size.y + padding * 2) * frame.dpr);
				this.maskCanvas = canvas;
				if (canvas.width !== width || canvas.height !== height) {
					canvas.width = 0;
					canvas.height = height;
					canvas.width = width;
				}
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.clearRect(0, 0, width, height);
					ctx.save();
					ctx.scale(frame.dpr, frame.dpr);
					ctx.translate(padding, padding);
					ctx.fillStyle = "white";
					ctx.fill(coast);
					ctx.restore();
					let mask = this.mask;
					if (!mask) {
						mask = new Sprite(Texture.from(canvas, true));
						this.world.addChild(mask);
						this.mask = mask;
					} else {
						mask.texture.source.resize(width, height);
						mask.texture.source.update();
					}
					const transform = this.map.getWorldTransform();
					mask.position.set(
						(-padding - transform.x) / transform.scale,
						(-padding - transform.y) / transform.scale,
					);
					mask.width = (size.x + padding * 2) / transform.scale;
					mask.height = (size.y + padding * 2) / transform.scale;
					this.countries.mask = mask;
				}
			} else {
				this.countries.mask = null;
				this.mask?.destroy({ texture: true, textureSource: true });
				if (this.maskCanvas) this.maskCanvas.width = this.maskCanvas.height = 1;
				this.mask = undefined;
				this.maskCanvas = undefined;
			}
		}
		this.setCamera(false);
	}
	beginMarkers() {
		this.visibleMarkers.clear();
		this.visibleFlagTextures.clear();
	}
	marker(unit: Marker, flag: FlagSource | null, color: string) {
		if (!this.active || unit.isAtSea) return false;
		let sprite = this.markerPool.get(unit.id);
		if (!sprite) {
			sprite = new Sprite(Texture.WHITE);
			sprite.anchor.set(0.5);
			this.markers.addChild(sprite);
			this.markerPool.set(unit.id, sprite);
		}
		const texture = flag ? this.flagTexture(flag) : null;
		if (texture) {
			this.visibleFlagTextures.add(texture);
			sprite.texture = texture;
			sprite.tint = 0xffffff;
		} else {
			sprite.texture = Texture.WHITE;
			sprite.tint = color;
		}
		const p = project([unit.lat, unit.lng]);
		sprite.position.set(p.x, p.y);
		sprite.width = this.markerWidth;
		sprite.height = this.markerHeight;
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
		for (const [flag, entry] of this.flagTextures) {
			if (this.flagTextures.size <= FLAG_TEXTURE_LIMIT) break;
			if (this.visibleFlagTextures.has(entry.texture)) continue;
			entry.texture.destroy(true);
			this.flagTextures.delete(flag);
		}
	}
	render() {
		if (!this.active) return;
		try {
			this.renderer?.render(this.world);
			this.markerRenderer?.render(this.markers);
		} catch (error) {
			this.destroy();
			console.warn("Atlas returns to Canvas rendering:", error);
			this.invalidate();
		}
	}
	private destroyRenderer(renderer?: WebGLRenderer) {
		try {
			renderer?.destroy();
		} catch {
			// Initialization can fail before all Pixi systems exist. Continue
			// releasing the remaining renderer, textures and DOM surfaces.
		}
	}
	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.ready = false;
		this.setActive(false);
		for (const canvas of [this.canvas, this.markerCanvas]) {
			canvas.removeEventListener("webglcontextlost", this.onLost);
			canvas.removeEventListener("webglcontextrestored", this.onRestored);
		}
		this.scene.clear();
		this.countries.mask = null;
		this.mask?.destroy({ texture: true, textureSource: true });
		this.mask = undefined;
		if (this.maskCanvas) this.maskCanvas.width = this.maskCanvas.height = 1;
		this.maskCanvas = undefined;
		this.world.destroy({ children: true });
		this.markers.destroy({ children: true });
		for (const texture of this.gradientTextures.values()) texture.destroy(true);
		for (const { texture } of this.flagTextures.values()) texture.destroy(true);
		this.fills.clear();
		this.gradientTextures.clear();
		this.flagTextures.clear();
		this.markerPool.clear();
		this.visibleMarkers.clear();
		this.visibleFlagTextures.clear();
		this.frame = undefined;
		this.materials = [];
		for (const renderer of [this.renderer, this.markerRenderer]) {
			this.destroyRenderer(renderer);
		}
		this.renderer = undefined;
		this.markerRenderer = undefined;
		this.canvas.width = this.canvas.height = 1;
		this.markerCanvas.width = this.markerCanvas.height = 1;
		this.canvas.remove();
		this.markerCanvas.remove();
	}
}
