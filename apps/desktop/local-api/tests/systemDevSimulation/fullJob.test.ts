// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-system-dev-simulation-full-job-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db },
  { initializeBackendAppContext },
  { replaceMarketBarsForInstrument },
  { resolveSessionNameFormat },
  { resolveSystemDevSimulationEffectivePlanForPools },
  { planSystemDevSimulationDataset },
  {
    cleanupSystemDevSimulationData,
    getSystemDevSimulationCapabilities,
    getSystemDevSimulationJob,
    simulateFreeReplayItem,
    startSystemDevSimulationJob,
  },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/runtime/compositionRoot.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("@zinuto/shared/sessionNaming"),
  import("../../src/application/systemDevSimulation/planning.js"),
  import("../../src/application/systemDevSimulation/datasetPlanner.js"),
  import("../../src/application/systemDevSimulationService.js"),
]);

initializeBackendAppContext();

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const localPoolId = "system-dev-simulation-historical-a-share-daily";
const localInstrumentId = "system-dev-simulation-full-job-local-instrument";
const localSymbol = "FULLJOB.TEST";
const forexPoolId = "system-dev-simulation-historical-index-daily";
const forexInstrumentId = "system-dev-simulation-full-job-forex-instrument";
const forexSymbol = "EURUSD";
const simulationSourceFolder = "zinuto://system-dev-simulation/historical-data/";

const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, source_folder, time_zone, base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source_folder = excluded.source_folder,
    time_zone = excluded.time_zone,
    base_timeframe = excluded.base_timeframe,
    field_mapping_json = excluded.field_mapping_json,
    trading_calendar_json = excluded.trading_calendar_json,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);

const upsertInstrument = db.prepare(
  `INSERT INTO instruments (
    id, source_id, symbol, base_timeframe, name, market, min_trade_step,
    bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_id = excluded.source_id,
    symbol = excluded.symbol,
    base_timeframe = excluded.base_timeframe,
    name = excluded.name,
    market = excluded.market,
    min_trade_step = excluded.min_trade_step,
    bar_count = excluded.bar_count,
    time_start_ts = excluded.time_start_ts,
    time_end_ts = excluded.time_end_ts,
    bars_version_token = excluded.bars_version_token`,
);

const buildDailyBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const open = 100 + Math.sin(index / 8) * 3 + index / 80;
    return {
      ts: new Date(Date.UTC(2024, 0, 1 + index)).toISOString(),
      open,
      high: open + 2,
      low: open - 2,
      close: open + Math.cos(index / 5),
      volume: 10_000 + index,
    };
  });

let localMarketReady = false;

const ensureLocalMarket = async (): Promise<void> => {
  if (localMarketReady) {
    return;
  }
  const now = new Date().toISOString();
  const bars = buildDailyBars(400);
  upsertSource.run(localPoolId, localPoolId, `${simulationSourceFolder}a-share-daily`, "UTC", "1d", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    localInstrumentId,
    localPoolId,
    localSymbol,
    "1d",
    localSymbol,
    "LOCAL",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "system-dev-simulation-full-job-local-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(localInstrumentId, localSymbol, bars);
  upsertSource.run(forexPoolId, forexPoolId, `${simulationSourceFolder}index-daily`, "UTC", "1d", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    forexInstrumentId,
    forexPoolId,
    forexSymbol,
    "1d",
    forexSymbol,
    "LOCAL",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "system-dev-simulation-full-job-forex-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(forexInstrumentId, forexSymbol, bars);
  localMarketReady = true;
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

test("free replay simulation converts forex LOT inputs into executable lots", async () => {
  await ensureLocalMarket();

  const datasetPlan = planSystemDevSimulationDataset();
  assert.equal(datasetPlan.dataAvailability.sourceStrategy, "LOCAL_READY");
  const forexCandidate = datasetPlan.enabledSamplePools
    .flatMap((pool) =>
      (pool.instruments ?? []).map((instrument) => ({
        pool,
        instrument,
      })),
    )
    .find(
      ({ instrument }) =>
        instrument.assetClass === "FOREX" &&
        instrument.baseTimeframe === "1d" &&
        instrument.marketPresetId === "FOREX_STANDARD_LOT",
    );
  assert.ok(forexCandidate);

  const effectivePlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: datasetPlan.enabledSamplePools,
  });
  const lotOnlyPlan = {
    ...effectivePlan,
    notePolicy: {
      ...effectivePlan.notePolicy,
      freeReplayForceCreateUntil: 0,
      freeReplayCreateProbability: 0,
      challengeForceCreateUntil: 0,
      challengeCreateProbability: 0,
    },
    coverage: {
      ...effectivePlan.coverage,
      freeReplayWarmupArchetypes: ["TREND_CONTINUATION" as const],
      freeReplayInputModes: ["LOT" as const],
      freeReplayPriceModes: ["CUR_CLOSE" as const],
    },
  };

  const result = await simulateFreeReplayItem(
    {
      samplePoolId: forexCandidate.pool.id,
      samplePoolName: forexCandidate.pool.name,
      instrumentId: forexCandidate.instrument.instrumentId,
      baseTimeframe: forexCandidate.instrument.baseTimeframe,
      symbol: forexCandidate.instrument.symbol,
      assetClass: forexCandidate.instrument.assetClass,
      marketPresetId: forexCandidate.instrument.marketPresetId,
    },
    0,
    {
      language: "en",
      effectivePlan: lotOnlyPlan,
      simulationBatchId: "system-dev-simulation-forex-lot-input",
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(result.coverage.inputMode, "LOT");
  assert.equal(result.coverage.priceMode, "CUR_CLOSE");
  assert.ok(result.coverage.totalTrades > 0);
});

test("free replay simulation funds high-min-lot amount samples", async () => {
  await ensureLocalMarket();

  const datasetPlan = planSystemDevSimulationDataset();
  assert.equal(datasetPlan.dataAvailability.sourceStrategy, "LOCAL_READY");
  const stockCandidate = datasetPlan.enabledSamplePools
    .flatMap((pool) =>
      (pool.instruments ?? []).map((instrument) => ({
        pool,
        instrument,
      })),
    )
    .find(
      ({ instrument }) =>
        instrument.assetClass === "STOCK" &&
        instrument.marketPresetId === "A_SHARE",
    );
  assert.ok(stockCandidate);

  const effectivePlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: datasetPlan.enabledSamplePools,
  });
  const amountOnlyPlan = {
    ...effectivePlan,
    notePolicy: {
      ...effectivePlan.notePolicy,
      freeReplayForceCreateUntil: 0,
      freeReplayCreateProbability: 0,
      challengeForceCreateUntil: 0,
      challengeCreateProbability: 0,
    },
    coverage: {
      ...effectivePlan.coverage,
      freeReplayWarmupArchetypes: ["MEAN_REVERSION" as const],
      freeReplayInputModes: ["AMOUNT" as const],
      freeReplayPriceModes: ["NEXT_OPEN" as const],
    },
  };

  const result = await simulateFreeReplayItem(
    {
      samplePoolId: stockCandidate.pool.id,
      samplePoolName: stockCandidate.pool.name,
      instrumentId: stockCandidate.instrument.instrumentId,
      baseTimeframe: stockCandidate.instrument.baseTimeframe,
      symbol: stockCandidate.instrument.symbol,
      assetClass: stockCandidate.instrument.assetClass,
      marketPresetId: stockCandidate.instrument.marketPresetId,
    },
    0,
    {
      language: "en",
      effectivePlan: amountOnlyPlan,
      simulationBatchId: "system-dev-simulation-amount-min-lot-input",
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(result.coverage.inputMode, "AMOUNT");
  assert.equal(result.coverage.priceMode, "NEXT_OPEN");
  assert.ok(result.coverage.totalTrades > 0);
});

test("system dev simulation completes generated indicators and real-engine backtests", async () => {
  await cleanupSystemDevSimulationData();
  await ensureLocalMarket();

  const capabilities = getSystemDevSimulationCapabilities();
  assert.equal(capabilities.dataAvailability.ready, true);
  assert.equal(capabilities.dataAvailability.sourceStrategy, "LOCAL_READY");

  const started = await startSystemDevSimulationJob({
    profileId: "REALISTIC",
    seed: "full-job-mixed-simulation-v6",
    targets: {
      freeReplayTarget: 9,
      fastDecisionTarget: 0,
      riskDisciplineTarget: 0,
      independentCustomNotes: 0,
      customIndicatorProfiles: 5,
      realBacktestBatches: 5,
    },
  });
  const finished = await waitForSimulationJobToFinish(started.id);

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
  assert.equal(finished.freeReplayCompleted, finished.freeReplayTarget);
  assert.equal(finished.fastDecisionCompleted, finished.fastDecisionTarget);
  assert.equal(finished.riskDisciplineCompleted, finished.riskDisciplineTarget);
  assert.equal(finished.createdCounts.desktopMutableRuns, 1);
  assert.equal(finished.metrics.verificationStatus, "SUCCESS");
  assert.equal(
    finished.totalTarget,
    finished.freeReplayTarget +
      finished.fastDecisionTarget +
      finished.riskDisciplineTarget +
      (finished.effectivePlan?.targets.independentCustomNotes ?? 0) +
      (finished.effectivePlan?.targets.customIndicatorProfiles ?? 0) +
      (finished.effectivePlan?.targets.realBacktestBatches ?? 0) +
      2,
  );
  assert.equal(finished.createdCounts.independentCustomNotes, 0);
  assert.equal(
    finished.createdCounts.customIndicatorProfiles,
    finished.effectivePlan?.targets.customIndicatorProfiles,
  );
  assert.equal(
    finished.createdCounts.realBacktestBatches,
    finished.effectivePlan?.targets.realBacktestBatches,
  );
});
