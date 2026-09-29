// Dependencies are supplied by the application; this module does not import it.
export function createConflictSetup(runtime) {
	function rebuildManpowerInputs() {
		const container = document.getElementById("manpower-inputs-container");
		if (!container) return;
		let html = "";
		for (let i = 0; i < runtime.sides.length; i++) {
			const color = runtime.sideColors[i].replace(runtime.rgbaRe, "1)");
			const label = `Side ${String.fromCharCode(65 + i)}`;
			html += `<div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size: 12px; color:${color}; text-transform:uppercase; letter-spacing:0.5px;">${label}</span>
            <input id="manpower-side-${i}" type="number" min="0" placeholder="auto" style="width:110px; padding:4px 6px; background:#2a2a30; border:1px solid #444; border-radius:4px; color:#fff; font-size: 12px;" title="Total soldiers for ${label}.">
        </div>`;
		}
		container.innerHTML = html;
	}

	function updateSidesUI() {
		const expandedCountries = new Set(
			[
				...runtime.sidesContainer.querySelectorAll(
					".country-configuration[open]",
				),
			].map((details) => details.closest(".setup-slot").dataset.countryId),
		);
		updateFfaSetupUi();
		runtime.sidesContainer.innerHTML = "";
		let ffaParticipants = null;
		if (runtime.ffaMode) {
			const heading = document.createElement("div");
			heading.className = "ffa-participants-heading";
			const count = runtime.sides.filter((side) => side.length > 0).length;
			heading.textContent = `Free for all · ${count} independent sides`;
			ffaParticipants = document.createElement("div");
			ffaParticipants.className = "ffa-participants-grid";
			runtime.sidesContainer.append(heading, ffaParticipants);
			if (!count) {
				const empty = document.createElement("p");
				empty.className = "ffa-participants-empty";
				empty.textContent = "Select countries on the map to add participants.";
				ffaParticipants.appendChild(empty);
			}
		}

		runtime.sides.forEach((sideList, sideIdx) => {
			const sideCol = document.createElement("div");
			sideCol.className = "side-col";

			// Compute total estimated troops for this side/front
			const sideTotalTroops = sideList.reduce((sum, country) => {
				const est = runtime.estimateUnitsForCountry(country.id);
				return sum + (est || 0);
			}, 0);

			const sideHeader = document.createElement("div");
			sideHeader.className = `side-header ${runtime.activeSideIndex === sideIdx ? "active" : ""}`;
			sideHeader.dataset.side = sideIdx;

			// Use A, B, C, D labels
			const sideLabel = String.fromCharCode(65 + sideIdx);
			if (sideList.length > 0 && sideTotalTroops > 0) {
				sideHeader.innerHTML = `
                <div style="font-size: 12px; font-weight:900;">SIDE ${sideLabel}</div>
                <div style="font-size: 12px; color:#777; margin-top:2px; text-transform:uppercase; letter-spacing:0.5px;">
                    ~ ${runtime.influenceLayer.formatSoldiers(sideTotalTroops)} troops
                </div>
            `;
			} else {
				sideHeader.innerText = `SIDE ${sideLabel}`;
			}
			const sideColor =
				runtime.sideColors[sideIdx] ||
				runtime.DEFAULT_SIDE_COLORS[sideIdx % runtime.MAX_SIDES];
			sideHeader.style.color = sideColor.replace(runtime.rgbaRe, "1)");
			sideHeader.style.backgroundColor = sideColor.replace(
				runtime.rgbaRe,
				runtime.activeSideIndex === sideIdx ? "0.2)" : "0.1)",
			);
			sideHeader.style.borderColor = sideColor.replace(
				runtime.rgbaRe,
				runtime.activeSideIndex === sideIdx ? "1)" : "0.5)",
			);

			sideHeader.onclick = () => {
				runtime.activeSideIndex = sideIdx;
				rebuildManpowerInputs();
				updateSidesUI();
			};

			const listContainer = document.createElement("div");
			listContainer.className = "side-country-list";

			sideList.forEach((country, _i) => {
				const meta = runtime.countryMetadata[country.id - 1];
				const slot = document.createElement("div");
				slot.className = "setup-slot";
				slot.dataset.countryId = String(country.id);
				slot.style.borderColor = runtime.ffaMode
					? country.color.replace(runtime.rgbaRe, "1)")
					: sideColor.replace(runtime.rgbaRe, "0.7)");

				const buffState = country.buffState || meta?.buffState || "none";
				const bMeta =
					runtime.BUFF_METADATA[buffState] || runtime.BUFF_METADATA.none;

				// Find flag for setup UI from live object or metadata
				const flagUrl = country.flag?.src || meta?.flagUrl || "";

				// Estimated troop size based on current density slider and map ownership
				const estTroops = runtime.estimateUnitsForCountry(country.id);
				const estLabel = estTroops
					? runtime.influenceLayer.formatSoldiers(estTroops)
					: "UNKNOWN";

				const releasables = runtime.countryMetadata.filter(
					(m) => m && m.releasableBy === country.id,
				);

				const displayName = runtime.getTranslation(
					country.name,
					runtime.getCookie("mw_lang") || "en",
					"NATIONS",
				);
				slot.innerHTML = `
                <button class="clear-slot-btn" type="button" aria-label="Remove country" title="Remove this country from the selected side.">×</button>
                <div class="slot-name" title="${country.name}" style="display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center; margin-bottom: 5px;">
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                        ${flagUrl ? `<img src="${flagUrl}" style="width: 22px; height: 13px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; border-radius: 1px;">` : ""}
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
                    </div>
                    <div style="font-size: 12px; color: #777; text-transform: uppercase; letter-spacing: 0.5px;">~ ${estLabel} troops</div>
                </div>
                <details class="country-configuration">
                    <summary>Configure</summary>
                    <div class="country-configuration-actions">
                    <button class="mini-btn buff-toggle-btn" style="margin-top: 4px; background:${bMeta.color}; color:${bMeta.textColor}; font-size: 12px; padding:2px 6px; display:flex; align-items:center; gap:4px; justify-content:center;" title="Adjust combat buffs: use ◀ / ▶ to move between CRIPPLED, WEAKENED, NONE, GOLIATH, DEITY, GODLY. Hold ALT while clicking to change an invisible buff that only affects combat.">
                        <span class="buff-arrow" data-dir="-1" style="font-size: 12px;">◀</span>
                        <span class="buff-label">BUFF: ${bMeta.label}</span>
                        <span class="buff-arrow" data-dir="1" style="font-size: 12px;">▶</span>
                    </button>
                    <button class="mini-btn add-allies-btn" style="margin-top: 4px; background:#16a085; font-size: 12px; padding: 2px 6px;" title="Recruit all formal allies (overlord and vassals) of this nation into this side.">ADD ALLIES</button>

                    ${releasables.length > 0 ? `<button class="mini-btn release-btn" style="background: #27ae60; font-size: 12px; padding: 2px 6px; margin-top: 4px;" title="Release a releasable core from this country into the war.">RELEASE...</button>` : ""}
                </div>
                <div class="slot-controls">
                    <select class="mini-select role-select" aria-label="Country role" title="OFF: Leads attacks and creates new fronts. SUP: Sends expeditionary support to allied offensives instead of opening its own invasions.">
                        <option value="OFFENSE" ${country.role === "OFFENSE" ? "selected" : ""} title="OFF: Offensive main participant, pushes its own fronts.">Offensive</option>
                        <option value="SUPPORT" ${country.role === "SUPPORT" ? "selected" : ""} title="SUP: Support nation; mostly sends troops to help allies instead of starting new invasions.">Support</option>
                    </select>
                    <select class="mini-select strategy-select" aria-label="Country doctrine" title="Per-country behavior: TUR = pure defense; DEF = hold cores; BAL = mixed; AGG = push hard; BLZ = fast breakthroughs.">
                        <option value="TURTLE" ${country.strategy === "TURTLE" ? "selected" : ""} title="TUR: Zero offensive plans until force advantage. Pure defense.">Hold position</option>
                        <option value="DEFENSIVE" ${country.strategy === "DEFENSIVE" ? "selected" : ""} title="DEF: Focuses on defending own cores and reclaiming lost land.">Defensive</option>
                        <option value="BALANCED" ${country.strategy === "BALANCED" ? "selected" : ""} title="BAL: Balanced offense and defense along the whole front.">Balanced</option>
                        <option value="AGGRESSIVE" ${country.strategy === "AGGRESSIVE" ? "selected" : ""} title="AGG: Very aggressive, tries to push hard even when risky.">Aggressive</option>
                        <option value="BLITZ" ${country.strategy === "BLITZ" ? "selected" : ""} title="BLZ: Blitz-style spearheads that seek breakthroughs and deep pushes.">Blitz</option>
                    </select>

                </div>
                </details>
            `;

				slot.querySelector(".country-configuration").open =
					expandedCountries.has(String(country.id));
				const buffBtn = slot.querySelector(".buff-toggle-btn");
				if (buffBtn) {
					const buffLabelEl = buffBtn.querySelector(".buff-label");
					const buffArrows = buffBtn.querySelectorAll(".buff-arrow");

					const applyBuffState = (newState) => {
						country.buffState = newState;
						if (meta) meta.buffState = newState;
						const metaBuff =
							runtime.BUFF_METADATA[newState] || runtime.BUFF_METADATA.none;
						if (buffLabelEl)
							buffLabelEl.textContent = `BUFF: ${metaBuff.label}`;
						buffBtn.style.background = metaBuff.color;
						buffBtn.style.color = metaBuff.textColor;
					};

					buffArrows.forEach((span) => {
						span.addEventListener("click", (e) => {
							e.stopPropagation();
							const dir = parseInt(span.getAttribute("data-dir"), 10) || 1;
							const current = country.buffState || "none";
							const nextState = runtime.cycleBuffState(current, dir);
							applyBuffState(nextState);
						});
					});

					// Clicking the center label still cycles forward for convenience
					if (buffLabelEl) {
						buffLabelEl.addEventListener("click", (e) => {
							e.stopPropagation();
							const current = country.buffState || "none";
							const nextState = runtime.cycleBuffState(current, 1);
							applyBuffState(nextState);
						});
					}
				}

				// "Add Allies" button: pull overlord + vassals into this side when available
				const addAlliesBtn = slot.querySelector(".add-allies-btn");
				if (addAlliesBtn) {
					addAlliesBtn.addEventListener("click", (e) => {
						e.stopPropagation();
						const thisMeta = runtime.countryMetadata[country.id - 1];
						if (!thisMeta) return;

						const alliesSet = new Set();
						// 1) This country itself
						alliesSet.add(country.id);

						// 2) Its overlord chain root
						let rootId = country.id;
						let guard = 0;
						while (guard < 16) {
							const rootMeta = runtime.countryMetadata[rootId - 1];
							if (!rootMeta?.overlordId || rootMeta.overlordId === rootId)
								break;
							rootId = rootMeta.overlordId;
							guard++;
						}
						alliesSet.add(rootId);

						// 3) Direct vassals of this country
						runtime.countryMetadata.forEach((m) => {
							if (m && m.overlordId === country.id) {
								alliesSet.add(m.id);
							}
						});

						// 4) Direct vassals of the root (same wider alliance)
						runtime.countryMetadata.forEach((m) => {
							if (m && m.overlordId === rootId) {
								alliesSet.add(m.id);
							}
						});

						// 5) Explicit allies defined in the editor (mutual alliance graph)
						const explicitAllies = Array.isArray(thisMeta.allies)
							? thisMeta.allies
							: [];
						explicitAllies.forEach((aid) => {
							if (aid > 0) alliesSet.add(aid);
						});

						// Remove ids that don't exist in metadata
						const validAllies = Array.from(alliesSet).filter(
							(id) => runtime.countryMetadata[id - 1],
						);

						if (validAllies.length <= 1) {
							runtime.statusText.innerText =
								"No allies linked via overlord/vassal or editor alliances for this nation.";
							return;
						}

						// Add all valid allies to this side if not already present anywhere
						const alreadyInAnySide = new Set(
							runtime.sides
								.flat()
								.filter(Boolean)
								.map((c) => c.id),
						);
						let addedCount = 0;
						validAllies.forEach((id) => {
							if (alreadyInAnySide.has(id)) return;
							const m = runtime.countryMetadata[id - 1];
							if (!m) return;
							runtime.sides[sideIdx].push({
								id: m.id,
								name: m.name,
								color: m.color,
								role: "OFFENSE",
								strategy: "BALANCED",
								buffState: m.buffState || "none",
								overlordId: m.overlordId || null,
								flag: m.tempFlag || null,
							});
							alreadyInAnySide.add(id);
							addedCount++;
						});

						if (addedCount > 0) {
							runtime.statusText.innerText = `Alliance Mobilized: Added ${addedCount} allied member${addedCount === 1 ? "" : "s"} to Side ${String.fromCharCode(65 + sideIdx)}.`;
							updateSidesUI();
							runtime.influenceLayer.render();
						} else {
							runtime.statusText.innerText =
								"All linked allies are already committed to a side.";
						}
					});
				}

				slot.querySelector(".role-select").onchange = (e) => {
					country.role = e.target.value;
				};

				slot.querySelector(".strategy-select").onchange = (e) => {
					country.strategy = e.target.value;
				};

				slot.querySelector(".clear-slot-btn").onclick = (e) => {
					e.stopPropagation();
					const idx = sideList.findIndex((c) => c.id === country.id);
					if (idx !== -1) sideList.splice(idx, 1);
					updateSidesUI();
					runtime.influenceLayer.render();
				};

				const releaseBtn = slot.querySelector(".release-btn");
				if (releaseBtn) {
					releaseBtn.onclick = (e) => {
						e.stopPropagation();
						runtime.openReleaseModal(country.id, sideIdx);
					};
				}

				listContainer.appendChild(slot);
				if (ffaParticipants) ffaParticipants.appendChild(slot);
			});
			if (runtime.ffaMode) return;

			sideCol.appendChild(sideHeader);

			// Add "Delete Side" button for sides beyond the first two
			if (runtime.sides.length > 2) {
				const delBtn = document.createElement("button");
				delBtn.className = "mini-btn";
				delBtn.innerText = "Remove Side";
				delBtn.style.fontSize = "8px";
				delBtn.style.padding = "2px";
				delBtn.onclick = (e) => {
					e.stopPropagation();
					runtime.sides.splice(sideIdx, 1);
					if (runtime.activeSideIndex >= runtime.sides.length)
						runtime.activeSideIndex = Math.max(0, runtime.sides.length - 1);
					rebuildManpowerInputs();
					updateSidesUI();
				};
				sideCol.appendChild(delBtn);
			}

			sideCol.appendChild(listContainer);
			runtime.sidesContainer.appendChild(sideCol);

			if (sideIdx < runtime.sides.length - 1) {
				const divider = document.createElement("div");
				divider.className = "vs-divider";
				divider.innerText = "VS";
				divider.style.alignSelf = "center";
				runtime.sidesContainer.appendChild(divider);
			}
		});

		const activeSidesCount = runtime.sides.filter(
			(s) => s && s.length > 0,
		).length;

		// Rebellions are disabled: ensure button (if present) stays hidden and inert.

		runtime.setupOptions.style.display =
			activeSidesCount >= 1 ? "block" : "none";
		const canStart = activeSidesCount >= 2;
		runtime.startBtn.disabled = !canStart;
		runtime.startBtn.style.opacity = canStart ? "1" : "0.5";
		runtime.startBtn.style.cursor = canStart ? "pointer" : "not-allowed";

		rebuildManpowerInputs();
		runtime.rebuildStatsPanel();
	}

	function updateFfaSetupUi() {
		runtime.ffaToggleBtn.setAttribute("aria-pressed", String(runtime.ffaMode));
		runtime.ffaToggleBtn.textContent = `${runtime.getTranslation("FFA")}: ${runtime.ffaMode ? "ON" : "OFF"}`;
		runtime.setupPanel.classList.toggle("ffa-setup-active", runtime.ffaMode);
		runtime.addSideBtn.hidden = runtime.ffaMode;
		const prompt = document.getElementById("setup-prompt");
		if (prompt) {
			prompt.textContent = runtime.ffaMode
				? "Click countries on the map to add independent participants."
				: runtime.getTranslation("SETUP_PROMPT");
		}
		const note = document.getElementById("ffa-setup-note");
		if (note) note.hidden = !runtime.ffaMode;
	}

	function updateRandomWarButton() {
		const translationKey = runtime.randomWarMode
			? "RANDOM_WAR_ON"
			: "RANDOM_WAR_OFF";
		runtime.randomWarBtn.dataset.i18n = translationKey;
		runtime.randomWarBtn.textContent = runtime.getTranslation(translationKey);
		runtime.randomWarBtn.setAttribute(
			"aria-pressed",
			String(runtime.randomWarMode),
		);
	}

	function resetConflictSetupState() {
		runtime.invalidateWarLifecycleTimers();
		runtime.sides = [[], []];
		runtime._attackers = runtime.sides[0];
		runtime._defenders = runtime.sides[1];
		runtime.activeSideIndex = 0;
		runtime.sideSoldiers.fill(0);
		runtime.initialSideSoldiers.fill(0);
		runtime.sideRecruitableManpower.fill(0);
		runtime.soldiersPerUnit.fill(runtime.CONFIG.UNIT_TO_SOLDIER_RATIO);
		runtime.sideCasualties.fill(0);
		runtime.units = [];
		runtime.bases = [];
		runtime.bombs = [];
		runtime.explosions = [];
		runtime.activeBattles = [];
		runtime._battleHash.clear();
		runtime.capitalLostCountries = new Set();
		runtime.resetOperationalAiRuntime();
		document.body.classList.remove("conflict-active");
		document.getElementById("war-desk").style.display = "none";
		runtime._warOverviewSides = [];
		runtime._warOverviewLastUpdate = -Infinity;
		runtime.resetSideHostilities();
		runtime.countryCasualties.clear();
		runtime.casualtyByAttacker.clear();
		runtime.latestCountryStats.clear();
		runtime._mopUpOwnedCellCache.clear();
		runtime._mopUpDeJureCellCache.clear();
		runtime.selectedCountryIds.clear();
		runtime.editingCityId = -1;
		runtime.paintMaskId = -1;
		runtime.gameTimeEnabled = false;
		runtime.gameTimeDate = null;
		runtime.gameTimeAccumulatorMs = 0;
		if (runtime.gameDateDisplay) {
			runtime.gameDateDisplay.style.display = "none";
		}
		runtime.treatyAlert.style.display = "none";
		runtime.statusText.innerText = runtime.getTranslation("SELECT_P1");
		runtime.unitCountsDiv.style.display = "none";
		runtime.statsPanel.style.display = "none";
		runtime.casualtyPanel.style.display = "none";

		document.getElementById("speed-controls").style.display = "none";
		runtime.godModeBtn.style.display =
			runtime.gameMode === "CONQUEST" ? "block" : "none";
		runtime.forcePeaceBtn.style.display = "none";
		runtime.resetBtn.style.display = "block";
		runtime.restartScenarioBtn.style.display = "block";
		updateSidesUI();
		runtime.updateRestartVisibility();
	}
	return {
		updateSidesUI,
		updateFfaSetupUi,
		updateRandomWarButton,
		rebuildManpowerInputs,
		resetConflictSetupState,
	};
}
