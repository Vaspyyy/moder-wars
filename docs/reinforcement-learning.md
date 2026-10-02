# Experimental reinforcement learning commander

This branch provides an executable first experiment, with the scripted AI still enabled by default. The learned policy controls **land operational focus**, using the same simulation core in Node and the game worker. No browser, renderer, external AI service, Python package, or GPU is needed for this version.

It is a small shared neural policy: 25 bounded features, one 16-neuron tanh layer, and a scalar score per available action. The trainer learns through teacher demonstrations and on-policy vanilla policy gradient with a learned linear value baseline, entropy regularization, and gradient clipping. This is a research baseline, not a claim that a trained agent already outplays the scripted commander.

## Quick start

Run from the repository root with Node 22 or newer. There is no dependency installation or build step.

```sh
node scripts/rl-smoke.mjs
node scripts/rl/train.mjs --episodes 24 --output training-results/commander
node scripts/rl/evaluate.mjs --model training-results/commander/model.json --output training-results/commander
node scripts/rl/export.mjs --model training-results/commander/checkpoint.json --output training-results/commander
```

The default training run bootstraps from two scripted episodes, then runs 24 learning episodes of 1,800 logical ticks with 40 formations per side on a 0.5-degree grid. These are finite, small experiments; measure their throughput and outcomes before increasing the budget. A run saves after every completed episode. `training-results/` is ignored by Git.

Artifacts:

| File | Contents |
| --- | --- |
| `checkpoint.json` | Actor, critic, RNG state, configuration, completed episode count, historical opponent league and per-episode metrics |
| `model.json` | Portable actor plus training provenance; no critic or opponent league |
| `evaluation.json` | Paired results, every side position, terminal outcomes, time limits, territory/personnel metrics and Node CPU timing |
| `exported-model.json` | Validated inference weights and the exact feature schema |

Continue an experiment without replaying bootstrap training:

```sh
node scripts/rl/train.mjs --resume training-results/commander/checkpoint.json --episodes 100 --output training-results/commander
```

`--episodes` means **additional episodes** on resume. The saved configuration and policy RNG state are restored. An explicitly supplied conflicting training option or changed source fingerprint is rejected. This keeps a resumed experiment comparable to its original run. A model can be exported from an old checkpoint even when its training source has changed; resuming training requires a fresh experiment in that case.

The experiment fingerprint covers application source, training tools, fixture tools and the compiled world-map asset. It excludes the generated bundled model, whose defaults are disabled during offline experiments.

## Decisions and ownership

`src/commander-policy.js` defines features, legal candidates, the neural network, and inference. `src/commander-runtime.js` belongs to the simulation owner. The hook executes during the existing proposal reassessment, after scripted scoring and before plan selection. There is no model inference on every movement tick.

Each decision has these actions:

- `KEEP`: run the existing selection/persistence behavior, including retaining current land operations.
- `DEFEND`: clear the two land offensive plan slots and retain scripted defense, naval and logistics proposals.
- `FOCUS`: select one reachable, positively scored land proposal, clearing competing land offensive plans while retaining scripted defense, naval and logistics proposals.

Candidate proposals include capture-city, encirclement and frontline-push plans. The first two actions are always available, followed by at most 48 legal land candidates, ordered by scripted priority. Unreachable or nonpositive land proposals are masked out. The fixed candidate cap is part of the experiment contract.

Existing sector coverage, personnel conservation, launch/readiness checks, navigation, recovery, combat, naval invasions and logistics retain their controllers. The policy cannot invent a new maneuver, change combat rules, change force-allocation ratios, negotiate diplomacy, or directly move formations. Future work can widen the action space after this narrower experiment has useful results.

Features describe own/enemy power, reserves, army size, territory retention, casualties, number of hostile sides, front pressure, threatened cities, defensive coverage and current operations. Candidate features describe action type, scripted priority, local power, distance, force requirements, capital/reachability status and plan history. Numeric scaling is encoded in the shared module. Country IDs, side labels and raw GeoJSON are absent from the feature vector.

Models are assigned by stable side UID. Weights and explicit disabled-side settings survive full worker/local ownership handoffs. Training callbacks and raw observations do not cross snapshots. Presentation snapshots include only a bounded latest decision per side in `_commanderDecisions`.

The simulation client can send an owner command with a parsed portable model:

```js
simulationClient.command({
  type: "SET_COMMANDER_POLICY",
  payload: { model, sideUid: "the-current-stable-side-uid" },
});
```

Omit `sideUid` to target all active sides. Pass `model: null` to return those sides to scripted decisions. This API is for application integration; it is not a new game settings menu or a browser-global variable. Edits to drawing/UI mirrors are not simulation commands.

For an explicit experimental game build:

```sh
node scripts/rl/export.mjs --model training-results/commander/checkpoint.json --runtime
biome check .
node --experimental-vm-modules scripts/module-graph-smoke.mjs
```

`--runtime` writes validated static weights into `src/commander-model.js`. New simulation owners then use this bundled model for initial sides. Set its export back to `null` to restore the default for new games. Treat this generated source as a normal project change: synchronize and bump the patch/cache version before committing. Training and evaluation always explicitly disable bundled defaults so results depend on their supplied policies.

## Experience and self-play

The world-map-2022 compiled asset supplies real geography. Current training scenarios are Turkey–Iraq and Germany–France–Italy. Evaluation scenarios are Côte d'Ivoire–Mali and Germany–France–Poland. These are held-out country combinations on the same world map, not independent geography datasets. They exercise exactly two and three hostile sides. New scenario definitions belong in `scripts/rl/environment.mjs`; the train/evaluation split is enforced by the CLIs.

Each rollout records candidate feature vectors, selected action, side UID, logical tick, reward and elapsed logical ticks between decisions. Policy exploration has its own seeded RNG, independent of simulation randomness. Globals temporarily used by the existing fixture are restored even after an error. Seed zero maps to a fixed nonzero xorshift state.

Training cycles through:

1. All sides using the current shared policy; every side's experience contributes to the update.
2. One learning side against the scripted AI.
3. One learning side against an archived policy.
4. One learning side against a mixture of scripted and archived policies in a three-side war.

The designated learning side rotates across complete cycles. Opponent snapshots are fixed throughout each episode. A snapshot is retained every four episodes, up to the initial bootstrap opponent plus the latest fifteen snapshots. Archived or scripted opponent records never contribute policy gradients. The actor receives one update after each episode; old gameplay records are used only for imitation, not incorrectly replayed as fresh on-policy experience.

The teacher approximates the existing commander's land decision: keep a current operation, otherwise select the highest-priority eligible land candidate, otherwise defend. Demonstration collection itself runs the unchanged scripted planner. It does not label all current behavior as optimal.

Collect a reusable demonstration dataset and pretrain from it:

```sh
node scripts/rl/collect.mjs --episodes 20 --output training-results/demonstrations
node scripts/rl/train.mjs --dataset training-results/demonstrations/demonstrations.jsonl --episodes 100 --output training-results/from-demonstrations
```

`dataset.json` stores feature names, source fingerprint, map/config fingerprints, seeds and scenario settings. `demonstrations.jsonl` contains compact decision records. The trainer rejects evaluation-scenario demonstrations. This setup does not collect human sessions or automatically train on every map, save, or geography file in the repository.

## Rewards and episode endings

An interval's shaped reward is the change in:

```text
controlled cells / initial controlled cells - 1
  - 0.25 * casualties / initial personnel
```

A genuine single-side victory adds `+1` to the winner's final interval and `-1` to the losing sides. A natural terminal draw has no victory bonus. A time limit is a **truncation** with no fabricated winner; its reward-to-go bootstraps from the value estimate of the final state. Discounting uses `gamma ** (elapsedTicks / 300)` because reassessment intervals vary. Defeated sides have no future value.

This reward favors territory and casualty conservation and can still encourage undesirable tactics. Inspect victories, casualties, retained territory and behavior across different horizons rather than treating shaped reward as strategic strength. The hard-coded movement and defense gates still bound what an action can accomplish.

## Evaluation and scaling

Evaluation uses deterministic inference, fixed held-out scenarios, separate default seeds starting at 100,000 and every candidate-side position. Each match is paired with an otherwise identical baseline seed and deployment. The default opponent is the scripted AI; `--opponent PATH` compares against a frozen older policy. No weights change during evaluation.

```sh
node scripts/rl/evaluate.mjs --model training-results/commander/model.json --seeds 10 --ticks 7200 --output training-results/long-evaluation
node scripts/rl/evaluate.mjs --model training-results/commander/model.json --opponent training-results/older/model.json --seeds 10 --output training-results/history-evaluation
```

`--require-improvement` returns exit code 1 unless mean shaped-reward delta is positive and mean territory delta is nonnegative in **each** evaluated scenario. This is a preliminary numerical gate, not a statistical confidence test or an automatic promotion/deployment mechanism. Wins, losses, terminal draws and unfinished wars remain separate report fields.

Example of a larger experiment after measuring the short run:

```sh
node scripts/rl/train.mjs --episodes 1000 --ticks 7200 --units 80 --grid 0.5 --bootstrap 20 --output training-results/long-run
```

Training currently runs episodes sequentially on CPU. The compact actor does not need the local GPU; simulation throughput may dominate as army sizes grow. Reports include actual Node milliseconds per tick, excluding map loading. They do not measure browser rendering or GPU performance. Distributed rollout workers, GPU training, PPO, human demonstrations and broader action spaces remain possible extensions rather than dependencies of this runnable baseline.

## Verification

```sh
biome check .
node scripts/rl/lint.mjs
node --experimental-vm-modules scripts/module-graph-smoke.mjs
node scripts/rl-smoke.mjs
node scripts/simulation-core-smoke.mjs
node scripts/simulation-client-smoke.mjs
node scripts/simulation-worker-smoke.mjs
node scripts/army-overhaul-smoke.mjs
node scripts/ai-operations-smoke.mjs
node scripts/ai-retreat-smoke.mjs
```

The RL smoke uses numerical finite differences for actor/entropy gradients, checks actual imitation and reward-driven learning, masks illegal proposals, verifies model validation and ownership transfer, compares teacher collection against the scripted baseline, exercises all three sides, and runs collection/training/resume/evaluation/export CLIs. It compares resumed actor/critic/RNG state against uninterrupted training. Its temporary files are removed.

Verification remains source inspection, lint and Node only. No browser/gameplay automation or fullscreen is permitted.

Initial setup validation on 2026-10-02 completed 16 learning episodes, after two teacher episodes, at 900 ticks, 24 formations per side and a 0.5-degree grid. All four opponent modes ran, producing 91 on-policy decisions and five league snapshots. The actor weights changed, and checkpoint/model export completed. Five held-out evaluation matches rotated every side position at seed 100,000. All reached their time limit with zero territory/reward delta against the scripted baseline. This establishes a working training/evaluation pipeline; it provides no evidence of stronger strategic play. The local artifacts are under `training-results/commander-setup/` and are intentionally not committed.

The policy-gradient equations follow the [vanilla policy gradient reference](https://spinningup.openai.com/en/latest/algorithms/vpg.html); this implementation uses episodic rewards-to-go and a linear value baseline, without claiming to reproduce that library's GAE/MPI implementation.
