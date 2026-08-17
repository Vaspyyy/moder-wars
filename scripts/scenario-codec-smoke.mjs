import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { decodeScenarioBinary } from "../src/scenario-codec.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pairs = [
	["world map 2022.json", "world-map-2022-v2.mwsc.gz"],
	["world_war_1__1914_.json", "world-war-1-1914-v2.mwsc.gz"],
	["WW2 Peru Update.json", "world-war-2-v2.mwsc.gz"],
];

function provinceId(x, y, countryId, gridRes) {
	if (countryId <= 0) return 0;
	const lat = y * gridRes - 90;
	const lng = x * gridRes - 180;
	const nx = lng * 0.65;
	const ny = lat * 0.65;
	const w1 = Math.sin(nx * 0.8 + ny * 0.6 + countryId * 0.1) * 1.2;
	const w2 = Math.cos(nx * 0.5 - ny * 0.9 + countryId * 0.2) * 1.1;
	const noise =
		Math.sin((nx + w1) * 2.3) * 0.5 +
		Math.sin((ny + w2) * 1.9) * 0.5 +
		Math.sin((nx + ny) * 1.4 + countryId) * 0.3 +
		Math.cos(nx * 3.1 - ny * 2.7) * 0.2;
	const cellX = Math.floor(nx + w1 + noise);
	const cellY = Math.floor(ny + w2 + noise);
	return (
		(Math.abs(cellX * 73856093) ^
			Math.abs(cellY * 19349663) ^
			Math.abs(countryId * 83492791)) >>>
		0
	) | 0;
}

function legacyRemap(original, targetGridRes) {
	const width = Math.ceil(360 / targetGridRes);
	const height = Math.ceil(180 / targetGridRes);
	const sourceWidth = Math.ceil(360 / original.gridRes);
	const worldControl = new Uint16Array(width * height);
	const land = new Uint8Array(width * height);
	for (const [index, owner] of original.mapData) {
		const sourceY = Math.floor(index / sourceWidth);
		const sourceX = index % sourceWidth;
		const baseLat = sourceY * original.gridRes - 90;
		const baseLng = sourceX * original.gridRes - 180;
		const xStart = Math.floor((baseLng + 180) / targetGridRes);
		const xEnd = Math.floor(
			(baseLng + original.gridRes + 180 - 0.0001) / targetGridRes,
		);
		const yStart = Math.floor((baseLat + 90) / targetGridRes);
		const yEnd = Math.floor(
			(baseLat + original.gridRes + 90 - 0.0001) / targetGridRes,
		);
		for (let y = yStart; y <= yEnd; y++) {
			if (y < 0 || y >= height) continue;
			for (let x = xStart; x <= xEnd; x++) {
				if (x < 0 || x >= width) continue;
				const targetIndex = y * width + x;
				worldControl[targetIndex] = owner;
				land[targetIndex] = 1;
			}
		}
	}
	return { width, height, worldControl, land };
}

for (const [jsonName, binaryName] of pairs) {
	const original = JSON.parse(fs.readFileSync(path.join(root, "assets/maps", jsonName), "utf8"));
	const binaryBytes = gunzipSync(
		fs.readFileSync(path.join(root, "assets/maps/compiled", binaryName)),
	);
	const decoded = decodeScenarioBinary(binaryBytes);
	const expectedScenario = { ...original };
	delete expectedScenario.mapData;
	assert.deepEqual(decoded.scenario, expectedScenario, `${jsonName}: scenario metadata`);
	assert.equal(decoded.entryCount, original.mapData.length, `${jsonName}: sparse entry count`);
	for (const [index, owner, biome = 0] of original.mapData) {
		assert.equal(decoded.worldControl[index], owner, `${jsonName}: owner at ${index}`);
		assert.equal(decoded.deJure[index], owner, `${jsonName}: deJure at ${index}`);
		assert.equal(decoded.land[index], 1, `${jsonName}: land at ${index}`);
		assert.equal(decoded.biome[index], biome, `${jsonName}: biome at ${index}`);
		assert.equal(
			decoded.province[index],
			provinceId(
				index % decoded.target.width,
				Math.floor(index / decoded.target.width),
				owner,
				decoded.target.gridRes,
			),
			`${jsonName}: province at ${index}`,
		);
	}
	console.log(`ok ${jsonName}: ${decoded.entryCount} cells, ${decoded.source.width}x${decoded.source.height}`);

	for (const targetGridRes of [0.15, 0.25]) {
		const remapped = decodeScenarioBinary(binaryBytes, { targetGridRes });
		const expected = legacyRemap(original, targetGridRes);
		assert.equal(remapped.target.width, expected.width);
		assert.equal(remapped.target.height, expected.height);
		for (let index = 0; index < remapped.target.length; index++) {
			const owner = expected.worldControl[index];
			assert.equal(remapped.worldControl[index], owner);
			assert.equal(remapped.deJure[index], owner);
			assert.equal(remapped.land[index], expected.land[index]);
			assert.equal(remapped.biome[index], 0);
			assert.equal(
				remapped.province[index],
				provinceId(
					index % expected.width,
					Math.floor(index / expected.width),
					owner,
					targetGridRes,
				),
			);
		}
		console.log(
			`ok ${jsonName}: remap ${targetGridRes}, ${expected.width}x${expected.height}`,
		);
	}
}
