// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { ApiSpecialTrainingOrderQuote } from "../../src/api";
import {
  makeSpecialTrainingRiskInputQueue,
  SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX,
  type SpecialTrainingRiskCommandIntent,
} from "../../src/workspaces/special-training/session/riskDisciplineCommandQueue";
import {
  buildCompletedStableRiskOrderTicketDisplayState,
  buildLoadingStableRiskOrderTicketDisplayState,
  buildRuntimeStableRiskOrderTicketDisplayState,
  resolveVisibleStableRiskOrderTicketDisplayState,
  type StableRiskOrderTicketDisplayState,
} from "../../src/workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const createOrderQuote = (
  side: "BUY" | "SELL",
  overrides: Partial<ApiSpecialTrainingOrderQuote> = {},
): ApiSpecialTrainingOrderQuote => ({
  side,
  priceMode: "CUR_CLOSE",
  nextOpenDelayBars: 1,
  nextOpenAvailable: true,
  blockedReasonCode: null,
  blockedReason: null,
  estimate: {
    side,
    price: 50.59,
    qty: side === "SELL" ? 2001 : 100,
    lots: side === "SELL" ? 20 : 1,
    amount: side === "SELL" ? 101217.4 : 5059,
    tradingCost: 0,
    cashEffect: side === "SELL" ? 101217.4 : -5059,
    executionBreakdown: {
      closeQty: 0,
      openQty: side === "SELL" ? 2001 : 100,
      closeDirection: null,
      openDirection: side === "SELL" ? "SHORT" : "LONG",
    },
  },
  executionPlan: {
    displayPeriod: null,
    fillRawIndex: 1,
    fillPrice: 50.59,
    targetRawIndex: 1,
    nextOpenDisplayIndex: 2,
  },
  ...overrides,
});

test("risk discipline command queue serializes repeated commands without dropping pending input", async () => {
  const first = createDeferred();
  const second = createDeferred();
  const gates = [first, second];
  const executed: SpecialTrainingRiskCommandIntent["action"][] = [];
  const queue = makeSpecialTrainingRiskInputQueue({
    execute: async (intent) => {
      executed.push(intent.action);
      await gates.shift()?.promise;
      return { continueDraining: true };
    },
    onError: (error) => {
      throw error;
    },
  });

  const firstRun = queue.enqueue({ action: "NEXT_BAR" });
  const secondRun = queue.enqueue({
    action: "BUY_AND_ADVANCE",
    order: {
      inputMode: "RATIO",
      ratioInput: "25",
      priceMode: "CUR_CLOSE",
    },
  });
  await flushMicrotasks();

  assert.deepEqual(executed, ["NEXT_BAR"]);
  assert.equal(queue.isActive(), true);
  assert.equal(queue.size(), 1);

  first.resolve();
  await flushMicrotasks();
  assert.deepEqual(executed, ["NEXT_BAR", "BUY_AND_ADVANCE"]);

  second.resolve();
  await Promise.all([firstRun, secondRun]);
  assert.equal(queue.isActive(), false);
  assert.equal(queue.size(), 0);
});

test("risk discipline command queue clears queued commands after authoritative settlement", async () => {
  const executed: SpecialTrainingRiskCommandIntent["action"][] = [];
  const queue = makeSpecialTrainingRiskInputQueue({
    execute: async (intent) => {
      executed.push(intent.action);
      return { continueDraining: false };
    },
    onError: (error) => {
      throw error;
    },
  });

  await Promise.all([
    queue.enqueue({ action: "NEXT_BAR" }),
    queue.enqueue({ action: "NEXT_BAR" }),
    queue.enqueue({
      action: "SELL_AND_ADVANCE",
      order: {
        inputMode: "RATIO",
        ratioInput: "50",
        priceMode: "CUR_CLOSE",
      },
    }),
  ]);

  assert.deepEqual(executed, ["NEXT_BAR"]);
  assert.equal(queue.isActive(), false);
  assert.equal(queue.size(), 0);
});

test("stable risk order ticket display keeps the previous complete snapshot while the next quote is pending", () => {
  const previousState = buildCompletedStableRiskOrderTicketDisplayState({
    requestKey: "q1|cursor:10",
    questionId: "q1",
    buyQuote: createOrderQuote("BUY"),
    sellQuote: createOrderQuote("SELL"),
    currentPrice: 50.59,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
  });

  const visiblePendingState = resolveVisibleStableRiskOrderTicketDisplayState({
    state: previousState,
    lifecycleActive: true,
    questionId: "q1",
  });

  assert.equal(visiblePendingState, previousState);
  assert.equal(visiblePendingState?.sellButton.disabled, false);
  assert.equal(visiblePendingState?.sellButton.label, "卖出");
  assert.equal(visiblePendingState?.sellEstimate.disabled, false);
  assert.equal(visiblePendingState?.sellEstimate.qty, 2001);
  assert.equal(visiblePendingState?.referencePrice, 50.59);
  assert.equal(visiblePendingState?.nextOpenUnavailable, false);
});

test("stable risk order ticket display changes visual state only after a complete quote is committed", () => {
  const allowedState = buildCompletedStableRiskOrderTicketDisplayState({
    requestKey: "q1|cursor:10",
    questionId: "q1",
    buyQuote: createOrderQuote("BUY"),
    sellQuote: createOrderQuote("SELL"),
    currentPrice: 50.59,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
  });
  const blockedState = buildCompletedStableRiskOrderTicketDisplayState({
    requestKey: "q1|cursor:11",
    questionId: "q1",
    buyQuote: createOrderQuote("BUY"),
    sellQuote: createOrderQuote("SELL", {
      blockedReasonCode: "SELLING_DISABLED",
      blockedReason: "无持仓",
    }),
    currentPrice: 50.59,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
    sellQuoteBlockedReason: "无持仓",
  });

  assert.equal(allowedState.sellButton.disabled, false);
  assert.equal(allowedState.sellButton.label, "卖出");
  assert.equal(allowedState.sellEstimate.disabled, false);
  assert.equal(blockedState.sellButton.disabled, true);
  assert.equal(blockedState.sellButton.label, "无持仓");
  assert.equal(blockedState.sellEstimate.disabled, true);
});

test("stable risk order ticket display retains the last complete snapshot after quote failure", () => {
  let state: StableRiskOrderTicketDisplayState | null =
    buildCompletedStableRiskOrderTicketDisplayState({
      requestKey: "q1|cursor:10",
      questionId: "q1",
      buyQuote: createOrderQuote("BUY"),
      sellQuote: createOrderQuote("SELL"),
      currentPrice: 50.59,
      buyDefaultLabel: "买入",
      sellDefaultLabel: "卖出",
    });
  const previousState = state;

  // A failed request does not commit an empty ticket display state.
  state = previousState;
  const visibleState = resolveVisibleStableRiskOrderTicketDisplayState({
    state,
    lifecycleActive: true,
    questionId: "q1",
  });

  assert.equal(visibleState, previousState);
  assert.equal(visibleState?.sellEstimate.qty, 2001);
  assert.equal(visibleState?.sellEstimate.disabled, false);
  assert.equal(visibleState?.sellButton.disabled, false);
});

test("stable risk order ticket display uses runtime estimates before quotes complete", () => {
  const runtimeDisplay = buildRuntimeStableRiskOrderTicketDisplayState({
    requestKey: "runtime",
    questionId: "q1",
    currentPrice: 51,
    buyEstimate: { qty: 100, cashEffect: -5100 },
    sellEstimate: { qty: 2001, cashEffect: 102051 },
    buyBlockedReason: null,
    sellBlockedReason: null,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
    nextOpenUnavailable: false,
  });

  assert.notEqual(runtimeDisplay, null);
  assert.equal(runtimeDisplay?.referencePrice, 51);
  assert.equal(runtimeDisplay?.sellButton.disabled, false);
  assert.equal(runtimeDisplay?.sellEstimate.disabled, false);
  assert.equal(runtimeDisplay?.sellEstimate.qty, 2001);
  assert.equal(runtimeDisplay?.nextOpenUnavailable, false);
});

test("stable risk order ticket display does not synthesize missing current price", () => {
  const runtimeDisplay = buildRuntimeStableRiskOrderTicketDisplayState({
    requestKey: "runtime",
    questionId: "q1",
    currentPrice: null,
    buyEstimate: { qty: 100, cashEffect: -5100 },
    sellEstimate: { qty: 2001, cashEffect: 102051 },
    buyBlockedReason: null,
    sellBlockedReason: null,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
    nextOpenUnavailable: false,
  });

  assert.notEqual(runtimeDisplay, null);
  assert.equal(runtimeDisplay?.referencePrice, null);
  assert.equal(runtimeDisplay?.buyEstimate.price, null);
  assert.equal(runtimeDisplay?.sellEstimate.price, null);
});

test("stable risk order ticket loading display disables actions without inventing a reason", () => {
  const blockedState = buildLoadingStableRiskOrderTicketDisplayState({
    requestKey: "loading",
    questionId: "q1",
    currentPrice: 50.59,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
  });

  assert.equal(blockedState.buyButton.disabled, true);
  assert.equal(blockedState.sellButton.disabled, true);
  assert.equal(blockedState.buyButton.label, "买入");
  assert.equal(blockedState.sellButton.label, "卖出");
  assert.equal(blockedState.buyButton.reason, "");
  assert.equal(blockedState.sellButton.reason, "");
  assert.equal(blockedState.buyEstimate.disabled, true);
  assert.equal(blockedState.sellEstimate.disabled, true);
  assert.equal(blockedState.nextOpenUnavailable, true);
});

test("stable risk order ticket display clears when the training lifecycle is inactive", () => {
  const state = buildCompletedStableRiskOrderTicketDisplayState({
    requestKey: "q1|cursor:10",
    questionId: "q1",
    buyQuote: createOrderQuote("BUY"),
    sellQuote: createOrderQuote("SELL"),
    currentPrice: 50.59,
    buyDefaultLabel: "买入",
    sellDefaultLabel: "卖出",
  });

  assert.equal(
    resolveVisibleStableRiskOrderTicketDisplayState({
      state,
      lifecycleActive: false,
      questionId: "q1",
    }),
    null,
  );
  assert.equal(
    resolveVisibleStableRiskOrderTicketDisplayState({
      state,
      lifecycleActive: true,
      questionId: "q2",
    }),
    null,
  );
});

test("special training risk commands use the serial queue instead of an in-flight drop gate", () => {
  const pageSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/useSpecialTrainingRiskTradeInteractions.ts",
    ),
    "utf8",
  );
  const routeEffectsSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/session/useSpecialTrainingRouteEffects.ts",
    ),
    "utf8",
  );

  assert.match(pageSource, /makeSpecialTrainingRiskInputQueue/);
  assert.match(pageSource, /enqueueRiskCommand/);
  assert.doesNotMatch(pageSource, /riskCommandInFlightRef/);
  assert.doesNotMatch(pageSource, /runRiskCommand/);
  assert.match(routeEffectsSource, /await handleNextBar\(\)/);
  assert.doesNotMatch(
    routeEffectsSource,
    /isQuestionLoading \|\| settlement !== null \|\| nextBarDisabled/,
  );
  assert.match(routeEffectsSource, /if \(nextBarDisabled\) \{\s*return;\s*\}/);
  assert.match(routeEffectsSource, /await handleBuyAndAdvance\(\)/);
  assert.match(routeEffectsSource, /await handleSellAndAdvance\(\)/);
  assert.equal(SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX, 200);
});

test("special training risk order estimates stay backend-authored", () => {
  const pageSource = [
    "src/workspaces/special-training/useSpecialTrainingRiskTradeInteractions.ts",
    "src/workspaces/special-training/components/SpecialTrainingRiskOrderTicket.tsx",
  ]
    .map((relativePath) =>
      fs.readFileSync(path.join(frontendRoot, relativePath), "utf8"),
    )
    .join("\n");
  const helperSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/domain/specialTrainingHelpers.ts",
    ),
    "utf8",
  );
  const orderDisplaySource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState.ts",
    ),
    "utf8",
  );
  const runtimeStateSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/domain/specialTrainingRuntimeDraft.ts",
    ),
    "utf8",
  );
  const reviewReplaySource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/view-models/specialTrainingSessionReviewReplayProjectViewModel.ts",
    ),
    "utf8",
  );
  const combinedSource = [
    pageSource,
    helperSource,
    orderDisplaySource,
    runtimeStateSource,
    reviewReplaySource,
  ].join("\n");

  assert.match(pageSource, /getSpecialTrainingChallengeOrderQuote/);
  assert.match(pageSource, /riskOrderTicketDisplay\.buyEstimate\.qty/);
  assert.match(pageSource, /riskOrderTicketDisplay\.sellEstimate\.qty/);
  assert.match(orderDisplaySource, /quote:\s*buyQuote/);
  assert.match(orderDisplaySource, /quote:\s*sellQuote/);
  assert.match(orderDisplaySource, /quote\.estimate/);
  assert.match(pageSource, /resolveVisibleStableRiskOrderTicketDisplayState/);
  assert.match(pageSource, /buildCompletedStableRiskOrderTicketDisplayState/);
  assert.match(pageSource, /buildRuntimeStableRiskOrderTicketDisplayState/);
  assert.match(pageSource, /buildLoadingStableRiskOrderTicketDisplayState/);
  assert.doesNotMatch(pageSource, /applyStableRiskOrderTicketLifecycleBlockedReason/);
  assert.match(orderDisplaySource, /resolveStableRiskOrderSideButtonDisplay/);
  assert.match(pageSource, /riskOrderTicketDisplayCacheRef\.current\.get/);
  assert.match(pageSource, /riskOrderTicketDisplayCacheRef\.current\.set/);
  assert.match(pageSource, /hasApiErrorCode\(error,\s*"ORDER_BLOCKED"\)/);
  assert.match(pageSource, /hasApiErrorCode\(error,\s*"ORDER_BLOCKED"\)[\s\S]*?applyCommandChallengeRuntime\(refreshedRuntime\);[\s\S]*?setSubmitErrorMessage\(""\);[\s\S]*?return \{ continueDraining: false \};/);
  assert.doesNotMatch(pageSource, /setSubmitErrorMessage\(resolveOrderBlockedErrorMessage\(error\)\)/);
  assert.match(pageSource, /commandResult\.runtime\.tradeActions/);
  assert.doesNotMatch(pageSource, /fallbackTradeBarIndex/);
  assert.doesNotMatch(pageSource, /fallbackExecutionPrice/);
  assert.doesNotMatch(pageSource, /fallbackEstimate/);
  assert.doesNotMatch(
    pageSource,
    /serverCurrentPrice[\s\S]{0,220}currentBar\?\.close/,
  );
  assert.doesNotMatch(pageSource, /settlementTradeActions/);
  assert.doesNotMatch(pageSource, /mode === "NEXT_OPEN" && riskNextOpenUnavailable/);
  assert.match(pageSource, /const riskBuyEstimate = \{\s*qty: riskOrderTicketDisplay\.buyEstimate\.qty,/);
  assert.match(pageSource, /const riskSellEstimate = \{\s*qty: riskOrderTicketDisplay\.sellEstimate\.qty,/);
  assert.doesNotMatch(pageSource, /!visibleRiskOrderQuoteDisplayState/);
  assert.doesNotMatch(pageSource, /resolveVisibleStableRiskOrderQuoteDisplayState/);
  assert.doesNotMatch(pageSource, /buildCompletedStableRiskOrderQuoteDisplayState/);
  assert.doesNotMatch(pageSource, /buyAndAdvanceDisabled \|\| Boolean\(riskBuyQuoteReason\)/);
  assert.doesNotMatch(pageSource, /sellAndAdvanceDisabled \|\| Boolean\(riskSellQuoteReason\)/);
  assert.doesNotMatch(pageSource, /riskBuyAdvanceActionState\.blockedReason \|\| riskBuyQuoteReason/);
  assert.doesNotMatch(pageSource, /riskSellAdvanceActionState\.blockedReason \|\| riskSellQuoteReason/);
  assert.match(pageSource, /<TradingOrderTicket[\s\S]*?className="trainer-live-order-card"[\s\S]*?dataAutoshrinkIgnore/);
  assert.match(pageSource, /buyEstimate=\{\{[\s\S]*?disabled: riskOrderTicketDisplay\.buyEstimate\.disabled,/);
  assert.match(pageSource, /sellEstimate=\{\{[\s\S]*?disabled: riskOrderTicketDisplay\.sellEstimate\.disabled,/);
  assert.match(pageSource, /buyAction=\{\{[\s\S]*?buttonClassName: riskOrderTicketDisplay\.buyButton\.className,\s*disabled: riskOrderTicketDisplay\.buyButton\.disabled,[\s\S]*?label: riskOrderTicketDisplay\.buyButton\.label,/);
  assert.match(pageSource, /sellAction=\{\{[\s\S]*?buttonClassName: riskOrderTicketDisplay\.sellButton\.className,\s*disabled: riskOrderTicketDisplay\.sellButton\.disabled,[\s\S]*?label: riskOrderTicketDisplay\.sellButton\.label,/);
  assert.doesNotMatch(pageSource, /buyAction=\{\{[\s\S]*?reason:\s*riskBuyOrderActionReason/);
  assert.doesNotMatch(pageSource, /sellAction=\{\{[\s\S]*?reason:\s*riskSellOrderActionReason/);
  assert.doesNotMatch(pageSource, /nextAction=\{\{[\s\S]*?disabled:\s*nextBarDisabled/);
  assert.doesNotMatch(pageSource, /undoAction=\{\{[\s\S]*?disabled:\s*!canUndoRiskAction/);
  assert.doesNotMatch(pageSource, /challengeRuntime\?\.actionState\?\.undo\.allowed[\s\S]*?return \{ continueDraining: true \}/);
  assert.doesNotMatch(pageSource, /cursorIndex >= questionEndIndex[\s\S]*?return \{ continueDraining: false \}/);
  assert.doesNotMatch(combinedSource, /@zinuto\/shared\/specialTrainingRisk/);
  assert.doesNotMatch(combinedSource, /resolveSpecialTrainingRiskOrderEstimate/);
  assert.doesNotMatch(combinedSource, /executeSpecialTrainingRiskOrder/);
  assert.doesNotMatch(combinedSource, /buildRiskDisciplineRuntimeSeed/);
  assert.doesNotMatch(combinedSource, /resolveRiskBuyEstimate/);
  assert.doesNotMatch(combinedSource, /resolveRiskSellEstimate/);
});

test("special training start availability is a backend start request concern", () => {
  const pageSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/useSpecialTrainingChallengeRuntime.ts",
    ),
    "utf8",
  );
  const modePickerViewModelSource = fs.readFileSync(
    path.join(
      frontendRoot,
      "src/workspaces/special-training/view-models/useSpecialTrainingModePickerPageViewModel.ts",
    ),
    "utf8",
  );
  const beginTrainingStart = pageSource.indexOf("  const beginTraining = useCallback(async () => {");
  assert.notEqual(beginTrainingStart, -1);
  const beginTrainingEnd = pageSource.indexOf("  useEffect(() => {", beginTrainingStart);
  assert.notEqual(beginTrainingEnd, -1);
  const beginTrainingSource = pageSource.slice(beginTrainingStart, beginTrainingEnd);
  const unavailableStart = modePickerViewModelSource.indexOf(
    "  const startTrainingUnavailable =",
  );
  assert.notEqual(unavailableStart, -1);
  const unavailableEnd = modePickerViewModelSource.indexOf("  const {", unavailableStart);
  assert.notEqual(unavailableEnd, -1);
  const unavailableSource = modePickerViewModelSource.slice(
    unavailableStart,
    unavailableEnd,
  );

  assert.match(beginTrainingSource, /startSpecialTrainingChallenge/);
  assert.doesNotMatch(beginTrainingSource, /totalQuestionCount < activeQuestionCount/);
  assert.doesNotMatch(beginTrainingSource, /selectedBankMissingPoolIds\.length > 0/);
  assert.doesNotMatch(unavailableSource, /hasQuestionBankCapacityForRun/);
  assert.doesNotMatch(unavailableSource, /selectedBankMissingPoolIdsLength/);
});
