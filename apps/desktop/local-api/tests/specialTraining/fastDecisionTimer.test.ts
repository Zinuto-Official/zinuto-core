// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpecialTrainingFastDecisionTimer,
  pauseSpecialTrainingFastDecisionTimer,
  readSpecialTrainingFastDecisionTimer,
  resumeSpecialTrainingFastDecisionTimer,
} from "../../src/domain/specialTraining/fastDecisionTimer.js";

test("fast decision timer excludes paused wall time", () => {
  const timer = createSpecialTrainingFastDecisionTimer(1_000, false);

  pauseSpecialTrainingFastDecisionTimer(timer, 4_400);
  assert.deepEqual(readSpecialTrainingFastDecisionTimer(timer, 14_400, 10), {
    elapsedSeconds: 3,
    remainingSeconds: 7,
    deadlineAtMs: null,
  });

  resumeSpecialTrainingFastDecisionTimer(timer, 20_000);
  assert.deepEqual(readSpecialTrainingFastDecisionTimer(timer, 22_000, 10), {
    elapsedSeconds: 5,
    remainingSeconds: 5,
    deadlineAtMs: 26_600,
  });
});

test("fast decision timer pause and resume operations are idempotent", () => {
  const timer = createSpecialTrainingFastDecisionTimer(5_000, false);

  pauseSpecialTrainingFastDecisionTimer(timer, 7_000);
  pauseSpecialTrainingFastDecisionTimer(timer, 17_000);
  resumeSpecialTrainingFastDecisionTimer(timer, 20_000);
  resumeSpecialTrainingFastDecisionTimer(timer, 25_000);

  assert.deepEqual(readSpecialTrainingFastDecisionTimer(timer, 28_000, 12), {
    elapsedSeconds: 10,
    remainingSeconds: 2,
    deadlineAtMs: 30_000,
  });
});

test("timer created while paused starts counting only after resume", () => {
  const timer = createSpecialTrainingFastDecisionTimer(1_000, true);

  assert.deepEqual(readSpecialTrainingFastDecisionTimer(timer, 31_000, 5), {
    elapsedSeconds: 0,
    remainingSeconds: 5,
    deadlineAtMs: null,
  });

  resumeSpecialTrainingFastDecisionTimer(timer, 40_000);
  assert.deepEqual(readSpecialTrainingFastDecisionTimer(timer, 45_000, 5), {
    elapsedSeconds: 5,
    remainingSeconds: 0,
    deadlineAtMs: 45_000,
  });
});
