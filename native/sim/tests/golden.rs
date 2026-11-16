//! Golden tests: the Rust scenario reader must give exactly the answers the
//! JavaScript game gives for the same scenario package.
//!
//! The expected answers live in `native/fixtures/golden/*.json` and come from
//! `node scripts/export-native-golden.mjs` (run from the repo root).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use mw_sim::scenario::{self, Scenario};
use serde_json::Value;
use sha2::{Digest, Sha256};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

struct Case {
    golden: Value,
    gzip: Vec<u8>,
    scenario: Scenario,
}

/// Decode each scenario once and share it between the tests.
fn case(name: &str) -> &'static Case {
    static WORLD: OnceLock<Case> = OnceLock::new();
    static UKRAINE: OnceLock<Case> = OnceLock::new();
    let cell = match name {
        "world-map-2026-v3" => &WORLD,
        "ukraine-2023-v3" => &UKRAINE,
        other => panic!("no golden case named {other}"),
    };
    cell.get_or_init(|| {
        let root = repo_root();
        let golden_path = root.join(format!("native/fixtures/golden/{name}.json"));
        let golden: Value =
            serde_json::from_slice(&std::fs::read(&golden_path).expect("read golden file"))
                .expect("parse golden file");
        let file = golden["file"]
            .as_str()
            .expect("golden names its scenario file");
        let gzip = std::fs::read(root.join(file)).expect("read scenario package");
        let scenario = scenario::decode_gzip(&gzip).expect("decode scenario package");
        Case {
            golden,
            gzip,
            scenario,
        }
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn le_bytes_u16(values: &[u16]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn le_bytes_i32(values: &[i32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn count_values<T: Copy + Into<u64>>(values: &[T]) -> BTreeMap<u64, u64> {
    let mut counts = BTreeMap::new();
    for &v in values {
        let v: u64 = v.into();
        if v != 0 {
            *counts.entry(v).or_insert(0) += 1;
        }
    }
    counts
}

fn golden_counts(value: &Value) -> BTreeMap<u64, u64> {
    value
        .as_object()
        .expect("counts object")
        .iter()
        .map(|(k, v)| (k.parse().unwrap(), v.as_u64().unwrap()))
        .collect()
}

fn opt_str(value: &Value) -> Option<&str> {
    value.as_str()
}

macro_rules! golden_tests {
    ($module:ident, $name:literal) => {
        mod $module {
            use super::*;

            fn c() -> &'static Case {
                case($name)
            }

            #[test]
            fn golden_file_matches_the_package() {
                let c = c();
                assert_eq!(
                    sha256_hex(&c.gzip),
                    c.golden["sha256Gzip"].as_str().unwrap(),
                    "the scenario package changed: rerun scripts/export-native-golden.mjs"
                );
            }

            #[test]
            fn header() {
                let h = &c().scenario.header;
                let g = &c().golden["header"];
                assert_eq!(h.version as u64, g["version"].as_u64().unwrap());
                assert_eq!(h.header_bytes as u64, g["headerBytes"].as_u64().unwrap());
                assert_eq!(
                    h.metadata_bytes as u64,
                    g["metadataBytes"].as_u64().unwrap()
                );
                assert_eq!(h.entry_count as u64, g["entryCount"].as_u64().unwrap());
                assert_eq!(h.payload_bytes as u64, g["payloadBytes"].as_u64().unwrap());
                assert_eq!(h.saved_bytes as u64, g["savedBytes"].as_u64().unwrap());
                assert_eq!(h.blob_bytes as u64, g["blobBytes"].as_u64().unwrap());
                assert_eq!(h.blob_count as u64, g["blobCount"].as_u64().unwrap());
                assert_eq!(
                    c().scenario.run_count as u64,
                    c().golden["runs"].as_u64().unwrap()
                );
            }

            #[test]
            fn scenario_info_and_grid() {
                let s = &c().scenario;
                let g = &c().golden;
                assert_eq!(s.info.name, g["scenario"]["name"].as_str().unwrap());
                assert_eq!(s.info.map_res.as_deref(), opt_str(&g["scenario"]["mapRes"]));
                assert_eq!(s.grid.res_deg, g["scenario"]["gridRes"].as_f64().unwrap());
                assert_eq!(
                    s.info.start_date.as_deref(),
                    opt_str(&g["scenario"]["startDate"])
                );
                assert_eq!(
                    s.info.sovereignty_base.as_deref(),
                    opt_str(&g["scenario"]["sovereigntyBase"])
                );
                assert_eq!(
                    s.info.attribution.as_deref(),
                    opt_str(&g["scenario"]["attribution"])
                );
                assert_eq!(s.grid.width as u64, g["grid"]["width"].as_u64().unwrap());
                assert_eq!(s.grid.height as u64, g["grid"]["height"].as_u64().unwrap());
                assert_eq!(s.grid.len() as u64, g["grid"]["length"].as_u64().unwrap());

                let theater = &g["scenario"]["theater"];
                match &s.info.theater {
                    None => assert!(theater.is_null()),
                    Some(t) => {
                        assert_eq!(t.id, theater["id"].as_str().unwrap());
                        let bounds: Vec<f64> = theater["bounds"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|v| v.as_f64().unwrap())
                            .collect();
                        assert_eq!(t.bounds.to_vec(), bounds);
                        let ids: Vec<u64> = theater["countryIds"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|v| v.as_u64().unwrap())
                            .collect();
                        assert_eq!(
                            t.country_ids.iter().map(|&v| v as u64).collect::<Vec<_>>(),
                            ids
                        );
                    }
                }
            }

            #[test]
            fn cell_counts_per_owner() {
                let s = &c().scenario;
                let g = &c().golden;
                let land: u64 = s.land.iter().map(|&v| v as u64).sum();
                assert_eq!(land, g["landCells"].as_u64().unwrap());
                assert_eq!(count_values(&s.control), golden_counts(&g["controlCells"]));
                assert_eq!(count_values(&s.de_jure), golden_counts(&g["deJureCells"]));
                assert_eq!(count_values(&s.biome), golden_counts(&g["biomeCells"]));
            }

            #[test]
            fn layer_hashes() {
                let s = &c().scenario;
                let layers = &c().golden["layers"];
                assert_eq!(
                    sha256_hex(&le_bytes_u16(&s.control)),
                    layers["worldControl"]["sha256"].as_str().unwrap()
                );
                assert_eq!(
                    sha256_hex(&le_bytes_u16(&s.de_jure)),
                    layers["deJure"]["sha256"].as_str().unwrap()
                );
                assert_eq!(
                    sha256_hex(&s.land),
                    layers["land"]["sha256"].as_str().unwrap()
                );
                assert_eq!(
                    sha256_hex(&s.biome),
                    layers["biome"]["sha256"].as_str().unwrap()
                );
            }

            #[test]
            fn sampled_cells() {
                let s = &c().scenario;
                let provinces = scenario::legacy_province_ids(&s.control, &s.grid);
                for row in c().golden["samples"].as_array().unwrap() {
                    let r: Vec<i64> = row
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| v.as_i64().unwrap())
                        .collect();
                    let i = r[0] as usize;
                    let got = [
                        i as i64,
                        s.control[i] as i64,
                        s.de_jure[i] as i64,
                        s.land[i] as i64,
                        s.biome[i] as i64,
                        provinces[i] as i64,
                    ];
                    assert_eq!(
                        got.to_vec(),
                        r,
                        "cell {i} (control, deJure, land, biome, province)"
                    );
                }
            }

            #[test]
            fn sovereignty_and_occupation() {
                let s = &c().scenario;
                let g = &c().golden["sovereignty"];
                let overrides: Vec<(u64, u64)> = s
                    .sovereignty_overrides
                    .iter()
                    .map(|o| (o.owner_id as u64, o.cells.len() as u64))
                    .collect();
                let expected: Vec<(u64, u64)> = g["overrides"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|o| (o["ownerId"].as_u64().unwrap(), o["cells"].as_u64().unwrap()))
                    .collect();
                assert_eq!(overrides, expected);
                assert_eq!(s.sovereignty_writes as u64, g["writes"].as_u64().unwrap());

                let mut occupied: BTreeMap<String, u64> = BTreeMap::new();
                for (controller, sovereign) in s.control.iter().zip(&s.de_jure) {
                    if controller != sovereign {
                        *occupied
                            .entry(format!("{controller}>{sovereign}"))
                            .or_insert(0) += 1;
                    }
                }
                let expected: BTreeMap<String, u64> = g["occupation"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .map(|(k, v)| (k.clone(), v.as_u64().unwrap()))
                    .collect();
                assert_eq!(occupied, expected);
            }

            #[test]
            fn countries() {
                let s = &c().scenario;
                let expected = c().golden["countries"].as_array().unwrap();
                assert_eq!(s.countries.len(), expected.len());
                for (got, want) in s.countries.iter().zip(expected) {
                    let Some(got) = got else {
                        assert!(want.is_null());
                        continue;
                    };
                    let name = &got.name;
                    assert_eq!(got.id as u64, want["id"].as_u64().unwrap(), "{name}");
                    assert_eq!(got.name, want["name"].as_str().unwrap());
                    assert_eq!(got.iso2.as_deref(), opt_str(&want["iso2"]), "{name}");
                    assert_eq!(got.role.as_deref(), opt_str(&want["role"]), "{name}");
                    assert_eq!(got.color.as_deref(), opt_str(&want["color"]), "{name}");
                    assert_eq!(got.pop, want["pop"].as_f64(), "{name}");
                    assert_eq!(got.gdp, want["gdp"].as_f64(), "{name}");
                    assert_eq!(got.is_disputed, want["isDisputed"].as_bool(), "{name}");
                    assert_eq!(
                        got.releasable_by.map(u64::from),
                        want["releasableBy"].as_u64(),
                        "{name}"
                    );

                    let flag = &want["flag"];
                    match &got.flag_url {
                        None => assert!(flag.is_null(), "{name} lost its flag"),
                        Some(url) => {
                            assert_eq!(
                                sha256_hex(url.as_bytes()),
                                flag["sha256"].as_str().unwrap(),
                                "{name} flag"
                            );
                        }
                    }

                    let saved = &want["savedCells"];
                    match &got.saved_cells {
                        None => assert!(saved.is_null(), "{name} lost its saved cells"),
                        Some(cells) => {
                            assert_eq!(
                                cells.width as u64,
                                saved["width"].as_u64().unwrap(),
                                "{name}"
                            );
                            assert_eq!(
                                cells.runs.len() as u64,
                                saved["runs"].as_u64().unwrap(),
                                "{name}"
                            );
                            let total: u64 = cells.runs.iter().map(|&(_, len)| len as u64).sum();
                            assert_eq!(total, saved["cells"].as_u64().unwrap(), "{name}");
                            let first = cells.runs[0];
                            assert_eq!(
                                vec![first.0 as u64, first.1 as u64],
                                saved["first"]
                                    .as_array()
                                    .unwrap()
                                    .iter()
                                    .map(|v| v.as_u64().unwrap())
                                    .collect::<Vec<_>>(),
                                "{name}"
                            );
                        }
                    }
                }
            }

            #[test]
            fn cities() {
                let s = &c().scenario;
                let g = &c().golden["cities"];
                assert_eq!(s.cities.len() as u64, g["count"].as_u64().unwrap());
                assert_eq!(
                    s.cities.iter().filter(|c| c.is_capital).count() as u64,
                    g["capitals"].as_u64().unwrap()
                );
                let total_pop: f64 = s.cities.iter().map(|c| c.pop).sum();
                assert_eq!(total_pop, g["totalPop"].as_f64().unwrap());
                let largest = s
                    .cities
                    .iter()
                    .reduce(|best, city| if city.pop > best.pop { city } else { best })
                    .unwrap();
                for (got, want) in [
                    (s.cities.first().unwrap(), &g["first"]),
                    (s.cities.last().unwrap(), &g["last"]),
                    (largest, &g["largest"]),
                ] {
                    assert_eq!(got.id as u64, want["id"].as_u64().unwrap());
                    assert_eq!(got.name, want["name"].as_str().unwrap());
                    assert_eq!(got.lat, want["lat"].as_f64().unwrap(), "{}", got.name);
                    assert_eq!(got.lng, want["lng"].as_f64().unwrap(), "{}", got.name);
                    assert_eq!(
                        got.owner_id as u64,
                        want["ownerId"].as_u64().unwrap(),
                        "{}",
                        got.name
                    );
                    assert_eq!(
                        got.is_capital,
                        want["isCapital"].as_bool().unwrap(),
                        "{}",
                        got.name
                    );
                    assert_eq!(got.pop, want["pop"].as_f64().unwrap(), "{}", got.name);
                }
            }

            /// Legacy noise "provinces". Kept only while the rewrite decides
            /// whether the simulation needs them.
            #[test]
            fn legacy_provinces() {
                let s = &c().scenario;
                let provinces = scenario::legacy_province_ids(&s.control, &s.grid);
                let layer = &c().golden["layers"]["province"];
                let distinct: std::collections::HashSet<i32> = provinces.iter().copied().collect();
                assert_eq!(distinct.len() as u64, layer["distinct"].as_u64().unwrap());
                assert_eq!(
                    sha256_hex(&le_bytes_i32(&provinces)),
                    layer["sha256"].as_str().unwrap()
                );
            }

            #[test]
            #[ignore = "starting forces are not ported yet"]
            fn starting_personnel() {
                todo!("compare against golden countries[].startingPersonnel");
            }
        }
    };
}

golden_tests!(world_2026, "world-map-2026-v3");
golden_tests!(ukraine_2023, "ukraine-2023-v3");
