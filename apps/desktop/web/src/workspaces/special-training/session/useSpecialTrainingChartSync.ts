// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { useEffect, useRef } from "react";
import type { Bar } from "@/domains/training/types";
import type {
  FastDecisionChoice,
  FastDecisionResult,
  FastDecisionArenaPhase,
  SpecialTrainingQuestion,
  TradeActionLogEntry,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type {
  SpecialTrainingChartSyncHandler,
  SpecialTrainingChartSyncState,
} from "@/domains/special-training/specialTrainingContracts";
import {
  clamp,
  formatPercentFixed,
  toFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import { resolveFastDecisionChoiceLabel } from "@/workspaces/special-training/domain/specialTrainingDirectionLabels";

type SpecialTrainingChartSyncLabels = {
  fastArenaMaeTagLabel: string;
  fastArenaObserveMarkLabel: string;
  fastArenaMfeTagLabel: string;
  fastArenaBuyHotkeyLabel: string;
  fastArenaSellHotkeyLabel: string;
  decisionDirectionDownLabel: string;
  decisionDirectionUpLabel: string;
  decisionObserveLabel: string;
  riskDisciplineBaselineGuideTagLabel: string;
  riskDisciplineCostGuideTagLabel: string;
};

export const useSpecialTrainingChartSync = ({
  onSyncChartQuestion,
  isPageActive,
  view,
  activeQuestion,
  questionBars,
  cursorIndex,
  isFastDecisionMode,
  isRiskDisciplineMode,
  lockedDecisionSelection,
  fastDecisionResult,
  fastDecisionPhase,
  questionStartIndex,
  riskBaselineCostPrice,
  riskCostPriceNow,
  tradeActions,
  activeQuestionEffectiveTrainingTimeframe,
  labels,
}: {
  onSyncChartQuestion?: SpecialTrainingChartSyncHandler;
  isPageActive: boolean;
  view: SpecialTrainingView;
  activeQuestion: SpecialTrainingQuestion | null;
  questionBars: Bar[];
  cursorIndex: number;
  isFastDecisionMode: boolean;
  isRiskDisciplineMode: boolean;
  lockedDecisionSelection: FastDecisionChoice | null;
  fastDecisionResult: FastDecisionResult | null;
  fastDecisionPhase: FastDecisionArenaPhase;
  questionStartIndex: number;
  riskBaselineCostPrice: number | null;
  riskCostPriceNow: number | null;
  tradeActions: TradeActionLogEntry[];
  activeQuestionEffectiveTrainingTimeframe: BaseTimeframe | null | undefined;
  labels: SpecialTrainingChartSyncLabels;
}) => {
  const onSyncChartQuestionRef = useRef(onSyncChartQuestion);

  useEffect(() => {
    onSyncChartQuestionRef.current = onSyncChartQuestion;
  }, [onSyncChartQuestion]);

  useEffect(() => {
    if (!onSyncChartQuestion) {
      return;
    }
    if (!isPageActive) {
      onSyncChartQuestion(null);
      return;
    }
    if (view !== "TRAINING" || !activeQuestion || !questionBars.length) {
      if (isPageActive) {
        onSyncChartQuestion(null);
      }
      return;
    }
    const maxIndex = Math.max(0, questionBars.length - 1);
    const normalizedCursorIndex = clamp(
      Math.floor(toFiniteNumber(cursorIndex) || 0),
      0,
      maxIndex,
    );
    const sourceBars = questionBars;
    const normalizedQuestionId = String(activeQuestion.id || "").trim();
    const normalizedSymbol = String(activeQuestion.symbol || "")
      .trim()
      .toUpperCase();
    if (!normalizedQuestionId || !normalizedSymbol || !sourceBars.length) {
      onSyncChartQuestion(null);
      return;
    }

    let fastDecisionExtremeRay: SpecialTrainingChartSyncState["fastDecisionExtremeRay"] =
      null;
    let riskDisciplineGuides: SpecialTrainingChartSyncState["riskDisciplineGuides"] =
      null;
    let decisionMarker: SpecialTrainingChartSyncState["decisionMarker"] = null;
    let tradeMarkers: SpecialTrainingChartSyncState["tradeMarkers"] = [];
    if (isFastDecisionMode && fastDecisionPhase === "JUDGED") {
      const decisionSelection =
        lockedDecisionSelection ?? fastDecisionResult?.selection ?? null;
      if (decisionSelection) {
        const markerLabel = resolveFastDecisionChoiceLabel(decisionSelection, {
          longLabel: labels.fastArenaBuyHotkeyLabel,
          shortLabel: labels.fastArenaSellHotkeyLabel,
          observeLabel: labels.fastArenaObserveMarkLabel,
        });
        const markerDisplayText = resolveFastDecisionChoiceLabel(
          decisionSelection,
          {
            longLabel: labels.decisionDirectionUpLabel,
            shortLabel: labels.decisionDirectionDownLabel,
            observeLabel: labels.decisionObserveLabel,
          },
        );
        decisionMarker = {
          selection: decisionSelection,
          label: markerLabel,
          displayText: markerDisplayText,
        };
      }
    }
    if (
      isFastDecisionMode &&
      fastDecisionPhase === "JUDGED" &&
      fastDecisionResult
    ) {
      const safeStartIndex = clamp(
        Math.floor(toFiniteNumber(questionStartIndex) || 0),
        0,
        maxIndex,
      );
      const safeRevealEndIndex = clamp(
        Math.floor(
          toFiniteNumber(fastDecisionResult.revealEndIndex) || safeStartIndex,
        ),
        safeStartIndex,
        maxIndex,
      );
      if (safeRevealEndIndex > safeStartIndex) {
        const revealBars = questionBars.slice(
          safeStartIndex + 1,
          safeRevealEndIndex + 1,
        );
        let revealMaxOpenClose = Number.NEGATIVE_INFINITY;
        let revealMinOpenClose = Number.POSITIVE_INFINITY;
        revealBars.forEach((bar) => {
          const open = toFiniteNumber(bar?.open);
          const close = toFiniteNumber(bar?.close);
          if (Number.isFinite(open) && Number.isFinite(close)) {
            revealMaxOpenClose = Math.max(revealMaxOpenClose, open, close);
            revealMinOpenClose = Math.min(revealMinOpenClose, open, close);
            return;
          }
          if (Number.isFinite(open)) {
            revealMaxOpenClose = Math.max(revealMaxOpenClose, open);
            revealMinOpenClose = Math.min(revealMinOpenClose, open);
            return;
          }
          if (Number.isFinite(close)) {
            revealMaxOpenClose = Math.max(revealMaxOpenClose, close);
            revealMinOpenClose = Math.min(revealMinOpenClose, close);
          }
        });
        if (
          Number.isFinite(revealMaxOpenClose) &&
          Number.isFinite(revealMinOpenClose)
        ) {
          let profitUsesUpperLine = fastDecisionResult.selection !== "SHORT";
          if (fastDecisionResult.selection === "OBSERVE") {
            profitUsesUpperLine =
              fastDecisionResult.longMfeRatio >=
              fastDecisionResult.longMaeRatio;
          }
          const profitPrice = profitUsesUpperLine
            ? revealMaxOpenClose
            : revealMinOpenClose;
          const drawdownPrice = profitUsesUpperLine
            ? revealMinOpenClose
            : revealMaxOpenClose;
          const baselinePrice = toFiniteNumber(
            questionBars[safeStartIndex]?.close,
          );
          const profitRatio = Math.max(
            0,
            toFiniteNumber(fastDecisionResult.selectedMfeRatio),
          );
          const drawdownRatio = Math.max(
            0,
            toFiniteNumber(fastDecisionResult.selectedMaeRatio),
          );
          const profitTagText = `${labels.fastArenaMfeTagLabel} +${formatPercentFixed(profitRatio, 2)}`;
          const drawdownTagText = `${labels.fastArenaMaeTagLabel} -${formatPercentFixed(drawdownRatio, 2)}`;
          if (
            Number.isFinite(profitPrice) &&
            Number.isFinite(drawdownPrice) &&
            Number.isFinite(baselinePrice)
          ) {
            fastDecisionExtremeRay = {
              profitPrice,
              drawdownPrice,
              baselinePrice,
              profitRatio,
              drawdownRatio,
              profitTagText,
              drawdownTagText,
            };
          }
        }
      }
    }
    if (isRiskDisciplineMode) {
      const baselinePrice = riskBaselineCostPrice;
      const currentCostPrice = riskCostPriceNow;
      tradeMarkers = tradeActions.flatMap((action) => {
        const rawIndex = clamp(
          Math.floor(toFiniteNumber(action.barIndex) || 0),
          0,
          maxIndex,
        );
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
      });
      if (baselinePrice !== null || currentCostPrice !== null) {
        riskDisciplineGuides = {
          baselinePrice,
          currentCostPrice,
          baselineTagText: labels.riskDisciplineBaselineGuideTagLabel,
          currentCostTagText: labels.riskDisciplineCostGuideTagLabel,
        };
      }
    }

    onSyncChartQuestion({
      questionId: normalizedQuestionId,
      symbol: normalizedSymbol,
      bars: sourceBars,
      baseTimeframe:
        activeQuestionEffectiveTrainingTimeframe ??
        activeQuestion.sourceTimeframe ??
        activeQuestion.minimumBaseTimeframe ??
        null,
      cursorIndex: normalizedCursorIndex,
      windowStartIndex: 0,
      decisionBoundaryRawIndex: isFastDecisionMode
        ? clamp(
            Math.floor(toFiniteNumber(questionStartIndex) || 0),
            0,
            maxIndex,
          )
        : -1,
      decisionMarker,
      tradeMarkers,
      fastDecisionExtremeRay,
      riskDisciplineGuides,
    });
  }, [
    activeQuestion,
    activeQuestionEffectiveTrainingTimeframe,
    cursorIndex,
    fastDecisionPhase,
    fastDecisionResult,
    isFastDecisionMode,
    isPageActive,
    isRiskDisciplineMode,
    labels.decisionDirectionDownLabel,
    labels.decisionDirectionUpLabel,
    labels.decisionObserveLabel,
    labels.fastArenaBuyHotkeyLabel,
    labels.fastArenaMaeTagLabel,
    labels.fastArenaMfeTagLabel,
    labels.fastArenaObserveMarkLabel,
    labels.fastArenaSellHotkeyLabel,
    labels.riskDisciplineBaselineGuideTagLabel,
    labels.riskDisciplineCostGuideTagLabel,
    lockedDecisionSelection,
    onSyncChartQuestion,
    questionBars,
    questionStartIndex,
    riskBaselineCostPrice,
    riskCostPriceNow,
    tradeActions,
    view,
  ]);

  useEffect(
    () => () => {
      onSyncChartQuestionRef.current?.(null);
    },
    [],
  );
};
