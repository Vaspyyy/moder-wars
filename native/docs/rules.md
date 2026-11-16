# Rules of the browser game (reference)

**This is what the old game does, not what the native game must do.** Use it to understand a rule before deciding whether to port it, then write the native rule as a test first. The decisions at the end come first.

Based on the browser game at commit `0ab5744`. All references are `file:line` in the browser game's code. "Tick" means one call of `performSimulationTick` (`src/simulation-tick.js:11`). Distances are degrees of latitude/longitude on an equirectangular grid everywhere (no cos(latitude) correction).

## Decisions before porting

The old game often has two or three versions of the same idea running at once. The native game picks one, on purpose, with a test.

1. **One combat model.** The old game runs proximity combat (distance falloff, line defense, war grace) and melee (flat damage, knockback, no grace) side by side (sections 6.1-6.2).
2. **One movement system.** Army-order navigation, a legacy steering blend of about ten weighted vectors, and naval/transport plan speeds move the same unit at very different speeds (section 5).
3. **One AI planner.** Legacy war plans and operational task forces run together, with force shares that disagree (section 11).
4. **One encirclement idea and one posture idea.** The old game has three of each (sections 6.6, 8.3, 11; and 3, 11).
5. **Seeded randomness with explicit traits.** The old game draws everything from unseeded `Math.random()` and uses random unit ids as hidden per-unit personality (section 12).
6. **Results must not depend on game speed or real time.** Old shortcuts switch on at 3x speed and peace deals land after 3.5 seconds of wall-clock time (section 12).
7. **Distance.** Decide between planar degrees and cos(latitude)-corrected distance, and wrap longitude everywhere (the old code wraps only in some places). *Decided in 4c: real metres (a cell's width shrinks with cos(latitude)), longitude wraps everywhere (`sim/src/map.rs`).*
8. **War end.** Old peace offers only happen while some side is desperate, and the player never answers them; three peace paths split land differently (section 9).
9. **War grace.** The intended rule is about 600 ticks of ceasefire after a declaration. The old code computes it from a counter that is reset later, so a second war in one session gets the wrong length, and the grace blocks only proximity combat (`src/war-start.js:147-148` vs `233`).
10. **Terrain.** Mountain rules exist but never run on Earth maps (no terrain data at the shipped grid size, `src/geography-loader.js:231`). Native terrain is new design, not a port.

---

## 0. Tick order (the backbone)

One tick runs these steps in this order (`src/simulation-tick.js`):

| # | Step | Ref |
|---|---|---|
| 1 | `_simTickCount++`; stop if `gameState == WAR_OVER` | 110, 116 |
| 2 | Build per-tick maps: country→side, country stats `{units, controlled, owned}` | 153-160 |
| 3 | Sum land strength of side 0 and side 1 only (`kind=="army"`, strength-weighted) | 171-185 |
| 4 | **Influence update** (territory capture) | 188 → `src/influence-runtime.js:316` |
| 5 | Occupier speckle smoothing, every 120 ticks (phase 83) | 197-266 |
| 6 | Territorial integrity (enclave decay), every 200 ticks (phase 67) | 286-345 |
| 7 | Background jobs step (160k items) + territory census step; census commit flag every 200 ticks (phase 133) | 349-366 |
| 8 | Clamp `sideSoldiers >= 0` | 371-373 |
| 9 | Spatial hashes (2.5° buckets), tactical grid (0.6°), "nearby hostile" flags, friendly repulsion, local ally weight | 381-555 |
| 10 | Frontline direction field (≥150 ticks, phase 7/3) and frontline polylines/slots (≥30 ticks, phase 7/5) | 557-579 |
| 11 | Merge overlapping legacy units, every 30 ticks (phase 11) | 582-586 |
| 12 | Copy census to country stats; saturation flag | 590-601 |
| 13 | Units by side; hostile unit counts; "overwhelming force" (2-side wars) | 603-642 |
| 14 | Grid index + at-sea flag per unit | 645-652 |
| 15 | Victory ratio + surge flags; 4 "battle group" centroids per side | 659-721 |
| 16 | Mop-up assignment of collapsed enemy countries | 725-748 |
| 17 | City counts per occupier; capital-lost set; capital fall tick | 750-779 |
| 18 | Country posture profiles, every 200 ticks (phase 37) | 785-936 |
| 19 | Side momentum + war phase, every 200 ticks | 940-998 |
| 20 | Live combat power; side posture (OFFENSIVE/BALANCED/DEFENSIVE) | 999-1074 |
| 21 | Legacy plan evaluation (`evaluateAllPlans`) then operational task forces / army command | 1082-1093 |
| 22 | Neutral border polylines (only when topology changes) | 1096-1166 |
| 23 | **Recruitment** (per country, random roll) | 1170-1330 |
| 24 | City lookup caches | 1333-1389 |
| 25 | **Per-unit update, iterating the unit array from last to first** | 1470-1471 → `src/ground-unit.js:123` |
| 26 | Sealed pocket scan, every 30 ticks (`tick % 30 == 0`) | 1477-1478 |
| 27 | Country capitulation (only on a fresh census tick); a capitulation **ends the tick early** | 1486-1523 |
| 28 | Global end check (`evaluateGlobalConflict`) | 1531-1541 |
| 29 | 2-side 99.9% territory capitulation; else random peace offers | 1567-1652 |
| 30 | No units at all → WHITE_PEACE | 1654-1657 |
| 31 | Missiles ("bombs") flight/impact and random launches; explosions decay | 1660-1773 |
| 32 | Cache unit counts / soldier estimates | 1777-1790 |

`isSimulationPhaseDue(tick, interval, offset)` = `tick >= offset && (tick - offset) % interval == 0` (`src/simulation-phase-wheel.js:25-30`).

---

## 1. World model

### 1.1 Grid
- Resolution `GRID_RES` default **0.1°** (`src/config.js:3`). UI choices 0.25 / 0.15 / 0.1 (default) / 0.05 (`index.html:72-77`, `src/settings.js:6`).
- `gridWidth = ceil(360/res)`, `gridHeight = ceil(180/res)` (`src/main.js:6586-6587`). At 0.1°: 3600 × 1800 = 6.48 M cells.
- Cell index `i = y*W + x`; row `y` counts **from the south pole up** (lat = y·res − 90), column `x` from lng −180 (`src/simulation-engine.js:146-154`).
- Point→cell: `lng' = ((lng+180) mod 360 + 360) mod 360 − 180`; `x = floor((lng'+180)/res)`, `y = floor((lat+90)/res)`; out of range → −1 (`src/simulation-engine.js:146-154`).
- Cell centre for spawning/targets: `(y+0.5)·res − 90`, `(x+0.5)·res − 180` (e.g. `src/army-navigation.js:28-31`). Some code uses the cell corner instead (`src/simulation-tick.js:1154`, `src/ground-movement.js:241`).
- East-west wraps when `W·res ≥ 359.9` (navigation, pockets, defensive lines: `src/army-navigation.js:162`, `src/encirclement-pockets.js:107`). Several older scans (integrity, smoothing, influence footprint) do **not** wrap.
- The grid resolution cannot change while a simulation core runs (`src/simulation-core.js:387-390`); the browser path can resize (`src/main.js:6573-6577`, `src/simulation-resize.js`).

### 1.2 Per-cell layers
Allocated in `src/simulation-core.js:92-115` and `src/main.js:6586-6597`.

| Layer | Type | Meaning | Changes during war? |
|---|---|---|---|
| `landMask` | u8 | 0 = water, 1 = land outside the war, 2 = **war zone** (land of an active combatant). Most war logic only touches cells == 2. | Yes: war start sets 2 (`src/war-start.js:409`), capitulation/peace reset to 1 (`src/conflict-resolution.js:278-301,505`) |
| `worldControlMap` | u16 | Country id that **owns** the cell politically (sovereign / current border). 0 = none. | Only at capitulation, treaties, separate peace, editor |
| `deJureMap` | u16 | "Core"/historical owner. Used for defence bonus, capitulation recipient choice, releasables. | No (load-time) |
| `dominantSideMap` | i8 | **Military controller**: side index, or −1. Derived from side influence. | Every influence write |
| `sideInfluenceMaps[s]` | f32 per side (sparse 1024-cell pages) | Control strength of side `s`, normally 0..1 (can reach 1.5, see 7.2). | Yes |
| `occupationMap` | f32 | Signed copy of the dominant side's influence: `+v` for even sides, `−v` for odd sides (`src/simulation-engine.js:56,64`). | Yes |
| `primaryOccupierMap` | u16 | Country credited with holding the cell (decides who gets it at peace, city counts). | Yes |
| `terrainMask` | f32 | Mountain intensity 0..1 (0 = flat). | No |
| `riverMask` | u8 | 1 = land cell on a major river or 4-adjacent to one (`src/river-lines.js:27-72`). Only on a full Earth grid. | No (built at war start, `src/war-start.js:77-84`) |
| `biomeMask` | u8 | Cosmetic only. No simulation effect (only loaded/exported/rendered: `src/scenario-loader.js:476`, `src/scenario-export.js:52`). | No |
| `provinceMap` | i32 | Cosmetic pseudo-provinces from a sine-noise hash of (x, y, owner) (`src/simulation-world.js:452-485`). Regenerated after border changes. **No simulation effect.** | Regenerated |
| `frontlineDirLat/Lng` | f32 | Per land cell, unit vector toward the nearest front cell (multi-source 4-neighbour BFS from cells whose 4-neighbour is held by a hostile side) (`src/frontline-core.js:33-130`). | Every ≥150 ticks |

### 1.3 Terrain (mountains)
- Source: baked `mountainData` in scenario JSON, else a Natural Earth "geography regions" GeoJSON scan that classifies polygons by name/type (`src/scenario-loader.js:563-582`, `src/geography-loader.js:222-410`). Mountain intensity `max(0.3, (11−rank)/10)`; basins/lowlands set to 0 (`src/geography-loader.js:361-364,407-409`).
- **The GeoJSON scan is skipped when the grid has more than 600 000 cells** (`src/geography-loader.js:231-236`). Every selectable global grid is larger (even 0.25° = 1.04 M). Compiled `.mwsc` scenarios carry land/deJure/control/biome/province but no terrain (`src/scenario-loader.js:475-477`). **So in normal Earth play terrainMask is probably all zero** (unclear: depends on whether any shipped scenario JSON has `mountainData`; `grep` found none in the build scripts).
- Global toggle `mountainsEnabled` (setup checkbox, `src/war-start.js:289`).
- Effects of intensity `m` (only if `mountainsEnabled`): see 5.2, 6.4, 7.2, 11 (navigation cost `+2m`). "Mountain line" cells need `m ≥ 0.25` (`src/defensive-lines.js:5,9-16`).

### 1.4 Rivers
`riverMask` cell = 1 if a major river polyline passes through it or through a 4-neighbour, land only (`src/river-lines.js:27-72`). Effects: defensive line (6.4), slower crossing into enemy land (5.2), navigation cost +3 (5.3).

### 1.5 Cities
Fields used: `lat, lng, ownerId, sovereignId, isCapital, pop|population`.
- `activeTheaterCities` = cities whose cell is war zone (landMask 2) at war start; their `sovereignId` is set to the cell owner then (`src/war-start.js:525-532`). Joining countries append theirs (`src/war-start.js:1082-1089`).
- City roles in the simulation:
  - Spawn points for recruits (`src/simulation-world.js:553-599`), using **`city.ownerId`** (static).
  - City count per country = cities whose cell's `primaryOccupierMap` is that country (`src/simulation-tick.js:755-763`). Drives recruitment and posture.
  - Capital lost = capital cell's controller side is hostile to the capital's sovereign side (`src/simulation-tick.js:764-772`).
  - Influence gain into a city cell × 0.35 (`src/influence-runtime.js:499`).
  - Melee defence × 0.45 within 0.2° of an own theater city (`src/ground-movement.js:1493-1506`).
  - AI target lists (capitals first, then by population, max 32 per side) (`src/simulation-world.js:402-435`), sector priority (+1, capital +3) (`src/army-command.js:73-88`).

### 1.6 Provinces
Cosmetic only (see 1.2). Rebuilt after capitulation and treaties (`src/conflict-resolution.js:360,572`).

### 1.7 Theaters (regional scenarios)
- A theater = `{id, bounds:[W,S,E,N], countryIds, countryCodes}` (`src/scenario-theater.js:2-33`).
- On load, every cell outside the bounds **or** owned by a non-listed country is zeroed in all grids, including `landMask` → it becomes **water** (`src/scenario-theater.js:42-67`). Grid size and global indices are unchanged.
- War theater at war start = bounding box of all combatants; only cells owned by combatants inside it become war zone (`src/war-start.js:362-431`).

---

## 2. Time

- Base tick rate: **60 ticks per real second at 1×** (`src/simulation-clock.js:11`, `BASE_TICK_MS = 1000/60` in `src/simulation-core.js:52`).
- Clock: fixed-step accumulator. `acc += (now − last) × speed`, capped at `tickMs × maxPendingTicks`; run ticks while `acc ≥ tickMs`, at most **6 ticks per turn** and stop after 8 ms of wall time (`src/simulation-clock.js:33-91`). Live play uses `maxPendingTicks = 60` and clears the backlog when speed is reduced (`src/simulation-clock.js:2-5,99-100`). Pausing zeroes the accumulator (`src/simulation-clock.js:102-106`). A tick callback returning `false` pauses the clock (`src/simulation-clock.js:81-84`).
- The worker pumps the clock every ≤8 ms (`workers/war-simulation-worker.js:76-81`), so the theoretical max is ~750 ticks/s.
- Speeds: `SPEED_STEPS = [1, 2, 3, 5, 10]` (`src/main.js:6403`). A war **starts at 1×** (`src/war-start.js:242`). The core's default `simSpeed` is 3.0 (`src/simulation-state.js:118`).
- **Game calendar** (optional, setup checkbox): one game day = 500 ms of accumulated game time (`src/simulation-state.js:232`); each tick adds `(BASE_TICK_MS/speed)·speed = 16.67 ms` (`src/simulation-core.js:364`, `src/simulation-calendar.js:74-93`), so **30 ticks = 1 game day** at any speed. Default date 1936-01-01 if fields are blank (`src/simulation-calendar.js:16-18`). The calendar only affects missile gating (year ≥ 1942) and force data date (`src/simulation-tick.js:1727-1729`, `src/war-start.js:15-20`).
- Two counters: `_simTickCount` (reset at war start, `src/war-start.js:146`) and `simFrameCount` (also reset, `src/war-start.js:233`, incremented once per tick at `src/simulation-core.js:363`). Different rules use different counters (see decision 9).
- Many intervals are written as "N ticks = N/60 s at 1×" in comments.

---

## 3. Countries and sides

- **Side** = an alliance slot (array of countries). Up to `MAX_SIDES = 8` (`src/simulation-state.js:25`). Each side has a stable string uid `side-N` (`src/simulation-world.js:35-65`).
- **Hostility** is per side pair: a set of uid pairs, compiled into an 8×8 matrix (`src/simulation-world.js:373-382`). `areSidesHostile(a,b)` is false for a==b or out of range (`src/simulation-world.js:67-79`). Default: **every pair of non-empty sides is hostile** (`src/simulation-core.js:232-249`, `src/main.js:2189-2199`). A new side joined mid-war is hostile to all (`src/country-diplomacy.js:116-160`). Pairs can be toggled (`src/main.js:2201-2211`).
- Countries on the same side are allies; there is no country-level diplomacy inside a side.
- **Neutral** = land whose owner is not in any side (`src/simulation-tick.js:162-167`).
- Country fields used by the sim: `id, role, strategy, buffState, hiddenBuffState, attackBuffPercent, defenseBuffPercent, initialCells, color` (`src/simulation-core.js:61-67`).
- **Role** ∈ {`OFFENSE` (default), `SUPPORT`}:
  - SUPPORT units pick an allied OFFENSE country as `beneficiaryId` (credited when capturing) (`src/ground-unit.js:460-481`).
  - OFFENSE units cannot gain influence in an enemy SUPPORT country's cells unless `|occupation| > 0.1` there already (`src/influence-runtime.js:525-533`), and steer around such cells as if neutral when their own influence ≤ 0.1 (`src/ground-movement.js:1104-1118`).
- **Strategy** ∈ {TURTLE, DEFENSIVE, BALANCED (default), AGGRESSIVE, BLITZ}; unknown → BALANCED (`src/ai-planning.js:6-49`). Setup posture maps ADAPTIVE→BALANCED, AGGRESSIVE→AGGRESSIVE, CAUTIOUS→DEFENSIVE for every country (`src/main.js:5348-5357`). Side strategy = strategy with the most weight (weight = country's live units or initial cells) (`src/ai-planning.js:15-35`). `strategy === "DEFENSIVE"` also makes units ignore enemies more than 0.5° away unless the enemy stands on the unit's own land (`src/ground-unit.js:174,728-732`).
- **Buff states** (cheat/handicap): `none, buff, super, godly, weakened, crippled`. A hidden buff overrides the visible one when `invisibleBuffsEnabled` (`src/simulation-world.js:3-18`). Effects in 6.3, 7.2, 4.4.
- Vassals (`overlordId`) auto-join their overlord's side at war start unless disabled (`src/war-start.js:975-998`).
- **Generals**: each side rolls `planQuality = random()`. Outside CONQUEST mode, an underdog side (less land than its enemies) with quality > 0.9 and no strongly buffed enemy gets `super` buff for all its countries (`src/war-start.js:462-514`). Game mode defaults to CONQUEST (`src/simulation-state.js:233`), so normally inactive.

---

## 4. Forces

### 4.1 Formation model
- A formation (unit) is a point `(lat, lng)` with `personnel`, `personnelCapacity`, `health`, `maxHealth`, `sideIndex`, `sovereignId`, `beneficiaryId`, `deployTicks`, `isAlpenjager` (`src/army-formation.js:4-107`).
- `UNIT_TO_SOLDIER_RATIO = 1000` personnel = one "standard formation" (`src/config.js:51`).
- **Strength multiplier** `S = personnel / 1000` (`src/formation-strength.js:305-312`, `src/simulation-world.js:138-148`). Personnel resolves from `personnel`, else `strengthMultiplier × nominal`, else `health/baseHealth × nominal` (`src/formation-strength.js:266-296`).
- `setUnitFormationPersonnel(p)`: `personnel = capacity = round(p)`, `maxHealth = 100 × (p/1000) × (1.25 if Alpenjäger)`, `health = maxHealth` (`src/simulation-world.js:160-176`).
- **Damage → casualties**: `newHealth = health − min(health, dmg)`; `newPersonnel = min(old, round(capacity × newHealth/maxHealth))`; loss subtracted from `sideSoldiers`, added to `sideCasualties`, `countryCasualties`, and a per-victim per-attacker casualty map (`src/simulation-world.js:721-781`). Personnel 0 → health 0.
- Removal: health ≤ 0 or strength ≤ 0 → removed at the start of its own update, **without** returning personnel (`src/ground-unit.js:133-136,1516-1521`). NaN position → removed **with** personnel returned to reserve (`src/ground-unit.js:128-132`).
- New formations spend `deployTicks` doing nothing: 30 by default (`src/army-formation.js:13`), 15 for a country switching side mid-war (`src/war-start.js:1043`).
- **Alpenjäger**: 40% chance when spawned on a cell with terrain > 0.35 (`src/simulation-world.js:631-636`, `src/war-start.js:689-691`). +25% max health (start-of-war units only get it via `mountainHealth`, recruits via `setUnitFormationPersonnel`), ×1.4 speed on mountains, ×1.12 damage dealt, ÷1.12 damage taken (`src/config.js:54-56`, `src/ground-unit.js:274-280`).

### 4.2 Starting army (war start, `src/war-start.js`)
Per country with `C` war-zone cells (584-707):
```
sizeFactor   = max(1, C/1500)
density      = sizeFactor^-0.45
full         = floor(C × 0.066 × density)          # UNIT_DENSITY_FACTOR
floor_       = max(2, floor((startingUnitsFloor ?? 3) × 0.67))
desired      = clamp(floor(full × 0.18), floor_, max(floor_, full))   # INITIAL_SPAWN_FRAC 0.18
count        = min(desired, MAX_UNITS_PER_SIDE − units already on side)
```
- Placement: 25% chance per unit to use a frontline cell (cycled `j % fronts`), pushed 0.6 cell away from the enemy; otherwise a random own city, else a random own cell. Jitter ±0.75 cell; snap to the cell corner if the jittered point left the country (`src/war-start.js:630-687`).
- **Real force data**: if the country has a World Bank active-personnel observation at or before the force date (`gameTimeDate` or `"2024-12-31"`), its formations share `max(n×250, observed)` personnel by Hamilton apportionment (`src/war-start.js:13-50,708-731`, `src/country-force-profiles.js:213-289`). Else each formation has 1000.
- **Compaction**: a side's formations are merged to a budget of 1 marker per 1000 personnel up to 250 000, then 1 per 5000, clamped 1..800 (`src/formation-strength.js:165-204`); personnel split per country by largest remainder (`src/main.js:2213-2323`).
- **Allied cross-deployment**: on a multi-country side, sorted by land, each bigger ally sends `max(2, 20% of its units)` split across smaller allies, teleported to random cells of the smaller ally (`src/war-start.js:741-824`).
- `MAX_UNITS_PER_SIDE`: 2400 in `src/config.js:7`, but the UI **overwrites it** with the "unit limit" setting, default **250** (100/250/500/1000) (`index.html:36-41`, `src/main.js:6583`).

### 4.3 Manpower pool (`src/war-start.js:869-943`)
Per side:
```
deployed = sum of live formation personnel
popPool  = round(0.01 × sum of country populations)       # fallback: cells×200 + theaterCities×10000
auto     = deployed > 0 ? max(deployed, popPool + realForcePersonnel) : deployed
initialSideSoldiers = max(deployed, manualManpower ?? auto)
sideSoldiers = initialSideSoldiers
sideRecruitableManpower (reserve) = sideSoldiers − deployed
```
- `sideSoldiers` falls only by casualties (`src/simulation-world.js:774-777`); recruits move personnel from reserve to the field.
- Mid-war joiner adds 1% of its population (fallback cells×200 + cities×10000), plus real force personnel; personnel deployed beyond the pool is added to soldiers (`src/war-start.js:1091-1255`).
- The "Recruitment Model" setting (area/pop/gdp/balanced) **only changes the setup-screen troop estimate**, not the simulation (`src/main.js:4309-4348`; only callers are UI: `src/conflict-setup.js:122,185`, `src/main.js:6109`).

### 4.4 Mid-war recruitment (every tick, per country, `src/simulation-tick.js:1170-1330`)
Inputs: `U` = country's live land strength (Σ S), `L` = controlled own cells (census), `L0 = initialCells`, `K` = cities credited to the country, `capLost` = capital lost.
```
sizeFactor = max(1, L/2000);  density = sizeFactor^-0.35
landCap    = max(8, floor(L × 0.066 × 1.5 × density × (1 + 0.12K)))
flexLimit  = MAX_UNITS_PER_SIDE × (1 + min(3, L/4000 + 0.15K))
cap        = min(landCap, flexLimit)
if manualManpower(side): cap = max(cap, floor(manual/1000))
if buff == godly:        cap = max(cap, 3600)
if capLost:              cap = max(15, floor(0.3 × cap))
R = ceil(reserve / soldiersPerUnit)   # reserve in formation equivalents
if reserve <= 0: cap = 0  elif R > 0: cap = min(cap, U + R)

if U < cap:
  scale  = max(0.8, (L/2000)^0.4)
  p      = 0.012 × scale × (L/L0 + 0.5 + 0.5K)
  if simFrameCount < 1800: p *= 1 + 1.3 × (1 − simFrameCount/1800)   # EARLY_TICKS, EARLY_RECRUIT_MULT 2.3
  if godly: p *= 12
  if capLost: p *= 0.1; p *= min(1, 2 × sideSoldiers/initialSideSoldiers) (0 if ratio ≤ 0)
  p *= 1 + 3 × (1 − min(1, U/max(1,cap)))
  p = min(p, 0.8)
  if random() < p: spawnSingleUnit(side, country)
```
`spawnSingleUnit` (`src/simulation-world.js:519-669`):
- Personnel = `soldiersPerUnit[side]` (1000), ×0.4 if capital lost; needs `reserve ≥ personnel`, else no spawn.
- Hard side cap: raw formation count < `MAX_UNITS_PER_SIDE` (or up to `min(10000, manual/1000)` with manual manpower).
- Location: random own city (by `ownerId`) whose cell is controlled by the side; prefer cities with a 4-neighbour held by a hostile side unless capital lost; jitter ±0.04° (stay on own, side-controlled cell else snap to the city). No city → random war-zone cell owned by the country and held by its side (sampled every `len/500000` cells).
- Capital lost: health ×0.4, personnel ×0.4.
- Reserve −= personnel.

### 4.5 Replenishment (operational AI, `src/army-command.js:468-506`)
A formation that is recovering, arrived, ≥180 ticks since combat, ≥30 ticks since last top-up, on own-controlled cell, with no enemy power within 2° (r²=4) gains `min(capacity−current, max(1, floor(0.02×capacity)), floor(reserve))` personnel from the reserve; health is rescaled to the personnel share. It never creates manpower.

### 4.6 Legacy merge (`src/simulation-world.js:247-306`)
Every 30 ticks, if > 40 units: same-sovereign units within 0.14° pool health up to 500, but **only legacy units without a `personnel` field**. All units created by current code have `personnel`, so this is effectively inert.

---

## 5. Movement

### 5.1 Who moves how
Per unit, after combat scanning, one of these runs (`src/ground-unit.js:1432-1514`, `src/ground-movement.js:97-106`):
1. **Army order path** (normal land formations): if the unit has `_armyOrder` or `_taskForceOrder` with a target, is on land, not naval/supply/garrison-assigned, not in mop-up, and is not within 0.05° of a unit target → `executeArmyOrder` (5.3).
2. **Legacy path** (naval invasion, naval supply, transport, garrison, coastal defence, mop-up, units without orders): steering blend (5.4).
3. **Melee** when within 0.05° of an enemy unit target (6.2).
4. No target → `lastCombatTick = 0` and no movement (`src/ground-unit.js:1512-1514`).

### 5.2 Speed modifiers (`src/ground-unit.js:179-383`)
`speedBuffMult` starts at 1 and multiplies:
- victory boost ×1.3; capital lost ×0.9 and shock ×(1 − 0.15·shock) where `shock = 1 − (tick − fallTick)/360`.
- **Buff state replaces** the product so far: buff 1.3, super 1.8, godly 2.2, weakened 0.7, crippled 0.7.
- mountain ×(1 − 0.65m); Alpenjäger on mountain ×1.4.
- in enemy territory on a river cell ×0.6.
- Country posture `speedMult` (4.4 table, 11.2) multiplies later.

### 5.3 Army order movement (`src/army-navigation.js:453-497`)
```
speed = 0.003 × speedBuffMult × posture.speedMult × order.speed × (0.5 if encircled)
step  = min(speed, distanceToWaypoint, 0.4 × GRID_RES)
move along the navigator's direction; if the destination cell is not passable → status BLOCKED, no move
standing on a neutral cell: damage 0.06 × damageTakenMult
```
- Base `UNIT_SPEED = 0.003` °/tick (`src/config.js:49`) = 0.18 °/s at 1× = 0.09 ° per game day.
- Passable for side s: land, and controller (dominant side, else owner's side) is `s`, or hostile to `s` unless `friendlyOnly` (`src/army-navigation.js:32-48`). **Water and neutral land are never passable.**
- `friendlyOnly` applies to HOLD/RESERVE/WITHDRAW/SCREEN orders once the unit stands on own ground; their goal must be own ground (`src/army-navigation.js:12,261-266`).
- Arrived when within `order.arrivalRadius` or `min(0.05, 0.2·res)` (`src/army-navigation.js:281-286`).
- Route: direct line if within 12 cells and every step (0.4 cell, ≤32 steps) is passable; otherwise a shared **reverse Dijkstra field** seeded at the goal's 8×8-cell bucket (`src/army-navigation.js:310-419`).
- Edge cost of leaving a cell (`src/army-navigation.js:77-95`): `1 + min(6, 0.35 × hostile power in cell) + min(3, 0.08 × units in cell) + 2 × terrain + (3 if river and not held by own side)`. Power per unit = `health/maxHealth`, rebuilt every 30 ticks.
- 4-neighbour expansion order W, E, S, N; lng wrap (`src/army-navigation.js:159-186`).
- Budgets: 4096 heap pops per tick shared by active fields, ≤64 fields, ≤70 000 settled nodes per field, fields idle >60 ticks expire (`src/army-navigation.js:3-10,127-188`).
- Stall: 3 visits to the same cell among the last 12, or 180 ticks without getting 0.1 cell closer, and no combat in the last 30 ticks → replan (`src/army-navigation.js:287-309`).
- Statuses: ARRIVED, MOVING, BLOCKED, ROUTE_PENDING, UNREACHABLE, INVALID_DESTINATION. Non-MOVING statuses stop the unit (`src/army-navigation.js:469-473`). UNREACHABLE on MOVE/ASSAULT asks for side reassessment at most every 300 ticks (`src/ai-runtime.js:132-139`).

### 5.4 Legacy steering (`src/ground-movement.js:108-1471`)
```
base      = 0.025 at sea else 0.003                          # UNIT_NAVAL_SPEED
landBuff  = 1.8 if own-controlled cell with own influence > 0.5 else 1.2 (land only)
speedMult = landBuff × speedBuffMult × posture.speedMult
dir       = unit vector to target (+ jitter sin/cos(id·100)·0.08 unless target is a unit or the unit has an army order)
```
Then, in order, each step blends and renormalises `dir`:
1. Plan direction (naval/supply/transport/task-force/DEFEND/war-plan, see 10 and 11) with weight: task-force units 0.55 if engaged/enemies near else 0.96; others 0.3 if engaged/enemies near, else 0.85 (if posture `frontlineBlend > 0`) else 0.65 (`893-916`).
2. Pull toward local enemy centroid: weight 0.35 (plan unit) or 0.7 (`919-944`).
3. Frontline slot pull `min(0.6, 2×dist)` (`948-979`).
4. Frontline direction field blend `frontlineBlend` (`982-1005`).
5. "Overwhelming force" (one of 2 sides has ≥10× strength): non-plan units move straight along the frontline field (`1008-1012`, `src/simulation-tick.js:625-642`).
6. Retreat vector blend 0.4 in hostile land else 0.25 (`1015-1042`).
7. Cohesion to battle-group centroid +0.025/0.06 and alignment +0.1/0.25 of group mean direction (`1045-1074`). Groups = `floor(id·1000) mod 4` (`src/simulation-tick.js:689-721`).
8. Friendly repulsion (pairs within 0.45°) 0.25/0.4 (`1078-1100`, built at `src/simulation-tick.js:480-536`).
9. Neutral avoidance: look ahead 1.5/2/3°; if neutral or protected-support land ahead, sweep 24 angles each side up to ±180° for a clear corridor (mid and end points), then at 2× distance; failing that, a random direction ×0.4 and "blocked" (`1104-1311`).
```
moveDist = base × speedMult × planSpeedMult × neutralPenalty × retreatBoost × pushReadiness × 0.8
```
- `neutralPenalty`: 0.15 inside neutral/protected land (plus damage 0.12 × taken per tick); at sea near neutral coast 1.1 (plus damage 0.006 × taken) (`1315-1346`).
- `retreatBoost` 5.5 when retreating, ×0.25 if encircled (`1350-1351`).
- `pushReadiness` (non-plan land units outside own solid territory, not buffed, not retreating): surging country `4.2 × min(1.8, 2.5×victoryRatio) × (0.5..1.5 by id) × (1 − 0.5×warWeariness)` ×1.4 if victory boost; else `0.7 × (1 − warWeariness)`; not saturated → 0.3. `warWeariness = min(0.85, simFrameCount/15000)` (`1355-1375`).
- Coast block: a non-transport land unit whose step ends on water tries ±90, ±45, ±135, ±30° (needs ≥2 of 3 look samples on land); if still water halve the step; if none, stop. >60 stuck ticks drops the target (`1393-1458`).
- Clamp lat to ±89.9, wrap lng (`1467-1470`).

### 5.5 Water
- Ordinary army-order units cannot enter water (5.3). Crossing water needs a naval invasion / naval supply / transport plan (section 10). Units at sea: speed 0.025, attrition (6.5), exile disband (6.5).
- `isAtSea` = cell −1 or `landMask == 0` (`src/simulation-tick.js:651`).

---

## 6. Combat

### 6.1 Who fights whom (proximity combat)
Each unit scans enemy units of hostile sides in the 3×3 surrounding 2.5° hash buckets (5×5 if "tactically idle": 60–600 ticks since combat and no mop-up target) (`src/ground-unit.js:521-552,705-878`).
- **Every enemy within 0.3° (d² < 0.09) is hit, every tick, unless war grace is active** (`simFrameCount < warGraceEndTick`) (`src/ground-unit.js:790-792`).
- Because every unit runs this scan, a pair normally exchanges damage **twice per tick** (once in each unit's turn).
- Units are processed from the end of the array to the start, damage applies immediately (order-dependent).
- **Fast lane**: a unit with an army/task-force order target, not at sea, and `_tickHasNearbyHostile == false` **skips the scan entirely** (`src/ground-unit.js:529-539,565`). `_tickHasNearbyHostile` is only ever set for units in a task force (`src/simulation-tick.js:442,455`). So ordered formations outside task forces never start combat themselves; confirm with a test before porting.
- Stale-target cache: a unit can reuse last tick's nearest target and only hit that one, if it stayed in the same hash bucket, no refresh is due (every 3 ticks, or 6 when `simSpeed ≥ 3`), and the target is within 0.3° (0.8° at speed ≥ 3) (`src/ground-unit.js:564-696`, `src/config.js:73-77`).

### 6.2 Damage formulas
Let `D = COMBAT_DAMAGE = 0.7` (`src/config.js:57`), `S(x)` = strength multiplier of `x`, `line(x)` = defensive-line factor of `x` (6.4), `dealt(u)`, `taken(u)` = multipliers of the **acting** unit `u` (6.3).

**Proximity (the main combat), `src/ground-unit.js:793-833`**, for acting unit `u` and enemy `e` at distance `d < 0.3`:
```
p = D × 0.45 × dealt(u) × (1 − d/0.3)
if u at sea and e at sea: p *= 2.2
if e is transport and u is not: p *= 1.05
if u is transport and e is not: u takes p×1.05×taken(u); p *= 0.85
e takes  p × S(u) × line(e)
u takes  p × 0.8 × taken(u) × S(e) × line(u)
if e.health <= 0: u.victoryBoostTicks = 240
```
Note: `e`'s own `taken` and `dealt` multipliers are not used in `u`'s turn; they apply in `e`'s turn.

**Melee (target within 0.05°), `src/ground-movement.js:1472-1585`**:
```
def = 1 (land only):  ×0.65 if u stands on its de jure land
                      ×0.85 if u owns the cell and |occupation| < 0.2
                      ×0.45 if within 0.2° of an own theater city
longWar = 0.75 if simFrameCount > 6000 else 1
target takes  D × dealt(u) × 0.7 × S(u)
u takes       D × 0.8 × taken(u) × def × longWar × S(target)
knockback: target pushed away by base×1.2×min(1.5, 1.5×share_t), u pushed back by base×1.2×0.5×min(1, share_u), not onto water for land units
kill → victoryBoostTicks = 180
```
(`base` = 0.003 land / 0.025 sea; `share_t = tDmg/(tDmg+uDmg)`.) Melee ignores war grace and line defence.

**Frontline skirmish** (dead code: it needs negative influence, which never happens): `0.7×0.15×(1+2|c|)×taken` when control < −0.3 (`src/ground-unit.js:1168-1174`).

**Missiles** (section 10.3): `D×4 × max(0.2, 1 − d/0.5)` within 0.5°.

### 6.3 Damage multipliers of a unit (`src/ground-unit.js:179-346`)
Applied in this order; `=` means "replaces":
| Condition | dealt | taken | speed | Ref |
|---|---|---|---|---|
| victory boost (240 or 180 ticks after a kill) | ×1.4 | | ×1.3 | 184-188 |
| own capital lost | ×0.8 | ×1.15 | ×0.9 | 191-194 |
| capital shock (360 ticks, linear fade) | ×(1−0.4s) | ×(1+0.4s) | ×(1−0.15s) | 197-205 |
| side war phase COLLAPSING | ×0.7 | | | 209-212 |
| buff | **=2.5** | **=0.6** | **=1.3** | 227-230 |
| super | **=10** | **=0.2** | **=1.8** | 231-234 |
| godly | **=40** | **=0.015** | **=2.2** | 235-238 |
| weakened | **=0.7** | **=1.4** | **=0.7** | 239-242 |
| crippled | **=0.4** | **=2.5** | **=0.7** | 243-246 |
| attack slider `a%` (−90..+90) | ×(1+a/100) | | | 250-260 |
| defence slider `d%` | | ×1/(1+d/100) | | 254-262 |
| mountain intensity m | ×(1−0.4m) | ×(1−0.4m) | ×(1−0.65m) | 266-271 |
| Alpenjäger | ×1.12 | ×1/1.12 | ×1.4 on mountain | 274-280 |
| encircled (8-point test, 6.6) | ×0.25 / 0.2 (>60 t) / 0.15 (>180 t) | ×4 | ×0.5 (army path) | 340-346 |

### 6.4 Defensive lines (`src/ground-unit.js:6-10,369-383`)
Not in enemy territory and on land: `line = 0.6` on a river cell; on a mountain `line = min(line, 1 − 0.35m)`. Applied to damage the unit **receives in proximity combat** (via `formationDamage`, `src/simulation-world.js:362-371`). In enemy territory on a river: speed ×0.6, no line bonus.

### 6.5 Attrition (non-combat damage), per tick
- **Enemy territory or encircled** (not super/buff, and not during victory boost unless encircled) (`src/ground-unit.js:386-451`):
  ```
  enemyLand = Σ controlled cells of all countries on hostile sides
  logistics = max(1, log10(enemyLand/500 + 1))
  fatigue   = 1 + simFrameCount/8000
  dmg = 0.06 × (1 + 3|occupation at unit cell|) × logistics × fatigue
  if encircled: dmg *= 5 × (1, 1.5, 2.5, 4 for encircledTicks ≤60, >60, >180, >360)
  else if in enemy territory (supply check, 8.1): dmg += 2.5 / 0.8 / 0.3 / 0 for 0 / 1-2 / 3-7 / ≥8 friendly cells
  apply dmg × taken
  ```
- **At sea**: non-transport units take 0.18/tick; if the country controls 0 cells, 2% chance per tick to disband (personnel to reserve) (`src/ground-unit.js:283-296`).
- **Neutral land**: 0.12×taken (legacy path) or 0.06×taken (army path) per tick (`src/ground-movement.js:1321-1326`, `src/army-navigation.js:494-495`).
- **Sealed pocket**: see 8.3.

### 6.6 Encirclement test (per unit, `src/ground-unit.js:298-346`)
Sample 8 cells at radius `round(0.7/res)` cells (4 axis + 4 diagonal at 0.7×radius); count land cells controlled by a hostile side; `factor = count/8`; **encircled iff factor > 0.875, i.e. all 8**. Not for units at sea or buff/super countries (note: `godly`, `weakened` etc. are not exempt).

### 6.7 Retreat trigger (`src/ground-unit.js:1056-1069`)
`localEnemy > localAlly × retreatTriggerMultiple` and `localEnemy ≥ 5` → retreat vector away from the enemy centroid (legacy path only).
- `localEnemy` = Σ strength of enemies within 0.6° (×0.6 if both at sea, ×0.2 if enemy at sea and unit on land; ×200 super, ×50 buff) (`src/ground-unit.js:782-789`).
- `localAlly` = own strength + Σ ally weights within 0.6° (ally weight = strength ×200 super ×50 buff); naval/supply/coastal-assigned units do not count allies (`src/simulation-tick.js:394-398,487-498`).

---

## 7. Territory control

### 7.1 Two kinds of ownership
- **Political owner** `worldControlMap` changes only at capitulation, peace and separate peace (section 9).
- **Military control** `dominantSideMap` (+ `occupationMap`, `primaryOccupierMap`) changes continuously through influence.
- **De jure** `deJureMap` never changes in war; used for defence (6.2), capitulation recipients, releasables.
- Country census (every 200 ticks, committed atomically, `src/territory-ledger.js:739-787`, `src/territory-runtime.js:24-50`), counted only on war-zone cells:
  - `owned` = cells with `worldControlMap == country`
  - `controlled` = owned cells whose controller side is the owner's side
  - `frontline` = controlled cells with a 4-neighbour held by a hostile side
  - side `territory` = cells with `dominantSideMap == side`

### 7.2 Influence (`src/influence-runtime.js:316-599`)
Each tick:
```
base = 0.18 × min(1, 0.05 + 0.95 × tick/600)                 # INFLUENCE_RATE, 600-tick ramp
if exactly one of side 0 / side 1 has land strength: base *= 6
units processed: those with stableCohort(id,3) == tick mod 3, not deploying,
                 not in combat within 5 ticks, capped at floor(max(50, 300/optFactor)/3) (+1 for some cohorts)
start index rotates (tick×30) mod unitCount
```
Per processed unit `u`:
```
r = 0.4 (INFLUENCE_RADIUS); team = 1
mountain: r *= 1 − 0.65m; team *= 1 − 0.5m
buff replaces team: buff 2.5, super 8, godly 45 (and r *= 0.5), weakened 0.7, crippled 0.4
team *= 1 + attack%/100
victory boost: team *= 3, r *= 1.4
at sea: team *= 0.4
team *= S(u)
noise = 0.8 + 0.4 sin(id·1000 + tick·0.05)
delta = base × team × noise × 3
rVar  = r × (0.9 + 0.2 sin(id·500 + tick·0.1))
conc  = min(2.5, lastAllyCount/5)
for each war-zone cell within rVar (square bounding box, no wrap):
    skip if the owner is on a non-hostile foreign side
    skip if u is OFFENSE, owner is an enemy SUPPORT country, and |occupation| ≤ 0.1
    cd = delta × (0.35 if city cell)
    w  = (1 − dist/rVar)^2 × conc
    mine = min(1, mine + |cd| × w)
    credit: if the owner is not an ally and the current occupier is not on u's side:
            occupier = the ally country with ≥3 of the 8 neighbours (most), else u.beneficiary
            (written only if mine > 0.05 or no occupier yet)
    write mine
    every hostile side h with influence > 0 there: h = max(0, h − cd × 0.5)        # no distance weight
    if worldControlMap == u.sovereign: mine *= 1.5                                # after the cap → up to 1.5
    re-evaluate dominance (7.3); queue cell for diffusion
```

### 7.3 Dominance with hysteresis (`src/simulation-engine.js:37-83`)
`best` = side with the highest influence > 0. If the cell has no controller or `best` is already the controller → controller = best. Otherwise `best` must exceed the controller's influence by **0.15**. No positive influence anywhere → controller −1, occupation 0. `occupationMap = ±best value` (sign by side parity).

### 7.4 Diffusion (`src/influence-runtime.js:189-268`)
Queue of "frontier" cells (priority queue for controller changes, regular queue capped at 16 384, priority capped at 8192). Up to `max(400, 1600/optFactor)` cells per tick: for each active side `v = 0.75 v + 0.25 × mean(3×3)`; re-evaluate dominance; re-queue if still a frontier (4-neighbour controllers differ). Border rows/columns are skipped.

### 7.5 Clean-up passes
- **Occupier smoothing** (every 120 ticks, phase 83): 5000 random cells; if ≥5 of the 3×3 (including itself) belong to one allied country different from the current occupier, that country becomes occupier (`src/simulation-tick.js:197-266`).
- **Integrity** (every 200 ticks, phase 67): `max(1000, 5000/optFactor)` random war-zone cells. Enemy-occupied cell with ≥6 of 8 neighbours owned by the same owner → all side influences ×0.8. Own-held cell with ≥7 of 8 neighbours held by hostile sides → own influence ×0.75 (`src/simulation-tick.js:286-345`). `optFactor = max(1, activeSides/2)` (`src/simulation-world.js:20-25`).

### 7.6 Frontlines
- Front cell = war-zone cell whose 4-neighbour is held by a hostile side (`src/frontline-core.js:83-97`, `src/territory-ledger.js:714-737`).
- Polylines per side pair (key `"a_b"`) and unit front slots are rebuilt every ≥30 ticks (`src/simulation-core.js:311-342`, `src/frontline-core.js:200-504`). Used for sectors and legacy steering. Layout details (slot assignment) not specified further here.
- `isSaturated` (country): `units ≥ frontline count` → true; `< 0.6 × frontline` → false (hysteresis) (`src/simulation-tick.js:596-600`).

### 7.7 Occupation display
`src/occupation-regions.js`, `src/render-occupation.js` are presentation-only (outline/hatch inside `historicalSource.territoryOwnerIds`). Sovereignty overrides are applied at load (`src/scenario-territory.js:42`) and do not change during a war.

---

## 8. Supply and encirclement

### 8.1 Supply (per unit, in enemy territory and not encircled)
Count land cells held by the unit's side within a square of radius `round(0.8/res)` cells (stops counting at 8) (`src/ground-unit.js:18-38`). 0 → +2.5 attrition and `_supplyCollapsedTick = now`; 1–2 → +0.8; 3–7 → +0.3; ≥8 → none (`src/ground-unit.js:430-449`). There is no supply network, depot or city link; "supply" is purely local friendly-cell density. Capital loss acts as a "supply failure" for recruitment (4.4).

### 8.2 Local encirclement
8-point test, see 6.6 (combat and attrition penalties).

### 8.3 Sealed pockets (`src/encirclement-pockets.js:10-169`, every 30 ticks)
- Flood (4-neighbour) from each live unit's cell over war-zone cells held by the unit's side. A region is **sealed** iff every boundary neighbour is land of a hostile side (war-zone cell held by a hostile side, or non-war-zone land owned by a hostile side). Sea, neutral, allied, own home land, map edge, or a region >20 000 cells → open.
- Each pocket records `escape` (nearest own-held land outside, square-ring search ≤8°) and `edge` (pocket cell nearest to escape).
- Per unit inside a pocket of its side (not at sea, not buff/super): `pocketTicks++`; ≥300 → damage = full health (surrender); else damage `0.25 × (1 + pocketTicks/120)` per tick. Leaving resets the counter (`src/ground-unit.js:348-363`).
- AI: trapped units get ASSAULT to `escape` (speed 1.2, `POCKET_BREAKOUT`); up to `min(6, max(2, trapped))` healthy (≥50% health) non-task-force units within 6° get ASSAULT to `edge` (speed 1.1, `POCKET_RELIEF`) (`src/ai-runtime.js:33-116`).

---

## 9. Surrender, collapse, peace, war end

### 9.1 Country capitulation (`src/surrender.js:1-48`, `src/simulation-tick.js:1486-1523`)
Only on a tick where a fresh census was committed, only for sides with an active hostile side, countries checked from the end of the side list:
- `owned ≤ 0` → capitulate (`NO_OWNED_CELLS`)
- `controlPct = controlled/initialCells × 100` < **2** if the country has units, < **25** if it has none → capitulate.
- After one capitulation the tick ends immediately (`src/simulation-tick.js:1517-1520`).

### 9.2 Capitulation effects (`src/conflict-resolution.js:4-373`)
1. Recipients: hostile countries whose share of the victim's casualties (`casualtyByAttacker`) is ≥25%; if none, the top one (`src/surrender.js:50-72`). If no casualties: the hostile country physically holding most of the victim's de jure land; if none: owner of the nearest hostile unit to the victim's de jure centroid.
2. The victim's owned cells already occupied by a hostile country go to that occupier. The rest are split by largest-remainder quotas weighted by casualties (`src/surrender.js:74-108`); each cell goes to the qualifying attacker whose **owned-territory centroid** is nearest and still has quota.
3. `worldControlMap` and `primaryOccupierMap` set to recipients. Transferred cells owned by an active-side country become war zone with influence 1.0 for the new owner's side; otherwise war zone if still militarily held, else landMask 1.
4. The victim becomes a "releasable" of the primary annexer (most of the victim's de jure cells; ties by casualties, then id); its own releasables transfer too.
5. Victim's personnel share removed from the side's accounting (`src/conflict-personnel.js:28-87`); country removed from its side; **all its units deleted** (personnel not returned).
6. Provinces regenerated, frontline caches invalidated, AI reconciled.

### 9.3 Global end conditions
- Checked every tick while SIMULATING (`src/simulation-tick.js:1531-1541`, `src/surrender.js:129-139`): no active side → WHITE_PEACE; one active side → FULL_CAPITULATION won by it; no hostile pair among active sides → WHITE_PEACE.
- 2-side wars only: if sides are hostile, no capitulation in the last 600 ticks, both sides have units, and side 0 holds ≥ 99.9% of controlled war-zone territory → FULL_CAPITULATION for side 0; ≤ 0.1% → for side 1 (`src/simulation-tick.js:1567-1589`).
- No units at all → WHITE_PEACE (`src/simulation-tick.js:1654-1657`).

### 9.4 Peace offers (`src/simulation-tick.js:1590-1652`, `src/main.js:6170-6208`)
- Only when ≥360 ticks since the last offer (`TREATY_COOLDOWN_TICKS`) and no offer is showing, and peace treaties are enabled.
- `pressure(side)` = mean `peacePressure` of its countries (posture table 11.2: 0, 0.02, 0.36, 0.7).
- `chance = 0.001 × (1 + min(5, 5 × maxPositivePressure))` per tick. **If no country has positive pressure, `max()` of an empty list is −∞ and the chance is negative, so no offers happen** (decision 8).
- Proposer = random side index (must be non-empty); receiver = the **first** hostile non-empty side by index.
- `accept = clamp(max(0.1, 1 − receiverLandShare) + 0.25×recvPressure − 0.12×max(0, propPressure − recvPressure), 0.05, 0.95)`; the outcome is rolled immediately.
- The UI shows the offer; after **2000 ms + 1500 ms of wall-clock time** (not ticks; the war keeps running) an accepted offer applies PEACE_TREATY if ≤2 sides, else the proposer side signs a separate exit (`src/main.js:6184-6203`).

### 9.5 Treaty application (`src/conflict-resolution.js:375-577`)
- `gameState = WAR_OVER`; winner = side controlling most war-zone cells unless given.
- For every war-zone cell: if its controller side is hostile to the owner's side, the cell goes to the occupier (if on that side) else to the controller side's first country. **This happens for every treaty type, including WHITE_PEACE** (status quo of military control).
- FULL_CAPITULATION / ANNEXATION additionally give every cell owned by a side hostile to the winner to the winner-side occupier, else to the winner side's first country.
- All war-zone cells → landMask 1, influence cleared. Releasables follow the majority new owner of their old owner's de jure cells (`src/surrender.js:141-166`).
- 3 smoothing passes over former war-zone cells: a cell takes the owner holding ≥6 of its 3×3 (`src/conflict-resolution.js:511-570`).

### 9.6 Separate peace / exits (`src/conflict-diplomacy.js`)
- Side exit (`_signSelectiveSideExit`, 75-152): the exiting side's owned land held by an enemy goes to the occupier; land it holds of others **returns to the original owner** (line 105-108); its units are deleted; soldiers/reserve zeroed; <2 active sides → PEACE_TREATY.
- Country separate peace (`_signSelectivePeace`, 156-315): the withdrawing country loses its occupied land to the occupier (or the named opponent) but **keeps land it occupies** of others (line 203-207); 2 smoothing passes with threshold ≥5 restricted to involved countries.
- Unilateral exit (`unilateralExitConflict`, 4-73): cells it occupied stay its own only if its side still dominates them; its owned cells held by enemies go to the occupier.
- Note the three paths treat "land held of others" differently.

---

## 10. Naval, transport, missiles, other

### 10.1 Naval invasion (legacy plan, `src/ground-movement.js:175-337`, `src/ai-plan-execution.js:400-516`)
- Plan per side `_navalPlan[side]` with `stagingPoint`, `target`, `maxAssignedUnits`, `phase`.
- Recruitment: unit within 2° of staging, on own-held cell, not engaged/retreating/garrison, plan not full → `navalAssigned`, `isTransport = true`.
- Phases and plan speed multipliers: GATHERING ×2 (to staging) → EMBARKATION ×2 (to nearest water cell within 3 cells) → TRANSIT ×2.5 (straight to target with ±30/±60° land deflection) → LANDING ×1.5 (inland).
- Transitions: GATHERING→EMBARKATION when ≥ min(maxAssigned, 5) assigned units within √0.5° of staging or stalled; →TRANSIT when ≥60% of assigned units are at sea; →LANDING when ≥3 assigned units on land within √2° of the target; LANDING ends after 900 ticks without progress, units released and handed to a BEACHHEAD PUSH_FRONT task force (`src/ai-runtime.js:1092-1138`). Target captured → plan cleared. Stall: `NAVAL_STALL_TICKS = 600` (`src/simulation-state.js:190`).
- `NAVAL_LANDING_DEBUFF` and `NAVAL_LANDING_DEBUFF_TICKS` exist in config (`src/config.js:64-65`) but are **never used**.

### 10.2 Naval supply, transport, coastal, garrison (legacy)
- NAVAL_SUPPLY: recruit within 8° of staging; phases GATHERING/EMBARKATION/TRANSIT/DELIVERED with speeds 2/2/2.5/1.5 (`src/ground-movement.js:338-479`). It moves units; there is no supply resource.
- TRANSPORT: units far from the front (localEnemy < 2) are moved toward the plan target at ×6 speed until within 1.5° (`src/ground-movement.js:509-551`).
- COASTAL_DEFENSE / NEUTRAL_GARRISON plans (up to 10 slots per side): units within 8° / 16° take a slot point on the zone/border polyline at ×0.5 speed; coastal units chase a threat contact at ×1.5 for 900 ticks after it was seen (`src/ground-unit.js:897-1037`).
- Defender reaction: assigned units move ×2 to `_defenderReactTarget` until within 1° (`src/ground-movement.js:481-503,642-663`).

### 10.3 Missiles ("bombs") (`src/simulation-tick.js:1660-1773`, `src/simulation-world.js:691-708`)
- Bases (silos) at war start: `min(8, max(2, floor(sideCells/500)))` per side at random own cells, only if no calendar or year ≥ 1942 (`src/war-start.js:827-851`). Disabled by setting, missing feature flag, calendar year < 1942, or scenario names containing "1936", "1914", "ww1" etc. (`src/war-start.js:247-276`).
- Each tick with ≥2 active sides: 1% chance to launch: random launcher side, random hostile target side, random own base → random enemy unit.
- Flight: `progress += 0.0055 × (rising ? 1 : 1 + 2.5(progress − 0.5))`; arc height `sin(πt) × peakAlt` (peakAlt 1.5..4 random) affects only display lat.
- Impact (progress ≥ 1): every hostile unit within 0.5° (plain d², no wrap) takes `0.7 × 4 × max(0.2, 1 − d/0.5)`.

### 10.4 Air force
None. Equipment categories (tanks, aircraft, …) are loaded for display only (`src/country-force-profiles.js:3-13`); not used by the simulation.

### 10.5 Momentum ("victory boost", surges)
- A kill sets `victoryBoostTicks` to 240 (proximity) or 180 (melee) (6.2). While > 0: dealt ×1.4, speed ×1.3, influence ×3 radius ×1.4, no enemy-territory attrition (unless encircled).
- Side victory ratio = share of the side's units with an active boost. A country starts **surging** when ratio > 0.6 and it is saturated, stops when ratio < 0.35 or unsaturated (`src/simulation-tick.js:659-685`). Surging affects legacy `pushReadiness` only.

---

## 11. AI

### 11.1 Layers (all run inside the tick)
1. **Country posture** every 200 ticks (11.2).
2. **Side posture** every tick (11.3).
3. **Strategic planner** (legacy plans): PROPOSE → WEIGH (score) → DECIDE (select) → EXECUTE (plan slots + legacy steering) → REASSESS (`src/ai-plan-execution.js`, `src/ai-proposals.js`, `src/ai-planning.js`).
4. **Operational army command**: sectors, coverage, task forces, orders (`src/ai-runtime.js:1033+`, `src/army-command.js`, `src/ai-task-forces.js`, `src/army-navigation.js`, `src/army-encirclement.js`).
5. **Per-unit tactics** in the unit update (target choice, retreat, mop-up, city objectives).

### 11.2 Country posture (`src/simulation-tick.js:785-936`, constants `src/simulation-state.js:221-231`)
Per country: `controlRatio = controlled/initialCells`, `cityRatio = cities/initialCities` (initial cities captured the first time it runs), stall counter +200 if `|Δcontrolled| ≤ max(1, floor(0.002 × initial))` else −400 (≥0).
```
LAST_STAND            if controlRatio ≤ 0.22 or cityRatio ≤ 0.20
DEFENSIVE_DESPERATION elif controlRatio ≤ 0.40 or cityRatio ≤ 0.35
OFFENSIVE_DESPERATION elif role OFFENSE and simFrameCount ≥ 1200 and stall ≥ 900 and controlRatio > 0.45
UNDER_MOBILIZED       elif deployedPersonnel / initialManpower < 0.75
NORMAL                otherwise
```
`deployedPersonnel = units × 1000`; `initialManpower = max(deployed, 1% of pop or cells×200 + cities×10000)`, fixed the first time.

| mode | retreatTriggerMultiple | frontlineBlend | speedMult | targetCityWeight | forceDefensive | peacePressure |
|---|---|---|---|---|---|---|
| NORMAL | 8.0 | 0.35 | 1.00 | 0 | no | 0 |
| OFFENSIVE_DESPERATION | 10.0 | 0.45 | 1.08 | 0.45 | no | 0.02 |
| DEFENSIVE_DESPERATION | 5.8 | 0.40 | 0.96 | 0.18 | yes | 0.36 |
| LAST_STAND | 4.8 | 0.30 | 0.92 | 0.05 | yes | 0.70 |
| UNDER_MOBILIZED | 8.0 | 0.35 | 1.00 | 0 | no | 0 |

(The profile also has `recruitCapMult`, `recruitChanceMult`, `reserveShare`, which nothing reads.)
`targetCityWeight > 0` lets units without a direct enemy target pick an enemy city (score `−0.6 d² + 120 if contested + 260 if capital`, top 4 checked for >30% water on the line) and blend it into their target (`src/ground-unit.js:1350-1423`).

### 11.3 Side posture and war phase
- War phase (every 200 ticks, last 10 samples of side controlled cells): COLLAPSING if Δ/first < −5% or soldiers/initial < 0.1; RETREATING if < −0.5% or ≥2 drops in the last 3 samples; ADVANCING if > 0.5% or ≥2 rises; else STALEMATE (fewer than 3 samples → STALEMATE) (`src/simulation-tick.js:940-998`).
- Side posture (`src/simulation-tick.js:1005-1074`): DEFENSIVE if a defender reaction plan exists; then LAST_STAND country → DEFENSIVE, OFFENSIVE_DESPERATION → OFFENSIVE, else strength ratio vs. all hostile live power > 1.5 → OFFENSIVE, < 0.7 → DEFENSIVE; then soldiers/initial < 0.15 → DEFENSIVE. DEFENSIVE sets `forceDefensive`, caps `frontlineBlend ≤ 0.3k` and `speedMult ≤ 0.96k` with k = 0.6 / 0.8 / 1 for manpower ratio < 0.25 / < 0.5 / else. OFFENSIVE clears `forceDefensive`, `frontlineBlend ≥ 0.4`.
- Unit power for AI = strength × buff factor (buff 2.5, super 10, godly 40, weakened 0.7, crippled 0.4) (`src/ai-runtime.js:154-175`).

### 11.4 Strategic planner (legacy)
- Reassess a side (`src/ai-plan-execution.js:8-106`): forced flag (min gap 20 ticks); otherwise never within 150 ticks of the last one; first reassessment staggered `150 + (side mod 75)×2`; then every 300 ticks, or no plan, or controlled cells changed > 2%, or posture changed, or force ratio changed > 20%.
- Proposal generation is a resumable job, one side at a time, **2 work units per tick** (one bounded path search/flood/front/map pass each) (`src/ai-plan-execution.js:108-203`).
- Proposal types (`src/ai-proposals.js`): CAPTURE_CITY (442), ENCIRCLE (515, 564), PUSH_FRONT (650), DEFEND (698), NAVAL_INVASION (798), NAVAL_SUPPLY (844, 1142), COASTAL_DEFENSE (934), NEUTRAL_GARRISON (983), TRANSPORT (1319).
- Score (`src/ai-planning.js:442-633`), roughly: type value (capital city 30 / city 10, ENCIRCLE 45 + ≤15 pocket size + 15×enemy line share, PUSH_FRONT 15, DEFEND 10 (+15 if outmatched), NAVAL_SUPPLY 20, TRANSPORT 25 + 2/stranded ≤30 then ×1.2 and returned early) + front pressure terms + feasibility (`effRatio = 0.35 global + 0.65 local`: ≥2 → +20, ≥1 → +10, else −15; reaches target +10 else −30) + risk (≥4 → +20, ≥2.5 → +10, else −20; − ≤15 counter weight) × strategy multiplier (BLITZ off 1.4/def 0.4, AGGRESSIVE 1.3/0.5, BALANCED 1/1, DEFENSIVE 0.4/1.4, TURTLE 0/1.5 or 0.3 when ahead) × memory (failed 0.7, success 1.1, many failures 0.55) × `(1 − 0.4 × enemyLineShare)` for PUSH_FRONT and CAPTURE_CITY.
- Select (`src/ai-planning.js:635-860`): force split by strategy (BLITZ 85/10/5 offence/defence/reserve … TURTLE 0/90/10); land slot 1 = best offensive; land slot 2 = next best from another theater if ≥30% (same theater ≥60% and ≥85% and direction cosine ≤ 0.85); one naval, one supply, one DEFEND, all coastal with threat ≥ 0.1, all garrisons. Allocated force ≥3, capped at 75% of units.
- Encirclement proposals need local superiority 1.25 (`docs/army-ai.md`), double envelopment spans 3 and 4.5°, meeting point at 45% depth (`src/army-encirclement.js:190-192`).

### 11.5 Operational army command (`src/ai-runtime.js:1033-1859`, `src/army-command.js`)
- One side per tick, a side at most every 15 ticks; all sides when forced (`src/ai-runtime.js:1058-1078`).
- Sectors: frontline polyline cut every 2.5° (or at a >1° gap), ≤96 per side; identity reused if an old anchor is within 2.5°; hold point = nearest own-held cell within 10 cells; priority `1 + cityValue + 1.4 × enemyPower` (`src/army-command.js:39-176`). Each unit counts toward its nearest sector within 3° (friendly or enemy power).
- Defensive line: a sector holds a river/mountain line within 0.6°; if enemy power > 1.3 × friendly (or capital shock), it falls back to a line within 3°, and stays until the ratio < 0.9 (`src/army-command.js:150-174`).
- Coverage (`src/army-command.js:221-342`): units with health < 40% (or recovering and < 75%) rotate out (WITHDRAW, speed 1.4). Defence share 0.65 (TURTLE/DEFENSIVE), 0.3 (BLITZ/AGGRESSIVE), 0.4 otherwise; budget ≥ one per sector. Units go to sectors by nearest cost (`d² × 0.45` if already in that sector, +0.5 if in a task force). `requiredPower = max(armyPower × share × priority/Σpriority, 0.75 × enemyPower)`. Then 12% reserves; a reserve reinforces a sector whose deficit > half its power, else waits as theater reserve.
- Task forces (`src/ai-task-forces.js`): lifecycle ASSEMBLING → ATTACKING → CONSOLIDATING → COMPLETE; failures CULMINATED → WITHDRAWING → REGROUPING. Launch readiness 0.65/0.75/0.85 (AGGRESSIVE/BALANCED/DEFENSIVE), culmination at 55% power, stall 600 ticks, regroup to 70% power, withdrawal ≤ 900 ticks, consolidation 300 ticks, spearhead share 0.2 (pincer 0.45), support 0.1 (`src/ai-task-forces.js:1-25`). Doc-level timeouts: no progress 1200 ticks → withdraw; assembly 1800 ticks (pincer 900) (`docs/army-ai.md`).
- Operation success: target cell own-held, ≥80% of the route continuously own-held, ≥65% strength-weighted advance (`src/army-command.js:356-442`).
- Local rotation: a unit with cached local enemies > max(3, 3× allies) and health < 70% becomes recovering if enemy power within 2° > 2× friendly; recovery ends after 600 ticks (`src/ai-runtime.js:1218-1244`).
- Orders: `{type, target, owner, role, speed, reason}`, signature `owner:type:round(lat×10):round(lng×10)` (`src/army-command.js:444-464`).

### 11.6 Per-unit tactics
- Nearest enemy score `d² × (50 if enemy at sea and I am on land) − 0.02 × (1 − hp/100) + (5 if enemy is super/godly and I am not buffed)`, +10 000 if >30% of line samples (for d² > 4) are water or neutral (`src/ground-unit.js:733-780`).
- No enemy nearby but enemies exist → nearest enemy battle-group centroid with ±1° random scatter (`src/ground-unit.js:1081-1103`).
- **Mop-up** when no hostile units exist at all: units are spread over collapsed enemy countries (`units == 0`, `controlled > 0`, sorted by id, `unitIndex mod n`) and target the nearest cached cell of that country not held by them (64-cell hash cache per country), re-searched every 15–34 random ticks (`src/simulation-tick.js:725-748`, `src/mop-up.js`, `src/ground-unit.js:1256-1326`).
- Beneficiary: OFFENSE units have 0.02%/tick chance to switch to a random ally (unless own land < 30%), 12%/tick to reset to own country (`src/ground-unit.js:482-503`).

---

## 12. Determinism and randomness

- **RNG source: global `Math.random()`, unseeded.** "Seeded" runs in smoke tests replace `Math.random` (`scripts/ai-stall-budget-smoke.mjs:71`, `scripts/cli-profiler-smoke.mjs:86`). Only `distributeFormationPersonnel` accepts an explicit RNG (tie breaks) (`src/formation-strength.js:104-119`).
- Uses of `Math.random()` in the simulation path:
  - Unit ids: `id = Math.random()` (`src/simulation-world.js:638`, `src/army-formation.js:6`, `src/war-start.js:1205`). The id then drives battle group (`floor(id×1000) mod 4`), cohorts (`floor(id×2³¹−1) mod n`), target jitter `sin(id×100)`, spearhead factors `sin(id×777)`, influence noise `sin(id×1000+…)`, slot choice `abs(id×777) mod len`, encircle role `floor(abs(id×10⁶)) mod 3`. So ids are a hidden per-unit random personality.
  - Sampling: smoothing and integrity cell samples (`src/simulation-tick.js:201,296`).
  - Recruitment rolls and spawn location/jitter, Alpenjäger roll (`src/simulation-tick.js:1324`, `src/simulation-world.js:584-636`).
  - Beneficiary switches, global-fallback scatter, mop-up cooldown, neutral "desperation" direction, exile disband (`src/ground-unit.js:286,469-499,1093,1318`, `src/ground-movement.js:1281`).
  - Peace offers and acceptance (`src/simulation-tick.js:1616-1647`); missiles (`src/simulation-tick.js:1737-1756`, `src/simulation-world.js:693,706`).
  - War start: spawn choices, cross-deployment cells, base locations, generals (`src/war-start.js`).
- **Order dependence**:
  - Units update from the last array index to the first, damage applies immediately, dead units are removed only at their own turn or later (`src/simulation-tick.js:1471`, `src/ground-unit.js:133`).
  - Influence: rotating start index and cohort; per-cell writes are order dependent (cap at 1, hostile decay).
  - Capitulation checks countries from the end of each side and stops the tick at the first one.
  - Peace receiver = first hostile side by index.
  - Map/Set iteration follows insertion order (JS semantics); tie breaks mostly by id or index (e.g. `src/simulation-tick.js:247-251`, `src/army-command.js:180`).
- **Speed-dependent rules** (same seed, different speed → different result): stale-target cache interval and radius switch at `simSpeed ≥ 3` (`src/ground-unit.js:585-592`); strategic target refresh staggered when `simSpeed ≥ 3` and ≥800 units (`src/ground-unit.js:1236-1241`).
- **Wall-clock-dependent rules**: treaty acceptance applies after 3.5 s of real time (`src/main.js:6184-6203`); clock turn budget 8 ms decides how many ticks run per frame (does not change tick contents).
- Work budgets are counted in items, not time (`src/ai-plan-execution.js:108-111`, `src/simulation-state.js:49-52`), so they are deterministic.

---

## 13. Constants

| Name | Value | Meaning | Ref |
|---|---|---|---|
| GRID_RES | 0.1 | Cell size in degrees (UI: 0.25/0.15/0.1/0.05) | src/config.js:3 |
| INFLUENCE_RATE | 0.18 | Base influence per application | src/config.js:4 |
| INFLUENCE_RADIUS | 0.4 | Influence footprint radius (°) | src/config.js:5 |
| UNIT_SPAWN_COUNT | 180 | **Unused** | src/config.js:6 |
| MAX_UNITS_PER_SIDE | 2400 (UI default 250) | Formation cap per side | src/config.js:7, src/main.js:6583 |
| UNIT_DENSITY_FACTOR | 0.066 | Formations per cell for caps/spawn | src/config.js:8 |
| UNIT_SPEED | 0.003 | Land speed °/tick | src/config.js:49 |
| UNIT_NAVAL_SPEED | 0.025 | Sea speed °/tick | src/config.js:50 |
| UNIT_TO_SOLDIER_RATIO | 1000 | Personnel per standard formation | src/config.js:51 |
| UNIT_HEALTH | 100 | Health of a standard formation | src/config.js:52 |
| ALPEN_HEALTH_MULT | 1.25 | Alpenjäger health | src/config.js:54 |
| ALPEN_MTN_SPEED_MULT | 1.4 | Alpenjäger mountain speed | src/config.js:55 |
| ALPEN_COMBAT_MULT | 1.12 | Alpenjäger dealt ×, taken ÷ | src/config.js:56 |
| COMBAT_DAMAGE | 0.7 | Base combat damage | src/config.js:57 |
| ATTRITION_DAMAGE | 0.06 | Base attrition per tick | src/config.js:58 |
| REINFORCEMENT_RATE | 0.006 | **Unused** | src/config.js:59 |
| ENCIRCLEMENT_DAMAGE_MULT | 5.0 | Attrition × when encircled | src/config.js:60 |
| ENCIRCLEMENT_RADIUS | 0.7 | 8-point test radius (°) | src/config.js:61 |
| WAR_GRACE_TICKS | 600 | No proximity combat at war start | src/config.js:62 |
| NAVAL_INVASION_FORCE_FRAC / NAVAL_SUPPLY_FORCE_FRAC / NAVAL_SUPPLY_INTERVAL | 1.0 / 1.0 / 3600 | **Unused** | src/config.js:63,66,67 |
| NAVAL_LANDING_DEBUFF / _TICKS | 0.5 / 300 | **Unused** | src/config.js:64-65 |
| ENABLE_SIDE_HASH_COMBAT | true | **Unused** (comment only) | src/config.js:72 |
| STALE_TARGET_SCAN_INTERVAL (_FAST) | 3 (6) | Target cache refresh ticks (speed ≥ 3) | src/config.js:74,76 |
| STALE_TARGET_MAX_CACHE_DIST_SQ (_FAST) | 0.09 (0.64) | Target cache radius² | src/config.js:75,77 |
| MAX_SIDES | 8 | Side slots | src/simulation-state.js:25 |
| UNIT_HASH_CELL_SIZE | 2.5 | Spatial hash bucket (°) | src/simulation-state.js:60 |
| tactical grid cellSize | 0.6 | Tactical bucket (°) | src/simulation-state.js:62 |
| FRONTLINE_FIELD_UPDATE_INTERVAL | 150 | Direction field rebuild ticks | src/simulation-state.js:64 |
| FRONTLINE_POLY_UPDATE_INTERVAL | 30 | Polyline/slot rebuild ticks | src/simulation-state.js:66 |
| AI_MOBILIZATION.INITIAL_SPAWN_FRAC | 0.18 | Share of full army spawned at start | src/simulation-state.js:105 |
| AI_MOBILIZATION.INITIAL_SPAWN_MIN | 2 | Minimum start formations | src/simulation-state.js:106 |
| AI_MOBILIZATION.START_FROM_FRONT_CHANCE | 0.25 | Start spawn on front cell | src/simulation-state.js:107 |
| AI_MOBILIZATION.EARLY_TICKS / EARLY_RECRUIT_MULT | 1800 / 2.3 | Early recruitment boost | src/simulation-state.js:108-109 |
| simSpeed default | 3.0 (war starts at 1×) | Core default speed | src/simulation-state.js:118, src/war-start.js:242 |
| STRATEGIC_COHORT_COUNT | 4 | Target refresh cohorts | src/simulation-state.js:119 |
| CITY_OBJECTIVE_REFRESH_INTERVAL | 12 | City objective refresh ticks | src/simulation-state.js:120 |
| CITY_WATER_CHECK_LIMIT | 4 | City candidates checked for water | src/simulation-state.js:125 |
| CITY_CANDIDATE_CACHE_LIMIT | 32 | Enemy cities per side | src/simulation-state.js:215 |
| NAVAL_STALL_TICKS | 600 | Naval plan stall | src/simulation-state.js:190 |
| AI_DESPERATION.* | 1200, 900, 0.002, 0.4, 0.22, 0.35, 0.2, 0.001, 5.0 | Posture triggers and peace chance | src/simulation-state.js:221-231 |
| gameTimeDayDurationMs | 500 | Game day length (→ 30 ticks/day) | src/simulation-state.js:232 |
| INFLUENCE_FRONTIER_PRIORITY_LIMIT / BACKLOG_LIMIT | 8192 / 16384 | Diffusion queue caps | src/simulation-state.js:163-164 |
| job queue itemBudget / maxItemsPerJobTurn | 160000 / 80000 | Background job budgets | src/simulation-state.js:49-52 |
| HYSTERESIS | 0.15 | Margin to flip a cell's controller | src/simulation-engine.js:51 |
| maxPendingTicks (live) | 60 | Catch-up cap | src/simulation-clock.js:3 |
| maxTicksPerTurn / maxTurnMs | 6 / 8 ms | Ticks per clock turn | src/simulation-clock.js:12-13,34 |
| BASE_TICK_MS | 16.667 | Tick length at 1× | src/simulation-core.js:52 |
| SPEED_STEPS | 1,2,3,5,10 | Speed choices | src/main.js:6403 |
| TREATY_COOLDOWN_TICKS | 360 | Min ticks between peace offers | src/simulation-tick.js:7 |
| POCKET_SCAN_INTERVAL | 30 | Sealed pocket scan ticks | src/simulation-tick.js:8 |
| smoothing interval / samples | 120 / 5000 | Occupier smoothing | src/simulation-tick.js:197-198 |
| territory count interval | 200 | Census / posture cadence | src/simulation-tick.js:275 |
| integrity samples | max(1000, 5000/optF) | Enclave decay | src/simulation-tick.js:290-294 |
| overwhelming force ratio | 10× | Straight-to-front mode | src/simulation-tick.js:636 |
| recapture grace after capitulation | 600 | Blocks 99.9% capitulation | src/simulation-tick.js:1565 |
| base recruitment chance / cap | 0.012 / 0.8 | Per tick per country | src/simulation-tick.js:1268,1319 |
| missile launch chance | 0.01/tick | Random launch | src/simulation-tick.js:1737 |
| missile radius / damage | 0.5° / 2.8×max(0.2,1−d/0.5) | Impact | src/simulation-tick.js:1705-1717 |
| RIVER_LINE_DAMAGE_TAKEN | 0.6 | River defence factor | src/ground-unit.js:8 |
| MOUNTAIN_LINE_DEFENSE | 0.35 | Mountain defence at m=1 | src/ground-unit.js:9 |
| RIVER_CROSSING_SPEED | 0.6 | Speed crossing into enemy river cell | src/ground-unit.js:10 |
| POCKET_ATTRITION / RAMP / SURRENDER | 0.25 / 120 / 300 | Sealed pocket rules | src/ground-unit.js:13-15 |
| supply radius | round(0.8/res) cells | Supply count square | src/ground-unit.js:20 |
| tactical radius | 0.6° | Local force count | src/ground-unit.js:514 |
| proximity combat radius | 0.3° (d² 0.09) | Contact distance | src/ground-unit.js:790 |
| victory boost | 240 (prox.) / 180 (melee) ticks | Momentum | src/ground-unit.js:836, src/ground-movement.js:1583 |
| melee distance | 0.05° | Melee branch | src/ground-movement.js:103,108 |
| long war defence | t > 6000 → 0.75 | Melee damage taken | src/ground-movement.js:1511 |
| war weariness | min(0.85, t/15000) | Legacy push readiness | src/ground-movement.js:1357 |
| legacy speed factor | 0.8 | "Reduced movement speed" | src/ground-movement.js:1384 |
| ARMY_NAVIGATION | NODE_BUDGET 4096, MAX_FIELDS 64, MAX_FIELD_NODES 70000, FIELD_IDLE_TICKS 60, STALL_TICKS 180, RIVER_CROSSING_COST 3 | Navigation bounds | src/army-navigation.js:3-10 |
| ARMY_COMMAND | SECTOR_LENGTH 2.5, MAX_SECTORS 96, DEFENSE_SHARE 0.4, RESERVE_SHARE 0.12, ROTATE_AT 0.4, RECOVER_AT 0.75, LINE_HOLD_DEG 0.6, LINE_FALLBACK_DEG 3, FALLBACK_RATIO 1.3, FALLBACK_KEEP_RATIO 0.9 | Army command | src/army-command.js:5-21 |
| AI_TASK_FORCE_DEFAULTS | see 11.5 | Task forces | src/ai-task-forces.js:1-25 |
| LINE_MOUNTAIN_MIN | 0.25 | Mountain line threshold | src/defensive-lines.js:5 |
| CAPITAL_SHOCK_TICKS | 360 | Capital fall shock | src/defensive-lines.js:7 |
| MAX_POCKET_CELLS / ESCAPE_SEARCH_DEG | 20000 / 8 | Pocket scan | src/encirclement-pockets.js:6-8 |
| POCKET_RELIEF_UNITS / RANGE | 6 / 6° | Relief force | src/ai-runtime.js:34-35 |
| REASSESS_INTERVAL / HARD_COOLDOWN / FORCED_COOLDOWN | 300 / 150 / 20 | Planner cadence | src/ai-plan-execution.js:9-11 |
| PROPOSAL_WORK_PER_TICK | 2 | Proposal job budget | src/ai-plan-execution.js:111 |
| CAPITULATION_THRESHOLDS | DEFENDED 2%, UNITLESS 25% | Country capitulation | src/surrender.js:1-4 |
| casualty share for recipients | 0.25 | Capitulation recipients | src/surrender.js:50 |
| FORMATION_STRENGTH_DEFAULTS | 1000 / 250000 / 5000 / 1..800 / 100 | Compaction budget | src/formation-strength.js:7-14 |
| MIN_REAL_FORMATION_PERSONNEL | 250 | Floor with real force data | src/war-start.js:13 |
| manpower pool | 1% of population (fallback 200/cell + 10000/city) | Reserve source | src/war-start.js:915-921 |
| missile bases | min(8, max(2, cells/500)) | Per side | src/war-start.js:834-837 |
| MOP_UP_CELL_CACHE_LIMIT | 64 | Cached cells per country | src/mop-up.js:1 |

---

