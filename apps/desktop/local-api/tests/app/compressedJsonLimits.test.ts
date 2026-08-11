// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { parseStoredJsonSafe } from '../../src/kernel/compressedJson.js';

test('stored compressed JSON rejects output beyond the inflate ceiling', () => {
  const compressed = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1, 0x20));
  assert.deepEqual(parseStoredJsonSafe(compressed, { safe: true }), { safe: true });
});
