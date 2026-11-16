//! Godot bridge for the Modern Wars simulation.
//!
//! Keep this crate thin: it converts `mw-sim` data into Godot types and
//! nothing else. Game rules belong in `mw-sim`, where they are tested without
//! an engine.

use godot::classes::image::Format;
use godot::classes::{IRefCounted, Image, RefCounted};
use godot::prelude::*;
use mw_sim::regions::{self, Region, Regions};
use mw_sim::scenario::{self, Grid, Scenario};

mod world;

struct ModernWarsExtension;

#[gdextension]
unsafe impl ExtensionLibrary for ModernWarsExtension {}

/// A loaded scenario, exposed to GDScript.
#[derive(GodotClass)]
#[class(base = RefCounted)]
pub struct MwScenario {
    scenario: Option<Scenario>,
    regions: Option<Regions>,
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for MwScenario {
    fn init(base: Base<RefCounted>) -> Self {
        Self {
            scenario: None,
            regions: None,
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
                self.regions = None;
                GString::new()
            }
            Err(message) => GString::from(&message),
        }
    }

    /// Lay the admin-1 region file (`regions.json.gz`, absolute path) over the
    /// loaded scenario. Returns an empty string on success, or the error.
    #[func]
    fn load_regions(&mut self, path: GString) -> GString {
        let Some(scenario) = self.scenario.as_ref() else {
            return GString::from("load a scenario first");
        };
        let path = path.to_string();
        let result = std::fs::read(&path)
            .map_err(|e| format!("cannot read {path}: {e}"))
            .and_then(|bytes| regions::build(&bytes, scenario).map_err(|e| e.to_string()));
        match result {
            Ok(regions) => {
                self.regions = Some(regions);
                GString::new()
            }
            Err(message) => GString::from(&message),
        }
    }

    /// One pixel per cell, row 0 = north. R and G hold the region number
    /// (index + 1; 0 = no region) as low and high byte.
    #[func]
    fn region_image(&self) -> Option<Gd<Image>> {
        let (s, r) = (self.scenario.as_ref()?, self.regions.as_ref()?);
        grid_image(&s.grid, Format::RG8, |cell| {
            r.cell_region[cell].to_le_bytes()
        })
    }

    /// Display name of region number `value` (as in `region_image`).
    #[func]
    fn region_name(&self, value: i32) -> GString {
        self.region(value)
            .map(|r| {
                GString::from(if r.names.en.is_empty() {
                    &r.id
                } else {
                    &r.names.en
                })
            })
            .unwrap_or_default()
    }

    /// The country that owns region number `value` by law (0 if none).
    #[func]
    fn region_home(&self, value: i32) -> i32 {
        self.region(value).map_or(0, |r| i32::from(r.home))
    }

    #[func]
    fn region_count(&self) -> i32 {
        self.regions
            .as_ref()
            .map_or(0, |r| r.list.iter().filter(|r| r.cells > 0).count() as i32)
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
        grid_image(&s.grid, Format::RGBA8, |cell| {
            let [lo, hi] = s.control[cell].to_le_bytes();
            [lo, hi, if s.land[cell] != 0 { 255 } else { 0 }, 255]
        })
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

    /// A country's id by its English name, or 0 if there is none.
    #[func]
    fn country_id(&self, name: GString) -> i32 {
        let name = name.to_string();
        self.scenario
            .as_ref()
            .and_then(|s| s.countries.iter().flatten().find(|c| c.name == name))
            .map_or(0, |c| i32::from(c.id))
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

impl MwScenario {
    fn region(&self, value: i32) -> Option<&Region> {
        let index = usize::try_from(value).ok()?.checked_sub(1)?;
        self.regions.as_ref()?.list.get(index)
    }
}

/// An image with one pixel per grid cell. The grid stores row 0 at latitude
/// -90; images start at the top, so rows are flipped.
fn grid_image<const N: usize>(
    grid: &Grid,
    format: Format,
    pixel: impl Fn(usize) -> [u8; N],
) -> Option<Gd<Image>> {
    let (width, height) = (grid.width as usize, grid.height as usize);
    let mut data = Vec::with_capacity(width * height * N);
    for y in (0..height).rev() {
        for x in 0..width {
            data.extend_from_slice(&pixel(y * width + x));
        }
    }
    Image::create_from_data(
        width as i32,
        height as i32,
        false,
        format,
        &PackedByteArray::from(data),
    )
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
