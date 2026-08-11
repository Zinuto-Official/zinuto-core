// SPDX-License-Identifier: GPL-3.0-only

use std::collections::{HashMap, VecDeque};
use std::io;
use std::io::{Read, Write};
use std::net::Shutdown;
#[cfg(windows)]
use std::net::TcpStream;
#[cfg(unix)]
use std::os::fd::OwnedFd;
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::bridge::connection_pool::{
    backend_http_connection_pool_idle_ttl, backend_transport_pool_key,
    return_backend_http_connection_to_pool, should_invalidate_backend_transport_after_http_error,
    should_pool_backend_http_request, should_retry_backend_http_stale_pool_stream,
    take_backend_http_connection_from_pool,
};
use crate::bridge::{bridge_command_error, BackendHttpBridgeResponse, BridgeCommandError};
use crate::runtime::backend_runtime::{
    self, BackendReadyTransportSnapshot, BackendTransport, BACKEND_BRIDGE_TOKEN_HEADER,
};
use socket2::{Domain, SockAddr, Socket, Type};
use tauri::Manager;

mod http_wire;

#[cfg(test)]
use http_wire::is_enabled_backend_http_transport_trace_flag;
pub(crate) use http_wire::{
    build_http_request_bytes, normalize_http_method, normalize_http_path,
    send_http_request_over_stream, BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE,
};
use http_wire::{
    build_http_request_bytes_with_connection, record_backend_http_transport_stats,
    send_http_request_over_stream_with_stats, BackendHttpTransportStats,
};

type BackendHttpRequestCanceller = Arc<dyn Fn() + Send + Sync>;

pub(crate) struct BackendHttpRequestRegistryEntry {
    cancelled: Arc<AtomicBool>,
    canceller: Option<BackendHttpRequestCanceller>,
    registered: bool,
    last_touched_at: Instant,
}

pub(crate) struct BackendHttpRequestRegistry(
    pub(crate) Mutex<HashMap<String, BackendHttpRequestRegistryEntry>>,
);

pub(crate) struct BackendHttpConnectionPool(
    pub(crate) Mutex<HashMap<String, VecDeque<BackendHttpPooledConnection>>>,
);

pub(crate) struct BackendHttpRequestGuard {
    app: tauri::AppHandle,
    request_id: String,
    cancelled: Arc<AtomicBool>,
}

pub(crate) struct BackendHttpPooledConnection {
    pub(crate) stream: BackendHttpStream,
    pub(crate) last_used_at: Instant,
}

struct ConnectedBackendHttpStream {
    pub(crate) stream: BackendHttpStream,
    transport: BackendReadyTransportSnapshot,
}

pub(crate) enum BackendHttpStream {
    #[cfg(unix)]
    Unix(UnixStream),
    #[cfg(windows)]
    Tcp(TcpStream),
}

const BACKEND_HTTP_REQUEST_PENDING_CANCEL_TTL: Duration = Duration::from_secs(90);
const BACKEND_HTTP_REQUEST_MAX_PENDING_CANCELS: usize = 256;
const BACKEND_HTTP_REQUEST_MAX_IN_FLIGHT: usize = 64;
const BACKEND_HTTP_REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(10);
const BACKEND_HTTP_REQUEST_WRITE_TIMEOUT: Duration = Duration::from_secs(60);
const BACKEND_HTTP_CONNECT_TIMEOUT: Duration = Duration::from_millis(750);
const BACKEND_HTTP_REQUEST_IDLE_TIMEOUT: Duration = Duration::from_secs(60);
const BACKEND_HTTP_REQUEST_IDLE_TIMEOUT_MAX_MS: u64 = 120 * 1000;
pub(crate) const BACKEND_HTTP_IDEMPOTENT_KEEP_ALIVE_IDLE_TTL: Duration = Duration::from_secs(4);
pub(crate) const BACKEND_HTTP_MUTATION_KEEP_ALIVE_IDLE_TTL: Duration = Duration::from_millis(1500);
pub(crate) const BACKEND_HTTP_MAX_IDLE_CONNECTIONS_PER_TRANSPORT: usize = 2;
const BACKEND_HTTP_REQUEST_ID_MAX_CHARS: usize = 128;
const BACKEND_HTTP_REQUEST_PATH_MAX_CHARS: usize = 8192;
pub(crate) const BACKEND_HTTP_REQUEST_BODY_MAX_BYTES: usize = 32 * 1024 * 1024;
const BACKEND_HTTP_REQUEST_HEADER_MAX_COUNT: usize = 64;
const BACKEND_HTTP_REQUEST_HEADER_NAME_MAX_CHARS: usize = 128;
const BACKEND_HTTP_REQUEST_HEADER_VALUE_MAX_CHARS: usize = 512;

impl Read for BackendHttpStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => stream.read(buf),
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => stream.read(buf),
        }
    }
}

impl Write for BackendHttpStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => stream.write(buf),
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => stream.write(buf),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => stream.flush(),
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => stream.flush(),
        }
    }
}

impl BackendHttpStream {
    fn set_timeouts(&self, idle_timeout: Duration) {
        let (read_timeout, write_timeout) = backend_http_stream_timeouts(idle_timeout);
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => {
                let _ = stream.set_read_timeout(Some(read_timeout));
                let _ = stream.set_write_timeout(Some(write_timeout));
            }
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => {
                let _ = stream.set_read_timeout(Some(read_timeout));
                let _ = stream.set_write_timeout(Some(write_timeout));
            }
        }
    }

    fn try_clone(&self) -> io::Result<BackendHttpStream> {
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => stream.try_clone().map(BackendHttpStream::Unix),
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => stream.try_clone().map(BackendHttpStream::Tcp),
        }
    }

    fn shutdown(&self) {
        match self {
            #[cfg(unix)]
            BackendHttpStream::Unix(stream) => {
                let _ = stream.shutdown(Shutdown::Both);
            }
            #[cfg(windows)]
            BackendHttpStream::Tcp(stream) => {
                let _ = stream.shutdown(Shutdown::Both);
            }
        }
    }
}

fn backend_http_stream_timeouts(idle_timeout: Duration) -> (Duration, Duration) {
    (
        BACKEND_HTTP_REQUEST_READ_TIMEOUT.min(idle_timeout),
        BACKEND_HTTP_REQUEST_WRITE_TIMEOUT.min(idle_timeout),
    )
}

impl BackendHttpRequestGuard {
    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

impl Drop for BackendHttpRequestGuard {
    fn drop(&mut self) {
        if let Some(state) = self.app.try_state::<BackendHttpRequestRegistry>() {
            if let Ok(mut guard) = state.0.lock() {
                guard.remove(self.request_id.as_str());
            } else {
                eprintln!("[transport] mutex poisoned in BackendHttpRequestGuard::drop");
            }
        }
    }
}

pub(crate) fn initialize_backend_http_registry(app: &tauri::App) {
    app.manage(BackendHttpRequestRegistry(Mutex::new(HashMap::new())));
    app.manage(BackendHttpConnectionPool(Mutex::new(HashMap::new())));
}

pub(crate) fn shutdown_backend_http_transport(app: &tauri::AppHandle) {
    let mut cancellers: Vec<BackendHttpRequestCanceller> = Vec::new();
    if let Some(state) = app.try_state::<BackendHttpRequestRegistry>() {
        match state.0.lock() {
            Ok(mut registry) => {
                for entry in registry.values_mut() {
                    entry.cancelled.store(true, Ordering::Release);
                    if let Some(canceller) = entry.canceller.clone() {
                        cancellers.push(canceller);
                    }
                }
                registry.clear();
            }
            Err(_) => {
                eprintln!("[transport] mutex poisoned in shutdown_backend_http_transport");
            }
        }
    }
    for canceller in cancellers {
        canceller();
    }

    clear_backend_http_connection_pool(app);
}

pub(crate) fn clear_backend_http_connection_pool(app: &tauri::AppHandle) {
    let pooled_connections = app
        .try_state::<BackendHttpConnectionPool>()
        .and_then(|state| match state.0.lock() {
            Ok(mut pool) => Some(std::mem::take(&mut *pool)),
            Err(_) => {
                eprintln!("[transport] mutex poisoned while clearing backend connection pool");
                None
            }
        });
    if let Some(pool) = pooled_connections {
        for entries in pool.into_values() {
            for entry in entries {
                entry.stream.shutdown();
            }
        }
    }
}

fn normalize_backend_bridge_request_id(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty()
        || trimmed.chars().count() > BACKEND_HTTP_REQUEST_ID_MAX_CHARS
        || has_http_control_chars(trimmed)
    {
        return None;
    }
    Some(trimmed.to_string())
}

fn prune_backend_http_request_registry(
    registry: &mut HashMap<String, BackendHttpRequestRegistryEntry>,
) {
    let now = Instant::now();
    let expired_pending_cancel_ids: Vec<String> = registry
        .iter()
        .filter(|(_, entry)| {
            !entry.registered
                && now.duration_since(entry.last_touched_at)
                    >= BACKEND_HTTP_REQUEST_PENDING_CANCEL_TTL
        })
        .map(|(request_id, _)| request_id.clone())
        .collect();
    for request_id in expired_pending_cancel_ids {
        registry.remove(request_id.as_str());
    }
}

pub(crate) fn register_backend_http_request(
    app: &tauri::AppHandle,
    request_id: Option<&str>,
) -> Result<Option<BackendHttpRequestGuard>, BridgeCommandError> {
    let Some(normalized_request_id) = normalize_backend_bridge_request_id(request_id) else {
        return Ok(None);
    };
    let Some(state) = app.try_state::<BackendHttpRequestRegistry>() else {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_FAILED"));
    };
    let mut registry = state
        .0
        .lock()
        .map_err(|_| bridge_command_error("BACKEND_HTTP_REQUEST_FAILED"))?;
    prune_backend_http_request_registry(&mut registry);
    let in_flight_entries = registry.values().filter(|entry| entry.registered).count();
    if in_flight_entries >= BACKEND_HTTP_REQUEST_MAX_IN_FLIGHT {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_IN_FLIGHT_LIMIT"));
    }
    let now = Instant::now();
    let cancelled = if let Some(existing) = registry.get_mut(normalized_request_id.as_str()) {
        if existing.registered {
            // A live request still owns this id. A cancelled in-flight request
            // is still unwinding (its guard removes the entry on drop), so the
            // id stays occupied until then; rejecting the duplicate prevents
            // aliasing one cancellation flag across two requests.
            return Err(bridge_command_error("INVALID_PARAMS"));
        }
        // A cancel can arrive after the async command is dispatched but
        // before its blocking task registers. Preserve that pending cancel so
        // the request cannot start after the caller has already aborted it.
        // The guard removes the entry on drop, so a completed cancellation is
        // not retained beyond this request.
        let next = Arc::clone(&existing.cancelled);
        existing.registered = true;
        existing.canceller = None;
        existing.last_touched_at = now;
        next
    } else {
        let next = Arc::new(AtomicBool::new(false));
        registry.insert(
            normalized_request_id.clone(),
            BackendHttpRequestRegistryEntry {
                cancelled: Arc::clone(&next),
                canceller: None,
                registered: true,
                last_touched_at: now,
            },
        );
        next
    };
    Ok(Some(BackendHttpRequestGuard {
        app: app.clone(),
        request_id: normalized_request_id,
        cancelled,
    }))
}

pub(crate) fn cancel_backend_http_request(
    app: &tauri::AppHandle,
    request_id: Option<&str>,
) -> Result<bool, BridgeCommandError> {
    let Some(normalized_request_id) = normalize_backend_bridge_request_id(request_id) else {
        return Ok(false);
    };
    let Some(state) = app.try_state::<BackendHttpRequestRegistry>() else {
        return Ok(false);
    };
    let Ok(mut registry) = state.0.lock() else {
        eprintln!("[transport] mutex poisoned in cancel_backend_http_request");
        return Ok(false);
    };
    prune_backend_http_request_registry(&mut registry);
    let now = Instant::now();
    if !registry.contains_key(normalized_request_id.as_str()) {
        // The cancel registry is full: reject the new cancel request instead
        // of evicting the oldest pending entry, so an in-flight cancel can
        // never be silently dropped (SH-M8).
        let pending_cancel_count = registry.values().filter(|entry| !entry.registered).count();
        if pending_cancel_count >= BACKEND_HTTP_REQUEST_MAX_PENDING_CANCELS {
            return Err(bridge_command_error("PENDING_CANCEL_OVERFLOW"));
        }
    }
    let (cancelled, canceller) =
        if let Some(existing) = registry.get_mut(normalized_request_id.as_str()) {
            existing.last_touched_at = now;
            (Arc::clone(&existing.cancelled), existing.canceller.clone())
        } else {
            let pending = Arc::new(AtomicBool::new(false));
            registry.insert(
                normalized_request_id.clone(),
                BackendHttpRequestRegistryEntry {
                    cancelled: Arc::clone(&pending),
                    canceller: None,
                    registered: false,
                    last_touched_at: now,
                },
            );
            (pending, None)
        };
    cancelled.store(true, Ordering::Release);
    drop(registry);
    if let Some(canceller) = canceller {
        canceller();
    }
    Ok(true)
}

fn attach_backend_http_request_canceller(
    request_guard: Option<&BackendHttpRequestGuard>,
    canceller: BackendHttpRequestCanceller,
) {
    let Some(request_guard) = request_guard else {
        return;
    };
    let Some(state) = request_guard.app.try_state::<BackendHttpRequestRegistry>() else {
        return;
    };
    let Ok(mut registry) = state.0.lock() else {
        eprintln!("[transport] mutex poisoned in attach_backend_http_request_canceller");
        return;
    };
    let should_cancel = if let Some(entry) = registry.get_mut(request_guard.request_id.as_str()) {
        entry.canceller = Some(Arc::clone(&canceller));
        entry.last_touched_at = Instant::now();
        entry.cancelled.load(Ordering::Acquire)
    } else {
        false
    };
    drop(registry);
    if should_cancel {
        canceller();
    }
}

// The included validator keeps the /api/v1 restriction in the bridge transport
// boundary; retain the symbol marker for the architecture guard as well.
include!("bridge_request_validation.rs"); // is_allowed_backend_api_path

fn resolve_backend_http_request_idle_timeout(
    timeout_ms: Option<u64>,
) -> Result<Duration, BridgeCommandError> {
    // timeoutMs is the per-request IDLE timeout, not a total deadline: any
    // single read or write stall longer than this value fails the request,
    // while a slowly flowing large response body may legitimately take longer
    // in total wall time as long as data keeps arriving (SH timeoutMs note).
    let normalized_timeout_ms =
        timeout_ms.unwrap_or(BACKEND_HTTP_REQUEST_IDLE_TIMEOUT.as_millis() as u64);
    if normalized_timeout_ms == 0
        || normalized_timeout_ms > BACKEND_HTTP_REQUEST_IDLE_TIMEOUT_MAX_MS
    {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    Ok(Duration::from_millis(normalized_timeout_ms))
}

fn connect_backend_http_stream_once(transport: &BackendTransport) -> io::Result<BackendHttpStream> {
    let (domain, address) = match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => (Domain::UNIX, SockAddr::unix(socket_path)?),
        #[cfg(windows)]
        BackendTransport::Tcp { host, port } => {
            let socket_address = format!("{}:{}", host, port)
                .parse::<std::net::SocketAddr>()
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
            (
                Domain::for_address(socket_address),
                SockAddr::from(socket_address),
            )
        }
    };
    let socket = Socket::new(domain, Type::STREAM, None)?;
    socket.connect_timeout(&address, BACKEND_HTTP_CONNECT_TIMEOUT)?;
    #[cfg(unix)]
    let stream = {
        let owned_fd: OwnedFd = socket.into();
        BackendHttpStream::Unix(UnixStream::from(owned_fd))
    };
    #[cfg(windows)]
    let stream = BackendHttpStream::Tcp(TcpStream::from(socket));
    Ok(stream)
}

fn connect_backend_stream_with_recovery<S, F, C, R, I>(
    transport: &BackendReadyTransportSnapshot,
    is_cancelled: &F,
    mut connect_once: C,
    recover_transport: R,
    invalidate_transport: I,
) -> Result<(S, BackendReadyTransportSnapshot), BridgeCommandError>
where
    F: Fn() -> bool,
    C: FnMut(&BackendTransport) -> io::Result<S>,
    R: FnOnce(&BackendReadyTransportSnapshot) -> Result<BackendReadyTransportSnapshot, String>,
    I: FnOnce(&BackendReadyTransportSnapshot),
{
    if is_cancelled() {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
    }
    match connect_once(transport.transport()) {
        Ok(stream) => Ok((stream, transport.clone())),
        Err(_) => {
            if is_cancelled() {
                return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
            }
            let ready_transport = recover_transport(transport)
                .map_err(|_| bridge_command_error("BACKEND_NOT_READY"))?;
            if is_cancelled() {
                return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
            }
            match connect_once(ready_transport.transport()) {
                Ok(stream) => Ok((stream, ready_transport)),
                Err(_) => {
                    if is_cancelled() {
                        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
                    }
                    invalidate_transport(&ready_transport);
                    Err(bridge_command_error("BACKEND_HTTP_REQUEST_FAILED"))
                }
            }
        }
    }
}

fn connect_backend_http_stream<F: Fn() -> bool>(
    app: &tauri::AppHandle,
    transport: &BackendReadyTransportSnapshot,
    is_cancelled: &F,
) -> Result<ConnectedBackendHttpStream, BridgeCommandError> {
    let (stream, transport) = connect_backend_stream_with_recovery(
        transport,
        is_cancelled,
        connect_backend_http_stream_once,
        |failed_transport| {
            backend_runtime::recover_backend_ready_transport_after_connect_failure(
                app,
                failed_transport,
                is_cancelled,
            )
        },
        |failed_transport| {
            backend_runtime::invalidate_backend_ready_transport_after_http_failure(
                app,
                failed_transport,
            );
        },
    )?;
    Ok(ConnectedBackendHttpStream { stream, transport })
}

fn attach_backend_http_stream_canceller(
    request_guard: Option<&BackendHttpRequestGuard>,
    stream: &BackendHttpStream,
) {
    if let Ok(cancel_stream) = stream.try_clone() {
        attach_backend_http_request_canceller(
            request_guard,
            Arc::new(move || {
                cancel_stream.shutdown();
            }),
        );
    }
}

fn response_allows_backend_http_connection_reuse(response: &BackendHttpBridgeResponse) -> bool {
    !response
        .headers
        .get("connection")
        .map(|value| value.to_ascii_lowercase().contains("close"))
        .unwrap_or(false)
}

pub(crate) fn send_backend_http_request(
    app: &tauri::AppHandle,
    method: &str,
    path: &str,
    body: Option<&str>,
    headers: Option<&HashMap<String, String>>,
    timeout_ms: Option<u64>,
    request_guard: Option<&BackendHttpRequestGuard>,
) -> Result<BackendHttpBridgeResponse, BridgeCommandError> {
    let is_cancelled = || {
        request_guard
            .map(BackendHttpRequestGuard::is_cancelled)
            .unwrap_or(false)
    };
    if is_cancelled() {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
    }
    let transport = backend_runtime::resolve_ready_backend_transport(app, &is_cancelled)
        .map_err(|_| bridge_command_error("BACKEND_NOT_READY"))?;

    let (normalized_method, normalized_path, sanitized_headers) =
        validate_backend_bridge_request(method, path, headers)?;
    if body
        .map(|value| value.len() > BACKEND_HTTP_REQUEST_BODY_MAX_BYTES)
        .unwrap_or(false)
    {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    let bridge_secret = backend_runtime::backend_bridge_secret(app)
        .ok_or_else(|| bridge_command_error("BACKEND_HTTP_REQUEST_FAILED"))?;
    let mut request_headers: HashMap<String, String> = sanitized_headers
        .into_iter()
        .filter(|(name, _)| !name.eq_ignore_ascii_case(BACKEND_BRIDGE_TOKEN_HEADER))
        .collect();
    request_headers.insert(BACKEND_BRIDGE_TOKEN_HEADER.to_string(), bridge_secret);
    let should_pool_connection = should_pool_backend_http_request(&normalized_method, body);
    let request_bytes = build_http_request_bytes_with_connection(
        &normalized_method,
        &normalized_path,
        body,
        Some(&request_headers),
        should_pool_connection,
    );
    let mut stats = BackendHttpTransportStats::from_request(should_pool_connection, &request_bytes);
    let idle_timeout = resolve_backend_http_request_idle_timeout(timeout_ms)?;
    if is_cancelled() {
        return Err(bridge_command_error("BACKEND_HTTP_REQUEST_CANCELED"));
    }

    if should_pool_connection {
        let transport_key = backend_transport_pool_key(&transport);
        let pool_idle_ttl = backend_http_connection_pool_idle_ttl(&normalized_method);
        let pool_lookup_started_at = Instant::now();
        let mut connection =
            take_backend_http_connection_from_pool(app, transport_key.as_str(), pool_idle_ttl).map(
                |stream| ConnectedBackendHttpStream {
                    stream,
                    transport: transport.clone(),
                },
            );
        stats.record_pool_lookup(pool_lookup_started_at.elapsed(), connection.is_some());
        let mut used_pooled_stream = connection.is_some();
        let mut retried_after_stale_pool_stream = false;

        loop {
            let mut active_connection = match connection.take() {
                Some(connection) => connection,
                None => {
                    let connect_started_at = Instant::now();
                    match connect_backend_http_stream(app, &transport, &is_cancelled) {
                        Ok(connection) => {
                            stats.record_connect_attempt(connect_started_at.elapsed());
                            connection
                        }
                        Err(error) => {
                            stats.record_connect_attempt(connect_started_at.elapsed());
                            record_backend_http_transport_stats(&stats);
                            return Err(error);
                        }
                    }
                }
            };
            active_connection.stream.set_timeouts(idle_timeout);
            attach_backend_http_stream_canceller(request_guard, &active_connection.stream);
            let result = send_http_request_over_stream_with_stats(
                &mut active_connection.stream,
                &request_bytes,
                is_cancelled,
                idle_timeout,
                &mut stats,
            );
            match result {
                Ok(response) => {
                    if !is_cancelled() && response_allows_backend_http_connection_reuse(&response) {
                        let active_transport_key =
                            backend_transport_pool_key(&active_connection.transport);
                        return_backend_http_connection_to_pool(
                            app,
                            active_transport_key,
                            active_connection.stream,
                        );
                    }
                    record_backend_http_transport_stats(&stats);
                    return Ok(response);
                }
                Err(error_code)
                    if !is_cancelled()
                        && should_retry_backend_http_stale_pool_stream(
                            &normalized_method,
                            used_pooled_stream,
                            retried_after_stale_pool_stream,
                            error_code.as_str(),
                        ) =>
                {
                    stats.record_stale_pool_retry();
                    used_pooled_stream = false;
                    retried_after_stale_pool_stream = true;
                    connection = None;
                    continue;
                }
                Err(error_code) => {
                    let effective_error_code = if is_cancelled() {
                        "BACKEND_HTTP_REQUEST_CANCELED"
                    } else {
                        error_code.as_str()
                    };
                    if should_invalidate_backend_transport_after_http_error(effective_error_code) {
                        backend_runtime::invalidate_backend_ready_transport_after_http_failure(
                            app,
                            &active_connection.transport,
                        );
                    }
                    record_backend_http_transport_stats(&stats);
                    return Err(bridge_command_error(effective_error_code));
                }
            }
        }
    }

    let connect_started_at = Instant::now();
    let mut connection = match connect_backend_http_stream(app, &transport, &is_cancelled) {
        Ok(connection) => {
            stats.record_connect_attempt(connect_started_at.elapsed());
            connection
        }
        Err(error) => {
            stats.record_connect_attempt(connect_started_at.elapsed());
            record_backend_http_transport_stats(&stats);
            return Err(error);
        }
    };
    connection.stream.set_timeouts(idle_timeout);
    attach_backend_http_stream_canceller(request_guard, &connection.stream);
    let result = send_http_request_over_stream_with_stats(
        &mut connection.stream,
        &request_bytes,
        is_cancelled,
        idle_timeout,
        &mut stats,
    );
    let result = match result {
        Err(_)
            if request_guard
                .map(BackendHttpRequestGuard::is_cancelled)
                .unwrap_or(false) =>
        {
            Err("BACKEND_HTTP_REQUEST_CANCELED".to_string())
        }
        result => result,
    };
    if let Err(error_code) = result.as_ref() {
        if should_invalidate_backend_transport_after_http_error(error_code.as_str()) {
            backend_runtime::invalidate_backend_ready_transport_after_http_failure(
                app,
                &connection.transport,
            );
        }
    }
    record_backend_http_transport_stats(&stats);
    result.map_err(|error_code| bridge_command_error(error_code.as_str()))
}

#[cfg(test)]
mod tests;
