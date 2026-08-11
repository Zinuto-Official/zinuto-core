// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SYSTEM_RESET_LIMITS } from '@zinuto/shared/input-limits';
import { RESET_JOB_POLL_DEADLINE_MS } from '../../src/app-shell/globalResetJobDeadline';

test('global reset polling cannot declare timeout before the backend maximum', () => {
  assert.equal(
    RESET_JOB_POLL_DEADLINE_MS,
    SYSTEM_RESET_LIMITS.jobDeadlineMaxMs +
      SYSTEM_RESET_LIMITS.clientDeadlineGraceMs,
  );
  assert.ok(RESET_JOB_POLL_DEADLINE_MS > SYSTEM_RESET_LIMITS.jobDeadlineMaxMs);
  assert.ok(
    SYSTEM_RESET_LIMITS.jobDeadlineMaxMs >= SYSTEM_RESET_LIMITS.jobDeadlineMs,
  );
});

test('partial reset failures show the existing actionable restart guidance', () => {
  const controllerSource = readFileSync(
    new URL('../../src/app-shell/useAppGlobalResetController.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    controllerSource,
    /partialResetFailed[\s\S]*?appText\.dataResetButPageDidnRefreshAutomaticallyRefresh/u,
  );
});
