/**
 * In-game replacements for window.alert, confirm and prompt. Dialogs queue, so
 * only one is open at a time; each call returns a promise that settles when the
 * player answers it. The DOM is built on first use, so importing is browser-free.
 */
import { el } from "./dom.js";

const queue = [];
let current = null;
let elements = null;

function build() {
	const overlay = document.createElement("div");
	overlay.className = "settings-overlay game-dialog-overlay";
	overlay.style.display = "none";
	const title = el("h2", {
		className: "settings-title game-dialog-title",
		id: "game-dialog-title",
	});
	const message = el("p", {
		className: "game-dialog-message",
		id: "game-dialog-message",
	});
	const input = el("input", {
		className: "game-dialog-input",
		attrs: { type: "text", autocomplete: "off", spellcheck: "false" },
	});
	const cancel = el("button", {
		className: "start-btn game-dialog-cancel",
		attrs: { type: "button" },
	});
	const ok = el("button", {
		className: "start-btn game-dialog-ok",
		attrs: { type: "button" },
	});
	const dialog = el(
		"div",
		{
			className: "settings-content game-dialog",
			attrs: {
				role: "alertdialog",
				"aria-modal": "true",
				"aria-labelledby": "game-dialog-title",
				"aria-describedby": "game-dialog-message",
			},
		},
		title,
		message,
		input,
		el("div", { className: "game-dialog-actions" }, cancel, ok),
	);
	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
	elements = { overlay, dialog, title, message, input, ok, cancel };
	elements.ok.addEventListener("click", () => close(true));
	elements.cancel.addEventListener("click", () => close(false));
	// Clicking the backdrop dismisses an alert, but never answers a question.
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay && current?.kind === "alert") close(true);
	});
	// Capture on window so game shortcuts (Space, Escape, +/−) never see keys
	// meant for the dialog. Default actions such as typing still happen.
	window.addEventListener(
		"keydown",
		(event) => {
			if (!current) return;
			if (event.key === "Tab") {
				trapFocus(event);
				return;
			}
			event.stopPropagation();
			if (event.key === "Escape") {
				event.preventDefault();
				close(current.kind === "alert");
			} else if (
				event.key === "Enter" &&
				!event.isComposing &&
				document.activeElement !== elements.cancel
			) {
				event.preventDefault();
				close(true);
			}
		},
		true,
	);
	return elements;
}

function trapFocus(event) {
	const focusable = [elements.input, elements.cancel, elements.ok].filter(
		(element) => element.style.display !== "none",
	);
	const index = focusable.indexOf(document.activeElement);
	const next = event.shiftKey
		? focusable[(index - 1 + focusable.length) % focusable.length]
		: focusable[(index + 1) % focusable.length];
	event.preventDefault();
	next.focus();
}

function open(request) {
	const ui = elements || build();
	current = request;
	request.restoreFocus = document.activeElement;
	ui.dialog.classList.toggle("game-dialog--danger", Boolean(request.danger));
	ui.title.textContent = request.title;
	ui.title.style.display = request.title ? "" : "none";
	ui.message.textContent = request.message;
	ui.input.style.display = request.kind === "prompt" ? "" : "none";
	ui.input.value = request.defaultValue ?? "";
	ui.cancel.style.display = request.kind === "alert" ? "none" : "";
	ui.cancel.textContent = request.cancelLabel;
	ui.ok.textContent = request.okLabel;
	ui.overlay.style.display = "flex";
	if (request.kind === "prompt") {
		ui.input.focus();
		ui.input.select();
	} else ui.ok.focus();
}

function close(accepted) {
	const request = current;
	if (!request) return;
	current = null;
	elements.overlay.style.display = "none";
	if (request.kind === "prompt")
		request.resolve(accepted ? elements.input.value : null);
	else request.resolve(request.kind === "alert" ? undefined : accepted);
	if (queue.length) open(queue.shift());
	else if (request.restoreFocus?.isConnected) request.restoreFocus.focus?.();
}

function enqueue(request) {
	return new Promise((resolve) => {
		const entry = { ...request, resolve };
		if (current) queue.push(entry);
		else open(entry);
	});
}

/** Shows a message. Resolves when the player dismisses it. */
export function showAlert(message, { title = "", okLabel = "OK" } = {}) {
	return enqueue({ kind: "alert", message: String(message), title, okLabel });
}

/** Asks a yes/no question. Resolves to true only if the player confirms. */
export function showConfirm(
	message,
	{
		title = "",
		okLabel = "Confirm",
		cancelLabel = "Cancel",
		danger = false,
	} = {},
) {
	return enqueue({
		kind: "confirm",
		message: String(message),
		title,
		okLabel,
		cancelLabel,
		danger,
	});
}

/** Asks for text. Resolves to the entered string, or null if cancelled. */
export function showPrompt(
	message,
	defaultValue = "",
	{ title = "", okLabel = "OK", cancelLabel = "Cancel" } = {},
) {
	return enqueue({
		kind: "prompt",
		message: String(message),
		defaultValue: String(defaultValue ?? ""),
		title,
		okLabel,
		cancelLabel,
	});
}
