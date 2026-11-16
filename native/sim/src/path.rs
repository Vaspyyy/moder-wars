//! Shortest land routes between cells (A* over the eight neighbours, costs in
//! metres). Ties break by cell index, so a route never depends on hashing.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::hash::{BuildHasherDefault, Hasher};

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
    // A neighbour is one step away (a diagonal one only between open cells).
    if let Some(step) = map.steps(from).find(|s| s.to == to)
        && step
            .sides
            .is_none_or(|sides| sides.iter().all(|&c| open(c)))
    {
        return Some(vec![to]);
    }
    // cell -> (metres from the start, previous cell)
    let mut best: CellMap<(u64, Cell)> = CellMap::with_capacity_and_hasher(256, Default::default());
    let mut queue = BinaryHeap::new();
    best.insert(from, (0, from));
    queue.push(Reverse((map.chord_m(from, to), 0u64, from)));
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
                queue.push(Reverse((next + map.chord_m(step.to, to), next, step.to)));
            }
        }
    }
    None
}

/// Routes from each of `starts` to the nearest of `goals`, over cells that
/// pass `open`, from one search spreading out from all goals at once. Each
/// route is like one from `find` (next step last); `None` for a start no
/// goal can be reached from.
pub(crate) fn routes_to_nearest(
    map: &MapData,
    goals: &[Cell],
    starts: &[Cell],
    open: impl Fn(Cell) -> bool,
) -> Vec<Option<Vec<Cell>>> {
    // cell -> (metres to the nearest goal, next cell towards it)
    let mut toward: CellMap<(u64, Cell)> = CellMap::default();
    let mut queue = BinaryHeap::new();
    for &goal in goals {
        if open(goal) && !toward.contains_key(&goal) {
            toward.insert(goal, (0, goal));
            queue.push(Reverse((0u64, goal)));
        }
    }
    let mut waiting: CellMap<()> = starts.iter().map(|&s| (s, ())).collect();
    while let Some(Reverse((metres, cell))) = queue.pop() {
        if metres > toward[&cell].0 {
            continue;
        }
        if waiting.remove(&cell).is_some() && waiting.is_empty() {
            break;
        }
        for step in map.steps(cell) {
            if !open(step.to)
                || step
                    .sides
                    .is_some_and(|sides| !sides.into_iter().all(&open))
            {
                continue;
            }
            let next = metres + u64::from(map.step_m(cell, step.to));
            if toward.get(&step.to).is_none_or(|&(known, _)| next < known) {
                toward.insert(step.to, (next, cell));
                queue.push(Reverse((next, step.to)));
            }
        }
    }
    starts
        .iter()
        .map(|&start| {
            if waiting.contains_key(&start) || !toward.contains_key(&start) {
                return None;
            }
            let mut walk = Vec::new();
            let mut at = start;
            while toward[&at].1 != at {
                at = toward[&at].1;
                walk.push(at);
            }
            walk.reverse();
            Some(walk)
        })
        .collect()
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

    /// A 6 x 1 strip, two islands (longitude wraps, so the last cell is
    /// water too):
    ///
    /// ```text
    /// row 0:  # # . # # .
    /// ```
    #[test]
    fn routes_lead_to_the_nearest_goal_or_nowhere() {
        let land = [true, true, false, true, true, false];
        let map = MapData::from_land(6, 1, &land);
        let open = |cell: Cell| map.is_land(cell);
        let routes = routes_to_nearest(&map, &[0], &[1, 0, 4], open);
        assert_eq!(routes, vec![Some(vec![0]), Some(vec![]), None]);
        let routes = routes_to_nearest(&map, &[0, 4], &[1, 3], open);
        assert_eq!(routes, vec![Some(vec![0]), Some(vec![4])]);
    }
}

/// A quick hash for cell numbers. The table is only looked up, never walked
/// in order, so the hash cannot change a route.
#[derive(Default)]
struct CellHasher(u64);

impl Hasher for CellHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            self.0 = (self.0.rotate_left(8) ^ u64::from(byte)).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        }
    }

    fn write_u32(&mut self, n: u32) {
        self.0 = u64::from(n).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }
}

type CellMap<V> = HashMap<Cell, V, BuildHasherDefault<CellHasher>>;
