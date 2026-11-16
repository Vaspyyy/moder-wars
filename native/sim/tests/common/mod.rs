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
