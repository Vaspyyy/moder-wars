//! Seeded random numbers. Every random decision in the simulation draws from
//! an `Rng` stored in the world state, so a seed plus the same commands always
//! replays the same game, and a save resumes the exact same stream.

use serde::{Deserialize, Serialize};

const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

/// SplitMix64 (Steele, Lea and Flood; reference code by Vigna): tiny, fast,
/// and good enough for game decisions. Not for cryptography.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(GOLDEN_GAMMA);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, 1)`, using the top 53 bits.
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform in `0..n` without modulo bias (Lemire's method). `n` must be > 0.
    pub fn below(&mut self, n: u32) -> u32 {
        assert!(n > 0, "Rng::below(0)");
        let threshold = n.wrapping_neg() % n;
        loop {
            let product = u64::from(self.next_u64() as u32) * u64::from(n);
            if product as u32 >= threshold {
                return (product >> 32) as u32;
            }
        }
    }

    /// True with probability `p` (clamped to 0..=1).
    pub fn chance(&mut self, p: f64) -> bool {
        self.next_f64() < p
    }

    /// An independent stream for one subsystem or country, derived from this
    /// one without advancing it. The same `stream` always gives the same fork.
    pub fn fork(&self, stream: u64) -> Rng {
        let mut mixer = Rng::new(self.state ^ stream.wrapping_mul(GOLDEN_GAMMA).rotate_left(17));
        Rng::new(mixer.next_u64())
    }
}
