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
export function paintClippedFlag(
	ctx,
	image,
	x,
	y,
	width,
	height,
	viewWidth,
	viewHeight,
) {
	const left = Math.max(0, x),
		top = Math.max(0, y);
	const right = Math.min(viewWidth, x + width),
		bottom = Math.min(viewHeight, y + height);
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
