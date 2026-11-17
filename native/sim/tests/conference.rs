//! The peace conference after a capitulation: the winners take turns, the
//! one who defeated the most soldiers first, each taking a region, making
//! the loser its puppet, annexing the rest (once the others are done) or
//! leaving. Puppets join their overlord's wars, pay it tribute, make no
//! wars or peace of their own, and go free when it capitulates (or when
//! they do).

mod common;

use common::{cell, country, run};
use mw_sim::conference::{TRIBUTE_PERCENT, WAIT_DAYS};
use mw_sim::save;
use mw_sim::support::AFTER_CAPITULATION;
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

fn rejections(events: &[Event]) -> Vec<Rejection> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Rejected { reason, .. } => Some(*reason),
            _ => None,
        })
        .collect()
}

struct Fallen {
    world: World,
    germany: CountryId,
    france: CountryId,
    luxembourg: CountryId,
}

/// Germany and France at war with Luxembourg; a German division takes the
/// capital and Luxembourg capitulates. Both winners are passive (they wait
/// at the conference like a player).
fn luxembourg_falls() -> Fallen {
    let s = common::world_2026();
    let (germany, france, luxembourg) = (
        country(s, "Germany"),
        country(s, "France"),
        country(s, "Luxembourg"),
    );
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
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
    world
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
    for _ in 0..10 * 24 {
        if world.step().contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            return Fallen {
                world,
                germany,
                france,
                luxembourg,
            };
        }
    }
    panic!("Luxembourg did not capitulate");
}

#[test]
fn the_winners_take_turns_and_the_loser_cannot_refuse() {
    let Fallen {
        mut world,
        germany,
        france,
        luxembourg,
    } = luxembourg_falls();
    // Neither fought a battle with Luxembourg's army (it laid down its
    // arms), so the lower id goes first.
    assert_eq!(
        world.defeated(germany, luxembourg),
        world.defeated(france, luxembourg)
    );
    assert!(germany < france);
    let conference = world.conferences()[0].clone();
    assert_eq!(conference.loser, luxembourg);
    assert_eq!(conference.winners, vec![germany, france]);
    assert_eq!(conference.picking(), germany);
    assert_eq!(conference.open.len(), 3, "Luxembourg's three districts");
    assert!(world.enemies(luxembourg).is_empty(), "its wars are over");
    let (first, second, third) = (conference.open[0], conference.open[1], conference.open[2]);

    // Not France's turn yet; and only open regions can be taken.
    order(
        &mut world,
        france,
        Command::TakeRegion {
            loser: luxembourg,
            region: first,
        },
    );
    assert_eq!(rejections(&world.step()), vec![Rejection::NotYourTurn]);
    order(
        &mut world,
        germany,
        Command::TakeRegion {
            loser: luxembourg,
            region: 0,
        },
    );
    assert_eq!(rejections(&world.step()), vec![Rejection::NotTheirRegion]);
    order(
        &mut world,
        germany,
        Command::AnnexRest { loser: luxembourg },
    );
    assert_eq!(
        rejections(&world.step()),
        vec![Rejection::OthersStillPicking],
        "France is still picking"
    );

    order(
        &mut world,
        germany,
        Command::TakeRegion {
            loser: luxembourg,
            region: first,
        },
    );
    let events = world.step();
    assert!(events.contains(&Event::RegionTaken {
        loser: luxembourg,
        by: germany,
        region: usize::from(first)
    }));
    assert_eq!(world.conferences()[0].picking(), france);
    order(
        &mut world,
        france,
        Command::TakeRegion {
            loser: luxembourg,
            region: second,
        },
    );
    world.step();
    // Germany's turn again: it leaves, and France, the last one picking,
    // annexes the rest.
    order(
        &mut world,
        germany,
        Command::LeaveConference { loser: luxembourg },
    );
    world.step();
    assert_eq!(world.conferences()[0].picking(), france);
    order(&mut world, france, Command::AnnexRest { loser: luxembourg });
    let events = world.step();
    assert!(events.contains(&Event::ConferenceClosed { loser: luxembourg }));
    assert!(world.conferences().is_empty());
    let owner = |region: u16| world.region_owner_now(usize::from(region));
    assert_eq!(
        (owner(first), owner(second), owner(third)),
        (germany, france, france)
    );
    assert!(world.regions_of(luxembourg).is_empty(), "annexed");
    let record = world.war_record(luxembourg).unwrap();
    let mut ceded = vec![(first, germany), (second, france), (third, france)];
    ceded.sort_unstable();
    assert_eq!(record.capitulation.as_ref().unwrap().ceded, ceded);
    // The land each took is held by it, whole.
    let s = common::world_2026();
    let map = &common::regions_2026().cell_region;
    for (cell, &region) in map.iter().enumerate() {
        if region != 0 && (region - 1) == second {
            assert_eq!(world.control()[cell], france, "cell {cell}");
        }
    }
    let _ = s;
}

#[test]
fn a_puppet_keeps_the_rest_joins_its_overlords_wars_and_pays_tribute() {
    let Fallen {
        mut world,
        germany,
        france,
        luxembourg,
    } = luxembourg_falls();
    let first = world.conferences()[0].open[0];
    order(
        &mut world,
        germany,
        Command::TakeRegion {
            loser: luxembourg,
            region: first,
        },
    );
    world.step();
    // France may not make Luxembourg a puppet while it is Germany's turn;
    // on its own turn it leaves, and Germany takes the rest as a puppet.
    order(
        &mut world,
        france,
        Command::LeaveConference { loser: luxembourg },
    );
    world.step();
    order(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    let events = world.step();
    assert!(events.contains(&Event::Puppeted {
        country: luxembourg,
        overlord: germany
    }));
    assert_eq!(world.overlord(luxembourg), Some(germany));
    assert_eq!(world.puppets(germany), vec![luxembourg]);
    assert_eq!(world.regions_of(luxembourg).len(), 2, "it keeps the rest");

    // A puppet declares no war of its own, and its overlord none on it.
    order(
        &mut world,
        luxembourg,
        Command::DeclareWar { target: france },
    );
    order(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    assert_eq!(
        rejections(&world.step()),
        vec![Rejection::Puppet, Rejection::Puppet]
    );
    // Germany's war is Luxembourg's.
    let s = common::world_2026();
    let belgium = country(s, "Belgium");
    order(&mut world, germany, Command::DeclareWar { target: belgium });
    world.step();
    assert!(world.at_war(luxembourg, belgium), "the puppet joins");
    // It cannot make peace itself; when Germany does, so does it.
    order(
        &mut world,
        luxembourg,
        Command::OfferPeace {
            to: belgium,
            terms: vec![],
        },
    );
    assert_eq!(rejections(&world.step()), vec![Rejection::Puppet]);
    order(
        &mut world,
        belgium,
        Command::OfferPeace {
            to: germany,
            terms: vec![],
        },
    );
    world.step();
    order(
        &mut world,
        germany,
        Command::AnswerPeace {
            from: belgium,
            accept: true,
        },
    );
    world.step();
    assert!(!world.at_war(germany, belgium) && !world.at_war(luxembourg, belgium));
    // And a war on the puppet is a war on Germany.
    let netherlands = country(s, "Netherlands");
    order(
        &mut world,
        netherlands,
        Command::DeclareWar { target: luxembourg },
    );
    world.step();
    assert!(world.at_war(germany, netherlands), "the overlord joins");

    // Tribute: a quarter of the puppet's income.
    let income = world.economy(luxembourg).unwrap().income_k();
    let tribute = income * TRIBUTE_PERCENT / 100;
    assert!(tribute > 0);
    assert_eq!(world.tribute_today_k(luxembourg), -tribute);
    assert_eq!(world.tribute_today_k(germany), tribute);

    // The puppet survives a save.
    let loaded = save::load(&save::save(&world), s, Some(common::regions_2026())).unwrap();
    assert_eq!(loaded.overlord(luxembourg), Some(germany));
}

#[test]
fn a_conference_waits_for_the_player_then_acts_for_it() {
    let Fallen {
        mut world,
        luxembourg,
        ..
    } = luxembourg_falls();
    run(&mut world, WAIT_DAYS * 24 - 2);
    assert_eq!(world.conferences().len(), 1, "still waiting");
    run(&mut world, 48);
    assert!(world.conferences().is_empty(), "acted for the winners");
    assert!(world.war_record(luxembourg).unwrap().capitulation.is_some());
}

#[test]
fn an_ai_winner_takes_what_it_holds_and_makes_the_rest_its_puppet() {
    let Fallen {
        mut world,
        germany,
        france,
        luxembourg,
    } = luxembourg_falls();
    for winner in [germany, france] {
        world.set_controller(winner, Controller::Ai).unwrap();
    }
    let held: Vec<u16> = world.conferences()[0]
        .open
        .iter()
        .copied()
        .filter(|&r| world.holding(germany, &[usize::from(r)])[0].1)
        .collect();
    assert!(
        !held.is_empty(),
        "Germany holds most of the capital's district"
    );
    world.step();
    assert!(world.conferences().is_empty());
    for region in &held {
        assert_eq!(world.region_owner_now(usize::from(*region)), germany);
    }
    assert_eq!(
        world.overlord(luxembourg),
        Some(germany),
        "the rest is its puppet"
    );
}

#[test]
fn when_the_overlord_capitulates_its_puppets_go_free() {
    let Fallen {
        mut world,
        germany,
        france,
        luxembourg,
    } = luxembourg_falls();
    order(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    world.step();
    assert_eq!(world.overlord(luxembourg), Some(germany));
    // Germany goes to war with Poland and capitulates (its war support is
    // made to run out).
    let s = common::world_2026();
    let poland = country(s, "Poland");
    order(&mut world, poland, Command::DeclareWar { target: germany });
    world.step();
    assert!(world.at_war(luxembourg, poland), "the puppet is in it too");
    world.set_war_support(germany, 0).unwrap();
    let mut freed = false;
    for _ in 0..48 {
        if world.step().contains(&Event::PuppetFreed {
            country: luxembourg,
        }) {
            freed = true;
            break;
        }
    }
    assert!(freed, "Luxembourg went free");
    assert_eq!(world.overlord(luxembourg), None);
    assert!(
        !world.at_war(luxembourg, poland),
        "and its war with Poland ended"
    );
    let _ = france;
}

#[test]
fn soldiers_put_out_of_action_are_counted_for_each_pair() {
    // The turn order at a conference: who defeated how many of whom.
    let s = common::world_2026();
    let (germany, france) = (country(s, "Germany"), country(s, "France"));
    let mut world = World::new(s, 1);
    mw_sim::sandbox::border_war(&mut world, germany, france, 24, 12, 10_000).unwrap();
    run(&mut world, 3 * 24);
    let record = |c: CountryId| world.war_record(c).unwrap().total;
    assert!(world.defeated(germany, france) > 0, "the battles went on");
    // Germany fights only France, so all it put out of action is French.
    assert_eq!(world.defeated(germany, france), record(germany).inflicted);
    assert_eq!(world.defeated(france, germany), record(france).inflicted);
}

/// `winner` (and, if given, `also`) at war with `loser`, whose war support
/// runs out: it capitulates within two days.
fn collapse(world: &mut World, loser: CountryId, winners: &[CountryId]) {
    for &winner in winners {
        if !world.at_war(winner, loser) {
            order(world, winner, Command::DeclareWar { target: loser });
        }
    }
    world.step();
    world.set_war_support(loser, 0).unwrap();
    for _ in 0..48 {
        if world
            .step()
            .contains(&Event::Capitulated { country: loser })
        {
            return;
        }
    }
    panic!("{loser} did not capitulate");
}

#[test]
fn a_new_puppet_sent_to_war_does_not_give_up_again() {
    // Luxembourg's war support runs out; Germany, also at war with Poland,
    // makes it its puppet, which sends it into that war at once.
    let s = common::world_2026();
    let (germany, poland, luxembourg) = (
        country(s, "Germany"),
        country(s, "Poland"),
        country(s, "Luxembourg"),
    );
    let mut world = World::new(s, 1);
    world.use_regions(common::regions_2026());
    world
        .spawn_division(luxembourg, cell(s, 6.0, 49.95), 10_000)
        .unwrap();
    order(&mut world, poland, Command::DeclareWar { target: germany });
    collapse(&mut world, luxembourg, &[germany]);
    assert_eq!(
        world.economy(luxembourg).unwrap().support,
        AFTER_CAPITULATION,
        "its war support starts again"
    );
    order(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    world.step();
    assert_eq!(world.overlord(luxembourg), Some(germany));
    assert!(world.at_war(luxembourg, poland), "in its overlord's war");
    for _ in 0..3 * 24 {
        assert!(
            !world.step().contains(&Event::Capitulated {
                country: luxembourg
            }),
            "it does not give up again (nor count its surrendered division as lost)"
        );
    }
}

#[test]
fn a_puppet_that_capitulates_goes_free_and_its_winners_decide() {
    let Fallen {
        mut world,
        germany,
        luxembourg,
        ..
    } = luxembourg_falls();
    order(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    world.step();
    let s = common::world_2026();
    let poland = country(s, "Poland");
    order(&mut world, poland, Command::DeclareWar { target: germany });
    world.step();
    assert!(world.at_war(luxembourg, poland), "the puppet is in it too");
    world.set_war_support(luxembourg, 0).unwrap();
    let mut events = Vec::new();
    for _ in 0..48 {
        events = world.step();
        if events.contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            break;
        }
    }
    assert!(events.contains(&Event::PuppetFreed {
        country: luxembourg
    }));
    assert_eq!(world.overlord(luxembourg), None, "free of Germany");
    assert!(world.at_war(germany, poland), "Germany fights on");
    assert!(world.puppets(germany).is_empty());
    // Poland makes it its own puppet: now it fights Germany.
    order(
        &mut world,
        poland,
        Command::MakePuppet { loser: luxembourg },
    );
    world.step();
    assert_eq!(world.overlord(luxembourg), Some(poland));
    assert!(world.at_war(luxembourg, germany));
}

#[test]
fn a_winners_divisions_on_a_region_another_winner_took_go_home() {
    let Fallen {
        mut world,
        germany,
        france,
        luxembourg,
    } = luxembourg_falls();
    let raider = world
        .divisions()
        .iter()
        .find(|d| d.country == germany)
        .unwrap()
        .id;
    // The district the German division stands in, which France takes.
    let at = world.division(raider).unwrap().cell;
    let district = common::regions_2026().index_of_cell(at as usize).unwrap() as u16;
    assert!(world.conferences()[0].open.contains(&district));
    assert_eq!(world.control()[at as usize], germany);
    assert_eq!(world.conferences()[0].picking(), germany);
    order(
        &mut world,
        germany,
        Command::LeaveConference { loser: luxembourg },
    );
    world.step();
    order(
        &mut world,
        france,
        Command::TakeRegion {
            loser: luxembourg,
            region: district,
        },
    );
    world.step();
    order(
        &mut world,
        france,
        Command::LeaveConference { loser: luxembourg },
    );
    world.step();
    assert!(world.conferences().is_empty());
    assert_eq!(world.region_owner_now(usize::from(district)), france);
    let at = world.division(raider).unwrap().cell;
    assert_eq!(
        world.control()[at as usize],
        germany,
        "the German division went home from the district France took"
    );
}

#[test]
fn a_conference_with_nothing_to_divide_ends_at_once() {
    // No region map: nothing to take, so nobody has to move.
    let s = common::world_2026();
    let (germany, luxembourg) = (country(s, "Germany"), country(s, "Luxembourg"));
    let mut world = World::new(s, 1);
    order(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    world.step();
    world.set_war_support(luxembourg, 0).unwrap();
    let mut closed = false;
    for _ in 0..48 {
        let events = world.step();
        if events.contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            closed = events.contains(&Event::ConferenceClosed { loser: luxembourg });
            break;
        }
    }
    assert!(closed, "closed in the hour it opened");
    assert!(world.conferences().is_empty());
}

#[test]
fn a_puppeted_country_is_run_by_the_ai() {
    let Fallen {
        mut world,
        germany,
        luxembourg,
        ..
    } = luxembourg_falls();
    assert_eq!(
        world.country(luxembourg).unwrap().controller,
        Controller::Passive,
        "like a player's"
    );
    order(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    world.step();
    assert_eq!(
        world.country(luxembourg).unwrap().controller,
        Controller::Ai
    );
}
