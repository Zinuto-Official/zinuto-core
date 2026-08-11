// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { useMemo } from "react";
import type { Bar } from "@/domains/training/types";
import {
  readLatestRiskDisciplineSessionDisplayFacts,
  readRiskDisciplineFirstActionDisplayFacts,
  type RiskDisciplineBehaviorType,
} from "@/workspaces/special-training/riskDisciplineSessionDisplayFacts";
import {
  formatPercent,
  formatTemplate,
  normalizeAlphaAsRatio,
  readRiskCurvePoint,
  resolveFirstCurveValue,
  toNullableFiniteNumber,
  toNullableTrimmedString,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionSessionMetricTone,
  RiskDisciplineSessionReviewItem,
  RiskSettlementCurveViewModel,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import { buildRiskDisciplineSessionReviewItems } from "@/workspaces/special-training/view-models/specialTrainingSessionReviewItemsViewModel";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type UseSpecialTrainingRiskSessionSettlementViewModelInput = {
  content: SpecialTrainingPageContent;
  view: SpecialTrainingView;
  sessionSettlements: SettlementResult[];
  questions: SpecialTrainingQuestion[];
  basePeriod: string | null | undefined;
  textDoubleDash: string;
  resolveQuestionEffectiveTrainingTimeframe: (
    question: SpecialTrainingQuestion,
    bars: Bar[],
  ) => BaseTimeframe | null;
};

export const useSpecialTrainingRiskSessionPanelsViewModel = ({
  content,
  view,
  sessionSettlements,
  questions,
  basePeriod,
  textDoubleDash,
  resolveQuestionEffectiveTrainingTimeframe,
}: UseSpecialTrainingRiskSessionSettlementViewModelInput) => {
  const riskDisciplineSessionDisplayFacts = useMemo(
    () => readLatestRiskDisciplineSessionDisplayFacts(sessionSettlements),
    [sessionSettlements],
  );
  const riskReview = sessionSettlements.at(-1)?.riskReview ?? null;
  const riskReviewAlphaVsHoldRaw = toNullableFiniteNumber(
    riskReview?.alphaVsHold,
  );
  const riskReviewAlphaVsHardStopRaw = toNullableFiniteNumber(
    riskReview?.alphaVsHardStop,
  );
  const riskSettlementCurve =
    useMemo<RiskSettlementCurveViewModel | null>(() => {
      const curveSource = riskReview?.equityCurves;
      if (!curveSource) {
        return null;
      }
      const labelsRaw = Array.isArray(curveSource.labels)
        ? curveSource.labels
        : [];
      const userRaw = Array.isArray(curveSource.user) ? curveSource.user : [];
      const holdRaw = Array.isArray(curveSource.hold) ? curveSource.hold : [];
      const hardStopRaw = Array.isArray(curveSource.hardStop)
        ? curveSource.hardStop
        : [];
      const length = Math.max(
        labelsRaw.length,
        userRaw.length,
        holdRaw.length,
        hardStopRaw.length,
      );
      if (length <= 0) {
        return null;
      }

      const barIndexSet = new Set<number>();
      const appendBarIndex = (curve: unknown[]) => {
        curve.forEach((item, index) => {
          const point = readRiskCurvePoint(item);
          const pointIndex = point.barIndex ?? index;
          if (Number.isFinite(pointIndex)) {
            barIndexSet.add(Math.max(0, pointIndex));
          }
        });
      };
      appendBarIndex(userRaw);
      appendBarIndex(holdRaw);
      appendBarIndex(hardStopRaw);
      if (!barIndexSet.size) {
        for (let index = 0; index < length; index += 1) {
          barIndexSet.add(index);
        }
      }
      const barIndexes = Array.from(barIndexSet.values()).sort(
        (left, right) => left - right,
      );
      const indexByBar = new Map<number, number>();
      barIndexes.forEach((barIndex, index) => {
        indexByBar.set(barIndex, index);
      });
      const normalizeCurve = (curve: unknown[]): Array<number | null> => {
        const normalized = Array.from(
          { length: barIndexes.length },
          () => null as number | null,
        );
        curve.forEach((item, index) => {
          const point = readRiskCurvePoint(item);
          const barIndex = point.barIndex ?? index;
          const targetIndex = indexByBar.get(Math.max(0, barIndex));
          if (targetIndex === undefined) {
            return;
          }
          normalized[targetIndex] = point.asset;
        });
        return normalized;
      };
      const labels = barIndexes.map(
        (barIndex, index) =>
          toNullableTrimmedString(labelsRaw[index]) ?? String(barIndex),
      );

      return {
        labels,
        userCurve: normalizeCurve(userRaw),
        holdCurve: normalizeCurve(holdRaw),
        hardStopCurve: normalizeCurve(hardStopRaw),
      };
    }, [riskReview?.equityCurves]);
  const riskSettlementInitialAsset = useMemo(
    () =>
      riskSettlementCurve
        ? resolveFirstCurveValue(riskSettlementCurve.userCurve)
        : null,
    [riskSettlementCurve],
  );
  const riskReviewAlphaVsHold = useMemo(
    () =>
      normalizeAlphaAsRatio(
        riskReviewAlphaVsHoldRaw,
        riskSettlementInitialAsset,
      ),
    [riskReviewAlphaVsHoldRaw, riskSettlementInitialAsset],
  );
  const riskReviewAlphaVsHardStop = useMemo(
    () =>
      normalizeAlphaAsRatio(
        riskReviewAlphaVsHardStopRaw,
        riskSettlementInitialAsset,
      ),
    [riskReviewAlphaVsHardStopRaw, riskSettlementInitialAsset],
  );
  const riskBehaviorLabelMap = useMemo<
    Record<RiskDisciplineBehaviorType, string>
  >(
    () => ({
      CUT_LOSS: content.challengeDashboardRiskBehaviorCutLabel,
      ADD_POSITION: content.challengeDashboardRiskBehaviorAddLabel,
      FREEZE: content.challengeDashboardRiskBehaviorFreezeLabel,
    }),
    [
      content.challengeDashboardRiskBehaviorAddLabel,
      content.challengeDashboardRiskBehaviorCutLabel,
      content.challengeDashboardRiskBehaviorFreezeLabel,
    ],
  );
  const riskDisciplineGradeDisplay =
    riskDisciplineSessionDisplayFacts.presentation.grade;
  const riskDisciplineSessionGradeTone =
    riskDisciplineSessionDisplayFacts.presentation.gradeTone;
  const riskDisciplineSessionCommentary = useMemo(() => {
    if (
      riskDisciplineSessionDisplayFacts.presentation.commentaryCode ===
      "RISK_RESCUE"
    ) {
      return content.challengeBattleTagRiskRescueLabel;
    }
    return content.challengeBattleTagRiskOvertradeLabel;
  }, [
    content.challengeBattleTagRiskOvertradeLabel,
    content.challengeBattleTagRiskRescueLabel,
    riskDisciplineSessionDisplayFacts.presentation.commentaryCode,
  ]);
  const riskDisciplineSessionAlphaMetricTone: FastDecisionSessionMetricTone =
    riskDisciplineSessionDisplayFacts.presentation.alphaMetricTone;
  const riskDisciplineSessionBehaviorRows = useMemo(
    () =>
      riskDisciplineSessionDisplayFacts.presentation.behaviorRows.map((item) => ({
        ...item,
        label: riskBehaviorLabelMap[item.behavior],
      })),
    [
      riskBehaviorLabelMap,
      riskDisciplineSessionDisplayFacts.presentation.behaviorRows,
    ],
  );
  const riskDisciplineSessionBehaviorInsight = useMemo(() => {
    const insight = riskDisciplineSessionDisplayFacts.presentation.behaviorInsight;
    if (insight.code !== "DEATH_RATE_FOCUS" || !insight.focusBehavior) {
      return content.challengeDashboardRiskFirstActionSubtitle;
    }
    const focusLabel = riskBehaviorLabelMap[insight.focusBehavior];
    return formatTemplate(
      content.challengeDashboardRiskBehaviorDeathRateTemplate,
      [focusLabel, formatPercent(insight.deathRate ?? 0)],
    );
  }, [
    content.challengeDashboardRiskBehaviorDeathRateTemplate,
    content.challengeDashboardRiskFirstActionSubtitle,
    riskBehaviorLabelMap,
    riskDisciplineSessionDisplayFacts.presentation.behaviorInsight,
  ]);
  const riskDisciplineSessionReviewItems = useMemo<
    RiskDisciplineSessionReviewItem[]
  >(() => {
    return buildRiskDisciplineSessionReviewItems({
      view,
      sessionSettlements,
      questions,
      basePeriod,
      labels: {
        settlementPassLabel: content.settlementPassLabel,
        settlementFailLabel: content.settlementFailLabel,
        challengeBattleTagRiskRescueLabel:
          content.challengeBattleTagRiskRescueLabel,
        challengeBattleTagRiskOvertradeLabel:
          content.challengeBattleTagRiskOvertradeLabel,
        challengeBattleResultGradeTemplate:
          content.challengeBattleResultGradeTemplate,
        challengeDashboardRiskContextTemplate:
          content.challengeDashboardRiskContextTemplate,
        challengeDashboardRiskFirstActionBarsTemplate:
          content.challengeDashboardRiskFirstActionBarsTemplate,
        metricAlphaLabel: content.metricAlphaLabel,
        statusFloatingLabel: content.statusFloatingLabel,
        sessionSettlementReviewQuestionTemplate:
          content.sessionSettlementReviewQuestionTemplate,
        riskDisciplineBaselineGuideTagLabel:
          content.riskDisciplineBaselineGuideTagLabel,
        riskDisciplineCostGuideTagLabel:
          content.riskDisciplineCostGuideTagLabel,
      },
      riskBehaviorLabelMap,
      textDoubleDash,
      resolveQuestionEffectiveTrainingTimeframe,
      resolveRiskDisciplineFirstAction:
        readRiskDisciplineFirstActionDisplayFacts,
    });
  }, [
    basePeriod,
    content,
    questions,
    resolveQuestionEffectiveTrainingTimeframe,
    riskBehaviorLabelMap,
    sessionSettlements,
    textDoubleDash,
    view,
  ]);

  return {
    riskDisciplineSessionSummary: riskDisciplineSessionDisplayFacts,
    riskReviewAlphaVsHold,
    riskReviewAlphaVsHardStop,
    riskDisciplineSessionGrade: riskDisciplineGradeDisplay,
    riskDisciplineSessionGradeTone,
    riskDisciplineSessionCommentary,
    riskDisciplineSessionAlphaMetricTone,
    riskDisciplineSessionBehaviorInsight,
    riskDisciplineSessionBehaviorRows,
    riskDisciplineSessionReviewItems,
  };
};
