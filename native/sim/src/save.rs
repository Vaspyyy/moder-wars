//! Save games: `MWSAVE`, a little-endian format version, then the gzipped
//! world state (postcard encoding). The scenario itself is not stored; a save
//! remembers the scenario's fingerprint and only loads with that scenario.
//! Likewise a game that settles peace terms in regions only loads with the
//! same region map.

use std::fmt;
use std::io::{Read, Write};

use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;

use crate::regions::Regions;
use crate::scenario::Scenario;
use crate::world::World;

const MAGIC: &[u8; 6] = b"MWSAVE";
/// 2: divisions. 3: army groups. 4: economy. 5: peace offers. 6: the AI
/// (divisions remember a target out of reach). 7: peace terms in regions.
/// 8: war support. 9: war records (what the wars cost, the last
/// capitulation) and the tick each war began.
const VERSION: u16 = 9;

#[derive(Debug)]
pub enum SaveError {
    NotASave,
    UnsupportedVersion(u16),
    /// The save belongs to a different scenario (or a changed scenario file).
    WrongScenario,
    /// The game settles peace in regions, and no region map was given.
    NeedsRegions,
    /// The region map is not the one the game was saved with.
    WrongRegions,
    Corrupt(String),
}

impl fmt::Display for SaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotASave => write!(f, "not a Modern Wars save"),
            Self::UnsupportedVersion(v) => write!(f, "save format version {v} is not supported"),
            Self::WrongScenario => write!(f, "the save belongs to a different scenario"),
            Self::NeedsRegions => write!(f, "the save needs the region map it was made with"),
            Self::WrongRegions => write!(f, "the save was made with a different region map"),
            Self::Corrupt(why) => write!(f, "the save is damaged: {why}"),
        }
    }
}

impl std::error::Error for SaveError {}

pub fn save(world: &World) -> Vec<u8> {
    let body = postcard::to_allocvec(world).expect("the world always serializes");
    let mut out = Vec::with_capacity(body.len() / 8);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    // Fast compression: saving should never hitch the game.
    let mut gzip = GzEncoder::new(out, Compression::fast());
    gzip.write_all(&body)
        .expect("writing to memory cannot fail");
    gzip.finish().expect("writing to memory cannot fail")
}

/// A number that changes whenever anything saved in the world changes (an
/// order given, an hour gone by) and is the same for a loaded game as for
/// the one saved. The front end compares it with the one it kept at the
/// last save to know whether leaving would lose anything. Not stable
/// across versions of the game: compare only within one run.
pub fn fingerprint(world: &World) -> u64 {
    use std::hash::Hasher;
    let body = postcard::to_allocvec(world).expect("the world always serializes");
    // `DefaultHasher::new` uses fixed keys: the same bytes give the same
    // number every time within one build.
    let mut hasher = std::hash::DefaultHasher::new();
    hasher.write(&body);
    hasher.finish()
}

/// Load a save made on `scenario`. `regions` is needed when the game settles
/// peace terms in regions, and ignored otherwise.
pub fn load(
    bytes: &[u8],
    scenario: &Scenario,
    regions: Option<&Regions>,
) -> Result<World, SaveError> {
    if bytes.len() < MAGIC.len() + 2 || &bytes[..MAGIC.len()] != MAGIC {
        return Err(SaveError::NotASave);
    }
    let version = u16::from_le_bytes([bytes[6], bytes[7]]);
    if version != VERSION {
        return Err(SaveError::UnsupportedVersion(version));
    }
    let mut body = Vec::new();
    GzDecoder::new(&bytes[8..])
        .read_to_end(&mut body)
        .map_err(|e| SaveError::Corrupt(e.to_string()))?;
    let mut world: World =
        postcard::from_bytes(&body).map_err(|e| SaveError::Corrupt(e.to_string()))?;
    if world.scenario_fingerprint() != scenario.fingerprint {
        return Err(SaveError::WrongScenario);
    }
    if world.control().len() != scenario.grid.len() {
        return Err(SaveError::Corrupt(
            "control map size does not match the scenario".into(),
        ));
    }
    if world
        .divisions()
        .iter()
        .any(|d| d.cell as usize >= scenario.grid.len())
    {
        return Err(SaveError::Corrupt("a division stands off the map".into()));
    }
    if world
        .army_groups()
        .iter()
        .flat_map(|g| g.front.iter().chain(&g.arrow))
        .any(|&cell| cell as usize >= scenario.grid.len())
    {
        return Err(SaveError::Corrupt(
            "an army group's line leaves the map".into(),
        ));
    }
    world.attach(scenario);
    if let Some(fingerprint) = world.regions_fingerprint {
        let regions = regions.ok_or(SaveError::NeedsRegions)?;
        if regions.fingerprint() != fingerprint {
            return Err(SaveError::WrongRegions);
        }
        if world
            .ceded
            .keys()
            .any(|&region| usize::from(region) >= regions.list.len())
        {
            return Err(SaveError::Corrupt(
                "a handed-over region does not exist".into(),
            ));
        }
        world.attach_regions(regions);
    } else if !world.ceded.is_empty() {
        return Err(SaveError::Corrupt(
            "regions were handed over without a region map".into(),
        ));
    }
    Ok(world)
}
