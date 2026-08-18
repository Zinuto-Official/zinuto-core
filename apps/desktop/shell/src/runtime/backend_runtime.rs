// SPDX-License-Identifier: GPL-3.0-only

use std::fs;
#[cfg(unix)]
use std::io;
#[cfg(unix)]
use std::os::fd::AsRawFd;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use super::backend_startup_circuit::{BackendStartupCircuit, BackendStartupFailure};
use crate::bridge::transport::clear_backend_http_connection_pool;
use crate::platform::resolve_desktop_data_dir;
use tauri::Manager;

mod health;
mod launch;
mod preflight;
mod process;
mod reconciliation;
#[cfg(test)]
mod tests;
mod transport;

#[cfg(test)]
use health::{
    backend_orphan_endpoint_evidence_from_response, bounded_backend_health_probe_deadline,
    bounded_backend_health_probe_timeout,
};
use health::{
    fetch_backend_health, wait_for_backend_health, wait_for_spawned_backend_health,
    SpawnedBackendHealthOutcome,
};
pub(crate) use launch::desktop_release_channel;
use launch::{
    backend_runtime_state_release_channel_matches_current, backend_working_dir_from_entry,
    configure_akshare_sidecar_env, configure_backend_launch_environment,
    configure_backend_transport_env, configure_backtest_engine_env,
    configure_finance_data_reader_sidecar_env, generate_backend_bridge_secret,
    resolve_backend_launch_candidates, resolve_node_runtime_path, BackendLaunchCandidate,
};
#[allow(unused_imports)]
pub(crate) use preflight::{
    backend_startup_preflight_status, record_backend_startup_preflight_failed,
    record_backend_startup_preflight_failed_if_pending, record_backend_startup_preflight_pending,
    record_backend_startup_preflight_ready, BackendStartupPreflightStatus,
    BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1,
};
use preflight::{
    backend_startup_preflight_status_for, cached_backend_startup_failure, now_epoch_ms,
    record_backend_startup_success, record_cooldown_backend_startup_failure,
    record_latched_backend_startup_failure, restore_backend_startup_failure_status,
    tracked_backend_is_ready, BackendStartupCircuitState, BackendStartupPreflightState,
};
use process::{
    clear_starting_backend_pid, format_backend_startup_exit_status, record_starting_backend_pid,
    request_backend_pid_shutdown, request_tracked_child_shutdown, take_starting_backend_pid,
    terminate_backend_pid, terminate_tracked_child_process, tracked_backend_pid,
};
#[cfg(windows)]
use process::{pid_existence, ProcessExistence};
use reconciliation::{
    backend_health_owned_by_current_app, backend_transport_has_current_app_owner_hint,
    existing_backend_runtime_should_block_startup_wait, fail_closed_backend_reconciliation,
    reconcile_backend_runtime_before_startup,
};
#[cfg(windows)]
use transport::clear_backend_tcp_launch_port;
use transport::{
    backend_socket_is_connectable, cache_ready_backend_transport, cached_ready_backend_transport,
    clear_backend_socket_file, clear_cached_ready_backend_transport,
    prepare_backend_connect_failure_recovery, BackendConnectFailureRecovery,
    BackendReadyTransportState,
};
pub(crate) use transport::{
    resolve_backend_transport, BackendReadyTransportSnapshot, BackendTransport,
};

struct BackendProcess(Mutex<Option<Child>>);
struct BackendStartingProcessPid(Mutex<Option<u32>>);
struct BackendBridgeSecret(String);
struct BackendShutdownRequested(AtomicBool);
struct BackendReadyTransport(Mutex<BackendReadyTransportState>);
#[cfg(windows)]
struct BackendTcpLaunchPort(Mutex<Option<u16>>);

pub(crate) const BACKEND_BRIDGE_TOKEN_HEADER: &str = "X-Zinuto-Bridge-Token";
const BACKEND_EXISTING_RUNTIME_WAIT_TIMEOUT_MS: u64 = 2_500;
const BACKEND_HEALTH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);
const BACKEND_HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(100);
const BACKEND_CONNECTABILITY_PROBE_TIMEOUT: Duration = Duration::from_millis(150);
const BACKEND_STARTUP_GATE_POLL_INTERVAL: Duration = Duration::from_millis(500);
const BACKEND_STARTUP_HEALTH_TIMEOUT_MS: u64 = 20_000;
const BACKEND_BRIDGE_SECRET_ENV: &str = "ZINUTO_BACKEND_BRIDGE_SECRET";
const BACKEND_STARTUP_PROGRESS_ENV: &str = "ZINUTO_BACKEND_STARTUP_PROGRESS_PATH";
const BACKEND_RUNTIME_MANIFEST_DIGEST_ENV: &str = "ZINUTO_BACKEND_RUNTIME_MANIFEST_DIGEST";
const BACKTEST_ENGINE_BIN_ENV: &str = "ZINUTO_BACKTEST_ENGINE_BIN";
const BACKTEST_NATIVE_BATCH_ENV: &str = "ZINUTO_BACKTEST_NATIVE_BATCH";
const AKSHARE_TRUSTED_SIDECAR_PATH_ENV: &str = "ZINUTO_AKSHARE_TRUSTED_SIDECAR_PATH";
const AKSHARE_DEVELOPMENT_SIDECAR_PATH_ENV: &str = "ZINUTO_AKSHARE_SIDECAR_PATH";
#[cfg(windows)]
const BACKEND_TCP_HOST: &str = "127.0.0.1";
#[cfg(windows)]
const WINDOWS_CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn suppress_windows_console_window(command: &mut Command) {
    command.creation_flags(WINDOWS_CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn suppress_windows_console_window(_command: &mut Command) {}

#[allow(dead_code)]
#[derive(Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendRuntimeStateRecord {
    pid: u32,
    #[serde(default)]
    parent_pid: Option<u32>,
    #[serde(default)]
    runtime_build_id: String,
    #[serde(default)]
    release_channel: Option<String>,
    #[serde(default)]
    transport_type: Option<String>,
    #[serde(default)]
    socket_path: Option<String>,
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    started_at_ms: Option<u64>,
}

#[cfg(unix)]
struct FileLockLease {
    file: fs::File,
}

#[cfg(windows)]
struct FileLockLease {
    path: PathBuf,
}

#[cfg(unix)]
impl Drop for FileLockLease {
    fn drop(&mut self) {
        // SAFETY: flock operates on the live file descriptor owned by this lease.
        unsafe {
            libc::flock(self.file.as_raw_fd(), libc::LOCK_UN);
        }
    }
}

#[cfg(windows)]
impl Drop for FileLockLease {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[cfg(windows)]
#[derive(serde::Deserialize, serde::Serialize)]
struct BackendWindowsStartupLockRecord {
    pid: u32,
    acquired_at_ms: u64,
}

pub(crate) fn backend_shutdown_requested(app: &tauri::AppHandle) -> bool {
    app.try_state::<BackendShutdownRequested>()
        .map(|state| state.0.load(Ordering::Relaxed))
        .unwrap_or(false)
}

fn backend_startup_gate() -> &'static Mutex<()> {
    static BACKEND_STARTUP_GATE: OnceLock<Mutex<()>> = OnceLock::new();
    BACKEND_STARTUP_GATE.get_or_init(|| Mutex::new(()))
}

// The startup gate serializes backend bootstrap across requests. A concurrent
// startup can hold the gate for the whole health window, so a cancelled
// request must not block behind it: poll every 500ms and return immediately
// when the request is cancelled instead of waiting for the lock to clear.
fn acquire_backend_startup_gate(
    is_cancelled: &dyn Fn() -> bool,
) -> Result<std::sync::MutexGuard<'static, ()>, String> {
    let gate = backend_startup_gate();
    loop {
        match gate.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err("BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string());
            }
            Err(std::sync::TryLockError::WouldBlock) => {}
        }
        if is_cancelled() {
            return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
        }
        thread::sleep(BACKEND_STARTUP_GATE_POLL_INTERVAL);
    }
}

pub(crate) fn mark_backend_shutdown_requested(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<BackendShutdownRequested>() {
        state.0.store(true, Ordering::Relaxed);
    }
}

pub(crate) fn backend_bridge_secret(app: &tauri::AppHandle) -> Option<String> {
    let state = app.try_state::<BackendBridgeSecret>()?;
    let value = state.0.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.to_string())
}

#[cfg(unix)]
fn acquire_file_lock_lease(lease_path: &Path, timeout_ms: u64) -> Result<FileLockLease, String> {
    let started_at = Instant::now();
    loop {
        let file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lease_path)
            .map_err(|_| "BACKEND_LOCK_UNAVAILABLE".to_string())?;
        // SAFETY: flock operates on the live file descriptor owned by this file handle.
        let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if result == 0 {
            return Ok(FileLockLease { file });
        }

        let error = io::Error::last_os_error();
        let would_block = error
            .raw_os_error()
            .map(|code| code == libc::EWOULDBLOCK || code == libc::EAGAIN)
            .unwrap_or(false);
        if !would_block {
            return Err("BACKEND_LOCK_UNAVAILABLE".to_string());
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            return Err("BACKEND_LOCK_TIMEOUT".to_string());
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(unix)]
fn acquire_backend_startup_lease(
    app: &tauri::AppHandle,
    timeout_ms: u64,
) -> Result<FileLockLease, String> {
    let data_dir = resolve_desktop_data_dir(app)
        .ok_or_else(|| "BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string())?;
    acquire_file_lock_lease(&data_dir.join("zinuto-backend-startup.lock"), timeout_ms)
        .map_err(|_| "BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string())
}

#[cfg(windows)]
fn read_windows_backend_startup_lock_record(
    lease_path: &Path,
) -> Option<BackendWindowsStartupLockRecord> {
    let raw = fs::read_to_string(lease_path.join("owner.json")).ok()?;
    serde_json::from_str::<BackendWindowsStartupLockRecord>(&raw).ok()
}

#[cfg(windows)]
fn windows_backend_startup_lock_is_stale(lease_path: &Path) -> bool {
    if let Some(record) = read_windows_backend_startup_lock_record(lease_path) {
        // Only a probe that provably shows the owner is gone makes the lock
        // stale; a failed tasklist probe must not authorize deleting the lock
        // directory (SH-M5).
        return pid_existence(record.pid) == ProcessExistence::Missing;
    }
    fs::metadata(lease_path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.elapsed().ok())
        .map(|elapsed| elapsed >= Duration::from_secs(2))
        .unwrap_or(true)
}

#[cfg(windows)]
fn acquire_backend_startup_lease(
    app: &tauri::AppHandle,
    timeout_ms: u64,
) -> Result<FileLockLease, String> {
    let data_dir = resolve_desktop_data_dir(app)
        .ok_or_else(|| "BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string())?;
    let lease_path = data_dir.join("zinuto-backend-startup.lock");
    let started_at = Instant::now();
    loop {
        match fs::create_dir(&lease_path) {
            Ok(()) => {
                let record = BackendWindowsStartupLockRecord {
                    pid: std::process::id(),
                    acquired_at_ms: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|value| value.as_millis() as u64)
                        .unwrap_or(0),
                };
                let record_bytes = serde_json::to_vec_pretty(&record)
                    .map_err(|_| "BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string())?;
                if fs::write(lease_path.join("owner.json"), record_bytes).is_err() {
                    let _ = fs::remove_dir_all(&lease_path);
                    return Err("BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string());
                }
                return Ok(FileLockLease { path: lease_path });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if windows_backend_startup_lock_is_stale(&lease_path) {
                    let _ = fs::remove_dir_all(&lease_path);
                    continue;
                }
                if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
                    return Err("BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string());
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return Err("BACKEND_STARTUP_LOCK_UNAVAILABLE".to_string()),
        }
    }
}

fn resolve_backend_runtime_state_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let data_dir = resolve_desktop_data_dir(app)?;
    Some(data_dir.join("zinuto-backend-runtime.json"))
}

fn resolve_backend_startup_progress_path(data_dir: &Path) -> PathBuf {
    data_dir.join("zinuto-backend-startup-progress.json")
}

fn clear_backend_startup_progress_file(progress_path: &Path) {
    if progress_path.exists() {
        let _ = fs::remove_file(progress_path);
    }
}

fn clear_backend_runtime_state_file(app: &tauri::AppHandle) {
    let Some(state_path) = resolve_backend_runtime_state_path(app) else {
        return;
    };
    if state_path.exists() {
        let _ = fs::remove_file(state_path);
    }
}

fn read_backend_runtime_state(app: &tauri::AppHandle) -> Option<BackendRuntimeStateRecord> {
    let state_path = resolve_backend_runtime_state_path(app)?;
    let raw = fs::read_to_string(state_path).ok()?;
    serde_json::from_str::<BackendRuntimeStateRecord>(&raw).ok()
}

fn candidate_build_id_matches(
    candidates: &[BackendLaunchCandidate],
    runtime_build_id: &str,
) -> bool {
    candidates
        .iter()
        .any(|candidate| candidate.runtime_build_id == runtime_build_id)
}

struct BackendSpawnContext<'a> {
    app: &'a tauri::AppHandle,
    data_dir: &'a Path,
    node_runtime_entry: &'a Path,
    transport: &'a BackendTransport,
    parent_pid: u32,
    runtime_state_path: &'a Path,
    startup_progress_path: &'a Path,
    bridge_secret: &'a str,
    desktop_app_version: &'a str,
}

fn spawn_backend_node(
    candidate: &BackendLaunchCandidate,
    context: &BackendSpawnContext<'_>,
) -> Result<Child, String> {
    let mut cmd = Command::new(context.node_runtime_entry);
    suppress_windows_console_window(&mut cmd);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Start the backend in its own process group so termination can signal
        // the whole group (killpg semantics) instead of only the leader, which
        // could orphan worker threads or child helpers.
        cmd.process_group(0);
    }

    cmd.arg(&candidate.entry)
        .args(&candidate.arguments)
        .env("NODE_ENV", "production")
        .env("ZINUTO_BACKEND_BUILD_ID", &candidate.runtime_build_id)
        .env(
            BACKEND_RUNTIME_MANIFEST_DIGEST_ENV,
            &candidate.runtime_manifest_digest,
        )
        .env("ZINUTO_DESKTOP_APP_VERSION", context.desktop_app_version)
        .env("ZINUTO_BACKEND_PARENT_PID", context.parent_pid.to_string())
        .env(
            "ZINUTO_BACKEND_RUNTIME_STATE_PATH",
            context.runtime_state_path.to_string_lossy().to_string(),
        )
        .env(
            BACKEND_STARTUP_PROGRESS_ENV,
            context.startup_progress_path.to_string_lossy().to_string(),
        )
        .env(BACKEND_BRIDGE_SECRET_ENV, context.bridge_secret)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    cmd.env("ZINUTO_DATA_DIR", context.data_dir);
    configure_backend_launch_environment(&mut cmd);
    configure_backend_transport_env(&mut cmd, context.transport);
    configure_backtest_engine_env(&mut cmd, context.app);
    configure_akshare_sidecar_env(&mut cmd, context.app);
    configure_finance_data_reader_sidecar_env(&mut cmd, context.app);

    if let Some(cwd) = candidate
        .working_dir
        .clone()
        .or_else(|| backend_working_dir_from_entry(&candidate.entry))
    {
        cmd.current_dir(cwd);
    }

    cmd.spawn().map_err(|error| format!("{:?}", error.kind()))
}

fn wait_for_backend_runtime_state(
    app: &tauri::AppHandle,
    expected_pid: u32,
    expected_parent_pid: u32,
    timeout_ms: u64,
) -> bool {
    let started_at = Instant::now();
    loop {
        if backend_shutdown_requested(app) {
            return false;
        }
        if let Some(state) = read_backend_runtime_state(app) {
            if state.pid == expected_pid
                && state.parent_pid == Some(expected_parent_pid)
                && backend_runtime_state_release_channel_matches_current(&state)
            {
                return true;
            }
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            return false;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn replace_tracked_backend_child(app: &tauri::AppHandle, child: Child) {
    let mut next_child = child;
    if backend_shutdown_requested(app) {
        terminate_tracked_child_process(&mut next_child);
        return;
    }
    if let Some(state) = app.try_state::<BackendProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(existing) = guard.as_mut() {
                terminate_tracked_child_process(existing);
            }
            *guard = Some(next_child);
        } else {
            eprintln!("[backend_runtime] mutex poisoned in replace_tracked_backend_child");
        }
    }
}

fn terminate_backend_owned_by_current_app(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
    current_app_pid: u32,
) {
    let mut terminated_tracked_pid: Option<u32> = None;

    if let Some(state) = app.try_state::<BackendProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.as_mut() {
                let pid = child.id();
                terminate_tracked_child_process(child);
                terminated_tracked_pid = Some(pid);
            }
            *guard = None;
        } else {
            eprintln!("[backend_runtime] mutex poisoned in terminate_backend_owned_by_current_app");
        }
    }

    if let Some(state) = read_backend_runtime_state(app) {
        let owned_by_current_app = state.parent_pid == Some(current_app_pid)
            && backend_runtime_state_release_channel_matches_current(&state);
        let already_terminated = terminated_tracked_pid
            .map(|pid| pid == state.pid)
            .unwrap_or(false);
        if owned_by_current_app && !already_terminated {
            let _ = terminate_backend_pid(state.pid);
        }
    }

    clear_backend_runtime_state_file(app);
    clear_backend_socket_file(transport);
    #[cfg(windows)]
    clear_backend_tcp_launch_port(app);
}

fn ensure_backend_ready_with_tracking(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
) -> Result<String, String> {
    if backend_shutdown_requested(app) {
        record_backend_startup_preflight_failed(
            app,
            "runtimeState",
            "BACKEND_SHUTDOWN_REQUESTED",
            "Backend shutdown was requested before startup completed",
        );
        return Err("BACKEND_NOT_READY".to_string());
    }
    let current_app_pid = std::process::id();
    let data_dir = resolve_desktop_data_dir(app).ok_or_else(|| {
        record_backend_startup_preflight_failed(
            app,
            "manifest",
            "BACKEND_TRANSPORT_UNAVAILABLE",
            &format!(
                "{} data directory could not be resolved",
                crate::DESKTOP_PRODUCT_NAME
            ),
        );
        "BACKEND_TRANSPORT_UNAVAILABLE".to_string()
    })?;
    let node_runtime_entry = match resolve_node_runtime_path(app) {
        Some(value) => value,
        None => {
            eprintln!(
                "[zinuto] Node runtime not found. Please provide bundled helper at apps/desktop/shell/runtime/node/bin/node for build-time packaging."
            );
            record_backend_startup_preflight_failed(
                app,
                "nodeRuntime",
                "BACKEND_NODE_RUNTIME_NOT_FOUND",
                "Bundled Node runtime was not found",
            );
            return Err("BACKEND_NOT_READY".to_string());
        }
    };
    let candidates = resolve_backend_launch_candidates(app, &node_runtime_entry);
    if candidates.is_empty() {
        record_backend_startup_preflight_failed(
            app,
            "manifest",
            "BACKEND_RUNTIME_MANIFEST_EMPTY",
            "No backend runtime launch candidate was found",
        );
        return Err("BACKEND_NOT_READY".to_string());
    }
    let current_runtime_build_id = candidates[0].runtime_build_id.as_str();
    if let Some(failure) = cached_backend_startup_failure(app, current_runtime_build_id) {
        restore_backend_startup_failure_status(app, &failure);
        return Err(failure.error_code);
    }
    record_backend_startup_preflight_pending(app, "transport");
    let bridge_secret =
        backend_bridge_secret(app).ok_or_else(|| "BACKEND_NOT_READY".to_string())?;
    let runtime_state_path = resolve_backend_runtime_state_path(app).ok_or_else(|| {
        record_backend_startup_preflight_failed(
            app,
            "runtimeState",
            "BACKEND_TRANSPORT_UNAVAILABLE",
            "Backend runtime state path could not be resolved",
        );
        "BACKEND_TRANSPORT_UNAVAILABLE".to_string()
    })?;
    let startup_progress_path = resolve_backend_startup_progress_path(data_dir.as_path());

    let _startup_lease = acquire_backend_startup_lease(app, 10_000).inspect_err(|_error| {
        record_backend_startup_preflight_failed(
            app,
            "startupLease",
            "BACKEND_STARTUP_LOCK_UNAVAILABLE",
            "Backend startup lease could not be acquired",
        );
    })?;
    reconcile_backend_runtime_before_startup(
        app,
        transport,
        current_app_pid,
        &candidates,
        node_runtime_entry.as_path(),
        bridge_secret.as_str(),
        current_runtime_build_id,
    )?;
    let should_wait_for_existing_backend =
        existing_backend_runtime_should_block_startup_wait(app, current_app_pid, &candidates);

    // Validate an existing runtime once per recovery pass. When its state says
    // it is still starting, the same bounded polling window also serves as the
    // validation probe; do not add separate probes before and after it.
    let observed_health = if should_wait_for_existing_backend {
        wait_for_backend_health(
            app,
            transport,
            None,
            BACKEND_EXISTING_RUNTIME_WAIT_TIMEOUT_MS,
        )
    } else {
        fetch_backend_health(app, transport).ok()
    };
    if let Some(health) = observed_health.as_ref() {
        if backend_health_owned_by_current_app(app, health, current_app_pid)
            && candidate_build_id_matches(&candidates, &health.runtime_build_id)
        {
            return Ok(health.runtime_build_id.clone());
        }
    }

    // A listening socket is not proof of health: a wedged Node process can still
    // accept a connection while never answering /health. The bounded wait above
    // is the readiness decision; once it expires, recycle only a runtime that we
    // can prove belongs to this app instance.
    let current_app_backend_stale =
        backend_transport_has_current_app_owner_hint(app, current_app_pid, &candidates);
    if current_app_backend_stale {
        eprintln!(
            "[zinuto] tracked backend is unhealthy; terminating stale backend before respawn"
        );
        terminate_backend_owned_by_current_app(app, transport, current_app_pid);
    }

    if backend_socket_is_connectable(transport) {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_TRANSPORT_OCCUPIED_UNVERIFIED",
            "Backend transport remained occupied after runtime recovery",
        );
    }
    clear_backend_socket_file(transport);
    clear_backend_runtime_state_file(app);

    let desktop_app_version = app.package_info().version.to_string();

    for candidate in &candidates {
        clear_backend_startup_progress_file(startup_progress_path.as_path());
        record_backend_startup_preflight_pending(app, "spawn");
        if backend_shutdown_requested(app) {
            return Err("BACKEND_NOT_READY".to_string());
        }
        let spawn_context = BackendSpawnContext {
            app,
            data_dir: data_dir.as_path(),
            node_runtime_entry: &node_runtime_entry,
            transport,
            parent_pid: current_app_pid,
            runtime_state_path: runtime_state_path.as_path(),
            startup_progress_path: startup_progress_path.as_path(),
            bridge_secret: bridge_secret.as_str(),
            desktop_app_version: desktop_app_version.as_str(),
        };
        let mut child = match spawn_backend_node(candidate, &spawn_context) {
            Ok(child) => child,
            Err(io_kind) => {
                let error_code = "BACKEND_RUNTIME_SPAWN_FAILED";
                let error_message =
                    format!("Backend runtime process could not be started (ioKind={io_kind})");
                record_latched_backend_startup_failure(
                    app,
                    candidate.runtime_build_id.as_str(),
                    "spawn",
                    error_code,
                    error_message.as_str(),
                );
                return Err(error_code.to_string());
            }
        };
        let child_pid = child.id();
        record_starting_backend_pid(app, child_pid);
        record_backend_startup_preflight_pending(app, "health");
        let health_outcome = wait_for_spawned_backend_health(
            app,
            &mut child,
            transport,
            candidate.runtime_build_id.as_str(),
            current_app_pid,
            startup_progress_path.as_path(),
            BACKEND_STARTUP_HEALTH_TIMEOUT_MS,
        );
        if backend_shutdown_requested(app) {
            terminate_tracked_child_process(&mut child);
            clear_starting_backend_pid(app, child_pid);
            clear_backend_socket_file(transport);
            clear_backend_runtime_state_file(app);
            clear_backend_startup_progress_file(startup_progress_path.as_path());
            return Err("BACKEND_NOT_READY".to_string());
        }
        match health_outcome {
            SpawnedBackendHealthOutcome::ShutdownRequested => {
                terminate_tracked_child_process(&mut child);
                clear_starting_backend_pid(app, child_pid);
                clear_backend_socket_file(transport);
                clear_backend_runtime_state_file(app);
                clear_backend_startup_progress_file(startup_progress_path.as_path());
                return Err("BACKEND_NOT_READY".to_string());
            }
            SpawnedBackendHealthOutcome::Exited(status) => {
                let status_detail = format_backend_startup_exit_status(status);
                let error_code = "BACKEND_RUNTIME_EXITED_DURING_STARTUP";
                let error_message =
                    format!("Backend runtime exited during startup ({status_detail})");
                clear_starting_backend_pid(app, child_pid);
                clear_backend_socket_file(transport);
                clear_backend_runtime_state_file(app);
                clear_backend_startup_progress_file(startup_progress_path.as_path());
                eprintln!(
                    "[zinuto] backend runtime exited during startup: {}",
                    status_detail
                );
                record_latched_backend_startup_failure(
                    app,
                    candidate.runtime_build_id.as_str(),
                    "health",
                    error_code,
                    error_message.as_str(),
                );
                return Err(error_code.to_string());
            }
            SpawnedBackendHealthOutcome::Ready { backend_pid } => {
                record_backend_startup_preflight_pending(app, "runtimeState");
                if wait_for_backend_runtime_state(app, backend_pid, current_app_pid, 8_000) {
                    let runtime_build_id = candidate.runtime_build_id.clone();
                    clear_starting_backend_pid(app, child_pid);
                    clear_backend_startup_progress_file(startup_progress_path.as_path());
                    replace_tracked_backend_child(app, child);
                    return Ok(runtime_build_id);
                }
            }
            SpawnedBackendHealthOutcome::TimedOut => {}
        }
        terminate_tracked_child_process(&mut child);
        clear_starting_backend_pid(app, child_pid);
        clear_backend_socket_file(transport);
        clear_backend_runtime_state_file(app);
        clear_backend_startup_progress_file(startup_progress_path.as_path());
    }

    record_cooldown_backend_startup_failure(
        app,
        current_runtime_build_id,
        "health",
        "BACKEND_RUNTIME_STARTUP_TIMEOUT",
        "Backend runtime did not become healthy before the startup deadline",
    );
    Err("BACKEND_RUNTIME_STARTUP_TIMEOUT".to_string())
}

fn backend_startup_error_requires_fail_closed(error_code: &str) -> bool {
    matches!(
        error_code,
        "BACKEND_ORPHAN_IDENTITY_UNVERIFIED"
            | "BACKEND_ORPHAN_TERMINATION_FAILED"
            | "BACKEND_RUNTIME_OWNED_BY_ANOTHER_SHELL"
            | "BACKEND_TRANSPORT_OCCUPIED_UNVERIFIED"
    )
}

// Non-Windows builds intentionally make one attempt; Windows uses the same
// loop for bounded transport reallocation retries.
#[cfg_attr(not(windows), allow(clippy::never_loop))]
fn ensure_backend_ready_locked(
    app: &tauri::AppHandle,
    initial_transport: &BackendTransport,
) -> Result<BackendReadyTransportSnapshot, String> {
    #[allow(unused_mut)]
    let mut transport = initial_transport.clone();
    let mut last_error = String::from("BACKEND_NOT_READY");
    #[cfg(windows)]
    let max_attempts = 3usize;
    #[cfg(not(windows))]
    let max_attempts = 1usize;
    if tracked_backend_is_ready(app) {
        if let Some(ready_transport) = cached_ready_backend_transport(app) {
            return Ok(ready_transport);
        }
    }

    for _attempt_index in 0..max_attempts {
        if backend_shutdown_requested(app) {
            return Err(last_error);
        }
        match ensure_backend_ready_with_tracking(app, &transport) {
            Ok(runtime_build_id) => {
                let Some(ready_transport) = cache_ready_backend_transport(app, &transport) else {
                    let error_code = "BACKEND_TRANSPORT_UNAVAILABLE";
                    record_backend_startup_preflight_failed(
                        app,
                        "transport",
                        error_code,
                        "Backend transport could not be cached after startup",
                    );
                    return Err(error_code.to_string());
                };
                record_backend_startup_success(app, runtime_build_id.as_str());
                record_backend_startup_preflight_ready(app);
                return Ok(ready_transport);
            }
            Err(error) => {
                last_error = error;
                if backend_startup_error_requires_fail_closed(last_error.as_str()) {
                    return Err(last_error);
                }
                #[cfg(windows)]
                {
                    if backend_shutdown_requested(app) {
                        return Err(last_error);
                    }
                    if _attempt_index + 1 >= max_attempts {
                        break;
                    }
                    clear_backend_runtime_state_file(app);
                    clear_backend_socket_file(&transport);
                    clear_backend_tcp_launch_port(app);
                    transport = resolve_backend_transport(app)
                        .ok_or_else(|| "BACKEND_TRANSPORT_UNAVAILABLE".to_string())?;
                    continue;
                }
                #[cfg(not(windows))]
                {
                    break;
                }
            }
        }
    }

    Err(last_error)
}

// A FAILED preflight is a terminal gate for new bridge requests, so the ready
// transport cache below is only consulted while the preflight is READY. The
// cached snapshot stays intact after a FAILED preflight: it is simply bypassed
// and the next READY state re-validates it by revision before use.
pub(crate) fn ensure_backend_ready(
    app: &tauri::AppHandle,
    initial_transport: &BackendTransport,
) -> Result<BackendReadyTransportSnapshot, String> {
    ensure_backend_ready_cancellable(app, initial_transport, &|| false)
}

fn ensure_backend_ready_cancellable(
    app: &tauri::AppHandle,
    initial_transport: &BackendTransport,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BackendReadyTransportSnapshot, String> {
    let _startup_guard = acquire_backend_startup_gate(is_cancelled)?;
    if is_cancelled() {
        return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
    }
    ensure_backend_ready_locked(app, initial_transport)
}

pub(crate) fn recover_backend_ready_transport_after_connect_failure(
    app: &tauri::AppHandle,
    failed_transport: &BackendReadyTransportSnapshot,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BackendReadyTransportSnapshot, String> {
    let _startup_guard = acquire_backend_startup_gate(is_cancelled)?;
    if is_cancelled() {
        return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
    }

    let recovery = app
        .try_state::<BackendReadyTransport>()
        .ok_or_else(|| "BACKEND_TRANSPORT_UNAVAILABLE".to_string())?
        .0
        .lock()
        .map(|mut state| prepare_backend_connect_failure_recovery(&mut state, failed_transport))
        .map_err(|_| "BACKEND_TRANSPORT_UNAVAILABLE".to_string())?;
    match recovery {
        // Another request completed recovery while this request was still
        // connecting to an older generation. Reuse it without clearing or
        // restarting the newer runtime.
        BackendConnectFailureRecovery::Reuse(ready_transport) => return Ok(ready_transport),
        BackendConnectFailureRecovery::Recover {
            invalidated_failed_generation,
        } => {
            if invalidated_failed_generation {
                clear_backend_http_connection_pool(app);
            }
        }
    }

    ensure_backend_ready_locked(app, failed_transport.transport())
}

pub(crate) fn invalidate_backend_ready_transport_after_http_failure(
    app: &tauri::AppHandle,
    failed_transport: &BackendReadyTransportSnapshot,
) -> bool {
    let Some(state) = app.try_state::<BackendReadyTransport>() else {
        return false;
    };
    let invalidated = match state.0.lock() {
        Ok(mut guard) => {
            let matches_failure = guard.revision == failed_transport.revision
                && guard.transport.as_ref() == Some(failed_transport.transport());
            if matches_failure {
                guard.transport = None;
                guard.revision = guard.revision.wrapping_add(1);
            }
            matches_failure
        }
        Err(_) => {
            eprintln!(
                "[backend_runtime] ready transport mutex poisoned while invalidating HTTP failure"
            );
            false
        }
    };
    if !invalidated {
        return false;
    }

    // Do not restart here: a mutation may already have reached the backend.
    // Removing only this exact endpoint generation makes the next request run
    // the bounded health/ownership recovery path without replaying this one.
    // The generation compare is atomic under the readiness mutex, so a late
    // failure cannot erase a transport cached by a concurrent recovery pass.
    clear_backend_http_connection_pool(app);
    true
}

pub(crate) fn resolve_ready_backend_transport(
    app: &tauri::AppHandle,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BackendReadyTransportSnapshot, String> {
    if tracked_backend_is_ready(app) {
        if let Some(transport) = cached_ready_backend_transport(app) {
            return Ok(transport);
        }
    } else {
        clear_cached_ready_backend_transport(app);
    }
    let transport = resolve_backend_transport(app)
        .ok_or_else(|| "BACKEND_TRANSPORT_UNAVAILABLE".to_string())?;
    ensure_backend_ready_cancellable(app, &transport, is_cancelled)
}

pub(crate) fn initialize_backend_runtime_state(app: &tauri::App) {
    app.manage(BackendProcess(Mutex::new(None)));
    app.manage(BackendStartingProcessPid(Mutex::new(None)));
    app.manage(BackendBridgeSecret(generate_backend_bridge_secret()));
    app.manage(BackendShutdownRequested(AtomicBool::new(false)));
    app.manage(BackendStartupCircuitState(Mutex::new(
        BackendStartupCircuit::default(),
    )));
    app.manage(BackendReadyTransport(Mutex::new(
        BackendReadyTransportState {
            transport: None,
            revision: 0,
        },
    )));
    app.manage(BackendStartupPreflightState(Mutex::new(
        backend_startup_preflight_status_for("PENDING", "bootstrap", None, None),
    )));
    #[cfg(windows)]
    app.manage(BackendTcpLaunchPort(Mutex::new(None)));
}

pub(crate) fn terminate_tracked_backend_on_exit(app: &tauri::AppHandle) {
    clear_cached_ready_backend_transport(app);
    if let Some(state) = app.try_state::<BackendProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.as_mut() {
                terminate_tracked_child_process(child);
            }
            *guard = None;
        } else {
            eprintln!("[backend_runtime] mutex poisoned in terminate_tracked_backend_on_exit");
        }
    }
    if let Some(pid) = take_starting_backend_pid(app) {
        let _ = terminate_backend_pid(pid);
    }
}

pub(crate) fn request_tracked_backend_shutdown(app: &tauri::AppHandle) {
    clear_cached_ready_backend_transport(app);
    if let Some(state) = app.try_state::<BackendProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = request_tracked_child_shutdown(child);
            }
        } else {
            eprintln!("[backend_runtime] mutex poisoned in request_tracked_backend_shutdown");
        }
    }
    if let Some(pid) = take_starting_backend_pid(app) {
        let _ = request_backend_pid_shutdown(pid);
    }
}
