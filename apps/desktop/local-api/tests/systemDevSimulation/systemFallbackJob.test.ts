// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-system-dev-simulation-system-fallback-"),
);
const previousDataDir = process.env.ZINUTO_DATA_DIR;
const previousStressFlag = process.env.ZINUTO_ENABLE_STRESS_SIMULATION;
process.env.ZINUTO_DATA_DIR = tempDataDir;
process.env.ZINUTO_ENABLE_STRESS_SIMULATION = "1";

const [
  { db },
  { replaceMarketBarsForInstrument },
  { initializeBackendAppContext },
  { planSystemDevSimulationDataset },
  { resolveSystemDevSimulationEffectivePlanForPools },
  {
    cancelSystemDevSimulationJob,
    cleanupSystemDevSimulationData,
    getSystemDevSimulationCapabilities,
    getSystemDevSimulationJob,
    startSystemDevSimulationJob,
  },
  {
    createInitialSystemDevSimulationJob,
    upsertSystemDevSimulationJob,
  },
  { runSystemDevSimulationFreeReplayWorkload },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/runtime/compositionRoot.js"),
  import("../../src/application/systemDevSimulation/datasetPlanner.js"),
  import("../../src/application/systemDevSimulation/planning.js"),
  import("../../src/application/systemDevSimulationService.js"),
  import("../../src/infrastructure/db/systemDevSimulation/jobStore.js"),
  import("../../src/application/systemDevSimulation/workloads/executionHelpers.js"),
]);

initializeBackendAppContext();

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';
const simulationSourceFolder = "zinuto://system-dev-simulation/historical-data/";
const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, source_folder, time_zone, base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source_folder = excluded.source_folder,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);
const upsertInstrument = db.prepare(
  `INSERT INTO instruments (
    id, source_id, symbol, base_timeframe, name, market, min_trade_step,
    bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
  ) VALUES (?, ?, ?, ?, ?, 'LOCAL', 1, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_id = excluded.source_id,
    bar_count = excluded.bar_count,
    time_start_ts = excluded.time_start_ts,
    time_end_ts = excluded.time_end_ts,
    bars_version_token = excluded.bars_version_token`,
);
const buildBars = (): OhlcvBar[] =>
  Array.from({ length: 800 }, (_, index) => {
    const open = 100 + index / 20 + Math.sin(index / 15);
    return {
      ts: new Date(Date.UTC(2022, 0, 1 + index)).toISOString(),
      open,
      high: open + 2,
      low: open - 2,
      close: open + Math.cos(index / 9),
      volume: 10_000 + index,
    };
  });
const ensureImportedHistoricalData = async (): Promise<void> => {
  const now = new Date().toISOString();
  const bars = buildBars();
  for (const [index, sourceId] of [
    "system-dev-simulation-historical-a-share-daily",
    "system-dev-simulation-historical-index-daily",
  ].entries()) {
    const instrumentId = `${sourceId}-instrument`;
    const symbol = index === 0 ? "000001" : "INDEX-000300";
    upsertSource.run(
      sourceId,
      sourceId,
      `${simulationSourceFolder}${index === 0 ? "a-share-daily" : "index-daily"}`,
      "UTC",
      "1d",
      "{}",
      DEFAULT_TRADING_CALENDAR_JSON,
      now,
      now,
    );
    upsertInstrument.run(
      instrumentId,
      sourceId,
      symbol,
      "1d",
      symbol,
      bars.length,
      bars[0]?.ts ?? null,
      bars.at(-1)?.ts ?? null,
      `${sourceId}-bars-v1`,
      now,
    );
    await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  }
};

const ensureShortImportedHistoricalData = async (): Promise<void> => {
  const now = new Date().toISOString();
  const sourceId = "system-dev-simulation-short-local-daily";
  upsertSource.run(
    sourceId,
    sourceId,
    `${simulationSourceFolder}short-local-daily`,
    "UTC",
    "1d",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    now,
    now,
  );
  for (const [index, barCount] of [65, 86, 103].entries()) {
    const instrumentId = `${sourceId}-instrument-${index}`;
    const symbol = `SHORT-${barCount}`;
    const bars = buildBars().slice(0, barCount);
    upsertInstrument.run(
      instrumentId,
      sourceId,
      symbol,
      "1d",
      symbol,
      bars.length,
      bars[0]?.ts ?? null,
      bars.at(-1)?.ts ?? null,
      `${instrumentId}-bars-v1`,
      now,
    );
    await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  }
};

let activeJobId: string | null = null;

const restoreEnvValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

const waitForSimulationJobToFinish = async (
  jobId: string,
  timeoutMs = 180_000,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = getSystemDevSimulationJob(jobId);
    if (job.status !== "QUEUED" && job.status !== "RUNNING") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return getSystemDevSimulationJob(jobId);
};

const waitForStressCalibration = async (
  jobId: string,
  timeoutMs = 180_000,
) => {
  const deadline = Date.now() + timeoutMs;
  let latest = getSystemDevSimulationJob(jobId);
  while (Date.now() < deadline) {
    latest = getSystemDevSimulationJob(jobId);
    assert.notEqual(
      latest.status,
      "FAILED",
      JSON.stringify({
        status: latest.status,
        phase: latest.phase,
        errorCode: latest.errorCode,
        errorArgs: latest.errorArgs,
        progressPercent: latest.progressPercent,
        freeReplayCompleted: latest.freeReplayCompleted,
        fastDecisionCompleted: latest.fastDecisionCompleted,
        riskDisciplineCompleted: latest.riskDisciplineCompleted,
      }),
    );
    if (latest.effectivePlan?.calibrated) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(
    `STRESS calibration did not complete: ${JSON.stringify({
      status: latest.status,
      phase: latest.phase,
      errorCode: latest.errorCode,
      errorArgs: latest.errorArgs,
      progressPercent: latest.progressPercent,
      freeReplayCompleted: latest.freeReplayCompleted,
      fastDecisionCompleted: latest.fastDecisionCompleted,
      riskDisciplineCompleted: latest.riskDisciplineCompleted,
      customNotesCreated: latest.createdCounts.independentCustomNotes,
    })}`,
  );
};

test.after(async () => {
  if (activeJobId) {
    try {
      cancelSystemDevSimulationJob(activeJobId);
      await waitForSimulationJobToFinish(activeJobId, 90_000);
    } catch {
      // Best effort cleanup for failed assertions before the job reaches terminal state.
    }
    activeJobId = null;
  }
  db.close();
  restoreEnvValue("ZINUTO_DATA_DIR", previousDataDir);
  restoreEnvValue("ZINUTO_ENABLE_STRESS_SIMULATION", previousStressFlag);
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("system dev simulation REALISTIC job falls back to built-in generated data when no user dataset exists", async () => {
  await cleanupSystemDevSimulationData();

  const datasetPlan = planSystemDevSimulationDataset();
  assert.equal(
    datasetPlan.dataAvailability.sourceStrategy,
    "SYSTEM_FALLBACK_ONLY",
    JSON.stringify(datasetPlan.dataAvailability),
  );
  assert.equal(datasetPlan.dataAvailability.selectedLocalInstrumentCount, 0);
  assert.ok(datasetPlan.dataAvailability.selectedSystemInstrumentCount > 0);

  const capabilities = getSystemDevSimulationCapabilities();
  assert.equal(
    capabilities.dataAvailability.sourceStrategy,
    "SYSTEM_FALLBACK_ONLY",
    JSON.stringify(capabilities.dataAvailability),
  );
  assert.equal(capabilities.dataAvailability.ready, true);

  const started = await startSystemDevSimulationJob({
    profileId: "REALISTIC",
    seed: "system-fallback-free-replay-v6",
    targets: {
      freeReplayTarget: 1,
      fastDecisionTarget: 0,
      riskDisciplineTarget: 0,
      independentCustomNotes: 0,
      customIndicatorProfiles: 0,
      realBacktestBatches: 0,
    },
  });
  activeJobId = started.id;
  const finished = await waitForSimulationJobToFinish(started.id);
  activeJobId = null;

  assert.equal(
    finished.status,
    "SUCCESS",
    JSON.stringify({
      status: finished.status,
      phase: finished.phase,
      errorCode: finished.errorCode,
      errorArgs: finished.errorArgs,
      progressPercent: finished.progressPercent,
      freeReplayCompleted: finished.freeReplayCompleted,
      fastDecisionCompleted: finished.fastDecisionCompleted,
      riskDisciplineCompleted: finished.riskDisciplineCompleted,
    }),
  );
  assert.equal(finished.phase, "DONE");
  assert.equal(finished.progressPercent, 100);
  assert.equal(finished.canCancel, false);
  assert.equal(finished.currentWorkload, null);
  assert.equal(finished.effectivePlan?.profileId, "REALISTIC");
  assert.equal(finished.freeReplayCompleted, finished.freeReplayTarget);
  assert.equal(finished.fastDecisionCompleted, finished.fastDecisionTarget);
  assert.equal(finished.riskDisciplineCompleted, finished.riskDisciplineTarget);
  assert.equal(finished.metrics.verificationStatus, "SUCCESS");
});

test("system dev simulation uses built-in challenge data when local history is too short for full lookback", async () => {
  await cleanupSystemDevSimulationData();
  await ensureShortImportedHistoricalData();

  const datasetPlan = planSystemDevSimulationDataset();
  assert.equal(datasetPlan.dataAvailability.sourceStrategy, "LOCAL_READY");
  assert.equal(datasetPlan.dataAvailability.selectedLocalInstrumentCount, 3);

  const started = await startSystemDevSimulationJob({
    profileId: "REALISTIC",
    seed: "short-local-challenge-fallback-v6",
    targets: {
      freeReplayTarget: 0,
      fastDecisionTarget: 1,
      riskDisciplineTarget: 1,
      independentCustomNotes: 0,
      customIndicatorProfiles: 0,
      realBacktestBatches: 0,
    },
  });
  activeJobId = started.id;
  const finished = await waitForSimulationJobToFinish(started.id);
  activeJobId = null;

  assert.equal(
    finished.status,
    "SUCCESS",
    JSON.stringify({
      status: finished.status,
      phase: finished.phase,
      errorCode: finished.errorCode,
      errorArgs: finished.errorArgs,
      progressPercent: finished.progressPercent,
      fastDecisionCompleted: finished.fastDecisionCompleted,
      riskDisciplineCompleted: finished.riskDisciplineCompleted,
    }),
  );
  assert.equal(finished.fastDecisionCompleted, 1);
  assert.equal(finished.riskDisciplineCompleted, 1);
  assert.equal(finished.metrics.verificationStatus, "SUCCESS");
  const challengeMarkets = db
    .prepare(
      `SELECT DISTINCT i.market
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
         JOIN instruments i ON i.id = q.instrument_id
        WHERE s.simulation_batch_id = ?
        ORDER BY i.market`,
    )
    .pluck()
    .all(started.id) as string[];
  assert.deepEqual(challengeMarkets, ["SYSTEM"]);
});

test("system dev simulation STRESS keeps requested targets and cancellable diagnostics", async () => {
  await cleanupSystemDevSimulationData();
  await ensureImportedHistoricalData();

  const capabilities = getSystemDevSimulationCapabilities();
  assert.equal(capabilities.dataAvailability.sourceStrategy, "LOCAL_READY");
  assert.equal(
    capabilities.profiles.find((profile) => profile.profileId === "STRESS")
      ?.available,
    true,
  );

  const started = await startSystemDevSimulationJob({
    profileId: "STRESS",
    targets: {
      freeReplayTarget: 16,
      fastDecisionTarget: 8,
      riskDisciplineTarget: 8,
      independentCustomNotes: 4,
      customIndicatorProfiles: 0,
      realBacktestBatches: 0,
    },
  });
  activeJobId = started.id;
  const running = getSystemDevSimulationJob(started.id);

  assert.equal(running.profileId, "STRESS");
  assert.deepEqual(running.effectivePlan?.targets, {
    freeReplayTarget: 16,
    fastDecisionTarget: 8,
    riskDisciplineTarget: 8,
    independentCustomNotes: 4,
    customIndicatorProfiles: 0,
    realBacktestBatches: 0,
  });

  cancelSystemDevSimulationJob(started.id);
  const terminal = await waitForSimulationJobToFinish(started.id, 90_000);
  activeJobId = null;

  assert.equal(
    terminal.status,
    "INTERRUPTED",
    JSON.stringify({
      status: terminal.status,
      phase: terminal.phase,
      errorCode: terminal.errorCode,
      errorArgs: terminal.errorArgs,
      progressPercent: terminal.progressPercent,
    }),
  );
  assert.equal(terminal.errorCode, "SYSTEM_DEV_SIMULATION_INTERRUPTED");
  assert.equal(
    terminal.errorArgs?.errorCode,
    "SYSTEM_DEV_SIMULATION_INTERRUPTED",
  );
  assert.equal(terminal.errorArgs?.reason, "SYSTEM_DEV_SIMULATION_INTERRUPTED");
  assert.equal(terminal.errorArgs?.profileId, "STRESS");
  assert.equal(typeof terminal.errorArgs?.phase, "string");
  assert.equal(typeof terminal.errorArgs?.progressPercent, "number");
  assert.equal(typeof terminal.errorArgs?.freeReplayCompleted, "number");
  assert.equal(typeof terminal.errorArgs?.fastDecisionCompleted, "number");
  assert.equal(typeof terminal.errorArgs?.riskDisciplineCompleted, "number");
  assert.equal(terminal.canCancel, false);
  assert.equal(terminal.currentWorkload, null);
});

test("system dev simulation free replay workload heartbeats before item timeout", async () => {
  const beforeItemContexts: Array<{ index: number; target: number }> = [];
  let itemCompleted = false;

  await assert.rejects(
    () =>
      runSystemDevSimulationFreeReplayWorkload({
        job: { phase: "FREE_REPLAY" } as never,
        startIndex: 0,
        target: 1,
        concurrency: 1,
        runPool: async (total, _concurrency, worker) => {
          for (let index = 0; index < total; index += 1) {
            await worker(index);
          }
        },
        withRetry: (task) => task(),
        maybeThrowInterrupted: () => undefined,
        executeItem: async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ replayNotesCreated: 0 }), 30);
          }),
        items: [{} as never],
        onBeforeItem: (context) => {
          beforeItemContexts.push(context);
        },
        onItemCompleted: () => {
          itemCompleted = true;
        },
        itemTimeoutMs: 1,
      }),
    (error) => {
      const appError = error as {
        code?: string;
        args?: Record<string, unknown>;
      };
      assert.equal(appError.code, "SYSTEM_DEV_SIMULATION_FAILED");
      assert.equal(appError.args?.reason, "ITEM_TIMEOUT");
      assert.equal(appError.args?.phase, "FREE_REPLAY");
      assert.equal(appError.args?.workload, "FREE_REPLAY");
      assert.equal(appError.args?.index, 0);
      assert.equal(appError.args?.target, 1);
      assert.equal(appError.args?.timeoutMs, 1);
      return true;
    },
  );

  assert.deepEqual(beforeItemContexts, [{ index: 0, target: 1 }]);
  assert.equal(itemCompleted, false);
});

test("system dev simulation start interrupts orphaned active job before replacement", async () => {
  await cleanupSystemDevSimulationData();
  await ensureImportedHistoricalData();

  const datasetPlan = planSystemDevSimulationDataset();
  assert.equal(datasetPlan.dataAvailability.sourceStrategy, "LOCAL_READY");
  const effectivePlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: datasetPlan.enabledSamplePools,
  });
  const now = new Date().toISOString();
  const orphan = createInitialSystemDevSimulationJob({
    id: "system-dev-simulation-orphan-test",
    profileId: "REALISTIC",
    payload: null as never,
    effectivePlan,
    currentMessage: "orphan",
    currentMessageToken: {
      id: "appText.simulationJobProgress",
      fallback: "Simulation job progress",
    } as never,
  });
  orphan.status = "RUNNING";
  orphan.startedAt = now;
  orphan.phaseStartedAt = now;
  orphan.currentWorkload = {
    phase: "FREE_REPLAY",
    workload: "FREE_REPLAY",
    index: 0,
    current: 1,
    target: orphan.freeReplayTarget,
    startedAt: now,
    updatedAt: now,
  };
  upsertSystemDevSimulationJob(orphan);

  const replacement = await startSystemDevSimulationJob({ profileId: "REALISTIC" });
  activeJobId = replacement.id;

  const interrupted = getSystemDevSimulationJob(orphan.id);
  assert.equal(interrupted.status, "INTERRUPTED");
  assert.equal(interrupted.errorCode, "SYSTEM_DEV_SIMULATION_INTERRUPTED");
  assert.equal(interrupted.errorArgs?.reason, "ORPHANED_ACTIVE_JOB");
  assert.equal(interrupted.canCancel, false);
  assert.equal(interrupted.currentWorkload, null);

  cancelSystemDevSimulationJob(replacement.id);
  const terminal = await waitForSimulationJobToFinish(replacement.id, 90_000);
  activeJobId = null;
  assert.equal(terminal.canCancel, false);
});
