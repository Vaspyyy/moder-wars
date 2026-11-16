//! Supply. Once a day, a country at war checks which of its divisions can
//! reach its capital over land it controls. When the capital falls, the
//! biggest city it still holds takes over. Divisions that cannot reach it are
//! cut off: they lose equipment, morale and soldiers until supply returns.
//! In peacetime supply does not matter.

mod common;

use common::{cell, country, run};
use mw_sim::world::{Command, Order, World};

struct Setup {
    world: World,
    moscow: mw_sim::division::DivisionId,
    kaliningrad: mw_sim::division::DivisionId,
}

/// Russian divisions in Moscow and in the Kaliningrad exclave, which has no
/// land link to the rest of Russia.
fn setup(at_war: bool) -> Setup {
    let s = common::world_2026();
    let (russia, poland) = (country(s, "Russia"), country(s, "Poland"));
    let mut world = World::new(s, 1);
    let moscow = world
        .spawn_division(russia, cell(s, 37.62, 55.75), 10_000)
        .unwrap();
    let kaliningrad = world
        .spawn_division(russia, cell(s, 20.51, 54.71), 10_000)
        .unwrap();
    if at_war {
        world
            .submit(Order {
                tick: 0,
                country: russia,
                command: Command::DeclareWar { target: poland },
            })
            .unwrap();
    }
    Setup {
        world,
        moscow,
        kaliningrad,
    }
}

#[test]
fn at_war_divisions_need_a_land_link_to_the_capital() {
    let Setup {
        mut world,
        moscow,
        kaliningrad,
    } = setup(true);
    world.step();
    assert!(world.division(moscow).unwrap().supplied);
    assert!(!world.division(kaliningrad).unwrap().supplied);
}

#[test]
fn cut_off_divisions_wither() {
    let Setup {
        mut world,
        moscow,
        kaliningrad,
    } = setup(true);
    run(&mut world, 10 * 24);
    let cut_off = world.division(kaliningrad).unwrap();
    assert!(cut_off.equipment < 0.75, "equipment {}", cut_off.equipment);
    assert!(cut_off.morale < 0.9, "morale {}", cut_off.morale);
    assert!(cut_off.personnel < 10_000);
    let supplied = world.division(moscow).unwrap();
    assert_eq!(
        (supplied.equipment, supplied.morale, supplied.personnel),
        (1.0, 1.0, 10_000)
    );
}

#[test]
fn in_peacetime_supply_does_not_matter() {
    let Setup {
        mut world,
        kaliningrad,
        ..
    } = setup(false);
    run(&mut world, 10 * 24);
    let division = world.division(kaliningrad).unwrap();
    assert!(division.supplied);
    assert_eq!(
        (division.equipment, division.morale, division.personnel),
        (1.0, 1.0, 10_000)
    );
}

#[test]
fn losing_the_capital_moves_supply_to_the_biggest_city_left() {
    // Poland has one capital. A Russian division takes undefended Warsaw;
    // a Polish one stands in Kraków.
    let s = common::world_2026();
    let (russia, poland) = (country(s, "Russia"), country(s, "Poland"));
    let capitals: Vec<_> = s
        .cities
        .iter()
        .filter(|c| c.owner_id == poland && c.is_capital)
        .collect();
    assert_eq!(capitals.len(), 1, "Poland has exactly one capital");
    let warsaw = cell(s, capitals[0].lng, capitals[0].lat);
    let mut world = World::new(s, 1);
    world
        .submit(Order {
            tick: 0,
            country: russia,
            command: Command::DeclareWar { target: poland },
        })
        .unwrap();
    let raiders = world.spawn_division(russia, warsaw, 10_000).unwrap();
    let krakow = world
        .spawn_division(poland, cell(s, 19.94, 50.06), 10_000)
        .unwrap();
    world.step();
    assert_eq!(world.control()[warsaw as usize], russia, "Warsaw fell");
    run(&mut world, 24);
    assert!(
        world.division(krakow).unwrap().supplied,
        "Kraków is still linked to Poland's biggest city left"
    );
    assert!(
        !world.division(raiders).unwrap().supplied,
        "the raiders in Warsaw are cut off from Russia"
    );
}
