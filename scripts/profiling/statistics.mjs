import { isDeepStrictEqual } from "node:util";

export function distribution(values, { budget = 1000 / 60 } = {}) {
	if (!values.length) throw new Error("Cannot summarize an empty measurement");
	const sorted = [...values].sort((a, b) => a - b);
	const percentile = (p) =>
		sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		count: values.length,
		total,
		mean: total / values.length,
		median: percentile(0.5),
		p95: percentile(0.95),
		p99: percentile(0.99),
		max: sorted.at(-1),
		...(budget == null
			? {}
			: { overBudget: values.filter((value) => value > budget).length }),
	};
}

// Weight samples by their recorded duration. Inclusive percentages overlap and must not be summed.
export function summarizeCpuProfile(profile) {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
	const parents = new Map();
	for (const node of profile.nodes)
		for (const child of node.children || []) parents.set(child, node.id);
	const functions = new Map();
	const modules = new Map();
	const lines = new Map();
	for (const node of profile.nodes) {
		for (const position of node.positionTicks || []) {
			const key = `${node.callFrame.url}:${position.line}`;
			const row = lines.get(key) || {
				url: node.callFrame.url,
				line: position.line,
				hits: 0,
			};
			row.hits += position.ticks;
			lines.set(key, row);
		}
	}
	let totalUs = 0;
	const keyOf = (node) =>
		`${node.callFrame.url}:${node.callFrame.lineNumber}:${node.callFrame.functionName}`;
	const add = (node, field, time) => {
		const key = keyOf(node);
		if (!functions.has(key))
			functions.set(key, {
				name: node.callFrame.functionName || "(anonymous)",
				url: node.callFrame.url,
				line: node.callFrame.lineNumber + 1,
				selfUs: 0,
				inclusiveUs: 0,
			});
		functions.get(key)[field] += time;
	};
	for (let index = 0; index < (profile.samples || []).length; index++) {
		const time = profile.timeDeltas?.[index] ?? 1000;
		totalUs += time;
		let id = profile.samples[index];
		const leaf = nodes.get(id);
		if (!leaf) continue;
		add(leaf, "selfUs", time);
		modules.set(
			leaf.callFrame.url || leaf.callFrame.functionName || "(native)",
			(modules.get(
				leaf.callFrame.url || leaf.callFrame.functionName || "(native)",
			) || 0) + time,
		);
		const seenFunctions = new Set(),
			seenNodes = new Set();
		while (nodes.has(id) && !seenNodes.has(id)) {
			seenNodes.add(id);
			const node = nodes.get(id),
				key = keyOf(node);
			if (!seenFunctions.has(key)) add(node, "inclusiveUs", time);
			seenFunctions.add(key);
			id = parents.get(id);
		}
	}
	const rows = [...functions.values()].map((row) => ({
		...row,
		selfPct: totalUs ? (row.selfUs / totalUs) * 100 : 0,
		inclusivePct: totalUs ? (row.inclusiveUs / totalUs) * 100 : 0,
	}));
	return {
		samples: profile.samples?.length || 0,
		sampledMs: totalUs / 1000,
		lines: [...lines.values()].sort((a, b) => b.hits - a.hits),
		self: rows.sort((a, b) => b.selfUs - a.selfUs),
		inclusive: [...rows].sort((a, b) => b.inclusiveUs - a.inclusiveUs),
		modules: [...modules]
			.map(([url, selfUs]) => ({
				url,
				selfPct: totalUs ? (selfUs / totalUs) * 100 : 0,
			}))
			.sort((a, b) => b.selfPct - a.selfPct),
	};
}

export function summarizeHeapProfile(profile) {
	const rows = new Map();
	function visit(node) {
		const frame = node.callFrame;
		const key = `${frame.url}:${frame.lineNumber}:${frame.functionName}`;
		const row = rows.get(key) || {
			name: frame.functionName || "(anonymous)",
			url: frame.url,
			line: frame.lineNumber + 1,
			bytes: 0,
		};
		row.bytes += node.selfSize || 0;
		rows.set(key, row);
		for (const child of node.children || []) visit(child);
	}
	visit(profile.head);
	return [...rows.values()]
		.filter((row) => row.bytes)
		.sort((a, b) => b.bytes - a.bytes);
}

export function compareReports(current, baseline) {
	if (baseline.schema !== current.schema)
		throw new Error("Baseline report schema differs");
	if (!isDeepStrictEqual(baseline.host, current.host))
		throw new Error("Baseline hardware, OS, or Node version differs");
	return current.cases.map((result) => {
		const previous = baseline.cases.find(
			(item) => item.fixture.case === result.fixture.case,
		);
		if (!previous || !isDeepStrictEqual(previous.fixture, result.fixture))
			throw new Error(`Baseline workload differs for ${result.fixture.case}`);
		return {
			case: result.fixture.case,
			meanSpeedup: previous.timing.mean / result.timing.mean,
			p95Speedup: previous.timing.p95 / result.timing.p95,
		};
	});
}
