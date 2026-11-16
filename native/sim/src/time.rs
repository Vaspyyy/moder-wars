//! Game time. One tick is one game hour; the calendar is the proleptic
//! Gregorian one. The `Pacer` turns real seconds into ticks for the chosen
//! speed, so the simulation runs on a fixed clock whatever the frame rate.

use std::fmt;

use serde::{Deserialize, Serialize};

/// Game hours per real second for speeds 1 to 5.
pub const SPEED_HOURS_PER_SECOND: [f64; 5] = [2.0, 6.0, 12.0, 24.0, 72.0];

/// The most ticks one frame may run. After a stall (a slow frame, a debugger,
/// the window being hidden) the rest of the backlog is dropped instead of
/// making every following frame slow too.
pub const MAX_TICKS_PER_FRAME: u32 = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Date {
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

impl Date {
    /// `YYYY-MM-DD`, only for dates that exist.
    pub fn parse(text: &str) -> Option<Date> {
        let mut parts = text.split('-');
        let (year, month, day) = (parts.next()?, parts.next()?, parts.next()?);
        if parts.next().is_some() || year.len() != 4 || month.len() != 2 || day.len() != 2 {
            return None;
        }
        let date = Date {
            year: year.parse().ok()?,
            month: month.parse().ok()?,
            day: day.parse().ok()?,
        };
        let valid = (1..=12).contains(&date.month)
            && date.day >= 1
            && date.day <= days_in_month(date.year, date.month);
        valid.then_some(date)
    }

    /// Days since 1970-01-01 (negative before). Howard Hinnant's algorithm.
    pub fn day_number(self) -> i64 {
        let year = i64::from(self.year) - i64::from(self.month <= 2);
        let era = year.div_euclid(400);
        let year_of_era = year - era * 400;
        let month = i64::from(self.month);
        let day_of_year =
            (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + i64::from(self.day) - 1;
        let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
        era * 146_097 + day_of_era - 719_468
    }

    pub fn from_day_number(days: i64) -> Date {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let day_of_era = z - era * 146_097;
        let year_of_era =
            (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
        let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
        let mp = (5 * day_of_year + 2) / 153;
        let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u8;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
        let year = (year_of_era + era * 400 + i64::from(month <= 2)) as i32;
        Date { year, month, day }
    }

    pub fn add_days(self, days: i64) -> Date {
        Date::from_day_number(self.day_number() + days)
    }
}

impl fmt::Display for Date {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GameTime {
    pub date: Date,
    pub hour: u8,
}

/// The game time `tick` hours after midnight on `start`.
pub fn time_at(start: Date, tick: u64) -> GameTime {
    GameTime {
        date: start.add_days((tick / 24) as i64),
        hour: (tick % 24) as u8,
    }
}

/// Real time to ticks. Starts paused at speed 1.
#[derive(Clone, Debug)]
pub struct Pacer {
    speed: u8,
    paused: bool,
    /// Fraction of a tick left over from earlier frames.
    carry: f64,
}

impl Default for Pacer {
    fn default() -> Self {
        Self {
            speed: 1,
            paused: true,
            carry: 0.0,
        }
    }
}

impl Pacer {
    pub fn speed(&self) -> u8 {
        self.speed
    }

    pub fn set_speed(&mut self, speed: u8) {
        self.speed = speed.clamp(1, SPEED_HOURS_PER_SECOND.len() as u8);
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }

    /// How many ticks to run for a frame that took `real_seconds`.
    pub fn ticks_due(&mut self, real_seconds: f64) -> u32 {
        if self.paused || real_seconds.is_nan() || real_seconds <= 0.0 {
            return 0;
        }
        self.carry += real_seconds * SPEED_HOURS_PER_SECOND[self.speed as usize - 1];
        // A tiny tolerance so 60 frames of 1/60 s make exactly one second.
        let due = (self.carry + 1e-9).floor();
        if due >= f64::from(MAX_TICKS_PER_FRAME) {
            self.carry = 0.0;
            return MAX_TICKS_PER_FRAME;
        }
        self.carry = (self.carry - due).max(0.0);
        due as u32
    }
}
