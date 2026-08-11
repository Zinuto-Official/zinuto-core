// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type {
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingFastDecisionTimerState,
  ApiSpecialTrainingScopeRestartSignal,
} from "@/api";
import {
  startSpecialTrainingChallenge,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import type {
  SpecialTrainingModeDefinition,
} from "@/ui/config/uiConfig";
import { useSpecialTrainingChallengeRuntime } from "@/workspaces/special-training/useSpecialTrainingChallengeRuntime";
import { resetSharedStatsViewCache } from "@/workspaces/challenge-stats/trainingStatsViewCache";
import { useSpecialTrainingChartSync } from "@/workspaces/special-training/session/useSpecialTrainingChartSync";
import { useScopeRestartNoticeCountdown } from "@/workspaces/special-training/session/useScopeRestartNoticeCountdown";
import type {
  FastDecisionChoice,
  FastDecisionArenaPhase,
  FastDecisionResult,
  FastDecisionStrictnessLevel,
  RiskRuntimeBaseline,
  RuntimeState,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
  TradeActionLogEntry,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type {
  CachedSpecialTrainingQuestionRuntime,
  SpecialTrainingPageProps,
} from "@/workspaces/special-training/specialTrainingPageTypes";

type UseSpecialTrainingPageOrchestrationArgs = Pick<
  SpecialTrainingPageProps,
  "isPageActive" | "onSyncChartQuestion"
> & {
  activeDecisionSecondsLimit: number;
  activeFastDecisionStrictnessLevel: FastDecisionStrictnessLevel;
  activeHorizonBars: number;
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeModeQuestionBankStartEnabled: boolean;
  activeQuestion: SpecialTrainingQuestion | null;
  activeQuestionCount: number;
  activeQuestionEffectiveTrainingTimeframe: BaseTimeframe | null | undefined;
  applyFastDecisionTimerState: (
    timer: ApiSpecialTrainingFastDecisionTimerState | null | undefined,
    fallbackSecondsLimit: number,
  ) => void;
  applyStartedChallenge: (
    challenge: Awaited<ReturnType<typeof startSpecialTrainingChallenge>>,
  ) => void;
  challengeId: string;
  closeScopeRestartNotice: () => void;
  content: ReturnType<typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent>;
  currentQuestionIndexRef: MutableRefObject<number>;
  cursorIndex: number;
  displayedQuestionIdRef: MutableRefObject<string>;
  fastDecisionPhase: FastDecisionArenaPhase;
  fastDecisionResult: FastDecisionResult | null;
  finalizingRef: MutableRefObject<boolean>;
  isFastDecisionMode: boolean;
  isQuestionLoading: boolean;
  isRiskDisciplineMode: boolean;
  lockedDecisionSelection: FastDecisionChoice | null;
  modeRuntimeConfigById: Record<string, { decisionSecondsLimit: number }>;
  questionBars: SpecialTrainingQuestion["bars"];
  questionBarsRef: MutableRefObject<SpecialTrainingQuestion["bars"]>;
  questionRuntimeCacheRef: MutableRefObject<
    Map<string, CachedSpecialTrainingQuestionRuntime>
  >;
  questionStartIndex: number;
  questions: SpecialTrainingQuestion[];
  questionsRef: MutableRefObject<SpecialTrainingQuestion[]>;
  resetFastDecisionArenaState: () => void;
  resetTrainingRuntime: () => void;
  resolveBankApiErrorMessage: (error: unknown) => string;
  riskBaselineCostPrice: number | null;
  riskCostPriceNow: number | null;
  scopeRestartNotice: ApiSpecialTrainingScopeRestartSignal | null;
  selectedBankId: string;
  setChallengeId: Dispatch<SetStateAction<string>>;
  setChallengeRuntime: Dispatch<
    SetStateAction<ApiSpecialTrainingChallengeRuntime | null>
  >;
  setCompletedCount: Dispatch<SetStateAction<number>>;
  setCurrentChallengeScopeHash: Dispatch<SetStateAction<string>>;
  setCurrentQuestionIndexState: Dispatch<SetStateAction<number>>;
  setCursorIndex: Dispatch<SetStateAction<number>>;
  setDecisionCount: Dispatch<SetStateAction<number>>;
  setDecisionDeadlineAtMs: Dispatch<SetStateAction<number | null>>;
  setDecisionSecondsLeft: Dispatch<SetStateAction<number>>;
  setDecisionStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setIsQuestionLoading: Dispatch<SetStateAction<boolean>>;
  setPassCount: Dispatch<SetStateAction<number>>;
  setQuestionBarsState: Dispatch<SetStateAction<SpecialTrainingQuestion["bars"]>>;
  setQuestionEndIndex: Dispatch<SetStateAction<number>>;
  setQuestionStartIndex: Dispatch<SetStateAction<number>>;
  setQuestionsState: Dispatch<SetStateAction<SpecialTrainingQuestion[]>>;
  setRiskAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  setRiskBaseline: Dispatch<SetStateAction<RiskRuntimeBaseline | null>>;
  setRuntime: Dispatch<SetStateAction<RuntimeState>>;
  setSessionSettlements: Dispatch<SetStateAction<SettlementResult[]>>;
  setSettlement: Dispatch<SetStateAction<SettlementResult | null>>;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  setTotalDecisionSeconds: Dispatch<SetStateAction<number>>;
  setTradeActions: Dispatch<SetStateAction<TradeActionLogEntry[]>>;
  tradeActions: TradeActionLogEntry[];
  view: SpecialTrainingView;
};

export const useSpecialTrainingPageOrchestration = ({
  activeDecisionSecondsLimit,
  activeFastDecisionStrictnessLevel,
  activeHorizonBars,
  activeMode,
  activeModeQuestionBankStartEnabled,
  activeQuestion,
  activeQuestionCount,
  activeQuestionEffectiveTrainingTimeframe,
  applyFastDecisionTimerState,
  applyStartedChallenge,
  challengeId,
  closeScopeRestartNotice,
  content,
  currentQuestionIndexRef,
  cursorIndex,
  displayedQuestionIdRef,
  fastDecisionPhase,
  fastDecisionResult,
  finalizingRef,
  isFastDecisionMode,
  isPageActive = true,
  isQuestionLoading,
  isRiskDisciplineMode,
  lockedDecisionSelection,
  modeRuntimeConfigById,
  onSyncChartQuestion,
  questionBars,
  questionBarsRef,
  questionRuntimeCacheRef,
  questionStartIndex,
  questions,
  questionsRef,
  resetFastDecisionArenaState,
  resetTrainingRuntime,
  resolveBankApiErrorMessage,
  riskBaselineCostPrice,
  riskCostPriceNow,
  scopeRestartNotice,
  selectedBankId,
  setChallengeId,
  setChallengeRuntime,
  setCompletedCount,
  setCurrentChallengeScopeHash,
  setCurrentQuestionIndexState,
  setCursorIndex,
  setDecisionCount,
  setDecisionDeadlineAtMs,
  setDecisionSecondsLeft,
  setDecisionStartedAtMs,
  setIsQuestionLoading,
  setPassCount,
  setQuestionBarsState,
  setQuestionEndIndex,
  setQuestionStartIndex,
  setQuestionsState,
  setRiskAutoplayEnabled,
  setRiskBaseline,
  setRuntime,
  setSessionSettlements,
  setSettlement,
  setSubmitErrorMessage,
  setTotalDecisionSeconds,
  setTradeActions,
  tradeActions,
  view,
}: UseSpecialTrainingPageOrchestrationArgs) => {
  const applyBackendCompletion = useCallback(
    (result: SettlementResult) => {
      const sessionSummary = result.sessionSummary;
      if (sessionSummary && sessionSummary.modeId === activeMode?.id) {
        const completedCount = sessionSummary.completedCount;
        setCompletedCount(completedCount);
        setPassCount(sessionSummary.passCount);
        if (
          sessionSummary.modeId === "fast-decision-training" &&
          "averageDecisionSeconds" in sessionSummary
        ) {
          setTotalDecisionSeconds(
            sessionSummary.averageDecisionSeconds * completedCount,
          );
          setDecisionCount(completedCount);
        }
      }
      const isSessionCompleted =
        result.sessionCompletion?.completed ||
        (sessionSummary?.completedCount ?? 0) >= questions.length;
      if (isSessionCompleted) {
        resetSharedStatsViewCache();
      }
      setSessionSettlements((current) => [...current, result]);
      setSettlement(result);
    },
    [
      activeMode?.id,
      questions.length,
      setCompletedCount,
      setDecisionCount,
      setPassCount,
      setSessionSettlements,
      setSettlement,
      setTotalDecisionSeconds,
    ],
  );

  const { applyCommandChallengeRuntime, beginTraining } =
    useSpecialTrainingChallengeRuntime({
      activeDecisionSecondsLimit,
      activeFastDecisionStrictnessLevel,
      activeHorizonBars,
      activeMode,
      activeModeQuestionBankStartEnabled,
      activeQuestion,
      activeQuestionCount,
      applyFastDecisionTimerState,
      applyStartedChallenge,
      challengeId,
      content,
      currentQuestionIndexRef,
      displayedQuestionIdRef,
      finalizingRef,
      isFastDecisionMode,
      isQuestionLoading,
      modeRuntimeConfigById,
      questionBarsRef,
      questionRuntimeCacheRef,
      questionsRef,
      resetFastDecisionArenaState,
      resetTrainingRuntime,
      resolveBankApiErrorMessage,
      selectedBankId,
      setChallengeId,
      setChallengeRuntime,
      setCurrentChallengeScopeHash,
      setCurrentQuestionIndexState,
      setCursorIndex,
      setDecisionDeadlineAtMs,
      setDecisionSecondsLeft,
      setDecisionStartedAtMs,
      setIsQuestionLoading,
      setQuestionBarsState,
      setQuestionEndIndex,
      setQuestionStartIndex,
      setQuestionsState,
      setRiskAutoplayEnabled,
      setRiskBaseline,
      setRuntime,
      setSettlement,
      setSubmitErrorMessage,
      setTradeActions,
      view,
    });

  useSpecialTrainingChartSync({
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
    labels: {
      fastArenaMaeTagLabel: content.fastArenaMaeTagLabel,
      fastArenaObserveMarkLabel: content.fastArenaObserveMarkLabel,
      fastArenaMfeTagLabel: content.fastArenaMfeTagLabel,
      fastArenaBuyHotkeyLabel: content.fastArenaBuyHotkeyLabel,
      fastArenaSellHotkeyLabel: content.fastArenaSellHotkeyLabel,
      decisionDirectionDownLabel: content.decisionDirectionDownLabel,
      decisionDirectionUpLabel: content.decisionDirectionUpLabel,
      decisionObserveLabel: content.decisionObserveLabel,
      riskDisciplineBaselineGuideTagLabel:
        content.riskDisciplineBaselineGuideTagLabel,
      riskDisciplineCostGuideTagLabel: content.riskDisciplineCostGuideTagLabel,
    },
  });

  const scopeRestartNoticeCountdown = useScopeRestartNoticeCountdown({
    notice: scopeRestartNotice,
    onClose: closeScopeRestartNotice,
  });

  return {
    applyBackendCompletion,
    applyCommandChallengeRuntime,
    beginTraining,
    scopeRestartNoticeCountdown,
  };
};

export type SpecialTrainingPageOrchestration = ReturnType<
  typeof useSpecialTrainingPageOrchestration
>;
