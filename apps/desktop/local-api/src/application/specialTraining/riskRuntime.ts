// SPDX-License-Identifier: GPL-3.0-only

import {
  buildRiskDisciplineRuntimeSeed,
  resolveRiskDisciplineDefaults,
} from '@zinuto/shared/domain-calculations/special-training-risk';
import { appError } from '../../kernel/appError.js';
import { DEFAULT_CAPITAL } from '../../domain/specialTraining/constants.js';
import type {
  SpecialTrainingGravityFieldFact,
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingRiskRuntimeBaseline,
  SpecialTrainingRiskRuntimeMetrics,
  SpecialTrainingTradeRuntimeState,
} from '../../domain/specialTraining/contracts.js';

const RISK_DEFAULTS = resolveRiskDisciplineDefaults();

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

export const calculateTotalAsset = (
  runtime: SpecialTrainingTradeRuntimeState,
  markPrice: number,
): number => {
  const positionValue =
    Number.isFinite(markPrice) && markPrice > 0
      ? runtime.positionQty * markPrice
      : Number.isFinite(runtime.entryPrice)
        ? runtime.positionQty * runtime.entryPrice
        : 0;
  return runtime.cashBalance + positionValue;
};

export const applyRuntimeRiskMetrics = (
  runtime: SpecialTrainingTradeRuntimeState,
  markPrice: number,
): SpecialTrainingTradeRuntimeState => {
  const equity = calculateTotalAsset(runtime, markPrice);
  if (!Number.isFinite(equity)) {
    return runtime;
  }
  const peak = Number.isFinite(runtime.equityPeakAsset)
    ? Math.max(runtime.equityPeakAsset, equity)
    : equity;
  const drawdownRatio = peak > 0 ? (peak - equity) / peak : 0;
  return {
    ...runtime,
    equityPeakAsset: peak,
    maxDrawdownRatio: Math.max(runtime.maxDrawdownRatio, drawdownRatio),
  };
};

export const createTradeRuntimeState = (
  modeId: SpecialTrainingModeId,
  question: SpecialTrainingQuestionState,
): SpecialTrainingTradeRuntimeState => {
  const startPrice = toFiniteNumber(question.bars[question.startIndex]?.close);
  if (!Number.isFinite(startPrice) || startPrice <= 0) {
    throw appError('SPECIAL_TRAINING_BAR_DATA_INVALID');
  }

  const base: SpecialTrainingTradeRuntimeState = {
    usedOperations: 0,
    openCount: 0,
    positionQty: 0,
    entryPrice: Number.NaN,
    cashBalance: DEFAULT_CAPITAL,
    equityPeakAsset: DEFAULT_CAPITAL,
    maxDrawdownRatio: 0,
    initialCapital: DEFAULT_CAPITAL,
    challengeStartAsset: DEFAULT_CAPITAL,
  };

  if (modeId === 'risk-discipline-training') {
    const seed = buildRiskDisciplineRuntimeSeed({
      bars: question.bars,
      startIndex: question.startIndex,
      minTradeStep: question.minTradeStep,
      targetPositionValue: RISK_DEFAULTS.targetPositionValue,
      cashReserve: RISK_DEFAULTS.cashReserve,
      atrLookbackBars: RISK_DEFAULTS.atrLookbackBars,
      atrLossMultiple: RISK_DEFAULTS.atrLossMultiple,
    });
    if (!seed) {
      throw appError('SPECIAL_TRAINING_BAR_DATA_INVALID');
    }
    return {
      ...base,
      openCount: 1,
      positionQty: seed.positionQty,
      entryPrice: seed.entryPrice,
      cashBalance: seed.cashBalance,
      equityPeakAsset: seed.challengeStartAsset,
      initialCapital: seed.initialCapital,
      challengeStartAsset: seed.challengeStartAsset,
    };
  }

  return base;
};

export const buildRiskRuntimeBaseline = (
  runtime: SpecialTrainingTradeRuntimeState,
): SpecialTrainingRiskRuntimeBaseline => ({
  initialCapital: runtime.initialCapital,
  cashBalance: runtime.cashBalance,
  positionQty: runtime.positionQty,
  entryPrice: runtime.entryPrice,
});

const clampRatio = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const buildGravityFieldFact = ({
  breakevenPrice,
  currentPrice,
}: {
  breakevenPrice: number | null;
  currentPrice: number | null;
}): SpecialTrainingGravityFieldFact | null => {
  const currentPriceValue =
    typeof currentPrice === 'number' ? currentPrice : Number.NaN;
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
      : clamp(((value - domainMin) / domainSpan) * 100, 0, 100);
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
  const gapWidth =
    breakevenPosition === null || currentPosition === null
      ? 0
      : Math.abs(breakevenPosition - currentPosition);

  return {
    breakevenPrice,
    referencePrice,
    breakevenMoveRatio,
    underwater,
    gapWidth,
  };
};

export const resolveRiskAccountBreakevenPrice = (
  runtime: Pick<
    SpecialTrainingTradeRuntimeState,
    'cashBalance' | 'initialCapital' | 'positionQty'
  >,
): number | null => {
  const positionQty = toFiniteNumber(runtime.positionQty);
  if (!Number.isFinite(positionQty) || positionQty <= 0) {
    return null;
  }
  const initialCapital = toFiniteNumber(runtime.initialCapital);
  const cashBalance = toFiniteNumber(runtime.cashBalance);
  if (!Number.isFinite(initialCapital) || !Number.isFinite(cashBalance)) {
    return null;
  }
  const breakevenPrice = (initialCapital - cashBalance) / positionQty;
  return Number.isFinite(breakevenPrice) && breakevenPrice > 0
    ? breakevenPrice
    : null;
};

export const buildRiskRuntimeMetrics = (input: {
  runtime: SpecialTrainingTradeRuntimeState;
  riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl: number | null;
  cursorIndex: number;
  questionStartIndex: number;
  questionEndIndex: number;
}): SpecialTrainingRiskRuntimeMetrics => {
  const currentPrice =
    Number.isFinite(toFiniteNumber(input.currentPrice)) &&
    toFiniteNumber(input.currentPrice) > 0
      ? Number(input.currentPrice)
      : null;
  const currentTotalAsset = Number.isFinite(
    toFiniteNumber(input.currentTotalAsset),
  )
    ? Number(input.currentTotalAsset)
    : null;
  const floatingPnl = Number.isFinite(toFiniteNumber(input.floatingPnl))
    ? Number(input.floatingPnl)
    : null;
  const costPriceNow =
    input.runtime.positionQty > 0 &&
    Number.isFinite(toFiniteNumber(input.runtime.entryPrice)) &&
    input.runtime.entryPrice > 0
      ? input.runtime.entryPrice
      : null;
  const baselineCostPrice =
    Number.isFinite(toFiniteNumber(input.riskBaseline?.entryPrice)) &&
    Number(input.riskBaseline?.entryPrice) > 0
      ? Number(input.riskBaseline?.entryPrice)
      : null;
  const holderReference =
    input.riskBaseline && currentPrice !== null && currentTotalAsset !== null
      ? (() => {
          const holderAsset =
            input.riskBaseline.cashBalance +
            input.riskBaseline.positionQty * currentPrice;
          if (!Number.isFinite(holderAsset)) {
            return null;
          }
          const holderPnl = holderAsset - input.riskBaseline.initialCapital;
          const actualPnl = currentTotalAsset - input.runtime.initialCapital;
          return {
            holderPnl,
            actualPnl,
            rescueAlpha: actualPnl - holderPnl,
          };
        })()
      : null;
  const total = Math.max(1, input.questionEndIndex - input.questionStartIndex);
  const progressed = Math.min(
    total,
    Math.max(0, input.cursorIndex - input.questionStartIndex),
  );
  const remainingActionableBars = Math.max(0, total - progressed);

  const accountBreakevenPrice = resolveRiskAccountBreakevenPrice(input.runtime);

  return {
    currentPrice,
    currentTotalAsset,
    floatingPnl,
    costPriceNow,
    baselineCostPrice,
    accountBreakevenPrice,
    holderReference,
    survivalProgress: {
      progressed,
      total,
      remainingActionableBars,
      remainingActionableRatio: clampRatio(remainingActionableBars / total),
    },
    gravityField: buildGravityFieldFact({
      breakevenPrice: accountBreakevenPrice,
      currentPrice,
    }),
  };
};
