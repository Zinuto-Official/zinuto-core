// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ApiSpecialTrainingScopeRestartSignal } from "@/api";
import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";
import type { Bar } from "@/domains/training/types";
import type {
  RiskRuntimeBaseline,
  RuntimeState,
  SettlementResult,
  SpecialTrainingQuestion,
  SpecialTrainingView,
  TradeActionLogEntry,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

export type StartedChallengePayload = {
  challengeId: string;
  scopeHash: string;
  questionCount: number;
  progress?: {
    currentQuestionIndex: number | null;
  } | null;
  scopeRestart: ApiSpecialTrainingScopeRestartSignal | null;
};

type UseSpecialTrainingSessionControllerParams = {
  activeDecisionSecondsLimit: number;
  currentQuestionIndex: number;
  questionCount: number;
  createRuntimeDraft: (modeId?: SpecialTrainingModeId) => RuntimeState;
  resetFastDecisionArenaState: () => void;
  finalizingRef: MutableRefObject<boolean>;
  setRuntime: Dispatch<SetStateAction<RuntimeState>>;
  setRiskBaseline: Dispatch<SetStateAction<RiskRuntimeBaseline | null>>;
  setQuestionBars: Dispatch<SetStateAction<Bar[]>>;
  setCursorIndex: Dispatch<SetStateAction<number>>;
  setQuestionStartIndex: Dispatch<SetStateAction<number>>;
  setQuestionEndIndex: Dispatch<SetStateAction<number>>;
  setTradeActions: Dispatch<SetStateAction<TradeActionLogEntry[]>>;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  setRiskAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  setDecisionStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setDecisionDeadlineAtMs: Dispatch<SetStateAction<number | null>>;
  setDecisionSecondsLeft: Dispatch<SetStateAction<number>>;
  setChallengeId: Dispatch<SetStateAction<string>>;
  setCurrentChallengeScopeHash: Dispatch<SetStateAction<string>>;
  setQuestions: Dispatch<SetStateAction<SpecialTrainingQuestion[]>>;
  setCurrentQuestionIndex: Dispatch<SetStateAction<number>>;
  setSessionSettlements: Dispatch<SetStateAction<SettlementResult[]>>;
  setCompletedCount: Dispatch<SetStateAction<number>>;
  setPassCount: Dispatch<SetStateAction<number>>;
  setTotalDecisionSeconds: Dispatch<SetStateAction<number>>;
  setDecisionCount: Dispatch<SetStateAction<number>>;
  setSettlement: Dispatch<SetStateAction<SettlementResult | null>>;
  setScopeRestartNotice: Dispatch<
    SetStateAction<ApiSpecialTrainingScopeRestartSignal | null>
  >;
  setSelectedSessionReviewIndex: Dispatch<SetStateAction<number | null>>;
  setView: Dispatch<SetStateAction<SpecialTrainingView>>;
};

type UseSpecialTrainingSessionControllerResult = {
  resetTrainingRuntime: () => void;
  applyStartedChallenge: (challenge: StartedChallengePayload) => void;
  exitTraining: () => void;
  gotoNextQuestion: () => void;
};

const createQuestionSlots = (questionCount: number): SpecialTrainingQuestion[] =>
  new Array<SpecialTrainingQuestion>(
    Math.max(0, Math.floor(Number(questionCount) || 0)),
  );

export const useSpecialTrainingSessionController = ({
  activeDecisionSecondsLimit,
  currentQuestionIndex,
  questionCount,
  createRuntimeDraft,
  resetFastDecisionArenaState,
  finalizingRef,
  setRuntime,
  setRiskBaseline,
  setQuestionBars,
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
  setQuestions,
  setCurrentQuestionIndex,
  setSessionSettlements,
  setCompletedCount,
  setPassCount,
  setTotalDecisionSeconds,
  setDecisionCount,
  setSettlement,
  setScopeRestartNotice,
  setSelectedSessionReviewIndex,
  setView,
}: UseSpecialTrainingSessionControllerParams): UseSpecialTrainingSessionControllerResult => {
  const resetTrainingRuntime = useCallback(() => {
    setRuntime(createRuntimeDraft());
    setRiskBaseline(null);
    setQuestionBars([]);
    setCursorIndex(0);
    setQuestionStartIndex(0);
    setQuestionEndIndex(0);
    resetFastDecisionArenaState();
    setTradeActions([]);
    setSubmitErrorMessage("");
    setRiskAutoplayEnabled(false);
    setDecisionStartedAtMs(null);
    setDecisionDeadlineAtMs(null);
    setDecisionSecondsLeft(activeDecisionSecondsLimit);
    finalizingRef.current = false;
  }, [
    activeDecisionSecondsLimit,
    createRuntimeDraft,
    finalizingRef,
    resetFastDecisionArenaState,
    setCursorIndex,
    setDecisionDeadlineAtMs,
    setDecisionSecondsLeft,
    setDecisionStartedAtMs,
    setQuestionBars,
    setQuestionEndIndex,
    setQuestionStartIndex,
    setRiskAutoplayEnabled,
    setRiskBaseline,
    setRuntime,
    setSubmitErrorMessage,
    setTradeActions,
  ]);

  const applyStartedChallenge = useCallback(
    (challenge: StartedChallengePayload) => {
      setChallengeId(challenge.challengeId);
      setCurrentChallengeScopeHash(String(challenge.scopeHash || "").trim());
      setQuestions(createQuestionSlots(challenge.questionCount));
      setCurrentQuestionIndex(
        Math.max(
          0,
          Math.floor(Number(challenge.progress?.currentQuestionIndex) || 0),
        ),
      );
      setSessionSettlements([]);
      setCompletedCount(0);
      setPassCount(0);
      setTotalDecisionSeconds(0);
      setDecisionCount(0);
      setSettlement(null);
      setScopeRestartNotice(challenge.scopeRestart ?? null);
      resetTrainingRuntime();
      setView("TRAINING");
    },
    [
      resetTrainingRuntime,
      setChallengeId,
      setCompletedCount,
      setCurrentChallengeScopeHash,
      setCurrentQuestionIndex,
      setDecisionCount,
      setPassCount,
      setQuestions,
      setScopeRestartNotice,
      setSessionSettlements,
      setSettlement,
      setTotalDecisionSeconds,
      setView,
    ],
  );

  const exitTraining = useCallback(() => {
    setSettlement(null);
    setChallengeId("");
    setCurrentChallengeScopeHash("");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSessionSettlements([]);
    setCompletedCount(0);
    setPassCount(0);
    setTotalDecisionSeconds(0);
    setDecisionCount(0);
    setScopeRestartNotice(null);
    setSelectedSessionReviewIndex(null);
    resetTrainingRuntime();
    setView("MODE_PICKER");
  }, [
    resetTrainingRuntime,
    setChallengeId,
    setCompletedCount,
    setCurrentChallengeScopeHash,
    setCurrentQuestionIndex,
    setDecisionCount,
    setPassCount,
    setQuestions,
    setScopeRestartNotice,
    setSelectedSessionReviewIndex,
    setSessionSettlements,
    setSettlement,
    setTotalDecisionSeconds,
    setView,
  ]);

  const gotoNextQuestion = useCallback(() => {
    if (currentQuestionIndex >= questionCount - 1) {
      setView("SETTLEMENT");
      return;
    }
    setCurrentQuestionIndex((index) => index + 1);
    setSettlement(null);
    resetTrainingRuntime();
    setView("TRAINING");
  }, [
    currentQuestionIndex,
    questionCount,
    resetTrainingRuntime,
    setCurrentQuestionIndex,
    setSettlement,
    setView,
  ]);

  return {
    resetTrainingRuntime,
    applyStartedChallenge,
    exitTraining,
    gotoNextQuestion,
  };
};
