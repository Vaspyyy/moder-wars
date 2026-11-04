import assert from "node:assert/strict";
import "./register-types.mjs";
const { getRenderBudget, MAX_RENDER_PIXELS, MAX_RENDER_EDGE } = await import(
	"../src/render-budget.ts"
);

// Bound backing stores across phone rotation, Retina desktops and ultrawide
// windows. CSS coordinates and camera coverage remain independent of DPR.
for (const [width, height] of [
	[390, 844],
	[844, 390],
	[768, 1024],
	[1280, 720],
	[1920, 1080],
	[3840, 2160],
	[7680, 4320],
	[20_000, 100],
]) {
	for (const requestedDpr of [0.75, 1, 1.25, 2, 3, 4]) {
		for (const buffered of [true, false]) {
			const budget = getRenderBudget(width, height, requestedDpr, buffered);
			assert.ok(budget.width * budget.height <= MAX_RENDER_PIXELS);
			assert.ok(Math.max(budget.width, budget.height) <= MAX_RENDER_EDGE);
			assert.ok(budget.dpr > 0 && budget.dpr <= Math.min(2, requestedDpr));
			assert.ok(
				Math.abs(budget.width / budget.dpr - (width + 2 * budget.padding)) <
					1 / budget.dpr,
			);
			assert.ok(
				Math.abs(budget.height / budget.dpr - (height + 2 * budget.padding)) <
					1 / budget.dpr,
			);
			if (!buffered) assert.equal(budget.padding, 0);
		}
	}
}
for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
	const budget = getRenderBudget(invalid, invalid, invalid);
	assert.ok(Number.isFinite(budget.dpr) && budget.dpr > 0);
	assert.ok(budget.width > 0 && budget.height > 0);
}
const mobile = getRenderBudget(390, 844, 3);
const previousPixels = (390 + 384) * (844 + 384) * 9;
assert.ok(
	mobile.width * mobile.height < previousPixels * 0.25,
	"high-DPR phone buffers use less than a quarter of the previous pixels",
);
assert.equal(
	getRenderBudget(1280, 720, 1).dpr,
	1,
	"ordinary desktop resolution is preserved within the budget",
);
console.log(
	JSON.stringify({
		scope:
			"Canvas backing-store budget; not measured browser RSS or GPU memory",
		phonePreviousFiveCanvasesMiB: (previousPixels * 5 * 4) / 1024 ** 2,
		phoneBudgetedFiveCanvasesMiB:
			(mobile.width * mobile.height * 5 * 4) / 1024 ** 2,
	}),
);
