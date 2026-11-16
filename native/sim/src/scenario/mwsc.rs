//! The MWSC v3 byte format: header, varints, map runs, saved territory and
//! flag blobs. Mirrors the reader in `src/scenario-codec.js`.

use std::fmt;

use serde_json::Value;

use super::SavedCells;

const MAGIC: &[u8; 4] = b"MWSC";
const VERSION: u8 = 3;
const HEADER_BYTES: usize = 32;

#[derive(Debug)]
pub enum DecodeError {
    Gzip(std::io::Error),
    NotMwsc,
    UnsupportedVersion(u8),
    Truncated(&'static str),
    BadVarint,
    Corrupt(&'static str),
    Metadata(serde_json::Error),
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Gzip(e) => write!(f, "cannot decompress scenario: {e}"),
            Self::NotMwsc => write!(f, "not an MWSC scenario package"),
            Self::UnsupportedVersion(v) => write!(f, "unsupported MWSC version {v}"),
            Self::Truncated(what) => write!(f, "truncated MWSC package: {what}"),
            Self::BadVarint => write!(f, "invalid or truncated varint"),
            Self::Corrupt(what) => write!(f, "corrupt MWSC package: {what}"),
            Self::Metadata(e) => write!(f, "invalid scenario metadata: {e}"),
        }
    }
}

impl std::error::Error for DecodeError {}

/// The fixed 32-byte header, exactly as stored.
#[derive(Debug, Clone, Copy)]
pub struct Header {
    pub version: u8,
    pub header_bytes: u16,
    pub metadata_bytes: u32,
    pub entry_count: u32,
    pub payload_bytes: u32,
    pub saved_bytes: u32,
    pub blob_bytes: u32,
    pub blob_count: u32,
}

pub(super) fn read_header(bytes: &[u8]) -> Result<Header, DecodeError> {
    if bytes.len() < HEADER_BYTES || &bytes[0..4] != MAGIC {
        return Err(DecodeError::NotMwsc);
    }
    let u16_at = |at: usize| u16::from_le_bytes([bytes[at], bytes[at + 1]]);
    let u32_at = |at: usize| u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap());
    let header = Header {
        version: bytes[4],
        header_bytes: u16_at(6),
        metadata_bytes: u32_at(8),
        entry_count: u32_at(12),
        payload_bytes: u32_at(16),
        saved_bytes: u32_at(20),
        blob_bytes: u32_at(24),
        blob_count: u32_at(28),
    };
    // Version 2 (no saved/blob sections) is only used by old JSON exports.
    if header.version != VERSION {
        return Err(DecodeError::UnsupportedVersion(header.version));
    }
    if (header.header_bytes as usize) < HEADER_BYTES {
        return Err(DecodeError::Truncated("header"));
    }
    Ok(header)
}

/// A cursor over varint-encoded data.
struct Varints<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl Varints<'_> {
    /// Unsigned LEB128, at most 5 bytes, wrapping to 32 bits like the JS reader.
    fn uint(&mut self) -> Result<u32, DecodeError> {
        let mut value: u32 = 0;
        let mut shift = 0;
        while self.offset < self.bytes.len() && shift <= 28 {
            let byte = self.bytes[self.offset];
            self.offset += 1;
            value |= u32::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Ok(value);
            }
            shift += 7;
        }
        Err(DecodeError::BadVarint)
    }

    /// Zigzag-encoded signed value.
    fn int(&mut self) -> Result<i64, DecodeError> {
        let zigzag = i64::from(self.uint()?);
        Ok(if zigzag & 1 == 1 {
            -((zigzag + 1) / 2)
        } else {
            zigzag / 2
        })
    }

    fn take(&mut self, len: usize) -> Result<&[u8], DecodeError> {
        let end = self
            .offset
            .checked_add(len)
            .filter(|&end| end <= self.bytes.len());
        let end = end.ok_or(DecodeError::Truncated("flag blob"))?;
        let slice = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(slice)
    }
}

/// Walk the map runs and call `visit(index, owner, biome)` for every land cell.
/// Returns the number of runs.
pub(super) fn read_runs(
    payload: &[u8],
    entry_count: u32,
    mut visit: impl FnMut(i64, u32, u32),
) -> Result<usize, DecodeError> {
    let mut cursor = Varints {
        bytes: payload,
        offset: 0,
    };
    let mut previous_start: i64 = 0;
    let mut entries: u64 = 0;
    let mut runs = 0;
    while cursor.offset < payload.len() {
        let start = previous_start + cursor.int()?;
        let length = cursor.uint()?;
        let owner = cursor.uint()?;
        let biome = cursor.uint()?;
        if length == 0 {
            return Err(DecodeError::Corrupt("run length cannot be zero"));
        }
        for j in 0..i64::from(length) {
            visit(start + j, owner, biome);
        }
        entries += u64::from(length);
        previous_start = start;
        runs += 1;
    }
    if entries != u64::from(entry_count) {
        return Err(DecodeError::Corrupt(
            "payload does not match its entry count",
        ));
    }
    Ok(runs)
}

/// Saved-territory section: `(metadata index, runs)` per record.
pub(super) fn read_saved_cells(
    bytes: &[u8],
    start: usize,
    meta: &Value,
) -> Result<Vec<(usize, SavedCells)>, DecodeError> {
    let mut cursor = Varints {
        bytes,
        offset: start,
    };
    let count = cursor.uint()?;
    let metadata = meta.get("metadata").and_then(Value::as_array);
    let mut records = Vec::new();
    for _ in 0..count {
        let index = cursor.uint()? as usize;
        let width = cursor.uint()?;
        let run_count = cursor.uint()?;
        let has_meta = metadata
            .and_then(|m| m.get(index))
            .is_some_and(|m| !m.is_null());
        if !has_meta || width == 0 {
            return Err(DecodeError::Corrupt("saved territory record"));
        }
        let mut runs = Vec::with_capacity(run_count as usize);
        let mut previous: i64 = 0;
        for _ in 0..run_count {
            let first = previous + cursor.int()?;
            let length = cursor.uint()?;
            if first < 0 || length == 0 {
                return Err(DecodeError::Corrupt("saved territory run"));
            }
            runs.push((first as u32, length));
            previous = first;
        }
        records.push((index, SavedCells { width, runs }));
    }
    if cursor.offset != bytes.len() {
        return Err(DecodeError::Corrupt("saved territory section length"));
    }
    Ok(records)
}

pub(super) fn read_flag_blobs(
    bytes: &[u8],
    start: usize,
    count: u32,
) -> Result<Vec<String>, DecodeError> {
    let mut cursor = Varints {
        bytes,
        offset: start,
    };
    let mut blobs = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let len = cursor.uint()? as usize;
        let text = cursor.take(len)?;
        blobs.push(String::from_utf8_lossy(text).into_owned());
    }
    if cursor.offset != bytes.len() {
        return Err(DecodeError::Corrupt("flag section length"));
    }
    Ok(blobs)
}

/// Put the deduplicated flag URLs back into each country's `*flagUrl` fields.
pub(super) fn restore_flag_urls(meta: &mut Value, blobs: &[String]) -> Result<(), DecodeError> {
    let Some(countries) = meta.get_mut("metadata").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for country in countries.iter_mut().filter_map(Value::as_object_mut) {
        let Some(Value::Object(refs)) = country.remove("_mwFlagBlobs") else {
            continue;
        };
        for (key, id) in refs {
            let blob = id
                .as_u64()
                .and_then(|id| blobs.get(id as usize))
                .ok_or(DecodeError::Corrupt("flag reference"))?;
            country.insert(key, Value::String(blob.clone()));
        }
    }
    Ok(())
}
