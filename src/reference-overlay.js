// Dependencies are supplied by the application; this module does not import it.
export function createReferenceOverlay(runtime) {
	function clearRefHandles() {
		runtime.refHandles.forEach((h) => {
			runtime.map.removeLayer(h);
		});
		runtime.refHandles = [];
	}

	function updateRefHandles() {
		clearRefHandles();
		if (!runtime.referenceOverlay || !runtime.referenceImageUrl) return;

		const bounds = runtime.referenceOverlay.getBounds();
		const nw = bounds.getNorthWest();
		const ne = bounds.getNorthEast();
		const sw = bounds.getSouthWest();
		const se = bounds.getSouthEast();
		const center = bounds.getCenter();

		const handleIcon = runtime.mapRuntime.divIcon({
			className: "ref-handle",
			html: '<div class="ref-handle-dot"></div>',
			iconSize: [14, 14],
			iconAnchor: [7, 7],
		});

		const centerHandleIcon = runtime.mapRuntime.divIcon({
			className: "ref-handle-center",
			html: '<div class="ref-handle-dot ref-handle-dot--center">✥</div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10],
		});

		// 1. Center Handle (Move)
		const mCenter = runtime.mapRuntime
			.marker(center, {
				icon: centerHandleIcon,
				draggable: true,
			})
			.addTo(runtime.map);
		mCenter.on("dragstart", () => {
			// Disable map dragging while manipulating the reference image center handle
			runtime.map.dragging.disable();
		});
		mCenter.on("drag", (e) => {
			const newCenter = e.target.getLatLng();
			const dLat = newCenter.lat - center.lat;
			const dLng = newCenter.lng - center.lng;
			const newBounds = [
				[nw.lat + dLat, nw.lng + dLng],
				[se.lat + dLat, se.lng + dLng],
			];
			runtime.referenceOverlay.setBounds(newBounds);
		});
		mCenter.on("dragend", () => {
			runtime.map.dragging.enable();
			updateRefHandles();
		});
		runtime.refHandles.push(mCenter);

		// 2. Corner Handles (Resize)
		const corners = [
			{ pos: nw, name: "nw" },
			{ pos: ne, name: "ne" },
			{ pos: sw, name: "sw" },
			{ pos: se, name: "se" },
		];

		corners.forEach((c) => {
			const marker = runtime.mapRuntime
				.marker(c.pos, {
					icon: handleIcon,
					draggable: true,
				})
				.addTo(runtime.map);
			marker.on("dragstart", () => {
				// Disable map dragging while resizing the reference image with a corner handle
				runtime.map.dragging.disable();
			});
			marker.on("drag", (e) => {
				const newPos = e.target.getLatLng();
				let newBounds;
				if (c.name === "nw")
					newBounds = runtime.mapRuntime.latLngBounds(newPos, se);
				else if (c.name === "ne")
					newBounds = runtime.mapRuntime.latLngBounds(newPos, sw);
				else if (c.name === "sw")
					newBounds = runtime.mapRuntime.latLngBounds(newPos, ne);
				else if (c.name === "se")
					newBounds = runtime.mapRuntime.latLngBounds(newPos, nw);

				if (newBounds) runtime.referenceOverlay.setBounds(newBounds);
			});
			marker.on("dragend", () => {
				// Re-enable map dragging once the handle drag is finished
				runtime.map.dragging.enable();
				updateRefHandles();
			});
			runtime.refHandles.push(marker);
		});
	}
	return { clearRefHandles, updateRefHandles };
}
