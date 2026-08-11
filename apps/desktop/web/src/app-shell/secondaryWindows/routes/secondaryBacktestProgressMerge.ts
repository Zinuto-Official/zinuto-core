// SPDX-License-Identifier: GPL-3.0-only

import type { ApiBacktestBatch } from "@/api";

const BACKTEST_STATUS_ORDER: Record<string, number> = {
  QUEUED: 0,
  RUNNING: 1,
  SUCCEEDED: 2,
  FAILED: 2,
  CANCELED: 2,
};

const readCompletedSymbols = (batch: ApiBacktestBatch): number => {
  const progress = batch.progress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return 0;
  }
  const value = Number(
    (progress as Record<string, unknown>).completedSymbols,
  );
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const mergeMonotonicBacktestProgress = (
  current: ApiBacktestBatch | null,
  incoming: ApiBacktestBatch,
  expectedBatchId: string,
): ApiBacktestBatch | null => {
  if (incoming.id !== expectedBatchId || current?.id !== expectedBatchId) {
    return current;
  }
  const currentStatusOrder = BACKTEST_STATUS_ORDER[current.status] ?? -1;
  const incomingStatusOrder = BACKTEST_STATUS_ORDER[incoming.status] ?? -1;
  if (
    incomingStatusOrder < currentStatusOrder ||
    (incomingStatusOrder === currentStatusOrder &&
      readCompletedSymbols(incoming) < readCompletedSymbols(current))
  ) {
    return current;
  }
  return incoming;
};
