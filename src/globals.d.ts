// Debug hooks the game attaches to `window` for the developer console.
// biome-ignore-all lint/suspicious/noExplicitAny: console hooks are untyped JavaScript
export {};

declare global {
	interface Window {
		__perf: any;
		__mwAiOperationReveal: any;
		webkitAudioContext: typeof AudioContext;
		[hook: `perf${string}`]: any;
		startBenchmark: any;
		releaseNation: any;
		loadReport: any;
		loadReports: any;
		aiDebugReport: any;
	}

	/** Chromium-only heap statistics. */
	interface Performance {
		memory?: {
			usedJSHeapSize: number;
			totalJSHeapSize: number;
			jsHeapSizeLimit: number;
		};
	}

	/** Device Memory API (Chromium-only), in GiB. */
	interface Navigator {
		deviceMemory?: number;
	}
}
