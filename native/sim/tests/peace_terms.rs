//! Peace terms in regions. At peace, a region one side owns by law and the
//! other side alone holds more than half of becomes theirs by law, whole,
//! and pays them in full; whatever else either side holds of the other's
//! regions goes back. A third country's region both hold parts of goes
//! whole to the one holding more of it. Divisions left on the other side's
//! land go home. Land held by anyone else is not part of the peace.

mod common;

use common::{cell, country, run};
use mw_sim::save::{self, SaveError};
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

/// `from` offers peace, `to` accepts; returns the events of the hour it
/// was accepted.
fn make_peace(world: &mut World, from: CountryId, to: CountryId) -> Vec<Event> {
    order(world, from, Command::OfferPeace { to });
    world.step();
    order(world, to, Command::AnswerPeace { from, accept: true });
    world.step()
}

/// A region's index by its source id.
fn region(id: &str) -> usize {
    common::regions_2026()
        .list
        .iter()
        .position(|r| r.id == id)
        .unwrap_or_else(|| panic!("no region {id}"))
}

/// The cells of a region.
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

struct Kyiv {
    world: World,
    poland: CountryId,
    ukraine: CountryId,
}

/// Poland at war with Ukraine, settling in regions, with a Polish division
/// in Kyiv holding most of the city region and a cell of the oblast around.
fn polish_kyiv() -> Kyiv {
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
    let city = cells_of(region("UKR-4826"));
    assert!(
        held_by(&world, &city, poland) * 2 > city.len(),
        "Poland holds most of Kyiv"
    );
    assert!(
        held_by(&world, &city, ukraine) > 0,
        "Ukraine holds the rest"
    );
    assert!(held_by(&world, &cells_of(region("UKR-321")), poland) > 0);
    Kyiv {
        world,
        poland,
        ukraine,
    }
}

#[test]
fn a_region_the_other_side_holds_most_of_changes_hands_by_law() {
    let Kyiv {
        mut world,
        poland,
        ukraine,
    } = polish_kyiv();
    let events = make_peace(&mut world, ukraine, poland);
    assert!(events.contains(&Event::RegionsCeded {
        from: ukraine,
        to: poland,
        regions: 1
    }));
    let city = cells_of(region("UKR-4826"));
    assert_eq!(held_by(&world, &city, poland), city.len(), "the whole city");
    assert!(city.iter().all(|&c| world.owner_by_law(c) == poland));
    let oblast = cells_of(region("UKR-321"));
    assert_eq!(held_by(&world, &oblast, poland), 0, "the oblast goes back");
    assert!(oblast.iter().all(|&c| world.owner_by_law(c) == ukraine));
}

#[test]
fn ceded_land_pays_its_new_owner_in_full() {
    let Kyiv {
        mut world,
        poland,
        ukraine,
    } = polish_kyiv();
    let before = |world: &World, c| world.economy(c).unwrap().home_total_k;
    let (polish_land, ukrainian_land) = (before(&world, poland), before(&world, ukraine));
    make_peace(&mut world, ukraine, poland);
    let polish = world.economy(poland).unwrap();
    assert!(polish.home_total_k > polish_land, "Kyiv counts as Polish");
    assert_eq!(polish.home_k, polish.home_total_k, "and Poland holds it");
    assert_eq!(
        polish.output_k, polish.home_k,
        "it pays in full, not the occupier's half"
    );
    let ukrainian = world.economy(ukraine).unwrap();
    assert!(ukrainian.home_total_k < ukrainian_land);
    assert_eq!(
        ukrainian.home_k, ukrainian.home_total_k,
        "Ukraine has lost nothing it still owns"
    );

    // A new war: a Ukrainian division in Kyiv now takes Polish land.
    let s = common::world_2026();
    order(&mut world, ukraine, Command::DeclareWar { target: poland });
    world.step();
    let raid = cell(s, 30.60, 50.40);
    assert!(cells_of(region("UKR-4826")).contains(&raid));
    world.spawn_division(ukraine, raid, 10_000).unwrap();
    world.step();
    assert_eq!(world.control()[raid as usize], ukraine);
    let polish = world.economy(poland).unwrap();
    assert!(
        polish.home_k < polish.home_total_k,
        "Poland lost some of its own land"
    );
}

#[test]
fn a_peace_leaves_a_third_countrys_land_alone() {
    // Poland, at war with Ukraine and Belarus, holds the city of Minsk.
    let s = common::world_2026();
    let (poland, ukraine, belarus) = (
        country(s, "Poland"),
        country(s, "Ukraine"),
        country(s, "Belarus"),
    );
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    order(&mut world, poland, Command::DeclareWar { target: belarus });
    world.step();
    world
        .spawn_division(poland, cell(s, 27.56, 53.90), 10_000)
        .unwrap();
    run(&mut world, 2);
    let minsk = cells_of(region("BLR-4825"));
    assert!(held_by(&world, &minsk, poland) * 2 > minsk.len());

    make_peace(&mut world, ukraine, poland);
    assert!(minsk.iter().all(|&c| world.owner_by_law(c) == belarus));
    assert!(
        held_by(&world, &minsk, poland) * 2 > minsk.len(),
        "still held"
    );

    let events = make_peace(&mut world, belarus, poland);
    assert!(events.contains(&Event::RegionsCeded {
        from: belarus,
        to: poland,
        regions: 1
    }));
    assert!(minsk.iter().all(|&c| world.owner_by_law(c) == poland));
}

#[test]
fn pockets_go_back_and_the_troops_come_home() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
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
    let ukrainian: Vec<u32> = (0..s.grid.len() as u32)
        .filter(|&c| world.owner_by_law(c) == ukraine)
        .collect();
    assert!(held_by(&world, &ukrainian, poland) > 0, "Poland took land");
    let events = make_peace(&mut world, poland, ukraine);
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::RegionsCeded { .. })),
        "a pocket is not a region"
    );
    assert_eq!(held_by(&world, &ukrainian, poland), 0, "it all goes back");
    let at = world.division(d).unwrap().cell;
    assert_eq!(
        world.control()[at as usize],
        poland,
        "the division went home"
    );
}

#[test]
fn half_of_a_region_is_not_enough() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    world.step();
    world
        .spawn_division(poland, cell(s, 30.35, 50.45), 10_000)
        .unwrap();
    run(&mut world, 2);
    let city = cells_of(region("UKR-4826"));
    assert_eq!((held_by(&world, &city, poland), city.len()), (10, 20));
    let events = make_peace(&mut world, ukraine, poland);
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::RegionsCeded { .. }))
    );
    assert_eq!(
        held_by(&world, &city, ukraine),
        city.len(),
        "it all goes back"
    );
}

#[test]
fn a_region_needs_more_than_half_of_it_held_by_the_winner_alone() {
    // Russia, also at war with Ukraine, holds 6 of Kyiv's 20 cells, Poland
    // 8 and Ukraine 6: the two at peace hold most of it together, but
    // Poland alone does not.
    let s = common::world_2026();
    let (poland, ukraine, russia) = (
        country(s, "Poland"),
        country(s, "Ukraine"),
        country(s, "Russia"),
    );
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    order(&mut world, russia, Command::DeclareWar { target: ukraine });
    world.step();
    world
        .spawn_division(russia, cell(s, 30.30, 50.30), 10_000)
        .unwrap();
    world
        .spawn_division(poland, cell(s, 30.48, 50.55), 10_000)
        .unwrap();
    run(&mut world, 2);
    let city = cells_of(region("UKR-4826"));
    let (polish, ukrainian, russian) = (
        held_by(&world, &city, poland),
        held_by(&world, &city, ukraine),
        held_by(&world, &city, russia),
    );
    assert_eq!((polish, ukrainian, russian, city.len()), (8, 6, 6, 20));

    let events = make_peace(&mut world, ukraine, poland);
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::RegionsCeded { .. })),
        "Poland does not hold most of Kyiv"
    );
    assert!(city.iter().all(|&c| world.owner_by_law(c) == ukraine));
    assert_eq!(
        held_by(&world, &city, poland),
        0,
        "Poland gives its part back"
    );
    // Russia, still at war, keeps its part and may have taken a little
    // more while the peace was offered and answered.
    let now_russian = held_by(&world, &city, russia);
    assert!(
        (russian..russian + 3).contains(&now_russian),
        "{now_russian}"
    );
    assert_eq!(held_by(&world, &city, ukraine) + now_russian, city.len());
    assert!(world.at_war(russia, ukraine));
}

#[test]
fn a_capitulation_hands_over_the_regions_the_winner_holds() {
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    let capital = s
        .cities
        .iter()
        .find(|c| c.owner_id == luxembourg && c.is_capital)
        .unwrap();
    let capital = cell(s, capital.lng, capital.lat);
    let raider = world
        .spawn_division(germany, cell(s, 6.45, 49.75), 10_000)
        .unwrap();
    order(
        &mut world,
        germany,
        Command::MoveDivision {
            division: raider,
            to: capital,
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
        events.iter().any(|e| matches!(
            e,
            Event::RegionsCeded { from, to, .. } if *from == luxembourg && *to == germany
        )),
        "{events:?}"
    );
    assert_eq!(world.owner_by_law(capital), germany);
}

#[test]
fn peace_terms_survive_a_save() {
    let Kyiv {
        mut world,
        poland,
        ukraine,
    } = polish_kyiv();
    make_peace(&mut world, ukraine, poland);
    let s = common::world_2026();
    let bytes = save::save(&world);
    assert!(matches!(
        save::load(&bytes, s, None),
        Err(SaveError::NeedsRegions)
    ));
    assert!(matches!(
        save::load(&bytes, s, Some(common::regions_ukraine())),
        Err(SaveError::WrongRegions)
    ));
    let mut loaded = save::load(&bytes, s, Some(common::regions_2026())).unwrap();
    assert_eq!(loaded, world);
    run(&mut world, 48);
    run(&mut loaded, 48);
    assert_eq!(loaded, world);
}
