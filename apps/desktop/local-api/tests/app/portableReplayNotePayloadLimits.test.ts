// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { createEmptyReplayNoteDocument, stringifyReplayNoteDocument } from '@zinuto/shared/replayNoteDocument';
import { validatePortableReplayNotePayloads } from '../../src/application/portableData/importDomains.js';

const bundleForDocumentJson = (jsonText: string) => {
  const compressed = gzipSync(Buffer.from(jsonText, 'utf8'));
  return {
    note: { type: 'STANDALONE' },
    content: {
      document_schema_version: 1,
      document_encoding: 'GZIP_JSON_V1',
      document_payload: compressed.toString('base64'),
      document_hash: createHash('sha256').update(jsonText, 'utf8').digest('hex'),
      payload_bytes: compressed.byteLength,
    },
    meta: null,
    colors: [],
    attachments: [],
    contextArchive: null,
  };
};

test('portable replay-note validation accepts a canonical bounded document', () => {
  const json = stringifyReplayNoteDocument(createEmptyReplayNoteDocument());
  assert.doesNotThrow(() => validatePortableReplayNotePayloads(bundleForDocumentJson(json)));
});

test('portable replay-note validation rejects a small gzip bomb before import mutation', () => {
  const bombJson = JSON.stringify({
    schemaVersion: 1,
    blocks: [{ id: 'bomb', type: 'PARAGRAPH', children: [{ text: 'A'.repeat(600_000) }] }],
  });
  const bundle = bundleForDocumentJson(bombJson);
  assert.ok(String(bundle.content.document_payload).length < 8_000);
  assert.throws(
    () => validatePortableReplayNotePayloads(bundle),
    /PORTABLE_DATA_IMPORT_INVALID/u,
  );
});

test('portable replay-note validation rejects noncanonical base64 and metadata mismatch', () => {
  const json = stringifyReplayNoteDocument(createEmptyReplayNoteDocument());
  const bundle = bundleForDocumentJson(json);
  bundle.content.payload_bytes += 1;
  assert.throws(() => validatePortableReplayNotePayloads(bundle), /PORTABLE_DATA_IMPORT_INVALID/u);
  bundle.content.payload_bytes -= 1;
  bundle.content.document_payload = `${bundle.content.document_payload.slice(0, -1)}!`;
  assert.throws(() => validatePortableReplayNotePayloads(bundle), /PORTABLE_DATA_IMPORT_INVALID/u);
});
