# Ukraine 2023 experimental scenario

## Source and attribution

Visual reference: **[DeepStateMap.live](https://deepstatemap.live/)**, with the
public calendar set to **2023-01-01**. Captured on 2026-10-28. This is an
independent game adaptation, not an official DeepState product or API export.

- `deepstate-2023-01-01.png` records the selected date, map and source branding.
- `deepstate-visual.json` copies the territory contours displayed by the public
  page as SVG, with their screen transform, viewport and center/zoom. No API
  credentials, private endpoints or hidden map data were used.
- [DeepState's license, section 3](https://deepstatemap.live/license.html) permits
  attributed use of visual material. Preserve the source credit with these
  materials and derived scenarios. The screenshot also contains the original
  MapTiler/OpenStreetMap attribution.

## Reproduction

Run from the repository root:

```sh
node scripts/build-ukraine-scenario.mjs
MW_HEAVY_SMOKES=1 node scripts/ukraine-scenario-smoke.mjs
```

The generator needs several GB of memory. Without `MW_HEAVY_SMOKES=1` the smoke only checks the committed package, which is what `npm run smoke` does.

The generator converts the displayed absolute SVG paths through Web Mercator
screen coordinates, applies their even-odd fill, and samples them at the centers
of the existing 0.1-degree game cells. The brown and purple occupied-territory
fills determine Russian control; grey disputed cells are assigned to Ukraine
because the game has no disputed-control state. Disconnected Ukrainian boundary
slivers of at most eight cells adjacent to Russian control are merged into that
control, except explicitly disputed cells. This removes artifacts from mismatched
SVG and Natural Earth outlines, including small coastal fragments in Crimea.
These are explicit approximations, not claims about exact historical boundaries.

The output is `assets/maps/compiled/ukraine-2023-v3.mwsc.gz`. It is also rebuilt
by `scripts/build-scenario-binaries.mjs`. Update its content revision in
`COMPILED_SCENARIO_URLS` when changing the source. No duplicate 31 MB world JSON
is needed. The generator is offline and does not depend on DeepState availability.

## Scope and limitations

- Start date: 2023-01-01. Only territorial control in Ukraine is adapted; other
  Eurasian countries retain the base 2022 world setup.
- The default grid is roughly 11 km north-to-south. Screen rounding, map
  simplification, coarse coastlines and grey-zone treatment reduce accuracy.
  A more detailed setting cannot recover details absent from this source.
- Ukraine's sovereign territory remains separate from Russian military control,
  including Crimea and occupied Donbas. The bundled Natural Earth Crimea
  polygon is reassigned to Ukrainian sovereignty explicitly. The two old proxy
  country entries are removed and their cities are no longer separate capitals.
- Army locations, strength, equipment, economics and subsequent events are
  game-generated, not a reconstruction of actual armed forces.
- Select Ukraine and Russia during setup; no war starts automatically.
- The playable theater contains Europe and Asia. Actors, territory and cities in
  the Americas, Africa and Oceania are excluded. Country identifiers remain
  stable; overseas territory outside the geographic frame is also excluded.
- The geographic frame is 25°W–180°E and 12°S–85°N. This includes Southeast Asian
  islands but omits Russian territory across the antimeridian. Camera limits,
  rendered land, region overlays and exported saves retain this scope.
- The scenario still allocates full-world grids with global cell indices. This
  is a playable geographic restriction, not a regional-grid memory optimization
  or a simulation resolution increase.
- Historical military-control snapshots for 2024, 2025 and 2026 are not included.
  The separate Modern World 2026 scenario is a political baseline, not a later
  snapshot of this war.

## Occupation display

Amber hatching and a dashed outline mark Ukrainian sovereign territory currently
controlled by another country. Labels identify the sovereign country and the
controller; they follow the interface language and the Show Country Labels
setting. During play, the overlay follows effective control and disappears from
liberated cells. Allied liberation is not marked as hostile occupation. This
shows the game state after the historical start, not a live real-world feed.
The overlay is scoped by `historicalSource.territoryOwnerIds`, caches territory
geometry, and samples the scoped cells at most four times per second.

## Browser verification note

The scenario loaded and a Ukraine/Russia conflict advanced its calendar in the
headless Chrome smoke on 2026-10-28. The full-world simulation worker exceeded
its existing five-second initialization timeout in two runs, so the game used
its local simulation fallback. Worker startup and background-tab performance
for this scenario remain unverified on real devices. This prototype does not
claim to resolve that existing startup limit. (These observations come from the
Bald1nh0/moder-wars fork and were not repeated after the port.)

## Port credit

Prepared by viacheslav.puzanov in the [Bald1nh0/moder-wars](https://github.com/Bald1nh0/moder-wars) fork (commit `084c595`) and ported to this repository. The source data credits above still apply.
