// Controls receive live state and commands; they do not import the application.
export function createReferenceControls(runtime) {
	function bindCustomSatInputChange() {
		document
			.getElementById("custom-sat-input")
			?.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (!file) return;
				runtime.loadingStatus.innerText = "Uploading Background Overlay...";
				runtime.loadingOverlay.style.display = "flex";
				try {
					const url = await websim.upload(file);
					runtime.customSatelliteUrl = url;
					runtime.customSatelliteImg = new Image();
					runtime.customSatelliteImg.crossOrigin = "anonymous";
					runtime.customSatelliteImg.onload = () => {
						runtime.loadingOverlay.style.display = "none";
						runtime.influenceLayer.render();
					};
					runtime.customSatelliteImg.src = url;
				} catch (err) {
					console.error(err);
					runtime.loadingOverlay.style.display = "none";
				}
			});
	}

	function bindUploadSatBtnClick() {
		document.getElementById("upload-sat-btn")?.addEventListener("click", () => {
			document.getElementById("custom-sat-input")?.click();
		});
	}

	function bindUploadRefBtnClick() {
		document.getElementById("upload-ref-btn")?.addEventListener("click", () => {
			document.getElementById("ref-image-input")?.click();
		});
	}

	function bindRefImageInputChange() {
		document
			.getElementById("ref-image-input")
			?.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (!file) return;
				runtime.loadingStatus.innerText = "Processing Reference Image...";
				runtime.loadingOverlay.style.display = "flex";
				try {
					const url = await websim.upload(file);
					runtime.referenceImageUrl = url;
					if (runtime.referenceOverlay)
						runtime.map.removeLayer(runtime.referenceOverlay);

					// Load image to get natural dimensions for aspect ratio preservation
					const img = new Image();
					img.onload = () => {
						const aspect = img.width / img.height;
						const center = runtime.map.getCenter();
						const h = 20 * runtime.refScale;
						const w = h * aspect;
						const bounds = [
							[center.lat - h, center.lng - w],
							[center.lat + h, center.lng + w],
						];

						runtime.referenceOverlay = runtime.L.imageOverlay(url, bounds, {
							opacity: runtime.refOpacity,
							interactive: false,
							pane: "refImagePane",
						}).addTo(runtime.map);
						runtime.updateRefHandles();
						runtime.loadingOverlay.style.display = "none";
					};
					img.src = url;
				} catch (err) {
					console.error(err);
					runtime.loadingOverlay.style.display = "none";
				}
			});
	}

	function bindRefOpacitySliderInput() {
		document
			.getElementById("ref-opacity-slider")
			?.addEventListener("input", (e) => {
				runtime.refOpacity = parseFloat(e.target.value);
				if (runtime.referenceOverlay)
					runtime.referenceOverlay.setOpacity(runtime.refOpacity);
				if (runtime.influenceLayer) {
					runtime.influenceLayer._forceRender = true;
					runtime.influenceLayer.render();
				}
			});
	}

	function bindRefAboveCheckboxChange() {
		if (runtime.refAboveCheckbox) {
			// Initialize checkbox from current state when opening editor
			runtime.refAboveCheckbox.checked = !!runtime.refAboveTerrain;
			runtime.refAboveCheckbox.addEventListener("change", (e) => {
				runtime.refAboveTerrain = !!e.target.checked;
				// No need to change Leaflet pane; we composite into the canvas.
				if (runtime.influenceLayer) {
					runtime.influenceLayer._forceRender = true;
					runtime.influenceLayer.render();
				}
			});
		}
	}

	function bindRefScaleSliderInput() {
		document
			.getElementById("ref-scale-slider")
			?.addEventListener("input", (e) => {
				runtime.refScale = parseFloat(e.target.value);
				if (runtime.referenceOverlay && runtime.referenceImageUrl) {
					const center = runtime.referenceOverlay.getBounds().getCenter();
					const w = 40 * runtime.refScale;
					const h = 25 * runtime.refScale;
					const newBounds = [
						[center.lat - h, center.lng - w],
						[center.lat + h, center.lng + w],
					];
					runtime.referenceOverlay.setBounds(newBounds);
					runtime.updateRefHandles();
				}
			});
	}

	function bindClearRefBtnClick() {
		document.getElementById("clear-ref-btn")?.addEventListener("click", () => {
			if (runtime.referenceOverlay)
				runtime.map.removeLayer(runtime.referenceOverlay);
			runtime.referenceOverlay = null;
			runtime.referenceImageUrl = null;
			runtime.clearRefHandles();
		});
	}
	return {
		bindCustomSatInputChange,
		bindUploadSatBtnClick,
		bindUploadRefBtnClick,
		bindRefImageInputChange,
		bindRefOpacitySliderInput,
		bindRefAboveCheckboxChange,
		bindRefScaleSliderInput,
		bindClearRefBtnClick,
	};
}
