// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-history-replay-hydration-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db },
  marketDatabaseModule,
  replayRefStoreModule,
  historyServiceModule,
  tradingCoreModule,
  replayNoteServiceModule,
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/infrastructure/db/history/replayRefStore.js"),
  import("../../src/application/historyService.js"),
  import("../../src/application/trading/core.js"),
  import("../../src/application/replayNoteService.js"),
]);

const {
  getMarketReadDiagnostics,
  replaceMarketBarsForInstrument,
  resetMarketReadDiagnostics,
} = marketDatabaseModule;
const {
  loadTrainingProjectReplayWindowFromRef,
  saveTrainingProjectReplayRef,
} = replayRefStoreModule;
const { buildReplayPayloadFromSessionArchive, getTrainingProjectById } = historyServiceModule;
const { createOrGetSession } = tradingCoreModule;
const { createReplayNote, updateReplayNote } = replayNoteServiceModule;

test.after(async () => {
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("training project replay still hydrates when instrument metadata token is missing", async () => {
  const instrumentId = "instrument-missing-meta";
  const sourceId = "source-missing-meta";
  const projectId = "project-missing-meta";
  const createdAt = "2025-12-24T13:19:46.659Z";
  const symbol = "MISSINGMETA";
  const bars = [
    {
      ts: "2024-01-02T05:00:00.000Z",
      open: 34.2,
      high: 34.5,
      low: 34.1,
      close: 34.4,
      volume: 1000,
    },
    {
      ts: "2024-01-03T05:00:00.000Z",
      open: 34.4,
      high: 34.6,
      low: 34.3,
      close: 34.55,
      volume: 1200,
    },
    {
      ts: "2024-01-04T05:00:00.000Z",
      open: 34.55,
      high: 34.7,
      low: 34.5,
      close: 34.62,
      volume: 900,
    },
  ];

  db.prepare(
    `INSERT INTO local_data_sources (
      id, name, source_folder, time_zone, time_zone_origin,
      base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    "Missing Meta Local Source",
    "",
    "America/New_York",
    "USER_SELECTED",
    "1d",
    JSON.stringify({}),
    DEFAULT_TRADING_CALENDAR_JSON,
    "READY",
    createdAt,
    createdAt,
  );

  db.prepare(
    `INSERT INTO instruments (
      id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step, bar_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    "1d",
    symbol,
    "LOCAL",
    "America/New_York",
    1,
    0,
    createdAt,
  );

  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);

  db.prepare(
    `UPDATE instruments
        SET time_start_ts = NULL,
            time_end_ts = NULL,
            bars_version_token = ''
      WHERE id = ?`,
  ).run(instrumentId);

  db.prepare(
    `INSERT INTO training_projects (
      id, name, created_at, updated_at, symbol, sample_pool_id, sample_pool_name,
      base_timeframe, training_date_range, initial_total, total_pnl, profit_rate,
      duration_days, total_trades, final_equity, equity_return_rate,
      simulation_batch_id, source_tag, summary_json, operator_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    "2025-12-24 21:19",
    createdAt,
    createdAt,
    symbol,
    sourceId,
    "Missing Meta Source",
    "1d",
    "2024-01-02 ~ 2024-01-04",
    50000,
    -60.5196053622276,
    -0.00121039210724455,
    0,
    3,
    49939.48039463777,
    -0.00121039210724455,
    null,
    "",
    JSON.stringify({
      initialAsset: 50000,
      endingAsset: 49939.48039463777,
      assetReturnRate: -0.00121039210724455,
      durationDays: 0,
      startDate: "2024-01-02",
      endDate: "2024-01-02",
      buyCount: 2,
      sellCount: 1,
      totalTrades: 3,
      investedAmount: 0,
      tradingCost: 0,
      realizedPnl: -60.5196053622276,
      unrealizedPnl: 0,
      totalPnl: -60.5196053622276,
      profitRate: -0.00121039210724455,
      maxDrawdownRate: 0.00121039210724455,
      maxDrawdownAmount: 60.5196053622276,
      decisionSecondsUsed: 0,
      decisionCount: 0,
    }),
    JSON.stringify({
      operatorKind: "HUMAN",
      operationMode: null,
      operatorSource: null,
      clientLabel: null,
      modelLabel: null,
      runId: null,
      actionCount: 0,
      orderCount: 0,
      decisionCount: 0,
      decisionSecondsUsed: 0,
      nonTradeActionCount: 0,
      errorActionCount: 0,
      forcedLiquidationCount: 0,
    }),
  );

  saveTrainingProjectReplayRef(
    projectId,
    {
      bars,
      snapshot: {
        session: {
          instrument_id: instrumentId,
          symbol,
          entry_index: 1,
          cursor_index: 2,
          history_bars: bars.length,
        },
        fills: [],
        sessionTradingSettings: {
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
        },
      },
      drawings: [],
      chartIndicators: null,
      baseTimeframe: "1d",
      displayPeriod: "1w",
    },
    createdAt,
  );

  const project = await getTrainingProjectById(projectId);

  assert.ok(project);
  assert.equal(project?.replayHydrationStatus, "READY");
  assert.equal(Array.isArray(project?.replay?.bars), true);
  assert.equal(project?.replay?.bars?.length, bars.length);
  assert.equal(project?.replay?.bars?.[0]?.ts, bars[0]?.ts);
  assert.equal(project?.replay?.displayPeriod, "1w");
});

test("training project replay refs hydrate the original session instrument when symbols overlap", async () => {
  const symbol = "DUPEREF";
  const sourceIdA = "source-dupe-a";
  const sourceIdB = "source-dupe-b";
  const instrumentIdA = "instrument-dupe-a";
  const instrumentIdB = "instrument-dupe-b";
  const projectId = "project-dupe-ref";
  const createdAt = "2026-01-04T09:30:00.000Z";
  const barsA = [
    {
      ts: "2025-01-02T05:00:00.000Z",
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 100,
    },
    {
      ts: "2025-01-03T05:00:00.000Z",
      open: 10.5,
      high: 11.5,
      low: 10,
      close: 11,
      volume: 120,
    },
  ];
  const barsB = [
    {
      ts: "2025-01-02T05:00:00.000Z",
      open: 210,
      high: 212,
      low: 208,
      close: 211,
      volume: 200,
    },
    {
      ts: "2025-01-03T05:00:00.000Z",
      open: 211,
      high: 213,
      low: 210,
      close: 212,
      volume: 220,
    },
  ];

  for (const [sourceId, sourceName] of [
    [sourceIdA, "Duplicate A"],
    [sourceIdB, "Duplicate B"],
  ] as const) {
    db.prepare(
      `INSERT INTO local_data_sources (
        id, name, source_folder, time_zone, time_zone_origin,
        base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sourceId,
      sourceName,
      "",
      "America/New_York",
      "USER_SELECTED",
      "1d",
      JSON.stringify({}),
      DEFAULT_TRADING_CALENDAR_JSON,
      "READY",
      createdAt,
      createdAt,
    );
  }

  for (const [instrumentId, sourceId] of [
    [instrumentIdA, sourceIdA],
    [instrumentIdB, sourceIdB],
  ] as const) {
    db.prepare(
      `INSERT INTO instruments (
        id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step, bar_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      instrumentId,
      sourceId,
      symbol,
      "1d",
      symbol,
      "LOCAL",
      "America/New_York",
      1,
      0,
      createdAt,
    );
  }

  await replaceMarketBarsForInstrument(instrumentIdA, symbol, barsA);
  await replaceMarketBarsForInstrument(instrumentIdB, symbol, barsB);

  db.prepare(
    `INSERT INTO training_projects (
      id, name, created_at, updated_at, symbol, sample_pool_id, sample_pool_name,
      base_timeframe, training_date_range, initial_total, total_pnl, profit_rate,
      duration_days, total_trades, final_equity, equity_return_rate,
      simulation_batch_id, source_tag, summary_json, operator_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    "Duplicate instrument replay",
    createdAt,
    createdAt,
    symbol,
    sourceIdB,
    "Duplicate B",
    "1d",
    "2025-01-02 ~ 2025-01-03",
    50000,
    100,
    0.002,
    1,
    0,
    50100,
    0.002,
    null,
    "",
    JSON.stringify({
      initialAsset: 50000,
      endingAsset: 50100,
      assetReturnRate: 0.002,
      durationDays: 1,
      startDate: "2025-01-02",
      endDate: "2025-01-03",
      buyCount: 0,
      sellCount: 0,
      totalTrades: 0,
      investedAmount: 0,
      tradingCost: 0,
      realizedPnl: 100,
      unrealizedPnl: 0,
      totalPnl: 100,
      profitRate: 0.002,
      maxDrawdownRate: 0,
      maxDrawdownAmount: 0,
      decisionSecondsUsed: 0,
      decisionCount: 0,
    }),
    JSON.stringify({
      operatorKind: "HUMAN",
      operationMode: null,
      operatorSource: null,
      clientLabel: null,
      modelLabel: null,
      runId: null,
      actionCount: 0,
      orderCount: 0,
      decisionCount: 0,
      decisionSecondsUsed: 0,
      nonTradeActionCount: 0,
      errorActionCount: 0,
      forcedLiquidationCount: 0,
    }),
  );

  const savedRef = saveTrainingProjectReplayRef(
    projectId,
    {
      bars: barsB,
      snapshot: {
        session: {
          instrument_id: instrumentIdB,
          symbol,
          entry_index: 0,
          cursor_index: 1,
          history_bars: barsB.length,
        },
        fills: [],
        sessionTradingSettings: {
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
        },
      },
      drawings: [],
      chartIndicators: null,
      baseTimeframe: "1d",
    },
    createdAt,
  );

  assert.ok(savedRef);

  const project = await getTrainingProjectById(projectId);

  assert.equal(project?.replayHydrationStatus, "READY");
  assert.equal(project?.replay?.bars?.[0]?.open, 210);
  assert.equal(project?.replay?.snapshot?.session?.instrument_id, instrumentIdB);
});

test("session archive replay is built from the session instrument when symbols overlap", async () => {
  const symbol = "DUPEARCHIVE";
  const sourceIdA = "source-archive-dupe-a";
  const sourceIdB = "source-archive-dupe-b";
  const instrumentIdA = "instrument-archive-dupe-a";
  const instrumentIdB = "instrument-archive-dupe-b";
  const createdAt = "2026-01-05T09:30:00.000Z";
  const barsA = [
    {
      ts: "2025-02-03T05:00:00.000Z",
      open: 31,
      high: 32,
      low: 30,
      close: 31.5,
      volume: 100,
    },
    {
      ts: "2025-02-04T05:00:00.000Z",
      open: 31.5,
      high: 33,
      low: 31,
      close: 32.5,
      volume: 120,
    },
    {
      ts: "2025-02-05T05:00:00.000Z",
      open: 32.5,
      high: 34,
      low: 32,
      close: 33.5,
      volume: 140,
    },
  ];
  const barsB = [
    {
      ts: "2025-02-03T05:00:00.000Z",
      open: 410,
      high: 412,
      low: 408,
      close: 411,
      volume: 200,
    },
    {
      ts: "2025-02-04T05:00:00.000Z",
      open: 411,
      high: 414,
      low: 410,
      close: 413,
      volume: 220,
    },
    {
      ts: "2025-02-05T05:00:00.000Z",
      open: 413,
      high: 416,
      low: 412,
      close: 415,
      volume: 240,
    },
  ];

  for (const [sourceId, sourceName] of [
    [sourceIdA, "Archive Duplicate A"],
    [sourceIdB, "Archive Duplicate B"],
  ] as const) {
    db.prepare(
      `INSERT INTO local_data_sources (
        id, name, source_folder, time_zone, time_zone_origin,
        base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sourceId,
      sourceName,
      "",
      "America/New_York",
      "USER_SELECTED",
      "1d",
      JSON.stringify({}),
      DEFAULT_TRADING_CALENDAR_JSON,
      "READY",
      createdAt,
      createdAt,
    );
  }

  for (const [instrumentId, sourceId] of [
    [instrumentIdA, sourceIdA],
    [instrumentIdB, sourceIdB],
  ] as const) {
    db.prepare(
      `INSERT INTO instruments (
        id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step, bar_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      instrumentId,
      sourceId,
      symbol,
      "1d",
      symbol,
      "LOCAL",
      "America/New_York",
      1,
      0,
      createdAt,
    );
  }

  await replaceMarketBarsForInstrument(instrumentIdA, symbol, barsA);
  await replaceMarketBarsForInstrument(instrumentIdB, symbol, barsB);

  const session = await createOrGetSession(symbol, "1d", true, 1, {
    instrumentId: instrumentIdB,
    samplePoolId: sourceIdB,
  });

  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    50000,
    [],
    null,
    "1h",
    null,
    { bypassAccessGuard: true },
  );

  assert.equal(archive.replayOmitted, false);
  assert.equal(archive.replay?.snapshot?.session?.instrument_id, instrumentIdB);
  assert.equal(archive.replay?.displayPeriod, "1h");
  assert.equal(archive.replay?.bars?.[0]?.open, 410);
});

test("training project replay note window uses bounded range reads without write-time hydration", async () => {
  const instrumentId = "instrument-note-window-ref";
  const sourceId = "source-note-window-ref";
  const projectId = "project-note-window-ref";
  const noteId = "note-window-ref";
  const createdAt = "2026-02-10T09:30:00.000Z";
  const symbol = "WINDOWREF";
  const bars = Array.from({ length: 1500 }, (_, index) => {
    const base = 100 + index * 0.1;
    return {
      ts: new Date(Date.UTC(2024, 0, 1 + index, 5, 0, 0)).toISOString(),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 1000 + index,
    };
  });
  const cursorIndex = 1005;

  db.prepare(
    `INSERT INTO local_data_sources (
      id, name, source_folder, time_zone, time_zone_origin,
      base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    "Replay Note Window Source",
    "",
    "America/New_York",
    "USER_SELECTED",
    "1d",
    JSON.stringify({}),
    DEFAULT_TRADING_CALENDAR_JSON,
    "READY",
    createdAt,
    createdAt,
  );

  db.prepare(
    `INSERT INTO instruments (
      id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step, bar_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    "1d",
    symbol,
    "LOCAL",
    "America/New_York",
    1,
    0,
    createdAt,
  );

  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);

  db.prepare(
    `INSERT INTO training_projects (
      id, name, created_at, updated_at, symbol, sample_pool_id, sample_pool_name,
      base_timeframe, training_date_range, initial_total, total_pnl, profit_rate,
      duration_days, total_trades, final_equity, equity_return_rate,
      simulation_batch_id, source_tag, summary_json, operator_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    "Replay note bounded window",
    createdAt,
    createdAt,
    symbol,
    sourceId,
    "Replay Note Source",
    "1d",
    "2024-01-01 ~ 2028-02-08",
    50000,
    11234,
    0.22468,
    1500,
    2,
    61234,
    0.22468,
    null,
    "",
    JSON.stringify({
      initialAsset: 50000,
      endingAsset: 61234,
      assetReturnRate: 0.22468,
      durationDays: 1500,
      startDate: "2024-01-01",
      endDate: "2028-02-08",
      buyCount: 1,
      sellCount: 1,
      totalTrades: 2,
      investedAmount: 0,
      tradingCost: 0,
      realizedPnl: 11234,
      unrealizedPnl: 0,
      totalPnl: 11234,
      profitRate: 0.22468,
      maxDrawdownRate: 0,
      maxDrawdownAmount: 0,
      decisionSecondsUsed: 0,
      decisionCount: 0,
    }),
    JSON.stringify({
      operatorKind: "HUMAN",
      operationMode: null,
      operatorSource: null,
      clientLabel: null,
      modelLabel: null,
      runId: null,
      actionCount: 0,
      orderCount: 0,
      decisionCount: 0,
      decisionSecondsUsed: 0,
      nonTradeActionCount: 0,
      errorActionCount: 0,
      forcedLiquidationCount: 0,
    }),
  );

  const savedRef = saveTrainingProjectReplayRef(
    projectId,
    {
      bars,
      snapshot: {
        session: {
          instrument_id: instrumentId,
          symbol,
          entry_index: 700,
          cursor_index: 1200,
          history_bars: bars.length,
        },
        fills: [
          {
            side: "BUY",
            fill_index: 700,
            fill_price: bars[700]?.close,
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
          },
          {
            side: "BUY",
            fill_index: 900,
            fill_price: bars[900]?.close,
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
          },
          {
            side: "SELL",
            fill_index: 1005,
            fill_price: bars[1005]?.close,
            fill_qty: 1,
            contract_multiplier: 1,
            fee: 0,
            tax: 0,
            slippage: 0,
          },
        ],
        sessionTradingSettings: {
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
        },
      },
      drawings: [],
      chartIndicators: null,
      baseTimeframe: "1d",
    },
    createdAt,
  );
  assert.ok(savedRef);

  resetMarketReadDiagnostics();
  type WindowReplay = {
    bars: Array<{ ts: string }>;
    snapshot: {
      session: {
        cursor_index: number;
        entry_index: number;
      };
      fills: Array<{
        fill_index: number;
        fill_time: string;
      }>;
    };
    finalEquity: number;
    equityReturnRate: number;
  };
  const replay = (await loadTrainingProjectReplayWindowFromRef(
    projectId,
    cursorIndex,
    240,
  )) as WindowReplay | null;
  const hydrationDiagnostics = getMarketReadDiagnostics();

  assert.equal(hydrationDiagnostics.fullRawReadCount, 0);
  assert.equal(hydrationDiagnostics.rangeReadCount, 1);
  assert.ok(replay);
  assert.equal(replay.bars.length, 240);
  assert.equal(replay.snapshot.session.cursor_index, 239);
  assert.equal(replay.snapshot.session.entry_index, 0);
  assert.equal(replay.finalEquity, 61234);
  assert.equal(replay.equityReturnRate, 0.22468);
  assert.deepEqual(
    replay.snapshot.fills.map((fill: Record<string, unknown>) => fill.fill_index),
    [134, 239],
  );
  assert.equal(replay.snapshot.fills[0].fill_time, replay.bars[134].ts);

  const contentDocument = {
    schemaVersion: 1,
    blocks: [
      {
        blockKind: "PARAGRAPH",
        children: [
          {
            inlineKind: "TEXT",
            text: "Initial bounded window note",
          },
        ],
      },
    ],
  };

  resetMarketReadDiagnostics();
  const note = await createReplayNote({
    id: noteId,
    title: "Bounded window note",
    type: "FREE_REPLAY",
    contentDocument,
    trainingProjectId: projectId,
    contextDisplayPeriod: "1d",
    contextSessionId: "session-window-ref",
    contextCursorIndex: cursorIndex,
  });
  const createDiagnostics = getMarketReadDiagnostics();
  assert.equal(createDiagnostics.fullRawReadCount, 0);
  assert.equal(createDiagnostics.rangeReadCount, 0);
  assert.equal(note.hasContextReplay, true);
  assert.equal(note.contextReplay, null);

  resetMarketReadDiagnostics();
  const updated = await updateReplayNote(noteId, {
    title: "Renamed bounded window note",
  });
  const updateDiagnostics = getMarketReadDiagnostics();
  assert.equal(updateDiagnostics.fullRawReadCount, 0);
  assert.equal(updateDiagnostics.rangeReadCount, 0);
  assert.equal(updated.hasContextReplay, true);
  assert.equal(updated.contextReplay, null);
});
