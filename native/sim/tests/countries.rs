//! What the screens say about a country: the countries it borders (longest
//! shared border first) and the countries it is at war with.

mod common;

use std::collections::BTreeSet;

use common::country;
use mw_sim::world::{Command, CountryId, Order, World};

fn ids(names: &[&str]) -> BTreeSet<CountryId> {
    let s = common::world_2026();
    names.iter().map(|n| country(s, n)).collect()
}

#[test]
fn a_country_borders_the_countries_whose_land_touches_its_own() {
    let s = common::world_2026();
    let world = World::new(s, 1);
    let neighbors = world.neighbors(country(s, "Poland"));
    assert_eq!(
        neighbors.iter().map(|&(c, _)| c).collect::<BTreeSet<_>>(),
        ids(&[
            "Germany",
            "Czechia",
            "Slovakia",
            "Ukraine",
            "Belarus",
            "Lithuania",
            "Russia"
        ])
    );
    assert!(
        neighbors.windows(2).all(|w| w[0].1 >= w[1].1),
        "longest border first: {neighbors:?}"
    );
    assert!(neighbors.iter().all(|&(_, length)| length > 0));
    assert!(
        world.neighbors(country(s, "Iceland")).is_empty(),
        "the sea is not a border"
    );
}

#[test]
fn borders_follow_the_front() {
    // A Polish division deep in Ukraine makes Poland a neighbor of Moldova
    // for as long as it holds the land there.
    let s = common::world_2026();
    let (poland, ukraine, moldova) = (
        country(s, "Poland"),
        country(s, "Ukraine"),
        country(s, "Moldova"),
    );
    let mut world = World::new(s, 1);
    world
        .submit(Order {
            tick: 0,
            country: poland,
            command: Command::DeclareWar { target: ukraine },
        })
        .unwrap();
    world.step();
    let near_moldova = common::cell(s, 28.2, 48.45);
    world.spawn_division(poland, near_moldova, 10_000).unwrap();
    world.step();
    assert!(
        world.neighbors(poland).iter().any(|&(c, _)| c == moldova),
        "{:?}",
        world.neighbors(poland)
    );
}

#[test]
fn enemies_are_the_countries_at_war_with_it() {
    let s = common::world_2026();
    let (poland, ukraine, belarus, germany) = (
        country(s, "Poland"),
        country(s, "Ukraine"),
        country(s, "Belarus"),
        country(s, "Germany"),
    );
    let mut world = World::new(s, 1);
    for target in [ukraine, belarus] {
        world
            .submit(Order {
                tick: 0,
                country: poland,
                command: Command::DeclareWar { target },
            })
            .unwrap();
    }
    world.step();
    let mut both = vec![ukraine, belarus];
    both.sort();
    assert_eq!(world.enemies(poland), both);
    assert_eq!(world.enemies(ukraine), vec![poland]);
    assert!(world.enemies(germany).is_empty());
}
