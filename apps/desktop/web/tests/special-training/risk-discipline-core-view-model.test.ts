// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeState } from "../../src/workspaces/special-training/domain/specialTrainingTypes";
import type { RiskGravityFieldModel } from "../../src/workspaces/special-training/view-models/useSpecialTrainingRiskDisciplineCoreViewModel";
import { useSpecialTrainingRiskDisciplineDisplayViewModel } from "../../src/workspaces/special-training/view-models/useSpecialTrainingRiskDisciplineDisplayViewModel";

type RiskDisplayInput = Parameters<
  typeof useSpecialTrainingRiskDisciplineDisplayViewModel
>[0];

const displayContent = {
  riskDisciplineGravityCurrentPriceLabel: "当前价格",
  riskDisciplineGravitySurfaceLabel: "回本线",
  riskDisciplineFloatingLossLabel: "当前总浮亏",
  riskDisciplineFloatingProfitLabel: "当前总浮盈",
  statusFloatingLabel: "当前浮动",
  riskDisciplineBreakevenNeedRiseTemplate: "需上涨 {0}",
  riskDisciplineBreakevenRecoveredLabel: "已回到回本线之上",
  riskDisciplineBreakevenFlatLabel: "空仓观察中",
  riskDisciplineRealityCheckVsHoldLabel: "相对持有结果",
  riskDisciplineRealityCheckVsHardStopLabel: "相对立即止损结果",
  riskDisciplineOriginalAssetLabel: "原始资产",
  riskDisciplineAvailableCashLabel: "可用现金",
  riskDisciplineCurrentPositionLabel: "当前持仓",
  riskDisciplinePositionPressureLabel: "仓位比例",
};

const baseRuntime: RuntimeState = {
  usedOperations: 0,
  openCount: 1,
  positionQty: 100,
  entryPrice: 6.02,
  cashBalance: 0,
  sizeInput: "25",
  stopLossInput: "",
  paused: false,
  equityPeakAsset: 602,
  maxDrawdownRatio: 0,
  initialCapital: 602,
  challengeStartAsset: 593,
};

const riskActionState = {
  allowed: true,
  blockedReasonCode: null,
  blockedReason: null,
};

const riskUndoActionState = {
  ...riskActionState,
  availableSteps: 0,
  maxSteps: 5,
  lastUndoableAction: null,
};

const buildGravityFieldModel = ({
  breakevenPrice,
  currentPrice,
}: {
  breakevenPrice: number | null;
  currentPrice: number | null;
}): RiskGravityFieldModel | null => {
  const currentPriceValue =
    typeof currentPrice === "number" ? currentPrice : Number.NaN;
  const referencePrice =
    Number.isFinite(currentPriceValue) && currentPriceValue > 0
      ? currentPriceValue
      : null;
  const values = [breakevenPrice, referencePrice].filter(
    (value): value is number => value !== null,
  );
  if (!values.length) {
    return null;
  }
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(
    (maxValue - minValue) * 0.34,
    maxValue * 0.05,
    0.01,
  );
  const domainMin = minValue - padding;
  const domainMax = maxValue + padding;
  const domainSpan = Math.max(0.0001, domainMax - domainMin);
  const toPosition = (value: number | null): number | null =>
    value === null
      ? null
      : Math.min(100, Math.max(0, ((value - domainMin) / domainSpan) * 100));
  const breakevenMoveRatio =
    breakevenPrice !== null && referencePrice !== null && referencePrice > 0
      ? Math.max(0, (breakevenPrice - referencePrice) / referencePrice)
      : null;
  const underwater =
    breakevenPrice !== null &&
    referencePrice !== null &&
    referencePrice < breakevenPrice - 1e-9;
  const breakevenPosition = toPosition(breakevenPrice);
  const currentPosition = toPosition(referencePrice);
  const gapStart =
    breakevenPosition === null || currentPosition === null
      ? null
      : Math.min(breakevenPosition, currentPosition);
  const gapWidth =
    breakevenPosition === null || currentPosition === null
      ? 0
      : Math.abs(breakevenPosition - currentPosition);

  return {
    breakevenPrice,
    referencePrice,
    breakevenMoveRatio,
    underwater,
    gapStart,
    gapWidth,
    markers: [
      {
        id: "surface",
        label: "回本线",
        value: breakevenPrice,
        position: breakevenPosition,
        tone: "surface",
      },
      {
        id: "current",
        label: "当前价格",
        value: referencePrice,
        position: currentPosition,
        tone: underwater ? "danger" : "positive",
      },
    ],
  };
};

const buildBreakevenPrice = ({
  isRiskDisciplineMode,
  runtime,
}: {
  isRiskDisciplineMode: boolean;
  runtime: Pick<RuntimeState, "cashBalance" | "initialCapital" | "positionQty">;
}): number | null => {
  if (!isRiskDisciplineMode || runtime.positionQty <= 0) {
    return null;
  }
  const breakevenPrice =
    (runtime.initialCapital - runtime.cashBalance) / runtime.positionQty;
  return Number.isFinite(breakevenPrice) && breakevenPrice > 0
    ? breakevenPrice
    : null;
};

const assertApprox = (actual: number | null, expected: number): void => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-12);
};

const buildDisplayViewModel = ({
  runtime,
  riskGravityFieldModel,
  currentPrice,
  currentTotalAsset,
  floatingPnl = 0,
}: {
  runtime: RuntimeState;
  riskGravityFieldModel: RiskGravityFieldModel | null;
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl?: number | null;
}) =>
  useSpecialTrainingRiskDisciplineDisplayViewModel({
    language: "zh-CN",
    content: displayContent as RiskDisplayInput["content"],
    ui: { currentClose: "当前收盘" } as RiskDisplayInput["ui"],
    tt: (key) => {
      if (key === "appText.lots2") {
        return "手";
      }
      if (key === "appText.shares") {
        return "股";
      }
      if (key === "appText.message0694" || key === "appText.message0695") {
        return "";
      }
      return key;
    },
    textSlash: "/",
    textDoubleDash: "--",
    currentQuestionIndex: 0,
    questionCount: 1,
    runtime,
    currentPrice,
    currentTotalAsset,
    floatingPnl,
    riskRemainingActionableRatio: 1,
    riskRemainingActionableBars: 10,
    riskHolderReference: null,
    riskGravityFieldModel,
    riskBuyEstimate: { qty: null, cashEffect: null },
    riskSellEstimate: { qty: null, cashEffect: null },
    buyAndAdvanceDisabled: false,
    sellAndAdvanceDisabled: false,
    nextBarDisabled: false,
    canUndoRiskAction: false,
    riskBuyAdvanceActionState: riskActionState,
    riskSellAdvanceActionState: riskActionState,
    riskNextBarActionState: riskActionState,
    riskUndoActionState,
  });

test("risk gravity uses account breakeven and preserves the initial cost case", () => {
  const breakevenPrice = buildBreakevenPrice({
    isRiskDisciplineMode: true,
    runtime: baseRuntime,
  });
  const model = buildGravityFieldModel({
    breakevenPrice,
    currentPrice: 5.93,
  });

  assert.equal(breakevenPrice, 6.02);
  assert.equal(model?.breakevenPrice, 6.02);
  assertApprox(model?.breakevenMoveRatio ?? null, (6.02 - 5.93) / 5.93);
  assert.equal(
    Number(((model?.breakevenMoveRatio ?? 0) * 100).toFixed(1)),
    1.5,
  );
});

test("risk gravity raises breakeven after a partial realized loss", () => {
  const runtime: RuntimeState = {
    ...baseRuntime,
    positionQty: 50,
    entryPrice: 10,
    cashBalance: 400,
    initialCapital: 1000,
    challengeStartAsset: 800,
  };
  const breakevenPrice = buildBreakevenPrice({
    isRiskDisciplineMode: true,
    runtime,
  });
  const model = buildGravityFieldModel({
    breakevenPrice,
    currentPrice: 8,
  });

  assert.equal(runtime.entryPrice, 10);
  assert.equal(breakevenPrice, 12);
  assert.equal(model?.breakevenPrice, 12);
  assert.equal(model?.underwater, true);
});

test("risk gravity treats cash-covered positions as already recovered", () => {
  const runtime: RuntimeState = {
    ...baseRuntime,
    positionQty: 50,
    entryPrice: 10,
    cashBalance: 1200,
    initialCapital: 1000,
    challengeStartAsset: 1600,
  };
  const breakevenPrice = buildBreakevenPrice({
    isRiskDisciplineMode: true,
    runtime,
  });
  const model = buildGravityFieldModel({
    breakevenPrice,
    currentPrice: 8,
  });
  const display = buildDisplayViewModel({
    runtime,
    riskGravityFieldModel: model,
    currentPrice: 8,
    currentTotalAsset: 1600,
  });

  assert.equal(breakevenPrice, null);
  assert.equal(model?.breakevenPrice, null);
  assert.equal(model?.underwater, false);
  assert.equal(display.riskGravityBreakevenPriceDisplay, "--");
  assert.equal(display.riskBreakevenDistanceDisplay, "已回到回本线之上");
});

test("risk breakeven display stays flat for an empty position", () => {
  const runtime: RuntimeState = {
    ...baseRuntime,
    positionQty: 0,
    entryPrice: Number.NaN,
    cashBalance: 1000,
    initialCapital: 1000,
    challengeStartAsset: 1000,
  };
  const breakevenPrice = buildBreakevenPrice({
    isRiskDisciplineMode: true,
    runtime,
  });
  const display = buildDisplayViewModel({
    runtime,
    riskGravityFieldModel: null,
    currentPrice: 8,
    currentTotalAsset: 1000,
  });

  assert.equal(breakevenPrice, null);
  assert.equal(display.riskBreakevenDistanceDisplay, "空仓观察中");
});

test("risk runtime asset and floating pnl display require backend-owned values", () => {
  const display = buildDisplayViewModel({
    runtime: baseRuntime,
    riskGravityFieldModel: null,
    currentPrice: 5.93,
    currentTotalAsset: null,
    floatingPnl: null,
  });

  assert.equal(display.riskCurrentAssetDisplay, "--");
  assert.equal(display.riskFloatingValueDisplay, "--");
  assert.equal(display.riskFloatingLabel, "当前浮动");
  assert.equal(display.riskSurvivalCardTone, "flat");
  assert.equal(
    display.riskHudMetricCards.find((card) => card.id === "hard-stop")?.value,
    "--",
  );
});

test("risk runtime price display requires backend-owned current price", () => {
  const breakevenPrice = buildBreakevenPrice({
    isRiskDisciplineMode: true,
    runtime: baseRuntime,
  });
  const model = buildGravityFieldModel({
    breakevenPrice,
    currentPrice: null,
  });
  const display = buildDisplayViewModel({
    runtime: baseRuntime,
    riskGravityFieldModel: model,
    currentPrice: null,
    currentTotalAsset: 593,
  });

  assert.equal(model?.referencePrice, null);
  assert.equal(model?.breakevenPrice, 6.02);
  assert.equal(display.riskReferencePriceDisplay, "--");
  assert.equal(display.riskGravityCurrentPriceDisplay, "--");
  assert.equal(display.riskGravityBreakevenPriceDisplay, "6.02");
});
