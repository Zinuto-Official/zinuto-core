// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import { ensureSyntheticLocalMarketFixture } from './localMarketSyntheticFixture.mts';

type OhlcvBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StressRecord = {
  name: string;
  ms: number;
  meta?: Record<string, unknown>;
};

const args = process.argv.slice(2);
const hasFlag = (name: string): boolean => args.includes(name);
const readArg = (name: string): string | null => {
  const prefix = `${name}=`;
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) {
    return args[exactIndex + 1] ?? null;
  }
  const match = args.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const parsePositiveInt = (raw: unknown, fallback: number): number => {
  const normalizedFallback = Math.max(1, Math.floor(Number(fallback) || 1));
  const text = String(raw ?? '').trim();
  if (!text) {
    return normalizedFallback;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return normalizedFallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const round = (value: number, digits = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const memoryMb = (): Record<string, number> => {
  const memory = process.memoryUsage();
  return {
    rssMb: round(memory.rss / 1024 / 1024, 1),
    heapUsedMb: round(memory.heapUsed / 1024 / 1024, 1),
    externalMb: round(memory.external / 1024 / 1024, 1),
  };
};

const records: StressRecord[] = [];
const measure = async <T>(
  name: string,
  fn: () => Promise<T> | T,
  meta?: Record<string, unknown>,
): Promise<T> => {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - startedAt;
    records.push({ name, ms, meta });
    console.log(`[stress] ${name}: ${round(ms, 2)}ms`, meta ? JSON.stringify(meta) : '');
  }
};

const DEFAULT_BAR_COUNT = 120_000;
const MIN_BAR_COUNT = 2_000;
const BAR_COUNT = Math.max(
  MIN_BAR_COUNT,
  parsePositiveInt(
    readArg('--bars') ?? process.env.ZINUTO_STRESS_MARKET_BARS,
    DEFAULT_BAR_COUNT,
  ),
);
const RANGE_LIMIT = Math.max(
  64,
  parsePositiveInt(
    readArg('--range-limit') ??
      process.env.ZINUTO_STRESS_RANGE_LIMIT ??
      process.env.ZINUTO_LIMIT_BARS_RANGE_MAX,
    5_000,
  ),
);
const BATCH_SIZE = Math.max(
  1,
  Math.min(
    50_000,
    parsePositiveInt(
      readArg('--batch-size') ?? process.env.ZINUTO_STRESS_BATCH_SIZE,
      50_000,
    ),
  ),
);
const KEEP_DATA = hasFlag('--keep-data');
const TEMP_DIR = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zinuto-market-window-stress-'));
const DATA_DIR = path.join(TEMP_DIR, 'data');
const DB_PATH = path.join(TEMP_DIR, 'zinuto.db');
const SOURCE_ID = 'stress-market-window-source';
const INSTRUMENT_ID = 'stress-market-window-instrument';
const SYMBOL = 'STRESS.10M';
const START_MS = Date.UTC(2000, 0, 1, 0, 0, 0);
const FRAME_LIMIT = Math.max(
  1,
  Math.min(DESKTOP_API_LIMITS.marketFrameBarsMax, BAR_COUNT),
);
const OVERVIEW_LIMIT = Math.max(
  1,
  Math.min(DESKTOP_API_LIMITS.startPointOverviewBarsMax, RANGE_LIMIT, BAR_COUNT - 1),
);
const NOTE_CONTEXT_LIMIT = DESKTOP_API_LIMITS.noteContextBarsMax;
const QUESTION_WINDOW_LIMIT = DESKTOP_API_LIMITS.specialTrainingQuestionBarsMax;

process.env.ZINUTO_DATA_DIR = DATA_DIR;
process.env.ZINUTO_DB_PATH = DB_PATH;
process.env.ZINUTO_LIMIT_BARS_RANGE_MAX = String(RANGE_LIMIT);

const buildSyntheticBars = (offset: number, limit: number): OhlcvBar[] => {
  const remaining = Math.max(0, BAR_COUNT - offset);
  const count = Math.min(Math.max(0, Math.floor(limit)), remaining);
  const bars = new Array<OhlcvBar>(count);
  for (let index = 0; index < count; index += 1) {
    const rawIndex = offset + index;
    const trend = 100 + rawIndex * 0.00001;
    const wave = Math.sin(rawIndex / 97) * 1.2 + Math.cos(rawIndex / 503) * 0.6;
    const open = trend + wave;
    const close = open + Math.sin(rawIndex / 17) * 0.25;
    bars[index] = {
      ts: new Date(START_MS + rawIndex * 60_000).toISOString(),
      open,
      high: Math.max(open, close) + 0.4 + (rawIndex % 13) * 0.01,
      low: Math.min(open, close) - 0.4 - (rawIndex % 11) * 0.01,
      close,
      volume: 1000 + (rawIndex % 10_000),
    };
  }
  return bars;
};

const assertNoFullRawRead = (
  label: string,
  getMarketReadDiagnostics: () => { fullRawReadCount: number; rangeReadCount: number },
) => {
  const diagnostics = getMarketReadDiagnostics();
  assert.equal(
    diagnostics.fullRawReadCount,
    0,
    `${label} must not trigger a full raw market read`,
  );
  return diagnostics;
};

const expectAppError = async (
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> => {
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    rejected = true;
    assert.equal((error as { code?: unknown }).code, code);
  }
  assert.equal(rejected, true, `Expected ${code}`);
};

let dbToClose: { close: () => void } | null = null;

try {
  console.log(
    `[stress] starting bars=${BAR_COUNT.toLocaleString('en-US')} rangeLimit=${RANGE_LIMIT.toLocaleString('en-US')} frameLimit=${FRAME_LIMIT.toLocaleString('en-US')} overviewLimit=${OVERVIEW_LIMIT.toLocaleString('en-US')} noteLimit=${NOTE_CONTEXT_LIMIT.toLocaleString('en-US')} questionLimit=${QUESTION_WINDOW_LIMIT.toLocaleString('en-US')} batchSize=${BATCH_SIZE.toLocaleString('en-US')} temp=${TEMP_DIR}`,
  );

  const { db } = await import('../src/infrastructure/db/database.js');
  dbToClose = db;
  const {
    getMarketReadDiagnostics,
    replaceMarketBarsForInstrumentBatched,
    resetMarketReadDiagnostics,
  } = await import('../src/infrastructure/db/marketDatabase.js');
  const {
    getBarsFrameByInstrumentId,
    getFreeReplayStartPointOverview,
  } = await import('../src/application/trading/core.js');
  const {
    buildQuestionFromSlot,
    resolveDisplaySlotByOrdinal,
    resolveQuestionScopeState,
  } = await import('../src/application/specialTraining/questionBank.js');
  const {
    loadTrainingProjectReplayWindowFromRef,
    saveTrainingProjectReplayRef,
  } = await import('../src/application/history/replayRefStore.js');
  const insertTrainingProject = db.prepare(
    `INSERT INTO training_projects (
      id, name, created_at, updated_at, symbol, sample_pool_id, sample_pool_name,
      base_timeframe, training_date_range, initial_total, total_pnl, profit_rate,
      duration_days, total_trades, final_equity, equity_return_rate,
      simulation_batch_id, source_tag, summary_json, operator_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const readReplayRefStats = db.prepare(
    `SELECT history_bars AS historyBars,
            LENGTH(payload_blob) AS payloadBytes
       FROM training_project_replay_refs
      WHERE project_id = ?`,
  );

  const now = new Date().toISOString();
  const firstBar = buildSyntheticBars(0, 1)[0]!;
  const lastBar = buildSyntheticBars(BAR_COUNT - 1, 1)[0]!;
  ensureSyntheticLocalMarketFixture({
    db,
    sourceId: SOURCE_ID,
    sourceName: 'Synthetic market window stress',
    instrumentId: INSTRUMENT_ID,
    symbol: SYMBOL,
    baseTimeframe: '1m',
    timeZone: 'UTC',
    minTradeStep: 1,
    barCount: BAR_COUNT,
    timeStartTs: firstBar.ts,
    timeEndTs: lastBar.ts,
    barsVersionToken: `stress-window-${BAR_COUNT}`,
    createdAt: now,
  });

  await measure(
    'import_synthetic_bars_batched',
    () =>
      replaceMarketBarsForInstrumentBatched({
        instrumentId: INSTRUMENT_ID,
        symbol: SYMBOL,
        batchSize: BATCH_SIZE,
        loadBatch: async (offset, limit) => buildSyntheticBars(offset, limit),
      }),
    { bars: BAR_COUNT, batchSize: BATCH_SIZE, memory: memoryMb() },
  );

  await measure('warm_bars_frame_window', () =>
    getBarsFrameByInstrumentId(INSTRUMENT_ID, 0, FRAME_LIMIT, {
      displayPeriod: '1m',
      anchorDisplayIndex: Math.floor(BAR_COUNT / 2),
      before: Math.floor((FRAME_LIMIT - 1) / 2),
      after: FRAME_LIMIT - 1 - Math.floor((FRAME_LIMIT - 1) / 2),
      maxDisplayBars: FRAME_LIMIT,
    }),
  );

  await measure('hot_bars_frame_queries_bounded', async () => {
    resetMarketReadDiagnostics();
    for (let index = 0; index < 12; index += 1) {
      const anchorDisplayIndex = Math.max(
        0,
        Math.min(
          BAR_COUNT - 1,
          Math.floor(((index + 3) * 7919) % Math.max(1, BAR_COUNT)),
        ),
      );
      const frame = await getBarsFrameByInstrumentId(INSTRUMENT_ID, 0, FRAME_LIMIT, {
        displayPeriod: '1m',
        anchorDisplayIndex,
        before: Math.floor((FRAME_LIMIT - 1) / 2),
        after: FRAME_LIMIT - 1 - Math.floor((FRAME_LIMIT - 1) / 2),
        maxDisplayBars: FRAME_LIMIT,
      });
      assert.equal(frame.totalRaw, BAR_COUNT);
      assert.equal(frame.totalDisplay, BAR_COUNT);
      assert.ok(frame.timestampMs.length <= FRAME_LIMIT);
      assert.ok(frame.rawStartIndex <= frame.rawEndIndex);
    }
    const diagnostics = assertNoFullRawRead(
      'hot bars frame queries',
      getMarketReadDiagnostics,
    );
    assert.ok(diagnostics.rangeReadCount <= 12);
  }, { frameLimit: FRAME_LIMIT, memory: memoryMb() });

  await measure('start_point_overview_rejects_over_limit_raw_range', async () => {
    resetMarketReadDiagnostics();
    await expectAppError(
      () =>
        getFreeReplayStartPointOverview(INSTRUMENT_ID, '1m', 0, OVERVIEW_LIMIT, {
          rawStartIndex: 0,
          rawEndIndex: OVERVIEW_LIMIT,
        }),
      'BARS_RANGE_LIMIT_EXCEEDED',
    );
    const diagnostics = assertNoFullRawRead(
      'over-limit start-point overview',
      getMarketReadDiagnostics,
    );
    assert.equal(diagnostics.rangeReadCount, 0);
  }, { overviewLimit: OVERVIEW_LIMIT });

  await measure('start_point_overview_bounded_raw_range', async () => {
    resetMarketReadDiagnostics();
    const overview = await getFreeReplayStartPointOverview(
      INSTRUMENT_ID,
      '1m',
      0,
      OVERVIEW_LIMIT,
      {
        rawStartIndex: 0,
        rawEndIndex: OVERVIEW_LIMIT - 1,
      },
    );
    assert.equal(overview.total, BAR_COUNT);
    assert.equal(overview.bars.length, OVERVIEW_LIMIT);
    assert.equal(overview.bars[0]?.startRawIndex, 0);
    assert.equal(overview.bars.at(-1)?.endRawIndex, OVERVIEW_LIMIT - 1);
    const diagnostics = assertNoFullRawRead(
      'bounded start-point overview',
      getMarketReadDiagnostics,
    );
    assert.equal(diagnostics.rangeReadCount, 1);
  }, { overviewLimit: OVERVIEW_LIMIT });

  await measure('special_training_question_window_bounded', async () => {
    const scopeState = await resolveQuestionScopeState(
      'fast-decision-training',
      'stress-market-window-bank',
      'Stress market window bank',
      1,
      [INSTRUMENT_ID],
      20,
      '1m',
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
      'stress-market-window-ledger',
      'stress-market-window-question',
    );
    assert.equal(question.bars.length, question.effectiveWindowBarCount);
    assert.ok(question.bars.length <= QUESTION_WINDOW_LIMIT);
    assert.ok(question.bars.length < BAR_COUNT);
    const diagnostics = assertNoFullRawRead(
      'special training question window',
      getMarketReadDiagnostics,
    );
    assert.ok(diagnostics.rangeReadCount <= 1);
  }, { memory: memoryMb() });

  await measure('history_replay_ref_payload_and_window_bounded', async () => {
    const projectId = 'stress-market-window-project';
    const cursorIndex = BAR_COUNT - 10;
    const entryIndex = Math.max(0, cursorIndex - 400);
    const buyFillIndex = Math.max(0, cursorIndex - 50);
    const cursorBar = buildSyntheticBars(cursorIndex, 1)[0]!;
    const buyBar = buildSyntheticBars(buyFillIndex, 1)[0]!;
    insertTrainingProject.run(
      projectId,
      'Stress replay ref',
      now,
      now,
      SYMBOL,
      SOURCE_ID,
      'Synthetic market window stress',
      '1m',
      `${firstBar.ts} ~ ${lastBar.ts}`,
      100_000,
      2500,
      0.025,
      14,
      2,
      102_500,
      0.025,
      null,
      '',
      JSON.stringify({
        initialAsset: 100_000,
        endingAsset: 102_500,
        assetReturnRate: 0.025,
        durationDays: 14,
        startDate: firstBar.ts.slice(0, 10),
        endDate: lastBar.ts.slice(0, 10),
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
        operatorKind: 'HUMAN',
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
        bars: [firstBar, lastBar],
        snapshot: {
          session: {
            instrument_id: INSTRUMENT_ID,
            symbol: SYMBOL,
            entry_index: entryIndex,
            cursor_index: cursorIndex,
            history_bars: BAR_COUNT,
            created_at: now,
          },
          fills: [
            {
              side: 'BUY',
              fill_index: buyFillIndex,
              fill_price: buyBar.close,
              fill_qty: 1,
              contract_multiplier: 1,
              fee: 0,
              tax: 0,
              slippage: 0,
            },
            {
              side: 'SELL',
              fill_index: cursorIndex,
              fill_price: cursorBar.close,
              fill_qty: 1,
              contract_multiplier: 1,
              fee: 0,
              tax: 0,
              slippage: 0,
            },
          ],
          cashAdjustments: [],
          sessionTradingSettings: {
            assetClass: 'STOCK',
            initialSecuritiesBalance: 100_000,
            marketPresetId: 'US_STOCK',
          },
        },
        drawings: [],
        chartIndicators: null,
        baseTimeframe: '1m',
        displayPeriod: '1m',
      },
      now,
    );
    assert.ok(replayRefMeta);
    const refStats = readReplayRefStats.get(projectId) as
      | { historyBars?: unknown; payloadBytes?: unknown }
      | undefined;
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
    const diagnostics = assertNoFullRawRead(
      'history replay window',
      getMarketReadDiagnostics,
    );
    assert.equal(diagnostics.rangeReadCount, 1);
    assert.ok(replay);
    assert.ok(replay.bars.length <= NOTE_CONTEXT_LIMIT);
    assert.equal(replay.snapshot.session.cursor_index, replay.bars.length - 1);
    assert.deepEqual(
      replay.snapshot.fills.map((fill) => fill.fill_index),
      [replay.bars.length - 51, replay.bars.length - 1],
    );
  }, { memory: memoryMb() });

  const result = {
    bars: BAR_COUNT,
    batchSize: BATCH_SIZE,
    frameLimit: FRAME_LIMIT,
    overviewLimit: OVERVIEW_LIMIT,
    noteContextLimit: NOTE_CONTEXT_LIMIT,
    questionWindowLimit: QUESTION_WINDOW_LIMIT,
    rangeLimit: RANGE_LIMIT,
    tempDir: TEMP_DIR,
    keepData: KEEP_DATA,
    memory: memoryMb(),
    records: records.map((record) => ({
      ...record,
      ms: round(record.ms, 2),
    })),
  };
  console.log('[stress:summary]');
  console.log(JSON.stringify(result, null, 2));
} finally {
  dbToClose?.close();
  if (!KEEP_DATA) {
    await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
  }
}
