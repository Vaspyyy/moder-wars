// Dependencies are supplied by the application; this module does not import it.
export function createCommunityChat(runtime) {
	function renderGlobalChatList(messages) {
		if (!runtime.globalChatList) return;
		if (!messages || messages.length === 0) {
			runtime.globalChatList.innerHTML = `<div style="text-align:center; font-size: 12px; color:#666; padding:16px;">No messages yet. Say hello!</div>`;
			return;
		}
		// oldest at top
		const sorted = messages
			.slice()
			.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
		runtime.globalChatList.innerHTML = sorted
			.map((m) => {
				const created = new Date(m.created_at).toLocaleTimeString();
				const safeText = runtime.escapeHtml(m.text || "");
				const safeUsername = runtime.escapeHtml(m.username);
				const isMine =
					runtime.currentUsername && m.username === runtime.currentUsername;
				return `
            <div style="margin-bottom:6px; font-size:12px; ${isMine ? "text-align:right;" : ""}">
                <div style="display:flex; ${isMine ? "flex-direction:row-reverse;" : ""} align-items:center; gap:6px;">
                    <img src="https://images.websim.com/avatar/${safeUsername}" style="width:16px; height:16px; border-radius:50%; background:#000;">
                    <span style="font-size: 12px; color:#ddd;">${safeUsername}</span>
                    <span style="font-size: 12px; color:#555;">${created}</span>
                </div>
                <div style="margin-top:2px; color:#ccc; white-space:pre-wrap;">${safeText}</div>
            </div>
        `;
			})
			.join("");
		runtime.globalChatList.scrollTop = runtime.globalChatList.scrollHeight;
	}

	async function _openGlobalChat() {
		if (!runtime.globalChatModal) return;
		if (!runtime.room) {
			try {
				await runtime.initMultiplayer();
			} catch (e) {
				console.warn("Failed to init multiplayer for chat", e);
			}
		}
		runtime.globalChatModal.style.display = "flex";
		if (runtime.room && !runtime.globalChatUnsubscribe) {
			const coll = runtime.room.collection("global_chat_v1");
			runtime.globalChatUnsubscribe = coll.subscribe((records) => {
				renderGlobalChatList(records || []);
			});
			renderGlobalChatList(coll.getList());
		}
	}
	return { renderGlobalChatList, _openGlobalChat };
}
