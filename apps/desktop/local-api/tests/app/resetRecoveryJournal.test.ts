// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  blockBackendForResetRecovery,
  ensureBackendStartupReady,
} from '../../src/application/trading/resetRecoveryRuntimeBlock.js';
import { isRequestAllowedWhileStartupBlocked } from '../../src/runtime/startupBlockedRequestPolicy.js';
import {
  getBackendStartupStatus,
  setBackendStartupStatus,
} from '../../src/runtime/startupStatus.js';
import {
  clearSystemResetRecoveryWriteBarrier,
  isSystemResetExecutionActive,
  isSystemResetRecoveryWriteBarrierActive,
  tryAcquireSystemResetExecution,
} from '../../src/application/trading/resetExecutionState.js';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-reset-recovery-journal-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { createSystemResetOps },
  { createSystemResetJournalStore },
  { schemaSql },
  { closeLocalDatabase },
] = await Promise.all([
  import('../../src/application/trading/systemResetCore.js'),
  import('../../src/infrastructure/db/trading/systemResetJournalStore.js'),
  import('../../src/infrastructure/db/database/schemaSql.js'),
  import('../../src/infrastructure/db/database.js'),
]);

test.after(async () => {
  closeLocalDatabase();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 50,
  });
});

const EMPTY_FOOTPRINT = {
  dbBytes: 0,
  walBytes: 0,
  shmBytes: 0,
  totalBytes: 0,
};

type ResetFailureControls = {
  failMarketClear?: boolean;
  failSeedReconcile?: boolean;
  hangMarketClearUntilAbort?: boolean;
  delayDiagnosticsQuiesce?: boolean;
  resetJobDeadlineMs?: number;
  recoveryDeadlineMs?: number;
  historyRetentionActive?: boolean;
  onRecoveryRequired?: typeof blockBackendForResetRecovery;
};

const createResetFixture = (controls: ResetFailureControls = {}) => {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  let clock = 0;
  let marketClearCalls = 0;
  let seedReconcileCalls = 0;
  let diagnosticsQuiesceAcquireCalls = 0;
  let diagnosticsQuiesceReleaseCalls = 0;
  let diagnosticsInvalidateCalls = 0;
  let marketQuiesceAcquireCalls = 0;
  let marketQuiesceReleaseCalls = 0;
  let marketInvalidateCalls = 0;
  let releaseDiagnosticsQuiesceAcquisition: (() => void) | null = null;
  const mutableControls = { ...controls };

  const ops = createSystemResetOps({
    db,
    DEFAULT_USER_ID: 'reset-recovery-user',
    DEFAULT_SECURITIES_ACCOUNT_ID: 'reset-recovery-securities',
    DEFAULT_INITIAL_SECURITIES_BALANCE: 50_000,
    DEFAULT_INITIAL_BANK_BALANCE: 100_000,
    DEFAULT_TRADING_ASSET_CLASS: 'STOCK',
    DEFAULT_TRADING_MARKET_PRESET_ID: 'A_SHARE',
    DEFAULT_MIN_TRADE_STEP: 100,
    DEFAULT_COMMISSION_RATE: 0.03,
    DEFAULT_MAKER_FEE_RATE: 0,
    DEFAULT_TAKER_FEE_RATE: 0.03,
    DEFAULT_FUNDING_RATE: 0,
    DEFAULT_CONTRACT_MULTIPLIER: 1,
    DEFAULT_TRANSFER_FEE_RATE: 0.001,
    DEFAULT_REGULATORY_FEE_RATE: 0.002,
    DEFAULT_PLATFORM_FEE_RATE: 0,
    DEFAULT_TRANSACTION_LEVY_RATE: 0,
    DEFAULT_SLIPPAGE_RATE: 0,
    DEFAULT_STAMP_DUTY_RATE: 0.1,
    DEFAULT_COMMISSION_MINIMUM_FEE: 0,
    DEFAULT_PLATFORM_FEE_MINIMUM_FEE: 0,
    DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE: 0,
    DEFAULT_LONG_FINANCING_ANNUAL_RATE: 0,
    DEFAULT_LONG_INITIAL_MARGIN_RATIO: 100,
    DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO: 100,
    DEFAULT_SHORT_BORROW_ANNUAL_RATE: 7.5,
    DEFAULT_SHORT_INITIAL_MARGIN_RATIO: 150,
    DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO: 30,
    DEFAULT_STAMP_DUTY_MODE: 'SELL',
    DEFAULT_STAMP_DUTY_SINGLE_SIDE: 'SELL',
    DEFAULT_POSITION_COST_MODE: 'DILUTED',
    DEFAULT_TRADE_SETTLEMENT_MODE: 'T0',
    DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE: 'FORCE_CLOSE',
    DEFAULT_TRADE_AMOUNT_INCLUDES_FEES: false,
    DEFAULT_ALLOW_LONG_MARGIN_TRADING: false,
    DEFAULT_ALLOW_SHORT_SELLING: false,
    resetJobDeadlineMs: mutableControls.resetJobDeadlineMs ?? 1_000,
    resetRecoveryDeadlineMs: mutableControls.recoveryDeadlineMs ?? 1_000,
    nowIso: () =>
      new Date(Date.UTC(2026, 6, 16, 0, 0, clock++)).toISOString(),
    getDatabaseStorageFootprint: () => ({ ...EMPTY_FOOTPRINT }),
    getMarketStorageFootprint: async () => ({ ...EMPTY_FOOTPRINT }),
    clearMarketData: async (options = {}) => {
      marketClearCalls += 1;
      options.signal?.throwIfAborted();
      if (mutableControls.hangMarketClearUntilAbort) {
        await new Promise<never>((_resolve, reject) => {
          const rejectWithAbort = () =>
            reject(options.signal?.reason ?? new Error('RESET_RECOVERY_ABORTED'));
          options.signal?.addEventListener('abort', rejectWithAbort, {
            once: true,
          });
        });
      }
      if (mutableControls.failMarketClear) {
        throw new Error('MARKET_CLEAR_INTERRUPTED');
      }
      return { deletedBars: 7, deletedInstruments: 2 };
    },
    markTrainingStatsDirty: () => undefined,
    countDefaultSpecialTrainingQuestionBankSeeds: () => 1,
    ensureDefaultSpecialTrainingQuestionBankSeed: () => ({ id: 'default' }),
    forceReconcileSystemMarketSeedMetadata: async (
      _deps,
      _onProgress,
      options = {},
    ) => {
      seedReconcileCalls += 1;
      options.signal?.throwIfAborted();
      if (mutableControls.failSeedReconcile) {
        throw new Error('SYSTEM_SEED_RECONCILE_INTERRUPTED');
      }
    },
    getInstrumentBySymbol: () => undefined,
    updateInstrumentBarCount: () => undefined,
    listAccounts: () => [],
    getTradingSettings: () => ({}),
    listInstruments: async () => [],
    listSystemSeedSymbols: () => [],
    isLocalDataImportIdle: () => true,
    hasActiveHistoryRetentionMaintenanceExecution: () =>
      Boolean(mutableControls.historyRetentionActive),
    acquireSourceDiagnosticsQuiesceLease: async () => {
      diagnosticsQuiesceAcquireCalls += 1;
      if (mutableControls.delayDiagnosticsQuiesce) {
        await new Promise<void>((resolve) => {
          releaseDiagnosticsQuiesceAcquisition = resolve;
        });
      }
      return {
        release: () => {
          diagnosticsQuiesceReleaseCalls += 1;
        },
      };
    },
    invalidateSourceDiagnosticsRuntimeCaches: () => {
      diagnosticsInvalidateCalls += 1;
    },
    acquireMarketPrewarmQuiesceLease: async () => {
      marketQuiesceAcquireCalls += 1;
      return {
        release: () => {
          marketQuiesceReleaseCalls += 1;
        },
      };
    },
    invalidateMarketPrewarmRuntime: async () => {
      marketInvalidateCalls += 1;
    },
    onRecoveryRequired: mutableControls.onRecoveryRequired ?? (() => undefined),
    runSerializedTrainingMutation: async (run) => run(),
  });

  return {
    db,
    ops,
    controls: mutableControls,
    releaseDiagnosticsQuiesceAcquisition: () => {
      releaseDiagnosticsQuiesceAcquisition?.();
      releaseDiagnosticsQuiesceAcquisition = null;
    },
    journal: createSystemResetJournalStore({ db }),
    counts: {
      marketClear: () => marketClearCalls,
      seedReconcile: () => seedReconcileCalls,
      diagnosticsQuiesceAcquire: () => diagnosticsQuiesceAcquireCalls,
      diagnosticsQuiesceRelease: () => diagnosticsQuiesceReleaseCalls,
      diagnosticsInvalidate: () => diagnosticsInvalidateCalls,
      marketQuiesceAcquire: () => marketQuiesceAcquireCalls,
      marketQuiesceRelease: () => marketQuiesceReleaseCalls,
      marketInvalidate: () => marketInvalidateCalls,
    },
  };
};

const readOperationStatus = (db: Database.Database) =>
  db
    .prepare(
      `SELECT status, checkpoint, recovery_attempts, error_code
         FROM system_reset_operations
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .get() as {
    status: string;
    checkpoint: string;
    recovery_attempts: number;
    error_code: string | null;
  };

const waitForResetJobTerminal = async (
  fixture: ReturnType<typeof createResetFixture>,
  jobId: string,
) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = fixture.ops.getResetAllStoredDataJob(jobId);
    if (snapshot.status === 'SUCCESS' || snapshot.status === 'FAILED') {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return fixture.ops.getResetAllStoredDataJob(jobId);
};

test('ordinary reset deadline aborts before destructive work and releases a late diagnostics lease', async () => {
  const fixture = createResetFixture({
    delayDiagnosticsQuiesce: true,
    resetJobDeadlineMs: 20,
  });
  try {
    const startedAt = Date.now();
    await assert.rejects(
      () => fixture.ops.resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code ===
          'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
    );
    assert.ok(Date.now() - startedAt < 500);
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'ABORTED',
      checkpoint: 'PREPARED',
      recovery_attempts: 0,
      error_code: null,
    });
    assert.equal(fixture.counts.marketClear(), 0);
    assert.equal(fixture.counts.diagnosticsQuiesceRelease(), 0);

    fixture.releaseDiagnosticsQuiesceAcquisition();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(fixture.counts.diagnosticsQuiesceRelease(), 1);
  } finally {
    clearSystemResetRecoveryWriteBarrier();
    fixture.db.close();
  }
});

test('post-commit reset deadline requires recovery, blocks normal APIs, and remains observable', async () => {
  const previousStartupStatus = getBackendStartupStatus();
  const fixture = createResetFixture({
    hangMarketClearUntilAbort: true,
    resetJobDeadlineMs: 20,
    onRecoveryRequired: blockBackendForResetRecovery,
  });
  try {
    const created = fixture.ops.startResetAllStoredDataJob();
    const failed = await waitForResetJobTerminal(fixture, created.id);

    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.errorCode, 'RESET_ALL_DATA_PARTIAL_FAILED');
    assert.equal(
      failed.errorArgs?.cause,
      'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
    );
    assert.equal(failed.errorArgs?.checkpoint, 'CORE_DATA_COMMITTED');
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'RECOVERY_REQUIRED',
      checkpoint: 'CORE_DATA_COMMITTED',
      recovery_attempts: 0,
      error_code: 'RESET_ALL_DATA_JOB_DEADLINE_EXCEEDED',
    });

    const blockedStatus = getBackendStartupStatus();
    assert.equal(blockedStatus.mode, 'BLOCKED');
    assert.equal(blockedStatus.startupAllowed, false);
    assert.equal(blockedStatus.blockReason, 'LOCAL_DATA_NEEDS_ATTENTION');
    assert.equal(
      blockedStatus.blockDetails.issueReason,
      'RESET_RECOVERY_BLOCKED',
    );
    assert.equal(isSystemResetRecoveryWriteBarrierActive(), true);
    assert.equal(isSystemResetExecutionActive(), true);
    assert.equal(tryAcquireSystemResetExecution(), false);
    assert.throws(
      () => ensureBackendStartupReady(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'SYSTEM_STARTUP_BLOCKED' &&
        (error as { status?: unknown }).status === 503 &&
        (error as { args?: { issueReason?: unknown } }).args?.issueReason ===
          'RESET_RECOVERY_BLOCKED',
    );
    assert.equal(
      isRequestAllowedWhileStartupBlocked({
        method: 'GET',
        path: '/training/projects',
        startupStatus: blockedStatus,
      }),
      false,
    );
    assert.equal(
      isRequestAllowedWhileStartupBlocked({
        method: 'POST',
        path: '/system/reset-all-data/start',
        startupStatus: blockedStatus,
      }),
      false,
    );
    assert.equal(
      isRequestAllowedWhileStartupBlocked({
        method: 'GET',
        path: `/system/reset-all-data/jobs/${created.id}`,
        startupStatus: blockedStatus,
      }),
      true,
    );
    assert.equal(
      isRequestAllowedWhileStartupBlocked({
        method: 'POST',
        path: '/system/startup-local-data/reinitialize',
        startupStatus: blockedStatus,
      }),
      false,
    );
  } finally {
    clearSystemResetRecoveryWriteBarrier();
    setBackendStartupStatus(previousStartupStatus);
    fixture.db.close();
  }
});

test('successful ordinary reset returns current footprints without synchronous deep maintenance', async () => {
  const fixture = createResetFixture();
  try {
    const result = await fixture.ops.resetAllStoredData();
    assert.deepEqual(result.storageFootprint, EMPTY_FOOTPRINT);
    assert.deepEqual(result.marketFootprint, EMPTY_FOOTPRINT);
    assert.equal(result.storageReclaimedBytes, 0);
    assert.equal(result.marketReclaimedBytes, 0);
    assert.equal(readOperationStatus(fixture.db).status, 'SUCCESS');

    const resetCoreSource = fs.readFileSync(
      new URL('../../src/application/trading/systemResetCore.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(resetCoreSource, /deepCompactMode|runMarketMaintenance|reclaimDatabaseStorage/u);
  } finally {
    clearSystemResetRecoveryWriteBarrier();
    fixture.db.close();
  }
});

test('one-click reset cannot overtake manual history retention maintenance', async () => {
  const fixture = createResetFixture({ historyRetentionActive: true });
  try {
    await assert.rejects(
      () => fixture.ops.resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'HISTORY_RETENTION_JOB_ACTIVE',
    );
    assert.equal(fixture.counts.marketQuiesceAcquire(), 0);
    assert.equal(fixture.counts.diagnosticsQuiesceAcquire(), 0);
  } finally {
    clearSystemResetRecoveryWriteBarrier();
    fixture.db.close();
  }
});

test('startup recovery re-enters after SQLite commits but DuckDB clear is interrupted', async () => {
  const fixture = createResetFixture({ failMarketClear: true });
  try {
    await assert.rejects(
      () => fixture.ops.resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'RESET_ALL_DATA_PARTIAL_FAILED',
    );
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'RECOVERY_REQUIRED',
      checkpoint: 'CORE_DATA_COMMITTED',
      recovery_attempts: 0,
      error_code: 'MARKET_CLEAR_INTERRUPTED',
    });
    assert.equal(fixture.counts.marketClear(), 1);

    fixture.controls.failMarketClear = false;
    const recovered = await fixture.ops.recoverInterruptedResetAllStoredData();

    assert.deepEqual(recovered, {
      status: 'RECOVERED',
      operationId: recovered.operationId,
      checkpoint: 'VERIFIED',
      errorCode: null,
    });
    assert.ok(recovered.operationId);
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'SUCCESS',
      checkpoint: 'VERIFIED',
      recovery_attempts: 1,
      error_code: null,
    });
    assert.equal(fixture.counts.marketClear(), 2);
    assert.equal(fixture.counts.seedReconcile(), 1);
    assert.equal(fixture.counts.diagnosticsQuiesceAcquire(), 2);
    assert.equal(fixture.counts.diagnosticsQuiesceRelease(), 2);
    assert.equal(fixture.counts.diagnosticsInvalidate(), 2);
    assert.equal(fixture.counts.marketQuiesceAcquire(), 2);
    assert.equal(fixture.counts.marketQuiesceRelease(), 2);
    assert.equal(fixture.counts.marketInvalidate(), 2);
  } finally {
    fixture.db.close();
  }
});

test('startup recovery resumes from the seed checkpoint boundary without repeating DuckDB clear', async () => {
  const fixture = createResetFixture({ failSeedReconcile: true });
  try {
    await assert.rejects(() => fixture.ops.resetAllStoredData());
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'RECOVERY_REQUIRED',
      checkpoint: 'MARKET_DATA_CLEARED',
      recovery_attempts: 0,
      error_code: 'SYSTEM_SEED_RECONCILE_INTERRUPTED',
    });
    assert.equal(fixture.counts.marketClear(), 1);
    assert.equal(fixture.counts.seedReconcile(), 1);

    fixture.controls.failSeedReconcile = false;
    const recovered = await fixture.ops.recoverInterruptedResetAllStoredData();

    assert.equal(recovered.status, 'RECOVERED');
    assert.equal(fixture.counts.marketClear(), 1);
    assert.equal(fixture.counts.seedReconcile(), 2);
    assert.equal(readOperationStatus(fixture.db).status, 'SUCCESS');
  } finally {
    fixture.db.close();
  }
});

test('startup recovery aborts PREPARED because the destructive SQLite checkpoint is atomic', async () => {
  const fixture = createResetFixture();
  try {
    fixture.journal.createPreparedOperation({
      operationId: 'prepared-without-core-commit',
      createdAt: new Date().toISOString(),
    });
    const recovered = await fixture.ops.recoverInterruptedResetAllStoredData();
    assert.deepEqual(recovered, {
      status: 'ABORTED',
      operationId: 'prepared-without-core-commit',
      checkpoint: 'PREPARED',
      errorCode: null,
    });
    assert.equal(readOperationStatus(fixture.db).status, 'ABORTED');
    assert.equal(fixture.counts.marketClear(), 0);
  } finally {
    fixture.db.close();
  }
});

test('startup recovery deadline blocks startup state and never records false success', async () => {
  const fixture = createResetFixture({
    hangMarketClearUntilAbort: true,
    recoveryDeadlineMs: 20,
  });
  try {
    fixture.journal.createPreparedOperation({
      operationId: 'deadline-after-core-commit',
      createdAt: new Date().toISOString(),
    });
    fixture.journal.markCheckpoint({
      operationId: 'deadline-after-core-commit',
      checkpoint: 'CORE_DATA_COMMITTED',
      updatedAt: new Date().toISOString(),
    });

    const startedAt = Date.now();
    const recovered = await fixture.ops.recoverInterruptedResetAllStoredData();
    const elapsedMs = Date.now() - startedAt;

    assert.equal(recovered.status, 'BLOCKED');
    assert.equal(
      recovered.errorCode,
      'RESET_ALL_DATA_RECOVERY_DEADLINE_EXCEEDED',
    );
    assert.ok(elapsedMs < 500, `recovery took ${elapsedMs}ms`);
    assert.deepEqual(readOperationStatus(fixture.db), {
      status: 'BLOCKED',
      checkpoint: 'CORE_DATA_COMMITTED',
      recovery_attempts: 1,
      error_code: 'RESET_ALL_DATA_RECOVERY_DEADLINE_EXCEEDED',
    });
    assert.equal(
      fixture.db
        .prepare(
          "SELECT COUNT(*) FROM system_reset_operations WHERE status = 'SUCCESS'",
        )
        .pluck()
        .get(),
      0,
    );
  } finally {
    clearSystemResetRecoveryWriteBarrier();
    fixture.db.close();
  }
});
