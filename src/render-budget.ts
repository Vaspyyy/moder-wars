// All map surfaces share this budget, including Canvas overlays and GPU masks.
// Eight full-size RGBA surfaces at this limit use about 61 MiB before driver
// copies, geometry and simulation state. This is not a process-memory limit.
export const MAX_RENDER_PIXELS = 2_000_000;
export const MAX_RENDER_EDGE = 4096;
export const MAX_RENDER_DPR = 2;

export function getRenderBudget(
	width: number,
	height: number,
	requestedDpr = 1,
	buffered = true,
) {
	const viewportWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
	const viewportHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
	const padding = buffered
		? viewportWidth <= 768 || viewportHeight <= 480
			? 96
			: 192
		: 0;
	const cssWidth = viewportWidth + padding * 2;
	const cssHeight = viewportHeight + padding * 2;
	const nativeDpr =
		Number.isFinite(requestedDpr) && requestedDpr > 0 ? requestedDpr : 1;
	const dpr = Math.min(
		nativeDpr,
		MAX_RENDER_DPR,
		Math.sqrt(MAX_RENDER_PIXELS / (cssWidth * cssHeight)),
		MAX_RENDER_EDGE / Math.max(cssWidth, cssHeight),
	);
	return {
		dpr,
		padding,
		width: Math.max(1, Math.floor(cssWidth * dpr)),
		height: Math.max(1, Math.floor(cssHeight * dpr)),
	};
}
