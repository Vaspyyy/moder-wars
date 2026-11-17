//! The army groups a player starts with (owner's choice, 2026-11-17: groups
//! where the forces stand). One group per land neighbor that at least two
//! of the country's divisions face, each holding a front along that border;
//! divisions on quieter borders join the nearest group. A country with no
//! land border, or whose divisions never face a neighbor two at a time,
//! starts with none.

mod common;

use common::country;
use mw_sim::forces::{self, Personnel};
use mw_sim::world::{Command, Controller, CountryId, Order, World};
use std::collections::BTreeMap;

fn personnel() -> &'static Personnel {
    static CELL: std::sync::OnceLock<Personnel> = std::sync::OnceLock::new();
    CELL.get_or_init(|| {
        let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
        forces::read_personnel(&std::fs::read(path).unwrap(), common::world_2026()).unwrap()
    })
}

fn deployed() -> World {
    let mut world = World::new(common::world_2026(), 1);
    world.deploy_forces(personnel());
    world
}

/// The neighbor each of `country`'s divisions stands against (a foreign
/// land cell beside it), counted.
fn faced(world: &World, country: CountryId) -> BTreeMap<CountryId, usize> {
    let s = common::world_2026();
    let width = s.grid.width;
    let mut counts = BTreeMap::new();
    for d in world.divisions().iter().filter(|d| d.country == country) {
        let c = d.cell;
        let mut beside: Vec<CountryId> = [c - 1, c + 1, c - width, c + width]
            .iter()
            .filter(|&&n| s.land[n as usize] != 0)
            .map(|&n| world.control()[n as usize])
            .filter(|&h| h != 0 && h != country)
            .collect();
        beside.sort_unstable();
        beside.dedup();
        for h in beside {
            *counts.entry(h).or_insert(0) += 1;
        }
    }
    counts
}

#[test]
fn groups_form_where_the_forces_stand() {
    let s = common::world_2026();
    let mut world = deployed();
    let poland = country(s, "Poland");
    let faced = faced(&world, poland);
    let groups = world.form_starting_groups(poland);
    assert!(
        (2..=5).contains(&groups.len()),
        "Poland: {} groups for {faced:?}",
        groups.len()
    );
    let mut enemies = Vec::new();
    for group in world.army_groups() {
        assert!(groups.contains(&group.id));
        assert!(group.divisions.len() >= 2, "a group of one: {group:?}");
        let enemy = group.enemy.expect("each group faces a neighbor");
        assert!(!group.front.is_empty(), "with a front");
        assert!(
            faced.get(&enemy).is_some_and(|&k| k >= 2),
            "{enemy} is faced by at least two divisions: {faced:?}"
        );
        enemies.push(enemy);
    }
    enemies.sort_unstable();
    let before = enemies.len();
    enemies.dedup();
    assert_eq!(enemies.len(), before, "one group per neighbor");
    // Every Polish division is in a group, the quieter borders' too.
    let polish = world
        .divisions()
        .iter()
        .filter(|d| d.country == poland)
        .count();
    let grouped: usize = world.army_groups().iter().map(|g| g.divisions.len()).sum();
    assert_eq!(grouped, polish);
    // Main fronts first: the longest border's group leads the list.
    let order: Vec<CountryId> = world.neighbors(poland).iter().map(|&(n, _)| n).collect();
    let rank = |c: CountryId| order.iter().position(|&n| n == c).unwrap();
    let listed: Vec<usize> = world
        .army_groups()
        .iter()
        .map(|g| rank(g.enemy.unwrap()))
        .collect();
    assert!(listed.is_sorted(), "groups in border order: {listed:?}");
}

#[test]
fn a_big_army_gets_a_group_per_front_it_mans() {
    let s = common::world_2026();
    let mut world = deployed();
    let russia = country(s, "Russia");
    let faced = faced(&world, russia);
    let manned = faced.values().filter(|&&k| k >= 2).count();
    let groups = world.form_starting_groups(russia);
    assert!(
        groups.len() <= manned,
        "{} groups, {manned} manned fronts",
        groups.len()
    );
    assert!(groups.len() >= 3, "Russia mans several fronts: {faced:?}");
    for group in world.army_groups() {
        assert!(group.divisions.len() >= 2);
        assert!(!group.front.is_empty());
    }
}

#[test]
fn no_groups_without_a_land_front() {
    let s = common::world_2026();
    let mut world = deployed();
    // Japan's divisions stand in its cities.
    assert!(world.form_starting_groups(country(s, "Japan")).is_empty());
    // A lone division faces no neighbor two at a time.
    let belgium = country(s, "Belgium");
    let count = world
        .divisions()
        .iter()
        .filter(|d| d.country == belgium)
        .count();
    assert_eq!(count, 1, "Belgium starts with one division");
    assert!(world.form_starting_groups(belgium).is_empty());
    assert!(world.army_groups().is_empty());
}

#[test]
fn starting_groups_are_formed_once_and_the_same_every_time() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut a = deployed();
    let mut b = deployed();
    a.form_starting_groups(poland);
    b.form_starting_groups(poland);
    assert!(a == b, "the same world gives the same groups");
    assert!(
        a.form_starting_groups(poland).is_empty(),
        "a country with groups gets no more"
    );
    assert!(a == b);
}

#[test]
fn the_ai_sends_a_starting_group_to_a_war_on_an_unheld_border() {
    // Handed to the AI (the I key), a country whose starting groups hold
    // every division moves one of them to a war on a border none holds.
    let s = common::world_2026();
    let mut world = deployed();
    let poland = country(s, "Poland");
    world.form_starting_groups(poland);
    let held: Vec<CountryId> = world.army_groups().iter().filter_map(|g| g.enemy).collect();
    let enemy = world
        .neighbors(poland)
        .into_iter()
        .map(|(n, _)| n)
        .find(|n| !held.contains(n))
        .expect("a border with no starting group");
    world.set_controller(poland, Controller::Ai).unwrap();
    world
        .submit(Order {
            tick: world.tick(),
            country: enemy,
            command: Command::DeclareWar { target: poland },
        })
        .unwrap();
    let before: BTreeMap<_, usize> = world
        .army_groups()
        .iter()
        .map(|g| (g.id, g.divisions.len()))
        .collect();
    common::run(&mut world, 10 * 24);
    assert!(
        world
            .army_groups()
            .iter()
            .any(|g| g.country == poland && g.enemy == Some(enemy) && !g.front.is_empty()),
        "no Polish group faces {enemy}: {:?}",
        world.army_groups()
    );
    // The groups still on borders at peace are no war fronts: no arrows
    // into a country Poland is not at war with, and no recruits.
    for g in world.army_groups().iter().filter(|g| g.country == poland) {
        if g.enemy != Some(enemy) {
            assert!(g.arrow.is_empty(), "an arrow at peace: {g:?}");
            assert!(
                g.divisions.len() <= before.get(&g.id).copied().unwrap_or(0),
                "recruits sent to a border at peace: {g:?}"
            );
        }
    }
}

#[test]
fn a_group_sent_to_another_border_drops_its_arrow() {
    let s = common::world_2026();
    let mut world = deployed();
    let (poland, germany, czechia) = (
        country(s, "Poland"),
        country(s, "Germany"),
        country(s, "Czechia"),
    );
    world.form_starting_groups(poland);
    let group = world
        .army_groups()
        .iter()
        .find(|g| g.enemy == Some(germany))
        .expect("a group facing Germany")
        .id;
    let tick = world.tick();
    let order = |command| Order {
        tick,
        country: poland,
        command,
    };
    let berlin = common::cell(s, 13.4, 52.5);
    world
        .submit(order(Command::DrawArrow {
            group,
            line: vec![world.army_group(group).unwrap().front[0], berlin],
        }))
        .unwrap();
    world.apply_orders();
    assert!(
        !world.army_group(group).unwrap().arrow.is_empty(),
        "an arrow to Berlin"
    );
    let czech_border = world.border_cells(poland, czechia);
    world
        .submit(order(Command::SetFront {
            group,
            line: czech_border,
        }))
        .unwrap();
    world.apply_orders();
    let moved = world.army_group(group).unwrap();
    assert_eq!(moved.enemy, Some(czechia));
    assert!(
        moved.arrow.is_empty(),
        "the arrow into Germany went with the old front"
    );
}

#[test]
fn peace_drops_the_arrows_aimed_at_the_other_side() {
    // An arrow into a country you are at peace with can never be finished
    // (divisions do not enter its land), so making peace takes away the
    // arrows both sides aimed at each other, and only those.
    let s = common::world_2026();
    let mut world = deployed();
    let (poland, germany, ukraine) = (
        country(s, "Poland"),
        country(s, "Germany"),
        country(s, "Ukraine"),
    );
    world.form_starting_groups(poland);
    world.form_starting_groups(germany);
    let facing = |world: &World, own: CountryId, enemy: CountryId| {
        world
            .army_groups()
            .iter()
            .find(|g| g.country == own && g.enemy == Some(enemy))
            .unwrap_or_else(|| panic!("a group of {own} facing {enemy}"))
            .id
    };
    let polish = facing(&world, poland, germany);
    let german = facing(&world, germany, poland);
    let eastern = facing(&world, poland, ukraine);
    let order = |tick, country, command| Order {
        tick,
        country,
        command,
    };
    let arrow = |world: &World, group, lng, lat| Command::DrawArrow {
        group,
        line: vec![
            world.army_group(group).unwrap().front[0],
            common::cell(s, lng, lat),
        ],
    };
    let tick = world.tick();
    for o in [
        order(tick, poland, Command::DeclareWar { target: germany }),
        order(tick, poland, Command::DeclareWar { target: ukraine }),
        order(tick, poland, arrow(&world, polish, 13.4, 52.5)), // Berlin
        order(tick, germany, arrow(&world, german, 21.0, 52.2)), // Warsaw
        order(tick, poland, arrow(&world, eastern, 24.0, 49.8)), // Lviv
        order(tick, poland, Command::OfferPeace { to: germany }),
    ] {
        world.submit(o).unwrap();
    }
    world.apply_orders();
    for group in [polish, german, eastern] {
        assert!(
            !world.army_group(group).unwrap().arrow.is_empty(),
            "{group:?} has an arrow"
        );
    }
    world
        .submit(order(
            world.tick(),
            germany,
            Command::AnswerPeace {
                from: poland,
                accept: true,
            },
        ))
        .unwrap();
    world.apply_orders();
    assert_eq!(
        world.enemies(poland),
        vec![ukraine],
        "peace with Germany only"
    );
    for group in [polish, german] {
        let held = world.army_group(group).unwrap();
        assert!(
            held.arrow.is_empty(),
            "{group:?}: the arrow over the border is gone"
        );
        assert!(
            held.enemy.is_some() && !held.front.is_empty(),
            "{group:?} still holds it"
        );
    }
    assert!(
        !world.army_group(eastern).unwrap().arrow.is_empty(),
        "the arrow into Ukraine, still at war, stays"
    );
}
