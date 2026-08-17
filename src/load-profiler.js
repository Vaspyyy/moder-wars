const MAX_LOAD_REPORTS = 10;
const loadReports = [];
let activeLoad = null;

function roundMs(value) {
	return Math.round(value * 10) / 10;
}

function cloneReport(report) {
	return report ? JSON.parse(JSON.stringify(report)) : null;
}

function collectResources(startedAt) {
	if (typeof performance?.getEntriesByType !== "function") return [];
	return performance
		.getEntriesByType("resource")
		.filter((entry) => entry.startTime >= startedAt)
		.map((entry) => ({
			name: entry.name,
			initiatorType: entry.initiatorType,
			durationMs: roundMs(entry.duration),
			transferBytes: entry.transferSize || 0,
			encodedBytes: entry.encodedBodySize || 0,
			decodedBytes: entry.decodedBodySize || 0,
		}))
		.sort((a, b) => b.durationMs - a.durationMs);
}

/** Begin a lightweight scenario/editor load trace. */
export function beginLoadTrace(label, details = {}) {
	const startedAt = performance.now();
	const report = {
		label,
		details: { ...details },
		startedAt,
		status: "running",
		marks: [],
	};
	activeLoad = report;

	const mark = (phase, evidence = {}) => {
		const now = performance.now();
		const previous = report.marks.at(-1)?.atMs || 0;
		const atMs = roundMs(now - startedAt);
		report.marks.push({
			phase,
			atMs,
			durationMs: roundMs(atMs - previous),
			...evidence,
		});
		return atMs;
	};

	const finish = (evidence = {}) => {
		if (report.status !== "running") return cloneReport(report);
		mark("complete", evidence);
		report.status = "complete";
		report.totalMs = report.marks.at(-1)?.atMs || 0;
		report.resources = collectResources(startedAt);
		report.transferBytes = report.resources.reduce(
			(total, resource) => total + resource.transferBytes,
			0,
		);
		loadReports.push(report);
		if (loadReports.length > MAX_LOAD_REPORTS) loadReports.shift();
		if (activeLoad === report) activeLoad = null;
		console.info("[Modern Wars Load]", cloneReport(report));
		return cloneReport(report);
	};

	const fail = (error) => {
		if (report.status !== "running") return cloneReport(report);
		mark("failed", { error: error?.message || String(error) });
		report.status = "failed";
		report.totalMs = report.marks.at(-1)?.atMs || 0;
		report.resources = collectResources(startedAt);
		loadReports.push(report);
		if (loadReports.length > MAX_LOAD_REPORTS) loadReports.shift();
		if (activeLoad === report) activeLoad = null;
		console.warn("[Modern Wars Load Failed]", cloneReport(report));
		return cloneReport(report);
	};

	return { mark, finish, fail };
}

export function loadReport() {
	return cloneReport(loadReports.at(-1) || activeLoad);
}

export function loadReportsSnapshot() {
	return loadReports.map(cloneReport);
}

if (typeof window !== "undefined") {
	window.loadReport = loadReport;
	window.loadReports = loadReportsSnapshot;
}
