//! Factions, like HOI4's: NATO and the CSTO as they stood on the
//! scenario's date; an attack on one member is an attack on all; a member
//! that attacks calls the others to arms and each chooses; a leader's peace
//! is its faction's, a member's own peace costs its place; countries ask
//! to join, form factions and leave them, and a threatened AI looks for
//! allies.

mod common;

use common::country;
use mw_sim::factions::INVITE_DAYS;
use mw_sim::forces::{self, Personnel};
use mw_sim::save;
use mw_sim::scenario::Scenario;
use mw_sim::world::{Command, Controller, CountryId, Event, Order, Rejection, World};

fn personnel(s: &'static Scenario) -> Personnel {
    let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
    let bytes = std::fs::read(&path).expect("read the World Bank snapshot");
    forces::read_personnel(&bytes, s).expect("parse the snapshot")
}

/// The scenario with every country's real army, and real factions if
/// `factions`.
fn armed(s: &'static Scenario, factions: bool) -> World {
    let mut world = World::new(s, 1);
    world.deploy_forces(&personnel(s));
    world.set_aggression_days(0);
    if factions {
        world.use_real_factions(s);
    }
    world
}

/// Give an order and apply it at once (as a paused game does).
fn apply(world: &mut World, country: CountryId, command: Command) -> Vec<Event> {
    let tick = world.tick();
    world
        .submit(Order {
            tick,
            country,
            command,
        })
        .unwrap();
    world.apply_orders()
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

fn names(s: &Scenario, ids: &[CountryId]) -> Vec<String> {
    ids.iter()
        .map(|&id| {
            s.countries
                .iter()
                .flatten()
                .find(|c| c.id == id)
                .unwrap()
                .name
                .clone()
        })
        .collect()
}

#[test]
fn real_factions_follow_the_scenarios_date() {
    let s = common::world_2026();
    let world = armed(s, true);
    let nato = world
        .faction_of(country(s, "Poland"))
        .expect("Poland is in NATO");
    assert_eq!(nato.name, "NATO");
    assert_eq!(nato.leader, country(s, "United States of America"));
    assert_eq!(nato.members.len(), 32, "{:?}", names(s, &nato.members));
    let csto = world
        .faction_of(country(s, "Russia"))
        .expect("Russia leads the CSTO");
    assert_eq!(csto.name, "CSTO");
    assert_eq!(csto.leader, country(s, "Russia"));
    let mut expected: Vec<CountryId> = [
        "Russia",
        "Belarus",
        "Kazakhstan",
        "Kyrgyzstan",
        "Tajikistan",
    ]
    .iter()
    .map(|n| country(s, n))
    .collect();
    expected.sort_unstable();
    assert_eq!(csto.members, expected, "Armenia froze its part in 2024");
    assert!(world.faction_of(country(s, "Ukraine")).is_none());
    assert!(world.allied(country(s, "Poland"), country(s, "Germany")));
    assert!(!world.allied(country(s, "Poland"), country(s, "Russia")));

    // On 1 January 2023: no Finland or Sweden yet, Armenia still in.
    let s = common::ukraine_2023();
    let world = armed(s, true);
    let nato = world
        .faction_of(country(s, "Poland"))
        .expect("Poland is in NATO");
    for name in ["Finland", "Sweden"] {
        assert!(!nato.members.contains(&country(s, name)), "{name}");
    }
    assert!(nato.members.len() <= 30, "{:?}", names(s, &nato.members));
    let csto = world.faction_of(country(s, "Russia")).unwrap();
    assert!(csto.members.contains(&country(s, "Armenia")));
    assert!(world.faction_of(country(s, "Ukraine")).is_none());
}

#[test]
fn an_attack_on_one_member_is_an_attack_on_all() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (russia, estonia) = (country(s, "Russia"), country(s, "Estonia"));
    let events = apply(&mut world, russia, Command::DeclareWar { target: estonia });
    let nato = world.faction_of(estonia).unwrap().members.clone();
    for &member in &nato {
        assert!(world.at_war(member, russia), "{:?}", names(s, &[member]));
    }
    let defenders = events.iter().find_map(|e| match e {
        Event::Defended {
            ally,
            attacker,
            defenders,
        } if (*ally, *attacker) == (estonia, russia) => Some(defenders.clone()),
        _ => None,
    });
    assert_eq!(defenders.map(|d| d.len()), Some(31), "one event for all");
    assert!(
        !events.iter().any(|e| matches!(
            e,
            Event::WarDeclared { target, .. } if *target == country(s, "Poland")
        )),
        "not a declaration each"
    );
    // Russia's allies are asked, not dragged in.
    let belarus = country(s, "Belarus");
    assert!(!world.at_war(belarus, estonia));
    let called = events.iter().find_map(|e| match e {
        Event::CalledToArms { allies, .. } => Some(allies.clone()),
        _ => None,
    });
    assert!(called.is_some_and(|a| a.contains(&belarus) && a.len() == 4));
    assert_eq!(world.calls().len(), 4, "every other CSTO member");
}

#[test]
fn no_war_on_an_ally() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let events = apply(
        &mut world,
        country(s, "Poland"),
        Command::DeclareWar {
            target: country(s, "Germany"),
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::Ally]);
}

#[test]
fn a_member_that_attacks_calls_its_allies_and_each_chooses() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (lithuania, belarus, russia) = (
        country(s, "Lithuania"),
        country(s, "Belarus"),
        country(s, "Russia"),
    );
    let (poland, latvia) = (country(s, "Poland"), country(s, "Latvia"));
    apply(
        &mut world,
        lithuania,
        Command::DeclareWar { target: belarus },
    );
    assert!(world.at_war(lithuania, russia), "the CSTO defends Belarus");
    assert!(!world.at_war(poland, belarus), "Poland is only asked");
    let events = apply(
        &mut world,
        poland,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: true,
        },
    );
    assert!(events.contains(&Event::CallAnswered {
        ally: poland,
        attacker: lithuania,
        target: belarus,
        join: true,
    }));
    assert!(world.at_war(poland, belarus) && world.at_war(poland, russia));
    apply(
        &mut world,
        latvia,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: false,
        },
    );
    assert!(!world.at_war(latvia, belarus), "Latvia stays out");
    assert!(world.allied(latvia, lithuania), "and stays in NATO");
    // A call answered is gone.
    let again = apply(
        &mut world,
        latvia,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: true,
        },
    );
    assert_eq!(rejections(&again), vec![Rejection::NoCall]);
}

#[test]
fn the_ai_joins_an_attack_it_borders_when_its_side_is_strong() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (germany, switzerland) = (country(s, "Germany"), country(s, "Switzerland"));
    apply(
        &mut world,
        germany,
        Command::DeclareWar {
            target: switzerland,
        },
    );
    assert!(world.ai_joins(country(s, "France"), germany, switzerland));
    assert!(
        !world.ai_joins(country(s, "Portugal"), germany, switzerland),
        "no border with Switzerland"
    );
    // Against the CSTO, Lithuania's neighbors stay out.
    let (lithuania, belarus) = (country(s, "Lithuania"), country(s, "Belarus"));
    apply(
        &mut world,
        lithuania,
        Command::DeclareWar { target: belarus },
    );
    assert!(!world.ai_joins(country(s, "Poland"), lithuania, belarus));
    // The AI answers within a day.
    world
        .set_controller(country(s, "France"), Controller::Ai)
        .unwrap();
    for _ in 0..24 {
        world.step();
    }
    assert!(world.at_war(country(s, "France"), switzerland));
}

#[test]
fn a_separate_peace_costs_the_place() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (lithuania, belarus, poland) = (
        country(s, "Lithuania"),
        country(s, "Belarus"),
        country(s, "Poland"),
    );
    apply(
        &mut world,
        lithuania,
        Command::DeclareWar { target: belarus },
    );
    apply(
        &mut world,
        poland,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: true,
        },
    );
    assert!(world.separate_peace(poland, belarus));
    apply(
        &mut world,
        poland,
        Command::OfferPeace {
            to: belarus,
            terms: vec![],
        },
    );
    let events = apply(
        &mut world,
        belarus,
        Command::AnswerPeace {
            from: poland,
            accept: true,
        },
    );
    let nato = world.faction_of(lithuania).unwrap().id;
    assert!(events.contains(&Event::LeftFaction {
        country: poland,
        faction: nato,
        separate_peace: true,
    }));
    assert!(world.faction_of(poland).is_none());
    assert!(world.at_war(lithuania, belarus), "Lithuania fights on");
    let russia = country(s, "Russia");
    assert!(
        !world.at_war(poland, russia),
        "Russia fought Poland only for Belarus"
    );
    assert!(
        world.at_war(lithuania, russia),
        "and still fights Lithuania"
    );
}

#[test]
fn the_leaders_peace_ends_the_war_for_every_member() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (russia, estonia, usa) = (
        country(s, "Russia"),
        country(s, "Estonia"),
        country(s, "United States of America"),
    );
    apply(&mut world, russia, Command::DeclareWar { target: estonia });
    apply(
        &mut world,
        usa,
        Command::OfferPeace {
            to: russia,
            terms: vec![],
        },
    );
    let events = apply(
        &mut world,
        russia,
        Command::AnswerPeace {
            from: usa,
            accept: true,
        },
    );
    let nato = world.faction_of(estonia).unwrap().members.clone();
    for &member in &nato {
        assert!(!world.at_war(member, russia), "{:?}", names(s, &[member]));
    }
    assert_eq!(nato.len(), 32, "nobody left NATO");
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Event::LeftFaction { .. }))
    );
}

#[test]
fn a_country_asks_to_join_and_the_ai_leader_lets_it_in() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (ukraine, usa) = (
        country(s, "Ukraine"),
        country(s, "United States of America"),
    );
    world.set_controller(usa, Controller::Ai).unwrap();
    let nato = world.faction_of(usa).unwrap().id;
    let events = apply(&mut world, ukraine, Command::AskToJoin { faction: nato });
    assert!(events.contains(&Event::AskedToJoin {
        from: ukraine,
        to: usa
    }));
    assert!(
        world.ai_accepts(ukraine, usa, mw_sim::factions::InviteKind::Ask),
        "Ukraine borders members"
    );
    for _ in 0..24 {
        world.step();
    }
    assert_eq!(world.faction_of(ukraine).map(|f| f.id), Some(nato));
    // A member who does not lead invites nobody.
    let events = apply(
        &mut world,
        ukraine,
        Command::InviteToFaction {
            target: country(s, "Moldova"),
            name: String::new(),
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::NotLeader]);
}

#[test]
fn a_country_in_no_faction_forms_one() {
    let s = common::world_2026();
    let mut world = armed(s, false);
    let (ukraine, moldova, russia) = (
        country(s, "Ukraine"),
        country(s, "Moldova"),
        country(s, "Russia"),
    );
    for ai in [moldova, russia] {
        world.set_controller(ai, Controller::Ai).unwrap();
    }
    apply(
        &mut world,
        ukraine,
        Command::InviteToFaction {
            target: moldova,
            name: "Kyiv Pact".into(),
        },
    );
    apply(
        &mut world,
        ukraine,
        Command::InviteToFaction {
            target: russia,
            name: String::new(),
        },
    );
    let mut events = Vec::new();
    for _ in 0..24 {
        events.extend(world.step());
    }
    let faction = world.faction_of(ukraine).expect("Moldova said yes").clone();
    assert_eq!(faction.name, "Kyiv Pact");
    assert_eq!(faction.leader, ukraine);
    assert!(faction.members.contains(&moldova));
    assert!(
        events.contains(&Event::FactionRefused {
            from: ukraine,
            to: russia
        }),
        "nothing threatens Russia"
    );
    // The leader names it; nobody else can.
    apply(
        &mut world,
        ukraine,
        Command::RenameFaction {
            name: "Black Sea Pact".into(),
        },
    );
    let events = apply(
        &mut world,
        moldova,
        Command::RenameFaction {
            name: "Mine".into(),
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::NotLeader]);
    assert_eq!(world.faction_of(ukraine).unwrap().name, "Black Sea Pact");
    // Two countries: one leaving ends it.
    let events = apply(&mut world, moldova, Command::LeaveFaction);
    assert!(events.contains(&Event::FactionDissolved {
        faction: faction.id,
        last: ukraine,
    }));
    assert!(world.factions().is_empty());
}

#[test]
fn a_leader_that_leaves_hands_the_lead_to_the_strongest() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let usa = country(s, "United States of America");
    let poland = country(s, "Poland");
    apply(&mut world, usa, Command::LeaveFaction);
    let nato = world.faction_of(poland).unwrap();
    assert_eq!(nato.leader, country(s, "Turkey"), "the biggest army left");
    assert_eq!(nato.members.len(), 31);
}

#[test]
fn a_capitulating_member_leaves_its_faction() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (russia, estonia) = (country(s, "Russia"), country(s, "Estonia"));
    apply(&mut world, russia, Command::DeclareWar { target: estonia });
    world.set_war_support(estonia, 0).unwrap();
    for _ in 0..48 {
        if world
            .step()
            .contains(&Event::Capitulated { country: estonia })
        {
            break;
        }
    }
    assert!(world.faction_of(estonia).is_none());
    assert!(
        world.faction_of(country(s, "Latvia")).is_some(),
        "NATO goes on"
    );
}

#[test]
fn invitations_run_out_and_factions_survive_a_save() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (russia, estonia) = (country(s, "Russia"), country(s, "Estonia"));
    let (ukraine, moldova) = (country(s, "Ukraine"), country(s, "Moldova"));
    apply(&mut world, russia, Command::DeclareWar { target: estonia });
    apply(
        &mut world,
        ukraine,
        Command::InviteToFaction {
            target: moldova,
            name: String::new(),
        },
    );
    let loaded = save::load(&save::save(&world), s, None).unwrap();
    assert_eq!(loaded.factions(), world.factions());
    assert_eq!(loaded.invites(), world.invites());
    assert_eq!(loaded.calls(), world.calls());
    for _ in 0..INVITE_DAYS * 24 + 24 {
        world.step();
    }
    assert!(world.invites().is_empty(), "nobody answered in time");
}

#[test]
fn a_threatened_ai_looks_for_allies() {
    let s = common::world_2026();
    let mut world = armed(s, false);
    for c in world.countries().iter().map(|c| c.id).collect::<Vec<_>>() {
        world.set_controller(c, Controller::Ai).unwrap();
    }
    let (estonia, latvia, russia) = (
        country(s, "Estonia"),
        country(s, "Latvia"),
        country(s, "Russia"),
    );
    assert_eq!(world.threat(estonia, &[]), Some(russia));
    for _ in 0..15 * 24 {
        world.step();
    }
    assert!(world.allied(estonia, latvia), "{:?}", world.factions());
    assert!(!world.allied(estonia, russia));
    assert_eq!(world.war_count(), 0, "forming factions starts no war");
}

#[test]
fn a_members_puppet_is_defended_by_the_faction() {
    // Germany makes Luxembourg its puppet, then forms a faction with France.
    let s = common::world_2026();
    let mut world = armed(s, false);
    world.use_regions(common::regions_2026());
    let (germany, france, luxembourg, belgium) = (
        country(s, "Germany"),
        country(s, "France"),
        country(s, "Luxembourg"),
        country(s, "Belgium"),
    );
    apply(
        &mut world,
        germany,
        Command::DeclareWar { target: luxembourg },
    );
    world.set_war_support(luxembourg, 0).unwrap();
    for _ in 0..48 {
        if world.step().contains(&Event::Capitulated {
            country: luxembourg,
        }) {
            break;
        }
    }
    apply(
        &mut world,
        germany,
        Command::MakePuppet { loser: luxembourg },
    );
    assert_eq!(world.overlord(luxembourg), Some(germany));
    apply(
        &mut world,
        germany,
        Command::InviteToFaction {
            target: france,
            name: String::new(),
        },
    );
    apply(
        &mut world,
        france,
        Command::AnswerFaction {
            from: germany,
            accept: true,
        },
    );
    assert!(
        world.allied(france, luxembourg),
        "the puppet counts with Germany"
    );
    apply(
        &mut world,
        belgium,
        Command::DeclareWar { target: luxembourg },
    );
    assert!(world.at_war(germany, belgium), "its overlord");
    assert!(
        world.at_war(france, belgium),
        "and its overlord's faction defend it"
    );

    // Germany, with its puppet, attacks the Netherlands' ally Denmark: the
    // Netherlands defends it with one event, no declaration from the puppet.
    let (netherlands, denmark) = (country(s, "Netherlands"), country(s, "Denmark"));
    apply(
        &mut world,
        denmark,
        Command::InviteToFaction {
            target: netherlands,
            name: String::new(),
        },
    );
    apply(
        &mut world,
        netherlands,
        Command::AnswerFaction {
            from: denmark,
            accept: true,
        },
    );
    let events = apply(&mut world, germany, Command::DeclareWar { target: denmark });
    assert!(world.at_war(luxembourg, netherlands), "the puppet is in it");
    assert!(
        !events.iter().any(|e| matches!(
            e,
            Event::WarDeclared { target, .. } if *target == netherlands
        )),
        "{events:?}"
    );
}

#[test]
fn an_ai_told_no_does_not_ask_again_soon() {
    // Only Belarus thinks: threatened by Russia, it turns to Ukraine, its
    // strongest neighbor that Russia threatens too.
    let s = common::world_2026();
    let mut world = armed(s, false);
    let (ukraine, belarus) = (country(s, "Ukraine"), country(s, "Belarus"));
    world.set_controller(belarus, Controller::Ai).unwrap();
    let asked = |w: &World| {
        w.invites()
            .iter()
            .any(|i| i.from == belarus && i.to == ukraine)
    };
    for _ in 0..8 * 24 {
        world.step();
        if asked(&world) {
            break;
        }
    }
    assert!(asked(&world), "Belarus asks Ukraine");
    apply(
        &mut world,
        ukraine,
        Command::AnswerFaction {
            from: belarus,
            accept: false,
        },
    );
    assert!(world.was_refused(belarus, ukraine));
    for _ in 0..30 * 24 {
        world.step();
        assert!(!asked(&world), "it does not ask Ukraine again soon");
    }
    assert!(
        world.invites().iter().any(|i| i.from == belarus),
        "it asks someone else"
    );
}

#[test]
fn a_call_ends_when_the_caller_leaves() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (lithuania, belarus, poland) = (
        country(s, "Lithuania"),
        country(s, "Belarus"),
        country(s, "Poland"),
    );
    apply(
        &mut world,
        lithuania,
        Command::DeclareWar { target: belarus },
    );
    assert!(world.calls().iter().any(|c| c.ally == poland));
    apply(&mut world, lithuania, Command::LeaveFaction);
    assert!(world.calls().is_empty(), "its calls are gone");
    let events = apply(
        &mut world,
        poland,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: true,
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::NoCall]);
    assert!(!world.at_war(poland, belarus));
}

#[test]
fn a_call_or_invitation_that_ran_out_cannot_be_answered() {
    let s = common::world_2026();
    let mut world = armed(s, true);
    let (lithuania, belarus, poland) = (
        country(s, "Lithuania"),
        country(s, "Belarus"),
        country(s, "Poland"),
    );
    let (ukraine, moldova) = (country(s, "Ukraine"), country(s, "Moldova"));
    world.step(); // an hour past midnight: the daily clean-up is far
    apply(
        &mut world,
        lithuania,
        Command::DeclareWar { target: belarus },
    );
    apply(
        &mut world,
        moldova,
        Command::InviteToFaction {
            target: ukraine,
            name: String::new(),
        },
    );
    // An hour past the call's seven days, before the daily clean-up.
    for _ in 0..mw_sim::factions::CALL_DAYS * 24 {
        world.step();
    }
    assert!(
        world.calls().iter().any(|c| c.ally == poland),
        "still listed"
    );
    let events = apply(
        &mut world,
        poland,
        Command::AnswerCall {
            attacker: lithuania,
            target: belarus,
            join: true,
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::NoCall]);
    assert!(!world.at_war(poland, belarus));
    // And an hour past the invitation's fourteen days.
    for _ in 0..(INVITE_DAYS - mw_sim::factions::CALL_DAYS) * 24 {
        world.step();
    }
    assert_eq!(world.invites().len(), 1, "still listed");
    let events = apply(
        &mut world,
        ukraine,
        Command::AnswerFaction {
            from: moldova,
            accept: true,
        },
    );
    assert_eq!(rejections(&events), vec![Rejection::NoOffer]);
    assert!(world.faction_of(ukraine).is_none());
}
