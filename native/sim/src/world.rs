//! The world state and the only way to change it: orders.
//!
//! Every country has a controller (the player, the AI, or nobody). A
//! controller never touches the state directly; it submits an `Order` for a
//! tick. At the start of that tick the world applies all due orders, sorted
//! by country id and then by submission, so the result never depends on who
//! was faster. Same seed + same orders = same world, which makes replays,
//! saves and AI testing straightforward.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::army::{ArmyGroup, ArmyGroupId, PLAN_EVERY};
use crate::conference::{Conference, Move};
use crate::diplomacy::PeaceOffer;
use crate::division::{Division, DivisionId, Loss, SpawnError};
use crate::economy::{Budget, Economy, SERVE_PER_MILLE};
use crate::factions::{Call, Faction, FactionId, Invite};
use crate::map::{Cell, MapData};
use crate::path;
use crate::record::{Tally, WarRecord};
use crate::rng::Rng;
use crate::scenario::Scenario;
use crate::terms::RegionMap;
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
    pub economy: Economy,
    /// What its wars cost it so far (see `record.rs`).
    pub record: WarRecord,
    /// The country it is a puppet of (see `conference.rs`).
    #[serde(default)]
    pub overlord: Option<CountryId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Command {
    DeclareWar {
        target: CountryId,
    },
    /// Walk to a cell; attack whatever enemy stands in the way. Moving to
    /// the cell the division stands on stops it. A division in an army
    /// group leaves it: direct orders take over from the group's.
    MoveDivision {
        division: DivisionId,
        to: Cell,
    },
    /// A new army group (possibly empty). Divisions leave their old group.
    CreateArmyGroup {
        divisions: Vec<DivisionId>,
    },
    /// Move divisions into a group, out of their old one.
    AssignDivisions {
        group: ArmyGroupId,
        divisions: Vec<DivisionId>,
    },
    /// Give a group a front: a line drawn near a border (see `army`).
    SetFront {
        group: ArmyGroupId,
        line: Vec<Cell>,
    },
    /// Give a group an arrow from its front into enemy land, the tip last.
    /// An empty line takes the arrow away.
    DrawArrow {
        group: ArmyGroupId,
        line: Vec<Cell>,
    },
    /// Shares of income, in percent, for recruiting and for equipment.
    SetBudget {
        recruiting: u8,
        equipment: u8,
    },
    /// 0 (peacetime) to 3 (total mobilization).
    SetMobilization {
        level: u8,
    },
    /// Offer peace to a country this one is at war with, on terms: the
    /// regions of either side that change hands (empty: a white peace).
    OfferPeace {
        to: CountryId,
        terms: Vec<u16>,
    },
    /// Accept or refuse a peace offer from `from`.
    AnswerPeace {
        from: CountryId,
        accept: bool,
    },
    /// At the conference on `loser`, on this country's turn: take a region
    /// (its index) of the loser's not taken yet.
    TakeRegion {
        loser: CountryId,
        region: u16,
    },
    /// At the conference: make the loser this country's puppet.
    MakePuppet {
        loser: CountryId,
    },
    /// At the conference, once every other winner is done: take every
    /// region left.
    AnnexRest {
        loser: CountryId,
    },
    /// At the conference: take nothing more.
    LeaveConference {
        loser: CountryId,
    },
    /// Invite a country in no faction into this one's faction (as its
    /// leader), or, in none, to form one named `name` (empty: unnamed).
    InviteToFaction {
        target: CountryId,
        name: String,
    },
    /// Ask a faction's leader to let this country in.
    AskToJoin {
        faction: FactionId,
    },
    /// Accept or refuse an invitation or request from `from`.
    AnswerFaction {
        from: CountryId,
        accept: bool,
    },
    LeaveFaction,
    /// The leader names its faction.
    RenameFaction {
        name: String,
    },
    /// Join (or not) an ally's war on `target`, as called to arms.
    AnswerCall {
        attacker: CountryId,
        target: CountryId,
        join: bool,
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
    ArmyGroupCreated {
        group: ArmyGroupId,
        country: CountryId,
    },
    /// The group took its arrow's tip; it holds from here.
    ArrowReached {
        group: ArmyGroupId,
    },
    /// A new division, raised at the country's supply source.
    DivisionRecruited {
        division: DivisionId,
        country: CountryId,
    },
    PeaceOffered {
        from: CountryId,
        to: CountryId,
    },
    /// `to` accepted the peace `from` offered; their war is over.
    PeaceMade {
        from: CountryId,
        to: CountryId,
    },
    PeaceRefused {
        from: CountryId,
        to: CountryId,
    },
    /// The country gave up: its wars are over and its divisions surrendered.
    Capitulated {
        country: CountryId,
    },
    /// The country's war support ran out; it capitulates.
    SupportCollapsed {
        country: CountryId,
    },
    /// A peace handed `regions` regions that `from` owned by law to `to`.
    RegionsCeded {
        from: CountryId,
        to: CountryId,
        regions: u32,
    },
    /// `loser` capitulated; its enemies divide its land, in this order.
    ConferenceOpened {
        loser: CountryId,
        winners: Vec<CountryId>,
    },
    /// At the conference on `loser`, `by` took a region (its index).
    RegionTaken {
        loser: CountryId,
        by: CountryId,
        region: usize,
    },
    /// The conference on `loser` is over and its land settled.
    ConferenceClosed {
        loser: CountryId,
    },
    Puppeted {
        country: CountryId,
        overlord: CountryId,
    },
    /// Its overlord capitulated (or it did): the puppet is free.
    PuppetFreed {
        country: CountryId,
    },
    /// `from` invited `to` into its faction (or to form one).
    FactionInvited {
        from: CountryId,
        to: CountryId,
    },
    /// `from` asked `to`, a leader, to let it into its faction.
    AskedToJoin {
        from: CountryId,
        to: CountryId,
    },
    /// `to` said no to `from`'s invitation or request.
    FactionRefused {
        from: CountryId,
        to: CountryId,
    },
    FactionFormed {
        faction: FactionId,
        leader: CountryId,
    },
    JoinedFaction {
        country: CountryId,
        faction: FactionId,
    },
    /// `separate_peace`: it made peace while its allies fight on.
    LeftFaction {
        country: CountryId,
        faction: FactionId,
        separate_peace: bool,
    },
    /// The faction has a new leader.
    FactionLeader {
        faction: FactionId,
        leader: CountryId,
    },
    /// One country left (`last`): the faction is no more.
    FactionDissolved {
        faction: FactionId,
        last: CountryId,
    },
    /// `attacker`, a member, declared war on `target`; `allies` may join.
    CalledToArms {
        attacker: CountryId,
        target: CountryId,
        allies: Vec<CountryId>,
    },
    CallAnswered {
        ally: CountryId,
        attacker: CountryId,
        target: CountryId,
        join: bool,
    },
    /// `attacker` attacked `ally`: its faction's `defenders` are at war
    /// with `attacker` from now on.
    Defended {
        ally: CountryId,
        attacker: CountryId,
        defenders: Vec<CountryId>,
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
    /// No land route the division may take (water, or a country it is not
    /// at war with), or an arrow pointing at water.
    Unreachable,
    UnknownArmyGroup,
    NotYourArmyGroup,
    /// The drawn front is not near the group's border with any country.
    NoFrontHere,
    /// Arrows start from a front; the group has none.
    NoFront,
    /// Budget shares add up to more than 100%.
    BadBudget,
    /// Mobilization goes from 0 to 3.
    BadMobilization,
    /// Peace can only be offered to an enemy.
    NotAtWar,
    /// There is no open peace offer from that country.
    NoOffer,
    /// A peace offer to that country is already open.
    AlreadyOffered,
    /// That country refused this one's peace less than
    /// `diplomacy::TALKS_CLOSED_DAYS` ago.
    TalksClosed,
    /// Peace terms named a region neither side owns by law, or a conference
    /// move a region not left to take.
    NotTheirRegion,
    /// A puppet cannot do that: declare war, make peace, or take a puppet;
    /// and no one declares war on its own puppet or overlord.
    Puppet,
    /// No conference on that country is open.
    NoConference,
    /// Another winner's turn at the conference.
    NotYourTurn,
    /// Annexing the rest waits until every other winner is done.
    OthersStillPicking,
    /// A country whose land a conference is dividing is not at war with
    /// anyone, and cannot be attacked.
    InConference,
    /// No war on an ally (a member of one's faction, or its puppet).
    Ally,
    /// The country is in a faction already (one at most).
    InFaction,
    /// Only a faction's leader invites or names it.
    NotLeader,
    /// Not in a faction, or no such faction.
    NoFaction,
    /// No alliance with a country at war with one's side.
    Enemy,
    /// No open call to arms for that war.
    NoCall,
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
    pub(crate) countries: Vec<CountryState>,
    /// Pairs at war, stored as (lower id, higher id), with the tick each
    /// war began.
    pub(crate) wars: BTreeMap<(CountryId, CountryId), u64>,
    /// Military control per grid cell (0 = nobody).
    pub(crate) control: Vec<u16>,
    /// Sorted by id.
    pub(crate) divisions: Vec<Division>,
    next_division: u32,
    /// Sorted by id.
    pub(crate) groups: Vec<ArmyGroup>,
    next_group: u32,
    /// Open peace offers, sorted by (from, to).
    pub(crate) offers: Vec<PeaceOffer>,
    /// (from, to) -> the tick until which `from` may not offer `to` peace
    /// again, after `to` refused it.
    pub(crate) talks_closed: BTreeMap<(CountryId, CountryId), u64>,
    /// Open peace conferences, oldest first (`conference.rs`).
    pub(crate) conferences: Vec<Conference>,
    /// (winner, loser) -> soldiers of the loser the winner put out of
    /// action in their current (or last) war.
    pub(crate) defeated: BTreeMap<(CountryId, CountryId), u64>,
    /// Factions, oldest first (`factions.rs`).
    pub(crate) factions: Vec<Faction>,
    pub(crate) next_faction: FactionId,
    /// Open invitations and requests to join a faction, oldest first.
    pub(crate) invites: Vec<Invite>,
    /// Open calls to arms, oldest first.
    pub(crate) calls: Vec<Call>,
    /// (defender, attacker) -> the ally the defender went to war for
    /// (`World::defend`), while that war lasts.
    pub(crate) defending: BTreeMap<(CountryId, CountryId), CountryId>,
    /// (from, to) -> the tick until which an AI `from` does not ask `to`
    /// into a faction again, after `to` said no.
    pub(crate) faction_refused: BTreeMap<(CountryId, CountryId), u64>,
    /// (a, b) -> cell sides where land `a` holds touches land `b` holds,
    /// kept up to date as cells change hands (`World::refresh_borders`);
    /// worked out again from the control map when a save loads.
    #[serde(skip)]
    pub(crate) border_sides: BTreeMap<(CountryId, CountryId), u32>,
    /// Orders not applied yet, sorted by (tick, country, seq).
    pending: Vec<Queued>,
    next_seq: u64,
    /// Regions a peace handed to a new owner by law: region index -> owner.
    pub(crate) ceded: BTreeMap<u16, CountryId>,
    /// Set when peace terms count regions; a save only loads with the same
    /// region map.
    pub(crate) regions_fingerprint: Option<u64>,
    /// The fixed map, rebuilt from the scenario when a save loads.
    #[serde(skip)]
    pub(crate) map: Arc<MapData>,
    /// The region map, given again when a save loads.
    #[serde(skip)]
    pub(crate) regions: Option<Arc<RegionMap>>,
    /// An AI at peace with a much weaker neighbor attacks it about once in
    /// this many days (`ai::AGGRESSION_DAYS`; 0 never). Not saved: a loaded
    /// game uses the default. See `set_aggression_days`.
    #[serde(skip, default = "default_aggression_days")]
    pub(crate) aggression_days: u32,
    /// Whether threatened AI countries look for factions (`factions.rs`).
    /// Not saved: a loaded game has it on.
    #[serde(skip, default = "seek_by_default")]
    pub(crate) seek_factions: bool,
}

fn default_aggression_days() -> u32 {
    crate::ai::AGGRESSION_DAYS
}

fn seek_by_default() -> bool {
    true
}

/// Used when a scenario has no start date.
const DEFAULT_START: Date = Date {
    year: 2026,
    month: 1,
    day: 1,
};

impl World {
    /// A fresh game on `scenario`. Every country starts passive; whoever
    /// starts the game hands countries to the player and the AI.
    pub fn new(scenario: &Scenario, seed: u64) -> World {
        let mut countries: Vec<CountryState> = scenario
            .countries
            .iter()
            .flatten()
            .map(|c| CountryState {
                id: c.id,
                controller: Controller::Passive,
                economy: Economy::new(c.pop.unwrap_or(0.0).max(0.0) as u64),
                record: WarRecord::default(),
                overlord: None,
            })
            .collect();
        countries.sort_by_key(|c| c.id);
        let mut world = World {
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
            wars: BTreeMap::new(),
            control: scenario.control.clone(),
            divisions: Vec::new(),
            next_division: 1,
            groups: Vec::new(),
            next_group: 1,
            offers: Vec::new(),
            talks_closed: BTreeMap::new(),
            conferences: Vec::new(),
            defeated: BTreeMap::new(),
            factions: Vec::new(),
            next_faction: 1,
            invites: Vec::new(),
            calls: Vec::new(),
            defending: BTreeMap::new(),
            faction_refused: BTreeMap::new(),
            border_sides: BTreeMap::new(),
            pending: Vec::new(),
            next_seq: 0,
            ceded: BTreeMap::new(),
            regions_fingerprint: None,
            map: Arc::new(MapData::new(scenario)),
            regions: None,
            aggression_days: default_aggression_days(),
            seek_factions: true,
        };
        world.count_output();
        world.refresh_borders();
        world
    }

    /// Give a loaded save its map back.
    pub(crate) fn attach(&mut self, scenario: &Scenario) {
        self.map = Arc::new(MapData::new(scenario));
        self.refresh_borders();
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
        let index = self.index_of(country).expect("checked above");
        let economy = &mut self.countries[index].economy;
        economy.drafted = economy.drafted.saturating_add(u64::from(personnel));
        Ok(id)
    }

    pub fn divisions(&self) -> &[Division] {
        &self.divisions
    }

    pub fn division(&self, id: DivisionId) -> Option<&Division> {
        self.division_index(id).map(|i| &self.divisions[i])
    }

    /// Form an army group at once, without an order. For setting up a game
    /// (and for tests); during play groups come from `CreateArmyGroup`.
    pub fn create_army_group(
        &mut self,
        country: CountryId,
        divisions: &[DivisionId],
    ) -> Result<ArmyGroupId, Rejection> {
        if self.index_of(country).is_none() {
            return Err(Rejection::UnknownCountry);
        }
        self.check_divisions(country, divisions)?;
        self.leave_groups(divisions);
        let id = ArmyGroupId(self.next_group);
        self.next_group += 1;
        let mut divisions = divisions.to_vec();
        divisions.sort_unstable();
        divisions.dedup();
        self.groups.push(ArmyGroup {
            id,
            country,
            divisions,
            enemy: None,
            front: Vec::new(),
            arrow: Vec::new(),
        });
        Ok(id)
    }

    /// Open peace offers, sorted by (from, to).
    pub fn peace_offers(&self) -> &[PeaceOffer] {
        &self.offers
    }

    pub fn economy(&self, country: CountryId) -> Option<&Economy> {
        self.country(country).map(|c| &c.economy)
    }

    pub fn army_groups(&self) -> &[ArmyGroup] {
        &self.groups
    }

    pub fn army_group(&self, id: ArmyGroupId) -> Option<&ArmyGroup> {
        self.group_index(id).map(|i| &self.groups[i])
    }

    /// The next tick to run; also the number of ticks run so far.
    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn time(&self) -> GameTime {
        time_at(self.start, self.tick)
    }

    /// The date and hour of a tick of this game.
    pub fn time_of(&self, tick: u64) -> GameTime {
        time_at(self.start, tick)
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
        self.wars.contains_key(&pair(a, b))
    }

    /// The tick the war between `a` and `b` began, if they are at war.
    pub fn war_began(&self, a: CountryId, b: CountryId) -> Option<u64> {
        self.wars.get(&pair(a, b)).copied()
    }

    /// What `country`'s wars cost it so far, or None for an unknown country.
    pub fn war_record(&self, country: CountryId) -> Option<&WarRecord> {
        self.country(country).map(|c| &c.record)
    }

    /// Add soldiers lost (`lost`) or put out of action (`inflicted`) to a
    /// country's record.
    pub(crate) fn count_losses(&mut self, country: CountryId, lost: u64, inflicted: u64) {
        if let Some(index) = self.index_of(country) {
            let record = &mut self.countries[index].record;
            for tally in [&mut record.total, &mut record.war] {
                tally.lost += lost;
                tally.inflicted += inflicted;
            }
        }
    }

    /// How many wars are going on: groups of countries linked by fighting
    /// each other (a faction defending a member is one war, not one for
    /// each pair of countries at war).
    pub fn war_count(&self) -> usize {
        fn find(head: &mut BTreeMap<CountryId, CountryId>, c: CountryId) -> CountryId {
            let parent = *head.entry(c).or_insert(c);
            if parent == c {
                return c;
            }
            let root = find(head, parent);
            head.insert(c, root);
            root
        }
        let mut head: BTreeMap<CountryId, CountryId> = BTreeMap::new();
        for &(a, b) in self.wars.keys() {
            let (ra, rb) = (find(&mut head, a), find(&mut head, b));
            if ra != rb {
                head.insert(ra.max(rb), ra.min(rb));
            }
        }
        let countries: Vec<CountryId> = head.keys().copied().collect();
        let roots: BTreeSet<CountryId> =
            countries.into_iter().map(|c| find(&mut head, c)).collect();
        roots.len()
    }

    /// The countries at war with `country`, in id order.
    pub fn enemies(&self, country: CountryId) -> Vec<CountryId> {
        let mut enemies: Vec<CountryId> = self
            .wars
            .keys()
            .filter_map(|&(a, b)| match country {
                c if c == a => Some(b),
                c if c == b => Some(a),
                _ => None,
            })
            .collect();
        enemies.sort_unstable();
        enemies
    }

    /// The countries holding land next to land `country` holds, with the
    /// length of each shared border in cell sides, longest first (ties in
    /// id order). Only land is ever held, so held cells are land.
    pub fn neighbors(&self, country: CountryId) -> Vec<(CountryId, u32)> {
        let mut shared: BTreeMap<CountryId, u32> = BTreeMap::new();
        for (cell, &holder) in self.control.iter().enumerate() {
            if holder != country {
                continue;
            }
            for next in self.map.sides(cell as Cell) {
                let other = self.control[next as usize];
                if other != 0 && other != country {
                    *shared.entry(other).or_default() += 1;
                }
            }
        }
        let mut neighbors: Vec<(CountryId, u32)> = shared.into_iter().collect();
        neighbors.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        neighbors
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

    /// Run one tick: apply the orders due now, let the AI countries whose
    /// hour it is think, re-plan army groups (every few hours, and after
    /// group orders), fight, march, take ground, check supply (once a day),
    /// pay out the economy and update war support (once a day), then
    /// advance time.
    pub fn step(&mut self) -> Vec<Event> {
        let mut events = Vec::new();
        let mut replan = self.apply_due(&mut events);
        if !self.conferences.is_empty() {
            self.run_conferences(&mut events);
        }
        replan |= self.run_ai(&mut events);
        if replan || self.tick.is_multiple_of(PLAN_EVERY) {
            self.plan_groups(&mut events);
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
        if self.tick.is_multiple_of(24) {
            self.expire_offers();
            self.expire_factions();
            self.check_capitulation(&mut events);
            self.run_economy(&mut events);
            self.run_support(&mut events);
        }
        self.tick += 1;
        events
    }

    /// Apply the orders due now without running the tick, as `step` does
    /// first: for a paused game, so orders show their effect at once. Army
    /// groups given orders re-plan.
    pub fn apply_orders(&mut self) -> Vec<Event> {
        let mut events = Vec::new();
        if self.apply_due(&mut events) {
            self.plan_groups(&mut events);
        }
        // The AI winners at a conference move once the player has.
        if !self.conferences.is_empty() {
            self.run_conferences(&mut events);
        }
        events
    }

    /// Apply the due orders in order. Returns whether a group needs a plan.
    pub(crate) fn apply_due(&mut self, events: &mut Vec<Event>) -> bool {
        let due = self.pending.partition_point(|q| q.order.tick <= self.tick);
        let orders: Vec<Queued> = self.pending.drain(..due).collect();
        let mut replan = false;
        for queued in orders {
            replan |= self.apply(queued.order, events);
        }
        replan
    }

    /// Countries in at least one war.
    pub(crate) fn countries_at_war(&self) -> BTreeSet<CountryId> {
        self.wars.keys().flat_map(|&(a, b)| [a, b]).collect()
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

    pub(crate) fn group_index(&self, id: ArmyGroupId) -> Option<usize> {
        self.groups.binary_search_by_key(&id, |g| g.id).ok()
    }

    /// Apply one order. Returns whether army groups need a new plan.
    fn apply(&mut self, order: Order, events: &mut Vec<Event>) -> bool {
        let country = order.country;
        let result = match &order.command {
            Command::SetBudget {
                recruiting,
                equipment,
            } => {
                let total = u16::from(*recruiting) + u16::from(*equipment);
                match self.index_of(country) {
                    None => Err(Rejection::UnknownCountry),
                    Some(_) if total > 100 => Err(Rejection::BadBudget),
                    Some(index) => {
                        self.countries[index].economy.budget = Budget {
                            recruiting: *recruiting,
                            equipment: *equipment,
                        };
                        Ok(())
                    }
                }
            }
            Command::SetMobilization { level } => match self.index_of(country) {
                None => Err(Rejection::UnknownCountry),
                Some(_) if usize::from(*level) >= SERVE_PER_MILLE.len() => {
                    Err(Rejection::BadMobilization)
                }
                Some(index) => {
                    self.countries[index].economy.mobilization = *level;
                    Ok(())
                }
            },
            Command::OfferPeace { to, terms } => self.offer_peace(country, *to, terms, events),
            Command::AnswerPeace { from, accept } => {
                self.answer_peace(*from, country, *accept, events)
            }
            Command::TakeRegion { loser, region } => {
                self.conference_move(country, *loser, Move::Take(*region), events)
            }
            Command::MakePuppet { loser } => {
                self.conference_move(country, *loser, Move::Puppet, events)
            }
            Command::AnnexRest { loser } => {
                self.conference_move(country, *loser, Move::AnnexRest, events)
            }
            Command::LeaveConference { loser } => {
                self.conference_move(country, *loser, Move::Leave, events)
            }
            Command::InviteToFaction { target, name } => {
                self.invite(country, *target, name, events)
            }
            Command::AskToJoin { faction } => self.ask_to_join(country, *faction, events),
            Command::AnswerFaction { from, accept } => {
                self.answer_faction(*from, country, *accept, events)
            }
            Command::LeaveFaction => match self.faction_index(country) {
                Some(_) => {
                    self.leave_faction(country, false, events);
                    Ok(())
                }
                None => Err(Rejection::NoFaction),
            },
            Command::RenameFaction { name } => self.rename_faction(country, name),
            Command::AnswerCall {
                attacker,
                target,
                join,
            } => self.answer_call(country, *attacker, *target, *join, events),
            Command::DeclareWar { .. } | Command::MoveDivision { .. } => {
                self.apply_basic(order, events);
                return false;
            }
            Command::CreateArmyGroup { divisions } => self
                .create_army_group(country, divisions)
                .map(|group| events.push(Event::ArmyGroupCreated { group, country })),
            Command::AssignDivisions { group, divisions } => self
                .own_group(country, *group)
                .and_then(|index| Ok((index, self.check_divisions(country, divisions)?)))
                .map(|(index, ())| {
                    self.leave_groups(divisions);
                    let members = &mut self.groups[index].divisions;
                    members.extend(divisions);
                    members.sort_unstable();
                    members.dedup();
                }),
            Command::SetFront { group, line } => {
                self.own_group(country, *group).and_then(|index| {
                    let (enemy, front) = self
                        .snap_front(country, line)
                        .ok_or(Rejection::NoFrontHere)?;
                    let group = &mut self.groups[index];
                    // An arrow into the country it faced no longer fits.
                    if group.enemy != Some(enemy) {
                        group.arrow.clear();
                    }
                    group.enemy = Some(enemy);
                    group.front = front;
                    Ok(())
                })
            }
            Command::DrawArrow { group, line } => {
                self.own_group(country, *group).and_then(|index| {
                    let mut line = line.clone();
                    line.dedup();
                    if !line.is_empty() {
                        if self.groups[index].front.is_empty() {
                            return Err(Rejection::NoFront);
                        }
                        let on_grid = line.iter().all(|&c| (c as usize) < self.map.len());
                        if !on_grid || !self.map.is_land(line[line.len() - 1]) {
                            return Err(Rejection::Unreachable);
                        }
                    }
                    self.groups[index].arrow = line;
                    Ok(())
                })
            }
        };
        match result {
            Ok(()) => true,
            Err(reason) => {
                events.push(Event::Rejected { order, reason });
                false
            }
        }
    }

    /// The index of `country`'s group `id`.
    fn own_group(&self, country: CountryId, id: ArmyGroupId) -> Result<usize, Rejection> {
        let index = self.group_index(id).ok_or(Rejection::UnknownArmyGroup)?;
        if self.groups[index].country != country {
            return Err(Rejection::NotYourArmyGroup);
        }
        Ok(index)
    }

    fn check_divisions(&self, country: CountryId, ids: &[DivisionId]) -> Result<(), Rejection> {
        for &id in ids {
            let index = self.division_index(id).ok_or(Rejection::UnknownDivision)?;
            if self.divisions[index].country != country {
                return Err(Rejection::NotYourDivision);
            }
        }
        Ok(())
    }

    /// Take divisions out of whatever group they are in.
    fn leave_groups(&mut self, ids: &[DivisionId]) {
        for group in &mut self.groups {
            group.divisions.retain(|id| !ids.contains(id));
        }
    }

    fn apply_basic(&mut self, order: Order, events: &mut Vec<Event>) {
        match order.command {
            Command::DeclareWar { target } => match self.check_declare_war(order.country, target) {
                Ok(()) => self.start_war(order.country, target, events),
                Err(reason) => events.push(Event::Rejected { order, reason }),
            },
            Command::MoveDivision { division, to } => {
                match self.plan_move(order.country, division, to) {
                    Ok(()) => self.leave_groups(&[division]),
                    Err(reason) => events.push(Event::Rejected { order, reason }),
                }
            }
            _ => unreachable!("group orders are applied in `apply`"),
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

    /// `attacker` and `target` are at war from now on: each side's overlord
    /// and puppets join in (`World::drag_in`), `target`'s faction defends
    /// it and `attacker`'s is called to arms (`factions.rs`).
    pub(crate) fn start_war(
        &mut self,
        attacker: CountryId,
        target: CountryId,
        events: &mut Vec<Event>,
    ) {
        self.begin_war(attacker, target, events);
        self.drag_in(attacker, target, events);
        self.defend(attacker, target, events);
        self.call_allies(attacker, target, events);
    }

    /// The war itself. A side going from peace to war counts this war's
    /// cost from now on.
    pub(crate) fn begin_war(
        &mut self,
        attacker: CountryId,
        target: CountryId,
        events: &mut Vec<Event>,
    ) {
        self.open_war(attacker, target);
        events.push(Event::WarDeclared { attacker, target });
    }

    /// `begin_war` without the event (a faction's defense reports itself).
    pub(crate) fn open_war(&mut self, attacker: CountryId, target: CountryId) {
        for side in [attacker, target] {
            if self.enemies(side).is_empty()
                && let Some(index) = self.index_of(side)
            {
                self.countries[index].record.war = Tally::default();
            }
        }
        self.defeated.remove(&(attacker, target));
        self.defeated.remove(&(target, attacker));
        self.wars.insert(pair(attacker, target), self.tick);
    }

    pub(crate) fn check_declare_war(
        &self,
        attacker: CountryId,
        target: CountryId,
    ) -> Result<(), Rejection> {
        if self.index_of(attacker).is_none() || self.index_of(target).is_none() {
            Err(Rejection::UnknownCountry)
        } else if attacker == target {
            Err(Rejection::SelfTarget)
        } else if self.at_war(attacker, target) {
            Err(Rejection::AlreadyAtWar)
        } else if self.overlord(attacker).is_some()
            || self.overlord(target) == Some(attacker)
            || self.overlord(attacker) == Some(target)
        {
            Err(Rejection::Puppet)
        } else if self.in_conference(target) || self.in_conference(attacker) {
            Err(Rejection::InConference)
        } else if self.allied(attacker, target) {
            Err(Rejection::Ally)
        } else {
            Ok(())
        }
    }

    pub(crate) fn index_of(&self, id: CountryId) -> Option<usize> {
        self.countries.binary_search_by_key(&id, |c| c.id).ok()
    }
}

fn pair(a: CountryId, b: CountryId) -> (CountryId, CountryId) {
    (a.min(b), a.max(b))
}
