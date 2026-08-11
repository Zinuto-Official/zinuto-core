// SPDX-License-Identifier: GPL-3.0-only

import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { formatMoney, formatMoneyFixed } from "@/ui/formatting/format";
import {
  formatCountWithUnitText,
  formatLotsAndSharesText,
} from "@/ui/formatting/i18nDisplay";
import {
  clamp,
  formatPercentFixed,
  formatPrice,
  formatSigned,
  formatTemplate,
  resolvePnlClass,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type { RuntimeState } from "@/workspaces/special-training/domain/specialTrainingTypes";
import type {
  RiskUiActionStatus,
  RiskUiUndoActionStatus,
} from "@/workspaces/special-training/view-models/specialTrainingRiskDisciplineActionViewModel";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type RiskEstimate = {
  qty: number | null;
  cashEffect: number | null;
};

type RiskHolderReference = {
  rescueAlpha: number;
} | null;

type RiskGravityFieldModel = {
  referencePrice: number | null;
  breakevenPrice: number | null;
  breakevenMoveRatio: number | null;
  underwater: boolean;
  gapWidth: number;
} | null;

type UseSpecialTrainingRiskDisciplineDisplayViewModelInput = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  ui: UiLabelEntry;
  tt: (key: AppTextKey) => string;
  textSlash: string;
  textDoubleDash: string;
  currentQuestionIndex: number;
  questionCount: number;
  runtime: RuntimeState;
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl: number | null;
  riskRemainingActionableRatio: number;
  riskRemainingActionableBars: number;
  riskHolderReference: RiskHolderReference;
  riskGravityFieldModel: RiskGravityFieldModel;
  riskBuyEstimate: RiskEstimate;
  riskSellEstimate: RiskEstimate;
  buyAndAdvanceDisabled: boolean;
  sellAndAdvanceDisabled: boolean;
  nextBarDisabled: boolean;
  canUndoRiskAction: boolean;
  riskBuyAdvanceActionState: RiskUiActionStatus;
  riskSellAdvanceActionState: RiskUiActionStatus;
  riskNextBarActionState: RiskUiActionStatus;
  riskUndoActionState: RiskUiUndoActionStatus;
};

export const useSpecialTrainingRiskDisciplineDisplayViewModel = ({
  language,
  content,
  ui,
  tt,
  textSlash,
  textDoubleDash,
  currentQuestionIndex,
  questionCount,
  runtime,
  currentPrice,
  currentTotalAsset,
  floatingPnl,
  riskRemainingActionableRatio,
  riskRemainingActionableBars,
  riskHolderReference,
  riskGravityFieldModel,
  riskBuyEstimate,
  riskSellEstimate,
  buyAndAdvanceDisabled,
  sellAndAdvanceDisabled,
  nextBarDisabled,
  canUndoRiskAction,
  riskBuyAdvanceActionState,
  riskSellAdvanceActionState,
  riskNextBarActionState,
  riskUndoActionState,
}: UseSpecialTrainingRiskDisciplineDisplayViewModelInput) => {
  const currentTotalAssetValue =
    typeof currentTotalAsset === "number" ? currentTotalAsset : Number.NaN;
  const hasCurrentTotalAsset = Number.isFinite(currentTotalAssetValue);
  const floatingPnlValue =
    typeof floatingPnl === "number" ? floatingPnl : Number.NaN;
  const hasFloatingPnl = Number.isFinite(floatingPnlValue);
  const currentPriceValue =
    typeof currentPrice === "number" ? currentPrice : Number.NaN;
  const hasCurrentPrice = Number.isFinite(currentPriceValue);
  const riskQuestionProgressValue = `${currentQuestionIndex + 1}${textSlash}${questionCount}`;
  const riskQuestionProgressSegmentCount = Math.max(questionCount, 1);
  const riskSurvivalTrackTone =
    riskRemainingActionableRatio <= 0.25
      ? "critical"
      : riskRemainingActionableRatio <= 0.5
        ? "warning"
        : "steady";
  const riskRemainingBarsDisplay = formatMoneyFixed(
    riskRemainingActionableBars,
    0,
  );
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
  const riskPositionPressureDisplay = formatPercentFixed(
    riskPositionPressureRatio,
    1,
  );
  const riskOriginalAssetDisplay = formatPrice(runtime.initialCapital);
  const riskCurrentAssetDisplay = hasCurrentTotalAsset
    ? formatPrice(currentTotalAssetValue)
    : textDoubleDash;
  const riskAvailableCashDisplay = formatPrice(runtime.cashBalance);
  const riskCurrentPositionDisplay = formatCountWithUnitText(
    language,
    runtime.positionQty,
    tt("appText.lots2"),
  );
  const riskFloatingLabel =
    !hasFloatingPnl
      ? content.statusFloatingLabel
      : floatingPnlValue < 0
        ? content.riskDisciplineFloatingLossLabel
        : floatingPnlValue > 0
          ? content.riskDisciplineFloatingProfitLabel
          : content.statusFloatingLabel;
  const riskFloatingValueDisplay = hasFloatingPnl
    ? formatSigned(floatingPnlValue)
    : textDoubleDash;
  const riskFloatingTone = hasFloatingPnl
    ? resolvePnlClass(floatingPnlValue)
    : "flat";
  const riskBreakevenDistanceDisplay =
    Math.abs(runtime.positionQty) <= 1e-8
      ? content.riskDisciplineBreakevenFlatLabel
      : riskGravityFieldModel?.breakevenMoveRatio !== null &&
          riskGravityFieldModel?.breakevenMoveRatio !== undefined &&
          riskGravityFieldModel.breakevenMoveRatio > 1e-6
        ? formatTemplate(content.riskDisciplineBreakevenNeedRiseTemplate, [
            formatPercentFixed(riskGravityFieldModel.breakevenMoveRatio, 1),
          ])
        : content.riskDisciplineBreakevenRecoveredLabel;
  const riskBreakevenTone =
    Math.abs(runtime.positionQty) <= 1e-8
      ? "flat"
      : riskGravityFieldModel?.underwater
        ? "down"
        : "up";
  const riskSurvivalCardTone =
    Math.abs(runtime.positionQty) <= 1e-8 || !hasFloatingPnl
      ? "flat"
      : resolvePnlClass(floatingPnlValue);
  const riskRealityCheckVsHoldValue = riskHolderReference?.rescueAlpha ?? null;
  const riskRealityCheckVsHardStopValue = Number.isFinite(
    runtime.challengeStartAsset,
  ) && hasCurrentTotalAsset
    ? currentTotalAssetValue - runtime.challengeStartAsset
    : null;
  const riskHudMetricCards = [
    {
      id: "hold",
      label: content.riskDisciplineRealityCheckVsHoldLabel,
      delta: riskRealityCheckVsHoldValue,
    },
    {
      id: "hard-stop",
      label: content.riskDisciplineRealityCheckVsHardStopLabel,
      delta: riskRealityCheckVsHardStopValue,
    },
  ].map((card) => ({
    ...card,
    tone: resolvePnlClass(card.delta ?? 0),
    value: card.delta !== null ? formatSigned(card.delta) : textDoubleDash,
  }));
  const riskReferencePriceDisplay =
    hasCurrentPrice && currentPriceValue > 0
      ? formatPrice(currentPriceValue)
      : textDoubleDash;
  const riskReferencePriceModeLabel = `${tt("appText.message0694")}${ui.currentClose}${tt("appText.message0695")}`;
  const riskBuyEstimateQtyDisplay =
    riskBuyEstimate.qty !== null
      ? formatLotsAndSharesText(
          language,
          riskBuyEstimate.qty,
          tt("appText.lots2"),
          riskBuyEstimate.qty,
          tt("appText.shares"),
        )
      : textDoubleDash;
  const riskBuyEstimateCashDisplay =
    riskBuyEstimate.cashEffect !== null
      ? formatMoney(riskBuyEstimate.cashEffect)
      : textDoubleDash;
  const riskSellEstimateQtyDisplay =
    riskSellEstimate.qty !== null
      ? formatLotsAndSharesText(
          language,
          riskSellEstimate.qty,
          tt("appText.lots2"),
          riskSellEstimate.qty,
          tt("appText.shares"),
        )
      : textDoubleDash;
  const riskSellEstimateCashDisplay =
    riskSellEstimate.cashEffect !== null
      ? formatMoney(riskSellEstimate.cashEffect)
      : textDoubleDash;
  const riskBuyAdvanceLabel = `${tt("appText.buy")} + ${ui.nextBar}`;
  const riskSellAdvanceLabel = `${tt("appText.sell")} + ${ui.nextBar}`;
  const riskBuyAdvanceReason =
    buyAndAdvanceDisabled && riskBuyAdvanceActionState.blockedReason
      ? riskBuyAdvanceActionState.blockedReason
      : null;
  const riskSellAdvanceReason =
    sellAndAdvanceDisabled && riskSellAdvanceActionState.blockedReason
      ? riskSellAdvanceActionState.blockedReason
      : null;
  const riskNextBarReason =
    nextBarDisabled && riskNextBarActionState.blockedReason
      ? riskNextBarActionState.blockedReason
      : null;
  const riskUndoReason =
    !canUndoRiskAction &&
    riskUndoActionState.blockedReason &&
    riskUndoActionState.blockedReasonCode !== "UNDO_EMPTY"
      ? riskUndoActionState.blockedReason
      : null;
  const riskSnapshotItems = [
    {
      key: "origin",
      label: content.riskDisciplineOriginalAssetLabel,
      value: riskOriginalAssetDisplay,
    },
    {
      key: "cash",
      label: content.riskDisciplineAvailableCashLabel,
      value: riskAvailableCashDisplay,
    },
    {
      key: "position",
      label: content.riskDisciplineCurrentPositionLabel,
      value: riskCurrentPositionDisplay,
    },
    {
      key: "pressure",
      label: content.riskDisciplinePositionPressureLabel,
      value: riskPositionPressureDisplay,
    },
  ] as const;
  const riskGravityCurrentPriceDisplay =
    riskGravityFieldModel?.referencePrice !== null &&
    riskGravityFieldModel?.referencePrice !== undefined
      ? formatPrice(riskGravityFieldModel.referencePrice)
      : textDoubleDash;
  const riskGravityBreakevenPriceDisplay =
    riskGravityFieldModel?.breakevenPrice !== null &&
    riskGravityFieldModel?.breakevenPrice !== undefined
      ? formatPrice(riskGravityFieldModel.breakevenPrice)
      : textDoubleDash;
  const riskGravityGapFillPercent = riskGravityFieldModel?.underwater
    ? clamp(Math.max(riskGravityFieldModel.gapWidth, 12), 12, 72)
    : runtime.positionQty > 0
      ? 100
      : 0;

  return {
    riskQuestionProgressValue,
    riskQuestionProgressSegmentCount,
    riskSurvivalTrackTone,
    riskRemainingBarsDisplay,
    riskSurvivalCardTone,
    riskCurrentAssetDisplay,
    riskFloatingLabel,
    riskFloatingValueDisplay,
    riskFloatingTone,
    riskSnapshotItems,
    riskReferencePriceDisplay,
    riskReferencePriceModeLabel,
    riskBuyEstimateQtyDisplay,
    riskBuyEstimateCashDisplay,
    riskSellEstimateQtyDisplay,
    riskSellEstimateCashDisplay,
    riskBuyAdvanceReason,
    riskSellAdvanceReason,
    riskNextBarReason,
    riskUndoReason,
    riskBuyAdvanceLabel,
    riskSellAdvanceLabel,
    riskGravityCurrentPriceDisplay,
    riskGravityBreakevenPriceDisplay,
    riskBreakevenTone,
    riskGravityGapFillPercent,
    riskBreakevenDistanceDisplay,
    riskHudMetricCards,
  };
};
