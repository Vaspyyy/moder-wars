//! The simulation's only source of randomness: seeded, repeatable, saveable.

use mw_sim::rng::Rng;

#[test]
fn matches_the_splitmix64_reference() {
    // Values from the reference algorithm (Vigna), computed independently.
    let mut zero = Rng::new(0);
    assert_eq!(zero.next_u64(), 0xe220a8397b1dcdaf);
    let mut rng = Rng::new(1234567);
    assert_eq!(rng.next_u64(), 0x599ed017fb08fc85);
    assert_eq!(rng.next_u64(), 0x2c73f08458540fa5);
    assert_eq!(rng.next_u64(), 0x883ebce5a3f27c77);
}

#[test]
fn same_seed_same_numbers() {
    let mut a = Rng::new(42);
    let mut b = Rng::new(42);
    let mut c = Rng::new(43);
    let first: Vec<u64> = (0..100).map(|_| a.next_u64()).collect();
    let second: Vec<u64> = (0..100).map(|_| b.next_u64()).collect();
    let other: Vec<u64> = (0..100).map(|_| c.next_u64()).collect();
    assert_eq!(first, second);
    assert_ne!(first, other);
}

#[test]
fn fractions_are_in_zero_to_one_and_average_a_half() {
    let mut rng = Rng::new(7);
    let mut sum = 0.0;
    for _ in 0..100_000 {
        let x = rng.next_f64();
        assert!((0.0..1.0).contains(&x), "{x}");
        sum += x;
    }
    let mean = sum / 100_000.0;
    assert!((mean - 0.5).abs() < 0.01, "mean {mean}");
}

#[test]
fn below_stays_in_range_and_is_fair() {
    let mut rng = Rng::new(99);
    let mut counts = [0u32; 6];
    for _ in 0..60_000 {
        let roll = rng.below(6);
        assert!(roll < 6);
        counts[roll as usize] += 1;
    }
    for count in counts {
        assert!((9_400..=10_600).contains(&count), "{counts:?}");
    }
    assert_eq!(rng.below(1), 0);
}

#[test]
fn chance_respects_certainty_and_odds() {
    let mut rng = Rng::new(5);
    assert!((0..1000).all(|_| !rng.chance(0.0)));
    assert!((0..1000).all(|_| rng.chance(1.0)));
    let hits = (0..100_000).filter(|_| rng.chance(0.25)).count();
    assert!((24_000..=26_000).contains(&hits), "{hits}");
}

#[test]
fn forks_are_repeatable_independent_streams() {
    let parent = Rng::new(2026);
    let mut a1 = parent.fork(1);
    let mut a2 = parent.fork(1);
    let mut b = parent.fork(2);
    let mut p = parent.clone();
    let a: Vec<u64> = (0..50).map(|_| a1.next_u64()).collect();
    assert_eq!(a, (0..50).map(|_| a2.next_u64()).collect::<Vec<_>>());
    assert_ne!(a, (0..50).map(|_| b.next_u64()).collect::<Vec<_>>());
    assert_ne!(a, (0..50).map(|_| p.next_u64()).collect::<Vec<_>>());
    assert_eq!(
        parent,
        Rng::new(2026),
        "forking must not advance the parent"
    );
}

#[test]
fn saving_keeps_the_stream_position() {
    let mut rng = Rng::new(11);
    for _ in 0..10 {
        rng.next_u64();
    }
    let bytes = postcard::to_allocvec(&rng).unwrap();
    let mut restored: Rng = postcard::from_bytes(&bytes).unwrap();
    assert_eq!(restored.next_u64(), rng.next_u64());
}
