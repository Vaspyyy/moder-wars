//! Ready-made setups for trying the simulation out, in the viewer and in
//! tests. Not game rules: in a real game divisions come from recruitment and
//! orders from players and the AI.

use crate::division::DivisionId;
use crate::map::{Cell, MapData};
use crate::world::{Command, CountryId, Order, World};

/// How far the attackers are sent into enemy land.
const ADVANCE_M: f64 = 150_000.0;
/// Enemy land within this many cells sets the direction "across".
const LOOK_AROUND: i64 = 6;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BorderWar {
    pub attackers: Vec<DivisionId>,
    pub defenders: Vec<DivisionId>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SandboxError {
    UnknownCountry,
    /// The two countries' land does not touch.
    NoBorder,
}

/// Declare war, line both armies up along the border (spread out, one
/// division per cell), and send each attacking division about 150 km
/// straight across into enemy land. The orders apply on the next tick.
pub fn border_war(
    world: &mut World,
    attacker: CountryId,
    defender: CountryId,
    attackers: usize,
    defenders: usize,
    personnel: u32,
) -> Result<BorderWar, SandboxError> {
    if world.country(attacker).is_none() || world.country(defender).is_none() {
        return Err(SandboxError::UnknownCountry);
    }
    let attack_line = world.border_cells(attacker, defender);
    let defence_line = world.border_cells(defender, attacker);
    if attack_line.is_empty() || defence_line.is_empty() {
        return Err(SandboxError::NoBorder);
    }
    let map = world.map.clone();
    let mut spawn = |country, line: &[Cell], count| -> Vec<(DivisionId, Cell)> {
        spread(&map, line, count)
            .into_iter()
            .map(|cell| {
                let id = world
                    .spawn_division(country, cell, personnel)
                    .expect("border cells are land");
                (id, cell)
            })
            .collect()
    };
    let attacking = spawn(attacker, &attack_line, attackers);
    let defending = spawn(defender, &defence_line, defenders);
    let targets: Vec<_> = attacking
        .iter()
        .filter_map(|&(division, cell)| Some((division, across(world, &map, cell, defender)?)))
        .collect();
    let tick = world.tick();
    let mut order = |command| {
        world
            .submit(Order {
                tick,
                country: attacker,
                command,
            })
            .expect("orders for the current tick are accepted");
    };
    order(Command::DeclareWar { target: defender });
    for (division, to) in targets {
        order(Command::MoveDivision { division, to });
    }
    Ok(BorderWar {
        attackers: attacking.into_iter().map(|(id, _)| id).collect(),
        defenders: defending.into_iter().map(|(id, _)| id).collect(),
    })
}

/// Up to `count` cells of `line`, spread as evenly as possible: each next
/// pick is the cell farthest from all cells picked so far.
fn spread(map: &MapData, line: &[Cell], count: usize) -> Vec<Cell> {
    let Some(&first) = line.first() else {
        return Vec::new();
    };
    // Start at one end: the cell farthest from an arbitrary one.
    let farthest = |from: &dyn Fn(Cell) -> u64| {
        line.iter()
            .copied()
            .max_by_key(|&cell| (from(cell), std::cmp::Reverse(cell)))
    };
    let start = farthest(&|cell| map.estimate_m(first, cell)).unwrap_or(first);
    let mut picked = vec![start];
    let mut nearest: Vec<u64> = line.iter().map(|&c| map.estimate_m(start, c)).collect();
    while picked.len() < count.min(line.len()) {
        let (at, _) = nearest
            .iter()
            .enumerate()
            .max_by_key(|&(i, &d)| (d, std::cmp::Reverse(line[i])))
            .expect("line is not empty");
        let next = line[at];
        picked.push(next);
        for (d, &cell) in nearest.iter_mut().zip(line) {
            *d = (*d).min(map.estimate_m(next, cell));
        }
    }
    picked
}

/// A cell about `ADVANCE_M` from `from`, straight away from the attacker's
/// side: the direction towards the enemy land around `from`. Falls short
/// where that point is not enemy land (the sea, say).
fn across(world: &World, map: &MapData, from: Cell, enemy: CountryId) -> Option<Cell> {
    let (x, y) = map.xy(from);
    let (ew, ns) = map.cell_size_m(y);
    let (ew, ns) = (f64::from(ew), f64::from(ns));
    let (mut east, mut north) = (0.0, 0.0);
    for dy in -LOOK_AROUND..=LOOK_AROUND {
        for dx in -LOOK_AROUND..=LOOK_AROUND {
            let Some(cell) = map.cell(x + dx, y + dy) else {
                continue;
            };
            if map.is_land(cell) && world.control()[cell as usize] == enemy {
                east += dx as f64 * ew;
                north += dy as f64 * ns;
            }
        }
    }
    let length = (east * east + north * north).sqrt();
    if length == 0.0 {
        return None;
    }
    let steps = 10;
    (1..=steps).rev().find_map(|step| {
        let reach = ADVANCE_M * f64::from(step) / f64::from(steps) / length;
        let to = map.cell(
            x + (east * reach / ew).round() as i64,
            y + (north * reach / ns).round() as i64,
        )?;
        (map.is_land(to) && world.control()[to as usize] == enemy).then_some(to)
    })
}
