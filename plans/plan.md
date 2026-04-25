Now I have a thorough understanding of the entire codebase. Here is the comprehensive implementation plan:
---
Implementation Plan: N-Sided Combat Engine
Scope Summary
The codebase has ~200+ bipolar coupling points across main.js (17,405 lines), index.html, and style.css. The fundamental problem is that everything derives from a single bipolar axis encoded as sideIndex % 2 → pole A (+1) or B (-1). The refactor replaces this with true N-sided identity where each side index (0..7) is a distinct faction.
---
Phase 1: Data Model & Variable Refactor (Foundation)
1.1 Replace scalar side variables with arrays
Current → Target:
teamAColor / teamBColor           → sideColors[0..7]
teamASoldiers / teamBSoldiers     → sideSoldiers[0..7]
initialTeamASoldiers / ...        → initialSideSoldiers[0..7]
soldiersPerUnitA / soldiersPerUnitB → soldiersPerUnit[0..7]
sideACasualties / sideBCasualties → sideCasualties[0..7]
manualSideAManpower / ...         → manualSideManpower[0..7]
teamAId                           → sideTeamIds[0..7]
buffedTeam ('A'/'B')              → buffedSideIdx (integer or null)
1.2 Replace team string with sideIndex integer on units
- Unit objects: team: 'A' → sideIndex: 0 (integer)
- All u.team === 'A' checks → u.sideIndex === N or isAlly(u.sideIndex, otherSideIndex) helper
- ~40+ occurrences in rendering, combat, movement
1.3 Define ally/enemy helper functions
function isAlly(sideA, sideB) {
    if (ffaMode) return sideA === sideB;
    return sideA === sideB; // For now; alliance groups can be added later
}
function isEnemy(sideA, sideB) {
    if (sideA === sideB) return false;
    return !isAlly(sideA, sideB);
}
This replaces ALL idx % 2 !== sideIndex % 2 patterns (52 occurrences).
1.4 Default side colors (up to 8)
const DEFAULT_SIDE_COLORS = [
    'rgba(255, 50, 50, 0.5)',   // 0: Red (Side A)
    'rgba(50, 100, 255, 0.5)',  // 1: Blue (Side B)
    'rgba(255, 200, 0, 0.5)',   // 2: Yellow (Side C)
    'rgba(0, 200, 100, 0.5)',   // 3: Green
    'rgba(180, 50, 220, 0.5)',  // 4: Purple
    'rgba(255, 130, 0, 0.5)',   // 5: Orange
    'rgba(0, 210, 210, 0.5)',   // 6: Cyan
    'rgba(200, 200, 200, 0.5)', // 7: Silver
];
---
Phase 2: Map & Influence System Refactor (The Hard Part)
This is the highest-risk phase. The occupationMap currently uses a single Float32Array with values in -1, +1. For N sides, we need a different approach.
2.1 Replace occupationMap with sideInfluenceMaps
Current:
occupationMap = new Float32Array(gridWidth * gridHeight); // +1 = A, -1 = B
Target:
let sideInfluenceMaps = []; // Array of Float32Array, one per active side
// Each maps holds 0.0..1.0 influence for that side in each cell
Allocation (at war start):
const numSides = sides.filter(s => s.length > 0).length;
sideInfluenceMaps = [];
for (let i = 0; i < sides.length; i++) {
    sideInfluenceMaps[i] = new Float32Array(gridWidth * gridHeight).fill(0);
}
// Initialize: cells owned by side N get sideInfluenceMaps[N][idx] = 1.0
2.2 Add helper to determine cell owner
function getCellOwner(idx) {
    // Returns { sideIndex, influence } for the dominant side at this cell
    let bestSide = -1, bestVal = 0;
    for (let s = 0; s < sideInfluenceMaps.length; s++) {
        if (sideInfluenceMaps[s][idx] > bestVal) {
            bestVal = sideInfluenceMaps[s][idx];
            bestSide = s;
        }
    }
    return { sideIndex: bestSide, influence: bestVal };
}
2.3 Replace all occupationMap read/write sites
The ~50+ read sites that currently check > 0 (Team A) or < 0 (Team B) need to use getCellOwner() or direct sideInfluenceMaps[sideIdx][idx] access.
The ~10 write sites that set +1/-1 need to set sideInfluenceMaps[sideIdx][idx] = 1.0 and zero out other sides.
2.4 Update influence spreading
Current:
let newVal = occupationMap[idx] + delta;
if (newVal > 1) newVal = 1;
if (newVal < -1) newVal = -1;
Target:
sideInfluenceMaps[u.sideIndex][idx] = Math.min(1, sideInfluenceMaps[u.sideIndex][idx] + delta);
// Optionally: decay opposing sides slightly at the same cell
for (let s = 0; s < sideInfluenceMaps.length; s++) {
    if (s !== u.sideIndex) {
        sideInfluenceMaps[s][idx] = Math.max(0, sideInfluenceMaps[s][idx] - delta * 0.3);
    }
}
2.5 Update blur/smoothing
The blur pass (line 4756) needs to blur each side's map independently.
2.6 Performance consideration
With 8 sides, we'd have 8 Float32Arrays of size gridWidth * gridHeight. At standard resolution this is ~360k cells × 4 bytes × 8 = ~11.5 MB. This is acceptable. The getCellOwner() scan over 8 values per cell is a concern for the render loop (called per-frame per-cell). We can optimize by maintaining a cached dominantSideMap (Int8Array) that's updated during simulation ticks, not during rendering.
let dominantSideMap = new Int8Array(gridWidth * gridHeight); // -1 = none, 0..7 = side index
---
Phase 3: Unit System Refactor
3.1 Unit spawning
- spawnSingleUnit(sideIdx, countryId, team) → spawnSingleUnit(sideIdx, countryId)
- Remove team parameter entirely; use sideIndex directly on unit
- All units get sideIndex instead of team: 'A'/'B'
3.2 Unit movement/pathfinding
All movement decisions currently compare u.team === 'A' against occupationMap polarity. Replace with:
- "Is this cell owned by an enemy?" → getCellOwner(idx).sideIndex !== u.sideIndex && getCellOwner(idx).sideIndex !== -1
- "Is this my territory?" → getCellOwner(idx).sideIndex === u.sideIndex
- "Find nearest enemy territory" → scan for cells where dominant side != my side
3.3 Retreat logic
Current retreat picks the cell with highest (Team A) or lowest (Team B) occupation value. Replace with: pick the cell where sideInfluenceMaps[u.sideIndex][idx] is highest (safest for our side).
3.4 Combat/damage recording
Current:
if (targetUnit.team === 'A') teamASoldiers -= loss;
else teamBSoldiers -= loss;
Target:
sideSoldiers[targetUnit.sideIndex] = Math.max(0, sideSoldiers[targetUnit.sideIndex] - loss);
---
Phase 4: UI Generation (Dynamic Panels)
4.1 Unhide buttons (main.js lines 1119-1121)
Remove the display: 'none' forcing:
// DELETE these lines:
if (addSideBtn) addSideBtn.style.display = 'none';
if (ffaToggleBtn) ffaToggleBtn.style.display = 'none';
4.2 Replace hardcoded manpower inputs in index.html
Current: Two hardcoded inputs manpower-side-a and manpower-side-b in the setup options.
Target: Replace with a dynamic container <div id="manpower-inputs-container"> that gets populated by updateSidesUI() with one input per side.
4.3 Replace hardcoded casualty panel in index.html
Current (lines 643-647):
<div id="casualty-list-a" class="casualty-side-list"></div>
<div id="casualty-list-b" class="casualty-side-list"></div>
Target:
<div id="casualty-lists-container"></div>
JS populates this with one .casualty-side-list div per active side.
4.4 Replace hardcoded stats panel in index.html
Current (lines 662-700): Two hardcoded team-a-block and team-b-block divs with p1-name, p2-name, p1-soldiers-ui, p2-soldiers-ui, etc.
Target:
<div id="stats-grid-container" class="stats-grid"></div>
<div id="tug-of-war-container" class="tug-of-war"></div>
JS dynamically generates side-stat blocks. For the "tug of war" progress bar with N sides, we can use a segmented bar where each side gets a proportional slice.
4.5 Replace hardcoded unit count display
Current (line 493-495):
<span id="p1-units" class="team-a">0</span> vs <span id="p2-units" class="team-b">0</span>
Target: Dynamic <span id="unit-counts-display"></span> populated by JS with all active sides.
4.6 Replace VS header in setup panel
Current has hardcoded "Side A" vs "Side B" labels. Update updateSidesUI() to render dynamically based on sides.length.
4.7 Update side-header CSS for N colors
Current CSS (style.css lines 435-436) only has rules for even/odd:
.side-header[data-side="0"], ... { color: rgba(255, 71, 87, 0.6); }
.side-header[data-side="1"], ... { color: rgba(46, 134, 222, 0.6); }
Add rules for sides 2-7 using the new color palette.
---
Phase 5: War Start & End Logic
5.1 startWar() refactor
- Remove sidePoleIndices = { 'A': [], 'B': [] } (line 6642)
- Remove attackers/defenders aliases (line 6512-6513)
- Initialize sideInfluenceMaps[] instead of bipolar occupationMap
- Initialize sideSoldiers[], sideCasualties[], sideColors[] arrays
- Unit spawning uses sideIndex directly
5.2 Victory conditions
Current: War ends when p1LandScore >= 99.9 or <= 0.1 (one side controls nearly everything).
Target: War ends when only one side has remaining territory/units. Track activeSides (sides with territory > threshold). When activeSides.length === 1, that side wins. When activeSides.length === 0, it's a draw.
5.3 capitulateCountry() refactor
Current (line 10052): Hardcodes opposingPoleIdx = sideIndex % 2 === 0 ? 1 : 0.
Target: Find the side that conquered the most territory of the capitulating country (via dominantSideMap or primaryOccupierMap analysis).
5.4 Treaty system refactor
Current treaty logic (lines 10200-10350) transfers land between "Team A winner" and "Team B loser". Needs to handle pairwise transfers between any two sides, or multi-way partitions.
---
Phase 6: Rendering Refactor
6.1 Territory color rendering
Current (line 2401-2409): Uses occ > 0 to determine Team A occupation and applies red/blue colors.
Target: Use dominantSideMap[idx] to look up the side index, then apply sideColors[sideIdx] or DEFAULT_SIDE_COLORS[sideIdx].
6.2 sovereignPoleMap replacement
Current (lines 2003-2008): Maps country ID → pole (1/-1).
Target: sovereignSideMap that maps country ID → sideIndex (integer). Used for determining if territory is "occupied by enemy" vs "liberated by ally."
6.3 Unit rendering
All hardcoded '#ff4757' / '#2e86de' colors for units, bombs, arrows, etc. → replaced with sideColors[u.sideIndex] or DEFAULT_SIDE_COLORS[u.sideIndex].
6.4 City markers
Current: .occupied-a and .occupied-b CSS classes. Add .occupied-2 through .occupied-7 with corresponding colors.
---
Phase 7: FFA Mode Enhancement
7.1 FFA toggle button handler
Already partially implemented. When toggled ON, each country becomes its own side. When toggled OFF, countries are re-grouped (currently by i % 2, should allow user reassignment).
7.2 Enemy determination
Already has ffaMode ternaries (e.g., line 8451):
const enemySideIndices = sides.map((_, idx) => idx).filter(idx => ffaMode ? idx !== sideIndex : idx % 2 !== sideIndex % 2);
Simplify to:
const enemySideIndices = sides.map((_, idx) => idx).filter(idx => idx !== sideIndex);
Since in the new system, every other side is always an enemy (alliances can be added later).
---
Phase 8: Reset/Cleanup Functions
8.1 resetGame() / resetConflictSetupState()
Currently hardcodes sides = [[], []]. Change to sides = [[], []] as default but preserve N sides if configured.
8.2 Quick restart
Must re-initialize all N side arrays (sideSoldiers, sideCasualties, sideInfluenceMaps, etc.).
---
Implementation Order & Risk Assessment
Phase	Risk
1	Low
2	High
3	High
4	Medium
5	High
6	Medium
7	Low
8	Low
Total estimated changes: ~800 LOC across ~200+ sites.
Recommended Implementation Strategy
1. Phase 1 first - Pure mechanical find-replace of variables. Low risk, high value. Can be verified by checking that the app still works identically for the 2-sided case.
2. Phase 2 + 3 together - The map refactor and unit refactor are deeply intertwined; must be done atomically.
3. Phase 4 - UI changes are independent of engine changes.
4. Phase 5 + 6 - War logic and rendering depend on Phases 1-3.
5. Phase 7 + 8 - Polish.
Key Risk: Performance
The biggest concern is the getCellOwner() scan in the render loop. With ~360k cells and 8 sides, this is 2.88M comparisons per frame. Mitigation: maintain a dominantSideMap (Int8Array) that's computed once per simulation tick, not per frame. The render loop reads dominantSideMap[idx] directly (O(1) per cell).
Open Question for You
