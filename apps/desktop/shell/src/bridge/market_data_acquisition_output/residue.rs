// SPDX-License-Identifier: GPL-3.0-only

#[cfg(not(target_os = "macos"))]
use super::grant_store::{grant_store_path, load_grant_store};
#[cfg(not(target_os = "macos"))]
use crate::platform::resolve_desktop_data_dir;
use std::fs;
use std::path::Path;
#[cfg(not(target_os = "macos"))]
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

const STALE_ACQUISITION_RESIDUE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

fn acquisition_residue_is_stale(metadata: &fs::Metadata) -> bool {
    metadata
        .modified()
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .map(|age| age >= STALE_ACQUISITION_RESIDUE_MAX_AGE)
        .unwrap_or(false)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AcquisitionResidueKind {
    PartialDirectory,
    WriteProbeFile,
}

fn all_ascii_digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn acquisition_residue_kind(name: &str) -> Option<AcquisitionResidueKind> {
    if let Some(rest) = name.strip_prefix(".zinuto-acquisition-write-probe-") {
        let mut fields = rest.split('-');
        if fields.clone().count() == 3 && fields.all(all_ascii_digits) {
            return Some(AcquisitionResidueKind::WriteProbeFile);
        }
        return None;
    }

    let body = name
        .strip_prefix(".zinuto-acquisition-")?
        .strip_suffix(".partial")?;
    let mut fields = body.rsplitn(3, '-');
    let sequence = fields.next()?;
    let timestamp = fields.next()?;
    let job_token = fields.next()?;
    if job_token.len() == 8
        && job_token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        && all_ascii_digits(timestamp)
        && all_ascii_digits(sequence)
    {
        Some(AcquisitionResidueKind::PartialDirectory)
    } else {
        None
    }
}

pub(super) fn sweep_stale_acquisition_residue_in_destination(
    destination: &Path,
    is_stale: impl Fn(&fs::Metadata) -> bool,
) {
    let Ok(metadata) = fs::symlink_metadata(destination) else {
        return;
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(destination) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Some(kind) = acquisition_residue_kind(&name) else {
            continue;
        };
        let Ok(entry_metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if entry_metadata.file_type().is_symlink() || !is_stale(&entry_metadata) {
            continue;
        }
        match kind {
            AcquisitionResidueKind::WriteProbeFile if entry_metadata.is_file() => {
                let _ = fs::remove_file(&path);
            }
            AcquisitionResidueKind::PartialDirectory if entry_metadata.is_dir() => {
                let _ = fs::remove_dir_all(&path);
            }
            _ => {}
        }
    }
}

// Startup cleanup: remove write-probe files and .partial directories that a
// crashed acquisition left behind in authorized destination folders (older
// than 24h). Only known residue names inside known destinations are touched;
// everything else is left alone (item 9).
pub(crate) fn sweep_stale_acquisition_residue(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let destinations =
            crate::bridge::security_scoped_bookmarks::list_authorized_acquisition_destinations(app);
        for destination in destinations {
            // Keep the security-scope lease in `destination` alive through the
            // directory enumeration and every owned residue operation.
            sweep_stale_acquisition_residue_in_destination(
                destination.path(),
                acquisition_residue_is_stale,
            );
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut paths = Vec::new();
        if let Some(data_dir) = resolve_desktop_data_dir(app) {
            if let Ok(store) = load_grant_store(&grant_store_path(&data_dir)) {
                paths.extend(
                    store
                        .records
                        .iter()
                        .map(|record| PathBuf::from(&record.folder_path)),
                );
            }
        }
        for destination in paths {
            sweep_stale_acquisition_residue_in_destination(
                &destination,
                acquisition_residue_is_stale,
            );
        }
    }
}
