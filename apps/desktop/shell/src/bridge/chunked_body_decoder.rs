// SPDX-License-Identifier: GPL-3.0-only

use crate::bridge::transport::BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE;

const MAX_CHUNK_LINE_BYTES: usize = 4 * 1024;
const MAX_TRAILER_BYTES: usize = 64 * 1024;

fn invalid_response() -> String {
    "BACKEND_HTTP_RESPONSE_INVALID".to_string()
}

fn is_token_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
        || matches!(
            byte,
            b'!' | b'#'
                | b'$'
                | b'%'
                | b'&'
                | b'\''
                | b'*'
                | b'+'
                | b'-'
                | b'.'
                | b'^'
                | b'_'
                | b'`'
                | b'|'
                | b'~'
        )
}

fn parse_chunk_size_line(line: &[u8]) -> Result<usize, String> {
    if line.is_empty() || line.len() > MAX_CHUNK_LINE_BYTES || !line.is_ascii() {
        return Err(invalid_response());
    }
    let mut parts = line.split(|byte| *byte == b';');
    let hex = parts.next().ok_or_else(invalid_response)?;
    if hex.is_empty() || !hex.iter().all(u8::is_ascii_hexdigit) {
        return Err(invalid_response());
    }
    for extension in parts {
        let extension = extension
            .strip_prefix(b" ")
            .unwrap_or(extension)
            .strip_suffix(b" ")
            .unwrap_or(extension);
        let name = extension
            .split(|byte| *byte == b'=')
            .next()
            .unwrap_or_default();
        if name.is_empty() || !name.iter().copied().all(is_token_byte) {
            return Err(invalid_response());
        }
        if extension.iter().any(|byte| *byte < 0x20 || *byte == 0x7f) {
            return Err(invalid_response());
        }
    }
    usize::from_str_radix(
        std::str::from_utf8(hex).map_err(|_| invalid_response())?,
        16,
    )
    .map_err(|_| invalid_response())
}

fn terminal_end(payload: &[u8], cursor: usize) -> Result<Option<usize>, String> {
    let remaining = payload.get(cursor..).ok_or_else(invalid_response)?;
    if remaining.starts_with(b"\r\n") {
        return Ok(Some(cursor + 2));
    }
    if remaining.len() > MAX_TRAILER_BYTES {
        return Err(invalid_response());
    }
    let end = match remaining
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
    {
        Some(value) => value,
        None => return Ok(None),
    };
    let trailer_block = &remaining[..end];
    let mut trailer_cursor = 0;
    while trailer_cursor < trailer_block.len() {
        let line_end = trailer_block[trailer_cursor..]
            .windows(2)
            .position(|window| window == b"\r\n")
            .map(|offset| trailer_cursor + offset)
            .unwrap_or(trailer_block.len());
        let line = &trailer_block[trailer_cursor..line_end];
        let colon = line
            .iter()
            .position(|byte| *byte == b':')
            .ok_or_else(invalid_response)?;
        if colon == 0 || !line[..colon].iter().copied().all(is_token_byte) {
            return Err(invalid_response());
        }
        if line[colon + 1..]
            .iter()
            .any(|byte| (*byte < 0x20 && *byte != b'\t') || *byte == 0x7f)
        {
            return Err(invalid_response());
        }
        trailer_cursor = line_end.saturating_add(2);
    }
    Ok(Some(cursor + end + 4))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum ChunkedDecodeProgress {
    Incomplete,
    Complete,
}

#[derive(Default)]
pub(crate) struct ChunkedBodyDecoder {
    parse_offset: usize,
    pending_payload_bytes: usize,
    terminal_pending: bool,
    done: bool,
}

impl ChunkedBodyDecoder {
    pub(crate) fn decode(
        &mut self,
        payload: &[u8],
        output: &mut Vec<u8>,
    ) -> Result<ChunkedDecodeProgress, String> {
        if self.done {
            return Ok(ChunkedDecodeProgress::Complete);
        }
        let mut cursor = self.parse_offset;
        if self.terminal_pending {
            if let Some(end) = terminal_end(payload, cursor)? {
                if end != payload.len() {
                    return Err(invalid_response());
                }
                self.done = true;
                self.terminal_pending = false;
                self.parse_offset = end;
                return Ok(ChunkedDecodeProgress::Complete);
            }
            return Ok(ChunkedDecodeProgress::Incomplete);
        }
        if self.pending_payload_bytes > 0 {
            let chunk_end = cursor
                .checked_add(self.pending_payload_bytes)
                .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;
            if payload.len() < chunk_end.saturating_add(2) {
                return Ok(ChunkedDecodeProgress::Incomplete);
            }
            if &payload[chunk_end..chunk_end + 2] != b"\r\n" {
                return Err(invalid_response());
            }
            output.extend_from_slice(&payload[cursor..chunk_end]);
            cursor = chunk_end + 2;
            self.pending_payload_bytes = 0;
        }
        loop {
            let line_end_offset = match payload[cursor..]
                .windows(2)
                .position(|window| window == b"\r\n")
            {
                Some(value) => value,
                None => {
                    self.parse_offset = cursor;
                    return Ok(ChunkedDecodeProgress::Incomplete);
                }
            };
            let line_end = cursor + line_end_offset;
            let chunk_size = parse_chunk_size_line(&payload[cursor..line_end])?;
            cursor = line_end + 2;

            if chunk_size == 0 {
                if let Some(end) = terminal_end(payload, cursor)? {
                    if end != payload.len() {
                        return Err(invalid_response());
                    }
                    self.done = true;
                    self.parse_offset = end;
                    return Ok(ChunkedDecodeProgress::Complete);
                }
                // The terminal marker is not complete yet; resume with the
                // terminal check on the next call, not the size-line parser.
                self.terminal_pending = true;
                self.parse_offset = cursor;
                return Ok(ChunkedDecodeProgress::Incomplete);
            }
            if output.len().saturating_add(chunk_size) > BACKEND_HTTP_MAX_RESPONSE_BODY_SIZE {
                return Err("BACKEND_HTTP_RESPONSE_TOO_LARGE".to_string());
            }
            let chunk_end = cursor
                .checked_add(chunk_size)
                .ok_or_else(|| "BACKEND_HTTP_RESPONSE_INVALID".to_string())?;
            if payload.len() < chunk_end.saturating_add(2) {
                self.pending_payload_bytes = chunk_size;
                self.parse_offset = cursor;
                return Ok(ChunkedDecodeProgress::Incomplete);
            }
            if &payload[chunk_end..chunk_end + 2] != b"\r\n" {
                return Err(invalid_response());
            }
            output.extend_from_slice(&payload[cursor..chunk_end]);
            cursor = chunk_end + 2;
        }
    }
}

pub(crate) fn decode_chunked_body(payload: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let mut decoder = ChunkedBodyDecoder::default();
    let mut output = Vec::new();
    match decoder.decode(payload, &mut output)? {
        ChunkedDecodeProgress::Complete => Ok(Some(output)),
        ChunkedDecodeProgress::Incomplete => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_crlf_chunk_delimiters() {
        assert_eq!(
            decode_chunked_body(b"1\r\nAxx0\r\n\r\n"),
            Err("BACKEND_HTTP_RESPONSE_INVALID".to_string())
        );
        assert_eq!(
            decode_chunked_body(b"1\r\nA\n\n0\r\n\r\n"),
            Err("BACKEND_HTTP_RESPONSE_INVALID".to_string())
        );
    }

    #[test]
    fn valid_payload_matches_for_every_stream_split() {
        let payload = b"3;name=value\r\nabc\r\n2\r\nde\r\n0\r\nX-Test: ok\r\n\r\n";
        let expected = decode_chunked_body(payload).unwrap().unwrap();
        assert_eq!(expected, b"abcde");
        for end in 1..=payload.len() {
            let mut decoder = ChunkedBodyDecoder::default();
            let mut output = Vec::new();
            let first = decoder.decode(&payload[..end], &mut output);
            assert!(first.is_ok(), "split {end}: {first:?}");
            if end < payload.len() {
                assert_eq!(
                    decoder.decode(payload, &mut output).unwrap(),
                    ChunkedDecodeProgress::Complete,
                    "split {end}"
                );
            }
            assert_eq!(output, expected, "split {end}");
        }
    }

    #[test]
    fn rejects_malformed_size_extensions_trailers_and_pipeline_bytes() {
        for payload in [
            b" 1\r\nA\r\n0\r\n\r\n".as_slice(),
            b"1;\r\nA\r\n0\r\n\r\n".as_slice(),
            b"1\r\nA\r\n0\r\nBadTrailer\r\n\r\n".as_slice(),
            b"1\r\nA\r\n0\r\n\r\nextra".as_slice(),
        ] {
            assert_eq!(decode_chunked_body(payload), Err(invalid_response()));
        }
    }
}
