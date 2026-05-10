#!/usr/bin/env node
// Simplify geojson files: reduce coordinate precision, strip unnecessary properties, compact JSON
const fs = require('fs');
const path = require('path');

const GEODATA_DIR = path.join(__dirname, '..', 'assets', 'geodata');
const PRECISION = 4; // ~11m accuracy

function roundCoord(c) {
	if (typeof c === 'number') return parseFloat(c.toFixed(PRECISION));
	if (Array.isArray(c)) return c.map(roundCoord);
	return c;
}

function simplifyFeature(f) {
	const out = { type: 'Feature' };
	if (f.id !== undefined) out.id = f.id;
	out.geometry = {
		type: f.geometry.type,
		coordinates: roundCoord(f.geometry.coordinates),
	};
	// Keep only essential properties
	const props = f.properties || {};
	const keep = {};
	// Keep ISO_A3, ISO_A2, NAME, NAME_EN, ADMIN, SOVEREIGNT, TYPE, FEATURECLASS, POP_MAX, POP_MIN, name, NAME
	const allowed = ['ISO_A3', 'ISO_A2', 'NAME', 'NAME_EN', 'ADMIN', 'SOVEREIGNT', 'TYPE', 'FEATURECLASS', 'POP_MAX', 'POP_MIN', 'name', 'scalerank', 'min_zoom', 'labelrank', 'wikipedia'];
	for (const k of allowed) {
		if (props[k] !== undefined) keep[k] = props[k];
	}
	out.properties = keep;
	return out;
}

function simplifyFile(filePath) {
	console.log(`Processing ${filePath}...`);
	const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	const before = Buffer.byteLength(JSON.stringify(raw));

	if (raw.type === 'FeatureCollection') {
		raw.features = raw.features.map(simplifyFeature);
	} else if (raw.type === 'Feature') {
		return simplifyFile; // shouldn't happen but handle
	} else if (Array.isArray(raw)) {
		// flagcodes.json is just an array of [code, name]
	}

	const json = JSON.stringify(raw);
	const after = Buffer.byteLength(json);
	const pct = ((1 - after / before) * 100).toFixed(1);
	console.log(`  ${before} -> ${after} bytes (${pct}% reduction)`);
	fs.writeFileSync(filePath, json, 'utf8');
}

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (entry.name.endsWith('.json')) simplifyFile(full);
	}
}

walk(GEODATA_DIR);
console.log('Done!');
