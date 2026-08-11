// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { CSSProperties } from "react";
import type { AppIconName } from "@/assets/graphics";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type {
  AppUiLanguage,
  getSpecialTrainingPageContent,
} from "@/ui/config/uiConfig";
import {
  FAST_DECISION_RATIO_GAUGE_MAX,
  FAST_DECISION_RATIO_GAUGE_MIN,
  resolveFastDecisionRatioGaugeThreshold,
  resolveFastDecisionRatioGaugeTone,
} from "@/workspaces/special-training/fastDecisionRatioGauge";
import {
  buildFastDecisionCapitalAnchorDisplayItems,
  type FastDecisionCapitalPresentationCopy,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import {
  buildFastDecisionCapitalCurveOption,
  resolveFastDecisionCapitalTone,
} from "@/workspaces/special-training/charts/specialTrainingChartOptions";
import {
  clamp,
  formatConfigValue,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionArenaPhase,
  FastDecisionResult,
  FastDecisionReviewDetail,
  SettlementResult,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

const FAST_DECISION_CHOICE_LONG = "LONG";
const FAST_DECISION_CHOICE_SHORT = "SHORT";

type BuildSpecialTrainingFastDecisionTrainingViewModelInput = {
  language: AppUiLanguage;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  tt: (key: AppTextKey) => string;
  textSlash: string;
  textDoubleDash: string;
  currentQuestionIndex: number;
  questionCount: number;
  completedCount: number;
  passCount: number;
  decisionCount: number;
  averageDecisionSeconds: number;
  activeDecisionSecondsLimit: number;
  decisionCountdownPercent: number;
  winRate: number;
  fastDecisionPhase: FastDecisionArenaPhase;
  activeFastDecisionDirectionResult: FastDecisionResult | null;
  resolvedFastDecisionReviewDetail: FastDecisionReviewDetail | null;
  activeFastDecisionDominanceRatio: number;
  settlement: SettlementResult | null;
  activeQuestionEffectiveTrainingTimeframe: BaseTimeframe | null;
  basePeriod: DisplayPeriodKey;
  fastDecisionCapitalCopy: FastDecisionCapitalPresentationCopy;
  performancePositiveColor: string;
  performanceNegativeColor: string;
  fastDecisionReviewTextColor: string;
  fastDecisionFinalAnchorColor: string;
  questionSettledInTraining: boolean;
};

export const buildSpecialTrainingFastDecisionTrainingViewModel = ({
  language,
  content,
  tt,
  textSlash,
  textDoubleDash,
  currentQuestionIndex,
  questionCount,
  completedCount,
  passCount,
  decisionCount,
  averageDecisionSeconds,
  activeDecisionSecondsLimit,
  decisionCountdownPercent,
  winRate,
  fastDecisionPhase,
  activeFastDecisionDirectionResult,
  resolvedFastDecisionReviewDetail,
  activeFastDecisionDominanceRatio,
  settlement,
  activeQuestionEffectiveTrainingTimeframe,
  basePeriod,
  fastDecisionCapitalCopy,
  performancePositiveColor,
  performanceNegativeColor,
  fastDecisionReviewTextColor,
  fastDecisionFinalAnchorColor,
  questionSettledInTraining,
}: BuildSpecialTrainingFastDecisionTrainingViewModelInput) => {
  const showFastDecisionReview = resolvedFastDecisionReviewDetail !== null;
  const activeFastDecisionCapitalReview = settlement?.fastReview ?? null;
  const activeFastDecisionCapitalTone = activeFastDecisionCapitalReview
    ? resolveFastDecisionCapitalTone(activeFastDecisionCapitalReview.totalPnl)
    : "flat";
  const activeFastDecisionCapitalBaseTimeframe =
    activeQuestionEffectiveTrainingTimeframe ??
    (basePeriod === "1m" ||
    basePeriod === "5m" ||
    basePeriod === "1h" ||
    basePeriod === "1d"
      ? basePeriod
      : null);
  const activeFastDecisionCapitalAnchorItems = activeFastDecisionCapitalReview
    ? buildFastDecisionCapitalAnchorDisplayItems({
        anchors: activeFastDecisionCapitalReview.anchors,
        initialAsset: activeFastDecisionCapitalReview.initialAsset,
        baseTimeframe: activeFastDecisionCapitalBaseTimeframe,
        percentSuffix: tt("appText.percent"),
        copy: fastDecisionCapitalCopy,
      })
    : [];
  const activeFastDecisionCapitalCurveOption = activeFastDecisionCapitalReview
    ? buildFastDecisionCapitalCurveOption({
        review: activeFastDecisionCapitalReview,
        lineColor: performancePositiveColor,
        areaColor: performanceNegativeColor,
        flatColor: fastDecisionReviewTextColor,
        finalColor: fastDecisionFinalAnchorColor,
        anchorItems: activeFastDecisionCapitalAnchorItems,
      })
    : null;
  const fastDecisionReviewGaugeValue = !resolvedFastDecisionReviewDetail
    ? 0
    : resolvedFastDecisionReviewDetail.ratioIsInfinity
      ? FAST_DECISION_RATIO_GAUGE_MAX
      : clamp(
          resolvedFastDecisionReviewDetail.ratioGaugeValue,
          FAST_DECISION_RATIO_GAUGE_MIN,
          FAST_DECISION_RATIO_GAUGE_MAX,
        );
  const fastDecisionReviewGaugeThreshold =
    resolveFastDecisionRatioGaugeThreshold(
      activeFastDecisionDirectionResult?.dominanceRatio ??
        activeFastDecisionDominanceRatio,
    );
  const fastDecisionReviewGaugeTone = resolveFastDecisionRatioGaugeTone({
    ratioValue: fastDecisionReviewGaugeValue,
    dominanceRatio: fastDecisionReviewGaugeThreshold,
  });
  const fastDecisionReviewTone: "fail" | "pass" | "miss" =
    !activeFastDecisionDirectionResult
      ? "fail"
      : activeFastDecisionDirectionResult.correct
        ? "pass"
        : activeFastDecisionDirectionResult.selection === "OBSERVE" &&
            activeFastDecisionDirectionResult.actual !== "OBSERVE"
          ? "miss"
          : "fail";
  const fastDecisionReviewDirectionIconName: AppIconName =
    resolvedFastDecisionReviewDetail?.selectedChoice ===
    FAST_DECISION_CHOICE_LONG
      ? "actionArrowUp"
      : resolvedFastDecisionReviewDetail?.selectedChoice ===
          FAST_DECISION_CHOICE_SHORT
        ? "actionArrowDown"
        : "statusTarget";
  const fastDecisionReviewActualIconName: AppIconName =
    resolvedFastDecisionReviewDetail?.actualChoice ===
    FAST_DECISION_CHOICE_LONG
      ? "actionArrowUp"
      : resolvedFastDecisionReviewDetail?.actualChoice ===
          FAST_DECISION_CHOICE_SHORT
        ? "actionArrowDown"
        : "statusTarget";

  return {
    showFastDecisionDecisionControls: !showFastDecisionReview,
    showFastDecisionSettlementActions:
      showFastDecisionReview && questionSettledInTraining,
    fastDecisionReviewTone,
    fastDecisionLiveHintText:
      fastDecisionPhase === "THINKING"
        ? content.fastDecisionFocusHint
        : content.fastArenaLockedLabel,
    fastDecisionProgressValue: `${
      currentQuestionIndex + 1
    }${textSlash}${questionCount}`,
    fastDecisionProgressSegmentCount: Math.max(questionCount, 1),
    fastDecisionWinRateMeta:
      completedCount > 0
        ? `${passCount}${textSlash}${completedCount}`
        : textDoubleDash,
    fastDecisionAverageDecisionDisplay:
      decisionCount > 0
        ? formatCountWithUnitText(
            language,
            formatMoneyFixed(averageDecisionSeconds, 1),
            content.fastArenaSecondUnitLabel,
          )
        : textDoubleDash,
    fastDecisionAverageDecisionMeta:
      decisionCount > 0
        ? `${decisionCount}${textSlash}${questionCount}`
        : textDoubleDash,
    fastDecisionWinRateDialStyle: {
      "--special-training-lightning-donut-angle": `${(
        clamp(winRate, 0, 1) * 360
      ).toFixed(2)}deg`,
    } as CSSProperties,
    fastDecisionPaceMeterStyle: {
      "--special-training-lightning-pace-fill-width": `${(
        clamp(
          activeDecisionSecondsLimit > 0
            ? averageDecisionSeconds / activeDecisionSecondsLimit
            : 0,
          0,
          1,
        ) * 100
      ).toFixed(2)}%`,
    } as CSSProperties,
    fastDecisionCountdownRingStyle: {
      "--special-training-lightning-countdown-angle": `${(
        clamp(decisionCountdownPercent / 100, 0, 1) * 360
      ).toFixed(2)}deg`,
    } as CSSProperties,
    fastDecisionReviewSelectionTone:
      resolvedFastDecisionReviewDetail?.selectedChoice ===
      FAST_DECISION_CHOICE_LONG
        ? "long"
        : resolvedFastDecisionReviewDetail?.selectedChoice ===
            FAST_DECISION_CHOICE_SHORT
          ? "short"
          : "observe",
    fastDecisionReviewDirectionIconName,
    fastDecisionReviewActualTone:
      resolvedFastDecisionReviewDetail?.actualChoice ===
      FAST_DECISION_CHOICE_LONG
        ? "long"
        : resolvedFastDecisionReviewDetail?.actualChoice ===
            FAST_DECISION_CHOICE_SHORT
          ? "short"
          : "observe",
    fastDecisionReviewActualIconName,
    fastDecisionReviewGaugeTone,
    fastDecisionReviewThresholdDisplay: `${formatConfigValue(
      fastDecisionReviewGaugeThreshold,
      1,
    )}${tt("appText.message0681")}`,
    fastDecisionReviewRatioDisplay: !resolvedFastDecisionReviewDetail
      ? ""
      : resolvedFastDecisionReviewDetail.ratioIsInfinity
        ? resolvedFastDecisionReviewDetail.ratioValue
        : `${resolvedFastDecisionReviewDetail.ratioValue}${tt("appText.message0681")}`,
    activeFastDecisionCapitalReview,
    activeFastDecisionCapitalTone,
    activeFastDecisionCapitalAnchorItems,
    activeFastDecisionCapitalCurveOption,
  };
};
