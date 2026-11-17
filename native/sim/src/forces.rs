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
//! A border cell on a sliver of land (joined to fewer than
//! `MIN_REACH_CELLS` cells of the country, and not to its capital) gets no
//! division, since divisions could never leave it, unless the country has
//! nothing else: no other border cell and no city. A country without an
//! observation starts with no divisions, and the World Bank's groups of
//! countries ("Least developed countries") are no country's figures.

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
/// A border cell joined to fewer cells of its country's land than this
/// (a sliver touching the rest only at a corner, which divisions cannot
/// pass) gets no starting division, unless it holds the capital too.
const MIN_REACH_CELLS: usize = 10;

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
    region: WorldBankRegion,
}

/// A group of countries ("Least developed countries", "Euro area") is
/// listed like a country, in the region "Aggregates".
#[derive(Deserialize)]
struct WorldBankRegion {
    value: String,
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
    // Groups of countries have two-letter codes of their own, which some
    // map entries (disputed areas) share; they are no country's figures.
    let iso3_of: BTreeMap<&str, &str> = snapshot
        .responses
        .countries
        .1
        .iter()
        .filter(|c| c.region.value.trim() != "Aggregates")
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
            let source = self.supply_source(country);
            let usable: BTreeMap<Cell, u64> = borders
                .get(&country)
                .into_iter()
                .flatten()
                .filter(|&(&cell, _)| self.leads_inland(cell, country, source))
                .map(|(&cell, &weight)| (cell, weight))
                .collect();
            // Without a usable border cell, the cities; without those
            // either (a sliver of a country that holds no city), the border
            // after all: somewhere is better than nowhere.
            let mut places = Vec::new();
            if usable.is_empty() {
                places = self.home_cities(country);
            }
            if places.is_empty() {
                let cells = if usable.is_empty() {
                    borders.get(&country).cloned().unwrap_or_default()
                } else {
                    usable
                };
                let line: Vec<Cell> = cells.keys().copied().collect();
                places = spread_by(&self.map, &line, count, |c| cells[&c]);
            }
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

    /// Whether land held by `country` joins `cell` to at least
    /// `MIN_REACH_CELLS` cells, or to `capital`, through side neighbours
    /// (as divisions march).
    fn leads_inland(&self, cell: Cell, country: CountryId, capital: Option<Cell>) -> bool {
        let mut seen = vec![cell];
        let mut next = 0;
        while next < seen.len() {
            if seen.len() >= MIN_REACH_CELLS || capital.is_some_and(|c| seen.contains(&c)) {
                return true;
            }
            let here = seen[next];
            next += 1;
            for side in self.map.sides(here) {
                if self.map.is_land(side)
                    && self.control[side as usize] == country
                    && !seen.contains(&side)
                {
                    seen.push(side);
                }
            }
        }
        capital.is_some_and(|c| seen.contains(&c))
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
