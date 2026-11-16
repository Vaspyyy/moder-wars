//! Economy and manpower.
//!
//! Land produces money: each country's GDP is spread over the land it owns
//! by law (see `map::spread_output`), and whoever holds a cell gets its
//! output, half of it when the cell is occupied land. Land keeps what it
//! produces when a peace hands it to a new owner by law. Money is counted in
//! thousands of dollars ("k"), in whole numbers, so it adds up the same way
//! on every machine.
//!
//! Once a day each country's income (output less what mobilization costs)
//! goes by its budget into a recruiting fund and an equipment fund; the rest
//! stays in the civilian economy. The recruiting fund raises divisions at
//! the country's supply source while manpower lasts; the equipment fund
//! equips them and repairs worn divisions. Mobilization sets how much of the
//! population may serve and what that costs in output.

use serde::{Deserialize, Serialize};

use crate::map::Cell;
use crate::world::{CountryId, Event, World};

/// Soldiers in a recruited division.
pub const DIVISION_SIZE: u32 = 10_000;
/// Raising a division: one billion dollars.
pub const DIVISION_COST_K: i64 = 1_000_000;
/// Equipping a division in full: one billion dollars.
pub const DIVISION_EQUIPMENT_K: i64 = 1_000_000;
/// At most this many divisions are raised per country per day.
pub const RECRUITS_PER_DAY: usize = 2;
/// Per mobilization level: share of the population that may serve
/// (per mille), and the share of output it costs (percent).
pub const SERVE_PER_MILLE: [u64; 4] = [5, 15, 40, 80];
pub const OUTPUT_LOSS_PERCENT: [i64; 4] = [0, 5, 15, 30];
/// Occupied land pays its occupier this share of its output.
pub const OCCUPIED_PERCENT: u64 = 50;

/// Shares of income, in percent; together at most 100.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Budget {
    pub recruiting: u8,
    pub equipment: u8,
}

/// Peacetime: no recruiting, a tenth of income for equipment upkeep.
pub const DEFAULT_BUDGET: Budget = Budget {
    recruiting: 0,
    equipment: 10,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Economy {
    pub population: u64,
    /// Output of the land the country holds, thousands of dollars a day,
    /// before mobilization costs.
    pub output_k: i64,
    pub budget: Budget,
    /// 0 (peacetime) to 3 (total mobilization).
    pub mobilization: u8,
    pub recruit_fund_k: i64,
    pub equipment_k: i64,
    /// Soldiers ever put into divisions; losses do not come back.
    pub drafted: u64,
    /// What the country's own land (by law) produces, and the part of it
    /// the country still holds; thousands of dollars a day.
    pub home_total_k: i64,
    pub home_k: i64,
}

impl Economy {
    pub(crate) fn new(population: u64) -> Economy {
        Economy {
            population,
            output_k: 0,
            budget: DEFAULT_BUDGET,
            mobilization: 0,
            recruit_fund_k: 0,
            equipment_k: 0,
            drafted: 0,
            home_total_k: 0,
            home_k: 0,
        }
    }

    /// Thousands of dollars a day after mobilization costs.
    pub fn income_k(&self) -> i64 {
        let loss = OUTPUT_LOSS_PERCENT[usize::from(self.mobilization.min(3))];
        self.output_k * (100 - loss) / 100
    }

    /// People who may still be drafted at this mobilization level.
    pub fn manpower(&self) -> u64 {
        let share = SERVE_PER_MILLE[usize::from(self.mobilization.min(3))];
        (self.population * share / 1000).saturating_sub(self.drafted)
    }
}

impl World {
    /// What `holder` earns from `cell` per day, thousands of dollars.
    pub(crate) fn earns_k(&self, holder: CountryId, cell: Cell) -> i64 {
        if holder == 0 {
            return 0;
        }
        let full = self.map.value_k(cell);
        let earned = if self.owner_by_law(cell) == holder {
            full
        } else {
            full * OCCUPIED_PERCENT / 100
        };
        earned as i64
    }

    /// Every country's output from the land it holds, and from its own
    /// land, counted from scratch.
    pub(crate) fn count_output(&mut self) {
        let count = self.countries.len();
        let (mut output, mut home_total, mut home) =
            (vec![0i64; count], vec![0i64; count], vec![0i64; count]);
        for cell in 0..self.map.len() as Cell {
            let holder = self.control[cell as usize];
            if let Some(index) = self.index_of(holder) {
                output[index] += self.earns_k(holder, cell);
            }
            let owner = self.owner_by_law(cell);
            if let Some(index) = self.index_of(owner) {
                let value = self.map.value_k(cell) as i64;
                home_total[index] += value;
                if holder == owner {
                    home[index] += value;
                }
            }
        }
        for (i, country) in self.countries.iter_mut().enumerate() {
            country.economy.output_k = output[i];
            country.economy.home_total_k = home_total[i];
            country.economy.home_k = home[i];
        }
    }

    /// Hand a cell to `to`, moving its output with it.
    pub(crate) fn set_control(&mut self, cell: Cell, to: CountryId) {
        let from = self.control[cell as usize];
        if from == to {
            return;
        }
        let (lost, gained) = (self.earns_k(from, cell), self.earns_k(to, cell));
        let owner = self.owner_by_law(cell);
        let value = self.map.value_k(cell) as i64;
        if let Some(index) = self.index_of(from) {
            let economy = &mut self.countries[index].economy;
            economy.output_k -= lost;
            if owner == from {
                economy.home_k -= value;
            }
        }
        if let Some(index) = self.index_of(to) {
            let economy = &mut self.countries[index].economy;
            economy.output_k += gained;
            if owner == to {
                economy.home_k += value;
            }
        }
        self.control[cell as usize] = to;
    }

    /// The daily payday: income into the funds, then recruitment.
    pub(crate) fn run_economy(&mut self, events: &mut Vec<Event>) {
        for index in 0..self.countries.len() {
            let economy = &mut self.countries[index].economy;
            let income = economy.income_k().max(0);
            economy.recruit_fund_k += income * i64::from(economy.budget.recruiting) / 100;
            economy.equipment_k += income * i64::from(economy.budget.equipment) / 100;
            self.recruit(index, events);
        }
    }

    fn recruit(&mut self, index: usize, events: &mut Vec<Event>) {
        let country = self.countries[index].id;
        let Some(home) = self.supply_source(country) else {
            return;
        };
        for _ in 0..RECRUITS_PER_DAY {
            let economy = &self.countries[index].economy;
            if economy.recruit_fund_k < DIVISION_COST_K
                || economy.manpower() < u64::from(DIVISION_SIZE)
            {
                return;
            }
            let division = self
                .spawn_division(country, home, DIVISION_SIZE)
                .expect("a supply source is held land");
            let economy = &mut self.countries[index].economy;
            economy.recruit_fund_k -= DIVISION_COST_K;
            let equipment = economy.equipment_k.min(DIVISION_EQUIPMENT_K);
            economy.equipment_k -= equipment;
            let at = self.division_index(division).expect("just raised");
            self.divisions[at].equipment = equipment as f32 / DIVISION_EQUIPMENT_K as f32;
            events.push(Event::DivisionRecruited { division, country });
        }
    }

    /// Repair a division's equipment by up to `amount`, as far as its
    /// country's equipment fund pays. Returns the repair made.
    pub(crate) fn repair(&mut self, division: usize, amount: f32) -> f32 {
        let country = self.divisions[division].country;
        let Some(index) = self.index_of(country) else {
            return 0.0;
        };
        let fund = &mut self.countries[index].economy.equipment_k;
        let wanted = (f64::from(amount) * DIVISION_EQUIPMENT_K as f64).ceil() as i64;
        let paid = wanted.min(*fund).max(0);
        *fund -= paid;
        if paid == wanted {
            amount
        } else {
            (paid as f64 / DIVISION_EQUIPMENT_K as f64) as f32
        }
    }
}
