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
use mw_sim::world::{Command, Controller, CountryId, Order, World};

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

/// How many of `country`'s divisions stand next to land held by any of
/// `neighbors`.
fn facing(world: &World, s: &Scenario, country: CountryId, neighbors: &[&str]) -> usize {
    let ids: Vec<CountryId> = neighbors.iter().map(|n| common::country(s, n)).collect();
    let width = s.grid.width;
    world
        .divisions()
        .iter()
        .filter(|d| d.country == country)
        .filter(|d| {
            let c = d.cell;
            [c - 1, c + 1, c - width, c + width]
                .iter()
                .any(|&n| ids.contains(&world.control()[n as usize]))
        })
        .count()
}

#[test]
fn more_divisions_face_bigger_armies() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    // Poland's eastern neighbors field far bigger armies than its southern
    // ones (Russia 1,454,000 and Ukraine 298,000 against Czechia and
    // Slovakia's few tens of thousands).
    let poland = country(s, "Poland");
    let east = facing(&world, s, poland, &["Russia", "Belarus", "Ukraine"]);
    let south = facing(&world, s, poland, &["Czechia", "Slovakia"]);
    assert!(east >= 2 * south.max(1), "east {east}, south {south}");
    assert!(
        facing(&world, s, poland, &["Germany"]) > 0,
        "a smaller neighbor (Germany) still gets some"
    );
    // Ukraine: mostly facing Russia and Belarus, not its western neighbors.
    let ukraine = country(s, "Ukraine");
    let north_east = facing(&world, s, ukraine, &["Russia", "Belarus"]);
    let west = facing(
        &world,
        s,
        ukraine,
        &["Poland", "Slovakia", "Hungary", "Romania", "Moldova"],
    );
    assert!(
        north_east >= 2 * west.max(1),
        "north and east {north_east}, west {west}"
    );
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

#[test]
fn groups_of_countries_in_the_data_give_no_one_an_army() {
    // The World Bank lists groups of countries ("Least developed countries",
    // "Euro area", "North America") beside the countries, each with a
    // two-letter code of its own, and disputed areas on the map carry some
    // of those codes: Barahoti (XL) was given the least developed
    // countries' 2.5 million soldiers.
    let s = common::world_2026();
    let p = personnel();
    for name in [
        "Barahoti disputed area",
        "Demchok sector",
        "Nilang-Jadhang disputed area",
        "Iturup",
        "Kunashir",
        "Shikotan",
        "Paracel Islands",
        // Groups without figures in this snapshot, which a refresh may add.
        "Bir Tawil",
        "Tunb Islands",
        "Abyei",
    ] {
        assert_eq!(p.get(&country(s, name)), None, "{name}");
    }
    let mut world = World::new(s, 1);
    world.deploy_forces(p);
    let barahoti = country(s, "Barahoti disputed area");
    assert!(world.divisions().iter().all(|d| d.country != barahoti));
    // The real countries keep their figures.
    assert_eq!(p.get(&country(s, "India")), Some(&3_068_000));
}

/// How many cells of `country`'s land `start` connects to (through side
/// neighbours, as divisions march), counting up to `limit`.
fn reach(
    world: &World,
    s: &Scenario,
    start: u32,
    country: CountryId,
    limit: usize,
) -> (usize, std::collections::BTreeSet<u32>) {
    let width = s.grid.width;
    let mut seen = std::collections::BTreeSet::from([start]);
    let mut queue = std::collections::VecDeque::from([start]);
    while let Some(c) = queue.pop_front() {
        if seen.len() >= limit {
            break;
        }
        let (x, y) = (c % width, c / width);
        // Columns wrap around the date line, as on the game's map.
        let mut next = vec![
            y * width + (x + width - 1) % width,
            y * width + (x + 1) % width,
        ];
        if y > 0 {
            next.push(c - width);
        }
        if y + 1 < s.grid.height {
            next.push(c + width);
        }
        for n in next {
            if s.land[n as usize] != 0 && world.control()[n as usize] == country && seen.insert(n) {
                queue.push_back(n);
            }
        }
    }
    (seen.len(), seen)
}

#[test]
fn no_division_starts_on_a_sliver_of_land_it_cannot_leave() {
    // Where a border wiggles, the map can leave a cell or two of a country
    // touching the rest only at a corner, which divisions cannot pass. One
    // placed there could never move.
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    world.deploy_forces(personnel());
    // On a small piece of land with the capital a division is not stuck,
    // nor anywhere in a country smaller than ten cells (Singapore, Bahrain).
    let land = |country: CountryId| {
        (0..s.land.len())
            .filter(|&c| s.land[c] != 0 && s.control[c] == country)
            .count()
    };
    let capital_of = |country: CountryId| {
        s.cities
            .iter()
            .filter(|c| c.owner_id == country && c.is_capital)
            .filter_map(|c| s.grid.cell_at(c.lng, c.lat).map(|cell| cell as u32))
            .collect::<Vec<u32>>()
    };
    let stuck: Vec<String> = world
        .divisions()
        .iter()
        .filter(|d| {
            let (reached, cells) = reach(&world, s, d.cell, d.country, 10);
            reached < 10
                && !capital_of(d.country).iter().any(|c| cells.contains(c))
                && land(d.country) >= 10
        })
        .map(|d| {
            let (lng, lat) = s.grid.center(d.cell as usize);
            format!("{} at {lng:.2},{lat:.2}", d.country)
        })
        .collect();
    assert!(
        stuck.is_empty(),
        "{} divisions on slivers: {stuck:?}",
        stuck.len()
    );
    // A country that small, with no city on the map, keeps its divisions
    // on its border.
    let count = |name: &str| {
        let c = country(s, name);
        world.divisions().iter().filter(|d| d.country == c).count()
    };
    assert_eq!(count("Singapore"), 4);
    assert_eq!(count("Bahrain"), 1);
}

#[test]
fn a_scenario_without_codes_finds_countries_by_flag_or_name() {
    // The Ukraine 2023 package keeps the 2022 setup's countries, which carry
    // no two-letter codes; like the web game, the figures are found through
    // the code in a country's flag link, or else its name.
    let s = common::ukraine_2023();
    let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
    let p = forces::read_personnel(&std::fs::read(path).unwrap(), s).unwrap();
    let figure = |name: &str| p.get(&country(s, name)).copied();
    // Figures up to the scenario's start (2023): the latest is 2020.
    assert_eq!(figure("Ukraine"), Some(298_000));
    assert_eq!(figure("Russia"), Some(1_454_000));
    assert_eq!(figure("Poland"), Some(189_000));
    // Afghanistan's flag is an old WebSim link: found by its name.
    assert!(figure("Afghanistan").is_some(), "Afghanistan by name");
    // Syria too, although the World Bank calls it the Syrian Arab Republic.
    assert_eq!(figure("Syria"), Some(269_000));
    assert!(p.len() >= 80, "only {} countries matched", p.len());
    // The scenario has three entries named Romania and two named Moldova
    // (releasables with the same flag); one army each, for the entry that
    // holds land.
    for name in ["Romania", "Moldova"] {
        let entries: Vec<CountryId> = s
            .countries
            .iter()
            .flatten()
            .filter(|c| c.name == name)
            .map(|c| c.id)
            .collect();
        assert!(entries.len() > 1, "{name} appears more than once");
        let armed: Vec<CountryId> = entries
            .iter()
            .copied()
            .filter(|c| p.contains_key(c))
            .collect();
        assert_eq!(armed.len(), 1, "{name}: {armed:?} of {entries:?}");
        let land = |id: CountryId| {
            s.control
                .iter()
                .zip(&s.land)
                .filter(|&(&h, &l)| h == id && l != 0)
                .count()
        };
        let most = entries.iter().map(|&c| land(c)).max().unwrap();
        assert!(
            most > 0 && land(armed[0]) == most,
            "{name}'s figure goes to the entry holding the most land"
        );
    }
    let mut world = World::new(s, 1);
    world.deploy_forces(&p);
    assert!(
        world.divisions().len() > 500,
        "{} divisions",
        world.divisions().len()
    );
}

#[test]
fn an_entry_found_by_its_code_keeps_its_figure() {
    // An entry found only by its flag link or name never takes a figure
    // from the one found by its code, however much land it holds: here
    // Russia, stripped of its code and given Poland's flag.
    let mut s = common::world_2026().clone();
    let (russia, poland) = (country(&s, "Russia"), country(&s, "Poland"));
    let entry = s
        .countries
        .iter_mut()
        .flatten()
        .find(|c| c.id == russia)
        .unwrap();
    entry.iso2 = None;
    entry.flag_url = Some("https://flagcdn.com/w320/pl.png".into());
    let path = common::repo_root().join("assets/data/forces/world-bank.json.gz");
    let p = forces::read_personnel(&std::fs::read(path).unwrap(), &s).unwrap();
    assert_eq!(p.get(&poland), Some(&189_000));
    // Its flag points at Poland, whose figure is taken: none for it.
    assert_eq!(p.get(&russia), None);
}
