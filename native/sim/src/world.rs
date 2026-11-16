//! The world state and the only way to change it: orders.
//!
//! Every country has a controller (the player, the AI, or nobody). A
//! controller never touches the state directly; it submits an `Order` for a
//! tick. At the start of that tick the world applies all due orders, sorted
//! by country id and then by submission, so the result never depends on who
//! was faster. Same seed + same orders = same world, which makes replays,
//! saves and AI testing straightforward.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::rng::Rng;
use crate::scenario::Scenario;
use crate::time::{Date, GameTime, time_at};

pub type CountryId = u16;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Controller {
    Player,
    Ai,
    /// Takes no actions (used for countries nobody plays).
    Passive,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CountryState {
    pub id: CountryId,
    pub controller: Controller,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Command {
    DeclareWar { target: CountryId },
}

/// A command from one country, to apply at the start of `tick`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Order {
    pub tick: u64,
    pub country: CountryId,
    pub command: Command,
}

/// What happened during a tick, for the UI and for tests.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
    WarDeclared {
        attacker: CountryId,
        target: CountryId,
    },
    Rejected {
        order: Order,
        reason: Rejection,
    },
}

/// Why an order had no effect.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rejection {
    UnknownCountry,
    SelfTarget,
    AlreadyAtWar,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OrderError {
    /// Orders can only be given for the current tick or later.
    InThePast { now: u64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UnknownCountry(pub CountryId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Queued {
    seq: u64,
    order: Order,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct World {
    scenario_fingerprint: u64,
    start: Date,
    tick: u64,
    rng: Rng,
    /// Sorted by id.
    countries: Vec<CountryState>,
    /// Pairs at war, stored as (lower id, higher id).
    wars: BTreeSet<(CountryId, CountryId)>,
    /// Military control per grid cell (0 = nobody).
    control: Vec<u16>,
    /// Orders not applied yet, sorted by (tick, country, seq).
    pending: Vec<Queued>,
    next_seq: u64,
}

/// Used when a scenario has no start date.
const DEFAULT_START: Date = Date {
    year: 2026,
    month: 1,
    day: 1,
};

impl World {
    /// A fresh game on `scenario`. Every country starts on the AI.
    pub fn new(scenario: &Scenario, seed: u64) -> World {
        let mut countries: Vec<CountryState> = scenario
            .countries
            .iter()
            .flatten()
            .map(|c| CountryState {
                id: c.id,
                controller: Controller::Ai,
            })
            .collect();
        countries.sort_by_key(|c| c.id);
        World {
            scenario_fingerprint: scenario.fingerprint,
            start: scenario
                .info
                .start_date
                .as_deref()
                .and_then(Date::parse)
                .unwrap_or(DEFAULT_START),
            tick: 0,
            rng: Rng::new(seed),
            countries,
            wars: BTreeSet::new(),
            control: scenario.control.clone(),
            pending: Vec::new(),
            next_seq: 0,
        }
    }

    /// The next tick to run; also the number of ticks run so far.
    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn time(&self) -> GameTime {
        time_at(self.start, self.tick)
    }

    pub fn countries(&self) -> &[CountryState] {
        &self.countries
    }

    pub fn country(&self, id: CountryId) -> Option<&CountryState> {
        self.index_of(id).map(|i| &self.countries[i])
    }

    pub fn control(&self) -> &[u16] {
        &self.control
    }

    pub fn at_war(&self, a: CountryId, b: CountryId) -> bool {
        self.wars.contains(&pair(a, b))
    }

    pub fn set_controller(
        &mut self,
        id: CountryId,
        controller: Controller,
    ) -> Result<(), UnknownCountry> {
        let index = self.index_of(id).ok_or(UnknownCountry(id))?;
        self.countries[index].controller = controller;
        Ok(())
    }

    /// Queue an order. It is checked when it applies, not now, because the
    /// world may change before its tick.
    pub fn submit(&mut self, order: Order) -> Result<(), OrderError> {
        if order.tick < self.tick {
            return Err(OrderError::InThePast { now: self.tick });
        }
        let queued = Queued {
            seq: self.next_seq,
            order,
        };
        self.next_seq += 1;
        let key = |q: &Queued| (q.order.tick, q.order.country, q.seq);
        let at = self.pending.partition_point(|q| key(q) < key(&queued));
        self.pending.insert(at, queued);
        Ok(())
    }

    /// Run one tick: apply the orders due now, then advance time.
    pub fn step(&mut self) -> Vec<Event> {
        let mut events = Vec::new();
        let due = self.pending.partition_point(|q| q.order.tick <= self.tick);
        let orders: Vec<Queued> = self.pending.drain(..due).collect();
        for queued in orders {
            self.apply(queued.order, &mut events);
        }
        self.tick += 1;
        events
    }

    pub(crate) fn scenario_fingerprint(&self) -> u64 {
        self.scenario_fingerprint
    }

    fn apply(&mut self, order: Order, events: &mut Vec<Event>) {
        match order.command {
            Command::DeclareWar { target } => match self.check_declare_war(order.country, target) {
                Ok(()) => {
                    self.wars.insert(pair(order.country, target));
                    events.push(Event::WarDeclared {
                        attacker: order.country,
                        target,
                    });
                }
                Err(reason) => events.push(Event::Rejected { order, reason }),
            },
        }
    }

    fn check_declare_war(&self, attacker: CountryId, target: CountryId) -> Result<(), Rejection> {
        if self.index_of(attacker).is_none() || self.index_of(target).is_none() {
            Err(Rejection::UnknownCountry)
        } else if attacker == target {
            Err(Rejection::SelfTarget)
        } else if self.at_war(attacker, target) {
            Err(Rejection::AlreadyAtWar)
        } else {
            Ok(())
        }
    }

    fn index_of(&self, id: CountryId) -> Option<usize> {
        self.countries.binary_search_by_key(&id, |c| c.id).ok()
    }
}

fn pair(a: CountryId, b: CountryId) -> (CountryId, CountryId) {
    (a.min(b), a.max(b))
}
