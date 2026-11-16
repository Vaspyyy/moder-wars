//! Marching: each hour a moving division walks `MARCH_M_PER_HOUR` metres
//! towards the next cell of its route, at most one cell per hour. Enemy-held
//! land is slower. A cell held by someone else's division blocks the way:
//! an enemy there is attacked (see `combat`), anyone else is waited for.

use crate::division::{ENEMY_LAND_COST, MARCH_M_PER_HOUR};
use crate::map::Cell;
use crate::path;
use crate::world::{Event, World};

impl World {
    pub(crate) fn march(&mut self, events: &mut Vec<Event>) {
        let mut occupancy = self.occupancy();
        for index in 0..self.divisions.len() {
            let division = &self.divisions[index];
            let Some(next) = division.next_cell() else {
                continue;
            };
            if division.in_battle {
                continue;
            }
            let (country, here) = (division.country, division.cell);
            let blocked = occupants(&occupancy, next)
                .iter()
                .any(|&(_, other)| self.divisions[other].country != country);
            if blocked {
                continue;
            }
            if !self.passable(country, next) {
                self.reroute(index, events);
                continue;
            }
            let holder = self.control[next as usize];
            let cost = self.map.step_m(here, next)
                * if holder != 0 && holder != country {
                    ENEMY_LAND_COST
                } else {
                    1
                };
            let division = &mut self.divisions[index];
            division.progress_m += MARCH_M_PER_HOUR;
            if division.progress_m < cost {
                continue;
            }
            division.progress_m = (division.progress_m - cost).min(MARCH_M_PER_HOUR);
            division.cell = next;
            division.path.pop();
            if division.path.is_empty() {
                division.progress_m = 0;
                events.push(Event::DivisionArrived {
                    division: division.id,
                });
            }
            let from = occupancy
                .binary_search(&(here, index))
                .expect("division is listed");
            occupancy.remove(from);
            let to = occupancy.partition_point(|&entry| entry < (next, index));
            occupancy.insert(to, (next, index));
        }
    }

    /// The next cell closed: find another route to the same target or stop.
    fn reroute(&mut self, index: usize, events: &mut Vec<Event>) {
        let division = &self.divisions[index];
        let (country, here) = (division.country, division.cell);
        let target = division.target().expect("a moving division has a target");
        let route = path::find(&self.map, here, target, |cell| self.passable(country, cell));
        let division = &mut self.divisions[index];
        division.progress_m = 0;
        match route {
            Some(route) => division.path = route,
            None => {
                division.path.clear();
                events.push(Event::MoveBlocked {
                    division: division.id,
                });
            }
        }
    }
}

/// The entries of a sorted occupancy list standing on `cell`.
pub(crate) fn occupants(occupancy: &[(Cell, usize)], cell: Cell) -> &[(Cell, usize)] {
    let start = occupancy.partition_point(|&(c, _)| c < cell);
    let end = occupancy.partition_point(|&(c, _)| c <= cell);
    &occupancy[start..end]
}
