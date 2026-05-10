import {
	countryInspector,
	currentUsername,
	enterScenarioBtn,
	flagLibraryList,
	gameState,
	godModeActive,
	hubList,
	hubReturnState,
	hubScenarioCache,
	hubWasInEditor,
	libraryList,
	mainMenu,
	mapUi,
	openItemModal,
	playClickSound,
	renderCountryLibrary,
	renderFlagLibrary,
	room,
	SCENARIO_MENU_BGS,
	scenarioHubModal,
	setGameState,
	setHubReturnState,
	setHubScenarioCache,
	setHubWasInEditor,
	setQueuedScenarioAction,
	tabCountriesBtn,
	tabFlagsBtn,
	tabScenariosBtn,
} from "./constants.js";

function openHub(initialTab = "scenarios") {
	const fade = document.getElementById("fade-transition-overlay");
	const isFromEditor =
		gameState === "EDITOR_ACTIVE" ||
		gameState === "EDITOR_PAINTING" ||
		godModeActive ||
		gameState === "SIMULATING" ||
		gameState === "SELECTING_P1" ||
		gameState === "SELECTING_P2";

	setHubWasInEditor(isFromEditor);
	if (isFromEditor) setHubReturnState(gameState);

	const performOpen = () => {
		// Switch to Menu background visuals for the hub context if coming from the map
		if (isFromEditor) {
			mapUi.style.display = "none";
			countryInspector.style.display = "none";
			mainMenu.style.display = "flex";
			// Set state to main menu so the background looks correct under the modal
			setGameState("MAIN_MENU");
		}

		scenarioHubModal.style.display = "flex";
		switchHubTab(initialTab);

		// Refresh content
		renderHub(room.collection("scenario_v1").getList());
		renderCountryLibrary(room.collection("country_library_v1").getList());
		renderFlagLibrary(room.collection("flag_library_v1").getList());
	};

	if (isFromEditor && fade) {
		fade.style.display = "block";
		requestAnimationFrame(() => {
			fade.style.opacity = "1";
		});

		setTimeout(() => {
			performOpen();
			fade.style.opacity = "0";
			setTimeout(() => {
				fade.style.display = "none";
			}, 600);
		}, 600);
	} else {
		performOpen();
	}
}

function closeHub() {
	scenarioHubModal.style.display = "none";
	if (hubWasInEditor) {
		mainMenu.style.display = "none";
		mapUi.style.display = "flex";
		if (hubReturnState) setGameState(hubReturnState);
		setHubWasInEditor(false);
		setHubReturnState(null);
	}
}

function switchHubTab(tab) {
	tabScenariosBtn.classList.remove("active");
	tabCountriesBtn.classList.remove("active");
	tabFlagsBtn.classList.remove("active");
	hubList.style.display = "none";
	libraryList.style.display = "none";
	flagLibraryList.style.display = "none";

	if (tab === "scenarios") {
		tabScenariosBtn.classList.add("active");
		hubList.style.display = "grid";
	} else if (tab === "countries") {
		tabCountriesBtn.classList.add("active");
		libraryList.style.display = "grid";
	} else if (tab === "flags") {
		tabFlagsBtn.classList.add("active");
		flagLibraryList.style.display = "grid";
	}
}

function renderHub(scenarios) {
	// scenarios is now an array from the database
	const list = scenarios;
	setHubScenarioCache({});
	if (list.length === 0) {
		hubList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No scenarios uploaded yet. Be the first!</div>`;
		return;
	}

	const myUsername = currentUsername;

	// Compute comment counts per scenario id
	let commentCounts = {};
	try {
		const allComments = room.collection("hub_comment_v1").getList();
		allComments.forEach((c) => {
			if (c.item_type === "scenario" && c.item_id) {
				commentCounts[c.item_id] = (commentCounts[c.item_id] || 0) + 1;
			}
		});
	} catch (_e) {
		commentCounts = {};
	}

	hubList.innerHTML = list
		.map((s) => {
			hubScenarioCache[s.id] = s;
			const _safeName = (s.name || "").replace(/'/g, "\\'");
			const _safeOwner = (s.username || "").replace(/'/g, "\\'");
			const cCount = commentCounts[s.id] || 0;
			const cLabel = cCount === 1 ? "1 comment" : `${cCount} comments`;
			const canDelete = myUsername && s.username === myUsername;
			return `
        <div class="hub-item" data-item-type="scenario" data-item-id="${s.id}">
            <img src="${s.previewUrl || "https://images.websim.ai/v1/projects/placeholder/landscape"}" class="hub-preview-img">
            <div class="hub-content">
                <div class="hub-info">
                    <div class="hub-name">${s.name}</div>
                    <div class="hub-meta">
                        <img src="https://images.websim.com/avatar/${s.username}" class="hub-author-img">
                        <span>${s.username}</span>
                    </div>
                    ${
											s.remixed_from_name
												? `
                        <div style="font-size: 9px; color: #8e44ad; text-transform: uppercase; font-weight: 900; letter-spacing: 1px; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                            <span>🔄</span> REMIXED FROM ${s.remixed_from_name}
                        </div>
                    `
												: ""
										}
                </div>
                <div class="hub-description">${s.description || "No description provided."}</div>
                <div class="hub-comment-count">💬 ${cLabel}</div>
                <div class="hub-actions" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                    <div class="hub-actions-buttons" style="display:flex; gap:6px;">
                        ${canDelete ? `<button class="mini-btn" style="background:#c0392b; padding:6px 10px; font-size:9px;" onclick="window.deleteScenario('${s.id}')">DEL</button>` : ""}
                    </div>
                    <span style="font-size: 10px; color: #555;">${new Date(s.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    `;
		})
		.join("");

	// Attach click handlers to open item modal when clicking the card background
	hubList.querySelectorAll(".hub-item").forEach((card) => {
		if (card.dataset.boundClick) return;
		card.dataset.boundClick = "1";
		card.addEventListener("click", (ev) => {
			// Ignore clicks on buttons inside the card
			if (
				ev.target.closest(".hub-actions-buttons") ||
				ev.target.closest("button")
			)
				return;
			const id = card.getAttribute("data-item-id");
			if (!id) return;
			const item = hubScenarioCache[id];
			if (!item) return;
			openItemModal("scenario", item);
		});
	});
}

function selectScenario(cardId, action) {
	// 1. Update UI Selection
	document.querySelectorAll(".scroller-card").forEach((card) => {
		card.classList.remove("selected");
	});
	const selectedCard = document.getElementById(cardId);
	if (selectedCard) selectedCard.classList.add("selected");

	// 2. Change Menu Background
	const bgUrl = SCENARIO_MENU_BGS[cardId] || "/assets/images/2022.webp";
	if (mainMenu) {
		mainMenu.style.backgroundImage = `url('${bgUrl}')`;
	}

	// 3. Show Enter Button
	if (enterScenarioBtn) {
		enterScenarioBtn.style.display = "block";
		setQueuedScenarioAction(action);
	}

	playClickSound();
}

export { closeHub, openHub, renderHub, selectScenario, switchHubTab };
