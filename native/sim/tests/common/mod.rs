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
