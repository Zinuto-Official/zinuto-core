// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseStoredTradingCalendarConfig,
  stableTradingCalendarKey,
} from "@zinuto/shared/tradingCalendar";
import { DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID } from "@zinuto/shared/trading";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-free-replay-timeframe-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5,6,7],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';
const DEFAULT_TRADING_CALENDAR = parseStoredTradingCalendarConfig(
  DEFAULT_TRADING_CALENDAR_JSON,
);

const { db } = await import("../../src/infrastructure/db/database.js");
const {
  replaceMarketBarsForInstrument,
  appendEdgeBarsForInstrumentFromCsvFile,
  getMarketReadDiagnostics,
  resetMarketReadDiagnostics,
  getMarketTimelineStorageStats,
  getMarketTimelineReadyPeriods,
} = await import("../../src/infrastructure/db/marketDatabase.js");
const { marketDatabaseHarness } = await import(
  "../support/marketDatabaseHarness.js"
);
const {
  getTradingSettings,
  createOrGetSession,
  createOrGetSessionBootstrap,
  executeSessionAction,
  getBarsFrameByInstrumentId,
  getFreeReplayStartPointOverview,
  getLastBootstrapFrameReadDiagnostics,
  getLatestResumableSession,
  getSessionRuntimeDelta,
  getSessionBootstrapById,
  getSessionOrderQuote,
} = await import("../../src/application/trading/core.js");
const { getFreeReplayPrepReadModel } = await import(
  "../../src/application/trading/freeReplayPrepReadModel.js"
);
const { initializeBackendAppContext } = await import(
  "../../src/runtime/compositionRoot.js"
);
const {
  buildReplayPayloadFromSessionArchive,
} = await import("../../src/application/historyService.js");
const { SYSTEM_WIKI_EOD_POOL_ID } = await import(
  "../../src/application/ports/infrastructure/db/systemSeedBars.js"
);

const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, source_folder, time_zone, time_zone_origin,
    base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source_folder = excluded.source_folder,
    time_zone = excluded.time_zone,
    time_zone_origin = excluded.time_zone_origin,
    base_timeframe = excluded.base_timeframe,
    field_mapping_json = excluded.field_mapping_json,
    trading_calendar_json = excluded.trading_calendar_json,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);

const upsertInstrumentStmt = db.prepare(
  `INSERT INTO instruments (
    id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step,
    bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_id = excluded.source_id,
    symbol = excluded.symbol,
    base_timeframe = excluded.base_timeframe,
    name = excluded.name,
    market = excluded.market,
    time_zone = excluded.time_zone,
    min_trade_step = excluded.min_trade_step,
    bar_count = excluded.bar_count,
    time_start_ts = excluded.time_start_ts,
    time_end_ts = excluded.time_end_ts,
    bars_version_token = excluded.bars_version_token`,
);

const upsertInstrument = {
  run: (
    instrumentId: string,
    sourceId: string,
    symbol: string,
    baseTimeframe: "1m" | "5m" | "1h" | "1d",
    name: string,
    market: string,
    timeZone: string,
    minTradeStep: number,
    barCount: number,
    timeStartTs: string | null,
    timeEndTs: string | null,
    barsVersionToken: string,
    createdAt: string,
  ) => {
    upsertSource.run(
      sourceId,
      sourceId,
      "",
      timeZone,
      "USER_SELECTED",
      baseTimeframe,
      "{}",
      DEFAULT_TRADING_CALENDAR_JSON,
      "READY",
      createdAt,
      createdAt,
    );
    return upsertInstrumentStmt.run(
      instrumentId,
      sourceId,
      symbol,
      baseTimeframe,
      name,
      market,
      timeZone,
      minTradeStep,
      barCount,
      timeStartTs,
      timeEndTs,
      barsVersionToken,
      createdAt,
    );
  },
};

const readReplaySessionTimeframes = db.prepare(
  `SELECT timeframe, minimum_base_timeframe AS minimumBaseTimeframe
     FROM replay_sessions
    WHERE id = ?`,
);

const readInstrumentVersionToken = db.prepare(
  `SELECT bars_version_token AS versionToken
     FROM instruments
    WHERE id = ?`,
);

const countReplaySessionsByInstrument = db.prepare(
  `SELECT COUNT(*) AS count
     FROM replay_sessions
    WHERE instrument_id = ?`,
);

const readBarsVersionToken = (instrumentId: string): string =>
  String(
    (
      readInstrumentVersionToken.get(instrumentId) as
        | { versionToken?: unknown }
        | undefined
    )?.versionToken ?? "",
  );

const readTimelineVersionToken = (instrumentId: string): string =>
  `${readBarsVersionToken(instrumentId)}:calendar:${stableTradingCalendarKey(DEFAULT_TRADING_CALENDAR)}`;

const assertHotTimelinePeriodsReady = async ({
  instrumentId,
  baseTimeframe,
  timeZone,
}: {
  instrumentId: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  timeZone: string;
}) => {
  const readyPeriods = await getMarketTimelineReadyPeriods({
    instrumentId,
    versionToken: readTimelineVersionToken(instrumentId),
    baseTimeframe,
    timeZone,
  });
  assert.deepEqual(
    ["1m", "5m", "1h", "1d"].every((period) =>
      readyPeriods.includes(period as (typeof readyPeriods)[number]),
    ),
    true,
  );
};

const buildMinuteBars = (startIso: string, count: number) => {
  const startMs = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, index) => {
    const base = 100 + index * 0.1;
    return {
      ts: new Date(startMs + index * 60_000).toISOString(),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 10 + index,
    };
  });
};

const buildHourlyBars = (startIso: string, count: number) => {
  const startMs = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, index) => {
    const base = 200 + index * 0.2;
    return {
      ts: new Date(startMs + index * 3_600_000).toISOString(),
      open: base,
      high: base + 2,
      low: base - 2,
      close: base + 1,
      volume: 100 + index,
    };
  });
};

const buildIntervalBars = (startIso: string, count: number, intervalMs: number) => {
  const startMs = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, index) => {
    const base = 300 + index * 0.3;
    return {
      ts: new Date(startMs + index * intervalMs).toISOString(),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 1_000 + index,
    };
  });
};

const writeBarsCsv = async (name: string, bars: ReturnType<typeof buildMinuteBars>) => {
  const filePath = path.join(tempDataDir, `${name}.csv`);
  await fs.promises.writeFile(
    filePath,
    [
      "timestamp,open,high,low,close,volume",
      ...bars.map((bar) =>
        [
          bar.ts,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
        ].join(","),
      ),
    ].join("\n"),
    "utf8",
  );
  return filePath;
};

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("free replay prep excludes importing local pools without blocking system pools", async () => {
  initializeBackendAppContext();
  const instrumentId = "free-replay-importing-local";
  const sourceId = "pool-importing-free-replay";
  const symbol = "IMPORTING.TEST";
  const createdAt = new Date().toISOString();
  try {
    upsertInstrument.run(
      instrumentId,
      sourceId,
      symbol,
      "1d",
      "Importing source test",
      "LOCAL",
      "UTC",
      1,
      2,
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "bars-importing-local",
      createdAt,
    );
    db.prepare(
      `UPDATE local_data_sources
          SET status = 'IMPORTING',
              updated_at = ?
        WHERE id = ?`,
    ).run(createdAt, sourceId);
    db.prepare(
      `INSERT INTO local_data_source_files (
        id, source_id, job_id, instrument_id, symbol, file_name, file_path,
        file_size, file_mtime_ms, file_fingerprint, status, rows_total,
        rows_imported, rows_skipped, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "file-importing-free-replay",
      sourceId,
      "job-importing-free-replay",
      instrumentId,
      symbol,
      "importing.csv",
      "importing.csv",
      100,
      0,
      "fingerprint-importing",
      "IMPORTING",
      2,
      2,
      0,
      createdAt,
      createdAt,
    );

    const localModel = await getFreeReplayPrepReadModel({
      mode: "RANDOM",
      selectedPoolId: sourceId,
    });
    assert.notEqual(localModel.selectedPool?.id, sourceId);
    assert.equal(localModel.pools.some((pool) => pool.id === sourceId), false);

    const systemModel = await getFreeReplayPrepReadModel({
      mode: "RANDOM",
      selectedPoolId: SYSTEM_WIKI_EOD_POOL_ID,
    });
    assert.equal(systemModel.selectedPool?.id, SYSTEM_WIKI_EOD_POOL_ID);
    assert.equal(systemModel.selectedPool?.sourceLocked, false);
    assert.equal(systemModel.startCandidates.length, 0);
    assert.equal(systemModel.facts.trainableSymbolCount > 0, true);
    assert.equal(systemModel.startReadiness.readiness.canStart, true);
  } finally {
    // The source is intentionally left in an importing state for this isolated test database.
  }
});

test("free replay overview and sessions separate source timeframe from minimum timeframe", async () => {
  const instrumentId = "system-minute-overview";
  const symbol = "TIMEFRAME.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2026-01-01T00:00:00.000Z", 3 * 24 * 60);

  upsertInstrument.run(
    instrumentId,
    "pool-timeframe",
    symbol,
    "1m",
    "Timeframe test",
    "LOCAL",
    "UTC",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    minuteBars[minuteBars.length - 1]?.ts ?? null,
    "bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);
  await assertHotTimelinePeriodsReady({
    instrumentId,
    baseTimeframe: "1m",
    timeZone: "UTC",
  });

  resetMarketReadDiagnostics();
  const overview = await getFreeReplayStartPointOverview(
    instrumentId,
    "1d",
    0,
    10,
  );
  const overviewReadDiagnostics = getMarketReadDiagnostics();
  assert.equal(overviewReadDiagnostics.fullRawReadCount, 0);
  assert.equal(overviewReadDiagnostics.rangeReadCount, 0);
  assert.equal(overview.sourceTimeframe, "1m");
  assert.equal(overview.minimumBaseTimeframe, "1d");
  assert.equal(overview.effectiveTimeframe, "1d");
  assert.equal(overview.total, 3);
  assert.deepEqual(
    overview.bars.map((item) => ({
      startRawIndex: item.startRawIndex,
      endRawIndex: item.endRawIndex,
    })),
    [
      { startRawIndex: 0, endRawIndex: 1439 },
      { startRawIndex: 1440, endRawIndex: 2879 },
      { startRawIndex: 2880, endRawIndex: 4319 },
    ],
  );

  resetMarketReadDiagnostics();
  const hourlyOverview = await getFreeReplayStartPointOverview(
    instrumentId,
    "1h",
    0,
    4,
  );
  const hourlyOverviewReadDiagnostics = getMarketReadDiagnostics();
  assert.equal(hourlyOverviewReadDiagnostics.fullRawReadCount, 0);
  assert.equal(hourlyOverviewReadDiagnostics.rangeReadCount, 0);
  assert.equal(hourlyOverview.effectiveTimeframe, "1h");
  assert.equal(hourlyOverview.total, 72);
  assert.deepEqual(
    hourlyOverview.bars.map((item) => ({
      startRawIndex: item.startRawIndex,
      endRawIndex: item.endRawIndex,
    })),
    [
      { startRawIndex: 0, endRawIndex: 59 },
      { startRawIndex: 60, endRawIndex: 119 },
      { startRawIndex: 120, endRawIndex: 179 },
      { startRawIndex: 180, endRawIndex: 239 },
    ],
  );

  resetMarketReadDiagnostics();
  const fiveMinuteOverview = await getFreeReplayStartPointOverview(
    instrumentId,
    "5m",
    0,
    3,
  );
  const fiveMinuteOverviewReadDiagnostics = getMarketReadDiagnostics();
  assert.equal(fiveMinuteOverviewReadDiagnostics.fullRawReadCount, 0);
  assert.equal(fiveMinuteOverviewReadDiagnostics.rangeReadCount, 0);
  assert.equal(fiveMinuteOverview.effectiveTimeframe, "5m");
  assert.equal(fiveMinuteOverview.total, 864);
  assert.deepEqual(
    fiveMinuteOverview.bars.map((item) => ({
      startRawIndex: item.startRawIndex,
      endRawIndex: item.endRawIndex,
    })),
    [
      { startRawIndex: 0, endRawIndex: 4 },
      { startRawIndex: 5, endRawIndex: 9 },
      { startRawIndex: 10, endRawIndex: 14 },
    ],
  );
  await assert.rejects(
    () => getFreeReplayStartPointOverview(instrumentId, "1w", 0, 1),
    { code: "INVALID_PARAMS" },
  );
  const boundedRawOverview = await getFreeReplayStartPointOverview(
    instrumentId,
    "1m",
    0,
    2,
    {
      rawStartIndex: 0,
      rawEndIndex: 1,
    },
  );
  assert.equal(boundedRawOverview.bars.length, 2);
  await assert.rejects(
    () =>
      getFreeReplayStartPointOverview(instrumentId, "1m", 0, 2, {
        rawStartIndex: 0,
        rawEndIndex: 2,
      }),
    { code: "BARS_RANGE_LIMIT_EXCEEDED" },
  );

  resetMarketReadDiagnostics();
  const dailyFrame = await getBarsFrameByInstrumentId(instrumentId, 0, 3 * 24 * 60, {
    displayPeriod: "1d",
    maxDisplayBars: 10,
  });
  const frameReadDiagnostics = getMarketReadDiagnostics();
  const dailyTimelineStorage = await getMarketTimelineStorageStats(instrumentId);
  assert.equal(frameReadDiagnostics.fullRawReadCount, 0);
  assert.equal(dailyFrame.displayPeriod, "1d");
  assert.equal(dailyFrame.totalRaw, minuteBars.length);
  assert.equal(dailyFrame.totalDisplay, 3);
  await assertHotTimelinePeriodsReady({
    instrumentId,
    baseTimeframe: "1m",
    timeZone: "UTC",
  });
  assert.equal(dailyTimelineStorage.persistedDisplayRowsByPeriod["1d"], 3);
  assert.equal(dailyTimelineStorage.persistedDisplayRowsByPeriod["1m"] ?? 0, 0);
  assert.equal(dailyTimelineStorage.persistedDisplayRowsByPeriod["5m"] ?? 0, 0);
  assert.deepEqual(
    dailyFrame.startRawIndex.map((_, index) => ({
      startRawIndex: dailyFrame.startRawIndex[index],
      endRawIndex: dailyFrame.endRawIndex[index],
    })),
    [
      { startRawIndex: 0, endRawIndex: 1439 },
      { startRawIndex: 1440, endRawIndex: 2879 },
      { startRawIndex: 2880, endRawIndex: 4319 },
    ],
  );

  const sessionCountBeforeRejectedAnchor = Number(
    (
      countReplaySessionsByInstrument.get(instrumentId) as
        | { count?: unknown }
        | undefined
    )?.count ?? 0,
  );
  await assert.rejects(
    () =>
      createOrGetSessionBootstrap(
        symbol,
        "1m",
        true,
        overview.bars[2]?.endRawIndex,
        {
          samplePoolId: "pool-timeframe",
          minimumBaseTimeframe: "1d",
          backwardBars: 10,
          forwardBars: 5,
        },
      ),
    { code: "INVALID_PARAMS" },
  );
  assert.equal(
    Number(
      (
        countReplaySessionsByInstrument.get(instrumentId) as
          | { count?: unknown }
          | undefined
      )?.count ?? 0,
    ),
    sessionCountBeforeRejectedAnchor,
  );

  resetMarketReadDiagnostics();
  const bootstrapAnchorIndex = overview.bars[1]?.endRawIndex ?? 1440;
  const bootstrap = await createOrGetSessionBootstrap(
    symbol,
    "1m",
    true,
    bootstrapAnchorIndex,
    {
      samplePoolId: "pool-timeframe",
      minimumBaseTimeframe: "1d",
      backwardBars: 10,
      forwardBars: 5,
    },
  );
  const bootstrapReadDiagnostics = getLastBootstrapFrameReadDiagnostics();
  const marketReadDiagnostics = getMarketReadDiagnostics();
  assert.equal(marketReadDiagnostics.fullRawReadCount, 0);
  assert.equal(bootstrapReadDiagnostics?.didFullRawRead, false);
  assert.ok((bootstrapReadDiagnostics?.rangeReadCountDelta ?? 0) <= 1);
  assert.equal(bootstrap.chartFrame.displayPeriod, "1d");
  assert.equal(bootstrap.chartFrame.totalRaw, minuteBars.length);
  assert.equal(bootstrap.chartFrame.totalDisplay, 3);
  assert.equal(bootstrap.chartFrame.timestampMs.length, 3);
  assert.deepEqual(
    bootstrap.chartFrame.startRawIndex.map((_, index) => ({
      startRawIndex: bootstrap.chartFrame.startRawIndex[index],
      endRawIndex: bootstrap.chartFrame.endRawIndex[index],
    })),
    [
      { startRawIndex: 0, endRawIndex: 1439 },
      { startRawIndex: 1440, endRawIndex: 2879 },
      { startRawIndex: 2880, endRawIndex: 4319 },
    ],
  );
  assert.ok(bootstrap.chartFrame.rawStartIndex <= bootstrapAnchorIndex);
  assert.ok(bootstrap.chartFrame.rawEndIndex >= bootstrapAnchorIndex);
  assert.ok(bootstrap.chartFrame.versionToken.length > 0);
  assert.equal(bootstrap.snapshot.session.timeframe, "1m");
  assert.equal(bootstrap.snapshot.session.minimumBaseTimeframe, "1d");

  const resumedBootstrap = await getSessionBootstrapById(
    bootstrap.snapshot.session.id,
    {
      backwardBars: 10,
      forwardBars: 5,
    },
  );
  assert.equal(resumedBootstrap.chartFrame.displayPeriod, "1d");
  assert.equal(resumedBootstrap.chartFrame.totalRaw, minuteBars.length);
  assert.equal(resumedBootstrap.chartFrame.totalDisplay, 3);
  assert.ok(resumedBootstrap.chartFrame.rawStartIndex <= bootstrapAnchorIndex);
  assert.ok(resumedBootstrap.chartFrame.rawEndIndex >= bootstrapAnchorIndex);

  const rawSession = await createOrGetSession(symbol, "1m", false, undefined, {
    samplePoolId: "pool-timeframe",
    minimumBaseTimeframe: "1m",
  });
  const aggregatedSession = await createOrGetSession(
    symbol,
    "1m",
    false,
    undefined,
    {
      samplePoolId: "pool-timeframe",
      minimumBaseTimeframe: "1d",
    },
  );

  assert.notEqual(rawSession.id, aggregatedSession.id);
  assert.equal(rawSession.timeframe, "1m");
  assert.equal(rawSession.minimum_base_timeframe, "1m");
  assert.equal(aggregatedSession.timeframe, "1m");
  assert.equal(aggregatedSession.minimum_base_timeframe, "1d");

  const aggregatedSessionRow = readReplaySessionTimeframes.get(
    aggregatedSession.id,
  ) as
    | { timeframe: string; minimumBaseTimeframe: string }
    | undefined;
  assert.equal(aggregatedSessionRow?.timeframe, "1m");
  assert.equal(aggregatedSessionRow?.minimumBaseTimeframe, "1d");

  const started = await createOrGetSession(
    symbol,
    "1m",
    true,
    overview.bars[1]?.endRawIndex,
    {
      samplePoolId: "pool-timeframe",
      minimumBaseTimeframe: "1d",
    },
  );
  assert.equal(started.timeframe, "1m");
  assert.equal(started.minimum_base_timeframe, "1d");

  const latest = await getLatestResumableSession();
  assert.ok(latest);
  assert.equal(latest?.timeframe, "1m");
  assert.equal(latest?.minimumBaseTimeframe, "1d");

  const stepSession = await createOrGetSession(
    symbol,
    "1m",
    true,
    overview.bars[1]?.endRawIndex,
    {
      samplePoolId: "pool-timeframe",
      minimumBaseTimeframe: "1d",
    },
  );
  resetMarketReadDiagnostics();
  const stepResult = await executeSessionAction(stepSession.id, {
    action: "STEP",
    displayPeriod: "1d",
  });
  const stepDiagnostics = getMarketReadDiagnostics();
  assert.equal(stepDiagnostics.fullRawReadCount, 0);
  assert.equal(stepResult.session.cursor_index, overview.bars[2]?.endRawIndex);
  assert.equal(stepResult.runtimeContext?.displayPeriod, "1d");
  assert.equal(stepResult.runtimeContext?.previousCursorRawIndex, overview.bars[1]?.endRawIndex);

  const orderSession = await createOrGetSession(
    symbol,
    "1m",
    true,
    overview.bars[0]?.endRawIndex,
    {
      samplePoolId: "pool-timeframe",
      minimumBaseTimeframe: "1d",
    },
  );
  const nextOpenQuote = await getSessionOrderQuote(orderSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  assert.equal(nextOpenQuote.executionPlan?.fillRawIndex, overview.bars[1]?.startRawIndex);
  assert.equal(nextOpenQuote.executionPlan?.targetRawIndex, overview.bars[1]?.endRawIndex);
  assert.equal(nextOpenQuote.executionPlan?.nextOpenDisplayIndex, 1);

  resetMarketReadDiagnostics();
  const orderResult = await executeSessionAction(orderSession.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  const orderDiagnostics = getMarketReadDiagnostics();
  assert.equal(orderDiagnostics.fullRawReadCount, 0);
  assert.equal(orderDiagnostics.displayContainingReadCount, 1);
  assert.equal(orderDiagnostics.displayIndexReadCount, 1);
  assert.equal(orderResult.session.cursor_index, overview.bars[1]?.endRawIndex);
  assert.equal(orderResult.fillIds.length, 1);
  assert.equal(orderResult.runtimeContext?.displayPeriod, "1d");
});

test("free replay start point overview exposes aggregate display with training indexes", async () => {
  const instrumentId = "system-minute-aggregate-overview";
  const symbol = "AGGREGATE.TIMEFRAME.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2026-02-01T00:00:00.000Z", 6 * 24 * 60);

  upsertInstrument.run(
    instrumentId,
    "pool-aggregate-timeframe",
    symbol,
    "1m",
    "Aggregate timeframe test",
    "LOCAL",
    "UTC",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    minuteBars[minuteBars.length - 1]?.ts ?? null,
    "bars-aggregate-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);
  await assertHotTimelinePeriodsReady({
    instrumentId,
    baseTimeframe: "1m",
    timeZone: "UTC",
  });

  const hourlyOverview = await getFreeReplayStartPointOverview(
    instrumentId,
    "1m",
    0,
    5000,
    { displayPeriod: "1h" },
  );
  assert.equal(hourlyOverview.displayPeriod, "1h");
  assert.equal(hourlyOverview.trainingTotal, minuteBars.length);
  assert.equal(hourlyOverview.total, 6 * 24);
  assert.equal(hourlyOverview.bars.length, 6 * 24);
  assert.equal(hourlyOverview.bars[0]?.startTrainingIndex, 0);
  assert.equal(hourlyOverview.bars[0]?.endTrainingIndex, 59);
  assert.equal(hourlyOverview.bars.at(-1)?.endTrainingIndex, minuteBars.length - 1);

  for (const displayPeriod of ["1d", "1w", "1month", "1year"] as const) {
    const overview = await getFreeReplayStartPointOverview(
      instrumentId,
      "1m",
      0,
      5000,
      { displayPeriod },
    );
    assert.equal(overview.displayPeriod, displayPeriod);
    assert.equal(overview.trainingTotal, minuteBars.length);
    assert.ok(overview.total <= 5000);
    assert.ok(overview.bars.length <= 5000);
  }
  const aggregateTimelineStorage = await getMarketTimelineStorageStats(instrumentId);
  assert.ok((aggregateTimelineStorage.persistedDisplayRowsByPeriod["1d"] ?? 0) > 0);
  for (const coldCalendarPeriod of ["1w", "1month", "1year"] as const) {
    assert.equal(aggregateTimelineStorage.persistedDisplayRowsByPeriod[coldCalendarPeriod] ?? 0, 0);
    assert.ok((aggregateTimelineStorage.anchorRowsByPeriod[coldCalendarPeriod] ?? 0) > 0);
  }

  const boundedDailyOverview = await getFreeReplayStartPointOverview(
    instrumentId,
    "1m",
    0,
    10,
    {
      rawStartIndex: 0,
      rawEndIndex: 3 * 24 * 60 - 1,
      displayPeriod: "1d",
    },
  );
  assert.equal(boundedDailyOverview.displayPeriod, "1d");
  assert.equal(boundedDailyOverview.bars.length, 3);
  assert.equal(boundedDailyOverview.bars[0]?.startTrainingIndex, 0);
  assert.equal(
    boundedDailyOverview.bars.at(-1)?.endTrainingIndex,
    3 * 24 * 60 - 1,
  );
});

test("free replay archive uses aggregate display bars for large raw windows", async () => {
  const instrumentId = "system-minute-large-archive-display";
  const symbol = "ARCHIVE.LARGE.TIMEFRAME.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2026-03-01T00:00:00.000Z", 60 * 24 * 60);
  const archiveDayCount = 56;
  const anchorRawIndex = archiveDayCount * 24 * 60 - 1;

  upsertInstrument.run(
    instrumentId,
    "pool-large-archive-display",
    symbol,
    "1m",
    "Large archive display test",
    "LOCAL",
    "UTC",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    minuteBars[minuteBars.length - 1]?.ts ?? null,
    "bars-large-archive-display-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);
  await assertHotTimelinePeriodsReady({
    instrumentId,
    baseTimeframe: "1m",
    timeZone: "UTC",
  });

  const session = await createOrGetSession(symbol, "1m", true, anchorRawIndex, {
    instrumentId,
    samplePoolId: "pool-large-archive-display",
    minimumBaseTimeframe: "1d",
    archiveStartIndex: 0,
  });
  assert.equal(session.start_index, 0);
  assert.equal(session.cursor_index, anchorRawIndex);

  await assert.rejects(
    () =>
      buildReplayPayloadFromSessionArchive(
        session.id,
        100_000,
        [],
        undefined,
        "1m",
        null,
        { bypassAccessGuard: true },
      ),
    { code: "BARS_RANGE_LIMIT_EXCEEDED" },
  );

  resetMarketReadDiagnostics();
  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    100_000,
    [],
    undefined,
    "1d",
    null,
    { bypassAccessGuard: true },
  );
  const diagnostics = getMarketReadDiagnostics();
  const replay = archive.replay as
    | {
        bars?: Array<{ startRawIndex?: number; endRawIndex?: number }>;
        snapshot?: { session?: { start_index?: number; cursor_index?: number } };
      }
    | undefined;

  assert.equal(diagnostics.fullRawReadCount, 0);
  assert.equal(diagnostics.rangeReadCount, 0);
  assert.equal(archive.baseTimeframe, "1m");
  assert.equal(archive.replayOmitted, false);
  assert.equal(replay?.bars?.length, archiveDayCount);
  assert.equal(replay?.bars?.[0]?.startRawIndex, 0);
  assert.equal(replay?.bars?.at(-1)?.endRawIndex, anchorRawIndex);
  assert.equal(replay?.snapshot?.session?.start_index, 0);
  assert.equal(replay?.snapshot?.session?.cursor_index, archiveDayCount - 1);
});

test("free replay with future bars does not terminate when the current minimum trade is unaffordable", async () => {
  const instrumentId = "system-minute-unaffordable-current-bar";
  const symbol = "UNAFFORDABLE.CURRENT.TEST";
  const createdAt = new Date().toISOString();
  const highPriceBars = buildMinuteBars("2026-02-10T00:00:00.000Z", 20).map(
    (bar, index) => {
      const price = 1_000 + index;
      return {
        ...bar,
        open: price,
        high: price + 2,
        low: price - 2,
        close: price + 1,
      };
    },
  );

  upsertInstrument.run(
    instrumentId,
    "pool-unaffordable-current",
    symbol,
    "1m",
    "Unaffordable current bar test",
    "LOCAL",
    "UTC",
    100,
    0,
    highPriceBars[0]?.ts ?? null,
    highPriceBars[highPriceBars.length - 1]?.ts ?? null,
    "unaffordable-current-bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, highPriceBars);
  const baseSettings = getTradingSettings();

  const bootstrap = await createOrGetSessionBootstrap(
    symbol,
    "1m",
    true,
    0,
    {
      instrumentId,
      samplePoolId: "pool-unaffordable-current",
      minimumBaseTimeframe: "1m",
      sessionTradingSettings: {
        ...baseSettings,
        ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
        initialSecuritiesBalance: 50_000,
        positionCostMode: baseSettings.positionCostMode,
        freeReplayEndSettlementMode: baseSettings.freeReplayEndSettlementMode,
        tradeAmountIncludesFees: false,
        minTradeStep: 100,
        contractMultiplier: 1,
        allowLongMarginTrading: false,
        allowShortSelling: false,
      },
      backwardBars: 2,
      forwardBars: 4,
    },
  );

  assert.equal(bootstrap.snapshot.termination?.hasFutureBars, true);
  assert.equal(bootstrap.snapshot.termination?.canOpenMinLong, false);
  assert.equal(bootstrap.snapshot.termination?.canOpenMinShort, false);
  assert.equal(bootstrap.snapshot.termination?.isTerminated, false);
  assert.equal(bootstrap.snapshot.actionState?.allowStep, true);
  assert.equal(bootstrap.snapshot.actionState?.allowBuy, false);

  const stepResult = await executeSessionAction(bootstrap.session.id, {
    action: "STEP",
    displayPeriod: "1m",
  });

  assert.equal(stepResult.session.cursor_index, 1);
});

test("free replay step advance state stays light across common display periods", async () => {
  const instrumentId = "system-minute-advance-state";
  const symbol = "ADVANCE.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2026-02-01T00:00:00.000Z", 3 * 24 * 60);

  upsertInstrument.run(
    instrumentId,
    "pool-advance-state",
    symbol,
    "1m",
    "Advance state test",
    "LOCAL",
    "UTC",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    minuteBars[minuteBars.length - 1]?.ts ?? null,
    "advance-state-bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);

  const cases = [
    {
      displayPeriod: "1m" as const,
      targets: [1, 2],
      displayIndexes: [1, 2],
    },
    {
      displayPeriod: "5m" as const,
      targets: [4, 9],
      displayIndexes: [0, 1],
    },
    {
      displayPeriod: "1h" as const,
      targets: [59, 119],
      displayIndexes: [0, 1],
    },
    {
      displayPeriod: "1d" as const,
      targets: [1439, 2879],
      displayIndexes: [0, 1],
    },
  ];

  for (const item of cases) {
    const session = await createOrGetSession(symbol, "1m", true, 0, {
      samplePoolId: "pool-advance-state",
      minimumBaseTimeframe: "1d",
    });
    if (item.displayPeriod === "1m") {
      await assertHotTimelinePeriodsReady({
        instrumentId,
        baseTimeframe: "1m",
        timeZone: "UTC",
      });
    }
    resetMarketReadDiagnostics();

    const first = await executeSessionAction(session.id, {
      action: "STEP",
      displayPeriod: item.displayPeriod,
    });
    assert.equal(first.session.cursor_index, item.targets[0]);
    assert.equal(first.runtimeContext?.advanceState?.cursorRawIndex, item.targets[0]);
    assert.equal(first.runtimeContext?.advanceState?.displayIndex, item.displayIndexes[0]);

    const second = await executeSessionAction(session.id, {
      action: "STEP",
      displayPeriod: item.displayPeriod,
    });
    assert.equal(second.runtimeContext?.previousCursorRawIndex, item.targets[0]);
    assert.equal(second.session.cursor_index, item.targets[1]);
    assert.equal(second.runtimeContext?.advanceState?.cursorRawIndex, item.targets[1]);
    assert.equal(second.runtimeContext?.advanceState?.displayIndex, item.displayIndexes[1]);

    const diagnostics = getMarketReadDiagnostics();
    assert.equal(diagnostics.fullRawReadCount, 0);
  }
});

test("free replay continuous hot steps keep delta equivalent to full frames", async () => {
  const cases = [
    { displayPeriod: "1m" as const, intervalMs: 60_000 },
    { displayPeriod: "5m" as const, intervalMs: 5 * 60_000 },
    { displayPeriod: "1h" as const, intervalMs: 60 * 60_000 },
    { displayPeriod: "1d" as const, intervalMs: 24 * 60 * 60_000 },
  ];

  for (const item of cases) {
    const instrumentId = `system-hot-step-${item.displayPeriod}`;
    const symbol = `HOT.${item.displayPeriod.toUpperCase()}.TEST`;
    const createdAt = new Date().toISOString();
    const bars = buildIntervalBars("2026-03-01T00:00:00.000Z", 240, item.intervalMs);
    upsertInstrument.run(
      instrumentId,
      `pool-hot-step-${item.displayPeriod}`,
      symbol,
      item.displayPeriod,
      `Hot step ${item.displayPeriod}`,
      "LOCAL",
      "UTC",
      1,
      0,
      bars[0]?.ts ?? null,
      bars[bars.length - 1]?.ts ?? null,
      `hot-step-${item.displayPeriod}-bars-v1`,
      createdAt,
    );
    await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
    await assertHotTimelinePeriodsReady({
      instrumentId,
      baseTimeframe: item.displayPeriod,
      timeZone: "UTC",
    });
    const session = await createOrGetSession(symbol, item.displayPeriod, true, 0, {
      samplePoolId: `pool-hot-step-${item.displayPeriod}`,
      minimumBaseTimeframe: item.displayPeriod,
    });

    for (let index = 0; index < 200; index += 1) {
      const actionResult = await executeSessionAction(session.id, {
        action: "STEP",
        displayPeriod: item.displayPeriod,
      });
      const delta = await getSessionRuntimeDelta(session.id, actionResult, 0);
      const frame = await getBarsFrameByInstrumentId(instrumentId, 0, 25, {
        displayPeriod: item.displayPeriod,
        anchorRawIndex: delta.cursorRawIndex,
        before: 12,
        after: 12,
        maxDisplayBars: 25,
      });
      const frameIndex = frame.displayIndex.indexOf(delta.displayIndex ?? -1);
      assert.ok(frameIndex >= 0);
      assert.equal(delta.cursorRawIndex, index + 1);
      assert.equal(delta.displayStartRawIndex, frame.startRawIndex[frameIndex]);
      assert.equal(delta.displayEndRawIndex, frame.endRawIndex[frameIndex]);
    }
  }
});

test("market timeline hot periods prewarm after incremental append", async () => {
  const instrumentId = "system-minute-append-prewarm";
  const symbol = "APPEND.PREWARM.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2026-02-01T00:00:00.000Z", 60);
  const appendedBars = buildMinuteBars("2026-02-01T01:00:00.000Z", 5);

  upsertInstrument.run(
    instrumentId,
    "pool-append-prewarm",
    symbol,
    "1m",
    "Append prewarm test",
    "LOCAL",
    "UTC",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    appendedBars[appendedBars.length - 1]?.ts ?? null,
    "append-prewarm-bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);
  const initialVersionToken = readBarsVersionToken(instrumentId);
  const csvPath = await writeBarsCsv("append-prewarm", appendedBars);
  const appendResult = await appendEdgeBarsForInstrumentFromCsvFile(
    instrumentId,
    symbol,
    csvPath,
    {
      timestampMode: "SINGLE",
      date: "timestamp",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "volume",
    },
    "UTC",
  );

  assert.equal(appendResult.importedRows, appendedBars.length);
  assert.notEqual(readBarsVersionToken(instrumentId), initialVersionToken);
  await marketDatabaseHarness.awaitTimelinePrewarmIdle();
  await assertHotTimelinePeriodsReady({
    instrumentId,
    baseTimeframe: "1m",
    timeZone: "UTC",
  });
});

test("market timeline daily buckets honor source time zone DST boundaries", async () => {
  const instrumentId = "system-hourly-dst-overview";
  const symbol = "DST.TEST";
  const createdAt = new Date().toISOString();
  const hourlyBars = buildHourlyBars("2025-03-09T05:00:00.000Z", 47);

  upsertInstrument.run(
    instrumentId,
    "pool-dst-overview",
    symbol,
    "1h",
    "DST test",
    "LOCAL",
    "America/New_York",
    1,
    0,
    hourlyBars[0]?.ts ?? null,
    hourlyBars[hourlyBars.length - 1]?.ts ?? null,
    "dst-bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, hourlyBars);

  const dailyFrame = await getBarsFrameByInstrumentId(instrumentId, 0, 100, {
    displayPeriod: "1d",
    maxDisplayBars: 10,
  });

  assert.equal(dailyFrame.schemaVersion, "zinuto-market-frame-v2");
  assert.equal(dailyFrame.timeZone, "America/New_York");
  assert.equal(dailyFrame.totalRaw, 47);
  assert.equal(dailyFrame.totalDisplay, 2);
  assert.deepEqual(dailyFrame.displayIndex, [0, 1]);
  assert.deepEqual(dailyFrame.startRawIndex, [0, 23]);
  assert.deepEqual(dailyFrame.endRawIndex, [22, 46]);
});

test("market timeline fixed buckets remain raw-chronological across DST fallback", async () => {
  const instrumentId = "system-minute-dst-fallback-fixed";
  const symbol = "DST.FIXED.TEST";
  const createdAt = new Date().toISOString();
  const minuteBars = buildMinuteBars("2025-11-02T04:00:00.000Z", 4 * 60);

  upsertInstrument.run(
    instrumentId,
    "pool-dst-fixed",
    symbol,
    "1m",
    "DST fixed bucket test",
    "LOCAL",
    "America/New_York",
    1,
    0,
    minuteBars[0]?.ts ?? null,
    minuteBars[minuteBars.length - 1]?.ts ?? null,
    "dst-fixed-bars-v1",
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, minuteBars);

  const fiveMinuteFrame = await getBarsFrameByInstrumentId(instrumentId, 0, 100, {
    displayPeriod: "5m",
    maxDisplayBars: 100,
  });
  const timelineStorage = await getMarketTimelineStorageStats(instrumentId);

  assert.equal(fiveMinuteFrame.schemaVersion, "zinuto-market-frame-v2");
  assert.equal(fiveMinuteFrame.timeZone, "America/New_York");
  assert.equal(fiveMinuteFrame.totalRaw, minuteBars.length);
  assert.equal(fiveMinuteFrame.totalDisplay, 48);
  assert.equal(timelineStorage.persistedDisplayRowsByPeriod["5m"] ?? 0, 0);
  assert.ok((timelineStorage.anchorRowsByPeriod["5m"] ?? 0) > 0);
  assert.deepEqual(
    fiveMinuteFrame.displayIndex,
    Array.from({ length: 48 }, (_, index) => index),
  );
  for (let index = 1; index < fiveMinuteFrame.startRawIndex.length; index += 1) {
    assert.ok(
      fiveMinuteFrame.startRawIndex[index] > fiveMinuteFrame.endRawIndex[index - 1],
    );
    assert.ok(
      fiveMinuteFrame.timestampMs[index] > fiveMinuteFrame.timestampMs[index - 1],
    );
  }
});
