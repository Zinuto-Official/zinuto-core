// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveFastDecisionRevealDurationMs,
  resolveFastDecisionRevealFrame,
} from "../../src/workspaces/special-training/fastDecisionRevealTimeline";

test("fast decision reveal duration keeps the existing 500ms full-window pacing", () => {
  assert.equal(
    resolveFastDecisionRevealDurationMs({
      baseDurationMs: 500,
      fullRevealBarsTotal: 100,
      revealBarsTotal: 50,
    }),
    250,
  );
  assert.equal(
    resolveFastDecisionRevealDurationMs({
      baseDurationMs: 500,
      fullRevealBarsTotal: 100,
      revealBarsTotal: 1,
    }),
    16,
  );
});

test("fast decision reveal frame resolves cursor by elapsed progress", () => {
  assert.deepEqual(
    resolveFastDecisionRevealFrame({
      elapsedMs: 0,
      revealDurationMs: 500,
      revealBarsTotal: 20,
      revealStartIndex: 10,
      revealEndIndex: 30,
    }),
    {
      cursorIndex: 10,
      progressRatio: 0,
      complete: false,
    },
  );
  assert.deepEqual(
    resolveFastDecisionRevealFrame({
      elapsedMs: 250,
      revealDurationMs: 500,
      revealBarsTotal: 20,
      revealStartIndex: 10,
      revealEndIndex: 30,
    }),
    {
      cursorIndex: 20,
      progressRatio: 0.5,
      complete: false,
    },
  );
  assert.deepEqual(
    resolveFastDecisionRevealFrame({
      elapsedMs: 500,
      revealDurationMs: 500,
      revealBarsTotal: 20,
      revealStartIndex: 10,
      revealEndIndex: 30,
    }),
    {
      cursorIndex: 30,
      progressRatio: 1,
      complete: true,
    },
  );
});

test("fast decision reveal is driven by animation frames instead of an interval", () => {
  const source = readFileSync(
    new URL(
      "../../src/workspaces/special-training/useSpecialTrainingFastDecisionInteractions.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /window\.requestAnimationFrame\(renderRevealFrame\)/);
  assert.match(
    source,
    /window\.cancelAnimationFrame\(fastDecisionRevealTimerRef\.current\)/,
  );
  assert.doesNotMatch(source, /window\.setInterval\(\s*renderRevealFrame/);
  assert.match(source, /lastRenderedCursorIndex/);
});
