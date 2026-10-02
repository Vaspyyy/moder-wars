// Controls receive live state and commands; they do not import the application.
export function createMapInput(runtime) {
	function bindMapClick() {
		runtime.map.on("click", (e) => {
			const originalEvent = e.originalEvent || e;
			if (
				runtime.gameMode === "CONQUEST" &&
				runtime.gameState === "SIMULATING" &&
				runtime.showWarPlans &&
				window.innerWidth < 480
			) {
				const snapshot = runtime.getAiOperationsSnapshot();
				let nearestTaskForce = null;
				let nearestDistanceSq = Infinity;
				for (const taskForce of snapshot?.taskForces || []) {
					const point = taskForce.objective || taskForce.assemblyArea;
					if (!point) continue;
					const distanceSq = runtime.geoDistSq(
						e.latlng.lat,
						e.latlng.lng,
						point.lat,
						point.lng,
					);
					if (distanceSq < nearestDistanceSq) {
						nearestDistanceSq = distanceSq;
						nearestTaskForce = taskForce;
					}
				}
				if (nearestTaskForce && nearestDistanceSq <= 16) {
					window.__mwAiOperationReveal = {
						uid: nearestTaskForce.uid || nearestTaskForce.id,
						sideUid: snapshot.sideUid,
					};
					if (runtime.influenceLayer) runtime.influenceLayer.render();
					return;
				}
			}

			// City move / create modes take priority
			if (
				(runtime.gameMode === "EDITOR" || runtime.godModeActive) &&
				runtime.cityEditMode === "MOVE" &&
				runtime.editingCityId > 0
			) {
				const city = runtime.cities.find((c) => c.id === runtime.editingCityId);
				if (city) {
					city.lat = e.latlng.lat;
					city.lng = e.latlng.lng;
					runtime.invalidateTerritoryLedgerCities();
					runtime.statusText.innerText = `Moved ${city.name} to new position`;
					runtime.cityEditMode = null;
					runtime.cityInspector.style.display = "block";
					runtime.influenceLayer.render();
					return;
				}
				runtime.cityEditMode = null;
			}

			if (
				(runtime.gameMode === "EDITOR" || runtime.godModeActive) &&
				runtime.cityEditMode === "CREATE"
			) {
				const newId =
					(runtime.cities.length
						? Math.max(...runtime.cities.map((c) => c.id || 0))
						: 0) + 1;
				const idx = runtime.getGridIndex(e.latlng.lat, e.latlng.lng);
				const ownerId = idx !== -1 ? runtime.worldControlMap[idx] : null;
				const newCity = {
					id: newId,
					name: "New City",
					lat: e.latlng.lat,
					lng: e.latlng.lng,
					pop: 0,
					isCapital: false,
					ownerId: ownerId,
					isCustom: true,
				};
				runtime.cities.push(newCity);
				runtime.activeTheaterCities = runtime.cities;
				runtime.invalidateTerritoryLedgerCities();
				runtime.statusText.innerText =
					"New city created. Use the City Inspector to name and assign it.";
				runtime.cityEditMode = null;
				runtime.openCityInspector(newId);
				runtime.influenceLayer.render();
				return;
			}

			// City click detection (editor / god mode)
			if (runtime.gameMode === "EDITOR" || runtime.godModeActive) {
				const city = runtime.findCityAtLatLng(e.latlng);
				if (city) {
					runtime.openCityInspector(city.id);
					return;
				}
			}
			// Outside editor/god mode, city clicks do nothing (no popup)

			runtime.handleCountryClick(null, null, e.latlng, originalEvent);
		});
	}

	function bindMapCoordinatesMousemove() {
		let frame = 0;
		let position = null;
		const update = (e) => {
			position = e.latlng;
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				const text = `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
				if (runtime.coordsDisplay.textContent !== text)
					runtime.coordsDisplay.textContent = text;
			});
		};
		runtime.map.on("mousemove", update);
		runtime.map.on("unload", () => {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			runtime.map.off("mousemove", update);
		});
	}

	function bindMapMousedown() {
		runtime.map.on("mousedown", (e) => {
			// If the user is interacting with reference image handles, do NOT start painting or terrain tools.
			const targetEl = e.originalEvent?.target;
			if (targetEl?.closest(".ref-handle, .ref-handle-center")) {
				return;
			}

			if (
				runtime.gameState === "EDITOR_PAINTING" ||
				runtime.gameState === "EDITOR_UNCLAIMING" ||
				runtime.gameState === "EDITOR_PAINTING_TERRAIN"
			) {
				runtime.isPainting = true;
				runtime.lastPaintLatLng = e.latlng;
				runtime.map.dragging.disable();

				// Set paint mask if Alt is held down
				if (e.originalEvent?.altKey) {
					const idx = runtime.getGridIndex(e.latlng.lat, e.latlng.lng);
					if (idx !== -1) {
						runtime.paintMaskId = runtime.worldControlMap[idx];
					} else {
						runtime.paintMaskId = -1;
					}
				} else {
					runtime.paintMaskId = -1;
				}

				runtime.paintAt(e.latlng);
			}
		});
	}

	function bindMapPaintMousemove() {
		runtime.map.on("mousemove", (e) => {
			runtime.coordsDisplay.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;

			// While dragging reference image handles, ignore painting logic entirely.
			const targetEl = e.originalEvent?.target;
			if (targetEl?.closest(".ref-handle, .ref-handle-center")) {
				return;
			}

			if (
				runtime.isPainting &&
				(runtime.gameState === "EDITOR_PAINTING" ||
					runtime.gameState === "EDITOR_UNCLAIMING" ||
					runtime.gameState === "EDITOR_PAINTING_TERRAIN")
			) {
				if (runtime.lastPaintLatLng) {
					// INTERPOLATION SYSTEM: "Raycast" between last and current mouse positions.
					// This prevents gaps when dragging the brush faster than the frame rate.
					const p1 = runtime.lastPaintLatLng;
					const p2 = e.latlng;

					let dLng = p2.lng - p1.lng;
					if (dLng > 180) dLng -= 360;
					if (dLng < -180) dLng += 360;
					const dLat = p2.lat - p1.lat;

					const dist = Math.sqrt(dLat * dLat + dLng * dLng);
					const step = runtime.brushSize * 0.35; // Step every 35% of brush radius

					if (dist > step) {
						const numSteps = Math.ceil(dist / step);
						let changedAny = false;
						for (let i = 1; i <= numSteps; i++) {
							const t = i / numSteps;
							const interpLat = p1.lat + dLat * t;
							let interpLng = p1.lng + dLng * t;
							if (interpLng > 180) interpLng -= 360;
							if (interpLng < -180) interpLng += 360;

							if (runtime.applyPaintAt({ lat: interpLat, lng: interpLng })) {
								changedAny = true;
							}
						}
						if (changedAny) {
							runtime.influenceLayer._forceRender = true;
							runtime.influenceLayer.render();
						}
					} else {
						runtime.paintAt(e.latlng);
					}
					runtime.lastPaintLatLng = e.latlng;
				} else {
					runtime.paintAt(e.latlng);
					runtime.lastPaintLatLng = e.latlng;
				}
			}
		});
	}

	function bindMapMouseup() {
		runtime.map.on("mouseup", () => {
			if (runtime.isPainting) {
				// Update label positions and territory stats after a painting stroke finishes
				runtime.recalculateAllBounds();
				runtime.influenceLayer.render();
			}
			runtime.isPainting = false;
			runtime.map.dragging.enable();
		});
	}
	return {
		bindMapClick,
		bindMapCoordinatesMousemove,
		bindMapMousedown,
		bindMapPaintMousemove,
		bindMapMouseup,
	};
}
