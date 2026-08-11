// SPDX-License-Identifier: GPL-3.0-only

use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use crate::runtime::backend_orphan::{
    inspect_backend_process, validate_backend_orphan_identity, BackendOrphanEndpointEvidence,
    BackendOrphanValidation, BackendOrphanValidationError, BackendProcessIdentity,
};
use crate::runtime::backend_startup_progress::STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS;

use super::health::{probe_backend_orphan_endpoint, BackendHealthPayload};
use super::launch::{
    backend_runtime_state_release_channel_matches_current, desktop_release_channel,
    BackendLaunchCandidate,
};
#[cfg(unix)]
use super::process::send_signal_to_pid;
use super::process::{pid_exists, tracked_backend_pid};
#[cfg(windows)]
use super::suppress_windows_console_window;
#[cfg(windows)]
use super::transport::clear_backend_tcp_launch_port;
use super::transport::{
    backend_socket_is_connectable, clear_backend_socket_file, BackendTransport,
};
use super::{
    candidate_build_id_matches, clear_backend_runtime_state_file, now_epoch_ms,
    read_backend_runtime_state, record_latched_backend_startup_failure,
    resolve_backend_runtime_state_path, BackendRuntimeStateRecord,
};

pub(super) fn backend_health_owned_by_current_app(
    app: &tauri::AppHandle,
    health: &BackendHealthPayload,
    current_app_pid: u32,
) -> bool {
    if tracked_backend_pid(app)
        .map(|pid| pid == health.pid)
        .unwrap_or(false)
    {
        return true;
    }
    read_backend_runtime_state(app)
        .map(|state| {
            state.pid == health.pid
                && state.parent_pid == Some(current_app_pid)
                && state.runtime_build_id == health.runtime_build_id
                && backend_runtime_state_release_channel_matches_current(&state)
        })
        .unwrap_or(false)
}

pub(super) fn existing_backend_runtime_should_block_startup_wait(
    app: &tauri::AppHandle,
    current_app_pid: u32,
    candidates: &[BackendLaunchCandidate],
) -> bool {
    if tracked_backend_pid(app).is_some() {
        return true;
    }
    read_backend_runtime_state(app)
        .map(|state| {
            state.parent_pid == Some(current_app_pid)
                && pid_exists(state.pid)
                && candidate_build_id_matches(candidates, &state.runtime_build_id)
                && backend_runtime_state_release_channel_matches_current(&state)
        })
        .unwrap_or(false)
}

pub(super) fn backend_transport_has_current_app_owner_hint(
    app: &tauri::AppHandle,
    current_app_pid: u32,
    candidates: &[BackendLaunchCandidate],
) -> bool {
    if tracked_backend_pid(app).is_some() {
        return true;
    }
    read_backend_runtime_state(app)
        .map(|state| {
            state.parent_pid == Some(current_app_pid)
                && pid_exists(state.pid)
                && candidate_build_id_matches(candidates, &state.runtime_build_id)
                && backend_runtime_state_release_channel_matches_current(&state)
        })
        .unwrap_or(false)
}

fn backend_runtime_state_transport_matches(
    state: &BackendRuntimeStateRecord,
    transport: &BackendTransport,
) -> bool {
    match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => {
            state.transport_type.as_deref() == Some("unix")
                && state
                    .socket_path
                    .as_deref()
                    .map(Path::new)
                    .map(|state_path| state_path == socket_path.as_path())
                    .unwrap_or(false)
        }
        #[cfg(windows)]
        BackendTransport::Tcp { host, port } => {
            state.transport_type.as_deref() == Some("tcp")
                && state.host.as_deref() == Some(host.as_str())
                && state.port == Some(*port)
        }
    }
}

fn backend_runtime_state_file_exists(app: &tauri::AppHandle) -> bool {
    resolve_backend_runtime_state_path(app)
        .map(|path| path.is_file())
        .unwrap_or(false)
}

fn validate_observed_backend_orphan(
    state: &BackendRuntimeStateRecord,
    current_app_pid: u32,
    process: &BackendProcessIdentity,
    endpoint: &BackendOrphanEndpointEvidence,
    node_runtime_entry: &Path,
    backend_entries: &[PathBuf],
) -> Result<(), BackendOrphanValidationError> {
    let state_parent_is_live = state
        .parent_pid
        .filter(|pid| *pid > 1)
        .map(pid_exists)
        .unwrap_or(false);
    validate_backend_orphan_identity(&BackendOrphanValidation {
        state_pid: state.pid,
        state_parent_pid: state.parent_pid,
        state_started_at_ms: state.started_at_ms,
        state_runtime_build_id: state.runtime_build_id.as_str(),
        state_release_channel: state.release_channel.as_deref(),
        current_app_pid,
        current_release_channel: desktop_release_channel(),
        state_parent_is_live,
        process,
        expected_node_runtime: node_runtime_entry,
        expected_backend_entries: backend_entries,
        endpoint,
        now_ms: now_epoch_ms(),
        max_state_write_delay_ms: STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS.saturating_add(300_000),
        allow_init_reparent: cfg!(target_os = "macos"),
        case_insensitive_paths: cfg!(windows),
    })
}

pub(super) fn fail_closed_backend_reconciliation<T>(
    app: &tauri::AppHandle,
    current_runtime_build_id: &str,
    error_code: &str,
    error_message: &str,
) -> Result<T, String> {
    record_latched_backend_startup_failure(
        app,
        current_runtime_build_id,
        "orphanReconciliation",
        error_code,
        error_message,
    );
    Err(error_code.to_string())
}

fn wait_for_specific_backend_process_exit(
    expected: &BackendProcessIdentity,
    timeout_ms: u64,
) -> bool {
    let started_at = Instant::now();
    loop {
        if !pid_exists(expected.pid) {
            return true;
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            return inspect_backend_process(expected.pid)
                .map(|observed| observed != *expected)
                .unwrap_or(false);
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(unix)]
fn terminate_verified_backend_orphan(expected: &BackendProcessIdentity) -> bool {
    if inspect_backend_process(expected.pid).as_ref() != Some(expected) {
        return false;
    }
    if send_signal_to_pid(expected.pid, libc::SIGTERM)
        && wait_for_specific_backend_process_exit(expected, 4_000)
    {
        return true;
    }
    match inspect_backend_process(expected.pid) {
        Some(observed) if observed == *expected => {}
        Some(_) => return true,
        None => return !pid_exists(expected.pid),
    }
    send_signal_to_pid(expected.pid, libc::SIGKILL)
        && wait_for_specific_backend_process_exit(expected, 2_000)
}

#[cfg(windows)]
fn terminate_verified_backend_orphan(expected: &BackendProcessIdentity) -> bool {
    if inspect_backend_process(expected.pid).as_ref() != Some(expected) {
        return false;
    }
    let Some(system_root) = std::env::var_os("SystemRoot") else {
        return false;
    };
    let taskkill = PathBuf::from(system_root)
        .join("System32")
        .join("taskkill.exe");
    if !taskkill.is_file() {
        return false;
    }
    let mut graceful_command = Command::new(taskkill.as_path());
    suppress_windows_console_window(&mut graceful_command);
    let graceful = graceful_command
        .args(["/PID", &expected.pid.to_string(), "/T"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if graceful && wait_for_specific_backend_process_exit(expected, 4_000) {
        return true;
    }
    match inspect_backend_process(expected.pid) {
        Some(observed) if observed == *expected => {}
        Some(_) => return true,
        None => return !pid_exists(expected.pid),
    }
    let mut forceful_command = Command::new(taskkill);
    suppress_windows_console_window(&mut forceful_command);
    let forceful = forceful_command
        .args(["/PID", &expected.pid.to_string(), "/T", "/F"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    forceful && wait_for_specific_backend_process_exit(expected, 2_000)
}

pub(super) fn reconcile_backend_runtime_before_startup(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
    current_app_pid: u32,
    candidates: &[BackendLaunchCandidate],
    node_runtime_entry: &Path,
    bridge_secret: &str,
    current_runtime_build_id: &str,
) -> Result<(), String> {
    let socket_connectable = backend_socket_is_connectable(transport);
    let Some(state) = read_backend_runtime_state(app) else {
        if backend_runtime_state_file_exists(app) {
            return fail_closed_backend_reconciliation(
                app,
                current_runtime_build_id,
                "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
                "Backend runtime state exists but its ownership evidence is invalid",
            );
        }
        if socket_connectable {
            return fail_closed_backend_reconciliation(
                app,
                current_runtime_build_id,
                "BACKEND_TRANSPORT_OCCUPIED_UNVERIFIED",
                "Backend transport is occupied without verifiable runtime ownership",
            );
        }
        clear_backend_socket_file(transport);
        return Ok(());
    };

    if state.pid <= 1 {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend runtime state contains an invalid process identity",
        );
    }
    if !pid_exists(state.pid) {
        if socket_connectable {
            return fail_closed_backend_reconciliation(
                app,
                current_runtime_build_id,
                "BACKEND_TRANSPORT_OCCUPIED_UNVERIFIED",
                "Backend transport remains occupied after its recorded process exited",
            );
        }
        clear_backend_runtime_state_file(app);
        clear_backend_socket_file(transport);
        return Ok(());
    }

    if state.parent_pid == Some(current_app_pid) {
        if !backend_runtime_state_release_channel_matches_current(&state)
            || !backend_runtime_state_transport_matches(&state, transport)
            || !candidate_build_id_matches(candidates, state.runtime_build_id.as_str())
        {
            return fail_closed_backend_reconciliation(
                app,
                current_runtime_build_id,
                "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
                "Current shell backend state does not match the active runtime identity",
            );
        }
        return Ok(());
    }

    let state_parent_pid = match state.parent_pid.filter(|pid| *pid > 1) {
        Some(pid) => pid,
        None => {
            return fail_closed_backend_reconciliation(
                app,
                current_runtime_build_id,
                "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
                "Backend runtime state has no verifiable parent process",
            )
        }
    };
    if pid_exists(state_parent_pid) {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_RUNTIME_OWNED_BY_ANOTHER_SHELL",
            &format!(
                "Backend runtime is still owned by another live {} shell",
                crate::DESKTOP_PRODUCT_NAME
            ),
        );
    }
    if !backend_runtime_state_transport_matches(&state, transport) {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend transport does not match the preserved runtime state",
        );
    }

    let backend_entries = candidates
        .iter()
        .map(|candidate| candidate.entry.clone())
        .collect::<Vec<_>>();
    let Some(observed_process) = inspect_backend_process(state.pid) else {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend orphan process identity could not be inspected",
        );
    };
    let endpoint = probe_backend_orphan_endpoint(transport, bridge_secret);
    if let Err(reason) = validate_observed_backend_orphan(
        &state,
        current_app_pid,
        &observed_process,
        &endpoint,
        node_runtime_entry,
        backend_entries.as_slice(),
    ) {
        eprintln!(
            "[backend_runtime] orphan identity validation failed before termination: {reason:?}"
        );
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend orphan ownership could not be proven",
        );
    }

    let state_before_termination = read_backend_runtime_state(app);
    let process_before_termination = inspect_backend_process(state.pid);
    if state_before_termination.as_ref() != Some(&state)
        || process_before_termination.as_ref() != Some(&observed_process)
        || pid_exists(state_parent_pid)
    {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend orphan identity changed before termination",
        );
    }
    let endpoint_before_termination = probe_backend_orphan_endpoint(transport, bridge_secret);
    if let Err(reason) = validate_observed_backend_orphan(
        &state,
        current_app_pid,
        &observed_process,
        &endpoint_before_termination,
        node_runtime_entry,
        backend_entries.as_slice(),
    ) {
        eprintln!(
            "[backend_runtime] orphan identity validation failed at termination boundary: {reason:?}"
        );
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend orphan ownership changed before termination",
        );
    }

    if !terminate_verified_backend_orphan(&observed_process) {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_TERMINATION_FAILED",
            "Verified backend orphan could not be terminated safely",
        );
    }
    if backend_socket_is_connectable(transport) {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_TRANSPORT_OCCUPIED_UNVERIFIED",
            "Backend transport remained occupied after verified orphan termination",
        );
    }
    if read_backend_runtime_state(app)
        .as_ref()
        .map(|current| current != &state)
        .unwrap_or(false)
    {
        return fail_closed_backend_reconciliation(
            app,
            current_runtime_build_id,
            "BACKEND_ORPHAN_IDENTITY_UNVERIFIED",
            "Backend runtime state changed during orphan termination",
        );
    }

    clear_backend_runtime_state_file(app);
    clear_backend_socket_file(transport);
    #[cfg(windows)]
    clear_backend_tcp_launch_port(app);
    Ok(())
}
