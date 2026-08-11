// SPDX-License-Identifier: GPL-3.0-only

import { appError, isAppError } from '../../kernel/appError.js';
import { nowIso } from '../../kernel/time.js';
import {
  MARKET_DB_FILE_PATH,
  closeMarketDatabase,
  getMarketBarsByInstrumentIdRange,
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  appendBacktestRunResultsChunk,
  clearBacktestRunRows,
  type BacktestBatchRow,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import type { compileCustomIndicatorScript } from '../customIndicatorRuntimeService.js';
import { parseIndicatorScript } from '../customIndicatorEngine/parser/index.js';
import { extractScriptParametersFromProgram } from '../customIndicatorEngine/indicator/sourceMetadata.js';
import {
  BACKTEST_PROGRESS_POLL_DELAY_MS,
  BACKTEST_RESULT_CHUNK_ROW_LIMIT,
  BACKTEST_RESULT_CHUNK_SYMBOL_LIMIT,
} from './backtestConstants.js';
import { attachExactBacktestMetrics } from './backtestMetricsPersistence.js';
import {
  addBacktestResultMetrics,
  createBacktestBatchMetricAccumulator,
  finishBacktestBatchMetrics,
} from './backtestBatchMetrics.js';
import {
  createBacktestProgressWriter,
} from './backtestProgressWriter.js';
import { buildParameterOverrides } from './backtestRuntimeParameters.js';
import {
  buildInsertRowsForBacktestResult,
  resolveBacktestResultEngine,
} from './backtestResultRows.js';
import {
  summarizeSymbolIssues,
  toSkippedIssue,
  type BacktestSymbolIssue,
} from './backtestSymbolIssues.js';
import {
  isNativeBatchBacktestEnabled,
  runBacktestNativeBatch,
  type BacktestNativeSignalPlan,
} from './nativeEngine.js';
import type {
  BacktestBatch,
  BacktestBatchStatus,
  BacktestConfig,
  BacktestInstrumentCandidate,
  BacktestInstrumentRunResult,
} from './types.js';
import {
  awaitBacktestOperation,
  throwIfBacktestOperationCancelled,
} from './backtestAsyncGuard.js';
import { runReferenceBatchParallel } from './referenceEngineWorkerPool.js';
import {
  assertNativeBacktestDifferentialParity,
  BACKTEST_EVALUATOR_SEMANTICS_VERSION,
} from './nativeDifferentialParity.js';
import type { OhlcvBar } from '../../domain/models.js';

const BACKTEST_NATIVE_METRIC_READ_TIMEOUT_MS = 30_000;

type CompiledCustomIndicator = NonNullable<
  ReturnType<typeof compileCustomIndicatorScript>['state']
>['compiled'];

type UpdateBacktestBatchState = (options: {
  batch: BacktestBatchRow;
  status: BacktestBatchStatus;
  progress?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}) => void;

const buildNativeSignalPlan = (
  config: BacktestConfig,
  compiled: CompiledCustomIndicator,
): BacktestNativeSignalPlan => {
  const parsed = parseIndicatorScript(compiled.definition.source);
  const extracted = extractScriptParametersFromProgram(
    parsed.program,
    compiled.definition.parameters,
  );
  return {
    version: 1,
    semanticsVersion: BACKTEST_EVALUATOR_SEMANTICS_VERSION,
    program: extracted.executableProgram,
    parameterOverrides: {
      ...compiled.parameterDefaults,
      ...buildParameterOverrides(config.parameterInputs),
    },
    outputKeys: ['BUY', 'SELL', 'SHORT', 'COVER'],
  };
};

const resolveBacktestConfiguredStartIndex = (config: BacktestConfig): number =>
  Math.max(0, Math.floor(Number(config.startIndex ?? 0) || 0));

const resolveNativeMetricBarsLimit = (
  item: BacktestInstrumentRunResult,
  startIndex: number,
): number => {
  const maxEquityBarIndex = item.equityCurve.reduce(
    (max, point) => Math.max(max, Math.floor(Number(point.barIndex) || 0)),
    -1,
  );
  const rawSpan =
    maxEquityBarIndex >= startIndex ? maxEquityBarIndex - startIndex + 1 : 0;
  return Math.max(
    2,
    Math.floor(Number(item.result.barsCount) || 0),
    rawSpan,
    item.equityCurve.length,
  );
};

export const tryRunNativeBatchBacktest = async (
  options: {
    batchId: string;
    config: BacktestConfig;
    allCandidates: BacktestInstrumentCandidate[];
    candidates: BacktestInstrumentCandidate[];
    compiled: CompiledCustomIndicator;
    strategySource: string;
    displayName: string;
    startedAt: string;
    skippedSymbols: BacktestSymbolIssue[];
    failedSymbols: BacktestSymbolIssue[];
    isCancellationRequested?: () => boolean;
    getBatchOrThrow: (batchId: string) => BacktestBatchRow;
    updateBatchState: UpdateBacktestBatchState;
    rowToBatch: (row: BacktestBatchRow) => BacktestBatch;
    readMarketBarsByInstrumentIdRange?:
      typeof getMarketBarsByInstrumentIdRange;
    readBars: (
      candidate: BacktestInstrumentCandidate,
      signal: AbortSignal,
    ) => Promise<OhlcvBar[]>;
  },
): Promise<{
  batch: BacktestBatch | null;
  fallbackSummary: Record<string, unknown> | null;
}> => {
  if (!isNativeBatchBacktestEnabled()) {
    return { batch: null, fallbackSummary: null };
  }
  const completedAt = nowIso();
  const resultRows: ReturnType<typeof buildInsertRowsForBacktestResult>['results'] = [];
  const fillRows: ReturnType<typeof buildInsertRowsForBacktestResult>['fills'] = [];
  const equityRows: ReturnType<typeof buildInsertRowsForBacktestResult>['equityCurve'] = [];
  const batchMetricAccumulator = createBacktestBatchMetricAccumulator();
  const resultEngines = new Set<string>();
  let totalSymbols = 0;
  let bestSymbol: string | null = null;
  let bestProfitRate: number | null = null;
  let clearedExistingRows = false;
  const stagedNativeResults: BacktestInstrumentRunResult[] = [];
  const skippedSymbols: BacktestSymbolIssue[] = [...options.skippedSymbols];
  const failedSymbols: BacktestSymbolIssue[] = [...options.failedSymbols];
  const progressWriter = createBacktestProgressWriter({
    batchId: options.batchId,
    getBatch: options.getBatchOrThrow,
    updateBatchState: options.updateBatchState,
    startedAt: options.startedAt,
    summary: () => summarizeSymbolIssues({
      candidates: options.allCandidates,
      skippedSymbols,
      failedSymbols,
    }),
  });
  const isCancelled = (): boolean => Boolean(options.isCancellationRequested?.());
  const throwIfCancelled = (): void => {
    throwIfBacktestOperationCancelled(isCancelled, options.batchId);
  };
  const flushRows = (): void => {
    throwIfCancelled();
    appendBacktestRunResultsChunk({
      results: resultRows.splice(0),
      fills: fillRows.splice(0),
      equityCurve: equityRows.splice(0),
    });
  };
  const shouldFlushRows = (): boolean =>
    resultRows.length >= BACKTEST_RESULT_CHUNK_SYMBOL_LIMIT ||
    fillRows.length + equityRows.length >= BACKTEST_RESULT_CHUNK_ROW_LIMIT;

  try {
    throwIfCancelled();
    await awaitBacktestOperation(
      () => closeMarketDatabase(),
      { isCancelled, batchId: options.batchId },
    );
    throwIfCancelled();
    const nativeSummary = await runBacktestNativeBatch({
      batchId: options.batchId,
      config: options.config,
      instruments: options.candidates,
      marketDbPath: MARKET_DB_FILE_PATH,
      signalPlan: buildNativeSignalPlan(options.config, options.compiled),
      priceMode: options.config.signalExecutionMode ?? options.config.priceMode,
    }, {
      isCancellationRequested: isCancelled,
      onProgress: (progress) => {
        if (options.isCancellationRequested?.()) {
          return;
        }
        progressWriter.write({
            stage: 'RUNNING',
            completedSymbols: options.skippedSymbols.length + options.failedSymbols.length + progress.completed,
            totalSymbols: options.allCandidates.length || progress.total,
            currentSymbol: progress.symbol,
        });
      },
      onResult: async (item) => {
        throwIfCancelled();
        const rawStartIndex = resolveBacktestConfiguredStartIndex(options.config);
        const metricBarsLimit = resolveNativeMetricBarsLimit(item, rawStartIndex);
        const metricBars = await awaitBacktestOperation(
          (signal) => (
            options.readMarketBarsByInstrumentIdRange
            ?? getMarketBarsByInstrumentIdRange
          )(
            item.instrument.instrumentId,
            rawStartIndex,
            metricBarsLimit,
            { signal },
          ),
          {
            isCancelled,
            timeoutCode: 'BACKTEST_NATIVE_METRIC_READ_TIMEOUT',
            timeoutMs: BACKTEST_NATIVE_METRIC_READ_TIMEOUT_MS,
            batchId: options.batchId,
          },
        );
        throwIfCancelled();
        const itemWithMetrics = attachExactBacktestMetrics(
          item,
          options.config,
          metricBars,
          { rawStartIndex },
        );
        stagedNativeResults.push(itemWithMetrics);
        throwIfCancelled();
      },
    });
    throwIfCancelled();
    progressWriter.flush();
    if (stagedNativeResults.length <= 0) {
      options.updateBatchState({
        batch: options.getBatchOrThrow(options.batchId),
        status: 'RUNNING',
        progress: {
          stage: 'RUNNING',
          completedSymbols: options.allCandidates.length,
          totalSymbols: options.allCandidates.length,
          currentSymbol: null,
          pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
          updatedAt: nowIso(),
        },
        summary: summarizeSymbolIssues({
          candidates: options.allCandidates,
          skippedSymbols: [
            ...skippedSymbols,
            ...options.candidates.map((candidate) => toSkippedIssue(candidate, 'NO_BARS')),
          ],
          failedSymbols,
        }),
        errorCode: null,
        errorMessage: null,
        startedAt: options.startedAt,
        finishedAt: null,
      });
      throw appError('BACKTEST_NO_MARKET_BARS');
    }
    const referenceOutcomes = await runReferenceBatchParallel({
      config: options.config,
      candidates: options.candidates,
      strategySource: options.strategySource,
      compiled: options.compiled,
      displayName: options.displayName,
      readBars: options.readBars,
      isCancelled,
      onProgress: () => {},
    });
    throwIfCancelled();
    assertNativeBacktestDifferentialParity({
      nativeResults: stagedNativeResults,
      referenceOutcomes,
    });
    throwIfCancelled();

    clearBacktestRunRows(options.batchId);
    clearedExistingRows = true;
    for (const itemWithMetrics of stagedNativeResults) {
      totalSymbols += 1;
      addBacktestResultMetrics(batchMetricAccumulator, itemWithMetrics.result);
      resultEngines.add(resolveBacktestResultEngine(itemWithMetrics));
      if (
        bestProfitRate === null
        || itemWithMetrics.result.profitRate > bestProfitRate
      ) {
        bestSymbol = itemWithMetrics.instrument.symbol;
        bestProfitRate = itemWithMetrics.result.profitRate;
      }
      const rows = buildInsertRowsForBacktestResult(
        options.batchId,
        itemWithMetrics,
        completedAt,
      );
      resultRows.push(...rows.results);
      fillRows.push(...rows.fills);
      equityRows.push(...rows.equityCurve);
      if (shouldFlushRows()) {
        flushRows();
      }
    }
    flushRows();
    const completedInstrumentIds = new Set(
      nativeSummary.completedInstruments.map((instrument) => instrument.instrumentId),
    );
    const explicitNativeSkippedIds = new Set<string>();
    nativeSummary.skippedSymbolDetails.forEach((item) => {
      const candidate = options.candidates.find(
        (entry) => entry.instrumentId === item.instrumentId || entry.symbol === item.symbol,
      );
      if (!candidate) {
        return;
      }
      explicitNativeSkippedIds.add(candidate.instrumentId);
      skippedSymbols.push(toSkippedIssue(
        candidate,
        'NO_BARS',
        item.message || item.reason,
      ));
    });
    options.candidates.forEach((candidate) => {
      if (
        !completedInstrumentIds.has(candidate.instrumentId) &&
        !explicitNativeSkippedIds.has(candidate.instrumentId)
      ) {
        skippedSymbols.push(toSkippedIssue(candidate, 'NO_BARS'));
      }
    });
    const [batchEngine = nativeSummary.engine || 'RUST_DUCKDB_BATCH'] = Array.from(resultEngines);
    const summary = {
      engine: resultEngines.size === 1
        ? batchEngine
        : 'MIXED',
      ...summarizeSymbolIssues({
        candidates: options.allCandidates,
        skippedSymbols,
        failedSymbols,
      }),
      totalSymbols,
      initialCapital: options.config.initialCapital,
      ...finishBacktestBatchMetrics(batchMetricAccumulator),
      bestSymbol,
      bestProfitRate,
      nativeWorkers: nativeSummary.nativeWorkers,
      nativeDurationMs: nativeSummary.durationMs,
      nativeCompletedSymbols: nativeSummary.completedSymbols,
      nativeSkippedSymbols: nativeSummary.skippedSymbols,
      nativeImportedSymbols: nativeSummary.importedSymbols,
      generatedAt: completedAt,
    };
    throwIfCancelled();
    options.updateBatchState({
      batch: options.getBatchOrThrow(options.batchId),
      status: 'SUCCEEDED',
      progress: {
        stage: 'DONE',
        completedSymbols: options.allCandidates.length,
        totalSymbols: options.allCandidates.length,
        pollDelayMs: BACKTEST_PROGRESS_POLL_DELAY_MS,
        updatedAt: completedAt,
      },
      summary,
      errorCode: null,
      errorMessage: null,
      startedAt: options.startedAt,
      finishedAt: completedAt,
    });
    return {
      batch: options.rowToBatch(options.getBatchOrThrow(options.batchId)),
      fallbackSummary: null,
    };
  } catch (error) {
    if (clearedExistingRows) {
      clearBacktestRunRows(options.batchId);
    }
    if (isAppError(error) && error.code === 'BACKTEST_RUN_CANCELLED') {
      throw error;
    }
    if (isAppError(error) && error.code === 'BACKTEST_NATIVE_BATCH_TIMEOUT') {
      throw error;
    }
    if (error instanceof Error && error.message === 'BACKTEST_NATIVE_METRIC_READ_TIMEOUT') {
      throw error;
    }
    const code = isAppError(error) ? error.code : 'BACKTEST_NATIVE_BATCH_FAILED';
    return {
      batch: null,
      fallbackSummary: {
        nativeBatchFallback: true,
        nativeBatchFallbackCode: code,
        unsupportedNativeOps: code === 'BACKTEST_NATIVE_BATCH_UNSUPPORTED',
      },
    };
  }
};
