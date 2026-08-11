// SPDX-License-Identifier: GPL-3.0-only

mod cancellation;
#[cfg(test)]
mod contract_tests;
mod files;
mod progress;
mod workers;

#[cfg(target_os = "macos")]
use super::security_scoped_bookmarks::resolve_security_scoped_source_folder;
use super::{bridge_command_error, BridgeCommandError};
use cancellation::{
    cancel_staging_request, register_cancellation_request, CsvFolderStagingCancellationToken,
};
use files::{
    build_import_file_sha256, build_import_file_sha256_cancellable,
    collect_selected_import_files_in_selected_folder,
    collect_selected_import_files_in_selected_folder_cancellable,
    collect_supported_import_file_metadata_in_selected_folder,
    collect_supported_import_file_metadata_in_selected_folder_cancellable,
    collect_supported_import_files_in_selected_folder,
    collect_supported_import_files_in_selected_folder_cancellable, copy_import_file_snapshot,
    copy_import_file_snapshot_cancellable, copy_optional_source_metadata_snapshot,
    create_csv_staging_dir, ensure_private_directory, import_limit_error,
    normalize_selected_import_relative_path, string_len, wire_relative_leaf_name,
    CsvFolderMetadataFile, CsvFolderMetadataManifest, ImportFilePathEntry,
};
use progress::{CsvFolderStagingProgressEmitter, CsvFolderStagingProgressPhase};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
use workers::{
    resolve_import_staging_worker_count, run_import_staging_cancellable_worker_pool,
    run_import_staging_worker_pool,
};

const IMPORT_MAX_FILES: usize = 20_000;
const IMPORT_MAX_SINGLE_FILE_BYTES: u64 = 20 * 1024 * 1024 * 1024;
const IMPORT_MAX_TOTAL_BYTES: u64 = 200 * 1024 * 1024 * 1024;
const IMPORT_MAX_DEPTH: usize = 16;
const IMPORT_MAX_PATH_CHARS: usize = 4096;
const IMPORT_MAX_BOOKMARK_ID_CHARS: usize = 16_384;
const IMPORT_MAX_RELATIVE_PATH_CHARS: usize = 1024;
const IMPORT_MAX_FILE_NAME_CHARS: usize = 255;
const NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS: usize = 128;
const CSV_STAGING_ROOT_DIRECTORY_NAME: &str = "zinuto-csv-upload";
const CSV_STAGING_DIRECTORY_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
pub(super) const CSV_STAGING_DIRECTORY_PREFIX: &str = "staged-";

// Startup cleanup: remove managed staging directories older than 24h that a
// crashed import left behind in the shared temp root (SH-M6). Only direct
// generated children of the managed root are candidates.
pub(crate) fn sweep_stale_csv_staging_directories() {
    sweep_stale_csv_staging_directories_at_root(
        &std::env::temp_dir().join(CSV_STAGING_ROOT_DIRECTORY_NAME),
    );
}

fn sweep_stale_csv_staging_directories_at_root(staging_root: &Path) {
    let Ok(entries) = fs::read_dir(staging_root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if !is_generated_csv_staging_directory_name(&name) {
            continue;
        }
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let is_stale = metadata
            .modified()
            .ok()
            .and_then(|modified| std::time::SystemTime::now().duration_since(modified).ok())
            .map(|age| age >= CSV_STAGING_DIRECTORY_MAX_AGE)
            .unwrap_or(false);
        if is_stale {
            let _ = fs::remove_dir_all(&path);
        }
    }
}

fn is_generated_csv_staging_directory_name(value: &str) -> bool {
    let Some(suffix) = value.strip_prefix(CSV_STAGING_DIRECTORY_PREFIX) else {
        return false;
    };
    let mut parts = suffix.split('-');
    (0..3).all(|_| {
        parts
            .next()
            .map(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
            .unwrap_or(false)
    }) && parts.next().is_none()
}

#[derive(Clone, Copy, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum CsvFolderStageMode {
    FullCopy,
    MetadataOnly,
    SelectiveDigest,
    SelectiveCopy,
}

struct CsvFolderDigestResult {
    file: CsvFolderMetadataFile,
    bytes: u64,
}

struct CsvFolderCopyResult {
    bytes: u64,
}

fn copy_staged_import_files<G>(
    staged_files: Vec<ImportFilePathEntry>,
    staging_dir: &Path,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
    on_item_complete: G,
) -> Result<Vec<CsvFolderCopyResult>, String>
where
    G: FnMut(&CsvFolderCopyResult),
{
    let staged_total_files = staged_files.len();
    let worker_count = resolve_import_staging_worker_count(staged_total_files);
    let staging_dir_for_worker = staging_dir.to_path_buf();
    let copy_results = match cancellation {
        Some(cancellation) => run_import_staging_cancellable_worker_pool(
            staged_files,
            worker_count,
            cancellation,
            move |staged_file| {
                let target_path =
                    staging_dir_for_worker.join(Path::new(&staged_file.relative_path));
                if let Some(parent_dir) = target_path.parent() {
                    ensure_private_directory(parent_dir)
                        .map_err(|_| "CSV_STAGE_CREATE_FAILED".to_string())?;
                }
                let copied_size = copy_import_file_snapshot_cancellable(
                    &staged_file,
                    &target_path,
                    cancellation,
                )?;
                Ok(CsvFolderCopyResult { bytes: copied_size })
            },
            on_item_complete,
        ),
        None => run_import_staging_worker_pool(
            staged_files,
            worker_count,
            move |staged_file| {
                let target_path =
                    staging_dir_for_worker.join(Path::new(&staged_file.relative_path));
                if let Some(parent_dir) = target_path.parent() {
                    ensure_private_directory(parent_dir)
                        .map_err(|_| "CSV_STAGE_CREATE_FAILED".to_string())?;
                }
                let copied_size = copy_import_file_snapshot(&staged_file, &target_path)?;
                Ok(CsvFolderCopyResult { bytes: copied_size })
            },
            on_item_complete,
        ),
    };
    if copy_results.is_err() {
        let _ = fs::remove_dir_all(staging_dir);
    }
    copy_results
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CsvFolderStagingResult {
    staged_folder_path: String,
    source_folder_path: String,
    source_folder_name: String,
    copied_files: usize,
    copied_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata_manifest: Option<CsvFolderMetadataManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_folder_bookmark_id: Option<String>,
}

fn normalize_native_bridge_request_id(value: Option<String>) -> Result<Option<String>, String> {
    let Some(raw_value) = value else {
        return Ok(None);
    };
    let normalized = raw_value.trim().to_string();
    if normalized.is_empty() {
        return Ok(None);
    }
    if string_len(&normalized) > NATIVE_BRIDGE_REQUEST_ID_MAX_CHARS {
        return Err("INVALID_PARAMS".to_string());
    }
    Ok(Some(normalized))
}

fn metadata_result(
    source_dir: &Path,
    source_folder_name: String,
    metadata_manifest: CsvFolderMetadataManifest,
    #[cfg(target_os = "macos")] source_folder_bookmark_id: String,
) -> CsvFolderStagingResult {
    CsvFolderStagingResult {
        staged_folder_path: String::new(),
        source_folder_path: source_dir.to_string_lossy().to_string(),
        source_folder_name,
        copied_files: 0,
        copied_bytes: 0,
        metadata_manifest: Some(metadata_manifest),
        #[cfg(target_os = "macos")]
        source_folder_bookmark_id: Some(source_folder_bookmark_id),
        #[cfg(not(target_os = "macos"))]
        source_folder_bookmark_id: None,
    }
}

fn stage_csv_folder_for_import_blocking(
    app: &AppHandle,
    folder_path: String,
    source_folder_bookmark_id: Option<String>,
    stage_mode: Option<CsvFolderStageMode>,
    relative_paths: Option<Vec<String>>,
    progress_request_id: Option<String>,
    cancellation: Option<&CsvFolderStagingCancellationToken>,
) -> Result<CsvFolderStagingResult, BridgeCommandError> {
    if let Some(cancellation) = cancellation {
        cancellation
            .check()
            .map_err(|code| bridge_command_error(&code))?;
    }
    let raw_path = folder_path.as_str();
    if string_len(raw_path) > IMPORT_MAX_PATH_CHARS {
        return Err(bridge_command_error(&import_limit_error(
            "path",
            IMPORT_MAX_PATH_CHARS,
        )));
    }
    let normalized_bookmark_id = source_folder_bookmark_id
        .as_deref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if normalized_bookmark_id
        .map(|value| string_len(value) > IMPORT_MAX_BOOKMARK_ID_CHARS)
        .unwrap_or(false)
    {
        return Err(bridge_command_error(&import_limit_error(
            "bookmark",
            IMPORT_MAX_BOOKMARK_ID_CHARS,
        )));
    }
    let normalized_progress_request_id = normalize_native_bridge_request_id(progress_request_id)
        .map_err(|code| bridge_command_error(&code))?;
    let progress_request_id = normalized_progress_request_id.as_deref();

    // The contract declares folderPath with minLength 1: an empty folder path
    // is rejected on every platform, even when a bookmark id is supplied.
    if raw_path.is_empty() {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }

    #[cfg(target_os = "macos")]
    let resolved_scope =
        resolve_security_scoped_source_folder(app, raw_path, normalized_bookmark_id)
            .map_err(|code| bridge_command_error(&code))?;

    #[cfg(target_os = "macos")]
    let source_dir = resolved_scope.source_dir.as_path();

    #[cfg(not(target_os = "macos"))]
    let source_dir_buffer = fs::canonicalize(PathBuf::from(raw_path))
        .map_err(|_| bridge_command_error("CSV_FILE_MISSING"))?;
    #[cfg(not(target_os = "macos"))]
    let source_dir = source_dir_buffer.as_path();
    #[cfg(not(target_os = "macos"))]
    {
        let source_meta =
            fs::metadata(source_dir).map_err(|_| bridge_command_error("CSV_FILE_MISSING"))?;
        if !source_meta.is_dir() {
            return Err(bridge_command_error("CSV_FILE_MISSING"));
        }
    }

    let source_folder_name = source_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| "import-folder".to_string());

    let resolved_stage_mode = stage_mode.ok_or_else(|| bridge_command_error("INVALID_PARAMS"))?;
    let mut progress_emitter =
        CsvFolderStagingProgressEmitter::new(app, progress_request_id, resolved_stage_mode);
    let raw_relative_paths = relative_paths.unwrap_or_default();
    if raw_relative_paths.len() > IMPORT_MAX_FILES {
        return Err(bridge_command_error(&import_limit_error(
            "relativePaths",
            IMPORT_MAX_FILES,
        )));
    }
    let mut normalized_relative_paths: Vec<String> = Vec::with_capacity(raw_relative_paths.len());
    for raw_relative_path in raw_relative_paths {
        if string_len(&raw_relative_path) > IMPORT_MAX_RELATIVE_PATH_CHARS {
            return Err(bridge_command_error(&import_limit_error(
                "relativePath",
                IMPORT_MAX_RELATIVE_PATH_CHARS,
            )));
        }
        let normalized_relative_path = normalize_selected_import_relative_path(&raw_relative_path)
            .ok_or_else(|| bridge_command_error("INVALID_PARAMS"))?;
        normalized_relative_paths.push(normalized_relative_path);
    }
    if let Some(cancellation) = cancellation {
        cancellation
            .check()
            .map_err(|code| bridge_command_error(&code))?;
    }

    if resolved_stage_mode == CsvFolderStageMode::MetadataOnly {
        progress_emitter.emit(CsvFolderStagingProgressPhase::Discovering, 0, None, 0, None);
        let metadata_manifest = match cancellation {
            Some(cancellation) => {
                collect_supported_import_file_metadata_in_selected_folder_cancellable(
                    source_dir,
                    cancellation,
                )
            }
            None => collect_supported_import_file_metadata_in_selected_folder(source_dir),
        }
        .map_err(|code| bridge_command_error(&code))?;
        if let Some(cancellation) = cancellation {
            cancellation
                .check()
                .map_err(|code| bridge_command_error(&code))?;
        }
        if metadata_manifest.total_files == 0 {
            return Err(bridge_command_error("CSV_FOLDER_NO_FILES"));
        }
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Discovering,
            metadata_manifest.total_files,
            Some(metadata_manifest.total_files),
            metadata_manifest.total_bytes,
            Some(metadata_manifest.total_bytes),
        );
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Done,
            metadata_manifest.total_files,
            Some(metadata_manifest.total_files),
            metadata_manifest.total_bytes,
            Some(metadata_manifest.total_bytes),
        );
        return Ok(metadata_result(
            source_dir,
            source_folder_name,
            metadata_manifest,
            #[cfg(target_os = "macos")]
            resolved_scope.source_folder_bookmark_id.clone(),
        ));
    }

    if resolved_stage_mode == CsvFolderStageMode::SelectiveDigest {
        if normalized_relative_paths.is_empty() {
            return Err(bridge_command_error("INVALID_PARAMS"));
        }
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Discovering,
            0,
            Some(normalized_relative_paths.len()),
            0,
            None,
        );
        let selected_files = match cancellation {
            Some(cancellation) => collect_selected_import_files_in_selected_folder_cancellable(
                source_dir,
                &normalized_relative_paths,
                cancellation,
            ),
            None => collect_selected_import_files_in_selected_folder(
                source_dir,
                &normalized_relative_paths,
            ),
        }
        .map_err(|code| bridge_command_error(&code))?;
        if let Some(cancellation) = cancellation {
            cancellation
                .check()
                .map_err(|code| bridge_command_error(&code))?;
        }
        if selected_files.is_empty() {
            return Err(bridge_command_error("CSV_FOLDER_NO_FILES"));
        }
        let selected_total_files = selected_files.len();
        let selected_total_bytes = selected_files
            .iter()
            .fold(0_u64, |sum, (_, _, meta)| sum.saturating_add(meta.len()));
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Discovering,
            selected_total_files,
            Some(selected_total_files),
            selected_total_bytes,
            Some(selected_total_bytes),
        );
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Digesting,
            0,
            Some(selected_total_files),
            0,
            Some(selected_total_bytes),
        );
        let mut digested_files = 0_usize;
        let mut digested_bytes = 0_u64;
        let digest_worker_count = resolve_import_staging_worker_count(selected_total_files);
        let mut on_digest_complete = |item: &CsvFolderDigestResult| {
            digested_files += 1;
            digested_bytes = digested_bytes.saturating_add(item.bytes);
            progress_emitter.emit(
                CsvFolderStagingProgressPhase::Digesting,
                digested_files,
                Some(selected_total_files),
                digested_bytes,
                Some(selected_total_bytes),
            );
        };
        let digest_results = match cancellation {
            Some(cancellation) => run_import_staging_cancellable_worker_pool(
                selected_files,
                digest_worker_count,
                cancellation,
                |(relative_path, file_path, meta)| {
                    let size = meta.len();
                    Ok(CsvFolderDigestResult {
                        file: CsvFolderMetadataFile {
                            originalname: wire_relative_leaf_name(&relative_path),
                            relative_path,
                            size,
                            mtime_ms: meta
                                .modified()
                                .ok()
                                .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|value| value.as_millis() as u64)
                                .unwrap_or(0),
                            fingerprint: Some(build_import_file_sha256_cancellable(
                                &file_path,
                                &meta,
                                cancellation,
                            )?),
                        },
                        bytes: size,
                    })
                },
                &mut on_digest_complete,
            ),
            None => run_import_staging_worker_pool(
                selected_files,
                digest_worker_count,
                |(relative_path, file_path, meta)| {
                    let size = meta.len();
                    Ok(CsvFolderDigestResult {
                        file: CsvFolderMetadataFile {
                            originalname: wire_relative_leaf_name(&relative_path),
                            relative_path,
                            size,
                            mtime_ms: meta
                                .modified()
                                .ok()
                                .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|value| value.as_millis() as u64)
                                .unwrap_or(0),
                            fingerprint: Some(build_import_file_sha256(&file_path, &meta)?),
                        },
                        bytes: size,
                    })
                },
                &mut on_digest_complete,
            ),
        }
        .map_err(|code| bridge_command_error(&code))?;
        let files: Vec<CsvFolderMetadataFile> =
            digest_results.into_iter().map(|item| item.file).collect();
        let total_bytes = files
            .iter()
            .fold(0_u64, |sum, item| sum.saturating_add(item.size));
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Done,
            files.len(),
            Some(files.len()),
            total_bytes,
            Some(total_bytes),
        );
        return Ok(metadata_result(
            source_dir,
            source_folder_name,
            CsvFolderMetadataManifest {
                total_files: files.len(),
                files,
                total_bytes,
            },
            #[cfg(target_os = "macos")]
            resolved_scope.source_folder_bookmark_id.clone(),
        ));
    }

    let (staged_files, staged_total_bytes): (Vec<ImportFilePathEntry>, u64) = if resolved_stage_mode
        == CsvFolderStageMode::SelectiveCopy
    {
        if normalized_relative_paths.is_empty() {
            return Err(bridge_command_error("INVALID_PARAMS"));
        }
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Discovering,
            0,
            Some(normalized_relative_paths.len()),
            0,
            None,
        );
        let selected_files = match cancellation {
            Some(cancellation) => collect_selected_import_files_in_selected_folder_cancellable(
                source_dir,
                &normalized_relative_paths,
                cancellation,
            ),
            None => collect_selected_import_files_in_selected_folder(
                source_dir,
                &normalized_relative_paths,
            ),
        }
        .map_err(|code| bridge_command_error(&code))?;
        if let Some(cancellation) = cancellation {
            cancellation
                .check()
                .map_err(|code| bridge_command_error(&code))?;
        }
        let selected_total_bytes = selected_files
            .iter()
            .fold(0_u64, |sum, (_, _, meta)| sum.saturating_add(meta.len()));
        (
            selected_files
                .into_iter()
                .map(|(relative_path, file_path, meta)| ImportFilePathEntry {
                    relative_path,
                    file_path,
                    size: meta.len(),
                    modified: meta.modified().ok(),
                })
                .collect(),
            selected_total_bytes,
        )
    } else {
        progress_emitter.emit(CsvFolderStagingProgressPhase::Discovering, 0, None, 0, None);
        let mut on_file_discovered = |file_count, total_bytes| {
            progress_emitter.emit(
                CsvFolderStagingProgressPhase::Discovering,
                file_count,
                None,
                total_bytes,
                None,
            );
        };
        let collected = match cancellation {
            Some(cancellation) => collect_supported_import_files_in_selected_folder_cancellable(
                source_dir,
                cancellation,
                &mut on_file_discovered,
            ),
            None => collect_supported_import_files_in_selected_folder(
                source_dir,
                &mut on_file_discovered,
            ),
        }
        .map_err(|code| bridge_command_error(&code))?;
        if let Some(cancellation) = cancellation {
            cancellation
                .check()
                .map_err(|code| bridge_command_error(&code))?;
        }
        (collected.files, collected.total_bytes)
    };

    let staged_total_files = staged_files.len();
    if staged_total_files == 0 {
        return Err(bridge_command_error("CSV_FOLDER_NO_FILES"));
    }
    progress_emitter.emit(
        CsvFolderStagingProgressPhase::Discovering,
        staged_total_files,
        Some(staged_total_files),
        staged_total_bytes,
        Some(staged_total_bytes),
    );

    let staging_root = std::env::temp_dir().join(CSV_STAGING_ROOT_DIRECTORY_NAME);
    ensure_private_directory(&staging_root)
        .map_err(|_| bridge_command_error("CSV_STAGE_CREATE_FAILED"))?;
    let staging_dir =
        create_csv_staging_dir(&staging_root).map_err(|code| bridge_command_error(&code))?;
    let mut copied_files: usize = 0;
    let mut copied_bytes: u64 = 0;

    progress_emitter.emit(
        CsvFolderStagingProgressPhase::Copying,
        0,
        Some(staged_total_files),
        0,
        Some(staged_total_bytes),
    );

    let copy_results = copy_staged_import_files(staged_files, &staging_dir, cancellation, |item| {
        copied_files += 1;
        copied_bytes = copied_bytes.saturating_add(item.bytes);
        progress_emitter.emit(
            CsvFolderStagingProgressPhase::Copying,
            copied_files,
            Some(staged_total_files),
            copied_bytes,
            Some(staged_total_bytes),
        );
    });
    let copy_results = match copy_results {
        Ok(results) => results,
        Err(code) => {
            return Err(bridge_command_error(&code));
        }
    };

    if copied_files > IMPORT_MAX_FILES {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(bridge_command_error(&import_limit_error(
            "files",
            IMPORT_MAX_FILES,
        )));
    }
    if copy_results
        .iter()
        .any(|item| item.bytes > IMPORT_MAX_SINGLE_FILE_BYTES)
    {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(bridge_command_error(&import_limit_error(
            "singleFileBytes",
            IMPORT_MAX_SINGLE_FILE_BYTES,
        )));
    }
    if copied_bytes > IMPORT_MAX_TOTAL_BYTES {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(bridge_command_error(&import_limit_error(
            "totalBytes",
            IMPORT_MAX_TOTAL_BYTES,
        )));
    }

    if copied_files == 0 {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(bridge_command_error("CSV_FOLDER_NO_FILES"));
    }
    if let Some(cancellation) = cancellation {
        if let Err(code) = cancellation.check() {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(bridge_command_error(&code));
        }
    }
    if matches!(
        resolved_stage_mode,
        CsvFolderStageMode::FullCopy | CsvFolderStageMode::SelectiveCopy
    ) {
        copy_optional_source_metadata_snapshot(source_dir, &staging_dir);
    }
    if let Some(cancellation) = cancellation {
        if let Err(code) = cancellation.check() {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(bridge_command_error(&code));
        }
    }
    progress_emitter.emit(
        CsvFolderStagingProgressPhase::Done,
        copied_files,
        Some(staged_total_files),
        copied_bytes,
        Some(staged_total_bytes),
    );
    if let Some(cancellation) = cancellation {
        if let Err(code) = cancellation.check() {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(bridge_command_error(&code));
        }
    }

    Ok(CsvFolderStagingResult {
        staged_folder_path: staging_dir.to_string_lossy().to_string(),
        source_folder_path: source_dir.to_string_lossy().to_string(),
        source_folder_name,
        copied_files,
        copied_bytes,
        metadata_manifest: None,
        #[cfg(target_os = "macos")]
        source_folder_bookmark_id: Some(resolved_scope.source_folder_bookmark_id.clone()),
        #[cfg(not(target_os = "macos"))]
        source_folder_bookmark_id: None,
    })
}

pub(crate) async fn stage_csv_folder_for_import(
    app: AppHandle,
    folder_path: String,
    source_folder_bookmark_id: Option<String>,
    stage_mode: Option<CsvFolderStageMode>,
    relative_paths: Option<Vec<String>>,
    progress_request_id: Option<String>,
    cancellation_request_id: Option<String>,
) -> Result<CsvFolderStagingResult, BridgeCommandError> {
    let cancellation_registration = register_cancellation_request(cancellation_request_id)
        .map_err(|code| bridge_command_error(&code))?;
    tauri::async_runtime::spawn_blocking(move || {
        let cancellation_token = cancellation_registration
            .as_ref()
            .map(|registration| registration.token());
        stage_csv_folder_for_import_blocking(
            &app,
            folder_path,
            source_folder_bookmark_id,
            stage_mode,
            relative_paths,
            progress_request_id,
            cancellation_token.as_deref(),
        )
    })
    .await
    .map_err(|_| bridge_command_error("CSV_STAGE_BRIDGE_FAILED"))?
}

pub(crate) fn cancel_csv_folder_staging(
    cancellation_request_id: String,
) -> Result<(), BridgeCommandError> {
    cancel_staging_request(cancellation_request_id).map_err(|code| bridge_command_error(&code))
}

fn discard_csv_folder_staging_at_root(
    staging_root: &Path,
    staged_folder_path: &str,
) -> Result<(), String> {
    if staged_folder_path.is_empty() || string_len(staged_folder_path) > IMPORT_MAX_PATH_CHARS {
        return Err("INVALID_PARAMS".to_string());
    }
    let candidate = PathBuf::from(staged_folder_path);
    if !candidate.is_absolute()
        || !candidate
            .file_name()
            .and_then(|value| value.to_str())
            .map(is_generated_csv_staging_directory_name)
            .unwrap_or(false)
    {
        return Err("INVALID_PARAMS".to_string());
    }
    let canonical_root =
        fs::canonicalize(staging_root).map_err(|_| "CSV_STAGE_DISCARD_FAILED".to_string())?;
    let candidate_parent = candidate
        .parent()
        .ok_or_else(|| "INVALID_PARAMS".to_string())?;
    let canonical_parent =
        fs::canonicalize(candidate_parent).map_err(|_| "INVALID_PARAMS".to_string())?;
    if canonical_parent != canonical_root {
        return Err("INVALID_PARAMS".to_string());
    }
    let metadata = match fs::symlink_metadata(&candidate) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("CSV_STAGE_DISCARD_FAILED".to_string()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("INVALID_PARAMS".to_string());
    }
    let canonical_candidate =
        fs::canonicalize(&candidate).map_err(|_| "CSV_STAGE_DISCARD_FAILED".to_string())?;
    if canonical_candidate.parent() != Some(canonical_root.as_path()) {
        return Err("INVALID_PARAMS".to_string());
    }
    fs::remove_dir_all(candidate).map_err(|_| "CSV_STAGE_DISCARD_FAILED".to_string())
}

pub(crate) async fn discard_csv_folder_staging(
    staged_folder_path: String,
) -> Result<(), BridgeCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let staging_root = std::env::temp_dir().join(CSV_STAGING_ROOT_DIRECTORY_NAME);
        discard_csv_folder_staging_at_root(&staging_root, &staged_folder_path)
            .map_err(|code| bridge_command_error(&code))
    })
    .await
    .map_err(|_| bridge_command_error("CSV_STAGE_BRIDGE_FAILED"))?
}

#[cfg(test)]
mod discard_tests {
    use super::cancellation::{CsvFolderStagingCancellationToken, CSV_FOLDER_STAGING_CANCELLED};
    use super::{
        copy_staged_import_files, discard_csv_folder_staging_at_root,
        sweep_stale_csv_staging_directories_at_root, ImportFilePathEntry,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    static TEST_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            let sequence = TEST_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "zinuto-csv-staging-discard-test-{}-{}-{}",
                std::process::id(),
                unique,
                sequence
            ));
            fs::create_dir_all(&path).expect("test root should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn discard_removes_only_a_direct_managed_staging_directory() {
        let test_root = TestDirectory::new();
        let staging_root = test_root.path().join("zinuto-csv-upload");
        let staged = staging_root.join("staged-1-2-3");
        fs::create_dir_all(&staged).expect("managed staging should be created");
        fs::write(staged.join("bars.csv"), b"close\n1").expect("fixture should be written");

        discard_csv_folder_staging_at_root(&staging_root, &staged.to_string_lossy())
            .expect("managed staging should be discarded");

        assert!(!staged.exists());
    }

    #[test]
    fn cancelled_copy_removes_the_incomplete_staging_directory() {
        let test_root = TestDirectory::new();
        let source = test_root.path().join("source.csv");
        let staging_dir = test_root.path().join("staged-1-2-3");
        fs::write(&source, b"close\n1").expect("source fixture should be written");
        fs::create_dir(&staging_dir).expect("staging fixture should be created");
        let metadata = fs::metadata(&source).expect("source metadata should be readable");
        let cancellation = CsvFolderStagingCancellationToken::default();
        cancellation.cancel();

        let result = copy_staged_import_files(
            vec![ImportFilePathEntry {
                relative_path: "source.csv".to_string(),
                file_path: source,
                size: metadata.len(),
                modified: metadata.modified().ok(),
            }],
            &staging_dir,
            Some(&cancellation),
            |_| {},
        );

        assert_eq!(result.err(), Some(CSV_FOLDER_STAGING_CANCELLED.to_string()));
        assert!(!staging_dir.exists());
    }

    #[test]
    fn discard_rejects_unmanaged_or_nested_directories() {
        let test_root = TestDirectory::new();
        let staging_root = test_root.path().join("zinuto-csv-upload");
        let unmanaged = staging_root.join("other");
        let nested = staging_root.join("container").join("staged-4-5-6");
        fs::create_dir_all(&unmanaged).expect("unmanaged fixture should be created");
        fs::create_dir_all(&nested).expect("nested fixture should be created");

        assert_eq!(
            discard_csv_folder_staging_at_root(&staging_root, &unmanaged.to_string_lossy()),
            Err("INVALID_PARAMS".to_string()),
        );
        assert_eq!(
            discard_csv_folder_staging_at_root(&staging_root, &nested.to_string_lossy()),
            Err("INVALID_PARAMS".to_string()),
        );
        assert!(unmanaged.exists());
        assert!(nested.exists());
    }

    #[test]
    fn discard_rejects_root_and_external_sibling_but_allows_missing_managed_path() {
        let test_root = TestDirectory::new();
        let staging_root = test_root.path().join("zinuto-csv-upload");
        let external_sibling = test_root.path().join("staged-7-8-9");
        fs::create_dir_all(&staging_root).expect("staging root should be created");
        fs::create_dir_all(&external_sibling).expect("external fixture should be created");

        assert_eq!(
            discard_csv_folder_staging_at_root(&staging_root, &staging_root.to_string_lossy()),
            Err("INVALID_PARAMS".to_string()),
        );
        assert_eq!(
            discard_csv_folder_staging_at_root(&staging_root, &external_sibling.to_string_lossy(),),
            Err("INVALID_PARAMS".to_string()),
        );
        discard_csv_folder_staging_at_root(
            &staging_root,
            &staging_root.join("staged-10-11-12").to_string_lossy(),
        )
        .expect("missing managed staging should be idempotent");
        assert!(external_sibling.exists());
    }

    #[cfg(unix)]
    #[test]
    fn discard_rejects_a_direct_symlink_to_an_external_directory() {
        use std::os::unix::fs::symlink;

        let test_root = TestDirectory::new();
        let staging_root = test_root.path().join("zinuto-csv-upload");
        let external = test_root.path().join("external");
        let linked = staging_root.join("staged-13-14-15");
        fs::create_dir_all(&staging_root).expect("staging root should be created");
        fs::create_dir_all(&external).expect("external fixture should be created");
        symlink(&external, &linked).expect("symlink fixture should be created");

        assert_eq!(
            discard_csv_folder_staging_at_root(&staging_root, &linked.to_string_lossy()),
            Err("INVALID_PARAMS".to_string()),
        );
        assert!(external.exists());
        assert!(linked.exists());
    }

    #[test]
    fn startup_sweep_removes_only_stale_managed_staging_directories() {
        let test_root = TestDirectory::new();
        let staging_root = test_root.path().join("zinuto-csv-upload");
        fs::create_dir_all(&staging_root).expect("staging root should be created");

        let stale_managed = staging_root.join("staged-1-2-3");
        let fresh_managed = staging_root.join("staged-4-5-6");
        let stale_unmanaged = staging_root.join("other");
        fs::create_dir_all(&stale_managed).expect("stale fixture should be created");
        fs::create_dir_all(&fresh_managed).expect("fresh fixture should be created");
        fs::create_dir_all(&stale_unmanaged).expect("unmanaged fixture should be created");

        let stale_modified = SystemTime::now() - Duration::from_secs(25 * 60 * 60);
        fs::File::open(&stale_managed)
            .expect("stale directory should open")
            .set_times(fs::FileTimes::new().set_modified(stale_modified))
            .expect("stale directory mtime should be set");

        sweep_stale_csv_staging_directories_at_root(&staging_root);

        assert!(
            !stale_managed.exists(),
            "stale managed staging must be removed"
        );
        assert!(fresh_managed.exists(), "fresh managed staging must be kept");
        assert!(
            stale_unmanaged.exists(),
            "unmanaged directories must be kept"
        );
    }
}
