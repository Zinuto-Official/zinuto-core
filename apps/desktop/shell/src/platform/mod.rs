// SPDX-License-Identifier: GPL-3.0-only

use std::path::{Path, PathBuf};
use std::{fs, io};
use tauri::Manager;

pub(crate) mod desktop_ui_language;

#[cfg(target_os = "macos")]
pub(crate) mod native_menu;

#[cfg_attr(windows, allow(dead_code))]
pub(crate) const DEFAULT_DESKTOP_BUNDLE_ID: &str = "org.zinuto.core";

pub(crate) fn ensure_directory(path: &Path) -> Result<(), io::Error> {
    if path.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(path)
}

#[cfg(target_os = "macos")]
pub(crate) fn shared_macos_container_home_suffix_for_bundle_id(bundle_id: &str) -> PathBuf {
    PathBuf::from("Library")
        .join("Containers")
        .join(bundle_id)
        .join("Data")
}

#[cfg(target_os = "macos")]
pub(crate) fn shared_macos_app_data_suffix_for_bundle_id(bundle_id: &str) -> PathBuf {
    PathBuf::from("Library")
        .join("Application Support")
        .join(bundle_id)
}

#[cfg(all(target_os = "macos", test))]
pub(crate) fn shared_macos_container_home_suffix() -> PathBuf {
    shared_macos_container_home_suffix_for_bundle_id(DEFAULT_DESKTOP_BUNDLE_ID)
}

#[cfg(all(target_os = "macos", test))]
pub(crate) fn shared_macos_app_data_suffix() -> PathBuf {
    shared_macos_app_data_suffix_for_bundle_id(DEFAULT_DESKTOP_BUNDLE_ID)
}

#[cfg(target_os = "macos")]
pub(crate) fn resolve_shared_macos_desktop_data_dir_from_home_for_bundle_id(
    home_dir: &Path,
    bundle_id: &str,
) -> PathBuf {
    let container_home_suffix = shared_macos_container_home_suffix_for_bundle_id(bundle_id);
    let app_data_suffix = shared_macos_app_data_suffix_for_bundle_id(bundle_id);

    if home_dir.ends_with(container_home_suffix.as_path()) {
        return home_dir.join(app_data_suffix);
    }

    home_dir.join(container_home_suffix).join(app_data_suffix)
}

#[cfg(all(target_os = "macos", test))]
pub(crate) fn resolve_shared_macos_desktop_data_dir_from_home(home_dir: &Path) -> PathBuf {
    resolve_shared_macos_desktop_data_dir_from_home_for_bundle_id(
        home_dir,
        DEFAULT_DESKTOP_BUNDLE_ID,
    )
}

#[cfg(target_os = "macos")]
pub(crate) fn resolve_macos_app_bundle_path_from_executable(
    executable_path: &Path,
) -> Option<PathBuf> {
    let macos_dir = executable_path.parent()?;
    if macos_dir.file_name()? != "MacOS" {
        return None;
    }

    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()? != "Contents" {
        return None;
    }

    let bundle_dir = contents_dir.parent()?;
    if bundle_dir.extension()? != "app" {
        return None;
    }

    Some(bundle_dir.to_path_buf())
}

#[cfg(target_os = "macos")]
fn resolve_shared_macos_desktop_data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let home_dir = std::env::var_os("HOME").map(PathBuf::from)?;
    Some(
        resolve_shared_macos_desktop_data_dir_from_home_for_bundle_id(
            home_dir.as_path(),
            current_desktop_bundle_id(app).as_str(),
        ),
    )
}

#[cfg(unix)]
pub(crate) fn current_desktop_bundle_id(app: &tauri::AppHandle) -> String {
    let identifier = app.config().identifier.trim();
    if identifier.is_empty() {
        return DEFAULT_DESKTOP_BUNDLE_ID.to_string();
    }
    identifier.to_string()
}

pub(crate) fn resolve_desktop_data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let default_dir = app.path().app_local_data_dir().ok()?;
    #[cfg(not(target_os = "windows"))]
    let default_dir = app.path().app_data_dir().ok()?;
    #[cfg(target_os = "macos")]
    let dir = resolve_shared_macos_desktop_data_dir(app).unwrap_or_else(|| default_dir.clone());
    #[cfg(not(target_os = "macos"))]
    let dir = default_dir;

    if ensure_directory(&dir).is_ok() {
        return Some(dir);
    }
    None
}
