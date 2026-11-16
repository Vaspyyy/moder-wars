//! War and peace. A country at war can offer peace; the other side accepts
//! or refuses, and an unanswered offer runs out after two weeks. Each pair
//! of countries makes peace on its own; without a region map both keep the
//! land they hold (`peace_terms.rs` covers peace in regions).
//! A country that has lost its capital and holds less than half of its own
//! land (by what it produces) capitulates: all its wars end and its
//! divisions lay down their arms.

mod common;

use common::{cell, country, run};
use mw_sim::division::Loss;
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
}

/// Poland at war with Ukraine.
fn war() -> War {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    world.step();
    War {
        world,
        poland,
        ukraine,
    }
}

#[test]
fn an_accepted_peace_ends_the_war() {
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    let events = world.step();
    assert!(events.contains(&Event::PeaceOffered {
        from: ukraine,
        to: poland
    }));
    assert_eq!(world.peace_offers().len(), 1);
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    let events = world.step();
    assert!(events.contains(&Event::PeaceMade {
        from: ukraine,
        to: poland
    }));
    assert!(!world.at_war(poland, ukraine));
    assert!(world.peace_offers().is_empty());
}

#[test]
fn a_refused_peace_keeps_the_war() {
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    world.step();
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: false,
        },
    );
    let events = world.step();
    assert!(events.contains(&Event::PeaceRefused {
        from: ukraine,
        to: poland
    }));
    assert!(world.at_war(poland, ukraine));
    assert!(world.peace_offers().is_empty());
}

#[test]
fn peace_orders_are_checked() {
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    let germany = country(common::world_2026(), "Germany");
    order(&mut world, poland, Command::OfferPeace { to: germany });
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    assert_eq!(
        rejections(&world.step()),
        vec![
            Rejection::NotAtWar,
            Rejection::NoOffer,
            Rejection::AlreadyOffered
        ]
    );
}

#[test]
fn an_unanswered_offer_runs_out() {
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    run(&mut world, 15 * 24);
    assert!(world.peace_offers().is_empty());
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    assert_eq!(rejections(&world.step()), vec![Rejection::NoOffer]);
    assert!(world.at_war(poland, ukraine));
}

#[test]
fn peace_keeps_the_land_each_side_holds() {
    let s = common::world_2026();
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    let (_, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
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
    let taken = polish_side as usize + 10;
    assert_eq!(world.control()[taken], poland, "Poland took the cell");
    order(&mut world, poland, Command::OfferPeace { to: ukraine });
    world.step();
    order(
        &mut world,
        ukraine,
        Command::AnswerPeace {
            from: poland,
            accept: true,
        },
    );
    run(&mut world, 3 * 24);
    assert!(!world.at_war(poland, ukraine));
    assert_eq!(world.control()[taken], poland, "the land stays Polish");
    assert!(
        world.division(d).unwrap().supplied,
        "at peace everyone is supplied"
    );
}

#[test]
fn each_pair_makes_peace_on_its_own() {
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    let germany = country(common::world_2026(), "Germany");
    order(&mut world, poland, Command::DeclareWar { target: germany });
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    world.step();
    order(
        &mut world,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    world.step();
    assert!(!world.at_war(poland, ukraine));
    assert!(world.at_war(poland, germany));
}

#[test]
fn a_country_that_loses_its_capital_and_most_of_its_land_capitulates() {
    // Luxembourg is small enough for one German division to take it all.
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let france = country(s, "France");
    let mut world = World::new(s, 1);
    order(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    order(
        &mut world,
        france,
        Command::DeclareWar { target: luxembourg },
    );
    let defender = world
        .spawn_division(luxembourg, cell(s, 6.0, 49.95), 10_000)
        .unwrap();
    let raider = world
        .spawn_division(germany, cell(s, 6.45, 49.75), 10_000)
        .unwrap();
    let capital = s
        .cities
        .iter()
        .find(|c| c.owner_id == luxembourg && c.is_capital)
        .unwrap();
    order(
        &mut world,
        germany,
        Command::MoveDivision {
            division: raider,
            to: cell(s, capital.lng, capital.lat),
        },
    );
    let mut events = Vec::new();
    for _ in 0..10 * 24 {
        events = world.step();
        if events.contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            break;
        }
    }
    assert!(
        events.contains(&Event::Capitulated {
            country: luxembourg
        }),
        "Luxembourg never capitulated"
    );
    // Checked the hour it happened: everything ends at once.
    assert!(events.contains(&Event::DivisionDestroyed {
        division: defender,
        country: luxembourg,
        cause: Loss::Surrendered
    }));
    assert!(!world.at_war(germany, luxembourg));
    assert!(!world.at_war(france, luxembourg), "all its wars end");
    assert!(world.division(raider).is_some());
}

#[test]
fn losing_the_capital_alone_is_not_enough() {
    let s = common::world_2026();
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    let russia = country(s, "Russia");
    order(&mut world, russia, Command::DeclareWar { target: poland });
    let warsaw = s
        .cities
        .iter()
        .find(|c| c.owner_id == poland && c.is_capital)
        .unwrap();
    world
        .spawn_division(russia, cell(s, warsaw.lng, warsaw.lat), 10_000)
        .unwrap();
    let events = run(&mut world, 5 * 24);
    assert_eq!(
        world.control()[cell(s, warsaw.lng, warsaw.lat) as usize],
        russia,
        "Warsaw fell"
    );
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::Capitulated { .. }))
    );
    assert!(world.at_war(poland, ukraine));
}

#[test]
fn peace_offers_survive_a_save() {
    let s = common::world_2026();
    let War {
        mut world,
        poland,
        ukraine,
    } = war();
    order(&mut world, ukraine, Command::OfferPeace { to: poland });
    world.step();
    let mut loaded = save::load(&save::save(&world), s, None).unwrap();
    assert!(loaded == world);
    order(
        &mut loaded,
        poland,
        Command::AnswerPeace {
            from: ukraine,
            accept: true,
        },
    );
    loaded.step();
    assert!(!loaded.at_war(poland, ukraine));
}

#[test]
fn holding_the_capital_keeps_a_country_fighting() {
    // German divisions take nearly all of Switzerland; a Swiss division
    // holds Bern. Switzerland has lost most of its land (Zurich and Geneva
    // produce far more than Bern) but not its capital, so it fights on.
    let s = common::world_2026();
    let (germany, switzerland) = (country(s, "Germany"), country(s, "Switzerland"));
    let mut world = World::new(s, 1);
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
    let economy = world.economy(switzerland).unwrap();
    assert!(
        economy.home_k * 2 < economy.home_total_k,
        "Switzerland still holds {} of {}",
        economy.home_k,
        economy.home_total_k
    );
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::Capitulated { .. }))
    );
    assert!(world.at_war(germany, switzerland));
}
