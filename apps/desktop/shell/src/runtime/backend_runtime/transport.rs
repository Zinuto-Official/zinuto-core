// SPDX-License-Identifier: GPL-3.0-only

#[cfg(unix)]
use std::collections::hash_map::DefaultHasher;
use std::fs;
#[cfg(unix)]
use std::hash::{Hash, Hasher};
#[cfg(windows)]
use std::net::TcpListener;
#[cfg(unix)]
use std::os::unix::fs::FileTypeExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

use socket2::{Domain, SockAddr, Socket, Type};
use tauri::Manager;

use crate::bridge::transport::clear_backend_http_connection_pool;
#[cfg(unix)]
use crate::platform::current_desktop_bundle_id;
use crate::platform::resolve_desktop_data_dir;

use super::{
    read_backend_runtime_state, BackendReadyTransport, BACKEND_CONNECTABILITY_PROBE_TIMEOUT,
};
#[cfg(windows)]
use super::{BackendTcpLaunchPort, BACKEND_TCP_HOST};

#[cfg(unix)]
const BACKEND_UNIX_SOCKET_PATH_MAX_BYTES: usize = 103;

#[derive(Clone, PartialEq, Eq)]
pub(crate) enum BackendTransport {
    #[cfg(unix)]
    Unix(PathBuf),
    #[cfg(windows)]
    Tcp { host: String, port: u16 },
}

pub(super) struct BackendReadyTransportState {
    pub(super) transport: Option<BackendTransport>,
    pub(super) revision: u64,
}

#[derive(Clone)]
pub(crate) struct BackendReadyTransportSnapshot {
    pub(super) transport: BackendTransport,
    pub(super) revision: u64,
}

impl BackendReadyTransportSnapshot {
    #[cfg(test)]
    pub(crate) fn from_test_parts(transport: BackendTransport, revision: u64) -> Self {
        Self {
            transport,
            revision,
        }
    }

    pub(crate) fn transport(&self) -> &BackendTransport {
        &self.transport
    }

    pub(crate) fn revision(&self) -> u64 {
        self.revision
    }
}

pub(super) fn cached_ready_backend_transport(
    app: &tauri::AppHandle,
) -> Option<BackendReadyTransportSnapshot> {
    app.try_state::<BackendReadyTransport>().and_then(|state| {
        state.0.lock().ok().and_then(|guard| {
            guard
                .transport
                .clone()
                .map(|transport| BackendReadyTransportSnapshot {
                    transport,
                    revision: guard.revision,
                })
        })
    })
}

pub(super) fn cache_ready_backend_transport(
    app: &tauri::AppHandle,
    transport: &BackendTransport,
) -> Option<BackendReadyTransportSnapshot> {
    if let Some(state) = app.try_state::<BackendReadyTransport>() {
        if let Ok(mut guard) = state.0.lock() {
            if guard.transport.as_ref() != Some(transport) {
                guard.revision = guard.revision.wrapping_add(1);
                guard.transport = Some(transport.clone());
            }
            return Some(BackendReadyTransportSnapshot {
                transport: transport.clone(),
                revision: guard.revision,
            });
        }
    }
    None
}

pub(super) fn clear_cached_ready_backend_transport(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<BackendReadyTransport>() {
        if let Ok(mut guard) = state.0.lock() {
            if guard.transport.take().is_some() {
                guard.revision = guard.revision.wrapping_add(1);
            }
        }
    }
    clear_backend_http_connection_pool(app);
}

pub(super) fn cached_backend_transport_matches_failure(
    cached_transport: Option<&BackendReadyTransportSnapshot>,
    failed_transport: &BackendReadyTransportSnapshot,
) -> bool {
    cached_transport
        .map(|transport| {
            transport.revision == failed_transport.revision
                && transport.transport == failed_transport.transport
        })
        .unwrap_or(false)
}

pub(super) enum BackendConnectFailureRecovery {
    Reuse(BackendReadyTransportSnapshot),
    Recover { invalidated_failed_generation: bool },
}

pub(super) fn prepare_backend_connect_failure_recovery(
    state: &mut BackendReadyTransportState,
    failed_transport: &BackendReadyTransportSnapshot,
) -> BackendConnectFailureRecovery {
    let cached_transport = state
        .transport
        .clone()
        .map(|transport| BackendReadyTransportSnapshot {
            transport,
            revision: state.revision,
        });
    if !cached_backend_transport_matches_failure(cached_transport.as_ref(), failed_transport) {
        return cached_transport
            .map(BackendConnectFailureRecovery::Reuse)
            .unwrap_or(BackendConnectFailureRecovery::Recover {
                invalidated_failed_generation: false,
            });
    }

    state.transport = None;
    state.revision = state.revision.wrapping_add(1);
    BackendConnectFailureRecovery::Recover {
        invalidated_failed_generation: true,
    }
}

#[cfg(unix)]
fn build_backend_unix_socket_file_name(bundle_id: &str, data_dir: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    bundle_id.hash(&mut hasher);
    data_dir.to_string_lossy().hash(&mut hasher);
    format!("zinuto-{:016x}.sock", hasher.finish())
}

#[cfg(unix)]
fn resolve_backend_unix_socket_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let data_dir = resolve_desktop_data_dir(app)?;
    let bundle_id = current_desktop_bundle_id(app);
    let socket_file_name =
        build_backend_unix_socket_file_name(bundle_id.as_str(), data_dir.as_path());
    let candidate_dirs = [std::env::temp_dir(), data_dir.clone()];

    for candidate_dir in candidate_dirs {
        if crate::platform::ensure_directory(candidate_dir.as_path()).is_err() {
            continue;
        }
        let candidate_path = candidate_dir.join(socket_file_name.as_str());
        if candidate_path.to_string_lossy().len() <= BACKEND_UNIX_SOCKET_PATH_MAX_BYTES {
            return Some(candidate_path);
        }
    }

    None
}

#[cfg(unix)]
fn validated_persisted_backend_unix_socket_path(
    persisted: Option<&str>,
    deterministic: &Path,
) -> Option<PathBuf> {
    let persisted = Path::new(persisted?);
    if persisted != deterministic
        || persisted.to_string_lossy().len() > BACKEND_UNIX_SOCKET_PATH_MAX_BYTES
    {
        return None;
    }
    Some(deterministic.to_path_buf())
}

#[cfg(windows)]
fn set_backend_tcp_launch_port(app: &tauri::AppHandle, port: Option<u16>) {
    let Some(state) = app.try_state::<BackendTcpLaunchPort>() else {
        return;
    };
    let Ok(mut guard) = state.0.lock() else {
        eprintln!("[backend_runtime] mutex poisoned in set_backend_tcp_launch_port");
        return;
    };
    *guard = port.filter(|value| *value > 0);
}

#[cfg(windows)]
pub(super) fn clear_backend_tcp_launch_port(app: &tauri::AppHandle) {
    set_backend_tcp_launch_port(app, None);
}

#[cfg(windows)]
const BACKEND_TCP_PORT_REBIND_VERIFY_MAX_ATTEMPTS: usize = 8;
#[cfg(windows)]
const BACKEND_TCP_PORT_REBIND_VERIFY_RETRY_DELAY: Duration = Duration::from_millis(25);

#[cfg(windows)]
fn resolve_backend_tcp_launch_port(app: &tauri::AppHandle, prefer_cached: bool) -> Option<u16> {
    if prefer_cached {
        let cached_port = app
            .try_state::<BackendTcpLaunchPort>()
            .and_then(|state| state.0.lock().ok().and_then(|guard| *guard));
        if let Some(port) = cached_port.filter(|value| *value > 0) {
            return Some(port);
        }
    }

    // Bind an ephemeral port, then re-bind it immediately after dropping the
    // listener to verify nothing else claimed it in between (TOCTOU window).
    // The re-verified port is the one handed to the backend; attempts are
    // bounded and each failure is logged so a wedged allocator is visible.
    for attempt in 0..BACKEND_TCP_PORT_REBIND_VERIFY_MAX_ATTEMPTS {
        let listener = TcpListener::bind((BACKEND_TCP_HOST, 0)).ok()?;
        let port = listener.local_addr().ok()?.port();
        if port == 0 {
            return None;
        }
        drop(listener);
        match TcpListener::bind((BACKEND_TCP_HOST, port)) {
            Ok(_) => {
                set_backend_tcp_launch_port(app, Some(port));
                return Some(port);
            }
            Err(error) => {
                eprintln!(
                    "[backend_runtime] tcp launch port {port} was reallocated between bind and spawn (attempt {}): {}",
                    attempt + 1,
                    error
                );
                std::thread::sleep(BACKEND_TCP_PORT_REBIND_VERIFY_RETRY_DELAY);
            }
        }
    }
    eprintln!(
        "[backend_runtime] tcp launch port reallocation exhausted all {} retries; backend transport may fail to bind",
        BACKEND_TCP_PORT_REBIND_VERIFY_MAX_ATTEMPTS
    );
    None
}

pub(crate) fn resolve_backend_transport(app: &tauri::AppHandle) -> Option<BackendTransport> {
    #[cfg(unix)]
    {
        let deterministic = resolve_backend_unix_socket_path(app)?;
        if let Some(state) = read_backend_runtime_state(app) {
            let transport_type = state
                .transport_type
                .clone()
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase();
            if transport_type == "unix" {
                if let Some(socket_path) = validated_persisted_backend_unix_socket_path(
                    state.socket_path.as_deref(),
                    deterministic.as_path(),
                ) {
                    return Some(BackendTransport::Unix(socket_path));
                }
            }
        }
        return Some(BackendTransport::Unix(deterministic));
    }

    #[cfg(windows)]
    {
        if let Some(state) = read_backend_runtime_state(app) {
            let transport_type = state
                .transport_type
                .clone()
                .unwrap_or_else(|| {
                    if state.port.unwrap_or(0) > 0 {
                        "tcp".to_string()
                    } else {
                        String::new()
                    }
                })
                .trim()
                .to_ascii_lowercase();
            if transport_type == "tcp" {
                let Some(port) = state.port.filter(|port| *port > 0) else {
                    let fallback_port = resolve_backend_tcp_launch_port(app, true)?;
                    return Some(BackendTransport::Tcp {
                        host: BACKEND_TCP_HOST.to_string(),
                        port: fallback_port,
                    });
                };
                set_backend_tcp_launch_port(app, Some(port));
                return Some(BackendTransport::Tcp {
                    host: BACKEND_TCP_HOST.to_string(),
                    port,
                });
            }
        }
        let port = resolve_backend_tcp_launch_port(app, true)?;
        return Some(BackendTransport::Tcp {
            host: BACKEND_TCP_HOST.to_string(),
            port,
        });
    }

    #[allow(unreachable_code)]
    None
}

fn transport_socket_path(transport: &BackendTransport) -> Option<&Path> {
    match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => Some(socket_path.as_path()),
        #[cfg(windows)]
        BackendTransport::Tcp { .. } => None,
    }
}

pub(super) fn connect_backend_socket_with_timeout(
    transport: &BackendTransport,
    timeout: Duration,
) -> Result<Socket, String> {
    let (domain, address) = match transport {
        #[cfg(unix)]
        BackendTransport::Unix(socket_path) => (
            Domain::UNIX,
            SockAddr::unix(socket_path).map_err(|_| "BACKEND_NOT_READY".to_string())?,
        ),
        #[cfg(windows)]
        BackendTransport::Tcp { host, port } => {
            let socket_address = format!("{}:{}", host, port)
                .parse::<std::net::SocketAddr>()
                .map_err(|_| "BACKEND_NOT_READY".to_string())?;
            let domain = if socket_address.is_ipv4() {
                Domain::IPV4
            } else {
                Domain::IPV6
            };
            (domain, SockAddr::from(socket_address))
        }
    };
    let socket =
        Socket::new(domain, Type::STREAM, None).map_err(|_| "BACKEND_NOT_READY".to_string())?;
    socket
        .connect_timeout(&address, timeout)
        .map_err(|_| "BACKEND_NOT_READY".to_string())?;
    Ok(socket)
}

pub(super) fn backend_socket_is_connectable(transport: &BackendTransport) -> bool {
    connect_backend_socket_with_timeout(transport, BACKEND_CONNECTABILITY_PROBE_TIMEOUT).is_ok()
}

pub(super) fn clear_backend_socket_file(transport: &BackendTransport) {
    if let Some(socket_path) = transport_socket_path(transport) {
        #[cfg(unix)]
        if fs::symlink_metadata(socket_path)
            .map(|metadata| metadata.file_type().is_socket())
            .unwrap_or(false)
        {
            let _ = fs::remove_file(socket_path);
        }
    }
}

#[cfg(all(test, unix))]
mod unix_socket_safety_tests {
    use super::*;
    use std::os::unix::net::UnixListener;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_root() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "zs-{}-{:08x}",
            std::process::id(),
            (nonce & 0xffff_ffff) as u32
        ));
        fs::create_dir(&root).expect("create fixture root");
        root
    }

    #[test]
    fn persisted_socket_path_must_equal_the_deterministic_path() {
        let deterministic = PathBuf::from("/tmp/zinuto-owned.sock");
        assert_eq!(
            validated_persisted_backend_unix_socket_path(
                deterministic.to_str(),
                deterministic.as_path(),
            ),
            Some(deterministic.clone())
        );
        assert_eq!(
            validated_persisted_backend_unix_socket_path(
                Some("/tmp/unrelated.sock"),
                deterministic.as_path(),
            ),
            None
        );
        assert_eq!(
            validated_persisted_backend_unix_socket_path(None, deterministic.as_path()),
            None
        );
    }

    #[test]
    fn cleanup_removes_only_a_unix_socket_and_preserves_files_and_symlinks() {
        let root = fixture_root();
        let regular = root.join("regular");
        let link = root.join("link");
        let socket = root.join("owned.sock");
        fs::write(&regular, b"keep").expect("write regular fixture");
        std::os::unix::fs::symlink(&regular, &link).expect("create symlink fixture");
        let listener = UnixListener::bind(&socket).expect("bind unix socket fixture");

        clear_backend_socket_file(&BackendTransport::Unix(regular.clone()));
        clear_backend_socket_file(&BackendTransport::Unix(link.clone()));
        assert!(regular.exists());
        assert!(fs::symlink_metadata(&link).is_ok());

        drop(listener);
        clear_backend_socket_file(&BackendTransport::Unix(socket.clone()));
        assert!(!socket.exists());
        assert_eq!(fs::read(&regular).expect("regular survives"), b"keep");

        fs::remove_file(&link).expect("remove symlink fixture");
        fs::remove_file(&regular).expect("remove regular fixture");
        fs::remove_dir(&root).expect("remove fixture root");
    }
}
