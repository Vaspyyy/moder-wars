// Dependencies are supplied by the application; this module does not import it.
export function createInspectors(runtime) {
	function openInspector(id) {
		runtime.editingCountryId = id;
		const meta = runtime.countryMetadata[id - 1];
		if (!meta) return;

		const isWar = runtime.gameState === "SIMULATING";
		const _isNeutral = !runtime.sides.flat().some((c) => c.id === id);

		// Toggle editor-only fields, but keep the Combat Buff section visible even in war
		const buffSection = document.getElementById("buff-editor-section");
		document
			.querySelectorAll("#country-inspector .editor-only")
			.forEach((el) => {
				if (el === buffSection) return; // handle buff separately
				el.style.display = isWar ? "none" : "block";
			});
		if (buffSection) {
			buffSection.style.display = "block";
		}

		const vassalStatusDisplay = document.getElementById(
			"vassal-status-display",
		);
		if (vassalStatusDisplay) {
			if (meta.overlordId) {
				vassalStatusDisplay.style.display = "block";
				const oMeta = runtime.countryMetadata[meta.overlordId - 1];
				document.getElementById("overlord-name-disp").innerText = oMeta
					? oMeta.name
					: "Unknown";
			} else {
				vassalStatusDisplay.style.display = "none";
			}
		}

		const recruitmentDiv = document.getElementById("mid-war-recruitment");
		const vassalizeBtn = document.getElementById("vassalize-btn");
		const exitConflictBtn = document.getElementById("exit-conflict-btn");
		if (recruitmentDiv) {
			if (isWar) {
				const currentSideIdx = runtime.sides.findIndex((s) =>
					s.some((c) => c.id === id),
				);
				recruitmentDiv.style.display = "block";

				if (exitConflictBtn) {
					if (currentSideIdx !== -1) {
						exitConflictBtn.style.display = "block";
						exitConflictBtn.onclick = () => {
							const country = runtime.sides[currentSideIdx].find(
								(c) => c.id === id,
							);
							if (country) {
								runtime.unilateralExitConflict(country, currentSideIdx);
								runtime.countryInspector.style.display = "none";
							}
						};
					} else {
						exitConflictBtn.style.display = "none";
					}
				}
				const btnContainer = document.getElementById("recruit-sides-btns");
				btnContainer.innerHTML = "";

				runtime.sides.forEach((_side, idx) => {
					const isCurrentSide = currentSideIdx === idx;
					const btn = document.createElement("button");
					btn.className = "mini-btn";
					const sideLabel = String.fromCharCode(65 + idx);
					btn.innerText = isCurrentSide
						? `ON SIDE ${sideLabel}`
						: `JOIN SIDE ${sideLabel}`;
					btn.style.background = runtime.sideColors[idx].replace(
						runtime.rgbaRe,
						"1)",
					);
					btn.style.padding = "8px 12px";
					btn.style.fontSize = "10px";
					btn.style.fontWeight = "900";
					btn.style.opacity = isCurrentSide ? "0.4" : "1";
					btn.disabled = isCurrentSide;

					if (!isCurrentSide) {
						btn.onclick = () => {
							runtime.recruitNeutralMidWar(id, idx);
							runtime.countryInspector.style.display = "none";
						};
					}
					btnContainer.appendChild(btn);
				});

				// "Join New Side" — neutral country declares war on ALL sides as a new independent faction
				if (
					currentSideIdx === -1 &&
					_isNeutral &&
					runtime.sides.length < runtime.MAX_SIDES
				) {
					const newSideBtn = document.createElement("button");
					newSideBtn.className = "mini-btn";
					newSideBtn.innerText = "JOIN NEW SIDE";
					newSideBtn.style.background = "#ff4500";
					newSideBtn.style.padding = "8px 12px";
					newSideBtn.style.fontSize = "10px";
					newSideBtn.style.fontWeight = "900";
					newSideBtn.style.width = "100%";
					newSideBtn.style.marginTop = "4px";
					newSideBtn.title =
						"Declare war on ALL existing sides as an independent faction";
					newSideBtn.onclick = () => {
						runtime.recruitNewSideMidWar(id);
						runtime.countryInspector.style.display = "none";
					};
					btnContainer.appendChild(newSideBtn);
				}

				// Vassalization Logic: Check if target can be vassalized
				// Requires enough territory taken by a side
				vassalizeBtn.style.display = "none";
				const stats = runtime.latestCountryStats.get(id);
				if (stats) {
					const initial = meta.initialCells || stats.controlled + 100; // fallback if war just started
					const controlPct = stats.controlled / initial;

					// If more than 50% territory taken, show vassalize button for the leading side
					if (controlPct < 0.5) {
						vassalizeBtn.style.display = "block";
						vassalizeBtn.onclick = () =>
							runtime.editSimulation(() => {
								// Find the side that occupies the most of this country
								let bestSideIdx = 0;

								const sideOccs = new Array(runtime.sides.length).fill(0);

								// Sample grid to find dominant occupier
								for (let i = 0; i < runtime.worldControlMap.length; i += 50) {
									if (
										runtime.worldControlMap[i] === id &&
										runtime.landMask[i] === 2
									) {
										const occId = runtime.primaryOccupierMap[i];
										const sIdx = runtime.sides.findIndex((s) =>
											s.some((c) => c.id === occId),
										);
										if (sIdx !== -1) sideOccs[sIdx]++;
									}
								}
								bestSideIdx = sideOccs.indexOf(Math.max(...sideOccs));
								const overlord = runtime.sides[bestSideIdx]?.[0];
								const liveMeta = runtime.countryMetadata[id - 1];
								if (overlord && liveMeta) {
									liveMeta.overlordId = overlord.id;
									runtime.recruitNeutralMidWar(id, bestSideIdx);
									runtime.countryInspector.style.display = "none";
								}
							});
					}
				}
			} else {
				recruitmentDiv.style.display = "none";
			}
		}

		// Render current allies
		if (runtime.allyList) {
			const allies = Array.isArray(meta.allies) ? meta.allies : [];
			if (!allies.length) {
				runtime.allyList.innerHTML = `<span style="font-size: 12px; color: #666;">No allies set.</span>`;
			} else {
				const items = allies
					.map((aid) => runtime.countryMetadata[aid - 1])
					.filter(Boolean)
					.map(
						(m) =>
							`<div style="font-size: 12px; color:#ccc; margin-bottom:2px;">• ${m.name}</div>`,
					)
					.join("");
				runtime.allyList.innerHTML = items;
			}
		}

		const releasables = runtime.countryMetadata.filter(
			(m) => m && m.releasableBy === id,
		);
		const releaseContainer = document.getElementById(
			"inspector-release-container",
		);
		const releaseBtn = document.getElementById("inspect-release-btn");
		if (releaseContainer && releaseBtn) {
			if (releasables.length > 0) {
				releaseContainer.style.display = "block";
				releaseBtn.onclick = () => {
					const currentSideIdx = runtime.sides.findIndex((s) =>
						s.some((c) => c.id === id),
					);
					runtime.openReleaseModal(id, currentSideIdx);
				};
			} else {
				releaseContainer.style.display = "none";
			}
		}

		const inspectorDisplayName = runtime.getTranslation(
			meta.name || meta.feature?.properties?.NAME || "Unnamed Land",
			runtime.getCookie("mw_lang") || "en",
			"NATIONS",
		);
		runtime.inspectNameInput.value = inspectorDisplayName;
		runtime.inspectNameInput.disabled = isWar;
		runtime.inspectColorSwatch.style.backgroundColor = meta.color;

		// Initialize Buff button state for this country (visible + hidden)
		if (runtime.inspectBuffBtn) {
			const currentBuff = meta.buffState || "none";
			const currentHidden = meta.hiddenBuffState || "none";
			const bMeta =
				runtime.BUFF_METADATA[currentBuff] || runtime.BUFF_METADATA.none;
			const hMeta =
				runtime.BUFF_METADATA[currentHidden] || runtime.BUFF_METADATA.none;
			const hiddenLabel =
				currentHidden !== "none"
					? `<div style="margin-top:4px; font-size: 12px; color:#f1c40f; text-transform:uppercase; letter-spacing:0.5px;">INVISIBLE BUFF: ${hMeta.label}</div>`
					: "";
			runtime.inspectBuffBtn.innerHTML = `
            <span class="buff-arrow" data-dir="-1" style="font-size: 12px; margin-right:4px;">◀</span>
            <span class="buff-label">BUFF: ${bMeta.label}</span>
            <span class="buff-arrow" data-dir="1" style="font-size: 12px; margin-left:4px;">▶</span>
            ${hiddenLabel}
        `;
			runtime.inspectBuffBtn.style.background = bMeta.color;
			runtime.inspectBuffBtn.style.color = bMeta.textColor;
		}

		// Reset file input and update flag preview
		runtime.inspectFlagInput.value = "";
		if (meta.flagUrl) {
			runtime.inspectFlagPreview.src = meta.flagUrl;
			runtime.inspectFlagPreview.style.display = "block";
		} else {
			runtime.inspectFlagPreview.style.display = "none";
		}

		// Convert current color to Hex for the picker
		const rgba = meta.rgba;
		const toHex = (n) => n.toString(16).padStart(2, "0");
		const hex = `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`;
		runtime.inspectColorPicker.value = hex;

		runtime.countryInspector.style.display = "block";
		runtime.influenceLayer.render();
	}

	function refreshCityOwnerSelect(selectedOwnerId) {
		if (!runtime.cityOwnerSelect) return;
		runtime.cityOwnerSelect.innerHTML = '<option value="">(None)</option>';
		runtime.countryMetadata.forEach((m) => {
			if (!m) return;
			const opt = document.createElement("option");
			opt.value = m.id;
			opt.textContent = m.name;
			if (selectedOwnerId && selectedOwnerId === m.id) opt.selected = true;
			runtime.cityOwnerSelect.appendChild(opt);
		});
	}

	function openCityInspector(cityId) {
		const city = runtime.cities.find((c) => c.id === cityId);
		if (!city) return;
		runtime.editingCityId = cityId;
		runtime.cityInspector.style.display = "block";
		runtime.cityNameInput.value = city.name || "";
		refreshCityOwnerSelect(city.ownerId || city.sovereignId || null);
		runtime.cityCapitalCheckbox.checked = !!city.isCapital;
	}
	return { openInspector, refreshCityOwnerSelect, openCityInspector };
}
