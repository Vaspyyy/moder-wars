// Dependencies are supplied by the application; this module does not import it.
export function createCommunityLibrary(runtime) {
	async function initMultiplayer() {
		if (runtime.room) return;
		if (typeof WebsimSocket === "undefined") {
			console.warn(
				"Multiplayer disabled: WebsimSocket is unavailable in local server mode.",
			);
			return;
		}
		runtime.room = new WebsimSocket();
		await runtime.room.initialize();

		try {
			const currentUser = await window.websim.getCurrentUser();
			runtime.currentUsername = currentUser?.username || null;
		} catch (e) {
			console.warn("Failed to get current user for comments", e);
			runtime.currentUsername = null;
		}

		// Subscribe to persistent scenario records
		runtime.room.collection("scenario_v1").subscribe((scenarios) => {
			if (runtime.scenarioHubModal.style.display === "flex") {
				runtime.renderHub(scenarios);
			}
		});

		// Subscribe to persistent country records
		runtime.room.collection("country_library_v1").subscribe((countries) => {
			if (runtime.scenarioHubModal.style.display === "flex") {
				renderCountryLibrary(countries);
			}
		});

		// Subscribe to persistent flag records
		runtime.room.collection("flag_library_v1").subscribe((flags) => {
			if (runtime.scenarioHubModal.style.display === "flex") {
				renderFlagLibrary(flags);
			}
		});

		// Subscribe to comments so hub cards show live comment counts
		runtime.room.collection("hub_comment_v1").subscribe(() => {
			// Only bother re-rendering when the hub is visible
			if (runtime.scenarioHubModal.style.display === "flex") {
				const scenarios = runtime.room.collection("scenario_v1").getList();
				runtime.renderHub(scenarios || []);
			}
		});
	}

	function renderCountryLibrary(countries) {
		runtime.hubCountryCache = {};
		if (countries.length === 0) {
			runtime.libraryList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">Library is empty. Contribute your nations!</div>`;
			return;
		}

		const myUsername = runtime.currentUsername;
		const canImport = runtime.gameMode === "EDITOR" || runtime.godModeActive;

		runtime.libraryList.innerHTML = countries
			.map((c) => {
				runtime.hubCountryCache[c.id] = c;
				const safeId = runtime.escapeHtml(c.id);
				const safePreviewUrl = runtime.escapeHtml(
					c.previewUrl ||
						"https://images.websim.ai/v1/projects/placeholder/landscape",
				);
				const safeFlagUrl = c.flagUrl ? runtime.escapeHtml(c.flagUrl) : "";
				const safeName = runtime.escapeHtml(c.name);
				const safeUsername = runtime.escapeHtml(c.username);
				const safeDescription = runtime.escapeHtml(
					c.description || "No description provided.",
				);
				const safeColor = runtime.escapeHtml(c.color || "#fff");
				return `
        <div class="hub-item" data-item-type="country" data-item-id="${safeId}">
            <div style="height: 120px; position: relative; display: flex; align-items: center; justify-content: center; background: #000; border-bottom: 1px solid rgba(255,255,255,0.1); overflow: hidden;">
                 <img src="${safePreviewUrl}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.6;">
                 <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(circle, transparent 30%, #000 100%);"></div>
                 <div style="position: absolute; display: flex; align-items: center; justify-content: center; z-index: 2;">
                    ${safeFlagUrl ? `<img src="${safeFlagUrl}" style="max-height: 40px; max-width: 60px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);">` : '<span style="font-size: 30px;">🏳️</span>'}
                 </div>
                 <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; height: 3px; background: ${safeColor}; border-radius: 2px;"></div>
            </div>
            <div class="hub-content">
                <div class="hub-info">
                    <div class="hub-name">${safeName}</div>
                    <div class="hub-meta">
                        <img src="https://images.websim.com/avatar/${safeUsername}" class="hub-author-img">
                        <span>${safeUsername}</span>
                    </div>
                </div>
                <div class="hub-description">${safeDescription}</div>
                <div class="hub-actions" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 5px;" class="hub-actions-buttons">
                        ${canImport ? `<button class="mini-btn" style="background: #27ae60; padding: 6px 12px;" data-import-country-id="${safeId}">IMPORT</button>` : ""}
                        ${
													c.username === myUsername
														? `<button class="mini-btn" style="background: #c0392b; padding: 6px 12px;" data-delete-country-id="${safeId}">DEL</button>`
														: ""
												}
                    </div>
                    <span style="font-size: 12px; color: #555;">${new Date(c.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    `;
			})
			.join("");

		runtime.libraryList.querySelectorAll(".hub-item").forEach((card) => {
			if (card.dataset.boundClick) return;
			card.dataset.boundClick = "1";
			card.addEventListener("click", (ev) => {
				if (
					ev.target.closest(".hub-actions-buttons") ||
					ev.target.closest("button")
				)
					return;
				const id = card.getAttribute("data-item-id");
				if (!id) return;
				const item = runtime.hubCountryCache[id];
				if (!item) return;
				runtime.openItemModal("country", item);
			});
		});
		runtime.libraryList
			.querySelectorAll("[data-import-country-id]")
			.forEach((btn) => {
				btn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					window.importFromLibrary(btn.dataset.importCountryId);
				});
			});
		runtime.libraryList
			.querySelectorAll("[data-delete-country-id]")
			.forEach((btn) => {
				btn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					window.deleteCountry(btn.dataset.deleteCountryId);
				});
			});
	}

	function renderFlagLibrary(flags) {
		runtime.hubFlagCache = {};
		if (flags.length === 0) {
			runtime.flagLibraryList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No custom flags shared yet. Be the first!</div>`;
			return;
		}

		const myUsername = runtime.currentUsername;
		const canImport = runtime.gameMode === "EDITOR" || runtime.godModeActive;

		runtime.flagLibraryList.innerHTML = flags
			.map((f) => {
				runtime.hubFlagCache[f.id] = f;
				const safeId = runtime.escapeHtml(f.id);
				const safeFlagUrl = runtime.escapeHtml(f.flagUrl);
				const safeName = runtime.escapeHtml(f.name);
				const safeUsername = runtime.escapeHtml(f.username);
				const safeDescription = runtime.escapeHtml(
					f.description || "No description.",
				);
				return `
        <div class="hub-item" data-item-type="flag" data-item-id="${safeId}">
            <div style="height: 100px; display: flex; align-items: center; justify-content: center; background: #000; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 15px;">
                 <img src="${safeFlagUrl}" style="max-height: 100%; max-width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);">
            </div>
            <div class="hub-content">
                <div class="hub-info">
                    <div class="hub-name">${safeName}</div>
                    <div class="hub-meta">
                        <img src="https://images.websim.com/avatar/${safeUsername}" class="hub-author-img">
                        <span>${safeUsername}</span>
                    </div>
                </div>
                <div class="hub-description">${safeDescription}</div>
                <div class="hub-actions" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 5px;" class="hub-actions-buttons">
                        ${canImport ? `<button class="mini-btn" style="background: #2e86de; padding: 6px 12px;" data-import-flag-id="${safeId}">USE</button>` : ""}
                        ${
													f.username === myUsername
														? `<button class="mini-btn" style="background: #c0392b; padding: 6px 12px;" data-delete-flag-id="${safeId}">DEL</button>`
														: ""
												}
                    </div>
                </div>
            </div>
        </div>
    `;
			})
			.join("");

		runtime.flagLibraryList.querySelectorAll(".hub-item").forEach((card) => {
			if (card.dataset.boundClick) return;
			card.dataset.boundClick = "1";
			card.addEventListener("click", (ev) => {
				if (
					ev.target.closest(".hub-actions-buttons") ||
					ev.target.closest("button")
				)
					return;
				const id = card.getAttribute("data-item-id");
				if (!id) return;
				const item = runtime.hubFlagCache[id];
				if (!item) return;
				runtime.openItemModal("flag", item);
			});
		});
		runtime.flagLibraryList
			.querySelectorAll("[data-import-flag-id]")
			.forEach((btn) => {
				btn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					window.importFlagFromLibrary(btn.dataset.importFlagId);
				});
			});
		runtime.flagLibraryList
			.querySelectorAll("[data-delete-flag-id]")
			.forEach((btn) => {
				btn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					window.deleteFlag(btn.dataset.deleteFlagId);
				});
			});
	}
	return { initMultiplayer, renderCountryLibrary, renderFlagLibrary };
}
