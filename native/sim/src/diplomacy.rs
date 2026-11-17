//! War and peace.
//!
//! A country at war can offer peace to an enemy; the enemy accepts or
//! refuses, and an offer nobody answers runs out after `OFFER_DAYS`. Each
//! pair of countries makes peace on its own, and the land between them is
//! settled in whole regions (`terms.rs`).
//!
//! Once a day, a country at war that has lost its capital and holds less
//! than half of its own land (by what that land produces), or whose war
//! support has run out (`support.rs`), capitulates: all
//! its wars end, settled the same way, and its divisions lay down their
//! arms.

use serde::{Deserialize, Serialize};

use crate::division::Loss;
use crate::map::Cell;
use crate::record::Capitulation;
use crate::world::{CountryId, Event, Rejection, World};

/// Days an unanswered peace offer stays open.
pub const OFFER_DAYS: u64 = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeaceOffer {
    pub from: CountryId,
    pub to: CountryId,
    /// The tick it was made.
    pub tick: u64,
}

impl World {
    pub(crate) fn offer_peace(
        &mut self,
        from: CountryId,
        to: CountryId,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        if !self.at_war(from, to) {
            return Err(Rejection::NotAtWar);
        }
        let key = |o: &PeaceOffer| (o.from, o.to);
        match self.offers.binary_search_by_key(&(from, to), key) {
            Ok(_) => Err(Rejection::AlreadyOffered),
            Err(at) => {
                let tick = self.tick();
                self.offers.insert(at, PeaceOffer { from, to, tick });
                events.push(Event::PeaceOffered { from, to });
                Ok(())
            }
        }
    }

    pub(crate) fn answer_peace(
        &mut self,
        from: CountryId,
        to: CountryId,
        accept: bool,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        let at = self
            .offers
            .binary_search_by_key(&(from, to), |o| (o.from, o.to))
            .map_err(|_| Rejection::NoOffer)?;
        self.offers.remove(at);
        if accept {
            events.push(Event::PeaceMade { from, to });
            self.end_war(from, to, events);
        } else {
            events.push(Event::PeaceRefused { from, to });
        }
        Ok(())
    }

    /// End the war between two countries, drop offers between them and
    /// their arrows into each other (divisions do not enter land at peace,
    /// so such an arrow could never be finished), and settle the land.
    fn end_war(&mut self, a: CountryId, b: CountryId, events: &mut Vec<Event>) {
        self.wars.remove(&(a.min(b), a.max(b)));
        self.offers
            .retain(|o| !((o.from == a && o.to == b) || (o.from == b && o.to == a)));
        for group in &mut self.groups {
            if (group.country, group.enemy) == (a, Some(b))
                || (group.country, group.enemy) == (b, Some(a))
            {
                group.arrow.clear();
            }
        }
        self.settle_regions(a, b, events);
    }

    /// Drop offers older than `OFFER_DAYS`.
    pub(crate) fn expire_offers(&mut self) {
        let now = self.tick();
        self.offers
            .retain(|o| now.saturating_sub(o.tick) < OFFER_DAYS * 24);
    }

    /// The country's capital: its most populous capital city.
    pub(crate) fn capital(&self, country: CountryId) -> Option<Cell> {
        self.map
            .cities()
            .iter()
            .filter(|c| c.owner == country && c.capital)
            .max_by_key(|c| (c.pop, std::cmp::Reverse(c.cell)))
            .map(|c| c.cell)
    }

    /// Countries at war that lost their capital and most of their land
    /// give up.
    pub(crate) fn check_capitulation(&mut self, events: &mut Vec<Event>) {
        for country in self.countries_at_war() {
            let Some(index) = self.index_of(country) else {
                continue;
            };
            let economy = &self.countries[index].economy;
            let lost_most = economy.home_k * 2 < economy.home_total_k;
            let holds_capital = self
                .capital(country)
                .is_some_and(|c| self.control[c as usize] == country);
            if lost_most && !holds_capital {
                self.capitulate(country, false, events);
            }
        }
    }

    /// `country` gives up (`support_collapsed`: because war support at home
    /// ran out): all its wars end and its divisions lay down their arms.
    /// Its record remembers when, to whom and since when it was at war.
    pub(crate) fn capitulate(
        &mut self,
        country: CountryId,
        support_collapsed: bool,
        events: &mut Vec<Event>,
    ) {
        let enemies = self.enemies(country);
        let war_began = enemies
            .iter()
            .filter_map(|&enemy| self.war_began(country, enemy))
            .min()
            .unwrap_or(self.tick());
        if let Some(index) = self.index_of(country) {
            self.countries[index].record.capitulation = Some(Capitulation {
                tick: self.tick(),
                enemies: enemies.clone(),
                war_began,
                support_collapsed,
            });
        }
        events.push(Event::Capitulated { country });
        for enemy in enemies {
            self.end_war(country, enemy, events);
        }
        self.offers.retain(|o| o.from != country && o.to != country);
        let surrendering: Vec<usize> = (0..self.divisions.len())
            .filter(|&i| self.divisions[i].country == country)
            .collect();
        self.remove_divisions(&surrendering, Loss::Surrendered, events);
        self.groups.retain(|g| g.country != country);
    }
}
