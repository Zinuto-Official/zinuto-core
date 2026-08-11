// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { useCallback, useMemo } from "react";
import { resolveCssTokenColor } from "@/workspaces/challenge-stats/charts/echartSurface";
import type { Bar } from "@/domains/training/types";
import type {
  AppUiLanguage,
  SpecialTrainingModeDefinition,
} from "@/ui/config/uiConfig";
import {
  formatFastDecisionCapitalAmount,
  formatFastDecisionCapitalSignedAmount,
  type FastDecisionCapitalPresentationCopy,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import { readLatestFastDecisionSessionDisplayFacts } from "@/workspaces/special-training/fastDecisionSessionDisplayFacts";
import {
  readRiskDisciplineFirstActionDisplayFacts,
} from "@/workspaces/special-training/riskDisciplineSessionDisplayFacts";
import {
  formatRoundedSignedPercent,
  formatTemplate,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionChoice,
  FastDecisionSessionDirectionStat,
  FastDecisionSessionMetricTone,
  FastDecisionSessionReviewItem,
  SessionReviewItem,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import { buildFastDecisionSessionReviewItems } from "@/workspaces/special-training/view-models/specialTrainingSessionReviewItemsViewModel";
import { composeSelectedSessionReviewChips } from "@/workspaces/special-training/view-models/specialTrainingSessionReviewChipsViewModel";
import { useSpecialTrainingRiskSessionPanelsViewModel } from "@/workspaces/special-training/view-models/useSpecialTrainingRiskSessionSettlementViewModel";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type UseSpecialTrainingSessionSettlementViewModelInput = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  view: SpecialTrainingView;
  activeMode: SpecialTrainingModeDefinition | undefined;
  sessionSettlements: SettlementResult[];
  questions: SpecialTrainingQuestion[];
  basePeriod: string | null | undefined;
  selectedSessionReviewIndex: number | null;
  textDoubleDash: string;
  resolveQuestionEffectiveTrainingTimeframe: (
    question: SpecialTrainingQuestion,
    bars: Bar[],
  ) => BaseTimeframe | null;
};

export const useSpecialTrainingSessionPanelsViewModel = ({
  language,
  content,
  view,
  activeMode,
  sessionSettlements,
  questions,
  basePeriod,
  selectedSessionReviewIndex,
  textDoubleDash,
  resolveQuestionEffectiveTrainingTimeframe,
}: UseSpecialTrainingSessionSettlementViewModelInput) => {
  const fastDecisionSessionDisplayFacts = useMemo(
    () => readLatestFastDecisionSessionDisplayFacts(sessionSettlements),
    [sessionSettlements],
  );
  const fastDecisionCapitalCopy = useMemo<FastDecisionCapitalPresentationCopy>(
    () => ({
      fastDecisionCapitalInitialLabel: content.fastDecisionCapitalInitialLabel,
      fastDecisionCapitalHighWaterLabel:
        content.fastDecisionCapitalHighWaterLabel,
      fastDecisionCapitalDrawdownLabel: content.fastDecisionCapitalDrawdownLabel,
      fastDecisionCapitalFinalLabel: content.fastDecisionCapitalFinalLabel,
      fastDecisionCapitalHighWaterShortLabel:
        content.fastDecisionCapitalHighWaterShortLabel,
      fastDecisionCapitalDrawdownShortLabel:
        content.fastDecisionCapitalDrawdownShortLabel,
      fastDecisionCapitalFinalShortLabel:
        content.fastDecisionCapitalFinalShortLabel,
      fastDecisionCapitalCompactMinutesTemplate:
        content.fastDecisionCapitalCompactMinutesTemplate,
      fastDecisionCapitalCompactHoursTemplate:
        content.fastDecisionCapitalCompactHoursTemplate,
      fastDecisionCapitalCompactDaysTemplate:
        content.fastDecisionCapitalCompactDaysTemplate,
      fastDecisionCapitalCompactBarsTemplate:
        content.fastDecisionCapitalCompactBarsTemplate,
      fastDecisionCapitalTimingMinutesTemplate:
        content.fastDecisionCapitalTimingMinutesTemplate,
      fastDecisionCapitalTimingHoursTemplate:
        content.fastDecisionCapitalTimingHoursTemplate,
      fastDecisionCapitalTimingDaysTemplate:
        content.fastDecisionCapitalTimingDaysTemplate,
      fastDecisionCapitalTimingBarsTemplate:
        content.fastDecisionCapitalTimingBarsTemplate,
    }),
    [
      content.fastDecisionCapitalDrawdownLabel,
      content.fastDecisionCapitalDrawdownShortLabel,
      content.fastDecisionCapitalFinalLabel,
      content.fastDecisionCapitalFinalShortLabel,
      content.fastDecisionCapitalCompactBarsTemplate,
      content.fastDecisionCapitalCompactDaysTemplate,
      content.fastDecisionCapitalCompactHoursTemplate,
      content.fastDecisionCapitalCompactMinutesTemplate,
      content.fastDecisionCapitalHighWaterLabel,
      content.fastDecisionCapitalHighWaterShortLabel,
      content.fastDecisionCapitalInitialLabel,
      content.fastDecisionCapitalTimingBarsTemplate,
      content.fastDecisionCapitalTimingDaysTemplate,
      content.fastDecisionCapitalTimingHoursTemplate,
      content.fastDecisionCapitalTimingMinutesTemplate,
    ],
  );
  const fastDecisionSessionCapitalSummary =
    fastDecisionSessionDisplayFacts.capitalSummary;

  const resolveFastChoiceLabel = useCallback(
    (choice: FastDecisionChoice): string => {
      if (choice === "LONG") {
        return content.fastDecisionDirectionLongLabel;
      }
      if (choice === "SHORT") {
        return content.fastDecisionDirectionShortLabel;
      }
      return content.decisionObserveLabel;
    },
    [
      content.decisionObserveLabel,
      content.fastDecisionDirectionLongLabel,
      content.fastDecisionDirectionShortLabel,
    ],
  );
  const resolveFastTrendLabel = useCallback(
    (choice: FastDecisionChoice): string => {
      if (choice === "LONG") {
        return content.fastDecisionTrendBullLabel;
      }
      if (choice === "SHORT") {
        return content.fastDecisionTrendBearLabel;
      }
      return content.decisionObserveLabel;
    },
    [
      content.decisionObserveLabel,
      content.fastDecisionTrendBearLabel,
      content.fastDecisionTrendBullLabel,
    ],
  );
  const fastDecisionGradeDisplay = useMemo(
    () => fastDecisionSessionDisplayFacts.presentation.grade,
    [fastDecisionSessionDisplayFacts.presentation.grade],
  );
  const fastDecisionSessionGradeTone =
    fastDecisionSessionDisplayFacts.presentation.gradeTone;
  const fastDecisionSessionCommentary = useMemo(() => {
    const presentation = fastDecisionSessionDisplayFacts.presentation.commentary;
    const speedLabel =
      presentation.speedCode === "RAPID"
        ? content.sessionSettlementSpeedRapidLabel
        : presentation.speedCode === "STEADY"
          ? content.sessionSettlementSpeedSteadyLabel
          : content.sessionSettlementSpeedMeasuredLabel;
    const accuracyLabel =
      presentation.accuracyCode === "SHARP"
        ? content.sessionSettlementAccuracySharpLabel
        : presentation.accuracyCode === "OKAY"
          ? content.sessionSettlementAccuracyOkayLabel
          : content.sessionSettlementAccuracyWeakLabel;
    const template =
      presentation.templateCode === "POSITIVE"
        ? content.sessionSettlementCommentaryPositiveTemplate
        : presentation.templateCode === "NEUTRAL"
          ? content.sessionSettlementCommentaryNeutralTemplate
          : content.sessionSettlementCommentaryContrastTemplate;
    return formatTemplate(template, [speedLabel, accuracyLabel]);
  }, [
    content.sessionSettlementAccuracyOkayLabel,
    content.sessionSettlementAccuracySharpLabel,
    content.sessionSettlementAccuracyWeakLabel,
    content.sessionSettlementCommentaryContrastTemplate,
    content.sessionSettlementCommentaryNeutralTemplate,
    content.sessionSettlementCommentaryPositiveTemplate,
    content.sessionSettlementSpeedMeasuredLabel,
    content.sessionSettlementSpeedRapidLabel,
    content.sessionSettlementSpeedSteadyLabel,
    fastDecisionSessionDisplayFacts.presentation.commentary,
  ]);
  const fastDecisionSessionDecisionMetricTone: FastDecisionSessionMetricTone =
    fastDecisionSessionDisplayFacts.presentation.decisionMetricTone;
  const fastDecisionSessionDirectionStats = useMemo<
    FastDecisionSessionDirectionStat[]
  >(
    () =>
      fastDecisionSessionDisplayFacts.presentation.directionStats.map((item) => ({
        ...item,
        label:
          item.id === "OBSERVE"
            ? content.decisionObserveLabel
            : resolveFastChoiceLabel(item.id),
      })),
    [
      content.decisionObserveLabel,
      fastDecisionSessionDisplayFacts.presentation.directionStats,
      resolveFastChoiceLabel,
    ],
  );
  const fastDecisionSessionBiasSummary = useMemo(() => {
    if (fastDecisionSessionDisplayFacts.presentation.biasCode === "LONG") {
      return content.sessionSettlementBiasLongSummary;
    }
    if (fastDecisionSessionDisplayFacts.presentation.biasCode === "SHORT") {
      return content.sessionSettlementBiasShortSummary;
    }
    if (fastDecisionSessionDisplayFacts.presentation.biasCode === "OBSERVE") {
      return content.sessionSettlementBiasObserveSummary;
    }
    return content.sessionSettlementBiasBalancedSummary;
  }, [
    fastDecisionSessionDisplayFacts.presentation.biasCode,
    content.sessionSettlementBiasBalancedSummary,
    content.sessionSettlementBiasLongSummary,
    content.sessionSettlementBiasObserveSummary,
    content.sessionSettlementBiasShortSummary,
  ]);
  const fastDecisionSessionCapitalSummaryLine = useMemo(
    () =>
      formatTemplate(content.fastDecisionCapitalSessionSummaryTemplate, [
        formatFastDecisionCapitalAmount(
          fastDecisionSessionCapitalSummary.initialAsset,
        ),
        formatFastDecisionCapitalAmount(
          fastDecisionSessionCapitalSummary.totalInvested,
        ),
        formatFastDecisionCapitalSignedAmount(
          fastDecisionSessionCapitalSummary.aggregatePnl,
        ),
        formatRoundedSignedPercent(
          fastDecisionSessionCapitalSummary.aggregateReturnRate,
        ),
      ]),
    [
      content.fastDecisionCapitalSessionSummaryTemplate,
      fastDecisionSessionCapitalSummary.aggregatePnl,
      fastDecisionSessionCapitalSummary.aggregateReturnRate,
      fastDecisionSessionCapitalSummary.initialAsset,
      fastDecisionSessionCapitalSummary.totalInvested,
    ],
  );
  const {
    riskDisciplineSessionSummary,
    riskReviewAlphaVsHold,
    riskReviewAlphaVsHardStop,
    riskDisciplineSessionGrade,
    riskDisciplineSessionGradeTone,
    riskDisciplineSessionCommentary,
    riskDisciplineSessionAlphaMetricTone,
    riskDisciplineSessionBehaviorInsight,
    riskDisciplineSessionBehaviorRows,
    riskDisciplineSessionReviewItems,
  } = useSpecialTrainingRiskSessionPanelsViewModel({
    content,
    view,
    sessionSettlements,
    questions,
    basePeriod,
    textDoubleDash,
    resolveQuestionEffectiveTrainingTimeframe,
  });
  const fastDecisionSessionReviewItems = useMemo<
    FastDecisionSessionReviewItem[]
  >(() => {
    return buildFastDecisionSessionReviewItems({
      language,
      view,
      sessionSettlements,
      questions,
      basePeriod,
      labels: {
        sessionSettlementReviewQuestionTemplate:
          content.sessionSettlementReviewQuestionTemplate,
        sessionSettlementReviewDecisionTimeTemplate:
          content.sessionSettlementReviewDecisionTimeTemplate,
        sessionSettlementReviewSelectionTemplate:
          content.sessionSettlementReviewSelectionTemplate,
        sessionSettlementReviewActualTemplate:
          content.sessionSettlementReviewActualTemplate,
        sessionSettlementReviewOutcomeTemplate:
          content.sessionSettlementReviewOutcomeTemplate,
        sessionSettlementReviewPassLabel: content.sessionSettlementReviewPassLabel,
        sessionSettlementReviewMissLabel: content.sessionSettlementReviewMissLabel,
        sessionSettlementReviewFailLabel: content.sessionSettlementReviewFailLabel,
        fastArenaSecondUnitLabel: content.fastArenaSecondUnitLabel,
        fastArenaObserveMarkLabel: content.fastArenaObserveMarkLabel,
        fastArenaBuyHotkeyLabel: content.fastArenaBuyHotkeyLabel,
        fastArenaSellHotkeyLabel: content.fastArenaSellHotkeyLabel,
        decisionDirectionUpLabel: content.decisionDirectionUpLabel,
        decisionDirectionDownLabel: content.decisionDirectionDownLabel,
        decisionObserveLabel: content.decisionObserveLabel,
        fastArenaMfeTagLabel: content.fastArenaMfeTagLabel,
        fastArenaMaeTagLabel: content.fastArenaMaeTagLabel,
      },
      resolveFastChoiceLabel,
      resolveFastTrendLabel,
      resolveQuestionEffectiveTrainingTimeframe,
    });
  }, [
    basePeriod,
    content,
    language,
    questions,
    resolveFastChoiceLabel,
    resolveFastTrendLabel,
    resolveQuestionEffectiveTrainingTimeframe,
    sessionSettlements,
    view,
  ]);
  const sessionReviewItems = useMemo<SessionReviewItem[]>(
    () =>
      activeMode?.id === "risk-discipline-training"
        ? riskDisciplineSessionReviewItems
        : fastDecisionSessionReviewItems,
    [
      activeMode?.id,
      fastDecisionSessionReviewItems,
      riskDisciplineSessionReviewItems,
    ],
  );
  const selectedSessionReviewItem =
    selectedSessionReviewIndex === null
      ? null
      : sessionReviewItems[selectedSessionReviewIndex] ?? null;
  const selectedSessionReviewSettlement =
    selectedSessionReviewIndex === null
      ? null
      : sessionSettlements[selectedSessionReviewIndex] ?? null;
  const selectedSessionReviewSummaryChips = useMemo<
    ReplayContextSummaryChip[]
  >(() => {
    return composeSelectedSessionReviewChips({
      language,
      selectedSessionReviewItem,
      selectedSessionReviewSettlement,
      labels: {
        challengeDashboardRiskFirstActionBarsLabel:
          content.challengeDashboardRiskFirstActionBarsLabel,
        challengeDashboardRiskFirstActionBarsTemplate:
          content.challengeDashboardRiskFirstActionBarsTemplate,
        metricTotalAssetLabel: content.metricTotalAssetLabel,
        statusFloatingLabel: content.statusFloatingLabel,
        metricAlphaLabel: content.metricAlphaLabel,
        metricGradeLabel: content.metricGradeLabel,
        metricMaxDrawdownLabel: content.metricMaxDrawdownLabel,
        decisionSelectedLabel: content.decisionSelectedLabel,
        decisionActualLabel: content.decisionActualLabel,
        metricAvgDecisionSecondsLabel: content.metricAvgDecisionSecondsLabel,
        fastArenaSecondUnitLabel: content.fastArenaSecondUnitLabel,
        fastArenaMfeTagLabel: content.fastArenaMfeTagLabel,
        fastArenaMaeTagLabel: content.fastArenaMaeTagLabel,
        fastDecisionRatioLabel: content.fastDecisionRatioLabel,
        fastDecisionMfeMaeInfinityValue: content.fastDecisionMfeMaeInfinityValue,
      },
      resolveFastChoiceLabel,
      resolveFastTrendLabel,
      resolveRiskDisciplineFirstAction:
        readRiskDisciplineFirstActionDisplayFacts,
    });
  }, [
    content,
    language,
    resolveFastChoiceLabel,
    resolveFastTrendLabel,
    selectedSessionReviewItem,
    selectedSessionReviewSettlement,
  ]);
  return {
    fastDecisionSessionSummary: fastDecisionSessionDisplayFacts,
    fastDecisionCapitalCopy,
    fastDecisionSessionCapitalSummary,
    riskDisciplineSessionSummary,
    riskReviewAlphaVsHold,
    riskReviewAlphaVsHardStop,
    riskAlphaVsHoldLabel: content.riskDisciplineRealityCheckVsHoldLabel,
    riskAlphaVsHardStopLabel: content.riskDisciplineRealityCheckVsHardStopLabel,
    riskCurveUserColor: resolveCssTokenColor("--primary"),
    performancePositiveColor: resolveCssTokenColor("--price-up-color"),
    performanceNegativeColor: resolveCssTokenColor("--price-down-color"),
    fastDecisionFinalAnchorColor: resolveCssTokenColor("--warning"),
    tradeBuyDirectionColor: resolveCssTokenColor("--trade-buy-color"),
    tradeSellDirectionColor: resolveCssTokenColor("--trade-sell-color"),
    fastDecisionReviewTextColor: resolveCssTokenColor("--text-strong"),
    resolveFastChoiceLabel,
    resolveFastTrendLabel,
    fastDecisionSessionGrade: fastDecisionGradeDisplay,
    fastDecisionSessionGradeTone,
    fastDecisionSessionCommentary,
    fastDecisionSessionDecisionMetricTone,
    fastDecisionSessionDirectionStats,
    fastDecisionSessionBiasSummary,
    fastDecisionSessionCapitalSummaryLine,
    riskDisciplineSessionGrade,
    riskDisciplineSessionGradeTone,
    riskDisciplineSessionCommentary,
    riskDisciplineSessionAlphaMetricTone,
    riskDisciplineSessionBehaviorInsight,
    riskDisciplineSessionBehaviorRows,
    fastDecisionSessionReviewItems,
    riskDisciplineSessionReviewItems,
    sessionReviewItems,
    selectedSessionReviewItem,
    selectedSessionReviewSettlement,
    selectedSessionReviewSummaryChips,
  };
};
