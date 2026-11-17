//! The peace conference after a capitulation, and puppets.
//!
//! When a country capitulates, its wars end but its land stays as it is
//! held until its enemies, the winners, have divided it. They take turns,
//! the one who defeated the most of its soldiers first (ties: lower id).
//! On its turn a winner either
//!
//! - takes one of the loser's regions not taken yet (any of them);
//! - makes the loser its **puppet**: the loser keeps every region nobody
//!   has taken, and the conference ends;
//! - annexes the rest: takes every region left, only once every other
//!   winner is done;
//! - or leaves: it takes nothing more, and the others go on.
//!
//! The conference ends when everyone has left, nothing is left to take or
//! the loser became a puppet. Then each taken region becomes its taker's by
//! law, whole; everything else either side holds of the other's land goes
//! back, and divisions on land that is no longer theirs go home. The loser
//! cannot refuse. A conference waits for a winner the AI does not run (the
//! player) until it acts, or `WAIT_DAYS` days, then acts for it as the AI
//! would: take the most valuable region it holds most of; else, as the main
//! winner, make the loser a puppet; else leave.
//!
//! A puppet keeps its land and the AI runs it, but it joins every war its
//! overlord fights (and its overlord joins any war on it), cannot declare
//! war or make peace of its own, and pays its overlord `TRIBUTE_PERCENT`
//! of its income. When its overlord makes peace, so does it (a white
//! peace); when its overlord capitulates, it is free again and its wars
//! with its overlord's enemies end.

use serde::{Deserialize, Serialize};

use crate::map::Cell;
use crate::world::{Controller, CountryId, Event, Rejection, World};

/// Days a conference waits for a winner the AI does not run.
pub const WAIT_DAYS: u64 = 30;
/// The share of its income a puppet pays its overlord, in percent.
pub const TRIBUTE_PERCENT: i64 = 25;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Conference {
    pub loser: CountryId,
    /// In turn order: the most of the loser's soldiers defeated first.
    pub winners: Vec<CountryId>,
    /// Whose turn it is: an index into `winners`.
    pub turn: usize,
    /// Winners who left (take nothing more).
    pub done: Vec<CountryId>,
    /// Regions taken so far, in order: (region index, taker).
    pub picks: Vec<(u16, CountryId)>,
    /// The loser's regions nobody has taken yet, sorted.
    pub open: Vec<u16>,
    /// Who made the loser its puppet (which ended the conference).
    pub puppet_of: Option<CountryId>,
    /// The tick it opened.
    pub opened: u64,
}

impl Conference {
    /// The winner whose turn it is.
    pub fn picking(&self) -> CountryId {
        self.winners[self.turn]
    }

    fn over(&self) -> bool {
        self.puppet_of.is_some()
            || self.open.is_empty()
            || self.winners.iter().all(|w| self.done.contains(w))
    }
}

/// What a winner does on its turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Move {
    Take(u16),
    Puppet,
    AnnexRest,
    Leave,
}

impl World {
    /// Open conferences, oldest first.
    pub fn conferences(&self) -> &[Conference] {
        &self.conferences
    }

    /// The overlord of `country`, if it is a puppet.
    pub fn overlord(&self, country: CountryId) -> Option<CountryId> {
        self.index_of(country)
            .and_then(|i| self.countries[i].overlord)
    }

    /// The puppets of `country`, by id.
    pub fn puppets(&self, country: CountryId) -> Vec<CountryId> {
        self.countries
            .iter()
            .filter(|c| c.overlord == Some(country))
            .map(|c| c.id)
            .collect()
    }

    /// Soldiers of `loser` that `winner` put out of action in their current
    /// (or last) war.
    pub fn defeated(&self, winner: CountryId, loser: CountryId) -> u64 {
        self.defeated.get(&(winner, loser)).copied().unwrap_or(0)
    }

    /// The regions `country` owns by law now, in region order.
    pub fn regions_of(&self, country: CountryId) -> Vec<usize> {
        let Some(map) = self.regions.as_deref() else {
            return Vec::new();
        };
        (0..map.home.len())
            .filter(|&r| map.cells[r] > 0 && self.region_owner_now(r) == country)
            .collect()
    }

    /// `loser` capitulated to `winners`: its land waits for them to divide
    /// it (see the module docs).
    pub(crate) fn open_conference(
        &mut self,
        loser: CountryId,
        mut winners: Vec<CountryId>,
        events: &mut Vec<Event>,
    ) {
        winners.sort_by_key(|&w| (std::cmp::Reverse(self.defeated(w, loser)), w));
        winners.dedup();
        let open = self
            .regions_of(loser)
            .into_iter()
            .map(|r| r as u16)
            .collect();
        let tick = self.tick();
        self.conferences.push(Conference {
            loser,
            winners: winners.clone(),
            turn: 0,
            done: Vec::new(),
            picks: Vec::new(),
            open,
            puppet_of: None,
            opened: tick,
        });
        events.push(Event::ConferenceOpened { loser, winners });
        self.run_conferences(events);
    }

    /// `winner` makes its move in the conference on `loser`.
    pub(crate) fn conference_move(
        &mut self,
        winner: CountryId,
        loser: CountryId,
        action: Move,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        let index = self
            .conferences
            .iter()
            .position(|c| c.loser == loser)
            .ok_or(Rejection::NoConference)?;
        let conference = &self.conferences[index];
        if conference.picking() != winner {
            return Err(Rejection::NotYourTurn);
        }
        match action {
            Move::Take(region) if !conference.open.contains(&region) => {
                return Err(Rejection::NotTheirRegion);
            }
            Move::Puppet if self.overlord(winner).is_some() => return Err(Rejection::Puppet),
            Move::AnnexRest
                if conference
                    .winners
                    .iter()
                    .any(|&w| w != winner && !conference.done.contains(&w)) =>
            {
                return Err(Rejection::OthersStillPicking);
            }
            _ => {}
        }
        let conference = &mut self.conferences[index];
        match action {
            Move::Take(region) => {
                conference.open.retain(|&r| r != region);
                conference.picks.push((region, winner));
                events.push(Event::RegionTaken {
                    loser,
                    by: winner,
                    region: usize::from(region),
                });
            }
            Move::Puppet => conference.puppet_of = Some(winner),
            Move::AnnexRest => {
                for region in std::mem::take(&mut conference.open) {
                    conference.picks.push((region, winner));
                    events.push(Event::RegionTaken {
                        loser,
                        by: winner,
                        region: usize::from(region),
                    });
                }
            }
            Move::Leave => conference.done.push(winner),
        }
        if !conference.over() {
            // The next winner still picking.
            let count = conference.winners.len();
            for step in 1..=count {
                let next = (conference.turn + step) % count;
                if !conference.done.contains(&conference.winners[next]) {
                    conference.turn = next;
                    break;
                }
            }
        }
        if self.conferences[index].over() {
            self.close_conference(index, events);
        }
        Ok(())
    }

    /// Let the AI make the moves that are its to make, and act for a winner
    /// who kept a conference waiting `WAIT_DAYS`.
    pub(crate) fn run_conferences(&mut self, events: &mut Vec<Event>) {
        let mut guard = 0;
        while guard < 10_000 {
            guard += 1;
            let now = self.tick();
            let next = self.conferences.iter().find_map(|c| {
                let winner = c.picking();
                let ai = self
                    .country(winner)
                    .is_none_or(|s| s.controller == Controller::Ai);
                let waited = now.saturating_sub(c.opened) >= WAIT_DAYS * 24;
                (ai || waited).then_some((winner, c.loser))
            });
            let Some((winner, loser)) = next else {
                return;
            };
            let action = self.ai_move(winner, loser);
            if self.conference_move(winner, loser, action, events).is_err() {
                // Cannot happen; leaving is always allowed.
                let _ = self.conference_move(winner, loser, Move::Leave, events);
            }
        }
    }

    /// What the AI does on its turn: the most valuable region left that it
    /// holds most of; else, as the main winner and no puppet itself, make
    /// the loser its puppet; else leave.
    pub fn ai_move(&self, winner: CountryId, loser: CountryId) -> Move {
        let Some(conference) = self.conferences.iter().find(|c| c.loser == loser) else {
            return Move::Leave;
        };
        let open: Vec<usize> = conference.open.iter().map(|&r| usize::from(r)).collect();
        let holding = self.holding(winner, &open);
        let best = open
            .iter()
            .zip(holding)
            .filter(|(_, (_, most))| *most)
            .max_by_key(|&(&region, _)| (self.region_value_k(region), std::cmp::Reverse(region)))
            .map(|(&region, _)| region as u16);
        if let Some(region) = best {
            Move::Take(region)
        } else if conference.winners.first() == Some(&winner)
            && !conference.open.is_empty()
            && self.overlord(winner).is_none()
        {
            Move::Puppet
        } else {
            Move::Leave
        }
    }

    /// Settle the land of a finished conference (see the module docs).
    fn close_conference(&mut self, index: usize, events: &mut Vec<Event>) {
        let conference = self.conferences.remove(index);
        let loser = conference.loser;
        let mut sides = conference.winners.clone();
        sides.push(loser);
        let mut handed: std::collections::BTreeMap<CountryId, u32> = Default::default();
        if let Some(map) = self.regions.clone() {
            for &(region, by) in &conference.picks {
                let region = usize::from(region);
                if by == map.home[region] {
                    self.ceded.remove(&(region as u16));
                } else {
                    self.ceded.insert(region as u16, by);
                }
                *handed.entry(by).or_default() += 1;
            }
            let picked: Vec<usize> = conference
                .picks
                .iter()
                .map(|&(r, _)| usize::from(r))
                .collect();
            let law = self.law_of();
            let mut changes: Vec<(Cell, CountryId)> = Vec::new();
            for cell in 0..self.control.len() as Cell {
                let holder = self.control[cell as usize];
                if holder == 0 || !sides.contains(&holder) {
                    continue;
                }
                let owner = law(cell);
                let in_play = holder == loser
                    || owner == loser
                    || map.region(cell).is_some_and(|r| picked.contains(&r));
                if in_play && owner != holder && sides.contains(&owner) {
                    changes.push((cell, owner));
                }
            }
            drop(law);
            for (cell, owner) in changes {
                self.set_control(cell, owner);
            }
            if !handed.is_empty() {
                self.count_output();
            }
        }
        for (&to, &regions) in &handed {
            events.push(Event::RegionsCeded {
                from: loser,
                to,
                regions,
            });
        }
        for &winner in &conference.winners {
            self.withdraw(winner, loser);
        }
        if let Some(index) = self.index_of(loser)
            && let Some(capitulation) = self.countries[index].record.capitulation.as_mut()
        {
            let mut ceded = conference.picks.clone();
            ceded.sort_unstable();
            capitulation.ceded = ceded;
        }
        events.push(Event::ConferenceClosed { loser });
        if let Some(overlord) = conference.puppet_of {
            self.make_puppet(loser, overlord, events);
        }
    }

    /// `country` becomes `overlord`'s puppet, and joins its wars.
    fn make_puppet(&mut self, country: CountryId, overlord: CountryId, events: &mut Vec<Event>) {
        let Some(index) = self.index_of(country) else {
            return;
        };
        self.countries[index].overlord = Some(overlord);
        self.offers.retain(|o| o.from != country && o.to != country);
        events.push(Event::Puppeted { country, overlord });
        for enemy in self.enemies(overlord) {
            if enemy != country && !self.at_war(country, enemy) {
                self.begin_war(country, enemy, events);
            }
        }
    }

    /// `country`, its overlord and the overlord's puppets (or its own).
    pub fn family(&self, country: CountryId) -> Vec<CountryId> {
        let head = self.overlord(country).unwrap_or(country);
        let mut family = self.puppets(head);
        family.push(head);
        family.sort_unstable();
        family
    }

    /// When a war between `a` and `b` begins: every member of each side's
    /// family (see `family`) is at war with every member of the other's.
    pub(crate) fn drag_in(&mut self, a: CountryId, b: CountryId, events: &mut Vec<Event>) {
        let (ours, theirs) = (self.family(a), self.family(b));
        for &x in &ours {
            for &y in &theirs {
                if x != y && !ours.contains(&y) && !self.at_war(x, y) {
                    self.begin_war(x, y, events);
                }
            }
        }
    }

    /// A puppet's overlord made peace with `enemy`: so does the puppet.
    pub(crate) fn puppets_make_peace(
        &mut self,
        overlord: CountryId,
        enemy: CountryId,
        events: &mut Vec<Event>,
    ) {
        for puppet in self.puppets(overlord) {
            if self.at_war(puppet, enemy) {
                events.push(Event::PeaceMade {
                    from: puppet,
                    to: enemy,
                });
                self.end_war_on(puppet, enemy, Some(&[]), events);
            }
        }
    }

    /// `overlord` capitulated: its puppets are free, and their wars with
    /// its enemies end in a white peace.
    pub(crate) fn free_puppets(
        &mut self,
        overlord: CountryId,
        enemies: &[CountryId],
        events: &mut Vec<Event>,
    ) {
        for puppet in self.puppets(overlord) {
            if let Some(index) = self.index_of(puppet) {
                self.countries[index].overlord = None;
            }
            events.push(Event::PuppetFreed { country: puppet });
            for &enemy in enemies {
                if self.at_war(puppet, enemy) {
                    self.end_war_on(puppet, enemy, Some(&[]), events);
                }
            }
        }
    }

    /// What a puppet pays its overlord today out of `income_k`.
    pub(crate) fn tribute_k(income_k: i64) -> i64 {
        income_k.max(0) * TRIBUTE_PERCENT / 100
    }
}
