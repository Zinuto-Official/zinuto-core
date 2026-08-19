// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  bridgeSecretsEqual,
  readBackendBridgeSecret,
} from '../../src/runtime/backendBridgeSecret.js';

const SECRET = '0123456789abcdef'.repeat(4);

test('backend bridge secret is read once from a bounded child pipe', async () => {
  assert.equal(await readBackendBridgeSecret(Readable.from([SECRET, '\n'])), SECRET);
  assert.equal(bridgeSecretsEqual(SECRET, SECRET), true);
  assert.equal(bridgeSecretsEqual(SECRET, `${SECRET.slice(0, -1)}0`), false);
  assert.equal(bridgeSecretsEqual(SECRET, SECRET.slice(1)), false);
});

test('backend bridge secret input rejects missing, malformed, and oversized payloads', async () => {
  for (const payload of ['', 'not-a-secret\n', `${'a'.repeat(129)}\n`]) {
    await assert.rejects(
      readBackendBridgeSecret(Readable.from([payload])),
      /BACKEND_BRIDGE_SECRET_INPUT_INVALID/u,
    );
  }
});
