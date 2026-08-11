// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveOrderQuoteCache,
  getVisibleOrderQuoteCache,
  isTrainerOrderQuoteUnavailableForUi,
  readTrainerOrderQuoteAction,
  resolveOrderQuoteRefreshKey,
  resolveOrderQuoteSnapshotRefreshKey,
  resolveOrderQuoteTicketKey,
} from "../../src/app-shell/useOrderEstimationController";
import {
  toTrainerOrderButtonDisplay,
} from "../../src/domains/trainer/trainerOrderActionDisplay";

const tradingSettings = {
  minTradeStep: 1,
};

test("order quote refresh key follows step cursor and reference-price drift", () => {
  const beforeStepSnapshotKey = resolveOrderQuoteSnapshotRefreshKey({
    session: {
      id: "session-1",
      cursor_index: 10,
    },
    fillsTotal: 0,
    actionState: {
      referencePrice: 100,
    },
  });
  const afterStepSnapshotKey = resolveOrderQuoteSnapshotRefreshKey({
    session: {
      id: "session-1",
      cursor_index: 11,
    },
    fillsTotal: 0,
    actionState: {
      referencePrice: 101,
    },
  });

  assert.notEqual(afterStepSnapshotKey, beforeStepSnapshotKey);

  const beforeStepTicketKey = resolveOrderQuoteTicketKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "CUR_CLOSE",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    tradingSettings,
  });
  const afterStepTicketKey = resolveOrderQuoteTicketKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "CUR_CLOSE",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    tradingSettings,
  });

  assert.equal(afterStepTicketKey, beforeStepTicketKey);

  const beforeStepQuoteKey = resolveOrderQuoteRefreshKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "CUR_CLOSE",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    snapshotRefreshKey: beforeStepSnapshotKey,
    tradingSettings,
  });
  const afterStepQuoteKey = resolveOrderQuoteRefreshKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "CUR_CLOSE",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    snapshotRefreshKey: afterStepSnapshotKey,
    tradingSettings,
  });

  assert.notEqual(afterStepQuoteKey, beforeStepQuoteKey);
});

test("order quote refresh key changes after trade fills but not frontend NEXT_OPEN timing", () => {
  const noFillSnapshotKey = resolveOrderQuoteSnapshotRefreshKey({
    session: {
      id: "session-1",
      cursor_index: 10,
    },
    fillsTotal: 0,
  });
  const tradedSnapshotKey = resolveOrderQuoteSnapshotRefreshKey({
    session: {
      id: "session-1",
      cursor_index: 10,
    },
    fillsTotal: 1,
  });

  assert.notEqual(tradedSnapshotKey, noFillSnapshotKey);

  const firstNextOpenKey = resolveOrderQuoteRefreshKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "NEXT_OPEN",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    snapshotRefreshKey: noFillSnapshotKey,
    tradingSettings,
  });
  const secondNextOpenKey = resolveOrderQuoteRefreshKey({
    sessionId: "session-1",
    hasSnapshot: true,
    hasBars: true,
    isBusy: false,
    isPreparingAction: false,
    trainerDisplayPeriod: "1d",
    buyTradeInputMode: "LOT",
    buyLotInput: "1",
    buyAmountInput: "",
    buyRatioInput: "",
    buyPriceMode: "NEXT_OPEN",
    sellTradeInputMode: "LOT",
    sellLotInput: "1",
    sellAmountInput: "",
    sellRatioInput: "",
    sellPriceMode: "CUR_CLOSE",
    snapshotRefreshKey: noFillSnapshotKey,
    tradingSettings,
  });

  assert.equal(secondNextOpenKey, firstNextOpenKey);
});

test("order disabled state follows backend quote availability", () => {
  const quoteState = {
    requestKey: "quote-key-before-fill",
    ticketKey: "ticket-key-before-fill",
    buyQuote: null,
    sellQuote: null,
  };
  const backendQuoteAction = {
    enabled: true,
    reasonCode: null,
    facts: {
      side: "BUY",
      qty: 0,
    },
  };

  assert.equal(
    getActiveOrderQuoteCache(quoteState, "quote-key-after-fill"),
    null,
  );
  assert.equal(
    readTrainerOrderQuoteAction({
      quoteRequestKey: "quote-key-after-fill",
      quoteState,
      quote: backendQuoteAction,
    }),
    null,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(
      readTrainerOrderQuoteAction({
        quoteRequestKey: "quote-key-after-fill",
        quoteState,
        quote: backendQuoteAction,
      }),
    ),
    true,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(
      readTrainerOrderQuoteAction({
        quoteRequestKey: quoteState.requestKey,
        quoteState,
        quote: backendQuoteAction,
      }),
    ),
    false,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi({
      enabled: false,
      reasonCode: "BUYING_POWER_EMPTY",
      facts: {
        side: "BUY",
        qty: 100,
      },
    }),
    true,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(null),
    true,
  );
});

test("order quote display preserves the previous quote while a refreshed quote is pending", () => {
  const buyEstimate = {
    side: "BUY" as const,
    price: 93.11,
    qty: 30,
    lots: 30,
    amount: 2793.3,
    tradingCost: 0.28,
    cashEffect: -2793.58,
    executionBreakdown: {
      closeQty: 0,
      openQty: 30,
      closeDirection: null,
      openDirection: "LONG" as const,
    },
  };
  const quoteState = {
    requestKey: "quote-key-before-step",
    ticketKey: "ticket-key-same-order-input",
    buyQuote: {
      side: "BUY" as const,
      priceMode: "NEXT_OPEN" as const,
      priceSource: "NEXT_OPEN" as const,
      fillPriceField: "open" as const,
      nextOpenDelayBars: 1,
      nextOpenAvailable: true,
      blockedReasonCode: null,
      blockedReason: null,
      enabled: true,
      reasonCode: null,
      facts: {
        side: "BUY",
        inputMode: "LOT",
        priceMode: "NEXT_OPEN",
        qty: 30,
      },
      estimate: buyEstimate,
      tradeCapacity: {
        availableCash: 10_000,
        longBuyingPowerQty: 100,
        longBuyingPowerAmount: 10_000,
        longFinancingAmount: 0,
        shortOpenCapacityQty: 0,
        shortOpenCapacityAmount: 0,
        ratioBases: {
          buy: {
            kind: "LONG_BUYING_POWER" as const,
            quantity: 100,
            amount: 10_000,
          },
          sell: {
            kind: "SHORT_OPEN_CAPACITY" as const,
            quantity: 0,
            amount: 0,
          },
        },
      },
      projectedAfterFill: {
        cashBalance: 7206.42,
        accountBalance: 7206.42,
        positionQty: 30,
        avgCost: 93.11,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        equity: 9999.72,
        longFinancingAmount: 0,
        longFinancingAccrual: 0,
        shortBorrowAccrual: 0,
        tradingCostBreakdown: {
          commission: 0.28,
          transferFee: 0,
          regulatoryFee: 0,
          platformFee: 0,
          transactionLevy: 0,
          fees: 0.28,
          taxes: 0,
          slippage: 0,
          totalTradingCost: 0.28,
        },
        marginState: {
          equity: 9999.72,
          requiredInitialEquity: 2793.3,
          requiredMaintenanceEquity: 2793.3,
          availableInitialEquity: 7206.42,
          availableMaintenanceEquity: 7206.42,
          longNotional: 2793.3,
          shortNotional: 0,
        },
      },
    },
    sellQuote: null,
  };
  const visibleQuoteState = getVisibleOrderQuoteCache(
    quoteState,
    "quote-key-after-step",
    "ticket-key-same-order-input",
  );

  assert.equal(visibleQuoteState, quoteState);
  assert.equal(visibleQuoteState?.buyQuote?.estimate.amount, 2793.3);
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(
      readTrainerOrderQuoteAction({
        quoteRequestKey: "quote-key-after-step",
        quoteState: visibleQuoteState,
        quote: visibleQuoteState?.buyQuote,
      }),
    ),
    true,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(
      readTrainerOrderQuoteAction({
        quoteRequestKey: "quote-key-after-step",
        quoteState: visibleQuoteState,
        quote: visibleQuoteState?.buyQuote,
        requireActiveQuote: false,
      }),
    ),
    false,
  );
  assert.equal(
    isTrainerOrderQuoteUnavailableForUi(
      readTrainerOrderQuoteAction({
        quoteRequestKey: quoteState.requestKey,
        quoteState: visibleQuoteState,
        quote: visibleQuoteState?.buyQuote,
      }),
    ),
    false,
  );
  assert.equal(
    getVisibleOrderQuoteCache(
      quoteState,
      "quote-key-after-input-change",
      "ticket-key-after-input-change",
    ),
    null,
  );
  assert.equal(
    getVisibleOrderQuoteCache(
      quoteState,
      "quote-key-after-input-change",
      "ticket-key-after-input-change",
      { preservePreviousWhilePending: true },
    ),
    quoteState,
  );
});

test("trainer order availability keeps quote visuals stable while order actions are queued or in flight", () => {
  assert.deepEqual(
    toTrainerOrderButtonDisplay({
      buyOrderActionState: { enabled: true, reasonCode: null, facts: {} },
      sellOrderActionState: { enabled: true, reasonCode: null, facts: {} },
      hotActionState: {
        activeAction: null,
        isOrderInFlight: false,
        queuedOrderCount: 0,
      },
    }),
    {
      buyOrderDisabled: false,
      sellOrderDisabled: false,
      isOrderActionBusy: false,
    },
  );

  for (const hotActionState of [
    { activeAction: null, isOrderInFlight: false, queuedOrderCount: 1 },
    { activeAction: "BUY" as const, isOrderInFlight: false, queuedOrderCount: 0 },
    { activeAction: null, isOrderInFlight: true, queuedOrderCount: 0 },
  ]) {
    assert.deepEqual(
      toTrainerOrderButtonDisplay({
        buyOrderActionState: { enabled: true, reasonCode: null, facts: {} },
        sellOrderActionState: { enabled: true, reasonCode: null, facts: {} },
        hotActionState,
      }),
      {
        buyOrderDisabled: false,
        sellOrderDisabled: false,
        isOrderActionBusy: true,
      },
    );
  }

  assert.deepEqual(
    toTrainerOrderButtonDisplay({
      buyOrderActionState: {
        enabled: false,
        reasonCode: "BUYING_POWER_EMPTY",
        facts: {},
      },
      sellOrderActionState: { enabled: true, reasonCode: null, facts: {} },
      hotActionState: {
        activeAction: "BUY",
        isOrderInFlight: true,
        queuedOrderCount: 0,
      },
    }),
    {
      buyOrderDisabled: true,
      sellOrderDisabled: false,
      isOrderActionBusy: true,
    },
  );
});
