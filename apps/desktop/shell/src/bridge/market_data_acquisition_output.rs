// SPDX-License-Identifier: GPL-3.0-only

use super::{bridge_command_error, BridgeCommandError};
use crate::platform::resolve_desktop_data_dir;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(not(target_os = "macos"))]
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[cfg(not(target_os = "macos"))]
mod grant_store;
mod manifest_v3;
mod residue;
#[cfg(not(target_os = "macos"))]
use grant_store::{authorize_non_macos_folder, resolve_non_macos_folder};
use manifest_v3::validate_manifest_v3;
pub(crate) use residue::sweep_stale_acquisition_residue;
#[cfg(test)]
use residue::sweep_stale_acquisition_residue_in_destination;

#[cfg(target_os = "macos")]
use super::security_scoped_bookmarks::{
    authorize_security_scoped_acquisition_folder, create_security_scoped_read_bookmark_for_folder,
    resolve_security_scoped_acquisition_folder,
};

const MAX_PATH_CHARS: usize = 4_096;
const MAX_RELATIVE_PATH_CHARS: usize = 1_024;
const MAX_FILE_NAME_CHARS: usize = 255;
const MAX_OUTPUT_FOLDER_NAME_CHARS: usize = 128;
const MAX_JOB_ID_CHARS: usize = 128;
const MAX_GRANT_ID_CHARS: usize = 128;
const MAX_FILES: usize = 21;
const MAX_DATA_FILES: usize = 20;
const MAX_SINGLE_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SYMBOLS: usize = 20;
const COPY_BUFFER_BYTES: usize = 1024 * 1024;
const STAGING_DIRECTORY_NAME: &str = "market-data-acquisition";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const PAYLOAD_DIRECTORY_NAME: &str = "payload";
#[cfg(not(target_os = "macos"))]
const GRANT_STORE_FILE_NAME: &str = "market-data-acquisition-folder-grants.json";
const GRANT_ID_PREFIX: &str = "acquisition-grant-";
const OUTPUT_FOLDER_PREFIX: &str = "Zinuto-Data-";

static PARTIAL_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketDataAcquisitionFolderAuthorization {
    pub(crate) grant_id: String,
    pub(crate) display_path: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketDataAcquisitionCommitResult {
    pub(crate) final_path: String,
    pub(crate) source_folder_bookmark_id: Option<String>,
    pub(crate) copied_files: usize,
    pub(crate) copied_bytes: u64,
}

#[cfg(not(target_os = "macos"))]
#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcquisitionFolderGrantStore {
    records: Vec<AcquisitionFolderGrantRecord>,
}

// The non-macOS grant store is a read-modify-write file. Every load/mutate/
// save sequence runs under this lock so concurrent bridge commands cannot
// lose each other's records (SH-M2).
#[cfg(not(target_os = "macos"))]
fn grant_store_lock() -> &'static Mutex<()> {
    static GRANT_STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    GRANT_STORE_LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(not(target_os = "macos"))]
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcquisitionFolderGrantRecord {
    id: String,
    folder_path: String,
    updated_at_ms: u64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AcquisitionManifestV1 {
    schema_version: u32,
    job_id: String,
    connector_id: AcquisitionConnectorId,
    output_folder_name: String,
    created_at: String,
    request: AcquisitionManifestRequest,
    file_count: usize,
    total_bytes: u64,
    files: Vec<AcquisitionManifestFile>,
}

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum AcquisitionConnectorId {
    Akshare,
    Ccxt,
}

impl AcquisitionConnectorId {
    fn as_str(self) -> &'static str {
        match self {
            Self::Akshare => "akshare",
            Self::Ccxt => "ccxt",
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AcquisitionManifestRequest {
    market: AcquisitionMarket,
    timeframe: AcquisitionTimeframe,
    start_at: String,
    end_at: String,
    adjustment: Option<AcquisitionAdjustment>,
    exchange_id: Option<AcquisitionExchangeId>,
    symbols: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum AcquisitionMarket {
    AShare,
    CryptoSpot,
}

#[derive(Clone, Copy, serde::Deserialize)]
enum AcquisitionTimeframe {
    #[serde(rename = "1m")]
    OneMinute,
    #[serde(rename = "5m")]
    FiveMinutes,
    #[serde(rename = "1h")]
    OneHour,
    #[serde(rename = "1d")]
    OneDay,
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum AcquisitionAdjustment {
    None,
    Qfq,
    Hfq,
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum AcquisitionExchangeId {
    Binance,
    Okx,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AcquisitionManifestFile {
    relative_path: String,
    kind: AcquisitionManifestFileKind,
    bytes: u64,
    sha256: String,
}

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum AcquisitionManifestFileKind {
    Data,
    SourceNotice,
}

struct ValidatedAcquisitionManifest {
    output_folder_name: String,
    files: Vec<AcquisitionManifestFile>,
    total_bytes: u64,
}

struct ValidatedAcquisitionJob {
    payload_dir: PathBuf,
    output_folder_name: String,
    files: Vec<AcquisitionManifestFile>,
    total_bytes: u64,
}

struct PublishedAcquisitionOutput {
    final_path: PathBuf,
    source_folder_bookmark_id: Option<String>,
    copied_files: usize,
    copied_bytes: u64,
}

fn string_len(value: &str) -> usize {
    value.chars().count()
}

fn now_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_lower_hex_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn is_safe_job_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (8..=MAX_JOB_ID_CHARS).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn acquisition_job_token(value: &str) -> String {
    value
        .bytes()
        .filter(u8::is_ascii_alphanumeric)
        .take(8)
        .map(char::from)
        .collect()
}

fn is_safe_grant_id(value: &str) -> bool {
    let Some(suffix) = value.strip_prefix(GRANT_ID_PREFIX) else {
        return false;
    };
    (8..=96).contains(&suffix.len())
        && value.len() <= MAX_GRANT_ID_CHARS
        && suffix
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

#[cfg(not(target_os = "macos"))]
fn next_grant_id() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("{GRANT_ID_PREFIX}{stamp}-{}", std::process::id())
}

fn validate_text_field(value: &str, max_chars: usize) -> bool {
    !value.trim().is_empty()
        && string_len(value) <= max_chars
        && !value.chars().any(char::is_control)
}

fn validate_output_timestamp(value: &str) -> bool {
    if value.len() != 15 || value.as_bytes().get(8) != Some(&b'-') {
        return false;
    }
    if !value
        .as_bytes()
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 8 || byte.is_ascii_digit())
    {
        return false;
    }
    let parse = |range: std::ops::Range<usize>| value[range].parse::<u32>().ok();
    matches!(parse(4..6), Some(1..=12))
        && matches!(parse(6..8), Some(1..=31))
        && matches!(parse(9..11), Some(0..=23))
        && matches!(parse(11..13), Some(0..=59))
        && matches!(parse(13..15), Some(0..=59))
}

fn validate_output_folder_name(
    value: &str,
    connector_id: AcquisitionConnectorId,
    job_id: &str,
) -> bool {
    if string_len(value) > MAX_OUTPUT_FOLDER_NAME_CHARS
        || value.contains('/')
        || value.contains('\\')
        || value == "."
        || value == ".."
    {
        return false;
    }
    let expected_prefix = format!("{OUTPUT_FOLDER_PREFIX}{}-", connector_id.as_str());
    let Some(remainder) = value.strip_prefix(&expected_prefix) else {
        return false;
    };
    let expected_job_token = acquisition_job_token(job_id);
    if expected_job_token.len() != 8 {
        return false;
    }
    let expected_suffix = format!("-{expected_job_token}");
    let Some(timestamp) = remainder.strip_suffix(&expected_suffix) else {
        return false;
    };
    validate_output_timestamp(timestamp)
}

fn validate_manifest_request(
    connector_id: AcquisitionConnectorId,
    request: &AcquisitionManifestRequest,
) -> Result<(), String> {
    let source_matches = match connector_id {
        AcquisitionConnectorId::Akshare => {
            request.market == AcquisitionMarket::AShare
                && request.exchange_id.is_none()
                && request.adjustment.is_some()
        }
        AcquisitionConnectorId::Ccxt => {
            request.market == AcquisitionMarket::CryptoSpot
                && request.exchange_id.is_some()
                && request.adjustment.is_none()
        }
    };
    if !source_matches
        || !validate_text_field(&request.start_at, 64)
        || !validate_text_field(&request.end_at, 64)
        || request.symbols.is_empty()
        || request.symbols.len() > MAX_SYMBOLS
        || request
            .symbols
            .iter()
            .any(|symbol| !validate_text_field(symbol, 128))
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    let _ = request.timeframe;
    Ok(())
}

fn validate_relative_file_path(value: &str) -> bool {
    if value.is_empty()
        || string_len(value) > MAX_RELATIVE_PATH_CHARS
        || string_len(value) > MAX_FILE_NAME_CHARS
        || value.contains('/')
        || value.contains('\\')
    {
        return false;
    }
    let mut components = Path::new(value).components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

fn validate_manifest_file_list(
    file_count: usize,
    total_bytes: u64,
    files: &[AcquisitionManifestFile],
) -> Result<(), String> {
    if file_count == 0
        || file_count > MAX_FILES
        || file_count != files.len()
        || total_bytes > MAX_TOTAL_BYTES
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    let mut paths = HashSet::with_capacity(files.len());
    let mut calculated_total_bytes = 0_u64;
    let mut data_files = 0_usize;
    let mut source_notices = 0_usize;
    for file in files {
        if !validate_relative_file_path(&file.relative_path)
            || !is_lower_hex_sha256(&file.sha256)
            || file.bytes == 0
            || file.bytes > MAX_SINGLE_FILE_BYTES
            || !paths.insert(file.relative_path.clone())
        {
            return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
        }
        match file.kind {
            AcquisitionManifestFileKind::Data => {
                if !file.relative_path.ends_with(".csv") {
                    return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
                }
                data_files += 1;
            }
            AcquisitionManifestFileKind::SourceNotice => {
                if file.relative_path != "SOURCE.md" {
                    return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
                }
                source_notices += 1;
            }
        }
        calculated_total_bytes = calculated_total_bytes
            .checked_add(file.bytes)
            .ok_or_else(|| "MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string())?;
    }
    if data_files == 0
        || data_files > MAX_DATA_FILES
        || source_notices != 1
        || calculated_total_bytes != total_bytes
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    Ok(())
}

fn validate_manifest_v1(
    raw_manifest: &[u8],
    expected_job_id: &str,
) -> Result<ValidatedAcquisitionManifest, String> {
    let manifest: AcquisitionManifestV1 = serde_json::from_slice(raw_manifest)
        .map_err(|_| "MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string())?;
    if manifest.schema_version != 1
        || manifest.job_id != expected_job_id
        || !validate_output_folder_name(
            &manifest.output_folder_name,
            manifest.connector_id,
            expected_job_id,
        )
        || !validate_text_field(&manifest.created_at, 64)
    {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    validate_manifest_request(manifest.connector_id, &manifest.request)?;
    validate_manifest_file_list(manifest.file_count, manifest.total_bytes, &manifest.files)?;
    Ok(ValidatedAcquisitionManifest {
        output_folder_name: manifest.output_folder_name,
        files: manifest.files,
        total_bytes: manifest.total_bytes,
    })
}

fn manifest_schema_version(raw_manifest: &[u8]) -> Option<u32> {
    serde_json::from_slice::<serde_json::Value>(raw_manifest)
        .ok()
        .and_then(|value| {
            value
                .get("schemaVersion")
                .and_then(serde_json::Value::as_u64)
        })
        .and_then(|version| u32::try_from(version).ok())
}

fn validate_manifest(
    raw_manifest: &[u8],
    expected_job_id: &str,
) -> Result<ValidatedAcquisitionManifest, String> {
    match manifest_schema_version(raw_manifest) {
        Some(1) => validate_manifest_v1(raw_manifest, expected_job_id),
        Some(3) => validate_manifest_v3(raw_manifest, expected_job_id),
        _ => Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string()),
    }
}

fn require_real_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string());
    }
    Ok(())
}

fn require_regular_file(path: &Path) -> Result<fs::Metadata, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string());
    }
    Ok(metadata)
}

pub(super) fn verify_acquisition_destination_is_writable(path: &Path) -> Result<(), String> {
    let sequence = PARTIAL_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let probe_path = path.join(format!(
        ".zinuto-acquisition-write-probe-{}-{}-{sequence}",
        std::process::id(),
        now_epoch_millis(),
    ));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut probe = options
            .open(&probe_path)
            .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
        probe
            .write_all(b"zinuto-market-data-acquisition-write-probe")
            .and_then(|_| probe.sync_all())
            .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
        drop(probe);
        fs::remove_file(&probe_path)
            .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&probe_path);
    }
    result
}

fn load_and_validate_job(
    desktop_data_dir: &Path,
    job_id: &str,
    expected_manifest_sha256: &str,
) -> Result<ValidatedAcquisitionJob, String> {
    if !is_safe_job_id(job_id) || !is_lower_hex_sha256(expected_manifest_sha256) {
        return Err("INVALID_PARAMS".to_string());
    }
    require_real_directory(desktop_data_dir)?;
    let canonical_data_dir = fs::canonicalize(desktop_data_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    let temp_dir = desktop_data_dir.join("temp");
    let staging_root = temp_dir.join(STAGING_DIRECTORY_NAME);
    let job_dir = staging_root.join(job_id);
    let payload_dir = job_dir.join(PAYLOAD_DIRECTORY_NAME);
    for directory in [&temp_dir, &staging_root, &job_dir, &payload_dir] {
        require_real_directory(directory)?;
    }
    let canonical_staging_root = fs::canonicalize(&staging_root)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    let canonical_job_dir = fs::canonicalize(&job_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    let canonical_payload_dir = fs::canonicalize(&payload_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?;
    if !canonical_staging_root.starts_with(&canonical_data_dir)
        || !canonical_job_dir.starts_with(&canonical_staging_root)
        || !canonical_payload_dir.starts_with(&canonical_job_dir)
    {
        return Err("MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string());
    }

    let manifest_path = job_dir.join(MANIFEST_FILE_NAME);
    let manifest_metadata = require_regular_file(&manifest_path)?;
    if manifest_metadata.len() == 0 || manifest_metadata.len() > MAX_MANIFEST_BYTES {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string());
    }
    let raw_manifest = fs::read(&manifest_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_MANIFEST_INVALID".to_string())?;
    if sha256_hex(&raw_manifest) != expected_manifest_sha256 {
        return Err("MARKET_DATA_ACQUISITION_MANIFEST_HASH_MISMATCH".to_string());
    }
    let manifest = validate_manifest(&raw_manifest, job_id)?;

    let expected_paths: HashSet<&str> = manifest
        .files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect();
    let mut actual_paths = HashSet::new();
    for entry in fs::read_dir(&canonical_payload_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string())?
    {
        let entry = entry.map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string())?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string())?;
        if !validate_relative_file_path(&name) || !expected_paths.contains(name.as_str()) {
            return Err("MARKET_DATA_ACQUISITION_STAGING_UNEXPECTED_ENTRY".to_string());
        }
        require_regular_file(&entry.path())?;
        actual_paths.insert(name);
    }
    if actual_paths.len() != manifest.files.len() {
        return Err("MARKET_DATA_ACQUISITION_STAGING_MISSING".to_string());
    }

    Ok(ValidatedAcquisitionJob {
        payload_dir: canonical_payload_dir,
        output_folder_name: manifest.output_folder_name,
        files: manifest.files,
        total_bytes: manifest.total_bytes,
    })
}

#[cfg(unix)]
fn open_source_file(path: &Path) -> Result<File, String> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string())
}

#[cfg(not(unix))]
fn open_source_file(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string())
}

fn copy_and_verify_file(
    source_path: &Path,
    target_path: &Path,
    expected_bytes: u64,
    expected_sha256: &str,
) -> Result<u64, String> {
    let source_metadata = require_regular_file(source_path)?;
    if source_metadata.len() != expected_bytes || expected_bytes > MAX_SINGLE_FILE_BYTES {
        return Err("MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string());
    }
    let canonical_source = fs::canonicalize(source_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string())?;
    if canonical_source.parent() != source_path.parent() {
        return Err("MARKET_DATA_ACQUISITION_STAGING_UNSAFE".to_string());
    }

    let mut source = open_source_file(source_path)?;
    if !source
        .metadata()
        .map(|metadata| metadata.is_file() && metadata.len() == expected_bytes)
        .unwrap_or(false)
    {
        return Err("MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string());
    }
    let mut target = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_OUTPUT_WRITE_FAILED".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    let mut copied = 0_u64;
    loop {
        let count = source
            .read(&mut buffer)
            .map_err(|_| "MARKET_DATA_ACQUISITION_STAGING_READ_FAILED".to_string())?;
        if count == 0 {
            break;
        }
        copied = copied
            .checked_add(count as u64)
            .ok_or_else(|| "MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string())?;
        if copied > expected_bytes {
            return Err("MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string());
        }
        hasher.update(&buffer[..count]);
        target
            .write_all(&buffer[..count])
            .map_err(|_| "MARKET_DATA_ACQUISITION_OUTPUT_WRITE_FAILED".to_string())?;
    }
    if copied != expected_bytes || format!("{:x}", hasher.finalize()) != expected_sha256 {
        return Err("MARKET_DATA_ACQUISITION_FILE_HASH_MISMATCH".to_string());
    }
    target
        .sync_all()
        .map_err(|_| "MARKET_DATA_ACQUISITION_OUTPUT_WRITE_FAILED".to_string())?;
    Ok(copied)
}

fn next_partial_directory_name(job_id: &str) -> String {
    let sequence = PARTIAL_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!(
        ".zinuto-acquisition-{}-{}-{}.partial",
        &job_id[..8],
        now_epoch_millis(),
        sequence
    )
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "MARKET_DATA_ACQUISITION_OUTPUT_WRITE_FAILED".to_string())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn atomic_publish_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let source_path = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    let target_path = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    // SAFETY: Both C strings are NUL-terminated paths and remain alive for the call.
    let renamed = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            source_path.as_ptr(),
            libc::AT_FDCWD,
            target_path.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if renamed == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "linux")]
fn atomic_publish_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let source_path = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    let target_path = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    // SAFETY: Both C strings are NUL-terminated paths and remain alive for the call.
    let renamed = unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            source_path.as_ptr(),
            libc::AT_FDCWD,
            target_path.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if renamed == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn atomic_publish_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};

    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    // SAFETY: Both buffers are NUL-terminated UTF-16 paths and remain alive for the call.
    let moved = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn atomic_publish_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    if target.exists() {
        return Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists));
    }
    fs::rename(source, target)
}

fn publish_market_data_output<F>(
    desktop_data_dir: &Path,
    destination_dir: &Path,
    job_id: &str,
    manifest_sha256: &str,
    create_read_authorization: F,
) -> Result<PublishedAcquisitionOutput, String>
where
    F: FnOnce(&Path) -> Result<Option<String>, String>,
{
    let validated_job = load_and_validate_job(desktop_data_dir, job_id, manifest_sha256)?;
    require_real_directory(destination_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    let canonical_destination = fs::canonicalize(destination_dir)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    if string_len(&canonical_destination.to_string_lossy()) > MAX_PATH_CHARS {
        return Err("MARKET_DATA_ACQUISITION_DESTINATION_PATH_TOO_LONG".to_string());
    }

    let final_path = canonical_destination.join(&validated_job.output_folder_name);
    if string_len(&final_path.to_string_lossy()) > MAX_PATH_CHARS {
        return Err("MARKET_DATA_ACQUISITION_DESTINATION_PATH_TOO_LONG".to_string());
    }
    if final_path.exists() {
        return Err("MARKET_DATA_ACQUISITION_OUTPUT_ALREADY_EXISTS".to_string());
    }
    let partial_path = canonical_destination.join(next_partial_directory_name(job_id));
    fs::create_dir(&partial_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_OUTPUT_WRITE_FAILED".to_string())?;

    let publish_result = (|| {
        let mut copied_bytes = 0_u64;
        for file in &validated_job.files {
            let source_path = validated_job.payload_dir.join(&file.relative_path);
            let target_path = partial_path.join(&file.relative_path);
            let bytes = copy_and_verify_file(&source_path, &target_path, file.bytes, &file.sha256)?;
            copied_bytes = copied_bytes
                .checked_add(bytes)
                .ok_or_else(|| "MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string())?;
        }
        if copied_bytes != validated_job.total_bytes {
            return Err("MARKET_DATA_ACQUISITION_FILE_SIZE_MISMATCH".to_string());
        }
        sync_directory(&partial_path)?;
        // Create the read grant while the directory is still hidden. Security-scoped bookmarks
        // follow the same-volume rename, and a bookmark failure therefore cannot expose a final
        // directory that the command reports as unsuccessful.
        let source_folder_bookmark_id = create_read_authorization(&partial_path)?;
        if let Err(error) = atomic_publish_directory(&partial_path, &final_path) {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                return Err("MARKET_DATA_ACQUISITION_OUTPUT_ALREADY_EXISTS".to_string());
            }
            return Err("MARKET_DATA_ACQUISITION_OUTPUT_COMMIT_FAILED".to_string());
        }
        let _ = sync_directory(&canonical_destination);
        Ok(PublishedAcquisitionOutput {
            final_path,
            source_folder_bookmark_id,
            copied_files: validated_job.files.len(),
            copied_bytes,
        })
    })();

    if publish_result.is_err() {
        let _ = fs::remove_dir_all(&partial_path);
    }
    publish_result
}

fn authorize_market_data_acquisition_folder_blocking(
    app: &AppHandle,
    folder_path: String,
    existing_grant_id: Option<String>,
) -> Result<MarketDataAcquisitionFolderAuthorization, BridgeCommandError> {
    if folder_path.is_empty() || string_len(&folder_path) > MAX_PATH_CHARS {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    // The authorize entry already runs is_safe_grant_id on any caller-supplied
    // existingGrantId before either platform branch below; a fresh grant id is
    // always generated internally (next_acquisition_grant_id) and never accepts
    // caller-controlled bytes, so no additional grant-id validation is needed
    // in the platform authorization paths.
    let normalized_existing_grant_id = existing_grant_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if normalized_existing_grant_id
        .map(|value| !is_safe_grant_id(value))
        .unwrap_or(false)
    {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    #[cfg(target_os = "macos")]
    {
        let authorized = authorize_security_scoped_acquisition_folder(
            app,
            &folder_path,
            normalized_existing_grant_id,
        )
        .map_err(|code| bridge_command_error(&code))?;
        Ok(MarketDataAcquisitionFolderAuthorization {
            grant_id: authorized.grant_id,
            display_path: authorized.display_path,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let desktop_data_dir = resolve_desktop_data_dir(app).ok_or_else(|| {
            bridge_command_error("MARKET_DATA_ACQUISITION_GRANT_STORE_UNAVAILABLE")
        })?;
        authorize_non_macos_folder(
            &desktop_data_dir,
            &folder_path,
            normalized_existing_grant_id,
        )
        .map_err(|code| bridge_command_error(&code))
    }
}

fn commit_market_data_acquisition_output_blocking(
    app: &AppHandle,
    grant_id: String,
    job_id: String,
    manifest_sha256: String,
) -> Result<MarketDataAcquisitionCommitResult, BridgeCommandError> {
    if !is_safe_grant_id(&grant_id)
        || !is_safe_job_id(&job_id)
        || !is_lower_hex_sha256(&manifest_sha256)
    {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    let desktop_data_dir = resolve_desktop_data_dir(app)
        .ok_or_else(|| bridge_command_error("MARKET_DATA_ACQUISITION_STAGING_MISSING"))?;

    #[cfg(target_os = "macos")]
    {
        let destination_scope = resolve_security_scoped_acquisition_folder(app, &grant_id)
            .map_err(|code| bridge_command_error(&code))?;
        let published = publish_market_data_output(
            &desktop_data_dir,
            &destination_scope.destination_dir,
            &job_id,
            &manifest_sha256,
            |final_path| create_security_scoped_read_bookmark_for_folder(app, final_path).map(Some),
        )
        .map_err(|code| bridge_command_error(&code))?;
        Ok(MarketDataAcquisitionCommitResult {
            final_path: published.final_path.to_string_lossy().to_string(),
            source_folder_bookmark_id: published.source_folder_bookmark_id,
            copied_files: published.copied_files,
            copied_bytes: published.copied_bytes,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let destination_dir = resolve_non_macos_folder(&desktop_data_dir, &grant_id)
            .map_err(|code| bridge_command_error(&code))?;
        let published = publish_market_data_output(
            &desktop_data_dir,
            &destination_dir,
            &job_id,
            &manifest_sha256,
            |_final_path| Ok(None),
        )
        .map_err(|code| bridge_command_error(&code))?;
        Ok(MarketDataAcquisitionCommitResult {
            final_path: published.final_path.to_string_lossy().to_string(),
            source_folder_bookmark_id: published.source_folder_bookmark_id,
            copied_files: published.copied_files,
            copied_bytes: published.copied_bytes,
        })
    }
}

pub(crate) async fn authorize_market_data_acquisition_folder(
    app: AppHandle,
    folder_path: String,
    existing_grant_id: Option<String>,
) -> Result<MarketDataAcquisitionFolderAuthorization, BridgeCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        authorize_market_data_acquisition_folder_blocking(&app, folder_path, existing_grant_id)
    })
    .await
    .map_err(|_| bridge_command_error("MARKET_DATA_ACQUISITION_AUTHORIZATION_BRIDGE_FAILED"))?
}

pub(crate) async fn commit_market_data_acquisition_output(
    app: AppHandle,
    grant_id: String,
    job_id: String,
    manifest_sha256: String,
) -> Result<MarketDataAcquisitionCommitResult, BridgeCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_market_data_acquisition_output_blocking(&app, grant_id, job_id, manifest_sha256)
    })
    .await
    .map_err(|_| bridge_command_error("MARKET_DATA_ACQUISITION_COMMIT_BRIDGE_FAILED"))?
}

#[cfg(test)]
mod tests;
