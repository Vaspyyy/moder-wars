import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { BUNDLED_FLAG_CODES, LEGACY_FLAG_FILES } from "../src/flag-manifest.js";
import {
	localFlagUrl,
	localizeFlagUrl,
	localizeScenarioFlags,
} from "../src/flags.js";
import { decodeScenarioBinary } from "../src/scenario-codec.js";

const root = new URL("../", import.meta.url);
const flagCodes = Object.keys(
	JSON.parse(readFileSync(new URL("assets/geodata/flagcodes.json", root))),
).map((code) => code.toLowerCase());
assert.deepEqual([...BUNDLED_FLAG_CODES].sort(), [...flagCodes].sort());
for (const code of BUNDLED_FLAG_CODES)
	assert.ok(existsSync(new URL(`assets/flags/${code}.webp`, root)), code);
for (const file of LEGACY_FLAG_FILES)
	assert.ok(existsSync(new URL(`assets/flags/legacy/${file}`, root)), file);

assert.equal(localFlagUrl("DE"), "assets/flags/de.webp");
assert.equal(localFlagUrl("us-ca"), "assets/flags/us-ca.webp");
assert.equal(localFlagUrl("-99"), null);
assert.equal(localFlagUrl(null), null);
for (const url of [
	"https://flagcdn.com/w320/de.png",
	"https://flagcdn.com/w80/de.webp",
	"https://flagcdn.com/h40/de.jpg",
	"https://flagcdn.com/de.svg",
])
	assert.equal(localizeFlagUrl(url), "assets/flags/de.webp", url);
const legacy = LEGACY_FLAG_FILES[0];
assert.equal(
	localizeFlagUrl(`https://api.websim.com/blobs/${legacy}`),
	`assets/flags/legacy/${legacy}`,
);
// Unknown or foreign links stay as they are.
for (const url of [
	"https://flagcdn.com/w320/zz.png",
	"https://api.websim.com/blobs/not-bundled.png",
	"https://example.com/flag.png",
	"data:image/png;base64,AAAA",
	"assets/flags/de.webp",
])
	assert.equal(localizeFlagUrl(url), url, url);
assert.equal(localizeFlagUrl(null), null);

// Every flag a built-in scenario names must resolve to a bundled file.
for (const name of [
	"world-map-2026-v3",
	"ukraine-2023-v3",
	"world-map-2022-v3",
]) {
	const bytes = gunzipSync(
		readFileSync(new URL(`assets/maps/compiled/${name}.mwsc.gz`, root)),
	);
	const metadata = localizeScenarioFlags(
		decodeScenarioBinary(bytes).scenario.metadata,
	);
	for (const meta of metadata ?? [])
		for (const [key, value] of Object.entries(meta ?? {})) {
			if (!/flagUrl$/i.test(key) || typeof value !== "string") continue;
			if (value.startsWith("data:")) continue;
			assert.ok(
				value.startsWith("assets/flags/") && existsSync(new URL(value, root)),
				`${name} ${meta.name}: ${value}`,
			);
		}
}
console.log(
	`flags smoke: ${BUNDLED_FLAG_CODES.length} bundled, ${LEGACY_FLAG_FILES.length} legacy, built-in scenarios fully local`,
);
