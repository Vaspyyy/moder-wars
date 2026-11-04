# Geographic data and regional scenarios

Research checked on 2026-10-28. Downloadable geography is not a complete playable scenario: military control, participating countries, starting forces, and the scenario date still need an explicit game configuration.

## Existing formats

- Natural Earth geography is stored as GeoJSON in `assets/geodata/`.
- Built-in scenarios are packaged as compressed MWSC v3 binaries (`assets/maps/compiled/*.mwsc.gz`). Legacy JSON scenario import and export remain supported.
- Administrative borders are a separate display layer. They do not replace the simulation's procedural provinces, sovereign ownership, or military control.

## Sources

| Source | Available data | Integration considerations |
| --- | --- | --- |
| [Natural Earth Admin 1](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/) | Generalized regions, states, and provinces for most countries | Suitable for a compact global display layer. Dataset versions are not observation dates. Default disputed-area classifications require review; the bundled layer groups all Ukrainian regions, including Crimea and Sevastopol, under Ukraine. |
| [Overture Maps divisions](https://docs.overturemaps.org/guides/divisions/) | Dated global country, dependency, and administrative-area snapshots | Modern World 2026 uses land-only country/dependency geometry from release `2026-10-21.0`, bundled for offline scenario builds. ODbL attribution and derived-database terms apply; this is political geography, not military control. |
| [geoBoundaries API](https://www.geoboundaries.org/api.html) | Administrative boundaries and metadata; GeoJSON and TopoJSON download links | Public HTTP requests without credentials. Read the individual response's represented year, source, and license rather than assuming `current` means current-year boundaries. |
| [Geofabrik / OpenStreetMap](https://www.geofabrik.de/data/download.html) | Frequently updated detailed geography | Raw PBF extracts need filtering and conversion; the free shapefile bundle does not contain every OSM feature. ODbL attribution and database terms apply. Too large to load directly into this game. |
| [ISW interactive map](https://www.arcgis.com/home/item.html?id=36a7f6a6f5a9448496de641cf64bd375) | Published assessments of territorial control | A public map is not automatically a documented reusable data API. Dataset access, timestamps, and reuse terms need separate verification before integration. |
| [Cyterat DeepState archive](https://github.com/cyterat/deepstate-map-data) | Third-party dated GeoJSON polygons of Russian-occupied territory | Not an official DeepState API. Repository license does not by itself establish permissions for upstream data. Check date coverage, source rights, and geometry before using a snapshot. It is not a complete dataset of all control categories. |

### Verified geoBoundaries example

```sh
curl --fail --location 'https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/'
```

The response checked on the research date identified 27 administrative units, `boundaryYearRepresented: "2017"`, `buildDate: "Dec 12, 2023"`, and an ODbL 1.0 source license. It includes `gjDownloadURL` and `simplifiedGeometryGeoJSON`. ADM1 means first-level administrative divisions; it does not describe occupation or a frontline.

[DeepState's published terms](https://deepstatemap.live/license.html) describe API access separately from use of visual materials. No official API integration or third-party occupation feed is enabled by this work.

## Recommended update workflow

1. Select a source and a specific observation date.
2. Download outside gameplay, preserve provenance and source metadata, and validate coverage and coordinates.
3. Simplify geometry and convert it into the game's compact assets or scenario format.
4. Test borders, sovereignty, military control, and performance independently.
5. Publish a new dated scenario deliberately. Do not change a running player's initial map through a live API request.

## Eurasia or a smaller theater

A regional Ukraine-Russia scenario is a reasonable alternative to the world scenario. A European / western-Russian theater keeps the conflict legible; Eurasia retains more neighboring countries but is substantially larger.

Camera bounds and scenario bounds are different changes. Restricting the camera can hide the Americas, but it does not reduce the simulation's global grids. A smaller simulation requires explicit grid origins and extents: current coordinate conversions use global longitude/latitude offsets, and loaders, pathfinding, naval movement, reinforcements, territory ledgers, and exports must agree on the new bounds. Masking excluded land alone does not remove the cost of globally allocated arrays.

Ukraine 2023 now uses an explicit Eurasian theater: only its selected European and Asian actors, land, cities, and administrative outlines remain, and the camera is constrained to the theater. Export, import, and restart preserve that mask. The longitude range excludes Russia's far-eastern land beyond the antimeridian. This is a masked global grid, not a smaller allocation; no memory or speed improvement is claimed from the mask alone. See `assets/scenarios/ukraine-2023/README.md` for the exact scope.

Modern World 2026 remains a full-world political scenario. Its country boundaries come from the pinned October 2026 Overture release; its administrative overlay is the separate Natural Earth reference dataset, not a claim that every province was surveyed in 2026. Ukrainian sovereign territory includes Crimea and all 27 administrative regions. Legacy 2022 assets remain available for compatibility and reproducible game-balance inputs. See `assets/scenarios/modern-2026/README.md` for source provenance and limitations.

## Credit

Researched by viacheslav.puzanov in the [Bald1nh0/moder-wars](https://github.com/Bald1nh0/moder-wars) fork (commit `084c595`) and adapted for this repository, which keeps its translations in `src/translations.js`.
