// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { resolveBarsBaseTimeframe } from "@/domains/data-import/baseTimeframeInference";
import { buildSessionReviewSparklineWindow } from "@/workspaces/special-training/charts/specialTrainingChartOptions";
import type { Bar } from "@/domains/training/types";
import { formatMoney, formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import {
  clamp,
  formatPercentFixed,
  formatSigned,
  formatTemplate,
  toFiniteNumber,
  toNullableFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionChoice,
  FastDecisionSessionReviewItem,
  FastDecisionSessionReviewMarketTone,
  FastDecisionSessionReviewTone,
  RiskDisciplineSessionReviewItem,
  SettlementResult,
  SpecialTrainingQuestion,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type { RiskDisciplineBehaviorType } from "@/workspaces/special-training/riskDisciplineSessionDisplayFacts";
import { buildFastDecisionReplayOverlayContext } from "@/workspaces/special-training/view-models/specialTrainingReplayOverlayViewModel";

type FastDecisionSessionReviewLabels = {
  sessionSettlementReviewQuestionTemplate: string;
  sessionSettlementReviewDecisionTimeTemplate: string;
  sessionSettlementReviewSelectionTemplate: string;
  sessionSettlementReviewActualTemplate: string;
  sessionSettlementReviewOutcomeTemplate: string;
  sessionSettlementReviewPassLabel: string;
  sessionSettlementReviewMissLabel: string;
  sessionSettlementReviewFailLabel: string;
  fastArenaSecondUnitLabel: string;
  fastArenaObserveMarkLabel: string;
  fastArenaBuyHotkeyLabel: string;
  fastArenaSellHotkeyLabel: string;
  decisionDirectionUpLabel: string;
  decisionDirectionDownLabel: string;
  decisionObserveLabel: string;
  fastArenaMfeTagLabel: string;
  fastArenaMaeTagLabel: string;
};

type BuildFastDecisionSessionReviewItemsParams = {
  language: AppUiLanguage;
  view: "MODE_PICKER" | "TRAINING" | "SETTLEMENT";
  sessionSettlements: SettlementResult[];
  questions: SpecialTrainingQuestion[];
  basePeriod: string | null | undefined;
  labels: FastDecisionSessionReviewLabels;
  resolveFastChoiceLabel: (choice: FastDecisionChoice) => string;
  resolveFastTrendLabel: (choice: FastDecisionChoice) => string;
  resolveQuestionEffectiveTrainingTimeframe: (
    question: SpecialTrainingQuestion,
    bars: Bar[],
  ) => BaseTimeframe | null;
};

export const buildFastDecisionSessionReviewItems = ({
  language,
  view,
  sessionSettlements,
  questions,
  basePeriod,
  labels,
  resolveFastChoiceLabel,
  resolveFastTrendLabel,
  resolveQuestionEffectiveTrainingTimeframe,
}: BuildFastDecisionSessionReviewItemsParams): FastDecisionSessionReviewItem[] => {
  if (view !== "SETTLEMENT") {
    return [];
  }
  return sessionSettlements.flatMap((item, index) => {
    const question = questions[index];
    const directionResult = item.directionResult;
    if (!question || !directionResult) {
      return [];
    }
    const bars = Array.isArray(question.bars) ? question.bars : [];
    if (!bars.length) {
      return [];
    }
    const startIndex = clamp(
      Math.floor(toFiniteNumber(question.startIndex) || 0),
      0,
      Math.max(0, bars.length - 1),
    );
    const revealEndIndex = clamp(
      Math.floor(toFiniteNumber(directionResult.revealEndIndex) || startIndex),
      startIndex,
      Math.max(startIndex, bars.length - 1),
    );
    const closeSeries = bars
      .slice(0, revealEndIndex + 1)
      .map((bar) => toFiniteNumber(bar.close));
    const { sparkline, markerOffset: sparklineDecisionBoundaryOffset } =
      buildSessionReviewSparklineWindow(closeSeries, startIndex, revealEndIndex);
    const tone: FastDecisionSessionReviewTone = item.passed
      ? "pass"
      : directionResult.selection === "OBSERVE" &&
          directionResult.actual !== "OBSERVE"
        ? "miss"
        : "fail";
    const marketTone: FastDecisionSessionReviewMarketTone =
      directionResult.actual === "LONG"
        ? "up"
        : directionResult.actual === "SHORT"
          ? "down"
          : "flat";
    const verdictLabel =
      tone === "pass"
        ? labels.sessionSettlementReviewPassLabel
        : tone === "miss"
          ? labels.sessionSettlementReviewMissLabel
          : labels.sessionSettlementReviewFailLabel;
    const selectionMarkerLabel =
      directionResult.selection === "LONG"
        ? labels.fastArenaBuyHotkeyLabel
        : directionResult.selection === "SHORT"
          ? labels.fastArenaSellHotkeyLabel
          : labels.fastArenaObserveMarkLabel;
    const resolvedBaseTimeframe: BaseTimeframe | null =
      resolveQuestionEffectiveTrainingTimeframe(question, bars) ??
      resolveBarsBaseTimeframe(bars) ??
      null;
    const resolvedTimeframe = resolvedBaseTimeframe ?? String(basePeriod || "");

    return [
      {
        kind: "fast",
        id: question.id,
        questionId: question.id,
        questionLabel: formatTemplate(labels.sessionSettlementReviewQuestionTemplate, [
          index + 1,
        ]),
        symbol: String(question.symbol || "").trim().toUpperCase(),
        timeframeLabel: resolvedTimeframe,
        baseTimeframe: resolvedBaseTimeframe,
        decisionTimeLabel: formatTemplate(
          labels.sessionSettlementReviewDecisionTimeTemplate,
          [
            formatCountWithUnitText(
              language,
              formatMoney(directionResult.decisionSecondsUsed, 2),
              labels.fastArenaSecondUnitLabel,
            ),
          ],
        ),
        selectionLabel: formatTemplate(labels.sessionSettlementReviewSelectionTemplate, [
          resolveFastChoiceLabel(directionResult.selection),
        ]),
        actualLabel: formatTemplate(labels.sessionSettlementReviewActualTemplate, [
          resolveFastTrendLabel(directionResult.actual),
        ]),
        selection: directionResult.selection,
        actual: directionResult.actual,
        timedOut: directionResult.timedOut,
        correct: directionResult.correct,
        tone,
        marketTone,
        verdictLabel,
        verdictSummary: formatTemplate(labels.sessionSettlementReviewOutcomeTemplate, [
          resolveFastChoiceLabel(directionResult.selection),
          resolveFastTrendLabel(directionResult.actual),
        ]),
        bars,
        startIndex,
        revealEndIndex,
        sparkline,
        sparklineDecisionBoundaryOffset,
        fastReview: item.fastReview ?? null,
        specialTraining: buildFastDecisionReplayOverlayContext({
          bars,
          startIndex,
          revealEndIndex,
          directionResult,
          selectionLabel: selectionMarkerLabel,
          buyLabel: labels.decisionDirectionUpLabel,
          sellLabel: labels.decisionDirectionDownLabel,
          observeLabel: labels.decisionObserveLabel,
          mfeLabel: labels.fastArenaMfeTagLabel,
          maeLabel: labels.fastArenaMaeTagLabel,
        }),
      },
    ];
  });
};

type RiskDisciplineSessionReviewLabels = {
  settlementPassLabel: string;
  settlementFailLabel: string;
  challengeBattleTagRiskRescueLabel: string;
  challengeBattleTagRiskOvertradeLabel: string;
  challengeBattleResultGradeTemplate: string;
  challengeDashboardRiskContextTemplate: string;
  challengeDashboardRiskFirstActionBarsTemplate: string;
  metricAlphaLabel: string;
  statusFloatingLabel: string;
  sessionSettlementReviewQuestionTemplate: string;
  riskDisciplineBaselineGuideTagLabel: string;
  riskDisciplineCostGuideTagLabel: string;
};

type BuildRiskDisciplineSessionReviewItemsParams = {
  view: "MODE_PICKER" | "TRAINING" | "SETTLEMENT";
  sessionSettlements: SettlementResult[];
  questions: SpecialTrainingQuestion[];
  basePeriod: string | null | undefined;
  labels: RiskDisciplineSessionReviewLabels;
  riskBehaviorLabelMap: Record<RiskDisciplineBehaviorType, string>;
  textDoubleDash: string;
  resolveQuestionEffectiveTrainingTimeframe: (
    question: SpecialTrainingQuestion,
    bars: Bar[],
  ) => BaseTimeframe | null;
  resolveRiskDisciplineFirstAction: (settlement: SettlementResult) => {
    behavior: RiskDisciplineBehaviorType;
    barsSinceStart: number;
  };
};

export const buildRiskDisciplineSessionReviewItems = ({
  view,
  sessionSettlements,
  questions,
  basePeriod,
  labels,
  riskBehaviorLabelMap,
  textDoubleDash,
  resolveQuestionEffectiveTrainingTimeframe,
  resolveRiskDisciplineFirstAction,
}: BuildRiskDisciplineSessionReviewItemsParams): RiskDisciplineSessionReviewItem[] => {
  if (view !== "SETTLEMENT") {
    return [];
  }
  return sessionSettlements.flatMap((item, index) => {
    const question = questions[index];
    if (!question) {
      return [];
    }
    const bars = Array.isArray(question.bars) ? question.bars : [];
    if (!bars.length) {
      return [];
    }
    const startIndex = clamp(
      Math.floor(toFiniteNumber(item.startIndex) || toFiniteNumber(question.startIndex) || 0),
      0,
      Math.max(0, bars.length - 1),
    );
    const settleToIndex = clamp(
      Math.floor(
        toFiniteNumber(item.settleToIndex) ||
          toFiniteNumber(question.endIndex) ||
          startIndex,
      ),
      startIndex,
      Math.max(startIndex, bars.length - 1),
    );
    const firstAction = resolveRiskDisciplineFirstAction(item);
    const passed = item.passed;
    const tone: FastDecisionSessionReviewTone = passed ? "pass" : "miss";
    const marketTone: FastDecisionSessionReviewMarketTone =
      item.totalPnl > 0 ? "up" : item.totalPnl < 0 ? "down" : "flat";
    const verdictLabel = passed
      ? labels.settlementPassLabel
      : labels.settlementFailLabel;
    const verdictSummary = passed
      ? labels.challengeBattleTagRiskRescueLabel
      : labels.challengeBattleTagRiskOvertradeLabel;
    const closeSeries = bars
      .slice(0, settleToIndex + 1)
      .map((bar) => toFiniteNumber(bar.close));
    const {
      sparkline,
      markerOffset: sparklineDecisionBoundaryOffset,
      windowStartIndex: sparklineWindowStartIndex,
    } = buildSessionReviewSparklineWindow(closeSeries, startIndex, settleToIndex);
    const tradeMarkers = (item.tradeActions ?? [])
      .map((action) => {
        const rawIndex = clamp(
          Math.floor(toFiniteNumber(action.barIndex) || 0),
          startIndex,
          settleToIndex,
        );
        const bar = bars[rawIndex];
        const markerValue =
          toFiniteNumber(action.executionPrice) > 0
            ? toFiniteNumber(action.executionPrice)
            : toFiniteNumber(bar?.close);
        return {
          side: action.type,
          rawIndex,
          value: markerValue,
        };
      })
      .filter(
        (
          marker,
        ): marker is {
          side: "BUY" | "SELL";
          rawIndex: number;
          value: number;
        } =>
          (marker.side === "BUY" || marker.side === "SELL") &&
          Number.isFinite(marker.value) &&
          marker.rawIndex >= sparklineWindowStartIndex &&
          marker.rawIndex < sparklineWindowStartIndex + sparkline.length,
      )
      .map((marker) => ({
        side: marker.side,
        offset: marker.rawIndex - sparklineWindowStartIndex,
        value: marker.value,
      }));
    const alphaLabel =
      item.alpha === null
        ? `${labels.metricAlphaLabel} ${textDoubleDash}`
        : `${labels.metricAlphaLabel} ${formatPercentFixed(item.alpha, 1)}`;
    const performanceLabel = `${labels.statusFloatingLabel} ${formatSigned(
      item.totalPnl,
    )}`;
    const firstActionBarsLabel = formatTemplate(
      labels.challengeDashboardRiskFirstActionBarsTemplate,
      [formatMoneyFixed(firstAction.barsSinceStart, 0)],
    );
    const costBasisShift = item.riskReview?.costBasisShift;
    const initialCostBasis = toNullableFiniteNumber(
      costBasisShift?.initialCostBasis ?? costBasisShift?.initialAvgCost,
    );
    const finalCostBasis = toNullableFiniteNumber(
      costBasisShift?.finalCostBasis ?? costBasisShift?.finalAvgCost,
    );
    const resolvedBaseTimeframe: BaseTimeframe | null =
      resolveQuestionEffectiveTrainingTimeframe(question, bars) ??
      resolveBarsBaseTimeframe(bars) ??
      null;
    const resolvedTimeframe = resolvedBaseTimeframe ?? String(basePeriod || "");

    return [
      {
        kind: "risk",
        id: question.id,
        questionId: question.id,
        questionLabel: formatTemplate(labels.sessionSettlementReviewQuestionTemplate, [
          index + 1,
        ]),
        symbol: String(question.symbol || "").trim().toUpperCase(),
        timeframeLabel: resolvedTimeframe,
        baseTimeframe: resolvedBaseTimeframe,
        minTradeStep: Math.max(
          1,
          Math.floor(toFiniteNumber(question.minTradeStep) || 1),
        ),
        gradeLabel: item.grade
          ? formatTemplate(labels.challengeBattleResultGradeTemplate, [item.grade])
          : textDoubleDash,
        firstActionLabel: formatTemplate(labels.challengeDashboardRiskContextTemplate, [
          firstActionBarsLabel,
          riskBehaviorLabelMap[firstAction.behavior],
        ]),
        alphaLabel,
        performanceLabel,
        tone,
        marketTone,
        verdictLabel,
        verdictSummary,
        bars,
        startIndex,
        settleToIndex,
        sparkline,
        sparklineDecisionBoundaryOffset,
        tradeMarkers,
        specialTraining: {
          decisionBoundaryRawIndex: -1,
          decisionMarker: null,
          fastDecisionExtremeRay: null,
          riskDisciplineGuides:
            initialCostBasis !== null || finalCostBasis !== null
              ? {
                  baselinePrice: initialCostBasis,
                  currentCostPrice: finalCostBasis,
                  baselineTagText: labels.riskDisciplineBaselineGuideTagLabel,
                  currentCostTagText: labels.riskDisciplineCostGuideTagLabel,
                }
              : null,
        },
      },
    ];
  });
};
