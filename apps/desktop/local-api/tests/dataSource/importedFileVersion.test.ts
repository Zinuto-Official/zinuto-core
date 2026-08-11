// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyImportedFileContentVersion,
} from '../../src/application/dataSource/importedFileVersion.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

test('imported file content version uses size and SHA-256 as its only truth', () => {
  assert.equal(
    classifyImportedFileContentVersion({
      incomingSize: 100,
      incomingFingerprint: undefined,
      existingSize: 100,
      existingFingerprint: `sha256:${DIGEST_A}`,
    }),
    'FINGERPRINT_REQUIRED',
  );
  assert.equal(
    classifyImportedFileContentVersion({
      incomingSize: 100,
      incomingFingerprint: DIGEST_A,
      existingSize: 100,
      existingFingerprint: `sha256:${DIGEST_A}`,
    }),
    'UNCHANGED',
  );
  assert.equal(
    classifyImportedFileContentVersion({
      incomingSize: 100,
      incomingFingerprint: DIGEST_B,
      existingSize: 100,
      existingFingerprint: `sha256:${DIGEST_A}`,
    }),
    'CHANGED',
  );
  assert.equal(
    classifyImportedFileContentVersion({
      incomingSize: 101,
      incomingFingerprint: DIGEST_A,
      existingSize: 100,
      existingFingerprint: `sha256:${DIGEST_A}`,
    }),
    'CHANGED',
  );
});
