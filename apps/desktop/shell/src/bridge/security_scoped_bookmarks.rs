// SPDX-License-Identifier: GPL-3.0-only

#[cfg(target_os = "macos")]
use crate::platform::resolve_desktop_data_dir;
#[cfg(target_os = "macos")]
use objc2_core_foundation::{
    CFData, CFError, CFRetained, CFURLBookmarkCreationOptions, CFURLBookmarkResolutionOptions,
    CFURL,
};
#[cfg(target_os = "macos")]
use std::os::unix::ffi::{OsStrExt, OsStringExt};
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "macos")]
use std::{fs, io::Write, ptr};

#[cfg(target_os = "macos")]
const MAX_BOOKMARK_RECORDS: usize = 256;

#[cfg(target_os = "macos")]
#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecurityScopedBookmarkStore {
    records: Vec<SecurityScopedBookmarkRecord>,
}

#[cfg(target_os = "macos")]
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecurityScopedBookmarkRecord {
    id: String,
    bookmark_data: Vec<u8>,
    updated_at_ms: u64,
}

#[cfg(target_os = "macos")]
pub(crate) struct SecurityScopedFolderAccess {
    url: CFRetained<CFURL>,
    started: bool,
}

#[cfg(target_os = "macos")]
pub(crate) struct ResolvedSecurityScopedSourceFolder {
    pub(crate) source_dir: PathBuf,
    pub(crate) source_folder_bookmark_id: String,
    _access: SecurityScopedFolderAccess,
}

#[cfg(target_os = "macos")]
pub(crate) struct ResolvedSecurityScopedAcquisitionFolder {
    pub(crate) destination_dir: PathBuf,
    _access: SecurityScopedFolderAccess,
}

#[cfg(target_os = "macos")]
pub(crate) struct AuthorizedSecurityScopedAcquisitionFolder {
    pub(crate) grant_id: String,
    pub(crate) display_path: String,
}

#[cfg(target_os = "macos")]
impl SecurityScopedBookmarkStore {
    fn take_by_id(&mut self, id: &str) -> Option<SecurityScopedBookmarkRecord> {
        let index = self.records.iter().position(|record| record.id == id)?;
        Some(self.records.swap_remove(index))
    }

    fn upsert(&mut self, record: SecurityScopedBookmarkRecord) {
        if let Some(index) = self.records.iter().position(|item| item.id == record.id) {
            self.records[index] = record;
            return;
        }
        if self.records.len() >= MAX_BOOKMARK_RECORDS {
            self.records.remove(0);
        }
        self.records.push(record);
    }
}

#[cfg(target_os = "macos")]
impl SecurityScopedFolderAccess {
    fn new(url: CFRetained<CFURL>) -> Result<Self, String> {
        // SAFETY: CFURL is a retained file URL produced by Core Foundation bookmark resolution.
        let started = unsafe { url.start_accessing_security_scoped_resource() };
        if !started {
            return Err("CSV_FOLDER_BOOKMARK_ACCESS_DENIED".to_string());
        }
        Ok(Self { url, started })
    }

    fn resolved_path(&self) -> Result<PathBuf, String> {
        path_buf_from_cfurl(&self.url)
    }
}

#[cfg(target_os = "macos")]
impl Drop for SecurityScopedFolderAccess {
    fn drop(&mut self) {
        if !self.started {
            return;
        }
        // SAFETY: Access was started by this lease and is stopped exactly once in Drop.
        unsafe { self.url.stop_accessing_security_scoped_resource() };
    }
}

#[cfg(target_os = "macos")]
fn normalize_stored_folder_path(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }
    let without_trailing_separators = path.trim_end_matches('/');
    if without_trailing_separators.is_empty() && path.starts_with('/') {
        return "/".to_string();
    }
    without_trailing_separators.to_string()
}

#[cfg(target_os = "macos")]
fn now_epoch_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

// Both bookmark stores (source bookmarks and acquisition grants) are
// read-modify-write files. The shell serializes every store mutation under
// this lock so concurrent bridge commands cannot lose each other's records
// (SH-M2).
#[cfg(target_os = "macos")]
fn bookmark_store_lock() -> &'static Mutex<()> {
    static BOOKMARK_STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    BOOKMARK_STORE_LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(target_os = "macos")]
fn sync_parent_directory(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }
}

#[cfg(target_os = "macos")]
fn next_bookmark_record_id() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("bookmark-{}-{}", stamp, std::process::id())
}

#[cfg(target_os = "macos")]
fn next_acquisition_grant_id() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("acquisition-grant-{}-{}", stamp, std::process::id())
}

#[cfg(target_os = "macos")]
fn release_cf_error(error: *mut CFError) {
    if let Some(non_null_error) = ptr::NonNull::new(error) {
        // SAFETY: Core Foundation Create/Copy APIs return +1 retained CFError pointers here.
        let _ = unsafe { CFRetained::<CFError>::from_raw(non_null_error) };
    }
}

#[cfg(target_os = "macos")]
fn cf_data_to_vec(data: &CFData) -> Vec<u8> {
    let length = data.length();
    if length <= 0 {
        return Vec::new();
    }
    // SAFETY: CFData exposes a stable byte pointer valid for its reported length.
    let bytes = unsafe { std::slice::from_raw_parts(data.byte_ptr(), length as usize) };
    bytes.to_vec()
}

#[cfg(target_os = "macos")]
fn cfurl_from_path(path: &Path, is_directory: bool) -> Result<CFRetained<CFURL>, String> {
    let bytes = path.as_os_str().as_bytes();
    if bytes.is_empty() {
        return Err("CSV_FOLDER_BOOKMARK_PATH_INVALID".to_string());
    }
    // SAFETY: The path byte slice is valid for the duration of the call and CFURL copies it.
    unsafe {
        CFURL::from_file_system_representation(
            None,
            bytes.as_ptr(),
            bytes.len() as isize,
            is_directory,
        )
        .ok_or_else(|| "CSV_FOLDER_BOOKMARK_PATH_INVALID".to_string())
    }
}

#[cfg(target_os = "macos")]
fn path_buf_from_cfurl(url: &CFURL) -> Result<PathBuf, String> {
    let mut buffer = vec![0u8; 4096];
    for _ in 0..4 {
        // SAFETY: The buffer is writable for the length provided to Core Foundation.
        let ok = unsafe {
            url.file_system_representation(true, buffer.as_mut_ptr(), buffer.len() as isize)
        };
        if ok {
            let zero_index = buffer
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(buffer.len());
            let file_bytes = &buffer[..zero_index];
            return Ok(PathBuf::from(std::ffi::OsString::from_vec(
                file_bytes.to_vec(),
            )));
        }
        buffer.resize(buffer.len().saturating_mul(2), 0);
    }
    Err("CSV_FOLDER_BOOKMARK_RESOLVE_FAILED".to_string())
}

#[cfg(target_os = "macos")]
fn create_security_scoped_bookmark_data(url: &CFURL, read_only: bool) -> Result<Vec<u8>, String> {
    let mut error: *mut CFError = ptr::null_mut();
    let mut options = CFURLBookmarkCreationOptions::WithSecurityScope;
    if read_only {
        options |= CFURLBookmarkCreationOptions::SecurityScopeAllowOnlyReadAccess;
    }
    // SAFETY: Core Foundation writes either a retained CFData or a retained CFError.
    let bookmark_data =
        unsafe { CFURL::new_bookmark_data(None, Some(url), options, None, None, &mut error) };
    release_cf_error(error);
    let Some(bookmark_data) = bookmark_data else {
        return Err("CSV_FOLDER_BOOKMARK_CREATE_FAILED".to_string());
    };
    let bytes = cf_data_to_vec(&bookmark_data);
    if bytes.is_empty() {
        return Err("CSV_FOLDER_BOOKMARK_CREATE_FAILED".to_string());
    }
    Ok(bytes)
}

#[cfg(target_os = "macos")]
fn resolve_security_scoped_bookmark_data(
    bookmark_data: &[u8],
) -> Result<(CFRetained<CFURL>, bool), String> {
    if bookmark_data.is_empty() {
        return Err("CSV_FOLDER_BOOKMARK_INVALID".to_string());
    }
    // SAFETY: CFData copies the bookmark byte slice before this function returns.
    let bookmark_cf_data =
        unsafe { CFData::new(None, bookmark_data.as_ptr(), bookmark_data.len() as isize) }
            .ok_or_else(|| "CSV_FOLDER_BOOKMARK_INVALID".to_string())?;

    let mut stale: u8 = 0;
    let mut error: *mut CFError = ptr::null_mut();
    // SAFETY: Inputs are valid CF objects and output pointers live for the duration of the call.
    let resolved_url = unsafe {
        CFURL::new_by_resolving_bookmark_data(
            None,
            Some(&bookmark_cf_data),
            CFURLBookmarkResolutionOptions::CFURLBookmarkResolutionWithSecurityScope
                | CFURLBookmarkResolutionOptions::CFURLBookmarkResolutionWithoutUIMask
                | CFURLBookmarkResolutionOptions::CFURLBookmarkResolutionWithoutMountingMask
                | CFURLBookmarkResolutionOptions::CFURLBookmarkResolutionWithoutImplicitStartAccessing,
            None,
            None,
            &mut stale,
            &mut error,
        )
    };
    release_cf_error(error);
    let Some(resolved_url) = resolved_url else {
        return Err("CSV_FOLDER_BOOKMARK_RESOLVE_FAILED".to_string());
    };
    Ok((resolved_url, stale != 0))
}

#[cfg(target_os = "macos")]
fn resolve_security_scoped_bookmark_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = resolve_desktop_data_dir(app)
        .ok_or_else(|| "CSV_FOLDER_BOOKMARK_STORE_UNAVAILABLE".to_string())?;
    Ok(data_dir.join("security-scoped-bookmarks.json"))
}

#[cfg(target_os = "macos")]
fn resolve_acquisition_grant_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = resolve_desktop_data_dir(app)
        .ok_or_else(|| "MARKET_DATA_ACQUISITION_GRANT_STORE_UNAVAILABLE".to_string())?;
    Ok(data_dir.join("market-data-acquisition-folder-grants.json"))
}

#[cfg(target_os = "macos")]
fn load_security_scoped_bookmark_store(
    store_path: &Path,
) -> Result<SecurityScopedBookmarkStore, String> {
    if !store_path.exists() {
        return Ok(SecurityScopedBookmarkStore::default());
    }
    let raw =
        fs::read(store_path).map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_READ_FAILED".to_string())?;
    if raw.is_empty() {
        return Ok(SecurityScopedBookmarkStore::default());
    }
    match serde_json::from_slice(&raw) {
        Ok(store) => Ok(store),
        Err(_) => {
            // Torn or corrupted store: recover from the last good backup that
            // the atomic save path keeps. Only when no valid backup exists do
            // we fail with an explicit error code instead of silently
            // discarding the store (SH-M3).
            let backup_path = store_path.with_extension("json.bak");
            let backup_raw = match fs::read(&backup_path) {
                Ok(bytes) => bytes,
                Err(_) => return Err("CSV_FOLDER_BOOKMARK_STORE_CORRUPTED".to_string()),
            };
            let backup_store: SecurityScopedBookmarkStore = serde_json::from_slice(&backup_raw)
                .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_CORRUPTED".to_string())?;
            // Restore the recovered store atomically so the next read sees a
            // valid file again; the backup copy is left untouched.
            let restore_bytes = serde_json::to_vec(&backup_store)
                .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_CORRUPTED".to_string())?;
            if write_atomic_store_bytes(store_path, &restore_bytes, false).is_err() {
                return Err("CSV_FOLDER_BOOKMARK_STORE_CORRUPTED".to_string());
            }
            Ok(backup_store)
        }
    }
}

#[cfg(target_os = "macos")]
fn write_atomic_store_bytes(
    store_path: &Path,
    encoded: &[u8],
    update_backup: bool,
) -> Result<(), String> {
    let temporary_path = store_path.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        now_epoch_millis(),
    ));
    let write_result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary_path)
            .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_WRITE_FAILED".to_string())?;
        file.write_all(encoded)
            .and_then(|_| file.sync_all())
            .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_WRITE_FAILED".to_string())?;
        // Keep the previous good file as a recovery point before the rename so
        // a torn read can fall back to it (SH-M3). Recovery restores skip the
        // backup so the only good copy is never overwritten.
        if update_backup && store_path.exists() {
            let backup_path = store_path.with_extension("json.bak");
            let _ = fs::copy(store_path, &backup_path);
        }
        fs::rename(&temporary_path, store_path)
            .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_WRITE_FAILED".to_string())?;
        sync_parent_directory(store_path);
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

#[cfg(target_os = "macos")]
fn save_security_scoped_bookmark_store(
    store_path: &Path,
    store: &SecurityScopedBookmarkStore,
) -> Result<(), String> {
    let encoded = serde_json::to_vec(store)
        .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_WRITE_FAILED".to_string())?;
    write_atomic_store_bytes(store_path, &encoded, true)
}

#[cfg(target_os = "macos")]
pub(crate) fn resolve_security_scoped_source_folder(
    app: &tauri::AppHandle,
    folder_path: &str,
    source_folder_bookmark_id: Option<&str>,
) -> Result<ResolvedSecurityScopedSourceFolder, String> {
    fn persist_resolved_security_scoped_source_folder(
        store_path: &Path,
        store: &mut SecurityScopedBookmarkStore,
        mut record: SecurityScopedBookmarkRecord,
        access: SecurityScopedFolderAccess,
        source_dir: PathBuf,
    ) -> Result<ResolvedSecurityScopedSourceFolder, String> {
        let refreshed_url = cfurl_from_path(&source_dir, true)?;
        record.bookmark_data = create_security_scoped_bookmark_data(&refreshed_url, true)?;
        record.updated_at_ms = now_epoch_millis();

        store.upsert(record.clone());
        save_security_scoped_bookmark_store(store_path, store)?;

        Ok(ResolvedSecurityScopedSourceFolder {
            source_dir,
            source_folder_bookmark_id: record.id,
            _access: access,
        })
    }

    fn resolve_source_dir_with_security_scope(
        resolved_url: CFRetained<CFURL>,
    ) -> Result<(SecurityScopedFolderAccess, PathBuf), String> {
        let access = SecurityScopedFolderAccess::new(resolved_url)?;
        let resolved_folder_path = access.resolved_path()?;
        let source_dir =
            fs::canonicalize(&resolved_folder_path).map_err(|_| "CSV_FILE_MISSING".to_string())?;
        let source_meta = fs::metadata(&source_dir).map_err(|_| "CSV_FILE_MISSING".to_string())?;
        if !source_meta.is_dir() {
            return Err("CSV_FILE_MISSING".to_string());
        }
        Ok((access, source_dir))
    }

    let normalized_bookmark_id = source_folder_bookmark_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let normalized_folder_path = normalize_stored_folder_path(folder_path);
    if normalized_folder_path.is_empty() && normalized_bookmark_id.is_none() {
        return Err("INVALID_PARAMS".to_string());
    }

    let store_path = resolve_security_scoped_bookmark_store_path(app)?;
    let _store_guard = bookmark_store_lock()
        .lock()
        .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_UNAVAILABLE".to_string())?;
    let mut store = load_security_scoped_bookmark_store(&store_path)?;

    let bookmark_record = normalized_bookmark_id
        .as_deref()
        .and_then(|bookmark_id| store.take_by_id(bookmark_id));

    if let Some(record) = bookmark_record {
        match resolve_security_scoped_bookmark_data(&record.bookmark_data)
            .and_then(|(resolved_url, _is_stale)| {
                resolve_source_dir_with_security_scope(resolved_url)
            })
            .and_then(|(access, source_dir)| {
                persist_resolved_security_scoped_source_folder(
                    &store_path,
                    &mut store,
                    record,
                    access,
                    source_dir,
                )
            }) {
            Ok(resolved) => return Ok(resolved),
            Err(_) => return Err("CSV_FOLDER_BOOKMARK_RESOLVE_FAILED".to_string()),
        }
    }

    if normalized_bookmark_id.is_some() {
        return Err("CSV_FOLDER_BOOKMARK_RESOLVE_FAILED".to_string());
    }

    if normalized_folder_path.is_empty() {
        return Err("CSV_FOLDER_BOOKMARK_RESOLVE_FAILED".to_string());
    }

    let source_folder_url = cfurl_from_path(Path::new(&normalized_folder_path), true)?;
    let bookmark_data = create_security_scoped_bookmark_data(&source_folder_url, true)?;
    let fallback_record = SecurityScopedBookmarkRecord {
        id: next_bookmark_record_id(),
        bookmark_data,
        updated_at_ms: now_epoch_millis(),
    };
    let (access, source_dir) = resolve_source_dir_with_security_scope(source_folder_url)?;
    persist_resolved_security_scoped_source_folder(
        &store_path,
        &mut store,
        fallback_record,
        access,
        source_dir,
    )
}

#[cfg(target_os = "macos")]
pub(crate) fn authorize_security_scoped_acquisition_folder(
    app: &tauri::AppHandle,
    folder_path: &str,
    existing_grant_id: Option<&str>,
) -> Result<AuthorizedSecurityScopedAcquisitionFolder, String> {
    let normalized_path = normalize_stored_folder_path(folder_path);
    if normalized_path.is_empty() {
        return Err("INVALID_PARAMS".to_string());
    }

    let selected_url = cfurl_from_path(Path::new(&normalized_path), true)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_FAILED".to_string())?;
    let access = SecurityScopedFolderAccess::new(selected_url)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_FAILED".to_string())?;
    let canonical_path = fs::canonicalize(
        access
            .resolved_path()
            .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_FAILED".to_string())?,
    )
    .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string())?;
    if !metadata.is_dir() {
        return Err("MARKET_DATA_ACQUISITION_FOLDER_UNAVAILABLE".to_string());
    }
    super::market_data_acquisition_output::verify_acquisition_destination_is_writable(
        &canonical_path,
    )?;

    let canonical_url = cfurl_from_path(&canonical_path, true)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_FAILED".to_string())?;
    let bookmark_data = create_security_scoped_bookmark_data(&canonical_url, false)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_FAILED".to_string())?;
    let grant_id = existing_grant_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(next_acquisition_grant_id);
    let record = SecurityScopedBookmarkRecord {
        id: grant_id.clone(),
        bookmark_data,
        updated_at_ms: now_epoch_millis(),
    };
    let store_path = resolve_acquisition_grant_store_path(app)?;
    let _store_guard = bookmark_store_lock()
        .lock()
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    let mut store = load_security_scoped_bookmark_store(&store_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    store.upsert(record);
    save_security_scoped_bookmark_store(&store_path, &store)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_WRITE_FAILED".to_string())?;

    Ok(AuthorizedSecurityScopedAcquisitionFolder {
        grant_id,
        display_path: canonical_path.to_string_lossy().to_string(),
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn resolve_security_scoped_acquisition_folder(
    app: &tauri::AppHandle,
    grant_id: &str,
) -> Result<ResolvedSecurityScopedAcquisitionFolder, String> {
    let store_path = resolve_acquisition_grant_store_path(app)?;
    let _store_guard = bookmark_store_lock()
        .lock()
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    let mut store = load_security_scoped_bookmark_store(&store_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_INVALID".to_string())?;
    let mut record = store
        .take_by_id(grant_id)
        .ok_or_else(|| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    let (resolved_url, _stale) = resolve_security_scoped_bookmark_data(&record.bookmark_data)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    let access = SecurityScopedFolderAccess::new(resolved_url)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    let destination_dir = fs::canonicalize(
        access
            .resolved_path()
            .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?,
    )
    .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    if !fs::metadata(&destination_dir)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
    {
        return Err("MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string());
    }

    let refreshed_url = cfurl_from_path(&destination_dir, true)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    record.bookmark_data = create_security_scoped_bookmark_data(&refreshed_url, false)
        .map_err(|_| "MARKET_DATA_ACQUISITION_FOLDER_AUTHORIZATION_EXPIRED".to_string())?;
    record.updated_at_ms = now_epoch_millis();
    store.upsert(record);
    save_security_scoped_bookmark_store(&store_path, &store)
        .map_err(|_| "MARKET_DATA_ACQUISITION_GRANT_STORE_WRITE_FAILED".to_string())?;

    Ok(ResolvedSecurityScopedAcquisitionFolder {
        destination_dir,
        _access: access,
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn create_security_scoped_read_bookmark_for_folder(
    app: &tauri::AppHandle,
    folder_path: &Path,
) -> Result<String, String> {
    let canonical_path = fs::canonicalize(folder_path)
        .map_err(|_| "MARKET_DATA_ACQUISITION_READ_AUTHORIZATION_FAILED".to_string())?;
    if !fs::metadata(&canonical_path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
    {
        return Err("MARKET_DATA_ACQUISITION_READ_AUTHORIZATION_FAILED".to_string());
    }
    let url = cfurl_from_path(&canonical_path, true)
        .map_err(|_| "MARKET_DATA_ACQUISITION_READ_AUTHORIZATION_FAILED".to_string())?;
    let bookmark_data = create_security_scoped_bookmark_data(&url, true)
        .map_err(|_| "MARKET_DATA_ACQUISITION_READ_AUTHORIZATION_FAILED".to_string())?;
    let record = SecurityScopedBookmarkRecord {
        id: next_bookmark_record_id(),
        bookmark_data,
        updated_at_ms: now_epoch_millis(),
    };
    let bookmark_id = record.id.clone();
    let store_path = resolve_security_scoped_bookmark_store_path(app)?;
    let _store_guard = bookmark_store_lock()
        .lock()
        .map_err(|_| "CSV_FOLDER_BOOKMARK_STORE_UNAVAILABLE".to_string())?;
    let mut store = load_security_scoped_bookmark_store(&store_path)?;
    store.upsert(record);
    save_security_scoped_bookmark_store(&store_path, &store)?;
    Ok(bookmark_id)
}

#[cfg(target_os = "macos")]
pub(crate) struct AuthorizedAcquisitionDestination {
    path: PathBuf,
    _access: SecurityScopedFolderAccess,
}

#[cfg(target_os = "macos")]
impl AuthorizedAcquisitionDestination {
    pub(crate) fn path(&self) -> &Path {
        self.path.as_path()
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn list_authorized_acquisition_destinations(
    app: &tauri::AppHandle,
) -> Vec<AuthorizedAcquisitionDestination> {
    // Best-effort enumeration of authorized destinations so the startup sweep
    // only touches folders the shell actually writes probe files and .partial
    // directories into. Unresolvable bookmarks (moved or revoked folders) are
    // skipped.
    let Ok(store_path) = resolve_acquisition_grant_store_path(app) else {
        return Vec::new();
    };
    let Ok(store) = load_security_scoped_bookmark_store(&store_path) else {
        return Vec::new();
    };
    store
        .records
        .iter()
        .filter_map(|record| {
            resolve_security_scoped_bookmark_data(&record.bookmark_data)
                .ok()
                .and_then(|(resolved_url, _is_stale)| {
                    let access = SecurityScopedFolderAccess::new(resolved_url).ok()?;
                    let path = access.resolved_path().ok()?;
                    Some(AuthorizedAcquisitionDestination {
                        path,
                        _access: access,
                    })
                })
        })
        .collect()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_STORE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            let sequence = TEST_STORE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "zinuto-bookmark-store-test-{}-{}-{}",
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

    fn sample_store() -> SecurityScopedBookmarkStore {
        SecurityScopedBookmarkStore {
            records: vec![SecurityScopedBookmarkRecord {
                id: "bookmark-test-1".to_string(),
                bookmark_data: vec![1, 2, 3, 4],
                updated_at_ms: 42,
            }],
        }
    }

    #[test]
    fn store_save_is_atomic_and_writes_a_backup() {
        let root = TestDirectory::new();
        let store_path = root.path().join("store.json");
        let store = sample_store();

        save_security_scoped_bookmark_store(&store_path, &store)
            .expect("first store should be saved atomically");
        // A second save preserves the previous good file as the backup.
        save_security_scoped_bookmark_store(&store_path, &store)
            .expect("second store should be saved atomically");

        assert!(store_path.exists());
        assert!(store_path.with_extension("json.bak").exists());
        let loaded =
            load_security_scoped_bookmark_store(&store_path).expect("saved store should load");
        assert_eq!(loaded.records.len(), 1);
        assert_eq!(loaded.records[0].id, "bookmark-test-1");
    }

    #[test]
    fn corrupted_store_recovers_from_the_backup() {
        let root = TestDirectory::new();
        let store_path = root.path().join("store.json");
        let store = sample_store();
        save_security_scoped_bookmark_store(&store_path, &store)
            .expect("first store should be saved atomically");
        save_security_scoped_bookmark_store(&store_path, &store)
            .expect("second store should be saved atomically");
        fs::write(&store_path, b"not json").expect("fixture should be corrupted");

        let recovered = load_security_scoped_bookmark_store(&store_path)
            .expect("corrupted store should recover from the backup");

        assert_eq!(recovered.records.len(), 1);
        assert_eq!(recovered.records[0].id, "bookmark-test-1");
        let restored_raw = fs::read(&store_path).expect("restored store should be readable");
        assert!(
            serde_json::from_slice::<SecurityScopedBookmarkStore>(&restored_raw).is_ok(),
            "the store file must be restored to valid JSON",
        );
    }

    #[test]
    fn corrupted_store_without_a_backup_returns_an_explicit_error() {
        let root = TestDirectory::new();
        let store_path = root.path().join("store.json");
        fs::write(&store_path, b"not json").expect("fixture should be corrupted");

        assert!(matches!(
            load_security_scoped_bookmark_store(&store_path),
            Err(ref code) if code == "CSV_FOLDER_BOOKMARK_STORE_CORRUPTED",
        ));
    }

    #[test]
    fn stored_folder_path_normalization_preserves_legal_spaces() {
        assert_eq!(
            normalize_stored_folder_path("/tmp/ leading and trailing "),
            "/tmp/ leading and trailing "
        );
        assert_eq!(
            normalize_stored_folder_path("/tmp/ folder /"),
            "/tmp/ folder "
        );
        assert_eq!(normalize_stored_folder_path("/"), "/");
        assert_eq!(normalize_stored_folder_path(""), "");
    }
}
