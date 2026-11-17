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
    name: String,
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
    let countries: Vec<&WorldBankCountry> = snapshot
        .responses
        .countries
        .1
        .iter()
        .filter(|c| c.region.value.trim() != "Aggregates")
        .collect();
    let iso3_of: BTreeMap<&str, &str> = countries
        .iter()
        .map(|c| (c.iso2.as_str(), c.id.as_str()))
        .collect();
    let mut iso3_by_name: BTreeMap<String, &str> = countries
        .iter()
        .map(|c| (plain_name(&c.name), c.id.as_str()))
        .collect();
    for &(name, iso3) in NAME_ALIASES {
        iso3_by_name.insert(plain_name(name), iso3);
    }
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
    // A country is found by its code, else the code in its flag link, else
    // its name (the web game does the same: some packages carry no codes).
    // Where several entries come to one country, one found by its code
    // wins; among the others (releasables named and flagged like it) the
    // one holding the most land gets the figure.
    let mut land: BTreeMap<CountryId, usize> = BTreeMap::new();
    for (&holder, &is_land) in scenario.control.iter().zip(&scenario.land) {
        if is_land != 0 {
            *land.entry(holder).or_default() += 1;
        }
    }
    // iso3 -> (found by its code?, land, entry).
    let mut chosen: BTreeMap<&str, (bool, usize, CountryId)> = BTreeMap::new();
    for c in scenario.countries.iter().flatten() {
        let found = c
            .iso2
            .as_deref()
            .and_then(|code| iso3_of.get(code))
            .map(|&iso3| (true, iso3))
            .or_else(|| {
                let code = flag_code(c.flag_url.as_deref()?)?;
                iso3_of.get(code.as_str()).map(|&iso3| (false, iso3))
            })
            .or_else(|| {
                iso3_by_name
                    .get(&plain_name(&c.name))
                    .map(|&iso3| (false, iso3))
            });
        let Some((by_code, iso3)) = found else {
            continue;
        };
        let candidate = (by_code, land.get(&c.id).copied().unwrap_or(0), c.id);
        chosen
            .entry(iso3)
            .and_modify(|best| {
                if (candidate.0, candidate.1) > (best.0, best.1) {
                    *best = candidate;
                }
            })
            .or_insert(candidate);
    }
    Ok(chosen
        .into_iter()
        .filter_map(|(iso3, (_, _, id))| {
            let &(year, personnel) = latest.get(iso3)?;
            Some((id, Observation { personnel, year }))
        })
        .collect())
}

/// The two-letter code in a flag link: `https://flagcdn.com/w320/pl.png`
/// or the bundled `assets/flags/pl.svg`, upper case.
fn flag_code(url: &str) -> Option<String> {
    let rest = url
        .split_once("flagcdn.com/")
        .or_else(|| url.split_once("assets/flags/"))?
        .1;
    let file = rest.rsplit('/').next()?;
    let (code, _) = file.split_once('.')?;
    (code.len() == 2 && code.bytes().all(|b| b.is_ascii_alphabetic()))
        .then(|| code.to_ascii_uppercase())
}

/// Map names the World Bank spells otherwise ("Syrian Arab Republic"), as
/// the web game knows them (`src/country-force-profiles.js`).
const NAME_ALIASES: &[(&str, &str)] = &[
    ("Russia", "RUS"),
    ("United States", "USA"),
    ("United States of America", "USA"),
    ("People's Republic of China", "CHN"),
    ("China", "CHN"),
    ("South Korea", "KOR"),
    ("North Korea", "PRK"),
    ("Iran", "IRN"),
    ("Syria", "SYR"),
    ("Egypt", "EGY"),
    ("Vietnam", "VNM"),
    ("Laos", "LAO"),
    ("Venezuela", "VEN"),
    ("Turkey", "TUR"),
    ("Türkiye", "TUR"),
    ("Slovakia", "SVK"),
    ("Czech Republic", "CZE"),
    ("Democratic Republic of the Congo", "COD"),
    ("Republic of the Congo", "COG"),
    ("Ivory Coast", "CIV"),
    ("Palestine", "PSE"),
    ("Kyrgyzstan", "KGZ"),
];

/// A name for matching: lower case ASCII letters and digits only, accents
/// folded ("Côte d'Ivoire" and "Cote d'Ivoire" match).
fn plain_name(name: &str) -> String {
    name.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => 'a',
            'ç' | 'ć' | 'č' => 'c',
            'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ė' | 'ę' | 'ě' => 'e',
            'ì' | 'í' | 'î' | 'ï' | 'ī' | 'ı' => 'i',
            'ñ' | 'ń' | 'ň' => 'n',
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ő' => 'o',
            'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ů' | 'ű' => 'u',
            'ý' | 'ÿ' => 'y',
            'ś' | 'š' | 'ş' => 's',
            'ź' | 'ż' | 'ž' => 'z',
            'ğ' => 'g',
            'ł' => 'l',
            'ř' => 'r',
            'ť' | 'ţ' => 't',
            'ď' => 'd',
            other => other,
        })
        .filter(char::is_ascii_alphanumeric)
        .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_flag_link_gives_its_code() {
        assert_eq!(
            flag_code("https://flagcdn.com/w320/pl.png").as_deref(),
            Some("PL")
        );
        assert_eq!(flag_code("assets/flags/xk.svg").as_deref(), Some("XK"));
        assert_eq!(flag_code("https://flagcdn.com/w320/gb-eng.png"), None);
        assert_eq!(flag_code("https://api.websim.com/blobs/0192.png"), None);
        assert_eq!(flag_code("assets/flags/legacy/0192-abcd.png"), None);
    }

    #[test]
    fn names_match_without_case_spaces_or_accents() {
        assert_eq!(plain_name("Côte d'Ivoire"), plain_name("Cote d'Ivoire"));
        assert_eq!(plain_name("Türkiye"), "turkiye");
        assert_eq!(plain_name("Bosnia and Herz."), "bosniaandherz");
        assert_eq!(plain_name("Korea, Rep."), "korearep");
    }
}
