# Modern Wars CPU bottleneck audit

Measured on 2026-09-30 using an AMD Ryzen 7 5800X, Linux x64, and Node v26.10.0. Simulation code: `37401ad` (0.27.38); the profiling tools were added for 0.27.39. No browser, gameplay automation, fullscreen, or GPU measurement was used.

**The main scaling bottleneck is repeated per-unit AI targeting. The biggest recurring stalls come from synchronous proposal generation and scoring.** Small wars fit the CPU budget; crowded and larger wars expose these costs.

## Measured tick times

Each row pools three fresh, unprofiled processes: 300 warmup ticks followed by 600 measured ticks at standard 0.15° resolution (2,880,000 world cells). CPU sampling, allocation sampling, detailed timers, and worker-message measurements run separately.

| Controlled deployment | Initial units | Mean units during measurement¹ | Mean tick | P95 tick | Worst observed tick |
| --- | ---: | ---: | ---: | ---: | ---: |
| Turkey–Iraq, lighter army | 240 | 227 | 8.32 ms | 11.55 ms | 46.04 ms |
| Turkey–Iraq, mixed deployment | 1,000 | 865 | 40.77 ms | 54.52 ms | 140.52 ms |
| Turkey–Iraq, initially spread out | 1,000 | 1,137 | 42.44 ms | 51.59 ms | 115.65 ms |
| Russia–China | 2,400 | 2,497 | 52.83 ms | 70.71 ms | 155.86 ms |
| Germany/France/Italy/Poland FFA | 1,600 | 1,500 | 67.28 ms | 95.94 ms | 468.35 ms |

¹ First repetition; units can recruit, merge, and die. Mixed deployment places half the initial army on hostile borders and half inside its country. The spread case changes the initial deployment, then allows the same AI to run; it does not hold density or surviving unit counts constant.

A 60 Hz simulation has 16.67 ms per tick. The lighter case meets that budget on **98.5% of measured ticks**. All measured ticks in the four heavier cases exceed it. These are CPU tick timings, **not browser FPS**. Worst observations include scheduling and JIT variability; the repeated FFA stalls around tick 320 were about 204–240 ms, rather than consistently 468 ms.

The three mixed regional run means were 40.99, 40.77, and 40.53 ms. The large and FFA repetitions also agreed closely.

## Where the work goes

1. **Enemy targeting dominates steady work.** The dense regional detailed pass puts roughly 75% of tick time in the ground-unit loop and roughly 60% in its enemy scan, with about 114,000 enemy candidates visited per tick. The scan walks coarse 2.5° spatial-hash buckets, examines candidates individually, and repeats water/neutral-path tests. See `src/ground-unit.js:627–707`. V8 sampling independently identifies the candidate grid lookup at line 647, longitude/grid conversion in `src/simulation-engine.js:146`, and the ground-unit call in `src/simulation-tick.js:1451`.
2. **The proposal planner causes recurring long stalls.** A separate FFA diagnostic at tick 320 spent 134.95 ms in `legacyPlans`; almost all of that was `evaluateAllPlans`, while the operational task-force update took about 0.001 ms on that tick. A regional diagnostic at tick 321 spent 80.96 ms in planning. `src/ai-plan-execution.js:108–141` generates and scores proposals synchronously. It already limits proposal work to one side per tick, but one side can still consume far more than the entire tick budget.
3. **Frontline work causes additional spikes.** Diagnostic tick 311 spent 47.81 ms in regional frontline work and 42.73 ms in FFA frontline work. `src/frontline-core.js:101` scans the world for frontier cells; layout construction and assignment also run synchronously. This cost is separate from proposal-planning stalls.
4. **Snapshots are a secondary cost.** In the Node worker probe, regional snapshots averaged 2.06 ms to pack and 0.89 ms to apply; large-war snapshots averaged 7.77 ms to pack and 3.69 ms to apply. The probe sends one snapshot per two logical ticks, with one outstanding message and real transferable buffers. The production wire format also deep-clones plan/debug state; it sends substantially more than unit positions.
5. **Temporary allocation is heavy, but GC pauses are smaller.** Regional unprofiled runs recorded 452–453 collections and 155–195 ms of total GC time across roughly 24 seconds of measured work. That is below 1%. Allocation samples point strongly to the unit loop and pair iteration; sampled allocation totals are cumulative estimates, not retained RAM. The first regional process ended with 44.4 MiB of JS heap and 157.4 MiB of ArrayBuffers. Sparse influence itself used only about 0.7 MiB. Reducing allocation and global buffers remains useful, but the largest immediate CPU opportunity is AI work.

Detailed timer categories overlap; `prePlans` includes earlier stages. Inclusive CPU percentages also overlap and can be affected by inlining. They must not be added as independent percentages.

## Recommended next changes

- Replace broad enemy scans with tighter tactical queries, cached reachable targets, and shared cell-level threat summaries. Refresh strategic targets in cohorts; preserve immediate combat reactions.
- Give proposal generation/pathfinding a deterministic work budget. Resume unfinished work across ticks, reuse reachability results, and avoid regenerating unchanged proposals. This should target stutter separately from average tick cost.
- Maintain frontier sets incrementally and rebuild affected theater regions/chunks. Avoid rescanning the entire world for local changes, and budget expensive layout/assignment work.
- Reuse per-frame/per-country AI data and hot-loop scratch objects. Split large hot functions around real responsibilities, while checking that the refactor reduces actual work and allocation.
- Send minimal presentation state and plan revisions. Publish diagnostic plan data only when its overlay needs it, instead of cloning all plans on every snapshot.

A stack rewrite is not the first priority suggested by these measurements. Reducing candidate visits and synchronous planning addresses the observed costs directly. A short V8 JIT trace also recorded repeated `IC changed` delays optimizing the main tick; that is a diagnostic lead for stabilizing data shapes, not a measured speedup claim.

## Reproduce and inspect

```sh
# Default stress suite: real borders/cities, separate CPU sampling and worker probe.
node scripts/profile-performance.mjs --heap --output performance-results/latest

# A lighter war and detailed counters.
node scripts/profile-performance.mjs --case regional --units-per-side 120 --phases

# Change initial distribution while retaining the same AI.
node scripts/profile-performance.mjs --case regional --spread --phases

# Compare future runs using identical inputs and the same host/runtime.
node scripts/profile-performance.mjs --compare performance-results/latest/report.json

node scripts/cli-profiler-smoke.mjs
```

Reports and profiles are saved under the ignored `performance-results/` directory. This audit's local evidence is in `audit/`, `lighter/`, and `spread/`: terminal summaries, per-tick JSON, CPU profiles, optional allocation profiles, detailed phase runs, short spike diagnostics, and a JIT trace. The committed document records the findings; generated profiles are not committed or imported by the game.

The fixture loads the actual compressed 2022 scenario and assigns cities and units to their real owners. It uses a repeatable benchmark-only random stream and normal fractional unit IDs. Personnel is fixed at 1,000 per initial formation, with 25% additional reserve and explicit manual manpower. Recruitment can therefore raise actual marker counts above the requested initial count. Normal global loading already flattens mountain terrain, which the fixture matches. Missiles and treaties are disabled. These controlled stress deployments bypass the menu's initial deployment and formation compaction; they are not exact reproductions of every campaign. Browser rendering, DOM updates, browser-worker timer scheduling, network startup, and GPU cost remain outside this measurement.
