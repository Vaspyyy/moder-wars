# Public aggregate force reference data

Ported from [Bald1nh0/moder-wars](https://github.com/Bald1nh0/moder-wars)
(commit `c4caebe`). In this game, `src/war-start.js` uses the active personnel
observation to size each country's starting formations; the population-based
pool (1% of population) stays as the recruitable reserve. Countries without an
observation keep the default formation strength.

These files distinguish **dated source observations** from **fictional game
balancing**. They do not contain live deployments, unit locations, targeting
data, or a complete current inventory. Unknown means `null`, never zero.

## World Bank snapshot

- Retrieved: **2026-10-28**. API dataset update: **2026-10-08**.
- 217 country/economy identities; 170 have a non-null personnel observation in
  the imported 2018–2020 window. Aggregate regions are excluded.
- Personnel: [`MS.MIL.TOTL.P1`](https://databank.worldbank.org/metadataglossary/world-development-indicators/series/MS.MIL.TOTL.P1),
  IISS observations distributed by the World Bank. The indicator includes active
  military and eligible active paramilitary personnel, **not reserves**. Its
  published reference period ends in **2020**; it is not a 2026 armed-forces count.
- Population: [`SP.POP.TOTL`](https://data.worldbank.org/indicator/SP.POP.TOTL),
  imported observation years 2018–2025.
- GDP: [`NY.GDP.MKTP.CD`](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD),
  imported observation years 2018–2025, current US dollars. GDP is neither a
  defense budget nor game currency. Population is not recruitable manpower.
- License: **CC BY 4.0**, with attribution to the World Bank and the original
  indicator producer. [World Bank licenses](https://datacatalog.worldbank.org/public-licenses#cc-by).

`world-bank.json.gz` preserves the four API responses, endpoint URLs and retrieval
date. SHA-256:
`3a2ba86db0c007e822366e23472d19a3fb08dbd57d95bb911d5eba402ec7b821`.
`src/country-force-data.js` is generated from that snapshot. Runtime code never
contacts an external API. Observations are selected by year-end date at or before
the scenario start. Later revisions of historical observations can appear in the
2026 snapshot: this is **not** a reconstruction of what was publicly known on the
historical scenario date. Unsupported older years remain unknown.

## UK equipment example

[UK MOD equipment and formations 2026](https://www.gov.uk/government/statistics/uk-armed-forces-equipment-and-formations-2026/uk-armed-forces-equipment-and-formations-2026),
published **2026-08-20**, observation **2026-04-01**, © Crown copyright 2026,
[Open Government Licence 3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Four national totals are included: artillery platforms 219, fixed-wing platforms
507, reported UAS 189, and armoured fighting vehicles 1,024.

Definitions matter: fixed-wing platforms include non-combat aircraft; armoured
fighting vehicles are not exclusively tanks; UAS covers the source's Certified/S2
categories rather than every small drone. Holdings do not imply readiness.
These observations are excluded from the 2023 scenario. Other equipment fields
remain unknown; the campaign's starting stocks are explicitly fictional.

## Relationships

Administrative relationships are distinct from alliances, occupation and the
scenario's `overlordId` game-vassal setting. The initial narrow reference set is:

- Greenland and the Faroe Islands: self-governing parts of the Danish Realm,
  supported by the [Danish Prime Minister's Office](https://english.stm.dk/the-prime-ministers-office/the-unity-of-the-realm)
  and its [Faroe Islands constitutional explanation](https://english.stm.dk/the-prime-ministers-office/the-unity-of-the-realm/faroe-islands/).
- Bermuda, Gibraltar and the Falkland Islands: UK Overseas Territories in the
  [Cabinet Office administrative list](https://www.gov.uk/government/publications/the-central-government-s-concept-of-operations/the-amber-book-appendices-html).
  This describes administration and does not resolve sovereignty disputes. The
  UK list is dated conservatively to its 2025 publication and is not applied to
  earlier scenarios. Relationships were checked on 2026-10-28.

These are typed administrative facts, not a purported list of political puppets.
Legal annotations never rewrite game diplomacy. Imported annotations are
scenario-provided metadata and must not be treated as independently verified.

## Reproduce or refresh

```sh
# Rebuild without any network requests.
node scripts/import-force-profiles.mjs

# Verify that the generated module matches the pinned snapshot.
node scripts/import-force-profiles.mjs --check

# Explicitly refresh the public API snapshot, then review dates, coverage and hash.
node scripts/import-force-profiles.mjs --refresh

node scripts/campaign-data-smoke.mjs
```

The refresh is a maintenance operation, never part of normal builds. Review the
diff, update the digest above, and retain dates, definitions and license metadata
when replacing source data. No additional npm package or API credential is needed.

## Event semantics and limits

The simulation owner keeps at most 200 events with increasing IDs and logical
ticks. City control uses `primaryOccupierMap` with `worldControlMap` fallback.
Initial observations establish a silent baseline. A capitulation requires both
departure from an active side and a new `releasableBy` recipient; an existing
inactive territory alone does not produce a capitulation event.

City polling checks at most 2,048 cities every 60 ticks. Ukraine administrative
membership is precomputed from the packaged reference polygons and land-cell
centers, restricted to the matching scenario sovereignty where available. This
avoids counting a neighboring country's cells when the two cartographic sources
disagree along a border. It does not use synthetic game provinces. Region polling inspects at most 2,048 cells
per interval and reports a complete region pass. Full control requires every
indexed cell; majority control enters at 75% and leaves below 70%. A changed
classification must survive two passes. This delays notifications and filters
border flicker; it does not claim an exact real-world front or cadastral boundary.
Baseline, sampling cursors and pending counts survive worker/server handoffs.
