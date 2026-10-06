import { getCookie, setCookie } from "./preferences.js";

const SETTINGS = [
	["map-res-select", "mw_map_res", "50m"],
	["grid-res-select", "mw_grid_res", "0.1"],
	["unit-limit-select", "mw_unit_limit", "250"],
	["disable-mountains-checkbox", "mw_disable_mountains", false],
	["disable-units-visually-checkbox", "mw_disable_units_visually", false],
	["hide-curved-labels-checkbox", "mw_hide_curved_labels", false],
	["disable-country-gradient-checkbox", "mw_disable_country_gradient", false],
	["disable-invisible-buffs-checkbox", "mw_disable_invis_buffs", false],
	["disable-auto-fullscreen-checkbox", "mw_disable_fullscreen", false],
	["use-system-font-checkbox", "mw_use_system_font", false],
	["save-skip-checkbox", "mw_skip_settings", false],
];

/** DOM controls share one codec for persistence, restoration and presets. */
export function createSettingsController(onChange, root = document) {
	const entries = SETTINGS.map(([id, key, fallback]) => ({
		id,
		key,
		fallback,
		element: root.getElementById(id),
	}));
	function read(entry) {
		return typeof entry.fallback === "boolean"
			? Boolean(entry.element?.checked)
			: entry.element?.value || entry.fallback;
	}
	function apply(entry, value, notify = true) {
		if (entry.element) {
			if (typeof entry.fallback === "boolean") entry.element.checked = value;
			else entry.element.value = value;
		}
		if (notify) onChange(entry.id, value);
	}
	return {
		wire() {
			for (const entry of entries) {
				entry.element?.addEventListener("change", () => {
					const value = read(entry);
					setCookie(entry.key, String(value));
					onChange(entry.id, value);
				});
			}
		},
		save() {
			for (const entry of entries) {
				if (entry.element) setCookie(entry.key, String(read(entry)));
			}
		},
		restore() {
			for (const entry of entries) {
				const saved = getCookie(entry.key);
				apply(
					entry,
					typeof entry.fallback === "boolean"
						? saved === "true"
						: saved || entry.fallback,
				);
			}
		},
		apply(values) {
			for (const entry of entries) {
				if (Object.hasOwn(values, entry.id)) apply(entry, values[entry.id]);
			}
		},
	};
}
