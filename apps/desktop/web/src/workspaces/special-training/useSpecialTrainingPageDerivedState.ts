// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ApiSpecialTrainingChallengeRuntime } from "@/api";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { formatQuestionBankTimeframeSummary } from "@/workspaces/special-training/session/questionBankRuntimeCore";
import { useSpecialTrainingQuestionBankRuntime } from "@/workspaces/special-training/session/useSpecialTrainingQuestionBankRuntime";
import {
  clamp,
  formatCountdownClock,
  toFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  DEFAULT_SPECIAL_TRAINING_MODE_ID,
  FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL,
  createEmptyModeQuestionBankState,
  resolveFastDecisionDominanceRatio,
  resolveFastDecisionStrictnessLevel,
  resolveRuntimeHorizonBars,
  type ModeQuestionBankStateMap,
  type SpecialTrainingModeRuntimeConfigMap,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import type {
  FastDecisionArenaPhase,
  FastDecisionStrictnessLevel,
  FastDecisionStrictnessOption,
  RuntimeState,
  SpecialTrainingQuestion,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  FAST_DECISION_CRITICAL_SECONDS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import { resolveSpecialTrainingQuestionEffectiveTimeframe } from "@/workspaces/special-training/domain/specialTrainingTimeframes";
import { useSpecialTrainingRiskDisciplineCoreViewModel } from "@/workspaces/special-training/view-models/useSpecialTrainingRiskDisciplineCoreViewModel";
import { getSpecialTrainingPageContent, type SpecialTrainingModeDefinition, type SpecialTrainingModeId } from "@/ui/config/uiConfig";

type UseSpecialTrainingPageDerivedStateArgs = {
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeModeId: SpecialTrainingModeId;
  challengeId: string;
  challengeRuntime: ApiSpecialTrainingChallengeRuntime | null;
  completedCount: number;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  currentChallengeScopeHash: string;
  currentQuestionIndex: number;
  decisionCount: number;
  decisionSecondsLeft: number;
  fastDecisionPhase: FastDecisionArenaPhase;
  formatBankTimeframeLabel: (
    timeframe: BaseTimeframe | null | undefined,
  ) => string;
  language: AppUiLanguage;
  modeQuestionBankState: ModeQuestionBankStateMap;
  modeRuntimeConfigById: SpecialTrainingModeRuntimeConfigMap;
  passCount: number;
  questionBars: SpecialTrainingQuestion["bars"];
  questions: SpecialTrainingQuestion[];
  runtime: RuntimeState;
  selectedBankId: string;
  activeSelectedPoolIds: string[];
  setModeQuestionBankState: Dispatch<SetStateAction<ModeQuestionBankStateMap>>;
  setModeRuntimeConfigById: Dispatch<
    SetStateAction<SpecialTrainingModeRuntimeConfigMap>
  >;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  totalDecisionSeconds: number;
  view: SpecialTrainingView;
};

export const useSpecialTrainingPageDerivedState = ({
  activeMode,
  activeModeId,
  challengeId,
  challengeRuntime,
  completedCount,
  content,
  currentChallengeScopeHash,
  currentQuestionIndex,
  decisionCount,
  decisionSecondsLeft,
  fastDecisionPhase,
  formatBankTimeframeLabel,
  language,
  modeQuestionBankState,
  modeRuntimeConfigById,
  passCount,
  questionBars,
  questions,
  runtime,
  selectedBankId,
  activeSelectedPoolIds,
  setModeQuestionBankState,
  setModeRuntimeConfigById,
  totalDecisionSeconds,
  view,
}: UseSpecialTrainingPageDerivedStateArgs) => {
  const activeModeRuntimeConfig =
    modeRuntimeConfigById[activeMode?.id ?? DEFAULT_SPECIAL_TRAINING_MODE_ID] ??
    modeRuntimeConfigById[DEFAULT_SPECIAL_TRAINING_MODE_ID];
  const activeQuestionCount = activeModeRuntimeConfig.questionCount;
  const activeHorizonBars = resolveRuntimeHorizonBars(
    activeMode?.id ?? DEFAULT_SPECIAL_TRAINING_MODE_ID,
    activeModeRuntimeConfig.horizonBars,
  );
  const isFastDecisionMode = activeMode?.id === "fast-decision-training";
  const isRiskDisciplineMode = activeMode?.id === "risk-discipline-training";
  const isTradeMode = activeMode?.decisionStyle === "TRADE";
  const activeModeQuestionBankState =
    modeQuestionBankState[activeMode?.id ?? DEFAULT_SPECIAL_TRAINING_MODE_ID] ??
    createEmptyModeQuestionBankState();
  const activeQuestion = questions[currentQuestionIndex] ?? null;
  const activeQuestionId = String(activeQuestion?.id || "").trim();
  const normalizedChallengeId = String(challengeId || "").trim();
  const activeChallengeModeId = activeMode?.id ?? activeModeId;
  const hasLiveChallengeSession =
    view === "TRAINING" &&
    normalizedChallengeId.length > 0 &&
    questions.length > 0;
  const activeRequestedMinimumBaseTimeframe =
    activeModeRuntimeConfig.minimumBaseTimeframe;
  const activeQuestionBankEffectiveTimeframes =
    activeModeQuestionBankState.effectiveTrainingTimeframes.length > 0
      ? activeModeQuestionBankState.effectiveTrainingTimeframes
      : activeModeQuestionBankState.effectiveTrainingTimeframe
        ? [activeModeQuestionBankState.effectiveTrainingTimeframe]
        : [];
  const activeQuestionBankEffectiveTrainingTimeframe =
    activeModeQuestionBankState.effectiveTrainingTimeframe ??
    activeRequestedMinimumBaseTimeframe;
  const activeQuestionBankEffectiveTrainingTimeframeLabel = useMemo(
    () =>
      formatQuestionBankTimeframeSummary(
        activeQuestionBankEffectiveTimeframes,
        activeQuestionBankEffectiveTrainingTimeframe,
        formatBankTimeframeLabel,
      ),
    [
      activeQuestionBankEffectiveTimeframes,
      activeQuestionBankEffectiveTrainingTimeframe,
      formatBankTimeframeLabel,
    ],
  );
  const { resetModeQuestionBank, updateModeRuntimeConfig } =
    useSpecialTrainingQuestionBankRuntime({
      language,
      dataLoadFailedLabel: content.dataLoadFailedLabel,
      selectedBankId,
      selectedPoolIds: activeSelectedPoolIds,
      modeQuestionBankState,
      activeChallengeModeId: activeMode?.id ?? activeModeId,
      hasLiveChallengeSession,
      currentChallengeScopeHash,
      modeRuntimeConfigById,
      setModeRuntimeConfigById,
      setModeQuestionBankState,
      notifyError: () => undefined,
    });
  const resolveQuestionEffectiveTrainingTimeframe = useCallback(
    (question: SpecialTrainingQuestion | null, bars = questionBars) =>
      resolveSpecialTrainingQuestionEffectiveTimeframe({
        question,
        bars,
        fallbackTrainingTimeframe: activeQuestionBankEffectiveTrainingTimeframe,
        fallbackBaseTimeframe: null,
      }),
    [activeQuestionBankEffectiveTrainingTimeframe, questionBars],
  );
  const activeQuestionEffectiveTrainingTimeframe =
    resolveQuestionEffectiveTrainingTimeframe(activeQuestion, questionBars);
  const activeFastDecisionStrictnessLevel = resolveFastDecisionStrictnessLevel(
    activeModeRuntimeConfig.fastDecisionStrictnessLevel,
  ) as FastDecisionStrictnessLevel;
  const activeFastDecisionDominanceRatio = resolveFastDecisionDominanceRatio({
    strictnessLevel: activeFastDecisionStrictnessLevel,
  });
  const activeDecisionSecondsLimit =
    activeModeRuntimeConfig.decisionSecondsLimit;
  const fastDecisionStrictnessOptions = useMemo<FastDecisionStrictnessOption[]>(
    () => [
      {
        level: "LENIENT",
        ratio: FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL.LENIENT,
        shortLabel: content.fastDecisionStrictnessLenientShortLabel,
        title: content.fastDecisionStrictnessLenientTitle,
        subtitle: content.fastDecisionStrictnessLenientSubtitle,
      },
      {
        level: "STANDARD",
        ratio: FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL.STANDARD,
        shortLabel: content.fastDecisionStrictnessStandardShortLabel,
        title: content.fastDecisionStrictnessStandardTitle,
        subtitle: content.fastDecisionStrictnessStandardSubtitle,
      },
      {
        level: "STRICT",
        ratio: FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL.STRICT,
        shortLabel: content.fastDecisionStrictnessStrictShortLabel,
        title: content.fastDecisionStrictnessStrictTitle,
        subtitle: content.fastDecisionStrictnessStrictSubtitle,
      },
    ],
    [
      content.fastDecisionStrictnessLenientShortLabel,
      content.fastDecisionStrictnessLenientSubtitle,
      content.fastDecisionStrictnessLenientTitle,
      content.fastDecisionStrictnessStandardShortLabel,
      content.fastDecisionStrictnessStandardSubtitle,
      content.fastDecisionStrictnessStandardTitle,
      content.fastDecisionStrictnessStrictShortLabel,
      content.fastDecisionStrictnessStrictSubtitle,
      content.fastDecisionStrictnessStrictTitle,
    ],
  );
  const activeFastDecisionStrictnessOption = useMemo(
    () =>
      fastDecisionStrictnessOptions.find(
        (option) => option.level === activeFastDecisionStrictnessLevel,
      ) ?? fastDecisionStrictnessOptions[1]!,
    [activeFastDecisionStrictnessLevel, fastDecisionStrictnessOptions],
  );
  const activeDurationEstimatePayload = useMemo(
    () =>
      activeMode
        ? {
            modeId: activeMode.id,
            operatorMode: "HUMAN" as const,
            questionCount: activeQuestionCount,
            horizonBars: activeHorizonBars,
            decisionSecondsLimit: isFastDecisionMode
              ? activeDecisionSecondsLimit
              : undefined,
          }
        : null,
    [
      activeDecisionSecondsLimit,
      activeHorizonBars,
      activeMode,
      activeQuestionCount,
      isFastDecisionMode,
    ],
  );
  const activeDurationEstimateSignature = useMemo(
    () =>
      activeDurationEstimatePayload
        ? [
            activeDurationEstimatePayload.modeId,
            activeDurationEstimatePayload.operatorMode,
            activeDurationEstimatePayload.questionCount,
            activeDurationEstimatePayload.horizonBars,
            activeDurationEstimatePayload.decisionSecondsLimit ?? "default",
          ].join("|")
        : "",
    [activeDurationEstimatePayload],
  );
  const resumableChallengeSession = useMemo(() => {
    if (!hasLiveChallengeSession) {
      return null;
    }
    return {
      challengeId: normalizedChallengeId,
      modeId: activeChallengeModeId,
      currentQuestionId: activeQuestionId,
      currentQuestionIndex,
      questionCount: questions.length,
      paused: runtime.paused,
    };
  }, [
    activeChallengeModeId,
    activeQuestionId,
    currentQuestionIndex,
    hasLiveChallengeSession,
    normalizedChallengeId,
    questions.length,
    runtime.paused,
  ]);
  const serverCurrentPrice = toFiniteNumber(challengeRuntime?.currentPrice);
  const currentPrice = Number.isFinite(serverCurrentPrice)
    ? serverCurrentPrice
    : null;
  const {
    riskCostPriceNow,
    riskHolderReference,
    riskBaselineCostPrice,
    riskRemainingActionableBars,
    riskRemainingActionableRatio,
    riskGravityFieldModel,
  } = useSpecialTrainingRiskDisciplineCoreViewModel({
    content,
    riskMetrics: challengeRuntime?.riskMetrics ?? null,
  });
  const serverFloatingPnl = toFiniteNumber(challengeRuntime?.floatingPnl);
  const floatingPnl = Number.isFinite(serverFloatingPnl)
    ? serverFloatingPnl
    : null;
  const serverCurrentTotalAsset = toFiniteNumber(
    challengeRuntime?.currentTotalAsset,
  );
  const currentTotalAsset = Number.isFinite(serverCurrentTotalAsset)
    ? serverCurrentTotalAsset
    : null;
  const winRate = completedCount > 0 ? passCount / completedCount : 0;
  const averageDecisionSeconds =
    decisionCount > 0 ? totalDecisionSeconds / decisionCount : 0;
  const decisionCountdownRatio =
    activeDecisionSecondsLimit > 0
      ? clamp(decisionSecondsLeft / activeDecisionSecondsLimit, 0, 1)
      : 0;
  const decisionCountdownPercent = decisionCountdownRatio * 100;
  const isCriticalCountdown =
    fastDecisionPhase === "THINKING" &&
    decisionSecondsLeft <= FAST_DECISION_CRITICAL_SECONDS;
  const fastDecisionCountdownTone =
    fastDecisionPhase !== "THINKING"
      ? "steady"
      : decisionCountdownRatio <= 0.25
        ? "critical"
        : decisionCountdownRatio <= 0.6
          ? "warning"
          : "steady";
  const fastDecisionCountdownClock = useMemo(
    () => formatCountdownClock(decisionSecondsLeft),
    [decisionSecondsLeft],
  );

  return {
    activeChallengeModeId,
    activeDecisionSecondsLimit,
    activeDurationEstimatePayload,
    activeDurationEstimateSignature,
    activeFastDecisionDominanceRatio,
    activeFastDecisionStrictnessLevel,
    activeFastDecisionStrictnessOption,
    activeHorizonBars,
    activeModeQuestionBankState,
    activeQuestion,
    activeQuestionBankEffectiveTrainingTimeframeLabel,
    activeQuestionCount,
    activeQuestionEffectiveTrainingTimeframe,
    activeQuestionId,
    averageDecisionSeconds,
    currentPrice,
    currentTotalAsset,
    decisionCountdownPercent,
    fastDecisionCountdownClock,
    fastDecisionCountdownTone,
    fastDecisionStrictnessOptions,
    floatingPnl,
    hasLiveChallengeSession,
    isCriticalCountdown,
    isFastDecisionMode,
    isRiskDisciplineMode,
    isTradeMode,
    normalizedChallengeId,
    resetModeQuestionBank,
    resolveQuestionEffectiveTrainingTimeframe,
    resumableChallengeSession,
    riskBaselineCostPrice,
    riskCostPriceNow,
    riskGravityFieldModel,
    riskHolderReference,
    riskRemainingActionableBars,
    riskRemainingActionableRatio,
    updateModeRuntimeConfig,
    winRate,
  };
};

export type SpecialTrainingPageDerivedState = ReturnType<
  typeof useSpecialTrainingPageDerivedState
>;
