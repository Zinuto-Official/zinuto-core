// SPDX-License-Identifier: GPL-3.0-only

import type {
  SpecialTrainingRiskActionBlockReasonCode,
  SpecialTrainingRiskActionState,
  SpecialTrainingRiskRuntimeBaseline,
  SpecialTrainingTradeRuntimeState,
} from '../../domain/specialTraining/contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskActionStatusFact = {
  allowed: boolean;
  blockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null;
};

export type RiskUndoActionStatusFact = RiskActionStatusFact & {
  availableSteps: number;
  maxSteps: number;
  lastUndoableAction: 'BUY_AND_ADVANCE' | 'SELL_AND_ADVANCE' | 'NEXT_BAR' | null;
};

export type RiskActionFacts = {
  buyAdvance: RiskActionStatusFact;
  sellAdvance: RiskActionStatusFact;
  nextBar: RiskActionStatusFact;
  undo: RiskUndoActionStatusFact;
  buyAndAdvanceDisabled: boolean;
  sellAndAdvanceDisabled: boolean;
  nextBarDisabled: boolean;
  canUndo: boolean;
};

export type RiskHolderReferenceFact = {
  holderPnl: number;
  actualPnl: number;
  rescueAlpha: number;
} | null;

export type RiskGravityFieldFact = {
  breakevenPrice: number | null;
  referencePrice: number | null;
  breakevenMoveRatio: number | null;
  underwater: boolean;
  gapWidth: number;
} | null;

export type RiskSurvivalFact = {
  remainingActionableBars: number;
  remainingActionableRatio: number;
  survivalTrackTone: 'critical' | 'warning' | 'steady';
};

export type RiskPositionPressureFact = {
  marketValue: number;
  pressureRatio: number;
};

export type RiskBreakevenFact = {
  tone: 'flat' | 'down' | 'up';
  hasBreakevenMoveRatio: boolean;
  breakevenMoveRatio: number;
  isFlat: boolean;
};

export type RiskRealityCheckFact = {
  vsHold: number | null;
  vsHardStop: number | null;
};

export type RiskFloatingFact = {
  hasValue: boolean;
  value: number;
  tone: 'flat' | 'positive' | 'negative';
};

export type RiskDisplayFacts = {
  questionProgressValue: string;
  questionProgressSegmentCount: number;
  survival: RiskSurvivalFact;
  positionPressure: RiskPositionPressureFact;
  breakeven: RiskBreakevenFact;
  realityCheck: RiskRealityCheckFact;
  floating: RiskFloatingFact;
  survivalCardTone: 'flat' | 'positive' | 'negative';
  gravityField: RiskGravityFieldFact;
  gravityGapFillPercent: number;
  hasCurrentTotalAsset: boolean;
  hasCurrentPrice: boolean;
  hasFloatingPnl: boolean;
  currentPriceValue: number;
  currentTotalAssetValue: number;
  floatingPnlValue: number;
  originalAsset: number;
  cashBalance: number;
  positionQty: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const buildRiskActionFacts = (
  actionState: SpecialTrainingRiskActionState | null,
): RiskActionFacts => {
  const buildStatus = (
    status: { allowed: boolean; blockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null; blockedReason: string | null } | null | undefined,
  ): RiskActionStatusFact => {
    if (!status) {
      return { allowed: false, blockedReasonCode: null };
    }
    return {
      allowed: status.allowed === true,
      blockedReasonCode: status.allowed ? null : status.blockedReasonCode,
    };
  };

  const buyAdvance = buildStatus(actionState?.buyAdvance);
  const sellAdvance = buildStatus(actionState?.sellAdvance);
  const nextBar = buildStatus(actionState?.nextBar);
  const undo: RiskUndoActionStatusFact = {
    ...buildStatus(actionState?.undo),
    availableSteps: Math.max(
      0,
      Math.floor(Number(actionState?.undo?.availableSteps ?? 0) || 0),
    ),
    maxSteps: Math.max(
      1,
      Math.floor(Number(actionState?.undo?.maxSteps ?? 5) || 5),
    ),
    lastUndoableAction: actionState?.undo?.lastUndoableAction ?? null,
  };

  return {
    buyAdvance,
    sellAdvance,
    nextBar,
    undo,
    buyAndAdvanceDisabled: !buyAdvance.allowed,
    sellAndAdvanceDisabled: !sellAdvance.allowed,
    nextBarDisabled: !nextBar.allowed,
    canUndo: undo.allowed,
  };
};

export const buildRiskHolderReferenceFact = ({
  isRiskDisciplineMode,
  riskBaseline,
  currentPrice,
  currentTotalAsset,
  runtimeInitialCapital,
}: {
  isRiskDisciplineMode: boolean;
  riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
  currentPrice: number | null;
  currentTotalAsset: number | null;
  runtimeInitialCapital: number;
}): RiskHolderReferenceFact => {
  const currentPriceValue =
    typeof currentPrice === 'number' ? currentPrice : Number.NaN;
  if (
    !isRiskDisciplineMode ||
    !riskBaseline ||
    !Number.isFinite(currentPriceValue) ||
    currentPriceValue <= 0
  ) {
    return null;
  }
  const totalAsset =
    typeof currentTotalAsset === 'number' ? currentTotalAsset : Number.NaN;
  if (!Number.isFinite(totalAsset)) {
    return null;
  }
  const holderAsset =
    riskBaseline.cashBalance + riskBaseline.positionQty * currentPriceValue;
  if (!Number.isFinite(holderAsset)) {
    return null;
  }
  const holderPnl = holderAsset - riskBaseline.initialCapital;
  const actualPnl = totalAsset - runtimeInitialCapital;
  return {
    holderPnl,
    actualPnl,
    rescueAlpha: actualPnl - holderPnl,
  };
};

export const buildRiskAccountBreakevenPrice = ({
  isRiskDisciplineMode,
  runtime,
}: {
  isRiskDisciplineMode: boolean;
  runtime: Pick<SpecialTrainingTradeRuntimeState, 'cashBalance' | 'initialCapital' | 'positionQty'>;
}): number | null => {
  const positionQty = toFiniteNumber(runtime.positionQty);
  if (
    !isRiskDisciplineMode ||
    !Number.isFinite(positionQty) ||
    positionQty <= 0
  ) {
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

export const buildRiskGravityFieldFact = ({
  breakevenPrice,
  currentPrice,
}: {
  breakevenPrice: number | null;
  currentPrice: number | null;
}): RiskGravityFieldFact => {
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

export const buildRiskSurvivalFact = ({
  remainingActionableBars,
  remainingActionableRatio,
}: {
  remainingActionableBars: number;
  remainingActionableRatio: number;
}): RiskSurvivalFact => ({
  remainingActionableBars,
  remainingActionableRatio,
  survivalTrackTone:
    remainingActionableRatio <= 0.25
      ? 'critical'
      : remainingActionableRatio <= 0.5
        ? 'warning'
        : 'steady',
});

export const buildRiskDisplayFacts = ({
  currentQuestionIndex,
  questionCount,
  runtime,
  currentPrice,
  currentTotalAsset,
  floatingPnl,
  remainingActionableRatio,
  remainingActionableBars,
  riskHolderReference,
  gravityField,
}: {
  currentQuestionIndex: number;
  questionCount: number;
  runtime: SpecialTrainingTradeRuntimeState;
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl: number | null;
  remainingActionableRatio: number;
  remainingActionableBars: number;
  riskHolderReference: RiskHolderReferenceFact;
  gravityField: RiskGravityFieldFact;
}): RiskDisplayFacts => {
  const currentTotalAssetValue =
    typeof currentTotalAsset === 'number' ? currentTotalAsset : Number.NaN;
  const hasCurrentTotalAsset = Number.isFinite(currentTotalAssetValue);
  const floatingPnlValue =
    typeof floatingPnl === 'number' ? floatingPnl : Number.NaN;
  const hasFloatingPnl = Number.isFinite(floatingPnlValue);
  const currentPriceValue =
    typeof currentPrice === 'number' ? currentPrice : Number.NaN;
  const hasCurrentPrice = Number.isFinite(currentPriceValue);

  const currentPositionMarketValue =
    Math.abs(runtime.positionQty) > 1e-8 &&
    hasCurrentPrice &&
    currentPriceValue > 0
      ? Math.abs(runtime.positionQty) * currentPriceValue
      : 0;
  const riskPositionPressureRatio =
    hasCurrentTotalAsset && currentTotalAssetValue > 1e-9
      ? clamp(currentPositionMarketValue / currentTotalAssetValue, 0, 1)
      : 0;

  const floatingTone: 'flat' | 'positive' | 'negative' = hasFloatingPnl
    ? floatingPnlValue > 0
      ? 'positive'
      : floatingPnlValue < 0
        ? 'negative'
        : 'flat'
    : 'flat';

  const survivalCardTone: 'flat' | 'positive' | 'negative' =
    Math.abs(runtime.positionQty) <= 1e-8 || !hasFloatingPnl
      ? 'flat'
      : floatingPnlValue > 0
        ? 'positive'
        : floatingPnlValue < 0
          ? 'negative'
          : 'flat';

  const breakevenIsFlat = Math.abs(runtime.positionQty) <= 1e-8;
  const breakevenTone: 'flat' | 'down' | 'up' = breakevenIsFlat
    ? 'flat'
    : gravityField?.underwater
      ? 'down'
      : 'up';

  const vsHold = riskHolderReference?.rescueAlpha ?? null;
  const vsHardStop = Number.isFinite(runtime.challengeStartAsset) && hasCurrentTotalAsset
    ? currentTotalAssetValue - runtime.challengeStartAsset
    : null;

  const gravityGapFillPercent = gravityField?.underwater
    ? clamp(Math.max(gravityField.gapWidth, 12), 12, 72)
    : runtime.positionQty > 0
      ? 100
      : 0;

  return {
    questionProgressValue: `${currentQuestionIndex + 1}/${questionCount}`,
    questionProgressSegmentCount: Math.max(questionCount, 1),
    survival: buildRiskSurvivalFact({
      remainingActionableBars,
      remainingActionableRatio,
    }),
    positionPressure: {
      marketValue: currentPositionMarketValue,
      pressureRatio: riskPositionPressureRatio,
    },
    breakeven: {
      tone: breakevenTone,
      hasBreakevenMoveRatio:
        gravityField?.breakevenMoveRatio !== null &&
        gravityField?.breakevenMoveRatio !== undefined &&
        gravityField.breakevenMoveRatio > 1e-6,
      breakevenMoveRatio: gravityField?.breakevenMoveRatio ?? 0,
      isFlat: breakevenIsFlat,
    },
    realityCheck: {
      vsHold,
      vsHardStop,
    },
    floating: {
      hasValue: hasFloatingPnl,
      value: floatingPnlValue,
      tone: floatingTone,
    },
    survivalCardTone,
    gravityField,
    gravityGapFillPercent,
    hasCurrentTotalAsset,
    hasCurrentPrice,
    hasFloatingPnl,
    currentPriceValue,
    currentTotalAssetValue,
    floatingPnlValue,
    originalAsset: runtime.initialCapital,
    cashBalance: runtime.cashBalance,
    positionQty: runtime.positionQty,
  };
};

export const buildRiskCostPriceFacts = ({
  isRiskDisciplineMode,
  runtime,
  riskBaseline,
}: {
  isRiskDisciplineMode: boolean;
  runtime: SpecialTrainingTradeRuntimeState;
  riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
}): {
  costPriceNow: number | null;
  baselineCostPrice: number | null;
} => {
  const costPriceNow =
    isRiskDisciplineMode && runtime.positionQty > 0 &&
    Number.isFinite(toFiniteNumber(runtime.entryPrice)) &&
    runtime.entryPrice > 0
      ? runtime.entryPrice
      : null;
  const baselineCostPrice =
    isRiskDisciplineMode &&
    Number.isFinite(toFiniteNumber(riskBaseline?.entryPrice)) &&
    Number(riskBaseline?.entryPrice) > 0
      ? Number(riskBaseline?.entryPrice)
      : null;
  return { costPriceNow, baselineCostPrice };
};

export const buildRiskSurvivalProgressFact = ({
  isRiskDisciplineMode,
  cursorIndex,
  questionStartIndex,
  questionEndIndex,
}: {
  isRiskDisciplineMode: boolean;
  cursorIndex: number;
  questionStartIndex: number;
  questionEndIndex: number;
}): {
  remainingActionableBars: number;
  remainingActionableRatio: number;
} | null => {
  if (!isRiskDisciplineMode) {
    return null;
  }
  const total = Math.max(1, questionEndIndex - questionStartIndex);
  const progressed = Math.min(
    total,
    Math.max(0, cursorIndex - questionStartIndex),
  );
  const remainingActionableBars = Math.max(0, total - progressed);
  const remainingActionableRatio = clamp(
    remainingActionableBars / Math.max(total, 1),
    0,
    1,
  );
  return { remainingActionableBars, remainingActionableRatio };
};
