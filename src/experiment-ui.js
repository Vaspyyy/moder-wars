/**
 * DOM presenter/controller for the Experiment Loop surfaces.
 *
 * Callback contract (all callbacks are optional):
 * - onSeedChanged(values, event)
 * - onRandomizeSeed(values, event)
 * - onForceModeChanged(values, event)
 * - onSetupPostureChanged(values, event)
 * - onStartExperiment(values, event)
 * - onOpenArchive(event)
 * - onCloseArchive(event)
 * - onArchiveReportSelected(report, index, event)
 * - onInterventionOpened(event)
 * - onApplyPosture(values, event)
 * - onAddFunds(values, event)
 * - onClearArrears(values, event)
 * - onAddManpower(values, event)
 * - onAddArmor(values, event)
 * - onAddFighters(values, event)
 * - onAddStrikeAircraft(values, event)
 * - onJoinSide(values, event)
 * - onWithdraw(values, event)
 * - onStartRebellion(values, event)
 * - onEnforcePeace(values, event)
 * - onInspectFinalMap(report, event)
 * - onFreshRematch(report, event)
 * - onRepeatSeed(report, event)
 * - onModifySetup(report, event)
 * - onContinueWorld(report, event)
 * - onAfterActionMainMenu(report, event)
 * - onReopenReport(report, event)
 * - onWarDeskCollapsed(collapsed, event)
 */

export const EXPERIMENT_UI_CALLBACKS = Object.freeze([
	"onSeedChanged",
	"onRandomizeSeed",
	"onForceModeChanged",
	"onSetupPostureChanged",
	"onStartExperiment",
	"onOpenArchive",
	"onCloseArchive",
	"onArchiveReportSelected",
	"onInterventionOpened",
	"onApplyPosture",
	"onAddFunds",
	"onClearArrears",
	"onAddManpower",
	"onAddArmor",
	"onAddFighters",
	"onAddStrikeAircraft",
	"onJoinSide",
	"onWithdraw",
	"onStartRebellion",
	"onEnforcePeace",
	"onInspectFinalMap",
	"onFreshRematch",
	"onRepeatSeed",
	"onModifySetup",
	"onContinueWorld",
	"onAfterActionMainMenu",
	"onReopenReport",
	"onWarDeskCollapsed",
]);

const NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
});

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
	style: "percent",
});

const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
	notation: "compact",
});

function asText(value, fallback = "") {
	if (value === null || value === undefined) return fallback;
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return fallback;
}

function humanizeKey(value) {
	return asText(value, "Unknown")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finiteNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

/** Format a metric value without assuming a specific report schema. */
export function formatExperimentMetric(value, key = "") {
	if (value === null || value === undefined || value === "") return "—";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	const number = finiteNumber(value);
	if (number === null || typeof value === "string") return asText(value, "—");

	const normalizedKey = key.toLowerCase();
	if (normalizedKey.includes("percent") || normalizedKey.includes("share")) {
		const ratio = Math.abs(number) <= 1 ? number : number / 100;
		return PERCENT_FORMAT.format(ratio);
	}
	if (
		normalizedKey.includes("personnel") ||
		normalizedKey.includes("manpower") ||
		normalizedKey.includes("casualt") ||
		normalizedKey.includes("treasury") ||
		normalizedKey.includes("fund") ||
		Math.abs(number) >= 10000
	) {
		return COMPACT_NUMBER_FORMAT.format(number);
	}
	return NUMBER_FORMAT.format(number);
}

function stringifyDate(value) {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number") return `Tick ${NUMBER_FORMAT.format(value)}`;
	if (typeof value === "object") {
		const year = finiteNumber(value.year);
		const month = finiteNumber(value.month);
		const day = finiteNumber(value.day);
		if (year !== null) {
			return [year, month, day]
				.filter((part) => part !== null)
				.map((part, index) =>
					index === 0 ? String(part) : String(part).padStart(2, "0"),
				)
				.join("/");
		}
	}
	return "";
}

function evidenceText(evidence) {
	if (!evidence) return "";
	if (typeof evidence === "string") return evidence;
	if (Array.isArray(evidence)) {
		return evidence
			.map((item) => asText(item))
			.filter(Boolean)
			.join(" · ");
	}
	if (typeof evidence === "object") {
		const explicit =
			evidence.summary ||
			evidence.statement ||
			evidence.reason ||
			evidence.description;
		if (explicit) return asText(explicit);
		return Object.entries(evidence)
			.filter(([, value]) =>
				["string", "number", "boolean"].includes(typeof value),
			)
			.slice(0, 4)
			.map(
				([key, value]) =>
					`${humanizeKey(key)}: ${formatExperimentMetric(value, key)}`,
			)
			.join(" · ");
	}
	return "";
}

/** Return a concise, human-readable label and detail for a WarEvent-like object. */
export function describeWarEvent(event = {}) {
	if (typeof event === "string") {
		return { detail: "", label: event, time: "" };
	}
	const label = asText(
		event.title || event.label || event.summary || event.message,
		humanizeKey(event.type || "War event"),
	);
	const explicitDetail =
		event.description ||
		event.detail ||
		(event.summary === label ? "" : event.summary) ||
		evidenceText(event.evidence);
	const date = stringifyDate(event.date || event.simulationDate);
	const tick = finiteNumber(event.tick ?? event.simulationTick);
	return {
		detail: asText(explicitDetail),
		label,
		time: date || (tick === null ? "" : `Tick ${NUMBER_FORMAT.format(tick)}`),
	};
}

function createElement(documentRef, tag, className = "", text = "") {
	const node = documentRef.createElement(tag);
	if (className) node.className = className;
	if (text !== "") node.textContent = asText(text);
	return node;
}

function appendEmptyState(documentRef, target, message) {
	if (!target) return;
	const tag = ["OL", "UL"].includes(target.tagName) ? "li" : "p";
	const empty = createElement(documentRef, tag, "war-desk-empty", message);
	target.replaceChildren(empty);
}

function setTone(node, tone) {
	if (!node) return;
	if (tone) node.dataset.tone = tone;
	else delete node.dataset.tone;
}

function metricEntries(value, limit = 8) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.slice(0, limit).map((entry, index) => {
			if (entry && typeof entry === "object") {
				return {
					delta: entry.delta,
					key: asText(entry.key || entry.id, `metric-${index}`),
					label: asText(entry.label || entry.name, `Metric ${index + 1}`),
					tone: asText(entry.tone),
					value: entry.value ?? entry.amount ?? entry.total ?? "—",
				};
			}
			return {
				delta: null,
				key: `metric-${index}`,
				label: `Metric ${index + 1}`,
				tone: "",
				value: entry,
			};
		});
	}
	if (typeof value === "object") {
		return Object.entries(value)
			.filter(
				([, entry]) =>
					entry === null ||
					["string", "number", "boolean"].includes(typeof entry),
			)
			.slice(0, limit)
			.map(([key, entry]) => ({
				delta: null,
				key,
				label: humanizeKey(key),
				tone: "",
				value: entry,
			}));
	}
	return [];
}

function nestedMetricEntries(value, limit = 8) {
	const direct = metricEntries(value, limit);
	if (direct.length > 0) return direct;
	if (!value || typeof value !== "object") return [];
	const entries = [];
	for (const [group, groupValue] of Object.entries(value)) {
		for (const entry of metricEntries(groupValue, limit - entries.length)) {
			entries.push({
				...entry,
				key: `${group}.${entry.key}`,
				label: `${humanizeKey(group)} ${entry.label}`,
			});
			if (entries.length >= limit) return entries;
		}
	}
	return entries;
}

function renderMetricCards(documentRef, target, metrics, emptyMessage) {
	if (!target) return;
	const entries = metricEntries(metrics);
	if (entries.length === 0) {
		appendEmptyState(documentRef, target, emptyMessage);
		return;
	}
	const fragment = documentRef.createDocumentFragment();
	for (const entry of entries) {
		const card = createElement(documentRef, "div", "war-desk-metric");
		setTone(card, entry.tone);
		card.append(
			createElement(documentRef, "span", "", entry.label),
			createElement(
				documentRef,
				"strong",
				"",
				formatExperimentMetric(entry.value, entry.key),
			),
		);
		if (entry.delta !== null && entry.delta !== undefined) {
			const delta = finiteNumber(entry.delta);
			const formatted = formatExperimentMetric(entry.delta, entry.key);
			card.append(
				createElement(
					documentRef,
					"small",
					delta !== null && delta > 0 ? "positive" : "",
					`${delta !== null && delta > 0 ? "+" : ""}${formatted}`,
				),
			);
		}
		fragment.append(card);
	}
	target.replaceChildren(fragment);
}

function renderTelemetryList(documentRef, target, values, emptyMessage) {
	if (!target) return;
	const entries = Array.isArray(values)
		? values
		: values && typeof values === "object"
			? Object.entries(values).map(([label, value]) => ({ label, value }))
			: [];
	if (entries.length === 0) {
		appendEmptyState(documentRef, target, emptyMessage);
		return;
	}
	const fragment = documentRef.createDocumentFragment();
	for (const [index, rawEntry] of entries.entries()) {
		const entry =
			rawEntry && typeof rawEntry === "object"
				? rawEntry
				: { label: `Entry ${index + 1}`, value: rawEntry };
		const row = createElement(documentRef, "div", "war-desk-list-row");
		const label = asText(
			entry.label || entry.name || entry.countryName || entry.sideName,
			`Entry ${index + 1}`,
		);
		const value = entry.value ?? entry.summary ?? entry.status ?? entry.amount;
		row.append(
			createElement(documentRef, "span", "", label),
			createElement(
				documentRef,
				"strong",
				"",
				formatExperimentMetric(value, asText(entry.key || entry.label)),
			),
		);
		const detail =
			entry.detail || entry.description || evidenceText(entry.evidence);
		if (detail) row.append(createElement(documentRef, "small", "", detail));
		setTone(row, asText(entry.tone));
		fragment.append(row);
	}
	target.replaceChildren(fragment);
}

function renderEventList(documentRef, target, events, emptyMessage) {
	if (!target) return;
	if (!Array.isArray(events) || events.length === 0) {
		appendEmptyState(documentRef, target, emptyMessage);
		return;
	}
	const fragment = documentRef.createDocumentFragment();
	for (const event of events) {
		const description = describeWarEvent(event);
		const item = createElement(documentRef, "li", "war-event-item");
		const heading = createElement(documentRef, "div", "war-event-heading");
		heading.append(createElement(documentRef, "strong", "", description.label));
		if (description.time) {
			heading.append(createElement(documentRef, "time", "", description.time));
		}
		item.append(heading);
		if (description.detail) {
			item.append(createElement(documentRef, "p", "", description.detail));
		}
		fragment.append(item);
	}
	target.replaceChildren(fragment);
}

function reportOutcome(report = {}) {
	const outcome = report.outcome;
	if (typeof outcome === "string") return humanizeKey(outcome);
	const winner =
		outcome?.winnerSideName ||
		outcome?.winnerName ||
		report.winnerSideName ||
		report.winnerName ||
		report.winner?.name;
	if (winner) return `${winner} prevails`;
	const result =
		outcome?.label || outcome?.type || report.result || report.endingType;
	return result ? humanizeKey(result) : "Experiment Complete";
}

function reportEndingReason(report = {}) {
	return asText(
		report.exactEndingReason ||
			report.endingReason ||
			report.outcome?.endingReason ||
			report.outcome?.reason ||
			report.outcome?.type,
	);
}

function reportEndingType(report = {}) {
	const outcome = report.outcome;
	const type =
		(typeof outcome === "object" ? outcome?.type : outcome) ||
		report.endingType ||
		report.result;
	return type ? humanizeKey(type) : "";
}

function reportDuration(report = {}) {
	const explicit = report.durationLabel || report.outcome?.durationLabel;
	if (explicit) return asText(explicit);
	const days = finiteNumber(
		report.durationDays ?? report.outcome?.durationDays,
	);
	if (days !== null) return `${NUMBER_FORMAT.format(days)} days`;
	const ticks = finiteNumber(
		report.durationTicks ?? report.outcome?.durationTicks ?? report.finalTick,
	);
	return ticks === null ? "" : `${NUMBER_FORMAT.format(ticks)} ticks`;
}

function reportBuild(report = {}) {
	return asText(
		report.build ||
			report.buildVersion ||
			report.configuration?.build ||
			report.configuration?.buildVersion ||
			report.spec?.build,
	);
}

function reportSeed(report = {}) {
	return report.seed ?? report.configuration?.seed ?? report.spec?.seed;
}

function reportFactors(report = {}) {
	const factors =
		report.decisiveContributors || report.contributors || report.factors || [];
	return Array.isArray(factors) ? factors.slice(0, 3) : [];
}

function reportEvents(report = {}) {
	const events = report.pivotalEvents || report.events || report.timeline || [];
	if (!Array.isArray(events)) return [];
	return events.slice(0, 10);
}

function reportInterventions(report = {}) {
	return Array.isArray(report.interventions) ? report.interventions : [];
}

function reportComparison(report = {}) {
	return (
		report.comparisonDeltas ||
		report.comparison ||
		report.deltas ||
		report.parentComparison ||
		null
	);
}

/** Normalize common final-side-metric layouts to an array for presentation. */
export function normalizeReportSides(report = {}) {
	const source =
		report.finalSideMetrics ||
		report.finalMetrics?.sides ||
		report.finalMetrics ||
		report.metrics?.final?.sides ||
		report.metrics?.final ||
		report.sideMetrics ||
		[];
	if (Array.isArray(source)) return source;
	if (source && typeof source === "object") {
		return Object.entries(source).map(([sideUid, metrics]) =>
			metrics && typeof metrics === "object"
				? { sideUid, ...metrics }
				: { sideUid, value: metrics },
		);
	}
	return [];
}

function reportId(report, fallback = "") {
	return asText(report?.id || report?.reportId || report?.runId, fallback);
}

function reportTimestamp(report = {}) {
	const value =
		report.finalizedAt ||
		report.completedAt ||
		report.finishedAt ||
		report.createdAt ||
		report.timestamp;
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? asText(value) : date.toLocaleString();
}

function renderMeta(documentRef, target, report) {
	if (!target) return;
	const entries = [
		reportEndingType(report) ? `Ending · ${reportEndingType(report)}` : "",
		reportEndingReason(report),
		reportDuration(report),
		reportSeed(report) === undefined ? "" : `Seed ${reportSeed(report)}`,
		reportBuild(report) ? `Build ${reportBuild(report)}` : "",
		reportTimestamp(report),
	].filter(Boolean);
	if (report.configuration?.runMode === "REPEAT_SEED") {
		entries.push("Comparable start · not an exact replay");
	}
	if (report.modified) entries.push("Modified");
	const fragment = documentRef.createDocumentFragment();
	for (const entry of entries) {
		const chip = createElement(documentRef, "span", "report-meta-chip", entry);
		if (entry === "Modified") chip.dataset.tone = "modified";
		fragment.append(chip);
	}
	target.replaceChildren(fragment);
}

function comparisonDeltaTone(value, key) {
	if (typeof value === "boolean") return "";
	const number = finiteNumber(value);
	if (number === null || number === 0) return "";
	const normalizedKey = asText(key).toLowerCase();
	if (normalizedKey.includes("duration") || normalizedKey.includes("outcome")) {
		return "";
	}
	if (normalizedKey.includes("casualt")) {
		return number > 0 ? "negative" : "positive";
	}
	return number > 0 ? "positive" : "negative";
}

function renderFactors(documentRef, target, report) {
	if (!target) return;
	const factors = reportFactors(report);
	if (factors.length === 0) {
		appendEmptyState(
			documentRef,
			target,
			"No decisive contributors were identified for this run.",
		);
		return;
	}
	const fragment = documentRef.createDocumentFragment();
	for (const [index, factor] of factors.entries()) {
		const normalized =
			factor && typeof factor === "object" ? factor : { statement: factor };
		const card = createElement(documentRef, "article", "after-action-factor");
		card.append(
			createElement(
				documentRef,
				"span",
				"after-action-factor-rank",
				String(index + 1).padStart(2, "0"),
			),
			createElement(
				documentRef,
				"strong",
				"",
				asText(
					normalized.title || normalized.label || normalized.type,
					"Observed advantage",
				),
			),
		);
		const detail = asText(
			normalized.statement ||
				normalized.summary ||
				normalized.description ||
				evidenceText(normalized.evidence),
		);
		if (detail) card.append(createElement(documentRef, "p", "", detail));
		fragment.append(card);
	}
	target.replaceChildren(fragment);
}

function renderSideMetrics(documentRef, target, report) {
	if (!target) return;
	const sides = normalizeReportSides(report);
	if (sides.length === 0) {
		appendEmptyState(
			documentRef,
			target,
			"Final side metrics are unavailable.",
		);
		return;
	}
	const fragment = documentRef.createDocumentFragment();
	for (const [index, side] of sides.entries()) {
		const card = createElement(
			documentRef,
			"article",
			"after-action-side-card",
		);
		const label = asText(
			side.name || side.label || side.sideName || side.uid || side.sideUid,
			`Side ${index + 1}`,
		);
		card.append(createElement(documentRef, "h3", "", label));
		const list = createElement(documentRef, "dl", "after-action-metric-list");
		const omitted = new Set([
			"name",
			"label",
			"sideName",
			"uid",
			"sideUid",
			"countries",
		]);
		const sanitized = Object.fromEntries(
			Object.entries(side).filter(([key]) => !omitted.has(key)),
		);
		for (const metric of nestedMetricEntries(sanitized, 16)) {
			list.append(
				createElement(documentRef, "dt", "", metric.label),
				createElement(
					documentRef,
					"dd",
					"",
					formatExperimentMetric(metric.value, metric.key),
				),
			);
		}
		card.append(list);
		fragment.append(card);
	}
	target.replaceChildren(fragment);
}

function renderInterventions(documentRef, target, report) {
	if (!target) return;
	const interventions = reportInterventions(report);
	if (interventions.length === 0) {
		appendEmptyState(
			documentRef,
			target,
			"No director interventions were applied.",
		);
		return;
	}
	const list = createElement(
		documentRef,
		"ol",
		"after-action-intervention-list",
	);
	for (const intervention of interventions) {
		const normalized =
			intervention && typeof intervention === "object"
				? intervention
				: { action: intervention };
		const label = asText(
			normalized.label || normalized.action || normalized.type,
			"Director intervention",
		);
		const detail = asText(
			normalized.summary ||
				normalized.description ||
				evidenceText(normalized.evidence),
		);
		const item = createElement(documentRef, "li", "");
		item.append(createElement(documentRef, "strong", "", humanizeKey(label)));
		if (detail) item.append(createElement(documentRef, "span", "", detail));
		list.append(item);
	}
	target.replaceChildren(list);
}

function renderComparison(documentRef, target, report) {
	if (!target) return;
	const comparison = reportComparison(report);
	if (!comparison) {
		appendEmptyState(documentRef, target, "No parent run to compare.");
		return;
	}
	const entries = nestedMetricEntries(comparison, 12).filter(
		(entry) => entry.key !== "parentReportId",
	);
	const sideDeltas = Array.isArray(comparison.sideDeltas)
		? comparison.sideDeltas
		: [];
	if (entries.length === 0 && sideDeltas.length === 0) {
		appendEmptyState(
			documentRef,
			target,
			"No measurable changes from the parent run.",
		);
		return;
	}
	const wrapper = createElement(
		documentRef,
		"div",
		"after-action-comparison-grid",
	);
	const list = createElement(documentRef, "dl", "after-action-comparison-list");
	for (const entry of entries) {
		const number = finiteNumber(entry.value);
		const value = formatExperimentMetric(entry.value, entry.key);
		list.append(
			createElement(documentRef, "dt", "", entry.label),
			createElement(
				documentRef,
				"dd",
				comparisonDeltaTone(entry.value, entry.key),
				`${number !== null && number > 0 ? "+" : ""}${value}`,
			),
		);
	}
	if (entries.length) wrapper.append(list);
	const reportSides = normalizeReportSides(report);
	for (const sideDelta of sideDeltas) {
		const side = reportSides.find(
			(candidate) => (candidate.sideUid || candidate.uid) === sideDelta.sideUid,
		);
		const card = createElement(
			documentRef,
			"section",
			"after-action-comparison-side",
		);
		card.append(
			createElement(
				documentRef,
				"h3",
				"",
				asText(side?.name || side?.label, sideDelta.sideUid || "Side"),
			),
		);
		const deltaList = createElement(
			documentRef,
			"dl",
			"after-action-comparison-list",
		);
		for (const key of [
			"territory",
			"cities",
			"casualties",
			"economy",
			"equipment",
		]) {
			const value = finiteNumber(sideDelta[key]);
			if (value === null) continue;
			deltaList.append(
				createElement(documentRef, "dt", "", humanizeKey(key)),
				createElement(
					documentRef,
					"dd",
					comparisonDeltaTone(value, key),
					`${value > 0 ? "+" : ""}${formatExperimentMetric(value, key)}`,
				),
			);
		}
		card.append(deltaList);
		wrapper.append(card);
	}
	target.replaceChildren(wrapper);
}

function optionValue(item, keys, fallback = "") {
	if (item === null || item === undefined) return fallback;
	if (typeof item !== "object") return asText(item, fallback);
	for (const key of keys) {
		if (item[key] !== null && item[key] !== undefined) return asText(item[key]);
	}
	return fallback;
}

/**
 * Initialize Experiment Loop UI wiring.
 * @param {Record<string, Function>} handlers optional integration callbacks
 * @param {Document} documentRef injectable document for smoke tests
 */
export function initExperimentUi(
	handlers = {},
	documentRef = globalThis.document,
) {
	if (!documentRef) {
		return createNoopController();
	}

	const byId = (id) => documentRef.getElementById(id);
	const listeners = [];
	const state = {
		archiveReports: [],
		archiveSelection: -1,
		collapsed: false,
		currentReport: null,
		inertBackgrounds: new Map(),
		modalReturnFocus: new Map(),
		warDeskTab: "overview",
	};

	const nodes = {
		afterAction: byId("after-action-report"),
		archive: byId("war-archive-overlay"),
		archiveDetail: byId("war-archive-detail"),
		archiveList: byId("war-archive-list"),
		forceBalance: byId("estimated-force-balance"),
		forceMode: byId("force-mode-select"),
		interventionAmount: byId("intervention-amount-input"),
		interventionCountry: byId("intervention-country-select"),
		interventionPosture: byId("intervention-posture-select"),
		interventionSide: byId("intervention-side-select"),
		interventionStatus: byId("intervention-status"),
		reopenReport: byId("reopen-report-btn"),
		seedInput: byId("experiment-seed-input"),
		seedStatus: byId("experiment-seed-status"),
		setupPosture: byId("setup-posture-select"),
		warDesk: byId("war-desk"),
		warDeskAdvantage: byId("war-desk-advantage"),
		warDeskBody: byId("war-desk-body"),
		warDeskEconomy: byId("war-desk-economy-content"),
		warDeskEvents: byId("war-desk-events-list"),
		warDeskMetrics: byId("war-desk-overview-metrics"),
		warDeskPhase: byId("war-desk-phase"),
		warDeskSummary: byId("war-desk-summary"),
		warDeskToggle: byId("war-desk-toggle-btn"),
	};
	const modalBackgrounds = [byId("main-ui"), byId("main-menu")].filter(Boolean);

	function invoke(name, ...args) {
		const handler = handlers[name];
		return typeof handler === "function" ? handler(...args) : undefined;
	}

	function listen(node, eventName, listener) {
		if (!node) return;
		node.addEventListener(eventName, listener);
		listeners.push(() => node.removeEventListener(eventName, listener));
	}

	function modalIsOpen(node) {
		return !!node && !node.hidden && node.style.display !== "none";
	}

	function setModalBackgroundInert(inert) {
		if (inert) {
			for (const background of modalBackgrounds) {
				if (!state.inertBackgrounds.has(background)) {
					state.inertBackgrounds.set(
						background,
						background.hasAttribute("inert"),
					);
				}
				background.setAttribute("inert", "");
			}
			return;
		}
		if (modalIsOpen(nodes.afterAction) || modalIsOpen(nodes.archive)) return;
		for (const [background, wasInert] of state.inertBackgrounds) {
			if (!wasInert) background.removeAttribute("inert");
		}
		state.inertBackgrounds.clear();
	}

	function focusModal(modal, preferredTarget) {
		if (!modal) return;
		const active = documentRef.activeElement;
		if (active && active !== documentRef.body && !modal.contains(active)) {
			state.modalReturnFocus.set(modal, active);
		}
		setModalBackgroundInert(true);
		const target = preferredTarget || modal.querySelector("button, [tabindex]");
		if (!target) return;
		if (
			!target.hasAttribute("tabindex") &&
			!target.matches("button, input, select")
		) {
			target.tabIndex = -1;
		}
		queueMicrotask(() => target.focus({ preventScroll: true }));
	}

	function restoreModalFocus(modal) {
		const returnTarget = state.modalReturnFocus.get(modal);
		state.modalReturnFocus.delete(modal);
		setModalBackgroundInert(false);
		if (returnTarget?.isConnected && !returnTarget.closest?.("[inert]")) {
			queueMicrotask(() => returnTarget.focus({ preventScroll: true }));
		}
	}

	function getSetupValues() {
		return {
			forceMode: nodes.forceMode?.value || "AUTO",
			posture: nodes.setupPosture?.value || "ADAPTIVE",
			seed: nodes.seedInput?.value || "",
		};
	}

	function getInterventionValues() {
		const rawAmount = nodes.interventionAmount?.value || "";
		const parsedAmount = finiteNumber(rawAmount);
		return {
			amount: parsedAmount ?? 0,
			countryId: nodes.interventionCountry?.value || "",
			posture: nodes.interventionPosture?.value || "ADAPTIVE",
			rawAmount,
			sideUid: nodes.interventionSide?.value || "",
		};
	}

	function setSetupSeedStatus(message = "", tone = "") {
		if (!nodes.seedStatus) return;
		nodes.seedStatus.textContent = asText(message);
		setTone(nodes.seedStatus, tone);
	}

	function setSetupSeed(seed, status, tone = "") {
		if (nodes.seedInput) {
			nodes.seedInput.value =
				seed === null || seed === undefined ? "" : String(seed);
		}
		if (status !== undefined) setSetupSeedStatus(status, tone);
	}

	function setEstimatedForceBalance(balance) {
		if (!nodes.forceBalance) return;
		const normalized =
			balance && typeof balance === "object"
				? balance
				: { statement: asText(balance) };
		const label = asText(normalized.label, "Estimated Force Balance");
		const statement = asText(
			normalized.statement || normalized.summary || normalized.value,
			"Select countries to compare the sides.",
		);
		const children = [
			createElement(documentRef, "span", "", label),
			createElement(documentRef, "strong", "", statement),
		];
		const sideRows = normalized.sides;
		if (Array.isArray(sideRows) && sideRows.length > 0) {
			const list = createElement(documentRef, "div", "force-balance-sides");
			for (const side of sideRows) {
				const row = createElement(documentRef, "span", "force-balance-side");
				row.append(
					createElement(
						documentRef,
						"span",
						"",
						optionValue(side, ["label", "name", "sideName"], "Side"),
					),
					createElement(
						documentRef,
						"strong",
						"",
						formatExperimentMetric(
							side.value ?? side.personnel ?? side.strength,
							"personnel",
						),
					),
				);
				list.append(row);
			}
			children.push(list);
		}
		nodes.forceBalance.replaceChildren(...children);
		setTone(nodes.forceBalance, asText(normalized.tone));
	}

	function setWarDeskCollapsed(collapsed, event) {
		state.collapsed = Boolean(collapsed);
		if (nodes.warDeskBody) nodes.warDeskBody.hidden = state.collapsed;
		if (nodes.warDesk)
			nodes.warDesk.classList.toggle("collapsed", state.collapsed);
		if (nodes.warDeskToggle) {
			nodes.warDeskToggle.setAttribute(
				"aria-expanded",
				String(!state.collapsed),
			);
			nodes.warDeskToggle.textContent = state.collapsed ? "+" : "−";
			nodes.warDeskToggle.title = state.collapsed
				? "Expand War Desk"
				: "Collapse War Desk";
		}
		if (event) invoke("onWarDeskCollapsed", state.collapsed, event);
	}

	function setWarDeskTab(tabName, event) {
		const normalized = asText(tabName, "overview")
			.replace(/^war-desk-/, "")
			.replace(/-(tab|panel)$/, "");
		const allowed = ["overview", "economy", "events", "intervene"];
		if (!allowed.includes(normalized)) return;
		const changed = state.warDeskTab !== normalized;
		state.warDeskTab = normalized;
		for (const name of allowed) {
			const tab = byId(`war-desk-${name}-tab`);
			const panel = byId(`war-desk-${name}-panel`);
			const selected = name === normalized;
			if (tab) {
				tab.classList.toggle("active", selected);
				tab.setAttribute("aria-selected", String(selected));
				tab.tabIndex = selected ? 0 : -1;
			}
			if (panel) {
				panel.classList.toggle("active", selected);
				panel.hidden = !selected;
			}
		}
		if (normalized === "intervene" && (changed || event)) {
			invoke("onInterventionOpened", event);
		}
	}

	function showWarDesk(data) {
		setWarDeskCollapsed(false);
		setWarDeskTab("overview");
		if (nodes.warDesk) {
			nodes.warDesk.hidden = false;
			nodes.warDesk.classList.remove("hud-start-hidden");
		}
		if (data) updateWarDesk(data);
	}

	function hideWarDesk() {
		if (!nodes.warDesk) return;
		nodes.warDesk.classList.add("hud-start-hidden");
		nodes.warDesk.hidden = true;
	}

	function updateWarDesk(data = {}) {
		if (data.advantage !== undefined && nodes.warDeskAdvantage) {
			const advantage =
				data.advantage && typeof data.advantage === "object"
					? data.advantage
					: { statement: data.advantage };
			nodes.warDeskAdvantage.replaceChildren(
				createElement(
					documentRef,
					"span",
					"",
					asText(advantage.label, "Current Advantage"),
				),
				createElement(
					documentRef,
					"strong",
					"",
					asText(
						advantage.statement || advantage.summary || advantage.value,
						"Awaiting frontline telemetry",
					),
				),
			);
			setTone(nodes.warDeskAdvantage, asText(advantage.tone));
		}
		if (data.phase !== undefined && nodes.warDeskPhase) {
			const phase =
				data.phase && typeof data.phase === "object"
					? data.phase.label || data.phase.name || data.phase.value
					: data.phase;
			const phaseText = asText(phase, "Opening Moves");
			nodes.warDeskPhase.textContent = /^phase\b/i.test(phaseText)
				? phaseText
				: `PHASE · ${phaseText.toUpperCase()}`;
		}
		if (data.summary !== undefined && nodes.warDeskSummary) {
			nodes.warDeskSummary.textContent = asText(data.summary);
		}
		if (data.metrics !== undefined) {
			renderMetricCards(
				documentRef,
				nodes.warDeskMetrics,
				data.metrics,
				"No frontline metrics available.",
			);
		}
		if (data.economy !== undefined) {
			renderTelemetryList(
				documentRef,
				nodes.warDeskEconomy,
				data.economy,
				"Economic telemetry is unavailable for this run.",
			);
		}
		if (data.events !== undefined) {
			renderEventList(
				documentRef,
				nodes.warDeskEvents,
				data.events,
				"No pivotal events recorded yet.",
			);
		}
	}

	function populateSelect(
		select,
		items,
		placeholder,
		valueKeys,
		labelKeys,
		selected,
	) {
		if (!select) return;
		const previous = selected ?? select.value;
		const fragment = documentRef.createDocumentFragment();
		const empty = createElement(documentRef, "option", "", placeholder);
		empty.value = "";
		fragment.append(empty);
		for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
			const value = optionValue(item, valueKeys, String(index));
			const label = optionValue(
				item,
				labelKeys,
				value || `Option ${index + 1}`,
			);
			const suffix = optionValue(item, ["sideName", "sideLabel"]);
			const option = createElement(
				documentRef,
				"option",
				"",
				suffix && !label.includes(suffix) ? `${label} · ${suffix}` : label,
			);
			option.value = value;
			fragment.append(option);
		}
		select.replaceChildren(fragment);
		if (
			[...select.options].some((option) => option.value === String(previous))
		) {
			select.value = String(previous);
		}
	}

	function populateInterventionCountries(countries = [], selectedCountryId) {
		populateSelect(
			nodes.interventionCountry,
			countries,
			"Select country",
			["countryId", "id", "uid", "value"],
			["countryName", "name", "label"],
			selectedCountryId,
		);
	}

	function populateInterventionSides(sides = [], selectedSideUid) {
		populateSelect(
			nodes.interventionSide,
			sides,
			"Select side",
			["sideUid", "uid", "id", "value"],
			["sideName", "name", "label"],
			selectedSideUid,
		);
	}

	function setInterventionOptions(options = {}) {
		if (options.countries !== undefined) {
			populateInterventionCountries(
				options.countries,
				options.selectedCountryId,
			);
		}
		if (options.sides !== undefined) {
			populateInterventionSides(options.sides, options.selectedSideUid);
		}
		if (options.posture !== undefined && nodes.interventionPosture) {
			nodes.interventionPosture.value = String(options.posture);
		}
		if (options.amount !== undefined && nodes.interventionAmount) {
			nodes.interventionAmount.value = String(options.amount);
		}
	}

	function setInterventionStatus(message = "", tone = "") {
		if (!nodes.interventionStatus) return;
		nodes.interventionStatus.textContent = asText(message);
		setTone(nodes.interventionStatus, tone);
	}

	function renderAfterActionReport(report = {}) {
		state.currentReport = report;
		const headline = byId("after-action-headline");
		if (headline) headline.textContent = reportOutcome(report);
		renderMeta(documentRef, byId("after-action-meta"), report);
		renderFactors(documentRef, byId("after-action-factors"), report);
		renderEventList(
			documentRef,
			byId("after-action-timeline"),
			reportEvents(report),
			"No pivotal events were recorded.",
		);
		renderSideMetrics(documentRef, byId("after-action-side-metrics"), report);
		renderInterventions(
			documentRef,
			byId("after-action-interventions"),
			report,
		);
		renderComparison(documentRef, byId("after-action-comparison"), report);
	}

	function showAfterActionReport(report) {
		if (report) renderAfterActionReport(report);
		if (!nodes.afterAction) return;
		nodes.afterAction.hidden = false;
		nodes.afterAction.style.display = "flex";
		nodes.afterAction.setAttribute("aria-hidden", "false");
		focusModal(nodes.afterAction, byId("after-action-headline"));
	}

	function hideAfterActionReport() {
		if (!nodes.afterAction) return;
		nodes.afterAction.style.display = "none";
		nodes.afterAction.hidden = true;
		nodes.afterAction.setAttribute("aria-hidden", "true");
		restoreModalFocus(nodes.afterAction);
	}

	function showReportReopenButton() {
		if (!nodes.reopenReport) return;
		nodes.reopenReport.hidden = false;
		nodes.reopenReport.classList.remove("hud-start-hidden");
		queueMicrotask(() => nodes.reopenReport.focus({ preventScroll: true }));
	}

	function hideReportReopenButton() {
		if (!nodes.reopenReport) return;
		nodes.reopenReport.classList.add("hud-start-hidden");
		nodes.reopenReport.hidden = true;
	}

	function renderArchiveDetail(report) {
		if (!nodes.archiveDetail) return;
		if (!report) {
			const empty = createElement(documentRef, "div", "war-archive-empty");
			empty.append(
				createElement(documentRef, "strong", "", "No archived report selected"),
				createElement(
					documentRef,
					"span",
					"",
					"Choose an experiment to review its outcome and configuration.",
				),
			);
			nodes.archiveDetail.replaceChildren(empty);
			return;
		}
		const header = createElement(
			documentRef,
			"header",
			"war-archive-detail-header",
		);
		header.append(createElement(documentRef, "h2", "", reportOutcome(report)));
		const meta = createElement(documentRef, "div", "after-action-meta");
		renderMeta(documentRef, meta, report);
		header.append(meta);

		const factors = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		factors.append(
			createElement(documentRef, "h3", "", "Observed Contributors"),
		);
		const factorBody = createElement(
			documentRef,
			"div",
			"after-action-factors",
		);
		renderFactors(documentRef, factorBody, report);
		factors.append(factorBody);

		const configuration =
			report.configuration || report.spec || report.experimentSpec || {};
		const configSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		configSection.append(createElement(documentRef, "h3", "", "Configuration"));
		const configList = createElement(
			documentRef,
			"dl",
			"after-action-metric-list",
		);
		const configSummary = {
			Scenario:
				configuration.scenario?.name ||
				configuration.scenarioName ||
				report.scenarioName,
			Sides: configuration.sides?.length,
			Seed: reportSeed(report),
			"Scenario Hash":
				configuration.scenario?.hash ||
				configuration.scenarioHash ||
				report.scenarioHash,
		};
		for (const entry of metricEntries(configSummary)) {
			if (
				entry.value === null ||
				entry.value === undefined ||
				entry.value === ""
			) {
				continue;
			}
			configList.append(
				createElement(documentRef, "dt", "", entry.label),
				createElement(
					documentRef,
					"dd",
					"",
					formatExperimentMetric(entry.value, entry.key),
				),
			);
		}
		configSection.append(configList);

		const timelineSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		timelineSection.append(
			createElement(documentRef, "h3", "", "Pivotal Events"),
		);
		const timeline = createElement(documentRef, "ol", "after-action-timeline");
		renderEventList(
			documentRef,
			timeline,
			reportEvents(report),
			"No pivotal events were recorded.",
		);
		timelineSection.append(timeline);

		const metricsSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		metricsSection.append(
			createElement(documentRef, "h3", "", "Final Side Metrics"),
		);
		const metrics = createElement(
			documentRef,
			"div",
			"after-action-side-metrics",
		);
		renderSideMetrics(documentRef, metrics, report);
		metricsSection.append(metrics);

		const interventionSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		interventionSection.append(
			createElement(documentRef, "h3", "", "Interventions"),
		);
		const interventions = createElement(
			documentRef,
			"div",
			"after-action-interventions",
		);
		renderInterventions(documentRef, interventions, report);
		interventionSection.append(interventions);

		const comparisonSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		comparisonSection.append(
			createElement(documentRef, "h3", "", "Parent Comparison"),
		);
		const comparison = createElement(
			documentRef,
			"div",
			"after-action-comparison",
		);
		renderComparison(documentRef, comparison, report);
		comparisonSection.append(comparison);

		const rerunSection = createElement(
			documentRef,
			"section",
			"war-archive-detail-section",
		);
		rerunSection.append(
			createElement(documentRef, "h3", "", "Rerun Experiment"),
			createElement(
				documentRef,
				"p",
				"war-archive-rerun-note",
				"Reruns require the currently loaded scenario to match this report's scenario hash.",
			),
		);
		const rerunActions = createElement(
			documentRef,
			"div",
			"war-archive-rerun-actions",
		);
		for (const [label, callback, title] of [
			[
				"Fresh Rematch",
				"onFreshRematch",
				"Restore this configuration with a new seed.",
			],
			[
				"Repeat Seed",
				"onRepeatSeed",
				"Restore comparable starting conditions with the archived seed.",
			],
			[
				"Modify Setup",
				"onModifySetup",
				"Restore this configuration and seed without starting.",
			],
		]) {
			const button = createElement(
				documentRef,
				"button",
				"report-secondary-action",
				label,
			);
			button.type = "button";
			button.title = title;
			button.addEventListener("click", (event) =>
				invoke(callback, report, event),
			);
			rerunActions.append(button);
		}
		rerunSection.append(rerunActions);
		nodes.archiveDetail.replaceChildren(
			header,
			factors,
			timelineSection,
			metricsSection,
			interventionSection,
			...(reportComparison(report) ? [comparisonSection] : []),
			configSection,
			rerunSection,
		);
	}

	function selectArchiveReport(reportOrId, event) {
		let index = -1;
		if (typeof reportOrId === "number") {
			index = reportOrId;
		} else if (reportOrId && typeof reportOrId === "object") {
			index = state.archiveReports.indexOf(reportOrId);
		} else {
			const requested = asText(reportOrId);
			index = state.archiveReports.findIndex(
				(report, itemIndex) =>
					reportId(report, String(itemIndex)) === requested,
			);
		}
		if (index < 0 || index >= state.archiveReports.length) {
			state.archiveSelection = -1;
			renderArchiveDetail(null);
			return null;
		}
		state.archiveSelection = index;
		for (const button of nodes.archiveList?.querySelectorAll(
			"[data-archive-index]",
		) || []) {
			const selected = Number(button.dataset.archiveIndex) === index;
			button.classList.toggle("active", selected);
			button.setAttribute("aria-current", selected ? "true" : "false");
		}
		const report = state.archiveReports[index];
		renderArchiveDetail(report);
		if (event) invoke("onArchiveReportSelected", report, index, event);
		return report;
	}

	function renderWarArchive(reports = [], selectedReportId) {
		state.archiveReports = Array.isArray(reports) ? reports : [];
		state.archiveSelection = -1;
		if (!nodes.archiveList) return;
		if (state.archiveReports.length === 0) {
			appendEmptyState(
				documentRef,
				nodes.archiveList,
				"No finalized experiments are archived yet.",
			);
			renderArchiveDetail(null);
			return;
		}
		const fragment = documentRef.createDocumentFragment();
		for (const [index, report] of state.archiveReports.entries()) {
			const button = createElement(documentRef, "button", "war-archive-entry");
			button.type = "button";
			button.dataset.archiveIndex = String(index);
			button.append(
				createElement(documentRef, "strong", "", reportOutcome(report)),
				createElement(
					documentRef,
					"span",
					"",
					[
						reportTimestamp(report),
						reportSeed(report) === undefined
							? ""
							: `Seed ${reportSeed(report)}`,
					]
						.filter(Boolean)
						.join(" · "),
				),
			);
			fragment.append(button);
		}
		nodes.archiveList.replaceChildren(fragment);
		selectArchiveReport(selectedReportId ?? 0);
	}

	function showWarArchive(reports, selectedReportId) {
		if (reports !== undefined) renderWarArchive(reports, selectedReportId);
		if (!nodes.archive) return;
		nodes.archive.hidden = false;
		nodes.archive.style.display = "flex";
		nodes.archive.setAttribute("aria-hidden", "false");
		focusModal(nodes.archive, byId("war-archive-close-btn"));
	}

	function hideWarArchive() {
		if (!nodes.archive) return;
		nodes.archive.style.display = "none";
		nodes.archive.hidden = true;
		nodes.archive.setAttribute("aria-hidden", "true");
		restoreModalFocus(nodes.archive);
	}

	listen(nodes.seedInput, "change", (event) =>
		invoke("onSeedChanged", getSetupValues(), event),
	);
	listen(nodes.forceMode, "change", (event) =>
		invoke("onForceModeChanged", getSetupValues(), event),
	);
	listen(nodes.setupPosture, "change", (event) =>
		invoke("onSetupPostureChanged", getSetupValues(), event),
	);
	listen(byId("randomize-seed-btn"), "click", (event) =>
		invoke("onRandomizeSeed", getSetupValues(), event),
	);
	listen(byId("start-btn"), "click", (event) =>
		invoke("onStartExperiment", getSetupValues(), event),
	);
	listen(byId("war-archive-btn"), "click", (event) =>
		invoke("onOpenArchive", event),
	);
	listen(byId("war-archive-close-btn"), "click", (event) => {
		hideWarArchive();
		invoke("onCloseArchive", event);
	});

	listen(nodes.warDeskToggle, "click", (event) =>
		setWarDeskCollapsed(!state.collapsed, event),
	);
	const warDeskTabs = ["overview", "economy", "events", "intervene"];
	for (const name of warDeskTabs) {
		const tab = byId(`war-desk-${name}-tab`);
		listen(tab, "click", (event) => setWarDeskTab(name, event));
		listen(tab, "keydown", (event) => {
			if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
				return;
			}
			event.preventDefault();
			const current = warDeskTabs.indexOf(state.warDeskTab);
			const next =
				event.key === "Home"
					? 0
					: event.key === "End"
						? warDeskTabs.length - 1
						: (current +
								(event.key === "ArrowRight" ? 1 : -1) +
								warDeskTabs.length) %
							warDeskTabs.length;
			setWarDeskTab(warDeskTabs[next], event);
			byId(`war-desk-${warDeskTabs[next]}-tab`)?.focus();
		});
	}

	const interventionButtons = {
		"intervention-add-armor-btn": "onAddArmor",
		"intervention-add-fighters-btn": "onAddFighters",
		"intervention-add-funds-btn": "onAddFunds",
		"intervention-add-manpower-btn": "onAddManpower",
		"intervention-add-strike-btn": "onAddStrikeAircraft",
		"intervention-apply-posture-btn": "onApplyPosture",
		"intervention-clear-arrears-btn": "onClearArrears",
		"intervention-join-side-btn": "onJoinSide",
		"intervention-peace-btn": "onEnforcePeace",
		"intervention-rebellion-btn": "onStartRebellion",
		"intervention-withdraw-btn": "onWithdraw",
	};
	for (const [id, callback] of Object.entries(interventionButtons)) {
		listen(byId(id), "click", (event) =>
			invoke(callback, getInterventionValues(), event),
		);
	}

	const reportButtons = {
		"after-action-main-menu-btn": "onAfterActionMainMenu",
		"continue-world-btn": "onContinueWorld",
		"fresh-rematch-btn": "onFreshRematch",
		"inspect-final-map-btn": "onInspectFinalMap",
		"modify-setup-btn": "onModifySetup",
		"repeat-seed-btn": "onRepeatSeed",
	};
	for (const [id, callback] of Object.entries(reportButtons)) {
		listen(byId(id), "click", (event) =>
			invoke(callback, state.currentReport, event),
		);
	}
	listen(nodes.reopenReport, "click", (event) => {
		const result = invoke("onReopenReport", state.currentReport, event);
		if (result === undefined && state.currentReport) {
			showAfterActionReport(state.currentReport);
		}
	});
	listen(nodes.archiveList, "click", (event) => {
		const button = event.target.closest?.("[data-archive-index]");
		if (!button || !nodes.archiveList?.contains(button)) return;
		selectArchiveReport(Number(button.dataset.archiveIndex), event);
	});
	listen(documentRef, "keydown", (event) => {
		const modal = modalIsOpen(nodes.archive)
			? nodes.archive
			: modalIsOpen(nodes.afterAction)
				? nodes.afterAction
				: null;
		if (!modal) return;
		if (event.key === "Escape") {
			event.preventDefault();
			if (modal === nodes.archive) {
				hideWarArchive();
				invoke("onCloseArchive", event);
			} else {
				invoke("onInspectFinalMap", state.currentReport, event);
				if (modalIsOpen(nodes.afterAction)) {
					hideAfterActionReport();
					showReportReopenButton();
				}
			}
			return;
		}
		if (event.key !== "Tab") return;
		const focusable = [
			...modal.querySelectorAll(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
			),
		].filter(
			(element) =>
				!element.hidden &&
				element.getAttribute("aria-hidden") !== "true" &&
				!element.closest("[hidden]"),
		);
		if (!focusable.length) {
			event.preventDefault();
			modal.focus({ preventScroll: true });
			return;
		}
		const currentIndex = focusable.indexOf(documentRef.activeElement);
		if (currentIndex < 0) {
			event.preventDefault();
			focusable[event.shiftKey ? focusable.length - 1 : 0].focus({
				preventScroll: true,
			});
			return;
		}
		if (event.shiftKey && currentIndex === 0) {
			event.preventDefault();
			focusable.at(-1).focus({ preventScroll: true });
		} else if (!event.shiftKey && currentIndex === focusable.length - 1) {
			event.preventDefault();
			focusable[0].focus({ preventScroll: true });
		}
	});

	setWarDeskCollapsed(false);
	setWarDeskTab("overview");

	return {
		destroy() {
			for (const remove of listeners.splice(0)) remove();
		},
		getInterventionValues,
		getSetupValues,
		hideAfterActionReport,
		hideReportReopenButton,
		hideWarArchive,
		hideWarDesk,
		populateInterventionCountries,
		populateInterventionSides,
		renderAfterActionReport,
		renderWarArchive,
		selectArchiveReport,
		setEstimatedForceBalance,
		setInterventionOptions,
		setInterventionStatus,
		setSetupSeed,
		setSetupSeedStatus,
		setWarDeskCollapsed,
		setWarDeskTab,
		showAfterActionReport,
		showReportReopenButton,
		showWarArchive,
		showWarDesk,
		updateWarDesk,
	};
}

function createNoopController() {
	const noop = () => {};
	return {
		destroy: noop,
		getInterventionValues: () => ({
			amount: 0,
			countryId: "",
			posture: "ADAPTIVE",
			rawAmount: "",
			sideUid: "",
		}),
		getSetupValues: () => ({
			forceMode: "AUTO",
			posture: "ADAPTIVE",
			seed: "",
		}),
		hideAfterActionReport: noop,
		hideReportReopenButton: noop,
		hideWarArchive: noop,
		hideWarDesk: noop,
		populateInterventionCountries: noop,
		populateInterventionSides: noop,
		renderAfterActionReport: noop,
		renderWarArchive: noop,
		selectArchiveReport: () => null,
		setEstimatedForceBalance: noop,
		setInterventionOptions: noop,
		setInterventionStatus: noop,
		setSetupSeed: noop,
		setSetupSeedStatus: noop,
		setWarDeskCollapsed: noop,
		setWarDeskTab: noop,
		showAfterActionReport: noop,
		showReportReopenButton: noop,
		showWarArchive: noop,
		showWarDesk: noop,
		updateWarDesk: noop,
	};
}
