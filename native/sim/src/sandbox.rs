//! Ready-made setups for trying the simulation out, in the viewer and in
//! tests. Not game rules: in a real game divisions come from recruitment and
//! orders from players and the AI.

use crate::army::ArmyGroupId;
use crate::division::DivisionId;
use crate::front::{chain, spread};
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
    /// The attackers' group: a front along the border and an arrow across.
    pub attack: ArmyGroupId,
    /// The defenders' group, holding a front along the border.
    pub defence: ArmyGroupId,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SandboxError {
    UnknownCountry,
    /// The two countries' land does not touch.
    NoBorder,
}

/// Declare war and line both armies up along the border (spread out, one
/// division per cell), each side as one army group with a front along it.
/// The attackers get an arrow about 150 km straight across into enemy land
/// from the middle of the border. The orders apply on the next tick.
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
    let attackers: Vec<DivisionId> = attacking.into_iter().map(|(id, _)| id).collect();
    let defenders: Vec<DivisionId> = defending.into_iter().map(|(id, _)| id).collect();
    let attack = world
        .create_army_group(attacker, &attackers)
        .expect("own new divisions");
    let defence = world
        .create_army_group(defender, &defenders)
        .expect("own new divisions");
    let attack_front = chain(&map, &attack_line);
    let middle = attack_front[attack_front.len() / 2];
    let tip = across(world, &map, middle, defender);
    let tick = world.tick();
    let mut order = |country, command| {
        world
            .submit(Order {
                tick,
                country,
                command,
            })
            .expect("orders for the current tick are accepted");
    };
    order(attacker, Command::DeclareWar { target: defender });
    order(
        attacker,
        Command::SetFront {
            group: attack,
            line: attack_front,
        },
    );
    if let Some(tip) = tip {
        order(
            attacker,
            Command::DrawArrow {
                group: attack,
                line: vec![middle, tip],
            },
        );
    }
    order(
        defender,
        Command::SetFront {
            group: defence,
            line: chain(&map, &defence_line),
        },
    );
    Ok(BorderWar {
        attackers,
        defenders,
        attack,
        defence,
    })
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
