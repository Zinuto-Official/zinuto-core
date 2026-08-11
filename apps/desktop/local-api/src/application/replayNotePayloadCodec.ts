// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export type DecodedReplayNotePayload = {
  compressed: Buffer;
  jsonText: string;
  value: unknown;
  sourceBytes: number;
  payloadBytes: number;
  sha256: string;
};

const requirePositiveLimit = (value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('REPLAY_NOTE_PAYLOAD_LIMIT_INVALID');
  }
  return value;
};

export const decodeCanonicalBase64 = (value: unknown, maxBytes: number): Buffer => {
  const limit = requirePositiveLimit(maxBytes);
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    throw new Error('REPLAY_NOTE_PAYLOAD_INVALID');
  }
  const maxChars = Math.ceil(limit / 3) * 4;
  if (value.length > maxChars || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new Error('REPLAY_NOTE_PAYLOAD_INVALID');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.length > limit || decoded.toString('base64') !== value) {
    throw new Error('REPLAY_NOTE_PAYLOAD_INVALID');
  }
  return decoded;
};

export const decodeBoundedGzipJson = (
  payload: unknown,
  limits: { maxCompressedBytes: number; maxSourceBytes: number },
): DecodedReplayNotePayload => {
  const maxCompressedBytes = requirePositiveLimit(limits.maxCompressedBytes);
  const maxSourceBytes = requirePositiveLimit(limits.maxSourceBytes);
  if (!(payload instanceof Uint8Array) || payload.byteLength === 0 || payload.byteLength > maxCompressedBytes) {
    throw new Error('REPLAY_NOTE_PAYLOAD_INVALID');
  }
  const compressed = Buffer.from(payload);
  const inflated = gunzipSync(compressed, { maxOutputLength: maxSourceBytes });
  if (inflated.byteLength === 0 || inflated.byteLength > maxSourceBytes) {
    throw new Error('REPLAY_NOTE_PAYLOAD_INVALID');
  }
  const jsonText = inflated.toString('utf-8');
  const value = JSON.parse(jsonText) as unknown;
  return {
    compressed,
    jsonText,
    value,
    sourceBytes: inflated.byteLength,
    payloadBytes: compressed.byteLength,
    sha256: createHash('sha256').update(jsonText, 'utf-8').digest('hex'),
  };
};

export const decodeCanonicalBase64GzipJson = (
  payload: unknown,
  limits: { maxCompressedBytes: number; maxSourceBytes: number },
): DecodedReplayNotePayload =>
  decodeBoundedGzipJson(
    decodeCanonicalBase64(payload, limits.maxCompressedBytes),
    limits,
  );
