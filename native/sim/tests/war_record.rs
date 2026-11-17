//! What the wars cost each country, for the end-of-war screen: divisions
//! raised, soldiers lost, enemy soldiers its divisions put out of action,
//! and its last capitulation (when, to whom, and since when it was at
//! war), the regions it lost by law and the share of its land it kept.

mod common;

use common::{cell, country, run};
use mw_sim::record::Capitulation;
use mw_sim::save;
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

/// Everyone a country lost so far: soldiers only ever leave divisions.
fn gone(world: &World, country: CountryId) -> u64 {
    let serving: u64 = world
        .divisions()
        .iter()
        .filter(|d| d.country == country)
        .map(|d| u64::from(d.personnel))
        .sum();
    world.country(country).unwrap().economy.drafted - serving
}

#[test]
fn the_record_counts_soldiers_lost_and_put_out_of_action() {
    let s = common::world_2026();
    let (germany, france) = (country(s, "Germany"), country(s, "France"));
    let mut world = World::new(s, 1);
    mw_sim::sandbox::border_war(&mut world, germany, france, 24, 12, 10_000).unwrap();
    // Germany also raises new divisions as it goes.
    order(&mut world, germany, Command::SetMobilization { level: 2 });
    order(
        &mut world,
        germany,
        Command::SetBudget {
            recruiting: 60,
            equipment: 20,
        },
    );
    let events = run(&mut world, 14 * 24);
    for side in [germany, france] {
        let record = world.war_record(side).unwrap();
        assert!(record.lost > 0, "{side} lost nobody");
        assert_eq!(
            record.lost,
            gone(&world, side),
            "{side}: every soldier lost is counted"
        );
        assert!(record.capitulation.is_none());
        let recruited = events
            .iter()
            .filter(|e| matches!(e, Event::DivisionRecruited { country, .. } if *country == side))
            .count();
        assert_eq!(
            record.raised as usize, recruited,
            "{side}: divisions raised"
        );
    }
    assert!(
        world.war_record(germany).unwrap().raised > 0,
        "Germany recruited"
    );
    let (g, f) = (
        world.war_record(germany).unwrap(),
        world.war_record(france).unwrap(),
    );
    assert!(
        g.inflicted > 0 && f.inflicted > 0,
        "both sides hit the other"
    );
    // Only these two fight: what one put out of action, the other lost
    // (the rest of its losses wore away while cut off from supply).
    assert!(
        g.inflicted <= f.lost,
        "{} put out of action, {} lost",
        g.inflicted,
        f.lost
    );
    assert!(
        f.inflicted <= g.lost,
        "{} put out of action, {} lost",
        f.inflicted,
        g.lost
    );
    // A country at peace has a clean record.
    let spain = world.war_record(country(s, "Spain")).unwrap();
    assert_eq!((spain.raised, spain.lost, spain.inflicted), (0, 0, 0));
    // The record survives a save.
    let loaded = save::load(&save::save(&world), s, None).unwrap();
    assert_eq!(loaded.war_record(germany), world.war_record(germany));
}

#[test]
fn a_capitulation_is_remembered_with_its_enemies_and_the_war_it_ended() {
    // Luxembourg is small enough for one German division to take it all;
    // France joins the war a day later.
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let france = country(s, "France");
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    order(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    let began = world.tick();
    let defender = world
        .spawn_division(luxembourg, cell(s, 6.0, 49.95), 10_000)
        .unwrap();
    let raider = world
        .spawn_division(germany, cell(s, 6.45, 49.75), 10_000)
        .unwrap();
    run(&mut world, 24);
    order(
        &mut world,
        france,
        Command::DeclareWar { target: luxembourg },
    );
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
    assert_eq!(
        world.land_kept(luxembourg),
        1.0,
        "all of it, before the war"
    );
    let mut surrendering = 0;
    let mut when = None;
    for _ in 0..10 * 24 {
        surrendering = world
            .division(defender)
            .map_or(0, |d| u64::from(d.personnel));
        let tick = world.tick();
        if world.step().contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            when = Some(tick);
            break;
        }
    }
    let when = when.expect("Luxembourg capitulated");
    let record = world.war_record(luxembourg).unwrap();
    let mut enemies = vec![france, germany];
    enemies.sort_unstable();
    assert_eq!(
        record.capitulation,
        Some(Capitulation {
            tick: when,
            enemies,
            war_began: began,
            support_collapsed: false,
        })
    );
    // The divisions that laid down their arms at the end are not losses
    // (it may have lost a few more in battle that same hour).
    assert!(surrendering > 0, "its division was still there");
    let laid_down = gone(&world, luxembourg) - record.lost;
    assert!(
        laid_down > 0 && laid_down <= surrendering,
        "{laid_down} laid down their arms, {surrendering} were left"
    );
    // Germany took the capital's region; it is German by law now.
    let lost = world.lost_regions(luxembourg);
    assert!(!lost.is_empty(), "regions handed over");
    for cession in &lost {
        assert_eq!(cession.from, luxembourg);
        assert!(cession.to == germany || cession.to == france, "{cession:?}");
        assert_eq!(
            world.owner_by_law(capital_cell(&world, s, luxembourg)),
            germany
        );
    }
    let kept = world.land_kept(luxembourg);
    assert!((0.0..1.0).contains(&kept), "kept {kept}");
    assert!(world.lost_regions(germany).is_empty());
}

fn capital_cell(_world: &World, s: &mw_sim::scenario::Scenario, owner: CountryId) -> u32 {
    let capital = s
        .cities
        .iter()
        .find(|c| c.owner_id == owner && c.is_capital)
        .unwrap();
    cell(s, capital.lng, capital.lat)
}

#[test]
fn a_collapse_at_home_is_remembered_as_one() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    order(&mut world, poland, Command::DeclareWar { target: ukraine });
    // Nothing for the home front: support wears away (see war_support.rs).
    order(
        &mut world,
        ukraine,
        Command::SetBudget {
            recruiting: 0,
            equipment: 100,
        },
    );
    let mut collapsed = false;
    for _ in 0..400 {
        if run(&mut world, 24).contains(&Event::SupportCollapsed { country: ukraine }) {
            collapsed = true;
            break;
        }
    }
    assert!(collapsed, "Ukraine's support never ran out");
    let capitulation = world
        .war_record(ukraine)
        .unwrap()
        .capitulation
        .clone()
        .expect("it capitulated");
    assert!(capitulation.support_collapsed);
    assert_eq!(capitulation.enemies, vec![poland]);
    assert_eq!(
        world.land_kept(ukraine),
        1.0,
        "nothing taken without regions"
    );
}
