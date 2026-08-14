// SPDX-License-Identifier: GPL-3.0-only

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use tauri::Manager;
#[cfg(windows)]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(windows)]
use winreg::RegKey;

use super::{
    BackendRuntimeStateRecord, BackendTransport, AKSHARE_DEVELOPMENT_SIDECAR_PATH_ENV,
    AKSHARE_TRUSTED_SIDECAR_PATH_ENV, BACKTEST_ENGINE_BIN_ENV, BACKTEST_NATIVE_BATCH_ENV,
};

#[cfg(windows)]
const MARKET_DATA_HTTPS_PROXY_ENV: &str = "ZINUTO_MARKET_DATA_HTTPS_PROXY";

#[derive(Clone)]
pub(super) struct BackendLaunchCandidate {
    pub(super) entry: PathBuf,
    pub(super) arguments: Vec<OsString>,
    pub(super) working_dir: Option<PathBuf>,
    pub(super) runtime_build_id: String,
    pub(super) runtime_manifest_digest: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendRuntimeManifestPathSet {
    backend_entry_relative_path: String,
    backend_working_dir_relative_path: String,
    #[serde(default)]
    node_runtime_entry_relative_path: String,
    #[allow(dead_code)]
    runtime_lib_dir_relative_path: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendRuntimeManifest {
    version: u8,
    #[serde(default)]
    target_platform: String,
    runtime_build_id: String,
    development: BackendRuntimeManifestPathSet,
    packaged: BackendRuntimeManifestPathSet,
}

#[derive(Clone)]
struct ResolvedBackendRuntimeManifest {
    manifest: BackendRuntimeManifest,
    base_dir: PathBuf,
    is_packaged: bool,
    manifest_digest: String,
}

#[cfg(windows)]
fn normalize_windows_verbatim_path(path: PathBuf) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", stripped));
    }
    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(stripped);
    }
    path
}

#[cfg(not(windows))]
fn normalize_windows_verbatim_path(path: PathBuf) -> PathBuf {
    path
}

fn unique_existing_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique: Vec<PathBuf> = Vec::new();
    for path in paths {
        let normalized_path =
            normalize_windows_verbatim_path(fs::canonicalize(&path).unwrap_or(path.clone()));
        if !normalized_path.is_file() {
            continue;
        }
        if unique.iter().any(|existing| existing == &normalized_path) {
            continue;
        }
        unique.push(normalized_path);
    }
    unique
}

fn current_backend_manifest_target_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "macos";
    }
    #[cfg(windows)]
    {
        return "windows";
    }
    #[allow(unreachable_code)]
    std::env::consts::OS
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn backend_runtime_manifest_path_set(
    resolved_manifest: &ResolvedBackendRuntimeManifest,
) -> &BackendRuntimeManifestPathSet {
    if resolved_manifest.is_packaged {
        &resolved_manifest.manifest.packaged
    } else {
        &resolved_manifest.manifest.development
    }
}

fn resolve_manifest_relative_path(
    resolved_manifest: &ResolvedBackendRuntimeManifest,
    relative_path: &str,
) -> PathBuf {
    normalize_windows_verbatim_path(resolved_manifest.base_dir.join(relative_path.trim()))
}

fn read_backend_runtime_manifest(
    manifest_path: &Path,
    is_packaged: bool,
) -> Option<ResolvedBackendRuntimeManifest> {
    let raw = fs::read(manifest_path).ok()?;
    let manifest_digest = sha256_hex(&raw);
    let manifest = serde_json::from_slice::<BackendRuntimeManifest>(&raw).ok()?;
    let manifest_target_platform = manifest.target_platform.trim();
    if manifest.version != 1
        || manifest.runtime_build_id.trim().is_empty()
        || (!manifest_target_platform.is_empty()
            && manifest_target_platform != current_backend_manifest_target_platform())
    {
        return None;
    }
    Some(ResolvedBackendRuntimeManifest {
        manifest,
        base_dir: normalize_windows_verbatim_path(manifest_path.parent()?.to_path_buf()),
        is_packaged,
        manifest_digest,
    })
}

fn push_packaged_runtime_manifest_candidates(
    app: &tauri::AppHandle,
    candidates: &mut Vec<(PathBuf, bool)>,
) {
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push((resource_dir.join("runtime-manifest.json"), true));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push((exe_dir.join("runtime-manifest.json"), true));
            candidates.push((exe_dir.join("../Resources/runtime-manifest.json"), true));
        }
    }
}

#[cfg(target_os = "macos")]
fn current_executable_is_macos_app_bundle() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| crate::platform::resolve_macos_app_bundle_path_from_executable(&exe))
        .is_some()
}

#[cfg(not(target_os = "macos"))]
fn current_executable_is_macos_app_bundle() -> bool {
    false
}

fn should_prefer_packaged_runtime_manifest(executable_is_macos_app_bundle: bool) -> bool {
    executable_is_macos_app_bundle
}

fn resolve_backend_runtime_manifest(
    app: &tauri::AppHandle,
) -> Option<ResolvedBackendRuntimeManifest> {
    let mut candidates: Vec<(PathBuf, bool)> = Vec::new();
    let prefer_packaged_manifest =
        should_prefer_packaged_runtime_manifest(current_executable_is_macos_app_bundle());

    if prefer_packaged_manifest {
        push_packaged_runtime_manifest_candidates(app, &mut candidates);
    }

    if cfg!(debug_assertions) && !prefer_packaged_manifest {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                push_repo_runtime_manifest_candidates(&mut candidates, exe_dir);
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            push_repo_runtime_manifest_candidates(&mut candidates, &cwd);
        }
    }

    if !prefer_packaged_manifest {
        push_packaged_runtime_manifest_candidates(app, &mut candidates);
    }

    for (candidate_path, is_packaged) in candidates {
        let normalized_path = fs::canonicalize(&candidate_path).unwrap_or(candidate_path.clone());
        if !normalized_path.is_file() {
            continue;
        }
        if let Some(manifest) = read_backend_runtime_manifest(&normalized_path, is_packaged) {
            return Some(manifest);
        }
    }
    None
}

fn push_repo_runtime_manifest_candidates(candidates: &mut Vec<(PathBuf, bool)>, start_dir: &Path) {
    for ancestor in start_dir.ancestors() {
        let candidate = match ancestor.file_name().and_then(|value| value.to_str()) {
            Some("shell") => ancestor.join("gen/runtime-manifest.json"),
            _ => ancestor.join("apps/desktop/shell/gen/runtime-manifest.json"),
        };
        if candidates
            .iter()
            .any(|(existing, is_packaged)| !*is_packaged && *existing == candidate)
        {
            continue;
        }
        candidates.push((candidate, false));
    }
}

fn backend_entry_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dev_candidates: Vec<PathBuf> = Vec::new();

    if cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                dev_candidates
                    .push(exe_dir.join("../../../apps/desktop/local-api/dist/runtime/index.js"));
            }
        }
    }

    let mut resource_candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        resource_candidates.push(
            resource_dir
                .join("apps")
                .join("desktop")
                .join("local-api")
                .join("dist")
                .join("runtime")
                .join("index.js"),
        );
    }

    let mut candidates = unique_existing_paths(dev_candidates);
    for candidate in unique_existing_paths(resource_candidates) {
        if candidates.iter().any(|existing| existing == &candidate) {
            continue;
        }
        candidates.push(candidate);
    }
    candidates
}

fn backend_file_signature(path: &Path) -> String {
    let normalized = fs::canonicalize(path).unwrap_or(path.to_path_buf());
    let metadata = fs::metadata(&normalized).ok();
    let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
    let content_hash = fs::read(&normalized)
        .ok()
        .map(|bytes| sha256_hex(&bytes))
        .unwrap_or_else(|| "unreadable".to_string());
    format!("{}:{}", size, content_hash)
}

fn backend_bundle_signature(entry: &Path) -> String {
    let normalized_entry = fs::canonicalize(entry).unwrap_or(entry.to_path_buf());
    let Some(dist_dir) = normalized_entry.parent() else {
        return format!(
            "backend-bundle:{}:1",
            backend_file_signature(&normalized_entry)
        );
    };
    if dist_dir
        .file_name()
        .map(|value| value.to_string_lossy() != "dist")
        .unwrap_or(true)
    {
        return format!(
            "backend-bundle:{}:1",
            backend_file_signature(&normalized_entry)
        );
    }

    let mut files: Vec<PathBuf> = Vec::new();
    let mut pending_dirs = vec![dist_dir.to_path_buf()];
    while let Some(dir_path) = pending_dirs.pop() {
        let Ok(entries) = fs::read_dir(&dir_path) else {
            return format!(
                "backend-bundle:{}:1",
                backend_file_signature(&normalized_entry)
            );
        };
        let mut child_paths: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|value| value.path()))
            .collect();
        child_paths.sort();
        for child_path in child_paths {
            let Ok(metadata) = fs::metadata(&child_path) else {
                return format!(
                    "backend-bundle:{}:1",
                    backend_file_signature(&normalized_entry)
                );
            };
            if metadata.is_dir() {
                pending_dirs.push(child_path);
                continue;
            }
            if metadata.is_file() {
                files.push(child_path);
            }
        }
    }

    files.sort();
    let mut hasher = Sha256::new();
    for file_path in &files {
        let normalized_file = fs::canonicalize(file_path).unwrap_or(file_path.clone());
        let Ok(metadata) = fs::metadata(&normalized_file) else {
            return format!(
                "backend-bundle:{}:1",
                backend_file_signature(&normalized_entry)
            );
        };
        let relative_path = normalized_file
            .strip_prefix(dist_dir)
            .unwrap_or(normalized_file.as_path());
        hasher.update(relative_path.to_string_lossy().as_bytes());
        hasher.update(metadata.len().to_string().as_bytes());
        let Ok(bytes) = fs::read(&normalized_file) else {
            return format!(
                "backend-bundle:{}:1",
                backend_file_signature(&normalized_entry)
            );
        };
        hasher.update(bytes);
    }
    let digest = format!("{:x}", hasher.finalize());
    format!("backend-bundle:{}:{}", &digest[..24], files.len())
}

fn build_backend_runtime_build_id(entry: &Path, _node_runtime_entry: &Path) -> String {
    backend_bundle_signature(entry)
}

pub(super) fn resolve_backend_launch_candidates(
    app: &tauri::AppHandle,
    node_runtime_entry: &Path,
) -> Vec<BackendLaunchCandidate> {
    if let Some(resolved_manifest) = resolve_backend_runtime_manifest(app) {
        let path_set = backend_runtime_manifest_path_set(&resolved_manifest);
        let entry_path = resolve_manifest_relative_path(
            &resolved_manifest,
            &path_set.backend_entry_relative_path,
        );
        let normalized_entry = normalize_windows_verbatim_path(
            fs::canonicalize(&entry_path).unwrap_or(entry_path.clone()),
        );
        if normalized_entry.is_file() {
            let working_dir_path = resolve_manifest_relative_path(
                &resolved_manifest,
                &path_set.backend_working_dir_relative_path,
            );
            let normalized_working_dir = fs::canonicalize(&working_dir_path)
                .map(normalize_windows_verbatim_path)
                .ok()
                .filter(|path| path.is_dir());
            return vec![BackendLaunchCandidate {
                entry: normalized_entry,
                arguments: Vec::new(),
                working_dir: normalized_working_dir,
                runtime_build_id: resolved_manifest.manifest.runtime_build_id,
                runtime_manifest_digest: resolved_manifest.manifest_digest,
            }];
        }
    }
    if !cfg!(debug_assertions) {
        return Vec::new();
    }
    backend_entry_candidates(app)
        .into_iter()
        .map(|entry| BackendLaunchCandidate {
            working_dir: backend_working_dir_from_entry(&entry),
            runtime_build_id: build_backend_runtime_build_id(&entry, node_runtime_entry),
            runtime_manifest_digest: "development-unmanifested".to_string(),
            entry,
            arguments: Vec::new(),
        })
        .collect()
}

pub(super) fn backend_working_dir_from_entry(entry: &Path) -> Option<PathBuf> {
    let dist_dir = entry.parent()?;
    if dist_dir.file_name()?.to_string_lossy() != "dist" {
        return None;
    }
    let backend_dir = dist_dir.parent()?;
    if backend_dir.file_name()?.to_string_lossy() != "local-api" {
        return None;
    }
    backend_dir
        .parent()?
        .parent()?
        .parent()
        .map(|p| p.to_path_buf())
}

pub(super) fn configure_backend_transport_env(cmd: &mut Command, transport: &BackendTransport) {
    match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => {
            cmd.env("ZINUTO_BACKEND_SOCKET", socket_path);
        }
        #[cfg(windows)]
        BackendTransport::Tcp { port, .. } => {
            cmd.env("ZINUTO_BACKEND_PORT", port.to_string());
        }
    }
}

fn backtest_engine_binary_name() -> &'static str {
    if cfg!(windows) {
        "zinuto-core-backtest-engine.exe"
    } else {
        "zinuto-core-backtest-engine"
    }
}

fn resolve_backtest_engine_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let binary_name = backtest_engine_binary_name();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("backtest-engine").join(binary_name));
    }
    if cfg!(debug_assertions) {
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(
                cwd.join("apps")
                    .join("desktop")
                    .join("shell")
                    .join("gen")
                    .join("backtest-engine")
                    .join(binary_name),
            );
            candidates.push(
                cwd.join("apps")
                    .join("desktop")
                    .join("backtest-engine")
                    .join("target")
                    .join("release")
                    .join(binary_name),
            );
        }
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("gen")
                .join("backtest-engine")
                .join(binary_name),
        );
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("backtest-engine")
                .join("target")
                .join("release")
                .join(binary_name),
        );
    }
    unique_existing_paths(candidates)
        .into_iter()
        .find(|path| path.is_file())
}

pub(super) fn configure_backtest_engine_env(cmd: &mut Command, app: &tauri::AppHandle) {
    if let Some(engine_path) = resolve_backtest_engine_path(app) {
        cmd.env(
            BACKTEST_ENGINE_BIN_ENV,
            engine_path.to_string_lossy().to_string(),
        )
        .env(BACKTEST_NATIVE_BATCH_ENV, "1");
    }
}

fn akshare_sidecar_target_id() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("darwin-arm64"),
        ("macos", "x86_64") => Some("darwin-x64"),
        ("windows", "x86_64") => Some("win32-x64"),
        ("windows", "aarch64") => Some("win32-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        _ => None,
    }
}

fn akshare_sidecar_binary_name() -> &'static str {
    if cfg!(windows) {
        "zinuto-akshare-sidecar.exe"
    } else {
        "zinuto-akshare-sidecar"
    }
}

fn is_regular_akshare_sidecar_executable(path: &Path) -> bool {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) if !value.file_type().is_symlink() && value.is_file() => value,
        _ => return false,
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        true
    }
}

fn resolve_akshare_sidecar_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let target_id = akshare_sidecar_target_id()?;
    let relative_path = Path::new("market-data-acquisition")
        .join("akshare-sidecar")
        .join(target_id)
        .join(akshare_sidecar_binary_name());
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&relative_path));
    }
    if cfg!(debug_assertions) {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("gen")
                .join(&relative_path),
        );
    }
    candidates.into_iter().find_map(|candidate| {
        if !is_regular_akshare_sidecar_executable(&candidate) {
            return None;
        }
        fs::canonicalize(candidate).ok()
    })
}

fn clear_inherited_akshare_sidecar_env(cmd: &mut Command) {
    cmd.env_remove(AKSHARE_TRUSTED_SIDECAR_PATH_ENV)
        .env_remove(AKSHARE_DEVELOPMENT_SIDECAR_PATH_ENV);
}

pub(super) fn configure_akshare_sidecar_env(cmd: &mut Command, app: &tauri::AppHandle) {
    clear_inherited_akshare_sidecar_env(cmd);
    if let Some(sidecar_path) = resolve_akshare_sidecar_path(app) {
        cmd.env(AKSHARE_TRUSTED_SIDECAR_PATH_ENV, sidecar_path);
    }
}

#[cfg(any(windows, test))]
fn normalize_windows_system_proxy_endpoint(value: &str) -> Option<String> {
    let endpoint = value.trim();
    if endpoint.is_empty()
        || endpoint
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return None;
    }

    let normalized = if endpoint.contains("://") {
        endpoint.to_string()
    } else {
        format!("http://{endpoint}")
    };
    let (scheme, authority) = normalized.split_once("://")?;
    if !matches!(scheme.to_ascii_lowercase().as_str(), "http" | "https")
        || authority.trim_matches('/').is_empty()
    {
        return None;
    }
    Some(normalized)
}

#[cfg(any(windows, test))]
fn resolve_windows_https_proxy(proxy_server: &str) -> Option<String> {
    let mut https_proxy = None;
    let mut http_proxy = None;
    let mut unqualified_proxy = None;

    for value in proxy_server
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some((protocol, endpoint)) = value.split_once('=') {
            match protocol.trim().to_ascii_lowercase().as_str() {
                "https" if https_proxy.is_none() => https_proxy = Some(endpoint),
                "http" if http_proxy.is_none() => http_proxy = Some(endpoint),
                _ => {}
            }
        } else if unqualified_proxy.is_none() {
            unqualified_proxy = Some(value);
        }
    }

    [https_proxy, http_proxy, unqualified_proxy]
        .into_iter()
        .flatten()
        .find_map(normalize_windows_system_proxy_endpoint)
}

#[cfg(windows)]
fn configure_windows_market_data_proxy_env(cmd: &mut Command) {
    cmd.env_remove(MARKET_DATA_HTTPS_PROXY_ENV);

    let settings = match RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
    {
        Ok(settings) => settings,
        Err(_) => return,
    };
    let proxy_enabled = match settings.get_value::<u32, _>("ProxyEnable") {
        Ok(value) => value != 0,
        Err(_) => false,
    };
    if !proxy_enabled {
        return;
    }
    let proxy_server = match settings.get_value::<String, _>("ProxyServer") {
        Ok(value) => value,
        Err(_) => return,
    };
    if let Some(proxy_url) = resolve_windows_https_proxy(&proxy_server) {
        cmd.env(MARKET_DATA_HTTPS_PROXY_ENV, proxy_url);
    }
}

#[cfg(not(windows))]
fn configure_windows_market_data_proxy_env(_cmd: &mut Command) {}

pub(crate) fn desktop_release_channel() -> &'static str {
    "community"
}

pub(super) fn configure_backend_launch_environment(cmd: &mut Command) {
    cmd.env("ZINUTO_DESKTOP_RELEASE_CHANNEL", desktop_release_channel());
    configure_windows_market_data_proxy_env(cmd);
}

pub(super) fn backend_runtime_state_release_channel_matches_current(
    state: &BackendRuntimeStateRecord,
) -> bool {
    state
        .release_channel
        .as_deref()
        .map(|value| value == desktop_release_channel())
        .unwrap_or(false)
}

pub(super) fn generate_backend_bridge_secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<Vec<String>>()
        .join("")
}

pub(super) fn resolve_node_runtime_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(resolved_manifest) = resolve_backend_runtime_manifest(app) {
        let path_set = backend_runtime_manifest_path_set(&resolved_manifest);
        if !path_set.node_runtime_entry_relative_path.trim().is_empty() {
            let candidate_path = resolve_manifest_relative_path(
                &resolved_manifest,
                &path_set.node_runtime_entry_relative_path,
            );
            let normalized_path = normalize_windows_verbatim_path(
                fs::canonicalize(&candidate_path).unwrap_or(candidate_path),
            );
            if normalized_path.is_file() {
                return Some(normalized_path);
            }
        }
    }

    let node_binary_name = if cfg!(windows) { "node.exe" } else { "node" };
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("node-runtime").join(node_binary_name));
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("zinuto-core-node"));
        }
    }
    if cfg!(debug_assertions) {
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(
                cwd.join("apps/desktop/shell/runtime/node/bin")
                    .join(node_binary_name),
            );
        }
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("runtime/node/bin")
                .join(node_binary_name),
        );
    }
    unique_existing_paths(candidates).into_iter().next()
}

#[cfg(all(test, windows))]
mod windows_path_tests {
    use super::normalize_windows_verbatim_path;
    use std::path::PathBuf;

    #[test]
    fn strips_windows_verbatim_drive_prefix() {
        assert_eq!(
            normalize_windows_verbatim_path(PathBuf::from(
                r"\\?\C:\QsyncData\Codex\Zinuto\apps\desktop\local-api\dist\index.js",
            )),
            PathBuf::from(r"C:\QsyncData\Codex\Zinuto\apps\desktop\local-api\dist\index.js"),
        );
    }

    #[test]
    fn strips_windows_verbatim_unc_prefix() {
        assert_eq!(
            normalize_windows_verbatim_path(PathBuf::from(
                r"\\?\UNC\server\share\apps\desktop\local-api\dist\index.js",
            )),
            PathBuf::from(r"\\server\share\apps\desktop\local-api\dist\index.js"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn packaged_runtime_lookup_follows_the_app_bundle() {
        assert!(!should_prefer_packaged_runtime_manifest(false));
        assert!(should_prefer_packaged_runtime_manifest(true));
    }

    #[test]
    fn current_runtime_manifest_shape_deserializes_and_resolves_packaged_paths() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time must be after the Unix epoch")
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!(
            "zinuto-runtime-manifest-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&temp_root).expect("create isolated runtime manifest directory");
        let manifest_path = temp_root.join("runtime-manifest.json");
        let manifest_json = serde_json::json!({
            "version": 1,
            "targetPlatform": current_backend_manifest_target_platform(),
            "runtimeBuildId": "backend-bundle:test-current-layout:1",
            "development": {
                "backendEntryRelativePath": "backend-runtime/apps/desktop/local-api/dist/runtime/index.js",
                "backendWorkingDirRelativePath": "backend-runtime",
                "nodeRuntimeEntryRelativePath": "../runtime/node/bin/node",
                "runtimeLibDirRelativePath": "node-runtime-libs"
            },
            "packaged": {
                "backendEntryRelativePath": "apps/desktop/local-api/dist/runtime/index.js",
                "backendWorkingDirRelativePath": ".",
                "nodeRuntimeEntryRelativePath": "../MacOS/zinuto-core-node",
                "runtimeLibDirRelativePath": "../lib"
            }
        });
        fs::write(
            &manifest_path,
            serde_json::to_vec_pretty(&manifest_json).expect("serialize current runtime manifest"),
        )
        .expect("write current runtime manifest");

        let resolved = read_backend_runtime_manifest(&manifest_path, true)
            .expect("current generated runtime manifest shape must remain readable");
        let path_set = backend_runtime_manifest_path_set(&resolved);
        assert_eq!(
            resolve_manifest_relative_path(&resolved, &path_set.backend_entry_relative_path),
            temp_root.join("apps/desktop/local-api/dist/runtime/index.js")
        );
        assert_eq!(path_set.backend_working_dir_relative_path, ".");
        assert_eq!(
            path_set.node_runtime_entry_relative_path,
            "../MacOS/zinuto-core-node"
        );

        fs::remove_dir_all(&temp_root).expect("remove isolated runtime manifest directory");
    }

    #[test]
    fn release_channel_is_community() {
        assert_eq!(desktop_release_channel(), "community");
    }

    #[test]
    fn backend_command_removes_inherited_akshare_sidecar_overrides() {
        let mut command = Command::new("zinuto-test-command");
        command
            .env(
                AKSHARE_TRUSTED_SIDECAR_PATH_ENV,
                "/tmp/untrusted-production",
            )
            .env(
                AKSHARE_DEVELOPMENT_SIDECAR_PATH_ENV,
                "/tmp/untrusted-development",
            );

        clear_inherited_akshare_sidecar_env(&mut command);

        let configured = command
            .get_envs()
            .map(|(key, value)| (key.to_owned(), value.map(ToOwned::to_owned)))
            .collect::<Vec<_>>();
        for key in [
            AKSHARE_TRUSTED_SIDECAR_PATH_ENV,
            AKSHARE_DEVELOPMENT_SIDECAR_PATH_ENV,
        ] {
            assert!(configured.iter().any(|(configured_key, value)| {
                configured_key == std::ffi::OsStr::new(key) && value.is_none()
            }));
        }
    }

    #[test]
    fn windows_proxy_parser_prefers_https_and_accepts_a_single_proxy_server() {
        assert_eq!(
            resolve_windows_https_proxy("http=127.0.0.1:7890;https=127.0.0.1:7897"),
            Some("http://127.0.0.1:7897".to_string()),
        );
        assert_eq!(
            resolve_windows_https_proxy("127.0.0.1:7897"),
            Some("http://127.0.0.1:7897".to_string()),
        );
    }

    #[test]
    fn windows_proxy_parser_falls_back_to_http_and_rejects_unsafe_values() {
        assert_eq!(
            resolve_windows_https_proxy(
                "socks=127.0.0.1:1080;http=https://proxy.example.test:8443"
            ),
            Some("https://proxy.example.test:8443".to_string()),
        );
        assert_eq!(resolve_windows_https_proxy("https= bad proxy"), None);
        assert_eq!(
            resolve_windows_https_proxy("ftp://proxy.example.test:21"),
            None
        );
    }
}
