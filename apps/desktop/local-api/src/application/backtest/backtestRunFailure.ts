// SPDX-License-Identifier: GPL-3.0-only

import { isAppError } from '../../kernel/appError.js';
import { nowIso } from '../../kernel/time.js';
import {
  finalizeFailedBacktestBatchRow,
  type BacktestBatchRow,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import { BACKTEST_PROGRESS_POLL_DELAY_MS } from './backtestConstants.js';
import {
  parseBacktestJsonRecord,
  stringifyBacktestJson,
} from './backtestJson.js';

export const finalizeFailedBacktestRun = (
  batch: BacktestBatchRow,
  error: unknown,
  startedAt: string,
): void => {
  const code = isAppError(error) ? error.code : 'BACKTEST_RUN_FAILED';
  const message = error instanceof Error ? error.message : String(error ?? code);
  const failedAt = nowIso();
  finalizeFailedBacktestBatchRow({
    id: batch.id,
    status: 'FAILED',
    progressJson: stringifyBacktestJson({
      stage: 'FAILED',
      pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
      updatedAt: failedAt,
    }),
    summaryJson: stringifyBacktestJson(parseBacktestJsonRecord(batch.summary_json)),
    errorCode: code,
    errorMessage: message.slice(0, 640),
    updatedAt: failedAt,
    startedAt,
    finishedAt: failedAt,
  });
};
