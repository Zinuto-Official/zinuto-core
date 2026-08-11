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

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-free-replay-end-training-"),
);
process.env.ZINUTO_DB_PATH = path.join(tempDbDir, "zinuto.db");

const { db, listSystemSeedSymbols } = await import("../../src/infrastructure/db/database.js");
const {
  createOrGetSession,
  getLatestResumableSession,
  getSessionSnapshot,
  getTradingSettings,
  setTradingSettings,
} = await import("../../src/application/trading/sessionService.js");
const { executeSessionAction } = await import("../../src/application/trading/orderService.js");
const {
  cleanupStaleSessions,
  previewTrainingSummary,
  resetAllTraining,
} = await import("../../src/application/trading/resetService.js");
const { calculateTradingCostBreakdown } = await import(
  "../../src/domain/trading/feeModel.js"
);

const symbol = listSystemSeedSymbols()[0] ?? "AAPL";

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

const assertCloseTo = (actual: number, expected: number, epsilon = 0.000001) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

test("ending training force-closes the exact remaining position even after the trade step changes", async () => {
  const sessionSettings = buildSessionTradingSettings("US_STOCK", {
    minTradeStep: 1,
  });
  const session = await createOrGetSession(symbol, "1d", true, 10, {
    sessionTradingSettings: sessionSettings,
  });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 269,
    priceMode: "CUR_CLOSE",
  });

  const beforeReset = await getSessionSnapshot(session.id, 0);
  const positionBeforeReset = beforeReset.positions.find(
    (position) => position.instrumentId === session.instrument_id,
  );
  assert.equal(positionBeforeReset?.qty, 269);

  const globalBaseline = getTradingSettings();
  setTradingSettings({
    ...globalBaseline,
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
    initialSecuritiesBalance: globalBaseline.initialSecuritiesBalance,
    minTradeStep: 100,
  });

  const result = await resetAllTraining("NEXT_OPEN");
  assert.equal(result.clearedSessions, 1);
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(session.id) ?? 0,
    ),
    0,
  );
});

test("ending-training preview does not synthesize long financing when no cash was borrowed", async () => {
  const sessionSettings = buildSessionTradingSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    minTradeStep: 1,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 365,
    tradeSettlementMode: "T0",
  });
  const session = await createOrGetSession(symbol, "1d", true, 10, {
    sessionTradingSettings: sessionSettings,
  });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
  });
  const cashBalance = Number(
    db
      .prepare("SELECT cash_balance FROM replay_sessions WHERE id = ?")
      .pluck()
      .get(session.id) ?? 0,
  );
  assert.ok(cashBalance > 0);

  db.prepare(
    `UPDATE replay_sessions
        SET cursor_index = cursor_index + 1
      WHERE id = ?`,
  ).run(session.id);

  const openSummary = await previewTrainingSummary(symbol, "1d");
  const finalizedSummary = await previewTrainingSummary(symbol, "1d", "CUR_CLOSE");
  assert.equal(openSummary.tradingCost, 0);
  assert.equal(finalizedSummary.tradingCost, 0);
  assert.equal(finalizedSummary.forcedLiquidationApplied, true);
});

test("ending training serializes forced close against stale-session cleanup", async () => {
  await resetAllTraining("CUR_CLOSE");
  const sessionSettings = buildSessionTradingSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    minTradeStep: 1,
    allowLongMarginTrading: true,
    allowShortSelling: false,
    longInitialMarginRatio: 50,
    longMaintenanceMarginRatio: 25,
    longFinancingAnnualRate: 36.5,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  });
  const session = await createOrGetSession(symbol, "1d", true, 10, {
    sessionTradingSettings: sessionSettings,
  });

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "RATIO",
    ratioInput: 100,
    priceMode: "CUR_CLOSE",
  });
  db.prepare(
    `UPDATE replay_sessions
        SET cursor_index = cursor_index + 3
      WHERE id = ?`,
  ).run(session.id);

  const [resetResult] = await Promise.all([
    resetAllTraining("CUR_CLOSE"),
    cleanupStaleSessions(),
  ]);

  assert.equal(resetResult.clearedSessions, 1);
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(session.id) ?? 0,
    ),
    0,
  );
});

test("stale-session cleanup leaves simulation-only sessions outside the user training scope", async () => {
  await resetAllTraining("CUR_CLOSE");
  const officialKeep = await createOrGetSession(symbol, "1d", true, 10);
  const officialStale = await createOrGetSession(symbol, "1d", true, 11);
  const simulationOnly = await createOrGetSession(symbol, "1d", true, 12, {
    sessionScope: "SIMULATION_ONLY",
  });

  const result = await cleanupStaleSessions(officialKeep.id);

  assert.equal(result.keptSessionId, officialKeep.id);
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(officialKeep.id) ?? 0,
    ),
    1,
  );
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(officialStale.id) ?? 0,
    ),
    0,
  );
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(simulationOnly.id) ?? 0,
    ),
    1,
  );

  const cleanupAllOfficial = await cleanupStaleSessions();
  assert.equal(cleanupAllOfficial.clearedSessions, 1);
  assert.equal(
    Number(
      db
        .prepare("SELECT COUNT(*) FROM replay_sessions WHERE id = ?")
        .pluck()
        .get(simulationOnly.id) ?? 0,
    ),
    1,
  );
  assert.equal(await getLatestResumableSession(), null);

  const officialAfterSimulation = await createOrGetSession(symbol, "1d", false);
  assert.notEqual(officialAfterSimulation.id, simulationOnly.id);
  assert.equal(officialAfterSimulation.session_scope, "OFFICIAL");

  await cleanupStaleSessions();
  db.prepare("DELETE FROM replay_sessions WHERE id = ?").run(simulationOnly.id);
});

test("ending-training preview force-close costs match the live fee model", async () => {
  await resetAllTraining("CUR_CLOSE");
  const sessionSettings = buildSessionTradingSettings("US_STOCK", {
    ...zeroTradingCostOverrides,
    initialSecuritiesBalance: 5_000_000,
    minTradeStep: 1,
    allowLongMarginTrading: false,
    allowShortSelling: false,
    regulatoryFeeRate: 0.00206,
    transactionLevyRate: 0.000195,
    transactionLevyMinimumFee: 0.01,
    tradeSettlementMode: "T0",
    tradeAmountIncludesFees: false,
  });
  const session = await createOrGetSession(symbol, "1d", true, 10, {
    sessionTradingSettings: sessionSettings,
  });

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
    sessionSettings,
    100,
  );
  const openSummary = await previewTrainingSummary(symbol, "1d");
  const finalizedSummary = await previewTrainingSummary(symbol, "1d", "CUR_CLOSE");

  assertCloseTo(openSummary.tradingCost, 0);
  assert.equal(finalizedSummary.forcedLiquidationApplied, true);
  assertCloseTo(finalizedSummary.tradingCost, expectedCloseBreakdown.tradingCost);
});
