// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type {
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingFastDecisionTimerState,
} from "@/api";
import {
  getSpecialTrainingChallengeRuntime,
  startSpecialTrainingChallenge,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import { getSpecialTrainingPageContent, type SpecialTrainingModeDefinition } from "@/ui/config/uiConfig";
import {
  DEFAULT_CAPITAL,
  DEFAULT_DECISION_SECONDS_LIMIT,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import {
  clamp,
  toFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  createSpecialTrainingRuntimeDraft,
  readRuntimeQuestionBars,
} from "@/workspaces/special-training/domain/specialTrainingRuntimeDraft";
import type {
  FastDecisionStrictnessLevel,
  RiskRuntimeBaseline,
  RuntimeState,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
  TradeActionLogEntry,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type {
  ApplyChallengeRuntimeOptions,
  ApplyChallengeRuntimeResult,
  CachedSpecialTrainingQuestionRuntime,
} from "@/workspaces/special-training/specialTrainingPageTypes";

type UseSpecialTrainingChallengeRuntimeArgs = {
  activeDecisionSecondsLimit: number;
  activeFastDecisionStrictnessLevel: FastDecisionStrictnessLevel;
  activeHorizonBars: number;
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeModeQuestionBankStartEnabled: boolean;
  activeQuestion: SpecialTrainingQuestion | null;
  activeQuestionCount: number;
  applyFastDecisionTimerState: (
    timer: ApiSpecialTrainingFastDecisionTimerState | null | undefined,
    fallbackSecondsLimit: number,
  ) => void;
  applyStartedChallenge: (challenge: Awaited<ReturnType<typeof startSpecialTrainingChallenge>>) => void;
  challengeId: string;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  currentQuestionIndexRef: MutableRefObject<number>;
  displayedQuestionIdRef: MutableRefObject<string>;
  finalizingRef: MutableRefObject<boolean>;
  isFastDecisionMode: boolean;
  isQuestionLoading: boolean;
  modeRuntimeConfigById: Record<
    string,
    {
      decisionSecondsLimit: number;
    }
  >;
  questionBarsRef: MutableRefObject<SpecialTrainingQuestion["bars"]>;
  questionRuntimeCacheRef: MutableRefObject<
    Map<string, CachedSpecialTrainingQuestionRuntime>
  >;
  questionsRef: MutableRefObject<SpecialTrainingQuestion[]>;
  resetFastDecisionArenaState: () => void;
  resetTrainingRuntime: () => void;
  resolveBankApiErrorMessage: (error: unknown) => string;
  selectedBankId: string;
  setChallengeId: Dispatch<SetStateAction<string>>;
  setChallengeRuntime: Dispatch<
    SetStateAction<ApiSpecialTrainingChallengeRuntime | null>
  >;
  setCurrentChallengeScopeHash: Dispatch<SetStateAction<string>>;
  setCurrentQuestionIndexState: Dispatch<SetStateAction<number>>;
  setCursorIndex: Dispatch<SetStateAction<number>>;
  setDecisionDeadlineAtMs: Dispatch<SetStateAction<number | null>>;
  setDecisionSecondsLeft: Dispatch<SetStateAction<number>>;
  setDecisionStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setIsQuestionLoading: Dispatch<SetStateAction<boolean>>;
  setQuestionBarsState: Dispatch<SetStateAction<SpecialTrainingQuestion["bars"]>>;
  setQuestionEndIndex: Dispatch<SetStateAction<number>>;
  setQuestionStartIndex: Dispatch<SetStateAction<number>>;
  setQuestionsState: Dispatch<SetStateAction<SpecialTrainingQuestion[]>>;
  setRiskAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  setRiskBaseline: Dispatch<SetStateAction<RiskRuntimeBaseline | null>>;
  setRuntime: Dispatch<SetStateAction<RuntimeState>>;
  setSettlement: Dispatch<SetStateAction<SettlementResult | null>>;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  setTradeActions: Dispatch<SetStateAction<TradeActionLogEntry[]>>;
  view: SpecialTrainingView;
};

export const useSpecialTrainingChallengeRuntime = ({
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
}: UseSpecialTrainingChallengeRuntimeArgs) => {
  const prepareQuestionRuntimeClientState = useCallback(
    (
      mode: SpecialTrainingModeDefinition | undefined,
      fastDecisionTimer?: ApiSpecialTrainingFastDecisionTimerState | null,
    ) => {
      if (!mode) {
        return;
      }
      resetFastDecisionArenaState();
      setSubmitErrorMessage("");
      finalizingRef.current = false;
      const nextDecisionSecondsLimit =
        modeRuntimeConfigById[mode.id]?.decisionSecondsLimit ??
        DEFAULT_DECISION_SECONDS_LIMIT;
      if (mode.id === "fast-decision-training") {
        applyFastDecisionTimerState(
          fastDecisionTimer,
          nextDecisionSecondsLimit,
        );
        return;
      }
      setDecisionStartedAtMs(null);
      setDecisionDeadlineAtMs(null);
      setDecisionSecondsLeft(nextDecisionSecondsLimit);
    },
    [
      applyFastDecisionTimerState,
      finalizingRef,
      modeRuntimeConfigById,
      resetFastDecisionArenaState,
      setDecisionDeadlineAtMs,
      setDecisionSecondsLeft,
      setDecisionStartedAtMs,
      setSubmitErrorMessage,
    ],
  );

  const applyChallengeRuntime = useCallback(
    (
      serverRuntime: ApiSpecialTrainingChallengeRuntime,
      options: ApplyChallengeRuntimeOptions = {},
    ): ApplyChallengeRuntimeResult => {
      const updateDisplayedRuntime = options.updateDisplayedRuntime !== false;
      const syncCurrentQuestionIndex =
        options.syncCurrentQuestionIndex !== false;
      const runtimeQuestion = serverRuntime.question;
      const currentIndex = currentQuestionIndexRef.current;
      const runtimeQuestionCount = Math.max(
        0,
        Math.floor(
          toFiniteNumber(serverRuntime.questionCount) ||
            questionsRef.current.length ||
            0,
        ),
      );
      const rawRuntimeQuestionIndex = Math.floor(
        toFiniteNumber(serverRuntime.currentQuestionIndex),
      );
      let runtimeQuestionIndex = Number.isFinite(rawRuntimeQuestionIndex)
        ? rawRuntimeQuestionIndex
        : currentIndex;
      if (runtimeQuestionCount > 0) {
        runtimeQuestionIndex = clamp(
          runtimeQuestionIndex,
          0,
          runtimeQuestionCount - 1,
        );
      } else {
        runtimeQuestionIndex = Math.max(0, runtimeQuestionIndex);
      }

      const runtimeQuestionId = String(
        serverRuntime.currentQuestionId || runtimeQuestion?.id || "",
      ).trim();
      const incomingBars = readRuntimeQuestionBars(runtimeQuestion?.bars);
      const hasIncomingBars = incomingBars.length > 0;
      const cachedQuestionRuntime = runtimeQuestionId
        ? (questionRuntimeCacheRef.current.get(runtimeQuestionId) ?? null)
        : null;
      const currentSlotQuestion =
        questionsRef.current[runtimeQuestionIndex] ?? null;
      const displayedBars =
        runtimeQuestionId &&
        runtimeQuestionId === displayedQuestionIdRef.current
          ? questionBarsRef.current
          : [];
      let resolvedBars =
        displayedBars.length > 0 && hasIncomingBars
          ? displayedBars
          : incomingBars;
      if (!hasIncomingBars) {
        if (cachedQuestionRuntime?.bars.length) {
          resolvedBars = cachedQuestionRuntime.bars;
        } else if (displayedBars.length) {
          resolvedBars = displayedBars;
        } else {
          resolvedBars = readRuntimeQuestionBars(currentSlotQuestion?.bars);
        }
      }
      let resolvedQuestion: SpecialTrainingQuestion | null = null;

      if (runtimeQuestion && runtimeQuestionId) {
        resolvedQuestion = {
          ...(cachedQuestionRuntime?.question ?? currentSlotQuestion ?? {}),
          ...runtimeQuestion,
          bars: resolvedBars,
        } as SpecialTrainingQuestion;
        questionRuntimeCacheRef.current.set(runtimeQuestionId, {
          question: resolvedQuestion,
          bars: resolvedBars,
          runtime: serverRuntime,
        });
        setQuestionsState((current) => {
          const next = current.slice();
          next.length = Math.max(
            next.length,
            runtimeQuestionCount,
            runtimeQuestionIndex + 1,
          );
          next[runtimeQuestionIndex] = resolvedQuestion!;
          return next;
        });
      }

      if (updateDisplayedRuntime) {
        setChallengeRuntime(serverRuntime);
        if (
          syncCurrentQuestionIndex &&
          runtimeQuestionIndex !== currentQuestionIndexRef.current
        ) {
          setCurrentQuestionIndexState(runtimeQuestionIndex);
        }
        if (runtimeQuestionId && resolvedBars.length > 0) {
          displayedQuestionIdRef.current = runtimeQuestionId;
          setQuestionBarsState(resolvedBars);
        } else if (!runtimeQuestion) {
          displayedQuestionIdRef.current = "";
          setQuestionBarsState([]);
        }
        setCursorIndex(
          Math.max(
            0,
            Math.floor(
              toFiniteNumber(serverRuntime.cursorIndex) ||
                toFiniteNumber(serverRuntime.questionStartIndex) ||
                0,
            ),
          ),
        );
        setQuestionStartIndex(
          Math.max(
            0,
            Math.floor(toFiniteNumber(serverRuntime.questionStartIndex) || 0),
          ),
        );
        setQuestionEndIndex(
          Math.max(
            0,
            Math.floor(
              toFiniteNumber(serverRuntime.questionEndIndex) ||
                toFiniteNumber(serverRuntime.questionStartIndex) ||
                0,
            ),
          ),
        );
        setTradeActions(serverRuntime.tradeActions ?? []);
        setRiskBaseline(serverRuntime.riskBaseline ?? null);
        if (serverRuntime.tradeRuntime) {
          setRuntime((current) => ({
            ...current,
            usedOperations: serverRuntime.tradeRuntime?.usedOperations ?? 0,
            openCount: serverRuntime.tradeRuntime?.openCount ?? 0,
            positionQty: serverRuntime.tradeRuntime?.positionQty ?? 0,
            entryPrice: serverRuntime.tradeRuntime?.entryPrice ?? Number.NaN,
            cashBalance:
              serverRuntime.tradeRuntime?.cashBalance ?? DEFAULT_CAPITAL,
            equityPeakAsset:
              serverRuntime.tradeRuntime?.equityPeakAsset ?? DEFAULT_CAPITAL,
            maxDrawdownRatio: serverRuntime.tradeRuntime?.maxDrawdownRatio ?? 0,
            initialCapital:
              serverRuntime.tradeRuntime?.initialCapital ?? DEFAULT_CAPITAL,
            challengeStartAsset:
              serverRuntime.tradeRuntime?.challengeStartAsset ??
              DEFAULT_CAPITAL,
            paused: serverRuntime.activityPaused,
          }));
        } else {
          setRuntime((current) => ({
            ...createSpecialTrainingRuntimeDraft(activeMode?.id),
            sizeInput: current.sizeInput,
            stopLossInput: current.stopLossInput,
            paused: serverRuntime.activityPaused,
          }));
        }
        if (activeMode?.id === "fast-decision-training") {
          applyFastDecisionTimerState(
            serverRuntime.fastDecisionTimer,
            modeRuntimeConfigById[activeMode.id]?.decisionSecondsLimit ??
              DEFAULT_DECISION_SECONDS_LIMIT,
          );
        }
      }

      const hasResolvedBars = resolvedBars.length > 0;
      return {
        questionId: runtimeQuestionId,
        questionIndex: runtimeQuestionIndex,
        hasIncomingBars,
        hasResolvedBars,
        needsRuntimeHydration:
          runtimeQuestionId.length > 0 && !hasIncomingBars && !hasResolvedBars,
      };
    },
    [
      activeMode?.id,
      applyFastDecisionTimerState,
      currentQuestionIndexRef,
      displayedQuestionIdRef,
      questionBarsRef,
      questionRuntimeCacheRef,
      questionsRef,
      modeRuntimeConfigById,
      setChallengeRuntime,
      setCurrentQuestionIndexState,
      setCursorIndex,
      setQuestionBarsState,
      setQuestionEndIndex,
      setQuestionStartIndex,
      setQuestionsState,
      setRiskBaseline,
      setRuntime,
      setTradeActions,
    ],
  );

  const applyCommandChallengeRuntime = useCallback(
    async (
      serverRuntime: ApiSpecialTrainingChallengeRuntime,
      options: ApplyChallengeRuntimeOptions = {},
    ): Promise<ApplyChallengeRuntimeResult> => {
      const result = applyChallengeRuntime(serverRuntime, options);
      if (!result.needsRuntimeHydration) {
        return result;
      }
      try {
        const hydratedRuntime = await getSpecialTrainingChallengeRuntime(
          serverRuntime.challengeId,
        );
        return applyChallengeRuntime(hydratedRuntime, options);
      } catch (error) {
        void error;
        return result;
      }
    },
    [applyChallengeRuntime],
  );

  const bootstrapQuestion = useCallback(
    async (
      question: SpecialTrainingQuestion | null,
      mode: SpecialTrainingModeDefinition | undefined,
    ) => {
      if (!mode || !challengeId) {
        resetTrainingRuntime();
        return;
      }

      const normalizedQuestionId = String(question?.id || "").trim();
      if (
        normalizedQuestionId &&
        displayedQuestionIdRef.current === normalizedQuestionId &&
        questionBarsRef.current.length > 0
      ) {
        return;
      }

      const cachedRuntime = normalizedQuestionId
        ? (questionRuntimeCacheRef.current.get(normalizedQuestionId) ?? null)
        : null;
      if (cachedRuntime?.runtime && cachedRuntime.bars.length > 0) {
        setIsQuestionLoading(true);
        try {
          applyChallengeRuntime(cachedRuntime.runtime);
          prepareQuestionRuntimeClientState(
            mode,
            cachedRuntime.runtime.fastDecisionTimer,
          );
        } finally {
          setIsQuestionLoading(false);
        }
        return;
      }

      setIsQuestionLoading(true);
      try {
        const serverRuntime =
          await getSpecialTrainingChallengeRuntime(challengeId);
        const runtimeResult = applyChallengeRuntime(serverRuntime);
        if (runtimeResult.questionId && !runtimeResult.hasResolvedBars) {
          throw new Error(content.dataLoadFailedLabel);
        }
        prepareQuestionRuntimeClientState(mode, serverRuntime.fastDecisionTimer);
      } catch (error) {
        void error;
        setSubmitErrorMessage(content.dataLoadFailedLabel);
        displayedQuestionIdRef.current = "";
        setQuestionBarsState([]);
        setCursorIndex(0);
        setQuestionStartIndex(0);
        setQuestionEndIndex(0);
        setRuntime(createSpecialTrainingRuntimeDraft(mode.id));
        setRiskBaseline(null);
        resetFastDecisionArenaState();
        setDecisionStartedAtMs(null);
        setDecisionDeadlineAtMs(null);
        setDecisionSecondsLeft(
          modeRuntimeConfigById[mode.id]?.decisionSecondsLimit ??
            DEFAULT_DECISION_SECONDS_LIMIT,
        );
      } finally {
        setIsQuestionLoading(false);
      }
    },
    [
      applyChallengeRuntime,
      challengeId,
      content.dataLoadFailedLabel,
      displayedQuestionIdRef,
      modeRuntimeConfigById,
      prepareQuestionRuntimeClientState,
      questionBarsRef,
      questionRuntimeCacheRef,
      resetFastDecisionArenaState,
      resetTrainingRuntime,
      setCursorIndex,
      setDecisionDeadlineAtMs,
      setDecisionSecondsLeft,
      setDecisionStartedAtMs,
      setIsQuestionLoading,
      setQuestionBarsState,
      setQuestionEndIndex,
      setQuestionStartIndex,
      setRiskBaseline,
      setRuntime,
      setSubmitErrorMessage,
    ],
  );

  useEffect(() => {
    if (view !== "TRAINING") {
      setChallengeRuntime(null);
      return;
    }
    const normalizedQuestionId = String(activeQuestion?.id || "").trim();
    if (
      normalizedQuestionId &&
      displayedQuestionIdRef.current === normalizedQuestionId &&
      questionBarsRef.current.length > 0
    ) {
      return;
    }
    void bootstrapQuestion(activeQuestion, activeMode);
  }, [
    activeMode,
    activeQuestion,
    bootstrapQuestion,
    displayedQuestionIdRef,
    questionBarsRef,
    setChallengeRuntime,
    view,
  ]);

  const beginTraining = useCallback(async () => {
    if (
      !activeMode ||
      isQuestionLoading ||
      !activeModeQuestionBankStartEnabled
    ) {
      return;
    }

    setIsQuestionLoading(true);
    setSubmitErrorMessage("");
    questionRuntimeCacheRef.current.clear();
    displayedQuestionIdRef.current = "";
    try {
      const challenge = await startSpecialTrainingChallenge({
        bankId: selectedBankId,
        modeId: activeMode.id,
        questionCount: activeQuestionCount,
        horizonBars: activeHorizonBars,
        decisionSecondsLimit: isFastDecisionMode
          ? activeDecisionSecondsLimit
          : undefined,
        fastDecisionStrictnessLevel: isFastDecisionMode
          ? activeFastDecisionStrictnessLevel
          : undefined,
      });
      if (!challenge.runtime?.question || challenge.questionCount <= 0) {
        throw new Error(content.dataLoadFailedLabel);
      }
      applyStartedChallenge(challenge);
      const runtimeResult = applyChallengeRuntime(challenge.runtime);
      if (!runtimeResult.hasResolvedBars) {
        throw new Error(content.dataLoadFailedLabel);
      }
      prepareQuestionRuntimeClientState(
        activeMode,
        challenge.runtime.fastDecisionTimer,
      );
    } catch (error) {
      setChallengeId("");
      setQuestionsState([]);
      setCurrentQuestionIndexState(0);
      questionRuntimeCacheRef.current.clear();
      displayedQuestionIdRef.current = "";
      setSettlement(null);
      setSubmitErrorMessage(resolveBankApiErrorMessage(error));
    } finally {
      setIsQuestionLoading(false);
    }
  }, [
    activeDecisionSecondsLimit,
    activeFastDecisionStrictnessLevel,
    activeHorizonBars,
    activeMode,
    activeModeQuestionBankStartEnabled,
    activeQuestionCount,
    applyChallengeRuntime,
    applyStartedChallenge,
    content.dataLoadFailedLabel,
    displayedQuestionIdRef,
    isFastDecisionMode,
    isQuestionLoading,
    prepareQuestionRuntimeClientState,
    questionRuntimeCacheRef,
    resolveBankApiErrorMessage,
    selectedBankId,
    setChallengeId,
    setCurrentQuestionIndexState,
    setIsQuestionLoading,
    setQuestionsState,
    setSettlement,
    setSubmitErrorMessage,
  ]);

  useEffect(() => {
    if (
      !activeMode ||
      String(challengeId || "").trim().length > 0 ||
      view !== "MODE_PICKER"
    ) {
      return;
    }
    finalizingRef.current = false;
    setRiskAutoplayEnabled(false);
    setCurrentChallengeScopeHash("");
  }, [
    activeMode,
    challengeId,
    finalizingRef,
    setCurrentChallengeScopeHash,
    setRiskAutoplayEnabled,
    view,
  ]);

  return {
    applyCommandChallengeRuntime,
    beginTraining,
  };
};

export type SpecialTrainingChallengeRuntimeState = ReturnType<
  typeof useSpecialTrainingChallengeRuntime
>;
