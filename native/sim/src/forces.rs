//! Starting armies from real data.
//!
//! Each country's active military personnel comes from the World Bank's
//! snapshot of IISS figures (`assets/data/forces/world-bank.json.gz`, CC BY
//! 4.0): the latest observation up to the scenario's start year. It counts
//! all services and paramilitary forces, so `LAND_SHARE_PERCENT` of it
//! becomes divisions of `DIVISION_SIZE`. They stand spread along the
//! country's land borders, closer together where the neighbor's army is
//! bigger (by the square root of its personnel, so a giant does not pull
//! everyone to one border), or over its cities when it has no land border.
//! A country without an observation starts with no divisions.

use std::collections::BTreeMap;
use std::fmt;
use std::io::Read;

use serde::Deserialize;
use serde::de::IgnoredAny;

use crate::economy::DIVISION_SIZE;
use crate::front::spread_by;
use crate::map::Cell;
use crate::scenario::Scenario;
use crate::world::{CountryId, World};

/// Active personnel by country, where it is known.
pub type Personnel = BTreeMap<CountryId, u32>;

/// One country's force figure and the year it was counted.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Observation {
    pub personnel: u32,
    pub year: i32,
}

/// The share of active personnel that serves in land divisions.
pub const LAND_SHARE_PERCENT: u64 = 60;
/// A neighbor with fewer (or unknown) personnel counts as this many when
/// weighing its border.
pub const MIN_THREAT_PERSONNEL: u64 = 10_000;

#[derive(Debug)]
pub enum ForcesError {
    Unzip(String),
    Json(String),
}

impl fmt::Display for ForcesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ForcesError::Unzip(e) => write!(f, "cannot unzip the force data: {e}"),
            ForcesError::Json(e) => write!(f, "cannot read the force data: {e}"),
        }
    }
}

impl std::error::Error for ForcesError {}

#[derive(Deserialize)]
struct Snapshot {
    responses: Responses,
}

/// World Bank API pages: `[paging info, [records]]`.
#[derive(Deserialize)]
struct Responses {
    countries: (IgnoredAny, Vec<WorldBankCountry>),
    personnel: (IgnoredAny, Vec<WorldBankObservation>),
}

#[derive(Deserialize)]
struct WorldBankCountry {
    id: String,
    #[serde(rename = "iso2Code")]
    iso2: String,
}

#[derive(Deserialize)]
struct WorldBankObservation {
    #[serde(rename = "countryiso3code")]
    iso3: String,
    date: String,
    value: Option<f64>,
}

/// Each scenario country's latest personnel figure up to the scenario's
/// start year (see `read_observations`).
pub fn read_personnel(gzipped: &[u8], scenario: &Scenario) -> Result<Personnel, ForcesError> {
    Ok(read_observations(gzipped, scenario)?
        .into_iter()
        .map(|(country, o)| (country, o.personnel))
        .collect())
}

/// Each scenario country's latest personnel observation up to the
/// scenario's start year, matched by two-letter country code.
pub fn read_observations(
    gzipped: &[u8],
    scenario: &Scenario,
) -> Result<BTreeMap<CountryId, Observation>, ForcesError> {
    let mut json = String::new();
    flate2::read::GzDecoder::new(gzipped)
        .read_to_string(&mut json)
        .map_err(|e| ForcesError::Unzip(e.to_string()))?;
    let snapshot: Snapshot =
        serde_json::from_str(&json).map_err(|e| ForcesError::Json(e.to_string()))?;
    let start_year: i32 = scenario
        .info
        .start_date
        .as_deref()
        .and_then(|d| d.get(..4)?.parse().ok())
        .unwrap_or(2026);
    let iso3_of: BTreeMap<&str, &str> = snapshot
        .responses
        .countries
        .1
        .iter()
        .map(|c| (c.iso2.as_str(), c.id.as_str()))
        .collect();
    // iso3 -> (year, personnel) of the latest usable observation.
    let mut latest: BTreeMap<&str, (i32, u32)> = BTreeMap::new();
    for o in &snapshot.responses.personnel.1 {
        let (Some(value), Ok(year)) = (o.value, o.date.parse::<i32>()) else {
            continue;
        };
        if year > start_year || value < 0.0 {
            continue;
        }
        let entry = latest
            .entry(o.iso3.as_str())
            .or_insert((year, value as u32));
        if year > entry.0 {
            *entry = (year, value as u32);
        }
    }
    Ok(scenario
        .countries
        .iter()
        .flatten()
        .filter_map(|c| {
            let iso3 = iso3_of.get(c.iso2.as_deref()?)?;
            let &(year, personnel) = latest.get(iso3)?;
            Some((c.id, Observation { personnel, year }))
        })
        .collect())
}

impl World {
    /// Give every country with known personnel its starting divisions.
    pub fn deploy_forces(&mut self, personnel: &Personnel) {
        // A border cell weighs as much as the biggest army next to it.
        let threat = |neighbor: CountryId| {
            let people = personnel.get(&neighbor).map_or(0, |&p| u64::from(p));
            people.max(MIN_THREAT_PERSONNEL).isqrt()
        };
        let borders = self.all_borders(threat);
        for (&country, &people) in personnel {
            if self.country(country).is_none() {
                continue;
            }
            let land = u64::from(people) * LAND_SHARE_PERCENT / 100;
            let count = ((land + u64::from(DIVISION_SIZE) / 2) / u64::from(DIVISION_SIZE)) as usize;
            if count == 0 {
                continue;
            }
            let places = match borders.get(&country) {
                Some(cells) if !cells.is_empty() => {
                    let line: Vec<Cell> = cells.keys().copied().collect();
                    spread_by(&self.map, &line, count, |c| cells[&c])
                }
                _ => self.home_cities(country),
            };
            for i in 0..count {
                let Some(&cell) = places.get(i % places.len().max(1)) else {
                    break;
                };
                self.spawn_division(country, cell, DIVISION_SIZE)
                    .expect("deployment cells are held land");
            }
        }
    }

    /// Every country's land cells touching another country's land, each
    /// with the largest `threat` among the neighbors it touches, from one
    /// pass over the map.
    fn all_borders(
        &self,
        threat: impl Fn(CountryId) -> u64,
    ) -> BTreeMap<CountryId, BTreeMap<Cell, u64>> {
        let mut borders: BTreeMap<CountryId, BTreeMap<Cell, u64>> = BTreeMap::new();
        for cell in 0..self.map.len() as Cell {
            let holder = self.control[cell as usize];
            if holder == 0 || !self.map.is_land(cell) {
                continue;
            }
            let weight = self
                .map
                .sides(cell)
                .filter(|&n| self.map.is_land(n))
                .map(|n| self.control[n as usize])
                .filter(|&other| other != 0 && other != holder)
                .map(&threat)
                .max();
            if let Some(weight) = weight {
                borders.entry(holder).or_default().insert(cell, weight);
            }
        }
        borders
    }

    /// The cities a country holds, or its supply source if it holds none.
    fn home_cities(&self, country: CountryId) -> Vec<Cell> {
        let mut cells: Vec<Cell> = self
            .map
            .cities()
            .iter()
            .filter(|c| c.owner == country && self.control[c.cell as usize] == country)
            .map(|c| c.cell)
            .collect();
        cells.dedup();
        if cells.is_empty() {
            cells.extend(self.supply_source(country));
        }
        cells
    }
}
