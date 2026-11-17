//! War support: how much the people back the war, per mille.
//!
//! It starts full. Once a day, for a country at war, it:
//!
//! - wears down by `WEARINESS_PER_DAY`;
//! - is held up by home front spending, the share of income the budget
//!   leaves to the people (up to `HOME_FRONT_PER_DAY` when it gets
//!   everything, which cancels the weariness);
//! - falls with every soldier lost, counted against everyone who could
//!   serve at total mobilization: losing `1 / CASUALTY_WEIGHT` of them
//!   takes all of it;
//! - falls with own land in enemy hands, by what that land produces (up to
//!   `OCCUPATION_PER_DAY` with all of it lost).
//!
//! At peace it recovers by `PEACE_RECOVERY_PER_DAY`. A country at war whose
//! support reaches zero capitulates, and starts again at
//! `AFTER_CAPITULATION`. Whole numbers only, so it adds up the same on every
//! machine.

use crate::economy::SERVE_PER_MILLE;
use crate::world::{CountryId, Event, UnknownCountry, World};

/// Support at the start, and the most it can be.
pub const FULL_SUPPORT: u16 = 1000;
pub const WEARINESS_PER_DAY: i64 = 4;
/// At 100% of income left to the home front.
pub const HOME_FRONT_PER_DAY: i64 = 4;
/// Losing this share of everyone who could serve takes all support
/// (2: half of them).
pub const CASUALTY_WEIGHT: u64 = 2;
/// With all of its own land in enemy hands.
pub const OCCUPATION_PER_DAY: i64 = 10;
pub const PEACE_RECOVERY_PER_DAY: i64 = 10;
/// Support after a capitulation: enough that a country made a puppet and
/// sent into its overlord's wars at once does not give up again the next
/// day.
pub const AFTER_CAPITULATION: u16 = FULL_SUPPORT / 2;

impl World {
    /// Set a country's war support, per mille (at most full), for
    /// sandboxes and tests: at zero it capitulates at the next daily
    /// update if it is at war.
    pub fn set_war_support(
        &mut self,
        country: CountryId,
        support: u16,
    ) -> Result<(), UnknownCountry> {
        let index = self.index_of(country).ok_or(UnknownCountry(country))?;
        self.countries[index].economy.support = support.min(FULL_SUPPORT);
        Ok(())
    }

    /// `country` just capitulated: its support starts again at
    /// `AFTER_CAPITULATION`, and the soldiers who laid down their arms are
    /// not lost again the next day.
    pub(crate) fn after_capitulation(&mut self, country: CountryId) {
        let serving: u64 = self
            .divisions
            .iter()
            .filter(|d| d.country == country)
            .map(|d| u64::from(d.personnel))
            .sum();
        if let Some(index) = self.index_of(country) {
            let economy = &mut self.countries[index].economy;
            economy.support = AFTER_CAPITULATION;
            economy.casualties = economy.drafted.saturating_sub(serving);
        }
    }

    /// The daily change in every country's war support; countries at war
    /// whose support runs out capitulate.
    pub(crate) fn run_support(&mut self, events: &mut Vec<Event>) {
        let mut serving = vec![0u64; self.countries.len()];
        for division in &self.divisions {
            if let Some(index) = self.index_of(division.country) {
                serving[index] += u64::from(division.personnel);
            }
        }
        let at_war = self.countries_at_war();
        let mut collapsed = Vec::new();
        for (index, country) in self.countries.iter_mut().enumerate() {
            let economy = &mut country.economy;
            // Soldiers only ever leave divisions, so this is everyone lost.
            let lost = economy.drafted.saturating_sub(serving[index]);
            let could_serve = (economy.population * SERVE_PER_MILLE[3] / 1000).max(1);
            let hit = |lost: u64| lost * u64::from(FULL_SUPPORT) * CASUALTY_WEIGHT / could_serve;
            let casualties = hit(lost).saturating_sub(hit(economy.casualties)) as i64;
            economy.casualties = lost;
            let change = if at_war.contains(&country.id) {
                let home_front = i64::from(economy.home_front());
                let occupied_per_mille = if economy.home_total_k > 0 {
                    1000 - economy.home_k * 1000 / economy.home_total_k
                } else {
                    0
                };
                home_front * HOME_FRONT_PER_DAY / 100
                    - WEARINESS_PER_DAY
                    - casualties
                    - occupied_per_mille * OCCUPATION_PER_DAY / 1000
            } else {
                PEACE_RECOVERY_PER_DAY
            };
            let support = (i64::from(economy.support) + change).clamp(0, i64::from(FULL_SUPPORT));
            economy.support = support as u16;
            if support == 0 && at_war.contains(&country.id) {
                collapsed.push(country.id);
            }
        }
        for country in collapsed {
            // An earlier collapse today may have ended its last war.
            if self.countries_at_war().contains(&country) {
                events.push(Event::SupportCollapsed { country });
                self.capitulate(country, true, events);
            }
        }
    }
}
