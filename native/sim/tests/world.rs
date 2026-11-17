//! The world state and the command pipeline: controllers (player or AI)
//! change the world only through orders, applied at their tick in a fixed
//! order. Same seed and same orders always give the same world.

mod common;

use mw_sim::save;
use mw_sim::time::Date;
use mw_sim::world::{Command, Controller, Event, Order, OrderError, Rejection, World};

const UKRAINE: u16 = 167;
const RUSSIA: u16 = 136;
const POLAND: u16 = 128;

fn world() -> World {
    World::new(common::world_2026(), 2026)
}

fn declare(tick: u64, country: u16, target: u16) -> Order {
    Order {
        tick,
        country,
        command: Command::DeclareWar { target },
    }
}

#[test]
fn a_new_world_starts_at_the_scenario_date_with_every_country_passive() {
    let scenario = common::world_2026();
    let world = world();
    assert_eq!(world.tick(), 0);
    assert_eq!(world.time().date, Date::parse("2026-10-21").unwrap());
    let ids: Vec<u16> = scenario.countries.iter().flatten().map(|c| c.id).collect();
    assert_eq!(
        world.countries().iter().map(|c| c.id).collect::<Vec<_>>(),
        ids
    );
    assert!(
        world
            .countries()
            .iter()
            .all(|c| c.controller == Controller::Passive)
    );
    assert_eq!(world.control(), scenario.control.as_slice());
    assert!(!world.at_war(UKRAINE, RUSSIA));
}

#[test]
fn the_player_takes_one_country() {
    let mut world = world();
    world.set_controller(POLAND, Controller::Player).unwrap();
    assert_eq!(
        world.country(POLAND).unwrap().controller,
        Controller::Player
    );
    assert!(world.set_controller(9999, Controller::Player).is_err());
}

#[test]
fn declaring_war_applies_on_its_tick() {
    let mut world = world();
    world.submit(declare(0, RUSSIA, UKRAINE)).unwrap();
    let events = world.step();
    assert_eq!(
        events,
        vec![Event::WarDeclared {
            attacker: RUSSIA,
            target: UKRAINE
        }]
    );
    assert!(world.at_war(RUSSIA, UKRAINE));
    assert!(world.at_war(UKRAINE, RUSSIA), "war goes both ways");
    assert_eq!(world.tick(), 1);
}

#[test]
fn orders_wait_for_their_tick() {
    let mut world = world();
    world.submit(declare(5, RUSSIA, UKRAINE)).unwrap();
    for _ in 0..5 {
        assert!(world.step().is_empty());
        assert!(!world.at_war(RUSSIA, UKRAINE));
    }
    assert_eq!(world.step().len(), 1);
    assert!(world.at_war(RUSSIA, UKRAINE));
}

#[test]
fn orders_for_the_past_are_refused() {
    let mut world = world();
    world.step();
    world.step();
    assert_eq!(
        world.submit(declare(1, RUSSIA, UKRAINE)),
        Err(OrderError::InThePast { now: 2 })
    );
}

#[test]
fn impossible_orders_are_rejected_with_a_reason() {
    let mut world = world();
    world.submit(declare(0, RUSSIA, RUSSIA)).unwrap();
    world.submit(declare(0, RUSSIA, 9999)).unwrap();
    world.submit(declare(0, 9999, RUSSIA)).unwrap();
    world.submit(declare(0, POLAND, UKRAINE)).unwrap();
    world.submit(declare(0, POLAND, UKRAINE)).unwrap();
    let rejections: Vec<Rejection> = world
        .step()
        .into_iter()
        .filter_map(|event| match event {
            Event::Rejected { reason, .. } => Some(reason),
            _ => None,
        })
        .collect();
    // Same-tick orders apply by country id (9999 last), then by submission.
    assert_eq!(
        rejections,
        vec![
            Rejection::AlreadyAtWar,
            Rejection::SelfTarget,
            Rejection::UnknownCountry,
            Rejection::UnknownCountry
        ]
    );
    assert!(world.at_war(POLAND, UKRAINE));
    assert!(!world.at_war(RUSSIA, RUSSIA));
}

#[test]
fn same_tick_orders_apply_by_country_not_by_arrival() {
    // Ukraine (167) and Russia (136) declare on each other in the same tick.
    // Russia has the lower id, so its declaration wins, whoever was first.
    let run = |orders: [Order; 2]| {
        let mut world = world();
        for order in orders {
            world.submit(order).unwrap();
        }
        world.step()
    };
    let a = run([declare(0, UKRAINE, RUSSIA), declare(0, RUSSIA, UKRAINE)]);
    let b = run([declare(0, RUSSIA, UKRAINE), declare(0, UKRAINE, RUSSIA)]);
    assert_eq!(a, b);
    assert_eq!(
        a[0],
        Event::WarDeclared {
            attacker: RUSSIA,
            target: UKRAINE
        }
    );
}

/// A small scripted game used by the determinism tests.
fn scripted(world: &mut World, until: u64) {
    let script = [
        declare(10, RUSSIA, UKRAINE),
        declare(40, POLAND, RUSSIA),
        declare(41, UKRAINE, POLAND),
    ];
    for order in script {
        if order.tick >= world.tick() {
            world.submit(order).unwrap();
        }
    }
    while world.tick() < until {
        world.step();
    }
}

#[test]
fn same_seed_and_orders_give_the_same_world() {
    let mut a = world();
    let mut b = world();
    scripted(&mut a, 300);
    scripted(&mut b, 300);
    assert!(a == b, "two identical runs diverged");
}

#[test]
fn a_different_seed_gives_a_different_world() {
    let a = World::new(common::world_2026(), 1);
    let b = World::new(common::world_2026(), 2);
    assert!(a != b);
}

#[test]
fn save_and_load_round_trip() {
    let mut world = world();
    world.set_controller(POLAND, Controller::Player).unwrap();
    scripted(&mut world, 50);
    world.submit(declare(80, RUSSIA, POLAND)).unwrap(); // still pending
    let bytes = save::save(&world);
    let loaded = save::load(&bytes, common::world_2026(), None).expect("load");
    assert!(loaded == world, "loaded world differs");
}

#[test]
fn saving_and_continuing_matches_never_stopping() {
    let mut straight = world();
    scripted(&mut straight, 300);

    let mut first = world();
    scripted(&mut first, 120);
    let bytes = save::save(&first);
    drop(first);
    let mut resumed = save::load(&bytes, common::world_2026(), None).expect("load");
    scripted(&mut resumed, 300);

    assert!(
        resumed == straight,
        "a save/load in the middle changed the outcome"
    );
}

#[test]
fn a_save_only_loads_with_its_own_scenario() {
    let bytes = save::save(&world());
    assert!(matches!(
        save::load(&bytes, common::ukraine_2023(), None),
        Err(save::SaveError::WrongScenario)
    ));
    assert!(matches!(
        save::load(b"not a save", common::world_2026(), None),
        Err(save::SaveError::NotASave)
    ));
    assert!(save::load(&bytes[..bytes.len() / 2], common::world_2026(), None).is_err());
}

#[test]
fn saves_are_small_and_quick() {
    let world = world();
    let started = std::time::Instant::now();
    let bytes = save::save(&world);
    let loaded = save::load(&bytes, common::world_2026(), None).unwrap();
    let elapsed = started.elapsed();
    assert!(loaded == world);
    eprintln!("save: {} KB, save + load {elapsed:?}", bytes.len() / 1024);
    // The whole 6.5-million-cell control map is in the save.
    assert!(bytes.len() < 2_000_000, "save is {} bytes", bytes.len());
    // Generous: guards against accidental slowness, not a benchmark.
    assert!(elapsed.as_secs_f64() < 2.0, "save + load took {elapsed:?}");
}

#[test]
fn a_fingerprint_tells_whether_the_game_changed() {
    // The front end asks "Leave this game?" only when the game changed
    // since the last save: it keeps the fingerprint of what it saved.
    let mut world = world();
    let saved = save::fingerprint(&world);
    assert_eq!(save::fingerprint(&self::world()), saved, "the same game");
    world.submit(declare(5, RUSSIA, UKRAINE)).unwrap();
    let ordered = save::fingerprint(&world);
    assert_ne!(ordered, saved, "an order given while paused is a change");
    world.step();
    assert_ne!(save::fingerprint(&world), ordered, "so is time going on");
    let loaded = save::load(&save::save(&world), common::world_2026(), None).unwrap();
    assert_eq!(
        save::fingerprint(&loaded),
        save::fingerprint(&world),
        "a loaded game is the saved one"
    );
}
