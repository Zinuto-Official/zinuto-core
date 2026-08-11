// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  type BuiltInTradingMarketPresetId,
} from "@zinuto/shared/trading";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-free-replay-order-rules-"),
);
process.env.ZINUTO_DB_PATH = path.join(tempDbDir, "zinuto.db");

const { db, listSystemSeedSymbols } = await import("../../src/infrastructure/db/database.js");
const { SYSTEM_WIKI_EOD_POOL_ID } = await import(
  "../../src/infrastructure/db/systemSeedBars.js"
);
const {
  createOrGetSession,
  getSessionSnapshot,
  getTradingSettings,
  setTradingSettings,
  startPreparedFreeReplaySession,
  stepSession,
  updateSessionTradingSettings,
} = await import("../../src/application/trading/sessionService.js");
const { getFreeReplayPrepReadModel } = await import(
  "../../src/application/trading/freeReplayPrepReadModel.js"
);
const { replaceMarketBarsForInstrument } = await import(
  "../../src/infrastructure/db/marketDatabase.js"
);
const {
  executeSessionAction,
  getSessionOrderQuote,
  placeOrder,
} = await import("../../src/application/trading/orderService.js");
const {
  buildReplayPayloadFromSessionArchive,
  createTrainingProject,
  getTrainingProjectById,
} = await import(
  "../../src/application/historyService.js"
);
const { buildReplayReviewReport } = await import(
  "../../src/application/replayReviewReportService.js"
);
const { buildReplayReviewDiagnosticsFromProjects } = await import(
  "../../src/application/replayReviewDiagnosticsService.js"
);
const { calculateTradingCostBreakdown } = await import(
  "../../src/domain/trading/feeModel.js"
);
const { buildHumanOperatorSummary } = await import("../../src/domain/operatorSummary.js");
const { resolveFreeReplayStartReadiness } = await import(
  "../../src/http/trainingFreeReplayController.js"
);

const symbol = listSystemSeedSymbols()[0] ?? "AAPL";
const seedInstrument = db
  .prepare(
    `SELECT id
       FROM instruments
      WHERE symbol = ?
        AND base_timeframe = '1d'
        AND market = 'SYSTEM'
      ORDER BY created_at ASC
      LIMIT 1`,
  )
  .get(symbol) as { id: string } | undefined;
assert.ok(seedInstrument?.id);
const initialTradingSettings = getTradingSettings();

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DB_PATH;
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

const buildSessionTradingSettings = (
  presetId: BuiltInTradingMarketPresetId,
  overrides: Record<string, unknown> = {},
) => {
  const base = getTradingSettings();
  const preset = DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId];
  return {
    ...base,
    ...preset,
    initialSecuritiesBalance: 500_000,
    positionCostMode: base.positionCostMode,
    freeReplayEndSettlementMode: base.freeReplayEndSettlementMode,
    tradeAmountIncludesFees: false,
    ...overrides,
  };
};

type CreateSessionOptions = NonNullable<Parameters<typeof createOrGetSession>[4]> & {
  symbol?: string;
  timeframe?: string;
  anchorIndex?: number;
};

const createSessionWithSettings = async (
  presetId: BuiltInTradingMarketPresetId,
  overrides: Record<string, unknown> = {},
  options: CreateSessionOptions = {},
) => {
  const {
    symbol: sessionSymbol = symbol,
    timeframe = "1d",
    anchorIndex,
    ...sessionOptions
  } = options;
  const settings = buildSessionTradingSettings(presetId, overrides);
  const session = await createOrGetSession(
    sessionSymbol,
    timeframe,
    true,
    anchorIndex,
    {
      ...sessionOptions,
      sessionTradingSettings: settings,
    },
  );
  return { session, settings };
};

const quoteOrder = async (
  sessionId: string,
  payload: Parameters<typeof getSessionOrderQuote>[1],
) =>
  getSessionOrderQuote(sessionId, payload);

const assertAlignedToStep = (qty: number, step: number) => {
  const ratio = qty / step;
  assert.ok(
    Math.abs(ratio - Math.round(ratio)) < 0.000001,
    `expected ${qty} to align to ${step}`,
  );
};

const countPendingNextOpenOrders = (sessionId: string): number => {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sim_orders
      WHERE session_id = ?
        AND status = 'PENDING'
        AND price_mode = 'NEXT_OPEN'`,
  ).get(sessionId) as { count: number } | undefined;
  return Math.max(0, Number(row?.count ?? 0));
};

const buildPreparedFreeReplayStartPayload = (
  tradingEnvironment: Parameters<typeof startPreparedFreeReplaySession>[0]["tradingEnvironment"],
) => ({
  mode: "FOCUSED" as const,
  selectedPoolId: SYSTEM_WIKI_EOD_POOL_ID,
  selectedPoolName: "Backend Environment",
  selectedInstrumentId: seedInstrument.id,
  selectedSymbol: symbol,
  selectedAnchorIndex: 10,
  minimumBaseTimeframe: "1d" as const,
  tradingEnvironment,
});

test("free replay excludes non-ready and mutating local sources, including after a stale preview", async () => {
  const poolId = "pool-free-replay-eligibility";
  const instrumentId = "instrument-free-replay-eligibility";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id, name, time_zone, base_timeframe, field_mapping_json,
      trading_calendar_json, status, deletion_state, created_at, updated_at
    ) VALUES (?, ?, 'UTC', '1d', '{}', ?, 'READY', 'IDLE', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = 'READY', deletion_state = 'IDLE', updated_at = excluded.updated_at`,
  ).run(
    poolId,
    "Free replay eligibility",
    '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}',
    now,
    now,
  );
  db.prepare(
    `INSERT INTO instruments (
      id, source_id, symbol, base_timeframe, name, market, min_trade_step,
      bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
    ) VALUES (?, ?, 'ELIGIBLE.TEST', '1d', 'Eligible', 'LOCAL', 1, 120, ?, ?, 'eligibility-v1', ?)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id, bar_count = excluded.bar_count,
      bars_version_token = excluded.bars_version_token`,
  ).run(
    instrumentId,
    poolId,
    "2024-01-01T00:00:00.000Z",
    "2024-04-29T00:00:00.000Z",
    now,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id, source_id, job_id, instrument_id, symbol, file_name, file_path,
      file_size, file_mtime_ms, file_fingerprint, status, rows_total,
      rows_imported, rows_skipped, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ELIGIBLE.TEST', 'eligible.csv', 'eligible.csv', 1, 0, 'eligibility-file-v1', 'IMPORTED', 120, 120, 0, ?, ?)`,
  ).run(
    "file-free-replay-eligibility",
    poolId,
    "job-free-replay-eligibility",
    instrumentId,
    now,
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "ELIGIBLE.TEST",
    Array.from({ length: 120 }, (_, index) => {
      const open = 100 + index;
      return {
        ts: new Date(Date.UTC(2024, 0, index + 1)).toISOString(),
        open,
        high: open + 1,
        low: open - 1,
        close: open + 0.5,
        volume: 1000,
      };
    }),
  );

  const ready = await getFreeReplayPrepReadModel({
    mode: "FOCUSED",
    selectedPoolId: poolId,
    selectedInstrumentId: instrumentId,
    selectedAnchorIndex: 10,
  });
  assert.equal(ready.selection.selectedPoolId, poolId);
  assert.equal(ready.startCandidates.length, 1);

  for (const status of ["FAILED", "IMPORTING"] as const) {
    db.prepare(
      `UPDATE local_data_sources
          SET status = ?, deletion_state = 'IDLE', updated_at = ?
        WHERE id = ?`,
    ).run(status, new Date().toISOString(), poolId);
    const readModel = await getFreeReplayPrepReadModel({
      mode: "FOCUSED",
      selectedPoolId: poolId,
      selectedInstrumentId: instrumentId,
      selectedAnchorIndex: 10,
    });
    assert.notEqual(readModel.selection.selectedPoolId, poolId);
    assert.equal(readModel.pools.some((pool) => pool.id === poolId), false);
  }

  db.prepare(
    `UPDATE local_data_sources
        SET status = 'READY', deletion_state = 'DELETING', updated_at = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), poolId);
  const deleting = await getFreeReplayPrepReadModel({
    mode: "FOCUSED",
    selectedPoolId: poolId,
    selectedInstrumentId: instrumentId,
    selectedAnchorIndex: 10,
  });
  assert.notEqual(deleting.selection.selectedPoolId, poolId);
  assert.equal(deleting.pools.some((pool) => pool.id === poolId), false);

  const sessionCountBefore = Number(
    db.prepare("SELECT COUNT(1) FROM replay_sessions").pluck().get() ?? 0,
  );
  await assert.rejects(
    () =>
      startPreparedFreeReplaySession({
        mode: "FOCUSED",
        selectedPoolId: poolId,
        selectedPoolName: "Free replay eligibility",
        selectedInstrumentId: instrumentId,
        selectedSymbol: "ELIGIBLE.TEST",
        selectedAnchorIndex: 10,
        minimumBaseTimeframe: "1d",
        tradingEnvironment: { assetClass: "STOCK", marketPresetId: "US_STOCK" },
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "FREE_REPLAY_SELECTION_STALE",
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(1) FROM replay_sessions").pluck().get() ?? 0),
    sessionCountBefore,
  );
});

const zeroTradingCostOverrides = {
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
};

const readSessionCashBalance = (sessionId: string): number => {
  const value = db
    .prepare("SELECT cash_balance FROM replay_sessions WHERE id = ?")
    .pluck()
    .get(sessionId);
  return Number(value ?? 0);
};

const readLongFinancingCharges = (
  sessionId: string,
): Array<{ referencePrice: number; annualRate: number; amount: number; accrualDays: number }> =>
  db
    .prepare(
      `SELECT notional_basis AS referencePrice,
              annual_rate AS annualRate,
              amount AS amount,
              accrual_days AS accrualDays
         FROM sim_accrual_events
        WHERE session_id = ?
          AND kind IN ('LONG_FINANCING','FUNDING')
        ORDER BY accrual_end_day ASC, rowid ASC`,
    )
    .all(sessionId) as Array<{
    referencePrice: number;
    annualRate: number;
    amount: number;
  }>;

const readLongFinancingTotal = (sessionId: string): number =>
  Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM sim_accrual_events WHERE session_id = ? AND kind IN ('LONG_FINANCING','FUNDING')",
      )
      .pluck()
      .get(sessionId) ?? 0,
  );

const assertCloseTo = (actual: number, expected: number, epsilon = 0.000001) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

const readLastFill = (sessionId: string) =>
  db
    .prepare(
      `SELECT side,
              fill_price AS fillPrice,
              fill_qty AS fillQty,
              contract_multiplier AS contractMultiplier,
              fee,
              tax,
              slippage
         FROM sim_fills
        WHERE session_id = ?
        ORDER BY rowid DESC
        LIMIT 1`,
    )
    .get(sessionId) as
    | {
        side: "BUY" | "SELL";
        fillPrice: number;
        fillQty: number;
        contractMultiplier: number;
        fee: number;
        tax: number;
        slippage: number;
      }
    | undefined;

test("free replay start readiness is resolved by the backend read model", () => {
  const candidate = {
    instrumentId: seedInstrument.id,
    symbol,
    poolId: SYSTEM_WIKI_EOD_POOL_ID,
    poolName: "Backend Environment",
    sourceTimeframe: "1d" as const,
  };

  const emptyRandom = resolveFreeReplayStartReadiness({
    mode: "RANDOM",
    candidates: [],
  });
  assert.equal(emptyRandom.enabled, false);
  assert.equal(emptyRandom.reasonCode, "NO_SAMPLES");
  assert.equal(emptyRandom.readiness.canStart, false);

  const missingFocusedSymbol = resolveFreeReplayStartReadiness({
    mode: "FOCUSED",
    selectedPoolId: SYSTEM_WIKI_EOD_POOL_ID,
    selectedSymbol: "MSFT",
    selectedAnchorIndex: 5,
    candidates: [candidate],
  });
  assert.equal(missingFocusedSymbol.enabled, false);
  assert.equal(missingFocusedSymbol.reasonCode, "NO_SYMBOL");
  assert.equal(missingFocusedSymbol.facts.scopedCandidateCount, 1);

  const missingFocusedAnchor = resolveFreeReplayStartReadiness({
    mode: "FOCUSED",
    selectedPoolId: SYSTEM_WIKI_EOD_POOL_ID,
    selectedInstrumentId: seedInstrument.id,
    selectedSymbol: symbol,
    candidates: [candidate],
  });
  assert.equal(missingFocusedAnchor.enabled, false);
  assert.equal(missingFocusedAnchor.reasonCode, "NO_ANCHOR");

  const readyFocused = resolveFreeReplayStartReadiness({
    mode: "FOCUSED",
    selectedPoolId: SYSTEM_WIKI_EOD_POOL_ID,
    selectedInstrumentId: seedInstrument.id,
    selectedSymbol: symbol.toLowerCase(),
    selectedAnchorIndex: 10,
    candidates: [candidate],
  });
  assert.equal(readyFocused.enabled, true);
  assert.equal(readyFocused.reasonCode, null);
  assert.equal(readyFocused.readiness.canStart, true);
  assert.equal(readyFocused.facts.normalizedSelectedSymbol, symbol.toUpperCase());
});

const expectAppErrorCode = (code: string) => (error: unknown) =>
  Boolean(error) &&
  typeof error === "object" &&
  (error as { code?: unknown }).code === code;

const expectOrderBlockedReasonCode = (blockedReasonCode: string) => (
  error: unknown,
) =>
  Boolean(error) &&
  typeof error === "object" &&
  (error as { code?: unknown; args?: { blockedReasonCode?: unknown } }).code ===
    "ORDER_BLOCKED" &&
  (error as { args?: { blockedReasonCode?: unknown } }).args
    ?.blockedReasonCode === blockedReasonCode;

const getArchiveFills = (
  archive: Awaited<ReturnType<typeof buildReplayPayloadFromSessionArchive>>,
): Array<Record<string, unknown>> => {
  const replay = archive.replay as
    | { snapshot?: { fills?: Array<Record<string, unknown>> } }
    | undefined;
  const fills = replay?.snapshot?.fills;
  assert.ok(Array.isArray(fills));
  return fills;
};

const getArchiveSnapshot = (
  archive: Awaited<ReturnType<typeof buildReplayPayloadFromSessionArchive>>,
): Record<string, unknown> => {
  const replay = archive.replay as
    | { snapshot?: Record<string, unknown> }
    | undefined;
  assert.ok(replay?.snapshot);
  return replay.snapshot;
};

const getArchiveCashAdjustments = (
  archive: Awaited<ReturnType<typeof buildReplayPayloadFromSessionArchive>>,
): Array<{ amount?: unknown }> => {
  const snapshot = getArchiveSnapshot(archive);
  const cashAdjustments = snapshot.cashAdjustments;
  assert.ok(Array.isArray(cashAdjustments));
  return cashAdjustments as Array<{ amount?: unknown }>;
};

const getArchiveSecuritiesCash = (
  archive: Awaited<ReturnType<typeof buildReplayPayloadFromSessionArchive>>,
): number => {
  const snapshot = getArchiveSnapshot(archive);
  const accounts = snapshot.accounts;
  assert.ok(Array.isArray(accounts));
  const account = (accounts as Array<{ kind?: unknown; balance?: unknown }>).find(
    (item) => item.kind === "SECURITIES",
  );
  assert.ok(account);
  return Number(account.balance ?? 0);
};

const calculateSnapshotSecuritiesTotal = (
  snapshot: Awaited<ReturnType<typeof getSessionSnapshot>>,
): number => {
  const cash = Number(
    snapshot.accounts.find((account) => account.kind === "SECURITIES")?.balance ?? 0,
  );
  const contractMultiplier = Math.max(
    Number.EPSILON,
    Number(snapshot.sessionTradingSettings?.contractMultiplier ?? 1) || 1,
  );
  const positionMarketValue = snapshot.positions.reduce((sum, position) => {
    const qty = Number(position.qty);
    const markPrice = Number(position.markPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(markPrice)) {
      return sum;
    }
    return sum + qty * markPrice * contractMultiplier;
  }, 0);
  return cash + positionMarketValue;
};

test("prepared free replay start resolves HK stock trading environment on the backend", async () => {
  const globalBaseline = getTradingSettings();
  const aShareGlobalSettings = {
    ...globalBaseline,
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
    initialSecuritiesBalance: globalBaseline.initialSecuritiesBalance,
    allowLongMarginTrading: false,
    allowShortSelling: false,
  };
  try {
    setTradingSettings(aShareGlobalSettings);

    const started = await startPreparedFreeReplaySession(
      buildPreparedFreeReplayStartPayload({
        assetClass: "STOCK",
        marketPresetId: "HK_STOCK",
      }),
    );
    const { sessionTradingSettings } = started.bootstrap.snapshot;

    assert.equal(sessionTradingSettings.marketPresetId, "HK_STOCK");
    assert.equal(sessionTradingSettings.assetClass, "STOCK");
    assert.equal(sessionTradingSettings.allowLongMarginTrading, true);
    assert.equal(sessionTradingSettings.allowShortSelling, true);
    assert.equal(sessionTradingSettings.minTradeStep, 1);
    assert.equal(
      sessionTradingSettings.initialSecuritiesBalance,
      globalBaseline.initialSecuritiesBalance,
    );
  } finally {
    setTradingSettings(globalBaseline);
  }
});

test("focused prepared free replay starts paused and not terminated", async () => {
  const started = await startPreparedFreeReplaySession(
    buildPreparedFreeReplayStartPayload({
      assetClass: "STOCK",
      marketPresetId: "HK_STOCK",
    }),
  );
  const { snapshot } = started.bootstrap;

  assert.equal(started.selected.anchorIndex, 10);
  assert.equal(snapshot.session.is_paused, 1);
  assert.equal(snapshot.termination?.isTerminated, false);
  assert.equal(snapshot.termination?.hasFutureBars, true);
  assert.equal(snapshot.actionState?.allowStep, true);
});

test("prepared free replay start rejects invalid backend trading environments without fallback", async () => {
  await assert.rejects(
    () =>
      startPreparedFreeReplaySession(
        buildPreparedFreeReplayStartPayload({
          assetClass: "EQUITY" as never,
          marketPresetId: "HK_STOCK",
        }),
      ),
    expectAppErrorCode("TRADING_ASSET_CLASS_INVALID"),
  );

  await assert.rejects(
    () =>
      startPreparedFreeReplaySession(
        buildPreparedFreeReplayStartPayload({
          assetClass: "FUTURES",
          marketPresetId: "HK_STOCK",
        }),
      ),
    expectAppErrorCode("TRADING_MARKET_PRESET_INVALID"),
  );

  await assert.rejects(
    () =>
      startPreparedFreeReplaySession(
        buildPreparedFreeReplayStartPayload({
          assetClass: "STOCK",
          marketPresetId: "UNKNOWN_STOCK",
        }),
      ),
    expectAppErrorCode("TRADING_MARKET_PRESET_INVALID"),
  );
});

test("quoted free replay buy and sell actions execute and advance the current display period", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  const buyQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  assert.equal(buyQuote.enabled, true);
  assert.equal(buyQuote.reasonCode, null);
  assert.equal(buyQuote.facts.side, "BUY");
  assert.equal(buyQuote.facts.inputMode, "LOT");
  assert.equal(buyQuote.facts.priceMode, "CUR_CLOSE");
  assert.equal(buyQuote.blockedReasonCode, null);
  assert.ok(buyQuote.estimate.qty > 0);

  const buyResult = await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  assert.equal(buyResult.fillIds.length, 1);
  assert.ok(buyResult.session.cursor_index > session.cursor_index);
  let lastFill = readLastFill(session.id);
  assert.equal(lastFill?.side, "BUY");
  assertCloseTo(Number(lastFill?.fillQty ?? 0), buyQuote.estimate.qty);

  const sellQuote = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  assert.equal(sellQuote.enabled, true);
  assert.equal(sellQuote.reasonCode, null);
  assert.equal(sellQuote.facts.side, "SELL");
  assert.equal(sellQuote.blockedReasonCode, null);
  assert.ok(sellQuote.estimate.qty > 0);

  const sellResult = await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  assert.equal(sellResult.fillIds.length, 1);
  assert.ok(sellResult.session.cursor_index > buyResult.session.cursor_index);
  lastFill = readLastFill(session.id);
  assert.equal(lastFill?.side, "SELL");
  assertCloseTo(Number(lastFill?.fillQty ?? 0), sellQuote.estimate.qty);
});

test("blocked free replay actions echo the backend quote blocked reason", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    initialSecuritiesBalance: 500_000,
    allowShortSelling: false,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
  }, { anchorIndex: 10 });

  const quote = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const blockedReasonCode = quote.blockedReasonCode;
  assert.equal(blockedReasonCode, "SELLING_DISABLED");
  assert.equal(quote.enabled, false);
  assert.equal(quote.reasonCode, blockedReasonCode);
  assert.equal(quote.facts.side, "SELL");
  assert.equal(quote.facts.allowShortSelling, false);
  const snapshot = await getSessionSnapshot(session.id);
  assert.equal(snapshot.actionState?.sellOrder.enabled, false);
  assert.equal(snapshot.actionState?.sellOrder.reasonCode, blockedReasonCode);
  assert.equal(snapshot.actionState?.sellOrder.facts.side, "SELL");
  assert.equal(snapshot.actionState?.buyOrder.enabled, true);
  assert.equal(snapshot.actionState?.buyOrder.reasonCode, null);

  await assert.rejects(
    () =>
      executeSessionAction(session.id, {
        action: "SELL",
        inputMode: "LOT",
        lotInput: 1,
        priceMode: "CUR_CLOSE",
      }),
    expectOrderBlockedReasonCode(blockedReasonCode ?? ""),
  );
});

test("A-share lot, amount, and ratio orders quantize quote and fill quantities to 100-share lots", async () => {
  const lotSettings = {
    initialSecuritiesBalance: 5_000_000,
    minTradeStep: 100,
    tradeAmountIncludesFees: true,
  };

  const { session: lotSession } = await createSessionWithSettings("A_SHARE", lotSettings);
  const lotQuote = await quoteOrder(lotSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 3,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(lotQuote.estimate.qty, 300);
  await executeSessionAction(lotSession.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 3,
    priceMode: "CUR_CLOSE",
  });
  const lotSnapshot = await getSessionSnapshot(lotSession.id, 0);
  assert.equal(Number(lotSnapshot.fills[0]?.fill_qty ?? 0), lotQuote.estimate.qty);
  assertAlignedToStep(lotQuote.estimate.qty, 100);

  const { session: amountSession } = await createSessionWithSettings("A_SHARE", lotSettings);
  const amountBaseQuote = await quoteOrder(amountSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const amountQuote = await quoteOrder(amountSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: amountBaseQuote.estimate.cashEffect * 2.6,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(amountQuote.estimate.qty > 0);
  assertAlignedToStep(amountQuote.estimate.qty, 100);
  await executeSessionAction(amountSession.id, {
    action: "BUY",
    inputMode: "AMOUNT",
    amountInput: amountBaseQuote.estimate.cashEffect * 2.6,
    priceMode: "CUR_CLOSE",
  });
  const amountSnapshot = await getSessionSnapshot(amountSession.id, 0);
  assert.equal(Number(amountSnapshot.fills[0]?.fill_qty ?? 0), amountQuote.estimate.qty);

  const { session: formattedAmountSession } = await createSessionWithSettings("A_SHARE", lotSettings);
  const formattedAmountQuote = await quoteOrder(formattedAmountSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: "1,000,000",
    priceMode: "CUR_CLOSE",
  });
  assert.ok(formattedAmountQuote.estimate.qty > 0);
  assertAlignedToStep(formattedAmountQuote.estimate.qty, 100);
  await executeSessionAction(formattedAmountSession.id, {
    action: "BUY",
    inputMode: "AMOUNT",
    amountInput: "1,000,000",
    priceMode: "CUR_CLOSE",
  });
  const formattedAmountSnapshot = await getSessionSnapshot(formattedAmountSession.id, 0);
  assert.equal(
    Number(formattedAmountSnapshot.fills[0]?.fill_qty ?? 0),
    formattedAmountQuote.estimate.qty,
  );

  const { session: ratioSession } = await createSessionWithSettings("A_SHARE", lotSettings);
  const ratioQuote = await quoteOrder(ratioSession.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 37,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(ratioQuote.estimate.qty > 0);
  assertAlignedToStep(ratioQuote.estimate.qty, 100);
  await executeSessionAction(ratioSession.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 37,
    priceMode: "CUR_CLOSE",
  });
  const ratioSnapshot = await getSessionSnapshot(ratioSession.id, 0);
  assert.equal(Number(ratioSnapshot.fills[0]?.fill_qty ?? 0), ratioQuote.estimate.qty);
});

test("short-selling disabled blocks flat sells and caps sells to existing sellable long quantity", async () => {
  const { session } = await createSessionWithSettings("A_SHARE", {
    initialSecuritiesBalance: 5_000_000,
    allowShortSelling: false,
    minTradeStep: 100,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: true,
  });

  const flatSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(flatSell.blockedReasonCode, "SELLING_DISABLED");
  assert.equal(flatSell.estimate.qty, 0);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 3,
    priceMode: "CUR_CLOSE",
  });
  const oversizeSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 5,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(oversizeSell.blockedReasonCode, null);
  assert.equal(oversizeSell.estimate.qty, 300);
  assert.equal(oversizeSell.estimate.executionBreakdown.closeQty, 300);
  assert.equal(oversizeSell.estimate.executionBreakdown.openQty, 0);

  const oversizeAmountSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "AMOUNT",
    amountInput: oversizeSell.estimate.amount * 2,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(oversizeAmountSell.blockedReasonCode, null);
  assert.equal(oversizeAmountSell.estimate.qty, 300);
  assert.equal(oversizeAmountSell.estimate.executionBreakdown.openQty, 0);

  const ratioSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(ratioSell.blockedReasonCode, null);
  assert.equal(ratioSell.estimate.qty, 300);
  assert.equal(ratioSell.estimate.executionBreakdown.openQty, 0);

  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "SELL",
        qty: 400,
        priceMode: "CUR_CLOSE",
        autoStep: false,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "SHORT_SELLING_DISABLED",
  );

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 5,
    priceMode: "CUR_CLOSE",
  });
  const snapshot = await getSessionSnapshot(session.id, 0);
  const position = snapshot.positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.ok(Number(position?.qty ?? 0) >= 0);
  assert.equal(Number(position?.qty ?? 0), 0);
});

test("active free replay trading settings update applies immediately and cancels stale next-open shorts", async () => {
  const globalBaseline = getTradingSettings();
  const firstGlobalSettings = {
    ...globalBaseline,
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.US_STOCK,
    initialSecuritiesBalance: globalBaseline.initialSecuritiesBalance,
    allowShortSelling: true,
    minTradeStep: 1,
    tradeSettlementMode: "T0" as const,
    tradeAmountIncludesFees: true,
  };
  try {
    setTradingSettings(firstGlobalSettings);
    const session = await createOrGetSession(symbol, "1d", true);
    const initialSnapshot = await getSessionSnapshot(session.id, 0);
    assert.equal(initialSnapshot.sessionTradingSettings.minTradeStep, 1);
    assert.equal(initialSnapshot.sessionTradingSettings.allowShortSelling, true);

    const flatShortQuote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "LOT",
      lotInput: 1,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(flatShortQuote.blockedReasonCode, null);
    assert.equal(flatShortQuote.estimate.executionBreakdown.openDirection, "SHORT");

    const nextOpenShortQuote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "LOT",
      lotInput: 1,
      priceMode: "NEXT_OPEN",
      displayPeriod: "1d",
    });
    assert.equal(nextOpenShortQuote.blockedReasonCode, null);
    assert.equal(nextOpenShortQuote.priceSource, "NEXT_OPEN");
    assert.equal(nextOpenShortQuote.fillPriceField, "open");

    await placeOrder(session.id, {
      side: "SELL",
      qty: 1,
      priceMode: "NEXT_OPEN",
      nextOpenDelayBars: nextOpenShortQuote.nextOpenDelayBars,
      autoStep: false,
    });
    assert.equal(countPendingNextOpenOrders(session.id), 1);

    const noShortSettings = {
      ...firstGlobalSettings,
      ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
      initialSecuritiesBalance: globalBaseline.initialSecuritiesBalance,
      allowShortSelling: false,
      minTradeStep: 100,
      tradeSettlementMode: "T0" as const,
      tradeAmountIncludesFees: true,
    };
    setTradingSettings(noShortSettings);

    const updatedSnapshot = await updateSessionTradingSettings(
      session.id,
      noShortSettings,
    );
    assert.equal(updatedSnapshot.sessionTradingSettings.minTradeStep, 100);
    assert.equal(updatedSnapshot.sessionTradingSettings.allowShortSelling, false);
    assert.equal(updatedSnapshot.actionState.sellBlockedReasonCode, "SELLING_DISABLED");
    assert.equal(countPendingNextOpenOrders(session.id), 0);

    const lotQuote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "LOT",
      lotInput: 1,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(lotQuote.blockedReasonCode, "SELLING_DISABLED");
    assert.equal(lotQuote.estimate.qty, 0);

    const amountQuote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "AMOUNT",
      amountInput: 50_000,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(amountQuote.blockedReasonCode, "SELLING_DISABLED");
    assert.equal(amountQuote.estimate.qty, 0);

    const ratioQuote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "RATIO",
      ratioInput: 100,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(ratioQuote.blockedReasonCode, "SELLING_DISABLED");
    assert.equal(ratioQuote.estimate.qty, 0);

    await assert.rejects(
      () =>
        executeSessionAction(session.id, {
          action: "SELL",
          inputMode: "LOT",
          lotInput: 1,
          priceMode: "CUR_CLOSE",
        }),
      (error: unknown) =>
        Boolean(error) &&
        typeof error === "object" &&
        (error as { code?: unknown; args?: { blockedReasonCode?: unknown } }).code === "ORDER_BLOCKED" &&
        (error as { args?: { blockedReasonCode?: unknown } }).args?.blockedReasonCode === "SELLING_DISABLED",
    );

    await stepSession(session.id, 1);
    const afterStepSnapshot = await getSessionSnapshot(session.id, 0);
    const position = afterStepSnapshot.positions.find(
      (item) => item.instrumentId === session.instrument_id,
    );
    assert.equal(Number(position?.qty ?? 0), 0);
  } finally {
    setTradingSettings({
      ...initialTradingSettings,
      initialSecuritiesBalance: globalBaseline.initialSecuritiesBalance,
    });
  }
});

test("next-open auto-step rejects fill failures before advancing the cursor", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  const initialCursor = session.cursor_index;

  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "BUY",
        qty: 1.5,
        priceMode: "NEXT_OPEN",
        nextOpenDelayBars: 1,
      }),
    expectAppErrorCode("FILL_QTY_INVALID"),
  );

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(snapshot.session.cursor_index, initialCursor);
  assert.equal(readLastFill(session.id), undefined);
  assert.equal(countPendingNextOpenOrders(session.id), 0);
});

test("cash-only quotes reject oversized explicit lots and cap derived buy modes", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  const snapshot = await getSessionSnapshot(session.id, 0);
  const tradeCapacity = snapshot.actionState?.tradeCapacity;
  assert.ok(tradeCapacity);
  assert.equal(snapshot.sessionTradingSettings.allowLongMarginTrading, false);
  assert.equal(tradeCapacity.longFinancingAmount, 0);

  const availableCash = tradeCapacity.availableCash;
  const lotQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1_000_000,
    priceMode: "CUR_CLOSE",
  });
  const amountQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: availableCash * 10,
    priceMode: "CUR_CLOSE",
  });
  const ratioQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });

  assert.equal(lotQuote.blockedReasonCode, "BUYING_POWER_EMPTY");
  assert.equal(lotQuote.enabled, false);
  assert.equal(lotQuote.estimate.qty, 1_000_000);
  assert.ok(lotQuote.estimate.cashEffect > availableCash);

  for (const quote of [amountQuote, ratioQuote]) {
    assert.equal(quote.blockedReasonCode, null);
    assert.ok(quote.estimate.qty > 0);
    assert.ok(
      quote.estimate.cashEffect <= availableCash + 0.000001,
      `expected cash-only quote, got cash effect ${quote.estimate.cashEffect} with cash ${availableCash}`,
    );
  }

  assert.ok(lotQuote.estimate.price > 0);
  const overCashQty = Math.ceil(availableCash / lotQuote.estimate.price) + 1;
  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "BUY",
        qty: overCashQty,
        priceMode: "CUR_CLOSE",
        autoStep: false,
      }),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "ACCOUNT_BALANCE_INSUFFICIENT",
  );
});

test("long financing charges use the real cash debit", async () => {
  const marginSettings = {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 36.5,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  };

  const { session: cashPositiveSession } = await createSessionWithSettings(
    "US_STOCK",
    marginSettings,
    { anchorIndex: 10 },
  );
  await executeSessionAction(cashPositiveSession.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(readSessionCashBalance(cashPositiveSession.id) > 0);
  await stepSession(cashPositiveSession.id, 3);
  assert.equal(readLongFinancingTotal(cashPositiveSession.id), 0);

  const { session: debitSession } = await createSessionWithSettings(
    "US_STOCK",
    marginSettings,
    { anchorIndex: 10 },
  );
  await executeSessionAction(debitSession.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const debitBeforeAccrual = Math.max(0, -readSessionCashBalance(debitSession.id));
  assert.ok(debitBeforeAccrual > 0);

  await stepSession(debitSession.id, 3);
  const charges = readLongFinancingCharges(debitSession.id);
  assert.ok(charges.length > 0);
  const expectedDailyCharge = Number((debitBeforeAccrual * 0.001).toFixed(6));
  for (const charge of charges) {
    assertCloseTo(charge.referencePrice, debitBeforeAccrual);
    assertCloseTo(charge.annualRate, 36.5);
    assert.ok(charge.accrualDays > 0);
    assertCloseTo(
      charge.amount,
      Number((expectedDailyCharge * charge.accrualDays).toFixed(6)),
    );
  }
});

test("next-open quote projects financing accrual before fill cash and pnl", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 36.5,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const cashBeforeQuote = readSessionCashBalance(session.id);
  const debitBeforeQuote = Math.max(0, -cashBeforeQuote);
  assert.ok(debitBeforeQuote > 0);

  const quote = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  const expectedAccrual = Number((debitBeforeQuote * 0.001).toFixed(6));
  assert.equal(quote.blockedReasonCode, null);
  assert.equal(quote.priceSource, "NEXT_OPEN");
  assert.equal(quote.fillPriceField, "open");
  assertCloseTo(quote.projectedAfterFill.longFinancingAccrual, expectedAccrual);
  assert.equal(quote.projectedAfterFill.shortBorrowAccrual, 0);
  assertCloseTo(
    quote.projectedAfterFill.cashBalance,
    cashBeforeQuote - expectedAccrual + quote.estimate.cashEffect,
  );

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  const cashAfterFill = readSessionCashBalance(session.id);
  assertCloseTo(cashAfterFill, quote.projectedAfterFill.cashBalance);
  assertCloseTo(readLongFinancingTotal(session.id), expectedAccrual);
});

test("replay archive equity includes long financing cash adjustments", async () => {
  const { session, settings } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 36.5,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  await stepSession(session.id, 3);

  const liveSnapshot = await getSessionSnapshot(session.id, 0);
  const liveSecuritiesTotal = calculateSnapshotSecuritiesTotal(liveSnapshot);
  const longFinancingTotal = readLongFinancingTotal(session.id);
  assert.ok(longFinancingTotal > 0);

  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    settings.initialSecuritiesBalance,
    [],
    null,
    "1d",
    null,
    { bypassAccessGuard: true },
  );
  const cashAdjustments = getArchiveCashAdjustments(archive);
  const cashAdjustmentTotal = cashAdjustments.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const replay = archive.replay as
    | { equityCurve?: Array<{ value?: unknown }> }
    | undefined;
  const finalCurveValue = Number(replay?.equityCurve?.at(-1)?.value ?? 0);

  assert.ok(cashAdjustments.length > 0);
  assertCloseTo(cashAdjustmentTotal, longFinancingTotal, 0.000001);
  assertCloseTo(archive.summary.tradingCost, longFinancingTotal, 0.000001);
  assertCloseTo(archive.metrics.finalEquity, liveSecuritiesTotal, 0.000001);
  assertCloseTo(finalCurveValue, liveSecuritiesTotal, 0.000001);
  assertCloseTo(
    archive.summary.totalPnl,
    liveSecuritiesTotal - settings.initialSecuritiesBalance,
    0.000001,
  );

  const createdAt = "2026-04-29T00:00:00.000Z";
  const projectId = "long-financing-cash-adjustment-archive-project";
  await createTrainingProject({
    id: projectId,
    name: "Long financing cash adjustment archive",
    createdAt,
    updatedAt: createdAt,
    initialTotal: archive.summary.initialAsset,
    totalPnl: archive.summary.totalPnl,
    profitRate: archive.summary.profitRate,
    durationDays: archive.summary.durationDays,
    totalTrades: archive.summary.totalTrades,
    symbol: archive.symbol,
    samplePoolId: SYSTEM_WIKI_EOD_POOL_ID,
    samplePoolName: "Backend Environment",
    baseTimeframe: archive.baseTimeframe,
    trainingDateRange: archive.trainingDateRange,
    summary: archive.summary,
    finalEquity: archive.metrics.finalEquity,
    equityReturnRate: archive.metrics.equityReturnRate,
    replay: archive.replay,
    reviewProjection: archive.reviewProjection,
    operatorSummary: buildHumanOperatorSummary(),
  });
  const savedProject = await getTrainingProjectById(projectId);
  assert.ok(savedProject);
  const savedReplay = savedProject?.replay as
    | {
        snapshot?: { cashAdjustments?: Array<{ amount?: unknown }> };
        finalEquity?: unknown;
      }
    | undefined;
  const savedCashAdjustments = savedReplay?.snapshot?.cashAdjustments ?? [];
  const savedCashAdjustmentTotal = savedCashAdjustments.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  assertCloseTo(savedCashAdjustmentTotal, longFinancingTotal, 0.000001);
  assertCloseTo(Number(savedReplay?.finalEquity ?? 0), liveSecuritiesTotal, 0.000001);

  const report = buildReplayReviewReport({ projects: [savedProject] });
  const reportSession = report.sessions.find((item) => item.id === projectId);
  assert.ok(reportSession);
  assertCloseTo(reportSession.borrowCost, longFinancingTotal, 0.000001);
  assert.equal(report.trendFacts.recentWindowSize, 1);
  assert.equal(report.trendFacts.points[0]?.sessionId, projectId);
  assert.equal(
    report.trendFacts.points[0]?.rollingAverage,
    reportSession.returnRate,
  );

  const diagnostics = buildReplayReviewDiagnosticsFromProjects(
    [savedProject],
    [projectId],
  );
  const diagnosticDetail = diagnostics.archiveFinancialDetailsById[projectId];
  assert.ok(diagnosticDetail);
  assertCloseTo(diagnosticDetail.fundingOrBorrowCost, longFinancingTotal, 0.000001);
});

test("disabling long margin blocks new financed longs while existing debit keeps accruing", async () => {
  const { session, settings } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 36.5,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const debitBeforeDisable = Math.max(0, -readSessionCashBalance(session.id));
  assert.ok(debitBeforeDisable > 0);

  const disabledSnapshot = await updateSessionTradingSettings(session.id, {
    ...settings,
    allowLongMarginTrading: false,
  });
  const disabledCapacity = disabledSnapshot.actionState?.tradeCapacity;
  assert.ok(disabledCapacity);
  assert.equal(disabledSnapshot.sessionTradingSettings.allowLongMarginTrading, false);
  assert.equal(disabledCapacity.longFinancingAmount, 0);
  assert.equal(disabledCapacity.longBuyingPowerQty, 0);

  const buyQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(buyQuote.blockedReasonCode, "BUYING_POWER_EMPTY");
  assert.equal(buyQuote.enabled, false);
  assert.equal(buyQuote.estimate.qty, 1);
  assert.ok(buyQuote.estimate.cashEffect > 0);

  const sellQuote = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(sellQuote.blockedReasonCode, null);
  assert.equal(sellQuote.estimate.executionBreakdown.closeDirection, "LONG");
  assert.ok(sellQuote.estimate.qty > 0);

  await stepSession(session.id, 3);
  const charges = readLongFinancingCharges(session.id);
  assert.ok(charges.length > 0);
  const expectedDailyCharge = Number((debitBeforeDisable * 0.001).toFixed(6));
  for (const charge of charges) {
    assertCloseTo(charge.referencePrice, debitBeforeDisable);
    assert.ok(charge.accrualDays > 0);
    assertCloseTo(
      charge.amount,
      Number((expectedDailyCharge * charge.accrualDays).toFixed(6)),
    );
  }
});

test("disabling short selling on a session with existing short only allows buy-to-cover", async () => {
  const { session, settings } = await createSessionWithSettings("US_STOCK", {
    allowShortSelling: true,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: true,
  });

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  const shortSnapshot = await getSessionSnapshot(session.id, 0);
  const shortPosition = shortSnapshot.positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.equal(Number(shortPosition?.qty ?? 0), -2);

  const noShortSnapshot = await updateSessionTradingSettings(session.id, {
    ...settings,
    allowShortSelling: false,
  });
  assert.equal(noShortSnapshot.sessionTradingSettings.allowShortSelling, false);

  const addShortQuote = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(addShortQuote.blockedReasonCode, "SELLING_DISABLED");
  assert.equal(addShortQuote.estimate.qty, 0);

  const coverQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(coverQuote.blockedReasonCode, null);
  assert.equal(coverQuote.estimate.executionBreakdown.closeDirection, "SHORT");
  assert.equal(coverQuote.estimate.executionBreakdown.openQty, 0);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  const coveredSnapshot = await getSessionSnapshot(session.id, 0);
  const coveredPosition = coveredSnapshot.positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.equal(Number(coveredPosition?.qty ?? 0), 0);
});

test("stock amount mode follows gross-vs-cash-effect semantics on buy and sell", async () => {
  const { session: buySession } = await createSessionWithSettings("A_SHARE", {
    tradeAmountIncludesFees: false,
  });
  const buyGrossQuote = await quoteOrder(buySession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const buyAmountQuote = await quoteOrder(buySession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: buyGrossQuote.estimate.amount,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(buyAmountQuote.estimate.qty, buyGrossQuote.estimate.qty);

  const { session: buyFeeSession } = await createSessionWithSettings("A_SHARE", {
    tradeAmountIncludesFees: true,
  });
  const buyCashEffectQuote = await quoteOrder(buyFeeSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const buyFeeInclusiveAmountQuote = await quoteOrder(buyFeeSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: buyCashEffectQuote.estimate.cashEffect,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(
    buyFeeInclusiveAmountQuote.estimate.qty,
    buyCashEffectQuote.estimate.qty,
  );

  const { session: sellSession } = await createSessionWithSettings("US_STOCK", {
    tradeAmountIncludesFees: true,
  });
  await executeSessionAction(sellSession.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });

  const sellCashEffectQuote = await quoteOrder(sellSession.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const sellFeeInclusiveAmountQuote = await quoteOrder(sellSession.id, {
    side: "SELL",
    inputMode: "AMOUNT",
    amountInput: sellCashEffectQuote.estimate.cashEffect,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(
    sellFeeInclusiveAmountQuote.estimate.qty,
    sellCashEffectQuote.estimate.qty,
  );
});

test("futures, forex, and crypto amount mode reuse the correct contract semantics", async () => {
  const { session: futuresSession } = await createSessionWithSettings("FUTURES_COMMODITY", {
    tradeAmountIncludesFees: true,
  });
  const futuresLotQuote = await quoteOrder(futuresSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  const futuresAmountQuote = await quoteOrder(futuresSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: futuresLotQuote.estimate.cashEffect,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(futuresAmountQuote.estimate.qty, futuresLotQuote.estimate.qty);

  const { session: forexSession } = await createSessionWithSettings("FOREX_MICRO_LOT", {
    tradeAmountIncludesFees: true,
  });
  const forexLotQuote = await quoteOrder(forexSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 0.01,
    priceMode: "CUR_CLOSE",
  });
  const forexAmountQuote = await quoteOrder(forexSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: forexLotQuote.estimate.cashEffect,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(forexAmountQuote.estimate.qty, forexLotQuote.estimate.qty);

  const { session: cryptoSession } = await createSessionWithSettings("CRYPTO_USDT_PERP", {
    tradeAmountIncludesFees: true,
  });
  const cryptoLotQuote = await quoteOrder(cryptoSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 0.001,
    priceMode: "CUR_CLOSE",
  });
  const cryptoAmountQuote = await quoteOrder(cryptoSession.id, {
    side: "BUY",
    inputMode: "AMOUNT",
    amountInput: cryptoLotQuote.estimate.cashEffect,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(cryptoAmountQuote.estimate.qty, cryptoLotQuote.estimate.qty);

  const { session: cryptoSpotSession } = await createSessionWithSettings("CRYPTO_SPOT", {
    tradeAmountIncludesFees: true,
  });
  const cryptoSpotQuote = await quoteOrder(cryptoSpotSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 0.001,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(cryptoSpotQuote.estimate.qty, 0.001);
  const cryptoSpotSellQuote = await quoteOrder(cryptoSpotSession.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 0.001,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(cryptoSpotSellQuote.blockedReasonCode, "SELLING_DISABLED");
});

test("quote, execution, and fill storage use the same fee model totals", async () => {
  const { session, settings } = await createSessionWithSettings("A_SHARE", {
    initialSecuritiesBalance: 5_000_000,
    slippageRate: 0.01,
    tradeAmountIncludesFees: true,
  });
  const cashBefore = readSessionCashBalance(session.id);
  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(quote.blockedReasonCode, null);
  assert.equal(quote.estimate.qty, 200);

  const expectedBreakdown = calculateTradingCostBreakdown(
    quote.estimate.amount,
    "BUY",
    settings,
    quote.estimate.qty,
  );
  assertCloseTo(quote.estimate.tradingCost, expectedBreakdown.tradingCost);
  assertCloseTo(
    quote.estimate.cashEffect,
    quote.estimate.amount + expectedBreakdown.tradingCost,
  );

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  const fill = readLastFill(session.id);
  assert.ok(fill);
  assert.equal(fill.side, "BUY");
  assert.equal(fill.fillQty, quote.estimate.qty);
  assertCloseTo(fill.fee, expectedBreakdown.fee);
  assertCloseTo(fill.tax, expectedBreakdown.tax);
  assertCloseTo(fill.slippage, expectedBreakdown.slippage);
  assertCloseTo(
    readSessionCashBalance(session.id),
    cashBefore - quote.estimate.cashEffect,
  );

  const snapshot = await getSessionSnapshot(session.id, 0);
  assertCloseTo(snapshot.tradingCostBreakdown.fees, expectedBreakdown.fee);
  assertCloseTo(snapshot.tradingCostBreakdown.taxes, expectedBreakdown.tax);
  assertCloseTo(snapshot.tradingCostBreakdown.slippage, expectedBreakdown.slippage);
});

test("cash-only buy capacity treats fees as required cash and refuses fee-induced overbuy", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    minTradeStep: 1,
    platformFeeMinimumFee: 500_001,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: true,
  }, { anchorIndex: 10 });

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(quote.blockedReasonCode, "BUYING_POWER_EMPTY");
  assert.equal(quote.enabled, false);
  assert.equal(quote.estimate.qty, 1);
  assert.ok(quote.estimate.cashEffect > 500_000);

  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "BUY",
        qty: 1,
        priceMode: "CUR_CLOSE",
        autoStep: false,
      }),
    expectAppErrorCode("ACCOUNT_BALANCE_INSUFFICIENT"),
  );
});

test("100 percent cash-only ratio buy uses all affordable cash without crossing it", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  const initialCash = readSessionCashBalance(session.id);

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(quote.blockedReasonCode, null);
  assert.equal(quote.priceSource, "CURRENT_CLOSE");
  assert.equal(quote.fillPriceField, "close");
  assert.ok(quote.estimate.qty > 0);
  assert.ok(quote.estimate.cashEffect <= initialCash + 0.000001);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const cashAfter = readSessionCashBalance(session.id);
  assert.ok(cashAfter >= -0.000001);
  assert.ok(cashAfter < quote.estimate.price + 0.000001);
  const fill = readLastFill(session.id);
  assert.equal(fill?.fillQty, quote.estimate.qty);
});

test("100 percent cash-only next-open ratio buy blocks follow-up buys after consuming cash", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  const initialCash = readSessionCashBalance(session.id);

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  assert.equal(quote.blockedReasonCode, null);
  assert.equal(quote.priceSource, "NEXT_OPEN");
  assert.equal(quote.fillPriceField, "open");
  assert.equal(quote.executionPlan?.fillRawIndex, session.cursor_index + quote.nextOpenDelayBars);
  assertCloseTo(
    quote.executionPlan?.fillPrice ?? 0,
    quote.estimate.price,
  );
  assert.ok(quote.estimate.qty > 0);
  assert.ok(quote.tradeCapacity.longBuyingPowerQty >= quote.estimate.qty);
  assert.ok(quote.estimate.cashEffect <= initialCash + 0.000001);
  assertCloseTo(
    quote.projectedAfterFill.cashBalance,
    initialCash - quote.estimate.cashEffect,
  );

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.ok(snapshot.session.cursor_index > session.cursor_index);
  const fill = readLastFill(session.id);
  assert.equal(fill?.side, "BUY");
  assert.equal(fill?.fillQty, quote.estimate.qty);
  assertCloseTo(fill?.fillPrice ?? 0, quote.executionPlan?.fillPrice ?? 0);

  const followUpQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  assert.ok(
    followUpQuote.blockedReasonCode === "BUYING_POWER_EMPTY" ||
      followUpQuote.blockedReasonCode === "QUANTITY_ZERO",
    `expected follow-up buy to be blocked, got ${followUpQuote.blockedReasonCode}`,
  );
  assert.equal(followUpQuote.estimate.qty, 0);
});

test("long-margin ratio buy and direct execution share the same financing ceiling", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  const initialSnapshot = await getSessionSnapshot(session.id, 0);
  const tradeCapacity = initialSnapshot.actionState?.tradeCapacity;
  assert.ok(tradeCapacity);
  assert.ok(tradeCapacity.longFinancingAmount > 0);

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(quote.blockedReasonCode, null);
  assert.equal(quote.estimate.qty, tradeCapacity.longBuyingPowerQty);
  assert.ok(
    quote.estimate.cashEffect <=
      tradeCapacity.availableCash + tradeCapacity.longFinancingAmount + 0.000001,
  );

  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "BUY",
        qty: quote.estimate.qty * 3,
        priceMode: "CUR_CLOSE",
        autoStep: false,
      }),
    expectAppErrorCode("ACCOUNT_BALANCE_INSUFFICIENT"),
  );

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const cashAfter = readSessionCashBalance(session.id);
  assert.ok(cashAfter < 0);
  assert.ok(Math.abs(cashAfter) <= tradeCapacity.longFinancingAmount + 0.000001);
  const fill = readLastFill(session.id);
  assert.equal(fill?.fillQty, quote.estimate.qty);
});

test("short ratio capacity and direct execution share the same margin ceiling", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: true,
    shortInitialMarginRatio: 150,
    shortMaintenanceMarginRatio: 100,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });
  const initialSnapshot = await getSessionSnapshot(session.id, 0);
  const shortCapacity =
    initialSnapshot.actionState?.tradeCapacity.shortOpenCapacityQty ?? 0;
  assert.ok(shortCapacity > 0);
  assert.equal(
    initialSnapshot.actionState?.tradeCapacity.ratioBases.sell.kind,
    "SHORT_OPEN_CAPACITY",
  );
  assert.equal(
    initialSnapshot.actionState?.tradeCapacity.ratioBases.sell.quantity,
    shortCapacity,
  );

  for (const item of [
    { ratioInput: 25, expectedQty: Math.floor(shortCapacity * 0.25) },
    { ratioInput: 50, expectedQty: Math.floor(shortCapacity * 0.5) },
    { ratioInput: 100, expectedQty: shortCapacity },
  ]) {
    const quote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "RATIO",
      ratioInput: item.ratioInput,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(quote.blockedReasonCode, null);
    assert.equal(quote.estimate.qty, item.expectedQty);
    assert.equal(quote.estimate.executionBreakdown.openDirection, "SHORT");
    assert.equal(quote.estimate.executionBreakdown.openQty, item.expectedQty);
  }

  await assert.rejects(
    () =>
      placeOrder(session.id, {
        side: "SELL",
        qty: shortCapacity + 1,
        priceMode: "CUR_CLOSE",
        autoStep: false,
      }),
    expectAppErrorCode("SHORT_MARGIN_INSUFFICIENT"),
  );

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const position = (await getSessionSnapshot(session.id, 0)).positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.equal(Number(position?.qty ?? 0), -shortCapacity);
});

test("ratio buy while short uses buying power instead of only the short close quantity", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    shortInitialMarginRatio: 150,
    shortMaintenanceMarginRatio: 100,
    minTradeStep: 1,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });

  const shortSnapshot = await getSessionSnapshot(session.id, 0);
  const shortPosition = shortSnapshot.positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  const shortQty = Math.abs(Number(shortPosition?.qty ?? 0));
  assert.ok(shortQty > 0);
  const tradeCapacity = shortSnapshot.actionState?.tradeCapacity;
  assert.ok(tradeCapacity);
  assert.equal(tradeCapacity.ratioBases.buy.kind, "LONG_BUYING_POWER");
  assert.ok(tradeCapacity.longBuyingPowerQty > shortQty);

  const buyQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(buyQuote.blockedReasonCode, null);
  assertCloseTo(buyQuote.estimate.qty, tradeCapacity.longBuyingPowerQty);
  assert.ok(buyQuote.estimate.qty > shortQty);
  assertCloseTo(buyQuote.estimate.executionBreakdown.closeQty, shortQty);
  assert.ok(buyQuote.estimate.executionBreakdown.openQty > 0);
  assert.equal(buyQuote.estimate.executionBreakdown.openDirection, "LONG");

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const fill = readLastFill(session.id);
  assert.equal(fill?.side, "BUY");
  assertCloseTo(Number(fill?.fillQty ?? 0), buyQuote.estimate.qty);
  const finalPosition = (await getSessionSnapshot(session.id, 0)).positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.ok(Number(finalPosition?.qty ?? 0) > 0);
});

test("buy actions execute the latest backend quote instead of stale preview quantity", async () => {
  const { session } = await createSessionWithSettings("A_SHARE", {
    initialSecuritiesBalance: 5_000_000,
    tradeAmountIncludesFees: true,
  });
  const stalePreviewQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(stalePreviewQuote.estimate.qty > 0);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const latestQuote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(latestQuote.estimate.qty > 0);
  assert.notEqual(latestQuote.estimate.qty, stalePreviewQuote.estimate.qty);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const snapshot = await getSessionSnapshot(session.id, 0);
  const fillQty = Number(snapshot.fills.at(-1)?.fill_qty ?? 0);
  assert.equal(fillQty, latestQuote.estimate.qty);
});

test("fills persist contract multiplier into snapshot cash and replay archive amounts", async () => {
  const { session, settings } = await createSessionWithSettings("FUTURES_COMMODITY", {
    initialSecuritiesBalance: 500_000,
    contractMultiplier: 25,
    tradeAmountIncludesFees: true,
  });

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(quote.estimate.qty > 0);
  assert.ok(Math.abs(quote.estimate.amount - quote.estimate.price * quote.estimate.qty * 25) < 0.000001);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(snapshot.fills.length, 1);
  assert.equal(snapshot.fills[0]?.contract_multiplier, 25);
  const securitiesCash = snapshot.accounts.find((account) => account.kind === "SECURITIES")?.balance;
  assert.ok(
    Math.abs(Number(securitiesCash) - (settings.initialSecuritiesBalance - quote.estimate.cashEffect)) <
      0.000001,
  );

  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    settings.initialSecuritiesBalance,
    [],
    null,
    "1d",
    null,
    { bypassAccessGuard: true },
  );
  assert.ok(Math.abs(archive.summary.investedAmount - quote.estimate.amount) < 0.000001);
});

test("quotes and archives preserve fractional contract multiplier amounts", async () => {
  const fractionalMultiplier = 0.25;
  const { session, settings } = await createSessionWithSettings("FUTURES_COMMODITY", {
    initialSecuritiesBalance: 500_000,
    contractMultiplier: fractionalMultiplier,
    tradeAmountIncludesFees: true,
  });

  const quote = await quoteOrder(session.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 4,
    priceMode: "CUR_CLOSE",
  });
  assert.ok(quote.estimate.qty > 0);
  assertCloseTo(
    quote.estimate.amount,
    quote.estimate.price * quote.estimate.qty * fractionalMultiplier,
  );

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 4,
    priceMode: "CUR_CLOSE",
  });

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(snapshot.fills.length, 1);
  assertCloseTo(Number(snapshot.fills[0]?.contract_multiplier ?? 0), fractionalMultiplier);
  const securitiesCash = snapshot.accounts.find((account) => account.kind === "SECURITIES")?.balance;
  assertCloseTo(
    Number(securitiesCash),
    settings.initialSecuritiesBalance - quote.estimate.cashEffect,
  );

  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    settings.initialSecuritiesBalance,
    [],
    null,
    "1d",
    null,
    { bypassAccessGuard: true },
  );
  assertCloseTo(archive.summary.investedAmount, quote.estimate.amount);
});

test("archive forced close persists fee, tax, and slippage from the live fee model", async () => {
  const { session, settings } = await createSessionWithSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 5_000_000,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    minTradeStep: 1,
    regulatoryFeeRate: 0.00206,
    transactionLevyRate: 0.000195,
    transactionLevyMinimumFee: 0.01,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 100,
    priceMode: "CUR_CLOSE",
  });
  const openSnapshot = await getSessionSnapshot(session.id, 0);
  const position = openSnapshot.positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.equal(Number(position?.qty ?? 0), 100);
  const markPrice = Number(position?.markPrice ?? 0);
  assert.ok(markPrice > 0);

  const expectedCloseBreakdown = calculateTradingCostBreakdown(
    markPrice * 100,
    "SELL",
    settings,
    100,
  );
  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    settings.initialSecuritiesBalance,
    [],
    null,
    "1d",
    "CUR_CLOSE",
    { bypassAccessGuard: true },
  );
  const fills = getArchiveFills(archive);
  const forcedFill = fills.at(-1);
  assert.ok(forcedFill);
  assert.equal(forcedFill.side, "SELL");
  assert.equal(Number(forcedFill.fill_qty ?? 0), 100);
  assertCloseTo(Number(forcedFill.fill_price ?? 0), markPrice);
  assertCloseTo(Number(forcedFill.fee ?? 0), expectedCloseBreakdown.fee);
  assertCloseTo(Number(forcedFill.tax ?? 0), expectedCloseBreakdown.tax);
  assertCloseTo(Number(forcedFill.slippage ?? 0), expectedCloseBreakdown.slippage);

  const archiveSnapshot = getArchiveSnapshot(archive);
  assert.deepEqual(archiveSnapshot.positions, []);
  assertCloseTo(getArchiveSecuritiesCash(archive), archive.metrics.finalEquity);
});

test("large built-in FX archives keep replay refs and market preset facts", async () => {
  const { session, settings } = await createSessionWithSettings("FOREX_STANDARD_LOT", {
    initialSecuritiesBalance: 500_000,
  }, {
    symbol: "EURUSD",
    timeframe: "1m",
    anchorIndex: 30_000,
    samplePoolId: "__sample_pool_system_fx_1m_2025q1__",
    minimumBaseTimeframe: "1m",
  });

  const archive = await buildReplayPayloadFromSessionArchive(
    session.id,
    settings.initialSecuritiesBalance,
    [],
    null,
    "1m",
    null,
    { bypassAccessGuard: true },
  );
  assert.equal(archive.replayOmitted, false);
  assert.ok(archive.replay);
  assert.ok(Array.isArray(archive.replay.bars));
  assert.ok(archive.replay.bars.length > 25_000);
  assert.equal(archive.reviewProjection?.marketPresetId, "FOREX_STANDARD_LOT");
  assert.equal(archive.reviewProjection?.assetClass, "FOREX");

  const createdAt = "2026-04-29T00:00:00.000Z";
  const projectId = "oversized-fx-archive-project";
  await createTrainingProject({
    id: projectId,
    name: "Oversized FX archive",
    createdAt,
    updatedAt: createdAt,
    initialTotal: archive.summary.initialAsset,
    totalPnl: archive.summary.totalPnl,
    profitRate: archive.summary.profitRate,
    durationDays: archive.summary.durationDays,
    totalTrades: archive.summary.totalTrades,
    symbol: archive.symbol,
    samplePoolId: "__sample_pool_system_fx_1m_2025q1__",
    samplePoolName: "Built-in FX 1m 2025Q1",
    baseTimeframe: archive.baseTimeframe,
    trainingDateRange: archive.trainingDateRange,
    summary: archive.summary,
    finalEquity: archive.metrics.finalEquity,
    equityReturnRate: archive.metrics.equityReturnRate,
    replay: archive.replay,
    reviewProjection: archive.reviewProjection,
    operatorSummary: buildHumanOperatorSummary(),
  });

  const fact = db
    .prepare(
      `SELECT market_preset_id AS marketPresetId, asset_class AS assetClass
       FROM training_stats_sessions
       WHERE project_id = ?`,
    )
    .get(projectId) as
    | { marketPresetId: string; assetClass: string }
    | undefined;
  assert.deepEqual(fact, {
    marketPresetId: "FOREX_STANDARD_LOT",
    assetClass: "FOREX",
  });

  const refRow = db
    .prepare(
      `SELECT project_id AS projectId, instrument_id AS instrumentId
         FROM training_project_replay_refs
        WHERE project_id = ?`,
    )
    .get(projectId) as
    | { projectId: string; instrumentId: string }
    | undefined;
  assert.equal(refRow?.projectId, projectId);

  const savedProject = await getTrainingProjectById(projectId);
  assert.equal(savedProject?.replayHydrationStatus, "READY");
  assert.equal(savedProject?.replay?.snapshot?.session?.instrument_id, refRow?.instrumentId);
  assert.equal(
    savedProject?.replay?.bars?.length,
    Math.min(
      archive.replay.bars.length,
      DESKTOP_API_LIMITS.noteContextBarsMax,
    ),
  );
});

test("snapshot fills keep deterministic ordering for multiple fills on the same raw index", async () => {
  const { session } = await createSessionWithSettings("US_STOCK", {
    initialSecuritiesBalance: 5_000_000,
    tradeAmountIncludesFees: true,
  });

  const first = await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const second = await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.deepEqual(
    snapshot.fills.map((fill) => fill.id),
    [first.fillIds[0], second.fillIds[0]],
  );
  assert.equal(snapshot.fills[0]?.fill_index, snapshot.fills[1]?.fill_index);
});

test("T+1 blocks same-day current-close sells while allowing the next session open", async () => {
  const { session } = await createSessionWithSettings("A_SHARE", {
    initialSecuritiesBalance: 500_000,
    tradeAmountIncludesFees: true,
  });
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });

  const sameCloseSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(sameCloseSell.blockedReasonCode, "SELL_T1_BLOCKED");

  const nextOpenSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "NEXT_OPEN",
  });
  assert.equal(nextOpenSell.priceSource, "NEXT_OPEN");
  assert.equal(nextOpenSell.fillPriceField, "open");
  assert.notEqual(nextOpenSell.blockedReasonCode, "SELL_T1_BLOCKED");
  assert.ok(nextOpenSell.estimate.qty > 0);
});

test("T+1 only blocks same-day bought quantity and execution follows the quoted sellable amount", async () => {
  const { session } = await createSessionWithSettings("A_SHARE", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 5_000_000,
    allowShortSelling: false,
    minTradeStep: 100,
    tradeSettlementMode: "T1",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  await stepSession(session.id, 1);
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });

  const sameCloseSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(sameCloseSell.blockedReasonCode, null);
  assert.equal(sameCloseSell.estimate.qty, 100);
  assert.equal(sameCloseSell.estimate.executionBreakdown.closeQty, 100);

  const nextOpenSell = await quoteOrder(session.id, {
    side: "SELL",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "NEXT_OPEN",
  });
  assert.equal(nextOpenSell.priceSource, "NEXT_OPEN");
  assert.equal(nextOpenSell.fillPriceField, "open");
  assert.notEqual(nextOpenSell.blockedReasonCode, "SELL_T1_BLOCKED");
  assert.equal(nextOpenSell.estimate.qty, 200);

  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  const fill = readLastFill(session.id);
  assert.equal(fill?.side, "SELL");
  assert.equal(fill?.fillQty, sameCloseSell.estimate.qty);
  const position = (await getSessionSnapshot(session.id, 0)).positions.find(
    (item) => item.instrumentId === session.instrument_id,
  );
  assert.equal(Number(position?.qty ?? 0), 100);
});

test("T+1 ratio sells are sized from sellable lots only", async () => {
  const { session } = await createSessionWithSettings("A_SHARE", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 5_000_000,
    allowShortSelling: false,
    minTradeStep: 100,
    tradeSettlementMode: "T1",
    tradeAmountIncludesFees: false,
  }, { anchorIndex: 10 });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 4,
    priceMode: "CUR_CLOSE",
  });
  await stepSession(session.id, 1);
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });

  const snapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(snapshot.actionState?.tradeCapacity.ratioBases.sell.kind, "CLOSE_LONG");
  assert.equal(snapshot.actionState?.tradeCapacity.ratioBases.sell.quantity, 400);

  const cases = [
    { ratioInput: 25, expectedQty: 100 },
    { ratioInput: 50, expectedQty: 200 },
    { ratioInput: 100, expectedQty: 400 },
  ];
  for (const item of cases) {
    const quote = await quoteOrder(session.id, {
      side: "SELL",
      inputMode: "RATIO",
      ratioInput: item.ratioInput,
      priceMode: "CUR_CLOSE",
    });
    assert.equal(quote.blockedReasonCode, null);
    assert.equal(quote.estimate.qty, item.expectedQty);
    assert.equal(quote.estimate.executionBreakdown.closeQty, item.expectedQty);
    assert.equal(quote.estimate.executionBreakdown.openQty, 0);
  }
});

test("no-future-bar quotes allow only close orders and block new exposure", async () => {
  const { session: closeOnlySession } = await createSessionWithSettings("US_STOCK", {
    tradeAmountIncludesFees: true,
  });
  await executeSessionAction(closeOnlySession.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  await stepSession(closeOnlySession.id, 1_000_000);

  const endSnapshot = await getSessionSnapshot(closeOnlySession.id, 0);
  assert.equal(endSnapshot.termination?.hasFutureBars, false);

  const closeOnlyBuyQuote = await quoteOrder(closeOnlySession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 2,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(closeOnlyBuyQuote.estimate.executionBreakdown.closeQty, 1);
  assert.equal(closeOnlyBuyQuote.estimate.executionBreakdown.openQty, 0);
  assert.equal(closeOnlyBuyQuote.estimate.qty, 1);

  const { session: endedFlatSession } = await createSessionWithSettings("US_STOCK", {
    tradeAmountIncludesFees: true,
  });
  await stepSession(endedFlatSession.id, 1_000_000);
  const endedFlatQuote = await quoteOrder(endedFlatSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(endedFlatQuote.estimate.qty, 0);
});

test("quote and execution keep margin scoped to the active free replay session", async () => {
  const { session: shortSession } = await createSessionWithSettings("US_STOCK", {
    initialSecuritiesBalance: 500_000,
    allowShortSelling: true,
    shortInitialMarginRatio: 150,
    shortMaintenanceMarginRatio: 100,
    tradeAmountIncludesFees: true,
    minTradeStep: 1,
  });
  await executeSessionAction(shortSession.id, {
    action: "SELL",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });

  const { session: longSession } = await createSessionWithSettings("US_STOCK", {
    initialSecuritiesBalance: 500_000,
    allowLongMarginTrading: false,
    allowShortSelling: true,
    shortInitialMarginRatio: 150,
    shortMaintenanceMarginRatio: 100,
    tradeAmountIncludesFees: true,
    minTradeStep: 1000,
  });

  const quote = await quoteOrder(longSession.id, {
    side: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(quote.estimate.qty, 1000);
  assert.equal(quote.blockedReasonCode, null);

  const result = await executeSessionAction(longSession.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  assert.equal(result.fillIds.length, 1);
});
