# AI Rework Plan — Frontline + War Plan System

## Vision

Replace the current "hive mind" AI (each unit independently wanders toward the nearest
frontier cell with cohesion + repulsion) with a Hearts of Iron 4-style system where:

- Units spread along **continuous frontlines** instead of clustering at single cells
- AI evaluates **posture** (offensive/defensive) based on relative strength and desperation
- AI generates and executes **war plans** with map arrows (e.g., `CAPTURE_CITY → Vienna`)
- AI maintains **garrison reserves** on neighboring borders and commits them when desperate
- The existing neutral pathfinding, retreat logic, and combat resolution are preserved

---

## Phase 1 — Frontline Stationing [IMPLEMENTED on `feature/ai-frontline-warplans`]

### What it does
- `computeFrontlinePolys()` scans `dominantSideMap` every 15 ticks to find frontier cells
  between every side-pair, grouping them into ordered polylines (`_frontlinePolys["0_1"]`)
- `assignFrontlineSlots()` distributes units evenly along their assigned polyline, spreading
  clustered units across different segments to form a proper line
- Each unit gets `u.frontSlot = { pairKey, segmentIdx, targetLat, targetLng }`
- Units blend toward their assigned slot position during movement (45% strength,
  inversely proportional to target distance) — active when not mop‑up, not retreating,
  not engaged in combat
- Frontline polylines are rendered as colored lines on the canvas overlay during war

### New data structures
```js
_frontlinePolys["A_B"] = [{lat, lng}, ...]   // ordered polyline of frontier cells
u.frontSlot = { pairKey, segmentIdx, targetLat, targetLng }
```

### Files
`src/engine.js` (computation), `src/main.js` (assignment + movement integration),
`src/renderer.js` (drawing)

### Testing
Start a war, look for colored lines along fronts, watch units spread out along the front
instead of clustering.

---

## Phase 2 — Auto Posture System

### Current
User manually sets `strategy: "DEFENSIVE"` / `"BALANCED"` / `"URBAN"` during setup.
AI desperation modes adjust speed/retreat parameters but don't change fundamental stance.

### New
- Compute **relative strength ratio** per side-pair at the start of each war:
  `ratio = myUnits / enemyUnits * buffWeight`
- Auto-assign posture based on ratio:
  - `ratio > 1.5` → `POSTURE_OFFENSIVE` (full attack, generate CAPTURE_CITY plans)
  - `ratio > 0.7` → `POSTURE_BALANCED` (probing attacks, mostly hold the line)
  - `ratio <= 0.7` → `POSTURE_DEFENSIVE` (dig in, only counter‑attack, no advance)
- The existing `aiCountryState` desperation modes feed into posture:
  - `LAST_STAND` forces DEFENSIVE regardless of strength
  - `OFFENSIVE_DESPERATION` overrides to OFFENSIVE
- Posture changes trigger plan generation (Phase 3)

### Data
```js
_sidePosture[sideIdx] = "POSTURE_OFFENSIVE" | "POSTURE_BALANCED" | "POSTURE_DEFENSIVE"
```

### Effort
~80 lines | **Low effort**

---

## Phase 3 — War Plan Generation

### Plan types

| Plan | Trigger | Behavior |
|------|---------|----------|
| `DEFEND` | Defensive posture | Hold frontline at current position, no advance |
| `CAPTURE_CITY` | Offensive posture, enemy city within reach | Concentrate forces at the nearest high‑value enemy city, push to capture it |
| `PUSH_FRONT` | Offensive posture, no nearby city target | Uniform push along the entire frontline |
| `ENCIRCLE` | 3×+ local numerical superiority | Pin the center, send flanking force around to pocket enemies |

### Plan lifecycle
1. **Generation** — when posture changes or current plan completes, evaluate objectives
   and pick the highest‑priority plan
2. **Preparation** (5–15 seconds) — units assigned to the plan move from their frontline
   slots to staging positions (the frontline segment nearest the objective). No offensive
   movement yet.
3. **Execution** — units collectively push toward the objective. Staging segment units
   become spearhead; the rest of the line follows gradually.
4. **Consolidation** — after capturing the objective, units spread back out along the new
   frontline. Plan is marked complete.

### Data structure
```js
_warPlan[sideIdx] = {
  type: "CAPTURE_CITY",
  target: { lat, lng, name: "Vienna" },
  phase: "PREPARATION" | "EXECUTION" | "CONSOLIDATION",
  assignedUnits: [unit_refs],
  stagingSegment: [{lat, lng}, ...],   // frontline cells nearest to objective
  progress: 0.0,                        // 0 → 1 as units approach objective
  arrowPoints: [{lat, lng}, ...],       // for UI rendering
};
```

### Files
`src/main.js` — `generateWarPlan(sideIdx)`, `evaluatePlan(sideIdx)`

### Effort
~350 lines | **High effort**

---

## Phase 4 — Plan Execution Movement

### Current
100% autonomous per-unit movement with frontier blending, hive cohesion, allied
repulsion, and neutral corridor pathfinding.

### New for plan‑assigned units

**PREPARATION phase:**
- Move to staging cells at 2× speed
- Skip combat engagement unless directly attacked
- Frontline blend disabled — units go directly to staging

**EXECUTION phase:**
- Plan‑directed movement replaces frontier blend:
  `moveDir = planDir * 0.7 + tacticalDir * 0.3`
- Breakthrough point (staging segment): concentrated push at 2× speed with spearhead
  variation (older surge‑coordination logic is subsumed here)
- Flanking units (for `ENCIRCLE` plans): move along a curved path around the objective
  using waypoint interpolation
- The existing neutral pathfinding, retreat logic, hive cohesion, and allied repulsion
  remain active as secondary inputs

**CONSOLIDATION phase:**
- Units spread outward from captured objective toward the new frontline positions
- Resume normal frontier blending at their newly assigned slots

### Files
`src/main.js` — `executeWarPlan(unit, plan)` called from the per‑unit loop

### Effort
~250 lines | **High effort**

---

## Phase 5 — Garrison / Border Reserve System

### Current
No concept of garrisons. All units mobilize at war start and fight on the primary front.
The `reserveShare` parameter exists but only holds back units near city centroids.

### New
- For each country, identify **neighboring non‑warring countries** via `adjacencyCache`
- Compute garrison requirement: `neighborUnitCount * 1.2` (match neighbor + 20% margin)
- Garrison units:
  - Station along the border with the neighbor (using the frontline polyline)
  - Use defensive posture only (don't push into neighbor)
  - Are **excluded** from offensive war plans
- **Desperation recall** — as `aiProfile.reserveShare` increases:
  - `actualGarrison = requiredGarrison * (1 - reserveShare)`
  - At `LAST_STAND` (reserveShare = 0.1): 90% of garrisons stay, 10% recalled to the front
  - At `NORMAL` (reserveShare = 0.02): 98% stay
- Garrison is computed once per `shouldCountLand` interval (every 15+ ticks)

### Files
`src/main.js` — `computeGarrisons()`, `garrisonCheck(unit)`

### Effort
~120 lines | **Medium effort**

---

## Phase 6 — UI: War Plan Arrows

### Current
The `ARROWS` toggle button exists but toggles alliance view (legacy/buggy feature).
The `LABELS` toggle shows country names.

### New
- Repurpose or add a new **`WAR PLANS`** label toggle button in the ingame UI
- When enabled, render war plan arrows on the canvas overlay:
  - Draw a curved arrow from the staging frontline segment to the plan objective
  - Color‑coded by side
  - Dashed during `PREPARATION`, solid during `EXECUTION`
  - Arrow thickness scales with `assignedUnits.length`
- Use the existing `ControlMapLayer` curve‑drawing primitives
  (already has `drawCurvedLabel` for country names)

### Files
`src/renderer.js`, `index.html`

### Effort
~120 lines | **Low‑Medium effort**

---

## Phase 7 — Plan Evaluation & Adjustment

### New
- **Success detection** — when all plan objectives are captured (city under friendly control
  via `dominantSideMap`), mark plan complete → generate next plan
- **Failure detection** — if progress stalls for >30 seconds (no territory gain toward
  objective), mark plan failed → reassess posture → generate new plan (or fall back to
  `PUSH_FRONT`)
- **Interrupt** — if the enemy launches a major counter‑offensive (significant territory
  loss on a different front segment), cancel the current plan → switch to `PUSH_FRONT`
  or `DEFEND` depending on urgency
- Evaluated every ~5 seconds on `shouldCountLand` frames

### Files
`src/main.js` — `evaluateAllPlans()`

### Effort
~60 lines | **Low effort**

---

## Module Architecture (after refactor/module-split)

```
src/
├── config.js       CONFIG, constants
├── geo.js          IndexedDB cache, JSON fetch
├── engine.js       Grid ops, frontline BFS, influence
├── renderer.js     Canvas overlay (territory, units, cities)
├── editor.js       Map editor, terrain, scenario import/export
├── firebase.js     Editor hub, community features
└── main.js         Entry point, simulation tick, unit AI, UI
```

The AI phases touch primarily `src/main.js` (simulation tick, unit AI loop,
war plan generation/execution) and `src/renderer.js` (arrow drawing).

---

## Implementation Order & Dependencies

| Phase | Depends on | Est. lines | Risk |
|-------|-----------|------------|------|
| 1 — Frontline Stationing | — | Done | Done |
| 2 — Auto Posture | 1 | 80 | Low |
| 3 — War Plan Generation | 1, 2 | 350 | High |
| 4 — Plan Execution | 1, 3 | 250 | High |
| 5 — Garrison System | 1, 2 | 120 | Medium |
| 6 — UI Arrows | 3 | 120 | Low‑Medium |
| 7 — Plan Evaluation | 3, 4 | 60 | Low |

**Total new code: ~980 lines** across 6 remaining phases.

---

## Integration Notes

- The existing **neutral pathfinding** (24‑angle corridor sweep) is preserved — plans set
  high‑level direction; pathfinding handles low‑level obstacles
- The existing **retreat logic** and **combat system** are untouched — they complement
  plan execution
- The existing **buff system** feeds into posture (super‑buffed sides are always
  OFFENSIVE regardless of ratio)
- The existing **surge coordination** (`isSurging`) gets subsumed into the plan
  execution phase (breakthrough point logic)
- Country roles (`OFFENSE` / `SUPPORT`) become plan owners vs. plan supporters
  (Phase 3)
