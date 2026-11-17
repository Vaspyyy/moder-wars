//! What a country's wars cost it, for the end-of-war screen: divisions
//! raised, soldiers lost, enemy soldiers its divisions put out of action,
//! and its last capitulation.

use serde::{Deserialize, Serialize};

use crate::world::CountryId;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct WarRecord {
    /// Divisions recruited since the game began (not the starting army).
    pub raised: u32,
    /// Soldiers lost: put out of action in battle, worn away while cut off
    /// from supply, left in divisions too weak to fight on, or in divisions
    /// that surrendered in battle. Not the divisions that lay down their
    /// arms when the country capitulates.
    pub lost: u64,
    /// Enemy soldiers its divisions put out of action in battle or made
    /// surrender. When several countries attack together, each gets a share
    /// by its part of the attack.
    pub inflicted: u64,
    /// The last time the country capitulated.
    pub capitulation: Option<Capitulation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capitulation {
    /// The tick it gave up.
    pub tick: u64,
    /// The countries it was at war with then, in id order.
    pub enemies: Vec<CountryId>,
    /// The tick the oldest of those wars began.
    pub war_began: u64,
    /// Whether war support at home ran out (else it lost its capital and
    /// most of its land).
    pub support_collapsed: bool,
}

/// Split `total` among countries by `weights` (in order), whole numbers
/// that add up to `total`: the remainder goes to the heaviest.
pub(crate) fn shares(total: u64, weights: &[(CountryId, f64)]) -> Vec<(CountryId, u64)> {
    let sum: f64 = weights.iter().map(|&(_, w)| w.max(0.0)).sum();
    if weights.is_empty() || total == 0 {
        return Vec::new();
    }
    let mut out: Vec<(CountryId, u64)> = weights
        .iter()
        .map(|&(c, w)| {
            let part = if sum > 0.0 {
                (total as f64 * w.max(0.0) / sum).floor() as u64
            } else {
                0
            };
            (c, part)
        })
        .collect();
    let given: u64 = out.iter().map(|&(_, p)| p).sum();
    let heaviest = (0..weights.len())
        .max_by(|&a, &b| weights[a].1.total_cmp(&weights[b].1).then(b.cmp(&a)))
        .expect("not empty");
    out[heaviest].1 += total.saturating_sub(given);
    out
}

#[cfg(test)]
mod tests {
    use super::shares;

    #[test]
    fn shares_add_up_and_follow_the_weights() {
        assert_eq!(shares(10, &[(1, 1.0), (2, 1.0)]), vec![(1, 5), (2, 5)]);
        assert_eq!(shares(10, &[(1, 1.0), (2, 2.0)]), vec![(1, 3), (2, 7)]);
        assert_eq!(shares(7, &[(4, 0.0)]), vec![(4, 7)]);
        assert!(shares(0, &[(1, 1.0)]).is_empty());
        assert!(shares(5, &[]).is_empty());
    }
}
