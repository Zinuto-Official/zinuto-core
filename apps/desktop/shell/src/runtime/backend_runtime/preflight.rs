// SPDX-License-Identifier: GPL-3.0-only

use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{Emitter, Manager};

use super::{
    clear_cached_ready_backend_transport, tracked_backend_pid, BackendStartupCircuit,
    BackendStartupFailure,
};

pub(super) struct BackendStartupPreflightState(pub(super) Mutex<BackendStartupPreflightStatus>);
pub(super) struct BackendStartupCircuitState(pub(super) Mutex<BackendStartupCircuit>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackendStartupPreflightStatus {
    pub(crate) state: String,
    pub(crate) stage: String,
    pub(crate) error_code: Option<String>,
    pub(crate) error_message: Option<String>,
    pub(crate) checked_at_ms: u64,
}

pub(crate) const BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1: &str =
    "zinuto://v1/backend-startup-preflight-status";

const BACKEND_STARTUP_RETRY_COOLDOWN: Duration = Duration::from_secs(10);

pub(super) fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn backend_startup_preflight_status_for(
    state: &str,
    stage: &str,
    error_code: Option<String>,
    error_message: Option<String>,
) -> BackendStartupPreflightStatus {
    BackendStartupPreflightStatus {
        state: state.to_string(),
        stage: stage.to_string(),
        error_code,
        error_message,
        checked_at_ms: now_epoch_ms(),
    }
}

fn emit_backend_startup_preflight_status(
    app: &tauri::AppHandle,
    status: &BackendStartupPreflightStatus,
) {
    if let Err(error) = app.emit(BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1, status) {
        eprintln!(
            "[backend_runtime] failed to emit backend startup preflight status: {}",
            error
        );
    }
}

fn record_backend_startup_preflight_status(
    app: &tauri::AppHandle,
    status: BackendStartupPreflightStatus,
) -> bool {
    let Some(state) = app.try_state::<BackendStartupPreflightState>() else {
        return false;
    };
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    *guard = status.clone();
    drop(guard);
    emit_backend_startup_preflight_status(app, &status);
    true
}

pub(crate) fn backend_startup_preflight_status(
    app: &tauri::AppHandle,
) -> BackendStartupPreflightStatus {
    app.try_state::<BackendStartupPreflightState>()
        .and_then(|state| state.0.lock().ok().map(|guard| guard.clone()))
        .unwrap_or_else(|| {
            backend_startup_preflight_status_for(
                "FAILED",
                "state",
                Some("PREFLIGHT_STATE_UNAVAILABLE".to_string()),
                Some("Backend startup preflight state is unavailable".to_string()),
            )
        })
}

pub(super) fn tracked_backend_is_ready(app: &tauri::AppHandle) -> bool {
    backend_startup_preflight_status(app).state == "READY" && tracked_backend_pid(app).is_some()
}

pub(crate) fn record_backend_startup_preflight_pending(app: &tauri::AppHandle, stage: &str) {
    clear_cached_ready_backend_transport(app);
    record_backend_startup_preflight_status(
        app,
        backend_startup_preflight_status_for("PENDING", stage, None, None),
    );
}

pub(crate) fn record_backend_startup_preflight_ready(app: &tauri::AppHandle) {
    record_backend_startup_preflight_status(
        app,
        backend_startup_preflight_status_for("READY", "ready", None, None),
    );
}

pub(crate) fn record_backend_startup_preflight_failed(
    app: &tauri::AppHandle,
    stage: &str,
    error_code: &str,
    error_message: &str,
) {
    clear_cached_ready_backend_transport(app);
    record_backend_startup_preflight_status(
        app,
        backend_startup_preflight_status_for(
            "FAILED",
            stage,
            Some(error_code.to_string()),
            Some(error_message.to_string()),
        ),
    );
}

pub(crate) fn record_backend_startup_preflight_failed_if_pending(
    app: &tauri::AppHandle,
    stage: &str,
    error_code: &str,
    error_message: &str,
) -> bool {
    let Some(state) = app.try_state::<BackendStartupPreflightState>() else {
        return false;
    };
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    if guard.state != "PENDING" {
        return false;
    }
    let status = backend_startup_preflight_status_for(
        "FAILED",
        stage,
        Some(error_code.to_string()),
        Some(error_message.to_string()),
    );
    *guard = status.clone();
    drop(guard);
    emit_backend_startup_preflight_status(app, &status);
    true
}

pub(super) fn cached_backend_startup_failure(
    app: &tauri::AppHandle,
    runtime_build_id: &str,
) -> Option<BackendStartupFailure> {
    app.try_state::<BackendStartupCircuitState>()
        .and_then(|state| {
            state
                .0
                .lock()
                .ok()
                .and_then(|mut circuit| circuit.blocking_failure(runtime_build_id, Instant::now()))
        })
}

pub(super) fn restore_backend_startup_failure_status(
    app: &tauri::AppHandle,
    failure: &BackendStartupFailure,
) {
    let current = backend_startup_preflight_status(app);
    if current.state == "FAILED"
        && current.stage == failure.stage
        && current.error_code.as_deref() == Some(failure.error_code.as_str())
        && current.error_message.as_deref() == Some(failure.error_message.as_str())
    {
        return;
    }
    record_backend_startup_preflight_failed(
        app,
        failure.stage.as_str(),
        failure.error_code.as_str(),
        failure.error_message.as_str(),
    );
}

pub(super) fn record_latched_backend_startup_failure(
    app: &tauri::AppHandle,
    runtime_build_id: &str,
    stage: &str,
    error_code: &str,
    error_message: &str,
) {
    if let Some(state) = app.try_state::<BackendStartupCircuitState>() {
        if let Ok(mut circuit) = state.0.lock() {
            circuit.record_latched_failure(runtime_build_id, stage, error_code, error_message);
        }
    }
    record_backend_startup_preflight_failed(app, stage, error_code, error_message);
}

pub(super) fn record_cooldown_backend_startup_failure(
    app: &tauri::AppHandle,
    runtime_build_id: &str,
    stage: &str,
    error_code: &str,
    error_message: &str,
) {
    if let Some(state) = app.try_state::<BackendStartupCircuitState>() {
        if let Ok(mut circuit) = state.0.lock() {
            circuit.record_cooldown_failure(
                runtime_build_id,
                stage,
                error_code,
                error_message,
                Instant::now(),
                BACKEND_STARTUP_RETRY_COOLDOWN,
            );
        }
    }
    record_backend_startup_preflight_failed(app, stage, error_code, error_message);
}

pub(super) fn record_backend_startup_success(app: &tauri::AppHandle, runtime_build_id: &str) {
    if let Some(state) = app.try_state::<BackendStartupCircuitState>() {
        if let Ok(mut circuit) = state.0.lock() {
            circuit.record_success(runtime_build_id);
        }
    }
}
