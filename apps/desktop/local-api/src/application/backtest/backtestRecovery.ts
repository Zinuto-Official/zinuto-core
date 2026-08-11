// SPDX-License-Identifier: GPL-3.0-only

import { nowIso } from '../../kernel/time.js';
import {
  listActiveBacktestBatchRows,
  recoverInterruptedBacktestBatchRows,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import { BACKTEST_PROGRESS_POLL_DELAY_MS } from './backtestConstants.js';
import {
  parseBacktestJsonRecord,
  stringifyBacktestJson,
} from './backtestJson.js';

const normalizeOptionalIso = (
  value: string | null | undefined,
): string | null => (typeof value === 'string' && value.trim() ? value : null);

export const recoverInterruptedBacktestBatches = (): {
  recoveredBatchIds: string[];
} => {
  const recoveredAt = nowIso();
  const activeBatches = listActiveBacktestBatchRows();
  recoverInterruptedBacktestBatchRows(
    activeBatches.map((batch) => ({
      id: batch.id,
      status: 'FAILED',
      progressJson: stringifyBacktestJson({
        ...parseBacktestJsonRecord(batch.progress_json),
        stage: 'FAILED',
        currentSymbol: null,
        interruptionReason: 'BACKEND_RESTARTED',
        pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
        updatedAt: recoveredAt,
      }),
      summaryJson: batch.summary_json,
      errorCode: 'BACKTEST_RUN_FAILED',
      errorMessage: 'BACKTEST_RUN_FAILED',
      updatedAt: recoveredAt,
      startedAt: normalizeOptionalIso(batch.started_at),
      finishedAt: recoveredAt,
    })),
  );
  return {
    recoveredBatchIds: activeBatches.map((batch) => batch.id),
  };
};
