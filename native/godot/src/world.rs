//! The running simulation, exposed to GDScript. Like the rest of the bridge
//! it only converts: rules live in `mw-sim`.

use std::collections::BTreeMap;

use godot::classes::IRefCounted;
use godot::prelude::*;
use mw_sim::army::ArmyGroupId;
use mw_sim::conference::Move;
use mw_sim::division::{DivisionId, Loss};
use mw_sim::economy;
use mw_sim::factions::{Faction, InviteKind};
use mw_sim::forces;
use mw_sim::regions::Regions;
use mw_sim::sandbox::{self, SandboxError};
use mw_sim::scenario::Scenario;
use mw_sim::time::{GameTime, Pacer};
use mw_sim::world::{Command, Controller, CountryId, Event, Order, Rejection, World};

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
    /// Reports not collected by `take_reports` yet.
    log: Vec<Report>,
    /// The country the player leads (see `lead`), or 0.
    player: CountryId,
    /// The force figures `deploy_forces` used, for the country card.
    forces: BTreeMap<CountryId, forces::Observation>,
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
            player: 0,
            forces: BTreeMap::new(),
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
    /// Raising a division: thousands of dollars and soldiers.
    #[constant]
    const DIVISION_COST_K: i32 = economy::DIVISION_COST_K as i32;
    #[constant]
    const DIVISION_SIZE: i32 = economy::DIVISION_SIZE as i32;
    /// The most divisions a country raises in a day.
    #[constant]
    const RECRUITS_PER_DAY: i32 = economy::RECRUITS_PER_DAY as i32;
    /// Days a peace offer stays open.
    #[constant]
    const OFFER_DAYS: i32 = mw_sim::diplomacy::OFFER_DAYS as i32;
    /// Days a refused country waits before it can offer peace again.
    #[constant]
    const TALKS_CLOSED_DAYS: i32 = mw_sim::diplomacy::TALKS_CLOSED_DAYS as i32;

    /// The mobilization levels, peacetime first: `serve_per_mille` (share
    /// of the people who may serve) and `output_loss_percent` (what it
    /// costs in output).
    #[func]
    fn mobilization_levels() -> Array<VarDictionary> {
        economy::SERVE_PER_MILLE
            .iter()
            .zip(economy::OUTPUT_LOSS_PERCENT)
            .map(|(&serve, loss)| {
                let mut entry = VarDictionary::new();
                entry.set("serve_per_mille", serve as i64);
                entry.set("output_loss_percent", loss);
                entry
            })
            .collect()
    }

    /// Start a new game on a loaded scenario. Returns false if it has none.
    /// With the scenario's regions loaded, peace terms count whole regions.
    #[func]
    fn start(&mut self, scenario: Gd<MwScenario>, seed: i64) -> bool {
        let started = {
            let bound = scenario.bind();
            bound.scenario.as_ref().map(|s| {
                self.shown = s.control.clone();
                let mut world = World::new(s, seed as u64);
                if let Some(regions) = bound.regions.as_ref() {
                    world.use_regions(regions);
                }
                world
            })
        };
        self.world = started;
        self.scenario = Some(scenario);
        self.pacer = Pacer::default();
        self.log.clear();
        self.forces.clear();
        self.player = 0;
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
        let regions = bound.regions.as_ref();
        for _ in 0..hours.max(0) {
            self.log
                .extend(step_reports(s, regions, world, self.player));
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
    /// out of reach shows up in `take_reports`); it takes the division out
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
    /// group's id, or 0 if the order was refused (see `take_reports`).
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
    /// Returns whether the group took it (see `take_reports` if not).
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

    /// A country's economy as a dictionary: `output_k` (thousands of
    /// dollars a day the land it holds produces) and `income_k` (after
    /// mobilization), `home_total_k` and `home_k` (what its own land
    /// produces, and the part it still holds), `recruiting`, `equipment`
    /// and `home_front` (budget percent), `mobilization` (0 to 3),
    /// `manpower` (people it may still draft), `may_serve` (people who may
    /// serve at this level, drafted or not), `recruit_fund_k`,
    /// `equipment_k`, `support` (war support, per mille). Empty for an
    /// unknown country.
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
        entry.set("output_k", e.output_k);
        entry.set("income_k", e.income_k());
        entry.set("home_k", e.home_k);
        entry.set("home_total_k", e.home_total_k);
        entry.set("may_serve", e.may_serve() as i64);
        entry.set("recruiting", i64::from(e.budget.recruiting));
        entry.set("equipment", i64::from(e.budget.equipment));
        entry.set("home_front", i64::from(e.home_front()));
        entry.set("support", i64::from(e.support));
        entry.set("mobilization", i64::from(e.mobilization));
        entry.set("manpower", e.manpower() as i64);
        entry.set("recruit_fund_k", e.recruit_fund_k);
        entry.set("equipment_k", e.equipment_k);
        let tribute = self
            .world
            .as_ref()
            .zip(u16::try_from(country).ok())
            .map_or(0, |(w, c)| w.tribute_today_k(c));
        entry.set("tribute_k", tribute);
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
        let observations = std::fs::read(&path)
            .map_err(|e| format!("cannot read {path}: {e}"))
            .and_then(|bytes| forces::read_observations(&bytes, s).map_err(|e| e.to_string()));
        match observations {
            Ok(observations) => {
                let personnel = observations
                    .iter()
                    .map(|(&c, o)| (c, o.personnel))
                    .collect();
                world.deploy_forces(&personnel);
                self.forces = observations;
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

    /// Whether AI countries start wars of their own now and then (on by
    /// default; the screen tests turn it off so no war interrupts them). A
    /// loaded game has it on again.
    #[func]
    fn set_ai_wars(&mut self, on: bool) {
        if let Some(world) = self.world.as_mut() {
            world.set_aggression_days(if on { mw_sim::ai::AGGRESSION_DAYS } else { 0 });
        }
    }

    /// Whether threatened AI countries look for factions of their own (on
    /// by default; the screen tests turn it off so no invitation
    /// interrupts them). A loaded game has it on again.
    #[func]
    fn set_ai_factions(&mut self, on: bool) {
        if let Some(world) = self.world.as_mut() {
            world.set_faction_seeking(on);
        }
    }

    /// Observer mode: the AI runs every country and nobody is led.
    #[func]
    fn observe(&mut self) {
        let Some(world) = self.world.as_mut() else {
            return;
        };
        let ids: Vec<CountryId> = world.countries().iter().map(|c| c.id).collect();
        for id in ids {
            world
                .set_controller(id, Controller::Ai)
                .expect("a country of this world");
        }
        self.player = 0;
    }

    /// The player leads `country`: it takes orders only from here, and the
    /// AI runs every other country. Its divisions form their starting army
    /// groups where they stand (`World::form_starting_groups`). Returns
    /// false for an unknown country.
    #[func]
    fn lead(&mut self, country: i32) -> bool {
        let (Some(world), Ok(player)) = (self.world.as_mut(), u16::try_from(country)) else {
            return false;
        };
        if world.country(player).is_none() {
            return false;
        }
        let ids: Vec<CountryId> = world.countries().iter().map(|c| c.id).collect();
        for id in ids {
            let controller = if id == player {
                Controller::Passive
            } else {
                Controller::Ai
            };
            world
                .set_controller(id, controller)
                .expect("a country of this world");
        }
        world.form_starting_groups(player);
        self.player = player;
        true
    }

    /// What the country card shows, as a dictionary: `population`,
    /// `economy_k` (what its own land produces in a year, thousands of
    /// dollars), `divisions`, `personnel` and `personnel_year` (its force
    /// figure, 0 when unknown or not deployed), `neighbors` (country ids,
    /// longest border first) and `enemies`. Empty for an unknown country.
    #[func]
    fn country_info(&self, country: i32) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let Some(world) = self.world.as_ref() else {
            return entry;
        };
        let Some(id) = u16::try_from(country)
            .ok()
            .filter(|&c| world.country(c).is_some())
        else {
            return entry;
        };
        let e = world.economy(id).expect("a country of this world");
        let forces = self.forces.get(&id);
        let neighbors: PackedInt32Array = world
            .neighbors(id)
            .iter()
            .map(|&(c, _)| i32::from(c))
            .collect();
        entry.set("population", e.population as i64);
        entry.set("economy_k", e.home_total_k * 365);
        entry.set(
            "divisions",
            world.divisions().iter().filter(|d| d.country == id).count() as i64,
        );
        entry.set("personnel", forces.map_or(0, |o| i64::from(o.personnel)));
        entry.set("personnel_year", forces.map_or(0, |o| i64::from(o.year)));
        entry.set("neighbors", &neighbors);
        entry.set("enemies", &self.enemies(country));
        entry
    }

    /// A country's divisions and soldiers in them, as a dictionary:
    /// `divisions`, `personnel`.
    #[func]
    fn army(&self, country: i32) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let (Some(world), Ok(country)) = (self.world.as_ref(), u16::try_from(country)) else {
            return entry;
        };
        let own = || world.divisions().iter().filter(|d| d.country == country);
        entry.set("divisions", own().count() as i64);
        entry.set(
            "personnel",
            own().map(|d| i64::from(d.personnel)).sum::<i64>(),
        );
        entry
    }

    /// What `country`'s wars cost it, for the end-of-war screen, as a
    /// dictionary: `raised` (divisions recruited), `lost` (soldiers lost)
    /// and `inflicted` (enemy soldiers its divisions put out of action)
    /// over the whole game, `war` (the same three since it last went from
    /// peace to war), `land_kept` (share of its land it still owns by law,
    /// 0 to 1), `lost_regions` (every region it lost by law in the game:
    /// `region` as `region_name` takes it, and `to`), and `capitulated`.
    /// When it has capitulated, also `date` ("2027-03-03"), `enemies` (the
    /// countries it gave up to), `war_days` (since the oldest of those wars
    /// began), `support_collapsed` (war support ran out, rather than the
    /// capital and most of the land), `cost` (the three counts for those
    /// wars) and `ceded` (the regions that capitulation handed over, like
    /// `lost_regions`). Empty for an unknown country.
    #[func]
    fn war_record(&self, country: i32) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let (Some(world), Ok(country)) = (self.world.as_ref(), u16::try_from(country)) else {
            return entry;
        };
        let Some(record) = world.war_record(country) else {
            return entry;
        };
        let tally = |t: &mw_sim::record::Tally| {
            let mut counts = VarDictionary::new();
            counts.set("raised", i64::from(t.raised));
            counts.set("lost", t.lost as i64);
            counts.set("inflicted", t.inflicted as i64);
            counts
        };
        let regions = |list: &mut dyn Iterator<Item = (usize, CountryId)>| -> Array<VarDictionary> {
            list.map(|(region, to)| {
                let mut entry = VarDictionary::new();
                entry.set("region", region as i64 + 1);
                entry.set("to", i64::from(to));
                entry
            })
            .collect()
        };
        entry.set("raised", i64::from(record.total.raised));
        entry.set("lost", record.total.lost as i64);
        entry.set("inflicted", record.total.inflicted as i64);
        entry.set("war", &tally(&record.war));
        entry.set("land_kept", world.land_kept(country));
        let lost = regions(&mut world.lost_regions(country).iter().map(|c| (c.region, c.to)));
        entry.set("lost_regions", &lost);
        entry.set("capitulated", record.capitulation.is_some());
        entry.set("overlord", world.overlord(country).map_or(0, i64::from));
        if let Some(capitulation) = &record.capitulation {
            let date = world.time_of(capitulation.tick).date.to_string();
            entry.set("date", &GString::from(&date));
            let enemies: PackedInt32Array =
                capitulation.enemies.iter().map(|&e| i32::from(e)).collect();
            entry.set("enemies", &enemies);
            let days = capitulation.tick.saturating_sub(capitulation.war_began) / 24;
            entry.set("war_days", days as i64);
            entry.set("support_collapsed", capitulation.support_collapsed);
            entry.set("cost", &tally(&capitulation.cost));
            let ceded = regions(
                &mut capitulation
                    .ceded
                    .iter()
                    .map(|&(region, to)| (usize::from(region), to)),
            );
            entry.set("ceded", &ceded);
        }
        entry
    }

    /// The regions a peace between `a` and `b` would hand over by law: one
    /// dictionary each with `region` (region number, as `region_name`
    /// takes it), `from` and `to`.
    #[func]
    fn peace_terms(&self, a: i32, b: i32) -> Array<VarDictionary> {
        let (Some(world), Ok(a), Ok(b)) = (self.world.as_ref(), u16::try_from(a), u16::try_from(b))
        else {
            return Array::new();
        };
        world
            .peace_terms(a, b)
            .iter()
            .map(|c| {
                let mut entry = VarDictionary::new();
                entry.set("region", c.region as i64 + 1);
                entry.set("from", i64::from(c.from));
                entry.set("to", i64::from(c.to));
                entry
            })
            .collect()
    }

    /// `from` offers peace to `to` on `terms`: the region numbers (as
    /// `region_name` takes them) of either side that change hands; empty
    /// for a white peace. Returns whether the offer was made.
    #[func]
    fn offer_peace_to(&mut self, from: i32, to: i32, terms: PackedInt32Array) -> bool {
        let (Ok(from), Ok(to)) = (u16::try_from(from), u16::try_from(to)) else {
            return false;
        };
        let terms = region_indices(&terms);
        self.order(from, Command::OfferPeace { to, terms })
            && self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::PeaceOffered { .. }))
    }

    /// The countries at war with `country`.
    #[func]
    fn enemies(&self, country: i32) -> PackedInt32Array {
        let (Some(world), Ok(country)) = (self.world.as_ref(), u16::try_from(country)) else {
            return PackedInt32Array::new();
        };
        world.enemies(country).into_iter().map(i32::from).collect()
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

    /// `country` offers peace to every country it is at war with, each on
    /// the terms the land held gives (`peace_terms`). Returns how many
    /// offers it made.
    #[func]
    fn offer_peace(&mut self, country: i32) -> i32 {
        let Ok(country) = u16::try_from(country) else {
            return 0;
        };
        let Some(world) = self.world.as_ref() else {
            return 0;
        };
        let offers: Vec<(u16, Vec<u16>)> = world
            .enemies(country)
            .into_iter()
            .map(|to| {
                let terms = world
                    .peace_terms(country, to)
                    .iter()
                    .map(|c| c.region as u16)
                    .collect();
                (to, terms)
            })
            .collect();
        for (to, terms) in offers {
            self.order(country, Command::OfferPeace { to, terms });
        }
        self.apply_now()
            .iter()
            .filter(|e| matches!(e, Event::PeaceOffered { .. }))
            .count() as i32
    }

    /// Open peace offers as dictionaries: `from`, `to`, `tick` (when made)
    /// and `terms` (region numbers that change hands, see `offer_peace_to`).
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
                let terms: PackedInt32Array = o.terms.iter().map(|&r| i32::from(r) + 1).collect();
                entry.set("terms", &terms);
                entry
            })
            .collect()
    }

    /// Open peace conferences, oldest first, as dictionaries: `loser`,
    /// `winners` (in turn order), `picking` (whose turn it is), `done`
    /// (winners who left), `open` (region numbers left to take, as
    /// `region_name` takes them) and `picks` (one dictionary per region
    /// taken, in order: `region`, `by`).
    #[func]
    fn conferences(&self) -> Array<VarDictionary> {
        let Some(world) = self.world.as_ref() else {
            return Array::new();
        };
        let ids = |list: &[CountryId]| -> PackedInt32Array {
            list.iter().map(|&c| i32::from(c)).collect()
        };
        world
            .conferences()
            .iter()
            .map(|c| {
                let mut entry = VarDictionary::new();
                entry.set("loser", i64::from(c.loser));
                entry.set("winners", &ids(&c.winners));
                entry.set("picking", i64::from(c.picking()));
                entry.set("done", &ids(&c.done));
                let open: PackedInt32Array = c.open.iter().map(|&r| i32::from(r) + 1).collect();
                entry.set("open", &open);
                let picks: Array<VarDictionary> = c
                    .picks
                    .iter()
                    .map(|&(region, by)| {
                        let mut pick = VarDictionary::new();
                        pick.set("region", i64::from(region) + 1);
                        pick.set("by", i64::from(by));
                        pick
                    })
                    .collect();
                entry.set("picks", &picks);
                entry
            })
            .collect()
    }

    /// `country`'s move at the conference on `loser`: "take" (region
    /// number `region`), "puppet", "annex" (the rest) or "leave". Returns
    /// whether it was taken; the AI winners after it move at once.
    #[func]
    fn conference_move(&mut self, country: i32, loser: i32, action: GString, region: i32) -> bool {
        let (Ok(country), Ok(loser)) = (u16::try_from(country), u16::try_from(loser)) else {
            return false;
        };
        let command = match action.to_string().as_str() {
            "take" => match u16::try_from(region - 1) {
                Ok(region) => Command::TakeRegion { loser, region },
                Err(_) => return false,
            },
            "puppet" => Command::MakePuppet { loser },
            "annex" => Command::AnnexRest { loser },
            "leave" => Command::LeaveConference { loser },
            _ => return false,
        };
        self.order(country, command)
            && !self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// NATO and the CSTO as they stood on the scenario's start date (the
    /// game setup's "real alliances"). Call before any war starts.
    #[func]
    fn use_real_factions(&mut self) {
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return;
        };
        if let Some(s) = scenario.bind().scenario.as_ref() {
            world.use_real_factions(s);
        }
    }

    /// A war the scenario starts with: like `declare_war`, with the
    /// target's faction defending it, but nobody called to arms. Returns
    /// whether it began.
    #[func]
    fn scenario_war(&mut self, attacker: i32, target: i32) -> bool {
        let (Ok(attacker), Ok(target)) = (u16::try_from(attacker), u16::try_from(target)) else {
            return false;
        };
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return false;
        };
        let enemies = world.enemies(self.player);
        let time = world.time();
        let events = world.start_scenario_war(attacker, target);
        let bound = scenario.bind();
        if let Some(s) = bound.scenario.as_ref() {
            let regions = bound.regions.as_ref();
            self.log.extend(
                events
                    .iter()
                    .filter_map(|e| report(s, regions, world, e, self.player, &enemies, time)),
            );
        }
        !events.is_empty()
    }

    /// Factions, oldest first, as dictionaries: `id`, `name` (as shown:
    /// "Ukraine's faction" when nobody named it), `leader` and `members`
    /// (ids, the leader among them).
    #[func]
    fn factions(&self) -> Array<VarDictionary> {
        let (Some(world), Some(scenario)) = (self.world.as_ref(), self.scenario.as_ref()) else {
            return Array::new();
        };
        let bound = scenario.bind();
        let Some(s) = bound.scenario.as_ref() else {
            return Array::new();
        };
        world
            .factions()
            .iter()
            .map(|f| faction_entry(s, f))
            .collect()
    }

    /// The id of `country`'s faction (as `factions` lists it), or 0.
    #[func]
    fn faction_of(&self, country: i32) -> i32 {
        let Ok(country) = u16::try_from(country) else {
            return 0;
        };
        self.world
            .as_ref()
            .and_then(|w| w.faction_of(country))
            .map_or(0, |f| i32::from(f.id))
    }

    /// Whether two countries are on one side (one faction, or its puppets).
    #[func]
    fn allied(&self, a: i32, b: i32) -> bool {
        let (Ok(a), Ok(b)) = (u16::try_from(a), u16::try_from(b)) else {
            return false;
        };
        self.world.as_ref().is_some_and(|w| w.allied(a, b))
    }

    /// Who would be at war with an attacker of `target` at once: the other
    /// members of its faction (or of its overlord's), and their puppets.
    #[func]
    fn defenders(&self, target: i32) -> PackedInt32Array {
        let (Some(world), Ok(target)) = (self.world.as_ref(), u16::try_from(target)) else {
            return PackedInt32Array::new();
        };
        let head = world.overlord(target).unwrap_or(target);
        let mut found: Vec<CountryId> = world
            .faction_of(head)
            .map(|f| f.members.clone())
            .unwrap_or_default()
            .into_iter()
            .flat_map(|m| world.family(m))
            .filter(|&c| c != target)
            .collect();
        if head != target {
            found.push(head);
        }
        found.sort_unstable();
        found.dedup();
        found.into_iter().map(i32::from).collect()
    }

    /// `from` invites `target` into its faction, or (in none) to form one
    /// named `name`. Returns whether it was taken.
    #[func]
    fn invite_to_faction(&mut self, from: i32, target: i32, name: GString) -> bool {
        let (Ok(from), Ok(target)) = (u16::try_from(from), u16::try_from(target)) else {
            return false;
        };
        let name = name.to_string();
        self.command_now(from, Command::InviteToFaction { target, name })
    }

    /// `from` asks the leader of faction `faction` to let it in.
    #[func]
    fn ask_to_join(&mut self, from: i32, faction: i32) -> bool {
        let (Ok(from), Ok(faction)) = (u16::try_from(from), u16::try_from(faction)) else {
            return false;
        };
        self.command_now(from, Command::AskToJoin { faction })
    }

    /// `country` answers the invitation or request of `from`.
    #[func]
    fn answer_faction(&mut self, country: i32, from: i32, accept: bool) -> bool {
        let (Ok(country), Ok(from)) = (u16::try_from(country), u16::try_from(from)) else {
            return false;
        };
        self.command_now(country, Command::AnswerFaction { from, accept })
    }

    #[func]
    fn leave_faction(&mut self, country: i32) -> bool {
        let Ok(country) = u16::try_from(country) else {
            return false;
        };
        self.command_now(country, Command::LeaveFaction)
    }

    /// The leader names its faction.
    #[func]
    fn rename_faction(&mut self, country: i32, name: GString) -> bool {
        let Ok(country) = u16::try_from(country) else {
            return false;
        };
        let name = name.to_string();
        self.command_now(country, Command::RenameFaction { name })
    }

    /// `ally` answers the call to join `attacker`'s war on `target`.
    #[func]
    fn answer_call(&mut self, ally: i32, attacker: i32, target: i32, join: bool) -> bool {
        let (Ok(ally), Ok(attacker), Ok(target)) = (
            u16::try_from(ally),
            u16::try_from(attacker),
            u16::try_from(target),
        ) else {
            return false;
        };
        self.command_now(
            ally,
            Command::AnswerCall {
                attacker,
                target,
                join,
            },
        )
    }

    /// Open invitations and requests to join, oldest first, as
    /// dictionaries: `from`, `to`, `kind` ("invite" or "ask") and `name`.
    #[func]
    fn invites(&self) -> Array<VarDictionary> {
        let Some(world) = self.world.as_ref() else {
            return Array::new();
        };
        world
            .invites()
            .iter()
            .map(|i| {
                let mut entry = VarDictionary::new();
                entry.set("from", i64::from(i.from));
                entry.set("to", i64::from(i.to));
                let kind = match i.kind {
                    InviteKind::Invite => "invite",
                    InviteKind::Ask => "ask",
                };
                entry.set("kind", &GString::from(kind));
                entry.set("name", &GString::from(&i.name));
                entry
            })
            .collect()
    }

    /// Open calls to arms, oldest first, as dictionaries: `ally`,
    /// `attacker` and `target`.
    #[func]
    fn calls(&self) -> Array<VarDictionary> {
        let Some(world) = self.world.as_ref() else {
            return Array::new();
        };
        world
            .calls()
            .iter()
            .map(|c| {
                let mut entry = VarDictionary::new();
                entry.set("ally", i64::from(c.ally));
                entry.set("attacker", i64::from(c.attacker));
                entry.set("target", i64::from(c.target));
                entry
            })
            .collect()
    }

    /// Whether the AI running `to` would say yes to `from` ("invite": an
    /// invitation into `from`'s faction or to form one; "ask": `from` asks
    /// to join the faction `to` leads), as a dictionary: `yes` and
    /// `threat` (the neighbor that threatens `to`, for an invitation; 0).
    #[func]
    fn faction_advice(&self, from: i32, to: i32, kind: GString) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let (Some(world), Ok(from), Ok(to)) =
            (self.world.as_ref(), u16::try_from(from), u16::try_from(to))
        else {
            return entry;
        };
        let kind = if kind == "ask" {
            InviteKind::Ask
        } else {
            InviteKind::Invite
        };
        entry.set("yes", world.ai_accepts(from, to, kind));
        let side = world
            .faction_of(from)
            .map_or(vec![from], |f| f.members.clone());
        let threat = world.threat(to, &side).unwrap_or(0);
        entry.set("threat", i64::from(threat));
        entry
    }

    /// Whether the AI running `ally` would join `attacker`'s war on `target`.
    #[func]
    fn would_join(&self, ally: i32, attacker: i32, target: i32) -> bool {
        let (Some(world), Ok(ally), Ok(attacker), Ok(target)) = (
            self.world.as_ref(),
            u16::try_from(ally),
            u16::try_from(attacker),
            u16::try_from(target),
        ) else {
            return false;
        };
        world.ai_joins(ally, attacker, target)
    }

    /// Whether peace with `enemy` would cost `country` its faction (a
    /// separate peace: another member still fights `enemy`).
    #[func]
    fn separate_peace(&self, country: i32, enemy: i32) -> bool {
        let (Some(world), Ok(country), Ok(enemy)) = (
            self.world.as_ref(),
            u16::try_from(country),
            u16::try_from(enemy),
        ) else {
            return false;
        };
        world.separate_peace(country, enemy)
    }

    /// What the AI would do on `winner`'s turn at the conference on
    /// `loser`: "take" with `region`, "puppet" or "leave", as a dictionary
    /// with `action` and `region` (0 when none).
    #[func]
    fn conference_advice(&self, winner: i32, loser: i32) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let (Some(world), Ok(winner), Ok(loser)) = (
            self.world.as_ref(),
            u16::try_from(winner),
            u16::try_from(loser),
        ) else {
            return entry;
        };
        let (action, region) = match world.ai_move(winner, loser) {
            Move::Take(region) => ("take", i64::from(region) + 1),
            Move::Puppet => ("puppet", 0),
            Move::AnnexRest => ("annex", 0),
            Move::Leave => ("leave", 0),
        };
        entry.set("action", action);
        entry.set("region", region);
        entry
    }

    /// Set a country's war support (0 to 1000), for sandboxes and tests: at
    /// zero it capitulates at the next daily update if it is at war.
    #[func]
    fn set_war_support(&mut self, country: i32, per_mille: i32) -> bool {
        let (Some(world), Ok(country), Ok(support)) = (
            self.world.as_mut(),
            u16::try_from(country),
            u16::try_from(per_mille.clamp(0, 1000)),
        ) else {
            return false;
        };
        world.set_war_support(country, support).is_ok()
    }

    /// The country `country` is a puppet of, or 0.
    #[func]
    fn overlord(&self, country: i32) -> i32 {
        self.world
            .as_ref()
            .zip(u16::try_from(country).ok())
            .and_then(|(w, c)| w.overlord(c))
            .map_or(0, i32::from)
    }

    /// The puppets of `country`.
    #[func]
    fn puppets(&self, country: i32) -> PackedInt32Array {
        self.world
            .as_ref()
            .zip(u16::try_from(country).ok())
            .map(|(w, c)| w.puppets(c).into_iter().map(i32::from).collect())
            .unwrap_or_default()
    }

    /// Soldiers of `loser` that `winner` put out of action in their war.
    #[func]
    fn defeated(&self, winner: i32, loser: i32) -> i64 {
        self.world
            .as_ref()
            .zip(u16::try_from(winner).ok().zip(u16::try_from(loser).ok()))
            .map_or(0, |(w, (a, b))| w.defeated(a, b) as i64)
    }

    /// The owner by law now of region number `region` (as `region_name`
    /// takes it): a peace may have handed it over since the game began.
    /// 0 for an unknown region.
    #[func]
    fn region_owner(&self, region: i32) -> i32 {
        let (Some(world), Ok(index)) = (self.world.as_ref(), usize::try_from(region - 1)) else {
            return 0;
        };
        i32::from(world.region_owner_now(index))
    }

    /// How willing `to` is to make peace with `from` on `terms` (region
    /// numbers, see `offer_peace_to`), as a dictionary: `chance` (0 to 1),
    /// `lost` (share of its own land's output in enemy hands), `support`
    /// (its war support, 0 to 1), `asked` (what the terms take from it, as
    /// a share of its own land's output) and `asked_held` (the part of that
    /// `from` holds), `separate` (whether peace would take `to` out of its
    /// faction), `closed_days` (days until `from` may offer again after
    /// `to` refused it, 0 if it may now), and `regions`: one dictionary per
    /// region in `terms`
    /// with `region`, `owner`, `share` (of what its owner's own land
    /// produces), `held` (the share of it `from` holds) and `most`
    /// (whether `from` alone holds more than half of it).
    #[func]
    fn peace_talks(&self, from: i32, to: i32, terms: PackedInt32Array) -> VarDictionary {
        let mut entry = VarDictionary::new();
        let (Some(world), Ok(from), Ok(to)) =
            (self.world.as_ref(), u16::try_from(from), u16::try_from(to))
        else {
            return entry;
        };
        let indices = region_indices(&terms);
        let w = world.willingness(from, to, &indices);
        entry.set("chance", w.chance);
        entry.set("lost", w.lost);
        entry.set("support", f64::from(w.support) / 1000.0);
        entry.set("asked", w.asked);
        entry.set("asked_held", w.asked_held);
        entry.set("separate", w.separate);
        let wait = world
            .talks_reopen(from, to)
            .map_or(0, |until| (until - world.tick()).div_ceil(24));
        entry.set("closed_days", wait as i64);
        let regions: Vec<usize> = indices.iter().map(|&r| usize::from(r)).collect();
        let holding = world.holding(from, &regions);
        let rows: Array<VarDictionary> = regions
            .iter()
            .zip(holding)
            .map(|(&region, (held, most))| {
                let owner = world.region_owner_now(region);
                let home = world.economy(owner).map_or(0, |e| e.home_total_k).max(1);
                let mut row = VarDictionary::new();
                row.set("region", region as i64 + 1);
                row.set("owner", i64::from(owner));
                row.set("share", world.region_value_k(region) as f64 / home as f64);
                row.set("held", held);
                row.set("most", most);
                row
            })
            .collect();
        entry.set("regions", &rows);
        entry
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
    /// (ids), `personnel` and `establishment` (soldiers it has and would
    /// have at full strength), `enemy` (the country its front faces, or 0),
    /// and `front` and `arrow` as (longitude, latitude) points.
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
                let members = || g.divisions.iter().filter_map(|&d| world.division(d));
                let personnel: u64 = members().map(|d| u64::from(d.personnel)).sum();
                let establishment: u64 = members().map(|d| u64::from(d.establishment)).sum();
                let mut entry = VarDictionary::new();
                entry.set("id", i64::from(g.id.0));
                entry.set("country", i64::from(g.country));
                entry.set("divisions", &divisions);
                entry.set("personnel", personnel as i64);
                entry.set("establishment", establishment as i64);
                entry.set("enemy", g.enemy.map_or(0, i64::from));
                entry.set("front", &points(&g.front));
                entry.set("arrow", &points(&g.arrow));
                entry
            })
            .collect()
    }

    /// Save the game to `path` (an absolute file path). Returns an empty
    /// string on success, or the error.
    #[func]
    fn save_game(&self, path: GString) -> GString {
        let Some(world) = self.world.as_ref() else {
            return GString::from("There is no game to save");
        };
        let path = path.to_string();
        // Into a file beside it first, then over the old save: a full disk
        // or a crash halfway never leaves a broken save in its place.
        let temporary = format!("{path}.tmp");
        let written = std::fs::write(&temporary, mw_sim::save::save(world))
            .and_then(|()| std::fs::rename(&temporary, &path));
        match written {
            Ok(()) => GString::new(),
            Err(e) => {
                let _ = std::fs::remove_file(&temporary);
                GString::from(&format!("Cannot save to {path}: {e}"))
            }
        }
    }

    /// A number that changes whenever the game changes (an order, an hour
    /// gone by) and matches for a loaded game and the one saved: keep it at
    /// a save and compare later to know whether leaving loses anything.
    /// 0 without a game.
    #[func]
    fn state_hash(&self) -> i64 {
        self.world
            .as_ref()
            .map_or(0, |world| mw_sim::save::fingerprint(world) as i64)
    }

    /// Whether a save would load on this scenario (and its region map):
    /// an empty string, or the error `load_game` would give. The game goes
    /// on as it is either way.
    #[func]
    fn check_save(&self, path: GString) -> GString {
        let Some(scenario) = self.scenario.as_ref() else {
            return GString::from("Start a game first");
        };
        let bound = scenario.bind();
        let Some(s) = bound.scenario.as_ref() else {
            return GString::from("Start a game first");
        };
        let path = path.to_string();
        let checked = std::fs::read(&path)
            .map_err(|e| format!("Cannot read {path}: {e}"))
            .and_then(|bytes| {
                mw_sim::save::load(&bytes, s, bound.regions.as_ref())
                    .map(|_| ())
                    .map_err(|e| format!("Cannot load {path}: {e}"))
            });
        checked
            .err()
            .map_or_else(GString::new, |m| GString::from(&m))
    }

    /// Load a game saved on this scenario (and its region map). Returns an
    /// empty string on success, or the error; after an error the current
    /// game goes on.
    #[func]
    fn load_game(&mut self, path: GString) -> GString {
        let Some(scenario) = self.scenario.clone() else {
            return GString::from("Start a game first");
        };
        let bound = scenario.bind();
        let Some(s) = bound.scenario.as_ref() else {
            return GString::from("Start a game first");
        };
        let path = path.to_string();
        let loaded = std::fs::read(&path)
            .map_err(|e| format!("Cannot read {path}: {e}"))
            .and_then(|bytes| {
                mw_sim::save::load(&bytes, s, bound.regions.as_ref())
                    .map_err(|e| format!("Cannot load {path}: {e}"))
            });
        match loaded {
            Ok(world) => {
                // `shown` still holds what the map shows, so the next
                // `control_changes` repaints whatever differs.
                self.world = Some(world);
                self.log.clear();
                GString::new()
            }
            Err(message) => GString::from(&message),
        }
    }

    /// What happened since the last call, one dictionary per event with a
    /// line: `text`, `date` ("2026-10-25") and `hour`, `mine` (whether it
    /// belongs in the player's feed), `big` (the card it pops up, see
    /// `Report`), `tone` ("war", "peace" or ""), `other` (the other
    /// country of a big event) and `also` (a third one, see `Report`).
    #[func]
    fn take_reports(&mut self) -> Array<VarDictionary> {
        self.log
            .drain(..)
            .map(|r| {
                let mut entry = VarDictionary::new();
                entry.set("text", &GString::from(&r.text));
                entry.set("date", &GString::from(&r.date));
                entry.set("hour", i64::from(r.hour));
                entry.set("mine", r.mine);
                entry.set("big", &GString::from(r.big));
                entry.set("tone", &GString::from(r.tone));
                entry.set("other", i64::from(r.other));
                entry.set("also", i64::from(r.also));
                entry
            })
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

    /// Give `country`'s order and apply it now. Returns whether it was
    /// taken.
    fn command_now(&mut self, country: u16, command: Command) -> bool {
        self.order(country, command)
            && !self
                .apply_now()
                .iter()
                .any(|e| matches!(e, Event::Rejected { .. }))
    }

    /// Apply queued orders now (see `World::apply_orders`), log what
    /// happened, and return the events.
    fn apply_now(&mut self) -> Vec<Event> {
        let (Some(world), Some(scenario)) = (self.world.as_mut(), self.scenario.as_ref()) else {
            return Vec::new();
        };
        let enemies = world.enemies(self.player);
        let time = world.time();
        let events = world.apply_orders();
        let bound = scenario.bind();
        if let Some(s) = bound.scenario.as_ref() {
            let regions = bound.regions.as_ref();
            self.log.extend(
                events
                    .iter()
                    .filter_map(|e| report(s, regions, world, e, self.player, &enemies, time)),
            );
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

/// Region numbers from Godot (index + 1, as `region_name` takes them) as
/// the simulation's region indices; numbers out of range are dropped.
fn region_indices(numbers: &PackedInt32Array) -> Vec<u16> {
    numbers
        .as_slice()
        .iter()
        .filter_map(|&n| u16::try_from(n - 1).ok())
        .collect()
}

/// "A", "A and B", "A, B and C".
fn list_and(names: &[&str]) -> String {
    match names {
        [] => String::new(),
        [one] => (*one).to_string(),
        [rest @ .., last] => format!("{} and {}", rest.join(", "), last),
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
/// One line for the reports feed.
struct Report {
    text: String,
    /// When it happened: "2026-10-25" and the hour.
    date: String,
    hour: u8,
    /// Whether it belongs in the player's feed (everything does in the
    /// viewer).
    mine: bool,
    /// The card it pops up for the player, which pauses the game: "war"
    /// (war declared on the player), "peace_offer" (an offer to the
    /// player), "peace" (the player made peace), "capitulated" (the player
    /// or one of its enemies gave up); "" for none.
    big: &'static str,
    /// "war", "peace" or "" for how the feed colors the line.
    tone: &'static str,
    /// For wars, peace and capitulations: the country other than the
    /// player (the attacker when the player is not involved), or 0.
    other: CountryId,
    /// A third country a card names: the ally attacked ("defend"), the
    /// target ("call_to_arms") or the faction's leader ("joined"); or 0.
    also: CountryId,
}

/// A faction as `MwWorld::factions` lists it.
fn faction_entry(scenario: &Scenario, faction: &Faction) -> VarDictionary {
    let mut entry = VarDictionary::new();
    entry.set("id", i64::from(faction.id));
    entry.set("name", &GString::from(&faction_name(scenario, faction)));
    entry.set("leader", i64::from(faction.leader));
    let members: PackedInt32Array = faction.members.iter().map(|&m| i32::from(m)).collect();
    entry.set("members", &members);
    entry
}

/// The name of faction `id`, or "its faction" once it is gone.
fn faction_label(scenario: &Scenario, world: &World, id: mw_sim::factions::FactionId) -> String {
    world
        .faction(id)
        .map_or_else(|| "its faction".to_string(), |f| faction_name(scenario, f))
}

/// Its name, or "Ukraine's faction" when nobody named it.
fn faction_name(scenario: &Scenario, faction: &Faction) -> String {
    if faction.name.is_empty() {
        format!("{}'s faction", country_name(scenario, faction.leader))
    } else {
        faction.name.clone()
    }
}

/// Run one tick and report what happened in it. A capitulation is one
/// line that counts the divisions laying down their arms with it, not a
/// line per division.
fn step_reports(
    scenario: &Scenario,
    regions: Option<&Regions>,
    world: &mut World,
    player: CountryId,
) -> Vec<Report> {
    let enemies = world.enemies(player);
    // The tick the events happen in; `step` moves the clock on after them.
    let time = world.time();
    let events = world.step();
    let capitulated: Vec<CountryId> = events
        .iter()
        .filter_map(|e| match e {
            Event::Capitulated { country } => Some(*country),
            _ => None,
        })
        .collect();
    let laid_down = |of: CountryId| events.iter().filter(|e| surrendered(e) == Some(of)).count();
    events
        .iter()
        .filter(|e| !surrendered(e).is_some_and(|c| capitulated.contains(&c)))
        .filter_map(|e| {
            let mut line = report(scenario, regions, world, e, player, &enemies, time)?;
            if let Event::Capitulated { country } = e {
                match laid_down(*country) {
                    0 => {}
                    1 => line.text += ": its last division laid down its arms",
                    n => line.text += &format!(": its {n} divisions laid down their arms"),
                }
            }
            Some(line)
        })
        .collect()
}

/// The country of a division that surrendered, for a surrender event.
fn surrendered(event: &Event) -> Option<CountryId> {
    match event {
        Event::DivisionDestroyed {
            country,
            cause: Loss::Surrendered,
            ..
        } => Some(*country),
        _ => None,
    }
}

/// The report for an event, if it has a line. `enemies` are the player's
/// enemies before the event, so a capitulated enemy still counts as one;
/// `time` is when it happened.
fn report(
    scenario: &Scenario,
    regions: Option<&Regions>,
    world: &World,
    event: &Event,
    player: CountryId,
    enemies: &[CountryId],
    time: GameTime,
) -> Option<Report> {
    let text = describe(scenario, regions, world, event, player)?;
    let own = |c: CountryId| c == player;
    let side = |c: CountryId| own(c) || enemies.contains(&c);
    let ours = |faction| world.faction_of(player).is_some_and(|f| f.id == faction);
    let division_country = |d: DivisionId| world.division(d).map(|d| d.country);
    let (mine, big, tone, other) = match *event {
        Event::WarDeclared { attacker, target } => {
            let on_me = own(target);
            let tone = if own(attacker) || on_me { "war" } else { "" };
            let other = if own(attacker) { target } else { attacker };
            (true, if on_me { "war" } else { "" }, tone, other)
        }
        Event::PeaceOffered { from, to } => (
            own(from) || own(to),
            if own(to) { "peace_offer" } else { "" },
            "",
            from,
        ),
        Event::PeaceMade { from, to } => {
            let mine = own(from) || own(to);
            let other = if own(from) { to } else { from };
            (
                true,
                if mine { "peace" } else { "" },
                if mine { "peace" } else { "" },
                other,
            )
        }
        Event::PeaceRefused { from, to } => (own(from) || own(to), "", "", 0),
        Event::Capitulated { country } => {
            let big = if side(country) { "capitulated" } else { "" };
            (true, big, if side(country) { "war" } else { "" }, country)
        }
        Event::SupportCollapsed { .. } | Event::RegionsCeded { .. } => (true, "", "", 0),
        Event::ConferenceOpened { loser, ref winners } => {
            // The player divides the loser's land: the conference window.
            let big = if winners.contains(&player) {
                "conference"
            } else {
                ""
            };
            (side(loser), big, "", loser)
        }
        Event::RegionTaken { loser, by, .. } => (own(by) || own(loser), "", "", 0),
        Event::ConferenceClosed { loser } => (side(loser), "", "", loser),
        // The conference's last card and the defeat screen say so.
        Event::Puppeted { .. } => (true, "", "", 0),
        Event::PuppetFreed { country } => (true, "", "", country),
        Event::Rejected { ref order, .. } => (own(order.country), "", "", 0),
        Event::ArmyGroupCreated { country, .. } | Event::DivisionRecruited { country, .. } => {
            (own(country), "", "", 0)
        }
        Event::ArrowReached { group } => (
            world.army_group(group).is_some_and(|g| own(g.country)),
            "",
            "",
            0,
        ),
        Event::MoveBlocked { division } => (division_country(division).is_some_and(own), "", "", 0),
        Event::DivisionRetreated { division, .. } => {
            (division_country(division).is_some_and(side), "", "", 0)
        }
        Event::DivisionDestroyed { country, .. } => (side(country), "", "", 0),
        Event::DivisionArrived { .. } => (false, "", "", 0),
        Event::FactionInvited { from, to } => (
            own(from) || own(to),
            if own(to) { "faction_invite" } else { "" },
            "",
            from,
        ),
        Event::AskedToJoin { from, to } => (
            own(from) || own(to),
            if own(to) { "faction_ask" } else { "" },
            "",
            from,
        ),
        Event::FactionRefused { from, to } => (own(from) || own(to), "", "", to),
        Event::FactionFormed { leader, .. } => (own(leader), "", "", leader),
        Event::JoinedFaction { country, faction } => {
            // The player is in, or let someone into the faction it leads.
            let leading = world
                .faction(faction)
                .is_some_and(|f| f.leader == player && !own(country));
            let big = if own(country) || leading {
                "joined"
            } else {
                ""
            };
            (own(country) || ours(faction), big, "", country)
        }
        Event::LeftFaction {
            country, faction, ..
        } => (own(country) || ours(faction), "", "", country),
        Event::FactionLeader { faction, .. } => (ours(faction), "", "", 0),
        Event::FactionDissolved { last, .. } => (own(last), "", "", 0),
        Event::CalledToArms {
            attacker,
            ref allies,
            ..
        } => {
            let called = allies.contains(&player);
            (
                called || own(attacker),
                if called { "call_to_arms" } else { "" },
                "",
                attacker,
            )
        }
        Event::CallAnswered {
            ally,
            attacker,
            join,
            ..
        } => {
            // Who stays out matters only to the countries in that war.
            if !join && !(own(ally) || own(attacker)) {
                return None;
            }
            (own(ally) || own(attacker), "", "", 0)
        }
        Event::Defended {
            ally,
            attacker,
            ref defenders,
        } => {
            let defending = defenders.contains(&player);
            (
                defending || own(ally) || own(attacker),
                if defending { "defend" } else { "" },
                if defending || own(attacker) {
                    "war"
                } else {
                    ""
                },
                attacker,
            )
        }
    };
    let also = match *event {
        Event::Defended { ally, .. } => ally,
        Event::CalledToArms { target, .. } => target,
        Event::JoinedFaction { faction, .. } => world.faction(faction).map_or(0, |f| f.leader),
        _ => 0,
    };
    Some(Report {
        text,
        date: time.date.to_string(),
        hour: time.hour,
        // The viewer (no player) shows everything; nothing involves country 0,
        // so it pops up nothing.
        mine: mine || player == 0,
        big,
        tone,
        other,
        also,
    })
}

fn describe(
    scenario: &Scenario,
    regions: Option<&Regions>,
    world: &World,
    event: &Event,
    player: CountryId,
) -> Option<String> {
    let region_name = |region: usize| -> String {
        regions.and_then(|r| r.list.get(region)).map_or_else(
            || format!("region {}", region + 1),
            |r| {
                if r.names.en.is_empty() {
                    r.id.clone()
                } else {
                    r.names.en.clone()
                }
            },
        )
    };
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
            format!(
                "{} formed its {}",
                name(*country),
                group_name(world, *group)
            )
        }
        Event::ArrowReached { group } => {
            format!("The {} reached its objective", group_name(world, *group))
        }
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
        Event::SupportCollapsed { country } => {
            format!("{}'s support for the war collapsed", name(*country))
        }
        Event::ConferenceOpened { loser, winners } => {
            let names: Vec<&str> = winners.iter().map(|&w| name(w)).collect();
            format!(
                "Peace conference on {}: {} divide its land",
                name(*loser),
                list_and(&names)
            )
        }
        Event::RegionTaken { loser, by, region } => format!(
            "{} took {} from {}",
            name(*by),
            region_name(*region),
            name(*loser)
        ),
        Event::ConferenceClosed { loser } => {
            format!("The peace conference on {} is over", name(*loser))
        }
        Event::Puppeted { country, overlord } => {
            format!("{} became a puppet of {}", name(*country), name(*overlord))
        }
        Event::PuppetFreed { country } => format!("{} is free again", name(*country)),
        Event::RegionsCeded { from, to, regions } => format!(
            "{} ceded {} {} to {}",
            name(*from),
            regions,
            if *regions == 1 { "region" } else { "regions" },
            name(*to)
        ),
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
        Event::FactionInvited { from, to } => match world.faction_of(*from) {
            Some(f) => format!(
                "{} invites {} into {}",
                name(*from),
                name(*to),
                faction_name(scenario, f)
            ),
            None => format!("{} asks {} to form a faction", name(*from), name(*to)),
        },
        Event::AskedToJoin { from, to } => format!(
            "{} asks to join {}",
            name(*from),
            world.faction_of(*to).map_or_else(
                || format!("{}'s faction", name(*to)),
                |f| faction_name(scenario, f)
            )
        ),
        Event::FactionRefused { from, to } => {
            format!("{} said no to {}", name(*to), name(*from))
        }
        Event::FactionFormed { faction, leader } => format!(
            "{} formed {}",
            name(*leader),
            faction_label(scenario, world, *faction)
        ),
        Event::JoinedFaction { country, faction } => format!(
            "{} joined {}",
            name(*country),
            faction_label(scenario, world, *faction)
        ),
        Event::LeftFaction {
            country,
            faction,
            separate_peace,
        } => {
            let faction = faction_label(scenario, world, *faction);
            if *separate_peace {
                format!(
                    "{} made a separate peace and left {faction}",
                    name(*country)
                )
            } else {
                format!("{} left {faction}", name(*country))
            }
        }
        Event::FactionLeader { faction, leader } => format!(
            "{} now leads {}",
            name(*leader),
            faction_label(scenario, world, *faction)
        ),
        Event::FactionDissolved { last, .. } => {
            format!("{} is alone: its faction broke up", name(*last))
        }
        Event::CalledToArms {
            attacker,
            target,
            allies,
        } => {
            let faction = world
                .faction_of(*attacker)
                .map_or_else(|| "its allies".to_string(), |f| faction_name(scenario, f));
            if allies.contains(&player) {
                format!(
                    "{} calls you to arms against {}",
                    name(*attacker),
                    name(*target)
                )
            } else {
                format!(
                    "{} calls {faction} to arms against {}",
                    name(*attacker),
                    name(*target)
                )
            }
        }
        Event::CallAnswered {
            ally,
            attacker,
            target,
            join,
        } => format!(
            "{} {} {}'s war on {}",
            name(*ally),
            if *join { "joins" } else { "stays out of" },
            name(*attacker),
            name(*target)
        ),
        Event::Defended {
            ally,
            attacker,
            defenders,
        } => {
            let faction = world
                .faction_of(*ally)
                .map_or_else(|| "Its allies".to_string(), |f| faction_name(scenario, f));
            let count = match defenders.len() {
                1 => format!("{} is", name(defenders[0])),
                n => format!("{n} countries are"),
            };
            format!(
                "{faction} defends {}: {count} at war with {}",
                name(*ally),
                name(*attacker)
            )
        }
        _ => return None,
    })
}

/// "3rd Army Group": a group numbered by when its country formed it, as the
/// army group list names it (empty groups keep their numbers).
fn group_name(world: &World, group: ArmyGroupId) -> String {
    let Some(country) = world.army_group(group).map(|g| g.country) else {
        return format!("army group {}", group.0);
    };
    let number = world
        .army_groups()
        .iter()
        .filter(|g| g.country == country && g.id <= group)
        .count();
    let suffix = match (number % 10, number % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{number}{suffix} Army Group")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_are_named_by_when_their_country_formed_them() {
        let s = scenario();
        let mut world = World::new(&s, 1);
        let (poland, germany) = (id(&s, "Poland"), id(&s, "Germany"));
        let capital = |c: CountryId| {
            let city = s
                .cities
                .iter()
                .find(|x| x.owner_id == c && x.is_capital)
                .unwrap();
            s.grid.cell_at(city.lng, city.lat).unwrap() as u32
        };
        let (p, g) = (capital(poland), capital(germany));
        let mut division = |country, cell| world.spawn_division(country, cell, 10_000).unwrap();
        let polish: Vec<DivisionId> = (0..13).map(|_| division(poland, p)).collect();
        let german = division(germany, g);
        let mut groups = Vec::new();
        for (i, &d) in polish.iter().enumerate() {
            groups.push(world.create_army_group(poland, &[d]).unwrap());
            if i == 0 {
                world.create_army_group(germany, &[german]).unwrap();
            }
        }
        let names: Vec<String> = groups.iter().map(|&g| group_name(&world, g)).collect();
        assert_eq!(names[0], "1st Army Group");
        assert_eq!(names[1], "2nd Army Group", "Germany's group does not count");
        assert_eq!(names[2], "3rd Army Group");
        assert_eq!(names[3], "4th Army Group");
        assert_eq!(names[10], "11th Army Group");
        assert_eq!(names[12], "13th Army Group");
        assert_eq!(group_name(&world, ArmyGroupId(999)), "army group 999");
    }

    fn scenario() -> Scenario {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../assets/maps/compiled/world-map-2026-v3.mwsc.gz"
        );
        mw_sim::scenario::decode_gzip(&std::fs::read(path).unwrap()).unwrap()
    }

    fn id(s: &Scenario, name: &str) -> CountryId {
        s.countries
            .iter()
            .flatten()
            .find(|c| c.name == name)
            .unwrap()
            .id
    }

    #[test]
    fn a_report_carries_the_hour_it_happened() {
        let s = scenario();
        let mut world = World::new(&s, 1);
        let (poland, germany) = (id(&s, "Poland"), id(&s, "Germany"));
        let start = world.time();
        world
            .submit(Order {
                tick: 0,
                country: germany,
                command: Command::DeclareWar { target: poland },
            })
            .unwrap();
        let reports = step_reports(&s, None, &mut world, poland);
        let war = reports
            .iter()
            .find(|r| r.big == "war")
            .expect("a report of the war");
        assert_eq!(
            (war.date.as_str(), war.hour),
            (start.date.to_string().as_str(), start.hour),
            "the hour of the tick it happened in, not the next"
        );
    }

    #[test]
    fn a_capitulation_is_one_line_with_the_divisions_that_laid_down_their_arms() {
        // Luxembourg, with two divisions, loses its capital to Germany.
        let s = scenario();
        let mut world = World::new(&s, 1);
        let (germany, luxembourg) = (id(&s, "Germany"), id(&s, "Luxembourg"));
        let city = s
            .cities
            .iter()
            .find(|c| c.owner_id == luxembourg && c.is_capital)
            .unwrap();
        let cell = |lng: f64, lat: f64| s.grid.cell_at(lng, lat).unwrap() as u32;
        for _ in 0..2 {
            world
                .spawn_division(luxembourg, cell(6.0, 49.95), 10_000)
                .unwrap();
        }
        let raider = world
            .spawn_division(germany, cell(6.45, 49.75), 10_000)
            .unwrap();
        for command in [
            Command::DeclareWar { target: luxembourg },
            Command::MoveDivision {
                division: raider,
                to: cell(city.lng, city.lat),
            },
        ] {
            world
                .submit(Order {
                    tick: 0,
                    country: germany,
                    command,
                })
                .unwrap();
        }
        for _ in 0..10 * 24 {
            let reports = step_reports(&s, None, &mut world, germany);
            let Some(line) = reports.iter().find(|r| r.big == "capitulated") else {
                continue;
            };
            assert_eq!(
                line.text,
                "Luxembourg capitulated: its 2 divisions laid down their arms"
            );
            assert!(
                reports.iter().all(|r| !r.text.ends_with("surrendered")),
                "no line per division: {:?}",
                reports.iter().map(|r| &r.text).collect::<Vec<_>>()
            );
            return;
        }
        panic!("Luxembourg never capitulated");
    }

    #[test]
    fn reports_say_what_concerns_the_player() {
        let s = scenario();
        let world = World::new(&s, 1);
        let (poland, germany, france, spain) = (
            id(&s, "Poland"),
            id(&s, "Germany"),
            id(&s, "France"),
            id(&s, "Spain"),
        );
        let war = |attacker, target| Event::WarDeclared { attacker, target };
        let concern = |event: &Event, player, enemies: &[CountryId]| {
            let r = report(&s, None, &world, event, player, enemies, world.time()).unwrap();
            (r.mine, r.big, r.tone, r.other)
        };
        assert_eq!(
            concern(&war(germany, poland), poland, &[]),
            (true, "war", "war", germany),
            "war on the player pops up a card"
        );
        assert_eq!(
            concern(&war(poland, germany), poland, &[]),
            (true, "", "war", germany)
        );
        assert_eq!(
            concern(&war(france, spain), poland, &[]),
            (true, "", "", france),
            "wars elsewhere are news, nothing more"
        );
        let recruited = |country| Event::DivisionRecruited {
            division: DivisionId(1),
            country,
        };
        assert!(concern(&recruited(poland), poland, &[]).0);
        assert!(
            !concern(&recruited(germany), poland, &[germany]).0,
            "an enemy's recruits stay out of the feed"
        );
        let lost = Event::DivisionDestroyed {
            division: DivisionId(1),
            country: germany,
            cause: Loss::Surrendered,
        };
        assert!(
            concern(&lost, poland, &[germany]).0,
            "the enemy's losses show"
        );
        assert!(!concern(&lost, poland, &[]).0, "others' losses do not");
        let gave_up = Event::Capitulated { country: germany };
        assert_eq!(
            concern(&gave_up, poland, &[germany]),
            (true, "capitulated", "war", germany)
        );
        assert_eq!(concern(&gave_up, poland, &[]).1, "");
        let offer = Event::PeaceOffered {
            from: germany,
            to: poland,
        };
        assert_eq!(concern(&offer, poland, &[germany]).1, "peace_offer");
        assert_eq!(concern(&offer, france, &[]), (false, "", "", germany));
        let peace = Event::PeaceMade {
            from: poland,
            to: germany,
        };
        assert_eq!(
            concern(&peace, poland, &[]),
            (true, "peace", "peace", germany)
        );
        assert_eq!(
            concern(&recruited(germany), 0, &[]),
            (true, "", "", 0),
            "the viewer shows everything"
        );
        assert_eq!(
            concern(&war(germany, poland), 0, &[]).1,
            "",
            "and pops up nothing"
        );
    }
}
