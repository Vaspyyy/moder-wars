//! Army groups: fronts and arrows become division orders. A group's front
//! is a line drawn near a border; the group snaps it to its own land along
//! that border and spreads its divisions along it. Without an arrow the
//! group holds. With an arrow every division at the front attacks the enemy
//! land next to it that lies in the arrow's direction, and the front moves
//! with them until the arrow's tip is taken.

mod common;

use common::{cell, country, run};
use mw_sim::army::ArmyGroupId;
use mw_sim::division::DivisionId;
use mw_sim::save;
use mw_sim::scenario::Scenario;
use mw_sim::world::{Command, CountryId, Event, Order, Rejection, World};

/// The Polish-Ukrainian border drawn by hand, north to south, a little off
/// the real line on purpose.
const BORDER_DRAWN: [(f64, f64); 5] = [
    (23.6, 51.45),
    (24.1, 50.8),
    (23.5, 50.2),
    (22.7, 49.5),
    (22.6, 49.15),
];
/// Lutsk, about 100 km east of the border.
const LUTSK: (f64, f64) = (25.32, 50.75);

fn cells(s: &Scenario, points: &[(f64, f64)]) -> Vec<u32> {
    points.iter().map(|&(lng, lat)| cell(s, lng, lat)).collect()
}

fn order(world: &mut World, country: CountryId, command: Command) {
    let tick = world.tick();
    world
        .submit(Order {
            tick,
            country,
            command,
        })
        .unwrap();
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

/// Create a group from `divisions` and return its id.
fn create_group(world: &mut World, country: CountryId, divisions: Vec<DivisionId>) -> ArmyGroupId {
    order(world, country, Command::CreateArmyGroup { divisions });
    world
        .step()
        .into_iter()
        .find_map(|e| match e {
            Event::ArmyGroupCreated { group, .. } => Some(group),
            _ => None,
        })
        .expect("group created")
}

/// Own land touching land held by `enemy` (side neighbours).
fn is_contact(world: &World, s: &Scenario, cell: u32, own: CountryId, enemy: CountryId) -> bool {
    let width = s.grid.width;
    let held = |c: u32, by| world.control()[c as usize] == by && s.land[c as usize] != 0;
    held(cell, own)
        && [cell - 1, cell + 1, cell - width, cell + width]
            .iter()
            .any(|&n| held(n, enemy))
}

fn km(s: &Scenario, a: u32, b: u32) -> f64 {
    let ((lng1, lat1), (lng2, lat2)) = (s.grid.center(a as usize), s.grid.center(b as usize));
    let (lat1, lat2) = (lat1.to_radians(), lat2.to_radians());
    let h = ((lat2 - lat1) / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * ((lng2 - lng1).to_radians() / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

struct Front {
    world: World,
    group: ArmyGroupId,
    divisions: Vec<DivisionId>,
    poland: CountryId,
    ukraine: CountryId,
}

/// Six Polish divisions holding the drawn front, already in place; Poland at
/// war with Ukraine when `at_war`, with Ukrainian divisions on `defended`.
fn polish_front(at_war: bool, defended: &[(f64, f64)]) -> Front {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    let border = world.border_cells(poland, ukraine);
    let divisions: Vec<_> = (0..6)
        .map(|i| {
            let at = border[(2 * i + 1) * border.len() / 12];
            world.spawn_division(poland, at, 10_000).unwrap()
        })
        .collect();
    for &(lng, lat) in defended {
        world
            .spawn_division(ukraine, cell(s, lng, lat), 10_000)
            .unwrap();
    }
    if at_war {
        order(&mut world, poland, Command::DeclareWar { target: ukraine });
    }
    let group = create_group(&mut world, poland, divisions.clone());
    order(
        &mut world,
        poland,
        Command::SetFront {
            group,
            line: cells(s, &BORDER_DRAWN),
        },
    );
    world.step();
    Front {
        world,
        group,
        divisions,
        poland,
        ukraine,
    }
}

#[test]
fn a_drawn_front_gets_covered() {
    // Six divisions start together in Warsaw; the front is drawn roughly
    // along the Ukrainian border. Two weeks later they stand spread along it.
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    let warsaw = cell(s, 21.01, 52.23);
    let divisions: Vec<_> = (0..6)
        .map(|_| world.spawn_division(poland, warsaw, 10_000).unwrap())
        .collect();
    let group = create_group(&mut world, poland, divisions.clone());
    order(
        &mut world,
        poland,
        Command::SetFront {
            group,
            line: cells(s, &BORDER_DRAWN),
        },
    );
    let events = run(&mut world, 14 * 24);
    assert!(rejections(&events).is_empty(), "{events:?}");

    let army = world.army_group(group).unwrap();
    assert_eq!(army.enemy, Some(ukraine));
    assert!(
        army.front.len() >= 10,
        "front of {} points",
        army.front.len()
    );
    for &c in &army.front {
        assert!(is_contact(&world, s, c, poland, ukraine), "front cell {c}");
    }
    let at: Vec<u32> = divisions
        .iter()
        .map(|&d| world.division(d).unwrap().cell)
        .collect();
    for &c in &at {
        assert!(is_contact(&world, s, c, poland, ukraine), "division at {c}");
    }
    // The border is about 535 km long, so six divisions stand about 90 km
    // apart; no stretch of it is far from one of them.
    for &c in &world.border_cells(poland, ukraine) {
        let nearest = at.iter().map(|&d| km(s, c, d)).fold(f64::MAX, f64::min);
        assert!(
            nearest < 75.0,
            "border cell {c} is {nearest:.0} km from the front line"
        );
    }
    for (i, &a) in at.iter().enumerate() {
        for &b in &at[i + 1..] {
            assert!(km(s, a, b) > 30.0, "two divisions bunched at {a} and {b}");
        }
    }
    // The front follows the border without zigzagging back and forth.
    let length: f64 = army.front.windows(2).map(|w| km(s, w[0], w[1])).sum();
    eprintln!("front length {length:.0} km");
    assert!(length < 800.0, "front is {length:.0} km long");
}

#[test]
fn a_front_without_an_arrow_holds() {
    let s = common::world_2026();
    let mut f = polish_front(true, &[]);
    let before: Vec<u32> = f
        .divisions
        .iter()
        .map(|&d| f.world.division(d).unwrap().cell)
        .collect();
    run(&mut f.world, 10 * 24);
    let lutsk = cell(s, LUTSK.0, LUTSK.1) as usize;
    assert_eq!(f.world.control()[lutsk], f.ukraine);
    for (&d, &was) in f.divisions.iter().zip(&before) {
        let now = f.world.division(d).unwrap().cell;
        assert!(
            km(s, was, now) < 25.0,
            "{d:?} wandered {:.0} km",
            km(s, was, now)
        );
    }
}

#[test]
fn an_arrow_advances_the_front_until_its_tip_is_taken() {
    let s = common::world_2026();
    // Two Ukrainian divisions stand in the way.
    let mut f = polish_front(true, &[(24.45, 50.7), (24.3, 50.3)]);
    let start = f.world.army_group(f.group).unwrap().front.clone();
    order(
        &mut f.world,
        f.poland,
        Command::DrawArrow {
            group: f.group,
            line: cells(s, &[(24.0, 50.6), LUTSK]),
        },
    );
    let mut reached = false;
    for _ in 0..30 * 24 {
        let events = f.world.step();
        assert!(rejections(&events).is_empty(), "{events:?}");
        if events.contains(&Event::ArrowReached { group: f.group }) {
            reached = true;
            break;
        }
    }
    assert!(reached, "the arrow never reached Lutsk");
    let lutsk = cell(s, LUTSK.0, LUTSK.1) as usize;
    assert_eq!(f.world.control()[lutsk], f.poland);
    let army = f.world.army_group(f.group).unwrap();
    assert!(army.arrow.is_empty(), "a reached arrow is done");

    // The front bulged east with the divisions: its flanks hold where they
    // were drawn, all of it stays on Polish land, and its most forward point
    // is on the new border near Lutsk.
    let mean_lng = |front: &[u32]| {
        front
            .iter()
            .map(|&c| s.grid.center(c as usize).0)
            .sum::<f64>()
            / front.len() as f64
    };
    assert!(
        mean_lng(&army.front) > mean_lng(&start) + 0.2,
        "front moved from {:.2}°E to {:.2}°E",
        mean_lng(&start),
        mean_lng(&army.front)
    );
    for &c in &army.front {
        assert_eq!(f.world.control()[c as usize], f.poland, "front cell {c}");
    }
    let tip = *army
        .front
        .iter()
        .max_by(|&&a, &&b| {
            s.grid
                .center(a as usize)
                .0
                .total_cmp(&s.grid.center(b as usize).0)
        })
        .unwrap();
    assert!(
        is_contact(&f.world, s, tip, f.poland, f.ukraine),
        "front tip {tip}"
    );
    assert!(
        km(s, tip, lutsk as u32) < 60.0,
        "front tip {:.0} km from Lutsk",
        km(s, tip, lutsk as u32)
    );
    // Attacking cell by cell keeps the land behind them: still supplied.
    run(&mut f.world, 24);
    for &d in &f.divisions {
        if let Some(division) = f.world.division(d) {
            assert!(division.supplied, "{d:?} got cut off at {}", division.cell);
        }
    }
}

#[test]
fn a_direct_order_takes_a_division_out_of_its_group() {
    let s = common::world_2026();
    let mut f = polish_front(false, &[]);
    let d = f.divisions[0];
    order(
        &mut f.world,
        f.poland,
        Command::MoveDivision {
            division: d,
            to: cell(s, 21.01, 52.23),
        },
    );
    run(&mut f.world, 24);
    let army = f.world.army_group(f.group).unwrap();
    assert!(!army.divisions.contains(&d));
    assert_eq!(army.divisions.len(), 5);
    assert!(
        f.world.division(d).unwrap().is_moving(),
        "heading for Warsaw"
    );
}

#[test]
fn an_arrow_needs_a_front() {
    let s = common::world_2026();
    let mut f = polish_front(true, &[]);
    let fresh = create_group(&mut f.world, f.poland, Vec::new());
    order(
        &mut f.world,
        f.poland,
        Command::DrawArrow {
            group: fresh,
            line: cells(s, &[(24.0, 50.6), LUTSK]),
        },
    );
    assert_eq!(rejections(&f.world.step()), vec![Rejection::NoFront]);
}

#[test]
fn rejected_group_orders_name_the_reason() {
    let s = common::world_2026();
    let mut f = polish_front(false, &[]);
    let germany = country(s, "Germany");
    let german = f
        .world
        .spawn_division(germany, cell(s, 13.4, 52.52), 10_000)
        .unwrap();
    for (who, command) in [
        (
            f.poland,
            Command::CreateArmyGroup {
                divisions: vec![german],
            },
        ),
        (
            germany,
            Command::SetFront {
                group: f.group,
                line: cells(s, &BORDER_DRAWN),
            },
        ),
        (
            f.poland,
            Command::SetFront {
                group: ArmyGroupId(999),
                line: cells(s, &BORDER_DRAWN),
            },
        ),
        (
            f.poland,
            Command::SetFront {
                group: f.group,
                line: cells(s, &[(19.0, 52.0), (20.0, 52.5)]),
            },
        ),
        (
            f.poland,
            Command::SetFront {
                group: f.group,
                line: vec![u32::MAX],
            },
        ),
    ] {
        order(&mut f.world, who, command);
    }
    // Orders apply by country id, and Germany's is lower than Poland's.
    assert_eq!(
        rejections(&f.world.step()),
        vec![
            Rejection::NotYourArmyGroup,
            Rejection::NotYourDivision,
            Rejection::UnknownArmyGroup,
            Rejection::NoFrontHere,
            Rejection::NoFrontHere,
        ]
    );
    let army = f.world.army_group(f.group).unwrap();
    assert_eq!(army.divisions, f.divisions, "unchanged by rejected orders");
    assert_eq!(army.enemy, Some(f.ukraine));
}

#[test]
fn army_groups_replay_exactly_and_survive_a_save() {
    let s = common::world_2026();
    let play = |hours_before_save: Option<u64>| {
        let mut f = polish_front(true, &[(24.45, 50.7), (24.3, 50.3)]);
        order(
            &mut f.world,
            f.poland,
            Command::DrawArrow {
                group: f.group,
                line: cells(s, &[(24.0, 50.6), LUTSK]),
            },
        );
        match hours_before_save {
            Some(hours) => {
                run(&mut f.world, hours);
                let mut resumed = save::load(&save::save(&f.world), s).unwrap();
                run(&mut resumed, 120 - hours);
                resumed
            }
            None => {
                run(&mut f.world, 120);
                f.world
            }
        }
    };
    let straight = play(None);
    assert!(
        play(Some(50)) == straight,
        "saving mid-offensive changed it"
    );
    assert!(play(None) == straight, "same seed, different offensive");
}

#[test]
fn big_army_groups_tick_quickly() {
    // Russia and Ukraine at war, 200 divisions a side in one group each,
    // fronts along their whole border and a Russian arrow.
    let s = common::world_2026();
    let (russia, ukraine) = (country(s, "Russia"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    order(&mut world, russia, Command::DeclareWar { target: ukraine });
    let mut fronts = Vec::new();
    for (own, other) in [(russia, ukraine), (ukraine, russia)] {
        let border = world.border_cells(own, other);
        let divisions: Vec<_> = (0..200)
            .map(|i| {
                world
                    .spawn_division(own, border[i * border.len() / 200], 10_000)
                    .unwrap()
            })
            .collect();
        let group = create_group(&mut world, own, divisions);
        // Border cells are sorted south to north, which is roughly along it.
        let line = vec![
            border[0],
            border[border.len() / 2],
            border[border.len() - 1],
        ];
        fronts.push((own, group, line));
    }
    let started = std::time::Instant::now();
    for (own, group, line) in fronts.iter().cloned() {
        order(&mut world, own, Command::SetFront { group, line });
    }
    order(
        &mut world,
        russia,
        Command::DrawArrow {
            group: fronts[0].1,
            line: cells(s, &[(37.0, 50.5), (35.0, 49.5)]),
        },
    );
    run(&mut world, 48);
    let elapsed = started.elapsed();
    eprintln!("400 divisions in two army groups, 48 hours: {elapsed:?}");
    assert!(elapsed.as_secs_f64() < 5.0, "48 hours took {elapsed:?}");
}

#[test]
fn an_arrow_gathers_the_group_around_it() {
    // Six divisions along a 535 km front close up on an arrow in the middle.
    let s = common::world_2026();
    let mut f = polish_front(true, &[]);
    let arrow = cells(s, &[(24.0, 50.6), LUTSK]);
    order(
        &mut f.world,
        f.poland,
        Command::DrawArrow {
            group: f.group,
            line: arrow.clone(),
        },
    );
    run(&mut f.world, 6 * 24);
    let base = arrow[0];
    for &d in &f.divisions {
        let division = f.world.division(d).unwrap();
        let km_from_arrow = km(s, division.cell, base).min(km(s, division.cell, arrow[1]));
        assert!(
            km_from_arrow < 120.0,
            "{d:?} is still {km_from_arrow:.0} km from the arrow"
        );
    }
}

#[test]
fn a_group_moves_behind_its_own_lines() {
    // Six divisions start together at the north end of a defended border
    // and spread south along it. Holding, they never set foot on land the
    // enemy holds, even where cutting a corner would be shorter.
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    let ukrainian_border = world.border_cells(ukraine, poland);
    for c in ukrainian_border.iter().step_by(3) {
        world.spawn_division(ukraine, *c, 10_000).unwrap();
    }
    let polish_border = world.border_cells(poland, ukraine);
    let north = *polish_border.last().unwrap();
    let divisions: Vec<_> = (0..6)
        .map(|_| world.spawn_division(poland, north, 10_000).unwrap())
        .collect();
    let group = create_group(&mut world, poland, divisions.clone());
    order(
        &mut world,
        poland,
        Command::SetFront {
            group,
            line: cells(s, &BORDER_DRAWN),
        },
    );
    for _ in 0..12 * 24 {
        let before: Vec<u16> = world.control().to_vec();
        let was: Vec<u32> = divisions
            .iter()
            .map(|&d| world.division(d).unwrap().cell)
            .collect();
        world.step();
        for (&d, &from) in divisions.iter().zip(&was) {
            let now = world.division(d).unwrap().cell;
            assert!(
                now == from || before[now as usize] == poland,
                "{d:?} stepped from {from} onto Ukrainian-held {now}"
            );
        }
    }
}

#[test]
fn attackers_fight_an_enemy_beside_them_instead_of_walking_past() {
    // One Polish division attacks east across the border. A Ukrainian
    // division stands just north of the first cell it takes: it turns on it
    // rather than marching on and leaving it behind.
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (ukrainian_side, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let width = s.grid.width;
    let mut world = World::new(s, 1);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    let beside = world
        .spawn_division(ukraine, ukrainian_side + width, 10_000)
        .unwrap();
    let attacker = world.spawn_division(poland, polish_side, 10_000).unwrap();
    let group = create_group(&mut world, poland, vec![attacker]);
    order(
        &mut world,
        poland,
        Command::SetFront {
            group,
            line: cells(s, &BORDER_DRAWN),
        },
    );
    order(
        &mut world,
        poland,
        Command::DrawArrow {
            group,
            line: vec![polish_side, polish_side + 8],
        },
    );
    run(&mut world, 3 * 24);
    let defender = world.division(beside).unwrap();
    assert!(
        defender.personnel < 10_000,
        "the Ukrainian division beside the attack was never attacked"
    );
}

#[test]
fn orders_given_while_paused_take_effect_at_once() {
    // A player plans while the game is paused: the group exists and its
    // divisions have their routes before the clock moves.
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    let warsaw = cell(s, 21.01, 52.23);
    let d = world.spawn_division(poland, warsaw, 10_000).unwrap();
    order(
        &mut world,
        poland,
        Command::CreateArmyGroup { divisions: vec![d] },
    );
    let events = world.apply_orders();
    let group = world.army_groups()[0].id;
    assert_eq!(
        events,
        vec![Event::ArmyGroupCreated {
            group,
            country: poland
        }]
    );
    order(
        &mut world,
        poland,
        Command::SetFront {
            group,
            line: cells(s, &BORDER_DRAWN),
        },
    );
    world.apply_orders();
    assert!(
        world.division(d).unwrap().is_moving(),
        "on its way to the front"
    );
    assert_eq!(world.tick(), 0, "the clock did not move");
    assert!(world.apply_orders().is_empty(), "nothing applies twice");
}
