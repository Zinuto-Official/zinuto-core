// SPDX-License-Identifier: GPL-3.0-only

import { nowIso } from '../../kernel/time.js';
import {
  BACKTEST_PROGRESS_POLL_DELAY_MS,
  BACKTEST_PROGRESS_WRITE_INTERVAL_MS,
} from './backtestConstants.js';
import type {
  BacktestBatchStatus,
} from './types.js';

export type BacktestProgressSnapshot = {
  stage: string;
  completedSymbols?: number;
  totalSymbols?: number;
  currentSymbol?: string | null;
  pollDelayMs?: number;
  updatedAt?: string;
};

type BacktestProgressBatchRow = {
  id: string;
  progress_json: string;
  summary_json: string;
  started_at: string | null;
  finished_at: string | null;
};

type BacktestProgressWriterOptions<TBatch extends BacktestProgressBatchRow> = {
  batchId: string;
  getBatch: (batchId: string) => TBatch;
  updateBatchState: (options: {
    batch: TBatch;
    status: BacktestBatchStatus;
    progress?: Record<string, unknown>;
    summary?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }) => void;
  status?: BacktestBatchStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  summary: () => Record<string, unknown>;
};

const toNonNegativeInteger = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

export const createBacktestProgressWriter = <TBatch extends BacktestProgressBatchRow>({
  batchId,
  getBatch,
  updateBatchState,
  status = 'RUNNING',
  startedAt,
  finishedAt = null,
  summary,
}: BacktestProgressWriterOptions<TBatch>) => {
  let lastWriteMs = 0;
  let lastCompletedSymbols = 0;
  let pending: Record<string, unknown> | null = null;

  const buildProgress = (snapshot: BacktestProgressSnapshot): Record<string, unknown> => {
    const completedSymbols = toNonNegativeInteger(snapshot.completedSymbols);
    lastCompletedSymbols = Math.max(lastCompletedSymbols, completedSymbols);
    return {
      stage: snapshot.stage,
      completedSymbols: lastCompletedSymbols,
      totalSymbols: toNonNegativeInteger(snapshot.totalSymbols),
      currentSymbol: snapshot.currentSymbol ?? null,
      pollDelayMs: snapshot.pollDelayMs ?? BACKTEST_PROGRESS_POLL_DELAY_MS,
      updatedAt: snapshot.updatedAt ?? nowIso(),
    };
  };

  const flushPending = (force = false): void => {
    if (!pending) {
      return;
    }
    const currentMs = Date.now();
    if (!force && currentMs - lastWriteMs < BACKTEST_PROGRESS_WRITE_INTERVAL_MS) {
      return;
    }
    updateBatchState({
      batch: getBatch(batchId),
      status,
      progress: pending,
      summary: summary(),
      errorCode: null,
      errorMessage: null,
      startedAt,
      finishedAt,
    });
    pending = null;
    lastWriteMs = currentMs;
  };

  return {
    write(snapshot: BacktestProgressSnapshot, options: { force?: boolean } = {}): void {
      pending = buildProgress(snapshot);
      flushPending(Boolean(options.force));
    },
    flush(): void {
      flushPending(true);
    },
  };
};
