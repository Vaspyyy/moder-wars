//! Army groups: the player draws, divisions carry it out.
//!
//! A group's **front** is a line drawn near a border. It snaps to the
//! group's own land along that border, facing one country (the one most of
//! the line touches), and is kept as points about `STEP_M` apart. The
//! group's divisions spread evenly along it, in the order they stand, so
//! they never cross each other's paths.
//!
//! Without an **arrow** the group holds: its front stays where it was drawn
//! unless the enemy takes that land, and then it falls back to the new
//! border. With an arrow every division at the front attacks the enemy cell
//! beside it (side neighbours only, so the land behind stays linked) that
//! lies most in the arrow's direction, again and again. A division whose
//! land ahead fell without a fight steps up to the nearest border cell ahead
//! of it. The front moves forward along the arrow with the land taken, and
//! the arrow is done once its tip is taken. An arrow also gathers the group:
//! its divisions spread over the stretch of front near the arrow (wider for
//! bigger groups) instead of the whole front, so they attack side by side
//! and keep the land between them. An enemy division right beside an
//! attacker is attacked, not walked past.
//!
//! Groups re-plan every `PLAN_EVERY` hours, and at once when given an order.

use serde::{Deserialize, Serialize};

use crate::division::DivisionId;
use crate::map::Cell;
use crate::path;
use crate::world::{CountryId, Event, World};

/// How far a drawn front may be from the border it snaps to.
const SNAP_M: f64 = 60_000.0;
/// How far a front point follows the border from one plan to the next.
const FOLLOW_M: f64 = 30_000.0;
/// Spacing of the points that make up a front.
const STEP_M: f64 = 10_000.0;
/// Search budget (cells) for a route behind the lines before trying any route.
const BEHIND_THE_LINES_SEARCH: usize = 50_000;
/// Width of front each attacking division takes near an arrow, and the
/// least half-width of that stretch.
const ATTACK_WIDTH_M: f64 = 12_000.0;
const MIN_SECTOR_HALF_M: f64 = 20_000.0;
/// A division farther than this from its place goes there before attacking.
const LANE_M: u64 = 40_000;
pub(crate) const PLAN_EVERY: u64 = 3;

/// Half the width of the attack sector around an arrow, in metres.
fn sector_half_m(divisions: usize) -> f64 {
    (divisions as f64 * ATTACK_WIDTH_M / 2.0).max(MIN_SECTOR_HALF_M)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ArmyGroupId(pub u32);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArmyGroup {
    pub id: ArmyGroupId,
    pub country: CountryId,
    /// Sorted.
    pub divisions: Vec<DivisionId>,
    /// The country the front faces.
    pub enemy: Option<CountryId>,
    /// Own cells along the border with `enemy`, in order along the front.
    pub front: Vec<Cell>,
    /// From the front into enemy land; empty when the group holds.
    pub arrow: Vec<Cell>,
}

impl World {
    /// Snap a drawn line to the border: the country it faces and the front
    /// points, or None when the line is nowhere near a border.
    pub(crate) fn snap_front(
        &self,
        own: CountryId,
        line: &[Cell],
    ) -> Option<(CountryId, Vec<Cell>)> {
        if line.is_empty() || line.iter().any(|&c| c as usize >= self.map.len()) {
            return None;
        }
        let walked = self.map.walk_line(line, STEP_M);
        let foreign = |cell: Cell| {
            self.map
                .sides(cell)
                .filter(|&n| self.map.is_land(n))
                .map(|n| self.control[n as usize])
                .filter(|&c| c != own && c != 0)
        };
        // The country most of the line runs along.
        let mut faced: Vec<CountryId> = Vec::new();
        for &point in &walked {
            let border = self.nearest(point, SNAP_M, |c| {
                self.held(c, own) && foreign(c).next().is_some()
            });
            if let Some(border) = border {
                faced.extend(foreign(border));
            }
        }
        faced.sort_unstable();
        let enemy = faced
            .chunk_by(|a, b| a == b)
            .max_by_key(|run| (run.len(), std::cmp::Reverse(run[0])))?[0];
        let mut front: Vec<Cell> = walked
            .iter()
            .filter_map(|&p| self.nearest(p, SNAP_M, |c| self.is_contact(c, own, enemy)))
            .collect();
        front.dedup();
        (!front.is_empty()).then_some((enemy, front))
    }

    /// Re-plan every army group: keep fronts on the border, finish reached
    /// arrows, and give divisions their places and targets.
    pub(crate) fn plan_groups(&mut self, events: &mut Vec<Event>) {
        for index in 0..self.groups.len() {
            self.plan_group(index, events);
        }
    }

    fn plan_group(&mut self, index: usize, events: &mut Vec<Event>) {
        let group = &self.groups[index];
        let (own, Some(enemy)) = (group.country, group.enemy) else {
            return;
        };
        let members = group.divisions.len();
        let front = self.follow_front(own, enemy, &group.front, &group.arrow, members);
        let reached = group
            .arrow
            .last()
            .is_some_and(|&tip| self.control[tip as usize] == own);
        let group = &mut self.groups[index];
        group.front = front;
        if reached {
            group.arrow.clear();
            events.push(Event::ArrowReached { group: group.id });
        }
        let group = &self.groups[index];
        if group.front.is_empty() {
            return;
        }
        let members: Vec<usize> = group
            .divisions
            .iter()
            .filter_map(|&id| self.division_index(id))
            .collect();
        let sector = self.sector(&group.front, &group.arrow, members.len());
        let places = self.places(&sector, &members);
        let arrow = group.arrow.clone();
        for (division, place) in members.into_iter().zip(places) {
            let target = self.target(division, place, own, enemy, &arrow);
            self.send(division, target);
        }
    }

    /// The front after the border moved. Points stay put, except that a
    /// point on land the enemy took falls back to the nearest border cell
    /// (or is dropped if there is none near). With an arrow, the stretch of
    /// front in the attack sector is redrawn across the arrow instead: its
    /// width is cut into strips `STEP_M` wide, and each strip's point is its
    /// most forward border cell near the old front. That keeps one clean
    /// line however ragged the fighting gets, bulging forward with the push.
    fn follow_front(
        &self,
        own: CountryId,
        enemy: CountryId,
        front: &[Cell],
        arrow: &[Cell],
        members: usize,
    ) -> Vec<Cell> {
        let border = |c: Cell| self.is_contact(c, own, enemy);
        let hold = |p: Cell| {
            if self.held(p, own) {
                Some(p)
            } else {
                self.nearest(p, FOLLOW_M, border)
            }
        };
        let frame = self.frame(arrow);
        let half = sector_half_m(members);
        let in_sector = |p: Cell| frame.as_ref().is_some_and(|f| f(p).1.abs() <= half);
        let run: Vec<Cell> = front.iter().copied().filter(|&p| in_sector(p)).collect();
        let mut redrawn = Vec::new();
        if let (Some(frame), Some(&first), Some(&last)) = (&frame, run.first(), run.last()) {
            let (mut low, mut high) = (f64::MAX, f64::MIN);
            for &p in &run {
                let across = frame(p).1;
                low = low.min(across);
                high = high.max(across);
            }
            let mut candidates = Vec::new();
            for &p in &run {
                self.map.land_within(p, FOLLOW_M, |c, _| {
                    if border(c) {
                        candidates.push(c);
                    }
                });
            }
            candidates.sort_unstable();
            candidates.dedup();
            let strips = ((high - low) / STEP_M).round() as usize + 1;
            let mut best: Vec<Option<(f64, Cell)>> = vec![None; strips];
            for c in candidates {
                let (forward, across) = frame(c);
                let strip = ((across - low) / STEP_M).round();
                if strip < 0.0 || strip >= strips as f64 {
                    continue;
                }
                let slot = &mut best[strip as usize];
                if slot.is_none_or(|(f, cell)| forward > f || (forward == f && c < cell)) {
                    *slot = Some((forward, c));
                }
            }
            redrawn = best.into_iter().flatten().map(|(_, c)| c).collect();
            // Keep the front's direction: the run went from `first` to `last`.
            if frame(first).1 > frame(last).1 {
                redrawn.reverse();
            }
        }
        let mut points = Vec::with_capacity(front.len());
        let mut placed = false;
        for &p in front {
            if !in_sector(p) {
                points.extend(hold(p));
            } else if !placed {
                points.append(&mut redrawn);
                placed = true;
            }
        }
        points.dedup();
        if points.is_empty() {
            front.to_vec()
        } else {
            points
        }
    }

    /// Metres (forward along the arrow, across it) from the arrow's base,
    /// or None without an arrow.
    fn frame(&self, arrow: &[Cell]) -> Option<impl Fn(Cell) -> (f64, f64) + '_> {
        if arrow.len() < 2 {
            return None;
        }
        let base = arrow[0];
        let (east, north) = self.metres(base, arrow[arrow.len() - 1]);
        let length = (east * east + north * north).sqrt().max(1.0);
        let (east, north) = (east / length, north / length);
        Some(move |c: Cell| {
            let (e, n) = self.metres(base, c);
            (e * east + n * north, n * east - e * north)
        })
    }

    /// The stretch of front the group's divisions spread over: all of it,
    /// or with an arrow the points near the arrow.
    fn sector(&self, front: &[Cell], arrow: &[Cell], count: usize) -> Vec<Cell> {
        let Some(frame) = self.frame(arrow) else {
            return front.to_vec();
        };
        let half = sector_half_m(count);
        let near: Vec<Cell> = front
            .iter()
            .copied()
            .filter(|&p| frame(p).1.abs() <= half)
            .collect();
        if near.is_empty() {
            front.to_vec()
        } else {
            near
        }
    }

    /// Each member's place on the front: evenly spread, handed out in the
    /// order the divisions stand along it.
    fn places(&self, front: &[Cell], members: &[usize]) -> Vec<Cell> {
        let (points, count) = (front.len(), members.len());
        let along = |division: usize| {
            let cell = self.divisions[division].cell;
            let nearest = (0..points)
                .min_by_key(|&i| (self.map.estimate_m(cell, front[i]), i))
                .unwrap_or(0);
            (nearest, self.divisions[division].id)
        };
        let mut order: Vec<usize> = (0..count).collect();
        order.sort_by_key(|&k| along(members[k]));
        let mut places = vec![0; count];
        for (rank, k) in order.into_iter().enumerate() {
            places[k] = front[((2 * rank + 1) * points / (2 * count)).min(points - 1)];
        }
        places
    }

    /// Where a division should go: its place on the front, or with an arrow
    /// the enemy cell beside it that lies most in the arrow's direction
    /// (from the nearest border cell ahead, if the land in front fell).
    fn target(
        &self,
        division: usize,
        place: Cell,
        own: CountryId,
        enemy: CountryId,
        arrow: &[Cell],
    ) -> Cell {
        let d = &self.divisions[division];
        if arrow.is_empty() || d.resting || self.map.estimate_m(d.cell, place) > LANE_M {
            return place;
        }
        let (east, north) = self.direction(d.cell, arrow);
        let ahead = |from: Cell, to: Cell| {
            let (e, n) = self.metres(from, to);
            e * east + n * north
        };
        if !self.is_contact(d.cell, own, enemy) {
            return self
                .nearest(d.cell, FOLLOW_M, |c| {
                    ahead(d.cell, c) > 0.0 && self.is_contact(c, own, enemy)
                })
                .unwrap_or(place);
        }
        let defended = |c: Cell| {
            self.divisions
                .iter()
                .any(|e| e.cell == c && self.at_war(own, e.country))
        };
        let sides: Vec<(f64, Cell)> = self
            .map
            .sides(d.cell)
            .filter(|&c| self.held(c, enemy) && self.passable(own, c))
            .map(|c| (ahead(d.cell, c), c))
            .collect();
        let best = |pick: &dyn Fn(f64, Cell) -> bool| {
            sides
                .iter()
                .copied()
                .filter(|&(forward, c)| pick(forward, c))
                .max_by(|a, b| a.0.total_cmp(&b.0).then(b.1.cmp(&a.1)))
                .map(|(_, c)| c)
        };
        best(&|forward, c| forward >= 0.0 && defended(c))
            .or_else(|| best(&|forward, _| forward > 0.0))
            .unwrap_or(place)
    }

    /// The arrow's direction near `cell`, in metres east and north: along
    /// its nearest stretch, or towards its tip for a one-cell arrow.
    fn direction(&self, cell: Cell, arrow: &[Cell]) -> (f64, f64) {
        if arrow.len() < 2 {
            return self.metres(cell, arrow[0]);
        }
        let nearest = (0..arrow.len())
            .min_by_key(|&i| (self.map.estimate_m(cell, arrow[i]), i))
            .unwrap_or(0)
            .min(arrow.len() - 2);
        self.metres(arrow[nearest], arrow[nearest + 1])
    }

    /// Metres east and north from one cell to another.
    fn metres(&self, from: Cell, to: Cell) -> (f64, f64) {
        let (dx, dy) = self.map.offset(from, to);
        let (ew, ns) = self.map.cell_size_m(self.map.xy(from).1);
        (dx as f64 * f64::from(ew), dy as f64 * f64::from(ns))
    }

    /// Route a division to `to`, or stop it there: over its own land when
    /// it can, so the only steps into enemy land are the attacks chosen in
    /// `target`. Keeps the progress made towards the next cell when the new
    /// route starts the same way.
    fn send(&mut self, division: usize, to: Cell) {
        let d = &self.divisions[division];
        if d.cell == to {
            let d = &mut self.divisions[division];
            d.path.clear();
            d.progress_m = 0;
            return;
        }
        if d.target() == Some(to) {
            return;
        }
        let country = d.country;
        let reachable = self.held(to, country) || self.map.sides(to).any(|c| self.held(c, country));
        let behind_the_lines = reachable
            .then(|| {
                path::find_within(
                    &self.map,
                    d.cell,
                    to,
                    |c| c == to || self.held(c, country),
                    BEHIND_THE_LINES_SEARCH,
                )
            })
            .flatten();
        let Some(route) = behind_the_lines
            .or_else(|| path::find(&self.map, d.cell, to, |c| self.passable(country, c)))
        else {
            return;
        };
        let d = &mut self.divisions[division];
        if route.last() != d.path.last() {
            d.progress_m = 0;
        }
        d.path = route;
    }
}
