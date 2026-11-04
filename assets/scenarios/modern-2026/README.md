# Modern World 2026 — political geography

This scenario uses land-only country and dependency polygons from **Overture Maps release `2026-10-21.0`**. The date identifies the published geographic dataset, not a claim that every underlying boundary was surveyed that day. Each retained feature includes its upstream record identifiers and source metadata.

This is a political baseline, **not a map of military control**. It does not model current frontlines, deployments or alliances. Population/GDP inputs and city positions inherited from the game's older scenario are balance/reference data, not verified 2026 statistics. Newly introduced entities use fictional default balance inputs.

## Sources and licensing

- [Overture divisions documentation](https://docs.overturemaps.org/guides/divisions/)
- [Division-area schema](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
- [Public download/query instructions](https://docs.overturemaps.org/getting-data/duckdb/)
- Public source: `s3://overturemaps-us-west-2/release/2026-10-21.0/theme=divisions/type=division_area/*`
- Attribution: **© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) · [Overture Maps](https://overturemaps.org/)**
- License: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The bundled derived geographic database remains available in `countries.geojson.gz` under that license; attribution also appears in scenario metadata and the selection screen.

`countries.geojson.gz` contains the compact, reproducible source derivative, rather than a dependency on a live API. Land polygons are simplified with topology preservation at 0.015 degrees and coordinates rounded to five decimal places. The application build samples them at cell centers onto its 0.1-degree geographic grid. Dependencies take precedence over overlapping country polygons. Sub-grid islands or states may not produce playable cells; grid territory counts are not physical areas.

The bundled source SHA-256 is `e6c6f3544da49f412e5aa0572f2440ebc4a5ddf5a37ccefd6fed815ad2973f85` (3,768,828 compressed bytes). The initial compiled baseline has 2,028,934 land cells, 266 game-entity records after the aliases below, and 1,133 inherited city positions that fall on land. These entity records include dependencies and source-labeled disputed areas, not 266 internationally recognized states.

## Political-boundary policy

The source's country classification is used as the default. All Ukrainian sovereign territory, including Crimea, Sevastopol and the eastern/southern regions, is assigned to Ukraine using the bundled 27-region reference layer. This adjustment is restricted to already identified land cells; it does not paint coastal water as territory. Occupation belongs to dated historical scenarios, not this political baseline.

Historical factions and releasable entities from the 2022 scenario are not copied. Existing country identifiers are retained when matching ISO country codes, preserving game translations and interaction. Source entities missing from the older roster receive new identifiers outside the historical-faction range. No real-world current alliance or dependency relationship is inferred by the game from these polygons.

Overture includes special codes for disputed areas and some dependency subdivisions. The political baseline groups Gaza (`XG`) and West Bank (`XW`) with Palestine (`PS`), and Golan (`XH`) with Syria (`SY`); these are sovereignty choices, not assertions of military control. Unambiguous dependency aliases are Clipperton (`CP`) → France (`FR`), Sint Eustatius (`XE`) and Saba (`XS`) → Caribbean Netherlands (`BQ`), and Jan Mayen (`XJ`) → the Svalbard/Jan Mayen ISO grouping (`SJ`). The exact mapping is retained in scenario provenance.

Other special-code areas retain their source labels and separate neutral gray flags: Habomai, Liancourt claim, Demchok, Senkaku/Diaoyu, Iturup, Barahoti, Abu Musa, Tunb, Shikotan, Paracel, Nilang-Jadhang, Spratly, Bir Tawil, Kunashir, Gue-Kaurik, Abyei, and no man's land. Their presence as game entities does not assert statehood or decide sovereignty disputes. Their flags are embedded and never request nonexistent ISO flag images. As with other new entities, any population/economy values are fictional game inputs.

Administrative region outlines and labels use the separately pinned Natural Earth reference described in [the administrative layer README](../../geodata/admin1/README.md); they are not claimed to be a complete 2026 regional census. The Ukraine sovereignty adjustment uses that same reference.

## Rebuild

Routine scenario builds are offline and need only the bundled source:

```sh
node scripts/build-modern-2026-scenario.mjs
node scripts/build-modern-2026-scenario.mjs --check
MW_HEAVY_SMOKES=1 node scripts/modern-2026-smoke.mjs
```

The generator needs several GB of memory. Without `MW_HEAVY_SMOKES=1` the smoke only checks the committed package, which is what `npm run smoke` does.

To refresh the pinned source intentionally, install DuckDB 1.1.3 with matching `spatial` and `httpfs` extensions in an isolated environment, then execute `extract.sql`. The public Parquet collection is several gigabytes; selective queries still download substantial geometry. Its fixed release and SQL retain 272 land features (219 country and 53 dependency records).

```sh
duckdb < assets/scenarios/modern-2026/extract.sql
node scripts/build-modern-2026-scenario.mjs --prepare-source /tmp/mw-overture-countries.json
node scripts/build-modern-2026-scenario.mjs
```

The generator records a SHA-256 digest of the bundled compressed source in the compiled scenario. Review source changes, political-boundary checks, output size and licensing before changing the pinned release or asset revision. The compact geographic source has no network dependency at runtime.

## Port credit

Prepared by viacheslav.puzanov in the [Bald1nh0/moder-wars](https://github.com/Bald1nh0/moder-wars) fork (commit `084c595`) and ported to this repository. The source data credits above still apply.
