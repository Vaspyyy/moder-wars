//! Peace terms, counted in regions.
//!
//! Fronts move cell by cell, but a peace settles whole regions (admin-1
//! states, provinces and oblasts, see `regions.rs`). When two countries make
//! peace, each region partly held by both goes whole to the side that holds
//! more of its cells, so scattered pockets go back and the new border runs
//! along region lines. A region that one side owns by law and the other
//! side now holds more than half of becomes the holder's by law: it pays
//! its new owner in full instead of the occupier's half. Divisions left on
//! the other side's land go home to the nearest land their country holds.
//! Land held by anyone else is not part of the peace.
//!
//! Without regions (`World::use_regions` never called) peace keeps every
//! cell each side holds.

use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::Arc;

use crate::map::Cell;
use crate::regions::Regions;
use crate::world::{CountryId, Event, World};

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

    fn region_owner(&self, map: &RegionMap, region: usize) -> CountryId {
        self.ceded
            .get(&(region as u16))
            .copied()
            .unwrap_or(map.home[region])
    }

    /// Settle the land between two countries that just made peace.
    pub(crate) fn settle_regions(&mut self, a: CountryId, b: CountryId, events: &mut Vec<Event>) {
        let Some(map) = self.regions.clone() else {
            return;
        };
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
        let mut split: BTreeMap<usize, CountryId> = BTreeMap::new();
        let mut handed: BTreeMap<(CountryId, CountryId), u32> = BTreeMap::new();
        for (&region, &[on_a, on_b]) in &held {
            let owner = self.region_owner(&map, region);
            let winner = match on_a.cmp(&on_b) {
                std::cmp::Ordering::Greater => a,
                std::cmp::Ordering::Less => b,
                // A tie stays with the owner by law, if it is one of the two.
                std::cmp::Ordering::Equal if owner == b => b,
                std::cmp::Ordering::Equal => a,
            };
            if on_a > 0 && on_b > 0 {
                split.insert(region, winner);
            }
            let holds_most = u64::from(on_a + on_b) * 2 > u64::from(map.cells[region]);
            if (owner == a || owner == b) && owner != winner && holds_most {
                if winner == map.home[region] {
                    self.ceded.remove(&(region as u16));
                } else {
                    self.ceded.insert(region as u16, winner);
                }
                *handed.entry((owner, winner)).or_default() += 1;
            }
        }
        if !split.is_empty() {
            for cell in 0..self.control.len() as Cell {
                let holder = self.control[cell as usize];
                if (holder == a || holder == b)
                    && let Some(&winner) = map.region(cell).and_then(|r| split.get(&r))
                    && holder != winner
                {
                    self.set_control(cell, winner);
                }
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
