//! Divisions: the units that march, fight and hold ground. A division stands
//! on one grid cell and has soldiers, equipment (0 to 1) and morale (0 to 1).
//! Its fighting power is its soldiers scaled by equipment and morale.
//!
//! The numbers that tune the rules live here, so a playtest change is a
//! one-line edit. The tests describe the behaviour they must keep.

use serde::{Deserialize, Serialize};

use crate::map::Cell;
use crate::world::CountryId;

/// Marching speed on own or unclaimed land, in metres per hour (36 km a day).
pub const MARCH_M_PER_HOUR: u32 = 1_500;
/// A step into enemy-held land costs this many times its distance.
pub const ENEMY_LAND_COST: u32 = 2;
/// A division takes undefended enemy land within this distance.
pub const CONTROL_RADIUS_M: f64 = 20_000.0;

/// Defenders fight from prepared positions.
pub const DEFENDER_BONUS: f64 = 1.2;
/// Extra defence for a cell with a city in it.
pub const CITY_BONUS: f64 = 1.5;
/// Morale lost per hour of battle at even odds; scales with the odds.
pub const MORALE_LOSS_PER_HOUR: f64 = 0.014;
/// Soldiers lost per hour, as a share of the enemy's fighting power.
pub const CASUALTIES_PER_HOUR: f64 = 0.0015;
/// Below this morale a division stops attacking...
pub const ATTACK_MORALE: f32 = 0.3;
/// ...and waits until it has recovered to this.
pub const RESUME_MORALE: f32 = 0.7;
/// A defender below this morale falls back, or surrenders if it cannot.
pub const BREAK_MORALE: f32 = 0.15;
/// A division below this share of its establishment breaks up.
pub const MIN_STRENGTH: f64 = 0.1;

/// Hourly recovery out of battle, while supplied (or at peace).
pub const MORALE_RECOVERY: f32 = 0.02;
pub const EQUIPMENT_RECOVERY: f32 = 0.002;
/// Equipment worn out per hour of battle.
pub const COMBAT_WEAR: f32 = 0.001;
/// Hourly losses while cut off from supply in a war.
pub const CUT_OFF_MORALE: f32 = 0.0015;
pub const CUT_OFF_EQUIPMENT: f32 = 0.002;
pub const CUT_OFF_ATTRITION: f64 = 0.0005;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct DivisionId(pub u32);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Division {
    pub id: DivisionId,
    pub country: CountryId,
    pub cell: Cell,
    pub personnel: u32,
    /// Full strength; the division breaks up below `MIN_STRENGTH` of it.
    pub establishment: u32,
    pub equipment: f32,
    pub morale: f32,
    /// Linked to its country's supply source (always true at peace).
    pub supplied: bool,
    /// Cells still to walk, the next one last.
    pub(crate) path: Vec<Cell>,
    /// Metres walked towards the next cell.
    pub(crate) progress_m: u32,
    /// Stopped attacking until morale recovers.
    pub(crate) resting: bool,
    /// Fought this tick.
    pub(crate) in_battle: bool,
}

impl Division {
    pub(crate) fn new(id: DivisionId, country: CountryId, cell: Cell, personnel: u32) -> Division {
        Division {
            id,
            country,
            cell,
            personnel,
            establishment: personnel,
            equipment: 1.0,
            morale: 1.0,
            supplied: true,
            path: Vec::new(),
            progress_m: 0,
            resting: false,
            in_battle: false,
        }
    }

    pub fn is_moving(&self) -> bool {
        !self.path.is_empty()
    }

    /// Where the division is going, if anywhere.
    pub fn target(&self) -> Option<Cell> {
        self.path.first().copied()
    }

    /// The cells still to walk, in order.
    pub fn route(&self) -> impl Iterator<Item = Cell> + '_ {
        self.path.iter().rev().copied()
    }

    pub fn in_battle(&self) -> bool {
        self.in_battle
    }

    pub(crate) fn next_cell(&self) -> Option<Cell> {
        self.path.last().copied()
    }

    pub(crate) fn power(&self) -> f64 {
        let equipment = 0.25 + 0.75 * f64::from(self.equipment);
        let morale = 0.25 + 0.75 * f64::from(self.morale);
        f64::from(self.personnel) * equipment * morale
    }

    pub(crate) fn broken_up(&self) -> bool {
        f64::from(self.personnel) < f64::from(self.establishment) * MIN_STRENGTH
    }
}

/// Why a division was lost.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Loss {
    /// Broke with nowhere to fall back to.
    Surrendered,
    /// Too few soldiers left to fight.
    BrokenUp,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpawnError {
    UnknownCountry,
    NotLand,
    NoSoldiers,
}
