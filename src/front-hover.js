import { collectSoldierFrontGroups } from "./render-soldier-labels.js";

// Hovering near a front shows both sides' troops on it and which way it moves.
const HOVER_RADIUS_PX = 18;
// Troops on the same front within this many degrees of the cursor count.
const TROOP_RADIUS_DEG = 8;
// Control is sampled in a box this many degrees around the hovered point.
const TREND_BOX_DEG = 2.5;
const REFRESH_MS = 500;
const TREND_WINDOW_MS = 4000;

export function createFrontHover(runtime) {
	let tooltip = null;
	let hovered = null;
	let pointer = null;
	let frame = 0;
	let timer = 0;
	let groupsCache = {
		at: -Infinity,
		units: null,
		frontlines: null,
		groups: [],
	};

	function ensureTooltip() {
		if (tooltip) return tooltip;
		tooltip = document.createElement("div");
		tooltip.className = "front-hover hud-surface";
		tooltip.setAttribute("role", "status");
		tooltip.style.display = "none";
		document.body.appendChild(tooltip);
		return tooltip;
	}

	function hide() {
		hovered = null;
		clearInterval(timer);
		timer = 0;
		if (tooltip) tooltip.style.display = "none";
	}

	function isLiveWar() {
		const state = runtime.gameState;
		return state === "SIMULATING" || state?.startsWith("PEACE_SELECT_");
	}

	/** Nearest front point within HOVER_RADIUS_PX of the cursor, on screen. */
	function findFront(latlng, cursor) {
		const map = runtime.map;
		const corner = map.containerPointToLatLng([
			cursor.x + HOVER_RADIUS_PX,
			cursor.y + HOVER_RADIUS_PX,
		]);
		const latSpan = Math.abs(corner.lat - latlng.lat);
		const lngSpan = Math.abs(corner.lng - latlng.lng);
		let best = null;
		let bestDistance = HOVER_RADIUS_PX ** 2;
		for (const [key, polyline] of Object.entries(
			runtime._frontlinePolys || {},
		)) {
			const sides = key.split("_").map(Number);
			if (sides.length !== 2 || !sides.every(Number.isInteger)) continue;
			for (const point of polyline) {
				if (
					Math.abs(point.lat - latlng.lat) > latSpan ||
					Math.abs(point.lng - latlng.lng) > lngSpan
				)
					continue;
				const screen = map.latLngToContainerPoint([point.lat, point.lng]);
				const distance =
					(screen.x - cursor.x) ** 2 + (screen.y - cursor.y) ** 2;
				if (distance < bestDistance) {
					bestDistance = distance;
					best = { key, sides, lat: point.lat, lng: point.lng };
				}
			}
		}
		return best;
	}

	function getGroups(now) {
		const { units, _frontlinePolys: frontlines } = runtime;
		if (
			now - groupsCache.at < REFRESH_MS &&
			groupsCache.units === units &&
			groupsCache.frontlines === frontlines
		)
			return groupsCache.groups;
		const groups = collectSoldierFrontGroups({
			units,
			frontlines,
			sides: runtime.sides,
			soldiersPerUnit: runtime.soldiersPerUnit,
			CONFIG: runtime.CONFIG,
			landMask: runtime.landMask,
			getGridIndex: runtime.getGridIndex,
		});
		groupsCache = { at: now, units, frontlines, groups };
		return groups;
	}

	function sampleControl(front) {
		const res = runtime.CONFIG.GRID_RES;
		const { dominantSideMap, gridWidth, gridHeight } = runtime;
		if (!dominantSideMap || !(res > 0)) return null;
		const span = Math.round(TREND_BOX_DEG / res);
		const cx = Math.floor((front.lng + 180) / res);
		const cy = Math.floor((front.lat + 90) / res);
		const stride = Math.max(1, Math.floor(span / 25));
		const counts = [0, 0];
		for (let y = cy - span; y <= cy + span; y += stride) {
			if (y < 0 || y >= gridHeight) continue;
			for (let x = cx - span; x <= cx + span; x += stride) {
				const side =
					dominantSideMap[y * gridWidth + ((x + gridWidth) % gridWidth)];
				if (side === front.sides[0]) counts[0]++;
				else if (side === front.sides[1]) counts[1]++;
			}
		}
		return counts;
	}

	function render() {
		if (!hovered || !isLiveWar()) return hide();
		const now = performance.now();
		const {
			sides: [a, b],
		} = hovered;
		const totals = [0, 0];
		for (const group of getGroups(now)) {
			if (group.frontKey !== hovered.key) continue;
			const index = group.sideIndex === a ? 0 : group.sideIndex === b ? 1 : -1;
			if (index < 0) continue;
			let deltaLng = Math.abs(group.lng - hovered.lng);
			if (deltaLng > 180) deltaLng = 360 - deltaLng;
			if (Math.hypot(group.lat - hovered.lat, deltaLng) > TROOP_RADIUS_DEG)
				continue;
			totals[index] += group.personnel;
		}
		const counts = sampleControl(hovered);
		if (counts) {
			hovered.samples.push({ at: now, counts });
			while (hovered.samples[0].at < now - TREND_WINDOW_MS)
				hovered.samples.shift();
		}
		const first = hovered.samples[0];
		const last = hovered.samples.at(-1);
		let trend = "Front holding";
		let trendSide = -1;
		if (first && last && last.at - first.at >= REFRESH_MS * 1.5) {
			const share = (c) => c[0] / Math.max(1, c[0] + c[1]);
			const change = share(last.counts) - share(first.counts);
			if (Math.abs(change) >= 0.01) trendSide = change > 0 ? 0 : 1;
		}
		const names = [a, b].map(
			(side) => runtime.getSideDisplayName?.(side) || `Side ${side + 1}`,
		);
		if (trendSide >= 0) trend = `${names[trendSide]} advancing`;
		const format = (value) =>
			runtime.influenceLayer?.formatSoldiers?.(value) ??
			Math.round(value).toLocaleString();
		const color = (side) =>
			(runtime.sideColors?.[side] || "#ccc").replace(
				/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/,
				"rgb($1,$2,$3)",
			);
		const ui = ensureTooltip();
		ui.replaceChildren();
		[0, 1].forEach((index) => {
			const row = document.createElement("div");
			row.className = "front-hover-row";
			const swatch = document.createElement("span");
			swatch.className = "front-hover-swatch";
			swatch.style.background = color([a, b][index]);
			const name = document.createElement("span");
			name.className = "front-hover-name";
			name.textContent = names[index];
			const troops = document.createElement("strong");
			troops.textContent = format(totals[index]);
			row.append(swatch, name, troops);
			ui.append(row);
		});
		const trendRow = document.createElement("div");
		trendRow.className = "front-hover-trend";
		if (trendSide >= 0) trendRow.style.color = color([a, b][trendSide]);
		trendRow.textContent = trend;
		ui.append(trendRow);
		ui.style.display = "block";
		position();
	}

	function position() {
		if (!tooltip || !pointer) return;
		const margin = 14;
		const { innerWidth, innerHeight } = window;
		const rect = tooltip.getBoundingClientRect();
		let left = pointer.clientX + margin;
		let top = pointer.clientY + margin;
		if (left + rect.width > innerWidth - 8)
			left = pointer.clientX - rect.width - margin;
		if (top + rect.height > innerHeight - 8)
			top = pointer.clientY - rect.height - margin;
		tooltip.style.left = `${Math.max(8, left)}px`;
		tooltip.style.top = `${Math.max(8, top)}px`;
	}

	function update(latlng, event) {
		if (!isLiveWar() || event?.buttons || runtime.isPainting) return hide();
		const cursor = runtime.map.latLngToContainerPoint([latlng.lat, latlng.lng]);
		const front = findFront(latlng, cursor);
		if (!front) return hide();
		pointer = { clientX: event.clientX, clientY: event.clientY };
		// Keep the trend history while the cursor stays on the same stretch of front.
		const sameFront =
			hovered &&
			hovered.key === front.key &&
			Math.hypot(hovered.lat - front.lat, hovered.lng - front.lng) <
				TREND_BOX_DEG;
		if (!sameFront) hovered = { ...front, samples: [] };
		render();
		if (!timer) timer = setInterval(render, REFRESH_MS);
	}

	function bindFrontHover() {
		let latest = null;
		runtime.map.on("mousemove", (e) => {
			latest = e;
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				if (latest?.originalEvent) update(latest.latlng, latest.originalEvent);
			});
		});
		runtime.map.on("mouseout", hide);
		runtime.map.getContainer?.()?.addEventListener("pointerleave", hide);
	}

	return { bindFrontHover, hideFrontHover: hide };
}
