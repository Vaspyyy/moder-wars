//! The fixed map the simulation runs on: which cells are land, where the
//! cities are, and how far apart neighbouring cells are in metres. Built once
//! from the scenario and never saved: a save always loads with its scenario.
//!
//! Distances use the real size of each cell. A 0.1° cell is about 11.1 km
//! from south to north everywhere, but its width shrinks with the cosine of
//! the latitude (about 5.6 km at 60°N).

use crate::scenario::{Grid, Scenario};
use crate::world::CountryId;

pub type Cell = u32;

/// Mean Earth radius in metres.
const EARTH_RADIUS_M: f64 = 6_371_000.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CityCell {
    pub cell: Cell,
    pub owner: CountryId,
    pub pop: u64,
    pub capital: bool,
}

/// One step to a neighbouring cell. A diagonal step also names the two cells
/// it squeezes between; both must be open, so nothing slips through a corner.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Step {
    pub to: Cell,
    pub sides: Option<[Cell; 2]>,
}

#[derive(Debug, Default, PartialEq)]
pub(crate) struct MapData {
    pub grid: Grid,
    land: Vec<bool>,
    /// Sorted by cell.
    cities: Vec<CityCell>,
    /// South-north step in metres.
    ns_m: u32,
    /// West-east step per row, in metres.
    ew_m: Vec<u32>,
    /// Diagonal step between row y and row y + 1, in metres.
    diag_m: Vec<u32>,
}

impl MapData {
    pub fn new(scenario: &Scenario) -> MapData {
        let grid = scenario.grid;
        let metres_per_degree = 2.0 * std::f64::consts::PI * EARTH_RADIUS_M / 360.0;
        let ns = metres_per_degree * grid.res_deg;
        let ew: Vec<f64> = (0..grid.height)
            .map(|y| {
                let lat = (f64::from(y) + 0.5) * grid.res_deg - 90.0;
                ns * libm::cos(lat.to_radians())
            })
            .collect();
        let diag = ew
            .windows(2)
            .map(|pair| {
                let across = (pair[0] + pair[1]) / 2.0;
                (ns * ns + across * across).sqrt()
            })
            .collect::<Vec<f64>>();
        let metres = |m: f64| (m.round() as u32).max(1);
        let mut cities: Vec<CityCell> = scenario
            .cities
            .iter()
            .filter_map(|c| {
                let cell = grid.cell_at(c.lng, c.lat)? as Cell;
                Some(CityCell {
                    cell,
                    owner: c.owner_id,
                    pop: c.pop.max(0.0) as u64,
                    capital: c.is_capital,
                })
            })
            .collect();
        cities.sort_by_key(|c| (c.cell, c.owner));
        MapData {
            grid,
            land: scenario.land.iter().map(|&l| l != 0).collect(),
            cities,
            ns_m: metres(ns),
            ew_m: ew.into_iter().map(metres).collect(),
            diag_m: diag.into_iter().map(metres).collect(),
        }
    }

    /// A small made-up map for unit tests: 1° cells near the equator.
    #[cfg(test)]
    pub fn from_land(width: u32, height: u32, land: &[bool]) -> MapData {
        assert_eq!(land.len(), (width * height) as usize);
        let rows = height as usize;
        MapData {
            grid: Grid {
                width,
                height,
                res_deg: 1.0,
            },
            land: land.to_vec(),
            cities: Vec::new(),
            ns_m: 111_000,
            ew_m: vec![111_000; rows],
            diag_m: vec![157_000; rows.saturating_sub(1)],
        }
    }

    pub fn len(&self) -> usize {
        self.land.len()
    }

    pub fn is_land(&self, cell: Cell) -> bool {
        self.land.get(cell as usize).copied().unwrap_or(false)
    }

    pub fn is_city(&self, cell: Cell) -> bool {
        self.cities.binary_search_by_key(&cell, |c| c.cell).is_ok()
    }

    pub fn cities(&self) -> &[CityCell] {
        &self.cities
    }

    /// Column and row of a cell.
    pub fn xy(&self, cell: Cell) -> (i64, i64) {
        let width = i64::from(self.grid.width);
        (i64::from(cell) % width, i64::from(cell) / width)
    }

    /// The cell at a column and row; columns wrap, rows off the grid give `None`.
    pub fn cell(&self, x: i64, y: i64) -> Option<Cell> {
        let (width, height) = (i64::from(self.grid.width), i64::from(self.grid.height));
        (0..height)
            .contains(&y)
            .then(|| (y * width + x.rem_euclid(width)) as Cell)
    }

    /// Columns and rows from `from` to `to`, the short way round in longitude.
    pub fn offset(&self, from: Cell, to: Cell) -> (i64, i64) {
        let width = i64::from(self.grid.width);
        let ((x1, y1), (x2, y2)) = (self.xy(from), self.xy(to));
        let mut dx = x2 - x1;
        if dx > width / 2 {
            dx -= width;
        } else if dx < -width / 2 {
            dx += width;
        }
        (dx, y2 - y1)
    }

    /// The four side neighbours (west, east, south, north).
    pub fn sides(&self, cell: Cell) -> impl Iterator<Item = Cell> + '_ {
        let (x, y) = self.xy(cell);
        [(-1, 0), (1, 0), (0, -1), (0, 1)]
            .into_iter()
            .filter_map(move |(dx, dy)| self.cell(x + dx, y + dy))
    }

    /// All eight neighbours; longitude wraps, latitude does not.
    pub fn steps(&self, cell: Cell) -> impl Iterator<Item = Step> + '_ {
        let (x, y) = self.xy(cell);
        [
            (-1, 0),
            (1, 0),
            (0, -1),
            (0, 1),
            (-1, -1),
            (1, -1),
            (-1, 1),
            (1, 1),
        ]
        .into_iter()
        .filter_map(move |(dx, dy)| {
            let to = self.cell(x + dx, y + dy)?;
            let sides = if dx != 0 && dy != 0 {
                Some([self.cell(x + dx, y)?, self.cell(x, y + dy)?])
            } else {
                None
            };
            Some(Step { to, sides })
        })
    }

    /// Width (west to east) and height of a cell on row `y`, in metres.
    pub fn cell_size_m(&self, y: i64) -> (u32, u32) {
        (self.ew_m[y as usize], self.ns_m)
    }

    /// Metres between neighbouring cells.
    pub fn step_m(&self, from: Cell, to: Cell) -> u32 {
        let (dx, dy) = self.offset(from, to);
        let row = self.xy(from).1.min(self.xy(to).1) as usize;
        match (dx != 0, dy != 0) {
            (true, true) => self.diag_m[row],
            (false, true) => self.ns_m,
            _ => self.ew_m[row],
        }
    }

    /// A lower estimate of the travel distance in metres, for path finding.
    pub fn estimate_m(&self, from: Cell, to: Cell) -> u64 {
        let (dx, dy) = self.offset(from, to);
        let (y1, y2) = (self.xy(from).1 as usize, self.xy(to).1 as usize);
        let across = dx as f64 * f64::from(self.ew_m[y1].min(self.ew_m[y2]));
        let along = dy as f64 * f64::from(self.ns_m);
        (across * across + along * along).sqrt() as u64
    }

    /// Every land cell within `radius_m` of `centre`, with the squared distance in m².
    pub fn land_within(&self, centre: Cell, radius_m: f64, mut visit: impl FnMut(Cell, u64)) {
        let (cx, cy) = self.xy(centre);
        let rows = (radius_m / f64::from(self.ns_m)) as i64;
        for dy in -rows..=rows {
            let Some(row_start) = self.cell(0, cy + dy) else {
                continue;
            };
            let along = (dy * i64::from(self.ns_m)) as f64;
            let room = radius_m * radius_m - along * along;
            if room < 0.0 {
                continue;
            }
            let width = f64::from(self.ew_m[(cy + dy) as usize]);
            let cols = ((room.sqrt() / width) as i64).min(i64::from(self.grid.width) / 2);
            for dx in -cols..=cols {
                let cell = row_start + (cx + dx).rem_euclid(i64::from(self.grid.width)) as Cell;
                if self.is_land(cell) {
                    let across = dx as f64 * width;
                    visit(cell, (across * across + along * along) as u64);
                }
            }
        }
    }
}
