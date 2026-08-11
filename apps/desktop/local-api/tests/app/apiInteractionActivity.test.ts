// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createApiInteractionActivityTracker } from "../../src/runtime/apiInteractionActivity.js";

test("API interaction activity requires a quiet window after startup and request completion", () => {
  let nowMs = 1_000;
  const tracker = createApiInteractionActivityTracker({
    quietWindowMs: 500,
    now: () => nowMs,
  });

  assert.equal(tracker.isIdle(), false);
  nowMs += 500;
  assert.equal(tracker.isIdle(), true);

  const completeRequest = tracker.beginRequest();
  nowMs += 1_000;
  assert.equal(tracker.isIdle(), false);

  completeRequest();
  completeRequest();
  assert.equal(tracker.isIdle(), false);
  nowMs += 499;
  assert.equal(tracker.isIdle(), false);
  nowMs += 1;
  assert.equal(tracker.isIdle(), true);
});

test("API interaction activity remains busy until all concurrent requests complete", () => {
  let nowMs = 5_000;
  const tracker = createApiInteractionActivityTracker({
    quietWindowMs: 250,
    now: () => nowMs,
  });
  nowMs += 250;

  const completeFirst = tracker.beginRequest();
  const completeSecond = tracker.beginRequest();
  completeFirst();
  nowMs += 1_000;
  assert.equal(tracker.isIdle(), false);

  completeSecond();
  nowMs += 249;
  assert.equal(tracker.isIdle(), false);
  nowMs += 1;
  assert.equal(tracker.isIdle(), true);
});
