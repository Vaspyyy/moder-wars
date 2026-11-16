//! Starting armies from real data. Each country's active military personnel
//! (World Bank / IISS, the latest observation up to the scenario's start)
//! sets how many divisions it starts with: the land forces' share of it, in
//! divisions of 10,000. They stand spread along the country's land borders
//! (or over its cities when it has none) and count against its manpower.
//! A country without an observation starts with none: unknown is not zero,
//! but it is not a number either.

mod common;

use common::country;
use mw_sim::forces::{self, Personnel};
use mw_sim::scenario::Scenario;
use mw_sim::world::{Command, Controller, Order, World};

fn personnel() -> &'static Personnel {
    static CELL: std::sync::OnceLock<Personnel> = std::sync::OnceLock::new();
    CELL.get_or_init(|| {
        let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
        let bytes = std::fs::read(&path).expect("read the World Bank snapshot");
        forces::read_personnel(&bytes, common::world_2026()).expect("parse the snapshot")
    })
}

fn km(s: &Scenario, a: u32, b: u32) -> f64 {
    let ((lng1, lat1), (lng2, lat2)) = (s.grid.center(a as usize), s.grid.center(b as usize));
    let (lat1, lat2) = (lat1.to_radians(), lat2.to_radians());
    let h = ((lat2 - lat1) / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * ((lng2 - lng1).to_radians() / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

#[test]
fn each_figure_keeps_the_year_it_was_counted() {
    let s = common::world_2026();
    let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
    let bytes = std::fs::read(&path).unwrap();
    let observations = forces::read_observations(&bytes, s).unwrap();
    let poland = observations[&country(s, "Poland")];
    assert_eq!((poland.personnel, poland.year), (189_000, 2020));
    let personnel: Personnel = observations
        .iter()
        .map(|(&c, o)| (c, o.personnel))
        .collect();
    assert_eq!(&personnel, self::personnel());
}

#[test]
fn personnel_comes_from_the_latest_observation() {
    let s = common::world_2026();
    let p = personnel();
    assert_eq!(p.get(&country(s, "Poland")), Some(&189_000));
    assert_eq!(p.get(&country(s, "Russia")), Some(&1_454_000));
    assert_eq!(p.get(&country(s, "Ukraine")), Some(&298_000));
    assert_eq!(p.get(&country(s, "Japan")), Some(&261_000));
    assert_eq!(
        p.get(&country(s, "Monaco")),
        None,
        "no observation, no number"
    );
    assert!(p.len() >= 150, "only {} countries matched", p.len());
}

#[test]
fn each_country_starts_with_its_land_forces_in_divisions() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    let count = |name: &str| {
        let c = country(s, name);
        world.divisions().iter().filter(|d| d.country == c).count()
    };
    // 60% of the personnel, in divisions of 10,000.
    assert_eq!(count("Poland"), 11);
    assert_eq!(count("Russia"), 87);
    assert_eq!(count("Ukraine"), 18);
    assert_eq!(count("Monaco"), 0);
    for d in world.divisions() {
        assert_eq!(d.personnel, 10_000);
        assert_eq!(
            world.control()[d.cell as usize],
            d.country,
            "{:?} abroad",
            d.id
        );
    }
}

#[test]
fn starting_divisions_stand_spread_along_the_borders() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    let poland = country(s, "Poland");
    let polish: Vec<u32> = world
        .divisions()
        .iter()
        .filter(|d| d.country == poland)
        .map(|d| d.cell)
        .collect();
    let width = s.grid.width;
    for &c in &polish {
        let foreign = [c - 1, c + 1, c - width, c + width].iter().any(|&n| {
            let holder = s.control[n as usize];
            s.land[n as usize] != 0 && holder != poland && holder != 0
        });
        assert!(foreign, "a Polish division at {c} is not on a border");
    }
    for (i, &a) in polish.iter().enumerate() {
        for &b in &polish[i + 1..] {
            assert!(
                km(s, a, b) > 40.0,
                "Polish divisions bunched at {a} and {b}"
            );
        }
    }
    // Japan has no land border: its divisions stand in its cities.
    let japan = country(s, "Japan");
    let cities: Vec<u32> = s
        .cities
        .iter()
        .filter(|c| c.owner_id == japan)
        .filter_map(|c| s.grid.cell_at(c.lng, c.lat).map(|cell| cell as u32))
        .collect();
    let japanese: Vec<_> = world
        .divisions()
        .iter()
        .filter(|d| d.country == japan)
        .collect();
    assert_eq!(japanese.len(), 16);
    assert!(japanese.iter().all(|d| cities.contains(&d.cell)));
}

#[test]
fn starting_armies_use_up_manpower() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    let poland = country(s, "Poland");
    let before = world.economy(poland).unwrap().manpower();
    world.deploy_forces(personnel());
    assert_eq!(
        world.economy(poland).unwrap().manpower(),
        before.saturating_sub(110_000)
    );
}

#[test]
fn deploying_the_whole_world_is_quick_and_repeatable() {
    let s = common::world_2026();
    let started = std::time::Instant::now();
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    let elapsed = started.elapsed();
    eprintln!(
        "{} divisions deployed in {elapsed:?}",
        world.divisions().len()
    );
    assert!(world.divisions().len() > 1_000);
    assert!(elapsed.as_secs_f64() < 2.0, "deploying took {elapsed:?}");
    let mut again = World::new(s, 1);
    again.deploy_forces(personnel());
    assert!(again == world, "deploying twice gave different armies");
}

#[test]
fn observations_after_the_scenario_start_are_not_used() {
    // The same map starting in 2019: Ukraine's 2019 figure, not 2020's.
    let mut earlier = common::world_2026().clone();
    earlier.info.start_date = Some("2019-06-01".into());
    let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
    let p = forces::read_personnel(&std::fs::read(path).unwrap(), &earlier).unwrap();
    assert_eq!(p.get(&country(&earlier, "Ukraine")), Some(&311_000));
}

#[test]
fn a_war_between_real_armies_runs_smoothly() {
    // Russia's army stands along all of its borders, most of it in Asia; at
    // war the AI sends all of it to the Ukrainian front.
    let s = common::world_2026();
    let (russia, ukraine) = (country(s, "Russia"), country(s, "Ukraine"));
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    for side in [russia, ukraine] {
        world.set_controller(side, Controller::Ai).unwrap();
    }
    world
        .submit(Order {
            tick: 0,
            country: russia,
            command: Command::DeclareWar { target: ukraine },
        })
        .unwrap();
    let started = std::time::Instant::now();
    let mut slowest = std::time::Duration::ZERO;
    for _ in 0..10 * 24 {
        let hour = std::time::Instant::now();
        world.step();
        slowest = slowest.max(hour.elapsed());
    }
    let elapsed = started.elapsed();
    eprintln!("real armies, 10 days: {elapsed:?}, slowest hour {slowest:?}");
    let asian = world
        .divisions()
        .iter()
        .filter(|d| d.country == russia && s.grid.center(d.cell as usize).0 > 60.0)
        .collect::<Vec<_>>();
    assert!(
        asian.iter().filter(|d| d.target().is_some()).count() * 2 > asian.len(),
        "the army in Asia is not on its way"
    );
    // Regression guards at several times what it takes now (about 0.3 s,
    // the worst hour about 75 ms). A route search per far division used to
    // take over a second per plan.
    assert!(elapsed.as_secs_f64() < 4.0, "10 days took {elapsed:?}");
    assert!(slowest.as_secs_f64() < 0.6, "an hour took {slowest:?}");
}
