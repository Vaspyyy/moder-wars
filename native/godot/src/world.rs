//! The running simulation, exposed to GDScript. Like the rest of the bridge
//! it only converts: rules live in `mw-sim`.

use godot::classes::IRefCounted;
use godot::prelude::*;
use mw_sim::army::ArmyGroupId;
use mw_sim::division::{DivisionId, Loss};
use mw_sim::forces;
use mw_sim::sandbox::{self, SandboxError};
use mw_sim::scenario::Scenario;
use mw_sim::time::Pacer;
use mw_sim::world::{Command, Controller, Event, Order, Rejection, World};

use crate::MwScenario;

/// Numbers per division in `divisions()`:
/// id, country, longitude, latitude, strength (0..1), morale (0..1), flags,
/// target longitude, target latitude.
const DIVISION_STRIDE: i32 = 9;
const SUPPLIED: f32 = 1.0;
const IN_BATTLE: f32 = 2.0;
const MOVING: f32 = 4.0;

#[derive(GodotClass)]
#[class(base = RefCounted)]
pub struct MwWorld {
    scenario: Option<Gd<MwScenario>>,
    world: Option<World>,
    pacer: Pacer,
    /// Military control as last handed out by `control_changes`.
    shown: Vec<u16>,
    /// Event lines not collected by `take_events` yet.
    log: Vec<String>,
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for MwWorld {
    fn init(base: Base<RefCounted>) -> Self {
        Self {
            scenario: None,
            world: None,
            pacer: Pacer::default(),
            shown: Vec::new(),
            log: Vec::new(),
            base,
        }
    }
}

#[godot_api]
impl MwWorld {
    #[constant]
    const DIVISION_STRIDE: i32 = DIVISION_STRIDE;
    #[constant]
    const SUPPLIED: i32 = SUPPLIED as i32;
    #[constant]
    const IN_BATTLE: i32 = IN_BATTLE as i32;
    #[constant]
    const MOVING: i32 = MOVING as i32;

    /// Start a new game on a loaded scenario. Returns false if it has none.
    #[func]
    fn start(&mut self, scenario: Gd<MwScenario>, seed: i64) -> bool {
        let started = {
            let bound = scenario.bind();
            bound.scenario.as_ref().map(|s| {
                self.shown = s.control.clone();
                World::new(s, seed as u64)
            })
        };
        self.world = started;
        self.scenario = Some(scenario);
        self.pacer = Pacer::default();
        self.log.clear();
        self.world.is_some()
    }

    /// Set up a sandbox war along the border of two countries (see
    /// `mw_sim::sandbox::border_war`). Returns an empty string or the error.
    #[func]
    fn sandbox_war(
        &mut self,
        attacker: i32,
        defender: i32,
        attackers: i32,
        defenders: i32,
    ) -> GString {
        let Some(world) = self.world.as_mut() else {
            return GString::from("no game started");
        };
        let (Ok(attacker), Ok(defender)) = (u16::try_from(attacker), u16::try_from(defender))
        else {
            return GString::from("unknown country");
        };
        let count = |n: i32| usize::try_from(n).unwrap_or(0);
        match sandbox::border_war(
            world,
            attacker,
            defender,
            count(attackers),
            count(defenders),
            10_000,
        ) {
            Ok(_) => GString::new(),
            Err(SandboxError::UnknownCountry) => GString::from("unknown country"),
            Err(SandboxError::NoBorder) => GString::from("the two countries share no border"),
        }
    }

    /// Run the ticks due for `real_seconds` of real time at the current
    /// speed (none while paused). Returns how many ran.
    #[func]
    fn advance(&mut self, real_seconds: f64) -> i32 {
        let ticks = self.pacer.ticks_due(real_seconds);
        self.run(ticks as i32);
        ticks as i32
    }

    /// Run `hours` ticks now, paused or not.
    #[func]
    fn run(&mut self, hours: i32) {
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return;
        };
        let bound = scenario.bind();
        let Some(s) = bound.scenario.as_ref() else {
            return;
        };
        for _ in 0..hours.max(0) {
            for event in world.step() {
                if let Some(line) = describe(s, world, &event) {
                    self.log.push(line);
                }
            }
        }
    }

    #[func]
    fn toggle_pause(&mut self) {
        if self.pacer.is_paused() {
            self.pacer.resume();
        } else {
            self.pacer.pause();
        }
    }

    #[func]
    fn is_paused(&self) -> bool {
        self.pacer.is_paused()
    }

    #[func]
    fn set_speed(&mut self, speed: i32) {
        self.pacer.set_speed(speed.clamp(1, 255) as u8);
    }

    #[func]
    fn speed(&self) -> i32 {
        i32::from(self.pacer.speed())
    }

    /// The game date and hour, e.g. "2026-01-03 14:00".
    #[func]
    fn time_text(&self) -> GString {
        self.world
            .as_ref()
            .map(|w| {
                let time = w.time();
                GString::from(&format!("{} {:02}:00", time.date, time.hour))
            })
            .unwrap_or_default()
    }

    /// Every division, `DIVISION_STRIDE` numbers each (see the constant).
    /// The target is the division's own position when it is not moving.
    #[func]
    fn divisions(&self) -> PackedFloat32Array {
        let Some(world) = self.world.as_ref() else {
            return PackedFloat32Array::new();
        };
        let grid = self.grid();
        let mut data = Vec::with_capacity(world.divisions().len() * DIVISION_STRIDE as usize);
        for d in world.divisions() {
            let (lng, lat) = world.location(d);
            let (target_lng, target_lat) = match (d.target(), grid) {
                (Some(cell), Some(grid)) => grid.center(cell as usize),
                _ => (lng, lat),
            };
            let mut flags = 0.0;
            for (on, flag) in [
                (d.supplied, SUPPLIED),
                (d.in_battle(), IN_BATTLE),
                (d.is_moving(), MOVING),
            ] {
                if on {
                    flags += flag;
                }
            }
            data.extend_from_slice(&[
                d.id.0 as f32,
                f32::from(d.country),
                lng as f32,
                lat as f32,
                d.personnel as f32 / d.establishment.max(1) as f32,
                d.morale,
                flags,
                target_lng as f32,
                target_lat as f32,
            ]);
        }
        PackedFloat32Array::from(data)
    }

    /// The way a division still has to go, as (longitude, latitude) points
    /// from where it is now to its target. Empty if it is not moving.
    #[func]
    fn route(&self, id: i64) -> PackedVector2Array {
        let (Some(world), Some(grid)) = (self.world.as_ref(), self.grid()) else {
            return PackedVector2Array::new();
        };
        let Some(d) = u32::try_from(id)
            .ok()
            .and_then(|id| world.division(DivisionId(id)))
        else {
            return PackedVector2Array::new();
        };
        if !d.is_moving() {
            return PackedVector2Array::new();
        }
        let point = |(lng, lat): (f64, f64)| Vector2::new(lng as f32, lat as f32);
        std::iter::once(point(world.location(d)))
            .chain(d.route().map(|cell| point(grid.center(cell as usize))))
            .collect()
    }

    /// Cells whose military control changed since the last call, as
    /// (x, image row, country) triples; image row 0 is the north edge, as in
    /// `MwScenario.owner_image`.
    #[func]
    fn control_changes(&mut self) -> PackedInt32Array {
        let (Some(world), Some(grid)) = (self.world.as_ref(), self.grid()) else {
            return PackedInt32Array::new();
        };
        let (width, height) = (grid.width as usize, grid.height as usize);
        let mut changes = Vec::new();
        for (cell, (shown, &now)) in self.shown.iter_mut().zip(world.control()).enumerate() {
            if *shown != now {
                *shown = now;
                let (x, y) = (cell % width, cell / width);
                changes.extend_from_slice(&[x as i32, (height - 1 - y) as i32, i32::from(now)]);
            }
        }
        PackedInt32Array::from(changes)
    }

    /// Order divisions to march to a point. Each order is given by the
    /// division's own country and applies at once, paused or not (a target
    /// out of reach shows up in `take_events`); it takes the division out
    /// of its army group. Returns how many orders were given.
    #[func]
    fn move_divisions(&mut self, ids: PackedInt64Array, lng: f64, lat: f64) -> i32 {
        let grid = self.grid();
        let Some(world) = self.world.as_mut() else {
            return 0;
        };
        let Some(to) = grid.and_then(|g| g.cell_at(lng, lat)) else {
            return 0;
        };
        let mut queued = 0;
        for id in ids.as_slice() {
            let Some(division) = u32::try_from(*id).ok().map(DivisionId) else {
                continue;
            };
            let Some(country) = world.division(division).map(|d| d.country) else {
                continue;
            };
            let order = Order {
                tick: world.tick(),
                country,
                command: Command::MoveDivision {
                    division,
                    to: to as u32,
                },
            };
            if world.submit(order).is_ok() {
                queued += 1;
            }
        }
        self.apply_now();
        queued
    }

    /// Form an army group from divisions of one country. Returns the new
    /// group's id, or 0 if the order was refused (see `take_events`).
    #[func]
    fn create_group(&mut self, ids: PackedInt64Array) -> i64 {
        let divisions: Vec<DivisionId> = ids
            .as_slice()
            .iter()
            .filter_map(|&id| u32::try_from(id).ok().map(DivisionId))
            .collect();
        let Some(world) = self.world.as_ref() else {
            return 0;
        };
        let Some(country) = divisions
            .first()
            .and_then(|&d| world.division(d))
            .map(|d| d.country)
        else {
            return 0;
        };
        if !self.order(country, Command::CreateArmyGroup { divisions }) {
            return 0;
        }
        self.apply_now()
            .iter()
            .find_map(|e| match e {
                Event::ArmyGroupCreated { group, .. } => Some(i64::from(group.0)),
                _ => None,
            })
            .unwrap_or(0)
    }

    /// Give a group a front drawn through (longitude, latitude) points.
    /// Returns whether the group took it (see `take_events` if not).
    #[func]
    fn set_front(&mut self, group: i64, points: PackedVector2Array) -> bool {
        self.group_line(group, &points, |group, line| Command::SetFront {
            group,
            line,
        })
    }

    /// Give a group an arrow through (longitude, latitude) points, the tip
    /// last; no points take the arrow away. Returns whether the group took it.
    #[func]
    fn draw_arrow(&mut self, group: i64, points: PackedVector2Array) -> bool {
        self.group_line(group, &points, |group, line| Command::DrawArrow {
            group,
            line,
        })
    }

    /// A country's economy as a dictionary: `income_k` (thousands of
    /// dollars a day after mobilization), `recruiting` and `equipment`
    /// (budget percent), `mobilization` (0 to 3), `manpower`,
    /// `recruit_fund_k`, `equipment_k`. Empty for an unknown country.
    #[func]
    fn economy(&self, country: i32) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let Some(e) = self
            .world
            .as_ref()
            .and_then(|w| w.economy(u16::try_from(country).ok()?))
        else {
            return entry;
        };
        entry.set("income_k", e.income_k());
        entry.set("recruiting", i64::from(e.budget.recruiting));
        entry.set("equipment", i64::from(e.budget.equipment));
        entry.set("mobilization", i64::from(e.mobilization));
        entry.set("manpower", e.manpower() as i64);
        entry.set("recruit_fund_k", e.recruit_fund_k);
        entry.set("equipment_k", e.equipment_k);
        entry
    }

    /// Set a country's budget shares (percent). Returns whether it was taken.
    #[func]
    fn set_budget(&mut self, country: i32, recruiting: i32, equipment: i32) -> bool {
        let (Ok(country), Ok(recruiting), Ok(equipment)) = (
            u16::try_from(country),
            u8::try_from(recruiting),
            u8::try_from(equipment),
        ) else {
            return false;
        };
        self.order(
            country,
            Command::SetBudget {
                recruiting,
                equipment,
            },
        ) && !self
            .apply_now()
            .iter()
            .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// Set a country's mobilization level (0 to 3). Returns whether it was taken.
    #[func]
    fn set_mobilization(&mut self, country: i32, level: i32) -> bool {
        let (Ok(country), Ok(level)) = (u16::try_from(country), u8::try_from(level)) else {
            return false;
        };
        self.order(country, Command::SetMobilization { level })
            && !self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// Give every country its real starting army from the World Bank force
    /// snapshot (`world-bank.json.gz`, absolute path). Returns an empty
    /// string or the error.
    #[func]
    fn deploy_forces(&mut self, path: GString) -> GString {
        let path = path.to_string();
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return GString::from("no game started");
        };
        let bound = scenario.bind();
        let Some(s) = bound.scenario.as_ref() else {
            return GString::from("no scenario");
        };
        let personnel = std::fs::read(&path)
            .map_err(|e| format!("cannot read {path}: {e}"))
            .and_then(|bytes| forces::read_personnel(&bytes, s).map_err(|e| e.to_string()));
        match personnel {
            Ok(personnel) => {
                world.deploy_forces(&personnel);
                GString::new()
            }
            Err(message) => GString::from(&message),
        }
    }

    /// Hand a country to the AI (`on`) or take it back (it becomes passive:
    /// only orders given here move it). Returns false for an unknown country.
    #[func]
    fn set_ai(&mut self, country: i32, on: bool) -> bool {
        let (Some(world), Ok(country)) = (self.world.as_mut(), u16::try_from(country)) else {
            return false;
        };
        let controller = if on {
            Controller::Ai
        } else {
            Controller::Passive
        };
        world.set_controller(country, controller).is_ok()
    }

    #[func]
    fn is_ai(&self, country: i32) -> bool {
        self.world
            .as_ref()
            .zip(u16::try_from(country).ok())
            .and_then(|(w, c)| w.country(c))
            .is_some_and(|c| c.controller == Controller::Ai)
    }

    /// `attacker` declares war on `target`. Returns whether it was taken.
    #[func]
    fn declare_war(&mut self, attacker: i32, target: i32) -> bool {
        let (Ok(attacker), Ok(target)) = (u16::try_from(attacker), u16::try_from(target)) else {
            return false;
        };
        self.order(attacker, Command::DeclareWar { target })
            && !self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// `country` offers peace to every country it is at war with. Returns
    /// how many offers it made.
    #[func]
    fn offer_peace(&mut self, country: i32) -> i32 {
        let Ok(country) = u16::try_from(country) else {
            return 0;
        };
        let Some(world) = self.world.as_ref() else {
            return 0;
        };
        let enemies: Vec<u16> = world
            .countries()
            .iter()
            .map(|c| c.id)
            .filter(|&other| world.at_war(country, other))
            .collect();
        for &to in &enemies {
            self.order(country, Command::OfferPeace { to });
        }
        self.apply_now()
            .iter()
            .filter(|e| matches!(e, Event::PeaceOffered { .. }))
            .count() as i32
    }

    /// Open peace offers as dictionaries: `from`, `to`, `tick` (when made).
    #[func]
    fn peace_offers(&self) -> Array<VarDictionary> {
        let Some(world) = self.world.as_ref() else {
            return Array::new();
        };
        world
            .peace_offers()
            .iter()
            .map(|o| {
                let mut entry = VarDictionary::new();
                entry.set("from", i64::from(o.from));
                entry.set("to", i64::from(o.to));
                entry.set("tick", o.tick as i64);
                entry
            })
            .collect()
    }

    /// `to` answers the peace offer from `from`. Returns whether it was taken.
    #[func]
    fn answer_peace(&mut self, from: i32, to: i32, accept: bool) -> bool {
        let (Ok(from), Ok(to)) = (u16::try_from(from), u16::try_from(to)) else {
            return false;
        };
        self.order(to, Command::AnswerPeace { from, accept })
            && !self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// Every army group as a dictionary: `id`, `country`, `divisions`
    /// (ids), and `front` and `arrow` as (longitude, latitude) points.
    #[func]
    fn groups(&self) -> Array<VarDictionary> {
        let (Some(world), Some(grid)) = (self.world.as_ref(), self.grid()) else {
            return Array::new();
        };
        let points = |cells: &[u32]| -> PackedVector2Array {
            cells
                .iter()
                .map(|&c| {
                    let (lng, lat) = grid.center(c as usize);
                    Vector2::new(lng as f32, lat as f32)
                })
                .collect()
        };
        world
            .army_groups()
            .iter()
            .map(|g| {
                let divisions: PackedInt64Array =
                    g.divisions.iter().map(|d| i64::from(d.0)).collect();
                let mut entry = VarDictionary::new();
                entry.set("id", i64::from(g.id.0));
                entry.set("country", i64::from(g.country));
                entry.set("divisions", &divisions);
                entry.set("front", &points(&g.front));
                entry.set("arrow", &points(&g.arrow));
                entry
            })
            .collect()
    }

    /// What happened since the last call, one line per event.
    #[func]
    fn take_events(&mut self) -> PackedStringArray {
        self.log
            .drain(..)
            .map(|line| GString::from(&line))
            .collect()
    }
}

impl MwWorld {
    /// Queue an order for the current tick. Returns false without a game.
    fn order(&mut self, country: u16, command: Command) -> bool {
        let Some(world) = self.world.as_mut() else {
            return false;
        };
        let tick = world.tick();
        world
            .submit(Order {
                tick,
                country,
                command,
            })
            .is_ok()
    }

    /// Apply queued orders now (see `World::apply_orders`), log what
    /// happened, and return the events.
    fn apply_now(&mut self) -> Vec<Event> {
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return Vec::new();
        };
        let events = world.apply_orders();
        let bound = scenario.bind();
        if let Some(s) = bound.scenario.as_ref() {
            self.log
                .extend(events.iter().filter_map(|e| describe(s, world, e)));
        }
        events
    }

    /// Send a group order carrying a line of points, given by the group's
    /// country, and apply it now. Returns whether it was taken.
    fn group_line(
        &mut self,
        group: i64,
        points: &PackedVector2Array,
        command: impl Fn(ArmyGroupId, Vec<u32>) -> Command,
    ) -> bool {
        let (Some(world), Some(grid)) = (self.world.as_ref(), self.grid()) else {
            return false;
        };
        let Some(id) = u32::try_from(group).ok().map(ArmyGroupId) else {
            return false;
        };
        let Some(country) = world.army_group(id).map(|g| g.country) else {
            return false;
        };
        let line: Vec<u32> = points
            .as_slice()
            .iter()
            .filter_map(|p| grid.cell_at(f64::from(p.x), f64::from(p.y)))
            .map(|c| c as u32)
            .collect();
        if !self.order(country, command(id, line)) {
            return false;
        }
        !self
            .apply_now()
            .iter()
            .any(|e| matches!(e, Event::Rejected { .. }))
    }

    fn grid(&self) -> Option<mw_sim::scenario::Grid> {
        let scenario = self.scenario.as_ref()?;
        let bound = scenario.bind();
        bound.scenario.as_ref().map(|s| s.grid)
    }
}

fn country_name(scenario: &Scenario, id: u16) -> &str {
    scenario
        .countries
        .iter()
        .flatten()
        .find(|c| c.id == id)
        .map_or("?", |c| c.name.as_str())
}

/// A line for the event feed, or None for events not worth showing.
fn describe(scenario: &Scenario, world: &World, event: &Event) -> Option<String> {
    let name = |id| country_name(scenario, id);
    // "Poland division 12", or "Division 12" once it is gone.
    let division_name = |id: DivisionId| match world.division(id) {
        Some(d) => format!("{} division {}", name(d.country), id.0),
        None => format!("Division {}", id.0),
    };
    Some(match event {
        Event::WarDeclared { attacker, target } => {
            format!("{} declared war on {}", name(*attacker), name(*target))
        }
        Event::Rejected { order, reason } => match (&order.command, reason) {
            (Command::MoveDivision { division, .. }, Rejection::Unreachable) => format!(
                "{} division {} cannot get there",
                name(order.country),
                division.0
            ),
            (Command::DrawArrow { .. }, Rejection::Unreachable) => {
                "An arrow has to point at land".to_string()
            }
            (_, Rejection::NoFrontHere) => {
                "A front has to run along a border with another country".to_string()
            }
            (_, Rejection::NoFront) => "Draw the army group's front first".to_string(),
            (_, Rejection::NotYourDivision) => {
                "An army group takes divisions of one country only".to_string()
            }
            (Command::DeclareWar { target }, Rejection::AlreadyAtWar) => format!(
                "{} is already at war with {}",
                name(order.country),
                name(*target)
            ),
            _ => return None,
        },
        Event::ArmyGroupCreated { group, country } => {
            format!("{} formed army group {}", name(*country), group.0)
        }
        Event::ArrowReached { group } => format!("Army group {} reached its objective", group.0),
        Event::DivisionRecruited { division, country } => {
            format!("{} raised division {}", name(*country), division.0)
        }
        Event::PeaceOffered { from, to } => {
            format!("{} offers peace to {}", name(*from), name(*to))
        }
        Event::PeaceMade { from, to } => {
            format!("{} and {} made peace", name(*from), name(*to))
        }
        Event::PeaceRefused { from, to } => {
            format!("{} refused peace with {}", name(*to), name(*from))
        }
        Event::Capitulated { country } => format!("{} capitulated", name(*country)),
        Event::DivisionRetreated { division, .. } => {
            format!("{} fell back", division_name(*division))
        }
        Event::DivisionDestroyed {
            division,
            country,
            cause,
        } => format!(
            "{} division {} {}",
            name(*country),
            division.0,
            match cause {
                Loss::Surrendered => "surrendered",
                Loss::BrokenUp => "was broken up",
            }
        ),
        Event::MoveBlocked { division } => {
            format!("{} found its way blocked", division_name(*division))
        }
        _ => return None,
    })
}
