// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { DatabaseStorageFootprint } from '../ports/infrastructure/db/database.js';
import type { MarketStorageFootprint } from '../ports/infrastructure/db/marketDatabase.js';
import { appError, isAppError } from '../../kernel/appError.js';
import { createId } from '../../kernel/id.js';
import {
  activateSystemResetRecoveryWriteBarrier,
  clearSystemResetRecoveryWriteBarrier,
  isSystemResetExecutionActive,
  releaseSystemResetExecution,
  tryAcquireSystemResetExecution,
  tryAcquireSystemResetRecoveryExecution,
} from './resetExecutionState.js';
import {
  getResetAllStoredDataJobState,
  startResetAllStoredDataJobState,
  type ResetAllDataJobSnapshot,
  type ResetAllDataModuleKey,
  type ResetAllDataModuleStatus,
  type ResetAllDataProgressCallback
} from './resetAllDataJobState.js';
import { createSystemResetStore } from '../ports/infrastructure/db/trading/systemResetStore.js';
import {
  createSystemResetJournalStore,
  type ResetAllDataOperationCheckpoint,
} from '../ports/infrastructure/db/trading/systemResetJournalStore.js';
import {
  SYSTEM_DEV_SIMULATION_JOBS,
  hasActiveSystemDevSimulationJob,
} from '../ports/infrastructure/db/systemDevSimulation/jobStore.js';
import {
  clearInactiveSystemDevSimulationCleanupJobState,
  hasActiveSystemDevSimulationCleanupJob,
} from '../ports/infrastructure/db/systemDevSimulation/cleanupJobStore.js';
import { isSystemDevSimulationCleanupExecutionActive } from '../systemDevSimulation/cleanupExecutionState.js';
import { hasActiveSystemDevSimulationTaskExecution } from '../systemDevSimulation/taskExecutionState.js';
import { hasActiveLocalDataImportPreviewExecutions } from '../dataSource/importPreviewExecutionState.js';

type InstrumentIdentity = {
  id: string;
  symbol: string;
  name?: string | null;
  bar_count?: number;
};

export type ResetAllStoredDataRecoveryResult = {
  status: 'NONE' | 'ABORTED' | 'RECOVERED' | 'BLOCKED';
  operationId: string | null;
  checkpoint: ResetAllDataOperationCheckpoint | null;
  errorCode: string | null;
};

type ResetAllDataReporter = (
  moduleKey: ResetAllDataModuleKey,
  progressPercent: number,
  status?: Extract<ResetAllDataModuleStatus, 'RUNNING' | 'SUCCESS'>,
) => void;

type CreateSystemResetOpsDeps = {
  db: Pick<Database.Database, 'prepare' | 'transaction'>;
  DEFAULT_USER_ID: string;
  DEFAULT_SECURITIES_ACCOUNT_ID: string;
  DEFAULT_INITIAL_SECURITIES_BALANCE: number;
  DEFAULT_INITIAL_BANK_BALANCE: number;
  DEFAULT_TRADING_ASSET_CLASS: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  DEFAULT_TRADING_MARKET_PRESET_ID: string;
  DEFAULT_MIN_TRADE_STEP: number;
  DEFAULT_COMMISSION_RATE: number;
  DEFAULT_MAKER_FEE_RATE: number;
  DEFAULT_TAKER_FEE_RATE: number;
  DEFAULT_FUNDING_RATE: number;
  DEFAULT_CONTRACT_MULTIPLIER: number;
  DEFAULT_TRANSFER_FEE_RATE: number;
  DEFAULT_REGULATORY_FEE_RATE: number;
  DEFAULT_PLATFORM_FEE_RATE: number;
  DEFAULT_TRANSACTION_LEVY_RATE: number;
  DEFAULT_SLIPPAGE_RATE: number;
  DEFAULT_STAMP_DUTY_RATE: number;
  DEFAULT_COMMISSION_MINIMUM_FEE: number;
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE: number;
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE: number;
  DEFAULT_LONG_FINANCING_ANNUAL_RATE: number;
  DEFAULT_LONG_INITIAL_MARGIN_RATIO: number;
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO: number;
  DEFAULT_SHORT_BORROW_ANNUAL_RATE: number;
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO: number;
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO: number;
  DEFAULT_STAMP_DUTY_MODE: 'BUY' | 'SELL' | 'DOUBLE';
  DEFAULT_STAMP_DUTY_SINGLE_SIDE: 'BUY' | 'SELL';
  DEFAULT_POSITION_COST_MODE: 'DILUTED' | 'AVERAGE_OPEN';
  DEFAULT_TRADE_SETTLEMENT_MODE: 'T0' | 'T1';
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES: boolean;
  DEFAULT_ALLOW_LONG_MARGIN_TRADING: boolean;
  DEFAULT_ALLOW_SHORT_SELLING: boolean;
  resetJobDeadlineMs: number;
  resetRecoveryDeadlineMs: number;
  nowIso: () => string;
  getDatabaseStorageFootprint: () => DatabaseStorageFootprint;
  getMarketStorageFootprint: () => Promise<MarketStorageFootprint>;
  clearMarketData: (options?: {
    signal?: AbortSignal;
  }) => Promise<{ deletedBars: number; deletedInstruments: number }>;
  markTrainingStatsDirty: () => void;
  countDefaultSpecialTrainingQuestionBankSeeds: () => number;
  ensureDefaultSpecialTrainingQuestionBankSeed: (options?: {
    force?: boolean;
  }) => unknown;
  forceReconcileSystemMarketSeedMetadata: (
    deps: {
      updateInstrumentBarCount: (instrumentId: string, barCount: number) => void;
    },
    onProgress?: (completed: number, total: number) => void,
    options?: { signal?: AbortSignal; marketDataAlreadyCleared?: boolean },
  ) => Promise<unknown>;
  getInstrumentBySymbol: (symbol: string) => InstrumentIdentity | undefined;
  updateInstrumentBarCount: (instrumentId: string, barCount: number) => void;
  listAccounts: () => unknown[];
  getTradingSettings: () => unknown;
  listInstruments: () => Promise<Array<{ symbol: string; name: string | null; barCount: number }>>;
  listSystemSeedSymbols: () => string[];
  isLocalDataImportIdle: () => boolean;
  hasActiveHistoryRetentionMaintenanceExecution: () => boolean;
  acquireSourceDiagnosticsQuiesceLease: () => Promise<{ release(): void }>;
  invalidateSourceDiagnosticsRuntimeCaches: () => void;
  acquireMarketPrewarmQuiesceLease: () => Promise<{ release(): void }>;
  invalidateMarketPrewarmRuntime: () => Promise<void>;
  onRecoveryRequired: (
    operationId: string,
    checkpoint: ResetAllDataOperationCheckpoint,
    errorCode: string,
  ) => void;
  runSerializedTrainingMutation: <T>(run: () => Promise<T>) => Promise<T>;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
};

const ERROR_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

const RESET_CHECKPOINT_RANK: Record<ResetAllDataOperationCheckpoint, number> = {
  PREPARED: 0,
  CORE_DATA_COMMITTED: 1,
  MARKET_DATA_CLEARED: 2,
  SEEDS_RECONCILED: 3,
  STORAGE_RECLAIMED: 4,
  VERIFIED: 5,
};

const extractResetAllDataErrorCode = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const code = String((error as { code?: unknown }).code ?? '').trim();
    if (ERROR_CODE_REGEX.test(code)) {
      return code;
    }
  }
  if (error instanceof Error) {
    const messageCode = String(error.message || '').trim();
    if (ERROR_CODE_REGEX.test(messageCode)) {
      return messageCode;
    }
  }
  return 'RESET_ALL_DATA_FAILED';
};

const logResetAllDataFailure = (
  stage: 'PRE_DESTRUCTIVE' | 'POST_DESTRUCTIVE',
  error: unknown
): void => {
  // eslint-disable-next-line no-console
  console.error('[zinuto-reset-all-data] reset failed', {
    stage,
    errorType: error instanceof Error ? error.name : typeof error
  });
  if (error instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(error.stack || error.message);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(error);
};

const acquireQuiesceLeaseBeforeDeadline = async ({
  acquire,
  signal,
}: {
  acquire: () => Promise<{ release(): void }>;
  signal: AbortSignal;
}): Promise<{ release(): void }> => {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      run();
    };
    const handleAbort = (): void => {
      finish(() => reject(signal.reason));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve()
      .then(acquire)
      .then(
        (lease) => {
          if (settled || signal.aborted) {
            lease.release();
            if (!settled) {
              finish(() => reject(signal.reason));
            }
            return;
          }
          finish(() => resolve(lease));
        },
        (error: unknown) => {
          finish(() => reject(error));
        },
      );
  });
};

const acquireQuiesceLeasesBeforeDeadline = async ({
  acquisitions,
  signal,
}: {
  acquisitions: Array<() => Promise<{ release(): void }>>;
  signal: AbortSignal;
}): Promise<Array<{ release(): void }>> => {
  const results = await Promise.allSettled(
    acquisitions.map((acquire) =>
      acquireQuiesceLeaseBeforeDeadline({ acquire, signal }),
    ),
  );
  const leases = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const rejection = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejection) {
    leases.forEach((lease) => lease.release());
    throw rejection.reason;
  }
  return leases;
};

export const createSystemResetOps = (deps: CreateSystemResetOpsDeps) => {
  const {
    db,
    DEFAULT_USER_ID,
    DEFAULT_SECURITIES_ACCOUNT_ID,
    DEFAULT_INITIAL_SECURITIES_BALANCE,
    DEFAULT_INITIAL_BANK_BALANCE,
    DEFAULT_TRADING_ASSET_CLASS,
    DEFAULT_TRADING_MARKET_PRESET_ID,
    DEFAULT_MIN_TRADE_STEP,
    DEFAULT_COMMISSION_RATE,
    DEFAULT_MAKER_FEE_RATE,
    DEFAULT_TAKER_FEE_RATE,
    DEFAULT_FUNDING_RATE,
    DEFAULT_CONTRACT_MULTIPLIER,
    DEFAULT_TRANSFER_FEE_RATE,
    DEFAULT_REGULATORY_FEE_RATE,
    DEFAULT_PLATFORM_FEE_RATE,
    DEFAULT_TRANSACTION_LEVY_RATE,
    DEFAULT_SLIPPAGE_RATE,
    DEFAULT_STAMP_DUTY_RATE,
    DEFAULT_COMMISSION_MINIMUM_FEE,
    DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
    DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
    DEFAULT_LONG_FINANCING_ANNUAL_RATE,
    DEFAULT_LONG_INITIAL_MARGIN_RATIO,
    DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
    DEFAULT_SHORT_BORROW_ANNUAL_RATE,
    DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
    DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
    DEFAULT_STAMP_DUTY_MODE,
    DEFAULT_STAMP_DUTY_SINGLE_SIDE,
    DEFAULT_POSITION_COST_MODE,
    DEFAULT_TRADE_SETTLEMENT_MODE,
    DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
    DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
    DEFAULT_ALLOW_LONG_MARGIN_TRADING,
    DEFAULT_ALLOW_SHORT_SELLING,
    resetJobDeadlineMs,
    resetRecoveryDeadlineMs,
    nowIso,
    getDatabaseStorageFootprint,
    getMarketStorageFootprint,
    clearMarketData,
    markTrainingStatsDirty,
    countDefaultSpecialTrainingQuestionBankSeeds,
    ensureDefaultSpecialTrainingQuestionBankSeed,
    forceReconcileSystemMarketSeedMetadata,
    updateInstrumentBarCount,
    listAccounts,
    getTradingSettings,
    listInstruments,
    listSystemSeedSymbols,
    isLocalDataImportIdle,
    hasActiveHistoryRetentionMaintenanceExecution,
    acquireSourceDiagnosticsQuiesceLease,
    invalidateSourceDiagnosticsRuntimeCaches,
    acquireMarketPrewarmQuiesceLease,
    invalidateMarketPrewarmRuntime,
    onRecoveryRequired,
    runSerializedTrainingMutation
  } = deps;

  const systemResetStore = createSystemResetStore({ db });
  const systemResetJournalStore = createSystemResetJournalStore({ db });

  const ensureBacktestIdle = (): void => {
    const activeBatch = systemResetStore.readActiveBacktestBatch();
    if (activeBatch) {
      throw appError(
        'BACKTEST_BATCH_ACTIVE',
        { batchId: activeBatch.id, status: activeBatch.status },
        409,
      );
    }
  };

  const ensureLocalDataImportsIdle = (): void => {
    if (
      !isLocalDataImportIdle() ||
      hasActiveLocalDataImportPreviewExecutions()
    ) {
      throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE');
    }
  };

  const ensureSystemDevSimulationIdle = (): void => {
    if (
      hasActiveSystemDevSimulationJob() ||
      hasActiveSystemDevSimulationTaskExecution()
    ) {
      throw appError('SYSTEM_DEV_SIMULATION_JOB_ACTIVE', {}, 409);
    }
    if (
      hasActiveSystemDevSimulationCleanupJob() ||
      isSystemDevSimulationCleanupExecutionActive()
    ) {
      throw appError('SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE', {}, 409);
    }
  };

  const ensureHistoryRetentionIdle = (): void => {
    if (hasActiveHistoryRetentionMaintenanceExecution()) {
      throw appError('HISTORY_RETENTION_JOB_ACTIVE', {}, 409);
    }
  };

  const verifyResetAllStoredDataPostState = async (): Promise<void> => {
    const defaultSpecialTrainingBankCount =
      countDefaultSpecialTrainingQuestionBankSeeds();
    const {
      remaining,
      baseline,
      systemInstrumentRows,
    } = systemResetStore.readResetAllStoredDataPostState({
      defaultUserId: DEFAULT_USER_ID,
      defaultSecuritiesAccountId: DEFAULT_SECURITIES_ACCOUNT_ID,
      defaultSpecialTrainingBankCount,
    });
    const expectedSystemSymbols = new Set(
      listSystemSeedSymbols().map((symbol) => String(symbol || "").trim().toUpperCase()),
    );
    const availableSystemSymbols = new Set(
      systemInstrumentRows
        .map((row) => String(row.symbol ?? "").trim().toUpperCase())
        .filter(Boolean),
    );
    const missingSystemSymbols = Array.from(expectedSystemSymbols).filter(
      (symbol) => !availableSystemSymbols.has(symbol),
    );
    const barlessSystemSymbols = systemInstrumentRows
      .filter((row) => Math.max(0, Math.floor(Number(row.bar_count ?? 0) || 0)) <= 0)
      .map((row) => String(row.symbol ?? "").trim().toUpperCase())
      .filter(Boolean);

    const hasUnexpectedRemainders = Object.values(remaining).some((count) => count > 0);
    const hasBaselineGap = Object.values(baseline).some((count) => count !== 1);
    const hasSystemSeedGap =
      missingSystemSymbols.length > 0 ||
      barlessSystemSymbols.length > 0 ||
      systemInstrumentRows.length !== expectedSystemSymbols.size;

    if (!hasUnexpectedRemainders && !hasBaselineGap && !hasSystemSeedGap) {
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[zinuto-reset-all-data] post-reset verification failed", {
      remaining,
      baseline,
      missingSystemSymbols,
      barlessSystemSymbols,
      expectedSystemSeedCount: expectedSystemSymbols.size,
      actualSystemSeedCount: systemInstrumentRows.length,
    });
    throw appError("RESET_ALL_DATA_PARTIAL_FAILED", {
      stage: "POST_VERIFY",
      cause: "RESET_STATE_INVALID",
    });
  };

  const resolveStampDutyStorageByMode = (
    mode: 'BUY' | 'SELL' | 'DOUBLE'
  ): { mode: 'SINGLE' | 'DOUBLE'; singleSide: 'BUY' | 'SELL' } => {
    if (mode === 'DOUBLE') {
      return { mode: 'DOUBLE', singleSide: 'SELL' };
    }
    if (mode === 'BUY') {
      return { mode: 'SINGLE', singleSide: 'BUY' };
    }
    return { mode: 'SINGLE', singleSide: DEFAULT_STAMP_DUTY_SINGLE_SIDE };
  };

  const ensureNoIncompleteResetOperation = (): void => {
    const incomplete = systemResetJournalStore.readIncompleteOperation();
    if (!incomplete) {
      return;
    }
    throw appError(
      'RESET_ALL_DATA_PARTIAL_FAILED',
      {
        stage: 'RECOVERY_REQUIRED',
        operationId: incomplete.id,
        checkpoint: incomplete.checkpoint,
      },
      409,
    );
  };

  const hasReachedCheckpoint = (
    current: ResetAllDataOperationCheckpoint,
    target: ResetAllDataOperationCheckpoint,
  ): boolean => RESET_CHECKPOINT_RANK[current] >= RESET_CHECKPOINT_RANK[target];

  const completePostCommitResetPhases = async ({
    operationId,
    checkpoint,
    reportModule,
    signal,
  }: {
    operationId: string;
    checkpoint: ResetAllDataOperationCheckpoint;
    reportModule: ResetAllDataReporter;
    signal?: AbortSignal;
  }): Promise<{
    marketResetResult: { deletedBars: number; deletedInstruments: number };
    storageFootprint: DatabaseStorageFootprint;
    marketFootprint: MarketStorageFootprint;
  }> => {
    let currentCheckpoint = checkpoint;
    let marketResetResult = { deletedBars: 0, deletedInstruments: 0 };

    signal?.throwIfAborted();
    if (!hasReachedCheckpoint(currentCheckpoint, 'MARKET_DATA_CLEARED')) {
      reportModule('marketDataBytes', 48, 'RUNNING');
      marketResetResult = await clearMarketData({ signal });
      signal?.throwIfAborted();
      systemResetJournalStore.markCheckpoint({
        operationId,
        checkpoint: 'MARKET_DATA_CLEARED',
        updatedAt: nowIso(),
      });
      currentCheckpoint = 'MARKET_DATA_CLEARED';
    }

    markTrainingStatsDirty();
    if (!hasReachedCheckpoint(currentCheckpoint, 'SEEDS_RECONCILED')) {
      reportModule('marketDataBytes', 62, 'RUNNING');
      await forceReconcileSystemMarketSeedMetadata(
        { updateInstrumentBarCount },
        (completed, total) => {
          reportModule(
            'marketDataBytes',
            total <= 0 ? 92 : 62 + (completed / total) * 30,
            'RUNNING',
          );
        },
        { signal, marketDataAlreadyCleared: true },
      );
      signal?.throwIfAborted();
      ensureDefaultSpecialTrainingQuestionBankSeed({ force: true });
      systemResetJournalStore.markCheckpoint({
        operationId,
        checkpoint: 'SEEDS_RECONCILED',
        updatedAt: nowIso(),
      });
      currentCheckpoint = 'SEEDS_RECONCILED';
    }

    reportModule('systemSettingsBytes', 100, 'SUCCESS');
    reportModule('marketDataBytes', 96, 'RUNNING');
    const storageFootprint = getDatabaseStorageFootprint();
    const marketFootprint = await getMarketStorageFootprint();
    signal?.throwIfAborted();
    await verifyResetAllStoredDataPostState();
    signal?.throwIfAborted();
    return { marketResetResult, storageFootprint, marketFootprint };
  };

  const resetAllStoredDataInternal = async (onProgress?: ResetAllDataProgressCallback) =>
    runSerializedTrainingMutation(async () => {
      if (!tryAcquireSystemResetExecution()) {
        throw appError('SYSTEM_RESET_IN_PROGRESS');
      }
      const resetAbortController = new AbortController();
      const resetDeadlineTimer = setTimeout(() => {
        resetAbortController.abort(
          appError(
            'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
            { deadlineMs: resetJobDeadlineMs },
            408,
          ),
        );
      }, resetJobDeadlineMs);
      resetDeadlineTimer.unref();
      const reportModule: ResetAllDataReporter = (
        moduleKey,
        progressPercent,
        status = 'RUNNING',
      ) => {
        onProgress?.(moduleKey, clampPercent(progressPercent), status);
      };
      let operationId: string | null = null;
      let destructiveChangesCommitted = false;
      let recoveryRequiredCheckpoint: ResetAllDataOperationCheckpoint | null = null;
      let diagnosticsQuiesceLease: { release(): void } | null = null;
      let marketPrewarmQuiesceLease: { release(): void } | null = null;

      try {
        resetAbortController.signal.throwIfAborted();
        ensureNoIncompleteResetOperation();
        ensureLocalDataImportsIdle();
        if (systemResetStore.hasActiveLocalDataSourceMutation()) {
          throw appError('LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS', {}, 409);
        }
        ensureBacktestIdle();
        ensureSystemDevSimulationIdle();
        ensureHistoryRetentionIdle();
        resetAbortController.signal.throwIfAborted();
        const createdOperationId = createId();
        operationId = createdOperationId;
        const operationCreatedAt = nowIso();
        systemResetJournalStore.createPreparedOperation({
          operationId: createdOperationId,
          createdAt: operationCreatedAt,
        });
        [diagnosticsQuiesceLease, marketPrewarmQuiesceLease] =
          await acquireQuiesceLeasesBeforeDeadline({
          acquisitions: [
            acquireSourceDiagnosticsQuiesceLease,
            acquireMarketPrewarmQuiesceLease,
          ],
          signal: resetAbortController.signal,
        });
        resetAbortController.signal.throwIfAborted();
        const storageFootprintBefore = getDatabaseStorageFootprint();
        const marketFootprintBefore = await getMarketStorageFootprint();
        resetAbortController.signal.throwIfAborted();
        reportModule('trainingDataBytes', 5, 'RUNNING');
        reportModule('replayNotesBytes', 5, 'RUNNING');
        reportModule('statsDataBytes', 5, 'RUNNING');
        reportModule('systemSettingsBytes', 5, 'RUNNING');
        reportModule('marketDataBytes', 5, 'RUNNING');

        const defaultStampDutyStorage = resolveStampDutyStorageByMode(
          DEFAULT_STAMP_DUTY_MODE,
        );
        const result = systemResetStore.runResetAllStoredDataMutation({
          defaultUserId: DEFAULT_USER_ID,
          defaultSecuritiesAccountId: DEFAULT_SECURITIES_ACCOUNT_ID,
          initialSecuritiesBalance: DEFAULT_INITIAL_SECURITIES_BALANCE,
          initialBankBalance: DEFAULT_INITIAL_BANK_BALANCE,
          assetClass: DEFAULT_TRADING_ASSET_CLASS,
          marketPresetId: DEFAULT_TRADING_MARKET_PRESET_ID,
          minTradeStep: DEFAULT_MIN_TRADE_STEP,
          commissionRate: DEFAULT_COMMISSION_RATE,
          makerFeeRate: DEFAULT_MAKER_FEE_RATE,
          takerFeeRate: DEFAULT_TAKER_FEE_RATE,
          fundingRate: DEFAULT_FUNDING_RATE,
          contractMultiplier: DEFAULT_CONTRACT_MULTIPLIER,
          transferFeeRate: DEFAULT_TRANSFER_FEE_RATE,
          regulatoryFeeRate: DEFAULT_REGULATORY_FEE_RATE,
          platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
          transactionLevyRate: DEFAULT_TRANSACTION_LEVY_RATE,
          slippageRate: DEFAULT_SLIPPAGE_RATE,
          stampDutyRate: DEFAULT_STAMP_DUTY_RATE,
          commissionMinimumFee: DEFAULT_COMMISSION_MINIMUM_FEE,
          platformFeeMinimumFee: DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
          transactionLevyMinimumFee: DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
          longFinancingAnnualRate: DEFAULT_LONG_FINANCING_ANNUAL_RATE,
          longInitialMarginRatio: DEFAULT_LONG_INITIAL_MARGIN_RATIO,
          longMaintenanceMarginRatio: DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
          shortBorrowAnnualRate: DEFAULT_SHORT_BORROW_ANNUAL_RATE,
          shortInitialMarginRatio: DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
          shortMaintenanceMarginRatio: DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
          stampDutyMode: defaultStampDutyStorage.mode,
          stampDutySingleSide: defaultStampDutyStorage.singleSide,
          positionCostMode: DEFAULT_POSITION_COST_MODE,
          tradeSettlementMode: DEFAULT_TRADE_SETTLEMENT_MODE,
          freeReplayEndSettlementMode: DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
          tradeAmountIncludesFees: DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
          allowLongMarginTrading: DEFAULT_ALLOW_LONG_MARGIN_TRADING,
          allowShortSelling: DEFAULT_ALLOW_SHORT_SELLING,
          updatedAt: nowIso(),
          ensureLocalDataImportIdle: ensureLocalDataImportsIdle,
          ensureBacktestIdle,
          ensureSystemDevSimulationIdle,
          ensureHistoryRetentionIdle,
          createLocalDataSourceMutationInProgressError: () =>
            appError('LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS', {}, 409),
          markCoreDataCommitted: () => {
            systemResetJournalStore.markCheckpoint({
              operationId: createdOperationId,
              checkpoint: 'CORE_DATA_COMMITTED',
              updatedAt: nowIso(),
            });
          },
          reportModule,
        });
        destructiveChangesCommitted = true;
        invalidateSourceDiagnosticsRuntimeCaches();
        SYSTEM_DEV_SIMULATION_JOBS.clear();
        clearInactiveSystemDevSimulationCleanupJobState();
        await invalidateMarketPrewarmRuntime();
        resetAbortController.signal.throwIfAborted();
        const postCommit = await completePostCommitResetPhases({
          operationId: createdOperationId,
          checkpoint: 'CORE_DATA_COMMITTED',
          reportModule,
          signal: resetAbortController.signal,
        });
        const instruments = await listInstruments();
        resetAbortController.signal.throwIfAborted();
        const completedResult = {
          ...result,
          marketResetResult: postCommit.marketResetResult,
          resetAt: nowIso(),
          accounts: listAccounts(),
          tradingSettings: getTradingSettings(),
          instruments,
          storageFootprintBefore,
          marketFootprintBefore,
          storageFootprint: postCommit.storageFootprint,
          marketFootprint: postCommit.marketFootprint,
          storageReclaimedBytes: Math.max(
            0,
            storageFootprintBefore.totalBytes -
              postCommit.storageFootprint.totalBytes,
          ),
          marketReclaimedBytes: Math.max(
            0,
            marketFootprintBefore.totalBytes - postCommit.marketFootprint.totalBytes,
          ),
        };
        reportModule('marketDataBytes', 100, 'SUCCESS');
        systemResetJournalStore.markSucceeded(createdOperationId, nowIso());
        clearSystemResetRecoveryWriteBarrier();
        return completedResult;
      } catch (error) {
        const resetErrorCode = extractResetAllDataErrorCode(error);
        if (operationId) {
          try {
            const incomplete = systemResetJournalStore.readIncompleteOperation();
            if (incomplete?.id === operationId) {
              destructiveChangesCommitted =
                destructiveChangesCommitted ||
                hasReachedCheckpoint(
                  incomplete.checkpoint,
                  'CORE_DATA_COMMITTED',
                );
              if (destructiveChangesCommitted) {
                recoveryRequiredCheckpoint = incomplete.checkpoint;
                systemResetJournalStore.markRecoveryRequired(
                  operationId,
                  resetErrorCode,
                  nowIso(),
                );
              } else {
                systemResetJournalStore.markAborted(operationId, nowIso());
              }
            }
          } catch (journalError) {
            logResetAllDataFailure('POST_DESTRUCTIVE', journalError);
          }
        }
        if (operationId && destructiveChangesCommitted) {
          activateSystemResetRecoveryWriteBarrier();
          recoveryRequiredCheckpoint ??= 'CORE_DATA_COMMITTED';
          try {
            onRecoveryRequired(
              operationId,
              recoveryRequiredCheckpoint,
              resetErrorCode,
            );
          } catch (blockError) {
            logResetAllDataFailure('POST_DESTRUCTIVE', blockError);
          }
        }
        const stage = destructiveChangesCommitted
          ? 'POST_DESTRUCTIVE'
          : 'PRE_DESTRUCTIVE';
        logResetAllDataFailure(stage, error);
        if (isAppError(error)) {
          if (
            destructiveChangesCommitted &&
            error.code !== 'RESET_ALL_DATA_PARTIAL_FAILED'
          ) {
            throw appError('RESET_ALL_DATA_PARTIAL_FAILED', {
              stage,
              cause: error.code,
              operationId,
              checkpoint: recoveryRequiredCheckpoint,
            });
          }
          throw error;
        }
        if (destructiveChangesCommitted) {
          throw appError('RESET_ALL_DATA_PARTIAL_FAILED', {
            stage,
            cause: resetErrorCode,
            operationId,
            checkpoint: recoveryRequiredCheckpoint,
          });
        }
        throw appError('RESET_ALL_DATA_FAILED', { stage });
      } finally {
        clearTimeout(resetDeadlineTimer);
        marketPrewarmQuiesceLease?.release();
        diagnosticsQuiesceLease?.release();
        releaseSystemResetExecution();
      }
    });

  const recoverInterruptedResetAllStoredData = async (): Promise<ResetAllStoredDataRecoveryResult> => {
    let interrupted;
    try {
      interrupted = systemResetJournalStore.readIncompleteOperation();
    } catch {
      return {
        status: 'BLOCKED',
        operationId: null,
        checkpoint: null,
        errorCode: 'RESET_ALL_DATA_JOURNAL_READ_FAILED',
      };
    }
    if (!interrupted) {
      return {
        status: 'NONE',
        operationId: null,
        checkpoint: null,
        errorCode: null,
      };
    }

    if (interrupted.checkpoint === 'PREPARED') {
      try {
        // CORE_DATA_COMMITTED is written inside the destructive SQLite
        // transaction. PREPARED therefore proves that transaction did not commit.
        systemResetJournalStore.markAborted(interrupted.id, nowIso());
        clearSystemResetRecoveryWriteBarrier();
        return {
          status: 'ABORTED',
          operationId: interrupted.id,
          checkpoint: interrupted.checkpoint,
          errorCode: null,
        };
      } catch {
        return {
          status: 'BLOCKED',
          operationId: interrupted.id,
          checkpoint: interrupted.checkpoint,
          errorCode: 'RESET_ALL_DATA_JOURNAL_UPDATE_FAILED',
        };
      }
    }

    return runSerializedTrainingMutation(async () => {
      if (!tryAcquireSystemResetRecoveryExecution()) {
        return {
          status: 'BLOCKED',
          operationId: interrupted.id,
          checkpoint: interrupted.checkpoint,
          errorCode: 'SYSTEM_RESET_IN_PROGRESS',
        };
      }
      const recoveryAbortController = new AbortController();
      const recoveryDeadlineTimer = setTimeout(() => {
        recoveryAbortController.abort(
          appError('RESET_ALL_DATA_RECOVERY_DEADLINE_EXCEEDED', {
            deadlineMs: resetRecoveryDeadlineMs,
          }),
        );
      }, resetRecoveryDeadlineMs);
      recoveryDeadlineTimer.unref();
      let diagnosticsQuiesceLease: { release(): void } | null = null;
      let marketPrewarmQuiesceLease: { release(): void } | null = null;
      try {
        [diagnosticsQuiesceLease, marketPrewarmQuiesceLease] =
          await acquireQuiesceLeasesBeforeDeadline({
          acquisitions: [
            acquireSourceDiagnosticsQuiesceLease,
            acquireMarketPrewarmQuiesceLease,
          ],
          signal: recoveryAbortController.signal,
        });
        recoveryAbortController.signal.throwIfAborted();
        invalidateSourceDiagnosticsRuntimeCaches();
        await invalidateMarketPrewarmRuntime();
        recoveryAbortController.signal.throwIfAborted();
        systemResetJournalStore.beginRecovery(interrupted.id, nowIso());
        await completePostCommitResetPhases({
          operationId: interrupted.id,
          checkpoint: interrupted.checkpoint,
          reportModule: () => undefined,
          signal: recoveryAbortController.signal,
        });
        systemResetJournalStore.markSucceeded(interrupted.id, nowIso());
        clearSystemResetRecoveryWriteBarrier();
        return {
          status: 'RECOVERED',
          operationId: interrupted.id,
          checkpoint: 'VERIFIED',
          errorCode: null,
        };
      } catch (error) {
        activateSystemResetRecoveryWriteBarrier();
        const errorCode = extractResetAllDataErrorCode(error);
        logResetAllDataFailure('POST_DESTRUCTIVE', error);
        try {
          systemResetJournalStore.markBlocked(
            interrupted.id,
            errorCode,
            nowIso(),
          );
        } catch (journalError) {
          logResetAllDataFailure('POST_DESTRUCTIVE', journalError);
        }
        let currentCheckpoint = interrupted.checkpoint;
        try {
          const current = systemResetJournalStore.readIncompleteOperation();
          if (current?.id === interrupted.id) {
            currentCheckpoint = current.checkpoint;
          }
        } catch {
          // Preserve the last known durable checkpoint in the startup status.
        }
        return {
          status: 'BLOCKED',
          operationId: interrupted.id,
          checkpoint: currentCheckpoint,
          errorCode,
        };
      } finally {
        clearTimeout(recoveryDeadlineTimer);
        marketPrewarmQuiesceLease?.release();
        diagnosticsQuiesceLease?.release();
        releaseSystemResetExecution();
      }
    });
  };

  const startResetAllStoredDataJob = (): ResetAllDataJobSnapshot => {
    if (isSystemResetExecutionActive()) {
      throw appError('SYSTEM_RESET_IN_PROGRESS');
    }
    ensureNoIncompleteResetOperation();
    ensureLocalDataImportsIdle();
    if (systemResetStore.hasActiveLocalDataSourceMutation()) {
      throw appError('LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS', {}, 409);
    }
    ensureBacktestIdle();
    ensureSystemDevSimulationIdle();
    ensureHistoryRetentionIdle();
    return startResetAllStoredDataJobState({
      runResetAllStoredData: resetAllStoredDataInternal,
      extractErrorCode: extractResetAllDataErrorCode
    });
  };

  const getResetAllStoredDataJob = (jobId: string): ResetAllDataJobSnapshot => {
    return getResetAllStoredDataJobState(jobId);
  };

  const resetAllStoredData = async () => resetAllStoredDataInternal();

  return {
    recoverInterruptedResetAllStoredData,
    resetAllStoredData,
    startResetAllStoredDataJob,
    getResetAllStoredDataJob
  };
};
