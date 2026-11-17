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
//! stays with the people (the home front, which keeps up war support). The
//! recruiting fund raises divisions at the country's supply source while
//! manpower lasts; the equipment fund equips them and repairs worn
//! divisions. Mobilization sets how much of the population may serve and
//! what that costs in output.

use serde::{Deserialize, Serialize};

use crate::map::Cell;
use crate::support::FULL_SUPPORT;
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
    /// War support, per mille (see `support.rs`).
    pub support: u16,
    /// Soldiers lost so far, as war support last counted them.
    pub(crate) casualties: u64,
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
            support: FULL_SUPPORT,
            casualties: 0,
        }
    }

    /// The share of income left to the people, in percent.
    pub fn home_front(&self) -> u8 {
        100 - self.budget.recruiting - self.budget.equipment
    }

    /// Thousands of dollars a day after mobilization costs.
    pub fn income_k(&self) -> i64 {
        let loss = OUTPUT_LOSS_PERCENT[usize::from(self.mobilization.min(3))];
        self.output_k * (100 - loss) / 100
    }

    /// People who may serve at this mobilization level, drafted or not.
    pub fn may_serve(&self) -> u64 {
        self.population * SERVE_PER_MILLE[usize::from(self.mobilization.min(3))] / 1000
    }

    /// People who may still be drafted at this mobilization level: none
    /// once more serve than the level allows.
    pub fn manpower(&self) -> u64 {
        self.may_serve().saturating_sub(self.drafted)
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
        // Country id -> index, without a search per cell.
        let top = self.countries.last().map_or(0, |c| usize::from(c.id));
        let mut slots = vec![usize::MAX; top + 1];
        for (index, country) in self.countries.iter().enumerate() {
            slots[usize::from(country.id)] = index;
        }
        let slot = |id: CountryId| {
            slots
                .get(usize::from(id))
                .copied()
                .filter(|&index| index != usize::MAX && id != 0)
        };
        {
            let law = self.law_of();
            // The same sums as `earns_k` and `set_control`, in one pass.
            for (cell, value) in self.map.land_values() {
                let (holder, owner) = (self.control[cell as usize], law(cell));
                if let Some(index) = slot(holder) {
                    let earned = if owner == holder {
                        value
                    } else {
                        value * OCCUPIED_PERCENT / 100
                    };
                    output[index] += earned as i64;
                }
                if let Some(index) = slot(owner) {
                    home_total[index] += value as i64;
                    if holder == owner {
                        home[index] += value as i64;
                    }
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

    /// The daily payday: income into the funds (puppets pay tribute first),
    /// then recruitment.
    pub(crate) fn run_economy(&mut self, events: &mut Vec<Event>) {
        // A puppet pays its overlord a share of its income first.
        let mut income: Vec<i64> = self
            .countries
            .iter()
            .map(|c| c.economy.income_k().max(0))
            .collect();
        for index in 0..self.countries.len() {
            if let Some(overlord) = self.countries[index].overlord
                && let Some(to) = self.index_of(overlord)
            {
                let tribute = World::tribute_k(income[index]);
                income[index] -= tribute;
                income[to] += tribute;
            }
        }
        for (index, &income) in income.iter().enumerate() {
            let economy = &mut self.countries[index].economy;
            economy.recruit_fund_k += income * i64::from(economy.budget.recruiting) / 100;
            economy.equipment_k += income * i64::from(economy.budget.equipment) / 100;
            self.recruit(index, events);
        }
    }

    /// What `country` pays its overlord a day (negative) or gets from its
    /// puppets (positive), thousands of dollars.
    pub fn tribute_today_k(&self, country: CountryId) -> i64 {
        let paid = self.overlord(country).map_or(0, |_| {
            World::tribute_k(self.economy(country).map_or(0, |e| e.income_k()))
        });
        let got: i64 = self
            .puppets(country)
            .into_iter()
            .map(|p| World::tribute_k(self.economy(p).map_or(0, |e| e.income_k())))
            .sum();
        got - paid
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
            let record = &mut self.countries[index].record;
            record.total.raised += 1;
            record.war.raised += 1;
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
