//! Where two countries' land meets.

use crate::map::Cell;
use crate::world::{CountryId, World};

impl World {
    /// Land held by `own` with a side neighbour on land held by `other`,
    /// sorted.
    pub fn border_cells(&self, own: CountryId, other: CountryId) -> Vec<Cell> {
        (0..self.map.len() as Cell)
            .filter(|&cell| self.is_contact(cell, own, other))
            .collect()
    }

    /// Whether `cell` is land held by `country`.
    pub(crate) fn held(&self, cell: Cell, country: CountryId) -> bool {
        self.map.is_land(cell) && self.control[cell as usize] == country
    }

    /// Land held by `own` with a side neighbour on land held by `other`.
    pub(crate) fn is_contact(&self, cell: Cell, own: CountryId, other: CountryId) -> bool {
        self.held(cell, own) && self.map.sides(cell).any(|n| self.held(n, other))
    }

    /// The land cell nearest to `centre`, within `radius_m`, that passes
    /// `test`. Ties go to the lower cell number.
    pub(crate) fn nearest(
        &self,
        centre: Cell,
        radius_m: f64,
        test: impl Fn(Cell) -> bool,
    ) -> Option<Cell> {
        let mut best: Option<(u64, Cell)> = None;
        self.map.land_within(centre, radius_m, |cell, distance| {
            if best.is_none_or(|b| (distance, cell) < b) && test(cell) {
                best = Some((distance, cell));
            }
        });
        best.map(|(_, cell)| cell)
    }
}
