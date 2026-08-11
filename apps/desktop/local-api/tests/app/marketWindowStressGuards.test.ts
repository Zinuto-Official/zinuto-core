// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import type { MarketBarFrame, OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-window-stress-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db },
  marketDatabaseModule,
  marketReadCacheModule,
  tradingCoreModule,
  questionBankModule,
  replayRefStoreModule,
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/infrastructure/db/marketReadCache.js"),
  import("../../src/application/trading/core.js"),
  import("../../src/application/specialTraining/questionBank.js"),
  import("../../src/infrastructure/db/history/replayRefStore.js"),
]);

const {
  getMarketReadDiagnostics,
  replaceMarketBarsForInstrument,
  resetMarketReadDiagnostics,
} = marketDatabaseModule;
const {
  getBarsFrameByInstrumentId,
  getFreeReplayStartPointOverview,
} = tradingCoreModule;
const {
  buildMarketBarFrameCacheKey,
  getCachedMarketBarFrame,
  getMarketBarFrameCacheStats,
  getOrLoadCachedMarketBarFrame,
  invalidateMarketReadCaches,
} = marketReadCacheModule;
const {
  buildQuestionFromSlot,
  resolveDisplaySlotByOrdinal,
  resolveQuestionScopeState,
} = questionBankModule;
const {
  loadTrainingProjectReplayWindowFromRef,
  saveTrainingProjectReplayRef,
} = replayRefStoreModule;

const BAR_COUNT = 20_000;
const OVERVIEW_LIMIT = DESKTOP_API_LIMITS.startPointOverviewBarsMax;
const INSTRUMENT_ID = "stress-window-guard-instrument";
const SOURCE_ID = "stress-window-guard-source";
const SYMBOL = "STRESS.WINDOW";
const START_MS = Date.UTC(2020, 0, 1, 0, 0, 0);

test("market bar edge prewarm is isolated from foreground reads", () => {
  const source = fs.readFileSync(
    new URL("../../src/infrastructure/db/marketDatabase/barReader.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("export const getMarketBarByIndex = async");
  assert.notEqual(start, -1);
  const end = source.indexOf("export const countMarketBarsAfterUntilExclusive", start);
  assert.ok(end > start);
  const snippet = source.slice(start, end);

  assert.match(snippet, /chunkOffset >= MARKET_BAR_CHUNK_SIZE - 4/u);
  assert.match(
    snippet,
    /loadMarketBarChunk\(normalizedInstrumentId, chunkStart \+ MARKET_BAR_CHUNK_SIZE\)\s*\.catch\(\(\) => undefined\);/u,
  );
});

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

const upsertInstrument = db.prepare(
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

const insertTrainingProject = db.prepare(
  `INSERT INTO training_projects (
    id, name, created_at, updated_at, symbol, sample_pool_id, sample_pool_name,
    base_timeframe, training_date_range, initial_total, total_pnl, profit_rate,
    duration_days, total_trades, final_equity, equity_return_rate,
    simulation_batch_id, source_tag, summary_json, operator_summary_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const buildMinuteBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 53) * 0.8;
    const open = 100 + index * 0.0001 + wave;
    const close = open + Math.cos(index / 29) * 0.2;
    return {
      ts: new Date(START_MS + index * 60_000).toISOString(),
      open,
      high: Math.max(open, close) + 0.35,
      low: Math.min(open, close) - 0.35,
      close,
      volume: 1000 + (index % 5000),
    };
  });

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("market frame cache dedupes in-flight reads and clears on market invalidation", async () => {
  const key = buildMarketBarFrameCacheKey({
    instrumentId: "cache-frame-test",
    versionToken: "cache-frame-v1",
    displayPeriod: "1m",
    timeZone: "UTC",
    displayStart: 10,
    limit: 20,
  });
  const frame: MarketBarFrame = {
    schemaVersion: "zinuto-market-frame-v2",
    instrumentId: "cache-frame-test",
    symbol: "CACHE.FRAME",
    baseTimeframe: "1m",
    timeframe: "1m",
    displayPeriod: "1m",
    timeZone: "UTC",
    totalRaw: 100,
    totalDisplay: 100,
    rawStartIndex: 10,
    rawEndIndex: 29,
    displayStartIndex: 10,
    displayEndIndex: 29,
    limit: 20,
    hasBackward: true,
    hasForward: true,
    versionToken: "cache-frame-v1",
    displayIndex: [10],
    timestampMs: [Date.UTC(2024, 0, 1)],
    open: [1],
    high: [2],
    low: [0.5],
    close: [1.5],
    volume: [100],
    startRawIndex: [10],
    endRawIndex: [10],
  };
  let loadCount = 0;
  const loadFrame = async () => {
    loadCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return frame;
  };

  const [firstFrame, secondFrame] = await Promise.all([
    getOrLoadCachedMarketBarFrame(key, loadFrame),
    getOrLoadCachedMarketBarFrame(key, loadFrame),
  ]);
  assert.equal(loadCount, 1);
  assert.equal(firstFrame, frame);
  assert.equal(secondFrame, frame);

  const cachedFrame = await getOrLoadCachedMarketBarFrame(key, loadFrame);
  assert.equal(loadCount, 1);
  assert.equal(cachedFrame, frame);
  assert.equal(getCachedMarketBarFrame(key), frame);

  invalidateMarketReadCaches("cache-frame-test");
  assert.equal(getCachedMarketBarFrame(key), null);
});

test("market timeline windows stay bounded on large synthetic metadata", async () => {
  const now = new Date().toISOString();
  const bars = buildMinuteBars(BAR_COUNT);
  upsertSource.run(
    SOURCE_ID,
    "Market window stress source",
    "",
    "UTC",
    "USER_SELECTED",
    "1m",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    "READY",
    now,
    now,
  );
  upsertInstrument.run(
    INSTRUMENT_ID,
    SOURCE_ID,
    SYMBOL,
    "1m",
    "Market window stress",
    "LOCAL",
    "UTC",
    1,
    BAR_COUNT,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "stress-window-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(INSTRUMENT_ID, SYMBOL, bars);

  const warmFrameCacheSize = getMarketBarFrameCacheStats().size;
  const warmFrame = await getBarsFrameByInstrumentId(INSTRUMENT_ID, 0, 512, {
    displayPeriod: "1m",
    anchorDisplayIndex: 10_000,
    before: 255,
    after: 256,
    maxDisplayBars: 512,
  });
  const warmedFrameAgain = await getBarsFrameByInstrumentId(INSTRUMENT_ID, 0, 512, {
    displayPeriod: "1m",
    anchorDisplayIndex: 10_000,
    before: 255,
    after: 256,
    maxDisplayBars: 512,
  });
  assert.deepEqual(warmedFrameAgain.timestampMs, warmFrame.timestampMs);
  assert.ok(getMarketBarFrameCacheStats().size > warmFrameCacheSize);

  resetMarketReadDiagnostics();
  for (let index = 0; index < 6; index += 1) {
    const frame = await getBarsFrameByInstrumentId(INSTRUMENT_ID, 0, 512, {
      displayPeriod: "1m",
      anchorDisplayIndex: 8000 + index * 137,
      before: 255,
      after: 256,
      maxDisplayBars: 512,
    });
    assert.equal(frame.totalRaw, BAR_COUNT);
    assert.equal(frame.totalDisplay, BAR_COUNT);
    assert.ok(frame.timestampMs.length <= 512);
    assert.ok(frame.rawStartIndex <= frame.rawEndIndex);
  }
  const hotFrameDiagnostics = getMarketReadDiagnostics();
  assert.equal(hotFrameDiagnostics.fullRawReadCount, 0);

  resetMarketReadDiagnostics();
  await assert.rejects(
    () =>
      getFreeReplayStartPointOverview(INSTRUMENT_ID, "1m", 0, OVERVIEW_LIMIT, {
        rawStartIndex: 0,
        rawEndIndex: OVERVIEW_LIMIT,
      }),
    { code: "BARS_RANGE_LIMIT_EXCEEDED" },
  );
  const rejectedOverviewDiagnostics = getMarketReadDiagnostics();
  assert.equal(rejectedOverviewDiagnostics.fullRawReadCount, 0);
  assert.equal(rejectedOverviewDiagnostics.rangeReadCount, 0);

  resetMarketReadDiagnostics();
  const boundedOverview = await getFreeReplayStartPointOverview(
    INSTRUMENT_ID,
    "1m",
    0,
    OVERVIEW_LIMIT,
    {
      rawStartIndex: 0,
      rawEndIndex: OVERVIEW_LIMIT - 1,
    },
  );
  const boundedOverviewDiagnostics = getMarketReadDiagnostics();
  assert.equal(boundedOverview.bars.length, OVERVIEW_LIMIT);
  assert.equal(boundedOverview.bars[0]?.startRawIndex, 0);
  assert.equal(boundedOverview.bars.at(-1)?.endRawIndex, OVERVIEW_LIMIT - 1);
  assert.equal(boundedOverviewDiagnostics.fullRawReadCount, 0);
  assert.equal(boundedOverviewDiagnostics.rangeReadCount, 1);

  const scopeState = await resolveQuestionScopeState(
    "fast-decision-training",
    "stress-window-bank",
    "Stress window bank",
    1,
    [INSTRUMENT_ID],
    20,
    "1m",
  );
  assert.ok(scopeState.totalQuestionCount > 0);
  const slot = await resolveDisplaySlotByOrdinal(
    scopeState,
    Math.max(0, scopeState.totalQuestionCount - 2),
  );
  assert.ok(slot);

  resetMarketReadDiagnostics();
  const question = await buildQuestionFromSlot(
    scopeState,
    slot,
    "stress-window-ledger",
    "stress-window-question",
  );
  const questionDiagnostics = getMarketReadDiagnostics();
  assert.equal(questionDiagnostics.fullRawReadCount, 0);
  assert.ok(questionDiagnostics.rangeReadCount <= 1);
  assert.equal(question.bars.length, question.effectiveWindowBarCount);
  assert.ok(question.bars.length <= DESKTOP_API_LIMITS.specialTrainingQuestionBarsMax);
  assert.ok(question.bars.length < BAR_COUNT);

  const projectId = "stress-window-project";
  const cursorIndex = BAR_COUNT - 10;
  insertTrainingProject.run(
    projectId,
    "Stress replay ref",
    now,
    now,
    SYMBOL,
    SOURCE_ID,
    "Market Stress Source",
    "1m",
    `${bars[0]?.ts ?? ""} ~ ${bars.at(-1)?.ts ?? ""}`,
    100_000,
    2500,
    0.025,
    14,
    2,
    102_500,
    0.025,
    null,
    "",
    JSON.stringify({
      initialAsset: 100_000,
      endingAsset: 102_500,
      assetReturnRate: 0.025,
      durationDays: 14,
      startDate: "2020-01-01",
      endDate: "2020-01-14",
      buyCount: 1,
      sellCount: 1,
      totalTrades: 2,
      investedAmount: 0,
      tradingCost: 0,
      realizedPnl: 2500,
      unrealizedPnl: 0,
      totalPnl: 2500,
      profitRate: 0.025,
      maxDrawdownRate: 0,
      maxDrawdownAmount: 0,
      decisionSecondsUsed: 0,
      decisionCount: 0,
    }),
    JSON.stringify({
      operatorKind: "HUMAN",
      actionCount: 0,
      orderCount: 0,
      decisionCount: 0,
      decisionSecondsUsed: 0,
      nonTradeActionCount: 0,
      errorActionCount: 0,
      forcedLiquidationCount: 0,
    }),
  );
  const replayRefMeta = saveTrainingProjectReplayRef(
    projectId,
    {
      bars: [bars[0], bars.at(-1)].filter(Boolean),
      snapshot: {
        session: {
          instrument_id: INSTRUMENT_ID,
          symbol: SYMBOL,
          entry_index: cursorIndex - 400,
          cursor_index: cursorIndex,
          history_bars: BAR_COUNT,
          created_at: now,
        },
        fills: [
          {
            side: "BUY",
            fill_index: cursorIndex - 50,
            fill_price: bars[cursorIndex - 50]?.close,
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
          },
          {
            side: "SELL",
            fill_index: cursorIndex,
            fill_price: bars[cursorIndex]?.close,
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
          },
        ],
        cashAdjustments: [],
        sessionTradingSettings: {
          assetClass: "STOCK",
          initialSecuritiesBalance: 100_000,
          marketPresetId: "US_STOCK",
        },
      },
      drawings: [],
      chartIndicators: null,
      baseTimeframe: "1m",
      displayPeriod: "1m",
    },
    now,
  );
  assert.ok(replayRefMeta);
  const refStats = db
    .prepare(
      `SELECT history_bars AS historyBars,
              LENGTH(payload_blob) AS payloadBytes
         FROM training_project_replay_refs
        WHERE project_id = ?`,
    )
    .get(projectId) as { historyBars?: unknown; payloadBytes?: unknown } | undefined;
  assert.equal(Number(refStats?.historyBars), BAR_COUNT);
  assert.ok(Number(refStats?.payloadBytes) < 64 * 1024);

  resetMarketReadDiagnostics();
  const replay = (await loadTrainingProjectReplayWindowFromRef(
    projectId,
    cursorIndex,
    BAR_COUNT,
  )) as
    | {
        bars: Array<{ ts: string }>;
        snapshot: {
          session: { cursor_index: number };
          fills: Array<{ fill_index: number }>;
        };
      }
    | null;
  const replayDiagnostics = getMarketReadDiagnostics();
  assert.equal(replayDiagnostics.fullRawReadCount, 0);
  assert.equal(replayDiagnostics.rangeReadCount, 1);
  assert.ok(replay);
  assert.ok(replay.bars.length <= DESKTOP_API_LIMITS.noteContextBarsMax);
  assert.equal(replay.snapshot.session.cursor_index, replay.bars.length - 1);
  assert.deepEqual(
    replay.snapshot.fills.map((fill) => fill.fill_index),
    [replay.bars.length - 51, replay.bars.length - 1],
  );
});
