//! The running simulation, exposed to GDScript. Like the rest of the bridge
//! it only converts: rules live in `mw-sim`.

use godot::classes::IRefCounted;
use godot::prelude::*;
use mw_sim::division::{DivisionId, Loss};
use mw_sim::sandbox::{self, SandboxError};
use mw_sim::scenario::Scenario;
use mw_sim::time::Pacer;
use mw_sim::world::{Command, Event, Order, Rejection, World};

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
                if let Some(line) = describe(s, &event) {
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
    /// division's own country and applies on the next tick; a target out of
    /// reach shows up in `take_events`. Returns how many orders were queued.
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
        queued
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
fn describe(scenario: &Scenario, event: &Event) -> Option<String> {
    let name = |id| country_name(scenario, id);
    Some(match event {
        Event::WarDeclared { attacker, target } => {
            format!("{} declared war on {}", name(*attacker), name(*target))
        }
        Event::Rejected {
            order,
            reason: Rejection::Unreachable,
        } => match order.command {
            Command::MoveDivision { division, .. } => {
                format!(
                    "{} division {} cannot get there",
                    name(order.country),
                    division.0
                )
            }
            Command::DeclareWar { .. } => return None,
        },
        Event::DivisionRetreated { division, .. } => format!("Division {} fell back", division.0),
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
        Event::MoveBlocked { division } => format!("Division {} found its way blocked", division.0),
        _ => return None,
    })
}
