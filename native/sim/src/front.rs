//! Where two countries' land meets.

use crate::map::{Cell, MapData};
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

/// Border cells in an order that walks along the border: start at one end,
/// then always go to the nearest cell not visited yet.
pub(crate) fn chain(map: &MapData, cells: &[Cell]) -> Vec<Cell> {
    let Some(&first) = cells.first() else {
        return Vec::new();
    };
    let end = cells
        .iter()
        .copied()
        .max_by_key(|&c| (map.estimate_m(first, c), std::cmp::Reverse(c)))
        .unwrap_or(first);
    let mut left: Vec<Cell> = cells.iter().copied().filter(|&c| c != end).collect();
    let mut walk = vec![end];
    while !left.is_empty() {
        let here = walk[walk.len() - 1];
        let (at, _) = left
            .iter()
            .enumerate()
            .min_by_key(|&(_, &c)| (map.estimate_m(here, c), c))
            .expect("cells left");
        walk.push(left.swap_remove(at));
    }
    walk
}

/// Up to `count` cells of `line`, spread as evenly as possible: each next
/// pick is the cell farthest from all cells picked so far.
pub(crate) fn spread(map: &MapData, line: &[Cell], count: usize) -> Vec<Cell> {
    spread_by(map, line, count, |_| 1)
}

/// Like `spread`, but cells with more `weight` get picks closer together:
/// each next pick is the cell whose distance to the nearest pick, times its
/// weight, is largest. Spacing ends up about inversely proportional to the
/// weight.
pub(crate) fn spread_by(
    map: &MapData,
    line: &[Cell],
    count: usize,
    weight: impl Fn(Cell) -> u64,
) -> Vec<Cell> {
    let Some(&first) = line.first() else {
        return Vec::new();
    };
    let weights: Vec<u64> = line.iter().map(|&c| weight(c).max(1)).collect();
    // Start at one end: the cell farthest (by weight) from an arbitrary one.
    let (start, _) = line
        .iter()
        .zip(&weights)
        .max_by_key(|&(&cell, &w)| (map.estimate_m(first, cell) * w, std::cmp::Reverse(cell)))
        .expect("line is not empty");
    let start = *start;
    let mut picked = vec![start];
    let mut nearest: Vec<u64> = line.iter().map(|&c| map.estimate_m(start, c)).collect();
    while picked.len() < count.min(line.len()) {
        let (at, _) = nearest
            .iter()
            .zip(&weights)
            .enumerate()
            .max_by_key(|&(i, (&d, &w))| (d * w, std::cmp::Reverse(line[i])))
            .expect("line is not empty");
        let next = line[at];
        picked.push(next);
        for (d, &cell) in nearest.iter_mut().zip(line) {
            *d = (*d).min(map.estimate_m(next, cell));
        }
    }
    picked
}
