// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-reset-all-stored-data-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const TEMP_DIR_REMOVE_RETRY_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 20,
  retryDelay: 50,
} as const;

const [
  { db, DEFAULT_USER_ID },
  { resetAllStoredData },
  {
    DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
    DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  },
  { deleteSpecialTrainingBank, listSpecialTrainingBanks },
  { clearSpecialTrainingHistory },
  {
    getResetAllStoredDataJobState,
    clearSettledResetAllStoredDataJobState,
    startResetAllStoredDataJobState,
    waitForResetAllStoredDataJobIdle,
  },
  { appError },
  { closeMarketDatabase },
  { SYSTEM_DEV_SIMULATION_JOBS },
  {
    startSystemDevSimulationCleanupJobState,
    waitForSystemDevSimulationCleanupJobIdle,
  },
  {
    releaseSystemDevSimulationCleanupExecution,
    tryAcquireSystemDevSimulationCleanupExecution,
  },
  { trackSystemDevSimulationTaskExecution },
  { tryReserveLocalDataImportPreviewExecution },
  { startSystemDevSimulationJob },
  {
    cleanupSystemDevSimulationData,
    startSystemDevSimulationCleanupJob,
  },
  {
    releaseSystemResetExecution,
    tryAcquireSystemResetExecution,
  },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/application/trading/resetService.js"),
  import("../../src/application/specialTraining/banks.js"),
  import("../../src/application/specialTrainingService.js"),
  import("../../src/application/specialTrainingStatsService.js"),
  import("../../src/application/trading/resetAllDataJobState.js"),
  import("../../src/kernel/appError.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/infrastructure/db/systemDevSimulation/jobStore.js"),
  import("../../src/infrastructure/db/systemDevSimulation/cleanupJobStore.js"),
  import("../../src/application/systemDevSimulation/cleanupExecutionState.js"),
  import("../../src/application/systemDevSimulation/taskExecutionState.js"),
  import("../../src/application/dataSource/importPreviewExecutionState.js"),
  import("../../src/application/systemDevSimulation/jobLifecycle.js"),
  import("../../src/application/systemDevSimulation/cleanupRuntime.js"),
  import("../../src/application/trading/resetExecutionState.js"),
]);

test.after(async () => {
  clearSettledResetAllStoredDataJobState();
  await closeMarketDatabase();
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, TEMP_DIR_REMOVE_RETRY_OPTIONS);
});

const waitForResetJobStatus = async (
  jobId: string,
  status: "SUCCESS" | "FAILED",
) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = getResetAllStoredDataJobState(jobId);
    if (snapshot.status === status) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return getResetAllStoredDataJobState(jobId);
};

const insertBacktestResetFixture = (): void => {
  const now = new Date().toISOString();
  const instrument = db
    .prepare("SELECT id, symbol FROM instruments WHERE market = 'SYSTEM' LIMIT 1")
    .get() as { id: string; symbol: string } | undefined;
  assert.ok(instrument);
  db.prepare(
    `INSERT INTO backtest_batches (
      id,name,status,config_json,progress_json,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-backtest-batch",
    "Reset backtest batch",
    "SUCCEEDED",
    "{}",
    "{}",
    "{}",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO backtest_results (
      id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
      max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-backtest-result",
    "reset-backtest-batch",
    instrument.id,
    instrument.symbol,
    "1d",
    1,
    100,
    0,
    0,
    0,
    0,
    1,
    0,
    "{}",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO backtest_fills (
      id,batch_id,result_id,instrument_id,symbol,order_id,fill_index,fill_time,side,
      price,qty,gross,fee,tax,slippage,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-backtest-fill",
    "reset-backtest-batch",
    "reset-backtest-result",
    instrument.id,
    instrument.symbol,
    "reset-backtest-order",
    0,
    now,
    "BUY",
    100,
    1,
    100,
    0,
    0,
    0,
    now,
  );
  db.prepare(
    `INSERT INTO backtest_equity_curve (
      id,batch_id,result_id,instrument_id,symbol,bar_index,bar_time,equity,drawdown
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-backtest-equity",
    "reset-backtest-batch",
    "reset-backtest-result",
    instrument.id,
    instrument.symbol,
    0,
    now,
    100,
    0,
  );
};

test("one-click reset deletes custom banks and rebuilds the default 1d question bank", async () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO special_training_banks (
      id,user_id,name,asset_class,target_timeframe,scope_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-test-bank",
    DEFAULT_USER_ID,
    "Reset Test Bank",
    "STOCK",
    "1d",
    JSON.stringify({ poolIds: ["reset-test-pool"] }),
    now,
    now,
  );
  insertBacktestResetFixture();
  const simulationJobs = SYSTEM_DEV_SIMULATION_JOBS as unknown as Map<
    string,
    { status: "SUCCESS" }
  >;
  simulationJobs.set("reset-finished-simulation", { status: "SUCCESS" });
  db.prepare(
    `INSERT INTO special_training_stats_projection (
      project_id,session_id,question_id,mode_id,created_at,settled_at,finished_at,symbol,generated_at,detail_expired_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "reset-test-question",
    "reset-test-session",
    "reset-test-question",
    "fast-decision-training",
    now,
    now,
    now,
    "RESET",
    now,
    now,
  );

  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM special_training_banks WHERE user_id = ?")
        .pluck()
        .get(DEFAULT_USER_ID) ?? 0,
    ),
    1,
  );
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM special_training_stats_projection")
        .pluck()
        .get() ?? 0,
    ),
    1,
  );

  const result = await resetAllStoredData();

  assert.equal(result.deletedSpecialTrainingBanks, 1);
  assert.equal(result.deletedSpecialTrainingStatsProjection, 1);
  assert.equal(result.deletedBacktestEquityPoints, 1);
  assert.equal(result.deletedBacktestFills, 1);
  assert.equal(result.deletedBacktestResults, 1);
  assert.equal(result.deletedBacktestBatches, 1);
  assert.equal(simulationJobs.has("reset-finished-simulation"), false);
  for (const table of [
    "backtest_equity_curve",
    "backtest_fills",
    "backtest_results",
    "backtest_batches",
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), 0);
  }
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM special_training_stats_projection")
        .pluck()
        .get() ?? 0,
    ),
    0,
  );
  const banksAfterReset = listSpecialTrainingBanks();
  const defaultBank = banksAfterReset.find(
    (bank) => bank.name === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
  );
  assert.equal(banksAfterReset.length, 1);
  assert.ok(defaultBank);
  assert.equal(defaultBank.targetTimeframe, "1d");
  assert.deepEqual(
    defaultBank.scope.poolIds,
    DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  );

  deleteSpecialTrainingBank(defaultBank.id);
  assert.equal(
    listSpecialTrainingBanks().some(
      (bank) => bank.name === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
    ),
    false,
  );
});

test("one-click reset cannot overtake an active local source symbol mutation", async () => {
  const sourceId = "reset-active-symbol-mutation";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    "Reset Active Symbol Mutation",
    "",
    "UTC",
    "1d",
    "{}",
    "{}",
    "READY",
    "MUTATING_SYMBOLS",
    0,
    0,
    now,
    now,
  );

  await assert.rejects(
    () => resetAllStoredData(),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS",
  );
  assert.ok(
    db.prepare("SELECT 1 FROM local_data_sources WHERE id = ?").get(sourceId),
  );
  db.prepare("DELETE FROM local_data_sources WHERE id = ?").run(sourceId);
});

test("one-click reset cannot overtake an active import preview execution", async () => {
  const reservation = tryReserveLocalDataImportPreviewExecution(1);
  assert.ok(reservation);
  let releasePreview!: () => void;
  const previewExecution = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  reservation.track(previewExecution);
  try {
    await assert.rejects(
      () => resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === "object" &&
        (error as { code?: unknown }).code ===
          "LOCAL_DATA_IMPORT_JOB_ACTIVE",
    );
  } finally {
    releasePreview();
    await previewExecution;
    reservation.complete();
  }
});

test("one-click reset cannot overtake an active backtest batch", async () => {
  const batchId = "reset-active-backtest";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO backtest_batches (
      id,name,status,config_json,progress_json,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(batchId, batchId, "RUNNING", "{}", "{}", "{}", now, now);

  await assert.rejects(
    () => resetAllStoredData(),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "BACKTEST_BATCH_ACTIVE" &&
      (error as { status?: unknown }).status === 409,
  );
  assert.ok(db.prepare("SELECT 1 FROM backtest_batches WHERE id = ?").get(batchId));
  db.prepare("DELETE FROM backtest_batches WHERE id = ?").run(batchId);
});

test("one-click reset cannot overtake an active system simulation", async () => {
  const jobId = "reset-active-system-simulation";
  const jobs = SYSTEM_DEV_SIMULATION_JOBS as unknown as Map<
    string,
    { status: "RUNNING" }
  >;
  jobs.set(jobId, { status: "RUNNING" });
  try {
    await assert.rejects(
      () => resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === "object" &&
        (error as { code?: unknown }).code ===
          "SYSTEM_DEV_SIMULATION_JOB_ACTIVE",
    );
  } finally {
    jobs.delete(jobId);
  }
});

test("one-click reset cannot overtake a failed simulation whose timed-out task is still draining", async () => {
  const jobId = "reset-failed-system-simulation-still-draining";
  const jobs = SYSTEM_DEV_SIMULATION_JOBS as unknown as Map<
    string,
    { status: "FAILED" }
  >;
  jobs.set(jobId, { status: "FAILED" });
  let releaseTask!: () => void;
  const trackedTask = trackSystemDevSimulationTaskExecution(
    new Promise<void>((resolve) => {
      releaseTask = resolve;
    }),
  );
  try {
    await assert.rejects(
      () => resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === "object" &&
        (error as { code?: unknown }).code ===
          "SYSTEM_DEV_SIMULATION_JOB_ACTIVE",
    );
  } finally {
    releaseTask();
    await trackedTask;
    jobs.delete(jobId);
  }
});

test("one-click reset cannot overtake queued or directly executing simulation cleanup", async () => {
  let releaseCleanup!: () => void;
  const cleanupReleased = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  startSystemDevSimulationCleanupJobState({
    runCleanup: async () => {
      await cleanupReleased;
      return { ok: true };
    },
    extractErrorCode: () => "SYSTEM_DEV_SIMULATION_FAILED",
    extractErrorArgs: () => null,
  });
  await assert.rejects(
    () => resetAllStoredData(),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE",
  );
  releaseCleanup();
  await waitForSystemDevSimulationCleanupJobIdle();

  assert.equal(tryAcquireSystemDevSimulationCleanupExecution(), true);
  try {
    await assert.rejects(
      () => resetAllStoredData(),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === "object" &&
        (error as { code?: unknown }).code ===
          "SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE",
    );
  } finally {
    releaseSystemDevSimulationCleanupExecution();
  }
});

test("system reset execution blocks simulation and cleanup starts", async () => {
  assert.equal(tryAcquireSystemResetExecution(), true);
  const isResetInProgress = (error: unknown): boolean =>
    Boolean(
      error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "SYSTEM_RESET_IN_PROGRESS",
    );
  try {
    await assert.rejects(
      () => startSystemDevSimulationJob({ profileId: "REALISTIC" }),
      isResetInProgress,
    );
    await assert.rejects(
      () => cleanupSystemDevSimulationData(),
      isResetInProgress,
    );
    assert.throws(
      () => startSystemDevSimulationCleanupJob(),
      isResetInProgress,
    );
  } finally {
    releaseSystemResetExecution();
  }
});

test("one-click reset job preserves structured failure args", async () => {
  clearSettledResetAllStoredDataJobState();
  const created = startResetAllStoredDataJobState({
    runResetAllStoredData: async () => {
      throw appError("RESET_ALL_DATA_PARTIAL_FAILED", {
        stage: "POST_DESTRUCTIVE",
        cause: "LOCAL_DATA_IMPORT_JOB_ACTIVE",
      });
    },
    extractErrorCode: (error) =>
      String((error as { code?: unknown }).code ?? "RESET_ALL_DATA_FAILED"),
  });

  const failed = await waitForResetJobStatus(created.id, "FAILED");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "RESET_ALL_DATA_PARTIAL_FAILED");
  assert.deepEqual(failed.errorArgs, {
    stage: "POST_DESTRUCTIVE",
    cause: "LOCAL_DATA_IMPORT_JOB_ACTIVE",
  });
  clearSettledResetAllStoredDataJobState();
});

test("one-click reset job idle wait resolves after active job finishes", async () => {
  clearSettledResetAllStoredDataJobState();
  let releaseReset!: () => void;
  const resetReleased = new Promise<void>((resolve) => {
    releaseReset = resolve;
  });
  const created = startResetAllStoredDataJobState({
    runResetAllStoredData: async () => {
      await resetReleased;
      return { ok: true };
    },
    extractErrorCode: () => "RESET_ALL_DATA_FAILED",
  });

  let idleResolved = false;
  const idlePromise = waitForResetAllStoredDataJobIdle().then(() => {
    idleResolved = true;
  });
  await Promise.resolve();
  assert.equal(idleResolved, false);

  releaseReset();
  await idlePromise;
  assert.equal(idleResolved, true);
  assert.equal(getResetAllStoredDataJobState(created.id).status, "SUCCESS");
  clearSettledResetAllStoredDataJobState();
});

test("challenge history clear deletes retained stats projections", async () => {
  const now = new Date().toISOString();
  const insertProjection = db.prepare(
    `INSERT INTO special_training_stats_projection (
      project_id,session_id,question_id,mode_id,created_at,settled_at,finished_at,symbol,generated_at,detail_expired_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  insertProjection.run(
    "clear-fast-question",
    "clear-fast-session",
    "clear-fast-question",
    "fast-decision-training",
    now,
    now,
    now,
    "CLEARFAST",
    now,
    now,
  );
  insertProjection.run(
    "clear-risk-question",
    "clear-risk-session",
    "clear-risk-question",
    "risk-discipline-training",
    now,
    now,
    now,
    "CLEARRISK",
    now,
    now,
  );

  const scopedResult = await clearSpecialTrainingHistory({
    modeId: "fast-decision-training",
  });
  assert.deepEqual(scopedResult, {
    deletedSessionRows: 0,
    deletedQuestionRows: 0,
  });
  assert.equal(
    Number(
      db
        .prepare(
          "SELECT COUNT(*) FROM special_training_stats_projection WHERE mode_id = ?",
        )
        .pluck()
        .get("fast-decision-training") ?? 0,
    ),
    0,
  );
  assert.equal(
    Number(
      db
        .prepare(
          "SELECT COUNT(*) FROM special_training_stats_projection WHERE mode_id = ?",
        )
        .pluck()
        .get("risk-discipline-training") ?? 0,
    ),
    1,
  );

  await clearSpecialTrainingHistory();
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM special_training_stats_projection")
        .pluck()
        .get() ?? 0,
    ),
    0,
  );
});
