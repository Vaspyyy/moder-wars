//! Economy and manpower. A country's GDP comes from its land: whoever holds
//! the land gets its output (half of it for occupied land). Once a day the
//! budget puts a share of the income into recruiting and a share into
//! equipment. Recruiting raises new divisions at the capital while money and
//! manpower last; mobilization lets more of the population serve but costs
//! output. Equipment money equips recruits and repairs worn divisions.

mod common;

use common::{cell, country, run};
use mw_sim::division::DivisionId;
use mw_sim::save;
use mw_sim::world::{Command, CountryId, Event, Order, Rejection, World};

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

fn budget(world: &mut World, country: CountryId, recruiting: u8, equipment: u8) {
    order(
        world,
        country,
        Command::SetBudget {
            recruiting,
            equipment,
        },
    );
}

fn mobilize(world: &mut World, country: CountryId, level: u8) {
    order(world, country, Command::SetMobilization { level });
}

/// Divisions `country` recruited over `days`.
fn recruited(world: &mut World, country: CountryId, days: u64) -> Vec<DivisionId> {
    run(world, days * 24)
        .into_iter()
        .filter_map(|e| match e {
            Event::DivisionRecruited {
                division,
                country: c,
            } if c == country => Some(division),
            _ => None,
        })
        .collect()
}

fn gdp_per_day_k(name: &str) -> f64 {
    let s = common::world_2026();
    let gdp_bn = s
        .countries
        .iter()
        .flatten()
        .find(|c| c.name == name)
        .and_then(|c| c.gdp)
        .unwrap();
    gdp_bn * 1e6 / 365.0
}

#[test]
fn income_comes_from_the_land_a_country_holds() {
    let s = common::world_2026();
    let world = World::new(s, 1);
    for name in ["Poland", "Germany", "Japan"] {
        let economy = world.economy(country(s, name)).unwrap();
        let expected = gdp_per_day_k(name);
        let off = (economy.output_k as f64 - expected).abs() / expected;
        assert!(
            off < 0.02,
            "{name}: {} k$ a day, GDP says {expected:.0}",
            economy.output_k
        );
        assert_eq!(economy.income_k(), economy.output_k, "no mobilization yet");
    }
}

#[test]
fn taking_enemy_land_moves_its_income() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (_, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let mut world = World::new(s, 1);
    let output = |w: &World, c| w.economy(c).unwrap().output_k;
    let before = (output(&world, poland), output(&world, ukraine));
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    let d = world.spawn_division(poland, polish_side, 10_000).unwrap();
    order(
        &mut world,
        poland,
        Command::MoveDivision {
            division: d,
            to: polish_side + 10,
        },
    );
    run(&mut world, 5 * 24);
    let gained = output(&world, poland) - before.0;
    let lost = before.1 - output(&world, ukraine);
    assert!(gained > 0, "Poland gained nothing");
    // Occupied land pays the occupier half of what it paid its owner.
    assert!(
        (2 * gained - lost).abs() <= lost / 20,
        "Poland gained {gained} k$ a day, Ukraine lost {lost}"
    );
}

#[test]
fn without_a_recruiting_budget_nobody_recruits() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    run(&mut world, 30 * 24);
    assert!(world.divisions().is_empty());
}

#[test]
fn a_recruiting_budget_raises_divisions_at_the_capital() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let warsaw = s
        .cities
        .iter()
        .find(|c| c.owner_id == poland && c.is_capital)
        .unwrap();
    let warsaw = cell(s, warsaw.lng, warsaw.lat);
    let mut world = World::new(s, 1);
    budget(&mut world, poland, 20, 10);
    let raised = recruited(&mut world, poland, 30);
    // 20% of about 1.9 billion dollars a day, one billion a division.
    assert!(
        (8..=14).contains(&raised.len()),
        "{} divisions in 30 days",
        raised.len()
    );
    for &d in &raised {
        let division = world.division(d).unwrap();
        assert_eq!(division.country, poland);
        assert_eq!(division.cell, warsaw, "{d:?} raised away from Warsaw");
        assert_eq!(division.personnel, 10_000);
    }
}

#[test]
fn a_bigger_recruiting_budget_raises_more() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut counts = Vec::new();
    for share in [10, 40] {
        let mut world = World::new(s, 1);
        budget(&mut world, poland, share, 0);
        counts.push(recruited(&mut world, poland, 30).len());
    }
    assert!(
        counts[1] > 2 * counts[0],
        "10%: {}, 40%: {}",
        counts[0],
        counts[1]
    );
}

#[test]
fn recruits_need_manpower() {
    // Luxembourg has about 653,000 people: 0.5% of them is not one division,
    // 8% is five.
    let s = common::world_2026();
    let luxembourg = country(s, "Luxembourg");
    let mut world = World::new(s, 1);
    budget(&mut world, luxembourg, 100, 0);
    assert!(recruited(&mut world, luxembourg, 60).is_empty());
    let economy = world.economy(luxembourg).unwrap();
    assert!(
        economy.manpower() < 10_000,
        "{} men available",
        economy.manpower()
    );

    // Two months of saved-up money: still at most two divisions a day.
    mobilize(&mut world, luxembourg, 3);
    assert_eq!(recruited(&mut world, luxembourg, 1).len(), 2);
    assert_eq!(recruited(&mut world, luxembourg, 60).len(), 3);
    assert!(world.economy(luxembourg).unwrap().manpower() < 10_000);
}

#[test]
fn divisions_placed_at_the_start_use_up_manpower() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    let before = world.economy(poland).unwrap().manpower();
    world
        .spawn_division(poland, cell(s, 21.01, 52.23), 10_000)
        .unwrap();
    assert_eq!(world.economy(poland).unwrap().manpower(), before - 10_000);
}

#[test]
fn mobilization_costs_output() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    let calm = world.economy(poland).unwrap().income_k();
    mobilize(&mut world, poland, 2);
    world.step();
    let mobilized = world.economy(poland).unwrap().income_k();
    let ratio = mobilized as f64 / calm as f64;
    assert!((0.84..=0.86).contains(&ratio), "income fell to {ratio:.3}");
}

#[test]
fn mobilization_raises_more_soldiers() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut counts = Vec::new();
    for level in [0, 2] {
        let mut world = World::new(s, 1);
        budget(&mut world, poland, 100, 0);
        mobilize(&mut world, poland, level);
        counts.push(recruited(&mut world, poland, 40).len());
    }
    // 0.5% of Poland's 36.8 million people make 18 divisions.
    assert_eq!(counts[0], 18);
    assert!(
        counts[1] > 40,
        "general mobilization raised only {}",
        counts[1]
    );
}

#[test]
fn recruits_get_only_the_equipment_the_budget_pays_for() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    for (equipment, expected) in [(0, 0.0), (30, 1.0)] {
        let mut world = World::new(s, 1);
        budget(&mut world, poland, 30, equipment);
        let raised = recruited(&mut world, poland, 20);
        assert!(!raised.is_empty());
        for d in raised {
            let got = world.division(d).unwrap().equipment;
            assert_eq!(
                got, expected,
                "equipment budget {equipment}%: {d:?} has {got}"
            );
        }
    }
}

#[test]
fn equipment_money_repairs_worn_divisions() {
    // Three Polish divisions win a short battle and wear their equipment;
    // a week later only those with an equipment budget are repaired.
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (defended, staging) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let mut after = Vec::new();
    for equipment in [0, 20] {
        let mut world = World::new(s, 1);
        budget(&mut world, poland, 0, equipment);
        order(&mut world, poland, Command::DeclareWar { target: ukraine });
        world.spawn_division(ukraine, defended, 10_000).unwrap();
        let attackers: Vec<_> = (0..3)
            .map(|_| world.spawn_division(poland, staging, 10_000).unwrap())
            .collect();
        for &division in &attackers {
            order(
                &mut world,
                poland,
                Command::MoveDivision {
                    division,
                    to: defended,
                },
            );
        }
        run(&mut world, 7 * 24);
        after.push(
            attackers
                .iter()
                .map(|&d| world.division(d).unwrap().equipment)
                .collect::<Vec<f32>>(),
        );
    }
    assert!(
        after[0].iter().all(|&e| e < 1.0),
        "without money: {:?}",
        after[0]
    );
    assert!(
        after[1].iter().all(|&e| e == 1.0),
        "with money: {:?}",
        after[1]
    );
}

#[test]
fn economy_orders_are_checked() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let mut world = World::new(s, 1);
    budget(&mut world, poland, 60, 50);
    mobilize(&mut world, poland, 4);
    let reasons: Vec<Rejection> = world
        .step()
        .into_iter()
        .filter_map(|e| match e {
            Event::Rejected { reason, .. } => Some(reason),
            _ => None,
        })
        .collect();
    assert_eq!(
        reasons,
        vec![Rejection::BadBudget, Rejection::BadMobilization]
    );
    let economy = world.economy(poland).unwrap();
    assert_eq!((economy.mobilization, economy.budget.recruiting), (0, 0));
}

#[test]
fn the_economy_replays_exactly_and_survives_a_save() {
    let s = common::world_2026();
    let poland = country(s, "Poland");
    let play = |save_after: Option<u64>| {
        let mut world = World::new(s, 3);
        budget(&mut world, poland, 25, 15);
        mobilize(&mut world, poland, 1);
        match save_after {
            Some(hours) => {
                run(&mut world, hours);
                let mut resumed = save::load(&save::save(&world), s, None).unwrap();
                run(&mut resumed, 30 * 24 - hours);
                resumed
            }
            None => {
                run(&mut world, 30 * 24);
                world
            }
        }
    };
    let straight = play(None);
    assert!(
        play(Some(10 * 24 + 5)) == straight,
        "a save changed the economy"
    );
}

#[test]
fn a_year_of_peace_runs_quickly() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    let started = std::time::Instant::now();
    run(&mut world, 365 * 24);
    let elapsed = started.elapsed();
    eprintln!("a year of peace: {elapsed:?}");
    assert!(elapsed.as_secs_f64() < 2.0, "a year took {elapsed:?}");
}
