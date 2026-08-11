// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { resolveBarsBaseTimeframe } from "@/domains/data-import/baseTimeframeInference";
import type { Bar } from "@/domains/training/types";
import type { SpecialTrainingModeDefinition } from "@/ui/config/uiConfig";
import type {
  FastDecisionResult,
  RuntimeState,
  SettlementResult,
  SpecialTrainingQuestion,
  TradeActionLogEntry,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import { clamp, toFiniteNumber, toNullableFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";

type BuildFastDecisionReplayOverlayContext = (input: {
  bars: Bar[];
  startIndex: number;
  revealEndIndex: number;
  directionResult: FastDecisionResult;
  selectionLabel: string;
  buyLabel: string;
  sellLabel: string;
  observeLabel: string;
  mfeLabel: string;
  maeLabel: string;
}) => SpecialTrainingReplayOverlayContext;

export type ChallengeReviewNotePayload = {
  questionId: string;
  modeId: string;
  summaryChips: ReplayContextSummaryChip[];
  initialCapital: number;
  finalTotalAsset: number | null;
  maxDrawdownRatio: number;
  position: {
    qty: number;
    avgCost: number;
    markPrice: number;
  } | null;
  contextOverride?: {
    symbol: string;
    bars: Bar[];
    cursorIndex: number;
    tradeMarkers?: Array<{
      rawIndex: number;
      side: "BUY" | "SELL";
      price: number;
      label?: string;
    }>;
    baseTimeframe?: BaseTimeframe | null;
    specialTraining?: SpecialTrainingReplayOverlayContext | null;
  } | null;
};

type BuildChallengeReviewNotePayloadParams = {
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeQuestion: SpecialTrainingQuestion | null;
  activeFastDecisionDirectionResult: FastDecisionResult | null;
  fastDecisionPhase: string;
  questionBars: Bar[];
  cursorIndex: number;
  questionStartIndex: number;
  activeQuestionEffectiveTrainingTimeframe: BaseTimeframe | null;
  labels: {
    fastArenaBuyHotkeyLabel: string;
    fastArenaSellHotkeyLabel: string;
    fastArenaObserveMarkLabel: string;
    decisionDirectionUpLabel: string;
    decisionDirectionDownLabel: string;
    decisionObserveLabel: string;
    fastArenaMfeTagLabel: string;
    fastArenaMaeTagLabel: string;
    riskDisciplineBaselineGuideTagLabel: string;
    riskDisciplineCostGuideTagLabel: string;
  };
  tradeActions: TradeActionLogEntry[];
  riskBaselineCostPrice: number | null;
  riskCostPriceNow: number | null;
  settlement: SettlementResult | null;
  riskReviewAlphaVsHold: number | null;
  riskReviewAlphaVsHardStop: number | null;
  currentTotalAsset: number | null;
  runtime: RuntimeState;
  currentPrice: number | null;
  challengeReviewSummaryChips: ReplayContextSummaryChip[];
  buildFastDecisionReplayOverlayContext: BuildFastDecisionReplayOverlayContext;
};

export const buildChallengeReviewNotePayload = ({
  activeMode,
  activeQuestion,
  activeFastDecisionDirectionResult,
  fastDecisionPhase,
  questionBars,
  cursorIndex,
  questionStartIndex,
  activeQuestionEffectiveTrainingTimeframe,
  labels,
  tradeActions,
  riskBaselineCostPrice,
  riskCostPriceNow,
  settlement,
  riskReviewAlphaVsHold,
  riskReviewAlphaVsHardStop,
  currentTotalAsset,
  runtime,
  currentPrice,
  challengeReviewSummaryChips,
  buildFastDecisionReplayOverlayContext,
}: BuildChallengeReviewNotePayloadParams): ChallengeReviewNotePayload | null => {
  if (!activeMode || !activeQuestion) {
    return null;
  }

  const canUseFastDecisionPreviewNote =
    activeMode.id === "fast-decision-training" &&
    fastDecisionPhase === "JUDGED" &&
    activeFastDecisionDirectionResult !== null &&
    questionBars.length > 0;
  if (!settlement && !canUseFastDecisionPreviewNote) {
    return null;
  }

  const reviewCursorIndex =
    activeMode.id === "fast-decision-training"
      ? clamp(
          Math.floor(
            toFiniteNumber(
              activeFastDecisionDirectionResult?.revealEndIndex ?? cursorIndex,
            ) || 0,
          ),
          0,
          Math.max(0, questionBars.length - 1),
        )
      : clamp(
          Math.floor(toFiniteNumber(cursorIndex) || 0),
          0,
          Math.max(0, questionBars.length - 1),
        );
  const questionSymbol = String(activeQuestion.symbol || "").trim().toUpperCase();
  const reviewBars =
    reviewCursorIndex >= 0 ? questionBars.slice(0, reviewCursorIndex + 1) : [];
  const reviewBaseTimeframe =
    activeQuestionEffectiveTrainingTimeframe ??
    resolveBarsBaseTimeframe(questionBars);
  const fastDecisionContextOverride =
    activeMode.id === "fast-decision-training" &&
    activeFastDecisionDirectionResult &&
    reviewBars.length > 0
      ? {
          symbol: questionSymbol,
          bars: reviewBars,
          cursorIndex: reviewBars.length - 1,
          baseTimeframe: reviewBaseTimeframe,
          specialTraining: buildFastDecisionReplayOverlayContext({
            bars: questionBars,
            startIndex: questionStartIndex,
            revealEndIndex: activeFastDecisionDirectionResult.revealEndIndex,
            directionResult: activeFastDecisionDirectionResult,
            selectionLabel:
              activeFastDecisionDirectionResult.selection === "LONG"
                ? labels.fastArenaBuyHotkeyLabel
                : activeFastDecisionDirectionResult.selection === "SHORT"
                  ? labels.fastArenaSellHotkeyLabel
                  : labels.fastArenaObserveMarkLabel,
            buyLabel: labels.decisionDirectionUpLabel,
            sellLabel: labels.decisionDirectionDownLabel,
            observeLabel: labels.decisionObserveLabel,
            mfeLabel: labels.fastArenaMfeTagLabel,
            maeLabel: labels.fastArenaMaeTagLabel,
          }),
        }
      : null;
  const riskContextOverride =
    activeMode.id === "risk-discipline-training" && reviewBars.length > 0
      ? {
          symbol: questionSymbol,
          bars: reviewBars,
          cursorIndex: reviewBars.length - 1,
          baseTimeframe: reviewBaseTimeframe,
          tradeMarkers: tradeActions.flatMap((action) => {
            const rawIndex = clamp(
              Math.floor(toFiniteNumber(action.barIndex) || 0),
              0,
              Math.max(0, questionBars.length - 1),
            );
            if (rawIndex > reviewCursorIndex) {
              return [];
            }
            const bar = questionBars[rawIndex];
            const markerPrice =
              toFiniteNumber(action.executionPrice) > 0
                ? toFiniteNumber(action.executionPrice)
                : toFiniteNumber(bar?.close);
            if (!Number.isFinite(markerPrice) || markerPrice <= 0) {
              return [];
            }
            return [
              {
                rawIndex,
                side: action.type,
                price: markerPrice,
                label:
                  action.type === "BUY"
                    ? labels.fastArenaBuyHotkeyLabel
                    : labels.fastArenaSellHotkeyLabel,
              },
            ];
          }),
          specialTraining: {
            decisionBoundaryRawIndex: -1,
            decisionMarker: null,
            fastDecisionExtremeRay: null,
            riskDisciplineGuides: {
              baselinePrice: riskBaselineCostPrice,
              currentCostPrice: riskCostPriceNow,
              baselineTagText: labels.riskDisciplineBaselineGuideTagLabel,
              currentCostTagText: labels.riskDisciplineCostGuideTagLabel,
            },
            fastDecisionReview: null,
            riskReviewSummary: {
              alphaVsHolderRatio: riskReviewAlphaVsHold,
              alphaVsHardStopRatio: riskReviewAlphaVsHardStop,
              recoveryRate: settlement?.recoveryRate ?? null,
              grade: String(settlement?.grade ?? "").trim(),
              costBasisShiftRatio: toNullableFiniteNumber(
                settlement?.riskReview?.costBasisShift?.shiftRatio,
              ),
              finalCostBasis: toNullableFiniteNumber(
                settlement?.riskReview?.costBasisShift?.finalCostBasis ??
                  settlement?.riskReview?.costBasisShift?.finalAvgCost,
              ),
            },
          },
        }
      : null;
  const finalTotalAssetForNote =
    settlement?.fastReview?.finalAsset ??
    settlement?.finalTotalAsset ??
    currentTotalAsset;
  const maxDrawdownRatioForNote =
    settlement?.fastReview?.maxDrawdownRate ??
    settlement?.maxDrawdownRatio ??
    runtime.maxDrawdownRatio;
  const currentPriceValue =
    typeof currentPrice === "number" ? currentPrice : Number.NaN;

  return {
    questionId: activeQuestion.id,
    modeId: activeMode.id,
    summaryChips: challengeReviewSummaryChips,
    initialCapital: runtime.initialCapital,
    finalTotalAsset: finalTotalAssetForNote,
    maxDrawdownRatio: maxDrawdownRatioForNote,
    position:
      runtime.positionQty > 1e-8 &&
      Number.isFinite(currentPriceValue) &&
      currentPriceValue > 0 &&
      Number.isFinite(runtime.entryPrice) &&
      runtime.entryPrice > 0
        ? {
            qty: runtime.positionQty,
            avgCost: runtime.entryPrice,
            markPrice: currentPriceValue,
          }
        : null,
    contextOverride: fastDecisionContextOverride ?? riskContextOverride,
  };
};
