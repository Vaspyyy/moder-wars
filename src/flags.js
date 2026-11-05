// Flags ship with the game (assets/flags/, built by scripts/build-flags.mjs).
// Scenario and country files may still name remote flag URLs: links to
// flagcdn.com and the old WebSim blob store resolve to the bundled copies,
// other links are left as they are.
import { BUNDLED_FLAG_CODES, LEGACY_FLAG_FILES } from "./flag-manifest.js";

const bundledCodes = new Set(BUNDLED_FLAG_CODES);
const legacyFiles = new Set(LEGACY_FLAG_FILES);
const FLAGCDN_URL =
	/^https?:\/\/flagcdn\.com\/(?:[wh]\d+(?:x\d+)?\/)?([a-z]{2}(?:-[a-z]+)?)\.(?:png|webp|svg|jpe?g|gif)$/i;
const WEBSIM_BLOB_URL =
	/^https?:\/\/api\.websim\.com\/blobs\/([\w-]+\.(?:png|webp|gif|svg))$/;

/** @param {string | null | undefined} code ISO 3166 code such as "de" or "us-ca" */
export function localFlagUrl(code) {
	const key = String(code ?? "").toLowerCase();
	return bundledCodes.has(key) ? `assets/flags/${key}.webp` : null;
}

/**
 * Map a flag URL to its bundled copy when there is one.
 * @template T
 * @param {T} url
 * @returns {T | string}
 */
export function localizeFlagUrl(url) {
	if (typeof url !== "string") return url;
	const cdn = url.match(FLAGCDN_URL);
	if (cdn) return localFlagUrl(cdn[1]) ?? url;
	const blob = url.match(WEBSIM_BLOB_URL);
	if (blob && legacyFiles.has(blob[1])) return `assets/flags/legacy/${blob[1]}`;
	return url;
}

/** Rewrite every `*flagUrl` field of one metadata record in place. */
export function localizeMetaFlags(meta) {
	if (!meta || typeof meta !== "object") return meta;
	for (const key of Object.keys(meta))
		if (/flagUrl$/i.test(key)) meta[key] = localizeFlagUrl(meta[key]);
	return meta;
}

/** @param {any[] | null | undefined} metadata */
export function localizeScenarioFlags(metadata) {
	if (Array.isArray(metadata))
		for (const meta of metadata) localizeMetaFlags(meta);
	return metadata;
}
