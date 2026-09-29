import { getCookie, setCookie } from "./preferences.js";
import { TRANSLATIONS } from "./translations.js";

export { TRANSLATIONS };

let hooks = {};
export function configureLanguageUi(callbacks) {
	hooks = callbacks;
}
export function applyLanguage(lang) {
	if (!lang) lang = getCookie("mw_lang") || "en";
	const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		const value = dict[key] || TRANSLATIONS.en[key];
		if (value) {
			el.innerText = value;
		}
	});

	// Update dynamic status messages if they are currently set to default strings
	const statusText = hooks.statusText?.();
	if (statusText) {
		const currentText = statusText.innerText;

		// Handle complex status strings like "REMIXING: World"
		if (currentText.includes(": ")) {
			const parts = currentText.split(": ");
			const prefixKey =
				parts[0] === "REMIXING"
					? "REMIXING"
					: parts[0] === "PLAYING"
						? "PLAYING"
						: null;
			if (prefixKey && dict[prefixKey]) {
				statusText.innerText = `${dict[prefixKey]}: ${parts[1]}`;
			}
		} else {
			for (const [key, val] of Object.entries(TRANSLATIONS.en)) {
				if (currentText === val && dict[key]) {
					statusText.innerText = dict[key];
					break;
				}
			}
		}
	}

	const select = document.getElementById("language-select");
	if (select) select.value = lang;
	setCookie("mw_lang", lang);

	// Re-translate country metadata
	const countryMetadata = hooks.countryMetadata?.();
	if (countryMetadata) {
		countryMetadata.forEach((m) => {
			if (m?.name) {
				const trans = getTranslation(m.name, lang, "NATIONS");
				if (trans !== m.name) m.displayName = trans;
				else m.displayName = m.name;
			}
		});
	}

	// Re-translate current simulation side UI
	hooks.refreshSides?.();
}

export function getTranslation(
	key,
	lang = getCookie("mw_lang") || "en",
	subDict = null,
) {
	const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
	if (subDict && dict[subDict]) {
		return dict[subDict][key] || TRANSLATIONS.en[subDict]?.[key] || key;
	}
	return dict[key] || TRANSLATIONS.en[key] || key;
}
