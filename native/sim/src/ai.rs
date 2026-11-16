//! The AI: plays a country with exactly the commands a player has.
//!
//! Each AI country thinks once a day, at its own hour (countries take
//! turns, so they never all think in the same tick). At peace it keeps a
//! peacetime budget. At war it:
//!
//! - switches to a war budget and mobilizes (further once it has lost a
//!   quarter of its land);
//! - keeps one army group per enemy it borders, with a front along that
//!   border, and puts new divisions into the group under most pressure;
//! - draws an arrow towards an enemy's capital when its group is clearly
//!   stronger than the enemy divisions near the front, and takes it away
//!   when it no longer is;
//! - accepts peace when it is losing or its war support is low, refuses
//!   otherwise, and asks for peace once it has lost a quarter of its land
//!   or its war support runs lower still.
//!
//! Its orders are queued and applied like anyone's, so a replay of the
//! player's orders replays the AI too.

use std::collections::BTreeSet;

use crate::army::ArmyGroup;
use crate::division::DivisionId;
use crate::economy::{Budget, DEFAULT_BUDGET};
use crate::front::chain;
use crate::map::Cell;
use crate::world::{Command, Controller, CountryId, Event, Order, World};

const WAR_BUDGET: Budget = Budget {
    recruiting: 25,
    equipment: 15,
};
/// Attack when a group is this many times stronger than the enemy near its
/// front; stop below `STOP_RATIO`.
const ATTACK_RATIO: f64 = 1.5;
const STOP_RATIO: f64 = 0.9;
/// Enemy divisions this close to a front count against it.
const NEAR_FRONT_M: u64 = 150_000;
/// Share of its own land lost before it mobilizes further and asks for peace.
const HARD_PRESSED: f64 = 0.25;
/// It accepts peace once it has lost this share of its land, or when it is
/// weaker than this share of the enemy.
const ACCEPT_LOST: f64 = 0.2;
const ACCEPT_POWER: f64 = 0.7;
/// War support (per mille) below which it accepts peace, and below which
/// it asks for it.
const ACCEPT_SUPPORT: u16 = 400;
const ASK_SUPPORT: u16 = 300;
/// The most points the AI draws a front with.
const FRONT_POINTS: usize = 40;
/// Looking for a border it does not have is retried this often (days).
const BORDER_RETRY_DAYS: u64 = 7;

impl World {
    /// Let the AI countries whose hour it is think, and apply their orders.
    /// Returns whether army groups need a new plan.
    pub(crate) fn run_ai(&mut self, events: &mut Vec<Event>) -> bool {
        let tick = self.tick();
        let due: Vec<CountryId> = self
            .countries
            .iter()
            .filter(|c| {
                c.controller == Controller::Ai && (tick + u64::from(c.id)).is_multiple_of(24)
            })
            .map(|c| c.id)
            .collect();
        if due.is_empty() {
            return false;
        }
        for country in due {
            for command in self.think(country) {
                self.submit(Order {
                    tick,
                    country,
                    command,
                })
                .expect("orders for the current tick are accepted");
            }
        }
        self.apply_due(events)
    }

    fn think(&self, country: CountryId) -> Vec<Command> {
        let mut orders = Vec::new();
        let Some(economy) = self.economy(country) else {
            return orders;
        };
        let enemies: Vec<CountryId> = self
            .countries
            .iter()
            .map(|c| c.id)
            .filter(|&other| self.at_war(country, other))
            .collect();
        let lost = if economy.home_total_k > 0 {
            1.0 - economy.home_k as f64 / economy.home_total_k as f64
        } else {
            0.0
        };
        let at_war = !enemies.is_empty();
        let budget = if at_war { WAR_BUDGET } else { DEFAULT_BUDGET };
        if economy.budget != budget {
            orders.push(Command::SetBudget {
                recruiting: budget.recruiting,
                equipment: budget.equipment,
            });
        }
        let mobilization = match (at_war, lost >= HARD_PRESSED) {
            (false, _) => 0,
            (true, false) => economy.mobilization.max(1),
            (true, true) => economy.mobilization.max(2),
        };
        if economy.mobilization != mobilization {
            orders.push(Command::SetMobilization {
                level: mobilization,
            });
        }
        if !at_war {
            return orders;
        }
        self.think_peace(country, &enemies, lost, economy.support, &mut orders);
        self.think_armies(country, &enemies, &mut orders);
        orders
    }

    fn power_of(&self, country: CountryId) -> f64 {
        self.divisions
            .iter()
            .filter(|d| d.country == country)
            .map(|d| d.power())
            .sum()
    }

    fn think_peace(
        &self,
        country: CountryId,
        enemies: &[CountryId],
        lost: f64,
        support: u16,
        orders: &mut Vec<Command>,
    ) {
        let own = self.power_of(country);
        for offer in self.offers.iter().filter(|o| o.to == country) {
            let losing = lost >= ACCEPT_LOST
                || own < ACCEPT_POWER * self.power_of(offer.from)
                || support < ACCEPT_SUPPORT;
            orders.push(Command::AnswerPeace {
                from: offer.from,
                accept: losing,
            });
        }
        if lost >= HARD_PRESSED || support < ASK_SUPPORT {
            for &enemy in enemies {
                let open = self.offers.iter().any(|o| {
                    (o.from == country && o.to == enemy) || (o.from == enemy && o.to == country)
                });
                if !open {
                    orders.push(Command::OfferPeace { to: enemy });
                }
            }
        }
    }

    fn think_armies(&self, country: CountryId, enemies: &[CountryId], orders: &mut Vec<Command>) {
        let groups: Vec<&ArmyGroup> = self
            .groups
            .iter()
            .filter(|g| g.country == country)
            .collect();
        let grouped: BTreeSet<DivisionId> = groups
            .iter()
            .flat_map(|g| g.divisions.iter().copied())
            .collect();
        let ungrouped: Vec<DivisionId> = self
            .divisions
            .iter()
            .filter(|d| d.country == country && !grouped.contains(&d.id))
            .map(|d| d.id)
            .collect();
        // Every enemy it borders gets a group with a front.
        let facing: BTreeSet<CountryId> = groups.iter().filter_map(|g| g.enemy).collect();
        let uncovered: Vec<CountryId> = enemies
            .iter()
            .copied()
            .filter(|e| !facing.contains(e))
            .collect();
        let day = self.tick() / 24;
        match groups.iter().find(|g| g.front.is_empty()) {
            Some(spare) => {
                let line = uncovered
                    .iter()
                    .filter(|&&e| {
                        (day + u64::from(e)).is_multiple_of(BORDER_RETRY_DAYS) || facing.is_empty()
                    })
                    .map(|&e| self.front_line(country, e))
                    .find(|line| !line.is_empty());
                if let Some(line) = line {
                    orders.push(Command::SetFront {
                        group: spare.id,
                        line,
                    });
                }
            }
            None if !uncovered.is_empty() && (groups.is_empty() || !ungrouped.is_empty()) => {
                orders.push(Command::CreateArmyGroup {
                    divisions: ungrouped,
                });
                return;
            }
            None => {}
        }
        // Each fronted group: its strength against the enemy near its front.
        let fronted: Vec<(&ArmyGroup, f64)> = groups
            .iter()
            .copied()
            .filter(|g| !g.front.is_empty() && g.enemy.is_some())
            .map(|g| {
                let own: f64 = g
                    .divisions
                    .iter()
                    .filter_map(|&id| self.division(id))
                    .map(|d| d.power())
                    .sum();
                (g, own / self.enemy_near(g).max(1.0))
            })
            .collect();
        // New divisions join the group under most pressure.
        if !ungrouped.is_empty()
            && let Some((group, _)) = fronted
                .iter()
                .min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.id.cmp(&b.0.id)))
        {
            orders.push(Command::AssignDivisions {
                group: group.id,
                divisions: ungrouped,
            });
        }
        for (group, ratio) in fronted {
            let enemy = group.enemy.expect("filtered above");
            if group.arrow.is_empty() && ratio >= ATTACK_RATIO && !group.divisions.is_empty() {
                let target = self
                    .capital(enemy)
                    .filter(|&c| self.control[c as usize] == enemy)
                    .or_else(|| self.supply_source(enemy));
                if let Some(target) = target {
                    let base = group.front[group.front.len() / 2];
                    orders.push(Command::DrawArrow {
                        group: group.id,
                        line: vec![base, target],
                    });
                }
            } else if !group.arrow.is_empty() && ratio < STOP_RATIO {
                orders.push(Command::DrawArrow {
                    group: group.id,
                    line: Vec::new(),
                });
            }
        }
    }

    /// The strength of the group's enemy near its front.
    fn enemy_near(&self, group: &ArmyGroup) -> f64 {
        let Some(enemy) = group.enemy else {
            return 0.0;
        };
        self.divisions
            .iter()
            .filter(|d| d.country == enemy)
            .filter(|d| {
                group
                    .front
                    .iter()
                    .any(|&p| self.map.estimate_m(p, d.cell) <= NEAR_FRONT_M)
            })
            .map(|d| d.power())
            .sum()
    }

    /// A line along the border with `enemy`, or empty if there is none.
    fn front_line(&self, country: CountryId, enemy: CountryId) -> Vec<Cell> {
        let border = self.border_cells(country, enemy);
        let walk = chain(&self.map, &border);
        let step = walk.len().div_ceil(FRONT_POINTS).max(1);
        let mut line: Vec<Cell> = walk.iter().step_by(step).copied().collect();
        if let (Some(&last), Some(&end)) = (line.last(), walk.last())
            && last != end
        {
            line.push(end);
        }
        line
    }
}
