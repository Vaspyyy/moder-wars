//! Game time: one tick is one game hour on a real calendar, and the pacer
//! turns real seconds into ticks for each speed.

use mw_sim::time::{Date, MAX_TICKS_PER_FRAME, Pacer, SPEED_HOURS_PER_SECOND, time_at};

fn date(text: &str) -> Date {
    Date::parse(text).unwrap_or_else(|| panic!("valid date {text}"))
}

#[test]
fn tick_zero_is_midnight_on_the_start_date() {
    let start = date("2026-10-21");
    let t = time_at(start, 0);
    assert_eq!((t.date, t.hour), (start, 0));
    let t = time_at(start, 25);
    assert_eq!((t.date, t.hour), (date("2026-10-22"), 1));
    assert_eq!(time_at(start, 24 * 365).date, date("2027-10-21"));
}

#[test]
fn calendar_rolls_over_months_years_and_leap_days() {
    assert_eq!(date("2026-12-31").add_days(1), date("2027-01-01"));
    assert_eq!(date("2026-01-31").add_days(1), date("2026-02-01"));
    assert_eq!(date("2028-02-28").add_days(1), date("2028-02-29"));
    assert_eq!(date("2027-02-28").add_days(1), date("2027-03-01"));
    assert_eq!(date("2100-02-28").add_days(1), date("2100-03-01"));
    assert_eq!(date("2000-02-28").add_days(1), date("2000-02-29"));
    assert_eq!(date("2026-03-01").add_days(-1), date("2026-02-28"));
}

#[test]
fn parse_rejects_dates_that_do_not_exist() {
    for bad in [
        "2026-02-29",
        "2026-02-30",
        "2026-13-01",
        "2026-00-10",
        "2026-04-31",
        "26-01-01",
        "today",
        "",
    ] {
        assert_eq!(Date::parse(bad), None, "{bad}");
    }
    assert_eq!(date("2028-02-29").to_string(), "2028-02-29");
}

#[test]
fn every_day_round_trips_through_its_day_number() {
    let mut day = date("1900-01-01");
    let mut number = day.day_number();
    while day < date("2200-01-01") {
        assert_eq!(Date::from_day_number(number), day);
        day = day.add_days(1);
        number += 1;
        assert_eq!(day.day_number(), number);
    }
}

#[test]
fn a_paused_game_does_not_advance() {
    let mut pacer = Pacer::default();
    assert!(pacer.is_paused());
    assert_eq!(pacer.ticks_due(5.0), 0);
}

#[test]
fn each_speed_runs_its_hours_per_second() {
    for speed in 1..=SPEED_HOURS_PER_SECOND.len() as u8 {
        let mut pacer = Pacer::default();
        pacer.set_speed(speed);
        pacer.resume();
        let rate = SPEED_HOURS_PER_SECOND[speed as usize - 1];
        // Many small frames, as a real game loop delivers them.
        let total: u32 = (0..60).map(|_| pacer.ticks_due(1.0 / 60.0)).sum();
        assert_eq!(total, rate as u32, "speed {speed}");
    }
}

#[test]
fn fractions_of_a_tick_carry_over_between_frames() {
    let mut pacer = Pacer::default();
    pacer.set_speed(1);
    pacer.resume();
    let rate = SPEED_HOURS_PER_SECOND[0];
    let frames: Vec<u32> = (0..10).map(|_| pacer.ticks_due(0.1)).collect();
    assert_eq!(frames.iter().sum::<u32>(), rate as u32, "{frames:?}");
}

#[test]
fn a_long_stall_never_floods_the_simulation() {
    let mut pacer = Pacer::default();
    pacer.set_speed(5);
    pacer.resume();
    assert_eq!(pacer.ticks_due(30.0), MAX_TICKS_PER_FRAME);
    // The backlog is dropped, not saved up for later frames.
    let next = pacer.ticks_due(1.0 / 60.0);
    assert!(next <= 2, "{next}");
}

#[test]
fn speed_is_clamped_to_the_known_speeds() {
    let mut pacer = Pacer::default();
    pacer.set_speed(0);
    assert_eq!(pacer.speed(), 1);
    pacer.set_speed(200);
    assert_eq!(pacer.speed(), SPEED_HOURS_PER_SECOND.len() as u8);
}
