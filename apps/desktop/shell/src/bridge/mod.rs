// SPDX-License-Identifier: GPL-3.0-only

pub(crate) mod ai_conversion_guide;
pub(crate) mod chunked_body_decoder;
pub(crate) mod connection_pool;
pub(crate) mod csv_folder_staging;
pub(crate) mod market_data_acquisition_output;
#[cfg(target_os = "macos")]
pub(crate) mod security_scoped_bookmarks;
pub(crate) mod transport;

use std::collections::HashMap;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackendHttpBridgeResponse {
    pub(crate) status: u16,
    pub(crate) body: String,
    pub(crate) headers: HashMap<String, String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BridgeCommandError {
    pub(crate) error_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error_args: Option<HashMap<String, String>>,
}

fn parse_import_limit_error(code: &str) -> Option<BridgeCommandError> {
    let mut parts = code.splitn(3, ':');
    let error_code = parts.next()?;
    if error_code != "LOCAL_DATA_IMPORT_LIMIT_EXCEEDED" {
        return None;
    }
    let limit = parts.next().unwrap_or("import");
    let max = parts.next().unwrap_or("");
    let mut args = HashMap::new();
    args.insert("limit".to_string(), limit.to_string());
    if !max.is_empty() {
        args.insert("max".to_string(), max.to_string());
    }
    Some(BridgeCommandError {
        error_code: error_code.to_string(),
        error_args: Some(args),
    })
}

pub(crate) fn bridge_command_error(code: &str) -> BridgeCommandError {
    if let Some(error) = parse_import_limit_error(code.trim()) {
        return error;
    }
    BridgeCommandError {
        error_code: code.trim().to_string(),
        error_args: None,
    }
}

fn backend_startup_gate_error(
    status: &crate::runtime::backend_runtime::BackendStartupPreflightStatus,
) -> Option<BridgeCommandError> {
    let normalized_state = status.state.trim().to_ascii_uppercase();
    if normalized_state == "READY" {
        return None;
    }

    let mut args = HashMap::new();
    args.insert("stage".to_string(), status.stage.clone());
    args.insert("checkedAtMs".to_string(), status.checked_at_ms.to_string());

    if normalized_state == "PENDING" {
        return Some(BridgeCommandError {
            error_code: "BACKEND_STARTUP_PENDING".to_string(),
            error_args: Some(args),
        });
    }

    args.insert(
        "causeCode".to_string(),
        status
            .error_code
            .clone()
            .filter(|code| !code.trim().is_empty())
            .unwrap_or_else(|| {
                if normalized_state == "FAILED" {
                    "BACKEND_STARTUP_FAILED".to_string()
                } else {
                    "INVALID_BACKEND_STARTUP_STATE".to_string()
                }
            }),
    );
    Some(BridgeCommandError {
        error_code: "BACKEND_STARTUP_FAILED".to_string(),
        error_args: Some(args),
    })
}

#[tauri::command(rename_all = "camelCase")]
// The parameters are the reviewed native-bridge v1 wire contract. Grouping
// them would change the command payload rather than improve internal design.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn backend_http_request(
    app: tauri::AppHandle,
    method: String,
    path: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    request_id: Option<String>,
    cancel_request_id: Option<String>,
) -> Result<BackendHttpBridgeResponse, BridgeCommandError> {
    match transport::cancel_backend_http_request(&app, cancel_request_id.as_deref()) {
        Ok(true) => {
            return Ok(BackendHttpBridgeResponse {
                status: 204,
                body: String::new(),
                headers: HashMap::new(),
            });
        }
        Err(error) => return Err(error),
        Ok(false) => {}
    }

    let request_guard = transport::register_backend_http_request(&app, request_id.as_deref())?;
    if request_guard
        .as_ref()
        .map(|guard| guard.is_cancelled())
        .unwrap_or(false)
    {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
    }

    let startup_status = crate::runtime::backend_runtime::backend_startup_preflight_status(&app);
    if let Some(error) = backend_startup_gate_error(&startup_status) {
        return Err(error);
    }
    if request_guard
        .as_ref()
        .map(|guard| guard.is_cancelled())
        .unwrap_or(false)
    {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
    }

    tauri::async_runtime::spawn_blocking(move || {
        transport::send_backend_http_request(
            &app,
            &method,
            &path,
            body.as_deref(),
            headers.as_ref(),
            timeout_ms,
            request_guard.as_ref(),
        )
    })
    .await
    .map_err(|_| bridge_command_error("BACKEND_HTTP_REQUEST_FAILED"))?
}

#[cfg(test)]
mod tests {
    use super::backend_startup_gate_error;
    use crate::runtime::backend_runtime::BackendStartupPreflightStatus;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Barrier,
    };

    fn status(state: &str, stage: &str, error_code: Option<&str>) -> BackendStartupPreflightStatus {
        BackendStartupPreflightStatus {
            state: state.to_string(),
            stage: stage.to_string(),
            error_code: error_code.map(str::to_string),
            error_message: None,
            checked_at_ms: 42,
        }
    }

    #[test]
    fn ready_preflight_allows_backend_request_work() {
        assert!(backend_startup_gate_error(&status("READY", "ready", None)).is_none());
    }

    #[test]
    fn failed_preflight_returns_stable_terminal_error_with_native_cause() {
        let error = backend_startup_gate_error(&status(
            "FAILED",
            "dataUpgrade:core-schema",
            Some("CORE_SCHEMA_UPGRADE_FAILED"),
        ))
        .expect("failed startup must reject bridge requests");

        assert_eq!(error.error_code, "BACKEND_STARTUP_FAILED");
        let args = error.error_args.expect("failure diagnostics");
        assert_eq!(
            args.get("causeCode").map(String::as_str),
            Some("CORE_SCHEMA_UPGRADE_FAILED")
        );
        assert_eq!(
            args.get("stage").map(String::as_str),
            Some("dataUpgrade:core-schema")
        );
    }

    #[test]
    fn pending_preflight_rejects_concurrent_requests_before_backend_work() {
        const REQUEST_COUNT: usize = 32;
        let barrier = Arc::new(Barrier::new(REQUEST_COUNT));
        let runtime_entries = Arc::new(AtomicUsize::new(0));
        let pending_status = Arc::new(status("PENDING", "dataUpgrade:market-copy", None));

        let error_codes = std::thread::scope(|scope| {
            let handles = (0..REQUEST_COUNT)
                .map(|_| {
                    let barrier = Arc::clone(&barrier);
                    let runtime_entries = Arc::clone(&runtime_entries);
                    let pending_status = Arc::clone(&pending_status);
                    scope.spawn(move || {
                        barrier.wait();
                        match backend_startup_gate_error(&pending_status) {
                            Some(error) => error.error_code,
                            None => {
                                runtime_entries.fetch_add(1, Ordering::SeqCst);
                                String::new()
                            }
                        }
                    })
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| handle.join().expect("request gate thread"))
                .collect::<Vec<_>>()
        });

        assert_eq!(runtime_entries.load(Ordering::SeqCst), 0);
        assert_eq!(error_codes.len(), REQUEST_COUNT);
        assert!(error_codes
            .iter()
            .all(|error_code| error_code == "BACKEND_STARTUP_PENDING"));
    }
}
