// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const tempDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zinuto-note-bounds-'));
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{ db }, replayNoteService] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/application/replayNoteService.js'),
]);

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test('a legacy replay-note gzip bomb fails quickly at the real DB read boundary', async () => {
  await replayNoteService.createReplayNote({
    id: 'bounded-note',
    title: 'Bounded note',
    type: 'CUSTOM',
    content: 'safe',
  });
  const bomb = gzipSync(Buffer.from(JSON.stringify({ text: 'A'.repeat(600_000) }), 'utf8'));
  assert.ok(bomb.byteLength < 8_000);
  db.prepare(
    `UPDATE replay_note_contents
        SET document_payload = ?, payload_bytes = ?, document_hash = ''
      WHERE note_id = ?`,
  ).run(bomb, bomb.byteLength, 'bounded-note');

  const startedAt = performance.now();
  await assert.rejects(
    replayNoteService.getReplayNoteById('bounded-note'),
    (error: unknown) => (error as { code?: unknown })?.code === 'REPLAY_NOTE_CONTENT_TOO_LARGE',
  );
  assert.ok(performance.now() - startedAt < 1_000);
});
