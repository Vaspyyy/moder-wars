//! Peace talks: how willing a country is to accept terms put to it.
//!
//! The answer weighs two things, both counted in shares of what a
//! country's own land produces:
//!
//! - **Strain**, how badly the war goes for each side: the share of its own
//!   land's output in enemy hands, plus `SUPPORT_WEIGHT` times the war
//!   support it lost, plus `WEAKNESS_WEIGHT` times how much weaker its
//!   army is than the other's (0 when stronger). The side under more strain
//!   than the other has a `margin` to give.
//! - **Price**, what the terms take from it: each of its own regions it
//!   would hand over, as a share of its own land's output, counted
//!   `UNHELD_WEIGHT` times over when the other side does not hold most of
//!   it; each of the other's regions it would get counts against that.
//!
//! The chance it accepts is 50% when the margin just pays the price, and
//! moves by `SPREAD` per percent (of output) either way, from never to
//! always; it is halved when the peace would be a separate one, costing
//! the country its faction (`factions.rs`). The AI rolls that chance once,
//! when it answers; the player sees it before sending terms.

use crate::support::FULL_SUPPORT;
use crate::world::{CountryId, World};

/// Lost war support counts this much against a full share of land lost.
pub const SUPPORT_WEIGHT: f64 = 0.6;
/// How much weaker its army is than the other's, from 0 (as strong or
/// stronger) to 1 (no army against one), counts this much.
pub const WEAKNESS_WEIGHT: f64 = 0.3;
/// A region the other side does not hold most of costs this many times
/// what it produces.
pub const UNHELD_WEIGHT: f64 = 3.0;
/// The chance goes from 0% to 100% across this much (margin less price).
pub const SPREAD: f64 = 0.2;

/// How a country weighs terms put to it (see the module docs).
#[derive(Clone, Debug, PartialEq)]
pub struct Willingness {
    /// From 0 (never) to 1 (always).
    pub chance: f64,
    /// Its strain less the other side's.
    pub margin: f64,
    /// What the terms take from it, less what they give it.
    pub price: f64,
    /// The share of its own land's output in enemy hands.
    pub lost: f64,
    /// Its war support, per mille.
    pub support: u16,
    /// What the terms take from it, as a share of its own land's output
    /// (no weights).
    pub asked: f64,
    /// The part of `asked` the other side holds.
    pub asked_held: f64,
    /// Peace would take it out of its faction (a separate peace).
    pub separate: bool,
}

impl World {
    /// How willing `to` is to make peace with `from` on `terms` (regions
    /// of either side that change hands, as in `Command::OfferPeace`).
    pub fn willingness(&self, from: CountryId, to: CountryId, terms: &[u16]) -> Willingness {
        let economy = self.economy(to);
        let home = economy.map_or(0, |e| e.home_total_k).max(1) as f64;
        let regions: Vec<usize> = terms.iter().map(|&r| usize::from(r)).collect();
        let held_by_from = self.holding(from, &regions);
        let (mut price, mut asked, mut asked_held) = (0.0, 0.0, 0.0);
        for (i, &region) in regions.iter().enumerate() {
            let share = self.region_value_k(region) as f64 / home;
            let owner = self.region_owner_now(region);
            if owner == to {
                asked += share;
                let (held, most) = held_by_from[i];
                asked_held += share * held;
                price += share * if most { 1.0 } else { UNHELD_WEIGHT };
            } else if owner == from {
                price -= share;
            }
        }
        let margin = self.strain(to, from) - self.strain(from, to);
        let separate = self.separate_peace(to, from);
        let chance = (0.5 + (margin - price) / SPREAD).clamp(0.0, 1.0);
        Willingness {
            chance: if separate { chance / 2.0 } else { chance },
            margin,
            price,
            lost: self.lost_share(to),
            support: economy.map_or(FULL_SUPPORT, |e| e.support),
            asked,
            asked_held,
            separate,
        }
    }

    /// How badly the war goes for `country` against `other` (see the
    /// module docs).
    fn strain(&self, country: CountryId, other: CountryId) -> f64 {
        let support = self.economy(country).map_or(FULL_SUPPORT, |e| e.support);
        let gone = 1.0 - f64::from(support) / f64::from(FULL_SUPPORT);
        let (own, theirs) = (self.army_power(country), self.army_power(other));
        let weaker = if own + theirs > 0.0 {
            ((theirs - own) / (own + theirs)).max(0.0)
        } else {
            0.0
        };
        self.lost_share(country) + SUPPORT_WEIGHT * gone + WEAKNESS_WEIGHT * weaker
    }

    /// The share of what `country`'s own land produces that enemies hold.
    pub fn lost_share(&self, country: CountryId) -> f64 {
        match self.economy(country) {
            Some(e) if e.home_total_k > 0 => 1.0 - e.home_k as f64 / e.home_total_k as f64,
            _ => 0.0,
        }
    }
}
