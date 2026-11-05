import {
	createAdminRegionsLoader,
	intersectsAdminBounds,
} from "./admin-regions.js";
import { getLanguage } from "./i18n.js";

const loader = createAdminRegionsLoader();

/** Drop viewport-specific paths and suppress callbacks belonging to a removed layer. */
export function clearAdminRegionDrawing(layer) {
	layer._adminRegionDrawing = null;
	layer._adminRegionRequest = null;
	layer._adminRegionLabelBoxes = [];
}

function projectedRegions(regions, frame) {
	const outline = new Path2D();
	const visible = [];
	const allowed = frame.allowedCountryCodes
		? new Set(frame.allowedCountryCodes)
		: null;
	for (const region of regions) {
		if (allowed && !allowed.has(region.country)) continue;
		if (!intersectsAdminBounds(region.bbox, frame.viewBounds)) continue;
		for (const ring of region.rings) {
			let previousLongitude;
			for (let i = 0; i < ring.length; i += 2) {
				const longitude = ring[i];
				const point = frame.project(ring[i + 1], longitude);
				if (i === 0 || Math.abs(longitude - previousLongitude) > 180)
					outline.moveTo(point.x, point.y);
				else outline.lineTo(point.x, point.y);
				previousLongitude = longitude;
			}
		}
		const [west, south, east, north] = region.bbox;
		const nw = frame.project(north, west);
		const se = frame.project(south, east);
		visible.push({
			region,
			point: frame.project(region.anchor[1], region.anchor[0]),
			width: Math.abs(se.x - nw.x),
			height: Math.abs(se.y - nw.y),
		});
	}
	// Large regions claim label space first; a fixed tie breaker avoids flicker.
	visible.sort(
		(a, b) =>
			b.width * b.height - a.width * a.height ||
			a.region.id.localeCompare(b.region.id),
	);
	return { outline, visible };
}

function placeLabels(drawing, frame, language) {
	const labels = [];
	const { ctx, mapSize } = frame;
	ctx.font = "500 10px sans-serif";
	for (const { region, point, width, height } of drawing.visible) {
		if (labels.length >= 80) break;
		if (width < 55 || height < 30) continue;
		const text = region.names[language] || region.names.en;
		if (!text) continue;
		const labelWidth = ctx.measureText(text).width;
		if (labelWidth > width * 1.2) continue;
		const box = {
			left: point.x - labelWidth / 2 - 4,
			right: point.x + labelWidth / 2 + 4,
			top: point.y - 9,
			bottom: point.y + 9,
		};
		if (
			box.left < 4 ||
			box.right > mapSize.x - 4 ||
			box.top < 85 ||
			box.bottom > mapSize.y - 12
		)
			continue;
		if (
			labels.some(
				({ box: other }) =>
					box.left < other.right &&
					box.right > other.left &&
					box.top < other.bottom &&
					box.bottom > other.top,
			)
		)
			continue;
		labels.push({ text, point, box });
	}
	return labels;
}

/** Draw geographic divisions on the existing surface without changing simulation provinces. */
export function drawAdminRegions(frame) {
	this._adminRegionLabelBoxes = [];
	if (!frame.enabled || frame.isCustomTerrain || frame.currentZoom < 4) return;
	const data = loader.data;
	if (!data) {
		if (!this._adminRegionRequest) {
			const request = loader.load();
			if (request) {
				const token = { promise: request };
				this._adminRegionRequest = token;
				request.then((regions) => {
					if (this._adminRegionRequest !== token) return;
					this._adminRegionRequest = null;
					if (regions) frame.onReady?.();
				});
			}
		}
		return;
	}
	if (
		this._adminRegionDrawing?.viewportKey !== frame.viewportKey ||
		this._adminRegionDrawing?.allowedCountryCodes !==
			frame.allowedCountryCodes ||
		this._adminRegionDrawing?.data !== data
	) {
		this._adminRegionDrawing = {
			viewportKey: frame.viewportKey,
			allowedCountryCodes: frame.allowedCountryCodes,
			data,
			...projectedRegions(data, frame),
		};
	}
	const drawing = this._adminRegionDrawing;
	const { ctx } = frame;
	ctx.save();
	ctx.setLineDash([6, 3]);
	ctx.lineWidth = 2.6;
	ctx.strokeStyle = "rgba(14, 22, 29, 0.8)";
	ctx.stroke(drawing.outline);
	ctx.lineWidth = 1.2;
	ctx.strokeStyle = "rgba(235, 241, 245, 0.85)";
	ctx.stroke(drawing.outline);
	ctx.setLineDash([]);
	if (frame.showLabels !== false && frame.currentZoom >= 5.3) {
		const language = getLanguage();
		if (drawing.language !== language) {
			drawing.labels = placeLabels(drawing, frame, language);
			drawing.language = language;
		}
		ctx.font = "500 10px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(12, 20, 28, 0.8)";
		ctx.fillStyle = "rgba(225, 234, 240, 0.9)";
		for (const { text, point } of drawing.labels) {
			ctx.strokeText(text, point.x, point.y);
			ctx.fillText(text, point.x, point.y);
		}
		this._adminRegionLabelBoxes = drawing.labels.map(({ box }) => box);
	}
	ctx.restore();
}
