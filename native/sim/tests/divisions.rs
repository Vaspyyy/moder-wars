//! Divisions: moving over land and taking ground. A division stands on a
//! grid cell and marches cell by cell along a path over land. It never
//! crosses water or enters a country it is not at war with. Undefended enemy
//! land near a division changes hands; land near a defender does not.

mod common;

use common::{cell, country, run};
use mw_sim::division::DivisionId;
use mw_sim::world::{Command, Event, Order, Rejection, World};

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

fn move_to(world: &mut World, country: u16, division: DivisionId, to: u32) {
    order(world, country, Command::MoveDivision { division, to });
}

fn declare_war(world: &mut World, attacker: u16, target: u16) {
    order(world, attacker, Command::DeclareWar { target });
}

/// Hours until `division` reports arriving, or None within `limit`.
fn hours_to_arrive(world: &mut World, division: DivisionId, limit: u64) -> Option<u64> {
    let start = world.tick();
    for _ in 0..limit {
        if world.step().contains(&Event::DivisionArrived { division }) {
            return Some(world.tick() - start);
        }
    }
    None
}

fn rejections(events: &[Event]) -> Vec<Rejection> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Rejected { reason, .. } => Some(*reason),
            _ => None,
        })
        .collect()
}

/// Great-circle distance in kilometres.
fn km(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (lat1, lat2) = (a.1.to_radians(), b.1.to_radians());
    let dlat = lat2 - lat1;
    let dlng = (b.0 - a.0).to_radians();
    let h = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlng / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

#[test]
fn a_division_marches_to_its_target_at_a_realistic_pace() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let (warsaw, krakow) = ((21.01, 52.23), (19.94, 50.06));
    let mut world = World::new(s, 1);
    let d = world
        .spawn_division(poland, cell(s, warsaw.0, warsaw.1), 10_000)
        .unwrap();
    move_to(&mut world, poland, d, cell(s, krakow.0, krakow.1));
    let hours = hours_to_arrive(&mut world, d, 500).expect("arrives in Kraków");
    let per_day = km(warsaw, krakow) / hours as f64 * 24.0;
    assert!(
        (25.0..=50.0).contains(&per_day),
        "marched {per_day:.0} km a day ({hours} hours)"
    );
    let division = world.division(d).unwrap();
    assert_eq!(division.cell, cell(s, krakow.0, krakow.1));
    assert!(!division.is_moving());
}

#[test]
fn speed_is_in_kilometres_so_cells_near_the_poles_are_quicker_to_cross() {
    // 20 cells due east at 60°N cover about half the distance of 20 cells
    // at 10°S, so they take about half as long.
    let s = common::world_2026();
    let mut hours = Vec::new();
    for (name, lat, from_lng) in [("Russia", 60.05, 40.05), ("Brazil", -10.05, -59.95)] {
        let owner = country(s, name);
        let mut world = World::new(s, 1);
        let d = world
            .spawn_division(owner, cell(s, from_lng, lat), 10_000)
            .unwrap();
        move_to(&mut world, owner, d, cell(s, from_lng + 2.0, lat));
        hours.push(hours_to_arrive(&mut world, d, 500).expect("arrives") as f64);
    }
    let ratio = hours[0] / hours[1];
    assert!(
        (0.42..=0.6).contains(&ratio),
        "60°N took {} h, 10°S took {} h",
        hours[0],
        hours[1]
    );
}

#[test]
fn advancing_through_land_the_enemy_still_defends_is_slower() {
    // Ten cells east along the same row: inside Poland, and into Ukraine
    // past a screen of Ukrainian divisions one row north of the route, which
    // keeps the route Ukrainian (undefended land would fall before the
    // division even got there). The second takes about twice as long.
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (_, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let width = s.grid.width;
    let mut hours = Vec::new();
    for (start, screened) in [(polish_side - 12, false), (polish_side, true)] {
        let mut world = World::new(s, 1);
        declare_war(&mut world, poland, ukraine);
        if screened {
            for x in (1..=10).step_by(3) {
                world
                    .spawn_division(ukraine, start + x + width, 10_000)
                    .unwrap();
            }
        }
        let d = world.spawn_division(poland, start, 10_000).unwrap();
        move_to(&mut world, poland, d, start + 10);
        hours.push(hours_to_arrive(&mut world, d, 500).expect("arrives") as f64);
    }
    let ratio = hours[1] / hours[0];
    assert!(
        (1.6..=2.2).contains(&ratio),
        "own land {} h, defended enemy land {} h",
        hours[0],
        hours[1]
    );
}

#[test]
fn divisions_never_cross_water_or_enter_a_country_they_are_not_at_war_with() {
    let s = common::world_2026();
    let japan = country(s, "Japan");
    let poland = country(s, "Poland");
    let germany = country(s, "Germany");
    let mut world = World::new(s, 1);

    // Honshu to Hokkaido needs a sea crossing.
    let tokyo = world
        .spawn_division(japan, cell(s, 139.69, 35.69), 10_000)
        .unwrap();
    move_to(&mut world, japan, tokyo, cell(s, 141.35, 43.06));
    // Germany is neutral to Poland.
    let warsaw = world
        .spawn_division(poland, cell(s, 21.01, 52.23), 10_000)
        .unwrap();
    let berlin = cell(s, 13.40, 52.52);
    move_to(&mut world, poland, warsaw, berlin);
    let events = world.step();
    assert_eq!(
        rejections(&events),
        vec![Rejection::Unreachable, Rejection::Unreachable]
    );

    // At war, Germany is open.
    declare_war(&mut world, poland, germany);
    move_to(&mut world, poland, warsaw, berlin);
    let events = world.step();
    assert!(rejections(&events).is_empty(), "{events:?}");
    assert!(world.division(warsaw).unwrap().is_moving());
}

#[test]
fn a_country_only_commands_its_own_divisions() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let ukraine = country(s, "Ukraine");
    let mut world = World::new(s, 1);
    let d = world
        .spawn_division(poland, cell(s, 21.01, 52.23), 10_000)
        .unwrap();
    move_to(&mut world, ukraine, d, cell(s, 19.94, 50.06));
    move_to(&mut world, poland, DivisionId(999), cell(s, 19.94, 50.06));
    let events = world.step();
    assert_eq!(
        rejections(&events),
        vec![Rejection::UnknownDivision, Rejection::NotYourDivision]
    );
}

#[test]
fn divisions_can_only_be_placed_on_land() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    assert!(
        world
            .spawn_division(poland, cell(s, 18.0, 55.5), 10_000)
            .is_err(),
        "Baltic Sea"
    );
    assert!(
        world
            .spawn_division(9999, cell(s, 21.0, 52.2), 10_000)
            .is_err(),
        "no such country"
    );
}

#[test]
fn undefended_enemy_land_changes_hands_when_a_division_marches_through() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (_, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let target = polish_side + 10; // 10 cells (about 1°) east, inside Ukraine
    let mut world = World::new(s, 1);
    declare_war(&mut world, poland, ukraine);
    let d = world.spawn_division(poland, polish_side, 10_000).unwrap();
    move_to(&mut world, poland, d, target);
    hours_to_arrive(&mut world, d, 500).expect("arrives");
    world.step();
    for c in polish_side..=target {
        assert_eq!(world.control()[c as usize], poland, "cell {c} on the route");
    }
    // Land well away from the route stays Ukrainian.
    let away = cell(s, 26.0, 49.5) as usize;
    assert_eq!(world.control()[away], ukraine);
}

#[test]
fn land_does_not_change_hands_while_a_defender_is_near() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (ukrainian_side, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let mut world = World::new(s, 1);
    declare_war(&mut world, poland, ukraine);
    world.spawn_division(poland, polish_side, 10_000).unwrap();
    world
        .spawn_division(ukraine, ukrainian_side, 10_000)
        .unwrap();
    run(&mut world, 48);
    assert_eq!(world.control()[polish_side as usize], poland);
    assert_eq!(world.control()[ukrainian_side as usize], ukraine);
}

#[test]
fn without_a_war_no_land_changes_hands() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (ukrainian_side, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let mut world = World::new(s, 1);
    world.spawn_division(poland, polish_side, 10_000).unwrap();
    world
        .spawn_division(ukraine, ukrainian_side, 10_000)
        .unwrap();
    run(&mut world, 48);
    assert_eq!(world.control(), s.control.as_slice());
}

#[test]
fn a_thousand_divisions_at_war_tick_quickly() {
    let s = common::world_2026();
    let (russia, ukraine) = (country(s, "Russia"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    declare_war(&mut world, russia, ukraine);
    let width = s.grid.width as usize;
    let pick = |owner: u16, lng: (f64, f64), lat: (f64, f64)| -> Vec<u32> {
        let cells: Vec<u32> = (0..s.grid.len())
            .filter(|&c| {
                let (x, y) = (
                    (c % width) as f64 * 0.1 - 180.0,
                    (c / width) as f64 * 0.1 - 90.0,
                );
                s.control[c] == owner
                    && s.land[c] != 0
                    && (lng.0..lng.1).contains(&x)
                    && (lat.0..lat.1).contains(&y)
            })
            .map(|c| c as u32)
            .collect();
        let stride = (cells.len() / 500).max(1);
        cells.into_iter().step_by(stride).take(500).collect()
    };
    let mut orders = Vec::new();
    for (owner, cells, shift) in [
        (russia, pick(russia, (36.5, 40.0), (49.5, 53.0)), -20i64),
        (ukraine, pick(ukraine, (32.0, 36.0), (47.5, 51.0)), 20),
    ] {
        assert_eq!(cells.len(), 500);
        for c in cells {
            let d = world.spawn_division(owner, c, 10_000).unwrap();
            orders.push((owner, d, (c as i64 + shift) as u32));
        }
    }
    let started = std::time::Instant::now();
    for (owner, d, to) in orders {
        move_to(&mut world, owner, d, to);
    }
    run(&mut world, 48);
    let elapsed = started.elapsed();
    eprintln!("1000 divisions, 48 hours: {elapsed:?}");
    // Generous: guards against accidental slowness, not a benchmark.
    assert!(elapsed.as_secs_f64() < 3.0, "48 hours took {elapsed:?}");
}

#[test]
fn cell_centres_and_points_agree() {
    let grid = common::world_2026().grid;
    assert_eq!(grid.center(0), (-179.95, -89.95));
    for (lng, lat) in [
        (21.01, 52.23),
        (-58.38, -34.6),
        (179.97, 0.02),
        (-180.0, 85.0),
    ] {
        let cell = grid.cell_at(lng, lat).unwrap();
        let (x, y) = grid.center(cell);
        assert!((x - lng).abs() <= 0.05 + 1e-9 && (y - lat).abs() <= 0.05 + 1e-9);
        assert_eq!(grid.cell_at(x, y), Some(cell));
    }
}

#[test]
fn a_marching_division_is_shown_moving_smoothly_between_cells() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    let start = cell(s, 21.01, 52.23);
    let d = world.spawn_division(poland, start, 10_000).unwrap();
    assert_eq!(
        world.location(world.division(d).unwrap()),
        s.grid.center(start as usize)
    );
    move_to(&mut world, poland, d, start + 15); // due east, still in Poland
    let mut last = world.location(world.division(d).unwrap());
    for _ in 0..12 {
        world.step();
        let division = world.division(d).unwrap();
        let (lng, lat) = world.location(division);
        assert!(
            lng > last.0,
            "moved east every hour: {lng} after {}",
            last.0
        );
        assert!((lat - last.1).abs() < 1e-9, "stayed on the row");
        let (cell_lng, _) = s.grid.center(division.cell as usize);
        assert!(
            (cell_lng..cell_lng + 0.1).contains(&lng),
            "between its cell and the next"
        );
        last = (lng, lat);
    }
}
