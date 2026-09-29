// Dependencies are supplied by the application; this module does not import it.
export function createCommunityComments(runtime) {
	function renderCommentsList(comments) {
		if (!runtime.itemCommentsList) return;
		if (!comments || comments.length === 0) {
			runtime.itemCommentsList.innerHTML = `<div style="padding:10px; font-size: 12px; color:#777; text-align:center;">No comments yet. Be the first to brief this item.</div>`;
			return;
		}

		// Sort newest -> oldest from collection (already newest-first) but keep parent/replies grouped
		const byParent = new Map();
		comments.forEach((c) => {
			const parentId = c.parent_id || null;
			if (!byParent.has(parentId)) byParent.set(parentId, []);
			byParent.get(parentId).push(c);
		});

		const renderThread = (parentId, depth = 0) => {
			const arr = byParent.get(parentId) || [];
			return arr
				.map((c) => {
					const created = new Date(c.created_at).toLocaleString();
					const safeText = runtime.escapeHtml(c.text || "");
					const safeUsername = runtime.escapeHtml(c.username);
					const safeCommentId = runtime.escapeHtml(c.id);
					const isMine =
						runtime.currentUsername && c.username === runtime.currentUsername;
					return `
                <div class="item-comment" data-comment-id="${safeCommentId}" style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); margin-left:${depth * 12}px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                        <img src="https://images.websim.com/avatar/${safeUsername}" style="width:16px; height:16px; border-radius:50%; background:#000;">
                        <span style="font-size: 12px; color:#ddd;">${safeUsername}</span>
                        <span style="font-size: 12px; color:#555; margin-left:auto;">${created}</span>
                    </div>
                    <div class="item-comment-text" style="font-size:12px; color:#ccc; white-space:pre-wrap;">${safeText}</div>
                    <div style="margin-top:4px; display:flex; gap:4px;">
                        <button class="mini-btn item-reply-btn" style="padding:2px 6px; font-size: 12px;">Reply</button>
                        ${
													isMine
														? `
                            <button class="mini-btn item-edit-btn" style="padding:2px 6px; font-size: 12px;">Edit</button>
                            <button class="mini-btn item-delete-btn" style="padding:2px 6px; font-size: 12px; background:#c0392b;">Delete</button>
                        `
														: ""
												}
                    </div>
                </div>
                ${renderThread(c.id, depth + 1)}
            `;
				})
				.join("");
		};

		runtime.itemCommentsList.innerHTML = renderThread(null);

		// Wire reply buttons
		runtime.itemCommentsList
			.querySelectorAll(".item-reply-btn")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const commentEl = btn.closest(".item-comment");
					if (!commentEl) return;
					runtime.currentReplyParentId =
						commentEl.getAttribute("data-comment-id");
					runtime.currentEditingCommentId = null;
					runtime.itemReplyIndicator.style.display = "inline-block";
					runtime.itemReplyIndicator.textContent = "Replying...";
					runtime.itemCancelReplyBtn.style.display = "inline-block";
					runtime.itemCommentSubmit.textContent = "Post";
					runtime.itemCommentInput.focus();
				});
			});

		// Wire edit buttons (only for own comments)
		runtime.itemCommentsList
			.querySelectorAll(".item-edit-btn")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const commentEl = btn.closest(".item-comment");
					if (!commentEl) return;
					const id = commentEl.getAttribute("data-comment-id");
					const comment = comments.find((c) => c.id === id);
					if (!comment || comment.username !== runtime.currentUsername) return;
					runtime.currentEditingCommentId = id;
					runtime.currentReplyParentId = comment.parent_id || null;
					const textEl = commentEl.querySelector(".item-comment-text");
					const currentText = textEl ? textEl.textContent : comment.text || "";
					runtime.itemCommentInput.value = currentText;
					runtime.itemReplyIndicator.style.display = "inline-block";
					runtime.itemReplyIndicator.textContent = "Editing...";
					runtime.itemCancelReplyBtn.style.display = "inline-block";
					runtime.itemCommentSubmit.textContent = "Save";
					runtime.itemCommentInput.focus();
				});
			});

		// Wire delete buttons (only for own comments)
		runtime.itemCommentsList
			.querySelectorAll(".item-delete-btn")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					const commentEl = btn.closest(".item-comment");
					if (!commentEl) return;
					const id = commentEl.getAttribute("data-comment-id");
					const comment = comments.find((c) => c.id === id);
					if (!comment || comment.username !== runtime.currentUsername) return;
					if (!confirm("Delete this comment?")) return;
					(async () => {
						try {
							await runtime.room.collection("hub_comment_v1").delete(id);
						} catch (e) {
							console.error("Failed to delete comment", e);
							alert("Failed to delete comment.");
						}
					})();
				});
			});
	}

	async function openItemModal(type, item) {
		runtime.currentCommentItemType = type;
		runtime.currentCommentItemId = item.id;
		runtime.currentReplyParentId = null;
		runtime.currentEditingCommentId = null;
		if (runtime.commentsUnsubscribe) {
			runtime.commentsUnsubscribe();
			runtime.commentsUnsubscribe = null;
		}

		// Title / desc / preview
		runtime.itemModalTitle.textContent = (
			item.name || "Item Details"
		).toUpperCase();
		const desc = item.description || item.desc || "";
		runtime.itemModalDesc.textContent = desc;

		const authorEl = document.getElementById("item-modal-author-name");
		if (authorEl) {
			authorEl.textContent = item.username || "Intel Report";
		}

		if (item.previewUrl || item.flagUrl) {
			runtime.itemModalPreview.src = item.previewUrl || item.flagUrl;
			runtime.itemModalPreview.style.display = "block";
		} else {
			runtime.itemModalPreview.style.display = "none";
		}

		// Configure big-card actions for all item types
		if (runtime.itemModalActions) {
			const canImport = runtime.gameMode === "EDITOR" || runtime.godModeActive;
			const itemModalDeleteBtn = document.getElementById("item-modal-delete");
			const isOwner =
				runtime.currentUsername && item.username === runtime.currentUsername;

			if (itemModalDeleteBtn) {
				itemModalDeleteBtn.style.display = isOwner ? "inline-flex" : "none";
				itemModalDeleteBtn.onclick = () => {
					if (type === "scenario") window.deleteScenario(item.id);
					else if (type === "country") window.deleteCountry(item.id);
					else if (type === "flag") window.deleteFlag(item.id);
					runtime.itemCommentModal.style.display = "none";
				};
			}

			if (type === "scenario") {
				// Play / Remix a scenario
				runtime.itemModalActions.style.display = "flex";
				if (runtime.itemModalPlayBtn) {
					runtime.itemModalPlayBtn.style.display = "inline-flex";
					runtime.itemModalPlayBtn.textContent = "Play";
					runtime.itemModalPlayBtn.onclick = () => {
						if (window.playFromHub) {
							window.playFromHub(
								item.blobUrl,
								item.id,
								item.name || "",
								item.username || "",
							);
							runtime.itemCommentModal.style.display = "none";
							runtime.closeHub();
						}
					};
				}
				if (runtime.itemModalRemixBtn) {
					runtime.itemModalRemixBtn.style.display = "inline-flex";
					runtime.itemModalRemixBtn.textContent = "Remix";
					runtime.itemModalRemixBtn.onclick = () => {
						if (window.remixFromHub) {
							window.remixFromHub(
								item.blobUrl,
								item.id,
								item.name || "",
								item.username || "",
							);
							runtime.itemCommentModal.style.display = "none";
							runtime.closeHub();
						}
					};
				}
			} else if (type === "country") {
				// Import a country into the current editor map
				runtime.itemModalActions.style.display =
					canImport || isOwner ? "flex" : "none";
				if (runtime.itemModalPlayBtn) {
					runtime.itemModalPlayBtn.style.display = canImport
						? "inline-flex"
						: "none";
					runtime.itemModalPlayBtn.textContent = "Import";
					runtime.itemModalPlayBtn.onclick = () => {
						if (window.importFromLibrary) {
							window.importFromLibrary(item.id);
							runtime.itemCommentModal.style.display = "none";
						}
					};
				}
				if (runtime.itemModalRemixBtn) {
					runtime.itemModalRemixBtn.style.display = "none";
					runtime.itemModalRemixBtn.onclick = null;
				}
			} else if (type === "flag") {
				// Use a flag from the library on the currently selected country
				runtime.itemModalActions.style.display =
					canImport || isOwner ? "flex" : "none";
				if (runtime.itemModalPlayBtn) {
					runtime.itemModalPlayBtn.style.display = canImport
						? "inline-flex"
						: "none";
					runtime.itemModalPlayBtn.textContent = "Use Flag";
					runtime.itemModalPlayBtn.onclick = () => {
						if (window.importFlagFromLibrary) {
							window.importFlagFromLibrary(item.id);
							runtime.itemCommentModal.style.display = "none";
						}
					};
				}
				if (runtime.itemModalRemixBtn) {
					runtime.itemModalRemixBtn.style.display = "none";
					runtime.itemModalRemixBtn.onclick = null;
				}
			} else {
				runtime.itemModalActions.style.display = isOwner ? "flex" : "none";
				if (runtime.itemModalPlayBtn)
					runtime.itemModalPlayBtn.style.display = "none";
				if (runtime.itemModalRemixBtn)
					runtime.itemModalRemixBtn.style.display = "none";
			}
		}

		// Clear composer
		runtime.itemCommentInput.value = "";
		runtime.itemReplyIndicator.style.display = "none";
		runtime.itemCancelReplyBtn.style.display = "none";
		runtime.itemCommentSubmit.textContent = "Post";

		// Subscribe to comments for this item (using records)
		try {
			const coll = runtime.room.collection("hub_comment_v1").filter({
				item_type: type,
				item_id: item.id,
			});
			runtime.commentsUnsubscribe = coll.subscribe((records) => {
				renderCommentsList(records || []);
			});
			// Initial render
			renderCommentsList(coll.getList());
		} catch (e) {
			console.warn("Comment subscription failed", e);
			renderCommentsList([]);
		}

		runtime.itemCommentModal.style.display = "flex";
	}
	return { renderCommentsList, openItemModal };
}
