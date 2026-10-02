import { bundledCommanderModel } from "./commander-model.js";
import {
	applyCommanderAction,
	buildCommanderObservation,
	chooseCommanderAction,
	validateCommanderModel,
} from "./commander-policy.js";

/** Data stays in the owner; training callbacks are intentionally absent from snapshots. */
export function createCommanderRuntime(context, { decide, onDecision } = {}) {
	for (const model of Object.values(context.commanderPolicies))
		validateCommanderModel(model);
	if (bundledCommanderModel && !context.commanderDisabled) {
		validateCommanderModel(bundledCommanderModel);
		for (const uid of context.sideUids)
			if (
				!Object.hasOwn(context.commanderPolicies, uid) &&
				!context.commanderDisabledSides.has(uid)
			)
				Object.defineProperty(context.commanderPolicies, uid, {
					value: bundledCommanderModel,
					enumerable: true,
					configurable: true,
					writable: true,
				});
	}
	function decideCommander(sideIndex, proposals) {
		const uid = context.sideUids[sideIndex];
		const model = Object.hasOwn(context.commanderPolicies, uid)
			? context.commanderPolicies[uid]
			: null;
		if (!model && !decide && !onDecision) return null;
		const observation = buildCommanderObservation(
			context,
			sideIndex,
			proposals,
		);
		const chosen = decide
			? decide(observation, sideIndex, context)
			: model
				? chooseCommanderAction(model, observation)
				: null;
		// A null training decision records a teacher demonstration without changing the simulation.
		const result =
			chosen == null
				? null
				: applyCommanderAction(observation, chosen, proposals);
		if (result)
			context._commanderDecisions[sideIndex] = {
				tick: context._simTickCount,
				action: result.kind,
				candidate: chosen,
				candidates: observation.candidates.length,
			};
		onDecision?.(
			{
				sideUid: uid,
				sideIndex,
				tick: context._simTickCount,
				observation,
				actionIndex: chosen,
				applied: !!result,
			},
			context,
		);
		return result;
	}
	function setCommanderPolicy({ model = null, sideUid = null } = {}) {
		if (model) validateCommanderModel(model);
		const portable = model
			? {
					format: model.format,
					schema: model.schema,
					features: [...model.features],
					hiddenSize: model.hiddenSize,
					inputWeights: [...model.inputWeights],
					hiddenBias: [...model.hiddenBias],
					outputWeights: [...model.outputWeights],
				}
			: null;
		const uids =
			sideUid == null
				? context.sideUids.filter((_, index) => context.sides[index]?.length)
				: [sideUid];
		if (uids.some((uid) => !context.sideUids.includes(uid)))
			throw new RangeError("Unknown commander side UID");
		for (const uid of uids) {
			if (portable) {
				Object.defineProperty(context.commanderPolicies, uid, {
					value: portable,
					enumerable: true,
					configurable: true,
					writable: true,
				});
				context.commanderDisabledSides.delete(uid);
			} else {
				delete context.commanderPolicies[uid];
				context.commanderDisabledSides.add(uid);
			}
			const index = context.sideUids.indexOf(uid);
			context._commanderDecisions[index] = null;
			context._planReassessNeeded[index] = true;
		}
		// An explicit disable survives a worker/local ownership transfer.
		if (sideUid == null) context.commanderDisabled = !model;
	}
	return { decideCommander, setCommanderPolicy };
}
