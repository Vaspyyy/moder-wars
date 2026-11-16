//! Combat. A division that moves into a cell held by enemy divisions attacks
//! it. Each hour both sides lose morale and soldiers in proportion to the
//! strength ratio; defenders have the advantage, more so in cities. A
//! defender whose morale breaks falls back one cell, or surrenders when it
//! has nowhere to go.

mod common;

use common::{cell, country, run};
use mw_sim::division::{DivisionId, Loss};
use mw_sim::save;
use mw_sim::world::{Command, Event, Order, World};

struct Front {
    poland: u16,
    ukraine: u16,
    /// Ukrainian cell on the border, and its Polish neighbour to the west.
    defended: u32,
    staging: u32,
}

fn front() -> Front {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (defended, staging) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    Front {
        poland,
        ukraine,
        defended,
        staging,
    }
}

fn order(world: &mut World, country: u16, command: Command) {
    let tick = world.tick();
    world
        .submit(Order {
            tick,
            country,
            command,
        })
        .unwrap();
}

/// A world at war where `attackers` Polish divisions attack `defenders`
/// Ukrainian ones holding `defended` from `staging`.
fn battle(
    seed: u64,
    attackers: usize,
    defenders: usize,
    defended: u32,
    staging: u32,
) -> (World, Vec<DivisionId>, Vec<DivisionId>) {
    let f = front();
    let mut world = World::new(common::world_2026(), seed);
    order(
        &mut world,
        f.poland,
        Command::DeclareWar { target: f.ukraine },
    );
    let held: Vec<_> = (0..defenders)
        .map(|_| world.spawn_division(f.ukraine, defended, 10_000).unwrap())
        .collect();
    let attacking: Vec<_> = (0..attackers)
        .map(|_| world.spawn_division(f.poland, staging, 10_000).unwrap())
        .collect();
    for &d in &attacking {
        order(
            &mut world,
            f.poland,
            Command::MoveDivision {
                division: d,
                to: defended,
            },
        );
    }
    (world, attacking, held)
}

/// Whether Poland holds the defended cell with a division within `hours`.
fn attack_wins(seed: u64, attackers: usize, hours: u64) -> bool {
    let f = front();
    let (mut world, _, _) = battle(seed, attackers, 1, f.defended, f.staging);
    for _ in 0..hours {
        world.step();
        let occupants: Vec<u16> = world
            .divisions()
            .iter()
            .filter(|d| d.cell == f.defended)
            .map(|d| d.country)
            .collect();
        if !occupants.is_empty() && occupants.iter().all(|&c| c == f.poland) {
            return true;
        }
    }
    false
}

#[test]
fn three_to_one_attacks_usually_win() {
    let wins = (1..=20)
        .filter(|&seed| attack_wins(seed, 3, 7 * 24))
        .count();
    assert!(wins >= 18, "3:1 won {wins} of 20 battles within a week");
}

#[test]
fn even_attacks_on_a_defender_usually_fail() {
    let wins = (1..=20)
        .filter(|&seed| attack_wins(seed, 1, 3 * 24))
        .count();
    assert!(wins <= 5, "1:1 won {wins} of 20 battles within three days");
}

#[test]
fn at_even_odds_the_defender_has_the_edge() {
    let f = front();
    let edge = (1..=20)
        .filter(|&seed| {
            let (mut world, attacking, held) = battle(seed, 1, 1, f.defended, f.staging);
            run(&mut world, 12);
            world.division(held[0]).unwrap().morale > world.division(attacking[0]).unwrap().morale
        })
        .count();
    assert!(
        edge >= 16,
        "the defender kept more morale in {edge} of 20 battles"
    );
}

#[test]
fn divisions_marching_into_each_other_fight() {
    let f = front();
    let mut world = World::new(common::world_2026(), 1);
    order(
        &mut world,
        f.poland,
        Command::DeclareWar { target: f.ukraine },
    );
    let polish = world.spawn_division(f.poland, f.staging, 10_000).unwrap();
    let ukrainian = world.spawn_division(f.ukraine, f.defended, 10_000).unwrap();
    order(
        &mut world,
        f.poland,
        Command::MoveDivision {
            division: polish,
            to: f.defended,
        },
    );
    order(
        &mut world,
        f.ukraine,
        Command::MoveDivision {
            division: ukrainian,
            to: f.staging,
        },
    );
    run(&mut world, 12);
    for d in [polish, ukrainian] {
        assert!(
            world.division(d).unwrap().personnel < 10_000,
            "{d:?} never fought"
        );
    }
}

#[test]
fn battles_cost_both_sides_soldiers_and_morale() {
    let f = front();
    let (mut world, attacking, held) = battle(1, 1, 1, f.defended, f.staging);
    run(&mut world, 12);
    for d in [attacking[0], held[0]] {
        let division = world.division(d).unwrap();
        assert!(division.personnel < 10_000, "{d:?} lost nobody");
        assert!(division.morale < 1.0, "{d:?} kept full morale");
    }
}

#[test]
fn a_broken_defender_falls_back_and_the_attacker_moves_in() {
    let f = front();
    let s = common::world_2026();
    let (mut world, attacking, held) = battle(1, 3, 1, f.defended, f.staging);
    let mut retreat = None;
    for _ in 0..7 * 24 {
        retreat = world.step().into_iter().find_map(|e| match e {
            Event::DivisionRetreated { division, from, to } if division == held[0] => {
                Some((from, to))
            }
            _ => None,
        });
        if retreat.is_some() {
            break;
        }
    }
    let (from, to) = retreat.expect("the defender fell back");
    assert_eq!(from, f.defended);
    assert_eq!(
        world.control()[to as usize],
        f.ukraine,
        "fell back onto its own land"
    );
    let width = s.grid.width as i64;
    let (dx, dy) = (
        (to as i64 % width) - (from as i64 % width),
        (to as i64 / width) - (from as i64 / width),
    );
    assert!(dy.abs() <= 1, "fell back to a neighbouring cell");
    // The attack came from the west, so the defender fell back east.
    assert_eq!(dx, 1, "fell back away from the attackers");
    run(&mut world, 3 * 24);
    assert!(
        attacking
            .iter()
            .any(|&d| world.division(d).is_some_and(|d| d.cell == f.defended)),
        "an attacker moved in"
    );
}

#[test]
fn a_defender_with_nowhere_to_go_surrenders() {
    let s = common::world_2026();
    let f = front();
    let mut world = World::new(s, 1);
    order(
        &mut world,
        f.poland,
        Command::DeclareWar { target: f.ukraine },
    );
    let centre = cell(s, 30.05, 49.05);
    let defender = world.spawn_division(f.ukraine, centre, 10_000).unwrap();
    let width = s.grid.width as i64;
    for (dx, dy) in [
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    ] {
        let around = (centre as i64 + dy * width + dx) as u32;
        let d = world.spawn_division(f.poland, around, 10_000).unwrap();
        order(
            &mut world,
            f.poland,
            Command::MoveDivision {
                division: d,
                to: centre,
            },
        );
    }
    let events = run(&mut world, 3 * 24);
    assert!(
        events.contains(&Event::DivisionDestroyed {
            division: defender,
            country: f.ukraine,
            cause: Loss::Surrendered
        }),
        "the encircled defender surrendered"
    );
    assert!(world.division(defender).is_none());
}

#[test]
fn cities_are_harder_to_take() {
    // Same seed, same odds: one defender in Lviv, one in open country.
    let s = common::world_2026();
    let lviv = s
        .cities
        .iter()
        .find(|c| c.name == "Lvov")
        .expect("Lviv (spelled Lvov in the data)");
    let in_city = cell(s, lviv.lng, lviv.lat);
    let in_open = cell(s, 25.55, 49.25);
    let mut morale = Vec::new();
    for defended in [in_city, in_open] {
        let (mut world, _, held) = battle(1, 2, 1, defended, defended - 1);
        run(&mut world, 12);
        morale.push(world.division(held[0]).unwrap().morale);
    }
    assert!(
        morale[0] > morale[1],
        "city defender {} vs open {}",
        morale[0],
        morale[1]
    );
}

#[test]
fn a_battle_replays_exactly_and_survives_a_save() {
    let f = front();
    let s = common::world_2026();
    let (mut straight, _, _) = battle(7, 3, 1, f.defended, f.staging);
    run(&mut straight, 90);

    let (mut interrupted, _, _) = battle(7, 3, 1, f.defended, f.staging);
    run(&mut interrupted, 30);
    let mut resumed = save::load(&save::save(&interrupted), s).unwrap();
    run(&mut resumed, 60);
    assert!(resumed == straight, "saving mid-battle changed the outcome");

    let (mut again, _, _) = battle(7, 3, 1, f.defended, f.staging);
    run(&mut again, 90);
    assert!(again == straight, "same seed, different battle");
}
