//! Marching: each hour a moving division walks `MARCH_M_PER_HOUR` metres
//! towards the next cell of its route, at most one cell per hour. Enemy-held
//! land is slower. A cell held by someone else's division blocks the way:
//! an enemy there is attacked (see `combat`), anyone else is waited for.

use crate::division::{Division, ENEMY_LAND_COST, MARCH_M_PER_HOUR};
use crate::map::Cell;
use crate::path;
use crate::world::{CountryId, Event, World};

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
            let cost = self.step_cost(country, here, next);
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

    /// Metres of marching it takes `country` to step from `from` to `to`.
    pub(crate) fn step_cost(&self, country: CountryId, from: Cell, to: Cell) -> u32 {
        let holder = self.control[to as usize];
        let enemy_land = holder != 0 && holder != country;
        self.map.step_m(from, to) * if enemy_land { ENEMY_LAND_COST } else { 1 }
    }

    /// Where a division is drawn, in degrees of longitude and latitude: the
    /// centre of its cell, moved towards the next cell of its route by the
    /// share of that step it has marched.
    pub fn location(&self, division: &Division) -> (f64, f64) {
        let grid = &self.map.grid;
        let (lng, lat) = grid.center(division.cell as usize);
        let Some(next) = division.next_cell() else {
            return (lng, lat);
        };
        let cost = self.step_cost(division.country, division.cell, next);
        let share = (f64::from(division.progress_m) / f64::from(cost)).min(1.0);
        let (dx, dy) = self.map.offset(division.cell, next);
        let lng = lng + dx as f64 * grid.res_deg * share;
        let lng = if lng >= 180.0 { lng - 360.0 } else { lng };
        (lng, lat + dy as f64 * grid.res_deg * share)
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
