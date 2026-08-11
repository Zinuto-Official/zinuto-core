// SPDX-License-Identifier: GPL-3.0-only

use super::*;
use crate::bridge::chunked_body_decoder::{
    decode_chunked_body, ChunkedBodyDecoder, ChunkedDecodeProgress,
};
use crate::bridge::connection_pool::{
    backend_transport_pool_key_for, is_backend_http_idempotent_method,
};
use std::io::{Cursor, Error, ErrorKind};

struct NonClosingResponseStream {
    response: Cursor<Vec<u8>>,
    writes: Vec<u8>,
}

impl NonClosingResponseStream {
    fn new(response: &[u8]) -> Self {
        Self {
            response: Cursor::new(response.to_vec()),
            writes: Vec::new(),
        }
    }
}

impl Read for NonClosingResponseStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let read = self.response.read(buf)?;
        if read == 0 {
            return Err(Error::new(ErrorKind::WouldBlock, "stream remains open"));
        }
        Ok(read)
    }
}

impl Write for NonClosingResponseStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.writes.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct CancellingIoStream {
    cancelled: Arc<AtomicBool>,
    cancel_on_write: bool,
}

impl Read for CancellingIoStream {
    fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
        self.cancelled.store(true, Ordering::Release);
        Err(Error::new(
            ErrorKind::ConnectionAborted,
            "request canceled while reading",
        ))
    }
}

impl Write for CancellingIoStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.cancel_on_write {
            self.cancelled.store(true, Ordering::Release);
            return Err(Error::new(
                ErrorKind::BrokenPipe,
                "request canceled while writing",
            ));
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn build_http_request_bytes_keeps_default_connection_close() {
    let request = String::from_utf8(build_http_request_bytes(
        "GET",
        "/api/v1/system/health",
        None,
        None,
    ))
    .expect("request should be utf8");

    assert!(request.contains("Connection: close\r\n"));
    assert!(!request.contains("Connection: keep-alive\r\n"));
}

#[test]
fn build_http_request_bytes_can_request_keep_alive() {
    let request = String::from_utf8(build_http_request_bytes_with_connection(
        "GET",
        "/api/v1/system/health",
        None,
        None,
        true,
    ))
    .expect("request should be utf8");

    assert!(request.contains("Connection: keep-alive\r\n"));
    assert!(!request.contains("Connection: close\r\n"));
}

#[test]
fn framed_content_length_response_does_not_wait_for_connection_close() {
    let mut stream = NonClosingResponseStream::new(
        b"HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: keep-alive\r\n\r\n{\"ok\":true}\n",
    );

    let response = send_http_request_over_stream(
        &mut stream,
        b"GET /api/v1/system/health HTTP/1.1\r\n\r\n",
        || false,
        Duration::from_millis(1_000),
    )
    .expect("content-length response should complete before EOF");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, "{\"ok\":true}\n");
    assert_eq!(
        response.headers.get("connection").map(String::as_str),
        Some("keep-alive"),
    );
}

#[test]
fn chunked_response_requires_terminal_chunk_boundary() {
    assert_eq!(decode_chunked_body(b"3\r\nabc\r\n0\r\n"), Ok(None));
    assert_eq!(
        decode_chunked_body(b"3\r\nabc\r\n0\r\n\r\n"),
        Ok(Some(b"abc".to_vec())),
    );
}

#[test]
fn io_failure_caused_by_cancellation_stays_canceled() {
    for cancel_on_write in [true, false] {
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut stream = CancellingIoStream {
            cancelled: Arc::clone(&cancelled),
            cancel_on_write,
        };
        let result = send_http_request_over_stream(
            &mut stream,
            b"GET /api/v1/system/health HTTP/1.1\r\n\r\n",
            || cancelled.load(Ordering::Acquire),
            Duration::from_millis(100),
        );

        assert!(
            matches!(result, Err(ref error_code) if error_code == "BACKEND_HTTP_REQUEST_CANCELED"),
            "cancel_on_write={cancel_on_write}: cancellation must not become a transport failure",
        );
    }
}

#[test]
fn should_pool_backend_http_methods_with_bodies() {
    assert!(should_pool_backend_http_request("GET", None));
    assert!(should_pool_backend_http_request("get", Some("")));
    assert!(should_pool_backend_http_request("POST", Some("{}")));
    assert!(should_pool_backend_http_request("GET", Some("{}")));
    assert!(!should_pool_backend_http_request("TRACE", None));
}

#[test]
fn pooled_post_with_body_uses_keep_alive_and_records_bytes() {
    let body = r#"{"event":"opened"}"#;
    let request = build_http_request_bytes_with_connection(
        "POST",
        "/api/v1/events",
        Some(body),
        None,
        should_pool_backend_http_request("POST", Some(body)),
    );
    let request_text = String::from_utf8(request.clone()).expect("request should be utf8");
    assert!(request_text.starts_with("POST /api/v1/events HTTP/1.1\r\n"));
    assert!(request_text.contains("Connection: keep-alive\r\n"));
    assert!(request_text.contains(&format!("Content-Length: {}\r\n", body.len())));
    assert!(request_text.ends_with(body));

    let mut stats = BackendHttpTransportStats::from_request(true, &request);
    let mut stream = NonClosingResponseStream::new(
            b"HTTP/1.1 201 Created\r\nContent-Length: 11\r\nConnection: keep-alive\r\n\r\n{\"ok\":true}",
        );
    let response = send_http_request_over_stream_with_stats(
        &mut stream,
        &request,
        || false,
        Duration::from_millis(1_000),
        &mut stats,
    )
    .expect("pooled post response should parse");

    assert_eq!(response.status, 201);
    assert_eq!(response.body, "{\"ok\":true}");
    assert!(stats.pool_eligible);
    assert_eq!(stats.request_body_bytes, body.len() as u64);
    assert_eq!(stats.request_wire_bytes, request.len() as u64);
    assert_eq!(stats.response_body_bytes, "{\"ok\":true}".len() as u64);
    assert!(stats.response_header_bytes > 0);
    assert!(stats.response_wire_bytes >= stats.response_header_bytes + stats.response_body_bytes);
}

#[test]
fn stale_pool_retry_policy_keeps_mutations_single_attempt() {
    assert!(!should_retry_backend_http_stale_pool_stream(
        "POST",
        true,
        false,
        "BACKEND_HTTP_REQUEST_FAILED",
    ));
    assert!(should_retry_backend_http_stale_pool_stream(
        "GET",
        true,
        false,
        "BACKEND_HTTP_REQUEST_FAILED",
    ));
    assert!(should_retry_backend_http_stale_pool_stream(
        "HEAD",
        true,
        false,
        "BACKEND_HTTP_RESPONSE_INVALID",
    ));
    assert!(!should_retry_backend_http_stale_pool_stream(
        "GET",
        true,
        true,
        "BACKEND_HTTP_REQUEST_FAILED",
    ));
    assert!(!should_retry_backend_http_stale_pool_stream(
        "GET",
        true,
        false,
        "BACKEND_HTTP_REQUEST_CANCELED",
    ));
    assert!(!should_retry_backend_http_stale_pool_stream(
        "GET",
        true,
        false,
        "BACKEND_HTTP_RESPONSE_TOO_LARGE",
    ));
    assert!(!should_retry_backend_http_stale_pool_stream(
        "GET",
        false,
        false,
        "BACKEND_HTTP_REQUEST_FAILED",
    ));
}

#[test]
fn only_connection_and_protocol_failures_invalidate_backend_readiness() {
    assert!(should_invalidate_backend_transport_after_http_error(
        "BACKEND_HTTP_REQUEST_FAILED"
    ));
    assert!(should_invalidate_backend_transport_after_http_error(
        "BACKEND_HTTP_RESPONSE_INVALID"
    ));
    assert!(!should_invalidate_backend_transport_after_http_error(
        "BACKEND_HTTP_REQUEST_CANCELED"
    ));
    assert!(!should_invalidate_backend_transport_after_http_error(
        "BACKEND_HTTP_RESPONSE_TOO_LARGE"
    ));
}

#[test]
fn first_connect_failure_retries_recovered_generation_in_the_same_call() {
    #[cfg(unix)]
    let failed_endpoint = BackendTransport::Unix(std::path::PathBuf::from("/tmp/zinuto-dead.sock"));
    #[cfg(unix)]
    let recovered_endpoint =
        BackendTransport::Unix(std::path::PathBuf::from("/tmp/zinuto-recovered.sock"));
    #[cfg(windows)]
    let failed_endpoint = BackendTransport::Tcp {
        host: "127.0.0.1".to_string(),
        port: 41001,
    };
    #[cfg(windows)]
    let recovered_endpoint = BackendTransport::Tcp {
        host: "127.0.0.1".to_string(),
        port: 41002,
    };
    let failed_transport = BackendReadyTransportSnapshot::from_test_parts(failed_endpoint, 4);
    let recovered_transport = BackendReadyTransportSnapshot::from_test_parts(recovered_endpoint, 6);
    let mut connect_attempts = 0usize;
    let mut recovery_calls = 0usize;
    let mut invalidation_calls = 0usize;

    let result = connect_backend_stream_with_recovery(
        &failed_transport,
        &|| false,
        |transport| {
            connect_attempts += 1;
            if connect_attempts == 1 {
                assert!(transport == failed_transport.transport());
                return Err(io::Error::new(
                    io::ErrorKind::ConnectionRefused,
                    "dead endpoint",
                ));
            }
            assert!(transport == recovered_transport.transport());
            Ok(42u8)
        },
        |transport| {
            recovery_calls += 1;
            assert_eq!(transport.revision(), failed_transport.revision());
            assert!(transport.transport() == failed_transport.transport());
            Ok(recovered_transport.clone())
        },
        |_| {
            invalidation_calls += 1;
        },
    );
    let Ok((stream, connected_transport)) = result else {
        panic!("the first request should connect to the recovered generation");
    };

    assert_eq!(stream, 42);
    assert_eq!(connected_transport.revision(), 6);
    assert!(connected_transport.transport() == recovered_transport.transport());
    assert_eq!(connect_attempts, 2);
    assert_eq!(recovery_calls, 1);
    assert_eq!(invalidation_calls, 0);
}

include!("../transport_recovery_tests.rs");

#[cfg(unix)]
#[test]
fn pooled_connection_key_isolated_by_backend_generation() {
    let endpoint = BackendTransport::Unix(std::path::PathBuf::from("/tmp/zinuto-generation.sock"));

    assert_ne!(
        backend_transport_pool_key_for(&endpoint, 11),
        backend_transport_pool_key_for(&endpoint, 13)
    );
}

#[test]
fn transport_stats_accumulate_pool_connect_and_stale_retry_segments() {
    let request =
        build_http_request_bytes_with_connection("GET", "/api/v1/system/health", None, None, true);
    let mut stats = BackendHttpTransportStats::from_request(true, &request);

    stats.record_pool_lookup(Duration::from_millis(2), true);
    stats.record_connect_attempt(Duration::from_millis(3));
    stats.record_stale_pool_retry();
    stats.record_read_body_progress(Duration::from_millis(5));

    assert!(stats.pool_eligible);
    assert_eq!(stats.pool_lookup_count, 1);
    assert_eq!(stats.pool_hit_count, 1);
    assert_eq!(stats.pool_lookup_elapsed, Duration::from_millis(2));
    assert_eq!(stats.connect_attempt_count, 1);
    assert_eq!(stats.connect_elapsed, Duration::from_millis(3));
    assert_eq!(stats.stale_pool_retry_count, 1);
    assert_eq!(stats.read_body_elapsed, Duration::from_millis(5));
}

#[test]
fn mutation_http_pool_idle_ttl_is_shorter_than_idempotent_ttl() {
    assert!(is_backend_http_idempotent_method("GET"));
    assert!(is_backend_http_idempotent_method("head"));
    assert!(!is_backend_http_idempotent_method("POST"));
    assert!(
        backend_http_connection_pool_idle_ttl("POST")
            < backend_http_connection_pool_idle_ttl("GET")
    );
}

#[test]
fn socket_io_timeouts_never_exceed_request_idle_timeout() {
    assert_eq!(
        backend_http_stream_timeouts(Duration::from_millis(750)),
        (Duration::from_millis(750), Duration::from_millis(750))
    );
    assert_eq!(
        backend_http_stream_timeouts(Duration::from_secs(120)),
        (
            BACKEND_HTTP_REQUEST_READ_TIMEOUT,
            BACKEND_HTTP_REQUEST_WRITE_TIMEOUT
        )
    );
}

#[test]
fn backend_http_transport_trace_flag_requires_explicit_truthy_value() {
    assert!(is_enabled_backend_http_transport_trace_flag("1"));
    assert!(is_enabled_backend_http_transport_trace_flag(" true "));
    assert!(is_enabled_backend_http_transport_trace_flag("YES"));
    assert!(is_enabled_backend_http_transport_trace_flag("on"));
    assert!(!is_enabled_backend_http_transport_trace_flag(""));
    assert!(!is_enabled_backend_http_transport_trace_flag("0"));
    assert!(!is_enabled_backend_http_transport_trace_flag("false"));
    assert!(!is_enabled_backend_http_transport_trace_flag("debug"));
}

#[test]
fn validate_rejects_traversal_and_collapsed_separators_but_allows_queries() {
    for path in [
        "/api/v1/../secret",
        "/api/v1/a/..",
        "/api/v1//a",
        "/api/v1/a//b",
    ] {
        let result = validate_backend_bridge_request("GET", path, None);
        assert!(
            matches!(result, Err(ref error) if error.error_code == "INVALID_PARAMS"),
            "path {path:?} must be rejected",
        );
    }

    let (method, normalized_path, headers) =
        match validate_backend_bridge_request("GET", "/api/v1/system/health", None) {
            Ok(value) => value,
            Err(error) => panic!("plain api path must be allowed, got {}", error.error_code),
        };
    assert_eq!(method, "GET");
    assert_eq!(normalized_path, "/api/v1/system/health");
    assert!(headers.is_empty());

    let (_, query_path, _) = validate_backend_bridge_request(
        "GET",
        "/api/v1/system/health?verbose=true&query=market%2Fdata",
        None,
    )
    .unwrap_or_else(|error| {
        panic!(
            "query parameters must be forwarded to the backend router: {}",
            error.error_code
        )
    });
    assert_eq!(
        query_path,
        "/api/v1/system/health?verbose=true&query=market%2Fdata"
    );

    for path in [
        "/api/v1/system/health?query=a?b",
        "/api/v1/system/health#fragment",
    ] {
        assert!(
            matches!(
                validate_backend_bridge_request("GET", path, None),
                Err(ref error) if error.error_code == "INVALID_PARAMS"
            ),
            "path {path:?} must be rejected",
        );
    }
}

#[test]
fn no_content_response_completes_without_waiting_for_connection_close() {
    let mut stream = NonClosingResponseStream::new(b"HTTP/1.1 204 No Content\r\n\r\n");

    let response = send_http_request_over_stream(
        &mut stream,
        b"GET /api/v1/system/health HTTP/1.1\r\n\r\n",
        || false,
        Duration::from_millis(1_000),
    )
    .expect("204 response should complete without reading a body");

    assert_eq!(response.status, 204);
    assert_eq!(response.body, "");
}

#[test]
fn zero_content_length_response_completes_immediately() {
    let mut stream = NonClosingResponseStream::new(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");

    let response = send_http_request_over_stream(
        &mut stream,
        b"GET /api/v1/system/health HTTP/1.1\r\n\r\n",
        || false,
        Duration::from_millis(1_000),
    )
    .expect("Content-Length: 0 should complete without waiting for EOF");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, "");
    assert!(response.headers.contains_key("content-length"));
}

#[test]
fn chunked_decoder_is_incremental_and_matches_the_one_shot_result() {
    let payload = b"3\r\nabc\r\n6\r\ndefghi\r\n0\r\n\r\n";
    let expected = decode_chunked_body(payload)
        .expect("complete chunked payload should decode")
        .expect("one-shot decode should finish");

    // Feed the decoder the growing buffer prefixes the streaming loop
    // would pass; it must never complete before the final byte and must
    // produce exactly the same bytes as the one-shot decode.
    let mut decoder = ChunkedBodyDecoder::default();
    let mut output = Vec::new();
    for end in 1..=payload.len() {
        let progress = decoder
            .decode(&payload[..end], &mut output)
            .expect("chunked decode must not error on a valid payload");
        if end < payload.len() {
            assert_ne!(
                progress,
                ChunkedDecodeProgress::Complete,
                "a partial buffer must not complete the body at {end} bytes",
            );
        } else {
            assert_eq!(progress, ChunkedDecodeProgress::Complete);
        }
    }
    assert_eq!(
        decoder
            .decode(b"", &mut output)
            .expect("empty final chunk should not error"),
        ChunkedDecodeProgress::Complete,
    );
    assert_eq!(output, expected);
}
