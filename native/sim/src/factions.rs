//! Factions: alliances, like HOI4's.
//!
//! A faction has a leader and members (the leader among them). A country
//! is in one faction at most, and a puppet in none: it counts with its
//! overlord's (`conference.rs`). Countries of one faction, and their
//! puppets, never fight each other.
//!
//! - **Defense.** When a country declares war on a member, every other
//!   member is at war with the attacker at once (each with its overlord and
//!   puppets).
//! - **Calls to arms.** When a member declares war, the others are called
//!   to arms and each chooses, within `CALL_DAYS`, whether to join. An AI
//!   joins when it borders the enemy side, its side would be at least
//!   `JOIN_RATIO` times as strong with it, and its war support is at least
//!   `JOIN_SUPPORT`. Joining is declaring war on the target (whose faction
//!   then defends it), without calling anyone else.
//! - **Peace.** A leader's peace with an enemy is its faction's: every
//!   member makes peace with that enemy (a white peace), and with the
//!   enemy's whole faction if the enemy leads one. Countries that went to
//!   war only to defend one side make peace with the other too. A member
//!   that makes peace on its own while another member still fights that
//!   enemy leaves the faction (a separate peace).
//! - **Joining.** The leader invites countries in no faction; a country in
//!   none may ask a leader to let it in, or form a faction it leads by
//!   inviting another country in none. Invitations and requests stay open
//!   `INVITE_DAYS`; joining a faction does not join its wars. An AI accepts
//!   an invitation when a neighbor outside that faction at least
//!   `THREAT_RATIO` times as strong threatens it, and, as a leader, lets in
//!   a country that borders a member. A threatened AI in no faction looks
//!   for one once every `SEEK_EVERY_DAYS`: it asks the strongest faction
//!   that borders it and does not hold its threat, or else invites a
//!   neighbor threatened by the same country to form one; it does not ask
//!   a country that said no again for `REFUSED_DAYS`.
//! - **Leaving.** A member leaves when it wants, when it capitulates, or by
//!   a separate peace. A leader that leaves hands the lead to the strongest
//!   member; a faction left with one country is dissolved.
//!
//! `World::use_real_factions` sets up NATO and the CSTO as they stood on
//! the scenario's start date.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::map::Cell;
use crate::scenario::Scenario;
use crate::support::FULL_SUPPORT;
use crate::time::Date;
use crate::world::{CountryId, Event, Rejection, World};

/// Days an invitation or a request to join stays open.
pub const INVITE_DAYS: u64 = 14;
/// Days a call to arms stays open.
pub const CALL_DAYS: u64 = 7;
/// A neighbor this many times as strong (army power) threatens a country.
pub const THREAT_RATIO: f64 = 2.0;
/// An AI joins an attack when its side would be this many times as strong
/// as the enemy side.
pub const JOIN_RATIO: f64 = 1.5;
/// ... and its war support (per mille) is at least this.
pub const JOIN_SUPPORT: u16 = FULL_SUPPORT * 8 / 10;
/// A threatened AI in no faction looks for one this often (days).
pub const SEEK_EVERY_DAYS: u64 = 7;
/// An AI told no does not ask the same country again for this many days.
pub const REFUSED_DAYS: u64 = 60;

pub type FactionId = u16;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Faction {
    pub id: FactionId,
    /// Empty for a faction nobody named (the game names it after its leader).
    pub name: String,
    pub leader: CountryId,
    /// Sorted, the leader among them.
    pub members: Vec<CountryId>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum InviteKind {
    /// `from` (a leader, or a country in no faction: it forms one) invites
    /// `to` into its faction.
    Invite,
    /// `from` asks `to`, a leader, to let it into its faction.
    Ask,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Invite {
    pub from: CountryId,
    pub to: CountryId,
    pub kind: InviteKind,
    /// The tick it was made.
    pub tick: u64,
    /// The name of the faction an accepted invitation forms (empty: none).
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Call {
    /// The member called to arms.
    pub ally: CountryId,
    /// The member that declared war, on `target`.
    pub attacker: CountryId,
    pub target: CountryId,
    /// The tick of the call.
    pub tick: u64,
}

/// A member of a real faction: its names in the scenarios, and when it
/// joined or left (missing: before any scenario's date, or never).
struct RealMember {
    names: &'static [&'static str],
    joined: Option<Date>,
    left: Option<Date>,
}

struct RealFaction {
    name: &'static str,
    leader: &'static [&'static str],
    members: &'static [RealMember],
}

const fn always(names: &'static [&'static str]) -> RealMember {
    RealMember {
        names,
        joined: None,
        left: None,
    }
}

const fn date(year: i32, month: u8, day: u8) -> Date {
    Date { year, month, day }
}

const USA: &[&str] = &["United States of America", "United States"];

/// NATO and the CSTO.
const REAL: &[RealFaction] = &[
    RealFaction {
        name: "NATO",
        leader: USA,
        members: &[
            always(USA),
            always(&["Albania"]),
            always(&["Belgium"]),
            always(&["Bulgaria"]),
            always(&["Canada"]),
            always(&["Croatia"]),
            always(&["Czechia", "Czech Republic"]),
            always(&["Denmark"]),
            always(&["Estonia"]),
            always(&["France"]),
            always(&["Germany"]),
            always(&["Greece"]),
            always(&["Hungary"]),
            always(&["Iceland"]),
            always(&["Italy"]),
            always(&["Latvia"]),
            always(&["Lithuania"]),
            always(&["Luxembourg"]),
            always(&["Montenegro"]),
            always(&["Netherlands"]),
            always(&["Macedonia", "North Macedonia"]),
            always(&["Norway"]),
            always(&["Poland"]),
            always(&["Portugal"]),
            always(&["Romania"]),
            always(&["Slovakia"]),
            always(&["Slovenia"]),
            always(&["Spain"]),
            always(&["Turkey", "Türkiye"]),
            always(&["United Kingdom"]),
            RealMember {
                names: &["Finland"],
                joined: Some(date(2023, 4, 4)),
                left: None,
            },
            RealMember {
                names: &["Sweden"],
                joined: Some(date(2024, 3, 7)),
                left: None,
            },
        ],
    },
    RealFaction {
        name: "CSTO",
        leader: &["Russia"],
        members: &[
            always(&["Russia"]),
            always(&["Belarus"]),
            always(&["Kazakhstan"]),
            always(&["Kyrgyzstan"]),
            always(&["Tajikistan"]),
            // It froze its part in February 2024.
            RealMember {
                names: &["Armenia"],
                joined: None,
                left: Some(date(2024, 2, 22)),
            },
        ],
    },
];

impl World {
    /// Open factions, oldest first.
    pub fn factions(&self) -> &[Faction] {
        &self.factions
    }

    /// The faction `country` is a member of (not a puppet's overlord's).
    pub fn faction_of(&self, country: CountryId) -> Option<&Faction> {
        self.faction_index(country).map(|i| &self.factions[i])
    }

    pub fn faction(&self, id: FactionId) -> Option<&Faction> {
        self.factions.iter().find(|f| f.id == id)
    }

    /// Whether `country` leads a faction.
    pub fn leads(&self, country: CountryId) -> bool {
        self.faction_of(country)
            .is_some_and(|f| f.leader == country)
    }

    /// Whether two countries are on one side: members of one faction, or
    /// puppets of members (or of each other's overlord).
    pub fn allied(&self, a: CountryId, b: CountryId) -> bool {
        let bloc = |c: CountryId| self.faction_index(self.overlord(c).unwrap_or(c));
        a != b && bloc(a).is_some() && bloc(a) == bloc(b)
    }

    /// The other members of `country`'s faction.
    pub fn allies(&self, country: CountryId) -> Vec<CountryId> {
        self.faction_of(country)
            .map(|f| {
                f.members
                    .iter()
                    .copied()
                    .filter(|&m| m != country)
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Open invitations and requests to join, oldest first.
    pub fn invites(&self) -> &[Invite] {
        &self.invites
    }

    /// Open calls to arms, oldest first.
    pub fn calls(&self) -> &[Call] {
        &self.calls
    }

    /// NATO and the CSTO as they stood on the scenario's start date, with
    /// the members the scenario has (in its theater, if it has one). A
    /// leader the scenario lacks is replaced by the strongest member.
    pub fn use_real_factions(&mut self, scenario: &Scenario) {
        let on = self.time_of(0).date;
        let theater = scenario.info.theater.as_ref().map(|t| &t.country_ids);
        let find = |names: &[&str]| {
            scenario
                .countries
                .iter()
                .flatten()
                .find(|c| names.contains(&c.name.as_str()))
                .map(|c| c.id)
                .filter(|id| self.index_of(*id).is_some())
                .filter(|id| theater.is_none_or(|t| t.contains(id)))
        };
        let mut found = Vec::new();
        for real in REAL {
            let mut members: Vec<CountryId> = real
                .members
                .iter()
                .filter(|m| m.joined.is_none_or(|d| d <= on) && m.left.is_none_or(|d| on < d))
                .filter_map(|m| find(m.names))
                .filter(|&id| self.faction_index(id).is_none())
                .collect();
            members.sort_unstable();
            members.dedup();
            if members.len() < 2 {
                continue;
            }
            let leader = find(real.leader)
                .filter(|l| members.contains(l))
                .unwrap_or_else(|| self.strongest(&members));
            found.push((real.name, leader, members));
        }
        for (name, leader, members) in found {
            self.found_faction(name, leader, members);
        }
    }

    pub(crate) fn faction_index(&self, country: CountryId) -> Option<usize> {
        self.factions
            .iter()
            .position(|f| f.members.contains(&country))
    }

    fn found_faction(
        &mut self,
        name: &str,
        leader: CountryId,
        mut members: Vec<CountryId>,
    ) -> FactionId {
        let id = self.next_faction;
        self.next_faction += 1;
        members.sort_unstable();
        self.factions.push(Faction {
            id,
            name: name.to_string(),
            leader,
            members,
        });
        id
    }

    /// The strongest of `countries` by army power (ties: the lower id).
    fn strongest(&self, countries: &[CountryId]) -> CountryId {
        countries
            .iter()
            .copied()
            .max_by(|&a, &b| {
                self.family_power(a)
                    .total_cmp(&self.family_power(b))
                    .then(b.cmp(&a))
            })
            .expect("a faction has members")
    }

    /// Whether `country` could join the faction led by `head` (or form one
    /// with it, if `head` is in none).
    fn can_join(&self, country: CountryId, head: CountryId) -> Result<(), Rejection> {
        if self.index_of(country).is_none() || self.index_of(head).is_none() {
            return Err(Rejection::UnknownCountry);
        }
        if country == head {
            return Err(Rejection::SelfTarget);
        }
        if self.overlord(country).is_some() || self.overlord(head).is_some() {
            return Err(Rejection::Puppet);
        }
        if self.in_conference(country) || self.in_conference(head) {
            return Err(Rejection::InConference);
        }
        if self.faction_of(country).is_some() {
            return Err(Rejection::InFaction);
        }
        if let Some(faction) = self.faction_of(head)
            && faction.leader != head
        {
            return Err(Rejection::NotLeader);
        }
        let side = self
            .faction_of(head)
            .map_or(vec![head], |f| f.members.clone());
        if side.iter().any(|&m| self.at_war(m, country)) {
            return Err(Rejection::Enemy);
        }
        Ok(())
    }

    fn invite_open(&self, a: CountryId, b: CountryId) -> bool {
        self.invites
            .iter()
            .any(|i| (i.from == a && i.to == b) || (i.from == b && i.to == a))
    }

    /// `from` invites `to` into its faction, or to form one named `name`.
    pub(crate) fn invite(
        &mut self,
        from: CountryId,
        to: CountryId,
        name: &str,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        self.can_join(to, from)?;
        if self.invite_open(from, to) {
            return Err(Rejection::AlreadyOffered);
        }
        let tick = self.tick();
        self.invites.push(Invite {
            from,
            to,
            kind: InviteKind::Invite,
            tick,
            name: name.to_string(),
        });
        events.push(Event::FactionInvited { from, to });
        Ok(())
    }

    /// `from` asks the leader of `faction` to let it in.
    pub(crate) fn ask_to_join(
        &mut self,
        from: CountryId,
        faction: FactionId,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        let leader = self.faction(faction).ok_or(Rejection::NoFaction)?.leader;
        self.can_join(from, leader)?;
        if self.invite_open(from, leader) {
            return Err(Rejection::AlreadyOffered);
        }
        let tick = self.tick();
        self.invites.push(Invite {
            from,
            to: leader,
            kind: InviteKind::Ask,
            tick,
            name: String::new(),
        });
        events.push(Event::AskedToJoin { from, to: leader });
        Ok(())
    }

    /// `to` answers the invitation or request of `from`.
    pub(crate) fn answer_faction(
        &mut self,
        from: CountryId,
        to: CountryId,
        accept: bool,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        let at = self
            .invites
            .iter()
            .position(|i| i.from == from && i.to == to)
            .ok_or(Rejection::NoOffer)?;
        let invite = self.invites.remove(at);
        if self.tick().saturating_sub(invite.tick) >= INVITE_DAYS * 24 {
            return Err(Rejection::NoOffer); // it ran out
        }
        if !accept {
            events.push(Event::FactionRefused { from, to });
            let until = self.tick() + REFUSED_DAYS * 24;
            self.faction_refused.insert((from, to), until);
            return Ok(());
        }
        let (joining, head) = match invite.kind {
            InviteKind::Invite => (to, from),
            InviteKind::Ask => (from, to),
        };
        if invite.kind == InviteKind::Ask && !self.leads(head) {
            return Err(Rejection::NoFaction);
        }
        self.can_join(joining, head)?;
        let faction = match self.faction_index(head) {
            Some(index) => {
                let faction = &mut self.factions[index];
                faction.members.push(joining);
                faction.members.sort_unstable();
                faction.id
            }
            None => {
                let id = self.found_faction(&invite.name, head, vec![head, joining]);
                events.push(Event::FactionFormed {
                    faction: id,
                    leader: head,
                });
                id
            }
        };
        events.push(Event::JoinedFaction {
            country: joining,
            faction,
        });
        Ok(())
    }

    /// The leader names its faction.
    pub(crate) fn rename_faction(
        &mut self,
        leader: CountryId,
        name: &str,
    ) -> Result<(), Rejection> {
        let index = self.faction_index(leader).ok_or(Rejection::NoFaction)?;
        if self.factions[index].leader != leader {
            return Err(Rejection::NotLeader);
        }
        self.factions[index].name = name.to_string();
        Ok(())
    }

    /// `country` leaves its faction (`separate_peace`: because it made
    /// peace on its own). See the module docs.
    pub(crate) fn leave_faction(
        &mut self,
        country: CountryId,
        separate_peace: bool,
        events: &mut Vec<Event>,
    ) {
        let Some(index) = self.faction_index(country) else {
            return;
        };
        self.factions[index].members.retain(|&m| m != country);
        // Its calls to arms, either way, are moot.
        self.calls
            .retain(|c| c.ally != country && c.attacker != country);
        let id = self.factions[index].id;
        events.push(Event::LeftFaction {
            country,
            faction: id,
            separate_peace,
        });
        let members = self.factions[index].members.clone();
        if members.len() < 2 {
            self.factions.remove(index);
            events.push(Event::FactionDissolved {
                faction: id,
                last: members.first().copied().unwrap_or(0),
            });
        } else if self.factions[index].leader == country {
            let leader = self.strongest(&members);
            self.factions[index].leader = leader;
            events.push(Event::FactionLeader {
                faction: id,
                leader,
            });
        }
    }

    /// `attacker` declared war on `target`: `target`'s faction defends it.
    pub(crate) fn defend(
        &mut self,
        attacker: CountryId,
        target: CountryId,
        events: &mut Vec<Event>,
    ) {
        // A puppet is defended by its overlord's faction (its overlord is
        // in the war already, see `drag_in`).
        let head = self.overlord(target).unwrap_or(target);
        let defenders: Vec<CountryId> = self
            .allies(head)
            .into_iter()
            .filter(|&ally| {
                ally != attacker
                    && ally != target
                    && !self.at_war(ally, attacker)
                    && !self.allied(ally, attacker)
                    && !self.in_conference(ally)
            })
            .collect();
        if defenders.is_empty() {
            return;
        }
        // One event for all of them, not a declaration each.
        for &ally in &defenders {
            self.open_war(attacker, ally);
            // Peace for a puppet is its overlord's: remember the overlord.
            self.defending.insert((ally, attacker), head);
        }
        events.push(Event::Defended {
            ally: target,
            attacker,
            defenders: defenders.clone(),
        });
        for &ally in &defenders {
            self.drag_in_quietly(attacker, ally);
        }
    }

    /// `attacker` declared war on `target`: its faction is called to arms.
    pub(crate) fn call_allies(
        &mut self,
        attacker: CountryId,
        target: CountryId,
        events: &mut Vec<Event>,
    ) {
        let tick = self.tick();
        let allies: Vec<CountryId> = self
            .allies(attacker)
            .into_iter()
            .filter(|&ally| !self.at_war(ally, target) && !self.allied(ally, target))
            .collect();
        if allies.is_empty() {
            return;
        }
        for &ally in &allies {
            self.calls.push(Call {
                ally,
                attacker,
                target,
                tick,
            });
        }
        events.push(Event::CalledToArms {
            attacker,
            target,
            allies,
        });
    }

    /// `ally` answers the call to join `attacker`'s war on `target`.
    pub(crate) fn answer_call(
        &mut self,
        ally: CountryId,
        attacker: CountryId,
        target: CountryId,
        join: bool,
        events: &mut Vec<Event>,
    ) -> Result<(), Rejection> {
        let at = self
            .calls
            .iter()
            .position(|c| (c.ally, c.attacker, c.target) == (ally, attacker, target))
            .ok_or(Rejection::NoCall)?;
        let call = self.calls.remove(at);
        // Too late, or the two are no longer allies.
        if self.tick().saturating_sub(call.tick) >= CALL_DAYS * 24 || !self.allied(ally, attacker) {
            return Err(Rejection::NoCall);
        }
        if join {
            // Joined: its other calls against the same target are moot.
            self.calls
                .retain(|c| !(c.ally == ally && c.target == target));
        }
        if join && !self.at_war(ally, target) {
            if !self.at_war(attacker, target) {
                return Err(Rejection::NotAtWar);
            }
            self.check_declare_war(ally, target)?;
            self.begin_war(ally, target, events);
            self.drag_in(ally, target, events);
            self.defend(ally, target, events);
        }
        events.push(Event::CallAnswered {
            ally,
            attacker,
            target,
            join,
        });
        Ok(())
    }

    /// A war between `attacker` and `target` that a scenario starts with:
    /// each side's overlord and puppets and `target`'s faction are in it,
    /// but nobody is called to arms.
    pub fn start_scenario_war(&mut self, attacker: CountryId, target: CountryId) -> Vec<Event> {
        let mut events = Vec::new();
        if self.check_declare_war(attacker, target).is_ok() {
            self.begin_war(attacker, target, &mut events);
            self.drag_in(attacker, target, &mut events);
            self.defend(attacker, target, &mut events);
        }
        events
    }

    /// Peace between `a` and `b` on `terms`, with what it means for their
    /// factions (see the module docs).
    pub(crate) fn make_peace(
        &mut self,
        a: CountryId,
        b: CountryId,
        terms: Option<&[u16]>,
        events: &mut Vec<Event>,
    ) {
        self.end_war_on(a, b, terms, events);
        let side = |c: CountryId| {
            if self.leads(c) {
                self.faction_of(c)
                    .map(|f| f.members.clone())
                    .unwrap_or_default()
            } else {
                vec![c]
            }
        };
        let (ours, theirs) = (side(a), side(b));
        for &x in &ours {
            for &y in &theirs {
                if self.at_war(x, y) {
                    events.push(Event::PeaceMade { from: x, to: y });
                    self.end_war_on(x, y, Some(&[]), events);
                }
            }
        }
        // Those who went to war only to defend one side make peace with the
        // other too: for every pair this peace covers (with a leader's, its
        // whole faction).
        let covered: Vec<(CountryId, CountryId)> = ours
            .iter()
            .flat_map(|&x| theirs.iter().flat_map(move |&y| [(x, y), (y, x)]))
            .collect();
        for (country, enemy) in covered {
            let defenders: Vec<CountryId> = self
                .defending
                .iter()
                .filter(|&(&(_, attacker), &ally)| attacker == country && ally == enemy)
                .map(|(&(defender, _), _)| defender)
                .collect();
            for defender in defenders {
                if self.at_war(defender, country) {
                    events.push(Event::PeaceMade {
                        from: defender,
                        to: country,
                    });
                    self.end_war_on(defender, country, Some(&[]), events);
                }
            }
        }
        for (country, enemy) in [(a, b), (b, a)] {
            let separate =
                !self.leads(country) && self.allies(country).iter().any(|&m| self.at_war(m, enemy));
            if separate {
                self.leave_faction(country, true, events);
            }
        }
    }

    /// Whether peace with `enemy` would be a separate one for `country`:
    /// it is a member, not the leader, and another member fights `enemy`.
    pub fn separate_peace(&self, country: CountryId, enemy: CountryId) -> bool {
        !self.leads(country) && self.allies(country).iter().any(|&m| self.at_war(m, enemy))
    }

    /// Drop invitations older than `INVITE_DAYS`, and calls older than
    /// `CALL_DAYS` or whose war is over.
    pub(crate) fn expire_factions(&mut self) {
        let now = self.tick();
        self.invites
            .retain(|i| now.saturating_sub(i.tick) < INVITE_DAYS * 24);
        self.faction_refused.retain(|_, &mut until| now < until);
        let calls = std::mem::take(&mut self.calls);
        self.calls = calls
            .into_iter()
            .filter(|c| {
                now.saturating_sub(c.tick) < CALL_DAYS * 24
                    && self.at_war(c.attacker, c.target)
                    && !self.at_war(c.ally, c.target)
            })
            .collect();
    }

    /// Count every border between countries, cell side by cell side, from
    /// who holds which cell (a new world, or a loaded one). `set_control`
    /// keeps the count up to date (`count_border_sides`); `bordering` reads
    /// it.
    pub(crate) fn refresh_borders(&mut self) {
        let mut sides: BTreeMap<(CountryId, CountryId), u32> = BTreeMap::new();
        for (cell, &holder) in self.control.iter().enumerate() {
            if holder == 0 {
                continue;
            }
            for next in self.map.sides(cell as Cell) {
                let other = self.control[next as usize];
                if other != 0 && other != holder {
                    *sides.entry((holder, other)).or_default() += 1;
                }
            }
        }
        self.border_sides = sides;
    }

    /// `cell` goes from `from` to `to`: the border counts around it change.
    pub(crate) fn count_border_sides(&mut self, cell: Cell, from: CountryId, to: CountryId) {
        let change = |a: CountryId, b: CountryId, up: bool, sides: &mut BTreeMap<_, u32>| {
            for key in [(a, b), (b, a)] {
                if up {
                    *sides.entry(key).or_default() += 1;
                } else if let Some(count) = sides.get_mut(&key) {
                    *count -= 1;
                    if *count == 0 {
                        sides.remove(&key);
                    }
                }
            }
        };
        let mut sides = std::mem::take(&mut self.border_sides);
        for next in self.map.sides(cell) {
            let other = self.control[next as usize];
            if other == 0 {
                continue;
            }
            if from != 0 && other != from {
                change(from, other, false, &mut sides);
            }
            if to != 0 && other != to {
                change(to, other, true, &mut sides);
            }
        }
        self.border_sides = sides;
    }

    /// `country`'s land neighbors now, in id order.
    pub fn bordering(&self, country: CountryId) -> Vec<CountryId> {
        self.border_sides
            .range((country, 0)..=(country, CountryId::MAX))
            .map(|(&(_, other), _)| other)
            .collect()
    }

    /// The neighbor that threatens `country`: the strongest land neighbor
    /// not on its side and not in `outside`, at least `THREAT_RATIO` times
    /// as strong as it (ties: the lower id).
    pub fn threat(&self, country: CountryId, outside: &[CountryId]) -> Option<CountryId> {
        let own = self.family_power(country);
        self.bordering(country)
            .iter()
            .copied()
            .filter(|&n| !outside.contains(&n) && !self.allied(country, n))
            .map(|n| (n, self.family_power(n)))
            .filter(|&(_, power)| power > 0.0 && power >= THREAT_RATIO * own)
            .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(&a.0)))
            .map(|(n, _)| n)
    }

    /// Whether the AI running `country` accepts what `from` asks of it (an
    /// invitation, or as a leader a request to join).
    pub fn ai_accepts(&self, from: CountryId, country: CountryId, kind: InviteKind) -> bool {
        match kind {
            InviteKind::Invite => {
                let side = self
                    .faction_of(from)
                    .map_or(vec![from], |f| f.members.clone());
                self.threat(country, &side).is_some()
            }
            InviteKind::Ask => {
                let members = self.faction_of(country).map(|f| f.members.clone());
                members
                    .is_some_and(|members| self.bordering(from).iter().any(|n| members.contains(n)))
            }
        }
    }

    /// Whether the AI running `ally` joins `attacker`'s war on `target`.
    pub fn ai_joins(&self, ally: CountryId, attacker: CountryId, target: CountryId) -> bool {
        let ready = self
            .economy(ally)
            .is_some_and(|e| e.support >= JOIN_SUPPORT);
        let mut enemies: BTreeSet<CountryId> = self.enemies(attacker).into_iter().collect();
        enemies.insert(target);
        let mut ours: BTreeSet<CountryId> = self.enemies(target).into_iter().collect();
        ours.insert(attacker);
        ours.extend(self.family(ally));
        let borders = self.bordering(ally).iter().any(|n| enemies.contains(n));
        let power =
            |side: &BTreeSet<CountryId>| side.iter().map(|&c| self.army_power(c)).sum::<f64>();
        ready && borders && power(&ours) >= JOIN_RATIO * power(&enemies)
    }

    /// Whether `to` said no to `from` less than `REFUSED_DAYS` ago (an AI
    /// does not ask it again meanwhile).
    pub fn was_refused(&self, from: CountryId, to: CountryId) -> bool {
        self.faction_refused
            .get(&(from, to))
            .is_some_and(|&until| self.tick() < until)
    }

    /// Whether threatened AI countries look for factions (on in a new or
    /// loaded game; for tests and setups).
    pub fn set_faction_seeking(&mut self, on: bool) {
        self.seek_factions = on;
    }

    /// What a threatened AI in no faction does about it this week, if
    /// anything: ask a faction in, or invite a neighbor to form one.
    pub(crate) fn ai_seek_faction(&self, country: CountryId) -> Option<crate::world::Command> {
        use crate::world::Command;
        let week = (self.tick() / 24 + u64::from(country)).is_multiple_of(SEEK_EVERY_DAYS);
        if !self.seek_factions
            || !week
            || self.faction_of(country).is_some()
            || self.overlord(country).is_some()
            || self.in_conference(country)
            || self.invites.iter().any(|i| i.from == country)
        {
            return None;
        }
        let threat = self.threat(country, &[])?;
        let near = self.bordering(country);
        let borders = |c: CountryId| near.contains(&c);
        let faction_power =
            |f: &Faction| f.members.iter().map(|&m| self.family_power(m)).sum::<f64>();
        let best = self
            .factions
            .iter()
            .filter(|f| !f.members.contains(&threat) && !self.was_refused(country, f.leader))
            .filter(|f| f.members.iter().any(|&m| borders(m)))
            .filter(|f| self.can_join(country, f.leader).is_ok())
            .max_by(|a, b| {
                faction_power(a)
                    .total_cmp(&faction_power(b))
                    .then(b.id.cmp(&a.id))
            });
        if let Some(faction) = best {
            return Some(Command::AskToJoin {
                faction: faction.id,
            });
        }
        near.iter()
            .copied()
            .filter(|&n| n != threat && self.can_join(n, country).is_ok())
            .filter(|&n| !self.invite_open(country, n) && !self.was_refused(country, n))
            .filter(|&n| self.threat(n, &[]) == Some(threat))
            .max_by(|&a, &b| {
                self.family_power(a)
                    .total_cmp(&self.family_power(b))
                    .then(b.cmp(&a))
            })
            .map(|target| Command::InviteToFaction {
                target,
                name: String::new(),
            })
    }
}
