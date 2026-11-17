//! Peace terms, counted in regions.
//!
//! Fronts move cell by cell, but a peace settles whole regions (admin-1
//! states, provinces and oblasts, see `regions.rs`). When two countries make
//! peace, a region that one side owns by law and the other side alone holds
//! more than half of becomes the holder's by law, whole: the cells the
//! owner still held there go to it too, and it pays its new owner in full
//! instead of the occupier's half. Whatever else either side holds of the
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
        self.regions = Some(Arc::new(RegionMap {
            cell_region: regions.cell_region.clone(),
            cells: regions.list.iter().map(|r| r.cells).collect(),
            home: regions.list.iter().map(|r| r.home).collect(),
        }));
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
        self.settlement(a, b).map(|s| s.ceded).unwrap_or_default()
    }

    /// What a peace between `a` and `b` settles, or None without regions.
    fn settlement(&self, a: CountryId, b: CountryId) -> Option<Settlement> {
        let map = self.regions.as_deref()?;
        let (a, b) = (a.min(b), a.max(b));
        // Cells of each region held by a and by b.
        let mut held: BTreeMap<usize, [u32; 2]> = BTreeMap::new();
        for (cell, &holder) in self.control.iter().enumerate() {
            let side = match holder {
                h if h == a => 0,
                h if h == b => 1,
                _ => continue,
            };
            if let Some(region) = map.region(cell as Cell) {
                held.entry(region).or_default()[side] += 1;
            }
        }
        let mut settlement = Settlement::default();
        for (&region, &[on_a, on_b]) in &held {
            let owner = self.region_owner(map, region);
            let (other, on_other) = match owner {
                o if o == a => (b, on_b),
                o if o == b => (a, on_a),
                // Another country's region: not part of this peace.
                _ => continue,
            };
            if u64::from(on_other) * 2 > u64::from(map.cells[region]) {
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

    /// Settle the land between two countries that just made peace.
    pub(crate) fn settle_regions(&mut self, a: CountryId, b: CountryId, events: &mut Vec<Event>) {
        let Some(settlement) = self.settlement(a, b) else {
            return;
        };
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
