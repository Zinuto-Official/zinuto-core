// SPDX-License-Identifier: GPL-3.0-only

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use tauri::Manager;

use crate::bridge::transport::{
    normalize_http_method, BackendHttpConnectionPool, BackendHttpPooledConnection,
    BackendHttpStream, BACKEND_HTTP_IDEMPOTENT_KEEP_ALIVE_IDLE_TTL,
    BACKEND_HTTP_MAX_IDLE_CONNECTIONS_PER_TRANSPORT, BACKEND_HTTP_MUTATION_KEEP_ALIVE_IDLE_TTL,
    BACKEND_HTTP_REQUEST_BODY_MAX_BYTES,
};
use crate::runtime::backend_runtime::{BackendReadyTransportSnapshot, BackendTransport};
fn backend_transport_endpoint_key(transport: &BackendTransport) -> String {
    match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => {
            format!("unix:{}", socket_path.to_string_lossy())
        }
        #[cfg(windows)]
        BackendTransport::Tcp { host, port } => format!("tcp:{}:{}", host, port),
    }
}

pub(crate) fn backend_transport_pool_key(transport: &BackendReadyTransportSnapshot) -> String {
    backend_transport_pool_key_for(transport.transport(), transport.revision())
}

pub(crate) fn backend_transport_pool_key_for(
    transport: &BackendTransport,
    revision: u64,
) -> String {
    format!("{}#{}", backend_transport_endpoint_key(transport), revision)
}

pub(crate) fn is_backend_http_idempotent_method(method: &str) -> bool {
    matches!(normalize_http_method(method).as_str(), "GET" | "HEAD")
}

pub(crate) fn backend_http_connection_pool_idle_ttl(method: &str) -> Duration {
    if is_backend_http_idempotent_method(method) {
        BACKEND_HTTP_IDEMPOTENT_KEEP_ALIVE_IDLE_TTL
    } else {
        BACKEND_HTTP_MUTATION_KEEP_ALIVE_IDLE_TTL
    }
}

fn prune_backend_http_connection_pool(
    pool: &mut HashMap<String, VecDeque<BackendHttpPooledConnection>>,
    idle_ttl: Duration,
) {
    let now = Instant::now();
    pool.retain(|_, entries| {
        entries.retain(|entry| now.duration_since(entry.last_used_at) < idle_ttl);
        while entries.len() > BACKEND_HTTP_MAX_IDLE_CONNECTIONS_PER_TRANSPORT {
            entries.pop_front();
        }
        !entries.is_empty()
    });
}

pub(crate) fn take_backend_http_connection_from_pool(
    app: &tauri::AppHandle,
    transport_key: &str,
    idle_ttl: Duration,
) -> Option<BackendHttpStream> {
    let state = app.try_state::<BackendHttpConnectionPool>()?;
    let Ok(mut pool) = state.0.lock() else {
        eprintln!("[transport] mutex poisoned in take_backend_http_connection_from_pool");
        return None;
    };
    prune_backend_http_connection_pool(&mut pool, idle_ttl);
    let entries = pool.get_mut(transport_key)?;
    entries.pop_back().map(|entry| entry.stream)
}

pub(crate) fn return_backend_http_connection_to_pool(
    app: &tauri::AppHandle,
    transport_key: String,
    stream: BackendHttpStream,
) {
    let Some(state) = app.try_state::<BackendHttpConnectionPool>() else {
        return;
    };
    let Ok(mut pool) = state.0.lock() else {
        eprintln!("[transport] mutex poisoned in return_backend_http_connection_to_pool");
        return;
    };
    prune_backend_http_connection_pool(&mut pool, BACKEND_HTTP_IDEMPOTENT_KEEP_ALIVE_IDLE_TTL);
    let entries = pool.entry(transport_key).or_default();
    entries.push_back(BackendHttpPooledConnection {
        stream,
        last_used_at: Instant::now(),
    });
    while entries.len() > BACKEND_HTTP_MAX_IDLE_CONNECTIONS_PER_TRANSPORT {
        entries.pop_front();
    }
}

pub(crate) fn should_pool_backend_http_request(method: &str, body: Option<&str>) -> bool {
    matches!(
        normalize_http_method(method).as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    ) && body
        .map(|value| value.len() <= BACKEND_HTTP_REQUEST_BODY_MAX_BYTES)
        .unwrap_or(true)
}

pub(crate) fn should_retry_backend_http_stale_pool_stream(
    method: &str,
    used_pooled_stream: bool,
    retried_after_stale_pool_stream: bool,
    error_code: &str,
) -> bool {
    used_pooled_stream
        && is_backend_http_idempotent_method(method)
        && !retried_after_stale_pool_stream
        && should_invalidate_backend_transport_after_http_error(error_code)
}

pub(crate) fn should_invalidate_backend_transport_after_http_error(error_code: &str) -> bool {
    matches!(
        error_code,
        "BACKEND_HTTP_REQUEST_FAILED" | "BACKEND_HTTP_RESPONSE_INVALID"
    )
}
