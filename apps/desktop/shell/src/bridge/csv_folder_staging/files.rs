// SPDX-License-Identifier: GPL-3.0-only

use super::cancellation::CsvFolderStagingCancellationToken;
use super::{
    CSV_STAGING_DIRECTORY_PREFIX, IMPORT_MAX_DEPTH, IMPORT_MAX_FILES, IMPORT_MAX_FILE_NAME_CHARS,
    IMPORT_MAX_PATH_CHARS, IMPORT_MAX_RELATIVE_PATH_CHARS, IMPORT_MAX_SINGLE_FILE_BYTES,
    IMPORT_MAX_TOTAL_BYTES,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;
use std::{fs, io};

mod optional_metadata;
#[cfg(test)]
use optional_metadata::{
    copy_optional_source_metadata_entry, discover_optional_source_metadata_snapshot,
    OPTIONAL_SOURCE_METADATA_MAX_BYTES,
};
use optional_metadata::{file_identity, open_regular_file_without_following_links, FileIdentity};

pub(super) fn copy_optional_source_metadata_snapshot(source_dir: &Path, staging_dir: &Path) {
    optional_metadata::copy_optional_source_metadata_snapshot(source_dir, staging_dir);
}

static CSV_STAGING_DIR_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const CANCELLABLE_COPY_CHUNK_BYTES: usize = 1024 * 1024;
const DIGEST_READ_CHUNK_BYTES: usize = 64 * 1024;

fn check_optional_cancellation(
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<(), String> {
    match cancellation {
        Some(cancellation) => cancellation.check(),
        None => Ok(()),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CsvFolderMetadataFile {
    pub(super) relative_path: String,
    pub(super) originalname: String,
    pub(super) size: u64,
    pub(super) mtime_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CsvFolderMetadataManifest {
    pub(super) files: Vec<CsvFolderMetadataFile>,
    pub(super) total_files: usize,
    pub(super) total_bytes: u64,
}

#[derive(Clone, Debug)]
pub(super) struct ImportFilePathEntry {
    pub(super) relative_path: String,
    pub(super) file_path: PathBuf,
    pub(super) size: u64,
    pub(super) modified: Option<SystemTime>,
}

pub(super) struct CollectedImportFiles {
    pub(super) files: Vec<ImportFilePathEntry>,
    pub(super) total_bytes: u64,
}

pub(super) struct ImportFileSnapshot {
    metadata: fs::Metadata,
    identity: FileIdentity,
}

impl ImportFileSnapshot {
    pub(super) fn len(&self) -> u64 {
        self.metadata.len()
    }

    pub(super) fn modified(&self) -> io::Result<SystemTime> {
        self.metadata.modified()
    }
}

fn open_import_file_snapshot(path: &Path) -> io::Result<ImportFileSnapshot> {
    let file = open_regular_file_without_following_links(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "import snapshot is not a regular file",
        ));
    }
    Ok(ImportFileSnapshot {
        metadata,
        identity: file_identity(&file)?,
    })
}

fn is_supported_import_file_name(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.trim();
            ext.eq_ignore_ascii_case("csv")
                || ext.eq_ignore_ascii_case("json")
                || ext.eq_ignore_ascii_case("xlsx")
                || ext.eq_ignore_ascii_case("parquet")
        })
        .unwrap_or(false)
}

pub(super) fn string_len(value: &str) -> usize {
    value.chars().count()
}

pub(super) fn import_limit_error(limit: &str, max: impl ToString) -> String {
    format!(
        "LOCAL_DATA_IMPORT_LIMIT_EXCEEDED:{}:{}",
        limit,
        max.to_string()
    )
}

fn validate_import_path_limits(
    absolute_path: &Path,
    relative_path: &str,
    file_name: &str,
    depth: usize,
) -> Result<(), String> {
    if string_len(&absolute_path.to_string_lossy()) > IMPORT_MAX_PATH_CHARS {
        return Err(import_limit_error("path", IMPORT_MAX_PATH_CHARS));
    }
    if string_len(relative_path) > IMPORT_MAX_RELATIVE_PATH_CHARS {
        return Err(import_limit_error(
            "relativePath",
            IMPORT_MAX_RELATIVE_PATH_CHARS,
        ));
    }
    if string_len(file_name) > IMPORT_MAX_FILE_NAME_CHARS {
        return Err(import_limit_error("fileName", IMPORT_MAX_FILE_NAME_CHARS));
    }
    if depth > IMPORT_MAX_DEPTH {
        return Err(import_limit_error("depth", IMPORT_MAX_DEPTH));
    }
    Ok(())
}

pub(super) fn read_regular_import_entry_metadata(
    path: &Path,
) -> Result<Option<fs::Metadata>, String> {
    let link_meta = fs::symlink_metadata(path).map_err(|_| "CSV_FILE_MISSING".to_string())?;
    if link_meta.file_type().is_symlink() {
        return Ok(None);
    }
    fs::metadata(path)
        .map(Some)
        .map_err(|_| "CSV_FILE_MISSING".to_string())
}

fn read_sorted_import_directory_paths(
    current_dir: &Path,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<Vec<PathBuf>, String> {
    check_optional_cancellation(cancellation)?;
    let directory = fs::read_dir(current_dir).map_err(|_| "CSV_FILE_MISSING".to_string())?;
    let mut entries = Vec::new();
    for entry in directory {
        check_optional_cancellation(cancellation)?;
        entries.push(entry.map_err(|_| "CSV_FILE_MISSING".to_string())?.path());
    }
    check_optional_cancellation(cancellation)?;
    entries.sort();
    Ok(entries)
}

pub(super) fn collect_supported_import_files_in_selected_folder<F>(
    root_dir: &Path,
    on_file_discovered: F,
) -> Result<CollectedImportFiles, String>
where
    F: FnMut(usize, u64),
{
    collect_supported_import_files_in_selected_folder_internal(root_dir, None, on_file_discovered)
}

pub(super) fn collect_supported_import_files_in_selected_folder_cancellable<F>(
    root_dir: &Path,
    cancellation: &CsvFolderStagingCancellationToken,
    on_file_discovered: F,
) -> Result<CollectedImportFiles, String>
where
    F: FnMut(usize, u64),
{
    collect_supported_import_files_in_selected_folder_internal(
        root_dir,
        Some(cancellation),
        on_file_discovered,
    )
}

fn collect_supported_import_files_in_selected_folder_internal<F>(
    root_dir: &Path,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
    mut on_file_discovered: F,
) -> Result<CollectedImportFiles, String>
where
    F: FnMut(usize, u64),
{
    fn visit_directory<F>(
        root_dir: &Path,
        current_dir: &Path,
        files: &mut Vec<ImportFilePathEntry>,
        total_bytes: &mut u64,
        depth: usize,
        cancellation: Option<&CsvFolderStagingCancellationToken>,
        on_file_discovered: &mut F,
    ) -> Result<(), String>
    where
        F: FnMut(usize, u64),
    {
        check_optional_cancellation(cancellation)?;
        if depth > IMPORT_MAX_DEPTH {
            return Err(import_limit_error("depth", IMPORT_MAX_DEPTH));
        }
        let entries = read_sorted_import_directory_paths(current_dir, cancellation)?;
        for entry_path in entries {
            check_optional_cancellation(cancellation)?;
            let relative_path = import_path_to_wire_relative(
                entry_path
                    .strip_prefix(root_dir)
                    .map_err(|_| "CSV_FILE_MISSING".to_string())?,
            )
            .ok_or_else(|| "CSV_FILE_MISSING".to_string())?;
            let file_name = entry_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default();
            validate_import_path_limits(&entry_path, &relative_path, &file_name, depth)?;
            let meta = match read_regular_import_entry_metadata(&entry_path)? {
                Some(value) => value,
                None => continue,
            };
            if meta.is_dir() {
                visit_directory(
                    root_dir,
                    &entry_path,
                    files,
                    total_bytes,
                    depth + 1,
                    cancellation,
                    on_file_discovered,
                )?;
                continue;
            }
            if !meta.is_file() || !is_supported_import_file_name(&entry_path) {
                continue;
            }
            if meta.len() > IMPORT_MAX_SINGLE_FILE_BYTES {
                return Err(import_limit_error(
                    "singleFileBytes",
                    IMPORT_MAX_SINGLE_FILE_BYTES,
                ));
            }
            if files.len() + 1 > IMPORT_MAX_FILES {
                return Err(import_limit_error("files", IMPORT_MAX_FILES));
            }
            *total_bytes = total_bytes.saturating_add(meta.len());
            if *total_bytes > IMPORT_MAX_TOTAL_BYTES {
                return Err(import_limit_error("totalBytes", IMPORT_MAX_TOTAL_BYTES));
            }
            files.push(ImportFilePathEntry {
                relative_path,
                file_path: entry_path,
                size: meta.len(),
                modified: meta.modified().ok(),
            });
            on_file_discovered(files.len(), *total_bytes);
            check_optional_cancellation(cancellation)?;
        }
        Ok(())
    }

    let mut files: Vec<ImportFilePathEntry> = Vec::new();
    let mut total_bytes = 0_u64;
    visit_directory(
        root_dir,
        root_dir,
        &mut files,
        &mut total_bytes,
        1,
        cancellation,
        &mut on_file_discovered,
    )?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(CollectedImportFiles { files, total_bytes })
}

pub(super) fn collect_supported_import_file_metadata_in_selected_folder(
    root_dir: &Path,
) -> Result<CsvFolderMetadataManifest, String> {
    collect_supported_import_file_metadata_in_selected_folder_internal(root_dir, None)
}

pub(super) fn collect_supported_import_file_metadata_in_selected_folder_cancellable(
    root_dir: &Path,
    cancellation: &CsvFolderStagingCancellationToken,
) -> Result<CsvFolderMetadataManifest, String> {
    collect_supported_import_file_metadata_in_selected_folder_internal(root_dir, Some(cancellation))
}

fn collect_supported_import_file_metadata_in_selected_folder_internal(
    root_dir: &Path,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<CsvFolderMetadataManifest, String> {
    fn build_metadata_file(
        relative_path: String,
        meta: &fs::Metadata,
        fingerprint: Option<String>,
    ) -> CsvFolderMetadataFile {
        CsvFolderMetadataFile {
            originalname: wire_relative_leaf_name(&relative_path),
            relative_path,
            size: meta.len(),
            mtime_ms: meta
                .modified()
                .ok()
                .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|value| value.as_millis() as u64)
                .unwrap_or(0),
            fingerprint,
        }
    }

    fn visit_directory(
        root_dir: &Path,
        current_dir: &Path,
        files: &mut Vec<CsvFolderMetadataFile>,
        total_bytes: &mut u64,
        depth: usize,
        cancellation: Option<&CsvFolderStagingCancellationToken>,
    ) -> Result<(), String> {
        check_optional_cancellation(cancellation)?;
        if depth > IMPORT_MAX_DEPTH {
            return Err(import_limit_error("depth", IMPORT_MAX_DEPTH));
        }
        let entries = read_sorted_import_directory_paths(current_dir, cancellation)?;
        for entry_path in entries {
            check_optional_cancellation(cancellation)?;
            let relative_path = import_path_to_wire_relative(
                entry_path
                    .strip_prefix(root_dir)
                    .map_err(|_| "CSV_FILE_MISSING".to_string())?,
            )
            .ok_or_else(|| "CSV_FILE_MISSING".to_string())?;
            let file_name = entry_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default();
            validate_import_path_limits(&entry_path, &relative_path, &file_name, depth)?;
            let meta = match read_regular_import_entry_metadata(&entry_path)? {
                Some(value) => value,
                None => continue,
            };
            if meta.is_dir() {
                visit_directory(
                    root_dir,
                    &entry_path,
                    files,
                    total_bytes,
                    depth + 1,
                    cancellation,
                )?;
                continue;
            }
            if !meta.is_file() || !is_supported_import_file_name(&entry_path) {
                continue;
            }
            let size = meta.len();
            if size > IMPORT_MAX_SINGLE_FILE_BYTES {
                return Err(import_limit_error(
                    "singleFileBytes",
                    IMPORT_MAX_SINGLE_FILE_BYTES,
                ));
            }
            if files.len() + 1 > IMPORT_MAX_FILES {
                return Err(import_limit_error("files", IMPORT_MAX_FILES));
            }
            *total_bytes = total_bytes.saturating_add(size);
            if *total_bytes > IMPORT_MAX_TOTAL_BYTES {
                return Err(import_limit_error("totalBytes", IMPORT_MAX_TOTAL_BYTES));
            }
            files.push(build_metadata_file(relative_path, &meta, None));
            check_optional_cancellation(cancellation)?;
        }
        Ok(())
    }

    let mut files: Vec<CsvFolderMetadataFile> = Vec::new();
    let mut total_bytes = 0_u64;
    visit_directory(
        root_dir,
        root_dir,
        &mut files,
        &mut total_bytes,
        1,
        cancellation,
    )?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(CsvFolderMetadataManifest {
        total_files: files.len(),
        files,
        total_bytes,
    })
}

fn import_path_to_wire_relative(relative_path: &Path) -> Option<String> {
    if relative_path.as_os_str().is_empty() || relative_path.is_absolute() {
        return None;
    }
    let mut wire_parts: Vec<String> = Vec::new();
    for component in relative_path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(value) => {
                let text = value.to_string_lossy().to_string();
                if text.is_empty() {
                    return None;
                }
                wire_parts.push(text);
            }
            _ => return None,
        }
    }
    if wire_parts.is_empty() {
        return None;
    }
    Some(wire_parts.join("/"))
}

pub(super) fn wire_relative_leaf_name(relative_path: &str) -> String {
    relative_path
        .rsplit('/')
        .next()
        .unwrap_or(relative_path)
        .to_string()
}

pub(super) fn normalize_selected_import_relative_path(relative_path: &str) -> Option<String> {
    let normalized_path = import_path_to_wire_relative(Path::new(relative_path))?;
    let normalized_parts: Vec<&str> = normalized_path.split('/').collect();
    if normalized_parts.len() > IMPORT_MAX_DEPTH {
        return None;
    }
    if string_len(&normalized_path) > IMPORT_MAX_RELATIVE_PATH_CHARS {
        return None;
    }
    if normalized_parts
        .iter()
        .any(|part| string_len(part) > IMPORT_MAX_FILE_NAME_CHARS)
    {
        return None;
    }
    Some(normalized_path)
}

fn import_digest_metadata_matches_snapshot(
    metadata: &fs::Metadata,
    snapshot: &ImportFileSnapshot,
) -> bool {
    if !metadata.is_file() || metadata.len() != snapshot.len() {
        return false;
    }
    match snapshot.modified().ok() {
        Some(expected) => metadata
            .modified()
            .map(|actual| actual == expected)
            .unwrap_or(false),
        None => true,
    }
}

pub(super) fn build_import_file_sha256(
    file_path: &Path,
    snapshot: &ImportFileSnapshot,
) -> Result<String, String> {
    build_import_file_sha256_internal(file_path, snapshot, None)
}

pub(super) fn build_import_file_sha256_cancellable(
    file_path: &Path,
    snapshot: &ImportFileSnapshot,
    cancellation: &CsvFolderStagingCancellationToken,
) -> Result<String, String> {
    build_import_file_sha256_internal(file_path, snapshot, Some(cancellation))
}

fn build_reader_sha256<R: Read>(
    reader: &mut R,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<(String, u64), String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; DIGEST_READ_CHUNK_BYTES];
    let mut bytes_read_total = 0_u64;
    loop {
        check_optional_cancellation(cancellation)?;
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|_| "CSV_FILE_IMPORT_FAILED".to_string())?;
        if bytes_read == 0 {
            break;
        }
        check_optional_cancellation(cancellation)?;
        bytes_read_total = bytes_read_total.saturating_add(bytes_read as u64);
        hasher.update(&buffer[..bytes_read]);
    }
    check_optional_cancellation(cancellation)?;
    Ok((format!("{:x}", hasher.finalize()), bytes_read_total))
}

fn build_import_file_sha256_internal(
    file_path: &Path,
    snapshot: &ImportFileSnapshot,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<String, String> {
    check_optional_cancellation(cancellation)?;
    let mut file = open_regular_file_without_following_links(file_path)
        .map_err(|_| "CSV_FILE_IMPORT_FAILED".to_string())?;
    let opened_metadata = file
        .metadata()
        .map_err(|_| "CSV_FILE_IMPORT_FAILED".to_string())?;
    if !import_digest_metadata_matches_snapshot(&opened_metadata, snapshot)
        || file_identity(&file)
            .map(|identity| identity != snapshot.identity)
            .unwrap_or(true)
    {
        return Err("CSV_FILE_IMPORT_FAILED".to_string());
    }
    let (digest, bytes_read_total) = build_reader_sha256(&mut file, cancellation)?;
    check_optional_cancellation(cancellation)?;
    let final_metadata = file
        .metadata()
        .map_err(|_| "CSV_FILE_IMPORT_FAILED".to_string())?;
    if bytes_read_total != snapshot.len()
        || !import_digest_metadata_matches_snapshot(&final_metadata, snapshot)
        || file_identity(&file)
            .map(|identity| identity != snapshot.identity)
            .unwrap_or(true)
    {
        return Err("CSV_FILE_IMPORT_FAILED".to_string());
    }
    check_optional_cancellation(cancellation)?;
    Ok(digest)
}

pub(super) fn collect_selected_import_files_in_selected_folder(
    root_dir: &Path,
    relative_paths: &[String],
) -> Result<Vec<(String, PathBuf, ImportFileSnapshot)>, String> {
    collect_selected_import_files_in_selected_folder_internal(root_dir, relative_paths, None)
}

pub(super) fn collect_selected_import_files_in_selected_folder_cancellable(
    root_dir: &Path,
    relative_paths: &[String],
    cancellation: &CsvFolderStagingCancellationToken,
) -> Result<Vec<(String, PathBuf, ImportFileSnapshot)>, String> {
    collect_selected_import_files_in_selected_folder_internal(
        root_dir,
        relative_paths,
        Some(cancellation),
    )
}

fn collect_selected_import_files_in_selected_folder_internal(
    root_dir: &Path,
    relative_paths: &[String],
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<Vec<(String, PathBuf, ImportFileSnapshot)>, String> {
    check_optional_cancellation(cancellation)?;
    let canonical_root = fs::canonicalize(root_dir).map_err(|_| "CSV_FILE_MISSING".to_string())?;
    let mut files: Vec<(String, PathBuf, ImportFileSnapshot)> = Vec::new();
    let mut seen_paths: HashMap<String, bool> = HashMap::new();
    let mut total_bytes = 0_u64;
    for relative_path in relative_paths {
        check_optional_cancellation(cancellation)?;
        let Some(normalized_relative_path) = normalize_selected_import_relative_path(relative_path)
        else {
            return Err("INVALID_PARAMS".to_string());
        };
        if seen_paths.contains_key(&normalized_relative_path) {
            continue;
        }
        let candidate_path = canonical_root.join(&normalized_relative_path);
        let candidate_link_meta =
            fs::symlink_metadata(&candidate_path).map_err(|_| "CSV_FILE_MISSING".to_string())?;
        if candidate_link_meta.file_type().is_symlink() {
            return Err("CSV_FILE_MISSING".to_string());
        }
        let canonical_candidate =
            fs::canonicalize(&candidate_path).map_err(|_| "CSV_FILE_MISSING".to_string())?;
        if canonical_candidate.strip_prefix(&canonical_root).is_err() {
            return Err("INVALID_PARAMS".to_string());
        }
        if !is_supported_import_file_name(&canonical_candidate) {
            return Err("CSV_FILENAME_INVALID".to_string());
        }
        let meta = open_import_file_snapshot(&canonical_candidate)
            .map_err(|_| "CSV_FILE_MISSING".to_string())?;
        validate_import_path_limits(
            &canonical_candidate,
            &normalized_relative_path,
            Path::new(&normalized_relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(""),
            normalized_relative_path
                .split('/')
                .filter(|part| !part.is_empty())
                .count(),
        )?;
        if meta.len() > IMPORT_MAX_SINGLE_FILE_BYTES {
            return Err(import_limit_error(
                "singleFileBytes",
                IMPORT_MAX_SINGLE_FILE_BYTES,
            ));
        }
        if files.len() + 1 > IMPORT_MAX_FILES {
            return Err(import_limit_error("files", IMPORT_MAX_FILES));
        }
        total_bytes = total_bytes.saturating_add(meta.len());
        if total_bytes > IMPORT_MAX_TOTAL_BYTES {
            return Err(import_limit_error("totalBytes", IMPORT_MAX_TOTAL_BYTES));
        }
        seen_paths.insert(normalized_relative_path.clone(), true);
        files.push((normalized_relative_path, canonical_candidate, meta));
        check_optional_cancellation(cancellation)?;
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

pub(super) fn create_csv_staging_dir(staging_root: &Path) -> Result<PathBuf, String> {
    for _ in 0..32 {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let sequence = CSV_STAGING_DIR_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = staging_root.join(format!(
            "{}{}-{}-{}",
            CSV_STAGING_DIRECTORY_PREFIX,
            stamp,
            std::process::id(),
            sequence
        ));
        match create_private_directory(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("CSV_STAGE_CREATE_FAILED".to_string()),
        }
    }
    Err("CSV_STAGE_CREATE_FAILED".to_string())
}

// Staging material holds copies of user-selected market data: create staging
// directories with 0o700 and staged files with 0o600 so other local users
// cannot read or follow the snapshot (SH-M6).
#[cfg(unix)]
fn create_private_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new().mode(0o700).create(path)
}

#[cfg(not(unix))]
fn create_private_directory(path: &Path) -> io::Result<()> {
    fs::create_dir(path)
}

pub(super) fn ensure_private_directory(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        return Ok(());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(path)
    }
    #[cfg(not(unix))]
    {
        fs::create_dir_all(path)
    }
}

fn create_private_target_file(path: &Path) -> io::Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

fn import_file_metadata_matches_snapshot(
    metadata: &fs::Metadata,
    source: &ImportFilePathEntry,
) -> bool {
    if !metadata.is_file() || metadata.len() != source.size {
        return false;
    }
    match source.modified {
        Some(expected) => metadata
            .modified()
            .map(|actual| actual == expected)
            .unwrap_or(false),
        None => true,
    }
}

pub(super) fn copy_import_file_snapshot(
    source: &ImportFilePathEntry,
    target_path: &Path,
) -> Result<u64, String> {
    copy_import_file_snapshot_internal(source, target_path, None)
}

pub(super) fn copy_import_file_snapshot_cancellable(
    source: &ImportFilePathEntry,
    target_path: &Path,
    cancellation: &CsvFolderStagingCancellationToken,
) -> Result<u64, String> {
    copy_import_file_snapshot_internal(source, target_path, Some(cancellation))
}

fn copy_file_contents_with_cancellation(
    source_file: &mut fs::File,
    target_file: &mut fs::File,
    cancellation: &CsvFolderStagingCancellationToken,
) -> Result<u64, String> {
    let mut copied_bytes = 0_u64;
    let mut buffer = vec![0_u8; CANCELLABLE_COPY_CHUNK_BYTES];
    loop {
        cancellation.check()?;
        let read_bytes = source_file
            .read(&mut buffer)
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        if read_bytes == 0 {
            break;
        }
        cancellation.check()?;
        target_file
            .write_all(&buffer[..read_bytes])
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        copied_bytes = copied_bytes.saturating_add(read_bytes as u64);
    }
    cancellation.check()?;
    Ok(copied_bytes)
}

fn copy_import_file_snapshot_internal(
    source: &ImportFilePathEntry,
    target_path: &Path,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<u64, String> {
    if let Some(cancellation) = cancellation {
        cancellation.check()?;
    }
    read_regular_import_entry_metadata(&source.file_path)?
        .filter(|metadata| import_file_metadata_matches_snapshot(metadata, source))
        .ok_or_else(|| "CSV_STAGE_COPY_FAILED".to_string())?;

    let copy_result = (|| {
        let mut source_file = open_regular_file_without_following_links(&source.file_path)
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        let opened_metadata = source_file
            .metadata()
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        if !import_file_metadata_matches_snapshot(&opened_metadata, source) {
            return Err("CSV_STAGE_COPY_FAILED".to_string());
        }

        if let Some(cancellation) = cancellation {
            cancellation.check()?;
        }
        let mut target_file = create_private_target_file(target_path)
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        let copied_bytes = match cancellation {
            Some(cancellation) => copy_file_contents_with_cancellation(
                &mut source_file,
                &mut target_file,
                cancellation,
            )?,
            None => io::copy(&mut source_file, &mut target_file)
                .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?,
        };
        if let Some(cancellation) = cancellation {
            cancellation.check()?;
        }
        if let Some(modified) = source.modified {
            target_file
                .set_times(fs::FileTimes::new().set_modified(modified))
                .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        }
        let final_source_metadata = source_file
            .metadata()
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        let target_metadata = target_file
            .metadata()
            .map_err(|_| "CSV_STAGE_COPY_FAILED".to_string())?;
        if copied_bytes != source.size
            || target_metadata.len() != source.size
            || !import_file_metadata_matches_snapshot(&final_source_metadata, source)
        {
            return Err("CSV_STAGE_COPY_FAILED".to_string());
        }
        if let Some(cancellation) = cancellation {
            cancellation.check()?;
        }
        Ok(copied_bytes)
    })();

    if copy_result.is_err() {
        let _ = fs::remove_file(target_path);
    }
    copy_result
}

#[cfg(test)]
mod tests;
