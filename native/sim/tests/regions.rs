//! Regions: real first-order administrative areas (states, provinces,
//! oblasts) laid over the cell grid. Fronts move cell by cell; economy,
//! objectives and peace terms count regions.

mod common;

use std::collections::HashMap;

use mw_sim::regions::Regions;
use mw_sim::scenario::Scenario;

const UKRAINE: u16 = 167;
const RUSSIA: u16 = 136;

fn region_at<'a>(
    regions: &'a Regions,
    scenario: &Scenario,
    lng: f64,
    lat: f64,
) -> &'a mw_sim::regions::Region {
    let cell = scenario
        .grid
        .cell_at(lng, lat)
        .expect("point is on the grid");
    regions
        .region_of_cell(cell)
        .unwrap_or_else(|| panic!("no region at {lng},{lat} (land {})", scenario.land[cell]))
}

#[test]
fn every_region_in_the_file_is_loaded() {
    let regions = common::regions_2026();
    let from_file: Vec<_> = regions.list.iter().filter(|r| !r.synthetic).collect();
    assert_eq!(from_file.len(), 4596);
    let kyiv = from_file
        .iter()
        .find(|r| r.id == "UKR-321")
        .expect("Kyiv Oblast");
    assert_eq!(kyiv.names.en, "Kyiv Oblast");
    assert_eq!(kyiv.country_code, "UKR");
    assert!(!kyiv.names.uk.is_empty() && !kyiv.names.ru.is_empty());
}

#[test]
fn known_places_land_in_the_right_region() {
    let scenario = common::world_2026();
    let regions = common::regions_2026();
    // (place, longitude, latitude, region id)
    let places = [
        ("Kyiv", 30.52, 50.45, "UKR-4826"),
        ("Bila Tserkva", 30.11, 49.80, "UKR-321"),
        ("Lviv", 24.03, 49.84, "UKR-291"),
        ("Simferopol", 34.10, 44.95, "RUS-283"),
        ("Moscow", 37.62, 55.75, "RUS-2365"),
        ("Munich", 11.58, 48.14, "DEU-1591"),
        ("Albany", -73.76, 42.65, "USA-3559"),
        ("Sydney", 150.90, -33.80, "AUS-2654"),
        ("Tokyo", 139.40, 35.69, "JPN-1860"),
        ("São Paulo", -46.63, -23.55, "BRA-1311"),
        // Chukotka spans the antimeridian: both halves belong to it.
        ("Anadyr side", 175.0, 66.5, "RUS-2321"),
        ("Bering side", -173.5, 65.9, "RUS-2321"),
    ];
    for (place, lng, lat, id) in places {
        let region = region_at(regions, scenario, lng, lat);
        assert_eq!(
            region.id, id,
            "{place} landed in {} ({})",
            region.id, region.names.en
        );
    }
}

#[test]
fn every_owned_land_cell_has_exactly_one_region() {
    for (scenario, regions) in [
        (common::world_2026(), common::regions_2026()),
        (common::ukraine_2023(), common::regions_ukraine()),
    ] {
        let (mut missing, mut extra) = (0, 0);
        for cell in 0..scenario.grid.len() {
            let owned_land = scenario.land[cell] != 0 && scenario.de_jure[cell] != 0;
            match (owned_land, regions.region_of_cell(cell).is_some()) {
                (true, false) => missing += 1,
                (false, true) => extra += 1,
                _ => {}
            }
        }
        let name = &scenario.info.name;
        assert_eq!(missing, 0, "{name}: owned land cells without a region");
        assert_eq!(extra, 0, "{name}: water or unowned cells with a region");
    }
}

#[test]
fn a_region_never_crosses_a_border() {
    for (scenario, regions) in [
        (common::world_2026(), common::regions_2026()),
        (common::ukraine_2023(), common::regions_ukraine()),
    ] {
        for (cell, &owner) in scenario.de_jure.iter().enumerate() {
            if let Some(region) = regions.region_of_cell(cell) {
                assert_eq!(region.home, owner, "{} at cell {cell}", region.id);
            }
        }
    }
}

#[test]
fn every_country_with_land_has_regions() {
    let scenario = common::world_2026();
    let regions = common::regions_2026();
    let mut has_land: Vec<u16> = scenario
        .de_jure
        .iter()
        .zip(&scenario.land)
        .filter(|&(&owner, &land)| owner != 0 && land != 0)
        .map(|(&owner, _)| owner)
        .collect();
    has_land.sort_unstable();
    has_land.dedup();
    for owner in has_land {
        assert!(
            regions.list.iter().any(|r| r.home == owner && r.cells > 0),
            "country {owner} has no region"
        );
    }
    // Countries the region file does not cover get one made-up region named after them.
    for region in regions.list.iter().filter(|r| r.synthetic) {
        let country = scenario
            .countries
            .iter()
            .flatten()
            .find(|c| c.id == region.home)
            .unwrap();
        assert_eq!(region.names.en, country.name);
    }
}

#[test]
fn cell_counts_add_up() {
    let regions = common::regions_2026();
    let mut counted: HashMap<usize, u32> = HashMap::new();
    for cell in 0..regions.cell_region.len() {
        if let Some(index) = regions.index_of_cell(cell) {
            *counted.entry(index).or_default() += 1;
        }
    }
    for (index, region) in regions.list.iter().enumerate() {
        assert_eq!(
            counted.get(&index).copied().unwrap_or(0),
            region.cells,
            "{}",
            region.id
        );
    }
}

#[test]
fn sovereignty_decides_a_region_not_the_front() {
    // Ukraine 2023: Russia holds Crimea and much of Donetsk, but the regions stay Ukrainian.
    let scenario = common::ukraine_2023();
    let regions = common::regions_ukraine();
    for (place, lng, lat) in [("Simferopol", 34.10, 44.95), ("Donetsk", 37.80, 48.00)] {
        let cell = scenario.grid.cell_at(lng, lat).unwrap();
        assert_eq!(scenario.control[cell], RUSSIA, "{place} is held by Russia");
        assert_eq!(
            region_at(regions, scenario, lng, lat).home,
            UKRAINE,
            "{place} stays in a Ukrainian region"
        );
    }
}

#[test]
fn building_is_repeatable_and_quick() {
    let scenario = common::world_2026();
    let bytes =
        std::fs::read(common::repo_root().join("assets/geodata/admin1/regions.json.gz")).unwrap();
    let started = std::time::Instant::now();
    let regions = mw_sim::regions::build(&bytes, scenario).unwrap();
    let elapsed = started.elapsed();
    assert_eq!(regions.cell_region, common::regions_2026().cell_region);
    eprintln!("regions built in {elapsed:?}");
    // Generous: guards against accidental slowness, not a benchmark.
    assert!(
        elapsed.as_secs_f64() < 3.0,
        "building regions took {elapsed:?}"
    );
}
