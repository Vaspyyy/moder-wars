//! The AI plays a country with the same commands a player has. At war it
//! mobilizes, recruits, gathers its divisions into an army group with a
//! front along each enemy border, attacks when it is clearly stronger and
//! holds when it is not, and makes peace when it is losing. Scenario tests:
//! a small setup and an outcome, never exact numbers.

mod common;

use common::{cell, country, run};
use mw_sim::save;
use mw_sim::scenario::Scenario;
use mw_sim::world::{Command, Controller, CountryId, Event, Order, World};

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

/// `count` divisions of `own` spread along its border with `other`.
fn line_up(world: &mut World, own: CountryId, other: CountryId, count: usize) {
    let border = world.border_cells(own, other);
    for i in 0..count {
        world
            .spawn_division(
                own,
                border[(2 * i + 1) * border.len() / (2 * count)],
                10_000,
            )
            .unwrap();
    }
}

fn km(s: &Scenario, a: u32, b: u32) -> f64 {
    let ((lng1, lat1), (lng2, lat2)) = (s.grid.center(a as usize), s.grid.center(b as usize));
    let (lat1, lat2) = (lat1.to_radians(), lat2.to_radians());
    let h = ((lat2 - lat1) / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * ((lng2 - lng1).to_radians() / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

struct Setup {
    world: World,
    poland: CountryId,
    ukraine: CountryId,
}

/// Poland on the AI at war with a passive Ukraine, each with divisions
/// lined up along the border.
fn polish_ai(polish: usize, ukrainian: usize) -> Setup {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    world.set_controller(poland, Controller::Ai).unwrap();
    line_up(&mut world, poland, ukraine, polish);
    line_up(&mut world, ukraine, poland, ukrainian);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    Setup {
        world,
        poland,
        ukraine,
    }
}

#[test]
fn countries_start_passive_and_get_no_ai_orders() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    assert!(
        world
            .countries()
            .iter()
            .all(|c| c.controller == Controller::Passive)
    );
    world.set_controller(ukraine, Controller::Player).unwrap();
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    run(&mut world, 10 * 24);
    for c in [poland, ukraine] {
        let economy = world.economy(c).unwrap();
        assert_eq!((economy.budget.recruiting, economy.mobilization), (0, 0));
    }
    assert!(world.army_groups().is_empty());
}

#[test]
fn an_ai_at_war_mobilizes_recruits_and_forms_a_front() {
    // No Polish divisions to begin with, twenty Ukrainian ones holding.
    let s = common::world_2026();
    let Setup {
        mut world,
        poland,
        ukraine,
    } = polish_ai(0, 20);
    run(&mut world, 30 * 24);
    let economy = world.economy(poland).unwrap();
    assert!(economy.budget.recruiting > 0, "no recruiting budget");
    assert!(economy.mobilization > 0, "not mobilized");
    let polish: Vec<_> = world
        .divisions()
        .iter()
        .filter(|d| d.country == poland)
        .collect();
    assert!(polish.len() >= 5, "only {} divisions raised", polish.len());
    let group = world
        .army_groups()
        .iter()
        .find(|g| g.country == poland && g.enemy == Some(ukraine))
        .expect("a group facing Ukraine");
    assert!(!group.front.is_empty());
    assert!(
        group.divisions.len() * 10 >= polish.len() * 9,
        "recruits joined it"
    );
    let border = world.border_cells(poland, ukraine);
    let at_the_front = polish
        .iter()
        .filter(|d| border.iter().any(|&b| km(s, d.cell, b) < 60.0))
        .count();
    assert!(
        at_the_front * 2 >= polish.len(),
        "{at_the_front} of {} at the front",
        polish.len()
    );
}

#[test]
fn a_stronger_ai_attacks_and_takes_ground() {
    let s = common::world_2026();
    let Setup {
        mut world,
        poland,
        ukraine,
    } = polish_ai(30, 3);
    run(&mut world, 20 * 24);
    let taken = s
        .control
        .iter()
        .zip(world.control())
        .filter(|&(&before, &now)| before == ukraine && now == poland)
        .count();
    assert!(taken > 500, "Poland took only {taken} cells");
}

#[test]
fn an_ai_calls_off_an_attack_when_the_odds_turn() {
    let Setup {
        mut world,
        poland,
        ukraine,
    } = polish_ai(30, 3);
    run(&mut world, 3 * 24);
    let attacking = |w: &World| {
        w.army_groups()
            .iter()
            .any(|g| g.country == poland && !g.arrow.is_empty())
    };
    assert!(attacking(&world), "a stronger Poland should be attacking");
    // Sixty fresh Ukrainian divisions arrive along the new line.
    let border = world.border_cells(ukraine, poland);
    for i in 0..60 {
        world
            .spawn_division(ukraine, border[i * border.len() / 60], 10_000)
            .unwrap();
    }
    run(&mut world, 2 * 24);
    assert!(!attacking(&world), "Poland kept attacking against the odds");
}

#[test]
fn a_weaker_ai_holds() {
    let s = common::world_2026();
    let Setup {
        mut world,
        poland,
        ukraine,
    } = polish_ai(5, 20);
    for _ in 0..10 {
        run(&mut world, 24);
        for g in world.army_groups().iter().filter(|g| g.country == poland) {
            assert!(g.arrow.is_empty(), "a weaker Poland attacked");
        }
    }
    let taken = s
        .control
        .iter()
        .zip(world.control())
        .filter(|&(&before, &now)| before == ukraine && now == poland)
        .count();
    assert!(taken < 100, "Poland took {taken} cells");
}

/// How the AI answers a peace offer from a passive enemy, with `ai_divisions`
/// against `enemy_divisions` on the Polish-Ukrainian border.
fn answer(ai_name: &str, ai_divisions: usize, enemy_divisions: usize) -> bool {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (ai, enemy) = if ai_name == "Poland" {
        (poland, ukraine)
    } else {
        (ukraine, poland)
    };
    let mut world = World::new(s, 1);
    world.set_controller(ai, Controller::Ai).unwrap();
    line_up(&mut world, ai, enemy, ai_divisions);
    line_up(&mut world, enemy, ai, enemy_divisions);
    order(&mut world, enemy, Command::DeclareWar { target: ai });
    world.step();
    order(&mut world, enemy, Command::OfferPeace { to: ai });
    run(&mut world, 2 * 24)
        .iter()
        .find_map(|e| match e {
            Event::PeaceMade { .. } => Some(true),
            Event::PeaceRefused { .. } => Some(false),
            _ => None,
        })
        .expect("the AI answered")
}

#[test]
fn a_losing_ai_accepts_peace_and_a_winning_one_refuses() {
    assert!(
        answer("Ukraine", 1, 30),
        "outnumbered thirty to one, it refused"
    );
    assert!(!answer("Poland", 30, 1), "thirty to one up, it accepted");
}

#[test]
fn a_losing_ai_asks_for_peace() {
    // Germany takes nearly all of Switzerland but not Bern; the Swiss AI
    // asks for peace.
    let s = common::world_2026();
    let (germany, switzerland) = (country(s, "Germany"), country(s, "Switzerland"));
    let mut world = World::new(s, 1);
    world.set_controller(switzerland, Controller::Ai).unwrap();
    order(
        &mut world,
        germany,
        Command::DeclareWar {
            target: switzerland,
        },
    );
    let bern = s
        .cities
        .iter()
        .find(|c| c.owner_id == switzerland && c.is_capital)
        .unwrap();
    world
        .spawn_division(switzerland, cell(s, bern.lng, bern.lat), 10_000)
        .unwrap();
    let mut lat = 45.85;
    while lat < 47.85 {
        let mut lng = 5.95;
        while lng < 10.55 {
            let c = cell(s, lng, lat);
            let far = (lng - bern.lng).abs() > 0.3 || (lat - bern.lat).abs() > 0.2;
            if far && s.control[c as usize] == switzerland && s.land[c as usize] != 0 {
                world.spawn_division(germany, c, 10_000).unwrap();
            }
            lng += 0.3;
        }
        lat += 0.2;
    }
    let events = run(&mut world, 3 * 24);
    assert!(
        events.contains(&Event::PeaceOffered {
            from: switzerland,
            to: germany
        }),
        "the Swiss never asked for peace"
    );
}

#[test]
fn ai_wars_replay_exactly_and_survive_a_save() {
    let s = common::world_2026();
    let play = |save_after: Option<u64>| {
        let Setup { mut world, .. } = polish_ai(15, 8);
        let ukraine = country(s, "Ukraine");
        world.set_controller(ukraine, Controller::Ai).unwrap();
        match save_after {
            Some(hours) => {
                run(&mut world, hours);
                let mut resumed = save::load(&save::save(&world), s, None).unwrap();
                run(&mut resumed, 20 * 24 - hours);
                resumed
            }
            None => {
                run(&mut world, 20 * 24);
                world
            }
        }
    };
    let straight = play(None);
    assert!(play(None) == straight, "same seed, different war");
    assert!(
        play(Some(7 * 24 + 13)) == straight,
        "a save changed the war"
    );
}

#[test]
fn an_ai_soak_stays_inside_its_time_budget() {
    // Four wars between AI countries, two months, everyone recruiting.
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    let pairs = [
        ("Russia", "Ukraine"),
        ("Germany", "France"),
        ("India", "Pakistan"),
        ("Brazil", "Argentina"),
    ];
    for (a, b) in pairs {
        let (a, b) = (country(s, a), country(s, b));
        for c in [a, b] {
            world.set_controller(c, Controller::Ai).unwrap();
        }
        line_up(&mut world, a, b, 20);
        line_up(&mut world, b, a, 20);
        order(&mut world, a, Command::DeclareWar { target: b });
    }
    let started = std::time::Instant::now();
    run(&mut world, 60 * 24);
    let elapsed = started.elapsed();
    let divisions = world.divisions().len();
    eprintln!("AI soak: 60 days, 8 countries, {divisions} divisions at the end: {elapsed:?}");
    assert!(
        divisions > 160,
        "the AIs raised nothing: {divisions} divisions"
    );
    // A regression guard at about twice what it takes now (some 65 ms per
    // game day for 650 divisions).
    assert!(elapsed.as_secs_f64() < 8.0, "60 days took {elapsed:?}");
}

#[test]
fn a_war_weary_ai_makes_peace() {
    // Monaco produces nothing, so it raises no divisions: its war with a
    // passive France stays quiet and only its war support moves.
    let s = common::world_2026();
    let (monaco, france) = (country(s, "Monaco"), country(s, "France"));
    let support = |world: &World| world.economy(monaco).unwrap().support;
    let mut world = World::new(s, 1);
    world.set_controller(monaco, Controller::Ai).unwrap();
    order(&mut world, france, Command::DeclareWar { target: monaco });
    run(&mut world, 2 * 24);
    order(&mut world, france, Command::OfferPeace { to: monaco });
    assert!(
        run(&mut world, 2 * 24).contains(&Event::PeaceRefused {
            from: france,
            to: monaco
        }),
        "full support: Monaco fights on"
    );
    while support(&world) >= 400 {
        let events = run(&mut world, 24);
        assert!(world.divisions().is_empty(), "the war stays quiet");
        assert!(
            !events.contains(&Event::PeaceOffered {
                from: monaco,
                to: france
            }),
            "asked for peace at {}",
            support(&world)
        );
        assert!(world.tick() < 600 * 24, "support never fell");
    }
    let mut asking = world.clone();
    order(&mut world, france, Command::OfferPeace { to: monaco });
    assert!(
        run(&mut world, 2 * 24).contains(&Event::PeaceMade {
            from: france,
            to: monaco
        }),
        "below 40% Monaco takes peace"
    );
    // Each day starts with the support update; Monaco thinks later that
    // day, so it sees the support as it is after the day.
    loop {
        let asked = run(&mut asking, 24).contains(&Event::PeaceOffered {
            from: monaco,
            to: france,
        });
        let seen = support(&asking);
        if asked {
            assert!(seen < 300, "asked at {seen}");
            break;
        }
        assert!(seen >= 300, "below 30% and still not asking");
    }
}
