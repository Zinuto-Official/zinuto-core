// SPDX-License-Identifier: GPL-3.0-only

import {
  desktopBacktestBatchCreateRequestSchema,
  desktopBacktestBatchRunRequestSchema,
  desktopBacktestConfigSchema,
} from '@zinuto/shared/contracts-desktop/api';
import type { z } from 'zod';
import { appError, isAppError } from '../../kernel/appError.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { db } from '../ports/infrastructure/db/database.js';
import {
  hasActiveBacktestBatchRows,
  listActiveBacktestBatchRows,
  listBacktestBatchRows,
  getBacktestBatchRow,
  insertBacktestBatchRow,
  updateBacktestBatchRow,
  finalizeCancelledBacktestBatchRow,
  deleteAllBacktestBatchRows,
  deleteBacktestBatchRow,
  replaceBacktestRunRows,
  listBacktestResultRows,
  getBacktestResultRowBySymbol,
  listBacktestFillRows,
  listBacktestEquityPointRows,
  listBacktestInstrumentRowsByIds,
  listBacktestInstrumentRowsBySourceIds,
  listSystemBacktestInstrumentRows,
  type BacktestBatchRow,
  type BacktestEquityPointRow,
  type BacktestFillRow,
  type BacktestInstrumentRow,
  type BacktestResultRow,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import { createTradingCoreStore } from '../ports/infrastructure/db/trading/coreStore.js';
import {
  getMarketBarCount,
  getMarketBarsByInstrumentIdRange,
  getMarketBarsByInstrumentIdTsRange,
  removeMarketInstrumentData,
  replaceMarketBarsForInstrument,
} from '../ports/infrastructure/db/marketDatabase.js';
import { isSystemResetExecutionActive } from '../trading/resetExecutionState.js';
import { compileCustomIndicatorScript } from '../customIndicatorRuntimeService.js';
import { ensureInstrumentMarketBarsReady as ensureSeedInstrumentMarketBarsReady } from '../systemMarketSeedService.js';
import { composeBacktestStrategySource } from './signalRuleCodegen.js';
import {
  cancelNativeBacktestBatch,
  resetNativeBacktestBatchCancellation,
} from './nativeEngine.js';
import {
  enqueueBacktestBatchRun,
  forgetBacktestBatchRun,
  getActiveBacktestBatchId,
  isBacktestBatchQueued,
  stopBacktestJobQueue,
} from './backtestJobQueue.js';
import { BACKTEST_PROGRESS_POLL_DELAY_MS } from './backtestConstants.js';
import { awaitBacktestOperation } from './backtestAsyncGuard.js';
import {
  parseBacktestJsonRecord as parseJsonRecord,
  stringifyBacktestJson as jsonStringify,
} from './backtestJson.js';
import {
  buildInsertRowsForBacktestResult,
  resolveBacktestResultEngine,
} from './backtestResultRows.js';
import { summarizeBacktestBatchMetrics } from './backtestBatchMetrics.js';
import { toBacktestResultListItem } from './backtestResultListProjection.js';
import {
  summarizeSymbolIssues,
  toFailedIssue,
  toSkippedIssue,
  type BacktestSymbolIssue,
} from './backtestSymbolIssues.js';
import { tryRunNativeBatchBacktest } from './nativeBatchRun.js';
import { runReferenceBatchParallel } from './referenceEngineWorkerPool.js';
import { createBacktestProgressWriter } from './backtestProgressWriter.js';
import { finalizeFailedBacktestRun } from './backtestRunFailure.js';
import { normalizeBacktestTradingSettings } from './backtestRuntimeParameters.js';
import { normalizeBacktestSignalRules } from './backtestSignalRules.js';
import {
  hasBacktestTimeRange,
  readBacktestCandidateBars,
  readBacktestDetailBars,
  type BacktestMarketReader,
} from './backtestTimeRange.js';
import type {
  BacktestBatch,
  BacktestBatchStatus,
  BacktestBar,
  BacktestConfig,
  BacktestEquityPoint,
  BacktestFill,
  BacktestInstrumentCandidate,
  BacktestInstrumentRunResult,
  BacktestResultSummary,
} from './types.js';
type BacktestCreateInput = z.infer<typeof desktopBacktestBatchCreateRequestSchema>;
type BacktestRunInput = z.infer<typeof desktopBacktestBatchRunRequestSchema>;
type BacktestMarketData = BacktestMarketReader & {
  removeMarketInstrumentData: typeof removeMarketInstrumentData;
  replaceMarketBarsForInstrument: typeof replaceMarketBarsForInstrument;
};
type BacktestRunRuntime = {
  seedHydrationTimeoutMs?: number;
  marketData?: BacktestMarketData;
};
const DEFAULT_BACKTEST_MARKET_DATA: BacktestMarketData = {
  getMarketBarCount,
  getMarketBarsByInstrumentIdRange,
  getMarketBarsByInstrumentIdTsRange,
  removeMarketInstrumentData,
  replaceMarketBarsForInstrument,
};
const BACKTEST_SYSTEM_POOL_IDS = new Set(['__sample_pool_system__', '__sample_pool_system_fx_1m_2025q1__']);
const BACKTEST_DETAIL_BARS_LIMIT = 5_000;
const BACKTEST_SEED_HYDRATION_TIMEOUT_MS = 60_000;
const runningBatchIds = new Set<string>();
const cancelRequestedBatchIds = new Set<string>();
const ensureSystemResetIdle = (): void => {
  if (isSystemResetExecutionActive()) {
    throw appError('SYSTEM_RESET_IN_PROGRESS');
  }
};
const backtestTradingCoreStore = createTradingCoreStore({ db, nowIso });
const forgetBacktestBatchRuntime = (batchId: string): void => {
  runningBatchIds.delete(batchId);
  cancelRequestedBatchIds.delete(batchId);
  forgetBacktestBatchRun(batchId);
  resetNativeBacktestBatchCancellation(batchId);
};

const normalizeBacktestConfig = (
  config: z.infer<typeof desktopBacktestConfigSchema>,
): BacktestConfig => {
  const tradingSettings = normalizeBacktestTradingSettings(
    config.tradingSettings,
    config.initialCapital,
  );
  const signalRules = normalizeBacktestSignalRules(
    config.signalRules,
    tradingSettings.allowShortSelling,
  );
  return {
    ...config,
    ...(signalRules ? { signalRules } : { signalRules: undefined }),
    tradingSettings,
  };
};

const parseConfig = (value: string): BacktestConfig =>
  normalizeBacktestConfig(desktopBacktestConfigSchema.parse(parseJsonRecord(value)));

const normalizeOptionalIso = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const rowToBatch = (row: BacktestBatchRow): BacktestBatch => ({
  id: row.id,
  name: row.name,
  status: row.status as BacktestBatchStatus,
  config: parseConfig(row.config_json),
  progress: parseJsonRecord(row.progress_json),
  summary: parseJsonRecord(row.summary_json),
  errorCode: row.error_code,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: normalizeOptionalIso(row.started_at),
  finishedAt: normalizeOptionalIso(row.finished_at),
});

const rowToResult = (row: BacktestResultRow): BacktestResultSummary => ({
  id: row.id,
  batchId: row.batch_id,
  instrumentId: row.instrument_id,
  symbol: row.symbol,
  timeframe: row.timeframe,
  barsCount: row.bars_count,
  finalEquity: row.final_equity,
  totalPnl: row.total_pnl,
  profitRate: row.profit_rate,
  maxDrawdown: row.max_drawdown,
  winRate: row.win_rate,
  tradeCount: row.trade_count,
  conflictCount: row.conflict_count,
  summary: parseJsonRecord(row.summary_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToFill = (row: BacktestFillRow): BacktestFill => ({
  id: row.id,
  batchId: row.batch_id,
  resultId: row.result_id,
  instrumentId: row.instrument_id,
  symbol: row.symbol,
  orderId: row.order_id,
  fillIndex: row.fill_index,
  fillTime: row.fill_time,
  side: row.side,
  price: row.price,
  qty: row.qty,
  gross: row.gross,
  fee: row.fee,
  tax: row.tax,
  slippage: row.slippage,
  createdAt: row.created_at,
});

const rowToEquityPoint = (row: BacktestEquityPointRow): BacktestEquityPoint => ({
  id: row.id,
  batchId: row.batch_id,
  resultId: row.result_id,
  instrumentId: row.instrument_id,
  symbol: row.symbol,
  barIndex: row.bar_index,
  barTime: row.bar_time,
  equity: row.equity,
  drawdown: row.drawdown,
});

const getBatchOrThrow = (batchId: string): BacktestBatchRow => {
  const row = getBacktestBatchRow(batchId);
  if (!row) {
    throw appError('BACKTEST_BATCH_NOT_FOUND', { batchId }, 404);
  }
  return row;
};

const updateBatchState = (options: {
  batch: BacktestBatchRow;
  status: BacktestBatchStatus;
  progress?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}): void => {
  updateBacktestBatchRow({
    id: options.batch.id,
    status: options.status,
    progressJson: jsonStringify(options.progress ?? parseJsonRecord(options.batch.progress_json)),
    summaryJson: jsonStringify(options.summary ?? parseJsonRecord(options.batch.summary_json)),
    errorCode: options.errorCode ?? null,
    errorMessage: options.errorMessage ?? null,
    updatedAt: nowIso(),
    startedAt: Object.prototype.hasOwnProperty.call(options, 'startedAt')
      ? options.startedAt ?? null
      : normalizeOptionalIso(options.batch.started_at),
    finishedAt: Object.prototype.hasOwnProperty.call(options, 'finishedAt')
      ? options.finishedAt ?? null
      : normalizeOptionalIso(options.batch.finished_at),
  });
};

const normalizeInstrumentRow = (row: BacktestInstrumentRow): BacktestInstrumentCandidate | null => {
  const instrumentId = String(row.id || '').trim();
  const symbol = String(row.symbol || '').trim().toUpperCase();
  if (!instrumentId || !symbol) {
    return null;
  }
  return {
    instrumentId,
    sourceId: row.source_id ?? null,
    symbol,
    baseTimeframe: String(row.base_timeframe || '').trim() || '1d',
    name: row.name,
    market: row.market ?? null,
    barCount: Math.max(0, Math.floor(Number(row.bar_count ?? 0) || 0)),
    timeZone: row.time_zone ?? null,
    barsVersionToken: row.bars_version_token ?? null,
  };
};

const isSystemSamplePoolId = (poolId: string): boolean => {
  const normalized = poolId.trim().toLowerCase();
  return BACKTEST_SYSTEM_POOL_IDS.has(normalized) ||
    normalized === 'system' ||
    normalized.startsWith('__sample_pool_system');
};

const shouldKeepSystemInstrumentForPools = (
  instrument: BacktestInstrumentCandidate,
  poolIds: readonly string[],
): boolean => {
  const normalizedPoolIds = poolIds.map((item) => item.trim().toLowerCase());
  if (normalizedPoolIds.includes('__sample_pool_system_fx_1m_2025q1__')) {
    return instrument.baseTimeframe === '1m';
  }
  if (normalizedPoolIds.includes('__sample_pool_system__')) {
    return instrument.baseTimeframe === '1d';
  }
  return true;
};

const dedupeInstruments = (
  rows: readonly BacktestInstrumentRow[],
  systemPoolIds: readonly string[] = [],
): BacktestInstrumentCandidate[] => {
  const byId = new Map<string, BacktestInstrumentCandidate>();
  rows.forEach((row) => {
    const normalized = normalizeInstrumentRow(row);
    if (!normalized) {
      return;
    }
    if (systemPoolIds.length && !shouldKeepSystemInstrumentForPools(normalized, systemPoolIds)) {
      return;
    }
    byId.set(normalized.instrumentId, normalized);
  });
  return Array.from(byId.values());
};

const listBacktestInstruments = (config: BacktestConfig): BacktestInstrumentCandidate[] => {
  const instrumentIds = Array.from(
    new Set((config.instrumentIds ?? []).map((item) => item.trim()).filter(Boolean)),
  );
  const samplePoolIds = Array.from(
    new Set((config.samplePoolIds ?? []).map((item) => item.trim()).filter(Boolean)),
  );
  const rows: BacktestInstrumentRow[] = [];
  if (instrumentIds.length) {
    rows.push(...listBacktestInstrumentRowsByIds(instrumentIds));
  }
  const systemPoolIds = samplePoolIds.filter(isSystemSamplePoolId);
  if (systemPoolIds.length) {
    rows.push(...listSystemBacktestInstrumentRows());
  }
  const sourcePoolIds = samplePoolIds.filter((poolId) => !isSystemSamplePoolId(poolId));
  if (sourcePoolIds.length) {
    rows.push(...listBacktestInstrumentRowsBySourceIds(sourcePoolIds));
  }
  return dedupeInstruments(rows, systemPoolIds);
};

const updateBacktestInstrumentBarCount = (instrumentId: string, barCount: number): void => {
  backtestTradingCoreStore.updateInstrumentBarCount(instrumentId, barCount);
};

const seedHydrationDeps = {
  updateInstrumentBarCount: updateBacktestInstrumentBarCount,
};

const toSeedInstrumentRow = (
  instrument: BacktestInstrumentCandidate,
): Parameters<typeof ensureSeedInstrumentMarketBarsReady>[1] => ({
  id: instrument.instrumentId,
  symbol: instrument.symbol,
  base_timeframe: instrument.baseTimeframe,
  name: instrument.name,
  market: instrument.market,
  bar_count: instrument.barCount,
  bars_version_token: instrument.barsVersionToken,
});

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '').trim();
};

const hydrateBacktestCandidates = async (options: {
  batchId: string;
  candidates: readonly BacktestInstrumentCandidate[];
  startedAt: string;
  timeoutMs: number;
  marketData: BacktestMarketData;
}): Promise<{
  candidates: BacktestInstrumentCandidate[];
  skippedSymbols: BacktestSymbolIssue[];
  failedSymbols: BacktestSymbolIssue[];
}> => {
  const hydratedCandidates: BacktestInstrumentCandidate[] = [];
  const skippedSymbols: BacktestSymbolIssue[] = [];
  const failedSymbols: BacktestSymbolIssue[] = [];
  const totalSymbols = options.candidates.length;
  const progressWriter = createBacktestProgressWriter({
    batchId: options.batchId,
    getBatch: getBatchOrThrow,
    updateBatchState,
    startedAt: options.startedAt,
    summary: () => summarizeSymbolIssues({
      candidates: options.candidates,
      skippedSymbols,
      failedSymbols,
    }),
  });
  for (const [index, candidate] of options.candidates.entries()) {
    throwIfBacktestCancelled(options.batchId);
    progressWriter.write(
      {
        stage: 'HYDRATING',
        completedSymbols: index,
        totalSymbols,
        currentSymbol: candidate.symbol,
      },
      { force: index === 0 },
    );

    try {
      const barCount = await awaitBacktestOperation(
        (signal) => ensureSeedInstrumentMarketBarsReady(
          {
            ...seedHydrationDeps,
            marketData: options.marketData,
          },
          toSeedInstrumentRow(candidate),
          { signal },
        ),
        {
          isCancelled: () => isBacktestCancelRequested(options.batchId),
          timeoutCode: 'BACKTEST_SEED_HYDRATION_TIMEOUT',
          timeoutMs: options.timeoutMs,
          batchId: options.batchId,
        },
      );
      throwIfBacktestCancelled(options.batchId);
      if (barCount <= 0) {
        skippedSymbols.push(toSkippedIssue(candidate, 'NO_BARS'));
      } else {
        hydratedCandidates.push({
          ...candidate,
          barCount,
        });
      }
    } catch (error) {
      if (isAppError(error) && error.code === 'BACKTEST_RUN_CANCELLED') {
        throw error;
      }
      if (error instanceof Error && error.message === 'BACKTEST_SEED_HYDRATION_TIMEOUT') {
        throw error;
      }
      failedSymbols.push(toFailedIssue(
        candidate,
        'HYDRATION_FAILED',
        toErrorMessage(error).slice(0, 240),
      ));
    }

    progressWriter.write({
      stage: 'HYDRATING',
      completedSymbols: index + 1,
      totalSymbols,
      currentSymbol: candidate.symbol,
    });
  }
  progressWriter.write(
    {
      stage: 'HYDRATING',
      completedSymbols: totalSymbols,
      totalSymbols,
      currentSymbol: null,
    },
    { force: true },
  );
  return {
    candidates: hydratedCandidates,
    skippedSymbols,
    failedSymbols,
  };
};

const persistRunResults = (
  batch: BacktestBatchRow,
  config: BacktestConfig,
  results: readonly BacktestInstrumentRunResult[],
  startedAt: string,
  extraSummary: Record<string, unknown> = {},
  finalProgressTotalSymbols = results.length,
): BacktestBatch => {
  const completedAt = nowIso();
  const resultRows: ReturnType<typeof buildInsertRowsForBacktestResult>['results'] = [];
  const fillRows: ReturnType<typeof buildInsertRowsForBacktestResult>['fills'] = [];
  const equityRows: ReturnType<typeof buildInsertRowsForBacktestResult>['equityCurve'] = [];

  for (const item of results) {
    const rows = buildInsertRowsForBacktestResult(batch.id, item, completedAt);
    resultRows.push(...rows.results);
    fillRows.push(...rows.fills);
    equityRows.push(...rows.equityCurve);
  }

  const totalSymbols = results.length;
  const bestResult = [...results].sort((left, right) => right.result.profitRate - left.result.profitRate)[0] ?? null;
  const resultEngines = new Set(results.map(resolveBacktestResultEngine));
  const [batchEngine = 'TS_REFERENCE'] = Array.from(resultEngines);
  const summary = {
    engine: resultEngines.size === 1
      ? batchEngine
      : 'MIXED',
    ...extraSummary,
    totalSymbols,
    initialCapital: config.initialCapital,
    ...summarizeBacktestBatchMetrics(results.map((item) => item.result)),
    bestSymbol: bestResult?.instrument.symbol ?? null,
    bestProfitRate: bestResult?.result.profitRate ?? null,
    generatedAt: completedAt,
  };
  replaceBacktestRunRows({
    batch: {
      id: batch.id,
      status: 'SUCCEEDED',
      progressJson: jsonStringify({
        stage: 'DONE',
        completedSymbols: finalProgressTotalSymbols,
        totalSymbols: finalProgressTotalSymbols,
        pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
        updatedAt: completedAt,
      }),
      summaryJson: jsonStringify(summary),
      errorCode: null,
      errorMessage: null,
      updatedAt: completedAt,
      startedAt,
      finishedAt: completedAt,
    },
    results: resultRows,
    fills: fillRows,
    equityCurve: equityRows,
  });
  return rowToBatch(getBatchOrThrow(batch.id));
};

const cancelRun = (batch: BacktestBatchRow, startedAt: string | null): BacktestBatch => {
  const cancelledAt = nowIso();
  finalizeCancelledBacktestBatchRow({
    id: batch.id,
    status: 'CANCELLED',
    progressJson: jsonStringify({
      ...parseJsonRecord(batch.progress_json),
      stage: 'CANCELLED',
      currentSymbol: null,
      pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
      updatedAt: cancelledAt,
    }),
    summaryJson: jsonStringify(parseJsonRecord(batch.summary_json)),
    errorCode: null,
    errorMessage: null,
    updatedAt: cancelledAt,
    startedAt: startedAt ?? normalizeOptionalIso(batch.started_at),
    finishedAt: cancelledAt,
  });
  return rowToBatch(getBatchOrThrow(batch.id));
};

const isBacktestCancelRequested = (batchId: string): boolean =>
  cancelRequestedBatchIds.has(batchId);

const throwIfBacktestCancelled = (batchId: string): void => {
  if (isBacktestCancelRequested(batchId)) {
    throw appError('BACKTEST_RUN_CANCELLED', { batchId });
  }
};

const createBacktestBatchWithId = (input: {
  id: string;
  name: string;
  config: unknown;
}): BacktestBatch => {
  ensureSystemResetIdle();
  const now = nowIso();
  const rawConfig = desktopBacktestConfigSchema.parse(input.config);
  const config = desktopBacktestConfigSchema.parse({
    ...rawConfig,
    name: input.name ?? rawConfig.name,
  });
  const normalizedConfig = normalizeBacktestConfig(config);
  const name = (input.name || config.name || `Backtest ${now}`).trim();
  insertBacktestBatchRow({
    id: input.id,
    name,
    status: 'DRAFT',
    configJson: jsonStringify(normalizedConfig),
    progressJson: jsonStringify({
      stage: 'DRAFT',
      completedSymbols: 0,
      totalSymbols: 0,
      pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
      updatedAt: now,
    }),
    summaryJson: jsonStringify({}),
    createdAt: now,
    updatedAt: now,
  });
  return rowToBatch(getBatchOrThrow(input.id));
};

export const createBacktestBatch = (input: BacktestCreateInput): BacktestBatch => {
  ensureSystemResetIdle();
  const payload = desktopBacktestBatchCreateRequestSchema.parse(input);
  return createBacktestBatchWithId({
    id: createId(),
    name: (payload.name || payload.config.name || `Backtest ${nowIso()}`).trim(),
    config: payload.config,
  });
};

/** Internal-only factory. The caller supplies a reserved ID so simulator cleanup
 * can never infer ownership from a user-visible name. */
export const createSystemDevSimulationBacktestBatch = (input: {
  id: string;
  name: string;
  config: unknown;
}): BacktestBatch => {
  if (!input.id.startsWith("sim_dev_backtest:")) {
    throw appError("BACKTEST_BATCH_NOT_FOUND", { batchId: input.id }, 400);
  }
  return createBacktestBatchWithId(input);
};

export const listBacktestBatches = (): BacktestBatch[] =>
  listBacktestBatchRows().map(rowToBatch);

export { recoverInterruptedBacktestBatches } from './backtestRecovery.js';
export const isBacktestRuntimeIdle = (): boolean => runningBatchIds.size === 0 && !hasActiveBacktestBatchRows();

export const stopBacktestRuntime = async (): Promise<void> => {
  const activeBatchId = getActiveBacktestBatchId();
  const activeBatches = listActiveBacktestBatchRows();
  for (const batch of activeBatches) {
    cancelRequestedBatchIds.add(batch.id);
    forgetBacktestBatchRun(batch.id);
    cancelNativeBacktestBatch(batch.id);
    cancelRun(batch, normalizeOptionalIso(batch.started_at));
  }
  await stopBacktestJobQueue();
  activeBatches.forEach((batch) => resetNativeBacktestBatchCancellation(batch.id));
  if (activeBatchId) {
    runningBatchIds.delete(activeBatchId);
    cancelRequestedBatchIds.delete(activeBatchId);
  }
};

export const getBacktestBatch = (batchId: string): BacktestBatch =>
  rowToBatch(getBatchOrThrow(batchId));

export const deleteBacktestBatch = (batchId: string): { deletedBatchId: string } => {
  const batch = getBatchOrThrow(batchId);
  if (batch.status === 'QUEUED' || batch.status === 'RUNNING' || isBacktestBatchQueued(batchId)) {
    throw appError('BACKTEST_BATCH_ACTIVE', { batchId, status: batch.status }, 409);
  }
  if (!deleteBacktestBatchRow(batchId)) {
    throw appError('BACKTEST_BATCH_NOT_FOUND', { batchId }, 404);
  }
  forgetBacktestBatchRuntime(batchId);
  return { deletedBatchId: batchId };
};

export const clearBacktestBatches = () => {
  const activeBatch = listActiveBacktestBatchRows()[0];
  const activeBatchId = activeBatch?.id ?? getActiveBacktestBatchId();
  if (activeBatchId) {
    throw appError('BACKTEST_BATCH_ACTIVE', { batchId: activeBatchId, status: activeBatch?.status ?? 'RUNNING' }, 409);
  }
  const deletedBatchIds = deleteAllBacktestBatchRows();
  const runtimeBatchIds = new Set([
    ...deletedBatchIds,
    ...runningBatchIds,
    ...cancelRequestedBatchIds,
  ]);
  runtimeBatchIds.forEach(forgetBacktestBatchRuntime);
  return {
    deletedBatchIds,
    deletedBatchCount: deletedBatchIds.length,
    clearedAt: nowIso(),
  };
};

export const cancelBacktestBatch = (batchId: string): BacktestBatch => {
  const batch = getBatchOrThrow(batchId);
  if (batch.status !== 'QUEUED' && batch.status !== 'RUNNING' && !isBacktestBatchQueued(batchId)) {
    return rowToBatch(batch);
  }
  cancelRequestedBatchIds.add(batchId);
  const isRunning = runningBatchIds.has(batchId);
  forgetBacktestBatchRun(batchId);
  cancelNativeBacktestBatch(batchId);
  const cancelled = cancelRun(batch, normalizeOptionalIso(batch.started_at));
  if (!isRunning) {
    resetNativeBacktestBatchCancellation(batchId);
  }
  return cancelled;
};

export const runBacktestBatchNow = async (
  batchId: string,
  runtime: BacktestRunRuntime = {},
): Promise<BacktestBatch> => {
  ensureSystemResetIdle();
  if (runningBatchIds.has(batchId)) {
    return rowToBatch(getBatchOrThrow(batchId));
  }
  runningBatchIds.add(batchId);
  const batch = getBatchOrThrow(batchId);
  const startedAt = nowIso();
  try {
    if (isBacktestCancelRequested(batchId)) {
      return cancelRun(batch, startedAt);
    }
    cancelRequestedBatchIds.delete(batchId);
    const config = parseConfig(batch.config_json);
    const strategySource = composeBacktestStrategySource(
      config.strategySource,
      config.signalRules,
    );
    const compileResult = compileCustomIndicatorScript({
      source: strategySource,
      parameterInputs: config.parameterInputs,
      displayName: batch.name,
    });
    if (!compileResult.state) {
      throw appError('BACKTEST_STRATEGY_COMPILE_FAILED', {
        errors: compileResult.compileErrors.length,
      });
    }
    const candidates = listBacktestInstruments(config);
    if (!candidates.length) {
      throw appError('BACKTEST_UNIVERSE_EMPTY');
    }
    updateBatchState({
      batch,
      status: 'RUNNING',
      progress: {
        stage: 'RUNNING',
        completedSymbols: 0,
        totalSymbols: candidates.length,
        currentSymbol: null,
        pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
        updatedAt: startedAt,
      },
      summary: {},
      errorCode: null,
      errorMessage: null,
      startedAt,
      finishedAt: null,
    });

    const hydrated = await hydrateBacktestCandidates({
      batchId,
      candidates,
      startedAt,
      timeoutMs: Number.isFinite(runtime.seedHydrationTimeoutMs)
        ? Math.max(1, Math.floor(Number(runtime.seedHydrationTimeoutMs)))
        : BACKTEST_SEED_HYDRATION_TIMEOUT_MS,
      marketData: runtime.marketData ?? DEFAULT_BACKTEST_MARKET_DATA,
    });
    throwIfBacktestCancelled(batchId);
    if (!hydrated.candidates.length) {
      throw appError('BACKTEST_NO_MARKET_BARS');
    }
    let nativeFallbackSummary: Record<string, unknown> | null = null;
    if (!hasBacktestTimeRange(config)) {
      const nativeAttempt = await tryRunNativeBatchBacktest({
        batchId,
        config,
        allCandidates: candidates,
        candidates: hydrated.candidates,
        compiled: compileResult.state.compiled,
        strategySource,
        displayName: batch.name,
        startedAt,
        skippedSymbols: hydrated.skippedSymbols,
        failedSymbols: hydrated.failedSymbols,
        getBatchOrThrow,
        updateBatchState,
        rowToBatch,
        isCancellationRequested: () => isBacktestCancelRequested(batchId),
        readMarketBarsByInstrumentIdRange:
          runtime.marketData?.getMarketBarsByInstrumentIdRange,
        readBars: (candidate, signal) =>
          readBacktestCandidateBars(candidate, config, {
            signal,
            marketReader: runtime.marketData,
          }),
      });
      throwIfBacktestCancelled(batchId);
      if (nativeAttempt.batch) {
        return nativeAttempt.batch;
      }
      nativeFallbackSummary = nativeAttempt.fallbackSummary;
    }

    const completedResults: BacktestInstrumentRunResult[] = [];
    const skippedSymbols: BacktestSymbolIssue[] = [...hydrated.skippedSymbols];
    const failedSymbols: BacktestSymbolIssue[] = [...hydrated.failedSymbols];
    const progressBase = hydrated.skippedSymbols.length + hydrated.failedSymbols.length;
    const progressWriter = createBacktestProgressWriter({
      batchId,
      getBatch: getBatchOrThrow,
      updateBatchState,
      startedAt,
      summary: () => summarizeSymbolIssues({
        candidates,
        skippedSymbols,
        failedSymbols,
      }),
    });
    const outcomes = await runReferenceBatchParallel({
      config,
      candidates: hydrated.candidates,
      strategySource,
      compiled: compileResult.state.compiled,
      displayName: batch.name,
      isCancelled: () => isBacktestCancelRequested(batchId),
      readBars: (candidate, signal) =>
        readBacktestCandidateBars(candidate, config, {
          signal,
          marketReader: runtime.marketData,
        }),
      onProgress: (progress) => {
        progressWriter.write({
          stage: 'RUNNING',
          completedSymbols: progressBase + progress.completed,
          totalSymbols: candidates.length,
          currentSymbol: progress.symbol,
        });
      },
    });
    throwIfBacktestCancelled(batchId);
    for (const outcome of outcomes) {
      if (outcome.status === 'COMPLETED') {
        completedResults.push(outcome.result);
      } else if (outcome.status === 'SKIPPED') {
        skippedSymbols.push(outcome.issue);
      } else {
        failedSymbols.push(outcome.issue);
      }
    }
    progressWriter.write(
      {
        stage: 'RUNNING',
        completedSymbols: candidates.length,
        totalSymbols: candidates.length,
        currentSymbol: null,
      },
      { force: true },
    );
    if (!completedResults.length) {
      throw appError('BACKTEST_NO_MARKET_BARS');
    }
    return persistRunResults(
      getBatchOrThrow(batchId),
      config,
      completedResults,
      startedAt,
      {
        ...(nativeFallbackSummary ?? {}),
        ...summarizeSymbolIssues({
          candidates,
          skippedSymbols,
          failedSymbols,
        }),
      },
      candidates.length,
    );
  } catch (error) {
    if (isAppError(error) && error.code === 'BACKTEST_RUN_CANCELLED') {
      return cancelRun(getBatchOrThrow(batchId), startedAt);
    }
    finalizeFailedBacktestRun(getBatchOrThrow(batchId), error, startedAt);
    throw error;
  } finally {
    resetNativeBacktestBatchCancellation(batchId);
    cancelRequestedBatchIds.delete(batchId);
    runningBatchIds.delete(batchId);
  }
};

export const queueBacktestBatchRun = (
  batchId: string,
  _input: BacktestRunInput = {},
): BacktestBatch => {
  ensureSystemResetIdle();
  const batch = getBatchOrThrow(batchId);
  if (batch.status === 'RUNNING' || batch.status === 'QUEUED' || isBacktestBatchQueued(batchId)) {
    return rowToBatch(batch);
  }
  resetNativeBacktestBatchCancellation(batchId);
  cancelRequestedBatchIds.delete(batchId);
  const queuedAt = nowIso();
  updateBatchState({
    batch,
    status: 'QUEUED',
    progress: {
      stage: 'QUEUED',
      completedSymbols: 0,
      totalSymbols: 0,
      pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
      updatedAt: queuedAt,
    },
    summary: {},
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
  });
  enqueueBacktestBatchRun(batchId, runBacktestBatchNow);
  return rowToBatch(getBatchOrThrow(batchId));
};

export const getBacktestProgress = (
  batchId: string,
): { batch: BacktestBatch; progress: Record<string, unknown> } => {
  const batch = rowToBatch(getBatchOrThrow(batchId));
  return {
    batch,
    progress: batch.progress,
  };
};

export const getBacktestResults = (batchId: string) => {
  const batch = rowToBatch(getBatchOrThrow(batchId));
  return {
    batch,
    results: listBacktestResultRows(batchId).map(toBacktestResultListItem),
  };
};

export const getBacktestResultDetail = async (
  batchId: string,
  symbol: string,
  runtime: { marketData?: BacktestMarketReader } = {},
): Promise<{
  batch: BacktestBatch;
  result: BacktestResultSummary;
  fills: BacktestFill[];
  equityCurve: BacktestEquityPoint[];
  bars: BacktestBar[];
}> => {
  const batch = rowToBatch(getBatchOrThrow(batchId));
  const resultRow = getBacktestResultRowBySymbol(batchId, symbol);
  if (!resultRow) {
    throw appError('BACKTEST_RESULT_NOT_FOUND', { batchId, symbol }, 404);
  }
  const startIndex = Math.max(
    0,
    Math.floor(Number(batch.config.startIndex ?? 0) || 0),
  );
  const limit = Math.min(BACKTEST_DETAIL_BARS_LIMIT, Math.max(0, resultRow.bars_count));
  const { rawBars, rawIndexStart } = await readBacktestDetailBars({
    instrumentId: resultRow.instrument_id,
    config: batch.config,
    startIndex,
    limit,
    marketReader: runtime.marketData,
  });
  const bars = rawBars.map((bar, index) => ({
    rawIndex: rawIndexStart === null ? index : rawIndexStart + index,
    ...bar,
  }));
  return {
    batch,
    result: rowToResult(resultRow),
    fills: listBacktestFillRows(resultRow.id).map(rowToFill),
    equityCurve: listBacktestEquityPointRows(resultRow.id).map(rowToEquityPoint),
    bars,
  };
};
