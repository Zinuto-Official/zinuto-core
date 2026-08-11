// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import type { ApiBacktestBatch } from "../../src/api";
import { mergeMonotonicBacktestProgress } from "../../src/app-shell/secondaryWindows/routes/secondaryBacktestProgressMerge";

const batch = (
  id: string,
  status: string,
  completedSymbols: number,
): ApiBacktestBatch =>
  ({
    id,
    status,
    progress: { completedSymbols },
  }) as unknown as ApiBacktestBatch;

test("secondary backtest progress never accepts another or regressing batch", () => {
  const current = batch("batch-b", "RUNNING", 7);
  assert.equal(
    mergeMonotonicBacktestProgress(
      current,
      batch("batch-a", "SUCCEEDED", 10),
      "batch-b",
    ),
    current,
  );
  assert.equal(
    mergeMonotonicBacktestProgress(
      current,
      batch("batch-b", "RUNNING", 6),
      "batch-b",
    ),
    current,
  );
  assert.equal(
    mergeMonotonicBacktestProgress(
      current,
      batch("batch-b", "QUEUED", 8),
      "batch-b",
    ),
    current,
  );
  const completed = batch("batch-b", "SUCCEEDED", 8);
  assert.equal(
    mergeMonotonicBacktestProgress(current, completed, "batch-b"),
    completed,
  );
});
