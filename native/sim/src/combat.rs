//! Combat: one model for every battle.
//!
//! A division whose next cell holds enemy divisions attacks that cell. A
//! division can attack and be attacked in the same hour; it then fights both
//! battles (so two divisions marching into each other both fight). Each
//! hour, per attacked cell, with A the attackers' power, D the defenders'
//! power and B the defence bonus (prepared positions, more in a city):
//!
//! - every defender loses `MORALE_LOSS_PER_HOUR * A / (D * B)` morale,
//!   every attacker `MORALE_LOSS_PER_HOUR * (D * B) / A`;
//! - the defenders lose `CASUALTIES_PER_HOUR * A / B` soldiers, the
//!   attackers `CASUALTIES_PER_HOUR * D * B`, shared by size;
//! - each side's numbers are scaled by its own luck, 0.8 to 1.2.
//!
//! Losing morale weakens a division, so a battle tips once it leans. A
//! defender that breaks falls back to a neighbouring cell of its own, away
//! from the attackers, or surrenders when there is none.
//!
//! Every soldier lost counts in the loser's war record, and the soldiers a
//! side puts out of action (or makes surrender) count for the countries on
//! the other side, each by its share of that side's power.

use crate::division::{
    BREAK_MORALE, CASUALTIES_PER_HOUR, CITY_BONUS, DEFENDER_BONUS, Loss, MORALE_LOSS_PER_HOUR,
};
use crate::map::Cell;
use crate::movement::occupants;
use crate::record::shares;
use crate::world::{CountryId, Event, World};

impl World {
    pub(crate) fn fight(&mut self, events: &mut Vec<Event>) {
        for division in &mut self.divisions {
            division.in_battle = false;
        }
        if !self.any_war() {
            return;
        }
        let occupancy = self.occupancy();
        let hostile_at = |cell: Cell, country| {
            occupants(&occupancy, cell)
                .iter()
                .any(|&(_, other)| self.at_war(country, self.divisions[other].country))
        };
        // Who attacks which cell.
        let mut attacks: Vec<(Cell, usize)> = self
            .divisions
            .iter()
            .enumerate()
            .filter(|(_, d)| !d.resting)
            .filter_map(|(i, d)| d.next_cell().map(|next| (next, i, d.country)))
            .filter(|&(next, _, country)| hostile_at(next, country))
            .map(|(next, i, _)| (next, i))
            .collect();
        if attacks.is_empty() {
            return;
        }
        attacks.sort_unstable();

        let mut broken = Vec::new();
        // Per battle: the attackers' power by country, to share out the
        // soldiers of a defender that surrenders.
        let mut attack_shares: Vec<Vec<(CountryId, f64)>> = Vec::new();
        for battle in attacks.chunk_by(|a, b| a.0 == b.0) {
            let cell = battle[0].0;
            let attackers: Vec<usize> = battle.iter().map(|&(_, i)| i).collect();
            let defenders: Vec<usize> = occupants(&occupancy, cell)
                .iter()
                .map(|&(_, i)| i)
                .collect();
            let bonus = DEFENDER_BONUS
                * if self.map.is_city(cell) {
                    CITY_BONUS
                } else {
                    1.0
                };
            let attack: f64 = attackers.iter().map(|&i| self.divisions[i].power()).sum();
            let defence = defenders
                .iter()
                .map(|&i| self.divisions[i].power())
                .sum::<f64>()
                * bonus;
            let attack_luck = 0.8 + 0.4 * self.rng.next_f64();
            let defence_luck = 0.8 + 0.4 * self.rng.next_f64();
            let odds = (attack / defence.max(1.0)).clamp(0.05, 20.0);
            let attack_by = self.power_by_country(&attackers);
            let defence_by = self.power_by_country(&defenders);
            let defenders_lost = self.hit(
                &defenders,
                MORALE_LOSS_PER_HOUR * odds * attack_luck,
                CASUALTIES_PER_HOUR * attack * attack_luck / bonus,
            );
            let attackers_lost = self.hit(
                &attackers,
                MORALE_LOSS_PER_HOUR / odds * defence_luck,
                CASUALTIES_PER_HOUR * defence * defence_luck,
            );
            self.count_battle(&defenders_lost, &attack_by);
            self.count_battle(&attackers_lost, &defence_by);
            // Direction the attack comes from, to fall back the other way.
            let (mut from_x, mut from_y) = (0, 0);
            for &i in &attackers {
                let (dx, dy) = self.map.offset(cell, self.divisions[i].cell);
                (from_x, from_y) = (from_x + dx, from_y + dy);
            }
            for &i in &defenders {
                if self.divisions[i].morale < BREAK_MORALE {
                    broken.push((i, (from_x, from_y), attack_shares.len()));
                }
            }
            attack_shares.push(attack_by);
        }

        let mut surrendered = Vec::new();
        for (index, attack_from, battle) in broken {
            match self.fallback_cell(index, attack_from, &occupancy) {
                Some(to) => {
                    let division = &mut self.divisions[index];
                    events.push(Event::DivisionRetreated {
                        division: division.id,
                        from: division.cell,
                        to,
                    });
                    division.cell = to;
                    division.path.clear();
                    division.progress_m = 0;
                }
                None => {
                    let division = &self.divisions[index];
                    let soldiers = [(division.country, u64::from(division.personnel))];
                    self.count_battle(&soldiers, &attack_shares[battle]);
                    surrendered.push(index);
                }
            }
        }
        self.remove_divisions(&surrendered, Loss::Surrendered, events);
    }

    /// Take morale and soldiers from a side, soldiers shared by size.
    /// Returns the soldiers lost, by country.
    fn hit(&mut self, side: &[usize], morale: f64, casualties: f64) -> Vec<(CountryId, u64)> {
        let soldiers: f64 = side
            .iter()
            .map(|&i| f64::from(self.divisions[i].personnel))
            .sum();
        let mut lost_by: Vec<(CountryId, u64)> = Vec::new();
        for &i in side {
            let division = &mut self.divisions[i];
            division.in_battle = true;
            division.morale = (f64::from(division.morale) - morale).max(0.0) as f32;
            let share = f64::from(division.personnel) / soldiers.max(1.0);
            let lost = ((casualties * share).round() as u32).min(division.personnel);
            division.personnel -= lost;
            match lost_by.iter_mut().find(|(c, _)| *c == division.country) {
                Some((_, sum)) => *sum += u64::from(lost),
                None => lost_by.push((division.country, u64::from(lost))),
            }
        }
        lost_by
    }

    /// The power of a side's divisions, by country.
    fn power_by_country(&self, side: &[usize]) -> Vec<(CountryId, f64)> {
        let mut by: Vec<(CountryId, f64)> = Vec::new();
        for &i in side {
            let division = &self.divisions[i];
            match by.iter_mut().find(|(c, _)| *c == division.country) {
                Some((_, power)) => *power += division.power(),
                None => by.push((division.country, division.power())),
            }
        }
        by
    }

    /// Soldiers one side lost (by country) go in their records, and the
    /// countries of the other side share them out by power (`by`).
    fn count_battle(&mut self, lost: &[(CountryId, u64)], by: &[(CountryId, f64)]) {
        let total: u64 = lost.iter().map(|&(_, n)| n).sum();
        for &(country, n) in lost {
            self.count_losses(country, n, 0);
        }
        for (country, n) in shares(total, by) {
            self.count_losses(country, 0, n);
        }
    }

    /// A neighbouring cell the division's own country holds, free of enemies,
    /// as far as possible from where the attack comes from.
    fn fallback_cell(
        &self,
        index: usize,
        attack_from: (i64, i64),
        occupancy: &[(Cell, usize)],
    ) -> Option<Cell> {
        let division = &self.divisions[index];
        let country = division.country;
        self.map
            .steps(division.cell)
            .map(|step| step.to)
            .filter(|&cell| self.map.is_land(cell) && self.control[cell as usize] == country)
            .filter(|&cell| {
                occupants(occupancy, cell)
                    .iter()
                    .all(|&(_, other)| !self.at_war(country, self.divisions[other].country))
            })
            .min_by_key(|&cell| {
                let (dx, dy) = self.map.offset(division.cell, cell);
                (dx * attack_from.0 + dy * attack_from.1, cell)
            })
    }

    /// Remove divisions (by index) and report them.
    pub(crate) fn remove_divisions(
        &mut self,
        indices: &[usize],
        cause: Loss,
        events: &mut Vec<Event>,
    ) {
        if indices.is_empty() {
            return;
        }
        let mut gone = vec![false; self.divisions.len()];
        for &i in indices {
            gone[i] = true;
            let division = &self.divisions[i];
            events.push(Event::DivisionDestroyed {
                division: division.id,
                country: division.country,
                cause,
            });
        }
        let mut index = 0;
        self.divisions.retain(|_| {
            index += 1;
            !gone[index - 1]
        });
        for group in &mut self.groups {
            group
                .divisions
                .retain(|&id| self.divisions.binary_search_by_key(&id, |d| d.id).is_ok());
        }
    }
}
