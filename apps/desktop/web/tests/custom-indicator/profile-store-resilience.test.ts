// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { api } from '../../src/api/index.js';
import {
  hasSavedIndicatorProfilesHydrated,
  hydrateSavedIndicatorProfilesFromDatabase,
  saveSavedIndicatorProfile,
} from '../../src/domains/custom-indicator/indicator/profileStore.js';
import { resolveCustomIndicatorProductMessage } from '../../src/domains/custom-indicator/indicator/scriptDiagnostics.js';

test('profile hydration remains retryable after a transient backend failure', async (t) => {
  const originalList = api.listCustomIndicatorProfiles;
  t.after(() => {
    api.listCustomIndicatorProfiles = originalList;
  });

  let attempts = 0;
  api.listCustomIndicatorProfiles = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('transient read failure');
    }
    return [];
  };

  await assert.rejects(hydrateSavedIndicatorProfilesFromDatabase(true));
  assert.equal(hasSavedIndicatorProfilesHydrated(), false);
  await hydrateSavedIndicatorProfilesFromDatabase();
  assert.equal(attempts, 2);
  assert.equal(hasSavedIndicatorProfilesHydrated(), true);
});

test('profile writes preserve the storage limit code and safe backend message', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const originalSave = api.saveCustomIndicatorProfile;
  t.after(() => {
    api.saveCustomIndicatorProfile = originalSave;
  });
  const error = Object.assign(new Error('Profile storage: 4100000 > 4000000 bytes'), {
    code: 'PROFILE_STORAGE_LIMIT_EXCEEDED',
  });
  api.saveCustomIndicatorProfile = async () => {
    throw error;
  };

  const result = await saveSavedIndicatorProfile({
    name: 'Capacity Test',
    source: 'OUT: C;',
    parameterInputs: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_STORAGE_LIMIT_EXCEEDED');
  assert.equal(result.message, error.message);
  assert.equal(
    resolveCustomIndicatorProductMessage(result, { context: 'profile-save' }),
    error.message,
  );
});
