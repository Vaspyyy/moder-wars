import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";

registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith(".ts"))
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.ESNext,
						verbatimModuleSyntax: true,
					},
				}).outputText,
			};
		return nextLoad(url, context);
	},
});
