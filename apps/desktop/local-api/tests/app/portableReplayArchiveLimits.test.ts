// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { rewritePortableReplayContextArchive } from '../../src/application/portableData/helpers.js';
import { runtimeLimits } from '../../src/kernel/runtimeLimits.js';

const toArchive = (value: unknown) => {
  const source = Buffer.from(JSON.stringify(value), 'utf8');
  const compressed = gzipSync(source);
  return {
    archive_encoding: 'GZIP_BINARY',
    archive_payload: compressed.toString('base64'),
    source_bytes: source.byteLength,
    archive_bytes: compressed.byteLength,
  };
};

test('portable replay archive is validated when no id replacement is needed', () => {
  const archive = toArchive({ sessionId: 'local-session' });
  const validated = rewritePortableReplayContextArchive(archive, new Map());

  assert.equal(validated?.archive_payload, archive.archive_payload);
  assert.equal(validated?.source_bytes, archive.source_bytes);
  assert.equal(validated?.archive_bytes, archive.archive_bytes);
});

test('portable replay archive rejects a nested gzip bomb with zero replacements', () => {
  const oversizedJson = `"${'a'.repeat(runtimeLimits.replayNoteSnapshotSourceMaxBytes)}"`;
  const compressed = gzipSync(Buffer.from(oversizedJson, 'utf8'));
  const archive = {
    archive_encoding: 'GZIP_BINARY',
    archive_payload: compressed.toString('base64'),
    source_bytes: oversizedJson.length,
    archive_bytes: compressed.byteLength,
  };

  assert.throws(
    () => rewritePortableReplayContextArchive(archive, new Map()),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: string }).code === 'PORTABLE_DATA_IMPORT_INVALID',
      ),
  );
});
