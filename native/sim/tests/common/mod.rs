//! Shared test helpers: the real scenario packages, decoded once per test binary.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use mw_sim::scenario::{self, Scenario};

pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn load(name: &str) -> Scenario {
    let path = repo_root().join(format!("assets/maps/compiled/{name}.mwsc.gz"));
    let bytes = std::fs::read(&path).expect("read scenario package");
    scenario::decode_gzip(&bytes).expect("decode scenario package")
}

/// Modern World 2026, the first playable's scenario.
#[allow(dead_code)]
pub fn world_2026() -> &'static Scenario {
    static CELL: OnceLock<Scenario> = OnceLock::new();
    CELL.get_or_init(|| load("world-map-2026-v3"))
}

#[allow(dead_code)]
pub fn ukraine_2023() -> &'static Scenario {
    static CELL: OnceLock<Scenario> = OnceLock::new();
    CELL.get_or_init(|| load("ukraine-2023-v3"))
}

fn regions_for(scenario: &'static Scenario) -> mw_sim::regions::Regions {
    let path = repo_root().join("assets/geodata/admin1/regions.json.gz");
    let bytes = std::fs::read(&path).expect("read admin-1 regions");
    mw_sim::regions::build(&bytes, scenario).expect("build regions")
}

/// Regions on the Modern World 2026 map.
#[allow(dead_code)]
pub fn regions_2026() -> &'static mw_sim::regions::Regions {
    static CELL: OnceLock<mw_sim::regions::Regions> = OnceLock::new();
    CELL.get_or_init(|| regions_for(world_2026()))
}

/// Regions on the Ukraine 2023 map.
#[allow(dead_code)]
pub fn regions_ukraine() -> &'static mw_sim::regions::Regions {
    static CELL: OnceLock<mw_sim::regions::Regions> = OnceLock::new();
    CELL.get_or_init(|| regions_for(ukraine_2023()))
}

/// A country's id by its English name.
#[allow(dead_code)]
pub fn country(scenario: &Scenario, name: &str) -> u16 {
    scenario
        .countries
        .iter()
        .flatten()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("no country named {name}"))
        .id
}

/// The grid cell at a longitude and latitude.
#[allow(dead_code)]
pub fn cell(scenario: &Scenario, lng: f64, lat: f64) -> u32 {
    scenario
        .grid
        .cell_at(lng, lat)
        .expect("point is on the grid") as u32
}

/// Walk west from a point held by `east` until the land is held by `west`.
/// Returns (last cell held by `east`, first cell held by `west`), neighbours
/// on the same row.
#[allow(dead_code)]
pub fn border_west(scenario: &Scenario, lng: f64, lat: f64, east: u16, west: u16) -> (u32, u32) {
    let mut here = cell(scenario, lng, lat) as usize;
    assert_eq!(
        scenario.control[here], east,
        "start point is not held by {east}"
    );
    for _ in 0..200 {
        let next = here - 1;
        let held_by = scenario.control[next];
        if held_by == west && scenario.land[next] != 0 {
            return (here as u32, next as u32);
        }
        assert_eq!(
            held_by, east,
            "walked out of {east} into {held_by}, not {west}"
        );
        here = next;
    }
    panic!("no border within 200 cells");
}

/// Run `ticks` ticks and collect their events.
#[allow(dead_code)]
pub fn run(world: &mut mw_sim::world::World, ticks: u64) -> Vec<mw_sim::world::Event> {
    (0..ticks).flat_map(|_| world.step()).collect()
}
