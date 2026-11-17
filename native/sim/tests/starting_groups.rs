//! The army groups a player starts with (owner's choice, 2026-11-17: groups
//! where the forces stand). One group per land neighbor that at least two
//! of the country's divisions face, each holding a front along that border;
//! divisions on quieter borders join the nearest group. A country with no
//! land border, or whose divisions never face a neighbor two at a time,
//! starts with none.

mod common;

use common::country;
use mw_sim::forces::{self, Personnel};
use mw_sim::world::{CountryId, World};
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
