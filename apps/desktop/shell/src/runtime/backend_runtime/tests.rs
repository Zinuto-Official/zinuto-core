// SPDX-License-Identifier: GPL-3.0-only

use super::transport::cached_backend_transport_matches_failure;
use super::*;
use crate::runtime::backend_orphan::BackendOrphanEndpointEvidence;

#[test]
fn backend_startup_preflight_v1_event_serializes_the_complete_status() {
    assert_eq!(
        BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1,
        "zinuto://v1/backend-startup-preflight-status"
    );
    let payload = serde_json::to_value(backend_startup_preflight_status_for(
        "FAILED",
        "health",
        Some("BACKEND_RUNTIME_EXITED".to_string()),
        Some("Backend runtime exited".to_string()),
    ))
    .expect("serialize backend startup status event payload");
    let object = payload
        .as_object()
        .expect("backend startup status payload must be an object");

    assert_eq!(object.len(), 5);
    assert_eq!(payload["state"], "FAILED");
    assert_eq!(payload["stage"], "health");
    assert_eq!(payload["errorCode"], "BACKEND_RUNTIME_EXITED");
    assert_eq!(payload["errorMessage"], "Backend runtime exited");
    assert!(payload["checkedAtMs"].as_u64().is_some());
}

#[test]
fn historical_runtime_state_formats_keep_started_at_and_channel_evidence_explicit() {
    let v1_0_4 = serde_json::from_str::<BackendRuntimeStateRecord>(
            r#"{"pid":4104,"parentPid":3104,"runtimeBuildId":"backend-bundle:v1.0.4:1","transportType":"unix","socketPath":"/tmp/zinuto.sock","host":null,"port":null,"startedAtMs":1750000000000}"#,
        )
        .expect("parse v1.0.4 runtime state");
    assert_eq!(v1_0_4.started_at_ms, Some(1_750_000_000_000));
    assert_eq!(v1_0_4.release_channel, None);

    let v1_1_0 = serde_json::from_str::<BackendRuntimeStateRecord>(
            r#"{"pid":4110,"parentPid":3110,"runtimeBuildId":"backend-bundle:v1.1.0:1","releaseChannel":"direct","transportType":"tcp","socketPath":null,"host":"127.0.0.1","port":43110,"startedAtMs":1751000000000}"#,
        )
        .expect("parse v1.1.0 runtime state");
    assert_eq!(v1_1_0.started_at_ms, Some(1_751_000_000_000));
    assert_eq!(v1_1_0.release_channel.as_deref(), Some("direct"));
}

#[test]
fn historical_bridge_token_mismatch_envelope_is_valid_orphan_endpoint_evidence() {
    let response = crate::bridge::BackendHttpBridgeResponse {
            status: 401,
            body: r#"{"ok":false,"requestId":"local-historical","errorCode":"BACKEND_BRIDGE_UNAUTHORIZED","errorStage":"AUTHORIZATION","cause":{"code":"BRIDGE_TOKEN_MISMATCH","stage":"AUTHORIZATION"},"details":{"path":"/api/v1/system/health","reason":"BRIDGE_TOKEN_MISMATCH"}}"#.to_string(),
            headers: std::collections::HashMap::new(),
        };
    assert_eq!(
        backend_orphan_endpoint_evidence_from_response(&response),
        BackendOrphanEndpointEvidence::UnauthorizedBridgeTokenMismatch
    );

    let missing_token = crate::bridge::BackendHttpBridgeResponse {
        status: 401,
        body: response
            .body
            .replace("BRIDGE_TOKEN_MISMATCH", "BRIDGE_TOKEN_MISSING"),
        headers: std::collections::HashMap::new(),
    };
    assert_eq!(
        backend_orphan_endpoint_evidence_from_response(&missing_token),
        BackendOrphanEndpointEvidence::Unverified
    );
}

#[test]
fn health_probe_timeout_is_capped_and_respects_absolute_remaining_time() {
    assert_eq!(
        bounded_backend_health_probe_timeout(Duration::from_secs(5)),
        Some(BACKEND_HEALTH_PROBE_TIMEOUT)
    );
    assert_eq!(
        bounded_backend_health_probe_timeout(Duration::from_millis(125)),
        Some(Duration::from_millis(125))
    );
    assert_eq!(bounded_backend_health_probe_timeout(Duration::ZERO), None);

    let now = Instant::now();
    assert_eq!(
        bounded_backend_health_probe_deadline(now, now + Duration::from_secs(5)),
        now + BACKEND_HEALTH_PROBE_TIMEOUT
    );
    assert_eq!(
        bounded_backend_health_probe_deadline(now, now + Duration::from_millis(125)),
        now + Duration::from_millis(125)
    );
}

#[cfg(any(unix, windows))]
fn backend_transport_for_recovery_test(endpoint_id: u16) -> BackendTransport {
    #[cfg(unix)]
    {
        BackendTransport::Unix(PathBuf::from(format!(
            "/tmp/zinuto-recovery-{endpoint_id}.sock"
        )))
    }
    #[cfg(windows)]
    {
        BackendTransport::Tcp {
            host: BACKEND_TCP_HOST.to_string(),
            port: 41000 + endpoint_id,
        }
    }
}

#[cfg(unix)]
#[test]
fn failed_transport_only_matches_the_same_cached_endpoint_generation() {
    let endpoint = BackendTransport::Unix(PathBuf::from("/tmp/zinuto-current.sock"));
    let failed = BackendReadyTransportSnapshot {
        transport: endpoint.clone(),
        revision: 7,
    };
    let current = failed.clone();
    let recovered_same_endpoint = BackendReadyTransportSnapshot {
        transport: endpoint,
        revision: 9,
    };
    let rotated = BackendReadyTransportSnapshot {
        transport: BackendTransport::Unix(PathBuf::from("/tmp/zinuto-rotated.sock")),
        revision: 7,
    };

    assert!(cached_backend_transport_matches_failure(
        Some(&current),
        &failed
    ));
    assert!(!cached_backend_transport_matches_failure(
        Some(&recovered_same_endpoint),
        &failed
    ));
    assert!(!cached_backend_transport_matches_failure(
        Some(&rotated),
        &failed
    ));
    assert!(!cached_backend_transport_matches_failure(None, &failed));
}

#[cfg(any(unix, windows))]
#[test]
fn connect_failure_invalidates_only_the_exact_failed_generation() {
    let endpoint = backend_transport_for_recovery_test(1);
    let failed = BackendReadyTransportSnapshot {
        transport: endpoint.clone(),
        revision: 7,
    };
    let mut state = BackendReadyTransportState {
        transport: Some(endpoint),
        revision: 7,
    };

    let recovery = prepare_backend_connect_failure_recovery(&mut state, &failed);

    assert!(matches!(
        recovery,
        BackendConnectFailureRecovery::Recover {
            invalidated_failed_generation: true
        }
    ));
    assert!(state.transport.is_none());
    assert_eq!(state.revision, 8);
}

#[cfg(any(unix, windows))]
#[test]
fn connect_failure_reuses_a_newer_cached_generation() {
    let endpoint = backend_transport_for_recovery_test(1);
    let failed = BackendReadyTransportSnapshot {
        transport: endpoint.clone(),
        revision: 7,
    };
    let mut state = BackendReadyTransportState {
        transport: Some(endpoint.clone()),
        revision: 9,
    };

    let recovery = prepare_backend_connect_failure_recovery(&mut state, &failed);

    let BackendConnectFailureRecovery::Reuse(ready_transport) = recovery else {
        panic!("newer generation must be reused");
    };
    assert_eq!(ready_transport.revision(), 9);
    assert!(ready_transport.transport() == &endpoint);
    assert!(state.transport.as_ref() == Some(&endpoint));
    assert_eq!(state.revision, 9);
}

#[cfg(windows)]
#[test]
fn failed_transport_does_not_match_a_rotated_windows_port() {
    let failed = BackendReadyTransportSnapshot {
        transport: BackendTransport::Tcp {
            host: BACKEND_TCP_HOST.to_string(),
            port: 41001,
        },
        revision: 3,
    };
    let current = BackendReadyTransportSnapshot {
        transport: BackendTransport::Tcp {
            host: BACKEND_TCP_HOST.to_string(),
            port: 41002,
        },
        revision: 4,
    };

    assert!(!cached_backend_transport_matches_failure(
        Some(&current),
        &failed
    ));
}

#[test]
fn startup_gate_wait_polls_cancellation_every_500ms() {
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let cancelled_flag = std::sync::Arc::clone(&cancelled);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        cancelled_flag.store(true, Ordering::Relaxed);
    });
    let _gate_holder = backend_startup_gate()
        .lock()
        .expect("hold the startup gate for the test");

    let started_at = Instant::now();
    let result = acquire_backend_startup_gate(&|| cancelled.load(Ordering::Relaxed));
    let elapsed = started_at.elapsed();

    assert!(result.is_err());
    assert_eq!(
        result.err(),
        Some("BACKEND_HTTP_REQUEST_CANCELED".to_string())
    );
    assert!(
        elapsed >= Duration::from_millis(450) && elapsed < Duration::from_secs(2),
        "cancelled gate wait must return at the next 500ms poll (took {elapsed:?})",
    );
}

#[test]
fn startup_gate_acquisition_succeeds_when_the_gate_is_free() {
    let result = acquire_backend_startup_gate(&|| false);
    assert!(result.is_ok(), "a free gate must be acquired immediately");
}
