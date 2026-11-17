//! War and peace.
//!
//! A country at war can offer peace to an enemy on terms: the regions of
//! either side that change hands (each goes from its owner by law to the
//! other side); everything else either side holds of the other's land goes
//! back. The enemy accepts or refuses (an AI weighs the terms against how
//! the war goes, see `talks.rs`), and an offer nobody answers runs out
//! after `OFFER_DAYS`. After a refusal the same country cannot offer again
//! for `TALKS_CLOSED_DAYS`. Each pair of countries makes peace on its own,
//! and the land between them is settled in whole regions (`terms.rs`).
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
/// Days a refused country waits before it can offer peace again.
pub const TALKS_CLOSED_DAYS: u64 = 7;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeaceOffer {
    pub from: CountryId,
    pub to: CountryId,
    /// The tick it was made.
    pub tick: u64,
    /// The regions that would change hands, sorted: each goes from its
    /// owner by law (`from` or `to`) to the other. Empty for a white peace.
    pub terms: Vec<u16>,
}

impl World {
    pub(crate) fn offer_peace(
        &mut self,
        from: CountryId,
        to: CountryId,
        terms: &[u16],
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        if !self.at_war(from, to) {
            return Err(Rejection::NotAtWar);
        }
        if self.overlord(from).is_some() || self.overlord(to).is_some() {
            // A puppet's wars end with its overlord's.
            return Err(Rejection::Puppet);
        }
        if self.talks_closed(from, to) {
            return Err(Rejection::TalksClosed);
        }
        let mut terms = terms.to_vec();
        terms.sort_unstable();
        terms.dedup();
        if terms.iter().any(|&region| {
            let owner = self.region_owner_now(usize::from(region));
            owner != from && owner != to
        }) {
            return Err(Rejection::NotTheirRegion);
        }
        let key = |o: &PeaceOffer| (o.from, o.to);
        match self.offers.binary_search_by_key(&(from, to), key) {
            Ok(_) => Err(Rejection::AlreadyOffered),
            Err(at) => {
                let tick = self.tick();
                self.offers.insert(
                    at,
                    PeaceOffer {
                        from,
                        to,
                        tick,
                        terms,
                    },
                );
                events.push(Event::PeaceOffered { from, to });
                Ok(())
            }
        }
    }

    /// Whether `from` was refused by `to` less than `TALKS_CLOSED_DAYS` ago.
    pub fn talks_closed(&self, from: CountryId, to: CountryId) -> bool {
        self.talks_reopen(from, to).is_some()
    }

    /// The tick from which `from` may offer `to` peace again, while `to`'s
    /// refusal still keeps it waiting.
    pub fn talks_reopen(&self, from: CountryId, to: CountryId) -> Option<u64> {
        self.talks_closed
            .get(&(from, to))
            .copied()
            .filter(|&until| self.tick() < until)
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
        let offer = self.offers.remove(at);
        if accept {
            events.push(Event::PeaceMade { from, to });
            self.end_war_on(from, to, Some(&offer.terms), events);
        } else {
            events.push(Event::PeaceRefused { from, to });
            let until = self.tick() + TALKS_CLOSED_DAYS * 24;
            self.talks_closed.insert((from, to), until);
        }
        Ok(())
    }

    /// End the war between two countries, drop offers between them and
    /// their arrows into each other (divisions do not enter land at peace,
    /// so such an arrow could never be finished), and settle the land on
    /// `terms` (see `World::settle_regions`). Puppets of either side at war
    /// with the other make peace too.
    pub(crate) fn end_war_on(
        &mut self,
        a: CountryId,
        b: CountryId,
        terms: Option<&[u16]>,
        events: &mut Vec<Event>,
    ) {
        self.stop_war(a, b);
        self.settle_regions(a, b, terms, events);
        self.puppets_make_peace(a, b, events);
        self.puppets_make_peace(b, a, events);
    }

    /// The war between two countries is over; the land stays as it is held.
    fn stop_war(&mut self, a: CountryId, b: CountryId) {
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
        self.talks_closed.remove(&(a, b));
        self.talks_closed.remove(&(b, a));
    }

    /// Drop offers older than `OFFER_DAYS`.
    pub(crate) fn expire_offers(&mut self) {
        let now = self.tick();
        self.offers
            .retain(|o| now.saturating_sub(o.tick) < OFFER_DAYS * 24);
        self.talks_closed.retain(|_, &mut until| now < until);
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
            // An earlier capitulation today may have ended its last war.
            if !self.countries_at_war().contains(&country) {
                continue;
            }
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
    /// ran out): all its wars end, its divisions lay down their arms, its
    /// puppets are free, and its enemies divide its land at a conference
    /// (`conference.rs`). Its record remembers when, to whom, since when it
    /// was at war and what those wars cost it (the regions it hands over
    /// once the conference ends).
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
        events.push(Event::Capitulated { country });
        let tick = self.tick();
        if let Some(index) = self.index_of(country) {
            let record = &mut self.countries[index].record;
            record.capitulation = Some(Capitulation {
                tick,
                enemies: enemies.clone(),
                war_began,
                support_collapsed,
                cost: record.war,
                ceded: Vec::new(),
            });
        }
        self.free_puppets(country, &enemies, events);
        for &enemy in &enemies {
            self.stop_war(country, enemy);
        }
        self.offers.retain(|o| o.from != country && o.to != country);
        let surrendering: Vec<usize> = (0..self.divisions.len())
            .filter(|&i| self.divisions[i].country == country)
            .collect();
        self.remove_divisions(&surrendering, Loss::Surrendered, events);
        self.groups.retain(|g| g.country != country);
        self.open_conference(country, enemies, events);
    }
}
