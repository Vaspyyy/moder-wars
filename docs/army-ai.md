# Army AI architecture

The active simulation owner runs all strategic decisions and movement. Browser mirrors only display the results. The strategic pipeline remains **PROPOSE → WEIGH → DECIDE → EXECUTE → REASSESS**. The army command layer turns selected plans into persistent front coverage, operational formations and explicit movement orders.

## Ownership and scheduling

`src/ai-runtime.js` composes the pure command, navigation and encirclement modules through its owner context. No new core module imports `main.js`, reads the DOM or accesses the browser. The worker runs the same core as the offline fixtures.

Normal operational updates process one due side per tick, with at least 15 ticks between updates to a side. Front geometry and threat attribution refresh every 60 ticks. Explicit world/lifecycle changes can force updates to all sides. Proposal reassessment retains its existing interval and forced cooldown. One side's proposals are generated at a time, resuming across ticks with at most two units of work per tick. A unit is one bounded search (a land or sea path, a reachability flood or an encirclement test), one front's assessment, or one pass over the map, cities or units; the side keeps its queue slot until its proposals are scored and applied. A job restarts if the side's members or the world change under it, and offensive targets the side took, or whose owner stopped being hostile, while it was suspended are dropped before scoring. The budget counts work, never time, so seeded wars stay deterministic. Route failures request side-specific reassessment at most once per 300 ticks; they do not dirty every side every frame.

Full acknowledged ownership transfers retain orders, sector IDs, recovery flags, task-force membership, bounded route segments and explanations. Shared route fields are ephemeral and rebuild under their normal budget after a transfer. Diplomacy clears obsolete command assignments before repartitioning the world. Presentation snapshots carry bounded diagnostics through the existing debug-plan channel, without raw geography or navigation fields.

## Front coverage before offense

`src/army-command.js` splits connected hostile frontlines into sectors about 2.5 degrees long, up to 96 per side. Nearby previous anchors preserve sector identity as the border moves. Each deployed land formation contributes threat or friendly power to its nearest relevant sector within three degrees, once. Overlapping sectors cannot repeatedly count the same enemy army.

Coverage claims formations before offensive recruitment. Baseline defense shares are 30% for aggressive, 40% for balanced and 65% for defensive postures. Every sector receives a formation when the eligible army is large enough. Threat and nearby friendly cities weight additional coverage. Existing assignments receive a travel discount, reducing needless switching. A further 12% of healthy formations become theater reserves; a pressured sector can use these as reinforcements. These are configurable heuristics, not claims of universally optimal force ratios.

A bounded staging pool preserves existing naval invasion/supply recruitment. Naval, supply, garrison and coastal assignments retain their specialized controllers. Emergency defense can reclaim recovering task forces. Units left outside a selected operation screen nearby sectors instead of chasing distant enemy coordinates.

## One army movement authority

Ordinary land formations receive one `_armyOrder`: `MOVE`, `ASSAULT`, `HOLD`, `SCREEN`, `RESERVE` or `WITHDRAW`. It records its owner, role, destination, phase, reason and stable signature. The old mixed attraction/frontline movement is bypassed for these orders. Close enemy contact still executes the existing combat action, rather than replacing an enemy formation with a coordinate target. Naval/garrison and mop-up movement keep their specialized paths.

Formation slots span multiple rows with distinct lateral and depth offsets. Slots reserve actual passable grid cells. Support stays behind the advancing line; operational reserves exploit an established breach. Assembly destinations remain on friendly land. Once a formation arrives, it stops without destination jitter. If the local formation area has no free valid cell, the unit holds and reports `FORMATION_CAPACITY_EXCEEDED`.

`src/army-navigation.js` builds sparse reverse Dijkstra fields shared by neighboring destination slots. Cardinal connectivity avoids cutting diagonally across water. Water and neutral land are forbidden; friendly and hostile land are traversable for offensive movement. Conservative orders stay on friendly ground once they reach it, and withdrawal may start in hostile territory. Terrain, enemy presence and congestion add route costs.

Navigation bounds:

- 4,096 heap visits total per logical tick, divided among active fields.
- At most 64 fields, each stopping at 70,000 settled nodes.
- Idle fields expire after 60 ticks; active fields are not repeatedly evicted to make room for new requests.
- Each formation retains at most 32 route cells and 12 recent visited cells.
- A short clear approach reaches the exact formation slot without building another field.
- Repeated visits or 180 ticks without useful distance progress trigger a rebuild, unless recent combat explains the pause.

Cached hops are checked against current ownership and land before movement. Disconnected destinations report `UNREACHABLE`; this status can also mean the bounded field search was exhausted. Invalid destinations report `INVALID_DESTINATION`. Such formations wait for a valid reassignment rather than wander. The implementation does not include a hierarchical continent-scale navigation graph or hard collision avoidance, so units can still share cells in transit and isolated territory may need naval transport.

## Coordinated operations

Task forces retain stable signatures and member roles: `SPEARHEAD`, `LINE`, `SUPPORT`, `RESERVE`. The lifecycle is:

`ASSEMBLING → ATTACKING → CONSOLIDATING → COMPLETE`

Failures lead through `CULMINATED → WITHDRAWING → REGROUPING`, followed by recovery, replacement or completion. Readiness combines assigned power, assembled power and command eligibility. Aggressive/balanced/defensive launch thresholds are 0.65/0.75/0.85. An offensive launch also requires local superiority at the breach and covered flanks. A threatened sector blocks the operation when it has no assigned defenders or its attributed enemy power exceeds available defensive/nearby friendly power by 2.5 times.

Stages expose `ASSEMBLE`, `BREACH`, `EXPLOIT`, `SECURE`, `HALT`, `WITHDRAW` and `REGROUP`. Full turn-preserving land route anchors guide advance. Progress uses strength-weighted member advance, capped by a continuously controlled corridor; one far-ahead unit cannot claim success for an army. Securing an objective requires friendly ownership, at least 80% secured corridor and at least 65% weighted formation advance.

An unsafe flank pauses an attack. Sustained unsafe flanks, lost power, supply collapse, encirclement risk, invalid objectives or stalled advance cause culmination. An offensive operation that makes no meaningful progress for 1,200 ticks withdraws. Assembly has a 1,800-tick timeout even when readiness is high but launch remains blocked. Withdrawal and regrouping retain their finite time limits. Healthy support formations already in combat can cover the first 120 ticks of a withdrawal.

## Geographic pincers

Pincers are the preferred way to win a front; frontal grinding is the fallback. `src/army-encirclement.js` proposes two kinds:

- **Salients.** `findArmyEncirclement` lists every short horizontal or vertical enemy run (at most about 2 degrees) with friendly land at both ends inside a local window, shortest and nearest first. A run is a closure only if taking it removes an enemy component's escape from the window.
- **Double envelopments.** `findArmyDoubleEnvelopment` takes pairs of front points 3 or 4.5 degrees apart, places a meeting point behind the enemy line at 45% of the span, and rasterizes a 4-connected path from each friendly shoulder to it. The cut-off enemy cells must stay inside the window and hold at least one enemy formation; the pair trapping the most formations wins. Up to four fronts per side are tested per proposal run, each one budgeted unit of work.

Both require local superiority of 1.25 times. Encirclement proposals score 45 points plus up to 15 for pocket size and up to 15 for how dug in the defenders near the pocket are. Frontal pushes and city captures lose up to 40% of their score in proportion to the share of nearby enemy strength holding a river or mountain line.

Pincer task forces give 45% of their power to spearheads, launch at 70% of the normal readiness, ignore flank warnings, and time out of assembly after 900 ticks. Both arms drive straight for the meeting point; line and support formations pin the pocket. Losing a shoulder invalidates the operation. A salient closure completes when every closure cell is friendly and the pocket has no external enemy connection; an envelopment completes when the enemy cells left in the pocket and closure can no longer flood out of the window.

## Defensive lines

Rivers (`src/river-lines.js`) and mountain cells with terrain intensity of at least 0.25 are defensive lines (`src/defensive-lines.js`). Every sector holds a friendly line within 0.6 degrees of its front. A sector whose attributed enemy power exceeds 1.3 times its friendly power, or any engaged sector during the six seconds after its side loses a capital, falls back to the nearest friendly line within 3 degrees. It keeps that position until the ratio drops below 0.9. Holding formations take slots on line cells first. Navigation adds a cost of 3 for entering a river cell someone else holds.

## Sealed pockets

`src/encirclement-pockets.js` scans every 30 ticks for war-zone land a side holds that touches only hostile land and holds one of its formations; sea, neutral and home land count as exits. Each pocket records the nearest friendly land outside it (`escape`) and its own cell closest to that land (`edge`). Formations in a pocket lose 0.25 health per tick, rising by the same amount every 120 ticks, and surrender after 300 ticks. Trapped formations get an `ASSAULT` order toward the escape point (`POCKET_BREAKOUT`). Up to six healthy formations within 6 degrees that are not in an operation attack toward the edge (`POCKET_RELIEF`).

## Rotation and manpower

Formations below 40% health can rotate out; severe local outnumbering can also request withdrawal. Safe, arrived recovering formations replenish every 30 ticks, after 180 ticks without combat and with no nearby enemy. Replenishment transfers at most 2% of capacity from existing side reserve personnel. It does not create personnel, reverse casualties or increase side totals. Recovery targets 75% health. After 600 ticks without sufficient recovery, a weak formation can return to useful defensive duty instead of remaining parked indefinitely; substantial subsequent damage can make it eligible to rotate again.

## Diagnostics

**Settings → Display → Show Army Decisions** displays sector coverage/deficits, order lines and destinations, reserve/withdrawal colors and order reasons for the currently observed side. It works independently of the war-plan arrow preference. Reports retain at most 64 recent events and sample at most 96 formation orders. Operation snapshots also expose phase, stage, readiness, advance, secured corridor and completion reason. The overlay is optional and disabled by default.

## Offline verification

Do not launch or automate the game for verification. These commands use Node, source inspection and lint only:

```sh
biome check .
node --experimental-vm-modules scripts/module-graph-smoke.mjs
node scripts/army-overhaul-smoke.mjs
node scripts/ai-operations-smoke.mjs
node scripts/ai-retreat-smoke.mjs
node scripts/ai-stall-budget-smoke.mjs
node scripts/simulation-worker-smoke.mjs
node scripts/observer-overlay-smoke.mjs
node scripts/render-passes-smoke.mjs
node scripts/army-evaluation.mjs --ticks 2400 --cases africa,regional,ffa --require-attack
```

The overhaul smoke exercises coverage/stability, unique slots, shared route budgeting, water/neutral detours, retreats, arrived holding, real contact combat, corridor success, a geographic pincer, personnel conservation, blocked-launch timeouts and seeded ownership transfer. The evaluation runs seeded simulations on compiled 2022 geography and writes ignored JSON reports under `performance-results/`. Reports include CPU timing, assignment coverage, cell density, route statuses, sampled repeated-cell events, operation phases and side outcomes. Repeated-cell sampling is a diagnostic, not proof that all circling is impossible.

Use `scripts/profile-performance.mjs` for a controlled before/after CPU comparison with the same map, grid, initial army size, warmup, sample count and repetitions. Node timings exclude loading and do not measure browser rendering, GPU frame rate or prove general strategic superiority. Runtime visual quality and balance remain outside the verification boundary.

### Validation recorded for this overhaul

On the same Ryzen 7 5800X / Node v26.10.0 host, the Turkey–Iraq fixture used 200 initial formations per side, a 0.25-degree grid, 90 warmup ticks and two fresh processes of 180 measured ticks. The unchanged baseline (`54620e9`) averaged 14.26 ms/tick, with P95 17.84 ms; the overhaul averaged 7.84 ms/tick, with P95 11.95 ms. Above-budget ticks fell from 35 to 3 out of 360. This is a bounded comparison rather than a guarantee for every army size or world.

Seeded 2,400-tick scenarios with 120 initial formations per side finished with 0/10 uncovered sectors for Côte d'Ivoire–Mali, 0/8 for Turkey–Iraq and 0/40 for the European FFA. All exercised actual attacks; withdrawal/regrouping also occurred. Their final maximum same-side cell occupancies were 8, 10 and 7 respectively. No repeated-cell events were detected by the 30-tick sampler. Some destinations remained invalid or unreachable, so these runs do not establish universal route coverage or perfect strategy. Browser/gameplay automation was not performed.

A separate 1,200-initial-formation Turkey–Iraq run averaged 25.67 ms/tick (P95 42.53 ms), above the 16.67 ms budget. The overhaul does not solve every large-war CPU bottleneck; dense combat and strategic work still require further optimization at that scale.
