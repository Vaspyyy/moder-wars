//! Shortest land routes between cells (A* over the eight neighbours, costs in
//! metres). Ties break by cell index, so a route never depends on hashing.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

use crate::map::{Cell, MapData};

/// Give up after settling this many cells (a route across all of Russia
/// settles far fewer when it exists).
const MAX_SETTLED: usize = 400_000;

/// The cells to walk from `from` to `to`, next step last; empty when already
/// there. `open` says which cells may be entered.
pub(crate) fn find(
    map: &MapData,
    from: Cell,
    to: Cell,
    open: impl Fn(Cell) -> bool,
) -> Option<Vec<Cell>> {
    find_within(map, from, to, open, MAX_SETTLED)
}

/// Like `find`, but gives up after settling `max_settled` cells.
pub(crate) fn find_within(
    map: &MapData,
    from: Cell,
    to: Cell,
    open: impl Fn(Cell) -> bool,
    max_settled: usize,
) -> Option<Vec<Cell>> {
    if from == to {
        return Some(Vec::new());
    }
    if !open(to) {
        return None;
    }
    // cell -> (metres from the start, previous cell)
    let mut best: HashMap<Cell, (u64, Cell)> = HashMap::new();
    let mut queue = BinaryHeap::new();
    best.insert(from, (0, from));
    queue.push(Reverse((map.estimate_m(from, to), 0u64, from)));
    let mut settled = 0;
    while let Some(Reverse((_, walked, cell))) = queue.pop() {
        if cell == to {
            let mut path = Vec::new();
            let mut at = to;
            while at != from {
                path.push(at);
                at = best[&at].1;
            }
            return Some(path);
        }
        if walked > best[&cell].0 {
            continue;
        }
        settled += 1;
        if settled > max_settled {
            return None;
        }
        for step in map.steps(cell) {
            if !open(step.to)
                || step
                    .sides
                    .is_some_and(|sides| !sides.into_iter().all(&open))
            {
                continue;
            }
            let next = walked + u64::from(map.step_m(cell, step.to));
            if best.get(&step.to).is_none_or(|&(known, _)| next < known) {
                best.insert(step.to, (next, cell));
                queue.push(Reverse((next + map.estimate_m(step.to, to), next, step.to)));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 4 x 3 map, row 0 at the bottom:
    ///
    /// ```text
    /// row 2:  . . . .
    /// row 1:  . . # .     # land, . water
    /// row 0:  . # . .
    /// ```
    ///
    /// The two land cells touch only at a corner.
    #[test]
    fn a_route_never_slips_between_two_cells_that_meet_at_a_corner() {
        let land = [
            false, true, false, false, //
            false, false, true, false, //
            false, false, false, false,
        ];
        let map = MapData::from_land(4, 3, &land);
        assert_eq!(find(&map, 1, 6, |cell| map.is_land(cell)), None);
        // Open one side cell and the route goes round through it.
        let open = |cell: Cell| map.is_land(cell) || cell == 2;
        assert_eq!(find(&map, 1, 6, open), Some(vec![6, 2]));
        // With both sides open, the diagonal is the short way.
        let open = |cell: Cell| map.is_land(cell) || cell == 2 || cell == 5;
        assert_eq!(find(&map, 1, 6, open), Some(vec![6]));
    }
}
