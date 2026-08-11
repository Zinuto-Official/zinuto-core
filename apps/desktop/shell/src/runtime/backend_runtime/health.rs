// SPDX-License-Identifier: GPL-3.0-only

#[cfg(windows)]
use std::net::TcpStream;
#[cfg(unix)]
use std::os::fd::OwnedFd;
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::process::{Child, ExitStatus};
use std::thread;
use std::time::{Duration, Instant};

use crate::bridge::transport::{build_http_request_bytes, send_http_request_over_stream};
use crate::runtime::backend_orphan::BackendOrphanEndpointEvidence;
use crate::runtime::backend_startup_progress::{
    read_active_backend_startup_progress, STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS,
};

use super::transport::{connect_backend_socket_with_timeout, BackendTransport};
use super::{
    backend_bridge_secret, backend_shutdown_requested, now_epoch_ms,
    record_backend_startup_preflight_failed, record_backend_startup_preflight_pending,
    BACKEND_BRIDGE_TOKEN_HEADER, BACKEND_HEALTH_POLL_INTERVAL, BACKEND_HEALTH_PROBE_TIMEOUT,
};

#[derive(serde::Deserialize)]
struct BackendHealthEnvelope {
    ok: bool,
    data: BackendHealthPayload,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BackendHealthPayload {
    pub(super) status: String,
    pub(super) runtime_build_id: String,
    pub(super) pid: u32,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendBridgeErrorEnvelope {
    ok: bool,
    error_code: String,
    cause: BackendBridgeErrorCause,
}

#[derive(serde::Deserialize)]
struct BackendBridgeErrorCause {
    code: String,
}

pub(super) fn bounded_backend_health_probe_timeout(remaining: Duration) -> Option<Duration> {
    if remaining.is_zero() {
        None
    } else {
        Some(remaining.min(BACKEND_HEALTH_PROBE_TIMEOUT))
    }
}

fn remaining_backend_health_probe_timeout(deadline: Instant) -> Option<Duration> {
    bounded_backend_health_probe_timeout(deadline.saturating_duration_since(Instant::now()))
}

pub(super) fn bounded_backend_health_probe_deadline(
    now: Instant,
    absolute_deadline: Instant,
) -> Instant {
    absolute_deadline.min(now + BACKEND_HEALTH_PROBE_TIMEOUT)
}

fn fetch_backend_health_until(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
    deadline: Instant,
) -> Result<BackendHealthPayload, String> {
    let bridge_secret = backend_bridge_secret(app).ok_or_else(|| {
        record_backend_startup_preflight_failed(
            app,
            "bridgeSecret",
            "BACKEND_BRIDGE_SECRET_UNAVAILABLE",
            "Backend bridge secret is unavailable",
        );
        "BACKEND_NOT_READY".to_string()
    })?;
    let response = send_backend_health_request_until(transport, bridge_secret.as_str(), deadline)?;
    parse_authenticated_backend_health_response(&response)
}

fn apply_health_stream_io_timeout(
    stream: impl FnMut() -> std::io::Result<()>,
) -> Result<(), String> {
    // A failed timeout configuration could wedge a health probe in an
    // unbounded read, so it is logged and retried once before failing.
    let mut apply = stream;
    for attempt in 1..=2 {
        match apply() {
            Ok(()) => return Ok(()),
            Err(error) => {
                eprintln!(
                    "[backend_runtime] failed to set health probe stream timeout (attempt {attempt}): {error}"
                );
            }
        }
    }
    Err("BACKEND_NOT_READY".to_string())
}

fn send_backend_health_request_until(
    transport: &BackendTransport,
    bridge_secret: &str,
    deadline: Instant,
) -> Result<crate::bridge::BackendHttpBridgeResponse, String> {
    let io_timeout = remaining_backend_health_probe_timeout(deadline)
        .ok_or_else(|| "BACKEND_NOT_READY".to_string())?;
    let mut headers = std::collections::HashMap::new();
    headers.insert(
        BACKEND_BRIDGE_TOKEN_HEADER.to_string(),
        bridge_secret.to_owned(),
    );
    let request_bytes =
        build_http_request_bytes("GET", "/api/v1/system/health", None, Some(&headers));
    let response = match transport {
        #[cfg(unix)]
        BackendTransport::Unix(_) => {
            let socket = connect_backend_socket_with_timeout(transport, io_timeout)?;
            let request_io_timeout = remaining_backend_health_probe_timeout(deadline)
                .ok_or_else(|| "BACKEND_NOT_READY".to_string())?;
            let owned_fd: OwnedFd = socket.into();
            let mut stream = UnixStream::from(owned_fd);
            apply_health_stream_io_timeout(|| {
                stream
                    .set_read_timeout(Some(request_io_timeout))
                    .and_then(|_| stream.set_write_timeout(Some(request_io_timeout)))
            })?;
            send_http_request_over_stream(
                &mut stream,
                &request_bytes,
                || Instant::now() >= deadline,
                request_io_timeout,
            )?
        }
        #[cfg(windows)]
        BackendTransport::Tcp { .. } => {
            let socket = connect_backend_socket_with_timeout(transport, io_timeout)?;
            let request_io_timeout = remaining_backend_health_probe_timeout(deadline)
                .ok_or_else(|| "BACKEND_NOT_READY".to_string())?;
            let mut stream: TcpStream = socket.into();
            apply_health_stream_io_timeout(|| {
                stream
                    .set_read_timeout(Some(request_io_timeout))
                    .and_then(|_| stream.set_write_timeout(Some(request_io_timeout)))
            })?;
            send_http_request_over_stream(
                &mut stream,
                &request_bytes,
                || Instant::now() >= deadline,
                request_io_timeout,
            )?
        }
    };
    Ok(response)
}

fn parse_authenticated_backend_health_response(
    response: &crate::bridge::BackendHttpBridgeResponse,
) -> Result<BackendHealthPayload, String> {
    if response.status != 200 {
        return Err("BACKEND_HEALTH_INVALID".to_string());
    }
    let envelope: BackendHealthEnvelope =
        serde_json::from_str(&response.body).map_err(|_| "BACKEND_HEALTH_INVALID".to_string())?;
    if !envelope.ok || !envelope.data.status.trim().eq_ignore_ascii_case("UP") {
        return Err("BACKEND_HEALTH_INVALID".to_string());
    }
    Ok(envelope.data)
}

pub(super) fn fetch_backend_health(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
) -> Result<BackendHealthPayload, String> {
    fetch_backend_health_until(
        app,
        transport,
        Instant::now() + BACKEND_HEALTH_PROBE_TIMEOUT,
    )
}

pub(super) fn wait_for_backend_health(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
    expected_build_id: Option<&str>,
    timeout_ms: u64,
) -> Option<BackendHealthPayload> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        if backend_shutdown_requested(app) || Instant::now() >= deadline {
            return None;
        }
        let probe_deadline = bounded_backend_health_probe_deadline(Instant::now(), deadline);
        if let Ok(health) = fetch_backend_health_until(app, transport, probe_deadline) {
            let matches_expected = expected_build_id
                .map(|value| health.runtime_build_id == value)
                .unwrap_or(true);
            if matches_expected {
                return Some(health);
            }
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return None;
        }
        thread::sleep(remaining.min(BACKEND_HEALTH_POLL_INTERVAL));
    }
}

#[derive(Debug)]
pub(super) enum SpawnedBackendHealthOutcome {
    Ready { backend_pid: u32 },
    Exited(ExitStatus),
    TimedOut,
    ShutdownRequested,
}

pub(super) fn wait_for_spawned_backend_health(
    app: &tauri::AppHandle,
    child: &mut Child,
    transport: &BackendTransport,
    expected_build_id: &str,
    expected_parent_pid: u32,
    startup_progress_path: &Path,
    timeout_ms: u64,
) -> SpawnedBackendHealthOutcome {
    let expected_pid = child.id();
    let started_at = Instant::now();
    let mut deadline = started_at + Duration::from_millis(timeout_ms);
    let hard_deadline = started_at + Duration::from_millis(STARTUP_SCHEMA_UPGRADE_HARD_MAX_AGE_MS);
    let mut observed_progress_stage = String::new();
    loop {
        if backend_shutdown_requested(app) {
            return SpawnedBackendHealthOutcome::ShutdownRequested;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return SpawnedBackendHealthOutcome::Exited(status);
        }
        let now = Instant::now();
        if let Some(progress) = read_active_backend_startup_progress(
            startup_progress_path,
            expected_pid,
            expected_parent_pid,
            expected_build_id,
            now_epoch_ms(),
        ) {
            deadline = (now + Duration::from_millis(timeout_ms)).min(hard_deadline);
            if observed_progress_stage != progress.stage() {
                observed_progress_stage = progress.stage().to_string();
                let shell_stage = format!(
                    "dataUpgrade:{}",
                    progress.stage().to_ascii_lowercase().replace('_', "-")
                );
                record_backend_startup_preflight_pending(app, shell_stage.as_str());
            }
        }
        if now >= deadline || now >= hard_deadline {
            return SpawnedBackendHealthOutcome::TimedOut;
        }
        let probe_deadline = bounded_backend_health_probe_deadline(Instant::now(), deadline);
        if let Ok(health) = fetch_backend_health_until(app, transport, probe_deadline) {
            let pid_matches = health.pid == expected_pid;
            if health.runtime_build_id == expected_build_id && pid_matches {
                return SpawnedBackendHealthOutcome::Ready {
                    backend_pid: health.pid,
                };
            }
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return SpawnedBackendHealthOutcome::TimedOut;
        }
        thread::sleep(remaining.min(BACKEND_HEALTH_POLL_INTERVAL));
    }
}

pub(super) fn probe_backend_orphan_endpoint(
    transport: &BackendTransport,
    bridge_secret: &str,
) -> BackendOrphanEndpointEvidence {
    let response = match send_backend_health_request_until(
        transport,
        bridge_secret,
        Instant::now() + BACKEND_HEALTH_PROBE_TIMEOUT,
    ) {
        Ok(response) => response,
        Err(_) => return BackendOrphanEndpointEvidence::Unverified,
    };
    backend_orphan_endpoint_evidence_from_response(&response)
}

pub(super) fn backend_orphan_endpoint_evidence_from_response(
    response: &crate::bridge::BackendHttpBridgeResponse,
) -> BackendOrphanEndpointEvidence {
    if response.status == 401 {
        let envelope = serde_json::from_str::<BackendBridgeErrorEnvelope>(&response.body).ok();
        if envelope
            .as_ref()
            .map(|value| {
                !value.ok
                    && value.error_code == "BACKEND_BRIDGE_UNAUTHORIZED"
                    && value.cause.code == "BRIDGE_TOKEN_MISMATCH"
            })
            .unwrap_or(false)
        {
            return BackendOrphanEndpointEvidence::UnauthorizedBridgeTokenMismatch;
        }
        return BackendOrphanEndpointEvidence::Unverified;
    }
    if response.status == 200 {
        let envelope = serde_json::from_str::<BackendHealthEnvelope>(&response.body).ok();
        if let Some(envelope) = envelope.filter(|value| value.ok) {
            return BackendOrphanEndpointEvidence::AuthenticatedHealth {
                status: envelope.data.status,
                pid: envelope.data.pid,
                runtime_build_id: envelope.data.runtime_build_id,
            };
        }
    }
    BackendOrphanEndpointEvidence::Unverified
}
