//! Where two countries' land meets.

use crate::map::Cell;
use crate::world::{CountryId, World};

impl World {
    /// Land held by `own` with a side neighbour on land held by `other`,
    /// sorted.
    pub fn border_cells(&self, own: CountryId, other: CountryId) -> Vec<Cell> {
        let held =
            |cell: Cell, by: CountryId| self.control[cell as usize] == by && self.map.is_land(cell);
        (0..self.map.len() as Cell)
            .filter(|&cell| held(cell, own) && self.map.sides(cell).any(|n| held(n, other)))
            .collect()
    }
}
