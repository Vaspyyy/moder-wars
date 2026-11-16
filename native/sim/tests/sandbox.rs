//! Borders and the sandbox war the viewer starts with. `border_cells` finds
//! where two countries' land meets; `sandbox::border_war` lines both armies
//! up along that border and sends the attackers across.

mod common;

use common::{country, run};
use mw_sim::division::DivisionId;
use mw_sim::sandbox::{self, SandboxError};
use mw_sim::world::{Event, World};

fn km_between(world: &World, a: DivisionId, b: DivisionId) -> f64 {
    let (a, b) = (world.division(a).unwrap(), world.division(b).unwrap());
    let ((lng1, lat1), (lng2, lat2)) = (world.location(a), world.location(b));
    let (lat1, lat2) = (lat1.to_radians(), lat2.to_radians());
    let h = ((lat2 - lat1) / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * ((lng2 - lng1).to_radians() / 2.0).sin().powi(2);
    2.0 * 6371.0 * h.sqrt().asin()
}

#[test]
fn border_cells_are_own_land_touching_the_other_country() {
    let s = common::world_2026();
    let (poland, ukraine) = (country(s, "Poland"), country(s, "Ukraine"));
    let (_, polish_side) = common::border_west(s, 24.6, 50.85, ukraine, poland);
    let world = World::new(s, 1);
    let cells = world.border_cells(poland, ukraine);
    // The border runs mostly north to south across about 26 rows of cells.
    assert!(
        (25..=120).contains(&cells.len()),
        "{} border cells",
        cells.len()
    );
    assert!(cells.contains(&polish_side));
    assert!(cells.is_sorted());
    let width = s.grid.width;
    for &cell in &cells {
        assert_eq!(s.control[cell as usize], poland, "cell {cell}");
        assert_ne!(s.land[cell as usize], 0, "cell {cell} is water");
        let touches = [cell - 1, cell + 1, cell - width, cell + width]
            .iter()
            .any(|&n| s.control[n as usize] == ukraine && s.land[n as usize] != 0);
        assert!(touches, "cell {cell} does not touch Ukraine");
    }
    assert!(world.border_cells(poland, country(s, "Japan")).is_empty());
}

#[test]
fn a_sandbox_war_lines_both_armies_up_along_the_border() {
    let s = common::world_2026();
    let (germany, france) = (country(s, "Germany"), country(s, "France"));
    let mut world = World::new(s, 1);
    let war = sandbox::border_war(&mut world, germany, france, 16, 8, 10_000).unwrap();
    assert_eq!((war.attackers.len(), war.defenders.len()), (16, 8));
    let events = world.step();
    assert!(events.contains(&Event::WarDeclared {
        attacker: germany,
        target: france
    }));
    assert!(
        !events.iter().any(|e| matches!(e, Event::Rejected { .. })),
        "{events:?}"
    );
    let german_border = world.border_cells(germany, france);
    for (side, owner) in [(&war.attackers, germany), (&war.defenders, france)] {
        for &id in side {
            let division = world.division(id).unwrap();
            assert_eq!(division.country, owner);
            assert_eq!(world.control()[division.cell as usize], owner);
        }
        // Spread out along a border about 450 km long (bunched up along
        // it, neighbours would stand about 7 km apart).
        for (i, &a) in side.iter().enumerate() {
            for &b in &side[i + 1..] {
                let km = km_between(&world, a, b);
                assert!(km > 11.0, "{a:?} and {b:?} only {km:.0} km apart");
            }
        }
    }
    let start_cells: Vec<_> = war
        .attackers
        .iter()
        .map(|&id| world.division(id).unwrap().cell)
        .collect();
    // The attackers started on the border and are on their way.
    let started_on_border = war
        .attackers
        .iter()
        .filter(|&&id| world.division(id).unwrap().is_moving())
        .count();
    assert!(
        started_on_border >= 12,
        "only {started_on_border} attacking"
    );
    assert!(
        start_cells
            .iter()
            .filter(|c| german_border.contains(c))
            .count()
            >= 12,
        "attackers start on the border"
    );
}

#[test]
fn in_a_sandbox_war_the_attackers_take_ground() {
    let s = common::world_2026();
    let (germany, france) = (country(s, "Germany"), country(s, "France"));
    let mut world = World::new(s, 1);
    sandbox::border_war(&mut world, germany, france, 24, 8, 10_000).unwrap();
    run(&mut world, 5 * 24);
    let taken = s
        .control
        .iter()
        .zip(world.control())
        .filter(|&(&before, &now)| before == france && now == germany)
        .count();
    assert!(taken > 50, "Germany took only {taken} French cells");
}

#[test]
fn a_sandbox_war_needs_a_shared_border() {
    let s = common::world_2026();
    let mut world = World::new(s, 1);
    let (poland, japan) = (country(s, "Poland"), country(s, "Japan"));
    assert_eq!(
        sandbox::border_war(&mut world, poland, japan, 4, 4, 10_000).err(),
        Some(SandboxError::NoBorder)
    );
    assert_eq!(
        sandbox::border_war(&mut world, poland, 9999, 4, 4, 10_000).err(),
        Some(SandboxError::UnknownCountry)
    );
    assert!(world.divisions().is_empty());
}
