//! Peace terms, counted in regions.
//!
//! Fronts move cell by cell, but a peace settles whole regions (admin-1
//! states, provinces and oblasts, see `regions.rs`). When two countries make
//! peace, a region that one side owns by law and the other side alone holds
//! more than half of becomes the holder's by law, whole: the cells the
//! owner still held there go to it too, and it pays its new owner in full
//! instead of the occupier's half. Half is counted by what the land
//! produces, as capitulation is (a big city weighs more than empty
//! country around it), or by cells in a region that produces nothing.
//! Whatever else either side holds of the
//! other's regions goes back, so scattered pockets disappear and the new
//! border runs along region lines. Divisions left on the other side's land
//! go home to the nearest land their country holds. Regions of other
//! countries, and land held by anyone else, are not part of the peace.
//!
//! Without regions (`World::use_regions` never called) peace keeps every
//! cell each side holds.

use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::Arc;

use crate::map::Cell;
use crate::regions::Regions;
use crate::world::{CountryId, Event, World};

/// A region a peace hands over by law: its index in the region list, its
/// owner by law before and after.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cession {
    pub region: usize,
    pub from: CountryId,
    pub to: CountryId,
}

/// What a peace settles: who gets the two sides' cells in each region of
/// theirs that the other side holds part of, and the regions that change
/// owner by law.
#[derive(Default)]
struct Settlement {
    settled: BTreeMap<usize, CountryId>,
    ceded: Vec<Cession>,
}

/// The parts of the region map the simulation needs.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct RegionMap {
    /// Per cell: region index + 1, or 0 for no region.
    cell_region: Vec<u16>,
    /// Per region: its land cells.
    cells: Vec<u32>,
    /// Per region: what its land produces (`MapData::value_k`, summed).
    value_k: Vec<u64>,
    /// Per region: its owner by law when the game started.
    home: Vec<CountryId>,
}

impl RegionMap {
    fn region(&self, cell: Cell) -> Option<usize> {
        match self.cell_region.get(cell as usize) {
            Some(&value) if value > 0 => Some(usize::from(value) - 1),
            _ => None,
        }
    }
}

impl World {
    /// Settle peace terms in these regions from now on. Call it before the
    /// game starts, with regions built for this world's scenario.
    pub fn use_regions(&mut self, regions: &Regions) {
        assert_eq!(
            regions.cell_region.len(),
            self.map.len(),
            "regions are built for another map"
        );
        self.ceded.clear();
        self.attach_regions(regions);
        self.count_output();
    }

    /// Give a world (fresh or loaded) its region map.
    pub(crate) fn attach_regions(&mut self, regions: &Regions) {
        self.regions_fingerprint = Some(regions.fingerprint());
        let mut map = RegionMap {
            cell_region: regions.cell_region.clone(),
            cells: regions.list.iter().map(|r| r.cells).collect(),
            value_k: vec![0; regions.list.len()],
            home: regions.list.iter().map(|r| r.home).collect(),
        };
        for (cell, value) in self.map.land_values() {
            if let Some(region) = map.region(cell) {
                map.value_k[region] += value;
            }
        }
        self.regions = Some(Arc::new(map));
    }

    /// Who owns the cell by law: its region's new owner if a peace handed
    /// the region over, else its owner when the game started.
    pub fn owner_by_law(&self, cell: Cell) -> CountryId {
        if !self.ceded.is_empty()
            && let Some(map) = &self.regions
            && let Some(region) = map.region(cell)
            && let Some(&owner) = self.ceded.get(&(region as u16))
        {
            return owner;
        }
        self.map.de_jure(cell)
    }

    /// `owner_by_law` for counting many cells: a table instead of a lookup
    /// in `ceded` per cell.
    pub(crate) fn law_of(&self) -> impl Fn(Cell) -> CountryId + '_ {
        let table = self
            .regions
            .as_deref()
            .filter(|_| !self.ceded.is_empty())
            .map(|map| {
                let mut owners = vec![0; map.home.len()];
                for (&region, &owner) in &self.ceded {
                    owners[usize::from(region)] = owner;
                }
                (map, owners)
            });
        move |cell| {
            if let Some((map, owners)) = &table
                && let Some(region) = map.region(cell)
                && owners[region] != 0
            {
                return owners[region];
            }
            self.map.de_jure(cell)
        }
    }

    /// The regions `country` owned by law when the game started that a
    /// peace has handed to another country since, in region order.
    pub fn lost_regions(&self, country: CountryId) -> Vec<Cession> {
        let Some(map) = self.regions.as_deref() else {
            return Vec::new();
        };
        self.ceded
            .iter()
            .map(|(&region, &to)| (usize::from(region), to))
            .filter(|&(region, to)| map.home[region] == country && to != country)
            .map(|(region, to)| Cession {
                region,
                from: country,
                to,
            })
            .collect()
    }

    /// The share of the land `country` owned by law when the game started
    /// that it still owns by law, counted in map cells (1.0 for a country
    /// with no land). Without regions a peace keeps every cell each side
    /// holds, so it is the share it holds.
    pub fn land_kept(&self, country: CountryId) -> f64 {
        let law = self.law_of();
        let with_regions = self.regions.is_some();
        let (mut had, mut kept) = (0u64, 0u64);
        for cell in 0..self.map.len() as Cell {
            if self.map.de_jure(cell) == country {
                had += 1;
                let owner = if with_regions {
                    law(cell)
                } else {
                    self.control[cell as usize]
                };
                if owner == country {
                    kept += 1;
                }
            }
        }
        if had == 0 {
            1.0
        } else {
            kept as f64 / had as f64
        }
    }

    fn region_owner(&self, map: &RegionMap, region: usize) -> CountryId {
        self.ceded
            .get(&(region as u16))
            .copied()
            .unwrap_or(map.home[region])
    }

    /// The regions a peace between `a` and `b` would hand over by law, in
    /// region order (empty without regions). Reading them changes nothing.
    pub fn peace_terms(&self, a: CountryId, b: CountryId) -> Vec<Cession> {
        self.settlement(a, b, None)
            .map(|s| s.ceded)
            .unwrap_or_default()
    }

    /// What `a` and `b` hold of each region either of them holds any of:
    /// region -> [cells held by a, by b], and [output held by a, by b].
    fn holdings(
        &self,
        map: &RegionMap,
        a: CountryId,
        b: CountryId,
    ) -> (BTreeMap<usize, [u64; 2]>, BTreeMap<usize, [u64; 2]>) {
        let side = |cell: Cell| match self.control[cell as usize] {
            h if h == a => Some(0),
            h if h == b => Some(1),
            _ => None,
        };
        let mut held: BTreeMap<usize, [u64; 2]> = BTreeMap::new();
        for cell in 0..self.control.len() as Cell {
            if let Some(side) = side(cell)
                && let Some(region) = map.region(cell)
            {
                held.entry(region).or_default()[side] += 1;
            }
        }
        let mut worth: BTreeMap<usize, [u64; 2]> = BTreeMap::new();
        for (cell, value) in self.map.land_values() {
            if let Some(side) = side(cell)
                && let Some(region) = map.region(cell)
            {
                worth.entry(region).or_default()[side] += value;
            }
        }
        (held, worth)
    }

    /// Whether the country on `side` of `holdings` alone holds more than
    /// half of a region (by what it produces, or by cells in a region that
    /// produces nothing).
    fn holds_most(
        map: &RegionMap,
        region: usize,
        side: usize,
        held: &BTreeMap<usize, [u64; 2]>,
        worth: &BTreeMap<usize, [u64; 2]>,
    ) -> bool {
        let (on, total) = if map.value_k[region] > 0 {
            let value = worth.get(&region).copied().unwrap_or_default();
            (value[side], map.value_k[region])
        } else {
            let cells = held.get(&region).copied().unwrap_or_default();
            (cells[side], u64::from(map.cells[region]))
        };
        on * 2 > total
    }

    /// What `country` holds of each region in `regions`, in the same order:
    /// its share of what the region produces (of its cells if it produces
    /// nothing), and whether that is more than half (see `holds_most`).
    pub fn holding(&self, country: CountryId, regions: &[usize]) -> Vec<(f64, bool)> {
        let Some(map) = self.regions.as_deref() else {
            return vec![(0.0, false); regions.len()];
        };
        let (held, worth) = self.holdings(map, country, country);
        regions
            .iter()
            .map(|&region| {
                if region >= map.home.len() {
                    return (0.0, false);
                }
                let share = if map.value_k[region] > 0 {
                    worth.get(&region).map_or(0, |w| w[0]) as f64 / map.value_k[region] as f64
                } else if map.cells[region] > 0 {
                    held.get(&region).map_or(0, |h| h[0]) as f64 / f64::from(map.cells[region])
                } else {
                    0.0
                };
                (share, Self::holds_most(map, region, 0, &held, &worth))
            })
            .collect()
    }

    /// What a region produces (`MapData::value_k` summed; 0 for an unknown
    /// region or without regions).
    pub fn region_value_k(&self, region: usize) -> u64 {
        self.regions
            .as_deref()
            .and_then(|map| map.value_k.get(region).copied())
            .unwrap_or(0)
    }

    /// The region's owner by law now (0 for an unknown region or without
    /// regions).
    pub fn region_owner_now(&self, region: usize) -> CountryId {
        match self.regions.as_deref() {
            Some(map) if region < map.home.len() => self.region_owner(map, region),
            _ => 0,
        }
    }

    /// What a peace between `a` and `b` settles, or None without regions:
    /// the regions in `terms` change hands (each goes from its owner by law
    /// to the other side); with no terms given, each region one side alone
    /// holds most of goes to it. Regions of other countries in `terms` are
    /// left out.
    fn settlement(&self, a: CountryId, b: CountryId, terms: Option<&[u16]>) -> Option<Settlement> {
        let map = self.regions.as_deref()?;
        let (a, b) = (a.min(b), a.max(b));
        let (held, worth) = self.holdings(map, a, b);
        let mut settlement = Settlement::default();
        if let Some(terms) = terms {
            // Regions in the terms that neither side holds any of change
            // owner by law only.
            for &region in terms {
                let region = usize::from(region);
                if region < map.home.len() && !held.contains_key(&region) {
                    let owner = self.region_owner(map, region);
                    if owner == a || owner == b {
                        let to = if owner == a { b } else { a };
                        settlement.ceded.push(Cession {
                            region,
                            from: owner,
                            to,
                        });
                    }
                }
            }
        }
        for &region in held.keys() {
            let owner = self.region_owner(map, region);
            let other_side = match owner {
                o if o == a => 1,
                o if o == b => 0,
                // Another country's region: not part of this peace.
                _ => continue,
            };
            let other = [a, b][other_side];
            let hands_over = match terms {
                Some(terms) => terms.contains(&(region as u16)),
                None => Self::holds_most(map, region, other_side, &held, &worth),
            };
            if hands_over {
                settlement.ceded.push(Cession {
                    region,
                    from: owner,
                    to: other,
                });
                settlement.settled.insert(region, other);
            } else {
                settlement.settled.insert(region, owner);
            }
        }
        Some(settlement)
    }

    /// Settle the land between two countries that just made peace, on
    /// `terms` (see `settlement`).
    pub(crate) fn settle_regions(
        &mut self,
        a: CountryId,
        b: CountryId,
        terms: Option<&[u16]>,
        events: &mut Vec<Event>,
    ) {
        let Some(mut settlement) = self.settlement(a, b, terms) else {
            return;
        };
        settlement.ceded.sort_by_key(|c| c.region);
        let map = self.regions.clone().expect("a settlement needs regions");
        let mut handed: BTreeMap<(CountryId, CountryId), u32> = BTreeMap::new();
        for cession in &settlement.ceded {
            if cession.to == map.home[cession.region] {
                self.ceded.remove(&(cession.region as u16));
            } else {
                self.ceded.insert(cession.region as u16, cession.to);
            }
            *handed.entry((cession.from, cession.to)).or_default() += 1;
        }
        for cell in 0..self.control.len() as Cell {
            let holder = self.control[cell as usize];
            if (holder == a || holder == b)
                && let Some(&to) = map.region(cell).and_then(|r| settlement.settled.get(&r))
                && holder != to
            {
                self.set_control(cell, to);
            }
        }
        if !handed.is_empty() {
            self.count_output();
        }
        for ((from, to), regions) in handed {
            events.push(Event::RegionsCeded { from, to, regions });
        }
        self.withdraw(a, b);
    }

    /// Divisions of `a` and `b` standing on land the other side holds go to
    /// the nearest land their country holds.
    fn withdraw(&mut self, a: CountryId, b: CountryId) {
        for index in 0..self.divisions.len() {
            let (country, cell) = (self.divisions[index].country, self.divisions[index].cell);
            let holder = self.control[cell as usize];
            if (country != a && country != b) || (holder != a && holder != b) || holder == country {
                continue;
            }
            if let Some(home) = self.nearest_held(cell, country) {
                let division = &mut self.divisions[index];
                division.cell = home;
                division.path.clear();
                division.progress_m = 0;
                division.blocked = None;
            }
        }
    }

    /// The land cell held by `country` fewest side steps over land from
    /// `from`.
    fn nearest_held(&self, from: Cell, country: CountryId) -> Option<Cell> {
        let mut seen = HashSet::from([from]);
        let mut queue = VecDeque::from([from]);
        while let Some(cell) = queue.pop_front() {
            if self.control[cell as usize] == country {
                return Some(cell);
            }
            for next in self.map.sides(cell) {
                if self.map.is_land(next) && seen.insert(next) {
                    queue.push_back(next);
                }
            }
        }
        None
    }
}
