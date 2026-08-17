import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { encodeScenario } from "../src/scenario-codec.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "assets/maps/compiled");
const scenarios = [
	["world map 2022.json", "world-map-2022-v2.mwsc.gz"],
	["world_war_1__1914_.json", "world-war-1-1914-v2.mwsc.gz"],
	["WW2 Peru Update.json", "world-war-2-v2.mwsc.gz"],
];

fs.mkdirSync(outputDir, { recursive: true });
for (const staleName of fs.readdirSync(outputDir)) {
	if (staleName.endsWith(".mwsc") || staleName.endsWith(".mwsc.gz")) {
		fs.unlinkSync(path.join(outputDir, staleName));
	}
}
for (const [inputName, outputName] of scenarios) {
	const inputPath = path.join(root, "assets/maps", inputName);
	const outputPath = path.join(outputDir, outputName);
	const jsonBytes = fs.readFileSync(inputPath);
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
