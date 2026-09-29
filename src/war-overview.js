/** Minimal live HUD; no history, recording, or storage. */
export function initWarOverview(documentRef = document) {
	const button = documentRef.getElementById("war-desk-toggle-btn");
	const body = documentRef.getElementById("war-desk-body");
	if (!button || !body) return;
	button.addEventListener("click", () => {
		body.hidden = !body.hidden;
		documentRef
			.getElementById("war-desk")
			?.classList.toggle("collapsed", body.hidden);
		button.title = body.hidden
			? "Expand War Overview"
			: "Collapse War Overview";
		button.setAttribute("aria-label", button.title);
		button.textContent = body.hidden ? "+" : "−";
		button.setAttribute("aria-expanded", String(!body.hidden));
	});
}

export function renderWarOverview(rows, documentRef = document) {
	const target = documentRef.getElementById("war-desk-overview-metrics");
	if (!target) return;
	const create = (tag, className, text) => {
		const element = documentRef.createElement(tag);
		element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	};
	const fragment = documentRef.createDocumentFragment();
	for (const row of rows) {
		const card = create(
			"div",
			`war-desk-metric war-desk-metric--paired${row.kind === "country" ? " war-desk-metric--country" : ""}`,
		);
		if (row.color)
			card.style.setProperty(
				"--war-accent",
				row.color.replace(/[\d.]+\)$/, "1)"),
			);
		card.append(create("span", "", row.label));
		const values = create("div", "war-desk-metric-values");
		for (const [label, number] of [
			[row.primaryLabel || "Manpower", row.value],
			["Casualties", row.secondaryValue],
		]) {
			const value = create("span", "war-desk-metric-value");
			value.append(
				create("small", "", label),
				create(
					"strong",
					"",
					Math.max(0, Math.round(number || 0)).toLocaleString(),
				),
			);
			values.append(value);
		}
		card.append(values, create("small", "", row.detail));
		fragment.append(card);
	}
	target.replaceChildren(fragment);
}
