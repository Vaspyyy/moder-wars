# Administrative region display layer

Made with **Natural Earth**. This optional geographic reference layer contains
4,596 first-order administrative regions across 251 source country/territory
codes. It displays regional boundaries and names; it does not assign military
control, change sovereign ownership, or create new game provinces.

## Source and license

- Dataset: [Natural Earth Admin 1 – States, Provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/), 1:10 million.
- Pinned repository release: [`v5.1.2`](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2); the Admin-1 download is identified as version 5.1.1 on the project website.
- [Original GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson).
- Original SHA-256: `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5`.
- [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/): public-domain data; modification and redistribution are permitted. The source's translated names derive from CC0 Wikidata.

This is a pinned cartographic snapshot, not a live boundary feed or a guarantee
that every recent administrative reform is represented. Some countries mix
administrative levels, and seven source regions have no usable name. Missing
Ukrainian/Russian labels fall back to the source English/local name. Very small
countries and disputed areas may have incomplete regional coverage. Natural
Earth uses de facto country classifications by default.

## Ukraine handling

All 27 Ukrainian administrative units are included: 24 oblasts, the Autonomous
Republic of Crimea, Kyiv city, and Sevastopol city. Source features whose ISO
subdivision code starts with `UA-` are explicitly grouped under `UKR`, including
Crimea and Sevastopol even though the source's de facto `adm0_a3` field says
`RUS`. Source feature IDs are retained for reproducibility and are not sovereignty
claims. Oblast boundaries remain visible independently of military control.

Kyiv oblast and Kyiv city have distinct labels. English oblast labels use an
explicit `Oblast` suffix and `Odesa` spelling. Ukrainian/Russian oblast labels
come from the source, with the Kyiv oblast correction applied by the generator.
This layer is a geographic reference; using it on an older scenario does not
make its boundaries historically accurate for that scenario date.

## Reproduction

From the repository root, with Node 24 or newer:

```sh
# Fetch the pinned public GeoJSON, verify its digest, and rebuild the packaged layer.
node scripts/prepare-admin-regions.mjs

# Use an already downloaded source without network access.
node scripts/prepare-admin-regions.mjs --source /path/to/ne_10m_admin_1_states_provinces.geojson

# Verify byte-for-byte reproduction without modifying the packaged output.
node scripts/prepare-admin-regions.mjs --source /path/to/ne_10m_admin_1_states_provinces.geojson --check
```

The generator requires no GIS/npm dependencies. It rounds coordinates to four
decimal places and simplifies each ring with a 0.025-degree Douglas–Peucker
tolerance, retaining small closed rings that would otherwise collapse. It keeps
all administrative units and polygon rings. A source label anchor is reused when
inside its polygon; otherwise an interior scanline supplies the anchor. Adjacent
outlines are generalized independently, so this is unsuitable for cadastral
measurement or reconstructing exact shared boundary topology.

The checked-in gzip file is approximately 1.50 MB, expanding to 4.46 MB of JSON
instead of the approximately 40 MB original GeoJSON. The generator validates
region IDs, finite closed coordinates, Ukraine coverage and a 2 MB compressed /
5 MB uncompressed input budget. Do not put the large source GeoJSON into the
runtime package. If the source URL, digest, or simplification changes, review the
result and update the browser asset revision to avoid stale cached geometry.

## Runtime schema

`regions.json.gz` contains gzip-compressed UTF-8 JSON:

```json
{
  "version": 1,
  "source": {
    "name": "Natural Earth Admin 1",
    "release": "v5.1.2",
    "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson",
    "sha256": "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5",
    "toleranceDegrees": 0.025
  },
  "regions": []
}
```

Each region has `id`, `country` (source ISO-like three-letter grouping),
`names: {en, uk, ru}`, `bbox: [west, south, east, north]`,
`anchor: [longitude, latitude]`, and `rings`. Every ring is a flat, closed array
`[longitude, latitude, longitude, latitude, ...]` in geographic degrees. Rings
include outer boundaries and holes and are intended for stroking, not unqualified
polygon filling. Antimeridian regions can have wide bounding boxes; renderers
must avoid drawing segments across the full map when longitude jumps exceed
180 degrees.

## Port credit

Prepared by viacheslav.puzanov in the [Bald1nh0/moder-wars](https://github.com/Bald1nh0/moder-wars) fork (commit `084c595`) and ported to this repository. The source data credits above still apply.
