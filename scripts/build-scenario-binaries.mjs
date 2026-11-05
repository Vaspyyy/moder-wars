import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { writeUkraine2023Scenario } from "./build-ukraine-scenario.mjs";
import { writeModern2026Scenario } from "./build-modern-2026-scenario.mjs";
import { encodeScenario } from "../src/scenario-codec.js";
import { readWorldMap2022Bytes } from "./source-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "assets/maps/compiled");
const scenarios = [
	["world-map-2022.json.gz", "world-map-2022-v3.mwsc.gz", readWorldMap2022Bytes],
];

fs.mkdirSync(outputDir, { recursive: true });
for (const staleName of fs.readdirSync(outputDir)) {
	if (staleName.endsWith(".mwsc") || staleName.endsWith(".mwsc.gz")) {
		fs.unlinkSync(path.join(outputDir, staleName));
	}
}
for (const [inputName, outputName, readSource] of scenarios) {
	const outputPath = path.join(outputDir, outputName);
	const jsonBytes = readSource();
	const scenario = JSON.parse(jsonBytes.toString("utf8"));
	const encoded = encodeScenario(scenario);
	const compressed = gzipSync(encoded, { level: 9 });
	fs.writeFileSync(outputPath, compressed);
	const contentRevision = createHash("sha256")
		.update(compressed)
		.digest("hex")
		.slice(0, 16);
	console.log(
		JSON.stringify({
			scenario: inputName,
			output: path.relative(root, outputPath),
			jsonBytes: jsonBytes.length,
			jsonGzipBytes: gzipSync(jsonBytes, { level: 9 }).length,
			binaryBytes: encoded.length,
			binaryGzipBytes: compressed.length,
			contentRevision,
		}),
	);
}

writeUkraine2023Scenario();
writeModern2026Scenario();
