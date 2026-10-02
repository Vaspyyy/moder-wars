const FLAG_SPRITE_CACHE_LIMIT = 256;
const FLAG_SPRITE_PIXEL_LIMIT = 4_000_000;
const flagSourceIds = new WeakMap();
const flagLoadWatchers = new WeakMap();
let nextFlagSourceId = 1;

export function resolveRenderFlag(meta, country, onLoad, alliance = false) {
	if (alliance && meta.allianceFlagTempFlag?.complete)
		return meta.allianceFlagTempFlag;
	if (country?.flag?.complete && country.flag.naturalWidth > 0)
		return country.flag;
	if (!meta.tempFlag && meta.flagUrl) {
		meta.tempFlag = new Image();
		meta.tempFlag.crossOrigin = "anonymous";
		meta.tempFlag.onload = onLoad;
		meta.tempFlag.src = meta.flagUrl;
	}
	return meta.tempFlag?.complete && meta.tempFlag.naturalWidth > 0
		? meta.tempFlag
		: null;
}

function sourceId(image) {
	let id = flagSourceIds.get(image);
	if (!id) {
		id = nextFlagSourceId++;
		flagSourceIds.set(image, id);
	}
	return id;
}

function sourceVersion(image) {
	return (
		image.renderVersion ??
		image._renderVersion ??
		image.version ??
		image.currentSrc ??
		image.src ??
		""
	);
}

function imageSize(image) {
	return [
		image.naturalWidth || image.videoWidth || image.width || 0,
		image.naturalHeight || image.videoHeight || image.height || 0,
	];
}

export function isRenderFlagReady(image) {
	if (!image || image.complete === false) return false;
	const [width, height] = imageSize(image);
	return width > 0 && height > 0;
}

function createCanvas(createSurface) {
	if (typeof createSurface === "function") {
		try {
			return createSurface();
		} catch (_error) {
			return null;
		}
	}
	if (typeof document !== "undefined" && document.createElement)
		return document.createElement("canvas");
	return null;
}

function spriteCache(layer) {
	if (!layer || (typeof layer !== "object" && typeof layer !== "function"))
		return null;
	if (!layer._unitFlagSpriteCache) {
		layer._unitFlagSpriteCache = {
			entries: new Map(),
			pixels: 0,
		};
	}
	return layer._unitFlagSpriteCache;
}

function evictOldestSprite(cache) {
	const oldestKey = cache.entries.keys().next().value;
	if (oldestKey === undefined) return false;
	const oldest = cache.entries.get(oldestKey);
	cache.entries.delete(oldestKey);
	cache.pixels -= oldest.pixelCount;
	return true;
}

/**
 * Return a presized flag marker with its outline baked in. The cache is owned
 * by the renderer layer and bounded by both entry count and pixel count.
 */
export function getUnitFlagSprite(
	layer,
	image,
	width,
	height,
	dpr = 1,
	createSurface,
) {
	if (
		!isRenderFlagReady(image) ||
		!(width > 0) ||
		!(height > 0) ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	)
		return null;
	const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
	const borderWidth = Math.max(0.3, (0.3 / 7) * width);
	const paddingX = borderWidth / 2 + 1 / pixelRatio;
	const paddingY = borderWidth / 2 + 1 / pixelRatio;
	const spriteWidth = width + paddingX * 2;
	const spriteHeight = height + paddingY * 2;
	const pixelWidth = Math.max(1, Math.round(spriteWidth * pixelRatio));
	const pixelHeight = Math.max(1, Math.round(spriteHeight * pixelRatio));
	const pixelCount = pixelWidth * pixelHeight;
	if (pixelCount > FLAG_SPRITE_PIXEL_LIMIT) return null;

	const [sourceWidth, sourceHeight] = imageSize(image);
	const version = sourceVersion(image);
	const key = [
		sourceId(image),
		String(version),
		String(image.complete),
		sourceWidth,
		sourceHeight,
		width,
		height,
		pixelRatio,
	].join("|");
	const cache = spriteCache(layer);
	if (!cache) return null;
	const cached = cache.entries.get(key);
	if (cached) {
		cache.entries.delete(key);
		cache.entries.set(key, cached);
		return cached.sprite;
	}

	const surface = createCanvas(createSurface);
	if (!surface) return null;
	surface.width = pixelWidth;
	surface.height = pixelHeight;
	let ctx;
	try {
		ctx = surface.getContext?.("2d");
	} catch (_error) {
		return null;
	}
	if (!ctx) return null;
	if (typeof ctx.setTransform === "function")
		ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	else if (typeof ctx.scale === "function") ctx.scale(pixelRatio, pixelRatio);
	try {
		ctx.drawImage(image, paddingX, paddingY, width, height);
		ctx.strokeStyle = "rgba(0,0,0,0.3)";
		ctx.lineWidth = borderWidth;
		ctx.strokeRect(paddingX, paddingY, width, height);
	} catch (_error) {
		return null;
	}

	while (
		cache.entries.size >= FLAG_SPRITE_CACHE_LIMIT ||
		cache.pixels + pixelCount > FLAG_SPRITE_PIXEL_LIMIT
	) {
		if (!evictOldestSprite(cache)) break;
	}
	const sprite = { surface, paddingX, paddingY, width, height };
	cache.entries.set(key, { sprite, pixelCount, source: image });
	cache.pixels += pixelCount;
	return sprite;
}

/** Clear cached sprites after an in-place canvas edit or flag asset mutation. */
export function invalidateUnitFlagSprites(layer, source = null) {
	const cache = layer?._unitFlagSpriteCache;
	if (!cache?.entries) return 0;
	let removed = 0;
	for (const [key, entry] of cache.entries) {
		if (source && entry.source !== source) continue;
		cache.entries.delete(key);
		cache.pixels -= entry.pixelCount;
		removed++;
	}
	return removed;
}

/**
 * Register one current repaint callback per renderer and pending image. This
 * also works with simple Node Image stubs that only expose `onload`.
 */
export function watchRenderFlagLoad(image, owner, onLoad) {
	if (!image || typeof onLoad !== "function") return;
	let record = flagLoadWatchers.get(image);
	if (!record) {
		record = { callbacks: new Map(), attached: false };
		flagLoadWatchers.set(image, record);
	}
	record.callbacks.set(owner, onLoad);
	if (record.attached) return;
	record.attached = true;
	const notify = (event) => {
		const current = flagLoadWatchers.get(image);
		if (!current) return;
		flagLoadWatchers.delete(image);
		for (const callback of current.callbacks.values()) callback(event);
	};
	if (typeof image.addEventListener === "function") {
		image.addEventListener("load", notify, { once: true });
		return;
	}
	const previous = image.onload;
	image.onload = function (event) {
		try {
			if (typeof previous === "function") previous.call(this, event);
		} finally {
			notify(event);
		}
	};
}

export function paintClippedFlag(
	ctx,
	image,
	x,
	y,
	width,
	height,
	viewWidth,
	viewHeight,
	padding = 0,
) {
	const min = padding ? -padding : 0;
	const left = Math.max(min, x),
		top = Math.max(min, y);
	const right = Math.min(viewWidth - padding, x + width),
		bottom = Math.min(viewHeight - padding, y + height);
	const w = right - left,
		h = bottom - top;
	if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return;
	const sx = ((left - x) / width) * image.naturalWidth,
		sy = ((top - y) / height) * image.naturalHeight;
	const sw = (w / width) * image.naturalWidth,
		sh = (h / height) * image.naturalHeight;
	if (![sx, sy, sw, sh].every(Number.isFinite) || sw <= 0 || sh <= 0) return;
	ctx.globalAlpha = 0.55;
	ctx.drawImage(image, sx, sy, sw, sh, left, top, w, h);
	ctx.globalAlpha = 1;
}
