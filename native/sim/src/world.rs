//! The world state and the only way to change it: orders.
//!
//! Every country has a controller (the player, the AI, or nobody). A
//! controller never touches the state directly; it submits an `Order` for a
//! tick. At the start of that tick the world applies all due orders, sorted
//! by country id and then by submission, so the result never depends on who
//! was faster. Same seed + same orders = same world, which makes replays,
//! saves and AI testing straightforward.

use std::collections::BTreeSet;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::division::{Division, DivisionId, Loss, SpawnError};
use crate::map::{Cell, MapData};
use crate::path;
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
    DeclareWar {
        target: CountryId,
    },
    /// Walk to a cell; attack whatever enemy stands in the way. Moving to
    /// the cell the division stands on stops it.
    MoveDivision {
        division: DivisionId,
        to: Cell,
    },
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
    DivisionArrived {
        division: DivisionId,
    },
    /// The route closed (a war ended, say) and no other route exists.
    MoveBlocked {
        division: DivisionId,
    },
    DivisionRetreated {
        division: DivisionId,
        from: Cell,
        to: Cell,
    },
    DivisionDestroyed {
        division: DivisionId,
        country: CountryId,
        cause: Loss,
    },
}

/// Why an order had no effect.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rejection {
    UnknownCountry,
    SelfTarget,
    AlreadyAtWar,
    UnknownDivision,
    NotYourDivision,
    /// No land route the division may take (water, or a country it is not at war with).
    Unreachable,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct World {
    scenario_fingerprint: u64,
    start: Date,
    tick: u64,
    pub(crate) rng: Rng,
    /// Sorted by id.
    countries: Vec<CountryState>,
    /// Pairs at war, stored as (lower id, higher id).
    wars: BTreeSet<(CountryId, CountryId)>,
    /// Military control per grid cell (0 = nobody).
    pub(crate) control: Vec<u16>,
    /// Sorted by id.
    pub(crate) divisions: Vec<Division>,
    next_division: u32,
    /// Orders not applied yet, sorted by (tick, country, seq).
    pending: Vec<Queued>,
    next_seq: u64,
    /// The fixed map, rebuilt from the scenario when a save loads.
    #[serde(skip)]
    pub(crate) map: Arc<MapData>,
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
            divisions: Vec::new(),
            next_division: 1,
            pending: Vec::new(),
            next_seq: 0,
            map: Arc::new(MapData::new(scenario)),
        }
    }

    /// Give a loaded save its map back.
    pub(crate) fn attach(&mut self, scenario: &Scenario) {
        self.map = Arc::new(MapData::new(scenario));
    }

    /// Place a new division at full strength. This is for setting up a game
    /// (and for tests); during play divisions come from recruitment.
    pub fn spawn_division(
        &mut self,
        country: CountryId,
        cell: Cell,
        personnel: u32,
    ) -> Result<DivisionId, SpawnError> {
        if self.index_of(country).is_none() {
            return Err(SpawnError::UnknownCountry);
        }
        if !self.map.is_land(cell) {
            return Err(SpawnError::NotLand);
        }
        if personnel == 0 {
            return Err(SpawnError::NoSoldiers);
        }
        let id = DivisionId(self.next_division);
        self.next_division += 1;
        self.divisions
            .push(Division::new(id, country, cell, personnel));
        Ok(id)
    }

    pub fn divisions(&self) -> &[Division] {
        &self.divisions
    }

    pub fn division(&self, id: DivisionId) -> Option<&Division> {
        self.division_index(id).map(|i| &self.divisions[i])
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

    /// Run one tick: apply the orders due now, fight, march, take ground,
    /// check supply (once a day), then advance time.
    pub fn step(&mut self) -> Vec<Event> {
        let mut events = Vec::new();
        let due = self.pending.partition_point(|q| q.order.tick <= self.tick);
        let orders: Vec<Queued> = self.pending.drain(..due).collect();
        for queued in orders {
            self.apply(queued.order, &mut events);
        }
        if !self.divisions.is_empty() {
            self.fight(&mut events);
            self.march(&mut events);
            self.take_ground();
            if self.tick.is_multiple_of(24) {
                self.check_supply();
            }
            self.upkeep(&mut events);
        }
        self.tick += 1;
        events
    }

    /// Countries in at least one war.
    pub(crate) fn countries_at_war(&self) -> BTreeSet<CountryId> {
        self.wars.iter().flat_map(|&(a, b)| [a, b]).collect()
    }

    pub(crate) fn any_war(&self) -> bool {
        !self.wars.is_empty()
    }

    /// Whether a division of `country` may enter `cell`: land that is its
    /// own, unclaimed, or held by an enemy.
    pub(crate) fn passable(&self, country: CountryId, cell: Cell) -> bool {
        if !self.map.is_land(cell) {
            return false;
        }
        let holder = self.control[cell as usize];
        holder == 0 || holder == country || self.at_war(country, holder)
    }

    /// (cell, division index) for every division, sorted.
    pub(crate) fn occupancy(&self) -> Vec<(Cell, usize)> {
        let mut occupancy: Vec<(Cell, usize)> = self
            .divisions
            .iter()
            .enumerate()
            .map(|(i, d)| (d.cell, i))
            .collect();
        occupancy.sort_unstable();
        occupancy
    }

    pub(crate) fn division_index(&self, id: DivisionId) -> Option<usize> {
        self.divisions.binary_search_by_key(&id, |d| d.id).ok()
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
            Command::MoveDivision { division, to } => {
                if let Err(reason) = self.plan_move(order.country, division, to) {
                    events.push(Event::Rejected { order, reason });
                }
            }
        }
    }

    fn plan_move(&mut self, country: CountryId, id: DivisionId, to: Cell) -> Result<(), Rejection> {
        let index = self.division_index(id).ok_or(Rejection::UnknownDivision)?;
        let division = &self.divisions[index];
        if division.country != country {
            return Err(Rejection::NotYourDivision);
        }
        let route = path::find(&self.map, division.cell, to, |cell| {
            self.passable(country, cell)
        })
        .ok_or(Rejection::Unreachable)?;
        let division = &mut self.divisions[index];
        division.path = route;
        division.progress_m = 0;
        Ok(())
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
