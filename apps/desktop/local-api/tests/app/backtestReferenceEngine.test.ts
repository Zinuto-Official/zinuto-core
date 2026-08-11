// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
} from "@zinuto/shared/trading";
import { runBacktestReferenceEngine } from "../../src/application/backtest/referenceEngine.js";
import { deriveBacktestSignals } from "../../src/application/backtest/signalSemantics.js";
import type { BacktestConfig } from "../../src/application/backtest/types.js";
import type { OhlcvBar } from "../../src/domain/models.js";
import type { TradingSettings } from "../../src/domain/trading/types.js";

const assertCloseTo = (actual: number, expected: number, epsilon = 1e-8) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

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

const baseConfig = (): BacktestConfig => ({
  strategySource: "BUY:1;",
  initialCapital: 1000,
  priceMode: "NEXT_OPEN",
  signalExecutionMode: "NEXT_OPEN",
  orderSizing: {
    mode: "FIXED_QTY",
    value: 10,
  },
  tradingSettings: zeroFeeAshareSettings(),
});

const bars: OhlcvBar[] = [
  { ts: "2026-01-01T09:30:00.000Z", open: 10, high: 11, low: 9, close: 10, volume: 1000 },
  { ts: "2026-01-02T09:30:00.000Z", open: 11, high: 13, low: 10, close: 12, volume: 1000 },
  { ts: "2026-01-03T09:30:00.000Z", open: 13, high: 15, low: 12, close: 14, volume: 1000 },
  { ts: "2026-01-04T09:30:00.000Z", open: 15, high: 17, low: 14, close: 16, volume: 1000 },
];

test("backtest signals keep exit priority and suppress conflicting entries", () => {
  const { signals, conflicts } = deriveBacktestSignals(
    {
      BUY: [1, 0, 1],
      SELL: [1, 0, 0],
      SHORT: [0, 1, 1],
      COVER: [0, 1, 0],
    },
    3,
  );

  assert.deepEqual(signals, [
    { barIndex: 0, buy: false, sell: true, short: false, cover: false },
    { barIndex: 1, buy: false, sell: false, short: false, cover: true },
    { barIndex: 2, buy: false, sell: false, short: false, cover: false },
  ]);
  assert.deepEqual(conflicts, [
    { barIndex: 0, code: "LONG_EXIT_PRIORITY" },
    { barIndex: 1, code: "SHORT_EXIT_PRIORITY" },
    { barIndex: 2, code: "ENTRY_SIDE_CONFLICT" },
  ]);
});

test("reference engine fills NEXT_OPEN signals and records deterministic equity", () => {
  const result = runBacktestReferenceEngine({
    config: baseConfig(),
    instrument: {
      instrumentId: "instrument-1",
      symbol: "AAA",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "NEXT_OPEN",
    signals: [
      { barIndex: 0, buy: true, sell: false, short: false, cover: false },
      { barIndex: 2, buy: false, sell: true, short: false, cover: false },
    ],
  });

  assert.equal(result.fills.length, 2);
  assert.equal(result.fills[0].side, "BUY");
  assert.equal(result.fills[0].fillTime, bars[1].ts);
  assertCloseTo(result.fills[0].price, 11);
  assertCloseTo(result.fills[0].qty, 10);
  assert.equal(result.fills[1].side, "SELL");
  assert.equal(result.fills[1].fillTime, bars[3].ts);
  assertCloseTo(result.fills[1].price, 15);
  assertCloseTo(result.result.finalEquity, 1040);
  assertCloseTo(result.result.totalPnl, 40);
  assertCloseTo(result.result.profitRate, 0.04);
  assertCloseTo(result.result.maxDrawdown, 0);
  assert.equal(result.result.tradeCount, 2);
  assert.equal(result.result.conflictCount, 0);
  assert.deepEqual(result.result.summary, {
    realizedPnl: 40,
    closedTrades: 1,
    winningTrades: 1,
    endingPositionQty: 0,
    endingAvgCost: 0,
  });
  assert.deepEqual(
    result.equityCurve.map((point) => point.equity),
    [1000, 1010, 1030, 1040],
  );
});

test("reference engine reverses a long position with one SHORT fill", () => {
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
      },
    },
    instrument: {
      instrumentId: "instrument-1",
      symbol: "AAA",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "NEXT_OPEN",
    signals: [
      { barIndex: 0, buy: true, sell: false, short: false, cover: false },
      { barIndex: 1, buy: false, sell: false, short: true, cover: false },
    ],
  });

  assert.equal(result.fills.length, 2);
  assert.equal(result.fills[0].side, "BUY");
  assert.equal(result.fills[1].side, "SELL");
  assert.equal(result.fills[1].fillIndex, 2);
  assert.equal(result.fills[1].fillTime, bars[2].ts);
  assertCloseTo(result.fills[1].price, 13);
  assertCloseTo(result.fills[1].qty, 20);
  assert.deepEqual(result.result.summary, {
    realizedPnl: 20,
    closedTrades: 1,
    winningTrades: 1,
    endingPositionQty: -10,
    endingAvgCost: 13,
  });
});

test("reference engine reverses a short position with one BUY fill", () => {
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
      },
    },
    instrument: {
      instrumentId: "instrument-1",
      symbol: "AAA",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "NEXT_OPEN",
    signals: [
      { barIndex: 0, buy: false, sell: false, short: true, cover: false },
      { barIndex: 1, buy: true, sell: false, short: false, cover: false },
    ],
  });

  assert.equal(result.fills.length, 2);
  assert.equal(result.fills[0].side, "SELL");
  assert.equal(result.fills[1].side, "BUY");
  assert.equal(result.fills[1].fillIndex, 2);
  assert.equal(result.fills[1].fillTime, bars[2].ts);
  assertCloseTo(result.fills[1].price, 13);
  assertCloseTo(result.fills[1].qty, 20);
  assert.deepEqual(result.result.summary, {
    realizedPnl: -20,
    closedTrades: 1,
    winningTrades: 0,
    endingPositionQty: 10,
    endingAvgCost: 13,
  });
});

test("reference engine realizes entry, exit, and reversal costs exactly once", () => {
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
        commissionMinimumFee: 5,
      },
    },
    instrument: {
      instrumentId: "instrument-1",
      symbol: "AAA",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "NEXT_OPEN",
    signals: [
      { barIndex: 0, buy: true, sell: false, short: false, cover: false },
      { barIndex: 1, buy: false, sell: false, short: true, cover: false },
      { barIndex: 2, buy: true, sell: false, short: false, cover: false },
    ],
  });

  assert.deepEqual(
    result.fills.map((fill) => [fill.side, fill.qty, fill.fee]),
    [
      ["BUY", 10, 5],
      ["SELL", 20, 5],
      ["BUY", 20, 5],
    ],
  );
  assert.deepEqual(result.result.summary, {
    realizedPnl: -12.5,
    closedTrades: 2,
    winningTrades: 1,
    endingPositionQty: 10,
    endingAvgCost: 15,
  });
});

test("reference engine reports zero bars for an empty input window", () => {
  const result = runBacktestReferenceEngine({
    config: baseConfig(),
    instrument: {
      instrumentId: "instrument-empty",
      symbol: "EMPTY",
      baseTimeframe: "1d",
      name: null,
      barCount: 0,
    },
    bars: [],
    priceMode: "NEXT_OPEN",
    signals: [],
  });

  assert.equal(result.result.barsCount, 0);
  assert.equal(result.equityCurve.length, 0);
  assert.equal(result.result.finalEquity, 1000);
});

test("reference engine does not fill NEXT_OPEN signals outside the configured range", () => {
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      endIndex: 1,
    },
    instrument: {
      instrumentId: "instrument-1",
      symbol: "AAA",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "NEXT_OPEN",
    signals: [
      { barIndex: 1, buy: true, sell: false, short: false, cover: false },
    ],
  });

  assert.equal(result.fills.length, 0);
  assert.equal(result.result.conflictCount, 1);
  assert.deepEqual(result.conflicts, [
    { barIndex: 1, code: "FILL_BAR_UNAVAILABLE" },
  ]);
  assert.deepEqual(
    result.equityCurve.map((point) => point.equity),
    [1000, 1000],
  );
});

test("SELL and COVER are close-only signals when the matching position is absent", () => {
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      priceMode: "CUR_CLOSE",
      signalExecutionMode: "CUR_CLOSE",
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
      },
    },
    instrument: {
      instrumentId: "instrument-close-only",
      symbol: "CLOSE",
      baseTimeframe: "1d",
      name: null,
      barCount: bars.length,
    },
    bars,
    priceMode: "CUR_CLOSE",
    signals: [
      { barIndex: 0, buy: false, sell: true, short: false, cover: false },
      { barIndex: 1, buy: false, sell: false, short: false, cover: true },
    ],
  });

  assert.deepEqual(result.fills, []);
  assert.deepEqual(result.conflicts, [
    { barIndex: 0, code: "NO_POSITION" },
    { barIndex: 1, code: "NO_POSITION" },
  ]);
});

test("cash-only BUY rejects unaffordable fixed quantity and fee-caps derived sizing", () => {
  const expensiveBars: OhlcvBar[] = [
    { ts: bars[0].ts, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
  ];
  const sizingModes: BacktestConfig["orderSizing"][] = [
    { mode: "FIXED_QTY", value: 10 },
    { mode: "FIXED_AMOUNT", value: 1000 },
    { mode: "ALL_IN" },
  ];

  for (const orderSizing of sizingModes) {
    const result = runBacktestReferenceEngine({
      config: {
        ...baseConfig(),
        priceMode: "CUR_CLOSE",
        signalExecutionMode: "CUR_CLOSE",
        orderSizing,
        tradingSettings: {
          ...zeroFeeAshareSettings(),
          commissionMinimumFee: 5,
          tradeAmountIncludesFees: false,
        },
      },
      instrument: {
        instrumentId: `instrument-${orderSizing.mode}`,
        symbol: orderSizing.mode,
        baseTimeframe: "1d",
        name: null,
        barCount: expensiveBars.length,
      },
      bars: expensiveBars,
      priceMode: "CUR_CLOSE",
      signals: [
        { barIndex: 0, buy: true, sell: false, short: false, cover: false },
      ],
    });

    if (orderSizing.mode === "FIXED_QTY") {
      assert.deepEqual(result.fills, []);
      assert.deepEqual(result.conflicts, [
        { barIndex: 0, code: "INSUFFICIENT_CASH" },
      ]);
      continue;
    }

    assert.equal(result.fills.length, 1, orderSizing.mode);
    assertCloseTo(result.fills[0].qty, 9);
    assertCloseTo(result.fills[0].fee, 5);
    const endingCash = result.result.finalEquity
      - result.result.summary.endingPositionQty * expensiveBars[0].close;
    assert.ok(endingCash >= -1e-8, `${orderSizing.mode} cash=${endingCash}`);
    assertCloseTo(endingCash, 95);
  }
});

test("BUY reversal sizes the new long from post-cover cash and always closes the short", () => {
  const reversalBars: OhlcvBar[] = [
    { ts: bars[0].ts, open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    { ts: bars[1].ts, open: 20, high: 20, low: 20, close: 20, volume: 1000 },
  ];
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      priceMode: "CUR_CLOSE",
      signalExecutionMode: "CUR_CLOSE",
      orderSizing: { mode: "ALL_IN" },
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
      },
    },
    instrument: {
      instrumentId: "instrument-short-reversal",
      symbol: "SHORT-REV",
      baseTimeframe: "1d",
      name: null,
      barCount: reversalBars.length,
    },
    bars: reversalBars,
    priceMode: "CUR_CLOSE",
    signals: [
      { barIndex: 0, buy: false, sell: false, short: true, cover: false },
      { barIndex: 1, buy: true, sell: false, short: false, cover: false },
    ],
  });

  assert.deepEqual(
    result.fills.map((fill) => [fill.side, fill.qty]),
    [["SELL", 100], ["BUY", 100]],
  );
  assertCloseTo(result.result.summary.endingPositionQty, 0);
  assertCloseTo(result.result.finalEquity, 0);
});

test("COVER and BUY reversal fully close an insolvent short instead of leaving exposure", () => {
  const insolventBars: OhlcvBar[] = [
    { ts: bars[0].ts, open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    { ts: bars[1].ts, open: 30, high: 30, low: 30, close: 30, volume: 1000 },
  ];
  for (const rawSignal of ["COVER", "BUY"] as const) {
    const result = runBacktestReferenceEngine({
      config: {
        ...baseConfig(),
        priceMode: "CUR_CLOSE",
        signalExecutionMode: "CUR_CLOSE",
        orderSizing: { mode: "FIXED_QTY", value: 100 },
        tradingSettings: {
          ...zeroFeeAshareSettings(),
          allowShortSelling: true,
        },
      },
      instrument: {
        instrumentId: `instrument-insolvent-${rawSignal}`,
        symbol: rawSignal,
        baseTimeframe: "1d",
        name: null,
        barCount: insolventBars.length,
      },
      bars: insolventBars,
      priceMode: "CUR_CLOSE",
      signals: [
        { barIndex: 0, buy: false, sell: false, short: true, cover: false },
        {
          barIndex: 1,
          buy: rawSignal === "BUY",
          sell: false,
          short: false,
          cover: rawSignal === "COVER",
        },
      ],
    });

    assertCloseTo(result.fills[1].qty, 100);
    assertCloseTo(result.result.summary.endingPositionQty, 0);
    assertCloseTo(result.result.finalEquity, -1000);
  }
});

test("SHORT reversal sizes the new short from post-close equity", () => {
  const flatBars: OhlcvBar[] = [
    { ts: bars[0].ts, open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    { ts: bars[1].ts, open: 10, high: 10, low: 10, close: 10, volume: 1000 },
  ];
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      priceMode: "CUR_CLOSE",
      signalExecutionMode: "CUR_CLOSE",
      orderSizing: { mode: "ALL_IN" },
      tradingSettings: {
        ...zeroFeeAshareSettings(),
        allowShortSelling: true,
        commissionRate: 10,
      },
    },
    instrument: {
      instrumentId: "instrument-long-reversal",
      symbol: "LONG-REV",
      baseTimeframe: "1d",
      name: null,
      barCount: flatBars.length,
    },
    bars: flatBars,
    priceMode: "CUR_CLOSE",
    signals: [
      { barIndex: 0, buy: true, sell: false, short: false, cover: false },
      { barIndex: 1, buy: false, sell: false, short: true, cover: false },
    ],
  });

  assert.deepEqual(
    result.fills.map((fill) => [fill.side, fill.qty]),
    [["BUY", 90], ["SELL", 172]],
  );
  assertCloseTo(result.result.summary.endingPositionQty, -82);
});

test("mark-to-market totals include an ending open position while trade stats exclude it", () => {
  const openBars: OhlcvBar[] = [
    { ts: bars[0].ts, open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    { ts: bars[1].ts, open: 15, high: 15, low: 15, close: 15, volume: 1000 },
  ];
  const result = runBacktestReferenceEngine({
    config: {
      ...baseConfig(),
      priceMode: "CUR_CLOSE",
      signalExecutionMode: "CUR_CLOSE",
    },
    instrument: {
      instrumentId: "instrument-open-position",
      symbol: "OPEN",
      baseTimeframe: "1d",
      name: null,
      barCount: openBars.length,
    },
    bars: openBars,
    priceMode: "CUR_CLOSE",
    signals: [
      { barIndex: 0, buy: true, sell: false, short: false, cover: false },
    ],
  });

  assertCloseTo(result.result.finalEquity, 1050);
  assertCloseTo(result.result.totalPnl, 50);
  assertCloseTo(result.result.summary.realizedPnl, 0);
  assert.equal(result.result.summary.closedTrades, 0);
  assert.equal(result.result.summary.winningTrades, 0);
  assertCloseTo(result.result.summary.endingPositionQty, 10);
});
