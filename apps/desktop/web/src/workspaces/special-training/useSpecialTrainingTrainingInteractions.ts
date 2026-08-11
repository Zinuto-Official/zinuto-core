// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import { useSpecialTrainingSettlementKeyboardShortcuts } from "@/workspaces/special-training/session/useSpecialTrainingRouteEffects";
import type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";
import type { SpecialTrainingPageState } from "@/workspaces/special-training/useSpecialTrainingPageState";
import { useSpecialTrainingFastDecisionInteractions } from "@/workspaces/special-training/useSpecialTrainingFastDecisionInteractions";
import { useSpecialTrainingRiskTradeInteractions } from "@/workspaces/special-training/useSpecialTrainingRiskTradeInteractions";

type UseSpecialTrainingTrainingInteractionsArgs = Pick<
  SpecialTrainingPageProps,
  "isPageActive" | "ui"
> & {
  state: SpecialTrainingPageState;
};

export const useSpecialTrainingTrainingInteractions = ({
  isPageActive = true,
  state,
  ui,
}: UseSpecialTrainingTrainingInteractionsArgs) => {
  const {
    activeMode,
    beginTraining,
    decisionSecondsLeft,
    exitTraining,
    fastDecisionPhase,
    fastDecisionResult,
    gotoNextQuestion,
    isFastDecisionMode,
    isQuestionLoading,
    runtime,
    settlement,
    setSelectedSessionReviewIndex,
    setView,
    view,
  } = state;

  const riskInteractions = useSpecialTrainingRiskTradeInteractions({
    state,
    ui,
  });
  const { finalizeQuestion, submitFastDecision } =
    useSpecialTrainingFastDecisionInteractions({
      isPageActive,
      isRiskCommandQueueActive: riskInteractions.isRiskCommandQueueActive,
      state,
    });

  const createTrainingRecordReplayNoteShortcut = useCallback(() => {
    // Special training currently has no in-session replay note editor shortcut target.
  }, []);
  const restartCurrentMode = useCallback(() => {
    if (view === "SETTLEMENT") {
      setView("MODE_PICKER");
    }
    setSelectedSessionReviewIndex(null);
    void beginTraining();
  }, [beginTraining, setSelectedSessionReviewIndex, setView, view]);

  useSpecialTrainingSettlementKeyboardShortcuts({
    isPageActive,
    view,
    isFastDecisionMode,
    settlement,
    selectedSessionReviewIndex: state.selectedSessionReviewIndex,
    exitTraining,
    gotoNextQuestion,
    restartCurrentMode,
  });

  const questionSettledInTraining = view === "TRAINING" && settlement !== null;
  const directionSelectDisabled =
    !activeMode ||
    !isFastDecisionMode ||
    isQuestionLoading ||
    questionSettledInTraining ||
    runtime.paused ||
    fastDecisionPhase !== "THINKING" ||
    Boolean(fastDecisionResult) ||
    decisionSecondsLeft <= 0;
  const completeDisabled =
    isQuestionLoading ||
    questionSettledInTraining ||
    !state.activeQuestion ||
    (isFastDecisionMode && !fastDecisionResult);

  return {
    completeDisabled,
    createTrainingRecordReplayNoteShortcut,
    directionSelectDisabled,
    finalizeQuestion,
    restartCurrentMode,
    submitFastDecision,
    ...riskInteractions,
  };
};

export type SpecialTrainingTrainingInteractions = ReturnType<
  typeof useSpecialTrainingTrainingInteractions
>;
