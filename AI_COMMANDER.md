# Strategic AI Commander — Design Document

## Core Philosophy

Every AI decision flows through a single pipeline:

```
PROPOSE → WEIGH → DECIDE → EXECUTE → REASSESS
```

No hardcoded limits, no arbitrary thresholds, no posture-based gates. Every possible action gets proposed, scored against the current strategic situation, and the best ones win. Plans persist until completion or reassessment, not regenerated on every posture oscillation.

---

## 1. PROPOSE — `generateAllProposals(sideIdx)`

Called every 300 ticks (~5s). Generates every possible plan of every type. Returns a flat array of candidate proposal objects.

### Proposal Data Structure

```js
{
    type: "CAPTURE_CITY",
    priority: null,            // filled by scoring engine
    target: { lat, lng, name },
    stagingCells: [...],       // rally points near the frontline / coast
    arrowPoints: [{lat, lng}, {lat, lng}],
    estimatedForceNeeded: 30,  // units required to execute
    estimatedForceAvailable: 45, // units near staging area
    riskAssessment: {
        enemyForcesNear: 25,
        ourForcesNear: 45,
        exposureTime: 1800,    // expected ticks to complete
        enemyCounterWeight: 0.3 // 0=weak enemy vicinity, 1=strong
    },
    geographicData: {
        minSeaDist: 64,
        minLandDist: 9,
        reachesTarget: true    // can land units actually get there?
    }
}
```

### Proposal Types

#### CAPTURE_CITY
- **When**: For every enemy city where `dominantSideMap[cityIdx] !== sideIdx`
- **How**: For each enemy city, check if reachable by land (water-crossing sample). If reachable, compute staging cells from the nearest frontline polyline segment and generate arrow points from staging centroid to city.
- **Output**: One proposal per reachable enemy city.

#### ENCIRCLE
- **When**: For every friendly-side frontline polyline, scan for pockets where `friendlyCount >= enemyCount * 3`
- **How**: Sample frontline points at stride, check local force balance in a radius around each sample. Score pocket size × enemy count.
- **Output**: One proposal per detected pocket.

#### PUSH_FRONT
- **When**: Always available (one proposal per side)
- **How**: Compute unit centroid from live `units[]` array filtered by `sideIndex`. Compute enemy territory centroid from `dominantSideMap` sampling. Arrow from unit centroid to enemy centroid.
- **Output**: Exactly one proposal.

#### DEFEND
- **When**: Always available (one proposal per side)
- **How**: Sample frontline polylines for this side at 60-stride. No target, uses frontline points for rendering.
- **Output**: Exactly one proposal.

#### NAVAL_INVASION
- **When**: For every enemy coastal tile reachable by sea (`minSeaDist > 4.0 && minSeaDist < 400 && minLandDist > 0.1`)
- **How**: Scan enemy-controlled coastal cells (land adjacent to water). For each, compute `minSeaDist` (to friendly coast), `minLandDist` (to frontline). Score by strategic depth, proximity to enemy cities, sea distance.
- **Output**: One proposal per valid enemy coastal tile.

#### NAVAL_SUPPLY
- **When**: If an active naval invasion is in LANDING phase
- **How**: Find closest friendly coastal staging point to the landing zone. Send supply units along the same sea route.
- **Output**: At most one proposal (reinforces the active landing).

#### COASTAL_DEFENSE
- **When**: For every segment of our vulnerable coastline where enemy naval staging points exist within 400 sea-distance-squared
- **How**: Identify friendly coastal tiles. Cluster them into contiguous coastal zones by proximity (<2° apart). For each zone, calculate threat level from nearby enemy naval capability. No visible arrow — this is a passive overlay.
- **Output**: One proposal per vulnerable coastal zone. Units station along the coastal polyline at 0.5× speed, facing seaward.

#### NEUTRAL_GARRISON
- **When**: For every neutral neighbor with a shared land border (adjacency cache)
- **How**: For each neutral neighbor, estimate threat from their `countryMetadata.unitCaps` × 0.3 as baseline. Scale by border length (from `_neutralBorderPolys` cell count). Units spread evenly along the neutral border polyline at 0.5× speed.
- **Output**: One proposal per neutral neighbor with a shared border.

---

## 2. WEIGH — `scoreProposal(proposal, sideIdx)`

Returns a priority score (0—100+). All scoring factors are relative to the current strategic situation. No arbitrary cutoffs.

### Strategic Value (0—40 points)

| Factor | Points |
|---|---|
| Target is a capital city | +30 |
| Target is a major city | +20 |
| Target is a minor city | +10 |
| Strategic depth: `sqrt(minLandDist) × 3` | 0—30 based on how far behind enemy lines |
| Territory gain potential: enemy cells within 3° of target | 0—20 |
| Coastal tile proximity to enemy city: <1° +15, <4° +8, <16° +3 | 0—15 |

### Feasibility (0—30 points)

| Factor | Points |
|---|---|
| Local force ratio ≥ 2.0 | +20 |
| Local force ratio 1.0 — 2.0 | +10 |
| Local force ratio < 1.0 | −15 |
| Land path to target exists | +10 |
| Sea path to target exists | +5 |
| No path to target | −30 (effectively kills proposal) |
| Supply plan available (for naval) | +5 |

### Risk Assessment (0—20 points, inverted)

| Factor | Points |
|---|---|
| Force ratio ≥ 3.0 (low risk) | +20 |
| Force ratio 1.5 — 3.0 (medium) | +10 |
| Force ratio < 1.0 (high risk) | −20 |
| Strong enemy presence within 5° | −10 |
| Multiple enemy plans active nearby | −15 |

### Urgency (0—10 points)

| Factor | Points |
|---|---|
| Enemy making territorial gains nearby | +10 |
| Frontline stalled for >1200 ticks | +5 |
| Enemy naval landing detected on our territory | +20 (pushes coastal defense) |
| War duration pressure: `min(5, simFrameCount / 36000) × 2` | 0—10 |

### Posture Alignment (multiplier)

Applied based on AI strategy from conflict setup:

| AI Strategy | Offensive plans × | Defensive plans × |
|---|---|---|
| AGGRESSIVE | ×1.3 | ×0.5 |
| BLITZ | ×1.4 | ×0.4 |
| BALANCED | ×1.0 | ×1.0 |
| DEFENSIVE | ×0.4 | ×1.4 |
| TURTLE | ×0.3 | ×1.6 |

Offensive plans: CAPTURE_CITY, ENCIRCLE, PUSH_FRONT, NAVAL_INVASION
Defensive plans: DEFEND, COASTAL_DEFENSE, NEUTRAL_GARRISON

### Special Modifiers

| Condition | Effect |
|---|---|
| No active naval invasion and target unreachable by land | CAPTURE_CITY ×0.1 (don't propose what we can't reach) |
| Active naval invasion in LANDING | NAVAL_SUPPLY +30 |
| Enemy naval plan in TRANSIT near our coast | COASTAL_DEFENSE +25 |
| No land connection to any enemy (island war) | DEFEND +20, NAVAL_INVASION +30 |
| Nearby enemy staging coast within 50 sea-dist² | COASTAL_DEFENSE +15 |

---

## 3. DECIDE — `selectPlans(sideIdx, scoredProposals)`

### Step 1: Sort

Sort all proposals by final priority score descending.

### Step 2: Select — respecting slot limits

| Slot | Plan Type | Max Count |
|---|---|---|
| Land offensive 1 | CAPTURE_CITY, ENCIRCLE, PUSH_FRONT | 1 |
| Land offensive 2 | CAPTURE_CITY, ENCIRCLE, PUSH_FRONT | 1 |
| Naval invasion | NAVAL_INVASION | 1 |
| Naval supply | NAVAL_SUPPLY | 1 |
| Land defensive | DEFEND | 1 |
| Coastal defense | COASTAL_DEFENSE | 1 per coastal zone |
| Neutral garrison | NEUTRAL_GARRISON | 1 per neutral neighbor |

**Slot resolution rules:**
1. DEFEND is always selected if no offensive land plan scores higher than it (prevents empty fronts)
2. Land offensive slot 2 only fires if the second-best offensive proposal scores ≥ 60% of the top offensive proposal
3. COASTAL_DEFENSE proposals compete against each other — only the highest-scoring zone gets forces (additional zones are deprioritized unless enemy threats are high)
4. NAVAL_SUPPLY only selected if a NAVAL_INVASION is in LANDING phase
5. PUSH_FRONT serves as fallback: selected only if no CAPTURE_CITY or ENCIRCLE scored above it

### Step 3: Resolve conflicts

- If two CAPTURE_CITY plans target cities in the same direction (units would compete), demote the lower-scored one
- If a selected offensive plan would pull units from COASTAL_DEFENSE, and the coastal threat is high (enemy naval plan active), don't pull those units

### Step 4: Force allocation

Total available force = `_tickUnitsBySide[sideIdx]` deployed units.

Allocation based on AI strategy:

| AI Strategy | Offensive allocation | Defensive allocation | Reserve |
|---|---|---|---|
| AGGRESSIVE | 75% | 20% | 5% |
| BLITZ | 85% | 10% | 5% |
| BALANCED | 50% | 40% | 10% |
| DEFENSIVE | 25% | 65% | 10% |
| TURTLE | 10% | 80% | 10% |

Within each category (offensive/defensive), forces are divided proportionally to plan priority scores.

Example — BALANCED with 300 deployed units, proposals:
- CAPTURE_CITY (score: 80) → 80/140 of 150 = 85 units
- ENCIRCLE (score: 60) → 60/140 of 150 = 65 units
- DEFEND (score: 50) → 50/100 of 120 = 60 units
- COASTAL_DEFENSE (score: 30) → 30/100 of 120 = 36 units
- NEUTRAL_GARRISON (score: 20) → 20/100 of 120 = 24 units
- Reserve = 30 units

Unit assignment per plan:
- Units nearest to the plan's staging area get recruited first
- Units already committed to higher-scored plans are not poached
- `maxAssignedUnits` set to the allocated force count

### Step 5: Convert to plan objects

Selected proposals are converted to actual `_warPlan[]`, `_navalPlan[]`, `_navalSupplyPlan[]` entries. COASTAL_DEFENSE gets its own array `_coastalDefensePlan[]`. NEUTRAL_GARRISON gets `_neutralGarrisonPlan[]`.

Plans start in the appropriate phase:
- CAPTURE_CITY, ENCIRCLE: PREPARATION
- PUSH_FRONT, DEFEND, COASTAL_DEFENSE, NEUTRAL_GARRISON: EXECUTION
- NAVAL_INVASION: GATHERING
- NAVAL_SUPPLY: GATHERING

---

## 4. EXECUTE — Plan Execution System

### Phase Transitions

| Plan Type | Transition | Condition |
|---|---|---|
| CAPTURE_CITY, ENCIRCLE | PREPARATION → EXECUTION | ≥5 units gathered within 1.4° of staging cells |
| CAPTURE_CITY, ENCIRCLE | EXECUTION → CONSOLIDATION | Target captured (`dominantSideMap === si`) |
| CONSOLIDATION any | → Regenerate plans | 1800 ticks elapsed |
| DEFEND, PUSH_FRONT, COASTAL_DEFENSE, NEUTRAL_GARRISON | No transitions | Execute continuously |
| NAVAL_INVASION | GATHERING → EMBARKATION | ≥5 units within 0.7° of staging point |
| NAVAL_INVASION | EMBARKATION → TRANSIT | ≥60% of assigned units at sea |
| NAVAL_INVASION | TRANSIT → LANDING | ≥3 units landed near target coast |
| NAVAL_INVASION | LANDING → Complete | 900 ticks elapsed → generate post-landing plan |
| NAVAL_SUPPLY | GATHERING → EMBARKATION | ≥3 units gathered |
| NAVAL_SUPPLY | EMBARKATION → TRANSIT | ≥60% at sea |
| NAVAL_SUPPLY | TRANSIT → DELIVERED | ≥2 units landed near target |
| NAVAL_SUPPLY | DELIVERED → Complete | 600 ticks → release units |

### Post-Landing Decision (after NAVAL_INVASION LANDING completes)

Count enemy vs friendly forces within 5° of the beachhead:

- **forceRatio ≥ 1.5**: Generate CAPTURE_CITY plan targeting nearest enemy city from beachhead, phase PREPARATION, staging cells at landing zone
- **forceRatio < 1.5**: Generate DEFEND plan at beachhead, wait for supply reinforcements

### Unit Movement During Plan Execution

When `isPlanUnit === true`:
- `borderDir` blend suppressed (plans control direction)
- `pushReadiness` kept at 1.0 (no old-AI speed override)
- `frontSlot` skipped for DEFEND/COASTAL/GARRISON plans
- `planSpeedMult` controls speed based on plan phase

### COASTAL_DEFENSE Execution

- Units station along the coastal polyline segments
- Spread evenly across the vulnerable zone
- Speed: 0.5× (holding position, minor patrol movement)
- When enemy transports detected within 3° at sea: units mobilize toward contact point at 1.5×
- Coexists with DEFEND plan — units can be in either but not both

### NEUTRAL_GARRISON Execution

- Units spread evenly along neutral border polyline (`_neutralBorderPolys[countryId]`)
- Speed: 0.5× (holding position)
- Excluded from naval plans (already gated by `!isGarrisonUnit`)
- When proposal system detects a neutral becoming hostile → units can transition to frontline duty

### Defender Reaction to Enemy Landings (ENHANCED)

**Proactive detection** (NEW):
- During TRANSIT phase: if enemy transports spotted at sea within 5° of our coast, flag the coastal zone as threatened
- During GATHERING phase: if enemy is massing on a staging coast near us, pre-position defenders

**Reactive response** (IMPROVED):
- When enemy enters LANDING phase on our territory:
  - Assess force ratio as before
  - If outnumbered: create a temporary DEFEND plan at the beachhead with staging cells around the landing zone
  - Instead of individual `_defenderReactTarget` assignments, units join the structured plan
  - Pull from nearby frontline units (3°—10° range)

**Cleanup** (FIXED):
- When enemy naval plan is cancelled/completed: clear all reaction targets
- When enemy side eliminated: clear all reaction targets
- Periodic cleanup every tick: stale targets (>1800 ticks without progress) cleared

---

## 5. REASSESS — `shouldReassess(sideIdx)`

Triggers a full PROPOSE → WEIGH → DECIDE cycle when:

| Trigger | Detail |
|---|---|
| Plan completed | Any active plan finished (captured target, landing completed, supply delivered) |
| Plan failed | Stall detection: 1800 ticks without phase progress (reset per phase transition) |
| Territory change | Any country on this side gained/lost >2% territory |
| Posture change | AI strategy or posture changed |
| Enemy landing detected | Enemy NAVAL_INVASION entered LANDING phase on our territory |
| Enemy offensive detected | Enemy CAPTURE_CITY or ENCIRCLE plan targeting our cities appeared |
| Force ratio change | Our global force ratio vs enemies changed by >20% |
| Periodic | Every 300 ticks unconditionally |

---

## 6. Data Structures

### Plan Arrays

```js
export const _warPlan = [];             // per-side land plan (up to 2 per side)
export const _navalPlan = [];           // per-side naval invasion (1 per side)
export const _navalSupplyPlan = [];     // per-side naval supply run (1 per side)
export const _coastalDefensePlan = [];  // per-side coastal defense (1+ per side)
export const _neutralGarrisonPlan = []; // per-side neutral border garrisons (N per side)
```

### Proposal Cache

```js
const _proposalsCache = [];             // per-side: { tick: number, proposals: [...] }
```

Cache invalidation: cleared on reassessment. Between reassessments, the cached proposals are re-used to avoid expensive recomputation.

### Unit Flags

| Flag | Purpose |
|---|---|
| `u.navalAssigned` | Assigned to NAVAL_INVASION plan |
| `u.supplyAssigned` | Assigned to NAVAL_SUPPLY plan |
| `u.coastalAssigned` | Assigned to COASTAL_DEFENSE plan |
| `u.garrisonAssigned` | Assigned to NEUTRAL_GARRISON plan |
| `u._defenderReactTarget` | Reacting to an enemy naval landing (temporary) |

---

## 7. Removed Thresholds & Hardcoded Limits

The following are replaced by the proposal scoring system:

| Old Threshold | Replacement |
|---|---|
| `unitCount < 5` guard in naval plan generation | Low-force proposals get low feasibility scores, deprioritized naturally |
| `_sidePosture === "OFFENSIVE"` gate | Posture alignment multiplier handles this |
| `simFrameCount % 150 === 0` timing gate | REASSESS periodic trigger (300 ticks) |
| `minLandDist < 0.5` filter | Scored instead of filtered — deprioritized, not rejected |
| `minSeaDist > 400` filter | Scored instead of filtered |
| `maxAssignedUnits = unitCount * 0.5` caps | Force allocation from AI strategy percentages |
| Plan regeneration on every posture change | Plans persist until reassessment triggers |
| `localAllyCount < 3 → pushReadiness = 0.0` | Removed; plans control movement speed |

---

## 8. Implementation Phases

| Phase | Item | Effort |
|---|---|---|
| 1 | Proposal engine: `generateAllProposals()`, `scoreProposal()`, `selectPlans()` | High |
| 2 | Migrate existing plans (CAPTURE_CITY, ENCIRCLE, PUSH_FRONT, DEFEND) into proposal system | Medium |
| 3 | Migrate naval plans (NAVAL_INVASION, NAVAL_SUPPLY) into proposal system | Medium |
| 4 | Add COASTAL_DEFENSE proposal + execution + passive overlay rendering | Medium |
| 5 | Fix NEUTRAL_GARRISON: threat estimation from unitCaps, proposal + execution | Medium |
| 6 | Enhance defender reaction: proactive detection, structured response, stale cleanup | Medium |
| 7 | Wire `evaluateAllPlans()` to use the proposal pipeline + REASSESS triggers | Medium |
| 8 | Expand land plan slots to 2 per side, concurrent execution | Medium |
| 9 | Future: AI preemptive neutral border violation decision | Future |
| 10 | Future: Player-controlled naval invasions | Future |
