//! Regions: first-order administrative areas (states, provinces, oblasts)
//! from Natural Earth admin-1 (`assets/geodata/admin1/regions.json.gz`),
//! laid over the scenario's cell grid. Fronts move cell by cell; economy,
//! objectives and peace terms count regions.
//!
//! The file stores outlines simplified one region at a time, so neighbours
//! can overlap or leave slivers. Building the map:
//!
//! 1. Fill each region's rings (even-odd, at cell centres). The first region
//!    to claim a cell keeps it. Only land with a de jure owner counts.
//! 2. A region's home country is the owner of most of its cells.
//! 3. Cells owned by another country are released: a region never crosses
//!    a border.
//! 4. Released and uncovered cells take the region of a neighbouring cell
//!    with the same owner, breadth-first, so the nearest region wins.
//! 5. Cells still without a region (islands the outlines missed) join their
//!    owner's region with the nearest label point. A country without any
//!    region gets one made-up region named after it.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fmt;
use std::io::Read;

use serde::Deserialize;

use crate::scenario::{Grid, Scenario};

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize)]
pub struct Names {
    #[serde(default)]
    pub en: String,
    #[serde(default)]
    pub uk: String,
    #[serde(default)]
    pub ru: String,
}

#[derive(Clone, Debug)]
pub struct Region {
    /// Source id such as `UKR-321`, or `MW-<country id>` for a made-up region.
    pub id: String,
    /// The source file's three-letter grouping (`UKR`); empty for made-up regions.
    pub country_code: String,
    pub names: Names,
    /// The scenario country that owns the region by law (0 if it has no cells).
    pub home: u16,
    pub cells: u32,
    /// Label point as `[longitude, latitude]`.
    pub anchor: [f64; 2],
    /// Made up for a country the file does not cover.
    pub synthetic: bool,
}

#[derive(Clone, Debug)]
pub struct Regions {
    pub list: Vec<Region>,
    /// Per cell: region index + 1, or 0 for no region (water, unowned land).
    pub cell_region: Vec<u16>,
}

impl Regions {
    pub fn index_of_cell(&self, cell: usize) -> Option<usize> {
        match self.cell_region.get(cell) {
            Some(&value) if value > 0 => Some(usize::from(value) - 1),
            _ => None,
        }
    }

    pub fn region_of_cell(&self, cell: usize) -> Option<&Region> {
        self.index_of_cell(cell).map(|index| &self.list[index])
    }

    /// FNV-1a over the region ids and the cell map: two region maps with
    /// the same fingerprint settle peace terms the same way.
    pub fn fingerprint(&self) -> u64 {
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        let mut eat = |byte: u8| {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x0100_0000_01b3);
        };
        for region in &self.list {
            region.id.bytes().for_each(&mut eat);
            eat(0);
            region.home.to_le_bytes().into_iter().for_each(&mut eat);
        }
        for value in &self.cell_region {
            value.to_le_bytes().into_iter().for_each(&mut eat);
        }
        hash
    }
}

#[derive(Debug)]
pub enum RegionError {
    Gzip(std::io::Error),
    Json(serde_json::Error),
    TooMany,
}

impl fmt::Display for RegionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Gzip(e) => write!(f, "cannot decompress the region file: {e}"),
            Self::Json(e) => write!(f, "invalid region file: {e}"),
            Self::TooMany => write!(f, "too many regions for a 16-bit region map"),
        }
    }
}

impl std::error::Error for RegionError {}

#[derive(Deserialize)]
struct RawFile {
    regions: Vec<RawRegion>,
}

#[derive(Deserialize)]
struct RawRegion {
    id: String,
    country: String,
    #[serde(default)]
    names: Names,
    anchor: [f64; 2],
    rings: Vec<Vec<f64>>,
}

/// Build the region map for `scenario` from the gzipped region file.
pub fn build(regions_json_gz: &[u8], scenario: &Scenario) -> Result<Regions, RegionError> {
    let mut json = Vec::new();
    flate2::read::GzDecoder::new(regions_json_gz)
        .read_to_end(&mut json)
        .map_err(RegionError::Gzip)?;
    let raw: RawFile = serde_json::from_slice(&json).map_err(RegionError::Json)?;
    if raw.regions.len() + scenario.countries.len() >= usize::from(u16::MAX) {
        return Err(RegionError::TooMany);
    }
    let grid = &scenario.grid;
    let owner = |cell: usize| {
        if scenario.land[cell] != 0 {
            scenario.de_jure[cell]
        } else {
            0
        }
    };
    let mut cell_region = vec![0u16; grid.len()];

    // 1. Fill the outlines; the first region to claim a cell keeps it.
    for (index, region) in raw.regions.iter().enumerate() {
        fill_rings(&region.rings, grid, |cell| {
            if cell_region[cell] == 0 && owner(cell) != 0 {
                cell_region[cell] = index as u16 + 1;
            }
        });
    }
    let mut list: Vec<Region> = raw
        .regions
        .into_iter()
        .map(|r| Region {
            id: r.id,
            country_code: r.country,
            names: r.names,
            home: 0,
            cells: 0,
            anchor: r.anchor,
            synthetic: false,
        })
        .collect();

    // 2. Home country: the owner of most cells (ties go to the lower id).
    let mut votes: BTreeMap<(u16, u16), u32> = BTreeMap::new();
    for (cell, &value) in cell_region.iter().enumerate() {
        if value != 0 {
            *votes.entry((value, owner(cell))).or_default() += 1;
        }
    }
    let mut best: HashMap<u16, (u32, u16)> = HashMap::new();
    for (&(value, home), &count) in &votes {
        let entry = best.entry(value).or_insert((0, home));
        if count > entry.0 {
            *entry = (count, home);
        }
    }
    for (value, (_, home)) in best {
        list[usize::from(value) - 1].home = home;
    }

    // 3. A region never crosses a border.
    for (cell, value) in cell_region.iter_mut().enumerate() {
        if *value != 0 && list[usize::from(*value) - 1].home != owner(cell) {
            *value = 0;
        }
    }

    // 4. Gaps take the region of the nearest same-owner neighbour.
    let mut queue: VecDeque<usize> = (0..grid.len()).filter(|&c| cell_region[c] != 0).collect();
    while let Some(cell) = queue.pop_front() {
        let home = owner(cell);
        for next in neighbours(cell, grid).into_iter().flatten() {
            if cell_region[next] == 0 && owner(next) == home {
                cell_region[next] = cell_region[cell];
                queue.push_back(next);
            }
        }
    }

    // 5. Islands the outlines missed, and countries the file does not cover.
    let mut by_home: HashMap<u16, Vec<usize>> = HashMap::new();
    for (index, region) in list.iter().enumerate() {
        if region.home != 0 {
            by_home.entry(region.home).or_default().push(index);
        }
    }
    for (cell, value) in cell_region.iter_mut().enumerate() {
        let home = owner(cell);
        if *value != 0 || home == 0 {
            continue;
        }
        let here = cell_center(cell, grid);
        let candidates = by_home.entry(home).or_default();
        if candidates.is_empty() {
            let name = scenario
                .countries
                .iter()
                .flatten()
                .find(|c| c.id == home)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| format!("Country {home}"));
            candidates.push(list.len());
            list.push(Region {
                id: format!("MW-{home}"),
                country_code: String::new(),
                names: Names {
                    en: name,
                    ..Names::default()
                },
                home,
                cells: 0,
                anchor: here,
                synthetic: true,
            });
        }
        let nearest = candidates
            .iter()
            .copied()
            .min_by(|&a, &b| {
                distance(here, list[a].anchor).total_cmp(&distance(here, list[b].anchor))
            })
            .expect("at least one candidate");
        *value = nearest as u16 + 1;
    }

    for &value in &cell_region {
        if value != 0 {
            list[usize::from(value) - 1].cells += 1;
        }
    }
    Ok(Regions { list, cell_region })
}

/// Call `visit` for every cell whose centre lies inside the rings (even-odd
/// rule, so holes stay empty). The source splits regions at the antimeridian
/// into rings on each side, so no edge crosses it.
fn fill_rings(rings: &[Vec<f64>], grid: &Grid, mut visit: impl FnMut(usize)) {
    let res = grid.res_deg;
    let (width, height) = (i64::from(grid.width), i64::from(grid.height));
    let mut edges = Vec::new();
    let (mut south, mut north) = (f64::INFINITY, f64::NEG_INFINITY);
    for ring in rings {
        let (points, _) = ring.as_chunks::<2>();
        for pair in points.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            if a[1] == b[1] {
                continue;
            }
            south = south.min(a[1].min(b[1]));
            north = north.max(a[1].max(b[1]));
            edges.push(if a[1] < b[1] { (a, b) } else { (b, a) });
        }
    }
    // Fractional row whose centre is at `lat`.
    let row_of = |lat: f64| (lat + 90.0) / res - 0.5;
    let first = (row_of(south).ceil() as i64).max(0);
    let last = (row_of(north).floor() as i64).min(height - 1);
    if edges.is_empty() || first > last {
        return;
    }
    let mut crossings: Vec<Vec<f64>> = vec![Vec::new(); (last - first + 1) as usize];
    for (low, high) in edges {
        let from = (row_of(low[1]).ceil() as i64 - 1).max(first);
        let to = (row_of(high[1]).ceil() as i64).min(last);
        for row in from..=to {
            let lat = (row as f64 + 0.5) * res - 90.0;
            // Half-open, so a vertex shared by two edges counts once.
            if low[1] <= lat && lat < high[1] {
                let lng = low[0] + (lat - low[1]) * (high[0] - low[0]) / (high[1] - low[1]);
                crossings[(row - first) as usize].push(lng);
            }
        }
    }
    for (offset, row) in crossings.iter_mut().enumerate() {
        row.sort_by(f64::total_cmp);
        let y = first + offset as i64;
        for span in row.as_chunks::<2>().0 {
            let x0 = (((span[0] + 180.0) / res - 0.5).ceil() as i64).max(0);
            let x1 = (((span[1] + 180.0) / res - 0.5).ceil() as i64 - 1).min(width - 1);
            for x in x0..=x1 {
                visit((y * width + x) as usize);
            }
        }
    }
}

/// The four neighbours of a cell; longitude wraps, latitude does not.
fn neighbours(cell: usize, grid: &Grid) -> [Option<usize>; 4] {
    let width = grid.width as usize;
    let (x, y) = (cell % width, cell / width);
    let west = if x == 0 { cell + width - 1 } else { cell - 1 };
    let east = if x == width - 1 {
        cell + 1 - width
    } else {
        cell + 1
    };
    let south = (y > 0).then(|| cell - width);
    let north = (y + 1 < grid.height as usize).then(|| cell + width);
    [Some(west), Some(east), south, north]
}

fn cell_center(cell: usize, grid: &Grid) -> [f64; 2] {
    let width = grid.width as usize;
    let (x, y) = ((cell % width) as f64, (cell / width) as f64);
    [
        (x + 0.5) * grid.res_deg - 180.0,
        (y + 0.5) * grid.res_deg - 90.0,
    ]
}

/// Squared distance in degrees, with longitude wrapping.
fn distance(a: [f64; 2], b: [f64; 2]) -> f64 {
    let dlng = (a[0] - b[0]).abs();
    let dlng = dlng.min(360.0 - dlng);
    let dlat = a[1] - b[1];
    dlng * dlng + dlat * dlat
}
