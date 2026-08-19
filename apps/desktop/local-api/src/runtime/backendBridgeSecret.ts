// SPDX-License-Identifier: GPL-3.0-only

import { timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';

const BACKEND_BRIDGE_SECRET_PATTERN = /^[a-f0-9]{64}$/u;
const BACKEND_BRIDGE_SECRET_INPUT_MAX_BYTES = 128;

export const readBackendBridgeSecret = async (
  input: Readable = process.stdin,
): Promise<string> => {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += bytes.length;
    if (receivedBytes > BACKEND_BRIDGE_SECRET_INPUT_MAX_BYTES) {
      for (const buffered of chunks) buffered.fill(0);
      bytes.fill(0);
      throw new Error('BACKEND_BRIDGE_SECRET_INPUT_INVALID');
    }
    chunks.push(bytes);
  }
  const payload = Buffer.concat(chunks, receivedBytes);
  try {
    const bridgeSecret = payload.toString('utf8').trim();
    if (!BACKEND_BRIDGE_SECRET_PATTERN.test(bridgeSecret)) {
      throw new Error('BACKEND_BRIDGE_SECRET_INPUT_INVALID');
    }
    return bridgeSecret;
  } finally {
    payload.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
};

export const bridgeSecretsEqual = (expected: string, candidate: string): boolean => {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const candidateBytes = Buffer.from(candidate, 'utf8');
  try {
    return expectedBytes.length === candidateBytes.length
      && timingSafeEqual(expectedBytes, candidateBytes);
  } finally {
    expectedBytes.fill(0);
    candidateBytes.fill(0);
  }
};
