// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
} from "@zinuto/shared/trading";
import type { OhlcvBar } from "../../src/domain/models.js";
import type { TradingSettings } from "../../src/domain/trading/types.js";

const TEST_INSTRUMENT_ID = "backtest-service-instrument";
const TEST_INSTRUMENT_ID_2 = "backtest-service-instrument-2";
const TEST_INSTRUMENT_ID_3 = "backtest-service-instrument-empty";
const TEST_SYMBOL = "BTST";
const TEST_SYMBOL_2 = "BTZZ";
const TEST_SYMBOL_3 = "BTNO";
const TEST_SYSTEM_SEED_SYMBOL = "AAPL";

const bars: OhlcvBar[] = [
  { ts: "2026-01-01T09:30:00.000Z", open: 10, high: 11, low: 9, close: 10, volume: 1000 },
  { ts: "2026-01-02T09:30:00.000Z", open: 11, high: 13, low: 10, close: 12, volume: 1000 },
  { ts: "2026-01-03T09:30:00.000Z", open: 13, high: 15, low: 12, close: 14, volume: 1000 },
  { ts: "2026-01-04T09:30:00.000Z", open: 15, high: 17, low: 14, close: 16, volume: 1000 },
];

const zeroFeeAshareSettings = (): TradingSettings => ({
  ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
  commissionRate: 0,
  makerFeeRate: 0,
  takerFeeRate: 0,
  fundingRate: 0,
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  platformFeeRate: 0,
  transactionLevyRate: 0,
  slippageRate: 0,
  stampDutyRate: 0,
  commissionMinimumFee: 0,
  platformFeeMinimumFee: 0,
  transactionLevyMinimumFee: 0,
  minTradeStep: 1,
  tradeSettlementMode: "T0",
  freeReplayEndSettlementMode: "FORCE_CLOSE",
  tradeAmountIncludesFees: false,
  allowLongMarginTrading: false,
  allowShortSelling: false,
  initialSecuritiesBalance: 1000,
  positionCostMode: "DILUTED",
});

const restoreEnvValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

const cleanupTestRows = (
  db: import("better-sqlite3").Database,
): void => {
  db.prepare("DELETE FROM backtest_batches WHERE id LIKE 'backtest-service-%' OR name LIKE 'Backtest service %'").run();
  db.prepare(
    "DELETE FROM instruments WHERE id IN (?, ?, ?) OR symbol IN (?, ?, ?)",
  ).run(
    TEST_INSTRUMENT_ID,
    TEST_INSTRUMENT_ID_2,
    TEST_INSTRUMENT_ID_3,
    TEST_SYMBOL,
    TEST_SYMBOL_2,
    TEST_SYMBOL_3,
  );
};

test("backtest service runs a batch and persists result details", async (t) => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-backtest-service-"),
  );
  const previousDbPath = process.env.ZINUTO_DB_PATH;
  const previousNativeBatch = process.env.ZINUTO_BACKTEST_NATIVE_BATCH;
  const previousNativeBin = process.env.ZINUTO_BACKTEST_ENGINE_BIN;
  process.env.ZINUTO_DB_PATH = path.join(tempDir, "zinuto.db");
  process.env.ZINUTO_BACKTEST_NATIVE_BATCH = "0";
  delete process.env.ZINUTO_BACKTEST_ENGINE_BIN;

  const { db, closeLocalDatabase } = await import("../../src/infrastructure/db/database.js");
  const {
    clearBacktestBatches,
    createBacktestBatch,
    deleteBacktestBatch,
    getBacktestResultDetail,
    getBacktestResults,
    listBacktestBatches,
    runBacktestBatchNow,
  } = await import("../../src/application/backtest/backtestService.js");
  const marketSource = await import("../../src/infrastructure/db/marketDatabase.js");

  cleanupTestRows(db);
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    TEST_INSTRUMENT_ID,
    null,
    TEST_SYMBOL,
    "1d",
    "Backtest service symbol",
    "LOCAL",
    "UTC",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars[bars.length - 1]?.ts ?? null,
    "test-bars-v1",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    TEST_INSTRUMENT_ID_2,
    null,
    TEST_SYMBOL_2,
    "1d",
    "Backtest service symbol 2",
    "LOCAL",
    "UTC",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars[bars.length - 1]?.ts ?? null,
    "test-bars-v1",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    TEST_INSTRUMENT_ID_3,
    null,
    TEST_SYMBOL_3,
    "1d",
    "Backtest service empty symbol",
    "LOCAL",
    "UTC",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars[bars.length - 1]?.ts ?? null,
    "test-bars-v1",
    "2026-01-01T00:00:00.000Z",
  );
  const systemSeedInstrument = db.prepare(
    `SELECT id
       FROM instruments
      WHERE symbol = ?
        AND base_timeframe = '1d'
        AND market = 'SYSTEM'
      LIMIT 1`,
  ).get(TEST_SYSTEM_SEED_SYMBOL) as { id: string } | undefined;
  assert.ok(systemSeedInstrument);

  const hydratedBarsByInstrumentId = new Map<string, OhlcvBar[]>();
  const testMarketData = {
    ...marketSource,
    getMarketBarCount: async (instrumentId: string) =>
      instrumentId === TEST_INSTRUMENT_ID || instrumentId === TEST_INSTRUMENT_ID_2
        ? bars.length
        : hydratedBarsByInstrumentId.get(instrumentId)?.length ?? 0,
    getMarketBarsByInstrumentIdRange: async (
      instrumentId: string,
      offset: number,
      limit: number,
    ) =>
      instrumentId === TEST_INSTRUMENT_ID || instrumentId === TEST_INSTRUMENT_ID_2
        ? bars.slice(offset, offset + limit)
        : hydratedBarsByInstrumentId.get(instrumentId)?.slice(offset, offset + limit) ?? [],
    getMarketBarsByInstrumentIdTsRange: async (
      instrumentId: string,
      startTs: string,
      endTs: string,
    ) => {
      const sourceBars = instrumentId === TEST_INSTRUMENT_ID || instrumentId === TEST_INSTRUMENT_ID_2
        ? bars
        : hydratedBarsByInstrumentId.get(instrumentId) ?? [];
      const startMs = Date.parse(startTs);
      const endMs = Date.parse(endTs);
      return sourceBars.filter((bar) => {
        const tsMs = Date.parse(bar.ts);
        return tsMs >= startMs && tsMs <= endMs;
      });
    },
    replaceMarketBarsForInstrument: async (
      instrumentId: string,
      _symbol: string,
      nextBars: OhlcvBar[],
    ) => {
      hydratedBarsByInstrumentId.set(instrumentId, nextBars);
    },
  };
  const runTestBacktestBatchNow = (batchId: string) =>
    runBacktestBatchNow(batchId, { marketData: testMarketData });
  const getTestBacktestResultDetail = (batchId: string, symbol: string) =>
    getBacktestResultDetail(batchId, symbol, { marketData: testMarketData });

  t.after(async () => {
    cleanupTestRows(db);
    closeLocalDatabase();
    restoreEnvValue("ZINUTO_DB_PATH", previousDbPath);
    restoreEnvValue("ZINUTO_BACKTEST_NATIVE_BATCH", previousNativeBatch);
    restoreEnvValue("ZINUTO_BACKTEST_ENGINE_BIN", previousNativeBin);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const batch = createBacktestBatch({
    name: "Backtest service smoke",
    config: {
      name: "Backtest service smoke",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });

  const completed = await runTestBacktestBatchNow(batch.id);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.summary.engine, "TS_REFERENCE");
  assert.equal(completed.summary.totalSymbols, 1);

  const results = getBacktestResults(batch.id);
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0]?.symbol, TEST_SYMBOL);
  assert.equal(results.results[0]?.tradeCount, 3);
  assert.equal(results.results[0]?.conflictCount, 1);
  assert.equal(results.results[0]?.barsCount, bars.length);
  assert.equal(results.results[0]?.totalPnl, 90);
  assert.equal("summary" in (results.results[0] ?? {}), false);
  assert.equal(completed.summary.profitableResultCount, 1);
  assert.equal(completed.summary.averageProfitRate, results.results[0]?.profitRate);
  assert.equal(completed.summary.maxDrawdown, results.results[0]?.maxDrawdown);
  assert.equal(completed.summary.totalTrades, results.results[0]?.tradeCount);

  const largeSummaryMarker = "x".repeat(240_000);
  db.prepare("UPDATE backtest_results SET summary_json = ? WHERE id = ?").run(
    JSON.stringify({ largeSummaryMarker }),
    results.results[0]?.id,
  );
  const leanResults = getBacktestResults(batch.id);
  assert.ok(Buffer.byteLength(JSON.stringify(leanResults)) < 8 * 1024);

  const detail = await getTestBacktestResultDetail(batch.id, TEST_SYMBOL);
  assert.equal(detail.result.summary.largeSummaryMarker, largeSummaryMarker);
  assert.equal(detail.fills.length, 3);
  assert.equal(detail.equityCurve.length, bars.length);
  assert.equal(detail.bars.length, bars.length);
  assert.deepEqual(
    detail.bars.map((bar) => bar.rawIndex),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    detail.equityCurve.map((point) => point.equity),
    [1000, 1010, 1040, 1090],
  );
  const fillDetailPlan = db.prepare(
    `EXPLAIN QUERY PLAN
     SELECT id,batch_id,result_id,instrument_id,symbol,order_id,fill_index,fill_time,side,price,qty,
            gross,fee,tax,slippage,created_at
       FROM backtest_fills
      WHERE result_id = ?
      ORDER BY fill_index ASC, id ASC`,
  ).all(results.results[0]?.id) as Array<{ detail: string }>;
  assert.match(
    fillDetailPlan.map((row) => row.detail).join("\n"),
    /idx_backtest_fills_result_index/,
  );

  const bullishRuleCondition = {
    left: { kind: "OUTPUT" as const, key: "DIF" },
    operator: "CROSS_ABOVE" as const,
    right: { kind: "OUTPUT" as const, key: "DEA" },
  };
  const bearishRuleCondition = {
    left: { kind: "OUTPUT" as const, key: "DIF" },
    operator: "CROSS_BELOW" as const,
    right: { kind: "OUTPUT" as const, key: "DEA" },
  };
  const signalRuleBatch = createBacktestBatch({
    name: "Backtest service signal rule normalization",
    config: {
      name: "Backtest service signal rule normalization",
      strategySource: "DIF:CLOSE; DEA:OPEN;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
      },
      signalRules: {
        buy: { connector: "AND", conditions: [bullishRuleCondition, bullishRuleCondition] },
        cover: { connector: "AND", conditions: [bullishRuleCondition] },
        sell: { connector: "AND", conditions: [bearishRuleCondition] },
        short: { connector: "AND", conditions: [bearishRuleCondition, bearishRuleCondition] },
      },
    },
  });
  assert.equal(signalRuleBatch.config.signalRules?.buy?.conditions.length, 1);
  assert.equal(signalRuleBatch.config.signalRules?.cover, undefined);
  assert.equal(signalRuleBatch.config.signalRules?.sell, undefined);
  assert.equal(signalRuleBatch.config.signalRules?.short?.conditions.length, 1);
  assert.deepEqual(deleteBacktestBatch(signalRuleBatch.id), {
    deletedBatchId: signalRuleBatch.id,
  });

  const multiBatch = createBacktestBatch({
    name: "Backtest service multi symbol",
    config: {
      name: "Backtest service multi symbol",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID, TEST_INSTRUMENT_ID_2],
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });

  const completedMulti = await runTestBacktestBatchNow(multiBatch.id);
  assert.equal(completedMulti.status, "SUCCEEDED");
  assert.equal(completedMulti.summary.engine, "TS_REFERENCE");
  assert.equal(completedMulti.summary.totalSymbols, 2);
  assert.equal(completedMulti.progress.totalSymbols, 2);
  assert.equal(completedMulti.progress.completedSymbols, 2);

  const multiResults = getBacktestResults(multiBatch.id);
  assert.equal(multiResults.results.length, 2);
  assert.deepEqual(
    new Set(multiResults.results.map((result) => result.symbol)),
    new Set([TEST_SYMBOL, TEST_SYMBOL_2]),
  );

  const firstMultiDetail = await getTestBacktestResultDetail(multiBatch.id, TEST_SYMBOL);
  const secondMultiDetail = await getTestBacktestResultDetail(multiBatch.id, TEST_SYMBOL_2);
  assert.equal(firstMultiDetail.fills.length, 3);
  assert.equal(secondMultiDetail.fills.length, 3);
  assert.equal(firstMultiDetail.bars.length, bars.length);
  assert.equal(secondMultiDetail.bars.length, bars.length);
  assert.deepEqual(deleteBacktestBatch(multiBatch.id), {
    deletedBatchId: multiBatch.id,
  });

  const timeRangeBatch = createBacktestBatch({
    name: "Backtest service time range",
    config: {
      name: "Backtest service time range",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      startTime: "2026-01-02T00:00:00.000Z",
      endTime: "2026-01-03T23:59:59.999Z",
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });
  const completedTimeRange = await runTestBacktestBatchNow(timeRangeBatch.id);
  assert.equal(completedTimeRange.status, "SUCCEEDED");
  assert.equal(completedTimeRange.summary.engine, "TS_REFERENCE");
  const timeRangeResults = getBacktestResults(timeRangeBatch.id);
  assert.equal(timeRangeResults.results[0]?.barsCount, 2);
  const timeRangeDetail = await getTestBacktestResultDetail(timeRangeBatch.id, TEST_SYMBOL);
  assert.deepEqual(
    timeRangeDetail.bars.map((bar) => bar.ts),
    ["2026-01-02T09:30:00.000Z", "2026-01-03T09:30:00.000Z"],
  );
  assert.deepEqual(
    timeRangeDetail.bars.map((bar) => bar.rawIndex),
    [0, 1],
  );
  assert.deepEqual(deleteBacktestBatch(timeRangeBatch.id), {
    deletedBatchId: timeRangeBatch.id,
  });

  const openTimeRangeBatch = createBacktestBatch({
    name: "Backtest service open time range",
    config: {
      name: "Backtest service open time range",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      startTime: "2026-01-03T00:00:00.000Z",
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });
  const completedOpenTimeRange = await runTestBacktestBatchNow(openTimeRangeBatch.id);
  assert.equal(completedOpenTimeRange.status, "SUCCEEDED");
  const openTimeRangeResults = getBacktestResults(openTimeRangeBatch.id);
  assert.equal(openTimeRangeResults.results[0]?.barsCount, 2);
  assert.deepEqual(deleteBacktestBatch(openTimeRangeBatch.id), {
    deletedBatchId: openTimeRangeBatch.id,
  });

  assert.throws(() => createBacktestBatch({
    name: "Backtest service invalid time range",
    config: {
      name: "Backtest service invalid time range",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      startTime: "2026-01-04T00:00:00.000Z",
      endTime: "2026-01-03T23:59:59.999Z",
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  }), /BACKTEST_TIME_RANGE_INVALID/u);

  const skippedBatch = createBacktestBatch({
    name: "Backtest service skipped symbol summary",
    config: {
      name: "Backtest service skipped symbol summary",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID, TEST_INSTRUMENT_ID_3],
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });

  const completedWithSkip = await runTestBacktestBatchNow(skippedBatch.id);
  assert.equal(completedWithSkip.status, "SUCCEEDED");
  assert.equal(completedWithSkip.summary.totalCandidateSymbols, 2);
  assert.equal(completedWithSkip.summary.successfulSymbols, 1);
  assert.equal(completedWithSkip.summary.skippedSymbolCount, 1);
  assert.deepEqual(completedWithSkip.summary.failedSymbols, []);
  assert.deepEqual(completedWithSkip.progress.stage, "DONE");
  assert.equal(completedWithSkip.progress.totalSymbols, 2);
  assert.equal(completedWithSkip.progress.completedSymbols, 2);
  assert.deepEqual(
    completedWithSkip.summary.skippedSymbols,
    [{
      instrumentId: TEST_INSTRUMENT_ID_3,
      symbol: TEST_SYMBOL_3,
      reason: "NO_BARS",
    }],
  );

  const skippedResults = getBacktestResults(skippedBatch.id);
  assert.equal(skippedResults.results.length, 1);
  assert.equal(skippedResults.results[0]?.symbol, TEST_SYMBOL);
  assert.deepEqual(deleteBacktestBatch(skippedBatch.id), {
    deletedBatchId: skippedBatch.id,
  });

  const systemSeedBatch = createBacktestBatch({
    name: "Backtest service system seed hydration",
    config: {
      name: "Backtest service system seed hydration",
      strategySource: "BUY:0;",
      instrumentIds: [systemSeedInstrument.id],
      startIndex: 0,
      endIndex: 3,
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });

  const completedSystemSeed = await runTestBacktestBatchNow(systemSeedBatch.id);
  assert.equal(completedSystemSeed.status, "SUCCEEDED");
  assert.equal(completedSystemSeed.summary.totalCandidateSymbols, 1);
  assert.equal(completedSystemSeed.summary.successfulSymbols, 1);
  assert.equal(completedSystemSeed.summary.skippedSymbolCount, 0);
  assert.ok(
    (hydratedBarsByInstrumentId.get(systemSeedInstrument.id)?.length ?? 0) > 0,
  );
  const systemSeedDetail = await getTestBacktestResultDetail(
    systemSeedBatch.id,
    TEST_SYSTEM_SEED_SYMBOL,
  );
  assert.equal(systemSeedDetail.result.barsCount, 4);
  assert.deepEqual(
    systemSeedDetail.bars.map((bar) => bar.rawIndex),
    [0, 1, 2, 3],
  );
  assert.deepEqual(deleteBacktestBatch(systemSeedBatch.id), {
    deletedBatchId: systemSeedBatch.id,
  });

  process.env.ZINUTO_BACKTEST_NATIVE_BATCH = "1";
  delete process.env.ZINUTO_BACKTEST_ENGINE_BIN;

  const offsetBatch = createBacktestBatch({
    name: "Backtest service offset range",
    config: {
      name: "Backtest service offset range",
      strategySource: "BUY:1;",
      instrumentIds: [TEST_INSTRUMENT_ID],
      startIndex: 1,
      initialCapital: 1000,
      priceMode: "NEXT_OPEN",
      signalExecutionMode: "NEXT_OPEN",
      orderSizing: {
        mode: "FIXED_QTY",
        value: 10,
      },
      tradingSettings: zeroFeeAshareSettings(),
    },
  });

  const completedOffset = await runTestBacktestBatchNow(offsetBatch.id);
  assert.equal(completedOffset.status, "SUCCEEDED");
  assert.equal(completedOffset.summary.engine, "TS_REFERENCE");
  assert.equal(completedOffset.summary.nativeBatchFallback, true);
  assert.equal(completedOffset.summary.nativeBatchFallbackCode, "BACKTEST_NATIVE_ENGINE_UNAVAILABLE");
  const offsetDetail = await getTestBacktestResultDetail(offsetBatch.id, TEST_SYMBOL);
  assert.deepEqual(
    offsetDetail.bars.map((bar) => bar.rawIndex),
    [1, 2, 3],
  );
  assert.deepEqual(
    offsetDetail.equityCurve.map((point) => point.barIndex),
    [1, 2, 3],
  );
  assert.deepEqual(
    offsetDetail.fills.map((fill) => fill.fillIndex),
    [2, 3],
  );
  assert.deepEqual(
    offsetDetail.equityCurve.map((point) => point.equity),
    [1000, 1010, 1040],
  );
  assert.deepEqual(deleteBacktestBatch(offsetBatch.id), {
    deletedBatchId: offsetBatch.id,
  });

  assert.deepEqual(deleteBacktestBatch(batch.id), {
    deletedBatchId: batch.id,
  });

  const clearBatchA = createBacktestBatch({
    name: "Backtest service clear all A",
    config: {
      ...batch.config,
      name: "Backtest service clear all A",
    },
  });
  const clearBatchB = createBacktestBatch({
    name: "Backtest service clear all B",
    config: {
      ...batch.config,
      name: "Backtest service clear all B",
    },
  });
  assert.equal(
    listBacktestBatches().some((item) => item.id === clearBatchA.id || item.id === clearBatchB.id),
    true,
  );
  const cleared = clearBacktestBatches();
  assert.equal(cleared.deletedBatchCount, 2);
  assert.deepEqual(
    [...cleared.deletedBatchIds].sort(),
    [clearBatchA.id, clearBatchB.id].sort(),
  );
  assert.match(cleared.clearedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    listBacktestBatches().some((item) => item.id === clearBatchA.id || item.id === clearBatchB.id),
    false,
  );
});
