//! Supply and upkeep.
//!
//! Once a day each country at war traces its supply: a division is supplied
//! when a path over land its country holds (side neighbours only) links it
//! to the country's supply source. The source is the capital while the
//! country holds it, otherwise the most populous of its own cities it still
//! holds. At peace every division counts as supplied.
//!
//! Every hour, divisions out of battle recover morale and equipment while
//! supplied; cut-off divisions lose morale, equipment and soldiers instead.

use std::collections::{BTreeMap, VecDeque};

use crate::division::{
    ATTACK_MORALE, COMBAT_WEAR, CUT_OFF_ATTRITION, CUT_OFF_EQUIPMENT, CUT_OFF_MORALE,
    EQUIPMENT_RECOVERY, Loss, MORALE_RECOVERY, RESUME_MORALE,
};
use crate::map::Cell;
use crate::world::{CountryId, Event, World};

impl World {
    pub(crate) fn check_supply(&mut self) {
        let at_war = self.countries_at_war();
        let mut by_country: BTreeMap<CountryId, Vec<usize>> = BTreeMap::new();
        for (index, division) in self.divisions.iter_mut().enumerate() {
            if at_war.contains(&division.country) {
                by_country.entry(division.country).or_default().push(index);
            } else {
                division.supplied = true;
            }
        }
        for (country, members) in by_country {
            let cells: Vec<Cell> = members.iter().map(|&i| self.divisions[i].cell).collect();
            let linked = match self.supply_source(country) {
                Some(source) => self.linked(country, source, &cells),
                None => vec![false; cells.len()],
            };
            for (&index, supplied) in members.iter().zip(linked) {
                self.divisions[index].supplied = supplied;
            }
        }
    }

    /// The capital while held, else the biggest own city still held.
    pub(crate) fn supply_source(&self, country: CountryId) -> Option<Cell> {
        let held = |cell: Cell| self.control[cell as usize] == country;
        let own = self
            .map
            .cities()
            .iter()
            .filter(|c| c.owner == country && held(c.cell));
        let mut best: Option<(bool, u64, std::cmp::Reverse<Cell>)> = None;
        for city in own {
            let key = (city.capital, city.pop, std::cmp::Reverse(city.cell));
            if best.is_none_or(|b| key > b) {
                best = Some(key);
            }
        }
        best.map(|(_, _, std::cmp::Reverse(cell))| cell)
    }

    /// Which of `targets` a walk over land held by `country` reaches from `source`.
    fn linked(&self, country: CountryId, source: Cell, targets: &[Cell]) -> Vec<bool> {
        let mut seen = vec![0u64; self.map.len().div_ceil(64)];
        let mark = |seen: &mut Vec<u64>, cell: Cell| {
            let (word, bit) = (cell as usize / 64, cell % 64);
            let fresh = seen[word] & (1 << bit) == 0;
            seen[word] |= 1 << bit;
            fresh
        };
        let is_seen = |seen: &[u64], cell: Cell| seen[cell as usize / 64] & (1 << (cell % 64)) != 0;
        let mut wanted: Vec<Cell> = targets.to_vec();
        wanted.sort_unstable();
        wanted.dedup();
        let mut missing = wanted.len();
        let mut queue = VecDeque::from([source]);
        mark(&mut seen, source);
        while let Some(cell) = queue.pop_front() {
            if wanted.binary_search(&cell).is_ok() {
                missing -= 1;
                if missing == 0 {
                    break;
                }
            }
            for next in self.map.sides(cell) {
                if self.map.is_land(next)
                    && self.control[next as usize] == country
                    && mark(&mut seen, next)
                {
                    queue.push_back(next);
                }
            }
        }
        targets.iter().map(|&cell| is_seen(&seen, cell)).collect()
    }

    pub(crate) fn upkeep(&mut self, events: &mut Vec<Event>) {
        let at_war = self.countries_at_war();
        let mut worn: Vec<(CountryId, u64)> = Vec::new();
        for index in 0..self.divisions.len() {
            let division = &self.divisions[index];
            let repairable =
                !division.in_battle && (division.supplied || !at_war.contains(&division.country));
            let wanted = EQUIPMENT_RECOVERY.min(1.0 - division.equipment);
            let repaired = if repairable && wanted > 0.0 {
                self.repair(index, wanted)
            } else {
                0.0
            };
            let division = &mut self.divisions[index];
            if division.in_battle {
                division.equipment = (division.equipment - COMBAT_WEAR).max(0.0);
            } else if repairable {
                division.morale = (division.morale + MORALE_RECOVERY).min(1.0);
                division.equipment = (division.equipment + repaired).min(1.0);
            } else {
                division.morale = (division.morale - CUT_OFF_MORALE).max(0.0);
                division.equipment = (division.equipment - CUT_OFF_EQUIPMENT).max(0.0);
                let lost = (f64::from(division.personnel) * CUT_OFF_ATTRITION).round() as u32;
                let lost = lost.max(1).min(division.personnel);
                division.personnel -= lost;
                worn.push((division.country, u64::from(lost)));
            }
            if division.morale < ATTACK_MORALE {
                division.resting = true;
            } else if division.morale >= RESUME_MORALE {
                division.resting = false;
            }
        }
        let broken_up: Vec<usize> = (0..self.divisions.len())
            .filter(|&i| self.divisions[i].broken_up())
            .collect();
        // The few left in a division too weak to fight are lost too.
        for &i in &broken_up {
            let division = &self.divisions[i];
            worn.push((division.country, u64::from(division.personnel)));
        }
        for (country, lost) in worn {
            self.count_losses(country, lost, 0);
        }
        self.remove_divisions(&broken_up, Loss::BrokenUp, events);
    }
}
