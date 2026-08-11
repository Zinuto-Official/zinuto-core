// SPDX-License-Identifier: GPL-3.0-only
#![cfg(not(target_os = "macos"))]

use super::*;

pub(super) fn grant_store_path(desktop_data_dir: &Path) -> PathBuf {
    desktop_data_dir.join(GRANT_STORE_FILE_NAME)
}

#[cfg(not(target_os = "macos"))]
pub(super) fn load_grant_store(path: &Path) -> Result<AcquisitionFolderGrantStore, String> {
    if !path.exists() {
        return Ok(AcquisitionFolderGrantStore::default());
    }
    let bytes =
        fs::read(path).map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    if bytes.is_empty() {
        return Ok(AcquisitionFolderGrantStore::default());
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())
}

#[cfg(not(target_os = "macos"))]
fn save_grant_store(path: &Path, store: &AcquisitionFolderGrantStore) -> Result<(), String> {
    let bytes = serde_json::to_vec(store)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_WRITE_FAILED".to_string())?;
    let temporary_path =
        path.with_extension(format!("{}-{}.tmp", std::process::id(), now_epoch_millis()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_WRITE_FAILED".to_string())?;
    let write_result = file.write_all(&bytes).and_then(|_| file.sync_all());
    if write_result.is_err() || atomic_replace_grant_store(&temporary_path, path).is_err() {
        let _ = fs::remove_file(&temporary_path);
        return Err("MARKET_DATA_ACQUISITION_GRANT_STORE_WRITE_FAILED".to_string());
    }
    Ok(())
}

#[cfg(windows)]
fn atomic_replace_grant_store(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

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
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
fn atomic_replace_grant_store(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(not(target_os = "macos"))]
pub(super) fn authorize_non_macos_folder(
    desktop_data_dir: &Path,
    folder_path: &str,
    existing_grant_id: Option<&str>,
) -> Result<MarketDataAcquisitionFolderAuthorization, String> {
    let canonical_path = fs::canonicalize(folder_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
    require_real_directory(&canonical_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
    verify_acquisition_destination_is_writable(&canonical_path)?;
    let grant_id = existing_grant_id
        .map(str::to_string)
        .unwrap_or_else(next_grant_id);
    let store_path = grant_store_path(desktop_data_dir);
    let _store_guard = grant_store_lock()
        .lock()
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    let mut store = load_grant_store(&store_path)?;
    store.records.retain(|record| record.id != grant_id);
    if store.records.len() >= 256 {
        store.records.remove(0);
    }
    store.records.push(AcquisitionFolderGrantRecord {
        id: grant_id.clone(),
        folder_path: canonical_path.to_string_lossy().to_string(),
        updated_at_ms: now_epoch_millis(),
    });
    save_grant_store(&store_path, &store)?;
    Ok(MarketDataAcquisitionFolderAuthorization {
        grant_id,
        display_path: canonical_path.to_string_lossy().to_string(),
    })
}

#[cfg(not(target_os = "macos"))]
pub(super) fn resolve_non_macos_folder(
    desktop_data_dir: &Path,
    grant_id: &str,
) -> Result<PathBuf, String> {
    let _store_guard = grant_store_lock()
        .lock()
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    let store = load_grant_store(&grant_store_path(desktop_data_dir))?;
    let record = store
        .records
        .iter()
        .find(|record| record.id == grant_id)
        .ok_or_else(|| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    let canonical_path = fs::canonicalize(&record.folder_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    if canonical_path != PathBuf::from(&record.folder_path) {
        return Err("MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string());
    }
    require_real_directory(&canonical_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    Ok(canonical_path)
}
