//! Peace on terms. An offer names the regions of either side that change
//! hands; on acceptance exactly those do, whole, and everything else either
//! side holds of the other's land goes back. A refused country cannot offer
//! again for a week. How willing a country is weighs what the terms take
//! (regions the other side does not hold cost three times as much) against
//! how badly the war goes for it, and a winning AI offers to keep what it
//! holds when the enemy would likely accept.

mod common;

use common::{cell, country, run};
use mw_sim::diplomacy::TALKS_CLOSED_DAYS;
use mw_sim::save;
use mw_sim::talks::UNHELD_WEIGHT;
use mw_sim::world::{Command, Controller, CountryId, Event, Order, Rejection, World};

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

fn region(id: &str) -> usize {
    common::regions_2026()
        .list
        .iter()
        .position(|r| r.id == id)
        .unwrap_or_else(|| panic!("no region {id}"))
}

fn cells_of(region: usize) -> Vec<u32> {
    let map = &common::regions_2026().cell_region;
    (0..map.len() as u32)
        .filter(|&c| usize::from(map[c as usize]) == region + 1)
        .collect()
}

fn held_by(world: &World, cells: &[u32], country: CountryId) -> usize {
    cells
        .iter()
        .filter(|&&c| world.control()[c as usize] == country)
        .count()
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

struct War {
    world: World,
    poland: CountryId,
    ukraine: CountryId,
    /// Kyiv, the city: Poland holds most of it.
    city: usize,
    /// The oblast around it: Poland holds a little of it.
    oblast: usize,
}

/// Poland at war with Ukraine, settling in regions, with a Polish division
/// in Kyiv.
fn polish_kyiv() -> War {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    world.step();
    world
        .spawn_division(poland, cell(s, 30.52, 50.45), 10_000)
        .unwrap();
    run(&mut world, 2);
    let (city, oblast) = (region("UKR-4826"), region("UKR-321"));
    let held = held_by(&world, &cells_of(oblast), poland);
    assert!(held > 0 && held * 2 < cells_of(oblast).len());
    War {
        world,
        poland,
        ukraine,
        city,
        oblast,
    }
}

/// `from` offers `terms` to `to`, which accepts; the events of that hour.
fn agree(world: &mut World, from: CountryId, to: CountryId, terms: Vec<u16>) -> Vec<Event> {
    order(world, from, Command::OfferPeace { to, terms });
    world.step();
    order(world, to, Command::AnswerPeace { from, accept: true });
    world.step()
}

#[test]
fn the_terms_hand_over_exactly_the_regions_they_name() {
    let War {
        mut world,
        poland,
        ukraine,
        city,
        oblast,
    } = polish_kyiv();
    // Poland asks for the oblast it barely holds, not the city it holds.
    let events = agree(&mut world, poland, ukraine, vec![oblast as u16]);
    assert!(events.contains(&Event::RegionsCeded {
        from: ukraine,
        to: poland,
        regions: 1
    }));
    let oblast_cells = cells_of(oblast);
    assert!(
        oblast_cells
            .iter()
            .all(|&c| world.owner_by_law(c) == poland)
    );
    assert_eq!(
        held_by(&world, &oblast_cells, poland),
        oblast_cells.len(),
        "the whole oblast is Poland's"
    );
    let city_cells = cells_of(city);
    assert!(city_cells.iter().all(|&c| world.owner_by_law(c) == ukraine));
    assert_eq!(
        held_by(&world, &city_cells, poland),
        0,
        "the city goes back"
    );
}

#[test]
fn a_white_peace_gives_everything_back() {
    let War {
        mut world,
        poland,
        ukraine,
        city,
        ..
    } = polish_kyiv();
    let events = agree(&mut world, ukraine, poland, vec![]);
    assert!(events.contains(&Event::PeaceMade {
        from: ukraine,
        to: poland
    }));
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::RegionsCeded { .. }))
    );
    let cells = cells_of(city);
    assert_eq!(held_by(&world, &cells, ukraine), cells.len());
}

#[test]
fn the_terms_name_only_the_two_sides_regions() {
    let War {
        mut world,
        poland,
        ukraine,
        city,
        ..
    } = polish_kyiv();
    let berlin = region("DEU-1599");
    order(
        &mut world,
        poland,
        Command::OfferPeace {
            to: ukraine,
            terms: vec![city as u16, berlin as u16],
        },
    );
    assert_eq!(
        rejections(&world.step()),
        vec![Rejection::NotTheirRegion],
        "Berlin is Germany's"
    );
    assert!(world.peace_offers().is_empty());
}

#[test]
fn a_refused_country_waits_a_week_to_offer_again() {
    let War {
        mut world,
        poland,
        ukraine,
        city,
        ..
    } = polish_kyiv();
    let terms = vec![city as u16];
    order(
        &mut world,
        poland,
        Command::OfferPeace {
            to: ukraine,
            terms: terms.clone(),
        },
    );
    world.step();
    order(
        &mut world,
        ukraine,
        Command::AnswerPeace {
            from: poland,
            accept: false,
        },
    );
    world.step();
    assert!(world.talks_closed(poland, ukraine));
    assert!(
        !world.talks_closed(ukraine, poland),
        "Ukraine may still offer"
    );
    // Closed talks survive a save.
    let s = common::world_2026();
    let mut world = save::load(&save::save(&world), s, Some(common::regions_2026())).unwrap();
    order(
        &mut world,
        poland,
        Command::OfferPeace {
            to: ukraine,
            terms: terms.clone(),
        },
    );
    assert_eq!(rejections(&world.step()), vec![Rejection::TalksClosed]);
    run(&mut world, TALKS_CLOSED_DAYS * 24);
    assert!(!world.talks_closed(poland, ukraine));
    order(
        &mut world,
        poland,
        Command::OfferPeace {
            to: ukraine,
            terms: terms.clone(),
        },
    );
    world.step();
    assert_eq!(world.peace_offers().len(), 1, "a week later it can");
    assert_eq!(world.peace_offers()[0].terms, terms, "on its terms");
    let reloaded = save::load(&save::save(&world), s, Some(common::regions_2026())).unwrap();
    assert_eq!(
        reloaded.peace_offers()[0].terms,
        terms,
        "which survive a save"
    );
}

#[test]
fn a_region_the_other_side_does_not_hold_costs_three_times_as_much() {
    let War {
        world,
        poland,
        ukraine,
        city,
        oblast,
    } = polish_kyiv();
    let white = world.willingness(poland, ukraine, &[]);
    let held = world.willingness(poland, ukraine, &[city as u16]);
    let unheld = world.willingness(poland, ukraine, &[oblast as u16]);
    let home = world.economy(ukraine).unwrap().home_total_k as f64;
    let share = |r: usize| world.region_value_k(r) as f64 / home;
    assert_eq!(white.price, 0.0);
    assert!((held.price - share(city)).abs() < 1e-9, "{}", held.price);
    assert!(
        (unheld.price - UNHELD_WEIGHT * share(oblast)).abs() < 1e-9,
        "{}",
        unheld.price
    );
    assert!((held.asked - share(city)).abs() < 1e-9);
    assert!(
        held.asked_held > 0.5 * held.asked,
        "Poland holds most of the city"
    );
    assert!(unheld.asked_held < 0.5 * unheld.asked);
    assert_eq!(white.margin, held.margin, "the war is the same");
    assert!(white.chance >= held.chance && held.chance >= unheld.chance);
    // Regions the asking side gives lower the price.
    let warsaw = region("POL-3148");
    let swap = world.willingness(poland, ukraine, &[city as u16, warsaw as u16]);
    assert!(swap.price < held.price);
}

#[test]
fn a_winning_ai_offers_to_keep_what_it_holds() {
    // An AI Poland with a strong army holds Kyiv; Ukraine has no army
    // left. Within a week Poland offers peace on the terms the land held
    // gives, which hand it the city.
    let War {
        mut world,
        poland,
        ukraine,
        city,
        ..
    } = polish_kyiv();
    let s = common::world_2026();
    for (lng, lat) in [(30.4, 50.4), (30.6, 50.5), (30.5, 50.6)] {
        world
            .spawn_division(poland, cell(s, lng, lat), 10_000)
            .unwrap();
    }
    world.set_controller(poland, Controller::Ai).unwrap();
    let terms: Vec<u16> = world
        .peace_terms(poland, ukraine)
        .iter()
        .map(|c| c.region as u16)
        .collect();
    assert!(terms.contains(&(city as u16)));
    assert!(world.willingness(poland, ukraine, &terms).chance >= 0.4);
    let mut offered = None;
    for _ in 0..8 * 24 {
        if world.step().contains(&Event::PeaceOffered {
            from: poland,
            to: ukraine,
        }) {
            offered = world.peace_offers().first().map(|o| o.terms.clone());
            break;
        }
    }
    let offered = offered.expect("Poland offered peace within a week");
    assert!(offered.contains(&(city as u16)), "{offered:?}");
}
