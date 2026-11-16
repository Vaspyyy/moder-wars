//! Reads compiled scenario packages (`assets/maps/compiled/*.mwsc.gz`, MWSC v3).
//!
//! Layout of a decompressed package (all integers little-endian):
//!
//! | bytes | content |
//! | --- | --- |
//! | 0..4 | magic `MWSC` |
//! | 4 | version (3) |
//! | 6..8 | header size (32) |
//! | 8..12 | metadata JSON size |
//! | 12..16 | number of land cells (entries) |
//! | 16..20 | map payload size |
//! | 20..24 | saved-territory section size |
//! | 24..28 | flag-blob section size |
//! | 28..32 | number of flag blobs |
//!
//! Then come the metadata JSON, the map payload (runs of
//! `start delta, length, owner, biome` as varints), the saved-territory runs
//! and the flag blobs. The JavaScript reference is `src/scenario-codec.js`;
//! `tests/golden.rs` checks that both agree on every cell.

mod legacy;
mod mwsc;

use std::io::Read;

use mwsc::{read_flag_blobs, read_header, read_runs, read_saved_cells, restore_flag_urls};

use serde::Deserialize;
use serde_json::Value;

pub use legacy::legacy_province_ids;
pub use mwsc::{DecodeError, Header};

/// The map grid: equal-angle cells, row 0 at latitude -90, column 0 at longitude -180.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Grid {
    pub width: u32,
    pub height: u32,
    /// Cell size in degrees.
    pub res_deg: f64,
}

impl Grid {
    pub fn len(&self) -> usize {
        self.width as usize * self.height as usize
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The cell containing a point. Longitude wraps; latitudes off the grid give `None`.
    pub fn cell_at(&self, lng: f64, lat: f64) -> Option<usize> {
        let lng = (lng + 180.0).rem_euclid(360.0);
        let x = ((lng / self.res_deg) as usize).min(self.width as usize - 1);
        let y = (lat + 90.0) / self.res_deg;
        if !(0.0..f64::from(self.height)).contains(&y) {
            return None;
        }
        Some(y as usize * self.width as usize + x)
    }
}

#[derive(Debug, Clone)]
pub struct Theater {
    pub id: String,
    /// `[west, south, east, north]` in degrees.
    pub bounds: [f64; 4],
    pub country_ids: Vec<u16>,
}

#[derive(Debug, Clone)]
pub struct ScenarioInfo {
    pub name: String,
    pub map_res: Option<String>,
    /// `YYYY-MM-DD`.
    pub start_date: Option<String>,
    pub sovereignty_base: Option<String>,
    pub theater: Option<Theater>,
    /// Credit line that must stay visible (license requirement).
    pub attribution: Option<String>,
}

/// Territory a country remembers as its own, as `(first cell, length)` runs.
#[derive(Debug, Clone)]
pub struct SavedCells {
    pub width: u32,
    pub runs: Vec<(u32, u32)>,
}

#[derive(Debug, Clone)]
pub struct Country {
    pub id: u16,
    pub name: String,
    pub iso2: Option<String>,
    pub role: Option<String>,
    pub color: Option<String>,
    pub pop: Option<f64>,
    pub gdp: Option<f64>,
    pub is_disputed: Option<bool>,
    pub releasable_by: Option<u16>,
    pub flag_url: Option<String>,
    pub saved_cells: Option<SavedCells>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct City {
    pub id: u32,
    pub name: String,
    pub lat: f64,
    pub lng: f64,
    pub owner_id: u16,
    #[serde(default)]
    pub is_capital: bool,
    #[serde(default)]
    pub pop: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SovereigntyOverride {
    pub owner_id: u16,
    pub cells: Vec<u32>,
}

/// A decoded scenario. Every per-cell layer has `grid.len()` entries.
#[derive(Debug, Clone)]
pub struct Scenario {
    /// FNV-1a hash of the decompressed package. Saves store it so they only
    /// load with the scenario they were made on.
    pub fingerprint: u64,
    pub header: Header,
    pub run_count: usize,
    pub info: ScenarioInfo,
    pub grid: Grid,
    /// Indexed by `id - 1`; gaps are `None`.
    pub countries: Vec<Option<Country>>,
    pub cities: Vec<City>,
    pub sovereignty_overrides: Vec<SovereigntyOverride>,
    /// Who holds each cell militarily (0 = nobody or water).
    pub control: Vec<u16>,
    /// Who owns each cell by law (after sovereignty overrides).
    pub de_jure: Vec<u16>,
    /// 1 for land, 0 for water.
    pub land: Vec<u8>,
    pub biome: Vec<u8>,
    /// Cells written while applying sovereignty (matches the JS return value).
    pub sovereignty_writes: usize,
}

/// Decompress and decode a `.mwsc.gz` package.
pub fn decode_gzip(gzip: &[u8]) -> Result<Scenario, DecodeError> {
    let mut bytes = Vec::with_capacity(gzip.len() * 4);
    flate2::read::GzDecoder::new(gzip)
        .read_to_end(&mut bytes)
        .map_err(DecodeError::Gzip)?;
    decode(&bytes)
}

/// Decode an uncompressed MWSC v3 package.
pub fn decode(bytes: &[u8]) -> Result<Scenario, DecodeError> {
    let header = read_header(bytes)?;
    let payload_start = header.header_bytes as usize + header.metadata_bytes as usize;
    let payload_end = payload_start + header.payload_bytes as usize;
    let saved_end = payload_end + header.saved_bytes as usize;
    let blob_end = saved_end + header.blob_bytes as usize;
    if payload_end > bytes.len() {
        return Err(DecodeError::Truncated("map payload"));
    }
    if blob_end != bytes.len() {
        return Err(DecodeError::Truncated("metadata sections"));
    }

    let mut meta: Value =
        serde_json::from_slice(&bytes[header.header_bytes as usize..payload_start])
            .map_err(DecodeError::Metadata)?;
    let saved = read_saved_cells(&bytes[..saved_end], payload_end, &meta)?;
    let blobs = read_flag_blobs(&bytes[..blob_end], saved_end, header.blob_count)?;
    restore_flag_urls(&mut meta, &blobs)?;

    let raw: RawScenario = serde_json::from_value(meta).map_err(DecodeError::Metadata)?;
    let grid = grid_of(&raw)?;
    let mut countries: Vec<Option<Country>> = raw
        .metadata
        .into_iter()
        .map(|m| m.map(Country::from))
        .collect();
    for (index, cells) in saved {
        if let Some(Some(country)) = countries.get_mut(index) {
            country.saved_cells = Some(cells);
        }
    }

    let len = grid.len();
    let mut control = vec![0u16; len];
    let mut land = vec![0u8; len];
    let mut biome = vec![0u8; len];
    let run_count = read_runs(
        &bytes[payload_start..payload_end],
        header.entry_count,
        |index, owner, biome_id| {
            if index < 0 || index as usize >= len {
                return; // the JS decoder silently skips cells outside the grid
            }
            let i = index as usize;
            // Truncating casts match the JS typed arrays (Uint16Array, Uint8Array).
            control[i] = owner as u16;
            land[i] = 1;
            biome[i] = biome_id as u8;
        },
    )?;

    let mut de_jure = control.clone();
    let sovereignty_writes = apply_sovereignty(
        &raw.sovereignty_overrides,
        raw.sovereignty_base.as_deref(),
        &countries,
        &control,
        &land,
        &mut de_jure,
    )?;

    let info = ScenarioInfo {
        name: raw.name,
        map_res: raw.map_res,
        start_date: raw
            .start_date
            .map(|d| format!("{:04}-{:02}-{:02}", d.year, d.month, d.day)),
        sovereignty_base: raw.sovereignty_base,
        theater: raw.theater.map(|t| Theater {
            id: t.id,
            bounds: t.bounds,
            country_ids: t.country_ids,
        }),
        attribution: raw.historical_source.and_then(|s| s.attribution),
    };

    Ok(Scenario {
        fingerprint: fnv1a64(bytes),
        header,
        run_count,
        info,
        grid,
        countries,
        cities: raw.cities,
        sovereignty_overrides: raw.sovereignty_overrides,
        control,
        de_jure,
        land,
        biome,
        sovereignty_writes,
    })
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn grid_of(raw: &RawScenario) -> Result<Grid, DecodeError> {
    let res = raw.grid_res;
    if !res.is_finite() || res <= 0.0 {
        return Err(DecodeError::Corrupt("gridRes must be positive"));
    }
    let width = (raw.world_width_deg.unwrap_or(360.0) / res).ceil();
    let height = (raw.world_height_deg.unwrap_or(180.0) / res).ceil();
    if !(1.0..=65_536.0).contains(&width) || !(1.0..=65_536.0).contains(&height) {
        return Err(DecodeError::Corrupt("grid size"));
    }
    Ok(Grid {
        width: width as u32,
        height: height as u32,
        res_deg: res,
    })
}

/// Split law from force: start from military control when the scenario says
/// so, then hand the listed land cells to their sovereign. Mirrors
/// `applyScenarioSovereigntyOverrides` in `src/scenario-territory.js` for the
/// case the native game uses (scenario grid = simulation grid).
fn apply_sovereignty(
    overrides: &[SovereigntyOverride],
    base: Option<&str>,
    countries: &[Option<Country>],
    control: &[u16],
    land: &[u8],
    de_jure: &mut [u16],
) -> Result<usize, DecodeError> {
    let use_control = match base {
        None => false,
        Some("control") => true,
        Some(_) => return Err(DecodeError::Corrupt("unsupported sovereignty baseline")),
    };
    // Validate everything before touching the map.
    let known = |id: u16| countries.iter().flatten().any(|c| c.id == id);
    for o in overrides {
        if o.owner_id == 0 || !known(o.owner_id) {
            return Err(DecodeError::Corrupt("sovereignty override owner"));
        }
        if o.cells.iter().any(|&cell| cell as usize >= de_jure.len()) {
            return Err(DecodeError::Corrupt("sovereignty override cell"));
        }
    }
    let mut writes = 0;
    if use_control {
        de_jure.copy_from_slice(control);
        writes = de_jure.len();
    }
    for o in overrides {
        for &cell in &o.cells {
            if land[cell as usize] != 0 {
                de_jure[cell as usize] = o.owner_id;
                writes += 1;
            }
        }
    }
    Ok(writes)
}

// Metadata JSON as stored in the package.

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScenario {
    #[serde(default)]
    name: String,
    grid_res: f64,
    world_width_deg: Option<f64>,
    world_height_deg: Option<f64>,
    map_res: Option<String>,
    start_date: Option<RawDate>,
    sovereignty_base: Option<String>,
    #[serde(default)]
    sovereignty_overrides: Vec<SovereigntyOverride>,
    theater: Option<RawTheater>,
    historical_source: Option<RawSource>,
    #[serde(default)]
    metadata: Vec<Option<RawCountry>>,
    #[serde(default)]
    cities: Vec<City>,
}

#[derive(Deserialize)]
struct RawDate {
    year: i32,
    month: u32,
    day: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawTheater {
    id: String,
    bounds: [f64; 4],
    #[serde(default)]
    country_ids: Vec<u16>,
}

#[derive(Deserialize)]
struct RawSource {
    attribution: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCountry {
    id: u16,
    name: String,
    iso2: Option<String>,
    role: Option<String>,
    color: Option<String>,
    pop: Option<f64>,
    gdp: Option<f64>,
    is_disputed: Option<bool>,
    releasable_by: Option<u16>,
    flag_url: Option<String>,
}

impl From<RawCountry> for Country {
    fn from(raw: RawCountry) -> Self {
        Self {
            id: raw.id,
            name: raw.name,
            iso2: raw.iso2,
            role: raw.role,
            color: raw.color,
            pop: raw.pop,
            gdp: raw.gdp,
            is_disputed: raw.is_disputed,
            releasable_by: raw.releasable_by,
            flag_url: raw.flag_url,
            saved_cells: None,
        }
    }
}
