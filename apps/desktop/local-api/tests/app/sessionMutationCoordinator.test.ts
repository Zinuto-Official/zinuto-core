// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionMutationCoordinator } from '../../src/application/trading/sessionMutationCoordinator.js';

test('queued session mutations recheck startup state before they can write', async () => {
  let backendBlocked = false;
  let releaseReset!: () => void;
  let markResetStarted!: () => void;
  const resetStarted = new Promise<void>((resolve) => {
    markResetStarted = resolve;
  });
  const resetReleased = new Promise<void>((resolve) => {
    releaseReset = resolve;
  });
  const coordinator = createSessionMutationCoordinator({
    ensureBackendStartupReady: () => {
      if (backendBlocked) {
        throw Object.assign(new Error('SYSTEM_STARTUP_BLOCKED'), {
          code: 'SYSTEM_STARTUP_BLOCKED',
        });
      }
    },
  });

  const reset = coordinator.runSerializedTrainingMutation(async () => {
    markResetStarted();
    await resetReleased;
  });
  await resetStarted;

  let queuedMutationLanded = false;
  const queuedMutation = coordinator.runSerializedSessionMutation(
    'queued-after-reset',
    async () => {
      queuedMutationLanded = true;
    },
  );
  backendBlocked = true;
  releaseReset();
  await reset;

  await assert.rejects(
    queuedMutation,
    (error: unknown) =>
      Boolean(error) &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'SYSTEM_STARTUP_BLOCKED',
  );
  assert.equal(queuedMutationLanded, false);

  backendBlocked = false;
  await coordinator.runSerializedSessionMutation(
    'queued-after-reset',
    async () => {
      queuedMutationLanded = true;
    },
  );
  assert.equal(queuedMutationLanded, true);
});
