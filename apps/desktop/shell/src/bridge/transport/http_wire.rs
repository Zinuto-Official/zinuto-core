// SPDX-License-Identifier: GPL-3.0-only

use std::borrow::Cow;
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::time::{Duration, Instant};

use crate::bridge::chunked_body_decoder::decode_chunked_body;
use crate::bridge::chunked_body_decoder::{ChunkedBodyDecoder, ChunkedDecodeProgress};
use crate::bridge::BackendHttpBridgeResponse;

const BACKEND_HTTP_MAX_RESPONSE_HEADER_SIZE: usize = 1024 * 1024;
pub(crate) const BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE: usize = 100 * 1024 * 1024;
const BACKEND_HTTP_TRANSPORT_TRACE_ENV: &str = "ZINUTO_BACKEND_HTTP_TRANSPORT_TRACE";

#[derive(Debug, Clone, Default)]
pub(super) struct BackendHttpTransportStats {
    pub(super) pool_eligible: bool,
    pub(super) pool_lookup_count: u64,
    pub(super) pool_hit_count: u64,
    pub(super) pool_lookup_elapsed: Duration,
    pub(super) stale_pool_retry_count: u64,
    pub(super) connect_attempt_count: u64,
    pub(super) connect_elapsed: Duration,
    pub(super) write_elapsed: Duration,
    pub(super) read_header_elapsed: Duration,
    pub(super) read_body_elapsed: Duration,
    pub(super) request_header_bytes: u64,
    pub(super) request_body_bytes: u64,
    pub(super) request_wire_bytes: u64,
    pub(super) response_header_bytes: u64,
    pub(super) response_body_bytes: u64,
    pub(super) response_wire_bytes: u64,
}

impl BackendHttpTransportStats {
    pub(super) fn from_request(pool_eligible: bool, request_bytes: &[u8]) -> Self {
        let body_start = request_bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|header_end| header_end + 4)
            .unwrap_or(request_bytes.len());
        Self {
            pool_eligible,
            request_header_bytes: body_start as u64,
            request_body_bytes: request_bytes.len().saturating_sub(body_start) as u64,
            ..Self::default()
        }
    }

    pub(super) fn record_pool_lookup(&mut self, elapsed: Duration, hit: bool) {
        self.pool_lookup_count = self.pool_lookup_count.saturating_add(1);
        self.pool_lookup_elapsed = self.pool_lookup_elapsed.saturating_add(elapsed);
        if hit {
            self.pool_hit_count = self.pool_hit_count.saturating_add(1);
        }
    }

    pub(super) fn record_connect_attempt(&mut self, elapsed: Duration) {
        self.connect_attempt_count = self.connect_attempt_count.saturating_add(1);
        self.connect_elapsed = self.connect_elapsed.saturating_add(elapsed);
    }

    pub(super) fn record_stale_pool_retry(&mut self) {
        self.stale_pool_retry_count = self.stale_pool_retry_count.saturating_add(1);
    }

    pub(super) fn record_write(&mut self, elapsed: Duration, bytes: usize) {
        self.write_elapsed = self.write_elapsed.saturating_add(elapsed);
        self.request_wire_bytes = self.request_wire_bytes.saturating_add(bytes as u64);
    }

    pub(super) fn record_read_header_progress(&mut self, elapsed: Duration) {
        self.read_header_elapsed = self.read_header_elapsed.saturating_add(elapsed);
    }

    pub(super) fn record_read_body_progress(&mut self, elapsed: Duration) {
        self.read_body_elapsed = self.read_body_elapsed.saturating_add(elapsed);
    }

    pub(super) fn record_read_bytes(&mut self, bytes: usize) {
        self.response_wire_bytes = self.response_wire_bytes.saturating_add(bytes as u64);
    }

    pub(super) fn record_response_shape(&mut self, header_bytes: usize, body_bytes: usize) {
        self.response_header_bytes = header_bytes as u64;
        self.response_body_bytes = body_bytes as u64;
    }
}

pub(crate) fn normalize_http_method(method: &str) -> String {
    let trimmed = method.trim().to_ascii_uppercase();
    if trimmed.is_empty() {
        "GET".to_string()
    } else {
        trimmed
    }
}

pub(crate) fn normalize_http_path(path: &str) -> String {
    path.trim().to_string()
}

pub(super) fn parse_http_response_head(
    raw: &[u8],
) -> Result<(u16, HashMap<String, String>), String> {
    let header_text = String::from_utf8_lossy(raw);
    let mut header_lines = header_text.split("\r\n");
    let status_line = header_lines
        .next()
        .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;

    let mut headers = HashMap::<String, String>::new();
    for line in header_lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    Ok((status, headers))
}

pub(super) fn parse_http_response_with_body_bytes(
    raw: &[u8],
) -> Result<(BackendHttpBridgeResponse, usize), String> {
    let header_end = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;

    let (status, headers) = parse_http_response_head(&raw[..header_end])?;
    let mut body = Cow::Borrowed(&raw[header_end + 4..]);
    let transfer_encoding = headers
        .get("transfer-encoding")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if transfer_encoding.contains("chunked") {
        body = Cow::Owned(decode_chunked_body(body.as_ref()).and_then(|decoded| {
            decoded.ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())
        })?);
    } else if let Some(length_value) = headers.get("content-length") {
        if let Ok(length) = length_value.parse::<usize>() {
            if body.len() >= length {
                let truncated = &raw[header_end + 4..header_end + 4 + length];
                body = Cow::Borrowed(truncated);
            }
        }
    }
    let body_bytes = body.len();

    Ok((
        BackendHttpBridgeResponse {
            status,
            body: String::from_utf8_lossy(body.as_ref()).into_owned(),
            headers,
        },
        body_bytes,
    ))
}

pub(crate) fn build_http_request_bytes(
    method: &str,
    path: &str,
    body: Option<&str>,
    headers: Option<&HashMap<String, String>>,
) -> Vec<u8> {
    build_http_request_bytes_with_connection(method, path, body, headers, false)
}

pub(super) fn build_http_request_bytes_with_connection(
    method: &str,
    path: &str,
    body: Option<&str>,
    headers: Option<&HashMap<String, String>>,
    keep_alive: bool,
) -> Vec<u8> {
    let method_value = normalize_http_method(method);
    let path_value = normalize_http_path(path);
    let body_value = body.unwrap_or_default();
    let body_bytes = body_value.as_bytes();

    let mut request_bytes: Vec<u8> = Vec::new();
    request_bytes
        .extend_from_slice(format!("{} {} HTTP/1.1\r\n", method_value, path_value).as_bytes());
    request_bytes.extend_from_slice(b"Host: zinuto.local\r\n");
    request_bytes.extend_from_slice(if keep_alive {
        b"Connection: keep-alive\r\n".as_slice()
    } else {
        b"Connection: close\r\n".as_slice()
    });

    let mut has_content_type = false;
    if let Some(headers_map) = headers {
        for (name, value) in headers_map {
            let trimmed_name = name.trim();
            if trimmed_name.is_empty() {
                continue;
            }
            let lower_name = trimmed_name.to_ascii_lowercase();
            if lower_name == "host" || lower_name == "connection" || lower_name == "content-length"
            {
                continue;
            }
            if lower_name == "content-type" {
                has_content_type = true;
            }
            request_bytes
                .extend_from_slice(format!("{}: {}\r\n", trimmed_name, value.trim()).as_bytes());
        }
    }

    if !has_content_type {
        request_bytes.extend_from_slice(b"Content-Type: application/json\r\n");
    }
    request_bytes
        .extend_from_slice(format!("Content-Length: {}\r\n\r\n", body_bytes.len()).as_bytes());
    request_bytes.extend_from_slice(body_bytes);
    request_bytes
}

pub(crate) fn send_http_request_over_stream<S: Read + Write, F: Fn() -> bool>(
    stream: &mut S,
    request_bytes: &[u8],
    is_cancelled: F,
    idle_timeout: Duration,
) -> Result<BackendHttpBridgeResponse, String> {
    let mut stats = BackendHttpTransportStats::from_request(false, request_bytes);
    send_http_request_over_stream_with_stats(
        stream,
        request_bytes,
        is_cancelled,
        idle_timeout,
        &mut stats,
    )
}

pub(super) fn write_all_counted<S: Write>(
    stream: &mut S,
    request_bytes: &[u8],
) -> Result<usize, io::Error> {
    let mut written = 0usize;
    while written < request_bytes.len() {
        match stream.write(&request_bytes[written..]) {
            Ok(0) => {
                return Err(io::Error::new(
                    io::ErrorKind::WriteZero,
                    "failed to write request",
                ));
            }
            Ok(bytes) => {
                written = written.saturating_add(bytes);
            }
            Err(error) => return Err(error),
        }
    }
    stream.flush()?;
    Ok(written)
}

pub(super) fn send_http_request_over_stream_with_stats<S: Read + Write, F: Fn() -> bool>(
    stream: &mut S,
    request_bytes: &[u8],
    is_cancelled: F,
    idle_timeout: Duration,
    stats: &mut BackendHttpTransportStats,
) -> Result<BackendHttpBridgeResponse, String> {
    if is_cancelled() {
        return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
    }
    let write_started_at = Instant::now();
    let written_bytes = write_all_counted(stream, request_bytes).map_err(|_| {
        if is_cancelled() {
            "BACKEND_HTTP_REQUEST_CANCELED".to_string()
        } else {
            "BACKEND_HTTP_REQUEST_FAILED".to_string()
        }
    })?;
    stats.record_write(write_started_at.elapsed(), written_bytes);

    let mut response_bytes: Vec<u8> = Vec::new();
    let mut read_buffer = [0_u8; 8192];
    let mut last_progress_at = Instant::now();
    let mut reading_body = false;
    let read_next_chunk = |stream: &mut S,
                           response_bytes: &mut Vec<u8>,
                           read_buffer: &mut [u8; 8192],
                           last_progress_at: &mut Instant,
                           stats: &mut BackendHttpTransportStats,
                           reading_body: bool|
     -> Result<bool, String> {
        if is_cancelled() {
            return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
        }
        let read_started_at = Instant::now();
        match stream.read(read_buffer) {
            Ok(0) if is_cancelled() => Err("BACKEND_HTTP_REQUEST_CANCELED".to_string()),
            Ok(0) => Ok(false),
            Ok(read_len) => {
                let elapsed = read_started_at.elapsed();
                if reading_body {
                    stats.record_read_body_progress(elapsed);
                } else {
                    stats.record_read_header_progress(elapsed);
                }
                stats.record_read_bytes(read_len);
                response_bytes.extend_from_slice(&read_buffer[..read_len]);
                *last_progress_at = Instant::now();
                Ok(true)
            }
            Err(_) if is_cancelled() => Err("BACKEND_HTTP_REQUEST_CANCELED".to_string()),
            Err(error)
                if error.kind() == io::ErrorKind::WouldBlock
                    || error.kind() == io::ErrorKind::TimedOut =>
            {
                if last_progress_at.elapsed() >= idle_timeout {
                    Err("BACKEND_HTTP_REQUEST_FAILED".to_string())
                } else {
                    Ok(true)
                }
            }
            Err(_) => Err("BACKEND_HTTP_REQUEST_FAILED".to_string()),
        }
    };

    let header_end = loop {
        if let Some(header_end) = response_bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
        {
            break header_end;
        }
        if response_bytes.len() > BACKEND_HTTP_MAX_RESPONSE_HEADER_SIZE {
            return Err("BACKEND_HTTP_RESPONSE_TOO_LARGE".to_string());
        }
        if !read_next_chunk(
            stream,
            &mut response_bytes,
            &mut read_buffer,
            &mut last_progress_at,
            stats,
            reading_body,
        )? {
            return Err("BACKEND_HTTP_RESPONSE_INVALID".to_string());
        }
    };

    let (status, headers) = parse_http_response_head(&response_bytes[..header_end])?;
    let body_start = header_end + 4;
    stats.response_header_bytes = body_start as u64;
    reading_body = true;
    let transfer_encoding = headers
        .get("transfer-encoding")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let connection_closes = headers
        .get("connection")
        .map(|value| {
            value
                .split(',')
                .any(|token| token.trim().eq_ignore_ascii_case("close"))
        })
        .unwrap_or(false);
    // A 204 response never carries a body and Content-Length: 0 declares an
    // empty body explicitly: complete immediately instead of waiting for the
    // next read to stall or for the connection to close (SH-M1).
    let body_is_known_empty = status == 204
        || status == 304
        || headers
            .get("content-length")
            .map(|value| {
                value
                    .trim()
                    .parse::<u64>()
                    .map(|length| length == 0)
                    .unwrap_or(false)
            })
            .unwrap_or(false);
    if body_is_known_empty {
        stats.record_response_shape(body_start, 0);
        return Ok(BackendHttpBridgeResponse {
            status,
            headers,
            body: String::new(),
        });
    }
    if transfer_encoding.contains("chunked") {
        let mut chunk_decoder = ChunkedBodyDecoder::default();
        let mut decoded_body: Vec<u8> = Vec::new();
        loop {
            match chunk_decoder.decode(&response_bytes[body_start..], &mut decoded_body)? {
                ChunkedDecodeProgress::Complete => break,
                ChunkedDecodeProgress::Incomplete => {}
            }
            if response_bytes.len().saturating_sub(body_start) > BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE
            {
                return Err("BACKEND_HTTP_RESPONSE_TOO_LARGE".to_string());
            }
            if !read_next_chunk(
                stream,
                &mut response_bytes,
                &mut read_buffer,
                &mut last_progress_at,
                stats,
                reading_body,
            )? {
                return Err("BACKEND_HTTP_RESPONSE_INVALID".to_string());
            }
        }
        let body_bytes = decoded_body.len();
        stats.record_response_shape(body_start, body_bytes);
        return Ok(BackendHttpBridgeResponse {
            status,
            headers,
            body: String::from_utf8_lossy(&decoded_body).into_owned(),
        });
    }

    // HTTP/1.1 persistent responses must delimit the body with either
    // Content-Length or chunked transfer encoding.  Falling back to EOF for a
    // keep-alive response waits until the idle timeout and can leave the
    // connection in an ambiguous state.  Only an explicit Connection: close
    // response may use EOF framing here.
    if !headers.contains_key("content-length") && !connection_closes {
        return Err("BACKEND_HTTP_RESPONSE_INVALID".to_string());
    }

    if let Some(length_value) = headers.get("content-length") {
        let length = length_value
            .parse::<usize>()
            .map_err(|_| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;
        if length > BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE {
            return Err("BACKEND_HTTP_RESPONSE_TOO_LARGE".to_string());
        }
        let response_end = body_start
            .checked_add(length)
            .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;
        while response_bytes.len() < response_end {
            if !read_next_chunk(
                stream,
                &mut response_bytes,
                &mut read_buffer,
                &mut last_progress_at,
                stats,
                reading_body,
            )? {
                return Err("BACKEND_HTTP_RESPONSE_INVALID".to_string());
            }
        }
        let (response, body_bytes) =
            parse_http_response_with_body_bytes(&response_bytes[..response_end])?;
        stats.record_response_shape(body_start, body_bytes);
        return Ok(response);
    }

    loop {
        if is_cancelled() {
            return Err("BACKEND_HTTP_REQUEST_CANCELED".to_string());
        }
        if response_bytes.len() > BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE {
            return Err("BACKEND_HTTP_RESPONSE_TOO_LARGE".to_string());
        }
        if !read_next_chunk(
            stream,
            &mut response_bytes,
            &mut read_buffer,
            &mut last_progress_at,
            stats,
            reading_body,
        )? {
            break;
        }
    }

    let (response, body_bytes) = parse_http_response_with_body_bytes(&response_bytes)?;
    stats.record_response_shape(body_start, body_bytes);
    Ok(response)
}

pub(super) fn is_enabled_backend_http_transport_trace_flag(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn backend_http_transport_trace_enabled() -> bool {
    std::env::var(BACKEND_HTTP_TRANSPORT_TRACE_ENV)
        .map(|value| is_enabled_backend_http_transport_trace_flag(value.as_str()))
        .unwrap_or(false)
}

pub(super) fn record_backend_http_transport_stats(stats: &BackendHttpTransportStats) {
    if !backend_http_transport_trace_enabled() {
        return;
    }
    eprintln!(
        "[transport] backend_http_request stats poolEligible={} poolLookups={} poolHits={} staleRetries={} connectAttempts={} poolMs={} connectMs={} writeMs={} readHeaderMs={} readBodyMs={} requestHeaderBytes={} requestBodyBytes={} requestWireBytes={} responseHeaderBytes={} responseBodyBytes={} responseWireBytes={}",
        stats.pool_eligible,
        stats.pool_lookup_count,
        stats.pool_hit_count,
        stats.stale_pool_retry_count,
        stats.connect_attempt_count,
        stats.pool_lookup_elapsed.as_millis(),
        stats.connect_elapsed.as_millis(),
        stats.write_elapsed.as_millis(),
        stats.read_header_elapsed.as_millis(),
        stats.read_body_elapsed.as_millis(),
        stats.request_header_bytes,
        stats.request_body_bytes,
        stats.request_wire_bytes,
        stats.response_header_bytes,
        stats.response_body_bytes,
        stats.response_wire_bytes,
    );
}
