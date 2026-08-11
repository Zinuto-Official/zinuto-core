// SPDX-License-Identifier: GPL-3.0-only

import { gunzipSync, gzipSync } from 'node:zlib';

const MAX_DECOMPRESS_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 16 * 1024 * 1024;
export const STORED_JSON_ENCODING_GZIP = 'GZIP_JSON_V1';
export const STORED_JSON_ENCODING_TEXT = 'JSON_TEXT_V1';

export type StoredJsonEncoding =
  | typeof STORED_JSON_ENCODING_GZIP
  | typeof STORED_JSON_ENCODING_TEXT;

const isGzipBinaryPayload = (raw: Uint8Array): boolean =>
  raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;

const inflateToUtf8 = (compressed: Uint8Array): string | null => {
  if (!compressed.length || compressed.length > MAX_COMPRESSED_BYTES) {
    return null;
  }
  let inflated: Buffer;
  try {
    inflated = gunzipSync(compressed, { maxOutputLength: MAX_DECOMPRESS_BYTES });
  } catch {
    return null;
  }
  return inflated.toString('utf8');
};

const decodeGzipPayload = (raw: unknown): string | null => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) {
    try {
      const encoded = JSON.stringify(raw);
      return Buffer.byteLength(encoded, 'utf8') <= MAX_DECOMPRESS_BYTES
        ? encoded
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw, 'utf8') <= MAX_DECOMPRESS_BYTES ? raw : null;
  }
  if (raw instanceof Uint8Array) {
    if (!raw.length) {
      return null;
    }
    if (isGzipBinaryPayload(raw)) {
      return inflateToUtf8(raw);
    }
    return raw.length <= MAX_DECOMPRESS_BYTES
      ? Buffer.from(raw).toString('utf8')
      : null;
  }
  return null;
};

export const encodeStoredJsonToCompressedBuffer = (value: unknown): Buffer =>
  gzipSync(Buffer.from(JSON.stringify(value ?? null), 'utf-8'));

export const encodeStoredJsonCompact = (
  value: unknown,
): {
  payload: Buffer | string;
  encoding: StoredJsonEncoding;
} => {
  const jsonText = JSON.stringify(value ?? null);
  const compressed = gzipSync(Buffer.from(jsonText, 'utf-8'));
  if (compressed.length < Buffer.byteLength(jsonText, 'utf-8')) {
    return {
      payload: compressed,
      encoding: STORED_JSON_ENCODING_GZIP,
    };
  }
  return {
    payload: jsonText,
    encoding: STORED_JSON_ENCODING_TEXT,
  };
};

export const decodeStoredJsonText = (raw: unknown): string | null =>
  decodeGzipPayload(raw);

export const parseStoredJsonSafe = <T>(raw: unknown, fallback: T): T => {
  if (!raw) {
    return fallback;
  }
  try {
    const decodedText = decodeGzipPayload(raw);
    if (!decodedText) {
      return fallback;
    }
    const parsed = JSON.parse(decodedText);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
};
