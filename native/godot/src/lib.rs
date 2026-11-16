//! Godot bridge for the Modern Wars simulation.
//!
//! Keep this crate thin: it converts `mw-sim` data into Godot types and
//! nothing else. Game rules belong in `mw-sim`, where they are tested without
//! an engine.

use godot::classes::image::Format;
use godot::classes::{IRefCounted, Image, RefCounted};
use godot::prelude::*;
use mw_sim::scenario::{self, Scenario};

struct ModernWarsExtension;

#[gdextension]
unsafe impl ExtensionLibrary for ModernWarsExtension {}

/// A loaded scenario, exposed to GDScript.
#[derive(GodotClass)]
#[class(base = RefCounted)]
pub struct MwScenario {
    scenario: Option<Scenario>,
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for MwScenario {
    fn init(base: Base<RefCounted>) -> Self {
        Self {
            scenario: None,
            base,
        }
    }
}

#[godot_api]
impl MwScenario {
    /// Load a `.mwsc.gz` package from an absolute file path. Returns an empty
    /// string on success, or the error message.
    #[func]
    fn load_package(&mut self, path: GString) -> GString {
        let path = path.to_string();
        let result = std::fs::read(&path)
            .map_err(|e| format!("cannot read {path}: {e}"))
            .and_then(|bytes| scenario::decode_gzip(&bytes).map_err(|e| e.to_string()));
        match result {
            Ok(scenario) => {
                self.scenario = Some(scenario);
                GString::new()
            }
            Err(message) => GString::from(&message),
        }
    }

    #[func]
    fn scenario_name(&self) -> GString {
        self.scenario
            .as_ref()
            .map(|s| GString::from(&s.info.name))
            .unwrap_or_default()
    }

    #[func]
    fn attribution(&self) -> GString {
        self.scenario
            .as_ref()
            .and_then(|s| s.info.attribution.as_deref())
            .map(GString::from)
            .unwrap_or_default()
    }

    #[func]
    fn grid_width(&self) -> i32 {
        self.scenario.as_ref().map_or(0, |s| s.grid.width as i32)
    }

    #[func]
    fn grid_height(&self) -> i32 {
        self.scenario.as_ref().map_or(0, |s| s.grid.height as i32)
    }

    /// One pixel per cell, row 0 = north. R and G hold the controlling
    /// country id (low and high byte), B is 255 on land, A is 255.
    #[func]
    fn owner_image(&self) -> Option<Gd<Image>> {
        let s = self.scenario.as_ref()?;
        let (width, height) = (s.grid.width as usize, s.grid.height as usize);
        let mut data = vec![0u8; width * height * 4];
        for y in 0..height {
            // The grid stores row 0 at latitude -90; images start at the top.
            let source = (height - 1 - y) * width;
            let target = y * width * 4;
            for x in 0..width {
                let [lo, hi] = s.control[source + x].to_le_bytes();
                let px = &mut data[target + x * 4..target + x * 4 + 4];
                px.copy_from_slice(&[lo, hi, if s.land[source + x] != 0 { 255 } else { 0 }, 255]);
            }
        }
        Image::create_from_data(
            width as i32,
            height as i32,
            false,
            Format::RGBA8,
            &PackedByteArray::from(data),
        )
    }

    /// Country colors by id: pixel `id` holds that country's color.
    #[func]
    fn palette_image(&self) -> Option<Gd<Image>> {
        let s = self.scenario.as_ref()?;
        let max_id = s
            .countries
            .iter()
            .flatten()
            .map(|c| c.id)
            .max()
            .unwrap_or(0) as usize;
        let mut data = vec![0u8; (max_id + 1) * 4];
        for country in s.countries.iter().flatten() {
            let rgba = country
                .color
                .as_deref()
                .and_then(parse_css_color)
                .unwrap_or([128, 128, 128, 255]);
            let at = country.id as usize * 4;
            // Map colors are drawn opaque; some scenarios store 50% alpha.
            data[at..at + 4].copy_from_slice(&[rgba[0], rgba[1], rgba[2], 255]);
        }
        Image::create_from_data(
            max_id as i32 + 1,
            1,
            false,
            Format::RGBA8,
            &PackedByteArray::from(data),
        )
    }

    #[func]
    fn country_name(&self, id: i32) -> GString {
        self.scenario
            .as_ref()
            .and_then(|s| s.countries.iter().flatten().find(|c| i32::from(c.id) == id))
            .map(|c| GString::from(&c.name))
            .unwrap_or_default()
    }

    #[func]
    fn country_count(&self) -> i32 {
        self.scenario
            .as_ref()
            .map_or(0, |s| s.countries.iter().flatten().count() as i32)
    }

    #[func]
    fn city_count(&self) -> i32 {
        self.scenario.as_ref().map_or(0, |s| s.cities.len() as i32)
    }
}

/// Parse `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()` and `hsla()`.
fn parse_css_color(text: &str) -> Option<[u8; 4]> {
    let text = text.trim();
    if let Some(hex) = text.strip_prefix('#') {
        let digits: Vec<u8> = hex
            .chars()
            .map(|c| c.to_digit(16).map(|d| d as u8))
            .collect::<Option<_>>()?;
        return match digits.as_slice() {
            [r, g, b] => Some([r * 17, g * 17, b * 17, 255]),
            [r1, r2, g1, g2, b1, b2] => Some([r1 * 16 + r2, g1 * 16 + g2, b1 * 16 + b2, 255]),
            _ => None,
        };
    }
    let (function, inner) = text.strip_suffix(')')?.split_once('(')?;
    let parts: Vec<f64> = inner
        .split(',')
        .map(|p| p.trim().trim_end_matches('%').parse().ok())
        .collect::<Option<_>>()?;
    let channel = |v: f64| v.round().clamp(0.0, 255.0) as u8;
    let (rgb, alpha) = match (function.trim(), parts.as_slice()) {
        ("rgb" | "rgba", [r, g, b, rest @ ..]) => ([*r, *g, *b], rest),
        ("hsl" | "hsla", [h, s, l, rest @ ..]) => (hsl_to_rgb(*h, s / 100.0, l / 100.0), rest),
        _ => return None,
    };
    let alpha = match alpha {
        [] => 1.0,
        [a] => *a,
        _ => return None,
    };
    Some([
        channel(rgb[0]),
        channel(rgb[1]),
        channel(rgb[2]),
        channel(alpha * 255.0),
    ])
}

/// CSS Color 4 HSL to RGB, channels 0..=255 (not yet rounded).
fn hsl_to_rgb(hue: f64, saturation: f64, lightness: f64) -> [f64; 3] {
    let a = saturation * lightness.min(1.0 - lightness);
    let f = |n: f64| {
        let k = (n + hue / 30.0).rem_euclid(12.0);
        (lightness - a * (k - 3.0).min(9.0 - k).clamp(-1.0, 1.0)) * 255.0
    };
    [f(0.0), f(8.0), f(4.0)]
}

#[cfg(test)]
mod tests {
    use super::parse_css_color;

    #[test]
    fn parses_the_color_forms_scenarios_use() {
        assert_eq!(parse_css_color("#cf5050"), Some([0xcf, 0x50, 0x50, 255]));
        assert_eq!(parse_css_color("#fff"), Some([255, 255, 255, 255]));
        assert_eq!(
            parse_css_color("rgba(46, 134, 222, 1)"),
            Some([46, 134, 222, 255])
        );
        assert_eq!(
            parse_css_color("rgba(217, 48, 48, 0.5)"),
            Some([217, 48, 48, 128])
        );
        assert_eq!(parse_css_color("rgb(1,2,3)"), Some([1, 2, 3, 255]));
        // Peru in the 2026 scenario; browsers draw it as rgb(229, 87, 106).
        assert_eq!(
            parse_css_color("hsla(352, 73%, 62%, 1)"),
            Some([229, 87, 106, 255])
        );
        assert_eq!(
            parse_css_color("hsl(120, 100%, 25%)"),
            Some([0, 128, 0, 255])
        );
        assert_eq!(
            parse_css_color("hsla(0, 0%, 100%, 0.5)"),
            Some([255, 255, 255, 128])
        );
        assert_eq!(parse_css_color("red"), None);
        assert_eq!(parse_css_color("#12345"), None);
    }
}
