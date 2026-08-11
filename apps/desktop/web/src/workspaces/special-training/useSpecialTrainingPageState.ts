// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingFastDecisionTimerState,
  ApiSpecialTrainingScopeRestartSignal,
} from "@/api";
import {
  formatMessageByLanguage,
  type AppTextKey,
} from "@/frontend-kernel/i18n/messageRuntime";
import { getSpecialTrainingPageContent, type SpecialTrainingModeId } from "@/ui/config/uiConfig";
import { DEFAULT_DECISION_SECONDS_LIMIT } from "@/workspaces/special-training/domain/specialTrainingConstants";
import { toFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import { createSpecialTrainingRuntimeDraft } from "@/workspaces/special-training/domain/specialTrainingRuntimeDraft";
import { resolveSpecialTrainingRiskActionReasonText } from "@/workspaces/special-training/domain/specialTrainingRiskActionReasonText";
import type {
  FastDecisionArenaPhase,
  FastDecisionChoice,
  FastDecisionResult,
  RiskRuntimeBaseline,
  RuntimeState,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
  TradeActionLogEntry,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  DEFAULT_SPECIAL_TRAINING_MODE_ID,
  createDefaultModeRuntimeConfigMap,
  createModeQuestionBankStateMap,
  resolveSpecialTrainingContentModes,
  type ModeQuestionBankStateMap,
  type SpecialTrainingModeRuntimeConfigMap,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import { useSpecialTrainingSessionController } from "@/workspaces/special-training/session/useSpecialTrainingSessionController";
import { useSpecialTrainingBankManager } from "@/workspaces/special-training/banks/useSpecialTrainingBankManager";
import {
  resolveOnboardingDefaultSpecialTrainingBank,
  type CachedSpecialTrainingQuestionRuntime,
  type SpecialTrainingPageProps,
} from "@/workspaces/special-training/specialTrainingPageTypes";
import { useSpecialTrainingPageDerivedState } from "@/workspaces/special-training/useSpecialTrainingPageDerivedState";
import { useSpecialTrainingPageOrchestration } from "@/workspaces/special-training/useSpecialTrainingPageOrchestration";

export const useSpecialTrainingPageState = ({
  controlledModeId,
  enabledSamplePoolSymbols,
  enabledSamplePools,
  globalResetRevision,
  isPageActive = true,
  language,
  onRequestModeChange,
  onSyncChartQuestion,
  onboardingTargetId = null,
}: SpecialTrainingPageProps) => {
  const tt = useCallback(
    (key: AppTextKey) => formatMessageByLanguage(language, key),
    [language],
  );
  const ttf = useCallback(
    (key: AppTextKey, values: Array<unknown> = []) =>
      formatMessageByLanguage(language, key, values),
    [language],
  );
  const content = useMemo(
    () => getSpecialTrainingPageContent(language),
    [language],
  );
  const textSlash = tt("appText.message0697");
  const textDoubleDash = tt("appText.message0706");
  const resolveRiskActionBlockedReasonText = useCallback(
    (code: string | null, fallbackReason: string | null = null): string | null =>
      resolveSpecialTrainingRiskActionReasonText(content, code, fallbackReason),
    [content],
  );
  const availableModes = useMemo(
    () => resolveSpecialTrainingContentModes(content.modes),
    [content.modes],
  );

  const [view, setView] = useState<SpecialTrainingView>("MODE_PICKER");
  const [uncontrolledActiveModeId, setUncontrolledActiveModeId] =
    useState<SpecialTrainingModeId>(
    availableModes[0]?.id ?? DEFAULT_SPECIAL_TRAINING_MODE_ID,
  );
  const activeModeId = controlledModeId ?? uncontrolledActiveModeId;
  const setActiveModeId = useCallback<
    Dispatch<SetStateAction<SpecialTrainingModeId>>
  >(
    (value) => {
      const nextModeId =
        typeof value === "function" ? value(activeModeId) : value;
      if (controlledModeId) {
        onRequestModeChange?.(nextModeId);
        return;
      }
      setUncontrolledActiveModeId(nextModeId);
    },
    [activeModeId, controlledModeId, onRequestModeChange],
  );
  const [modeRuntimeConfigById, setModeRuntimeConfigById] = useState<SpecialTrainingModeRuntimeConfigMap>(createDefaultModeRuntimeConfigMap);
  const [submitErrorMessage, setSubmitErrorMessage] = useState("");
  const activeMode = useMemo(
    () =>
      availableModes.find((mode) => mode.id === activeModeId) ??
      availableModes[0],
    [activeModeId, availableModes],
  );

  const {
    activePoolCount,
    activeSelectedPoolIds,
    activeSelectedPools,
    activeSelectedSymbols,
    activeSymbolCount,
    bankSearchQuery,
    cancelRenameBank,
    editingBankId,
    editingBankName,
    enabledSamplePoolById,
    filteredSpecialTrainingBanks,
    formatBankTimeframeLabel,
    hasMoreSpecialTrainingBanks,
    hasEnabledSampleSymbols,
    isLoadingMoreBanks,
    loadMoreSpecialTrainingBanks,
    openBankEditor,
    requestDeleteBankConfirmation,
    resolveBankApiErrorMessage,
    resolveBankCardPresentation,
    saveRenameBank,
    selectedBank,
    selectedBankMissingPoolIds,
    setBankSearchQuery,
    setEditingBankName,
    setSelectedBankId,
    specialTrainingBanks,
    startRenameBank,
  } = useSpecialTrainingBankManager({
    language,
    content,
    enabledSamplePoolSymbols,
    enabledSamplePools,
    globalResetRevision,
    activeModeId: activeMode?.id,
    setSubmitErrorMessage,
    setModeRuntimeConfigById,
  });

  const [modeQuestionBankState, setModeQuestionBankState] =
    useState<ModeQuestionBankStateMap>(createModeQuestionBankStateMap);
  const [questions, setQuestions] = useState<SpecialTrainingQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionBars, setQuestionBars] = useState<SpecialTrainingQuestion["bars"]>([]);
  const questionRuntimeCacheRef = useRef<
    Map<string, CachedSpecialTrainingQuestionRuntime>
  >(new Map());
  const questionsRef = useRef<SpecialTrainingQuestion[]>([]);
  const currentQuestionIndexRef = useRef(0);
  const questionBarsRef = useRef<SpecialTrainingQuestion["bars"]>([]);
  const displayedQuestionIdRef = useRef("");
  const setQuestionsState = useCallback<
    Dispatch<SetStateAction<SpecialTrainingQuestion[]>>
  >((value) => {
    setQuestions((current) => {
      const next = typeof value === "function" ? value(current) : value;
      questionsRef.current = next;
      return next;
    });
  }, []);
  const setCurrentQuestionIndexState = useCallback<
    Dispatch<SetStateAction<number>>
  >((value) => {
    setCurrentQuestionIndex((current) => {
      const next = typeof value === "function" ? value(current) : value;
      currentQuestionIndexRef.current = next;
      return next;
    });
  }, []);
  const setQuestionBarsState = useCallback<
    Dispatch<SetStateAction<SpecialTrainingQuestion["bars"]>>
  >((value) => {
    setQuestionBars((current) => {
      const next = typeof value === "function" ? value(current) : value;
      questionBarsRef.current = next;
      return next;
    });
  }, []);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [questionStartIndex, setQuestionStartIndex] = useState(0);
  const [questionEndIndex, setQuestionEndIndex] = useState(0);
  const [isQuestionLoading, setIsQuestionLoading] = useState(false);
  const [currentChallengeScopeHash, setCurrentChallengeScopeHash] = useState("");
  const [runtime, setRuntime] = useState<RuntimeState>(createSpecialTrainingRuntimeDraft);
  const [challengeRuntime, setChallengeRuntime] = useState<ApiSpecialTrainingChallengeRuntime | null>(null);
  const [riskBaseline, setRiskBaseline] = useState<RiskRuntimeBaseline | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [sessionSettlements, setSessionSettlements] = useState<SettlementResult[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [totalDecisionSeconds, setTotalDecisionSeconds] = useState(0);
  const [decisionCount, setDecisionCount] = useState(0);
  const [decisionStartedAtMs, setDecisionStartedAtMs] = useState<number | null>(null);
  const [decisionDeadlineAtMs, setDecisionDeadlineAtMs] = useState<number | null>(null);
  const [decisionSecondsLeft, setDecisionSecondsLeft] = useState(
    DEFAULT_DECISION_SECONDS_LIMIT,
  );
  const [fastDecisionResult, setFastDecisionResult] = useState<FastDecisionResult | null>(null);
  const [fastDecisionPhase, setFastDecisionPhase] =
    useState<FastDecisionArenaPhase>("THINKING");
  const [lockedDecisionSelection, setLockedDecisionSelection] =
    useState<FastDecisionChoice | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [tradeActions, setTradeActions] = useState<TradeActionLogEntry[]>([]);
  const [scopeRestartNotice, setScopeRestartNotice] =
    useState<ApiSpecialTrainingScopeRestartSignal | null>(null);
  const [riskAutoplayEnabled, setRiskAutoplayEnabled] = useState(false);
  const [selectedSessionReviewIndex, setSelectedSessionReviewIndex] = useState<
    number | null
  >(null);
  const [
    selectedSessionReviewOpenRequestId,
    setSelectedSessionReviewOpenRequestId,
  ] = useState(0);
  const onboardingDefaultSpecialTrainingBank = useMemo(
    () => resolveOnboardingDefaultSpecialTrainingBank(specialTrainingBanks),
    [specialTrainingBanks],
  );
  const finalizingRef = useRef(false);
  const pendingFastDecisionResultRef = useRef<FastDecisionResult | null>(null);
  const fastDecisionRevealTimerRef = useRef<number | null>(null);
  const fastDecisionJudgeTimerRef = useRef<number | null>(null);
  const fastDecisionAutoNextTimerRef = useRef<number | null>(null);
  const pendingServerSettlementRef = useRef<SettlementResult | null>(null);
  const globalResetRevisionRef = useRef(globalResetRevision);
  const closeScopeRestartNotice = useCallback(() => {
    setScopeRestartNotice(null);
  }, []);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);
  useEffect(() => {
    questionBarsRef.current = questionBars;
  }, [questionBars]);

  const clearFastDecisionTimers = useCallback(() => {
    if (fastDecisionRevealTimerRef.current !== null) {
      window.cancelAnimationFrame(fastDecisionRevealTimerRef.current);
      fastDecisionRevealTimerRef.current = null;
    }
    if (fastDecisionJudgeTimerRef.current !== null) {
      window.clearTimeout(fastDecisionJudgeTimerRef.current);
      fastDecisionJudgeTimerRef.current = null;
    }
    if (fastDecisionAutoNextTimerRef.current !== null) {
      window.clearTimeout(fastDecisionAutoNextTimerRef.current);
      fastDecisionAutoNextTimerRef.current = null;
    }
  }, []);
  const resetFastDecisionArenaState = useCallback(() => {
    clearFastDecisionTimers();
    pendingFastDecisionResultRef.current = null;
    setFastDecisionResult(null);
    setFastDecisionPhase("THINKING");
    setLockedDecisionSelection(null);
  }, [clearFastDecisionTimers]);
  const applyFastDecisionTimerState = useCallback(
    (
      timer: ApiSpecialTrainingFastDecisionTimerState | null | undefined,
      fallbackSecondsLimit: number,
    ) => {
      const startedAtMs = timer?.startedAt ? Date.parse(timer.startedAt) : NaN;
      const serverNowMs = timer?.serverNow ? Date.parse(timer.serverNow) : NaN;
      const rawDeadlineAtMs = timer?.deadlineAt
        ? Date.parse(timer.deadlineAt)
        : NaN;
      // The server deadline is expressed on the server clock. Correct it with
      // the client-server offset captured from this packet's serverNow so local
      // clock skew does not shift the countdown or the auto-submit moment.
      const clockOffsetMs = Number.isFinite(serverNowMs)
        ? Date.now() - serverNowMs
        : NaN;
      const deadlineAtMs = Number.isFinite(clockOffsetMs)
        ? rawDeadlineAtMs + clockOffsetMs
        : rawDeadlineAtMs;
      setDecisionStartedAtMs(Number.isFinite(startedAtMs) ? startedAtMs : null);
      setDecisionDeadlineAtMs(
        timer?.state === "RUNNING" && Number.isFinite(deadlineAtMs)
          ? deadlineAtMs
          : null,
      );
      const remainingSeconds = toFiniteNumber(timer?.remainingSeconds);
      setDecisionSecondsLeft(
        Math.max(
          0,
          Math.floor(
            Number.isFinite(remainingSeconds)
              ? remainingSeconds
              : fallbackSecondsLimit,
          ),
        ),
      );
    },
    [],
  );

  const {
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
  } = useSpecialTrainingPageDerivedState({
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
    selectedBankId: selectedBank?.id ?? "",
    activeSelectedPoolIds,
    setModeQuestionBankState,
    setModeRuntimeConfigById,
    setSubmitErrorMessage,
    totalDecisionSeconds,
    view,
  });

  const {
    resetTrainingRuntime,
    applyStartedChallenge,
    exitTraining,
    gotoNextQuestion,
  } = useSpecialTrainingSessionController({
    activeDecisionSecondsLimit,
    currentQuestionIndex,
    questionCount: questions.length,
    createRuntimeDraft: createSpecialTrainingRuntimeDraft,
    resetFastDecisionArenaState,
    finalizingRef,
    setRuntime,
    setRiskBaseline,
    setQuestionBars: setQuestionBarsState,
    setCursorIndex,
    setQuestionStartIndex,
    setQuestionEndIndex,
    setTradeActions,
    setSubmitErrorMessage,
    setRiskAutoplayEnabled,
    setDecisionStartedAtMs,
    setDecisionDeadlineAtMs,
    setDecisionSecondsLeft,
    setChallengeId,
    setCurrentChallengeScopeHash,
    setQuestions: setQuestionsState,
    setCurrentQuestionIndex: setCurrentQuestionIndexState,
    setSessionSettlements,
    setCompletedCount,
    setPassCount,
    setTotalDecisionSeconds,
    setDecisionCount,
    setSettlement,
    setScopeRestartNotice,
    setSelectedSessionReviewIndex,
    setView,
  });

  useEffect(() => {
    if (globalResetRevisionRef.current === globalResetRevision) {
      return;
    }
    globalResetRevisionRef.current = globalResetRevision;
    exitTraining();
  }, [exitTraining, globalResetRevision]);

  useEffect(() => {
    if (
      onboardingTargetId !== "LIGHTNING_PREP_BANK_CONFIG" &&
      onboardingTargetId !== "SURVIVAL_PREP_BANK_CONFIG"
    ) {
      return;
    }
    if (view !== "MODE_PICKER") {
      return;
    }
    setSubmitErrorMessage("");
    if (onboardingDefaultSpecialTrainingBank) {
      setSelectedBankId(onboardingDefaultSpecialTrainingBank.id);
    }
    setActiveModeId(
      onboardingTargetId === "LIGHTNING_PREP_BANK_CONFIG"
        ? "fast-decision-training"
        : "risk-discipline-training",
    );
  }, [
    onboardingDefaultSpecialTrainingBank,
    onboardingTargetId,
    setActiveModeId,
    setSelectedBankId,
    view,
  ]);
  useEffect(
    () => () => {
      clearFastDecisionTimers();
    },
    [clearFastDecisionTimers],
  );
  const updateRuntime = useCallback(
    (updater: (prev: RuntimeState) => RuntimeState) => {
      setRuntime((prev) => {
        if (!activeMode) {
          return prev;
        }
        return updater(prev);
      });
    },
    [activeMode],
  );

  const {
    applyBackendCompletion,
    applyCommandChallengeRuntime,
    beginTraining,
    scopeRestartNoticeCountdown,
  } = useSpecialTrainingPageOrchestration({
    activeDecisionSecondsLimit,
    activeFastDecisionStrictnessLevel,
    activeHorizonBars,
    activeMode,
    activeModeQuestionBankStartEnabled:
      activeModeQuestionBankState.actionAvailability.start.enabled,
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
    isPageActive,
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
    selectedBankId: selectedBank?.id ?? "",
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
  });

  return {
    activeChallengeModeId,
    activeDecisionSecondsLimit,
    activeDurationEstimatePayload,
    activeDurationEstimateSignature,
    activeFastDecisionDominanceRatio,
    activeFastDecisionStrictnessLevel,
    activeFastDecisionStrictnessOption,
    activeHorizonBars,
    activeMode,
    activeModeId,
    activeModeQuestionBankState,
    activeQuestion,
    activeQuestionBankEffectiveTrainingTimeframeLabel,
    activeQuestionCount,
    activeQuestionEffectiveTrainingTimeframe,
    activeQuestionId,
    activePoolCount,
    activeSelectedPoolIds,
    activeSelectedPools,
    activeSelectedSymbols,
    activeSymbolCount,
    applyBackendCompletion,
    applyCommandChallengeRuntime,
    availableModes,
    averageDecisionSeconds,
    bankSearchQuery,
    beginTraining,
    cancelRenameBank,
    challengeId,
    challengeRuntime,
    clearFastDecisionTimers,
    closeScopeRestartNotice,
    completedCount,
    content,
    currentPrice,
    currentQuestionIndex,
    currentTotalAsset,
    cursorIndex,
    decisionCount,
    decisionCountdownPercent,
    decisionDeadlineAtMs,
    decisionSecondsLeft,
    decisionStartedAtMs,
    editingBankId,
    editingBankName,
    enabledSamplePoolById,
    exitTraining,
    fastDecisionAutoNextTimerRef,
    fastDecisionCountdownClock,
    fastDecisionCountdownTone,
    fastDecisionJudgeTimerRef,
    fastDecisionPhase,
    fastDecisionResult,
    fastDecisionRevealTimerRef,
    fastDecisionStrictnessOptions,
    filteredSpecialTrainingBanks,
    finalizingRef,
    floatingPnl,
    formatBankTimeframeLabel,
    gotoNextQuestion,
    hasEnabledSampleSymbols,
    hasLiveChallengeSession,
    hasMoreSpecialTrainingBanks,
    isCriticalCountdown,
    isFastDecisionMode,
    isLoadingMoreBanks,
    isPageActive,
    isQuestionLoading,
    isRiskDisciplineMode,
    isTradeMode,
    loadMoreSpecialTrainingBanks,
    lockedDecisionSelection,
    modeQuestionBankState,
    modeRuntimeConfigById,
    normalizedChallengeId,
    openBankEditor,
    passCount,
    pendingFastDecisionResultRef,
    pendingServerSettlementRef,
    questionBars,
    questionEndIndex,
    questionStartIndex,
    questions,
    requestDeleteBankConfirmation,
    resetFastDecisionArenaState,
    resetModeQuestionBank,
    resolveBankApiErrorMessage,
    resolveBankCardPresentation,
    resolveQuestionEffectiveTrainingTimeframe,
    resolveRiskActionBlockedReasonText,
    resumableChallengeSession,
    riskAutoplayEnabled,
    riskBaseline,
    riskBaselineCostPrice,
    riskCostPriceNow,
    riskGravityFieldModel,
    riskHolderReference,
    riskRemainingActionableBars,
    riskRemainingActionableRatio,
    runtime,
    saveRenameBank,
    scopeRestartNotice,
    scopeRestartNoticeCountdown,
    selectedBank,
    selectedBankMissingPoolIds,
    selectedSessionReviewIndex,
    selectedSessionReviewOpenRequestId,
    sessionSettlements,
    setActiveModeId,
    setBankSearchQuery,
    setCursorIndex,
    setDecisionDeadlineAtMs,
    setDecisionSecondsLeft,
    setDecisionStartedAtMs,
    setEditingBankName,
    setFastDecisionPhase,
    setFastDecisionResult,
    setIsQuestionLoading,
    setLockedDecisionSelection,
    setQuestionEndIndex,
    setRiskAutoplayEnabled,
    setRuntime,
    setSelectedBankId,
    setSelectedSessionReviewIndex,
    setSelectedSessionReviewOpenRequestId,
    setSubmitErrorMessage,
    setView,
    settlement,
    specialTrainingBanks,
    startRenameBank,
    submitErrorMessage,
    totalDecisionSeconds,
    ttf,
    textDoubleDash,
    textSlash,
    tradeActions,
    tt,
    updateModeRuntimeConfig,
    updateRuntime,
    view,
    winRate,
  };
};

export type SpecialTrainingPageState = ReturnType<
  typeof useSpecialTrainingPageState
>;
