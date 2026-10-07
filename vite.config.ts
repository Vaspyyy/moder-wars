import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;
function paths(directory: string, prefix = ""): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? paths(resolve(directory, entry.name), `${prefix}${entry.name}/`)
			: [`${prefix}${entry.name}`],
	);
}
export default defineConfig({
	base: "./",
	publicDir: false,
	worker: { format: "es" },
	build: {
		target: "es2022",
		outDir: "dist",
		emptyOutDir: true,
		assetsInlineLimit: 0,
		manifest: true,
	},
	plugins: [
		{
			name: "modern-wars-static-assets",
			closeBundle() {
				const out = resolve(root, "dist");
				mkdirSync(out, { recursive: true });
				cpSync(resolve(root, "assets"), resolve(out, "assets"), {
					recursive: true,
				});
				const files = paths(out).filter(
					(path) =>
						/\.(?:js|css)$/.test(path) ||
						/^assets\/(?:coast-110m\.bin-|rivers-50m\.bin-|title-map-|2022-)/.test(
							path,
						),
				);
				const shell = [
					"index.html",
					...files,
					"assets/images/title-map.svg",
					"assets/atlas/coast-110m.bin.gz",
				];
				let worker = readFileSync(
					resolve(root, "workers/service-worker.js"),
					"utf8",
				);
				worker = worker.replace(
					/const APP_SHELL_PATHS\s*=\s*\[[\s\S]*?\];/,
					`const APP_SHELL_PATHS = ${JSON.stringify(shell, null, 2)};`,
				);
				writeFileSync(resolve(out, "service-worker.js"), worker);
				writeFileSync(
					resolve(out, "offline-manifest.json"),
					JSON.stringify(shell, null, 2),
				);
				for (const entry of shell)
					if (!existsSync(resolve(out, entry)))
						throw new Error(`Missing offline asset ${entry}`);
				// Worker imports are bundled separately by Vite; never cache source-only URLs.
				if (!existsSync(resolve(out, "index.html")))
					throw new Error("Missing build entry");
			},
		},
	],
});
