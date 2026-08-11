// SPDX-License-Identifier: GPL-3.0-only

#[test]
fn cancellation_during_transport_recovery_skips_the_second_connect_attempt() {
    #[cfg(unix)]
    let failed_endpoint = BackendTransport::Unix(std::path::PathBuf::from("/tmp/zinuto-dead.sock"));
    #[cfg(unix)]
    let recovered_endpoint =
        BackendTransport::Unix(std::path::PathBuf::from("/tmp/zinuto-recovered.sock"));
    #[cfg(windows)]
    let failed_endpoint = BackendTransport::Tcp { host: "127.0.0.1".to_string(), port: 41001 };
    #[cfg(windows)]
    let recovered_endpoint = BackendTransport::Tcp { host: "127.0.0.1".to_string(), port: 41002 };
    let failed_transport = BackendReadyTransportSnapshot::from_test_parts(failed_endpoint, 4);
    let recovered_transport = BackendReadyTransportSnapshot::from_test_parts(recovered_endpoint, 6);
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_for_check = Arc::clone(&cancelled);
    let mut connect_attempts = 0usize;

    let result = connect_backend_stream_with_recovery(
        &failed_transport,
        &|| cancelled_for_check.load(Ordering::Acquire),
        |transport| {
            connect_attempts += 1;
            assert!(transport == failed_transport.transport());
            Err::<u8, io::Error>(io::Error::new(io::ErrorKind::ConnectionRefused, "dead endpoint"))
        },
        |_| {
            cancelled.store(true, Ordering::Release);
            Ok(recovered_transport.clone())
        },
        |_| panic!("cancellation must not invalidate the recovered transport"),
    );

    assert!(matches!(result, Err(ref error) if error.error_code == "BACKEND_HTTP_REQUEST_CANCELED"));
    assert_eq!(connect_attempts, 1);
}

#[test]
fn unframed_keep_alive_response_is_rejected_before_idle_timeout() {
    let mut stream = NonClosingResponseStream::new(
        b"HTTP/1.1 200 OK\r\nConnection: keep-alive\r\n\r\n{\"ok\":true}",
    );

    let result = send_http_request_over_stream(
        &mut stream,
        b"GET /api/v1/system/health HTTP/1.1\r\n\r\n",
        || false,
        Duration::from_millis(1_000),
    );

    assert!(matches!(
        result,
        Err(ref error_code) if error_code == "BACKEND_HTTP_RESPONSE_INVALID"
    ));
}
