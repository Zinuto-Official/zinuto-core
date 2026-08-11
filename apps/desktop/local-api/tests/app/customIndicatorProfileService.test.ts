// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-custom-indicator-profiles-'),
);
const previousDbPath = process.env.ZINUTO_DB_PATH;
process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');

const { closeLocalDatabase, db } = await import(
  '../../src/infrastructure/db/database.js'
);
const {
  deleteCustomIndicatorProfile,
  listCustomIndicatorProfiles,
  saveCustomIndicatorProfile,
} = await import('../../src/application/customIndicatorService.js');

test.after(async () => {
  closeLocalDatabase();
  if (previousDbPath === undefined) {
    delete process.env.ZINUTO_DB_PATH;
  } else {
    process.env.ZINUTO_DB_PATH = previousDbPath;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('custom indicator profiles persist, canonicalize parameters, revise, and delete', async () => {
  db.prepare('DELETE FROM custom_indicator_profiles').run();

  const created = await saveCustomIndicatorProfile({
    name: 'Momentum Profile',
    source: 'MOMENTUM_OUT: MA(C, N) + THRESHOLD;',
    parameterInputs: { threshold: '1.5', n: '12' },
  });
  assert.equal(created.storedCount, 1);
  assert.deepEqual(created.profile.parameterInputs, {
    N: '12',
    THRESHOLD: '1.5',
  });
  assert.deepEqual(created.profile.revisions, []);

  const reordered = await saveCustomIndicatorProfile({
    id: created.profile.id,
    name: created.profile.name,
    source: created.profile.source,
    parameterInputs: { THRESHOLD: '1.5', N: '12' },
  });
  assert.deepEqual(reordered.profile.revisions, []);

  const revised = await saveCustomIndicatorProfile({
    id: created.profile.id,
    name: created.profile.name,
    source: 'MOMENTUM_OUT: EMA(C, N) + THRESHOLD;',
    parameterInputs: { N: '20', THRESHOLD: '2' },
  });
  assert.equal(revised.profile.revisions?.length, 1);
  assert.equal(revised.profile.revisions?.[0]?.source, created.profile.source);
  assert.deepEqual(revised.profile.revisions?.[0]?.parameterInputs, {
    N: '12',
    THRESHOLD: '1.5',
  });

  const listed = await listCustomIndicatorProfiles();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.source, revised.profile.source);

  const deleted = await deleteCustomIndicatorProfile(created.profile.id);
  assert.equal(deleted.deletedProfileId, created.profile.id);
  assert.equal(deleted.storedCount, 0);
  assert.deepEqual(await listCustomIndicatorProfiles(), []);
});
