//! Legacy noise "provinces" from the old game.

use super::Grid;

/// The old game's "provinces": a hash of a warped noise lattice per country,
/// not real borders. Ported bit for bit from `getProvinceId` in
/// `src/scenario-codec.js`. `libm` uses the same fdlibm algorithms as V8, so
/// `sin`/`cos` give identical bits on every platform.
pub fn legacy_province_ids(control: &[u16], grid: &Grid) -> Vec<i32> {
    let width = grid.width as usize;
    control
        .iter()
        .enumerate()
        .map(|(index, &owner)| {
            if owner == 0 {
                return 0;
            }
            legacy_province_id(
                (index % width) as f64,
                (index / width) as f64,
                f64::from(owner),
                grid.res_deg,
            )
        })
        .collect()
}

fn legacy_province_id(x: f64, y: f64, country: f64, res: f64) -> i32 {
    use libm::{cos, floor, sin};
    let lat = y * res - 90.0;
    let lng = x * res - 180.0;
    let nx = lng * 0.65;
    let ny = lat * 0.65;
    let w1 = sin(nx * 0.8 + ny * 0.6 + country * 0.1) * 1.2;
    let w2 = cos(nx * 0.5 - ny * 0.9 + country * 0.2) * 1.1;
    let noise = sin((nx + w1) * 2.3) * 0.5
        + sin((ny + w2) * 1.9) * 0.5
        + sin((nx + ny) * 1.4 + country) * 0.3
        + cos(nx * 3.1 - ny * 2.7) * 0.2;
    let cell_x = floor(nx + w1 + noise);
    let cell_y = floor(ny + w2 + noise);
    let h1 = (cell_x * 73_856_093.0).abs();
    let h2 = (cell_y * 19_349_663.0).abs();
    let h3 = (country * 83_492_791.0).abs();
    // JS `^` converts each operand with ToInt32 (wrap modulo 2^32).
    (to_int32(h1) ^ to_int32(h2) ^ to_int32(h3)) as i32
}

fn to_int32(value: f64) -> u32 {
    value as i64 as u32
}
