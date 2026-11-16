//! Taking ground. A land cell changes hands when a division of a country at
//! war with its holder is within `CONTROL_RADIUS_M` and no division hostile
//! to that country is. Contested land stays as it is, so the front settles
//! between the two armies. The nearest division decides when several
//! non-hostile countries are close. The same rule liberates: the owner's
//! division retakes its land once the occupier has left. Whatever the land
//! around, a division holds the cell it stands on.

use crate::division::CONTROL_RADIUS_M;
use crate::map::Cell;
use crate::world::{CountryId, World};

impl World {
    pub(crate) fn take_ground(&mut self) {
        if !self.any_war() {
            return;
        }
        let at_war = self.countries_at_war();
        // (cell, squared distance, country) for every division near every cell.
        let mut near: Vec<(Cell, u64, CountryId)> = Vec::new();
        for division in &self.divisions {
            if at_war.contains(&division.country) {
                self.map
                    .land_within(division.cell, CONTROL_RADIUS_M, |cell, distance| {
                        near.push((cell, distance, division.country));
                    });
            }
        }
        near.sort_unstable();
        near.dedup();
        for group in near.chunk_by(|a, b| a.0 == b.0) {
            let (cell, _, nearest) = group[0];
            if group
                .iter()
                .any(|&(_, _, other)| self.at_war(other, nearest))
            {
                continue;
            }
            let holder = self.control[cell as usize];
            if holder != nearest && holder != 0 && self.at_war(nearest, holder) {
                self.set_control(cell, nearest);
            }
        }
        // Enemies never share a cell, so this cannot flip a cell back and forth.
        for index in 0..self.divisions.len() {
            let (cell, country) = (self.divisions[index].cell, self.divisions[index].country);
            let holder = self.control[cell as usize];
            if holder != country && holder != 0 && self.at_war(country, holder) {
                self.set_control(cell, country);
            }
        }
    }
}
