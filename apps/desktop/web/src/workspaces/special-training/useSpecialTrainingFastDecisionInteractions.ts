// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from "react";
import type {
  ApiSpecialTrainingSettlement,
  ApiSpecialTrainingTradeAction,
} from "@/api";
import {
  settleSpecialTrainingQuestion,
  submitSpecialTrainingChallengeDecision,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import {
  FAST_DECISION_JUDGED_HOLD_MS,
  FAST_DECISION_REVEAL_DURATION_MS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import {
  clamp,
  toFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import { canSubmitFastDecision } from "@/workspaces/special-training/domain/fastDecisionSubmitGate";
import {
  resolveFastDecisionRevealDurationMs,
  resolveFastDecisionRevealFrame,
} from "@/workspaces/special-training/fastDecisionRevealTimeline";
import type {
  FastDecisionChoice,
  FastDecisionResult,
  RuntimeState,
  SettlementResult,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  readServerSessionFactsFromCommandResult,
  useSpecialTrainingResultDisplayMaterializer,
} from "@/workspaces/special-training/view-models/useSpecialTrainingResultDisplayMaterializer";
import type { SpecialTrainingPageProps } from "@/workspaces/special-training/specialTrainingPageTypes";
import type { SpecialTrainingPageState } from "@/workspaces/special-training/useSpecialTrainingPageState";

type UseSpecialTrainingFastDecisionInteractionsArgs = Pick<
  SpecialTrainingPageProps,
  "isPageActive"
> & {
  isRiskCommandQueueActive: () => boolean;
  state: SpecialTrainingPageState;
};

export const useSpecialTrainingFastDecisionInteractions = ({
  isPageActive = true,
  isRiskCommandQueueActive,
  state,
}: UseSpecialTrainingFastDecisionInteractionsArgs) => {
  const {
    activeDecisionSecondsLimit,
    activeMode,
    activeQuestion,
    applyBackendCompletion,
    applyCommandChallengeRuntime,
    challengeId,
    content,
    cursorIndex,
    decisionDeadlineAtMs,
    fastDecisionJudgeTimerRef,
    fastDecisionPhase,
    fastDecisionResult,
    fastDecisionRevealTimerRef,
    finalizingRef,
    isFastDecisionMode,
    isQuestionLoading,
    pendingFastDecisionResultRef,
    pendingServerSettlementRef,
    questionBars,
    questionStartIndex,
    runtime,
    settlement,
    setCursorIndex,
    setDecisionDeadlineAtMs,
    setDecisionSecondsLeft,
    setFastDecisionPhase,
    setFastDecisionResult,
    setIsQuestionLoading,
    setLockedDecisionSelection,
    setQuestionEndIndex,
    setSubmitErrorMessage,
    tradeActions,
    updateRuntime,
    view,
  } = state;

  const materializeServerSettlement = useSpecialTrainingResultDisplayMaterializer({
    content,
  });
  // Independent in-flight guard for the decision POST. It is separate from
  // pendingFastDecisionResultRef, which only carries a resolved result for the
  // reveal effect. The flag is set before the request is sent and always reset
  // in finally so a rejected POST can be retried on the next polling tick.
  const fastDecisionSubmitInFlightRef = useRef(false);
  const consumeOperation = (prev: RuntimeState): RuntimeState => ({
    ...prev,
    usedOperations: prev.usedOperations + 1,
  });
  const cancelFastDecisionRevealFrame = useCallback(() => {
    if (fastDecisionRevealTimerRef.current !== null) {
      window.cancelAnimationFrame(fastDecisionRevealTimerRef.current);
      fastDecisionRevealTimerRef.current = null;
    }
  }, [fastDecisionRevealTimerRef]);
  const completeFastDecisionReveal = useCallback(
    (result: FastDecisionResult) => {
      cancelFastDecisionRevealFrame();
      pendingFastDecisionResultRef.current = null;
      setCursorIndex((current) =>
        current === result.revealEndIndex ? current : result.revealEndIndex,
      );
      setQuestionEndIndex((current) =>
        current === result.revealEndIndex ? current : result.revealEndIndex,
      );
      setFastDecisionResult(result);
      setFastDecisionPhase("JUDGED");
      updateRuntime((prev) => consumeOperation(prev));
    },
    [
      cancelFastDecisionRevealFrame,
      pendingFastDecisionResultRef,
      setCursorIndex,
      setFastDecisionPhase,
      setFastDecisionResult,
      setQuestionEndIndex,
      updateRuntime,
    ],
  );
  const startFastDecisionReveal = useCallback(
    (result: FastDecisionResult) => {
      const safeRevealStartIndex = clamp(
        Math.floor(toFiniteNumber(cursorIndex) || questionStartIndex),
        questionStartIndex,
        result.revealEndIndex,
      );
      const revealBarsTotal = Math.max(
        0,
        result.revealEndIndex - safeRevealStartIndex,
      );
      if (revealBarsTotal <= 0) {
        completeFastDecisionReveal(result);
        return;
      }
      cancelFastDecisionRevealFrame();
      setFastDecisionPhase("REVEALING");
      const revealDurationMs = resolveFastDecisionRevealDurationMs({
        baseDurationMs: FAST_DECISION_REVEAL_DURATION_MS,
        fullRevealBarsTotal: Math.max(1, result.revealEndIndex - questionStartIndex),
        revealBarsTotal,
      });
      const readFrameTimeMs = () =>
        typeof performance !== "undefined" &&
        typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const revealStartMs = readFrameTimeMs();
      let lastRenderedCursorIndex = safeRevealStartIndex;
      const renderRevealFrame = (frameTimeMs: number) => {
        const revealFrame = resolveFastDecisionRevealFrame({
          elapsedMs: frameTimeMs - revealStartMs,
          revealDurationMs,
          revealBarsTotal,
          revealStartIndex: safeRevealStartIndex,
          revealEndIndex: result.revealEndIndex,
        });
        if (revealFrame.cursorIndex !== lastRenderedCursorIndex) {
          lastRenderedCursorIndex = revealFrame.cursorIndex;
          setCursorIndex(revealFrame.cursorIndex);
        }
        if (revealFrame.complete) {
          fastDecisionRevealTimerRef.current = null;
          completeFastDecisionReveal(result);
          return;
        }
        fastDecisionRevealTimerRef.current =
          window.requestAnimationFrame(renderRevealFrame);
      };
      fastDecisionRevealTimerRef.current =
        window.requestAnimationFrame(renderRevealFrame);
    },
    [
      cancelFastDecisionRevealFrame,
      completeFastDecisionReveal,
      cursorIndex,
      fastDecisionRevealTimerRef,
      questionStartIndex,
      setCursorIndex,
      setFastDecisionPhase,
    ],
  );
  const submitFastDecision = useCallback(
    async (selection: FastDecisionChoice, timedOut = false) => {
      if (!activeMode || activeMode.id !== "fast-decision-training") {
        return;
      }
      if (
        !canSubmitFastDecision({
          hasQuestionBars: questionBars.length > 0,
          hasResult: Boolean(fastDecisionResult),
          phase: fastDecisionPhase,
          hasPendingResult: Boolean(pendingFastDecisionResultRef.current),
          submitInFlight: fastDecisionSubmitInFlightRef.current,
        })
      ) {
        return;
      }

      try {
        fastDecisionSubmitInFlightRef.current = true;
        const commandResult = await submitSpecialTrainingChallengeDecision(
          challengeId,
          {
            selection,
            timedOut,
          },
        );
        void applyCommandChallengeRuntime(commandResult.runtime, {
          syncCurrentQuestionIndex: false,
          updateDisplayedRuntime: false,
        });
        if (!commandResult.settlement || !activeQuestion) {
          return;
        }
        const nextSettlement = materializeServerSettlement(
          activeQuestion,
          activeMode.id,
          questionStartIndex,
          commandResult.settlement,
          undefined,
          readServerSessionFactsFromCommandResult(commandResult),
        );
        pendingServerSettlementRef.current = nextSettlement;
        const result = nextSettlement.directionResult;
        if (!result) {
          return;
        }
        pendingFastDecisionResultRef.current = result;
        setLockedDecisionSelection(selection);
        setFastDecisionPhase("LOCKED");
        setDecisionDeadlineAtMs(null);
        setDecisionSecondsLeft(
          Math.max(
            0,
            activeDecisionSecondsLimit - result.decisionSecondsUsed,
          ),
        );
        if (isPageActive) {
          startFastDecisionReveal(result);
        } else {
          setFastDecisionPhase("REVEALING");
        }
      } catch (error) {
        void error;
        setSubmitErrorMessage(content.dataLoadFailedLabel);
      } finally {
        fastDecisionSubmitInFlightRef.current = false;
      }
    },
    [
      activeDecisionSecondsLimit,
      activeMode,
      activeQuestion,
      applyCommandChallengeRuntime,
      challengeId,
      content.dataLoadFailedLabel,
      fastDecisionPhase,
      fastDecisionResult,
      fastDecisionSubmitInFlightRef,
      isPageActive,
      materializeServerSettlement,
      pendingFastDecisionResultRef,
      pendingServerSettlementRef,
      questionBars.length,
      questionStartIndex,
      setDecisionDeadlineAtMs,
      setDecisionSecondsLeft,
      setFastDecisionPhase,
      setLockedDecisionSelection,
      setSubmitErrorMessage,
      startFastDecisionReveal,
    ],
  );
  const finalizeQuestion = useCallback(
    async (abandoned: boolean) => {
      if (
        view !== "TRAINING" ||
        finalizingRef.current ||
        isRiskCommandQueueActive() ||
        settlement ||
        !activeMode ||
        !activeQuestion ||
        !challengeId
      ) {
        return;
      }
      if (
        activeMode.id === "fast-decision-training" &&
        !abandoned &&
        !fastDecisionResult
      ) {
        return;
      }

      finalizingRef.current = true;
      setIsQuestionLoading(true);
      setSubmitErrorMessage("");
      try {
        let result: SettlementResult;
        if (
          activeMode.id === "fast-decision-training" &&
          !abandoned &&
          pendingServerSettlementRef.current
        ) {
          result = pendingServerSettlementRef.current;
          pendingServerSettlementRef.current = null;
        } else {
          const payload: {
            abandoned?: boolean;
            cursorIndex?: number;
            fastDecision?: {
              selection: FastDecisionChoice;
              decisionSecondsUsed: number;
              timedOut?: boolean;
            };
            tradeActions?: ApiSpecialTrainingTradeAction[];
          } = {
            abandoned,
            cursorIndex,
          };
          if (activeMode.id === "fast-decision-training") {
            if (fastDecisionResult) {
              payload.fastDecision = {
                selection: fastDecisionResult.selection,
                decisionSecondsUsed: fastDecisionResult.decisionSecondsUsed,
                timedOut: fastDecisionResult.timedOut,
              };
            }
          } else {
            payload.tradeActions = tradeActions;
          }
          const serverSettlement: ApiSpecialTrainingSettlement =
            await settleSpecialTrainingQuestion(
              challengeId,
              activeQuestion.id,
              payload,
            );
          result = materializeServerSettlement(
            activeQuestion,
            activeMode.id,
            cursorIndex,
            serverSettlement,
            activeMode.id === "risk-discipline-training"
              ? tradeActions
              : undefined,
          );
        }
        applyBackendCompletion(result);
      } catch (error) {
        finalizingRef.current = false;
        void error;
        setSubmitErrorMessage(content.dataLoadFailedLabel);
      } finally {
        setIsQuestionLoading(false);
      }
    },
    [
      activeMode,
      activeQuestion,
      applyBackendCompletion,
      challengeId,
      content.dataLoadFailedLabel,
      cursorIndex,
      fastDecisionResult,
      finalizingRef,
      isRiskCommandQueueActive,
      materializeServerSettlement,
      pendingServerSettlementRef,
      settlement,
      setIsQuestionLoading,
      setSubmitErrorMessage,
      tradeActions,
      view,
    ],
  );

  useEffect(() => {
    if (
      !isPageActive ||
      view !== "TRAINING" ||
      !isFastDecisionMode ||
      fastDecisionPhase !== "REVEALING"
    ) {
      return;
    }
    const pendingResult = pendingFastDecisionResultRef.current;
    if (!pendingResult || fastDecisionRevealTimerRef.current !== null) {
      return;
    }
    startFastDecisionReveal(pendingResult);
  }, [
    fastDecisionPhase,
    fastDecisionRevealTimerRef,
    isFastDecisionMode,
    isPageActive,
    pendingFastDecisionResultRef,
    startFastDecisionReveal,
    view,
  ]);
  useEffect(() => {
    if (
      view !== "TRAINING" ||
      !isFastDecisionMode ||
      !isPageActive ||
      !decisionDeadlineAtMs ||
      fastDecisionPhase !== "THINKING" ||
      isQuestionLoading ||
      runtime.paused
    ) {
      return;
    }
    const updateCountdown = () => {
      const remainingMs = Math.max(0, decisionDeadlineAtMs - Date.now());
      const seconds = Math.floor(remainingMs / 1000);
      setDecisionSecondsLeft(seconds);
      if (remainingMs <= 0 && !fastDecisionSubmitInFlightRef.current) {
        submitFastDecision("OBSERVE", true);
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(timer);
  }, [
    decisionDeadlineAtMs,
    fastDecisionPhase,
    fastDecisionSubmitInFlightRef,
    isFastDecisionMode,
    isPageActive,
    isQuestionLoading,
    runtime.paused,
    setDecisionSecondsLeft,
    submitFastDecision,
    view,
  ]);
  useEffect(() => {
    if (
      !isPageActive ||
      view !== "TRAINING" ||
      !isFastDecisionMode ||
      fastDecisionPhase !== "JUDGED" ||
      !fastDecisionResult ||
      settlement !== null ||
      isQuestionLoading ||
      Boolean(state.submitErrorMessage)
    ) {
      return;
    }
    if (fastDecisionJudgeTimerRef.current !== null) {
      window.clearTimeout(fastDecisionJudgeTimerRef.current);
    }
    fastDecisionJudgeTimerRef.current = window.setTimeout(() => {
      void finalizeQuestion(false);
    }, FAST_DECISION_JUDGED_HOLD_MS);
    return () => {
      if (fastDecisionJudgeTimerRef.current !== null) {
        window.clearTimeout(fastDecisionJudgeTimerRef.current);
        fastDecisionJudgeTimerRef.current = null;
      }
    };
  }, [
    fastDecisionJudgeTimerRef,
    fastDecisionPhase,
    fastDecisionResult,
    finalizeQuestion,
    isFastDecisionMode,
    isPageActive,
    isQuestionLoading,
    settlement,
    state.submitErrorMessage,
    view,
  ]);

  return {
    finalizeQuestion,
    submitFastDecision,
  };
};

export type SpecialTrainingFastDecisionInteractions = ReturnType<
  typeof useSpecialTrainingFastDecisionInteractions
>;
