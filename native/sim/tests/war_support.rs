//! War support: how much the people back the war, from 0 to 1000 (per
//! mille). It starts full. At war it wears down a little every day, and
//! faster with every soldier lost (counted against everyone who could
//! serve) and with own land in enemy hands; spending on the home front
//! (the budget share not spent on recruiting or equipment) holds it up. At
//! peace it recovers. A country at war whose support reaches zero
//! capitulates.

mod common;

use common::{cell, country, run};
use mw_sim::support::FULL_SUPPORT;
use mw_sim::world::{Command, CountryId, Event, Order, World};

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

fn support(world: &World, country: CountryId) -> u16 {
    world.economy(country).unwrap().support
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

/// Poland at war with Ukraine, with nobody fighting.
fn quiet_war() -> (World, CountryId, CountryId) {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    world.step();
    (world, poland, ukraine)
}

#[test]
fn support_starts_full_and_a_quiet_war_wears_it_down() {
    let s = common::world_2026();
    let fresh = World::new(s, 1);
    assert!(
        fresh
            .countries()
            .iter()
            .all(|c| c.economy.support == FULL_SUPPORT)
    );
    let (mut world, _, ukraine) = quiet_war();
    run(&mut world, 10 * 24);
    let now = support(&world, ukraine);
    assert!(now < FULL_SUPPORT, "a war wears support down");
    assert!(now > FULL_SUPPORT - 50, "but slowly: {now}");
    let germany = country(common::world_2026(), "Germany");
    assert_eq!(support(&world, germany), FULL_SUPPORT, "not at war");
}

#[test]
fn home_front_spending_holds_support_up() {
    let (mut all_home, _, ukraine) = quiet_war();
    let mut all_war = all_home.clone();
    let before = support(&all_home, ukraine);
    budget(&mut all_home, ukraine, 0, 0);
    budget(&mut all_war, ukraine, 0, 100);
    run(&mut all_home, 20 * 24);
    run(&mut all_war, 20 * 24);
    assert_eq!(
        support(&all_home, ukraine),
        before,
        "a home front that gets everything keeps support steady"
    );
    assert!(support(&all_war, ukraine) < support(&all_home, ukraine) - 50);
}

#[test]
fn losing_soldiers_drains_support_by_how_many_could_serve() {
    // Luxembourg divisions stranded deep in Germany lose soldiers every
    // hour; the same divisions at home lose none. Luxembourg's own land is
    // untouched either way.
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let mut stranded = World::new(s, 1);
    order(
        &mut stranded,
        luxembourg,
        Command::DeclareWar { target: germany },
    );
    stranded.step();
    let mut home = stranded.clone();
    for i in 0..5 {
        stranded
            .spawn_division(luxembourg, cell(s, 10.0 + f64::from(i), 51.0), 10_000)
            .unwrap();
        home.spawn_division(luxembourg, cell(s, 6.1, 49.6), 10_000)
            .unwrap();
    }
    run(&mut stranded, 3 * 24);
    run(&mut home, 3 * 24);
    let lost: u32 = 50_000
        - stranded
            .divisions()
            .iter()
            .filter(|d| d.country == luxembourg)
            .map(|d| d.personnel)
            .sum::<u32>();
    assert!(lost > 0 && lost < 3_000, "lost {lost}");
    // The last tick run was a day's end, so support counted every loss,
    // each one once: losing half of everyone who could serve (8% of the
    // people at total mobilization) would take all of it.
    let could_serve = stranded.economy(luxembourg).unwrap().population * 8 / 100;
    let expected = u64::from(lost) * 2 * u64::from(FULL_SUPPORT) / could_serve;
    let gap = support(&home, luxembourg) - support(&stranded, luxembourg);
    assert!(expected > 30, "a small country feels {lost} losses");
    assert_eq!(u64::from(gap), expected);
}

#[test]
fn own_land_in_enemy_hands_drains_support() {
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let mut occupied = World::new(s, 1);
    order(
        &mut occupied,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    occupied.step();
    let mut free = occupied.clone();
    // Far from the capital, in the north.
    occupied
        .spawn_division(germany, cell(s, 6.0, 50.05), 10_000)
        .unwrap();
    run(&mut occupied, 5 * 24);
    run(&mut free, 5 * 24);
    assert!(support(&occupied, luxembourg) < support(&free, luxembourg));
    assert!(occupied.at_war(germany, luxembourg), "no capitulation yet");
}

#[test]
fn peace_lets_support_recover() {
    let (mut world, poland, ukraine) = quiet_war();
    budget(&mut world, ukraine, 0, 100);
    run(&mut world, 30 * 24);
    let at_peace = support(&world, ukraine);
    assert!(at_peace < FULL_SUPPORT - 100);
    order(
        &mut world,
        ukraine,
        Command::OfferPeace {
            to: poland,
            terms: vec![],
        },
    );
    world.step();
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    run(&mut world, 5 * 24);
    assert!(support(&world, ukraine) > at_peace + 30, "it recovers");
    run(&mut world, 60 * 24);
    assert_eq!(
        support(&world, ukraine),
        FULL_SUPPORT,
        "up to full, no more"
    );
}

#[test]
fn a_country_whose_support_collapses_capitulates() {
    let (mut world, poland, ukraine) = quiet_war();
    budget(&mut world, ukraine, 0, 100);
    let mut collapsed = None;
    for day in 0..400 {
        let events = run(&mut world, 24);
        if events.contains(&Event::SupportCollapsed { country: ukraine }) {
            assert!(events.contains(&Event::Capitulated { country: ukraine }));
            collapsed = Some(day);
            break;
        }
    }
    let day = collapsed.expect("support never collapsed");
    assert!(
        day > 100,
        "a quiet war takes a long time to break a country: {day}"
    );
    assert!(!world.at_war(poland, ukraine));
    assert_eq!(support(&world, ukraine), 0);
}

#[test]
fn when_both_sides_break_the_same_day_only_one_capitulates() {
    // Countries are checked in id order: the first one's capitulation ends
    // the war, so the other is at peace when its turn comes.
    let (mut world, poland, ukraine) = quiet_war();
    budget(&mut world, poland, 0, 100);
    budget(&mut world, ukraine, 0, 100);
    world.step();
    assert_eq!(support(&world, poland), support(&world, ukraine));
    let mut capitulated = Vec::new();
    for _ in 0..400 {
        for event in run(&mut world, 24) {
            if let Event::Capitulated { country } = event {
                capitulated.push(country);
            }
        }
        if !capitulated.is_empty() {
            break;
        }
    }
    assert_eq!(capitulated, vec![poland.min(ukraine)]);
    assert!(!world.at_war(poland, ukraine));
}
